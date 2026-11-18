// Vice Shores — missions and the story. Rook owes fixer Marla Voss $40,000.
// Three scripted jobs pay it down: a timed delivery, a police escape, and a
// shootout plus getaway. Each mission is a stage machine: a marker beacon in
// the world, an objective line on the HUD, a timer, and a cash reward on
// success. Free-roam runs between missions; starting one is a menu tap or
// walking up to its marker and pressing E.

import * as THREE from 'three';
import { MISSIONS } from './config.js';

const MISSION_SPOTS = {
  // fixed, memorable places in the city: the north pier, the harbor warehouse,
  // the Coral Row safehouse, the old cannery.
  pickup: { x: -54, z: -140, label: 'North Pier — pickup' },
  deliver: { x: 108, z: 108, label: 'Harbor Warehouse — deliver' },
  escape: { x: 54, z: -108, label: 'Safehouse — Coral Row' },
  shootout: { x: -108, z: 54, label: 'Old Cannery — Kessler crew' },
  getaway: { x: 54, z: -108, label: 'Safehouse — Coral Row' },
};

function makeBeacon(scene, color) {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beamMat);
  beam.position.y = 30;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.4, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  dot.position.y = 1;
  group.add(dot);
  group.userData = { ring, dot, beam };
  scene.add(group);
  return group;
}

export function createMissions(scene, rng) {
  const state = {
    active: null, // { def, stageIndex, timeLeft, target, beacon, guardsLeft }
    completed: [false, false, false],
    debt: 40000,
    message: '',
    messageTimer: 0,
  };

  let beacon = null;

  function placeBeacon(x, z, color) {
    clearBeacon();
    beacon = makeBeacon(scene, color);
    beacon.position.set(x, 0, z);
    return beacon;
  }

  function clearBeacon() {
    if (beacon) {
      scene.remove(beacon);
      beacon = null;
    }
  }

  function currentStage() {
    if (!state.active) return null;
    return state.active.def.stages[state.active.stageIndex];
  }

  function stageTarget(stage) {
    return MISSION_SPOTS[stage];
  }

  function startMission(id) {
    const def = MISSIONS[id];
    if (!def || state.active) return false;
    const stage = def.stages[0];
    const target = stageTarget(stage);
    placeBeacon(target.x, target.z, 0xffd23f);
    state.active = { def, stageIndex: 0, timeLeft: def.timeLimit, target, guardsLeft: 0 };
    setMessage(`${def.title} — ${def.brief}`, 6);
    return true;
  }

  function setMessage(text, seconds = 4) {
    state.message = text;
    state.messageTimer = seconds;
  }

  function advanceStage() {
    const m = state.active;
    m.stageIndex += 1;
    if (m.stageIndex >= m.def.stages.length) {
      completeMission();
      return;
    }
    const stage = currentStage();
    m.target = stageTarget(stage);
    placeBeacon(m.target.x, m.target.z, 0xffd23f);
    setMessage(stageLabel(stage), 5);
  }

  function stageLabel(stage) {
    switch (stage) {
      case 'pickup': return 'Pick up the package at the North Pier.';
      case 'deliver': return 'Deliver the package to the Harbor Warehouse. Drive fast.';
      case 'escape': return 'Lose the VCPD and reach the Coral Row safehouse.';
      case 'shootout': return 'Clear the Kessler guards at the Old Cannery.';
      case 'getaway': return 'Get to the getaway car and reach the safehouse.';
      default: return '';
    }
  }

  function objectiveText() {
    if (!state.active) return 'Free roam — press M for missions, E at a yellow marker to start a job.';
    const stage = currentStage();
    const spot = state.active.target;
    return `${state.active.def.title}: ${stageLabel(stage)} — ${spot.label}`;
  }

  function completeMission() {
    const m = state.active;
    state.completed[m.def.id] = true;
    state.debt = Math.max(0, state.debt - m.def.reward);
    clearBeacon();
    state.active = null;
    setMessage(`Job done! +$${m.def.reward} — debt left: $${state.debt.toLocaleString()}`, 6);
    return m.def.reward;
  }

  function failMission(reason) {
    if (!state.active) return;
    clearBeacon();
    setMessage(`Job failed — ${reason}`, 5);
    state.active = null;
  }

  // Called every frame while a mission is active. Returns 'complete' | 'fail' | null.
  // The caller supplies hooks: onShootoutStart spawns guards, onGetawayStart
  // spawns the getaway car; guardsLeft is set by combat when a guard falls.
  function update(dt, playerPos, playerCar, hooks) {
    if (state.messageTimer > 0) state.messageTimer -= dt;
    const m = state.active;
    if (!m) return null;
    m.timeLeft -= dt;
    if (m.timeLeft <= 0) {
      failMission('out of time');
      hooks.onFail?.();
      return 'fail';
    }
    const stage = currentStage();
    const target = m.target;
    const dist = Math.hypot(playerPos.x - target.x, playerPos.z - target.z);

    if (stage === 'pickup' || stage === 'deliver') {
      if (dist < 6) {
        if (stage === 'pickup') {
          hooks.onPickup?.();
          advanceStage();
        } else {
          completeMission();
          hooks.onComplete?.();
          return 'complete';
        }
      }
    } else if (stage === 'escape') {
      if (dist < 6) {
        completeMission();
        hooks.onComplete?.();
        return 'complete';
      }
    } else if (stage === 'shootout') {
      if (!m.shootoutStarted) {
        m.shootoutStarted = true;
        m.guardsLeft = hooks.onShootoutStart?.(target) ?? 0;
        setMessage('Clear the guards — watch your health!', 4);
      }
      if (m.guardsLeft <= 0 && m.shootoutStarted) {
        hooks.onShootoutCleared?.(target);
        advanceStage();
      }
    } else if (stage === 'getaway') {
      if (dist < 6 && playerCar) {
        completeMission();
        hooks.onComplete?.();
        return 'complete';
      }
    }

    // animate the beacon
    if (beacon) {
      beacon.userData.ring.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.15);
      beacon.rotation.y += dt * 0.8;
    }
    return null;
  }

  function guardDown() {
    if (state.active) state.active.guardsLeft = Math.max(0, (state.active.guardsLeft ?? 0) - 1);
  }

  // Jump an active mission to a later stage (used by the screenshot staging
  // so the delivery leg, beacon and timer are all in frame at once).
  function setStage(stageIndex, timeLeft) {
    if (!state.active) return;
    state.active.stageIndex = stageIndex;
    state.active.target = stageTarget(currentStage());
    state.active.timeLeft = timeLeft;
    placeBeacon(state.active.target.x, state.active.target.z, 0xffd23f);
  }

  function abort() {
    clearBeacon();
    state.active = null;
  }

  return {
    state, MISSION_SPOTS,
    startMission, objectiveText, update, guardDown, abort, failMission, completeMission, setMessage, setStage,
    isActive: () => state.active !== null,
  };
}
