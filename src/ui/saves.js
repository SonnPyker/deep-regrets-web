// Save slots: three per mode, solo (the Ocean Survey campaign) and coop (several seats on one device, or with bots).
// A game in progress goes into a slot, a slot is loaded or exported as a .json file, and a file is imported into a slot.
// The rules of a save and its check are in engine/saves.js; the slots themselves are kept in store.js.

import { Game } from '../engine/game.js';
import { SAVE_SLOTS, makeSave, modeOf, readSave, recOf, summarize } from '../engine/saves.js';
import { h, clear, append, toast } from './dom.js';
import { loadSlots, writeSlot, loadSurvey } from './store.js';
import { openModal, confirmDialog } from './modals.js';

const TABS = ['solo', 'coop'];
const MODE_LABEL = { solo: 'Solo · Ocean Survey', coop: 'Nhiều người chơi' };
const FULL = 'Không ghi được vào bộ nhớ của trình duyệt (có thể đã đầy).';

const stamp = (at) => (at ? new Date(at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : 'không rõ ngày');

/** one line about a save: the week being played (solo) or the people, and the answers so far */
function describe(save) {
  const s = summarize(save);
  return save.mode === 'solo' ? `Tuần ${s.week} · ${s.answers} quyết định` : `${s.players} người · ${s.answers} quyết định`;
}

/** a solo save puts its Ocean Survey sheet back, so the sheet is confirmed only when it differs from the one kept now */
const sameSheet = (save) => JSON.stringify(save.sheet) === JSON.stringify(loadSurvey());

/** asks which slot of a full mode to write into. Resolves with the slot index, or -1 when the dialog is closed. */
function pickSlot(mode, title) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const dlg = openModal({
      title,
      onClose: () => fin(-1),
      body: h(
        'div',
        { class: 'save-slots save-pick' },
        loadSlots()[mode].map((save, i) =>
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => {
                fin(i);
                dlg.close();
              },
            },
            `Ghi đè ô ${i + 1} · ${describe(save)}`,
          ),
        ),
      ),
    });
  });
}

/**
 * the saves dialog. game: a game is in progress, so it can be saved into a slot of its mode (only that mode is shown).
 * onLoad(save) continues a save; the dialog is closed first.
 */
export function openSaves({ game = false, onLoad, onClose } = {}) {
  const inGame = game && Game.setup !== null;
  let tab = inGame ? modeOf(Game.setup.colors) : 'solo';
  let busy = false;
  const list = h('div', { class: 'saves-list' });
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  fileIn.addEventListener('change', () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (f) importFile(f);
  });
  const wrap = h('div', { class: 'saves' }, fileIn, list);

  function button(label, fn, cls = '') {
    return h('button', { type: 'button', class: `btn small ${cls}`.trim(), disabled: busy, onclick: fn }, label);
  }

  function tabRow() {
    return h(
      'div',
      { class: 'seg', role: 'radiogroup', 'aria-label': 'Chế độ chơi' },
      TABS.map((m) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': tab === m ? 'true' : 'false',
            class: tab === m ? 'on' : '',
            onclick: () => {
              tab = m;
              paint();
            },
          },
          MODE_LABEL[m],
        ),
      ),
    );
  }

  function slotCard(i, save) {
    const acts = [];
    if (inGame) acts.push(button(save ? 'Ghi đè' : 'Lưu vào đây', () => saveHere(i)));
    if (save) {
      acts.push(button('Tải', () => load(i), 'primary'));
      acts.push(button('Xuất file', () => exportSlot(i)));
      acts.push(button('Xóa', () => removeSlot(i), 'danger'));
    }
    return h(
      'div',
      { class: `save-card${save ? '' : ' empty'}` },
      h('div', { class: 'save-head' }, h('b', null, `Ô ${i + 1}`), h('span', { class: 'dim' }, save ? stamp(save.at) : 'trống')),
      save ? h('div', { class: 'save-info' }, describe(save)) : null,
      h('div', { class: 'save-acts' }, acts),
    );
  }

  function paint() {
    const slots = loadSlots();
    clear(list);
    append(list, [
      inGame ? null : tabRow(),
      h('div', { class: 'save-slots' }, slots[tab].map((save, i) => slotCard(i, save))),
      h('p', { class: 'save-note dim' }, `Mỗi chế độ có tối đa ${SAVE_SLOTS} ô. Bản lưu là một tệp .json: xuất ra và nhập lại được trên máy khác.`),
    ]);
  }

  /** the game in progress goes into slot i of its mode */
  async function saveHere(i) {
    if (!Game.canSave()) {
      toast('Ván này không lưu được.');
      return;
    }
    const save = makeSave({ setup: Game.setup, rec: Game.rec, sheet: loadSurvey() });
    if (loadSlots()[save.mode][i] && !(await confirmDialog({ title: `Ghi đè ô ${i + 1}?`, text: 'Bản lưu đang nằm trong ô này sẽ bị thay bằng ván đang chơi.', ok: 'Ghi đè', danger: true }))) return;
    if (!writeSlot(save.mode, i, save)) {
      toast(FULL);
      return;
    }
    toast(`Đã lưu vào ô ${i + 1}.`);
    paint();
  }

  async function confirmLoad(save) {
    if (inGame && !(await confirmDialog({ title: 'Thay ván đang chơi?', text: 'Ván đang chơi sẽ bị thay bằng bản lưu này. Muốn giữ ván hiện tại thì hãy lưu nó vào một ô trước.', ok: 'Tải bản lưu', danger: true }))) return false;
    if (save.mode === 'solo' && !sameSheet(save)) {
      return confirmDialog({
        title: 'Đặt lại Ocean Survey?',
        text: `Bảng Ocean Survey sẽ quay về lúc lưu (đã ghi ${save.sheet.weeks} tuần). Các tuần ghi sau thời điểm đó sẽ mất.`,
        ok: 'Tải và đặt lại',
        danger: true,
      });
    }
    return true;
  }

  async function load(i) {
    const save = loadSlots()[tab][i];
    if (!save || !(await confirmLoad(save))) return;
    onLoad(save);
  }

  function exportSlot(i) {
    const save = loadSlots()[tab][i];
    if (!save) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `deep-regrets-${save.mode}-o${i + 1}-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeSlot(i) {
    if (!(await confirmDialog({ title: `Xóa ô ${i + 1}?`, text: 'Bản lưu trong ô này sẽ bị xóa và không hoàn tác được. Hãy xuất file trước nếu còn cần.', ok: 'Xóa', danger: true, safe: true }))) return;
    writeSlot(tab, i, null);
    paint();
  }

  /** a file is checked by its shape, then by a dry run of its answers (Game.verify); a good one goes into a slot of its mode */
  async function importFile(file) {
    if (busy) return;
    busy = true;
    paint();
    try {
      let raw = null;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        toast('Tệp này không đọc được (không phải JSON).');
        return;
      }
      const r = readSave(raw);
      if (!r.ok) {
        toast(r.msg);
        return;
      }
      const why = await Game.verify(r.save.setup, recOf(r.save));
      if (why) {
        toast(why);
        return;
      }
      const mode = r.save.mode;
      let i = loadSlots()[mode].findIndex((x) => x === null);
      if (i < 0) i = await pickSlot(mode, `Các ô ${MODE_LABEL[mode]} đã đầy. Chọn ô để ghi đè`);
      if (i < 0) return;
      if (!writeSlot(mode, i, r.save)) {
        toast(FULL);
        return;
      }
      toast(`Đã nhập bản lưu vào ${MODE_LABEL[mode]}, ô ${i + 1}.`);
    } finally {
      busy = false;
      paint();
    }
  }

  const dlg = openModal({
    title: inGame ? 'Lưu ván đang chơi' : 'Ván đã lưu',
    body: wrap,
    wide: true,
    cls: 'saves-dialog',
    onClose,
    actions: (close) => [
      h('button', { type: 'button', class: 'btn', onclick: () => fileIn.click() }, 'Nhập từ tệp…'),
      h('button', { type: 'button', class: 'btn primary', onclick: close }, 'Đóng'),
    ],
  });
  paint();
  return dlg;
}
