'use strict';
// ════════════════════════════════════════════════════════════════════
//  코어 지도: 농장(원작 기본 농장과 비슷한 64×52 배치) + 농가 실내
//  범례: T 숲 가장자리  . 잔디(갈 수 있음)  p 흙길  w 물  C 절벽  s 돌계단
//        X 벽 위  W 벽지  B 판벽  f 마루  m 문 매트
//  동쪽 출구 → 'Town', 남쪽 → 'Forest', 북쪽 → 'Mountain' (모듈이 지역을 만들면 열린다)
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;

  // 숲 가장자리 타일 위에 장식 나무를 엇갈리게 심는다 (빽빽한 숲처럼)
  function forestTree(loc, x, y) {
    const h = U.hash2(x, y, 77);
    if ((x + y * 2) % 3 !== 0 && h % 5 !== 0) return;
    const kinds = ['oak', 'oak', 'maple', 'pine', 'pine'];
    loc.decor.push({ t: 'decorTree', x, y, kind: kinds[h % kinds.length], v: h % 2, ox: (h % 7) - 3, oy: ((h >> 3) % 5) - 2 });
  }

  const FARM_MAP = [
      'TTTTTTTTTppTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTppTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTppTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTCCCCCCCssCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCTT',
      'TTCCCCCCCssCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCTT',
      'TTCCCCCCCssCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCTT',
      'TTTTTT...pp.........TTTTT..........TTT....................TTTTTT',
      'TTTTTT...pp..........TTT...........TTT...................TTTTTTT',
      'TTTTTTT..pp..............................................TTTTTTT',
      'TTTTTT...................................................TTTTTTT',
      'TTTTTT....................................................TTTTTT',
      'TT.....................wwww...................................TT',
      'TT....................wwwwww................ppp...............TT',
      'TTTTT.................wwwwww................ppp...............TT',
      'TTTTTT................wwwwww................ppp.......pppppppppp',
      'TTTTT..................wwww.................pppppppppppppppppppp',
      'TT..........................................ppp.......pppppppppp',
      'TT............................................................TT',
      'TT............................................................TT',
      'TT............................................................TT',
      'TT............................................................TT',
      'TT............................................................TT',
      'TTTT.................................................wwwww...TTT',
      'TTTTT...............................................wwwwwwwTTTTT',
      'TTTTT...............................................wwwwwwwTTTTT',
      'TTTTT................................................wwwww.TTTTT',
      'TTTT.........................................................TTT',
      'TT............................................................TT',
      'TT............................................................TT',
      'TT............................................................TT',
      'TT............................................................TT',
      'TT............................................................TT',
      'TT............................................................TT',
      'TTCCCCCCCCCssCCCCCCCCC........................................TT',
      'TTCCCCCCCCCssCCCCCCCCC........................................TT',
      'TT............................................................TT',
      'TT............................................................TT',
      'TT............................................................TT',
      'TT....wwwwwww.................................................TT',
      'TT...wwwwwwwww................................................TT',
      'TT..wwwwwwwwwww...............................................TT',
      'TT..wwwwwwwwwww............................................TTTTT',
      'TT..wwwwwwwwwww...........................................TTTTTT',
      'TT...wwwwwwwww...........................................TTTTTTT',
      'TTTTTTwwwwwww.................pp.........................TTTTTTT',
      'TTTTTT........................pp.........................TTTTTTT',
      'TTTTTTT.......................pp..........................TTTTTT',
      'TTTTTT......TTTTT.............pp................TTTTT......TTTTT',
      'TTTTTT......TTTTT.............pp................TTTTT.........TT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTppTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTppTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTppTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ];

  const HOUSE = { x: 41, y: 6 };       // 농가 왼쪽 위 칸 (9×7)
  const DOOR = { x: HOUSE.x + 4, y: HOUSE.y + 5 };
  const clearZone = (x, y) => x >= 36 && x <= 56 && y >= 9 && y <= 18;
  // 모듈이 참고할 농장 주요 지점 (우편함은 문 오른쪽, 출하함 옆 등)
  SD.FARM = {
    house: { x: HOUSE.x, y: HOUSE.y, w: 9, h: 7 },
    door: { x: DOOR.x, y: DOOR.y },
    porch: { x: DOOR.x, y: DOOR.y + 1 },
    bin: { x: HOUSE.x + 10, y: HOUSE.y + 5 },
    mailbox: { x: HOUSE.x + 7, y: HOUSE.y + 6 },
    exits: { east: { x: 63, y: 15 }, south: { x: 30, y: 51 }, north: { x: 9, y: 0 } },
    clearZone,
  };

  SD.World.define({
    id: 'Farm',
    name: '똥밸리 농장',
    outdoor: true,
    farm: true,
    music: 'farm',
    map: FARM_MAP,
    legend: { T: { tile: 'forest', then: forestTree } },
    large: [
      { t: 'farmhouse', x: HOUSE.x, y: HOUSE.y, w: 9, h: 7 },
      { t: 'shippingBin', x: HOUSE.x + 10, y: HOUSE.y + 5, w: 2, h: 1 },
    ],
    warps: [
      { id: 'house', x: DOOR.x, y: DOOR.y, to: 'FarmHouse', tx: 6, ty: 10, dir: 'up', sound: 'door' },
      { id: 'east', x: 63, y: 14, w: 1, h: 3, to: 'Town', dir: 'left', sound: false, msg: '마을로 가는 길은 아직 공사 중이에요.' },
      { id: 'south', x: 30, y: 51, w: 2, h: 1, to: 'Forest', dir: 'up', sound: false, msg: '숲으로 가는 길은 아직 막혀 있어요.' },
      { id: 'north', x: 9, y: 0, w: 2, h: 1, to: 'Mountain', dir: 'down', sound: false, msg: '산으로 가는 길은 아직 막혀 있어요.' },
    ],
    entries: {
      FarmHouse: { x: DOOR.x, y: DOOR.y + 1, dir: 'down' },
      Town: { x: 61, y: 15, dir: 'left' },
      BusStop: { x: 61, y: 15, dir: 'left' },
      Forest: { x: 30, y: 49, dir: 'up' },
      Mountain: { x: 9, y: 2, dir: 'down' },
      Backwoods: { x: 9, y: 2, dir: 'down' },
    },
    spawn: { x: DOOR.x, y: DOOR.y + 1, dir: 'down' },
    forage: { max: 6, perDay: [0, 2] },
    debrisPerDay: [1, 4],
    clearZone,
    houseDoor: DOOR,
    // 새 게임: 원작처럼 잡초·돌·나뭇가지·풀·나무·큰 그루터기·바위로 가득한 농장
    populate(loc, r) {
      const free = (x, y) => loc.tileAt(x, y) === 'grass' && !loc.isOccupied(x, y) && !clearZone(x, y) && !SD.Farming.nearWarp(loc, x, y) && !(x >= 8 && x <= 11 && y <= 9);
      const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
      // 나무 숲 무더기 (서쪽·남쪽에 많게)
      const groves = [[8, 18, 6], [16, 24, 5], [6, 28, 4], [26, 40, 5], [44, 42, 6], [54, 34, 4], [34, 26, 3], [20, 9, 3], [52, 8, 3], [16, 44, 4]];
      for (const [gx, gy, rad] of groves) {
        const n = Math.round(rad * 2.2);
        for (let i = 0; i < n; i++) {
          const a = r() * Math.PI * 2, d = r() * rad;
          const x = Math.round(gx + Math.cos(a) * d), y = Math.round(gy + Math.sin(a) * d * 0.8);
          if (!free(x, y)) continue;
          // 다 자란 나무끼리 너무 붙지 않게
          let near = false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const f = loc.featAt(x + dx, y + dy); if (f && f.t === 'tree') near = true; }
          if (near) continue;
          const kr = r();
          const kind = kr < 0.45 ? 'oak' : kr < 0.75 ? 'maple' : 'pine';
          const stage = r() < 0.8 ? 4 : ri(1, 3);
          loc.setFeat(x, y, { t: 'tree', kind, stage });
        }
      }
      // 큰 덩어리 (2×2)
      const clump = (kind, n) => {
        for (let i = 0; i < n; i++) {
          const spot = loc.randomTile(r, (x, y) => free(x, y) && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1));
          if (spot) loc.addLarge({ t: 'clump', kind, x: spot.x, y: spot.y, w: 2, h: 2 });
        }
      };
      clump('stump', 7); clump('log', 3); clump('boulder', 5);
      // 덤불 (가장자리 쪽)
      for (let i = 0; i < 26; i++) {
        const big = r() < 0.55;
        const spot = loc.randomTile(r, (x, y) => {
          if (!free(x, y)) return false;
          const edge = loc.tileAt(x - 1, y) === 'forest' || loc.tileAt(x + 2, y) === 'forest' || loc.tileAt(x, y + 2) === 'forest' || loc.tileAt(x, y - 1) === 'forest' || loc.tileAt(x, y - 1) === 'cliff';
          if (!edge) return false;
          return !big || (free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1));
        }, 400);
        if (spot) loc.addLarge(big ? { t: 'bush', size: 2, x: spot.x, y: spot.y, w: 2, h: 2 } : { t: 'bush', size: 1, x: spot.x, y: spot.y, w: 1, h: 1 });
      }
      // 풀밭 무더기
      for (let i = 0; i < 34; i++) {
        const c = loc.randomTile(r, free);
        if (!c) continue;
        const n = ri(4, 12);
        for (let j = 0; j < n; j++) {
          const x = c.x + ri(-2, 2), y = c.y + ri(-2, 2);
          if (free(x, y)) loc.setFeat(x, y, { t: 'grass', n: ri(2, 4), v: ri(0, 5) });
        }
      }
      // 잡동사니
      const debris = (t, n) => { for (let i = 0; i < n; i++) { const s = loc.randomTile(r, free); if (s) loc.setObj(s.x, s.y, { t, v: ri(0, 1) }); } };
      debris('weed', 190); debris('stone', 115); debris('twig', 85);
      // 집 앞에도 조금 (원작처럼 처음엔 정리해야 할 것들)
      for (let i = 0; i < 10; i++) {
        const x = ri(37, 55), y = ri(13, 18);
        if (loc.tileAt(x, y) === 'grass' && !loc.isOccupied(x, y) && !(x >= 43 && x <= 47)) loc.setObj(x, y, { t: U.pick(['weed', 'stone', 'twig'], r), v: ri(0, 1) });
      }
    },
  });

  // ───────────── 농가 실내 ─────────────
  SD.World.define({
    id: 'FarmHouse',
    name: '농가',
    outdoor: false,
    music: null,
    map: [
      'XXXXXXXXXXXXXX',
      'XWWWWWWWWWWWWX',
      'XWWWWWWWWWWWWX',
      'XBBBBBBBBBBBBX',
      'XffffffffffffX',
      'XffffffffffffX',
      'XffffffffffffX',
      'XffffffffffffX',
      'XffffffffffffX',
      'XffffffffffffX',
      'XffffffffffffX',
      'XXXXXXmXXXXXXX',
    ],
    large: [
      { t: 'window', x: 6, y: 1, w: 2, h: 1 },
      { t: 'tv', x: 1, y: 3, w: 2, h: 2 },
      { t: 'kitchen', x: 3, y: 2, w: 3, h: 2 },
      { t: 'fireplace', x: 8, y: 2, w: 2, h: 2 },
      { t: 'bed', x: 10, y: 3, w: 2, h: 3 },
      { t: 'rug', x: 4, y: 6, w: 3, h: 2 },
      { t: 'table', x: 5, y: 7, w: 2, h: 2 },
      { t: 'lamp', x: 1, y: 9, w: 1, h: 1 },
    ],
    warps: [{ id: 'out', x: 6, y: 11, to: 'Farm', dir: 'down', sound: 'doorClose' }],
    entries: { Farm: { x: 6, y: 10, dir: 'up' } },
    spawn: { x: 11, y: 6, dir: 'down' },
  });
})();
