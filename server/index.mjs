// Entry point of the co-op server: `node server/index.mjs`. Environment:
//   PORT                                      default 8787 (Render sets it)
//   ALLOWED_ORIGINS                           comma-separated web origins, e.g. https://deep-regret.vercel.app
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   without them rooms are kept in memory and end with the process

import { createStore } from './store.mjs';
import { createRooms } from './rooms.mjs';
import { createApp } from './app.mjs';

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const env = process.env;
const origins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : DEV_ORIGINS;
const port = Number(env.PORT) || 8787;

const store = createStore(env);
if (store.kind === 'memory') console.warn('[co-op] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: rooms live in memory and are lost on restart.');
if (!env.ALLOWED_ORIGINS) console.warn('[co-op] ALLOWED_ORIGINS not set: only the local dev origins are accepted.');

const rooms = createRooms({ store });
const app = createApp({ rooms, store, origins });
app.server.listen(port, () => console.log(`[co-op] listening on ${port}, store: ${store.kind}`));

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    app.close().then(() => process.exit(0));
  });
}
