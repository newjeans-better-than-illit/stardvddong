'use strict';
// ════════════════════════════════════════════════════════════════════
//  스타듀 똥밸리 v2 — 엔진 코어: 네임스페이스, 유틸, 훅(이벤트), 모듈 레지스트리
//  모든 코어 파일은 window.SD 아래에 기능을 붙인다. 모듈은 js/mods/*.js 에서
//  SD.Mods.register({...}) 로 자기 자신을 등록하고 훅으로 코어를 확장한다.
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = (window.SD = window.SD || {});
  SD.VERSION = 2;
  SD.TILE = 16;
  SD.SEASONS = ['spring', 'summer', 'fall', 'winter'];
  SD.SEASON_NAMES = ['봄', '여름', '가을', '겨울'];
  SD.WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
  SD.DAYS_PER_SEASON = 28;
  SD.DIRS = {
    down: { x: 0, y: 1 }, up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  SD.DIR_LIST = ['down', 'right', 'up', 'left'];

  // ───────────── 유틸 ─────────────
  const U = (SD.util = {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.inv = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.easeOut = (t) => 1 - (1 - t) * (1 - t);
  U.easeIn = (t) => t * t;
  U.easeOutBack = (t) => { const c = 1.70158; const x = t - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  // 타일 좌표 → 숫자 키 (가로 4096칸까지)
  U.tk = (x, y) => y * 4096 + x;
  U.kx = (k) => k % 4096;
  U.ky = (k) => Math.floor(k / 4096);
  U.hash2 = (x, y, s = 0) => {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };
  U.hash01 = (x, y, s = 0) => U.hash2(x, y, s) / 4294967296;
  U.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // 게임 전역 난수(세이브와 무관한 연출용은 Math.random 사용)
  U.rand = Math.random;
  U.randInt = (a, b, r = Math.random) => a + Math.floor(r() * (b - a + 1));
  U.pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
  U.chance = (p, r = Math.random) => r() < p;
  U.shuffle = (arr, r = Math.random) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  U.fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
  U.timeText = (min) => {
    const h24 = Math.floor(min / 60) % 24;
    const m = Math.floor(min % 60);
    let hh = h24 % 12; if (hh === 0) hh = 12;
    return `${h24 < 12 ? '오전' : '오후'} ${hh}:${String(m).padStart(2, '0')}`;
  };
  U.deepCopy = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  // 받침 유무에 따라 조사 선택: josa('똥', '이', '가')
  U.josa = (word, withBatchim, without) => {
    const s = String(word);
    const c = s.charCodeAt(s.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return without;
    return (c - 0xac00) % 28 ? withBatchim : without;
  };
  U.withJosa = (word, a, b) => word + U.josa(word, a, b);

  // ───────────── 훅 / 이벤트 ─────────────
  // Mods.on(이벤트, 함수, {priority, mod}) → off 함수
  // Mods.emit   : 모든 핸들러 호출
  // Mods.first  : 우선순위 순서로 호출, 처음으로 참(truthy)을 돌려준 값 반환(처리됨)
  // Mods.reduce : 값을 차례로 넘겨 바꾸게 함(undefined 반환 시 그대로)
  const hooks = Object.create(null);
  const modules = [];
  const byName = Object.create(null);
  let currentMod = null;

  function report(ev, entry, e) {
    entry.errors = (entry.errors || 0) + 1;
    if (entry.errors <= 5) {
      console.error(`[SD 훅 오류] ${ev}${entry.mod ? ' @' + entry.mod : ''}:`, e);
      if (entry.errors === 5) console.error(`[SD] ${ev}${entry.mod ? ' @' + entry.mod : ''} 오류가 반복되어 이후 로그를 생략합니다.`);
    }
  }

  const Mods = (SD.Mods = {
    list: modules,
    on(ev, fn, opts) {
      if (typeof fn !== 'function') throw new Error('Mods.on: 함수가 필요합니다 (' + ev + ')');
      const o = opts || {};
      const entry = { fn, pri: o.priority || 0, mod: o.mod || currentMod, errors: 0 };
      const arr = hooks[ev] || (hooks[ev] = []);
      arr.push(entry);
      arr.sort((a, b) => b.pri - a.pri);
      return () => Mods.off(ev, fn);
    },
    once(ev, fn, opts) {
      const off = Mods.on(ev, (...a) => { off(); return fn(...a); }, opts);
      return off;
    },
    off(ev, fn) {
      const arr = hooks[ev];
      if (!arr) return;
      const i = arr.findIndex((e) => e.fn === fn);
      if (i >= 0) arr.splice(i, 1);
    },
    has(ev) { return !!(hooks[ev] && hooks[ev].length); },
    emit(ev, ...args) {
      const arr = hooks[ev];
      if (!arr || !arr.length) return;
      for (const entry of arr.slice()) {
        try { entry.fn(...args); } catch (e) { report(ev, entry, e); }
      }
    },
    first(ev, ...args) {
      const arr = hooks[ev];
      if (!arr || !arr.length) return undefined;
      for (const entry of arr.slice()) {
        try {
          const r = entry.fn(...args);
          if (r) return r;
        } catch (e) { report(ev, entry, e); }
      }
      return undefined;
    },
    reduce(ev, value, ...args) {
      const arr = hooks[ev];
      if (!arr || !arr.length) return value;
      let v = value;
      for (const entry of arr.slice()) {
        try {
          const r = entry.fn(v, ...args);
          if (r !== undefined) v = r;
        } catch (e) { report(ev, entry, e); }
      }
      return v;
    },
    // 안전 호출: 모듈 콜백 하나를 try/catch로 감싸 실행
    safe(label, fn, ...args) {
      try { return fn(...args); } catch (e) { console.error('[SD 오류] ' + label + ':', e); return undefined; }
    },

    // ── 모듈 레지스트리 ──
    // def = { name, init(SD), newGame(state, G), save(state) → json, load(json) → state,
    //         hooks: { 이벤트: 함수 } }
    register(def) {
      if (!def || !def.name) { console.error('[SD] 모듈 이름이 필요합니다', def); return null; }
      if (byName[def.name]) { console.error('[SD] 모듈 중복 등록: ' + def.name); return byName[def.name]; }
      byName[def.name] = def;
      modules.push(def);
      def._inited = false;
      if (SD._booted) Mods._initModule(def);
      return def;
    },
    get(name) { return byName[name] || null; },
    // 현재 게임에서 모듈 상태 객체 (G.mods[name]) — 없으면 만든다
    state(name) {
      const G = SD.G;
      if (!G) return null;
      if (!G.mods) G.mods = {};
      if (!G.mods[name]) G.mods[name] = {};
      return G.mods[name];
    },
    _initModule(def) {
      if (def._inited) return;
      def._inited = true;
      currentMod = def.name;
      try {
        if (def.hooks) for (const ev of Object.keys(def.hooks)) Mods.on(ev, def.hooks[ev].bind(def), { mod: def.name });
        if (def.init) def.init(SD);
      } catch (e) {
        console.error('[SD] 모듈 초기화 실패: ' + def.name, e);
      } finally {
        currentMod = null;
      }
    },
    _initAll() { for (const def of modules) Mods._initModule(def); },
    // 새 게임: 각 모듈의 초기 상태
    _newGame(G) {
      G.mods = G.mods || {};
      for (const def of modules) {
        try {
          const init = def.newGame ? def.newGame(G) : undefined;
          G.mods[def.name] = init !== undefined ? init : (G.mods[def.name] || {});
        } catch (e) { console.error('[SD] 모듈 newGame 실패: ' + def.name, e); G.mods[def.name] = {}; }
      }
    },
    _save(G) {
      const out = {};
      for (const name of Object.keys(G.mods || {})) {
        const def = byName[name];
        try { out[name] = def && def.save ? def.save(G.mods[name], G) : G.mods[name]; } catch (e) { console.error('[SD] 모듈 저장 실패: ' + name, e); }
      }
      return out;
    },
    _load(G, data) {
      G.mods = {};
      const src = data || {};
      for (const def of modules) {
        try {
          if (src[def.name] === undefined) {
            const init = def.newGame ? def.newGame(G) : undefined;
            G.mods[def.name] = init !== undefined ? init : {};
          } else {
            G.mods[def.name] = def.load ? def.load(src[def.name], G) : src[def.name];
          }
        } catch (e) { console.error('[SD] 모듈 불러오기 실패: ' + def.name, e); G.mods[def.name] = {}; }
      }
      // 등록되지 않은(삭제된) 모듈 데이터는 그대로 보존
      for (const name of Object.keys(src)) if (!(name in G.mods)) G.mods[name] = src[name];
    },
  });

  // ───────────── 간단한 타입 레지스트리 도우미 ─────────────
  // registry('objects') 같은 이름 공간: define(id, def), get(id), all()
  SD.makeRegistry = function (label) {
    const map = Object.create(null);
    const order = [];
    return {
      label,
      define(id, def) {
        if (!id) throw new Error(label + ': id 필요');
        if (!map[id]) order.push(id);
        def.id = id;
        map[id] = def;
        return def;
      },
      extend(id, patch) {
        if (!map[id]) throw new Error(label + ': 없는 id ' + id);
        Object.assign(map[id], patch);
        return map[id];
      },
      get(id) { return map[id] || null; },
      has(id) { return !!map[id]; },
      all() { return order.map((id) => map[id]); },
      ids() { return order.slice(); },
    };
  };
})();
