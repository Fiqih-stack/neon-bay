// Neon Bay — the numbers every system agrees on.
// One place holds the tuning for the city, the cars, the cops, the
// missions and the look, so a balance tweak is a single edit here and
// the whole game follows. The canvas is a fixed 1280x720 view scaled to
// fit the window; the city itself is a seeded 8x8 road grid with the bay
// along its western edge and the sun hanging low over the water.

export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const SAVE_KEY = 'neon-bay.save.v1';

// --- Small math tools --------------------------------------------------------
// Clamping, blending, squared distance (fast enough for comparisons),
// bearings, shortest signed turns, and a seeded generator so one seed
// always grows the same bay, the same traffic and the same shots.
export function bound(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
export function mix(a, b, t) {
  return a + (b - a) * t;
}
export function d2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}
export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
// Shortest signed turn from heading a to heading b, in (-PI, PI].
export function turnBy(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
export function steerTo(a, b, t) {
  return a + turnBy(a, b) * bound(t, 0, 1);
}
// mulberry32: tiny, fast, deterministic — more than enough for a city.
export function rngFrom(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// --- The city grid ------------------------------------------------------------
export const CITY = {
  pitch: 440, // centreline to centreline between neighbouring roads
  roadW: 84, // kerb to kerb width of a single road
  roads: 8, // roads in each direction, so the grid is 8 by 8
  // Centrelines run 0..3080; the built edge sits half a road past the last.
  size: 3080 + 84,
  waterW: 380, // how far the bay reaches west of the first road
};

// --- Jax on foot ---------------------------------------------------------------
export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  runSpeed: 235,
  hp: 100,
  punchDamage: 26,
  punchRange: 48,
  punchArc: 1.1, // radians either side of the facing direction
  punchCd: 0.45,
};

// --- Driving ----------------------------------------------------------------------
export const CAR = {
  radius: 21,
  accel: 430,
  brake: 640,
  reverseMax: 170,
  maxSpeed: 545, // the player's coupe; the classes below override it
  turn: 2.7,
  grip: 5.5,
  hp: 100,
  enterRange: 78,
};

// Three classes, one arcade feel, different character: coupes are the
// everyday default, sports are quick and fragile, trucks are slow and
// hard to kill. Police cruisers run their own numbers in world.js.
export const VCLASS = {
  coupe: { top: 545, acc: 430, hp: 100, len: 44, label: 'coupe' },
  sport: { top: 640, acc: 520, hp: 80, len: 48, label: 'sport' },
  truck: { top: 460, acc: 340, hp: 160, len: 54, label: 'truck' },
};

// --- Side work: fares and tokens ---------------------------------------------------
export const TAXI = {
  rideTime: 60,
  minPay: 80,
  maxPay: 160,
  respawnDelay: 20,
  pickupRange: 80,
  dropRange: 90,
};
export const TOKENS = { count: 12, value: 25, collectRange: 32 };

// --- The helicopter and the roadblocks ----------------------------------------------
// The helicopter joins at five stars and circles the player; roadblocks
// go up from three stars and park across the road ahead of the player.
export const HELI = { speed: 310, hoverRadius: 130, spawnOffset: 420, coolDown: 2 };
export const ROADBLOCK = { minWanted: 3, aheadDist: 620, triggerRange: 140, respawn: 9 };

// --- Who lives in the city ------------------------------------------------------------
export const TRAFFIC = { count: 14, speedMin: 125, speedMax: 195, hp: 60 };
export const PEDS = { count: 26, speedMin: 42, speedMax: 78, hp: 40 };
export const POLICE = {
  maxSpeed: 565,
  accel: 490,
  maxActive: 5,
  spawnDist: 760,
  giveUpDist: 980,
  heliSpawnCd: 1.1, // backup arrives faster while the helicopter is up
};

// --- Combat ---------------------------------------------------------------------------
export const WEAPON = {
  pistolDamage: 34,
  pistolAmmo: 12,
  pistolReload: 1.1,
  pistolRange: 560,
  bulletSpeed: 920,
  enemyHp: 60,
  enemyDamage: 9,
  enemyRange: 420,
};

// --- The heat -----------------------------------------------------------------------------
export const WANTED = {
  stealCar: 1,
  hitPed: 1,
  shootNearCop: 1,
  killCop: 1,
  crimeCooldown: 2.5, // one criminal act counts once per window
  decayQuiet: 20, // seconds with no cop near before stars start falling
  decayStep: 8, // seconds per star once the decay starts
};

// --- The look -------------------------------------------------------------------------------
export const PALETTE = {
  sky: '#241239',
  water: '#1b2f5e',
  waterDeep: '#12224a',
  sand: '#8a6f4d',
  road: '#23232e',
  roadEdge: '#2e2e3c',
  sidewalk: '#3b3b4c',
  block: '#191922',
  building: ['#2e2a4a', '#3d2b4f', '#4a2c3f', '#2b3a52', '#453052'],
  // One set per district: cool blues by the bay, purples downtown, golds
  // around the casino row in the south-east.
  district: {
    bay: ['#2b4a6b', '#2e5a6b', '#274a5e', '#35586b'],
    downtown: ['#2e2a4a', '#3d2b4f', '#4a2c3f', '#2b3a52', '#453052'],
    casino: ['#4a2c5e', '#5e2c4a', '#6b3a2c', '#4a2c6b'],
  },
  roofLine: '#0f0e16',
  windowLit: '#ffd166',
  windowDark: '#262636',
  neon: ['#29f3ff', '#ff2e88', '#ffd166', '#39ff88', '#ff7a1a'],
  palm: '#2f7a4d',
  trunk: '#6b4a2f',
  player: '#19e3c2',
  playerCar: '#19e3c2',
  policeA: '#e8ecf4',
  policeB: '#1c1e26',
  traffic: ['#d94f3d', '#e8a13c', '#4f7fd9', '#7a5fd0', '#c9c9c9', '#3da58a', '#b8b03a'],
  ped: ['#e86a92', '#f2c94c', '#6ab0f2', '#9be36a', '#e8e8e8', '#f28c4a'],
  hudPanel: 'rgba(12, 12, 24, 0.72)',
  hudText: '#f2f4f8',
  hudMuted: '#9aa3b5',
  gold: '#ffd166',
  red: '#ff4757',
  marker: '#ffd166',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
