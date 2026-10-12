'use strict';
// ════════════════════════════════════════════════════════════════════
//  디버그 API: window.DBG (테스트·개발용)
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;
  const TILE = SD.TILE;

  const loc = () => SD.World.current;
  const DBG = (window.DBG = {
    SD,
    // ── 아이템 · 돈 ──
    give(id, n, q, extra) { return SD.Inv.add(id, n == null ? 1 : n, q || 0, extra); },
    giveTool(id, lvl) { const st = SD.Inv.findTool(id); if (st) { st.lvl = lvl; if (id === 'can') st.water = SD.CAN_CAPACITY[lvl]; SD.Inv.changed(); return st; } return SD.Inv.add(id, 1, 0, { lvl, water: id === 'can' ? SD.CAN_CAPACITY[lvl] : undefined }); },
    money(n) { if (n != null) SD.G.money = n; return SD.G.money; },
    addMoney(n) { SD.G.money += n; return SD.G.money; },
    select(slot, row) { if (row != null) SD.G.row = row; SD.Inv.select(slot); return SD.Inv.selected(); },
    selectItem(id) {
      const i = SD.G.inv.findIndex((s) => s && s.id === id);
      if (i < 0) return null;
      SD.G.row = Math.floor(i / 12); SD.Inv.select(i % 12);
      return SD.Inv.selected();
    },
    // ── 시간 · 날짜 · 날씨 ──
    // time(1830) = 오후 6시 30분 (hhmm, 2600 = 새벽 2시)
    time(t) { if (t != null) SD.Time.setTime(Math.floor(t / 100) * 60 + (t % 100)); return SD.G.time; },
    setTime(h, m) { SD.Time.setTime(h * 60 + (m || 0)); return SD.G.time; },
    day(d) { if (d != null) SD.G.day = U.clamp(d, 1, 28); return SD.G.day; },
    season(s) {
      if (s != null) {
        const v = typeof s === 'string' ? SD.SEASONS.indexOf(s) : s;
        SD.G.season = U.clamp(v, 0, 3);
        for (const l of SD.World.all()) l._chunks.clear();
      }
      return SD.G.season;
    },
    year(y) { if (y != null) SD.G.year = y; return SD.G.year; },
    weather(w) { if (w) SD.Weather.set(w); return SD.G.weather; },
    tomorrow(w) { if (w) SD.G.tomorrow = w; return SD.G.tomorrow; },
    luck(v) { if (v != null) SD.G.luck = v; return SD.G.luck; },
    // ── 이동 ──
    warp(id, x, y, dir) {
      const l = SD.World.get(id);
      if (!l) return false;
      const e = x == null ? SD.World.entryPoint(l, SD.World.current && SD.World.current.id) : { x, y, dir };
      return SD.World.place(id, e.x, e.y, dir || e.dir || 'down');
    },
    teleport(x, y, dir) { const p = SD.G.player; p.x = x * TILE + 8; p.y = y * TILE + 12; if (dir) p.dir = dir; SD.Render.snapCamera(); return [x, y]; },
    face(dir) { SD.G.player.dir = dir; },
    // ── 스킬 · 상태 ──
    skill(id, lvl) { SD.Skills.setLevel(id, lvl); return SD.Skills.level(id); },
    energy(n) { if (n != null) SD.G.player.energy = n; return SD.G.player.energy; },
    health(n) { if (n != null) SD.G.player.health = n; return SD.G.player.health; },
    // ── 농사 ──
    clearArea(x0, y0, x1, y1) {
      const l = loc();
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        l.clearTile(x, y);
        for (const L of l.large.slice()) if (!L.static && x >= L.x && x < L.x + L.w && y >= L.y && y < L.y + L.h) l.removeLarge(L);
      }
    },
    till(x0, y0, x1, y1) { const l = loc(); let n = 0; for (let y = y0; y <= (y1 == null ? y0 : y1); y++) for (let x = x0; x <= (x1 == null ? x0 : x1); x++) if (SD.Farming.till(l, x, y)) n++; return n; },
    plant(seed, x0, y0, x1, y1) { const l = loc(); let n = 0; for (let y = y0; y <= (y1 == null ? y0 : y1); y++) for (let x = x0; x <= (x1 == null ? x0 : x1); x++) if (SD.Farming.plant(l, x, y, seed) === true) n++; return n; },
    waterAll() { for (const l of SD.World.all()) for (const f of l.features.values()) if (f.t === 'dirt') f.wet = true; },
    growAll() { for (const l of SD.World.all()) for (const f of l.features.values()) { if (f.t === 'dirt') SD.Farming.growFull(f); if (f.t === 'tree' && !f.stump) f.stage = 4; } },
    setCrop(x, y, id, phase) {
      const l = loc();
      l.clearTile(x, y);
      const f = l.setFeat(x, y, { t: 'dirt', wet: true });
      f.crop = { id, phase: phase || 0, day: 0, tint: 0 };
      return f;
    },
    // 모든 작물의 모든 단계를 줄지어 심는다 (스크린샷용)
    cropGallery(x0, y0, opts) {
      const o = opts || {};
      const ids = o.ids || SD.Crops.ids();
      const l = loc();
      let y = y0;
      for (const id of ids) {
        const n = SD.Crops.stageCount(id);
        DBG.clearArea(x0, y, x0 + n, y);
        for (let s = 0; s < n; s++) DBG.setCrop(x0 + s, y, id, s);
        y += o.spacing || 2;
      }
      return y;
    },
    // ── 하루 ──
    sleep() { SD.Day.sleep(); },
    // 정산 화면까지 자동으로 넘기며 하루를 보낸다 (테스트)
    skipDay() {
      return new Promise((resolve) => {
        const finish = SD.Mods.on('newDay', () => { finish(); resolve(SD.G.day); });
        SD.Day.sleep();
        const pump = setInterval(() => {
          const top = SD.UI.top();
          if (top && top.id === 'summary') { top._t = 9; top.next(); }
          if (!SD.Day.busy) clearInterval(pump);
        }, 50);
      });
    },
    // ── 루프 제어 ──
    freeze(on) { SD.Game.frozen = on !== false; return SD.Game.frozen; },
    step(ms) { SD.Game.step(ms); },
    anim(name, opts) { return SD.Player.anim(name, opts); },
    press(action) { SD.Input.press(action); setTimeout(() => SD.Input.release(action), 30); },
    // ── 상태 ──
    state() { return SD.G; },
    loc() { return loc(); },
    player() { return SD.G.player; },
    save() { return SD.Save.save(); },
    count(id) { return SD.Inv.count(id); },
    errors: [],
    // 스프라이트 시트 (dataURL)
    sheet(kind, scale) {
      const X = SD.gfx;
      const sc = scale || 4;
      if (kind === 'items') {
        const all = SD.Items.all();
        const cols = 16;
        const c = X.canvas(cols * 18 * sc, Math.ceil(all.length / cols) * 18 * sc);
        const g = X.ctx(c);
        g.fillStyle = '#f2c686'; g.fillRect(0, 0, c.width, c.height);
        all.forEach((d, i) => g.drawImage(SD.Items.icon(d.tool ? { id: d.id, lvl: 0 } : d.id), (i % cols) * 18 * sc + sc, Math.floor(i / cols) * 18 * sc + sc, 16 * sc, 16 * sc));
        return c.toDataURL();
      }
      return null;
    },
  });
  void DBG;
})();
