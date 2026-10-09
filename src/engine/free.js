// Free actions: eat Fish, Dinks, items, reels, special cards. Each entry is { k, label, grp, ref, run }.

import { S } from './state.js';
import { U } from './util.js';
import { Log, Ask, Rl, Dc, ROMAN } from './core.js';
import { D, A } from './data.js';
import { Fx } from './fx.js';

function discardDink(p, id) {
  U.rm(p.dinks, id);
  S.dk.push(id);
}
function discardSupply(p, id) {
  U.rm(p.items, id);
  S.sd.push(id);
}
const hasFlag = (p, flag) => p.hand.some((id) => D.fish[id][flag]);

/** biggest-regret tier from a number of Regret cards: 1 = none, 2 = 1-6, 3 = 7-12, 4 = 13+ */
export const bigTier = (n) => (n === 0 ? 1 : n <= 6 ? 2 : n <= 12 ? 3 : 4);

export const Free = {
  /** turn a free-action entry into a prompt option */
  opt(id, fa, grp) {
    return Object.assign({ id, label: fa.label, grp: fa.grp || grp || 'Hành động tự do', k: fa.k }, fa.ref || {});
  },

  async eat(me, id) {
    const f = D.fish[id];
    Fx.discardFromHand(me, id);
    Log.say(me, `ăn ${f.n}.`);
    await A.run(f.E, { me, id, eating: true });
  },

  async useReel(me) {
    const p = S.P[me];
    const r = D.reel[p.reelE];
    let used = false;
    if (r.kind === 'rr') {
      const fr = Dc.fresh(p);
      const items = fr.map((d) => ({ id: d, label: Dc.label(d), die: d }));
      const ch = await Ask.multi(me, r.k >= 99 ? 'Reroll những xúc xắc Fresh nào?' : `Reroll tối đa ${r.k} xúc xắc Fresh`, items, {
        min: 1,
        max: Math.min(r.k, fr.length),
        tag: 'dice',
        auto: () => {
          const o = [];
          fr.forEach((d, i) => {
            if (d.v < Dc.mean(d.k) && o.length < r.k) o.push(i);
          });
          return o;
        },
        autoLabel: 'Các viên dưới trung bình',
        cancel: 'Quay lại',
      });
      if (ch) {
        for (const d of ch) {
          const o = d.v;
          d.v = Dc.roll(d.k);
          Log.say(me, `reroll ${Dc.NAME[d.k]} (${o} → ${d.v}).`);
        }
        used = true;
      }
    } else if (r.kind === 'max') {
      used = await Fx.setHighest(me, r.k);
    } else if (r.kind === 'dep') {
      p.dep = r.to;
      Log.say(me, `đặt thuyền xuống Depth ${ROMAN[r.to - 1]} (${r.n}).`);
      used = true;
    } else if (r.kind === 'down') {
      Fx.boatDown(me, 1);
      used = true;
    } else if (r.kind === 'fort') {
      for (const d of Dc.fresh(p)) {
        let n = 0;
        do {
          d.v = Dc.roll(d.k);
          n++;
        } while (!(d.v > 1 || n > 60));
      }
      Log.say(me, 'reroll mọi xúc xắc Fresh cho đến khi mỗi viên > 1 (Reel of Fortune).');
      used = true;
    }
    if (used) p.dy.reel = true;
  },

  /**
   * ctx.kind: 'sea' | 'port' | 'pay'. Returns entries {k,label,grp,ref,run}; k is a stable kind tag
   * ('eat','dinkDis','dinkDraw','dinkDiff','sup','supDiff','cloche','lp','reel','big','skull','coffin','sinkers').
   */
  list(me, ctx) {
    const p = S.P[me];
    const L = [];
    const add = (k, label, run, ref, grp) => L.push({ k, label, run, ref, grp });
    const solo = S.mode === 'solo';

    // eat Fish
    if (!solo) {
      for (const id of p.hand) {
        const f = D.fish[id];
        if (f.E) add('eat', `Ăn ${f.n}: ${A.txt(f.E)}`, () => Free.eat(me, id), { fish: id });
      }
    }

    // Dinks
    for (const id of p.dinks) {
      const dk = D.dink[id];
      if (dk.dis) {
        if (p.reg.length > 0) {
          add(
            'dinkDis',
            `Dink - ${dk.n}: bỏ ${dk.dis} Regret`,
            async () => {
              discardDink(p, id);
              await Fx.disc(me, dk.dis, false);
            },
            { dink: id },
          );
        }
      } else if (dk.draw) {
        add(
          'dinkDraw',
          `Dink - ${dk.n}: rút ${dk.draw} Regret`,
          async () => {
            discardDink(p, id);
            await Fx.draw(me, dk.draw);
          },
          { dink: id },
        );
      }
      if (dk.diff && ctx.kind === 'pay') {
        add(
          'dinkDiff',
          `Dink - ${dk.n}: Difficulty -${dk.diff}`,
          () => {
            discardDink(p, id);
            ctx.c.mods = (ctx.c.mods || 0) + dk.diff;
            Log.say(me, `dùng ${dk.n} (Difficulty -${dk.diff}).`);
          },
          { dink: id, n: dk.diff },
        );
      }
    }

    // Supply items
    for (const id of p.items) {
      const s = D.sup[id];
      let usable = true;
      if (s.diff && ctx.kind !== 'pay') usable = false;
      if (s.port && ctx.kind !== 'port') usable = false;
      if (s.sea && p.loc !== 'sea') usable = false;
      if (s.cloche) {
        usable = false;
        if (!p.cloche) {
          const smalls = p.hand.some((h) => D.fish[h].s === 's' && Rl.sellable(h));
          if (smalls) add('cloche', 'Supply - Cloche: Mount 1 Fish nhỏ lên đó (slot ×2, vĩnh viễn)', () => Free.cloche(me, id), { sup: id });
        }
      }
      if (usable) {
        add(
          s.diff ? 'supDiff' : 'sup',
          `Supply - ${s.n}: ${s.t}`,
          async () => {
            discardSupply(p, id);
            Log.say(me, `dùng ${s.n}.`);
            if (s.diff) ctx.c.mods = (ctx.c.mods || 0) + s.diff;
            await s.f({ me, ctx });
          },
          { sup: id, n: s.diff || 0 },
        );
      }
    }

    // Life Preserver (at Port it is spent in the shop instead)
    if (S.lp === me && ctx.kind === 'pay') {
      add('lp', 'Bỏ Life Preserver: Difficulty -2', () => {
        S.lp = false;
        ctx.c.mods = (ctx.c.mods || 0) + 2;
        Log.say(me, 'ném Life Preserver đi (Difficulty -2).');
      });
    }

    // Reel ability (once per day)
    if (p.reelE !== false && !p.dy.reel) {
      const r = D.reel[p.reelE];
      let ok = false;
      if (r.kind === 'rr' || r.kind === 'max' || r.kind === 'fort') ok = Dc.freshN(p) > 0;
      else if (r.kind === 'dep') ok = p.loc === 'sea' && p.dep !== r.to;
      else if (r.kind === 'down') ok = p.loc === 'sea' && p.dep < 3;
      if (ok) add('reel', `Reel - ${r.n}: ${r.t}`, () => Free.useReel(me), { reel: p.reelE });
    }

    // Biggest Regret (expansion): tier is fixed at the start of each Day
    if (S.opt.big && p.big !== false && !p.dy.big) {
      const bg = D.big[p.big];
      const t = p.dy.bt || bigTier(p.reg.length);
      add(
        'big',
        `Biggest Regret (${bg.n}): ${A.txt(bg.tiers[t])}`,
        async () => {
          p.dy.big = true;
          await A.run(bg.tiers[t], { me });
        },
        { big: p.big },
      );
    }

    // Whispering Skull / Iron Coffin
    if (hasFlag(p, 'skull') && !p.dy.skull) {
      add('skull', 'Whispering Skull: xem lén 1 Fish (1 lần mỗi lượt)', async () => {
        p.dy.skull = true;
        await Fx.peekAny(me, 1);
      });
    }
    if (hasFlag(p, 'coffin') && p.reg.length > 0 && S.order.length > 1) {
      add('coffin', 'Iron Coffin: đưa tối đa 2 Regret cho người khác (họ có thể Refresh 1 xúc xắc)', () => Free.coffin(me));
    }

    // Drop sinkers
    if (ctx.kind === 'sea' && p.dep < 3 && Dc.freshN(p) > 0) {
      add('sinkers', `Thả chì: dùng 1 xúc xắc để xuống Depth ${ROMAN[p.dep]}`, () => Free.sinkers(me), null, 'Thuyền');
    }
    return L;
  },

  async sinkers(me) {
    const p = S.P[me];
    const fr = Dc.fresh(p);
    if (p.dep >= 3 || fr.length === 0) return;
    let d = fr[0];
    for (const x of fr) if (x.v < d.v) d = x;
    const distinct = fr.some((x) => x.v !== d.v || x.k !== d.k);
    if (distinct) {
      const o2 = fr.map((x, i) => ({ id: i, label: Dc.label(x), die: x }));
      o2.push({ id: 'no', label: 'Hủy' });
      const k = await Ask.pick(me, 'Thả chì: dùng xúc xắc nào?', o2, { tag: 'spendDie' });
      if (k === 'no' || k === null) return;
      d = fr[k];
    }
    Dc.spend(p, d);
    p.dep += 1;
    Log.say(me, `thả chì (dùng 1 xúc xắc) và chìm xuống Depth ${ROMAN[p.dep - 1]}.`);
  },

  async cloche(me, itemId) {
    const p = S.P[me];
    const opts = [];
    for (const h of p.hand) {
      if (D.fish[h].s === 's' && Rl.sellable(h)) opts.push({ id: h, label: `${D.fish[h].n} (giá trị ${Rl.val(p, h)})`, fish: h });
    }
    opts.push({ id: 'no', label: 'Hủy' });
    const r = await Ask.pick(me, 'Mount Fish nhỏ nào lên Cloche?', opts, { tag: 'cloche' });
    if (r === 'no' || r === null) return;
    Fx.leaveHand(me, r);
    p.clo = r;
    p.cloche = true;
    discardSupply(p, itemId);
    Log.say(me, `Mount ${D.fish[r].n} lên Cloche.`);
  },

  async coffin(me) {
    const p = S.P[me];
    const to = await Fx.chooseOther(me, 'Đưa Regret cho ai?');
    if (!to) return;
    const o2 = [{ id: 1, label: 'Đưa 1 Regret' }];
    if (p.reg.length >= 2) o2.push({ id: 2, label: 'Đưa 2 Regret' });
    o2.push({ id: 0, label: 'Hủy' });
    const n = await Ask.pick(me, 'Iron Coffin', o2, { tag: 'coffin' });
    if (!n) return;
    const ok = await Ask.yn(to, `${Log.nm(me)} đưa bạn ${n} Regret. Nhận và Refresh một xúc xắc?`, [], 'Nhận', 'Từ chối');
    if (ok) {
      const m = Fx.moveRegrets(me, to, n, false);
      Log.say(to, `nhận ${m} Regret từ ${Log.nm(me)} và Refresh một xúc xắc.`);
      Fx.ref(to, 1);
    } else {
      Log.say(to, 'từ chối lời đề nghị.');
    }
  },
};
