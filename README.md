# VERANO HEAT

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/kreutzx/verano-heat/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/kreutzx/verano-heat/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game set in **Verano Bay**, a fictional sun-soaked
coastal city: seven-by-seven blocks of signed shops and hotels, palm-lined
streets, a beach, a marina with moored boats, and a lighthouse at the end of
the east pier. Roam it on foot or in any car you can steal, run jobs for the
fixer **Marisol Vega**, and try to stay ahead of the Verano Bay PD.

Everything is original — the city, the names, the characters, the story and
the art are this game's own. The whole world is generated procedurally in
code (canvas textures, low-poly geometry, WebAudio-synthesised sound), so the
game ships with no image or audio assets and plays fully offline.

## How to play

Serve the `game/` folder with any static file server (or open it through
one) and load `index.html` in desktop Chrome. There is no build step.

| Input | Action |
| --- | --- |
| W A S D / arrows | Walk, drive |
| Mouse (click the game to lock) | Camera |
| Shift | Run |
| F | Enter / exit a car |
| E | Talk to Marisol, interact |
| Mouse click / J | Punch, or shoot with the pistol out |
| 1 / 2 | Fists / pistol |
| R | Reload |
| P / Esc | Pause |

## What's in the bay

- **A living city** — lane-following traffic that brakes, turns and queues,
  pedestrians strolling the sidewalks who flee from trouble, parked cars
  waiting to be borrowed.
- **A five-star wanted system** — crimes raise your stars when witnessed;
  patrol cars hunt you along the streets and break into free pursuit up
  close, officers shoot at four stars and up, and if they pin you the
  BUSTED meter fills. Lose them by breaking line of sight and lying low.
- **Marisol Vega's four-mission chain** — a first delivery, a hot crate off
  the pier, a borrowed gold coupé, and a lighthouse run under full heat —
  then repeatable taxi and parcel work for cash.
- **Combat** — fists and a reloadable pistol, with tracers, muzzle flash
  and damage; cars crumple, smoke, and die.
- **Full presentation** — HUD with money, health, wanted stars and weapon,
  a live circular minimap with mission and police blips, title / pause /
  WASTED / BUSTED screens, synthesised engine, siren, gunfire and sea
  ambience, and progress saved to localStorage.
- **Fixed-timestep simulation** at 60 Hz, decoupled from rendering, so the
  game plays the same at any frame rate.

## Layout

- `game/index.html` — page, HUD and screens
- `game/src/` — the game's own modules: `world` (the city), `vehicles`
  (cars + traffic), `peds` (pedestrians), `player`, `police` (wanted +
  pursuit), `missions` (Marisol's chain and side jobs), `hud` (readouts +
  minimap), `audio` (synth), `save`, `shots` (screenshot scenes), `main`
- `game/vendor/three.module.min.js` — Three.js r160, vendored
- `main.ts` — the entry program: validates the caps, copies `game/` and
  `screenshots/` to the output directory and writes `dossier.json` via
  `vendor/makefun-game.ts` (the kit's library, unchanged)
- `screenshots/` — four screenshots of the game itself, posed with the
  `?shot=` scenes in `game/src/shots.js` (see `shots.json`)

## Handing it in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

Built by **@kreutzx** for the make.fun "Make GTA 6" bounty —
[make.fun/bounty/gta6-01](https://make.fun/bounty/gta6-01).
New to make.fun? Start with my referral link: https://make.fun/r/24q484pk

Licensed under the MIT License (see `LICENSE`).
