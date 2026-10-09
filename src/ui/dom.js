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
