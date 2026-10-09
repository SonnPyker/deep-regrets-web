// Card database + ability builders (ported from the Tabletop Simulator automation, texts in Vietnamese).
// Abilities are lists of "parts" {d: description, f: async (c) => ...}; c is the effect context.
// Fish ids: depth*100 + index (index = position in the printed deck sheet = image file name).

import { S } from './state.js';
import { U, rnd } from './util.js';
import { Ask, Log } from './core.js';
import { Fx } from './fx.js';

export const D = { fish: {}, dink: {}, sup: {}, rod: {}, reel: {}, big: {} };
export const A = {};

const P = (d, f) => [{ d, f }];
export const cat = (...lists) => lists.flat();
A.cat = cat;
A.P = P;
A.fn = (d, f) => P(d, f);

A.txt = (parts) => parts.map((p) => p.d).join(' + ');

A.run = async (parts, c) => {
  for (const p of parts) {
    await p.f(c);
    if (S.over) return;
  }
};

A.draw = (n) => P(`rút ${n} Regret`, (c) => Fx.draw(c.me, n));
A.dis = (n) => P(`bỏ ${n} Regret`, (c) => Fx.disc(c.me, n, false));
A.disr = (n) => P(`bỏ ${n} Regret ngẫu nhiên`, (c) => Fx.disc(c.me, n, true));
A.inc = (n) => P(`Increment ×${n}`, (c) => Fx.inc(c.me, n));
A.ref = (n) => P(`Refresh ×${n}`, (c) => Fx.ref(c.me, n));
A.rr1 = () => P('reroll 1 xúc xắc Fresh', (c) => Fx.rerollFresh(c.me, 1));
A.rrAll = () => P('reroll tất cả xúc xắc Fresh', (c) => Fx.rerollAll(c.me));
A.allDraw = (n) =>
  P(`mọi người rút ${n} Regret`, async () => {
    await Fx.forAll((q) => Fx.draw(q, n));
  });
A.othDraw = (n) =>
  P(`mọi người khác rút ${n} Regret`, async (c) => {
    await Fx.forOthers(c.me, (q) => Fx.draw(q, n));
  });
A.allDis = (n) =>
  P(`mọi người bỏ ${n} Regret`, async () => {
    await Fx.forAll((q) => Fx.disc(q, n, false));
  });
A.seaDis = (n) =>
  P(`mọi người đang ở Biển bỏ ${n} Regret`, async () => {
    await Fx.forSea((q) => Fx.disc(q, n, false));
  });
A.seaDraw = (n) =>
  P(`mọi người đang ở Biển rút ${n} Regret`, async () => {
    await Fx.forSea((q) => Fx.draw(q, n));
  });
A.peek = (n) => P(`xem lén ${n} Fish`, (c) => Fx.peekAny(c.me, n));
A.peekLine = (mode) => {
  const t = { row: 'một hàng', col: 'một cột', any: 'một hàng hoặc một cột' };
  return P(`xem lén ${t[mode]}`, (c) => Fx.peekLine(c.me, mode));
};
A.gain = (n) => P(`nhận ${n}$`, (c) => Fx.gain(c.me, n));
A.supply = (n) => P(`lấy ${n} lá Supply`, (c) => Fx.supply(c.me, n));
A.coin = (h, t) =>
  P(`tung Fishcoin: ngửa = ${A.txt(h)}; sấp = ${A.txt(t)}`, async (c) => {
    if (S.mode === 'solo') return;
    const r = Fx.coin(c.me);
    if (r === 'h') await A.run(h, c);
    else await A.run(t, c);
  });
A.orx = (a, b) =>
  P(`${A.txt(a)} HOẶC ${A.txt(b)}`, async (c) => {
    const r = await Ask.pick(
      c.me,
      'Chọn một',
      [
        { id: 'a', label: U.cap(A.txt(a)) },
        { id: 'b', label: U.cap(A.txt(b)) },
      ],
      { tag: 'orx' },
    );
    if (r === 'a') await A.run(a, c);
    else await A.run(b, c);
  });

// helper predicates ---------------------------------------------------------------
const isShark = (id) => !!D.fish[id] && D.fish[id].n.includes('Shark');
D.isShark = isShark;
const isSmall = (id) => !!D.fish[id] && D.fish[id].s === 's';
const isLarge = (id) => !!D.fish[id] && D.fish[id].s === 'l';

// generic "reveal X from hand to catch automatically"
const revealToCatch = (label, pred) =>
  P(`lật ${label} từ tay để bắt con này tự động`, async (c) => {
    const p = S.P[c.me];
    const opts = [];
    for (const id of p.hand) if (pred(id)) opts.push({ id, label: D.fish[id].n, fish: id });
    if (opts.length === 0) return;
    opts.push({ id: 'no', label: 'Không, câu bình thường' });
    const r = await Ask.pick(c.me, `Lật ${label} để bắt ${D.fish[c.id].n} tự động?`, opts, { show: [{ t: 'fish', id: c.id }], tag: 'revealToCatch' });
    if (r !== 'no') {
      Log.say(c.me, `lật ${D.fish[r].n} từ tay: ${D.fish[c.id].n} được bắt tự động.`);
      c.auto = true;
    }
  });

const giveAway = () =>
  P('tặng con này cho người chơi khác tùy chọn (kết thúc lượt câu)', async (c) => {
    const to = await Fx.chooseOther(c.me, `Tặng ${D.fish[c.id].n} cho ai?`);
    Fx.shoalPop(c);
    if (to) {
      Log.say(c.me, `tặng ${D.fish[c.id].n} cho ${Log.nm(to)}.`);
      Fx.toHand(to, c.id);
    } else {
      Fx.toGrave(c.id);
    }
    c.ended = true;
  });

const giveMostRegrets = () =>
  P('đưa con này cho người có nhiều Regret nhất (hòa: bỏ đi)', (c) => {
    let best = -1;
    let who = null;
    let tie = false;
    for (const col of S.order) {
      const n = S.P[col].reg.length;
      if (n > best) {
        best = n;
        who = col;
        tie = false;
      } else if (n === best) tie = true;
    }
    Fx.shoalPop(c);
    if (tie || !who) {
      Log.say(c.me, `${D.fish[c.id].n} bị bỏ đi (hòa số Regret).`);
      Fx.toGrave(c.id);
    } else {
      Log.say(c.me, `${D.fish[c.id].n} thuộc về ${Log.nm(who)} (nhiều Regret nhất).`);
      Fx.toHand(who, c.id);
    }
    c.ended = true;
  });

const passOnMiss = (dirText, step) =>
  P(`nếu không bắt được, đưa nó cho người bên ${dirText} của bạn`, (c) => {
    c.onMiss = () => {
      if (S.order.length < 2) return;
      const i = S.order.indexOf(c.me);
      const n = S.order.length;
      const to = S.order[(((i + step) % n) + n) % n];
      Fx.shoalPop(c);
      Log.say(c.me, `${D.fish[c.id].n} trượt khỏi lưỡi câu và sang tay ${Log.nm(to)}.`);
      Fx.toHand(to, c.id);
    };
  });

const setDiff = (n) => P(`Difficulty = ${n} trong lượt này`, (c) => {
  c.dset = n;
});

const special = (txt, f) =>
  P(txt, async (c) => {
    await f(c);
    c.ended = true;
  });

const visitor = (nDraw, nSup) =>
  special(`rút ${nDraw} Regret, lấy ${nSup} lá Supply, bỏ lá này (kết thúc lượt)`, async (c) => {
    await Fx.draw(c.me, nDraw);
    Fx.shoalPop(c);
    Fx.toGrave(c.id);
    Fx.supply(c.me, nSup);
  });

// Fish table ------------------------------------------------------------------------
// F(depth, idx, name, size s/m/l, 'fair'|'foul', value, difficulty, extra)
function F(d, i, n, s, al, v, df, x = {}) {
  const f = { id: d * 100 + i, d, i, n, s, foul: al === 'foul', v, df };
  Object.assign(f, x);
  if (f.df === null || f.df === undefined) f.nodiff = true;
  D.fish[f.id] = f;
  return f;
}
const tentSet = {
  1: [3, 15, 21, 28, 33, 38],
  2: [4, 9, 22, 23, 28, 40],
  3: [1, 21, 25, 26, 37, 40],
};

const discSmallC = A.fn('bỏ 1 Fish nhỏ từ tay', (c) => Fx.discSmall(c.me));
const flipW = A.fn('lật Can of Worms', (c) => Fx.flipWorms(c.me));
const nil = null;

// DEPTH I ---------------------------------------------------------------------
F(1, 0, 'Hammerhead Shark', 'l', 'fair', 5, 3, { C: discSmallC, E: A.inc(2) });
F(1, 1, 'Barracuda', 'm', 'fair', 4, 3, { E: cat(A.inc(1), A.disr(2)) });
F(1, 2, 'Sheepshead', 'm', 'fair', 2, 1, { E: cat(A.inc(1), A.dis(1)) });
F(1, 3, 'Giant Cuttlefish', 'm', 'fair', 3, 3, {
  C: A.fn('có thể đổi con này (không nhìn) lấy con nằm dưới', async (c) => {
    const sh = S.sea[c.d - 1][c.col - 1];
    if (sh.cards.length === 0) return;
    const r = await Ask.pick(
      c.me,
      'Giant Cuttlefish: đổi lấy con Fish nằm dưới (không được nhìn)?',
      [
        { id: 'y', label: 'Đổi' },
        { id: 'n', label: 'Giữ Giant Cuttlefish' },
      ],
      { tag: 'yn' },
    );
    if (r === 'y') {
      const under = sh.cards.shift();
      sh.cards.unshift(c.id);
      sh.rev = false;
      c.id = under;
      c.swapped = true;
      Log.say(c.me, 'đổi Giant Cuttlefish lấy con Fish nằm dưới.');
    }
  }),
});
F(1, 4, 'Sockeye Salmon', 's', 'fair', 1, 1, { E: A.orx(A.inc(1), A.disr(1)) });
F(1, 5, "Halley's Folly", 'l', 'foul', 4, 4, { R: A.allDraw(1), E: cat(A.ref(2), A.draw(2)) });
F(1, 6, 'Eyefish', 's', 'foul', 0, 1, { C: cat(A.draw(1), A.peek(1)), E: cat(A.ref(2), A.draw(2)) });
F(1, 7, 'Tiger Shark', 'l', 'fair', 5, 3, { C: discSmallC, E: A.inc(2) });
F(1, 8, 'Whiptail Stingray', 'm', 'fair', 4, 3, { R: A.rr1(), E: cat(A.inc(2), A.dis(1)) });
F(1, 9, 'Striped Marlin', 'l', 'fair', 5, 4, { R: A.dis(1), E: cat(A.inc(2), A.dis(1)) });
F(1, 10, 'Goliath Grouper', 'l', 'fair', 4, 2, { E: cat(A.inc(2), A.dis(1)) });
F(1, 11, 'Ghoul Ray', 'm', 'foul', 2, 2, { C: A.draw(1), E: cat(A.ref(2), A.draw(2)) });
F(1, 12, 'Triggerfish', 's', 'fair', 1, 1, { E: A.orx(A.inc(1), A.disr(1)) });
F(1, 13, 'Coelacanth', 'l', 'fair', 4, 2, { E: cat(A.inc(2), A.disr(1)) });
F(1, 14, "Man O' War", 's', 'fair', 1, nil, { R: giveAway() });
F(1, 15, 'Tri-Tentacle', 'l', 'foul', 4, 4, {
  C: A.fn('rút 1 Regret cho mỗi Foul Fish trong tay', async (c) => {
    let n = 0;
    for (const id of S.P[c.me].hand) if (D.fish[id].foul) n++;
    if (n > 0) await Fx.draw(c.me, n);
  }),
});
F(1, 16, 'Scrat', 'm', 'foul', 3, 3, { R: passOnMiss('phải', -1), E: cat(A.ref(2), A.draw(2)) });
F(1, 17, 'Osteofish', 's', 'foul', 0, 0, { C: A.draw(1) });
F(1, 18, 'Parasitic Larvae', 'l', 'foul', 1, nil, {
  R: A.fn('bắt tự động; đặt ngửa trước mặt; mỗi lần rút Regret bạn rút thêm 1', (c) => {
    c.auto = true;
  }),
  disp: true,
  reg1: true,
});
F(1, 19, 'Filefish', 's', 'fair', 1, 1, { E: A.orx(A.inc(1), A.disr(1)) });
F(1, 20, 'Flounder', 's', 'fair', 2, 2, { E: A.orx(A.inc(1), A.disr(1)) });
F(1, 21, 'Blue-Ringed Octopus', 's', 'fair', 3, 2, { exact: 2, R: A.rrAll() });
F(1, 22, 'Sunfish', 'l', 'fair', 4, 2, { R: A.seaDis(1) });
F(1, 23, 'Swordfish', 'l', 'fair', 5, 4, { C: A.dis(1), E: cat(A.inc(2), A.dis(1)) });
F(1, 24, 'Tidal Trafficker', 's', 'fair', nil, nil, { special: true, novalue: true, R: visitor(1, 1) });
F(1, 25, 'Misery Stalker', 'l', 'foul', 2, nil, { R: giveMostRegrets() });
F(1, 26, 'Day Octopus', 'm', 'fair', 3, 2, { exact: 1, E: cat(A.inc(1), A.dis(1)) });
F(1, 27, 'Geist', 's', 'foul', 0, 0, { C: A.draw(1), E: cat(A.ref(1), A.draw(1)) });
F(1, 28, 'Blanket Octopus', 'l', 'fair', 5, 2, {
  C: A.fn('tung Fishcoin: ngửa = giữ; sấp = bỏ nó và rút 1 Dink', async (c) => {
    if (S.mode === 'solo') return;
    const r = Fx.coin(c.me);
    if (r === 't') {
      c.keep = false;
      Log.say(c.me, 'Blanket Octopus trượt đi - bạn rút 1 Dink thay thế.');
      await Fx.dink(c.me, 1);
    }
  }),
});
F(1, 29, 'Mahi-Mahi', 'm', 'fair', 2, 1, { E: cat(A.inc(2), A.disr(2)) });
F(1, 30, 'Cutthroat Trout', 's', 'fair', 1, 1, { E: A.orx(A.inc(1), A.disr(1)) });
F(1, 31, 'Black Seabass', 'm', 'fair', 2, 1, { E: cat(A.inc(1), A.dis(1)) });
F(1, 32, 'Payara', 'm', 'fair', 3, 2, { E: cat(A.inc(2), A.disr(1)) });
F(1, 33, 'Mimic Octopus', 's', 'fair', 3, nil, {
  R: special('đổi con này lấy 1 Fish nhỏ trong tay (không có: bỏ nó)', async (c) => {
    const p = S.P[c.me];
    const opts = [];
    for (const id of p.hand) if (isSmall(id) && !D.fish[id].novalue) opts.push({ id, label: D.fish[id].n, fish: id });
    Fx.shoalPop(c);
    if (opts.length === 0) {
      Log.say(c.me, 'không có Fish nhỏ - Mimic Octopus bị bỏ đi.');
      Fx.toGrave(c.id);
      return;
    }
    const r = await Ask.pick(c.me, 'Mimic Octopus: đổi Fish nhỏ nào?', opts, { tag: 'mimic' });
    U.rm(p.hand, r);
    Fx.lockDrop(c.me, r);
    const sh = S.sea[c.d - 1][c.col - 1];
    sh.cards.unshift(r);
    sh.rev = true;
    Fx.toHand(c.me, c.id);
    Log.say(c.me, `đổi Mimic Octopus lấy ${D.fish[r].n} (giờ nằm ngửa trên Shoal).`);
  }),
});
F(1, 34, 'Foot', 's', 'foul', 0, 0, { R: A.allDraw(1), E: cat(A.ref(1), A.draw(1)) });
F(1, 35, 'Tumorous Fish', 'm', 'foul', 2, 2, { C: A.draw(1), E: cat(A.ref(2), A.draw(2)) });
F(1, 36, 'Pram', 'm', 'foul', 0, 1, { R: A.allDraw(1) });
F(1, 37, 'Cax', 'l', 'foul', 3, 3, { R: A.othDraw(1), E: cat(A.ref(2), A.draw(2)) });
F(1, 38, 'Sea Cattle', 'm', 'foul', 3, 2, { E: A.draw(5) });
F(1, 39, 'Fugu', 's', 'fair', 3, 3, { R: setDiff(2), E: A.coin(A.dis(3), A.draw(1)) });
F(1, 40, 'Flying Gurnard', 's', 'fair', 1, 1, { E: A.orx(A.inc(1), A.disr(1)) });
F(1, 41, 'Black Scabbardfish', 'm', 'fair', 3, 2, { E: cat(A.inc(1), A.dis(1)) });
F(1, 42, 'Lionfish', 's', 'fair', 1, 1, { R: A.rr1(), E: cat(A.inc(1), A.dis(1)) });
F(1, 43, 'Corpse', 'm', 'foul', 1, 2, { R: A.allDraw(1), E: cat(A.ref(2), A.draw(3)) });
F(1, 44, 'Manta Ray', 'l', 'fair', 4, 3, { R: A.seaDis(1) });

// DEPTH II --------------------------------------------------------------------
F(2, 0, 'Porcupine Fish', 's', 'fair', 4, 4, { R: setDiff(2), E: A.coin(A.dis(4), A.draw(2)) });
F(2, 1, 'Bubo', 'm', 'foul', 3, 3, { R: A.allDraw(1), E: cat(A.ref(1), A.draw(1)) });
F(2, 2, 'Whispering Skull', 's', 'foul', nil, 2, {
  novalue: true,
  disp: true,
  skull: true,
  C: cat(A.draw(2), A.fn('đặt ngửa: mỗi lượt có thể xem lén 1 Fish tùy chọn', () => {})),
});
F(2, 3, 'Sub Matriarch', 'l', 'foul', 6, 2, {
  dyn: (c, p) => p.hand.length,
  dynTxt: '+1 Difficulty cho mỗi Fish trong tay bạn',
});
F(2, 4, 'Psychic Interloper', 's', 'foul', 3, 2, {
  E: A.fn('rút số Regret bằng số người chơi, xem và đưa mỗi người 1 lá', (c) => Fx.interloper(c.me)),
});
F(2, 5, 'Mermaid', 'm', 'foul', 4, 4, { C: cat(A.draw(1), A.peek(2)), E: cat(A.ref(2), A.draw(1), A.peek(2)) });
F(2, 6, 'Spider Crab', 'm', 'fair', 4, 3, { E: cat(A.inc(2), A.disr(2)) });
F(2, 7, 'Siren', 'm', 'foul', 5, 3, {
  R: A.fn('mọi người ở Biển có thể rút 1 Regret và chuyển thuyền xuống Depth II', () => Fx.mayDive(2)),
});
F(2, 8, 'Amulet of Agartha', 's', 'foul', nil, 3, {
  novalue: true,
  disp: true,
  omen: true,
  C: cat(A.draw(3), A.fn('nhận Omen Die làm một xúc xắc của bạn', (c) => Fx.takeOmen(c.me))),
});
F(2, 9, 'Nautilus', 's', 'fair', 3, 2, { fixed3: true });
F(2, 10, 'Iron Coffin', 'm', 'foul', nil, 0, { novalue: true, disp: true, coffin: true, C: A.draw(2) });
F(2, 11, 'Lamprey', 's', 'fair', 2, 1, { R: revealToCatch('một Fish Large', isLarge), E: A.inc(2) });
F(2, 12, 'Frilled Shark', 'm', 'fair', 4, 2, { C: discSmallC, E: A.inc(2) });
F(2, 13, 'Remora', 's', 'fair', 2, 1, { R: revealToCatch('một con Shark', isShark), E: A.inc(2) });
F(2, 14, 'Colossal Squid', 'l', 'fair', 3, nil, {
  R: A.fn('bắt tự động; đặt ngửa; bạn chỉ được câu ở cột này', (c) => {
    c.auto = true;
  }),
  disp: true,
  lock: true,
});
F(2, 15, 'Rotfish', 's', 'foul', 3, 2, { C: cat(A.draw(1), flipW), E: cat(A.ref(1), A.draw(1), flipW) });
F(2, 16, 'Northern Stargazer', 's', 'fair', 3, 2, {
  R: P('nếu không bắt được, xáo nó vào lại Shoal này', (c) => {
    c.onMiss = () => {
      const sh = S.sea[c.d - 1][c.col - 1];
      Fx.shoalPop(c);
      sh.cards.splice(rnd(sh.cards.length + 1) - 1, 0, c.id);
      sh.rev = false;
      Log.say(c.me, 'Northern Stargazer được xáo trở lại Shoal.');
    };
  }),
});
F(2, 17, 'Humpback Whale', 's', 'fair', nil, nil, {
  special: true,
  novalue: true,
  R: special('mọi người bỏ 2 Regret và Increment 1 lần; bỏ lá này; KHÔNG tính là action', async (c) => {
    Fx.shoalPop(c);
    Fx.toGrave(c.id);
    await Fx.forAll(async (q) => {
      await Fx.disc(q, 2, false);
      await Fx.inc(q, 1);
    });
    c.free = true;
  }),
});
F(2, 18, 'Selkie', 'l', 'foul', 6, 5, {
  C: A.coin(
    A.gain(3),
    A.fn('mọi người khác nhận 1$', (c) => Fx.forOthers(c.me, (q) => Fx.gain(q, 1))),
  ),
});
F(2, 19, 'Stye Eel', 's', 'foul', 3, 3, { exact: 1, C: cat(A.draw(1), A.peek(1)), E: cat(A.draw(1), A.peek(2)) });
F(2, 20, 'Green Moray', 'm', 'fair', 3, 2, { exact: 1, E: A.inc(2) });
F(2, 21, 'Orca', 'l', 'fair', 0, 3, { disp: true, dFoul: -1 });
F(2, 22, 'Overmind', 'm', 'foul', 5, 3, { must: true });
F(2, 23, 'Giant Squid', 'l', 'fair', 5, 3, { R: revealToCatch('một con Shark', isShark) });
F(2, 24, 'Box Jellyfish', 'm', 'fair', 3, 2, { R: A.rr1() });
F(2, 25, 'Giant Octopus', 'l', 'fair', 6, 4, { exact: 2, E: cat(A.inc(3), A.dis(1)) });
F(2, 26, 'Halibut', 'm', 'fair', 3, 2, { E: cat(A.inc(2), A.disr(2)) });
F(2, 27, 'Dunkleosteus', 'l', 'foul', 6, 5, {
  C: cat(
    A.draw(1),
    A.fn('bỏ Fish trên cùng của mọi Shoal', () => Fx.discTopAll(1)),
  ),
});
F(2, 28, 'Vampire Squid', 'm', 'fair', 4, 4, {
  dyn: () => {
    let n = 0;
    for (const col of S.order) {
      const q = S.P[col];
      if (q.loc === 'sea' && q.dep === 2) n++;
    }
    return -n;
  },
  dynTxt: '-1 Difficulty cho mỗi người chơi đang ở Depth II',
  E: cat(A.inc(3), A.dis(1)),
});
F(2, 29, 'Bluefin Tuna', 'l', 'fair', 5, 3, { C: A.allDis(1), E: cat(A.inc(3), A.disr(2)) });
F(2, 30, 'Bathyphysa Conifera', 's', 'fair', 2, nil, { R: giveAway() });
F(2, 31, 'Monkfish', 'm', 'fair', 4, 3, { E: cat(A.inc(2), A.disr(2)) });
F(2, 32, 'Midas Devil', 's', 'foul', 3, 3, {
  C: A.coin(
    A.gain(3),
    A.fn('mọi người khác nhận 1$', (c) => Fx.forOthers(c.me, (q) => Fx.gain(q, 1))),
  ),
});
F(2, 33, 'Bowel Angel', 'm', 'foul', 5, 4, { R: A.allDraw(1), E: cat(A.ref(2), A.draw(3)) });
F(2, 34, 'Sarcastic Fringehead', 's', 'fair', 3, 2, { E: A.inc(2) });
F(2, 35, 'Fried Egg Jellyfish', 's', 'fair', 2, 1, { R: A.rr1() });
F(2, 36, 'The Mollusk', 'm', 'foul', 4, 3, {
  R: A.fn('lật tất cả Fish trong cột này', (c) => Fx.revealColumn(c)),
  E: cat(A.draw(10), A.dis(8)),
});
F(2, 37, 'Brittle Lung', 'l', 'foul', 7, 5, {
  exact: 3,
  R: cat(
    A.draw(1),
    P('nếu không bắt được, bỏ nó đi', (c) => {
      c.onMiss = () => {
        Fx.shoalPop(c);
        Fx.toGrave(c.id);
        Log.say(c.me, 'Brittle Lung vỡ vụn và bị bỏ đi.');
      };
    }),
  ),
});
F(2, 38, 'Stoor Worm', 'l', 'foul', 7, 5, { C: cat(A.fn('bỏ 1 vật phẩm của bạn', (c) => Fx.discItem(c.me)), A.othDraw(1)) });
F(2, 39, 'Great White Shark', 'l', 'fair', 6, 4, {
  R: A.fn('mọi người bỏ 1 Fish nhỏ từ tay', () => Fx.forAll((q) => Fx.discSmall(q))),
});
F(2, 40, 'Hollow Earth Worm', 'l', 'foul', 6, 5, { wormOpt: true, C: A.draw(2) });
F(2, 41, 'Cruachan Spawn', 'l', 'foul', 5, 4, { C: A.coin(A.othDraw(2), A.draw(4)) });
F(2, 42, 'Sea Monkey', 'm', 'foul', 5, 4, {
  C: A.coin(
    A.fn('đưa mỗi người khác 1 Regret của bạn', (c) => Fx.seaMonkey(c.me, true)),
    A.fn('mỗi người khác đưa bạn 1 Regret của họ', (c) => Fx.seaMonkey(c.me, false)),
  ),
});
F(2, 43, 'Deep Dealer', 's', 'fair', nil, nil, { special: true, novalue: true, R: visitor(2, 2) });
F(2, 44, 'Grief Lurker', 'l', 'foul', 3, nil, { R: giveMostRegrets() });

// DEPTH III -------------------------------------------------------------------
F(3, 0, 'Writhing Mass', 'm', 'foul', 7, 5, { R: cat(A.rr1(), A.allDraw(1)) });
F(3, 1, 'Bane of the Stars', 'l', 'foul', 8, 6, {
  C: cat(
    A.draw(2),
    A.fn('chuyển mọi thuyền ở Biển xuống Depth II', () => Fx.allBoats(2)),
  ),
});
F(3, 2, 'No Face', 'm', 'foul', 5, 3, { R: revealToCatch('Two Face', (id) => id === 315), C: A.draw(2) });
F(3, 3, 'Bride of the Sea', 'm', 'foul', 6, 4, { C: A.coin(A.allDis(2), A.allDraw(2)) });
F(3, 4, 'Lanternfish', 's', 'fair', 4, 3, {
  R: A.fn('xem lén Fish nằm dưới con này', (c) => Fx.peekUnder(c, false)),
  E: A.inc(2),
});
F(3, 5, 'Barreleye', 's', 'fair', 3, 2, {
  R: A.fn('xem lén Fish ở Depth II trong cột này', (c) => Fx.peekTop(c.me, 2, c.col)),
  E: A.inc(2),
});
F(3, 6, 'Profound Peddler', 's', 'fair', nil, nil, { special: true, novalue: true, R: visitor(3, 3) });
F(3, 7, 'Giant Isopod', 'l', 'fair', 6, 6, { altPay: 'large' });
F(3, 8, 'Mermer', 's', 'foul', 6, 5, { R: setDiff(3), E: A.coin(A.dis(5), A.draw(4)) });
F(3, 9, 'Trauma Leech', 'l', 'foul', 4, nil, { R: giveMostRegrets() });
F(3, 10, 'Deepworm', 's', 'foul', 5, 3, { C: cat(A.draw(1), flipW), E: cat(A.ref(2), A.draw(2), flipW) });
F(3, 11, 'Gloom Orphan', 'l', 'foul', 5, nil, {
  R: A.fn('bắt tự động; đặt ngửa; mỗi lần rút Regret bạn rút thêm 1; chỉ được câu ở cột này', (c) => {
    c.auto = true;
  }),
  disp: true,
  reg1: true,
  lock: true,
});
F(3, 12, 'Abyssal Colony', 's', 'foul', 3, nil, { R: giveAway() });
F(3, 13, 'Slitmouth', 's', 'foul', 5, 4, { C: cat(A.draw(2), A.inc(1)), E: cat(A.ref(2), A.draw(2)) });
F(3, 14, 'Aphotic Asp', 's', 'foul', 5, 3, { C: A.draw(1), E: cat(A.ref(2), A.draw(2)) });
F(3, 15, 'Two Face', 'm', 'foul', 5, 3, { R: revealToCatch('No Face', (id) => id === 302), C: A.draw(2) });
F(3, 16, 'Goblin Shark', 'm', 'fair', 6, 4, { C: discSmallC });
F(3, 17, 'Kraken', 'l', 'foul', 9, 7, { exact: 3, R: cat(A.draw(3), A.othDraw(1)) });
F(3, 18, 'Rocabarraigh Denizen', 'l', 'foul', 8, 6, { C: cat(A.draw(2), A.othDraw(1)) });
F(3, 19, 'Varicolla', 's', 'foul', 5, 4, { C: cat(A.draw(2), A.ref(1)), E: cat(A.ref(2), A.draw(2)) });
F(3, 20, 'Sea Bishop', 'm', 'foul', 6, 4, {
  C: A.coin(
    A.gain(4),
    A.fn('mọi người khác nhận 2$', (c) => Fx.forOthers(c.me, (q) => Fx.gain(q, 2))),
  ),
});
F(3, 21, 'Dumbo Octopus', 's', 'fair', 3, 3, { R: A.dis(3), E: A.draw(2), giveAct: true });
F(3, 22, 'Pustor', 's', 'foul', 5, 3, { C: A.coin(A.othDraw(1), A.draw(3)) });
F(3, 23, 'Treasure Chest', 'l', 'fair', nil, 5, {
  novalue: true,
  C: cat(
    A.dis(3),
    A.gain(8),
    A.supply(3),
    A.fn('bỏ lá này', (c) => {
      c.keep = false;
    }),
  ),
});
F(3, 24, 'Whale of Rocabarraigh', 'l', 'fair', nil, nil, {
  special: true,
  novalue: true,
  R: special('mọi người rút 2 Regret và bỏ 1 vật phẩm; bỏ lá này; KHÔNG tính là action', async (c) => {
    Fx.shoalPop(c);
    Fx.toGrave(c.id);
    await Fx.forAll(async (q) => {
      await Fx.draw(q, 2);
      await Fx.discItem(q);
    });
    c.free = true;
  }),
});
F(3, 25, 'Hadal Shade', 'm', 'foul', 7, 5, {
  C: A.fn('có thể rút 3 Regret để đổi con này lấy Fish đã Mount của người khác', (c) => Fx.hadalShade(c)),
});
F(3, 26, 'Great Old One', 'l', 'foul', 8, 8, {
  R: A.fn('mọi người ở Biển có thể rút 1 Regret và chuyển thuyền xuống Depth III', () => Fx.mayDive(3)),
});
F(3, 27, 'Hagfish', 's', 'fair', 3, 2, { exact: 1, E: A.inc(2) });
F(3, 28, 'Gulper Eel', 'm', 'fair', 6, 4, { exact: 2 });
F(3, 29, 'Hollow Earth Infant', 'l', 'foul', 9, 8, {
  R: cat(A.draw(3), A.othDraw(1)),
  C: A.fn('bỏ 3 Fish trên cùng của mọi Shoal', () => Fx.discTopAll(3)),
});
F(3, 30, 'Kelpie', 'l', 'foul', 8, 6, { R: A.seaDraw(1) });
F(3, 31, 'Mass of Eyes', 'l', 'foul', 7, 4, { R: cat(A.draw(3), A.peek(3)), E: cat(A.draw(3), A.ref(2), A.peek(3)) });
F(3, 32, 'Anglerfish', 's', 'fair', 4, 3, {
  C: A.fn('xem lén Fish nằm dưới con này; có thể lật nó', (c) => Fx.peekUnder(c, true)),
  E: A.inc(2),
});
F(3, 33, 'Skitterfin', 's', 'foul', 5, 4, { R: passOnMiss('trái', 1), E: cat(A.ref(2), A.draw(2)) });
F(3, 34, 'Oarfish', 'm', 'fair', 6, 5, { R: A.allDis(1) });
F(3, 35, 'Magnapinna Squid', 'l', 'fair', 7, 6, {});
F(3, 36, 'Benthic Slug', 's', 'foul', 4, 2, { C: cat(A.draw(1), flipW), E: cat(A.ref(2), A.draw(2)) });
F(3, 37, 'Capitoctopus', 'm', 'foul', 6, 3, { exact: 3, C: A.draw(2) });
F(3, 38, 'Eversquid', 'm', 'foul', 2, 4, { disp: true, dFair: -1, C: A.draw(2) });
F(3, 39, 'Bathyal Queen', 'm', 'foul', 7, 5, {
  C: cat(
    A.draw(2),
    A.fn('lật bao nhiêu Fish tùy ý, theo thứ tự tùy ý', (c) => Fx.revealAny(c.me, null)),
  ),
});
F(3, 40, 'Sharpear Enope Squid', 's', 'fair', 4, 2, { nosell: true });
F(3, 41, 'Phantom Jellyfish', 'l', 'fair', 6, 4, { R: A.rr1() });
F(3, 42, 'The Plug', 's', 'fair', nil, nil, {
  special: true,
  novalue: true,
  plug: true,
  R: special('đặt lên bàn: đầu mỗi lượt của mỗi người chơi, Fish ở góc trên-trái của Biển bị bỏ; lượt của bạn kết thúc', (c) => {
    Fx.shoalPop(c);
    S.plug = true;
    Log.say(c.me, 'rút nút bịt The Plug! Từ giờ Biển cạn dần một Fish mỗi lượt.');
  }),
});
F(3, 43, 'Abyssal Star', 'm', 'foul', 6, 3, { C: cat(A.draw(2), A.peekLine('any')) });
F(3, 44, 'Human', 'm', 'foul', 6, 4, { R: A.allDraw(1), E: cat(A.ref(3), A.draw(3)) });

for (const [d, list] of Object.entries(tentSet)) {
  for (const i of list) D.fish[Number(d) * 100 + i].tent = true;
}
D.fish[107].v = 5; // Tiger Shark (printed 5; the workshop description says 3)

// DINKS -----------------------------------------------------------------------------
function dk(i, n, x = {}) {
  D.dink[i] = { ...x, id: i, n };
}
dk(0, 'Message in a Bottle', { dis: 1, t: 'bỏ 1 Regret' });
dk(1, 'Moon Jellyfish', { diff: 1, t: 'giảm 1 Difficulty của một Fish' });
dk(2, 'Whitebait', { diff: 1, t: 'giảm 1 Difficulty của một Fish' });
dk(3, 'Doll Head', { shop: 1, t: 'một Shop rẻ hơn 1$' });
dk(4, 'Locket', { shop: 1, t: 'một Shop rẻ hơn 1$' });
dk(5, 'Scad', { diff: 1, t: 'giảm 1 Difficulty của một Fish' });
dk(6, 'Tire', { shop: 1, t: 'một Shop rẻ hơn 1$' });
dk(7, 'Fish Head', { diff: 1, t: 'giảm 1 Difficulty của một Fish' });
dk(8, 'Pinfish', { diff: 1, t: 'giảm 1 Difficulty của một Fish' });
dk(9, 'Old Boot', { t: 'không có tác dụng' });
dk(10, 'Toe', { diff: 1, t: 'giảm 1 Difficulty của một Fish' });
dk(11, 'Clump of Seaweed', { t: 'không có tác dụng' });
dk(12, 'Syringe', { draw: 2, t: 'rút 2 Regret' });
dk(13, 'Ballyhoo', { diff: 1, t: 'giảm 1 Difficulty của một Fish' });
dk(14, 'Shrimp', { diff: 1, t: 'giảm 1 Difficulty của một Fish' });
dk(15, 'Ear', { diff: 1, shop: 1, t: 'giảm 1 Difficulty của một Fish HOẶC một Shop rẻ hơn 1$' });
dk(16, 'Pearl', { shop: 2, t: 'một Shop rẻ hơn 2$' });
dk(17, 'Sea Glass', { dis: 1, t: 'bỏ 1 Regret' });
dk(18, 'Pocket Watch', { shop: 1, t: 'một Shop rẻ hơn 1$' });
dk(19, 'Wallet', { shop: 1, t: 'một Shop rẻ hơn 1$' });
dk(20, 'Crab', { diff: 2, t: 'giảm 2 Difficulty của một Fish' });
dk(21, 'Eel', { diff: 2, t: 'giảm 2 Difficulty của một Fish' });
dk(22, 'Finger', { diff: 1, t: 'giảm 1 Difficulty của một Fish' });
dk(23, 'Bearer Bond', { shop: 2, t: 'một Shop rẻ hơn 2$' });
dk(24, 'Odd Ring', { draw: 2, t: 'rút 2 Regret', nosolo: true });

// SUPPLIES (single use) ---------------------------------------------------------------
function su(i, n, x) {
  D.sup[i] = { ...x, id: i, n };
}
su(0, 'Scotch Egg', { t: 'Refresh 1 xúc xắc', f: (c) => Fx.ref(c.me, 1) });
su(1, 'Curious Spyglass', { t: 'xem lén một cột', f: (c) => Fx.peekLine(c.me, 'col') });
su(2, 'Bucket of Chum', { t: 'rút 3 Regret và giảm Difficulty của một Fish xuống 0', diff: 99, f: (c) => Fx.draw(c.me, 3) });
su(3, 'Cask Ale', { t: 'bỏ 2 Regret', f: (c) => Fx.disc(c.me, 2, false) });
su(4, 'Absinthe', { t: 'bỏ 5 Regret ngẫu nhiên', f: (c) => Fx.disc(c.me, 5, true) });
su(5, 'Jar of Leeches', { t: 'giảm 4 Difficulty của một Fish', diff: 4, f: () => {} });
su(6, 'Mermaid Eyes', { t: 'xem lén 2 Fish', f: (c) => Fx.peekAny(c.me, 2) });
su(7, 'Claw Hammer', { t: 'chỉ ở Cảng: đưa mọi Fish đã Mount về tay', port: true, f: (c) => Fx.clawHammer(c.me) });
su(8, 'Book of the Deep', {
  t: 'rút 1 Regret và xem lén một hàng',
  f: async (c) => {
    await Fx.draw(c.me, 1);
    await Fx.peekLine(c.me, 'row');
  },
});
su(9, "Halley's Diving Bell", { t: 'chuyển thuyền của bạn xuống 1 Depth', sea: true, f: (c) => Fx.boatDown(c.me, 1) });
su(10, 'Restless Stone', {
  t: 'rút 2 Regret và Refresh 3 xúc xắc',
  f: async (c) => {
    await Fx.draw(c.me, 2);
    Fx.ref(c.me, 3);
  },
});
su(11, 'Diving Lantern', { t: 'lật một cột theo thứ tự tùy ý', f: (c) => Fx.revealAny(c.me, 'col') });
su(12, 'Moonshine', { t: 'bỏ 4 Regret ngẫu nhiên', f: (c) => Fx.disc(c.me, 4, true) });
su(13, 'Cloche', { t: 'Mount 1 Fish nhỏ lên đây (slot ×2, vĩnh viễn)', cloche: true, f: () => {} });
su(14, 'Black Tea', { t: 'bỏ 1 Regret', f: (c) => Fx.disc(c.me, 1, false) });
su(15, 'Cullen Skink', { t: 'Refresh 2 xúc xắc', f: (c) => Fx.ref(c.me, 2) });
su(16, 'Bag of Maggots', { t: 'giảm 2 Difficulty của một Fish', diff: 2, f: () => {} });
su(17, 'Heart of the Fathoms', { t: 'lật mọi Fish theo thứ tự tùy ý', f: (c) => Fx.revealAny(c.me, 'all') });
su(18, "Sea Monkey's Paw", {
  t: 'rút 1 Regret và Refresh 2 xúc xắc',
  f: async (c) => {
    await Fx.draw(c.me, 1);
    Fx.ref(c.me, 2);
  },
});
su(19, 'Barbadian Dark Rum', { t: 'bỏ 3 Regret', f: (c) => Fx.disc(c.me, 3, false) });

// RODS / REELS ------------------------------------------------------------------------
function ro(i, n, t, x = {}) {
  D.rod[i] = { ...x, id: i, n, t };
}
ro(0, 'Rod of the Infinite', 'Khi câu, có thể bỏ 1 Dink để xem lén 3 Fish trên cùng và sắp xếp lại', { peek3: true });
ro(1, 'Wood and Brass Rod', 'Fish cỡ Middling rẻ hơn 1', { size: 'm', red: 1 });
ro(2, 'Narwhal Rod', 'Mọi Fish rẻ hơn 1', { all: 1 });
ro(3, 'Rod of the Dead', 'Bỏ qua Reveal ability của Fish bạn lật (chọn mỗi lần)', { dead: true });
ro(4, 'Rod of Fortune', 'Fair Fish rẻ hơn 1', { foul: false, red: 1 });
ro(5, 'Rod of Manchineel', 'Foul Fish rẻ hơn 1', { foul: true, red: 1 });
ro(6, 'Lucky Pole', 'Fish đầu tiên mỗi ngày rẻ hơn 2', { first: 2 });
ro(7, 'Split Bamboo Pole', 'Fish cỡ Small rẻ hơn 1', { size: 's', red: 1 });
ro(8, 'Rod of the Deep', 'Khi câu, xem lén 2 Fish trên cùng của Shoal và sắp xếp lại', { peek2: true });
ro(9, 'Trolling Rod', 'Fish cỡ Large rẻ hơn 1', { size: 'l', red: 1 });

function re(i, n, t, x = {}) {
  D.reel[i] = { ...x, id: i, n, t };
}
re(0, 'Wood and Brass Reel', 'Mỗi ngày 1 lần: reroll tối đa 2 xúc xắc Fresh', { kind: 'rr', k: 2 });
re(1, 'Abyssal Reel', 'Mỗi ngày 1 lần: đặt 3 xúc xắc Fresh về mặt cao nhất', { kind: 'max', k: 3 });
re(2, 'Stop-Latch', 'Mỗi ngày 1 lần: đặt 1 xúc xắc Fresh về mặt cao nhất', { kind: 'max', k: 1 });
re(3, 'Reel of the Deep', 'Mỗi ngày 1 lần, khi ở Biển: đặt thuyền xuống Depth II', { kind: 'dep', to: 2 });
re(4, 'Reel of the Infinite', 'Mỗi ngày 1 lần, khi ở Biển: chuyển thuyền xuống 1 Depth', { kind: 'down' });
re(5, 'Reel of Fortune', 'Mỗi ngày 1 lần: reroll mọi xúc xắc Fresh cho đến khi mỗi viên > 1', { kind: 'fort' });
re(6, 'Centerpin Reel', 'Khi bạn rút Dink, rút 3 lá thay vì 1', { kind: 'pin' });
re(7, 'Manifold Reel', 'Mỗi ngày 1 lần: đặt 2 xúc xắc Fresh về mặt cao nhất', { kind: 'max', k: 2 });
re(8, 'Bone Wheel', 'Giữ lại điểm thừa trên xúc xắc (xoay xúc xắc xuống thay vì dùng hết)', { kind: 'bone' });
re(9, 'Solid Brass Reel', 'Mỗi ngày 1 lần: reroll bất kỳ số xúc xắc Fresh nào', { kind: 'rr', k: 99 });

// BIGGEST REGRETS (expansion) ---------------------------------------------------------------
// tier index: 4 = 13+ Regret cards, 3 = 7-12, 2 = 1-6, 1 = 0
const withMe = (c) => {
  const me = S.P[c.me];
  const r = [];
  for (const col of S.order) {
    const q = S.P[col];
    if (col !== c.me && q.loc === me.loc && (me.loc === 'port' || q.dep === me.dep)) r.push(col);
  }
  return r;
};
const alone = (c) => withMe(c).length === 0;
function bg(i, n, minPlayers, tiers) {
  D.big[i] = { id: i, n, minP: minPlayers, tiers };
}
bg(0, 'Curmudgeonly', 4, {
  4: A.fn('mọi người khác cùng vị trí/Depth rút 2 Regret', async (c) => {
    for (const col of withMe(c)) await Fx.draw(col, 2);
  }),
  3: A.fn('mọi người khác cùng vị trí/Depth rút 1 Regret', async (c) => {
    for (const col of withMe(c)) await Fx.draw(col, 1);
  }),
  2: A.fn('nếu ở một mình tại vị trí/Depth này: Increment ×3', (c) => {
    if (alone(c)) return Fx.inc(c.me, 3);
  }),
  1: A.fn('nếu ở một mình tại vị trí/Depth này: Increment ×2', (c) => {
    if (alone(c)) return Fx.inc(c.me, 2);
  }),
});
bg(1, 'Lonely', 4, {
  4: A.fn('nếu không ở một mình: bạn và mọi người cùng chỗ Increment ×2', async (c) => {
    const w = withMe(c);
    if (w.length > 0) {
      await Fx.inc(c.me, 2);
      for (const col of w) await Fx.inc(col, 2);
    }
  }),
  3: A.fn('nếu không ở một mình: bạn và mọi người cùng chỗ Increment ×1', async (c) => {
    const w = withMe(c);
    if (w.length > 0) {
      await Fx.inc(c.me, 1);
      for (const col of w) await Fx.inc(col, 1);
    }
  }),
  2: A.fn('nếu không ở một mình: Increment ×2', (c) => {
    if (!alone(c)) return Fx.inc(c.me, 2);
  }),
  1: A.fn('nếu không ở một mình: Increment ×1', (c) => {
    if (!alone(c)) return Fx.inc(c.me, 1);
  }),
});
bg(2, 'Neurotic', 1, {
  4: A.fn('xem lén Fish trên cùng của một Shoal và rút 2 Regret', async (c) => {
    await Fx.peekAny(c.me, 1);
    await Fx.draw(c.me, 2);
  }),
  3: A.fn('xem lén Fish trên cùng của một Shoal và rút 1 Regret', async (c) => {
    await Fx.peekAny(c.me, 1);
    await Fx.draw(c.me, 1);
  }),
  2: A.fn('xem lén 2 Fish trên cùng của một Shoal và sắp xếp lại', (c) => Fx.peekReorder(c.me, 2)),
  1: A.fn('xem lén Fish trên cùng của một Shoal', (c) => Fx.peekAny(c.me, 1)),
});
bg(3, 'Unambitious', 1, {
  4: A.fn('rút 1 Dink và 2 Regret', async (c) => {
    await Fx.dink(c.me, 1);
    await Fx.draw(c.me, 2);
  }),
  3: A.fn('rút 1 Dink và 1 Regret', async (c) => {
    await Fx.dink(c.me, 1);
    await Fx.draw(c.me, 1);
  }),
  2: A.fn('xem 5 Dink trên cùng và giữ 1', (c) => Fx.dinkLook(c.me, 5)),
  1: A.fn('xem 3 Dink trên cùng và giữ 1', (c) => Fx.dinkLook(c.me, 3)),
});
bg(4, 'Sentimental', 1, {
  4: A.fn('lấy 1 Regret ngẫu nhiên từ mỗi người khác, rồi bỏ đúng số đó', (c) => Fx.sentimental(c.me)),
  3: A.fn('đưa người khác 1 Regret của bạn', (c) => Fx.giveRegrets(c.me, 1)),
  2: A.fn('đưa người khác 2 Regret của bạn', (c) => Fx.giveRegrets(c.me, 2)),
  1: A.fn('bắt một người khác rút 1 Regret', async (c) => {
    const to = await Fx.chooseOther(c.me, 'Ai phải rút 1 Regret?');
    if (to) await Fx.draw(to, 1);
  }),
});

// text helpers ---------------------------------------------------------------------------
D.sizeName = (s) => ({ s: 'Small', m: 'Middling', l: 'Large' })[s] || '?';

D.fishLine = (id) => {
  const f = D.fish[id];
  if (!f) return '?';
  let t = `${f.n} (${D.sizeName(f.s)} ${f.foul ? 'Foul' : 'Fair'}`;
  if (f.v !== null && f.v !== undefined) t += `, giá trị ${f.v}`;
  if (f.df !== null && f.df !== undefined) t += `, Difficulty ${f.df}`;
  if (f.exact) t += `, đúng ${f.exact} xúc xắc`;
  return `${t})`;
};

D.fishText = (id) => {
  const f = D.fish[id];
  if (!f) return '';
  const t = [];
  if (f.R) t.push(`Reveal: ${A.txt(f.R)}`);
  if (f.C) t.push(`Catch: ${A.txt(f.C)}`);
  if (f.E) t.push(`Eat: ${A.txt(f.E)}`);
  if (f.dynTxt) t.push(f.dynTxt);
  if (f.dFoul) t.push('khi ở trước mặt bạn: Foul Fish rẻ hơn 1');
  if (f.dFair) t.push('khi ở trước mặt bạn: Fair Fish rẻ hơn 1');
  if (f.fixed3) t.push('giá trị luôn là 3');
  if (f.nosell) t.push('không thể bán hay Mount');
  if (f.must) t.push('bắt buộc bắt nếu có thể; tự động bị Mount khi bạn Make Port');
  if (f.wormOpt) t.push('có thể lật úp Can of Worms: Difficulty = 4');
  if (f.altPay) t.push('có thể bỏ 1 Fish Large từ tay để bắt miễn phí');
  if (f.giveAct) t.push('Action: tặng cho người khác, họ bỏ 4 Regret');
  if (f.skull) t.push('free action: xem lén 1 Fish (1 lần mỗi lượt)');
  if (f.coffin) t.push('free action: đưa tối đa 2 Regret cho người khác (họ có thể Refresh 1 xúc xắc)');
  if (f.plug) t.push('The Plug: mỗi lượt Fish ở góc trên-trái của Biển bị bỏ');
  if (f.lock) t.push('bạn chỉ được câu ở cột nơi bắt được nó');
  if (f.reg1) t.push('mỗi lần rút Regret bạn rút thêm 1');
  if (t.length === 0) return 'không có khả năng đặc biệt';
  return t.join(' | ');
};

// Image paths (relative to index.html) -----------------------------------------------------------
export const IMG = {
  fish: (id) => `assets/fish/${Math.floor(id / 100)}/${id % 100}.webp`,
  fishBack: (d) => `assets/back/fish${d}.webp`,
  dink: (id) => `assets/dink/${id}.webp`,
  dinkBack: 'assets/back/dink.webp',
  sup: (id) => `assets/supply/${id}.webp`,
  supBack: 'assets/back/supply.webp',
  rod: (id) => `assets/rod/${id}.webp`,
  rodBack: 'assets/back/rod.webp',
  reel: (id) => `assets/reel/${id}.webp`,
  reelBack: 'assets/back/reel.webp',
  big: (id) => `assets/big/${id}.webp`,
  bigBack: 'assets/back/big.webp',
  regret: (id) => {
    const v = Math.floor(id / 100) - 1;
    const k = id % 100;
    return `assets/regret/${v === 1 ? k : v === 2 ? 20 + k : v === 3 ? 40 + k : 50 + (k % 6)}.webp`;
  },
  regretBack: 'assets/back/regret.webp',
};
