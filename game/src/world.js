// Neon Bay world: a seeded coastal city on a road grid, plus the whole game state.
// Roads run both ways every 440 px; blocks between them hold buildings or small plazas.
// The bay is west of the first road, with a wooden pier the first mission uses.

import { CITY, CAR, TRAFFIC, PEDS, PALETTE, mulberry32, pick, clamp, dist2 } from './config.js';

const SIGNS = ['NEON', 'PIER 9', 'TACO', 'HOTEL', '24H', 'BAR', 'GYM', 'DISCO', 'RAMEN', 'SURF', 'CASINO', 'MOTEL'];
let nextCarId = 1;

export function nodeKey(i, j) {
  return i + ',' + j;
}
export function nodeAt(city, i, j) {
  return { x: city.roadsX[i], y: city.roadsY[j], i, j };
}
export function neighborsOf(city, node) {
  const out = [];
  if (node.i > 0) out.push(nodeAt(city, node.i - 1, node.j));
  if (node.i < city.roads - 1) out.push(nodeAt(city, node.i + 1, node.j));
  if (node.j > 0) out.push(nodeAt(city, node.i, node.j - 1));
  if (node.j < city.roads - 1) out.push(nodeAt(city, node.i, node.j + 1));
  return out;
}
export function nearestNode(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < city.roads; i += 1) {
    for (let j = 0; j < city.roads; j += 1) {
      const dx = city.roadsX[i] - x;
      const dy = city.roadsY[j] - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = nodeAt(city, i, j);
      }
    }
  }
  return best;
}

function buildCity(rng) {
  const roadsX = [];
  const roadsY = [];
  for (let i = 0; i < CITY.roads; i += 1) {
    roadsX.push(i * CITY.pitch);
    roadsY.push(i * CITY.pitch);
  }
  const size = CITY.size;
  const half = CITY.roadW / 2;
  const buildings = [];
  const palms = [];
  const lamps = [];
  const plazas = [];
  for (let i = 0; i < CITY.roads - 1; i += 1) {
    for (let j = 0; j < CITY.roads - 1; j += 1) {
      const bx = roadsX[i] + half + 14;
      const by = roadsY[j] + half + 14;
      const bw = CITY.pitch - CITY.roadW - 28;
      const bh = CITY.pitch - CITY.roadW - 28;
      if ((i === 3 && j === 3) || rng() < 0.24) {
        // Block (3,3) is always the deal plaza: open ground for the fourth mission.
        plazas.push({ x: bx, y: by, w: bw, h: bh });
        for (let p = 0; p < 5; p += 1) {
          palms.push({ x: bx + 30 + rng() * (bw - 60), y: by + 30 + rng() * (bh - 60) });
        }
        continue;
      }
      const split = rng() < 0.45;
      const parts = split ? 4 : 1;
      for (let k = 0; k < parts; k += 1) {
        const cx = split ? bx + (k % 2) * (bw / 2 + 6) : bx;
        const cy = split ? by + Math.floor(k / 2) * (bh / 2 + 6) : by;
        const w = split ? bw / 2 - 6 : bw * (0.55 + rng() * 0.35);
        const h = split ? bh / 2 - 6 : bh * (0.55 + rng() * 0.35);
        const x = split ? cx : bx + (bw - w) / 2;
        const y = split ? cy : by + (bh - h) / 2;
        buildings.push({
          x, y, w, h,
          color: pick(rng, PALETTE.building),
          sign: rng() < 0.55 ? pick(rng, SIGNS) : '',
          signColor: pick(rng, PALETTE.neon),
          seed: Math.floor(rng() * 100000),
        });
      }
      if (rng() < 0.6) palms.push({ x: bx + 8, y: by + 8 });
      if (rng() < 0.5) palms.push({ x: bx + bw - 8, y: by + bh - 8 });
    }
  }
  for (let i = 0; i < CITY.roads; i += 1) {
    for (let j = 0; j < CITY.roads; j += 1) {
      lamps.push({ x: roadsX[i] + half + 6, y: roadsY[j] + half + 6 });
    }
  }
  return {
    roadsX, roadsY, roads: CITY.roads, size, half,
    buildings, palms, lamps, plazas,
    water: { x0: -half - CITY.waterW, x1: -half, y0: -half, y1: size + half },
    pier: { x0: -half - 300, x1: -half, y: 1540, w: 46 },
    // Fixed story places: all on roads or open ground, never inside a building.
    safehouse: { x: 440, y: 440 },
    hospital: { x: 2640, y: 440 },
    bank: { x: 440, y: 2640 },
    chopShop: { x: 2640, y: 2640 },
    dealPlaza: { x: 1540, y: 1540 },
    pierEnd: { x: -half - 270, y: 1540 },
  };
}

/** A point on a random road, facing along it: where traffic and parked cars start. */
export function randomRoadPoint(city, rng) {
  const horizontal = rng() < 0.5;
  const road = Math.floor(rng() * city.roads);
  const along = rng() * city.size;
  if (horizontal) return { x: along, y: city.roadsY[road], angle: rng() < 0.5 ? 0 : Math.PI };
  return { x: city.roadsX[road], y: along, angle: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
}

export function makeCar(kind, x, y, angle, color) {
  return {
    id: nextCarId,
    kind, x, y, angle,
    speed: 0,
    color,
    hp: kind === 'police' ? 120 : CAR.hp,
    node: null, prevNode: null, targetNode: null,
    stuckT: 0, siren: kind === 'police', stolen: false,
    occupied: kind === 'traffic',
    despawnT: 0, brakeLight: false,
  };
}

export function makePed(x, y, color) {
  return { x, y, angle: 0, speed: 0, color, node: null, prevNode: null, targetNode: null, panicT: 0, hp: PEDS.hp };
}

/** Push a circle out of every building it overlaps; returns true when it hit one. */
export function collideBuildings(city, p, r) {
  let hit = false;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const cx = clamp(p.x, b.x, b.x + b.w);
    const cy = clamp(p.y, b.y, b.y + b.h);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.01) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.y = cy + (dy / d) * r;
    } else {
      p.x = b.x - r;
    }
  }
  return hit;
}

export function inWater(city, x, y) {
  return x < city.water.x1 && x > city.water.x0 && y > city.water.y0 && y < city.water.y1 && !(Math.abs(y - city.pier.y) < city.pier.w / 2 && x > city.pier.x0);
}

export function clampToCity(city, p, r) {
  p.x = clamp(p.x, city.water.x0 + r, city.size + CITY.roadW / 2 - r);
  p.y = clamp(p.y, -CITY.roadW / 2 + r, city.size + CITY.roadW / 2 - r);
}

export function createState(seed) {
  const rng = mulberry32(seed);
  const city = buildCity(rng);
  const state = {
    seed, rng, time: 0,
    city,
    player: {
      x: city.safehouse.x, y: city.safehouse.y, angle: -Math.PI / 2,
      hp: 100, money: 150, wanted: 0,
      crimeCd: 0, quietT: 0, decayT: 0, bustedT: 0,
      inCar: null, weapon: 'pistol', ammo: 12,
      shootCd: 0, reloadT: 0, punchCd: 0, speed: 0,
    },
    cars: [], peds: [], enemies: [], bullets: [], parts: [],
    mission: { index: 0, phase: 0, target: null, timer: 0, count: 0, text: '', done: false, storyDone: false },
    dialog: { lines: [], i: 0, t: 0 },
    cam: { x: city.safehouse.x, y: city.safehouse.y, shake: 0 },
    stats: { stolen: 0, earned: 0, busted: 0 },
    flags: { muted: false },
    spawnCd: 0, saveT: 0, overT: 0,
  };
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    let spot = randomRoadPoint(city, rng);
    // Keep traffic clear of the safehouse so the player is never shoved at spawn.
    let guard = 0;
    while (dist2(spot.x, spot.y, city.safehouse.x, city.safehouse.y) < 160 * 160 && guard < 8) {
      spot = randomRoadPoint(city, rng);
      guard += 1;
    }
    const car = makeCar('traffic', spot.x, spot.y, spot.angle, pick(rng, PALETTE.traffic));
    car.node = nearestNode(city, spot.x, spot.y);
    car.targetNode = nearestNode(city, spot.x + Math.cos(spot.angle) * 440, spot.y + Math.sin(spot.angle) * 440);
    car.speed = TRAFFIC.speedMin + rng() * (TRAFFIC.speedMax - TRAFFIC.speedMin);
    state.cars.push(car);
  }
  for (let i = 0; i < 8; i += 1) {
    const spot = randomRoadPoint(city, rng);
    const side = rng() < 0.5 ? 1 : -1;
    const px = spot.x + (spot.angle === 0 || spot.angle === Math.PI ? 0 : side * (CITY.roadW / 2 - 16));
    const py = spot.y + (spot.angle === 0 || spot.angle === Math.PI ? side * (CITY.roadW / 2 - 16) : 0);
    const car = makeCar('parked', px, py, spot.angle, pick(rng, PALETTE.traffic));
    car.occupied = false;
    state.cars.push(car);
  }
  for (let i = 0; i < PEDS.count; i += 1) {
    const spot = randomRoadPoint(city, rng);
    const ped = makePed(spot.x + (rng() - 0.5) * 60, spot.y + (rng() - 0.5) * 60, pick(rng, PALETTE.ped));
    ped.node = nearestNode(city, ped.x, ped.y);
    ped.targetNode = nearestNode(city, ped.x + (rng() - 0.5) * 800, ped.y + (rng() - 0.5) * 800);
    ped.speed = PEDS.speedMin + rng() * (PEDS.speedMax - PEDS.speedMin);
    state.peds.push(ped);
  }
  return state;
}

/** The player's own first car: a teal coupe parked on the road by the safehouse. */
export function spawnPlayerCar(state) {
  const car = makeCar('parked', state.city.safehouse.x + 30, state.city.safehouse.y - 110, -Math.PI / 2, PALETTE.playerCar);
  car.occupied = false;
  state.cars.push(car);
  return car;
}
