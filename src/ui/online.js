// Online co-op screen: create or join a room, the lobby (seats, host options, start) and the link to the room's game.
// The room connection lives here; the game itself is shown by the main screen, through onPlay.

import { COLORS, SEAT } from '../engine/core.js';
import { Game } from '../engine/game.js';
import { h, clear, toast } from './dom.js';
import { seatColor } from './art.js';
import { UI, savePrefs } from './store.js';
import { createRoom, joinRoom, openRoom } from './net.js';
import { confirmDialog } from './modals.js';

const ROOMS_KEY = 'deepregrets.rooms.v1';
const NAME_MAX = 20;
const CODE_RE = /^[A-Z2-9]{6}$/;
const OPTS = [
  ['tent', 'Lamentable Tentacles', 'Thêm các Fish của bản mở rộng Lamentable Tentacles'],
  ['big', 'Biggest Regrets', 'Mỗi người nhận một lá Biggest Regret (cần từ 2 người)'],
  ['short', 'Ván ngắn', 'Bắt đầu từ Thứ Ba: 5 ngày thay vì 6 (cần từ 2 người)'],
];

// The rooms this browser has joined, with their seat tokens. A token is what lets the browser come back to its seat.
function savedRooms() {
  try {
    const d = JSON.parse(localStorage.getItem(ROOMS_KEY));
    return Array.isArray(d) ? d.filter((r) => r && typeof r.code === 'string' && typeof r.token === 'string') : [];
  } catch {
    return [];
  }
}
function keepRooms(list) {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* storage blocked: the room can still be joined again by its code */
  }
}
const remember = ({ code, token }) => keepRooms([{ code, token }, ...savedRooms().filter((r) => r.code !== code)]);
const forget = (code) => keepRooms(savedRooms().filter((r) => r.code !== code));

function segButton(label, on, fn) {
  return h('button', { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', class: on ? 'on' : '', onclick: fn }, label);
}

function toggleBox(id, title, desc, checked, disabled, onChange) {
  const cb = h('input', { type: 'checkbox', id, checked, disabled });
  cb.addEventListener('change', () => onChange(cb.checked));
  return h('label', { class: 'toggle', for: id }, cb, h('span', { class: 'tbox' }), h('span', null, h('b', null, title), h('small', null, desc)));
}

export function createOnline({ onPlay, onMenu }) {
  const el = h('main', { class: 'menu online' });
  const param = new URLSearchParams(location.search).get('room') || '';
  const form = {
    name: UI.prefs.onlineName || '',
    code: param.toUpperCase().slice(0, 6),
    players: 3,
    tent: UI.prefs.tent,
    big: false,
    short: false,
  };
  let session = null; // { code, token, conn, open, playing, room, you }
  let busy = '';
  let err = '';

  // SESSION ----------------------------------------------------------------------------------------------
  function enter({ code, token }) {
    detach();
    const s = { code, token, conn: null, open: false, playing: false, room: null, you: null };
    session = s;
    s.conn = openRoom({
      code,
      token,
      onMessage: (m) => onMessage(s, m),
      onState: (state) => {
        if (s !== session) return;
        s.open = state === 'open';
        // an answer that was in flight when the socket dropped may never have arrived: it can be sent again
        if (s.open && Game.remote) Game.reject();
        render();
      },
    });
    remember(s);
    err = '';
    render();
  }

  /** stop following the room; the seat is kept on the server and the room stays in the saved list */
  function detach() {
    if (!session) return;
    session.conn.close();
    session = null;
  }

  /** the room is gone for this browser: it was left, or its seat token is no longer valid */
  function drop(reason) {
    const code = session && session.code;
    detach();
    if (code) forget(code);
    err = reason || '';
    render();
  }

  function onMessage(s, m) {
    if (s !== session) return;
    if (m.type === 'room') {
      s.room = m.room;
      s.you = m.you;
    } else if (m.type === 'game') {
      if (s.playing) {
        Game.feed(0, m.rec);
      } else {
        s.playing = true;
        const link = { seat: s.you ? s.you.seat : null, send: (n, a) => s.conn.send({ type: 'answer', n, a }) };
        onPlay({ setup: m.setup, rec: m.rec, link });
      }
    } else if (m.type === 'entries') {
      // a gap in the record: ask for the whole record again
      if (!Game.feed(m.from, m.list)) s.conn.send({ type: 'sync' });
    } else if (m.type === 'reject') {
      Game.reject();
      toast(m.reason);
    } else if (m.type === 'error') {
      if (m.fatal) return drop(m.reason);
      toast(m.reason);
    } else if (m.type === 'left') {
      return drop('');
    }
    render();
  }

  /** send a lobby command; false (and a note) when the room is not connected right now */
  function send(msg) {
    if (session && session.conn.send(msg)) return true;
    toast('Chưa kết nối được tới phòng. Thử lại sau giây lát.');
    return false;
  }

  // ACTIONS ----------------------------------------------------------------------------------------------
  async function withBusy(text, fn) {
    busy = text;
    err = '';
    render();
    try {
      await fn();
    } catch (e) {
      err = e.message;
    } finally {
      busy = '';
      render();
    }
  }

  function saveName() {
    UI.prefs.onlineName = form.name;
    savePrefs();
  }

  function create() {
    saveName();
    return withBusy('Đang tạo phòng…', async () => {
      const r = await createRoom({ name: form.name, players: form.players, opts: { tent: form.tent, big: form.big, short: form.short } });
      enter(r);
    });
  }

  /** a room this browser already has a seat in is reopened, not joined a second time */
  function join(code) {
    saveName();
    const old = savedRooms().find((r) => r.code === code);
    if (old) return enter(old);
    return withBusy('Đang vào phòng…', async () => {
      enter(await joinRoom(code, form.name));
    });
  }

  const claim = (seat) => send({ type: 'claim', seat });
  const release = () => send({ type: 'release' });
  const setSeat = (seat, type) => send({ type: 'config', seats: { [seat]: type } });
  const setOpt = (key, on) => send({ type: 'config', opts: { [key]: on } });
  const start = () => send({ type: 'start' });

  async function leaveRoom() {
    const ok = await confirmDialog({
      title: 'Rời phòng?',
      text: 'Ghế của bạn sẽ được trả lại và phòng sẽ không còn trong danh sách của bạn. Muốn giữ ghế, hãy bấm Về menu.',
      ok: 'Rời phòng',
      danger: true,
    });
    if (ok) send({ type: 'leave' });
  }

  async function copyLink() {
    const url = `${location.origin}${location.pathname}?room=${session.code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Đã sao chép liên kết mời.');
    } catch {
      window.prompt('Sao chép liên kết mời:', url);
    }
  }

  function back() {
    detach();
    err = '';
    busy = '';
    onMenu();
  }

  // RENDER -----------------------------------------------------------------------------------------------
  function render() {
    clear(el);
    el.append(
      h(
        'header',
        { class: 'hero' },
        h('h1', null, 'Chơi chung online'),
        h('p', { class: 'tag' }, 'Mỗi người chơi trên máy riêng, theo cùng một ván đấu. Máy chủ ghi lại mọi quyết định và tự chơi các ghế máy.'),
      ),
    );
    if (busy) el.append(h('p', { class: 'hint' }, busy));
    if (err) el.append(h('p', { class: 'hint bad' }, err));
    el.append(session ? lobby() : browser());
    el.append(h('div', { class: 'menu-actions' }, h('button', { type: 'button', class: 'btn ghost xl', onclick: back }, 'Về menu')));
  }

  function browser() {
    const wrap = h('div', { class: 'online-browser' });
    const name = h('input', { type: 'text', value: form.name, maxlength: String(NAME_MAX), placeholder: 'Ví dụ: An', onchange: (e) => (form.name = e.target.value.trim().slice(0, NAME_MAX)) });
    const players = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Số người chơi' });
    for (let n = 2; n <= COLORS.length; n++) players.append(segButton(`${n} người`, form.players === n, () => {
      form.players = n;
      render();
    }));
    wrap.append(
      h(
        'section',
        { class: 'panel' },
        h('h2', null, '1. Tạo phòng mới'),
        h('label', { class: 'field' }, h('span', null, 'Tên của bạn'), name),
        h('div', { class: 'field' }, h('span', null, 'Số người chơi (mỗi người một ghế)'), players),
        h(
          'div',
          { class: 'toggles' },
          OPTS.map(([k, t, d]) => toggleBox(`on-new-${k}`, t, d, form[k], false, (on) => (form[k] = on))),
        ),
        h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn primary', disabled: !!busy, onclick: create }, 'Tạo phòng')),
      ),
    );
    const code = h('input', {
      type: 'text',
      value: form.code,
      maxlength: '6',
      placeholder: 'Mã 6 ký tự',
      autocapitalize: 'characters',
      oninput: (e) => {
        form.code = e.target.value.toUpperCase().replace(/\s/g, '');
        e.target.value = form.code;
      },
    });
    wrap.append(
      h(
        'section',
        { class: 'panel' },
        h('h2', null, '2. Vào phòng bằng mã'),
        h('label', { class: 'field' }, h('span', null, 'Mã phòng'), code),
        h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn primary', disabled: !!busy, onclick: () => join(form.code) }, 'Vào phòng')),
      ),
    );
    const list = savedRooms();
    if (list.length) {
      wrap.append(
        h(
          'section',
          { class: 'panel' },
          h('h2', null, '3. Phòng bạn đã vào'),
          h(
            'div',
            { class: 'roomlist' },
            list.map((r) =>
              h(
                'div',
                { class: 'roomitem' },
                h('b', { class: 'code' }, r.code),
                h(
                  'span',
                  { class: 'btnrow' },
                  h('button', { type: 'button', class: 'btn small primary', disabled: !!busy, onclick: () => enter(r) }, 'Vào lại'),
                  h('button', {
                    type: 'button',
                    class: 'btn small ghost',
                    onclick: () => {
                      forget(r.code);
                      render();
                    },
                  }, 'Quên'),
                ),
              ),
            ),
          ),
        ),
      );
    }
    return wrap;
  }

  function lobby() {
    const { room, you } = session;
    if (!room) {
      return h('section', { class: 'panel' }, h('h2', null, 'Đang vào phòng…'), h('p', { class: 'hint' }, session.open ? 'Đang tải phòng.' : 'Đang kết nối lại…'));
    }
    const host = !!you.host;
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    const empty = room.colors.filter((c) => room.seats[c] === 'human' && !room.members.some((m) => m.seat === c));
    let status;
    if (room.status === 'error') status = 'Ván này gặp lỗi và không tiếp tục được.';
    else if (empty.length) status = `Còn ghế trống: ${empty.map((c) => SEAT[c].name).join(', ')}.`;
    else status = host ? 'Đã đủ người. Bấm Bắt đầu ván khi sẵn sàng.' : 'Đã đủ người. Chờ chủ phòng bắt đầu ván.';

    const seats = room.colors.map((c) => {
      const t = room.seats[c];
      const who = room.members.find((m) => m.seat === c);
      const mine = you.seat === c;
      const occupant = who ? (who.id === you.id ? `${who.name} (bạn)` : who.name) : '';
      const card = h('div', { class: `seatcard ${t}${mine ? ' mine' : ''}`, style: { '--c': seatColor(c) } });
      card.append(h('img', { class: 'seatart', src: `assets/board/${SEAT[c].board}.webp`, alt: '', draggable: 'false' }));
      const label = t === 'bot' ? 'Máy chơi' : who ? occupant : 'Còn trống';
      const info = h('div', { class: 'seatinfo' }, h('b', null, SEAT[c].name), h('small', null, label, who && !who.online ? ' · ngoại tuyến' : ''));
      if (host) {
        info.append(
          h(
            'div',
            { class: 'seg', role: 'radiogroup', 'aria-label': `Vai trò của ${SEAT[c].name}` },
            segButton('Người', t === 'human', () => setSeat(c, 'human')),
            segButton('Máy', t === 'bot', () => setSeat(c, 'bot')),
          ),
        );
      }
      if (t === 'human' && mine) info.append(h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn small', onclick: release }, 'Rời ghế')));
      else if (t === 'human' && !who) info.append(h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn small primary', onclick: () => claim(c) }, 'Ngồi vào ghế')));
      card.append(info);
      return card;
    });

    const watchers = room.members.filter((m) => !m.seat).map((m) => (m.id === you.id ? `${m.name} (bạn)` : m.name));
    return h(
      'div',
      { class: 'lobby' },
      h(
        'section',
        { class: 'panel' },
        h(
          'div',
          { class: 'roomhead' },
          h('div', null, h('small', null, 'Mã phòng'), h('b', { class: 'code' }, room.code)),
          h('span', { class: `conn ${session.open ? 'on' : 'off'}` }, session.open ? 'Đã kết nối' : 'Đang kết nối lại…'),
        ),
        h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn small', onclick: copyLink }, 'Sao chép liên kết mời'), h('small', { class: 'dim' }, link)),
      ),
      h('section', { class: 'panel' }, h('h2', null, '1. Ghế chơi'), h('div', { class: 'seatgrid' }, seats)),
      h(
        'section',
        { class: 'panel' },
        h('h2', null, '2. Luật ván'),
        h(
          'div',
          { class: 'toggles' },
          OPTS.map(([k, t, d]) => toggleBox(`on-${k}`, t, d, room.opts[k], !host, (on) => setOpt(k, on))),
        ),
      ),
      h('section', { class: 'panel' }, h('h2', null, '3. Người xem'), h('p', { class: watchers.length ? '' : 'dim' }, watchers.length ? watchers.join(', ') : 'Không có ai đang xem.')),
      h('p', { class: `hint${empty.length || room.status === 'error' ? ' bad' : ''}` }, status),
      h(
        'div',
        { class: 'menu-actions' },
        host ? h('button', { type: 'button', class: 'btn primary xl', disabled: empty.length > 0 || room.status === 'error', onclick: start }, 'Bắt đầu ván') : null,
        h('button', { type: 'button', class: 'btn xl', onclick: leaveRoom }, 'Rời phòng'),
      ),
    );
  }

  render();

  return {
    el,
    render,
    /** stop following the room (called when the player leaves for the menu or the game screen) */
    detach,
    /** short text for the top bar while a room game is on the table */
    info() {
      if (!session) return '';
      return `Phòng ${session.code}${session.open ? '' : ' · đang kết nối lại'}`;
    },
  };
}
