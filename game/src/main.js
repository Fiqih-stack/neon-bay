// Neon Bay boot and loop: read the input every frame, run the world in
// fixed 1/60 s steps, and paint what is there. Screens: title, play,
// paused, busted, wasted, and the story-complete card. Progress saves to
// local storage on its own.

import { VIEW, STEP, SAVE_KEY, PLAYER, CAR, WEAPON, WANTED, TAXI, TOKENS, bound, mix, d2, angleTo, turnBy } from './config.js';
import { newGame, spawnOwnCar, roadPoint, pushOutOfBuildings, isWater, keepInCity } from './world.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_RELOAD, ACTION_PUNCH, ACTION_MUTE, ACTION_WEAPON1, ACTION_WEAPON2, ACTION_HORN, ACTION_RADIO } from './input.js';
import { runTraffic, strollPeds, huntCops, topUpCops, frightenPeds, closestStealable, circleHeli, watchRoadblocks } from './ai.js';
import { INTRO_LINES, JOBS, openMission, tickMission, raiseHeat } from './missions.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_WASTED, SCREEN_COMPLETE } from './render.js';
import { stageScene } from './shots.js';

// --- Small helpers -------------------------------------------------------------
function sparks(state, x, y, n, color, speed = 120, life = 0.5, size = 3) {
  for (let i = 0; i < n; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const v = speed * (0.4 + state.rng() * 0.8);
    state.parts.push({
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: life * (0.6 + state.rng() * 0.8), max: life,
      color, size: size * (0.6 + state.rng() * 0.8),
    });
  }
}

// The mouse position in world coordinates: the view is the camera's
// rectangle, so the mouse's screen position plus the view's top-left corner
// is the world point it hovers over. The harness aims with the same math,
// so the two agree exactly.
function mouseWorld(state, input) {
  const mouse = input.mouse();
  const viewX = state.cam.x - VIEW.width / 2;
  const viewY = state.cam.y - VIEW.height / 2;
  return { x: mouse.x + viewX, y: mouse.y + viewY };
}

function shakeCam(state, amount) {
  state.cam.shake = Math.min(18, state.cam.shake + amount);
}

// Damage a car; a wrecked car ejects its driver and stops. A police cruiser
// wrecked by the player counts as a cop killed, and raises the heat.
function hurtCar(state, car, amount, byPlayer = false) {
  if (car.hp <= 0) return;
  car.hp -= amount;
  if (car.hp > 0) return;
  car.hp = 0;
  car.speed = 0;
  sparks(state, car.x, car.y, 18, '#ff7a1a', 200, 0.8, 4);
  sparks(state, car.x, car.y, 10, '#555', 90, 1.2, 5);
  shakeCam(state, 6);
  if (state.player.inCar === car) {
    state.player.inCar = null;
    state.player.x = car.x;
    state.player.y = car.y + 30;
  }
  if (car.kind === 'police' && byPlayer) raiseHeat(state, WANTED.killCop);
}

function hurtPed(state, ped, amount, byPlayer = false) {
  if (ped.hp <= 0) return;
  ped.hp -= amount;
  if (ped.hp > 0) return;
  ped.hp = 0;
  sparks(state, ped.x, ped.y, 8, '#ff4757', 100, 0.6, 3);
  if (byPlayer) raiseHeat(state, WANTED.hitPed);
}

// --- Fares: the free-roam side job, and the scripted ride of mission 7 -------
// A fare is a pickup point and a destination, both on roads, with a timer
// and a payout. Free-roam fares pay by distance; the story's own fare pays
// through the mission instead.
function setFare(state, pickup, dest, mission) {
  const dist = Math.hypot(pickup.x - dest.x, pickup.y - dest.y);
  const pay = mission ? 0 : Math.min(TAXI.maxPay, TAXI.minPay + Math.floor(dist / 100) * 10);
  state.taxi = { state: 'waiting', mission: !!mission, fare: pickup, dest, timer: TAXI.rideTime, pay, cooldown: 0 };
}

function spawnFare(state) {
  const a = roadPoint(state.city, state.rng);
  let b = roadPoint(state.city, state.rng);
  let guard = 0;
  while (d2(a.x, a.y, b.x, b.y) < 800 * 800 && guard < 8) {
    b = roadPoint(state.city, state.rng);
    guard += 1;
  }
  setFare(state, { x: a.x, y: a.y }, { x: b.x, y: b.y }, false);
}

// Pressing E in a car near a waiting fare picks it up; the ride starts and
// the clock runs. Anywhere else, E means getting out of the car instead.
function pickFare(state, audio) {
  const taxi = state.taxi;
  const p = state.player;
  if (taxi.state !== 'waiting' || !p.inCar) return false;
  if (d2(p.x, p.y, taxi.fare.x, taxi.fare.y) > TAXI.pickupRange * TAXI.pickupRange) return false;
  taxi.state = 'riding';
  taxi.timer = TAXI.rideTime;
  audio.pickup();
  state.dialog.lines = [taxi.mission ? 'Fare: The pier road, driver. And step on it.' : 'Fare: Thanks for stopping. Take me across town, quick.'];
  state.dialog.i = 0;
  state.dialog.t = 0;
  return true;
}

function runTaxi(state, audio, dt) {
  const taxi = state.taxi;
  if (taxi.state === 'idle' || taxi.state === 'done') {
    // Free-roam fares only, once the story is over: the story's own taxi
    // job runs mission 7 and must not be replaced by a random fare.
    if (state.mission.storyDone) {
      taxi.cooldown -= dt;
      if (taxi.cooldown <= 0) spawnFare(state);
    }
    return;
  }
  if (taxi.state === 'waiting') return;
  if (taxi.state !== 'riding') return;
  taxi.timer -= dt;
  const p = state.player;
  if (d2(p.x, p.y, taxi.dest.x, taxi.dest.y) < TAXI.dropRange * TAXI.dropRange) {
    if (!taxi.mission && taxi.pay > 0) {
      p.money += taxi.pay;
      state.stats.earned += taxi.pay;
    }
    taxi.state = 'done';
    audio.missionDone();
    state.dialog.lines = [taxi.mission ? 'Fare: Right on time.' : 'Fare: Perfect. Keep the change — $' + taxi.pay + '.'];
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
    state.dialog.lines = ['Fare: Too slow — I am walking from here.'];
    state.dialog.i = 0;
    state.dialog.t = 0;
    if (!taxi.mission) {
      taxi.fare = null;
      taxi.dest = null;
    }
  }
}

// --- Busted / wasted ------------------------------------------------------------
// A bust or a death costs 20% of the cash on hand, respawns the player at
// the hospital with full health, clears the heat and the police, and
// restarts the current job. The fine is taken the moment the screen shows,
// so the amount is visible in the state while the screen is up.
function applyFine(state, reason) {
  const p = state.player;
  const loss = Math.floor(p.money * 0.2);
  p.money -= loss;
  state.lastFine = { amount: loss, reason, at: state.time };
  state.bustedLoss = loss;
  return loss;
}

function respawn(state) {
  const p = state.player;
  p.x = state.city.hospital.x;
  p.y = state.city.hospital.y;
  p.hp = 100;
  p.wanted = 0;
  p.bustedT = 0;
  p.quietT = 0;
  p.decayT = 0;
  p.inCar = null;
  p.ammo = WEAPON.pistolAmmo;
  // The police are cleared; the heat restarts from zero.
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    if (state.cars[i].kind === 'police') state.cars.splice(i, 1);
  }
  state.heli.active = false;
  state.enemies = [];
  // A fare in progress is lost on a bust or a death.
  if (state.taxi.state === 'riding') {
    state.taxi.state = 'idle';
    state.taxi.cooldown = TAXI.respawnDelay;
    state.taxi.fare = null;
    state.taxi.dest = null;
  }
  if (!state.mission.storyDone) openMission(state, state.mission.index);
  state.cam.x = p.x;
  state.cam.y = p.y;
}

// --- Getting in and out of cars -------------------------------------------------
function getInCar(state, audio) {
  const p = state.player;
  const car = closestStealable(state, p.x, p.y);
  if (!car) return;
  if (Math.hypot(car.x - p.x, car.y - p.y) > CAR.enterRange) return;
  p.inCar = car;
  car.occupied = true;
  p.x = car.x;
  p.y = car.y;
  if (car.kind !== 'player') {
    car.stolen = true;
    state.stats.stolen += 1;
    raiseHeat(state, WANTED.stealCar);
    audio.wantedUp();
  }
  audio.click();
}

function getOutCar(state) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  p.inCar = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
  p.angle = car.angle;
  car.occupied = false;
  car.speed = 0;
}

// --- Combat ----------------------------------------------------------------------
function looseBullet(state, x, y, angle, from) {
  state.bullets.push({
    x, y, angle,
    speed: WEAPON.bulletSpeed,
    from,
    travelled: 0,
  });
}

function swingFist(state, audio) {
  const p = state.player;
  if (p.punchCd > 0) return;
  p.punchCd = PLAYER.punchCd;
  audio.punch();
  const reach = PLAYER.punchRange;
  const arc = PLAYER.punchArc;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
    if (dist > reach) continue;
    const a = angleTo(p.x, p.y, enemy.x, enemy.y);
    if (Math.abs(turnBy(p.angle, a)) > arc) continue;
    enemy.hp -= PLAYER.punchDamage;
    if (enemy.hp <= 0) {
      enemy.dead = true;
      sparks(state, enemy.x, enemy.y, 8, '#ff4757', 100, 0.6, 3);
    }
  }
  for (const ped of state.peds) {
    if (ped.hp <= 0) continue;
    const dist = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (dist > reach) continue;
    const a = angleTo(p.x, p.y, ped.x, ped.y);
    if (Math.abs(turnBy(p.angle, a)) > arc) continue;
    hurtPed(state, ped, PLAYER.punchDamage, true);
  }
}

function firePistol(state, input, audio) {
  const p = state.player;
  if (p.weapon !== 'pistol' || p.ammo <= 0 || p.shootCd > 0 || p.reloadT > 0) return;
  p.ammo -= 1;
  p.shootCd = 0.25;
  const aim = mouseWorld(state, input);
  const angle = angleTo(p.x, p.y, aim.x, aim.y);
  p.angle = angle;
  looseBullet(state, p.x + Math.cos(angle) * 20, p.y + Math.sin(angle) * 20, angle, 'player');
  audio.shot();
  frightenPeds(state, p.x, p.y, 420, 3);
  // A shot fired near a cruiser is a crime in itself.
  for (const car of state.cars) {
    if (car.kind === 'police' && car.hp > 0 && Math.hypot(car.x - p.x, car.y - p.y) < 300) {
      raiseHeat(state, WANTED.shootNearCop);
      break;
    }
  }
}

// Distance from a point to a segment, squared: the bullet's swept hit test.
function segDistSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = bound(t, 0, 1);
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return d2(px, py, cx, cy);
}

function flyBullets(state, audio, dt) {
  const p = state.player;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    const nx = b.x + Math.cos(b.angle) * b.speed * dt;
    const ny = b.y + Math.sin(b.angle) * b.speed * dt;
    b.travelled += b.speed * dt;
    let dead = b.travelled > WEAPON.pistolRange;
    if (!dead) {
      const probe = { x: nx, y: ny };
      if (pushOutOfBuildings(state.city, probe, 2)) {
        sparks(state, nx, ny, 4, '#ffd166', 80, 0.3, 2);
        dead = true;
      }
    }
    if (!dead && b.from === 'player') {
      for (const enemy of state.enemies) {
        if (enemy.dead) continue;
        if (segDistSq(enemy.x, enemy.y, b.x, b.y, nx, ny) < 16 * 16) {
          enemy.hp -= WEAPON.pistolDamage;
          sparks(state, enemy.x, enemy.y, 5, '#ff4757', 90, 0.4, 3);
          if (enemy.hp <= 0) {
            enemy.dead = true;
            sparks(state, enemy.x, enemy.y, 10, '#ff4757', 120, 0.6, 3);
          }
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const car of state.cars) {
          if (car.hp <= 0 || car === p.inCar) continue;
          if (segDistSq(car.x, car.y, b.x, b.y, nx, ny) < 24 * 24) {
            hurtCar(state, car, WEAPON.pistolDamage, true);
            audio.crash();
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const ped of state.peds) {
          if (ped.hp <= 0) continue;
          if (segDistSq(ped.x, ped.y, b.x, b.y, nx, ny) < 13 * 13) {
            hurtPed(state, ped, WEAPON.pistolDamage, true);
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.from === 'enemy') {
      if (p.hp > 0) {
        if (p.inCar) {
          if (segDistSq(p.inCar.x, p.inCar.y, b.x, b.y, nx, ny) < 24 * 24) {
            hurtCar(state, p.inCar, 5, false);
            sparks(state, nx, ny, 4, '#ffd166', 80, 0.3, 2);
            dead = true;
          }
        } else if (segDistSq(p.x, p.y, b.x, b.y, nx, ny) < 14 * 14) {
          p.hp -= WEAPON.enemyDamage;
          sparks(state, p.x, p.y, 5, '#ff4757', 90, 0.4, 3);
          shakeCam(state, 3);
          dead = true;
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
    else {
      b.x = nx;
      b.y = ny;
    }
  }
}

// Thugs stand their ground, shoot at the player inside their range, and
// reload in bursts. The dead ones are swept out of the list.
function moveEnemies(state, audio, dt) {
  const p = state.player;
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    if (enemy.dead) {
      state.enemies.splice(i, 1);
      continue;
    }
    const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
    enemy.angle = angleTo(enemy.x, enemy.y, p.x, p.y);
    enemy.shootCd -= dt;
    if (dist < WEAPON.enemyRange && enemy.shootCd <= 0 && p.hp > 0) {
      enemy.shootCd = 1.1 + state.rng() * 0.5;
      looseBullet(state, enemy.x + Math.cos(enemy.angle) * 16, enemy.y + Math.sin(enemy.angle) * 16, enemy.angle, 'enemy');
      audio.enemyShot();
    }
  }
}

// --- Crashes ----------------------------------------------------------------------
// Cars that overlap push apart and trade damage. One impact counts once:
// after a crash a car ignores further crash damage for half a second,
// instead of taking it every frame while two cars overlap. A police cruiser
// ramming the player's car is the same rule with its own numbers: the ram
// is gentler than it used to be, and it can only land once every 0.7 s, so
// a long chase at speed does not wreck the player's car in seconds.
function resolveCrashes(state, audio, dt) {
  const p = state.player;
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.hp <= 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist2 = dx * dx + dy * dy;
      const min = 44;
      if (dist2 >= min * min || dist2 < 0.01) continue;
      const dist = Math.sqrt(dist2);
      const push = (min - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 60 && (a.crashCd <= 0 || b.crashCd <= 0)) {
        // A crash hurts both cars — but a cruiser ramming the player's car
        // is the police's weapon, not a fair collision: the player's car
        // takes half the crash damage of the cruiser, so a long chase wears
        // the player down without writing the car off in seconds, while the
        // cruisers still wreck themselves on their own rams.
        const playerInPair = a === p.inCar || b === p.inCar;
        const copInPair = a.kind === 'police' || b.kind === 'police';
        if (playerInPair && copInPair) {
          if (a === p.inCar) {
            hurtCar(state, a, impact / 80, false);
            hurtCar(state, b, impact / 40, false);
          } else {
            hurtCar(state, a, impact / 40, false);
            hurtCar(state, b, impact / 80, false);
          }
        } else {
          const dmg = impact / 40;
          hurtCar(state, a, dmg, false);
          hurtCar(state, b, dmg, false);
        }
        a.crashCd = 0.5;
        b.crashCd = 0.5;
        audio.crash();
        sparks(state, (a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd166', 100, 0.4, 3);
      }
      // A police ram: the cruiser's speed is the damage, not the difference.
      // The ram is gentle and can only land once every 1.2 s: a long chase
      // at speed should wear the player's car down, not write it off in
      // seconds — a truck that has to survive 45 seconds of heat needs room
      // to breathe, and the cruisers still wreck themselves on the crashes.
      if (a.kind === 'police' && b === p.inCar && Math.abs(a.speed) > 100 && p.inCar.crashCd <= 0) {
        hurtCar(state, p.inCar, Math.abs(a.speed) / 160, false);
        p.inCar.crashCd = 1.2;
        audio.crash();
        shakeCam(state, 4);
      }
      if (b.kind === 'police' && a === p.inCar && Math.abs(b.speed) > 100 && p.inCar.crashCd <= 0) {
        hurtCar(state, p.inCar, Math.abs(b.speed) / 160, false);
        p.inCar.crashCd = 1.2;
        audio.crash();
        shakeCam(state, 4);
      }
    }
  }
  // The player's car running over a pedestrian: the pedestrian dies, the
  // heat rises, and the bystanders scatter.
  if (p.inCar && p.inCar.hp > 0) {
    for (const ped of state.peds) {
      if (ped.hp <= 0) continue;
      if (d2(ped.x, ped.y, p.inCar.x, p.inCar.y) < 30 * 30) {
        hurtPed(state, ped, 100, true);
        frightenPeds(state, ped.x, ped.y, 300, 3);
        audio.crash();
      }
    }
  }
}

// --- Moving the player ---------------------------------------------------------------
// On foot the player walks with WASD and runs while the mouse is held, and
// aims at the mouse. In a car, W is the gas, S is the brake and reverse,
// and A/D steer — the steering bites harder the faster the car goes, and
// flips when reversing. Buildings stop a car hard; the water stops it too.
function drivePlayer(state, input, audio, dt) {
  const p = state.player;
  const mx = input.moveX();
  const my = input.moveY();
  const mouse = input.mouse();
  if (p.inCar) {
    const car = p.inCar;
    const forward = my < 0 ? 1 : my > 0 ? -1 : 0;
    if (forward > 0) {
      car.speed += car.acc * dt;
      if (car.speed > car.top) car.speed = car.top;
    } else if (forward < 0) {
      if (car.speed > 20) car.speed -= CAR.brake * dt;
      else {
        car.speed -= car.acc * 0.5 * dt;
        if (car.speed < -CAR.reverseMax) car.speed = -CAR.reverseMax;
      }
    } else {
      car.speed = mix(car.speed, 0, bound(1.5 * dt, 0, 1));
    }
    car.brakeLight = forward < 0 && car.speed > 20;
    const steer = mx * CAR.turn * bound(Math.abs(car.speed) / 200, 0.2, 1) * (car.speed < -1 ? -1 : 1);
    car.angle += steer * dt;
    const oldX = car.x;
    const oldY = car.y;
    const speedBefore = car.speed;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const hit = pushOutOfBuildings(state.city, car, 20);
    if (hit) {
      // A building hit at speed hurts, but far less than it used to: a
      // clipped corner on a long drive no longer writes the car off.
      if (speedBefore > 200) hurtCar(state, car, (speedBefore - 200) / 16, false);
      car.speed *= 0.45;
      audio.crash();
      shakeCam(state, 3);
    }
    if (isWater(state.city, car.x, car.y)) {
      car.x = oldX;
      car.y = oldY;
      car.speed *= 0.3;
    }
    keepInCity(state.city, car, 21);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
  } else {
    const running = mouse.down;
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      p.x += (mx / len) * speed * dt;
      p.y += (my / len) * speed * dt;
      p.speed = speed;
    } else {
      p.speed = 0;
    }
    const oldX = p.x;
    const oldY = p.y;
    pushOutOfBuildings(state.city, p, PLAYER.radius);
    if (isWater(state.city, p.x, p.y)) {
      p.x = oldX;
      p.y = oldY;
    }
    keepInCity(state.city, p, PLAYER.radius);
    // On foot the player faces the mouse: the aim is the world point under
    // the cursor, not the movement direction.
    const aim = mouseWorld(state, input);
    p.angle = angleTo(p.x, p.y, aim.x, aim.y);
  }
  if (p.inCar) p.bustedT = 0;
}

// The camera follows the player with a lookahead in the driving direction,
// clamped so the view never leaves the city.
function followPlayer(state) {
  const p = state.player;
  const look = p.inCar ? 120 : 40;
  const tx = p.x + Math.cos(p.angle) * look;
  const ty = p.y + Math.sin(p.angle) * look;
  const size = state.city.size;
  state.cam.x = bound(tx, 598, size - 598);
  state.cam.y = bound(ty, 318, size - 318);
}

// --- One fixed step -------------------------------------------------------------------
// Returns the screen to switch to, or null to keep playing. The one-shot
// actions are passed in by the frame loop, which reads them once per frame:
// a step must never consume them itself, or the frame would never see the
// pause key, and the title screen would never see Enter.
function tickWorld(state, input, audio, dt, actions) {
  const p = state.player;
  state.time += dt;
  if (p.crimeCd > 0) p.crimeCd -= dt;
  if (p.shootCd > 0) p.shootCd -= dt;
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) p.ammo = WEAPON.pistolAmmo;
  }
  if (state.cam.shake > 0) state.cam.shake = Math.max(0, state.cam.shake - dt * 30);
  for (const car of state.cars) if (car.crashCd > 0) car.crashCd -= dt;

  if (actions & ACTION_MUTE) {
    state.flags.muted = !state.flags.muted;
    audio.setMuted(state.flags.muted);
  }
  if (actions & ACTION_WEAPON1) p.weapon = 'fists';
  if (actions & ACTION_WEAPON2) {
    p.weapon = 'pistol';
    if (p.ammo <= 0) p.reloadT = WEAPON.pistolReload;
  }
  if (actions & ACTION_HORN) audio.horn();
  if (actions & ACTION_RADIO) audio.nextTrack();
  if (actions & ACTION_ENTER) {
    if (p.inCar && pickFare(state, audio)) {
      // Picked up the fare; stay in the car.
    } else if (p.inCar) getOutCar(state);
    else getInCar(state, audio);
  }
  if (actions & ACTION_RELOAD) {
    if (p.weapon === 'pistol' && p.ammo < WEAPON.pistolAmmo && p.reloadT <= 0) {
      p.reloadT = WEAPON.pistolReload;
      audio.reload();
    }
  }
  if (actions & ACTION_PUNCH) swingFist(state, audio);
  if (input.takeShoot()) firePistol(state, input, audio);

  drivePlayer(state, input, audio, dt);
  runTraffic(state, dt);
  strollPeds(state, dt);
  huntCops(state, dt);
  if (state.spawnCd > 0) state.spawnCd -= dt;
  else {
    topUpCops(state);
    state.spawnCd = 1.1;
  }
  circleHeli(state, dt);
  watchRoadblocks(state);
  state.prevWanted = p.wanted;
  flyBullets(state, audio, dt);
  moveEnemies(state, audio, dt);
  resolveCrashes(state, audio, dt);

  // Neon tokens: a glowing pickup is worth $25, on foot or in a car.
  for (const token of state.tokens) {
    if (token.taken) continue;
    if (d2(token.x, token.y, p.x, p.y) < TOKENS.collectRange * TOKENS.collectRange) {
      token.taken = true;
      p.money += TOKENS.value;
      state.stats.earned += TOKENS.value;
      audio.token();
    }
  }

  runTaxi(state, audio, dt);

  // The story: a finished job pays out and the next one starts.
  if (!state.mission.storyDone) {
    const done = tickMission(state, dt);
    if (done) {
      audio.missionDone();
      saveGame(state);
    }
    if (state.mission.storyDone && !state.mission.endShown) {
      state.mission.endShown = true;
      return SCREEN_COMPLETE;
    }
  }

  // Dialog lines advance on their own clock.
  if (state.dialog.lines.length > 0) {
    state.dialog.t += dt;
    if (state.dialog.t > 3.5) {
      state.dialog.t = 0;
      state.dialog.i += 1;
      if (state.dialog.i >= state.dialog.lines.length) {
        state.dialog.lines = [];
        state.dialog.i = 0;
      }
    }
  }

  // Particles fade.
  for (let i = state.parts.length - 1; i >= 0; i -= 1) {
    const part = state.parts[i];
    part.life -= dt;
    part.x += part.vx * dt;
    part.y += part.vy * dt;
    if (part.life <= 0) state.parts.splice(i, 1);
  }

  // Busted: a cruiser has held the player on foot long enough.
  if (p.bustedT > 1.2) {
    applyFine(state, 'busted');
    state.stats.busted += 1;
    state.overT = 0;
    return SCREEN_BUSTED;
  }
  // Wasted: no health left.
  if (p.hp <= 0) {
    applyFine(state, 'wasted');
    state.overT = 0;
    return SCREEN_WASTED;
  }

  // Autosave every ten seconds of play.
  state.saveT += dt;
  if (state.saveT > 10) {
    state.saveT = 0;
    saveGame(state);
  }

  // The action prompt: the nearest stealable car, or the taxi fare.
  if (!p.inCar) {
    const near = closestStealable(state, p.x, p.y);
    if (near && Math.hypot(near.x - p.x, near.y - p.y) < CAR.enterRange) {
      state.prompt = near.kind === 'player' ? 'E — GET IN CAR' : 'E — STEAL CAR';
    } else {
      state.prompt = '';
    }
  } else {
    state.prompt = '';
  }

  followPlayer(state);
  const anyCop = state.cars.some((c) => c.kind === 'police' && c.hp > 0);
  audio.engine(p.inCar ? p.inCar.speed : 0, !!p.inCar);
  audio.siren(anyCop, dt);
  return null;
}

// --- Saving ----------------------------------------------------------------------------
function saveGame(state) {
  try {
    const p = state.player;
    const save = {
      money: p.money, hp: p.hp, wanted: p.wanted,
      weapon: p.weapon, ammo: p.ammo,
      x: p.x, y: p.y,
      mission: state.mission.index, storyDone: state.mission.storyDone,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be unavailable (private mode, quota); the game plays on.
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

function applySave(state, save) {
  const p = state.player;
  p.money = save.money;
  p.hp = save.hp;
  p.wanted = save.wanted;
  p.weapon = save.weapon || 'pistol';
  p.ammo = save.ammo ?? WEAPON.pistolAmmo;
  p.x = save.x;
  p.y = save.y;
  state.cam.x = p.x;
  state.cam.y = p.y;
  if (save.storyDone) {
    state.mission.storyDone = true;
    state.mission.index = JOBS.length;
    state.mission.text = 'Story complete';
  } else {
    openMission(state, save.mission || 0);
  }
}

// --- Boot -------------------------------------------------------------------------------
export function boot() {
  const canvas = document.getElementById('game');
  const statusEl = document.getElementById('status');
  const params = new URLSearchParams(window.location.search);
  const seed = parseInt(params.get('seed') || '1', 10) || 1;
  const debug = params.get('debug') === '1';
  const scene = params.get('shot');
  const input = createInput(canvas);
  const audio = createAudio();
  const renderer = createRenderer(canvas);

  let state;
  let screen = SCREEN_TITLE;
  if (scene) {
    state = stageScene(seed, scene);
    screen = SCREEN_PLAY;
  } else {
    state = newGame(seed);
    spawnOwnCar(state);
  }
  if (debug) window.__neonBay = state;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function startGame() {
    audio.unlock();
    const save = loadSave();
    if (save) {
      applySave(state, save);
    } else {
      openMission(state, 0);
      state.dialog.lines = [...INTRO_LINES];
      state.dialog.i = 0;
      state.dialog.t = 0;
    }
    screen = SCREEN_PLAY;
    setStatus('Playing');
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // Read the one-shot actions once per frame. The first fixed step gets
    // them; later steps in the same frame get none, so a single press never
    // fires twice. The frame's own screen checks below use the same value.
    const actions = input.takeActions();
    if (screen === SCREEN_PLAY) {
      acc += dt;
      let n = 0;
      let frameActions = actions;
      while (acc >= STEP && n < 5) {
        const next = tickWorld(state, input, audio, STEP, frameActions);
        frameActions = 0;
        acc -= STEP;
        n += 1;
        if (next) {
          screen = next;
          break;
        }
      }
      if (acc > STEP * 5) acc = 0;
    }
    // One-shot actions that belong to the screens, not the world. One
    // chain, so a single press can never both resume and re-pause in the
    // same frame (P unpauses, then the play branch would pause again).
    if (screen === SCREEN_TITLE && (actions & ACTION_CONFIRM)) {
      startGame();
    } else if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      setStatus('Playing');
    } else if ((screen === SCREEN_BUSTED || screen === SCREEN_WASTED) && (actions & ACTION_CONFIRM)) {
      if (state.overT > 1.2) {
        respawn(state);
        screen = SCREEN_PLAY;
        setStatus('Playing');
      }
    } else if (screen === SCREEN_COMPLETE && (actions & ACTION_CONFIRM)) {
      screen = SCREEN_PLAY;
      setStatus('Playing');
    } else if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      setStatus('Paused');
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      state.overT += dt;
    }
    if (screen === SCREEN_BUSTED) setStatus('Busted.');
    else if (screen === SCREEN_WASTED) setStatus('Wasted.');
    else if (screen === SCREEN_COMPLETE) setStatus('Story complete');
    else if (screen === SCREEN_TITLE) setStatus('Neon Bay. Press Enter or click to start.');
    renderer.draw(state, screen);
    requestAnimationFrame(frame);
  }
  setStatus('Neon Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') {
  boot();
}
