// The Port: the Port art with live overlays. The four shops and the fish market are clickable zones (they are the turn
// options that the panel no longer shows), each with its stock left; the docks list the boats that are in port.

import { S } from '../engine/state.js';
import { SEAT, Dc } from '../engine/core.js';
import { SHOPNAME } from '../engine/port.js';
import { h, clear, setPickable, keyActivate } from './dom.js';
import { seatColor } from './art.js';

// zones measured on assets/board/port.webp (1500 x 1011), in percent: left, top, width, height
const ZONES = {
  sell: { box: [66.5, 42.5, 28.5, 13.5] },
  dice: { box: [68.0, 55.0, 26.5, 22.5] },
  rod: { box: [9.3, 78.2, 29.3, 21.3] },
  reel: { box: [39.7, 78.2, 27.3, 21.3] },
  sup: { box: [67.2, 78.8, 27.2, 21.0] },
};
const DOCKS_BOX = [0.6, 37.5, 14.5, 18];

const STOCK = {
  rod: () => `còn ${S.rod.length} lá`,
  reel: () => `còn ${S.reel.length} lá`,
  sup: () => `còn ${S.sd.length} lá`,
  dice: () => `còn ${Dc.bagCount()} xúc xắc`,
};

/** the board zone a turn option is clicked on: 'sell', a shop key, or null for options that stay in the panel */
export const zoneOf = (o) => (o.k === 'sell' ? 'sell' : o.k === 'shop' ? o.shop : null);

function zoneName(key) {
  return key === 'sell' ? 'Bán Fish' : SHOPNAME[key];
}

export function createPortBoard() {
  const el = h('div', { class: 'board portboard', role: 'group', 'aria-label': 'Bàn chơi: Cảng' });
  el.append(h('img', { class: 'board-bg', src: 'assets/board/port.webp', alt: '', draggable: 'false' }));

  const zoneEls = {};
  for (const key of Object.keys(ZONES)) {
    const [l, t, w, hh] = ZONES[key].box;
    const z = h('div', { class: `pzone ${key}`, style: { left: l + '%', top: t + '%', width: w + '%', height: hh + '%' } });
    z._sig = null;
    zoneEls[key] = z;
    el.append(z);
  }

  const docks = h('div', { class: 'docks', style: { left: DOCKS_BOX[0] + '%', top: DOCKS_BOX[1] + '%', width: DOCKS_BOX[2] + '%', minHeight: DOCKS_BOX[3] + '%' } });
  el.append(docks);

  let docked = new Set();
  let dockInit = false;
  let dockSig = '';

  /** zonePick: zone key -> option index (clickable now); zoneOff: zone key -> reason it is not available */
  function updateZone(key, ctx) {
    const node = zoneEls[key];
    const pickIdx = ctx.zonePick.get(key);
    const off = ctx.zoneOff.get(key);
    const hinted = pickIdx !== undefined && ctx.hintOpt === pickIdx;
    const stock = STOCK[key] ? STOCK[key]() : '';
    const sig = `${pickIdx === undefined ? '-' : pickIdx}|${off === undefined ? '-' : off}|${hinted ? 1 : 0}|${stock}`;
    if (node._sig === sig) return;
    node._sig = sig;
    clear(node);
    const can = pickIdx !== undefined;
    node.className = `pzone ${key}${can ? ' pick' : ''}${off !== undefined ? ' off' : ''}${hinted ? ' hint' : ''}`;
    node.onclick = can ? () => ctx.answer(pickIdx) : null;
    node.onkeydown = can ? keyActivate(() => ctx.answer(pickIdx)) : null;
    if (can) node.title = `${zoneName(key)}: bấm để chọn`;
    else node.title = off ? `${zoneName(key)}: ${off}` : zoneName(key);
    setPickable(node, can ? node.title : null);
    node.append(h('span', { class: 'pname' }, zoneName(key)));
    if (stock) node.append(h('span', { class: 'pstock' }, stock));
    if (key === 'sell') node.append(h('span', { class: 'pstock' }, 'đổi Fish lấy $'));
    if (can) node.append(h('span', { class: 'pgo' }, 'bấm để chọn'));
    else if (off) node.append(h('span', { class: 'pnote' }, off));
  }

  function updateDocks() {
    const port = S.order.filter((c) => S.P[c].loc === 'port');
    const sig = port.map((c) => `${c}${S.turn === c ? 't' : ''}${S.P[c].pass ? 'p' : ''}`).join();
    if (sig === dockSig) return;
    dockSig = sig;
    const nextKeys = new Set(port);
    clear(docks);
    docks.append(h('span', { class: 'dockname' }, 'Bến tàu'));
    if (!port.length) docks.append(h('span', { class: 'dim' }, 'chưa có thuyền'));
    for (const c of port) {
      const fresh = !docked.has(c);
      const p = S.P[c];
      docks.append(
        h(
          'span',
          { class: `pboat${S.turn === c ? ' turn' : ''}${p.pass ? ' passed' : ''}${fresh && dockInit ? ' arrive' : ''}`, style: { '--c': seatColor(c) }, title: `${SEAT[c].name}${p.pass ? ' (đã Pass)' : ''}` },
          SEAT[c].name,
        ),
      );
    }
    docked = nextKeys;
    dockInit = true;
  }

  function update(ctx) {
    if (!S.order || !S.P) return;
    for (const key of Object.keys(ZONES)) updateZone(key, ctx);
    updateDocks();
  }

  return {
    el,
    update,
    zoneRect: (key) => zoneEls[key].getBoundingClientRect(),
    docksRect: () => docks.getBoundingClientRect(),
    reset() {
      docked = new Set();
      dockInit = false;
      dockSig = '';
      for (const key of Object.keys(zoneEls)) zoneEls[key]._sig = null;
    },
  };
}
