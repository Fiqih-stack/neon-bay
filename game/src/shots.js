// Neon Bay screenshot scenes behind ?shot=cover|chase|mission|street.
// Each one builds the real world from the seed, plays it forward a fixed number
// of steps with a simple autopilot, and leaves a frame that shows the game at its
// most complete: driving with traffic, a police chase, a mission in progress, and
// a street on foot. The same seed always gives the same frame.

import { STEP, PLAYER, PALETTE, angleTo, dist2 } from './config.js';
import { nearestNode, neighborsOf, collideBuildings, inWater } from './world.js';
import { updateTraffic, updatePeds, updatePolice, maintainPolice, steerToward, spawnPolice } from './ai.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY } from './render.js';

/** Push overlapping cars apart so the staged frame never shows cars inside cars. */
function separateCars(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 42 * 42 || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const push = (42 - d) / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
    }
  }
}

/**
 * Play the world forward. `drive` steers the player's car along the road graph;
 * `walkTo` walks the player on foot toward a point. Traffic, pedestrians and the
 * police all run their real rules while it plays.
 */
function sim(state, seconds, drive, walkTo) {
  const steps = Math.floor(seconds / STEP);
  for (let n = 0; n < steps; n += 1) {
    state.time += STEP;
    const p = state.player;
    if (drive && p.inCar) {
      const car = p.inCar;
      if (!car.targetNode) car.targetNode = nearestNode(state.city, car.x, car.y);
      if (dist2(car.x, car.y, car.targetNode.x, car.targetNode.y) < 40 * 40) {
        car.prevNode = car.node;
        car.node = car.targetNode;
        const opts = neighborsOf(state.city, car.node).filter((node) => !(car.prevNode && node.i === car.prevNode.i && node.j === car.prevNode.j));
        car.targetNode = opts[Math.floor(state.rng() * opts.length)] || car.node;
      }
      steerToward(car, car.targetNode.x, car.targetNode.y, STEP, 430);
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = car.speed;
    } else if (walkTo) {
      const d = Math.sqrt(dist2(p.x, p.y, walkTo.x, walkTo.y));
      if (d > 60) {
        const a = angleTo(p.x, p.y, walkTo.x, walkTo.y);
        p.angle = a;
        const nx = p.x + Math.cos(a) * PLAYER.walkSpeed * STEP;
        const ny = p.y + Math.sin(a) * PLAYER.walkSpeed * STEP;
        const probe = { x: nx, y: ny };
        if (!collideBuildings(state.city, probe, PLAYER.radius) && !inWater(state.city, probe.x, probe.y)) {
          p.x = nx;
          p.y = ny;
        }
      }
    }
    updateTraffic(state, STEP);
    updatePeds(state, STEP);
    updatePolice(state, STEP);
    maintainPolice(state, STEP);
    separateCars(state);
    state.cam.x = p.x;
    state.cam.y = p.y;
  }
}

/** The player's teal coupe, parked by the safehouse at the start of every game. */
function playerCar(state) {
  for (let i = 0; i < state.cars.length; i += 1) {
    if (state.cars[i].color === PALETTE.playerCar) return state.cars[i];
  }
  return state.cars[0];
}

function putPlayerInCar(state, car, x, y, angle) {
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  car.kind = 'player';
  car.stolen = true;
  car.node = nearestNode(state.city, x, y);
  car.targetNode = nearestNode(state.city, x + Math.cos(angle) * 440, y + Math.sin(angle) * 440);
  const p = state.player;
  p.inCar = car;
  p.x = x;
  p.y = y;
  p.angle = angle;
}

/** Cover: driving north up Bayfront Ave with the bay on the left and traffic around. */
function stageCover(state) {
  startMission(state, 0);
  const car = playerCar(state);
  putPlayerInCar(state, car, 0, 2500, -Math.PI / 2);
  sim(state, 14, true, null);
  return { screen: SCREEN_PLAY };
}

/** Chase: three stars, police cars closing in, the getaway in full swing. */
function stageChase(state) {
  startMission(state, 2);
  state.player.wanted = 3;
  // The mission text says two stars; this scene runs at three — say so.
  state.dialog.lines = ['MARA: Three stars, Rook. The whole bay is on you.', 'Lose them in the streets — do not get busted.'];
  state.dialog.i = 0;
  state.dialog.t = 0;
  const car = playerCar(state);
  putPlayerInCar(state, car, 880, 2200, 0);
  spawnPolice(state, 500, 2200);
  spawnPolice(state, 880, 1760);
  spawnPolice(state, 1320, 2200);
  sim(state, 10, true, null);
  return { screen: SCREEN_PLAY };
}

/** Mission: on foot at the deal plaza, the Tide crew in sight, objective on the HUD. */
function stageMission(state) {
  startMission(state, 3);
  const p = state.player;
  p.x = 1540;
  p.y = 1320;
  p.angle = Math.PI / 2;
  sim(state, 6, false, { x: 1540, y: 1500 });
  return { screen: SCREEN_PLAY };
}

/** Street: on foot by the safehouse, a car to steal, pedestrians on the sidewalk. */
function stageStreet(state) {
  startMission(state, 0);
  const p = state.player;
  p.x = 440;
  p.y = 440;
  // A few pedestrians strolling the same block, for life in the frame.
  for (let i = 0; i < 3 && i < state.peds.length; i += 1) {
    state.peds[i].x = 420 + i * 46;
    state.peds[i].y = 560 + (i % 2) * 40;
    state.peds[i].targetNode = nearestNode(state.city, 880, 560);
  }
  const car = playerCar(state);
  sim(state, 4, false, { x: car.x, y: car.y });
  state.prompt = 'E — STEAL CAR';
  return { screen: SCREEN_PLAY };
}

/**
 * Set the world to the named scene (cover, chase, mission or street; any other
 * name is the street) and return the screen to draw over it.
 */
export function stageShot(name, state) {
  if (name === 'cover') return stageCover(state);
  if (name === 'chase') return stageChase(state);
  if (name === 'mission') return stageMission(state);
  return stageStreet(state);
}
