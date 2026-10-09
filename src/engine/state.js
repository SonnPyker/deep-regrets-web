// Authoritative game state. `S` is JSON-friendly and replaced *in place* so every module keeps a stable binding.
// `RT` is runtime-only (never serialised): prompt bookkeeping, the log shown in the UI, the driver, etc.

export const S = {};

export const RT = {
  pseq: 0,
  prompt: null,
  driver: null, // { ask(prompt) -> Promise<answer> }
  log: [], // [{ t, c, k, day }]
  logHook: null, // (entry) => void
  fly: null, // fish id currently "in transit" (tests only)
  lastDraw: {},
  coin: null,
  quiet: false,
};

export function setState(obj) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, obj);
}
