// All sound is synthesised with WebAudio — there are no audio files in the
// game. Engines, sirens, gunfire and the sea are built from oscillators and
// filtered noise, started lazily on the player's first click or keypress so
// the browser's autoplay rules are honoured.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.ambientOn = false;
  }

  // Create the context on a user gesture; safe to call repeatedly.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startAmbient();
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // A short burst of white noise through a band-pass: gunshots, punches.
  noiseBurst({ freq = 1200, q = 0.8, dur = 0.12, gain = 0.5, type = 'bandpass' } = {}) {
    if (!this.ctx) return;
    const t = this.now();
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
  }

  blip(freqA, freqB, dur = 0.12, gain = 0.25, type = 'sine') {
    if (!this.ctx) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  gunshot() {
    this.noiseBurst({ freq: 900, q: 0.4, dur: 0.16, gain: 0.7, type: 'lowpass' });
    this.blip(160, 40, 0.1, 0.4, 'square');
  }

  punch() {
    this.noiseBurst({ freq: 300, q: 1, dur: 0.08, gain: 0.4 });
  }

  pickup() {
    this.blip(660, 990, 0.12, 0.22);
  }

  cash() {
    this.blip(880, 1320, 0.16, 0.25, 'triangle');
    setTimeout(() => this.blip(1320, 1760, 0.14, 0.18, 'triangle'), 70);
  }

  missionDone() {
    if (!this.ctx) return;
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => this.blip(f, f, 0.22, 0.22, 'triangle'), i * 110);
    });
  }

  // A falling two-note sting for the busted / wasted screens.
  sting() {
    this.blip(392, 392, 0.25, 0.25, 'triangle');
    setTimeout(() => this.blip(311, 233, 0.45, 0.25, 'triangle'), 160);
  }

  // Looping sea-and-gulls ambience: slow filtered noise, very quiet.
  startAmbient() {
    if (!this.ctx || this.ambientOn) return;
    this.ambientOn = true;
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.98 + white * 0.02; // brownish
      data[i] = last * 3;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    lfo.start();
  }

  // Continuous engine note for the car the player is driving.
  setEngine(on, speedRatio = 0) {
    if (!this.ctx) return;
    if (on && !this.engineNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const sub = this.ctx.createOscillator();
      sub.type = 'square';
      sub.frequency.value = 28;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const g = this.ctx.createGain();
      g.gain.value = 0.0;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(g).connect(this.master);
      osc.start();
      sub.start();
      this.engineNodes = { osc, sub, filter, g };
    }
    if (this.engineNodes) {
      const t = this.now();
      const target = on ? 0.05 + Math.abs(speedRatio) * 0.05 : 0;
      this.engineNodes.g.gain.setTargetAtTime(target, t, 0.08);
      if (on) {
        const f = 55 + Math.abs(speedRatio) * 165;
        this.engineNodes.osc.frequency.setTargetAtTime(f, t, 0.05);
        this.engineNodes.sub.frequency.setTargetAtTime(f / 2, t, 0.05);
        this.engineNodes.filter.frequency.setTargetAtTime(320 + Math.abs(speedRatio) * 900, t, 0.05);
      }
    }
  }

  // Two-tone police siren, audible while any police unit is near.
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 700;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain).connect(osc.frequency);
      const g = this.ctx.createGain();
      g.gain.value = 0.035;
      osc.connect(g).connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, g };
    } else if (!on && this.sirenNodes) {
      const { osc, lfo, g } = this.sirenNodes;
      g.gain.setTargetAtTime(0, this.now(), 0.1);
      setTimeout(() => { try { osc.stop(); lfo.stop(); } catch { /* already stopped */ } }, 400);
      this.sirenNodes = null;
    }
  }
}
