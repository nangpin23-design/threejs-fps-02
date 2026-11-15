// Combat: hitscan shooting, tracers, muzzle flash, impact particles and
// grenades. One raycast per shot (plus a short world raycast for wall hits),
// a small pool of reusable tracer lines and particle bursts — nothing is
// allocated in the hot path except the hit result object the caller reuses.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_BURSTS = 16;
const PARTICLES_PER_BURST = 14;

export function createCombat(scene, world, audio) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 140;
  const tmpDir = new THREE.Vector3();
  const tmpOrigin = new THREE.Vector3();

  // --- tracers (pooled lines) ----------------------------------------------
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const line = new THREE.Line(tracerGeo.clone(), new THREE.LineBasicMaterial({
      color: 0xffd98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;
  function tracer(from, to) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % MAX_TRACERS;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.07;
  }

  // --- muzzle flash (one light + sprite, moved to the shooter) --------------
  const flashLight = new THREE.PointLight(0xffc46a, 0, 14, 1.6);
  scene.add(flashLight);
  // Soft radial blob, not a hard square: a sprite with no texture renders
  // as a solid quad, and 0.8 m from the camera that fills the screen.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  const flashCtx = flashCanvas.getContext('2d');
  const flashGrad = flashCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  flashGrad.addColorStop(0, 'rgba(255,240,200,1)');
  flashGrad.addColorStop(0.4, 'rgba(255,200,110,0.85)');
  flashGrad.addColorStop(1, 'rgba(255,160,60,0)');
  flashCtx.fillStyle = flashGrad;
  flashCtx.fillRect(0, 0, 64, 64);
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flashTex, color: 0xffd98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flashSprite.scale.set(0.28, 0.28, 1);
  scene.add(flashSprite);
  let flashLife = 0;
  function muzzleFlash(pos) {
    flashLight.position.copy(pos);
    flashLight.intensity = 10;
    flashSprite.position.copy(pos);
    flashSprite.material.opacity = 0.95;
    flashLife = 0.05;
  }

  // --- impact particles (pooled Points) --------------------------------------
  const bursts = [];
  for (let i = 0; i < MAX_BURSTS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLES_PER_BURST * 3), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc46a, size: 0.09, transparent: true, opacity: 0, depthWrite: false,
    }));
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    bursts.push({ points, velocities: new Float32Array(PARTICLES_PER_BURST * 3), life: 0 });
  }
  let burstIndex = 0;
  function impact(point, normal, color = 0xffc46a) {
    const b = bursts[burstIndex];
    burstIndex = (burstIndex + 1) % MAX_BURSTS;
    const pos = b.points.geometry.attributes.position;
    for (let i = 0; i < PARTICLES_PER_BURST; i += 1) {
      pos.setXYZ(i, point.x, point.y, point.z);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2.4 + 0.6;
      const speed = 1 + Math.random() * 3;
      b.velocities[i * 3] = Math.cos(a) * speed + normal.x * 2;
      b.velocities[i * 3 + 1] = up + normal.y * 2;
      b.velocities[i * 3 + 2] = Math.sin(a) * speed + normal.z * 2;
    }
    pos.needsUpdate = true;
    b.points.material.color.setHex(color);
    b.points.material.opacity = 0.95;
    b.points.visible = true;
    b.life = 0.45;
  }

  // --- explosion visual -------------------------------------------------------
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff8a3c, 0, 26, 1.4);
  scene.add(boomLight);
  let boomLife = 0;
  function explosionFx(point) {
    boom.position.copy(point);
    boom.scale.setScalar(0.5);
    boom.material.opacity = 0.85;
    boomLight.position.copy(point);
    boomLight.intensity = 60;
    boomLife = 0.4;
    impact(point, new THREE.Vector3(0, 1, 0), 0xff6a2c);
    impact(point, new THREE.Vector3(0, 1, 0), 0xffc46a);
  }

  // --- grenades ---------------------------------------------------------------
  const grenades = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2e4a2e, roughness: 0.5, metalness: 0.4 });
  function throwGrenade(from, dir, owner) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    const vel = dir.clone().multiplyScalar(13);
    vel.y += 3.5;
    grenades.push({ mesh, vel, fuse: 2.4, owner });
    audio.grenadePin();
  }
  function updateGrenades(dt, damageTargets) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      const ground = world.groundHeight(p.x, p.z);
      if (p.y < ground + 0.09) {
        p.y = ground + 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.6;
        g.vel.z *= 0.6;
      }
      for (const c of world.colliders) {
        if (p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ && p.y < c.top) {
          if (Math.abs(p.x - c.minX) < Math.abs(p.x - c.maxX)) { p.x = c.minX - 0.1; g.vel.x = -Math.abs(g.vel.x) * 0.5; }
          else { p.x = c.maxX + 0.1; g.vel.x = Math.abs(g.vel.x) * 0.5; }
        }
      }
      if (g.fuse <= 0) {
        explosionFx(p.clone());
        audio.explosion(p.distanceTo(damageTargets.playerPos));
        damageTargets.explode(p, 120, 7, g.owner);
        scene.remove(g.mesh);
        grenades.splice(i, 1);
      }
    }
  }

  // --- hitscan ------------------------------------------------------------------
  // Returns null on a miss, or { target, part, point, distance, wall } where
  // target is a bot (or 'player') and wall is the wall-hit point when the ray
  // stopped on the world first.
  function hitscan(origin, dir, range, hitMeshes) {
    tmpOrigin.copy(origin);
    tmpDir.copy(dir);
    raycaster.set(tmpOrigin, tmpDir);
    raycaster.far = range;
    const hits = raycaster.intersectObjects(hitMeshes, false);
    if (!hits.length) return null;
    const h = hits[0];
    const ud = h.object.userData;
    return {
      target: ud.bot ?? ud.who ?? null,
      part: ud.part ?? 'body',
      point: h.point,
      distance: h.distance,
      wall: !ud.bot && !ud.who,
      normal: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0),
    };
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const b of bursts) {
      if (b.life > 0) {
        b.life -= dt;
        const pos = b.points.geometry.attributes.position;
        for (let i = 0; i < PARTICLES_PER_BURST; i += 1) {
          b.velocities[i * 3 + 1] -= 9 * dt;
          pos.setXYZ(i,
            pos.getX(i) + b.velocities[i * 3] * dt,
            Math.max(0.03, pos.getY(i) + b.velocities[i * 3 + 1] * dt),
            pos.getZ(i) + b.velocities[i * 3 + 2] * dt);
        }
        pos.needsUpdate = true;
        b.points.material.opacity = Math.max(0, b.life / 0.45);
        if (b.life <= 0) b.points.visible = false;
      }
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashLight.intensity = Math.max(0, flashLife / 0.05) * 10;
      flashSprite.material.opacity = Math.max(0, flashLife / 0.05) * 0.95;
      if (flashLife <= 0) flashSprite.material.opacity = 0;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const k = 1 - boomLife / 0.4;
      boom.scale.setScalar(0.5 + k * 7);
      boom.material.opacity = Math.max(0, 0.85 * (1 - k));
      boomLight.intensity = Math.max(0, 60 * (1 - k));
      if (boomLife <= 0) boom.material.opacity = 0;
    }
  }

  return {
    hitscan, tracer, muzzleFlash, impact, explosionFx, throwGrenade, updateGrenades,
    step,
    clear() {
      for (const g of grenades) scene.remove(g.mesh);
      grenades.length = 0;
    },
  };
}
