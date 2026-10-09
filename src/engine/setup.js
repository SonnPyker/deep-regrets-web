// New game setup. The whole game is a pure function of (setup options incl. seed, answers).

import { S, RT, setState } from './state.js';
import { U, rnd } from './util.js';
import { COLORS, SEAT, Log } from './core.js';
import { D } from './data.js';

const SOLO_REMOVED = [114, 124, 230, 243, 217, 312, 306, 324];

export const Setup = {
  newPlayer(color) {
    return {
      c: color,
      name: SEAT[color].name,
      loc: 'sea',
      dep: 1,
      bucks: 0,
      dice: [
        { k: 'p', v: 1, fr: false },
        { k: 'p', v: 1, fr: false },
        { k: 'p', v: 1, fr: false },
      ],
      reg: [],
      lb: false,
      worms: true,
      hand: [],
      mount: [false, false, false],
      cloche: false,
      clo: false,
      dinks: [],
      items: [],
      rods: [],
      reels: [],
      rodE: false,
      reelE: false,
      big: false,
      pass: false,
      dy: { reel: false, big: false, shops: [], first: true, skull: false, bt: 0 },
      lock: [],
    };
  },

  /**
   * opts: { tent, big, short, seed, seats: {color: 'human'|'bot'} }; colors: list of seat colors.
   * Leaves the new state in S.
   */
  newGame(colors, opts) {
    const solo = colors.length === 1;
    const order = COLORS.filter((c) => colors.includes(c));
    const seed = (opts.seed === undefined ? Math.floor(Math.random() * 4294967296) : opts.seed) >>> 0;
    setState({ rng: seed });
    RT.log.length = 0;
    RT.lastDraw = {};
    RT.fly = null;
    RT.prompt = null;
    RT.pseq = 0;

    S.v = 1;
    S.seed = seed;
    S.mode = solo ? 'solo' : 'normal';
    S.opt = { tent: !!opts.tent, big: !!opts.big, short: !!opts.short };
    S.order = order;
    S.seats = {};
    for (const c of order) S.seats[c] = (opts.seats && opts.seats[c]) || 'human';
    S.first = order[rnd(order.length) - 1];
    S.day = 1;
    S.dayLast = solo ? 5 : 6;
    S.dayStart = 1;
    S.ph = 'start'; // start | refresh | declare | action | over
    S.turn = false;
    S.ex = false;
    S.P = {};
    S.sea = [];
    S.gy = [[], [], []];
    S.rd = [];
    S.rx = [];
    S.dk = [];
    S.sd = [];
    S.rod = [];
    S.reel = [];
    S.bigd = [];
    S.bag = { b: 9, g: 8, o: 7 };
    S.lp = false;
    S.om = false;
    S.plug = false;
    S.over = false;
    S.res = false;
    if (opts.short && !solo) {
      S.day = 2;
      S.dayStart = 2;
    }
    for (const c of order) S.P[c] = Setup.newPlayer(c);

    // Regret deck: 60 cards (10 x0, 20 x1, 20 x2, 10 x3); 10 per player in multiplayer.
    // Card ids are (value+1)*100 + k so that every card keeps its own art.
    const all = [];
    for (let k = 0; k < 10; k++) {
      all.push(100 + k);
      all.push(400 + k);
    }
    for (let k = 0; k < 20; k++) {
      all.push(200 + k);
      all.push(300 + k);
    }
    U.shuffle(all);
    const nreg = solo ? 60 : 10 * order.length;
    S.rd = all.slice(0, nreg);

    // Fish
    const removed = new Set(solo ? SOLO_REMOVED : []);
    for (let d = 1; d <= 3; d++) {
      const ids = [];
      for (let i = 0; i <= 44; i++) {
        const f = D.fish[d * 100 + i];
        if (f && (S.opt.tent || !f.tent) && !removed.has(f.id)) ids.push(f.id);
      }
      U.shuffle(ids);
      const row = [];
      const n = ids.length;
      const base = Math.floor(n / 3);
      const extra = n - base * 3;
      let pos = 0;
      for (let col = 1; col <= 3; col++) {
        const cnt = base + (col <= extra ? 1 : 0);
        row.push({ cards: ids.slice(pos, pos + cnt), rev: false });
        pos += cnt;
      }
      S.sea.push(row);
    }

    // Dinks / items
    for (let i = 0; i <= 24; i++) if (!(solo && D.dink[i].nosolo)) S.dk.push(i);
    U.shuffle(S.dk);
    for (let i = 0; i <= 19; i++) S.sd.push(i);
    for (let i = 0; i <= 9; i++) {
      S.rod.push(i);
      S.reel.push(i);
    }
    U.shuffle(S.sd);
    U.shuffle(S.rod);
    U.shuffle(S.reel);

    // Biggest Regrets (expansion)
    if (S.opt.big && !solo) {
      for (let i = 0; i <= 4; i++) if (D.big[i].minP <= order.length) S.bigd.push(i);
      U.shuffle(S.bigd);
      for (const c of order) S.P[c].big = S.bigd.length > 0 ? S.bigd.shift() : false;
    }

    Log.sys(
      `Ván mới: ${order.length} người chơi${solo ? ' (Ocean Survey - chơi một mình)' : ''}${S.opt.tent ? ', Lamentable Tentacles' : ''}${S.opt.short ? ', ván ngắn' : ''}${S.opt.big ? ', Biggest Regrets' : ''}`,
    );
    return S;
  },
};
