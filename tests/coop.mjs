// Co-op integration test. The server runs in this process on a memory store. Every human seat plays in its own process
// (tests/coop-client.mjs) and replays the game on its own engine copy. Checks: the room starts once the seats are taken,
// every client ends with the same record and state as the server, a spectator's answer and a player's bad answer are
// refused, a bad token is refused, and a reconnect gets the whole record back.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { COLORS } from '../src/engine/core.js';
import { S } from '../src/engine/state.js';
import { createApp } from '../server/app.mjs';
import { createRooms } from '../server/rooms.mjs';
import { memoryStore } from '../server/store.mjs';
import { engine } from '../server/engine.mjs';

const CLIENT = fileURLToPath(new URL('./coop-client.mjs', import.meta.url));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const fails = [];
const check = (ok, msg) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fails.push(msg);
};

const store = memoryStore();
const rooms = createRooms({ store, log: (...a) => console.log('  server:', ...a) });
const app = createApp({ rooms, store });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const port = app.server.address().port;
const base = `http://127.0.0.1:${port}`;
const sockets = [];

async function post(path, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

/** a WebSocket with a queue of incoming messages; until() takes the first one that matches */
function socket() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const seen = [];
  let wake = null;
  ws.addEventListener('message', (ev) => {
    seen.push(JSON.parse(ev.data));
    if (wake) wake();
  });
  sockets.push(ws);
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('socket error')), { once: true });
  });
  return {
    ws,
    opened,
    send: (m) => ws.send(JSON.stringify(m)),
    async until(pred, what, ms = 20000) {
      const end = Date.now() + ms;
      for (;;) {
        const i = seen.findIndex(pred);
        if (i >= 0) return seen.splice(i, 1)[0];
        if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
        await new Promise((resolve) => {
          wake = resolve;
          setTimeout(resolve, 100);
        });
        wake = null;
      }
    },
  };
}

const isRoom = (pred) => (m) => m.type === 'room' && pred(m.room, m.you);

async function run(who, seat, probe) {
  const args = [CLIENT, String(port), code, who.token, seat, ...(probe ? ['probe'] : [])];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  const exit = await new Promise((resolve) => p.on('exit', (code) => resolve(code)));
  const line = out.trim().split('\n').pop() || '{}';
  return { exit, result: JSON.parse(line) };
}

console.log('lobby');
const made = await post('/api/rooms', { name: 'Host', players: 3, opts: { tent: true } });
check(made.status === 200 && /^[A-Z2-9]{6}$/.test(made.body.code), 'create returns a room code and a token');
const { code, token: hostToken } = made.body;
const [c0, c1, c2] = COLORS;

const host = socket();
await host.opened;
host.send({ type: 'hello', code, token: hostToken });
const first = await host.until((m) => m.type === 'room', 'the room state');
check(first.you && first.you.host === true && first.you.seat === c0, 'the creator is the host and sits at the first seat');

host.send({ type: 'release' });
await host.until(isRoom((r, you) => you.seat === null), 'the host to leave its seat');
host.send({ type: 'config', seats: { [c2]: 'bot' } });
await host.until(isRoom((r) => r.seats[c2] === 'bot'), 'the seat to become a bot');

const ann = await post(`/api/rooms/${code}/join`, { name: 'Ann' });
const ben = await post(`/api/rooms/${code}/join`, { name: 'Ben' });
const cat = await post(`/api/rooms/${code}/join`, { name: 'Cat' });
check(ann.status === 200 && ben.status === 200 && cat.status === 200, 'three members join with a code');

const spec = socket();
await spec.opened;
spec.send({ type: 'hello', code, token: cat.body.token });
await spec.until((m) => m.type === 'room', 'the spectator room state');

const annRun = run(ann.body, c0, true); // Ann also sends one bad answer first, which must be refused
const benRun = run(ben.body, c1, false);

await host.until(isRoom((r) => r.members.filter((x) => x.seat).length === 2), 'both player seats to be taken');
host.send({ type: 'start' });
console.log('game');

spec.send({ type: 'answer', n: 0, a: 0 });
const specRefused = await spec.until((m) => m.type === 'reject', 'the spectator refusal');
check(/xem/.test(specRefused.reason), 'a spectator answer is refused');

const outcome = await Promise.all([annRun, benRun]);
await host.until((m) => m.type === 'room' && m.room.status === 'over', 'the game to end', 600000);

console.log('after');
const serverRec = engine.records().map((r) => [r.a, r.h ? 1 : 0, r.t]);
const serverRecHash = sha(JSON.stringify(serverRec));
const serverState = sha(JSON.stringify(S));
check(engine.over() && !engine.error(), 'the server finished the game without an error');
check(serverRec.some((r) => r[1] === 0), 'the bot seat answers were recorded by the server');

for (const { exit, result } of outcome) {
  check(exit === 0 && result.ok, `${result.seat ? `seat ${result.seat}` : 'a client'} finished the game (${result.reason || 'ok'})`);
  check(result.rec === serverRecHash && result.n === serverRec.length, `${result.seat} replayed the same record as the server`);
  check(result.state === serverState, `${result.seat} ended in the same state as the server`);
}
check(outcome[0].result.probeRefused === true, 'the bad answer from a player was refused');

const again = socket();
await again.opened;
again.send({ type: 'hello', code, token: hostToken });
const full = await again.until((m) => m.type === 'game', 'the full record on reconnect');
check(full.rec.length === serverRec.length, 'a reconnect gets the whole record back');

const liar = socket();
await liar.opened;
liar.send({ type: 'hello', code, token: 'not-a-token' });
const badToken = await liar.until((m) => m.type === 'error', 'the refusal of a bad token');
check(badToken.fatal === true, 'a bad token is refused');

for (const ws of sockets) ws.close();
await app.close();
console.log(`${fails.length} failures`);
for (const f of fails.slice(0, 15)) console.log('FAIL', f);
process.exitCode = fails.length ? 1 : 0;
