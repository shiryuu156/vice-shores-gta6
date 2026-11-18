// Vice Shores — combat. A hitscan pistol with a visible tracer and muzzle
// flash, a magazine with a reload, and a punch for up close. Shots check the
// nearest pedestrian, cop or car along the aim ray; hurting a civilian or a
// cop is a crime and raises the wanted level. Guards from the shootout
// mission are tougher and shoot back.

import * as THREE from 'three';
import { COMBAT } from './config.js';

export function createCombat(scene, rng) {
  const state = {
    ammo: COMBAT.magSize,
    reserve: Infinity,
    reloading: 0,
    cooldown: 0,
    lastShotAt: null,
  };

  // a pooled tracer: one thin glowing box, stretched between muzzle and hit
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0.9 });
  const tracer = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1), tracerMat);
  tracer.visible = false;
  scene.add(tracer);
  let tracerTimer = 0;

  const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), flashMat);
  flash.visible = false;
  scene.add(flash);

  const guards = []; // mission shooters: { mesh, pos, health, cooldown, alive }

  function spawnGuard(x, z) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: 0x5a2e2e });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.66, 0.32), shirt);
    torso.position.y = 1.02;
    torso.castShadow = true;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
    head.position.y = 1.56;
    group.add(head);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.35, 0.85, 0.2);
    group.add(gun);
    group.position.set(x, 0, z);
    scene.add(group);
    const guard = { mesh: group, pos: group.position, health: 100, cooldown: 0, alive: true };
    guards.push(guard);
    return guard;
  }

  function removeGuard(guard) {
    guard.alive = false;
    scene.remove(guard.mesh);
    const i = guards.indexOf(guard);
    if (i >= 0) guards.splice(i, 1);
  }

  function clearGuards() {
    for (const g of [...guards]) removeGuard(g);
  }

  function muzzleWorldPos(playerPos, playerYaw, cameraYaw) {
    // the pistol sits at the player's right hand, aimed where the camera looks
    const dir = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const muzzle = playerPos.clone().add(dir.clone().multiplyScalar(0.8));
    muzzle.y = 1.35;
    return { muzzle, dir };
  }

  function showTracer(from, to) {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    tracer.position.copy(mid);
    tracer.scale.set(1, 1, Math.max(0.1, len));
    tracer.lookAt(to);
    tracer.visible = true;
    tracerTimer = 0.06;
  }

  function showFlash(pos) {
    flash.position.copy(pos);
    flash.visible = true;
    flashMat.opacity = 1;
  }

  // Fire one shot. Returns an event object the main loop turns into sound,
  // wanted stars and floating feedback: { hit: 'ped'|'cop'|'guard'|'car'|null }.
  function shoot(playerPos, cameraYaw, targets, onCrime) {
    if (state.cooldown > 0 || state.reloading > 0) return null;
    if (state.ammo <= 0) {
      startReload();
      return null;
    }
    state.cooldown = COMBAT.fireInterval;
    state.ammo -= 1;
    const { muzzle, dir } = muzzleWorldPos(playerPos, 0, cameraYaw);
    showFlash(muzzle.clone().add(dir.clone().multiplyScalar(0.5)));

    // find the closest target within a narrow cone of the aim ray
    let best = null, bestDist = COMBAT.shotRange;
    const end = muzzle.clone().add(dir.clone().multiplyScalar(COMBAT.shotRange));
    for (const t of targets) {
      if (!t.alive) continue;
      const to = new THREE.Vector3(t.pos.x - muzzle.x, 1.2 - muzzle.y, t.pos.z - muzzle.z);
      const along = to.dot(dir);
      if (along < 0.5 || along > bestDist) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 1.4) { best = t; bestDist = along; }
    }
    let hit = null;
    if (best) {
      const hitPoint = muzzle.clone().add(dir.clone().multiplyScalar(bestDist));
      showTracer(muzzle, hitPoint);
      best.health -= COMBAT.shotDamage;
      hit = best.kind;
      if (best.health <= 0) {
        hit = `${best.kind}-down`;
        if (best.kind === 'ped' || best.kind === 'cop') best.died = true;
        if (best.kind === 'guard') best.died = true;
      }
      if (best.kind === 'ped' || best.kind === 'cop') onCrime?.(best.kind === 'cop' ? 2 : 1);
    } else {
      showTracer(muzzle, end);
    }
    state.lastShotAt = { x: playerPos.x, z: playerPos.z };
    return { hit, target: best };
  }

  function startReload() {
    if (state.reloading > 0 || state.ammo === COMBAT.magSize) return;
    state.reloading = COMBAT.reloadSeconds;
  }

  // A punch: short range, no ammo, no noise — but a crime all the same.
  function punch(playerPos, playerYaw, targets, onCrime) {
    const fx = Math.sin(playerYaw), fz = Math.cos(playerYaw);
    for (const t of targets) {
      if (!t.alive) continue;
      const dx = t.pos.x - playerPos.x, dz = t.pos.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > COMBAT.punchRange) continue;
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < 0.5) continue;
      t.health -= COMBAT.punchDamage;
      if (t.health <= 0) t.died = true;
      if (t.kind === 'ped' || t.kind === 'cop') onCrime?.(1);
      return { hit: t.kind, target: t };
    }
    return { hit: null };
  }

  // Guards shoot back when the player is in range and in front of them.
  function updateGuards(dt, playerPos, onPlayerHit) {
    for (const g of [...guards]) {
      if (!g.alive) continue;
      const dx = playerPos.x - g.pos.x, dz = playerPos.z - g.pos.z;
      const dist = Math.hypot(dx, dz);
      g.cooldown -= dt;
      g.mesh.rotation.y = Math.atan2(dx, dz);
      if (dist < 35 && g.cooldown <= 0) {
        g.cooldown = 1.1 + rng() * 0.6;
        // a guard's shot: a tracer from the guard toward the player
        const from = g.pos.clone(); from.y = 1.3;
        const to = playerPos.clone(); to.y = 1.2;
        showTracer(from, to);
        if (dist < 28 && rng() < 0.55) onPlayerHit?.(8 + Math.floor(rng() * 10));
      }
    }
  }

  function update(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) {
        state.ammo = COMBAT.magSize;
        state.reloading = 0;
      }
    }
    if (tracerTimer > 0) {
      tracerTimer -= dt;
      if (tracerTimer <= 0) tracer.visible = false;
    }
    if (flash.visible) {
      flashMat.opacity -= dt * 12;
      if (flashMat.opacity <= 0) flash.visible = false;
    }
  }

  return {
    state, guards,
    shoot, punch, startReload, spawnGuard, removeGuard, clearGuards,
    updateGuards, update,
  };
}
