// Bots: 5v5 teammates and opponents. Each bot has a body the player can
// shoot (head and torso hitboxes), a waypoint route to its objective, and a
// small state machine: route, hold, engage, retreat, plant, defuse. Bots see
// through a field-of-view cone plus a line-of-sight raycast, hear gunfire
// and investigate, burst-fire with distance-scaled aim error, and fall back
// when hurt. Names are original; no commercial game's characters appear.
import * as THREE from 'three';

const NAMES = {
  vanguard: ['Rook', 'Fable', 'Moss', 'Kite', 'Bramble'],
  sentinel: ['Onyx', 'Wren', 'Flint', 'Juno', 'Pike'],
};
const TEAM_COLOR = { vanguard: 0xf0a830, sentinel: 0x2ec4b6 };
const BOT_SPEED = 4.2;
const EYE_HEIGHT = 1.55;
const REACTION = 0.38;

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

export function createBots(scene, world, nav, combat, audio) {
  const raycaster = new THREE.Raycaster();
  const bots = [];
  const hitMeshes = [];
  const losFrom = new THREE.Vector3();
  const losTo = new THREE.Vector3();
  const losDir = new THREE.Vector3();
  const holdLook = new THREE.Vector3();
  let events = null;

  function buildMesh(team) {
    const color = TEAM_COLOR[team];
    const group = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: team === 'vanguard' ? 0x6b5a3a : 0x2f4a4a, roughness: 0.85 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 0.5, metalness: 0.4 });
    const visor = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.34), cloth);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), armor);
    chest.position.y = 1.12;
    chest.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), cloth);
    head.position.y = 1.58;
    head.castShadow = true;
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1), visor);
    visorMesh.position.set(0, 1.6, 0.17);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.32), armor);
    legs.position.y = 0.36;
    legs.castShadow = true;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.72), armor);
    gun.position.set(0.24, 1.18, 0.42);
    group.add(torso, chest, head, visorMesh, legs, gun);
    return { group, head, torso, chest, gun };
  }

  function spawnBot(team, name, index, pos, yaw) {
    const parts = buildMesh(team);
    parts.group.position.copy(pos);
    parts.group.rotation.y = yaw;
    scene.add(parts.group);
    const bot = {
      team, name, index, parts, alive: true, hp: 100,
      pos: parts.group.position,
      yaw, pitch: 0, vel: new THREE.Vector3(),
      mode: 'route', path: [], pathIndex: 0,
      objective: null, holdNode: -1, holdYaw: 0,
      target: null, targetPos: new THREE.Vector3(), targetIsPlayer: false,
      reactAt: 0, burstLeft: 0, fireAt: 0, reloadAt: 0, mag: 30,
      perceiveAt: Math.random() * 0.15,
      investigate: null, investigateAt: 0,
      plantAt: 0, defuseAt: 0, hasCharge: false,
      aimError: 0, walkPhase: Math.random() * 6, groundY: pos.y,
      rng: mulberry32(1000 + index * 77 + (team === 'vanguard' ? 13 : 29)),
      damageFlash: 0,
    };
    parts.head.userData = { bot, part: 'head' };
    parts.torso.userData = { bot, part: 'body' };
    parts.chest.userData = { bot, part: 'body' };
    hitMeshes.push(parts.head, parts.torso, parts.chest);
    bots.push(bot);
    return bot;
  }

  function hasLineOfSight(from, to) {
    losFrom.copy(from);
    losTo.copy(to);
    losDir.subVectors(losTo, losFrom);
    const dist = losDir.length();
    if (dist < 0.5) return true;
    raycaster.set(losFrom, losDir.normalize());
    raycaster.far = dist;
    return raycaster.intersectObjects(world.shootables, false).length === 0;
  }

  function visibleEnemy(bot, ctx, now) {
    // Returns the best visible enemy: { pos, isPlayer, bot } or null.
    const eye = new THREE.Vector3(bot.pos.x, bot.pos.y + EYE_HEIGHT, bot.pos.z);
    let best = null;
    let bestScore = Infinity;
    const consider = (pos, isPlayer, enemyBot) => {
      const dx = pos.x - eye.x;
      const dy = pos.y + 1.2 - eye.y;
      const dz = pos.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 26) return;
      const toTarget = new THREE.Vector3(dx / d, dy / d, dz / d);
      const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      if (toTarget.x * facing.x + toTarget.z * facing.z < 0.25 && d > 6) return; // outside ~75 deg cone
      if (!hasLineOfSight(eye, new THREE.Vector3(pos.x, pos.y + 1.2, pos.z))) return;
      const score = d + (isPlayer && ctx.playerCrouching ? 6 : 0);
      if (score < bestScore) { bestScore = score; best = { pos: new THREE.Vector3(pos.x, pos.y + 1.2, pos.z), isPlayer, bot: enemyBot }; }
    };
    if (bot.team === 'sentinel' && ctx.playerAlive) consider(ctx.playerPos, true, null);
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      consider(other.pos, false, other);
    }
    // Player is on the Vanguard team: Vanguard bots never target the player.
    return best;
  }

  function setRoute(bot, goalNode) {
    const start = nav.nearestNode(bot.pos.x, bot.pos.z);
    bot.path = nav.findPath(start, goalNode);
    bot.pathIndex = 0;
  }

  function moveAlongPath(bot, dt, speed) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = world.waypoints[bot.path[bot.pathIndex]];
    const dx = node.x - bot.pos.x;
    const dz = node.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.7) { bot.pathIndex += 1; return bot.pathIndex >= bot.path.length; }
    const step = Math.min(d, speed * dt);
    bot.pos.x += (dx / d) * step;
    bot.pos.z += (dz / d) * step;
    bot.yaw = Math.atan2(-(dx / d), -(dz / d));
    bot.walkPhase += dt * 9;
    return false;
  }

  function faceTarget(bot, dt, targetPos) {
    const dx = targetPos.x - bot.pos.x;
    const dz = targetPos.z - bot.pos.z;
    const want = Math.atan2(-dx, -dz);
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
  }

  function botFire(bot, ctx, now) {
    if (bot.mag <= 0) {
      if (now > bot.reloadAt) { bot.mag = 30; bot.reloadAt = now + 1.6; }
      return false;
    }
    if (now < bot.fireAt) return false;
    bot.fireAt = now + 0.115;
    bot.mag -= 1;
    const eye = new THREE.Vector3(bot.pos.x, bot.pos.y + EYE_HEIGHT, bot.pos.z);
    const to = bot.targetPos;
    const dist = eye.distanceTo(to);
    const err = 0.008 + dist * 0.0006 + (bot.rng() * 0.01);
    const dir = new THREE.Vector3().subVectors(to, eye).normalize();
    dir.x += (bot.rng() * 2 - 1) * err;
    dir.y += (bot.rng() * 2 - 1) * err;
    dir.z += (bot.rng() * 2 - 1) * err;
    dir.normalize();
    const muzzle = eye.clone().addScaledVector(dir, 0.7);
    combat.muzzleFlash(muzzle);
    combat.tracer(muzzle, eye.clone().addScaledVector(dir, Math.min(dist + 4, 60)));
    audio.shot('rifle', eye.distanceTo(ctx.playerPos));
    if (events) events.heard(muzzle, bot.team);
    // Hit resolution: raycast from the bot against player + bot hitboxes.
    const hit = combat.hitscan(eye, dir, 70, ctx.allHitMeshes);
    if (hit && hit.target) {
      const dmg = 22 * (hit.part === 'head' ? 3 : 1) * (dist > 25 ? 0.75 : 1);
      if (hit.target === 'player') ctx.damagePlayer(dmg, bot);
      else if (hit.target.alive) ctx.damageBot(hit.target, dmg, hit.part, bot);
    } else if (hit && hit.wall) {
      combat.impact(hit.point, hit.normal);
    }
    return true;
  }

  function stepBot(bot, dt, ctx, now) {
    if (!bot.alive) return;
    bot.damageFlash = Math.max(0, bot.damageFlash - dt * 3);
    bot.parts.group.rotation.y = bot.yaw;
    // Walk bob, recomputed from the ground each frame. The old code read
    // bot.pos.y — but bot.pos IS the group's position, so every frame added
    // up to 0.03 to y and the bot floated skyward (~1.3 units per second).
    // After a minute the carrier hovered ~25 units up, so the 3D plant
    // radius check never fired and the bots were visibly airborne.
    bot.parts.group.position.y = bot.groundY + Math.abs(Math.sin(bot.walkPhase)) * 0.03;
    bot.parts.gun.position.z = 0.42 + Math.sin(bot.walkPhase) * 0.015;

    // No fighting before the round goes live: during the buy phase (and
    // after it ends) bots walk to their objectives but never spot or shoot.
    // Without this they trade kills across the map while the player is
    // still shopping, and a round can end before it starts.
    if (ctx.phase !== 'live') {
      if (bot.mode === 'engage') {
        bot.mode = 'route';
        bot.target = null;
        if (bot.objective) setRoute(bot, bot.objective.node);
      }
    } else if (bot.mode !== 'plant' && bot.mode !== 'defuse' && now >= bot.perceiveAt) {
      // A bot committed to a plant/defuse channel does not get pulled off
      // it by spotting someone — only taking damage breaks the channel
      // (see damage()).
      bot.perceiveAt = now + 0.15 + bot.rng() * 0.05;
      const seen = visibleEnemy(bot, ctx, now);
      if (seen) {
        if (!bot.target) bot.reactAt = now + REACTION * (0.8 + bot.rng() * 0.5);
        bot.target = seen;
        bot.targetPos.copy(seen.pos);
        bot.mode = 'engage';
      } else if (bot.mode === 'engage') {
        bot.target = null;
        bot.mode = bot.objective && bot.objective.type === 'hold' ? 'hold' : 'route';
        if (bot.mode === 'route' && bot.objective) setRoute(bot, bot.objective.node);
      }
    }

    if (bot.mode === 'engage' && bot.target) {
      // Track the live target at chest height (the snapshot in bot.target
      // goes stale as the target moves).
      if (bot.target.isPlayer) {
        bot.targetPos.set(ctx.playerPos.x, ctx.playerPos.y + 1.4, ctx.playerPos.z);
      } else if (bot.target.bot && bot.target.bot.alive) {
        bot.targetPos.set(bot.target.bot.pos.x, bot.target.bot.pos.y + 1.2, bot.target.bot.pos.z);
      }
      faceTarget(bot, dt, bot.targetPos);
      if (now >= bot.reactAt) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = 3 + ((bot.rng() * 3) | 0);
          bot.fireAt = now + 0.25 + bot.rng() * 0.3;
        }
        // Strafe while firing, slow and deliberate.
        const strafe = Math.sin(now * 1.4 + bot.index) > 0 ? 1 : -1;
        const sx = Math.cos(bot.yaw) * strafe;
        const sz = -Math.sin(bot.yaw) * strafe;
        bot.pos.x += sx * 1.1 * dt;
        bot.pos.z += sz * 1.1 * dt;
        if (bot.burstLeft > 0) {
          // Only spend a burst round when a shot actually left the barrel:
          // botFire returns false while the 0.115 s cadence gate is shut,
          // and the old code burned the whole burst in a few frames.
          if (botFire(bot, ctx, now)) bot.burstLeft -= 1;
        }
      }
      if (bot.hp < 30 && bot.rng() < dt * 0.4) {
        bot.mode = 'retreat';
        const home = bot.team === 'vanguard' ? 0 : 18;
        setRoute(bot, home);
      }
      return;
    }

    if (bot.mode === 'retreat') {
      const arrived = moveAlongPath(bot, dt, BOT_SPEED * 1.1);
      if (arrived || bot.hp > 55) bot.mode = 'route';
      return;
    }

    if (bot.mode === 'plant' || bot.mode === 'defuse') {
      // Channelled by rounds.js through bot.plantAt / bot.defuseAt.
      return;
    }

    if (bot.mode === 'hold') {
      // Retake: once the charge is planted, defenders abandon their holds
      // and push the planted site — otherwise they just wait out the round
      // while the timer runs down.
      if (bot.team === 'sentinel' && ctx.plantedSite) {
        const site = world.sites[ctx.plantedSite];
        if (bot.pos.distanceTo(site.pos) >= site.radius) {
          setRoute(bot, nav.nearestNode(site.pos.x, site.pos.z));
          bot.mode = 'route';
          return;
        }
      }
      holdLook.set(bot.pos.x - Math.sin(bot.holdYaw) * 10, bot.pos.y, bot.pos.z - Math.cos(bot.holdYaw) * 10);
      faceTarget(bot, dt, holdLook);
      return;
    }

    // Heard gunfire recently: investigate it before resuming the route.
    if (bot.investigate && now < bot.investigateAt && bot.mode === 'route') {
      const node = nav.nearestNode(bot.investigate.x, bot.investigate.z);
      if (bot.path.length === 0 || bot.path[bot.path.length - 1] !== node) setRoute(bot, node);
      if (moveAlongPath(bot, dt, BOT_SPEED)) bot.investigate = null;
      return;
    }

    // Route: follow waypoints to the objective.
    const arrived = moveAlongPath(bot, dt, BOT_SPEED);
    if (arrived) {
      if (bot.objective && bot.objective.type === 'hold') {
        bot.mode = 'hold';
        bot.holdYaw = bot.objective.yaw;
      } else if (bot.objective && bot.objective.type === 'site') {
        bot.mode = 'hold';
        bot.holdYaw = Math.atan2(-(bot.objective.look.x - bot.pos.x), -(bot.objective.look.z - bot.pos.z));
      } else {
        bot.mode = 'hold';
      }
    }
  }

  function assignRound(plan) {
    // plan: { vanguard: [{node, type, look?}], sentinel: [...] } plus charge carrier index.
    for (const bot of bots) {
      if (!bot.alive) continue;
      const list = plan[bot.team];
      const job = list[bot.index % list.length];
      bot.objective = job;
      bot.hasCharge = bot.team === 'vanguard' && bot.index === plan.chargeCarrier;
      if (job.type === 'hold') {
        setRoute(bot, job.node);
        bot.mode = 'route';
      } else {
        setRoute(bot, job.node);
        bot.mode = 'route';
      }
    }
  }

  return {
    list: bots,
    hitMeshes,
    setEvents(e) { events = e; },
    spawnAll(playerTeam) {
      for (const bot of bots) {
        scene.remove(bot.parts.group);
      }
      bots.length = 0;
      hitMeshes.length = 0;
      for (let i = 0; i < 4; i += 1) {
        const pos = world.spawns.vanguard[i + 1].clone();
        spawnBot('vanguard', NAMES.vanguard[i], i, pos, Math.PI);
      }
      for (let i = 0; i < 5; i += 1) {
        const pos = world.spawns.sentinel[i].clone();
        spawnBot('sentinel', NAMES.sentinel[i], i, pos, 0);
      }
    },
    assignRound,
    step(dt, ctx, now) {
      for (const bot of bots) stepBot(bot, dt, ctx, now);
    },
    damage(bot, amount, part, attacker) {
      if (!bot.alive) return false;
      bot.hp -= amount;
      bot.damageFlash = 1;
      // Being shot breaks a plant/defuse channel: the bot has to start over.
      if (bot.mode === 'plant') { bot.plantAt = 0; bot.mode = 'route'; }
      if (bot.mode === 'defuse') { bot.mode = 'route'; }
      if (bot.hp <= 0) {
        bot.hp = 0;
        bot.alive = false;
        bot.mode = 'dead';
        bot.parts.group.rotation.z = Math.PI / 2;
        bot.parts.group.position.y = bot.groundY + 0.25;
        // The charge drops to the next living attacker, so the objective
        // does not die with the carrier.
        if (bot.hasCharge) {
          bot.hasCharge = false;
          const next = bots.find((b) => b.alive && b.team === 'vanguard');
          if (next) next.hasCharge = true;
        }
        if (events) events.killed(bot, attacker);
        return true;
      }
      return false;
    },
    explodeDamage(point, maxDmg, radius, owner) {
      const eye = new THREE.Vector3();
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = bot.pos.distanceTo(point);
        if (d > radius) continue;
        eye.set(bot.pos.x, bot.pos.y + 1.2, bot.pos.z);
        const blocked = !hasLineOfSight(point.clone().setY(point.y + 0.4), eye);
        const dmg = maxDmg * (1 - d / radius) * (blocked ? 0.45 : 1);
        if (dmg > 5) this.damage(bot, dmg, 'body', owner);
      }
    },
    aliveCount(team) {
      let n = 0;
      for (const bot of bots) if (bot.alive && bot.team === team) n += 1;
      return n;
    },
    resetRound() {
      for (const bot of bots) {
        bot.alive = true;
        bot.hp = 100;
        bot.mode = 'route';
        bot.target = null;
        bot.mag = 30;
        bot.burstLeft = 0;
        bot.plantAt = 0;
        bot.defuseAt = 0;
        bot.parts.group.rotation.z = 0;
        bot.parts.group.position.y = bot.groundY;
      }
    },
    placeAtSpawns() {
      for (const bot of bots) {
        const list = bot.team === 'vanguard' ? world.spawns.vanguard : world.spawns.sentinel;
        const spot = list[bot.team === 'vanguard' ? bot.index + 1 : bot.index];
        bot.pos.copy(spot);
        bot.groundY = spot.y;
        // Face the map: Vanguard spawns south and pushes north (yaw 0),
        // Sentinels spawn north and watch the southern approaches (yaw PI).
        bot.yaw = bot.team === 'vanguard' ? 0 : Math.PI;
        bot.parts.group.rotation.y = bot.yaw;
        bot.parts.group.rotation.z = 0;
      }
    },
  };
}
