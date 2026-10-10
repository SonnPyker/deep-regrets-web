// Ocean Survey: the sheet that carries a solo campaign from one game (week) to the next.
// The rules live here: what a finished week adds to the sheet, what can be unlocked and at what cost, and what the
// next game starts with. Pure data and functions, no DOM and no storage (the UI keeps the sheet between sessions).

import { D } from './data.js';
import { SOLO_REMOVED } from './setup.js';

/** the sheet's unlock list with the printed cost. key = kind:id (a tackle die is keyed by its colour) */
export const OFFER = [
  { kind: 'tackle', id: 'b', cost: 20 },
  { kind: 'tackle', id: 'g', cost: 40 },
  { kind: 'tackle', id: 'o', cost: 80 },
  { kind: 'rod', id: 6, cost: 10 },
  { kind: 'rod', id: 7, cost: 16 },
  { kind: 'rod', id: 1, cost: 20 },
  { kind: 'rod', id: 9, cost: 26 },
  { kind: 'rod', id: 4, cost: 30 },
  { kind: 'rod', id: 5, cost: 36 },
  { kind: 'rod', id: 2, cost: 50 },
  { kind: 'rod', id: 8, cost: 60 },
  { kind: 'rod', id: 0, cost: 80 },
  { kind: 'reel', id: 0, cost: 10 },
  { kind: 'reel', id: 9, cost: 20 },
  { kind: 'reel', id: 8, cost: 25 },
  { kind: 'reel', id: 6, cost: 30 },
  { kind: 'reel', id: 3, cost: 40 },
  { kind: 'reel', id: 4, cost: 70 },
  { kind: 'sup', id: 16, cost: 9 },
  { kind: 'sup', id: 5, cost: 19 },
  { kind: 'sup', id: 2, cost: 29 },
  { kind: 'sup', id: 6, cost: 7 },
  { kind: 'sup', id: 1, cost: 11 },
  { kind: 'sup', id: 8, cost: 13 },
  { kind: 'sup', id: 11, cost: 19 },
  { kind: 'sup', id: 9, cost: 23 },
  { kind: 'sup', id: 14, cost: 5 },
  { kind: 'sup', id: 3, cost: 15 },
].map((o) => ({ ...o, key: `${o.kind}:${o.id}` }));

const OFFER_BY_KEY = new Map(OFFER.map((o) => [o.key, o]));

/** every Fish with a slot on the sheet: the base game, depths I-III (Lamentable Tentacles Fish have none) */
export const SHEET = Object.values(D.fish)
  .filter((f) => f && !f.tent && f.d >= 1 && f.d <= 3)
  .map((f) => f.id)
  .sort((a, b) => a - b);

export const offerOf = (key) => OFFER_BY_KEY.get(key) || null;

export function offerName(o) {
  if (o.kind === 'tackle') return { b: 'Xúc xắc Blue', g: 'Xúc xắc Green', o: 'Xúc xắc Orange' }[o.id];
  const pile = o.kind === 'rod' ? D.rod : o.kind === 'reel' ? D.reel : D.sup;
  return pile[o.id].n;
}

/** a fresh sheet: the Fish removed from the solo Sea are already checked, nothing is unlocked, no week is played */
export function newSurvey() {
  return { v: 1, weeks: 0, checked: SOLO_REMOVED.slice(), owned: [], pending: null };
}

/** the sheet as it was saved; anything unreadable starts a fresh sheet */
export function readSurvey(raw) {
  if (!raw || raw.v !== 1 || !Array.isArray(raw.checked) || !Array.isArray(raw.owned)) return newSurvey();
  const sv = newSurvey();
  sv.weeks = Number.isInteger(raw.weeks) && raw.weeks >= 0 ? raw.weeks : 0;
  sv.checked = [...new Set([...sv.checked, ...raw.checked.filter(Number.isInteger)])];
  sv.owned = [...new Set(raw.owned.filter((k) => OFFER_BY_KEY.has(k)))];
  const p = raw.pending;
  if (p && Array.isArray(p.kept)) {
    sv.pending = {
      kept: p.kept.filter(Number.isInteger),
      total: Number.isFinite(p.total) ? p.total : 0,
      disc: Number.isFinite(p.disc) ? p.disc : 0,
    };
  }
  return sv;
}

/** a finished week: the Fish brought to Port, their total Value and the Dink discount held at the end */
export function pendingOf(res) {
  return { kept: res.kept.map((k) => k.id), total: res.total, disc: res.disc || 0 };
}

/** a finished game becomes the pending week. A week that is already waiting to be settled is kept as it is,
 *  so a reload that replays the same game does not record it twice. */
export function record(sv, res) {
  if (sv.pending) return sv;
  return { ...sv, pending: pendingOf(res) };
}

/** the value to spend this week: the Value brought to Port plus the Dink discounts, pooled */
export function budget(sv) {
  return sv.pending ? sv.pending.total + sv.pending.disc : 0;
}

/** price a basket of offers. ok is false when an offer is unknown, repeated, already owned, or the basket costs more than the budget. */
export function quote(sv, keys) {
  const owned = new Set(sv.owned);
  const seen = new Set();
  let cost = 0;
  for (const key of keys) {
    const o = OFFER_BY_KEY.get(key);
    if (!o) return { ok: false, cost, budget: budget(sv), msg: 'Không có trang bị này trên Survey.' };
    if (seen.has(key)) return { ok: false, cost, budget: budget(sv), msg: 'Mỗi trang bị chỉ mở khóa một lần.' };
    if (owned.has(key)) return { ok: false, cost, budget: budget(sv), msg: `${offerName(o)} đã được mở khóa.` };
    seen.add(key);
    cost += o.cost;
  }
  const b = budget(sv);
  if (cost > b) return { ok: false, cost, budget: b, msg: `Cần ${cost} điểm, chỉ còn ${b}.` };
  return { ok: true, cost, budget: b, left: b - cost, msg: '' };
}

/** settle the pending week: its Fish join the sheet, the chosen equipment is unlocked, and unspent value is lost */
export function settle(sv, keys) {
  if (!sv.pending) return { ok: false, msg: 'Chưa có tuần nào để ghi vào Survey.' };
  const q = quote(sv, keys);
  if (!q.ok) return q;
  const next = {
    ...sv,
    weeks: sv.weeks + 1,
    checked: [...new Set([...sv.checked, ...sv.pending.kept])],
    owned: [...sv.owned, ...keys],
    pending: null,
  };
  return { ok: true, sv: next, cost: q.cost, left: q.left, msg: '' };
}

/** the equipment a game starts with (the solo setup's opts.kit) */
export function kitOf(sv) {
  const kit = { dice: [], rods: [], reels: [], sups: [] };
  for (const key of sv.owned) {
    const [kind, id] = key.split(':');
    if (kind === 'tackle') kit.dice.push(id);
    else if (kind === 'rod') kit.rods.push(Number(id));
    else if (kind === 'reel') kit.reels.push(Number(id));
    else if (kind === 'sup') kit.sups.push(Number(id));
  }
  return kit;
}

/** how much of the sheet is filled in */
export function progress(sv) {
  const got = new Set(sv.checked);
  const done = SHEET.filter((id) => got.has(id)).length;
  return { done, total: SHEET.length, complete: done === SHEET.length, unlocked: sv.owned.length, offers: OFFER.length };
}
