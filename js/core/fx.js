'use strict';
// ════════════════════════════════════════════════════════════════════
//  효과: 입자(터짐·파편·잎·물방울·물결·연기·먼지·반짝임), 수확 팝, 날아가는 아이템,
//        떠오르는 글자/데미지 숫자, 화면 흔들림, 화면 번쩍임
//  좌표는 월드 픽셀. layer: 'world'(조명 영향, 기본) | 'glow'(조명 위, 밤에도 밝음)
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;
  const X = SD.gfx;

  const parts = [];
  const pops = [];
  const texts = [];
  const shake = { amt: 0, t: 0, dur: 0 };
  const flash = { color: '#ffffff', a: 0, t: 0, dur: 0 };
  const MAX = 900;

  function add(p) {
    if (parts.length >= MAX) parts.shift();
    p.t = 0;
    p.z = p.z || 0;
    p.vz = p.vz || 0;
    p.layer = p.layer || 'world';
    parts.push(p);
    return p;
  }

  const FX = (SD.FX = {
    parts, pops, texts,
    add,
    clear() { parts.length = 0; pops.length = 0; texts.length = 0; },
    // 사방으로 튀는 점들
    burst(x, y, opts) {
      const o = opts || {};
      const cols = o.colors || ['#ffffff'];
      const n = o.n || 8;
      for (let i = 0; i < n; i++) {
        const a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || 1) : Math.random() * Math.PI * 2;
        const sp = (o.speed || 40) * (0.4 + Math.random() * 0.8);
        add({ kind: 'px', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, z: o.z || 2, vz: (o.up || 50) * (0.5 + Math.random()), g: o.gravity == null ? 260 : o.gravity, life: (o.life || 0.6) * (0.6 + Math.random() * 0.6), color: cols[i % cols.length], size: o.size || (Math.random() < 0.5 ? 1 : 2), layer: o.layer });
      }
    },
    // 돌·나무 파편: 튀어 올라 땅에 떨어진 뒤 잠깐 남는다
    debris(x, y, colors, n, opts) {
      const o = opts || {};
      for (let i = 0; i < (n || 8); i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (o.small ? 25 : 45) * (0.3 + Math.random());
        add({ kind: 'chunk', x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, z: 4 + Math.random() * 6, vz: 50 + Math.random() * 70, g: 300, life: 0.7 + Math.random() * 0.5, color: colors[i % colors.length], size: o.small ? 1 + (Math.random() < 0.3 ? 1 : 0) : 2 - (Math.random() < 0.3 ? 1 : 0), bounce: 0 });
      }
    },
    // 나뭇잎: 팔랑팔랑 흔들리며 떨어진다 (opts.burst: 위로 튀었다가)
    leaves(x, y, n, colors, opts) {
      const o = opts || {};
      for (let i = 0; i < n; i++) {
        const spread = o.spread || 8;
        add({
          kind: 'leaf', x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread,
          vx: (Math.random() - 0.5) * (o.burst ? 60 : 12), vy: o.burst ? -20 - Math.random() * 30 : 4 + Math.random() * 8,
          sway: Math.random() * 6, life: o.fall ? 2.2 + Math.random() : 1.1 + Math.random() * 0.6,
          color: colors[i % colors.length], size: o.small ? 1 : 2, fall: o.fall ? 26 + Math.random() * 10 : 0, rot: Math.random() * 6,
        });
      }
    },
    splash(x, y, opts) {
      const o = opts || {};
      const n = o.big ? 14 : 7;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const sp = (o.big ? 50 : 30) * (0.5 + Math.random());
        add({ kind: 'px', x, y, vx: Math.cos(a) * sp * 0.6, vy: 0, z: 1, vz: -Math.sin(a) * sp + 20, g: 260, life: 0.5, color: i % 2 ? '#e8f6ff' : '#8fd0f5', size: 1 });
      }
      add({ kind: 'ring', x, y, life: o.big ? 0.8 : 0.5, r0: 2, r1: o.big ? 12 : 7, color: '#d8f0ff' });
    },
    ripple(x, y, r) { add({ kind: 'ring', x, y, life: 0.7, r0: 1, r1: r || 6, color: '#d8f0ff' }); },
    smoke(x, y, opts) {
      const o = opts || {};
      add({ kind: 'smoke', x, y, vx: 4 + Math.random() * 3, vy: -10 - Math.random() * 5, life: o.life || 2.4, r0: 1.5, r1: o.r || 5, color: o.color || '#d8d4d0' });
    },
    dust(x, y, n, color) {
      for (let i = 0; i < (n || 4); i++) add({ kind: 'smoke', x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 30, vy: -4 - Math.random() * 6, life: 0.45 + Math.random() * 0.3, r0: 1.5, r1: 3.5, color: color || '#e8d8bc' });
    },
    sparkle(x, y, opts) {
      const o = opts || {};
      add({ kind: 'sparkle', x, y, life: o.life || 0.5, color: o.color || '#ffffff', layer: 'glow', size: o.size || 2 });
    },
    // 물줄기 방울 (물뿌리개)
    water(x, y, n) {
      for (let i = 0; i < (n || 8); i++) add({ kind: 'px', x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 20, vy: 0, z: 3 + Math.random() * 4, vz: 30 + Math.random() * 30, g: 300, life: 0.4, color: i % 2 ? '#d8f0ff' : '#6fb8f0', size: 1 });
    },
    // ── 수확 팝: 작물에서 톡 튀어 올라 농부에게 날아가 흡수 ──
    pop(x, y, itemId, q, opts) {
      pops.push({ kind: 'pop', x, y, z: 0, vz: 95, t: 0, id: itemId, q: q || 0, phase: 0, v: 0, opts: opts || {} });
    },
    // 아이템이 (x0,y0) → (x1,y1) 로 포물선 비행 (출하함 등)
    flyItem(x0, y0, x1, y1, itemId, q, opts) {
      pops.push({ kind: 'fly', x0, y0, x1, y1, x: x0, y: y0, t: 0, dur: (opts && opts.dur) || 0.35, id: itemId, q: q || 0, arc: (opts && opts.arc) || 18 });
    },
    // ── 떠오르는 글자 ──
    // opts: { color, size(배율), life, rise, bounce(데미지 숫자처럼 튀어 오르기), outline }
    text(x, y, str, opts) {
      const o = opts || {};
      texts.push({
        x, y, z: 0, str: String(str), color: o.color || '#fff4dc', outline: o.outline || '#2a1a0e', size: o.size || 1, life: o.life || 1.2, t: 0,
        vy: o.bounce ? 0 : -(o.rise == null ? 14 : o.rise), vz: o.bounce ? 70 : 0, vx: o.bounce ? (Math.random() - 0.5) * 20 : 0, bounce: !!o.bounce,
      });
    },
    damage(x, y, n, opts) { FX.text(x, y, String(n), Object.assign({ bounce: true, color: '#ff4a3a', size: 1.2, life: 1.0 }, opts || {})); },
    shake(amount, dur) {
      if (amount >= shake.amt * (shake.dur > 0 ? 1 - shake.t / shake.dur : 0)) { shake.amt = amount; shake.dur = dur || 0.3; shake.t = 0; }
    },
    shakeOffset() {
      if (shake.dur <= 0 || shake.t >= shake.dur) return [0, 0];
      const k = shake.amt * (1 - shake.t / shake.dur);
      return [(Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k];
    },
    flash(color, dur, alpha) { flash.color = color || '#ffffff'; flash.dur = dur || 0.3; flash.t = 0; flash.a = alpha == null ? 0.8 : alpha; },
    flashAlpha() { return flash.dur > 0 && flash.t < flash.dur ? flash.a * (1 - flash.t / flash.dur) : 0; },
    flashColor() { return flash.color; },

    update(dt) {
      shake.t += dt;
      flash.t += dt;
      const p = SD.G && SD.G.player;
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.t += dt;
        if (q.t >= q.life) { parts.splice(i, 1); continue; }
        if (q.kind === 'px' || q.kind === 'chunk') {
          q.x += q.vx * dt; q.y += q.vy * dt;
          q.vz -= q.g * dt; q.z += q.vz * dt;
          if (q.z <= 0) {
            q.z = 0;
            if (q.kind === 'chunk' && q.bounce < 1) { q.bounce++; q.vz = Math.abs(q.vz) * 0.3; q.vx *= 0.4; q.vy *= 0.4; }
            else { q.vx *= 0.8; q.vy *= 0.8; q.vz = 0; }
          }
        } else if (q.kind === 'leaf') {
          if (q.fall) { q.vy = U.lerp(q.vy, q.fall * 0.5, dt * 2); }
          else q.vy += 40 * dt;
          q.x += (q.vx + Math.sin(q.t * 4 + q.sway) * 14) * dt;
          q.y += q.vy * dt;
          q.vx *= 1 - dt * 1.5;
          q.rot += dt * 5;
        } else if (q.kind === 'smoke') {
          q.x += q.vx * dt; q.y += q.vy * dt;
          q.vx *= 1 - dt; q.vy *= 1 - dt * 0.5;
        } else if (q.kind === 'free') {
          if (q.update) q.update(q, dt);
        }
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        const q = pops[i];
        q.t += dt;
        if (q.kind === 'pop') {
          if (q.phase === 0) {
            q.vz -= 380 * dt; q.z += q.vz * dt;
            if (q.t > 0.32) { q.phase = 1; q.v = 20; }
          } else if (p) {
            q.v = Math.min(300, q.v + 700 * dt);
            const tx = p.x, ty = p.y - 16;
            const dx = tx - q.x, dy = ty - (q.y - q.z);
            const d = Math.hypot(dx, dy);
            if (d < q.v * dt + 3 || q.t > 2) { pops.splice(i, 1); continue; }
            q.x += (dx / d) * q.v * dt;
            const ny = q.y - q.z + (dy / d) * q.v * dt;
            q.z = q.y - ny;
          } else { pops.splice(i, 1); continue; }
        } else if (q.kind === 'fly') {
          const k = Math.min(1, q.t / q.dur);
          q.x = U.lerp(q.x0, q.x1, k);
          q.y = U.lerp(q.y0, q.y1, k) - Math.sin(k * Math.PI) * q.arc;
          if (k >= 1) { pops.splice(i, 1); continue; }
        }
      }
      for (let i = texts.length - 1; i >= 0; i--) {
        const q = texts[i];
        q.t += dt;
        if (q.t >= q.life) { texts.splice(i, 1); continue; }
        q.y += q.vy * dt;
        q.x += q.vx * dt;
        if (q.bounce) {
          q.vz -= 260 * dt; q.z += q.vz * dt;
          if (q.z < 0) { q.z = 0; q.vz = Math.abs(q.vz) * 0.3; q.vx *= 0.5; }
        }
      }
    },
    // 월드 레이어 입자 (렌더러가 부른다)
    draw(g, layer, V) {
      for (const q of parts) {
        if (q.layer !== layer) continue;
        const k = q.t / q.life;
        const fade = Math.min(1, (1 - k) * 3);
        if (q.kind === 'px' || q.kind === 'chunk') {
          g.globalAlpha = q.kind === 'chunk' ? Math.min(1, (1 - k) * 4) : fade;
          g.fillStyle = q.color;
          g.fillRect(Math.round(q.x), Math.round(q.y - q.z), q.size, q.size);
        } else if (q.kind === 'leaf') {
          g.globalAlpha = fade;
          g.fillStyle = q.color;
          const fl = Math.cos(q.rot) > 0;
          const x = Math.round(q.x), y = Math.round(q.y);
          if (q.size === 1) g.fillRect(x, y, fl ? 2 : 1, 1);
          else { g.fillRect(x, y, fl ? 3 : 2, 1); g.fillRect(x + (fl ? 1 : 0), y + 1, fl ? 2 : 1, 1); g.fillStyle = X.dark(q.color, 0.3); g.fillRect(x + (fl ? 2 : 1), y + 1, 1, 1); }
        } else if (q.kind === 'ring') {
          g.globalAlpha = 0.8 * (1 - k);
          const r = U.lerp(q.r0, q.r1, U.easeOut(k));
          g.strokeStyle = q.color;
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(Math.round(q.x) + 0.5, Math.round(q.y) + 0.5, r, r * 0.45, 0, 0, Math.PI * 2);
          g.stroke();
        } else if (q.kind === 'smoke') {
          g.globalAlpha = 0.55 * (1 - k);
          g.fillStyle = q.color;
          const r = U.lerp(q.r0, q.r1, k);
          X.ellipse(g, q.x, q.y, r, r * 0.9, q.color);
        } else if (q.kind === 'sparkle') {
          g.globalAlpha = 1 - k;
          g.fillStyle = q.color;
          const s = k < 0.5 ? q.size : 1;
          const x = Math.round(q.x), y = Math.round(q.y);
          g.fillRect(x - s, y, s * 2 + 1, 1); g.fillRect(x, y - s, 1, s * 2 + 1);
        } else if (q.kind === 'free' && q.draw) {
          q.draw(g, q, V);
        }
      }
      g.globalAlpha = 1;
      if (layer === 'world') {
        for (const q of pops) {
          const icon = SD.Items.icon(q.id);
          if (q.kind === 'pop') {
            const s = q.phase === 0 ? 1 : 1;
            g.drawImage(icon, Math.round(q.x - 8 * s), Math.round(q.y - q.z - 12), 16 * s, 16 * s);
          } else {
            g.drawImage(icon, Math.round(q.x - 8), Math.round(q.y - 8));
          }
        }
      }
    },
  });
})();
