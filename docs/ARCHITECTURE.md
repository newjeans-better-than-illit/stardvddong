# 스타듀 똥밸리 v2 — 엔진 구조와 모듈 API

이 문서는 `js/mods/*.js` 를 만드는 모듈 작업자를 위한 **정확한 API 참고서**다.
설계 기준(그래픽·모션·기능 수치)은 `docs/DESIGN.md` 가 정하고, 여기서는 "코어를 고치지 않고 어떻게 확장하는가"를 다룬다.

- 모든 코드는 일반 `<script>` (ES 모듈 아님), 전역 이름공간은 `window.SD` 하나.
- 모듈은 **자기 파일만** 수정한다. 코어에 없는 기능은 훅·레지스트리·래핑으로 해결하고, 정말 불가능하면 보고서에 "코어 요청"으로 적는다.
- 모든 훅 호출은 코어가 `try/catch` 로 감싼다. 모듈이 던진 오류는 `console.error` 로 찍히고 게임은 계속 돈다(같은 핸들러 오류는 5번까지만 로그).
- 텍스트는 모두 한국어. 원작 이름·대사·이미지는 쓰지 않는다.
- JS 안에 `</script` 문자열 금지, 런타임 `fetch` 금지 (단일 파일 번들이 깨진다).

---

## 1. 파일과 로드 순서

`index.html` 이 아래 순서로 읽는다. 모듈은 코어 다음, `boot.js` 앞.

| 파일 | 내용 |
| --- | --- |
| `core/base.js` | `SD` 이름공간, `SD.util`, 훅 `SD.Mods`, 모듈 레지스트리, `SD.makeRegistry` |
| `core/gfx.js` | 캔버스·색·행→스프라이트·자동 외곽선·명암·회전·그림자·캐시 (`SD.gfx`), 팔레트 `SD.PAL` |
| `core/audio.js` | 효과음 `SD.Sound`, 음악 자리 `SD.Music` |
| `core/items.js` | 분류 `SD.CATEGORIES`, 품질 `SD.QUALITY`, `SD.Items`, `SD.Tools`, 인벤토리 `SD.Inv` |
| `core/item_art.js` | 아이콘 아트 `SD.Art`(도구·씨앗·자원), 기본 자원 아이템 |
| `core/crop_art.js` | 똥 그리기 도구 `SD.Art.Shp`, `poopBody`, `face`, 질감, 성장 단계 |
| `core/crops.js` | 작물 표(§4 전부) `SD.Crops`, 채집 똥 `SD.Forage`, 계절/섞인 씨앗 |
| `core/tiles.js` | 지형 타일 `SD.Tiles`(계절 팔레트·자동 타일), 괭이 흙 16종 |
| `core/world_art.js` | 나무·잡동사니·덩어리·덤불·풀·농가·출하함·가구 아트 |
| `core/world.js` | `SD.Location`, `SD.World` (지역·워프·충돌·바닥 아이템) |
| `core/objects.js` | 오브젝트 타입 `SD.ObjTypes`/`SD.Obj`, 캐릭터 `SD.Chars`, 임시 스프라이트 `SD.Temp`, 바닥 아이템 `SD.Drops` |
| `core/farming.js` | 괭이 흙·작물 성장·품질·수확·출하·채집물 생성 `SD.Farming` |
| `core/farmer.js` | 사람 스프라이트 리그 + 애니메이션 `SD.Farmer` |
| `core/fx.js` | 입자·글자·흔들림·번쩍임 `SD.FX` |
| `core/render.js` | 렌더러 `SD.Render` (레이어·조명·날씨·카메라) |
| `core/input.js` | 입력 `SD.Input` |
| `core/skills.js` | `SD.Skills`, 기력/체력 `SD.Stats` |
| `core/time.js` | `SD.Time`, `SD.Weather`, 하루 순환 `SD.Day` |
| `core/player.js` | 농부 조작 `SD.Player` + 기본 도구 5종 |
| `core/maps.js` | 농장 `Farm`, 농가 `FarmHouse`, 농장 주요 지점 `SD.FARM` |
| `core/save.js` | 저장 `SD.Save`, 설정 `SD.Settings` |
| `core/ui.js`, `ui_hud.js`, `ui_menus.js`, `ui_title.js` | UI (최소 기능판 — UI 단계가 교체/확장, §12) |
| `core/debug.js` | `window.DBG` |
| `core/main.js` | 게임 수명주기 `SD.Game`, 고정 간격 루프, `SD.boot` |
| `mods/*.js` | 모듈 7개 (fishing, mines, town, crafting, animals, home, ambient) |
| `core/boot.js` | `SD.boot()` — 반드시 마지막 |

부팅 순서: 모든 스크립트 로드 → `SD.boot()` → 렌더러·입력 준비 → **각 모듈 `init(SD)`** (등록 순서) → 훅 `'ready'` → 타이틀.
새 게임: `G` 생성 → 각 모듈 `newGame(G)` → 모든 지역 생성(`populate`) → 훅 `'newGame'` → `'gameStart'(G, true)` → `'firstDay'`.

---

## 2. 모듈 등록

```js
'use strict';
SD.Mods.register({
  name: 'fishing',                // G.mods.fishing 에 상태가 저장된다
  init(SD) {                      // 부팅 때 한 번: 아이템·지역·타입·훅 등록
    SD.Items.define('bream', { name: '도미', cat: 'fish', price: 45, edible: 12, sprite: () => myFishIcon('#8aa0c8') });
  },
  newGame(G) {                    // 새 게임(또는 저장에 이 모듈 데이터가 없을 때) 초기 상태
    return { caught: {}, rodLevel: 0 };
  },
  save(state, G) { return state; },        // (선택) JSON 으로 바꿔 저장
  load(data, G) { return data; },          // (선택) 불러올 때 복원
  hooks: {                                  // (선택) 이 객체의 함수는 훅으로 자동 등록 (this = 모듈 정의)
    dayStarted(info) { /* ... */ },
    update(dt, loc) { /* ... */ },
  },
});

// 어디서든 현재 게임의 모듈 상태:
const st = SD.Mods.state('fishing');  // === SD.G.mods.fishing
```

- 상태는 **JSON 으로 저장 가능한 값**만. 밑줄(`_`)로 시작하는 키는 저장되지 않는다(연출용).
- `init` 안에서 등록한 훅에는 자동으로 모듈 이름이 붙는다(오류 로그에 `@fishing`).

### 훅 API (`SD.Mods`)

```js
const off = SD.Mods.on('timeChanged', (time) => { ... }, { priority: 10 });  // 높은 priority 먼저
SD.Mods.once('newDay', (info) => { ... });
off();                                   // 해제
SD.Mods.emit('myEvent', a, b);           // 전부 호출
SD.Mods.first('toolUse', ctx);           // 순서대로 호출, 처음 truthy 를 반환한 값 (= 처리됨)
SD.Mods.reduce('sellPrice', 100, st);    // 값을 차례로 바꾼다 (undefined 반환 = 그대로)
SD.Mods.safe('라벨', fn, ...args);       // try/catch 로 한 번 실행
```

---

## 3. 게임 상태 `SD.G`

```js
G = {
  seed, day /*1~28*/, season /*0 봄 1 여름 2 가을 3 겨울*/, year, time /*분: 360(6:00) ~ 1560(26:00=새벽 2시)*/,
  money, weather /*'sun'|'rain'|'storm'|'snow'|'wind'*/, tomorrow /*내일 날씨(예보)*/, luck /*-0.1~0.1*/,
  inv /*36칸*/, sel /*툴바 칸 0~11*/, row /*툴바 줄 0~2*/,
  skills: { farming: { xp, lvl }, ... }, levelUps: [{ skill, level }],
  shipping: [{ id, n, q }] /*오늘 출하함*/, lastShipping,
  stats: { totalEarned, harvested: {작물id: n}, obtained: {아이템id: n}, shippedItems: {id: n}, foraged, treesFelled },
  flags: {}, mods: { 모듈명: 상태 }, daysPlayed,
  player: { loc, x, y /*발 위치(월드 px)*/, dir, energy, maxEnergy /*270*/, health, maxHealth /*100*/, name, farmName, look },
}
```

자주 쓰는 도우미: `SD.Time.dateText()`, `SD.Time.weekday()`, `SD.util.timeText(min)`, `SD.util.fmt(n)`(천 단위), `SD.util.withJosa('똥', '을', '를')`.

---

## 4. 아이템 · 도구 · 인벤토리

### 아이템 정의

```js
SD.Items.define('trout_soup', {
  name: '송어 수프',
  cat: 'cooking',            // SD.CATEGORIES 키: vegetable fruit flower forage animal artisan fish mineral gem ore bar
                             //   resource cooking seed fertilizer crafting tool weapon monster bait tackle trash artifact furniture ring misc
  price: 100,                // 판매가(보통 품질). 품질 배수: 은 1.25, 금 1.5, 이리듐 2
  edible: 40,                // 원작 식용도: 기력 = 2.5×값(+품질), 체력 = 기력×0.45. 없으면 못 먹음, -300 이하도 못 먹음
  stack: 999,                // 최대 겹치기
  desc: '따끈한 수프.',
  sprite: () => SD.Art.iconFrom((S) => { /* 16×16 Shp 그리기 */ }),   // 캔버스 또는 캔버스를 만드는 함수(한 번만 호출)
  ship: 'fishing',           // (선택) 정산 묶음 덮어쓰기: farming foraging fishing mining other
  drink: true,               // (선택) 마시는 애니메이션
  // 손에 들고 '도구 쓰기'를 누르면:
  onUse(ctx) { },            // 일반 사용 (먹기 대신)
  place(ctx) { },            // 설치형 (ctx.loc, ctx.tx, ctx.ty). canPlace(ctx) 를 주면 초록/빨강 칸 표시
  canPlace(ctx) { return SD.Obj.canPlace(ctx.loc, ctx.tx, ctx.ty); },
});
SD.Items.get(id); SD.Items.name(stack); SD.Items.icon(stack); SD.Items.sellPrice(stack); SD.Items.energyOf(stack);
SD.Items.extend('parsnip', { desc: '...' });   // 기존 정의 수정
```

훅: `'sellPrice'(가격, stack, def)` reduce, `'itemAdded'(id, n, q, {silent, first})`, `'firstObtain'(id, q)`, `'inventoryChanged'`.

### 인벤토리 (`SD.Inv`)

칸 = `{ id, n, q, lvl?, water?, data? }`. 도구·`data` 가 있는 칸은 겹치지 않는다.

```js
SD.Inv.add('wood', 10);                 // 넣고 남은 개수 반환 (HUD 획득 알림 자동)
SD.Inv.add('carp', 1, 2, { data: { size: 31 } }, { silent: true });
SD.Inv.give('stone', 5);                // 못 넣은 만큼은 발밑에 떨어뜨림
SD.Inv.canAdd(id, n, q); SD.Inv.count(id); SD.Inv.has(id, n); SD.Inv.remove(id, n);
SD.Inv.selected(); SD.Inv.selIndex(); SD.Inv.consumeSelected(1); SD.Inv.findTool('hoe');
```

### 도구 (`SD.Tools`)

레벨: `SD.TOOL_LEVELS` = 기본/구리/강철/금/이리듐(머리 색 포함). 도구 아이템 칸에 `lvl` 이 있다.

```js
SD.Tools.define('rod', {
  name: '대나무 낚싯대',
  nameFor: (lvl) => ['대나무 낚싯대', '유리섬유 낚싯대', '이리듐 낚싯대'][lvl],
  skill: 'fishing', energy: 8, levels: 2, cat: 'tool',
  icon: (lvl) => myRodIcon(lvl),         // 16×16
  held: (lvl) => myRodHeld(lvl),         // (선택) 손에 든 그림 24×24, 잡는 점 SD.Art.TOOL_GRIP_HELD
  use(ctx, tdef) {                       // 도구 쓰기 버튼
    SD.Farmer.play(ctx.p, 'cast', { stack: ctx.stack, onDone: () => { ... } });
  },
  onTile(c) { },                         // (선택) SD.Player.applyToolAt 의 마지막 기본 처리
});
```

도구 칸에 적용하기: `SD.Player.applyToolAt(ctx, tx, ty)` → 순서: 훅 `'toolUse'(ctx)` → 오브젝트 `onTool` → 큰 오브젝트 → 지형요소 → 캐릭터 → `tdef.onTile`. `ctx = { p, loc, stack, item, tool, lvl, power, tx, ty, dir, weapon, pressed }`.
기력: `SD.Stats.useEnergy(SD.Skills.energyCost(2, 'mining'))` (원작: 기본 - 레벨×0.1).
차지형 도구: `SD.Player.startCharge(ctx, tdef)` 후 `tdef.release(ctx, tiles, level)` 가 불린다. 범위: `SD.Player.areaTiles(tx, ty, dir, level)` (1, 3, 5, 3×3, 3×6).

---

## 5. 지역 (Location) 과 워프

### ASCII 지도로 지역 만들기

```js
SD.World.define({
  id: 'Town', name: '뿌지직 마을', outdoor: true, music: 'town',
  map: [
    'TTTTTTTTTTTTTTTT',
    'T,,,,,,,,,,,,,,T',
    'T,..........ww,T',
    'pp.....##...ww,T',     // 지도 밖으로 나가는 길은 워프로
    'T,,,,,,,,,,,,,,T',
    'TTTTTTTTTTTTTTTT',
  ],
  // 기본 범례: . 잔디(갈 수 있음) p 흙(갈 수 있음) , 흙길(못 갊) w 물 C 절벽 s 계단 T 숲(막힘) # 검정
  //            f 마루 W 벽지 B 판벽 X 벽 위 m 문 매트
  legend: {
    '#': { tile: 'path', solid: true },                      // 속성 덮어쓰기: solid diggable water step noSpawn
    'T': { tile: 'forest', then: (loc, x, y) => { /* 이 칸에 장식 등 추가 */ } },
  },
  large: [{ t: 'myShopBuilding', x: 6, y: 2, w: 3, h: 2 }],   // 정적 큰 오브젝트 (저장 안 함)
  warps: [
    { id: 'west', x: 0, y: 3, w: 1, h: 1, to: 'Farm', dir: 'left' },                  // 밟으면 워프
    { id: 'shop', x: 7, y: 3, to: 'Shop', tx: 4, ty: 8, dir: 'up', action: true, sound: 'door' },  // 행동 키로
  ],
  entries: { Farm: { x: 1, y: 3, dir: 'right' } },   // 다른 지역에서 tx/ty 없이 올 때 도착 지점
  spawn: { x: 5, y: 3, dir: 'down' },
  forage: { max: 4, perDay: [0, 2], table: (season) => ['wild_horseradish'] },   // (선택) 매일 채집 똥
  debrisPerDay: [0, 2],                // (선택) 매일 잡초·돌·나뭇가지
  showHealth: true,                    // (선택) 체력 바 표시 (광산)
  noWeather: false, anySeason: false,  // 실내 아닌데 날씨 없음 / 온실(계절 무관 성장)
  noSave: false,                       // true 면 저장 안 함 (광산 층 등)
  populate(loc, rng) { /* 새 게임 때 한 번: 오브젝트 배치 */ },
  setup(loc) { /* 매번 만들 때 (불러오기 포함) */ },
  update(loc, dt) { }, onEnter(loc, prev) { }, onLeave(loc, next) { },
  ambient(loc, timeF, darkStart) { return [r, g, b] /* 또는 null */ },   // 조명 색 덮어쓰기
  lightsFn(loc, add) { add({ x, y, r: 64, color: '#ffd890', a: 0.9 }); },
  drawGround(V, loc) { }, drawFront(V, loc) { }, bakeChunk(g, loc, cx, cy, season) { },
});
```

- 실내는 `outdoor: false` → 날씨 없음, 실내 조명 곡선(밤에 어두워지고 광원이 밝힘).
- 농장 출구 워프는 이미 `'Town'`(동), `'Forest'`(남), `'Mountain'`(북)을 가리킨다. **그 id 로 지역을 정의하기만 하면 열린다.** 도착 지점은 각 지역의 `entries.Farm`. 농장으로 돌아오는 도착 지점은 농장 `entries`: `Town`/`BusStop` → (61,15), `Forest` → (30,49), `Mountain`/`Backwoods` → (9,2).
- 목적지를 바꾸려면: `SD.World.retargetWarp('Farm', 'east', { to: 'BusStop' })` (워프 id 또는 기존 to 로 찾음).
- 워프 추가: `SD.World.addWarp('Farm', { x: 20, y: 6, to: 'Greenhouse', action: true })`.
- 이동: `SD.World.warp(id, tx?, ty?, dir?, { sound, fast, onArrive })` (페이드), `SD.World.place(id, tx, ty, dir)` (즉시).
- 지역 얻기: `SD.World.get(id)`, 현재: `SD.World.current`, 모두: `SD.World.all()`. 다시 만들기: `SD.World.reset(id)`, 지우기: `SD.World.remove(id)`.
- 훅: `'locationCreated'(loc, isNew)`, `'locationLoaded'(loc)`, `'locationEnter'(loc, prev)`, `'locationLeave'(loc, next)`, `'locationMusic'(id, loc)` reduce, `'locationSeason'(season, loc)` reduce(그림 계절).

### Location 인스턴스

```js
loc.w, loc.h, loc.outdoor, loc.def, loc.state /*모듈용 저장 객체*/
loc.tileAt(x, y) /*타일 id*/, loc.tileProp(x, y, 'solid'), loc.isWater(x, y), loc.isDiggable(x, y)
loc.setTile(x, y, id) /*저장 안 됨*/, loc.editTile(x, y, id) /*저장됨*/
loc.objAt / setObj / removeObj (1칸 오브젝트: 돌·잡초·채집물·기계)
loc.featAt / setFeat / removeFeat (지형요소: dirt(괭이흙+작물)·grass·tree·바닥재)
loc.large /*[]*/ addLarge(o) removeLarge(o) largeAt(x, y)   (여러 칸: 덩어리·덤불·건물·가구)
loc.items /*바닥 아이템*/, loc.chars /*캐릭터*/, loc.temp /*임시 스프라이트*/, loc.decor /*정적 장식*/
loc.lights /*정적 광원*/, loc.warps
loc.isPassable(x, y), loc.isOccupied(x, y, { ignoreGrass, ignoreDirt }), loc.rectBlocked(x0, y0, x1, y1, who)
loc.randomTile(rng, test)
```

### 지형 타일 추가

```js
SD.Tiles.define('sand', {
  solid: false, diggable: true, water: false, step: 'dirt',   // 걸음 소리: grass dirt wood stone snow water
  bake(g, px, py, T) { /* 16×16 을 (px,py) 에. T.season, T.x, T.y, T.at(dx,dy) 이웃 id */ },
  anim(g, px, py, T, t) { /* (선택) 매 프레임 (물 반짝임 등) */ },
});
SD.Tiles.PAL[season]   // 계절 팔레트 { grass:[5], dirt:[4], forest:[3], flowers }
```

---

## 6. 오브젝트 · 지형요소 · 큰 오브젝트

인스턴스는 평범한 JSON 객체 `{ t: '타입', x, y, ... }` 이고 행동은 타입이 준다.

```js
SD.ObjTypes.define('keg', {
  layer: 'object',              // 'object'(1칸) | 'feature'(지형) | 'large'(여러 칸, w,h)
  passable: false,              // 또는 (o, who, loc) => bool. large 는 blocks(o, tx, ty) 로 칸별 지정
  draw(V, o, loc) {
    const px = o.x * 16, py = o.y * 16;
    V.add(py + 15, (g) => g.drawImage(kegSprite(o), px, py - 16));   // y정렬: 밑동 y 를 키로
  },
  drawDecal(V, o, loc) { },     // (선택) 바닥 데칼 레이어
  shadow(o) { return [o.x * 16 + 8, o.y * 16 + 14, 12, 4]; },     // [cx, cy, w, h, alpha?]
  onTool(o, ctx) { if (ctx.tool === 'pick') { ctx.loc.removeObj(o.x, o.y); SD.Inv.give('keg_item'); return true; } return false; },
  onAction(o, ctx) { /* 행동 키 */ return true; },
  onTouch(o, loc, who) { },     // 닿거나 스칠 때 (풀·작물 흔들기)
  dayEnd(o, loc, info) { },     // 잠들 때 (작물 성장 전)
  dayStart(o, loc, info) { return 'remove'; /* 지우려면 */ },
  light(o, loc, add) { add({ x: o.x * 16 + 8, y: o.y * 16, r: 40, color: '#ffb050', a: 0.8, flicker: 0.1 }); },
  save: true,                   // false 면 저장 안 함
});
loc.setObj(10, 12, { t: 'keg', ready: false });
SD.Obj.canPlace(loc, x, y, { allowDirt, w, h });   // 설치 가능 검사 (훅 'canPlace' reduce)
SD.Obj.shake(o, 0.2, dir); SD.Obj.shakeAngle(o);   // 흔들림 (그릴 때 각도로 사용)
SD.Obj.drawRot(g, img, 밑동x, 밑동y, ox, oy, 각도);
```

코어 타입: `stone twig weed forage`(object), `grass tree dirt`(feature), `clump bush farmhouse shippingBin bed tv kitchen fireplace table lamp rug window decorTree`(large).

- 나무: `{ t:'tree', kind:'oak'|'maple'|'pine', stage:0~4, hp, stump, hasSeed }`. 훅 `'treeFelled'(o, ctx)`, `'treeShake'(o, ctx)`.
- 덩어리: `{ t:'clump', kind:'stump'|'log'|'boulder' }` (각각 구리 도끼·강철 도끼·강철 곡괭이 이상). 훅 `'clumpBroken'`.
- 잡동사니 깨짐: `'objectBroken'(o, ctx)`. 풀 베기: `'grassCut'(o, ctx)` 를 `first` 로 부른다 — **건초를 주고 true 를 반환하면** 기본(10% 섬유)을 건너뛴다.
- 집 기능 훅: `'tv'(o, ctx)`, `'kitchen'(o, ctx)` — true 를 반환하면 기본 문구 대신 모듈 처리.

### 캐릭터 (NPC · 동물 · 몬스터)

```js
SD.Chars.define('npc', {
  box: [10, 6],                         // 발 기준 충돌 상자 (막히지 않게 하려면 c.passable = true)
  update(c, dt, loc) {                  // 현재 지역의 캐릭터만 매 프레임
    SD.Chars.move(c, loc, c.vx * dt, c.vy * dt);
  },
  draw(V, c, loc) {
    const pose = SD.Farmer.walkPose(c.walkT || 0, c.moving);
    V.add(c.y, (g) => g.drawImage(SD.Farmer.frame(c.look, c.dir, pose), Math.round(c.x - 16), Math.round(c.y - 44)));
  },
  shadow(c) { return [c.x, c.y - 1, 12, 4]; },   // false 면 그림자 없음
  onAction(c, ctx) { SD.UI.dialogue({ speaker: '뿌직이 아저씨', portrait: () => portraitOf('pierre'), text: '어서 와요!' }); return true; },
  onTool(c, ctx) { return false; },     // 무기에 맞을 때 등
  light(c, loc, add) { },
  save: false,                          // NPC 는 보통 모듈이 매일 다시 놓으므로 저장하지 않음
});
SD.Chars.add(SD.World.get('Town'), { t: 'npc', id: 'pierre', x: 8 * 16 + 8, y: 6 * 16 + 12, dir: 'down', look: { ...SD.DEFAULT_LOOK, hair: '#555', beard: '#555', shirt: '#4a8ad0', hat: 'cap' } });
SD.Chars.at(loc, tx, ty); SD.Chars.near(loc, x, y, r); SD.Chars.remove(loc, c);
```

다른 지역 캐릭터(일정표 이동)는 `'update'` 훅에서 모듈이 직접 움직인다.

### 바닥 아이템 · 임시 스프라이트

```js
SD.World.dropItem(loc, 월드x, 월드y, 'copper_ore', 3, 0, { noMagnetFor: 0.5, parts: 3 });   // 튕기며 흩어지고 자석처럼 빨려온다
SD.Temp.define('bobber', { update(e, dt, loc) { return e.t < 3; /* false 면 제거 */ }, draw(V, e, loc) { V.add(e.y, (g) => ...); } });
loc.temp.push({ kind: 'bobber', x, y, t: 0 });
```
훅 `'magnetRadius'(px)` reduce (자석 반지 등).

---

## 7. 농사

```js
SD.Crops.define('cactus_poop', {
  name: '선인장똥', seasons: [0, 1, 2], phases: [2, 2, 2, 2], regrow: 3, seedPrice: 150, price: 75, cat: 'fruit', edible: 20,
  yield: { min: 1, extra: 0.1 }, trellis: false, flower: false, giant: false, scythe: false, rare: false,
  tints: null,                       // 꽃이면 ['#e84', ...] 심을 때 무작위 색
  look: {
    color: '#7ab84a', seed: '#a0a060', seedShape: 'round',   // round oval flat big long
    kind: 'normal',                  // 성장 단계 기본 그림: normal leafy bush tall trellis flower
    mature(S, tint, def) { const t = SD.Art.poopBody(S, 8, 28, [[14, 6], [11, 4], [8, 4], [4, 3]], '#7ab84a'); SD.Art.face(S, 8, t[0].top + 1); },
    icon(S, tint, def) { /* 16×16 수확 아이콘: 똥만 */ },
    grow(S, frac, look) { /* (선택) 성장 단계 직접 그리기 */ },
  },
});
// 자동으로 '선인장똥'(cactus_poop) 과 '선인장똥 씨앗'(cactus_poop_seed) 아이템이 생긴다.
```

흙 = `{ t:'dirt', wet, fert, crop: { id, phase, day, dead, regrowLeft, tint } }`.

```js
SD.Farming.till(loc, x, y); SD.Farming.water(loc, x, y); SD.Farming.plant(loc, x, y, seedId) /* true | 실패 이유 문자열 */;
SD.Farming.harvest(dirt, loc, 'hand' | 'scythe'); SD.Farming.isMature(crop); SD.Farming.growFull(dirt);
SD.Farming.cropQuality(dirt);   // 원작 공식 (농사 레벨 + 비료)
SD.Farming.spawnForage(loc, n, { table: ['common_mushroom'], season, test(x, y) });   // 채집 똥 놓기
SD.Farming.ship(stack);          // 출하 목록에 추가 (상자 UI 등에서)
```

훅:
- `'cropFertQuality'(0, dirt)` reduce — 비료 품질 단계(1 기본, 2 고급, 3 최고급). 비료는 `dirt.fert = 'quality_fertilizer'` 처럼 저장.
- `'cropPhases'(phases[], dirt, def)` reduce — 속성장 비료가 단계 일수를 줄인다.
- `'cropQuality'(q, dirt)`, `'harvestResult'({item, n, q}, dirt, loc, def)` reduce.
- `'harvest'({loc, x, y, dirt, crop, def, item, n, q, how})`, `'plant'(loc, x, y, dirt, def)`, `'till'`, `'water'`, `'cropGrow'(dirt, loc)`, `'cropWither'(dirt, loc)`, `'dirtDayStart'(dirt, loc, info)`, `'drawFertilizer'(V, dirt, loc)`.
- `'canTill'(true, loc, x, y)` reduce, `'canPlant'(loc, x, y, def)` first → 문자열이면 그 이유로 막음.
- 스프링클러: `'dayStarted'` 에서 주변 흙의 `wet = true`. 거대 작물: `'dayStarted'` 에서 3×3 다 자란 `giant` 작물을 지우고 `loc.addLarge(...)`.

채집 똥: `SD.Forage.define(id, { name, seasons, price, edible, icon(S) })`, `SD.Forage.forSeason(s)`. 품질은 `SD.Farming.forageQuality()` (훅 `'forageQuality'(null, lvl)` 로 이리듐 고정 등).

---

## 8. 스킬 · 기력 · 체력

```js
SD.Skills.addXP('fishing', 12);  SD.Skills.level('fishing');  SD.Skills.xp('fishing');  SD.Skills.progress('fishing');
SD.Skills.define('cooking', { name: '요리', color: '#e84', desc: '...' });   // 새 스킬
SD.Stats.useEnergy(4); SD.Stats.addEnergy(50); SD.Stats.damage(6, { source: 'slime' }); SD.Stats.heal(20);
```
- 레벨 기준 XP: 100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000. 레벨은 바로 오르고 `G.levelUps` 에 쌓여 **밤 정산 뒤 레벨업 화면**으로 나온다. 레벨업 화면 문구 추가: 훅 `'levelUpText'([], skill, level)` reduce (예: 새 제작법 이름).
- 훅: `'xpGain'(n, skill)` reduce, `'skillLevel'(lvl, skill)` reduce(음식 버프), `'levelUp'(skill, lvl)`, `'energyUse'(n)` reduce, `'playerDamage'(n, opts)` reduce, `'playerDefeated'(opts)` first (true 면 기본 기절 대신 모듈 처리 — 광산에서 아이템 잃기).
- 기력 0 이하 → 기진맥진(느려짐), -15 미만 → 기절.

---

## 9. 시간 · 날씨 · 하루 끝 파이프라인

- 게임 10분 = 현실 7초. `SD.Time.update` 는 메뉴가 열리면 멈춘다. 훅 `'timeChanged'(time)` (10분마다), `'timePaused'(false)` reduce (이벤트 중 시간 정지).
- 자정 경고, 새벽 2시 `SD.Day.passOut('late')` → 쓰러짐 애니메이션 → 하루 끝(집 밖이면 소지금 10%, 최대 1000G — 훅 `'passOutFine'`).
- 잠: 침대에 닿거나 행동 키 → `SD.Day.askSleep()`. 직접: `SD.Day.sleep()`.
- 날씨: `G.weather`(오늘), `G.tomorrow`(예보 — TV 가 읽는다). 훅 `'weatherTomorrow'(w, season, day, year)` reduce (축제일 맑음 등). 계절 첫날은 항상 맑음, 겨울 비 → 눈.
- 행운: `G.luck` (-0.1~0.1), 훅 `'dailyLuck'(v)` reduce.
- 번개: 폭풍 중 무작위. 훅 `'lightning'(loc)` first → true 면 기본 번쩍임 대신 모듈 처리(피뢰침 등).

**하루 끝 순서** (`SD.Day.process`, 화면이 까만 동안):

1. `'dayEnding'(info)` — 밤사이 처리(기계 완성, 동물 생산물, 편지 준비). `info.addEarning(group, 금액, 설명, 아이콘id)` 로 정산 표에 추가 가능.
2. 모든 지역의 오브젝트 `dayEnd` (작물: 물 준 흙만 자람).
3. 출하함 정산: 아이템별 `SD.Items.sellPrice × n` → 분류 묶음(농사·채집·낚시·광산·기타). `'shippingTally'(info, lines)` 로 더 추가.
4. 기절 벌금 → 날짜 증가(28일 → 다음 계절, 겨울 → 다음 해) → 오늘 날씨 = 예보, 새 예보 굴리기, 행운.
5. `'dayStarted'(info)` — 날짜가 바뀐 직후 (`info.day/season/year/weather/newSeason`).
6. 모든 지역 `dayStart` (계절 시듦, 비 → 흙 젖음, 나무 성장/씨앗 퍼짐, 풀 번짐, 덤불 열매, 채집 똥·잡동사니 생성).
7. 기력·체력 회복(자정 넘어 자면 덜, 기절이면 절반), 오전 6시, 침대 옆에서 깸 (훅 `'bedSpot'({loc, x, y})` reduce — 집 업그레이드).
8. 정산 화면 → 레벨업 화면 → **자동 저장** → 화면이 밝아짐 → `'newDay'(info)`.

`info.note('문구')` 는 정산 화면 아래에 표시된다.

---

## 10. 그리기 · 조명 · 입자

### 레이어 순서와 훅

바닥(청크로 구워 둠) → `'draw:ground'` → 바닥 데칼(괭이흙·러그) → `'draw:decals'` → 도구 대상 칸 → **그림자** → **y정렬 스프라이트**(`'draw:sprites'` 에서 `V.add(sortY, fn)`) → 앞 레이어(`drawFront`, `'draw:front'`) → 입자(world) → 날씨(`'draw:weather'`) → **조명 곱하기** → 빛 입자(glow) → `'draw:afterLight'` → `'draw:world'` → 월드 글자 → UI(`'draw:ui'(g, UI)`).

`V` (그리기 문맥): `V.ctx`(월드 좌표, 1 = 월드 픽셀), `V.t`(연출 시간), `V.loc`, `V.season`, `V.player`, `V.windy`, `V.x0..V.y1`(보이는 타일 범위), `V.add(sortY, g => ...)`, `V.shadow(cx, cy, w, h, a)`.

```js
SD.Mods.on('draw:sprites', (V, loc) => {
  if (loc.id !== 'Beach') return;
  V.add(10 * 16 + 15, (g) => g.drawImage(crabSprite, 10 * 16, 9 * 16));
});
```

### 조명

- 밤 색조: `SD.Render.ambient(loc)` (늦은 오후 황금빛 → 노을 → 보랏빛 → 푸른 밤, 비 오면 회색). 훅 `'ambient'(null, loc, timeF)` reduce 로 덮어쓰기.
- 광원: `{ x, y, r, color, a, flicker, nightOnly, always }` 를 `loc.lights` 에 넣거나, 타입의 `light(o, loc, add)`, 지역 `lightsFn`, 또는 훅 `SD.Mods.on('lights', (loc, add) => add({...}))`.
- `SD.Render.nightAmount()` 0~1, `SD.Render.windowGlow()`, `SD.Render.skyColor()`, `SD.Render.darkStart()`.

### 입자 · 글자 · 흔들림 (`SD.FX`, 월드 좌표)

```js
SD.FX.burst(x, y, { colors: ['#fff', '#8cf'], n: 10, speed: 40, up: 50, life: 0.6, layer: 'glow' });
SD.FX.debris(x, y, ['#b8b4aa', '#8e8a82'], 10, { small: true });   // 돌·나무 파편
SD.FX.leaves(x, y, 8, ['#5fae3e'], { burst: true, fall: true, small: true, spread: 20 });
SD.FX.splash(x, y, { big: true }); SD.FX.ripple(x, y, 6); SD.FX.water(x, y, 8);
SD.FX.smoke(x, y); SD.FX.dust(x, y, 4); SD.FX.sparkle(x, y);
SD.FX.pop(x, y, itemId, q);                         // 수확 팝 → 농부에게 날아감
SD.FX.flyItem(x0, y0, x1, y1, itemId, q);           // 포물선 비행
SD.FX.text(x, y, '+50 기력', { color: '#a8f070' }); SD.FX.damage(x, y, 12);   // 튀어 오르는 숫자
SD.FX.shake(4, 0.4); SD.FX.flash('#ffffff', 0.3, 0.8);
SD.FX.add({ kind: 'free', x, y, life: 1, update(q, dt) { }, draw(g, q, V) { } });   // 직접 만든 입자
```

### 그래픽 도우미 (`SD.gfx`, `SD.Art`)

```js
const X = SD.gfx;
X.canvas(w, h); X.ctx(c);                       // 픽셀 스무딩 끔
X.fromRows(['..aa..', '.abba.'], { a: '#8a5a2b', b: '#c08a50' });
X.outline(canvas);                               // 자동 외곽선 = 이웃 채움색의 어두운 톤 (원작 스타일)
X.ramp('#5fae3e');                               // [밝음, 기본, 그늘, 깊은 그늘]
X.dark(c, 0.3); X.light(c, 0.3); X.mix(a, b, t);
X.shadeMask(g, w, h, (x, y) => inside, ramp);   // 마스크 명암
X.cached('my:key', () => makeSprite());          // 한 번만 만들고 재사용 (매 프레임 생성 금지)
X.shadow(g, cx, cy, w, h, 0.28); X.rotateNearest(src, ang, cx, cy); X.flipX(src);
SD.Art.iconFrom((S) => { S.ellipse(8, 10, 6, 4, X.ramp('#88c')); });   // 16×16 아이콘 (Shp: 명암+내부 외곽선)
SD.Art.poopBody(S, cx, bottomY, [[14, 6], [11, 4], [8, 4], [4, 3]], '#8a5a2b', { tex, tip, pw });
SD.Art.face(S, cx, y, { small, closed, eye, mouth, blush });
```

---

## 11. 농부 애니메이션 (`SD.Farmer`)

- 프레임: `SD.Farmer.frame(look, dir, pose)` → 32×48 캔버스, 발 = (16, 44). NPC 도 같은 리그.
  `look = { skin, hair, hairStyle: 'short'|'long'|'bun'|'ponytail'|'spiky'|'bald', eyes, shirt, pants, overalls, shoes, hat: null|'straw'|'cap'|'beanie'|'wide', hatColor, hatBand, beard, glasses, blush }`.
  `pose = { legs: 0~3, bob, swing, hands: { L:[x,y], R:[x,y] } (앞/뒤) | { F:[x,y], B:[x,y] } (옆), armsFront, blink }` (손 좌표는 캔버스 좌표; `[x, y, 팔꿈치x, 팔꿈치y]` 로 꺾을 수 있음).
- 걷기: `SD.Farmer.walkPose(시간, moving)` — 8fps 4프레임, 디딜 때 1px.
- 재생: `SD.Player.anim(name, opts)` (= `SD.Farmer.play(SD.G.player, name, opts)`). 재생 중에는 이동이 막힌다(`lock`).
- 기본 애니메이션: `tool`(괭이·곡괭이·도끼 400ms, 0.7 지점 onHit), `water`, `swing`(낫·검 반원+잔상, 0.35 지점 onHit), `holdUp`(머리 위로 들기), `eat`, `drink`, `pickup`, `passOut`, `holdTool`(도구를 내민 채 유지, loop).
  opts: `{ stack, icon, iconKey, grip, onHit, onDone, events: [{ at: 0..1, fn }], dur, item, angle }`.

```js
SD.Farmer.define('cast', {
  dur: 0.5, lock: true,
  pose(p, k, a) { return { hands: k < 0.5 ? { F: [12, 16], B: [11, 17] } : { F: [20, 26], B: [19, 27] } }; },   // 캔버스 좌표
  front(g, p, k, a, dir) { SD.Farmer.drawTool(g, rodHeld, 'rod', p.x + 4, p.y - 26, -60 + k * 120, SD.Art.TOOL_GRIP_HELD, dir === 'left'); },
  behind(g, p, k, a, dir) { },
  events: [{ at: 0.6, fn(p, a) { SD.Sound.play('swish'); } }],
});
SD.Player.anim('cast', { stack: SD.Inv.selected(), onDone: () => startBite() });
SD.Player.holdUp('trout', '송어를 잡았다!');   // 머리 위로 들어 올리기 + 팡파르
```

도구 회전 스프라이트: `SD.Farmer.drawTool(g, icon, cacheKey, 손x, 손y, 머리각도(도), grip, flip)` — 22.5° 단위로 원본 해상도에서 회전해 캐시한다.

---

## 12. UI API (최소 기능판 — UI 단계가 같은 이름으로 확장/교체)

UI 는 캔버스 위 픽셀 UI 다. 좌표는 **기기 픽셀**, 크기는 `UI.u`(UI 픽셀 1칸의 기기 픽셀 수) 배수, 글자는 `UI.tu` 배(갈무리11 = 12px×tu).

```js
SD.UI.hud('파스닙똥 씨앗을 샀어요', { icon: 'parsnip_seed', kind: 'info' | 'good' | 'error', merge, count });   // 왼쪽 아래 알림
SD.UI.say('지지직...', onDone);                                                       // 글상자
SD.UI.dialogue({ speaker: '뿌직이 아저씨', portrait: () => canvas64, pages: ['안녕!', '오늘 날씨 좋네.'], choices: [{ label: '응', fn }], onDone });
//   text: '첫 쪽#$b#둘째 쪽' 도 된다. 타자기 출력, 클릭/확인으로 다음 쪽, 선택지는 위아래+확인/클릭
SD.UI.question('잠을 잘까요?', [{ label: '잔다', fn: () => ... }, { label: '아니요' }]);
SD.UI.openMenu('bag');                                                                   // 탭: bag skills social map crafting collection options exit
SD.UI.addTab({ id: 'social', name: '관계', order: 20, icon: () => canvas8x8,
  draw(g, rect /*[x,y,w,h] 기기px*/, menu) { }, onPointer(type /*'down'|'up'|'move'|'wheel'*/, x, y, btn, rect, menu) { }, onKey(act, menu) { return false; } });
//   social/map/crafting/collection 은 '준비 중' 자리 탭이 있다 — 같은 id 로 addTab 하면 바뀐다.
SD.UI.openShop({ title: '뿌지직 상회', owner: '뿌직이 아저씨', portrait: () => canvas, greeting: '어서 오세요!',
  stock: [{ id: 'parsnip_seed', price: 20 }, { id: 'stone', price: 5, stock: 10 }], sell: (st) => st.cat !== 'fish', onBuy(item, n) { }, onSell(st, n) { } });
SD.UI.push(screen); SD.UI.pop(screen); SD.UI.top(); SD.UI.closeAll(); SD.UI.isOpen('menu'); SD.UI.blocking();
//   screen = { id, blocking: true(게임 멈춤), update(dt), draw(g), onKey(act, e, key) → true(소비), onPointer(type, x, y, btn, e) → true, onOpen, onClose }
SD.UI.frame(g, x, y, w, h, 'wood' | 'paper' | 'dark' | 'slot');   // 나무 9-슬라이스 액자
SD.UI.text(g, '글', x, y, { size, small, color, align, shadow }); SD.UI.textOutlined(...); SD.UI.wrap(g, text, maxW) → 줄 배열; SD.UI.measure; SD.UI.lineH()
SD.UI.drawStack(g, stack, x, y, scale); SD.UI.tooltip(g, stack, x, y); SD.UI.starIcon(q); SD.UI.drawHand(g, x, y); SD.UI.img(g, canvas, x, y, scale)
SD.UI.daySummary(summary, onDone); SD.UI.showTitle({ hasSave, onNew, onContinue });
SD.HUD.draw(g); SD.HUD.icon('sun' | 'rain' | 'storm' | 'snow' | 'wind' | 'moon' | 's0'~'s3' | 'coin' | 'energy' | 'heart');
```

UI 단계가 교체할 때 지켜야 할 계약: 위 함수 이름·인자, `SD.UI.onKey/onPointer/update/draw/layout/blocking/title/screens/messages/hoverStack/mouse`, `SD.HUD.draw/onPointer/toolbarRect`. 입력은 `SD.UI.onKey` → 화면이 소비하지 않으면 게임(`SD.Input`).

---

## 13. 입력 (`SD.Input`)

동작: `up down left right use action menu cancel confirm slot0..slot11 rowNext rowPrev slotPrev slotNext mute`.
키: WASD/방향키 이동, C/스페이스/왼클릭 도구(꾹 = 반복·차지), X/F/오른클릭 행동, E/I 메뉴, Esc 취소/메뉴, Enter 확인, 1~9·0·-·= 툴바, Tab/Shift+Tab 줄, Q/R·휠 칸 이동, M 소리. 거친 포인터(휴대폰)에서는 방향 패드 + 도구/행동/메뉴 버튼.

```js
SD.Input.down('use'); SD.Input.pressed('action'); SD.Input.consume('action');
SD.Input.mouse   // { x, y (CSS px), wx, wy (월드), tx, ty (칸), inside, left, right, type }
SD.Input.mouseActive(); SD.Input.bind('g', 'myAction');
SD.Player.target()   // 도구·행동 대상 칸 (마우스가 주변 1칸이면 그 칸, 아니면 바라보는 칸)
```

행동 키 처리 순서(`SD.Player.tryAction`): 대상 칸 → 바라보는 칸 → 내 칸, 각 칸마다 훅 `'action'(ctx)` → 캐릭터 `onAction` → 오브젝트 → 큰 오브젝트 → 지형요소 → 행동 워프. 아무것도 없으면 손에 든 음식을 먹을지 묻는다.
도구 쓰기(`SD.Player.useSelected`): 훅 `'useItem'(ctx)` → 도구 `use` → 씨앗 심기 → `place` → `onUse` → 먹기.

---

## 14. 소리와 음악

```js
SD.Sound.define('reel', (S, opts) => { S.tone('square', 400, 800, 0.1, 0.06); S.noise(0.1, 'bandpass', 1200, 0.1); });
SD.Sound.play('reel', { minGap: 0.05 });
// 재료: S.tone(type, f0, f1, dur, vol, delay), S.noise(dur, filterType, freq, vol, delay, q), S.sweepNoise(...), S.fart(len, pitch), S.notes([hz...], type, vol, step, dur)
// S.ctx (AudioContext), S.sfxBus, S.musicBus (음악은 여기에 연결)
```
코어 효과음: harvest(뿌지직!), harvestSmall, pop, hoe, dig, water, refill, plant, seedPlant, chop, axeMiss, treeCrack, treeFall, thud, leaves, bush, clink, stoneHit, stoneCrack, boulderCrack, grassCut, weedCut, swish, swordSwipe, toolCharge, pickup, coin, purchase, ship, binLid, eat, gulp, drink, trash, fanfare, newItem, levelUp, error, cancel, menu, menuOpen, menuClose, select, hover, tick, dialogue, smallSelect, sleep, morning, passOut, clockWarn, door, doorClose, stairs, step_grass/dirt/wood/stone/snow/water, splash, smallSplash, bubble, thunder, wind, hitEnemy, hurt, slime, crit.

음악 (ambient 모듈이 구현): `SD.Music.impl = { play(trackId, opts), stop(fade), setVolume(v), update(dt) }`. 코어는 지역에 들어갈 때 `SD.Music.play(loc.music)` 를 부르고(`'locationMusic'` reduce 로 바꿀 수 있음), 타이틀에서 `'title'`. 곡 id: `title farm town ...` (지역 정의의 `music`). 훅 `'musicChange'(id)`, `'audioReady'(ctx)`.

---

## 15. 저장

- 잠잘 때 자동 저장 (`localStorage['stardew-ddong-v2-save']`, 버전 2). 내용: `G`(밑줄 키 제외), 모든 지역의 `objects/features/large(정적 제외)/items/chars(save≠false)/state/tiles(editTile)`, 모듈 상태(`save` 를 거쳐).
- 훅 `'beforeSave'(G)`, `'saved'(data)`. 직접: `SD.Save.save()`, `SD.Save.exists()`.
- 설정(줌 2~5/자동, 볼륨)은 따로: `SD.Settings.get/set`. 훅 `'settingChanged'(k, v)`.
- 핫 리로드: `window.claude.hot` 이 있으면 스냅숏으로 진행 중인 게임을 이어간다.

---

## 16. 디버그 API (`window.DBG`) — 테스트용

`give(id, n, q)`, `giveTool(id, lvl)`, `money(n)`, `addMoney(n)`, `select(slot, row)`, `selectItem(id)`, `time(hhmm)`, `setTime(h, m)`, `day(d)`, `season(s|'summer')`, `year(y)`, `weather(w)`, `tomorrow(w)`, `luck(v)`, `warp(id, x?, y?, dir?)`, `teleport(x, y, dir)`, `face(dir)`, `skill(id, lvl)`, `energy(n)`, `health(n)`, `clearArea(x0, y0, x1, y1)`, `till(x0, y0, x1?, y1?)`, `plant(seed, x0, y0, x1?, y1?)`, `waterAll()`, `growAll()`, `setCrop(x, y, id, phase)`, `cropGallery(x0, y0)`, `sleep()`, `skipDay()`(Promise, 정산 자동 넘김), `freeze(bool)`, `step(ms)`, `anim(name, opts)`, `press(action)`, `state()`, `loc()`, `player()`, `save()`, `count(id)`, `sheet('items')`.

모듈 테스트는 `tests/<module>.js` 에 `tests/smoke.js` 처럼 만든다 (Playwright: `/opt/node22/lib/node_modules/playwright`, file:// 로 열기, 스크린샷은 `tests/out/`).

---

## 17. 전체 예: 작은 마을 모듈

```js
'use strict';
SD.Mods.register({
  name: 'town',
  init(SD) {
    SD.World.define({
      id: 'Town', name: '뿌지직 마을', outdoor: true, music: 'town',
      map: [
        'TTTTTTTTTTTT',
        'T,,,,,,,,,,T',
        'pp,,,,,,,,,T',
        'T,,,,,,,,,,T',
        'TTTTTTTTTTTT',
      ],
      warps: [{ id: 'farm', x: 0, y: 2, to: 'Farm', dir: 'left', sound: false }],
      entries: { Farm: { x: 1, y: 2, dir: 'right' } },
      setup(loc) {
        SD.Chars.add(loc, { t: 'shopkeeper', x: 8 * 16 + 8, y: 2 * 16 + 12, dir: 'down', look: Object.assign({}, SD.DEFAULT_LOOK, { hair: '#8a8a8a', beard: '#8a8a8a', shirt: '#e8d8a8' }) });
      },
    });
    SD.Chars.define('shopkeeper', {
      box: [10, 6], save: false,
      draw(V, c) { V.add(c.y, (g) => g.drawImage(SD.Farmer.frame(c.look, c.dir, {}), Math.round(c.x - 16), Math.round(c.y - 44))); },
      onAction(c) {
        SD.UI.openShop({ title: '뿌지직 상회', owner: '뿌직이 아저씨', greeting: '오늘도 좋은 똥 하루!', stock: SD.Crops.all().filter((d) => d.seasons.includes(SD.G.season) && d.seedPrice > 0 && !d.rare).map((d) => ({ id: d.seedId, price: d.seedPrice })) });
        return true;
      },
    });
  },
  newGame() { return { friendship: {} }; },
  hooks: {
    dayStarted(info) { const st = SD.Mods.state('town'); st.lastDay = info.day; },
  },
});
```

이 예는 `tests/api.js` 가 실제로 주입해 동작을 확인한다.
