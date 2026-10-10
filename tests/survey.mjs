// Ocean Survey (solo campaign): the sheet's rules, the kit a game starts with, and a few weeks played in a row.
import { playGame, replayGame, S, Setup, Dc } from './harness.mjs';
import { SOLO_REMOVED } from '../src/engine/setup.js';
import { OFFER, SHEET, budget, kitOf, newSurvey, progress, quote, readSurvey, record, settle } from '../src/engine/survey.js';

const fails = [];
async function t(label, fn) {
  try {
    await fn();
  } catch (e) {
    fails.push(`${label}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
  }
}
const ok = (c, msg) => {
  if (!c) throw new Error(msg);
};
const eq = (a, b, msg) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};

const KIT = { dice: ['b', 'o'], rods: [6], reels: [0], sups: [16] };
const SOLO = { tent: false, big: false, short: false };

// sheet and offers -----------------------------------------------------------------------------------
await t('sheet: 117 base Fish, the 8 removed from the solo Sea are on it', () => {
  eq(SHEET.length, 117, 'sheet size');
  ok(SOLO_REMOVED.every((id) => SHEET.includes(id)), 'removed fish on the sheet');
});

await t('offers: 28 unique keys with positive costs', () => {
  eq(new Set(OFFER.map((o) => o.key)).size, OFFER.length, 'unique keys');
  eq(OFFER.length, 28, 'offer count');
  ok(OFFER.every((o) => o.cost > 0), 'costs');
});

// rules on the sheet ---------------------------------------------------------------------------------
await t('new sheet: the removed Fish are checked, nothing unlocked, no week waiting', () => {
  const sv = newSurvey();
  eq(sv.checked, SOLO_REMOVED, 'checked');
  eq(sv.owned, [], 'owned');
  eq(sv.weeks, 0, 'weeks');
  eq(sv.pending, null, 'pending');
});

await t('record: a finished week waits to be settled, and a second record changes nothing', () => {
  const sv = record(newSurvey(), { kept: [{ id: 101 }, { id: 201 }], total: 9, disc: 2 });
  eq(sv.pending, { kept: [101, 201], total: 9, disc: 2 }, 'pending');
  eq(record(sv, { kept: [], total: 0, disc: 0 }), sv, 'second record ignored');
  eq(budget(sv), 11, 'budget = Value brought back + Dink discount');
  eq(budget(newSurvey()), 0, 'no budget without a week');
});

await t('quote: affordable basket priced; unknown, repeated, owned and over-budget refused', () => {
  const sv = { ...newSurvey(), pending: { kept: [101], total: 30, disc: 0 } };
  const q = quote(sv, ['rod:6', 'sup:6']);
  ok(q.ok && q.cost === 17 && q.left === 13, `affordable: ${q.msg}`);
  ok(!quote(sv, ['rod:0']).ok, 'over budget (80 > 30)');
  ok(!quote(sv, ['sup:99']).ok, 'unknown offer');
  ok(!quote(sv, ['rod:6', 'rod:6']).ok, 'repeated offer');
  ok(!quote({ ...sv, owned: ['rod:6'] }, ['rod:6']).ok, 'already owned');
});

await t('settle: the week joins the sheet, the basket is unlocked, unspent value is lost', () => {
  const sv = { ...newSurvey(), pending: { kept: [101, 201], total: 30, disc: 0 } };
  const r = settle(sv, ['rod:6', 'sup:6']);
  ok(r.ok, r.msg);
  eq(r.sv.weeks, 1, 'weeks');
  eq(r.sv.pending, null, 'pending cleared');
  ok(r.sv.checked.includes(101) && r.sv.checked.includes(201), 'brought-back Fish checked');
  eq(r.sv.owned, ['rod:6', 'sup:6'], 'owned');
  ok(!settle(r.sv, []).ok, 'nothing waiting to be settled');
});

await t('readSurvey: bad data starts a fresh sheet, unknown keys dropped, removed Fish kept checked', () => {
  eq(readSurvey(null), newSurvey(), 'null');
  eq(readSurvey({ v: 2, checked: [], owned: [] }), newSurvey(), 'other version');
  const sv = readSurvey({ v: 1, weeks: 2, checked: [101], owned: ['rod:6', 'rod:99', 'nope'] });
  eq(sv.owned, ['rod:6'], 'owned');
  eq(sv.weeks, 2, 'weeks');
  ok(sv.checked.includes(114) && sv.checked.includes(101), 'checked');
});

await t('a week played without Tentacles: every Fish in its Sea has a box on the sheet', () => {
  Setup.newGame(['Red'], { seed: 5, ...SOLO, kit: KIT });
  const ids = S.sea.flat().flatMap((col) => col.cards);
  ok(ids.length > 0, 'the Sea has Fish');
  const boxless = ids.filter((id) => !SHEET.includes(id));
  ok(boxless.length === 0, `Fish without a box: ${boxless}`);
});

await t('kitOf: owned offers become the kit the next game starts with', () => {
  eq(kitOf({ ...newSurvey(), owned: ['tackle:b', 'rod:6', 'reel:0', 'sup:16'] }), { dice: ['b'], rods: [6], reels: [0], sups: [16] }, 'kit');
});

// the game ---------------------------------------------------------------------------------------------
await t('setup: the kit starts in hand and its pieces leave the decks', () => {
  Setup.newGame(['Red'], { seed: 7, ...SOLO, kit: KIT });
  const p = S.P.Red;
  eq(p.rods, [6], 'rods');
  eq(p.reels, [0], 'reels');
  eq(p.items, [16], 'supplies');
  ok(!S.sd.includes(16) && !S.rod.includes(6) && !S.reel.includes(0), 'pieces left the decks');
  const tk = p.dice.filter((d) => Dc.tackle(d.k));
  eq(tk.map((d) => d.k).sort(), ['b', 'o'], 'tackle dice');
  ok(tk.every((d) => d.fr === false), 'tackle starts Spent, rolled on day 1');
});

await t('a game with a kit plays out, keeps its tackle, and replays identically', async () => {
  for (const seed of [3, 11]) {
    const o = { ...SOLO, kit: KIT };
    const a = await playGame(['Red'], o, seed);
    const tk = S.P.Red.dice.filter((d) => Dc.tackle(d.k)).length;
    eq(tk, 2, `tackle dice kept after the game (seed ${seed})`);
    eq(typeof S.res.disc, 'number', 'disc');
    const b = await replayGame(['Red'], o, seed, a.answers);
    ok(a.final === b.final, `replay differs (seed ${seed})`);
  }
});

await t('campaign: three weeks, each settled and the next game starts with what was unlocked', async () => {
  let sv = newSurvey();
  for (let week = 1; week <= 3; week++) {
    const kit = kitOf(sv);
    Setup.newGame(['Red'], { seed: 100 + week, ...SOLO, kit });
    eq(S.P.Red.rods.length, kit.rods.length, `week ${week} rods in hand`);
    await playGame(['Red'], { ...SOLO, kit }, 100 + week);
    sv = record(sv, S.res);
    ok(sv.pending, `week ${week} waiting`);
    eq(budget(sv), S.res.total + S.res.disc, `week ${week} budget`);
    // buy the cheapest offers the budget still covers
    const basket = [];
    for (const o of [...OFFER].sort((a, b) => a.cost - b.cost)) if (!sv.owned.includes(o.key) && quote(sv, [...basket, o.key]).ok) basket.push(o.key);
    const before = sv.owned.length;
    const r = settle(sv, basket);
    ok(r.ok, `week ${week} settle: ${r.msg}`);
    sv = r.sv;
    eq(sv.weeks, week, `week ${week} count`);
    eq(sv.owned.length, before + basket.length, `week ${week} owned grows by the basket`);
  }
  eq(progress(sv).done, sv.checked.filter((id) => SHEET.includes(id)).length, 'progress counts the sheet');
});

console.log(`survey: ${fails.length} failures`);
for (const f of fails) console.log('FAIL', f.slice(0, 500));
process.exit(fails.length ? 1 : 0);
