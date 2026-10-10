// Bench: play seeded games and compare the Bot with other choosers. Read-only with respect to the repo.
// Usage: node tests/bench.mjs [games=300] [players=3] [mode=mixed|allbot|allrandom] [--red=profile] [--set=knob=value,...]
//                             [--opp=rnd|profile] [--from=1]
//   mixed:      seat Red is the Bot, the other seats choose at random (with --opp=<profile> they play the Bot with that profile)
//   allbot:     every seat is the Bot
//   allrandom:  no Bot seats; its stats are filed under the "bot" key
//   --red:      the profile Red plays with (every seat in allbot); --set overrides single knobs for it, e.g. --set=castMin=0.4
//   --opp:      what the other seats play in mixed mode: rnd (the random chooser, the default) or a profile
//   --from:     first seed; games run from..from+games-1, so a tuning set and a validation set can differ
// Seeds run from..from+games-1, so a run can be repeated exactly. Prints one JSON summary on stdout (errors go to stderr).
// "fallbacks" counts bot answers that were not valid for their prompt; those seats were answered at random instead.

import { S, RT } from '../src/engine/state.js';
import { Setup } from '../src/engine/setup.js';
import { Fl } from '../src/engine/flow.js';
import { Bot } from '../src/engine/bot.js';
import { ALL, chooseRandom, lcg } from './harness.mjs';

// Named opponents for the Bot. "default" is the Bot as shipped (its knobs, whatever they are now). The other presets
// are written out in full, so they do not move when the Bot's defaults change. "v0" is the Bot before the threshold
// tuning. "greedy" is a plainer player to measure against: it casts whenever the expected score is positive and
// skips the special options and sinkers, otherwise the same rules as v0.
const V0 = {
  specials: true,
  castMin: 0.6,
  castSlack: 1.15,
  castCost: 0.55,
  lastBonus: 0.4,
  revealBonus: 0.4,
  sinkFresh: 5,
  sinkDep: 3,
  portBest: 3,
  portHand: 4,
  portRegs: 9,
  portBucks: 3,
  seaFresh: 3,
  seaMaxd: 5,
  sellBucks: 3,
  sellVal: 2,
  diceDay: 4,
  sellTarget: 5,
  passRegs: 3,
  supRegs: 2,
  refreshMin: 2,
  eatRegs: 3,
  eatHand: 2,
};
const PROFILES = {
  default: {},
  v0: V0,
  greedy: { ...V0, specials: false, castMin: 0, sinkFresh: 99 },
};

const MODES = ['mixed', 'allbot', 'allrandom'];
const args = process.argv.slice(2);
const flags = {};
const pos = [];
for (const a of args) {
  const m = /^--([a-z]+)=(.*)$/.exec(a);
  if (m) flags[m[1]] = m[2];
  else pos.push(a);
}
const N = Number(pos[0] || 300);
const NP = Number(pos[1] || 3);
const MODE = pos[2] || 'mixed';
const FROM = Number(flags.from || 1);
const RED = flags.red || 'default';
const OPP = flags.opp || 'rnd';
const SET = flags.set || '';

// a profile is a named preset plus optional knob overrides; a knob keeps its type (boolean or number)
function profile(name, sets) {
  if (!Object.hasOwn(PROFILES, name)) throw new Error(`unknown profile ${name}`);
  const cfg = { ...PROFILES[name] };
  for (const kv of sets.split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (!Object.hasOwn(Bot.knobs, k)) throw new Error(`unknown knob ${k}`);
    if (typeof Bot.knobs[k] === 'boolean') {
      if (v !== 'true' && v !== 'false') throw new Error(`knob ${k} takes true or false`);
      cfg[k] = v === 'true';
    } else {
      if (!Number.isFinite(Number(v)) || v === '') throw new Error(`knob ${k} takes a number`);
      cfg[k] = Number(v);
    }
  }
  return cfg;
}

// two to five players: a solo game (Ocean Survey) has no per-player rows to compare
let redCfg;
let oppCfg = null;
try {
  if (!Number.isInteger(N) || N < 1 || !Number.isInteger(NP) || NP < 2 || NP > ALL.length || !MODES.includes(MODE)) throw new Error('bad arguments');
  if (!Number.isInteger(FROM) || FROM < 1) throw new Error('--from takes a seed of 1 or more');
  redCfg = profile(RED, SET);
  if (OPP !== 'rnd') oppCfg = profile(OPP, '');
} catch (e) {
  console.error(String(e.message || e));
  console.error('usage: node tests/bench.mjs [games=300] [players=2-5] [mode=mixed|allbot|allrandom] [--red=profile] [--set=knob=value,...] [--opp=rnd|profile] [--from=1]');
  console.error(`profiles: ${Object.keys(PROFILES).join(', ')}`);
  process.exit(2);
}

// the chooser for a seat: a Bot profile, or null for the random chooser
const chooserFor = (color) => {
  if (MODE === 'allbot') return redCfg;
  if (MODE === 'mixed') return color === 'Red' ? redCfg : oppCfg;
  return null;
};
const OTHER = oppCfg ? 'opp' : 'random';

const colors = ALL.slice(0, NP);
const newStat = () => ({ tot: 0, n: 0, win: 0, share: 0, regN: 0 });
const stats = { bot: newStat(), [OTHER]: newStat() };
let games = 0;
let errors = 0;
let fallbacks = 0;
for (let seed = FROM; seed < FROM + N; seed++) {
  const r = lcg(seed * 31 + 7);
  let steps = 0;
  RT.driver = {
    async ask(pr) {
      steps++;
      if (steps > 40000) throw new Error('too many steps');
      const cfg = chooserFor(pr.color);
      if (cfg) {
        const a = Bot.decide(pr, { cfg });
        if (pr.kind === 'pick' && typeof a === 'number' && pr.opts[a] && !pr.opts[a].dis) return a;
        if (pr.kind === 'multi' && (Array.isArray(a) || a === null) && (a === null || pr.check(a).ok)) return a;
        fallbacks++;
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
      const grp = MODE === 'mixed' ? (row.c === 'Red' ? 'bot' : OTHER) : 'bot';
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
console.log(
  JSON.stringify(
    { mode: MODE, players: NP, games, errors, from: FROM, red: RED, set: SET, opp: OPP, bot: f(stats.bot), [OTHER]: f(stats[OTHER]), fallbacks },
    null,
    1,
  ),
);
if (errors > 0) process.exitCode = 1;
