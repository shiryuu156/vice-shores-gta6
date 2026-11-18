// Vice Shores — traffic and pedestrians. Traffic cars drive the road grid in
// lanes, turning at intersections; pedestrians stroll the sidewalks and flee
// from gunfire. Both are simple state machines, cheap enough to run dozens of.

import * as THREE from 'three';
import { ROAD_WIDTH, clamp, pick, range } from './config.js';

const PED_SHIRTS = [0xd94f4f, 0x4f7fd9, 0x6ab04f, 0xd9a04f, 0x9b59b6, 0xdddddd, 0x333333, 0x2e8b8b];

function buildPedestrianMesh(rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, PED_SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, [0xd9a066, 0x8a5a30, 0xe8b88a, 0x6b4423]) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b2b33 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.3), shirt);
  torso.position.y = 1.0;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.3), skin);
  head.position.y = 1.52;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.6, 0.17), pants);
  legL.position.set(-0.14, 0.32, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.13), shirt);
  armL.position.set(-0.36, 1.0, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.36;
  group.add(armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

export function createTraffic(scene, world, vehicles, rng) {
  const peds = [];
  const trafficCars = [];
  const centres = world.centres;

  // --- traffic cars ---------------------------------------------------------
  function spawnTrafficCar() {
    const alongX = rng() < 0.5;
    const road = pick(rng, centres);
    const dir = rng() < 0.5 ? 1 : -1;
    const lane = ROAD_WIDTH / 4; // right-hand lane
    let x, z, yaw;
    if (alongX) {
      x = range(rng, -140, 140);
      z = road + lane * dir;
      yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = road - lane * dir;
      z = range(rng, -140, 140);
      yaw = dir > 0 ? 0 : Math.PI;
    }
    const car = vehicles.spawnCar(vehicles.randomModel(), x, z, yaw, false, 'traffic');
    car.cruise = range(rng, 9, 15);
    car.alongX = alongX;
    car.dir = dir;
    car.stopped = 0;
    trafficCars.push(car);
    return car;
  }

  function updateTrafficCar(car, dt, playerPos) {
    // stop briefly for the car ahead, like real traffic
    let blocked = false;
    for (const other of trafficCars) {
      if (other === car) continue;
      const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
      const ahead = car.alongX ? dx * car.dir : dz * car.dir;
      const lateral = car.alongX ? Math.abs(dz) : Math.abs(dx);
      if (ahead > 0 && ahead < 7 && lateral < 2.5) { blocked = true; break; }
    }
    // and for the player standing in the road
    if (playerPos) {
      const dx = playerPos.x - car.pos.x, dz = playerPos.z - car.pos.z;
      const ahead = car.alongX ? dx * car.dir : dz * car.dir;
      const lateral = car.alongX ? Math.abs(dz) : Math.abs(dx);
      if (ahead > 0 && ahead < 6 && lateral < 2) blocked = true;
    }
    const target = blocked ? 0 : car.cruise;
    car.speed += (target - car.speed) * Math.min(1, 2 * dt);
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    car.pos.x += fx * car.speed * dt;
    car.pos.z += fz * car.speed * dt;
    car.mesh.rotation.y = car.yaw;

    // at an intersection, sometimes turn; at the city edge, turn around
    const nearCentre = (v) => {
      for (const c of centres) if (Math.abs(v - c) < 1.2) return c;
      return null;
    };
    const edge = 150;
    let turned = false;
    if (car.alongX) {
      const c = nearCentre(car.pos.x);
      if (c !== null && rng() < 0.02) {
        car.alongX = false;
        car.dir = rng() < 0.5 ? 1 : -1;
        car.yaw = car.dir > 0 ? 0 : Math.PI;
        car.pos.z = c - (ROAD_WIDTH / 4) * car.dir;
        turned = true;
      } else if (Math.abs(car.pos.x) > edge) {
        car.dir *= -1;
        car.yaw = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.pos.z += car.dir > 0 ? ROAD_WIDTH / 2 : -ROAD_WIDTH / 2;
        turned = true;
      }
    } else {
      const c = nearCentre(car.pos.z);
      if (c !== null && rng() < 0.02) {
        car.alongX = true;
        car.dir = rng() < 0.5 ? 1 : -1;
        car.yaw = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.pos.x = c + (ROAD_WIDTH / 4) * car.dir;
        turned = true;
      } else if (Math.abs(car.pos.z) > edge) {
        car.dir *= -1;
        car.yaw = car.dir > 0 ? 0 : Math.PI;
        car.pos.x -= car.dir > 0 ? ROAD_WIDTH / 2 : -ROAD_WIDTH / 2;
        turned = true;
      }
    }
    if (turned) car.speed *= 0.6;
  }

  // --- pedestrians ----------------------------------------------------------
  function spawnPedestrian(x, z) {
    const mesh = buildPedestrianMesh(rng);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const ped = {
      mesh,
      pos: mesh.position,
      yaw: range(rng, 0, Math.PI * 2),
      speed: range(rng, 1.2, 2.2),
      alongX: rng() < 0.5,
      dir: rng() < 0.5 ? 1 : -1,
      road: pick(rng, centres),
      fleeing: 0,
      fleeFrom: null,
      walkPhase: range(rng, 0, 6),
      alive: true,
      isCop: false,
    };
    peds.push(ped);
    return ped;
  }

  function spawnPedestrianNear(x, z, radius) {
    // find a sidewalk near (x, z): offset from the nearest road centreline
    const near = world.nearestRoadPoint(x, z);
    let px, pz;
    const off = ROAD_WIDTH / 2 + 2;
    if (near.axis === 'x') {
      px = near.c + (rng() < 0.5 ? -off : off);
      pz = clamp(z + range(rng, -radius, radius), -150, 150);
    } else {
      pz = near.c + (rng() < 0.5 ? -off : off);
      px = clamp(x + range(rng, -radius, radius), -150, 150);
    }
    return spawnPedestrian(px, pz);
  }

  function updatePedestrian(ped, dt, gunfireAt) {
    if (!ped.alive) return;
    if (gunfireAt && ped.fleeing <= 0) {
      const d = Math.hypot(ped.pos.x - gunfireAt.x, ped.pos.z - gunfireAt.z);
      if (d < 30) {
        ped.fleeing = range(rng, 3, 6);
        ped.fleeFrom = { x: gunfireAt.x, z: gunfireAt.z };
      }
    }
    if (ped.fleeing > 0) {
      ped.fleeing -= dt;
      const dx = ped.pos.x - ped.fleeFrom.x, dz = ped.pos.z - ped.fleeFrom.z;
      const len = Math.hypot(dx, dz) || 1;
      ped.yaw = Math.atan2(dx / len, dz / len);
      const sp = 5.5;
      ped.pos.x += Math.sin(ped.yaw) * sp * dt;
      ped.pos.z += Math.cos(ped.yaw) * sp * dt;
    } else {
      // stroll along the sidewalk, turn at intersections and edges
      const sp = ped.speed;
      ped.pos.x += Math.sin(ped.yaw) * sp * dt;
      ped.pos.z += Math.cos(ped.yaw) * sp * dt;
      if (Math.abs(ped.pos.x) > 152 || Math.abs(ped.pos.z) > 152 || rng() < 0.002) {
        ped.yaw = range(rng, 0, Math.PI * 2);
      }
    }
    ped.pos.x = clamp(ped.pos.x, -155, 155);
    ped.pos.z = clamp(ped.pos.z, -155, 155);
    ped.walkPhase += dt * (ped.fleeing > 0 ? 11 : 5);
    const swing = Math.sin(ped.walkPhase) * 0.5;
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    ped.mesh.userData.armL.rotation.x = -swing * 0.7;
    ped.mesh.userData.armR.rotation.x = swing * 0.7;
    ped.mesh.position.copy(ped.pos);
    ped.mesh.rotation.y = ped.yaw;
  }

  function removePedestrian(ped) {
    ped.alive = false;
    scene.remove(ped.mesh);
    const i = peds.indexOf(ped);
    if (i >= 0) peds.splice(i, 1);
  }

  function seedCity() {
    // parked cars along the roads
    for (let i = 0; i < 14; i++) {
      const road = pick(rng, centres);
      const along = range(rng, -130, 130);
      const side = rng() < 0.5 ? -1 : 1;
      const alongX = rng() < 0.5;
      const x = alongX ? along : road + side * (ROAD_WIDTH / 2 - 1.6);
      const z = alongX ? road + side * (ROAD_WIDTH / 2 - 1.6) : along;
      const yaw = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
      vehicles.spawnCar(vehicles.randomModel(), x, z, yaw, false, null);
    }
    for (let i = 0; i < 10; i++) spawnTrafficCar();
    for (let i = 0; i < 18; i++) {
      const p = world.randomRoadPoint(rng, 30);
      spawnPedestrianNear(p.x, p.z, 12);
    }
  }

  function update(dt, playerPos, gunfireAt) {
    for (const car of [...trafficCars]) updateTrafficCar(car, dt, playerPos);
    for (const ped of [...peds]) updatePedestrian(ped, dt, gunfireAt);
    // keep the streets populated near the player
    if (trafficCars.length < 10 && rng() < 0.02) spawnTrafficCar();
    if (peds.length < 18 && rng() < 0.02) spawnPedestrianNear(playerPos.x, playerPos.z, 40);
  }

  return { peds, trafficCars, spawnTrafficCar, spawnPedestrian, spawnPedestrianNear, removePedestrian, seedCity, update };
}
