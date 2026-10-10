// Save slots: a save is checked (engine/saves.js), a saved game resumes to the same end as the live game, and the replay
// check (Game.verify) shows nothing, saves nothing and leaves a game in progress exactly as it was.
import { S } from '../src/engine/state.js';
import { Game } from '../src/engine/game.js';
import { makeSave, readSave, recOf, readSlots, summarize } from '../src/engine/saves.js';
import { newSurvey, kitOf } from '../src/engine/survey.js';
import { lcg, chooseRandom } from './harness.mjs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const AUTO = 'deepregrets.save.v1';

Game.speed = 0;
const wait = () => new Promise((r) => setTimeout(r, 0));
async function until(pred, ms = 20000) {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait();
  }
}

/** answer human prompts with the chooser: n answers at most, or until the game ends. Resolves true while the game goes on. */
async function play(r, n = Infinity) {
  for (let k = 0; k < n; k++) {
    await until(() => Game.over || Game.error || Game.prompt);
    if (Game.error) throw Game.error;
    if (Game.over) return false;
    if (!Game.answer(chooseRandom(Game.prompt, r))) throw new Error('answer rejected: ' + Game.prompt.title);
  }
  await until(() => Game.over || Game.error || Game.prompt);
  if (Game.error) throw Game.error;
  return !Game.over;
}

const coop = (seed) => ({ colors: ['Red', 'Orange'], opts: { tent: true, big: false, short: false, seed, seats: { Red: 'human', Orange: 'bot' } } });
const solo = (seed) => ({ colors: ['Red'], opts: { tent: false, big: false, short: false, seed, seats: { Red: 'human' }, kit: kitOf(newSurvey()) } });
const allBots = (seed) => ({ colors: ['Red', 'Orange', 'Green'], opts: { tent: true, big: true, short: false, seed, seats: { Red: 'bot', Orange: 'bot', Green: 'bot' } } });

/** the save as it would be written to a file and read back */
const roundTrip = (save) => JSON.parse(JSON.stringify(save));

const fails = [];
function check(label, ok, detail = '') {
  if (!ok) fails.push(`${label}${detail ? ` (${detail})` : ''}`);
}
async function t(label, fn) {
  try {
    await fn();
  } catch (e) {
    fails.push(`${label}: ${e.stack.split('\n').slice(0, 4).join(' | ')}`);
  }
}

// 1) a saved game, cut after n answers, resumes to exactly the end the live game reaches
for (const [setup, sheet, n] of [
  [coop(3), undefined, 1],
  [coop(4), undefined, 12],
  [coop(5), undefined, 40],
  [solo(6), newSurvey(), 10],
  [solo(7), newSurvey(), 20],
]) {
  const label = `${setup.colors.length === 1 ? 'solo' : 'coop'} seed=${setup.opts.seed} cut=${n}`;
  await t(label, async () => {
    Game.start(setup);
    await play(lcg(42));
    if (!S.res) throw new Error('live game did not finish');
    const endState = JSON.stringify(S);

    Game.start(setup);
    const r = lcg(42);
    await play(r, n);
    check(`${label}: canSave while playing`, Game.canSave());
    const save = roundTrip(makeSave({ setup: Game.setup, rec: Game.rec, sheet }));
    const back = readSave(save);
    check(`${label}: save reads back`, back.ok, back.msg);
    if (!back.ok) return;
    check(`${label}: save check passes`, (await Game.verify(back.save.setup, recOf(back.save))) === null);

    Game.stop();
    check(`${label}: stop clears the game`, Game.setup === null && !Game.canSave());
    store.delete(AUTO);
    check(`${label}: resume`, Game.resume(back.save.setup, recOf(back.save)));
    check(`${label}: resume makes the autosave`, JSON.parse(store.get(AUTO)).rec.length === back.save.rec.length);
    await play(r);
    if (Game.error) throw Game.error;
    check(`${label}: resumed game ends`, Game.over);
    check(`${label}: resumed game equals the live one`, JSON.stringify(S) === endState);
  });
}

// 2) a finished game cannot be saved, and a verified game is not disturbed
await t('finished game', async () => {
  Game.start(allBots(11));
  await until(() => Game.over || Game.error, 60000);
  if (Game.error) throw Game.error;
  check('a finished game cannot be saved', !Game.canSave());
  const setup = Game.setup;
  const rec = Game.rec.slice();
  check('a complete record passes the check', (await Game.verify(setup, rec)) === null);
  await wait();
  check('the finished game is put back', Game.over && Game.setup === setup && Game.rec.length === rec.length);
});

await t('verify keeps the game in progress', async () => {
  const done = { setup: allBots(21), rec: null };
  Game.start(done.setup);
  await until(() => Game.over || Game.error, 60000);
  done.rec = Game.rec.slice();
  Game.start(coop(9));
  const r = lcg(5);
  await play(r, 6);
  const before = JSON.stringify(S);
  const recBefore = Game.rec.length;
  const title = Game.prompt.title;
  const autoBefore = store.get(AUTO);
  const why = await Game.verify(done.setup, done.rec);
  check('verify passes for a finished game', why === null, why || '');
  await wait();
  check('verify keeps the state of the game', JSON.stringify(S) === before);
  check('verify keeps the prompt', Game.prompt !== null && Game.prompt.title === title);
  check('verify keeps the answers', Game.rec.length === recBefore);
  check('verify saves nothing', store.get(AUTO) === autoBefore);
  check('verify keeps the game playable', Game.answer(chooseRandom(Game.prompt, lcg(1))));
  await play(r);
  if (Game.error) throw Game.error;
  check('game goes on after verify', Game.over);
});

await t('verify without a game in progress', async () => {
  Game.stop();
  const setup = coop(31);
  Game.start(setup);
  await play(lcg(8), 4);
  const part = recOf(roundTrip(makeSave({ setup: Game.setup, rec: Game.rec })));
  Game.stop();
  check('partial record passes the check', (await Game.verify(setup, part)) === null);
  check('the check leaves no game behind', Game.setup === null && !Game.prompt && !Game.over);
  check('nothing is shown after the check', Game.thinking === null && Game.error === null);
});

await t('verify rejects a broken record', async () => {
  Game.stop();
  const setup = coop(41);
  Game.start(setup);
  await play(lcg(9), 8);
  const rec = Game.rec.map((x) => ({ ...x }));
  Game.stop();
  const k = rec.findIndex((x) => x.h && typeof x.a === 'number');
  rec[k] = { ...rec[k], a: 999 };
  const why = await Game.verify(setup, rec);
  check('broken answer is reported', typeof why === 'string' && why.length > 0, String(why));
  check('check leaves no game behind', Game.setup === null);
});

await t('verify refuses while online', async () => {
  Game.stop();
  Game.remote = { seat: 'Red', send: () => true };
  const why = await Game.verify(coop(1), []);
  Game.remote = null;
  check('online check refused', typeof why === 'string');
});

// 3) reading a save: the shape is checked, and a clean copy is returned
await t('readSave', async () => {
  Game.stop();
  Game.start(coop(51));
  await play(lcg(3), 3);
  const good = roundTrip(makeSave({ setup: Game.setup, rec: Game.rec }));
  check('good save reads', readSave(good).ok);
  const bad = (label, f) => {
    const s = roundTrip(good);
    f(s);
    check(`rejects ${label}`, !readSave(s).ok);
  };
  bad('a file of another format', (s) => (s.format = 'other'));
  bad('a future version', (s) => (s.v = 2));
  bad('a mode that does not match the seats', (s) => (s.mode = 'solo'));
  bad('a duplicate colour', (s) => (s.setup.colors = ['Red', 'Red']));
  bad('an unknown colour', (s) => (s.setup.colors = ['Red', 'Purple']));
  bad('a missing seed', (s) => delete s.setup.opts.seed);
  bad('a seed out of range', (s) => (s.setup.opts.seed = 2 ** 32));
  bad('a missing seat', (s) => delete s.setup.opts.seats.Orange);
  bad('an answer that is not an index', (s) => (s.rec[0][0] = -1));
  bad('a flag that is not 0/1', (s) => (s.rec[0][1] = 2));
  bad('a record that is not a list', (s) => (s.rec = 'abc'));
  bad('a solo save without its sheet', (s) => {
    s.mode = 'solo';
    s.setup.colors = ['Red'];
    s.setup.opts.seats = { Red: 'human' };
  });
  const back = readSave(good);
  check('the copy is not the file object', back.save.setup !== good.setup && back.save.rec !== good.rec);
  check('summary', summarize(back.save).answers === 3 && summarize(back.save).players === 2);
  const solo1 = roundTrip(makeSave({ setup: solo(61), rec: [], sheet: newSurvey() }));
  check('solo save reads', readSave(solo1).ok);
  check('solo week is the first week', summarize(readSave(solo1).save).week === 1);
});

await t('slots', () => {
  const slots = readSlots(null);
  check('no slots when nothing is stored', ['coop', 'solo'].every((m) => slots[m].length === 3 && slots[m].every((x) => x === null)));
  const game = roundTrip(makeSave({ setup: coop(71), rec: [] }));
  const mixed = readSlots({ slots: { coop: [game, 'junk', game, game, game], solo: [game] } });
  check('a good save fills its slot', mixed.coop[0] !== null && mixed.coop[2] !== null);
  check('junk leaves its slot empty', mixed.coop[1] === null);
  check('a save of the other mode is not in the slot', mixed.solo[0] === null);
  check('only three slots per mode', mixed.coop.length === 3);
});

for (const f of fails) console.log('FAIL', f);
console.log(`${fails.length} failures`);
process.exit(fails.length ? 1 : 0);
