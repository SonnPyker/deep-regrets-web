// Port: making port, selling, shopping, mounting.

import { S } from './state.js';
import { U } from './util.js';
import { Log, Ask, Rl, Dc } from './core.js';
import { D } from './data.js';
import { Fx } from './fx.js';
import { Fl } from './flow.js';

export const SHOPS = ['rod', 'reel', 'sup', 'dice'];
export const SHOPNAME = { rod: 'Tiệm Rod', reel: 'Tiệm Reel', sup: 'Tiệm Supply', dice: 'Tiệm xúc xắc Tackle' };
export const PRICE = [1, 3, 5];
export const DESC = {
  rod: ['lấy 1 Rod trên cùng', 'rút 3 Rod, giữ 1', 'rút 5 Rod, giữ 2'],
  reel: ['lấy 1 Reel trên cùng', 'rút 3 Reel, giữ 1', 'rút 5 Reel, giữ 2'],
  sup: ['lấy 1 lá Supply trên cùng', 'rút 3 Supply, giữ 2', 'rút 5 Supply, giữ 3'],
  dice: ['lấy 1 xúc xắc Tackle', 'lấy 2 xúc xắc Tackle', 'lấy 3 xúc xắc Tackle'],
};
const DRAW = { rod: [1, 3, 5], reel: [1, 3, 5], sup: [1, 3, 5], dice: [1, 2, 3] };
const KEEP = { rod: [1, 1, 2], reel: [1, 1, 2], sup: [1, 2, 3] };

const deckOf = (key) => (key === 'rod' ? S.rod : key === 'reel' ? S.reel : key === 'sup' ? S.sd : null);

const itemLabel = (key, id) => (key === 'rod' ? `${D.rod[id].n} - ${D.rod[id].t}` : key === 'reel' ? `${D.reel[id].n} - ${D.reel[id].t}` : `${D.sup[id].n} - ${D.sup[id].t}`);
const itemRef = (key, id) => ({ [key === 'sup' ? 'sup' : key]: id });

export const Po = {
  // MAKE PORT -----------------------------------------------------------------------------------
  async make(me, how) {
    const p = S.P[me];
    p.loc = 'port';
    p.dep = 1;
    Log.say(me, how === 'lifeboat' ? 'lật Lifeboat và Make Port!' : 'Make Port.');
    await Fl.muster(me);
    if (S.mode !== 'solo' && !p.worms) {
      p.worms = true;
      Log.say(me, 'lật Can of Worms ngửa.');
    }
    if (p.reg.length > 0) {
      const ok = await Ask.yn(
        me,
        'Make Port: bỏ 1 lá Regret?',
        [`Bạn đang có ${p.reg.length} lá Regret. Lá bị bỏ là lá có giá trị cao nhất.`],
        'Bỏ 1 lá',
        'Giữ nguyên',
      );
      if (ok) await Fx.disc(me, 1, false);
    }
    await Po.autoMount(me);
  },

  /** fish that must be mounted when you Make Port (Overmind) */
  async autoMount(me) {
    const p = S.P[me];
    for (const id of U.copy(p.hand)) {
      if (D.fish[id].must) {
        const empty = [];
        for (let i = 1; i <= 3; i++) if (!p.mount[i - 1]) empty.push(i);
        if (empty.length > 0) {
          let slot = empty[0];
          if (empty.length > 1) {
            const o2 = empty.map((i) => ({ id: i, label: `Slot ${i} (×${Rl.mountMult(i)})` }));
            slot = (await Ask.pick(me, `${D.fish[id].n} buộc phải Mount. Slot nào?`, o2, { tag: 'slot', show: [{ t: 'fish', id }] })) || slot;
          }
          Fx.leaveHand(me, id);
          p.mount[slot - 1] = id;
          Log.say(me, `bị buộc Mount ${D.fish[id].n} vào slot ${slot}.`);
        }
      }
    }
  },

  // SELL ------------------------------------------------------------------------------------------
  /** returns true if something was sold (counts as the action) */
  async sell(me) {
    const p = S.P[me];
    const items = [];
    for (const id of p.hand) {
      if (Rl.sellable(id)) {
        const f = D.fish[id];
        items.push({ id, label: `${f.n} (${f.foul ? 'Foul' : 'Fair'}, bán được ${Rl.val(p, id)}$)`, fish: id });
      }
    }
    if (items.length === 0) {
      await Ask.ok(me, 'Bán Fish', ['Bạn không có Fish nào bán được.'], 'Quay lại');
      return false;
    }
    const ch = await Ask.multi(me, 'Bán những Fish nào?', items, {
      min: 1,
      cancel: 'Quay lại',
      okLabel: 'Bán',
      tag: 'sell',
      ok: (sel) => {
        let total = 0;
        let foul = 0;
        for (const id of sel) {
          total += Rl.val(p, id);
          if (D.fish[id].foul) foul++;
        }
        const lost = Math.max(0, p.bucks + total - 10);
        let msg = `Tổng ${total}$ (bạn có ${p.bucks}$, tối đa 10$${lost > 0 ? `, mất ${lost}$` : ''})`;
        if (foul > 0) msg += ` - ${foul} Foul Fish: bạn sẽ rút ${foul} Regret`;
        return { ok: true, msg };
      },
      auto: () => {
        const r = [];
        items.forEach((it, i) => {
          if (!D.fish[it.id].foul) r.push(i);
        });
        return r;
      },
      autoLabel: 'Chọn mọi Fair Fish',
    });
    if (!ch) return false;
    let total = 0;
    let foul = 0;
    const names = [];
    for (const id of ch) {
      total += Rl.val(p, id);
      if (D.fish[id].foul) foul++;
      names.push(D.fish[id].n);
    }
    for (const id of ch) Fx.discardFromHand(me, id);
    Log.say(me, `bán ${names.join(', ')} (${total}$).`);
    Fx.gain(me, total);
    for (let i = 0; i < foul; i++) await Fx.draw(me, 1);
    return true;
  },

  // SHOP --------------------------------------------------------------------------------------------
  discounts(me) {
    const p = S.P[me];
    const L = [];
    if (S.lp === me) L.push({ kind: 'lp', label: 'Life Preserver (-2$)', amt: 2 });
    for (const id of p.dinks) {
      const dk = D.dink[id];
      if (dk.shop) L.push({ kind: 'dink', id, label: `Dink: ${dk.n} (-${dk.shop}$)`, amt: dk.shop, dink: id });
    }
    return L;
  },

  shopAvail(me, key) {
    const p = S.P[me];
    if (U.has(p.dy.shops, key)) return [false, 'hôm nay đã ghé'];
    if (key === 'dice') {
      if (Dc.bagCount() === 0) return [false, 'hết xúc xắc Tackle trong túi'];
    } else if (deckOf(key).length === 0) {
      return [false, 'hết bài'];
    }
    return [true];
  },

  async doShop(me, key, tier) {
    const p = S.P[me];
    const n = DRAW[key][tier - 1];
    p.dy.shops.push(key);
    if (key === 'dice') {
      for (let i = 0; i < n; i++) {
        const k = Dc.bagDraw();
        if (!k) break;
        const d = Dc.gain(p, k, true);
        Log.say(me, `lấy một ${Dc.NAME[k]} và tung được ${d.v} (${d.fr ? 'Fresh' : 'Spent - hết chỗ'}).`);
      }
      return;
    }
    const deck = deckOf(key);
    const keepN = KEEP[key][tier - 1];
    const drawn = [];
    for (let i = 0; i < n; i++) if (deck.length > 0) drawn.push(deck.shift());
    if (drawn.length === 0) return;
    let keep = drawn;
    if (drawn.length > keepN) {
      const items = drawn.map((id) => ({ id, label: itemLabel(key, id), ...itemRef(key, id) }));
      keep =
        (await Ask.multi(me, `${SHOPNAME[key]}: giữ ${keepN} trong ${drawn.length} lá`, items, {
          min: keepN,
          max: keepN,
          okLabel: 'Giữ những lá này',
          tag: 'shopKeep',
        })) || [];
      if (keep.length !== keepN) keep = drawn.slice(0, keepN);
    }
    for (const id of drawn) {
      if (U.has(keep, id)) {
        if (key === 'rod') p.rods.push(id);
        else if (key === 'reel') p.reels.push(id);
        else p.items.push(id);
        Log.say(me, `mua ${key === 'rod' ? D.rod[id].n : key === 'reel' ? D.reel[id].n : 'một lá Supply'}.`);
      } else {
        deck.push(id);
      }
    }
    U.shuffle(deck);
  },

  /** returns true if a purchase was made (counts as the action) */
  async shop(me) {
    const p = S.P[me];
    const mad = Rl.mad(p);
    for (;;) {
      const disc = Po.discounts(me);
      let maxDisc = 0;
      for (const d of disc) maxDisc += d.amt;
      const info = [`Bạn có ${p.bucks}$.`];
      if (mad.disc > 0) info.push('Madness: mọi tiệm rẻ hơn 1$.');
      for (const d of disc) info.push(`Giảm giá có thể dùng: ${d.label}`);
      const opts = [];
      for (const key of SHOPS) {
        const [ok, why] = Po.shopAvail(me, key);
        let lab = SHOPNAME[key];
        if (!ok) lab += ` (${why})`;
        opts.push({ id: key, label: lab, dis: !ok, grp: 'Chọn tiệm', shop: key });
      }
      opts.push({ id: 'back', label: 'Quay lại', kind: 'cancel' });
      const key = await Ask.pick(me, 'Cửa hàng', opts, { info, cols: 2, tag: 'shop' });
      if (key === null || key === 'back') return false;

      let tierPick = null;
      for (;;) {
        const o2 = [];
        for (let t = 1; t <= 3; t++) {
          const base = Math.max(0, PRICE[t - 1] - mad.disc);
          o2.push({
            id: t,
            label: `$${base}${base !== PRICE[t - 1] ? ` (gốc ${PRICE[t - 1]})` : ''}: ${DESC[key][t - 1]}`,
            dis: base - maxDisc > p.bucks,
          });
        }
        o2.push({ id: 'back', label: 'Quay lại', kind: 'cancel' });
        const t = await Ask.pick(me, `${SHOPNAME[key]}: bạn trả bao nhiêu?`, o2, { info, tag: 'shopTier' });
        if (t === null || t === 'back') break;

        const base = Math.max(0, PRICE[t - 1] - mad.disc);
        let cost = base;
        const used = [];
        if (disc.length > 0 && base > 0) {
          const items = disc.map((d, i) => ({ id: i, label: d.label, ...(d.kind === 'dink' ? { dink: d.id } : {}) }));
          const init = [];
          if (base > p.bucks) {
            let sum = 0;
            disc.forEach((d, i) => {
              if (base - sum > p.bucks) {
                init.push(i);
                sum += d.amt;
              }
            });
          }
          const ch = await Ask.multi(me, `Trả ${base}$ - dùng giảm giá nào?`, items, {
            init,
            okLabel: 'Trả tiền',
            cancel: 'Quay lại',
            tag: 'discount',
            ok: (sel) => {
              let s = 0;
              for (const i of sel) s += disc[i].amt;
              const c = Math.max(0, base - s);
              return { ok: p.bucks >= c, msg: `Giá ${c}$ (bạn có ${p.bucks}$)` };
            },
          });
          if (ch) {
            let s = 0;
            for (const i of ch) {
              s += disc[i].amt;
              used.push(disc[i]);
            }
            cost = Math.max(0, base - s);
            tierPick = t;
          }
        } else {
          tierPick = t;
        }
        if (tierPick !== null) {
          for (const d of used) {
            if (d.kind === 'lp') S.lp = false;
            else {
              U.rm(p.dinks, d.id);
              S.dk.push(d.id);
            }
          }
          p.bucks -= cost;
          Log.say(me, `ghé ${SHOPNAME[key]} và trả ${cost}$${used.length > 0 ? ` (dùng ${used.length} giảm giá)` : ''}.`);
          await Po.doShop(me, key, tierPick);
          return true;
        }
      }
    }
  },

  // MOUNT ---------------------------------------------------------------------------------------------
  /** returns true if at least one Fish was mounted (counts as the action) */
  async mount(me) {
    const p = S.P[me];
    let mounted = 0;
    for (;;) {
      const empty = [];
      for (let i = 1; i <= 3; i++) if (!p.mount[i - 1]) empty.push(i);
      if (empty.length === 0) break;
      const opts = [];
      for (const id of p.hand) {
        if (Rl.sellable(id)) {
          opts.push({ id, label: `${D.fish[id].n} (${D.fish[id].foul ? 'Foul' : 'Fair'}, giá trị hiện tại ${Rl.val(p, id)})`, fish: id });
        }
      }
      if (opts.length === 0) break;
      opts.push({ id: 'done', label: mounted > 0 ? 'Xong' : 'Quay lại', kind: 'cancel' });
      const f = await Ask.pick(me, `Mount Fish nào? (còn ${empty.length} slot trống)`, opts, {
        info: ['Fish đã Mount được tính điểm nhân theo slot khi kết thúc game và không bao giờ di chuyển được nữa.'],
        tag: 'mount',
      });
      if (f === 'done' || f === null) break;
      const so = empty.map((i) => ({ id: i, label: `Slot ${i} (×${Rl.mountMult(i)}) = ${Rl.val(p, f) * Rl.mountMult(i)} điểm hiện tại`, slot: i }));
      so.push({ id: 'back', label: 'Quay lại', kind: 'cancel' });
      const s = await Ask.pick(me, `Slot nào cho ${D.fish[f].n}?`, so, { tag: 'slot', show: [{ t: 'fish', id: f }] });
      if (s !== null && s !== 'back') {
        Fx.leaveHand(me, f);
        p.mount[s - 1] = f;
        mounted++;
        Log.say(me, `Mount ${D.fish[f].n} vào slot ${s} (×${Rl.mountMult(s)}).`);
      }
    }
    return mounted > 0;
  },
};
