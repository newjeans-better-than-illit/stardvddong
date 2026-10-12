'use strict';
// ════════════════════════════════════════════════════════════════════
//  농부(사람) 스프라이트 리그 + 애니메이션 API
//  - 프레임 16×32 비율(SD: 큰 머리, 짧은 몸), 4방향, 4프레임 걷기(서기-왼발-서기-오른발),
//    디딜 때 1px 흔들림, 팔 흔들기. 캔버스는 32×48 (도구·팔이 밖으로 나갈 여유), 발 = (16, 44)
//  - 포즈 { legs:0~3, bob, handL:[x,y], handR:[x,y], ... } → 캐시된 캔버스
//  - SD.Farmer.anims 에 애니메이션 등록: SD.Farmer.define(이름, { dur, lock, pose, tool, draw, events })
//  - NPC 도 SD.Farmer.frame(look, dir, pose) 로 같은 리그를 쓸 수 있다
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const X = SD.gfx;
  const U = SD.util;
  const A = SD.Art;
  const Shp = A.Shp;

  const OX = 8, OY = 12;     // 16×32 프레임 → 32×48 캔버스 오프셋
  const FW = 32, FH = 48;

  const DEFAULT_LOOK = {
    skin: '#f7c9a0', hair: '#7a4826', hairStyle: 'short', eyes: '#2a1a12',
    shirt: '#d8503e', pants: '#4468b8', overalls: true, shoes: '#6e3e1c', hat: null, beard: null, accessory: null,
  };
  SD.DEFAULT_LOOK = DEFAULT_LOOK;

  function ramp(c) { return X.ramp(c); }
  function flat(color) { return [color, color, X.dark(color, 0.2), X.dark(color, 0.35)]; }

  // ───────────── 몸 부위 ─────────────
  function head(S, look, dir, by) {
    const sk = skinRamp(look.skin), hr = ramp(look.hair);
    const y0 = by;
    const style = look.hairStyle || 'short';
    if (dir === 'up') {
      // 뒤통수: 거의 머리카락
      S.ellipse(OX + 7.5, OY + y0 + 10.6, 5.6, 5.4, sk, { group: 'skin' }, 2.6);
      S.add((x, y) => {
        const fx = x - OX, fy = y - OY - y0;
        const inE = X.inEllipse(fx, fy, 7.5, 9.6, 5.7, 5.6) || (Math.abs(fx + 0.5 - 8) <= 5.5 && fy >= 6 && fy <= 13);
        if (!inE) return false;
        if (style === 'long') return fy <= 17;
        return fy <= 13 && !(fy === 13 && (fx === 6 || fx === 9 || fx === 7 || fx === 8));
      }, hr, { group: 'hair', tex: hairTex(hr) });
      if (style === 'bun') S.ellipse(OX + 7.5, OY + y0 + 3.5, 2.5, 2.2, hr, { group: 'hair2' });
      if (style === 'ponytail') S.add((x, y) => x - OX >= 6 && x - OX <= 9 && y - OY - y0 >= 12 && y - OY - y0 <= 17, hr, { group: 'hair2' });
      return;
    }
    const side = dir === 'right';
    const cx = side ? 8 : 7.5;
    // 얼굴
    S.add((x, y) => {
      const fx = x - OX, fy = y - OY - y0;
      const dx = Math.abs(fx + 0.5 - cx) / 5.1, dy = Math.abs(fy + 0.5 - 11.1) / 4.6;
      return Math.pow(dx, 3) + Math.pow(dy, 3) <= 1;
    }, sk, { group: 'skin', tex: (x, y, tone) => (tone === 0 ? sk[1] : null) });
    // 머리카락
    S.add((x, y) => {
      const fx = x - OX, fy = y - OY - y0;
      if (!X.inEllipse(fx, fy, cx, 8.6, 5.8, 5.2) && !(fy >= 7 && fy <= 13 && Math.abs(fx + 0.5 - cx) <= 5.6)) return false;
      if (style === 'bald') return fy <= 6;
      if (side) {
        if (fx <= 5) return fy <= (style === 'long' ? 17 : 13);  // 뒷머리
        if (fx >= 12) return fy <= 8;
        return fy <= 8 || (fy === 9 && fx % 2 === 1 && fx < 11);
      }
      if (fx <= 3 || fx >= 12) return fy <= (style === 'long' ? 17 : 12);  // 옆머리
      if (fy <= 8) return true;
      // 앞머리 (들쭉날쭉)
      return fy === 9 && (fx === 4 || fx === 6 || fx === 9 || fx === 11);
    }, hr, { group: 'hair', tex: hairTex(hr) });
    if (style === 'bun') S.ellipse(OX + cx - (side ? 3 : 0), OY + y0 + 3.4, 2.6, 2.3, hr, { group: 'hair2' });
    if (style === 'spiky') S.add((x, y) => { const fx = x - OX, fy = y - OY - y0; return fy >= 2 && fy <= 4 && fx >= 3 && fx <= 12 && (fx + fy) % 3 === 0; }, hr, { group: 'hair' });
    if (style === 'ponytail' && side) S.add((x, y) => { const fx = x - OX, fy = y - OY - y0; return fx >= 1 && fx <= 3 && fy >= 8 && fy <= 15; }, hr, { group: 'hair2' });
    // 눈
    const eye = look.eyes || '#2a1a12';
    S.after.push((g) => {
      const ey = OY + y0 + 11;
      if (look._blink) {
        if (side) X.px(g, OX + 10, ey + 1, eye, 2, 1);
        else { X.px(g, OX + 4, ey + 1, eye, 2, 1); X.px(g, OX + 10, ey + 1, eye, 2, 1); }
      } else if (side) {
        X.px(g, OX + 10, ey, eye, 1, 2);
        X.px(g, OX + 11, ey, '#ffffff', 1, 1);
      } else {
        X.px(g, OX + 5, ey, eye, 1, 2); X.px(g, OX + 10, ey, eye, 1, 2);
        X.px(g, OX + 4, ey, '#ffffff', 1, 1); X.px(g, OX + 11, ey, '#ffffff', 1, 1);
      }
      if (look.blush !== false && !side) { g.fillStyle = 'rgba(240,120,110,0.45)'; g.fillRect(OX + 4, ey + 2, 1, 1); g.fillRect(OX + 11, ey + 2, 1, 1); }
      if (look.beard) {
        g.fillStyle = look.beard;
        if (side) g.fillRect(OX + 8, ey + 3, 5, 2);
        else { g.fillRect(OX + 5, ey + 3, 6, 2); g.fillRect(OX + 4, ey + 2, 1, 2); g.fillRect(OX + 11, ey + 2, 1, 2); }
      }
      if (look.glasses) {
        g.fillStyle = look.glasses;
        if (side) { g.fillRect(OX + 9, ey - 1, 3, 1); g.fillRect(OX + 9, ey + 1, 3, 1); }
        else { g.fillRect(OX + 3, ey - 1, 4, 1); g.fillRect(OX + 9, ey - 1, 4, 1); g.fillRect(OX + 3, ey + 1, 4, 1); g.fillRect(OX + 9, ey + 1, 4, 1); g.fillRect(OX + 7, ey, 2, 1); }
      }
    });
  }
  // 머리카락: 결 방향 하이라이트 한 줄 (점박이 질감 없이 깔끔하게)
  function hairTex(hr) {
    return (x, y, tone, sh) => {
      // 정수리 쪽 윤기 한 줄
      if (tone === 1 && y === sh.minY + 2 && x > sh.minX + 2 && x < sh.minX + 6) return hr[0];
      return null;
    };
  }
  function skinRamp(c) { return [X.light(c, 0.25), c, X.mix(c, '#c86a50', 0.32), X.mix(c, '#a04a3a', 0.45)]; }
  function hat(S, look, dir, by) {
    if (!look.hat) return;
    const c = look.hatColor || '#e8c460';
    const R = ramp(c);
    const side = dir === 'right';
    const cx = side ? 8 : 7.5;
    if (look.hat === 'straw' || look.hat === 'wide') {
      S.ellipse(OX + cx, OY + by + 7.5, 8, 1.8, R, { group: 'hat' }, 2);
      S.ellipse(OX + cx - (side ? 1 : 0), OY + by + 5, 4.6, 3.2, R, { group: 'hat2' }, 2.4);
      if (look.hatBand) S.after.push((g) => { g.fillStyle = look.hatBand; g.fillRect(OX + Math.round(cx) - 4 - (side ? 1 : 0), OY + by + 6, 9, 1); });
    } else if (look.hat === 'cap') {
      S.ellipse(OX + cx, OY + by + 6, 5.6, 3.4, R, { group: 'hat' }, 2.2);
      if (dir !== 'up') S.add((x, y) => { const fx = x - OX, fy = y - OY - by; return fy === 8 && (side ? fx >= 9 && fx <= 14 : fx >= 3 && fx <= 12); }, R, { group: 'hat2' });
    } else if (look.hat === 'beanie') {
      S.ellipse(OX + cx, OY + by + 6.5, 5.8, 3.8, R, { group: 'hat', tex: (x, y, t) => (y % 2 ? null : R[2]) }, 2.4);
    }
  }
  function torso(S, look, dir, by) {
    const sh = ramp(look.shirt), pa = ramp(look.pants);
    const side = dir === 'right';
    const x0 = side ? 5 : 4, x1 = side ? 10 : 11;
    S.add((x, y) => {
      const fx = x - OX, fy = y - OY - by;
      if (fy < 16 || fy > 22) return false;
      if (fx < x0 || fx > x1) return false;
      if (fy === 16 && (fx === x0 || fx === x1)) return false;
      return true;
    }, sh, {
      group: 'torso',
      tex: (x, y, tone) => {
        const fx = x - OX, fy = y - OY - by;
        if (look.overalls) {
          if (dir === 'down' && fy >= 19 && fx >= 5 && fx <= 10) return fy === 19 ? pa[0] : pa[1];
          if (dir === 'down' && (fx === 5 || fx === 10) && fy >= 16) return pa[1];
          if (dir === 'up' && (fx === 5 || fx === 10) && fy >= 16) return pa[2];
          if (dir === 'up' && fy >= 21) return pa[1];
          if (side && fx >= 7 && fy >= 19) return fy === 19 ? pa[0] : pa[1];
          if (side && fx === 8 && fy >= 16) return pa[1];
        }
        if (dir === 'down' && fy === 16 && (fx === 6 || fx === 9)) return sh[0];
        if (dir === 'down' && fy === 17 && (fx === 7 || fx === 8)) return look.overalls ? null : sh[3];
        return null;
      },
    });
    if (look.overalls && dir === 'down') S.after.push((g) => { X.px(g, OX + 5, OY + by + 19, '#ffd23a'); X.px(g, OX + 10, OY + by + 19, '#ffd23a'); });
  }
  // 다리: frame 0~3
  function legs(S, look, dir, frame, by0) {
    const pa = ramp(look.pants), sh = ramp(look.shoes);
    const side = dir === 'right';
    const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
    if (!side) {
      // 앞/뒤: 왼다리 x4~7, 오른다리 x8~11. 걷는 발은 1px 들린다
      const L = { x0: 4, x1: 7, lift: step === 1 ? 1 : 0 };
      const R2 = { x0: 8, x1: 11, lift: step === -1 ? 1 : 0 };
      for (const lg of [L, R2]) {
        S.add((x, y) => { const fx = x - OX, fy = y - OY; return fx >= lg.x0 && fx <= lg.x1 && fy >= 23 + by0 && fy <= 27 - lg.lift; }, pa, { group: 'leg' + lg.x0, noCast: true });
        S.add((x, y) => {
          const fx = x - OX, fy = y - OY;
          const sy = 28 - lg.lift;
          if (fy < sy || fy > sy + 2) return false;
          if (fx < lg.x0 || fx > lg.x1) return false;
          if (fy === sy + 2 && dir === 'down' && (fx === lg.x0 || fx === lg.x1)) return true;
          return true;
        }, sh, { group: 'shoe' + lg.x0, tex: (x, y, t) => (dir === 'up' && y - OY === 28 - lg.lift ? sh[2] : null) });
      }
      return;
    }
    // 옆: 0/2 다리 모음, 1/3 앞뒤로 벌림
    if (frame === 0 || frame === 2) {
      S.add((x, y) => { const fx = x - OX, fy = y - OY; return fx >= 6 && fx <= 9 && fy >= 23 + by0 && fy <= 27; }, pa, { group: 'leg' });
      S.add((x, y) => { const fx = x - OX, fy = y - OY; return fx >= 6 && fx <= 10 && fy >= 28 && fy <= 30 && !(fy === 28 && fx === 10); }, sh, { group: 'shoe' });
      S.after.push((g) => { g.fillStyle = pa[3]; g.fillRect(OX + 7, OY + 25, 1, 3); });
    } else {
      const back = frame === 1 ? pa : ramp(X.dark(look.pants, 0.12));
      const front = frame === 1 ? ramp(X.dark(look.pants, 0.12)) : pa;
      // 뒷다리
      S.add((x, y) => { const fx = x - OX, fy = y - OY; if (fy < 23 + by0 || fy > 27) return false; const c = 6.5 - (fy - 23) * 0.45; return fx >= Math.floor(c - 1) && fx <= Math.floor(c + 1); }, back, { group: 'legB' });
      S.add((x, y) => { const fx = x - OX, fy = y - OY; return fy >= 28 && fy <= 30 && fx >= 3 && fx <= 6 && !(fy === 28 && fx === 6); }, sh, { group: 'shoeB' });
      // 앞다리
      S.add((x, y) => { const fx = x - OX, fy = y - OY; if (fy < 23 + by0 || fy > 27) return false; const c = 8.5 + (fy - 23) * 0.5; return fx >= Math.floor(c - 1) && fx <= Math.floor(c + 1); }, front, { group: 'legF' });
      S.add((x, y) => { const fx = x - OX, fy = y - OY; return fy >= 28 && fy <= 30 && fx >= 9 && fx <= 12 && !(fy === 28 && fx === 12); }, sh, { group: 'shoeF' });
    }
  }
  // 팔: 어깨 → 손 (1~2px 굵기), 끝 2px 은 손
  function arm(S, look, sx, sy, hx, hy, w, group) {
    const sh = ramp(look.shirt), sk = skinRamp(look.skin);
    const n = Math.max(1, Math.round(Math.max(Math.abs(hx - sx), Math.abs(hy - sy))));
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([Math.round(sx + ((hx - sx) * i) / n), Math.round(sy + ((hy - sy) * i) / n), i]);
    const sleeve = new Set(), hand = new Set();
    for (const [x, y, i] of pts) {
      const set = i >= n - 1 ? hand : sleeve;
      set.add(x + ',' + y);
      if (w === 2) set.add((x + 1) + ',' + y);
    }
    for (const k of hand) sleeve.delete(k);
    S.add((x, y) => sleeve.has(x + ',' + y), sh, { group: group + 's' });
    S.add((x, y) => hand.has(x + ',' + y), sk, { group: group + 'h', flat: true });
  }

  // 어깨 위치 (프레임 좌표 + 오프셋)
  function shoulders(dir, by) {
    if (dir === 'right') return { F: [OX + 7, OY + 17 + by], B: [OX + 7, OY + 17 + by] };
    return { L: [OX + 3, OY + 17 + by], R: [OX + 12, OY + 17 + by] };
  }
  // 기본 손 위치
  function restHands(dir, by, swing) {
    const s = swing || 0;
    if (dir === 'right') return { F: [OX + 7 + s * 2, OY + 22 + by], B: [OX + 7 - s * 2, OY + 22 + by] };
    return { L: [OX + 3, OY + 22 + by - (s > 0 ? 1 : 0)], R: [OX + 12, OY + 22 + by - (s < 0 ? 1 : 0)] };
  }

  // ───────────── 프레임 합성 ─────────────
  // pose: { legs, bob, hands: {L,R} or {F,B} (캔버스 좌표), swing, squash, blink }
  function keyOf(look, dir, pose) {
    const h = pose.hands ? JSON.stringify(pose.hands) : '';
    return `fr:${look._key || (look._key = JSON.stringify(look))}:${dir}:${pose.legs | 0}:${pose.bob | 0}:${pose.swing | 0}:${h}:${pose.blink ? 1 : 0}`;
  }
  function buildFrame(look0, dir0, pose) {
    const flip = dir0 === 'left';
    const dir = flip ? 'right' : dir0;
    const look = pose.blink ? Object.assign({}, look0, { _blink: true }) : look0;
    const S = new Shp(FW, FH);
    const by = pose.bob || 0;
    const sh = shoulders(dir, by);
    const rest = restHands(dir, by, pose.swing);
    const hands = Object.assign({}, rest, pose.hands || {});
    if (dir === 'right') {
      const up = hands.F[1] < OY + 15 + by;
      arm(S, look, sh.B[0], sh.B[1], hands.B[0] - 1, hands.B[1], 2, 'armB');
      legs(S, look, dir, pose.legs || 0, by > 0 ? 1 : 0);
      torso(S, look, dir, by);
      if (up) arm(S, look, sh.F[0], sh.F[1], hands.F[0], hands.F[1], 2, 'armF');
      head(S, look, dir, by);
      hat(S, look, dir, by);
      if (!up) arm(S, look, sh.F[0], sh.F[1], hands.F[0], hands.F[1], 2, 'armF');
    } else {
      legs(S, look, dir, pose.legs || 0, by > 0 ? 1 : 0);
      torso(S, look, dir, by);
      const armsUp = hands.L[1] < OY + 16 + by || hands.R[1] < OY + 16 + by;
      // 앞모습에서 팔을 들면 머리 뒤로 (손만 머리 위로 보인다), 뒷모습은 머리 앞
      if (!armsUp || true) {
        arm(S, look, sh.L[0], sh.L[1], hands.L[0], hands.L[1], 1, 'armL');
        arm(S, look, sh.R[0], sh.R[1], hands.R[0], hands.R[1], 1, 'armR');
      }
      head(S, look, dir, by);
      hat(S, look, dir, by);
      if (false) {
        arm(S, look, sh.L[0], sh.L[1], hands.L[0], hands.L[1], 1, 'armL');
        arm(S, look, sh.R[0], sh.R[1], hands.R[0], hands.R[1], 1, 'armR');
      }
    }
    let c = S.render();
    X.outline(c, { amount: 0.42 });
    if (flip) c = X.flipX(c);
    return c;
  }

  const Farmer = (SD.Farmer = {
    FW, FH, OX, OY,
    look: DEFAULT_LOOK,
    frame(look, dir, pose) {
      const p = pose || {};
      return X.cached(keyOf(look, dir, p), () => buildFrame(look, dir, p));
    },
    // 걷기 포즈: 4프레임 8fps (서기-왼발-서기-오른발), 디딜 때 1px 아래로
    walkPose(t, moving) {
      if (!moving) return { legs: 0, bob: 0, swing: 0 };
      const f = Math.floor(t * 8) % 4;
      return { legs: f, bob: f === 1 || f === 3 ? 1 : 0, swing: f === 1 ? 1 : f === 3 ? -1 : 0 };
    },
    // 프레임 좌표 → 월드 (발 위치 기준)
    toWorld(px, py, fx, fy, dir) {
      const x = dir === 'left' ? FW - fx : fx;
      return [px - 16 + x, py - 44 + fy];
    },
  });

  // ───────────── 도구 회전 스프라이트 ─────────────
  // headAngle: 도구 머리가 향하는 화면 각도(도, 0=오른쪽, 90=아래). 22.5° 단위로 캐시
  Farmer.toolSprite = function (icon, key, headAngle) {
    const step = 22.5;
    const a = Math.round((((headAngle % 360) + 360) % 360) / step) * step;
    return X.cached(`toolrot:${key}:${a}`, () => {
      const rot = ((a + 45) * Math.PI) / 180;
      const img = X.rotateNearest(icon, rot, A.TOOL_GRIP.x + 0.5, A.TOOL_GRIP.y + 0.5, 36);
      return img;
    });
  };
  // 잡는 점(손)에 도구를 그린다
  Farmer.drawTool = function (g, icon, key, wx, wy, headAngle) {
    const img = Farmer.toolSprite(icon, key, headAngle);
    g.drawImage(img, Math.round(wx - 18), Math.round(wy - 18));
  };

  // ───────────── 애니메이션 레지스트리 ─────────────
  // def = { dur, lock(이동 막기, 기본 true), pose(p, k, a) → 포즈 덮어쓰기,
  //         behind(g, p, k, a) / front(g, p, k, a): 몸 뒤·앞에 그리기 (k = 0..1 진행도),
  //         events: [{ at: 0..1, fn(p, a) }], loop }
  const anims = SD.makeRegistry('anims');
  Farmer.anims = anims;
  Farmer.define = (name, def) => anims.define(name, Object.assign({ dur: 0.4, lock: true }, def));
  Farmer.play = function (p, name, opts) {
    const def = anims.get(name);
    if (!def) { console.error('[SD] 없는 애니메이션: ' + name); return null; }
    const a = { name, t: 0, def, opts: opts || {}, fired: {}, dir: p.dir };
    p._anim = a;
    return a;
  };
  Farmer.busy = (p) => !!(p._anim && p._anim.def.lock !== false);
  Farmer.update = function (p, dt) {
    const a = p._anim;
    if (!a) return;
    const dur = a.opts.dur || a.def.dur;
    if (!a.hold) a.t += dt;
    const k = Math.min(1, a.t / dur);
    if (a.def.events) {
      a.def.events.forEach((ev, i) => {
        if (!a.fired[i] && k >= ev.at) { a.fired[i] = true; SD.Mods.safe('anim ' + a.name, ev.fn, p, a); }
      });
    }
    if (a.opts.events) {
      a.opts.events.forEach((ev, i) => {
        if (!a.fired['o' + i] && k >= ev.at) { a.fired['o' + i] = true; SD.Mods.safe('anim ' + a.name, ev.fn, p, a); }
      });
    }
    if (k >= 1 && !a.hold) {
      if (a.def.loop) { a.t = 0; a.fired = {}; return; }
      p._anim = null;
      if (a.opts.onDone) SD.Mods.safe('anim.onDone', a.opts.onDone, p, a);
    }
  };
  // 그리기: (x, y) = 발 위치(월드)
  Farmer.draw = function (g, p, look) {
    const lk = look || p.look || DEFAULT_LOOK;
    const a = p._anim;
    const dir = (a && a.dir) || p.dir;
    let pose;
    if (a) {
      const k = Math.min(1, a.t / (a.opts.dur || a.def.dur));
      pose = a.def.pose ? a.def.pose(p, k, a) : { legs: 0 };
      pose = pose || {};
      if (a.def.behind) SD.Mods.safe('anim.behind', a.def.behind, g, p, k, a, dir);
      if (!pose.hidden) {
        const blink = !pose.noBlink && (Math.floor(SD.Time.anim * 10) % 37 === 0);
        const fr = Farmer.frame(lk, pose.dir || dir, Object.assign({ blink }, pose));
        const ox = pose.ox || 0, oy = pose.oy || 0;
        if (pose.rot) SD.Obj.drawRot(g, fr, p.x + ox, p.y + oy, 16, 44, pose.rot);
        else g.drawImage(fr, Math.round(p.x - 16 + ox), Math.round(p.y - 44 + oy));
      }
      if (a.def.front) SD.Mods.safe('anim.front', a.def.front, g, p, k, a, dir);
      return;
    }
    pose = Farmer.walkPose(p._walkT || 0, p.moving);
    pose.blink = Math.floor(SD.Time.anim * 10) % 37 === 0;
    const fr = Farmer.frame(lk, dir, pose);
    g.drawImage(fr, Math.round(p.x - 16), Math.round(p.y - 44));
    // 들고 있는 물건 (작물·채집물 등은 머리 위로) — 원작처럼
    const held = p._held;
    if (held) g.drawImage(SD.Items.icon(held), Math.round(p.x - 8), Math.round(p.y - 50 + (pose.bob || 0)));
  };

  // ───────────── 기본 애니메이션들 ─────────────
  // 손 위치 도우미 (캔버스 좌표)
  const H = (x, y) => [OX + x, OY + y];
  // 도구 키프레임: 방향별 [손 위치, 도구 머리 각도, 몸 뒤?]
  const TOOL_KEYS = {
    down: { raise: { hands: { L: H(6, 2), R: H(9, 2) }, grip: [7.5, 2], ang: -90, behind: true }, strike: { hands: { L: H(6, 21), R: H(9, 21) }, grip: [7.5, 21], ang: 90, behind: false } },
    up: { raise: { hands: { L: H(6, 2), R: H(9, 2) }, grip: [7.5, 2], ang: 90, behind: false }, strike: { hands: { L: H(6, 11), R: H(9, 11) }, grip: [7.5, 11], ang: -90, behind: true } },
    right: { raise: { hands: { F: H(4, 4), B: H(4, 4) }, grip: [4, 4], ang: -125, behind: true }, strike: { hands: { F: H(12, 19), B: H(11, 19) }, grip: [12, 19], ang: 55, behind: false } },
  };
  Farmer.TOOL_KEYS = TOOL_KEYS;
  function toolState(dir, k) {
    // k: 0..1 진행. 0~0.375 들기, 0.375~0.7 내려찍기, 이후 유지
    const d = dir === 'left' ? 'right' : dir;
    const K = TOOL_KEYS[d];
    let phase, ang, grip, hands, behind;
    if (k < 0.375) {
      const u = U.easeOut(k / 0.375);
      phase = 'raise';
      ang = U.lerp(K.raise.ang + (d === 'right' ? 60 : 40), K.raise.ang, u);
      grip = K.raise.grip; hands = K.raise.hands; behind = K.raise.behind;
    } else if (k < 0.7) {
      const u = U.easeIn((k - 0.375) / 0.325);
      phase = 'strike';
      let a0 = K.raise.ang, a1 = K.strike.ang;
      if (d === 'up') { a0 = 90; a1 = -90; }
      ang = U.lerp(a0, a1 + (d === 'up' ? 0 : 0), u);
      if (d === 'down') ang = U.lerp(-90, 90, u);
      const g0 = K.raise.grip, g1 = K.strike.grip;
      grip = [U.lerp(g0[0], g1[0], u), U.lerp(g0[1], g1[1], u)];
      hands = u < 0.5 ? K.raise.hands : K.strike.hands;
      behind = u < 0.5 ? K.raise.behind : K.strike.behind;
    } else {
      phase = 'hold';
      ang = K.strike.ang; grip = K.strike.grip; hands = K.strike.hands; behind = K.strike.behind;
    }
    return { phase, ang, grip, hands, behind };
  }
  Farmer.toolState = toolState;
  function toolIconOf(a) {
    const o = a.opts;
    if (o.icon) return [o.icon, o.iconKey || 'icon'];
    const st = o.stack;
    if (st) return [SD.Items.icon(st), (st.id || '') + ':' + (st.lvl || 0)];
    return [null, null];
  }
  function drawToolAt(g, p, a, dir, ts, layer) {
    if (ts.behind !== (layer === 'behind')) return;
    const [icon, key] = toolIconOf(a);
    if (!icon) return;
    let ang = ts.ang;
    let gx = OX + ts.grip[0], gy = OY + ts.grip[1];
    if (dir === 'left') { ang = 180 - ang; gx = FW - gx; }
    const shake = a.charging ? (Math.floor(SD.Time.anim * 30) % 2 ? 1 : -1) * Math.min(1, a.chargeLevel || 0) : 0;
    Farmer.drawTool(g, icon, key + (dir === 'left' ? ':L' : ''), p.x - 16 + gx + shake, p.y - 44 + gy, ang);
  }
  // 괭이·곡괭이·도끼: 머리 위로 들었다가(150ms) 내려찍기(130ms), 찍는 순간 이벤트, 총 400ms
  Farmer.define('tool', {
    dur: 0.4,
    pose(p, k, a) {
      if (a.charging) {
        const K = TOOL_KEYS[a.dir === 'left' ? 'right' : a.dir].raise;
        const sh = Math.floor(SD.Time.anim * 30) % 2 ? 1 : 0;
        return { hands: K.hands, ox: sh * Math.min(1, a.chargeLevel || 0) };
      }
      const ts = toolState(a.dir, k);
      return { hands: ts.hands, bob: ts.phase === 'hold' ? 1 : 0 };
    },
    behind(g, p, k, a, dir) { const ts = a.charging ? Object.assign(toolState(dir, 0.37)) : toolState(dir, k); drawToolAt(g, p, a, dir, ts, 'behind'); },
    front(g, p, k, a, dir) { const ts = a.charging ? toolState(dir, 0.37) : toolState(dir, k); drawToolAt(g, p, a, dir, ts, 'front'); },
    events: [{ at: 0.7, fn(p, a) { if (a.opts.onHit) a.opts.onHit(p, a); } }],
  });
  // 물뿌리개: 기울여 따르기 + 물줄기 입자
  Farmer.define('water', {
    dur: 0.55,
    pose(p, k, a) {
      const d = a.dir === 'left' ? 'right' : a.dir;
      if (d === 'right') return { hands: { F: H(11, 19), B: H(10, 19) } };
      if (d === 'down') return { hands: { L: H(6, 21), R: H(9, 21) } };
      return { hands: { L: H(6, 14), R: H(9, 14) } };
    },
    behind(g, p, k, a, dir) { if (dir === 'up') drawCan(g, p, k, a, dir); },
    front(g, p, k, a, dir) { if (dir !== 'up') drawCan(g, p, k, a, dir); },
    events: [{ at: 0.45, fn(p, a) { if (a.opts.onHit) a.opts.onHit(p, a); } }],
  });
  function drawCan(g, p, k, a, dir) {
    const [icon, key] = toolIconOf(a);
    if (!icon) return;
    const tilt = Math.min(1, k / 0.25);
    const d = dir === 'left' ? 'right' : dir;
    let gx, gy, ang;
    if (d === 'right') { gx = OX + 11; gy = OY + 17; ang = U.lerp(-45, 10, tilt); }
    else if (d === 'down') { gx = OX + 7; gy = OY + 20; ang = U.lerp(-45, -10, tilt); }
    else { gx = OX + 7; gy = OY + 12; ang = U.lerp(-45, -80, tilt); }
    if (dir === 'left') { gx = FW - gx; ang = 180 - ang; }
    const wx = p.x - 16 + gx, wy = p.y - 44 + gy;
    // 물뿌리개 아이콘은 손잡이가 위에 있으므로 중심 회전으로 그린다
    const img = Farmer.toolSprite(icon, key + ':can' + (dir === 'left' ? 'L' : ''), ang);
    g.drawImage(img, Math.round(wx - 18 + (dir === 'left' ? -4 : 4)), Math.round(wy - 18 - 2));
    // 물줄기
    if (k > 0.2 && k < 0.95 && a.opts.water !== false) {
      const sx = wx + (d === 'right' ? (dir === 'left' ? -9 : 9) : d === 'down' ? 6 : 0);
      const sy = wy + (d === 'up' ? -6 : -4);
      const tx = a.opts.tx != null ? a.opts.tx * 16 + 8 : sx, ty = a.opts.ty != null ? a.opts.ty * 16 + 10 : sy + 14;
      for (let i = 0; i < 7; i++) {
        const u = ((SD.Time.anim * 3 + i / 7) % 1);
        const x = U.lerp(sx, tx, u) + Math.sin(i * 7) * 1.5;
        const y = U.lerp(sy, ty, u) - Math.sin(u * Math.PI) * 4;
        g.fillStyle = i % 2 ? '#bfe6ff' : '#6fb8f0';
        g.fillRect(Math.round(x), Math.round(y), 1, 2);
      }
    }
  }
  // 낫·검: 앞쪽 반원 휘두르기 + 잔상 호
  const SWING_ARC = { right: [-100, 100], down: [-10, 190], up: [190, 370], left: [280, 80] };
  Farmer.SWING_ARC = SWING_ARC;
  Farmer.swingAngle = function (dir, k) {
    const [a0, a1] = SWING_ARC[dir];
    if (dir === 'left') return U.lerp(-80, -280, U.easeOut(k)) ;
    return U.lerp(a0, a1, U.easeOut(k));
  };
  Farmer.define('swing', {
    dur: 0.3,
    pose(p, k, a) {
      const d = a.dir === 'left' ? 'right' : a.dir;
      const ang = Farmer.swingAngle(a.dir === 'left' ? 'right' : a.dir, k) * Math.PI / 180;
      if (d === 'right') return { hands: { F: [OX + 8 + Math.round(Math.cos(ang) * 4), OY + 18 + Math.round(Math.sin(ang) * 3)], B: H(8, 19) }, legs: k > 0.3 ? 1 : 0 };
      if (d === 'down') return { hands: { L: H(4, 19), R: [OX + 8 + Math.round(Math.cos(ang) * 4), OY + 20 + Math.round(Math.sin(ang) * 2)] } };
      return { hands: { L: H(4, 16), R: [OX + 8 + Math.round(Math.cos(ang) * 4), OY + 14 + Math.round(Math.sin(ang) * 2)] } };
    },
    behind(g, p, k, a, dir) { if (dir === 'up') drawSwing(g, p, k, a, dir); },
    front(g, p, k, a, dir) { if (dir !== 'up') drawSwing(g, p, k, a, dir); },
    events: [{ at: 0.35, fn(p, a) { if (a.opts.onHit) a.opts.onHit(p, a); } }],
  });
  function drawSwing(g, p, k, a, dir) {
    const [icon, key] = toolIconOf(a);
    const cx = p.x, cy = p.y - (dir === 'up' ? 22 : dir === 'down' ? 20 : 22);
    const angD = dir === 'left' ? 180 - Farmer.swingAngle('right', k) : Farmer.swingAngle(dir, k);
    // 잔상 호
    const [a0] = dir === 'left' ? [180 - SWING_ARC.right[0]] : SWING_ARC[dir];
    const rad = 15;
    g.save();
    g.globalAlpha = 0.55 * (1 - k * 0.7);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.beginPath();
    const s = (a0 * Math.PI) / 180, e = (angD * Math.PI) / 180;
    g.arc(cx, cy, rad, Math.min(s, e), Math.max(s, e));
    g.stroke();
    g.globalAlpha = 0.3 * (1 - k);
    g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cy, rad - 3, Math.min(s, e), Math.max(s, e)); g.stroke();
    g.restore();
    if (icon) {
      const r = (angD * Math.PI) / 180;
      const hx = cx + Math.cos(r) * 4, hy = cy + Math.sin(r) * 4;
      Farmer.drawTool(g, icon, key, hx, hy, angD);
    }
  }
  // 머리 위로 들어 올리기 (처음 얻은 물건/도구)
  Farmer.define('holdUp', {
    dur: 1.6,
    pose() { return { hands: { L: H(6, 4), R: H(9, 4) }, dir: 'down', noBlink: true }; },
    front(g, p, k, a) {
      const id = a.opts.item;
      if (!id) return;
      const icon = typeof id === 'string' ? SD.Items.icon(id) : id;
      const lift = Math.min(1, k * 5);
      g.drawImage(icon, Math.round(p.x - 8), Math.round(p.y - 46 - lift * 6));
      if (k < 0.6 && Math.floor(SD.Time.anim * 8) % 2) { g.fillStyle = '#fff6c0'; g.fillRect(Math.round(p.x - 11), Math.round(p.y - 54), 1, 1); g.fillRect(Math.round(p.x + 10), Math.round(p.y - 50), 1, 1); }
    },
  });
  // 먹기: 입으로 가져가 우물우물 3번
  Farmer.define('eat', {
    dur: 1.6,
    pose(p, k) {
      const munch = k > 0.2 ? Math.floor((k - 0.2) * 12) % 2 : 0;
      return { hands: { L: H(3, 22), R: H(9, 14) }, dir: 'down', bob: munch };
    },
    front(g, p, k, a) {
      const id = a.opts.item;
      if (!id || k > 0.85) return;
      const sz = k < 0.2 ? 16 : Math.max(6, Math.round(16 - (k - 0.2) * 14));
      const icon = SD.Items.icon(id);
      g.drawImage(icon, Math.round(p.x - 2), Math.round(p.y - 32 + (16 - sz) / 2), sz, sz);
    },
    events: [0.3, 0.5, 0.7].map((at) => ({ at, fn() { SD.Sound.play('eat'); } })),
  });
  Farmer.define('drink', {
    dur: 1.4,
    pose(p, k) { return { hands: { L: H(3, 22), R: H(9, 13) }, dir: 'down', oy: k > 0.3 && k < 0.8 ? -1 : 0 }; },
    front(g, p, k, a) { if (a.opts.item && k < 0.85) g.drawImage(SD.Items.icon(a.opts.item), Math.round(p.x - 2), Math.round(p.y - 34)); },
    events: [{ at: 0.3, fn() { SD.Sound.play('drink'); } }],
  });
  // 줍기·수확 (살짝 숙임)
  Farmer.define('pickup', {
    dur: 0.22, lock: true,
    pose(p, k, a) {
      const d = a.dir;
      const down = k < 0.6;
      if (d === 'right' || d === 'left') return { hands: { F: H(11, 23), B: H(8, 22) }, bob: down ? 1 : 0 };
      return { hands: { L: H(5, 22), R: H(10, 22) }, bob: down ? 1 : 0 };
    },
  });
  // 기절: 무릎이 꺾이고 앞으로 쓰러진다
  Farmer.define('passOut', {
    dur: 1.4,
    pose(p, k) {
      if (k < 0.35) return { dir: 'down', bob: 1, legs: 0, hands: { L: H(4, 23), R: H(11, 23) }, oy: Math.round(k * 4), noBlink: true, blink: true };
      const u = Math.min(1, (k - 0.35) / 0.3);
      return { dir: 'down', blink: true, rot: U.easeIn(u) * Math.PI / 2, oy: 1, noBlink: true };
    },
    front(g, p, k) {
      if (k > 0.75) {
        g.fillStyle = '#ffffff';
        const z = Math.floor(SD.Time.anim * 2) % 3;
        for (let i = 0; i <= z; i++) { const x = Math.round(p.x + 8 + i * 4), y = Math.round(p.y - 14 - i * 5); g.fillRect(x, y, 3, 1); g.fillRect(x + 2, y + 1, 1, 1); g.fillRect(x + 1, y + 2, 1, 1); g.fillRect(x, y + 3, 3, 1); }
      }
    },
  });
  // 낚싯대 던지기 등 모듈용 기본 포즈 하나: 도구를 앞으로 내민 채 유지
  Farmer.define('holdTool', {
    dur: 1, lock: true, loop: true,
    pose(p, k, a) {
      const d = a.dir === 'left' ? 'right' : a.dir;
      if (d === 'right') return { hands: { F: H(11, 17), B: H(10, 18) } };
      if (d === 'down') return { hands: { L: H(6, 20), R: H(9, 20) } };
      return { hands: { L: H(6, 13), R: H(9, 13) } };
    },
    front(g, p, k, a, dir) {
      if (dir === 'up') return;
      const ts = { ang: a.opts.angle != null ? a.opts.angle : (dir === 'down' ? 60 : -30), grip: dir === 'down' ? [7.5, 20] : [11, 17], behind: false };
      drawToolAt(g, p, a, dir, ts, 'front');
    },
    behind(g, p, k, a, dir) {
      if (dir !== 'up') return;
      drawToolAt(g, p, a, dir, { ang: -90, grip: [7.5, 13], behind: true }, 'behind');
    },
  });
})();
