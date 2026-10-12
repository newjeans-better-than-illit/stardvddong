'use strict';
// ════════════════════════════════════════════════════════════════════
//  메뉴 화면들 (최소 기능판): 대화창(타자기·초상화·선택지), 질문, 게임 메뉴(탭),
//  간단한 상점, 하루 정산 + 레벨업
//  탭 추가: SD.UI.addTab({ id, name, icon:()=>캔버스, order, draw(g, rect, menu),
//                         onPointer(type, x, y, btn, rect, menu), onKey(act) })
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;
  const X = SD.gfx;
  const UI = SD.UI;
  const C = UI.C;

  const isConfirm = (a) => a === 'confirm' || a === 'use' || a === 'action';
  const isClose = (a) => a === 'menu' || a === 'cancel';

  // ═════════════ 대화창 ═════════════
  // opts: { speaker, portrait: 캔버스|()=>캔버스, pages:[문자열], text, choices:[{label, fn}], onDone, sound }
  UI.dialogue = function (opts) {
    const o = typeof opts === 'string' ? { text: opts } : Object.assign({}, opts);
    let pages = o.pages || String(o.text || '').split('#$b#');
    pages = pages.filter((p) => p != null);
    const s = {
      id: 'dialogue', blocking: true, page: 0, shown: 0, choice: 0, rects: [], opts: o,
      update(dt) {
        const full = pages[this.page] || '';
        if (this.shown < full.length) {
          const before = Math.floor(this.shown);
          this.shown = Math.min(full.length, this.shown + dt * 48);
          if (Math.floor(this.shown) !== before && before % 3 === 0 && o.speaker) SD.Sound.play('dialogue', { minGap: 0.05 });
        }
      },
      lastPage() { return this.page >= pages.length - 1; },
      advance() {
        const full = pages[this.page] || '';
        if (this.shown < full.length) { this.shown = full.length; return; }
        if (!this.lastPage()) { this.page++; this.shown = 0; SD.Sound.play('smallSelect'); return; }
        if (o.choices && o.choices.length) return this.pick(this.choice);
        UI.pop(this);
        if (o.onDone) SD.Mods.safe('dialogue.onDone', o.onDone);
      },
      pick(i) {
        const c = o.choices[i];
        if (!c) return;
        SD.Sound.play('select');
        UI.pop(this);
        if (c.fn) SD.Mods.safe('dialogue.choice', c.fn, c);
        if (o.onDone) SD.Mods.safe('dialogue.onDone', o.onDone, c);
      },
      onKey(act) {
        const showChoices = this.lastPage() && this.shown >= (pages[this.page] || '').length && o.choices;
        if (showChoices) {
          if (act === 'up') { this.choice = (this.choice + o.choices.length - 1) % o.choices.length; SD.Sound.play('hover'); return true; }
          if (act === 'down') { this.choice = (this.choice + 1) % o.choices.length; SD.Sound.play('hover'); return true; }
          if (isConfirm(act)) { this.pick(this.choice); return true; }
          if (act === 'cancel' && o.cancelable !== false) { const last = o.choices.length - 1; this.pick(last); return true; }
          return true;
        }
        if (isConfirm(act) || act === 'cancel') { this.advance(); return true; }
        return true;
      },
      onPointer(type, x, y, btn) {
        if (type === 'move') {
          this.rects.forEach((r, i) => { if (UI.inRect(x, y, r) && this.choice !== i) { this.choice = i; SD.Sound.play('hover'); } });
          return true;
        }
        if (type !== 'down') return true;
        const showChoices = this.lastPage() && this.shown >= (pages[this.page] || '').length && o.choices;
        if (showChoices) {
          const i = this.rects.findIndex((r) => UI.inRect(x, y, r));
          if (i >= 0) this.pick(i);
          return true;
        }
        this.advance();
        return true;
      },
      draw(g) {
        const u = UI.u;
        const portrait = typeof o.portrait === 'function' ? o.portrait() : o.portrait;
        const pw = portrait ? 70 * u : 0;
        const w = Math.min(UI.W - 8 * u, 300 * u);
        const tw = w - pw - 16 * u;
        const full = pages[this.page] || '';
        const lines = UI.wrap(g, full, tw);
        const showChoices = this.lastPage() && this.shown >= full.length && o.choices;
        const lh = UI.lineH() * 1.15;
        const nCh = showChoices ? o.choices.length : 0;
        const h = Math.max(portrait ? 80 * u : 46 * u, 12 * u + (lines.length + nCh) * lh + (nCh ? 4 * u : 0));
        const x = Math.round((UI.W - w) / 2), y = UI.H - h - 6 * u;
        UI.frame(g, x, y, w - pw, h);
        // 타자기 출력
        let left = Math.floor(this.shown);
        let cy = y + 7 * u;
        for (const l of lines) {
          const part = l.slice(0, Math.max(0, left));
          left -= l.length + 1;
          UI.text(g, part, x + 8 * u, cy);
          cy += lh;
        }
        this.rects = [];
        if (showChoices) {
          cy += 2 * u;
          o.choices.forEach((c, i) => {
            const r = [x + 6 * u, cy - u, tw + 4 * u, lh];
            this.rects.push(r);
            if (i === this.choice) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(r[0], r[1], r[2], r[3]); drawHand(g, x + 2 * u, cy + u); }
            UI.text(g, c.label, x + 14 * u, cy, { color: i === this.choice ? '#8a2a0a' : C.text });
            cy += lh;
          });
        } else if (this.shown >= full.length && Math.floor(SD.Time.real * 3) % 2) {
          g.fillStyle = '#c8301e';
          const ax = x + w - pw - 12 * u, ay = y + h - 10 * u;
          g.fillRect(ax, ay, 5 * u, u); g.fillRect(ax + u, ay + u, 3 * u, u); g.fillRect(ax + 2 * u, ay + 2 * u, u, u);
        }
        if (portrait) {
          const px = x + w - pw + 2 * u;
          UI.frame(g, px, y, pw - 2 * u, h);
          g.drawImage(portrait, Math.round(px + (pw - 2 * u - portrait.width * u) / 2), Math.round(y + 5 * u), portrait.width * u, portrait.height * u);
          if (o.speaker) {
            const nw = UI.measure(g, o.speaker) + 10 * u;
            UI.frame(g, px + (pw - 2 * u - nw) / 2, y + h - 18 * u, nw, 15 * u);
            UI.text(g, o.speaker, px + (pw - 2 * u) / 2, y + h - 15.5 * u, { align: 'center' });
          }
        } else if (o.speaker) {
          const nw = UI.measure(g, o.speaker) + 10 * u;
          UI.frame(g, x + 4 * u, y - 15 * u, nw, 15 * u);
          UI.text(g, o.speaker, x + 4 * u + nw / 2, y - 12.5 * u, { align: 'center' });
        }
      },
    };
    SD.Sound.play('menuOpen');
    return UI.push(s);
  };
  function drawHand(g, x, y) {
    const u = UI.u;
    const img = X.cached('ui:hand', () => X.outline(X.fromRows(['.......', 'sssss..', 'SSSSSs.', 'sssssss', 'SSSSSs.', 'sssss..'], { s: '#ffe0c0', S: '#e8b090' }), { color: '#4a200a' }));
    g.drawImage(img, Math.round(x), Math.round(y), img.width * u * 0.9, img.height * u * 0.9);
  }
  UI.drawHand = drawHand;
  UI.say = function (text, onDone) { return UI.dialogue({ text, onDone }); };
  // 질문은 원작처럼 글이 바로 나오고 선택지가 함께 보인다
  UI.question = function (text, choices, opts) {
    const s = UI.dialogue(Object.assign({ text, choices }, opts || {}));
    s.shown = String(text).length;
    return s;
  };

  // ═════════════ 게임 메뉴 (탭) ═════════════
  const tabs = [];
  UI.tabs = tabs;
  UI.addTab = function (def) {
    const i = tabs.findIndex((t) => t.id === def.id);
    const d = Object.assign({ order: 50 }, def);
    if (i >= 0) tabs[i] = d; else tabs.push(d);
    tabs.sort((a, b) => a.order - b.order);
    return d;
  };
  const tabIcon = (rows, pal) => () => X.outline(X.fromRows(rows, pal), { color: '#3a1a08' });
  UI.TAB_ICONS = {
    bag: tabIcon(['..bbbb..', '.b....b.', 'bBBBBBBb', 'bBByyBBb', 'bBBBBBBb', 'bBBBBBBb', '.bbbbbb.'], { b: '#7a3e14', B: '#c87a34', y: '#ffd23a' }),
    skills: tabIcon(['...y....', '..yYy...', 'yyyYyyy.', '.yYYYy..', '..yyy...', '.yy.yy..', '.y...y..'], { y: '#e8a020', Y: '#fff08a' }),
    social: tabIcon(['.rr.rr..', 'rRrrrrr.', 'rrrrrrr.', '.rrrrr..', '..rrr...', '...r....'], { r: '#e8302a', R: '#ff9a8a' }),
    map: tabIcon(['pppppppp', 'pgggbbpp', 'pggbbbgp', 'pgbbgggp', 'pggggrgp', 'pppppppp'], { p: '#e8d0a0', g: '#6cbf45', b: '#3f8fd0', r: '#c8301e' }),
    crafting: tabIcon(['.mmm....', 'mMMm....', '.mmhh...', '...hh...', '....hh..', '.....hh.'], { m: '#8a94a0', M: '#d8e0e8', h: '#a8682e' }),
    collection: tabIcon(['.gggggg.', 'gGGGGGGg', 'gG.bb.Gg', 'gG.bb.Gg', 'gGGGGGGg', '.gggggg.'], { g: '#7a4a1a', G: '#c89a5a', b: '#8a5a2b' }),
    options: tabIcon(['..mm.m..', '.mMMMm..', 'mMM.MMm.', '.MM.MM..', 'mMMMMMm.', '.m.mm...'], { m: '#7a8490', M: '#c8d0d8' }),
    exit: tabIcon(['dddddd..', 'dDDDDd..', 'dDDDDd.y', 'dDDyyyyy', 'dDDDDd.y', 'dddddd..'], { d: '#6a3a1a', D: '#a8682e', y: '#ffd23a' }),
  };
  UI.openMenu = function (tabId) {
    if (UI.isOpen('menu')) return null;
    const visible = tabs.filter((t) => !t.hidden || !t.hidden());
    const start = Math.max(0, visible.findIndex((t) => t.id === (tabId || UI._lastTab || 'bag')));
    const m = {
      id: 'menu', blocking: true, tab: visible[start] ? visible[start].id : 'bag', held: null, heldFrom: -1, tabRects: [], closeRect: null,
      rect() {
        const u = UI.u;
        const w = Math.min(UI.W - 8 * u, 216 * u), h = Math.min(UI.H - 30 * u, 150 * u);
        return [Math.round((UI.W - w) / 2), Math.round((UI.H - h) / 2 + 10 * u), w, h];
      },
      cur() { return tabs.find((t) => t.id === this.tab) || tabs[0]; },
      switchTo(id) { if (this.tab !== id) { this.returnHeld(); this.tab = id; UI._lastTab = id; SD.Sound.play('smallSelect'); } },
      returnHeld() {
        if (!this.held) return;
        const left = SD.Inv.add(this.held.id, this.held.n, this.held.q, extraOf(this.held), { silent: true });
        if (left > 0) { const p = SD.G.player; SD.World.dropItem(SD.World.current, p.x, p.y - 4, this.held.id, left, this.held.q); }
        this.held = null;
      },
      onClose() { this.returnHeld(); SD.Sound.play('menuClose'); },
      onKey(act) {
        if (isClose(act)) { UI.pop(this); return true; }
        const t = this.cur();
        if (t.onKey && t.onKey(act, this)) return true;
        const vis = tabs.filter((tt) => !tt.hidden || !tt.hidden());
        const i = vis.findIndex((tt) => tt.id === this.tab);
        if (act === 'rowNext' || act === 'slotNext') { this.switchTo(vis[(i + 1) % vis.length].id); return true; }
        if (act === 'rowPrev' || act === 'slotPrev') { this.switchTo(vis[(i + vis.length - 1) % vis.length].id); return true; }
        return true;
      },
      onPointer(type, x, y, btn) {
        if (type === 'down') {
          const ti = this.tabRects.findIndex((r) => UI.inRect(x, y, r[0]));
          if (ti >= 0) { this.switchTo(this.tabRects[ti][1]); return true; }
          if (this.closeRect && UI.inRect(x, y, this.closeRect)) { UI.pop(this); return true; }
        }
        const t = this.cur();
        if (t.onPointer) t.onPointer(type, x, y, btn, this.rect(), this);
        return true;
      },
      draw(g) {
        const u = UI.u;
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, UI.W, UI.H);
        const r = this.rect();
        // 탭 아이콘
        this.tabRects = [];
        const vis = tabs.filter((t) => !t.hidden || !t.hidden());
        vis.forEach((t, i) => {
          const tx = r[0] + 6 * u + i * 19 * u, on = t.id === this.tab;
          const ty = r[1] - 16 * u + (on ? 2 * u : 0);
          UI.frame(g, tx, ty, 18 * u, 20 * u);
          const ic = t._icon || (t._icon = (t.icon || UI.TAB_ICONS[t.id] || UI.TAB_ICONS.bag)());
          g.drawImage(ic, Math.round(tx + 5 * u), Math.round(ty + 5 * u), ic.width * u, ic.height * u);
          this.tabRects.push([[tx, ty, 18 * u, 18 * u], t.id]);
          if (UI.inRect(UI.mouse.x, UI.mouse.y, [tx, ty, 18 * u, 18 * u])) UI.textOutlined(g, t.name, tx + 9 * u, ty - 10 * UI.tu, { align: 'center' });
        });
        UI.frame(g, r[0], r[1], r[2], r[3]);
        // 닫기 버튼
        const cx = r[0] + r[2] - 6 * u, cy = r[1] - 6 * u;
        this.closeRect = [cx, cy, 12 * u, 12 * u];
        UI.frame(g, cx, cy, 12 * u, 12 * u, 'dark');
        UI.text(g, '×', cx + 6 * u, cy + 1.5 * u, { align: 'center', color: '#ffb8a0', light: true });
        const t = this.cur();
        if (t && t.draw) SD.Mods.safe('tab.draw ' + t.id, t.draw, g, r, this);
        if (this.held) UI.drawStack(g, this.held, UI.mouse.x - 8 * u, UI.mouse.y - 8 * u);
      },
    };
    SD.Sound.play('menuOpen');
    return UI.push(m);
  };
  function extraOf(st) { const e = {}; for (const k of Object.keys(st)) if (!['id', 'n', 'q'].includes(k)) e[k] = st[k]; return Object.keys(e).length ? e : undefined; }

  // ── 가방 탭 ──
  UI.invGrid = function (r) {
    const u = UI.u, slot = 16 * u, gap = u;
    const gw = 12 * slot + 11 * gap;
    const gx = r[0] + Math.round((r[2] - gw) / 2), gy = r[1] + 8 * u;
    return { gx, gy, slot, gap, at(i) { return [gx + (i % 12) * (slot + gap), gy + Math.floor(i / 12) * (slot + gap + (Math.floor(i / 12) === 0 ? 3 * u : 0))]; } };
  };
  UI.addTab({
    id: 'bag', name: '가방', order: 0,
    draw(g, r, menu) {
      const u = UI.u, G = SD.G;
      const grid = UI.invGrid(r);
      for (let i = 0; i < 36; i++) {
        const [sx, sy] = grid.at(i);
        UI.frame(g, sx, sy, grid.slot, grid.slot, 'slot');
        const st = G.inv[i];
        if (st) UI.drawStack(g, st, sx, sy);
        if (Math.floor(i / 12) === (G.row || 0) && i % 12 === G.sel) { g.strokeStyle = C.red; g.lineWidth = u; g.strokeRect(sx + u / 2, sy + u / 2, grid.slot - u, grid.slot - u); }
        if (st && !menu.held && UI.inRect(UI.mouse.x, UI.mouse.y, [sx, sy, grid.slot, grid.slot])) UI.hoverStack = st;
      }
      // 아래: 농부 미리보기 · 이름 · 돈 · 쓰레기통
      const by = grid.gy + 3 * (grid.slot + grid.gap) + 10 * u;
      const pv = 2;
      const p = G.player;
      UI.frame(g, r[0] + 8 * u, by, 40 * u, Math.min(56 * u, r[1] + r[3] - by - 6 * u), 'slot');
      const fr = SD.Farmer.frame(p.look, 'down', { legs: 0 });
      g.drawImage(fr, Math.round(r[0] + 8 * u + 20 * u - 16 * pv * u / 2 * 1), Math.round(by + 2 * u), 32 * u * pv / 2 * 1, 48 * u * pv / 2 * 1);
      UI.text(g, p.name || '농부', r[0] + 54 * u, by + 2 * u, { size: 1.1 });
      UI.text(g, `${p.farmName || '똥밸리'} 농장`, r[0] + 54 * u, by + 2 * u + UI.lineH() * 1.3, {});
      UI.text(g, `소지금: ${U.fmt(G.money)}G`, r[0] + 54 * u, by + 2 * u + UI.lineH() * 2.6, {});
      UI.text(g, `총 수입: ${U.fmt(G.stats.totalEarned || 0)}G`, r[0] + 54 * u, by + 2 * u + UI.lineH() * 3.9, { size: 0.9 });
      // 쓰레기통
      const tx = r[0] + r[2] - 30 * u, ty = by;
      menu._trash = [tx, ty, 22 * u, 28 * u];
      const open = menu.held && UI.inRect(UI.mouse.x, UI.mouse.y, menu._trash);
      drawTrash(g, tx, ty, open);
    },
    onPointer(type, x, y, btn, r, menu) {
      if (type !== 'down') return;
      const G = SD.G;
      const grid = UI.invGrid(r);
      for (let i = 0; i < 36; i++) {
        const [sx, sy] = grid.at(i);
        if (!UI.inRect(x, y, [sx, sy, grid.slot, grid.slot])) continue;
        const st = G.inv[i];
        if (!menu.held) {
          if (!st) return;
          if (btn === 2 && st.n > 1) {
            const half = Math.ceil(st.n / 2);
            menu.held = Object.assign({}, st, { n: half });
            st.n -= half;
          } else { menu.held = st; G.inv[i] = null; }
          SD.Sound.play('pickup');
        } else if (!st) { G.inv[i] = menu.held; menu.held = null; SD.Sound.play('smallSelect'); }
        else if (SD.Inv.same(st, menu.held)) {
          const max = SD.Items.stackSize(st.id);
          const k = Math.min(max - st.n, menu.held.n);
          st.n += k; menu.held.n -= k;
          if (menu.held.n <= 0) menu.held = null;
          SD.Sound.play('smallSelect');
        } else { G.inv[i] = menu.held; menu.held = st; SD.Sound.play('smallSelect'); }
        SD.Inv.changed();
        return;
      }
      if (menu.held && menu._trash && UI.inRect(x, y, menu._trash)) {
        const def = SD.Items.get(menu.held.id);
        if (def && def.tool) { SD.UI.hud('도구는 버릴 수 없어요.', { kind: 'error' }); return; }
        menu.held = null; SD.Sound.play('trash'); return;
      }
      if (menu.held && !UI.inRect(x, y, r)) {
        // 메뉴 밖에 놓으면 땅에 떨어뜨린다
        const p = SD.G.player;
        SD.World.dropItem(SD.World.current, p.x, p.y - 4, menu.held.id, menu.held.n, menu.held.q, { noMagnetFor: 2.5, extra: extraOf(menu.held) });
        menu.held = null; SD.Sound.play('pop');
      }
    },
  });
  function drawTrash(g, x, y, open) {
    const u = UI.u;
    const img = X.cached('ui:trash', () => X.outline(X.fromRows([
      '.mmmmmmmmm.', 'mMMMMMMMMMm', '...........', '.mmmmmmmmm.', '.mMmMmMmMm.', '.mMmMmMmMm.', '.mMmMmMmMm.', '.mMmMmMmMm.', '.mMmMmMmMm.', '.mMmMmMmMm.', '..mmmmmmm..',
    ], { m: '#6a7480', M: '#b8c4cc' }), { color: '#2a2a30' }));
    g.drawImage(img, Math.round(x), Math.round(y + 4 * u), 11 * u * 2, 11 * u * 2);
    if (open) { g.fillStyle = '#c8301e'; g.fillRect(x + 2 * u, y + 2 * u, 18 * u, u); }
  }

  // ── 스킬 탭 ──
  UI.addTab({
    id: 'skills', name: '스킬', order: 10,
    draw(g, r) {
      const u = UI.u;
      const p = SD.G.player;
      let y = r[1] + 9 * u;
      UI.text(g, `${p.name || '농부'}`, r[0] + 10 * u, y, { size: 1.1 });
      UI.text(g, `기력 ${Math.max(0, Math.round(p.energy))}/${p.maxEnergy}   체력 ${p.health}/${p.maxHealth}`, r[0] + r[2] - 10 * u, y, { align: 'right', size: 0.9 });
      y += 18 * u;
      for (const s of SD.Skills.LIST) {
        const lvl = SD.Skills.baseLevel(s.id);
        UI.text(g, s.name, r[0] + 10 * u, y + u);
        for (let i = 0; i < 10; i++) {
          const bx = r[0] + 52 * u + i * 12 * u;
          const on = i < lvl;
          g.fillStyle = '#7a3e14'; g.fillRect(bx, y, 10 * u, 10 * u);
          g.fillStyle = on ? (i === 4 || i === 9 ? '#ffd23a' : s.color) : '#e8c08a'; g.fillRect(bx + u, y + u, 8 * u, 8 * u);
          if (on) { g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(bx + u, y + u, 8 * u, 2 * u); }
        }
        const prog = SD.Skills.progress(s.id);
        g.fillStyle = '#7a3e14'; g.fillRect(r[0] + 52 * u, y + 11 * u, 118 * u, 2 * u);
        g.fillStyle = s.color; g.fillRect(r[0] + 52 * u, y + 11 * u, 118 * u * prog, 2 * u);
        UI.text(g, `${lvl}`, r[0] + r[2] - 12 * u, y + u, { align: 'right', size: 1.1 });
        if (UI.inRect(UI.mouse.x, UI.mouse.y, [r[0] + 8 * u, y - u, r[2] - 16 * u, 14 * u])) {
          UI.textOutlined(g, `${s.desc} (경험치 ${SD.Skills.xp(s.id)})`, r[0] + r[2] / 2, r[1] + r[3] - 14 * u, { align: 'center', size: 0.9 });
        }
        y += 20 * u;
      }
    },
  });
  // ── 모듈이 채울 자리 (같은 id 로 addTab 하면 바뀐다) ──
  const placeholder = (id, name, order, msg) => UI.addTab({
    id, name, order, placeholder: true,
    draw(g, r) { UI.text(g, name, r[0] + r[2] / 2, r[1] + 12 * UI.u, { align: 'center', size: 1.3 }); UI.text(g, msg, r[0] + r[2] / 2, r[1] + r[3] / 2, { align: 'center' }); },
  });
  placeholder('social', '관계', 20, '아직 마을 사람들을 만나지 못했어요.');
  placeholder('map', '지도', 30, '지도를 그리는 중이에요...');
  placeholder('crafting', '제작', 40, '아직 아는 제작법이 없어요.');
  placeholder('collection', '수집', 50, '출하한 똥이 여기에 모여요.');
  // ── 설정 탭 ──
  UI.addTab({
    id: 'options', name: '설정', order: 80,
    rows(r) {
      const u = UI.u;
      const S = SD.Settings;
      const z = S.get('zoom');
      return [
        { label: '화면 배율', value: z === 'auto' ? `자동 (${SD.Render.zoom}배)` : `${z}배`, dec: () => S.set('zoom', z === 'auto' ? 2 : z <= 2 ? 'auto' : z - 1), inc: () => S.set('zoom', z === 'auto' ? 3 : z >= 5 ? 'auto' : z + 1) },
        { label: '효과음 크기', value: `${Math.round(SD.Sound.volume * 100)}%`, dec: () => S.set('volume', Math.max(0, Math.round((SD.Sound.volume - 0.1) * 10) / 10)), inc: () => S.set('volume', Math.min(1, Math.round((SD.Sound.volume + 0.1) * 10) / 10)) },
        { label: '음악 크기', value: `${Math.round(SD.Music.volume * 100)}%`, dec: () => S.set('music', Math.max(0, Math.round((SD.Music.volume - 0.1) * 10) / 10)), inc: () => S.set('music', Math.min(1, Math.round((SD.Music.volume + 0.1) * 10) / 10)) },
        { label: '소리 끄기', value: SD.Sound.muted ? '꺼짐' : '켜짐', dec: () => SD.Sound.setMuted(!SD.Sound.muted), inc: () => SD.Sound.setMuted(!SD.Sound.muted) },
      ].map((row, i) => Object.assign(row, { y: r[1] + 14 * u + i * 22 * u }));
    },
    draw(g, r) {
      const u = UI.u;
      UI.text(g, '설정', r[0] + 10 * u, r[1] + 2 * u, { size: 1.1 });
      for (const row of this.rows(r)) {
        UI.text(g, row.label, r[0] + 14 * u, row.y + 4 * u);
        const bx = r[0] + r[2] - 90 * u;
        UI.frame(g, bx, row.y, 14 * u, 14 * u); UI.text(g, '◀', bx + 7 * u, row.y + 2 * u, { align: 'center' });
        UI.text(g, row.value, bx + 42 * u, row.y + 4 * u, { align: 'center' });
        UI.frame(g, bx + 70 * u, row.y, 14 * u, 14 * u); UI.text(g, '▶', bx + 77 * u, row.y + 2 * u, { align: 'center' });
      }
      UI.text(g, '조작: WASD 이동 · C/스페이스/왼클릭 도구 · X/F/오른클릭 행동 · E 메뉴 · Tab 줄 바꾸기 · M 소리', r[0] + r[2] / 2, r[1] + r[3] - 16 * u, { align: 'center', size: 0.75 });
    },
    onPointer(type, x, y, btn, r) {
      if (type !== 'down') return;
      const u = UI.u;
      for (const row of this.rows(r)) {
        const bx = r[0] + r[2] - 90 * u;
        if (UI.inRect(x, y, [bx, row.y, 14 * u, 14 * u])) { row.dec(); SD.Sound.play('smallSelect'); }
        if (UI.inRect(x, y, [bx + 70 * u, row.y, 14 * u, 14 * u])) { row.inc(); SD.Sound.play('smallSelect'); }
      }
    },
  });
  // ── 나가기 탭 ──
  UI.addTab({
    id: 'exit', name: '나가기', order: 90,
    draw(g, r) {
      const u = UI.u;
      UI.text(g, '오늘 진행한 내용은 잠을 자야 저장돼요.', r[0] + r[2] / 2, r[1] + 20 * u, { align: 'center' });
      this._btn = [r[0] + r[2] / 2 - 50 * u, r[1] + 44 * u, 100 * u, 22 * u];
      UI.frame(g, this._btn[0], this._btn[1], this._btn[2], this._btn[3]);
      UI.text(g, '타이틀 화면으로', r[0] + r[2] / 2, this._btn[1] + 6 * u, { align: 'center' });
    },
    onPointer(type, x, y) {
      if (type === 'down' && this._btn && UI.inRect(x, y, this._btn)) { UI.closeAll(); SD.Game.toTitle(); }
    },
  });

  // ═════════════ 간단한 상점 ═════════════
  // opts: { title, owner, portrait, greeting, stock:[{ id, price, q, stock }], sell: true | (st)=>bool, onBuy(item, n), onSell }
  UI.openShop = function (opts) {
    const o = opts || {};
    const stock = (o.stock || []).map((s) => Object.assign({ q: 0, price: (SD.Items.get(s.id) || {}).buyPrice || ((SD.Items.get(s.id) || {}).price || 0) * 2 }, s));
    const sh = {
      id: 'shop', blocking: true, scroll: 0, rows: [], hover: -1,
      rect() { const u = UI.u; const w = Math.min(UI.W - 8 * u, 230 * u), h = Math.min(UI.H - 10 * u, 160 * u); return [Math.round((UI.W - w) / 2), Math.round((UI.H - h) / 2), w, h]; },
      onClose() { SD.Sound.play('menuClose'); },
      onKey(act) {
        if (isClose(act)) { UI.pop(this); return true; }
        if (act === 'up') this.scroll = Math.max(0, this.scroll - 1);
        if (act === 'down') this.scroll = Math.min(Math.max(0, stock.length - 5), this.scroll + 1);
        return true;
      },
      buy(item, n) {
        const def = SD.Items.get(item.id);
        let k = Math.min(n, item.stock == null ? n : item.stock);
        if (k <= 0) return;
        const cost = item.price * k;
        if (SD.G.money < cost) { SD.Sound.play('cancel'); SD.UI.hud('돈이 모자라요.', { kind: 'error' }); return; }
        if (!SD.Inv.canAdd(item.id, k, item.q)) { SD.Sound.play('cancel'); SD.UI.hud('가방이 꽉 찼어요!', { kind: 'error' }); return; }
        SD.G.money -= cost;
        SD.Inv.add(item.id, k, item.q, null, { silent: true });
        if (item.stock != null) item.stock -= k;
        SD.Sound.play('purchase');
        if (o.onBuy) SD.Mods.safe('shop.onBuy', o.onBuy, item, k);
        void def;
      },
      sell(i, all) {
        const st = SD.G.inv[i];
        if (!st) return;
        const ok = typeof o.sell === 'function' ? o.sell(st) : o.sell !== false;
        if (!ok || !SD.Items.canSell(st)) { SD.Sound.play('cancel'); return; }
        const n = all ? st.n : 1;
        const price = SD.Items.sellPrice(st) * n;
        SD.G.money += price;
        SD.Inv.removeAt(i, n);
        SD.Sound.play('coin');
        SD.FX.text(SD.G.player.x, SD.G.player.y - 30, `+${U.fmt(price)}G`, { color: '#ffe36a' });
        if (o.onSell) SD.Mods.safe('shop.onSell', o.onSell, st, n);
      },
      onPointer(type, x, y, btn, e) {
        if (type === 'wheel') { this.scroll = U.clamp(this.scroll + btn, 0, Math.max(0, stock.length - 5)); return true; }
        if (type !== 'down') return true;
        const row = this.rows.find((rr) => UI.inRect(x, y, rr.r));
        if (row) { this.buy(row.item, e && e.shiftKey ? 5 : 1); return true; }
        const r = this.rect();
        const grid = this.grid(r);
        for (let i = 0; i < 36; i++) {
          const [sx, sy] = grid.at(i);
          if (UI.inRect(x, y, [sx, sy, grid.slot, grid.slot])) { this.sell(i, btn !== 2); return true; }
        }
        if (!UI.inRect(x, y, r)) UI.pop(this);
        return true;
      },
      grid(r) {
        const u = UI.u, slot = 12 * u, gap = u;
        const gx = r[0] + r[2] - 12 * (slot + gap) - 8 * u, gy = r[1] + r[3] - 3 * (slot + gap) - 8 * u;
        return { slot, gap, at: (i) => [gx + (i % 12) * (slot + gap), gy + Math.floor(i / 12) * (slot + gap)] };
      },
      draw(g) {
        const u = UI.u;
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, UI.W, UI.H);
        const r = this.rect();
        // 주인 초상화 + 인사말
        const lw = 64 * u;
        UI.frame(g, r[0], r[1], lw, r[3]);
        const pt = typeof o.portrait === 'function' ? o.portrait() : o.portrait;
        if (pt) g.drawImage(pt, Math.round(r[0] + (lw - pt.width * u * 0.8) / 2), r[1] + 6 * u, pt.width * u * 0.8, pt.height * u * 0.8);
        if (o.owner) UI.text(g, o.owner, r[0] + lw / 2, r[1] + 62 * u, { align: 'center' });
        const lines = UI.wrap(g, o.greeting || '어서 오세요!', lw - 10 * u, { size: 0.85 });
        lines.forEach((l, i) => UI.text(g, l, r[0] + 5 * u, r[1] + 76 * u + i * UI.lineH() * 0.95, { size: 0.85 }));
        // 판매 목록
        const lx = r[0] + lw + 2 * u, lwid = r[2] - lw - 2 * u;
        const listH = r[3] - 3 * 13 * u - 14 * u;
        UI.frame(g, lx, r[1], lwid, listH);
        UI.text(g, o.title || '상점', lx + 8 * u, r[1] + 5 * u, { size: 1 });
        this.rows = [];
        const rh = 18 * u;
        const nVis = Math.floor((listH - 22 * u) / rh);
        for (let i = 0; i < nVis && i + this.scroll < stock.length; i++) {
          const it = stock[i + this.scroll];
          const ry = r[1] + 18 * u + i * rh;
          const rr = [lx + 5 * u, ry, lwid - 10 * u, rh - u];
          const hov = UI.inRect(UI.mouse.x, UI.mouse.y, rr);
          UI.frame(g, rr[0], rr[1], rr[2], rr[3], 'slot');
          if (hov) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(rr[0], rr[1], rr[2], rr[3]); UI.hoverStack = { id: it.id, n: 1, q: it.q }; }
          UI.drawStack(g, { id: it.id, n: 1, q: it.q }, rr[0] + u, rr[1] + 0.5 * u, 1);
          UI.text(g, SD.Items.name(it.id) + (it.stock != null ? ` (${it.stock})` : ''), rr[0] + 20 * u, rr[1] + 4 * u, { color: it.stock === 0 ? '#9a8a7a' : C.text });
          UI.img(g, SD.HUD.icon('coin'), rr[0] + rr[2] - 10 * u, rr[1] + 5 * u, 1);
          UI.text(g, U.fmt(it.price), rr[0] + rr[2] - 12 * u, rr[1] + 4 * u, { align: 'right', color: SD.G.money < it.price ? '#b8301e' : C.text });
          this.rows.push({ r: rr, item: it });
        }
        // 내 가방 (팔기)
        const gy0 = r[1] + listH + 2 * u;
        UI.frame(g, lx, gy0, lwid, r[1] + r[3] - gy0);
        const grid = this.grid(r);
        for (let i = 0; i < 36; i++) {
          const [sx, sy] = grid.at(i);
          UI.frame(g, sx, sy, grid.slot, grid.slot, 'slot');
          const st = SD.G.inv[i];
          if (st) {
            UI.drawStack(g, st, sx - 2 * u * 0, sy, 0.75);
            if (UI.inRect(UI.mouse.x, UI.mouse.y, [sx, sy, grid.slot, grid.slot])) UI.hoverStack = st;
          }
        }
        UI.text(g, `${U.fmt(SD.G.money)}G`, lx + 8 * u, gy0 + 5 * u);
      },
    };
    SD.Sound.play('menuOpen');
    return UI.push(sh);
  };

  // ═════════════ 하루 정산 + 레벨업 ═════════════
  UI.daySummary = function (sum, onDone) {
    const levelUps = sum.levelUps || [];
    const s = {
      id: 'summary', blocking: true, stage: 0, shown: 0,
      onKey(act) { if (isConfirm(act) || isClose(act)) this.next(); return true; },
      onPointer(type) { if (type === 'down') this.next(); return true; },
      next() {
        if (this._t < 0.4) return;
        this._t = 0;
        SD.Sound.play('select');
        if (this.stage < levelUps.length) { this.stage++; SD.Sound.play('levelUp'); return; }
        UI.pop(this);
        if (onDone) onDone();
      },
      update(dt) { if (this.shown < sum.total) { this.shown = Math.min(sum.total, this.shown + Math.max(1, sum.total) * dt * 1.5); if (Math.random() < 0.3) SD.Sound.play('tick', { minGap: 0.05 }); } },
      draw(g) {
        const u = UI.u;
        g.fillStyle = '#100804'; g.fillRect(0, 0, UI.W, UI.H);
        const w = Math.min(UI.W - 8 * u, 200 * u), h = Math.min(UI.H - 8 * u, 150 * u);
        const x = Math.round((UI.W - w) / 2), y = Math.round((UI.H - h) / 2);
        if (this.stage > 0 && levelUps[this.stage - 1]) {
          const lv = levelUps[this.stage - 1];
          const sk = SD.Skills.get(lv.skill) || { name: lv.skill, desc: '' };
          UI.frame(g, x, y, w, h);
          UI.text(g, '레벨 업!', x + w / 2, y + 12 * u, { align: 'center', size: 1.6, color: '#c8501e' });
          UI.text(g, `${sk.name} 레벨 ${lv.level}`, x + w / 2, y + 40 * u, { align: 'center', size: 1.3 });
          const lines = UI.wrap(g, sk.desc || '', w - 30 * u);
          lines.forEach((l, i) => UI.text(g, l, x + w / 2, y + 64 * u + i * UI.lineH(), { align: 'center' }));
          const extra = SD.Mods.reduce('levelUpText', [], lv.skill, lv.level);
          extra.forEach((l, i) => UI.text(g, l, x + w / 2, y + 90 * u + i * UI.lineH(), { align: 'center', color: '#2a6a1a' }));
          UI.text(g, '계속하려면 누르세요', x + w / 2, y + h - 16 * u, { align: 'center', size: 0.8, color: '#9a6a3a' });
          return;
        }
        UI.frame(g, x, y, w, h);
        UI.text(g, '오늘의 출하', x + w / 2, y + 8 * u, { align: 'center', size: 1.3 });
        let cy = y + 28 * u;
        for (const gr of sum.groups) {
          UI.text(g, gr.name, x + 14 * u, cy);
          UI.text(g, `${U.fmt(gr.total)}G`, x + w - 14 * u, cy, { align: 'right', color: gr.total ? '#2a6a1a' : '#9a7a5a' });
          g.fillStyle = '#d8a868'; g.fillRect(x + 12 * u, cy + UI.lineH(), w - 24 * u, Math.max(1, u / 2));
          cy += UI.lineH() * 1.35;
        }
        UI.text(g, '합계', x + 14 * u, cy + 2 * u, { size: 1.15 });
        UI.text(g, `${U.fmt(Math.round(this.shown))}G`, x + w - 14 * u, cy + 2 * u, { align: 'right', size: 1.15, color: '#c8501e' });
        cy += UI.lineH() * 1.8;
        for (const n of sum.notes || []) {
          for (const l of UI.wrap(g, n, w - 28 * u, { size: 0.85 })) { UI.text(g, l, x + 14 * u, cy, { size: 0.85 }); cy += UI.lineH() * 0.95; }
        }
        UI.text(g, sum.title || '', x + w / 2, y + h - 26 * u, { align: 'center', size: 0.9 });
        UI.text(g, '확인을 누르면 아침이 와요', x + w / 2, y + h - 14 * u, { align: 'center', size: 0.8, color: '#9a6a3a' });
      },
    };
    return UI.push(s);
  };
})();
