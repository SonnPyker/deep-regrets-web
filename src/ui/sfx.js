// Tiny synthesised sound effects (WebAudio, no asset files). Everything is silent until the first user gesture.

import { UI, savePrefs } from './store.js';

let ctx = null;
let master = null;

function ac() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function on() {
  return UI.prefs.sound !== false;
}

function ready() {
  if (!on()) return null;
  const c = ac();
  if (!c) return null;
  if (c.state === 'suspended') c.resume().catch(() => {});
  return c.state === 'running' ? c : null;
}

function noise(c, dur) {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(c, { f = 440, f2, type = 'sine', t = 0, dur = 0.15, vol = 0.25 }) {
  const o = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + t;
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function burst(c, { t = 0, dur = 0.06, vol = 0.3, freq = 1800, q = 1.2, type = 'bandpass' }) {
  const n = noise(c, dur);
  const fl = c.createBiquadFilter();
  const g = c.createGain();
  const t0 = c.currentTime + t;
  fl.type = type;
  fl.frequency.value = freq;
  fl.Q.value = q;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  n.connect(fl).connect(g).connect(master);
  n.start(t0);
  n.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  click(c) {
    tone(c, { f: 620, f2: 420, type: 'triangle', dur: 0.07, vol: 0.12 });
  },
  roll(c) {
    for (let i = 0; i < 7; i++) burst(c, { t: i * 0.055 + Math.random() * 0.02, dur: 0.035, vol: 0.28, freq: 900 + Math.random() * 2400, q: 3 });
  },
  flip(c) {
    burst(c, { dur: 0.09, vol: 0.22, freq: 2600, q: 0.8, type: 'highpass' });
    tone(c, { f: 300, f2: 180, type: 'triangle', dur: 0.08, vol: 0.08 });
  },
  splash(c) {
    burst(c, { dur: 0.45, vol: 0.35, freq: 700, q: 0.5, type: 'lowpass' });
    burst(c, { t: 0.05, dur: 0.25, vol: 0.18, freq: 2400, q: 0.7, type: 'highpass' });
  },
  catch(c) {
    [523, 659, 784].forEach((f, i) => tone(c, { f, type: 'triangle', t: i * 0.08, dur: 0.22, vol: 0.18 }));
  },
  coin(c) {
    tone(c, { f: 1320, type: 'square', dur: 0.07, vol: 0.07 });
    tone(c, { f: 1760, type: 'square', t: 0.07, dur: 0.18, vol: 0.07 });
  },
  regret(c) {
    tone(c, { f: 150, f2: 70, type: 'sawtooth', dur: 0.5, vol: 0.17 });
    tone(c, { f: 160, f2: 78, type: 'sine', dur: 0.5, vol: 0.2 });
  },
  mad(c) {
    [330, 311, 294, 220].forEach((f, i) => tone(c, { f, f2: f * 0.97, type: 'sawtooth', t: i * 0.11, dur: 0.3, vol: 0.12 }));
  },
  day(c) {
    [392, 523, 659].forEach((f, i) => tone(c, { f, type: 'sine', t: i * 0.14, dur: 0.5, vol: 0.14 }));
    burst(c, { dur: 0.7, vol: 0.07, freq: 500, q: 0.4, type: 'lowpass' });
  },
  turn(c) {
    tone(c, { f: 880, type: 'sine', dur: 0.14, vol: 0.1 });
    tone(c, { f: 1175, type: 'sine', t: 0.1, dur: 0.2, vol: 0.1 });
  },
  win(c) {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, { f, type: 'triangle', t: i * 0.13, dur: 0.4, vol: 0.18 }));
  },
};

export function play(name) {
  const c = ready();
  if (!c || !SOUNDS[name]) return;
  try {
    SOUNDS[name](c);
  } catch {
    /* audio is a nicety */
  }
}

export function soundOn() {
  return on();
}

export function setSound(v) {
  UI.prefs.sound = !!v;
  savePrefs();
  if (v) {
    const c = ac();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    play('click');
  }
}

/** browsers only allow audio after a gesture: wake the context on the first one */
export function unlockOnGesture() {
  const f = () => {
    if (on()) ac();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (ctx && ctx.state === 'running') {
      window.removeEventListener('pointerdown', f, true);
      window.removeEventListener('keydown', f, true);
    }
  };
  window.addEventListener('pointerdown', f, true);
  window.addEventListener('keydown', f, true);
}
