'use strict';
// ───────────────────────── 효과음 (WebAudio 합성) ─────────────────────────

const Sound = {
  ctx: null,
  muted: false,
  noiseBuf: null,

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.ctx = null;
    }
  },

  out(vol) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.ctx.destination);
    return g;
  },

  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur, filterType, freq, vol, delay = 0, q = 1) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.ctx.destination);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },

  // 뿌지직: 떨리는 톱니파 + 저역 잡음
  fart() {
    const c = this.ctx, t = c.currentTime;
    const dur = 0.35 + Math.random() * 0.35;
    const base = 70 + Math.random() * 50;
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
    o.connect(flutter).connect(filt).connect(env).connect(c.destination);
    o.start(t); lfo.start(t); fl.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); fl.stop(t + dur + 0.05);
    this.noise(dur * 0.8, 'bandpass', 350, 0.12, 0, 2);
  },

  play(name) {
    if (this.muted || !this.ctx) return;
    try {
      switch (name) {
        case 'harvest': this.fart(); this.tone('sine', 520, 880, 0.12, 0.08, 0.05); break;
        case 'hoe': this.tone('sine', 140, 60, 0.12, 0.3); this.noise(0.1, 'lowpass', 900, 0.2); break;
        case 'water': this.noise(0.35, 'highpass', 2400, 0.12); this.noise(0.25, 'bandpass', 900, 0.08, 0.05); break;
        case 'refill': this.noise(0.5, 'bandpass', 700, 0.15, 0, 3); this.tone('sine', 300, 600, 0.4, 0.05); break;
        case 'plant': this.tone('sine', 420, 820, 0.09, 0.15); break;
        case 'chop': this.noise(0.09, 'bandpass', 1300, 0.4, 0, 4); this.tone('triangle', 220, 140, 0.08, 0.15); break;
        case 'clink': this.tone('triangle', 1600, 1200, 0.1, 0.18); this.noise(0.06, 'highpass', 3000, 0.15); break;
        case 'swish': this.noise(0.14, 'bandpass', 2200, 0.15, 0, 1.5); break;
        case 'coin': this.tone('square', 988, 988, 0.08, 0.06); this.tone('square', 1319, 1319, 0.22, 0.06, 0.08); break;
        case 'ship': this.tone('triangle', 330, 330, 0.08, 0.15); this.tone('triangle', 494, 494, 0.12, 0.15, 0.08); this.noise(0.15, 'lowpass', 600, 0.2); break;
        case 'eat': for (let i = 0; i < 3; i++) this.noise(0.06, 'bandpass', 1500, 0.2, i * 0.11, 3); break;
        case 'error': this.tone('square', 160, 120, 0.18, 0.08); break;
        case 'menu': this.tone('sine', 660, 660, 0.05, 0.08); break;
        case 'sleep': [523, 659, 784, 1047].forEach((f, i) => this.tone('sine', f, f, 0.5, 0.08, i * 0.15)); break;
        case 'morning': [784, 988, 1175].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.07, i * 0.1)); break;
        default: break;
      }
    } catch (e) { /* 소리 실패는 무시 */ }
  },
};
