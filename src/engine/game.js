// Game controller: runs the engine, routes prompts to humans or bots, records every answer so that undo,
// save and resume are done by replaying the recorded answers (the engine is a pure function of setup + answers).

import { S, RT } from './state.js';
import { Setup } from './setup.js';
import { Fl } from './flow.js';
import { Bot } from './bot.js';

const SAVE_KEY = 'deepregrets.save.v1';
const never = () => new Promise(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** resolve with `a` unless a newer run has taken over meanwhile (a superseded run must never touch the shared state) */
const settle = (token, a) =>
  new Promise((resolve) => {
    queueMicrotask(() => {
      if (token === Game.token) resolve(a);
    });
  });

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export const Game = {
  setup: null, // { colors: [...], opts: { tent, big, short, seed, seats: {color: 'human'|'bot'} } }
  rec: [], // [{ a: answer, h: wasHuman, t: promptTag }]
  prompt: null, // prompt waiting for a human
  thinking: null, // seat of the bot that is about to answer
  over: false,
  error: null,
  speed: 400, // ms a bot "thinks" per decision (0 = instant)
  token: 0,
  _resolve: null,
  _listeners: new Set(),
  version: 0, // bumped on every change so the UI can cheaply detect updates

  on(fn) {
    Game._listeners.add(fn);
    return () => Game._listeners.delete(fn);
  },
  emit() {
    Game.version++;
    for (const fn of Game._listeners) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
  },

  /** start a brand-new game. opts.seed is filled in when missing so the game can be replayed. */
  start(setup) {
    const opts = { ...setup.opts };
    if (opts.seed === undefined || opts.seed === null || opts.seed === '') opts.seed = Math.floor(Math.random() * 4294967296) >>> 0;
    Game.setup = { colors: setup.colors.slice(), opts };
    Game.rec = [];
    Game.launch();
  },

  restart() {
    if (!Game.setup) return;
    Game.rec = [];
    Game.launch();
  },

  /** (re)run the engine from the beginning, fast-forwarding through the recorded answers */
  launch() {
    const token = ++Game.token;
    Game.prompt = null;
    Game.thinking = null;
    Game.over = false;
    Game.error = null;
    Game._resolve = null;
    Bot.reset();
    let i = 0;
    const { colors, opts } = Game.setup;
    RT.driver = {
      ask: async (pr) => {
        if (token !== Game.token) return never();
        if (i < Game.rec.length) return settle(token, Game.rec[i++].a);
        const seat = pr.color;
        if (S.seats[seat] === 'bot') {
          Game.thinking = seat;
          Game.prompt = null;
          Game.emit();
          if (Game.speed > 0) await sleep(Game.speed);
          if (token !== Game.token) return never();
          const a = Bot.decide(pr);
          Game.rec.push({ a, h: false, t: pr.tag });
          i++;
          Game.thinking = null;
          Game.save();
          return settle(token, a);
        }
        Game.thinking = null;
        Game.prompt = pr;
        Game.emit();
        return new Promise((resolve) => {
          Game._resolve = (a) => {
            Game.rec.push({ a, h: true, t: pr.tag });
            i++;
            Game.prompt = null;
            Game._resolve = null;
            Game.save();
            resolve(settle(token, a));
          };
        });
      },
    };
    try {
      Setup.newGame(colors, opts);
    } catch (e) {
      Game.error = e;
      Game.emit();
      return;
    }
    Game.emit();
    Fl.main().then(
      () => {
        if (token !== Game.token) return;
        Game.over = true;
        Game.prompt = null;
        Game.thinking = null;
        Game.save();
        Game.emit();
      },
      (e) => {
        if (token !== Game.token) return;
        console.error(e);
        Game.error = e;
        Game.prompt = null;
        Game.thinking = null;
        Game.emit();
      },
    );
  },

  /** answer the current human prompt. pick: option index; multi: array of item indices or null */
  answer(v) {
    const pr = Game.prompt;
    if (!pr || !Game._resolve) return false;
    if (pr.kind === 'pick') {
      if (!Number.isInteger(v) || !pr.opts[v] || pr.opts[v].dis) return false;
    } else if (v === null) {
      if (!pr.cancel) return false;
    } else {
      if (!Array.isArray(v) || v.some((x) => !Number.isInteger(x) || x < 0 || x >= pr.items.length) || new Set(v).size !== v.length) return false;
      if (!pr.check(v).ok) return false;
    }
    Game._resolve(v);
    return true;
  },

  lastHuman() {
    for (let k = Game.rec.length - 1; k >= 0; k--) if (Game.rec[k].h && Game.rec[k].t !== 'ack') return k;
    return -1;
  },
  canUndo() {
    return Game.setup !== null && Game.lastHuman() >= 0;
  },
  /** take back the previous human decision (the same question is asked again) */
  undo() {
    const k = Game.lastHuman();
    if (k < 0) return false;
    Game.rec.length = k;
    Game.save();
    Game.launch();
    return true;
  },

  // SAVE / LOAD -------------------------------------------------------------------------------------
  save() {
    const st = storage();
    if (!st || !Game.setup) return;
    try {
      st.setItem(SAVE_KEY, JSON.stringify({ v: 1, setup: Game.setup, rec: Game.rec.map((r) => [r.a, r.h ? 1 : 0, r.t || '']) }));
    } catch {
      /* storage full or blocked: playing on is fine */
    }
  },
  hasSave() {
    const st = storage();
    try {
      return !!st && !!st.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  },
  /** summary of the stored game for the "continue" button */
  saveInfo() {
    const st = storage();
    try {
      const raw = st && st.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return { players: d.setup.colors.length, answers: d.rec.length, opts: d.setup.opts };
    } catch {
      return null;
    }
  },
  load() {
    const st = storage();
    try {
      const d = JSON.parse(st.getItem(SAVE_KEY));
      if (!d || d.v !== 1) return false;
      Game.setup = d.setup;
      Game.rec = d.rec.map(([a, h, t]) => ({ a, h: !!h, t }));
    } catch {
      return false;
    }
    Game.launch();
    return true;
  },
  clearSave() {
    const st = storage();
    try {
      st && st.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  },
  /** abandon the running game (e.g. back to the setup screen) */
  stop() {
    Game.token++;
    Game.prompt = null;
    Game.thinking = null;
    Game._resolve = null;
    Game.setup = null;
    Game.rec = [];
    Game.over = false;
    Game.error = null;
    Game.emit();
  },
};
