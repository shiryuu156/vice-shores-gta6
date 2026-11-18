// Vice Shores — boot and the one loop. The game moves between four screens
// (title, play, paused, wasted/busted) and owns the glue the modules do not:
// the camera, entering and stealing cars, crimes and their wanted stars,
// the mission hooks, the waypoint arrow, saving, and the screenshot staging
// behind ?shot=. The simulation runs in fixed 1/60 s steps so a slow frame
// never changes what the game does.
//
// ?seed=N fixes the city. ?shot=start|street|chase|mission stages that scene
// and sets window.__shotReady once it has rendered, for the screenshots.

import * as THREE from 'three';
import { CAR_MODELS, MISSIONS, SAVE_KEY, clamp, createRng, lerp } from './config.js';
import { createAudio } from './audio.js';
import { ACTION_ENTER, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_RELOAD, ACTION_SHOOT, createInput } from './input.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRng(seed);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const audio = createAudio();
const input = createInput(canvas);
const world = createWorld(scene, seed);
const player = createPlayer(scene);
const vehicles = createVehicles(scene, rng);
const traffic = createTraffic(scene, world, vehicles, rng);
const police = createPolice(scene, world, vehicles, traffic, rng);
const missions = createMissions(scene, rng);
const combat = createCombat(scene, rng);
const hud = createHud();

// --- the shared game state --------------------------------------------------
const G = {
  state: 'title', // title | play | paused | wasted | busted
  cash: 150,
  carModels: CAR_MODELS,
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  cameraMode: 'orbit',
  currentCar: null,
  gunfireAt: null,
  gunfireTimer: 0,
  flashDamage: 0,
  orbitAngle: 0,
  chaseYaw: 0,
  saveTimer: 0,
  player, vehicles, traffic, police, missions, combat, world,
  enterCar, // hoisted below; the shot staging needs it to put Rook in a car
};

traffic.seedCity();
player.reset(0, 20, Math.PI);

// waypoint arrow: a gold cone floating over the player's head, pointing at
// the mission target so the player never has to read the minimap alone.
// The cone's tip is rotated to +Z, so one yaw aims it at the target.
const waypointArrow = new THREE.Mesh(
  new THREE.ConeGeometry(0.38, 1.1, 4),
  new THREE.MeshBasicMaterial({ color: 0xffd23f })
);
waypointArrow.geometry.rotateX(Math.PI / 2);
waypointArrow.visible = false;
scene.add(waypointArrow);

// idle mission marker: in free roam a yellow beacon marks the next unstarted
// job; walk up and press E to take it
const idleBeacon = new THREE.Group();
{
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 30;
  idleBeacon.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  idleBeacon.add(ring);
  idleBeacon.visible = false;
  scene.add(idleBeacon);
}

function nextMissionId() {
  for (const m of MISSIONS) if (!missions.state.completed[m.id]) return m.id;
  return null;
}

function missionStartSpot(id) {
  const def = MISSIONS[id];
  return missions.MISSION_SPOTS[def.stages[0]];
}

// --- cars: enter, steal, exit ------------------------------------------------
function enterCar(car) {
  if (G.currentCar) return;
  if (car.driver === 'traffic') {
    // jack it: the driver bails and runs
    const ped = traffic.spawnPedestrian(car.pos.x + 2, car.pos.z + 2);
    ped.fleeing = 5;
    ped.fleeFrom = { x: car.pos.x, z: car.pos.z };
    car.driver = 'player';
    commitCrime(1, 'Car stolen!');
  } else if (car.isPolice) {
    car.driver = 'player';
    commitCrime(2, 'You stole a police cruiser!');
  } else if (car.driver === null) {
    car.driver = 'player';
    commitCrime(1, 'Car stolen!');
  } else {
    return;
  }
  G.currentCar = car;
  car.stolen = true;
  player.group.visible = false;
  audio.pickup();
  G.chaseYaw = car.yaw;
}

function exitCar() {
  const car = G.currentCar;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  G.currentCar = null;
  const side = { x: car.pos.x - Math.cos(car.yaw) * 2, z: car.pos.z + Math.sin(car.yaw) * 2 };
  player.reset(side.x, side.z, car.yaw);
  player.group.visible = true;
  G.cameraYaw = car.yaw + Math.PI;
}

function commitCrime(stars, message) {
  police.addCrime(stars, message);
  if (message) missions.setMessage(message, 3);
}

// --- mission hooks ------------------------------------------------------------
function missionHooks() {
  return {
    onPickup() {
      audio.pickup();
      missions.setMessage('Package secured — now deliver it!', 4);
    },
    onShootoutStart(target) {
      const spots = [
        { x: target.x - 8, z: target.z - 6 },
        { x: target.x + 9, z: target.z - 4 },
        { x: target.x - 5, z: target.z + 9 },
        { x: target.x + 7, z: target.z + 8 },
      ];
      for (const s of spots) combat.spawnGuard(s.x, s.z);
      return spots.length;
    },
    onShootoutCleared() {
      audio.pickup();
      missions.setMessage('Crew down. Get to the getaway car!', 4);
    },
    onComplete() {
      audio.cash();
      saveGame();
    },
    onFail() {
      audio.fail();
      combat.clearGuards();
    },
  };
}

// --- save / load ---------------------------------------------------------------
function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash,
      debt: missions.state.debt,
      completed: missions.state.completed,
      x: player.state.pos.x,
      z: player.state.pos.z,
    }));
  } catch { /* storage can be off: the save then lasts this visit only */ }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applySave(save) {
  G.cash = save.cash ?? 150;
  missions.state.debt = save.debt ?? 40000;
  missions.state.completed = save.completed ?? [false, false, false];
  player.reset(save.x ?? 0, save.z ?? 20, Math.PI);
}

// --- screens -------------------------------------------------------------------
function setScreen(name) {
  G.state = name;
  hud.showScreen(name);
  if (name === 'title') {
    document.getElementById('btn-continue').classList.toggle('hidden', !loadSave());
  }
}

function startPlaying(missionId = null) {
  audio.ensure();
  setScreen('play');
  if (missionId !== null && missionId !== undefined) missions.startMission(missionId);
}

function respawn(afterBust) {
  police.reset();
  combat.clearGuards();
  missions.abort();
  if (afterBust) {
    G.cash = Math.max(0, G.cash - 200);
    missions.setMessage('Busted! The VCPD took a $200 fine.', 5);
  } else {
    missions.setMessage('Wasted! You wake up at St. Marina General.', 5);
  }
  player.reset(0, -100, Math.PI);
  player.group.visible = true;
  G.currentCar = null;
  setScreen('play');
}

document.getElementById('btn-roam').addEventListener('click', () => { audio.ensure(); audio.click(); startPlaying(); });
document.getElementById('btn-continue').addEventListener('click', () => {
  audio.ensure(); audio.click();
  const save = loadSave();
  if (save) applySave(save);
  startPlaying();
});
document.getElementById('btn-resume').addEventListener('click', () => { audio.click(); setScreen('play'); });
document.getElementById('btn-quit-title').addEventListener('click', () => { audio.click(); saveGame(); setScreen('title'); });
document.getElementById('btn-respawn').addEventListener('click', () => { audio.click(); respawn(false); });
document.getElementById('btn-busted-ok').addEventListener('click', () => { audio.click(); respawn(true); });
hud.buildMissionList((id) => { audio.ensure(); audio.click(); startPlaying(id); });

// first gesture anywhere wakes the audio context
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
window.addEventListener('keydown', () => audio.ensure(), { once: true });

// --- combat targets ------------------------------------------------------------
function combatTargets() {
  const out = [];
  for (const ped of traffic.peds) {
    out.push({ kind: 'ped', pos: ped.pos, alive: ped.alive, health: ped.health ?? 100, ref: ped });
  }
  for (const cop of police.state.footCops) {
    out.push({ kind: 'cop', pos: cop.pos, alive: cop.alive, health: cop.health ?? 100, ref: cop });
  }
  for (const g of combat.guards) {
    out.push({ kind: 'guard', pos: g.pos, alive: g.alive, health: g.health, ref: g });
  }
  return out;
}

function applyShotResult(result) {
  if (!result) return;
  audio.gunshot();
  G.gunfireAt = { x: player.state.pos.x, z: player.state.pos.z };
  G.gunfireTimer = 2;
  const t = result.target;
  if (t && t.died) {
    if (t.kind === 'ped') {
      traffic.removePedestrian(t.ref);
      missions.setMessage('A civilian is down — the VCPD saw that.', 3);
    } else if (t.kind === 'cop') {
      traffic.removePedestrian(t.ref);
      police.state.footCops = police.state.footCops.filter((c) => c !== t.ref);
      missions.setMessage('You shot a cop. That is five stars of trouble.', 3);
    } else if (t.kind === 'guard') {
      combat.removeGuard(t.ref);
      missions.guardDown();
      G.cash += 50;
      missions.setMessage('Guard down. +$50', 2);
    }
  }
}

// --- the fixed step --------------------------------------------------------------
function step(dt) {
  const actions = input.takeActions();
  const delta = input.takeMouseDelta();
  G.cameraYaw -= delta.x * 0.0032;
  G.cameraPitch = clamp(G.cameraPitch + delta.y * 0.0024, 0.05, 1.1);

  if (actions & ACTION_MUTE) {
    audio.setMuted(!audio.isMuted());
    missions.setMessage(audio.isMuted() ? 'Sound muted (M to unmute)' : 'Sound on', 2);
  }

  if (G.state === 'title') {
    G.orbitAngle += dt * 0.05;
    world.update(dt, performance.now() / 1000);
    traffic.update(dt, player.state.pos, null);
    return;
  }

  if (actions & ACTION_PAUSE) {
    if (G.state === 'play') setScreen('paused');
    else if (G.state === 'paused') setScreen('play');
  }
  if (G.state !== 'play') return;

  const axes = input.moveAxes();
  const playerPos = player.state.pos;
  const inCar = G.currentCar !== null;

  // --- on foot or driving -------------------------------------------------------
  if (inCar) {
    const car = G.currentCar;
    const throttle = axes.y;
    const steer = -axes.x;
    const handbrake = input.isDown('Space');
    vehicles.drive(car, dt, throttle, steer, handbrake, world);
    // the player's position follows the car, so police, missions and the
    // minimap all track the driver, not the empty spot he got in
    playerPos.copy(car.pos);
    // running over a pedestrian is a crime
    for (const ped of [...traffic.peds]) {
      if (!ped.alive || ped.isCop) continue;
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
      if (d < 1.8 && Math.abs(car.speed) > 3) {
        traffic.removePedestrian(ped);
        commitCrime(1, 'You hit a pedestrian!');
        audio.thud();
      }
    }
    if (actions & ACTION_ENTER) exitCar();
  } else {
    player.update(dt, axes, input.sprint(), input.isDown('Space'), G.cameraYaw, world);
    if (actions & ACTION_ENTER) {
      const near = vehicles.nearestCar(playerPos.x, playerPos.z, 4.5);
      if (near) enterCar(near);
      else {
        player.punch();
        audio.punch();
        const res = combat.punch(playerPos, player.state.yaw, combatTargets(), (s) => commitCrime(s, 'Assault! The VCPD saw that.'));
        if (res.target && res.target.died) {
          if (res.target.kind === 'ped') traffic.removePedestrian(res.target.ref);
          if (res.target.kind === 'cop') {
            traffic.removePedestrian(res.target.ref);
            police.state.footCops = police.state.footCops.filter((c) => c !== res.target.ref);
          }
        }
      }
    }
    if (actions & ACTION_SHOOT) {
      const res = combat.shoot(playerPos, G.cameraYaw, combatTargets(), (s) => commitCrime(s));
      applyShotResult(res);
    }
    if (actions & ACTION_RELOAD) combat.startReload();
    // interact: take the next job at its beacon
    if (actions & ACTION_INTERACT) {
      const id = nextMissionId();
      if (id !== null) {
        const spot = missionStartSpot(id);
        if (Math.hypot(playerPos.x - spot.x, playerPos.z - spot.z) < 8) {
          missions.startMission(id);
          audio.pickup();
        }
      }
    }
  }

  // --- systems ------------------------------------------------------------------
  if (G.gunfireTimer > 0) {
    G.gunfireTimer -= dt;
    if (G.gunfireTimer <= 0) G.gunfireAt = null;
  }
  traffic.update(dt, playerPos, G.gunfireAt);
  police.update(dt, playerPos, G.currentCar, G.currentCar ? G.currentCar.speed : player.state.speed, !inCar);
  combat.update(dt);
  combat.updateGuards(dt, playerPos, (dmg) => {
    if (player.damage(dmg)) {
      G.flashDamage = 1;
      setScreen('wasted');
      audio.fail();
    } else {
      G.flashDamage = Math.min(1, G.flashDamage + 0.35);
    }
  });
  world.update(dt, performance.now() / 1000);

  if (police.isBusted()) {
    setScreen('busted');
    audio.fail();
  }

  // --- missions -------------------------------------------------------------------
  const completedBefore = [...missions.state.completed];
  const missionResult = missions.update(dt, playerPos, G.currentCar, missionHooks());
  if (missionResult === 'complete') {
    const idx = missions.state.completed.findIndex((c, i) => c && !completedBefore[i]);
    if (idx >= 0) G.cash += MISSIONS[idx].reward;
  }

  // idle mission beacon in free roam
  const idleId = !missions.isActive() ? nextMissionId() : null;
  if (idleId !== null) {
    const spot = missionStartSpot(idleId);
    idleBeacon.visible = true;
    idleBeacon.position.set(spot.x, 0, spot.z);
    idleBeacon.rotation.y += dt * 0.8;
  } else {
    idleBeacon.visible = false;
  }

  // waypoint arrow over the player's head
  const target = missions.isActive() ? missions.state.active.target : null;
  if (target) {
    waypointArrow.visible = true;
    const dx = target.x - playerPos.x, dz = target.z - playerPos.z;
    waypointArrow.position.set(playerPos.x, 3.4 + Math.sin(performance.now() / 300) * 0.15, playerPos.z);
    waypointArrow.rotation.y = Math.atan2(dx, dz);
  } else {
    waypointArrow.visible = false;
  }

  // audio + damage fade + autosave
  audio.update(inCar ? Math.abs(G.currentCar.speed) : player.state.speed, police.state.stars);
  G.flashDamage = Math.max(0, G.flashDamage - dt * 1.4);
  G.saveTimer += dt;
  if (G.saveTimer > 15) {
    G.saveTimer = 0;
    saveGame();
  }
}

// --- camera ----------------------------------------------------------------------
function updateCamera(dt) {
  const playerPos = player.state.pos;
  if (G.state === 'title') {
    const a = G.orbitAngle;
    camera.position.set(Math.cos(a) * 95, 42, Math.sin(a) * 95);
    camera.lookAt(0, 8, 0);
    return;
  }
  if (G.currentCar) {
    const car = G.currentCar;
    // chase cam: ease the yaw toward the car's heading
    let dyaw = car.yaw - G.chaseYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    G.chaseYaw += dyaw * Math.min(1, 4 * dt);
    const back = 9.5, up = 3.6;
    const cx = car.pos.x - Math.sin(G.chaseYaw) * back;
    const cz = car.pos.z - Math.cos(G.chaseYaw) * back;
    camera.position.x = lerp(camera.position.x, cx, Math.min(1, 8 * dt));
    camera.position.y = lerp(camera.position.y, up, Math.min(1, 8 * dt));
    camera.position.z = lerp(camera.position.z, cz, Math.min(1, 8 * dt));
    camera.lookAt(car.pos.x + Math.sin(car.yaw) * 6, 1.4, car.pos.z + Math.cos(car.yaw) * 6);
    return;
  }
  // third-person orbit on foot
  const dist = 7.5;
  const cx = playerPos.x + Math.sin(G.cameraYaw) * Math.cos(G.cameraPitch) * dist;
  const cz = playerPos.z + Math.cos(G.cameraYaw) * Math.cos(G.cameraPitch) * dist;
  const cy = 1.6 + Math.sin(G.cameraPitch) * dist;
  camera.position.set(cx, cy, cz);
  camera.lookAt(playerPos.x, 1.5, playerPos.z);
}

// --- HUD snapshot ------------------------------------------------------------------
function renderHud() {
  const playerPos = player.state.pos;
  const snap = {
    health: Math.round(player.state.health),
    cash: G.cash,
    debt: missions.state.debt,
    stars: police.state.stars,
    ammo: combat.state.ammo,
    reloading: combat.state.reloading > 0,
    speed: G.currentCar ? G.currentCar.speed : 0,
    inCar: G.currentCar !== null,
    carName: G.currentCar ? G.currentCar.model.name : '',
    objective: missions.objectiveText(),
    timeLeft: missions.isActive() ? missions.state.active.timeLeft : null,
    message: missions.state.message,
    messageTimer: missions.state.messageTimer,
    flashDamage: G.flashDamage,
    completed: missions.state.completed,
    roadCentres: world.centres,
    player: { x: playerPos.x, z: playerPos.z, yaw: G.currentCar ? G.currentCar.yaw : player.state.yaw },
    police: [...police.state.policeCars.map((c) => ({ x: c.pos.x, z: c.pos.z })), ...police.state.footCops.map((c) => ({ x: c.pos.x, z: c.pos.z }))],
    traffic: traffic.trafficCars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
    missionTarget: missions.isActive() ? missions.state.active.target : null,
  };
  hud.render(snap);
}

// --- the loop ------------------------------------------------------------------------
let last = performance.now();
let accumulator = 0;
let framesRendered = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= STEP && steps < 8) {
    step(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 8) accumulator = 0;
  updateCamera(frameDt);
  renderer.render(scene, camera);
  if (G.state === 'play' || G.state === 'title') renderHud();
  framesRendered += 1;
  if (shot && framesRendered === 3) window.__shotReady = true;
}

// expose a little state for the headless playtest
window.__game = {
  get state() { return G.state; },
  get cash() { return G.cash; },
  get stars() { return police.state.stars; },
  get health() { return player.state.health; },
  get ammo() { return combat.state.ammo; },
  get inCar() { return G.currentCar !== null; },
  get speed() { return G.currentCar ? G.currentCar.speed : player.state.speed; },
  get playerPos() { return { x: player.state.pos.x, z: player.state.pos.z }; },
  get mission() { return missions.isActive() ? missions.state.active.def.title : null; },
  get peds() { return traffic.peds.length; },
  get trafficCars() { return traffic.trafficCars.length; },
  startPlaying,
  setScreen,
};

// --- staging -------------------------------------------------------------------------
if (shot) {
  stageShot(shot, G);
  if (shot === 'start') hud.showScreen('title');
  else hud.showScreen(null);
} else {
  setScreen('title');
}

requestAnimationFrame(frame);
