'use strict';
// ════════════════════════════════════════════════════════════════════
//  UI 프레임워크 (최소 기능판 — UI 단계가 js/core/ui*.js 를 확장/교체한다)
//  - 캔버스 위 픽셀 UI: 정수 배율 u(UI 픽셀 → 기기 픽셀), 갈무리 픽셀 폰트
//  - 화면 스택: SD.UI.push({ blocking, update, draw, onKey, onPointer, onClose })
//  - 공개 API(모듈용): hud, say, dialogue, question, openMenu, addTab, openShop,
//                      daySummary, tooltip, frame, text, blocking, closeAll
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;
  const X = SD.gfx;

  const UI = (SD.UI = {
    u: 4, tu: 2, W: 0, H: 0,
    screens: [],
    messages: [],
    mouse: { x: -1, y: -1 },   // 기기 픽셀
    hoverStack: null,
    FONT: 'Galmuri11',
    FONT_SMALL: 'Galmuri9',
  });

  // ───────────── 배율 ─────────────
  UI.layout = function () {
    const R = SD.Render;
    UI.W = R.W; UI.H = R.H;
    const pref = SD.Settings.get('uiScale');
    let u = pref && pref !== 'auto' ? Math.round(+pref * R.dpr) : Math.round(R.zoom * R.dpr);
    u = Math.min(u, Math.floor(UI.W / 222), Math.floor(UI.H / 128));
    UI.u = Math.max(1, u);
    UI.tu = Math.max(1, Math.round(UI.u / 2));
  };

  // ───────────── 색 ─────────────
  UI.C = {
    outline: '#4a200a', wood: '#c8742c', woodL: '#f0a454', woodD: '#94481a', inner: '#6a3212',
    fill: '#f8d49c', fillD: '#ecbc7c', fillL: '#fde6bc', text: '#4a2410', textSh: '#e6b070', textL: '#fff4dc',
    slot: '#f2c686', slotD: '#c88a4a', slotL: '#fde2b0', red: '#e8301e', green: '#5fc83e',
    dark: '#2a1608', darkFill: 'rgba(42,22,8,0.86)',
  };

  // ───────────── 그리기 도우미 (기기 픽셀 좌표, 크기는 UI 픽셀 단위 u 배) ─────────────
  // 나무 액자 (계단식 모서리)
  UI.frame = function (g, x, y, w, h, style) {
    const u = UI.u, C = UI.C;
    const st = style || 'wood';
    const R = (xx, yy, ww, hh, c) => { g.fillStyle = c; g.fillRect(Math.round(xx), Math.round(yy), Math.round(ww), Math.round(hh)); };
    if (st === 'dark') {
      R(x + u, y, w - 2 * u, h, C.outline); R(x, y + u, w, h - 2 * u, C.outline);
      R(x + u, y + u, w - 2 * u, h - 2 * u, 'rgba(36,18,6,0.9)');
      R(x + 2 * u, y + u, w - 4 * u, u, 'rgba(255,220,160,0.18)');
      return;
    }
    if (st === 'slot') {
      R(x, y, w, h, C.slotD); R(x + u, y + u, w - 2 * u, h - 2 * u, C.slot);
      R(x + u, y + u, w - 2 * u, u, C.slotD); R(x + u, y + u, u, h - 2 * u, '#dca468');
      return;
    }
    // 바깥 외곽선 (모서리 깎기)
    R(x + 2 * u, y, w - 4 * u, h, C.outline); R(x, y + 2 * u, w, h - 4 * u, C.outline); R(x + u, y + u, w - 2 * u, h - 2 * u, C.outline);
    // 나무 테두리
    const b = 4 * u;
    R(x + 2 * u, y + u, w - 4 * u, h - 2 * u, C.wood); R(x + u, y + 2 * u, w - 2 * u, h - 4 * u, C.wood);
    R(x + 2 * u, y + u, w - 4 * u, u, C.woodL); R(x + u, y + 2 * u, u, h - 4 * u, C.woodL);
    R(x + 2 * u, y + h - 2 * u, w - 4 * u, u, C.woodD); R(x + w - 2 * u, y + 2 * u, u, h - 4 * u, C.woodD);
    // 나뭇결
    for (let i = x + 6 * u; i < x + w - 6 * u; i += 9 * u) { R(i, y + 2 * u, 2 * u, u, '#b05e22'); R(i + 4 * u, y + h - 3 * u, 2 * u, u, '#b05e22'); }
    // 안쪽 선 + 바탕
    R(x + b - u, y + b - u, w - 2 * b + 2 * u, h - 2 * b + 2 * u, C.inner);
    R(x + b, y + b, w - 2 * b, h - 2 * b, st === 'paper' ? '#fbf0d8' : C.fill);
    R(x + b, y + b, w - 2 * b, u, st === 'paper' ? '#efdcb4' : C.fillD);
    R(x + b, y + b, u, h - 2 * b, st === 'paper' ? '#efdcb4' : C.fillD);
  };
  UI.FRAME_PAD = 4; // UI px
  // 아이콘(캔버스) 확대 그리기
  UI.img = function (g, img, x, y, scale) {
    const s = (scale || 1) * UI.u;
    g.drawImage(img, Math.round(x), Math.round(y), img.width * s, img.height * s);
  };
  // 글자
  UI.font = function (size, small) { return `${Math.round(12 * UI.tu * (size || 1))}px ${small ? UI.FONT_SMALL : UI.FONT}, sans-serif`; };
  UI.text = function (g, str, x, y, opts) {
    const o = opts || {};
    g.font = o.font || UI.font(o.size, o.small);
    g.textAlign = o.align || 'left';
    g.textBaseline = o.baseline || 'top';
    const s = String(str);
    if (o.shadow !== false) {
      g.fillStyle = o.shadowColor || (o.color === UI.C.textL || o.light ? 'rgba(40,16,4,0.85)' : UI.C.textSh);
      g.fillText(s, Math.round(x + UI.tu), Math.round(y + UI.tu));
    }
    g.fillStyle = o.color || UI.C.text;
    g.fillText(s, Math.round(x), Math.round(y));
  };
  // 글자 테두리 (어두운 배경 위 흰 글자)
  UI.textOutlined = function (g, str, x, y, opts) {
    const o = opts || {};
    g.font = o.font || UI.font(o.size, o.small);
    g.textAlign = o.align || 'left';
    g.textBaseline = o.baseline || 'top';
    const t = UI.tu;
    g.fillStyle = o.outline || '#2a1608';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.fillText(str, Math.round(x + dx * t), Math.round(y + dy * t));
    g.fillStyle = o.color || '#ffffff';
    g.fillText(str, Math.round(x), Math.round(y));
  };
  UI.measure = function (g, str, opts) {
    const o = opts || {};
    g.font = o.font || UI.font(o.size, o.small);
    return g.measureText(str).width;
  };
  // 줄바꿈 (한국어: 띄어쓰기 우선, 긴 낱말은 글자 단위)
  UI.wrap = function (g, str, maxW, opts) {
    g.font = (opts && opts.font) || UI.font(opts && opts.size, opts && opts.small);
    const out = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const tryL = line ? line + ' ' + word : word;
        if (g.measureText(tryL).width <= maxW) { line = tryL; continue; }
        if (line) out.push(line);
        if (g.measureText(word).width <= maxW) { line = word; continue; }
        line = '';
        for (const ch of word) {
          if (g.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch;
        }
      }
      out.push(line);
    }
    return out;
  };
  UI.lineH = () => Math.round(14 * UI.tu);
  // 사각형 안에 점이 있는가
  UI.inRect = (x, y, r) => x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];

  // ───────────── 품질 별 / 개수 숫자 ─────────────
  const STAR = ['..s..', '.sSs.', 'sSSSs', '.sSs.', 's...s'];
  UI.starIcon = function (q) {
    return X.cached('ui:star:' + q, () => {
      const col = SD.QUALITY[q].color || '#ffffff';
      const c = X.fromRows(['...s...', '..sSs..', 'sssSsss', '.sSSSs.', '..sSs..', '.ss.ss.', '.s...s.'], { s: X.dark(col, 0.25), S: X.light(col, 0.35) });
      return X.outline(c, { color: '#3a1a08' });
    });
  };
  void STAR;
  UI.drawStack = function (g, st, x, y, scale, opts) {
    if (!st) return;
    const o = opts || {};
    const u = UI.u * (scale || 1);
    const icon = SD.Items.icon(st);
    g.drawImage(icon, Math.round(x), Math.round(y), 16 * u, 16 * u);
    if (st.q) g.drawImage(UI.starIcon(st.q), Math.round(x), Math.round(y + 9 * u), 7 * u, 7 * u);
    if (st.n > 1 && !o.noCount) UI.textOutlined(g, String(st.n), x + 16 * u, y + 16 * u - 9 * UI.tu, { align: 'right', size: 0.75, small: true, color: '#ffffff' });
    const def = SD.Items.get(st.id);
    if (def && def.tool === 'can' && !o.noBar) {
      const cap = SD.CAN_CAPACITY[st.lvl || 0];
      const k = st.water == null ? 1 : st.water / cap;
      g.fillStyle = '#2a1608'; g.fillRect(Math.round(x + 2 * u), Math.round(y + 14 * u), Math.round(12 * u), Math.round(2 * u));
      g.fillStyle = '#3fa0f0'; g.fillRect(Math.round(x + 2 * u), Math.round(y + 14 * u), Math.round(12 * u * k), Math.round(u * 1.2));
    }
  };

  // ───────────── 화면 스택 ─────────────
  UI.push = function (s) {
    s._t = 0;
    UI.screens.push(s);
    if (s.onOpen) SD.Mods.safe('ui.onOpen', s.onOpen.bind(s));
    SD.Input.clear();
    return s;
  };
  UI.pop = function (s) {
    const i = s ? UI.screens.indexOf(s) : UI.screens.length - 1;
    if (i < 0) return;
    const [sc] = UI.screens.splice(i, 1);
    SD.Input.clear();
    if (sc.onClose) SD.Mods.safe('ui.onClose', sc.onClose.bind(sc));
  };
  UI.top = () => UI.screens[UI.screens.length - 1] || null;
  UI.closeAll = function () { while (UI.screens.length) UI.pop(); };
  UI.isOpen = (id) => UI.screens.some((s) => s.id === id);
  // 게임을 멈추는 화면이 열려 있는가
  UI.blocking = () => UI.screens.some((s) => s.blocking !== false) || !!UI.title;

  UI.onKey = function (act, e, key) {
    if (UI.title) return UI.title.onKey ? !!UI.title.onKey(act, e, key) : true;
    const s = UI.top();
    if (s) {
      const r = s.onKey ? s.onKey(act, e, key) : false;
      if (r) return true;
      return s.blocking !== false && act !== 'mute';
    }
    return false;
  };
  UI.onPointer = function (type, cx, cy, btn, e) {
    const x = cx * SD.Render.dpr, y = cy * SD.Render.dpr;
    UI.mouse.x = x; UI.mouse.y = y;
    if (UI.title) { if (UI.title.onPointer) UI.title.onPointer(type, x, y, btn, e); return true; }
    const s = UI.top();
    if (s) {
      const r = s.onPointer ? s.onPointer(type, x, y, btn, e) : false;
      return r || s.blocking !== false;
    }
    if (SD.HUD && SD.HUD.onPointer) return !!SD.HUD.onPointer(type, x, y, btn, e);
    return false;
  };

  UI.update = function (dt) {
    for (const s of UI.screens.slice()) { s._t += dt; if (s.update) SD.Mods.safe('ui.update', s.update.bind(s), dt); }
    if (UI.title && UI.title.update) UI.title.update(dt);
    for (let i = UI.messages.length - 1; i >= 0; i--) { UI.messages[i].t += dt; if (UI.messages[i].t > UI.messages[i].life) UI.messages.splice(i, 1); }
  };
  UI.draw = function (g) {
    UI.layout();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    UI.hoverStack = null;
    if (UI.title) { UI.title.draw(g); UI.drawCursor(g); return; }
    if (SD.HUD && !UI.hideHud) SD.HUD.draw(g);
    SD.Mods.emit('draw:ui', g, UI);
    for (const s of UI.screens) if (s.draw) SD.Mods.safe('ui.draw', s.draw.bind(s), g);
    UI.drawMessages(g);
    if (UI.hoverStack) UI.tooltip(g, UI.hoverStack, UI.mouse.x, UI.mouse.y);
    UI.drawCursor(g);
  };

  // ───────────── HUD 메시지 (왼쪽 아래, 같은 아이템은 수량 누적) ─────────────
  UI.hud = function (text, opts) {
    const o = opts || {};
    if (o.merge && o.icon) {
      const m = UI.messages.find((mm) => mm.mergeKey === o.icon && mm.t < mm.life - 0.4);
      if (m) { m.count += o.count || 1; m.t = Math.min(m.t, 0.3); m.text = text; return m; }
    }
    const m = { text, icon: o.icon || null, kind: o.kind || 'info', t: 0, life: o.life || 3.6, count: o.count || 0, mergeKey: o.merge ? o.icon : null };
    UI.messages.push(m);
    while (UI.messages.length > 6) UI.messages.shift();
    return m;
  };
  UI.drawMessages = function (g) {
    const u = UI.u;
    let y = UI.H - 34 * u - (SD.HUD && SD.HUD.toolbarAtTop ? 0 : 0);
    const x = 4 * u;
    for (let i = UI.messages.length - 1; i >= 0; i--) {
      const m = UI.messages[i];
      const k = m.t < 0.15 ? m.t / 0.15 : m.t > m.life - 0.5 ? (m.life - m.t) / 0.5 : 1;
      const label = m.count > 0 ? `${m.text} +${m.count}` : m.text;
      const tw = UI.measure(g, label);
      const h = 22 * u, w = tw + (m.icon ? 26 * u : 10 * u);
      g.globalAlpha = U.clamp(k, 0, 1);
      const ox = x - (1 - U.clamp(k * 2, 0, 1)) * 30 * u;
      UI.frame(g, ox, y - h, w, h, 'wood');
      if (m.icon) {
        const ic = typeof m.icon === 'string' ? SD.Items.icon(m.icon) : m.icon;
        g.drawImage(ic, Math.round(ox + 5 * u), Math.round(y - h + 3 * u), 16 * u, 16 * u);
      }
      const col = m.kind === 'error' ? '#b8200e' : m.kind === 'good' ? '#2a7a1a' : UI.C.text;
      UI.text(g, label, ox + (m.icon ? 22 * u : 5 * u), y - h + (h - 12 * UI.tu) / 2, { color: col });
      g.globalAlpha = 1;
      y -= h + 2 * u;
    }
  };
  // 획득 알림: 아이템이 가방에 들어오면 자동으로
  SD.Mods.on('itemAdded', (id, n, q, info) => {
    if (info && info.silent) return;
    UI.hud(SD.Items.name(id), { icon: id, merge: true, count: n });
  });

  // ───────────── 커서 ─────────────
  const CURSOR = ['k.........', 'kk........', 'kwk.......', 'kwwk......', 'kwwwk.....', 'kwwwwk....', 'kwwwwwk...', 'kwwwwwwk..', 'kwwwwkkkk.', 'kwkwwk....', 'kk.kwwk...', 'k...kwk...', '.....kk...'];
  const cursorImg = () => X.cached('ui:cursor', () => X.fromRows(CURSOR, { k: '#3a1a08', w: '#fff4dc' }));
  UI.drawCursor = function (g) {
    const m = SD.Input.mouse;
    if (!m.inside || m.type !== 'mouse') return;
    const x = m.x * SD.Render.dpr, y = m.y * SD.Render.dpr;
    const s = Math.max(2, UI.u - 1);
    g.drawImage(cursorImg(), Math.round(x), Math.round(y), 10 * s, 13 * s);
  };

  // ───────────── 툴팁 ─────────────
  UI.tooltip = function (g, st, mx, my) {
    const def = SD.Items.get(st.id);
    if (!def) return;
    const u = UI.u;
    const name = SD.Items.name(st);
    const cat = SD.Items.category(st.id);
    const maxW = 110 * u;
    const lines = UI.wrap(g, def.desc || '', maxW, { size: 0.85 });
    const e = SD.Items.energyOf(st);
    const price = SD.Items.canSell(st) ? SD.Items.sellPrice(st) : 0;
    const lh = UI.lineH();
    const extra = [];
    if (e && e.energy > 0) extra.push([`기력 +${e.energy}`, '#2a7a1a'], [`체력 +${e.health}`, '#b8301e']);
    else if (e && e.energy < 0) extra.push([`기력 ${e.energy}`, '#b8301e']);
    if (def.tool === 'can') extra.push([`물 ${st.water == null ? SD.CAN_CAPACITY[st.lvl || 0] : st.water}/${SD.CAN_CAPACITY[st.lvl || 0]}`, '#2a5aa8']);
    if (st.q) extra.push([SD.QUALITY[st.q].name + ' 품질', '#8a5a1a']);
    const h = 8 * u + lh * 1.3 + lh + lines.length * lh * 0.9 + extra.length * lh + (price ? lh : 0) + 4 * u;
    const w = Math.max(maxW, UI.measure(g, name, { size: 1.15 }) + 8 * u) + 12 * u;
    let x = mx + 8 * u, y = my + 8 * u;
    if (x + w > UI.W) x = mx - w - 4 * u;
    if (y + h > UI.H) y = UI.H - h - 2 * u;
    UI.frame(g, x, y, w, h);
    let cy = y + 5 * u;
    UI.text(g, name, x + 6 * u, cy, { size: 1.15 });
    cy += lh * 1.3;
    UI.text(g, cat.name, x + 6 * u, cy, { color: cat.color, size: 0.9, shadow: false });
    cy += lh;
    for (const l of lines) { UI.text(g, l, x + 6 * u, cy, { size: 0.85 }); cy += lh * 0.9; }
    for (const [t, c] of extra) { UI.text(g, t, x + 6 * u, cy, { color: c, size: 0.9 }); cy += lh; }
    if (price) {
      const n = st.n > 1 ? ` (×${st.n} = ${U.fmt(price * st.n)}G)` : '';
      UI.text(g, `${U.fmt(price)}G${n}`, x + 6 * u, cy, { size: 0.9 });
    }
  };
})();
