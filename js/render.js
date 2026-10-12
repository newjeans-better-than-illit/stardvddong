'use strict';
// ───────────────────────── 화면 그리기 ─────────────────────────

const R = {
  canvas: null, ctx: null,
  S: 3, Z: 3, dpr: 1,
  camX: 0, camY: 0,
  viewW: 0, viewH: 0,
  particles: [],
  floats: [],
  weatherFx: [],
  shake: 0,
};

function initRender() {
  R.canvas = document.getElementById('game');
  R.ctx = R.canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = window.innerWidth, h = window.innerHeight;
  R.dpr = dpr;
  R.canvas.width = Math.round(w * dpr);
  R.canvas.height = Math.round(h * dpr);
  // 기기 픽셀 기준 정수 배율 → 픽셀이 또렷하게
  const fit = Math.min(h / (TILE * 12.5), w / (TILE * 10));
  R.S = Math.max(2, Math.floor(fit * dpr));
  R.Z = R.S / dpr;
  R.viewW = R.canvas.width / R.S;
  R.viewH = R.canvas.height / R.S;
}

function updateCamera() {
  const p = G.player;
  const mapW = MAP_W * TILE, mapH = MAP_H * TILE;
  let cx = p.x - R.viewW / 2;
  let cy = p.y - 10 - R.viewH / 2;
  cx = R.viewW >= mapW ? (mapW - R.viewW) / 2 : Math.max(0, Math.min(mapW - R.viewW, cx));
  cy = R.viewH >= mapH ? (mapH - R.viewH) / 2 : Math.max(0, Math.min(mapH - R.viewH, cy));
  if (R.shake > 0) { cx += (Math.random() - 0.5) * R.shake; cy += (Math.random() - 0.5) * R.shake; }
  R.camX = Math.round(cx * R.S) / R.S;
  R.camY = Math.round(cy * R.S) / R.S;
}

function screenToWorld(clientX, clientY) {
  return { x: clientX / R.Z + R.camX, y: clientY / R.Z + R.camY };
}

function worldToScreen(x, y) {
  return { x: (x - R.camX) * R.Z, y: (y - R.camY) * R.Z };
}

// ── 효과 ──
function burst(x, y, color, n = 8, spread = 1) {
  for (let i = 0; i < n; i++) {
    R.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 60 * spread,
      vy: -Math.random() * 70 - 20,
      life: 0.5 + Math.random() * 0.4,
      color: Array.isArray(color) ? color[i % color.length] : color,
      size: Math.random() < 0.5 ? 1 : 2,
    });
  }
}

function floatText(x, y, text, color = '#fff4dc') {
  R.floats.push({ x, y, text, color, life: 1.3 });
}

function updateFx(dt) {
  for (const p of R.particles) { p.life -= dt; p.vy += 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  R.particles = R.particles.filter((p) => p.life > 0);
  for (const f of R.floats) { f.life -= dt; f.y -= 14 * dt; }
  R.floats = R.floats.filter((f) => f.life > 0);
  if (R.shake > 0) R.shake = Math.max(0, R.shake - dt * 20);
}

// ── 사람 그리기 (농부, 상점 주인) ──
const FARMER_LOOK = { hat: '#e8c55a', band: '#c0412f', hair: '#6b3a1c', skin: '#f2c39b', shirt: '#e05a4a', pants: '#3f6fbf', boots: '#5a3416' };
const KEEPER_LOOK = { hat: null, band: null, hair: '#8a8a8a', skin: '#eab48a', shirt: '#f4dfb2', pants: '#8a5427', boots: '#4a2a12', mustache: true };

function drawPerson(g, x, y, dir, walk, look) {
  const ox = Math.round(x) - 6, oy = Math.round(y) - 23;
  const parts = [];
  const P = (px, py, w, h, c) => parts.push([ox + px, oy + py, w, h, c]);
  const step = walk ? (Math.floor(walk) % 2 ? 1 : -1) : 0;
  // 다리
  if (dir === 'left' || dir === 'right') {
    P(3 + step, 18, 3, 4, look.pants); P(6 - step, 18, 3, 4, look.pants);
    P(3 + step, 21, 3, 2, look.boots); P(6 - step, 21, 3, 2, look.boots);
  } else {
    P(2, 18 + (step > 0 ? -1 : 0), 3, 4, look.pants); P(7, 18 + (step < 0 ? -1 : 0), 3, 4, look.pants);
    P(2, 21 + (step > 0 ? -1 : 0), 3, 2, look.boots); P(7, 21 + (step < 0 ? -1 : 0), 3, 2, look.boots);
  }
  // 몸통
  P(1, 11, 10, 8, look.shirt);
  P(2, 14, 8, 5, look.pants);
  if (dir === 'down') { P(3, 13, 1, 2, look.pants); P(8, 13, 1, 2, look.pants); P(5, 15, 2, 1, '#ffd23a'); }
  // 팔
  const swing = walk ? step : 0;
  if (dir === 'down' || dir === 'up') {
    P(0, 11 + swing, 2, 5, look.shirt); P(10, 11 - swing, 2, 5, look.shirt);
    P(0, 16 + swing, 2, 1, look.skin); P(10, 16 - swing, 2, 1, look.skin);
  } else {
    const ax = dir === 'left' ? 4 : 6;
    P(ax, 12, 2, 4 + swing, look.shirt); P(ax, 16 + swing, 2, 1, look.skin);
  }
  // 머리
  P(1, 3, 10, 8, look.skin);
  if (dir === 'up') P(1, 3, 10, 8, look.hair);
  else if (dir === 'down') { P(1, 3, 10, 2, look.hair); P(1, 3, 1, 5, look.hair); P(10, 3, 1, 5, look.hair); }
  else if (dir === 'left') { P(1, 3, 10, 2, look.hair); P(6, 3, 5, 6, look.hair); }
  else { P(1, 3, 10, 2, look.hair); P(1, 3, 5, 6, look.hair); }
  // 얼굴
  if (dir === 'down') {
    P(3, 6, 1, 2, '#24160c'); P(8, 6, 1, 2, '#24160c');
    P(2, 8, 1, 1, '#f08a7a'); P(9, 8, 1, 1, '#f08a7a');
    if (look.mustache) P(3, 8, 6, 1, '#6e6e6e');
  } else if (dir === 'left') {
    P(2, 6, 1, 2, '#24160c'); if (look.mustache) P(1, 8, 3, 1, '#6e6e6e');
  } else if (dir === 'right') {
    P(9, 6, 1, 2, '#24160c'); if (look.mustache) P(8, 8, 3, 1, '#6e6e6e');
  }
  // 밀짚모자
  if (look.hat) {
    P(-1, 3, 14, 2, look.hat);
    P(2, 0, 8, 3, look.hat);
    P(2, 2, 8, 1, look.band);
  }
  // 외곽선 → 채우기
  g.fillStyle = '#24160c';
  for (const [px, py, w, h] of parts) g.fillRect(px - 1, py - 1, w + 2, h + 2);
  for (const [px, py, w, h, c] of parts) { g.fillStyle = c; g.fillRect(px, py, w, h); }
}

// ── 메인 렌더 ──
function hash2(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }

function drawWorld(t, target) {
  const g = R.ctx;
  const season = G.season;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#1d130b';
  g.fillRect(0, 0, R.canvas.width, R.canvas.height);
  g.setTransform(R.S, 0, 0, R.S, -R.camX * R.S, -R.camY * R.S);

  const x0 = Math.max(0, Math.floor(R.camX / TILE) - 1);
  const y0 = Math.max(0, Math.floor(R.camY / TILE) - 1);
  const x1 = Math.min(MAP_W - 1, Math.ceil((R.camX + R.viewW) / TILE) + 1);
  const y1 = Math.min(MAP_H - 1, Math.ceil((R.camY + R.viewH) / TILE) + 2);
  const wf = Math.floor(t * 2) % 4;

  // 바닥
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = key(x, y), gr = W.ground[k], v = W.variant[k];
    const px = x * TILE, py = y * TILE;
    if (gr === GROUND.PATH) g.drawImage(TILESPR.path[season][v % 3], px, py);
    else if (gr === GROUND.WATER) {
      g.drawImage(TILESPR.water[season][(wf + v) % 4], px, py);
      g.fillStyle = season === 3 ? '#eaf6ff' : '#bfe3f7';
      if (y > 0 && W.ground[key(x, y - 1)] !== GROUND.WATER) g.fillRect(px, py, TILE, 2);
      if (y < MAP_H - 1 && W.ground[key(x, y + 1)] !== GROUND.WATER) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(px, py + TILE - 1, TILE, 1); g.fillStyle = season === 3 ? '#eaf6ff' : '#bfe3f7'; }
      if (x > 0 && W.ground[key(x - 1, y)] !== GROUND.WATER) g.fillRect(px, py, 1, TILE);
      if (x < MAP_W - 1 && W.ground[key(x + 1, y)] !== GROUND.WATER) g.fillRect(px + TILE - 1, py, 1, TILE);
    } else {
      const gv = v < 2 ? 3 : v % 3;
      g.drawImage(TILESPR.grass[season][gv], px, py);
    }
    const soil = G.soil.get(k);
    if (soil) g.drawImage(TILESPR.soil[soil.wet ? 1 : 0], px, py);
  }

  // 정렬해서 그릴 것들
  const list = [];
  for (const tr of W.trees) {
    if (tr.x < x0 - 1 || tr.x > x1 + 1 || tr.y < y0 || tr.y > y1 + 2) continue;
    list.push({ y: (tr.y + 1) * TILE, draw: () => g.drawImage(TILESPR.tree[season][tr.v], tr.x * TILE + 8 - 13, (tr.y + 1) * TILE - 34) });
  }
  for (const b of W.buildings) list.push({ y: (b.y + b.h) * TILE, draw: () => drawBuilding(g, b, t) });
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = key(x, y);
    const o = G.obj.get(k);
    if (o) {
      const spr = o.type === 'sprinkler' ? TILESPR.sprinkler : TILESPR.debris[season][o.type];
      list.push({ y: (y + 1) * TILE - 0.5, draw: () => g.drawImage(spr, x * TILE, y * TILE) });
    }
    const soil = G.soil.get(k);
    if (soil && soil.crop) list.push({ y: (y + 1) * TILE - 0.6, draw: () => drawCrop(g, x, y, soil.crop, t) });
  }
  const p = G.player;
  list.push({ y: p.y, draw: () => drawPlayer(g, t) });
  list.sort((a, b) => a.y - b.y);

  // 목표 칸 표시 (캐릭터 뒤)
  if (target) {
    g.strokeStyle = target.ok ? 'rgba(255,255,255,.85)' : 'rgba(255,120,100,.7)';
    g.lineWidth = 1;
    g.strokeRect(target.x * TILE + 0.5, target.y * TILE + 0.5, TILE - 1, TILE - 1);
  }
  for (const it of list) it.draw();

  // 입자
  for (const pt of R.particles) {
    g.globalAlpha = Math.min(1, pt.life * 2);
    g.fillStyle = pt.color;
    g.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
  }
  g.globalAlpha = 1;

  drawAtmosphere(g, t);
  drawFloats(g);
}

function drawBuilding(g, b, t) {
  const px = b.x * TILE, bottom = (b.y + b.h) * TILE;
  if (b.kind === 'house') {
    g.drawImage(TILESPR.house, px, bottom - 72);
    // 화분 속 작은 똥
    g.drawImage(SPR.crops.parsnip[4], px + 12, bottom - 18, 10, 10);
    g.drawImage(SPR.crops.strawberry[4], px + 58, bottom - 18, 10, 10);
  } else if (b.kind === 'bin') {
    const open = G._binOpen > 0;
    g.drawImage(TILESPR.bin, 0, 6, 32, 18, px, bottom - 18, 32, 18);
    if (!open) g.drawImage(TILESPR.bin, 0, 0, 32, 8, px, bottom - 24, 32, 8);
    else g.drawImage(TILESPR.bin, 0, 0, 32, 8, px, bottom - 29, 32, 6);
  } else if (b.kind === 'shop') {
    const top = bottom - 64;
    g.drawImage(TILESPR.shop, 0, 0, 80, 44, px, top, 80, 44);
    // 선반 위 똥 진열
    const shelf = ['parsnip', 'strawberry', 'melon', 'pumpkin', 'blueberry', 'corn', 'eggplant', 'gold'];
    shelf.forEach((id, i) => {
      const sx = px + (i < 4 ? 6 + i * 7 : 48 + (i - 4) * 7);
      g.drawImage(SPR.crops[id][4], sx, top + 16, 8, 8);
    });
    // 주인 뿌직이 아저씨 (계산대 뒤라 윗몸만)
    g.save();
    g.beginPath(); g.rect(px, top, 80, 46); g.clip();
    const bob = Math.sin(t * 2) > 0.92 ? 1 : 0;
    drawPerson(g, px + 40, top + 62 + bob, 'down', 0, KEEPER_LOOK);
    g.restore();
    g.drawImage(TILESPR.shop, 0, 44, 80, 20, px, top + 44, 80, 20);
    // 계산대 위 씨앗 봉지
    g.drawImage(SPR.items.seed_parsnip, px + 10, top + 38, 10, 10);
    g.drawImage(SPR.items.seed_melon, px + 60, top + 38, 10, 10);
    // 간판
    g.fillStyle = '#4a2a12';
    g.font = '6px Jua, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('뿌지직 상회', px + 40, top + 4.8);
  }
}

function drawCrop(g, x, y, crop, t) {
  const px = x * TILE, py = y * TILE;
  if (crop.dead) { g.drawImage(SPR.dead, px, py); return; }
  const stage = cropStage(crop);
  const spr = SPR.crops[crop.id][stage];
  if (stage < 4) { g.drawImage(spr, px, py); return; }
  const h = hash2(x, y);
  const phase = t * 3 + (h % 100) / 16;
  const squish = Math.sin(phase) > 0.3;
  if (squish) g.drawImage(spr, px - 0.5, py + 1, 17, 15);
  else g.drawImage(spr, px, py);
  // 냄새 줄기
  for (let s = 0; s < 2; s++) {
    const off = ((t * 6 + (h % 7) + s * 4) % 8);
    for (let i = 0; i < 4; i++) {
      const yy = py - 1 - off - i * 1.6;
      const xx = px + 4 + s * 7 + Math.sin(yy * 0.9 + s) * 1.3;
      g.globalAlpha = Math.max(0, 0.55 - (off + i * 1.6) / 14);
      g.fillStyle = '#a5d64a';
      g.fillRect(Math.round(xx), Math.round(yy), 1, 1);
    }
  }
  g.globalAlpha = 1;
  // 파리 두 마리
  for (let f = 0; f < 2; f++) {
    const a = t * (3.2 + f) + (h % 50) + f * 3;
    const fx = px + 8 + Math.cos(a) * 7;
    const fy = py + 1 + Math.sin(a * 1.7) * 3;
    g.fillStyle = '#1a1a1a';
    g.fillRect(Math.round(fx), Math.round(fy), 1, 1);
    if (Math.floor(t * 20 + f) % 2) { g.fillStyle = 'rgba(220,235,255,.8)'; g.fillRect(Math.round(fx), Math.round(fy) - 1, 1, 1); }
  }
  // 반짝이 (황금똥, 무지개똥)
  const def = CROPS[crop.id];
  if ((def.shiny || def.rainbow) && Math.floor(t * 3 + h) % 4 === 0) {
    const sx = px + 2 + (h % 12), sy = py + 2 + ((h >> 4) % 10);
    g.fillStyle = '#ffffff';
    g.fillRect(sx, sy - 1, 1, 3); g.fillRect(sx - 1, sy, 3, 1);
  }
}

function drawPlayer(g, t) {
  const p = G.player;
  const walk = p.moving ? p.walkT * 8 : 0;
  if (p.swing > 0 && (p.dir === 'up')) drawSwing(g, p);
  drawPerson(g, p.x, p.y, p.dir, walk, FARMER_LOOK);
  if (p.swing > 0 && p.dir !== 'up') drawSwing(g, p);
  // 들고 있는 작물
  const it = G.inv[G.sel];
  if (it && ITEMS[it.id].kind === 'crop' && p.swing <= 0) {
    g.drawImage(SPR.items[it.id], Math.round(p.x) - 6, Math.round(p.y) - 36, 12, 12);
  }
}

function drawSwing(g, p) {
  const spr = SPR.tools[p.swingTool] || SPR.items[p.swingTool];
  if (!spr) return;
  const k = 1 - p.swing / p.swingMax;
  const dirs = { down: [0, -4, Math.PI * 0.5], up: [0, -16, -Math.PI * 0.5], left: [-8, -10, Math.PI], right: [8, -10, 0] };
  const [dx, dy, base] = dirs[p.dir];
  const ang = base - 0.9 + k * 1.6;
  g.save();
  g.translate(Math.round(p.x + dx), Math.round(p.y + dy));
  g.rotate(ang + Math.PI / 4);
  if (p.dir === 'left') g.scale(1, -1);
  g.drawImage(spr, -3, -13);
  g.restore();
}

// ── 밤, 비, 눈 ──
function darkness() {
  const tm = G.time;
  if (tm < 18 * 60) return 0;
  if (tm < 20 * 60) return ((tm - 18 * 60) / 120) * 0.35;
  if (tm < 24 * 60) return 0.35 + ((tm - 20 * 60) / 240) * 0.25;
  return 0.6;
}

function drawAtmosphere(g, t) {
  const W_ = R.canvas.width, H_ = R.canvas.height;
  const dark = darkness();
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (G.weather === 'rain') { g.fillStyle = 'rgba(40,60,90,.22)'; g.fillRect(0, 0, W_, H_); }
  if (dark > 0) {
    g.fillStyle = `rgba(16,20,58,${dark})`;
    g.fillRect(0, 0, W_, H_);
    // 집 창문 불빛
    g.globalCompositeOperation = 'lighter';
    const house = W.buildings[0];
    for (const wx of [17, 63]) {
      const s = worldToScreen(house.x * TILE + wx, (house.y + house.h) * TILE - 72 + 54);
      const rad = 26 * R.Z * R.dpr;
      const grd = g.createRadialGradient(s.x * R.dpr, s.y * R.dpr, 0, s.x * R.dpr, s.y * R.dpr, rad);
      grd.addColorStop(0, `rgba(255,200,90,${dark * 0.8})`);
      grd.addColorStop(1, 'rgba(255,200,90,0)');
      g.fillStyle = grd;
      g.fillRect(s.x * R.dpr - rad, s.y * R.dpr - rad, rad * 2, rad * 2);
    }
    g.globalCompositeOperation = 'source-over';
  }
  const fx = R.weatherFx;
  if (G.weather === 'rain' || G.weather === 'snow') {
    const target = Math.round((W_ * H_) / (G.weather === 'rain' ? 9000 : 14000) / R.dpr);
    while (fx.length < target) fx.push({ x: Math.random() * W_, y: Math.random() * H_, s: 0.6 + Math.random() * 0.6 });
    if (fx.length > target) fx.length = target;
    if (G.weather === 'rain') {
      g.strokeStyle = 'rgba(190,215,255,.55)';
      g.lineWidth = R.dpr;
      g.beginPath();
      for (const d of fx) { g.moveTo(d.x, d.y); g.lineTo(d.x - 3 * R.dpr, d.y + 12 * R.dpr * d.s); }
      g.stroke();
    } else {
      g.fillStyle = 'rgba(255,255,255,.9)';
      for (const d of fx) { const sz = Math.max(1, Math.round(R.S * 0.6 * d.s)); g.fillRect(d.x, d.y, sz, sz); }
    }
  } else if (fx.length) fx.length = 0;
}

function updateWeatherFx(dt) {
  const W_ = R.canvas.width, H_ = R.canvas.height;
  for (const d of R.weatherFx) {
    if (G.weather === 'rain') { d.y += 700 * d.s * dt * R.dpr; d.x -= 170 * dt * R.dpr; }
    else { d.y += 40 * d.s * dt * R.dpr; d.x += Math.sin(d.y * 0.02 + d.s * 9) * 20 * dt * R.dpr; }
    if (d.y > H_) { d.y = -10; d.x = Math.random() * (W_ + 200); }
    if (d.x < -20) d.x = W_ + 10;
  }
}

function drawFloats(g) {
  g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${Math.round(14 + R.Z * 1.5)}px Jua, sans-serif`;
  for (const f of R.floats) {
    const s = worldToScreen(f.x, f.y);
    g.globalAlpha = Math.min(1, f.life * 1.6);
    g.lineWidth = 4; g.strokeStyle = '#24160c';
    g.strokeText(f.text, s.x, s.y);
    g.fillStyle = f.color;
    g.fillText(f.text, s.x, s.y);
  }
  g.globalAlpha = 1;
}
