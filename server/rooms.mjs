// Rooms: the lobby (seats, members, host settings) and the online game. Commands run one at a time because the
// engine and the store are shared. The engine is the only place where an answer is checked.

import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { COLORS, SEAT } from '../src/engine/core.js';
import { engine } from './engine.mjs';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0 or 1: easy to read out loud
const CODE_RE = new RegExp(`^[${CODE_CHARS}]{6}$`);
const NAME_MAX = 20;
const OPTS = ['tent', 'big', 'short'];

export class CmdError extends Error {
  constructor(reason, status = 400) {
    super(reason);
    this.status = status;
  }
}

const digest = (s) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(24).toString('base64url');
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || 'Người chơi';
const isSeatType = (t) => t === 'human' || t === 'bot';

function normCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!CODE_RE.test(c)) throw new CmdError('Mã phòng gồm 6 ký tự.', 404);
  return c;
}

/** what every member may see of a room (no token hashes) */
function viewOf(room, members, live) {
  return {
    code: room.code,
    status: room.status,
    players: room.colors.length,
    colors: room.colors,
    seats: room.seats,
    opts: room.opts,
    members: members.map((m) => ({ id: m.id, name: m.name, seat: m.seat, host: m.host, online: live.has(m.id) })),
  };
}

export function createRooms({ store, log = console.error }) {
  const live = new Map(); // room code -> Map(member id -> connection)
  let queue = Promise.resolve();

  /** run one command after the previous one has finished; an unexpected failure drops the engine's copy of the game */
  function serial(fn) {
    const run = queue.then(async () => {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof CmdError)) engine.invalidate();
        throw e;
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  const liveOf = (code) => {
    if (!live.has(code)) live.set(code, new Map());
    return live.get(code);
  };
  const youOf = (members, id) => {
    const m = members.find((x) => x.id === id);
    return m ? { id: m.id, seat: m.seat, host: m.host } : null;
  };

  async function roomOf(code) {
    const room = await store.getRoom(code);
    if (!room) throw new CmdError('Không tìm thấy phòng này.', 404);
    return room;
  }

  /** the room, its members and this connection's member */
  async function memberOf(conn) {
    const room = await roomOf(conn.code);
    const members = await store.listMembers(conn.code);
    const me = members.find((m) => m.id === conn.memberId);
    if (!me) throw new CmdError('Bạn không còn trong phòng này.', 403);
    return { room, members, me };
  }

  /** the room state, sent to every open connection of the room */
  async function broadcastRoom(code) {
    const room = await store.getRoom(code);
    if (!room) return;
    const members = await store.listMembers(code);
    const view = viewOf(room, members, liveOf(code));
    for (const [id, conn] of liveOf(code)) conn.send({ type: 'room', room: view, you: youOf(members, id) });
  }

  const sendEntries = (code, from, list) => {
    for (const conn of liveOf(code).values()) conn.send({ type: 'entries', from, list });
  };

  /** the engine has moved on: store what it recorded (bots included), then tell everybody */
  async function commit(code, from) {
    const list = engine.unsaved();
    if (list.length) await store.appendAnswers(code, list);
    engine.stored();
    if (list.length) sendEntries(code, from, list.map(({ a, h, t }) => ({ a, h, t })));
    if (engine.error()) {
      log('engine error in room', code, engine.error());
      await store.updateRoom(code, { status: 'error' });
      await broadcastRoom(code);
    } else if (engine.over()) {
      await store.updateRoom(code, { status: 'over' });
      await broadcastRoom(code);
    }
  }

  /** the engine must hold this room's game before it can take an answer (after a restart or a switch of room) */
  async function ensureEngine(room) {
    if (engine.holds(room.code)) return;
    const rows = await store.listAnswers(room.code);
    await engine.load(room.code, room.setup, rows);
    await commit(room.code, rows.length);
  }

  // COMMANDS -----------------------------------------------------------------------------------------------

  async function create({ name, players, opts } = {}) {
    const n = Number(players);
    if (!Number.isInteger(n) || n < 2 || n > COLORS.length) throw new CmdError('Số người chơi phải từ 2 đến 5.');
    const colors = COLORS.slice(0, n);
    const seats = Object.fromEntries(colors.map((c) => [c, 'human']));
    const roomOpts = { tent: !!opts?.tent, big: !!opts?.big, short: !!opts?.short };
    const token = newToken();
    return serial(async () => {
      let code = newCode();
      for (let tries = 0; ; tries++) {
        try {
          await store.createRoom({ code, status: 'lobby', players: n, colors, seats, opts: roomOpts, setup: null });
          break;
        } catch (e) {
          if (!e.dup || tries >= 5) throw e;
          code = newCode();
        }
      }
      const id = randomUUID();
      // the host sits at the first seat; it can give the seat up in the lobby
      await store.addMember({ id, code, hash: digest(token), name: cleanName(name), seat: colors[0], host: true });
      return { code, token, id };
    });
  }

  async function join(codeIn, { name } = {}) {
    const code = normCode(codeIn);
    const token = newToken();
    return serial(async () => {
      await roomOf(code);
      const id = randomUUID();
      await store.addMember({ id, code, hash: digest(token), name: cleanName(name), seat: null, host: false });
      await broadcastRoom(code);
      return { code, token, id };
    });
  }

  /** public view of a room, for the join screen */
  async function peek(codeIn) {
    const code = normCode(codeIn);
    const room = await roomOf(code);
    const members = await store.listMembers(code);
    return viewOf(room, members, liveOf(code));
  }

  async function hello(conn, { code: codeIn, token }) {
    const code = normCode(codeIn);
    return serial(async () => {
      const room = await roomOf(code);
      const members = await store.listMembers(code);
      const me = members.find((m) => m.hash === digest(String(token || '')));
      if (!me) throw new CmdError('Liên kết này không còn hợp lệ. Hãy vào phòng lại.', 403);
      if (conn.code) detach(conn);
      conn.code = code;
      conn.memberId = me.id;
      liveOf(code).set(me.id, conn);
      await broadcastRoom(code);
      if (room.status !== 'lobby') {
        const rows = await store.listAnswers(code);
        conn.send({ type: 'game', setup: room.setup, rec: rows.map(({ a, h, t }) => ({ a, h, t })) });
      }
    });
  }

  async function claim(conn, { seat }) {
    return serial(async () => {
      const { room, members, me } = await memberOf(conn);
      lobbyOnly(room);
      if (!room.colors.includes(seat) || room.seats[seat] !== 'human') throw new CmdError('Ghế này không dành cho người chơi.');
      if (members.some((m) => m.seat === seat && m.id !== me.id)) throw new CmdError('Ghế này đã có người ngồi.');
      await store.updateMember(me.id, { seat });
      await broadcastRoom(room.code);
    });
  }

  async function release(conn) {
    return serial(async () => {
      const { room, me } = await memberOf(conn);
      lobbyOnly(room);
      await store.updateMember(me.id, { seat: null });
      await broadcastRoom(room.code);
    });
  }

  async function config(conn, { seats, opts } = {}) {
    return serial(async () => {
      const { room, members, me } = await memberOf(conn);
      hostOnly(me);
      lobbyOnly(room);
      const nextSeats = { ...room.seats };
      for (const [c, t] of Object.entries(seats || {})) {
        if (!room.colors.includes(c) || !isSeatType(t)) throw new CmdError('Cấu hình ghế không hợp lệ.');
        nextSeats[c] = t;
      }
      const nextOpts = { ...room.opts };
      for (const k of OPTS) if (opts && typeof opts[k] === 'boolean') nextOpts[k] = opts[k];
      await store.updateRoom(room.code, { seats: nextSeats, opts: nextOpts });
      for (const m of members) if (m.seat && nextSeats[m.seat] !== 'human') await store.updateMember(m.id, { seat: null });
      await broadcastRoom(room.code);
    });
  }

  async function start(conn) {
    return serial(async () => {
      const { room, members, me } = await memberOf(conn);
      hostOnly(me);
      lobbyOnly(room);
      const humans = room.colors.filter((c) => room.seats[c] === 'human');
      if (!humans.length) throw new CmdError('Cần ít nhất một ghế người chơi.');
      const empty = humans.filter((c) => !members.some((m) => m.seat === c));
      if (empty.length) throw new CmdError(`Còn ghế trống: ${empty.map((c) => SEAT[c].name).join(', ')}.`);
      const multi = room.colors.length > 1;
      const setup = {
        colors: room.colors.slice(),
        opts: {
          tent: room.opts.tent,
          big: multi && room.opts.big,
          short: multi && room.opts.short,
          seed: randomInt(4294967296),
          seats: { ...room.seats },
        },
      };
      await store.updateRoom(room.code, { status: 'playing', setup });
      await broadcastRoom(room.code);
      await engine.load(room.code, setup, []);
      for (const conn of liveOf(room.code).values()) conn.send({ type: 'game', setup, rec: [] });
      await commit(room.code, 0);
    });
  }

  /** one answer from the seat's player. Wrong or stale answers are refused; the record is sent again when the client is behind. */
  async function answer(conn, { n, a }) {
    return serial(async () => {
      const { room, me } = await memberOf(conn);
      if (room.status !== 'playing') throw new CmdError('Ván này chưa bắt đầu hoặc đã kết thúc.');
      if (!me.seat) throw new CmdError('Bạn đang xem, không có ghế trong ván này.');
      await ensureEngine(room);
      if (engine.error()) throw new CmdError('Ván gặp lỗi, không nhận thêm quyết định.');
      const count = engine.count();
      if (Number(n) !== count) {
        conn.send({ type: 'game', setup: room.setup, rec: engine.records() });
        return;
      }
      const pr = engine.prompt();
      if (!pr) throw new CmdError('Hiện chưa có quyết định nào đang chờ.');
      if (pr.color !== me.seat) throw new CmdError(`Đang chờ ${SEAT[pr.color].name} quyết định.`);
      if (!(await engine.answer(a))) throw new CmdError('Lựa chọn này không hợp lệ.');
      await commit(room.code, count);
    });
  }

  async function sync(conn) {
    return serial(async () => {
      const { room } = await memberOf(conn);
      if (room.status === 'lobby') return;
      const rows = await store.listAnswers(room.code);
      conn.send({ type: 'game', setup: room.setup, rec: rows.map(({ a, h, t }) => ({ a, h, t })) });
    });
  }

  /** leave the lobby for good (the seat is released, the member is removed) */
  async function leave(conn) {
    return serial(async () => {
      const { room, members, me } = await memberOf(conn);
      lobbyOnly(room);
      await store.removeMember(me.id);
      liveOf(room.code).delete(me.id);
      const heir = members.find((m) => m.id !== me.id);
      if (me.host && heir) await store.updateMember(heir.id, { host: true });
      conn.send({ type: 'left' });
      conn.memberId = null;
      await broadcastRoom(room.code);
    });
  }

  function lobbyOnly(room) {
    if (room.status !== 'lobby') throw new CmdError('Ván đã bắt đầu, không đổi được lúc này.');
  }
  function hostOnly(me) {
    if (!me.host) throw new CmdError('Chỉ chủ phòng làm được việc này.');
  }

  /** route one message from a socket. Every failure is answered on that socket; nothing is thrown out. */
  async function handle(conn, msg) {
    const type = msg && msg.type;
    try {
      if (type === 'hello') return await hello(conn, msg);
      if (!conn.memberId) throw new CmdError('Hãy vào phòng trước.');
      switch (type) {
        case 'claim':
          return await claim(conn, msg);
        case 'release':
          return await release(conn);
        case 'config':
          return await config(conn, msg);
        case 'start':
          return await start(conn);
        case 'answer':
          return await answer(conn, msg);
        case 'sync':
          return await sync(conn);
        case 'leave':
          return await leave(conn);
        default:
          throw new CmdError('Lệnh không hợp lệ.');
      }
    } catch (e) {
      if (e instanceof CmdError) {
        // the room or this seat is gone for good: the browser forgets it
        conn.send({ type: type === 'answer' ? 'reject' : 'error', reason: e.message, fatal: e.status === 403 || e.status === 404 || undefined });
        return;
      }
      log('command failed', type, e);
      conn.send({ type: 'error', reason: 'Lỗi máy chủ, thử lại sau.' });
    }
  }

  /** a socket has closed: the member stays in the room (and keeps the seat), only the presence changes */
  function disconnect(conn) {
    if (!detach(conn)) return;
    serial(() => broadcastRoom(conn.code)).catch((e) => log('presence update failed', e));
  }

  /** forget this socket as the live connection of its member; false when it was not (any more) that member's connection */
  function detach(conn) {
    if (!conn.code || liveOf(conn.code).get(conn.memberId) !== conn) return false;
    liveOf(conn.code).delete(conn.memberId);
    return true;
  }

  return { create, join, peek, handle, disconnect };
}
