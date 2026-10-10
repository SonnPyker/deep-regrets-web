// Save slots: the record of one saved game, as it sits in a slot and as it is written to a file.
// Pure data and checks: no storage, no DOM. A save is the setup and the answers (the engine replays them), plus the
// Ocean Survey sheet for a solo game, because that sheet changes from one week to the next.
// Modes: 'solo' = one seat (the Ocean Survey campaign), 'coop' = two to five seats (hot-seat and bots). Online rooms are
// kept by the server and are not saved here.

import { COLORS } from './core.js';
import { readSurvey } from './survey.js';

export const SAVE_FORMAT = 'deep-regrets-save';
export const SAVE_VERSION = 1;
export const SAVE_SLOTS = 3;
export const SAVE_MODES = ['coop', 'solo'];

const MAX_ANSWERS = 100000;
const MAX_TAG = 40;

export const modeOf = (colors) => (colors.length === 1 ? 'solo' : 'coop');

/** the save of a game: setup + answers, and the Ocean Survey sheet for solo. rec holds engine records ({a, h, t}). */
export function makeSave({ setup, rec, sheet, at = Date.now() }) {
  const mode = modeOf(setup.colors);
  const save = {
    format: SAVE_FORMAT,
    v: SAVE_VERSION,
    mode,
    at,
    setup: JSON.parse(JSON.stringify({ colors: setup.colors, opts: setup.opts })),
    rec: rec.map((r) => [r.a, r.h ? 1 : 0, r.t || '']),
  };
  if (mode === 'solo') save.sheet = JSON.parse(JSON.stringify(sheet));
  return save;
}

/** the answers of a save in the form the engine keeps them */
export const recOf = (save) => save.rec.map(([a, h, t]) => ({ a, h: !!h, t }));

const isAnswer = (a) => a === null || (Number.isInteger(a) && a >= 0) || (Array.isArray(a) && a.every((x) => Number.isInteger(x) && x >= 0));
const isEntry = (e) => Array.isArray(e) && e.length === 3 && isAnswer(e[0]) && (e[1] === 0 || e[1] === 1) && typeof e[2] === 'string' && e[2].length <= MAX_TAG;

/**
 * check a save (a parsed file or a stored slot). Returns { ok: true, save } with a clean copy, or { ok: false, msg } that
 * names the first problem. This only checks the shape; whether the answers play out is checked by Game.verify.
 */
export function readSave(raw) {
  const no = (msg) => ({ ok: false, msg });
  if (!raw || typeof raw !== 'object' || raw.format !== SAVE_FORMAT || raw.v !== SAVE_VERSION) return no('Tệp này không phải bản lưu của Deep Regrets.');
  if (!SAVE_MODES.includes(raw.mode)) return no('Không rõ chế độ của bản lưu.');
  const s = raw.setup;
  const colorsOk =
    s && typeof s === 'object' && Array.isArray(s.colors) && s.colors.length >= 1 && s.colors.length <= COLORS.length && s.colors.every((c) => COLORS.includes(c)) && new Set(s.colors).size === s.colors.length;
  if (!colorsOk) return no('Thiết lập ván trong bản lưu không hợp lệ.');
  if (modeOf(s.colors) !== raw.mode) return no('Chế độ của bản lưu không khớp với số người chơi.');
  const o = s.opts;
  if (!o || typeof o !== 'object' || !Number.isInteger(o.seed) || o.seed < 0 || o.seed > 0xffffffff) return no('Hạt giống của ván không hợp lệ.');
  if (!o.seats || typeof o.seats !== 'object' || !s.colors.every((c) => o.seats[c] === 'human' || o.seats[c] === 'bot')) return no('Ghế người/máy của ván không hợp lệ.');
  if (!Array.isArray(raw.rec) || raw.rec.length > MAX_ANSWERS || !raw.rec.every(isEntry)) return no('Lịch sử quyết định trong bản lưu không hợp lệ.');
  const save = {
    format: SAVE_FORMAT,
    v: SAVE_VERSION,
    mode: raw.mode,
    at: Number.isFinite(raw.at) ? raw.at : 0,
    setup: { colors: s.colors.slice(), opts: JSON.parse(JSON.stringify(o)) },
    rec: raw.rec.map(([a, h, t]) => [a, h, t]),
  };
  if (raw.mode === 'solo') {
    const sh = raw.sheet;
    if (!sh || sh.v !== 1 || !Array.isArray(sh.checked) || !Array.isArray(sh.owned)) return no('Bản lưu solo thiếu bảng Ocean Survey.');
    save.sheet = readSurvey(sh);
  }
  return { ok: true, save };
}

/** the slots of both modes, { coop: [save|null x3], solo: [...] }. Anything unreadable is an empty slot. */
export function readSlots(raw) {
  const out = {};
  for (const mode of SAVE_MODES) {
    const list = raw && raw.slots && Array.isArray(raw.slots[mode]) ? raw.slots[mode] : [];
    out[mode] = Array.from({ length: SAVE_SLOTS }, (_, i) => {
      const r = list[i] ? readSave(list[i]) : null;
      return r && r.ok && r.save.mode === mode ? r.save : null;
    });
  }
  return out;
}

/** what a slot shows: the players, the answers so far, and for solo the week being played */
export function summarize(save) {
  return { players: save.setup.colors.length, answers: save.rec.length, week: save.mode === 'solo' ? save.sheet.weeks + 1 : 0, at: save.at };
}
