// Controller-level tests: all-bot games, human seats answered by a random player, undo, save/load via replay.
import { S, RT } from '../src/engine/state.js';
import { Game } from '../src/engine/game.js';
import { lcg, chooseRandom, ALL } from './harness.mjs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

Game.speed = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(pred, ms = 20000) {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(0);
  }
}

/** play every human prompt with the random chooser until the game ends */
async function playOut(seed, { undoEvery = 0 } = {}) {
  const r = lcg(seed);
  let n = 0;
  for (;;) {
    await until(() => Game.over || Game.error || Game.prompt);
    if (Game.error) throw Game.error;
    if (Game.over) return n;
    n++;
    if (n > 5000) throw new Error('too many human prompts');
    if (undoEvery && n % undoEvery === 0 && Game.canUndo()) {
      Game.undo();
      continue;
    }
    const a = chooseRandom(Game.prompt, r);
    if (!Game.answer(a)) throw new Error('answer rejected: ' + Game.prompt.title);
  }
}

const fails = [];
async function t(label, fn) {
  try {
    await fn();
  } catch (e) {
    fails.push(`${label}: ${e.stack.split('\n').slice(0, 5).join(' | ')}`);
  }
}

// 1) all bots, every player count, with options
for (let n = 1; n <= 5; n++) {
  for (let seed = 1; seed <= 6; seed++) {
    await t(`bots n=${n} seed=${seed}`, async () => {
      const seats = {};
      ALL.slice(0, n).forEach((c) => (seats[c] = 'bot'));
      Game.start({ colors: ALL.slice(0, n), opts: { tent: seed % 2 === 0, big: seed % 3 === 0, short: seed % 4 === 0, seed, seats } });
      await until(() => Game.over || Game.error, 60000);
      if (Game.error) throw Game.error;
      if (!S.res) throw new Error('no result');
      const final = JSON.stringify(S);
      // resume from the saved record must give the identical final state without asking anything
      Game.load();
      await until(() => Game.over || Game.error);
      if (JSON.stringify(S) !== final) throw new Error('resume differs');
    });
  }
}

// 2) mixed human / bot seats with undo
for (let seed = 1; seed <= 8; seed++) {
  await t(`mixed seed=${seed}`, async () => {
    const n = 2 + (seed % 3);
    const seats = {};
    ALL.slice(0, n).forEach((c, i) => (seats[c] = i === 0 || (seed % 2 === 0 && i === 1) ? 'human' : 'bot'));
    Game.start({ colors: ALL.slice(0, n), opts: { tent: true, big: true, short: false, seed, seats } });
    await playOut(seed, { undoEvery: seed % 2 ? 7 : 0 });
    if (!S.res) throw new Error('no result');
    // replaying the recorded answers reproduces the same game
    const final = JSON.stringify(S);
    const rec = Game.rec.slice();
    Game.rec = rec;
    Game.launch();
    await until(() => Game.over || Game.error);
    if (JSON.stringify(S) !== final) throw new Error('replay differs');
  });
}

console.log(`${fails.length} failures`);
for (const f of fails.slice(0, 15)) console.log('FAIL', f.slice(0, 500));
process.exit(fails.length ? 1 : 0);
