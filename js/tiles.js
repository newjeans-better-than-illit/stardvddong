'use strict';
// ───────────────────────── 지형 · 나무 · 건물 스프라이트 ─────────────────────────

const GRASS_PAL = [
  { base: '#6cbf45', dark: '#4f9c33', light: '#8fd65f', dots: ['#f5a3c7', '#ffffff', '#ffe36a'] },
  { base: '#58ad38', dark: '#3f8a2a', light: '#79c34e', dots: ['#ffe36a', '#ff8a5c'] },
  { base: '#b49d42', dark: '#8f7a2c', light: '#d4bb5c', dots: ['#e0702a', '#c2461f'] },
  { base: '#e8f0f6', dark: '#c4d4e2', light: '#ffffff', dots: ['#d6e4ef'] },
];
const TREE_PAL = [
  { leaf: '#4f9c33', dark: '#3a7a25', light: '#7cc451', accent: '#f5a3c7' },
  { leaf: '#3f8a2a', dark: '#2d6a1e', light: '#5fae3e', accent: null },
  { leaf: '#d0702a', dark: '#a8521c', light: '#eba443', accent: '#f2c43a' },
  { leaf: '#4c6b55', dark: '#38513f', light: '#ffffff', accent: '#ffffff' },
];

function noiseTile(seed, base, dark, light, density) {
  const c = mkCanvas(16, 16);
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  g.fillStyle = base; g.fillRect(0, 0, 16, 16);
  for (let i = 0; i < density; i++) {
    g.fillStyle = r() < 0.6 ? dark : light;
    g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
  }
  return c;
}

function grassTile(season, v) {
  const p = GRASS_PAL[season];
  const c = noiseTile(100 + season * 10 + v, p.base, p.dark, p.light, 14);
  const g = c.getContext('2d');
  const r = mulberry32(900 + season * 10 + v);
  // 풀포기 "v" 모양
  for (let i = 0; i < 3; i++) {
    const x = 1 + Math.floor(r() * 13), y = 2 + Math.floor(r() * 12);
    g.fillStyle = p.dark;
    g.fillRect(x, y, 1, 1); g.fillRect(x + 2, y, 1, 1); g.fillRect(x + 1, y + 1, 1, 1);
  }
  if (v === 3) {
    for (let i = 0; i < 2; i++) {
      g.fillStyle = p.dots[Math.floor(r() * p.dots.length)];
      const x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12);
      g.fillRect(x, y, 1, 1);
      g.fillStyle = p.light; g.fillRect(x, y + 1, 1, 1);
    }
  }
  return c;
}

function soilTile(wet) {
  const base = wet ? '#5c3a1f' : '#8f5d34';
  const dark = wet ? '#472c16' : '#714627';
  const light = wet ? '#71492a' : '#a8713f';
  const c = noiseTile(wet ? 77 : 55, base, dark, light, 18);
  const g = c.getContext('2d');
  g.fillStyle = dark;
  for (const y of [4, 9, 14]) g.fillRect(1, y, 14, 1);
  g.fillStyle = light;
  for (const y of [3, 8, 13]) g.fillRect(2, y, 12, 1);
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
  g.fillStyle = 'rgba(255,255,255,.08)';
  g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
  return c;
}

function pathTile(season, v) {
  const snowy = season === 3;
  const c = noiseTile(300 + v, snowy ? '#e2dccd' : '#d7b57a', snowy ? '#c9c0ad' : '#bf9a5c', snowy ? '#f6f2ea' : '#e6cb94', 16);
  const g = c.getContext('2d');
  const r = mulberry32(400 + v);
  for (let i = 0; i < 2; i++) {
    const x = 1 + Math.floor(r() * 13), y = 1 + Math.floor(r() * 13);
    g.fillStyle = '#9f8256'; g.fillRect(x, y, 2, 1);
    g.fillStyle = '#efdcb1'; g.fillRect(x, y - 1, 1, 1);
  }
  return c;
}

function waterTile(frame, season) {
  const icy = season === 3;
  const c = noiseTile(500 + frame, icy ? '#7fb6dc' : '#3f8fd0', icy ? '#6aa2c9' : '#3580c0', icy ? '#a9d4ef' : '#5aa5de', 10);
  const g = c.getContext('2d');
  g.fillStyle = icy ? '#d5ecfa' : '#9fd2f5';
  const off = frame * 4;
  for (const [x, y] of [[2, 3], [9, 7], [4, 12], [12, 13]]) {
    const xx = (x + off) % 16;
    g.fillRect(xx, y, 3, 1);
  }
  return c;
}

function treeSprite(season, v) {
  const p = TREE_PAL[season];
  const c = mkCanvas(26, 34);
  const g = c.getContext('2d');
  const r = mulberry32(700 + season * 7 + v);
  // 줄기
  g.fillStyle = '#6b4423'; g.fillRect(11, 20, 5, 13);
  g.fillStyle = '#4a2d17'; g.fillRect(14, 20, 2, 13);
  g.fillStyle = '#8a5a30'; g.fillRect(11, 22, 1, 9);
  g.fillStyle = '#4a2d17'; g.fillRect(9, 32, 9, 2);
  // 잎 덩어리
  const blob = (cx, cy, rad, col) => {
    g.fillStyle = col;
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y <= rad * rad + rad * 0.6) g.fillRect(cx + x, cy + y, 1, 1);
    }
  };
  const ox = v % 2 ? 1 : 0;
  blob(13, 13, 11, '#24160c');
  blob(13, 13, 10, p.dark);
  blob(12 + ox, 11, 9, p.leaf);
  blob(9 + ox, 8, 4, p.light);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = r() < 0.5 ? p.dark : p.light;
    const a = r() * Math.PI * 2, d = r() * 8;
    g.fillRect(Math.round(13 + Math.cos(a) * d), Math.round(12 + Math.sin(a) * d), 1, 1);
  }
  if (p.accent) {
    for (let i = 0; i < (season === 3 ? 0 : 7); i++) {
      g.fillStyle = p.accent;
      const a = r() * Math.PI * 2, d = r() * 8;
      g.fillRect(Math.round(13 + Math.cos(a) * d), Math.round(12 + Math.sin(a) * d), 1, 1);
    }
  }
  if (season === 3) {
    // 겨울: 윗부분에 눈이 쌓임
    g.fillStyle = '#ffffff';
    for (let y = 2; y < 9; y++) for (let x = 3; x < 24; x++) {
      const dx = x - 13, dy = y - 13;
      if (dx * dx + dy * dy <= 100 && dy < -4 + Math.sin(x) * 1.5) g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function debrisSprite(type, season) {
  const weedCols = [['#5fae3e', '#3f8a2a'], ['#4f9c33', '#2d6a1e'], ['#b8892e', '#8a6420'], ['#8aa0a8', '#5e7380']][season];
  if (type === 'weed') {
    return simpleIcon([
      '................', '................', '................', '................',
      '................', '.......l........', '...l...ll..l....', '....l..ld.l.....',
      '....ll.ld.l..l..', '.l...lddlll.l...', '..l..ldddll.l...', '..ll.lddddlll...',
      '...lldddddddl...', '....ldddddddl...', '................', '................',
    ], { l: weedCols[0], d: weedCols[1] });
  }
  if (type === 'stone') {
    return simpleIcon([
      '................', '................', '................', '................',
      '................', '......ssss......', '....sSSSssss....', '...sSSsssssss...',
      '...sSssssssdss..', '..ssssssssddds..', '..sssssssdddds..', '..ssssssdddddd..',
      '...dddddddddd...', '................', '................', '................',
    ], { s: '#9b9b94', S: '#d2d2ca', d: '#6f6f69' });
  }
  if (type === 'twig') {
    return simpleIcon([
      '................', '................', '................', '................',
      '................', '................', '...........w....', '..ww......w.....',
      '...wwW...wW.....', '.....wWWwW......', '......wwWW..w...', '....wWw..wWWw...',
      '...wW.......w...', '..w.............', '................', '................',
    ], { w: '#7a4a22', W: '#b07a42' });
  }
  // stump
  return simpleIcon([
    '................', '................', '................', '................',
    '....rrrrrrrr....', '...rRRRRRRRRr...', '...rRrrrrrrRr...', '...rRrRRRRrRr...',
    '...rRRRRRRRRr...', '...bbrrrrrrbb...', '...bBbbbbbbBb...', '...bBbbBbbbBb...',
    '..bbBbbBbbbBbb..', '.bbbbbbbbbbbbbb.', '................', '................',
  ], { r: '#c98a45', R: '#e8b778', b: '#6b4423', B: '#8a5a30' });
}

function houseSprite() {
  const c = mkCanvas(80, 72);
  const g = c.getContext('2d');
  const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // 벽
  rect(4, 34, 72, 38, '#24160c');
  rect(5, 35, 70, 36, '#c58b4f');
  for (let y = 38; y < 71; y += 5) rect(5, y, 70, 1, '#a46e3a');
  // 굴뚝
  rect(54, 2, 11, 18, '#24160c'); rect(55, 3, 9, 17, '#9a4a3a'); rect(55, 3, 9, 2, '#c46a55');
  // 지붕 (계단식 기와)
  for (let i = 0; i < 6; i++) {
    const y = 10 + i * 5, inset = 14 - i * 2.8;
    rect(Math.round(inset) - 1, y - 1, Math.round(80 - inset * 2) + 2, 7, '#24160c');
  }
  for (let i = 0; i < 6; i++) {
    const y = 10 + i * 5, inset = 14 - i * 2.8;
    rect(Math.round(inset), y, Math.round(80 - inset * 2), 5, i % 2 ? '#b8433a' : '#d0574a');
    rect(Math.round(inset), y + 4, Math.round(80 - inset * 2), 1, '#8e2f28');
  }
  rect(0, 39, 80, 3, '#24160c'); rect(1, 39, 78, 2, '#8e2f28');
  // 문
  rect(31, 48, 18, 24, '#24160c'); rect(32, 49, 16, 23, '#7a4a22');
  rect(33, 50, 6, 21, '#8f5a2c'); rect(41, 50, 6, 21, '#8f5a2c');
  rect(44, 60, 2, 2, '#ffd23a');
  // 창문
  for (const wx of [10, 56]) {
    rect(wx - 1, 47, 16, 14, '#24160c'); rect(wx, 48, 14, 12, '#ffe9a8');
    rect(wx + 6, 48, 2, 12, '#7a4a22'); rect(wx, 53, 14, 2, '#7a4a22');
    rect(wx - 2, 61, 18, 2, '#7a4a22');
  }
  // 화분 (당연히 똥)
  rect(12, 63, 10, 5, '#b05a2a'); rect(58, 63, 10, 5, '#b05a2a');
  return c;
}

function shopSprite() {
  const c = mkCanvas(80, 64);
  const g = c.getContext('2d');
  const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // 뒷벽
  rect(2, 14, 76, 34, '#24160c'); rect(3, 15, 74, 33, '#9a6234');
  for (let x = 3; x < 77; x += 6) rect(x, 15, 1, 33, '#7a4a22');
  // 선반 위 똥 진열
  rect(6, 24, 26, 2, '#5a3416'); rect(48, 24, 26, 2, '#5a3416');
  // 차양 (똥색 줄무늬)
  rect(0, 6, 80, 13, '#24160c');
  for (let x = 1, i = 0; x < 79; x += 8, i++) rect(x, 7, 8, 10, i % 2 ? '#f4dfb2' : '#8a5427');
  for (let x = 1, i = 0; x < 79; x += 8, i++) { rect(x, 17, 8, 2, i % 2 ? '#d9bb84' : '#5f3818'); rect(x + 2, 19, 4, 1, i % 2 ? '#d9bb84' : '#5f3818'); }
  // 간판
  rect(20, 0, 40, 9, '#24160c'); rect(21, 1, 38, 7, '#f4dfb2');
  // 계산대
  rect(2, 44, 76, 20, '#24160c'); rect(3, 45, 74, 18, '#c58b4f');
  rect(3, 45, 74, 3, '#e3ad6c');
  for (let x = 8; x < 76; x += 12) rect(x, 49, 1, 14, '#a46e3a');
  return c;
}

function binSprite() {
  const c = mkCanvas(32, 24);
  const g = c.getContext('2d');
  const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  rect(1, 6, 30, 18, '#24160c'); rect(2, 7, 28, 16, '#a8682e');
  for (let y = 11; y < 23; y += 4) rect(2, y, 28, 1, '#7a4a22');
  rect(0, 2, 32, 6, '#24160c'); rect(1, 3, 30, 4, '#d39a55'); rect(1, 6, 30, 1, '#8a5427');
  rect(13, 13, 6, 5, '#24160c'); rect(14, 14, 4, 3, '#ffd23a');
  return c;
}

function sprinklerSprite() {
  return SPR.items.sprinkler;
}

const TILESPR = {};

function buildTileSprites() {
  TILESPR.grass = [0, 1, 2, 3].map((s) => [0, 1, 2, 3].map((v) => grassTile(s, v)));
  TILESPR.path = [0, 1, 2, 3].map((s) => [0, 1, 2].map((v) => pathTile(s, v)));
  TILESPR.water = [0, 1, 2, 3].map((s) => [0, 1, 2, 3].map((f) => waterTile(f, s)));
  TILESPR.soil = [soilTile(false), soilTile(true)];
  TILESPR.tree = [0, 1, 2, 3].map((s) => [0, 1, 2].map((v) => treeSprite(s, v)));
  TILESPR.debris = [0, 1, 2, 3].map((s) => {
    const o = {};
    for (const t of ['weed', 'stone', 'twig', 'stump']) o[t] = debrisSprite(t, s);
    return o;
  });
  TILESPR.house = houseSprite();
  TILESPR.shop = shopSprite();
  TILESPR.bin = binSprite();
  TILESPR.sprinkler = sprinklerSprite();
}
