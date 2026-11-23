# Neon Bay

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Fiqih-stack/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Fiqih-stack/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01)

**Neon Bay** is a 2D top-down open-world crime game that runs entirely in a desktop
browser from static files — no network, no build step, no libraries. It is an entry
for the [make.fun](https://make.fun/bounty/gta6-01?ref=6sc35azz) `gta6-01` bounty.

The sun is down over the bay and the city is lit. You are Jax Rook, a courier who
owes the Tide crew $1,500. Mara Voss, a fixer who runs the bay's night trade, has
six jobs that can clear the debt — if the Bay PD doesn't catch you first.

## The game

- **An open city to explore** — a seeded coastal grid of roads, buildings with neon
  signs, plazas, palms and a pier over the bay. Walk it on foot or drive it.
- **Cars to steal and drive** — traffic, parked cars and your own teal coupe. Arcade
  driving with skids, crashes, screen shake and a speed readout.
- **A wanted level that answers back** — steal a car, hit a pedestrian or fire a
  shot and the stars climb; police cars spawn, chase and ram you. Lose them with
  distance and time, or get busted.
- **Six story missions** — a pier delivery, a chop-shop run, a 45-second police
  chase, a deal that turns into a shootout, a timed three-checkpoint getaway, and
  the big score at the Bayfront Bank. Each pays; the last one clears the debt.
- **Combat** — fists and a pistol, mouse aim, reloads, armed enemies who shoot back.
- **A HUD with a minimap** — health, money, wanted stars, weapon and ammo, speed,
  the current objective, and a live minimap with the player, police, traffic and
  the mission marker.
- **Save and continue** — progress, money and mission state save to local storage
  automatically; free roam continues after the story ends.
- **Synthesized sound** — engine hum, sirens, gunshots and a procedural synthwave
  loop, all made with WebAudio. No audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Mouse | Aim (on foot) |
| Click | Shoot |
| E | Enter / steal a car, exit a car |
| Space | Punch |
| R | Reload |
| 1 / 2 | Fists / pistol |
| P / Esc | Pause |
| M | Mute |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser and play.

## How it is built

- `game/index.html` — the canvas and the module entry point.
- `game/src/config.js` — tuning, palette and shared helpers.
- `game/src/world.js` — the seeded city, the game state and collisions.
- `game/src/input.js` — keyboard and mouse.
- `game/src/ai.js` — traffic, pedestrians and police.
- `game/src/missions.js` — the story and the six jobs.
- `game/src/audio.js` — synthesized sound effects and music.
- `game/src/render.js` — the camera, the city, the HUD and the minimap.
- `game/src/shots.js` — deterministic screenshot scenes (`?shot=cover|chase|mission|street`).
- `game/src/main.js` — the loop, the screens and saving.
- `main.ts` — copies `game/` and `screenshots/` to the output and writes the dossier.

Everything in the game is original: the city, the characters, the story, the art
and the music were made for Neon Bay. Nothing is taken from any commercial game.

---

Built for the [make.fun](https://make.fun/bounty/gta6-01?ref=6sc35azz) `gta6-01`
bounty — build an open-world crime game in the browser, judged by an AI that
compares entries two at a time.
