'use strict';
// ════════════════════════════════════════════════════════════════════
//  작물(똥) 데이터 + 작물별 고유 모양 + 채집 똥
//  수치는 설계서 §4 (원작 수치). 모든 작물과 채집 식물은 똥이다.
//  SD.Crops.define(id, def) 로 모듈이 작물을 더 추가할 수 있다.
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const X = SD.gfx;
  const U = SD.util;
  const A = SD.Art;
  const Shp = A.Shp;
  const LEAF = A.LEAF;

  const reg = SD.makeRegistry('crops');
  const Crops = (SD.Crops = {
    reg,
    get: (id) => reg.get(id),
    all: () => reg.all(),
    ids: () => reg.ids(),
    // def: { name, seasons:[0..3], phases:[...], regrow:-1|일수, seedPrice, price, cat, edible,
    //        yield:{min, extra}, trellis, flower, giant, scythe, rare, tints:[색...], look:{...},
    //        seedName, seedDesc, desc, harvestItem(기본=id) }
    define(id, def) {
      const d = Object.assign({ seasons: [0], phases: [1, 1, 1, 1], regrow: -1, seedPrice: 0, price: 10, cat: 'vegetable', yield: { min: 1, extra: 0 } }, def);
      d.days = d.phases.reduce((a, b) => a + b, 0);
      reg.define(id, d);
      const seedId = d.seedId || id + '_seed';
      d.seedId = seedId;
      d.harvestItem = d.harvestItem || id;
      // 수확물 아이템
      if (!d.noItem && !SD.Items.has(d.harvestItem)) {
        SD.Items.define(d.harvestItem, {
          name: d.name, cat: d.cat, price: d.price, edible: d.edible, crop: id,
          desc: d.desc || '', sprite: () => Crops.icon(id),
        });
      }
      // 씨앗 아이템
      if (!SD.Items.has(seedId)) {
        const seasonTxt = d.seasons.length === 4 ? '사계절' : d.seasons.map((s) => SD.SEASON_NAMES[s]).join('·');
        SD.Items.define(seedId, {
          name: d.seedName || d.name + ' 씨앗', cat: 'seed', price: Math.floor((d.seedPrice || 20) / 2), seedOf: id, buyPrice: d.seedPrice,
          desc: d.seedDesc || `${seasonTxt}에 심는다. ${d.days}일 뒤 다 자란다.` + (d.regrow > 0 ? ` 그 뒤 ${d.regrow}일마다 또 열린다.` : '') + (d.trellis ? ' 지지대가 있어 지나갈 수 없다.' : ''),
          sprite: () => A.seedPile(d.look.seed || X.mix(d.look.color || '#8a5a2b', '#8a5a2b', 0.45), d.look.seedShape || 'round', id.length * 7 + 3),
        });
      }
      return d;
    },
    // 단계 수 = phases.length + 1 (마지막이 다 자란 상태)
    stageCount(id) { return reg.get(id).phases.length + 1; },
    // 스프라이트 (16×32). stage: 0..phases.length (마지막 = 다 자람). tint: 꽃 색 번호
    sprite(id, stage, tint) {
      const d = reg.get(id);
      const n = d.phases.length;
      const st = U.clamp(stage, 0, n);
      const ti = d.tints ? (tint || 0) % d.tints.length : 0;
      return X.cached(`crop:${id}:${st}:${ti}`, () => {
        try {
          if (st === 0) return A.seedStage(Object.assign({ seedColor: d.look.seed || X.mix(d.look.color, '#7a4a22', 0.55) }, d.look));
          if (st === n) {
            const S = new Shp(16, 32);
            d.look.mature(S, d.tints ? d.tints[ti] : null, d);
            return X.outline(S.render());
          }
          const look = Object.assign({}, d.look, { petal: d.tints ? d.tints[ti] : d.look.petal, seed: id.length });
          if (d.look.grow) {
            const S = new Shp(16, 32);
            d.look.grow(S, st / n, look);
            return X.outline(S.render());
          }
          return A.growStage(look, st / n);
        } catch (e) {
          console.error('[SD] 작물 그림 실패 ' + id + ' ' + st, e);
          return SD.Items.missingIcon();
        }
      });
    },
    // 재수확 대기 중(열매 없음) 모습 = 마지막 성장 단계
    regrowSprite(id, tint) { const d = reg.get(id); return Crops.sprite(id, d.phases.length - 1, tint); },
    icon(id) {
      const d = reg.get(id);
      return X.cached(`cropIcon:${id}`, () => {
        const S = new Shp(16, 16);
        try { d.look.icon(S, d.tints ? d.tints[0] : null, d); } catch (e) { console.error('[SD] 아이콘 실패 ' + id, e); }
        return X.outline(S.render());
      });
    },
  });

  // ───────────── 공용 몸통 모양 ─────────────
  const P = A.poopBody;
  const F = A.face;
  const ramp = A.poopRamp;
  const ball = (S, cx, cy, r, color, opts) => S.ellipse(cx, cy, r, r, ramp(color), Object.assign({ group: 'body', gloss: true }, opts), 2);
  // 기본 소용돌이 똥 (s: 크기 배율)
  function swirl(S, cx, by, color, s, opts) {
    const k = s || 1;
    const t = [[14, 6], [11, 4], [8, 4], [4, 3]].map(([w, h]) => [Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k))]);
    return P(S, cx, by, t, color, opts);
  }
  // 굽은 뿔 모양 (고추)
  function horn(S, x0, y0, ang, len, r0, r1, bend, color, opts) {
    const R = ramp(color);
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const a = ang + bend * t;
      pts.push([x0 + Math.cos(a) * len * t, y0 + Math.sin(a) * len * t, r0 + (r1 - r0) * t]);
    }
    return S.add((x, y) => pts.some(([px, py, r]) => Math.hypot(x + 0.5 - px, y + 0.5 - py) <= r), R, Object.assign({ group: 'body' }, opts));
  }
  function star(S, cx, cy, r0, r1, n, rot, color, opts) {
    const R = ramp(color);
    return S.add((x, y) => {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const a = Math.atan2(dy, dx) - rot;
      const k = (Math.cos(a * n) + 1) / 2;
      return Math.hypot(dx, dy) <= r1 + (r0 - r1) * Math.pow(k, 1.6);
    }, R, Object.assign({ group: 'body', gloss: true }, opts));
  }
  function cap(S, cx, y, w, ramp2) {
    const R = ramp2 || LEAF;
    S.leaf(cx, y, w * 0.6, Math.PI * 0.85, 1.2, R);
    S.leaf(cx, y, w * 0.6, Math.PI * 0.15, 1.2, R);
    S.leaf(cx, y, 2.5, -Math.PI / 2, 0.9, R);
  }
  function flies() { /* 파리·냄새는 실행 중 그린다 */ }
  void flies;

  const L2 = ['#a8e070', '#6cbf45', '#468f32', '#2f6a26'];
  const LB = ['#9fd8c8', '#5aa894', '#3a7d6c', '#265a4e'];
  const LP = ['#b8d080', '#7ea44c', '#5a7a34', '#3e5624'];
  const LR = ['#e08aa0', '#b04a6a', '#7a2a4a', '#561a34'];
  const GOLD = ['#f8e08a', '#e6b84a', '#b8862a', '#8a5e1a'];

  // ───────────── 작물 정의 (설계서 §4) ─────────────
  const C = (id, d) => Crops.define(id, d);

  // ── 봄 ──
  C('parsnip', {
    name: '파스닙똥', seasons: [0], phases: [1, 1, 1, 1], seedPrice: 20, price: 35, edible: 10,
    desc: '봄의 첫 똥. 은은한 흙냄새가 난다. 초보 농부의 친구.',
    look: {
      color: '#e2c48a', seed: '#d6b878',
      mature(S) {
        A.tuft(S, 9, 15, 6, L2, 3, 0.5);
        const t = swirl(S, 8, 28, '#e2c48a', 1, { tipDir: 1 });
        F(S, 8, t[0].top + 1);
      },
      icon(S) {
        A.tuft(S, 9, 4, 4, L2, 3, 0.5);
        const t = swirl(S, 8, 14, '#e2c48a', 0.85);
        F(S, 8, t[0].top + 1, { small: true });
      },
    },
  });
  C('green_bean', {
    name: '그린빈똥', seasons: [0], phases: [1, 1, 1, 3, 4], regrow: 3, seedPrice: 60, price: 40, edible: 10, trellis: true,
    seedName: '그린빈똥 모종', desc: '지지대를 타고 주렁주렁 열리는 길쭉한 초록 똥.',
    look: {
      kind: 'trellis', color: '#5cb04a', seed: '#a8c870', seedShape: 'big',
      mature(S) {
        A.trellis(S, 26);
        A.vine(S, 28, 6, L2, 3);
        const bean = (x, y, h) => P(S, x, y, [[3, h], [2, 2]], '#6cc04e', { tip: false, overlap: 0 });
        bean(4, 21, 7); bean(12, 17, 7);
        const b = bean(5, 12, 6);
        S.pixels([[10, 9], [11, 10], [3, 17]], '#ffffff');
        F(S, 4.5, 16, { small: true });
        void b;
      },
      icon(S) {
        const b = P(S, 6, 14, [[4, 10], [3, 2]], '#6cc04e', { tip: false, overlap: 0, pw: 2.2 });
        P(S, 10, 13, [[4, 9], [3, 2]], '#5cb04a', { tip: false, overlap: 0 });
        F(S, 6.5, b[0].top + 3, { small: true });
      },
    },
  });
  C('cauliflower', {
    name: '콜리플라워똥', seasons: [0], phases: [1, 2, 4, 4, 1], seedPrice: 80, price: 175, edible: 30, giant: true,
    desc: '하얗고 뭉실뭉실한 고급 똥. 오래 기다린 보람이 있다.',
    look: {
      color: '#f1e6c4', seed: '#e8dcb8',
      mature(S) {
        A.broadLeaves(S, 8, 27, 8, L2);
        const t = P(S, 8, 27, [[15, 9], [11, 4], [6, 3]], '#f4ead0', { tex: A.tex.lumpy('#fffaf0'), tip: false, pw: 2.2 });
        S.leaf(2, 27, 5, -Math.PI * 0.25, 2, L2);
        S.leaf(14, 27, 5, -Math.PI * 0.75, 2, L2);
        F(S, 8, t[0].top + 3);
      },
      icon(S) {
        S.leaf(2, 14, 5, -Math.PI * 0.2, 2, L2);
        S.leaf(14, 14, 5, -Math.PI * 0.8, 2, L2);
        const t = P(S, 8, 14, [[14, 8], [10, 4], [5, 2]], '#f4ead0', { tex: A.tex.lumpy('#fffaf0'), tip: false, pw: 2.2 });
        F(S, 8, t[0].top + 3, { small: true });
      },
    },
  });
  C('potato', {
    name: '감자똥', seasons: [0], phases: [1, 1, 1, 2, 1], seedPrice: 50, price: 80, edible: 10, yield: { min: 1, extra: 0.2 },
    desc: '포슬포슬한 감자 같은 똥. 운이 좋으면 두 덩이가 나온다.',
    look: {
      color: '#c79a62', seed: '#b88a52', seedShape: 'big',
      mature(S) {
        A.tuft(S, 8, 19, 7, L2, 5, 0.7);
        S.pixels([[5, 11], [11, 10]], '#f0e8ff');
        const t = P(S, 8, 28, [[14, 8], [9, 3]], '#c99c64', { tex: A.tex.spots('#9a6e3e', 4), tip: false, pw: 2.1 });
        F(S, 8, t[0].top + 2);
      },
      icon(S) {
        const t = P(S, 8, 14, [[14, 9], [9, 3]], '#c99c64', { tex: A.tex.spots('#9a6e3e', 4), tip: false, pw: 2.1 });
        F(S, 8, t[0].top + 3, { small: true });
      },
    },
  });
  C('kale', {
    name: '케일똥', seasons: [0], phases: [1, 2, 2, 1], seedPrice: 70, price: 110, edible: 20,
    desc: '곱슬곱슬한 잎에 싸인 청록색 똥. 몸에 좋다(고 한다).',
    look: {
      color: '#5f9a6a', kind: 'leafy', leafRamp: LB,
      mature(S) {
        for (let i = 0; i < 6; i++) S.leaf(8 + (i - 2.5), 26, 9, -Math.PI / 2 + (i - 2.5) * 0.45, 2.6, i % 2 ? LB : LEAF);
        const t = swirl(S, 8, 28, '#6aa878', 0.8, { tex: A.tex.scales('#4a7a58') });
        F(S, 8, t[0].top + 1, { small: true });
      },
      icon(S) {
        for (let i = 0; i < 4; i++) S.leaf(8 + (i - 1.5), 12, 7, -Math.PI / 2 + (i - 1.5) * 0.5, 2.2, LB);
        const t = swirl(S, 8, 15, '#6aa878', 0.75, { tex: A.tex.scales('#4a7a58') });
        F(S, 8, t[0].top + 1, { small: true });
      },
    },
  });
  C('garlic', {
    name: '마늘똥', seasons: [0], phases: [1, 1, 1, 1], seedPrice: 40, price: 60, edible: 8,
    desc: '알싸한 냄새가 두 배인 하얀 똥. 뱀파이어가 싫어한다.',
    look: {
      color: '#f0eadc', seed: '#e8e0cc', seedShape: 'big',
      mature(S) {
        S.leaf(7, 19, 12, -Math.PI * 0.58, 1, L2);
        S.leaf(9, 19, 12, -Math.PI * 0.42, 1, L2);
        S.leaf(8, 19, 10, -Math.PI * 0.5, 1, L2);
        const t = P(S, 8, 28, [[13, 6], [9, 4], [5, 3], [2, 3]], '#f2ecdf', { tex: A.tex.stripes('#d8c8d8', 7), tip: false });
        F(S, 8, t[0].top + 1);
      },
      icon(S) {
        const t = P(S, 8, 15, [[13, 6], [9, 4], [5, 3], [2, 3]], '#f2ecdf', { tex: A.tex.stripes('#d8c8d8', 7), tip: false });
        S.stem(8, t[3].top, 9, 1, '#6cbf45');
        F(S, 8, t[0].top + 1, { small: true });
      },
    },
  });
  C('tulip', {
    name: '튤립똥', seasons: [0], phases: [1, 1, 2, 2], seedPrice: 20, price: 30, edible: 18, cat: 'flower', flower: true,
    seedName: '튤립똥 알뿌리', tints: ['#e8423a', '#f2c230', '#f07ab8', '#9a5ad8', '#f8f0f0'],
    desc: '꽃잎에 폭 싸인 귀여운 똥. 봄바람에 살랑인다.',
    look: {
      kind: 'flower', color: '#e8423a', seed: '#a8743e', seedShape: 'big',
      mature(S, tint) {
        const c = tint || '#e8423a';
        S.stem(8, 28, 8, 15, '#3d8a2c');
        S.leaf(8, 27, 9, -Math.PI * 0.62, 2, L2);
        S.leaf(9, 26, 8, -Math.PI * 0.34, 2, L2);
        S.ellipse(5, 10, 2.4, 4.5, ramp(X.light(c, 0.15)), { group: 'petal' });
        S.ellipse(11, 10, 2.4, 4.5, ramp(X.light(c, 0.15)), { group: 'petal' });
        const t = P(S, 8, 15, [[8, 5], [6, 3], [3, 2]], c, {});
        S.ellipse(5, 12.5, 1.6, 2.5, ramp(X.light(c, 0.1)), { group: 'petal2' });
        S.ellipse(11, 12.5, 1.6, 2.5, ramp(X.light(c, 0.1)), { group: 'petal2' });
        F(S, 8, t[0].top + 1, { small: true });
      },
      icon(S, tint) {
        const c = tint || '#e8423a';
        S.stem(8, 15, 8, 11, '#3d8a2c');
        S.ellipse(4.5, 6, 2.4, 4.5, ramp(X.light(c, 0.15)), { group: 'petal' });
        S.ellipse(11.5, 6, 2.4, 4.5, ramp(X.light(c, 0.15)), { group: 'petal' });
        const t = P(S, 8, 12, [[9, 6], [6, 3], [3, 2]], c, {});
        F(S, 8, t[0].top + 1, { small: true });
      },
    },
  });
  C('blue_jazz', {
    name: '블루재즈똥', seasons: [0], phases: [1, 2, 2, 2], seedPrice: 30, price: 50, edible: 18, cat: 'flower', flower: true,
    tints: ['#4f7fe0', '#5ac0e8', '#8a6ae0', '#e0e8ff'],
    desc: '동글동글 파란 꽃술 똥. 재즈 음악을 좋아한다.',
    look: {
      kind: 'flower', color: '#4f7fe0', seed: '#5a6aa0',
      mature(S, tint) {
        const c = tint || '#4f7fe0';
        S.stem(8, 28, 8, 15, '#3d8a2c');
        S.leaf(8, 25, 6, -Math.PI * 0.85, 1.6, L2);
        S.leaf(9, 23, 6, -Math.PI * 0.15, 1.6, L2);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          S.ellipse(8 + Math.cos(a) * 5, 11 + Math.sin(a) * 4.5, 1.8, 1.8, ramp(X.light(c, 0.3)), { group: 'petal' });
        }
        ball(S, 8, 11, 4.2, c);
        F(S, 8, 10, { small: true });
      },
      icon(S, tint) {
        const c = tint || '#4f7fe0';
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          S.ellipse(8 + Math.cos(a) * 5.2, 8 + Math.sin(a) * 5.2, 1.9, 1.9, ramp(X.light(c, 0.3)), { group: 'petal' });
        }
        ball(S, 8, 8, 4.4, c);
        F(S, 8, 7, { small: true });
      },
    },
  });
  C('strawberry', {
    name: '딸기똥', seasons: [0], phases: [1, 1, 2, 2, 2], regrow: 4, seedPrice: 100, price: 120, edible: 20, cat: 'fruit', yield: { min: 1, extra: 0.02 },
    desc: '새콤달콤한 향이 나는 빨간 똥. 따도 따도 또 열린다.',
    look: {
      color: '#e8384a', seed: '#d86a5a', kind: 'bush',
      mature(S) {
        A.tuft(S, 8, 27, 8, L2, 6, 0.95);
        const sh = (cx, by, k) => {
          const t = P(S, cx, by, [[Math.round(7 * k), Math.round(3 * k) + 1], [Math.round(11 * k), Math.round(5 * k)], [Math.round(7 * k), 3]], '#ea3c4e', { tex: A.tex.seeds('#ffe27a', 2), tip: false, overlap: 1 });
          cap(S, cx, t[2].top + 1, 6);
          return t;
        };
        sh(4, 22, 0.6);
        const t = sh(9, 28, 1);
        F(S, 9, t[1].top + 1, { small: true });
      },
      icon(S) {
        const t = P(S, 8, 15, [[7, 3], [12, 6], [8, 3]], '#ea3c4e', { tex: A.tex.seeds('#ffe27a', 2), tip: false });
        cap(S, 8, t[2].top + 1, 7);
        F(S, 8, t[1].top + 1, { small: true });
      },
    },
  });
  C('rhubarb', {
    name: '대황똥', seasons: [0], phases: [2, 2, 2, 3, 4], seedPrice: 100, price: 220, edible: -300, cat: 'fruit', shopNote: '사막 상점',
    desc: '길쭉하게 솟은 분홍 줄기 똥. 너무 시어서 그냥은 못 먹는다.',
    look: {
      color: '#e05a7a', seed: '#a87a5a', seedShape: 'flat',
      mature(S) {
        S.leaf(8, 10, 8, Math.PI * 1.1, 4, L2);
        S.leaf(8, 10, 8, -Math.PI * 0.1, 4, L2);
        S.leaf(8, 9, 6, -Math.PI * 0.5, 3, L2);
        P(S, 5, 28, [[4, 14], [3, 3]], '#d84a6a', { tip: false, overlap: 0, pw: 3 });
        P(S, 11, 28, [[4, 12], [3, 3]], '#d84a6a', { tip: false, overlap: 0, pw: 3 });
        const t = P(S, 8, 28, [[5, 16], [3, 3]], '#e8607e', { tip: false, overlap: 0, pw: 3 });
        F(S, 8, t[0].top + 6, { small: true });
      },
      icon(S) {
        P(S, 5, 15, [[4, 12], [3, 2]], '#d84a6a', { tip: false, overlap: 0, pw: 3 });
        const t = P(S, 10, 15, [[5, 14], [3, 2]], '#e8607e', { tip: false, overlap: 0, pw: 3 });
        S.leaf(9, 2, 5, Math.PI * 0.9, 2, L2);
        F(S, 10, t[0].top + 5, { small: true });
      },
    },
  });

  // ── 여름 ──
  C('blueberry', {
    name: '블루베리똥', seasons: [1], phases: [1, 3, 3, 4, 2], regrow: 4, seedPrice: 80, price: 50, edible: 10, cat: 'fruit', yield: { min: 3, extra: 0.02 },
    desc: '한 번에 세 덩이씩 쏟아지는 파란 똥. 여름 효자.',
    look: {
      color: '#4a62d0', seed: '#5a5a8a', kind: 'bush',
      mature(S) {
        S.ellipse(8, 21, 7.5, 7, LEAF, { group: 'leaf' }, 2.2);
        A.tuft(S, 8, 27, 6, L2, 4, 0.9);
        const berry = (x, by, k) => P(S, x, by, [[Math.round(6 * k), Math.round(4 * k)], [Math.round(4 * k), 2]], '#5068d8', { tip: true });
        berry(4, 19, 1); berry(12, 17, 1); berry(10, 26, 1.1);
        const t = berry(5, 27, 1.2);
        F(S, 5, t[0].top + 1, { small: true, mouth: false });
      },
      icon(S) {
        const b = (x, by, k) => P(S, x, by, [[Math.round(7 * k), Math.round(5 * k)], [Math.round(4 * k), 2]], '#5068d8', { tip: true });
        b(5, 9, 0.9); b(11, 10, 0.9);
        const t = b(8, 15, 1.2);
        F(S, 8, t[0].top + 2, { small: true });
      },
    },
  });
  C('melon', {
    name: '멜론똥', seasons: [1], phases: [1, 2, 3, 3, 3], seedPrice: 80, price: 250, edible: 45, cat: 'fruit', giant: true,
    desc: '줄무늬가 선명한 초록 똥. 여름 축제의 주인공.',
    look: {
      color: '#7cc858', seed: '#e8e0b0', seedShape: 'flat',
      mature(S) {
        S.leaf(2, 22, 6, -Math.PI * 0.7, 2.6, L2);
        S.leaf(14, 21, 6, -Math.PI * 0.3, 2.6, L2);
        const t = P(S, 8, 28, [[16, 10], [10, 4], [5, 2]], '#86cc5c', { tex: A.tex.stripes('#4f9a3a', 10), pw: 2.2 });
        F(S, 8, t[0].top + 3);
      },
      icon(S) {
        const t = P(S, 8, 15, [[15, 9], [10, 4], [5, 2]], '#86cc5c', { tex: A.tex.stripes('#4f9a3a', 10), pw: 2.2 });
        F(S, 8, t[0].top + 3, { small: true });
      },
    },
  });
  C('tomato', {
    name: '토마토똥', seasons: [1], phases: [2, 2, 2, 2, 3], regrow: 4, seedPrice: 50, price: 60, edible: 8, yield: { min: 1, extra: 0.05 },
    desc: '탱글탱글 빨간 똥. 지지대 옆에 주렁주렁.',
    look: {
      color: '#e8402e', seed: '#e8c060', seedShape: 'flat',
      grow(S, p) {
        S.add((x, y) => x === 12 && y >= 6 && y <= 28, ['#d89a55', '#a8692e', '#7a4a22', '#553014'], { group: 'wood' });
        A.tuft(S, 7, 28, 4 + p * 8, L2, 5, 0.8);
      },
      mature(S) {
        S.add((x, y) => x === 12 && y >= 4 && y <= 28, ['#d89a55', '#a8692e', '#7a4a22', '#553014'], { group: 'wood' });
        A.tuft(S, 7, 28, 12, L2, 6, 0.85);
        const tom = (x, by, k) => {
          const t = P(S, x, by, [[Math.round(8 * k), Math.round(6 * k)], [Math.round(5 * k), 2]], '#ec4430', { tip: false });
          cap(S, x, t[1].top + 1, 5);
          return t;
        };
        tom(4, 17, 0.8); tom(11, 21, 0.8);
        const t = tom(7, 28, 1.05);
        F(S, 7, t[0].top + 2, { small: true });
      },
      icon(S) {
        const t = P(S, 8, 15, [[13, 10], [7, 2]], '#ec4430', { tip: false, pw: 2.1 });
        cap(S, 8, t[1].top + 1, 7);
        F(S, 8, t[0].top + 3, { small: true });
      },
    },
  });
  C('hot_pepper', {
    name: '고추똥', seasons: [1], phases: [1, 1, 1, 1, 1], regrow: 3, seedPrice: 40, price: 40, edible: 5, cat: 'fruit', yield: { min: 1, extra: 0.03 },
    desc: '보기만 해도 매운 빨간 똥. 금방 자라고 금방 또 열린다.',
    look: {
      color: '#e2302a', seed: '#e8d090', seedShape: 'flat', kind: 'bush',
      mature(S) {
        A.tuft(S, 8, 27, 9, L2, 6, 0.9);
        horn(S, 5, 14, Math.PI * 0.55, 10, 2.3, 0.6, 0.6, '#e8342c');
        horn(S, 11, 16, Math.PI * 0.42, 10, 2.6, 0.7, -0.5, '#e8342c');
        cap(S, 5, 14, 4); cap(S, 11, 16, 4);
        F(S, 10.5, 19, { small: true, mouth: false });
      },
      icon(S) {
        horn(S, 6, 3, Math.PI * 0.4, 13, 3.2, 0.8, 0.7, '#e8342c');
        cap(S, 6, 3, 5);
        F(S, 7, 6, { small: true });
      },
    },
  });
  C('radish', {
    name: '무똥', seasons: [1], phases: [2, 1, 2, 1], seedPrice: 40, price: 90, edible: 18,
    desc: '아삭아삭 소리가 날 것 같은 분홍 똥. 꼬리가 하얗다.',
    look: {
      color: '#e8507a', seed: '#c89a7a',
      mature(S) {
        A.tuft(S, 8, 18, 8, L2, 5, 0.6);
        S.pixels([[8, 29], [8, 30], [9, 30]], '#f8f0e8');
        const t = P(S, 8, 29, [[13, 9], [8, 3]], '#ec5480', { tip: false, pw: 2.1 });
        F(S, 8, t[0].top + 3);
      },
      icon(S) {
        A.tuft(S, 8, 5, 4, L2, 3, 0.6);
        S.pixels([[8, 15]], '#f8f0e8');
        const t = P(S, 8, 15, [[12, 9], [8, 3]], '#ec5480', { tip: false, pw: 2.1 });
        F(S, 8, t[0].top + 3, { small: true });
      },
    },
  });
  C('red_cabbage', {
    name: '적양배추똥', seasons: [1], phases: [2, 1, 2, 2, 2], seedPrice: 100, price: 260, edible: 30,
    desc: '겹겹이 감긴 보라색 똥. 펼쳐 보면 또 똥.',
    look: {
      color: '#8a3e9a', seed: '#6a3a6a', kind: 'leafy', leafRamp: ['#b890c8', '#7a5a9a', '#5a3a7a', '#3e2456'],
      mature(S) {
        const LV = ['#9ac080', '#6a9a5a', '#4a7a44', '#345a32'];
        S.leaf(1, 27, 7, -Math.PI * 0.15, 3, LV);
        S.leaf(15, 27, 7, -Math.PI * 0.85, 3, LV);
        const t = P(S, 8, 28, [[15, 11], [8, 3]], '#9a48aa', { tex: A.tex.layers('#6a2a7a'), tip: false, pw: 2.1 });
        F(S, 8, t[0].top + 4);
      },
      icon(S) {
        const t = P(S, 8, 15, [[15, 11], [8, 3]], '#9a48aa', { tex: A.tex.layers('#6a2a7a'), tip: false, pw: 2.1 });
        F(S, 8, t[0].top + 4, { small: true });
      },
    },
  });
  C('hops', {
    name: '홉똥', seasons: [1], phases: [1, 1, 2, 3, 4], regrow: 1, seedPrice: 60, price: 25, edible: 18, trellis: true,
    seedName: '홉똥 모종', desc: '솔방울처럼 비늘진 연두 똥. 매일 또 열린다.',
    look: {
      kind: 'trellis', color: '#b8d870', seed: '#9aa860', seedShape: 'big',
      mature(S) {
        A.trellis(S, 26);
        A.vine(S, 28, 5, L2, 7);
        const cone = (x, y, k) => P(S, x, y, [[Math.round(4 * k), 2], [Math.round(6 * k), Math.round(3 * k)], [Math.round(5 * k), 3], [3, 2]], '#c4e07a', { tex: A.tex.scales('#8aa848'), tip: false });
        cone(4, 21, 1); cone(12, 15, 1);
        const t = cone(5, 11, 0.9);
        F(S, 5, t[1].top, { small: true, mouth: false });
      },
      icon(S) {
        const t = P(S, 8, 15, [[5, 2], [10, 4], [9, 4], [6, 3], [3, 2]], '#c4e07a', { tex: A.tex.scales('#8aa848'), tip: false });
        F(S, 8, t[1].top, { small: true });
      },
    },
  });
  C('wheat', {
    name: '밀똥', seasons: [1, 2], phases: [1, 1, 1, 1], seedPrice: 10, price: 25, edible: -300, scythe: true,
    desc: '바람에 사각거리는 황금빛 이삭 똥. 낫으로 거둔다.',
    look: {
      kind: 'tall', color: '#e6b84a', seed: '#d8b060', seedShape: 'long', leafRamp: LEAF_YELLOWISH(),
      mature(S) {
        const st = ['#b8a040', '#8a7a2a'];
        S.stem(4, 28, 4, 12, st[0]); S.stem(8, 28, 8, 8, st[0]); S.stem(12, 28, 12, 13, st[0]);
        S.leaf(8, 24, 7, -Math.PI * 0.8, 1.2, GOLD);
        S.leaf(8, 22, 7, -Math.PI * 0.2, 1.2, GOLD);
        const ear = (x, by) => P(S, x, by, [[3, 7], [2, 2]], '#e8bc4c', { tex: A.tex.kernels('#fff0a0', '#b8862a'), tip: false, overlap: 0 });
        ear(4, 13); ear(12, 14);
        const t = ear(8, 9);
        F(S, 8, t[0].top + 2, { small: true, mouth: false });
      },
      icon(S) {
        S.stem(8, 15, 8, 8, '#b8a040');
        S.leaf(8, 12, 4, Math.PI * 0.8, 1, GOLD);
        const t = P(S, 8, 10, [[5, 9], [3, 2]], '#e8bc4c', { tex: A.tex.kernels('#fff0a0', '#b8862a'), tip: false, overlap: 0 });
        F(S, 8, t[0].top + 3, { small: true, mouth: false });
      },
    },
  });
  function LEAF_YELLOWISH() { return ['#d8e070', '#a8b840', '#7a8a2a', '#565e1c']; }
  C('poppy', {
    name: '양귀비똥', seasons: [1], phases: [1, 2, 2, 2], seedPrice: 100, price: 140, edible: 18, cat: 'flower', flower: true,
    tints: ['#e8302a', '#f0603a', '#e83a7a'],
    desc: '새빨간 꽃잎을 두른 까만 똥. 바라보면 졸리다.',
    look: {
      kind: 'flower', color: '#e8302a', seed: '#3a3a3a',
      mature(S, tint) {
        const c = tint || '#e8302a';
        S.stem(8, 28, 8, 15, '#3d8a2c');
        S.leaf(8, 26, 6, -Math.PI * 0.85, 1.6, L2);
        S.leaf(9, 24, 6, -Math.PI * 0.15, 1.6, L2);
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
          S.ellipse(8 + Math.cos(a) * 4, 11 + Math.sin(a) * 3.6, 3.4, 3, ramp(c), { group: 'petal' });
        }
        const t = P(S, 8, 14, [[6, 4], [4, 2]], '#4a3428', {});
        F(S, 8, t[0].top + 1, { small: true, eye: '#ffe080', mouth: false });
      },
      icon(S, tint) {
        const c = tint || '#e8302a';
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
          S.ellipse(8 + Math.cos(a) * 4.2, 8 + Math.sin(a) * 4.2, 3.6, 3.2, ramp(c), { group: 'petal' });
        }
        const t = P(S, 8, 11, [[7, 4], [4, 2]], '#4a3428', {});
        F(S, 8, t[0].top + 1, { small: true, eye: '#ffe080', mouth: false });
      },
    },
  });
  C('summer_spangle', {
    name: '여름별꽃똥', seasons: [1], phases: [1, 2, 3, 2], seedPrice: 50, price: 90, edible: 18, cat: 'flower', flower: true,
    tints: ['#f2c830', '#5ab8e8', '#f07ab0', '#e8783a'],
    desc: '별 모양 꽃잎이 반짝이는 똥. 여름밤에 더 예쁘다.',
    look: {
      kind: 'flower', color: '#f2c830', seed: '#8a7a4a',
      mature(S, tint) {
        const c = tint || '#f2c830';
        S.stem(8, 28, 8, 16, '#3d8a2c');
        S.leaf(8, 26, 6, -Math.PI * 0.85, 1.6, L2);
        S.leaf(9, 23, 6, -Math.PI * 0.15, 1.6, L2);
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
          S.leaf(8 + Math.cos(a) * 1.5, 11 + Math.sin(a) * 1.5, 6.5, a, 2, ramp(c), { group: 'petal' });
        }
        const t = P(S, 8, 13, [[6, 4], [4, 2]], X.dark(c, 0.35), {});
        F(S, 8, t[0].top + 1, { small: true, mouth: false });
      },
      icon(S, tint) {
        const c = tint || '#f2c830';
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
          S.leaf(8 + Math.cos(a) * 1.5, 8 + Math.sin(a) * 1.5, 7, a, 2.2, ramp(c), { group: 'petal' });
        }
        const t = P(S, 8, 10, [[6, 4], [4, 2]], X.dark(c, 0.35), {});
        F(S, 8, t[0].top + 1, { small: true, mouth: false });
      },
    },
  });
  C('starfruit', {
    name: '스타프루트똥', seasons: [1], phases: [2, 3, 2, 3, 3], seedPrice: 400, price: 750, edible: 50, cat: 'fruit', shopNote: '사막 상점',
    desc: '별 모양으로 반짝이는 노란 똥. 아주 비싸다.',
    look: {
      color: '#f2d038', seed: '#c8b060', seedShape: 'flat',
      mature(S) {
        A.tuft(S, 8, 28, 9, L2, 5, 0.9);
        star(S, 8, 19, 7.5, 3.6, 5, -Math.PI / 2, '#f6d43c');
        F(S, 8, 18, { small: true });
        A.sparkles(S, [[2, 13], [14, 11], [13, 24]]);
      },
      icon(S) {
        star(S, 8, 8.5, 7.8, 3.6, 5, -Math.PI / 2, '#f6d43c');
        F(S, 8, 7, { small: true });
        A.sparkles(S, [[13, 2]]);
      },
    },
  });

  // ── 여름·가을 ──
  C('corn', {
    name: '옥수수똥', seasons: [1, 2], phases: [2, 3, 3, 3, 3], regrow: 4, seedPrice: 150, price: 50, edible: 10, yield: { min: 1, extra: 0 },
    desc: '알알이 박힌 노란 똥. 여름부터 가을까지 계속 열린다.',
    look: {
      kind: 'tall', color: '#f2c832', seed: '#f2d060',
      mature(S) {
        S.stem(7, 29, 7, 1, '#4a9a34', 2);
        for (let i = 0; i < 4; i++) S.leaf(i % 2 ? 9 : 7, 26 - i * 6, 7, i % 2 ? -Math.PI * 0.12 : -Math.PI * 0.88, 1.6, L2);
        S.leaf(8, 3, 5, -Math.PI * 0.4, 1, ['#f2e088', '#d8c058', '#a8902a', '#7a6a1a']);
        const t = P(S, 11, 22, [[5, 11], [3, 2]], '#f4cc36', { tex: A.tex.kernels('#fff0a0', '#c8961e'), tip: false, overlap: 0, pw: 2.2 });
        S.leaf(10, 22, 7, -Math.PI * 0.42, 1.6, L2);
        S.leaf(12, 22, 6, -Math.PI * 0.62, 1.4, L2);
        F(S, 11, t[0].top + 3, { small: true, mouth: false });
      },
      icon(S) {
        const t = P(S, 8, 14, [[7, 13], [4, 2]], '#f4cc36', { tex: A.tex.kernels('#fff0a0', '#c8961e'), tip: false, overlap: 0, pw: 2.2 });
        S.leaf(7, 15, 9, -Math.PI * 0.6, 2, L2);
        S.leaf(9, 15, 9, -Math.PI * 0.4, 2, L2);
        F(S, 8, t[0].top + 3, { small: true, mouth: false });
      },
    },
  });
  C('sunflower', {
    name: '해바라기똥', seasons: [1, 2], phases: [1, 2, 3, 2], seedPrice: 200, price: 80, edible: 18, cat: 'flower', flower: true,
    desc: '해를 따라 고개를 돌리는 커다란 똥. 씨앗도 남긴다.',
    look: {
      kind: 'tall', color: '#f6c628', seed: '#4a3a2a', seedShape: 'long',
      mature(S) {
        S.stem(8, 29, 8, 12, '#4a9a34', 2);
        S.leaf(8, 24, 6, -Math.PI * 0.9, 2.2, L2);
        S.leaf(9, 20, 6, -Math.PI * 0.1, 2.2, L2);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          S.leaf(8 + Math.cos(a) * 3, 7.5 + Math.sin(a) * 3, 4.2, a, 1.5, ramp('#f8cc2a'), { group: 'petal' });
        }
        const t = P(S, 8, 11, [[9, 6], [5, 2]], '#7a4a22', { tex: A.tex.seeds('#3a2210', 5), tip: false });
        F(S, 8, t[0].top + 1, { small: true, eye: '#ffe8a0' });
      },
      icon(S) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          S.leaf(8 + Math.cos(a) * 3, 8 + Math.sin(a) * 3, 4.6, a, 1.6, ramp('#f8cc2a'), { group: 'petal' });
        }
        const t = P(S, 8, 11, [[9, 6], [5, 2]], '#7a4a22', { tex: A.tex.seeds('#3a2210', 5), tip: false });
        F(S, 8, t[0].top + 1, { small: true, eye: '#ffe8a0' });
      },
    },
  });

  // ── 가을 ──
  C('pumpkin', {
    name: '호박똥', seasons: [2], phases: [1, 2, 3, 4, 3], seedPrice: 100, price: 320, edible: -300, giant: true,
    desc: '가을의 왕. 묵직하고 둥근 주황 똥.',
    look: {
      color: '#ee8a22', seed: '#f2e8c8', seedShape: 'flat',
      mature(S) {
        S.leaf(1, 22, 6, -Math.PI * 0.6, 2.8, L2);
        S.leaf(15, 21, 6, -Math.PI * 0.4, 2.8, L2);
        const t = P(S, 8, 28, [[16, 11], [8, 3]], '#f08c24', { tex: A.tex.ridges('#c86a14'), tip: false, pw: 2.1 });
        S.stem(8, t[1].top, 9, t[1].top - 3, '#5a7a2a', 2);
        F(S, 8, t[0].top + 4);
      },
      icon(S) {
        const t = P(S, 8, 15, [[16, 10], [8, 3]], '#f08c24', { tex: A.tex.ridges('#c86a14'), tip: false, pw: 2.1 });
        S.stem(8, t[1].top, 9, t[1].top - 2, '#5a7a2a', 2);
        F(S, 8, t[0].top + 4, { small: true });
      },
    },
  });
  C('eggplant', {
    name: '가지똥', seasons: [2], phases: [1, 1, 1, 1, 1], regrow: 5, seedPrice: 20, price: 60, edible: 8, yield: { min: 1, extra: 0.002 },
    desc: '반질반질 윤이 나는 보라 똥. 싸고 꾸준하다.',
    look: {
      color: '#7a3aa2', seed: '#c8b88a', seedShape: 'flat', kind: 'bush',
      mature(S) {
        A.tuft(S, 8, 27, 9, L2, 5, 0.9);
        const t = P(S, 8, 28, [[9, 9], [7, 4], [4, 2]], '#8040aa', { pw: 2, tip: false, glossTier: 0 });
        cap(S, 8, t[2].top + 1, 6);
        F(S, 8, t[0].top + 2, { small: true });
      },
      icon(S) {
        const t = P(S, 8, 15, [[11, 9], [7, 4], [4, 2]], '#8040aa', { pw: 2, tip: false });
        cap(S, 8, t[2].top + 1, 7);
        F(S, 8, t[0].top + 3, { small: true });
      },
    },
  });
  C('cranberry', {
    name: '크랜베리똥', seasons: [2], phases: [1, 2, 1, 1, 2], regrow: 5, seedPrice: 240, price: 75, edible: 15, cat: 'fruit', yield: { min: 2, extra: 0.1 },
    desc: '새콤한 빨간 알갱이 똥. 두 알씩 떨어진다.',
    look: {
      color: '#c82838', seed: '#a8584a', kind: 'bush',
      mature(S) {
        S.ellipse(8, 24, 7.5, 5, LP, { group: 'leaf' }, 2.2);
        A.tuft(S, 8, 28, 5, LP, 5, 0.9);
        for (const [x, y] of [[3, 21], [7, 19], [12, 20], [5, 25], [10, 24], [13, 26]]) ball(S, x, y, 1.8, '#d02c3c');
        const t = P(S, 8, 29, [[6, 4], [3, 2]], '#d02c3c', {});
        F(S, 8, t[0].top + 1, { small: true, mouth: false });
      },
      icon(S) {
        ball(S, 5, 6, 3, '#d02c3c'); ball(S, 11, 7, 3, '#c02838');
        const t = P(S, 8, 15, [[8, 6], [4, 2]], '#d02c3c', {});
        F(S, 8, t[0].top + 2, { small: true });
      },
    },
  });
  C('grape', {
    name: '포도똥', seasons: [2], phases: [1, 1, 2, 3, 3], regrow: 3, seedPrice: 60, price: 80, edible: 15, cat: 'fruit', trellis: true,
    seedName: '포도똥 모종', desc: '송이송이 매달린 보라 알갱이 똥.',
    look: {
      kind: 'trellis', color: '#7a3a9a', seed: '#8a6a4a', seedShape: 'big',
      mature(S) {
        A.trellis(S, 26);
        A.vine(S, 28, 5, L2, 11);
        const bunch = (cx, top) => {
          const rows = [[-2, 0, 2], [-1, 1], [0]];
          rows.forEach((row, r) => row.forEach((dx) => ball(S, cx + dx * 1.6, top + r * 2.6, 1.7, '#8a44aa')));
        };
        bunch(4, 18); bunch(12, 13);
        bunch(5, 7);
        F(S, 5, 7, { small: true, mouth: false });
      },
      icon(S) {
        const rows = [[-3, 0, 3], [-1.5, 1.5], [0]];
        rows.forEach((row, r) => row.forEach((dx) => ball(S, 8 + dx, 5 + r * 3.6, 2.4, '#8a44aa')));
        S.stem(8, 3, 9, 0, '#6a4a2a');
        S.leaf(9, 2, 4, -Math.PI * 0.1, 1.6, L2);
        F(S, 8, 7, { small: true });
      },
    },
  });
  C('artichoke', {
    name: '아티초크똥', seasons: [2], phases: [2, 2, 1, 2, 1], seedPrice: 30, price: 160, edible: 12,
    desc: '비늘이 겹겹이 쌓인 뾰족한 초록 똥.',
    look: {
      color: '#6aa05a', seed: '#8a9a6a',
      mature(S) {
        for (let i = 0; i < 4; i++) S.leaf(8, 27, 8, -Math.PI / 2 + (i - 1.5) * 0.7, 1.6, LP);
        const t = P(S, 8, 25, [[12, 5], [10, 4], [7, 4], [4, 3], [2, 2]], '#78aa62', { tex: A.tex.scales('#4f7a40'), tip: false });
        S.pixels([[8, t[4].top], [8, t[4].top - 1]], '#a060b8');
        F(S, 8, t[0].top + 1, { small: true });
      },
      icon(S) {
        const t = P(S, 8, 15, [[13, 5], [10, 4], [7, 4], [4, 3], [2, 2]], '#78aa62', { tex: A.tex.scales('#4f7a40'), tip: false });
        S.pixels([[8, t[4].top - 1]], '#a060b8');
        F(S, 8, t[0].top + 1, { small: true });
      },
    },
  });
  C('bok_choy', {
    name: '청경채똥', seasons: [2], phases: [1, 1, 1, 1], seedPrice: 50, price: 80, edible: 10,
    desc: '하얀 줄기에 초록 잎을 얹은 똥. 볶아 먹으면 맛있다(?).',
    look: {
      color: '#e8f0d8', seed: '#a8b88a', kind: 'leafy',
      mature(S) {
        for (let i = 0; i < 5; i++) S.leaf(8 + (i - 2) * 0.8, 22, 9, -Math.PI / 2 + (i - 2) * 0.35, 2.8, L2);
        const t = P(S, 8, 28, [[11, 7], [8, 3]], '#eef4e0', { tex: A.tex.stripes('#c8d8b0', 6), tip: false });
        F(S, 8, t[0].top + 2, { small: true });
      },
      icon(S) {
        for (let i = 0; i < 5; i++) S.leaf(8 + (i - 2) * 0.8, 9, 8, -Math.PI / 2 + (i - 2) * 0.38, 2.6, L2);
        const t = P(S, 8, 15, [[11, 7], [8, 3]], '#eef4e0', { tex: A.tex.stripes('#c8d8b0', 6), tip: false });
        F(S, 8, t[0].top + 2, { small: true });
      },
    },
  });
  C('yam', {
    name: '얌똥', seasons: [2], phases: [1, 3, 3, 3], seedPrice: 60, price: 160, edible: 18,
    desc: '땅속에서 길쭉하게 자란 주황 똥. 고구마 냄새가 난다.',
    look: {
      color: '#d86a3a', seed: '#a8603a', seedShape: 'big',
      mature(S) {
        S.leaf(6, 22, 6, -Math.PI * 0.75, 3, L2);
        S.leaf(10, 22, 6, -Math.PI * 0.25, 3, L2);
        S.leaf(8, 22, 6, -Math.PI * 0.5, 2.6, LEAF);
        P(S, 12, 29, [[7, 4]], '#c85e32', { tip: false });
        const t = P(S, 7, 29, [[13, 6], [7, 2]], '#dc6e3e', { tex: A.tex.spots('#a84a24', 6), tip: true, tipDir: -2 });
        F(S, 7, t[0].top + 1, { small: true });
      },
      icon(S) {
        const t = P(S, 8, 14, [[16, 8], [8, 2]], '#dc6e3e', { tex: A.tex.spots('#a84a24', 6), tip: true, tipDir: -3 });
        F(S, 8, t[0].top + 2, { small: true });
      },
    },
  });
  C('amaranth', {
    name: '아마란스똥', seasons: [2], phases: [1, 2, 2, 2], seedPrice: 70, price: 150, edible: 20, scythe: true,
    desc: '축 늘어진 붉은 술 모양 똥. 낫으로 거둔다.',
    look: {
      kind: 'tall', color: '#b8285a', seed: '#a83a5a',
      mature(S) {
        S.stem(8, 29, 8, 8, '#4a7a34', 2);
        S.leaf(8, 25, 6, -Math.PI * 0.85, 2, LP);
        S.leaf(9, 21, 6, -Math.PI * 0.15, 2, LP);
        horn(S, 7, 6, Math.PI * 0.62, 12, 2.6, 1, 0.4, '#c02e62', { tex: A.tex.scales('#8a1a44') });
        const t = horn(S, 10, 6, Math.PI * 0.35, 13, 2.8, 1, -0.3, '#c83468', { tex: A.tex.scales('#8a1a44') });
        void t;
        F(S, 11, 8, { small: true, mouth: false });
      },
      icon(S) {
        horn(S, 6, 2, Math.PI * 0.45, 13, 3.4, 1.2, 0.2, '#c83468', { tex: A.tex.scales('#8a1a44') });
        S.leaf(6, 2, 4, -Math.PI * 0.8, 1.5, LP);
        F(S, 7.5, 5, { small: true });
      },
    },
  });
  C('beet', {
    name: '비트똥', seasons: [2], phases: [1, 1, 2, 2], seedPrice: 20, price: 100, edible: 12, shopNote: '사막 상점',
    desc: '진한 자줏빛 똥. 단맛이 꽤 난다.',
    look: {
      color: '#8a2244', seed: '#6a3a3a',
      mature(S) {
        S.leaf(7, 19, 9, -Math.PI * 0.62, 2.4, LR);
        S.leaf(9, 19, 9, -Math.PI * 0.38, 2.4, L2);
        S.leaf(8, 19, 8, -Math.PI * 0.5, 2, LEAF);
        S.pixels([[8, 29], [8, 30]], '#6a1a34');
        const t = P(S, 8, 29, [[12, 9], [6, 3]], '#982a50', { tip: false, pw: 2 });
        F(S, 8, t[0].top + 3);
      },
      icon(S) {
        S.leaf(8, 5, 5, -Math.PI * 0.6, 1.6, LR);
        S.pixels([[8, 15]], '#6a1a34');
        const t = P(S, 8, 15, [[12, 9], [6, 3]], '#982a50', { tip: false, pw: 2 });
        F(S, 8, t[0].top + 3, { small: true });
      },
    },
  });
  C('fairy_rose', {
    name: '요정장미똥', seasons: [2], phases: [1, 4, 4, 3], seedPrice: 200, price: 290, edible: 18, cat: 'flower', flower: true,
    tints: ['#f07ab8', '#b07af0', '#f0a0d0', '#7ab0f0'],
    desc: '겹겹의 꽃잎이 소용돌이치는 반짝이 똥. 요정이 좋아한다.',
    look: {
      kind: 'flower', color: '#f07ab8', seed: '#9a6a8a',
      mature(S, tint) {
        const c = tint || '#f07ab8';
        S.stem(8, 28, 8, 15, '#3d8a2c');
        S.leaf(8, 26, 6, -Math.PI * 0.85, 1.8, L2);
        S.leaf(9, 23, 6, -Math.PI * 0.15, 1.8, L2);
        S.ellipse(3.5, 12, 2.6, 3.2, ramp(X.light(c, 0.25)), { group: 'petal' });
        S.ellipse(12.5, 12, 2.6, 3.2, ramp(X.light(c, 0.25)), { group: 'petal' });
        const t = P(S, 8, 16, [[10, 5], [8, 4], [5, 3]], c, { tex: A.tex.layers(X.dark(c, 0.3)) });
        F(S, 8, t[0].top + 1, { small: true });
        A.sparkles(S, [[2, 7], [14, 6], [13, 18]]);
      },
      icon(S, tint) {
        const c = tint || '#f07ab8';
        S.ellipse(3, 9, 2.6, 3.4, ramp(X.light(c, 0.25)), { group: 'petal' });
        S.ellipse(13, 9, 2.6, 3.4, ramp(X.light(c, 0.25)), { group: 'petal' });
        const t = P(S, 8, 14, [[11, 6], [8, 4], [5, 3]], c, { tex: A.tex.layers(X.dark(c, 0.3)) });
        F(S, 8, t[0].top + 1, { small: true });
        A.sparkles(S, [[14, 2]]);
      },
    },
  });

  // ── 희귀 ──
  C('ancient', {
    name: '고대똥', seasons: [0, 1, 2], phases: [2, 7, 7, 7, 5], regrow: 7, seedPrice: 0, price: 550, edible: -300, cat: 'fruit', rare: true,
    seedName: '고대똥 씨앗', desc: '아주 오래전 사라졌던 신비한 푸른 똥. 은은하게 빛난다.',
    look: {
      color: '#3ab0b8', seed: '#4a8a8a', seedShape: 'big', kind: 'bush', leafRamp: LB,
      mature(S) {
        A.tuft(S, 8, 28, 10, LB, 6, 0.9);
        const t = swirl(S, 8, 28, '#40bcc4', 0.95, { tex: A.tex.stripes('#2a8a9a', 9) });
        F(S, 8, t[0].top + 1, { eye: '#10384a' });
        A.sparkles(S, [[2, 16], [14, 13], [12, 21], [3, 9]], '#e8ffff');
      },
      icon(S) {
        const t = swirl(S, 8, 15, '#40bcc4', 0.9, { tex: A.tex.stripes('#2a8a9a', 9) });
        F(S, 8, t[0].top + 1, { small: true, eye: '#10384a' });
        A.sparkles(S, [[2, 4], [14, 2]], '#e8ffff');
      },
    },
  });
  C('rainbow', {
    name: '무지개똥', seasons: [2], phases: [2, 4, 6, 6, 6], seedPrice: 0, price: 3000, edible: -300, cat: 'fruit', rare: true,
    seedName: '희귀한 씨앗', desc: '일곱 빛깔로 반짝이는 전설의 똥. 보는 것만으로 행복해진다.',
    look: {
      color: '#ff7ad1', seed: '#c86ab0', seedShape: 'big',
      mature(S) {
        A.tuft(S, 8, 28, 9, ['#c8f0ff', '#88c8e8', '#5a98c0', '#3a6a98'], 5, 0.9);
        const t = swirl(S, 8, 28, '#ff7ad1', 1, { tex: A.tex.rainbow() });
        F(S, 8, t[0].top + 1, { eye: '#3a1f4a' });
        A.sparkles(S, [[1, 14], [14, 12], [13, 22], [4, 8], [11, 6]]);
      },
      icon(S) {
        const t = swirl(S, 8, 15, '#ff7ad1', 0.9, { tex: A.tex.rainbow() });
        F(S, 8, t[0].top + 1, { small: true, eye: '#3a1f4a' });
        A.sparkles(S, [[2, 3], [14, 5]]);
      },
    },
  });

  // ───────────── 채집 똥 ─────────────
  // SD.Forage.define(id, { name, seasons, price, edible, icon(S) }) — 자동으로 아이템 등록
  const fReg = SD.makeRegistry('forage');
  const Forage = (SD.Forage = {
    reg: fReg,
    define(id, d) {
      const def = Object.assign({ seasons: [0], price: 30, edible: 5, cat: 'forage' }, d);
      fReg.define(id, def);
      if (!SD.Items.has(id)) {
        SD.Items.define(id, {
          name: def.name, cat: def.cat, price: def.price, edible: def.edible, forage: true, desc: def.desc || '',
          sprite: () => X.cached('forage:' + id, () => {
            const S = new Shp(16, 16);
            def.icon(S);
            return X.outline(S.render());
          }),
        });
      }
      return def;
    },
    get: (id) => fReg.get(id),
    all: () => fReg.all(),
    forSeason(season) { return fReg.all().filter((f) => f.seasons.includes(season) && !f.noSpawn); },
  });
  const FG = (id, d) => Forage.define(id, d);
  // 봄
  FG('wild_horseradish', {
    name: '고추냉이똥', seasons: [0], price: 50, edible: 5, desc: '코끝이 찡한 들판의 뿌리 똥.',
    icon(S) {
      A.tuft(S, 8, 6, 5, L2, 3, 0.5);
      const t = P(S, 8, 15, [[7, 6], [6, 3], [4, 2]], '#e0c8a0', { tip: false });
      S.pixels([[8, 15]], '#b89a6a');
      F(S, 8, t[0].top + 1, { small: true });
    },
  });
  FG('daffodil', {
    name: '수선화똥', seasons: [0], price: 30, edible: 0, desc: '노란 나팔 꽃잎을 단 봄 똥.',
    icon(S) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        S.ellipse(8 + Math.cos(a) * 4.2, 8 + Math.sin(a) * 4.2, 2.6, 2.6, ramp('#f8e868'), { group: 'petal' });
      }
      const t = P(S, 8, 11, [[7, 5], [4, 2]], '#f0a830', {});
      F(S, 8, t[0].top + 1, { small: true });
    },
  });
  FG('leek', {
    name: '리크똥', seasons: [0], price: 60, edible: 40, desc: '위는 초록, 아래는 하얀 길쭉한 똥.',
    icon(S) {
      S.leaf(7, 7, 7, -Math.PI * 0.62, 1.6, L2);
      S.leaf(9, 7, 7, -Math.PI * 0.38, 1.6, L2);
      const t = P(S, 8, 15, [[6, 9], [4, 2]], '#f0f0e0', { tex: (x, y) => (y < 9 ? '#a8d870' : null), tip: false, pw: 3 });
      F(S, 8, t[0].top + 4, { small: true });
    },
  });
  FG('dandelion', {
    name: '민들레똥', seasons: [0], price: 40, edible: 10, desc: '보송보송한 노란 꽃잎 똥. 후 불면 날아갈 것 같다.',
    icon(S) {
      S.stem(8, 15, 8, 10, '#3d8a2c');
      S.leaf(8, 14, 5, Math.PI * 0.95, 1.2, L2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        S.leaf(8 + Math.cos(a), 6.5 + Math.sin(a), 4.4, a, 1.1, ramp('#f8d838'), { group: 'petal' });
      }
      const t = P(S, 8, 9, [[5, 4], [3, 2]], '#e8a020', {});
      F(S, 8, t[0].top + 1, { small: true, mouth: false });
    },
  });
  FG('spring_onion', {
    name: '달래똥', seasons: [0], price: 8, edible: 5, desc: '가느다란 싹이 난 작은 하얀 똥.',
    icon(S) {
      for (let i = 0; i < 3; i++) S.leaf(7 + i, 10, 9, -Math.PI / 2 + (i - 1) * 0.3, 0.8, L2);
      const t = P(S, 8, 15, [[8, 5], [5, 2]], '#f4f0e4', { tip: false });
      F(S, 8, t[0].top + 1, { small: true });
    },
  });
  // 여름
  FG('salmonberry', {
    name: '산딸기똥', seasons: [1], price: 5, edible: 10, desc: '오톨도톨한 주황빛 열매 똥.',
    icon(S) {
      const t = P(S, 8, 15, [[11, 7], [8, 4], [4, 2]], '#f0784a', { tex: A.tex.kernels('#ffb890', '#c84a2a') });
      cap(S, 8, t[2].top, 6);
      F(S, 8, t[0].top + 1, { small: true });
    },
  });
  FG('sweet_pea', {
    name: '스위트피똥', seasons: [1], price: 50, edible: 0, desc: '달콤한 향의 분홍 꽃잎 똥.',
    icon(S) {
      S.ellipse(4.5, 6, 3.4, 3.8, ramp('#e888d8'), { group: 'petal' });
      S.ellipse(11.5, 6, 3.4, 3.8, ramp('#e888d8'), { group: 'petal' });
      const t = P(S, 8, 14, [[9, 6], [6, 3], [3, 2]], '#c85ab8', {});
      F(S, 8, t[0].top + 1, { small: true });
    },
  });
  FG('wild_grape', {
    name: '야생포도똥', seasons: [1], price: 80, edible: 15, desc: '들판에서 자란 작은 포도송이 똥.',
    icon(S) {
      [[5, 6], [11, 6], [8, 9], [5, 11], [11, 11], [8, 14]].forEach(([x, y]) => ball(S, x, y, 2.4, '#7a4aa8'));
      S.leaf(9, 3, 4, -Math.PI * 0.2, 1.6, L2);
      F(S, 8, 9, { small: true, mouth: false });
    },
  });
  // 가을
  FG('common_mushroom', {
    name: '버섯똥', seasons: [2], price: 40, edible: 15, desc: '버섯 갓을 쓴 똥. 숲 냄새가 난다.',
    icon(S) {
      const t = P(S, 8, 15, [[9, 6], [6, 3]], '#e8d8c0', { tip: false });
      S.ellipse(8, 6, 7, 4, ramp('#c8784a'), { group: 'cap' }, 2.2);
      S.pixels([[5, 5], [10, 4], [8, 7]], '#f8e8d0');
      F(S, 8, t[0].top + 1, { small: true });
    },
  });
  FG('wild_plum', {
    name: '야생자두똥', seasons: [2], price: 80, edible: 10, desc: '새콤한 보라 열매 똥.',
    icon(S) {
      const t = P(S, 8, 15, [[13, 10], [6, 2]], '#8a3a8a', { tip: false, pw: 2 });
      S.leaf(9, 4, 5, -Math.PI * 0.15, 2, L2);
      F(S, 8, t[0].top + 3, { small: true });
    },
  });
  FG('hazelnut', {
    name: '헤이즐넛똥', seasons: [2], price: 90, edible: 12, desc: '단단한 껍질 속 고소한 똥.',
    icon(S) {
      const t = P(S, 8, 15, [[12, 9], [6, 3]], '#b8783a', { tip: false, pw: 2 });
      S.ellipse(8, 6, 6, 3, ramp('#8a5a2a'), { group: 'cap', tex: A.tex.scales('#5a3a1a') }, 2.4);
      F(S, 8, t[0].top + 4, { small: true });
    },
  });
  FG('blackberry', {
    name: '블랙베리똥', seasons: [2], price: 20, edible: 10, desc: '까맣게 익은 오톨도톨 열매 똥.',
    icon(S) {
      const t = P(S, 8, 15, [[11, 7], [8, 4], [4, 2]], '#3a2a5a', { tex: A.tex.kernels('#7a6aa8', '#1a1030') });
      cap(S, 8, t[2].top, 6);
      F(S, 8, t[0].top + 1, { small: true, eye: '#f0e8ff' });
    },
  });
  // 겨울
  FG('winter_root', {
    name: '겨울뿌리똥', seasons: [3], price: 70, edible: 10, desc: '언 땅 속에서 캐낸 울퉁불퉁한 뿌리 똥.',
    icon(S) {
      horn(S, 4, 5, Math.PI * 0.3, 12, 3.4, 1, 0.5, '#8a5a6a');
      F(S, 6, 6, { small: true });
    },
  });
  FG('crystal_fruit', {
    name: '수정과일똥', seasons: [3], price: 150, edible: 25, desc: '얼음처럼 투명하게 반짝이는 똥.',
    icon(S) {
      const t = P(S, 8, 15, [[13, 6], [10, 4], [6, 3], [3, 2]], '#9ad8f8', { tex: (x, y, tone) => (tone < 3 && (x + y) % 4 === 0 ? '#e8f8ff' : null) });
      F(S, 8, t[0].top + 1, { small: true, eye: '#2a4a7a' });
      A.sparkles(S, [[2, 4], [13, 2], [14, 9]]);
    },
  });
  FG('snow_yam', {
    name: '눈마똥', seasons: [3], price: 100, edible: 12, desc: '눈을 뒤집어쓴 하얗고 둥근 똥.',
    icon(S) {
      const t = P(S, 8, 15, [[14, 8], [8, 3]], '#d8d0e8', { tex: (x, y, tone, sh) => (y < sh.minY + 3 ? '#ffffff' : null), tip: false, pw: 2.1 });
      F(S, 8, t[0].top + 3, { small: true });
    },
  });
  FG('crocus', {
    name: '크로커스똥', seasons: [3], price: 60, edible: 0, desc: '눈 속에서 피어난 보라 꽃잎 똥.',
    icon(S) {
      S.ellipse(4, 7, 2.6, 4.4, ramp('#a878e0'), { group: 'petal' });
      S.ellipse(12, 7, 2.6, 4.4, ramp('#a878e0'), { group: 'petal' });
      S.ellipse(8, 4, 2.4, 3.4, ramp('#b888f0'), { group: 'petal' });
      const t = P(S, 8, 15, [[9, 6], [6, 3]], '#8a5ac8', { tip: false });
      F(S, 8, t[0].top + 1, { small: true });
    },
  });
  FG('holly', {
    name: '호랑가시똥', seasons: [3], price: 80, edible: -15, desc: '뾰족한 잎과 빨간 열매를 단 똥. 먹으면 배가 아프다.',
    icon(S) {
      S.leaf(1, 6, 7, -Math.PI * 0.1, 2.4, ['#6aa86a', '#2f7a3f', '#1f5a2f', '#123e20']);
      S.leaf(15, 6, 7, -Math.PI * 0.9, 2.4, ['#6aa86a', '#2f7a3f', '#1f5a2f', '#123e20']);
      const t = P(S, 8, 15, [[11, 7], [7, 3]], '#2f6a3a', { tip: false });
      ball(S, 7, 4, 1.8, '#e02a2a'); ball(S, 10, 5, 1.8, '#e02a2a');
      F(S, 8, t[0].top + 2, { small: true, eye: '#f0fff0' });
    },
  });

  // ───────────── 계절 씨앗 / 섞인 씨앗 ─────────────
  // 계절 씨앗은 7일 뒤 그 계절 채집 똥이 열리는 '야생 작물'을 심는다
  ['spring', 'summer', 'fall', 'winter'].forEach((sname, si) => {
    const tint = ['#8ad860', '#e8c040', '#d8783a', '#a8c8e8'][si];
    Crops.define('wild_' + sname, {
      name: SD.SEASON_NAMES[si] + ' 야생똥', seasons: [si], phases: [1, 2, 2, 2], seedPrice: 0, price: 0, noItem: true, wild: si,
      seedId: sname + '_seeds', seedName: SD.SEASON_NAMES[si] + ' 씨앗',
      seedDesc: `${SD.SEASON_NAMES[si]} 들판의 씨앗을 모은 것. 심으면 7일 뒤 ${SD.SEASON_NAMES[si]} 채집 똥이 열린다.`,
      look: {
        kind: 'bush', color: tint, seed: X.mix(tint, '#7a4a22', 0.5),
        mature(S) {
          A.tuft(S, 8, 28, 10, L2, 7, 0.95);
          const t = swirl(S, 8, 28, X.mix(tint, '#9a6a3a', 0.4), 0.7);
          F(S, 8, t[0].top + 1, { small: true });
        },
        icon(S) { swirl(S, 8, 15, tint, 0.8); },
      },
    });
    SD.Items.extend(sname + '_seeds', { sprite: () => A.seedPile(tint, 'round', si * 13 + 5) });
  });
  SD.Items.define('mixed_seeds', {
    name: '섞인 씨앗', cat: 'seed', price: 0, mixedSeeds: true, sprite: A.mixedSeeds,
    desc: '여러 씨앗이 섞여 있다. 심으면 이 계절의 똥 중 하나가 자란다.',
  });
})();
