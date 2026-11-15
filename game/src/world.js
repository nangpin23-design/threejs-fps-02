// Sable Yard: a dusk freight terminal. Two plant sites (A east in the
// container yard, B west in the warehouse), a mid lane with a raised
// platform, and long east/west lanes. All geometry is procedural boxes and
// cylinders with canvas textures; colliders are axis-aligned boxes plus a
// ground-height function for the platform and its ramps.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeTextures } from './textures.js';

const WALL_H = 4;
const PLATFORM = { minX: -5, maxX: 5, minZ: -6, maxZ: 2, height: 2.4 };

export function createWorld(scene) {
  const tex = makeTextures();
  const colliders = []; // {minX,maxX,minZ,maxZ,top}
  const shootables = []; // meshes the raycaster tests for wall hits
  const group = new THREE.Group();
  scene.add(group);

  const matSand = new THREE.MeshStandardMaterial({ map: tex.get('sand'), roughness: 0.95 });
  const matConcrete = new THREE.MeshStandardMaterial({ map: tex.get('concrete'), roughness: 0.9 });
  const matMetal = new THREE.MeshStandardMaterial({ map: tex.get('metal'), roughness: 0.55, metalness: 0.5 });
  const matContainer = new THREE.MeshStandardMaterial({ map: tex.get('container'), roughness: 0.7, metalness: 0.25 });
  const matContainerTeal = new THREE.MeshStandardMaterial({ map: tex.get('containerTeal'), roughness: 0.7, metalness: 0.25 });
  const matHazard = new THREE.MeshStandardMaterial({ map: tex.get('hazard'), roughness: 0.8 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.6, metalness: 0.4 });
  const matRust = new THREE.MeshStandardMaterial({ color: 0x8a4a28, roughness: 0.8, metalness: 0.2 });
  const matGlowA = new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 0.9 });
  const matGlowB = new THREE.MeshStandardMaterial({ color: 0x2ec4b6, emissive: 0x2ec4b6, emissiveIntensity: 0.9 });

  function box(w, h, d, x, y, z, mat, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = true;
    mesh.userData.world = true;
    group.add(mesh);
    shootables.push(mesh);
    if (opts.solid !== false) {
      // A box rotated 90 degrees swaps its footprint on the ground.
      const rotated = opts.ry && Math.abs(Math.abs(opts.ry) - Math.PI / 2) < 0.01;
      const hw = rotated ? d / 2 : w / 2;
      const hd = rotated ? w / 2 : d / 2;
      colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, top: y + h / 2 });
    }
    return mesh;
  }
  function ground() {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), matSand);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.userData.world = true;
    group.add(mesh);
    shootables.push(mesh);
  }
  function crate(x, z, size = 1.2, mat = matMetal, y = null) {
    return box(size, size, size, x, y === null ? size / 2 : y, z, mat);
  }
  function container(x, z, ry, mat = matContainer) {
    const m = box(6, 2.6, 2.6, x, 1.3, z, mat, { ry });
    return m;
  }

  // --- ground, sky, lights -------------------------------------------------
  ground();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex.get('sky'), side: THREE.BackSide, fog: false }),
  );
  group.add(sky);
  const sun = new THREE.DirectionalLight(0xffb347, 2.6);
  sun.position.set(-30, 26, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  group.add(sun);
  group.add(new THREE.HemisphereLight(0x9a8ab0, 0x6a543c, 1.25));
  scene.fog = new THREE.Fog(0x3d4356, 26, 90);

  // --- perimeter walls ------------------------------------------------------
  box(66, WALL_H, 1, 0, WALL_H / 2, -24.5, matConcrete);
  box(66, WALL_H, 1, 0, WALL_H / 2, 24.5, matConcrete);
  box(1, WALL_H, 50, -32.5, WALL_H / 2, 0, matConcrete);
  box(1, WALL_H, 50, 32.5, WALL_H / 2, 0, matConcrete);

  // --- site A: container yard (east) ---------------------------------------
  container(24, -18, 0);
  container(26.5, -10.5, Math.PI / 2, matContainerTeal);
  container(18, -19, Math.PI / 2);
  crate(20, -13, 1.2);
  crate(21.2, -13, 1.2, matRust);
  crate(28, -15, 1.2);
  box(4, 1.1, 1, 24, 0.55, -8.5, matConcrete); // low wall, crouch cover
  box(1, 2.4, 6, 29.5, 1.2, -14, matMetal); // east screen

  // --- site B: warehouse (west) --------------------------------------------
  box(12, 4.5, 1, -24, 2.25, -20.5, matConcrete); // back wall
  box(1, 4.5, 12, -30.5, 2.25, -14, matConcrete); // west wall
  box(1, 4.5, 5, -17.5, 2.25, -20.5, matConcrete); // inner wall stub
  box(1, 4.5, 5, -17.5, 2.25, -7.5, matConcrete); // inner wall stub
  box(12, 1.2, 1, -24, 3.9, -7.5, matMetal); // lintel over the door
  container(-27, -11, 0, matContainerTeal);
  crate(-21, -16, 1.2);
  crate(-22.2, -16, 1.2, matRust);
  crate(-27, -17.5, 1.2);
  box(4, 1.1, 1, -24, 0.55, -11.5, matConcrete);

  // --- mid: raised platform with ramps --------------------------------------
  const plat = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 8), matConcrete);
  plat.position.set(0, 2.15, -2);
  plat.castShadow = true;
  plat.receiveShadow = true;
  plat.userData.world = true;
  group.add(plat);
  shootables.push(plat);
  colliders.push({ minX: -5, maxX: 5, minZ: -6, maxZ: 2, top: 2.4 });
  for (const [z0, dir] of [[2, 1], [-6, -1]]) {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 4.4), matMetal);
    ramp.position.set(0, 1.2, z0 + dir * 2.2);
    ramp.rotation.x = dir * 0.5;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    ramp.userData.world = true;
    group.add(ramp);
    shootables.push(ramp);
  }
  crate(3.2, -4.5, 1.2, matMetal, 2.4 + 0.6);
  crate(-3.2, -4.5, 1.2, matRust, 2.4 + 0.6);
  box(10, 0.25, 0.25, 0, 2.5, -6, matHazard, { solid: false });
  box(10, 0.25, 0.25, 0, 2.5, 2, matHazard, { solid: false });

  // --- mid plaza cover ------------------------------------------------------
  crate(2, 4, 1.2);
  crate(-2.5, 5.5, 1.2, matRust);
  crate(8, 2, 1.2);
  crate(-8, 0, 1.2);
  box(0.8, 3.2, 0.8, 6, 1.6, -8, matDark);
  box(0.8, 3.2, 0.8, -6, 1.6, -8, matDark);
  box(0.8, 3.2, 0.8, 12, 1.6, 6, matDark);
  box(0.8, 3.2, 0.8, -12, 1.6, 6, matDark);

  // --- lanes ----------------------------------------------------------------
  container(14, 14, Math.PI / 2);
  container(-14, 14, 0, matContainerTeal);
  crate(20, 8, 1.2);
  crate(-20, 8, 1.2, matRust);
  crate(28, 2, 1.2);
  crate(-28, 2, 1.2);
  box(1, 2.4, 6, 28.5, 1.2, 14, matMetal);
  box(1, 2.4, 6, -28.5, 1.2, 14, matMetal);

  // --- light poles -----------------------------------------------------------
  for (const [x, z] of [[-14, 12], [14, 12], [-14, -10], [14, -10], [0, -20]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 8), matDark);
    pole.position.set(x, 3, z);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd98a, emissiveIntensity: 1.6 }));
    lamp.position.set(x, 6, z);
    group.add(lamp);
    const light = new THREE.PointLight(0xffd98a, 18, 16, 1.8);
    light.position.set(x, 5.7, z);
    group.add(light);
  }

  // --- site rings and letters -------------------------------------------------
  function siteMarker(x, z, letter, mat) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.5, 40),
      new THREE.MeshBasicMaterial({ color: mat === matGlowA ? 0xf0a830 : 0x2ec4b6, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.06, z);
    group.add(ring);
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = mat === matGlowA ? '#f0a830' : '#2ec4b6';
    c.font = 'bold 96px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(letter, 64, 68);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    sprite.position.set(x, 3.4, z);
    sprite.scale.set(2.2, 2.2, 1);
    group.add(sprite);
  }
  siteMarker(24, -14, 'A', matGlowA);
  siteMarker(-24, -14, 'B', matGlowB);

  // --- barrels ----------------------------------------------------------------
  for (const [x, z] of [[6, -16], [-6, -16], [16, 18], [-16, 18], [30, -6], [-30, -6]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 12), matRust);
    barrel.position.set(x, 0.65, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    barrel.userData.world = true;
    group.add(barrel);
    shootables.push(barrel);
    colliders.push({ minX: x - 0.55, maxX: x + 0.55, minZ: z - 0.55, maxZ: z + 0.55, top: 1.3 });
  }

  function groundHeight(x, z) {
    if (x >= PLATFORM.minX && x <= PLATFORM.maxX) {
      if (z >= PLATFORM.minZ && z <= PLATFORM.maxZ) return PLATFORM.height;
      if (z > PLATFORM.maxZ && z < PLATFORM.maxZ + 4) return PLATFORM.height * (1 - (z - PLATFORM.maxZ) / 4);
      if (z < PLATFORM.minZ && z > PLATFORM.minZ - 4) return PLATFORM.height * (1 - (PLATFORM.minZ - z) / 4);
    }
    return 0;
  }

  const sites = {
    A: { name: 'A', pos: new THREE.Vector3(24, 0, -14), radius: 3.5 },
    B: { name: 'B', pos: new THREE.Vector3(-24, 0, -14), radius: 3.5 },
  };
  const spawns = {
    vanguard: [
      new THREE.Vector3(-6, 0, 21), new THREE.Vector3(-2, 0, 22), new THREE.Vector3(2, 0, 22),
      new THREE.Vector3(6, 0, 21), new THREE.Vector3(0, 0, 19),
    ],
    sentinel: [
      new THREE.Vector3(-6, 0, -21), new THREE.Vector3(-2, 0, -22), new THREE.Vector3(2, 0, -22),
      new THREE.Vector3(6, 0, -21), new THREE.Vector3(0, 0, -19),
    ],
  };

  // Waypoint graph: nodes on the walkable floor, edges between neighbours.
  const wp = (x, z) => new THREE.Vector3(x, 0, z);
  const waypoints = [
    wp(0, 20), wp(8, 18), wp(-8, 18), wp(0, 10), wp(10, 8), wp(-10, 8),
    wp(0, 2), wp(0, -2), wp(10, -2), wp(-10, -2), wp(20, 4), wp(26, -4),
    wp(24, -14), wp(16, -12), wp(-20, 4), wp(-26, -4), wp(-24, -14), wp(-16, -12),
    wp(0, -20), wp(8, -18), wp(-8, -18), wp(20, -18), wp(-20, -18), wp(0, -10),
    wp(14, -8), wp(-14, -8), wp(14, 10), wp(-14, 10), wp(24, 8), wp(-24, 8),
    wp(6, -14), wp(-6, -14),
  ];
  const E = (a, b) => [a, b];
  const edges = [
    E(0, 1), E(0, 2), E(0, 3), E(1, 26), E(2, 27), E(3, 4), E(3, 5), E(3, 6),
    E(4, 26), E(5, 27), E(6, 7), E(6, 8), E(6, 9), E(7, 8), E(7, 9), E(7, 23),
    E(8, 10), E(8, 24), E(9, 14), E(9, 25), E(10, 11), E(10, 28), E(11, 12),
    E(12, 13), E(12, 21), E(13, 24), E(13, 30), E(14, 15), E(14, 29), E(15, 16),
    E(16, 17), E(16, 22), E(17, 25), E(17, 31), E(18, 19), E(18, 20), E(18, 23),
    E(19, 21), E(20, 22), E(21, 24), E(22, 25), E(23, 24), E(23, 25), E(23, 30),
    E(23, 31), E(24, 30), E(25, 31), E(26, 28), E(27, 29), E(28, 10), E(29, 14),
    E(30, 13), E(31, 17),
  ];

  return { colliders, shootables, groundHeight, sites, spawns, waypoints, edges, group };
}
