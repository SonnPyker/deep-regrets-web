// Test harness: random-answer driver, invariants, replay determinism, targeted card tests.

import { S, RT } from '../src/engine/state.js';
import { U } from '../src/engine/util.js';
import { Setup } from '../src/engine/setup.js';
import { Fl } from '../src/engine/flow.js';
import { Fx } from '../src/engine/fx.js';
import { Fi } from '../src/engine/fish.js';
import { Free } from '../src/engine/free.js';
import { Rl, Dc } from '../src/engine/core.js';
import { D } from '../src/engine/data.js';

export const ALL = ['Red', 'Orange', 'Green', 'Blue', 'Teal'];

export function lcg(seed) {
  let st = (seed * 7919 + 13) >>> 0;
  return () => {
    st = (Math.imul(st, 1103515245) + 12345) & 0x7fffffff;
    return st / 2147483648;
  };
}

// ---- random driver ---------------------------------------------------------------------------------
export function chooseRandom(pr, r, passRate = 0.12) {
  if (pr.kind === 'pick') {
    const en = [];
    pr.opts.forEach((o, i) => {
      if (!o.dis) en.push(i);
    });
    if (en.length === 0) throw new Error('prompt without enabled option: ' + pr.title);
    const ok = en.find((i) => pr.opts[i].id === 'ok');
    if (ok !== undefined && r() < 0.45) return ok;
    const passI = en.find((i) => pr.opts[i].kind === 'pass');
    const others = en.filter((i) => pr.opts[i].kind !== 'pass');
    if (passI !== undefined && (others.length === 0 || r() < passRate)) return passI;
    if (others.length === 0) return en[0];
    return others[Math.floor(r() * others.length)];
  }
  // multi
  if (pr.auto && r() < 0.4) {
    const a = pr.auto();
    if (pr.check(a).ok) return a;
  }
  if (pr.cancel && r() < 0.25) return null;
  const idx = pr.items.map((_, i) => i);
  for (let t = 0; t < 300; t++) {
    const lo = pr.min ?? 0;
    const hi = Math.min(pr.max ?? idx.length, idx.length);
    const k = lo + Math.floor(r() * (hi - lo + 1));
    const pool = idx.slice();
    const pick = [];
    for (let j = 0; j < k && pool.length; j++) pick.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    if (pr.check(pick).ok) return pick;
  }
  if (pr.init && pr.check(pr.init).ok) return pr.init;
  if (pr.auto) {
    const a = pr.auto();
    if (pr.check(a).ok) return a;
  }
  if (pr.cancel) return null;
  throw new Error('cannot answer multi prompt: ' + pr.title);
}

// ---- invariants ------------------------------------------------------------------------------------
function fail(msg) {
  throw new Error('INVARIANT: ' + msg);
}

export function countFish() {
  const cnt = new Map();
  const where = new Map();
  const add = (id, w) => {
    if (id === undefined || id === null || id === false) return;
    cnt.set(id, (cnt.get(id) || 0) + 1);
    where.set(id, (where.get(id) ? where.get(id) + ',' : '') + w);
  };
  for (let d = 1; d <= 3; d++) {
    for (let col = 1; col <= 3; col++) for (const id of S.sea[d - 1][col - 1].cards) add(id, `sea${d}${col}`);
    for (const id of S.gy[d - 1]) add(id, `gy${d}`);
  }
  add(RT.fly, 'in-flight');
  if (S.plug) add(342, 'plug-on-table');
  for (const c of S.order) {
    const p = S.P[c];
    for (const id of p.hand) add(id, `${c}:hand`);
    for (let i = 0; i < 3; i++) add(p.mount[i], `${c}:mount`);
    add(p.clo, `${c}:clo`);
  }
  return { cnt, where };
}

export function check(expect, strict = true) {
  const eq = (a, b) => (strict ? a === b : a <= b);
  const { cnt, where } = countFish();
  let total = 0;
  for (const [id, n] of cnt) {
    total += n;
    if (n !== 1) fail(`fish ${id} appears ${n} times: ${where.get(id)}`);
    if (!D.fish[id]) fail('unknown fish ' + id);
  }
  if (!eq(total, expect.fish)) {
    const miss = [];
    for (const id of expect.ids) if (!cnt.has(id)) miss.push(`${id} ${D.fish[id].n}`);
    fail(`fish total ${total} expected ${expect.fish}; missing: ${miss.join(', ')}`);
  }
  let nreg = S.rd.length + S.rx.length;
  for (const c of S.order) nreg += S.P[c].reg.length;
  if (!eq(nreg, expect.reg)) fail(`regret total ${nreg} expected ${expect.reg}`);
  const t = { b: S.bag.b, g: S.bag.g, o: S.bag.o };
  for (const k of Object.keys(S.bag)) if (S.bag[k] < 0) fail('negative bag ' + k);
  for (const c of S.order) {
    const p = S.P[c];
    let np = 0;
    for (const d of p.dice) {
      if (d.k === 'p') np++;
      else if (t[d.k] !== undefined) t[d.k]++;
      if (d.k !== 'om' && !Dc.FACES[d.k].includes(d.v)) fail(`die ${d.k} has impossible value ${d.v}`);
      if (typeof d.fr !== 'boolean') fail('die fr flag not boolean');
    }
    if (np !== 3) fail(`${c} has ${np} player dice`);
    if (Dc.freshN(p) > Rl.maxDice(p) + 8) fail(`${c} has too many fresh dice`);
    if (p.bucks < 0 || p.bucks > 10) fail(`${c} bucks ${p.bucks}`);
    if (p.dep < 1 || p.dep > 3) fail(`${c} depth ${p.dep}`);
    if (p.loc !== 'sea' && p.loc !== 'port') fail(`${c} loc ${p.loc}`);
    if (p.mount.length !== 3) fail(`${c} mount length ${p.mount.length}`);
  }
  if (S.mode !== 'solo') {
    if (!(eq(t.b, 9) && eq(t.g, 8) && eq(t.o, 7))) fail(`tackle dice not conserved b=${t.b} g=${t.g} o=${t.o}`);
  }
  let nd = S.dk.length;
  let ns = S.sd.length;
  let nr = S.rod.length;
  let nl = S.reel.length;
  const once = (seen, id, what) => {
    if (seen.has(id)) fail(`${what} ${id} duplicated`);
    seen.add(id);
  };
  const sd = new Set();
  const ss = new Set();
  const sr = new Set();
  const sl = new Set();
  for (const id of S.dk) once(sd, id, 'dink');
  for (const id of S.sd) once(ss, id, 'supply');
  for (const id of S.rod) once(sr, id, 'rod');
  for (const id of S.reel) once(sl, id, 'reel');
  for (const c of S.order) {
    const p = S.P[c];
    for (const id of p.dinks) {
      nd++;
      once(sd, id, 'dink');
    }
    for (const id of p.items) {
      ns++;
      once(ss, id, 'supply');
    }
    for (const id of p.rods) {
      nr++;
      once(sr, id, 'rod');
    }
    for (const id of p.reels) {
      nl++;
      once(sl, id, 'reel');
    }
  }
  if (!eq(nd, expect.dinks)) fail(`dinks total ${nd} expected ${expect.dinks}`);
  if (!eq(ns, 20)) fail('supplies total ' + ns);
  if (!eq(nr, 10)) fail('rods total ' + nr);
  if (!eq(nl, 10)) fail('reels total ' + nl);
  if (RT.prompt && RT.prompt.kind === 'pick') {
    if (!RT.prompt.opts.some((o) => !o.dis)) fail('prompt without enabled option: ' + RT.prompt.title);
  }
  const js = JSON.stringify(S);
  if (js !== JSON.stringify(JSON.parse(js))) fail('state does not round-trip through JSON');
}

export function expectFor(colors) {
  const { cnt } = countFish();
  const ids = new Set(cnt.keys());
  return { fish: ids.size, ids, reg: colors.length === 1 ? 60 : 10 * colors.length, dinks: S.dk.length };
}

// ---- play a game with a recording driver --------------------------------------------------------------
export async function playGame(colors, opts, seed, o = {}) {
  const r = lcg(seed);
  const answers = [];
  const stats = o.stats || {};
  let steps = 0;
  RT.quiet = true;
  const maxSteps = o.maxSteps || 20000;
  let expect = null;
  RT.driver = {
    async ask(pr) {
      steps++;
      if (steps > maxSteps) throw new Error(`too many steps (${steps}) at ${pr.title}`);
      // mid-effect prompts may hold cards in flight (e.g. a shop's drawn cards): only exact-check at turn boundaries
      if (expect) check(expect, pr.tag === 'turn' || pr.tag === 'declare');
      const a = chooseRandom(pr, r, o.passRate ?? 0.12);
      answers.push(a);
      stats[pr.title] = (stats[pr.title] || 0) + 1;
      return a;
    },
  };
  Setup.newGame(colors, { ...opts, seed });
  expect = expectFor(colors);
  if (o.mutate) {
    o.mutate();
    expect = expectFor(colors);
  }
  await Fl.main();
  if (expect) check(expect);
  if (!S.res) throw new Error('finished without results');
  return { answers, steps, final: JSON.stringify(S), log: RT.log.map((e) => e.t) };
}

export async function replayGame(colors, opts, seed, answers, o = {}) {
  let i = 0;
  RT.quiet = true;
  RT.driver = {
    async ask() {
      if (i >= answers.length) throw new Error('replay ran out of answers');
      return answers[i++];
    },
  };
  Setup.newGame(colors, { ...opts, seed });
  if (o.mutate) o.mutate();
  await Fl.main();
  return { final: JSON.stringify(S), log: RT.log.map((e) => e.t), used: i };
}

// ---- helpers for hand-made positions -----------------------------------------------------------------
export function removeFish(id) {
  for (let d = 0; d < 3; d++) {
    for (let c = 0; c < 3; c++) U.rm(S.sea[d][c].cards, id);
    U.rm(S.gy[d], id);
  }
  for (const c of S.order) {
    U.rm(S.P[c].hand, id);
    const p = S.P[c];
    for (let i = 0; i < 3; i++) if (p.mount[i] === id) p.mount[i] = false;
  }
}

export function takeFish(pred) {
  for (let d = 0; d < 3; d++) {
    for (let col = 0; col < 3; col++) {
      const cs = S.sea[d][col].cards;
      for (let i = cs.length - 1; i >= 0; i--) {
        if (pred(D.fish[cs[i]])) {
          S.sea[d][col].rev = false;
          return cs.splice(i, 1)[0];
        }
      }
    }
  }
  return null;
}

export function sweepSea(keep = 0) {
  for (let d = 0; d < 3; d++) {
    for (let col = 0; col < 3; col++) {
      const cs = S.sea[d][col].cards;
      const stay = d === 0 && col === 0 ? keep : 0;
      while (cs.length > stay) S.gy[d].push(cs.pop());
      S.sea[d][col].rev = false;
    }
  }
}

export { Fl, Fx, Fi, Free, Setup, S, RT, D, Rl, Dc, U };
