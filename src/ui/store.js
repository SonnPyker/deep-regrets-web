// UI-only state (nothing here influences the game itself) + persisted preferences.

import { S } from '../engine/state.js';
import { Game } from '../engine/game.js';

const PREFS_KEY = 'deepregrets.prefs.v1';

export const UI = {
  screen: 'menu', // menu | game
  viewer: null, // seat whose private information is shown (hot-seat)
  hint: null, // { seq, ans } suggestion for the current prompt
  multi: null, // { seq, sel:Set } selection of the current multi prompt
  endShown: false,
  endOpen: false,
  prefs: {
    speed: 400,
    seats: { Red: 'human', Orange: 'bot', Green: 'bot', Blue: 'off', Teal: 'off' },
    tent: true,
    big: false,
    short: false,
    seed: '',
    sound: true,
  },
};

export function loadPrefs() {
  try {
    const d = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (d && typeof d === 'object') {
      UI.prefs = { ...UI.prefs, ...d, seats: { ...UI.prefs.seats, ...(d.seats || {}) } };
    }
  } catch {
    /* defaults */
  }
  Game.speed = Number.isFinite(UI.prefs.speed) ? UI.prefs.speed : 400;
}

export function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(UI.prefs));
  } catch {
    /* ignore */
  }
}

export const humans = () => (S.order ? S.order.filter((c) => S.seats[c] === 'human') : []);

/** seat whose private cards are visible right now (null = nobody) */
export function viewerSeat() {
  const hs = humans();
  if (hs.length === 1) return hs[0];
  if (hs.length > 1) return UI.viewer && hs.includes(UI.viewer) ? UI.viewer : null;
  return null;
}

/** true when every hidden card may be shown (spectating bots, or the game is over) */
export function seeAll() {
  return humans().length === 0 || S.ph === 'over' || Game.over;
}

/** hot-seat: a prompt for another human needs the "pass the device" curtain first */
export function needsCurtain() {
  const pr = Game.prompt;
  if (!pr) return false;
  if (humans().length < 2) return false;
  return UI.viewer !== pr.color;
}

/** reduce a seed text to a uint32 (numbers are used as they are) */
export function parseSeed(txt) {
  const t = String(txt || '').trim();
  if (!t) return undefined;
  if (/^\d{1,10}$/.test(t) && Number(t) < 4294967296) return Number(t);
  let x = 2166136261;
  for (let i = 0; i < t.length; i++) {
    x ^= t.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}
