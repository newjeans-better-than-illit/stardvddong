'use strict';
// ════════════════════════════════════════════════════════════════════
//  저장 / 불러오기 (localStorage, 버전 관리, 모든 지역 상태 + 모듈 상태)
//  설정(줌·볼륨)은 따로 저장한다. 모든 저장소 접근은 try/catch.
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const KEY = 'stardew-ddong-v2-save';
  const SKEY = 'stardew-ddong-v2-settings';
  const VERSION = 2;

  // 밑줄로 시작하는 필드(연출용)는 저장하지 않는다
  const replacer = (k, v) => (k && k[0] === '_' ? undefined : v);

  const Save = (SD.Save = {
    KEY, VERSION,
    serialize() {
      const G = SD.G;
      const g = {};
      for (const k of Object.keys(G)) if (k !== 'mods' && k[0] !== '_') g[k] = G[k];
      return JSON.parse(JSON.stringify({ v: VERSION, savedAt: Date.now(), G: g, locs: SD.World.serializeAll(), mods: SD.Mods._save(G) }, replacer));
    },
    save() {
      if (!SD.G) return false;
      SD.Mods.emit('beforeSave', SD.G);
      try {
        const data = Save.serialize();
        localStorage.setItem(KEY, JSON.stringify(data));
        SD.Mods.emit('saved', data);
        return true;
      } catch (e) {
        console.warn('[SD] 저장 실패', e);
        return false;
      }
    },
    raw() {
      try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
    },
    exists() { const r = Save.raw(); return !!(r && r.v === VERSION && r.G); },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ } },
    // 데이터 → 게임 상태 (지역·모듈 포함). 실패하면 null
    restore(data) {
      if (!data || data.v !== VERSION || !data.G) return null;
      try {
        const G = SD.Game.blankState(data.G.seed || 1);
        Object.assign(G, data.G);
        G.inv = (data.G.inv || []).slice(0, 36);
        while (G.inv.length < 36) G.inv.push(null);
        G.player = Object.assign(SD.Game.blankState(1).player, data.G.player || {});
        SD.G = G;
        SD.World.createAll(data.locs || {});
        SD.Mods._load(G, data.mods || {});
        return G;
      } catch (e) {
        console.error('[SD] 불러오기 실패', e);
        return null;
      }
    },
  });

  // ───────────── 설정 ─────────────
  const defaults = { zoom: 'auto', volume: 0.8, music: 0.6, muted: false, uiScale: 'auto' };
  let settings = Object.assign({}, defaults);
  try { const s = localStorage.getItem(SKEY); if (s) settings = Object.assign(settings, JSON.parse(s)); } catch (e) { /* 무시 */ }
  SD.Settings = {
    get: (k) => settings[k],
    set(k, v) {
      settings[k] = v;
      try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* 무시 */ }
      SD.Mods.emit('settingChanged', k, v);
      if (k === 'zoom' && SD.Render && SD.Render.canvas) SD.Render.resize();
      if (k === 'volume') SD.Sound.setVolume(v);
      if (k === 'music') SD.Music.setVolume(v);
    },
    all: () => Object.assign({}, settings),
  };
})();
