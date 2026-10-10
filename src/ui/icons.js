// Icons for the table, the panels and the menus. Two sets:
//   'briny' - drawn for this game as small sticker-style SVGs in the art's palette (the default);
//   'emoji' - the original emoji.
// Every icon is made with ic(key). Switching sets repaints the icons already on screen (paintIcons), no reload needed.

import { UI, savePrefs } from './store.js';

const INK = '#0b2233';
const CREAM = '#f6ecd3';
const GOLD = '#f2b84b';
const TEAL = '#4fd1c5';
const CORAL = '#e8795a';
const RUST = '#b5543a';
const SEA = '#2f7f9e';
const GREY = '#7d93a0';

const fillP = (d, fill, stroke = INK) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/>`;
const lineP = (d, stroke, w = 2) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circ = (cx, cy, r, fill, stroke = INK, w = 1.3) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
const rect = (x, y, w, h, rx, fill, stroke = INK) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`;

const BRINY = {
  sound_on: fillP('M3 9h4l5-4v14l-5-4H3z', CREAM) + lineP('M16 9q2 3 0 6', TEAL, 2) + lineP('M18.5 6.5q3.5 5.5 0 11', TEAL, 2),
  sound_off: fillP('M3 9h4l5-4v14l-5-4H3z', CREAM) + lineP('M16 9l5 6M21 9l-5 6', CORAL, 2.2),
  log: rect(5, 3, 14, 18, 2, CREAM) + lineP('M8 8h8M8 12h8M8 16h5', SEA, 1.8),
  save: rect(4, 3.5, 16, 17, 2.5, CREAM) + rect(7.5, 3.5, 9, 6, 1, SEA) + rect(7, 13.5, 10, 7, 1.2, TEAL),
  rules: fillP('M3 5q5-2 9 1v14q-4-2-9-1z', TEAL) + fillP('M21 5q-5-2-9 1v14q4-2 9-1z', GOLD),
  menu: lineP('M4 7h16M4 12h16M4 17h16', CREAM, 2.4),
  close: lineP('M6 6l12 12M18 6L6 18', CREAM, 2.6),
  zoom: circ(10.5, 10.5, 6.5, '#bfeeea') + lineP('M15.5 15.5L20 20', GOLD, 3),
  hint: lineP('M9.5 19.5h5M10.5 21.5h3', CREAM, 1.6) + fillP('M12 2.8a6.2 6.2 0 0 0-3.6 11.3v2.2h7.2v-2.2A6.2 6.2 0 0 0 12 2.8z', GOLD),
  undo: lineP('M9 6H15a5 5 0 0 1 0 10H8', CREAM, 2.4) + fillP('M3 6l6-3.5v7z', CREAM),
  check: lineP('M5 12.5l4.5 4.5L19 7', TEAL, 3),
  sparkle: fillP('M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3-6.3-2.2 6.3-2.2z', GOLD),
  iconset: circ(12, 12, 9, CREAM) + circ(8, 9, 1.8, CORAL) + circ(12.5, 7.5, 1.8, GOLD) + circ(15.5, 11, 1.8, TEAL) + circ(8.5, 14.5, 1.8, SEA),
  sea: lineP('M2 14q2.5-3 5 0t5 0t5 0t5 0', TEAL, 2.6) + lineP('M2 19.5q2.5-3 5 0t5 0t5 0t5 0', CREAM, 1.8),
  port: circ(12, 6.2, 2.2, 'none', CREAM, 1.8) + lineP('M12 9v11M7 15.5a5 5 0 0 0 10 0M9 12h6', CREAM, 2),
  dice: rect(3.5, 3.5, 17, 17, 3.5, CREAM) + circ(8, 8, 1.7, INK, 'none') + circ(16, 8, 1.7, INK, 'none') + circ(12, 12, 1.7, INK, 'none') + circ(8, 16, 1.7, INK, 'none') + circ(16, 16, 1.7, INK, 'none'),
  spent: lineP('M4.5 5.5h6l-6 7.5h6M13.5 12.5h5l-5 6h5', CREAM, 2),
  bag: fillP('M4.5 9h15l-1.3 11.5H5.8z', TEAL) + lineP('M9 9V7a3 3 0 0 1 6 0v2', CREAM, 1.8),
  regret: rect(4.5, 6, 11, 15, 2, CREAM) + rect(8, 3.5, 11, 15, 2, RUST),
  cards: rect(4, 6, 11, 15, 2, CREAM) + rect(9, 3.5, 11, 15, 2, TEAL),
  supply: rect(3, 8, 18, 12, 2.5, GOLD) + lineP('M9 8V5.5h6V8', GOLD, 1.8) + lineP('M3 13h18', INK, 1.2),
  rod: lineP('M4 20L17 5', GOLD, 2.2) + lineP('M17 5q1.5 8-2.5 13', CREAM, 0.9) + lineP('M14.5 18.5v1.5', CREAM, 1.2),
  reel: circ(12, 12, 8.5, TEAL) + circ(12, 12, 3, GREY) + lineP('M12 3.5v17M3.5 12h17', CREAM, 1.1),
  dink: rect(5, 3, 14, 18, 2.5, CORAL) + fillP('M12 8l1.4 2.9 3.1.4-2.3 2.2.6 3.1L12 15l-2.8 1.6.6-3.1-2.3-2.2 3.1-.4z', GOLD),
  big: fillP('M3.5 18L2.5 8.5l5 3.8L12 5l4.5 7.3 5-3.8L20.5 18z', GOLD),
  lp: circ(12, 12, 9, CORAL) + circ(12, 12, 4.2, CREAM),
  plug: lineP('M9 3v5M15 3v5', CREAM, 2) + rect(6, 8, 12, 6, 2, TEAL) + lineP('M12 14v3.5q0 3 3 3h1.5', CREAM, 1.8),
  lifeboat: fillP('M3 13.5h18l-2.8 5.5H5.8z', RUST) + lineP('M12 3.5v10', CREAM, 1.6) + fillP('M12 3.5l6.5 9.2H12z', CREAM),
  sell: circ(9, 15, 6.5, GOLD) + circ(15, 9, 6.5, GOLD) + circ(15, 9, 3.2, 'none', INK, 0.9),
  shop: fillP('M3 9.5l2.2-5.5h13.6L21 9.5z', CORAL) + fillP('M5 9.5v11.5h14V9.5z', CREAM) + fillP('M10 14h4v7h-4z', TEAL),
  mount: fillP('M7 3.5h10v5.5a5 5 0 0 1-10 0z', GOLD) + lineP('M7 5.5H4v2a3 3 0 0 0 3 3M17 5.5h3v2a3 3 0 0 1-3 3', GOLD, 1.6) + fillP('M10.5 14.5h3V18h-3z', GOLD) + fillP('M7.5 18.5h9v2.5h-9z', GOLD),
  give: fillP('M4 10.5h16V21H4z', CORAL) + fillP('M3 7.5h18v3H3z', RUST) + lineP('M12 7.5V21', GOLD, 2.2) + lineP('M12 7.5C9 3.5 6.5 4.5 8.5 7.5M12 7.5c3-4 5.5-3 3.5 0', GOLD, 1.4),
  pass: fillP('M4 6l9 6-9 6z', TEAL) + fillP('M14 6h2.5v12H14z', TEAL),
  eat: lineP('M8 3v6.5M5.5 3v4.5M10.5 3v4.5M5.5 7.5h5M8 9.5V21', CREAM, 1.8) + lineP('M17 3c-1.8 2.5-1.8 6 0 7.5V21', CREAM, 1.8),
  cloche: fillP('M3.5 16.5a8.5 8.5 0 0 1 17 0z', CREAM) + lineP('M2 19h20', CREAM, 2) + circ(12, 7.6, 1.3, CREAM),
  skull: fillP('M12 3.5a7.5 7.5 0 0 0-7.5 7.5c0 2.8 1.4 4.6 3.2 5.5V19h8.6v-2.5c1.8-.9 3.2-2.7 3.2-5.5A7.5 7.5 0 0 0 12 3.5z', CREAM) + fillP('M7.8 11.2h3.6v3.4H7.8zM12.6 11.2h3.6v3.4h-3.6z', INK),
  coffin: fillP('M8.5 3.5h7l3 5.5v12h-13V9z', GREY) + lineP('M12 7.5v9M9 10.5h6', CREAM, 1.8),
  sinkers: fillP('M8 9.5h8l1.2 10.5H6.8z', GREY) + fillP('M10 4.5h4v5h-4z', GREY),
  fish: fillP('M3 12c3.2-4.6 8.6-5.2 12.4 0-3.8 4.6-9.2 4.2-12.4 0z', SEA) + fillP('M15 12l5.5-4.3v8.6z', SEA) + circ(7.3, 11.1, 1.1, '#ffffff'),
  worm: lineP('M3.5 18.5q3-7 6.5-3t6.5-4.5 4 1', CORAL, 3.2),
  bucks: circ(12, 12, 8.5, GOLD) + circ(12, 12, 5.2, 'none', INK, 1),
  human: circ(12, 7.8, 4.2, CREAM) + fillP('M4 21a8 8 0 0 1 16 0z', TEAL),
  bot: lineP('M12 3.5V7', CREAM, 1.6) + circ(12, 3.5, 1.3, GOLD) + rect(5, 7, 14, 11, 3, SEA) + circ(9.5, 12.2, 1.8, GOLD) + circ(14.5, 12.2, 1.8, GOLD) + lineP('M9.5 16h5', CREAM, 1.4),
  first: lineP('M8 3l4 6 4-6', CORAL, 2.4) + circ(12, 15, 5.5, GOLD),
  flag: lineP('M5 3v18', CREAM, 2) + fillP('M5 4h11.5l-2.2 3.8 2.2 3.8H5z', CREAM),
  eye: fillP('M2.5 12q9.5-9.5 19 0q-9.5 9.5-19 0z', CREAM) + circ(12, 12, 3.6, SEA) + circ(12, 12, 1.4, INK, 'none'),
  tag: fillP('M3 12.5V4h8.5L21 13.5l-7.5 7.5z', GOLD) + circ(7.5, 8, 1.6, INK, 'none'),
  madness: lineP('M12 12a2 2 0 1 1 2-2 4.5 4.5 0 1 1-6.5 4.4 7 7 0 1 1 10-6.4', TEAL, 2.2),
  grave: fillP('M6.5 21V10a5.5 5.5 0 0 1 11 0v11z', GREY) + lineP('M12 9v5M10 11h4', CREAM, 1.5),
};
BRINY.trophy = BRINY.mount;

const EMOJI = {
  sound_on: '🔊', sound_off: '🔇', log: '📜', save: '💾', rules: '📖', menu: '☰', close: '✕', zoom: '🔍', hint: '💡', undo: '↶', check: '✓', sparkle: '✨', iconset: '🎨',
  sea: '🌊', port: '⚓', dice: '🎲', spent: '💤', bag: '🎒', regret: '🃏', cards: '🃏', supply: '🧰', rod: '🎣', reel: '🌀', madness: '🌀', dink: '🎴', big: '👑',
  lp: '🛟', plug: '🔌', lifeboat: '🚣', sell: '💰', shop: '🛒', mount: '🏆', trophy: '🏆', give: '🎁', pass: '⏭️', eat: '🍴', cloche: '🍽️', skull: '💀',
  coffin: '⚰️', sinkers: '⚓', fish: '🐟', worm: '🪱', bucks: '🪙', human: '🧑', bot: '🤖', first: '🥇', flag: '🏳️', eye: '👁', tag: '🏷️', grave: '🪦',
};

export const ICON_SETS = [
  { id: 'briny', label: 'Briny' },
  { id: 'emoji', label: 'Emoji' },
];

const setName = () => (UI.prefs.icons === 'emoji' ? 'emoji' : 'briny');

function markup(key) {
  if (setName() === 'briny' && BRINY[key]) return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${BRINY[key]}</svg>`;
  return EMOJI[key] || '';
}

/** an icon element; it is repainted whenever the icon set changes */
export function ic(key) {
  const el = document.createElement('span');
  el.className = 'ic';
  el.dataset.ic = key;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = markup(key);
  return el;
}

/** repaint every icon on screen for the current set */
export function paintIcons(root = document) {
  document.documentElement.dataset.icons = setName();
  root.querySelectorAll('[data-ic]').forEach((el) => {
    el.innerHTML = markup(el.dataset.ic);
  });
}

export function setIconSet(name) {
  UI.prefs.icons = name === 'emoji' ? 'emoji' : 'briny';
  savePrefs();
  paintIcons();
}

export const iconSet = setName;
