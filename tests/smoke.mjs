import { S, RT } from '../src/engine/state.js';
import { Setup } from '../src/engine/setup.js';
import { Fl } from '../src/engine/flow.js';

const seed = Number(process.argv[2] || 1);
const n = Number(process.argv[3] || 3);
const colors = ['Red', 'Orange', 'Green', 'Blue', 'Teal'].slice(0, n);
let steps = 0;
let st = seed * 7919 + 13;
const r = () => ((st = (st * 1103515245 + 12345) % 2147483648) / 2147483648);
RT.driver = {
  async ask(pr) {
    steps++;
    if (steps > 20000) throw new Error('too many steps at ' + pr.title);
    if (pr.kind === 'pick') {
      const en = pr.opts.map((o, i) => (o.dis ? -1 : i)).filter((i) => i >= 0);
      const nonPass = en.filter((i) => pr.opts[i].kind !== 'pass');
      if (nonPass.length && r() > 0.12) return nonPass[Math.floor(r() * nonPass.length)];
      return en[Math.floor(r() * en.length)];
    }
    // multi
    if (pr.auto && r() < 0.5) {
      const a = pr.auto();
      if (pr.check(a).ok) return a;
    }
    if (pr.cancel && r() < 0.2) return null;
    const idx = pr.items.map((_, i) => i);
    for (let t = 0; t < 200; t++) {
      const k = pr.min != null ? pr.min + Math.floor(r() * ((pr.max ?? idx.length) - pr.min + 1)) : Math.floor(r() * (idx.length + 1));
      const pool = idx.slice();
      const pick = [];
      for (let j = 0; j < k && pool.length; j++) pick.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
      if (pr.check(pick).ok) return pick;
    }
    if (pr.init && pr.check(pr.init).ok) return pr.init;
    if (pr.auto) return pr.auto();
    return null;
  },
};
RT.log.length = 0;
Setup.newGame(colors, { tent: true, big: true, short: false, seed });
await Fl.main();
console.log('done steps', steps, 'day', S.day, 'res', JSON.stringify(S.res).slice(0, 300));
