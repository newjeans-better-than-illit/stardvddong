'use strict';
// ───────────────────────── 농장 지도와 게임 상태 ─────────────────────────

const GROUND = { GRASS: 0, PATH: 1, WATER: 2, TREE: 3 };
const SAVE_KEY = 'stardew-ddong-save-v1';

const W = {
  ground: new Uint8Array(MAP_W * MAP_H),
  variant: new Uint8Array(MAP_W * MAP_H),
  blocked: new Uint8Array(MAP_W * MAP_H),   // 건물 자리
  buildings: [],
  trees: [],
};

const key = (x, y) => y * MAP_W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

function buildMap() {
  const r = mulberry32(20261012);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const k = key(x, y);
    W.variant[k] = Math.floor(r() * 16);
    const border = x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2;
    W.ground[k] = border ? GROUND.TREE : GROUND.GRASS;
  }
  // 집 앞 큰길
  for (let y = 6; y <= 7; y++) for (let x = 3; x <= 35; x++) W.ground[key(x, y)] = GROUND.PATH;
  for (let y = 2; y <= 5; y++) for (let x = 3; x <= 7; x++) W.ground[key(x, y)] = GROUND.PATH;
  for (let y = 2; y <= 5; y++) for (let x = 29; x <= 35; x++) W.ground[key(x, y)] = GROUND.PATH;
  // 연못 두 개
  const pond = (cx, cy, rx, ry) => {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && W.ground[key(x, y)] !== GROUND.TREE) W.ground[key(x, y)] = GROUND.WATER;
    }
  };
  pond(32, 19, 4.3, 3.3);
  pond(6, 24.5, 2.4, 1.8);

  W.buildings = [
    { kind: 'house', x: 3, y: 3, w: 5, h: 3, door: [5, 5] },
    { kind: 'bin', x: 9, y: 5, w: 2, h: 1 },
    { kind: 'shop', x: 30, y: 3, w: 5, h: 3 },
  ];
  for (const b of W.buildings) {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) W.blocked[key(x, y)] = 1;
  }
  W.trees = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (W.ground[key(x, y)] === GROUND.TREE) W.trees.push({ x, y, v: W.variant[key(x, y)] % 3 });
  }
}

function buildingAt(x, y) {
  for (const b of W.buildings) {
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b;
  }
  return null;
}

// ── 게임 상태 ──
let G = null;

function newGameState(seed) {
  const r = mulberry32(seed);
  const s = {
    v: 1,
    seed,
    day: 1, season: 0, year: 1,
    time: DAY_START,
    money: 500,
    energy: 270, maxEnergy: 270,
    canLevel: 0, water: CAN_CAPACITY[0],
    inv: new Array(INV_SIZE).fill(null),
    sel: 0,
    soil: new Map(),
    obj: new Map(),
    shipped: [],
    weather: 'sun', tomorrow: 'sun',
    stats: { harvested: {}, earned: 0, shippedTotal: 0 },
    flags: { intro: false, master: false },
    player: { x: 5.5 * TILE, y: 6.9 * TILE, dir: 'down' },
  };
  s.inv[0] = { id: 'hoe', n: 1 };
  s.inv[1] = { id: 'can', n: 1 };
  s.inv[2] = { id: 'scythe', n: 1 };
  s.inv[3] = { id: 'pick', n: 1 };
  s.inv[4] = { id: 'axe', n: 1 };
  s.inv[5] = { id: 'seed_parsnip', n: 15 };
  // 처음 농장은 잡동사니로 가득
  let placed = 0, guard = 0;
  while (placed < 110 && guard++ < 5000) {
    const x = 2 + Math.floor(r() * (MAP_W - 4));
    const y = 9 + Math.floor(r() * (MAP_H - 11));
    const k = key(x, y);
    if (W.ground[k] !== GROUND.GRASS || W.blocked[k] || s.obj.has(k)) continue;
    if (x <= 12 && y <= 12) continue;   // 집 앞은 비워둔다
    const roll = r();
    const type = roll < 0.45 ? 'weed' : roll < 0.7 ? 'stone' : roll < 0.95 ? 'twig' : 'stump';
    s.obj.set(k, { type, hp: type === 'stump' ? 3 : 1 });
    placed++;
  }
  return s;
}

function serialize(s) {
  return {
    v: s.v, seed: s.seed, day: s.day, season: s.season, year: s.year, time: s.time,
    money: s.money, energy: s.energy, maxEnergy: s.maxEnergy,
    canLevel: s.canLevel, water: s.water, inv: s.inv, sel: s.sel,
    soil: [...s.soil.entries()], obj: [...s.obj.entries()], shipped: s.shipped,
    weather: s.weather, tomorrow: s.tomorrow, stats: s.stats, flags: s.flags, player: s.player,
  };
}

function deserialize(o) {
  if (!o || o.v !== 1) return null;
  const s = Object.assign({}, o);
  s.soil = new Map(o.soil);
  s.obj = new Map(o.obj);
  s.inv = o.inv.slice(0, INV_SIZE);
  while (s.inv.length < INV_SIZE) s.inv.push(null);
  return s;
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(G)));
    return true;
  } catch (e) {
    return false;
  }
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 저장소 없음 */ }
}

function isSolid(tx, ty) {
  if (!inMap(tx, ty)) return true;
  const k = key(tx, ty);
  const gr = W.ground[k];
  if (gr === GROUND.WATER || gr === GROUND.TREE) return true;
  if (W.blocked[k]) return true;
  return G.obj.has(k);
}

// 밭으로 만들 수 있는 칸
function isTillable(tx, ty) {
  if (!inMap(tx, ty)) return false;
  const k = key(tx, ty);
  return W.ground[k] === GROUND.GRASS && !W.blocked[k] && !G.obj.has(k) && !G.soil.has(k);
}

// ── 인벤토리 ──
function itemDef(id) { return ITEMS[id]; }

function canStack(id) { return ITEMS[id].kind !== 'tool'; }

function addItem(id, n = 1, q = 0) {
  const inv = G.inv;
  if (canStack(id)) {
    for (const it of inv) {
      if (it && it.id === id && (it.q || 0) === q && it.n < MAX_STACK) {
        const room = MAX_STACK - it.n;
        const add = Math.min(room, n);
        it.n += add; n -= add;
        if (n <= 0) return true;
      }
    }
  }
  for (let i = 0; i < inv.length && n > 0; i++) {
    if (!inv[i]) {
      const add = canStack(id) ? Math.min(MAX_STACK, n) : 1;
      inv[i] = q ? { id, n: add, q } : { id, n: add };
      n -= add;
    }
  }
  return n <= 0;
}

function hasRoomFor(id, q = 0) {
  return G.inv.some((it) => !it || (canStack(id) && it.id === id && (it.q || 0) === q && it.n < MAX_STACK));
}

function countItem(id) {
  return G.inv.reduce((sum, it) => sum + (it && it.id === id ? it.n : 0), 0);
}

function consumeSelected(n = 1) {
  const it = G.inv[G.sel];
  if (!it) return;
  it.n -= n;
  if (it.n <= 0) G.inv[G.sel] = null;
}

function itemValue(it) {
  const def = ITEMS[it.id];
  if (!def.sell) return 0;
  return Math.floor(def.sell * QUALITY[it.q || 0].mult);
}

function cropStage(crop) {
  const def = CROPS[crop.id];
  if (crop.days >= def.days) return 4;
  if (crop.days <= 0) return 0;
  const r = crop.days / def.days;
  if (r < 0.34) return 1;
  if (r < 0.67) return 2;
  return 3;
}
