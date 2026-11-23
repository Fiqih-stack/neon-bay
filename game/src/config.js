// Neon Bay: every tuning number, colour and shared helper in one place.
// The view is a fixed 1280x720 logical area; the renderer scales it to the window.

export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const SAVE_KEY = 'neon-bay.save.v1';

export const CITY = {
  pitch: 440,
  roadW: 84,
  roads: 8,
  // Road centres run 0..3080; the city edge is half a road past the last centre.
  size: 3080 + 84,
  waterW: 380,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  runSpeed: 235,
  hp: 100,
  punchDamage: 26,
  punchRange: 48,
  punchArc: 1.1,
  punchCd: 0.45,
};

export const CAR = {
  radius: 21,
  accel: 430,
  brake: 640,
  reverseMax: 170,
  maxSpeed: 545,
  turn: 2.7,
  grip: 5.5,
  hp: 100,
  enterRange: 78,
};

/** Vehicle classes: same arcade feel, different top speed, punch and size. */
export const VCLASS = {
  coupe: { top: 545, acc: 430, hp: 100, len: 44, label: 'coupe' },
  sport: { top: 640, acc: 520, hp: 80, len: 48, label: 'sport' },
  truck: { top: 460, acc: 340, hp: 160, len: 54, label: 'truck' },
};

/** Taxi fares and neon tokens: the free-roam side work. */
export const TAXI = { rideTime: 60, minPay: 80, maxPay: 160, respawnDelay: 20, pickupRange: 80, dropRange: 90 };
export const TOKENS = { count: 12, value: 25, collectRange: 32 };

/** A police helicopter joins the chase at five stars; roadblocks at three. */
export const HELI = { speed: 310, hoverRadius: 130, spawnOffset: 420 };
export const ROADBLOCK = { minWanted: 3, aheadDist: 620, triggerRange: 140 };

export const TRAFFIC = { count: 14, speedMin: 125, speedMax: 195, hp: 60 };
export const PEDS = { count: 26, speedMin: 42, speedMax: 78, hp: 40 };
export const POLICE = { maxSpeed: 565, accel: 490, maxActive: 5, spawnDist: 760, giveUpDist: 980, heliSpawnCd: 1.1 };

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

export const WANTED = {
  stealCar: 1,
  hitPed: 1,
  shootNearCop: 1,
  killCop: 1,
  crimeCooldown: 2.5,
  decayQuiet: 20,
  decayStep: 8,
};

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
  /** District palettes: bayfront blues, downtown purples, casino golds. */
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

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}
export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * clamp(t, 0, 1);
}
/** Deterministic seeded random (mulberry32); the whole city and every shot scene come from it. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
