'use strict';
// ════════════════════════════════════════════════════════════════════
//  게임 수명주기 + 메인 루프 (고정 시간 간격 1/60초 업데이트, 메뉴가 열리면 멈춤)
//  SD.boot() 는 모든 코어·모듈 스크립트가 읽힌 뒤 js/boot.js 가 부른다.
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const STEP = 1 / 60;

  const Game = (SD.Game = {
    running: false,
    frozen: false,      // 테스트용: 실시간 루프 정지 (DBG.step 으로 진행)
    blankState(seed) {
      const inv = new Array(36).fill(null);
      return {
        v: SD.VERSION, seed: seed >>> 0,
        day: 1, season: 0, year: 1, time: 360,
        money: 500,
        weather: 'sun', tomorrow: 'sun', luck: 0,
        inv, sel: 0, row: 0,
        skills: {}, levelUps: [],
        shipping: [], lastShipping: null,
        stats: { totalEarned: 0, harvested: {}, obtained: {} },
        flags: {}, mods: {},
        daysPlayed: 0,
        player: {
          loc: 'FarmHouse', x: 0, y: 0, dir: 'down',
          energy: 270, maxEnergy: 270, health: 100, maxHealth: 100,
          name: '농부', farmName: '똥밸리', look: Object.assign({}, SD.DEFAULT_LOOK),
        },
      };
    },
    newGame(opts) {
      const o = opts || {};
      const G = Game.blankState(o.seed != null ? o.seed : (Math.random() * 2 ** 31) | 0);
      SD.G = G;
      // 원작 시작 가방: 도끼·괭이·물뿌리개·곡괭이·낫 + 파스닙똥 씨앗 15개
      G.inv[0] = { id: 'axe', n: 1, lvl: 0 };
      G.inv[1] = { id: 'hoe', n: 1, lvl: 0 };
      G.inv[2] = { id: 'can', n: 1, lvl: 0, water: SD.CAN_CAPACITY[0] };
      G.inv[3] = { id: 'pick', n: 1, lvl: 0 };
      G.inv[4] = { id: 'scythe', n: 1, lvl: 0 };
      G.inv[5] = { id: 'parsnip_seed', n: 15, q: 0 };
      for (const st of G.inv) if (st) G.stats.obtained[st.id] = 1;
      G.tomorrow = SD.Weather.roll(0, 2, 1);
      SD.Mods._newGame(G);
      SD.World.createAll(null);
      SD.Mods.emit('newGame', G);
      const sp = SD.Day.bedSpot();
      Game.start(sp.loc, sp.x, sp.y, 'down', true);
    },
    continueGame() {
      const G = SD.Save.restore(SD.Save.raw());
      if (!G) { Game.newGame(); return; }
      Game.resume(G);
    },
    resume(G) {
      SD.G = G;
      const p = G.player;
      const loc = SD.World.get(p.loc) ? p.loc : 'FarmHouse';
      Game.start(loc, Math.floor(p.x / SD.TILE), Math.floor((p.y - 2) / SD.TILE), p.dir, false);
    },
    start(locId, tx, ty, dir, isNew) {
      SD.UI.title = null;
      SD.UI.closeAll();
      SD.Time.acc = 0;
      SD.Day.busy = false; SD.Day.fade = 0;
      SD.HUD.money = null;
      SD.World.place(locId, tx, ty, dir);
      SD.Day._ask = 1;
      Game.running = true;
      SD.Mods.emit('gameStart', SD.G, isNew);
      if (isNew) SD.Mods.emit('firstDay', SD.G);
      SD.UI.hud(`${SD.Time.dateText()} · ${SD.Weather.name(SD.G.weather)}`);
    },
    toTitle() {
      Game.running = false;
      SD.Mods.emit('gameEnd', SD.G);
      SD.G = null;
      SD.World.current = null;
      SD.Music.stop();
      SD.UI.closeAll();
      SD.UI.messages.length = 0;
      SD.FX.clear();
      Game.showTitle();
    },
    showTitle() {
      SD.Music.play('title');
      SD.UI.showTitle({
        hasSave: SD.Save.exists(),
        onNew: () => Game.newGame(),
        onContinue: () => Game.continueGame(),
      });
    },
  });

  // ───────────── 업데이트 한 걸음 ─────────────
  Game.update = function (dt) {
    SD.Input.updateWorld();
    SD.UI.update(dt);
    if (!Game.running || !SD.G) { SD.Input.endFrame(); return; }
    SD.Day.updateFade(dt);
    SD.World.updateTransition(dt);
    const paused = SD.UI.blocking();
    if (!paused) {
      SD.Time.anim += dt;
      SD.Player.update(dt);
      if (!SD.Day.busy && !SD.World.transition) SD.Time.update(dt);
      const loc = SD.World.current;
      if (loc) {
        SD.Drops.update(loc, dt);
        for (let i = loc.temp.length - 1; i >= 0; i--) {
          const e = loc.temp[i];
          const d = SD.Temp.get(e.kind);
          if (!d || !SD.Mods.safe('temp ' + e.kind, d.update, e, dt, loc)) loc.temp.splice(i, 1);
        }
        for (const c of loc.chars.slice()) {
          const d = SD.Chars.get(c.t);
          if (d && d.update) SD.Mods.safe('char ' + c.t, d.update, c, dt, loc);
        }
        if (loc.def.update) SD.Mods.safe('loc.update ' + loc.id, loc.def.update, loc, dt);
      }
      SD.Mods.emit('update', dt, loc);
      SD.FX.update(dt);
      SD.Render.updateWeather(dt);
    } else {
      SD.Mods.emit('pausedUpdate', dt);
    }
    SD.Music.update(dt);
    SD.Input.endFrame();
  };
  Game.render = function () {
    const g = SD.Render.ctx;
    if (SD.UI.title || !Game.running || !SD.G) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#0c0806'; g.fillRect(0, 0, SD.Render.W, SD.Render.H);
      SD.UI.draw(g);
      return;
    }
    SD.Render.draw();
    SD.Render.drawFade(Math.max(SD.World.fadeAmount(), SD.Day.fade));
    SD.UI.draw(g);
  };

  // ───────────── 루프 ─────────────
  let last = 0, acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    if (!Game.frozen) {
      SD.Time.real += dt;
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 6) { Game.update(STEP); acc -= STEP; steps++; }
      if (steps >= 6) acc = 0;
      try { Game.render(); } catch (e) { console.error('[SD] 그리기 오류', e); }
    }
    requestAnimationFrame(frame);
  }
  // 테스트: 고정 간격으로 ms 만큼 진행 후 그리기
  Game.step = function (ms) {
    const n = Math.max(1, Math.round((ms || 16) / (1000 * STEP)));
    for (let i = 0; i < n; i++) { SD.Time.real += STEP; Game.update(STEP); }
    Game.render();
  };

  // ───────────── 부팅 ─────────────
  SD.boot = function () {
    if (SD._booted) return;
    const start = (data) => {
      SD._booted = true;
      const canvas = document.getElementById('game');
      SD.Render.init(canvas);
      SD.Input.attach(canvas);
      SD.Sound.setVolume(SD.Settings.get('volume'));
      SD.Music.volume = SD.Settings.get('music');
      SD.Mods._initAll();
      SD.Mods.emit('ready', SD);
      const hot = window.claude && window.claude.hot;
      if (hot && hot.snapshot) hot.snapshot(() => (Game.running && SD.G ? { save: SD.Save.serialize() } : {}));
      const resumed = data && data.save ? SD.Save.restore(data.save) : null;
      if (resumed) Game.resume(resumed);
      else Game.showTitle();
      requestAnimationFrame(frame);
    };
    const go = (data) => {
      const fonts = document.fonts;
      if (fonts && fonts.load) {
        Promise.race([
          Promise.all([fonts.load('12px Galmuri11'), fonts.load('12px Galmuri9')]),
          new Promise((r) => setTimeout(r, 1500)),
        ]).then(() => start(data), () => start(data));
      } else start(data);
    };
    const hot = window.claude && window.claude.hot;
    if (hot && hot.ready) hot.ready(go);
    else go((hot && hot.data) || {});
  };
})();
