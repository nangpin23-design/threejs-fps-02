// Player movement: acceleration-based WASD with crouch, jump and collision
// against the map's AABB colliders and the ground-height function. Speed
// falls while crouched, in the air, and while firing on the move — stopping
// to aim pays, because the weapon spread reads this speed.
import * as THREE from 'three';

const RADIUS = 0.42;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.08;
const WALK_SPEED = 5.3;
const CROUCH_SPEED = 2.6;
const AIR_SPEED = 3.4;
const ACCEL = 42;
const FRICTION = 10;
const GRAVITY = 22;
const JUMP_SPEED = 7.2;

export function createPlayer(world) {
  const state = {
    position: new THREE.Vector3(0, 0, 21),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    crouched: false,
    onGround: true,
    eye: EYE_STAND,
    recoilPitch: 0,
    recoilYaw: 0,
  };
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wish = new THREE.Vector3();

  function collideAxis(axis) {
    const p = state.position;
    for (const c of world.colliders) {
      if (p.x + RADIUS <= c.minX || p.x - RADIUS >= c.maxX || p.z + RADIUS <= c.minZ || p.z - RADIUS >= c.maxZ) continue;
      if (p.y >= c.top - 0.05) continue; // standing on top of it
      if (c.top - p.y < 0.55) continue; // low enough to step over
      if (axis === 'x') {
        p.x = state.velocity.x > 0 ? c.minX - RADIUS : c.maxX + RADIUS;
        state.velocity.x = 0;
      } else {
        p.z = state.velocity.z > 0 ? c.minZ - RADIUS : c.maxZ + RADIUS;
        state.velocity.z = 0;
      }
    }
  }
  function clampBounds() {
    const p = state.position;
    p.x = Math.max(-31.6, Math.min(31.6, p.x));
    p.z = Math.max(-23.6, Math.min(23.6, p.z));
  }

  return {
    state,
    spawn(pos, yaw) {
      state.position.copy(pos);
      state.velocity.set(0, 0, 0);
      state.yaw = yaw;
      state.pitch = 0;
      state.crouched = false;
      state.recoilPitch = 0;
      state.recoilYaw = 0;
    },
    look(dx, dy) {
      state.yaw -= dx * 0.0022;
      state.pitch -= dy * 0.0022;
      state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch));
    },
    recoil(pitch, yaw) {
      state.recoilPitch += pitch;
      state.recoilYaw += yaw;
    },
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    isMoving() {
      return this.groundSpeed() > 0.5;
    },
    step(dt, keys, firing) {
      const p = state.position;
      const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
      state.crouched = wantCrouch;
      state.eye += ((wantCrouch ? EYE_CROUCH : EYE_STAND) - state.eye) * Math.min(1, dt * 12);
      state.recoilPitch *= Math.max(0, 1 - dt * 7);
      state.recoilYaw *= Math.max(0, 1 - dt * 7);

      forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
      right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
      wish.set(0, 0, 0);
      if (keys.has('KeyW')) wish.add(forward);
      if (keys.has('KeyS')) wish.sub(forward);
      if (keys.has('KeyD')) wish.add(right);
      if (keys.has('KeyA')) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize();

      const maxSpeed = !state.onGround ? AIR_SPEED : state.crouched ? CROUCH_SPEED : WALK_SPEED;
      const speedPenalty = firing ? 0.72 : 1;
      const target = wish.multiplyScalar(maxSpeed * speedPenalty);
      const accel = state.onGround ? ACCEL : ACCEL * 0.35;
      state.velocity.x += (target.x - state.velocity.x) * Math.min(1, accel * dt / Math.max(1, Math.abs(target.x - state.velocity.x) + 4));
      state.velocity.z += (target.z - state.velocity.z) * Math.min(1, accel * dt / Math.max(1, Math.abs(target.z - state.velocity.z) + 4));
      if (wish.lengthSq() === 0 && state.onGround) {
        const f = Math.max(0, 1 - FRICTION * dt);
        state.velocity.x *= f;
        state.velocity.z *= f;
      }
      if (keys.has('Space') && state.onGround) {
        state.velocity.y = JUMP_SPEED;
        state.onGround = false;
      }
      state.velocity.y -= GRAVITY * dt;
      p.x += state.velocity.x * dt;
      collideAxis('x');
      p.z += state.velocity.z * dt;
      collideAxis('z');
      p.y += state.velocity.y * dt;
      const ground = world.groundHeight(p.x, p.z);
      if (p.y <= ground) {
        p.y = ground;
        state.velocity.y = 0;
        state.onGround = true;
      } else if (p.y > ground + 0.02) {
        state.onGround = false;
      }
      clampBounds();
    },
  };
}
