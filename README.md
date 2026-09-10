# Antworks

A dig-and-build game about **one ant and a great deal of dirt**. Roam the
surface, sink a shaft, carve tunnels — and pack your spoil back in as blocks
anywhere you like, underground or up in the open air. The overworld and the
underground are one continuous tile map.

HTML5 Canvas + vanilla JavaScript. **No build step.**

## Run it

- **Just want to play:** open **`antworks.html`** — one self-contained file,
  double-click it.
- **Want to hack on it:** open **`index.html`** (loads `game.js` beside it).
  Keep both together. `game.js` is the file to edit; `antworks.html` is
  `index.html` + `game.js` welded together — regenerate it by pasting `game.js`
  between the `<script>` tags.

Both pull *Nunito* from Google Fonts for the HUD; offline they fall back to the
system sans-serif.

## Controls

| Action | Keys |
| --- | --- |
| Walk & aim | `A` `D` / left · right |
| Climb (only against a wall) | `W` `S` / up · down |
| Dig the tile you're aiming at | hold `Space` |
| Dig a specific tile | click it (must be within reach) |
| Place a carried block in the tile you're aiming at | hold `F` |
| Zoom | mouse wheel, or `+` / `-` |

Gravity is always on and there is **no jump** — the ant walks, and it falls
whenever nothing is underfoot. It never flies, above ground or below. `W`/`S`
**climb** only while it's gripping a wall (a solid tile at its side): that's how
you get back up a shaft you've dug, or scale a cliff face. In an open cavern
with nothing to hold onto it just drops to the floor.

The HUD tracks **DUG** (net tiles hollowed out), **BLOCKS** (spoil you can
place), and **DEPTH**.

## How the world works

- **32 px tiles**, map is **220 × 110**.
- **Surface**: rolling terracotta soil, no grass cap, no water — just earth.
- **Underground**: layered soil that darkens with depth, cool **rock** veins
  that take ~4× longer to dig, and a few pre-existing hollows.
- Digging takes time: a progress ring and spreading cracks show on the tile,
  and partial progress persists if you leave and come back. Soil ≈ 0.45 s,
  rock ≈ 1.7 s.
- **A dug tile becomes open sky** — you see straight through the hole whether
  it's a deep tunnel or a notch in a hillside. Breaking soil gives you 1 block
  of spoil, rock gives 2.
- **`F` places a block into whatever empty tile you're aiming at** — fill a
  tunnel back in, wall off a passage, or build a floating platform in mid-air.
  A ghost outline shows where it'll land.
- The deeper you go, the more a warm shadow closes in around a lit disc.

## Look

Warm clear-day sky with a soft sun, terracotta soil drawn in sunlit strata,
blue-grey faceted rock, and a sticker-style ant (cream outline, gold heading
dot) so it stays visible on any background. Soft rounded HUD chips. It's a
single committed look — no light/dark theming.

## Files

```
antworks.html  single-file build (generated) — the one to just play
index.html     page shell + font link
game.js        everything else, in 12 labelled sections:
               CONFIG · CANVAS · TILES · WORLDGEN · PLAYER · INPUT ·
               CAMERA · DIG & BUILD · PARTICLES · UPDATE · RENDER · LOOP
```

## Extending it

`EXTEND:` markers in `game.js` show where systems slot in:

- **Food / resources** — a tile id + an overlap pickup in `update()`.
- **Other insects** — an `entities[]` array with simple AI; reuse `tileIsSolid()`.
- **Oxygen / light meter** — `player.depth` already tracks how deep you are.
- **Save / load** — `grid` is a plain `Int8Array`.
- **Performance** — soil is drawn from six pre-rendered depth-shade stamps;
  cache the whole static layer to an offscreen canvas and only redraw changes.

## License

MIT — see [LICENSE](LICENSE).
