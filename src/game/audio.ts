// WebAudio synth: every sound and the music are generated, so there are no files to load.
// Signal path: voices → sfx/music buses → (dry + reverb send) → compressor → speakers.

let ac: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let verbSend: GainNode;
let noiseBuf: AudioBuffer;
let soundOn = true;
let musicOn = true;

export function setSound(on: boolean) {
  soundOn = on;
  if (sfxBus) sfxBus.gain.value = on ? 0.9 : 0;
}

export function setMusic(on: boolean) {
  musicOn = on;
  if (musicBus && ac) musicBus.gain.setTargetAtTime(on ? 0.42 : 0, ac.currentTime, 0.3);
  if (on) startMusic();
}

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Call from a user gesture so mobile browsers let us play. */
export function unlockAudio() {
  if (!ac) {
    try {
      ac = new AudioContext();
    } catch {
      return;
    }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master = ac.createGain();
    master.gain.value = 0.85;
    master.connect(comp).connect(ac.destination);
    const verb = ac.createConvolver();
    verb.buffer = impulse(ac, 1.6, 3.2);
    verbSend = ac.createGain();
    verbSend.gain.value = 0.22;
    verbSend.connect(verb).connect(master);
    sfxBus = ac.createGain();
    sfxBus.gain.value = soundOn ? 0.9 : 0;
    sfxBus.connect(master);
    sfxBus.connect(verbSend);
    musicBus = ac.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    const mv = ac.createGain();
    mv.gain.value = 0.5;
    musicBus.connect(mv).connect(verbSend);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setMusic(musicOn);
  }
  if (ac.state === 'suspended') void ac.resume();
}

interface Voice {
  type?: OscillatorType;
  freq: number;
  /** Frequency to glide to by the end. */
  to?: number;
  dur: number;
  vol: number;
  at?: number;
  attack?: number;
  /** Low-pass cutoff (Hz). */
  lp?: number;
  dest?: AudioNode;
  vibrato?: number;
}

function tone(v: Voice) {
  if (!ac) return;
  const t = ac.currentTime + (v.at ?? 0);
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = v.type ?? 'sine';
  o.frequency.setValueAtTime(v.freq, t);
  if (v.to) o.frequency.exponentialRampToValueAtTime(Math.max(30, v.to), t + v.dur * 0.9);
  if (v.vibrato) {
    const lfo = ac.createOscillator();
    const lg = ac.createGain();
    lfo.frequency.value = 18;
    lg.gain.value = v.vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + v.dur + 0.05);
  }
  const atk = v.attack ?? 0.006;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v.vol, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);
  let node: AudioNode = o;
  if (v.lp) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = v.lp;
    node = node.connect(f);
  }
  node.connect(g).connect(v.dest ?? sfxBus);
  o.start(t);
  o.stop(t + v.dur + 0.05);
}

function noise(dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1, at = 0, to?: number) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(sfxBus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

// Major pentatonic steps, so any run of pops sounds musical.
const PENTA = [0, 2, 4, 7, 9];
const note = (step: number, base = 523.25) => base * Math.pow(2, (PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12);

let lastPop = 0;
let lastClick = 0;

export const sfx = {
  /** A cube popping; `streak` climbs the scale for consecutive hits by one jelly. */
  pop(streak: number) {
    if (!ac || ac.currentTime - lastPop < 0.018) return;
    lastPop = ac.currentTime;
    const f = note(Math.min(streak, 14), 392);
    tone({ type: 'triangle', freq: f * 1.5, to: f, dur: 0.09, vol: 0.13 });
    tone({ type: 'sine', freq: f * 3, dur: 0.05, vol: 0.04 });
    noise(0.025, 0.05, 'highpass', 3500);
  },
  launch() {
    tone({ type: 'sine', freq: 200, to: 560, dur: 0.16, vol: 0.2, vibrato: 30 });
    tone({ type: 'triangle', freq: 400, to: 900, dur: 0.12, vol: 0.05, at: 0.02 });
    noise(0.16, 0.06, 'bandpass', 700, 1.2, 0, 2600);
  },
  enter() {
    noise(0.03, 0.05, 'bandpass', 1800, 4);
  },
  park() {
    noise(0.07, 0.22, 'bandpass', 850, 3.5);
    tone({ type: 'sine', freq: 190, to: 120, dur: 0.12, vol: 0.18 });
  },
  done() {
    tone({ type: 'sine', freq: 500, to: 1400, dur: 0.08, vol: 0.14 });
    [0, 2, 4].forEach((s, i) => tone({ type: 'triangle', freq: note(s + 5, 523.25), dur: 0.28, vol: 0.09, at: 0.04 + i * 0.05 }));
    noise(0.12, 0.06, 'highpass', 6000, 0.7, 0.03);
  },
  deny() {
    tone({ type: 'square', freq: 150, to: 110, dur: 0.11, vol: 0.06, lp: 900 });
    tone({ type: 'square', freq: 130, to: 95, dur: 0.12, vol: 0.06, lp: 900, at: 0.1 });
  },
  thaw() {
    for (let i = 0; i < 3; i++) noise(0.05, 0.12, 'highpass', 4000, 0.8, i * 0.045);
    tone({ type: 'sine', freq: 2600, to: 1700, dur: 0.35, vol: 0.05, at: 0.05 });
  },
  combo(level: number) {
    const base = note(5 + level * 2, 392);
    [1, 1.25, 1.5].forEach((m, i) => tone({ type: 'triangle', freq: base * m, dur: 0.35, vol: 0.07, at: i * 0.02 }));
  },
  warn() {
    tone({ type: 'sine', freq: 880, dur: 0.12, vol: 0.06 });
    tone({ type: 'sine', freq: 660, dur: 0.16, vol: 0.06, at: 0.13 });
  },
  star(i: number) {
    const f = [1046.5, 1318.5, 1568][i] ?? 1568;
    tone({ type: 'sine', freq: f, dur: 0.9, vol: 0.12, attack: 0.003 });
    tone({ type: 'sine', freq: f * 2.76, dur: 0.4, vol: 0.03, attack: 0.003 });
    tone({ type: 'triangle', freq: f / 2, dur: 0.5, vol: 0.05 });
  },
  coin() {
    if (!ac || ac.currentTime - lastClick < 0.04) return;
    lastClick = ac.currentTime;
    tone({ type: 'square', freq: 1900, dur: 0.05, vol: 0.025, lp: 5000 });
    tone({ type: 'sine', freq: 2550, dur: 0.08, vol: 0.04, at: 0.03 });
  },
  click() {
    tone({ type: 'sine', freq: 950, to: 700, dur: 0.05, vol: 0.08 });
  },
  win() {
    const seq = [0, 2, 4, 5, 7];
    seq.forEach((s, i) => tone({ type: 'triangle', freq: note(s, 523.25), dur: 0.25, vol: 0.12, at: i * 0.09 }));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => {
      tone({ type: 'sawtooth', freq: f, dur: 1.1, vol: 0.03, at: 0.48, lp: 2400, attack: 0.05 });
      tone({ type: 'triangle', freq: f, dur: 1.2, vol: 0.05, at: 0.48 });
    });
  },
  lose() {
    [392, 349, 311, 262].forEach((f, i) => tone({ type: 'sawtooth', freq: f, to: f * 0.94, dur: i === 3 ? 0.7 : 0.26, vol: 0.06, at: i * 0.24, lp: 1200, vibrato: i === 3 ? 6 : 0 }));
  },
};

export function buzz(on: boolean, ms: number | number[]) {
  if (on && 'vibrate' in navigator) navigator.vibrate(ms);
}

// ---------------------------------------------------------------- music

let musicTimer = 0;
let nextBeat = 0;
let beat = 0;
const BPM = 96;
// I – vi – IV – V in C, as semitone offsets from C.
const CHORDS = [
  [0, 4, 7],
  [9, 12, 16],
  [5, 9, 12],
  [7, 11, 14],
];
const C3 = 130.81;

function startMusic() {
  if (!ac || musicTimer) return;
  nextBeat = ac.currentTime + 0.1;
  musicTimer = window.setInterval(schedule, 90);
}

function schedule() {
  if (!ac) return;
  if (!musicOn) {
    clearInterval(musicTimer);
    musicTimer = 0;
    return;
  }
  const eighth = 60 / BPM / 2;
  while (nextBeat < ac.currentTime + 0.35) {
    const bar = Math.floor(beat / 8) % CHORDS.length;
    const chord = CHORDS[bar];
    const at = nextBeat - ac.currentTime;
    const pos = beat % 8;
    if (pos === 0 || pos === 4) tone({ type: 'triangle', freq: C3 * Math.pow(2, chord[0] / 12) / (pos ? 1 : 2) * 2, dur: 0.5, vol: 0.09, at, dest: musicBus, lp: 900 });
    // Marimba-ish arpeggio with a gentle fixed pattern and a few rests.
    const pattern = [0, 2, 1, 2, 0, 2, 1, -1];
    const k = pattern[pos];
    if (k >= 0) {
      const f = C3 * 4 * Math.pow(2, chord[k] / 12);
      tone({ type: 'sine', freq: f, dur: 0.32, vol: 0.05, at, dest: musicBus, attack: 0.004 });
      tone({ type: 'sine', freq: f * 4, dur: 0.06, vol: 0.008, at, dest: musicBus, attack: 0.002 });
    }
    // Soft shaker on off-beats.
    if (pos % 2 === 1 && soundOn) {
      const t = ac.currentTime + at;
      const s = ac.createBufferSource();
      s.buffer = noiseBuf;
      const f = ac.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.connect(f).connect(g).connect(musicBus);
      s.start(t, Math.random() * 0.5);
      s.stop(t + 0.06);
    }
    nextBeat += eighth;
    beat++;
  }
}
