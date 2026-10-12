// 모듈 API 확인: docs/ARCHITECTURE.md §17 예제 모듈을 주입해 확장 지점이 문서대로 동작하는지 검사
// 실행: node tests/api.js
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'out');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failures++; };

// 문서의 예제 코드를 그대로 꺼낸다
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8');
const example = doc.slice(doc.indexOf('## 17.')).match(/```js\n([\s\S]*?)```/)[1];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload();
  await page.waitForFunction(() => window.SD && SD._booted);
  const ev = (fn, a) => page.evaluate(fn, a);

  console.log('예제 모듈 주입');
  await page.addScriptTag({ content: example.split("'town'").join("'town_example'") });
  check(await ev(() => !!SD.Mods.get('town_example') && SD.World.exists('Town')), '모듈 등록 + 지역 정의');

  // 다른 API 들
  await ev(() => {
    SD.Items.define('test_gem', { name: '시험 보석', cat: 'gem', price: 77, sprite: () => SD.Art.iconFrom((S) => S.ellipse(8, 9, 5, 5, SD.gfx.ramp('#8ce0f0'))) });
    SD.Crops.define('test_poop', {
      name: '시험똥', seasons: [0, 1, 2, 3], phases: [1, 1], seedPrice: 5, price: 9,
      look: { color: '#88aa44', mature(S) { SD.Art.poopBody(S, 8, 28, [[12, 5], [8, 4], [4, 3]], '#88aa44'); }, icon(S) { SD.Art.poopBody(S, 8, 15, [[12, 5], [8, 4]], '#88aa44'); } },
    });
    SD.ObjTypes.define('test_box', {
      layer: 'object',
      draw(V, o) { V.add(o.y * 16 + 15, (g) => { g.fillStyle = '#c84'; g.fillRect(o.x * 16 + 2, o.y * 16 + 2, 12, 12); }); },
      onAction(o, ctx) { window.__boxed = (window.__boxed || 0) + 1; return true; },
      dayStart(o) { o.days = (o.days || 0) + 1; },
    });
    SD.Farmer.define('wave', { dur: 0.3, pose() { return { hands: { L: [11, 30], R: [24, 12] } }; } });
    SD.Sound.define('testBeep', (S) => S.tone('sine', 440, 440, 0.05, 0.02));
    SD.UI.addTab({ id: 'social', name: '관계', order: 20, draw(g, r) { SD.UI.text(g, '테스트 관계 탭', r[0] + 20, r[1] + 20); } });
    window.__hooks = {};
    SD.Mods.on('toolUse', (ctx) => { window.__hooks.toolUse = (window.__hooks.toolUse || 0) + 1; return false; });
    SD.Mods.on('draw:sprites', () => { window.__hooks.draw = true; });
    SD.Mods.on('dayEnding', (info) => { info.addEarning('fishing', 123, '시험 수입'); });
    SD.Mods.on('lights', (loc, add) => { window.__hooks.lights = true; });
  });
  check(await ev(() => SD.Items.has('test_poop') && SD.Items.has('test_poop_seed') && SD.Items.get('test_poop_seed').cat === 'seed'), '작물 정의 → 수확물·씨앗 아이템 자동 생성');

  console.log('새 게임');
  await ev(() => SD.Game.newGame({ seed: 5 }));
  await page.waitForTimeout(300);
  check(await ev(() => SD.Mods.state('town_example') && typeof SD.Mods.state('town_example').friendship === 'object'), 'newGame() 이 모듈 상태를 만든다');
  check(await ev(() => SD.World.get('Town').chars.some((c) => c.t === 'shopkeeper')), 'setup() 에서 넣은 NPC 가 있다');

  console.log('농장 동쪽 출구 → Town');
  await ev(() => { DBG.warp('Farm'); DBG.teleport(61, 15, 'right'); });
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => SD.G.player.loc === 'Town' && !SD.World.transition, null, { timeout: 6000 }).catch(() => {});
  await page.keyboard.up('KeyD');
  check(await ev(() => SD.G.player.loc === 'Town'), '정의한 지역으로 걸어서 들어간다 (entries.Farm 도착)');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'api_town.png') });

  console.log('NPC 행동 → 상점 → 사기');
  await ev(() => { DBG.teleport(8, 3, 'up'); SD.G.money = 500; });
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(200);
  check(await ev(() => SD.UI.isOpen('shop')), '행동 키로 NPC onAction → 상점');
  await page.screenshot({ path: path.join(OUT, 'api_shop.png') });
  const bought = await ev(() => { const s = SD.UI.top(); s.buy({ id: 'parsnip_seed', price: 20, q: 0 }, 2); return [SD.G.money, SD.Inv.count('parsnip_seed')]; });
  check(bought[0] === 460 && bought[1] === 17, `씨앗 2개 구입 (돈 ${bought[0]}, 씨앗 ${bought[1]})`);
  await page.keyboard.press('Escape');

  console.log('오브젝트 타입 · 훅');
  await ev(() => { DBG.warp('Farm'); DBG.clearArea(40, 20, 42, 22); DBG.loc().setObj(41, 21, { t: 'test_box' }); DBG.teleport(41, 20, 'down'); });
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(100);
  check(await ev(() => window.__boxed === 1), '새 오브젝트 타입 onAction');
  await ev(() => { DBG.selectItem('pick'); });
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(600);
  check(await ev(() => window.__hooks.toolUse > 0), "'toolUse' 훅이 불린다");
  check(await ev(() => window.__hooks.draw && window.__hooks.lights), "'draw:sprites' · 'lights' 훅이 불린다");
  await ev(() => { SD.Player.anim('wave'); SD.Sound.play('testBeep'); });
  await page.waitForTimeout(400);
  check(await ev(() => !SD.G.player._anim), '모듈 애니메이션 재생 후 끝남');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);
  await ev(() => SD.UI.top().switchTo('social'));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, 'api_tab.png') });
  await page.keyboard.press('Escape');

  console.log('하루 끝: 정산 추가 · dayStart · 저장/불러오기');
  await ev(() => { DBG.till(42, 22); DBG.plant('test_poop_seed', 42, 22); SD.Farming.water(DBG.loc(), 42, 22); });
  const m0 = await ev(() => SD.G.money);
  await ev(() => DBG.skipDay());
  const m1 = await ev(() => SD.G.money);
  check(m1 - m0 === 123, `'dayEnding' 의 addEarning 이 정산에 들어간다 (+${m1 - m0})`);
  check(await ev(() => SD.World.get('Farm').objAt(41, 21).days === 1), '오브젝트 dayStart');
  check(await ev(() => SD.Mods.state('town_example').lastDay === SD.G.day), 'hooks.dayStarted');
  await ev(() => { SD.Mods.state('town_example').friendship.pierre = 250; SD.Save.save(); SD.Game.toTitle(); SD.Game.continueGame(); });
  check(await ev(() => SD.Mods.state('town_example').friendship.pierre === 250), '모듈 상태 저장/불러오기');
  check(await ev(() => SD.World.get('Farm').objAt(41, 21) && SD.World.get('Farm').objAt(41, 21).t === 'test_box'), '모듈 오브젝트 저장/불러오기');
  check(await ev(() => { const f = SD.World.get('Farm').featAt(42, 22); return f && f.crop && f.crop.id === 'test_poop' && f.crop.phase === 1; }), '모듈 작물 성장 + 저장');

  check(errors.length === 0, '콘솔 에러 0개' + (errors.length ? ':\n' + errors.join('\n') : ''));
  await browser.close();
  console.log(failures ? `\n실패 ${failures}개` : '\n모두 통과');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
