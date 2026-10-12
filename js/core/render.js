'use strict';
// ════════════════════════════════════════════════════════════════════
//  렌더러: 정수 배율 픽셀 렌더링, 카메라, 레이어
//   바닥(청크 굽기) → 바닥 데칼(괭이흙) → 그림자 → y정렬 스프라이트 → 앞 레이어
//   → 날씨 → 조명(시간대 색조 곱하기 + 광원) → 빛 입자 → 월드 글자 → (UI)
//  훅: 'draw:ground', 'draw:decals', 'draw:sprites'(V.add 로 넣기), 'draw:front',
//      'draw:weather', 'lights'(loc, add), 'draw:afterLight', 'draw:world'(최상단 월드)
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;
  const X = SD.gfx;
  const TILE = SD.TILE;
  const CHUNK = 16;

  const R = (SD.Render = {
    CHUNK,
    canvas: null, ctx: null,
    S: 4, dpr: 1, zoom: 4,
    W: 0, H: 0, viewW: 0, viewH: 0,
    camX: 0, camY: 0,
    light: null, lightCtx: null,
    drops: [], splashes: [], flakes: [], wind: [],
    nextBolt: 8,
    stats: { sprites: 0 },
  });

  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d', { alpha: false });
    R.light = X.canvas(4, 4);
    R.lightCtx = R.light.getContext('2d');
    R.resize();
    window.addEventListener('resize', () => R.resize());
  };
  R.autoZoom = function () {
    const h = window.innerHeight, w = window.innerWidth;
    if (h < 420 || w < 520) return 2;
    if (h < 640 || w < 900) return 3;
    return 4;
  };
  R.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    R.dpr = dpr;
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    R.canvas.width = Math.round(w * dpr);
    R.canvas.height = Math.round(h * dpr);
    R.canvas.style.width = w + 'px';
    R.canvas.style.height = h + 'px';
    const setting = SD.Settings && SD.Settings.get('zoom');
    R.zoom = setting && setting !== 'auto' ? U.clamp(+setting, 2, 5) : R.autoZoom();
    R.S = Math.max(1, Math.round(R.zoom * dpr));
    R.W = R.canvas.width; R.H = R.canvas.height;
    R.viewW = R.W / R.S; R.viewH = R.H / R.S;
    // 조명 버퍼: 월드 1픽셀 = 1칸 (픽셀아트처럼 계단진 빛, 합성이 빠르다)
    const lw = Math.ceil(R.viewW) + 2, lh = Math.ceil(R.viewH) + 2;
    if (R.light.width !== lw || R.light.height !== lh) { R.light.width = lw; R.light.height = lh; }
    SD.Mods.emit('resize', R);
  };

  // ───────────── 카메라 ─────────────
  R.cameraTarget = function () {
    const loc = SD.World.current;
    const p = SD.G.player;
    const mapW = loc.w * TILE, mapH = loc.h * TILE;
    let cx = p.x - R.viewW / 2, cy = p.y - 16 - R.viewH / 2;
    const ov = SD.Mods.reduce('cameraTarget', null, cx, cy, loc);
    if (ov) { cx = ov[0]; cy = ov[1]; }
    cx = R.viewW >= mapW ? (mapW - R.viewW) / 2 : U.clamp(cx, 0, mapW - R.viewW);
    cy = R.viewH >= mapH ? (mapH - R.viewH) / 2 : U.clamp(cy, 0, mapH - R.viewH);
    return [cx, cy];
  };
  R.snapCamera = function () {
    if (!SD.World.current || !SD.G) return;
    const [cx, cy] = R.cameraTarget();
    R._cx = cx; R._cy = cy;
  };
  R.updateCamera = function () {
    const [tx, ty] = R.cameraTarget();
    R._cx = tx; R._cy = ty;
    const [sx, sy] = SD.FX.shakeOffset();
    R.camX = Math.round((R._cx + sx) * R.S) / R.S;
    R.camY = Math.round((R._cy + sy) * R.S) / R.S;
  };
  R.screenToWorld = (cssX, cssY) => ({ x: (cssX * R.dpr) / R.S + R.camX, y: (cssY * R.dpr) / R.S + R.camY });
  R.worldToScreen = (wx, wy) => ({ x: ((wx - R.camX) * R.S) / R.dpr, y: ((wy - R.camY) * R.S) / R.dpr });

  // ───────────── 시간대 색조 ─────────────
  // 늦은 오후 황금빛 → 노을 → 보랏빛 → 푸른 밤 (원작 느낌)
  R.darkStart = function () {
    const G = SD.G;
    const base = [1140, 1170, 1110, 1050][G.season];
    return SD.Weather && SD.Weather.isRaining() ? base - 60 : base;
  };
  function lerpCol(a, b, t) { return [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t)]; }
  function curve(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) return lerpCol(keys[i - 1][1], keys[i][1], U.smooth(U.inv(keys[i - 1][0], keys[i][0], t)));
    }
    return keys[keys.length - 1][1];
  }
  R.timeF = function () {
    const G = SD.G;
    return G.time + (SD.Time ? SD.Time.fraction() * 10 : 0);
  };
  R.ambient = function (loc) {
    const t = R.timeF();
    const ds = R.darkStart();
    const custom = SD.Mods.reduce('ambient', null, loc, t);
    if (custom) return custom;
    if (loc.def.ambient) { const c = loc.def.ambient(loc, t, ds); if (c) return c; }
    if (!loc.outdoor) {
      return curve([[360, [214, 204, 226]], [450, [255, 248, 238]], [ds - 60, [255, 246, 232]], [ds + 60, [168, 150, 170]], [ds + 150, [112, 100, 132]], [1560, [96, 88, 120]]], t);
    }
    let c = curve([
      [360, [228, 222, 255]], [430, [255, 255, 255]], [ds - 200, [255, 255, 255]],
      [ds - 110, [255, 240, 212]], [ds - 40, [255, 214, 168]], [ds, [244, 178, 148]],
      [ds + 50, [168, 128, 168]], [ds + 120, [78, 84, 140]], [1440, [62, 68, 124]], [1560, [52, 58, 112]],
    ], t);
    const w = SD.G.weather;
    if (w === 'rain' || w === 'storm') c = [c[0] * 0.74, c[1] * 0.78, c[2] * 0.88];
    else if (w === 'snow') c = [c[0] * 0.9, c[1] * 0.92, c[2] * 0.98];
    return c;
  };
  // 0(낮) ~ 1(한밤)
  R.nightAmount = function () {
    const t = R.timeF(), ds = R.darkStart();
    if (t < 400) return U.clamp(1 - (t - 360) / 40, 0, 1) * 0.5;
    return U.clamp((t - (ds - 30)) / 150, 0, 1);
  };
  R.windowGlow = function () { return U.clamp((R.nightAmount() - 0.15) / 0.35, 0, 1); };
  R.skyColor = function () {
    const t = R.timeF(), ds = R.darkStart();
    const w = SD.G.weather;
    let c = curve([[360, [180, 170, 220]], [450, [140, 200, 245]], [ds - 60, [150, 205, 245]], [ds, [245, 160, 110]], [ds + 70, [110, 80, 140]], [ds + 140, [30, 36, 80]], [1560, [20, 24, 60]]], t);
    if (w === 'rain' || w === 'storm') c = [c[0] * 0.7 + 30, c[1] * 0.7 + 30, c[2] * 0.75 + 30];
    return X.hex(c[0], c[1], c[2]);
  };

  // ───────────── 바닥 청크 굽기 ─────────────
  function bakeChunk(loc, cx, cy, season) {
    const c = X.canvas(CHUNK * TILE, CHUNK * TILE);
    const g = X.ctx(c);
    const T = { loc, x: 0, y: 0, season, at(dx, dy) { return loc.tileAt(this.x + dx, this.y + dy); } };
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = cx * CHUNK + tx, y = cy * CHUNK + ty;
        if (!loc.inBounds(x, y)) continue;
        T.x = x; T.y = y;
        const def = SD.Tiles.get(loc.tileAt(x, y)) || SD.Tiles.get('void');
        try { def.bake(g, tx * TILE, ty * TILE, T); SD.Tiles.postBake(g, tx * TILE, ty * TILE, T); } catch (e) { console.error('[SD] 타일 굽기 실패', def.id, e); }
      }
    }
    if (loc.def.bakeChunk) SD.Mods.safe('bakeChunk', loc.def.bakeChunk, g, loc, cx, cy, season);
    return c;
  }
  R.chunk = function (loc, cx, cy, season) {
    if (loc._chunkSeason !== season) { loc._chunks.clear(); loc._chunkSeason = season; }
    const k = cx + ',' + cy;
    let c = loc._chunks.get(k);
    if (!c) { c = bakeChunk(loc, cx, cy, season); loc._chunks.set(k, c); }
    return c;
  };

  // ───────────── 날씨 입자 ─────────────
  const RAIN_SPR = (() => {
    const c = X.canvas(4, 9);
    const g = c.getContext('2d');
    const cols = ['rgba(200,225,255,0.35)', 'rgba(210,232,255,0.6)', 'rgba(230,242,255,0.8)'];
    for (let i = 0; i < 9; i++) { g.fillStyle = cols[Math.min(2, Math.floor(i / 3))]; g.fillRect(3 - Math.floor(i / 3), i, 1, 1); }
    return c;
  })();
  function weatherKind() {
    const loc = SD.World.current;
    if (!loc || !loc.outdoor || loc.def.noWeather) return null;
    return SD.G.weather;
  }
  R.isWindy = function () {
    const w = weatherKind();
    return w === 'wind' || w === 'storm';
  };
  R.updateWeather = function (dt) {
    const w = weatherKind();
    const vw = R.viewW, vh = R.viewH;
    const raining = w === 'rain' || w === 'storm';
    const wantDrops = raining ? Math.round((vw * vh) / (w === 'storm' ? 160 : 260)) : 0;
    while (R.drops.length < wantDrops) R.drops.push({ x: Math.random() * (vw + 60), y: Math.random() * vh, s: 0.75 + Math.random() * 0.5 });
    if (R.drops.length > wantDrops) R.drops.length = wantDrops;
    const fall = w === 'storm' ? 330 : 250;
    for (const d of R.drops) {
      d.y += fall * d.s * dt; d.x -= fall * 0.35 * d.s * dt;
      if (d.y > vh) { d.y -= vh + 10; d.x = Math.random() * (vw + 60); }
      if (d.x < -10) d.x += vw + 60;
    }
    // 땅에 튀는 물방울
    if (raining) {
      const rate = (vw * vh) / (w === 'storm' ? 900 : 1500);
      let n = rate * dt;
      while (n > 0) { if (Math.random() < n) R.splashes.push({ x: R.camX + Math.random() * vw, y: R.camY + Math.random() * vh, t: 0 }); n -= 1; }
    }
    for (let i = R.splashes.length - 1; i >= 0; i--) { R.splashes[i].t += dt; if (R.splashes[i].t > 0.24) R.splashes.splice(i, 1); }
    // 번개
    if (w === 'storm') {
      R.nextBolt -= dt;
      if (R.nextBolt <= 0) {
        R.nextBolt = 6 + Math.random() * 12;
        if (!SD.Mods.first('lightning', SD.World.current)) {
          SD.FX.flash('#ffffff', 0.35, 0.75);
          setTimeout(() => SD.Sound.play('thunder'), 300 + Math.random() * 1200);
        }
      }
    }
    // 눈
    const wantFlakes = w === 'snow' ? Math.round((vw * vh) / 420) : 0;
    while (R.flakes.length < wantFlakes) R.flakes.push({ x: Math.random() * vw, y: Math.random() * vh, s: 0.5 + Math.random(), ph: Math.random() * 6 });
    if (R.flakes.length > wantFlakes) R.flakes.length = wantFlakes;
    for (const f of R.flakes) {
      f.y += (12 + f.s * 14) * dt; f.x += Math.sin(SD.Time.anim * 1.3 + f.ph) * 8 * dt - 4 * dt;
      if (f.y > vh) { f.y = -3; f.x = Math.random() * vw; }
      if (f.x < -3) f.x = vw; if (f.x > vw + 3) f.x = 0;
    }
    // 바람에 날리는 꽃잎·낙엽
    const season = SD.G.season;
    const wantWind = (w === 'wind' ? Math.round(vw * vh / 2400) : w === 'storm' ? Math.round(vw * vh / 9000) : 0) * (season === 3 ? 0 : 1);
    while (R.wind.length < wantWind) R.wind.push({ x: Math.random() * vw, y: Math.random() * vh, ph: Math.random() * 6, s: 0.6 + Math.random() * 0.8, c: Math.floor(Math.random() * 3) });
    if (R.wind.length > wantWind) R.wind.length = wantWind;
    for (const p of R.wind) {
      p.x += (55 * p.s) * dt; p.y += (Math.sin(SD.Time.anim * 2 + p.ph) * 18 + 6) * dt;
      p.ph += dt * 0.2;
      if (p.x > vw + 4) { p.x = -4; p.y = Math.random() * vh; }
      if (p.y > vh + 4) p.y = -4;
    }
  };
  const WIND_COL = [['#ffd8ea', '#ffffff', '#f7a8cc'], ['#8fd65f', '#5fae3e', '#c8e878'], ['#e8702a', '#c8461f', '#f2b43a'], ['#ffffff']];
  function drawWeather(g) {
    const w = weatherKind();
    if (!w) return;
    // 카메라 기준 좌표 (월드 픽셀)
    if (w === 'rain' || w === 'storm') {
      const loc = SD.World.current;
      for (const s of R.splashes) {
        const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
        const water = loc.isWater(tx, ty);
        const f = Math.floor(s.t / 0.08);
        g.fillStyle = 'rgba(220,238,255,0.75)';
        const x = Math.round(s.x), y = Math.round(s.y);
        if (water) { g.globalAlpha = 0.6 - s.t * 2; g.fillRect(x - 1 - f, y, 2 + f * 2, 1); g.globalAlpha = 1; }
        else if (f === 0) g.fillRect(x, y, 1, 1);
        else if (f === 1) { g.fillRect(x - 1, y - 1, 1, 1); g.fillRect(x + 1, y - 1, 1, 1); }
        else { g.fillRect(x - 2, y - 1, 1, 1); g.fillRect(x + 2, y - 1, 1, 1); g.fillRect(x, y - 2, 1, 1); }
      }
      for (const d of R.drops) g.drawImage(RAIN_SPR, Math.round(R.camX + d.x), Math.round(R.camY + d.y));
    }
    if (w === 'snow') {
      for (const f of R.flakes) {
        g.fillStyle = f.s > 1.1 ? '#ffffff' : 'rgba(255,255,255,0.8)';
        const sz = f.s > 1.2 ? 2 : 1;
        g.fillRect(Math.round(R.camX + f.x), Math.round(R.camY + f.y), sz, sz);
      }
    }
    if (R.wind.length) {
      const cols = WIND_COL[SD.G.season];
      for (const p of R.wind) {
        g.fillStyle = cols[p.c % cols.length];
        const x = Math.round(R.camX + p.x), y = Math.round(R.camY + p.y);
        const fl = Math.sin(SD.Time.anim * 6 + p.ph) > 0;
        g.fillRect(x, y, fl ? 2 : 1, 1);
        if (SD.G.season === 2) g.fillRect(x + (fl ? 1 : 0), y + 1, 1, 1);
      }
    }
  }

  // ───────────── 메인 그리기 ─────────────
  const list = [];
  const shadows = [];
  const V = {
    ctx: null, t: 0, loc: null, season: 0, player: null, windy: false,
    x0: 0, y0: 0, x1: 0, y1: 0,
    add(sortY, fn) { list.push({ y: sortY, fn, i: list.length }); },
    shadow(cx, cy, w, h, a) { shadows.push([cx, cy, w, h, a]); },
  };
  R.V = V;

  function drawLocation(g, loc) {
    const season = SD.Mods.reduce('locationSeason', SD.G.season, loc);
    V.ctx = g; V.t = SD.Time.anim; V.loc = loc; V.season = season; V.player = SD.G.player; V.windy = R.isWindy();
    const x0 = Math.max(0, Math.floor(R.camX / TILE) - 1), y0 = Math.max(0, Math.floor(R.camY / TILE) - 1);
    const x1 = Math.min(loc.w - 1, Math.ceil((R.camX + R.viewW) / TILE) + 1), y1 = Math.min(loc.h - 1, Math.ceil((R.camY + R.viewH) / TILE) + 1);
    V.x0 = x0; V.y0 = y0; V.x1 = x1; V.y1 = y1;
    // 1) 바닥
    const cx0 = Math.floor(x0 / CHUNK), cy0 = Math.floor(y0 / CHUNK), cx1 = Math.floor(x1 / CHUNK), cy1 = Math.floor(y1 / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) g.drawImage(R.chunk(loc, cx, cy, season), cx * CHUNK * TILE, cy * CHUNK * TILE);
    // 움직이는 타일 (물)
    const T = { loc, x: 0, y: 0, season, at(dx, dy) { return loc.tileAt(this.x + dx, this.y + dy); } };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const def = SD.Tiles.get(loc.tileAt(x, y));
      if (def && def.anim) { T.x = x; T.y = y; def.anim(g, x * TILE, y * TILE, T, V.t); }
    }
    if (loc.def.drawGround) SD.Mods.safe('drawGround', loc.def.drawGround, V, loc);
    SD.Mods.emit('draw:ground', V, loc);
    // 2) 바닥 데칼 (괭이흙·러그·현관)
    const ty1 = Math.min(loc.h - 1, y1 + 6);
    for (let y = y0; y <= ty1; y++) for (let x = x0; x <= x1; x++) {
      const k = U.tk(x, y);
      const f = loc.features.get(k);
      if (f) { const d = SD.ObjTypes.get(f.t); if (d && d.drawDecal && y <= y1) d.drawDecal(V, f, loc); }
      const o = loc.objects.get(k);
      if (o) { const d = SD.ObjTypes.get(o.t); if (d && d.drawDecal && y <= y1) d.drawDecal(V, o, loc); }
    }
    for (const o of loc.large) { const d = SD.ObjTypes.get(o.t); if (d && d.drawDecal && inView(o, x0, y0, x1, y1)) d.drawDecal(V, o, loc); }
    SD.Mods.emit('draw:decals', V, loc);
    // 대상 칸 표시 (도구 범위)
    if (SD.Player && SD.Player.drawTarget) SD.Player.drawTarget(V, loc);
    // 3) 스프라이트 모으기
    list.length = 0; shadows.length = 0;
    const pushShadow = (d, o) => { if (d.shadow) { const s = d.shadow(o); if (s) shadows.push(s); } };
    for (let y = y0; y <= ty1; y++) for (let x = x0; x <= x1; x++) {
      const k = U.tk(x, y);
      const f = loc.features.get(k);
      if (f) { const d = SD.ObjTypes.get(f.t); if (d) { if (d.draw) d.draw(V, f, loc); pushShadow(d, f); } }
      const o = loc.objects.get(k);
      if (o) { const d = SD.ObjTypes.get(o.t); if (d) { if (d.draw) d.draw(V, o, loc); pushShadow(d, o); } }
    }
    for (const o of loc.large) {
      if (!inView(o, x0, y0 - 1, x1, ty1)) continue;
      const d = SD.ObjTypes.get(o.t);
      if (!d) continue;
      if (d.draw) d.draw(V, o, loc);
      pushShadow(d, o);
    }
    for (const o of loc.decor) {
      if (o.x < x0 - 2 || o.x > x1 + 2 || o.y < y0 - 1 || o.y > ty1) continue;
      const d = SD.ObjTypes.get(o.t);
      if (d) { if (d.draw) d.draw(V, o, loc); pushShadow(d, o); }
    }
    for (const c of loc.chars) {
      const d = SD.Chars.get(c.t);
      if (!d || !d.draw) continue;
      d.draw(V, c, loc);
      if (d.shadow !== false) shadows.push(d.shadow ? d.shadow(c) : [c.x, c.y - 1, 12, 4]);
    }
    for (const e of loc.temp) { const d = SD.Temp.get(e.kind); if (d && d.draw) d.draw(V, e, loc); }
    SD.Drops.draw(V, loc);
    if (SD.G.player.loc === loc.id && !SD.G.player.hidden) {
      const p = SD.G.player;
      shadows.push([p.x, p.y - 1, 12, 4]);
      V.add(p.y, (gg) => SD.Player.draw(gg, p));
    }
    SD.Mods.emit('draw:sprites', V, loc);
    // 4) 그림자 → 정렬된 스프라이트
    for (const s of shadows) X.shadow(g, s[0], s[1], s[2], s[3], s[4]);
    list.sort((a, b) => a.y - b.y || a.i - b.i);
    R.stats.sprites = list.length;
    for (const e of list) {
      try { e.fn(g); } catch (err) { console.error('[SD] 스프라이트 그리기 실패', err); }
    }
    // 5) 앞 레이어
    for (const o of loc.large) { const d = SD.ObjTypes.get(o.t); if (d && d.drawFront && inView(o, x0, y0, x1, ty1)) d.drawFront(V, o, loc); }
    if (loc.def.drawFront) SD.Mods.safe('drawFront', loc.def.drawFront, V, loc);
    SD.Mods.emit('draw:front', V, loc);
    // 입자 (조명 영향)
    SD.FX.draw(g, 'world', V);
  }
  function inView(o, x0, y0, x1, y1) {
    return o.x + (o.w || 1) >= x0 - 1 && o.x <= x1 + 1 && o.y + (o.h || 1) >= y0 - 1 && o.y <= y1 + 6;
  }

  // 광원 모으기
  const lights = [];
  function collectLights(loc) {
    lights.length = 0;
    const add = (l) => lights.push(l);
    for (const l of loc.lights) add(l);
    for (const o of loc.large) { const d = SD.ObjTypes.get(o.t); if (d && d.light) d.light(o, loc, add); }
    for (const map of [loc.objects, loc.features]) for (const o of map.values()) { const d = SD.ObjTypes.get(o.t); if (d && d.light) d.light(o, loc, add); }
    for (const c of loc.chars) { const d = SD.Chars.get(c.t); if (d && d.light) d.light(c, loc, add); }
    if (loc.def.lightsFn) SD.Mods.safe('lightsFn', loc.def.lightsFn, loc, add);
    SD.Mods.emit('lights', loc, add);
    return lights;
  }
  R.lights = lights;

  function drawLighting(g, loc) {
    const amb = R.ambient(loc);
    const near = amb[0] > 250 && amb[1] > 250 && amb[2] > 250;
    const ls = collectLights(loc);
    if (near && !ls.some((l) => l.always)) return;
    const lc = R.lightCtx;
    const lw = R.light.width, lh = R.light.height;
    // 빛 버퍼 원점은 카메라를 월드 픽셀로 내린 곳 (합성할 때 남은 소수만큼 밀어 준다)
    const lox = Math.floor(R.camX), loy = Math.floor(R.camY);
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.fillStyle = X.hex(amb[0], amb[1], amb[2]);
    lc.fillRect(0, 0, lw, lh);
    lc.globalCompositeOperation = 'lighter';
    const night = R.nightAmount();
    for (const l of ls) {
      const a0 = (l.a == null ? 1 : l.a) * (l.flicker ? 1 - l.flicker + Math.sin(SD.Time.anim * 13 + l.x) * l.flicker * 0.5 + Math.random() * l.flicker * 0.5 : 1);
      const a = l.nightOnly ? a0 * night : a0;
      if (a <= 0.01) continue;
      const x = l.x - lox, y = l.y - loy, r = l.r || 48;
      if (x < -r || y < -r || x > lw + r || y > lh + r) continue;
      const [cr, cg, cb] = X.rgb(l.color || '#ffd890');
      const grd = lc.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
      grd.addColorStop(0.55, `rgba(${cr},${cg},${cb},${a * 0.45})`);
      grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      lc.fillStyle = grd;
      lc.fillRect(x - r, y - r, r * 2, r * 2);
    }
    lc.globalCompositeOperation = 'source-over';
    // 곱하기 합성
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.imageSmoothingEnabled = false;
    const dx = Math.round((lox - R.camX) * R.S), dy = Math.round((loy - R.camY) * R.S);
    g.drawImage(R.light, 0, 0, lw, lh, dx, dy, lw * R.S, lh * R.S);
    g.restore();
  }

  // 월드 글자 (화면 해상도 폰트)
  function drawTexts(g) {
    const texts = SD.FX.texts;
    if (!texts.length) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const unit = Math.max(1, Math.round(R.S / 2));
    for (const q of texts) {
      const sx = (q.x - R.camX) * R.S, sy = (q.y - q.z - R.camY) * R.S;
      const size = Math.round(12 * unit * q.size);
      g.font = `${size}px Galmuri11, sans-serif`;
      const k = q.t / q.life;
      g.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
      g.fillStyle = q.outline;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.fillText(q.str, Math.round(sx + dx * unit), Math.round(sy + dy * unit));
      g.fillStyle = q.color;
      g.fillText(q.str, Math.round(sx), Math.round(sy));
    }
    g.restore();
  }

  R.draw = function () {
    const g = R.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0c0806';
    g.fillRect(0, 0, R.W, R.H);
    const loc = SD.World.current;
    if (!loc || !SD.G) return;
    R.updateCamera();
    g.setTransform(R.S, 0, 0, R.S, -R.camX * R.S, -R.camY * R.S);
    drawLocation(g, loc);
    if (weatherKind()) { drawWeather(g); SD.Mods.emit('draw:weather', V, loc); }
    drawLighting(g, loc);
    g.setTransform(R.S, 0, 0, R.S, -R.camX * R.S, -R.camY * R.S);
    SD.FX.draw(g, 'glow', V);
    SD.Mods.emit('draw:afterLight', V, loc);
    SD.Mods.emit('draw:world', V, loc);
    drawTexts(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const fl = SD.FX.flashAlpha();
    if (fl > 0) { g.globalAlpha = fl; g.fillStyle = SD.FX.flashColor(); g.fillRect(0, 0, R.W, R.H); g.globalAlpha = 1; }
  };
  // 화면 전체 검정 덮개 (워프·잠)
  R.drawFade = function (a) {
    if (a <= 0) return;
    const g = R.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = U.clamp(a, 0, 1);
    g.fillStyle = '#000000';
    g.fillRect(0, 0, R.W, R.H);
    g.globalAlpha = 1;
  };
})();
