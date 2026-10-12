'use strict';
// ───────────────────────── 픽셀 스프라이트: 똥과 아이템 ─────────────────────────

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
// t > 0 이면 밝게, t < 0 이면 어둡게
function shade(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  if (t >= 0) return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
  return rgbToHex(r * (1 + t), g * (1 + t), b * (1 + t));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 문자열 행으로 스프라이트 만들기. pal 값은 색 문자열이거나 (x, y) => 색 함수
function fromRows(rows, pal, w) {
  const width = w || Math.max(...rows.map((r) => r.length));
  const c = mkCanvas(width, rows.length);
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const p = pal[row[x]];
      if (!p) continue;
      g.fillStyle = typeof p === 'function' ? p(x, y) : p;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

// 불투명 픽셀 둘레에 1px 외곽선을 두른다
function outline(c, color) {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const mark = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) mark.push([x, y]);
  }
  g.fillStyle = color;
  for (const [x, y] of mark) g.fillRect(x, y, 1, 1);
  return c;
}

// ── 똥 모양 (성장 단계별) ──
const POOP_SHAPES = [
  // 0: 씨앗을 심은 직후
  [
    '................', '................', '................', '................',
    '................', '................', '................', '................',
    '................', '................', '................', '......k...k.....',
    '........k.......', '.....k....k.....', '.......k........', '................',
  ],
  // 1: 새싹 + 아기 똥
  [
    '................', '................', '................', '................',
    '................', '................', '................', '................',
    '................', '......gg.gg.....', '.......gGg......', '........G.......',
    '......kkkk......', '.....khbbbk.....', '.....kddddk.....', '......kkkk......',
  ],
  // 2: 작은 똥
  [
    '................', '................', '................', '................',
    '................', '................', '................', '.........gg.....',
    '........gG......', '.......kk.......', '......khbk......', '.....khbbbk.....',
    '....kkbbbbkk....', '...khbbbbbbbk...', '...kddddddddk...', '....kkkkkkkk....',
  ],
  // 3: 중간 똥
  [
    '................', '................', '................', '................',
    '.........gg.....', '........gG......', '.......kk.......', '......khbk......',
    '.....khbbbk.....', '....kkbbbbkk....', '...khbbbbbbbk...', '...kbbbbbbbbk...',
    '..kkddbbbbddkk..', '.khbbbbbbbbbbbk.', '.kddddddddddddk.', '..kkkkkkkkkkkk..',
  ],
  // 4: 다 자란 똥 (얼굴 있음)
  [
    '.........gg.....', '.......kkG......', '......khbk......', '.....khbbbk.....',
    '.....kbbbbk.....', '....kkdbbdkk....', '...khbbbbbbbk...', '...kbbbbbbbbk...',
    '..kkddbbbbddkk..', '.khbbbbbbbbbbbk.', '.kbwwbbbbbbwwbk.', 'kbbwebbbbbbewbbk',
    'kbbbbbmmmmbbbbbk', 'kdbbbbbtmbbbbbdk', '.kddddddddddddk.', '..kkkkkkkkkkkk..',
  ],
];

const LEAF = '#6cc04a';
const LEAF_DARK = '#3f8a2a';

function poopPalette(cropId) {
  const c = CROPS[cropId];
  const base = { g: LEAF, G: LEAF_DARK, w: '#ffffff', e: '#1d120a', m: '#4a1a14', t: '#e2536a' };
  if (c.rainbow) {
    const hue = (x, y, l) => `hsl(${(y * 26 + x * 6) % 360} 85% ${l}%)`;
    return Object.assign(base, {
      k: '#3a1f4a',
      b: (x, y) => hue(x, y, 62),
      h: (x, y) => hue(x, y, 82),
      d: (x, y) => hue(x, y, 45),
    });
  }
  if (c.shiny) {
    return Object.assign(base, { k: '#6e4a00', b: '#ffcf2e', h: '#fff4a8', d: '#d8960c' });
  }
  return Object.assign(base, {
    k: shade(c.color, -0.62),
    b: c.color,
    h: shade(c.color, 0.42),
    d: shade(c.color, -0.2),
  });
}

const DEAD_PAL = { k: '#3d3833', b: '#8a8070', h: '#aaa190', d: '#6f665a', g: '#8a6a3a', G: '#6a4f28', w: '#ddd', e: '#333', m: '#333', t: '#555' };

const SPR = {
  crops: {},   // SPR.crops[id][stage]
  dead: null,
  tools: {},
  items: {},   // 아이템 아이콘 캔버스
  icons: {},   // 아이템 아이콘 dataURL
  ui: {},
};

function buildPoopSprites() {
  for (const id of CROP_IDS) {
    const pal = poopPalette(id);
    SPR.crops[id] = POOP_SHAPES.map((rows, i) => {
      if (i === 0) return fromRows(rows, { k: '#3b2412' }, 16);
      return fromRows(rows, pal, 16);
    });
  }
  SPR.dead = fromRows(POOP_SHAPES[3], DEAD_PAL, 16);
}

// ── 도구 아이콘 (채움 픽셀만 그리고 외곽선은 자동) ──
const WOOD = '#a8682e';
const WOOD_L = '#d39a55';
const METAL = '#9aa6b2';
const METAL_L = '#e3e9ee';
const METAL_D = '#5d6670';

function toolSprite(kind) {
  const c = mkCanvas(16, 16);
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const handle = (len) => {
    for (let i = 0; i < len; i++) { px(2 + i, 13 - i, WOOD); px(3 + i, 13 - i, WOOD_L); }
  };
  if (kind === 'hoe') {
    handle(9);
    for (let x = 9; x <= 14; x++) px(x, 2, METAL_L);
    for (let x = 9; x <= 14; x++) px(x, 3, METAL);
    px(13, 4, METAL); px(14, 4, METAL_D); px(13, 5, METAL_D); px(14, 5, METAL_D);
  } else if (kind === 'pick') {
    handle(9);
    const arc = [[6, 3], [7, 2], [8, 1], [9, 1], [10, 1], [11, 2], [12, 2], [13, 3], [13, 4], [14, 5], [14, 6], [14, 7], [15, 8]];
    for (const [x, y] of arc) px(x, y, METAL);
    for (const [x, y] of [[8, 2], [9, 2], [10, 2], [12, 3], [13, 5], [13, 6]]) px(x, y, METAL_L);
  } else if (kind === 'axe') {
    handle(10);
    const head = ['..xxx', '.xxxxx', 'xxxxxx', 'xxxxx.', '.xxx..'];
    head.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === 'x') px(7 + x, 1 + y, x < 2 ? METAL_L : METAL); });
    px(12, 3, METAL_D);
  } else if (kind === 'scythe') {
    handle(10);
    const blade = [[12, 2], [11, 1], [10, 1], [9, 1], [8, 1], [7, 1], [6, 2], [5, 2], [4, 3], [3, 4], [9, 2], [8, 2], [7, 2], [10, 2]];
    for (const [x, y] of blade) px(x, y, METAL);
    for (const [x, y] of [[11, 1], [10, 1], [9, 1], [8, 1], [7, 1]]) px(x, y, METAL_L);
  } else if (kind === 'can') {
    const body = '#3fa58a', bodyL = '#76d2b4', bodyD = '#2a7a63';
    for (let y = 7; y <= 13; y++) for (let x = 3; x <= 10; x++) px(x, y, x < 5 ? bodyL : x > 9 ? bodyD : body);
    for (let x = 3; x <= 10; x++) px(x, 6, bodyD);
    for (const [x, y] of [[4, 5], [4, 4], [5, 3], [6, 3], [7, 3], [8, 4], [8, 5]]) px(x, y, bodyD);
    for (let i = 0; i < 4; i++) { px(11 + i, 9 - i, body); px(11 + i, 10 - i, bodyD); }
    px(14, 4, METAL_L); px(15, 4, METAL_L); px(15, 5, METAL_L);
  }
  return outline(c, '#24160c');
}

function simpleIcon(rows, pal, w) {
  return outline(fromRows(rows, pal, w || 16), '#24160c');
}

function seedPacket(cropId) {
  const pal = poopPalette(cropId);
  const c = mkCanvas(16, 16);
  const g = c.getContext('2d');
  g.fillStyle = '#e8c88a'; g.fillRect(3, 3, 10, 11);
  g.fillStyle = '#f7e2b0'; g.fillRect(4, 4, 8, 9);
  g.fillStyle = '#b98f4f'; g.fillRect(3, 3, 10, 2);
  g.fillStyle = '#d7b06d';
  for (let x = 3; x < 13; x += 2) g.fillRect(x, 2, 1, 1);
  // 봉지 그림: 작은 똥
  const mini = ['...kk...', '..khbk..', '.kkbbkk.', 'khbbbbbk', 'kddddddk', '.kkkkkk.'];
  mini.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const p = pal[r[x]];
      if (!p) continue;
      g.fillStyle = typeof p === 'function' ? p(x * 2, y * 2) : p;
      g.fillRect(4 + x, 6 + y, 1, 1);
    }
  });
  return outline(c, '#24160c');
}

function buildItemSprites() {
  for (const t of ['hoe', 'can', 'scythe', 'pick', 'axe']) SPR.tools[t] = SPR.items[t] = toolSprite(t);
  SPR.items.sprinkler = simpleIcon([
    '................', '................', '................', '.......bb.......',
    '......bBBb......', '.......mm.......', '...m...mm...m...', '...mmmmMMmmmm...',
    '...mmmmMMmmmm...', '...m...mm...m...', '.......mm.......', '......mmmm......',
    '.....mddddm.....', '.....dddddd.....', '................', '................',
  ], { b: '#3f8fd0', B: '#9fd6ff', m: METAL, M: METAL_L, d: METAL_D });
  SPR.items.cookie = simpleIcon([
    '................', '................', '................', '.....cccccc.....',
    '....cCCccccc....', '...cCcckcccdc...', '...ccccccckcc...', '...ckccccccccd..',
    '...cccccckcccd..', '...ccckcccccdd..', '....cccccccdd...', '.....ccddddd....',
    '................', '................', '................', '................',
  ], { c: '#d79a52', C: '#f2c27e', d: '#a8682e', k: '#4a2a12' });
  SPR.items.wood = simpleIcon([
    '................', '................', '................', '................',
    '..........rrr...', '.........rRRRr..', '...wwwwwwrRrRr..', '..wWWWWWWrRRRr..',
    '..wwwwwwwwrrr...', '..wwwwwwwwww....', '...wwwwwwww.....', '................',
    '................', '................', '................', '................',
  ], { w: WOOD, W: WOOD_L, r: '#c98a45', R: '#e8b778' });
  SPR.items.stone = simpleIcon([
    '................', '................', '................', '................',
    '................', '......ssss......', '....sSSssss.....', '...sSsssssss....',
    '...ssssssssds...', '..sssssssddds...', '..ssssssddddd...', '...dddddddd.....',
    '................', '................', '................', '................',
  ], { s: '#9b9b94', S: '#cfcfc6', d: '#6f6f69' });
  for (const id of CROP_IDS) {
    SPR.items[id] = SPR.crops[id][4];
    SPR.items['seed_' + id] = seedPacket(id);
  }
  for (const id of Object.keys(SPR.items)) {
    const big = mkCanvas(32, 32);
    const g = big.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(SPR.items[id], 0, 0, 32, 32);
    SPR.icons[id] = big.toDataURL();
  }
}

function buildUiSprites() {
  const toUrl = (c) => {
    const big = mkCanvas(c.width * 2, c.height * 2);
    const g = big.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(c, 0, 0, big.width, big.height);
    return big.toDataURL();
  };
  const sun = simpleIcon([
    '................', '.......y........', '..y....y....y...', '...y.......y....',
    '.....oooooo.....', '....oYYYYYoo....', '....oYYyyyyo....', 'yy..oYyyyyyo..yy',
    '....oyyyyyyo....', '....oyyyyyyo....', '.....oooooo.....', '...y.......y....',
    '..y....y....y...', '.......y........', '................', '................',
  ], { y: '#ffd23a', Y: '#fff2a0', o: '#f0a020' });
  const rain = simpleIcon([
    '................', '................', '.....cccc.......', '...ccCCCCcc.....',
    '..cCCCCCCCCcc...', '.cCCCCCCCCCCCc..', '.cccccccccccccc.', '..dddddddddddd..',
    '................', '...b...b...b....', '..b...b...b.....', '................',
    '....b...b...b...', '...b...b...b....', '................', '................',
  ], { c: '#c9d3dc', C: '#eef3f7', d: '#8e9ba8', b: '#3f8fd0' });
  const snow = simpleIcon([
    '................', '................', '.....cccc.......', '...ccCCCCcc.....',
    '..cCCCCCCCCcc...', '.cCCCCCCCCCCCc..', '.cccccccccccccc.', '..dddddddddddd..',
    '................', '...w....w...w...', '..www..www.www..', '...w....w...w...',
    '.....w....w.....', '....www..www....', '.....w....w.....', '................',
  ], { c: '#c9d3dc', C: '#eef3f7', d: '#8e9ba8', w: '#ffffff' });
  const coin = simpleIcon([
    '................', '................', '.....oooooo.....', '....oYYYYYYo....',
    '...oYYyyyyyyo...', '...oYyoooyyyo...', '...oyyoyyyyyo...', '...oyyoooyyyo...',
    '...oyyyyyoyyo...', '...oyyoooyyyo...', '....oyyyyyyo....', '.....oooooo.....',
    '................', '................', '................', '................',
  ], { y: '#ffcf2e', Y: '#fff2a0', o: '#c48a10' });
  const star = (col, hi) => simpleIcon([
    '..........', '.....s....', '....sSs...', '.sssSSsss.', '..sSSSss..', '...ssss...', '..ss..ss..', '..s....s..', '..........',
  ], { s: col, S: hi }, 10);
  SPR.ui.sunCanvas = sun;
  SPR.ui.sun = toUrl(sun);
  SPR.ui.rain = toUrl(rain);
  SPR.ui.snow = toUrl(snow);
  SPR.ui.coin = toUrl(coin);
  SPR.ui.star1 = toUrl(star('#c9d3dc', '#ffffff'));
  SPR.ui.star2 = toUrl(star('#ffcf2e', '#fff6b0'));
}

function buildAllSprites() {
  buildPoopSprites();
  buildItemSprites();
  buildUiSprites();
  buildTileSprites();
}
