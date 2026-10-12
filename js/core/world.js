'use strict';
// ════════════════════════════════════════════════════════════════════
//  다중 지역(Location) · ASCII 지도 · 워프(페이드) · 충돌 · 바닥 아이템
//  모듈은 SD.World.define({...}) 로 지역을, SD.World.addWarp(지역, {...}) 로 길을 더한다.
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;
  const T = SD.TILE;

  // 기본 범례 (지역 정의의 legend 로 덮어쓸 수 있다)
  const DEFAULT_LEGEND = {
    '.': 'grass', 'p': 'dirt', ',': 'path', 'w': 'water', 'C': 'cliff', 's': 'stairs', 'T': 'forest',
    '#': 'void', 'f': 'floor', 'W': 'wall', 'B': 'wallBase', 'X': 'wallTop', 'm': 'mat',
  };

  // ───────────── Location ─────────────
  class Location {
    constructor(def) {
      this.id = def.id;
      this.def = def;
      this.name = def.name || def.id;
      this.outdoor = def.outdoor !== false;
      this.music = def.music || null;
      this.farm = !!def.farm;
      const rows = def.map || ['.'];
      this.h = rows.length;
      this.w = Math.max(...rows.map((r) => r.length));
      this.tiles = new Array(this.w * this.h);
      this.tileFlags = new Map();      // key → { solid, diggable, water, ... } (범례 덮어쓰기)
      const legend = Object.assign({}, DEFAULT_LEGEND, def.legend || {});
      this._spawnQueue = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const ch = rows[y][x] || ' ';
          let entry = legend[ch];
          if (entry === undefined) entry = ch === ' ' ? 'void' : 'grass';
          if (typeof entry === 'string') this.tiles[y * this.w + x] = entry;
          else {
            this.tiles[y * this.w + x] = entry.tile || 'grass';
            const flags = {};
            for (const k of ['solid', 'diggable', 'water', 'step', 'noSpawn']) if (k in entry) flags[k] = entry[k];
            if (Object.keys(flags).length) this.tileFlags.set(U.tk(x, y), flags);
            if (entry.then) this._spawnQueue.push([entry.then, x, y, ch]);
          }
        }
      }
      this.objects = new Map();   // 1칸 오브젝트 (돌·잡초·채집물·기계…)
      this.features = new Map();  // 지형 요소 (괭이흙+작물·풀·나무·바닥재)
      this.large = [];            // 여러 칸 (큰 그루터기·바위·덤불·건물·가구)
      this.items = [];            // 바닥에 떨어진 아이템
      this.chars = [];            // 캐릭터 (NPC·몬스터·동물)
      this.decor = [];            // 정적 장식 (숲 가장자리 나무 등, 저장 안 함)
      this.temp = [];             // 임시 스프라이트 (쓰러지는 나무 등)
      this.lights = (def.lights || []).map((l) => Object.assign({}, l));
      this.warps = (def.warps || []).map((w) => Object.assign({ w: 1, h: 1 }, w));
      this.state = {};
      this._largeIdx = null;
      this._chunks = new Map();
      this._chunkSeason = -1;
      for (const [fn, x, y, ch] of this._spawnQueue) SD.Mods.safe('legend.then ' + this.id, fn, this, x, y, ch);
      this._spawnQueue = null;
      for (const b of def.large || []) this.addLarge(Object.assign({ static: true }, U.deepCopy(b)));
      if (def.setup) SD.Mods.safe('setup ' + this.id, def.setup, this);
    }
    // ── 타일 ──
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    tileAt(x, y) { return this.inBounds(x, y) ? this.tiles[y * this.w + x] : 'void'; }
    tileDef(x, y) { return SD.Tiles.get(this.tileAt(x, y)) || SD.Tiles.get('void'); }
    tileProp(x, y, prop) {
      const f = this.tileFlags.get(U.tk(x, y));
      if (f && prop in f) return f[prop];
      const d = this.tileDef(x, y);
      return d ? d[prop] : undefined;
    }
    setTile(x, y, id) {
      if (!this.inBounds(x, y)) return;
      this.tiles[y * this.w + x] = id;
      this.invalidate(x, y);
    }
    invalidate(x, y) {
      if (x == null) { this._chunks.clear(); return; }
      const cs = SD.Render ? SD.Render.CHUNK : 16;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        this._chunks.delete(Math.floor((x + dx) / cs) + ',' + Math.floor((y + dy) / cs));
      }
    }
    isWater(x, y) { return !!this.tileProp(x, y, 'water'); }
    isDiggable(x, y) { return !!this.tileProp(x, y, 'diggable'); }
    stepSound(x, y) {
      const f = this.features.get(U.tk(x, y));
      if (f && f.t === 'flooring') return 'stone';
      return this.tileProp(x, y, 'step') || 'dirt';
    }
    // ── 오브젝트 ──
    objAt(x, y) { return this.objects.get(U.tk(x, y)) || null; }
    featAt(x, y) { return this.features.get(U.tk(x, y)) || null; }
    setObj(x, y, o) {
      o.x = x; o.y = y;
      this.objects.set(U.tk(x, y), o);
      return o;
    }
    removeObj(x, y) { const o = this.objects.get(U.tk(x, y)); this.objects.delete(U.tk(x, y)); return o || null; }
    setFeat(x, y, f) {
      f.x = x; f.y = y;
      this.features.set(U.tk(x, y), f);
      return f;
    }
    removeFeat(x, y) { const f = this.features.get(U.tk(x, y)); this.features.delete(U.tk(x, y)); return f || null; }
    addLarge(o) {
      o.w = o.w || (SD.ObjTypes.get(o.t) && SD.ObjTypes.get(o.t).w) || 2;
      o.h = o.h || (SD.ObjTypes.get(o.t) && SD.ObjTypes.get(o.t).h) || 2;
      this.large.push(o);
      this._largeIdx = null;
      return o;
    }
    removeLarge(o) {
      const i = this.large.indexOf(o);
      if (i >= 0) this.large.splice(i, 1);
      this._largeIdx = null;
    }
    // 큰 오브젝트 칸 색인: tk → [오브젝트들]
    largeIndex() {
      if (this._largeIdx) return this._largeIdx;
      const idx = new Map();
      for (const o of this.large) {
        for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) {
          const k = U.tk(x, y);
          if (!idx.has(k)) idx.set(k, []);
          idx.get(k).push(o);
        }
      }
      this._largeIdx = idx;
      return idx;
    }
    largeAt(x, y) {
      const arr = this.largeIndex().get(U.tk(x, y));
      return arr && arr.length ? arr[arr.length - 1] : null;
    }
    // 이 칸에 무엇이든 놓여 있는가 (풀은 제외 옵션)
    isOccupied(x, y, opts) {
      const o = opts || {};
      if (this.objects.has(U.tk(x, y))) return true;
      const f = this.features.get(U.tk(x, y));
      if (f && !(o.ignoreGrass && f.t === 'grass') && !(o.ignoreDirt && f.t === 'dirt' && !f.crop)) return true;
      if (this.largeAt(x, y)) return true;
      return false;
    }
    // 지나갈 수 있는 칸인가
    isPassable(x, y, who) {
      if (!this.inBounds(x, y)) return false;
      if (this.tileProp(x, y, 'solid')) return false;
      const k = U.tk(x, y);
      const o = this.objects.get(k);
      if (o && !SD.Obj.passable(o, who, this)) return false;
      const f = this.features.get(k);
      if (f && !SD.Obj.passable(f, who, this)) return false;
      const arr = this.largeIndex().get(k);
      if (arr) for (const L of arr) if (SD.Obj.blocks(L, x, y, who, this)) return false;
      return true;
    }
    // 사각형(월드 픽셀)이 막히는지
    rectBlocked(x0, y0, x1, y1, who) {
      const tx0 = Math.floor(x0 / T), ty0 = Math.floor(y0 / T), tx1 = Math.floor((x1 - 0.01) / T), ty1 = Math.floor((y1 - 0.01) / T);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.isPassable(tx, ty, who)) return { tx, ty };
      }
      for (const c of this.chars) {
        if (c === who || c.passable || !c.box) continue;
        const b = SD.Chars.box(c);
        if (x1 > b[0] && x0 < b[2] && y1 > b[1] && y0 < b[3]) return { char: c };
      }
      return null;
    }
    warpAt(x, y, actionOnly) {
      for (const w of this.warps) {
        if (!!w.action !== !!actionOnly) continue;
        if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) return w;
      }
      return null;
    }
    // ── 저장 ──
    serialize() {
      const keep = (o) => !o.static && SD.Obj.saveable(o);
      return {
        objects: [...this.objects.values()].filter(keep),
        features: [...this.features.values()].filter(keep),
        large: this.large.filter(keep),
        items: this.items.map((i) => ({ id: i.id, n: i.n, q: i.q, x: Math.round(i.x), y: Math.round(i.y), extra: i.extra })),
        chars: this.chars.filter((c) => SD.Chars.saveable(c)).map((c) => SD.Chars.serialize(c)),
        state: this.state,
        tiles: this._tileEdits || null,
      };
    }
    deserialize(d) {
      if (!d) return;
      this.objects.clear(); this.features.clear();
      this.large = this.large.filter((o) => o.static); this._largeIdx = null;
      for (const o of d.objects || []) if (SD.ObjTypes.has(o.t)) this.objects.set(U.tk(o.x, o.y), o);
      for (const f of d.features || []) if (SD.ObjTypes.has(f.t)) this.features.set(U.tk(f.x, f.y), f);
      for (const o of d.large || []) if (SD.ObjTypes.has(o.t)) this.addLarge(o);
      this.items = [];
      for (const it of d.items || []) if (SD.Items.has(it.id)) this.items.push(SD.World.makeDrop(it.x, it.y, it.id, it.n, it.q, { settled: true, extra: it.extra }));
      this.chars = [];
      for (const c of d.chars || []) { const ch = SD.Chars.deserialize(c, this); if (ch) this.chars.push(ch); }
      this.state = d.state || {};
      if (d.tiles) { this._tileEdits = d.tiles; for (const [k, id] of Object.entries(d.tiles)) this.setTile(U.kx(+k), U.ky(+k), id); }
    }
    // 저장되는 타일 변경 (모듈용)
    editTile(x, y, id) {
      this._tileEdits = this._tileEdits || {};
      this._tileEdits[U.tk(x, y)] = id;
      this.setTile(x, y, id);
    }
    // 빈 칸 무작위 (조건 함수)
    randomTile(rng, test, tries) {
      for (let i = 0; i < (tries || 200); i++) {
        const x = Math.floor(rng() * this.w), y = Math.floor(rng() * this.h);
        if (test(x, y)) return { x, y };
      }
      return null;
    }
    clearTile(x, y) {
      this.objects.delete(U.tk(x, y));
      this.features.delete(U.tk(x, y));
    }
  }
  SD.Location = Location;

  // ───────────── World ─────────────
  const defs = SD.makeRegistry('locations');
  const World = (SD.World = {
    defs,
    locs: {},
    current: null,
    transition: null,
    Location,
    define(def) {
      if (!def.id) throw new Error('World.define: id 필요');
      def.warps = def.warps || [];
      defs.define(def.id, def);
      if (SD.G && !World.locs[def.id]) World._create(def, true);
      return def;
    },
    exists(id) { return defs.has(id); },
    get(id) {
      if (World.locs[id]) return World.locs[id];
      const def = defs.get(id);
      if (!def) return null;
      return World._create(def, true);
    },
    all() { return Object.values(World.locs); },
    _create(def, isNew) {
      const loc = new Location(def);
      World.locs[def.id] = loc;
      if (isNew && def.populate) SD.Mods.safe('populate ' + def.id, def.populate, loc, U.mulberry32((SD.G ? SD.G.seed : 1) + def.id.length * 977));
      SD.Mods.emit('locationCreated', loc, isNew);
      return loc;
    },
    // 게임 시작 시 모든 지역 만들기 (불러오기면 저장된 상태 적용)
    createAll(saved) {
      World.locs = {};
      for (const def of defs.all()) {
        const loc = World._create(def, !saved || !saved[def.id]);
        if (saved && saved[def.id]) {
          try { loc.deserialize(saved[def.id]); } catch (e) { console.error('[SD] 지역 불러오기 실패 ' + def.id, e); }
          SD.Mods.emit('locationLoaded', loc);
        }
      }
    },
    // 지역 지우기 (광산 층처럼 매번 새로 만드는 지역)
    remove(id) {
      delete World.locs[id];
    },
    // 정의는 그대로 두고 상태만 새로 (다시 populate)
    reset(id) {
      const def = defs.get(id);
      if (!def) return null;
      return World._create(def, true);
    },
    serializeAll() {
      const out = {};
      for (const loc of World.all()) {
        if (loc.def.noSave) continue;
        try { out[loc.id] = loc.serialize(); } catch (e) { console.error('[SD] 지역 저장 실패 ' + loc.id, e); }
      }
      return out;
    },
    // 워프 추가: 정의와 (있으면) 실행 중 지역 모두에
    addWarp(locId, warp) {
      const w = Object.assign({ w: 1, h: 1 }, warp);
      const def = defs.get(locId);
      if (def) def.warps.push(w);
      if (World.locs[locId]) World.locs[locId].warps.push(Object.assign({}, w));
      return w;
    },
    // 기존 워프의 목적지 바꾸기 (예: 농장 동쪽 출구 → 'BusStop')
    retargetWarp(locId, match, patch) {
      const apply = (arr) => arr.filter((w) => w.to === match || w.id === match).forEach((w) => Object.assign(w, patch));
      const def = defs.get(locId);
      if (def) apply(def.warps);
      if (World.locs[locId]) apply(World.locs[locId].warps);
    },
    // 지역의 도착 지점: entries[출발지] → spawn → 가운데
    entryPoint(loc, fromId) {
      const e = (loc.def.entries && loc.def.entries[fromId]) || loc.def.spawn || { x: Math.floor(loc.w / 2), y: Math.floor(loc.h / 2), dir: 'down' };
      return e;
    },
    // 플레이어를 즉시 옮긴다 (페이드 없음)
    place(locId, tx, ty, dir) {
      const loc = World.get(locId);
      if (!loc) return false;
      const prev = World.current;
      if (prev && prev !== loc) {
        if (prev.def.onLeave) SD.Mods.safe('onLeave', prev.def.onLeave, prev);
        SD.Mods.emit('locationLeave', prev, loc);
      }
      World.current = loc;
      const p = SD.G.player;
      p.loc = loc.id;
      p.x = tx * T + 8;
      p.y = ty * T + 12;
      if (dir) p.dir = dir;
      if (SD.FX) SD.FX.clear();
      if (SD.Render) SD.Render.snapCamera();
      SD.Music.play(SD.Mods.reduce('locationMusic', loc.music, loc));
      if (prev !== loc) {
        if (loc.def.onEnter) SD.Mods.safe('onEnter', loc.def.onEnter, loc, prev);
        SD.Mods.emit('locationEnter', loc, prev);
      }
      return true;
    },
    // 페이드 워프. 목적지가 없으면 HUD 메시지
    warp(toId, tx, ty, dir, opts) {
      const o = opts || {};
      if (World.transition) return false;
      if (!World.exists(toId)) {
        const now = SD.Time ? SD.Time.real : 0;
        if (!World._lastBlocked || now - World._lastBlocked > 2) {
          World._lastBlocked = now;
          if (SD.UI && SD.UI.hud) SD.UI.hud(o.blockedMsg || '이 길은 아직 막혀 있어요. 곧 열릴 거예요!', { kind: 'error' });
          SD.Sound.play('error');
        }
        return false;
      }
      const from = World.current ? World.current.id : null;
      let x = tx, y = ty, d = dir;
      if (x == null || y == null) {
        const e = World.entryPoint(World.get(toId), from);
        x = e.x; y = e.y; d = d || e.dir;
      }
      if (o.sound !== false) SD.Sound.play(o.sound || 'door');
      World.transition = { phase: 'out', t: 0, dur: o.fast ? 0.12 : 0.25, to: toId, x, y, dir: d, cb: o.onArrive };
      return true;
    },
    // 페이드 진행 (main 루프가 부름). 반환: 화면을 덮는 검정 비율 0..1
    updateTransition(dt) {
      const tr = World.transition;
      if (!tr) return 0;
      tr.t += dt;
      if (tr.phase === 'out' && tr.t >= tr.dur) {
        World.place(tr.to, tr.x, tr.y, tr.dir);
        tr.phase = 'in'; tr.t = 0;
        if (tr.cb) SD.Mods.safe('warp.onArrive', tr.cb);
      } else if (tr.phase === 'in' && tr.t >= tr.dur) {
        World.transition = null;
        return 0;
      }
      return tr.phase === 'out' ? U.clamp(tr.t / tr.dur, 0, 1) : 1 - U.clamp(tr.t / tr.dur, 0, 1);
    },
    fadeAmount() {
      const tr = World.transition;
      if (!tr) return 0;
      return tr.phase === 'out' ? U.clamp(tr.t / tr.dur, 0, 1) : 1 - U.clamp(tr.t / tr.dur, 0, 1);
    },

    // ───────────── 바닥 아이템 ─────────────
    makeDrop(x, y, id, n, q, o) {
      const opts = o || {};
      const ang = opts.angle != null ? opts.angle : Math.random() * Math.PI * 2;
      const sp = opts.speed != null ? opts.speed : 20 + Math.random() * 30;
      return {
        id, n: n || 1, q: q || 0, x, y,
        z: opts.z != null ? opts.z : 6,
        vx: opts.settled ? 0 : Math.cos(ang) * sp,
        vy: opts.settled ? 0 : Math.sin(ang) * sp * 0.6,
        vz: opts.settled ? 0 : opts.vz != null ? opts.vz : 60 + Math.random() * 40,
        bounces: opts.settled ? 9 : 0,
        t: 0,
        noMagnet: opts.noMagnetFor != null ? opts.noMagnetFor : 0.45,
        magnet: false, mv: 0,
        extra: opts.extra || null,
      };
    },
    // 아이템을 바닥에 흩뿌린다 (n 개를 최대 8덩이로)
    dropItem(loc, x, y, id, n, q, opts) {
      if (!loc || !SD.Items.has(id)) return;
      let left = n == null ? 1 : n;
      const parts = Math.min(left, (opts && opts.parts) || 8);
      for (let i = 0; i < parts; i++) {
        const k = i === parts - 1 ? left : Math.max(1, Math.floor(left / (parts - i)));
        left -= k;
        loc.items.push(World.makeDrop(x, y, id, k, q, opts));
        if (left <= 0) break;
      }
    },
  });
})();
