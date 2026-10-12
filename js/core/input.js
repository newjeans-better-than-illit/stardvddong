'use strict';
// ════════════════════════════════════════════════════════════════════
//  입력: 키보드 · 마우스(월드 칸, 도구 범위) · 터치(방향 패드 + 도구/행동/메뉴)
//  동작 이름: up down left right use action menu cancel confirm slot0~slot11
//            rowNext rowPrev slotPrev slotNext mute
//  UI 가 먼저 받는다: SD.UI.onKey(동작, 이벤트) / SD.UI.onPointer(종류, x, y, 버튼) 가 true 면 소비
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;

  const KEYMAP = {
    w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
    c: 'use', ' ': 'use', x: 'action', f: 'action', e: 'menu', i: 'menu', escape: 'cancel', enter: 'confirm',
    tab: 'rowNext', q: 'slotPrev', r: 'slotNext', m: 'mute',
    '1': 'slot0', '2': 'slot1', '3': 'slot2', '4': 'slot3', '5': 'slot4', '6': 'slot5', '7': 'slot6', '8': 'slot7', '9': 'slot8', '0': 'slot9', '-': 'slot10', '=': 'slot11',
  };

  const down = new Set();
  const pressed = new Set();
  const released = new Set();
  const mouse = { x: -1, y: -1, wx: 0, wy: 0, tx: 0, ty: 0, inside: false, left: false, right: false, lastMove: -99, wheel: 0, type: 'mouse' };

  const Input = (SD.Input = {
    KEYMAP, mouse,
    down: (a) => down.has(a),
    pressed: (a) => pressed.has(a),
    released: (a) => released.has(a),
    consume(a) { pressed.delete(a); },
    press(a) { if (!down.has(a)) pressed.add(a); down.add(a); },
    release(a) { if (down.has(a)) released.add(a); down.delete(a); },
    clear() { for (const a of down) released.add(a); down.clear(); mouse.left = mouse.right = false; },
    endFrame() { pressed.clear(); released.clear(); mouse.wheel = 0; },
    bind(key, action) { KEYMAP[key.toLowerCase()] = action; },
    // 마우스로 칸을 고르는 중인가 (최근 2.5초 안에 움직였거나 버튼을 누름)
    mouseActive() { return mouse.inside && mouse.type === 'mouse' && SD.Time.real - mouse.lastMove < 2.5; },
    updateWorld() {
      if (!SD.Render || mouse.x < 0) return;
      const w = SD.Render.screenToWorld(mouse.x, mouse.y);
      mouse.wx = w.x; mouse.wy = w.y;
      mouse.tx = Math.floor(w.x / SD.TILE); mouse.ty = Math.floor(w.y / SD.TILE);
    },
    isTouch: false,
  });

  function keyName(e) {
    const k = (e.key || '').toLowerCase();
    return k === 'spacebar' ? ' ' : k;
  }

  Input.attach = function (canvas) {
    window.addEventListener('keydown', (e) => {
      SD.Sound.unlock();
      const k = keyName(e);
      const action = KEYMAP[k] || (k === 'tab' && e.shiftKey ? 'rowPrev' : null);
      let act = action;
      if (k === 'tab' && e.shiftKey) act = 'rowPrev';
      if (act === 'rowNext' || act === 'rowPrev' || k === ' ' || k.startsWith('arrow') || k === 'tab') e.preventDefault();
      if (SD.UI && SD.UI.onKey && !e.repeat) {
        if (SD.UI.onKey(act, e, k)) { e.preventDefault(); return; }
      }
      if (!act) return;
      if (e.repeat) { down.add(act); return; }
      Input.press(act);
    });
    window.addEventListener('keyup', (e) => {
      const k = keyName(e);
      const act = KEYMAP[k];
      if (act) Input.release(act);
      if (k === 'tab') { Input.release('rowNext'); Input.release('rowPrev'); }
      if (SD.UI && SD.UI.onKeyUp) SD.UI.onKeyUp(act, e, k);
    });
    window.addEventListener('blur', () => Input.clear());

    const pos = (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    canvas.addEventListener('pointermove', (e) => {
      pos(e);
      mouse.inside = true;
      mouse.type = e.pointerType || 'mouse';
      if (mouse.type === 'mouse') mouse.lastMove = SD.Time ? SD.Time.real : 0;
      if (SD.UI && SD.UI.onPointer) SD.UI.onPointer('move', mouse.x, mouse.y, -1, e);
    });
    canvas.addEventListener('pointerleave', () => { mouse.inside = false; });
    canvas.addEventListener('pointerdown', (e) => {
      SD.Sound.unlock();
      pos(e);
      mouse.inside = true;
      mouse.type = e.pointerType || 'mouse';
      mouse.lastMove = SD.Time ? SD.Time.real : 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      if (SD.UI && SD.UI.onPointer && SD.UI.onPointer('down', mouse.x, mouse.y, e.button, e)) { e.preventDefault(); return; }
      if (mouse.type !== 'mouse') {
        // 터치: 농부 바로 옆 칸을 누르면 그 칸에 도구, 아니면 행동
        Input.updateWorld();
        Input.touchTap = { tx: mouse.tx, ty: mouse.ty };
        return;
      }
      if (e.button === 0) { mouse.left = true; Input.press('use'); }
      else if (e.button === 2) { mouse.right = true; Input.press('action'); }
    });
    window.addEventListener('pointerup', (e) => {
      if (SD.UI && SD.UI.onPointer) SD.UI.onPointer('up', mouse.x, mouse.y, e.button, e);
      if (e.button === 0 && mouse.left) { mouse.left = false; Input.release('use'); }
      if (e.button === 2 && mouse.right) { mouse.right = false; Input.release('action'); }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (SD.UI && SD.UI.onPointer && SD.UI.onPointer('wheel', mouse.x, mouse.y, e.deltaY > 0 ? 1 : -1, e)) return;
      mouse.wheel += e.deltaY > 0 ? 1 : -1;
    }, { passive: false });

    // ── 터치 버튼 (거친 포인터에서만 보임) ──
    const touch = document.getElementById('touch');
    if (touch) {
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      Input.isTouch = coarse;
      touch.hidden = !coarse;
      touch.querySelectorAll('[data-act]').forEach((b) => {
        const act = b.dataset.act;
        const on = (ev) => {
          ev.preventDefault();
          SD.Sound.unlock();
          if (SD.UI && SD.UI.onKey && SD.UI.onKey(act, ev, act)) return;
          Input.press(act); b.classList.add('on');
        };
        const off = (ev) => { ev.preventDefault(); Input.release(act); b.classList.remove('on'); };
        b.addEventListener('pointerdown', on);
        b.addEventListener('pointerup', off);
        b.addEventListener('pointercancel', off);
        b.addEventListener('pointerleave', off);
      });
    }
  };
})();
