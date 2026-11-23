// Neon Bay AI: traffic cars follow the road graph, pedestrians stroll the sidewalks
// and flee from danger, and police cars chase the player and try to ram them.
// All steering is the same small helper: turn toward a point, gas when aligned.

import { CITY, CAR, TRAFFIC, PEDS, POLICE, PALETTE, angleTo, angleDiff, angleLerp, dist2, clamp, pick } from './config.js';
import { neighborsOf, nearestNode, makeCar, makePed } from './world.js';

function pickNextNode(state, car) {
  const options = neighborsOf(state.city, car.targetNode).filter((n) => !(car.prevNode && n.i === car.prevNode.i && n.j === car.prevNode.j));
  const pool = options.length > 0 ? options : neighborsOf(state.city, car.targetNode);
  return pool[Math.floor(state.rng() * pool.length)];
}

/** Steer a car toward a point: returns the speed it should hold (0 when turning hard). */
export function steerToward(car, tx, ty, dt, maxSpeed) {
  const want = angleTo(car.x, car.y, tx, ty);
  const diff = angleDiff(car.angle, want);
  car.angle += clamp(diff, -2.9 * dt, 2.9 * dt);
  const aligned = Math.abs(diff) < 0.5;
  const target = aligned ? maxSpeed : maxSpeed * 0.25;
  car.speed += clamp(target - car.speed, -640 * dt, 430 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  return aligned;
}

function carAhead(state, car, look) {
  const ax = Math.cos(car.angle);
  const ay = Math.sin(car.angle);
  for (let i = 0; i < state.cars.length; i += 1) {
    const other = state.cars[i];
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * ax + dy * ay;
    if (ahead > 0 && ahead < look && Math.abs(dx * ay - dy * ax) < 34) return true;
  }
  const p = state.player;
  // The player too, on foot or in a car: traffic stops rather than ploughing through them.
  const pr = p.inCar ? CAR.radius : 13;
  {
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const ahead = dx * ax + dy * ay;
    if (ahead > 0 && ahead < look && Math.abs(dx * ay - dy * ax) < 34 + pr) return true;
  }
  return false;
}

export function updateTraffic(state, dt) {
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if (car.kind !== 'traffic') continue;
    if (car.hp <= 0) continue;
    if (!car.targetNode) car.targetNode = nearestNode(state.city, car.x, car.y);
    const d2 = dist2(car.x, car.y, car.targetNode.x, car.targetNode.y);
    if (d2 < 30 * 30) {
      car.prevNode = car.node;
      car.node = car.targetNode;
      car.targetNode = pickNextNode(state, car);
    }
    const maxSpeed = carAhead(state, car, 95) ? 0 : TRAFFIC.speedMin + 40;
    steerToward(car, car.targetNode.x, car.targetNode.y, dt, maxSpeed);
    if (car.speed < 12) car.stuckT += dt;
    else car.stuckT = 0;
    if (car.stuckT > 3) {
      car.targetNode = pickNextNode(state, car);
      car.stuckT = 0;
    }
  }
}

export function updatePeds(state, dt) {
  const p = state.player;
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (ped.hp <= 0) continue;
    if (ped.panicT > 0) ped.panicT -= dt;
    if (!ped.targetNode) ped.targetNode = nearestNode(state.city, ped.x, ped.y);
    const d2 = dist2(ped.x, ped.y, ped.targetNode.x, ped.targetNode.y);
    if (d2 < 24 * 24) {
      ped.prevNode = ped.node;
      ped.node = ped.targetNode;
      const options = neighborsOf(state.city, ped.node).filter((n) => !(ped.prevNode && n.i === ped.prevNode.i && n.j === ped.prevNode.j));
      const pool = options.length > 0 ? options : neighborsOf(state.city, ped.node);
      ped.targetNode = pool[Math.floor(state.rng() * pool.length)];
    }
    // Panic: run away from the player when they drive fast or shoot nearby.
    let tx = ped.targetNode.x;
    let ty = ped.targetNode.y;
    let speed = ped.speed;
    if (ped.panicT > 0) {
      const away = angleTo(p.x, p.y, ped.x, ped.y);
      tx = ped.x + Math.cos(away) * 300;
      ty = ped.y + Math.sin(away) * 300;
      speed = ped.speed * 2.3;
    }
    const want = angleTo(ped.x, ped.y, tx, ty);
    ped.angle = angleLerp(ped.angle, want, 6 * dt);
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
  }
}

/** Every pedestrian near a point panics and runs. */
export function scarePeds(state, x, y, radius) {
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (ped.hp > 0 && dist2(ped.x, ped.y, x, y) < radius * radius) ped.panicT = 3;
  }
}

export function spawnPolice(state, x, y) {
  const car = makeCar('police', x, y, angleTo(x, y, state.player.x, state.player.y), PALETTE.policeA);
  car.speed = 200;
  car.node = nearestNode(state.city, x, y);
  car.targetNode = nearestNode(state.city, state.player.x, state.player.y);
  state.cars.push(car);
  return car;
}

export function spawnThug(state, x, y) {
  const thug = { x, y, angle: 0, hp: 60, shootCd: 1 + state.rng(), speed: 95 };
  state.enemies.push(thug);
  return thug;
}

function policeCount(state) {
  let n = 0;
  for (let i = 0; i < state.cars.length; i += 1) if (state.cars[i].kind === 'police') n += 1;
  return n;
}

export function updatePolice(state, dt) {
  const p = state.player;
  const px = p.x;
  const py = p.y;
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if (car.kind !== 'police' || car.hp <= 0) continue;
    const d = Math.sqrt(dist2(car.x, car.y, px, py));
    // Chase with a little prediction so the ram lands ahead of the player.
    const lead = p.inCar ? 0.35 : 0.1;
    const tx = px + Math.cos(p.angle) * (p.inCar ? p.speed * lead : 0);
    const ty = py + Math.sin(p.angle) * (p.inCar ? p.speed * lead : 0);
    // On foot the cop glides to a stop on the player instead of ramming through
    // them: the busted timer, not the bumper, is what catches the player.
    const approach = p.inCar ? POLICE.maxSpeed : clamp(d * 2, 0, POLICE.maxSpeed);
    if (!p.inCar && d < 45) {
      car.speed = Math.max(0, car.speed - 900 * dt);
    } else {
      steerToward(car, tx, ty, dt, approach);
    }
    if (d < 70 && !p.inCar) {
      p.bustedT += dt;
    } else if (d > 240 || p.inCar) {
      p.bustedT = Math.max(0, p.bustedT - dt * 2);
    }
    if (d > POLICE.giveUpDist) {
      car.despawnT += dt;
      if (car.despawnT > 6) {
        state.cars.splice(i, 1);
        i -= 1;
      }
    } else {
      car.despawnT = 0;
    }
  }
  return policeCount(state);
}

/** Keep the police pressure matched to the wanted level, spawning at road edges. */
export function maintainPolice(state, dt) {
  const p = state.player;
  if (p.wanted <= 0) return;
  state.spawnCd -= dt;
  const want = Math.min(p.wanted + 1, POLICE.maxActive);
  if (state.spawnCd > 0 || policeCount(state) >= want) return;
  state.spawnCd = 2.2;
  const a = state.rng() * Math.PI * 2;
  const x = p.x + Math.cos(a) * POLICE.spawnDist;
  const y = p.y + Math.sin(a) * POLICE.spawnDist;
  const node = nearestNode(state.city, x, y);
  spawnPolice(state, node.x + (state.rng() - 0.5) * 40, node.y + (state.rng() - 0.5) * 40);
}

/** Parked cars and the player's own car: the ones the player can climb into. */
export function nearestStealable(state, x, y, range) {
  let best = null;
  let bestD = range * range;
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if ((car.kind !== 'parked' && car.kind !== 'player') || car.hp <= 0) continue;
    const d = dist2(car.x, car.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
