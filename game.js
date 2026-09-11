/* =========================================================================
   ANTWORKS  —  dig, raid, and grow a colony.

   You are the queen. You start with five ants. Five rival nests are buried
   across the map, each with soldiers and a queen of its own. Tunnel in, let
   your ants fight, and kill the rival queen: her surviving soldiers defect
   to you, her food stores are yours, and your colony gains power. Food buys
   eggs. If your queen falls, the colony is finished.

   HTML5 Canvas + vanilla JS. No build step: just open index.html.

   Gravity is always on — the ant walks and falls, never flies. Up/down climb
   only while gripping a wall, which is how you get back up a shaft you dug.
   Dug tiles become open sky; a carried block can be placed in ANY empty tile.

   SECTION MAP:
      1. CONFIG        constants + palette
      2. CANVAS        context + responsive resize
      3. TILES         tile ids, lookup tables, grid helpers
      4. WORLDGEN      soil, rock, caves, rival nests, food
      5. ENTITIES      shared ant physics + spawning
      6. BRAINS        player input, friendly follow, enemy defence
      7. COMBAT        melee, deaths, capturing a nest
      8. INPUT         keyboard / mouse / wheel
      9. CAMERA        smooth follow + edge clamp + zoom
     10. DIG & BUILD   excavate, place a block, gather food, lay eggs
     11. EFFECTS       spoil flecks + floating text
     12. UPDATE        per-frame simulation
     13. RENDER        sky, soil, ants, nests, HUD, overlays
     14. LOOP          requestAnimationFrame + bootstrap
   ========================================================================= */

'use strict';

/* ---------------------------------------------------------------------------
   1. CONFIG
   ------------------------------------------------------------------------- */
const CFG = {
  TILE: 32,
  MAP_W: 220,
  MAP_H: 110,
  SURFACE_ROW: 22,

  SPEED: 175,            // queen move speed, px/sec
  ANT_SPEED: 192,        // workers are a touch quicker so they keep up
  GRAVITY: 1500,
  MAX_FALL: 620,
  STEP_UP: 40,           // px auto-climbed over a one-tile lip while walking

  DIG_TIME_DIRT: 0.45,
  DIG_TIME_ROCK: 1.7,
  DIG_REACH: 1.8,
  BUILD_COOLDOWN: 0.11,

  CAM_LERP: 9,
  ZOOM_MIN: 0.35,
  ZOOM_MAX: 2.5,
  ZOOM_STEP: 1.12,

  // --- colony ---
  START_ANTS: 5,
  EGG_COST: 10,          // food per new ant
  NESTS: 5,

  // --- combat ---
  QUEEN_HP: 240, QUEEN_ATK: 15,
  ANT_HP: 30,    ANT_ATK: 8,
  FOE_HP: 32,    FOE_ATK: 6,
  FOE_QUEEN_HP: 150, FOE_QUEEN_ATK: 10,
  ATK_COOLDOWN: 0.6,
  REGEN: 4,              // hp/sec your colony recovers away from a fight
  REGEN_CALM: 12 * 32,   // px — no enemy this close, and you start healing
  MELEE: 28,             // px — how close to trade blows
  AGGRO: 7 * 32,         // px — your ants break off to engage within this
  FOE_LEASH: 16 * 32,    // px — defenders won't chase past this from their nest
  CATCHUP_DIST: 15 * 32, // px — stragglers scurry back to the queen
  CATCHUP_TIME: 2.5,
};

// Warm daytime palette — one committed look, no light/dark theming.
const C = {
  skyTop:  '#3f97d1',
  skyMid:  '#79c1e8',
  skyLow:  '#c2e6f6',
  dirtHi:  '#d59259',
  dirtLow: '#7c4c2d',
  rock:    '#6f7d8c',
  rockHi:  '#93a0ae',
  ink:     '#38240f',    // your colony
  cream:   '#f7eedd',
  gold:    '#f5c247',
  food:    '#e55b73',
  panel:   'rgba(40,27,18,0.76)',
  hpGood:  '#6fc47a',
  hpBad:   '#d85442',
};
const NEST_COLORS = ['#c2412f', '#8d55c9', '#3f8f4a', '#1f8fa8', '#b4432f'];
const FONT = '"Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';

/* ---------------------------------------------------------------------------
   2. CANVAS
   ------------------------------------------------------------------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let VIEW_W = 0, VIEW_H = 0;

function resize() {
  VIEW_W = canvas.width  = window.innerWidth;
  VIEW_H = canvas.height = window.innerHeight;
  zoomBy(1);
}
window.addEventListener('resize', resize);

/* ---------------------------------------------------------------------------
   3. TILES
   ------------------------------------------------------------------------- */
const T = { AIR: 0, DIRT: 1, ROCK: 2, FOOD: 3 };

const SOLID    = { [T.DIRT]: 1, [T.ROCK]: 1 };   // FOOD is walk-through
const DIGGABLE  = { [T.DIRT]: 1, [T.ROCK]: 1 };

const MAP_PX_W = CFG.MAP_W * CFG.TILE;
const MAP_PX_H = CFG.MAP_H * CFG.TILE;

let grid, surfaceAt;

const clamp    = (v, a, b) => (v < a ? a : v > b ? b : v);
const inBounds = (tx, ty) => tx >= 0 && ty >= 0 && tx < CFG.MAP_W && ty < CFG.MAP_H;
const tIndex   = (tx, ty) => ty * CFG.MAP_W + tx;

const getTile     = (tx, ty) => (inBounds(tx, ty) ? grid[tIndex(tx, ty)] : T.DIRT);
const setTile     = (tx, ty, v) => { if (inBounds(tx, ty)) grid[tIndex(tx, ty)] = v; };
const tileIsSolid = (tx, ty) => !!SOLID[getTile(tx, ty)];

/* ---------------------------------------------------------------------------
   4. WORLDGEN
   ------------------------------------------------------------------------- */
let nests = [];

function generateWorld() {
  grid = new Int8Array(CFG.MAP_W * CFG.MAP_H);
  surfaceAt = new Int16Array(CFG.MAP_W);
  nests = [];

  // 4a. rolling ground line + solid soil beneath
  for (let tx = 0; tx < CFG.MAP_W; tx++) {
    const h = Math.round(
      CFG.SURFACE_ROW
      + 3.0 * Math.sin(tx * 0.080)
      + 2.0 * Math.sin(tx * 0.021 + 1.3)
      + 1.5 * Math.sin(tx * 0.005 + 4.0)
    );
    surfaceAt[tx] = h;
    for (let ty = 0; ty < CFG.MAP_H; ty++) setTile(tx, ty, ty < h ? T.AIR : T.DIRT);
  }

  // 4b. rock veins
  for (let i = 0; i < 80; i++) {
    const cx = 2 + ((Math.random() * (CFG.MAP_W - 4)) | 0);
    const minY = surfaceAt[cx] + 5;
    const cy = minY + ((Math.random() * (CFG.MAP_H - minY - 2)) | 0);
    const r = 2 + ((Math.random() * 2) | 0);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r && getTile(cx + dx, cy + dy) === T.DIRT)
          setTile(cx + dx, cy + dy, T.ROCK);
  }

  // 4c. wandering natural hollows
  for (let i = 0; i < 14; i++) {
    let cx = 8 + ((Math.random() * (CFG.MAP_W - 16)) | 0);
    let cy = surfaceAt[cx] + 8 + ((Math.random() * (CFG.MAP_H - surfaceAt[cx] - 14)) | 0);
    const steps = 30 + ((Math.random() * 60) | 0);
    for (let s = 0; s < steps; s++) {
      carveBlob(cx, cy, 1 + ((Math.random() * 1.6) | 0));
      cx = clamp(cx + ((Math.random() * 3) | 0) - 1, 2, CFG.MAP_W - 3);
      cy += ((Math.random() * 3) | 0) - 1;
      cy = clamp(cy, surfaceAt[cx] + 4, CFG.MAP_H - 3);
    }
  }

  // 4d. your home chamber under the spawn, with a shaft up to daylight.
  //     The queen starts on the surface a few paces to the side of the hole.
  const HOME_X = 14;
  carveRoom(HOME_X, surfaceAt[HOME_X] + 5, 3, 2);
  for (let ty = surfaceAt[HOME_X]; ty <= surfaceAt[HOME_X] + 4; ty++) setTile(HOME_X, ty, T.AIR);
  const SPAWN_X = HOME_X - 3;

  // 4e. rival nests — deeper and larger the further out they sit
  for (let i = 0; i < CFG.NESTS; i++) {
    const tx = clamp(46 + i * 34 + ((Math.random() * 9) | 0) - 4, 30, CFG.MAP_W - 14);
    const ty = surfaceAt[tx] + 7 + i * 3 + ((Math.random() * 4) | 0);
    const rw = 4 + ((i / 2) | 0), rh = 3;
    carveRoom(tx, ty, rw, rh);
    nests.push({
      i, tx, ty,
      x: tx * CFG.TILE, y: ty * CFG.TILE,
      rw, rh,
      color: NEST_COLORS[i % NEST_COLORS.length],
      garrison: 3 + i * 2,
      food: 24 + i * 12,
      reward: 2 + i,
      captured: false,
      spotted: false,
    });
    // a few food stores strewn about the chamber floor
    for (let k = 0; k < 3 + i; k++) {
      const fx = tx + ((Math.random() * (rw * 2 - 1)) | 0) - (rw - 1);
      const fy = ty + rh - 1;
      if (getTile(fx, fy) === T.AIR && SOLID[getTile(fx, fy + 1)]) setTile(fx, fy, T.FOOD);
    }
  }

  // 4f. loose food across the surface
  for (let tx = 4; tx < CFG.MAP_W - 4; tx++) {
    if (Math.random() < 0.055) {
      const g = surfaceAt[tx];
      if (getTile(tx, g - 1) === T.AIR && SOLID[getTile(tx, g)]) setTile(tx, g - 1, T.FOOD);
    }
  }

  return { sx: SPAWN_X, sy: surfaceAt[SPAWN_X] - 1 };
}

function carveBlob(cx, cy, r) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r && SOLID[getTile(cx + dx, cy + dy)])
        setTile(cx + dx, cy + dy, T.AIR);
}

// An oval chamber with a guaranteed solid floor under it.
function carveRoom(cx, cy, rw, rh) {
  for (let dy = -rh; dy <= rh; dy++)
    for (let dx = -rw; dx <= rw; dx++)
      if (Math.abs(dx) / rw + Math.abs(dy) / rh <= 1.2) setTile(cx + dx, cy + dy, T.AIR);
  for (let dx = -rw - 1; dx <= rw + 1; dx++)
    if (!SOLID[getTile(cx + dx, cy + rh + 1)]) setTile(cx + dx, cy + rh + 1, T.DIRT);
}

/* ---------------------------------------------------------------------------
   5. ENTITIES  —  every ant shares one bit of physics
   ------------------------------------------------------------------------- */
let entities = [];
let player = null;

function makeAnt(o) {
  return {
    x: o.x, y: o.y,
    w: o.w || 20, h: o.h || 13,
    vy: 0,
    face: { x: 1, y: 0 },
    flip: false,
    animPhase: Math.random() * 6,
    team: o.team,                  // 0 = yours, 1.. = rival nest index + 1
    kind: o.kind || 'ant',         // 'ant' | 'queen'
    nest: o.nest === undefined ? -1 : o.nest,
    maxHp: o.hp, hp: o.hp,
    atk: o.atk,
    cd: Math.random() * 0.4,
    hurt: 0,
    alive: true,
    offset: (Math.random() * 2 - 1) * 58,   // personal spacing when following
    catchup: 0,
  };
}

function boxHits(e, px, py) {
  const x0 = Math.floor(px / CFG.TILE);
  const y0 = Math.floor(py / CFG.TILE);
  const x1 = Math.floor((px + e.w - 1) / CFG.TILE);
  const y1 = Math.floor((py + e.h - 1) / CFG.TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (tileIsSolid(tx, ty)) return true;
  return false;
}

// A solid tile in the column beside the body: something to climb.
function gripping(e) {
  const y0 = Math.floor(e.y / CFG.TILE);
  const y1 = Math.floor((e.y + e.h - 1) / CFG.TILE);
  const lc = Math.floor(e.x / CFG.TILE) - 1;
  const rc = Math.floor((e.x + e.w - 1) / CFG.TILE) + 1;
  for (let ty = y0; ty <= y1; ty++)
    if (tileIsSolid(lc, ty) || tileIsSolid(rc, ty)) return true;
  return false;
}

function moveEntity(e, ix, iy, dt, speed) {
  if (ix || iy) {
    e.face = { x: Math.sign(ix), y: Math.sign(iy) };
    if (ix) e.flip = ix < 0;
  }
  const step = speed * dt;

  if (ix) {
    const dx = ix * step;
    if (!boxHits(e, e.x + dx, e.y)) e.x += dx;
    else {
      for (let lift = 8; lift <= CFG.STEP_UP; lift += 8) {
        if (!boxHits(e, e.x + dx, e.y - lift)) { e.x += dx; e.y -= lift; break; }
      }
    }
    e.animPhase += step * 0.09;
  }

  if (iy && gripping(e)) {
    e.vy = 0;
    const dy = iy * step;
    if (!boxHits(e, e.x, e.y + dy)) e.y += dy;
    e.animPhase += step * 0.09;
  } else {
    e.vy = Math.min(e.vy + CFG.GRAVITY * dt, CFG.MAX_FALL);
    const dy = e.vy * dt;
    if (!boxHits(e, e.x, e.y + dy)) e.y += dy;
    else {
      let s = Math.max(1, Math.ceil(dy));
      while (s-- > 0 && !boxHits(e, e.x, e.y + 1)) e.y += 1;
      e.vy = 0;
    }
  }

  e.x = clamp(e.x, 0, MAP_PX_W - e.w);
  e.y = clamp(e.y, 0, MAP_PX_H - e.h);
  let safety = CFG.TILE;
  while (safety-- > 0 && boxHits(e, e.x, e.y)) e.y -= 1;
}

const cxOf = (e) => e.x + e.w / 2;
const cyOf = (e) => e.y + e.h / 2;
const distTo = (a, bx, by) => Math.hypot(cxOf(a) - bx, cyOf(a) - by);

function spawnFriendly(x, y) {
  const a = makeAnt({ x, y, team: 0, hp: CFG.ANT_HP, atk: CFG.ANT_ATK });
  entities.push(a);
  return a;
}

function nearestEnemy(e, range) {
  let best = null, bd = range;
  for (const o of entities) {
    if (!o.alive) continue;
    if ((e.team === 0) === (o.team === 0)) continue;   // same side
    const d = Math.hypot(cxOf(e) - cxOf(o), cyOf(e) - cyOf(o));
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/* ---------------------------------------------------------------------------
   6. BRAINS
   ------------------------------------------------------------------------- */
function steer(e, tx, ty, dt, speed) {
  const ix = Math.abs(tx - cxOf(e)) > 10 ? Math.sign(tx - cxOf(e)) : 0;
  const iy = Math.abs(ty - cyOf(e)) > 14 ? Math.sign(ty - cyOf(e)) : 0;
  moveEntity(e, ix, iy, dt, speed);
}

function brainFriendly(e, dt) {
  const foe = nearestEnemy(e, CFG.AGGRO);
  if (foe) {
    e.catchup = 0;
    steer(e, cxOf(foe), cyOf(foe), dt, CFG.ANT_SPEED);
    return;
  }
  // trail the queen, each ant holding its own little offset
  const tx = cxOf(player) + e.offset;
  const d = distTo(e, cxOf(player), cyOf(player));
  if (d > 46) steer(e, tx, cyOf(player), dt, CFG.ANT_SPEED);
  else moveEntity(e, 0, 0, dt, CFG.ANT_SPEED);

  // a straggler stuck behind a wall scurries back rather than getting lost
  if (d > CFG.CATCHUP_DIST) {
    e.catchup += dt;
    if (e.catchup > CFG.CATCHUP_TIME) {
      e.x = player.x + (Math.random() * 2 - 1) * 26;
      e.y = player.y - 4;
      e.vy = 0; e.catchup = 0;
      puff(cxOf(e), cyOf(e), false);
    }
  } else e.catchup = 0;
}

function brainFoe(e, dt) {
  const nest = nests[e.nest];
  const leash = e.kind === 'queen' ? 5 * 32 : CFG.FOE_LEASH;
  const target = nearestEnemy(e, CFG.AGGRO * 1.4);
  const homeD = distTo(e, nest.x, nest.y);

  if (target && homeD < leash) {
    steer(e, cxOf(target), cyOf(target), dt, CFG.ANT_SPEED * 0.9);
  } else if (homeD > 60) {
    steer(e, nest.x, nest.y, dt, CFG.ANT_SPEED * 0.7);     // drift home
  } else {
    moveEntity(e, 0, 0, dt, CFG.ANT_SPEED);                // idle, gravity only
  }
}

/* ---------------------------------------------------------------------------
   7. COMBAT
   ------------------------------------------------------------------------- */
function updateCombat(dt) {
  for (const e of entities) {
    if (!e.alive) continue;
    e.cd -= dt;
    e.hurt = Math.max(0, e.hurt - dt);
    if (e.cd > 0) continue;

    const foe = nearestEnemy(e, CFG.MELEE);
    if (!foe) continue;

    const dmg = e.atk + (e.team === 0 ? power * 2 : 0);
    foe.hp -= dmg;
    foe.hurt = 0.18;
    e.cd = CFG.ATK_COOLDOWN;
    spark(cxOf(foe), cyOf(foe));
    if (foe.hp <= 0) killAnt(foe);
  }
}

// Away from a fight your colony licks its wounds, so a bruised raid can pull
// back, heal up and come again instead of dead-ending the run.
function updateRegen(dt) {
  for (const e of entities) {
    if (!e.alive || e.team !== 0 || e.hp >= e.maxHp) continue;
    if (nearestEnemy(e, CFG.REGEN_CALM)) continue;
    e.hp = Math.min(e.maxHp, e.hp + CFG.REGEN * dt);
  }
}

function killAnt(e) {
  if (!e.alive) return;
  e.alive = false;
  puff(cxOf(e), cyOf(e), false);
  if (e === player) { gameState = 'lost'; return; }
  if (e.kind === 'queen' && e.nest >= 0) captureNest(e.nest);
}

function captureNest(ni) {
  const nest = nests[ni];
  if (nest.captured) return;
  nest.captured = true;
  power++;
  food += nest.food;

  let defected = 0;
  for (const o of entities) {
    if (o.alive && o.nest === ni && o.kind === 'ant') {
      o.team = 0; o.nest = -1;
      o.hp = o.maxHp;
      o.offset = (Math.random() * 2 - 1) * 58;
      defected++;
    }
  }
  for (let k = 0; k < nest.reward; k++) {
    spawnFriendly(player.x + (Math.random() * 2 - 1) * 30, player.y - 4);
    defected++;
  }

  toast(`NEST TAKEN   +${defected} ants   +${nest.food} food   +1 power`, C.gold, 3.4);
  if (nests.every((n) => n.captured)) gameState = 'won';
}

/* ---------------------------------------------------------------------------
   8. INPUT
   ------------------------------------------------------------------------- */
const keys = new Set();
const mouse = { x: 0, y: 0, down: false };
let eggLatch = false;

const keyDown = (...n) => n.some((k) => keys.has(k));
const norm = (k) => (k === ' ' ? 'space' : k.toLowerCase());

window.addEventListener('keydown', (e) => {
  const k = norm(e.key);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space'].includes(k)) e.preventDefault();
  if (k === '+' || k === '=') zoomBy(CFG.ZOOM_STEP);
  if (k === '-' || k === '_') zoomBy(1 / CFG.ZOOM_STEP);
  if (k === 'r' && gameState !== 'play') restart();
  keys.add(k);
});
window.addEventListener('keyup', (e) => keys.delete(norm(e.key)));
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', () => { mouse.down = true; });
window.addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? CFG.ZOOM_STEP : 1 / CFG.ZOOM_STEP);
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------------------------------------------------------------------
   9. CAMERA
   ------------------------------------------------------------------------- */
const cam = { x: 0, y: 0, zoom: 1 };

function zoomBy(f) {
  cam.zoom = clamp(cam.zoom * f, CFG.ZOOM_MIN, CFG.ZOOM_MAX);
  cam.zoom = Math.max(cam.zoom, VIEW_W / MAP_PX_W, VIEW_H / MAP_PX_H);
}

function updateCamera(dt) {
  const vw = VIEW_W / cam.zoom, vh = VIEW_H / cam.zoom;
  const tx = cxOf(player) - vw / 2;
  const ty = cyOf(player) - vh / 2;
  const t = 1 - Math.exp(-CFG.CAM_LERP * dt);
  cam.x += (tx - cam.x) * t;
  cam.y += (ty - cam.y) * t;
  cam.x = clamp(cam.x, 0, Math.max(0, MAP_PX_W - vw));
  cam.y = clamp(cam.y, 0, Math.max(0, MAP_PX_H - vh));
}

const toScreen = (wx, wy) => ({ x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom });
const toWorld  = (sx, sy) => ({ x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y });

/* ---------------------------------------------------------------------------
   10. DIG & BUILD
   ------------------------------------------------------------------------- */
const digProgress = new Map();
let digTarget = null;
let tilesDug = 0, blocks = 0, food = 0, power = 0;
let buildCooldown = 0;

const aimVec = () => (player.face.x || player.face.y) ? player.face : { x: player.flip ? -1 : 1, y: 0 };

function pickDigTarget() {
  if (mouse.down) {
    const w = toWorld(mouse.x, mouse.y);
    const tx = Math.floor(w.x / CFG.TILE), ty = Math.floor(w.y / CFG.TILE);
    if (DIGGABLE[getTile(tx, ty)] &&
        Math.hypot(tx + 0.5 - cxOf(player) / CFG.TILE, ty + 0.5 - cyOf(player) / CFG.TILE) <= CFG.DIG_REACH + 0.5)
      return { tx, ty };
  }
  if (keys.has('space')) {
    const d = aimVec();
    const px = cxOf(player) + d.x * (player.w / 2 + CFG.TILE * 0.35);
    const py = cyOf(player) + d.y * (player.h / 2 + CFG.TILE * 0.35);
    const tx = Math.floor(px / CFG.TILE), ty = Math.floor(py / CFG.TILE);
    if (DIGGABLE[getTile(tx, ty)]) return { tx, ty };
  }
  return null;
}

function updateDigging(dt) {
  digTarget = pickDigTarget();
  if (!digTarget) return;
  const { tx, ty } = digTarget;
  const key = tx + ',' + ty;
  const need = getTile(tx, ty) === T.ROCK ? CFG.DIG_TIME_ROCK : CFG.DIG_TIME_DIRT;
  const worked = (digProgress.get(key) || 0) + dt;

  if (worked >= need) {
    const wasRock = getTile(tx, ty) === T.ROCK;
    setTile(tx, ty, T.AIR);
    digProgress.delete(key);
    tilesDug++;
    blocks += wasRock ? 2 : 1;
    puff(tx * CFG.TILE + 16, ty * CFG.TILE + 16, wasRock);
  } else digProgress.set(key, worked);
}

function buildTarget() {
  const d = aimVec();
  const tx = Math.floor(cxOf(player) / CFG.TILE) + d.x;
  const ty = Math.floor(cyOf(player) / CFG.TILE) + d.y;
  if (getTile(tx, ty) !== T.AIR || !inBounds(tx, ty)) return null;
  const bx = tx * CFG.TILE, by = ty * CFG.TILE;
  const clash = player.x < bx + CFG.TILE && player.x + player.w > bx &&
                player.y < by + CFG.TILE && player.y + player.h > by;
  return clash ? null : { tx, ty };
}

function updateBuild(dt) {
  buildCooldown -= dt;
  if (!keys.has('f') || blocks <= 0 || buildCooldown > 0) return;
  const t = buildTarget();
  if (!t) return;
  setTile(t.tx, t.ty, T.DIRT);
  blocks--;
  tilesDug = Math.max(0, tilesDug - 1);
  puff(t.tx * CFG.TILE + 16, t.ty * CFG.TILE + 16, false);
  buildCooldown = CFG.BUILD_COOLDOWN;
}

// Any ant of yours walking over a food tile brings it home.
function gatherFood() {
  for (const e of entities) {
    if (!e.alive || e.team !== 0) continue;
    const x0 = Math.floor(e.x / CFG.TILE), y0 = Math.floor(e.y / CFG.TILE);
    const x1 = Math.floor((e.x + e.w - 1) / CFG.TILE), y1 = Math.floor((e.y + e.h - 1) / CFG.TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (getTile(tx, ty) === T.FOOD) {
          setTile(tx, ty, T.AIR);
          food += 4;
          toast('+4 food', C.food, 1.1, tx * CFG.TILE + 16, ty * CFG.TILE);
        }
  }
}

function tryLayEgg() {
  if (!keys.has('e')) { eggLatch = false; return; }
  if (eggLatch) return;
  eggLatch = true;
  if (food < CFG.EGG_COST) { toast('need ' + CFG.EGG_COST + ' food', C.cream, 1.1); return; }
  food -= CFG.EGG_COST;
  spawnFriendly(player.x + (Math.random() * 2 - 1) * 24, player.y - 4);
  toast('+1 ant', C.gold, 1.2);
}

/* ---------------------------------------------------------------------------
   11. EFFECTS
   ------------------------------------------------------------------------- */
const particles = [];
const toasts = [];

function puff(x, y, rock) {
  const n = rock ? 14 : 9;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 70;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
      life: 0.45 + Math.random() * 0.4, max: 0.85,
      r: 1.5 + Math.random() * 2, rot: Math.random() * Math.PI,
      col: rock ? C.rockHi : (Math.random() < 0.5 ? C.dirtHi : C.dirtLow),
    });
  }
}

function spark(x, y) {
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 60;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
      life: 0.25, max: 0.25, r: 1.6, rot: Math.random() * Math.PI, col: C.cream,
    });
  }
}

function toast(text, col, life = 2, wx = null, wy = null) {
  toasts.push({ text, col, life, max: life, wx, wy });
}

function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += 300 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= (1 - 2.5 * dt);
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = toasts.length - 1; i >= 0; i--) {
    toasts[i].life -= dt;
    if (toasts[i].wy !== null) toasts[i].wy -= 22 * dt;
    if (toasts[i].life <= 0) toasts.splice(i, 1);
  }
}

/* ---------------------------------------------------------------------------
   12. UPDATE
   ------------------------------------------------------------------------- */
let gameState = 'play';   // 'play' | 'won' | 'lost'

function update(dt) {
  if (gameState !== 'play') { updateEffects(dt); updateCamera(dt); return; }

  // the queen you steer
  const ix = (keyDown('d', 'arrowright') ? 1 : 0) - (keyDown('a', 'arrowleft') ? 1 : 0);
  const iy = (keyDown('s', 'arrowdown')  ? 1 : 0) - (keyDown('w', 'arrowup')   ? 1 : 0);
  moveEntity(player, ix, iy, dt, CFG.SPEED);

  // Aiming straight up or down eases her into the middle of her column. She's
  // nearly a tile wide, so without this she straddles two columns and a shaft
  // she digs beneath herself leaves her standing on the half she didn't dig.
  if (!ix && iy) {
    const want = (Math.floor(cxOf(player) / CFG.TILE) + 0.5) * CFG.TILE - player.w / 2;
    const nx = player.x + clamp(want - player.x, -110 * dt, 110 * dt);
    if (!boxHits(player, nx, player.y)) player.x = nx;
  }

  for (const e of entities) {
    if (!e.alive || e === player) continue;
    if (e.team === 0) brainFriendly(e, dt);
    else brainFoe(e, dt);
  }

  updateCombat(dt);
  updateRegen(dt);
  updateDigging(dt);
  updateBuild(dt);
  tryLayEgg();
  gatherFood();
  updateEffects(dt);
  updateCamera(dt);

  // announce a nest the moment you get close to it
  for (const n of nests) {
    if (n.captured || n.spotted) continue;
    if (distTo(player, n.x, n.y) < 9 * 32) {
      n.spotted = true;
      toast('RIVAL NEST — kill their queen', n.color, 2.6);
    }
  }

  if (entities.length > 200) entities = entities.filter((e) => e.alive || e === player);
  else for (let i = entities.length - 1; i >= 0; i--) if (!entities[i].alive) entities.splice(i, 1);
}

const myAnts = () => entities.reduce((n, e) => n + (e.alive && e.team === 0 && e !== player ? 1 : 0), 0);

/* ---------------------------------------------------------------------------
   13. RENDER
   ------------------------------------------------------------------------- */
function hexLerp(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ar = A >> 16, ag = (A >> 8) & 255, ab = A & 255;
  const br = B >> 16, bg = (B >> 8) & 255, bb = B & 255;
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

const STAMP = { dirt: [] };
function buildStamps() {
  const S = CFG.TILE;
  const mk = (draw) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    draw(c.getContext('2d'), S);
    return c;
  };
  for (let b = 0; b < 6; b++) {
    const t = b / 5;
    STAMP.dirt[b] = mk((g) => {
      g.fillStyle = hexLerp(C.dirtHi, C.dirtLow, t);
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(255,239,214,0.16)'; g.fillRect(0, 0, S, 4);
      g.fillStyle = 'rgba(48,28,14,0.20)';
      g.fillRect(6, 10, 3, 3); g.fillRect(20, 7, 2, 2);
      g.fillRect(13, 21, 3, 3); g.fillRect(25, 24, 2, 2);
      g.fillStyle = 'rgba(255,239,214,0.07)';
      g.fillRect(4, 17, 2, 2); g.fillRect(22, 15, 2, 2);
    });
  }
  STAMP.rock = mk((g) => {
    g.fillStyle = C.rock; g.fillRect(0, 0, S, S);
    g.fillStyle = C.rockHi;
    g.beginPath(); g.moveTo(4, S - 6); g.lineTo(12, 6); g.lineTo(S - 6, 10); g.lineTo(S - 4, S - 8);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 0, S, 4);
    g.strokeStyle = 'rgba(18,24,32,0.22)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(12, 6); g.lineTo(4, S - 6); g.moveTo(12, 6); g.lineTo(S - 6, 10); g.stroke();
    g.fillStyle = 'rgba(18,24,32,0.22)';
    g.fillRect(7, S - 11, 4, 4); g.fillRect(S - 12, S - 12, 3, 3);
  });
  STAMP.food = mk((g, S2) => {
    const S3 = S2;
    g.fillStyle = C.food;
    for (const [bx, by, r] of [[10, 20, 5], [20, 22, 4.5], [15, 13, 4]]) {
      g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath(); g.arc(8.5, 18, 1.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(18.5, 20.5, 1.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5d8a3a'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(15, 9); g.lineTo(19, 5); g.stroke();
    void S3;
  });
}

function render() {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, C.skyTop); sky.addColorStop(0.55, C.skyMid); sky.addColorStop(1, C.skyLow);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const sun = ctx.createRadialGradient(VIEW_W * 0.83, VIEW_H * 0.14, 8, VIEW_W * 0.83, VIEW_H * 0.14, 260);
  sun.addColorStop(0, 'rgba(255,250,235,0.33)'); sun.addColorStop(1, 'rgba(255,250,235,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawTiles();
  drawNestMarkers();
  drawBuildGhost();
  drawDigOverlay();
  drawParticles();
  for (const e of entities) if (e.alive && e !== player) drawAnt(e);
  drawAnt(player);
  drawWorldToasts();

  ctx.restore();

  drawLighting();
  drawOffscreenMarkers();
  drawHUD();
  if (gameState !== 'play') drawEndCard();
}

function drawTiles() {
  const S = CFG.TILE;
  const x0 = Math.max(0, Math.floor(cam.x / S));
  const y0 = Math.max(0, Math.floor(cam.y / S));
  const x1 = Math.min(CFG.MAP_W - 1, Math.ceil((cam.x + VIEW_W / cam.zoom) / S));
  const y1 = Math.min(CFG.MAP_H - 1, Math.ceil((cam.y + VIEW_H / cam.zoom) / S));

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const v = grid[tIndex(tx, ty)];
      if (v === T.AIR) continue;
      const px = tx * S, py = ty * S;

      if (v === T.FOOD) { ctx.drawImage(STAMP.food, px, py); continue; }
      if (v === T.ROCK) ctx.drawImage(STAMP.rock, px, py);
      else ctx.drawImage(STAMP.dirt[clamp(Math.floor((ty - surfaceAt[tx]) / 8), 0, 5)], px, py);

      const tj = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
      if (tj & 4) {
        ctx.fillStyle = v === T.ROCK ? 'rgba(18,24,32,0.16)' : 'rgba(48,28,14,0.15)';
        ctx.fillRect(px + (tj % 26), py + ((tj >> 5) % 26), 2, 2);
      }
      if (getTile(tx, ty - 1) === T.AIR) {
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        ctx.fillRect(px, py, S, 3);
      }
    }
  }
}

// A banner over each nest so a chamber reads as somebody's home.
function drawNestMarkers() {
  for (const n of nests) {
    const col = n.captured ? C.gold : n.color;
    ctx.globalAlpha = n.captured ? 0.85 : 0.95;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(n.x - n.rw * 32, n.y - n.rh * 32, n.rw * 64 + 32, n.rh * 64 + 32);
    ctx.setLineDash([]);
    // little flag on a pole at the chamber centre
    ctx.strokeStyle = C.cream; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(n.x + 16, n.y + 10); ctx.lineTo(n.x + 16, n.y - 22); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(n.x + 16, n.y - 22); ctx.lineTo(n.x + 40, n.y - 16); ctx.lineTo(n.x + 16, n.y - 9);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawBuildGhost() {
  if (!keys.has('f') || blocks <= 0 || gameState !== 'play') return;
  const t = buildTarget();
  if (!t) return;
  const S = CFG.TILE;
  ctx.fillStyle = 'rgba(213,146,89,0.4)';
  ctx.fillRect(t.tx * S + 3, t.ty * S + 3, S - 6, S - 6);
  ctx.strokeStyle = 'rgba(247,238,221,0.85)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(t.tx * S + 3, t.ty * S + 3, S - 6, S - 6);
}

function drawDigOverlay() {
  const S = CFG.TILE;
  for (const [key, worked] of digProgress) {
    const [tx, ty] = key.split(',').map(Number);
    const need = getTile(tx, ty) === T.ROCK ? CFG.DIG_TIME_ROCK : CFG.DIG_TIME_DIRT;
    const f = clamp(worked / need, 0, 1);
    const mx = tx * S + S / 2, my = ty * S + S / 2;
    ctx.strokeStyle = 'rgba(247,238,221,0.8)'; ctx.lineWidth = 1.6;
    for (let a = 0; a < 6; a++) {
      const th = (a / 6) * Math.PI * 2 + 0.3;
      ctx.beginPath(); ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(th) * S * 0.4 * f, my + Math.sin(th) * S * 0.4 * f); ctx.stroke();
    }
    ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, S * 0.33, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
  }
  if (digTarget) {
    ctx.strokeStyle = 'rgba(247,238,221,0.9)'; ctx.lineWidth = 2;
    ctx.strokeRect(digTarget.tx * S + 2, digTarget.ty * S + 2, S - 4, S - 4);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.col;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot + (p.max - p.life) * 7);
    ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawAnt(e) {
  const isQueen = e.kind === 'queen';
  const mine = e.team === 0;
  const body = e.hurt > 0 ? '#e8705c' : (mine ? C.ink : nests[e.nest] ? nests[e.nest].color : C.ink);
  const sc = (isQueen ? 1.45 : 1.05) * (e === player ? 1.06 : 1);
  const wig = Math.sin(e.animPhase) * 2;

  let fx = e.face.x, fy = e.face.y;
  if (!fx && !fy) { fx = e.flip ? -1 : 1; fy = 0; }
  const ang = Math.atan2(fy, fx);

  ctx.save();
  ctx.translate(cxOf(e), cyOf(e));
  ctx.rotate(ang);
  if (Math.cos(ang) < -0.001) ctx.scale(1, -1);
  ctx.scale(sc, sc);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  const legs = () => {
    for (let i = 0; i < 3; i++) {
      const lx = -6 + i * 6, k = i % 2 ? wig : -wig;
      ctx.beginPath();
      ctx.moveTo(lx, 0); ctx.lineTo(lx - 4, 7 + k);
      ctx.moveTo(lx, 0); ctx.lineTo(lx - 4, -7 - k);
      ctx.stroke();
    }
  };
  ctx.strokeStyle = C.cream; ctx.lineWidth = 3.4; legs();
  ctx.strokeStyle = body;    ctx.lineWidth = 1.7; legs();

  const shape = () => {
    ctx.moveTo(-0.6, 0); ctx.ellipse(-7, 0, 6.4, 5.4, 0, 0, Math.PI * 2);
    ctx.moveTo(4.2, 0);  ctx.ellipse(0, 0, 4.2, 3.8, 0, 0, Math.PI * 2);
    ctx.moveTo(11, 0);   ctx.ellipse(7, 0, 4, 4, 0, 0, Math.PI * 2);
  };
  ctx.strokeStyle = C.cream; ctx.lineWidth = 3;
  ctx.beginPath(); shape(); ctx.stroke();
  ctx.fillStyle = body;
  ctx.beginPath(); shape(); ctx.fill();

  ctx.strokeStyle = body; ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(9, -1.6); ctx.lineTo(13.5, -5);
  ctx.moveTo(9, 1.6);  ctx.lineTo(13.5, 5);
  ctx.stroke();

  ctx.fillStyle = mine ? C.gold : C.cream;
  ctx.beginPath(); ctx.arc(11.5, 0, 2.2, 0, Math.PI * 2); ctx.fill();

  if (isQueen) {                       // a small crown over the thorax
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.moveTo(-3, -5); ctx.lineTo(-1.5, -9); ctx.lineTo(0, -6);
    ctx.lineTo(1.5, -9); ctx.lineTo(3, -5);
    ctx.closePath(); ctx.fill();
  }
  if (e === player && blocks > 0) {
    ctx.fillStyle = C.dirtHi; ctx.strokeStyle = C.cream; ctx.lineWidth = 1.4;
    ctx.fillRect(-12.5, -9, 5.5, 5.5); ctx.strokeRect(-12.5, -9, 5.5, 5.5);
  }
  ctx.restore();

  // health pip above a wounded ant
  if (e.hp < e.maxHp) {
    const w = isQueen ? 30 : 20;
    const x = cxOf(e) - w / 2, y = e.y - (isQueen ? 14 : 9);
    ctx.fillStyle = 'rgba(20,12,6,0.55)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    const f = clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = f > 0.4 ? C.hpGood : C.hpBad;
    ctx.fillRect(x, y, w * f, 3);
  }
}

function drawWorldToasts() {
  ctx.textAlign = 'center';
  for (const t of toasts) {
    if (t.wy === null) continue;
    ctx.globalAlpha = clamp(t.life / t.max, 0, 1);
    ctx.font = '800 13px ' + FONT;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,18,10,0.7)';
    ctx.strokeText(t.text, t.wx, t.wy);
    ctx.fillStyle = t.col; ctx.fillText(t.text, t.wx, t.wy);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawLighting() {
  const ptx = clamp(Math.floor(cxOf(player) / CFG.TILE), 0, CFG.MAP_W - 1);
  const depth = Math.max(0, Math.floor((player.y + player.h) / CFG.TILE) - surfaceAt[ptx]);
  if (depth <= 3) return;
  const k = clamp((depth - 3) / 34, 0, 1) * 0.6;
  const s = toScreen(cxOf(player), cyOf(player));
  const R = 300 * cam.zoom;
  const g = ctx.createRadialGradient(s.x, s.y, R * 0.16, s.x, s.y, R);
  g.addColorStop(0, 'rgba(22,12,6,0)');
  g.addColorStop(0.55, `rgba(22,12,6,${k * 0.45})`);
  g.addColorStop(1, `rgba(22,12,6,${k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// Chevrons at the screen edge pointing at nests you haven't taken.
function drawOffscreenMarkers() {
  for (const n of nests) {
    if (n.captured) continue;
    const s = toScreen(n.x + 16, n.y);
    const m = 58;   // enough inset that the distance label isn't clipped
    if (s.x > m && s.x < VIEW_W - m && s.y > m && s.y < VIEW_H - m) continue;
    const px = clamp(s.x, m, VIEW_W - m), py = clamp(s.y, m, VIEW_H - m);
    const ang = Math.atan2(s.y - VIEW_H / 2, s.x - VIEW_W / 2);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = n.color;
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-7, -8); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(247,238,221,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    const d = Math.round(Math.hypot(n.x - cxOf(player), n.y - cyOf(player)) / CFG.TILE);
    ctx.font = '800 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,18,10,0.7)';
    ctx.strokeText(d + 'm', px, py + 26);
    ctx.fillStyle = C.cream; ctx.fillText(d + 'm', px, py + 26);
    ctx.textAlign = 'left';
  }
}

function rr(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function panel(x, y, w, h) {
  ctx.fillStyle = C.panel; rr(x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
  rr(x + 0.5, y + 0.5, w - 1, h - 1, 11.5); ctx.stroke();
}

function drawHUD() {
  ctx.textBaseline = 'alphabetic';

  // controls
  const cw = 238, ch = 146;
  panel(16, 16, cw, ch);
  ctx.fillStyle = C.gold; ctx.font = '800 17px ' + FONT;
  ctx.fillText('ANTWORKS', 32, 42);
  const rows = [
    ['Walk / climb', 'WASD'],
    ['Dig', 'Space / click'],
    ['Place block', 'F'],
    ['Lay egg', 'E · ' + CFG.EGG_COST + ' food'],
    ['Zoom', 'wheel · + −'],
  ];
  ctx.font = '600 12.5px ' + FONT;
  rows.forEach(([a, b], i) => {
    const y = 66 + i * 16;
    ctx.fillStyle = 'rgba(247,238,221,0.6)'; ctx.textAlign = 'left'; ctx.fillText(a, 32, y);
    ctx.fillStyle = C.cream; ctx.textAlign = 'right'; ctx.fillText(b, 16 + cw - 16, y);
  });
  ctx.textAlign = 'left';

  // colony readout
  const sw = 168, sx = VIEW_W - 16 - sw;
  panel(sx, 16, sw, 128);
  const taken = nests.filter((n) => n.captured).length;
  const stats = [
    ['ANTS', myAnts(), C.cream],
    ['FOOD', food, C.food],
    ['POWER', power, C.gold],
    ['NESTS', taken + ' / ' + nests.length, C.cream],
  ];
  stats.forEach(([a, b, col], i) => {
    const y = 46 + i * 26;
    ctx.font = '700 11px ' + FONT;
    ctx.fillStyle = 'rgba(247,238,221,0.58)'; ctx.textAlign = 'left'; ctx.fillText(a, sx + 16, y);
    ctx.font = '800 18px ' + FONT;
    ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(String(b), sx + sw - 16, y);
  });
  ctx.textAlign = 'left';

  // queen health
  const bw = 260, bx = (VIEW_W - bw) / 2, by = VIEW_H - 46;
  panel(bx - 10, by - 20, bw + 20, 44);
  ctx.font = '700 11px ' + FONT;
  ctx.fillStyle = 'rgba(247,238,221,0.6)';
  ctx.fillText('QUEEN', bx, by - 6);
  ctx.fillStyle = 'rgba(20,12,6,0.5)'; rr(bx, by, bw, 12, 6); ctx.fill();
  const f = clamp(player.hp / player.maxHp, 0, 1);
  ctx.fillStyle = f > 0.35 ? C.hpGood : C.hpBad;
  rr(bx, by, Math.max(6, bw * f), 12, 6); ctx.fill();
  ctx.font = '800 11px ' + FONT; ctx.textAlign = 'right';
  ctx.fillStyle = C.cream;
  ctx.fillText(Math.max(0, Math.ceil(player.hp)) + ' / ' + player.maxHp, bx + bw, by - 6);
  ctx.textAlign = 'left';

  // screen toasts
  let ty = 168;
  ctx.textAlign = 'center';
  for (const t of toasts) {
    if (t.wy !== null) continue;
    ctx.globalAlpha = clamp(t.life / t.max, 0, 1);
    ctx.font = '800 16px ' + FONT;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(30,18,10,0.75)';
    ctx.strokeText(t.text, VIEW_W / 2, ty);
    ctx.fillStyle = t.col; ctx.fillText(t.text, VIEW_W / 2, ty);
    ty += 26;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawEndCard() {
  ctx.fillStyle = 'rgba(22,12,6,0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const w = 420, h = 168, x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
  panel(x, y, w, h);
  ctx.textAlign = 'center';
  const won = gameState === 'won';
  ctx.fillStyle = won ? C.gold : C.hpBad;
  ctx.font = '800 30px ' + FONT;
  ctx.fillText(won ? 'THE ANTHILL IS YOURS' : 'THE QUEEN HAS FALLEN', x + w / 2, y + 60);
  ctx.fillStyle = C.cream; ctx.font = '600 14px ' + FONT;
  ctx.fillText(won
    ? `All ${nests.length} rival nests taken · ${myAnts()} ants · ${power} power`
    : `You held ${nests.filter((n) => n.captured).length} of ${nests.length} nests`,
    x + w / 2, y + 92);
  ctx.fillStyle = 'rgba(247,238,221,0.7)'; ctx.font = '700 13px ' + FONT;
  ctx.fillText('press  R  to start a new colony', x + w / 2, y + 128);
  ctx.textAlign = 'left';
}

/* ---------------------------------------------------------------------------
   14. LOOP + BOOTSTRAP
   ------------------------------------------------------------------------- */
let last = 0;

function frame(ts) {
  let dt = (ts - last) / 1000;
  last = ts;
  if (dt > 0.05) dt = 0.05;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function restart() {
  entities = [];
  particles.length = 0;
  toasts.length = 0;
  digProgress.clear();
  tilesDug = 0; blocks = 0; food = 0; power = 0;
  gameState = 'play';

  const spawn = generateWorld();

  player = makeAnt({
    x: spawn.sx * CFG.TILE + 4, y: spawn.sy * CFG.TILE,
    w: 24, h: 17, team: 0, kind: 'queen',
    hp: CFG.QUEEN_HP, atk: CFG.QUEEN_ATK,
  });
  entities.push(player);

  for (let i = 0; i < CFG.START_ANTS; i++)
    spawnFriendly(player.x + (Math.random() * 2 - 1) * 40, player.y - 6);

  for (const n of nests) {
    entities.push(makeAnt({
      x: n.x, y: n.y - 20, w: 24, h: 17,
      team: n.i + 1, kind: 'queen', nest: n.i,
      hp: CFG.FOE_QUEEN_HP + n.i * 35, atk: CFG.FOE_QUEEN_ATK + n.i * 2,
    }));
    for (let k = 0; k < n.garrison; k++)
      entities.push(makeAnt({
        x: n.x + (Math.random() * 2 - 1) * n.rw * 24,
        y: n.y - 10,
        team: n.i + 1, nest: n.i,
        hp: CFG.FOE_HP + n.i * 5, atk: CFG.FOE_ATK + n.i,
      }));
  }

  cam.zoom = 1;
  const vw = VIEW_W / cam.zoom, vh = VIEW_H / cam.zoom;
  cam.x = clamp(cxOf(player) - vw / 2, 0, Math.max(0, MAP_PX_W - vw));
  cam.y = clamp(cyOf(player) - vh / 2, 0, Math.max(0, MAP_PX_H - vh));

  toast('Raid the rival nests · kill their queen', C.cream, 4);
}

function init() {
  resize();
  buildStamps();
  restart();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 15px "Nunito"').catch(() => {});
    document.fonts.load('800 15px "Nunito"').catch(() => {});
  }
  requestAnimationFrame(frame);
}

init();
