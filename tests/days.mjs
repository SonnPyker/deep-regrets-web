// Game length: the day count option (6 by default; 9 and 12 for several players), the weekday effects that repeat each
// week, and saves that do not carry the option (they still play six days).
import { S, RT } from '../src/engine/state.js';
import { Setup } from '../src/engine/setup.js';
import { Fl } from '../src/engine/flow.js';
import { dayLabel, weekday, DAY_CHOICES } from '../src/engine/core.js';
import { makeSave, readSave } from '../src/engine/saves.js';
import { ALL, playGame, replayGame } from './harness.mjs';

const fails = [];
const check = (label, cond, detail = '') => {
  if (!cond) fails.push(`${label} ${detail}`.trim());
};

// labels and weekdays -----------------------------------------------------------------------------------
check('label 1', dayLabel(1) === 'Thứ Hai', dayLabel(1));
check('label 6', dayLabel(6) === 'Thứ Bảy', dayLabel(6));
check('label 7', dayLabel(7) === 'Thứ Hai · tuần 2', dayLabel(7));
check('label 12', dayLabel(12) === 'Thứ Bảy · tuần 2', dayLabel(12));
check('label 13', dayLabel(13) === 'Thứ Hai · tuần 3', dayLabel(13));
check('weekday 7', weekday(7) === 1 && weekday(12) === 6, `${weekday(7)} ${weekday(12)}`);
check('choices', JSON.stringify(DAY_CHOICES) === '[6,9,12]', JSON.stringify(DAY_CHOICES));

// setup -------------------------------------------------------------------------------------------------
const three = ALL.slice(0, 3);
const setupWith = (colors, extra) => {
  Setup.newGame(colors, { seed: 1, ...extra });
  return { dayLast: S.dayLast, optDays: S.opt.days, dayStart: S.dayStart };
};
check('default days', setupWith(three, {}).dayLast === 6);
check('days 6', setupWith(three, { days: 6 }).dayLast === 6);
check('days 9', setupWith(three, { days: 9 }).dayLast === 9);
check('days 12', setupWith(three, { days: 12 }).dayLast === 12);
check('invalid days fall back', setupWith(three, { days: 7 }).dayLast === 6);
check('invalid days (text)', setupWith(three, { days: '9' }).dayLast === 6);
const sh = setupWith(three, { days: 9, short: true });
check('short starts Tuesday', sh.dayStart === 2 && sh.dayLast === 9, JSON.stringify(sh));
const solo = setupWith(['Red'], { days: 12 });
check('solo stays 5 days', solo.dayLast === 5 && solo.optDays === 5, JSON.stringify(solo));

// full games with the longer lengths: invariants on every prompt, the weekly effects, and a replay ----------
const seaLeft = () => S.sea.reduce((n, row) => n + row.reduce((m, sh) => m + sh.cards.length, 0), 0);
for (const days of [9, 12]) {
  for (let seed = 1; seed <= 4; seed++) {
    const colors = ALL.slice(0, 2 + (seed % 3));
    const opts = { tent: seed % 2 === 0, big: seed % 3 === 0, short: seed === 4, days };
    const label = `days=${days} seed=${seed}`;
    try {
      const { answers, final, log } = await playGame(colors, opts, seed);
      check(label, S.dayLast === days, `dayLast ${S.dayLast}`);
      check(label, S.day === days || seaLeft() === 0, `ended on day ${S.day} with ${seaLeft()} fish left`);
      // weekly effects fire on every week's weekday, once per day that was reached
      const reached = [];
      for (let d = S.dayStart + 1; d <= S.day; d++) reached.push(weekday(d));
      const count = (pred) => log.filter(pred).length;
      const wantPay = reached.filter((w) => w === 4).length;
      const wantWorms = reached.filter((w) => w === 3 || w === 5).length;
      const wantBag = reached.filter((w) => w === 6).length;
      check(label, count((t) => t.startsWith('Ngày lãnh lương')) === wantPay, `payday ${count((t) => t.startsWith('Ngày lãnh lương'))} want ${wantPay}`);
      check(label, count((t) => t.startsWith('Mọi người lật Can of Worms')) === wantWorms, `worms want ${wantWorms}`);
      check(label, count((t) => t.startsWith('Thứ Bảy:')) === wantBag, `saturday want ${wantBag}`);
      // the same answers replay to the same game
      const again = await replayGame(colors, opts, seed, answers);
      check(label, again.final === final, 'replay differs');
    } catch (e) {
      check(label, false, String(e.message || e).slice(0, 200));
    }
  }
}

// saves: the option is optional and checked on read -------------------------------------------------------
const base = { colors: ['Red', 'Orange'], opts: { tent: true, big: false, short: false, seed: 5, seats: { Red: 'human', Orange: 'bot' } } };
const saveWith = (opts) => makeSave({ setup: { colors: base.colors, opts: { ...base.opts, ...opts } }, rec: [] });
check('old save reads', readSave(saveWith({})).ok);
check('save days 9 reads', readSave(saveWith({ days: 9 })).ok);
check('save days 7 refused', !readSave(saveWith({ days: 7 })).ok);
Setup.newGame(base.colors, { ...base.opts });
check('old save plays six days', S.dayLast === 6);

console.log(`days: ${fails.length} failures`);
for (const f of fails.slice(0, 20)) console.log('FAIL', f.slice(0, 400));
process.exit(fails.length ? 1 : 0);
