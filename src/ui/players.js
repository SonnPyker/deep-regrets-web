// One panel per player, kept small: icon + number pills instead of sentences, details in the tooltips.

import { S } from '../engine/state.js';
import { SEAT, Rl, ROMAN } from '../engine/core.js';
import { h, clear } from './dom.js';
import { card, die, seatColor } from './art.js';
import { diceDiff } from './fxdir.js';

const sgn = (n) => (n > 0 ? `+${n}` : String(n));
const MULT = [2, 3, 2];

function snapshot(c, viewer, all, pk) {
  const p = S.P[c];
  const see = all || viewer === c;
  return {
    c,
    seat: S.seats[c],
    loc: p.loc,
    dep: p.dep,
    bucks: p.bucks,
    dice: p.dice.map((d) => [d.k, d.v, d.fr ? 1 : 0]),
    reg: p.reg.length,
    regV: see ? Rl.regVal(p) : null,
    lb: p.lb,
    worms: p.worms,
    mount: p.mount.slice(),
    cloche: p.cloche,
    clo: p.clo,
    hand: see ? p.hand.slice() : p.hand.length,
    dinks: see ? p.dinks.slice() : p.dinks.length,
    items: see ? p.items.slice() : p.items.length,
    rods: p.rods.slice(),
    reels: p.reels.slice(),
    rodE: p.rodE,
    reelE: p.reelE,
    big: p.big,
    pass: p.pass,
    turn: S.turn === c,
    first: S.first === c,
    lp: S.lp === c,
    see,
    score: see ? Rl.score(p) : null,
    solo: S.mode === 'solo',
    pk: pk || null,
  };
}

function mountSlot(p, c, i, d, ans) {
  const id = d.mount[i];
  const pi = d.pk && d.pk.slots ? d.pk.slots[i + 1] : undefined;
  const wrap = h('div', { class: `slot${id ? ' full' : ''}${pi !== undefined ? ' pick' : ''}${pi !== undefined && d.pk.hint === pi ? ' hint' : ''}` });
  if (pi !== undefined) {
    wrap.setAttribute('role', 'button');
    wrap.tabIndex = 0;
    wrap.title = `Mount vào slot ${i + 1}`;
    wrap.onclick = () => ans(pi);
    wrap.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ans(pi));
  } else if (!id) {
    wrap.title = `Slot Mount ${i + 1}: nhân ×${MULT[i]}`;
  }
  if (id) {
    const v = Rl.val(p, id);
    wrap.append(card('fish', id), h('span', { class: 'mult' }, `×${MULT[i]}`), h('span', { class: 'val', title: `${v} × ${MULT[i]} = ${v * MULT[i]} điểm` }, `${v * MULT[i]}`));
  } else {
    wrap.append(h('div', { class: 'ph' }, h('span', { class: 'mult' }, `×${MULT[i]}`)));
  }
  return wrap;
}

/** a small icon + value pill; the long explanation lives in the tooltip */
const stat = (icon, text, title, cls) => h('span', { class: `stat${cls ? ' ' + cls : ''}`, title }, h('i', null, icon), text !== null && text !== undefined ? h('b', null, String(text)) : null);

function renderPanel(c, d, prevDice, ans) {
  const p = S.P[c];
  const [mad, tierIdx] = Rl.tier(d.reg);
  const el = h('article', { class: `player${d.turn ? ' turn' : ''}${d.pass ? ' passed' : ''}${d.see && d.seat === 'human' ? ' me' : ''}${d.pk && d.pk.seat !== undefined ? ' pick' : ''}${d.pk && d.pk.seat !== undefined && d.pk.hint === d.pk.seat ? ' hint' : ''}`, style: { '--c': seatColor(c) }, dataset: { c } });
  if (d.pk && d.pk.seat !== undefined) {
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.title = `Chọn ${SEAT[c].name}`;
    el.onclick = () => ans(d.pk.seat);
    el.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ans(d.pk.seat));
  }

  // header: who, where, status icons, money
  const badges = h('span', { class: 'badges' });
  const badge = (icon, title, cls) => badges.append(h('span', { class: `bdg${cls ? ' ' + cls : ''}`, title }, icon));
  if (d.pass) badge('🏳️', 'Đã Pass');
  if (d.first) badge('🥇', 'Người chơi đi đầu');
  if (d.lp) badge('🛟', 'Life Preserver');
  if (d.lb) badge('🚣+10', 'Đã lật Lifeboat: +10 Regret Value', 'bad');
  el.append(
    h(
      'header',
      null,
      h('span', { class: 'swatch' }),
      h('b', { class: 'pname' }, SEAT[c].name),
      h('span', { class: 'kind', title: d.seat === 'bot' ? 'Máy điều khiển' : 'Người chơi' }, d.seat === 'bot' ? '🤖' : '🧑'),
      h('span', { class: 'where', title: d.loc === 'sea' ? `Đang ở biển, Depth ${ROMAN[d.dep - 1]}` : 'Đang ở cảng' }, d.loc === 'sea' ? `🌊 ${ROMAN[d.dep - 1]}` : '⚓'),
      d.turn ? h('span', { class: 'bdg turn', title: 'Đang đến lượt' }, '▶') : null,
      badges.childNodes.length ? badges : null,
      h('span', { class: 'spacer' }),
      d.solo ? null : h('span', { class: 'bucks', title: 'Fishbucks' }, `${d.bucks}`, h('i', null, '🪙')),
    ),
  );

  // dice (Fresh first, Spent dimmed) next to the Regret / Madness readout
  const dice = h('div', { class: 'dice', title: 'Xúc xắc: sáng = Fresh, mờ nét đứt = Spent' });
  const anim = prevDice ? diceDiff(prevDice, p.dice) : [];
  const withAnim = p.dice.map((x, i) => [x, anim[i] || '']);
  withAnim.filter(([x]) => x.fr).forEach(([x, a]) => dice.append(die(x, a ? `a-${a}` : '')));
  const spent = withAnim.filter(([x]) => !x.fr);
  if (spent.length) dice.append(h('span', { class: 'sep' }));
  spent.forEach(([x, a]) => dice.append(die(x, a ? `a-${a}` : '')));
  if (!p.dice.length) dice.append(h('span', { class: 'dim' }, 'không có xúc xắc'));

  const stats = h('div', { class: 'stats' });
  stats.append(stat('🃏', d.reg, `${d.reg} lá Regret`, 'reg'));
  if (!d.solo) {
    // Madness tier, Fair / Foul modifiers, dice limit (and the Shop discount) share one pill
    const madTip = `Madness ${tierIdx}: Fair ${sgn(mad.fair)} · Foul ${sgn(mad.foul)} · tối đa ${mad.maxd} xúc xắc${mad.disc ? ' · Shop rẻ hơn 1$' : ''}`;
    stats.append(h('span', { class: 'stat mad', title: madTip }, h('i', null, '🌀'), h('b', null, String(tierIdx)), h('em', null, `${sgn(mad.fair)}/${sgn(mad.foul)}`), h('em', null, `🎲≤${mad.maxd}`), mad.disc ? h('em', null, '🏷️−1$') : null));
  }
  if (d.regV !== null) stats.append(stat('👁', d.regV, `Regret Value: ${d.regV}`, 'rv'));
  if (d.score) {
    const [hand, mount, bk, total] = d.score;
    stats.append(stat('🏆', total, `Điểm tạm nếu ván kết thúc ngay (chưa tính hình phạt): ${total}\nTay ${hand} + Mount ${mount}${d.solo ? '' : ' + $ ' + bk}`, 'score'));
  }
  if (!d.solo) stats.append(stat('🪱', null, d.worms ? 'Can of Worms: sẵn sàng' : 'Can of Worms: đã lật', d.worms ? 'worm' : 'worm off'));
  if (!Array.isArray(d.hand) && d.hand) stats.append(stat('🐟', d.hand, `${d.hand} Fish trên tay (úp mặt)`));
  if (!Array.isArray(d.dinks) && d.dinks) stats.append(stat('🎴', d.dinks, `${d.dinks} Dink (úp mặt)`));
  if (!Array.isArray(d.items) && d.items) stats.append(stat('🧰', d.items, `${d.items} Supply (úp mặt)`));
  el.append(h('div', { class: 'row2' }, dice, stats));

  // mounted fish + gear in one strip
  const strip = h('div', { class: 'cardrow' });
  const mounts = h('div', { class: 'mounts' });
  for (let i = 0; i < 3; i++) mounts.append(mountSlot(p, c, i, d, ans));
  if (d.cloche || d.clo) {
    const w = h('div', { class: `slot cloche${d.clo ? ' full' : ''}`, title: 'Cloche: nhân ×2' });
    if (d.clo) w.append(card('fish', d.clo), h('span', { class: 'mult' }, '🍽️×2'), h('span', { class: 'val' }, `${Rl.val(p, d.clo) * 2}`));
    else w.append(h('div', { class: 'ph' }, h('span', { class: 'mult' }, '🍽️×2')));
    mounts.append(w);
  }
  strip.append(mounts);

  // a card the current prompt can pick is clicked right where it lies
  const pickable = (kind, id, o) => {
    const pi = d.pk && d.pk.cards ? d.pk.cards[`${kind}:${id}`] : undefined;
    if (pi === undefined) return o;
    return { ...o, cls: `${o.cls || ''} pickable${d.pk.hint === pi ? ' hint' : ''}`, onClick: () => ans(pi), title: 'Chọn lá này' };
  };
  const gear = h('div', { class: 'gear' });
  if (d.rodE !== false) gear.append(card('rod', d.rodE, pickable('rod', d.rodE, { cls: 'gearcard eq', badge: '🎣' })));
  if (d.reelE !== false) gear.append(card('reel', d.reelE, pickable('reel', d.reelE, { cls: 'gearcard eq', badge: '🌀' })));
  for (const id of d.rods) if (id !== d.rodE) gear.append(card('rod', id, pickable('rod', id, { cls: 'gearcard spare', badge: '🎣' })));
  for (const id of d.reels) if (id !== d.reelE) gear.append(card('reel', id, pickable('reel', id, { cls: 'gearcard spare', badge: '🌀' })));
  if (d.big !== false && d.big !== undefined && d.big !== null) gear.append(card('big', d.big, pickable('big', d.big, { cls: 'gearcard eq', badge: '👑' })));
  if (gear.childNodes.length) strip.append(gear);
  el.append(strip);

  // hidden cards, only for whoever is allowed to see them
  if (d.see) {
    const hid = h('div', { class: 'hidden-zone' });
    const row = (icon, title, ids, kind) => {
      if (!ids.length) return;
      const r = h('div', { class: 'cards', title: `${title}: ${ids.length}` }, h('span', { class: 'lab' }, icon, h('b', null, String(ids.length))));
      ids.forEach((id) => r.append(card(kind, id, pickable(kind, id, { cls: 'xs' }))));
      hid.append(r);
    };
    row('🐟', 'Fish trên tay', d.hand.slice().sort((a, b) => a - b), 'fish');
    row('🎴', 'Dink', d.dinks, 'dink');
    row('🧰', 'Supply', d.items, 'sup');
    if (hid.childNodes.length) el.append(hid);
  }
  return el;
}

export function createPlayers() {
  const el = h('div', { class: 'players' });
  const cache = new Map();
  const prevDice = new Map();
  function update(viewer, all, pc) {
    if (!S.order) return;
    const keep = new Set(S.order);
    for (const k of [...cache.keys()]) {
      if (!keep.has(k)) {
        cache.get(k).el.remove();
        cache.delete(k);
      }
    }
    S.order.forEach((c, i) => {
      const d = snapshot(c, viewer, all, pc ? pc.forSeat(c) : null);
      const sig = JSON.stringify(d);
      let ent = cache.get(c);
      if (!ent || ent.sig !== sig) {
        const node = renderPanel(c, d, prevDice.get(c), (i) => pc && pc.answer(i));
        if (ent) {
          ent.el.replaceWith(node);
          if (!d.pk && !ent.pk) {
            node.classList.add('upd');
            setTimeout(() => node.classList.remove('upd'), 900);
          }
        }
        ent = { el: node, sig, pk: !!d.pk };
        prevDice.set(c, p0dice(c));
        cache.set(c, ent);
      }
      if (el.children[i] !== ent.el) el.insertBefore(ent.el, el.children[i] || null);
    });
  }
  const p0dice = (c) => S.P[c].dice.map((x) => ({ k: x.k, v: x.v, fr: x.fr }));
  return { el, update, panelOf: (c) => cache.get(c) && cache.get(c).el, reset: () => { cache.clear(); prevDice.clear(); clear(el); } };
}
