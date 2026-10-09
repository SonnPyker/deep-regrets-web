import { playGame, replayGame, ALL } from './harness.mjs';

const N = Number(process.argv[2] || 6);
const fails = [];
const stats = {};
let games = 0;
const OPTS = [
  { tent: false, big: false, short: false },
  { tent: true, big: true, short: false },
  { tent: true, big: false, short: true },
];
for (let seed = 1; seed <= N; seed++) {
  for (let n = 1; n <= 5; n++) {
    const colors = ALL.slice(0, n);
    const opts = OPTS[seed % OPTS.length];
    const label = `n=${n} seed=${seed} opts=${JSON.stringify(opts)}`;
    try {
      const g = await playGame(colors, opts, seed, { stats });
      games++;
      const rp = await replayGame(colors, opts, seed, g.answers);
      if (rp.final !== g.final) throw new Error('REPLAY mismatch (final state differs)');
      if (rp.log.join('\n') !== g.log.join('\n')) throw new Error('REPLAY mismatch (log differs)');
      if (rp.used !== g.answers.length) throw new Error('REPLAY did not use all answers');
    } catch (e) {
      fails.push(`${label}: ${e.stack.split('\n').slice(0, 7).join('\n   ')}`);
    }
  }
}
console.log(`${games} games finished OK, ${fails.length} failures`);
for (const f of fails.slice(0, 10)) console.log('FAIL', f);
if (process.argv[3] === 'stats') console.log(stats);
process.exit(fails.length ? 1 : 0);
