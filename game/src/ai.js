// Neon Bay AI: the traffic that threads the grid, the pedestrians who
// stroll the sidewalks and scatter when it gets loud, the police who hunt
// the player, the thugs who stand and fight, and the helicopter and
// roadblocks that arrive with the higher heat.

import { CITY, POLICE, TRAFFIC, PEDS, HELI, ROADBLOCK, WANTED, WEAPON, bound, mix, d2, angleTo, turnBy, steerTo } from './config.js';
import { adjacent, nodeAt, nearestNode, buildCar, buildPed, pushOutOfBuildings, isWater } from './world.js';

// --- Routes ------------------------------------------------------------------------
// A car follows its target node, then picks a new one. One step along a
// straight road is preferred when the last step was also straight, which
// keeps traffic flowing down long roads instead of zig-zagging at every
// intersection. The player is never a traffic target.
function pickNextNode(state, car, preferStraight = false) {
  if (!car.node) {
    car.node = nearestNode(state.city, car.x, car.y);
    car.targetNode = car.node;
    return car.targetNode;
  }
  const options = adjacent(state.city, car.node);
  const current = car.node;
  car.prevNode = current;
  let pool = options.filter((n) => !(car.prevNode && n.i === car.prevNode.i && n.j === car.prevNode.j));
  if (preferStraight && car.prevNode) {
    const going = { i: car.node.i - car.prevNode.i, j: car.node.j - car.prevNode.j };
    const straight = options.find((n) => n.i === car.node.i + going.i && n.j === car.node.j + going.j);
    if (straight && state.rng() < 0.7) pool = [straight];
  }
  const picked = pool[Math.floor(state.rng() * pool.length)] || options[0];
  car.node = car.targetNode;
  car.targetNode = picked;
  return picked;
}

// Steer toward a point and advance; false means the turn was too sharp or
// the point is too close to turn toward.
export function steerToward(car, x, y, dt, speed) {
  const dx = x - car.x;
  const dy = y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 12) return false;
  const aim = Math.atan2(dy, dx);
  const delta = turnBy(car.angle, aim);
  const steer = bound(delta * 2.4, -3.2, 3.2) * (speed < -1 ? -1 : 1);
  car.angle += steer * dt;
  car.speed = speed;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  return true;
}

// --- Traffic ------------------------------------------------------------------------
// Is there something solid ahead on this car's heading: a car, a person, a
// blocked road, or a building? Traffic slows for it, and the car it sees
// the road with is never itself.
export function aheadBlocked(state, car, lookAhead) {
  const aheadX = car.x + Math.cos(car.angle) * lookAhead;
  const aheadY = car.y + Math.sin(car.angle) * lookAhead;
  const probe = { x: aheadX, y: aheadY };
  if (pushOutOfBuildings(state.city, probe, 8)) return true;
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const other = cars[i];
    if (other === car || other.hp <= 0 || other.kind === 'parked' || other.block) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < 62 * 62) {
      const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      if (forward > 0) return true;
    }
  }
  const peds = state.peds;
  for (let i = 0; i < peds.length; i += 1) {
    const ped = peds[i];
    if (ped.hp <= 0) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < 64 * 64) {
      const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      if (forward > 0) return true;
    }
  }
  // A player on foot is treated like a pedestrian: traffic yields to him too.
  const p = state.player;
  if (!p.inCar && p.hp > 0) {
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < 95 * 95) {
      const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      if (forward > 0) return true;
    }
  }
  return false;
}

// Traffic drifts at its own pace and waits for anything in its way. A car
// that has not moved in a while gets a fresh target node; a car that has
// spent too long at zero speed gets a nudge by hand so a jam never freezes
// a street forever.
export function runTraffic(state, dt) {
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    if (car.hp <= 0) continue;
    const base = car.targetNode || pickNextNode(state, car);
    if (Math.hypot(base.x - car.x, base.y - car.y) < 40) {
      car.targetNode = pickNextNode(state, car);
    }
    if (aheadBlocked(state, car, 68)) {
      if (Math.abs(car.speed) > 20) car.speed = mix(car.speed, 0, bound(8 * dt, 0, 1));
      else car.speed = 0;
      car.stuckT += dt;
      if (car.stuckT > 6) {
        car.targetNode = pickNextNode(state, car);
        car.stuckT = 0;
      }
      continue;
    }
    if (aheadBlocked(state, car, 150)) car.speed = Math.min(car.speed, 48);
    car.stuckT = 0;
    const wantSpeed = car.speed >= 0 ? 165 : -165;
    car.speed = mix(car.speed, wantSpeed, bound(1.2 * dt, 0, 1));
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (Math.hypot(car.targetNode.x - car.x, car.targetNode.y - car.y) < 32) {
      car.targetNode = pickNextNode(state, car, true);
    }
    if (pushOutOfBuildings(state.city, car, 20)) {
      car.speed *= 0.6;
      const near = nearestNode(state.city, car.x, car.y);
      car.targetNode = near;
    }
    car.despawnT += dt;
    if (car.despawnT > 75 && state.player.inCar !== car && Math.hypot(car.x - state.player.x, car.y - state.player.y) > 1300) {
      car.despawnT = 0;
      const spot = nearestNode(state.city, state.player.x + 900, state.player.y + 900);
      if (spot) {
        car.x = spot.x;
        car.y = spot.y;
        car.node = spot;
        car.targetNode = pickNextNode(state, car);
      }
    }
  }
}

// --- Pedestrians ----------------------------------------------------------------------
// Pedestrians wander on their own slow routes. When the heat or a nearby
// shot frightens them they break into a run in a random direction for a few
// seconds, so a shootout scatters the plaza.
export function frightenPeds(state, x, y, radius = 420, duration = 3) {
  for (const ped of state.peds) {
    if (ped.hp <= 0) continue;
    if (d2(ped.x, ped.y, x, y) < radius * radius) {
      ped.panicT = duration;
      ped.targetNode = {
        x: ped.x + (state.rng() - 0.5) * 900,
        y: ped.y + (state.rng() - 0.5) * 900,
      };
    }
  }
}

export function strollPeds(state, dt) {
  const playerCar = state.player.inCar;
  for (const ped of state.peds) {
    if (ped.hp <= 0) continue;
    // A speeding player car sends pedestrians diving out of the way: if the
    // car is close and fast and heading at the ped, the ped panics and runs
    // sideways, so a fast drive through town does not mow the crowd down
    // and the wanted level with it. At low speed they do not dodge — a
    // slow car through a crowd is still a crime.
    if (playerCar && Math.abs(playerCar.speed) > 100 && ped.panicT <= 0) {
      const dist = Math.hypot(ped.x - playerCar.x, ped.y - playerCar.y);
      if (dist < 200) {
        const ahead = (ped.x - playerCar.x) * Math.cos(playerCar.angle) + (ped.y - playerCar.y) * Math.sin(playerCar.angle);
        if (ahead > 0) {
          ped.panicT = 1.5;
          const side = state.rng() < 0.5 ? 1 : -1;
          const px = -Math.sin(playerCar.angle) * side;
          const py = Math.cos(playerCar.angle) * side;
          ped.targetNode = { x: ped.x + px * 220, y: ped.y + py * 220 };
        }
      }
    }
    const target = ped.targetNode;
    if (target) {
      const dist = Math.hypot(target.x - ped.x, target.y - ped.y);
      if (dist < 30) {
        ped.node = nearestNode(state.city, ped.x, ped.y);
        const pick = adjacent(state.city, ped.node);
        ped.targetNode = pick[Math.floor(state.rng() * pick.length)] || null;
        ped.panicT = 0;
      } else {
        const speed = ped.panicT > 0 ? ped.speed * 2.6 : ped.speed;
        const aim = angleTo(ped.x, ped.y, target.x, target.y);
        ped.angle = steerTo(ped.angle, aim, dt * 6);
        ped.x += Math.cos(ped.angle) * speed * dt;
        ped.y += Math.sin(ped.angle) * speed * dt;
      }
    } else {
      ped.node = nearestNode(state.city, ped.x, ped.y);
      const pick = adjacent(state.city, ped.node);
      ped.targetNode = pick[Math.floor(state.rng() * pick.length)] || null;
    }
    if (ped.panicT > 0) ped.panicT -= dt;
    pushOutOfBuildings(state.city, ped, 13);
    const probe = { x: ped.x, y: ped.y };
    if (isWater(state.city, probe.x, probe.y)) {
      ped.x -= Math.cos(ped.angle) * 40 * dt;
      ped.y -= Math.sin(ped.angle) * 40 * dt;
    }
  }
}

// --- Police ----------------------------------------------------------------------------
// A cruiser spawns out of sight and chases. While driving it steers toward
// the player's predicted position and rams; on foot it closes in and, once
// close, holds the player for the bust. A busted player resets the mission,
// so police pressure is the mission clock as much as the timer is.
export function spawnCop(state, playerPos) {
  const p = state.player;
  const angle = state.rng() * Math.PI * 2;
  const bx = p.x + Math.cos(angle) * POLICE.spawnDist;
  const by = p.y + Math.sin(angle) * POLICE.spawnDist;
  const probe = { x: bx, y: by };
  if (isWater(state.city, probe.x, probe.y)) return null;
  const car = buildCar('police', bx, by, 0, '', null, state.rng);
  car.node = nearestNode(state.city, bx, by);
  car.targetNode = pickNextNode(state, car);
  state.cars.push(car);
  return car;
}

export function huntCops(state, dt) {
  const p = state.player;
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    const car = state.cars[i];
    if (car.kind !== 'police' || car.hp <= 0) continue;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const dist = Math.hypot(dx, dy);
    // A cruiser that has lost the player — far away for six seconds —
    // gives up and leaves, instead of circling the city forever.
    if (dist > POLICE.giveUpDist) {
      car.despawnT += dt;
      if (car.despawnT > 6) {
        state.cars.splice(i, 1);
        continue;
      }
    } else {
      car.despawnT = 0;
    }
    const driveX = p.x + (p.inCar ? Math.cos(p.inCar.angle) * p.inCar.speed * 0.35 : 0);
    const driveY = p.y + (p.inCar ? Math.sin(p.inCar.angle) * p.inCar.speed * 0.35 : 0);
    car.speed = mix(car.speed, POLICE.maxSpeed, bound(1.6 * dt, 0, 1));
    steerToward(car, driveX, driveY, dt, car.speed);
    if (pushOutOfBuildings(state.city, car, 20)) car.speed *= 0.6;
    if (!p.inCar && p.hp > 0 && dist < 70) {
      // A cruiser right on a player on foot holds him for the bust.
      p.bustedT += dt;
      car.speed = 0;
    }
  }
  // Wanted stars decay only while no cruiser is close and the helicopter is
  // not circling; the helicopter's presence keeps the heat on by itself.
  if (p.wanted > 0) {
    let nearest = Infinity;
    for (const car of state.cars) {
      if (car.kind !== 'police' || car.hp <= 0) continue;
      const dist = Math.hypot(p.x - car.x, p.y - car.y);
      if (dist < nearest) nearest = dist;
    }
    if (nearest > 700 && !state.heli.active) {
      p.quietT += dt;
      if (p.quietT > WANTED.decayQuiet) {
        p.decayT += dt;
        if (p.decayT >= WANTED.decayStep) {
          p.wanted -= 1;
          p.decayT = 0;
          if (p.wanted === 0) p.quietT = 0;
        }
      }
    } else {
      p.quietT = 0;
      p.decayT = 0;
    }
  }
}

// Keep wanted + 1 cruisers on the map, up to five, while the heat is up.
export function topUpCops(state) {
  const p = state.player;
  let active = 0;
  for (const car of state.cars) if (car.kind === 'police' && car.hp > 0) active += 1;
  const want = Math.min(POLICE.maxActive, p.wanted > 0 ? p.wanted + 1 : 0);
  if (active < want) {
    const car = spawnCop(state, p);
    if (!car) state.spawnCd = 0.4;
  }
}

// --- Thugs -----------------------------------------------------------------------------
// A thug stands in the open, shoots at the player when he is close, and
// reloads in bursts. The helicopter marks the player for them; in the
// finale, a second wave joins once the first is down.
export function spawnThug(state, x, y) {
  const enemy = {
    x, y, angle: 0, hp: WEAPON.enemyHp,
    shootCd: 0.3 + state.rng() * 0.6, speed: 95, dead: false,
  };
  state.enemies.push(enemy);
  return enemy;
}

// --- Helicopter -------------------------------------------------------------------------
// At five stars the helicopter arrives and shadows the player from above.
// While it is up, the wanted level cannot decay, and it marks the player
// for the police. It hangs back once the heat falls below five and leaves.
export function circleHeli(state, dt) {
  const p = state.player;
  const heli = state.heli;
  if (p.wanted >= 5 && !heli.active) {
    heli.active = true;
    heli.x = p.x + 420;
    heli.y = p.y - 420;
    heli.coolT = 0;
  }
  if (heli.active) {
    const dist = Math.hypot(p.x - heli.x, p.y - heli.y);
    if (p.wanted < 5) {
      heli.active = false;
      return;
    }
    const wantAngle = angleTo(heli.x, heli.y, p.x, p.y);
    heli.angle = steerTo(heli.angle, wantAngle, dt * 2);
    const circleAngle = Math.atan2(heli.y - p.y, heli.x - p.x);
    const targetAngle = circleAngle + dt * 0.5;
    const targetX = p.x + Math.cos(targetAngle) * HELI.hoverRadius;
    const targetY = p.y + Math.sin(targetAngle) * HELI.hoverRadius;
    heli.x = mix(heli.x, targetX, bound(dt * 1.6, 0, 1));
    heli.y = mix(heli.y, targetY, bound(dt * 1.6, 0, 1));
    heli.coolT -= dt;
    if (heli.coolT <= 0) {
      heli.coolT = HELI.coolDown;
      // The helicopter's spotlight picks out the player's car for the
      // cruisers; their spawn cooldown runs short while it is up.
      if (state.spawnCd > POLICE.heliSpawnCd) state.spawnCd = POLICE.heliSpawnCd;
    }
  }
}

// --- Roadblocks ---------------------------------------------------------------------------
// A roadblock is two cruisers parked across the road ahead of the player,
// staggered so the gap between them is passable if the player is quick and
// lucky. A fresh one goes up when the heat crosses three stars, and a new
// one follows nine seconds after the player slips through.
export function dropRoadblock(state, playerPos) {
  const p = state.player;
  const heading = p.inCar ? p.inCar.angle : p.angle;
  const centre = {
    x: p.x + Math.cos(heading) * ROADBLOCK.aheadDist,
    y: p.y + Math.sin(heading) * ROADBLOCK.aheadDist,
  };
  const city = state.city;
  const closest = nearestNode(city, centre.x, centre.y);
  const horizontal = Math.abs(centre.y - closest.y) < 60;
  if (horizontal) {
    const axisY = closest.y;
    const carA = buildCar('police', centre.x - 90, axisY, Math.PI / 2, '', null, state.rng);
    const carB = buildCar('police', centre.x + 90, axisY, Math.PI / 2, '', null, state.rng);
    carA.block = true;
    carB.block = true;
    carA.blockAxis = 'h';
    carB.blockAxis = 'h';
    carA.angle = Math.PI / 2;
    carB.angle = Math.PI / 2;
    state.cars.push(carA, carB);
  } else {
    const axisX = closest.x;
    const carA = buildCar('police', axisX, centre.y - 90, 0, '', null, state.rng);
    const carB = buildCar('police', axisX, centre.y + 90, 0, '', null, state.rng);
    carA.block = true;
    carB.block = true;
    carA.blockAxis = 'v';
    carB.blockAxis = 'v';
    state.cars.push(carA, carB);
  }
  state.roadblockCd = ROADBLOCK.respawn;
}

export function watchRoadblocks(state) {
  const p = state.player;
  if (p.wanted >= ROADBLOCK.minWanted && state.prevWanted < ROADBLOCK.minWanted && state.roadblockCd <= 0) {
    dropRoadblock(state, p);
  } else if (state.roadblockCd > 0) {
    state.roadblockCd -= 1 / 60;
  }
  // A block the player has passed is no longer in play: drop it so it does
  // not linger behind and confuse the renderer or the chase.
  const cars = state.cars;
  for (let i = cars.length - 1; i >= 0; i -= 1) {
    const car = cars[i];
    if (car.block && Math.hypot(car.x - p.x, car.y - p.y) > 1100) cars.splice(i, 1);
  }
}

// The nearest car the player could steal: a parked car or an unoccupied
// player car; a traffic car is only used when nothing parked is near, and
// police cars are never stealable.
export function closestStealable(state, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'parked' && car.kind !== 'player') continue;
    if (car.hp <= 0 || car.occupied) continue;
    const dist = Math.hypot(car.x - x, car.y - y);
    if (dist < bestD) {
      bestD = dist;
      best = car;
    }
  }
  if (best) return best;
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.hp <= 0 || car.occupied) continue;
    const dist = Math.hypot(car.x - x, car.y - y);
    if (dist < bestD) {
      bestD = dist;
      best = car;
    }
  }
  return best;
}
