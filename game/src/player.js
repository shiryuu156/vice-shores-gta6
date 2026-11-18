// Vice Shores — Rook on foot. A simple articulated box figure (torso, head,
// arms, legs) that walks, sprints, jumps and punches, with a third-person
// orbit camera that follows behind. The player owns the camera yaw/pitch and
// the aim direction the combat module uses.

import * as THREE from 'three';
import { PLAYER, clamp, lerp } from './config.js';

export function createPlayer(scene) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e4a6b });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b2b33 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), jacket);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), hair);
  hairTop.position.y = 1.82;
  group.add(hairTop);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), jacket);
  armL.position.set(-0.4, 1.05, 0);
  armL.castShadow = true;
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.2), pants);
  legL.position.set(-0.16, 0.38, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  // a pistol in the right hand, visible when armed
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.34), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.4, 0.78, 0.18);
  group.add(gun);

  scene.add(group);

  const state = {
    group,
    pos: new THREE.Vector3(0, 0, 20),
    vel: new THREE.Vector3(),
    yaw: Math.PI, // facing -z, down the avenue
    vy: 0,
    onGround: true,
    health: PLAYER.maxHealth,
    speed: 0,
    walkPhase: 0,
    punching: 0,
    armed: true,
  };

  function reset(x, z, yaw) {
    state.pos.set(x, 0, z);
    state.vel.set(0, 0, 0);
    state.yaw = yaw ?? Math.PI;
    state.vy = 0;
    state.onGround = true;
    state.health = PLAYER.maxHealth;
    state.punching = 0;
  }

  // Move with WASD relative to the camera yaw. Returns horizontal speed.
  function update(dt, axes, sprint, jump, cameraYaw, world) {
    const targetSpeed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    // forward is where the camera looks; strafe is perpendicular
    const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
    const rx = -fz, rz = fx;
    let mx = fx * axes.y + rx * axes.x;
    let mz = fz * axes.y + rz * axes.x;
    const mLen = Math.hypot(mx, mz);
    if (mLen > 0.01) {
      mx /= mLen; mz /= mLen;
      state.yaw = Math.atan2(mx, mz);
      state.vel.x = lerp(state.vel.x, mx * targetSpeed, Math.min(1, PLAYER.accel * dt / targetSpeed));
      state.vel.z = lerp(state.vel.z, mz * targetSpeed, Math.min(1, PLAYER.accel * dt / targetSpeed));
    } else {
      state.vel.x = lerp(state.vel.x, 0, Math.min(1, 12 * dt));
      state.vel.z = lerp(state.vel.z, 0, Math.min(1, 12 * dt));
    }
    state.pos.x += state.vel.x * dt;
    state.pos.z += state.vel.z * dt;
    // keep inside the city
    const lim = 155;
    state.pos.x = clamp(state.pos.x, -lim, lim);
    state.pos.z = clamp(state.pos.z, -lim, lim);
    world.resolveCollision(state.pos, PLAYER.radius);

    if (jump && state.onGround) {
      state.vy = PLAYER.jumpSpeed;
      state.onGround = false;
    }
    if (!state.onGround) {
      state.vy -= PLAYER.gravity * dt;
      state.pos.y += state.vy * dt;
      if (state.pos.y <= 0) {
        state.pos.y = 0;
        state.vy = 0;
        state.onGround = true;
      }
    }

    state.speed = Math.hypot(state.vel.x, state.vel.z);
    state.walkPhase += state.speed * dt * 1.6;
    const swing = state.speed > 0.5 ? Math.sin(state.walkPhase) * 0.55 : 0;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    if (state.punching > 0) {
      state.punching -= dt;
      armR.rotation.x = -1.6 * Math.sin((state.punching / 0.3) * Math.PI);
    } else {
      armR.rotation.x = swing * 0.8;
    }
    group.position.copy(state.pos);
    group.rotation.y = state.yaw;
    return state.speed;
  }

  function punch() {
    if (state.punching <= 0) state.punching = 0.3;
  }

  function damage(amount) {
    state.health = Math.max(0, state.health - amount);
    return state.health <= 0;
  }

  function heal(amount) {
    state.health = Math.min(PLAYER.maxHealth, state.health + amount);
  }

  return { state, group, reset, update, punch, damage, heal };
}
