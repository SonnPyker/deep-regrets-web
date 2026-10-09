// Narration log (RT.log). The engine rebuilds it from scratch on every replay, so it is re-rendered when it shrinks.
// It lives in a slide-over drawer (opened from the top bar) so it never pushes the table down the page.

import { RT } from '../engine/state.js';
import { DAYS } from '../engine/core.js';
import { h, clear } from './dom.js';
import { seatColor } from './art.js';

export function createLog() {
  const list = h('div', { class: 'loglist', tabindex: '0', role: 'log', 'aria-label': 'Nhật ký ván đấu' });
  const closeBtn = h('button', { type: 'button', class: 'btn small icon', title: 'Đóng nhật ký', onclick: () => toggle(false) }, '✕');
  const el = h('section', { class: 'logpanel', 'aria-hidden': 'true' }, h('header', null, h('h3', null, '📜 Nhật ký'), closeBtn), list);
  let shown = 0;
  let first = null;
  let lastDay = 0;
  let open = false;
  let unseen = 0;
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => f({ open, unseen }));

  function line(e) {
    const out = [];
    if (e.day && e.day !== lastDay && e.k !== 'sys') {
      lastDay = e.day;
      out.push(h('div', { class: 'logday' }, DAYS[e.day - 1] || `Ngày ${e.day}`));
    }
    out.push(h('div', { class: `logline ${e.k}`, style: e.c ? { '--c': seatColor(e.c) } : null }, e.t));
    return out;
  }

  function toggle(v) {
    open = v === undefined ? !open : !!v;
    el.classList.toggle('open', open);
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      unseen = 0;
      list.scrollTop = list.scrollHeight;
    }
    emit();
  }

  function update() {
    const log = RT.log;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    if (log.length < shown || (log.length && log[0] !== first)) {
      clear(list);
      shown = 0;
      lastDay = 0;
      unseen = 0;
    }
    if (log.length === shown) return;
    first = log[0];
    const frag = document.createDocumentFragment();
    for (let i = shown; i < log.length; i++) for (const n of line(log[i])) frag.append(n);
    if (!open && shown) unseen += log.length - shown;
    shown = log.length;
    list.append(frag);
    // keep the DOM small on very long games
    while (list.childNodes.length > 1500) list.firstChild.remove();
    if (nearBottom || list.childNodes.length === log.length) list.scrollTop = list.scrollHeight;
    emit();
  }

  /** text of the most recent narration line (for the one-line ticker on the table) */
  const last = () => {
    const log = RT.log;
    for (let i = log.length - 1; i >= 0; i--) if (log[i] && log[i].t) return log[i];
    return null;
  };

  return {
    el,
    update,
    toggle,
    last,
    isOpen: () => open,
    onChange: (f) => listeners.add(f),
    reset: () => {
      clear(list);
      shown = 0;
      first = null;
      lastDay = 0;
      unseen = 0;
      toggle(false);
    },
  };
}
