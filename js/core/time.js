'use strict';
// ════════════════════════════════════════════════════════════════════
//  시간 · 날씨 · 하루 순환
//  게임 10분 = 현실 7초, 오전 6시 시작, 자정 경고, 새벽 2시 기절
//  하루 끝 파이프라인 훅:
//    'dayEnding'(info)   — 밤사이 처리(기계 등). info.addEarning(group, 금액, 설명)
//    'shippingTally'(info) — 출하 정산에 항목 추가
//    'dayStarted'(info)  — 날짜가 바뀐 직후 (편지·TV·축제 준비)
//    'newDay'(info)      — 아침, 화면이 밝아질 때
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const U = SD.util;

  const Time = (SD.Time = {
    real: 0,          // 현실 초 (항상 흐름)
    anim: 0,          // 연출 시계 (일시정지 때 멈춤)
    acc: 0,           // 10분 누적 (초)
    SECONDS_PER_10: 7,
    DAY_START: 360,
    PASS_OUT: 1560,   // 새벽 2시 (26:00)
    paused: false,
    fraction() { return U.clamp(Time.acc / Time.SECONDS_PER_10, 0, 1); },
    dayOfWeek(day) { return ((day == null ? SD.G.day : day) - 1) % 7; },
    weekday(day) { return SD.WEEKDAYS[Time.dayOfWeek(day)]; },
    dateText(G) { const g = G || SD.G; return `${SD.SEASON_NAMES[g.season]} ${g.day}일 (${Time.weekday(g.day)})`; },
    timeText(min) { return U.timeText(min == null ? SD.G.time : min); },
    // 게임 진행 (main 루프가 일시정지가 아닐 때 부른다)
    update(dt) {
      const G = SD.G;
      if (!G || SD.Day.busy) return;
      if (SD.Mods.reduce('timePaused', false)) return;
      Time.acc += dt;
      while (Time.acc >= Time.SECONDS_PER_10) {
        Time.acc -= Time.SECONDS_PER_10;
        Time.tick10();
        if (SD.Day.busy) break;
      }
    },
    tick10() {
      const G = SD.G;
      G.time += 10;
      SD.Mods.emit('timeChanged', G.time);
      if (G.time === 1440) { SD.UI.hud('자정이 지났어요. 새벽 2시 전에는 잠자리에 들어야 해요!', { kind: 'error' }); SD.Sound.play('clockWarn'); }
      if (G.time === 1500) { SD.UI.hud('너무 늦었어요... 졸려요.', { kind: 'error' }); }
      if (G.time >= Time.PASS_OUT) SD.Day.passOut('late');
    },
    setTime(min) { SD.G.time = U.clamp(Math.round(min / 10) * 10, 360, 1550); Time.acc = 0; SD.Mods.emit('timeChanged', SD.G.time); },
  });

  // ───────────── 날씨 ─────────────
  const Weather = (SD.Weather = {
    NAMES: { sun: '맑음', rain: '비', storm: '폭풍우', snow: '눈', wind: '바람' },
    name: (w) => Weather.NAMES[w] || w,
    isRaining() { const w = SD.G && SD.G.weather; return w === 'rain' || w === 'storm'; },
    // 원작과 비슷한 확률
    roll(season, day, year) {
      let w = 'sun';
      const r = Math.random();
      if (day === 1) w = 'sun';
      else if (season === 0 && day === 3 && year === 1) w = 'rain';
      else if (season === 3) w = r < 0.45 ? 'snow' : 'sun';
      else if (season === 1) {
        const rain = 0.12 + day * 0.003;
        w = r < rain ? (Math.random() < 0.5 ? 'storm' : 'rain') : 'sun';
      } else {
        if (r < 0.183) w = Math.random() < (season === 0 && year === 1 ? 0.05 : 0.2) ? 'storm' : 'rain';
        else if (Math.random() < 0.2) w = 'wind';
      }
      return SD.Mods.reduce('weatherTomorrow', w, season, day, year);
    },
    set(w) { SD.G.weather = w; SD.Mods.emit('weatherChanged', w); },
  });

  // ───────────── 하루 순환 ─────────────
  const Day = (SD.Day = {
    busy: false,
    fade: 0,
    _ask: 0,
    _askedRecently() { return Day._ask > 0; },
    askSleep() {
      if (Day.busy) return;
      Day._ask = 1;
      const late = SD.G.time >= 1320;
      SD.UI.question(late ? '많이 늦었어요. 이제 잘까요?' : '오늘은 이만 잘까요? (자면 자동 저장돼요)', [
        { label: '잔다', fn: () => Day.sleep() },
        { label: '아직 안 잔다' },
      ]);
    },
    sleep() { Day.end({ passedOut: false }); },
    // 새벽 2시·기진맥진·전투 패배
    passOut(reason) {
      if (Day.busy) return;
      Day.busy = true;
      const p = SD.G.player;
      SD.UI.closeAll && SD.UI.closeAll();
      SD.Sound.play('passOut');
      SD.Farmer.play(p, 'passOut', { onDone: () => { Day.busy = false; Day.end({ passedOut: true, reason }); } });
    },
    // 페이드 → 정산 → 날짜 넘기기 → 저장 → 아침
    end(opts) {
      if (Day.busy) return;
      Day.busy = true;
      const o = opts || {};
      SD.Input.clear();
      if (!o.passedOut) SD.Sound.play('sleep');
      Day._fadeTo(1, 0.8, () => {
        let summary;
        try { summary = Day.process(o); } catch (e) { console.error('[SD] 하루 처리 실패', e); summary = { lines: [], groups: [], total: 0, notes: ['(오류가 있었지만 다음 날로 넘어갔어요)'], levelUps: [] }; }
        const finish = () => {
          SD.Save.save();
          Day._fadeTo(0, 0.8, () => {
            Day.busy = false;
            SD.Sound.play('morning');
            SD.Mods.emit('newDay', summary.info);
            SD.UI.hud(`${Time.dateText()} · ${Weather.name(SD.G.weather)}`, { icon: null });
          });
        };
        if (SD.UI.daySummary) SD.UI.daySummary(summary, finish);
        else finish();
      });
    },
    _fadeTo(target, dur, cb) {
      const from = Day.fade;
      let t = 0;
      Day._fadeAnim = (dt) => {
        t += dt;
        Day.fade = U.lerp(from, target, U.clamp(t / dur, 0, 1));
        if (t >= dur) { Day._fadeAnim = null; Day.fade = target; cb && cb(); }
      };
    },
    updateFade(dt) { if (Day._fadeAnim) Day._fadeAnim(dt); if (Day._ask > 0 && !Day.busy) Day._ask = Math.max(0, Day._ask - dt * 0); },
    // 실제 하루 처리 (화면이 까만 동안)
    process(o) {
      const G = SD.G;
      const info = {
        passedOut: !!o.passedOut, reason: o.reason || null, day: G.day, season: G.season, year: G.year, weather: G.weather, time: G.time,
        earnings: [], notes: [],
        addEarning(group, amount, label, icon) { info.earnings.push({ group, amount: Math.floor(amount), label, icon }); },
        note(text) { info.notes.push(text); },
      };
      // 1) 밤사이 처리 (모듈: 기계, 동물…)
      SD.Mods.emit('dayEnding', info);
      for (const loc of SD.World.all()) SD.Farming.dayEndLocation(loc, info);
      // 2) 출하 정산
      const lines = [];
      for (const st of G.shipping) {
        const def = SD.Items.get(st.id);
        if (!def) continue;
        const each = SD.Items.sellPrice(st);
        const group = def.ship || SD.Items.category(st.id).ship || 'other';
        lines.push({ id: st.id, q: st.q || 0, n: st.n, each, total: each * st.n, group });
        info.addEarning(group, each * st.n, null, st.id);
      }
      SD.Mods.emit('shippingTally', info, lines);
      const groups = SD.SHIP_GROUPS.map((gr) => ({ id: gr.id, name: gr.name, total: info.earnings.filter((e) => e.group === gr.id).reduce((s, e) => s + e.amount, 0) }));
      const total = info.earnings.reduce((s, e) => s + e.amount, 0);
      G.money += total;
      G.stats.totalEarned = (G.stats.totalEarned || 0) + total;
      G.lastShipping = { lines, total };
      G.shipping = [];
      // 3) 기절 벌금 (원작: 소지금 10%, 최대 1000G — 집 안에서는 없음)
      let fine = 0;
      const p = G.player;
      if (o.passedOut && p.loc !== 'FarmHouse') {
        fine = Math.min(1000, Math.floor(G.money * 0.1));
        fine = SD.Mods.reduce('passOutFine', fine, o.reason);
        G.money -= fine;
        if (fine > 0) info.note(`쓰러진 당신을 마을 사람이 집까지 데려다주었어요. 치료비로 ${U.fmt(fine)}G를 냈어요.`);
      }
      // 4) 날짜
      const bedTime = G.time;
      G.day++;
      let newSeason = false;
      if (G.day > SD.DAYS_PER_SEASON) {
        G.day = 1; G.season = (G.season + 1) % 4; newSeason = true;
        if (G.season === 0) G.year++;
      }
      // 5) 날씨 · 행운
      G.weather = G.tomorrow || 'sun';
      if (G.season === 3 && (G.weather === 'rain' || G.weather === 'storm')) G.weather = 'snow';
      if (G.season !== 3 && G.weather === 'snow') G.weather = 'rain';
      if (G.season === 3 && G.weather === 'wind') G.weather = 'sun';
      if (G.day === 1) G.weather = 'sun';
      const nd = G.day === SD.DAYS_PER_SEASON ? 1 : G.day + 1;
      const ns = G.day === SD.DAYS_PER_SEASON ? (G.season + 1) % 4 : G.season;
      const ny = ns === 0 && G.day === SD.DAYS_PER_SEASON ? G.year + 1 : G.year;
      G.tomorrow = Weather.roll(ns, nd, ny);
      G.luck = SD.Mods.reduce('dailyLuck', Math.min(0.1, (Math.floor(Math.random() * 201) - 100) / 1000));
      Object.assign(info, { day: G.day, season: G.season, year: G.year, weather: G.weather, newSeason });
      SD.Mods.emit('dayStarted', info);
      // 6) 각 지역의 아침 (계절 시듦, 비, 나무 성장, 채집물)
      for (const loc of SD.World.all()) SD.Farming.dayStartLocation(loc, info);
      if (newSeason) info.note(`${SD.SEASON_NAMES[G.season]}이 왔어요! 제철이 아닌 똥은 시들어 버렸어요.`);
      // 7) 농부 회복 (원작: 자정 넘어 자면 덜 회복, 쓰러지면 절반)
      let e = p.maxEnergy;
      if (o.passedOut) e = Math.floor(p.maxEnergy / 2);
      else if (bedTime > 1440) e = Math.floor(p.maxEnergy * (1 - (bedTime - 1440) / 240 * 0.5));
      if (p.exhausted && !o.passedOut) e = Math.floor(e * 0.85);
      p.energy = e; p.exhausted = false;
      p.health = p.maxHealth;
      // 8) 아침 6시, 침대에서 일어난다
      G.time = Time.DAY_START; Time.acc = 0;
      G.daysPlayed = (G.daysPlayed || 0) + 1;
      const bed = SD.Day.bedSpot();
      SD.World.place(bed.loc, bed.x, bed.y, 'down');
      p._anim = null;
      const levelUps = (G.levelUps || []).slice();
      G.levelUps = [];
      return { info, lines, groups, total, notes: info.notes, levelUps, fine, title: `${SD.SEASON_NAMES[info.season]} ${info.day}일 아침` };
    },
    // 잠에서 깨는 곳: 모듈이 'bedSpot' 훅으로 바꿀 수 있다 (집 업그레이드 등)
    bedSpot() {
      return SD.Mods.reduce('bedSpot', { loc: 'FarmHouse', x: 10, y: 6 });
    },
  });
})();
