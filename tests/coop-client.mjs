// One human seat of a co-op test game, run as its own process. It replays the game on its own copy of the engine, the
// way a browser does, and answers its own questions with the bot's choice. Usage:
//   node tests/coop-client.mjs <port> <code> <token> <seat> [probe]
// With "probe" it first sends one wrong answer, which the server must refuse. Prints one JSON line when the game is over
// (or on failure) and exits 0 only when the game ended cleanly.

import { createHash } from 'node:crypto';
import { S } from '../src/engine/state.js';
import { Game } from '../src/engine/game.js';
import { Bot } from '../src/engine/bot.js';

const [port, code, token, seat, flag] = process.argv.slice(2);
const wantProbe = flag === 'probe';
const sha = (s) => createHash('sha256').update(s).digest('hex');

const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
let finished = false;
let started = false;
let claimed = false;
let rejects = 0;
let probeSent = false;
let probeRefused = false;
let decided = null; // { pr, a }: the answer for the prompt object it was made for, so it is decided once

function finish(ok, extra = {}) {
  if (finished) return;
  finished = true;
  console.log(JSON.stringify({ ok, seat, ...extra }));
  process.exitCode = ok ? 0 : 1;
  ws.close();
}

Game.speed = 0;
Game.on(() => {
  if (finished) return;
  if (Game.error) return finish(false, { reason: String(Game.error) });
  if (Game.over) {
    const rec = Game.rec.map((r) => [r.a, r.h ? 1 : 0, r.t]);
    return finish(true, { n: rec.length, human: rec.filter((r) => r[1]).length, rec: sha(JSON.stringify(rec)), state: sha(JSON.stringify(S)), rejects, probeRefused });
  }
  const pr = Game.prompt;
  if (!pr) return;
  if (wantProbe && !probeSent) {
    probeSent = true;
    ws.send(JSON.stringify({ type: 'answer', n: Game.rec.length, a: 'nope' }));
  }
  if (!decided || decided.pr !== pr) decided = { pr, a: Bot.decide(pr) };
  Game.answer(decided.a);
});

ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', code, token })));
ws.addEventListener('error', () => finish(false, { reason: 'socket error' }));
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.type === 'room') {
    if (claimed) return;
    claimed = true;
    ws.send(JSON.stringify({ type: 'claim', seat }));
  } else if (m.type === 'game') {
    if (!started) {
      started = true;
      Game.attach({ seat, send: (n, a) => ws.send(JSON.stringify({ type: 'answer', n, a })) }, m.setup, m.rec);
    } else {
      Game.feed(0, m.rec);
    }
  } else if (m.type === 'entries') {
    if (!Game.feed(m.from, m.list)) finish(false, { reason: 'gap in the record' });
  } else if (m.type === 'reject') {
    if (probeSent && !probeRefused) {
      probeRefused = true;
      return;
    }
    rejects++;
    if (rejects > 20) return finish(false, { reason: 'too many refusals: ' + m.reason });
    Game.reject();
  } else if (m.type === 'error') {
    finish(false, { reason: m.reason });
  }
});
