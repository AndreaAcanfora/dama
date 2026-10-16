// Wooden "tock" sounds synthesised with Web Audio, so the app ships no audio files.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tock(at: number, pitch: number, gain: number) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const env = ac.createGain();
  const filter = ac.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(pitch, t);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.55, t + 0.08);
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(filter).connect(env).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.14);
}

export const sounds = {
  move: () => tock(0, 420, 0.35),
  capture: (count: number, stepSeconds: number) => {
    for (let i = 0; i < count; i++) tock((i + 1) * stepSeconds, 300 - i * 20, 0.45);
  },
  promote: (delay: number) => {
    tock(delay, 620, 0.3);
    tock(delay + 0.09, 830, 0.25);
  },
};

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}
