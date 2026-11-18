// Vice Shores — the wanted system and the VCPD. Crimes raise stars; police
// cars spawn on the roads and chase the player, ramming the car or, on foot,
// closing in to make an arrest. Stars fade when the player stays out of sight
// and out of trouble. Getting busted or wasted ends the run — for now.

import * as THREE from 'three';
import { WANTED, clamp } from './config.js';

export function createPolice(scene, world, vehicles, traffic, rng) {
  const state = {
    stars: 0,
    quietTimer: 0, // seconds since the last crime
    bustTimer: 0, // seconds a cop has been touching the player
    policeCars: [],
    footCops: [],
  };

  function addCrime(stars, reason) {
    if (stars <= 0) return;
    state.stars = clamp(state.stars + stars, 0, WANTED.maxStars);
    state.quietTimer = 0;
    return reason;
  }

  function spawnPoliceCar(playerPos) {
    // spawn on a road, 45-70 m from the player, facing roughly toward them
    const p = world.randomRoadPoint(rng, 40);
    let x = p.x, z = p.z;
    const dx = playerPos.x - x, dz = playerPos.z - z;
    const d = Math.hypot(dx, dz);
    if (d < 45) {
      x = playerPos.x - (dx / d) * 55;
      z = playerPos.z - (dz / d) * 55;
    }
    const yaw = Math.atan2(playerPos.x - x, playerPos.z - z);
    const car = vehicles.spawnCar(vehicles.POLICE_CAR, x, z, yaw, true, 'police');
    car.cruise = 30;
    state.policeCars.push(car);
    return car;
  }

  function spawnFootCop(playerPos) {
    const ped = traffic.spawnPedestrianNear(playerPos.x, playerPos.z, 35);
    ped.isCop = true;
    // navy uniform: recolour the shirt
    ped.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x1c2f4a });
    ped.mesh.children[0].material.needsUpdate = true;
    state.footCops.push(ped);
    return ped;
  }

  function nearestPoliceDistance(playerPos) {
    let best = Infinity;
    for (const car of state.policeCars) best = Math.min(best, Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z));
    for (const cop of state.footCops) best = Math.min(best, Math.hypot(cop.pos.x - playerPos.x, cop.pos.z - playerPos.z));
    return best;
  }

  function update(dt, playerPos, playerCar, playerSpeed, onFoot) {
    // --- maintain the force for the current star level ----------------------
    const wantCars = WANTED.policeCars[state.stars] ?? 0;
    const wantCops = WANTED.footCops[state.stars] ?? 0;
    while (state.policeCars.length < wantCars) spawnPoliceCar(playerPos);
    while (state.footCops.length < wantCops) spawnFootCop(playerPos);
    while (state.policeCars.length > wantCars) {
      const car = state.policeCars.pop();
      vehicles.removeCar(car);
    }
    while (state.footCops.length > wantCops) {
      const cop = state.footCops.pop();
      traffic.removePedestrian(cop);
    }

    // --- police cars chase --------------------------------------------------
    for (const car of state.policeCars) {
      const dx = playerPos.x - car.pos.x, dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const targetYaw = Math.atan2(dx, dz);
      let dyaw = targetYaw - car.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const steer = clamp(dyaw * 1.2, -1, 1);
      // ram: full throttle when lined up, brake when very close on foot
      const throttle = dist < 3 && onFoot ? -0.5 : 1;
      vehicles.drive(car, dt, throttle, steer, false, world);
      // ramming the player's car damages it (handled by main via speed loss)
      if (playerCar && dist < 3.2 && Math.abs(car.speed) > 4) {
        playerCar.speed *= 0.92;
      }
    }

    // --- foot cops close in ---------------------------------------------------
    for (const cop of state.footCops) {
      const dx = playerPos.x - cop.pos.x, dz = playerPos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      cop.yaw = Math.atan2(dx, dz);
      const sp = dist < 12 ? 6.5 : 4.5; // sprint when close
      cop.pos.x += Math.sin(cop.yaw) * sp * dt;
      cop.pos.z += Math.cos(cop.yaw) * sp * dt;
      cop.walkPhase += dt * 10;
      const swing = Math.sin(cop.walkPhase) * 0.6;
      cop.mesh.userData.legL.rotation.x = swing;
      cop.mesh.userData.legR.rotation.x = -swing;
      cop.mesh.position.copy(cop.pos);
      cop.mesh.rotation.y = cop.yaw;
      // touching the player starts the bust clock
      if (dist < 1.6 && onFoot) state.bustTimer += dt;
    }
    if (state.bustTimer > 0 && nearestPoliceDistance(playerPos) > 2.2) state.bustTimer = 0;

    // --- wanted decay --------------------------------------------------------
    if (state.stars > 0) {
      state.quietTimer += dt;
      const nearest = nearestPoliceDistance(playerPos);
      if (state.quietTimer > WANTED.decaySeconds && nearest > 55) {
        state.stars -= 1;
        state.quietTimer = 0;
      }
    }
  }

  function isBusted() {
    return state.bustTimer > 2.5;
  }

  function reset() {
    state.stars = 0;
    state.quietTimer = 0;
    state.bustTimer = 0;
    for (const car of state.policeCars) vehicles.removeCar(car);
    for (const cop of state.footCops) traffic.removePedestrian(cop);
    state.policeCars = [];
    state.footCops = [];
  }

  return { state, addCrime, update, isBusted, reset, nearestPoliceDistance };
}
