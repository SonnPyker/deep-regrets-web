// Minimal DOM helpers.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function clear(el) {
  el.textContent = '';
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/** "1 lá", "3 lá": Vietnamese has no plural */
export const pl = (n, unit) => `${n} ${unit}`;

/** run fn at most once per animation frame (a timer backs it up: hidden tabs do not get animation frames) */
export function frameThrottle(fn) {
  let queued = false;
  const run = () => {
    if (!queued) return;
    queued = false;
    fn();
  };
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
    setTimeout(run, 80);
  };
}

export function toast(msg, ms = 2600) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: 'toast' }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/** a node a prompt makes clickable is also a keyboard button; any other node stays plain (no tab stop, no role) */
export function setPickable(node, label) {
  if (label) {
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', label);
  } else {
    node.removeAttribute('role');
    node.removeAttribute('tabindex');
    node.removeAttribute('aria-label');
  }
}

/** Enter or Space on a focused node runs what its click runs. Only for non-button nodes: a native button already
 *  turns these keys into a click, and keys on a button inside the node (its own zoom button) are left alone. */
export function keyActivate(run) {
  return (e) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!e.repeat) run();
  };
}

/** text a reader would hear: text under aria-hidden subtrees (the ic() icons) does not count */
function speechText(el) {
  let s = '';
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) s += n.textContent;
    else if (n.nodeType === Node.ELEMENT_NODE && n.getAttribute('aria-hidden') !== 'true') s += speechText(n);
  }
  return s.trim();
}

/** icon-only buttons under root take their title as the accessible name */
export function labelIcons(root) {
  root.querySelectorAll('button[title]').forEach((b) => {
    const t = b.getAttribute('title');
    if (!t || b.hasAttribute('aria-label') || speechText(b)) return;
    b.setAttribute('aria-label', t);
  });
  return root;
}

const HOLD_MS = 450; // a press this long shows the title
const MOVE_PX = 10; // more movement than this is a drag or a scroll, not a press
const TIP_MS = 3000; // the title stays this long
const CLICK_MS = 700; // after a long press lifts, a click within this time is that press's own click

/** touch-only devices: a long press on an element with a title shows the title in a popover near it.
 *  Desktop keeps the native title tooltip. */
export function installTapTitles(root) {
  if (!window.matchMedia || !matchMedia('(hover: none)').matches) return;
  let tip = null;
  let tipTimer = 0;
  let press = null; // { id, x, y, timer }: a pointer that may still become a long press
  let swallow = 0; // a long press fired: its click is stopped until this time (Infinity while the finger is down)

  const hideTip = () => {
    clearTimeout(tipTimer);
    if (tip) tip.remove();
    tip = null;
  };
  const cancelPress = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  const showTip = (el) => {
    press = null;
    if (!el.isConnected) return;
    swallow = Infinity;
    hideTip();
    tip = h('div', { class: 'taptip', role: 'status' }, el.getAttribute('title'));
    tip.style.left = '0px';
    tip.style.top = '0px';
    document.body.append(tip);
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const ht = tip.offsetHeight;
    const above = r.top - ht - 10 >= 8;
    tip.style.left = Math.round(Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8)) + 'px';
    tip.style.top = Math.round(above ? r.top - ht - 10 : r.bottom + 10) + 'px';
    tipTimer = setTimeout(hideTip, TIP_MS);
  };
  // any new press hides the title; a press that starts on a titled element may become a long press
  const onDown = (e) => {
    hideTip();
    cancelPress();
    swallow = 0;
    const el = e.target instanceof Element ? e.target.closest('[title]:not([title=""])') : null;
    if (!el || !root.contains(el)) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: setTimeout(() => showTip(el), HOLD_MS) };
  };
  const onMove = (e) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_PX) cancelPress();
  };
  // the finger lifts: the press is over, and the click that follows it (if any) is the one to stop
  const onRelease = (e) => {
    if (press && e.pointerId === press.id) cancelPress();
    if (swallow === Infinity) swallow = performance.now() + CLICK_MS;
  };
  const onClick = (e) => {
    const eat = swallow > 0 && performance.now() <= swallow;
    swallow = 0;
    if (!eat) return;
    e.stopPropagation();
    e.preventDefault();
  };
  const onScroll = () => {
    cancelPress();
    hideTip();
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('pointermove', onMove, { capture: true, passive: true });
  document.addEventListener('pointerup', onRelease, true);
  document.addEventListener('pointercancel', onRelease, true);
  document.addEventListener('click', onClick, true);
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
}
