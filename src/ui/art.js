// Card art + text lookups shared by every UI part.

import { D, A, IMG } from '../engine/data.js';
import { Dc, SEAT } from '../engine/core.js';
import { h } from './dom.js';

export const KINDS = ['fish', 'dink', 'sup', 'rod', 'reel', 'big'];

/** the (kind, id) card reference carried by a prompt option / item, if any */
export function refOf(o) {
  if (!o) return null;
  for (const k of KINDS) if (o[k] !== undefined && o[k] !== null && o[k] !== false) return { kind: k, id: o[k] };
  return null;
}

export function src(kind, id) {
  return IMG[kind](id);
}

export function backSrc(kind, depth) {
  if (kind === 'fish') return IMG.fishBack(depth || 1);
  if (kind === 'regret') return IMG.regretBack;
  return { dink: IMG.dinkBack, sup: IMG.supBack, rod: IMG.rodBack, reel: IMG.reelBack, big: IMG.bigBack }[kind];
}

const TIER_NAMES = { 4: '13+ Regret', 3: '7-12 Regret', 2: '1-6 Regret', 1: '0 Regret' };

/** { name, line, text } for the zoom view / tooltips */
export function cardInfo(kind, id) {
  if (kind === 'fish') {
    const f = D.fish[id];
    if (!f) return { name: '?', line: '', text: '' };
    return { name: f.n, line: D.fishLine(id), text: D.fishText(id) };
  }
  if (kind === 'big') {
    const b = D.big[id];
    if (!b) return { name: '?', line: '', text: '' };
    const text = [4, 3, 2, 1].map((t) => `${TIER_NAMES[t]}: ${b.tiers[t] ? A.txt(b.tiers[t]) : '-'}`).join('\n');
    return { name: `Biggest Regret: ${b.n}`, line: `Mở rộng Biggest Regrets (từ ${b.minP} người chơi)`, text };
  }
  const t = D[kind] && D[kind][id];
  if (!t) return { name: '?', line: '', text: '' };
  const lines = { dink: 'Dink', sup: 'Supply', rod: 'Rod', reel: 'Reel' };
  return { name: t.n, line: lines[kind] || '', text: t.t || '' };
}

export function tooltip(kind, id) {
  const i = cardInfo(kind, id);
  return [i.name, i.line && i.line !== i.name ? i.line : '', i.text].filter(Boolean).join('\n');
}

/**
 * A card image. opts: { back, depth, cls, title, onClick, zoom (default true when no onClick), count }
 */
export function card(kind, id, opts = {}) {
  const back = !!opts.back;
  const url = back ? backSrc(kind, opts.depth) : src(kind, id);
  const el = h(
    'div',
    { class: `card card-${kind}${opts.cls ? ' ' + opts.cls : ''}${back ? ' back' : ''}`, title: opts.title !== undefined ? opts.title : back ? undefined : tooltip(kind, id) },
    h('img', { src: url, alt: back ? 'mặt sau' : cardInfo(kind, id).name, draggable: 'false', decoding: 'async' }),
  );
  if (opts.count !== undefined && opts.count !== null) el.append(h('span', { class: 'cnt' }, `×${opts.count}`));
  if (opts.badge) el.append(h('span', { class: 'badge' }, opts.badge));
  if (opts.onClick) {
    el.classList.add('click');
    el.addEventListener('click', opts.onClick);
  } else if (!back && opts.zoom !== false && Zoom.open) {
    el.classList.add('zoomable');
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      Zoom.open(kind, id);
    });
  }
  return el;
}

/** filled in by modals.js (avoids a circular import) */
export const Zoom = { open: null };

export function seatColor(c) {
  return SEAT[c] ? SEAT[c].hex : '#888';
}

/** a die as a small coloured tile */
export function die(d, extra = '') {
  const label = d.k === 'om' ? 'Ω' + d.v : String(d.v);
  return h('span', { class: `die k-${d.k} ${d.fr ? 'fresh' : 'spent'} ${extra}`, title: `${Dc.NAME[d.k]}: ${d.v}${d.fr ? ' (Fresh)' : ' (Spent)'}` }, label);
}

export function seatChip(c, text) {
  return h('span', { class: 'seat-chip', style: { '--c': seatColor(c) } }, text || (SEAT[c] ? SEAT[c].name : c));
}
