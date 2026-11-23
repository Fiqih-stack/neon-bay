// Neon Bay boot and loop: input every frame, the world in fixed 1/60 s steps, and
// the renderer paints what is there. Screens: title, play, paused, busted, wasted,
// and the story-complete card. Progress saves to local storage automatically.
//
// ?seed=N fixes the city. ?shot=cover|chase|mission|street (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady.

import { VIEW, STEP, SAVE_KEY, CAR, PLAYER, WEAPON, WANTED, POLICE, TAXI, TOKENS, clamp, dist2, angleTo, angleDiff, angleLerp, lerp } from './config.js';
import { createState, spawnPlayerCar, collideBuildings, inWater, clampToCity, nearestNode, randomRoadPoint } from './world.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_RELOAD, ACTION_PUNCH, ACTION_MUTE, ACTION_WEAPON1, ACTION_WEAPON2, ACTION_HORN, ACTION_RADIO } from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_WASTED, SCREEN_END } from './render.js';
import { updateTraffic, updatePeds, updatePolice, maintainPolice, spawnPolice, scarePeds, nearestStealable, steerToward, updateHeli, maintainRoadblocks } from './ai.js';
import { startMission, updateMission, addWanted, STORY_INTRO, MISSIONS } from './missions.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createState(seed);
// A debug handle for the playtest only: ?debug=1 exposes the live state.
if (params.get('debug')) window.__neonBay = state;
const renderer = createRenderer(canvas);
const audio = createAudio();
spawnPlayerCar(state);

function announce(message) {
  status.textContent = message;
}

function saveGame() {
  try {
    const p = state.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: p.money, hp: p.hp, wanted: p.wanted, weapon: p.weapon, ammo: p.ammo,
      x: p.x, y: p.y, mission: state.mission.index, storyDone: state.mission.storyDone,
    }));
  } catch {
    // Storage can be off: the game then lasts this visit only.
  }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applySave(save) {
  const p = state.player;
  p.money = save.money;
  p.hp = save.hp;
  p.wanted = save.wanted;
  p.weapon = save.weapon || 'pistol';
  p.ammo = save.ammo ?? 12;
  p.x = save.x;
  p.y = save.y;
  p.inCar = null;
  if (save.storyDone) {
    state.mission.storyDone = true;
    state.mission.text = 'Story complete — free roam Neon Bay';
    state.mission.target = null;
  } else {
    startMission(state, Math.min(save.mission || 0, MISSIONS.length - 1));
  }
}

function burst(x, y, n, color, speed) {
  for (let i = 0; i < n; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const s = (0.3 + state.rng() * 0.7) * speed;
    state.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + state.rng() * 0.4, max: 0.9, color, size: 2 + state.rng() * 3 });
  }
}

/** Taxi fares: the free-roam side job, and the scripted ride of mission 7. */
function spawnFare(state, pickup, dest, mission) {
  const d = Math.sqrt(dist2(pickup.x, pickup.y, dest.x, dest.y));
  const pay = mission ? 0 : Math.min(TAXI.maxPay, TAXI.minPay + Math.floor(d / 100) * 10);
  state.taxi = { state: 'waiting', mission: !!mission, fare: pickup, dest, timer: TAXI.rideTime, pay, cooldown: 0 };
}

function spawnRandomFare(state) {
  const a = randomRoadPoint(state.city, state.rng);
  let b = randomRoadPoint(state.city, state.rng);
  let guard = 0;
  while (dist2(a.x, a.y, b.x, b.y) < 800 * 800 && guard < 8) {
    b = randomRoadPoint(state.city, state.rng);
    guard += 1;
  }
  spawnFare(state, { x: a.x, y: a.y }, { x: b.x, y: b.y }, false);
}

function tryTaxiPickup(state) {
  const taxi = state.taxi;
  const p = state.player;
  if (taxi.state !== 'waiting' || !p.inCar) return false;
  if (dist2(p.x, p.y, taxi.fare.x, taxi.fare.y) > TAXI.pickupRange * TAXI.pickupRange) return false;
  taxi.state = 'riding';
  taxi.timer = TAXI.rideTime;
  audio.pickup();
  state.dialog.lines = [taxi.mission ? 'FARE: The pier road, driver. And step on it.' : 'FARE: Thanks for stopping. Take me across town, quick.'];
  state.dialog.i = 0;
  state.dialog.t = 0;
  return true;
}

function updateTaxi(state, dt) {
  const taxi = state.taxi;
  if (taxi.state === 'idle' || taxi.state === 'done') {
    // Free-roam fares only: the story's own taxi job runs mission 7.
    if (state.mission.storyDone) {
      taxi.cooldown -= dt;
      if (taxi.cooldown <= 0) spawnRandomFare(state);
    }
    return;
  }
  if (taxi.state === 'waiting') return;
  if (taxi.state !== 'riding') return;
  taxi.timer -= dt;
  const p = state.player;
  if (dist2(p.x, p.y, taxi.dest.x, taxi.dest.y) < TAXI.dropRange * TAXI.dropRange) {
    if (!taxi.mission && taxi.pay > 0) {
      p.money += taxi.pay;
      state.stats.earned += taxi.pay;
    }
    taxi.state = 'done';
    audio.missionDone();
    state.dialog.lines = [taxi.mission ? 'FARE: Right on time.' : 'FARE: Perfect. Keep the change — $' + taxi.pay + '.'];
    state.dialog.i = 0;
    state.dialog.t = 0;
    if (!taxi.mission) {
      taxi.cooldown = TAXI.respawnDelay;
      taxi.state = 'idle';
      taxi.fare = null;
      taxi.dest = null;
    }
    return;
  }
  if (taxi.timer <= 0) {
    taxi.state = taxi.mission ? 'failed' : 'idle';
    taxi.cooldown = TAXI.respawnDelay;
    state.dialog.lines = ['FARE: Too slow — I am walking from here.'];
    state.dialog.i = 0;
    state.dialog.t = 0;
    if (!taxi.mission) {
      taxi.fare = null;
      taxi.dest = null;
    }
  }
}

function shake(amount) {
  state.cam.shake = Math.min(16, state.cam.shake + amount);
}

function damageCar(car, amount, fromX, fromY) {
  car.hp -= amount;
  burst(car.x, car.y, 6, '#ffb347', 160);
  if (car.hp <= 0) {
    burst(car.x, car.y, 26, '#ff7a1a', 320);
    burst(car.x, car.y, 14, '#3a3a44', 140);
    audio.crash(1);
    shake(10);
    if (state.player.inCar === car) {
      state.player.inCar = null;
      state.player.x = car.x + 40;
      state.player.y = car.y;
    }
  }
}

function hitPed(ped, amount, fromX, fromY) {
  ped.hp -= amount;
  ped.panicT = 4;
  burst(ped.x, ped.y, 5, '#ff6b81', 120);
  if (ped.hp <= 0) {
    addWanted(state, WANTED.hitPed);
    audio.wantedUp();
  }
}

function respawn(reason) {
  const p = state.player;
  const loss = Math.floor(p.money * 0.2);
  state.bustedLoss = loss;
  p.money -= loss;
  p.hp = 100;
  p.wanted = 0;
  p.bustedT = 0;
  p.inCar = null;
  p.x = state.city.hospital.x;
  p.y = state.city.hospital.y;
  p.angle = 0;
  state.enemies = [];
  state.bullets = [];
  if (state.taxi.state === 'riding') {
    state.taxi.state = 'idle';
    state.taxi.cooldown = TAXI.respawnDelay;
    state.taxi.fare = null;
    state.taxi.dest = null;
  }
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    if (state.cars[i].kind === 'police') state.cars.splice(i, 1);
  }
  state.cam.x = p.x;
  state.cam.y = p.y;
  state.stats.busted += 1;
  if (!state.mission.storyDone) startMission(state, state.mission.index);
  saveGame();
  return reason === 'busted' ? SCREEN_BUSTED : SCREEN_WASTED;
}

function enterCar(car) {
  const p = state.player;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  if (car.kind === 'parked' || car.kind === 'traffic') {
    if (!car.stolen) {
      car.stolen = true;
      state.stats.stolen += 1;
      addWanted(state, WANTED.stealCar);
      audio.wantedUp();
      state.dialog.lines = ['JAX: This one is mine now.'];
      state.dialog.i = 0;
      state.dialog.t = 0;
    }
    car.occupied = false;
    car.kind = 'player';
  }
  audio.click();
}

function exitCar() {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  p.inCar = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.angle = car.angle;
  car.speed = 0;
  const probe = { x: p.x, y: p.y };
  if (collideBuildings(state.city, probe, PLAYER.radius) || inWater(state.city, probe.x, probe.y)) {
    p.x = car.x - Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y - Math.sin(car.angle + Math.PI / 2) * 34;
  }
  audio.click();
}

function fireBullet(fromX, fromY, angle, from, damage) {
  state.bullets.push({
    x: fromX + Math.cos(angle) * 22,
    y: fromY + Math.sin(angle) * 22,
    vx: Math.cos(angle) * WEAPON.bulletSpeed,
    vy: Math.sin(angle) * WEAPON.bulletSpeed,
    life: WEAPON.pistolRange / WEAPON.bulletSpeed,
    from, damage,
  });
  burst(fromX + Math.cos(angle) * 26, fromY + Math.sin(angle) * 26, 3, '#ffe27a', 90);
}

function punch() {
  const p = state.player;
  if (p.punchCd > 0 || p.inCar) return;
  p.punchCd = PLAYER.punchCd;
  audio.punch();
  for (let i = 0; i < state.enemies.length; i += 1) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;
    const d = Math.sqrt(dist2(p.x, p.y, e.x, e.y));
    const a = Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, e.x, e.y)));
    if (d < PLAYER.punchRange && a < PLAYER.punchArc) {
      e.hp -= PLAYER.punchDamage;
      e.x += Math.cos(p.angle) * 18;
      e.y += Math.sin(p.angle) * 18;
      burst(e.x, e.y, 4, '#ffe27a', 120);
      if (e.hp <= 0) addWanted(state, 0);
    }
  }
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (ped.hp <= 0) continue;
    const d = Math.sqrt(dist2(p.x, p.y, ped.x, ped.y));
    const a = Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, ped.x, ped.y)));
    if (d < PLAYER.punchRange && a < PLAYER.punchArc) hitPed(ped, PLAYER.punchDamage, p.x, p.y);
  }
}

function shoot() {
  const p = state.player;
  if (p.inCar || p.weapon !== 'pistol' || p.shootCd > 0 || p.reloadT > 0) return;
  if (p.ammo <= 0) {
    p.reloadT = WEAPON.pistolReload;
    audio.reload();
    return;
  }
  p.ammo -= 1;
  p.shootCd = 0.22;
  fireBullet(p.x, p.y, p.angle, 'player', WEAPON.pistolDamage);
  audio.shot();
  scarePeds(state, p.x, p.y, 260);
  const nearCop = state.cars.some((c) => c.kind === 'police' && dist2(c.x, c.y, p.x, p.y) < 500 * 500);
  if (nearCop) addWanted(state, WANTED.shootNearCop);
}

function updatePlayer(dt, input) {
  const p = state.player;
  const city = state.city;
  p.crimeCd = Math.max(0, p.crimeCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.punchCd = Math.max(0, p.punchCd - dt);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) p.ammo = WEAPON.pistolAmmo;
  }
  // Aim follows the mouse.
  const mouse = input.mouse();
  const rectScale = VIEW.width / canvas.clientWidth;
  const vx = clamp(state.cam.x - VIEW.width / 2, city.water.x0, city.size + 42 - VIEW.width);
  const vy = clamp(state.cam.y - VIEW.height / 2, -42, city.size + 42 - VIEW.height);
  const wx = vx + mouse.x * rectScale;
  const wy = vy + mouse.y * rectScale;
  if (!p.inCar) p.angle = angleTo(p.x, p.y, wx, wy);

  if (p.inCar) {
    const car = p.inCar;
    const fwd = input.moveY() * -1;
    const steer = input.moveX();
    if (fwd > 0) car.speed += car.acc * dt;
    else if (fwd < 0) car.speed -= (car.speed > 0 ? CAR.brake : car.acc * 0.6) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 220 * dt);
    car.speed = clamp(car.speed, -CAR.reverseMax, car.top);
    const turnRate = CAR.turn * clamp(Math.abs(car.speed) / 220, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += steer * turnRate * dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const probe = { x: nx, y: ny };
    if (collideBuildings(city, probe, CAR.radius)) {
      if (Math.abs(car.speed) > 160) {
        damageCar(car, (Math.abs(car.speed) - 160) / 12, car.x, car.y);
        audio.crash(Math.abs(car.speed) / car.top);
        shake(7);
      }
      car.speed *= 0.45;
      probe.x = car.x;
      probe.y = car.y;
    }
    if (inWater(city, probe.x, probe.y)) {
      car.speed *= 0.4;
      probe.x = car.x;
      probe.y = car.y;
    }
    clampToCity(city, probe, CAR.radius);
    car.x = probe.x;
    car.y = probe.y;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
    // Skid particles on hard turns.
    if (Math.abs(steer) > 0 && Math.abs(car.speed) > 300 && state.rng() < 0.5) {
      state.parts.push({ x: car.x - Math.cos(car.angle) * 18, y: car.y - Math.sin(car.angle) * 18, vx: 0, vy: 0, life: 0.4, max: 0.4, color: '#8a8a96', size: 3 });
    }
    // Running over pedestrians is a crime.
    for (let i = 0; i < state.peds.length; i += 1) {
      const ped = state.peds[i];
      if (ped.hp <= 0) continue;
      if (dist2(ped.x, ped.y, car.x, car.y) < (CAR.radius + 10) * (CAR.radius + 10) && Math.abs(car.speed) > 60) {
        hitPed(ped, 60, car.x, car.y);
        audio.crash(0.5);
        shake(4);
        car.speed *= 0.85;
      }
    }
    audio.engine(true, Math.abs(car.speed) / CAR.maxSpeed);
    return;
  }

  audio.engine(false, 0);
  const mx = input.moveX();
  const my = input.moveY();
  const len = Math.hypot(mx, my) || 1;
  const speed = input.mouse().down ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const nx = p.x + (mx / len) * speed * dt;
  const ny = p.y + (my / len) * speed * dt;
  const probe = { x: nx, y: ny };
  if (!collideBuildings(city, probe, PLAYER.radius) && !inWater(city, probe.x, probe.y)) {
    p.x = probe.x;
    p.y = probe.y;
  } else {
    const px = { x: nx, y: p.y };
    if (!collideBuildings(city, px, PLAYER.radius) && !inWater(city, px.x, px.y)) p.x = nx;
    const py = { x: p.x, y: ny };
    if (!collideBuildings(city, py, PLAYER.radius) && !inWater(city, py.x, py.y)) p.y = ny;
  }
  clampToCity(city, p, PLAYER.radius);
  p.speed = Math.hypot(mx, my) > 0 ? speed : 0;
  // Soft collision with cars while on foot.
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if (car.hp <= 0) continue;
    const d2 = dist2(p.x, p.y, car.x, car.y);
    const min = CAR.radius + PLAYER.radius;
    if (d2 < min * min && d2 > 0.01) {
      const d = Math.sqrt(d2);
      p.x = car.x + ((p.x - car.x) / d) * min;
      p.y = car.y + ((p.y - car.y) / d) * min;
      // Keep walking into a stopped car and slide around its side instead of
      // sticking to its grille: drift along the car's lateral axis, to the side
      // the player is already on.
      if (mx !== 0 || my !== 0) {
        const sx = -Math.sin(car.angle);
        const sy = Math.cos(car.angle);
        const side = (p.x - car.x) * sx + (p.y - car.y) * sy >= 0 ? 1 : -1;
        p.x += sx * side * 55 * dt;
        p.y += sy * side * 55 * dt;
      }
    }
  }
}

function updateCars(dt) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    if (cars[i].crashCd > 0) cars[i].crashCd -= dt;
  }
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.hp <= 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = CAR.radius * 2;
      if (d2 >= min * min || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 120 && a.crashCd <= 0 && b.crashCd <= 0) {
        damageCar(a, impact / 40, b.x, b.y);
        damageCar(b, impact / 40, a.x, a.y);
        a.crashCd = 0.5;
        b.crashCd = 0.5;
        burst((a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#ffb347', 200);
        audio.crash(impact / 500);
        shake(5);
      }
      if (a.kind === 'traffic') a.speed *= 0.6;
      if (b.kind === 'traffic') b.speed *= 0.6;
    }
  }
  // Police ramming the player on foot hurts; ramming the player's car damages it.
  const p = state.player;
  for (let i = 0; i < cars.length; i += 1) {
    const car = cars[i];
    if (car.kind !== 'police' || car.hp <= 0) continue;
    const d2 = dist2(car.x, car.y, p.x, p.y);
    if (p.inCar) {
      const pc = p.inCar;
      // A ram stings but does not shred the car: at /30 a single cruiser
      // wrecked a sport car in ~2 s of contact, so a steal-and-drive job
      // (M2) was unwinnable. /60 keeps the chase threatening while the
      // player still has time to reach the chop shop or lose the tail.
      if (d2 < (CAR.radius * 2) * (CAR.radius * 2) && Math.abs(car.speed) > 100 && pc.crashCd <= 0) {
        damageCar(pc, Math.abs(car.speed) / 60, car.x, car.y);
        if (pc.hp > 0) pc.crashCd = 0.5;
        audio.crash(0.7);
        shake(6);
      }
    } else if (d2 < (CAR.radius + PLAYER.radius) * (CAR.radius + PLAYER.radius)) {
      // A police car shoving the player on foot: a nudge, not a killing blow —
      // the busted timer is what catches the player.
      p.hp -= 10 * dt;
      shake(3);
      if (p.hp <= 0) {
        p.hp = 0;
      }
    }
  }
}

/** Distance from a point to the segment (ax,ay)-(bx,by): for swept bullet hits. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return Math.hypot(px - cx, py - cy);
}

function updateBullets(dt) {
  const p = state.player;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    // Swept hit test: the distance from the target to the bullet's whole step,
    // so a fast bullet cannot jump over a target between two frames.
    const ox = b.x;
    const oy = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    const hits = (tx, ty, r) => segDist(tx, ty, ox, oy, b.x, b.y) < r;
    let dead = b.life <= 0;
    if (!dead) {
      const probe = { x: b.x, y: b.y };
      if (collideBuildings(state.city, probe, 2)) {
        burst(b.x, b.y, 3, '#ffb347', 90);
        dead = true;
      }
    }
    if (!dead && b.from === 'player') {
      for (let j = 0; j < state.enemies.length; j += 1) {
        const e = state.enemies[j];
        if (e.hp <= 0) continue;
        if (hits(e.x, e.y, 16)) {
          e.hp -= b.damage;
          burst(b.x, b.y, 4, '#ff6b81', 110);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (let j = 0; j < state.peds.length; j += 1) {
          const ped = state.peds[j];
          if (ped.hp <= 0) continue;
          if (hits(ped.x, ped.y, 14)) {
            hitPed(ped, b.damage, p.x, p.y);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let j = 0; j < state.cars.length; j += 1) {
          const car = state.cars[j];
          if (car.hp <= 0) continue;
          if (hits(car.x, car.y, 24)) {
            damageCar(car, b.damage, p.x, p.y);
            if (car.kind === 'police') addWanted(state, WANTED.killCop);
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.from === 'enemy') {
      if (hits(p.x, p.y, 15)) {
        p.hp -= b.damage;
        burst(b.x, b.y, 4, '#ff6b81', 110);
        dead = true;
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
}

function updateEnemies(dt) {
  const p = state.player;
  for (let i = 0; i < state.enemies.length; i += 1) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;
    const d = Math.sqrt(dist2(e.x, e.y, p.x, p.y));
    e.angle = angleTo(e.x, e.y, p.x, p.y);
    if (d > 60) {
      e.x += Math.cos(e.angle) * e.speed * dt;
      e.y += Math.sin(e.angle) * e.speed * dt;
    }
    e.shootCd -= dt;
    if (d < WEAPON.enemyRange && e.shootCd <= 0 && !p.inCar) {
      e.shootCd = 1.3 + state.rng() * 0.9;
      const spread = (state.rng() - 0.5) * 0.25;
      fireBullet(e.x, e.y, e.angle + spread, 'enemy', WEAPON.enemyDamage);
      audio.enemyShot();
    }
  }
}

function updateWanted(dt) {
  const p = state.player;
  if (p.wanted > 0) {
    p.quietT += dt;
    if (p.quietT > WANTED.decayQuiet) {
      p.decayT += dt;
      if (p.decayT > WANTED.decayStep) {
        p.decayT = 0;
        p.wanted = Math.max(0, p.wanted - 1);
        if (p.wanted === 0) audio.pickup();
      }
    }
    const nearCop = state.cars.some((c) => c.kind === 'police' && dist2(c.x, c.y, p.x, p.y) < 500 * 500);
    if (nearCop) {
      p.quietT = 0;
      p.decayT = 0;
    }
    // The helicopter never loses sight of the player: no decay while it is up.
    if (state.heli && state.heli.active) {
      p.quietT = 0;
      p.decayT = 0;
    }
  }
  const anyPolice = state.cars.some((c) => c.kind === 'police' && c.hp > 0);
  audio.siren(anyPolice && p.wanted > 0);
}

function updateParts(dt) {
  for (let i = state.parts.length - 1; i >= 0; i -= 1) {
    const pt = state.parts[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    pt.life -= dt;
    if (pt.life <= 0) state.parts.splice(i, 1);
  }
}

function updateDialog(dt) {
  const d = state.dialog;
  if (d.lines.length === 0 || d.i >= d.lines.length) return;
  d.t += dt;
  if (d.t > 3.6) {
    d.t = 0;
    d.i += 1;
    if (d.i >= d.lines.length) d.lines = [];
  }
}

function updateCamera(dt) {
  const p = state.player;
  // Look ahead in the driving direction so fast cars do not outrun the view.
  // The lookahead is generous on purpose: the camera's smoothing lags behind
  // a fast car, and only a lead bigger than that lag reads as a lead.
  const lead = p.inCar ? clamp(Math.abs(p.speed) / 545, 0, 1) * 120 : 0;
  const tx = p.x + Math.cos(p.angle) * lead;
  const ty = p.y + Math.sin(p.angle) * lead;
  state.cam.x = lerp(state.cam.x, tx, 1 - Math.pow(0.001, dt));
  state.cam.y = lerp(state.cam.y, ty, 1 - Math.pow(0.001, dt));
  state.cam.shake = Math.max(0, state.cam.shake - dt * 26);
}

function stepWorld(dt, input) {
  state.time += dt;
  updatePlayer(dt, input);
  // The floating prompt when a car is close enough to climb into.
  state.prompt = null;
  if (!state.player.inCar) {
    const car = nearestStealable(state, state.player.x, state.player.y, CAR.enterRange);
    if (car) state.prompt = car.kind === 'player' ? 'E — ENTER CAR' : 'E — STEAL CAR';
  } else if (state.taxi.state === 'waiting' && dist2(state.player.x, state.player.y, state.taxi.fare.x, state.taxi.fare.y) < TAXI.pickupRange * TAXI.pickupRange) {
    state.prompt = 'E — PICK UP FARE';
  }
  updateTraffic(state, dt);
  updatePeds(state, dt);
  updatePolice(state, dt);
  maintainPolice(state, dt);
  updateHeli(state, dt);
  maintainRoadblocks(state, dt);
  updateTaxi(state, dt);
  updateCars(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateWanted(dt);
  updateParts(dt);
  updateDialog(dt);
  updateCamera(dt);
  const result = updateMission(state, dt);
  if (result === 'done' || result === 'story') {
    audio.missionDone();
    if (result === 'story') {
      state.mission.storyDone = true;
    }
    saveGame();
  }
  state.saveT += dt;
  if (state.saveT > 10) {
    state.saveT = 0;
    saveGame();
  }
  const p = state.player;
  // Neon tokens: drive or walk over one to pocket $25.
  for (let i = 0; i < state.tokens.length; i += 1) {
    const t = state.tokens[i];
    if (!t.taken && dist2(p.x, p.y, t.x, t.y) < TOKENS.collectRange * TOKENS.collectRange) {
      t.taken = true;
      p.money += TOKENS.value;
      state.stats.earned += TOKENS.value;
      audio.token();
      burst(t.x, t.y, 8, '#ffd166', 140);
    }
  }
  if (p.hp <= 0) return 'wasted';
  if (p.bustedT > 1.2) return 'busted';
  return null;
}

function runShot(name) {
  const scene = stageShot(name, state);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, { saveExists: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = loadSave();
  let overT = 0;
  let accumulator = 0;
  let last = performance.now();
  let newKey = false;
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && screen === SCREEN_TITLE) newKey = true;
  });

  function startGame(fromSave) {
    if (!fromSave) {
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        // Ignore.
      }
      state.player.money = 150;
      state.player.hp = 100;
      state.player.wanted = 0;
      state.player.x = state.city.safehouse.x;
      state.player.y = state.city.safehouse.y;
      state.player.inCar = null;
      state.player.ammo = 12;
      state.player.weapon = 'pistol';
      state.mission.storyDone = false;
      startMission(state, 0);
      state.dialog.lines = STORY_INTRO.slice();
      state.dialog.i = 0;
      state.dialog.t = 0;
    } else {
      applySave(fromSave);
      state.dialog.lines = ['Back on the streets of Neon Bay.'];
      state.dialog.i = 0;
      state.dialog.t = 0;
    }
    state.cam.x = state.player.x;
    state.cam.y = state.player.y;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing Neon Bay.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
    }
    if (screen === SCREEN_TITLE) {
      if (newKey) {
        newKey = false;
        startGame(null);
      } else if (actions & ACTION_CONFIRM) {
        startGame(save || null);
      }
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (overT > 1 && (actions & ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing Neon Bay.');
      }
      return;
    }
    if (screen === SCREEN_END) {
      if (actions & ACTION_CONFIRM) screen = SCREEN_PLAY;
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (actions & ACTION_HORN) {
      audio.horn();
      scarePeds(state, state.player.x, state.player.y, 200);
    }
    if (actions & ACTION_RADIO) audio.nextTrack();
    if (actions & ACTION_ENTER) {
      const p = state.player;
      if (p.inCar && tryTaxiPickup(state)) {
        // Picked up the fare; stay in the car.
      } else if (p.inCar) exitCar();
      else {
        const car = nearestStealable(state, p.x, p.y, CAR.enterRange);
        if (car) enterCar(car);
      }
    }
    if (actions & ACTION_RELOAD && state.player.weapon === 'pistol' && state.player.reloadT <= 0 && state.player.ammo < WEAPON.pistolAmmo) {
      state.player.reloadT = WEAPON.pistolReload;
      audio.reload();
    }
    if (actions & ACTION_WEAPON1) state.player.weapon = 'fists';
    if (actions & ACTION_WEAPON2) state.player.weapon = 'pistol';
    if (actions & ACTION_PUNCH) punch();
    if (input.takeShoot()) shoot();
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const over = stepWorld(STEP, input);
    if (over) {
      screen = respawn(over);
      overT = 0;
      announce(over === 'busted' ? 'Busted.' : 'Wasted.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += frameDt;
    handleActions();
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_END) overT += frameDt;
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    // The story-complete card appears once, right after the final mission pays out.
    if (screen === SCREEN_PLAY && state.mission.storyDone && !state.mission.endShown) {
      state.mission.endShown = true;
      screen = SCREEN_END;
    }
    renderer.draw(state, screen, { saveExists: !!save });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Neon Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
