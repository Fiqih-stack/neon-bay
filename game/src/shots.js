// Neon Bay screenshot scenes behind ?shot=cover|chase|mission|street.
// Each one builds the real world from the seed, plays it forward a fixed
// number of steps with a simple autopilot, and leaves a frame that shows
// the game at its most complete: driving with traffic, a five-star chase
// with the helicopter, the finale shootout at the plaza, and a street on
// foot by the safehouse.

import { CITY, bound, steerTo, angleTo } from './config.js';
import { newGame, spawnOwnCar, nearestNode, adjacent } from './world.js';
import { openMission } from './missions.js';
import { runTraffic, strollPeds, huntCops, topUpCops, circleHeli, watchRoadblocks, spawnThug, dropRoadblock, closestStealable } from './ai.js';

// One fixed step of the world, without the player: traffic, pedestrians,
// police, helicopter and roadblocks, in that order.
function advanceWorld(state, dt) {
  runTraffic(state, dt);
  strollPeds(state, dt);
  huntCops(state, dt);
  topUpCops(state);
  circleHeli(state, dt);
  watchRoadblocks(state);
  state.time += dt;
}

// Drive a car along the grid toward a point: pick the neighbouring node
// that gets closer, steer toward it, and brake for the turn. Returns true
// once the car is within the radius.
function driveCarTo(state, car, tx, ty, radius, topSpeed = 300) {
  const dist = Math.hypot(tx - car.x, ty - car.y);
  if (dist < radius) return true;
  const node = nearestNode(state.city, car.x, car.y);
  const options = adjacent(state.city, node);
  let best = null;
  let bestD = Infinity;
  for (const n of options) {
    const nd = Math.hypot(n.x - tx, n.y - ty);
    if (nd < bestD) {
      bestD = nd;
      best = n;
    }
  }
  const target = best || { x: tx, y: ty };
  const aim = angleTo(car.x, car.y, target.x, target.y);
  const turn = Math.abs(((aim - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const speed = turn > 0.6 ? 120 : topSpeed;
  car.angle = steerTo(car.angle, aim, 0.12);
  car.speed = speed;
  car.x += Math.cos(car.angle) * car.speed * (1 / 60);
  car.y += Math.sin(car.angle) * car.speed * (1 / 60);
  return false;
}

// Walk the player toward a point on the grid, one node at a time.
function walkPlayerTo(state, tx, ty, radius) {
  const p = state.player;
  const dist = Math.hypot(tx - p.x, ty - p.y);
  if (dist < radius) return true;
  const node = nearestNode(state.city, p.x, p.y);
  const options = adjacent(state.city, node);
  let best = null;
  let bestD = Infinity;
  for (const n of options) {
    const nd = Math.hypot(n.x - tx, n.y - ty);
    if (nd < bestD) {
      bestD = nd;
      best = n;
    }
  }
  const target = best || { x: tx, y: ty };
  const aim = angleTo(p.x, p.y, target.x, target.y);
  p.angle = steerTo(p.angle, aim, 0.2);
  p.x += Math.cos(p.angle) * 200 * (1 / 60);
  p.y += Math.sin(p.angle) * 200 * (1 / 60);
  return false;
}

// Put the player in a car: mark it stolen, count it, and raise the heat by
// one star, unless it is the player's own coupe.
function putInCar(state, car) {
  const p = state.player;
  p.inCar = car;
  car.occupied = true;
  p.x = car.x;
  p.y = car.y;
  if (car.kind !== 'player') {
    car.stolen = true;
    state.stats.stolen += 1;
    if (p.wanted < 5) p.wanted += 1;
  }
}

// Keep the camera on the player, with a lookahead in the driving direction.
function followCam(state) {
  const p = state.player;
  const look = p.inCar ? 120 : 40;
  state.cam.x = p.x + Math.cos(p.angle) * look;
  state.cam.y = p.y + Math.sin(p.angle) * look;
}

// --- Scenes --------------------------------------------------------------------
// Cover: the teal coupe driving north up Bayfront Ave, the bay glittering
// on the left, traffic all around, the first mission banner on the HUD.
function coverShot(state) {
  const car = spawnOwnCar(state);
  // Start on the road by the pier and drive north up Bayfront Ave, so the
  // bay stays glittering on the left of the frame for the whole shot.
  car.x = 440;
  car.y = 1540;
  car.angle = -Math.PI / 2;
  putInCar(state, car);
  openMission(state, 0);
  for (let i = 0; i < 240; i += 1) {
    driveCarTo(state, car, car.x, 0, 60, 320);
    advanceWorld(state, 1 / 60);
    followCam(state);
  }
  state.cam.x = car.x + 120;
  state.cam.y = car.y - 60;
}

// Chase: five wanted stars, the helicopter circling overhead, a roadblock
// across the road ahead, the getaway at full speed.
function chaseShot(state) {
  const car = spawnOwnCar(state);
  putInCar(state, car);
  openMission(state, 2);
  // openMission's begin() sets the heat to 2; the chase needs five stars,
  // so the wanted level goes up after the mission starts.
  state.player.wanted = 5;
  state.mission.timer = 30;
  for (let i = 0; i < 300; i += 1) {
    driveCarTo(state, car, 2640, 2200, 80, 420);
    advanceWorld(state, 1 / 60);
    followCam(state);
  }
  dropRoadblock(state, state.player);
  for (let i = 0; i < 60; i += 1) {
    advanceWorld(state, 1 / 60);
    followCam(state);
  }
}

// Mission: the final stand at the deal plaza — the Tide crew in the open,
// the objective marker on the HUD.
function missionShot(state) {
  openMission(state, 7);
  const plaza = state.city.dealPlaza;
  const p = state.player;
  p.x = plaza.x;
  p.y = plaza.y + 180;
  p.angle = -Math.PI / 2;
  // A stolen car nearby, parked at the plaza edge, for the escape.
  const car = spawnOwnCar(state);
  car.x = plaza.x + 140;
  car.y = plaza.y + 140;
  for (let i = 0; i < 120; i += 1) {
    advanceWorld(state, 1 / 60);
    followCam(state);
  }
  state.cam.x = plaza.x;
  state.cam.y = plaza.y;
}

// Street: Jax on foot by the safehouse, a parked car waiting to be taken,
// a neon token on the sidewalk, pedestrians strolling by.
function streetShot(state) {
  const p = state.player;
  p.x = state.city.safehouse.x + 60;
  p.y = state.city.safehouse.y - 60;
  p.angle = Math.PI / 2;
  // A parked car close by, so the "E — STEAL CAR" prompt shows.
  const near = closestStealable(state, p.x, p.y);
  if (near) {
    near.x = p.x + 50;
    near.y = p.y + 20;
  }
  openMission(state, 1);
  for (let i = 0; i < 90; i += 1) {
    advanceWorld(state, 1 / 60);
    followCam(state);
  }
  state.prompt = 'E — STEAL CAR';
  state.cam.x = p.x + 40;
  state.cam.y = p.y - 20;
}

export function stageScene(seed, scene) {
  const state = newGame(seed);
  state.prompt = '';
  if (scene === 'cover') coverShot(state);
  else if (scene === 'chase') chaseShot(state);
  else if (scene === 'mission') missionShot(state);
  else if (scene === 'street') streetShot(state);
  else coverShot(state);
  window.__shotReady = true;
  return state;
}
