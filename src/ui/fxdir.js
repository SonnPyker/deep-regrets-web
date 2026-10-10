// The "director": watches the game state between renders and stages what changed - cards flying to whoever caught them,
// floating +Regret / +$ labels, the weekday banner, and plays the matching sound effects.
// It never touches the game: it only reads S / RT and adds short-lived elements to a fixed overlay.

import { S, RT } from '../engine/state.js';
import { DAYS, Rl, Dc } from '../engine/core.js';
import { h } from './dom.js';
import { play } from './sfx.js';
import { src, backSrc, seatColor } from './art.js';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** key of a die for comparing two states */
export const dieKey = (d) => `${d.k}:${d.v}:${d.fr ? 1 : 0}`;

/** which dice of `cur` are new compared to `prev` (lists of dice): 'roll' = new value, 'spent' = same die turned Spent / Fresh */
export function diceDiff(prev, cur) {
  const have = new Map();
  for (const d of prev) have.set(dieKey(d), (have.get(dieKey(d)) || 0) + 1);
  const take = (k) => {
    const n = have.get(k) || 0;
    if (n > 0) have.set(k, n - 1);
    return n > 0;
  };
  const out = [];
  const pending = [];
  cur.forEach((d, i) => {
    if (take(dieKey(d))) out[i] = '';
    else pending.push(i);
  });
  for (const i of pending) {
    const d = cur[i];
    const flipped = `${d.k}:${d.v}:${d.fr ? 0 : 1}`;
    out[i] = take(flipped) ? 'moved' : 'roll';
  }
  return out;
}

const handCount = (p) => p.hand.length + p.mount.filter(Boolean).length + (p.clo ? 1 : 0);

function snapshot() {
  const seats = {};
  for (const c of S.order) {
    const p = S.P[c];
    seats[c] = {
      reg: p.reg.length,
      tier: Rl.tier(p.reg.length)[1],
      bucks: p.bucks,
      cards: handCount(p),
      loc: p.loc,
      dep: p.dep,
      dice: p.dice.map((d) => ({ k: d.k, v: d.v, fr: d.fr })),
      turn: S.turn === c,
      shops: p.dy ? p.dy.shops.length : 0,
    };
  }
  const sea = S.sea.map((row) => row.map((sh) => ({ n: sh.cards.length, rev: !!sh.rev, top: sh.cards.length ? sh.cards[0] : 0 })));
  const stock = { rod: S.rod.length, reel: S.reel.length, sup: S.sd.length, dice: Dc.bagCount() };
  return { day: S.day, ph: S.ph, seats, sea, stock, gy: S.gy.map((g) => g.length), dk: S.dk.length, logN: RT.log.length };
}

export function createFx({ board, port, panelOf, humans }) {
  const layer = h('div', { class: 'fxlayer', 'aria-hidden': 'true' });
  let prev = null;

  const vp = () => ({ w: window.innerWidth, h: window.innerHeight });
  const clampX = (x) => Math.max(40, Math.min(vp().w - 40, x));
  const clampY = (y) => Math.max(60, Math.min(vp().h - 60, y));

  function floaty(text, rect, cls) {
    if (!rect || reduced()) return;
    const el = h('div', { class: `floaty ${cls || ''}`, style: { left: clampX(rect.left + rect.width / 2) + 'px', top: clampY(rect.top + Math.min(rect.height * 0.25, 80)) + 'px' } }, text);
    layer.append(el);
    setTimeout(() => el.remove(), 1700);
  }

  function fly(from, to, imgSrc, big) {
    // a hidden board has no size: nothing to fly from or to
    if (!from || !to || !from.width || !to.width || reduced()) return;
    const w = big ? 86 : 64;
    const ht = Math.round(w * 1.405);
    const img = h('img', { class: 'ghost', src: imgSrc, alt: '', style: { left: from.left + from.width / 2 - w / 2 + 'px', top: from.top + from.height / 2 - ht / 2 + 'px', width: w + 'px', height: ht + 'px' } });
    layer.append(img);
    const dx = clampX(to.left + Math.min(to.width / 2, 120)) - (from.left + from.width / 2);
    const dy = clampY(to.top + 40) - (from.top + from.height / 2);
    try {
      const a = img.animate(
        [
          { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 40}px) scale(1.12) rotate(-6deg)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}px,${dy}px) scale(0.3) rotate(10deg)`, opacity: 0.1 },
        ],
        { duration: 850, easing: 'cubic-bezier(.25,.7,.3,1)', fill: 'forwards' },
      );
      a.onfinish = () => img.remove();
    } catch {
      /* no WAAPI */
    }
    setTimeout(() => img.remove(), 1200);
  }

  function banner(title, sub, cls) {
    if (reduced()) return;
    const el = h('div', { class: `bigbanner ${cls || ''}` }, h('b', null, title), sub ? h('span', null, sub) : null);
    layer.append(el);
    setTimeout(() => el.remove(), 2100);
  }

  function shake(el) {
    if (!el || reduced()) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 700);
  }

  /** call after every render */
  function observe() {
    if (!S.order || !S.P || !S.sea || !S.sea.length) return;
    const cur = snapshot();
    const old = prev;
    prev = cur;

    if (!old) {
      banner(DAYS[S.day - 1] || '', `Ngày ${S.day - S.dayStart + 1}/${S.dayLast - S.dayStart + 1}`, 'day');
      play('day');
      return;
    }

    const sounds = new Set();

    if (cur.day !== old.day && cur.day > old.day) {
      banner(DAYS[cur.day - 1] || '', `Ngày ${cur.day - S.dayStart + 1}/${S.dayLast - S.dayStart + 1}`, 'day');
      sounds.add('day');
    }

    // fish leaving a shoal: remember where from, to pick the flight start
    const removed = [];
    cur.sea.forEach((row, di) =>
      row.forEach((sh, ci) => {
        const o = old.sea[di][ci];
        if (sh.rev && (!o.rev || o.top !== sh.top)) sounds.add('flip');
        if (sh.n < o.n) removed.push({ d: di + 1, c: ci + 1, id: o.top, rev: o.rev, k: o.n - sh.n });
      }),
    );

    const gained = [];
    for (const c of S.order) {
      const a = cur.seats[c];
      const b = old.seats[c];
      if (!b) continue;
      const panel = panelOf(c);
      const rect = panel ? panel.getBoundingClientRect() : null;
      if (a.reg !== b.reg) {
        const dlt = a.reg - b.reg;
        floaty(`${dlt > 0 ? '+' : ''}${dlt} Regret`, rect, dlt > 0 ? 'bad' : 'good');
        sounds.add(dlt > 0 ? 'regret' : 'coin');
        if (dlt > 0) shake(panel);
        if (a.tier > b.tier) {
          floaty(`Madness ${a.tier}!`, rect, 'mad');
          sounds.add('mad');
        }
      }
      if (a.bucks !== b.bucks) {
        const dlt = a.bucks - b.bucks;
        floaty(`${dlt > 0 ? '+' : ''}${dlt}$`, rect, dlt > 0 ? 'gold' : 'dimf');
        sounds.add('coin');
      }
      if (a.cards > b.cards) gained.push({ c, n: a.cards - b.cards });
      if (a.dep !== b.dep && a.loc === 'sea' && b.loc === 'sea') sounds.add('splash');
      if (a.loc === 'sea' && b.loc === 'port') sounds.add('splash');
      const dd = diceDiff(b.dice, a.dice);
      if (dd.some((x) => x === 'roll' && a.dice.length)) sounds.add('roll');
      if (a.turn && !b.turn && humans().includes(c)) sounds.add('turn');
    }

    // flights
    const gyUp = cur.gy.map((n, i) => n - old.gy[i]);
    let g = 0;
    removed.forEach((r, i) => {
      const from = board.shoalRect(r.d, r.c);
      const imgSrc = r.rev && r.id ? src('fish', r.id) : backSrc('fish', r.d);
      const taker = gained[g];
      if (taker) {
        const panel = panelOf(taker.c);
        fly(from, panel && panel.getBoundingClientRect(), imgSrc, true);
        taker.n -= 1;
        if (taker.n <= 0) g++;
        sounds.add('catch');
      } else if (gyUp[r.d - 1] > 0) {
        gyUp[r.d - 1]--;
        fly(from, board.graveRect(r.d), imgSrc, true);
      }
    });
    // cards that appeared without leaving a shoal (hand/mount from elsewhere): small pop at the panel is enough
    for (const t of gained) if (t.n > 0 && !removed.length) sounds.add('catch');

    // Port: a shop sold cards to whoever just visited it, and a sale moved Fish from a hand to the fish market
    const bought = Object.keys(cur.stock).find((k) => cur.stock[k] < old.stock[k]);
    for (const c of S.order) {
      const a = cur.seats[c];
      const b = old.seats[c];
      if (!b) continue;
      const panel = panelOf(c);
      const to = panel && panel.getBoundingClientRect();
      if (bought && a.shops > b.shops) {
        if (bought === 'dice') floaty('+xúc xắc', to, 'good');
        else fly(port.zoneRect(bought), to, backSrc(bought), false);
        sounds.add('coin');
      }
      if (a.loc === 'port' && a.cards < b.cards && a.bucks > b.bucks) {
        fly(to, port.zoneRect('sell'), backSrc('fish', 1), false);
        sounds.add('coin');
      }
    }

    const order = ['day', 'regret', 'mad', 'catch', 'flip', 'roll', 'splash', 'coin', 'turn'];
    const first = order.find((s) => sounds.has(s));
    if (first) {
      play(first);
      // layer a second sound a moment later for combos (a catch also flips a card)
      const second = order.find((s) => s !== first && sounds.has(s) && (s === 'flip' || s === 'coin' || s === 'roll'));
      if (second) setTimeout(() => play(second), 160);
    }
  }

  return { layer, observe, reset: () => { prev = null; layer.querySelectorAll('.floaty,.ghost,.bigbanner').forEach((n) => n.remove()); }, banner };
}
