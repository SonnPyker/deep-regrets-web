// The server's copy of the game engine. Its state is module-level (S, RT), so it holds one room's game at a time:
// load() replays the stored answers, the bots answer by themselves, and the engine parks at the next question for a
// human seat. Callers must run inside the rooms' serial queue.

import { Game } from '../src/engine/game.js';

Game.speed = 0; // no pauses for bots here: each client paces its own replay
Game.keepLocal = false;

/** after this resolves every microtask of the engine has run (the engine uses no timers when speed is 0) */
const tick = () => new Promise((resolve) => setImmediate(resolve));

let held = null; // room code whose game the engine holds
let stored = 0; // how many answers of that game are already in the store

export const engine = {
  holds: (code) => held === code,
  invalidate() {
    held = null;
  },
  /** make the engine hold this room's game, replayed from its stored answers */
  async load(code, setup, rows) {
    Game.setup = { colors: setup.colors.slice(), opts: setup.opts };
    Game.rec = rows.map((r) => ({ a: r.a, h: !!r.h, t: r.t || '' }));
    stored = rows.length;
    held = code;
    Game.launch();
    await tick();
  },
  /** give the engine an answer for the prompt it is parked at; resolves when it is parked again */
  async answer(v) {
    const ok = Game.answer(v);
    await tick();
    return ok;
  },
  count: () => Game.rec.length,
  records: () => Game.rec.map(({ a, h, t }) => ({ a, h, t })),
  /** answers recorded since the last stored(), bots included, with their index */
  unsaved: () => Game.rec.slice(stored).map((r, j) => ({ n: stored + j, a: r.a, h: r.h, t: r.t })),
  stored() {
    stored = Game.rec.length;
  },
  prompt: () => Game.prompt,
  over: () => Game.over,
  error: () => Game.error,
};
