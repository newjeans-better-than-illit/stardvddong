'use strict';
// ════════════════════════════════════════════════════════════════════
//  지형 타일: 계절 팔레트, 잔디·흙·물·절벽·계단·숲·실내 바닥/벽, 괭이 흙 자동 타일링
//  SD.Tiles.define(id, { solid, diggable, water, step, bake(g, px, py, T), anim(g, px, py, T, t) })
//  T = { loc, x, y, season, at(dx,dy) → 이웃 타일 id, rnd() }
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const X = SD.gfx;
  const U = SD.util;

  const reg = SD.makeRegistry('tiles');
  const Tiles = (SD.Tiles = {
    reg,
    define(id, def) { return reg.define(id, Object.assign({ solid: false, diggable: false, water: false, step: 'dirt' }, def)); },
    get: (id) => reg.get(id),
  });

  // ───────────── 계절 팔레트 ─────────────
  Tiles.PAL = [
    { // 봄
      grass: ['#b4e276', '#8acb52', '#6cb43e', '#54962f', '#3f7a26'], flowers: ['#ffffff', '#ffe36a', '#f7a8cc', '#b8a8ff'],
      dirt: ['#e2b27a', '#cc9a62', '#b0804c', '#8e6238'], forest: ['#3f7a34', '#2f6429', '#224d20'],
    },
    { // 여름
      grass: ['#9ad466', '#6cb444', '#559d36', '#428229', '#31661f'], flowers: ['#ffe36a', '#ff8a5c', '#ffffff'],
      dirt: ['#dcac72', '#c5935a', '#a87a46', '#875c34'], forest: ['#32702c', '#245a22', '#1a461a'],
    },
    { // 가을
      grass: ['#e8c272', '#d4a44e', '#bd8a3c', '#9e6e2e', '#7c5424'], flowers: ['#e0702a', '#c2461f', '#f2c43a'],
      dirt: ['#d8a46e', '#c08c58', '#a47244', '#825632'], forest: ['#7a5a2a', '#5e4420', '#463218'],
    },
    { // 겨울
      grass: ['#ffffff', '#eef3fa', '#d8e2f0', '#bccbe0', '#9aaecb'], flowers: ['#ffffff'],
      dirt: ['#d8d0c6', '#bfb4a6', '#a0927e', '#7e705e'], forest: ['#4e6a64', '#3c5650', '#2c423e'],
    },
  ];
  Tiles.pal = (season) => Tiles.PAL[season || 0];
  const WATER = ['#a8dcf8', '#5fa8e0', '#3f8bd0', '#2f74b8', '#235c98'];
  const WATER_W = ['#c8e6f8', '#86b8e0', '#6a9ed0', '#5888bc', '#466e9c'];
  const ROCK = ['#c69462', '#a8784c', '#8c603c', '#6e4a2e', '#4e331f'];
  const ROCK_W = ['#b8aaa0', '#988a80', '#7c6e66', '#62564f', '#463c37'];

  // ───────────── 기본 질감 ─────────────
  function grassTex(season, v) {
    return X.cached(`tile:grass:${season}:${v}`, () => {
      const P = Tiles.pal(season).grass;
      const c = X.canvas(16, 16);
      const g = X.ctx(c);
      const r = U.mulberry32(1000 + season * 31 + v * 7);
      g.fillStyle = P[2]; g.fillRect(0, 0, 16, 16);
      // 은은한 얼룩
      for (let i = 0; i < 18; i++) {
        g.fillStyle = r() < 0.5 ? P[1] : P[3];
        g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
      }
      if (season === 3) {
        // 눈밭: 푸른 그늘 물결과 반짝임
        for (let i = 0; i < 4; i++) {
          const x = Math.floor(r() * 13), y = 1 + Math.floor(r() * 14);
          g.fillStyle = P[3]; g.fillRect(x, y, 3, 1);
          g.fillStyle = P[0]; g.fillRect(x + 1, y - 1, 2, 1);
        }
        if (v % 3 === 0) { g.fillStyle = '#ffffff'; g.fillRect(Math.floor(r() * 15), Math.floor(r() * 15), 1, 1); }
        return c;
      }
      // 풀잎 획 (짙은 v 와 밝은 끝)
      const n = 6 + (v % 3);
      for (let i = 0; i < n; i++) {
        const x = Math.floor(r() * 15), y = 1 + Math.floor(r() * 14);
        const k = r();
        g.fillStyle = P[4];
        if (k < 0.4) { g.fillRect(x, y, 1, 2); g.fillRect(x + 2, y, 1, 2); g.fillStyle = P[3]; g.fillRect(x + 1, y + 1, 1, 1); g.fillStyle = P[0]; g.fillRect(x, y - 1, 1, 1); }
        else if (k < 0.75) { g.fillRect(x, y, 1, 2); g.fillStyle = P[0]; g.fillRect(x + 1, y - 1, 1, 1); g.fillStyle = P[1]; g.fillRect(x + 1, y, 1, 1); }
        else { g.fillStyle = P[3]; g.fillRect(x, y, 2, 1); g.fillStyle = P[1]; g.fillRect(x, y - 1, 1, 1); }
      }
      // 작은 꽃 (가끔)
      if (v === 5 || v === 7) {
        const fl = Tiles.pal(season).flowers;
        for (let i = 0; i < 2; i++) {
          const x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12);
          g.fillStyle = fl[Math.floor(r() * fl.length)];
          g.fillRect(x, y, 1, 1);
          g.fillStyle = P[4]; g.fillRect(x, y + 1, 1, 1);
        }
      }
      return c;
    });
  }
  Tiles.grassTex = grassTex;

  function dirtTex(season, v) {
    return X.cached(`tile:dirt:${season}:${v}`, () => {
      const P = Tiles.pal(season).dirt;
      const c = X.canvas(16, 16);
      const g = X.ctx(c);
      const r = U.mulberry32(2000 + season * 17 + v * 5);
      g.fillStyle = P[1]; g.fillRect(0, 0, 16, 16);
      for (let i = 0; i < 22; i++) {
        g.fillStyle = r() < 0.55 ? P[2] : P[0];
        g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
      }
      // 자갈
      for (let i = 0; i < 2 + (v % 2); i++) {
        const x = 1 + Math.floor(r() * 13), y = 1 + Math.floor(r() * 13);
        g.fillStyle = P[3]; g.fillRect(x, y + 1, 2, 1);
        g.fillStyle = P[0]; g.fillRect(x, y, 2, 1);
      }
      if (season === 3) {
        for (let i = 0; i < 6; i++) { g.fillStyle = '#f4f6fa'; g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1); }
      }
      return c;
    });
  }
  Tiles.dirtTex = dirtTex;

  // 흙 위로 덮이는 잔디 가장자리 (side: 0 위, 1 오른쪽, 2 아래, 3 왼쪽)
  function grassFringe(season, side, v) {
    return X.cached(`tile:fringe:${season}:${side}:${v}`, () => {
      const P = Tiles.pal(season).grass;
      const D = Tiles.pal(season).dirt;
      const c = X.canvas(16, 16);
      const g = X.ctx(c);
      const tex = grassTex(season, v);
      const r = U.mulberry32(3000 + side * 101 + v * 13 + season);
      for (let i = 0; i < 16; i++) {
        const depth = 1 + Math.floor(r() * 2.6) + ((i % 5 === 2) ? 1 : 0);
        for (let d = 0; d < depth; d++) {
          let x, y;
          if (side === 0) { x = i; y = d; } else if (side === 2) { x = i; y = 15 - d; } else if (side === 3) { x = d; y = i; } else { x = 15 - d; y = i; }
          g.drawImage(tex, x, y, 1, 1, x, y, 1, 1);
        }
        // 가장자리 외곽선 + 그림자
        let ox, oy, sx, sy;
        if (side === 0) { ox = i; oy = depth; sx = i; sy = depth + 1; } else if (side === 2) { ox = i; oy = 15 - depth; sx = -1; } else if (side === 3) { ox = depth; oy = i; sx = depth + 1; sy = i; } else { ox = 15 - depth; oy = i; sx = -1; }
        g.fillStyle = season === 3 ? P[4] : P[4];
        g.fillRect(ox, oy, 1, 1);
        if (sx >= 0) { g.fillStyle = D[3]; g.globalAlpha = 0.45; g.fillRect(sx, sy, 1, 1); g.globalAlpha = 1; }
      }
      return c;
    });
  }
  // 대각선 모서리 조각
  function grassCorner(season, corner) {
    return X.cached(`tile:gcorner:${season}:${corner}`, () => {
      const P = Tiles.pal(season).grass;
      const c = X.canvas(16, 16);
      const g = X.ctx(c);
      const rows = ['ggo', 'go.', 'o..'];
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        const px = corner === 1 || corner === 2 ? 15 - x : x;
        const py = corner >= 2 ? 15 - y : y;
        g.fillStyle = ch === 'g' ? P[2] : P[4];
        g.fillRect(px, py, 1, 1);
      }
      return c;
    });
  }

  const isGrassy = (id) => id === 'grass';

  // ───────────── 타일 정의 ─────────────
  Tiles.define('grass', {
    diggable: true, step: 'grass',
    bake(g, px, py, T) {
      const v = U.hash2(T.x, T.y, 7) % 8;
      g.drawImage(grassTex(T.season, v), px, py);
    },
  });
  Tiles.define('dirt', {
    diggable: true, step: 'dirt',
    bake(g, px, py, T) {
      const v = U.hash2(T.x, T.y, 11) % 4;
      g.drawImage(dirtTex(T.season, v), px, py);
      const gv = U.hash2(T.x, T.y, 5) % 4;
      const n = [T.at(0, -1), T.at(1, 0), T.at(0, 1), T.at(-1, 0)].map(isGrassy);
      for (let s = 0; s < 4; s++) if (n[s]) g.drawImage(grassFringe(T.season, s, gv), px, py);
      if (!n[0] && !n[3] && isGrassy(T.at(-1, -1))) g.drawImage(grassCorner(T.season, 0), px, py);
      if (!n[0] && !n[1] && isGrassy(T.at(1, -1))) g.drawImage(grassCorner(T.season, 1), px, py);
      if (!n[2] && !n[1] && isGrassy(T.at(1, 1))) g.drawImage(grassCorner(T.season, 2), px, py);
      if (!n[2] && !n[3] && isGrassy(T.at(-1, 1))) g.drawImage(grassCorner(T.season, 3), px, py);
    },
  });
  // 흙길 (밭으로 갈 수 없음: 마을 길 등)
  Tiles.define('path', {
    diggable: false, step: 'dirt',
    bake(g, px, py, T) { Tiles.get('dirt').bake(g, px, py, T); },
  });

  Tiles.define('water', {
    solid: true, water: true, step: 'water',
    bake(g, px, py, T) {
      const W = T.season === 3 ? WATER_W : WATER;
      const r = U.mulberry32(U.hash2(T.x, T.y, 3));
      g.fillStyle = W[2]; g.fillRect(px, py, 16, 16);
      for (let i = 0; i < 10; i++) { g.fillStyle = r() < 0.6 ? W[3] : W[1]; g.fillRect(px + Math.floor(r() * 16), py + Math.floor(r() * 16), Math.ceil(r() * 2), 1); }
      const land = (dx, dy) => { const id = T.at(dx, dy); const d = Tiles.get(id); return !(d && d.water); };
      const D = Tiles.pal(T.season).dirt;
      if (land(0, -1)) {
        // 북쪽 기슭: 흙벽 + 물에 비친 그림자
        g.fillStyle = D[2]; g.fillRect(px, py, 16, 3);
        g.fillStyle = D[1];
        for (let x = 0; x < 16; x += 3) g.fillRect(px + x + (U.hash2(T.x, x, 1) % 2), py, 1, 2);
        g.fillStyle = D[3]; g.fillRect(px, py + 3, 16, 1);
        g.fillStyle = W[4]; g.fillRect(px, py + 4, 16, 2);
        g.fillStyle = W[3]; g.fillRect(px, py + 6, 16, 1);
      }
      g.fillStyle = W[0];
      if (land(0, 1)) { g.fillRect(px, py + 15, 16, 1); g.fillStyle = W[1]; g.fillRect(px, py + 14, 16, 1); g.fillStyle = W[0]; }
      if (land(-1, 0)) { g.fillRect(px, py + (land(0, -1) ? 4 : 0), 1, 16 - (land(0, -1) ? 4 : 0)); g.fillStyle = W[1]; g.fillRect(px + 1, py + (land(0, -1) ? 4 : 0), 1, 16 - (land(0, -1) ? 4 : 0)); g.fillStyle = W[0]; }
      if (land(1, 0)) { g.fillRect(px + 15, py + (land(0, -1) ? 4 : 0), 1, 16 - (land(0, -1) ? 4 : 0)); g.fillStyle = W[1]; g.fillRect(px + 14, py + (land(0, -1) ? 4 : 0), 1, 16 - (land(0, -1) ? 4 : 0)); }
      if (!land(0, -1) && land(-1, -1)) { g.fillStyle = D[2]; g.fillRect(px, py, 2, 2); }
      if (!land(0, -1) && land(1, -1)) { g.fillStyle = D[2]; g.fillRect(px + 14, py, 2, 2); }
      // 둥근 모서리: 두 방향이 땅이면 땅이 물 쪽으로 둥글게 들어온다
      const landCol = (dx, dy) => {
        const id = T.at(dx, dy);
        const gp = Tiles.pal(T.season).grass;
        return id === 'grass' ? [gp[2], gp[4]] : [D[1], D[3]];
      };
      const corner = (cx, cy, sx, sy, col) => {
        // (cx, cy): 모서리 픽셀, sx/sy: 안쪽 방향
        const R = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [0, 2], [0, 3], [2, 1], [1, 2]];
        for (const [a, b] of R) { g.fillStyle = col[0]; g.fillRect(px + cx + a * sx, py + cy + b * sy, 1, 1); }
        g.fillStyle = W[0];
        for (const [a, b] of [[4, 0], [3, 1], [2, 2], [1, 3], [0, 4]]) g.fillRect(px + cx + a * sx, py + cy + b * sy, 1, 1);
        g.fillStyle = col[1];
        for (const [a, b] of [[3, 0], [2, 1], [1, 2], [0, 3]]) g.fillRect(px + cx + a * sx, py + cy + b * sy, 1, 1);
      };
      if (land(0, 1) && land(-1, 0)) corner(0, 15, 1, -1, landCol(-1, 0));
      if (land(0, 1) && land(1, 0)) corner(15, 15, -1, -1, landCol(1, 0));
      if (land(0, -1) && land(-1, 0)) corner(0, 4, 1, 1, [D[2], D[3]]);
      if (land(0, -1) && land(1, 0)) corner(15, 4, -1, 1, [D[2], D[3]]);
    },
    // 천천히 흐르는 반짝임
    anim(g, px, py, T, t) {
      const W = T.season === 3 ? WATER_W : WATER;
      const h = U.hash2(T.x, T.y, 9);
      const topCut = (() => { const d = Tiles.get(T.at(0, -1)); return d && d.water ? 0 : 7; })();
      for (let i = 0; i < 2; i++) {
        const sp = 2.5 + ((h >>> (i * 4)) % 5) * 0.4;
        const ph = ((h >>> (i * 3)) % 16) + t * sp;
        const x = Math.floor(ph % 18) - 2;
        const y = topCut + 2 + ((h >>> (i * 5)) % Math.max(1, 12 - topCut)) ;
        const tw = Math.sin(t * 2 + h + i) * 0.5 + 0.5;
        if (y >= 15) continue;
        g.fillStyle = tw > 0.5 ? W[0] : W[1];
        g.fillRect(px + Math.max(0, x), py + y, Math.max(0, Math.min(3, 16 - x)), 1);
      }
    },
  });

  // 절벽면 (지나갈 수 없음). 위 칸이 절벽이 아니면 잔디 턱, 아래가 아니면 밑동
  Tiles.define('cliff', {
    solid: true, step: 'stone',
    bake(g, px, py, T) {
      const R = T.season === 3 ? ROCK_W : ROCK;
      const isC = (dx, dy) => T.at(dx, dy) === 'cliff';
      const top = !isC(0, -1), bot = !isC(0, 1), left = !isC(-1, 0), right = !isC(1, 0);
      // 울퉁불퉁한 바위 덩어리 (월드 좌표 보로노이 → 칸 경계가 이어진다)
      const wx0 = T.x * 16, wy0 = T.y * 16;
      const pt = (cx, cy) => { const h = U.hash2(cx, cy, 31); return [cx * 7 + (h % 7), cy * 6 + ((h >>> 4) % 6)]; };
      // 절벽 위에서 몇 칸째인지 (아래로 갈수록 어둡게)
      let depth = 0;
      while (depth < 4 && isC(0, -depth - 1)) depth++;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const wx = wx0 + x, wy = wy0 + y;
          const cx = Math.floor(wx / 7), cy = Math.floor(wy / 6);
          let d1 = 1e9, d2 = 1e9, best = null;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const [qx, qy] = pt(cx + ox, cy + oy);
            const d = (wx - qx) * (wx - qx) * 0.8 + (wy - qy) * (wy - qy) * 1.3;
            if (d < d1) { d2 = d1; d1 = d; best = [qx, qy]; } else if (d < d2) d2 = d;
          }
          let tone;
          const edge = Math.sqrt(d2) - Math.sqrt(d1);
          if (edge < 1.1) tone = 4;
          else {
            const dx = wx - best[0], dy = wy - best[1];
            tone = dy < -1.5 && dx < 1.5 ? 0 : dy > 1.5 || dx > 2.5 ? 2 : 1;
            if (edge < 2.1 && dy > 0) tone = 3;
          }
          if (depth + y / 16 > 1.6 && tone < 3 && U.hash2(wx, wy, 5) % 3 === 0) tone++;
          g.fillStyle = R[tone];
          g.fillRect(px + x, py + y, 1, 1);
        }
      }
      if (bot) {
        g.fillStyle = R[3]; g.fillRect(px, py + 13, 16, 3);
        g.fillStyle = R[4]; g.fillRect(px, py + 15, 16, 1);
        g.fillStyle = R[2];
        for (let x = 1; x < 16; x += 5) g.fillRect(px + x + (U.hash2(T.x, x, 2) % 3), py + 13, 2, 1);
      }
      if (left) { g.fillStyle = R[0]; g.fillRect(px, py, 1, 16); g.fillStyle = R[1]; g.fillRect(px + 1, py, 1, 16); }
      if (right) { g.fillStyle = R[3]; g.fillRect(px + 14, py, 1, 16); g.fillStyle = R[4]; g.fillRect(px + 15, py, 1, 16); }
      if (top) {
        // 윗면 잔디가 턱처럼 걸쳐 있다
        const P = Tiles.pal(T.season).grass;
        const tex = grassTex(T.season, U.hash2(T.x, T.y, 3) % 8);
        for (let x = 0; x < 16; x++) {
          const d = 3 + (U.hash2(T.x * 16 + x, T.y, 4) % 3 === 0 ? 1 : 0) + (x % 7 === 3 ? 1 : 0);
          g.drawImage(tex, x, 0, 1, d, px + x, py, 1, d);
          g.fillStyle = P[4]; g.fillRect(px + x, py + d, 1, 1);
          g.fillStyle = 'rgba(30,15,5,0.35)'; g.fillRect(px + x, py + d + 1, 1, 2);
        }
      }
    },
  });
  // 절벽 계단
  Tiles.define('stairs', {
    step: 'stone',
    bake(g, px, py, T) {
      const R = T.season === 3 ? ROCK_W : ROCK;
      g.fillStyle = R[1]; g.fillRect(px, py, 16, 16);
      for (let y = 0; y < 16; y += 4) {
        g.fillStyle = R[0]; g.fillRect(px, py + y, 16, 1);
        g.fillStyle = R[2]; g.fillRect(px, py + y + 3, 16, 1);
      }
      const side = (dx) => T.at(dx, 0) === 'cliff';
      if (side(-1)) { g.fillStyle = R[3]; g.fillRect(px, py, 2, 16); }
      if (side(1)) { g.fillStyle = R[3]; g.fillRect(px + 14, py, 2, 16); }
      if (T.season === 3) { g.fillStyle = '#ffffff'; for (let y = 0; y < 16; y += 4) g.fillRect(px + 3, py + y, 10, 1); }
    },
  });
  // 숲 가장자리(나무 밑 어두운 땅). 나무는 장식으로 따로 그린다
  Tiles.define('forest', {
    solid: true, step: 'grass',
    bake(g, px, py, T) {
      const F = Tiles.pal(T.season).forest;
      const r = U.mulberry32(U.hash2(T.x, T.y, 41));
      g.fillStyle = F[1]; g.fillRect(px, py, 16, 16);
      for (let i = 0; i < 14; i++) { g.fillStyle = r() < 0.5 ? F[0] : F[2]; g.fillRect(px + Math.floor(r() * 16), py + Math.floor(r() * 16), 2, 1); }
      if (T.season === 3) { for (let i = 0; i < 8; i++) { g.fillStyle = '#e8eef6'; g.fillRect(px + Math.floor(r() * 16), py + Math.floor(r() * 16), 2, 1); } }
    },
  });
  Tiles.define('void', { solid: true, bake(g, px, py) { g.fillStyle = '#0c0806'; g.fillRect(px, py, 16, 16); } });

  // ── 실내 ──
  const FLOOR = ['#e0a468', '#c98a50', '#a8703e', '#83542c', '#5e3a1e'];
  Tiles.define('floor', {
    step: 'wood',
    bake(g, px, py, T) {
      // 가로 널빤지 (4px 높이), 줄마다 이음새 위치가 다르다
      g.fillStyle = FLOOR[1]; g.fillRect(px, py, 16, 16);
      for (let row = 0; row < 4; row++) {
        const y = py + row * 4;
        const wy = T.y * 4 + row;
        const shade = U.hash2(0, wy, 3) % 3;
        g.fillStyle = [FLOOR[1], FLOOR[2], FLOOR[1]][shade];
        g.fillRect(px, y, 16, 4);
        g.fillStyle = FLOOR[0]; g.fillRect(px, y, 16, 1);
        g.fillStyle = FLOOR[3]; g.fillRect(px, y + 3, 16, 1);
        const seam = (U.hash2(1, wy, 5) % 32);
        const sx = seam - (T.x * 16) % 32;
        for (const s of [sx, sx + 32, sx - 32]) if (s >= 0 && s < 16) { g.fillStyle = FLOOR[4]; g.fillRect(px + s, y, 1, 4); }
        // 나뭇결
        const k = U.hash2(T.x, wy, 9);
        if (k % 3 === 0) { g.fillStyle = FLOOR[2]; g.fillRect(px + (k >>> 3) % 12, y + 2, 3, 1); }
      }
      if (T.at(0, -1) !== 'floor' && T.at(0, -1) !== 'mat') { g.fillStyle = 'rgba(30,15,5,0.35)'; g.fillRect(px, py, 16, 3); }
    },
  });
  Tiles.define('mat', {
    step: 'wood',
    bake(g, px, py, T) {
      Tiles.get('floor').bake(g, px, py, T);
      g.fillStyle = '#6a2e22'; g.fillRect(px + 1, py + 3, 14, 11);
      g.fillStyle = '#a8483a'; g.fillRect(px + 2, py + 4, 12, 9);
      g.fillStyle = '#c8684a';
      for (let x = 3; x < 13; x += 2) g.fillRect(px + x, py + 5, 1, 7);
    },
  });
  // 벽지(위) — 크림색 바탕에 작은 똥 무늬(!)와 세로 줄
  Tiles.define('wall', {
    solid: true, step: 'wood',
    bake(g, px, py, T) {
      g.fillStyle = '#e8d2a2'; g.fillRect(px, py, 16, 16);
      g.fillStyle = '#d8bc88';
      for (let x = 0; x < 16; x += 4) g.fillRect(px + x, py, 1, 16);
      if ((T.x + T.y) % 2 === 0) {
        g.fillStyle = '#b88a58'; g.fillRect(px + 9, py + 7, 3, 1); g.fillRect(px + 10, py + 6, 1, 1);
        g.fillStyle = '#a07040'; g.fillRect(px + 8, py + 8, 5, 1);
      }
      if (T.at(0, -1) !== 'wall') { g.fillStyle = '#5a3418'; g.fillRect(px, py, 16, 2); g.fillStyle = '#8a5a30'; g.fillRect(px, py + 2, 16, 1); }
    },
  });
  // 징두리 판벽(아래) + 걸레받이
  Tiles.define('wallBase', {
    solid: true, step: 'wood',
    bake(g, px, py) {
      g.fillStyle = '#9a6034'; g.fillRect(px, py, 16, 16);
      g.fillStyle = '#6e3e1e'; g.fillRect(px, py, 16, 2);
      g.fillStyle = '#c88450'; g.fillRect(px, py + 2, 16, 1);
      for (let x = 0; x < 16; x += 8) {
        g.fillStyle = '#7a4622'; g.fillRect(px + x, py + 3, 1, 10);
        g.fillStyle = '#b07440'; g.fillRect(px + x + 1, py + 3, 1, 10);
      }
      g.fillStyle = '#5a2e14'; g.fillRect(px, py + 13, 16, 3);
      g.fillStyle = '#7a4622'; g.fillRect(px, py + 13, 16, 1);
    },
  });
  Tiles.define('wallTop', {
    solid: true, step: 'wood',
    bake(g, px, py, T) {
      g.fillStyle = '#2e1a0e'; g.fillRect(px, py, 16, 16);
      g.fillStyle = '#4a2c18';
      if (T.at(0, 1) === 'floor' || T.at(0, 1) === 'mat') { g.fillRect(px, py + 13, 16, 3); }
      if (T.at(1, 0) === 'floor') g.fillRect(px + 13, py, 3, 16);
      if (T.at(-1, 0) === 'floor') g.fillRect(px, py, 3, 16);
    },
  });

  // ───────────── 괭이로 간 흙 (16가지 자동 타일) ─────────────
  // mask 비트: 1 위, 2 오른쪽, 4 아래, 8 왼쪽 이웃이 같은 흙
  const SOIL = ['#a87048', '#8c5a36', '#744828', '#5a361c', '#40240f'];
  const SOIL_WET = ['#7a5034', '#5e3a22', '#4c2e1a', '#3c2212', '#2a160a'];
  Tiles.hoeDirt = function (mask, wet) {
    return X.cached(`hoedirt:${mask}:${wet ? 1 : 0}`, () => {
      const P = wet ? SOIL_WET : SOIL;
      const c = X.canvas(16, 16);
      const g = X.ctx(c);
      const r = U.mulberry32(77 + mask * 3 + (wet ? 1000 : 0));
      const up = mask & 1, rt = mask & 2, dn = mask & 4, lf = mask & 8;
      const x0 = lf ? 0 : 1, x1 = rt ? 16 : 15, y0 = up ? 0 : 1, y1 = dn ? 16 : 15;
      g.fillStyle = P[2]; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      // 흙덩이 질감
      for (let i = 0; i < 26; i++) {
        const x = x0 + Math.floor(r() * (x1 - x0)), y = y0 + Math.floor(r() * (y1 - y0));
        const k = r();
        g.fillStyle = k < 0.45 ? P[3] : k < 0.85 ? P[1] : P[0];
        g.fillRect(x, y, k < 0.3 ? 2 : 1, 1);
      }
      // 가장자리: 위는 움푹 꺼진 그림자, 아래는 밝은 턱
      if (!up) { g.fillStyle = P[4]; g.fillRect(x0, 1, x1 - x0, 1); g.fillStyle = P[3]; g.fillRect(x0, 2, x1 - x0, 1); }
      if (!dn) { g.fillStyle = P[0]; g.fillRect(x0, 14, x1 - x0, 1); g.fillStyle = P[1]; g.fillRect(x0, 13, x1 - x0, 1); }
      if (!lf) { g.fillStyle = P[4]; g.fillRect(1, y0, 1, y1 - y0); g.fillStyle = P[3]; g.fillRect(2, y0 + (up ? 0 : 2), 1, y1 - y0 - (up ? 0 : 2) - (dn ? 0 : 2)); }
      if (!rt) { g.fillStyle = P[1]; g.fillRect(14, y0, 1, y1 - y0); g.fillStyle = P[0]; g.fillRect(14, y0 + (up ? 0 : 2), 1, y1 - y0 - (up ? 0 : 2) - (dn ? 0 : 2)); }
      // 둥근 모서리
      g.clearRect(0, 0, 0, 0);
      const corner = (cx, cy) => { g.clearRect(cx, cy, 1, 1); };
      if (!up && !lf) corner(1, 1);
      if (!up && !rt) corner(14, 1);
      if (!dn && !lf) corner(1, 14);
      if (!dn && !rt) corner(14, 14);
      if (wet) {
        // 젖은 흙의 윤기
        g.fillStyle = 'rgba(160,190,230,0.10)';
        for (let i = 0; i < 4; i++) g.fillRect(x0 + 2 + Math.floor(r() * (x1 - x0 - 5)), y0 + 3 + Math.floor(r() * (y1 - y0 - 6)), 2, 1);
      }
      return c;
    });
  };

  // 절벽 아래 땅에 드리우는 그림자 (렌더러가 베이크할 때 호출)
  Tiles.postBake = function (g, px, py, T) {
    const id = T.at(0, 0);
    const above = T.at(0, -1);
    if ((above === 'cliff') && id !== 'cliff') {
      g.fillStyle = 'rgba(20,10,5,0.32)'; g.fillRect(px, py, 16, 2);
      g.fillStyle = 'rgba(20,10,5,0.16)'; g.fillRect(px, py + 2, 16, 2);
    }
    if (T.at(-1, 0) === 'cliff' && id !== 'cliff' && id !== 'stairs') { g.fillStyle = 'rgba(20,10,5,0.18)'; g.fillRect(px, py, 2, 16); }
  };
})();
