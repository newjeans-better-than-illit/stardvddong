'use strict';
// ════════════════════════════════════════════════════════════════════
//  스킬 5종 (원작 XP 기준) · 레벨업 대기열(밤에 보여줌) · 기력/체력
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;

  const Skills = (SD.Skills = {
    LIST: [
      { id: 'farming', name: '농사', color: '#5fae3e', desc: '괭이와 물뿌리개가 덜 지치고, 좋은 품질의 똥이 자란다.' },
      { id: 'mining', name: '광산', color: '#8a8a9a', desc: '곡괭이가 덜 지치고, 광석이 더 많이 나온다.' },
      { id: 'foraging', name: '채집', color: '#3f8a2e', desc: '도끼가 덜 지치고, 채집 똥의 품질이 좋아진다.' },
      { id: 'fishing', name: '낚시', color: '#3f6fd0', desc: '낚싯대가 덜 지치고, 물고기가 잘 잡힌다.' },
      { id: 'combat', name: '전투', color: '#c8402f', desc: '체력이 늘고, 몬스터를 더 세게 때린다.' },
    ],
    // 원작 경험치 누적 기준 (레벨 1~10)
    XP: [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000],
    MAX: 10,
    get(id) { return Skills.LIST.find((s) => s.id === id) || null; },
    // 모듈이 스킬을 더할 수 있다
    define(id, def) { if (!Skills.get(id)) Skills.LIST.push(Object.assign({ id, name: id, color: '#888' }, def)); },
    state(id) {
      const G = SD.G;
      G.skills = G.skills || {};
      if (!G.skills[id]) G.skills[id] = { xp: 0, lvl: 0 };
      return G.skills[id];
    },
    // 버프 포함 레벨
    level(id) {
      if (!SD.G) return 0;
      return SD.Mods.reduce('skillLevel', Skills.state(id).lvl, id);
    },
    baseLevel(id) { return SD.G ? Skills.state(id).lvl : 0; },
    xp(id) { return SD.G ? Skills.state(id).xp : 0; },
    levelForXP(xp) { let l = 0; while (l < Skills.MAX && xp >= Skills.XP[l]) l++; return l; },
    // 다음 레벨까지 진행도 0..1
    progress(id) {
      const s = Skills.state(id);
      if (s.lvl >= Skills.MAX) return 1;
      const lo = s.lvl === 0 ? 0 : Skills.XP[s.lvl - 1], hi = Skills.XP[s.lvl];
      return (s.xp - lo) / (hi - lo);
    },
    addXP(id, n) {
      if (!SD.G || !n) return;
      const s = Skills.state(id);
      const amt = SD.Mods.reduce('xpGain', n, id);
      s.xp += amt;
      const nl = Skills.levelForXP(s.xp);
      while (s.lvl < nl) {
        s.lvl++;
        SD.G.levelUps = SD.G.levelUps || [];
        SD.G.levelUps.push({ skill: id, level: s.lvl });
        SD.Mods.emit('levelUp', id, s.lvl);
        if (id === 'combat') { SD.G.player.maxHealth += 5; SD.G.player.health += 5; }
      }
      SD.Mods.emit('xp', id, amt, s.xp);
    },
    setLevel(id, lvl) {
      const s = Skills.state(id);
      s.lvl = Math.max(0, Math.min(Skills.MAX, lvl));
      s.xp = s.lvl === 0 ? 0 : Skills.XP[s.lvl - 1];
    },
    // 원작: 도구 기력 소모 = 기본 - 스킬레벨×0.1 (0 미만 없음)
    energyCost(base, skill) {
      return Math.max(0, base - Skills.level(skill) * 0.1);
    },
  });

  // ───────────── 기력 · 체력 ─────────────
  SD.Stats = {
    useEnergy(n) {
      const p = SD.G.player;
      const amt = SD.Mods.reduce('energyUse', n);
      if (amt <= 0) return;
      const before = p.energy;
      p.energy -= amt;
      if (before > 0 && p.energy <= 0) {
        p.exhausted = true;
        SD.UI.hud('기진맥진... 더 무리하면 쓰러져요!', { kind: 'error' });
        SD.Sound.play('clockWarn');
      }
      if (p.energy < -15) { p.energy = -15; SD.Day.passOut('exhausted'); }
    },
    addEnergy(n) {
      const p = SD.G.player;
      p.energy = Math.min(p.maxEnergy, p.energy + n);
      if (p.energy > 0) p.exhausted = false;
    },
    damage(n, opts) {
      const p = SD.G.player;
      const amt = Math.max(1, Math.round(SD.Mods.reduce('playerDamage', n, opts)));
      if (p._invuln > 0) return 0;
      p.health -= amt;
      p._invuln = 1.0;
      SD.Sound.play('hurt');
      SD.FX.damage(p.x, p.y - 30, amt, { color: '#ff4a3a' });
      SD.FX.flash('#ff2020', 0.2, 0.25);
      if (p.health <= 0) { p.health = 0; SD.Mods.first('playerDefeated', opts) || SD.Day.passOut('defeated'); }
      return amt;
    },
    heal(n) { const p = SD.G.player; p.health = Math.min(p.maxHealth, p.health + n); },
  };
})();
