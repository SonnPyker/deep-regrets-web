// Bench: play seeded games and compare the Bot with random choosers. Read-only with respect to the repo.
// Usage: node tests/bench.mjs [games=300] [players=3] [mode=mixed|allbot|allrandom]
//   mixed:      seat Red is the Bot, the other seats choose at random
//   allbot:     every seat is the Bot
//   allrandom:  no Bot seats; its stats are filed under the "bot" key
// Seeds run 1..games, so a run can be repeated exactly. Prints one JSON summary on stdout (errors go to stderr).

import { S, RT } from '../src/engine/state.js';
import { Setup } from '../src/engine/setup.js';
import { Fl } from '../src/engine/flow.js';
import { Bot } from '../src/engine/bot.js';
import { ALL, chooseRandom, lcg } from './harness.mjs';

const MODES = ['mixed', 'allbot', 'allrandom'];
const N = Number(process.argv[2] || 300);
const NP = Number(process.argv[3] || 3);
const MODE = process.argv[4] || 'mixed';
// two to five players: a solo game (Ocean Survey) has no per-player rows to compare
if (!Number.isInteger(N) || N < 1 || !Number.isInteger(NP) || NP < 2 || NP > ALL.length || !MODES.includes(MODE)) {
  console.error('usage: node tests/bench.mjs [games=300] [players=2-5] [mode=mixed|allbot|allrandom]');
  process.exit(2);
}

const colors = ALL.slice(0, NP);
const stats = {
  bot: { tot: 0, n: 0, win: 0, share: 0, regN: 0 },
  rnd: { tot: 0, n: 0, win: 0, share: 0, regN: 0 },
};
let games = 0;
let errors = 0;
for (let seed = 1; seed <= N; seed++) {
  const r = lcg(seed * 31 + 7);
  let steps = 0;
  RT.driver = {
    async ask(pr) {
      steps++;
      if (steps > 40000) throw new Error('too many steps');
      const useBot = MODE === 'allbot' || (MODE === 'mixed' && pr.color === 'Red');
      if (useBot) {
        const a = Bot.decide(pr);
        if (pr.kind === 'pick' && typeof a === 'number' && pr.opts[a] && !pr.opts[a].dis) return a;
        if (pr.kind === 'multi' && (Array.isArray(a) || a === null) && (a === null || pr.check(a).ok)) return a;
      }
      return chooseRandom(pr, r);
    },
  };
  RT.log.length = 0;
  Bot.reset();
  try {
    Setup.newGame(colors, { tent: true, big: true, short: false, seed });
    await Fl.main();
    games++;
    const rows = S.res.rows;
    const best = Math.max(...rows.map((x) => x.total));
    const sum = rows.reduce((s, x) => s + x.total, 0);
    for (const row of rows) {
      const grp = MODE === 'mixed' ? (row.c === 'Red' ? 'bot' : 'rnd') : 'bot';
      const g = stats[grp];
      g.tot += row.total;
      g.n++;
      g.regN += row.regN;
      if (row.total === best) g.win++;
      g.share += row.total / Math.max(1, sum);
    }
  } catch (e) {
    errors++;
    if (errors <= 3) console.error('seed', seed, 'error:', String(e.message || e).slice(0, 200));
  }
}
const f = (g) =>
  g.n
    ? {
        avgTotal: (g.tot / g.n).toFixed(2),
        winRateShared: (g.win / g.n).toFixed(3),
        avgShare: (g.share / g.n).toFixed(3),
        avgRegrets: (g.regN / g.n).toFixed(2),
        seats: g.n,
      }
    : null;
console.log(JSON.stringify({ mode: MODE, players: NP, games, errors, bot: f(stats.bot), random: f(stats.rnd) }, null, 1));
if (errors > 0) process.exitCode = 1;
