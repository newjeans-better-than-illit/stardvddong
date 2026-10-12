'use strict';
// ════════════════════════════════════════════════════════════════════
//  똥 작물 아트 생성기
//  - 모양(Shape)을 픽셀 ID 버퍼에 쌓은 뒤 한 번에 명암(왼쪽 위 밝게·오른쪽 아래 어둡게)
//    과 층 사이 그림자를 넣고, 마지막에 자동 외곽선(채움색의 어두운 톤)을 입힌다.
//  - 작물 스프라이트 16×32 (다 자라면 타일 위로 솟는다), 수확 아이콘 16×16
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const X = SD.gfx;
  const U = SD.util;
  const A = (SD.Art = SD.Art || {});

  // ───────────── 모양 버퍼 ─────────────
  class Shp {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.id = new Int16Array(w * h).fill(-1);
      this.shapes = [];
      this.after = [];
    }
    at(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.id[y * this.w + x]; }
    // inside(x,y) → bool. opts: { ramp, group, flat, tex(x,y,tone,shape)→color|null, gloss, light }
    add(inside, ramp, opts) {
      const o = opts || {};
      const sid = this.shapes.length;
      const sh = { ramp, group: o.group || 'body', flat: o.flat, tex: o.tex, gloss: o.gloss, minX: 99, maxX: -1, minY: 99, maxY: -1, under: o.under, noCast: o.noCast };
      this.shapes.push(sh);
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (!inside(x, y)) continue;
          if (o.under && this.id[y * this.w + x] >= 0) continue; // 이미 있는 것 뒤에
          this.id[y * this.w + x] = sid;
          if (x < sh.minX) sh.minX = x; if (x > sh.maxX) sh.maxX = x;
          if (y < sh.minY) sh.minY = y; if (y > sh.maxY) sh.maxY = y;
        }
      }
      return sid;
    }
    ellipse(cx, cy, rx, ry, ramp, opts, pw) {
      const p = pw || 2;
      return this.add((x, y) => {
        const dx = Math.abs(x + 0.5 - cx) / rx, dy = Math.abs(y + 0.5 - cy) / ry;
        return Math.pow(dx, p) + Math.pow(dy, p) <= 1;
      }, ramp, opts);
    }
    // 뾰족한 잎: 밑동 (x,y)에서 각도 ang 방향으로 길이 len, 폭 wd
    leaf(x, y, len, ang, wd, ramp, opts) {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      return this.add((px, py) => {
        const dx = px + 0.5 - x, dy = py + 0.5 - y;
        const t = dx * ca + dy * sa;
        const s = -dx * sa + dy * ca;
        if (t < 0 || t > len) return false;
        const w = wd * Math.sin(Math.PI * Math.min(1, t / len) ** 0.8);
        return Math.abs(s) <= w + 0.15;
      }, ramp, Object.assign({ group: 'leaf' }, opts));
    }
    stem(x0, y0, x1, y1, color, w) {
      const pts = [];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) pts.push([Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n)]);
      const set = new Set(pts.map(([a, b]) => a + ',' + b));
      if (w === 2) for (const [a, b] of pts) set.add((a + 1) + ',' + b);
      return this.add((x, y) => set.has(x + ',' + y), [color, color, X.dark(color, 0.2), X.dark(color, 0.35)], { group: 'stem', flat: true });
    }
    pixels(list, color, group) {
      const set = new Set(list.map(([a, b]) => a + ',' + b));
      return this.add((x, y) => set.has(x + ',' + y), [color, color, color, color], { group: group || 'detail', flat: true });
    }
    render() {
      const c = X.canvas(this.w, this.h);
      const g = X.ctx(c);
      const W = this.w;
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < W; x++) {
          const sid = this.id[y * W + x];
          if (sid < 0) continue;
          const sh = this.shapes[sid];
          const R = sh.ramp;
          let tone = 1;
          if (!sh.flat) {
            const same = (a, b) => this.at(a, b) === sid;
            const up = this.at(x, y - 1);
            const top = !same(x, y - 1);
            const bottom = !same(x, y + 1);
            const right = !same(x + 1, y);
            const left = !same(x - 1, y);
            const cx = (sh.minX + sh.maxX) / 2;
            const covered = up > sid && this.shapes[up].group === sh.group && !this.shapes[up].noCast;
            if (covered) tone = 3;
            else if (bottom && right) tone = 3;
            else if (bottom || (right && !top)) tone = 2;
            else if (top && x <= cx + (sh.maxX - sh.minX) * 0.2) tone = 0;
            else if (left && !bottom) tone = 0;
            else if (!same(x, y + 2) && same(x, y + 1) && x > cx) tone = 2;
            // 둥근 몸통 안쪽 반사광
            if (sh.gloss && tone === 1 && y === sh.minY + 1 + Math.floor((sh.maxY - sh.minY) * 0.15) && x > sh.minX + 1 && x < sh.minX + 3 + (sh.maxX - sh.minX) * 0.25) tone = 4;
          }
          let col = tone === 4 ? (R[4] || X.light(R[0], 0.55)) : R[Math.min(R.length - 1, tone)];
          if (sh.tex) { const t = sh.tex(x, y, tone, sh); if (t) col = t; }
          g.fillStyle = col;
          g.fillRect(x, y, 1, 1);
        }
      }
      // 서로 다른 무리(몸통/잎) 경계에 내부 외곽선
      const img = g.getImageData(0, 0, this.w, this.h);
      const d = img.data;
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < W; x++) {
          const sid = this.id[y * W + x];
          if (sid < 0) continue;
          const sh = this.shapes[sid];
          if (sh.group === 'detail' || sh.group === 'stem') continue;
          const nb = [this.at(x, y + 1), this.at(x + 1, y), this.at(x - 1, y), this.at(x, y - 1)];
          let edge = false;
          for (const o of nb) {
            if (o >= 0 && o > sid && this.shapes[o].group !== sh.group && this.shapes[o].group !== 'detail' && this.shapes[o].group !== 'stem') { edge = true; break; }
          }
          if (edge) {
            const oc = X.rgb(X.outlineOf(sh.ramp[1]));
            const i = (y * W + x) * 4;
            d[i] = oc[0]; d[i + 1] = oc[1]; d[i + 2] = oc[2];
          }
        }
      }
      g.putImageData(img, 0, 0);
      for (const fn of this.after) fn(g);
      return c;
    }
  }
  A.Shp = Shp;

  // ───────────── 색 램프 ─────────────
  // 5단: [밝음, 기본, 그늘, 깊은 그늘, 반사광]
  A.poopRamp = function (base) {
    const r = X.ramp(base);
    r.push(X.light(base, 0.62));
    return r;
  };
  const LEAF = ['#9be064', '#5fb03c', '#3d8a2c', '#2b6623'];
  const LEAF_DARK = ['#6fae4a', '#3f8a35', '#2d6a2a', '#1f4c1f'];
  const LEAF_BLUE = ['#8fd0b0', '#4f9e8a', '#357868', '#24584c'];
  const LEAF_YELLOW = ['#e8e078', '#b8b440', '#8a8a2a', '#5e5e1a'];
  A.LEAF = LEAF;
  const STEM = '#3d8a2c';
  const WOOD = ['#d89a55', '#a8692e', '#7a4a22', '#553014'];

  // ───────────── 똥 몸통 ─────────────
  // tiers: [[폭, 높이, x오프셋], ...] 아래층부터. by: 맨 아래 픽셀 y. 반환: 층별 정보
  A.poopBody = function (S, cx, by, tiers, base, opts) {
    const o = opts || {};
    const ramp = o.ramp || A.poopRamp(base);
    const info = [];
    let bottom = by;
    tiers.forEach((t, i) => {
      const [w, h, dx] = t;
      const ccx = cx + (dx || 0);
      const cy = bottom - h / 2 + 1;
      const rx = w / 2, ry = h / 2;
      const sid = S.ellipse(ccx, cy, rx, ry, ramp, { group: 'body', gloss: i === (o.glossTier == null ? 0 : o.glossTier), tex: o.tex }, o.pw || 2.4);
      info.push({ cx: ccx, cy, top: Math.round(cy - ry), bottom, w, h, sid });
      bottom = Math.round(cy - ry) + (o.overlap == null ? 1 : o.overlap);
    });
    // 꼭지 (위로 말린 끝)
    if (o.tip !== false && tiers.length) {
      const last = info[info.length - 1];
      const tx = Math.round(last.cx + (o.tipDir == null ? 1 : o.tipDir));
      const ty = last.top;
      S.add((x, y) => (x === tx && y === ty - 1) || (x === tx + (o.tipDir < 0 ? -1 : 1) && y === ty - 2) || (x === tx && y === ty), ramp, { group: 'body' });
    }
    return info;
  };
  // 귀여운 얼굴 (eyes + 웃는 입 + 볼터치)
  A.face = function (S, cx, y, opts) {
    const o = opts || {};
    const eye = o.eye || '#1d120a';
    const small = o.small;
    const ex = small ? 2 : 3;
    S.after.push((g) => {
      const L = Math.round(cx - ex), Rr = Math.round(cx + ex - 1);
      if (o.closed) {
        X.px(g, L - 1, y + 1, eye); X.px(g, L, y, eye); X.px(g, L + 1, y + 1, eye);
        X.px(g, Rr - 1, y + 1, eye); X.px(g, Rr, y, eye); X.px(g, Rr + 1, y + 1, eye);
      } else {
        X.px(g, L, y, eye, 1, small ? 1 : 2);
        X.px(g, Rr, y, eye, 1, small ? 1 : 2);
        if (!small) { X.px(g, L, y, '#ffffff'); X.px(g, Rr, y, '#ffffff'); X.px(g, L, y + 1, eye); X.px(g, Rr, y + 1, eye); }
      }
      if (!small) {
        const my = y + 2;
        const mc = o.mouth || '#6a2418';
        X.px(g, Math.round(cx) - 1, my + 1, mc, 2, 1);
        X.px(g, Math.round(cx) - 2, my, mc);
        X.px(g, Math.round(cx) + 1, my, mc);
        if (o.blush !== false) {
          const bc = o.blushColor || 'rgba(255,120,130,0.55)';
          X.px(g, L - 2, my, bc, 2, 1);
          X.px(g, Rr + 1, my, bc, 2, 1);
        }
      } else if (o.mouth !== false) {
        X.px(g, Math.round(cx) - 1, y + 2, o.mouth || '#6a2418', 2, 1);
      }
    });
  };

  // 질감 함수들
  A.tex = {
    stripes(colorDark, every, phase) {
      return (x, y, tone, sh) => {
        const cx = (sh.minX + sh.maxX) / 2;
        const rx = (sh.maxX - sh.minX) / 2 + 0.5;
        const u = (x + 0.5 - cx) / rx;
        const bend = Math.asin(U.clamp(u, -1, 1)) / (Math.PI / 2);
        const s = Math.round((bend * 3 + (phase || 0)) * 10) % (every || 10);
        return tone < 3 && (s === 0) ? colorDark : null;
      };
    },
    seeds(color, seed) {
      return (x, y, tone) => (tone <= 2 && (U.hash2(x, y, seed || 3) % 9 === 0) && (x + y) % 2 === 0 ? color : null);
    },
    kernels(light, dark) {
      return (x, y, tone) => {
        if (tone === 3) return null;
        const k = (x % 2) ^ (y % 2);
        return k ? (tone === 0 ? null : dark) : null;
      };
    },
    ridges(dark, cxFn) {
      return (x, y, tone, sh) => {
        const cx = (sh.minX + sh.maxX) / 2;
        const off = Math.round(x + 0.5 - cx);
        return tone !== 3 && tone !== 0 && (off === -3 || off === 3 || off === 0) && y > sh.minY + 1 && y < sh.maxY ? dark : null;
      };
    },
    scales(dark) {
      return (x, y, tone, sh) => {
        const row = y - sh.minY;
        return (tone === 1 || tone === 2) && ((x + Math.floor(row / 2) * 2) % 4 === 0) && row % 2 === 1 ? dark : null;
      };
    },
    spots(dark, seed) {
      return (x, y, tone) => (tone >= 1 && tone <= 2 && U.hash2(x, y, seed || 9) % 7 === 0 ? dark : null);
    },
    rainbow() {
      return (x, y, tone) => {
        const h = (y * 22 + x * 5) % 360;
        const l = [0.78, 0.62, 0.48, 0.36, 0.9][tone];
        return X.hsl(h, 0.85, l);
      };
    },
    layers(dark) {
      return (x, y, tone, sh) => {
        const cx = (sh.minX + sh.maxX) / 2, cy = (sh.minY + sh.maxY) / 2;
        const r = Math.hypot((x + 0.5 - cx) * 1.1, (y + 0.5 - cy) * 1.6);
        const a = Math.atan2(y - cy, x - cx);
        return tone > 0 && tone < 3 && Math.round(r + a * 1.2) % 4 === 0 ? dark : null;
      };
    },
    lumpy(light) {
      return (x, y, tone, sh) => {
        const row = y - sh.minY;
        return tone === 1 && row < 4 && ((x * 3 + y * 2) % 5 === 0) ? light : null;
      };
    },
  };

  // 반짝임 픽셀(구워 넣는 것)
  A.sparkles = function (S, pts, color) {
    S.after.push((g) => {
      for (const [x, y] of pts) {
        X.px(g, x, y, color || '#ffffff');
      }
    });
  };

  // ───────────── 공통 성장 단계 ─────────────
  // 씨앗 단계: 흙 속 작은 씨앗 몇 개
  A.seedStage = function (spec) {
    const S = new Shp(16, 32);
    const base = spec.seedColor || '#8a5a2b';
    const R = A.poopRamp(base);
    S.ellipse(5.5, 26, 1.4, 1, R, { group: 'body' });
    S.ellipse(9.5, 27, 1.4, 1, R, { group: 'body' });
    S.ellipse(8, 24.5, 1.2, 0.9, R, { group: 'body' });
    const c = S.render();
    return X.outline(c, { amount: 0.5 });
  };
  // 떡잎
  A.sprout = function (S, cx, by, scale, ramp) {
    const s = scale || 1;
    const R = ramp || LEAF;
    S.stem(cx, by, cx, by - Math.round(2 * s), STEM);
    S.leaf(cx, by - Math.round(2 * s), 3.5 * s + 0.5, -Math.PI * 0.85, 1.4 * s + 0.3, R);
    S.leaf(cx + 1, by - Math.round(2 * s), 3.5 * s + 0.5, -Math.PI * 0.15, 1.4 * s + 0.3, R);
  };
  // 잎 다발 (위로 퍼짐)
  A.tuft = function (S, cx, by, size, ramp, n, spread) {
    const R = ramp || LEAF;
    const k = n || 5;
    const sp = spread == null ? 0.75 : spread;
    for (let i = 0; i < k; i++) {
      const t = k === 1 ? 0.5 : i / (k - 1);
      const ang = -Math.PI / 2 + (t - 0.5) * Math.PI * sp * 2;
      const len = size * (0.75 + 0.35 * Math.sin(t * Math.PI));
      S.leaf(cx + (t - 0.5) * 2, by, len, ang, Math.max(1, size * 0.28), R);
    }
  };
  // 넓은 잎 (양옆으로 깔림)
  A.broadLeaves = function (S, cx, by, size, ramp) {
    const R = ramp || LEAF;
    S.leaf(cx - 1, by, size, Math.PI * 1.08, size * 0.42, R);
    S.leaf(cx, by, size, -Math.PI * 0.08, size * 0.42, R);
    S.leaf(cx - 1, by - 1, size * 0.85, -Math.PI * 0.72, size * 0.38, R);
    S.leaf(cx, by - 1, size * 0.85, -Math.PI * 0.28, size * 0.38, R);
  };
  // 덩굴 지지대 (지나갈 수 없는 나무 막대)
  A.trellis = function (S, h) {
    const top = 31 - h;
    const R = WOOD;
    S.add((x, y) => (x === 7 || x === 8) && y >= top && y <= 29, R, { group: 'wood' });
    S.add((x, y) => y === top + 2 && x >= 3 && x <= 12, R, { group: 'wood', under: true });
    if (h > 18) S.add((x, y) => y === top + 9 && x >= 4 && x <= 11, R, { group: 'wood', under: true });
  };
  A.vine = function (S, fromY, toY, ramp, seed, step) {
    const R = ramp || LEAF;
    const r = U.mulberry32(seed || 5);
    for (let y = fromY; y > toY; y -= step || 3) {
      const side = (Math.floor((fromY - y) / (step || 3)) % 2) ? -1 : 1;
      S.leaf(side < 0 ? 7 : 8, y, 3.2 + r() * 1.5, side < 0 ? Math.PI * (1.05 + r() * 0.1) : -Math.PI * (0.05 + r() * 0.1), 1.6, R);
    }
  };

  // 성장 중간 단계 기본: 잎이 자라고 몸통 새싹이 작게
  A.growStage = function (spec, p) {
    const S = new Shp(16, 32);
    const by = 27;
    const kind = spec.kind || 'normal';
    const leafR = spec.leafRamp || LEAF;
    if (kind === 'trellis') {
      A.trellis(S, 26);
      A.vine(S, 28, 28 - Math.round(22 * p), leafR, spec.seed);
      if (p > 0.7) A.tuft(S, 8, 28, 4, leafR, 3);
    } else if (kind === 'tall') {
      const h = Math.round(6 + 18 * p);
      S.stem(8, by, 8, by - h, STEM, 2);
      for (let i = 0; i < Math.max(1, Math.round(p * 4)); i++) {
        const y = by - 2 - i * Math.max(3, Math.round(h / 4));
        S.leaf(i % 2 ? 9 : 8, y, 4 + p * 3, i % 2 ? -Math.PI * 0.18 : -Math.PI * 0.82, 1.4, leafR);
      }
      if (p < 0.5) A.tuft(S, 8, by, 4, leafR, 3);
    } else if (kind === 'bush') {
      const s = 3 + p * 5;
      A.tuft(S, 8, by, s, leafR, 5, 0.9);
      if (p > 0.5) S.ellipse(8, by - s * 0.7, s * 0.7, s * 0.55, leafR, { group: 'leaf', under: true });
    } else if (kind === 'flower') {
      const h = Math.round(4 + 10 * p);
      S.stem(8, by, 8, by - h, STEM);
      S.leaf(8, by - 1, 3 + p * 3, -Math.PI * 0.85, 1.3, leafR);
      S.leaf(9, by - 2, 3 + p * 3, -Math.PI * 0.15, 1.3, leafR);
      if (p > 0.66) {
        // 닫힌 꽃봉오리 (똥 색이 살짝 비친다)
        const bud = spec.petal || spec.color;
        S.ellipse(8.5, by - h - 1, 1.6, 2.2, [LEAF[0], LEAF[1], LEAF[2], LEAF[3]], { group: 'leaf' });
        S.pixels([[8, by - h - 3]], bud);
      }
    } else {
      // normal / root / vine
      const s = 3 + p * 6;
      if (p < 0.34) A.sprout(S, 8, by, 1 + p, leafR);
      else A.tuft(S, 8, by - 1, s, leafR, p < 0.6 ? 3 : 5, 0.7);
      if (p >= 0.55 && spec.kind !== 'leafy') {
        const k = 0.35 + p * 0.3;
        A.poopBody(S, 8, by + 1, [[Math.round(10 * k + 2), 4], [Math.round(7 * k + 1), 3]], spec.color, { tip: true });
      }
    }
    return X.outline(S.render());
  };

  // 시든 작물
  A.deadCrop = function () {
    return X.cached('crop:dead', () => {
      const S = new Shp(16, 32);
      const R = ['#b8a080', '#8f7a5c', '#6a5a44', '#4a3e30'];
      S.stem(8, 27, 7, 20, '#7a6a4a');
      S.leaf(7, 21, 5, Math.PI * 0.9, 1.4, R);
      S.leaf(8, 23, 5, Math.PI * 0.15, 1.4, R);
      A.poopBody(S, 8, 28, [[11, 4], [7, 3]], '#8a8070', { tip: false });
      A.face(S, 8, 25, { closed: true, blush: false, small: true, mouth: '#4a3e30' });
      return X.outline(S.render());
    });
  };

  // ───────────── 아이콘(16×16) 만들기 도우미 ─────────────
  A.iconFrom = function (build) {
    const S = new Shp(16, 16);
    build(S);
    return X.outline(S.render());
  };
})();
