'use strict';
// ════════════════════════════════════════════════════════════════════
//  소리: WebAudio 합성 효과음(Sound) + 음악 API 자리(Music, ambient 모듈이 구현)
//  Sound.define(이름, (S, opts) => {...}) 로 효과음 추가, Sound.play(이름, opts)
// ════════════════════════════════════════════════════════════════════
(function () {
  const SD = window.SD;
  const defs = Object.create(null);
  const lastPlay = Object.create(null);

  const Sound = (SD.Sound = {
    ctx: null,
    master: null,
    sfxBus: null,
    musicBus: null,
    noiseBuf: null,
    muted: false,
    volume: 0.8,
    musicVolume: 0.6,
    defs,

    unlock() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = this.volume;
        this.sfxBus.connect(this.master);
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicVolume;
        this.musicBus.connect(this.master);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        SD.Mods.emit('audioReady', this.ctx);
      } catch (e) {
        this.ctx = null;
      }
    },
    setMuted(m) {
      this.muted = !!m;
      if (this.master) this.master.gain.value = this.muted ? 0 : 1;
      try { localStorage.setItem('sdv2-muted', this.muted ? '1' : '0'); } catch (e) { /* 저장소 없음 */ }
    },
    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.sfxBus) this.sfxBus.gain.value = this.volume;
    },
    define(name, fn) { defs[name] = fn; },
    has(name) { return !!defs[name]; },
    play(name, opts) {
      if (!this.ctx || this.muted) return;
      const fn = defs[name];
      if (!fn) return;
      const o = opts || {};
      // 같은 소리가 한 프레임에 여러 번 겹치는 것 방지
      const now = this.ctx.currentTime;
      const minGap = o.minGap == null ? 0.03 : o.minGap;
      if (lastPlay[name] && now - lastPlay[name] < minGap) return;
      lastPlay[name] = now;
      try { fn(this, o); } catch (e) { /* 소리 실패는 게임에 영향 없음 */ }
    },

    // ── 합성 재료 ──
    tone(type, f0, f1, dur, vol, delay, dest) {
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.012, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest || this.sfxBus);
      o.start(t); o.stop(t + dur + 0.03);
      return o;
    },
    noise(dur, filterType, freq, vol, delay, q, dest) {
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq; f.Q.value = q || 1;
      const g = c.createGain();
      g.gain.setValueAtTime(Math.max(0.0002, vol), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(dest || this.sfxBus);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
      return s;
    },
    sweepNoise(dur, filterType, f0, f1, vol, delay, q) {
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = filterType; f.Q.value = q || 1;
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(this.sfxBus);
      s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.03);
    },
    // 뿌지직: 떨리는 톱니파 + 저역 잡음 (v1에서 이식, 수확 소리의 핵심)
    fart(len, pitch) {
      const c = this.ctx, t = c.currentTime;
      const dur = len || 0.35 + Math.random() * 0.35;
      const base = (pitch || 1) * (70 + Math.random() * 50);
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.7, t + dur);
      const lfo = c.createOscillator();
      lfo.type = 'square';
      lfo.frequency.setValueAtTime(22 + Math.random() * 14, t);
      lfo.frequency.linearRampToValueAtTime(14, t + dur);
      const lfoGain = c.createGain();
      lfoGain.gain.value = base * 0.5;
      lfo.connect(lfoGain).connect(o.frequency);
      const flutter = c.createGain();
      const fl = c.createOscillator();
      fl.type = 'sine'; fl.frequency.value = 31;
      const flg = c.createGain(); flg.gain.value = 0.35;
      fl.connect(flg).connect(flutter.gain);
      flutter.gain.value = 0.65;
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 700; filt.Q.value = 6;
      const env = c.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
      env.gain.setValueAtTime(0.3, t + dur * 0.7);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(flutter).connect(filt).connect(env).connect(this.sfxBus);
      o.start(t); lfo.start(t); fl.start(t);
      o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); fl.stop(t + dur + 0.05);
      this.noise(dur * 0.8, 'bandpass', 350, 0.12, 0, 2);
    },
    notes(list, type, vol, step, dur) {
      list.forEach((f, i) => { if (f) this.tone(type || 'triangle', f, f, dur || 0.18, vol || 0.08, i * (step || 0.09)); });
    },
  });

  try { Sound.muted = localStorage.getItem('sdv2-muted') === '1'; } catch (e) { /* 무시 */ }
  const vary = () => 0.9 + Math.random() * 0.2;
  const D = (n, f) => Sound.define(n, f);

  // ── 농사 ──
  D('harvest', (S) => { S.fart(); S.tone('sine', 520, 880, 0.12, 0.08, 0.05); });
  D('harvestSmall', (S) => { S.fart(0.22, 1.4); });
  D('pop', (S) => { S.tone('sine', 300 * vary(), 900, 0.07, 0.15); });
  D('hoe', (S) => { S.tone('sine', 140, 60, 0.12, 0.3); S.noise(0.1, 'lowpass', 900, 0.22); });
  D('dig', (S) => { S.noise(0.14, 'lowpass', 600, 0.3); S.tone('sine', 110, 50, 0.1, 0.2); });
  D('water', (S) => { S.noise(0.35, 'highpass', 2400, 0.12); S.noise(0.25, 'bandpass', 900, 0.08, 0.05); });
  D('refill', (S) => { S.noise(0.5, 'bandpass', 700, 0.15, 0, 3); S.tone('sine', 300, 600, 0.4, 0.05); });
  D('plant', (S) => { S.tone('sine', 420 * vary(), 820, 0.09, 0.15); S.noise(0.05, 'lowpass', 800, 0.1); });
  D('seedPlant', (S) => { S.noise(0.06, 'lowpass', 900, 0.18); S.tone('sine', 500, 700, 0.06, 0.08, 0.02); });
  D('witherClear', (S) => { S.noise(0.2, 'bandpass', 1200, 0.15, 0, 1.5); });
  // ── 나무·돌 ──
  D('chop', (S) => { S.noise(0.09, 'bandpass', 1300 * vary(), 0.4, 0, 4); S.tone('triangle', 220, 140, 0.08, 0.15); });
  D('axeMiss', (S) => { S.noise(0.12, 'bandpass', 1800, 0.12, 0, 1.2); });
  D('treeCrack', (S) => { S.noise(0.5, 'bandpass', 500, 0.3, 0, 2); S.tone('sawtooth', 90, 50, 0.5, 0.06); });
  D('treeFall', (S) => {
    S.noise(0.6, 'lowpass', 300, 0.5, 0.0, 1);
    S.tone('sine', 70, 35, 0.5, 0.45, 0.02);
    S.noise(0.4, 'bandpass', 2000, 0.08, 0.05, 0.8);
  });
  D('thud', (S) => { S.tone('sine', 90, 40, 0.25, 0.4); S.noise(0.15, 'lowpass', 400, 0.3); });
  D('leaves', (S) => { S.sweepNoise(0.3, 'bandpass', 3000, 1500, 0.08, 0, 0.7); });
  D('bush', (S) => { S.sweepNoise(0.35, 'bandpass', 2500, 1200, 0.12, 0, 0.8); });
  D('clink', (S) => { S.tone('triangle', 1600 * vary(), 1200, 0.1, 0.18); S.noise(0.06, 'highpass', 3000, 0.15); });
  D('stoneHit', (S) => { S.tone('square', 260 * vary(), 180, 0.06, 0.08); S.noise(0.08, 'bandpass', 1800, 0.25, 0, 2); });
  D('stoneCrack', (S) => { S.noise(0.25, 'bandpass', 900, 0.35, 0, 1.2); S.tone('square', 180, 90, 0.12, 0.08); S.noise(0.15, 'highpass', 3500, 0.12, 0.03); });
  D('boulderCrack', (S) => { S.noise(0.6, 'lowpass', 500, 0.5); S.tone('square', 120, 50, 0.4, 0.1); });
  D('grassCut', (S) => { S.sweepNoise(0.12, 'highpass', 4000, 2500, 0.1); });
  D('weedCut', (S) => { S.sweepNoise(0.14, 'bandpass', 2200, 1200, 0.18, 0, 1.2); });
  D('swish', (S) => { S.sweepNoise(0.16, 'bandpass', 1400, 3200, 0.16, 0, 1.4); });
  D('swordSwipe', (S) => { S.sweepNoise(0.18, 'bandpass', 900, 3600, 0.22, 0, 2); });
  D('toolCharge', (S, o) => { const lv = (o && o.level) || 1; S.tone('sine', 300 + lv * 120, 300 + lv * 120, 0.12, 0.1); S.tone('triangle', 600 + lv * 240, 600 + lv * 240, 0.08, 0.05, 0.02); });
  // ── 아이템 ──
  D('pickup', (S) => { S.tone('sine', 700 * vary(), 1300, 0.06, 0.1); });
  D('coin', (S) => { S.tone('square', 988, 988, 0.08, 0.06); S.tone('square', 1319, 1319, 0.22, 0.06, 0.08); });
  D('purchase', (S) => { S.tone('square', 1319, 1319, 0.05, 0.05); S.tone('square', 1760, 1760, 0.15, 0.05, 0.05); });
  D('ship', (S) => { S.tone('triangle', 330, 330, 0.08, 0.15); S.tone('triangle', 494, 494, 0.12, 0.15, 0.08); S.noise(0.15, 'lowpass', 600, 0.2); });
  D('binLid', (S) => { S.noise(0.08, 'lowpass', 500, 0.25); S.tone('square', 150, 120, 0.06, 0.05); });
  D('eat', (S) => { for (let i = 0; i < 3; i++) S.noise(0.06, 'bandpass', 1500, 0.2, i * 0.22, 3); });
  D('gulp', (S) => { S.tone('sine', 400, 150, 0.15, 0.2); });
  D('drink', (S) => { for (let i = 0; i < 3; i++) S.tone('sine', 300 + i * 40, 500, 0.08, 0.12, i * 0.15); });
  D('trash', (S) => { S.noise(0.2, 'lowpass', 800, 0.3); S.tone('square', 200, 80, 0.15, 0.06); });
  D('fanfare', (S) => { S.notes([523, 659, 784, 1047, 0, 1047], 'square', 0.06, 0.1, 0.22); S.notes([262, 330, 392, 523], 'triangle', 0.08, 0.1, 0.4); });
  D('newItem', (S) => { S.notes([784, 988, 1175, 1568], 'triangle', 0.08, 0.07, 0.25); });
  D('levelUp', (S) => { S.notes([392, 523, 659, 784, 1047], 'square', 0.06, 0.12, 0.3); });
  // ── UI ──
  D('error', (S) => { S.tone('square', 160, 120, 0.18, 0.08); });
  D('cancel', (S) => { S.tone('square', 330, 220, 0.1, 0.06); });
  D('menu', (S) => { S.tone('sine', 660, 660, 0.05, 0.08); });
  D('menuOpen', (S) => { S.tone('sine', 520, 780, 0.08, 0.1); S.noise(0.05, 'highpass', 4000, 0.05); });
  D('menuClose', (S) => { S.tone('sine', 780, 520, 0.08, 0.1); });
  D('select', (S) => { S.tone('square', 880, 880, 0.03, 0.04); });
  D('hover', (S) => { S.tone('sine', 1200, 1200, 0.02, 0.02); });
  D('tick', (S) => { S.tone('square', 1800, 1800, 0.015, 0.025); });
  D('dialogue', (S) => { S.tone('square', 600 + Math.random() * 200, 600, 0.02, 0.025); });
  D('smallSelect', (S) => { S.tone('triangle', 1000, 1000, 0.04, 0.05); });
  // ── 하루 ──
  D('sleep', (S) => { [523, 659, 784, 1047].forEach((f, i) => S.tone('sine', f, f, 0.5, 0.08, i * 0.15)); });
  D('morning', (S) => { [784, 988, 1175].forEach((f, i) => S.tone('triangle', f, f, 0.3, 0.07, i * 0.1)); });
  D('passOut', (S) => { S.tone('sine', 400, 80, 0.8, 0.15); S.noise(0.3, 'lowpass', 300, 0.3, 0.6); });
  D('clockWarn', (S) => { S.notes([880, 0, 880], 'square', 0.05, 0.12, 0.08); });
  D('door', (S) => { S.noise(0.15, 'lowpass', 700, 0.25); S.tone('triangle', 180, 120, 0.15, 0.08, 0.05); });
  D('doorClose', (S) => { S.tone('sine', 120, 60, 0.12, 0.25); S.noise(0.08, 'lowpass', 500, 0.3); });
  D('stairs', (S) => { for (let i = 0; i < 3; i++) S.noise(0.05, 'lowpass', 900, 0.15, i * 0.08); });
  // ── 걸음 ──
  D('step_grass', (S) => { S.noise(0.05, 'highpass', 2600 * vary(), 0.035); });
  D('step_dirt', (S) => { S.noise(0.05, 'bandpass', 900 * vary(), 0.05, 0, 1.5); });
  D('step_wood', (S) => { S.tone('triangle', 180 * vary(), 140, 0.04, 0.06); S.noise(0.03, 'lowpass', 1200, 0.04); });
  D('step_stone', (S) => { S.noise(0.04, 'bandpass', 2400 * vary(), 0.05, 0, 3); });
  D('step_snow', (S) => { S.noise(0.07, 'lowpass', 1600 * vary(), 0.06); });
  D('step_water', (S) => { S.noise(0.08, 'bandpass', 1400 * vary(), 0.06, 0, 2); });
  // ── 물·날씨 ──
  D('splash', (S) => { S.noise(0.3, 'bandpass', 1200, 0.25, 0, 1); S.tone('sine', 600, 200, 0.12, 0.1); });
  D('smallSplash', (S) => { S.noise(0.15, 'bandpass', 1800, 0.12, 0, 1.5); });
  D('bubble', (S) => { S.tone('sine', 400 * vary(), 900, 0.06, 0.08); });
  D('thunder', (S) => {
    S.noise(2.2, 'lowpass', 180, 0.6, 0, 0.7);
    S.noise(0.5, 'lowpass', 900, 0.3, 0, 0.7);
    S.tone('sine', 50, 30, 1.6, 0.25, 0.05);
  });
  D('wind', (S) => { S.sweepNoise(1.4, 'bandpass', 400, 900, 0.06, 0, 0.6); });
  // ── 전투(광산 모듈이 쓸 기본값) ──
  D('hitEnemy', (S) => { S.noise(0.08, 'bandpass', 900, 0.35, 0, 1.5); S.tone('square', 220, 110, 0.08, 0.1); });
  D('hurt', (S) => { S.tone('square', 300, 120, 0.2, 0.12); S.noise(0.1, 'lowpass', 900, 0.2); });
  D('slime', (S) => { S.tone('sine', 200 * vary(), 400, 0.1, 0.12); });
  D('crit', (S) => { S.notes([1200, 1600], 'square', 0.06, 0.04, 0.08); });

  // ───────────── 음악 API (자리) ─────────────
  // ambient 모듈이 Music.impl = { play(id), stop(), setVolume(v), update(dt) } 를 채운다
  SD.Music = {
    current: null,
    volume: 0.6,
    impl: null,
    play(trackId, opts) {
      if (trackId === this.current && !(opts && opts.restart)) return;
      this.current = trackId || null;
      if (this.impl && this.impl.play) SD.Mods.safe('Music.play', () => this.impl.play(trackId, opts));
      SD.Mods.emit('musicChange', trackId);
    },
    stop(fade) {
      this.current = null;
      if (this.impl && this.impl.stop) SD.Mods.safe('Music.stop', () => this.impl.stop(fade));
    },
    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (Sound.musicBus) Sound.musicBus.gain.value = this.volume;
      if (this.impl && this.impl.setVolume) SD.Mods.safe('Music.setVolume', () => this.impl.setVolume(this.volume));
    },
    update(dt) {
      if (this.impl && this.impl.update) this.impl.update(dt);
    },
  };
})();
