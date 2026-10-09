// Targeted tests: every Fish (cast / reveal / catch / eat), every Dink / Supply / Reel / Biggest Regret,
// and whole games that start from hand-made positions.

import { S, RT, Fl, Fx, Fi, Free, Setup, D, Rl, Dc, U, ALL, lcg, chooseRandom, check, countFish, expectFor, removeFish, takeFish, sweepSea, playGame, replayGame } from './harness.mjs';

RT.quiet = true;

/** run fn with a random-answer driver; throws on a prompt loop */
async function drive(fn, r, limit = 400) {
  let n = 0;
  RT.driver = {
    async ask(pr) {
      if (++n > limit) throw new Error(`prompt loop (${pr.title})`);
      return chooseRandom(pr, r);
    },
  };
  return fn();
}

function freshGame(seed, n, extra = {}) {
  Setup.newGame(ALL.slice(0, n), { tent: true, big: true, short: false, seed, ...extra });
  S.ph = 'action';
  S.turn = S.order[0];
  S.first = S.order[0];
  return S.order[0];
}

async function testFish(id, seed, nPlayers, opts) {
  const me = freshGame(seed, nPlayers);
  const exp = expectFor(ALL.slice(0, nPlayers));
  const r = lcg(seed);
  const f = D.fish[id];
  const p = S.P[me];
  removeFish(id);
  S.sea[f.d - 1][0].cards.unshift(id);
  if (opts.rev) S.sea[f.d - 1][0].rev = true;
  p.dep = f.d;
  p.dice = [];
  const kinds = ['p', 'p', 'p', 'b', 'g', 'o'];
  for (const k of kinds) p.dice.push({ k, v: Dc.roll(k), fr: true });
  S.bag.b--;
  S.bag.g--;
  S.bag.o--;
  const nd = Math.floor(r() * 9);
  for (let i = 0; i < nd; i++) await Fx.draw(me, 1, true);
  p.bucks = Math.floor(r() * 8);
  await Fx.dink(me, Math.floor(r() * 3));
  Fx.supply(me, Math.floor(r() * 3));
  if (r() < 0.7) {
    p.rods.push(S.rod.shift());
    p.rodE = p.rods[0];
  }
  if (r() < 0.7) {
    p.reels.push(S.reel.shift());
    p.reelE = p.reels[0];
  }
  const nh = Math.floor(r() * 3);
  for (let i = 0; i < nh; i++) {
    const sh = S.sea[Math.floor(r() * 3)][Math.floor(r() * 3)];
    if (sh.cards.length > 2) {
      const cid = sh.cards[sh.cards.length - 1];
      if (cid !== id) {
        sh.cards.pop();
        Fx.toHand(me, cid);
      }
    }
  }
  if (r() < 0.5) S.lp = me;
  // a Large fish in hand (alternative payments) and mounted fish for the other players (steal / swap effects)
  if (r() < 0.6) {
    const big = takeFish((x) => x.s === 'l' && !x.novalue && x.id !== id);
    if (big) Fx.toHand(me, big);
  }
  for (const c of S.order) {
    if (c === me) continue;
    for (let slot = 0; slot < 3; slot++) {
      if (r() < 0.6) {
        const m = takeFish((x) => !x.novalue && !x.special && x.id !== id);
        if (m) S.P[c].mount[slot] = m;
      }
    }
  }
  await drive(() => Fi.cast(me, f.d, 1), r);
  if (opts.eat && f.E) {
    if (!p.hand.includes(id)) {
      removeFish(id);
      Fx.toHand(me, id);
    }
    p.dy.reel = false;
    await drive(() => Free.eat(me, id), r);
  }
  check(exp, false);
}

async function testAllFish(nSeeds) {
  const fails = [];
  const ids = Object.keys(D.fish).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    for (let s = 1; s <= nSeeds; s++) {
      const np = (s % 4) + 2;
      try {
        await testFish(id, id * 31 + s, np, { eat: true, rev: s % 3 === 0 });
      } catch (e) {
        fails.push(`${D.fish[id].n} (${id}) seed ${s} players ${np}: ${e.stack.split('\n').slice(0, 5).join(' | ').slice(0, 600)}`);
        break;
      }
    }
  }
  return fails;
}

async function midGame(seed, np, loc) {
  const me = freshGame(seed, np);
  S.expect = expectFor(ALL.slice(0, np));
  const p = S.P[me];
  p.dep = 2;
  p.loc = loc || 'sea';
  for (const d of p.dice) {
    d.fr = true;
    d.v = Dc.roll(d.k);
  }
  for (let i = 0; i < 4; i++) await Fx.draw(me, 1, true);
  const r = lcg(seed + 5);
  for (let i = 0; i < 3; i++) {
    const sh = S.sea[Math.floor(r() * 3)][Math.floor(r() * 3)];
    if (sh.cards.length > 2) Fx.toHand(me, sh.cards.pop());
  }
  p.bucks = 5;
  return [me, p];
}

async function testItems(nSeeds) {
  const fails = [];
  async function attempt(label, seed, np, loc, setup, runner) {
    try {
      const [me, p] = await midGame(seed, np, loc);
      const exp = S.expect;
      delete S.expect;
      setup(me, p);
      await drive(() => runner(me, p), lcg(seed));
      check(exp, false);
    } catch (e) {
      fails.push(`${label} seed ${seed}: ${e.stack.split('\n').slice(0, 5).join(' | ').slice(0, 600)}`);
    }
  }
  const runAll = async (me, kind) => {
    const c = { me, mods: 0 };
    for (const fa of Free.list(me, { kind, c })) await fa.run();
  };
  for (let s = 1; s <= nSeeds; s++) {
    const np = (s % 4) + 2;
    for (let i = 0; i <= 24; i++) {
      for (const kind of ['sea', 'port', 'pay']) {
        await attempt(`dink ${i} ${kind}`, s, np, kind === 'port' ? 'port' : 'sea', (me, p) => {
          p.dinks = [i];
          U.rm(S.dk, i);
        }, (me) => runAll(me, kind));
      }
    }
    for (let i = 0; i <= 19; i++) {
      for (const kind of ['sea', 'port', 'pay']) {
        await attempt(`supply ${i} ${kind}`, s, np, kind === 'port' ? 'port' : 'sea', (me, p) => {
          p.items = [i];
          U.rm(S.sd, i);
        }, (me) => runAll(me, kind));
      }
    }
    for (let i = 0; i <= 9; i++) {
      await attempt(`reel ${i}`, s, np, 'sea', (me, p) => {
        p.reels = [i];
        p.reelE = i;
        U.rm(S.reel, i);
      }, (me) => runAll(me, 'sea'));
    }
    for (let i = 0; i <= 4; i++) {
      for (let t = 1; t <= 4; t++) {
        await attempt(`big ${i} tier ${t}`, s, np, 'sea', (me, p) => {
          p.big = i;
          const want = [0, 4, 9, 13][t - 1];
          S.rd.push(...p.reg);
          p.reg = [];
          S.rx.length = 0;
          for (let k = 0; k < want; k++) p.reg.push(S.rd.pop());
          p.dy.bt = 0;
        }, (me) => runAll(me, 'sea'));
      }
    }
  }
  return fails;
}

async function scenarios(nSeeds) {
  const fails = [];
  const OPT = { tent: true, big: true, short: false };
  async function run(label, colors, seed, mutate, o = {}) {
    try {
      const g = await playGame(colors, OPT, seed, { mutate, passRate: 0.1, ...o });
      const rp = await replayGame(colors, OPT, seed, g.answers, { mutate });
      if (rp.final !== g.final) throw new Error('REPLAY mismatch');
    } catch (e) {
      fails.push(`${label} seed ${seed}: ${e.stack.split('\n').slice(0, 6).join(' | ').slice(0, 900)}`);
    }
  }
  const grab = (pred) => takeFish(pred);
  for (let s = 1; s <= nSeeds; s++) {
    for (let n = 1; n <= 5; n++) {
      const cs = ALL.slice(0, n);
      await run(`empty sea ${n}`, cs, s, () => sweepSea(0));
      await run(`almost empty sea ${n}`, cs, s, () => sweepSea(1));
      await run(`plug ${n}`, cs, s, () => {
        grab((f) => f.plug);
        S.plug = true;
      });
      await run(`penalty ties ${n}`, cs, s, () => {
        for (const c of S.order) {
          const p = S.P[c];
          for (let slot = 0; slot < 3; slot++) {
            const id = grab((f) => f.v === 3 && !f.novalue && !f.fixed3 && !f.special) || grab((f) => !f.novalue && !f.special);
            p.mount[slot] = id;
          }
          S.rd.push(...p.reg);
          p.reg = [];
          for (let k = 0; k < 2; k++) p.reg.push(S.rd.pop());
        }
      }, { maxSteps: 3000 });
      await run(`give action ${n}`, cs, s, () => {
        const id = grab((f) => f.giveAct);
        if (id) Fx.toHand(S.order[0], id);
      });
      await run(`many regrets ${n}`, cs, s, () => {
        for (const c of S.order) {
          const p = S.P[c];
          for (let k = 0; k < 8 && S.rd.length; k++) p.reg.push(S.rd.pop());
        }
      });
      await run(`gear ${n}`, cs, s, () => {
        S.order.forEach((c, k0) => {
          const k = k0 + 1;
          const p = S.P[c];
          if (k === 1) {
            for (const fid of [202, 222]) {
              const id = grab((f) => f.id === fid);
              if (id) Fx.toHand(c, id);
            }
          }
          if (k === 2 || S.order.length === 1) {
            const id = grab((f) => f.id === 210);
            if (id) Fx.toHand(c, id);
          }
          if (k === 1) {
            p.items = [13];
            U.rm(S.sd, 13);
            p.reels = [5];
            p.reelE = 5;
            U.rm(S.reel, 5);
          }
          for (let q = 0; q < 3; q++) {
            const id = grab((f) => f.s === 's' && !f.novalue && !f.special && !f.must);
            if (id) Fx.toHand(c, id);
          }
          for (let q = 0; q < 3 && S.rd.length; q++) p.reg.push(S.rd.pop());
          p.bucks = 10;
          if ((k + s) % 2 === 0) p.loc = 'port';
        });
      }, { passRate: 0.04 });
      await run(`late game ${n}`, cs, s, () => {
        S.day = S.dayLast;
        for (const c of S.order) {
          for (let q = 0; q < 4; q++) {
            const id = grab((f) => !f.novalue && !f.special);
            if (id) Fx.toHand(c, id);
          }
          S.P[c].bucks = 7;
        }
      });
    }
    for (const R of [0, 3, 6, 40]) {
      await run(`solo jettison R=${R}`, ['Red'], s, () => {
        const p = S.P.Red;
        for (let q = 0; q < 6; q++) {
          const id = grab((f) => !f.novalue && !f.special);
          if (id) Fx.toHand('Red', id);
        }
        S.rd.push(...p.reg);
        p.reg = [];
        let left = R;
        while (left > 0) {
          // pull a card of the wanted value out of the Regret deck
          const v = Math.min(3, left);
          let i = S.rd.findIndex((id) => Math.floor(id / 100) - 1 === v);
          if (i < 0) i = S.rd.length - 1;
          const id = S.rd.splice(i, 1)[0];
          p.reg.push(id);
          left -= Math.max(1, Math.floor(id / 100) - 1);
        }
        S.over = true;
      }, { passRate: 0.1 });
    }
  }
  return fails;
}

const which = process.argv[2] || 'all';
const nSeeds = Number(process.argv[3] || 3);
let all = [];
if (which === 'all' || which === 'fish') all = all.concat(await testAllFish(nSeeds * 2));
if (which === 'all' || which === 'items') all = all.concat(await testItems(Math.max(1, nSeeds)));
if (which === 'all' || which === 'scen') all = all.concat(await scenarios(nSeeds));
console.log(`${all.length} failures`);
for (const f of all.slice(0, 40)) console.log('FAIL', f.slice(0, 420));
process.exit(all.length ? 1 : 0);
