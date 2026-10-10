// The Briny Deep: the TTS board art with live overlays (shoals, boats, dink pile, graveyards).

import { S } from '../engine/state.js';
import { SEAT, ROMAN } from '../engine/core.js';
import { D } from '../engine/data.js';
import { h, clear, setPickable, keyActivate } from './dom.js';
import { card, seatColor, Zoom } from './art.js';
import { ic } from './icons.js';

// positions measured on assets/board/thebrinydeep.webp (1100 x 1484), in percent
const COLS = [
  [12.36, 26.18],
  [40.0, 26.18],
  [67.45, 26.18],
];
const ROWS = [
  [16.51, 26.62],
  [44.34, 26.55],
  [72.1, 26.42],
];
const SHIPS_ROWS = [
  [16.5, 27.3],
  [43.8, 28.0],
  [71.8, 28.2],
];

export function createBoard(onGraveyard) {
  const el = h('div', { class: 'board', role: 'group', 'aria-label': 'Bàn chơi: The Briny Deep' });
  el.append(h('img', { class: 'board-bg', src: 'assets/board/thebrinydeep.webp', alt: '', draggable: 'false' }));

  const shoalEls = {};
  for (let d = 1; d <= 3; d++) {
    for (let c = 1; c <= 3; c++) {
      const s = h('div', { class: 'shoal', style: { left: COLS[c - 1][0] + '%', top: ROWS[d - 1][0] + '%', width: COLS[c - 1][1] + '%', height: ROWS[d - 1][1] + '%' } });
      s._sig = null;
      shoalEls[d * 10 + c] = s;
      el.append(s);
    }
  }

  const ships = [];
  for (let d = 1; d <= 3; d++) {
    const s = h('div', { class: 'ships', style: { top: SHIPS_ROWS[d - 1][0] + 3.6 + '%', height: SHIPS_ROWS[d - 1][1] - 3.6 + '%' } });
    ships.push(s);
    el.append(s);
  }

  const dinks = h('div', { class: 'dinkpile' });
  el.append(dinks);

  const graves = [];
  for (let d = 1; d <= 3; d++) {
    const g = h('button', { class: 'grave', type: 'button', style: { top: ROWS[d - 1][0] + ROWS[d - 1][1] / 2 + '%' }, title: `Nghĩa địa Depth ${ROMAN[d - 1]} (bấm để xem)`, onclick: () => onGraveyard(d) });
    graves.push(g);
    el.append(g);
  }

  function updateShoal(d, c, ctx) {
    const node = shoalEls[d * 10 + c];
    const sh = S.sea[d - 1][c - 1];
    const n = sh.cards.length;
    const top = n > 0 ? sh.cards[0] : null;
    const pickIdx = ctx.shoalPick.get(d * 10 + c);
    const hinted = pickIdx !== undefined && ctx.hintOpt === pickIdx;
    const seenTop = sh.rev ? top : 0;
    const flipped = node._seen && seenTop && node._top !== seenTop;
    node._top = seenTop;
    node._seen = true;
    const sig = `${n}|${sh.rev ? top : 0}|${pickIdx === undefined ? '-' : 1}|${hinted ? 1 : 0}`;
    if (node._sig === sig) {
      node._pickIdx = pickIdx;
      return;
    }
    node._sig = sig;
    node._pickIdx = pickIdx;
    clear(node);
    node.className = 'shoal' + (n === 0 ? ' empty' : '') + (pickIdx !== undefined ? ' pick' : '') + (hinted ? ' hint' : '');
    node.onclick = pickIdx !== undefined ? () => ctx.answer(node._pickIdx) : null;
    node.onkeydown = pickIdx !== undefined ? keyActivate(() => ctx.answer(node._pickIdx)) : null;
    node.title = pickIdx !== undefined ? `Quăng câu vào Shoal ${ROMAN[d - 1]}-${c}` : '';
    setPickable(node, pickIdx !== undefined ? node.title : null);
    if (n === 0) {
      node.append(h('span', { class: 'lbl' }, `${ROMAN[d - 1]}-${c}`), h('span', { class: 'empty-note' }, 'trống'));
      return;
    }
    const stack = h('div', { class: 'stack' });
    if (n > 2) stack.append(h('div', { class: 'layer l2' }));
    if (n > 1) stack.append(h('div', { class: 'layer l1' }));
    const topCard = sh.rev
      ? card('fish', top, { cls: `top revealed${flipped ? ' flip' : ''}`, zoom: pickIdx === undefined })
      : card('fish', 0, { back: true, depth: d, cls: 'top', zoom: false });
    stack.append(topCard);
    node.append(stack, h('span', { class: 'lbl' }, `${ROMAN[d - 1]}-${c}`), h('span', { class: 'count' }, `×${n}`));
    if (sh.rev) {
      node.append(h('span', { class: 'rev-name' }, D.fish[top].n));
      if (pickIdx !== undefined) {
        node.append(
          h(
            'button',
            {
              class: 'zoombtn',
              type: 'button',
              title: 'Xem chi tiết',
              onclick: (e) => {
                e.stopPropagation();
                Zoom.open('fish', top);
              },
            },
            ic('zoom'),
          ),
        );
      }
    }
  }

  let boatKeys = new Set();
  let boatInit = false;
  function boat(c) {
    const p = S.P[c];
    const fresh = !boatKeys.has(`${c}${p.dep}`);
    return h(
      'div',
      { class: `boat${S.turn === c ? ' turn' : ''}${p.pass ? ' passed' : ''}${fresh && boatInit ? ' arrive' : ''}`, style: { '--c': seatColor(c) }, title: `${SEAT[c].name}${p.pass ? ' (đã Pass)' : ''}` },
      SEAT[c].name,
    );
  }

  let shipsSig = '';
  function update(ctx) {
    if (!S.sea || !S.sea.length) return;
    for (let d = 1; d <= 3; d++) for (let c = 1; c <= 3; c++) updateShoal(d, c, ctx);
    const sig = S.order.map((c) => `${c}${S.P[c].loc}${S.P[c].dep}${S.turn === c ? 't' : ''}${S.P[c].pass ? 'p' : ''}`).join();
    if (sig !== shipsSig) {
      shipsSig = sig;
      const nextKeys = new Set();
      ships.forEach((box, i) => {
        clear(box);
        for (const c of S.order) if (S.P[c].loc === 'sea' && S.P[c].dep === i + 1) {
          box.append(boat(c));
          nextKeys.add(`${c}${i + 1}`);
        }
      });
      boatKeys = nextKeys;
      boatInit = true;
    }
    const dk = S.dk.length;
    if (dinks._n !== dk) {
      dinks._n = dk;
      clear(dinks);
      if (dk > 0) dinks.append(card('dink', 0, { back: true, cls: 'pile', zoom: false }), h('span', { class: 'count' }, `×${dk}`));
      else dinks.append(h('span', { class: 'empty-note' }, 'hết'));
    }
    graves.forEach((g, i) => {
      const n = S.gy[i].length;
      g.textContent = String(n);
      g.classList.toggle('has', n > 0);
    });
  }

  return {
    el,
    update,
    shoalRect: (d, c) => shoalEls[d * 10 + c].getBoundingClientRect(),
    graveRect: (d) => graves[d - 1].getBoundingClientRect(),
    reset() {
      boatKeys = new Set();
      boatInit = false;
      shipsSig = '';
      for (const k of Object.keys(shoalEls)) {
        shoalEls[k]._sig = null;
        shoalEls[k]._seen = false;
        shoalEls[k]._top = 0;
      }
    },
  };
}
