// Neon Bay story and missions. Jax Rook, a courier who owes the Tide crew, takes
// jobs from Mara Voss, a fixer who runs the bay's night trade. Eight jobs, in order:
// a delivery, a stolen car, a police chase, a deal gone loud, a timed getaway, the
// bank job, a taxi fare across town, and the final stand against the Tide crew.
// Each mission sets a target, watches one rule, and pays on completion.

import { WANTED, TAXI, dist2 } from './config.js';
import { spawnThug } from './ai.js';

export const STORY_INTRO = [
  'NEON BAY — 9:04 PM. The sun is down and the bay is lit.',
  'Jax Rook owes the Tide crew $1,500. Mara Voss has the jobs to clear it.',
  'Eight jobs. Walk with WASD. Enter a car with E. Aim with the mouse, shoot with click.',
];

const CHECKPOINTS = [
  { x: 880, y: 880 },
  { x: 2200, y: 880 },
  { x: 2200, y: 2200 },
];

function setDialog(state, lines) {
  state.dialog.lines = lines;
  state.dialog.i = 0;
  state.dialog.t = 0;
}

function setTarget(state, x, y, text) {
  state.mission.target = { x, y };
  state.mission.text = text;
}

export const MISSIONS = [
  {
    title: 'First Run',
    setup(state) {
      setTarget(state, state.city.pierEnd.x, state.city.pierEnd.y, 'Deliver the package to the pier');
      setDialog(state, [
        'MARA: First job, Rook. A package for the pier. No questions.',
        'Follow the yellow marker. Walk, or take a car — your coupe is by the safehouse.',
      ]);
    },
    update(state) {
      const p = state.player;
      if (dist2(p.x, p.y, state.mission.target.x, state.mission.target.y) < 70 * 70) return true;
      return false;
    },
    reward: 200,
    doneLine: 'MARA: Clean. $200, and the Tide forgets a little of what you owe.',
  },
  {
    title: 'Hot Wheels',
    setup(state) {
      setTarget(state, state.city.chopShop.x, state.city.chopShop.y, 'Steal a car and bring it to the chop shop');
      setDialog(state, [
        'MARA: The chop shop pays for fresh wheels. Take any parked car — E to climb in.',
        'Careful: the cops notice a stolen car. Bring it to the marker in one piece.',
      ]);
    },
    update(state) {
      const p = state.player;
      if (!p.inCar || !p.inCar.stolen) return false;
      if (dist2(p.x, p.y, state.mission.target.x, state.mission.target.y) < 90 * 90) return true;
      return false;
    },
    reward: 350,
    doneLine: 'CHOP SHOP: Nice ride. $350 — the Tide is almost patient.',
  },
  {
    title: 'Heat Wave',
    setup(state) {
      state.player.wanted = 2;
      state.player.quietT = 0;
      state.mission.timer = 45;
      state.mission.target = null;
      state.mission.text = 'Survive the heat — stay free for 45 seconds';
      setDialog(state, [
        'MARA: You were seen, Rook. Two stars and the whole bay is looking.',
        'Stay free for 45 seconds. Lose them in the streets — do not get busted.',
      ]);
    },
    update(state, dt) {
      state.mission.timer -= dt;
      state.mission.text = 'Survive the heat — ' + Math.max(0, Math.ceil(state.mission.timer)) + 's left';
      if (state.mission.timer <= 0) return true;
      return false;
    },
    reward: 400,
    doneLine: 'MARA: They lost you. $400. The heat dies down — for now.',
  },
  {
    title: 'Rooftop Deal',
    setup(state) {
      const c = state.city.dealPlaza;
      setTarget(state, c.x, c.y, 'Reach the deal, stop the Tide crew');
      setDialog(state, [
        'MARA: A deal at the plaza, and the Tide sent muscle instead of money.',
        'Take them down — pistol with click, punch with Space — then grab the case.',
      ]);
      spawnThug(state, c.x - 90, c.y - 60);
      spawnThug(state, c.x + 80, c.y - 40);
      spawnThug(state, c.x + 20, c.y + 90);
      state.mission.count = 3;
    },
    update(state) {
      const alive = state.enemies.filter((e) => e.hp > 0).length;
      state.mission.count = alive;
      if (alive > 0) {
        state.mission.text = 'Stop the Tide crew — ' + alive + ' left';
        return false;
      }
      state.mission.text = 'Grab the case at the plaza';
      const p = state.player;
      if (dist2(p.x, p.y, state.mission.target.x, state.mission.target.y) < 70 * 70) return true;
      return false;
    },
    reward: 600,
    doneLine: 'MARA: The case is ours. $600. Four jobs left — the Tide is not done with you yet.',
  },
  {
    title: 'Night Run',
    setup(state) {
      state.mission.timer = 100;
      state.mission.phase = 0;
      const cp = CHECKPOINTS[0];
      setTarget(state, cp.x, cp.y, 'Reach checkpoint 1 of 3 — 100s');
      setDialog(state, [
        'MARA: A courier run across the whole bay. Three checkpoints, 100 seconds.',
        'Drive fast, cut corners, and do not stop for anyone.',
      ]);
    },
    update(state, dt) {
      state.mission.timer -= dt;
      const p = state.player;
      const cp = CHECKPOINTS[state.mission.phase];
      if (dist2(p.x, p.y, cp.x, cp.y) < 90 * 90) {
        state.mission.phase += 1;
        if (state.mission.phase >= CHECKPOINTS.length) return true;
        const next = CHECKPOINTS[state.mission.phase];
        setTarget(state, next.x, next.y, 'Reach checkpoint ' + (state.mission.phase + 1) + ' of 3 — ' + Math.max(0, Math.ceil(state.mission.timer)) + 's');
        return false;
      }
      state.mission.text = 'Reach checkpoint ' + (state.mission.phase + 1) + ' of 3 — ' + Math.max(0, Math.ceil(state.mission.timer)) + 's';
      if (state.mission.timer <= 0) {
        setDialog(state, ['MARA: Too slow. The client walked. Run it again — the clock resets.']);
        startMission(state, state.mission.index);
        return false;
      }
      return false;
    },
    reward: 800,
    doneLine: 'MARA: 100 seconds, three checkpoints. $800. The Tide is watching — and impressed.',
  },
  {
    title: 'The Big Score',
    setup(state) {
      state.mission.phase = 0;
      setTarget(state, state.city.bank.x, state.city.bank.y, 'Reach the Bayfront Bank');
      setDialog(state, [
        'MARA: The Bayfront Bank, then two more jobs before you are free.',
        'Grab the cash, and run — the whole city will be on you.',
      ]);
    },
    update(state, dt) {
      const p = state.player;
      if (state.mission.phase === 0) {
        if (dist2(p.x, p.y, state.mission.target.x, state.mission.target.y) < 80 * 80) {
          state.mission.phase = 1;
          state.mission.timer = 2;
          setDialog(state, ['JAX: Vault is open. Grabbing the cash...']);
        }
        return false;
      }
      if (state.mission.phase === 1) {
        state.mission.timer -= dt;
        state.mission.text = 'Grabbing the cash...';
        if (state.mission.timer <= 0) {
          state.mission.phase = 2;
          p.wanted = 4;
          p.quietT = 0;
          setTarget(state, state.city.safehouse.x, state.city.safehouse.y, 'Escape to the safehouse — 4 stars!');
          setDialog(state, ['MARA: Four stars! Get to the safehouse and do NOT get caught.']);
        }
        return false;
      }
      state.mission.text = 'Escape to the safehouse — 4 stars!';
      if (dist2(p.x, p.y, state.mission.target.x, state.mission.target.y) < 90 * 90) return true;
      return false;
    },
    reward: 700,
    doneLine: 'MARA: $700 from the bank. Two jobs left, Rook — and the Tide is done waiting.',
  },
  {
    title: 'Fare Game',
    setup(state) {
      state.mission.phase = 0;
      // A fare waits by the casino; the taxi system runs the pickup and the ride.
      const pickup = { x: 2640, y: 880 };
      const dest = { x: 440, y: 2200 };
      state.taxi = { state: 'waiting', mission: true, fare: pickup, dest, timer: TAXI.rideTime, pay: 0, cooldown: 0 };
      setTarget(state, pickup.x, pickup.y, 'Pick up the fare by the casino — bring a car');
      setDialog(state, [
        'MARA: A high roller needs a ride across the bay. You are the taxi tonight.',
        'Get a car, pick them up with E, and make the pier road in 60 seconds.',
      ]);
    },
    update(state, dt) {
      const taxi = state.taxi;
      const p = state.player;
      if (state.mission.phase === 0) {
        if (taxi.state === 'riding') {
          state.mission.phase = 1;
          setTarget(state, taxi.dest.x, taxi.dest.y, 'Drop the fare at the pier road — ' + Math.max(0, Math.ceil(taxi.timer)) + 's');
        } else {
          setTarget(state, taxi.fare.x, taxi.fare.y, 'Pick up the fare by the casino — bring a car');
          if (!p.inCar) state.mission.text = 'Pick up the fare by the casino — bring a car';
        }
        return false;
      }
      if (taxi.state === 'done') return true;
      if (taxi.state === 'failed') {
        setDialog(state, ['MARA: The fare walked. Again — the clock resets, the casino waits.']);
        startMission(state, state.mission.index);
        return false;
      }
      state.mission.text = 'Drop the fare at the pier road — ' + Math.max(0, Math.ceil(taxi.timer)) + 's';
      setTarget(state, taxi.dest.x, taxi.dest.y, state.mission.text);
      return false;
    },
    reward: 500,
    doneLine: 'FARE: Worth every cent. $500 — Mara says one job left, and it is the big one.',
  },
  {
    title: "The Tide's End",
    setup(state) {
      const c = state.city.dealPlaza;
      state.mission.phase = 0;
      setTarget(state, c.x, c.y, 'Reach the plaza — end the Tide crew');
      setDialog(state, [
        'MARA: Last job. The Tide crew is at the plaza, and they brought everyone.',
        'Take them all down, grab the ledger, then run — five stars will be on you.',
      ]);
      spawnThug(state, c.x - 90, c.y - 60);
      spawnThug(state, c.x + 80, c.y - 40);
      spawnThug(state, c.x + 20, c.y + 90);
      state.mission.count = 3;
    },
    update(state, dt) {
      const p = state.player;
      const c = state.city.dealPlaza;
      if (state.mission.phase === 0 || state.mission.phase === 1) {
        const alive = state.enemies.filter((e) => e.hp > 0).length;
        state.mission.count = alive;
        if (alive > 0) {
          state.mission.text = 'Stop the Tide crew — ' + alive + ' left';
          return false;
        }
        if (state.mission.phase === 0) {
          state.mission.phase = 1;
          setDialog(state, ['MARA: More of them — from the side streets!']);
          spawnThug(state, c.x - 120, c.y + 40);
          spawnThug(state, c.x + 120, c.y - 60);
          state.mission.count = 2;
          return false;
        }
        state.mission.phase = 2;
        setTarget(state, c.x, c.y, 'Grab the ledger at the plaza');
        setDialog(state, ['JAX: That is all of them. The ledger is on the ground — grab it.']);
        return false;
      }
      if (state.mission.phase === 2) {
        state.mission.text = 'Grab the ledger at the plaza';
        if (dist2(p.x, p.y, c.x, c.y) < 70 * 70) {
          state.mission.phase = 3;
          p.wanted = 5;
          p.quietT = 0;
          setTarget(state, state.city.safehouse.x, state.city.safehouse.y, 'Escape to the safehouse — 5 stars!');
          setDialog(state, ['MARA: Five stars — helicopter and all! Get to the safehouse, Rook!']);
        }
        return false;
      }
      state.mission.text = 'Escape to the safehouse — 5 stars!';
      if (dist2(p.x, p.y, state.mission.target.x, state.mission.target.y) < 90 * 90) return true;
      return false;
    },
    reward: 800,
    doneLine: 'MARA: Debt cleared. Neon Bay is yours now, Rook. Free roam — the city is open.',
  },
];

export function startMission(state, index) {
  state.mission.index = index;
  state.mission.phase = 0;
  state.mission.timer = 0;
  state.mission.count = 0;
  state.mission.done = false;
  MISSIONS[index].setup(state);
}

export function currentMission(state) {
  return MISSIONS[Math.min(state.mission.index, MISSIONS.length - 1)];
}

/** Advance the current mission; returns 'done' when it completes, 'story' when all are done. */
export function updateMission(state, dt) {
  const m = state.mission;
  if (m.storyDone) return null;
  const def = MISSIONS[m.index];
  const done = def.update(state, dt);
  if (!done) return null;
  state.player.money += def.reward;
  state.stats.earned += def.reward;
  setDialog(state, [def.doneLine]);
  m.index += 1;
  if (m.index >= MISSIONS.length) {
    m.storyDone = true;
    m.target = null;
    m.text = 'Story complete — free roam Neon Bay';
    return 'story';
  }
  startMission(state, m.index);
  return 'done';
}

/** A crime raises the wanted level, with a short cooldown so one act counts once. */
export function addWanted(state, stars) {
  const p = state.player;
  if (p.crimeCd > 0) return;
  p.wanted = Math.min(5, p.wanted + stars);
  p.crimeCd = WANTED.crimeCooldown;
  p.quietT = 0;
  p.decayT = 0;
}
