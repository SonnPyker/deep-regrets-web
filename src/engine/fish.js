// The fishing action: cast, reveal, pay, catch.

import { S, RT } from './state.js';
import { U } from './util.js';
import { Log, Ask, Dc } from './core.js';
import { D, A } from './data.js';
import { Fx } from './fx.js';
import { Free } from './free.js';

const fishShow = (id) => ({ t: 'fish', id });

export const Fi = {
  /** difficulty of the Fish currently on the hook */
  diff(c) {
    const f = D.fish[c.id];
    const p = S.P[c.me];
    let d = c.dset !== undefined && c.dset !== null ? c.dset : f.df || 0;
    if (f.dyn) d += f.dyn(c, p);
    const rod = p.rodE !== false ? D.rod[p.rodE] : null;
    if (rod) {
      if (rod.all) d -= rod.all;
      if (rod.size && f.s === rod.size) d -= rod.red;
      if (rod.foul !== undefined && f.foul === rod.foul) d -= rod.red;
      if (rod.first && p.dy.first) d -= rod.first;
    }
    for (const id of p.hand) {
      const h = D.fish[id];
      if (h.dFoul && f.foul) d += h.dFoul;
      if (h.dFair && !f.foul) d += h.dFair;
    }
    d -= c.mods || 0;
    if (d < 0) d = 0;
    return d;
  },

  diffNote(c) {
    const f = D.fish[c.id];
    const p = S.P[c.me];
    const n = [];
    if (f.df !== null && f.df !== undefined) n.push(`in sẵn ${f.df}`);
    if (c.dset !== undefined && c.dset !== null) n.push(`đặt thành ${c.dset}`);
    if (f.dyn) n.push(f.dynTxt);
    if (p.rodE !== false) n.push(D.rod[p.rodE].n);
    if ((c.mods || 0) > 0) n.push(`-${c.mods} từ vật phẩm`);
    return n.join(', ');
  },

  /** cheapest selection of Fresh dice paying `diff` (exact = required die count); null when impossible */
  autoDice(p, diff, exact) {
    const fr = Dc.fresh(p);
    const n = fr.length;
    if (diff <= 0 && !exact) return [];
    const bone = p.reelE !== false && D.reel[p.reelE].kind === 'bone';
    let best = null;
    let bestCost = null;
    for (let mask = 0; mask < 2 ** n; mask++) {
      let sum = 0;
      let cnt = 0;
      let tk = 0;
      const sel = [];
      for (let i = 0; i < n; i++) {
        if ((mask >> i) & 1) {
          sum += fr[i].v;
          cnt++;
          if (Dc.tackle(fr[i].k)) tk++;
          sel.push(fr[i]);
        }
      }
      if (sum >= diff && ((!exact && cnt > 0) || cnt === exact)) {
        const cost = (sum - diff) * (bone ? 2 : 10) + cnt * 3 + tk * 4;
        if (bestCost === null || cost < bestCost) {
          best = sel;
          bestCost = cost;
        }
      }
    }
    return best;
  },

  canPay(p, diff, exact) {
    if (diff <= 0 && !exact) return true;
    return Fi.autoDice(p, diff, exact) !== null;
  },

  /** spend the selected dice towards `diff` (Bone Wheel keeps leftover points on the largest die) */
  spendPaid(me, sel, diff) {
    const p = S.P[me];
    if (sel.length === 0) return;
    const bone = p.reelE !== false && D.reel[p.reelE].kind === 'bone';
    const names = sel.map((d) => Dc.label(d));
    if (bone) {
      sel = U.sort(sel.slice(), (a, b) => a.v > b.v);
      const big = sel[0];
      let others = 0;
      for (let i = 1; i < sel.length; i++) others += sel[i].v;
      let keepBig = false;
      if (others >= diff) {
        keepBig = true;
      } else {
        const left = big.v - (diff - others);
        if (left > 0) {
          let best = null;
          for (const f of Dc.FACES[big.k]) if (f <= left && f > 0 && (best === null || f > best)) best = f;
          if (best !== null) {
            big.v = best;
            keepBig = true;
          }
        }
      }
      sel.forEach((d, i) => {
        if (!(i === 0 && keepBig)) Dc.spend(p, d);
      });
      Log.say(me, `trả bằng ${names.join(' + ')} (Bone Wheel giữ lại điểm thừa).`);
    } else {
      for (const d of sel) Dc.spend(p, d);
      Log.say(me, `trả bằng ${names.join(' + ')}.`);
    }
  },

  /** choose dice by hand; returns the die objects or null when cancelled */
  async pickDice(me, title, diff, exact) {
    const p = S.P[me];
    const fr = Dc.fresh(p);
    const items = fr.map((d) => ({ id: d, label: Dc.label(d), die: d }));
    return Ask.multi(me, title, items, {
      tag: 'payDice',
      ok: (sel) => {
        let sum = 0;
        for (const d of sel) sum += d.v;
        if (exact && sel.length !== exact) return { ok: false, msg: `Bạn phải dùng đúng ${exact} xúc xắc.` };
        if (sum < diff) return { ok: false, msg: `Tổng đã chọn ${sum} / cần ${diff}.` };
        if (sel.length === 0 && diff > 0) return { ok: false };
        return { ok: true, msg: `Tổng đã chọn ${sum} / cần ${diff}.` };
      },
      auto: () => {
        const a = Fi.autoDice(p, diff, exact) || [];
        const r = [];
        for (const d of a) fr.forEach((x, i) => x === d && r.push(i));
        return r;
      },
      autoLabel: 'Tự chọn rẻ nhất',
      cancel: 'Quay lại',
    });
  },

  // PRELUDE: worms / rod peeks before the top Fish is revealed -----------------------------------
  async prelude(c) {
    const p = S.P[c.me];
    const sh = S.sea[c.d - 1][c.col - 1];
    let usedInf = false;
    while (!sh.rev && sh.cards.length > 0) {
      const opts = [];
      if (p.worms) opts.push({ id: 'worms', label: 'Lật Can of Worms: xem lén Fish trên cùng, giữ nguyên hoặc đẩy xuống đáy' });
      const rod = p.rodE !== false ? D.rod[p.rodE] : null;
      if (rod && rod.peek3 && p.dinks.length > 0 && !usedInf) {
        opts.push({ id: 'inf', label: 'Rod of the Infinite: bỏ 1 Dink để xem lén 3 Fish trên cùng và sắp xếp lại' });
      }
      if (opts.length === 0) break;
      opts.push({ id: 'go', label: 'Lật Fish trên cùng ngay' });
      const r = await Ask.pick(c.me, `Trước khi lật ở ${Fx.shoalName(c.d, c.col)}`, opts, { tag: 'prelude' });
      if (r === 'go' || r === null) break;
      if (r === 'worms') {
        p.worms = false;
        const id = sh.cards[0];
        Log.say(c.me, `lật Can of Worms để xem lén đỉnh ${Fx.shoalName(c.d, c.col)}.`);
        const k = await Ask.pick(
          c.me,
          `Can of Worms: ${D.fish[id].n}`,
          [
            { id: 'top', label: 'Giữ nguyên trên cùng' },
            { id: 'bot', label: 'Đẩy xuống đáy' },
          ],
          { info: Fx.fishInfo(id), show: [fishShow(id)], tag: 'worms' },
        );
        if (k === 'bot') {
          sh.cards.shift();
          sh.cards.push(id);
          Log.say(c.me, 'đẩy nó xuống đáy Shoal.');
        }
      } else if (r === 'inf') {
        const o2 = p.dinks.map((id, i) => ({ id: i, label: D.dink[id].n, dink: id }));
        const di = await Ask.pick(c.me, 'Bỏ Dink nào?', o2, { tag: 'dink' });
        if (di !== null && di !== undefined) {
          const id = p.dinks.splice(di, 1)[0];
          S.dk.push(id);
          usedInf = true;
          await Fx.reorderTop(c.me, c.d, c.col, 3);
        }
      }
    }
    const rod = p.rodE !== false ? D.rod[p.rodE] : null;
    if (rod && rod.peek2 && !sh.rev && sh.cards.length > 0) {
      await Fx.reorderTop(c.me, c.d, c.col, 2);
    }
  },

  // PAY ----------------------------------------------------------------------------------------------
  /** returns 'caught' or 'missed' */
  async pay(c) {
    const me = c.me;
    const p = S.P[me];
    const f = D.fish[c.id];
    for (;;) {
      const diff = Fi.diff(c);
      const exact = f.exact;
      const can = Fi.canPay(p, diff, exact);
      const opts = [];
      const fresh = Dc.fresh(p)
        .map((d) => d.v)
        .join(' ');
      const info = [
        D.fishLine(c.id),
        D.fishText(c.id),
        `Difficulty hiện tại: ${diff}${exact ? ` - phải trả bằng đúng ${exact} xúc xắc` : ''}   (${Fi.diffNote(c)})`,
        `Xúc xắc Fresh của bạn: ${fresh || 'không có'}  (tổng ${Dc.freshSum(p)})`,
      ];
      if (can) {
        if (diff <= 0 && !exact) {
          opts.push({ id: 'pay', label: 'Bắt nó (không cần xúc xắc)', grp: 'Trả giá' });
        } else {
          const a = Fi.autoDice(p, diff, exact);
          const t = a.map((d) => d.v + (Dc.tackle(d.k) ? 't' : ''));
          opts.push({ id: 'pay', label: `Trả bằng xúc xắc (tự chọn: ${t.join('+')})`, grp: 'Trả giá', dice: a });
          opts.push({ id: 'choose', label: 'Trả giá: tự chọn xúc xắc', grp: 'Trả giá' });
        }
      }
      if (f.altPay === 'large') {
        for (const id of p.hand) {
          if (D.fish[id].s === 'l' && !D.fish[id].novalue) {
            opts.push({ id: 'alt', label: 'Bỏ 1 Fish Large từ tay để bắt miễn phí', grp: 'Trả giá' });
            break;
          }
        }
      }
      if (f.wormOpt && p.worms) {
        opts.push({ id: 'worm4', label: 'Lật úp Can of Worms: Difficulty thành 4', grp: 'Trả giá' });
      }
      if (!(f.must && can)) {
        opts.push({ id: 'dink', label: 'Bỏ cuộc: dùng 1 xúc xắc và rút 1 Dink (Fish vẫn nằm ngửa)', grp: 'Trả giá', dis: Dc.freshN(p) === 0 });
      }
      const frees = Free.list(me, { kind: 'pay', c });
      frees.forEach((fa, i) => opts.push(Free.opt(`f${i + 1}`, fa, 'Hành động tự do')));
      const r = await Ask.pick(me, `Bắt ${f.n}?`, opts, { info, show: [fishShow(c.id)], tag: 'pay', meta: { diff, sum: Dc.freshSum(p), exact: exact || 0, can } });
      if (r === 'pay') {
        const sel = Fi.autoDice(p, diff, exact) || [];
        Fi.spendPaid(me, sel, diff);
        return 'caught';
      } else if (r === 'choose') {
        const sel = await Fi.pickDice(me, `Chọn xúc xắc để trả ${diff}`, diff, exact);
        if (sel) {
          Fi.spendPaid(me, sel, diff);
          return 'caught';
        }
      } else if (r === 'alt') {
        const o2 = [];
        for (const id of p.hand) {
          if (D.fish[id].s === 'l' && !D.fish[id].novalue) o2.push({ id, label: D.fish[id].n, fish: id });
        }
        const x = await Ask.pick(me, 'Bỏ Fish Large nào?', o2, { auto: true, tag: 'discard' });
        if (x !== null && x !== undefined) {
          Fx.discardFromHand(me, x);
          Log.say(me, `bỏ ${D.fish[x].n} để bắt ${f.n} miễn phí.`);
          return 'caught';
        }
      } else if (r === 'worm4') {
        Fx.flipWorms(me);
        c.dset = 4;
      } else if (r === 'dink') {
        const fr = Dc.fresh(p);
        let d = fr[0];
        for (const x of fr) if (x.v < d.v) d = x;
        const distinct = fr.some((x) => x.v !== d.v || x.k !== d.k);
        if (distinct) {
          const o2 = fr.map((x, i) => ({ id: i, label: Dc.label(x), die: x }));
          const k = await Ask.pick(me, 'Dùng xúc xắc nào?', o2, { tag: 'spendDie' });
          d = fr[k] || d;
        }
        Dc.spend(p, d);
        Log.say(me, 'không thể hoặc không muốn trả - dùng 1 xúc xắc và nhận 1 Dink.');
        await Fx.dink(me, 1);
        return 'missed';
      } else if (typeof r === 'string' && r[0] === 'f') {
        const fa = frees[Number(r.slice(1)) - 1];
        if (fa) await fa.run();
      }
      if (S.over) return 'missed';
    }
  },

  // CATCH ----------------------------------------------------------------------------------------------
  async catch(c) {
    const me = c.me;
    const p = S.P[me];
    const f = D.fish[c.id];
    const sh = S.sea[c.d - 1][c.col - 1];
    c.keep = true;
    Fx.shoalPop(c);
    RT.fly = c.id; // in transit (only the test harness cares)
    Log.say(me, `bắt được ${f.n}!`);
    if (f.C) await A.run(f.C, c);
    RT.fly = null;
    if (S.over) return;
    if (c.keep !== false && !c.stolen) {
      const fid = c.id;
      Fx.toHand(me, fid);
      if (D.fish[fid].lock) p.lock.push({ id: fid, col: c.col });
    } else if (c.keep === false && !c.stolen) {
      Fx.toGrave(c.id);
    }
    if (sh.cards.length === 0) {
      Log.say(me, `đã bắt Fish cuối cùng của ${Fx.shoalName(c.d, c.col)} - OVERFISHING!`);
      await Fx.draw(me, 1);
    }
  },

  // CAST -------------------------------------------------------------------------------------------------
  /** returns 'action' (turn used) or 'free' (does not count as an action) */
  async cast(me, d, col) {
    const p = S.P[me];
    const sh = S.sea[d - 1][col - 1];
    const c = { me, d, col, mods: 0, fishing: true };
    await Fi.prelude(c);
    c.id = sh.cards[0];
    if (c.id === undefined) return 'action';
    if (!sh.rev) {
      sh.rev = true;
      Log.say(me, `quăng câu vào ${Fx.shoalName(d, col)} và lật ${D.fish[c.id].n}.`);
      await Fx.triggerR(c);
    } else {
      Log.say(me, `quăng câu vào ${Fx.shoalName(d, col)} (${D.fish[c.id].n} đã nằm ngửa).`);
    }
    let result = 'missed';
    if (!c.ended && !S.over && sh.cards[0] === c.id) {
      if (c.auto) {
        await Fi.catch(c);
        result = 'caught';
      } else {
        result = await Fi.pay(c);
        if (result === 'caught' && !S.over) await Fi.catch(c);
      }
    }
    p.dy.first = false;
    if (result === 'missed' && c.onMiss && sh.cards[0] === c.id) c.onMiss();
    return c.free ? 'free' : 'action';
  },

  /** The Plug: discard the top-left-most Fish of the Sea */
  plugTick() {
    if (!S.plug) return;
    for (let d = 1; d <= 3; d++) {
      for (let col = 1; col <= 3; col++) {
        const sh = S.sea[d - 1][col - 1];
        if (sh.cards.length > 0) {
          const id = sh.cards.shift();
          sh.rev = false;
          Fx.toGrave(id);
          Log.sys(`The Plug hút ${D.fish[id].n} khỏi ${Fx.shoalName(d, col)}.`);
          return;
        }
      }
    }
  },

  /** which shoals can this player cast at right now */
  targets(me) {
    const p = S.P[me];
    const r = [];
    if (Dc.freshN(p) === 0) return r;
    for (let d = 1; d <= Math.min(3, p.dep); d++) {
      for (let col = 1; col <= 3; col++) {
        let ok = S.sea[d - 1][col - 1].cards.length > 0;
        for (const l of p.lock) if (l.col !== col) ok = false;
        if (ok) r.push({ d, col });
      }
    }
    return r;
  },
};
