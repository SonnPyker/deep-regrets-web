// Where rooms live. memoryStore keeps them in this process (local play and tests); supabaseStore keeps them in
// Supabase through its REST API (service-role key, server side only). Both expose the same async interface.

const clone = (x) => structuredClone(x);

function duplicate() {
  const e = new Error('duplicate key');
  e.dup = true;
  return e;
}

export function memoryStore() {
  const rooms = new Map();
  const members = new Map();
  const answers = new Map();
  let seq = 0;
  return {
    kind: 'memory',
    async createRoom(room) {
      if (rooms.has(room.code)) throw duplicate();
      rooms.set(room.code, clone(room));
      answers.set(room.code, []);
    },
    async getRoom(code) {
      const r = rooms.get(code);
      return r ? clone(r) : null;
    },
    async updateRoom(code, patch) {
      Object.assign(rooms.get(code), clone(patch));
    },
    async listMembers(code) {
      return [...members.values()]
        .filter((m) => m.code === code)
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map(clone);
    },
    async addMember(m) {
      members.set(m.id, { ...clone(m), joinedAt: ++seq });
    },
    async updateMember(id, patch) {
      Object.assign(members.get(id), clone(patch));
    },
    async removeMember(id) {
      members.delete(id);
    },
    async listAnswers(code) {
      return clone(answers.get(code) || []);
    },
    async appendAnswers(code, list) {
      answers.get(code).push(...clone(list));
    },
  };
}

/** Supabase over PostgREST. Tables: rooms, room_members, room_answers (see supabase/schema.sql). */
export function supabaseStore({ url, key, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  async function rest(method, path, body, prefer) {
    const res = await fetchImpl(base + path, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const e = new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
      e.dup = res.status === 409 || text.includes('23505');
      throw e;
    }
    return text ? JSON.parse(text) : null;
  }
  const eq = (v) => `eq.${encodeURIComponent(v)}`;
  const roomOut = (r) => ({ code: r.code, status: r.status, players: r.players, colors: r.colors, seats: r.seats, opts: r.opts, setup: r.setup, createdAt: r.created_at });
  const memberOut = (m) => ({ id: m.id, code: m.room_code, hash: m.token_hash, name: m.name, seat: m.seat, host: m.host, joinedAt: m.joined_at });

  return {
    kind: 'supabase',
    async createRoom(room) {
      await rest(
        'POST',
        '/rooms',
        { code: room.code, status: room.status, players: room.players, colors: room.colors, seats: room.seats, opts: room.opts, setup: room.setup },
        'return=minimal',
      );
    },
    async getRoom(code) {
      const rows = await rest('GET', `/rooms?code=${eq(code)}&select=*`);
      return rows[0] ? roomOut(rows[0]) : null;
    },
    async updateRoom(code, patch) {
      await rest('PATCH', `/rooms?code=${eq(code)}`, patch, 'return=minimal');
    },
    async listMembers(code) {
      const rows = await rest('GET', `/room_members?room_code=${eq(code)}&order=joined_at.asc,id.asc&select=*`);
      return rows.map(memberOut);
    },
    async addMember(m) {
      await rest(
        'POST',
        '/room_members',
        { id: m.id, room_code: m.code, token_hash: m.hash, name: m.name, seat: m.seat, host: m.host },
        'return=minimal',
      );
    },
    async updateMember(id, patch) {
      const body = {};
      if ('seat' in patch) body.seat = patch.seat;
      if ('host' in patch) body.host = patch.host;
      await rest('PATCH', `/room_members?id=${eq(id)}`, body, 'return=minimal');
    },
    async removeMember(id) {
      await rest('DELETE', `/room_members?id=${eq(id)}`, undefined, 'return=minimal');
    },
    async listAnswers(code) {
      return rest('GET', `/room_answers?room_code=${eq(code)}&order=n.asc&select=n,a,h,t`);
    },
    async appendAnswers(code, list) {
      if (!list.length) return;
      await rest(
        'POST',
        '/room_answers',
        list.map((r) => ({ room_code: code, n: r.n, a: r.a, h: r.h, t: r.t })),
        'return=minimal',
      );
    },
  };
}

export function createStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return supabaseStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
  return memoryStore();
}
