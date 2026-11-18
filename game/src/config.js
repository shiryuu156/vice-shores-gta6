// Vice Shores — configuration, shared constants and the seeded random number
// generator. Every number that shapes the city, the cars and the missions lives here
// so the rest of the game reads like a design document, not a pile of literals.

// --- The city ---------------------------------------------------------------
// Roads run on a square grid. ROAD_PITCH is the distance between two road
// centrelines; ROAD_WIDTH is the asphalt; the rest of each block is sidewalk
// and buildings. The city is GRID roads across, centred on the origin.
export const ROAD_PITCH = 54;
export const ROAD_WIDTH = 14;
export const GRID = 5; // roads at -108, -54, 0, 54, 108
export const CITY_HALF = (GRID - 1) * ROAD_PITCH / 2 + ROAD_WIDTH / 2 + 40;
export const BLOCK = ROAD_PITCH - ROAD_WIDTH; // 40, the buildable square
export const SIDEWALK = 3;

export function roadCentres() {
  const out = [];
  for (let i = 0; i < GRID; i++) out.push((i - (GRID - 1) / 2) * ROAD_PITCH);
  return out;
}

// --- Player -----------------------------------------------------------------
export const PLAYER = {
  walkSpeed: 7,
  sprintSpeed: 11.5,
  accel: 40,
  jumpSpeed: 8.5,
  gravity: 24,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
};

// --- Cars -------------------------------------------------------------------
// name, colour, top speed (m/s), acceleration, handling (steer rate), body style.
export const CAR_MODELS = [
  { name: 'Civic Runabout', color: 0x3f7fbf, topSpeed: 26, accel: 14, steer: 1.9, body: 'sedan' },
  { name: 'Vulture GT', color: 0xc23b2e, topSpeed: 38, accel: 20, steer: 2.3, body: 'sport' },
  { name: 'Harbor Taxi', color: 0xe8b820, topSpeed: 24, accel: 12, steer: 1.8, body: 'taxi' },
  { name: 'Mule Pickup', color: 0x4a7a3f, topSpeed: 28, accel: 13, steer: 1.7, body: 'pickup' },
  { name: 'Palm Van', color: 0x8a8f96, topSpeed: 22, accel: 11, steer: 1.6, body: 'van' },
  { name: 'Night Cruiser', color: 0x2b2b33, topSpeed: 33, accel: 17, steer: 2.1, body: 'sedan' },
];

export const POLICE_CAR = { name: 'VCPD Interceptor', color: 0x1c2733, topSpeed: 36, accel: 19, steer: 2.4 };

// --- Combat -----------------------------------------------------------------
export const COMBAT = {
  magSize: 12,
  reloadSeconds: 1.2,
  shotDamage: 34,
  punchDamage: 20,
  punchRange: 2.2,
  shotRange: 90,
  fireInterval: 0.16,
};

// --- Wanted -----------------------------------------------------------------
export const WANTED = {
  maxStars: 5,
  // seconds with no crime and no cop in sight before one star fades
  decaySeconds: 14,
  // how many police cars / foot cops each star level asks for
  policeCars: [0, 1, 2, 3, 4, 5],
  footCops: [0, 0, 1, 2, 3, 4],
};

// --- Missions ---------------------------------------------------------------
// The story: Rook, a getaway driver, owes fixer Marla Voss $40,000. Each job
// pays the debt down. Missions are data here; missions.js runs them.
export const MISSIONS = [
  {
    id: 0,
    title: 'The Debt Run',
    giver: 'Marla Voss',
    brief: 'A package for the docks. Take any car, grab it from the north pier, then deliver it to the Harbor warehouse before the clock runs out.',
    reward: 500,
    stages: ['pickup', 'deliver'],
    timeLimit: 120,
  },
  {
    id: 1,
    title: 'Tail Trouble',
    giver: 'Marla Voss',
    brief: 'Somebody put a tail on you. The VCPD is already on the scent — lose them and reach the safehouse on Coral Row. Do not get busted.',
    reward: 800,
    stages: ['escape'],
    timeLimit: 90,
  },
  {
    id: 2,
    title: "Marla's Score",
    giver: 'Marla Voss',
    brief: 'The Kessler crew is holding the debt ledger at the old cannery. Clear the guards, then drive the getaway car to the safehouse.',
    reward: 1500,
    stages: ['shootout', 'getaway'],
    timeLimit: 240,
  },
];

// --- Save -------------------------------------------------------------------
export const SAVE_KEY = 'vice-shores-save-v1';

// --- Seeded random ----------------------------------------------------------
// mulberry32: tiny, fast, deterministic. A fixed seed makes the staged
// screenshots reproducible; a random seed makes every free-roam fresh.
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, min, max) { return min + rng() * (max - min); }
export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
