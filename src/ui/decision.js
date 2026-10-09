// The decision panel: renders whatever the engine is asking (pick / multi), bot thinking, curtain, game over, errors.

import { S } from '../engine/state.js';
import { SEAT, ROMAN, Dc } from '../engine/core.js';
import { Game } from '../engine/game.js';
import { h, append, clear } from './dom.js';
import { card, die, refOf, seatChip, seatColor, tooltip, cardInfo, Zoom } from './art.js';
import { UI, needsCurtain } from './store.js';

const ICON = { lifeboat: '🚣', sell: '💰', shop: '🛒', mount: '🏆', give: '🎁', pass: '⏭️', eat: '🍴', dinkDis: '🎴', dinkDraw: '🎴', dinkDiff: '🎴', sup: '🧰', supDiff: '🧰', cloche: '🍽️', lp: '🛟', reel: '🌀', big: '👑', skull: '💀', coffin: '⚰️', sinkers: '⚓' };

const TRAY_TAGS = new Set(['turn', 'pay', 'payDice', 'declare', 'dice', 'keepDice', 'spendDie', 'muster', 'reroll1']);

/** thumbnail with its own little zoom button (the surrounding button picks the option) */
function thumb(kind, id) {
  const w = h('span', { class: 'thumbwrap' }, card(kind, id, { cls: 'thumb', zoom: false, title: '' }));
  w.append(
    h(
      'span',
      {
        class: 'zoomicon',
        role: 'button',
        title: 'Xem chi tiết',
        onclick: (e) => {
          e.stopPropagation();
          e.preventDefault();
          Zoom.open(kind, id);
        },
      },
      '🔍',
    ),
  );
  return w;
}

function diceTray(color) {
  const p = S.P[color];
  if (!p) return null;
  const fresh = p.dice.filter((d) => d.fr);
  const spent = p.dice.filter((d) => !d.fr);
  const t = h('div', { class: 'tray', style: { '--c': seatColor(color) } });
  t.append(h('span', { class: 'lab', title: 'Xúc xắc Fresh của bạn' }, '🎲'));
  if (fresh.length) fresh.forEach((d) => t.append(die(d, 'big')));
  else t.append(h('span', { class: 'dim' }, 'hết xúc xắc Fresh'));
  t.append(h('span', { class: 'sum', title: 'Tổng các xúc xắc Fresh' }, `Σ ${Dc.freshSum(p)}`));
  if (spent.length) {
    t.append(h('span', { class: 'lab sp', title: `${spent.length} xúc xắc Spent` }, '💤'));
    spent.forEach((d) => t.append(die(d)));
  }
  return t;
}

function optBody(o) {
  const kids = [];
  const ref = refOf(o);
  if (ref) kids.push(thumb(ref.kind, ref.id));
  else if (o.die && typeof o.die === 'object') kids.push(die(o.die, 'big'));
  const seatOnly = !!(o.seat && SEAT[o.seat] && String(o.label || '').trim() === SEAT[o.seat].name);
  if (o.seat && SEAT[o.seat]) kids.push(seatChip(o.seat));
  const text = h('span', { class: 'otext' }, seatOnly ? null : h('span', { class: 'olabel' }, o.label ?? ''));
  if (o.sub) text.append(h('span', { class: 'osub' }, o.sub));
  kids.push(text);
  return kids;
}

function castCell(pr, o, i, on) {
  const [d, c] = o.shoal;
  const sh = S.sea[d - 1][c - 1];
  const n = sh.cards.length;
  const b = h('button', { type: 'button', class: `cast${o.dis ? ' dis' : ''}${UI.hint && UI.hint.ans === i ? ' hint' : ''}`, disabled: o.dis, onclick: () => on(i) });
  b.append(h('span', { class: 'cname' }, `${ROMAN[d - 1]}-${c}`));
  if (sh.rev && n > 0) {
    b.append(card('fish', sh.cards[0], { cls: 'thumb', zoom: false, title: '' }), h('span', { class: 'cnote' }, `${D_name(sh.cards[0])}`));
  } else {
    b.append(h('span', { class: 'cnote' }, n === 0 ? 'trống' : o.dis ? 'bị khóa' : `còn ${n} lá`));
  }
  if (n > 0 && !o.dis) b.append(h('span', { class: 'ccount' }, `×${n}`));
  b.title = o.dis ? (n === 0 ? 'Shoal trống' : 'Không thể quăng câu vào Shoal này') : sh.rev && n > 0 ? `${D_name(sh.cards[0])} · còn ${n} lá` : `Quăng vào Shoal ${ROMAN[d - 1]}-${c} (còn ${n} lá, chưa lật)`;
  return b;
}
const D_name = (id) => cardInfo('fish', id).name;

function pickBody(pr, on) {
  const wrap = h('div', { class: 'opts' });
  const groups = [];
  pr.opts.forEach((o, i) => {
    const g = o.grp || '';
    let G = groups.find((x) => x.name === g);
    if (!G) {
      G = { name: g, idx: [] };
      groups.push(G);
    }
    G.idx.push(i);
  });
  // on a turn every non-cast action sits in one action bar instead of a section each
  const bar = pr.tag === 'turn' ? h('section', { class: 'optgrp actbar-sec' }, h('h3', null, 'Hành động')) : null;
  const barGrid = bar ? h('div', { class: 'optgrid actgrid' }) : null;
  if (bar) bar.append(barGrid);
  for (const G of groups) {
    const sec = h('section', { class: 'optgrp' });
    if (G.name && !bar) sec.append(h('h3', null, G.name));
    const isCast = G.idx.every((i) => pr.opts[i].k === 'cast' && pr.opts[i].shoal);
    const hasCards = G.idx.some((i) => refOf(pr.opts[i]) || (pr.opts[i].die && typeof pr.opts[i].die === 'object'));
    const cols = (pr.gcols && pr.gcols[G.name]) || pr.cols;
    const acts = pr.tag === 'turn' && !isCast && !hasCards;
    const intoBar = !!bar && !isCast && !hasCards;
    const grid = intoBar ? barGrid : h('div', { class: `optgrid${isCast ? ' castgrid' : ''}${hasCards ? ' cardgrid' : ''}${acts ? ' actgrid' : ''}`, style: cols && !hasCards && !acts ? { '--cols': cols } : null });
    for (const i of G.idx) {
      const o = pr.opts[i];
      if (isCast) {
        grid.append(castCell(pr, o, i, on));
        continue;
      }
      const ref = refOf(o);
      const b = h(
        'button',
        {
          type: 'button',
          class: `opt${acts ? ' act' : ''}${o.dis ? ' dis' : ''}${o.kind === 'pass' ? ' pass' : ''}${o.k ? ' k-' + o.k : ''}${UI.hint && UI.hint.ans === i ? ' hint' : ''}`,
          disabled: o.dis,
          title: ref ? tooltip(ref.kind, ref.id) : o.dis && o.sub ? o.sub : intoBar && G.name ? G.name : null,
          onclick: () => on(i),
        },
        acts ? h('span', { class: 'aicon' }, ICON[o.k] || '✨') : null,
        optBody(o),
      );
      grid.append(b);
    }
    if (intoBar) continue;
    sec.append(grid);
    wrap.append(sec);
  }
  if (bar && barGrid.childNodes.length) wrap.append(bar);
  return wrap;
}

/** a bar that fills as the chosen dice approach the Difficulty */
function gauge(sum, need, exact) {
  const pct = need > 0 ? Math.min(100, Math.round((sum / need) * 100)) : 100;
  const ok = sum >= need;
  return h(
    'div',
    { class: `gauge${ok ? ' ok' : ''}`, title: `Tổng ${sum} / Difficulty ${need}` },
    h('span', { class: 'gfill', style: { width: pct + '%' } }),
    h('span', { class: 'glab' }, `${sum} / ${need}${exact ? ` · đúng ${exact} xúc xắc` : ''}`),
  );
}

function multiBody(pr, rerender, submit) {
  if (!UI.multi || UI.multi.pr !== pr) UI.multi = { pr, sel: new Set(pr.init || []) };
  const sel = UI.multi.sel;
  const wrap = h('div', { class: 'opts multi' });
  const hasCards = pr.items.some((o) => refOf(o) || (o.die && typeof o.die === 'object'));
  const grid = h('div', { class: `optgrid${hasCards ? ' cardgrid' : ''}`, style: pr.cols && !hasCards ? { '--cols': pr.cols } : null });
  pr.items.forEach((o, i) => {
    const ref = refOf(o);
    const on = sel.has(i);
    grid.append(
      h(
        'button',
        {
          type: 'button',
          class: `opt tile${on ? ' on' : ''}${UI.hint && UI.hint.multi && UI.hint.multi.includes(i) ? ' hint' : ''}`,
          'aria-pressed': on ? 'true' : 'false',
          title: ref ? tooltip(ref.kind, ref.id) : null,
          onclick: () => {
            if (on) sel.delete(i);
            else {
              if (pr.max === 1) sel.clear();
              sel.add(i);
            }
            rerender();
          },
        },
        h('span', { class: 'tick' }, on ? '✓' : ''),
        optBody(o),
      ),
    );
  });
  const idxs = [...sel].sort((a, b) => a - b);
  if (pr.tag === 'payDice') {
    const need = Number((/trả (d+)/.exec(pr.title) || [])[1]);
    if (need >= 0) wrap.append(gauge(idxs.reduce((a, i) => a + (pr.items[i].die ? pr.items[i].die.v : 0), 0), need));
  }
  wrap.append(grid);
  const chk = pr.check(idxs);
  const range = pr.min != null || pr.max != null ? ` (${pr.min != null ? 'tối thiểu ' + pr.min : ''}${pr.min != null && pr.max != null ? ', ' : ''}${pr.max != null ? 'tối đa ' + pr.max : ''})` : '';
  const bar = h('div', { class: 'multibar' });
  bar.append(h('span', { class: `msg${chk.ok ? ' ok' : ''}` }, `Đã chọn ${idxs.length}${range}${chk.msg ? ' · ' + chk.msg : ''}`));
  const btns = h('div', { class: 'btnrow' });
  if (pr.auto) {
    btns.append(
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onclick: () => {
            sel.clear();
            for (const x of pr.auto() || []) sel.add(x);
            rerender();
          },
        },
        pr.autoLabel || 'Tự chọn',
      ),
    );
  }
  if (sel.size) btns.append(h('button', { type: 'button', class: 'btn ghost', onclick: () => { sel.clear(); rerender(); } }, 'Bỏ chọn'));
  if (pr.cancel) btns.append(h('button', { type: 'button', class: 'btn ghost', onclick: () => submit(null) }, typeof pr.cancel === 'string' ? pr.cancel : 'Bỏ qua'));
  btns.append(h('button', { type: 'button', class: 'btn primary', disabled: !chk.ok, onclick: () => submit(idxs) }, pr.okLabel || 'Xác nhận'));
  bar.append(btns);
  wrap.append(bar);
  return wrap;
}

function showRow(pr) {
  const list = (pr.show || []).filter((s) => s && s.t === 'fish');
  if (!list.length) return null;
  const row = h('div', { class: 'showrow' });
  for (const s of list) {
    const inf = cardInfo('fish', s.id);
    row.append(
      h(
        'figure',
        { class: 'showcard' },
        card('fish', s.id, { cls: 'big' }),
        h('figcaption', null, h('b', null, inf.name), h('span', null, inf.line.replace(inf.name, '').replace(/^\s*\(|\)\s*$/g, '')), h('span', { class: 'dim' }, inf.text)),
      ),
    );
  }
  return row;
}

export function createDecision(act) {
  const el = h('section', { class: 'decision', 'aria-live': 'polite' });
  let lastKey = null;

  function head(title, color, extra) {
    const hd = h('header', { class: 'dhead', style: { '--c': color ? seatColor(color) : '#6b8da3' } });
    append(hd, [color ? seatChip(color) : null, h('h2', null, title), extra || null]);
    return hd;
  }

  function render() {
    const pr = Game.prompt;
    clear(el);
    el.className = 'decision';
    el.style.removeProperty('--c');

    if (Game.error) {
      el.classList.add('error');
      el.append(
        head('Có lỗi trong trò chơi', null),
        h('p', null, 'Engine gặp lỗi không mong muốn. Bạn có thể hoàn tác nước đi gần nhất, bắt đầu ván mới hoặc sao chép báo cáo lỗi.'),
        h('pre', { class: 'errtxt' }, String((Game.error && Game.error.stack) || Game.error).slice(0, 900)),
        h(
          'div',
          { class: 'btnrow' },
          Game.canUndo() ? h('button', { type: 'button', class: 'btn', onclick: act.undo }, 'Hoàn tác') : null,
          h('button', { type: 'button', class: 'btn', onclick: act.report }, 'Sao chép báo cáo lỗi'),
          h('button', { type: 'button', class: 'btn primary', onclick: act.newGame }, 'Ván mới'),
        ),
      );
      return;
    }

    if (Game.over) {
      el.classList.add('over');
      el.append(
        head('Ván đấu đã kết thúc', null),
        h('p', null, S.res && S.res.mode === 'multi' ? `Người thắng: ${S.res.winners.map((c) => SEAT[c].name).join(' & ')}.` : 'Tuần lễ đã kết thúc.'),
        h(
          'div',
          { class: 'btnrow' },
          h('button', { type: 'button', class: 'btn primary', onclick: act.openEnd }, 'Xem kết quả'),
          h('button', { type: 'button', class: 'btn', onclick: act.newGame }, 'Ván mới'),
        ),
      );
      return;
    }

    if (!pr) {
      if (Game.thinking) {
        const c = Game.thinking;
        el.classList.add('thinking');
        el.style.setProperty('--c', seatColor(c));
        el.append(head(`${SEAT[c].name} (máy) đang suy nghĩ`, c, h('span', { class: 'dots' }, h('i'), h('i'), h('i'))));
      } else {
        el.classList.add('thinking');
        el.append(head('Đang xử lý…', null, h('span', { class: 'dots' }, h('i'), h('i'), h('i'))));
      }
      return;
    }

    if (needsCurtain()) {
      el.classList.add('curtain');
      const c = pr.color;
      el.style.setProperty('--c', seatColor(c));
      el.append(
        head(`Đến lượt ${SEAT[c].name}`, c),
        h('p', null, `Hãy chuyển thiết bị cho ${SEAT[c].name}. Bài trên tay của người khác đang được che đi.`),
        h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn primary', onclick: () => { UI.viewer = c; act.refresh(); } }, `Tôi là ${SEAT[c].name} - tiếp tục`)),
      );
      return;
    }

    el.style.setProperty('--c', seatColor(pr.color));
    const tools = h(
      'div',
      { class: 'dtools' },
      h('button', { type: 'button', class: 'btn small', title: 'Máy gợi ý một lựa chọn (không tự động chơi)', onclick: act.hint }, '💡 Gợi ý'),
      Game.canUndo() ? h('button', { type: 'button', class: 'btn small', title: 'Quay lại quyết định trước của bạn', onclick: act.undo }, '↶ Hoàn tác') : null,
    );
    el.append(head(pr.title, pr.color, tools));
    if (pr.info && pr.info.length) {
      const full = pr.info.join(' ');
      const long = pr.info.length > 1 || full.length > 90;
      const open = UI.infoOpen === pr;
      const info = h('div', { class: `info${long ? ' fold' : ''}${long && open ? ' open' : ''}`, title: long ? 'Bấm để mở / thu gọn' : null }, pr.info.map((l) => h('div', null, l)));
      if (long) {
        info.setAttribute('role', 'button');
        info.tabIndex = 0;
        const flip = () => {
          const o = info.classList.toggle('open');
          UI.infoOpen = o ? pr : null;
        };
        info.onclick = flip;
        info.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), flip());
      }
      el.append(info);
    }
    const sr = showRow(pr);
    if (sr) el.append(sr);
    if (TRAY_TAGS.has(pr.tag) || (pr.kind === 'pick' && pr.tag === 'turn')) {
      const t = diceTray(pr.color);
      if (t) el.append(t);
    }
    if (pr.tag === 'pay' && pr.meta) {
      const m = pr.meta;
      el.append(gauge(m.sum, m.diff, m.exact), h('div', { class: `paymeta${m.can ? ' ok' : ' no'}` }, m.can ? 'Xúc xắc Fresh của bạn đủ để bắt Fish này.' : 'Xúc xắc Fresh hiện chưa đủ để bắt Fish này.'));
    }
    if (pr.kind === 'pick') {
      el.append(pickBody(pr, (i) => act.pick(i)));
    } else {
      el.append(multiBody(pr, act.refresh, (v) => act.submit(v)));
    }
  }

  function update() {
    const pr = Game.prompt;
    const multiSel = UI.multi && UI.multi.pr === pr ? [...UI.multi.sel].join(',') : '';
    const key = [
      Game.error ? 'E' : '',
      Game.over ? 'O' : '',
      Game.thinking || '',
      pr ? Game.token + ':' + pr.seq + ':' + pr.title : '-',
      pr ? needsCurtain() : '',
      UI.hint ? UI.hint.ans + '|' + (UI.hint.multi || '') : '',
      multiSel,
      Game.canUndo() ? 'u' : '',
    ].join('/');
    if (key === lastKey) return;
    lastKey = key;
    render();
  }

  return { el, update, force: () => { lastKey = null; update(); } };
}
