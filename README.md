# Neon Bay

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Fiqih-stack/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Fiqih-stack/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01)

**Neon Bay** is a 2D top-down open-world crime game that runs in a desktop
browser from plain static files — no network, no build step, no libraries.
It is an entry for the [make.fun](https://make.fun/bounty/gta6-01?ref=6sc35azz)
`gta6-01` bounty.

Night has fallen over the bay and the whole city is lit. You are Jax Rook, a
courier who owes the Tide crew $1,500. Mara Voss, a fixer who runs the bay's
night trade, has eight jobs that can pay the debt off — if Bay PD does not
catch you first.

## What is in the game

- **A city to explore** — a seeded coastal road grid in three districts
  (bayfront, downtown and the casino row), each with its own building
  colours, neon signs, plazas, palms and a pier reaching out over the water.
  Walk it on foot or drive it.
- **Cars to take and drive** — traffic, parked cars and your own teal coupe,
  in three classes: nimble coupes, quick sports cars and heavy trucks.
  Arcade driving with skids, crashes, screen shake and a speed readout.
- **A wanted level that answers back** — steal a car, hit a pedestrian or
  fire a shot and the stars climb; cruisers spawn, chase and ram you. From
  three stars roadblocks cut the streets; at five stars a helicopter circles
  overhead and the heat never fades on its own. Lose them with distance and
  time, or get busted.
- **Eight story jobs** — a pier delivery, a chop-shop run, forty-five
  seconds of police attention, a deal that turns into a shootout, a timed
  three-checkpoint getaway, the Bayfront Bank job, a taxi fare across town
  against the clock, and the final stand against the Tide crew that clears
  the debt. Every job pays; the last one sets you free.
- **Side work after the story** — taxi fares keep appearing across town and
  twelve neon tokens hide on the streets, each worth $25.
- **Combat** — fists and a pistol, mouse aim, reloads, and armed enemies
  who shoot back.
- **A HUD with a minimap** — health, money, tokens found, wanted stars,
  weapon and ammo, speed, the current objective, a live minimap showing the
  player, the police, the helicopter, the tokens and the mission marker, plus
  a red edge glow when the heat is on.
- **Save and continue** — progress, money and mission state save to local
  storage on their own; free roam keeps going after the story ends.
- **Synthesized sound** — engine hum, sirens, gunshots, a horn, and two
  procedural synthwave tracks on the radio (T switches), all made with
  WebAudio. No audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Mouse | Aim (on foot) |
| Click | Shoot |
| E | Enter / steal a car, exit a car, pick up a fare |
| Space | Punch |
| R | Reload |
| H | Horn |
| T | Switch radio track |
| 1 / 2 | Fists / pistol |
| P / Esc | Pause |
| M | Mute |

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser and play.

## How it is put together

- `game/index.html` — the canvas and the module entry point.
- `game/src/config.js` — tuning, palettes, vehicle classes and shared helpers.
- `game/src/world.js` — the seeded city, its districts and tokens, the game
  state and collisions.
- `game/src/input.js` — keyboard and mouse.
- `game/src/ai.js` — traffic, pedestrians, police, the helicopter and the
  roadblocks.
- `game/src/missions.js` — the story and the eight jobs.
- `game/src/audio.js` — synthesized sound effects and two music tracks.
- `game/src/render.js` — the camera, the city, the HUD and the minimap.
- `game/src/shots.js` — deterministic screenshot scenes
  (`?shot=cover|chase|mission|street`).
- `game/src/main.js` — the loop, the screens, taxi fares, tokens and saving.
- `main.ts` — copies `game/` and `screenshots/` to the output and writes
  the dossier.

Everything in the game is original: the city, the characters, the story, the
art and the music were made for Neon Bay. Nothing is taken from any
commercial game.

---

Built for the [make.fun](https://make.fun/bounty/gta6-01?ref=6sc35azz) `gta6-01`
bounty — build an open-world crime game in the browser, judged by an AI that
compares entries two at a time.
