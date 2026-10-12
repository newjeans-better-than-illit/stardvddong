'use strict';
// ───────────────────────── 게임 데이터 ─────────────────────────
// 이 마을에서는 무엇을 심든 똥이 자란다. 모든 작물 = 똥.

const TILE = 16;
const MAP_W = 40;
const MAP_H = 30;
const DAYS_PER_SEASON = 28;
const MINUTES_PER_TICK = 10;
const SECONDS_PER_TICK = 5;   // 현실 5초 = 게임 10분
const DAY_START = 6 * 60;     // 오전 6시
const DAY_END = 26 * 60;      // 새벽 2시에 기절
const MAX_STACK = 999;
const INV_SIZE = 24;
const HOTBAR_SIZE = 12;

const SEASONS = ['봄', '여름', '가을', '겨울'];
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const QUALITY = [
  { name: '보통', mult: 1 },
  { name: '은별', mult: 1.25 },
  { name: '금별', mult: 1.5 },
];

// days: 다 자랄 때까지 걸리는 날, regrow: 수확 후 다시 자라는 날(없으면 null)
// yield: [기본 개수, 추가 1개 확률]
const CROPS = {
  parsnip: {
    name: '파스닙똥', color: '#9a6232', seasons: [0], days: 4, regrow: null,
    seed: 20, sell: 35, yield: [1, 0],
    desc: '봄의 첫 똥. 은은한 흙냄새가 난다. 초보 농부의 친구.',
  },
  potato: {
    name: '감자똥', color: '#c99a5c', seasons: [0], days: 6, regrow: null,
    seed: 50, sell: 80, yield: [1, 0.25],
    desc: '포슬포슬한 감자 같은 똥. 운이 좋으면 두 덩이가 나온다.',
  },
  strawberry: {
    name: '딸기똥', color: '#f0628f', seasons: [0], days: 8, regrow: 4,
    seed: 100, sell: 120, yield: [1, 0.05],
    desc: '새콤달콤한 향이 나는 분홍 똥. 따도 따도 또 자란다.',
  },
  cauliflower: {
    name: '콜리플라워똥', color: '#ece0c0', seasons: [0], days: 12, regrow: null,
    seed: 80, sell: 175, yield: [1, 0],
    desc: '하얗고 뭉실뭉실한 고급 똥. 오래 기다린 보람이 있다.',
  },
  blueberry: {
    name: '블루베리똥', color: '#4f6fd6', seasons: [1], days: 13, regrow: 4,
    seed: 80, sell: 50, yield: [3, 0.1],
    desc: '한 번에 세 덩이씩 쏟아지는 파란 똥. 여름 효자 작물.',
  },
  melon: {
    name: '멜론똥', color: '#7fcf58', seasons: [1], days: 12, regrow: null,
    seed: 80, sell: 250, yield: [1, 0],
    desc: '줄무늬가 선명한 초록 똥. 마을 축제의 주인공.',
  },
  pepper: {
    name: '고추똥', color: '#e23e2b', seasons: [1], days: 5, regrow: 3,
    seed: 40, sell: 40, yield: [1, 0.03],
    desc: '보기만 해도 매운 빨간 똥. 금방 자라고 금방 또 자란다.',
  },
  corn: {
    name: '옥수수똥', color: '#f1c22e', seasons: [1, 2], days: 14, regrow: 4,
    seed: 150, sell: 50, yield: [1, 0],
    desc: '알알이 노란 똥. 여름부터 가을까지 계속 수확할 수 있다.',
  },
  pumpkin: {
    name: '호박똥', color: '#ee8a22', seasons: [2], days: 13, regrow: null,
    seed: 100, sell: 320, yield: [1, 0],
    desc: '가을의 왕. 묵직하고 둥근 주황 똥.',
  },
  eggplant: {
    name: '가지똥', color: '#7b3fa2', seasons: [2], days: 5, regrow: 5,
    seed: 20, sell: 60, yield: [1, 0.02],
    desc: '반질반질 윤이 나는 보라 똥. 싸고 꾸준하다.',
  },
  rainbow: {
    name: '무지개똥', color: '#ff7ad1', seasons: [2], days: 12, regrow: null,
    seed: 200, sell: 450, yield: [1, 0], rainbow: true,
    desc: '일곱 빛깔로 반짝이는 전설의 똥. 보는 것만으로 행복해진다.',
  },
  snow: {
    name: '눈똥', color: '#d6efff', seasons: [3], days: 7, regrow: null,
    seed: 60, sell: 110, yield: [1, 0],
    desc: '겨울에만 자라는 차가운 똥. 손으로 만지면 얼얼하다.',
  },
  gold: {
    name: '황금똥', color: '#ffcf2e', seasons: [0, 1, 2, 3], days: 20, regrow: 7,
    seed: 1000, sell: 700, yield: [1, 0], shiny: true,
    desc: '사계절 내내 자라는 황금빛 똥. 부자의 꿈.',
  },
};
const CROP_IDS = Object.keys(CROPS);

// 아이템 정의. 작물 아이템 id = 작물 id, 씨앗 = 'seed_' + 작물 id
const ITEMS = {
  hoe: { name: '괭이', kind: 'tool', desc: '풀밭을 갈아 똥밭으로 만든다.' },
  can: { name: '물뿌리개', kind: 'tool', desc: '밭에 물을 준다. 연못에서 다시 채울 수 있다.' },
  scythe: { name: '낫', kind: 'tool', desc: '잡초를 베고 다 자란 똥을 수확한다.' },
  pick: { name: '곡괭이', kind: 'tool', desc: '돌을 깨고, 밭을 다시 풀밭으로 메운다.' },
  axe: { name: '도끼', kind: 'tool', desc: '나뭇가지와 그루터기를 벤다.' },
  sprinkler: { name: '스프링클러', kind: 'place', price: 500, sell: 100, desc: '매일 아침 상하좌우 4칸에 물을 준다. 곡괭이로 회수.' },
  cookie: { name: '에너지 쿠키', kind: 'food', price: 80, sell: 20, energy: 60, desc: '먹으면 기력이 60 회복된다. 똥맛은 아니다.' },
  wood: { name: '나무', kind: 'res', sell: 2, desc: '평범한 나무. 팔면 푼돈이 된다.' },
  stone: { name: '돌', kind: 'res', sell: 2, desc: '평범한 돌. 팔면 푼돈이 된다.' },
};
for (const id of CROP_IDS) {
  const c = CROPS[id];
  ITEMS[id] = { name: c.name, kind: 'crop', sell: c.sell, crop: id, desc: c.desc };
  ITEMS['seed_' + id] = {
    name: c.name + ' 씨앗', kind: 'seed', crop: id, price: c.seed, sell: Math.floor(c.seed / 2),
    desc: seasonText(c.seasons) + '에 심는다. ' + c.days + '일 뒤 수확' + (c.regrow ? ', 이후 ' + c.regrow + '일마다 다시 자람.' : '.'),
  };
}

function seasonText(list) {
  if (list.length === 4) return '사계절';
  return list.map((s) => SEASONS[s]).join('·');
}

const TOOL_ENERGY = { hoe: 2, can: 2, scythe: 0, pick: 3, axe: 3 };
const CAN_CAPACITY = [40, 100];
