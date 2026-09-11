# Antworks

You are the queen. You start with **five ants** and a hole in the ground.
Five rival nests are buried across the map, each with its own queen and a
garrison that grows the further out you go. Tunnel in, let your ants fight,
and **kill the rival queen** — her surviving soldiers defect to you, her food
stores are yours, and your colony gains power. Food buys eggs. If your queen
falls, the colony is finished.

HTML5 Canvas + vanilla JavaScript. **No build step.**

## Run it

- **Just want to play:** open **`antworks.html`** — one self-contained file,
  double-click it.
- **Want to hack on it:** open **`index.html`** (loads `game.js` beside it).
  `game.js` is the file to edit; `antworks.html` is the two welded together —
  regenerate it by pasting `game.js` between the `<script>` tags.

## Controls

| Action | Keys |
| --- | --- |
| Walk & aim | `A` `D` / left · right |
| Climb (only against a wall) | `W` `S` / up · down |
| Dig the tile you're aiming at | hold `Space` |
| Dig a specific tile | click it (within reach) |
| Place a carried block | hold `F` |
| Lay an egg — one new ant | `E` · costs 10 food |
| Zoom | wheel, or `+` / `-` |
| Restart after the end card | `R` |

Fighting is automatic: any ant of yours trades blows with a rival that comes
within reach. You never give orders — you lead, and they follow.

## The loop

1. **Forage.** Red berry clusters on the surface and in caves are food. Any of
   your ants picks them up just by walking over them.
2. **Find a nest.** Coloured chevrons at the screen edge point to rival nests
   you haven't taken, with the distance in tiles.
3. **Raid.** Nests are sealed chambers 7–20 tiles down. Dig a shaft in. Mind
   that a one-tile shaft only lets your ants engage single-file — a wider
   breach brings more of them to bear at once.
4. **Kill their queen** (the big crowned one). The nest flips to your colours:
   surviving defenders join you, you take the food stores, and you gain a point
   of **power** — which adds damage to every ant you own.
5. **Grow.** Spend food on eggs. Take the next nest, which is bigger.

Away from a fight your whole colony slowly heals, so a mauled raid can pull
back, recover, and come again.

## How the world works

- **32 px tiles**, map is **220 × 110**.
- Gravity is always on and there's **no jump** — the ant walks and falls, never
  flies. `W`/`S` climb only while gripping a wall, which is how you get back up
  a shaft you dug.
- **A dug tile becomes open sky** — you see straight through the hole. Soil
  gives 1 block of spoil, rock gives 2, and `F` puts a block into any empty
  tile, underground or in mid-air.
- Layered terracotta soil that darkens with depth, blue-grey rock veins that
  take ~4× longer to dig, and natural hollows to stumble into.
- The deeper you go, the more a warm shadow closes in around a lit disc.

## Files

```
antworks.html  single-file build (generated) — the one to just play
index.html     page shell + font link
game.js        everything else, in 14 labelled sections:
               CONFIG · CANVAS · TILES · WORLDGEN · ENTITIES · BRAINS ·
               COMBAT · INPUT · CAMERA · DIG & BUILD · EFFECTS ·
               UPDATE · RENDER · LOOP
```

Every ant — yours, theirs, the queens — runs the same `moveEntity()` physics
and differs only in its brain (`brainFriendly` / `brainFoe`) and its stats.

## Tuning

All the knobs are in `CFG` at the top of `game.js`: colony size, egg cost,
hit points, attack values, aggro and leash radii, regen rate, nest count.
Nest garrisons and queen health scale off the nest index in `restart()`.

## License

MIT — see [LICENSE](LICENSE).
