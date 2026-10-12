'use strict';
// ════════════════════════════════════════════════════════════════════
//  아이템 아이콘 아트 (16×16) + 기본 자원 아이템 정의
//  모든 아이콘은 "채움 픽셀만 그린 뒤 자동 외곽선(채움색의 어두운 톤)"으로 만든다.
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const X = SD.gfx;
  const A = (SD.Art = SD.Art || {});

  const WOOD = ['#e0a868', '#b5773d', '#87532a', '#5e3618'];

  // 행 문자열 + 팔레트 → 외곽선 입힌 아이콘
  A.icon = function (rows, pal, opts) {
    const c = X.fromRows(rows, pal, 16, 16);
    return X.outline(c, opts);
  };
  // 타원 여러 개를 합친 덩어리를 명암으로 칠한다
  A.blob = function (g, ellipses, ramp, opts) {
    const inside = (x, y) => ellipses.some((e) => X.inEllipse(x, y, e[0], e[1], e[2], e[3]));
    X.shadeMask(g, g.canvas.width, g.canvas.height, inside, ramp, opts);
    return inside;
  };
  A.blank = function (w, h) {
    const c = X.canvas(w || 16, h || 16);
    return [c, X.ctx(c)];
  };

  // ───────────── 도구 아이콘 ─────────────
  // 손잡이: 왼쪽 아래 → 오른쪽 위 대각선. 잡는 점(GRIP) = (3, 12)
  A.TOOL_GRIP = { x: 3, y: 12 };
  A.CAN_GRIP = { x: 6, y: 4 };   // 물뿌리개 손잡이
  function handle(g, x0, y0, x1, y1) {
    // 2픽셀 두께 사선 손잡이 (아래쪽은 어둡게, 위쪽은 밝게)
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      X.px(g, x, y, WOOD[1]);
      X.px(g, x + 1, y, i % 3 === 0 ? WOOD[0] : WOOD[1]);
      X.px(g, x, y + 1, WOOD[2]);
    }
  }
  // held=true: 손에 든 모습(24×24, 손잡이가 길다). 잡는 점 = A.TOOL_GRIP_HELD
  A.TOOL_GRIP_HELD = { x: 3, y: 21 };
  A.toolIcon = function (kind, lvl, held) {
    const head = SD.Tools.headColor(lvl);
    const R = X.ramp(head);
    const pal = { 1: R[0], 2: R[1], 3: R[2], 4: R[3], h: WOOD[1], H: WOOD[0], d: WOOD[2], w: '#ffffff' };
    const size = held ? 24 : 16;
    const c = X.canvas(size, size);
    const g0 = X.ctx(c);
    // 머리 부분은 (ox, oy) 만큼 밀어서 그린다 (손잡이가 길어진 만큼)
    const ox = held ? 5 : 0, oy = held ? 9 : 0;
    const g = {
      set fillStyle(v) { g0.fillStyle = v; },
      fillRect(x, y, w, h) { g0.fillRect(x + ox, y + oy, w, h); },
    };
    const handle2 = (x0, y0, x1, y1) => (held ? handle(g0, x0, y0 + 9, x1 + 5, y1 + 9) : handle(g0, x0, y0, x1, y1));
    if (kind === 'hoe') {
      handle2(2, 12, 9, 5);
      X.paintRows(g, [
        '................',
        '................',
        '...........12...',
        '..........1222..',
        '.........1.2223.',
        '............233.',
        '.............33.',
        '.............4..',
      ], pal, 0, 0);
    } else if (kind === 'pick') {
      handle2(2, 12, 9, 5);
      X.paintRows(g, [
        '................',
        '......1111......',
        '....11222221....',
        '...12.....2222..',
        '..12.......2223.',
        '..2.........233.',
        '.2...........33.',
        '..............3.',
      ], pal, 0, 0);
    } else if (kind === 'axe') {
      handle2(2, 12, 10, 4);
      X.paintRows(g, [
        '................',
        '........11......',
        '.......1222.....',
        '......122223....',
        '.......22222....',
        '........22233...',
        '.........2333...',
        '..........33....',
        '................',
      ], pal, 0, 0);
    } else if (kind === 'scythe') {
      // 손잡이는 길고 거의 세로, 날은 위에서 왼쪽으로 휘어진다
      if (held) handle(g0, 3, 21, 15, 11); else handle(g0, 5, 14, 10, 2);
      X.paintRows(g, [
        '................',
        '.....111111.....',
        '...1122222......',
        '..1233..........',
        '.123............',
        '.23.............',
        '.3..............',
      ], pal, 0, 0);
      if (!held) { X.px(g0, 6, 9, WOOD[0]); X.px(g0, 7, 9, WOOD[0]); }
    } else if (kind === 'can') {
      const body = lvl === 0 ? X.ramp('#4e9db2') : R;
      const p2 = { 1: body[0], 2: body[1], 3: body[2], 4: body[3], m: '#ffffff', s: X.light(body[1], 0.5) };
      X.paintRows(g, [
        '................',
        '................',
        '....3333........',
        '...3....3.......',
        '...3....3.......',
        '..1122222....s..',
        '..1222222...s3..',
        '..12m22223.223..',
        '..1222222322....',
        '..12222223......',
        '..12222223......',
        '..12222223......',
        '..12222223......',
        '...333333.......',
      ], p2, 0, 0);
    }
    X.outline(c);
    return c;
  };

  // ───────────── 씨앗 무더기 ─────────────
  // colors: [밝은, 기본, 어두운], shape: 'round' | 'oval' | 'flat' | 'big' | 'long'
  A.seedPile = function (base, shape, seed) {
    const [c, g] = A.blank();
    const r = SD.util.mulberry32(seed || 7);
    const R = X.ramp(base);
    const put = (x, y) => {
      if (shape === 'big') {
        X.paintRows(g, ['.12.', '1223', '2233', '.33.'], { 1: R[0], 2: R[1], 3: R[2] }, x - 1, y - 1);
      } else if (shape === 'flat' || shape === 'oval') {
        X.paintRows(g, ['122', '233'], { 1: R[0], 2: R[1], 3: R[2] }, x, y);
      } else if (shape === 'long') {
        X.paintRows(g, ['12', '22', '23', '33'], { 1: R[0], 2: R[1], 3: R[2] }, x, y - 1);
      } else {
        X.paintRows(g, ['12', '23'], { 1: R[0], 2: R[1], 3: R[2] }, x, y);
      }
    };
    const spots = shape === 'big'
      ? [[4, 10], [9, 10], [6, 6], [11, 6]]
      : [[3, 11], [6, 12], [9, 11], [12, 12], [5, 8], [8, 8], [11, 9], [7, 5], [10, 6]];
    for (const [x, y] of spots) put(x + Math.floor(r() * 2) - 1 + 0, y + (shape === 'big' ? 0 : Math.floor(r() * 2) - 1));
    X.outline(c);
    return c;
  };

  // ───────────── 자원 아이콘 ─────────────
  function log(g, x, y, len, ramp, ring) {
    for (let i = 0; i < len; i++) {
      X.px(g, x + i, y, ramp[0]);
      X.px(g, x + i, y + 1, ramp[1]);
      X.px(g, x + i, y + 2, ramp[1]);
      X.px(g, x + i, y + 3, ramp[2]);
      if (i % 4 === 2) X.px(g, x + i, y + 2, ramp[2]);
    }
    // 단면 (나이테)
    X.paintRows(g, ['.ab.', 'abca', 'acba', '.aa.'], { a: ring[2], b: ring[0], c: ring[1] }, x + len - 1, y);
  }
  A.wood = function () {
    const [c, g] = A.blank();
    log(g, 1, 9, 9, WOOD, ['#f2cf94', '#d9a865', '#b47a3e']);
    log(g, 3, 5, 8, WOOD, ['#f2cf94', '#d9a865', '#b47a3e']);
    X.outline(c);
    return c;
  };
  A.hardwood = function () {
    const [c, g] = A.blank();
    const R = ['#b0583a', '#86402a', '#5e2a1c', '#3e1a10'];
    log(g, 1, 8, 10, R, ['#e2a26e', '#c47a48', '#93502e']);
    log(g, 2, 3, 8, R, ['#e2a26e', '#c47a48', '#93502e']);
    X.px(g, 4, 10, '#5e2a1c'); X.px(g, 7, 9, '#5e2a1c');
    X.outline(c);
    return c;
  };
  A.stone = function (base) {
    const [c, g] = A.blank();
    A.blob(g, [[8, 9.5, 6, 4.2], [6.5, 7.5, 3.5, 3], [10.5, 8, 3.5, 3]], X.ramp(base || '#9c9a92'));
    X.px(g, 6, 9, X.dark(base || '#9c9a92', 0.3)); X.px(g, 7, 10, X.dark(base || '#9c9a92', 0.3));
    X.px(g, 11, 10, X.dark(base || '#9c9a92', 0.3));
    X.outline(c);
    return c;
  };
  A.clay = function () {
    const [c, g] = A.blank();
    A.blob(g, [[8, 10, 6, 3.6], [6, 8, 3, 2.6], [10, 7.5, 3, 2.8]], X.ramp('#b98a6a'));
    X.px(g, 9, 7, '#e6c1a2'); X.px(g, 5, 9, '#e6c1a2');
    X.outline(c);
    return c;
  };
  A.fiber = function () {
    return A.icon([
      '................',
      '...g...G..g.....',
      '...gG..G.gG..g..',
      '....g.GG.g..gG..',
      '....gGgG.gGgG...',
      '.....gGgGgGg....',
      '.....ggGgGg.....',
      '......yyyy......',
      '......yYYy......',
      '.....gGggGg.....',
      '....gG.gG.gG....',
      '....g..gG..g....',
      '...gG..gG..gG...',
      '...g...g....g...',
      '................',
      '................',
    ], { g: '#4f9e35', G: '#7fca4f', y: '#c9a24a', Y: '#efd27a' });
  };
  A.sap = function () {
    return A.icon([
      '................',
      '.......a........',
      '.......a........',
      '......aaa.......',
      '......aAa.......',
      '.....aAAaa......',
      '.....aAaaa......',
      '....aaaaaad.....',
      '....aWaaaad.....',
      '....aWaaaad.....',
      '....aaaaadd.....',
      '.....aaddd......',
      '......ddd.......',
      '................',
      '................',
      '................',
    ], { a: '#d9902a', A: '#f6c66a', d: '#a8611a', W: '#ffe9b0' });
  };
  A.acorn = function () {
    return A.icon([
      '................',
      '................',
      '........s.......',
      '.......s........',
      '....cCCCCCc.....',
      '...cCcCcCcCc....',
      '...cccccccccd...',
      '....nNNnnnnd....',
      '....nNnnnnnd....',
      '....nNnnnnnd....',
      '.....nnnnnd.....',
      '......nnnd......',
      '.......nd.......',
      '................',
      '................',
      '................',
    ], { c: '#8a5a2c', C: '#b07a42', d: '#6e3e1a', n: '#c58440', N: '#e8b070', s: '#6e4422' });
  };
  A.mapleSeed = function () {
    return A.icon([
      '................',
      '................',
      '..wwww....wwww..',
      '.wWWwww..wwwWWw.',
      '.wWwwwwwwwwwwWw.',
      '..wwwwwwwwwwww..',
      '...wwwwddwwww...',
      '.....wwddww.....',
      '.......ss.......',
      '.......ss.......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ], { w: '#c99a4e', W: '#ead08a', d: '#8a5a2a', s: '#6e4422' });
  };
  A.pineCone = function () {
    return A.icon([
      '................',
      '.......s........',
      '......cCc.......',
      '.....cCdCc......',
      '.....dccdcd.....',
      '....cCdCcdc.....',
      '....dccdccd.....',
      '....cCdCcdc.....',
      '....dccdccd.....',
      '.....cdCcd......',
      '.....dccdd......',
      '......cdd.......',
      '................',
      '................',
      '................',
      '................',
    ], { c: '#a8692e', C: '#d39a55', d: '#6e3e1a', s: '#5e3a1a' }, null);
  };
  A.hay = function () {
    return A.icon([
      '................',
      '................',
      '...y.Y..y.Y.y...',
      '....yYyyYyyY....',
      '....yyYyyYyy....',
      '.....yyYyyy.....',
      '.....yYyyYy.....',
      '.....rrrrrr.....',
      '.....yyYyyy.....',
      '....yYyyYyyy....',
      '...yyyYyyyYyy...',
      '...yYyyyYyyyY...',
      '..yyy.yy.Yy.yy..',
      '................',
      '................',
      '................',
    ], { y: '#d6b44a', Y: '#f2df8a', r: '#b0532a' });
  };
  A.mixedSeeds = function () {
    const [c, g] = A.blank();
    const cols = ['#d8b070', '#9a6a3a', '#e8d8b0', '#6a8a3a', '#c88a5a', '#a87a4a'];
    const spots = [[3, 11], [6, 12], [9, 11], [12, 12], [5, 8], [8, 8], [11, 9], [7, 5], [10, 6]];
    spots.forEach(([x, y], i) => {
      const R = X.ramp(cols[i % cols.length]);
      X.paintRows(g, ['12', '23'], { 1: R[0], 2: R[1], 3: R[2] }, x, y);
    });
    X.outline(c);
    return c;
  };

  // ───────────── 기본 자원 아이템 ─────────────
  const I = (id, d) => SD.Items.define(id, d);
  I('wood', { name: '나무', cat: 'resource', price: 2, sprite: A.wood, desc: '튼튼한 목재. 여러 가지를 만드는 데 쓴다.' });
  I('hardwood', { name: '단단한 나무', cat: 'resource', price: 15, sprite: A.hardwood, desc: '아주 단단하고 귀한 목재. 큰 그루터기에서 얻는다.' });
  I('stone', { name: '돌', cat: 'resource', price: 2, sprite: () => A.stone(), desc: '흔한 돌. 건축 재료로 쓴다.' });
  I('clay', { name: '점토', cat: 'resource', price: 20, sprite: A.clay, desc: '괭이질을 하다 보면 가끔 나온다. 찰기가 있다.' });
  I('fiber', { name: '섬유', cat: 'resource', price: 1, sprite: A.fiber, desc: '잡초에서 얻은 질긴 섬유. 엮으면 여러 가지가 된다.' });
  I('sap', { name: '수액', cat: 'resource', price: 2, edible: -1, sprite: A.sap, desc: '나무에서 흘러나온 끈적한 액체.' });
  I('hay', { name: '건초', cat: 'misc', price: 0, sprite: A.hay, desc: '말린 풀. 동물들이 아주 좋아한다.' });
  I('acorn', { name: '도토리', cat: 'seed', price: 20, sprite: A.acorn, tree: 'oak', desc: '참나무 씨앗. 심으면 참나무가 자란다.' });
  I('maple_seed', { name: '단풍나무 씨앗', cat: 'seed', price: 5, sprite: A.mapleSeed, tree: 'maple', desc: '빙글빙글 도는 날개 씨앗. 심으면 단풍나무가 자란다.' });
  I('pine_cone', { name: '솔방울', cat: 'seed', price: 5, sprite: A.pineCone, tree: 'pine', desc: '소나무 씨앗. 심으면 소나무가 자란다.' });
})();
