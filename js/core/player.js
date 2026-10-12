'use strict';
// ════════════════════════════════════════════════════════════════════
//  농부 조작: 이동(초당 약 5칸)·충돌·발소리·워프, 대상 칸(마우스/바라보는 쪽),
//  도구 쓰기(차지 포함)·행동(수확·대화·출하)·먹기·들어 올리기, 툴바 선택
//  훅: 'toolUse'(ctx) → true 면 처리됨, 'action'(ctx) → true, 'useItem'(ctx) → true,
//      'playerUpdate'(p, dt)
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;
  const TILE = SD.TILE;
  const In = () => SD.Input;

  const SPEED = 80;            // px/s ≈ 5칸/초
  const BOX = [10, 6];

  const Player = (SD.Player = {
    SPEED, BOX,
    charge: null,
  });

  Player.tile = function (p) { const q = p || SD.G.player; return { x: Math.floor(q.x / TILE), y: Math.floor((q.y - 3) / TILE) }; };
  Player.facingTile = function (p) {
    const q = p || SD.G.player;
    const t = Player.tile(q);
    const d = SD.DIRS[q.dir];
    return { x: t.x + d.x, y: t.y + d.y };
  };
  // 도구·행동 대상 칸: 마우스가 농부 주변 1칸 안이면 그 칸, 아니면 바라보는 쪽
  Player.target = function () {
    const p = SD.G.player;
    const t = Player.tile(p);
    const m = In().mouse;
    if (In().mouseActive()) {
      In().updateWorld();
      if (Math.abs(m.tx - t.x) <= 1 && Math.abs(m.ty - t.y) <= 1) return { x: m.tx, y: m.ty, mouse: true };
    }
    return Player.facingTile(p);
  };
  Player.faceToward = function (tx, ty) {
    const p = SD.G.player;
    const t = Player.tile(p);
    const dx = tx - t.x, dy = ty - t.y;
    if (!dx && !dy) return;
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx < 0 ? 'left' : 'right';
    else p.dir = dy < 0 ? 'up' : 'down';
  };
  // 마우스 쪽을 바라보게 (멀리 클릭해도 그쪽으로 도구를 쓴다 — 원작)
  Player.faceMouse = function () {
    const p = SD.G.player;
    const m = In().mouse;
    In().updateWorld();
    const dx = m.wx - p.x, dy = m.wy - (p.y - 12);
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx < 0 ? 'left' : 'right';
    else p.dir = dy < 0 ? 'up' : 'down';
  };

  // ───────────── 매 프레임 ─────────────
  Player.update = function (dt) {
    const G = SD.G, p = G.player;
    const loc = SD.World.current;
    if (p._invuln > 0) p._invuln -= dt;
    SD.Farmer.update(p, dt);
    p.isPlayer = true;
    // 툴바
    toolbarInput();
    if (In().pressed('mute')) { SD.Sound.setMuted(!SD.Sound.muted); SD.UI.hud(SD.Sound.muted ? '소리를 껐어요.' : '소리를 켰어요.'); }
    if (In().pressed('menu') || In().pressed('cancel')) { if (!SD.Farmer.busy(p)) { SD.UI.openMenu(); return; } }
    const busy = SD.Farmer.busy(p) || SD.World.transition || SD.Day.busy;
    // 차지 중
    if (Player.charge) { updateCharge(dt); p.moving = false; return; }
    // 이동
    let mx = 0, my = 0;
    if (!busy) {
      if (In().down('up')) my -= 1;
      if (In().down('down')) my += 1;
      if (In().down('left')) mx -= 1;
      if (In().down('right')) mx += 1;
    }
    p.moving = !!(mx || my);
    p.vx = mx; p.vy = my;
    if (p.moving) {
      if (mx && !my) p.dir = mx < 0 ? 'left' : 'right';
      else if (my && !mx) p.dir = my < 0 ? 'up' : 'down';
      else if (!((p.dir === 'left' && mx < 0) || (p.dir === 'right' && mx > 0) || (p.dir === 'up' && my < 0) || (p.dir === 'down' && my > 0))) p.dir = my < 0 ? 'up' : 'down';
      const len = Math.hypot(mx, my);
      let sp = SD.Mods.reduce('playerSpeed', p.exhausted || p.energy <= 0 ? SPEED * 0.75 : SPEED, p);
      const step = sp * dt;
      const nx = p.x + (mx / len) * step, ny = p.y + (my / len) * step;
      let movedX = false, movedY = false;
      // 이미 무언가에 끼어 있으면(순간이동 직후 등) 자유롭게 빠져나오게
      const stuck = blocked(loc, p.x, p.y, p);
      if (stuck || !blocked(loc, nx, p.y, p)) { p.x = U.clamp(nx, 4, loc.w * TILE - 4); movedX = true; }
      else slide(loc, p, mx / len * step, 0);
      if (stuck || !blocked(loc, p.x, ny, p)) { p.y = U.clamp(ny, 6, loc.h * TILE); movedY = true; }
      else slide(loc, p, 0, my / len * step);
      const prevF = Math.floor((p._walkT || 0) * 8) % 4;
      p._walkT = (p._walkT || 0) + dt;
      const f = Math.floor(p._walkT * 8) % 4;
      if (f !== prevF && (f === 1 || f === 3)) {
        const t = Player.tile(p);
        const step2 = SD.G.season === 3 && loc.outdoor && loc.tileAt(t.x, t.y) === 'grass' ? 'snow' : loc.stepSound(t.x, t.y);
        SD.Sound.play('step_' + step2, { minGap: 0.1 });
      }
      void movedX; void movedY;
      if (In().mouse.type === 'mouse') In().mouse.lastMove = Math.min(In().mouse.lastMove, SD.Time.real - 1.5);
    } else p._walkT = 0;
    // 닿은 것 흔들기 / 워프
    if (!busy) touchStuff(loc, p);
    // 들고 있는 물건 (머리 위)
    const st = SD.Inv.selected();
    const def = st && SD.Items.get(st.id);
    p._held = def && !def.tool && def.cat !== 'seed' && !def.noHold && !SD.Farmer.busy(p) ? st : null;
    if (busy) return;
    // 도구 / 행동
    const useP = In().pressed('use');
    const touchTap = In().touchTap;
    In().touchTap = null;
    if (touchTap) {
      const t = Player.tile(p);
      if (Math.abs(touchTap.tx - t.x) <= 1 && Math.abs(touchTap.ty - t.y) <= 1 && !(touchTap.tx === t.x && touchTap.ty === t.y)) {
        Player.faceToward(touchTap.tx, touchTap.ty);
        Player.tryAction({ x: touchTap.tx, y: touchTap.ty }) || Player.useSelected({ x: touchTap.tx, y: touchTap.ty }, true);
      }
    }
    if (useP || (In().down('use') && !p._useLock)) {
      if (In().mouseActive() && In().mouse.left) {
        const tg = Player.target();
        if (!tg.mouse) Player.faceMouse();
      }
      Player.useSelected(null, useP);
    }
    if (!In().down('use')) p._useLock = false;
    if (In().pressed('action')) {
      if (In().mouseActive() && In().mouse.right && !Player.target().mouse) Player.faceMouse();
      Player.tryAction() || Player.actionFallback();
    }
    SD.Mods.emit('playerUpdate', p, dt);
  };

  function boxAt(x, y) { return [x - BOX[0] / 2, y - BOX[1], x + BOX[0] / 2, y]; }
  function blocked(loc, x, y, p) {
    const b = boxAt(x, y);
    return loc.rectBlocked(b[0], b[1], b[2], b[3], p);
  }
  // 모서리에 걸리면 옆으로 미끄러지기 (원작처럼 문틈을 쉽게 지나간다)
  function slide(loc, p, dx, dy) {
    for (const off of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
      if (dx) { if (!blocked(loc, p.x, p.y + off, p) && !blocked(loc, p.x + dx, p.y + off, p)) { p.y += Math.sign(off) * Math.min(Math.abs(dx), 1); return; } }
      if (dy) { if (!blocked(loc, p.x + off, p.y, p) && !blocked(loc, p.x + off, p.y + dy, p)) { p.x += Math.sign(off) * Math.min(Math.abs(dy), 1); return; } }
    }
  }
  function touchStuff(loc, p) {
    const b = boxAt(p.x, p.y);
    const tx0 = Math.floor(b[0] / TILE), ty0 = Math.floor(b[1] / TILE), tx1 = Math.floor((b[2] - 0.01) / TILE), ty1 = Math.floor((b[3] - 0.01) / TILE);
    let onBed = false;
    for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
      const inside = tx >= tx0 && tx <= tx1 && ty >= ty0 && ty <= ty1;
      const k = U.tk(tx, ty);
      const f = loc.features.get(k);
      if (f) { const d = SD.ObjTypes.get(f.t); if (d && d.onTouch && (inside || (p.moving && f.t === 'dirt'))) d.onTouch(f, loc, p); }
      const o = loc.objects.get(k);
      if (o && !inside && p.moving) { const d = SD.ObjTypes.get(o.t); if (d && d.onTouch && Math.abs((tx * TILE + 8) - p.x) < 14 && Math.abs((ty * TILE + 12) - p.y) < 14) d.onTouch(o, loc, p); }
      if (inside) {
        const L = loc.largeAt(tx, ty);
        if (L) { const d = SD.ObjTypes.get(L.t); if (d && d.onTouch) { d.onTouch(L, loc, p); if (L.t === 'bed') onBed = true; } }
      }
    }
    if (!onBed) SD.Day._ask = 0;
    // 워프 (발 가운데 칸)
    const t = { x: Math.floor(p.x / TILE), y: Math.floor((p.y - 2) / TILE) };
    const w = loc.warpAt(t.x, t.y, false);
    if (w) doWarp(w);
    // 지도 밖으로 나가려 하면 (가장자리 워프)
    const off = p.x < 2 ? 'left' : p.x > loc.w * TILE - 2 ? 'right' : p.y < 8 ? 'up' : p.y > loc.h * TILE - 1 ? 'down' : null;
    if (off) { const e = loc.warps.find((ww) => ww.edge === off); if (e) doWarp(e); }
  }
  function doWarp(w) {
    const p = SD.G.player;
    if (SD.World.transition) return;
    const ok = SD.World.warp(w.to, w.tx, w.ty, w.dir, { sound: w.sound, blockedMsg: w.msg });
    if (!ok) {
      // 막힌 길: 살짝 뒤로 밀어낸다
      const d = SD.DIRS[p.dir];
      p.x -= d.x * 6; p.y -= d.y * 6;
    }
  }
  Player.doWarp = doWarp;

  function toolbarInput() {
    const G = SD.G;
    for (let i = 0; i < 12; i++) if (In().pressed('slot' + i)) { SD.Inv.select(i); SD.Sound.play('smallSelect'); }
    if (In().pressed('slotPrev') || In().mouse.wheel < 0) { SD.Inv.select(G.sel - 1); SD.Sound.play('smallSelect'); }
    if (In().pressed('slotNext') || In().mouse.wheel > 0) { SD.Inv.select(G.sel + 1); SD.Sound.play('smallSelect'); }
    if (In().pressed('rowNext')) SD.Inv.cycleRow(1);
    if (In().pressed('rowPrev')) SD.Inv.cycleRow(-1);
  }

  // ───────────── 도구 문맥 ─────────────
  Player.toolCtx = function (st, tx, ty, extra) {
    const p = SD.G.player;
    const def = SD.Items.get(st.id);
    return Object.assign({
      p, loc: SD.World.current, stack: st, item: def, tool: def.tool || null, lvl: st.lvl || 0, power: 0,
      tx, ty, dir: p.dir, weapon: def.weapon || null,
    }, extra || {});
  };
  // 도구를 한 칸에 적용: 훅 → 오브젝트 → 큰 오브젝트 → 지형요소 → 캐릭터 → 도구 기본
  Player.applyToolAt = function (ctx, tx, ty) {
    const loc = ctx.loc;
    const c = Object.assign({}, ctx, { tx, ty });
    if (SD.Mods.first('toolUse', c)) return true;
    const o = loc.objAt(tx, ty);
    if (o) { const d = SD.ObjTypes.get(o.t); if (d && d.onTool && d.onTool(o, c)) return true; }
    const L = loc.largeAt(tx, ty);
    if (L) { const d = SD.ObjTypes.get(L.t); if (d && d.onTool && d.onTool(L, c)) return true; }
    const f = loc.featAt(tx, ty);
    if (f) { const d = SD.ObjTypes.get(f.t); if (d && d.onTool && d.onTool(f, c)) return true; }
    for (const ch of loc.chars) {
      if (Math.floor(ch.x / TILE) === tx && Math.floor((ch.y - 2) / TILE) === ty) {
        const d = SD.Chars.get(ch.t);
        if (d && d.onTool && d.onTool(ch, c)) return true;
      }
    }
    const tdef = SD.Tools.get(ctx.tool);
    if (tdef && tdef.onTile) return !!tdef.onTile(c);
    return false;
  };
  // 차지 범위 칸 목록 (원작: 1, 3, 5, 3×3, 6×3)
  Player.areaTiles = function (tx, ty, dir, level) {
    const d = SD.DIRS[dir];
    const side = { x: d.y !== 0 ? 1 : 0, y: d.x !== 0 ? 1 : 0 };
    const [wide, len] = [[1, 1], [1, 3], [1, 5], [3, 3], [3, 6]][U.clamp(level, 0, 4)];
    const out = [];
    for (let i = 0; i < len; i++) {
      for (let j = 0; j < wide; j++) {
        const o = wide === 1 ? 0 : j - 1;
        out.push({ x: tx + d.x * i + side.x * o, y: ty + d.y * i + side.y * o });
      }
    }
    return out;
  };

  // ───────────── 선택한 아이템 쓰기 ─────────────
  Player.useSelected = function (forceTarget, pressed) {
    const p = SD.G.player;
    if (SD.Farmer.busy(p)) return;
    const st = SD.Inv.selected();
    const tg = forceTarget || Player.target();
    if (!st) { if (pressed) Player.tryAction(tg); return; }
    const def = SD.Items.get(st.id);
    if (!def) return;
    const ctx = Player.toolCtx(st, tg.x, tg.y, { pressed });
    if (SD.Mods.first('useItem', ctx)) return;
    if (def.tool) {
      const tdef = SD.Tools.get(def.tool);
      if (tg.mouse || forceTarget) Player.faceToward(tg.x, tg.y);
      if (tdef) tdef.use(ctx, tdef);
      return;
    }
    if (def.cat === 'seed' || def.seedOf || def.tree || def.mixedSeeds) {
      const r = SD.Farming.plant(ctx.loc, tg.x, tg.y, st.id);
      if (r === true) {
        SD.Inv.consumeSelected(1);
        SD.Sound.play('seedPlant');
        SD.FX.debris(tg.x * TILE + 8, tg.y * TILE + 10, ['#5e3a22', '#3c2212'], 3, { small: true });
        p._useLock = false;
      } else if (pressed && typeof r === 'string') { SD.UI.hud(r); SD.Sound.play('cancel'); }
      return;
    }
    if (def.place) { if (pressed || def.placeRepeat) def.place(ctx); return; }
    if (def.onUse) { if (pressed) def.onUse(ctx); return; }
    if (pressed && SD.Items.isEdible(st)) { Player.askEat(st); return; }
    if (pressed) Player.tryAction(tg);
  };

  // ───────────── 행동 (수확·채집·대화·출하·문) ─────────────
  Player.tryAction = function (forceTarget) {
    const p = SD.G.player;
    const loc = SD.World.current;
    const tg = forceTarget || Player.target();
    const tiles = [tg];
    const t = Player.tile(p);
    const f = Player.facingTile(p);
    if (!(f.x === tg.x && f.y === tg.y)) tiles.push(f);
    tiles.push(t);
    for (const tile of tiles) {
      const ctx = { p, loc, tx: tile.x, ty: tile.y, dir: p.dir, stack: SD.Inv.selected() };
      if (SD.Mods.first('action', ctx)) return true;
      // 캐릭터 (NPC·동물)
      for (const ch of loc.chars) {
        const d = SD.Chars.get(ch.t);
        if (!d || !d.onAction) continue;
        const cx = Math.floor(ch.x / TILE), cy = Math.floor((ch.y - 2) / TILE);
        if ((cx === tile.x && (cy === tile.y || cy - 1 === tile.y))) { Player.faceToward(cx, cy); if (d.onAction(ch, ctx)) return true; }
      }
      const o = loc.objAt(tile.x, tile.y);
      if (o) { const d = SD.ObjTypes.get(o.t); if (d && d.onAction && d.onAction(o, ctx)) { Player.faceToward(tile.x, tile.y); return true; } }
      const L = loc.largeAt(tile.x, tile.y);
      if (L) { const d = SD.ObjTypes.get(L.t); if (d && d.onAction && d.onAction(L, ctx)) { Player.faceToward(tile.x, tile.y); return true; } }
      const ft = loc.featAt(tile.x, tile.y);
      if (ft) { const d = SD.ObjTypes.get(ft.t); if (d && d.onAction && d.onAction(ft, ctx)) { Player.faceToward(tile.x, tile.y); return true; } }
      const w = loc.warpAt(tile.x, tile.y, true);
      if (w) { doWarp(w); return true; }
    }
    return false;
  };
  // 행동할 것이 없으면: 손에 든 음식은 먹기
  Player.actionFallback = function () {
    const st = SD.Inv.selected();
    if (st && SD.Items.isEdible(st) && !SD.Items.get(st.id).tool) Player.askEat(st);
  };

  // ───────────── 먹기 ─────────────
  Player.askEat = function (st) {
    const name = SD.Items.name(st);
    const e = SD.Items.energyOf(st);
    if (!e) return;
    SD.UI.question(`${U.withJosa(name, '을', '를')} 먹을까요?`, [
      { label: '먹는다', fn: () => Player.eat(st) },
      { label: '안 먹는다' },
    ]);
  };
  Player.eat = function (st) {
    const p = SD.G.player;
    const e = SD.Items.energyOf(st);
    const idx = SD.G.inv.indexOf(st);
    if (idx < 0 || !e) return;
    SD.Inv.removeAt(idx, 1);
    const drink = SD.Items.get(st.id).drink;
    SD.Farmer.play(p, drink ? 'drink' : 'eat', {
      item: st.id,
      onDone: () => {
        if (e.energy < 0) { SD.Stats.useEnergy(-e.energy); SD.FX.text(p.x, p.y - 36, `기력 ${e.energy}`, { color: '#ff7a5a' }); }
        else { SD.Stats.addEnergy(e.energy); SD.Stats.heal(e.health); SD.FX.text(p.x, p.y - 36, `+${e.energy} 기력`, { color: '#a8f070' }); }
        SD.Sound.play('gulp');
        SD.Mods.emit('eat', st, e);
      },
    });
  };

  // 머리 위로 들어 올리기 + 팡파르 (처음 얻은 도구·특별한 물건)
  Player.holdUp = function (item, text, onDone) {
    const p = SD.G.player;
    p.dir = 'down';
    SD.Sound.play('fanfare');
    SD.Farmer.play(p, 'holdUp', { item, onDone: () => { if (text) SD.UI.say(text); if (onDone) onDone(); } });
  };
  // 짧은 애니메이션 재생 (모듈용 공개 API)
  Player.anim = function (name, opts) { return SD.Farmer.play(SD.G.player, name, opts); };

  // ───────────── 차지 (업그레이드한 괭이·물뿌리개) ─────────────
  Player.startCharge = function (ctx, tdef) {
    const p = SD.G.player;
    const maxLv = Math.min(ctx.lvl, tdef.maxCharge != null ? tdef.maxCharge : 4);
    Player.charge = { ctx, tdef, t: 0, level: 0, max: maxLv, tx: ctx.tx, ty: ctx.ty, dir: p.dir };
    const a = SD.Farmer.play(p, tdef.anim, { stack: ctx.stack, tx: ctx.tx, ty: ctx.ty, water: false });
    a.hold = true; a.charging = true; a.t = (tdef.anim === 'water' ? 0.1 : 0.15); a.chargeLevel = 0;
  };
  function updateCharge(dt) {
    const c = Player.charge;
    const p = SD.G.player;
    c.t += dt;
    const lvl = Math.min(c.max, Math.floor(c.t / 0.55));
    if (lvl !== c.level) { c.level = lvl; SD.Sound.play('toolCharge', { level: lvl }); }
    if (p._anim) p._anim.chargeLevel = c.level;
    if (!In().down('use')) {
      // 놓으면 범위에 적용
      Player.charge = null;
      const a = p._anim;
      if (a) { a.hold = false; a.charging = false; a.t = c.tdef.anim === 'water' ? 0.12 : 0.15; }
      c.ctx.power = c.level;
      const tiles = Player.areaTiles(c.tx, c.ty, c.dir, c.level);
      c.tdef.release(c.ctx, tiles, c.level);
    }
  }
  Player.chargeTiles = function () {
    const c = Player.charge;
    if (!c) return null;
    return Player.areaTiles(c.tx, c.ty, c.dir, c.level);
  };

  // ───────────── 그리기 ─────────────
  Player.draw = function (g, p) {
    if (p._invuln > 0 && Math.floor(p._invuln * 12) % 2) return;
    SD.Farmer.draw(g, p, p.look);
    SD.Mods.emit('drawPlayer', g, p);
  };
  // 도구 대상 칸 강조 (차지 시 범위 사각형)
  Player.drawTarget = function (V, loc) {
    const G = SD.G;
    if (!G || SD.UI.blocking() || G.player.loc !== loc.id || SD.Day.busy) return;
    const g = V.ctx;
    const ct = Player.chargeTiles();
    if (ct) {
      const t = SD.Time.anim;
      g.fillStyle = `rgba(255,255,255,${0.18 + Math.sin(t * 10) * 0.06})`;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      for (const tt of ct) {
        g.fillRect(tt.x * TILE, tt.y * TILE, TILE, TILE);
      }
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const tt of ct) { x0 = Math.min(x0, tt.x); y0 = Math.min(y0, tt.y); x1 = Math.max(x1, tt.x); y1 = Math.max(y1, tt.y); }
      g.lineWidth = 1;
      g.strokeRect(x0 * TILE + 0.5, y0 * TILE + 0.5, (x1 - x0 + 1) * TILE - 1, (y1 - y0 + 1) * TILE - 1);
      return;
    }
    const st = SD.Inv.selected();
    if (!st) return;
    const def = SD.Items.get(st.id);
    if (!def) return;
    const show = def.tool || def.cat === 'seed' || def.place || def.seedOf;
    if (!show) return;
    const tg = Player.target();
    if (def.place && def.canPlace) {
      const ok = def.canPlace(Player.toolCtx(st, tg.x, tg.y));
      g.fillStyle = ok ? 'rgba(80,255,80,0.35)' : 'rgba(255,60,60,0.35)';
      g.fillRect(tg.x * TILE, tg.y * TILE, TILE, TILE);
      return;
    }
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1;
    g.strokeRect(tg.x * TILE + 0.5, tg.y * TILE + 0.5, TILE - 1, TILE - 1);
  };

  // ═════════════ 기본 도구 ═════════════
  const CAN_CAP = [40, 55, 70, 85, 100];
  SD.CAN_CAPACITY = CAN_CAP;
  function spendTool(ctx, base, skill, power) {
    const cost = SD.Skills.energyCost(base * ((power || 0) + 1), skill);
    SD.Stats.useEnergy(cost);
  }
  // 도구를 휘두르는 공통 흐름: 애니메이션 → 찍는 순간 적용
  function swingTool(ctx, tdef, onHit) {
    const p = SD.G.player;
    SD.Farmer.play(p, tdef.anim, { stack: ctx.stack, tx: ctx.tx, ty: ctx.ty, onHit: () => onHit() });
  }

  // 괭이
  SD.Tools.define('hoe', {
    name: '괭이', skill: 'farming', energy: 2, charge: true, anim: 'tool',
    desc: '땅을 갈아 밭을 만든다. 업그레이드하면 꾹 눌러 넓게 갈 수 있다.',
    icon: (lvl) => SD.Art.toolIcon('hoe', lvl),
    held: (lvl) => SD.Art.toolIcon('hoe', lvl, true),
    use(ctx, tdef) {
      if (ctx.lvl > 0 && ctx.pressed) { Player.startCharge(ctx, tdef); return; }
      swingTool(ctx, tdef, () => { spendTool(ctx, 2, 'farming', 0); tdef.release(ctx, [{ x: ctx.tx, y: ctx.ty }], 0, true); });
    },
    release(ctx, tiles, level, already) {
      if (!already) spendTool(ctx, 2, 'farming', level);
      let any = false;
      for (const t of tiles) any = Player.applyToolAt(ctx, t.x, t.y) || any;
      if (!any) SD.Sound.play('axeMiss');
    },
    onTile(c) {
      const loc = c.loc;
      if (SD.Farming.till(loc, c.tx, c.ty)) {
        SD.Sound.play('hoe');
        SD.FX.debris(c.tx * TILE + 8, c.ty * TILE + 10, ['#a87048', '#744828', '#5a361c'], 6, { small: true });
        SD.FX.dust(c.tx * TILE + 8, c.ty * TILE + 12, 2, '#c8a078');
        return true;
      }
      if (loc.isWater(c.tx, c.ty)) { SD.FX.splash(c.tx * TILE + 8, c.ty * TILE + 8); SD.Sound.play('smallSplash'); return true; }
      return false;
    },
  });
  // 물뿌리개
  SD.Tools.define('can', {
    name: '물뿌리개', skill: 'farming', energy: 2, charge: true, anim: 'water',
    desc: '밭에 물을 준다. 물이 떨어지면 연못에서 다시 채운다.',
    nameFor: (lvl) => (SD.TOOL_LEVELS[lvl] ? SD.TOOL_LEVELS[lvl].prefix : '') + '물뿌리개',
    icon: (lvl) => SD.Art.toolIcon('can', lvl),
    capacity: (lvl) => CAN_CAP[lvl || 0],
    use(ctx, tdef) {
      const st = ctx.stack;
      if (st.water == null) st.water = CAN_CAP[st.lvl || 0];
      // 물 채우기
      if (ctx.loc.isWater(ctx.tx, ctx.ty)) {
        SD.Farmer.play(ctx.p, 'water', { stack: st, tx: ctx.tx, ty: ctx.ty, water: false, onHit: () => {
          st.water = CAN_CAP[st.lvl || 0];
          SD.Sound.play('refill');
          SD.FX.splash(ctx.tx * TILE + 8, ctx.ty * TILE + 8, { big: true });
          SD.UI.hud('물뿌리개를 가득 채웠어요.', { icon: 'can' });
          SD.Inv.changed();
        } });
        return;
      }
      if (st.water <= 0) {
        SD.Farmer.play(ctx.p, 'water', { stack: st, tx: ctx.tx, ty: ctx.ty, water: false });
        SD.UI.hud('물뿌리개가 비었어요. 연못에서 물을 채워요.', { kind: 'error' });
        SD.Sound.play('cancel');
        return;
      }
      if (ctx.lvl > 0 && ctx.pressed) { Player.startCharge(ctx, tdef); return; }
      SD.Farmer.play(ctx.p, 'water', { stack: st, tx: ctx.tx, ty: ctx.ty, onHit: () => tdef.release(ctx, [{ x: ctx.tx, y: ctx.ty }], 0) });
    },
    release(ctx, tiles, level) {
      const st = ctx.stack;
      spendTool(ctx, 2, 'farming', level);
      st.water = Math.max(0, (st.water || 0) - 1);
      SD.Sound.play('water');
      for (const t of tiles) {
        SD.FX.water(t.x * TILE + 8, t.y * TILE + 10, 6);
        Player.applyToolAt(ctx, t.x, t.y);
      }
      SD.Inv.changed();
    },
    onTile(c) { return SD.Farming.water(c.loc, c.tx, c.ty); },
  });
  // 곡괭이
  SD.Tools.define('pick', {
    name: '곡괭이', skill: 'mining', energy: 2, anim: 'tool',
    desc: '돌을 깨고, 간 흙을 다시 메운다.',
    icon: (lvl) => SD.Art.toolIcon('pick', lvl),
    held: (lvl) => SD.Art.toolIcon('pick', lvl, true),
    use(ctx, tdef) {
      swingTool(ctx, tdef, () => {
        spendTool(ctx, 2, 'mining', 0);
        if (!Player.applyToolAt(ctx, ctx.tx, ctx.ty)) SD.Sound.play('axeMiss');
      });
    },
    onTile(c) {
      const t = c.loc.tileAt(c.tx, c.ty);
      if (t === 'cliff' || t === 'stairs') { SD.Sound.play('clink'); SD.FX.burst(c.tx * TILE + 8, c.ty * TILE + 10, { colors: ['#ffffff', '#c8c0b0'], n: 3, up: 20 }); return true; }
      return false;
    },
  });
  // 도끼
  SD.Tools.define('axe', {
    name: '도끼', skill: 'foraging', energy: 2, anim: 'tool',
    desc: '나무를 베고 나뭇가지와 그루터기를 치운다.',
    icon: (lvl) => SD.Art.toolIcon('axe', lvl),
    held: (lvl) => SD.Art.toolIcon('axe', lvl, true),
    use(ctx, tdef) {
      swingTool(ctx, tdef, () => {
        spendTool(ctx, 2, 'foraging', 0);
        if (!Player.applyToolAt(ctx, ctx.tx, ctx.ty)) SD.Sound.play('axeMiss');
      });
    },
  });
  // 낫: 앞쪽 반원 (3칸) 동시에 베기, 기력 소모 없음
  SD.Tools.define('scythe', {
    name: '낫', skill: 'farming', energy: 0, anim: 'swing', levels: 0,
    desc: '풀과 잡초를 벤다. 밀·아마란스 같은 똥은 낫으로 거둔다.',
    nameFor: () => '낫',
    icon: () => SD.Art.toolIcon('scythe', 0),
    held: () => SD.Art.toolIcon('scythe', 0, true),
    use(ctx, tdef) {
      SD.Sound.play('swish');
      SD.Farmer.play(ctx.p, 'swing', { stack: ctx.stack, onHit: () => {
        const t = Player.tile(ctx.p);
        const d = SD.DIRS[ctx.p.dir];
        const side = { x: d.y !== 0 ? 1 : 0, y: d.x !== 0 ? 1 : 0 };
        const tiles = [
          { x: t.x + d.x, y: t.y + d.y },
          { x: t.x + d.x + side.x, y: t.y + d.y + side.y },
          { x: t.x + d.x - side.x, y: t.y + d.y - side.y },
          { x: t.x + side.x, y: t.y + side.y },
          { x: t.x - side.x, y: t.y - side.y },
          t,
        ];
        for (const tt of tiles) Player.applyToolAt(Object.assign({}, ctx, { dir: ctx.p.dir }), tt.x, tt.y);
      } });
    },
  });
})();
