'use strict';
// ════════════════════════════════════════════════════════════════════
//  아이템 레지스트리 · 분류(색 라벨) · 품질 · 도구 레지스트리 · 인벤토리(36칸)
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;

  // ───────────── 분류 (툴팁 색 라벨) ─────────────
  // ship: 하루 정산 표에서 들어갈 묶음 (farming / foraging / fishing / mining / other)
  SD.CATEGORIES = {
    vegetable: { name: '채소', color: '#2e8b2a', ship: 'farming' },
    fruit: { name: '과일', color: '#d6246e', ship: 'farming' },
    flower: { name: '꽃', color: '#b23cc0', ship: 'farming' },
    forage: { name: '채집', color: '#1f8a4c', ship: 'foraging' },
    animal: { name: '동물 생산물', color: '#d2386a', ship: 'farming' },
    artisan: { name: '장인 제품', color: '#13957a', ship: 'farming' },
    fish: { name: '물고기', color: '#1d4fb3', ship: 'fishing' },
    mineral: { name: '광물', color: '#7a1f6e', ship: 'mining' },
    gem: { name: '보석', color: '#7a1f6e', ship: 'mining' },
    ore: { name: '광석', color: '#4f6670', ship: 'mining' },
    bar: { name: '주괴', color: '#4f6670', ship: 'mining' },
    resource: { name: '자원', color: '#4f6670', ship: 'other' },
    cooking: { name: '요리', color: '#c8461a', ship: 'other' },
    seed: { name: '씨앗', color: '#8a5a2a', ship: 'other' },
    fertilizer: { name: '비료', color: '#7a6a2a', ship: 'other' },
    crafting: { name: '제작', color: '#3a6ab0', ship: 'other' },
    tool: { name: '도구', color: '#5a5a5a', ship: 'other' },
    weapon: { name: '무기', color: '#7a3a1a', ship: 'other' },
    monster: { name: '몬스터 전리품', color: '#5a2a6a', ship: 'mining' },
    bait: { name: '미끼', color: '#8a4a2a', ship: 'fishing' },
    tackle: { name: '낚시 도구', color: '#4a4a8a', ship: 'fishing' },
    trash: { name: '쓰레기', color: '#6a6a6a', ship: 'other' },
    artifact: { name: '유물', color: '#8a6a2a', ship: 'other' },
    furniture: { name: '가구', color: '#8a5a2a', ship: 'other' },
    ring: { name: '반지', color: '#8a2a8a', ship: 'other' },
    misc: { name: '기타', color: '#5a5a5a', ship: 'other' },
  };
  SD.SHIP_GROUPS = [
    { id: 'farming', name: '농사' },
    { id: 'foraging', name: '채집' },
    { id: 'fishing', name: '낚시' },
    { id: 'mining', name: '광산' },
    { id: 'other', name: '기타' },
  ];

  // ───────────── 품질 ─────────────
  SD.QUALITY = [
    { id: 0, name: '보통', mult: 1, color: null },
    { id: 1, name: '은별', mult: 1.25, color: '#c9d3dc' },
    { id: 2, name: '금별', mult: 1.5, color: '#ffcf2e' },
    { id: 3, name: '이리듐별', mult: 2, color: '#b06cf0' },
  ];

  // ───────────── 아이템 ─────────────
  // def = { name, cat, price(판매가), edible(먹을 수 있으면 원작 식용도 수치), stack(기본 999),
  //         desc, sprite: canvas | () => canvas, crop, seedOf, tool, onUse(ctx), place(ctx) ... }
  const reg = SD.makeRegistry('items');
  const Items = (SD.Items = {
    reg,
    define(id, def) {
      const d = Object.assign({ cat: 'misc', price: 0, stack: 999, desc: '' }, def);
      return reg.define(id, d);
    },
    get(id) { return reg.get(id); },
    has(id) { return reg.has(id); },
    all() { return reg.all(); },
    extend(id, patch) { return reg.extend(id, patch); },
    // 아이콘 (16×16 캔버스)
    icon(idOrStack) {
      const st = typeof idOrStack === 'string' ? { id: idOrStack } : idOrStack;
      if (!st) return null;
      const def = reg.get(st.id);
      if (!def) return Items.missingIcon();
      if (def.tool && SD.Tools.get(def.tool)) return SD.Tools.icon(def.tool, st.lvl || 0);
      if (def.iconFor) return def.iconFor(st);
      if (!def._icon) {
        try {
          def._icon = typeof def.sprite === 'function' ? def.sprite(def) : def.sprite;
        } catch (e) { console.error('[SD] 아이콘 생성 실패: ' + st.id, e); }
        if (!def._icon) def._icon = Items.missingIcon();
      }
      return def._icon;
    },
    missingIcon() {
      return SD.gfx.cached('item:missing', () => {
        const c = SD.gfx.canvas(16, 16);
        const g = SD.gfx.ctx(c);
        g.fillStyle = '#ff00ff'; g.fillRect(3, 3, 10, 10);
        g.fillStyle = '#000'; g.fillRect(3, 3, 5, 5); g.fillRect(8, 8, 5, 5);
        return c;
      });
    },
    name(st) {
      if (!st) return '';
      const id = typeof st === 'string' ? st : st.id;
      const def = reg.get(id);
      if (!def) return id;
      if (def.tool && typeof st === 'object') return SD.Tools.displayName(def.tool, st.lvl || 0);
      if (def.nameFor && typeof st === 'object') return def.nameFor(st);
      return def.name;
    },
    category(id) {
      const def = reg.get(typeof id === 'string' ? id : id.id);
      return SD.CATEGORIES[def && def.cat] || SD.CATEGORIES.misc;
    },
    // 판매가 (품질 반영, 훅 'sellPrice' 로 수정 가능)
    sellPrice(st) {
      const def = reg.get(st.id);
      if (!def) return 0;
      const base = def.priceFor ? def.priceFor(st) : def.price || 0;
      const q = SD.QUALITY[st.q || 0] || SD.QUALITY[0];
      return Math.floor(SD.Mods.reduce('sellPrice', Math.floor(base * q.mult), st, def));
    },
    canSell(st) {
      const def = reg.get(st.id);
      return !!(def && def.price > 0 && !def.tool && def.cat !== 'tool' && !def.noSell);
    },
    // 원작 공식: 기력 = 식용도×2.5 (+품질×식용도), 체력 = 기력×0.45
    energyOf(st) {
      const def = reg.get(st.id);
      if (!def || def.edible == null || def.edible <= -300) return null;
      const q = st.q || 0;
      const e = Math.ceil(def.edible * 2.5 + (def.edible > 0 ? q * def.edible : 0));
      return { energy: e, health: e > 0 ? Math.floor(e * 0.45) : 0 };
    },
    isEdible(st) { return Items.energyOf(st) != null; },
    stackSize(id) { const d = reg.get(id); return d ? (d.tool ? 1 : d.stack || 999) : 999; },
  });

  // ───────────── 도구 ─────────────
  SD.TOOL_LEVELS = [
    { id: 0, name: '', prefix: '', head: '#9a8f86', price: 0 },
    { id: 1, name: '구리', prefix: '구리 ', head: '#d5793a', price: 2000 },
    { id: 2, name: '강철', prefix: '강철 ', head: '#c4d0d8', price: 5000 },
    { id: 3, name: '금', prefix: '금 ', head: '#f2c029', price: 10000 },
    { id: 4, name: '이리듐', prefix: '이리듐 ', head: '#a565e6', price: 25000 },
  ];
  // def = { name, levels(최대 레벨, 기본 4), energy(기본 소모), skill, charge(꾹 눌러 범위),
  //         icon(level) → 16×16 캔버스, use(ctx) , anim: 'tool' | 'water' | 'swing' | 커스텀 }
  const toolReg = SD.makeRegistry('tools');
  SD.Tools = {
    reg: toolReg,
    define(id, def) {
      const d = Object.assign({ levels: 4, energy: 2, skill: 'farming', charge: false, anim: 'tool' }, def);
      toolReg.define(id, d);
      // 도구도 아이템이다
      if (!Items.has(id)) Items.define(id, { name: d.name, cat: d.cat || 'tool', price: 0, stack: 1, tool: id, desc: d.desc || '' });
      return d;
    },
    get(id) { return toolReg.get(id); },
    all() { return toolReg.all(); },
    displayName(id, lvl) {
      const d = toolReg.get(id);
      if (!d) return id;
      if (d.nameFor) return d.nameFor(lvl);
      return (SD.TOOL_LEVELS[lvl] ? SD.TOOL_LEVELS[lvl].prefix : '') + d.name;
    },
    icon(id, lvl) {
      const d = toolReg.get(id);
      if (!d || !d.icon) return Items.missingIcon();
      return SD.gfx.cached(`tool:${id}:${lvl || 0}`, () => d.icon(lvl || 0));
    },
    // 손에 든 모습 (손잡이가 긴 24×24). def.held(lvl) 가 없으면 아이콘을 쓴다
    heldIcon(id, lvl) {
      const d = toolReg.get(id);
      if (!d || !d.held) return null;
      return SD.gfx.cached(`toolheld:${id}:${lvl || 0}`, () => d.held(lvl || 0));
    },
    headColor(lvl) { return (SD.TOOL_LEVELS[lvl] || SD.TOOL_LEVELS[0]).head; },
    // 차지 단계별 범위: [가로, 세로] (앞쪽으로 뻗는 길이 기준) — 원작: 1, 3, 5, 3×3, 6×3
    chargeArea(level) {
      return [[1, 1], [1, 3], [1, 5], [3, 3], [3, 6]][U.clamp(level, 0, 4)];
    },
  };

  // ───────────── 인벤토리 ─────────────
  // G.inv: 36칸 배열, 칸 = { id, n, q, lvl?, water?, data? } | null
  // 툴바는 G.row 번째 줄(12칸)을 보여주고 G.sel 은 그 줄 안의 칸 번호
  const ROW = 12;
  const Inv = (SD.Inv = {
    SIZE: 36,
    ROW,
    slots() { return SD.G.inv; },
    get(i) { return SD.G.inv[i] || null; },
    set(i, st) { SD.G.inv[i] = st && st.n > 0 ? st : null; Inv.changed(); },
    changed() { SD.Mods.emit('inventoryChanged'); },
    selIndex() { return SD.G.row * ROW + SD.G.sel; },
    selected() { return SD.G.inv[Inv.selIndex()] || null; },
    select(slot) { SD.G.sel = ((slot % ROW) + ROW) % ROW; SD.Mods.emit('toolbarSelect', SD.G.sel); },
    cycleRow(d) {
      SD.G.row = (SD.G.row + (d || 1) + 3) % 3;
      SD.Mods.emit('toolbarSelect', SD.G.sel);
      SD.Sound.play('smallSelect');
    },
    unique(st) { return !!(st.lvl != null || st.data || Items.stackSize(st.id) === 1); },
    same(a, b) { return a && b && a.id === b.id && (a.q || 0) === (b.q || 0) && !Inv.unique(a) && !Inv.unique(b); },
    // 들어갈 수 있는 개수
    room(id, q, extra) {
      const max = Items.stackSize(id);
      const probe = Object.assign({ id, n: 1, q: q || 0 }, extra || {});
      let room = 0;
      for (const s of SD.G.inv) {
        if (!s) room += max;
        else if (Inv.same(s, probe)) room += Math.max(0, max - s.n);
      }
      return room;
    },
    canAdd(id, n, q, extra) { return Inv.room(id, q, extra) >= (n || 1); },
    // 넣고 남은 개수를 돌려준다. opts.silent: HUD 알림 없음
    add(id, n, q, extra, opts) {
      if (!Items.has(id)) { console.error('[SD] 없는 아이템: ' + id); return n || 1; }
      let left = n == null ? 1 : n;
      const qq = q || 0;
      const max = Items.stackSize(id);
      const probe = Object.assign({ id, n: 1, q: qq }, extra || {});
      const inv = SD.G.inv;
      const added = left;
      if (!Inv.unique(probe)) {
        for (let i = 0; i < inv.length && left > 0; i++) {
          const s = inv[i];
          if (s && Inv.same(s, probe) && s.n < max) {
            const k = Math.min(left, max - s.n);
            s.n += k; left -= k;
          }
        }
      }
      // 빈 칸: 현재 툴바 줄부터 채운다
      const order = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < ROW; c++) order.push(((SD.G.row + r) % 3) * ROW + c);
      order.sort((a, b) => a - b);
      for (const i of order) {
        if (left <= 0) break;
        if (!inv[i]) {
          const k = Math.min(left, max);
          inv[i] = Object.assign({}, probe, { n: k });
          if (extra && extra.data) inv[i].data = U.deepCopy(extra.data);
          left -= k;
        }
      }
      const got = added - left;
      if (got > 0) {
        const G = SD.G;
        G.stats.obtained = G.stats.obtained || {};
        const first = !G.stats.obtained[id];
        G.stats.obtained[id] = (G.stats.obtained[id] || 0) + got;
        SD.Mods.emit('itemAdded', id, got, qq, { silent: opts && opts.silent, first });
        if (first) SD.Mods.emit('firstObtain', id, qq);
        Inv.changed();
      }
      return left;
    },
    // 넣고, 못 넣은 건 플레이어 발밑에 떨어뜨린다
    give(id, n, q, extra, opts) {
      const left = Inv.add(id, n, q, extra, opts);
      if (left > 0 && SD.World && SD.World.current) {
        const p = SD.G.player;
        SD.World.dropItem(SD.World.current, p.x, p.y - 4, id, left, q, { noMagnetFor: 1.5, extra });
        SD.UI && SD.UI.hud && SD.UI.hud('가방이 꽉 찼어요!', { kind: 'error' });
      }
      return left;
    },
    count(id, q) {
      let n = 0;
      for (const s of SD.G.inv) if (s && s.id === id && (q == null || (s.q || 0) === q)) n += s.n;
      return n;
    },
    has(id, n) { return Inv.count(id) >= (n || 1); },
    remove(id, n, q) {
      let left = n == null ? 1 : n;
      const inv = SD.G.inv;
      // 품질 낮은 것부터
      const idx = [];
      for (let i = 0; i < inv.length; i++) if (inv[i] && inv[i].id === id && (q == null || (inv[i].q || 0) === q)) idx.push(i);
      idx.sort((a, b) => (inv[a].q || 0) - (inv[b].q || 0));
      for (const i of idx) {
        if (left <= 0) break;
        const k = Math.min(left, inv[i].n);
        inv[i].n -= k; left -= k;
        if (inv[i].n <= 0) inv[i] = null;
      }
      Inv.changed();
      return (n == null ? 1 : n) - left;
    },
    removeAt(i, n) {
      const s = SD.G.inv[i];
      if (!s) return 0;
      const k = Math.min(n == null ? s.n : n, s.n);
      s.n -= k;
      if (s.n <= 0) SD.G.inv[i] = null;
      Inv.changed();
      return k;
    },
    consumeSelected(n) { return Inv.removeAt(Inv.selIndex(), n == null ? 1 : n); },
    findTool(toolId) {
      const inv = SD.G.inv;
      for (let i = 0; i < inv.length; i++) if (inv[i] && inv[i].id === toolId) return inv[i];
      return null;
    },
    isFull() { return SD.G.inv.every((s) => !!s); },
    swap(a, b) { const inv = SD.G.inv; [inv[a], inv[b]] = [inv[b], inv[a]]; Inv.changed(); },
  });
})();
