// Core: seats, log, prompts, rule helpers (Madness, scoring) and dice.

import { S, RT } from './state.js';
import { U, rnd } from './util.js';
import { D } from './data.js';

export const COLORS = ['Red', 'Orange', 'Green', 'Blue', 'Teal']; // left-to-right = clockwise turn order
export const SEAT = {
  Red: { name: 'Alba', hex: '#DC2626', board: 'alba' },
  Orange: { name: 'Hugo', hex: '#F97316', board: 'hugo' },
  Green: { name: 'Isla', hex: '#2FB344', board: 'isla' },
  Blue: { name: 'Bert', hex: '#3B6CF2', board: 'bert' },
  Teal: { name: 'Fred', hex: '#14B8A6', board: 'fred' },
};
export const DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export const ROMAN = ['I', 'II', 'III'];

// LOG -----------------------------------------------------------------------------------------------
export const Log = {
  nm: (color) => (color && SEAT[color] ? SEAT[color].name : String(color)),
  line(msg, color, kind) {
    const e = { t: msg, c: color || null, k: kind || 'say', day: S.day || 0 };
    RT.log.push(e);
    if (RT.log.length > 4000) RT.log.shift();
    if (RT.logHook) RT.logHook(e);
  },
  say(color, msg) {
    Log.line(`${Log.nm(color)} ${msg}`, color, 'say');
  },
  sys(msg) {
    Log.line(msg, null, 'sys');
  },
};

// PROMPTS -------------------------------------------------------------------------------------------
// The engine never talks to the UI directly: it awaits RT.driver.ask(prompt). The driver answers with
//   pick  -> index into prompt.opts
//   multi -> array of indices into prompt.items, or null when cancelled
// Everything that is not a decision (auto-resolved single options) is invisible to the driver.

function normOk(r) {
  if (Array.isArray(r)) return { ok: !!r[0], msg: r[1] };
  if (r && typeof r === 'object') return r;
  return { ok: r !== false, msg: undefined };
}

export const Ask = {
  /** opts: [{id,label,dis,sub,grp,kind,fish,dink,sup,rod,reel,die,big}] ; returns the chosen id (null when nothing can be chosen) */
  async pick(color, title, opts, o = {}) {
    let n = 0;
    let last = null;
    for (const op of opts) {
      if (!op.dis) {
        n++;
        last = op;
      }
    }
    if (n === 0) return null;
    if (o.auto && n === 1) return last.id;
    const pr = {
      kind: 'pick',
      seq: ++RT.pseq,
      color,
      title,
      opts,
      info: o.info || [],
      cols: o.cols,
      gcols: o.gcols,
      show: o.show || [],
      tag: o.tag || null,
      meta: o.meta || null,
    };
    RT.prompt = pr;
    const i = await RT.driver.ask(pr);
    RT.prompt = null;
    const op = opts[i];
    if (!op || op.dis) throw new Error(`invalid answer ${i} for prompt "${title}"`);
    return op.id;
  },

  /**
   * items: [{id,label,sub,fish,die,...}]. o: {min,max,ok(chosenIds,idxs)->[bool,msg],init:[idx],auto()->[idx],
   * autoLabel,okLabel,cancel(label)}. Returns array of chosen ids (with .idxs) or null when cancelled.
   */
  async multi(color, title, items, o = {}) {
    const pr = {
      kind: 'multi',
      seq: ++RT.pseq,
      color,
      title,
      items,
      info: o.info || [],
      min: o.min,
      max: o.max,
      init: o.init || [],
      okLabel: o.okLabel || 'Xác nhận',
      autoLabel: o.autoLabel || 'Tự chọn',
      cancel: o.cancel || null,
      cols: o.cols,
      show: o.show || [],
      tag: o.tag || null,
      meta: o.meta || null,
      auto: o.auto || null,
      check(idxs) {
        const chosen = idxs.map((i) => items[i].id);
        let r = { ok: true, msg: undefined };
        if (o.ok) r = normOk(o.ok(chosen, idxs));
        if (o.min != null && idxs.length < o.min) r.ok = false;
        if (o.max != null && idxs.length > o.max) r.ok = false;
        return r;
      },
    };
    RT.prompt = pr;
    const ans = await RT.driver.ask(pr);
    RT.prompt = null;
    if (ans == null) return null;
    const idxs = [...ans].sort((a, b) => a - b);
    const chosen = idxs.map((i) => items[i].id);
    if (!pr.check(idxs).ok) throw new Error(`invalid multi answer for prompt "${title}"`);
    chosen.idxs = idxs;
    return chosen;
  },

  /** simple acknowledgement */
  async ok(color, title, info, label, show) {
    await Ask.pick(color, title, [{ id: 'ok', label: label || 'OK' }], { info, show, tag: 'ack' });
  },
  async yn(color, title, info, yes, no, show) {
    const r = await Ask.pick(
      color,
      title,
      [
        { id: 'y', label: yes || 'Có' },
        { id: 'n', label: no || 'Không' },
      ],
      { info, show, tag: 'yn' },
    );
    return r === 'y';
  },
};

// RULES HELPERS ---------------------------------------------------------------------------------------
export const TIERS = [
  { max: 0, fair: 2, foul: -2, maxd: 4, disc: 0 },
  { max: 3, fair: 1, foul: -1, maxd: 5, disc: 0 },
  { max: 6, fair: 1, foul: 0, maxd: 5, disc: 0 },
  { max: 9, fair: 0, foul: 1, maxd: 6, disc: 0 },
  { max: 12, fair: -1, foul: 1, maxd: 7, disc: 0 },
  { max: 9999, fair: -2, foul: 2, maxd: 8, disc: 1 },
];

// Regret cards are ids (value+1)*100 + k so that every card keeps its own art; 0 value ids are never falsy.
export const regretValue = (id) => Math.floor(id / 100) - 1;

export const Rl = {
  solo: () => S.mode === 'solo',
  tier(n) {
    for (let i = 0; i < TIERS.length; i++) if (n <= TIERS[i].max) return [TIERS[i], i + 1];
    return [TIERS[TIERS.length - 1], TIERS.length];
  },
  mad(p) {
    if (S.mode === 'solo') return { fair: 0, foul: 0, maxd: 12, disc: 0 };
    return Rl.tier(p.reg.length)[0];
  },
  maxDice: (p) => Rl.mad(p).maxd,
  regVal(p) {
    let s = 0;
    for (const id of p.reg) s += regretValue(id);
    if (p.lb) s += 10;
    return s;
  },
  sellable(id) {
    const f = D.fish[id];
    return !!f && !f.novalue && !f.nosell;
  },
  /** value of fish id for player p (Madness applied, min 0) */
  val(p, id) {
    const f = D.fish[id];
    if (!f || f.novalue) return 0;
    if (f.fixed3) return 3;
    const m = Rl.mad(p);
    let v = f.v + (f.foul ? m.foul : m.fair);
    if (v < 0) v = 0;
    return v;
  },
  mountMult: (slot) => [2, 3, 2][slot - 1] || 2, // slot is 1..3
  /** returns [hand, mounted, bucks, total] */
  score(p) {
    let hand = 0;
    let mount = 0;
    for (const id of p.hand) hand += Rl.val(p, id);
    for (let i = 1; i <= 3; i++) {
      const id = p.mount[i - 1];
      if (id) mount += Rl.val(p, id) * Rl.mountMult(i);
    }
    if (p.clo) mount += Rl.val(p, p.clo) * 2;
    let bk = Math.floor(p.bucks / 2);
    if (S.mode === 'solo') bk = 0;
    return [hand, mount, bk, hand + mount + bk];
  },
  seatIndex: (color) => S.order.indexOf(color),
  nextOf(color, step = 1) {
    const i = S.order.indexOf(color);
    const n = S.order.length;
    return S.order[(((i + step) % n) + n) % n];
  },
  /** players in turn order starting from the first-player marker */
  fromFirst() {
    const r = [];
    let i = S.order.indexOf(S.first);
    if (i < 0) i = 0;
    for (let k = 0; k < S.order.length; k++) r.push(S.order[(i + k) % S.order.length]);
    return r;
  },
  dayName: () => DAYS[S.day - 1] || '?',
  isLastDay: () => S.day >= S.dayLast,
};

// DICE ---------------------------------------------------------------------------------------------------
export const Dc = {
  FACES: { p: [1, 1, 2, 3], b: [0, 0, 1, 2], g: [1, 1, 2, 3], o: [2, 2, 3, 3], om: [1, 2, 3, 4] },
  NAME: { p: 'xúc xắc thường', b: 'xúc xắc Blue', g: 'xúc xắc Green', o: 'xúc xắc Orange', om: 'xúc xắc Omen' },
  SHORT: { p: 'Thường', b: 'Blue', g: 'Green', o: 'Orange', om: 'Omen' },
  tackle: (k) => k === 'b' || k === 'g' || k === 'o',
  roll(k) {
    const f = Dc.FACES[k];
    return f[rnd(f.length) - 1];
  },
  maxFace: (k) => Math.max(...Dc.FACES[k]),
  minFace: (k) => Math.min(...Dc.FACES[k]),
  mean: (k) => U.sum(Dc.FACES[k]) / Dc.FACES[k].length,
  nextFace(k, v) {
    let best = null;
    for (const f of Dc.FACES[k]) if (f > v && (best === null || f < best)) best = f;
    return best;
  },
  fresh: (p) => p.dice.filter((d) => d.fr),
  freshN: (p) => p.dice.filter((d) => d.fr).length,
  freshSum: (p) => p.dice.reduce((s, d) => s + (d.fr ? d.v : 0), 0),
  spentList: (p) => p.dice.filter((d) => !d.fr),
  label: (d) => `${Dc.SHORT[d.k]} [${d.v}]`,
  /** value list of fresh dice + number of spent dice */
  summary(p) {
    const f = [];
    let s = 0;
    for (const d of p.dice) {
      if (d.fr) f.push(d.v + (d.k === 'b' ? 'b' : d.k === 'g' ? 'g' : d.k === 'o' ? 'o' : d.k === 'om' ? 'Ω' : ''));
      else s++;
    }
    return [f, s];
  },
  /** add a freshly acquired die (rolled into Fresh when there is room, else Spent) */
  gain(p, k, rollNow) {
    const d = { k, v: Dc.minFace(k), fr: false };
    if (rollNow) {
      d.v = Dc.roll(k);
      d.fr = Dc.freshN(p) < Rl.maxDice(p);
    }
    p.dice.push(d);
    return d;
  },
  /** a die has been spent (paid or sacrificed): tackle dice go back to the bag */
  spend(p, d) {
    if (Dc.tackle(d.k) && S.mode !== 'solo') {
      U.rm(p.dice, d);
      S.bag[d.k]++;
    } else {
      d.fr = false;
    }
  },
  bagCount: () => S.bag.b + S.bag.g + S.bag.o,
  bagDraw() {
    const n = Dc.bagCount();
    if (n === 0) return null;
    let r = rnd(n);
    for (const k of ['b', 'g', 'o']) {
      if (r <= S.bag[k]) {
        S.bag[k]--;
        return k;
      }
      r -= S.bag[k];
    }
    return null;
  },
};
