// Utilities. All randomness goes through the seeded generator stored in S.rng so that a game is a pure
// function of (setup, answers) - that is what makes undo / save / resume work by replay.

import { S } from './state.js';

export function rand() {
  // mulberry32 - state lives in S.rng (uint32)
  let t = (S.rng = (S.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** integer in 1..n (like Lua's math.random(n)) */
export function rnd(n) {
  return 1 + Math.floor(rand() * n);
}

export const U = {
  copy: (t) => JSON.parse(JSON.stringify(t)),

  shuffle(t) {
    for (let i = t.length; i >= 2; i--) {
      const j = rnd(i);
      const x = t[i - 1];
      t[i - 1] = t[j - 1];
      t[j - 1] = x;
    }
    return t;
  },

  idx(list, val) {
    const i = list.indexOf(val);
    return i < 0 ? null : i;
  },
  has: (list, val) => list.indexOf(val) >= 0,
  /** remove first occurrence; returns true if removed */
  rm(list, val) {
    const i = list.indexOf(val);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  },
  clamp: (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x),
  sum: (list) => list.reduce((a, b) => a + b, 0),
  pick(list) {
    return list.length ? list[rnd(list.length) - 1] : null;
  },
  /** "3 Regret" - Vietnamese has no plural, so the unit is just appended */
  pl: (n, unit) => `${n} ${unit}`,
  cap: (s) => s.charAt(0).toUpperCase() + s.slice(1),
  /** stable insertion sort with strict comparator lt(a,b) (lists are tiny) */
  sort(list, lt) {
    for (let i = 1; i < list.length; i++) {
      const x = list[i];
      let j = i - 1;
      while (j >= 0 && lt(x, list[j])) {
        list[j + 1] = list[j];
        j--;
      }
      list[j + 1] = x;
    }
    return list;
  },
};
