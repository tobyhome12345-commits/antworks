# Antworks

A dig-'em-up about **one ant and a great deal of dirt**, drawn as a working
excavation blueprint. Roam the surface, then sink a shaft and tunnel — the
overworld and the underground are one continuous tile map. Dug tiles stay dug.

HTML5 Canvas + vanilla JavaScript. **No build step.**

## Run it

- **Just want to play:** open **`antworks.html`** — one self-contained file,
  double-click it, done.
- **Want to hack on it:** open **`index.html`** (loads `game.js` beside it).
  Keep both files together. `game.js` is the file to edit; `antworks.html` is
  `index.html` + `game.js` welded together — regenerate it by pasting `game.js`
  between the `<script>` tags.

Both pull the *IBM Plex Mono* face from Google Fonts for the drafting labels;
offline they fall back to the system monospace.

## Controls

| Action | Keys |
| --- | --- |
| Move & aim | `W` `A` `S` `D` or arrow keys |
| Excavate the tile you're aiming at | hold `Space` |
| Excavate a specific tile | click it (must be within reach) |
| Back-fill the tile in front of you | hold `F` (spends carried spoil) |
| Scale (zoom) | mouse wheel, or `+` / `-` |

On the **surface** the ant is under a light gravity: it walks left/right and
settles onto the ground, `W`/`S` only *aim* it — there's no jump, and it can't
fly off the terrain. Once its centre is inside a **tunnel or cave** it moves
freely in every direction.

The **SURVEY** panel tracks tiles excavated, spoil load, depth, and drawing
scale; the title block echoes depth and scale.

## How the world works

- **32 px tiles**, map is **220 × 110**.
- **Surface** (top ~20%): a rolling grass line with **puddles** you wade across
  (they slow you and you float on top — you won't drop through one).
- **Underground**: solid **dirt** throughout, with slower-to-dig **hard-rock**
  veins and a scatter of **pre-existing caves**.
- The grass cap is solid but *diggable* — aim down and sink a shaft through it.
- Digging takes time: a progress ring and spreading cracks show on the tile, and
  partial progress persists if you leave and come back. Dirt/grass ≈ 0.45 s,
  rock ≈ 1.7 s.
- Every tile you break becomes permanent **tunnel** and adds to your spoil load
  (rock gives 2). `F`, aimed at an open tunnel tile, packs one load back in.
- The deeper you go, the more the sheet darkens around a lamp-lit disc.

## Look

Everything is a blueprint: blue ground, graph-paper grid, chalk-white hatching
(diagonal for soil, cross-hatch + facet for rock, wave symbol for water), a
dashed sheet border and a drafting title block. The ant is white line-art inside
a dashed survey target so it's findable on a busy sheet. It's a single committed
visual world — no light/dark theming.

## Files

```
antworks.html  single-file build (generated) — the one to just play
index.html     page shell + font link
game.js        everything else, in 12 labelled sections:
               CONFIG · CANVAS · TILES · WORLDGEN · PLAYER · INPUT ·
               CAMERA · DIGGING · PARTICLES · UPDATE · RENDER · LOOP
```

## Extending it

`EXTEND:` markers in `game.js` show where systems slot in:

- **Food / resources** — a tile id + an overlap pickup in `update()`.
- **Other insects** — an `entities[]` array with simple AI; reuse `tileIsSolid()`.
- **Oxygen / light meter** — `player.depth` already tracks how deep you are;
  drain a meter in `update()`, draw it in `drawHUD()`; the darkness ramp is
  `drawLighting()`.
- **Save / load** — `grid` is a plain `Int8Array`.
- **Performance** — the tile hatch is drawn from pre-rendered stamps; cache the
  whole static layer to an offscreen canvas and only redraw changed tiles.

## License

MIT — see [LICENSE](LICENSE).
