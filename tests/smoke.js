// 스모크 테스트: 새 게임 → 밭 갈기/심기/물주기 → 잠자기 반복 → 수확 → 출하 → 잠 → 돈 증가
// 콘솔 에러 0, 스크린샷: 농장 사계절, 농가 실내, 작물 전 단계, 농부 애니메이션, 밤, 비, 눈
// 실행: node tests/smoke.js
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'out');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.join(ROOT, 'index.html');

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(URL);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload();
  await page.waitForFunction(() => window.SD && SD._booted && SD.UI.title, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const frozenShot = async (name, ms) => { await ev((t) => { DBG.step(t); }, ms || 16); await shot(name); };

  console.log('1. 타이틀');
  await shot('01_title');
  check(await ev(() => !!SD.UI.title), '타이틀 화면이 보인다');

  console.log('2. 새 게임 (키보드 Enter)');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check(await ev(() => SD.Game.running && SD.G.player.loc === 'FarmHouse'), '농가에서 시작한다');
  check(await ev(() => SD.G.money === 500 && SD.Inv.count('parsnip_seed') === 15), '500G + 파스닙똥 씨앗 15개');
  await shot('02_farmhouse');

  console.log('3. 걸어서 집 밖으로');
  await ev(() => DBG.teleport(6, 9, 'down'));
  await page.keyboard.down('KeyS');
  await page.waitForFunction(() => SD.G.player.loc === 'Farm' && !SD.World.transition, null, { timeout: 8000 }).catch(() => {});
  await page.keyboard.up('KeyS');
  check(await ev(() => SD.G.player.loc === 'Farm'), '문 매트로 걸어 나가면 농장으로 워프');
  await page.waitForTimeout(400);
  await shot('03_farm_door');

  console.log('4. 밭 갈기 · 심기 · 물주기 (실제 키 입력)');
  await ev(() => { DBG.clearArea(38, 20, 44, 24); DBG.teleport(40, 21, 'down'); });
  const tillPlantWater = async (tx) => {
    await ev((x) => { DBG.teleport(x, 21, 'down'); }, tx);
    await page.keyboard.press('Digit2'); await page.waitForTimeout(60);
    await page.keyboard.press('KeyC'); await page.waitForTimeout(520);
    await page.keyboard.press('Digit6'); await page.waitForTimeout(60);
    await page.keyboard.press('KeyC'); await page.waitForTimeout(150);
    await page.keyboard.press('Digit3'); await page.waitForTimeout(60);
    await page.keyboard.press('KeyC'); await page.waitForTimeout(650);
  };
  for (const tx of [39, 40, 41]) await tillPlantWater(tx);
  const plot = await ev(() => [39, 40, 41].map((x) => { const f = DBG.loc().featAt(x, 22); return f && f.t === 'dirt' ? { crop: f.crop && f.crop.id, wet: f.wet } : null; }));
  check(plot.every((p) => p && p.crop === 'parsnip'), '괭이로 간 흙 3칸에 파스닙똥 심음');
  check(plot.every((p) => p && p.wet), '물뿌리개로 물을 줌');
  check(await ev(() => SD.Inv.count('parsnip_seed') === 12), '씨앗 3개 소모');
  check(await ev(() => SD.G.player.energy < 270), '도구를 쓰면 기력이 준다');
  await shot('04_planted');

  console.log('5. 잠자기 반복 (매일 물주기)');
  for (let d = 0; d < 4; d++) {
    await ev(() => DBG.skipDay());
    await page.waitForFunction(() => !SD.Day.busy, null, { timeout: 15000 });
    await ev(() => { DBG.warp('Farm'); DBG.teleport(40, 21, 'down'); for (const x of [39, 40, 41]) SD.Farming.water(DBG.loc(), x, 22); });
  }
  check(await ev(() => SD.G.day === 5), '4일이 지났다 (봄 5일)');
  const mature = await ev(() => [39, 40, 41].map((x) => SD.Farming.isMature(DBG.loc().featAt(x, 22).crop)));
  check(mature.every(Boolean), '물을 준 파스닙똥이 4일 만에 다 자람');
  await ev(() => { DBG.time(1000); });
  await page.waitForTimeout(200);
  await shot('05_mature');

  console.log('6. 수확 (행동 키)');
  for (const x of [39, 40, 41]) {
    await ev((tx) => DBG.teleport(tx, 21, 'down'), x);
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(450);
  }
  const got = await ev(() => SD.Inv.count('parsnip'));
  check(got >= 3, `파스닙똥 ${got}개 수확`);
  check(await ev(() => SD.Skills.xp('farming') > 0), '농사 경험치를 얻었다');

  console.log('7. 출하');
  const before = await ev(() => SD.G.money);
  await ev(() => { const bin = DBG.loc().large.find((o) => o.t === 'shippingBin'); DBG.teleport(bin.x, bin.y + 1, 'up'); DBG.selectItem('parsnip'); });
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(300);
  check(await ev(() => SD.G.shipping.length > 0 && SD.Inv.count('parsnip') === 0), '출하함에 넣음');
  await shot('07_shipped');

  console.log('8. 잠 → 정산');
  await ev(() => { DBG.warp('FarmHouse'); });
  await ev(() => SD.Day.askSleep());
  await page.waitForTimeout(200);
  await shot('08_sleep_question');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => SD.UI.top() && SD.UI.top().id === 'summary', null, { timeout: 8000 });
  await page.waitForTimeout(900);
  await shot('08_summary');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(500); if (await ev(() => !SD.Day.busy)) break; }
  await page.waitForFunction(() => !SD.Day.busy, null, { timeout: 10000 });
  const after = await ev(() => SD.G.money);
  check(after > before, `돈이 늘었다 (${before} → ${after})`);
  check(await ev(() => SD.Save.exists()), '자동 저장됨');

  console.log('9. 저장 → 불러오기');
  const snap = await ev(() => ({ day: SD.G.day, money: SD.G.money }));
  await ev(() => { SD.Game.toTitle(); SD.Game.continueGame(); });
  check(await ev((s) => SD.G.day === s.day && SD.G.money === s.money, snap), '이어하기로 같은 날짜/돈 복원');

  console.log('9b. 기능 검사');
  // 나무 베기: 10번 → 쓰러짐(임시 스프라이트) → 그루터기 → 나무 떨어짐 → 자석으로 줍기
  const tree = await ev(async () => {
    DBG.warp('Farm');
    const L = DBG.loc();
    DBG.clearArea(20, 18, 28, 24);
    L.setFeat(24, 20, { t: 'tree', kind: 'oak', stage: 4 });
    DBG.teleport(23, 20, 'right');
    const axe = SD.Inv.findTool('axe');
    const ctx = SD.Player.toolCtx(axe, 24, 20);
    for (let i = 0; i < 10; i++) SD.Player.applyToolAt(ctx, 24, 20);
    const f = L.featAt(24, 20);
    const falling = L.temp.some((e) => e.kind === 'fallingTree');
    const wood0 = SD.Inv.count('wood');
    DBG.freeze(true);
    DBG.step(1300);
    const drops = L.items.length;
    DBG.step(700);
    // 쓰러진 쪽으로 걸어가며 줍는다
    for (let i = 0; i < 6; i++) { DBG.teleport(25 + i, 20, 'right'); DBG.step(500); }
    DBG.freeze(false);
    return { stump: f && f.stump, falling, drops, wood: SD.Inv.count('wood') - wood0, left: L.items.length };
  });
  check(tree.stump && tree.falling, '도끼 10번에 나무가 쓰러지고 그루터기가 남는다');
  check(tree.drops > 0, `쓰러진 나무에서 아이템이 튀어나온다 (${tree.drops}덩이)`);
  check(tree.wood >= 10 && tree.left === 0, `바닥 아이템이 자석처럼 빨려와 가방에 (나무 +${tree.wood})`);
  // 차지: 구리 괭이를 꾹 누르면 3칸
  await ev(() => { DBG.clearArea(20, 18, 28, 26); DBG.giveTool('hoe', 1); DBG.selectItem('hoe'); DBG.teleport(24, 20, 'down'); SD.G.player.energy = 270; });
  await page.keyboard.down('KeyC');
  await page.waitForTimeout(900);
  await shot('09_charge');
  await page.keyboard.up('KeyC');
  await page.waitForTimeout(500);
  const tilled = await ev(() => [21, 22, 23].filter((y) => SD.Farming.isDirt(DBG.loc(), 24, y)).length);
  check(tilled === 3, `구리 괭이 차지 → 3칸 갈기 (${tilled}칸)`);
  // 지지대 작물은 지나갈 수 없다
  const trellis = await ev(() => { const L = DBG.loc(); DBG.setCrop(26, 22, 'green_bean', 2); return L.isPassable(26, 22); });
  check(trellis === false, '그린빈똥 지지대는 지나갈 수 없다');
  // 큰 그루터기: 기본 도끼로는 안 됨, 구리 도끼로는 됨
  const clump = await ev(() => {
    const L = DBG.loc();
    DBG.clearArea(20, 24, 23, 27);
    const o = L.addLarge({ t: 'clump', kind: 'stump', x: 21, y: 25, w: 2, h: 2 });
    const axe = SD.Inv.findTool('axe');
    axe.lvl = 0;
    for (let i = 0; i < 12; i++) SD.Player.applyToolAt(SD.Player.toolCtx(axe, 21, 25), 21, 25);
    const still = L.large.includes(o);
    axe.lvl = 1;
    for (let i = 0; i < 12; i++) SD.Player.applyToolAt(SD.Player.toolCtx(axe, 21, 25), 21, 25);
    axe.lvl = 0;
    return { still, gone: !L.large.includes(o) };
  });
  check(clump.still && clump.gone, '큰 그루터기는 구리 도끼부터 쪼갤 수 있다');
  // 풀 베기
  const grass = await ev(() => { const L = DBG.loc(); L.setFeat(24, 26, { t: 'grass', n: 4 }); const sc = SD.Inv.findTool('scythe'); SD.Player.applyToolAt(SD.Player.toolCtx(sc, 24, 26), 24, 26); return !L.featAt(24, 26); });
  check(grass, '낫으로 풀을 벤다');
  // 비 → 자동 물주기, 계절이 바뀌면 시듦
  const season = await ev(async () => {
    const L = DBG.loc();
    DBG.clearArea(30, 30, 32, 30);
    DBG.till(30, 30, 32, 30);
    DBG.plant('parsnip_seed', 30, 30, 32, 30);
    SD.G.day = 28;
    await DBG.skipDay();
    const f = SD.World.get('Farm').featAt(30, 30);
    const dead = !!(f && f.crop && f.crop.dead);
    SD.G.tomorrow = 'rain';
    await DBG.skipDay();
    const f2 = SD.World.get('Farm').featAt(31, 30);
    return { season: SD.G.season, dead, wet: !!(f2 && f2.wet), weather: SD.G.weather };
  });
  check(season.season === 1 && season.dead, '계절이 바뀌면 제철 아닌 똥이 시든다');
  check(season.wet, '비 오는 아침에는 밭이 저절로 젖는다');
  await ev(() => { SD.G.season = 0; SD.G.day = 6; SD.G.weather = 'sun'; });
  // 가방이 꽉 차면 수확 불가
  const full = await ev(() => {
    const saved = SD.G.inv.slice();
    for (let i = 0; i < 36; i++) if (!SD.G.inv[i]) SD.G.inv[i] = { id: 'stone', n: 999, q: 0 };
    DBG.warp('Farm');
    const f = DBG.setCrop(34, 30, 'parsnip', 4);
    SD.Farming.harvest(f, DBG.loc(), 'hand');
    const kept = !!f.crop;
    SD.G.inv = saved;
    return kept && SD.UI.messages.some((m) => m.text.includes('꽉'));
  });
  check(full, '가방이 꽉 차면 수확하지 않고 알린다');
  // 섞인 씨앗 → 이 계절 작물
  const mixed = await ev(() => { DBG.clearArea(36, 30, 36, 30); DBG.till(36, 30); SD.Farming.plant(DBG.loc(), 36, 30, 'mixed_seeds'); const c = DBG.loc().featAt(36, 30).crop; return c && SD.Crops.get(c.id).seasons.includes(SD.G.season); });
  check(mixed, '섞인 씨앗은 이 계절 똥이 된다');
  // 채집 똥 생성 API
  const forage = await ev(() => SD.Farming.spawnForage(DBG.loc(), 3) > 0 && [...DBG.loc().objects.values()].some((o) => o.t === 'forage'));
  check(forage, '채집 똥이 생긴다');
  // 레벨업: 경험치 기준
  const lv = await ev(() => { const before = SD.Skills.level('mining'); SD.Skills.addXP('mining', 100); return [before, SD.Skills.level('mining'), SD.G.levelUps.length]; });
  check(lv[1] === lv[0] + 1 && lv[2] > 0, '경험치 100 → 레벨 1, 밤에 보여줄 레벨업 대기열');
  // 새벽 2시 기절 → 다음 날 침대, 벌금
  const pass = await ev(async () => {
    DBG.warp('Farm'); DBG.teleport(40, 20); SD.G.money = 5000;
    const day = SD.G.day;
    SD.G.time = 1550; SD.Time.acc = 6.95;
    await new Promise((r) => { const off = SD.Mods.on('newDay', () => { off(); r(); }); const pump = setInterval(() => { const t = SD.UI.top(); if (t && t.id === 'summary') { t._t = 9; t.next(); } if (!SD.Day.busy && SD.G.day !== day) clearInterval(pump); }, 60); });
    return { day: SD.G.day - day, money: SD.G.money, loc: SD.G.player.loc, energy: SD.G.player.energy };
  });
  check(pass.day === 1 && pass.loc === 'FarmHouse', '새벽 2시에 쓰러지면 침대에서 아침을 맞는다');
  check(pass.money === 4500, `쓰러지면 소지금의 10% 를 잃는다 (${pass.money})`);
  check(pass.energy < 270, '쓰러진 다음 날은 기력이 덜 찬다');
  // 모듈 훅 오류는 게임을 멈추지 않는다
  const robust = await ev(() => { const off = SD.Mods.on('update', () => { throw new Error('test hook error'); }); SD.Game.update(1 / 60); off(); return SD.Game.running; });
  check(robust, '훅 오류가 나도 게임 루프는 계속 돈다');
  errors.splice(0, errors.length, ...errors.filter((e) => !e.includes('test hook error')));

  console.log('10. 스크린샷: 사계절 농장');
  await ev(() => { DBG.freeze(true); DBG.warp('Farm'); DBG.teleport(46, 16, 'down'); DBG.time(1100); DBG.weather('sun'); });
  for (let s = 0; s < 4; s++) {
    await ev((ss) => { DBG.season(ss); DBG.weather('sun'); DBG.teleport(ss % 2 ? 22 : 46, ss % 2 ? 30 : 16, 'down'); }, s);
    await frozenShot('10_farm_season' + s, 100);
  }
  await ev(() => { DBG.season(0); DBG.teleport(12, 32, 'down'); });
  await frozenShot('10_farm_cliff_pond', 100);

  console.log('11. 스크린샷: 밤 · 비 · 폭풍 · 눈 · 바람');
  await ev(() => { DBG.teleport(46, 14, 'down'); DBG.time(1730); });
  await frozenShot('11_evening', 50);
  await ev(() => { DBG.time(2200); });
  await frozenShot('11_night', 50);
  await ev(() => { DBG.time(1100); DBG.weather('rain'); });
  await frozenShot('11_rain', 400);
  await ev(() => { DBG.weather('storm'); });
  await frozenShot('11_storm', 400);
  await ev(() => { DBG.season(3); DBG.weather('snow'); });
  await frozenShot('11_snow', 600);
  await ev(() => { DBG.season(2); DBG.weather('wind'); DBG.teleport(22, 30, 'down'); });
  await frozenShot('11_wind_fall', 600);
  await ev(() => { DBG.season(0); DBG.weather('sun'); DBG.warp('FarmHouse'); DBG.time(2100); });
  await frozenShot('11_house_night', 50);

  console.log('12. 스크린샷: 모든 작물 성장 단계');
  await ev(() => { DBG.warp('Farm'); DBG.season(0); DBG.time(1100); DBG.weather('sun'); SD.Settings.set('zoom', 2); });
  const ids = await ev(() => SD.Crops.ids());
  const per = 9;
  for (let i = 0; i < ids.length; i += per) {
    await ev((arr) => {
      const x0 = 14, y0 = 8;
      DBG.clearArea(x0 - 1, y0 - 2, x0 + 40, y0 + 22);
      arr.forEach((id, j) => {
        const n = SD.Crops.stageCount(id);
        for (let s = 0; s < n; s++) DBG.setCrop(x0 + s, y0 + j * 2, id, s);
      });
      DBG.teleport(x0 + 12, y0 + 8, 'down');
      SD.G.player.hidden = true;
    }, ids.slice(i, i + per));
    await frozenShot('12_crops_' + String(i / per | 0), 50);
  }
  await ev(() => { SD.G.player.hidden = false; SD.Settings.set('zoom', 'auto'); });

  console.log('13. 스크린샷: 농부 애니메이션');
  await ev(() => { SD.Settings.set('zoom', 5); DBG.season(0); DBG.clearArea(30, 18, 36, 24); DBG.teleport(33, 21, 'down'); SD.Farming.till(DBG.loc(), 33, 22); });
  for (const dir of ['down', 'right', 'up', 'left']) {
    for (let f = 0; f < 4; f++) {
      await ev(([d, ff]) => { const p = SD.G.player; p.dir = d; p.moving = true; p._walkT = ff / 8 + 0.01; }, [dir, f]);
      await ev(() => SD.Game.render());
      await shot(`13_walk_${dir}_${f}`);
    }
  }
  await ev(() => { SD.G.player.moving = false; });
  const tools = [['hoe', 'tool'], ['pick', 'tool'], ['axe', 'tool'], ['can', 'water'], ['scythe', 'swing']];
  for (const [tool, anim] of tools) {
    for (const dir of ['down', 'right', 'up']) {
      for (const k of [0.25, 0.55, 0.85]) {
        await ev(([t, a, d, kk]) => {
          const p = SD.G.player; p.dir = d;
          const st = SD.Inv.findTool(t);
          const an = SD.Farmer.play(p, a, { stack: st, tx: 33 + SD.DIRS[d].x, ty: 21 + SD.DIRS[d].y });
          an.t = kk * an.def.dur; an.hold = true;
          SD.Game.render();
        }, [tool, anim, dir, k]);
        await shot(`13_${tool}_${dir}_${Math.round(k * 100)}`);
      }
    }
  }
  await ev(() => { const p = SD.G.player; p.dir = 'down'; const a = SD.Farmer.play(p, 'holdUp', { item: 'parsnip' }); a.t = 0.5; a.hold = true; SD.Game.render(); });
  await shot('13_holdup');
  await ev(() => { const p = SD.G.player; const a = SD.Farmer.play(p, 'eat', { item: 'parsnip' }); a.t = 0.4; a.hold = true; SD.Game.render(); });
  await shot('13_eat');
  await ev(() => { const p = SD.G.player; const a = SD.Farmer.play(p, 'passOut', {}); a.t = 1.2; a.hold = true; SD.Game.render(); });
  await shot('13_passout');
  await ev(() => { SD.G.player._anim = null; SD.Settings.set('zoom', 'auto'); DBG.freeze(false); });

  console.log('14. 메뉴');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  check(await ev(() => SD.UI.isOpen('menu')), 'E 로 메뉴가 열린다');
  await shot('14_menu_bag');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  await shot('14_menu_skills');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(await ev(() => !SD.UI.isOpen('menu')), 'Esc 로 메뉴가 닫힌다');

  console.log('15. 막힌 길 (마을 자리)');
  await ev(() => { DBG.warp('Farm'); DBG.teleport(62, 15, 'right'); });
  await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
  check(await ev(() => SD.G.player.loc === 'Farm' && SD.UI.messages.some((m) => m.text.includes('공사'))), '마을 지역이 없으면 HUD 메시지');

  console.log('16. 콘솔 에러');
  check(errors.length === 0, '콘솔 에러 0개' + (errors.length ? ':\n' + errors.slice(0, 10).join('\n') : ''));

  await browser.close();
  console.log(failures ? `\n실패 ${failures}개` : '\n모두 통과');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
