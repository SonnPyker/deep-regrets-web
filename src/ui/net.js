// Connection to the co-op server: REST for the lobby (create, join, peek) and one WebSocket per room that says hello
// again on every (re)connect. The server URL is set at build time (DR_API_URL, see build.mjs).

const API = __DR_API__;

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Không kết nối được máy chủ phòng chơi. Kiểm tra mạng rồi thử lại.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) throw new Error((data && data.reason) || `Lỗi ${res.status}.`);
  return data;
}

export const createRoom = (opts) => call('POST', '/api/rooms', opts);
export const joinRoom = (code, name) => call('POST', `/api/rooms/${encodeURIComponent(code)}/join`, { name });
export const peekRoom = (code) => call('GET', `/api/rooms/${encodeURIComponent(code)}`);

/**
 * One room connection. onMessage gets every server message; onState gets 'open' or 'closed'.
 * A dropped socket is reopened by itself with a growing pause, until close() is called.
 */
export function openRoom({ code, token, onMessage, onState }) {
  const url = API.replace(/^http/, 'ws') + '/ws';
  let ws = null;
  let closed = false;
  let tries = 0;
  let timer = null;

  function connect() {
    ws = new WebSocket(url);
    ws.onopen = () => {
      tries = 0;
      onState('open');
      ws.send(JSON.stringify({ type: 'hello', code, token }));
    };
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      onMessage(m);
    };
    ws.onclose = () => {
      ws = null;
      if (closed) return;
      onState('closed');
      timer = setTimeout(connect, Math.min(15000, 500 * 2 ** tries++));
    };
  }
  connect();

  return {
    /** false when the socket is not open now (the caller keeps the answer and sends it again later) */
    send(msg) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    close() {
      closed = true;
      clearTimeout(timer);
      if (ws) ws.close();
    },
  };
}
