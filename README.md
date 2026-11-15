# SABLE LINE — a three.js tactical FPS

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built on three.js 0.187.0. Two teams fight over a dusk freight yard:
Vanguard plants the charge at site A or B, Sentinels hold the line. Five
rounds to take the match, money between rounds, and gunfire where stopping
to aim pays.

## How to run

No build step, no network. Serve `game/` and open it in desktop Chrome:

```sh
python3 -m http.server --directory game 8080
```

then open http://localhost:8080. (Or open `game/index.html` directly from
any static file server.) Click to play (pointer lock). The game is fully
offline: all textures are painted on canvas at boot and all sounds are
synthesized with the Web Audio API.

## Controls

- **W A S D** move · **Mouse** look · **Click** fire · **Right-click** zoom (DMR)
- **R** reload · **1–4** weapons · **G** throw grenade · **E** plant/defuse (hold)
- **B** buy menu · **Ctrl** crouch · **Space** jump · **Shift** walk · **M** mute

## The game

- **Map** — Sable Yard: container yard (A), warehouse (B), a mid platform
  with ramps, long lanes, crates and cover. Original art, names and layout.
- **Weapons** — P9 Sidearm (free), VK-7 Carbine ($1100), Longbow DMR
  ($2100, scoped), Scatter-12 shotgun ($800), Spark-9 frag grenade ($250).
  Recoil, spread, headshots (3x), damage falloff, reloads.
- **Bots** — 4 teammates and 5 opponents with waypoint routes, hold
  positions, line-of-sight and hearing: they push sites, peek corners,
  burst-fire, retreat when hurt, plant the charge and defuse it.
- **Rounds** — 100-second rounds, 12-second buy phases, $400 for a win,
  $150 a kill, $300 to plant or defuse. First to 5 rounds takes the match.

## Screenshots

`screenshots/` holds four real renders of the game's own code, taken in
headless Chrome over CDP from the deterministic `?shot=` modes in
`game/src/main.js` (`cover`, `fight`, `buy`, `end`), loaded from local
files with no network requests. Captures are 1280x663 JPEGs (the
headless window was 1280x800); each is under the 256 KiB cap.
