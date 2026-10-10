// Ocean Survey screens: the sheet (opened from the menu) and the purchase that settles a finished solo week.

import { D } from '../engine/data.js';
import { OFFER, SHEET, budget, offerName, offerOf, progress, settle } from '../engine/survey.js';
import { h, clear, toast } from './dom.js';
import { ic } from './icons.js';
import { openModal, confirmDialog } from './modals.js';
import { loadSurvey, saveSurvey } from './store.js';

const GROUPS = [
  { kind: 'tackle', title: 'Tackle', icon: 'bag' },
  { kind: 'rod', title: 'Rod', icon: 'rod' },
  { kind: 'reel', title: 'Reel', icon: 'reel' },
  { kind: 'sup', title: 'Supply', icon: 'supply' },
];
const DEPTHS = [
  [1, 'I'],
  [2, 'II'],
  [3, 'III'],
];
const SIZES = [
  ['s', 'Small'],
  ['m', 'Middling'],
  ['l', 'Large'],
];

/** what an offer does, as printed on the sheet or on the card */
function descOf(o) {
  if (o.kind === 'tackle') return 'Thêm một xúc xắc Tackle. Khi tiêu xúc xắc này, nó về Spent Pool thay vì bị bỏ.';
  const pile = o.kind === 'rod' ? D.rod : o.kind === 'reel' ? D.reel : D.sup;
  return pile[o.id].t || '';
}

/** the purchase of one finished solo week. The Value brought back is the budget, and Dink discounts add to it (pooled). */
export function settlePanel(sv, { onDone } = {}) {
  const picked = new Set();
  const el = h('section', { class: 'survey-settle' });
  const cost = () => [...picked].reduce((s, k) => s + offerOf(k).cost, 0);

  async function commit() {
    const keys = [...picked];
    const left = budget(loadSurvey()) - cost();
    const ok = await confirmDialog({
      title: 'Ghi vào Survey?',
      text: left > 0 ? `Còn ${left} điểm chưa dùng sẽ bị mất. Các Fish đã mang về sẽ được đánh dấu trên Survey.` : 'Các Fish đã mang về sẽ được đánh dấu trên Survey.',
      ok: 'Ghi vào Survey',
    });
    if (!ok) return;
    const r = settle(loadSurvey(), keys);
    if (!r.ok) {
      toast(r.msg);
      return;
    }
    saveSurvey(r.sv);
    toast(keys.length ? `Đã mở khóa ${keys.length} trang bị. Tuần ${r.sv.weeks} đã ghi vào Survey.` : `Tuần ${r.sv.weeks} đã ghi vào Survey.`);
    if (onDone) onDone();
  }

  function row(o) {
    const owned = sv.owned.includes(o.key);
    const on = picked.has(o.key);
    const short = !owned && !on && cost() + o.cost > budget(sv);
    return h(
      'label',
      { class: `offer-item${owned ? ' owned' : ''}${short ? ' short' : ''}`, title: descOf(o) },
      h('input', {
        type: 'checkbox',
        checked: on,
        disabled: owned || short,
        onchange: (e) => {
          if (e.target.checked) picked.add(o.key);
          else picked.delete(o.key);
          draw();
        },
      }),
      h('span', { class: 'offer-name' }, offerName(o)),
      h('small', { class: 'offer-desc' }, descOf(o)),
      h('b', { class: 'offer-cost' }, owned ? 'Đã mở' : `${o.cost}`),
    );
  }

  function draw() {
    clear(el);
    const pend = sv.pending;
    if (!pend) {
      el.append(h('p', { class: 'dim' }, 'Không có tuần nào đang chờ ghi vào Survey.'));
      return;
    }
    const b = budget(sv);
    const left = b - cost();
    el.append(
      h('h3', null, `Ghi tuần ${sv.weeks + 1} vào Survey`),
      h('p', null, `Mang về ${pend.kept.length} Fish trị giá ${pend.total}${pend.disc ? ` (cộng ${pend.disc} từ Dink giảm giá)` : ''}.`),
      h(
        'p',
        { class: 'survey-budget' },
        h('span', null, 'Điểm dùng được ', h('b', null, String(b))),
        h('span', null, 'Đã chọn ', h('b', null, String(cost()))),
        h('span', { class: left < 0 ? 'bad' : '' }, 'Còn ', h('b', null, String(left))),
      ),
    );
    for (const g of GROUPS) {
      el.append(h('h4', null, ic(g.icon), ` ${g.title}`), h('div', { class: 'survey-offer' }, OFFER.filter((o) => o.kind === g.kind).map(row)));
    }
    el.append(h('div', { class: 'survey-commit' }, h('button', { type: 'button', class: 'btn primary', onclick: commit }, 'Ghi vào Survey & sang tuần mới')));
  }

  draw();
  return el;
}

/** Fish on the sheet by depth (rows) and size (columns); a checked Fish is one that was brought back to Port */
function fishGrid(sv) {
  const got = new Set(sv.checked);
  const chips = (d, s) =>
    SHEET.filter((id) => D.fish[id].d === d && D.fish[id].s === s).map((id) => {
      const f = D.fish[id];
      return h('span', { class: `fishchip${got.has(id) ? ' got' : ''}`, title: `${f.n} · giá trị ${f.v} · độ khó ${f.df == null ? '–' : f.df}` }, f.n);
    });
  return h(
    'section',
    { class: 'survey-sheet' },
    h('h3', null, 'Fish đã ghi'),
    h(
      'div',
      { class: 'tblwrap' },
      h(
        'table',
        { class: 'tbl survey-fish' },
        h('thead', null, h('tr', null, h('th', null, 'Depth'), SIZES.map(([, label]) => h('th', null, label)))),
        h(
          'tbody',
          null,
          DEPTHS.map(([d, roman]) => h('tr', null, h('th', null, roman), SIZES.map(([s]) => h('td', null, chips(d, s))))),
        ),
      ),
    ),
  );
}

/** the unlock list with each piece's state */
function kitList(sv) {
  const owned = new Set(sv.owned);
  return h(
    'section',
    { class: 'survey-sheet' },
    h('h3', null, 'Trang bị'),
    GROUPS.map((g) =>
      h(
        'div',
        { class: 'survey-group' },
        h('h4', null, ic(g.icon), ` ${g.title}`),
        h(
          'ul',
          { class: 'kit-list' },
          OFFER.filter((o) => o.kind === g.kind).map((o) =>
            h(
              'li',
              { class: owned.has(o.key) ? 'owned' : '', title: descOf(o) },
              h('span', null, owned.has(o.key) ? '✓ ' : ''),
              offerName(o),
              h('small', null, owned.has(o.key) ? ' · đã mở' : ` · ${o.cost} điểm`),
            ),
          ),
        ),
      ),
    ),
  );
}

/** the Ocean Survey sheet. A week waiting to be settled is shown first, with its purchase. */
export function openSurveyBoard({ onDone } = {}) {
  const sv = loadSurvey();
  const p = progress(sv);
  let modal = null;
  const body = h('div', { class: 'survey-board' });
  body.append(
    h(
      'div',
      { class: 'survey-head' },
      h('div', null, h('b', null, `Tuần đã ghi: ${sv.weeks}`), h('small', null, p.complete ? 'Chiến dịch hoàn thành: mọi Fish đã được đưa về Cảng.' : `Fish đã ghi: ${p.done}/${p.total}`)),
      h('div', null, h('b', null, `Trang bị đã mở: ${p.unlocked}/${p.offers}`)),
    ),
  );
  if (sv.pending) {
    body.append(
      settlePanel(sv, {
        onDone: () => {
          if (modal) modal.close();
          if (onDone) onDone();
        },
      }),
    );
  }
  body.append(fishGrid(sv), kitList(sv));
  modal = openModal({
    title: 'Bảng Ocean Survey',
    body,
    wide: true,
    actions: (close) => [h('button', { type: 'button', class: 'btn primary', onclick: close }, 'Đóng')],
  });
  return modal;
}
