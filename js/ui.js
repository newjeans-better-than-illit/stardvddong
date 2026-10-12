'use strict';
// ───────────────────────── HTML UI: HUD, 핫바, 메뉴, 상점 ─────────────────────────

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('ko-KR');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeText(min) {
  let h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const am = h < 12;
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${am ? '오전' : '오후'} ${hh}:${String(m).padStart(2, '0')}`;
}

function dateText(s) {
  return `${SEASONS[s.season]} ${s.day}일 · ${WEEKDAYS[(s.day - 1) % 7]}`;
}

function weatherIcon(w) { return w === 'rain' ? SPR.ui.rain : w === 'snow' ? SPR.ui.snow : SPR.ui.sun; }
function weatherName(w) { return w === 'rain' ? '비' : w === 'snow' ? '눈' : '맑음'; }

const UI = {
  modalOpen: false,
  onClose: null,
  hudCache: {},
  pick: -1,          // 가방에서 옮기려고 집은 칸
  infoIdx: -1,
  menuTab: 'bag',
  shopTab: 'buy',

  init() {
    $('hudCoin').src = SPR.ui.coin;
    $('btnMenu').addEventListener('click', () => { Sound.unlock(); this.openMenu('bag'); });
    $('btnSound').addEventListener('click', () => { Sound.unlock(); Game.toggleSound(); });
    $('hotbar').addEventListener('click', (e) => {
      const el = e.target.closest('.slot');
      if (!el) return;
      G.sel = Number(el.dataset.i);
      Sound.play('menu');
      this.renderHotbar();
    });
    $('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal' && this.closable) this.close();
    });
    this.renderSoundBtn();
  },

  renderSoundBtn() {
    $('btnSound').textContent = Sound.muted ? '소리 끔' : '소리 켬';
  },

  toast(msg, kind = '') {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.style.opacity = '0'; }, 2400);
    setTimeout(() => el.remove(), 2900);
  },

  slotHTML(it, i, extra = '') {
    let inner = '';
    if (it) {
      const def = ITEMS[it.id];
      inner += `<img src="${SPR.icons[it.id]}" alt="${esc(def.name)}">`;
      if (it.n > 1) inner += `<span class="n">${it.n}</span>`;
      if (it.q) inner += `<img class="q" src="${it.q === 2 ? SPR.ui.star2 : SPR.ui.star1}" alt="${QUALITY[it.q].name}">`;
      if (it.id === 'can') inner += `<span class="bar"><i style="width:${Math.round((G.water / CAN_CAPACITY[G.canLevel]) * 100)}%"></i></span>`;
    }
    const title = it ? ITEMS[it.id].name + (it.q ? ` (${QUALITY[it.q].name})` : '') : '빈 칸';
    return `<button type="button" class="slot ${extra}" data-i="${i}" title="${esc(title)}">${inner}</button>`;
  },

  renderHotbar() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
    let html = '';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      html += this.slotHTML(G.inv[i], i, i === G.sel ? 'sel' : '').replace('</button>', `<span class="key">${keys[i]}</span></button>`);
    }
    $('hotbar').innerHTML = html;
  },

  updateHud() {
    const c = this.hudCache;
    const date = dateText(G), time = timeText(G.time), money = fmt(G.money);
    if (c.date !== date) { $('hudDate').textContent = date; c.date = date; }
    if (c.time !== time) { $('hudTime').textContent = time; c.time = time; }
    if (c.money !== money) { $('hudMoney').textContent = money; c.money = money; }
    if (c.weather !== G.weather) { $('hudWeather').src = weatherIcon(G.weather); $('hudWeather').alt = weatherName(G.weather); c.weather = G.weather; }
    const e = Math.round((G.energy / G.maxEnergy) * 100);
    if (c.energy !== e) {
      const fill = $('energyFill');
      fill.style.height = e + '%';
      fill.style.backgroundColor = e > 50 ? '#5fd23a' : e > 20 ? '#f2c230' : '#e2372b';
      c.energy = e;
    }
  },

  // ── 모달 공통 ──
  open(html, opts = {}) {
    $('panel').innerHTML = html;
    $('modal').hidden = false;
    this.modalOpen = true;
    this.closable = opts.closable !== false;
    this.onClose = opts.onClose || null;
    const first = $('panel').querySelector('[autofocus], button');
    if (first) first.focus({ preventScroll: true });
  },

  close() {
    if (!this.modalOpen) return;
    $('modal').hidden = true;
    $('panel').innerHTML = '';
    this.modalOpen = false;
    this.pick = -1;
    const cb = this.onClose;
    this.onClose = null;
    this.renderHotbar();
    if (cb) cb();
  },

  dialog(text, choices) {
    const btns = choices.map((c, i) => `<button type="button" class="wood-btn ${c.green ? 'green' : ''}" data-c="${i}">${esc(c.label)}</button>`).join('');
    this.open(`<p style="font-family:var(--font-display);font-size:19px">${esc(text)}</p><div class="row-buttons">${btns}</div>`);
    $('panel').querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      const c = choices[Number(b.dataset.c)];
      this.close();
      if (c.fn) c.fn();
    }));
  },

  // ── 할아버지의 편지 ──
  letter(onDone) {
    this.open(`
      <h2>할아버지의 편지</h2>
      <div class="letter">사랑하는 손주에게.

이 편지를 읽고 있다면, 이제 이 똥밸리 농장은 네 것이란다.

미리 말해두마. 이 땅에서는 무엇을 심든 <b>똥</b>이 자란다. 파스닙을 심어도, 딸기를 심어도, 호박을 심어도 전부 똥이 열리지. 처음엔 나도 놀랐단다.

하지만 걱정 마라. 마을 사람들은 이 똥을 아주 좋아해서 비싼 값에 사 간단다. 출하함에 넣어두면 밤사이에 돈이 들어올 게다.

창고에 파스닙똥 씨앗을 조금 남겨두었다. 괭이로 밭을 갈고, 씨앗을 심고, 물을 주거라.
<span class="sign">― 할아버지가</span></div>
      <div class="row-buttons"><button type="button" class="wood-btn green big" id="btnLetter">농사 시작!</button></div>`, { closable: false, onClose: onDone });
    $('btnLetter').addEventListener('click', () => this.close());
  },

  // ── 가방 / 도감 / 조작법 / 설정 ──
  openMenu(tab) {
    if (this.modalOpen) return;
    this.menuTab = tab || this.menuTab;
    Sound.play('menu');
    this.open('<div id="menuBody" class="panel-body"></div>');
    this.renderMenu();
  },

  renderMenu() {
    const tabs = [['bag', '가방'], ['dex', '똥 도감'], ['help', '조작법'], ['set', '설정']];
    let body = `<div class="panel-head"><div class="tabs">${tabs.map(([k, n]) => `<button type="button" class="tab ${k === this.menuTab ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
      <button type="button" class="wood-btn small" id="btnClose">닫기 (Esc)</button></div>`;
    if (this.menuTab === 'bag') body += this.bagHTML();
    else if (this.menuTab === 'dex') body += this.dexHTML();
    else if (this.menuTab === 'help') body += this.helpHTML();
    else body += this.settingsHTML();
    $('panel').innerHTML = body;
    $('btnClose').addEventListener('click', () => this.close());
    $('panel').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.menuTab = b.dataset.tab; this.pick = -1; Sound.play('menu'); this.renderMenu(); }));
    if (this.menuTab === 'bag') this.bindBag();
    if (this.menuTab === 'set') this.bindSettings();
  },

  bagHTML() {
    let grid = '';
    for (let i = 0; i < INV_SIZE; i++) {
      const cls = [i === this.pick ? 'pick' : '', i === G.sel ? 'sel' : ''].join(' ');
      grid += this.slotHTML(G.inv[i], i, cls);
    }
    const it = G.inv[this.infoIdx];
    let info = '<p class="ds">칸을 누르면 정보를 보고, 다른 칸을 누르면 자리를 바꿔요. 윗줄 12칸이 핫바예요.</p>';
    if (it) {
      const def = ITEMS[it.id];
      const val = itemValue(it);
      info = `<img src="${SPR.icons[it.id]}" alt=""><div><div class="nm">${esc(def.name)}${it.q ? ` <small>(${QUALITY[it.q].name})</small>` : ''}</div>
        <div class="ds">${esc(def.desc)}${val ? `<br>판매가 ${fmt(val)}G${it.n > 1 ? ` · 전부 ${fmt(val * it.n)}G` : ''}` : ''}</div></div>`;
    }
    return `<div class="panel-head"><h2>가방</h2><span class="money">${fmt(G.money)} G</span></div>
      <div class="inv-grid">${grid}</div><div class="inv-info">${info}</div>`;
  },

  bindBag() {
    $('panel').querySelectorAll('.inv-grid .slot').forEach((el) => el.addEventListener('click', () => {
      const i = Number(el.dataset.i);
      if (this.pick >= 0 && this.pick !== i) {
        const tmp = G.inv[this.pick]; G.inv[this.pick] = G.inv[i]; G.inv[i] = tmp;
        this.pick = -1; this.infoIdx = i;
        Sound.play('menu');
      } else if (this.pick === i) {
        this.pick = -1;
      } else {
        this.infoIdx = i;
        this.pick = G.inv[i] ? i : -1;
        if (i < HOTBAR_SIZE) G.sel = i;
      }
      this.renderMenu();
    }));
  },

  dexHTML() {
    const got = CROP_IDS.filter((id) => G.stats.harvested[id]);
    const cells = CROP_IDS.map((id) => {
      const n = G.stats.harvested[id] || 0;
      const c = CROPS[id];
      return `<div class="dex-cell ${n ? '' : 'unknown'}"><img src="${SPR.icons[id]}" alt=""><div class="nm">${n ? esc(c.name) : '???'}</div>
        <div class="ct">${n ? `${fmt(n)}개 수확` : `${seasonText(c.seasons)} 작물`}</div></div>`;
    }).join('');
    const pct = Math.round((got.length / CROP_IDS.length) * 100);
    return `<div class="panel-head"><h2>똥 도감</h2><span class="money">${got.length} / ${CROP_IDS.length}</span></div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <p>모든 똥을 한 번씩 수확하면 <b>똥의 달인</b> 칭호를 얻어요. 지금까지 번 돈: <b>${fmt(G.stats.earned)}G</b></p>
      <div class="dex">${cells}</div>`;
  },

  helpHTML() {
    return `<h2>조작법</h2>
      <dl class="help-list">
        <dt>이동</dt><dd><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 또는 방향키</dd>
        <dt>도구 쓰기</dt><dd><kbd>C</kbd> / <kbd>스페이스</kbd> / 마우스 왼쪽 클릭. 꾹 누르면 계속 써요.</dd>
        <dt>행동</dt><dd><kbd>X</kbd> / <kbd>F</kbd> / 마우스 오른쪽 클릭. 수확, 출하, 상점, 잠자기.</dd>
        <dt>핫바 선택</dt><dd><kbd>1</kbd>~<kbd>=</kbd> 숫자키, 마우스 휠, <kbd>Q</kbd>/<kbd>R</kbd></dd>
        <dt>가방</dt><dd><kbd>E</kbd> / <kbd>I</kbd> / <kbd>Esc</kbd></dd>
        <dt>소리</dt><dd><kbd>M</kbd></dd>
      </dl>
      <h3>농사 순서</h3>
      <p>괭이로 풀밭을 갈고 → 씨앗을 고른 채 도구 쓰기로 심고 → 물뿌리개로 물을 줘요. 물을 준 날 밤에만 똥이 자라요. 다 자란 똥(얼굴이 생기고 파리가 꼬임)은 행동 키나 낫으로 수확해요.</p>
      <p>작물을 들고 출하함(집 옆 나무 상자)에서 행동 키를 누르면 밤에 팔려요. 집 문 앞에서 행동 키를 누르면 잠을 자고, 잠을 자면 자동 저장돼요. 새벽 2시가 되면 쓰러지니 조심하세요.</p>
      <p>계절은 28일마다 바뀌고, 제철이 아닌 똥은 시들어요. 물뿌리개는 연못에서 채워요.</p>`;
  },

  settingsHTML() {
    return `<h2>설정</h2>
      <div class="row-buttons" style="justify-content:flex-start">
        <button type="button" class="wood-btn" id="setSound">${Sound.muted ? '소리 켜기' : '소리 끄기'}</button>
        <button type="button" class="wood-btn" id="setTitle">타이틀로 나가기</button>
        <button type="button" class="wood-btn" id="setReset">처음부터 다시</button>
      </div>
      <p id="setNote">게임은 잠을 잘 때마다 이 브라우저에 자동 저장돼요. 타이틀로 나가면 오늘 아침 이후의 진행은 사라져요.</p>`;
  },

  bindSettings() {
    $('setSound').addEventListener('click', () => { Game.toggleSound(); this.renderMenu(); });
    $('setTitle').addEventListener('click', () => { this.close(); Game.toTitle(); });
    let armed = false;
    $('setReset').addEventListener('click', () => {
      if (!armed) {
        armed = true;
        $('setReset').textContent = '정말로? 한 번 더 누르면 지워져요';
        $('setNote').textContent = '저장된 농장이 완전히 지워지고 새 농장이 시작돼요.';
        return;
      }
      this.close();
      clearSave();
      Game.newGame();
    });
  },

  // ── 상점 ──
  openShop() {
    if (this.modalOpen) return;
    Sound.play('menu');
    this.open('<div></div>');
    this.renderShop();
  },

  shopStock() {
    const rows = [];
    for (const id of CROP_IDS) {
      const c = CROPS[id];
      if (c.seasons.includes(G.season)) rows.push({ id: 'seed_' + id, price: c.seed, multi: true, crop: c });
    }
    rows.push({ id: 'cookie', price: ITEMS.cookie.price, multi: true });
    rows.push({ id: 'sprinkler', price: ITEMS.sprinkler.price, multi: false });
    if (G.canLevel === 0) rows.push({ id: 'canUp', price: 2000, multi: false });
    return rows;
  },

  renderShop() {
    const tabs = `<div class="tabs"><button type="button" class="tab ${this.shopTab === 'buy' ? 'on' : ''}" data-st="buy">사기</button><button type="button" class="tab ${this.shopTab === 'sell' ? 'on' : ''}" data-st="sell">팔기</button></div>`;
    let list = '';
    if (this.shopTab === 'buy') {
      list = this.shopStock().map((r) => {
        if (r.id === 'canUp') {
          return `<div class="shop-row"><img src="${SPR.icons.can}" alt=""><div><div class="nm">구리 물뿌리개 업그레이드</div>
            <div class="meta">물뿌리개 용량 ${CAN_CAPACITY[0]} → ${CAN_CAPACITY[1]}</div></div>
            <div class="buy"><span class="price">${fmt(r.price)}G</span><button type="button" class="wood-btn small" data-buy="canUp" data-n="1" ${G.money < r.price ? 'disabled' : ''}>구매</button></div></div>`;
        }
        const def = ITEMS[r.id];
        let meta = esc(def.desc);
        let badge = '';
        if (r.crop) {
          const s = r.crop.seasons;
          badge = s.length === 4 ? '<span class="badge all">사계절</span>' : s.map((x) => `<span class="badge s${x}">${SEASONS[x]}</span>`).join('');
          meta = `${r.crop.days}일 성장${r.crop.regrow ? ` · ${r.crop.regrow}일마다 재수확` : ''} · 똥 판매가 ${r.crop.sell}G${r.crop.yield[0] > 1 ? ` ×${r.crop.yield[0]}` : ''}`;
        }
        const b1 = `<button type="button" class="wood-btn small" data-buy="${r.id}" data-n="1" ${G.money < r.price ? 'disabled' : ''}>1개</button>`;
        const b5 = r.multi ? `<button type="button" class="wood-btn small" data-buy="${r.id}" data-n="5" ${G.money < r.price * 5 ? 'disabled' : ''}>5개</button>` : '';
        return `<div class="shop-row"><img src="${SPR.icons[r.id]}" alt=""><div style="min-width:0"><div class="nm">${esc(def.name)}${badge}</div><div class="meta">${meta}</div></div>
          <div class="buy"><span class="price">${fmt(r.price)}G</span>${b1}${b5}</div></div>`;
      }).join('');
    } else {
      const rows = G.inv.map((it, i) => ({ it, i })).filter(({ it }) => it && ITEMS[it.id].kind !== 'tool' && ITEMS[it.id].sell);
      list = rows.length ? rows.map(({ it, i }) => {
        const def = ITEMS[it.id], v = itemValue(it);
        return `<div class="shop-row"><img src="${SPR.icons[it.id]}" alt=""><div style="min-width:0"><div class="nm">${esc(def.name)}${it.q ? ` <small>(${QUALITY[it.q].name})</small>` : ''}</div>
          <div class="meta">${it.n}개 · 개당 ${fmt(v)}G</div></div>
          <div class="buy"><span class="price">${fmt(v * it.n)}G</span><button type="button" class="wood-btn small" data-sell="${i}">전부 팔기</button></div></div>`;
      }).join('') : '<p class="empty-note">팔 수 있는 물건이 없어요. 똥을 수확해 오세요!</p>';
    }
    const greet = ['오늘도 신선한 똥 씨앗 들어왔어!', '냄새? 그게 바로 신선함의 증거지.', '황금똥 한 번 키워보면 인생이 바뀐다니까.', '물 주는 거 잊지 마. 똥도 목이 마르거든.'][G.day % 4];
    $('panel').innerHTML = `<div class="panel-head"><h2>뿌지직 상회</h2><span class="money">${fmt(G.money)} G</span></div>
      <p>뿌직이 아저씨: "${greet}"</p>
      <div class="panel-head">${tabs}<button type="button" class="wood-btn small" id="btnClose">닫기 (Esc)</button></div>
      <div class="shop-list">${list}</div>`;
    $('btnClose').addEventListener('click', () => this.close());
    $('panel').querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { this.shopTab = b.dataset.st; Sound.play('menu'); this.renderShop(); }));
    $('panel').querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => { Game.buy(b.dataset.buy, Number(b.dataset.n)); this.renderShop(); }));
    $('panel').querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', () => { Game.sellSlot(Number(b.dataset.sell)); this.renderShop(); }));
  },

  // ── 하루 정산 ──
  daySummary(info, onNext) {
    const rows = info.lines.map((l) => `<div class="ledger-row"><img src="${SPR.icons[l.id]}" alt=""><span class="nm">${esc(ITEMS[l.id].name)}${l.q ? ` (${QUALITY[l.q].name})` : ''}</span><span>×${l.n}</span><span>${fmt(l.total)}G</span></div>`).join('');
    const notes = info.notes.map((n) => `<p>${esc(n)}</p>`).join('');
    this.open(`<h2>${esc(info.title)}</h2>
      ${info.lines.length ? `<div class="ledger">${rows}</div>` : '<p class="empty-note">오늘은 출하한 똥이 없어요.</p>'}
      <div class="ledger-total"><span>출하 수익</span><span>${fmt(info.total)} G</span></div>
      ${notes}
      <div class="forecast"><img src="${weatherIcon(info.forecast)}" alt="">내일 날씨: ${weatherName(info.forecast)}</div>
      <div class="row-buttons"><button type="button" class="wood-btn green big" id="btnNext">${esc(info.nextLabel)}</button></div>`, { closable: false, onClose: onNext });
    $('btnNext').addEventListener('click', () => this.close());
  },
};

// ── 터치 조작 ──
function initTouch(input) {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (!coarse && !('ontouchstart' in window)) return;
  $('touch').hidden = false;
  document.querySelectorAll('.dpad button').forEach((b) => {
    const dir = b.dataset.dir;
    const on = (e) => { e.preventDefault(); Sound.unlock(); input.touchDir[dir] = true; b.classList.add('on'); };
    const off = (e) => { e.preventDefault(); input.touchDir[dir] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  });
  const hold = (el, flag) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); Sound.unlock(); input[flag] = true; input[flag + 'Pressed'] = true; });
    const off = (e) => { e.preventDefault(); input[flag] = false; };
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  };
  hold($('tUse'), 'use');
  hold($('tAct'), 'act');
}
