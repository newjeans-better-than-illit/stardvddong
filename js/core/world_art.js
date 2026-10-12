'use strict';
// ════════════════════════════════════════════════════════════════════
//  월드 아트: 나무(참나무·단풍나무·소나무, 5단계, 계절), 잡동사니(돌·나뭇가지·잡초),
//  큰 그루터기·통나무·바위, 덤불, 풀, 농가, 출하함, 실내 가구
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const X = SD.gfx;
  const U = SD.util;
  const A = SD.Art;
  const Shp = A.Shp;

  const BARK = ['#b8844e', '#8f5f34', '#6e4424', '#4e2e16'];
  const BARK_PINE = ['#a87a52', '#7e5636', '#5e3e26', '#3e2818'];
  const RING = ['#f0cc8e', '#d6a868', '#b88448'];

  // 나무 종류별 잎 색 [봄, 여름, 가을, 겨울]
  const LEAVES = {
    oak: [
      ['#b6e46a', '#7cc244', '#56a234', '#3c7e28', '#2a5e1e'],
      ['#8ed056', '#5aa83a', '#3f8a2e', '#2e6c24', '#1f4e1a'],
      ['#f6c25a', '#e2902e', '#c06a22', '#94481a', '#6a3014'],
      null,
    ],
    maple: [
      ['#c4ec7a', '#8ccf4e', '#62ad38', '#45892a', '#2f6620'],
      ['#9ad85c', '#68b440', '#4a9632', '#367626', '#24561c'],
      ['#ff9a5a', '#ec5a30', '#c63a24', '#94241c', '#681814'],
      null,
    ],
    pine: [
      ['#7cc080', '#4e9a5e', '#357a48', '#255e38', '#18422a'],
      ['#6cb070', '#428a50', '#2e6c40', '#205232', '#163a24'],
      ['#7aa868', '#4e8048', '#386638', '#284e2a', '#1a3820'],
      ['#6a9a80', '#3e7660', '#2c5c4a', '#1e4436', '#142e24'],
    ],
  };
  A.LEAVES = LEAVES;
  A.leafColor = (kind, season) => (LEAVES[kind][season] || LEAVES[kind][1])[1];

  // 잎 질감: 밝은 점 무더기와 어두운 점
  function leafTex(ramp, seed) {
    return (x, y, tone) => {
      const h = U.hash2(x, y, seed);
      if (tone === 1 && h % 11 === 0) return ramp[0];
      if (tone === 1 && h % 13 === 0) return ramp[2];
      if (tone === 0 && h % 7 === 0) return ramp[1];
      if (tone === 2 && h % 9 === 0) return ramp[3];
      return null;
    };
  }

  // ───────────── 다 자란 나무: 수관(잎) 48×80 ─────────────
  // 원점: 캔버스 (24, 78) 이 줄기 꼭대기 근처에 오도록 그린다
  A.treeTop = function (kind, season, v) {
    return X.cached(`tree:top:${kind}:${season}:${v || 0}`, () => {
      const W = 48, H = 80;
      const S = new Shp(W, H);
      const ramp = LEAVES[kind][season];
      const r = U.mulberry32(500 + (v || 0) * 37 + kind.length);
      if (!ramp) {
        // 겨울 앙상한 가지 (+눈)
        const c = X.canvas(W, H);
        const g = X.ctx(c);
        const br = (x0, y0, x1, y1, w) => { X.line(g, x0, y0, x1, y1, BARK[2]); if (w > 1) X.line(g, x0 + 1, y0, x1 + 1, y1, BARK[1]); };
        br(24, 79, 24, 40, 2); br(23, 79, 23, 44, 1);
        br(24, 60, 10, 38, 2); br(24, 56, 38, 34, 2); br(24, 46, 16, 22, 2); br(24, 44, 32, 18, 2);
        br(12, 40, 6, 30, 1); br(36, 36, 42, 26, 1); br(16, 24, 12, 14, 1); br(32, 20, 36, 10, 1); br(24, 40, 24, 12, 2);
        br(10, 38, 4, 40, 1); br(38, 34, 44, 36, 1); br(24, 14, 20, 6, 1); br(24, 14, 28, 5, 1);
        X.outline(c, { amount: 0.5 });
        // 가지 위 눈
        const d = g.getImageData(0, 0, W, H).data;
        g.fillStyle = '#ffffff';
        for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4, j = ((y - 1) * W + x) * 4;
          if (d[i + 3] > 0 && d[j + 3] === 0 && U.hash2(x, y, 4) % 3 !== 0) g.fillRect(x, y - 1, 1, 1);
        }
        return c;
      }
      const tex = leafTex(ramp, 17 + (v || 0));
      if (kind === 'pine') {
        // 층층이 쌓인 삼각 잎
        const tiers = 4;
        for (let i = tiers - 1; i >= 0; i--) {
          const top = 4 + i * 15, bot = top + 26 + i * 2;
          const half = 9 + i * 5.2;
          S.add((x, y) => {
            if (y < top || y > bot) return false;
            const t = (y - top) / (bot - top);
            const jag = ((x + i * 3) % 6 < 3 ? 1 : 0) * (t > 0.85 ? 2 : 0);
            const hw = half * Math.pow(t, 0.85) + 1;
            return Math.abs(x + 0.5 - 24) <= hw && y <= bot - jag;
          }, ramp, { group: 'leaf', tex });
        }
        // 위층이 아래층을 덮도록 순서를 거꾸로 했으므로 그림자는 직접
      } else {
        const blobs = kind === 'oak'
          ? [[24, 60, 19, 13], [11, 52, 10, 10], [37, 52, 10, 10], [24, 46, 17, 13], [12, 36, 10, 10], [36, 36, 10, 10], [24, 30, 15, 12], [16, 18, 9, 8], [32, 18, 9, 8], [24, 12, 10, 8]]
          : [[24, 62, 17, 11], [11, 54, 9, 9], [37, 54, 9, 9], [24, 48, 15, 11], [13, 40, 9, 9], [35, 40, 9, 9], [24, 33, 13, 10], [16, 24, 8, 8], [32, 24, 8, 8], [24, 18, 10, 9], [24, 8, 6, 6]];
        for (const [cx, cy, rx, ry] of blobs) {
          const jx = (r() - 0.5) * 2, jy = (r() - 0.5) * 2;
          S.ellipse(cx + jx, cy + jy, rx, ry, ramp, { group: 'leaf', tex }, 2.1);
        }
      }
      const c = S.render();
      // 봄 참나무 꽃 / 가을 열매 장식
      const g = X.ctx(c);
      if (kind === 'maple' && season === 2) {
        const dd = g.getImageData(0, 0, W, H).data;
        for (let i = 0; i < 30; i++) {
          const x = Math.floor(r() * W), y = Math.floor(r() * H);
          if (dd[(y * W + x) * 4 + 3] > 0) X.px(g, x, y, '#ffd25a');
        }
      }
      if (kind === 'oak' && season === 0) {
        const dd = g.getImageData(0, 0, W, H).data;
        for (let i = 0; i < 26; i++) {
          const x = Math.floor(r() * W), y = Math.floor(r() * H);
          if (dd[(y * W + x) * 4 + 3] > 0) X.px(g, x, y, i % 2 ? '#fff4f8' : '#f8c8dc');
        }
      }
      X.outline(c);
      if (season === 3 && kind === 'pine') {
        // 소나무 눈
        const d = g.getImageData(0, 0, W, H).data;
        g.fillStyle = '#ffffff';
        for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4, j = ((y - 1) * W + x) * 4;
          if (d[i + 3] > 0 && (d[j + 3] === 0 || U.hash2(x, y, 9) % 23 === 0)) { g.fillRect(x, y, 1, 1); if (U.hash2(x, y, 3) % 2) g.fillRect(x, y + 1, 1, 1); }
        }
      }
      return c;
    });
  };

  // 줄기 (16×40): 바닥 = 타일 아래, 위쪽은 수관에 가려진다
  A.treeTrunk = function (kind, season) {
    return X.cached(`tree:trunk:${kind}:${season}`, () => {
      const S = new Shp(16, 40);
      const B = kind === 'pine' ? BARK_PINE : BARK;
      const tex = (x, y, tone) => (tone === 1 && (x === 6 || x === 9) && U.hash2(x, y, 2) % 3 ? B[2] : tone === 1 && x === 7 && y % 5 === 0 ? B[0] : null);
      S.add((x, y) => {
        if (y < 0 || y > 37) return false;
        const flare = y > 32 ? (y - 32) * 0.7 : 0;
        return Math.abs(x + 0.5 - 8) <= 3 + flare;
      }, B, { group: 'bark', tex });
      // 뿌리
      S.leaf(5, 35, 4, Math.PI * 0.85, 1.2, B, { group: 'root' });
      S.leaf(11, 35, 4, Math.PI * 0.15, 1.2, B, { group: 'root' });
      const c = X.outline(S.render());
      if (season === 3) { const g = X.ctx(c); g.fillStyle = '#ffffff'; g.fillRect(3, 36, 2, 1); g.fillRect(11, 36, 3, 1); }
      return c;
    });
  };
  // 그루터기 16×24
  A.stump = function (kind, season) {
    return X.cached(`tree:stump:${kind}:${season}`, () => {
      const S = new Shp(16, 24);
      const B = kind === 'pine' ? BARK_PINE : BARK;
      S.add((x, y) => y >= 9 && y <= 21 && Math.abs(x + 0.5 - 8) <= 4.5 + (y > 18 ? (y - 18) * 0.8 : 0), B, { group: 'bark', tex: (x, y, t) => (t === 1 && x % 3 === 0 ? B[2] : null) });
      S.leaf(4, 20, 4, Math.PI * 0.9, 1.3, B, { group: 'root' });
      S.leaf(12, 20, 4, Math.PI * 0.1, 1.3, B, { group: 'root' });
      S.ellipse(8, 9.5, 4.6, 2.2, RING, { group: 'ring', flat: true });
      const c = S.render();
      const g = X.ctx(c);
      X.px(g, 6, 9, RING[2], 4, 1); X.px(g, 7, 10, RING[2], 2, 1); X.px(g, 5, 8, RING[0], 2, 1);
      X.outline(c);
      if (season === 3) { g.fillStyle = '#ffffff'; g.fillRect(4, 7, 8, 2); }
      return c;
    });
  };
  // 어린 나무 단계 (1 새싹, 2 묘목, 3 어린나무) 32×40, 바닥 가운데 (16, 38)
  A.youngTree = function (kind, stage, season) {
    return X.cached(`tree:young:${kind}:${stage}:${season}`, () => {
      const S = new Shp(32, 40);
      const ramp = LEAVES[kind][season] || LEAVES[kind][1];
      const B = kind === 'pine' ? BARK_PINE : BARK;
      const bare = !LEAVES[kind][season];
      if (stage === 1) {
        S.stem(16, 37, 16, 33, '#5a8a34');
        if (!bare) { S.leaf(16, 34, 4, Math.PI * 0.85, 1.6, ramp); S.leaf(17, 34, 4, Math.PI * 0.15, 1.6, ramp); }
      } else if (stage === 2) {
        S.add((x, y) => (x === 16) && y >= 24 && y <= 37, B, { group: 'bark', flat: true });
        if (!bare) {
          if (kind === 'pine') {
            S.add((x, y) => y >= 20 && y <= 34 && Math.abs(x + 0.5 - 16.5) <= (y - 20) * 0.45 + 0.5, ramp, { group: 'leaf' });
          } else {
            S.ellipse(13, 29, 3.5, 3, ramp, { group: 'leaf' });
            S.ellipse(20, 27, 3.5, 3, ramp, { group: 'leaf' });
            S.ellipse(16, 23, 4, 3.5, ramp, { group: 'leaf' });
          }
        }
      } else {
        S.add((x, y) => y >= 22 && y <= 37 && Math.abs(x + 0.5 - 16.5) <= 1.5 + (y > 34 ? 1 : 0), B, { group: 'bark' });
        if (!bare) {
          if (kind === 'pine') {
            for (let i = 2; i >= 0; i--) {
              const top = 4 + i * 8, bot = top + 14;
              S.add((x, y) => y >= top && y <= bot && Math.abs(x + 0.5 - 16.5) <= (y - top) * (0.45 + i * 0.08) + 0.5, ramp, { group: 'leaf' });
            }
          } else {
            S.ellipse(16, 24, 10, 7, ramp, { group: 'leaf' }, 2.1);
            S.ellipse(10, 18, 6, 5, ramp, { group: 'leaf' }, 2.1);
            S.ellipse(22, 18, 6, 5, ramp, { group: 'leaf' }, 2.1);
            S.ellipse(16, 12, 7, 6, ramp, { group: 'leaf' }, 2.1);
          }
        } else {
          S.stem(16, 24, 11, 14, B[1]); S.stem(17, 24, 22, 12, B[1]); S.stem(16, 22, 16, 9, B[1]);
        }
      }
      const c = X.outline(S.render());
      if (season === 3 && !bare) {
        const g = X.ctx(c);
        const d = g.getImageData(0, 0, 32, 40).data;
        g.fillStyle = '#ffffff';
        for (let y = 1; y < 40; y++) for (let x = 0; x < 32; x++) if (d[(y * 32 + x) * 4 + 3] > 0 && d[((y - 1) * 32 + x) * 4 + 3] === 0) g.fillRect(x, y, 1, 1);
      }
      return c;
    });
  };
  A.treeSeed = function (kind) {
    const item = { oak: 'acorn', maple: 'maple_seed', pine: 'pine_cone' }[kind];
    return X.cached(`tree:seed:${kind}`, () => {
      const c = X.canvas(16, 16);
      const g = X.ctx(c);
      g.globalAlpha = 1;
      g.drawImage(SD.Items.icon(item), 3, 5, 10, 10);
      return c;
    });
  };

  // ───────────── 잡동사니 ─────────────
  A.stoneObj = function (v, season) {
    return X.cached(`obj:stone:${v}:${season}`, () => {
      const [c, g] = A.blank(16, 16);
      const base = v % 2 ? '#a19d92' : '#9a948a';
      const R = X.ramp(base);
      R.push(X.light(base, 0.6));
      if (v % 2) A.blob(g, [[8, 10, 6, 4.4], [6, 8, 4, 3.2], [10.5, 8.5, 3.5, 3]], R);
      else A.blob(g, [[7.5, 10.5, 5.5, 4], [9.5, 8, 4.5, 3.6]], R);
      X.px(g, 5, 8, R[0], 2, 1); X.px(g, 9, 7, R[0]);
      X.px(g, 10, 11, R[3]); X.px(g, 11, 10, R[3]); X.px(g, 6, 12, R[2]);
      X.outline(c);
      if (season === 3) { g.fillStyle = '#ffffff'; g.fillRect(5, 5, 6, 1); g.fillRect(6, 4, 3, 1); }
      return c;
    });
  };
  A.twigObj = function (v, season) {
    return X.cached(`obj:twig:${v}:${season}`, () => {
      const c = X.canvas(16, 16);
      const g = X.ctx(c);
      const W = ['#c08a50', '#94643a', '#6e4626'];
      const stick = (x0, y0, x1, y1) => { X.line(g, x0, y0, x1, y1, W[1]); X.line(g, x0, y0 - 1, x1, y1 - 1, W[0]); X.line(g, x0 + 1, y0 + 1, x1 + 1, y1 + 1, W[2]); };
      if (v % 2) { stick(2, 12, 13, 7); stick(4, 7, 12, 13); X.px(g, 8, 6, '#5fae3e'); X.px(g, 9, 5, '#5fae3e'); }
      else { stick(1, 10, 14, 11); stick(5, 13, 10, 7); X.px(g, 3, 9, '#5fae3e'); }
      X.outline(c);
      if (season === 3) { g.fillStyle = '#ffffff'; g.fillRect(4, 8, 4, 1); }
      return c;
    });
  };
  const WEED_COL = [
    ['#a8e070', '#6cbf45', '#468f32', '#2f6a26'],
    ['#8ed05a', '#4f9e34', '#3a7e28', '#285a1e'],
    ['#e8b45a', '#c8823a', '#a05a26', '#7a401a'],
    ['#c8d4e0', '#98a8b8', '#78889a', '#566676'],
  ];
  A.weedObj = function (v, season) {
    return X.cached(`obj:weed:${v}:${season}`, () => {
      const S = new Shp(16, 16);
      const R = WEED_COL[season];
      const r = U.mulberry32(91 + v * 13 + season);
      const n = 6 + (v % 2);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        S.leaf(8 + (t - 0.5) * 6, 14, 6 + r() * 4, -Math.PI / 2 + (t - 0.5) * 2.2, 1.6, R);
      }
      const c = X.outline(S.render());
      const g = X.ctx(c);
      if (season === 0 && v % 2) { X.px(g, 6, 5, '#ffffff'); X.px(g, 11, 4, '#fff27a'); }
      if (season === 1 && v % 2) { X.px(g, 9, 3, '#ffe36a'); }
      if (season === 3) { X.px(g, 7, 4, '#ffffff', 3, 1); }
      return c;
    });
  };

  // ───────────── 풀 (Grass): 한 포기 8×12 ─────────────
  const GRASS_COL = [
    ['#b4e878', '#7cc84a', '#58a836', '#3e8228'],
    ['#98d86a', '#5cb03e', '#428e30', '#2e6e22'],
    ['#f0c870', '#d8a048', '#b47a32', '#8a5622'],
    ['#d8e8f0', '#a8c0d4', '#8aa2b8', '#6a8298'],
  ];
  A.grassTuft = function (season, v) {
    return X.cached(`grass:${season}:${v}`, () => {
      const S = new Shp(10, 14);
      const R = GRASS_COL[season];
      const r = U.mulberry32(300 + v * 7 + season);
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        S.leaf(5 + (t - 0.5) * 3, 13.5, 7 + r() * 5, -Math.PI / 2 + (t - 0.5) * 1.5 + (r() - 0.5) * 0.3, 1.25, R);
      }
      return X.outline(S.render(), { amount: 0.55 });
    });
  };

  // ───────────── 큰 덩어리 (2×2) ─────────────
  A.bigStump = function (season) {
    return X.cached(`clump:stump:${season}`, () => {
      const S = new Shp(32, 32);
      S.add((x, y) => y >= 10 && y <= 28 && Math.abs(x + 0.5 - 16) <= 10 + (y > 24 ? (y - 24) * 1.2 : 0) - (y < 13 ? (13 - y) * 0.5 : 0), BARK, { group: 'bark', tex: (x, y, t) => (t === 1 && x % 4 === 1 && U.hash2(x, y, 1) % 4 ? BARK[2] : null) });
      S.leaf(7, 27, 7, Math.PI * 0.92, 2, BARK, { group: 'root' });
      S.leaf(25, 27, 7, Math.PI * 0.08, 2, BARK, { group: 'root' });
      S.leaf(16, 29, 4, Math.PI * 0.5, 2, BARK, { group: 'root' });
      S.ellipse(16, 11, 10, 4, RING, { group: 'ring', flat: true });
      const c = S.render();
      const g = X.ctx(c);
      g.strokeStyle = RING[2];
      X.px(g, 10, 11, RING[2], 12, 1); X.px(g, 13, 10, RING[2], 6, 1); X.px(g, 14, 12, RING[2], 5, 1); X.px(g, 9, 9, RING[0], 5, 1);
      X.outline(c);
      if (season === 3) { g.fillStyle = '#ffffff'; g.fillRect(8, 7, 16, 2); g.fillRect(10, 6, 10, 1); }
      return c;
    });
  };
  A.bigLog = function (season) {
    return X.cached(`clump:log:${season}`, () => {
      const S = new Shp(32, 32);
      S.add((x, y) => y >= 12 && y <= 27 && x >= 2 && x <= 25, BARK, { group: 'bark', tex: (x, y, t) => (t === 1 && y % 4 === 1 && U.hash2(x, y, 5) % 3 ? BARK[2] : null) });
      S.ellipse(26, 19.5, 5, 8, RING, { group: 'ring' }, 2);
      const c = S.render();
      const g = X.ctx(c);
      X.px(g, 25, 17, RING[2], 2, 6); X.px(g, 24, 19, RING[2], 4, 2);
      X.px(g, 8, 11, '#5fae3e', 3, 1); X.px(g, 18, 11, '#5fae3e', 2, 1);
      X.outline(c);
      if (season === 3) { g.fillStyle = '#ffffff'; g.fillRect(3, 11, 22, 2); }
      return c;
    });
  };
  A.boulder = function (season) {
    return X.cached(`clump:boulder:${season}`, () => {
      const [c, g] = A.blank(32, 32);
      const base = '#8e8a84';
      const R = X.ramp(base);
      A.blob(g, [[16, 20, 14, 10], [11, 15, 8, 7], [21, 14, 9, 8]], R, { band: 2 });
      // 금과 이끼
      X.line(g, 12, 14, 15, 20, R[3]); X.line(g, 15, 20, 13, 25, R[3]); X.line(g, 22, 13, 24, 19, R[3]);
      X.px(g, 8, 12, R[0], 4, 1); X.px(g, 18, 9, R[0], 5, 1);
      X.px(g, 6, 24, '#5f9a3e', 3, 1); X.px(g, 24, 26, '#5f9a3e', 3, 1);
      X.outline(c);
      if (season === 3) { g.fillStyle = '#ffffff'; g.fillRect(9, 8, 14, 2); g.fillRect(12, 7, 7, 1); }
      return c;
    });
  };
  A.bush = function (size, season, berries) {
    return X.cached(`bush:${size}:${season}:${berries || ''}`, () => {
      const w = size === 1 ? 16 : 32, h = size === 1 ? 24 : 40;
      const S = new Shp(w, h);
      const ramp = (LEAVES.oak[season] || ['#8aa898', '#5e7e70', '#46645a', '#324a42', '#22342e']);
      const tex = leafTex(ramp, 61 + size);
      if (size === 1) {
        S.ellipse(8, 16, 7.5, 7, ramp, { group: 'leaf', tex }, 2.1);
        S.ellipse(5, 11, 4, 4, ramp, { group: 'leaf', tex }, 2.1);
        S.ellipse(11, 10, 4.5, 4.5, ramp, { group: 'leaf', tex }, 2.1);
      } else {
        S.ellipse(16, 28, 15.5, 11, ramp, { group: 'leaf', tex }, 2.1);
        S.ellipse(8, 20, 7, 7, ramp, { group: 'leaf', tex }, 2.1);
        S.ellipse(24, 20, 7.5, 7.5, ramp, { group: 'leaf', tex }, 2.1);
        S.ellipse(16, 14, 8, 7, ramp, { group: 'leaf', tex }, 2.1);
      }
      const c = S.render();
      const g = X.ctx(c);
      if (berries) {
        const r = U.mulberry32(9);
        const col = berries === 'spring' ? ['#f08a4a', '#ffc08a'] : ['#3a2a5a', '#8a6aa8'];
        const dd = g.getImageData(0, 0, w, h).data;
        for (let i = 0; i < (size === 1 ? 6 : 14); i++) {
          const x = 2 + Math.floor(r() * (w - 4)), y = 4 + Math.floor(r() * (h - 8));
          if (dd[(y * w + x) * 4 + 3] === 0) continue;
          X.px(g, x, y, col[0], 2, 2); X.px(g, x, y, col[1]);
        }
      }
      X.outline(c);
      if (season === 3) {
        const d = g.getImageData(0, 0, w, h).data;
        g.fillStyle = '#ffffff';
        for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 0 && d[((y - 1) * w + x) * 4 + 3] === 0) { g.fillRect(x, y, 1, 2); }
      }
      return c;
    });
  };

  // ───────────── 농가 (9×7 타일 = 144×112) ─────────────
  // 반환: { body, porch, windowsLit } — 창문 위치는 A.FARMHOUSE_WINDOWS
  A.FARMHOUSE_WINDOWS = [[30, 62, 16, 14], [98, 62, 16, 14]];
  A.FARMHOUSE_CHIMNEY = [108, 6];
  A.farmhouse = function (season) {
    return X.cached(`farmhouse:${season}`, () => {
      const W = 144, H = 96;
      const c = X.canvas(W, H);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      const WALL = ['#e8b070', '#cc8e52', '#a86c38', '#7e4c26', '#5a3418'];
      const ROOF = ['#d0644a', '#b04a36', '#8e3628', '#6a241c', '#481812'];
      const STONE = ['#c8c0b4', '#a49c90', '#847c72', '#625a52'];
      // 굴뚝 (지붕 뒤)
      R(104, 4, 14, 26, STONE[3]); R(105, 5, 12, 25, STONE[1]);
      for (let y = 7; y < 30; y += 4) { R(105, y, 12, 1, STONE[2]); R(105 + ((y / 4) % 2) * 6, y - 3, 1, 3, STONE[2]); }
      R(103, 2, 16, 4, STONE[3]); R(104, 3, 14, 2, STONE[0]);
      // 벽 (가로 통나무)
      const wy0 = 50, wy1 = 92;
      R(6, wy0, 132, wy1 - wy0, WALL[4]);
      for (let y = wy0 + 1; y < wy1 - 1; y += 6) {
        R(7, y, 130, 5, WALL[1]);
        R(7, y, 130, 1, WALL[0]);
        R(7, y + 4, 130, 1, WALL[3]);
        for (let x = 10 + ((y / 6) % 2) * 9; x < 136; x += 22) R(x, y + 1, 1, 3, WALL[2]);
      }
      // 모서리 기둥
      R(6, wy0, 6, wy1 - wy0, WALL[3]); R(7, wy0, 4, wy1 - wy0, WALL[2]); R(7, wy0, 1, wy1 - wy0, WALL[1]);
      R(132, wy0, 6, wy1 - wy0, WALL[3]); R(133, wy0, 4, wy1 - wy0, WALL[2]); R(136, wy0, 1, wy1 - wy0, WALL[4]);
      // 돌 기초
      R(4, 88, 136, 8, STONE[3]);
      for (let x = 5; x < 139; x += 7) { R(x, 89, 6, 6, STONE[1]); R(x, 89, 6, 1, STONE[0]); R(x + 5, 89, 1, 6, STONE[2]); }
      // 지붕 (기와줄, 처마가 벽 위로 튀어나옴)
      const roofTop = 10, roofBot = 54;
      for (let y = roofTop; y <= roofBot; y++) {
        const t = (y - roofTop) / (roofBot - roofTop);
        const inset = Math.round(20 - t * 20);
        R(inset, y, W - inset * 2, 1, ROOF[4]);
      }
      for (let row = 0; row < 8; row++) {
        const y = roofTop + 1 + row * 5.4;
        const t = (y - roofTop) / (roofBot - roofTop);
        const inset = Math.round(20 - t * 20) + 1;
        const yy = Math.round(y);
        R(inset, yy, W - inset * 2, 5, row % 2 ? ROOF[1] : ROOF[2]);
        R(inset, yy, W - inset * 2, 1, ROOF[0]);
        R(inset, yy + 4, W - inset * 2, 1, ROOF[3]);
        for (let x = inset + (row % 2) * 4; x < W - inset; x += 8) R(x, yy + 1, 1, 3, ROOF[3]);
      }
      R(0, roofBot - 2, W, 5, ROOF[4]); R(1, roofBot - 1, W - 2, 2, ROOF[2]); R(1, roofBot - 1, W - 2, 1, ROOF[1]);
      R(18, roofTop - 1, W - 36, 3, ROOF[4]); R(19, roofTop, W - 38, 1, ROOF[0]);
      // 처마 그림자
      R(6, roofBot + 3, 132, 3, 'rgba(40,16,4,0.45)');
      // 창문
      for (const [x, y, w, h] of A.FARMHOUSE_WINDOWS) {
        R(x - 2, y - 2, w + 4, h + 4, WALL[4]);
        R(x - 1, y - 1, w + 2, h + 2, '#f2e2c0');
        R(x, y, w, h, '#3a5a8a');
        R(x, y, w, 3, '#5a82b8'); R(x + 1, y + 1, 4, 1, '#a8d0f0');
        R(x + w / 2 - 1, y, 2, h, '#f2e2c0'); R(x, y + h / 2 - 1, w, 2, '#f2e2c0');
        // 화분 상자 (똥꽃!)
        R(x - 3, y + h + 2, w + 6, 4, WALL[3]); R(x - 2, y + h + 2, w + 4, 1, WALL[1]);
        for (let i = 0; i < 4; i++) {
          const fx = x - 1 + i * 5;
          R(fx, y + h - 1, 3, 3, i % 2 ? '#8a5a2b' : '#b07a42'); R(fx + 1, y + h - 2, 1, 1, i % 2 ? '#8a5a2b' : '#b07a42');
          R(fx, y + h - 3, 1, 1, ['#f07ab8', '#ffe36a', '#ff8a5c', '#b8a8ff'][i]);
          R(fx + 2, y + h - 4, 1, 1, ['#f07ab8', '#ffe36a', '#ff8a5c', '#b8a8ff'][i]);
        }
      }
      // 문
      const dx = 64, dy = 62;
      R(dx - 2, dy - 3, 20, 30, WALL[4]);
      R(dx, dy - 1, 16, 28, '#7a4422');
      R(dx + 1, dy, 6, 26, '#9a5a2e'); R(dx + 9, dy, 6, 26, '#9a5a2e');
      R(dx + 1, dy, 6, 1, '#b8723a'); R(dx + 9, dy, 6, 1, '#b8723a');
      R(dx + 12, dy + 13, 2, 2, '#ffd23a');
      R(dx - 4, dy - 5, 24, 3, ROOF[3]); R(dx - 3, dy - 5, 22, 1, ROOF[1]);
      // 문 위 작은 똥 간판
      R(dx + 5, dy - 10, 6, 4, '#8a5a2b'); R(dx + 6, dy - 12, 4, 2, '#8a5a2b'); R(dx + 7, dy - 13, 2, 1, '#8a5a2b');
      X.outline(c, { amount: 0.42 });
      if (season === 3) {
        // 지붕 위 눈
        g.fillStyle = '#ffffff';
        for (let row = 0; row < 8; row++) {
          const y = Math.round(roofTop + 1 + row * 5.4);
          const t = (y - roofTop) / (roofBot - roofTop);
          const inset = Math.round(20 - t * 20) + 1;
          R(inset, y, W - inset * 2, 2, '#ffffff');
          R(inset, y + 2, W - inset * 2, 1, '#dce6f2');
        }
        R(0, roofBot - 2, W, 2, '#ffffff'); R(103, 1, 16, 3, '#ffffff');
      }
      return c;
    });
  };
  // 현관 (바닥 데칼): 9칸 폭 중 가운데 나무 데크 + 계단
  A.porch = function (season) {
    return X.cached(`porch:${season}`, () => {
      const c = X.canvas(144, 20);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      const D = ['#d89a5a', '#b87a42', '#94602e', '#6e4220', '#4e2c14'];
      R(40, 0, 64, 12, D[4]);
      for (let y = 0; y < 11; y += 4) { R(41, y, 62, 3, D[1]); R(41, y, 62, 1, D[0]); R(41, y + 3, 62, 1, D[3]); }
      // 계단
      R(60, 11, 24, 8, D[4]); R(61, 11, 22, 3, D[2]); R(61, 11, 22, 1, D[0]); R(61, 15, 22, 3, D[1]); R(61, 15, 22, 1, D[0]);
      // 기둥
      R(40, 0, 3, 12, D[3]); R(101, 0, 3, 12, D[3]);
      if (season === 3) { R(41, 0, 62, 1, '#ffffff'); }
      return c;
    });
  };
  // 출하함 32×28 (뚜껑 별도)
  A.shippingBin = function (season) {
    return X.cached(`bin:${season}`, () => {
      const c = X.canvas(32, 24);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      const D = ['#c8864a', '#a8682e', '#84501e', '#5e3612'];
      R(1, 4, 30, 19, D[2]);
      for (let y = 5; y < 22; y += 4) { R(2, y, 28, 3, D[1]); R(2, y, 28, 1, D[0]); }
      R(1, 4, 3, 19, D[3]); R(28, 4, 3, 19, D[3]);
      R(1, 4, 30, 2, D[3]);
      // 금속 띠와 똥 그림
      R(4, 12, 24, 1, '#7a7a80');
      R(13, 9, 6, 4, '#3a2412'); R(14, 8, 4, 1, '#3a2412'); R(15, 7, 2, 1, '#3a2412');
      R(14, 10, 4, 2, '#8a5a2b');
      X.outline(c, { amount: 0.4 });
      return c;
    });
  };
  A.binLid = function (season) {
    return X.cached(`binlid:${season}`, () => {
      const c = X.canvas(34, 8);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      R(1, 1, 32, 6, '#5e3612'); R(2, 2, 30, 3, '#c8864a'); R(2, 2, 30, 1, '#e8a868'); R(2, 5, 30, 1, '#84501e');
      R(15, 4, 4, 2, '#7a7a80');
      X.outline(c, { amount: 0.4 });
      if (season === 3) { g.fillStyle = '#ffffff'; g.fillRect(2, 1, 30, 2); }
      return c;
    });
  };

  // ───────────── 실내 가구 ─────────────
  A.bed = function () {
    return X.cached('furn:bed', () => {
      const c = X.canvas(32, 48);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      const D = ['#c8864a', '#a8682e', '#84501e', '#5e3612'];
      // 머리판
      R(1, 2, 30, 14, D[3]); R(2, 3, 28, 12, D[1]); R(2, 3, 28, 2, D[0]);
      R(5, 6, 22, 7, D[2]); R(6, 7, 20, 5, D[1]);
      // 매트리스와 이불
      R(2, 14, 28, 32, D[3]);
      R(3, 15, 26, 8, '#f4ece0'); R(5, 16, 22, 6, '#ffffff'); // 베개
      R(3, 23, 26, 21, '#4a78c8'); R(3, 23, 26, 2, '#7aa8e8');
      for (let y = 27; y < 44; y += 5) R(3, y, 26, 1, '#3a62a8');
      for (let x = 7; x < 29; x += 6) R(x, 25, 1, 19, '#3a62a8');
      R(3, 42, 26, 3, '#2e4e88');
      // 다리
      R(2, 44, 3, 4, D[3]); R(27, 44, 3, 4, D[3]);
      X.outline(c, { amount: 0.4 });
      return c;
    });
  };
  A.tv = function (on) {
    return X.cached('furn:tv:' + (on ? 1 : 0), () => {
      const c = X.canvas(32, 32);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      // 장식장
      R(1, 18, 30, 13, '#5e3612'); R(2, 19, 28, 11, '#a8682e'); R(2, 19, 28, 1, '#c8864a'); R(15, 20, 1, 9, '#5e3612');
      R(12, 24, 2, 1, '#ffd23a'); R(18, 24, 2, 1, '#ffd23a');
      // 브라운관 TV
      R(4, 2, 24, 17, '#3a2a22'); R(5, 3, 22, 15, '#6a5a4e'); R(5, 3, 22, 1, '#8a7a6e');
      R(7, 5, 14, 11, on ? '#a8e0f8' : '#2a3a3a'); R(8, 6, 3, 2, on ? '#ffffff' : '#4a6060');
      R(23, 6, 2, 2, '#c8b8a8'); R(23, 10, 2, 2, '#c8b8a8');
      R(10, 0, 1, 2, '#6a5a4e'); R(20, 0, 1, 2, '#6a5a4e');
      X.outline(c, { amount: 0.4 });
      return c;
    });
  };
  A.kitchen = function () {
    return X.cached('furn:kitchen', () => {
      const c = X.canvas(48, 40);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      // 냉장고
      R(1, 0, 14, 39, '#8a9aa8'); R(2, 1, 12, 37, '#e8f0f4'); R(2, 1, 12, 1, '#ffffff'); R(2, 14, 12, 1, '#a8b8c4'); R(11, 5, 1, 6, '#8a9aa8'); R(11, 18, 1, 8, '#8a9aa8');
      // 조리대
      R(15, 14, 32, 25, '#5e3612'); R(16, 15, 30, 23, '#a8682e'); R(16, 15, 30, 4, '#e8dcc8'); R(16, 15, 30, 1, '#ffffff');
      R(16, 22, 30, 1, '#84501e'); R(30, 22, 1, 16, '#84501e');
      R(22, 27, 3, 1, '#ffd23a'); R(37, 27, 3, 1, '#ffd23a');
      // 개수대와 화구
      R(18, 15, 9, 3, '#8a9aa8'); R(19, 16, 7, 1, '#c8d8e4'); R(22, 11, 1, 4, '#8a9aa8'); R(22, 11, 3, 1, '#8a9aa8');
      R(34, 15, 5, 2, '#3a3a3a'); R(40, 15, 5, 2, '#3a3a3a');
      // 벽 선반 + 똥 단지
      R(17, 4, 28, 2, '#84501e');
      R(19, 0, 4, 4, '#c8a878'); R(26, 1, 4, 3, '#8a5a2b'); R(27, 0, 2, 1, '#8a5a2b'); R(34, 0, 5, 4, '#e8e0d0');
      X.outline(c, { amount: 0.4 });
      return c;
    });
  };
  A.fireplace = function () {
    return X.cached('furn:fireplace', () => {
      const c = X.canvas(32, 36);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      const S = ['#c8bcb0', '#a49888', '#80766a', '#5a524a'];
      R(1, 2, 30, 33, S[3]); R(2, 3, 28, 31, S[1]);
      for (let y = 4; y < 33; y += 5) for (let x = 2 + ((y / 5) % 2) * 4; x < 30; x += 8) { R(x, y, 7, 4, S[0]); R(x, y + 3, 7, 1, S[2]); }
      R(0, 0, 32, 4, '#7a4422'); R(1, 1, 30, 1, '#b8723a');
      R(8, 14, 16, 20, '#1a0e08'); R(9, 15, 14, 19, '#2e1a10');
      R(9, 30, 14, 3, '#5e3612'); R(10, 31, 12, 1, '#84501e');
      X.outline(c, { amount: 0.4 });
      return c;
    });
  };
  A.table = function () {
    return X.cached('furn:table', () => {
      const c = X.canvas(32, 32);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      R(1, 8, 30, 16, '#5e3612'); R(2, 9, 28, 12, '#c8864a'); R(2, 9, 28, 2, '#e8a868'); R(2, 21, 28, 2, '#84501e');
      R(3, 23, 3, 8, '#5e3612'); R(26, 23, 3, 8, '#5e3612');
      // 식탁 위 꽃병(똥꽃)
      R(14, 3, 4, 7, '#7ab0d8'); R(15, 4, 1, 4, '#c8e8f8'); R(13, 0, 2, 2, '#f07ab8'); R(17, 1, 2, 2, '#ffe36a'); R(15, 1, 2, 2, '#8a5a2b');
      X.outline(c, { amount: 0.4 });
      return c;
    });
  };
  A.rug = function () {
    return X.cached('furn:rug', () => {
      const c = X.canvas(48, 32);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      R(1, 1, 46, 30, '#7a2e2a'); R(3, 3, 42, 26, '#b84a3a'); R(6, 6, 36, 20, '#e8b45a'); R(8, 8, 32, 16, '#b84a3a');
      for (let x = 10; x < 38; x += 6) R(x, 15, 3, 2, '#e8b45a');
      for (let x = 2; x < 47; x += 3) { R(x, 0, 1, 1, '#e8d8b0'); R(x, 31, 1, 1, '#e8d8b0'); }
      return c;
    });
  };
  A.lamp = function () {
    return X.cached('furn:lamp', () => {
      const c = X.canvas(16, 32);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      R(5, 28, 6, 3, '#5e3612'); R(7, 12, 2, 16, '#84501e');
      R(3, 4, 10, 9, '#e8c878'); R(4, 5, 8, 7, '#fff0b0'); R(2, 12, 12, 1, '#c8a050');
      X.outline(c, { amount: 0.4 });
      return c;
    });
  };
  // 실내 창문 32×24 (하늘 색은 시간에 따라)
  A.interiorWindow = function (sky) {
    const key = 'furn:window:' + sky;
    return X.cached(key, () => {
      const c = X.canvas(32, 24);
      const g = X.ctx(c);
      const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      R(1, 1, 30, 21, '#5e3612'); R(2, 2, 28, 19, '#e8dcc8');
      R(4, 4, 24, 15, sky);
      R(4, 4, 24, 2, X.light(sky, 0.25));
      R(15, 4, 2, 15, '#e8dcc8'); R(4, 11, 24, 2, '#e8dcc8');
      R(0, 21, 32, 3, '#84501e'); R(1, 21, 30, 1, '#c8864a');
      // 커튼
      R(1, 0, 5, 20, '#c84a4a'); R(26, 0, 5, 20, '#c84a4a'); R(2, 0, 1, 20, '#e87a6a'); R(27, 0, 1, 20, '#e87a6a');
      return c;
    });
  };
})();
