// HTTP and WebSocket front of the co-op server. Lobby commands that have no room yet (create, join, peek) are JSON
// over HTTP. Everything that happens inside a room goes over the WebSocket at /ws. Both go through the rooms module.

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { CmdError } from './rooms.mjs';

const MAX_BODY = 16 * 1024;
const MAX_FRAME = 64 * 1024;
const PING_MS = 30000;
const ROOM_PATH = /^\/api\/rooms\/([^/]+)$/;
const JOIN_PATH = /^\/api\/rooms\/([^/]+)\/join$/;

export function createApp({ rooms, store, origins = [], log = console.error }) {
  const allowed = new Set(origins);

  function cors(req, res) {
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('Vary', 'Origin');
  }

  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  /** the request body as an object; an oversized or malformed body is a CmdError */
  function readJson(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let tooBig = false;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) tooBig = true;
        else chunks.push(c);
      });
      req.on('error', reject);
      req.on('end', () => {
        if (tooBig) return reject(new CmdError('Dữ liệu quá lớn.', 413));
        if (!chunks.length) return resolve({});
        let v;
        try {
          v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return reject(new CmdError('Dữ liệu không đọc được.'));
        }
        if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(new CmdError('Dữ liệu không đúng dạng.'));
        resolve(v);
      });
    });
  }

  async function route(req, res, path) {
    if (req.method === 'GET' && path === '/healthz') return send(res, 200, { ok: true, store: store.kind });
    if (req.method === 'POST' && path === '/api/rooms') return send(res, 200, await rooms.create(await readJson(req)));
    const room = path.match(ROOM_PATH);
    if (req.method === 'GET' && room) return send(res, 200, await rooms.peek(room[1]));
    const join = path.match(JOIN_PATH);
    if (req.method === 'POST' && join) return send(res, 200, await rooms.join(join[1], await readJson(req)));
    send(res, 404, { reason: 'Không có trang này.' });
  }

  async function handler(req, res) {
    cors(req, res);
    const path = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    try {
      await route(req, res, path);
    } catch (e) {
      if (e instanceof CmdError) return send(res, e.status, { reason: e.message });
      log('request failed', req.method, path, e);
      send(res, 500, { reason: 'Lỗi máy chủ, thử lại sau.' });
    }
  }

  // WEBSOCKET ----------------------------------------------------------------------------------------------
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });

  wss.on('connection', (ws) => {
    const conn = {
      code: null,
      memberId: null,
      send(msg) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
    };
    ws.alive = true;
    ws.on('pong', () => {
      ws.alive = true;
    });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return conn.send({ type: 'error', reason: 'Lệnh không đọc được.' });
      }
      rooms.handle(conn, msg);
    });
    ws.on('close', () => rooms.disconnect(conn));
    ws.on('error', (e) => log('socket error', e.message));
  });

  // a socket that stopped answering pings is dropped, so that its seat shows as offline
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, PING_MS);

  const server = createServer(handler);
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    // browsers always send Origin, so a missing one means a non-browser client (tests, tools)
    const ok = new URL(req.url, 'http://localhost').pathname === '/ws' && (!origin || allowed.has(origin));
    if (!ok) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  return {
    server,
    close() {
      clearInterval(beat);
      for (const ws of wss.clients) ws.terminate();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
