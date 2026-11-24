// Neon Bay story and missions. Jax Rook, a courier who owes the Tide crew
// $1,500, takes jobs from Mara Voss, a fixer who runs the bay's night trade.
// Eight jobs, in order: a delivery, a stolen car, a police chase, a deal
// gone loud, a timed getaway, the bank job, a taxi fare across town, and the
// final stand against the Tide crew. Each job sets a target, watches one
// condition, and pays out when the player meets it.

import { WEAPON, WANTED } from './config.js';
import { spawnThug } from './ai.js';

export const INTRO_LINES = [
  'Mara Voss: Jax. You owe the Tide crew $1,500. Work it off, or they collect it themselves.',
  'Mara Voss: First job: run a package to the pier. Don\'t make me wait.',
];

// A line of story dialog on screen: the speaker's words, shown one at a time.
function say(state, text) {
  state.dialog.lines = [text];
  state.dialog.i = 0;
  state.dialog.t = 0;
}

// The player's objective marker: where the game tells him to go.
function setTarget(state, x, y, radius) {
  state.mission.target = { x, y, radius };
}

// True when the player is close enough to a point to count as "there".
function nearPoint(state, x, y, radius) {
  return Math.hypot(state.player.x - x, state.player.y - y) < radius;
}

// Thugs still on their feet, in either wave.
function thugsLeft(state) {
  return state.enemies.filter((e) => !e.dead).length;
}

// The race checkpoints of mission 5, in order.
const CHECKPOINTS = [
  { x: 2640, y: 220 },
  { x: 2640, y: 2200 },
  { x: 220, y: 2200 },
];

export const JOBS = [
  {
    name: 'First Run',
    pay: 200,
    begin(state) {
      setTarget(state, state.city.pierEnd.x, state.city.pierEnd.y, 120);
      state.mission.text = 'Deliver the package to the pier';
      say(state, 'Mara Voss: Package to the pier. The buyer is waiting at the end.');
    },
    tick(state) {
      if (nearPoint(state, state.city.pierEnd.x, state.city.pierEnd.y, 120)) return true;
      return false;
    },
    doneSay: 'Mara Voss: Clean run. The Tide crew notices. Next job.',
  },
  {
    name: 'Hot Wheels',
    pay: 350,
    begin(state) {
      setTarget(state, state.city.chopShop.x, state.city.chopShop.y, 140);
      state.mission.text = 'Steal a car, drive it to the chop shop';
      say(state, 'Mara Voss: I need wheels. Take one, bring it to the chop shop. No questions.');
    },
    tick(state) {
      const car = state.player.inCar;
      if (car && car.kind !== 'player' && nearPoint(state, state.city.chopShop.x, state.city.chopShop.y, 140)) return true;
      return false;
    },
    doneSay: 'Mara Voss: Sold. The crew is starting to trust you.',
  },
  {
    name: 'Heat Wave',
    pay: 400,
    begin(state) {
      state.mission.timer = 45;
      state.mission.target = null;
      state.mission.text = 'Survive the police for 45 seconds';
      say(state, 'Mara Voss: You made noise. Stay free for 45 seconds and the heat dies down.');
      state.player.wanted = 2;
    },
    tick(state, dt) {
      state.mission.timer -= dt;
      if (state.mission.timer <= 0) {
        // Survived the heat: the police lose the trail and the wanted level
        // falls by two stars, so the next job starts from a chase the player
        // can actually drive away from instead of a five-star swarm.
        state.player.wanted = Math.max(0, state.player.wanted - 2);
        return true;
      }
      return false;
    },
    doneSay: 'Mara Voss: They lost you. Breathe. The next job is bigger.',
  },
  {
    name: 'Rooftop Deal',
    pay: 600,
    begin(state) {
      setTarget(state, state.city.dealPlaza.x, state.city.dealPlaza.y, 140);
      state.mission.text = 'Meet at the plaza — then take the case';
      say(state, 'Mara Voss: Deal at the plaza. Something feels off. Keep your piece ready.');
      const plaza = state.city.dealPlaza;
      spawnThug(state, plaza.x - 90, plaza.y - 60);
      spawnThug(state, plaza.x + 80, plaza.y - 40);
      spawnThug(state, plaza.x + 20, plaza.y + 90);
      state.mission.count = 3;
    },
    tick(state) {
      const alive = thugsLeft(state);
      state.mission.count = alive;
      if (alive > 0) {
        state.mission.text = 'Stop the Tide crew — ' + alive + ' left';
        return false;
      }
      // The crew is down; the case is on the ground at the plaza. Walk over
      // it to grab it — the job is not done until the case is in hand.
      state.mission.text = 'Grab the case at the plaza';
      if (nearPoint(state, state.city.dealPlaza.x, state.city.dealPlaza.y, 70)) return true;
      return false;
    },
    doneSay: 'Mara Voss: The case is yours. That was Tide money — they will come for it.',
  },
  {
    name: 'Night Run',
    pay: 800,
    begin(state) {
      state.mission.count = 0;
      state.mission.timer = 100;
      setTarget(state, CHECKPOINTS[0].x, CHECKPOINTS[0].y, 130);
      state.mission.text = 'Hit 3 checkpoints in 100 seconds';
      say(state, 'Mara Voss: Three drops, one hundred seconds. Drive like the bay is burning.');
    },
    tick(state, dt) {
      state.mission.timer -= dt;
      const stop = CHECKPOINTS[state.mission.count];
      if (stop && nearPoint(state, stop.x, stop.y, 130)) {
        state.mission.count += 1;
        const next = CHECKPOINTS[state.mission.count];
        if (next) setTarget(state, next.x, next.y, 130);
        else state.mission.target = null;
      }
      if (state.mission.count >= 3) return true;
      if (state.mission.timer <= 0) {
        // The clock ran out mid-run: the job restarts instead of ending the
        // story, so a slow lap costs time, not the whole campaign.
        state.mission.count = 0;
        state.mission.timer = 100;
        setTarget(state, CHECKPOINTS[0].x, CHECKPOINTS[0].y, 130);
        say(state, 'Mara Voss: Too slow. Run it again.');
      }
      return false;
    },
    doneSay: 'Mara Voss: Fast. The Tide crew is watching you now.',
  },
  {
    name: 'The Big Score',
    pay: 700,
    begin(state) {
      state.mission.phase = 0;
      setTarget(state, state.city.bank.x, state.city.bank.y, 140);
      state.mission.text = 'Rob the bank, then escape to the safehouse';
      say(state, 'Mara Voss: The bank. In and out. Then lose them at the safehouse.');
    },
    tick(state, dt) {
      if (state.mission.phase === 0) {
        if (nearPoint(state, state.city.bank.x, state.city.bank.y, 140)) {
          state.mission.phase = 1;
          state.mission.timer = 2;
          state.mission.text = 'Grabbing the cash...';
          say(state, 'Jax: Two seconds. Keep the door clear.');
        }
        return false;
      }
      state.mission.timer -= dt;
      if (state.mission.timer > 0) return false;
      // The cash is grabbed: the escape begins at four stars, and the
      // mission moves to its escape phase.
      state.mission.phase = 2;
      state.player.wanted = 4;
      state.mission.text = 'Escape to the safehouse';
      setTarget(state, state.city.safehouse.x, state.city.safehouse.y, 140);
      if (nearPoint(state, state.city.safehouse.x, state.city.safehouse.y, 140)) return true;
      return false;
    },
    doneSay: 'Mara Voss: The bank is lighter by a lot. One more job and you are free.',
  },
  {
    name: 'Fare Game',
    pay: 500,
    begin(state) {
      state.mission.phase = 0;
      // A fare waits by the casino; the taxi system runs the pickup and the
      // ride. The player must bring a car and pick the fare up with E.
      state.taxi = { state: 'waiting', mission: true, fare: { x: 2200, y: 2640 }, dest: { x: 0, y: 1540 }, timer: 60, pay: 0, cooldown: 0 };
      setTarget(state, 2200, 2640, 120);
      state.mission.text = 'Pick up the fare by the casino — bring a car';
      say(state, 'Mara Voss: A fare is waiting at the casino. Drive him to the pier road. Sixty seconds.');
    },
    tick(state) {
      const taxi = state.taxi;
      if (state.mission.phase === 0) {
        if (taxi.state === 'riding') {
          state.mission.phase = 1;
          setTarget(state, taxi.dest.x, taxi.dest.y, 120);
          state.mission.text = 'Drop the fare at the pier road — ' + Math.max(0, Math.ceil(taxi.timer)) + 's';
        } else {
          setTarget(state, taxi.fare.x, taxi.fare.y, 120);
          if (!state.player.inCar) state.mission.text = 'Pick up the fare by the casino — bring a car';
        }
        return false;
      }
      if (taxi.state === 'done') return true;
      if (taxi.state === 'failed') {
        say(state, 'Mara Voss: The fare walked off. Back to the casino.');
        openMission(state, state.mission.index);
        return false;
      }
      state.mission.text = 'Drop the fare at the pier road — ' + Math.max(0, Math.ceil(taxi.timer)) + 's';
      setTarget(state, taxi.dest.x, taxi.dest.y, 120);
      return false;
    },
    doneSay: 'Mara Voss: The fare paid. The Tide crew wants a word. This is the last one.',
  },
  {
    name: 'The Tide\'s End',
    pay: 800,
    begin(state) {
      state.mission.phase = 0;
      setTarget(state, state.city.dealPlaza.x, state.city.dealPlaza.y, 140);
      state.mission.text = 'Take the ledger from the Tide crew';
      say(state, 'Mara Voss: The Tide crew is at the plaza with your ledger. Take it back. Then run.');
      const plaza = state.city.dealPlaza;
      spawnThug(state, plaza.x - 90, plaza.y - 60);
      spawnThug(state, plaza.x + 80, plaza.y - 40);
      spawnThug(state, plaza.x + 20, plaza.y + 90);
      state.mission.count = 3;
    },
    tick(state) {
      const plaza = state.city.dealPlaza;
      if (state.mission.phase === 0 || state.mission.phase === 1) {
        const alive = thugsLeft(state);
        state.mission.count = alive;
        if (alive > 0) {
          state.mission.text = 'Stop the Tide crew — ' + alive + ' left';
          return false;
        }
        if (state.mission.phase === 0) {
          // First wave down; the second comes in from the side streets.
          state.mission.phase = 1;
          say(state, 'Mara Voss: More of them — from the side streets!');
          spawnThug(state, plaza.x - 120, plaza.y + 40);
          spawnThug(state, plaza.x + 120, plaza.y - 60);
          state.mission.count = 2;
          return false;
        }
        // Both waves down; the ledger is on the ground at the plaza.
        state.mission.phase = 2;
        setTarget(state, plaza.x, plaza.y, 140);
        state.mission.text = 'Grab the ledger at the plaza';
        say(state, 'Jax: That is all of them. The ledger is on the ground — grab it.');
        return false;
      }
      if (state.mission.phase === 2) {
        state.mission.text = 'Grab the ledger at the plaza';
        if (nearPoint(state, plaza.x, plaza.y, 70)) {
          state.mission.phase = 3;
          state.player.wanted = 5;
          setTarget(state, state.city.safehouse.x, state.city.safehouse.y, 140);
          state.mission.text = 'Escape to the safehouse — 5 stars!';
          say(state, 'Mara Voss: Five stars — helicopter and all! Get to the safehouse, Jax!');
        }
        return false;
      }
      state.mission.text = 'Escape to the safehouse — 5 stars!';
      if (nearPoint(state, state.city.safehouse.x, state.city.safehouse.y, 90)) return true;
      return false;
    },
    doneSay: 'Mara Voss: The ledger is yours. The debt is paid. Neon Bay is yours, Jax.',
  },
];

// Start a job: clear the old target and enemies, set the new one up.
export function openMission(state, index) {
  state.mission.index = index;
  state.mission.phase = 0;
  state.mission.count = 0;
  state.mission.timer = 0;
  state.mission.target = null;
  state.mission.text = '';
  state.enemies = [];
  const job = JOBS[index];
  if (job) job.begin(state);
}

// The job the player is on now, or null once the story is done.
export function activeJob(state) {
  return state.mission.index < JOBS.length ? JOBS[state.mission.index] : null;
}

// Run one tick of the current job; true means it is finished and paid.
export function tickMission(state, dt) {
  const job = activeJob(state);
  if (!job) return false;
  if (!job.tick(state, dt)) return false;
  state.player.money += job.pay;
  state.stats.earned += job.pay;
  say(state, job.doneSay);
  state.mission.index += 1;
  state.mission.phase = 0;
  state.mission.count = 0;
  state.mission.timer = 0;
  state.mission.target = null;
  if (state.mission.index >= JOBS.length) {
    state.mission.storyDone = true;
    state.mission.text = 'Story complete';
  } else {
    openMission(state, state.mission.index);
  }
  return true;
}

// A crime adds heat, once per window, so a single scrape does not stack
// five stars at once.
export function raiseHeat(state, amount) {
  const p = state.player;
  if (p.crimeCd > 0) return;
  p.crimeCd = WANTED.crimeCooldown;
  p.wanted = Math.min(5, p.wanted + amount);
  p.quietT = 0;
  p.decayT = 0;
}
