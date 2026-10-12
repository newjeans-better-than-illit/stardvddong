'use strict';
// ───────────────────────── 게임 진행: 입력, 농사, 하루 순환 ─────────────────────────

const input = {
  keys: new Set(),
  use: false, usePressed: false,
  act: false, actPressed: false,
  touchDir: { up: false, down: false, left: false, right: false },
  mouse: { x: 0, y: 0, active: false },
};

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const MOVE_KEYS = {
  arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
};
const SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

const Game = {
  running: false,
  busy: false,
  invDirty: true,
  t: 0,
  useCooldown: 0,

  // ── 시작 / 타이틀 ──
  showTitle() {
    this.running = false;
    $('title').hidden = false;
    for (const id of ['hud', 'hotbar', 'energy']) $(id).hidden = true;
    $('btnContinue').hidden = !loadSaved();
  },

  begin(state) {
    G = state;
    G.timeAcc = 0;
    G._binOpen = 0;
    Object.assign(G.player, { moving: false, walkT: 0, swing: 0, swingMax: 0.28, swingTool: null });
    $('title').hidden = true;
    for (const id of ['hud', 'hotbar', 'energy']) $(id).hidden = false;
    UI.hudCache = {};
    this.invDirty = true;
    this.running = true;
    R.weatherFx.length = 0;
    if (!G.flags.intro) {
      UI.letter(() => {
        G.flags.intro = true;
        UI.toast('1번 괭이로 풀밭을 갈고, 6번 씨앗을 심어보세요.');
        setTimeout(() => UI.toast('2번 물뿌리개로 물을 주면 밤사이 똥이 자라요.'), 1800);
      });
    } else {
      UI.toast(`${dateText(G)} · 오늘 날씨: ${weatherName(G.weather)}`);
    }
  },

  newGame() {
    this.begin(newGameState((Math.random() * 2 ** 31) | 0));
  },

  continueGame() {
    const s = loadSaved();
    if (s) this.begin(s);
    else this.newGame();
  },

  toTitle() {
    this.showTitle();
  },

  toggleSound() {
    Sound.muted = !Sound.muted;
    try { localStorage.setItem('stardew-ddong-muted', Sound.muted ? '1' : '0'); } catch (e) { /* 무시 */ }
    UI.renderSoundBtn();
    UI.toast(Sound.muted ? '소리를 껐어요.' : '소리를 켰어요.');
  },

  // ── 목표 칸 ──
  playerTile() {
    const p = G.player;
    return [Math.floor(p.x / TILE), Math.floor((p.y - 3) / TILE)];
  },

  target() {
    const [px, py] = this.playerTile();
    if (input.mouse.active) {
      const w = screenToWorld(input.mouse.x, input.mouse.y);
      const mx = Math.floor(w.x / TILE), my = Math.floor(w.y / TILE);
      if (Math.abs(mx - px) <= 1 && Math.abs(my - py) <= 1 && !(mx === px && my === py)) return { x: mx, y: my, ok: true };
    }
    const [dx, dy] = DIRS[G.player.dir];
    return { x: px + dx, y: py + dy, ok: true };
  },

  faceToward(tx, ty) {
    const [px, py] = this.playerTile();
    const dx = tx - px, dy = ty - py;
    if (dx === 0 && dy === 0) return;
    if (Math.abs(dx) > Math.abs(dy)) G.player.dir = dx < 0 ? 'left' : 'right';
    else if (dy !== 0) G.player.dir = dy < 0 ? 'up' : 'down';
  },

  // ── 매 프레임 ──
  update(dt) {
    const p = G.player;
    if (G._binOpen > 0) G._binOpen -= dt;
    if (this.useCooldown > 0) this.useCooldown -= dt;

    // 시간
    G.timeAcc += dt;
    while (G.timeAcc >= SECONDS_PER_TICK) {
      G.timeAcc -= SECONDS_PER_TICK;
      G.time += MINUTES_PER_TICK;
      if (G.time === 24 * 60) UI.toast('자정이 됐어요. 새벽 2시 전에는 자야 해요!', 'bad');
      if (G.time >= DAY_END) { this.sleep(true); return; }
    }

    if (p.swing > 0) {
      p.swing -= dt;
    } else {
      let mx = 0, my = 0;
      const k = input.keys, td = input.touchDir;
      if (k.has('up') || td.up) my -= 1;
      if (k.has('down') || td.down) my += 1;
      if (k.has('left') || td.left) mx -= 1;
      if (k.has('right') || td.right) mx += 1;
      p.moving = mx !== 0 || my !== 0;
      if (p.moving) {
        if (mx !== 0 && my === 0) p.dir = mx < 0 ? 'left' : 'right';
        else if (my !== 0 && mx === 0) p.dir = my < 0 ? 'up' : 'down';
        else if (!((p.dir === 'left' && mx < 0) || (p.dir === 'right' && mx > 0) || (p.dir === 'up' && my < 0) || (p.dir === 'down' && my > 0))) p.dir = my < 0 ? 'up' : 'down';
        const len = Math.hypot(mx, my);
        const speed = (G.energy <= 0 ? 48 : 78) * dt;
        const nx = p.x + (mx / len) * speed;
        const ny = p.y + (my / len) * speed;
        if (!collides(nx, p.y)) p.x = nx;
        if (!collides(p.x, ny)) p.y = ny;
        p.walkT += dt;
        if (input.mouse.active) input.mouse.active = false;
      }
    }

    if ((input.usePressed || input.use) && p.swing <= 0 && this.useCooldown <= 0) this.useHeld();
    if (input.actPressed) this.act();
    input.usePressed = false;
    input.actPressed = false;

    if (this.invDirty) { UI.renderHotbar(); this.invDirty = false; }
  },

  // ── 도구 쓰기 ──
  useHeld() {
    const it = G.inv[G.sel];
    const tg = this.target();
    this.faceToward(tg.x, tg.y);
    if (!it) { this.useCooldown = 0.25; this.act(); return; }
    const def = ITEMS[it.id];
    if (def.kind === 'tool') this.useTool(it.id, tg.x, tg.y);
    else if (def.kind === 'seed') { this.plant(it, tg.x, tg.y); this.useCooldown = 0.12; }
    else if (def.kind === 'place') { this.place(it, tg.x, tg.y); this.useCooldown = 0.25; }
    else if (def.kind === 'food') { this.eat(); this.useCooldown = 0.6; }
    else { this.act(); this.useCooldown = 0.3; }
  },

  swing(tool) {
    const p = G.player;
    p.swingTool = tool;
    p.swingMax = 0.28;
    p.swing = 0.28;
  },

  spend(tool) {
    const cost = TOOL_ENERGY[tool] || 0;
    if (cost && G.energy < cost) {
      UI.toast('너무 지쳤어요… 쿠키를 먹거나 잠을 자요.', 'bad');
      Sound.play('error');
      return false;
    }
    G.energy = Math.max(0, G.energy - cost);
    return true;
  },

  useTool(tool, tx, ty) {
    const k = key(tx, ty);
    const cx = tx * TILE + 8, cy = ty * TILE + 10;
    const obj = inMap(tx, ty) ? G.obj.get(k) : null;
    const soil = inMap(tx, ty) ? G.soil.get(k) : null;
    this.swing(tool);
    if (tool === 'hoe') {
      if (isTillable(tx, ty)) {
        if (!this.spend('hoe')) return;
        G.soil.set(k, { wet: G.weather === 'rain', crop: null });
        burst(cx, cy, ['#8f5d34', '#a8713f', '#5c3a1f'], 8);
        Sound.play('hoe');
      } else if (obj && obj.type !== 'sprinkler') {
        UI.toast(obj.type === 'weed' ? '잡초는 낫(3번)으로 베요.' : obj.type === 'stone' ? '돌은 곡괭이(4번)로 깨요.' : '나무는 도끼(5번)로 베요.');
        Sound.play('swish');
      } else Sound.play('swish');
    } else if (tool === 'can') {
      if (inMap(tx, ty) && W.ground[k] === GROUND.WATER) {
        G.water = CAN_CAPACITY[G.canLevel];
        burst(cx, cy, ['#9fd2f5', '#3f8fd0'], 10);
        Sound.play('refill');
        UI.toast('물뿌리개를 가득 채웠어요.', 'good');
        this.invDirty = true;
      } else if (soil) {
        if (G.water <= 0) { UI.toast('물뿌리개가 비었어요. 연못에서 채워요.', 'bad'); Sound.play('error'); return; }
        if (!this.spend('can')) return;
        G.water--;
        soil.wet = true;
        burst(cx, cy - 4, ['#9fd2f5', '#cdeaff', '#3f8fd0'], 9, 0.6);
        Sound.play('water');
        this.invDirty = true;
      } else {
        if (G.water > 0) burst(cx, cy - 4, ['#9fd2f5', '#cdeaff'], 4, 0.5);
        Sound.play('swish');
      }
    } else if (tool === 'scythe') {
      Sound.play('swish');
      if (obj && obj.type === 'weed') {
        G.obj.delete(k);
        burst(cx, cy, ['#5fae3e', '#3f8a2a', '#8fd65f'], 10);
      } else if (soil && soil.crop) {
        if (soil.crop.dead) this.clearDead(soil, cx, cy);
        else if (cropStage(soil.crop) === 4) this.harvest(soil, tx, ty);
      }
    } else if (tool === 'pick') {
      if (obj && obj.type === 'stone') {
        if (!this.spend('pick')) return;
        G.obj.delete(k);
        addItem('stone', 1);
        this.invDirty = true;
        burst(cx, cy, ['#9b9b94', '#d2d2ca', '#6f6f69'], 10);
        Sound.play('clink');
        R.shake = 2;
      } else if (obj && obj.type === 'sprinkler') {
        if (!hasRoomFor('sprinkler')) { UI.toast('가방이 꽉 찼어요!', 'bad'); return; }
        G.obj.delete(k);
        addItem('sprinkler', 1);
        this.invDirty = true;
        Sound.play('clink');
      } else if (soil && (!soil.crop || soil.crop.dead)) {
        if (!this.spend('pick')) return;
        G.soil.delete(k);
        burst(cx, cy, ['#8f5d34', '#6cbf45'], 6);
        Sound.play('hoe');
      } else if (soil && soil.crop) {
        UI.toast('자라고 있는 똥이 있어요. 곡괭이질은 참아요.');
        Sound.play('swish');
      } else Sound.play('swish');
    } else if (tool === 'axe') {
      if (obj && (obj.type === 'twig' || obj.type === 'stump')) {
        if (!this.spend('axe')) return;
        obj.hp--;
        burst(cx, cy, ['#7a4a22', '#b07a42', '#e8b778'], 7);
        Sound.play('chop');
        R.shake = obj.type === 'stump' ? 2.5 : 1;
        if (obj.hp <= 0) {
          G.obj.delete(k);
          const n = obj.type === 'stump' ? 4 : 1;
          addItem('wood', n);
          floatText(cx, cy - 10, `나무 +${n}`);
          this.invDirty = true;
        }
      } else Sound.play('swish');
    }
  },

  plant(it, tx, ty) {
    if (!inMap(tx, ty)) return;
    const k = key(tx, ty);
    const soil = G.soil.get(k);
    const crop = CROPS[ITEMS[it.id].crop];
    if (!soil || soil.crop || G.obj.has(k)) {
      if (input.usePressed) UI.toast('씨앗은 괭이로 간 빈 밭에 심어요.');
      return;
    }
    if (!crop.seasons.includes(G.season)) {
      UI.toast(`${crop.name}은(는) ${seasonText(crop.seasons)}에만 심을 수 있어요.`, 'bad');
      Sound.play('error');
      return;
    }
    soil.crop = { id: ITEMS[it.id].crop, days: 0, dead: false };
    consumeSelected(1);
    this.invDirty = true;
    burst(tx * TILE + 8, ty * TILE + 11, ['#5c3a1f', '#3b2412'], 4, 0.5);
    Sound.play('plant');
  },

  place(it, tx, ty) {
    if (!inMap(tx, ty)) return;
    const k = key(tx, ty);
    const soil = G.soil.get(k);
    const okGround = W.ground[k] === GROUND.GRASS || W.ground[k] === GROUND.PATH;
    if (!okGround || W.blocked[k] || G.obj.has(k) || (soil && soil.crop)) {
      UI.toast('여기에는 놓을 수 없어요.', 'bad');
      Sound.play('error');
      return;
    }
    const [px, py] = this.playerTile();
    if (px === tx && py === ty) return;
    G.obj.set(k, { type: 'sprinkler', hp: 1 });
    consumeSelected(1);
    this.invDirty = true;
    Sound.play('clink');
    UI.toast('스프링클러를 설치했어요. 매일 아침 주변 4칸에 물을 줘요.', 'good');
  },

  eat() {
    if (G.energy >= G.maxEnergy) { UI.toast('지금은 배가 불러요.'); return; }
    const def = ITEMS[G.inv[G.sel].id];
    G.energy = Math.min(G.maxEnergy, G.energy + def.energy);
    consumeSelected(1);
    this.invDirty = true;
    Sound.play('eat');
    floatText(G.player.x, G.player.y - 30, `기력 +${def.energy}`, '#9fe870');
  },

  // ── 행동 키 ──
  act() {
    const tg = this.target();
    this.faceToward(tg.x, tg.y);
    const { x: tx, y: ty } = tg;
    const b = buildingAt(tx, ty);
    if (b) {
      if (b.kind === 'house') { this.askSleep(); return; }
      if (b.kind === 'bin') { this.ship(); return; }
      if (b.kind === 'shop') { UI.openShop(); return; }
    }
    if (!inMap(tx, ty)) return;
    const soil = G.soil.get(key(tx, ty));
    if (soil && soil.crop) {
      if (soil.crop.dead) { this.clearDead(soil, tx * TILE + 8, ty * TILE + 10); return; }
      if (cropStage(soil.crop) === 4) { this.harvest(soil, tx, ty); return; }
      const c = CROPS[soil.crop.id];
      const left = c.days - soil.crop.days;
      UI.toast(`${c.name}: 다 자라려면 ${left}일 남았어요.${soil.wet ? '' : ' (오늘 물을 아직 안 줬어요)'}`);
      return;
    }
    const it = G.inv[G.sel];
    if (it && ITEMS[it.id].kind === 'food') this.eat();
  },

  harvest(soil, tx, ty) {
    const crop = soil.crop;
    const def = CROPS[crop.id];
    const roll = Math.random();
    const q = roll < 0.08 ? 2 : roll < 0.28 ? 1 : 0;
    const n = def.yield[0] + (Math.random() < def.yield[1] ? 1 : 0);
    if (!hasRoomFor(crop.id, q)) { UI.toast('가방이 꽉 찼어요!', 'bad'); Sound.play('error'); return; }
    addItem(crop.id, n, q);
    const first = !G.stats.harvested[crop.id];
    G.stats.harvested[crop.id] = (G.stats.harvested[crop.id] || 0) + n;
    if (def.regrow) crop.days = def.days - def.regrow;
    else soil.crop = null;
    const cx = tx * TILE + 8, cy = ty * TILE + 8;
    burst(cx, cy, [def.color, shade(def.color, -0.3), '#a5d64a'], 14, 1.2);
    floatText(cx, cy - 12, `+${n} ${def.name}${q ? (q === 2 ? ' ★' : ' ☆') : ''}`, q === 2 ? '#ffd23a' : '#fff4dc');
    Sound.play('harvest');
    R.shake = 1.5;
    this.invDirty = true;
    if (first) {
      UI.toast(`도감에 새 똥 등록: ${def.name}!`, 'good');
      const all = CROP_IDS.every((id) => G.stats.harvested[id]);
      if (all && !G.flags.master) {
        G.flags.master = true;
        setTimeout(() => UI.dialog('축하해요! 모든 똥을 수확해 똥의 달인이 되었어요. 할아버지도 하늘에서 코를 막고 웃고 계실 거예요.', [{ label: '뿌듯하다', green: true }]), 600);
      }
    }
  },

  clearDead(soil, cx, cy) {
    soil.crop = null;
    burst(cx, cy, ['#8a8070', '#6f665a'], 8);
    Sound.play('swish');
    UI.toast('시든 똥을 치웠어요.');
  },

  ship() {
    const it = G.inv[G.sel];
    if (!it || ITEMS[it.id].kind === 'tool' || !ITEMS[it.id].sell) {
      const cnt = G.shipped.reduce((s, x) => s + x.n, 0);
      UI.toast(`출하함: 똥을 손에 들고 행동 키를 누르면 넣어요. 오늘 ${cnt}개 넣음.`);
      return;
    }
    G.shipped.push({ id: it.id, q: it.q || 0, n: it.n });
    G.inv[G.sel] = null;
    G._binOpen = 0.6;
    this.invDirty = true;
    Sound.play('ship');
    UI.toast(`${ITEMS[it.id].name} ×${it.n} 출하! 밤에 정산돼요.`, 'good');
  },

  // ── 상점 ──
  buy(id, n) {
    if (id === 'canUp') {
      if (G.money < 2000 || G.canLevel > 0) return;
      G.money -= 2000;
      G.canLevel = 1;
      G.water = CAN_CAPACITY[1];
      Sound.play('coin');
      UI.toast('물뿌리개가 커졌어요!', 'good');
      this.invDirty = true;
      return;
    }
    const def = ITEMS[id];
    const cost = def.price * n;
    if (G.money < cost) { Sound.play('error'); UI.toast('돈이 모자라요.', 'bad'); return; }
    if (!hasRoomFor(id)) { Sound.play('error'); UI.toast('가방이 꽉 찼어요!', 'bad'); return; }
    addItem(id, n);
    G.money -= cost;
    Sound.play('coin');
    this.invDirty = true;
  },

  sellSlot(i) {
    const it = G.inv[i];
    if (!it) return;
    const total = itemValue(it) * it.n;
    G.money += total;
    G.stats.earned += total;
    G.inv[i] = null;
    Sound.play('coin');
    UI.toast(`${ITEMS[it.id].name} ×${it.n} 판매: +${fmt(total)}G`, 'good');
    this.invDirty = true;
  },

  // ── 하루 끝 ──
  askSleep() {
    const late = G.time >= 22 * 60;
    UI.dialog(late ? '늦었어요. 이제 잘까요?' : '오늘은 이만 잘까요? (자면 자동 저장돼요)', [
      { label: '잘래요', green: true, fn: () => this.sleep(false) },
      { label: '아직이요' },
    ]);
  },

  sleep(passedOut) {
    if (this.busy) return;
    this.busy = true;
    input.keys.clear();
    input.use = input.act = false;
    Sound.play('sleep');
    $('fade').classList.add('on');
    setTimeout(() => {
      const info = this.endDay(passedOut);
      saveGame();
      UI.daySummary(info, () => {
        $('fade').classList.remove('on');
        this.busy = false;
        Sound.play('morning');
        UI.toast(`${dateText(G)} · 오늘 날씨: ${weatherName(G.weather)}`);
        this.invDirty = true;
      });
    }, 700);
  },

  rollWeather(season, day) {
    if (day === 1) return 'sun';
    const r = Math.random();
    if (season === 3) return r < 0.3 ? 'snow' : 'sun';
    return r < (season === 1 ? 0.15 : 0.22) ? 'rain' : 'sun';
  },

  endDay(passedOut) {
    const title = `${SEASONS[G.season]} ${G.day}일 정산`;
    const notes = [];
    // 1. 출하 정산
    const group = new Map();
    for (const s of G.shipped) {
      const gk = s.id + ':' + s.q;
      const cur = group.get(gk) || { id: s.id, q: s.q, n: 0, total: 0 };
      cur.n += s.n;
      cur.total += itemValue(s) * s.n;
      group.set(gk, cur);
    }
    const lines = [...group.values()];
    const total = lines.reduce((a, l) => a + l.total, 0);
    G.money += total;
    G.stats.earned += total;
    G.stats.shippedTotal += total;
    G.shipped = [];
    // 2. 물 준 똥만 자란다
    let grew = 0;
    for (const soil of G.soil.values()) {
      if (soil.crop && !soil.crop.dead && soil.wet && soil.crop.days < CROPS[soil.crop.id].days) { soil.crop.days++; grew++; }
    }
    // 3. 밭이 마르고, 빈 밭은 가끔 풀밭으로 돌아간다
    for (const [k, soil] of [...G.soil.entries()]) {
      const wasWet = soil.wet;
      soil.wet = false;
      if (!soil.crop && !wasWet && !G.obj.has(k) && Math.random() < 0.1) G.soil.delete(k);
    }
    // 4. 날짜
    G.day++;
    let seasonChanged = false;
    if (G.day > DAYS_PER_SEASON) {
      G.day = 1;
      G.season = (G.season + 1) % 4;
      if (G.season === 0) G.year++;
      seasonChanged = true;
    }
    if (seasonChanged) {
      let died = 0;
      for (const soil of G.soil.values()) {
        if (soil.crop && !soil.crop.dead && !CROPS[soil.crop.id].seasons.includes(G.season)) { soil.crop.dead = true; died++; }
      }
      notes.push(`${SEASONS[G.season]}이 왔어요!${died ? ` 제철이 아닌 똥 ${died}개가 시들었어요.` : ''} 상점에 새 씨앗이 들어왔어요.`);
    }
    // 5. 날씨와 아침 물주기
    G.weather = G.tomorrow;
    if (G.season === 3 && G.weather === 'rain') G.weather = 'snow';
    if (G.season !== 3 && G.weather === 'snow') G.weather = 'rain';
    const nextDay = G.day === DAYS_PER_SEASON ? 1 : G.day + 1;
    const nextSeason = G.day === DAYS_PER_SEASON ? (G.season + 1) % 4 : G.season;
    G.tomorrow = this.rollWeather(nextSeason, nextDay);
    if (G.weather === 'rain') for (const soil of G.soil.values()) soil.wet = true;
    for (const [k, o] of G.obj) {
      if (o.type !== 'sprinkler') continue;
      const x = k % MAP_W, y = Math.floor(k / MAP_W);
      for (const [dx, dy] of Object.values(DIRS)) {
        const s = G.soil.get(key(x + dx, y + dy));
        if (s) s.wet = true;
      }
    }
    // 6. 잡초가 새로 난다
    for (let i = 0; i < 5; i++) {
      const x = 2 + Math.floor(Math.random() * (MAP_W - 4));
      const y = 9 + Math.floor(Math.random() * (MAP_H - 11));
      const k = key(x, y);
      if (W.ground[k] === GROUND.GRASS && !W.blocked[k] && !G.obj.has(k) && !G.soil.has(k)) G.obj.set(k, { type: 'weed', hp: 1 });
    }
    // 7. 기력과 시간
    if (passedOut) {
      const fine = Math.min(1000, Math.floor(G.money * 0.1));
      G.money -= fine;
      G.energy = Math.floor(G.maxEnergy / 2);
      notes.unshift(`새벽 2시에 쓰러졌어요… 마을 사람이 집까지 데려다주고 치료비 ${fmt(fine)}G를 받아 갔어요.`);
    } else {
      G.energy = G.maxEnergy;
    }
    if (grew) notes.push(`밤사이 똥 ${grew}개가 자랐어요.`);
    G.time = DAY_START;
    G.timeAcc = 0;
    Object.assign(G.player, { x: 5.5 * TILE, y: 6.9 * TILE, dir: 'down', swing: 0 });
    return {
      title, lines, total, notes, forecast: G.weather,
      nextLabel: `${SEASONS[G.season]} ${G.day}일 아침으로`,
    };
  },
};

function collides(x, y) {
  const l = x - 5, r = x + 5, t = y - 5, b = y - 0.01;
  return isSolid(Math.floor(l / TILE), Math.floor(t / TILE)) || isSolid(Math.floor(r / TILE), Math.floor(t / TILE))
    || isSolid(Math.floor(l / TILE), Math.floor(b / TILE)) || isSolid(Math.floor(r / TILE), Math.floor(b / TILE));
}

// ── 입력 연결 ──
function cycleSlot(d) {
  G.sel = (G.sel + d + HOTBAR_SIZE) % HOTBAR_SIZE;
  Game.invDirty = true;
}

function bindInput() {
  window.addEventListener('keydown', (e) => {
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (!Game.running) {
      if ((k === 'enter' || k === ' ') && document.activeElement === document.body) { e.preventDefault(); $('btnContinue').hidden ? Game.newGame() : Game.continueGame(); }
      return;
    }
    if (UI.modalOpen) {
      if ((k === 'escape' || k === 'e' || k === 'i' || k === 'tab') && UI.closable) { e.preventDefault(); UI.close(); }
      return;
    }
    if (Game.busy) return;
    if (MOVE_KEYS[k]) { input.keys.add(MOVE_KEYS[k]); e.preventDefault(); return; }
    if (k === 'c' || k === ' ' || k === 'j') { if (!e.repeat) input.usePressed = true; input.use = true; e.preventDefault(); return; }
    if (k === 'x' || k === 'f' || k === 'enter' || k === 'k') { if (!e.repeat) input.actPressed = true; e.preventDefault(); return; }
    const si = SLOT_KEYS.indexOf(e.key);
    if (si >= 0) { G.sel = si; Game.invDirty = true; e.preventDefault(); return; }
    if (k === 'q') { cycleSlot(-1); return; }
    if (k === 'r') { cycleSlot(1); return; }
    if (k === 'e' || k === 'i' || k === 'tab' || k === 'escape') { e.preventDefault(); UI.openMenu(); return; }
    if (k === 'm') Game.toggleSound();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (MOVE_KEYS[k]) input.keys.delete(MOVE_KEYS[k]);
    if (k === 'c' || k === ' ' || k === 'j') input.use = false;
  });
  window.addEventListener('blur', () => { input.keys.clear(); input.use = false; });

  const cv = R.canvas;
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.active = true;
  });
  cv.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (!Game.running || UI.modalOpen || Game.busy) return;
    input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.active = true;
    if (e.pointerType === 'mouse' && e.button === 2) { input.actPressed = true; return; }
    if (e.pointerType !== 'mouse') {
      // 터치: 바로 옆 칸을 누르면 그 칸에 도구를 쓴다
      const tg = Game.target();
      const [px, py] = Game.playerTile();
      const w = screenToWorld(e.clientX, e.clientY);
      const mx = Math.floor(w.x / TILE), my = Math.floor(w.y / TILE);
      if (mx === tg.x && my === tg.y && Math.abs(mx - px) <= 1 && Math.abs(my - py) <= 1) input.usePressed = true;
      else input.mouse.active = false;
      return;
    }
    if (e.button === 0) { input.usePressed = true; input.use = true; }
  });
  window.addEventListener('pointerup', () => { input.use = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', (e) => {
    if (!Game.running || UI.modalOpen) return;
    e.preventDefault();
    cycleSlot(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
}

// ── 메인 루프 ──
let lastFrame = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  Game.t += dt;
  if (Game.running && G) {
    if (!UI.modalOpen && !Game.busy) Game.update(dt);
    else if (Game.invDirty) { UI.renderHotbar(); Game.invDirty = false; }
    updateFx(dt);
    updateWeatherFx(dt);
    updateCamera();
    drawWorld(Game.t, UI.modalOpen || Game.busy ? null : Game.target());
    UI.updateHud();
  }
  requestAnimationFrame(frame);
}

function drawTitlePoop() {
  const c = $('titlePoop');
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, 64, 64);
  g.drawImage(SPR.crops.parsnip[4], 0, 0, 64, 64);
}

function start(data) {
  buildMap();
  buildAllSprites();
  initRender();
  UI.init();
  initTouch(input);
  bindInput();
  drawTitlePoop();
  try { Sound.muted = localStorage.getItem('stardew-ddong-muted') === '1'; } catch (e) { /* 무시 */ }
  UI.renderSoundBtn();
  $('btnNew').addEventListener('click', () => { Sound.unlock(); Game.newGame(); });
  $('btnContinue').addEventListener('click', () => { Sound.unlock(); Game.continueGame(); });
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    window.claude.hot.snapshot(() => (Game.running && G ? { save: serialize(G) } : {}));
  }
  const resumed = data && data.save ? deserialize(data.save) : null;
  if (resumed) { resumed.flags.intro = true; Game.begin(resumed); }
  else Game.showTitle();
  requestAnimationFrame(frame);
}

if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
else start((window.claude && window.claude.hot && window.claude.hot.data) || {});
