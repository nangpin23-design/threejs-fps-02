// SABLE LINE — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. ?shot=cover|fight|buy|end with &seed=N sets
// up a deterministic frame for a capture, renders it twice, then freezes it
// and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { WEAPONS, GRENADE, createLoadout, createWeaponState } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const nav = createNav(world.waypoints, world.edges);
const audio = createAudio();
const hud = createHud();
const combat = createCombat(scene, world, audio);
const input = createInput(renderer.domElement, onLockChange);
const player = createPlayer(world);
const loadout = createLoadout();
const weaponState = createWeaponState();

const raycaster = new THREE.Raycaster();
raycaster.far = 140;
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

// --- weapon viewmodel -------------------------------------------------------
const viewmodel = new THREE.Group();
const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62),
  new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 0.45, metalness: 0.55 }));
const vmBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34),
  new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.4, metalness: 0.6 }));
vmBarrel.position.set(0, 0.03, -0.42);
const vmSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1),
  new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 0.6 }));
vmSight.position.set(0, 0.1, -0.18);
viewmodel.add(vmBody, vmBarrel, vmSight);
viewmodel.position.set(0.26, -0.24, -0.5);
camera.add(viewmodel);
let vmKick = 0;
let vmBob = 0;

const playerState = {
  hp: 100,
  alive: true,
  money: 800,
  kills: 0,
  deaths: 0,
  planting: false,
};

// Player hitboxes, so bots can shoot the player back. They write no colour
// and no depth, so the camera never sees them, but the raycaster still hits
// them. The player's own shots use a list without these meshes.
const playerHitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const playerHitHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), playerHitMat);
playerHitHead.userData = { bot: 'player', part: 'head' };
const playerHitBody = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.9, 0.36), playerHitMat);
playerHitBody.userData = { bot: 'player', part: 'body' };
scene.add(playerHitHead, playerHitBody);
const playerHitMeshes = [playerHitHead, playerHitBody];
let buyOpen = false;
let prevFiring = false;
let rightHeld = false;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let matchResetAt = 0;

const body = player.state;
const bots = createBots(scene, world, nav, combat, audio);

// --- events ------------------------------------------------------------------
const events = {
  onPhase(phase) {
    if (phase === 'buy') {
      hud.setObjective('Buy phase — press B to open the shop');
      hud.banner('BUY PHASE', 'Spend your money — round starts soon', 2200);
      openBuy();
      loadout.refillAmmo();
      syncAmmoHud();
    } else {
      hud.setObjective('Plant the charge at A or B');
      closeBuy();
    }
  },
  onRoundEnd(winner, reason, score) {
    const won = winner === 'vanguard';
    hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reason, 4200);
    hud.setScore(score.vanguard, score.sentinel, rounds.state.round);
    audio.round(won);
    if (rounds.state.matchOver) {
      matchResetAt = elapsed + 1;
    }
  },
  onNextRound(round) {
    const died = !playerState.alive;
    playerState.alive = true;
    playerState.hp = 100;
    player.spawn(world.spawns.vanguard[0], 0);
    if (died) loadout.onDeath(); // survivors keep their weapons
    playerState.money = rounds.state.money;
    // Re-plan the bots: nextRound() reset them to 'route' but left their
    // exhausted round-1 paths in place, so moveAlongPath reported "arrived"
    // at once and every bot froze at its spawn in 'hold' for the whole
    // round. assignRound hands each bot a fresh route (and the charge).
    planRound();
    syncAllHud();
  },
  onPlant(site) {
    hud.banner('CHARGE PLANTED', `Site ${site} — defend it until it blows`, 3000);
    hud.setObjective(`Charge planted at ${site} — defend it`);
    audio.plantDone();
  },
  onDefuse() {
    hud.banner('CHARGE DEFUSED', 'Sentinels held the site', 3000);
    audio.plantDone();
  },
  onTick() { audio.tick(); },
  heard(pos, team) {
    for (const bot of bots.list) {
      if (!bot.alive || bot.team === team) continue;
      if (bot.pos.distanceTo(pos) < 28 && bot.mode !== 'engage') {
        bot.investigate = pos.clone();
        bot.investigateAt = elapsed + 6;
      }
    }
  },
  killed(bot, attacker) {
    const killer = attacker === 'player' ? 'YOU' : attacker ? attacker.name : '—';
    const friendly = attacker === 'player' || (attacker && attacker.team === 'vanguard');
    hud.feedLine(`${killer} ✕ ${bot.name}`, friendly);
    if (attacker === 'player') {
      playerState.kills += 1;
      rounds.earn(150);
      playerState.money = rounds.state.money;
      hud.setMoney(playerState.money);
    }
  },
};
const rounds = createRounds(world, bots, events);
bots.setEvents(events);

function worldHitMeshes() {
  return world.shootables.concat(bots.hitMeshes);
}
function allHitMeshes() {
  return worldHitMeshes().concat(playerHitMeshes);
}
function damagePlayer(amount, attacker) {
  if (!playerState.alive) return;
  playerState.hp -= amount;
  hud.setHealth(playerState.hp);
  hud.damageFlash();
  audio.hurt();
  if (playerState.hp <= 0) {
    playerState.hp = 0;
    playerState.alive = false;
    playerState.deaths += 1;
    hud.feedLine(`${attacker ? attacker.name : '—'} ✕ YOU`, false);
    hud.banner('YOU ARE DOWN', 'Your team fights on — next round', 3000);
    input.exitLock();
    input.releaseFire();
  }
}
function damageBot(bot, amount, part, attacker) {
  // bots.damage already reports the kill through events.killed (feed line
  // and kill money), so this wrapper only returns whether it died.
  return bots.damage(bot, amount, part, attacker);
}

const botCtx = {
  get playerPos() { return body.position; },
  get playerAlive() { return playerState.alive; },
  get playerCrouching() { return body.crouched; },
  get phase() { return rounds.state.phase; },
  get plantedSite() { return rounds.state.planted ? rounds.state.planted.site : null; },
  allHitMeshes: allHitMeshes(),
  damagePlayer,
  damageBot,
  explode(point, maxDmg, radius, owner) {
    bots.explodeDamage(point, maxDmg, radius, owner);
    const d = body.position.distanceTo(point);
    if (playerState.alive && d < radius) {
      const blocked = false;
      damagePlayer(maxDmg * (1 - d / radius) * (blocked ? 0.45 : 1), owner);
    }
  },
  get playerPosVec() { return body.position; },
};

// --- round plans --------------------------------------------------------------
function planRound() {
  const siteFirst = random() < 0.5 ? 'A' : 'B';
  const aNode = siteFirst === 'A' ? 12 : 16;
  const bNode = siteFirst === 'A' ? 16 : 12;
  const plan = {
    vanguard: [
      { node: aNode, type: 'site', look: world.sites[siteFirst].pos },
      { node: aNode, type: 'site', look: world.sites[siteFirst].pos },
      { node: bNode, type: 'site', look: world.sites[siteFirst === 'A' ? 'B' : 'A'].pos },
      { node: 7, type: 'hold', yaw: 0 },
      { node: bNode, type: 'site', look: world.sites[siteFirst === 'A' ? 'B' : 'A'].pos },
    ],
    sentinel: [
      // Defenders hold ANGLES 12–18 m back from the sites, not the plant
      // spots themselves. Holding on the site nodes let them ambush the
      // attackers at 5–8 m, where the aim model is nearly a guaranteed hit
      // — every vanguard bot died within ~2 s of the round going live.
      { node: 24, type: 'hold', yaw: Math.PI },
      { node: 25, type: 'hold', yaw: Math.PI },
      { node: 23, type: 'hold', yaw: Math.PI },
      { node: 30, type: 'hold', yaw: Math.PI },
      { node: 31, type: 'hold', yaw: Math.PI },
    ],
    chargeCarrier: 0,
  };
  bots.assignRound(plan);
}

function startMatch() {
  rounds.state.score = { vanguard: 0, sentinel: 0 };
  rounds.state.round = 1;
  rounds.state.money = 800;
  rounds.state.matchOver = false;
  rounds.state.matchWinner = null;
  playerState.money = 800;
  playerState.kills = 0;
  playerState.deaths = 0;
  playerState.alive = true;
  playerState.hp = 100;
  bots.spawnAll('vanguard');
  bots.placeAtSpawns();
  planRound();
  player.spawn(world.spawns.vanguard[0], 0);
  loadout.onDeath();
  syncAllHud();
  rounds.startBuy();
}

function syncAmmoHud() {
  const w = loadout.currentWeapon();
  hud.setAmmo(w.mag, w.reserve, w.def.name, loadout.grenades);
}
function syncAllHud() {
  hud.setHealth(playerState.hp);
  hud.setMoney(playerState.money);
  hud.setScore(rounds.state.score.vanguard, rounds.state.score.sentinel, rounds.state.round);
  hud.setTimer(rounds.state.timer);
  syncAmmoHud();
}

function openBuy() {
  if (rounds.state.phase !== 'buy') return;
  buyOpen = true;
  hud.buyMenu(true, rounds.state.money, loadout);
}
function closeBuy() {
  buyOpen = false;
  hud.buyMenu(false, rounds.state.money, loadout);
}
function tryBuy(id) {
  const def = id === 'grenade' ? GRENADE : WEAPONS[id];
  if (!def) return;
  if (id === 'grenade') {
    if (loadout.grenades >= GRENADE.maxCarry) return;
    if (!rounds.spend(def.price)) return;
    loadout.buyGrenade();
  } else {
    if (loadout.owned[id]) { loadout.select(id); syncAmmoHud(); return; }
    if (!rounds.spend(def.price)) return;
    if (!loadout.buy(id)) { rounds.earn(def.price); return; }
    loadout.select(id);
  }
  playerState.money = rounds.state.money;
  hud.setMoney(playerState.money);
  hud.buyMenu(true, rounds.state.money, loadout);
  syncAmmoHud();
  audio.buy();
}

// --- shooting -------------------------------------------------------------------
function playerShoot() {
  const w = loadout.currentWeapon();
  if (!w) return;
  if (weaponState.reloading > 0) return;
  if (w.mag <= 0) {
    audio.dryFire();
    weaponState.cooldown = 0.25;
    return;
  }
  if (!weaponState.takeRound(loadout)) return;
  const spread = weaponState.spreadOf(w.def, player.groundSpeed(), body.crouched);
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  const eye = camera.position;
  const muzzle = tmpVec.copy(eye).addScaledVector(direction, 0.8);
  muzzle.y -= 0.12;
  combat.muzzleFlash(muzzle);
  audio.shot(w.def.kind === 'dmr' ? 'dmr' : w.def.kind === 'shotgun' ? 'shotgun' : 'rifle', 0);
  events.heard(muzzle, 'vanguard');
  const pellets = w.def.pellets ?? 1;
  let anyHit = false;
  for (let p = 0; p < pellets; p += 1) {
    tmpVec2.copy(direction);
    if (pellets > 1) {
      tmpVec2.x += (random() * 2 - 1) * spread * 1.6;
      tmpVec2.y += (random() * 2 - 1) * spread * 1.6;
      tmpVec2.z += (random() * 2 - 1) * spread * 1.6;
      tmpVec2.normalize();
    }
    const hit = combat.hitscan(eye, tmpVec2, w.def.range, worldHitMeshes());
    const end = hit ? hit.point : tmpVec2.clone().multiplyScalar(w.def.range).add(eye);
    combat.tracer(muzzle, end);
    if (!hit) continue;
    if (hit.target && hit.target !== 'player') {
      const falloff = hit.distance > w.def.falloffStart
        ? Math.max(0.4, 1 - (hit.distance - w.def.falloffStart) / (w.def.falloffEnd - w.def.falloffStart) * 0.6)
        : 1;
      const dmg = w.def.damage * (hit.part === 'head' ? w.def.headMult : 1) * falloff;
      const killed = damageBot(hit.target, dmg, hit.part, 'player');
      hud.hitMarker(killed);
      audio.hit(killed);
      anyHit = true;
    } else if (hit.wall) {
      combat.impact(hit.point, hit.normal);
    }
  }
  if (!anyHit && pellets === 1) { /* miss: no marker */ }
  player.recoil(w.def.recoil, (random() * 2 - 1) * w.def.recoil * 0.4);
  vmKick = Math.min(0.09, vmKick + w.def.recoil * 2.2);
  syncAmmoHud();
}

function throwPlayerGrenade() {
  if (loadout.grenades <= 0 || !playerState.alive) return;
  loadout.grenades -= 1;
  camera.getWorldDirection(direction);
  combat.throwGrenade(tmpVec.copy(camera.position).addScaledVector(direction, 0.6), direction, 'player');
  syncAmmoHud();
}

// --- plant / defuse ---------------------------------------------------------------
function nearestSite() {
  for (const key of ['A', 'B']) {
    const s = world.sites[key];
    const dx = body.position.x - s.pos.x;
    const dz = body.position.z - s.pos.z;
    if (Math.hypot(dx, dz) <= s.radius) return key;
  }
  return null;
}

// --- input actions ------------------------------------------------------------------
input.onKeyDown = (code) => {
  audio.unlock();
  if (code === 'KeyM') { audio.toggleMute(); return; }
  if (code === 'KeyB' && rounds.state.phase === 'buy') {
    if (buyOpen) closeBuy();
    else openBuy();
    return;
  }
  if (buyOpen) {
    if (code === 'Digit2') tryBuy('carbine');
    else if (code === 'Digit3') tryBuy('dmr');
    else if (code === 'Digit4') tryBuy('shotgun');
    else if (code === 'Digit5') tryBuy('grenade');
    else if (code === 'Digit1') { loadout.select('pistol'); syncAmmoHud(); }
    return;
  }
  if (!playerState.alive) return;
  if (code === 'Digit1') { loadout.select('pistol'); syncAmmoHud(); }
  else if (code === 'Digit2') { loadout.select('carbine'); syncAmmoHud(); }
  else if (code === 'Digit3') { loadout.select('dmr'); syncAmmoHud(); }
  else if (code === 'Digit4') { loadout.select('shotgun'); syncAmmoHud(); }
  else if (code === 'KeyR') { if (weaponState.startReload(loadout)) audio.reload(); }
  else if (code === 'KeyG') throwPlayerGrenade();
};
document.addEventListener('mousedown', (event) => {
  if (event.button === 2 && input.locked) {
    rightHeld = true;
    if (loadout.currentWeapon().def.zoom) weaponState.zoomed = true;
  }
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 2) { rightHeld = false; weaponState.zoomed = false; }
});
document.addEventListener('contextmenu', (event) => event.preventDefault());

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (rounds.state.matchOver) { startMatch(); }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (rounds.state.phase === 'buy') openBuy();
  } else if (rounds.state.matchOver) {
    hud.showOverlay('match', rounds.state.matchWinner === 'vanguard' ? 'VANGUARD WINS' : 'SENTINELS WIN');
  } else if (!playerState.alive) {
    // Down players wait for the next round; no overlay spam.
  } else {
    hud.showOverlay(started ? 'paused' : 'start', 0);
  }
}

// --- fixed-step simulation -----------------------------------------------------------
function step(dt) {
  elapsed += dt;
  if (rounds.state.matchOver && elapsed > matchResetAt && matchResetAt > 0) {
    matchResetAt = 0;
    hud.showOverlay('match', rounds.state.matchWinner === 'vanguard' ? 'VANGUARD WINS' : 'SENTINELS WIN');
    input.exitLock();
  }
  const look = input.takeLook();
  if (playerState.alive) player.look(look.x, look.y);
  body.pitch += body.recoilPitch * 0.12;
  body.recoilPitch *= 0.85;

  // Keep the player's hitboxes on the body for the bots' raycasts.
  playerHitHead.position.set(body.position.x, body.position.y + 1.58, body.position.z);
  playerHitBody.position.set(body.position.x, body.position.y + 0.95, body.position.z);

  // Zoom.
  const wantFov = weaponState.zoomed ? 74 / 2.4 : 74;
  if (Math.abs(camera.fov - wantFov) > 0.2) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }

  if (playerState.alive && rounds.state.phase !== 'end') {
    player.step(dt, input.state.keys, input.state.firing);
    weaponState.step(dt, loadout);
    const firing = input.state.firing && input.locked;
    const w = loadout.currentWeapon();
    const semiEdge = firing && !prevFiring;
    if (firing && weaponState.ready() && (w.def.auto || semiEdge)) playerShoot();
    prevFiring = firing;
    if (input.state.keys.has('KeyR') && weaponState.reloading <= 0) {
      if (weaponState.startReload(loadout)) audio.reload();
    }
    if (player.isMoving() && body.onGround) audio.step(0);
    // Plant channel.
    const site = nearestSite();
    const holdingE = input.state.keys.has('KeyE');
    if (site && holdingE && rounds.state.phase === 'live' && !rounds.state.planted) {
      rounds.channelPlant(dt, site, true);
      hud.plantBar(true, `PLANTING CHARGE — SITE ${site}`, rounds.state.plantProgress);
    } else {
      rounds.channelPlant(dt, site, false);
      hud.plantBar(false, '', 0);
    }
  } else {
    hud.plantBar(false, '', 0);
  }

  // Bots.
  botCtx.allHitMeshes = allHitMeshes();
  bots.step(dt, botCtx, elapsed);

  // Bot plant / defuse channels. The carrier plants whenever it stands on
  // a site — being shot is what interrupts it (bots.damage resets the
  // channel), not merely spotting an enemy: the old `!bot.target` guard
  // meant the carrier could never finish a plant while in contact, so
  // rounds stalled in a hold-vs-hold standoff after the opening exchange.
  // Only one defuser channels at a time, and the progress bleeds away when
  // nobody is on the charge.
  let defusing = false;
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    if (bot.hasCharge && bot.team === 'vanguard' && !rounds.state.planted && rounds.state.phase === 'live') {
      const site = bot.objective && bot.objective.type === 'site'
        ? (bot.pos.distanceTo(world.sites.A.pos) < world.sites.A.radius ? 'A'
          : bot.pos.distanceTo(world.sites.B.pos) < world.sites.B.radius ? 'B' : null)
        : null;
      if (site) {
        bot.mode = 'plant';
        bot.target = null;
        bot.plantAt += dt;
        if (bot.plantAt >= 3) {
          rounds.plant(site, bot.name);
          bot.plantAt = 0;
          bot.mode = 'hold';
        }
      } else {
        bot.plantAt = Math.max(0, bot.plantAt - dt);
        if (bot.mode === 'plant') bot.mode = 'route';
      }
    }
    if (rounds.state.planted && bot.team === 'sentinel') {
      const site = rounds.state.planted.site;
      const near = bot.pos.distanceTo(world.sites[site].pos) < world.sites[site].radius;
      if (near && !defusing) {
        defusing = true;
        bot.mode = 'defuse';
        bot.target = null;
        rounds.channelDefuse(dt, site, true);
      } else if (bot.mode === 'defuse') {
        bot.mode = 'route';
      }
    }
  }
  if (rounds.state.planted && !defusing) {
    rounds.channelDefuse(dt, rounds.state.planted.site, false);
  }

  combat.updateGrenades(dt, {
    playerPos: body.position,
    explode(point, maxDmg, radius, owner) { botCtx.explode(point, maxDmg, radius, owner); },
  });
  combat.step(dt);
  rounds.step(dt, { playerAlive: playerState.alive });

  // HUD.
  hud.setTimer(rounds.state.timer);
  hud.setScore(rounds.state.score.vanguard, rounds.state.score.sentinel, rounds.state.round);
  const w = loadout.currentWeapon();
  const spreadPx = 4 + weaponState.spreadOf(w.def, player.groundSpeed(), body.crouched) * 900;
  hud.setSpread(Math.min(26, spreadPx));
  if (rounds.state.planted) {
    hud.setObjective(`Charge planted at ${rounds.state.planted.site} — ${Math.ceil(rounds.state.plantTimer)}s to detonation`);
  }
  // Viewmodel motion.
  vmKick *= Math.max(0, 1 - dt * 9);
  vmBob += dt * (player.isMoving() ? 9 : 3);
  const bobAmp = player.isMoving() && body.onGround ? 0.012 : 0.004;
  viewmodel.position.set(
    0.26 + Math.sin(vmBob) * bobAmp,
    -0.24 + Math.abs(Math.cos(vmBob)) * bobAmp + (weaponState.reloading > 0 ? -0.08 : 0),
    -0.5 + vmKick,
  );
  viewmodel.rotation.x = vmKick * 1.6;
  syncCamera();
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    if (painted >= 2) return;
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  closeBuy();
  startMatch();
  rounds.state.phase = 'live';
  rounds.state.timer = 84;
  if (name === 'cover') {
    body.position.set(0, 0, 8);
    body.yaw = Math.PI * 0.08;
    body.pitch = -0.02;
    // Two sentinels on the open sand east of the mid platform, clear of
    // its 2.4 m face so they are actually visible from the spawn lane.
    const s1 = bots.list.find((b) => b.team === 'sentinel' && b.index === 0);
    const s2 = bots.list.find((b) => b.team === 'sentinel' && b.index === 1);
    if (s1) { s1.pos.set(11, 0, -1); s1.yaw = Math.PI; s1.mode = 'hold'; }
    if (s2) { s2.pos.set(15, 0, 3); s2.yaw = Math.PI * 0.8; s2.mode = 'hold'; }
    settle(30);
    aimAt(new THREE.Vector3(13, 1.4, 1));
    syncCamera();
  } else if (name === 'fight') {
    // West lane: open sand, no platform or pillar between player and foe.
    body.position.set(-10, 0, 10);
    body.yaw = 0.1;
    body.pitch = 0;
    const foe = bots.list.find((b) => b.team === 'sentinel' && b.index === 0);
    if (foe) { foe.pos.set(-4, 0, 4); foe.yaw = Math.PI; foe.mode = 'hold'; }
    settle(20);
    aimAt(new THREE.Vector3(-4, 1.4, 4));
    loadout.buy('carbine');
    loadout.select('carbine');
    // Two hits (2 x 26) plus the scripted 34 leaves the foe alive at 14 hp,
    // still standing in frame with the hitmarker up.
    for (let i = 0; i < 2; i += 1) { playerShoot(); settle(6); }
    if (foe) { damageBot(foe, 34, 'body', 'player'); hud.hitMarker(false); }
    settle(2);
    // One last shot right before the freeze so the tracer and muzzle flash
    // are still in the frame when the screenshot is taken.
    playerShoot();
    syncCamera();
  } else if (name === 'buy') {
    rounds.state.phase = 'buy';
    rounds.state.timer = 9;
    body.position.set(0, 0, 20);
    body.yaw = Math.PI;
    body.pitch = 0;
    playerState.money = 3400;
    rounds.state.money = 3400;
    hud.setMoney(3400);
    settle(10);
    openBuy();
    syncCamera();
  } else if (name === 'end') {
    rounds.state.phase = 'end';
    rounds.state.score = { vanguard: 2, sentinel: 1 };
    rounds.state.round = 4;
    body.position.set(18, 0, -8);
    body.yaw = -Math.PI * 0.42;
    body.pitch = 0.02;
    for (const b of bots.list) {
      if (b.team === 'sentinel') { b.alive = false; b.parts.group.rotation.z = Math.PI / 2; b.parts.group.position.y = 0.25; }
    }
    // One fallen sentinel in frame, just east of the plant circle.
    const fallen = bots.list.find((b) => b.team === 'sentinel' && b.index === 0);
    if (fallen) fallen.parts.group.position.set(22, 0.25, -10);
    hud.setScore(2, 1, 4);
    hud.banner('ROUND WON', 'Site A cleared — Sentinels eliminated', 60000);
    // No settle() here: stepping with phase 'end' would fire nextRound(),
    // which re-opens the buy menu and bumps the round counter.
    syncCamera();
  }
  // startMatch() opened the buy menu via onPhase('buy'); the live/end shots
  // must close it again, otherwise the 78% dark overlay covers the scene.
  // The phase was also set directly (no onPhase('live') event), so fix the
  // objective line that startBuy() left saying "Buy phase".
  if (name !== 'buy') {
    closeBuy();
    hud.setObjective('Plant the charge at A or B');
  }
  hud.setScore(rounds.state.score.vanguard, rounds.state.score.sentinel, rounds.state.round);
  hud.setTimer(rounds.state.timer);
  syncAmmoHud();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncAllHud();
if (shot) {
  runShot(shot);
} else {
  startMatch();
  hud.showOverlay('start', 0);
  requestAnimationFrame(frame);
}
