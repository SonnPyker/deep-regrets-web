// Game controller: runs the engine, routes prompts to humans or bots, records every answer so that undo,
// save and resume are done by replaying the recorded answers (the engine is a pure function of setup + answers).
// Online co-op uses the same replay: the server keeps the answers and every client replays them (see attach).

import { S, RT } from './state.js';
import { Setup } from './setup.js';
import { Fl } from './flow.js';
import { Bot } from './bot.js';

const SAVE_KEY = 'deepregrets.save.v1';
const VERIFY_MS = 20000; // a dry run that takes longer than this is reported as a failed check
const never = () => new Promise(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** resolve with `a` unless a newer run has taken over meanwhile (a superseded run must never touch the shared state) */
const settle = (token, a) =>
  new Promise((resolve) => {
    queueMicrotask(() => {
      if (token === Game.token) resolve(a);
    });
  });
/** wait until the engine has nothing to do before a player acts: a question is open, the game is over or broken, or a bot is thinking */
const settled = async () => {
  const t0 = Date.now();
  while (!Game.prompt && !Game.over && !Game.error && !Game.thinking && Date.now() - t0 < VERIFY_MS) await sleep(0);
};

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
  thinking: null, // seat of the bot (or, online, of the other human) that is about to answer
  waitTitle: null, // online: the question another seat is answering
  over: false,
  error: null,
  speed: 400, // ms a bot "thinks" per decision (0 = instant)
  token: 0,
  keepLocal: true, // false on the server: games are not written to localStorage there
  _quiet: false, // a dry run (verify) is replaying: nothing is shown and nothing is saved
  remote: null, // online: { seat, send(n, a) }. The server decides the bots and records every answer.
  _resolve: null,
  _await: null, // online: { k, resolve } the run waits until answer k is recorded
  _sent: -1, // online: index of the answer already sent to the server
  _liveFrom: 0, // online: answers from this index on arrived while playing, so bots are paced as in a local game
  _listeners: new Set(),
  version: 0, // bumped on every change so the UI can cheaply detect updates

  on(fn) {
    Game._listeners.add(fn);
    return () => Game._listeners.delete(fn);
  },
  emit() {
    if (Game._quiet) return;
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
    Game.waitTitle = null;
    Game.over = false;
    Game.error = null;
    Game._resolve = null;
    Game._await = null;
    Game._sent = -1;
    Bot.reset();
    let i = 0;
    const { colors, opts } = Game.setup;

    /** online: the answer to this prompt comes from the server, in record order */
    const remoteAsk = async (pr) => {
      const k = i;
      const seat = pr.color;
      const mine = seat === Game.remote.seat;
      if (Game.rec.length <= k) {
        // the waiter must exist before the UI is told, so that an answer given at once is not lost
        const waiting = new Promise((resolve) => {
          Game._await = { k, resolve };
        });
        Game.prompt = mine ? pr : null;
        Game.thinking = mine ? null : seat;
        Game.waitTitle = mine ? null : pr.title;
        Game.emit();
        await waiting;
        if (token !== Game.token) return never();
      }
      const e = Game.rec[k];
      i = k + 1;
      Game.prompt = null;
      if (!e.h && k >= Game._liveFrom && Game.speed > 0) {
        // a bot decided this just now: let it "think" as it does in a local game
        Game.thinking = seat;
        Game.waitTitle = null;
        Game.emit();
        await sleep(Game.speed);
        if (token !== Game.token) return never();
      }
      Game.thinking = null;
      Game.waitTitle = null;
      Game.emit();
      return settle(token, e.a);
    };

    RT.driver = {
      ask: async (pr) => {
        if (token !== Game.token) return never();
        if (Game.remote) return remoteAsk(pr);
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
        if (!Game._quiet) console.error(e); // a dry run (verify) reports its failure to the player itself
        Game.error = e;
        Game.prompt = null;
        Game.thinking = null;
        Game.emit();
      },
    );
  },

  /** shape check of an answer for a prompt: pick -> enabled option index, multi -> distinct item indices or null */
  _valid(pr, v) {
    if (pr.kind === 'pick') return Number.isInteger(v) && !!pr.opts[v] && !pr.opts[v].dis;
    if (v === null) return !!pr.cancel;
    return Array.isArray(v) && v.every((x) => Number.isInteger(x) && x >= 0 && x < pr.items.length) && new Set(v).size === v.length && pr.check(v).ok;
  },

  /** answer the current prompt. pick: option index; multi: array of item indices or null when cancelled */
  answer(v) {
    const pr = Game.prompt;
    if (!pr || Game._quiet || !Game._valid(pr, v)) return false;
    if (Game.remote) {
      // only the answer the run is waiting for, and only once: the server records it and sends it to every seat
      if (!Game._await || Game._await.k !== Game.rec.length || Game._sent === Game.rec.length) return false;
      if (!Game.remote.send(Game.rec.length, v)) return false;
      Game._sent = Game.rec.length;
      return true;
    }
    if (!Game._resolve) return false;
    Game._resolve(v);
    return true;
  },

  lastHuman() {
    for (let k = Game.rec.length - 1; k >= 0; k--) if (Game.rec[k].h && Game.rec[k].t !== 'ack') return k;
    return -1;
  },
  canUndo() {
    return Game.setup !== null && !Game.remote && Game.lastHuman() >= 0;
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

  // ONLINE --------------------------------------------------------------------------------------------------
  /** play a game that the server holds. link = { seat, send(n, a) }; rec = the answers recorded so far */
  attach(link, setup, rec) {
    Game.remote = link;
    Game.setup = { colors: setup.colors.slice(), opts: setup.opts };
    Game.rec = rec.map((r) => ({ a: r.a, h: !!r.h, t: r.t || '' }));
    Game._liveFrom = Game.rec.length;
    Game.launch();
  },
  /** answers the server recorded from index `from` on. Returns false when some earlier answer is missing (ask for the record). */
  feed(from, list) {
    if (!Game.remote || from > Game.rec.length) return false;
    list.forEach((r, j) => {
      if (from + j >= Game.rec.length) Game.rec.push({ a: r.a, h: !!r.h, t: r.t || '' });
    });
    if (Game._sent >= 0 && Game.rec.length > Game._sent) Game._sent = -1;
    const w = Game._await;
    if (w && Game.rec.length > w.k) {
      Game._await = null;
      w.resolve();
    }
    return true;
  },
  /** the server refused the last answer, or the connection dropped with it in flight: it can be sent again */
  reject() {
    Game._sent = -1;
    Game.emit();
  },

  // SAVE / LOAD -------------------------------------------------------------------------------------
  save() {
    const st = storage();
    if (!Game.keepLocal || Game.remote || Game._quiet || !st || !Game.setup) return;
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
  /** a game in progress can go into a save slot: not online, not finished, not broken */
  canSave() {
    return Game.setup !== null && !Game.remote && !Game.over && !Game.error;
  },
  /** continue a saved game (slot or file): its answers are replayed, and it becomes the game a reload resumes */
  resume(setup, rec) {
    if (Game.remote) return false;
    Game.setup = { colors: setup.colors.slice(), opts: setup.opts };
    Game.rec = rec.map((r) => ({ a: r.a, h: !!r.h, t: r.t || '' }));
    Game.launch();
    Game.save();
    return true;
  },
  /**
   * replay a stored game in the background: nothing is shown or saved. Resolves null when the answers play out up to a
   * question of the game (or to its end), otherwise the reason. A game in progress is put back exactly as it was, and
   * the call returns only once that game has stopped at its next question (its steps all run on microtasks).
   */
  async verify(setup, rec) {
    if (Game.remote) return 'Không thể thay ván đang chơi online bằng bản lưu.';
    const keep = { setup: Game.setup, rec: Game.rec, speed: Game.speed };
    let reason = null;
    Game._quiet = true;
    Game.stop(); // the game in progress is set aside; its steps stop at their next question
    await sleep(0);
    Game.setup = { colors: setup.colors.slice(), opts: setup.opts };
    Game.rec = rec.map((r) => ({ a: r.a, h: !!r.h, t: r.t || '' }));
    Game.speed = 0;
    try {
      Game.launch();
      const t0 = Date.now();
      // the engine runs on microtasks, so the replay stops at the first question the record does not answer
      while (!Game.over && !Game.error && !Game.prompt && Date.now() - t0 < VERIFY_MS) await sleep(0);
      if (Game.error) {
        reason ='Bản lưu này không khớp với luật của phiên bản hiện tại nên không tải được.';
      } else if (!Game.over && !Game.prompt) reason = 'Bản lưu này mất quá lâu để kiểm tra.';
    } catch (e) {
      console.error(e);
      reason = 'Không kiểm tra được bản lưu này.';
    } finally {
      // the dry run is over: its steps must stop before the game that comes next takes over the shared state
      Game.token++;
      await sleep(0);
      Game._quiet = false;
      Game.setup = keep.setup;
      Game.rec = keep.rec;
      Game.speed = keep.speed;
      if (keep.setup) Game.launch();
      else Game.stop();
    }
    if (keep.setup) await settled();
    return reason;
  },
  clearSave() {
    const st = storage();
    if (!Game.keepLocal || Game.remote) return;
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
    Game.waitTitle = null;
    Game._resolve = null;
    Game._await = null;
    Game._sent = -1;
    Game.remote = null;
    Game.setup = null;
    Game.rec = [];
    Game.over = false;
    Game.error = null;
    Game.emit();
  },
};
