// A small heuristic player. It only reads the public state plus what its own prompt shows, never consumes the
// game's random stream (so a recorded game replays identically no matter what a bot "thinks"), and always
// returns a valid answer: an option index for pick prompts, an array of item indices (or null) for multi prompts.

import { S } from './state.js';
import { D } from './data.js';
import { Rl, Dc } from './core.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const enabled = (pr) => pr.opts.map((o, i) => [o, i]).filter(([o]) => !o.dis);
const byId = (pr, id) => {
  const e = enabled(pr).find(([o]) => o.id === id);
  return e ? e[1] : -1;
};
const firstEnabled = (pr) => {
  const e = enabled(pr);
  return e.length ? e[0][1] : 0;
};
const textOf = (o) => (o.label || '').toLowerCase();

// per-seat counter that stops a bot from looping on a turn prompt forever
const loops = new Map();

function sellableVal(p, id) {
  return Rl.sellable(id) ? Rl.val(p, id) : 0;
}

function rodDiscount(p, f) {
  if (p.rodE === false) return 0;
  const rod = D.rod[p.rodE];
  let d = 0;
  if (rod.all) d += rod.all;
  if (rod.size && f.s === rod.size) d += rod.red;
  if (rod.foul !== undefined && f.foul === rod.foul) d += rod.red;
  return d;
}

function castScore(p, d, col) {
  const sh = S.sea[d - 1][col - 1];
  const sum = Dc.freshSum(p);
  const mad = Rl.mad(p);
  if (sh.cards.length === 0) return -9;
  if (sh.rev) {
    const f = D.fish[sh.cards[0]];
    if (f.special && f.novalue) return -2;
    const df = Math.max(0, (f.df ?? 4) - rodDiscount(p, f));
    if (sum < df) return -9;
    const val = f.novalue ? 0 : Rl.val(p, f.id);
    return val + 0.4 - (f.foul ? 0.9 : 0) - df * 0.12;
  }
  const ev = [3.1, 3.9, 4.7][d - 1] + mad.fair * 0.5;
  const avg = [3, 4.5, 6][d - 1];
  const prob = clamp(sum / (avg * 1.15), 0, 1);
  return ev * prob * 0.95 - 0.55 + (S.day >= S.dayLast - 1 ? 0.4 : 0);
}

function goodSupply(o, p) {
  const t = textOf(o);
  if (t.includes('rút') && t.includes('regret')) return false;
  if (t.includes('bỏ') && t.includes('regret')) return p.reg.length >= 2;
  if (t.includes('refresh')) return p.dice.filter((d) => !d.fr).length >= 2;
  return false;
}

function goodEat(o, p) {
  const t = textOf(o);
  if (t.includes('rút') && t.includes('regret')) return false;
  if (t.includes('bỏ') && t.includes('regret')) return p.reg.length >= 3 && p.hand.length > 2;
  return false;
}

function goodReel(o, p) {
  const r = D.reel[o.reel];
  if (!r || (r.kind !== 'rr' && r.kind !== 'max')) return false;
  return Dc.fresh(p).some((d) => d.v < Dc.mean(d.k));
}

/** the Port shops the bot wants most, in order (shop options are one per shop now, so the bot picks among them here) */
function shopWant(p) {
  const want = [];
  if (p.rods.length === 0) want.push('rod');
  if (p.reels.length === 0) want.push('reel');
  if (S.day <= 4) want.push('dice');
  want.push('sup', 'rod', 'reel', 'dice');
  return want;
}

function decideTurn(pr) {
  const me = pr.color;
  const p = S.P[me];
  const key = `${me}:${S.day}`;
  const n = (loops.get(key) || 0) + 1;
  loops.set(key, n);
  const ens = enabled(pr);
  const passI = ens.find(([o]) => o.k === 'pass');
  if (n > 80 && passI) return passI[1];
  const find = (k) => ens.find(([o]) => o.k === k);

  for (const [o, i] of ens) {
    if (o.k === 'dinkDis' || o.k === 'skull' || o.k === 'cloche') return i;
    if (o.k === 'big') return i;
    if (o.k === 'sup' && goodSupply(o, p)) return i;
    if (o.k === 'reel' && goodReel(o, p)) return i;
    if (o.k === 'eat' && goodEat(o, p)) return i;
  }

  if (p.loc === 'port') {
    const m = find('mount');
    if (m) return m[1];
    if (p.bucks >= 1 && S.day < S.dayLast) {
      for (const k of shopWant(p)) {
        const sh = ens.find(([o]) => o.k === 'shop' && o.shop === k);
        if (sh) return sh[1];
      }
    }
    const se = find('sell');
    if (se && S.day < S.dayLast && p.bucks < 3 && p.hand.some((id) => Rl.sellable(id) && Rl.val(p, id) <= 2 && !D.fish[id].foul)) return se[1];
    return passI ? passI[1] : firstEnabled(pr);
  }

  let best = null;
  let bs = -99;
  for (const [o, i] of ens) {
    if (o.k !== 'cast') continue;
    const s = castScore(p, o.shoal[0], o.shoal[1]);
    if (s > bs) {
      bs = s;
      best = i;
    }
  }
  if (best !== null && bs > 0.6) return best;
  const sink = find('sinkers');
  if (sink && Dc.freshSum(p) >= 5 && p.dep < 3) return sink[1];
  return passI ? passI[1] : firstEnabled(pr);
}

function decideDeclare(pr) {
  const p = S.P[pr.color];
  const portI = byId(pr, 'port');
  const seaI = byId(pr, 'sea');
  if (portI < 0) return seaI;
  const hand = p.hand.filter((id) => Rl.sellable(id));
  const open = p.mount.filter((m) => !m).length;
  const best = hand.reduce((m, id) => Math.max(m, Rl.val(p, id)), 0);
  const last = S.day >= S.dayLast;
  const mad = Rl.mad(p);
  if (last && hand.length > 0) return portI;
  if (open > 0 && best >= 3 && hand.length >= 1) return portI;
  if (hand.length >= 4) return portI;
  if (p.reg.length >= 9 && p.bucks >= 3) return portI;
  if (Dc.freshSum(p) <= 3 && mad.maxd <= 5) return portI;
  return seaI >= 0 ? seaI : portI;
}

function decidePay(pr) {
  const m = pr.meta || { diff: 0, sum: 0 };
  const pay = byId(pr, 'pay');
  if (pay >= 0) return pay;
  const alt = byId(pr, 'alt');
  if (alt >= 0) return alt;
  const worm = byId(pr, 'worm4');
  if (worm >= 0 && m.diff > 4 && m.sum >= 4) return worm;
  const need = m.diff - m.sum;
  const diffOps = enabled(pr).filter(([o]) => o.k === 'dinkDiff' || o.k === 'supDiff' || o.k === 'lp');
  const power = diffOps.reduce((s, [o]) => s + (o.k === 'lp' ? 2 : o.n || 0), 0);
  if (need > 0 && diffOps.length > 0 && power >= need) {
    diffOps.sort((a, b) => (b[0].n || 2) - (a[0].n || 2));
    return diffOps[0][1];
  }
  const give = byId(pr, 'dink');
  if (give >= 0) return give;
  return firstEnabled(pr);
}

function decidePick(pr) {
  const me = pr.color;
  const p = S.P[me];
  const en = enabled(pr);
  if (en.length === 0) return 0;
  switch (pr.tag) {
    case 'turn':
      return decideTurn(pr);
    case 'declare':
      return decideDeclare(pr);
    case 'pay':
      return decidePay(pr);
    case 'yn': {
      const t = pr.title;
      const yes = byId(pr, 'y');
      const no = byId(pr, 'n');
      if (/Rod of the Dead|Make Port: bỏ/.test(t)) return yes;
      return no >= 0 ? no : en[0][1];
    }
    case 'passReward': {
      const reg = byId(pr, 'reg');
      const dink = byId(pr, 'dink');
      if (reg >= 0 && (p.reg.length >= 3 || dink < 0)) return reg;
      return dink >= 0 ? dink : en[0][1];
    }
    case 'shopTier': {
      let best = -1;
      for (const [o, i] of en) if (typeof o.id === 'number' && (best < 0 || o.id > pr.opts[best].id)) best = i;
      return best >= 0 ? best : en[0][1];
    }
    case 'mount': {
      let best = -1;
      let bv = -1;
      for (const [o, i] of en) {
        if (o.fish === undefined) continue;
        const v = Rl.val(p, o.fish);
        if (v > bv) {
          bv = v;
          best = i;
        }
      }
      return best >= 0 ? best : en[0][1];
    }
    case 'slot': {
      let best = -1;
      let bm = -1;
      for (const [o, i] of en) {
        if (typeof o.id !== 'number') continue;
        const m = Rl.mountMult(o.id);
        if (m > bm) {
          bm = m;
          best = i;
        }
      }
      return best >= 0 ? best : en[0][1];
    }
    case 'player': {
      // hurt the leader
      let best = en[0][1];
      let bs = -1;
      for (const [o, i] of en) {
        if (!o.seat) continue;
        const s = Rl.score(S.P[o.seat])[3];
        if (s > bs) {
          bs = s;
          best = i;
        }
      }
      return best;
    }
    case 'worms': {
      const e = en.find(([o]) => o.id === 'top');
      const f = D.fish[pr.show[0] ? pr.show[0].id : 0];
      if (e && f && (f.novalue || (f.v || 0) < 3 || (f.df || 0) > Dc.freshSum(p) + 1)) return byId(pr, 'bot');
      return e ? e[1] : en[0][1];
    }
    case 'prelude': {
      const i = byId(pr, 'worms');
      return i >= 0 ? i : byId(pr, 'go');
    }
    case 'coffin':
      return byId(pr, 0) >= 0 ? byId(pr, 0) : en[en.length - 1][1];
    case 'hadal':
      return byId(pr, 'no');
    case 'peekUnder':
      return byId(pr, 'no') >= 0 ? byId(pr, 'no') : en[0][1];
    case 'reroll1': {
      let best = -1;
      let gap = 0;
      for (const [o, i] of en) {
        if (!o.die) continue;
        const g = Dc.mean(o.die.k) - o.die.v;
        if (g > gap) {
          gap = g;
          best = i;
        }
      }
      return best >= 0 ? best : byId(pr, 'skip');
    }
    case 'inc': {
      let best = en[0][1];
      let bv = 99;
      for (const [o, i] of en) if (o.die && o.die.v < bv) ((bv = o.die.v), (best = i));
      return best;
    }
    case 'spendDie': {
      let best = -1;
      let bv = 99;
      for (const [o, i] of en) if (o.die && o.die.v < bv) ((bv = o.die.v), (best = i));
      return best >= 0 ? best : en[0][1];
    }
    case 'reorder': {
      let best = en[0][1];
      let bv = -99;
      for (const [o, i] of en) {
        const f = o.fish !== undefined ? D.fish[o.fish] : null;
        const v = f ? (f.novalue ? -1 : f.v || 0) - (f.foul ? 0.5 : 0) : 0;
        if (v > bv) {
          bv = v;
          best = i;
        }
      }
      return best;
    }
    case 'discSmall':
    case 'discard':
    case 'cloche':
    case 'mimic': {
      let best = en[0][1];
      let bv = 99;
      for (const [o, i] of en) {
        if (o.fish === undefined) continue;
        const v = Rl.val(p, o.fish);
        if (v < bv) {
          bv = v;
          best = i;
        }
      }
      return best;
    }
    case 'revealToCatch':
      return en.find(([o]) => o.id !== 'no')?.[1] ?? en[0][1];
    case 'equipRod':
    case 'equipReel':
      return en.find(([o]) => o.id !== 'none')?.[1] ?? en[0][1];
    case 'ack':
      return en[0][1];
    default: {
      // prefer a real choice over a cancel / back option
      const real = en.filter(([o]) => o.kind !== 'cancel' && o.kind !== 'pass');
      return (real.length ? real : en)[0][1];
    }
  }
}

function trySubsets(pr, n, lo, hi) {
  // smallest-first search over index subsets of an item list (lists in prompts are tiny)
  const cap = Math.min(n, 12);
  for (let size = lo; size <= Math.min(hi, cap); size++) {
    const idx = [];
    const rec = (start) => {
      if (idx.length === size) return pr.check(idx).ok;
      for (let i = start; i < cap; i++) {
        idx.push(i);
        if (rec(i + 1)) return true;
        idx.pop();
      }
      return false;
    };
    if (rec(0)) return idx.slice();
  }
  return null;
}

function decideMulti(pr) {
  const p = S.P[pr.color];
  const ok = (a) => Array.isArray(a) && pr.check(a).ok;
  if (pr.tag === 'sell') {
    // sell the cheapest Fair fish until a Tier-3 shop is affordable
    const want = Math.max(1, 5 - p.bucks);
    const order = pr.items.map((it, i) => ({ i, f: D.fish[it.id], v: Rl.val(p, it.id) }));
    order.sort((a, b) => (a.f.foul ? 1 : 0) - (b.f.foul ? 1 : 0) || a.v - b.v);
    const pick = [];
    let sum = 0;
    for (const o of order) {
      if (sum >= want) break;
      pick.push(o.i);
      sum += o.v;
    }
    if (ok(pick)) return pick;
  }
  if (pr.auto) {
    const a = pr.auto();
    if (ok(a)) return a;
  }
  if (ok(pr.init)) return pr.init;
  const lo = pr.min ?? 0;
  const hi = pr.max ?? pr.items.length;
  const s = trySubsets(pr, pr.items.length, lo, hi);
  if (s) return s;
  if (pr.cancel) return null;
  const all = pr.items.map((_, i) => i);
  return ok(all) ? all : [];
}

export const Bot = {
  decide(pr) {
    return pr.kind === 'multi' ? decideMulti(pr) : decidePick(pr);
  },
  reset() {
    loops.clear();
  },
};
