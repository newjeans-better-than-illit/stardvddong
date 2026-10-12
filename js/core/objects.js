'use strict';
// ════════════════════════════════════════════════════════════════════
//  월드 오브젝트 타입 레지스트리 + 코어 타입
//  인스턴스는 JSON 으로 저장되는 평범한 객체 { t:'타입', x, y, ... }.
//  밑줄(_)로 시작하는 필드는 저장되지 않는 연출용 상태다.
//
//  SD.ObjTypes.define('타입', {
//    layer: 'object' | 'feature' | 'large',
//    passable(o, who, loc), blocks(o, tx, ty, who, loc)  // large 전용
//    draw(V, o, loc)         // y정렬 레이어: V.add(sortY, ctx => ...) 로 그린다
//    drawDecal(V, o, loc)    // 바닥 데칼 레이어 (괭이흙, 러그…)
//    shadow(o) → [cx, cy, w, h, alpha]
//    onTool(o, ctx) → true(처리됨), onAction(o, ctx) → true, onTouch(o, loc, who)
//    dayStart(o, loc, info) → 'remove' 면 삭제
//    light(o, loc, add)      // 광원
//  })
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const X = SD.gfx;
  const U = SD.util;
  const A = SD.Art;
  const TILE = SD.TILE;

  const types = SD.makeRegistry('objTypes');
  SD.ObjTypes = types;

  const Obj = (SD.Obj = {
    type: (o) => types.get(o.t),
    passable(o, who, loc) {
      const d = types.get(o.t);
      if (!d) return true;
      if (typeof d.passable === 'function') return !!d.passable(o, who, loc);
      if (d.passable != null) return !!d.passable;
      return d.layer === 'feature';
    },
    blocks(o, tx, ty, who, loc) {
      const d = types.get(o.t);
      if (!d) return false;
      if (d.blocks) return !!d.blocks(o, tx, ty, who, loc);
      if (d.passable === true) return false;
      return true;
    },
    saveable(o) { const d = types.get(o.t); return !d || d.save !== false; },
    // 흔들림 시작 (그릴 때 시간으로 계산하므로 업데이트 불필요)
    shake(o, amp, dir) {
      const now = SD.Time ? SD.Time.anim : 0;
      o._shT = now;
      o._shA = Math.min(0.5, Math.max(o._shA && now - o._shT < 0.6 ? o._shA : 0, amp || 0.25));
      o._shD = dir == null ? (Math.random() < 0.5 ? -1 : 1) : dir;
    },
    shakeAngle(o, freq, decay) {
      if (o._shT == null) return 0;
      const e = (SD.Time ? SD.Time.anim : 0) - o._shT;
      if (e > 2) { o._shT = null; return 0; }
      return o._shA * o._shD * Math.sin(e * (freq || 22)) * Math.exp(-e * (decay || 4.5));
    },
    // 칸 중심 월드 좌표
    center(x, y) { return { x: x * TILE + 8, y: y * TILE + 8 }; },
  });

  // 작은 도우미: 스프라이트를 (밑동 x, 바닥 y) 기준으로 회전해 그린다
  function drawRot(g, img, bx, by, ox, oy, ang) {
    if (!ang) { g.drawImage(img, Math.round(bx - ox), Math.round(by - oy)); return; }
    g.save();
    g.translate(Math.round(bx), Math.round(by));
    g.rotate(ang);
    g.drawImage(img, -ox, -oy);
    g.restore();
  }
  SD.Obj.drawRot = drawRot;

  function tilePx(o) { return { px: o.x * TILE, py: o.y * TILE }; }
  const season = () => (SD.G ? SD.G.season : 0);
  const giveDrop = (loc, x, y, id, n, q) => SD.World.dropItem(loc, x, y, id, n, q);

  // ═════════════ 잡동사니: 돌 · 나뭇가지 · 잡초 ═════════════
  types.define('stone', {
    layer: 'object',
    draw(V, o) {
      const { px, py } = tilePx(o);
      const ang = Obj.shakeAngle(o, 40, 8) * 0.3;
      V.add(py + 15, (g) => g.drawImage(A.stoneObj(o.v || 0, V.season), Math.round(px + ang * 6), py));
    },
    shadow(o) { return [o.x * TILE + 8, o.y * TILE + 13, 12, 4]; },
    onTool(o, c) {
      if (c.tool !== 'pick') {
        if (c.tool !== 'can' && c.tool !== 'scythe') { Obj.shake(o, 0.3); SD.Sound.play('clink'); return true; }
        return false;
      }
      const cx = o.x * TILE + 8, cy = o.y * TILE + 10;
      c.loc.removeObj(o.x, o.y);
      SD.Sound.play('stoneCrack');
      SD.FX.debris(cx, cy, ['#b8b4aa', '#8e8a82', '#6a665e'], 10);
      SD.FX.dust(cx, cy + 2, 3);
      giveDrop(c.loc, cx, cy, 'stone', 1 + (Math.random() < 0.1 + SD.Skills.level('mining') * 0.01 ? 1 : 0));
      SD.Skills.addXP('mining', 1);
      SD.Mods.emit('objectBroken', o, c);
      return true;
    },
  });
  types.define('twig', {
    layer: 'object',
    draw(V, o) {
      const { px, py } = tilePx(o);
      V.add(py + 13, (g) => g.drawImage(A.twigObj(o.v || 0, V.season), px, py));
    },
    onTool(o, c) {
      if (c.tool !== 'axe') {
        if (c.tool === 'pick' || c.tool === 'hoe') { Obj.shake(o, 0.3); SD.Sound.play('axeMiss'); return true; }
        return false;
      }
      const cx = o.x * TILE + 8, cy = o.y * TILE + 10;
      c.loc.removeObj(o.x, o.y);
      SD.Sound.play('chop');
      SD.FX.debris(cx, cy, ['#c08a50', '#94643a', '#6e4626'], 8);
      giveDrop(c.loc, cx, cy, 'wood', 1 + (Math.random() < 0.3 ? 1 : 0));
      SD.Mods.emit('objectBroken', o, c);
      return true;
    },
  });
  types.define('weed', {
    layer: 'object',
    draw(V, o) {
      const { px, py } = tilePx(o);
      const ang = Obj.shakeAngle(o, 24, 5);
      V.add(py + 14, (g) => drawRot(g, A.weedObj(o.v || 0, V.season), px + 8, py + 15, 8, 15, ang));
    },
    onTouch(o) { Obj.shake(o, 0.12); },
    onTool(o, c) {
      if (c.tool === 'can') return false;
      const cx = o.x * TILE + 8, cy = o.y * TILE + 10;
      c.loc.removeObj(o.x, o.y);
      SD.Sound.play('weedCut');
      const cols = ['#6cbf45', '#468f32', '#a8e070'];
      SD.FX.leaves(cx, cy - 2, 7, season() === 2 ? ['#c8823a', '#e8b45a', '#a05a26'] : cols, { burst: true });
      if (Math.random() < 0.5) giveDrop(c.loc, cx, cy, 'fiber', 1);
      if (Math.random() < 0.01) giveDrop(c.loc, cx, cy, 'mixed_seeds', 1);
      SD.Mods.emit('objectBroken', o, c);
      return true;
    },
  });

  // ═════════════ 채집 똥 (바닥에 놓인 아이템) ═════════════
  types.define('forage', {
    layer: 'object',
    draw(V, o) {
      const { px, py } = tilePx(o);
      const icon = SD.Items.icon(o.id);
      V.add(py + 14, (g) => {
        g.drawImage(icon, px, py - 1);
        // 파리 한 마리 (똥이니까)
        const t = V.t + (o.x * 7 + o.y * 3);
        if (Math.floor(t * 0.7) % 3 !== 0) {
          const fx = px + 8 + Math.cos(t * 3.1) * 6, fy = py + 1 + Math.sin(t * 5.3) * 2;
          g.fillStyle = '#1b1b1b'; g.fillRect(Math.round(fx), Math.round(fy), 1, 1);
          if (Math.floor(t * 20) % 2) { g.fillStyle = 'rgba(230,240,255,0.85)'; g.fillRect(Math.round(fx), Math.round(fy) - 1, 1, 1); }
        }
      });
    },
    shadow(o) { return [o.x * TILE + 8, o.y * TILE + 14, 10, 3]; },
    onAction(o, c) {
      const q = SD.Farming.forageQuality();
      if (!SD.Inv.canAdd(o.id, 1, q)) { SD.UI.hud('가방이 꽉 찼어요!', { kind: 'error' }); SD.Sound.play('error'); return true; }
      c.loc.removeObj(o.x, o.y);
      SD.Sound.play('pickup');
      SD.Sound.play('harvestSmall');
      SD.FX.pop(o.x * TILE + 8, o.y * TILE + 8, o.id, q);
      SD.Inv.add(o.id, 1, q);
      SD.Skills.addXP('foraging', 7);
      SD.G.stats.foraged = (SD.G.stats.foraged || 0) + 1;
      SD.Player.anim('pickup');
      SD.Mods.emit('forage', o, c);
      return true;
    },
    onTool(o, c) {
      if (c.tool === 'scythe' || c.tool === 'hoe' || c.tool === 'pick' || c.tool === 'axe') {
        // 도구로 쳐도 채집된다 (원작처럼 떨어진다)
        c.loc.removeObj(o.x, o.y);
        giveDrop(c.loc, o.x * TILE + 8, o.y * TILE + 8, o.id, 1, SD.Farming.forageQuality());
        SD.Skills.addXP('foraging', 7);
        SD.Sound.play('harvestSmall');
        return true;
      }
      return false;
    },
  });

  // ═════════════ 풀 (섬유 / 건초) ═════════════
  // { t:'grass', n: 1~4 포기, v }
  const TUFT_POS = [[4, 6], [12, 7], [5, 13], [12, 14]];
  types.define('grass', {
    layer: 'feature',
    passable: true,
    draw(V, o) {
      const { px, py } = tilePx(o);
      const n = o.n || 4;
      const s = V.season;
      for (let i = 0; i < n; i++) {
        const [ox, oy] = TUFT_POS[i];
        const v = (o.v || 0) + i;
        const ang = Obj.shakeAngle(o, 18 + i * 2, 3.5) + Math.sin(V.t * 1.6 + o.x * 0.7 + i) * 0.04 * (V.windy ? 2.5 : 1);
        V.add(py + oy + 0.1, (g) => drawRot(g, A.grassTuft(s, v % 6), px + ox, py + oy + 1, 5, 13, ang));
      }
    },
    onTouch(o, loc, who) {
      if (!who || !who.moving) return;
      if (o._shT != null && SD.Time.anim - o._shT < 0.5) return;
      Obj.shake(o, 0.22, who.vx > 0 ? 1 : -1);
      if (Math.random() < 0.3) SD.Sound.play('grassCut', { minGap: 0.2 });
    },
    onTool(o, c) {
      if (c.tool === 'scythe' || c.weapon) {
        const cx = o.x * TILE + 8, cy = o.y * TILE + 10;
        c.loc.removeFeat(o.x, o.y);
        SD.FX.leaves(cx, cy, 5, SD.Art.LEAVES.oak[season()] ? [A.leafColor('oak', season()), '#a8e070'] : ['#a8c0d4', '#d8e8f0'], { burst: true, small: true });
        SD.Sound.play('grassCut');
        const handled = SD.Mods.first('grassCut', o, c);
        if (!handled && Math.random() < 0.1) giveDrop(c.loc, cx, cy, 'fiber', 1);
        return true;
      }
      if (c.tool === 'hoe') { c.loc.removeFeat(o.x, o.y); return false; } // 풀을 걷어내고 밭을 간다
      return false;
    },
    dayStart(o, loc, info) {
      if (info.season === 3) return undefined;
      // 원작처럼 풀이 퍼진다
      if (Math.random() < 0.08) {
        const d = U.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        const x = o.x + d[0], y = o.y + d[1];
        if (loc.isDiggable(x, y) && !loc.isOccupied(x, y) && loc.tileAt(x, y) === 'grass') loc.setFeat(x, y, { t: 'grass', n: 1 + Math.floor(Math.random() * 2), v: Math.floor(Math.random() * 6) });
      }
      if ((o.n || 4) < 4 && Math.random() < 0.3) o.n = (o.n || 1) + 1;
      return undefined;
    },
  });

  // ═════════════ 나무 ═════════════
  // { t:'tree', kind:'oak'|'maple'|'pine', stage:0~4, hp, stump:bool, hasSeed }
  SD.TREES = {
    oak: { name: '참나무', seed: 'acorn' },
    maple: { name: '단풍나무', seed: 'maple_seed' },
    pine: { name: '소나무', seed: 'pine_cone' },
  };
  const AXE_DMG = [1, 1.25, 1.67, 2.5, 5];
  SD.AXE_DMG = AXE_DMG;
  types.define('tree', {
    layer: 'feature',
    passable(o) { return !o.stump && o.stage <= 1; },
    draw(V, o, loc) {
      const { px, py } = tilePx(o);
      const bx = px + 8, by = py + 15;
      const s = V.season;
      const ang = Obj.shakeAngle(o, 20, 3.6);
      if (o.stump) {
        V.add(by, (g) => g.drawImage(A.stump(o.kind, s), px, py - 8));
        return;
      }
      if (o.stage === 0) { V.add(by - 4, (g) => g.drawImage(A.treeSeed(o.kind), px, py)); return; }
      if (o.stage < 4) {
        V.add(by, (g) => drawRot(g, A.youngTree(o.kind, o.stage, s), bx, py + 18, 16, 38, ang * 1.6));
        return;
      }
      // 다 자란 나무: 줄기 + 수관. 농부가 뒤에 있으면 수관이 반투명해진다
      const top = A.treeTop(o.kind, s, (o.x + o.y) % 2);
      const trunk = A.treeTrunk(o.kind, s);
      V.add(by, (g) => {
        g.drawImage(trunk, px, py - 22);
        const p = V.player;
        let alpha = 1;
        if (p && p.loc === loc.id) {
          const behind = p.y < by && p.y > by - 80 && Math.abs(p.x - bx) < 22;
          o._fade = U.lerp(o._fade == null ? 1 : o._fade, behind ? 0.42 : 1, 0.15);
          alpha = o._fade;
        }
        g.globalAlpha = alpha;
        drawRot(g, top, bx, py - 2, 24, 78, ang + Math.sin(V.t * 1.3 + o.x) * (V.windy ? 0.012 : 0.004));
        g.globalAlpha = 1;
      });
    },
    shadow(o) {
      if (o.stump) return [o.x * TILE + 8, o.y * TILE + 14, 14, 5];
      if (o.stage === 4) return [o.x * TILE + 8, o.y * TILE + 14, 36, 10, 0.22];
      if (o.stage >= 2) return [o.x * TILE + 8, o.y * TILE + 15, 14, 5];
      return null;
    },
    onAction(o, c) {
      if (o.stage === 4 && !o.stump) {
        Obj.shake(o, 0.12);
        SD.Sound.play('leaves');
        if (SD.G.season !== 3) SD.FX.leaves(o.x * TILE + 8, o.y * TILE - 40, 6, [A.leafColor(o.kind, SD.G.season)], { fall: true, spread: 20 });
        if (o.hasSeed && SD.G.season !== 3) {
          o.hasSeed = false;
          giveDrop(c.loc, o.x * TILE + 8 + (Math.random() - 0.5) * 16, o.y * TILE + 4, SD.TREES[o.kind].seed, 1);
        }
        SD.Mods.emit('treeShake', o, c);
        return true;
      }
      return false;
    },
    onTool(o, c) {
      const loc = c.loc;
      const cx = o.x * TILE + 8, cy = o.y * TILE + 8;
      if (c.tool === 'can') return false;
      if (o.stage <= 1 && !o.stump) {
        if (c.tool === 'scythe' || c.tool === 'hoe' || c.tool === 'axe' || c.tool === 'pick') {
          loc.removeFeat(o.x, o.y);
          SD.Sound.play('weedCut');
          SD.FX.leaves(cx, cy, 4, ['#6cbf45', '#a8e070'], { burst: true, small: true });
          if (o.stage === 0) giveDrop(loc, cx, cy, SD.TREES[o.kind].seed, 1);
          return true;
        }
        return false;
      }
      if (c.tool !== 'axe') {
        if (c.tool === 'pick' || c.tool === 'hoe') { Obj.shake(o, 0.08); SD.Sound.play('axeMiss'); return true; }
        return false;
      }
      Obj.shake(o, o.stump ? 0.06 : 0.1, c.dir === 'left' ? -1 : 1);
      SD.Sound.play('chop');
      SD.FX.debris(cx + (c.dir === 'left' ? 4 : c.dir === 'right' ? -4 : 0), cy + 2, ['#c8945a', '#a8703e', '#e8c08a'], 5, { small: true });
      if (o.stage === 4 && !o.stump && SD.G.season !== 3) SD.FX.leaves(cx, cy - 44, 4, [A.leafColor(o.kind, SD.G.season)], { fall: true, spread: 22 });
      const dmg = AXE_DMG[c.lvl || 0];
      o.hp = (o.hp == null ? (o.stage === 4 ? 10 : o.stump ? 5 : 2) : o.hp) - dmg;
      if (o.hp > 0) return true;
      if (o.stage < 4 && !o.stump) {
        loc.removeFeat(o.x, o.y);
        SD.Sound.play('treeCrack');
        giveDrop(loc, cx, cy, 'wood', o.stage === 3 ? 4 : 2);
        SD.Skills.addXP('foraging', o.stage);
        return true;
      }
      if (!o.stump) {
        // 쓰러진다! 농부 반대쪽으로
        const fallDir = c.dir === 'left' ? -1 : c.dir === 'right' ? 1 : (c.p.x < cx ? 1 : -1);
        o.stump = true;
        o.hp = 5;
        SD.Sound.play('treeCrack');
        loc.temp.push({ kind: 'fallingTree', x: o.x, y: o.y, tree: o.kind, season: SD.G.season, dir: fallDir, t: 0, v: (o.x + o.y) % 2 });
        SD.Skills.addXP('foraging', 12);
        SD.G.stats.treesFelled = (SD.G.stats.treesFelled || 0) + 1;
        SD.Mods.emit('treeFelled', o, c);
        return true;
      }
      // 그루터기 제거
      loc.removeFeat(o.x, o.y);
      SD.Sound.play('treeCrack');
      SD.FX.debris(cx, cy, ['#c8945a', '#a8703e', '#e8c08a', '#6e4424'], 12);
      giveDrop(loc, cx, cy, 'wood', 4 + Math.floor(Math.random() * 2));
      SD.Skills.addXP('foraging', 1);
      return true;
    },
    dayStart(o, loc, info) {
      if (o.stump) return undefined;
      if (o.stage < 4 && info.season !== 3) {
        // 주변에 다 자란 나무가 붙어 있으면 자라지 않는다 (원작)
        let blocked = false;
        if (o.stage === 3) {
          for (let dy = -1; dy <= 1 && !blocked; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const f = loc.featAt(o.x + dx, o.y + dy);
            if (f && f.t === 'tree' && f.stage === 4 && !f.stump) { blocked = true; break; }
          }
        }
        if (!blocked && Math.random() < 0.2) { o.stage++; o.hp = undefined; }
      }
      if (o.stage === 4) {
        if (Math.random() < 0.3) o.hasSeed = true;
        // 씨앗 퍼뜨리기
        if (info.season !== 3 && Math.random() < 0.12) {
          const x = o.x + U.randInt(-3, 3), y = o.y + U.randInt(-3, 3);
          if (loc.isDiggable(x, y) && !loc.isOccupied(x, y, { ignoreGrass: true }) && !(x === o.x && y === o.y)) {
            loc.removeFeat(x, y);
            loc.setFeat(x, y, { t: 'tree', kind: o.kind, stage: 0 });
          }
        }
      }
      return undefined;
    },
  });

  // ═════════════ 큰 덩어리 (2×2): 큰 그루터기 · 통나무 · 바위 ═════════════
  const CLUMP = {
    stump: { name: '큰 그루터기', tool: 'axe', lvl: 1, hp: 10, drop: ['hardwood', 2], xp: ['foraging', 25], sound: 'chop', need: '구리 도끼 이상이 필요해요.', colors: ['#c8945a', '#a8703e', '#6e4424'] },
    log: { name: '큰 통나무', tool: 'axe', lvl: 2, hp: 20, drop: ['hardwood', 8], xp: ['foraging', 25], sound: 'chop', need: '강철 도끼 이상이 필요해요.', colors: ['#c8945a', '#a8703e', '#6e4424'] },
    boulder: { name: '큰 바위', tool: 'pick', lvl: 2, hp: 10, drop: ['stone', 15], xp: ['mining', 15], sound: 'stoneHit', need: '강철 곡괭이 이상이 필요해요.', colors: ['#b8b4aa', '#8e8a82', '#6a665e'] },
  };
  SD.CLUMPS = CLUMP;
  types.define('clump', {
    layer: 'large', w: 2, h: 2,
    draw(V, o) {
      const px = o.x * TILE, py = o.y * TILE;
      const img = o.kind === 'log' ? A.bigLog(V.season) : o.kind === 'boulder' ? A.boulder(V.season) : A.bigStump(V.season);
      const sh = Obj.shakeAngle(o, 40, 7);
      V.add(py + 31, (g) => g.drawImage(img, Math.round(px + sh * 8), py));
    },
    shadow(o) { return [o.x * TILE + 16, o.y * TILE + 29, 28, 7]; },
    onTool(o, c) {
      const def = CLUMP[o.kind];
      if (c.tool === 'can' || c.tool === 'scythe') return false;
      Obj.shake(o, 0.25);
      if (c.tool !== def.tool) { SD.Sound.play(def.tool === 'axe' ? 'axeMiss' : 'clink'); return true; }
      if ((c.lvl || 0) < def.lvl) {
        SD.Sound.play(def.tool === 'axe' ? 'axeMiss' : 'clink');
        SD.UI.hud(def.need, { kind: 'error' });
        return true;
      }
      const cx = o.x * TILE + 16, cy = o.y * TILE + 18;
      SD.Sound.play(def.sound);
      SD.FX.debris(cx, cy, def.colors, 5, { small: true });
      o.hp = (o.hp == null ? def.hp : o.hp) - Math.max(1, ((c.lvl || 0) + 1) * 0.75 * (def.tool === 'axe' ? 1 : 1.2));
      if (o.hp > 0) return true;
      c.loc.removeLarge(o);
      SD.Sound.play(def.tool === 'axe' ? 'treeCrack' : 'boulderCrack');
      SD.FX.debris(cx, cy, def.colors, 18);
      SD.FX.dust(cx, cy + 6, 6);
      SD.FX.shake(3, 0.3);
      giveDrop(c.loc, cx, cy, def.drop[0], def.drop[1]);
      SD.Skills.addXP(def.xp[0], def.xp[1]);
      SD.Mods.emit('clumpBroken', o, c);
      return true;
    },
  });

  // ═════════════ 덤불 ═════════════
  // { t:'bush', size: 1(1×1) | 2(2×2) }
  function berrySeason() {
    const G = SD.G;
    if (!G) return null;
    if (G.season === 0 && G.day >= 15 && G.day <= 18) return 'spring';
    if (G.season === 2 && G.day >= 8 && G.day <= 11) return 'fall';
    return null;
  }
  types.define('bush', {
    layer: 'large',
    draw(V, o) {
      const size = o.size || 2;
      const px = o.x * TILE, py = o.y * TILE;
      const berries = !o.picked ? berrySeason() : null;
      const img = A.bush(size, V.season, berries);
      const ang = Obj.shakeAngle(o, 22, 4);
      const bw = size === 1 ? 16 : 32;
      const bottom = py + (size === 1 ? 16 : 32);
      V.add(bottom - 1, (g) => drawRot(g, img, px + bw / 2, bottom, bw / 2, img.height, ang * 0.5));
    },
    shadow(o) { const s = o.size || 2; return s === 1 ? [o.x * TILE + 8, o.y * TILE + 14, 14, 4] : [o.x * TILE + 16, o.y * TILE + 29, 30, 7]; },
    onTouch(o) { Obj.shake(o, 0.08); },
    onAction(o, c) {
      Obj.shake(o, 0.18);
      SD.Sound.play('bush');
      const bs = berrySeason();
      if (bs && !o.picked) {
        o.picked = true;
        const id = bs === 'spring' ? 'salmonberry' : 'blackberry';
        const n = 2 + Math.floor(Math.random() * 2) + Math.floor(SD.Skills.level('foraging') / 4);
        for (let i = 0; i < n; i++) giveDrop(c.loc, o.x * TILE + 8 + Math.random() * 16, o.y * TILE + 10, id, 1);
        SD.Skills.addXP('foraging', 1);
      } else {
        SD.FX.leaves(o.x * TILE + 12, o.y * TILE + 8, 3, [A.leafColor('oak', SD.G.season)], { burst: true, small: true });
      }
      return true;
    },
    onTool(o, c) {
      if (c.tool === 'can') return false;
      Obj.shake(o, 0.2);
      SD.Sound.play('bush');
      if (c.tool === 'axe' && (o.size || 2) === 1) {
        o.hp = (o.hp == null ? 3 : o.hp) - AXE_DMG[c.lvl || 0];
        if (o.hp <= 0) {
          c.loc.removeLarge(o);
          SD.FX.leaves(o.x * TILE + 8, o.y * TILE + 6, 10, [A.leafColor('oak', SD.G.season)], { burst: true });
          giveDrop(c.loc, o.x * TILE + 8, o.y * TILE + 8, 'wood', 1);
        }
      }
      return true;
    },
    dayStart(o, loc, info) { if (info.day === 1 || (info.season === 0 && info.day === 15) || (info.season === 2 && info.day === 8)) o.picked = false; return undefined; },
  });

  // ═════════════ 장식 나무 (숲 가장자리, 저장 안 함) ═════════════
  types.define('decorTree', {
    layer: 'large', w: 1, h: 1, save: false,
    passable: false,
    draw(V, o, loc) {
      const px = o.x * TILE + (o.ox || 0), py = o.y * TILE + (o.oy || 0);
      const s = V.season;
      const top = A.treeTop(o.kind, s, o.v || 0);
      const trunk = A.treeTrunk(o.kind, s);
      V.add(py + 15, (g) => {
        g.drawImage(trunk, px, py - 22);
        const p = V.player;
        let a = 1;
        if (p && p.loc === loc.id && p.y < py + 15 && p.y > py - 64 && Math.abs(p.x - px - 8) < 22) a = 0.5;
        o._fade = U.lerp(o._fade == null ? 1 : o._fade, a, 0.15);
        g.globalAlpha = o._fade;
        g.drawImage(top, px + 8 - 24, py - 2 - 78 + Math.round(Math.sin(V.t * 0.9 + o.x) * (V.windy ? 1 : 0)));
        g.globalAlpha = 1;
      });
    },
    shadow(o) { return [o.x * TILE + 8 + (o.ox || 0), o.y * TILE + 14 + (o.oy || 0), 34, 9, 0.2]; },
  });

  // ═════════════ 농가 · 출하함 ═════════════
  types.define('farmhouse', {
    layer: 'large', w: 9, h: 7, save: false,
    // 스프라이트는 0~5행, 현관 데크는 6행 (지나갈 수 있음). 벽 3~5행, 문 (4, 5)
    blocks(o, tx, ty) {
      if (ty < o.y + 3 || ty > o.y + 5) return false;
      if (ty === o.y + 5 && tx === o.x + 4) return false; // 문
      return true;
    },
    drawDecal(V, o) {
      V.ctx.drawImage(A.porch(V.season), o.x * TILE, (o.y + 6) * TILE - 8);
    },
    draw(V, o) {
      const px = o.x * TILE, py = o.y * TILE;
      V.add((o.y + 6) * TILE - 1, (g) => {
        g.drawImage(A.farmhouse(V.season), px, py);
        // 밤에는 창문이 노랗게 빛난다
        const glow = SD.Render ? SD.Render.windowGlow() : 0;
        if (glow > 0) {
          g.globalAlpha = glow;
          for (const [x, y, w, h] of A.FARMHOUSE_WINDOWS) {
            g.fillStyle = '#ffd77a'; g.fillRect(px + x, py + y, w, h);
            g.fillStyle = '#fff2c0'; g.fillRect(px + x + 1, py + y + 1, w / 2 - 2, h / 2 - 2);
            g.fillStyle = '#c8903a'; g.fillRect(px + x + w / 2 - 1, py + y, 2, h); g.fillRect(px + x, py + y + h / 2 - 1, w, 2);
          }
          g.globalAlpha = 1;
        }
      });
      // 굴뚝 연기
      if (Math.random() < 0.02 && SD.FX) SD.FX.smoke(px + A.FARMHOUSE_CHIMNEY[0] + 3, py + A.FARMHOUSE_CHIMNEY[1]);
    },
    shadow(o) { return [o.x * TILE + 72, (o.y + 6) * TILE - 2, 140, 8, 0.2]; },
    light(o, loc, add) {
      const glow = SD.Render ? SD.Render.windowGlow() : 0;
      if (glow <= 0) return;
      for (const [x, y, w, h] of A.FARMHOUSE_WINDOWS) {
        add({ x: o.x * TILE + x + w / 2, y: o.y * TILE + y + h / 2, r: 28, color: '#ffc870', a: 0.9 * glow });
        add({ x: o.x * TILE + x + w / 2, y: o.y * TILE + y + h + 26, r: 34, color: '#ffb850', a: 0.55 * glow });
      }
    },
  });
  types.define('shippingBin', {
    layer: 'large', w: 2, h: 1, save: false,
    draw(V, o) {
      const px = o.x * TILE, py = o.y * TILE;
      const open = SD.Farming.binOpen(o);
      V.add(py + 15, (g) => {
        g.drawImage(A.shippingBin(V.season), px, py - 8);
        const lid = A.binLid(V.season);
        if (open > 0.05) {
          // 뚜껑이 뒤로 젖혀진다
          const hgt = Math.max(2, Math.round(8 * (1 - open)));
          g.drawImage(lid, 0, 0, 34, 8, px - 1, py - 10 - hgt + 2, 34, hgt);
          g.fillStyle = '#2a1608'; g.fillRect(px + 2, py - 5, 28, 3);
        } else g.drawImage(lid, px - 1, py - 12);
      });
    },
    shadow(o) { return [o.x * TILE + 16, o.y * TILE + 15, 30, 5]; },
    onAction(o, c) { return SD.Farming.shipHeld(o, c); },
  });

  // ═════════════ 실내 가구 ═════════════
  // 기본 가구 타입 생성기: sprite, 바닥 기준 오프셋, 막힘 영역, 행동 훅 이름
  function furniture(id, d) {
    types.define(id, Object.assign({
      layer: 'large', save: false,
      draw(V, o) {
        const img = d.sprite(o, V);
        const px = o.x * TILE + (d.ox || 0), bottom = (o.y + (d.h || 1)) * TILE + (d.oy || 0);
        if (d.decal) return;
        V.add((o.y + (d.sortRow == null ? d.h || 1 : d.sortRow)) * TILE - 1, (g) => g.drawImage(img, px, bottom - img.height));
      },
    }, d));
  }
  furniture('bed', {
    w: 2, h: 3, sprite: () => A.bed(),
    blocks(o, tx, ty) { return ty === o.y; },
    onAction(o, c) { SD.Day.askSleep(); return true; },
    onTouch(o, loc, who) { if (who && who.isPlayer && who.y > o.y * TILE + 16 && who.y < (o.y + 3) * TILE && !SD.Day._askedRecently()) SD.Day.askSleep(); },
    passable: true,
  });
  furniture('tv', {
    w: 2, h: 2, sprite: () => A.tv(SD.G && SD.G._tvOn),
    onAction(o, c) {
      if (SD.Mods.first('tv', o, c)) return true;
      SD.Sound.play('tick');
      SD.UI.say('TV를 켰다... 지지직. 아직 나오는 채널이 없다.');
      return true;
    },
  });
  furniture('kitchen', {
    w: 3, h: 2, sprite: () => A.kitchen(),
    onAction(o, c) {
      if (SD.Mods.first('kitchen', o, c)) return true;
      SD.UI.say('냉장고에서 시원한 바람이 나온다. 아직 요리할 줄은 모른다.');
      return true;
    },
  });
  furniture('fireplace', {
    w: 2, h: 2, sprite: () => A.fireplace(),
    draw(V, o) {
      const px = o.x * TILE, bottom = (o.y + 2) * TILE;
      V.add(bottom - 1, (g) => {
        g.drawImage(A.fireplace(), px, bottom - 36);
        // 불꽃 (반복 애니메이션)
        if (o.lit !== false) {
          const t = V.t;
          for (let i = 0; i < 6; i++) {
            const fx = px + 10 + i * 2;
            const h = 4 + Math.round(3 * Math.abs(Math.sin(t * 7 + i * 1.7)));
            g.fillStyle = '#e8481e'; g.fillRect(fx, bottom - 7 - h, 2, h);
            g.fillStyle = '#ffb02a'; g.fillRect(fx, bottom - 7 - h + 2, 2, Math.max(1, h - 3));
            if (i % 2) { g.fillStyle = '#fff2a0'; g.fillRect(fx, bottom - 8, 2, 1); }
          }
        }
      });
    },
    light(o, loc, add) { if (o.lit !== false) add({ x: o.x * TILE + 16, y: (o.y + 2) * TILE - 6, r: 72, color: '#ff9a40', a: 0.95, flicker: 0.12 }); },
  });
  furniture('table', { w: 2, h: 2, sprite: () => A.table(), sortRow: 2 });
  furniture('lamp', {
    w: 1, h: 1, sprite: () => A.lamp(),
    light(o, loc, add) { add({ x: o.x * TILE + 8, y: o.y * TILE - 6, r: 56, color: '#ffd890', a: 0.8 }); },
  });
  furniture('rug', {
    w: 3, h: 2, passable: true, blocks: () => false, decal: true, sprite: () => A.rug(),
    drawDecal(V, o) { V.ctx.drawImage(A.rug(), o.x * TILE, o.y * TILE); },
  });
  // 벽에 붙은 창문: 바깥 시간에 따라 하늘색이 바뀐다
  furniture('window', {
    w: 2, h: 1, passable: true, blocks: () => false, decal: true, sprite: () => A.interiorWindow('#8fd0f5'),
    drawDecal(V, o) { V.ctx.drawImage(A.interiorWindow(SD.Render.skyColor()), o.x * TILE, o.y * TILE - 4); },
    light(o, loc, add) {
      const day = SD.Render ? 1 - SD.Render.nightAmount() : 1;
      if (day > 0.05) add({ x: o.x * TILE + 16, y: o.y * TILE + 30, r: 46, color: '#fff4d8', a: 0.55 * day });
    },
  });

  // ═════════════ 임시 스프라이트 (쓰러지는 나무 등) ═════════════
  // loc.temp 항목 { kind, ... } — 모듈이 SD.Temp.define(kind, {update, draw}) 로 추가
  const tempTypes = SD.makeRegistry('temp');
  SD.Temp = tempTypes;
  tempTypes.define('fallingTree', {
    // 원작처럼: 천천히 기울다 가속하며 90° 회전 → 쿵 + 화면 흔들림 + 잎/나무 파편
    update(e, dt, loc) {
      e.t += dt;
      if (!e.landed && e.t >= 1.1) {
        e.landed = true;
        const cx = e.x * TILE + 8 + e.dir * 40, cy = e.y * TILE + 4;
        SD.Sound.play('treeFall');
        SD.FX.shake(4, 0.45);
        SD.FX.dust(cx, cy + 6, 10);
        if (e.season !== 3) SD.FX.leaves(cx, cy - 8, 26, [A.leafColor(e.tree, e.season), X.light(A.leafColor(e.tree, e.season), 0.3)], { burst: true, spread: 40 });
        SD.FX.debris(cx, cy, ['#c8945a', '#a8703e', '#6e4424'], 10);
        const n = 12 + Math.floor(SD.Skills.level('foraging') / 2) + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < 6; i++) SD.World.dropItem(loc, e.x * TILE + 8 + e.dir * (14 + i * 9), cy, 'wood', Math.ceil(n / 6), 0, { parts: 1 });
        if (Math.random() < 0.6) SD.World.dropItem(loc, cx, cy, 'sap', 1 + Math.floor(Math.random() * 3));
        if (Math.random() < 0.5) SD.World.dropItem(loc, cx, cy, SD.TREES[e.tree].seed, 1);
        if (Math.random() < 0.05 + SD.Skills.level('foraging') * 0.01) SD.World.dropItem(loc, cx, cy, 'hardwood', 1);
      }
      return e.t < 1.25;
    },
    draw(V, e) {
      if (e.landed) return;
      const px = e.x * TILE + 8, py = e.y * TILE - 2;
      const k = Math.min(1, e.t / 1.1);
      const ang = e.dir * (Math.PI / 2) * k * k * k;
      const top = A.treeTop(e.tree, e.season, e.v);
      V.add(e.y * TILE + 15.5, (g) => {
        g.globalAlpha = 1 - Math.max(0, k - 0.9) * 8;
        drawRot(g, top, px, py, 24, 78, ang);
        g.globalAlpha = 1;
      });
    },
  });

  // ═════════════ 캐릭터 레지스트리 ═════════════
  // loc.chars 의 항목 { t, x, y, dir, ... } — 모듈이 SD.Chars.define(t, {...}) 로 행동을 준다
  //  def: update(c, dt, loc), draw(V, c, loc), box: [w, h] (발 기준 충돌), onAction(c, ctx),
  //       save: false 면 저장 안 함, serialize(c) / deserialize(data)
  const charTypes = SD.makeRegistry('chars');
  SD.Chars = {
    reg: charTypes,
    define: (t, def) => charTypes.define(t, def),
    get: (t) => charTypes.get(t),
    add(loc, c) { if (!c.box && charTypes.get(c.t) && charTypes.get(c.t).box) c.box = charTypes.get(c.t).box; loc.chars.push(c); return c; },
    remove(loc, c) { const i = loc.chars.indexOf(c); if (i >= 0) loc.chars.splice(i, 1); },
    box(c) { const [w, h] = c.box || [10, 6]; return [c.x - w / 2, c.y - h, c.x + w / 2, c.y]; },
    saveable(c) { const d = charTypes.get(c.t); return !d || d.save !== false; },
    serialize(c) {
      const d = charTypes.get(c.t);
      if (d && d.serialize) return d.serialize(c);
      const o = {};
      for (const k of Object.keys(c)) if (k[0] !== '_') o[k] = c[k];
      return o;
    },
    deserialize(data, loc) {
      const d = charTypes.get(data.t);
      if (!d) return null;
      return d.deserialize ? d.deserialize(data, loc) : Object.assign({}, data);
    },
    at(loc, tx, ty) {
      for (const c of loc.chars) {
        if (Math.floor(c.x / TILE) === tx && Math.floor((c.y - 2) / TILE) === ty) return c;
      }
      return null;
    },
    near(loc, x, y, r) {
      let best = null, bd = r || 20;
      for (const c of loc.chars) { const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } }
      return best;
    },
    // 공용 이동 도우미: 충돌을 고려해 (dx, dy) 만큼 움직인다
    move(c, loc, dx, dy) {
      const [w, h] = c.box || [10, 6];
      let moved = false;
      if (dx && !loc.rectBlocked(c.x + dx - w / 2, c.y - h, c.x + dx + w / 2, c.y, c)) { c.x += dx; moved = true; }
      if (dy && !loc.rectBlocked(c.x - w / 2, c.y + dy - h, c.x + w / 2, c.y + dy, c)) { c.y += dy; moved = true; }
      return moved;
    },
  };

  // ═════════════ 바닥 아이템 (튕기며 흩어지고 자석처럼 빨려온다) ═════════════
  SD.Drops = {
    MAGNET: 40,     // 끌려오기 시작하는 거리(px). 원작은 기본 128/4=32px + 여유
    update(loc, dt) {
      const p = SD.G.player;
      const here = p.loc === loc.id;
      const items = loc.items;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.t += dt;
        // 튕김
        if (it.bounces < 3) {
          it.vz -= 340 * dt;
          it.z += it.vz * dt;
          it.x += it.vx * dt;
          it.y += it.vy * dt;
          if (it.z <= 0) {
            it.z = 0;
            it.bounces++;
            it.vz = -it.vz * 0.42;
            it.vx *= 0.55; it.vy *= 0.55;
            if (it.bounces >= 3 || Math.abs(it.vz) < 12) { it.bounces = 3; it.vz = 0; it.vx = 0; it.vy = 0; }
          }
          // 벽에 박히지 않게
          const tx = Math.floor(it.x / TILE), ty = Math.floor(it.y / TILE);
          if (loc.tileProp(tx, ty, 'solid') && !loc.isWater(tx, ty)) { it.vx = -it.vx; it.vy = -it.vy; }
        }
        if (!here) continue;
        if (it.noMagnet > 0) { it.noMagnet -= dt; continue; }
        const dx = p.x - it.x, dy = (p.y - 8) - it.y;
        const d = Math.hypot(dx, dy);
        const reach = SD.Mods.reduce('magnetRadius', SD.Drops.MAGNET);
        if (!it.magnet && d < reach) {
          if (SD.Inv.canAdd(it.id, it.n, it.q, it.extra)) { it.magnet = true; it.mv = 30; }
          else if (!it._fullWarned && d < 18) { it._fullWarned = true; SD.UI.hud('가방이 꽉 찼어요!', { kind: 'error' }); }
        }
        if (it.magnet) {
          it.mv = Math.min(320, it.mv + 900 * dt); // 가속
          const step = it.mv * dt;
          if (d <= step + 4) {
            const left = SD.Inv.add(it.id, it.n, it.q, it.extra);
            if (left > 0) { it.n = left; it.magnet = false; it.noMagnet = 1; continue; }
            items.splice(i, 1);
            SD.Sound.play('pickup');
            continue;
          }
          it.x += (dx / d) * step;
          it.y += (dy / d) * step;
          it.z = U.lerp(it.z, 6, 0.2);
        }
      }
    },
    draw(V, loc) {
      for (const it of loc.items) {
        const icon = SD.Items.icon(it);
        const bob = it.bounces >= 3 && !it.magnet ? Math.round(Math.sin(V.t * 3 + it.x) * 1) : 0;
        const z = it.z + bob + 1;
        V.add(it.y + 2, (g) => {
          X.shadow(g, it.x, it.y + 2, 10, 3, 0.25);
          g.drawImage(icon, Math.round(it.x - 8), Math.round(it.y - 12 - z));
        });
      }
    },
  };
})();
