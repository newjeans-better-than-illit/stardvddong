'use strict';
// ════════════════════════════════════════════════════════════════════
//  HUD: 오른쪽 위 시계(날짜·해/달 다이얼·날씨·계절·시간) + 금화(굴러가는 숫자),
//       오른쪽 아래 기력/체력 바, 아래 가운데 툴바(12칸)
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;
  const X = SD.gfx;
  const UI = SD.UI;

  // ───────────── 아이콘 ─────────────
  const ICONS = {
    sun: [['...y...', '.y.y.y.', '..ooo..', 'yoOOOoy', '..ooo..', '.y.y.y.', '...y...'], { y: '#ffd23a', o: '#f2a020', O: '#fff2a0' }],
    rain: [['..ccc..', '.cCCCc.', 'cCCCCCc', 'ddddddd', '.b.b.b.', 'b.b.b..', '.......'], { c: '#c9d3dc', C: '#eef3f7', d: '#8e9ba8', b: '#3f8fd0' }],
    storm: [['..ccc..', '.cCCCc.', 'cCCCCCc', 'ddddddd', '..yy...', '.yy....', '..y....'], { c: '#8a96a8', C: '#b8c4d4', d: '#5e6a7a', y: '#ffe23a' }],
    snow: [['..ccc..', '.cCCCc.', 'cCCCCCc', 'ddddddd', '.w..w..', 'www.www', '.w..w..'], { c: '#c9d3dc', C: '#eef3f7', d: '#8e9ba8', w: '#ffffff' }],
    wind: [['.......', 'ggggg..', '.....g.', 'gggggg.', '......g', 'gggg.g.', '.......'], { g: '#e8f0f8' }],
    s0: [['..p.p..', '.pPpPp.', '..pYp..', '.pPpPp.', '..pgp..', '...g...', '..ggg..'], { p: '#f07ab8', P: '#ffb8dc', Y: '#ffe36a', g: '#5fae3e' }],
    s1: [['...y...', '.y.y.y.', '..yyy..', 'yyYYYyy', '..yyy..', '.y.y.y.', '...y...'], { y: '#ffb020', Y: '#ffe86a' }],
    s2: [['....o..', '...oo..', '..oOo..', '.oOoo..', '.oooo..', '..oo...', '.d.....'], { o: '#e8702a', O: '#f8a85a', d: '#8a4a1a' }],
    s3: [['...w...', '.w.w.w.', '..www..', 'wwwbwww', '..www..', '.w.w.w.', '...w...'], { w: '#e8f4ff', b: '#9ac8f0' }],
    coin: [['..ooo..', '.oYYYo.', 'oYyoyYo', 'oYyoyYo', 'oYyoyYo', '.oyyyo.', '..ooo..'], { o: '#b8820e', y: '#ffcf2e', Y: '#fff2a0' }],
    energy: [['..yy...', '.yy....', 'yyyyy..', '...yy..', '..yy...', '.y.....', '.......'], { y: '#ffe23a' }],
    heart: [['.rr.rr.', 'rRrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...', '.......'], { r: '#e8302a', R: '#ff9a8a' }],
  };
  const icon = (name) => X.cached('hud:' + name, () => X.outline(X.fromRows(ICONS[name][0], ICONS[name][1]), { color: '#3a1a08' }));
  SD.HUD = { icon, money: null, toolbarRect: null, toolbarAtTop: false };
  const HUD = SD.HUD;

  // ───────────── 시계 ─────────────
  function drawClock(g) {
    const u = UI.u, G = SD.G;
    const w = 76 * u, h = 52 * u;
    const x = UI.W - w - 3 * u, y = 3 * u;
    UI.frame(g, x, y, w, h);
    // 다이얼 (왼쪽 반원): 6시 → 새벽 2시
    const dx = x + 5 * u, dy = y + 5 * u, dw = 22 * u, dh = 42 * u;
    g.fillStyle = '#2a1608'; g.fillRect(dx, dy, dw, dh);
    const k = U.clamp((SD.Render.timeF() - 360) / (1560 - 360), 0, 1);
    const sky = SD.Render.skyColor();
    g.fillStyle = sky; g.fillRect(dx + u, dy + u, dw - 2 * u, dh - 2 * u);
    // 해/달이 반원 궤도를 따라 돈다
    const ang = Math.PI / 2 + k * Math.PI;
    const cx = dx + dw - 2 * u, cy = dy + dh / 2;
    const r = 16 * u;
    const bx = cx + Math.cos(ang) * r * 0.9, by = cy - Math.sin(ang) * r * 1.1;
    const night = SD.Render.nightAmount() > 0.5;
    g.fillStyle = night ? '#f4f0d8' : '#ffd23a';
    g.fillRect(Math.round(bx - 3 * u), Math.round(by - 3 * u), 6 * u, 6 * u);
    g.fillStyle = night ? '#d8d4b8' : '#f2a020';
    g.fillRect(Math.round(bx - 3 * u), Math.round(by + 2 * u), 6 * u, u);
    // 바늘
    g.strokeStyle = '#4a200a'; g.lineWidth = u;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * r * 0.75, cy - Math.sin(ang) * r * 0.9); g.stroke();
    g.fillStyle = '#c8301e'; g.fillRect(cx - u, cy - u, 2 * u, 2 * u);
    // 날짜
    const tx = x + 29 * u;
    UI.text(g, `${SD.SEASON_NAMES[G.season]} ${G.day}일 (${SD.Time.weekday()})`, tx + 22 * u, y + 6 * u, { align: 'center', size: 0.85 });
    // 날씨 · 계절 아이콘
    UI.img(g, icon(G.weather in ICONS ? G.weather : 'sun'), tx + 8 * u, y + 18 * u, 1.6);
    UI.img(g, icon('s' + G.season), tx + 26 * u, y + 18 * u, 1.6);
    // 시간 (밤늦게는 빨갛게)
    const late = G.time >= 1440;
    UI.text(g, U.timeText(G.time), tx + 22 * u, y + 34 * u, { align: 'center', color: late ? '#c8200e' : UI.C.text });
    // 금화
    const my = y + h + u, mh = 16 * u;
    UI.frame(g, x + 8 * u, my, w - 8 * u, mh);
    if (HUD.money == null) HUD.money = G.money;
    const diff = G.money - HUD.money;
    if (Math.abs(diff) < 1) HUD.money = G.money;
    else HUD.money += diff * 0.12 + Math.sign(diff) * 0.6;
    UI.img(g, icon('coin'), x + 12 * u, my + 4.5 * u, 1.1);
    UI.text(g, U.fmt(Math.round(HUD.money)), x + w - 6 * u, my + 2 * u + (mh - 12 * UI.tu) / 2 - u, { align: 'right', color: diff ? '#2a6a1a' : UI.C.text });
  }

  // ───────────── 기력 / 체력 바 ─────────────
  function bar(g, x, y, w, h, frac, colorFn, label) {
    const u = UI.u;
    UI.frame(g, x, y, w, h);
    const ix = x + 4 * u, iy = y + 12 * u, iw = w - 8 * u, ih = h - 16 * u;
    g.fillStyle = '#5a2a0e'; g.fillRect(ix, iy, iw, ih);
    const fh = Math.round(ih * U.clamp(frac, 0, 1));
    g.fillStyle = colorFn(frac); g.fillRect(ix, iy + ih - fh, iw, fh);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(ix, iy + ih - fh, Math.max(u, Math.round(iw / 3)), fh);
    UI.img(g, icon(label), x + w / 2 - 3.5 * u * 1.2, y + 3 * u, 1.2);
  }
  function drawBars(g) {
    const u = UI.u, p = SD.G.player;
    const w = 14 * u, h = 64 * u;
    const x = UI.W - w - 3 * u, y = UI.H - h - 3 * u;
    const ef = Math.max(0, p.energy) / p.maxEnergy;
    const shake = ef < 0.15 ? Math.round(Math.sin(SD.Time.real * 40) * u * 0.6) : 0;
    bar(g, x + shake, y, w, h, ef, (f) => (f > 0.5 ? '#5fd23a' : f > 0.25 ? '#f2c230' : '#e2372b'), 'energy');
    const loc = SD.World.current;
    if (p.health < p.maxHealth || (loc && loc.def.showHealth)) {
      bar(g, x - w - 2 * u, y, w, h, p.health / p.maxHealth, () => '#e2372b', 'heart');
    }
    const mx = UI.mouse.x, my = UI.mouse.y;
    if (UI.inRect(mx, my, [x, y, w, h])) {
      UI.textOutlined(g, `${Math.max(0, Math.round(p.energy))}/${p.maxEnergy}`, x - 4 * u, y + h / 2, { align: 'right' });
    }
  }

  // ───────────── 툴바 ─────────────
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
  function drawToolbar(g) {
    const u = UI.u, G = SD.G;
    const slot = 16 * u, gap = u;
    const w = 12 * slot + 11 * gap + 8 * u, h = slot + 8 * u;
    const p = G.player;
    const ps = SD.Render.worldToScreen(p.x, p.y);
    if (ps.y * SD.Render.dpr > UI.H * 0.72) HUD.toolbarAtTop = true;
    else if (ps.y * SD.Render.dpr < UI.H * 0.62) HUD.toolbarAtTop = false;
    const x = Math.round((UI.W - w) / 2), y = HUD.toolbarAtTop ? 4 * u : UI.H - h - 3 * u;
    HUD.toolbarRect = [x, y, w, h];
    UI.frame(g, x, y, w, h);
    const row = G.row || 0;
    for (let i = 0; i < 12; i++) {
      const sx = x + 4 * u + i * (slot + gap), sy = y + 4 * u;
      UI.frame(g, sx, sy, slot, slot, 'slot');
      const st = G.inv[row * 12 + i];
      if (st) UI.drawStack(g, st, sx, sy);
      UI.text(g, KEYS[i], sx + 1.5 * u, sy + u, { size: 0.6, small: true, color: '#9a6a3a', shadow: false });
      if (i === G.sel) {
        g.strokeStyle = UI.C.red; g.lineWidth = u;
        g.strokeRect(sx + u / 2, sy + u / 2, slot - u, slot - u);
        g.strokeStyle = '#ff9a6a'; g.lineWidth = Math.max(1, u / 2);
        g.strokeRect(sx + u * 1.5, sy + u * 1.5, slot - 3 * u, slot - 3 * u);
      }
      if (st && UI.inRect(UI.mouse.x, UI.mouse.y, [sx, sy, slot, slot]) && !UI.top()) UI.hoverStack = st;
    }
    // 줄 표시 (Tab)
    for (let r = 0; r < 3; r++) { g.fillStyle = r === row ? '#fff4dc' : '#8a4a1a'; g.fillRect(x + w - 3 * u, y + 5 * u + r * 5 * u, 2 * u, 3 * u); }
  }
  HUD.onPointer = function (type, x, y, btn) {
    const r = HUD.toolbarRect;
    if (!r || !SD.G) return false;
    if (type === 'down' && UI.inRect(x, y, r)) {
      const u = UI.u, slot = 16 * u;
      const i = Math.floor((x - r[0] - 4 * u) / (slot + u));
      if (i >= 0 && i < 12) { SD.Inv.select(i); SD.Sound.play('smallSelect'); }
      return true;
    }
    return false;
  };

  HUD.draw = function (g) {
    if (!SD.G || !SD.World.current) return;
    drawClock(g);
    drawBars(g);
    drawToolbar(g);
  };
})();
