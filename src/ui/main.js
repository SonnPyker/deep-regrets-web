// Entry point: wires the engine controller (Game) to the screens.

import { S } from '../engine/state.js';
import { COLORS, SEAT, DAYS } from '../engine/core.js';
import { Game } from '../engine/game.js';
import { Bot } from '../engine/bot.js';
import { h, clear, frameThrottle, toast, labelIcons, installTapTitles } from './dom.js';
import { seatColor, refOf } from './art.js';
import { kitOf, record } from '../engine/survey.js';
import { recOf } from '../engine/saves.js';
import { UI, loadPrefs, viewerSeat, seeAll, needsCurtain, humans, parseSeed, loadSurvey, saveSurvey } from './store.js';
import { createBoard } from './board.js';
import { createPortBoard, zoneOf } from './portboard.js';
import { createPlayers } from './players.js';
import { createDecision } from './decision.js';
import { createLog } from './log.js';
import { createFx } from './fxdir.js';
import { play, soundOn, setSound, unlockOnGesture } from './sfx.js';
import { createMenu, speedSelect } from './menu.js';
import { createOnline } from './online.js';
import { openGraveyard, openHelp, openResults, closeAllModals, confirmDialog } from './modals.js';
import { openSurveyBoard, settlePanel } from './survey.js';
import { openSaves } from './saves.js';
import { ic, paintIcons, setIconSet, iconSet } from './icons.js';

const app = document.getElementById('app');
loadPrefs();
paintIcons();

const PHASES = { start: 'Bắt đầu ngày', refresh: 'Refresh', declare: 'Khai báo', action: 'Hành động', over: 'Kết thúc' };
const SHORT_DAY = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ACTIONS ---------------------------------------------------------------------------------------------
/** only a direct action of the turn (an action button, a cast on the Sea, Sell or a shop on the Port) waits for one confirmation;
 *  a step inside an action (reveal order, reward, slot, payment) is taken at once */
function needsConfirm(pr, i) {
  const o = pr.opts[i];
  return UI.prefs.confirm && pr.kind === 'pick' && pr.tag === 'turn' && !!o && !o.dis && o.kind !== 'cancel';
}

function commit(i) {
  UI.pending = null;
  if (Game.answer(i)) {
    UI.hint = null;
    play('click');
  } else toast('Lựa chọn này không dùng được.');
}

const actions = {
  pick(i) {
    const pr = Game.prompt;
    if (pr && needsConfirm(pr, i)) {
      // the choice waits in the decision panel until its confirm button is pressed (confirmPick)
      UI.pending = { pr, i };
      schedule();
      return;
    }
    commit(i);
  },
  confirmPick() {
    const p = UI.pending;
    UI.pending = null;
    if (p && p.pr === Game.prompt) commit(p.i);
    else schedule();
  },
  cancelPick() {
    UI.pending = null;
    schedule();
  },
  submit(v) {
    if (Game.answer(v)) {
      UI.hint = null;
      UI.multi = null;
      play('click');
    } else toast('Lựa chọn chưa hợp lệ.');
  },
  undo() {
    if (!Game.canUndo()) return;
    UI.hint = null;
    UI.multi = null;
    UI.pending = null;
    UI.endShown = false;
    closeAllModals();
    Game.undo();
  },
  hint() {
    const pr = Game.prompt;
    if (!pr) return;
    let a;
    try {
      a = Bot.decide(pr, { peek: true });
    } catch {
      toast('Máy chưa nghĩ ra gợi ý cho quyết định này.');
      return;
    }
    if (pr.kind === 'pick') {
      if (a === undefined || a === null || !pr.opts[a]) {
        toast('Máy chưa nghĩ ra gợi ý cho quyết định này.');
        return;
      }
      UI.hint = { pr, ans: a };
    } else {
      const idx = Array.isArray(a) ? a : [];
      UI.hint = { pr, ans: -1, multi: idx };
      if (UI.multi && UI.multi.pr === pr) UI.multi.sel = new Set(idx);
      if (!Array.isArray(a)) toast('Gợi ý của máy: bỏ qua lựa chọn này.');
    }
    schedule();
  },
  openEnd() {
    showResults();
  },
  async newGame() {
    await goMenu();
  },
  refresh() {
    schedule();
  },
  async report() {
    const data = JSON.stringify({ setup: Game.setup, rec: Game.rec.map((r) => [r.a, r.h ? 1 : 0, r.t]), error: String((Game.error && Game.error.stack) || Game.error) });
    try {
      await navigator.clipboard.writeText(data);
      toast('Đã sao chép báo cáo lỗi vào clipboard.');
    } catch {
      window.prompt('Sao chép báo cáo lỗi:', data);
    }
  },
};

// GAME SCREEN ------------------------------------------------------------------------------------------
const board = createBoard((d) => openGraveyard(d));
const port = createPortBoard();
const players = createPlayers();
const logPanel = createLog();
const decision = createDecision(actions);
const fx = createFx({ board, port, panelOf: (c) => players.panelOf(c), humans });
document.body.append(fx.layer);
unlockOnGesture();

// which table is on screen: the Sea board or the Port board (switches itself when a prompt needs the other one)
let activeView = 'sea';
let viewNeeds = { sea: false, port: false };
const tabSea = h('button', { type: 'button', class: 'vtab', role: 'tab', onclick: () => setView('sea') }, ic('sea'), ' Biển');
const tabPort = h('button', { type: 'button', class: 'vtab', role: 'tab', onclick: () => setView('port') }, ic('port'), ' Cảng');
const viewTabs = h('div', { class: 'viewtabs', role: 'tablist', 'aria-label': 'Chọn bàn chơi' }, tabSea, tabPort);
/** shows the chosen table; a tab gets a dot when the prompt is waiting for a click on the other table */
function renderViews() {
  const sea = activeView !== 'port';
  board.el.hidden = !sea;
  port.el.hidden = sea;
  tabSea.classList.toggle('on', sea);
  tabPort.classList.toggle('on', !sea);
  tabSea.classList.toggle('need', viewNeeds.sea && !sea);
  tabPort.classList.toggle('need', viewNeeds.port && sea);
  layoutEl.classList.toggle('port-view', !sea);
  // a prompt that needs a click on the table this view shows: on a phone the table moves up above the decision
  layoutEl.classList.toggle('table-first', sea ? viewNeeds.sea : viewNeeds.port);
}
function setView(v) {
  activeView = v;
  // the panels follow the table too: at the Port they keep only what the shops need
  renderGame();
  // on a phone the table can sit below the decision: its tab then brings the table up under the tabs
  if (window.innerWidth < 1000 && !layoutEl.classList.contains('table-first')) (v === 'port' ? port : board).el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const dayPills = h('div', { class: 'daypills', 'aria-label': 'Ngày trong tuần' });
const phaseEl = h('span', { class: 'phase' });
const saveEl = h('span', { class: 'savemark', title: 'Ván đấu được lưu tự động sau mỗi quyết định' }, '');
const speedWrap = h('span', { class: 'speedwrap' }, speedSelect());
const soundBtn = h('button', { type: 'button', class: 'btn small icon', title: 'Bật / tắt âm thanh', onclick: () => { setSound(!soundOn()); paintSound(); } });
function paintSound() {
  soundBtn.replaceChildren(ic(soundOn() ? 'sound_on' : 'sound_off'));
  soundBtn.setAttribute('aria-pressed', soundOn() ? 'true' : 'false');
}
paintSound();
const iconBtn = h('button', { type: 'button', class: 'btn small icon', title: 'Đổi bộ icon (Briny / Emoji)', onclick: () => toggleIconSet() }, ic('iconset'));
function toggleIconSet() {
  const next = iconSet() === 'emoji' ? 'briny' : 'emoji';
  setIconSet(next);
  toast(next === 'emoji' ? 'Bộ icon: Emoji gốc.' : 'Bộ icon: Briny (vẽ riêng cho game).');
}
const logBtn = h('button', { type: 'button', class: 'btn small icon logbtn', title: 'Nhật ký ván đấu', onclick: () => logPanel.toggle() }, ic('log'));
logPanel.onChange(({ open, unseen }) => {
  logBtn.classList.toggle('on', open);
  logBtn.classList.toggle('new', !open && unseen > 0);
  logBtn.dataset.n = unseen > 9 ? '9+' : String(unseen || '');
});
const surveyBtn = h('button', { type: 'button', class: 'btn small icon', title: 'Bảng Ocean Survey', onclick: () => openSurveyBoard() }, ic('fish'));
const saveBtn = h('button', { type: 'button', class: 'btn small icon', title: 'Lưu ván đang chơi vào một ô', onclick: () => openSaves({ game: true, onLoad: loadSave }) }, ic('save'));
const topbar = h(
  'header',
  { class: 'topbar' },
  h('b', { class: 'brand' }, 'Deep Regrets'),
  dayPills,
  phaseEl,
  h('span', { class: 'spacer' }),
  saveEl,
  speedWrap,
  saveBtn,
  logBtn,
  soundBtn,
  iconBtn,
  surveyBtn,
  h('button', { type: 'button', class: 'btn small icon', title: 'Luật chơi', onclick: () => openHelp() }, ic('rules')),
  h('button', { type: 'button', class: 'btn small icon', title: 'Về menu', onclick: () => goMenu() }, ic('menu')),
);
labelIcons(topbar);
// the top bar wraps by width, so its height is measured: on a phone the table's tabs stick just under it
new ResizeObserver(() => document.documentElement.style.setProperty('--bar-h', topbar.offsetHeight + 'px')).observe(topbar);
const tableItems = h('div', { class: 'titems' });
const lastLine = h('button', { type: 'button', class: 'lastline', title: 'Mở nhật ký', onclick: () => logPanel.toggle(true) });
const tableInfo = h('div', { class: 'tableinfo' }, tableItems, lastLine);
const layoutEl = h('div', { class: 'layout' }, h('div', { class: 'col-board' }, viewTabs, board.el, port.el), h('div', { class: 'col-main' }, decision.el, tableInfo, players.el));
const gameEl = h('div', { class: 'game' }, topbar, layoutEl, logPanel.el);

const BAG_DOT = { b: 'k-b', g: 'k-g', o: 'k-o' };
let infoSig = '';
function renderTableInfo() {
  if (!S.order) return;
  const solo = S.mode === 'solo';
  const port = S.order.filter((c) => S.P[c].loc === 'port');
  const sig = JSON.stringify([S.rd.length, S.rx.length, S.sd.length, S.rod.length, S.reel.length, S.bag, port, S.turn, port.map((c) => S.P[c].pass), S.plug, S.dk.length, S.lp, S.bigd.length, S.opt]);
  if (sig !== infoSig) {
    infoSig = sig;
    clear(tableItems);
    const pill = (icon, text, title, extra) => h('span', { class: 'stat', title }, h('i', null, icon), text !== null && text !== undefined ? h('b', null, String(text)) : null, extra || null);
    const portBox = h('span', { class: 'stat port', title: port.length ? 'Thuyền đang ở cảng' : 'Chưa có thuyền nào ở cảng' }, h('i', null, ic('port')));
    for (const c of port) portBox.append(h('span', { class: `boat mini${S.turn === c ? ' turn' : ''}${S.P[c].pass ? ' passed' : ''}`, style: { '--c': seatColor(c) }, title: SEAT[c].name }, SEAT[c].name.slice(0, 1)));
    if (!port.length) portBox.append(h('b', { class: 'dim' }, '–'));
    tableItems.append(portBox);
    tableItems.append(
      pill(ic('regret'), S.rd.length, `Bộ Regret: ${S.rd.length} lá còn lại · ${S.rx.length} đã bỏ`, S.rx.length ? h('small', null, `/${S.rx.length}`) : null),
      pill(ic('supply'), S.sd.length, 'Bộ Supply còn lại'),
      pill(ic('rod'), S.rod.length, 'Bộ Rod còn lại'),
      pill(ic('reel'), S.reel.length, 'Bộ Reel còn lại'),
      pill(ic('dink'), S.dk.length, 'Bộ Dink còn lại'),
    );
    if (!solo) {
      const bag = h('span', { class: 'stat bag', title: `Xúc xắc Tackle còn trong túi: Blue ${S.bag.b} · Green ${S.bag.g} · Orange ${S.bag.o}` }, h('i', null, ic('bag')));
      for (const k of ['b', 'g', 'o']) bag.append(h('span', { class: `die mini ${BAG_DOT[k]}` }, String(S.bag[k])));
      tableItems.append(bag);
    }
    if (S.opt && S.opt.big && !solo) tableItems.append(pill(ic('big'), S.bigd.length, 'Biggest Regrets chưa chia'));
    if (S.lp) tableItems.append(pill(ic('lp'), SEAT[S.lp].name, `Life Preserver: ${SEAT[S.lp].name}`));
    if (S.plug) tableItems.append(pill(ic('plug'), null, 'The Plug đang cắm: mỗi lượt hút 1 Fish góc trên-trái của Biển (bị bỏ)'));
  }
  // one-line ticker of the latest narration (full log is in the drawer)
  const e = logPanel.last();
  const t = e ? e.t : '';
  if (lastLine.textContent !== t) {
    lastLine.textContent = t;
    lastLine.style.setProperty('--c', e && e.c ? seatColor(e.c) : 'var(--line)');
  }
}

function renderTopbar() {
  if (!S.order) return;
  const pills = [];
  for (let d = S.dayStart; d <= S.dayLast; d++) {
    pills.push(h('span', { class: `pill${d === S.day ? ' now' : ''}${d < S.day ? ' done' : ''}`, title: DAYS[d - 1] }, SHORT_DAY[d - 1]));
  }
  clear(dayPills);
  dayPills.append(...pills);
  const turn = S.turn && S.ph === 'action' ? ` · lượt ${SEAT[S.turn].name}` : '';
  phaseEl.textContent = `${DAYS[S.day - 1] || ''} · ${PHASES[S.ph] || ''}${turn}`;
  const anyBot = S.order.some((c) => S.seats[c] === 'bot');
  speedWrap.style.display = anyBot ? '' : 'none';
  surveyBtn.style.display = S.mode === 'solo' ? '' : 'none';
  saveBtn.style.display = Game.canSave() ? '' : 'none';
  saveEl.textContent = Game.remote ? online.info() : Game.hasSave() ? '● đã lưu' : '';
  document.title = `Deep Regrets · ${DAYS[S.day - 1] || ''}`;
}

/** what the current prompt lets the player click directly on the table (mount slots, players, cards lying in front of them) */
function pickContext(pr) {
  if (!pr || pr.kind !== 'pick' || needsCurtain()) return null;
  const slots = {};
  const cards = {};
  const seats = new Map();
  const refCount = new Map();
  pr.opts.forEach((o) => {
    const r = refOf(o);
    if (r && !o.dis) refCount.set(`${r.kind}:${r.id}`, (refCount.get(`${r.kind}:${r.id}`) || 0) + 1);
  });
  pr.opts.forEach((o, i) => {
    if (o.dis) return;
    if (o.slot !== undefined && o.slot !== null) slots[o.slot] = i;
    else if (o.seat && !o.shoal) seats.set(o.seat, i);
    const r = refOf(o);
    if (r && pr.tag !== 'turn' && refCount.get(`${r.kind}:${r.id}`) === 1) cards[`${r.kind}:${r.id}`] = i;
  });
  const hint = UI.hint ? UI.hint.ans : undefined;
  return {
    answer: (i) => actions.pick(i),
    forSeat(c) {
      const o = {};
      let any = false;
      if (c === pr.color && Object.keys(slots).length) { o.slots = slots; any = true; }
      if (c === pr.color && Object.keys(cards).length) { o.cards = cards; any = true; }
      if (seats.has(c)) { o.seat = seats.get(c); any = true; }
      if (!any) return null;
      o.hint = hint;
      return o;
    },
  };
}

let lastPrompt = null;
let lastPending = null;
function renderGame() {
  if (!S.order || !S.P) return;
  if (UI.hint && UI.hint.pr !== Game.prompt) UI.hint = null;
  const pr = Game.prompt;
  const pick = new Map();
  const zonePick = new Map();
  const zoneOff = new Map();
  let hintOpt = null;
  if (pr && pr.kind === 'pick' && !needsCurtain()) {
    pr.opts.forEach((o, i) => {
      if (o.shoal && !o.dis) pick.set(o.shoal[0] * 10 + o.shoal[1], i);
      const z = zoneOf(o);
      if (z && !o.dis) zonePick.set(z, i);
      else if (z) zoneOff.set(z, o.sub || 'không dùng được lúc này');
    });
    if (UI.hint) hintOpt = UI.hint.ans;
  }
  // a new prompt brings the table it is about to use into view
  if (pr && pr !== lastPrompt) {
    if (zonePick.size || zoneOff.size) activeView = 'port';
    else if (pick.size) activeView = 'sea';
  }
  viewNeeds = { sea: pick.size > 0, port: zonePick.size > 0 };
  board.update({ shoalPick: pick, hintOpt, answer: (i) => actions.pick(i) });
  port.update({ zonePick, zoneOff, hintOpt, answer: (i) => actions.pick(i) });
  renderViews();
  players.update(viewerSeat(), seeAll(), pickContext(pr), activeView === 'port');
  logPanel.update();
  decision.update();
  renderTopbar();
  renderTableInfo();
  fx.observe();

  if (Game.over && S.res && !UI.endShown) {
    UI.endShown = true;
    play('win');
    // the solo week joins the sheet before the save is dropped, so a reload in between replays it and records it then
    if (S.res.mode === 'solo') saveSurvey(record(loadSurvey(), S.res));
    Game.clearSave();
    showResults();
  }
  if (pr && pr !== lastPrompt && window.innerWidth < 1000) {
    // the element the prompt needs first: the table when it is on top (see renderViews), else the decision
    const first = layoutEl.classList.contains('table-first') ? (activeView === 'port' ? port.el : board.el) : decision.el;
    const r = first.getBoundingClientRect();
    if (r.top < 60 || r.top > window.innerHeight * 0.6) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // a pick waiting for its confirm button: that bar sits in the decision, under the table, so on a phone it is brought into view
  const pending = UI.pending && UI.pending.pr === pr ? UI.pending : null;
  if (pending && pending !== lastPending && window.innerWidth < 1000) {
    const bar = decision.el.querySelector('.optgrp.confirm');
    if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  lastPending = pending;
  lastPrompt = pr;
}

function showResults() {
  if (S.mode === 'solo' && S.res && S.res.mode === 'solo') return showSoloResults();
  // an online game cannot be replayed here: the next game is started from the room
  openResults((close) => [
    h('button', { type: 'button', class: 'btn', onclick: close }, 'Xem lại bàn'),
    h('button', { type: 'button', class: 'btn', onclick: () => { close(); goMenu(true); } }, 'Về menu'),
    Game.remote ? null : h('button', { type: 'button', class: 'btn primary', onclick: () => { close(); playAgain(); } }, 'Chơi lại (hạt giống mới)'),
  ]);
}

/** a solo week ends on the purchase: its Fish and the unlocks are settled here, then the menu shows the sheet */
function showSoloResults() {
  let modal = null;
  const panel = settlePanel(loadSurvey(), {
    onDone: () => {
      if (modal) modal.close();
      goMenu(true);
    },
  });
  modal = openResults((close) => [h('button', { type: 'button', class: 'btn', onclick: close }, 'Xem lại bàn')], { panel });
}

// SCREENS -------------------------------------------------------------------------------------------------
const menu = createMenu({
  onStart: () => startGame(),
  onContinue: () => continueGame(),
  onOnline: () => show('online'),
  onHelp: () => openHelp(),
  onSurvey: () => openSurveyBoard({ onDone: () => menu.render() }),
  onSaves: () => openSaves({ game: false, onLoad: loadSave, onClose: () => menu.render() }),
});

const online = createOnline({
  onPlay: (game) => playOnline(game),
  onMenu: () => show('menu'),
});

function show(screen) {
  UI.screen = screen;
  clear(app);
  if (screen === 'menu') {
    menu.render();
    app.append(menu.el);
    document.title = 'Deep Regrets · Menu';
    window.scrollTo(0, 0);
  } else if (screen === 'online') {
    online.render();
    app.append(online.el);
    document.title = 'Deep Regrets · Chơi online';
    window.scrollTo(0, 0);
  } else {
    app.append(gameEl);
  }
}

function resetViews() {
  UI.hint = null;
  UI.multi = null;
  UI.viewer = null;
  UI.endShown = false;
  infoSig = '';
  lastPrompt = null;
  players.reset();
  logPanel.reset();
  board.reset();
  port.reset();
  fx.reset();
  activeView = 'sea';
  viewNeeds = { sea: false, port: false };
}

function startGame(setupOverride) {
  let setup = setupOverride;
  if (!setup) {
    const seats = {};
    const colors = COLORS.filter((c) => UI.prefs.seats[c] !== 'off');
    if (!colors.length) return;
    for (const c of colors) seats[c] = UI.prefs.seats[c];
    const multi = colors.length > 1;
    setup = { colors, opts: { tent: multi && UI.prefs.tent, big: multi && UI.prefs.big, short: multi && UI.prefs.short, seed: parseSeed(UI.prefs.seed), seats } };
  }
  if (setup.colors.length === 1) {
    // solo is the Ocean Survey campaign: the last week is settled on the sheet first, and the game starts with the unlocked kit
    const sv = loadSurvey();
    if (sv.pending) {
      toast('Hãy ghi tuần trước vào Survey trước khi bắt đầu tuần mới.');
      openSurveyBoard({ onDone: () => menu.render() });
      return;
    }
    setup = { ...setup, opts: { ...setup.opts, kit: kitOf(sv) } };
  }
  closeAllModals();
  resetViews();
  Game.speed = UI.prefs.speed;
  Game.start(setup);
  show('game');
  schedule();
}

function continueGame() {
  closeAllModals();
  resetViews();
  Game.speed = UI.prefs.speed;
  if (!Game.load()) {
    toast('Không đọc được ván đã lưu.');
    Game.clearSave();
    menu.render();
    return;
  }
  show('game');
  schedule();
}

/** continue a save (from a slot or a file): a solo save brings its Ocean Survey sheet back with it */
function loadSave(save) {
  closeAllModals();
  resetViews();
  if (save.mode === 'solo') saveSurvey(save.sheet);
  Game.speed = UI.prefs.speed;
  Game.resume(save.setup, recOf(save));
  show('game');
  schedule();
}

function playAgain() {
  if (!Game.setup) return;
  const s = Game.setup;
  startGame({ colors: s.colors.slice(), opts: { ...s.opts, seed: undefined } });
}

/** an online room game: the seat's link is set up by online.js, the table is shown here */
function playOnline({ setup, rec, link }) {
  closeAllModals();
  resetViews();
  Game.speed = UI.prefs.speed;
  Game.attach(link, setup, rec);
  show('game');
  schedule();
}

async function goMenu(skipConfirm) {
  if (UI.screen === 'menu') return;
  if (!skipConfirm && !Game.over && !Game.error) {
    const text = Game.remote
      ? 'Bạn sẽ rời bàn chơi online. Ghế của bạn vẫn được giữ, và bạn có thể vào lại bằng mã phòng.'
      : 'Ván đấu được lưu tự động, bạn có thể tiếp tục sau từ menu. Về menu ngay bây giờ?';
    const ok = await confirmDialog({ title: 'Về menu?', text, ok: 'Về menu' });
    if (!ok) return;
  }
  closeAllModals();
  online.detach();
  Game.stop();
  show('menu');
}

// RENDER LOOP -----------------------------------------------------------------------------------------------
const schedule = frameThrottle(() => {
  if (UI.screen === 'game') renderGame();
});
Game.on(schedule);

document.addEventListener('keydown', (e) => {
  if (UI.screen !== 'game' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON')) return;
  if (document.querySelector('.modal-back')) return;
  const pr = Game.prompt;
  if (e.key === 'Escape' && UI.pending) {
    e.preventDefault();
    actions.cancelPick();
    return;
  }
  if (e.key === 'Enter' && pr && pr.kind === 'pick' && !needsCurtain()) {
    const en = pr.opts.map((o, i) => (o.dis ? -1 : i)).filter((i) => i >= 0);
    if (en.length === 1) {
      e.preventDefault();
      actions.pick(en[0]);
    }
  }
});

// touch-only devices: a long press shows a title (desktop keeps the native tooltip)
installTapTitles(document.body);

// a room link (?room=CODE) opens the online screen with the code filled in
show(new URLSearchParams(location.search).has('room') ? 'online' : 'menu');

// handy for debugging in the console
window.DR = { Game, S, UI, humans };
