# Antworks

A tiny dig-'em-up about **one ant and a great deal of dirt**. Roam the surface,
then tunnel straight down into it — the overworld and the underground are one
continuous tile map. Dug tiles stay dug.

HTML5 Canvas + vanilla JavaScript. **No build step.**

## Run it

- **Just want to play:** open **`antworks.html`** — one self-contained file,
  double-click it, done.
- **Want to hack on it:** open **`index.html`** (loads `game.js` beside it).
  Keep both files together in the same folder. `game.js` is the file to edit;
  `antworks.html` is `index.html` + `game.js` welded together and should be
  regenerated when you change them.

## Controls

| Action | Keys |
| --- | --- |
| Move (8-way, no gravity) | `W` `A` `S` `D` or arrow keys |
| Dig the tile you're facing | hold `Space` |
| Dig a specific tile | click it (must be within reach) |
| Pack dirt back into a tunnel | hold `F` (spends carried dirt) |
| Zoom | mouse wheel, or `+` / `-` |

The HUD shows tiles dug, dirt carried, current depth, and zoom.

## How the world works

- **32 px tiles**, map is **220 × 110** tiles.
- **Surface** (top ~20%): grass, twigs, boulders, puddles. Walkable, *not* diggable.
  Water slows you down.
- **Underground**: solid **dirt** everywhere, with **hard-rock** veins (slower to
  dig) and a scattering of **pre-existing caves** for variety.
- Digging a tile takes time — a radial progress ring shows on the tile, and
  partial progress persists if you wander off and come back. Dirt ≈ 0.45 s,
  rock ≈ 1.7 s.
- Every tile you break becomes permanent open **tunnel** and drops dirt into your
  carry count (rock gives 2). Hold `F` facing a tunnel to fill it back in.
- The deeper you go, the more the light closes in around you.

## Files

```
antworks.html  single-file build (generated) — the one to just play
index.html     canvas + page shell
game.js        everything else, in 12 labelled sections:
              CONFIG · CANVAS · TILES · WORLDGEN · PLAYER · INPUT ·
              CAMERA · DIGGING · PARTICLES · UPDATE · RENDER · LOOP
```

Split `game.js` into `world.js` / `player.js` / `renderer.js` / `input.js` if it
grows — the sections are already carved along those lines.

## Extending it

The code is commented with `EXTEND:` markers where new systems slot in:

- **Food / resources** — add tile ids or an `entities[]` array; collect in `update()`.
- **Other insects** — `entities[]` with simple AI; reuse `tileIsSolid()` for walls.
- **Oxygen / light meter** — `player.depth` already tracks how deep you are; drain
  a meter in `update()`, draw it in `drawHUD()`, and the darkness ramp lives in
  `drawLighting()`.
- **Save / load** — `grid` is a plain `Int8Array`:
  `localStorage.setItem('save', JSON.stringify([...grid]))`.
- **Performance** — cache the static tile layer to an offscreen canvas and only
  redraw dug tiles.

## License

MIT — see [LICENSE](LICENSE).
