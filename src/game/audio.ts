// Tiny WebAudio synth: no audio files to download.

let ac: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean) {
  enabled = on;
}

/** Call from a user gesture so iOS lets us play. */
export function unlockAudio() {
  if (!ac) {
    try {
      ac = new AudioContext();
    } catch {
      ac = null;
    }
  }
  if (ac?.state === 'suspended') void ac.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
  if (!enabled || !ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let lastPop = 0;
export const sfx = {
  pop(color: number) {
    if (!ac || ac.currentTime - lastPop < 0.025) return;
    lastPop = ac.currentTime;
    tone(520 + color * 70 + Math.random() * 40, 0.07, 'sine', 0.08, 1.6);
  },
  launch: () => tone(300, 0.14, 'triangle', 0.12, 2.2),
  park: () => tone(220, 0.12, 'square', 0.05, 0.7),
  done: () => {
    tone(660, 0.1, 'triangle', 0.1, 1.5);
    tone(990, 0.12, 'sine', 0.06, 1.2, 0.05);
  },
  deny: () => tone(150, 0.16, 'sawtooth', 0.06, 0.8),
  thaw: () => tone(1400, 0.2, 'sine', 0.05, 0.6),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 1, i * 0.11)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, 0.9, i * 0.15)),
};

export function buzz(on: boolean, ms: number | number[]) {
  if (on && 'vibrate' in navigator) navigator.vibrate(ms);
}
