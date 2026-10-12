'use strict';
// ════════════════════════════════════════════════════════════════════
//  그래픽 도우미: 캔버스, 색, 행(문자열)→스프라이트, 자동 외곽선(채움색의 어두운 톤),
//  명암, 픽셀 회전, 그림자 타원, 스프라이트 캐시
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const X = (SD.gfx = {});

  X.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  };
  // 스프라이트 생성용 컨텍스트 (픽셀을 자주 읽으므로 willReadFrequently)
  X.ctx = function (c) {
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    return g;
  };
  // 완성된 스프라이트를 일반(가속) 캔버스로 옮긴다 — 매 프레임 그리기용
  X.finalize = function (src) {
    if (!src || !src.getContext) return src;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    c._src = src;
    return c;
  };
  // 원본 픽셀 읽기 (가속 캔버스면 만들 때 쓴 원본을 읽는다)
  X.readPixels = function (c) {
    const s = c._src || c;
    return X.ctx(s).getImageData(0, 0, s.width, s.height);
  };

  // ───────────── 색 ─────────────
  const rgbCache = new Map();
  X.rgb = function (hex) {
    let v = rgbCache.get(hex);
    if (v) return v;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
    return v;
  };
  X.hex = function (r, g, b) {
    const f = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
  };
  X.toHsl = function (hex) {
    const [r0, g0, b0] = X.rgb(hex);
    const r = r0 / 255, g = g0 / 255, b = b0 / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  };
  X.hsl = function (h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return X.hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  };
  // 원작풍 명암: 어둡게 할 때는 색상을 따뜻한/차가운 쪽으로 살짝 돌리고 채도를 올린다
  X.dark = function (hex, amt) {
    const [h, s, l] = X.toHsl(hex);
    const hueShift = (h > 60 && h < 250) ? 8 : -8; // 녹·청은 푸른 쪽, 붉은 계열은 자주 쪽
    return X.hsl(h + hueShift * amt * 2, Math.min(1, s + 0.12 * amt + 0.05), l * (1 - amt));
  };
  X.light = function (hex, amt) {
    const [h, s, l] = X.toHsl(hex);
    const hueShift = (h > 60 && h < 250) ? -8 : 8;  // 밝은 쪽은 노란빛
    return X.hsl(h + hueShift * amt, Math.max(0, s - 0.05 * amt), l + (1 - l) * amt);
  };
  X.mix = function (a, b, t) {
    const A = X.rgb(a), B = X.rgb(b);
    return X.hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  // 외곽선 색: 채움색의 어두운 톤
  X.outlineOf = function (hex) {
    const [h, s, l] = X.toHsl(hex);
    return X.hsl(h + ((h > 60 && h < 250) ? 10 : -10), Math.min(1, s * 0.9 + 0.15), Math.max(0.06, l * 0.38));
  };
  // 4단계 램프 [하이라이트, 기본, 그늘, 깊은 그늘]
  X.ramp = function (hex) {
    return [X.light(hex, 0.32), hex, X.dark(hex, 0.22), X.dark(hex, 0.42)];
  };

  // ───────────── 행 문자열 → 스프라이트 ─────────────
  // rows: ['..aa..', ...], pal: { a: '#hex' | (x,y)=>'#hex' }
  X.fromRows = function (rows, pal, w, h) {
    const width = w || Math.max(...rows.map((r) => r.length));
    const c = X.canvas(width, h || rows.length);
    const g = X.ctx(c);
    X.paintRows(g, rows, pal, 0, 0);
    return c;
  };
  X.paintRows = function (g, rows, pal, ox, oy, flip) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const p = pal[ch];
        if (!p) continue;
        g.fillStyle = typeof p === 'function' ? p(x, y) : p;
        g.fillRect(ox + (flip ? row.length - 1 - x : x), oy + y, 1, 1);
      }
    }
  };

  // ───────────── 픽셀 버퍼 ─────────────
  X.pixels = function (c) { return X.readPixels(c); };

  // 자동 외곽선: 불투명 픽셀 둘레의 빈 칸을 "이웃 채움색의 어두운 톤"으로 칠한다
  // opts.color 를 주면 단색, opts.diagonal 이면 대각선 이웃까지 포함
  X.outline = function (c, opts) {
    const o = opts || {};
    const g = X.ctx(c);
    const w = c.width, h = c.height;
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const out = new Uint8ClampedArray(d);
    const fixed = o.color ? X.rgb(o.color) : null;
    const amt = o.amount == null ? 0.38 : o.amount;
    const nb = o.diagonal ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] : [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] > 0) continue;
        let found = -1;
        for (const [dx, dy] of nb) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4;
          if (d[j + 3] > 200) { found = j; if (dy === -1) break; }
        }
        if (found < 0) continue;
        let r, gg, b;
        if (fixed) [r, gg, b] = fixed;
        else {
          const hex = X.hex(d[found], d[found + 1], d[found + 2]);
          const [hh, s, l] = X.toHsl(hex);
          const oc = X.rgb(X.hsl(hh + ((hh > 60 && hh < 250) ? 10 : -10), Math.min(1, s * 0.9 + 0.15), Math.max(0.05, l * amt)));
          [r, gg, b] = oc;
        }
        out[i] = r; out[i + 1] = gg; out[i + 2] = b; out[i + 3] = 255;
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
    return c;
  };

  // 마스크 명암: inside(x,y) 가 참인 픽셀을 램프로 칠한다 (왼쪽 위 밝게, 오른쪽 아래 어둡게)
  // ramp = [밝음, 기본, 그늘, 깊은그늘]
  X.shadeMask = function (g, w, h, inside, ramp, opts) {
    const o = opts || {};
    const band = o.band || 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inside(x, y)) continue;
        let tone = 1;
        const upL = !inside(x - band, y - band) || !inside(x, y - band);
        const dnR = !inside(x + band, y + band) || !inside(x, y + band);
        const farDn = !inside(x, y + band * 2) || !inside(x + band * 2, y + band);
        if (dnR) tone = 3;
        else if (farDn) tone = 2;
        else if (upL) tone = 0;
        else if (!inside(x - 1, y)) tone = o.leftLight === false ? 1 : 0;
        if (o.tone) tone = o.tone(x, y, tone);
        g.fillStyle = ramp[Math.max(0, Math.min(ramp.length - 1, tone))];
        g.fillRect(x, y, 1, 1);
      }
    }
  };

  // ───────────── 변형 ─────────────
  X.flipX = function (src) {
    const c = X.canvas(src.width, src.height);
    const g = X.ctx(c);
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  };
  X.flipY = function (src) {
    const c = X.canvas(src.width, src.height);
    const g = X.ctx(c);
    g.translate(0, src.height);
    g.scale(1, -1);
    g.drawImage(src, 0, 0);
    return c;
  };
  X.scaleUp = function (src, k) {
    const c = X.canvas(src.width * k, src.height * k);
    const g = X.ctx(c);
    g.drawImage(src, 0, 0, c.width, c.height);
    return c;
  };
  X.tint = function (src, color, alpha) {
    const c = X.canvas(src.width, src.height);
    const g = X.ctx(c);
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  };
  X.silhouette = function (src, color) { return X.tint(src, color, 1); };
  // 원본 해상도에서 최근접 회전 → 픽셀 격자가 유지된다
  // (cx, cy): 회전 중심(원본 좌표), 결과 캔버스의 중심이 회전 중심이 된다
  X.rotateNearest = function (src, angle, cx, cy, size) {
    const S = size || Math.ceil(Math.hypot(src.width, src.height) * 2) + 2;
    const c = X.canvas(S, S);
    const g = X.ctx(c);
    const sd = X.readPixels(src).data;
    const img = g.createImageData(S, S);
    const d = img.data;
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    const half = S / 2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const rx = x + 0.5 - half, ry = y + 0.5 - half;
        const sx = Math.floor(rx * cos - ry * sin + cx);
        const sy = Math.floor(rx * sin + ry * cos + cy);
        if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
        const i = (sy * src.width + sx) * 4;
        if (sd[i + 3] === 0) continue;
        const j = (y * S + x) * 4;
        d[j] = sd[i]; d[j + 1] = sd[i + 1]; d[j + 2] = sd[i + 2]; d[j + 3] = sd[i + 3];
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  };
  X.crop = function (src, sx, sy, w, h) {
    const c = X.canvas(w, h);
    X.ctx(c).drawImage(src, sx, sy, w, h, 0, 0, w, h);
    return c;
  };

  // ───────────── 캐시 ─────────────
  const cache = new Map();
  X.cached = function (key, make) {
    let v = cache.get(key);
    if (v === undefined) {
      v = make();
      if (v && v.getContext && !v._noFinalize) v = X.finalize(v);
      cache.set(key, v);
    }
    return v;
  };
  X.uncache = function (prefix) {
    for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  };
  X.cacheSize = () => cache.size;

  // ───────────── 그림자 타원 (픽셀 경계, 반투명) ─────────────
  X.shadowSprite = function (w, h, alpha) {
    const a = alpha == null ? 0.28 : alpha;
    return X.cached(`shadow:${w}x${h}:${a}`, () => {
      const c = X.canvas(w, h);
      const g = c.getContext('2d');
      g.fillStyle = `rgba(0,0,0,${a})`;
      const rx = w / 2, ry = h / 2;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (x + 0.5 - rx) / rx, dy = (y + 0.5 - ry) / ry;
          if (dx * dx + dy * dy <= 1) g.fillRect(x, y, 1, 1);
        }
      }
      return c;
    });
  };
  // 중심 (x, y) 에 폭 w 높이 h 그림자
  X.shadow = function (g, x, y, w, h, alpha) {
    const s = X.shadowSprite(Math.max(2, Math.round(w)), Math.max(1, Math.round(h)), alpha);
    g.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
  };

  // 채운 타원 마스크 판정
  X.inEllipse = (x, y, cx, cy, rx, ry) => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };

  // 사각 픽셀 찍기 도우미
  X.px = function (g, x, y, color, w, h) {
    g.fillStyle = color;
    g.fillRect(x, y, w || 1, h || 1);
  };
  X.rect = X.px;
  // 브레젠험 선
  X.line = function (g, x0, y0, x1, y1, color) {
    g.fillStyle = color;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  // 채운 픽셀 원/타원
  X.ellipse = function (g, cx, cy, rx, ry, color) {
    g.fillStyle = color;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (X.inEllipse(x, y, cx, cy, rx, ry)) g.fillRect(x, y, 1, 1);
      }
    }
  };
  // 노이즈 점 뿌리기
  X.speckle = function (g, w, h, n, colors, rnd, inside) {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h);
      if (inside && !inside(x, y)) continue;
      g.fillStyle = colors[Math.floor(rnd() * colors.length)];
      g.fillRect(x, y, 1, 1);
    }
  };

  // 캔버스 → dataURL (UI에서 <img>로 쓸 때)
  X.dataURL = function (c, scale) {
    if (!scale || scale === 1) return c.toDataURL();
    return X.scaleUp(c, scale).toDataURL();
  };

  // 공용 팔레트 (원작처럼 따뜻하고 채도 높은 색)
  SD.PAL = {
    ink: '#2a1a0e',
    wood: '#b07339', woodL: '#d89a55', woodD: '#7a4a22', woodDD: '#4f2d14',
    metal: '#9aa3ad', metalL: '#dfe6ec', metalD: '#5f6873',
    leaf: '#5fae3e', leafL: '#8fd65f', leafD: '#3c7d29', leafDD: '#2a5a1f',
    stem: '#4f9a2f',
    skin: '#f4c39c', skinD: '#d9946b',
    water: '#3f8fd0', waterL: '#8fd0f5', waterD: '#2a6aa8',
    gold: '#ffd23a', goldD: '#c8901a',
    white: '#ffffff', black: '#120a06',
    poop: '#8a5a2b', poopL: '#b07a42', poopD: '#5f3a1a',
    eye: '#1d120a', mouth: '#5a1f18', blush: '#f08a8a',
    fly: '#1b1b1b', stink: '#a8d64e',
  };
})();
