// Vice Shores — vehicles. Cars are built from boxes (body, cabin, wheels,
// lights) in six models with distinct colours, sizes and handling. The physics
// is arcade: forward speed, steering that tightens with speed, a handbrake
// that slides the tail, and a hard stop plus a thud on building impact.
// Parked cars and traffic cars are the same objects; jacking one just changes
// who drives it.

import * as THREE from 'three';
import { CAR_MODELS, POLICE_CAR, clamp, lerp } from './config.js';

function buildCarMesh(model, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: model.color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2836 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xc8ccd2 });

  const len = model.body === 'van' ? 5.2 : model.body === 'pickup' ? 4.9 : 4.4;
  const wid = 1.9;
  const bodyH = model.body === 'van' ? 1.5 : 0.62;
  const bodyY = model.body === 'van' ? 1.05 : 0.62;

  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), paint);
  body.position.y = bodyY;
  body.castShadow = true;
  group.add(body);

  if (model.body === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.2, 0.5, 1.6), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bed.position.set(0, 1.05, -1.3);
    group.add(bed);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.2, 0.62, 1.5), glass);
    cab.position.set(0, 1.2, 0.8);
    group.add(cab);
  } else {
    const cabLen = model.body === 'van' ? 3.6 : 2.2;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.24, 0.58, cabLen), glass);
    cab.position.set(0, bodyY + bodyH / 2 + 0.24, model.body === 'van' ? -0.3 : -0.2);
    cab.castShadow = true;
    group.add(cab);
  }

  // headlights and taillights
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xffe680, emissiveIntensity: 0.7 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0xcc2222, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    hl.position.set(s * 0.62, 0.68, len / 2 + 0.02);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tl.position.set(s * 0.62, 0.68, -len / 2 - 0.02);
    group.add(tl);
  }

  if (model.body === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    sign.position.set(0, 1.62, -0.2);
    group.add(sign);
    const signTop = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: 0xffe680, emissive: 0xcc9900, emissiveIntensity: 0.8 }));
    signTop.position.set(0, 1.74, -0.2);
    group.add(signTop);
  }

  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.62, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.42), new THREE.MeshLambertMaterial({ color: 0xcc1111, emissive: 0xff2222, emissiveIntensity: 1 }));
    red.position.set(-0.28, 1.72, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.42), new THREE.MeshLambertMaterial({ color: 0x1111cc, emissive: 0x2222ff, emissiveIntensity: 1 }));
    blue.position.set(0.28, 1.72, -0.2);
    group.add(blue);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.02, 0.2, len * 0.7), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.62;
    group.add(stripe);
  }

  // wheels, kept to spin with speed
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.85, len / 2 - 0.85], [0.85, len / 2 - 0.85], [-0.85, -len / 2 + 0.85], [0.85, -len / 2 + 0.85]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.28, 8);
  hubGeo.rotateZ(Math.PI / 2);
  for (const w of wheels) {
    const hub = new THREE.Mesh(hubGeo, chrome);
    hub.position.copy(w.position);
    group.add(hub);
  }

  group.userData = { length: len, width: wid, wheels };
  return group;
}

export function createVehicles(scene, rng) {
  const cars = [];
  let idCounter = 0;

  function spawnCar(model, x, z, yaw, isPolice = false, driver = null) {
    const mesh = buildCarMesh(model, isPolice);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = yaw;
    scene.add(mesh);
    const car = {
      id: idCounter++,
      model,
      mesh,
      pos: mesh.position,
      yaw,
      speed: 0,
      steer: 0,
      isPolice,
      driver, // null = parked, 'player' | 'traffic' | 'police' | 'ped'
      stolen: false,
      brakeLight: false,
    };
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  // Arcade drive: throttle, steering that scales with speed, handbrake slide.
  function drive(car, dt, throttle, steerInput, handbrake, world) {
    const m = car.model;
    const top = m.topSpeed;
    if (throttle > 0) car.speed += m.accel * throttle * dt * (1 - car.speed / (top * 1.15));
    else if (throttle < 0) car.speed += m.accel * 1.4 * throttle * dt; // reverse / brake
    else car.speed = lerp(car.speed, 0, Math.min(1, 1.2 * dt));
    if (handbrake) car.speed = lerp(car.speed, 0, Math.min(1, 4 * dt));
    car.speed = clamp(car.speed, -top * 0.45, top);
    // drag
    car.speed -= car.speed * 0.12 * dt;

    const steerTarget = steerInput * m.steer * clamp(Math.abs(car.speed) / 8, 0.25, 1);
    car.steer = lerp(car.steer, steerTarget, Math.min(1, 8 * dt));
    const turn = car.steer * (car.speed / top) * dt * (handbrake ? 1.6 : 1);
    car.yaw += car.speed >= 0 ? turn : -turn;

    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const nx = car.pos.x + fx * car.speed * dt;
    const nz = car.pos.z + fz * car.speed * dt;
    const before = { x: car.pos.x, z: car.pos.z };
    car.pos.x = nx;
    car.pos.z = nz;
    const hit = world.resolveCollision(car.pos, 1.35);
    if (hit) {
      // a crash: lose most speed, keep the car outside the building
      if (Math.abs(car.speed) > 6) car.speed *= -0.25;
      else car.speed *= 0.4;
      car.pos.x = before.x; car.pos.z = before.z;
      world.resolveCollision(car.pos, 1.35);
    }
    // city bounds
    car.pos.x = clamp(car.pos.x, -158, 158);
    car.pos.z = clamp(car.pos.z, -158, 158);

    car.mesh.rotation.y = car.yaw;
    for (const w of car.mesh.userData.wheels) w.rotation.x += (car.speed * dt) / 0.36;
    return hit && Math.abs(car.speed) > 3;
  }

  function nearestCar(x, z, maxDist, exclude = null) {
    let best = null, bestD = maxDist;
    for (const car of cars) {
      if (car === exclude) continue;
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function randomModel() {
    return CAR_MODELS[Math.floor(rng() * CAR_MODELS.length)];
  }

  return { cars, spawnCar, removeCar, drive, nearestCar, randomModel, POLICE_CAR };
}
