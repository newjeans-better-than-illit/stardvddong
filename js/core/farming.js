'use strict';
// ════════════════════════════════════════════════════════════════════
//  농사: 괭이 흙(자동 타일) · 심기 · 물주기 · 성장(물 준 날만) · 비 · 계절 시듦
//        품질(농사 레벨+비료 훅) · 수확 팝 애니메이션 · 출하 · 채집 똥 생성
//  흙 = 지형요소 { t:'dirt', wet, fert, crop: { id, phase, day, dead, regrowLeft, tint } }
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;
  const X = SD.gfx;
  const TILE = SD.TILE;

  const F = (SD.Farming = {});

  // ───────────── 흙 ─────────────
  function isDirt(loc, x, y) { const f = loc.featAt(x, y); return f && f.t === 'dirt'; }
  F.isDirt = isDirt;

  SD.ObjTypes.define('dirt', {
    layer: 'feature',
    passable(o) {
      const c = o.crop;
      if (!c || c.dead) return true;
      const d = SD.Crops.get(c.id);
      return !(d && d.trellis && c.phase >= 1);
    },
    drawDecal(V, o, loc) {
      const m = (isDirt(loc, o.x, o.y - 1) ? 1 : 0) | (isDirt(loc, o.x + 1, o.y) ? 2 : 0) | (isDirt(loc, o.x, o.y + 1) ? 4 : 0) | (isDirt(loc, o.x - 1, o.y) ? 8 : 0);
      V.ctx.drawImage(SD.Tiles.hoeDirt(m, o.wet), o.x * TILE, o.y * TILE);
      if (o.fert) SD.Mods.emit('drawFertilizer', V, o, loc);
    },
    draw(V, o, loc) {
      const c = o.crop;
      if (!c) return;
      const px = o.x * TILE, py = o.y * TILE;
      const d = SD.Crops.get(c.id);
      if (!d) return;
      let spr;
      if (c.dead) spr = SD.Art.deadCrop();
      else if (c.regrowLeft > 0) spr = SD.Crops.regrowSprite(c.id, c.tint);
      else spr = SD.Crops.sprite(c.id, c.phase, c.tint);
      const mature = F.isMature(c);
      const ang = SD.Obj.shakeAngle(o, 16, 3.2) + (V.windy && c.phase > 0 ? Math.sin(V.t * 2.2 + o.x * 0.9) * 0.03 : 0);
      V.add(py + 13, (g) => {
        SD.Obj.drawRot(g, spr, px + 8, py + 16, 8, 32, ang);
        if (mature && !c.dead) F.drawStink(g, px, py, V.t, o.x * 13 + o.y * 7, d);
      });
    },
    onTouch(o, loc, who) {
      if (!o.crop || !who || !who.moving) return;
      if (o._shT != null && SD.Time.anim - o._shT < 0.45) return;
      SD.Obj.shake(o, o.crop.phase >= 2 ? 0.2 : 0.1, who.vx < 0 ? -1 : 1);
    },
    onAction(o, ctx) {
      const c = o.crop;
      if (!c) return false;
      if (c.dead) { F.clearDead(o, ctx.loc); return true; }
      if (F.isMature(c)) return F.harvest(o, ctx.loc, 'hand');
      return false;
    },
    onTool(o, ctx) {
      const c = o.crop;
      if (ctx.tool === 'scythe') {
        if (c && c.dead) { F.clearDead(o, ctx.loc); return true; }
        if (c && F.isMature(c)) { const d = SD.Crops.get(c.id); if (d.scythe || d.flower) return F.harvest(o, ctx.loc, 'scythe'); }
        return false;
      }
      if (ctx.tool === 'pick') {
        // 곡괭이: 흙을 메운다 (자라는 작물은 보호)
        if (c && !c.dead && c.phase > 0) { SD.Obj.shake(o, 0.2); SD.UI.hud('자라는 똥이 있어요. 곡괭이질은 참아요.'); return true; }
        ctx.loc.removeFeat(o.x, o.y);
        SD.Sound.play('dig');
        SD.FX.debris(o.x * TILE + 8, o.y * TILE + 10, ['#8c5a36', '#744828', '#a87048'], 6, { small: true });
        return true;
      }
      if (ctx.tool === 'axe' && c && c.dead) { F.clearDead(o, ctx.loc); return true; }
      if (ctx.tool === 'hoe' && c && c.phase === 0 && !c.dead) {
        // 갓 심은 씨앗을 괭이로 파내면 씨앗이 나온다
        o.crop = null;
        SD.World.dropItem(ctx.loc, o.x * TILE + 8, o.y * TILE + 8, SD.Crops.get(c.id).seedId, 1);
        SD.Sound.play('dig');
        return true;
      }
      return false;
    },
    dayEnd(o, loc, info) {
      const c = o.crop;
      if (c && !c.dead && o.wet) F.grow(o, loc);
      return undefined;
    },
    dayStart(o, loc, info) {
      const c = o.crop;
      o.wet = false;
      if (c && !c.dead && !loc.def.anySeason) {
        const d = SD.Crops.get(c.id);
        if (d && !d.seasons.includes(info.season)) { c.dead = true; SD.Mods.emit('cropWither', o, loc); }
      }
      if (loc.outdoor && (info.weather === 'rain' || info.weather === 'storm')) o.wet = true;
      SD.Mods.emit('dirtDayStart', o, loc, info);
      // 아무것도 안 심은 흙은 가끔 원래 땅으로 돌아간다
      if (!o.crop && !o.wet && !o.fert && Math.random() < (info.season === 3 ? 0.5 : 0.1)) return 'remove';
      return undefined;
    },
  });

  // 냄새 줄기 + 파리 (다 자란 똥)
  F.drawStink = function (g, px, py, t, h, def) {
    const top = py - 14 + (def.trellis ? -8 : 0) + (def.look.kind === 'tall' ? -10 : 0);
    if (!def.flower) {
      for (let s = 0; s < 2; s++) {
        const off = (t * 5 + (h % 7) + s * 4) % 9;
        for (let i = 0; i < 4; i++) {
          const yy = top + 10 - off - i * 1.6;
          const xx = px + 4 + s * 7 + Math.sin(yy * 0.8 + s * 2) * 1.4;
          g.globalAlpha = Math.max(0, 0.6 - (off + i * 1.6) / 13);
          g.fillStyle = '#b4dc5a';
          g.fillRect(Math.round(xx), Math.round(yy), 1, 1);
        }
      }
      g.globalAlpha = 1;
    }
    const nf = def.flower ? 1 : 2;
    for (let f = 0; f < nf; f++) {
      const a = t * (3.1 + f * 0.9) + (h % 50) + f * 3;
      const fx = px + 8 + Math.cos(a) * (6 + f);
      const fy = top + 12 + Math.sin(a * 1.7) * 3;
      g.fillStyle = '#1b1b1b';
      g.fillRect(Math.round(fx), Math.round(fy), 1, 1);
      if (Math.floor(t * 24 + f) % 2) { g.fillStyle = 'rgba(230,240,255,0.85)'; g.fillRect(Math.round(fx) + (Math.cos(a) > 0 ? -1 : 1), Math.round(fy) - 1, 1, 1); }
    }
    if (def.rare && Math.floor(t * 3 + h) % 5 === 0) {
      const sx = px + 2 + (h % 12), sy = top + 6 + ((h >> 3) % 12);
      g.fillStyle = '#ffffff';
      g.fillRect(sx, sy - 1, 1, 3); g.fillRect(sx - 1, sy, 3, 1);
    }
  };

  // ───────────── 성장 ─────────────
  F.phases = function (o) {
    const d = SD.Crops.get(o.crop.id);
    return SD.Mods.reduce('cropPhases', d.phases.slice(), o, d);
  };
  F.isMature = function (c) {
    if (!c || c.dead || c.regrowLeft > 0) return false;
    const d = SD.Crops.get(c.id);
    return d && c.phase >= d.phases.length;
  };
  F.grow = function (o, loc) {
    const c = o.crop;
    const d = SD.Crops.get(c.id);
    if (c.regrowLeft > 0) { c.regrowLeft--; SD.Mods.emit('cropGrow', o, loc); return; }
    const ph = F.phases(o);
    if (c.phase >= ph.length) return;
    c.day = (c.day || 0) + 1;
    while (c.phase < ph.length && c.day >= ph[c.phase]) { c.day -= ph[c.phase]; c.phase++; }
    if (c.phase >= ph.length) c.day = 0;
    void d;
    SD.Mods.emit('cropGrow', o, loc);
  };
  // 디버그/테스트: 즉시 다 자라게
  F.growFull = function (o) { if (o.crop && !o.crop.dead) { o.crop.phase = SD.Crops.get(o.crop.id).phases.length; o.crop.regrowLeft = 0; o.crop.day = 0; } };

  // ───────────── 괭이질 · 물주기 · 심기 ─────────────
  F.canTill = function (loc, x, y) {
    if (!loc.isDiggable(x, y)) return false;
    if (loc.objAt(x, y) || loc.largeAt(x, y)) return false;
    const f = loc.featAt(x, y);
    if (f && f.t !== 'grass') return false;
    for (const c of loc.chars) if (Math.floor(c.x / TILE) === x && Math.floor((c.y - 2) / TILE) === y) return false;
    return SD.Mods.reduce('canTill', true, loc, x, y);
  };
  F.till = function (loc, x, y) {
    if (!F.canTill(loc, x, y)) return false;
    loc.removeFeat(x, y);
    const o = loc.setFeat(x, y, { t: 'dirt', wet: loc.outdoor && SD.Weather.isRaining() });
    if (Math.random() < 0.03) SD.World.dropItem(loc, x * TILE + 8, y * TILE + 8, 'clay', 1);
    SD.Mods.emit('till', loc, x, y, o);
    return true;
  };
  F.water = function (loc, x, y) {
    const o = loc.featAt(x, y);
    if (!o || o.t !== 'dirt') return false;
    o.wet = true;
    SD.Mods.emit('water', loc, x, y, o);
    return true;
  };
  F.cropSeason = function (loc) { return loc.def.anySeason ? -1 : SD.G.season; };
  // 씨앗 심기. 반환: true(심음) | 문자열(실패 이유)
  F.plant = function (loc, x, y, seedId) {
    const item = SD.Items.get(seedId);
    if (!item) return '알 수 없는 씨앗';
    if (item.tree) return F.plantTree(loc, x, y, item.tree);
    const o = loc.featAt(x, y);
    if (!o || o.t !== 'dirt') return '씨앗은 괭이로 간 흙에 심어요.';
    if (o.crop) return '이미 무언가 심겨 있어요.';
    let cropId = item.seedOf;
    if (item.mixedSeeds) {
      const s = SD.G.season;
      const opts = SD.Crops.all().filter((c) => c.seasons.includes(s) && !c.rare && c.wild == null && c.seedPrice > 0);
      if (!opts.length) return '이 계절에는 섞인 씨앗이 자라지 않아요.';
      cropId = U.pick(opts).id;
    }
    const d = SD.Crops.get(cropId);
    if (!d) return '알 수 없는 씨앗';
    const cs = F.cropSeason(loc);
    if (cs >= 0 && !d.seasons.includes(cs)) {
      const st = d.seasons.length === 4 ? '사계절' : d.seasons.map((s) => SD.SEASON_NAMES[s]).join('·');
      return `${d.name}은(는) ${st}에만 심을 수 있어요.`;
    }
    const blocked = SD.Mods.first('canPlant', loc, x, y, d);
    if (blocked) return typeof blocked === 'string' ? blocked : '여기에는 심을 수 없어요.';
    o.crop = { id: cropId, phase: 0, day: 0, tint: d.tints ? Math.floor(Math.random() * d.tints.length) : 0 };
    SD.Mods.emit('plant', loc, x, y, o, d);
    return true;
  };
  F.plantTree = function (loc, x, y, kind) {
    if (!loc.isDiggable(x, y) || !loc.outdoor) return '나무 씨앗은 바깥 땅에 심어요.';
    const f = loc.featAt(x, y);
    if (loc.objAt(x, y) || loc.largeAt(x, y) || (f && !(f.t === 'grass' || (f.t === 'dirt' && !f.crop)))) return '여기에는 심을 수 없어요.';
    loc.removeFeat(x, y);
    loc.setFeat(x, y, { t: 'tree', kind, stage: 0 });
    return true;
  };

  // ───────────── 품질 · 수확 ─────────────
  // 원작 공식: 금 = 0.2·(레벨/10) + 0.2·비료·((레벨+2)/12) + 0.01, 은 = min(0.75, 금×2), 고급 비료 3단계면 이리듐
  F.cropQuality = function (o) {
    const lvl = SD.Skills.level('farming');
    const fq = SD.Mods.reduce('cropFertQuality', 0, o);
    const gold = 0.2 * (lvl / 10) + 0.2 * fq * ((lvl + 2) / 12) + 0.01;
    const silver = Math.min(0.75, gold * 2);
    const r = Math.random();
    let q = 0;
    if (fq >= 3 && r < gold / 2) q = 3;
    else if (r < gold) q = 2;
    else if (r < silver) q = 1;
    return SD.Mods.reduce('cropQuality', q, o);
  };
  F.forageQuality = function () {
    const lvl = SD.Skills.level('foraging');
    const forced = SD.Mods.reduce('forageQuality', null, lvl);
    if (forced != null) return forced;
    if (Math.random() < lvl / 30) return 2;
    if (Math.random() < lvl / 15) return 1;
    return 0;
  };
  F.harvestXP = (price) => Math.round(16 * Math.log(0.018 * price + 1));

  F.harvest = function (o, loc, how) {
    const c = o.crop;
    const d = SD.Crops.get(c.id);
    let item = d.harvestItem;
    let q = F.cropQuality(o);
    let n = d.yield.min || 1;
    if (d.wild != null) {
      const pool = SD.Forage.forSeason(d.wild);
      item = pool.length ? U.pick(pool).id : 'fiber';
      q = F.forageQuality();
    } else {
      while (d.yield.extra > 0 && Math.random() < Math.min(0.9, d.yield.extra)) n++;
    }
    const res = SD.Mods.reduce('harvestResult', { item, n, q }, o, loc, d);
    if (!SD.Inv.canAdd(res.item, res.n, res.q)) {
      SD.UI.hud('가방이 꽉 찼어요!', { kind: 'error' });
      SD.Sound.play('error');
      return true;
    }
    const cx = o.x * TILE + 8, cy = o.y * TILE + 4;
    SD.Inv.add(res.item, res.n, res.q);
    SD.FX.pop(cx, cy, res.item, res.q, { from: 'crop' });
    SD.Sound.play('harvest');
    SD.FX.leaves(cx, cy + 4, 4, ['#6cbf45', '#a8e070'], { burst: true, small: true });
    SD.FX.debris(cx, cy + 8, ['#744828', '#8c5a36'], 3, { small: true });
    if (d.wild != null) SD.Skills.addXP('foraging', 3);
    else SD.Skills.addXP('farming', F.harvestXP(d.price));
    const st = SD.G.stats;
    st.harvested = st.harvested || {};
    st.harvested[c.id] = (st.harvested[c.id] || 0) + res.n;
    if (c.id === 'sunflower' && Math.random() < 0.6) SD.World.dropItem(loc, cx, cy, d.seedId, 1 + Math.floor(Math.random() * 2));
    SD.Mods.emit('harvest', { loc, x: o.x, y: o.y, dirt: o, crop: c, def: d, item: res.item, n: res.n, q: res.q, how });
    if (d.regrow > 0) { c.regrowLeft = d.regrow; c.day = 0; }
    else o.crop = null;
    if (how === 'hand') SD.Player.anim('pickup');
    return true;
  };
  F.clearDead = function (o, loc) {
    o.crop = null;
    SD.Sound.play('witherClear');
    SD.FX.debris(o.x * TILE + 8, o.y * TILE + 8, ['#8f7a5c', '#6a5a44', '#b8a080'], 7, { small: true });
  };

  // ───────────── 출하 ─────────────
  F.binOpen = function (o) {
    if (o._openT == null) return 0;
    const e = SD.Time.anim - o._openT;
    if (e < 0.12) return e / 0.12;
    if (e < 0.75) return 1;
    if (e < 0.95) return 1 - (e - 0.75) / 0.2;
    return 0;
  };
  // 손에 든 아이템을 통째로 출하함에
  F.shipHeld = function (bin, ctx) {
    const st = SD.Inv.selected();
    if (!st || !SD.Items.canSell(st)) {
      const cnt = SD.G.shipping.reduce((s, x) => s + x.n, 0);
      SD.UI.hud(cnt ? `출하함에 오늘 ${cnt}개를 넣었어요. 밤에 정산돼요.` : '팔 물건을 손에 들고 출하함을 눌러요.');
      SD.Sound.play('binLid');
      bin._openT = SD.Time.anim;
      return true;
    }
    F.ship(st);
    SD.Inv.set(SD.Inv.selIndex(), null);
    bin._openT = SD.Time.anim;
    SD.Sound.play('binLid');
    SD.Sound.play('ship');
    const p = SD.G.player;
    SD.FX.flyItem(p.x, p.y - 30, bin.x * TILE + 16, bin.y * TILE - 4, st.id, st.q);
    SD.UI.hud(`${SD.Items.name(st)} ×${st.n} 출하!`, { icon: st.id, kind: 'good' });
    return true;
  };
  F.ship = function (st) {
    const G = SD.G;
    const ex = G.shipping.find((s) => s.id === st.id && (s.q || 0) === (st.q || 0) && !s.data);
    if (ex && !st.data) ex.n += st.n;
    else G.shipping.push({ id: st.id, n: st.n, q: st.q || 0, data: st.data || undefined });
    G.stats.shippedItems = G.stats.shippedItems || {};
    G.stats.shippedItems[st.id] = (G.stats.shippedItems[st.id] || 0) + st.n;
    SD.Mods.emit('ship', st);
  };

  // ───────────── 채집 똥 / 잡동사니 생성 ─────────────
  // 모듈도 쓸 수 있다: SD.Farming.spawnForage(loc, n, { table: [...ids], test(x,y) })
  F.spawnForage = function (loc, n, opts) {
    const o = opts || {};
    const season = o.season == null ? SD.G.season : o.season;
    const table = o.table || SD.Forage.forSeason(season).map((f) => f.id);
    if (!table.length) return 0;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const spot = loc.randomTile(Math.random, (x, y) => {
        if (o.test) return o.test(x, y);
        if (loc.tileFlags.get(U.tk(x, y)) && loc.tileFlags.get(U.tk(x, y)).noSpawn) return false;
        const t = loc.tileAt(x, y);
        return (t === 'grass' || t === 'dirt' || t === 'path') && !loc.tileProp(x, y, 'solid') && !loc.isOccupied(x, y, { ignoreGrass: true }) && !F.nearWarp(loc, x, y);
      });
      if (!spot) continue;
      loc.removeFeat(spot.x, spot.y);
      loc.setObj(spot.x, spot.y, { t: 'forage', id: U.pick(table) });
      made++;
    }
    return made;
  };
  F.nearWarp = function (loc, x, y) {
    for (const w of loc.warps) if (x >= w.x - 1 && x <= w.x + w.w && y >= w.y - 1 && y <= w.y + w.h) return true;
    return false;
  };
  F.countObjects = function (loc, t) { let n = 0; for (const o of loc.objects.values()) if (o.t === t) n++; return n; };
  // 원작처럼 매일 밤 농장에 잡초·돌·나뭇가지가 조금씩 생긴다
  F.spawnDebris = function (loc, n, rng) {
    const r = rng || Math.random;
    for (let i = 0; i < n; i++) {
      const spot = loc.randomTile(r, (x, y) => loc.tileAt(x, y) === 'grass' && loc.isDiggable(x, y) && !loc.isOccupied(x, y, { ignoreGrass: true }) && !F.nearWarp(loc, x, y) && !(loc.def.clearZone && loc.def.clearZone(x, y)));
      if (!spot) continue;
      const k = r();
      loc.removeFeat(spot.x, spot.y);
      const v = Math.floor(r() * 2);
      if (k < 0.5) loc.setObj(spot.x, spot.y, { t: 'weed', v });
      else if (k < 0.78) loc.setObj(spot.x, spot.y, { t: 'stone', v });
      else loc.setObj(spot.x, spot.y, { t: 'twig', v });
    }
  };

  // ───────────── 하루 처리 (Day 파이프라인이 부른다) ─────────────
  F.dayEndLocation = function (loc, info) {
    for (const map of [loc.features, loc.objects]) {
      for (const o of [...map.values()]) {
        const d = SD.ObjTypes.get(o.t);
        if (d && d.dayEnd) SD.Mods.safe('dayEnd ' + o.t, d.dayEnd, o, loc, info);
      }
    }
    for (const o of loc.large.slice()) { const d = SD.ObjTypes.get(o.t); if (d && d.dayEnd) SD.Mods.safe('dayEnd ' + o.t, d.dayEnd, o, loc, info); }
  };
  F.dayStartLocation = function (loc, info) {
    for (const [map, isFeat] of [[loc.features, true], [loc.objects, false]]) {
      for (const o of [...map.values()]) {
        const d = SD.ObjTypes.get(o.t);
        if (!d || !d.dayStart) continue;
        const r = SD.Mods.safe('dayStart ' + o.t, d.dayStart, o, loc, info);
        if (r === 'remove') { if (isFeat) loc.removeFeat(o.x, o.y); else loc.removeObj(o.x, o.y); }
      }
    }
    for (const o of loc.large.slice()) {
      const d = SD.ObjTypes.get(o.t);
      if (d && d.dayStart && SD.Mods.safe('dayStart ' + o.t, d.dayStart, o, loc, info) === 'remove') loc.removeLarge(o);
    }
    // 채집물·잡동사니
    const fdef = loc.def.forage;
    if (fdef) {
      const have = F.countObjects(loc, 'forage');
      const want = Math.min(fdef.max || 6, have + U.randInt(fdef.perDay ? fdef.perDay[0] : 0, fdef.perDay ? fdef.perDay[1] : 2));
      if (want > have) F.spawnForage(loc, want - have, { table: fdef.table ? fdef.table(info.season) : undefined });
    }
    if (loc.def.debrisPerDay) F.spawnDebris(loc, U.randInt(loc.def.debrisPerDay[0], loc.def.debrisPerDay[1]));
    // 하루가 지나면 바닥 아이템은 그대로, 임시 효과는 비운다
    loc.temp = [];
  };
})();
