// Game flow: days, phases, turns, passing, end of game.

import { S } from './state.js';
import { U } from './util.js';
import { Log, Ask, Rl, Dc, ROMAN } from './core.js';
import { D } from './data.js';
import { Fx } from './fx.js';
import { Fi } from './fish.js';
import { Free, bigTier } from './free.js';
import { Po } from './port.js';

const sgn = (n) => (n > 0 ? '+' : '') + n;

export const Fl = {
  statusInfo(me) {
    const p = S.P[me];
    const [f, sp] = Dc.summary(p);
    const mad = Rl.mad(p);
    const lines = [];
    lines.push(`${Rl.dayName()} - ${p.loc === 'sea' ? `Biển, Depth ${ROMAN[p.dep - 1]}` : 'Cảng'}${S.mode === 'solo' ? '' : ` - ${p.bucks}$`}`);
    lines.push(`Xúc xắc Fresh: ${f.length > 0 ? f.join(' ') : 'không có'}  (tổng ${Dc.freshSum(p)})   Spent: ${sp}`);
    if (S.mode !== 'solo') lines.push(`Regret: ${p.reg.length} lá - Fair ${sgn(mad.fair)}, Foul ${sgn(mad.foul)}, tối đa ${mad.maxd} xúc xắc`);
    else lines.push(`Regret Value hiện tại: ${Rl.regVal(p)}`);
    return lines;
  },

  unpassed: () => S.order.filter((c) => !S.P[c].pass),

  checkEnd() {
    if (S.over) return true;
    if (Fx.seaEmpty()) {
      S.over = true;
      Log.sys('Biển đã cạn Fish - ván đấu kết thúc ngay lập tức!');
      return true;
    }
    return false;
  },

  // MUSTER YOUR COURAGE ---------------------------------------------------------------------------
  async muster(me) {
    const p = S.P[me];
    const solo = S.mode === 'solo';
    const maxd = Rl.maxDice(p);
    const fresh = Dc.fresh(p);
    const spent = Dc.spentList(p);
    let reroll = [];
    if (!solo && fresh.length > 0 && spent.length + fresh.length > 0) {
      const items = fresh.map((d) => ({ id: d, label: Dc.label(d), die: d }));
      const weak = () => {
        const r = [];
        fresh.forEach((d, i) => {
          if (d.v < Dc.mean(d.k)) r.push(i);
        });
        return r;
      };
      const ch = await Ask.multi(me, 'Muster your courage - tung xúc xắc', items, {
        info: [`Cả ${spent.length} xúc xắc Spent sẽ được tung. Chọn thêm những xúc xắc Fresh bạn muốn tung lại (tối đa ${maxd} xúc xắc).`],
        init: weak(),
        auto: weak,
        autoLabel: 'Tung lại các viên yếu',
        okLabel: 'Tung!',
        tag: 'muster',
      });
      reroll = ch || [];
    }
    const pool = [];
    const rolledFresh = new Set(reroll);
    for (const d of p.dice) {
      if (!d.fr || rolledFresh.has(d)) {
        d.v = Dc.roll(d.k);
        d.fr = false;
        pool.push(d);
      }
    }
    let keptFresh = 0;
    for (const d of p.dice) if (d.fr) keptFresh++;
    if (pool.length === 0) return;
    Log.say(me, `tung ${pool.length} xúc xắc: ${pool.map((d) => d.v).join(' ')}.`);
    const cap = maxd - keptFresh;
    if (cap >= pool.length) {
      for (const d of pool) d.fr = true;
    } else if (cap > 0) {
      const order = pool.map((_, i) => i);
      U.sort(order, (a, b) => (pool[a].v !== pool[b].v ? pool[a].v > pool[b].v : a < b));
      const init = order.slice(0, cap);
      const items = pool.map((d) => ({ id: d, label: Dc.label(d), die: d }));
      const ch = await Ask.multi(me, `Chọn ${cap} xúc xắc giữ Fresh (tối đa ${maxd})`, items, {
        min: cap,
        max: cap,
        init,
        auto: () => init,
        autoLabel: 'Các viên tốt nhất',
        okLabel: 'Giữ những viên này',
        tag: 'keepDice',
      });
      if (ch) for (const d of ch) d.fr = true;
      else for (const i of init) pool[i].fr = true;
      Log.say(me, `giữ ${cap} xúc xắc Fresh; ${pool.length - cap} viên vào nhóm Spent.`);
    }
  },

  // LIFE PRESERVER ----------------------------------------------------------------------------------
  async lifePreserver() {
    if (S.mode === 'solo' || S.order.length < 2) return;
    let best = null;
    let bv = -1;
    for (const c of Rl.fromFirst()) {
      const v = Dc.freshSum(S.P[c]);
      if (v > bv) {
        best = c;
        bv = v;
      }
    }
    const to = await Fx.chooseOther(best, `Bạn có tổng xúc xắc Fresh cao nhất (${bv}): đưa Life Preserver cho ai?`);
    if (!to) return;
    S.lp = to;
    Log.say(best, `có tổng xúc xắc Fresh cao nhất (${bv}) và đưa Life Preserver cho ${Log.nm(to)}.`);
  },

  // EQUIP ROD & REEL ----------------------------------------------------------------------------------
  async equip(me) {
    const p = S.P[me];
    if (p.rods.length > 0) {
      if (p.rods.length === 1) {
        p.rodE = p.rods[0];
      } else {
        const opts = p.rods.map((id) => ({ id, label: `${D.rod[id].n} - ${D.rod[id].t}`, rod: id }));
        opts.push({ id: 'none', label: 'Hôm nay không dùng Rod' });
        const r = await Ask.pick(me, 'Chọn Rod cho hôm nay', opts, { tag: 'equipRod' });
        p.rodE = r !== null && r !== 'none' ? r : false;
      }
      if (p.rodE !== false) Log.say(me, `trang bị ${D.rod[p.rodE].n}.`);
    } else {
      p.rodE = false;
    }
    if (p.reels.length > 0) {
      if (p.reels.length === 1) {
        p.reelE = p.reels[0];
      } else {
        const opts = p.reels.map((id) => ({ id, label: `${D.reel[id].n} - ${D.reel[id].t}`, reel: id }));
        opts.push({ id: 'none', label: 'Hôm nay không dùng Reel' });
        const r = await Ask.pick(me, 'Chọn Reel cho hôm nay', opts, { tag: 'equipReel' });
        p.reelE = r !== null && r !== 'none' ? r : false;
      }
      if (p.reelE !== false) Log.say(me, `trang bị ${D.reel[p.reelE].n}.`);
    } else {
      p.reelE = false;
    }
  },

  // PHASE I: START ------------------------------------------------------------------------------------
  async startPhase() {
    const solo = S.mode === 'solo';
    Log.sys(`Bắt đầu ${Rl.dayName()}.`);
    if (!solo) {
      S.first = Rl.nextOf(S.first, 1);
      Log.say(S.first, 'nhận First Player marker.');
    }
    // discard every revealed Fish
    let n = 0;
    for (const row of S.sea) {
      for (const sh of row) {
        if (sh.rev && sh.cards.length > 0) {
          Fx.toGrave(sh.cards.shift());
          n++;
        }
        sh.rev = false;
      }
    }
    if (n > 0) Log.sys(`${n} Fish đã lật bị bỏ khỏi Biển.`);
    // day effects
    if (!solo) {
      if (S.day === 3 || S.day === 5) {
        for (const c of S.order) S.P[c].worms = true;
        Log.sys('Mọi người lật Can of Worms ngửa.');
      } else if (S.day === 4) {
        Log.sys('Ngày lãnh lương! Mọi người nhận 3$.');
        await Fx.forAll((c) => Fx.gain(c, 3));
      } else if (S.day === 6) {
        const nPl = S.order.length;
        let kind = null;
        for (const k of ['o', 'g', 'b']) {
          if (S.bag[k] >= nPl) {
            kind = k;
            break;
          }
        }
        if (kind) {
          for (const c of Rl.fromFirst()) {
            S.bag[kind]--;
            Dc.gain(S.P[c], kind, false);
          }
          Log.sys(`Thứ Bảy: mọi người lấy một ${Dc.NAME[kind]} từ túi.`);
        } else {
          Log.sys('Thứ Bảy: không đủ xúc xắc Tackle trong túi - không ai được lấy.');
        }
      }
      // reel in
      for (const c of S.order) {
        const p = S.P[c];
        if (p.loc === 'sea' && p.dep > 1) p.dep--;
      }
      Log.sys('Reel in: mọi thuyền ở Biển được kéo lên 1 Depth.');
    }
    Fl.checkEnd();
  },

  // PHASE II: REFRESH ---------------------------------------------------------------------------------
  async refreshPhase() {
    Log.sys(`=== ${Rl.dayName()} (ngày ${S.day}/${S.dayLast}) ===`);
    for (const c of S.order) {
      const p = S.P[c];
      p.pass = false;
      // the visible Biggest Regret ability is fixed by the number of Regret cards at the start of the Day
      p.dy = { reel: false, big: false, shops: [], first: true, skull: false, bt: bigTier(p.reg.length) };
    }
    for (const c of Rl.fromFirst()) await Fl.muster(c);
    await Fl.lifePreserver();
  },

  // PHASE III: DECLARATION ----------------------------------------------------------------------------
  async declarePhase() {
    for (const c of Rl.fromFirst()) {
      const p = S.P[c];
      if (p.loc === 'port') {
        p.loc = 'sea';
        p.dep = 1;
        Log.say(c, 'quay lại Depth I ngoài Biển (hôm qua đã ở Cảng).');
      } else {
        const choice = await Ask.pick(
          c,
          `Định hướng: bạn sẽ ở đâu trong ${Rl.dayName()}?`,
          [
            { id: 'sea', label: `Ở lại Biển (Depth ${ROMAN[p.dep - 1]})` },
            { id: 'port', label: 'Make Port (vào Cảng)' },
          ],
          { info: Fl.statusInfo(c), tag: 'declare' },
        );
        if (choice === 'port') await Po.make(c);
        else Log.say(c, `ở lại Biển (Depth ${ROMAN[p.dep - 1]}).`);
      }
      await Fl.equip(c);
    }
  },

  // PHASE IV: ACTION -----------------------------------------------------------------------------------
  async passReward(me) {
    const p = S.P[me];
    const r = await Ask.pick(
      me,
      'Phần thưởng khi Pass',
      [
        { id: 'dink', label: 'Rút 1 Dink', dis: S.dk.length === 0 },
        { id: 'reg', label: 'Bỏ 1 lá Regret ngẫu nhiên', dis: p.reg.length === 0 },
      ],
      { info: [`Bạn đang có ${p.reg.length} lá Regret.`], auto: true, tag: 'passReward' },
    );
    if (r === 'dink') await Fx.dink(me, 1);
    else if (r === 'reg') await Fx.disc(me, 1, true);
  },

  async pass(me, forced) {
    const p = S.P[me];
    p.pass = true;
    Log.say(me, forced ? 'không còn gì để làm và Pass.' : 'Pass.');
    if (!S.ex && S.mode !== 'solo') await Fl.passReward(me);
  },

  shoalLabel(d, col) {
    const sh = S.sea[d - 1][col - 1];
    let lab = `${ROMAN[d - 1]}-${col}  (còn ${sh.cards.length})`;
    if (sh.rev) lab += `  ĐANG NGỬA: ${D.fish[sh.cards[0]].n}`;
    return lab;
  },

  /** one player's turn; returns 'action' or 'pass' */
  async turn(me) {
    const p = S.P[me];
    const solo = S.mode === 'solo';
    p.dy.skull = false;
    while (!S.over) {
      const sea = p.loc === 'sea';
      const opts = [];
      const acts = {};
      const add = (id, label, grp, fn, dis, extra) => {
        opts.push({ id, label, grp, dis: !!dis, ...(extra || {}) });
        acts[id] = fn;
      };
      if (sea) {
        const tg = Fi.targets(me);
        if (tg.length > 0) {
          const ok = new Set(tg.map((t) => t.d * 10 + t.col));
          for (let d = 1; d <= Math.min(3, p.dep); d++) {
            for (let col = 1; col <= 3; col++) {
              if (ok.has(d * 10 + col)) {
                add(`c${d}${col}`, Fl.shoalLabel(d, col), 'Quăng câu (Depth I-III)', () => Fi.cast(me, d, col), false, { k: 'cast', shoal: [d, col] });
              } else {
                const n = S.sea[d - 1][col - 1].cards.length;
                add(`c${d}${col}`, `${ROMAN[d - 1]}-${col}${n === 0 ? '  (trống)' : '  (bị khóa)'}`, 'Quăng câu (Depth I-III)', null, true, { k: 'cast', shoal: [d, col] });
              }
            }
          }
        }
        if (!p.lb && !solo) {
          add(
            'lifeboat',
            'Abandon Ship: lật Lifeboat và Make Port (1 lần/ván, +10 Regret Value)',
            'Hành động khác',
            async () => {
              const ok = await Ask.yn(me, 'Abandon Ship?', ['Thao tác này lật Lifeboat vĩnh viễn (+10 Regret Value) và đưa bạn vào Cảng đến hết ngày.'], 'Abandon Ship', 'Hủy');
              if (!ok) return null;
              p.lb = true;
              await Po.make(me, 'lifeboat');
              return 'action';
            },
            false,
            { k: 'lifeboat' },
          );
        }
      } else {
        const canSell = p.hand.some((id) => Rl.sellable(id));
        const slots = p.mount.filter((m) => !m).length;
        const canMount = canSell && slots > 0;
        const minCost = Math.max(0, 1 - Rl.mad(p).disc);
        let maxDisc = 0;
        for (const d of Po.discounts(me)) maxDisc += d.amt;
        const canShop = minCost - maxDisc <= p.bucks && p.dy.shops.length < 4;
        add('sell', 'Bán Fish', 'Hành động ở Cảng (một lần mỗi lượt)', async () => ((await Po.sell(me)) ? 'action' : null), !canSell, { k: 'sell' });
        add('shop', 'Mua sắm', 'Hành động ở Cảng (một lần mỗi lượt)', async () => ((await Po.shop(me)) ? 'action' : null), !canShop, { k: 'shop' });
        add('mount', 'Mount Fish', 'Hành động ở Cảng (một lần mỗi lượt)', async () => ((await Po.mount(me)) ? 'action' : null), !canMount, { k: 'mount' });
      }
      if (S.order.length > 1) {
        for (const id of p.hand) {
          const f = D.fish[id];
          if (f.giveAct) {
            add(
              `give${id}`,
              `Tặng ${f.n} cho người khác (họ bỏ 4 Regret)`,
              'Hành động khác',
              async () => {
                const to = await Fx.chooseOther(me, `Tặng ${f.n} cho ai? Họ phải bỏ 4 Regret.`);
                if (!to) return null;
                Fx.leaveHand(me, id);
                Fx.toHand(to, id);
                Log.say(me, `tặng ${f.n} cho ${Log.nm(to)}.`);
                await Fx.disc(to, 4, false);
                return 'action';
              },
              false,
              { k: 'give', fish: id },
            );
          }
        }
      }
      add('pass', solo ? 'Kết thúc ngày' : 'Pass', 'Pass', () => 'pass', false, { k: 'pass', kind: 'pass' });
      const frees = Free.list(me, { kind: sea ? 'sea' : 'port' });
      frees.forEach((fa, i) => {
        const o = Free.opt(`f${i + 1}`, fa, 'Hành động tự do');
        add(
          o.id,
          o.label,
          o.grp,
          async () => {
            await fa.run();
            return 'free';
          },
          false,
          { k: o.k, ...(fa.ref || {}) },
        );
      });
      const nEnabled = opts.filter((o) => !o.dis).length;
      if (nEnabled === 1) {
        await Fl.pass(me, true);
        return 'pass';
      }
      const r = await Ask.pick(me, `${solo ? 'Cú quăng câu của bạn' : 'Lượt của bạn'} - ${Log.nm(me)}`, opts, {
        info: Fl.statusInfo(me),
        gcols: { 'Quăng câu (Depth I-III)': 3, 'Hành động ở Cảng (một lần mỗi lượt)': 3 },
        tag: 'turn',
      });
      if (r === null) {
        await Fl.pass(me, true);
        return 'pass';
      }
      if (r === 'pass') {
        await Fl.pass(me, false);
        return 'pass';
      }
      const fn = acts[r];
      if (fn) {
        const res = await fn();
        Fl.checkEnd();
        if (res === 'action') return 'action';
      }
    }
    return 'action';
  },

  async actionPhase() {
    const solo = S.mode === 'solo';
    if (!S.turn) {
      S.turn = S.first;
      S.ex = false;
    }
    while (!S.over) {
      const un = Fl.unpassed();
      if (un.length === 0) break;
      if (!solo && un.length === 1 && !S.ex) {
        S.ex = 2;
        Log.say(un[0], 'là người cuối cùng còn lại - được thêm hai lượt.');
      }
      const me = S.turn;
      const p = S.P[me];
      if (p.pass) {
        if (!S.ex && !solo) await Fl.passReward(me);
        S.turn = Rl.nextOf(me);
      } else {
        if (S.plug) {
          Fi.plugTick();
          if (Fl.checkEnd()) break;
        }
        const res = await Fl.turn(me);
        if (S.over) break;
        if (S.ex && res === 'action') {
          S.ex--;
          if (S.ex <= 0) break;
        }
        S.turn = Rl.nextOf(me);
      }
    }
    S.turn = false;
    S.ex = false;
  },

  // END OF THE GAME ----------------------------------------------------------------------------------------
  async penalty(c) {
    const p = S.P[c];
    const cands = [];
    for (let i = 1; i <= 3; i++) {
      if (p.mount[i - 1]) cands.push({ slot: i, pts: Rl.val(p, p.mount[i - 1]) * Rl.mountMult(i) });
    }
    if (cands.length === 0) {
      Log.say(c, 'có Regret Value cao nhất nhưng không có Fish đã Mount nào để mất.');
      return null;
    }
    const want = S.order.length === 2 ? 'lowest' : 'highest';
    let target = null;
    for (const x of cands) {
      if (target === null || (want === 'lowest' && x.pts < target) || (want === 'highest' && x.pts > target)) target = x.pts;
    }
    const tied = cands.filter((x) => x.pts === target);
    let pick = tied[0];
    if (tied.length > 1) {
      const opts = tied.map((x, i) => ({ id: i, label: `${D.fish[p.mount[x.slot - 1]].n} (slot ${x.slot}, ${x.pts} điểm)`, fish: p.mount[x.slot - 1] }));
      const r = await Ask.pick(c, 'Hình phạt Regret cao nhất: bỏ Fish đã Mount nào? (các giá trị bằng nhau)', opts, { tag: 'penalty' });
      pick = tied[r || 0];
    }
    const id = p.mount[pick.slot - 1];
    p.mount[pick.slot - 1] = false;
    Fx.toGrave(id);
    Log.say(c, `có Regret Value cao nhất và phải bỏ ${D.fish[id].n} (${pick.pts} điểm).`);
    return { c, name: D.fish[id].n, id, pts: pick.pts };
  },

  async finish() {
    S.over = true;
    S.ph = 'over';
    if (S.mode === 'solo') return Fl.finishSolo();
    Log.sys('=== VÁN ĐẤU KẾT THÚC ===');
    let hi = -1;
    for (const c of S.order) hi = Math.max(hi, Rl.regVal(S.P[c]));
    const pens = [];
    for (const c of S.order) {
      if (Rl.regVal(S.P[c]) === hi) {
        const pen = await Fl.penalty(c);
        if (pen) pens.push(pen);
      }
    }
    const rows = [];
    for (const c of S.order) {
      const p = S.P[c];
      const [hand, mount, bk, total] = Rl.score(p);
      rows.push({ c, hand, mount, bucks: bk, total, regV: Rl.regVal(p), regN: p.reg.length, lb: !!p.lb });
    }
    const better = (a, b) => {
      if (a.total !== b.total) return a.total > b.total;
      if (a.regV !== b.regV) return a.regV < b.regV;
      return a.regN < b.regN;
    };
    U.sort(rows, better);
    const winners = rows.filter((r) => !better(rows[0], r)).map((r) => r.c);
    S.res = { mode: 'multi', hiReg: hi, rows, winners, pens };
    rows.forEach((r, i) => {
      Log.line(`${i + 1}. ${Log.nm(r.c)}: ${r.total} điểm (tay ${r.hand} + Mount ${r.mount} + Fishbucks ${r.bucks}), Regret Value ${r.regV}`, r.c, 'say');
    });
    Log.sys(`Người thắng: ${winners.map(Log.nm).join(' & ')}!`);
  },

  /** minimal-waste subset of values reaching `need`; returns list of (0-based) indices */
  jettisonAuto(vals, need) {
    const total = U.sum(vals);
    if (total <= need) return vals.map((_, i) => i);
    let reach = new Map([[0, []]]);
    vals.forEach((v, i) => {
      if (v > 0) {
        const add = new Map();
        for (const [s, how] of reach) {
          const ns = s + v;
          if (!reach.has(ns) && !add.has(ns)) add.set(ns, [...how, i]);
        }
        for (const [s, how] of add) reach.set(s, how);
      }
    });
    let bestS = null;
    for (const s of reach.keys()) if (s >= need && (bestS === null || s < bestS)) bestS = s;
    return bestS === null ? [] : reach.get(bestS);
  },

  async finishSolo() {
    const c = S.order[0];
    const p = S.P[c];
    Log.sys('=== TUẦN LỄ KẾT THÚC ===');
    const R = Rl.regVal(p);
    const ids = p.hand.slice();
    const vals = ids.map((id) => Rl.val(p, id));
    const items = ids.map((id) => ({ id, label: `${D.fish[id].n} (giá trị ${Rl.val(p, id)})`, fish: id }));
    let jet = [];
    const total = U.sum(vals);
    Log.say(c, `tính tổng Regret Value là ${R}.`);
    if (R > 0 && ids.length > 0) {
      if (total <= R) {
        Log.say(c, `phải ném bỏ mọi Fish (tổng giá trị ${total} không vượt quá Regret).`);
        jet = ids.slice();
      } else {
        const auto = Fl.jettisonAuto(vals, R);
        const ch = await Ask.multi(c, `Ném bỏ Fish trị giá ít nhất ${R}`, items, {
          info: [`Bạn đã bất cẩn: bỏ những Fish có tổng Value ít nhất ${R} (Regret Value của bạn).`],
          ok: (sel) => {
            let s = 0;
            for (const id of sel) s += Rl.val(p, id);
            return { ok: s >= R, msg: `Đã chọn ${s} / cần ${R}` };
          },
          init: auto,
          auto: () => auto,
          autoLabel: 'Tổ hợp rẻ nhất',
          okLabel: 'Ném bỏ',
          tag: 'jettison',
        });
        jet = ch || auto.map((i) => ids[i]);
      }
    }
    for (const id of jet) {
      Fx.leaveHand(c, id);
      Fx.toGrave(id);
    }
    const kept = [];
    let ksum = 0;
    for (const id of p.hand) {
      kept.push({ id, name: D.fish[id].n, v: Rl.val(p, id), d: D.fish[id].d, s: D.fish[id].s });
      ksum += Rl.val(p, id);
    }
    const jnames = jet.map((id) => D.fish[id].n);
    S.res = { mode: 'solo', regV: R, jet: jnames, jetIds: jet.slice(), kept, total: ksum, plug: !!S.plug };
    Log.say(c, `mang ${kept.length} Fish trị giá ${ksum} về Cảng. Hãy dùng điểm đó để mở khóa trang bị trên tờ Survey của bạn!`);
  },

  // MAIN ---------------------------------------------------------------------------------------------------
  async main() {
    while (!S.over && S.ph !== 'over') {
      const first = S.day === S.dayStart;
      const solo = S.mode === 'solo';
      if (S.ph === 'start') {
        if (!first) await Fl.startPhase();
        if (S.over) break;
        S.ph = 'refresh';
      }
      if (S.ph === 'refresh') {
        await Fl.refreshPhase();
        S.ph = 'declare';
      }
      if (S.ph === 'declare') {
        if (!first && !solo) await Fl.declarePhase();
        if (first || solo) for (const c of Rl.fromFirst()) await Fl.equip(c);
        S.ph = 'action';
        S.turn = false;
      }
      if (S.ph === 'action') {
        await Fl.actionPhase();
        if (S.over) break;
        if (S.day >= S.dayLast) {
          S.over = true;
          break;
        }
        S.day++;
        S.ph = 'start';
      }
    }
    await Fl.finish();
  },
};
