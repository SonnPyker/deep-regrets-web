// Start screen: pick seats (human / bot / off), expansions and a seed.

import { COLORS, SEAT } from '../engine/core.js';
import { Game } from '../engine/game.js';
import { progress } from '../engine/survey.js';
import { h, clear } from './dom.js';
import { seatColor } from './art.js';
import { UI, savePrefs, loadSurvey, loadSlots } from './store.js';
import { SAVE_MODES, SAVE_SLOTS } from '../engine/saves.js';
import { ICON_SETS, iconSet, setIconSet } from './icons.js';

export const SPEEDS = [
  ['Chậm', 900],
  ['Vừa', 400],
  ['Nhanh', 120],
  ['Tức thì', 0],
];

export function speedSelect(onChange) {
  const sel = h('select', { class: 'speedsel', 'aria-label': 'Tốc độ của máy', title: 'Thời gian máy suy nghĩ mỗi quyết định' });
  for (const [name, ms] of SPEEDS) sel.append(h('option', { value: String(ms), selected: UI.prefs.speed === ms }, `Máy: ${name}`));
  sel.addEventListener('change', () => {
    UI.prefs.speed = Number(sel.value);
    Game.speed = UI.prefs.speed;
    savePrefs();
    if (onChange) onChange();
  });
  return sel;
}

export function createMenu({ onStart, onContinue, onOnline, onHelp, onSurvey, onSaves }) {
  const el = h('main', { class: 'menu' });

  function seatCard(c) {
    const mode = UI.prefs.seats[c];
    const card = h('div', { class: `seatcard ${mode}`, style: { '--c': seatColor(c) } });
    card.append(h('img', { class: 'seatart', src: `assets/board/${SEAT[c].board}.webp`, alt: '', draggable: 'false' }));
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `Vai trò của ${SEAT[c].name}` });
    for (const [v, label] of [['human', 'Người'], ['bot', 'Máy'], ['off', 'Tắt']]) {
      seg.append(
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': mode === v ? 'true' : 'false',
            class: mode === v ? 'on' : '',
            onclick: () => {
              UI.prefs.seats[c] = v;
              savePrefs();
              render();
            },
          },
          label,
        ),
      );
    }
    card.append(h('div', { class: 'seatinfo' }, h('b', null, SEAT[c].name), seg));
    return card;
  }

  function toggle(key, title, desc) {
    const id = `opt-${key}`;
    const cb = h('input', { type: 'checkbox', id, checked: UI.prefs[key] });
    cb.addEventListener('change', () => {
      UI.prefs[key] = cb.checked;
      savePrefs();
      render();
    });
    return h('label', { class: 'toggle', for: id }, cb, h('span', { class: 'tbox' }), h('span', null, h('b', null, title), h('small', null, desc)));
  }

  function iconSetField() {
    const cur = iconSet();
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Bộ icon' });
    for (const s of ICON_SETS) {
      seg.append(
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': cur === s.id ? 'true' : 'false',
            class: cur === s.id ? 'on' : '',
            onclick: () => {
              setIconSet(s.id);
              render();
            },
          },
          s.label,
        ),
      );
    }
    return h('div', { class: 'field' }, h('span', null, 'Bộ icon'), seg, h('small', null, 'Briny là bộ icon vẽ riêng cho game. Đổi ngay, không cần tải lại trang.'));
  }

  function render() {
    clear(el);
    const active = COLORS.filter((c) => UI.prefs.seats[c] !== 'off');
    const nHuman = active.filter((c) => UI.prefs.seats[c] === 'human').length;
    const solo = active.length === 1;

    el.append(
      h(
        'header',
        { class: 'hero' },
        h('h1', null, 'Deep Regrets'),
        h('p', { class: 'tag' }, 'Câu cá, tích lũy hối tiếc và cố đừng phát điên. Bản web tự động hóa hoàn toàn - bạn chỉ cần ra quyết định.'),
      ),
    );

    el.append(h('section', { class: 'panel' }, h('h2', null, '1. Người chơi'), h('div', { class: 'seatgrid' }, COLORS.map(seatCard))));

    let hint;
    if (active.length === 0) hint = 'Hãy bật ít nhất một chỗ ngồi.';
    else if (solo) hint = 'Chơi một mình: chiến dịch Ocean Survey. Mỗi ván là một tuần (5 ngày, 60 lá Regret), bắt đầu với trang bị đã mở khóa.';
    else if (nHuman === 0) hint = 'Không có người chơi: bạn sẽ xem các máy tự chơi với nhau.';
    else if (nHuman > 1) hint = `${nHuman} người chơi chung một thiết bị (hot-seat): màn hình che bài sẽ hiện khi đổi người.`;
    else hint = `${active.length} người chơi (${active.length - 1} máy).`;
    el.append(h('p', { class: `hint${active.length === 0 ? ' bad' : ''}` }, hint));

    el.append(
      h(
        'section',
        { class: 'panel' },
        h('h2', null, '2. Tùy chọn'),
        h(
          'div',
          { class: 'toggles' },
          toggle('tent', 'Lamentable Tentacles', solo ? 'Chỉ dùng khi chơi từ 2 người' : 'Thêm các Fish của bản mở rộng Lamentable Tentacles'),
          toggle('big', 'Biggest Regrets', solo ? 'Chỉ dùng khi chơi từ 2 người' : 'Mỗi người nhận một lá Biggest Regret với khả năng thay đổi theo số Regret'),
          toggle('short', 'Ván ngắn', solo ? 'Chỉ dùng khi chơi từ 2 người' : 'Bắt đầu từ Thứ Ba (5 ngày thay vì 6)'),
          toggle('confirm', 'Hỏi xác nhận trước khi chọn', 'Hành động trong lượt (nút hành động, bắn câu, bán và mua ở Port) phải bấm Chọn để xác nhận, tránh bấm nhầm. Các bước chọn bên trong một hành động vẫn làm ngay.'),
        ),
        h(
          'div',
          { class: 'row2' },
          h(
            'label',
            { class: 'field' },
            h('span', null, 'Hạt giống (tùy chọn)'),
            h('input', {
              type: 'text',
              placeholder: 'để trống = ngẫu nhiên',
              value: UI.prefs.seed || '',
              maxlength: '40',
              onchange: (e) => {
                UI.prefs.seed = e.target.value;
                savePrefs();
              },
            }),
            h('small', null, 'Cùng hạt giống và cùng lựa chọn sẽ cho ra cùng một ván bài.'),
          ),
          h('div', { class: 'field' }, h('span', null, 'Tốc độ máy'), speedSelect()),
          iconSetField(),
        ),
      ),
    );

    const info = Game.hasSave() ? Game.saveInfo() : null;
    const actions = h('div', { class: 'menu-actions' });
    actions.append(h('button', { type: 'button', class: 'btn primary xl', disabled: active.length === 0, onclick: () => onStart() }, 'Bắt đầu ván mới'));
    actions.append(h('button', { type: 'button', class: 'btn xl', onclick: () => onOnline() }, 'Chơi chung online', h('small', null, 'Mỗi người một máy, cùng một ván đấu')));
    if (info) {
      actions.append(
        h(
          'button',
          { type: 'button', class: 'btn xl', onclick: () => onContinue() },
          `Tiếp tục ván đang lưu`,
          h('small', null, `${info.players} người · ${info.answers} quyết định`),
        ),
      );
    }
    const sv = loadSurvey();
    const pr = progress(sv);
    actions.append(
      h(
        'button',
        { type: 'button', class: 'btn xl', onclick: () => onSurvey() },
        'Bảng Ocean Survey',
        h('small', null, `Tuần ${sv.weeks} · ${pr.done}/${pr.total} Fish${sv.pending ? ' · có kết quả chờ ghi' : ''}`),
      ),
    );
    const used = Object.values(loadSlots()).flat().filter(Boolean).length;
    actions.append(h('button', { type: 'button', class: 'btn xl', onclick: () => onSaves() }, 'Ván đã lưu', h('small', null, `${used}/${SAVE_MODES.length * SAVE_SLOTS} ô đã dùng`)));
    actions.append(h('button', { type: 'button', class: 'btn ghost xl', onclick: () => onHelp() }, 'Luật chơi'));
    el.append(actions);
    el.append(h('footer', { class: 'credit' }, 'Bản làm lại không chính thức của boardgame Deep Regrets, dùng hình ảnh từ bản Tabletop Simulator có sẵn trên máy bạn.'));
  }

  return { el, render };
}
