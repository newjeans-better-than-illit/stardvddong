'use strict';
// ════════════════════════════════════════════════════════════════════
//  타이틀 화면: 흐르는 구름 하늘, 산과 언덕, 똥 로고, 새 게임 / 이어하기
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;
  const X = SD.gfx;
  const UI = SD.UI;

  function cloud(seed) {
    return X.cached('title:cloud:' + seed, () => {
      const r = U.mulberry32(seed);
      const c = X.canvas(64, 28);
      const g = X.ctx(c);
      const blobs = [];
      for (let i = 0; i < 6; i++) blobs.push([10 + r() * 44, 14 + r() * 6, 6 + r() * 8, 5 + r() * 5]);
      const inside = (x, y) => blobs.some((b) => X.inEllipse(x, y, b[0], b[1], b[2], b[3])) && y < 24;
      X.shadeMask(g, 64, 28, inside, ['#ffffff', '#f4f8ff', '#d8e4f4', '#bccce4'], { band: 2 });
      return c;
    });
  }
  function hills(w, h, color, seed, amp, base) {
    return X.cached(`title:hill:${w}:${h}:${color}:${seed}`, () => {
      const c = X.canvas(w, h);
      const g = X.ctx(c);
      const r = U.mulberry32(seed);
      const ph = [r() * 6, r() * 6, r() * 6];
      for (let x = 0; x < w; x++) {
        const y = base + Math.sin(x * 0.02 + ph[0]) * amp + Math.sin(x * 0.053 + ph[1]) * amp * 0.5 + Math.sin(x * 0.11 + ph[2]) * amp * 0.2;
        g.fillStyle = color; g.fillRect(x, Math.round(y), 1, h);
        g.fillStyle = X.light(color, 0.15); g.fillRect(x, Math.round(y), 1, 1);
      }
      return c;
    });
  }

  UI.showTitle = function (opts) {
    const o = opts || {};
    const items = [{ label: '새 게임', fn: o.onNew }];
    if (o.hasSave) items.unshift({ label: '이어하기', fn: o.onContinue });
    const T = {
      sel: 0, t: 0, rects: [],
      update(dt) { this.t += dt; },
      onKey(act) {
        if (act === 'up' || act === 'left') { this.sel = (this.sel + items.length - 1) % items.length; SD.Sound.play('hover'); }
        if (act === 'down' || act === 'right') { this.sel = (this.sel + 1) % items.length; SD.Sound.play('hover'); }
        if (act === 'confirm' || act === 'use' || act === 'action') this.go(this.sel);
        return true;
      },
      onPointer(type, x, y) {
        const i = this.rects.findIndex((r) => UI.inRect(x, y, r));
        if (type === 'move' && i >= 0 && i !== this.sel) { this.sel = i; SD.Sound.play('hover'); }
        if (type === 'down' && i >= 0) this.go(i);
      },
      go(i) {
        const it = items[i];
        if (!it || this.going) return;
        this.going = true;
        SD.Sound.play('select');
        UI.title = null;
        if (it.fn) it.fn();
      },
      draw(g) {
        const u = UI.u, W = UI.W, H = UI.H;
        // 하늘
        const grd = g.createLinearGradient(0, 0, 0, H);
        grd.addColorStop(0, '#5aa8f0'); grd.addColorStop(0.6, '#a8dcff'); grd.addColorStop(1, '#d8f0ff');
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
        // 구름
        const cw = 64 * u;
        for (let i = 0; i < 7; i++) {
          const sp = 6 + (i % 3) * 4;
          const x = ((i * 173 + this.t * sp * u) % (W + cw * 2)) - cw;
          const y = (12 + ((i * 37) % 70)) * u;
          g.drawImage(cloud(i + 3), Math.round(x), Math.round(y), cw, 28 * u);
        }
        // 산과 언덕
        const hw = Math.ceil(W / u) + 2, hh = 90;
        const draw = (img, off) => g.drawImage(img, 0, 0, hw, hh, 0, H - (hh - off) * u, hw * u, hh * u);
        draw(hills(hw, hh, '#7a9ad0', 3, 14, 18), 0);
        draw(hills(hw, hh, '#5aa860', 5, 10, 44), 0);
        draw(hills(hw, hh, '#3f8a3a', 9, 6, 64), 0);
        // 언덕 위 작은 똥들
        for (let i = 0; i < 9; i++) {
          const spr = SD.Crops.sprite(SD.Crops.ids()[i * 3 % 34], SD.Crops.stageCount(SD.Crops.ids()[i * 3 % 34]) - 1);
          const x = ((i + 0.5) / 9) * W - 8 * u;
          g.drawImage(spr, Math.round(x), Math.round(H - 34 * u - (i % 2) * 4 * u), 16 * u, 32 * u);
        }
        // 로고
        const ly = Math.max(20 * u, H * 0.16);
        const big = SD.Crops.sprite('parsnip', SD.Crops.stageCount('parsnip') - 1);
        const bob = Math.round(Math.sin(this.t * 2) * 2) * u;
        g.drawImage(big, Math.round(W / 2 - 24 * u), Math.round(ly - 30 * u + bob), 48 * u, 96 * u);
        const logo = '스타듀 똥밸리';
        g.font = `${Math.round(12 * UI.tu * 3.2)}px Galmuri11, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'top';
        const ty = ly + 52 * u;
        const off = Math.max(2, Math.round(u * 1.2));
        g.fillStyle = '#4a200a';
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [2, 2], [-1, -1], [1, -1], [-1, 1]]) g.fillText(logo, W / 2 + dx * off, ty + dy * off);
        g.fillStyle = '#ffd25a'; g.fillText(logo, W / 2, ty);
        g.fillStyle = '#c87a2a'; g.fillText(logo, W / 2, ty + off * 0.6);
        g.fillStyle = '#ffe890'; g.fillText(logo, W / 2, ty - off * 0.2);
        UI.textOutlined(g, '무엇을 심든 똥이 자라는 마을', W / 2, ty + 48 * UI.tu, { align: 'center', color: '#fff4dc' });
        // 버튼
        this.rects = [];
        const bw = 92 * u, bh = 22 * u;
        items.forEach((it, i) => {
          const bx = W / 2 - bw / 2, by = ty + 70 * UI.tu + i * (bh + 6 * u);
          const r = [bx, by, bw, bh];
          this.rects.push(r);
          UI.frame(g, bx, by + (i === this.sel ? -u : 0), bw, bh);
          UI.text(g, it.label, W / 2, by + (bh - 12 * UI.tu) / 2 + (i === this.sel ? -u : 0), { align: 'center', color: i === this.sel ? '#a8300e' : UI.C.text });
          if (i === this.sel) UI.drawHand(g, bx - 10 * u, by + 6 * u);
        });
        UI.textOutlined(g, 'WASD 이동 · C/스페이스 도구 · X/F 행동 · E 메뉴', W / 2, H - 12 * UI.tu - 4 * u, { align: 'center', size: 0.8, color: '#fff4dc' });
      },
    };
    UI.title = T;
    return T;
  };
})();
