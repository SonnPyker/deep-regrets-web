// UI-only state (nothing here influences the game itself) + persisted preferences.

import { S } from '../engine/state.js';
import { Game } from '../engine/game.js';
import { readSurvey } from '../engine/survey.js';
import { readSlots } from '../engine/saves.js';

const PREFS_KEY = 'deepregrets.prefs.v1';
const SURVEY_KEY = 'deepregrets.survey.v1';
const SAVES_KEY = 'deepregrets.saves.v1';

export const UI = {
  screen: 'menu', // menu | game
  viewer: null, // seat whose private information is shown (hot-seat)
  hint: null, // { seq, ans } suggestion for the current prompt
  multi: null, // { seq, sel:Set } selection of the current multi prompt
  pending: null, // { pr, i } a pick the player clicked and has not confirmed yet (the confirm bar in the panel)
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
    confirm: true, // ask once before a click on the table or in the panel is carried out
    icons: 'briny', // icon set: 'briny' (drawn for this game) or 'emoji'
    onlineName: '', // name shown to the other players of an online room
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

/** the Ocean Survey sheet of the solo campaign (kept across games and sessions in this browser) */
export function loadSurvey() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(SURVEY_KEY));
  } catch {
    /* blocked or corrupt: start a fresh sheet */
  }
  return readSurvey(raw);
}

export function saveSurvey(sv) {
  try {
    localStorage.setItem(SURVEY_KEY, JSON.stringify(sv));
  } catch {
    /* ignore: the sheet is kept for this session only */
  }
}

/** the save slots of both modes (engine/saves.js): { solo: [save|null x3], coop: [...] }. Unreadable slots count as empty. */
export function loadSlots() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(SAVES_KEY));
  } catch {
    /* blocked or corrupt: every slot is empty */
  }
  return readSlots(raw);
}

/** put a save into slot i of its mode (null empties it). Returns false when the browser refuses to store it. */
export function writeSlot(mode, i, save) {
  const slots = loadSlots();
  slots[mode][i] = save;
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify({ slots }));
    return true;
  } catch {
    return false;
  }
}

export const humans = () => (S.order ? S.order.filter((c) => S.seats[c] === 'human') : []);

/** seat whose private cards are visible right now (null = nobody). Online it is the seat of this browser. */
export function viewerSeat() {
  if (Game.remote) return Game.remote.seat;
  const hs = humans();
  if (hs.length === 1) return hs[0];
  if (hs.length > 1) return UI.viewer && hs.includes(UI.viewer) ? UI.viewer : null;
  return null;
}

/** true when every hidden card may be shown (spectating bots, or the game is over) */
export function seeAll() {
  if (Game.remote) return S.ph === 'over' || Game.over;
  return humans().length === 0 || S.ph === 'over' || Game.over;
}

/** hot-seat: a prompt for another human needs the "pass the device" curtain first. Online every player has a device. */
export function needsCurtain() {
  if (Game.remote) return false;
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
