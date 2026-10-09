// Effect primitives used by cards, items and the game flow. Everything that may ask the player is async.

import { S, RT } from './state.js';
import { U, rnd } from './util.js';
import { Log, Ask, Rl, Dc, ROMAN, regretValue } from './core.js';
import { D, A } from './data.js';

const nm = (c) => Log.nm(c);
const fishShow = (id) => ({ t: 'fish', id });

export const Fx = {
  // iteration -----------------------------------------------------------------------------------
  async forAll(fn) {
    for (const col of Rl.fromFirst()) {
      await fn(col);
      if (S.over) return;
    }
  },
  async forOthers(me, fn) {
    for (const col of Rl.fromFirst()) {
      if (col !== me) await fn(col);
      if (S.over) return;
    }
  },
  async forSea(fn) {
    for (const col of Rl.fromFirst()) {
      if (S.P[col].loc === 'sea') await fn(col);
      if (S.over) return;
    }
  },

  async chooseOther(me, title) {
    const others = S.order.filter((c) => c !== me);
    if (others.length === 0) return null;
    if (others.length === 1) return others[0];
    const opts = others.map((c) => ({ id: c, label: nm(c), seat: c }));
    return Ask.pick(me, title, opts, { tag: 'player' });
  },

  coin(me) {
    const r = rnd(2) === 1 ? 'h' : 't';
    Log.line(`Tung Fishcoin: ${r === 'h' ? 'NGỬA' : 'SẤP'}.`, me, 'coin');
    RT.coin = r;
    return r;
  },

  // REGRETS --------------------------------------------------------------------------------------
  regExtra(p) {
    let n = 0;
    for (const id of p.hand) if (D.fish[id].reg1) n++;
    return n;
  },

  /** pop one regret card (draw pile, then discard pile, then steal one at random) */
  async popRegret(color) {
    if (S.rd.length > 0) return S.rd.pop();
    if (S.rx.length > 0) return S.rx.pop();
    const cands = S.order.filter((c) => c !== color && S.P[c].reg.length > 0);
    if (cands.length === 0) return null;
    let from = cands[0];
    if (cands.length > 1) {
      const opts = cands.map((c) => ({ id: c, label: nm(c), seat: c }));
      from = await Ask.pick(color, 'Hết bài Regret! Lấy ngẫu nhiên 1 Regret của ai?', opts, { tag: 'player' });
    }
    const q = S.P[from];
    const v = q.reg.splice(rnd(q.reg.length) - 1, 1)[0];
    Log.say(color, `lấy ngẫu nhiên 1 Regret của ${nm(from)} (bộ bài đã hết).`);
    return v;
  },

  async draw(color, n, noExtra) {
    const p = S.P[color];
    if (!p || n <= 0) return [];
    const total = n + (noExtra ? 0 : Fx.regExtra(p));
    const got = [];
    for (let i = 0; i < total; i++) {
      const v = await Fx.popRegret(color);
      if (v === null || v === undefined) break;
      p.reg.push(v);
      got.push(v);
    }
    if (got.length > 0) {
      Log.say(color, `rút ${got.length} Regret (giờ có ${p.reg.length} lá Regret).`);
      RT.lastDraw[color] = got.slice();
    }
    return got;
  },

  /** discard n Regret cards: the most valuable ones, or random ones */
  async disc(color, n, rand) {
    const p = S.P[color];
    if (!p || n <= 0) return 0;
    let done = 0;
    for (let i = 0; i < n; i++) {
      if (p.reg.length === 0) break;
      let idx = 0;
      if (rand) idx = rnd(p.reg.length) - 1;
      else for (let j = 0; j < p.reg.length; j++) if (regretValue(p.reg[j]) > regretValue(p.reg[idx])) idx = j;
      S.rx.push(p.reg.splice(idx, 1)[0]);
      done++;
    }
    if (done > 0) Log.say(color, `bỏ ${done} Regret${rand ? ' ngẫu nhiên' : ''} (còn ${p.reg.length} lá Regret).`);
    return done;
  },

  /** move n of `from`'s highest (or random) Regret cards to `to` */
  moveRegrets(from, to, n, rand) {
    const a = S.P[from];
    const b = S.P[to];
    let moved = 0;
    for (let i = 0; i < n; i++) {
      if (a.reg.length === 0) break;
      let idx = 0;
      if (rand) idx = rnd(a.reg.length) - 1;
      else for (let j = 0; j < a.reg.length; j++) if (regretValue(a.reg[j]) > regretValue(a.reg[idx])) idx = j;
      b.reg.push(a.reg.splice(idx, 1)[0]);
      moved++;
    }
    return moved;
  },

  async giveRegrets(me, n) {
    const to = await Fx.chooseOther(me, `Đưa ${n} Regret của bạn cho ai?`);
    if (!to) return;
    const m = Fx.moveRegrets(me, to, n, false);
    Log.say(me, `đưa ${m} Regret cho ${nm(to)}.`);
  },

  async sentimental(me) {
    let taken = 0;
    await Fx.forOthers(me, (q) => {
      taken += Fx.moveRegrets(q, me, 1, true);
    });
    Log.say(me, `lấy ${taken} Regret từ những người khác...`);
    await Fx.disc(me, taken, false);
  },

  async seaMonkey(me, give) {
    const others = S.order.filter((c) => c !== me);
    if (give) {
      const p = S.P[me];
      let targets = others;
      if (p.reg.length < others.length) {
        const items = others.map((c) => ({ id: c, label: nm(c), seat: c }));
        const ch = await Ask.multi(me, 'Sea Monkey: bạn có ít Regret hơn số người chơi khác. Ai nhận chúng?', items, {
          min: p.reg.length,
          max: p.reg.length,
          tag: 'players',
          auto: () => Array.from({ length: p.reg.length }, (_, i) => i),
        });
        targets = ch || [];
      }
      for (const c of targets) {
        if (p.reg.length > 0) {
          Fx.moveRegrets(me, c, 1, false);
          Log.say(me, `đưa 1 Regret cho ${nm(c)}.`);
        }
      }
    } else {
      for (const c of others) {
        if (S.P[c].reg.length > 0) {
          Fx.moveRegrets(c, me, 1, false);
          Log.say(me, `lấy 1 Regret của ${nm(c)}.`);
        }
      }
    }
  },

  async interloper(me) {
    const n = S.order.length;
    const temp = [];
    for (let i = 0; i < n; i++) {
      const v = await Fx.popRegret(me);
      if (v === null || v === undefined) break;
      temp.push(v);
    }
    if (temp.length === 0) return;
    U.sort(temp, (a, b) => regretValue(a) < regretValue(b));
    // the eater keeps the lowest, the rest go to the other players
    const p = S.P[me];
    p.reg.push(temp.shift());
    const who = S.order.filter((c) => c !== me);
    U.shuffle(who);
    temp.forEach((v, i) => {
      const q = who[i];
      if (q) S.P[q].reg.push(v);
    });
    Log.say(me, 'phát Regret cho mọi người - ai cũng nhận 1 lá.');
  },

  // DICE effects -----------------------------------------------------------------------------------
  ref(color, n) {
    const p = S.P[color];
    for (let i = 0; i < n; i++) {
      const maxd = Rl.maxDice(p);
      const spent = Dc.spentList(p);
      if (Dc.freshN(p) < maxd && spent.length > 0) {
        let best = spent[0];
        for (const d of spent) if (Dc.mean(d.k) > Dc.mean(best.k)) best = d;
        best.v = Dc.roll(best.k);
        best.fr = true;
        Log.say(color, `Refresh một ${Dc.NAME[best.k]} → ${best.v}.`);
      } else {
        let worst = null;
        for (const d of p.dice) if (d.fr && d.v < Dc.mean(d.k) && (worst === null || d.v < worst.v)) worst = d;
        if (worst) {
          const o = worst.v;
          worst.v = Dc.roll(worst.k);
          Log.say(color, `Refresh một xúc xắc Fresh (${o} → ${worst.v}).`);
        }
      }
    }
  },

  async rerollFresh(color, n) {
    const p = S.P[color];
    for (let i = 0; i < n; i++) {
      const fr = Dc.fresh(p);
      if (fr.length === 0) return;
      const opts = fr.map((d, k) => ({ id: k, label: `Reroll ${Dc.label(d)}`, die: d }));
      opts.push({ id: 'skip', label: 'Giữ nguyên xúc xắc' });
      const r = await Ask.pick(color, 'Reroll một xúc xắc Fresh?', opts, { tag: 'reroll1' });
      if (r === 'skip' || r === null) return;
      const d = fr[r];
      const o = d.v;
      d.v = Dc.roll(d.k);
      Log.say(color, `reroll ${Dc.NAME[d.k]} (${o} → ${d.v}).`);
    }
  },

  rerollAll(color) {
    const p = S.P[color];
    const fr = Dc.fresh(p);
    for (const d of fr) d.v = Dc.roll(d.k);
    if (fr.length > 0) Log.say(color, `reroll cả ${fr.length} xúc xắc Fresh.`);
  },

  async inc(color, n) {
    const p = S.P[color];
    for (let i = 0; i < n; i++) {
      const cands = [];
      const seen = {};
      let distinct = 0;
      for (const d of Dc.fresh(p)) {
        if (Dc.nextFace(d.k, d.v) !== null) {
          cands.push(d);
          const key = d.k + d.v;
          if (!seen[key]) {
            seen[key] = true;
            distinct++;
          }
        }
      }
      if (cands.length === 0) return;
      let d = cands[0];
      if (distinct > 1) {
        const opts = cands.map((x, k) => ({ id: k, label: `${Dc.NAME[x.k]} ${x.v} → ${Dc.nextFace(x.k, x.v)}`, die: x }));
        const r = await Ask.pick(color, 'Increment xúc xắc nào?', opts, { tag: 'inc' });
        d = cands[r] || cands[0];
      }
      const o = d.v;
      d.v = Dc.nextFace(d.k, d.v);
      Log.say(color, `Increment ${Dc.NAME[d.k]} (${o} → ${d.v}).`);
    }
  },

  async setHighest(color, n) {
    const p = S.P[color];
    const fr = Dc.fresh(p).filter((d) => d.v < Dc.maxFace(d.k));
    if (fr.length === 0) return false;
    const items = fr.map((d) => ({ id: d, label: `${Dc.label(d)} → ${Dc.maxFace(d.k)}`, die: d }));
    const k = Math.min(n, fr.length);
    const ch = await Ask.multi(color, 'Đặt xúc xắc Fresh nào về mặt cao nhất?', items, {
      min: 1,
      max: k,
      tag: 'dice',
      auto: () => {
        const order = fr.map((_, i) => i);
        U.sort(order, (a, b) => fr[a].v < fr[b].v || (fr[a].v === fr[b].v && a < b));
        return order.slice(0, k);
      },
      autoLabel: 'Viên thấp nhất',
      cancel: 'Hủy',
    });
    if (!ch) return false;
    for (const d of ch) d.v = Dc.maxFace(d.k);
    Log.say(color, `đặt ${ch.length} xúc xắc về mặt cao nhất.`);
    return true;
  },

  takeOmen(color) {
    if (S.om) return;
    const p = S.P[color];
    S.om = color;
    const d = Dc.gain(p, 'om', true);
    Log.say(color, `nhận Omen Die (tung được ${d.v}, ${d.fr ? 'Fresh' : 'Spent'}).`);
  },
  dropOmen(color) {
    const p = S.P[color];
    const i = p.dice.findIndex((d) => d.k === 'om');
    if (i >= 0) p.dice.splice(i, 1);
    S.om = false;
  },

  // MONEY / ITEMS ----------------------------------------------------------------------------------
  gain(color, n) {
    if (S.mode === 'solo' || n <= 0) return;
    const p = S.P[color];
    const before = p.bucks;
    p.bucks = Math.min(10, p.bucks + n);
    const g = p.bucks - before;
    Log.say(color, `nhận ${g}$${g < n ? ' (tối đa 10$)' : ''}.`);
  },

  async dink(color, n) {
    const p = S.P[color];
    let k = n;
    if (p.reelE !== false && D.reel[p.reelE].kind === 'pin') k = n * 3;
    let got = 0;
    for (let i = 0; i < k; i++) {
      if (S.dk.length === 0) break;
      p.dinks.push(S.dk.shift());
      got++;
    }
    if (got > 0) Log.say(color, `rút ${got} Dink.`);
    else Log.say(color, 'không còn Dink nào.');
    return got;
  },

  supply(color, n) {
    const p = S.P[color];
    let got = 0;
    for (let i = 0; i < n; i++) {
      if (S.sd.length === 0) break;
      p.items.push(S.sd.shift());
      got++;
    }
    if (got > 0) Log.say(color, `lấy ${got} lá Supply.`);
  },

  itemList(p) {
    const r = [];
    for (const id of p.rods) r.push({ kind: 'rod', id, label: `Rod: ${D.rod[id].n}` });
    for (const id of p.reels) r.push({ kind: 'reel', id, label: `Reel: ${D.reel[id].n}` });
    for (const id of p.items) r.push({ kind: 'sup', id, label: `Supply: ${D.sup[id].n}` });
    return r;
  },

  async discItem(color) {
    const p = S.P[color];
    const list = Fx.itemList(p);
    if (list.length === 0) return;
    const opts = list.map((it, i) => ({ id: i, label: it.label, [it.kind]: it.id }));
    const r = await Ask.pick(color, 'Bỏ một vật phẩm của bạn', opts, { auto: true, tag: 'item' });
    const it = list[r];
    if (!it) return;
    if (it.kind === 'rod') {
      U.rm(p.rods, it.id);
      S.rod.push(it.id);
      if (p.rodE === it.id) p.rodE = false;
    } else if (it.kind === 'reel') {
      U.rm(p.reels, it.id);
      S.reel.push(it.id);
      if (p.reelE === it.id) p.reelE = false;
    } else {
      U.rm(p.items, it.id);
      S.sd.push(it.id);
    }
    Log.say(color, `bỏ ${it.label}.`);
  },

  async dinkLook(color, k) {
    const top = S.dk.slice(0, k);
    if (top.length === 0) {
      Log.say(color, 'không còn Dink nào.');
      return;
    }
    const opts = top.map((id, i) => ({ id: i, label: `${D.dink[id].n} - ${D.dink[id].t}`, dink: id }));
    const r = await Ask.pick(color, `Xem ${top.length} Dink trên cùng và giữ lại 1`, opts, { tag: 'dinkLook' });
    const id = top[r];
    if (id === undefined) return;
    U.rm(S.dk, id);
    S.P[color].dinks.push(id);
    // the others go to the bottom, in order
    for (const o of top) {
      if (o !== id) {
        U.rm(S.dk, o);
        S.dk.push(o);
      }
    }
    Log.say(color, `giữ 1 Dink trong ${top.length} lá trên cùng.`);
  },

  // BOATS --------------------------------------------------------------------------------------------
  allBoats(depth) {
    for (const c of S.order) {
      const p = S.P[c];
      if (p.loc === 'sea') p.dep = depth;
    }
    Log.sys(`Mọi thuyền ở Biển chuyển xuống Depth ${ROMAN[depth - 1]}.`);
  },

  async mayDive(depth) {
    await Fx.forSea(async (q) => {
      const ok = await Ask.yn(
        q,
        `Rút 1 Regret và chuyển thuyền xuống Depth ${ROMAN[depth - 1]}?`,
        [],
        `Có: rút 1 Regret, xuống Depth ${ROMAN[depth - 1]}`,
        'Không',
      );
      if (ok) {
        await Fx.draw(q, 1);
        S.P[q].dep = depth;
        Log.say(q, `chuyển thuyền xuống Depth ${ROMAN[depth - 1]}.`);
      }
    });
  },

  boatDown(color, n) {
    const p = S.P[color];
    if (p.loc !== 'sea') return;
    p.dep = Math.min(3, p.dep + n);
    Log.say(color, `chuyển thuyền xuống Depth ${ROMAN[p.dep - 1]}.`);
  },

  // FISH CARD MOVEMENT -----------------------------------------------------------------------------
  shoal: (d, col) => S.sea[d - 1][col - 1],

  shoalPop(c) {
    const sh = S.sea[c.d - 1][c.col - 1];
    if (sh.cards[0] === c.id) {
      sh.cards.shift();
      sh.rev = false;
      return true;
    }
    return false;
  },

  toGrave(id) {
    S.gy[D.fish[id].d - 1].push(id);
  },

  lockDrop(color, id) {
    const p = S.P[color];
    for (let i = p.lock.length - 1; i >= 0; i--) if (p.lock[i].id === id) p.lock.splice(i, 1);
  },

  /** remove a fish from a player's hand (sold, eaten, discarded, given, mounted) */
  leaveHand(color, id) {
    const p = S.P[color];
    U.rm(p.hand, id);
    Fx.lockDrop(color, id);
    if (D.fish[id].omen) Fx.dropOmen(color);
  },

  toHand(color, id) {
    S.P[color].hand.push(id);
  },

  discardFromHand(color, id) {
    Fx.leaveHand(color, id);
    Fx.toGrave(id);
  },

  async discSmall(color) {
    const p = S.P[color];
    const opts = [];
    for (const id of p.hand) {
      const f = D.fish[id];
      if (f.s === 's' && !f.novalue) opts.push({ id, label: f.n, fish: id });
    }
    if (opts.length === 0) return;
    const id = await Ask.pick(color, 'Bỏ 1 Fish nhỏ từ tay bạn', opts, { auto: true, tag: 'discSmall' });
    if (id !== null && id !== undefined) {
      Fx.discardFromHand(color, id);
      Log.say(color, `bỏ ${D.fish[id].n}.`);
    }
  },

  flipWorms(color) {
    const p = S.P[color];
    p.worms = !p.worms;
    Log.say(color, `lật Can of Worms ${p.worms ? 'ngửa' : 'úp'}.`);
  },

  discTopAll(k) {
    let n = 0;
    for (let d = 1; d <= 3; d++) {
      for (let col = 1; col <= 3; col++) {
        const sh = S.sea[d - 1][col - 1];
        for (let i = 0; i < k; i++) {
          if (sh.cards.length > 0) {
            const id = sh.cards.shift();
            sh.rev = false;
            Fx.toGrave(id);
            n++;
          }
        }
      }
    }
    Log.sys(`${n} Fish bị bỏ khỏi đỉnh các Shoal.`);
  },

  seaEmpty() {
    for (const row of S.sea) for (const sh of row) if (sh.cards.length > 0) return false;
    return true;
  },

  // PEEKS / REVEALS --------------------------------------------------------------------------------
  shoalName: (d, col) => `Depth ${ROMAN[d - 1]} / Cột ${col}`,

  /** returns [d, col] or null */
  async pickShoal(me, title, filter, exclude) {
    const opts = [];
    for (let d = 1; d <= 3; d++) {
      for (let col = 1; col <= 3; col++) {
        const sh = S.sea[d - 1][col - 1];
        if (sh.cards.length > 0 && (!filter || filter(d, col, sh)) && !(exclude && exclude[d * 10 + col])) {
          let l = `${Fx.shoalName(d, col)} (${sh.cards.length})`;
          if (sh.rev) l += ` - ${D.fish[sh.cards[0]].n}`;
          opts.push({ id: d * 10 + col, label: l, shoal: [d, col] });
        }
      }
    }
    if (opts.length === 0) return null;
    const r = await Ask.pick(me, title, opts, { auto: true, cols: 3, tag: 'shoal' });
    if (r === null || r === undefined) return null;
    return [Math.floor(r / 10), r % 10];
  },

  fishInfo: (id) => [D.fishLine(id), D.fishText(id)],

  async peekTop(me, d, col) {
    const sh = S.sea[d - 1][col - 1];
    const id = sh.cards[0];
    if (id === undefined) {
      await Ask.ok(me, `Xem lén: ${Fx.shoalName(d, col)}`, ['Shoal này đã hết Fish.']);
      return null;
    }
    await Ask.ok(me, `Xem lén: ${Fx.shoalName(d, col)}`, Fx.fishInfo(id), 'OK', [fishShow(id)]);
    Log.say(me, 'xem lén một Fish.');
    return id;
  },

  async peekAny(me, n) {
    const seen = {};
    for (let i = 0; i < n; i++) {
      const r = await Fx.pickShoal(me, 'Xem lén Fish trên cùng của Shoal nào?', null, seen);
      if (!r) return;
      seen[r[0] * 10 + r[1]] = true;
      await Fx.peekTop(me, r[0], r[1]);
    }
  },

  async peekLine(me, mode) {
    let kind = mode;
    if (mode === 'any') {
      kind = await Ask.pick(
        me,
        'Xem lén một hàng hay một cột?',
        [
          { id: 'row', label: 'Một hàng (một Depth)' },
          { id: 'col', label: 'Một cột' },
        ],
        { tag: 'rowcol' },
      );
    }
    const cells = [];
    let title;
    if (kind === 'row') {
      const r = await Ask.pick(
        me,
        'Hàng nào?',
        [
          { id: 1, label: 'Depth I' },
          { id: 2, label: 'Depth II' },
          { id: 3, label: 'Depth III' },
        ],
        { tag: 'row' },
      );
      if (!r) return;
      for (let col = 1; col <= 3; col++) cells.push([r, col]);
      title = `Xem lén: Depth ${ROMAN[r - 1]}`;
    } else {
      const r = await Ask.pick(
        me,
        'Cột nào?',
        [
          { id: 1, label: 'Cột 1 (trái)' },
          { id: 2, label: 'Cột 2' },
          { id: 3, label: 'Cột 3 (phải)' },
        ],
        { tag: 'col' },
      );
      if (!r) return;
      for (let d = 1; d <= 3; d++) cells.push([d, r]);
      title = `Xem lén: Cột ${r}`;
    }
    const info = [];
    const show = [];
    for (const cl of cells) {
      const sh = S.sea[cl[0] - 1][cl[1] - 1];
      const id = sh.cards[0];
      info.push(`${Fx.shoalName(cl[0], cl[1])}: ${id !== undefined ? D.fishLine(id) : 'trống'}`);
      if (id !== undefined) {
        info.push(`   ${D.fishText(id)}`);
        show.push(fishShow(id));
      }
    }
    await Ask.ok(me, title, info, 'OK', show);
    Log.say(me, `xem lén ${kind === 'row' ? 'một hàng' : 'một cột'}.`);
  },

  /** peek at the top k Fish of a face-down Shoal and put them back in any order */
  async reorderTop(me, d, col, k) {
    const sh = S.sea[d - 1][col - 1];
    const n = Math.min(k, sh.cards.length);
    if (n === 0) return;
    const cards = sh.cards.slice(0, n);
    const info = [];
    cards.forEach((id, i) => {
      info.push(`${i + 1}. ${D.fishLine(id)}`);
      info.push(`    ${D.fishText(id)}`);
    });
    const show = cards.map(fishShow);
    if (n === 1) {
      await Ask.ok(me, `Xem lén: ${Fx.shoalName(d, col)}`, info, 'OK', show);
      return;
    }
    const order = [];
    const rest = cards.slice();
    while (rest.length > 1) {
      const opts = rest.map((id, i) => ({ id: i, label: D.fish[id].n, fish: id }));
      const r = await Ask.pick(me, `Đặt Fish nào ${order.length === 0 ? 'lên TRÊN CÙNG' : 'tiếp theo'}?`, opts, { info, tag: 'reorder', show });
      order.push(rest.splice(r || 0, 1)[0]);
    }
    order.push(rest[0]);
    for (let i = 0; i < n; i++) sh.cards[i] = order[i];
    Log.say(me, `sắp xếp lại đỉnh ${Fx.shoalName(d, col)}.`);
  },

  async peekReorder(me, k) {
    const r = await Fx.pickShoal(me, `Xem lén ${k} Fish trên cùng của Shoal nào?`, (dd, cc, sh) => !sh.rev);
    if (r) await Fx.reorderTop(me, r[0], r[1], k);
  },

  async peekUnder(c, mayReveal) {
    const sh = S.sea[c.d - 1][c.col - 1];
    const idx = sh.cards[0] === c.id ? 1 : 0;
    const id = sh.cards[idx];
    if (id === undefined) {
      await Ask.ok(c.me, 'Xem lén bên dưới', ['Bên dưới không có Fish nào.']);
      return;
    }
    if (mayReveal) {
      const r = await Ask.pick(
        c.me,
        'Fish nằm bên dưới',
        [
          { id: 'rev', label: 'Lật nó lên' },
          { id: 'no', label: 'Để nguyên úp' },
        ],
        { info: Fx.fishInfo(id), show: [fishShow(id)], tag: 'peekUnder' },
      );
      if (r === 'rev' && idx === 0) await Fx.revealTop(c.me, c.d, c.col);
    } else {
      await Ask.ok(c.me, 'Xem lén bên dưới', Fx.fishInfo(id), 'OK', [fishShow(id)]);
    }
  },

  // REVEAL -------------------------------------------------------------------------------------------
  /** Resolve Reveal abilities of c.id (Rod of the Dead lets the player decline each). */
  async triggerR(c) {
    const f = D.fish[c.id];
    if (!f.R) return;
    const p = S.P[c.me];
    if (p.rodE !== false && D.rod[p.rodE].dead) {
      let declined = false;
      for (const part of f.R) {
        const ok = await Ask.yn(c.me, 'Rod of the Dead: kích hoạt Reveal ability này?', [`${f.n}: ${part.d}`], 'Kích hoạt', 'Bỏ qua', [fishShow(c.id)]);
        if (ok) {
          await part.f(c);
          if (c.ended || S.over) break;
        } else {
          declined = true;
        }
      }
      if (declined && f.nodiff && !c.ended && Fx.shoalPeek(c) === c.id) {
        Fx.shoalPop(c);
        Fx.toGrave(c.id);
        c.ended = true;
        Log.say(c.me, `bỏ qua Reveal của ${f.n} - nó bị bỏ đi và lượt kết thúc.`);
      }
    } else {
      await A.run(f.R, c);
    }
  },

  shoalPeek: (c) => S.sea[c.d - 1][c.col - 1].cards[0],

  /** reveal the top Fish of a Shoal via an item/ability (not a fishing action) */
  async revealTop(me, d, col) {
    const sh = S.sea[d - 1][col - 1];
    if (sh.cards.length === 0 || sh.rev) return null;
    sh.rev = true;
    const id = sh.cards[0];
    Log.say(me, `lật ${D.fish[id].n} (${Fx.shoalName(d, col)}).`);
    const c = { me, d, col, id, fishing: false };
    await Fx.triggerR(c);
    return c;
  },

  async revealColumn(c) {
    for (let d = 1; d <= 3; d++) {
      if (d !== c.d) await Fx.revealTop(c.me, d, c.col);
    }
  },

  /** mode: 'col' (choose a column), 'all' (every Shoal), null (any number, any order) */
  async revealAny(me, mode) {
    const cells = [];
    if (mode === 'col') {
      const r = await Ask.pick(
        me,
        'Lật cột nào?',
        [
          { id: 1, label: 'Cột 1 (trái)' },
          { id: 2, label: 'Cột 2' },
          { id: 3, label: 'Cột 3 (phải)' },
        ],
        { tag: 'col' },
      );
      if (!r) return;
      for (let d = 1; d <= 3; d++) cells.push([d, r]);
    } else {
      for (let d = 1; d <= 3; d++) for (let col = 1; col <= 3; col++) cells.push([d, col]);
    }
    for (;;) {
      const opts = [];
      cells.forEach((cl, i) => {
        const sh = S.sea[cl[0] - 1][cl[1] - 1];
        if (sh.cards.length > 0 && !sh.rev) opts.push({ id: i, label: Fx.shoalName(cl[0], cl[1]), shoal: cl });
      });
      if (opts.length === 0) return;
      const allowStop = mode === null || mode === undefined;
      if (allowStop) opts.push({ id: 'done', label: 'Dừng lật' });
      const r = await Ask.pick(me, 'Lật Shoal nào tiếp theo?', opts, { auto: !allowStop, cols: 3, tag: 'shoal' });
      if (r === null || r === 'done') return;
      await Fx.revealTop(me, cells[r][0], cells[r][1]);
      if (S.over) return;
    }
  },

  // OTHER CARD ACTIONS ---------------------------------------------------------------------------------
  clawHammer(color) {
    const p = S.P[color];
    let n = 0;
    for (let i = 0; i < 3; i++) {
      if (p.mount[i]) {
        p.hand.push(p.mount[i]);
        p.mount[i] = false;
        n++;
      }
    }
    if (p.clo) {
      p.hand.push(p.clo);
      p.clo = false;
      n++;
    }
    Log.say(color, `đưa ${n} Fish đã Mount về tay bằng Claw Hammer.`);
  },

  async hadalShade(c) {
    const victims = [];
    for (const col of S.order) {
      if (col !== c.me) {
        const q = S.P[col];
        for (let i = 1; i <= 3; i++) if (q.mount[i - 1]) victims.push({ who: col, slot: i });
      }
    }
    if (victims.length === 0) return;
    const opts = victims.map((v, i) => ({
      id: i,
      label: `${nm(v.who)}: ${D.fish[S.P[v.who].mount[v.slot - 1]].n} (slot ×${Rl.mountMult(v.slot)})`,
      fish: S.P[v.who].mount[v.slot - 1],
    }));
    opts.push({ id: 'no', label: 'Không đổi' });
    const r = await Ask.pick(c.me, 'Hadal Shade: rút 3 Regret để đổi nó lấy Fish đã Mount của người khác?', opts, { tag: 'hadal', show: [fishShow(c.id)] });
    if (r === 'no' || r === null) return;
    const v = victims[r];
    const q = S.P[v.who];
    await Fx.draw(c.me, 3);
    const theirs = q.mount[v.slot - 1];
    q.mount[v.slot - 1] = c.id;
    Fx.toHand(c.me, theirs);
    c.keep = false;
    c.stolen = true;
    Log.say(c.me, `đổi Hadal Shade lấy ${D.fish[theirs].n} mà ${nm(v.who)} đã Mount.`);
  },
};
