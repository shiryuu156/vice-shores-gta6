// Vice Shores — the city itself. A procedural grid of roads, sidewalks,
// buildings with canvas-painted window textures, streetlights, palms, hydrants
// and traffic lights, under a sun-soaked sky with fog. The world also owns the
// collision list (building AABBs) and the road helpers traffic and the police
// use to stay on the streets.

import * as THREE from 'three';
import { BLOCK, CITY_HALF, GRID, ROAD_PITCH, ROAD_WIDTH, SIDEWALK, clamp, createRng, pick, range, roadCentres } from './config.js';

const SKY_DAY = 0x87bfe8;
const SKY_SUNSET = 0xffb36b;
const FOG_DAY = 0x9fc8e8;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// A building face: tinted facade, a grid of lit and dark windows, a darker
// ground floor with a door. Each building gets one of a few palettes.
function buildingTexture(rng, base, floors, cols) {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading so faces read as concrete, not flat colour
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  const winW = 128 / cols;
  const winH = 200 / floors;
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng() < 0.35;
      g.fillStyle = lit ? '#ffe9a8' : '#1d2b3a';
      g.fillRect(6 + col * winW, 10 + f * winH, winW - 10, winH - 10);
    }
  }
  // ground floor: darker band with a door
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 210, 128, 46);
  g.fillStyle = '#2c2f36';
  g.fillRect(54, 216, 20, 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The road surface: asphalt with a dashed centre line and edge lines. The
// canvas is drawn so the dashes run along the road's length (the texture's U
// axis, repeated down the plane), with the edge lines at the top and bottom.
function roadTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#33363b';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f2c94c';
  g.fillRect(0, 62, 40, 4);
  g.fillRect(64, 62, 40, 4);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(0, 4, 128, 3);
  g.fillRect(0, 121, 128, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sidewalkTexture() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#9a938a';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 62, 62);
  g.beginPath();
  g.moveTo(32, 0); g.lineTo(32, 64);
  g.moveTo(0, 32); g.lineTo(64, 32);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PALETTES = ['#b98d6e', '#8fa3b0', '#c2b49a', '#7d8a99', '#a86f5d', '#94a08a', '#b0a6c2', '#6e7f8c'];

export function createWorld(scene, seed) {
  const rng = createRng(seed);
  const colliders = []; // { minX, maxX, minZ, maxZ } building footprints
  const centres = roadCentres();
  const group = new THREE.Group();
  scene.add(group);

  // --- sky, light, fog ------------------------------------------------------
  scene.background = new THREE.Color(SKY_DAY);
  scene.fog = new THREE.Fog(FOG_DAY, 120, 420);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -180; sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180; sun.shadow.camera.bottom = -180;
  sun.shadow.camera.far = 500;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9));

  // --- ground, roads, sidewalks ---------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 80, CITY_HALF * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x7d8f6a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const sideTex = sidewalkTexture();
  const sideMat = new THREE.MeshLambertMaterial({ map: sideTex });
  const span = CITY_HALF * 2 + 40;
  for (const c of centres) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD_WIDTH), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = horizontal ? Math.PI / 2 : 0;
      road.position.set(horizontal ? c : 0, 0.01, horizontal ? 0 : c);
      road.receiveShadow = true;
      group.add(road);
      // sidewalks flank every road
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(span, SIDEWALK), sideMat.clone());
        walk.material.map = sideTex.clone();
        walk.material.map.needsUpdate = true;
        walk.material.map.repeat.set(span / 4, 1);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = horizontal ? Math.PI / 2 : 0;
        walk.position.set(
          horizontal ? c + side * (ROAD_WIDTH / 2 + SIDEWALK / 2) : 0,
          0.02,
          horizontal ? 0 : c + side * (ROAD_WIDTH / 2 + SIDEWALK / 2)
        );
        walk.receiveShadow = true;
        group.add(walk);
      }
    }
  }

  // --- buildings --------------------------------------------------------------
  // One block sits between each pair of neighbouring roads. A block holds 1-4
  // buildings; a few blocks stay open as plazas, parks or parking lots.
  const buildingGeos = new THREE.BoxGeometry(1, 1, 1);
  const blockCentres = [];
  for (let i = 0; i < GRID - 1; i++) {
    for (let j = 0; j < GRID - 1; j++) {
      blockCentres.push({ x: (centres[i] + centres[i + 1]) / 2, z: (centres[j] + centres[j + 1]) / 2 });
    }
  }
  const plazaSpots = new Set();
  while (plazaSpots.size < 3) plazaSpots.add(Math.floor(rng() * blockCentres.length));

  blockCentres.forEach((bc, bi) => {
    if (plazaSpots.has(bi)) {
      // a park: grass square, a few palms, benches are just boxes
      const park = new THREE.Mesh(
        new THREE.PlaneGeometry(BLOCK, BLOCK),
        new THREE.MeshLambertMaterial({ color: 0x5d8a4a })
      );
      park.rotation.x = -Math.PI / 2;
      park.position.set(bc.x, 0.03, bc.z);
      park.receiveShadow = true;
      group.add(park);
      for (let t = 0; t < 4; t++) group.add(makePalm(rng, bc.x + range(rng, -14, 14), bc.z + range(rng, -14, 14)));
      return;
    }
    const count = rng() < 0.35 ? 1 : rng() < 0.7 ? 2 : 4;
    const palette = pick(rng, PALETTES);
    if (count === 1) {
      const w = range(rng, 22, 30), d = range(rng, 22, 30);
      const h = range(rng, 18, 55);
      addBuilding(bc.x, bc.z, w, d, h, palette);
    } else if (count === 2) {
      const horizontal = rng() < 0.5;
      for (let k = 0; k < 2; k++) {
        const off = (k - 0.5) * (BLOCK / 2);
        const w = horizontal ? BLOCK / 2 - 4 : range(rng, 16, 24);
        const d = horizontal ? range(rng, 16, 24) : BLOCK / 2 - 4;
        addBuilding(bc.x + (horizontal ? off : 0), bc.z + (horizontal ? 0 : off), w, d, range(rng, 12, 42), palette);
      }
    } else {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        addBuilding(bc.x + sx * BLOCK / 4, bc.z + sz * BLOCK / 4, BLOCK / 2 - 4, BLOCK / 2 - 4, range(rng, 10, 34), palette);
      }
    }
  });

  function addBuilding(x, z, w, d, h, palette) {
    const floors = Math.max(2, Math.round(h / 6));
    const cols = Math.max(2, Math.round(w / 5));
    const tex = buildingTexture(rng, palette, floors, cols);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(buildingGeos, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // flat roof cap
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
      new THREE.MeshLambertMaterial({ color: 0x4a4a48 })
    );
    roof.position.set(x, h + 0.25, z);
    group.add(roof);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  // --- street props -----------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.6 });
  for (const c of centres) {
    for (let k = -2; k <= 2; k++) {
      const along = k * ROAD_PITCH;
      for (const side of [-1, 1]) {
        const lamp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6), poleMat);
        pole.position.y = 3.25;
        pole.castShadow = true;
        lamp.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), poleMat);
        arm.position.set(side * -0.8, 6.4, 0);
        lamp.add(arm);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampMat);
        bulb.position.set(side * -1.5, 6.3, 0);
        lamp.add(bulb);
        lamp.position.set(c + side * (ROAD_WIDTH / 2 + SIDEWALK + 0.4), 0, along);
        group.add(lamp);
      }
    }
  }

  // traffic lights at every intersection: pole + red/amber/green lamps
  const lightMats = {
    red: new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 0.9 }),
    amber: new THREE.MeshLambertMaterial({ color: 0x886611, emissive: 0xcc9911, emissiveIntensity: 0.4 }),
    green: new THREE.MeshLambertMaterial({ color: 0x115511, emissive: 0x22cc44, emissiveIntensity: 0.3 }),
    redDim: new THREE.MeshLambertMaterial({ color: 0x331111 }),
    amberDim: new THREE.MeshLambertMaterial({ color: 0x332211 }),
    greenDim: new THREE.MeshLambertMaterial({ color: 0x113311 }),
  };
  const trafficLights = [];
  for (const cx of centres) {
    for (const cz of centres) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6), poleMat);
      pole.position.set(cx + ROAD_WIDTH / 2 + 1, 2.5, cz + ROAD_WIDTH / 2 + 1);
      group.add(pole);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
      box.position.set(cx + ROAD_WIDTH / 2 + 1, 5, cz + ROAD_WIDTH / 2 + 1);
      group.add(box);
      const lamps = [];
      for (let i = 0; i < 3; i++) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lightMats[i === 0 ? 'red' : i === 1 ? 'amber' : 'green']);
        lamp.position.set(cx + ROAD_WIDTH / 2 + 1, 5.45 - i * 0.42, cz + ROAD_WIDTH / 2 + 1.28);
        group.add(lamp);
        lamps.push(lamp);
      }
      trafficLights.push({ lamps, phase: rng() * 8, x: cx, z: cz });
    }
  }

  // hydrants scattered on sidewalks
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  for (let i = 0; i < 14; i++) {
    const c = pick(rng, centres);
    const along = range(rng, -CITY_HALF + 20, CITY_HALF - 20);
    const hydrant = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8), hydrantMat);
    hydrant.position.set(c + (rng() < 0.5 ? -1 : 1) * (ROAD_WIDTH / 2 + SIDEWALK / 2), 0.45, along);
    hydrant.castShadow = true;
    group.add(hydrant);
    colliders.push({ minX: hydrant.position.x - 0.4, maxX: hydrant.position.x + 0.4, minZ: hydrant.position.z - 0.4, maxZ: hydrant.position.z + 0.4 });
  }

  function makePalm(rngLocal, x, z) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5, 6), new THREE.MeshLambertMaterial({ color: 0x8a6b4a }));
    trunk.position.y = 2.5;
    trunk.rotation.z = range(rngLocal, -0.08, 0.08);
    trunk.castShadow = true;
    palm.add(trunk);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.7), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1, 5.1, Math.sin(a) * 1.1);
      leaf.rotation.y = -a;
      leaf.rotation.z = 0.35;
      palm.add(leaf);
    }
    palm.position.set(x, 0, z);
    return palm;
  }

  // palms lining the main avenue
  for (let k = -3; k <= 3; k++) {
    group.add(makePalm(rng, -ROAD_WIDTH / 2 - SIDEWALK - 0.6, k * ROAD_PITCH + 12));
    group.add(makePalm(rng, ROAD_WIDTH / 2 + SIDEWALK + 0.6, k * ROAD_PITCH - 12));
  }

  // --- helpers ---------------------------------------------------------------
  // Circle (player / car) vs building AABB: push the circle out, return the
  // corrected position. Cars call this too, so crashes feel solid.
  function resolveCollision(pos, radius) {
    for (const b of colliders) {
      const nx = clamp(pos.x, b.minX, b.maxX);
      const nz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 < 1e-6) {
          // centre inside the box: shove out along the smallest penetration
          const pl = Math.min(pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z);
          if (pl === pos.x - b.minX) pos.x = b.minX - radius;
          else if (pl === b.maxX - pos.x) pos.x = b.maxX + radius;
          else if (pl === pos.z - b.minZ) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        } else {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        }
        return true;
      }
    }
    return false;
  }

  function isOnRoad(x, z) {
    for (const c of centres) {
      if (Math.abs(x - c) < ROAD_WIDTH / 2 + 0.5) return true;
      if (Math.abs(z - c) < ROAD_WIDTH / 2 + 0.5) return true;
    }
    return false;
  }

  function nearestRoadPoint(x, z) {
    let best = null, bestD = Infinity;
    for (const c of centres) {
      for (const d of [Math.abs(x - c), Math.abs(z - c)]) {
        if (d < bestD) { bestD = d; best = { axis: Math.abs(x - c) < Math.abs(z - c) ? 'x' : 'z', c }; }
      }
    }
    return best;
  }

  function randomRoadPoint(rngLocal, margin = 20) {
    const c = pick(rngLocal, centres);
    const along = range(rngLocal, -CITY_HALF + margin, CITY_HALF - margin);
    if (rngLocal() < 0.5) return { x: c, z: along, alongX: false };
    return { x: along, z: c, alongX: true };
  }

  function update(dt, time) {
    // traffic lights cycle: green 4s, amber 1s, red 4s, offset per light
    for (const tl of trafficLights) {
      const phase = (time + tl.phase) % 9;
      const red = phase < 4, amber = phase >= 4 && phase < 5;
      tl.lamps[0].material = red ? lightMats.red : lightMats.redDim;
      tl.lamps[1].material = amber ? lightMats.amber : lightMats.amberDim;
      tl.lamps[2].material = !red && !amber ? lightMats.green : lightMats.greenDim;
    }
  }

  return {
    group, colliders, centres,
    resolveCollision, isOnRoad, nearestRoadPoint, randomRoadPoint,
    update,
    setSunset(on) {
      scene.background.set(on ? SKY_SUNSET : SKY_DAY);
      scene.fog.color.set(on ? 0xe8a06a : FOG_DAY);
      sun.intensity = on ? 1.6 : 2.2;
    },
  };
}
