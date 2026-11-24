// Neon Bay world: a seeded coastal city on a road grid, and the whole
// game state that lives in it. Roads run both ways every 440 px; the blocks
// between them hold buildings, palms or a small plaza. West of the first
// road is the bay, with a wooden pier the first job uses as its drop-off.

import { CITY, VCLASS, TRAFFIC, PEDS, TOKENS, PALETTE, rngFrom, pick, bound, d2 } from './config.js';

const NEON_WORDS = ['NEON', 'PIER 9', 'TACO', 'HOTEL', '24H', 'BAR', 'GYM', 'DISCO', 'RAMEN', 'SURF', 'CASINO', 'MOTEL'];
let carSeq = 1;

// Which neighbourhood a block belongs to: the bayfront on the west edge,
// the casino row in the far south-east, downtown everywhere else.
export function zoneOf(i, j) {
  if (i <= 1) return 'bay';
  if (i >= 5 && j >= 5) return 'casino';
  return 'downtown';
}

export function cellKey(i, j) {
  return i + ',' + j;
}
export function nodeAt(city, i, j) {
  return { x: city.roadsX[i], y: city.roadsY[j], i, j };
}
export function adjacent(city, node) {
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
      const dist = dx * dx + dy * dy;
      if (dist < bestD) {
        bestD = dist;
        best = nodeAt(city, i, j);
      }
    }
  }
  return best;
}

// One city block: its rectangle plus what fills it. Blocks sit between the
// roads with a margin, so no building ever touches the kerb.
function blockRect(city, i, j) {
  const half = city.half;
  return {
    x: city.roadsX[i] + half + 14,
    y: city.roadsY[j] + half + 14,
    w: CITY.pitch - CITY.roadW - 28,
    h: CITY.pitch - CITY.roadW - 28,
  };
}

function makePlaza(rect, rng, out) {
  out.plazas.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
  for (let p = 0; p < 5; p += 1) {
    out.palms.push({ x: rect.x + 30 + rng() * (rect.w - 60), y: rect.y + 30 + rng() * (rect.h - 60) });
  }
}

function fillBlock(rect, i, j, rng, out) {
  const zone = zoneOf(i, j);
  const palette = PALETTE.district[zone];
  const split = rng() < 0.45;
  const parts = split ? 4 : 1;
  for (let k = 0; k < parts; k += 1) {
    let x;
    let y;
    let w;
    let h;
    if (split) {
      const col = k % 2;
      const row = Math.floor(k / 2);
      x = rect.x + col * (rect.w / 2 + 6);
      y = rect.y + row * (rect.h / 2 + 6);
      w = rect.w / 2 - 6;
      h = rect.h / 2 - 6;
    } else {
      w = rect.w * (0.55 + rng() * 0.35);
      h = rect.h * (0.55 + rng() * 0.35);
      x = rect.x + (rect.w - w) / 2;
      y = rect.y + (rect.h - h) / 2;
    }
    out.buildings.push({
      x, y, w, h,
      color: pick(rng, palette),
      district: zone,
      sign: rng() < 0.55 ? pick(rng, NEON_WORDS) : '',
      signColor: pick(rng, PALETTE.neon),
      seed: Math.floor(rng() * 100000),
    });
  }
  if (rng() < 0.6) out.palms.push({ x: rect.x + 8, y: rect.y + 8 });
  if (rng() < 0.5) out.palms.push({ x: rect.x + rect.w - 8, y: rect.y + rect.h - 8 });
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
  const out = { buildings: [], palms: [], lamps: [], plazas: [] };
  const grid = { roadsX, roadsY, half };
  for (let i = 0; i < CITY.roads - 1; i += 1) {
    for (let j = 0; j < CITY.roads - 1; j += 1) {
      const rect = blockRect(grid, i, j);
      // Block (3,3) is always the deal plaza: open ground for the shootouts.
      if ((i === 3 && j === 3) || rng() < 0.24) makePlaza(rect, rng, out);
      else fillBlock(rect, i, j, rng, out);
    }
  }
  for (let i = 0; i < CITY.roads; i += 1) {
    for (let j = 0; j < CITY.roads; j += 1) {
      out.lamps.push({ x: roadsX[i] + half + 6, y: roadsY[j] + half + 6 });
    }
  }
  return {
    roadsX, roadsY, roads: CITY.roads, size, half,
    buildings: out.buildings, palms: out.palms, lamps: out.lamps, plazas: out.plazas,
    water: { x0: -half - CITY.waterW, x1: -half, y0: -half, y1: size + half },
    // The pier is short on purpose: the water blocks walking and driving,
    // so its end must sit within the mission radius (120 px) of the water's
    // edge — a player at the edge stands 108 px from the pier end.
    pier: { x0: -half - 138, x1: -half, y: 1540, w: 46 },
    // Fixed story places: all on roads or open ground, never inside a building.
    safehouse: { x: 440, y: 440 },
    hospital: { x: 2640, y: 440 },
    bank: { x: 440, y: 2640 },
    chopShop: { x: 2640, y: 2640 },
    dealPlaza: { x: 1540, y: 1540 },
    pierEnd: { x: -half - 108, y: 1540 },
  };
}

// A point on a random road, facing along it: where traffic and parked cars begin.
export function roadPoint(city, rng) {
  const horizontal = rng() < 0.5;
  const road = Math.floor(rng() * city.roads);
  const along = rng() * city.size;
  const facing = rng() < 0.5;
  if (horizontal) return { x: along, y: city.roadsY[road], angle: facing ? 0 : Math.PI };
  return { x: city.roadsX[road], y: along, angle: facing ? Math.PI / 2 : -Math.PI / 2 };
}

// Coupes are the common sight, sports are quick, trucks are tough.
export function randomClass(rng) {
  const r = rng();
  if (r < 0.5) return 'coupe';
  if (r < 0.75) return 'sport';
  return 'truck';
}

export function buildCar(kind, x, y, angle, color, vclass, rng) {
  const isCop = kind === 'police';
  const cls = isCop ? 'police' : (vclass || (rng ? randomClass(rng) : 'coupe'));
  const spec = isCop ? { top: 565, acc: 490, hp: 120 } : VCLASS[cls];
  return {
    id: carSeq,
    kind, x, y, angle,
    speed: 0,
    color,
    vclass: cls,
    top: spec.top, acc: spec.acc,
    hp: isCop ? 120 : spec.hp,
    node: null, prevNode: null, targetNode: null,
    stuckT: 0, siren: isCop, stolen: false,
    occupied: kind === 'traffic',
    despawnT: 0, brakeLight: false, block: false, blockAxis: 'h',
    // One impact counts once: after a crash the car ignores further crash
    // damage for a short while instead of taking it every frame while two
    // cars overlap (a head-on used to wreck a car outright in under a second).
    crashCd: 0,
  };
}

export function buildPed(x, y, color) {
  return { x, y, angle: 0, speed: 0, color, node: null, prevNode: null, targetNode: null, panicT: 0, hp: PEDS.hp };
}

// Push a circle out of every building it overlaps; true when it touched one.
export function pushOutOfBuildings(city, p, r) {
  let hit = false;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const nearX = bound(p.x, b.x, b.x + b.w);
    const nearY = bound(p.y, b.y, b.y + b.h);
    const dx = p.x - nearX;
    const dy = p.y - nearY;
    const dist2 = dx * dx + dy * dy;
    if (dist2 >= r * r) continue;
    hit = true;
    if (dist2 > 0.01) {
      const dist = Math.sqrt(dist2);
      p.x = nearX + (dx / dist) * r;
      p.y = nearY + (dy / dist) * r;
    } else {
      p.x = b.x - r;
    }
  }
  return hit;
}

export function isWater(city, x, y) {
  const w = city.water;
  if (x >= w.x1 || x <= w.x0 || y <= w.y0 || y >= w.y1) return false;
  // The pier is dry land over the water.
  if (Math.abs(y - city.pier.y) < city.pier.w / 2 && x > city.pier.x0) return false;
  return true;
}

export function keepInCity(city, p, r) {
  p.x = bound(p.x, city.water.x0 + r, city.size + CITY.roadW / 2 - r);
  p.y = bound(p.y, -CITY.roadW / 2 + r, city.size + CITY.roadW / 2 - r);
}

export function newGame(seed) {
  const rng = rngFrom(seed);
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
    tokens: [], heli: { active: false, x: 0, y: 0, angle: 0, coolT: 0 },
    taxi: { state: 'idle', mission: false, fare: null, dest: null, timer: 0, pay: 0, cooldown: 8 },
    mission: { index: 0, phase: 0, target: null, timer: 0, count: 0, text: '', done: false, storyDone: false, endShown: false },
    dialog: { lines: [], i: 0, t: 0 },
    prompt: '',
    cam: { x: city.safehouse.x, y: city.safehouse.y, shake: 0 },
    stats: { stolen: 0, earned: 0, busted: 0 },
    flags: { muted: false },
    spawnCd: 0, saveT: 0, overT: 0,
    bustedLoss: 0,
    // Roadblock bookkeeping: cooldown between blocks, and the wanted level
    // last frame, so a block can go up the moment the heat crosses 3 stars.
    roadblockCd: 0, prevWanted: 0,
    // The last busted/wasted fine, so the playtest can check the 20% cut
    // across the whole bust instead of inside one respawn frame.
    lastFine: null,
  };
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    let spot = roadPoint(city, rng);
    // Keep traffic clear of the safehouse so the player is never shoved at spawn.
    let guard = 0;
    while (d2(spot.x, spot.y, city.safehouse.x, city.safehouse.y) < 160 * 160 && guard < 8) {
      spot = roadPoint(city, rng);
      guard += 1;
    }
    const car = buildCar('traffic', spot.x, spot.y, spot.angle, pick(rng, PALETTE.traffic), null, rng);
    car.node = nearestNode(city, spot.x, spot.y);
    car.targetNode = nearestNode(city, spot.x + Math.cos(spot.angle) * 440, spot.y + Math.sin(spot.angle) * 440);
    car.speed = TRAFFIC.speedMin + rng() * (TRAFFIC.speedMax - TRAFFIC.speedMin);
    state.cars.push(car);
  }
  // Fourteen parked cars: enough that a player stranded on foot usually finds
  // one nearby, instead of walking across town to the only survivor — and
  // enough healthy cars survive a long chase for a late swap to find one.
  for (let i = 0; i < 14; i += 1) {
    const spot = roadPoint(city, rng);
    const side = rng() < 0.5 ? 1 : -1;
    const onHorizontal = spot.angle === 0 || spot.angle === Math.PI;
    const px = spot.x + (onHorizontal ? 0 : side * (CITY.roadW / 2 - 16));
    const py = spot.y + (onHorizontal ? side * (CITY.roadW / 2 - 16) : 0);
    const car = buildCar('parked', px, py, spot.angle, pick(rng, PALETTE.traffic), null, rng);
    car.occupied = false;
    state.cars.push(car);
  }
  // Neon tokens: glowing pickups on roads and plazas, worth a little cash each.
  for (let i = 0; i < TOKENS.count; i += 1) {
    const spot = roadPoint(city, rng);
    const side = rng() < 0.5 ? 1 : -1;
    const onHorizontal = spot.angle === 0 || spot.angle === Math.PI;
    const ox = onHorizontal ? 0 : side * 26;
    const oy = onHorizontal ? side * 26 : 0;
    state.tokens.push({ x: spot.x + ox, y: spot.y + oy, taken: false, seed: i });
  }
  for (let i = 0; i < PEDS.count; i += 1) {
    const spot = roadPoint(city, rng);
    const ped = buildPed(spot.x + (rng() - 0.5) * 60, spot.y + (rng() - 0.5) * 60, pick(rng, PALETTE.ped));
    ped.node = nearestNode(city, ped.x, ped.y);
    ped.targetNode = nearestNode(city, ped.x + (rng() - 0.5) * 800, ped.y + (rng() - 0.5) * 800);
    ped.speed = PEDS.speedMin + rng() * (PEDS.speedMax - PEDS.speedMin);
    state.peds.push(ped);
  }
  return state;
}

// The player's own first car: a teal coupe on the road by the safehouse.
// It is kind 'player', so climbing into your own car is never a crime. It
// faces south, out toward the city and the pier, so the first drive is a
// straight road instead of a U-turn into the north edge. It sits on the road
// centre, clear of the buildings on either side.
export function spawnOwnCar(state) {
  const car = buildCar('player', state.city.safehouse.x, state.city.safehouse.y - 110, Math.PI / 2, PALETTE.playerCar, 'coupe');
  car.occupied = false;
  state.cars.push(car);
  return car;
}
