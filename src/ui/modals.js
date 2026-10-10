// Modal windows: card zoom, graveyard, rules, end-of-game results, confirmation.

import { S } from '../engine/state.js';
import { SEAT, TIERS, ROMAN, Rl } from '../engine/core.js';
import { D } from '../engine/data.js';
import { h } from './dom.js';
import { card, cardInfo, src, Zoom, seatChip, seatColor } from './art.js';
import { ic } from './icons.js';

const stack = [];

export function openModal({ title, body, wide, actions, onClose, cls }) {
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: `modal${wide ? ' wide' : ''}${cls ? ' ' + cls : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Hộp thoại' });
  const close = () => {
    const i = stack.indexOf(api);
    if (i >= 0) stack.splice(i, 1);
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && stack[stack.length - 1] === api) {
      e.stopPropagation();
      close();
    }
  };
  const api = { close, el: box };
  box.append(
    h('header', { class: 'mhead' }, h('h2', null, title || ''), h('button', { type: 'button', class: 'mclose', 'aria-label': 'Đóng', onclick: close }, '×')),
    h('div', { class: 'mbody' }, body),
  );
  if (actions) box.append(h('footer', { class: 'mfoot' }, actions(close)));
  back.append(box);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) close();
  });
  document.body.append(back);
  document.addEventListener('keydown', onKey, true);
  stack.push(api);
  const f = box.querySelector('.mfoot .primary') || box.querySelector('.mclose');
  if (f) f.focus({ preventScroll: true });
  return api;
}

export function closeAllModals() {
  while (stack.length) stack[stack.length - 1].close();
}

/** `safe`: focus the cancel button, so a stray Enter does not confirm the action */
export function confirmDialog({ title, text, ok = 'Đồng ý', cancel = 'Hủy', danger, safe }) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const m = openModal({
      title,
      body: h('p', { class: 'confirm-text' }, text),
      onClose: () => fin(false),
      actions: (close) => [
        h('button', { type: 'button', class: 'btn', onclick: close }, cancel),
        h('button', { type: 'button', class: `btn primary${danger ? ' danger' : ''}`, onclick: () => { fin(true); close(); } }, ok),
      ],
    });
    if (safe) m.el.querySelector('.mfoot .btn:not(.primary)')?.focus({ preventScroll: true });
  });
}

// ZOOM ---------------------------------------------------------------------------------------------
Zoom.open = (kind, id) => {
  const inf = cardInfo(kind, id);
  openModal({
    title: inf.name,
    cls: 'zoom',
    body: h(
      'div',
      { class: 'zoombody' },
      h('img', { class: `zoomimg ${kind}`, src: src(kind, id), alt: inf.name }),
      h('div', { class: 'zoomtxt' }, inf.line ? h('p', { class: 'zline' }, inf.line) : null, inf.text ? h('p', { class: 'ztext' }, inf.text) : null),
    ),
  });
};

// GRAVEYARD ------------------------------------------------------------------------------------------
export function openGraveyard(d) {
  const ids = S.gy[d - 1].slice();
  const body = ids.length
    ? h('div', { class: 'gygrid' }, ids.map((id) => h('figure', null, card('fish', id), h('figcaption', null, D.fish[id].n))))
    : h('p', { class: 'dim' }, 'Nghĩa địa này đang trống.');
  openModal({ title: `Nghĩa địa Depth ${ROMAN[d - 1]} (${ids.length} lá)`, body, wide: true });
}

// RULES ------------------------------------------------------------------------------------------------
export function openHelp() {
  const madness = h(
    'table',
    { class: 'tbl' },
    h('thead', null, h('tr', null, ['Số lá Regret', 'Fair', 'Foul', 'Xúc xắc Fresh tối đa', 'Shop'].map((x) => h('th', null, x)))),
    h(
      'tbody',
      null,
      TIERS.map((t, i) => {
        const lo = i === 0 ? 0 : TIERS[i - 1].max + 1;
        const rng = t.max >= 9999 ? `${lo}+` : lo === t.max ? String(lo) : `${lo}-${t.max}`;
        const sg = (n) => (n > 0 ? `+${n}` : String(n));
        return h('tr', null, h('td', null, rng), h('td', null, sg(t.fair)), h('td', null, sg(t.foul)), h('td', null, t.maxd), h('td', null, t.disc ? 'rẻ hơn 1$' : '-'));
      }),
    ),
  );
  const sec = (title, ...kids) => h('details', { open: true }, h('summary', null, title), ...kids);
  const body = h(
    'div',
    { class: 'help' },
    sec(
      'Mục tiêu',
      h('p', null, 'Bạn là một ngư dân đang tự hủy hoại bản thân. Hãy kiếm nhiều điểm nhất từ Fish (câu được, bán hoặc gắn lên tường), nhưng càng câu nhiều bạn càng tích lũy Regret (hối tiếc) và càng điên loạn. Trò chơi kéo dài 6 ngày (chơi một mình: 5 ngày, chế độ Ocean Survey).'),
    ),
    sec(
      'Một ngày diễn ra thế nào',
      h(
        'ol',
        null,
        h('li', null, h('b', null, 'Bắt đầu: '), 'chuyển First Player; Fish đã lật bị bỏ; sự kiện ngày (Thứ Tư và Thứ Sáu: Can of Worms được lật ngửa lại; Thứ Năm: mọi người nhận 3$; Thứ Bảy: mỗi người lấy một xúc xắc Tackle nếu túi còn đủ); mọi thuyền ở Biển được kéo lên 1 Depth (Reel in).'),
        h('li', null, h('b', null, 'Refresh (Muster Courage): '), 'có thể tung lại một số xúc xắc Fresh yếu; xúc xắc mới tung vào Fresh tới giới hạn theo Madness, phần dư vào Spent. Người có tổng Fresh cao nhất đưa Life Preserver.'),
        h('li', null, h('b', null, 'Khai báo: '), 'ở lại Biển hay Make Port (vào Cảng); chọn Rod và Reel dùng trong ngày.'),
        h('li', null, h('b', null, 'Hành động: '), 'lần lượt từng người làm đúng 1 hành động chính (hoặc Pass) kèm các hành động tự do tùy ý, cho đến khi mọi người Pass.'),
      ),
    ),
    sec(
      'Hành động ở Biển',
      h('p', null, h('b', null, 'Quăng câu: '), 'bấm thẳng vào một Shoal sáng trên bàn Biển (Depth không sâu hơn thuyền của bạn). Fish trên cùng được lật (kích hoạt Reveal), rồi bạn trả Difficulty bằng xúc xắc Fresh (tổng ≥ Difficulty; xúc xắc đã dùng chuyển sang Spent). Trả đủ thì bắt được Fish (kích hoạt Catch, Fish vào tay). Không trả nổi/không muốn: dùng 1 xúc xắc, rút 1 Dink và Fish nằm ngửa ở lại Shoal.'),
      h('p', null, h('b', null, 'Hành động tự do: '), 'ăn Fish (Eat, trừ/tăng Regret), dùng Dink, Supply, Rod, Reel, Thả chì (xuống Depth sâu hơn), xem lén...'),
      h('p', null, h('b', null, 'Abandon Ship: '), 'một lần mỗi ván, lật Lifeboat và về Cảng (+10 Regret Value).'),
    ),
    sec(
      'Hành động ở Cảng',
      h('p', null, 'Khi thuyền vào Cảng, chuyển sang tab Cảng trên bàn và bấm thẳng vào khu muốn dùng:'),
      h('p', null, h('b', null, 'Chợ cá (Bán Fish): '), 'đổi Fish lấy Fishbucks ($).'),
      h('p', null, h('b', null, 'Tiệm Rod, Reel, Supply, xúc xắc Tackle (Mua sắm): '), 'mỗi tiệm một lần mỗi ngày; chọn mức giá (giá phụ thuộc Madness, dùng Dink giảm giá nếu có). Kho còn lại được ghi trên từng tiệm.'),
      h('p', null, h('b', null, 'Mount: '), 'gắn Fish lên tường vào 3 ô nhân ×2 / ×3 / ×2 (mỗi ô một Fish) để ghi điểm gấp nhiều lần; chọn ngay trong bảng của bạn.'),
      h('p', null, 'Mỗi lượt chỉ làm một hành động ở Cảng.'),
    ),
    sec('Regret & Madness', h('p', null, 'Mỗi lá Regret bạn giữ làm bạn điên hơn: Fair Fish đáng giá ít đi, Foul Fish đáng giá nhiều hơn (tới mức nhất định), nhưng bạn được dùng nhiều xúc xắc Fresh hơn.'), madness),
    sec(
      'Tính điểm',
      h('p', null, 'Mỗi Fish trên tay = giá trị hiện tại (đã tính Madness); Fish đã Mount nhân theo ô (×2/×3/×2, Cloche ×2); mỗi 2$ = 1 điểm. Người có Regret Value cao nhất (tổng giá trị các lá Regret, +10 nếu đã dùng Lifeboat) phải bỏ một Fish đã Mount (2 người: Fish thấp điểm nhất). Hòa điểm: ai có Regret Value thấp hơn thắng, rồi ai ít lá Regret hơn.'),
      h('p', null, 'Ván kết thúc ngay khi Biển hết Fish hoặc sau ngày cuối cùng.'),
    ),
    sec(
      'Chơi một mình (Ocean Survey)',
      h('p', null, 'Mỗi ván là một tuần trong chiến dịch Ocean Survey: chơi 5 ngày với toàn bộ 60 lá Regret. Cuối tuần, bạn phải ném bỏ Fish có tổng giá trị ít nhất bằng Regret Value của bạn; phần Fish còn lại đưa về Cảng, được ghi vào Survey (đánh dấu) và tổng giá trị đó dùng để mở khóa trang bị. Dink có giá trị giảm giá cũng giảm chi phí mua. Điểm không dùng hết sẽ mất. Trang bị mở khóa được dùng cho các ván sau. Chơi một mình không dùng Fish của Lamentable Tentacles, vì tờ Survey không có ô cho chúng.'),
    ),
    sec(
      'Cách chơi trên máy',
      h(
        'p',
        null,
        'Mọi thao tác kéo thả được tự động hóa: bạn chỉ cần chọn trên bàn hoặc ở bảng quyết định. Quăng câu và các khu ở Cảng được bấm trực tiếp trên bàn. Bấm ',
        ic('zoom'),
        ' hoặc vào lá bài để xem chi tiết, ',
        ic('hint'),
        ' để xem máy gợi ý và ',
        ic('undo'),
        ' để hoàn tác quyết định của mình. Hành động trong lượt chờ bạn bấm Chọn để xác nhận (có thể tắt trong menu). Ván chơi được lưu tự động.',
      ),
      h(
        'p',
        null,
        'Lưu ván: bấm ',
        ic('save'),
        ' trên thanh trên cùng để ghi ván đang chơi vào một trong ba ô của chế độ đó (Solo và Nhiều người chơi có ô riêng). Ở menu, mục "Ván đã lưu" để tải, xuất ra tệp .json hoặc nhập lại tệp.',
      ),
    ),
  );
  openModal({ title: 'Luật chơi Deep Regrets', body, wide: true });
}

// FIRST-RUN GUIDE ----------------------------------------------------------------------------------------
// English words the Vietnamese UI shows. A definition is given only where the rule text in the engine says what the term does;
// a null definition lists the term alone.
const GLOSSARY = [
  ['Regret', 'hối tiếc, lá bài bạn tích lũy trong ván. Số lá quyết định Madness; tổng giá trị các lá là Regret Value.'],
  ['Pass', 'không làm thêm hành động chính trong ngày. Nhiều người chơi: nhận phần thưởng (1 Dink hoặc bỏ 1 Regret ngẫu nhiên). Chơi một mình: kết thúc ngày.'],
  ['Refresh (Muster Courage)', 'đầu ngày, tung lại xúc xắc Spent và có thể tung lại vài xúc xắc Fresh; số Fresh giữ lại tối đa theo Madness, phần dư thành Spent.'],
  ['Life Preserver', 'người có tổng xúc xắc Fresh cao nhất đầu ngày chuyển nó cho người khác. Người giữ được giảm 2$ khi mua ở Cảng, hoặc bỏ đi để giảm Difficulty 2. Chỉ có khi nhiều người chơi.'],
  ['First Player', 'nhiều người chơi: người đi trước trong ngày; từ ngày thứ hai chuyển sang người kế tiếp.'],
  ['Reel in', 'nhiều người chơi, từ ngày thứ hai: đầu ngày mọi thuyền ở Biển được kéo lên 1 Depth.'],
  ['Depth', 'tầng Biển I-III. Bạn chỉ câu được Shoal ở tầng không sâu hơn thuyền của mình; Thả chì để xuống thêm một tầng.'],
  ['Make Port', 'đưa thuyền vào Cảng. Khi vào, tung lại xúc xắc (Muster) và có thể bỏ 1 Regret.'],
  ['Abandon Ship', 'nhiều người chơi, hành động ở Biển, mỗi ván một lần: lật Lifeboat, vào Cảng ngay và cộng 10 Regret Value.'],
  ['Lifeboat', 'lá đánh dấu đã dùng Abandon Ship; khi đã lật thì cộng 10 vào Regret Value.'],
  ['Regret Value', 'tổng giá trị các lá Regret, cộng 10 nếu đã lật Lifeboat. Nhiều người chơi: khi kết thúc, người có Regret Value cao nhất (kể cả hòa) phải bỏ một Fish đã Mount.'],
  ['Shoal', 'ô Fish trên bàn Biển; Fish trên cùng là Fish bạn câu được.'],
  ['Reveal', 'khi quăng câu, lật Fish trên cùng của Shoal (nếu đang úp), kích hoạt hiệu ứng lật của Fish.'],
  ['Difficulty', 'tổng xúc xắc Fresh tối thiểu để bắt Fish. Rod, Dink, Supply và Life Preserver có thể giảm nó.'],
  ['Catch', 'bắt Fish khi đã trả đủ Difficulty; hiệu ứng khi bắt được kích hoạt, rồi Fish vào tay (trừ khi hiệu ứng bỏ nó).'],
  ['Fresh', 'xúc xắc sẵn sàng dùng; số lượng tối đa theo Madness.'],
  ['Spent', 'xúc xắc đã dùng; đến Refresh sẽ được tung lại.'],
  ['Tackle', 'xúc xắc Blue, Green, Orange. Mua ở Tiệm xúc xắc hoặc lấy từ túi vào Thứ Bảy; dùng xong quay về túi (trừ khi chơi một mình).'],
  ['Fair / Foul', 'hai loại Fish. Nhiều người chơi: khi số Regret tăng, Fair Fish giá trị giảm còn Foul Fish tăng. Bán một Foul Fish làm bạn rút thêm 1 Regret.'],
  ['Madness', 'nhiều người chơi: mức điên loạn theo số lá Regret. Mức cao hơn cho phép dùng nhiều xúc xắc Fresh hơn; từ 13 Regret trở lên, tiệm rẻ hơn 1$.'],
  ['Overfishing', 'bắt Fish cuối cùng của một Shoal thì rút 1 Regret.'],
  ['Fishbucks ($)', 'tiền có được khi bán Fish, tối đa 10$. Mỗi 2$ = 1 điểm lúc tính điểm; chơi một mình không tính.'],
  ['Mount', 'gắn Fish lên một trong ba ô tường ×2, ×3, ×2. Đã Mount thì không dời được; tính điểm khi kết thúc.'],
  ['Shop', 'tiệm ở Cảng: Rod, Reel, Supply, xúc xắc Tackle. Mỗi tiệm ghé một lần mỗi ngày.'],
  ['Dink', 'lá dùng một lần, nhận khi Pass hoặc khi bỏ cuộc một lần câu. Có loại giảm giá ở tiệm, giảm Difficulty khi đang trả, hoặc rút/bỏ Regret.'],
  ['Supply', 'vật phẩm mua ở Tiệm Supply, dùng một lần.'],
  ['Rod / Reel', 'Rod chọn mỗi ngày, một số Rod giảm Difficulty. Reel có năng lực riêng, một số dùng được một lần mỗi ngày.'],
  ['Cloche', 'Supply: Mount một Fish nhỏ lên đó (ô ×2, vĩnh viễn).'],
  ['Can of Worms', 'khi lật ngửa (Thứ Tư, Thứ Sáu hoặc khi Make Port), trước khi lật một Shoal bạn được xem lén Fish trên cùng và có thể đẩy nó xuống đáy. Không dùng khi chơi một mình.'],
  ['Omen', 'xúc xắc Omen (mặt 1-4), nhận khi bắt Amulet of Agartha (kèm rút 3 Regret); một lúc chỉ một người giữ.'],
  ['The Plug', 'khi đã cắm, mỗi lượt một Fish ở góc trên-trái của Biển bị bỏ.'],
  ['Overmind', 'Fish phải được Mount ngay khi vào Cảng (Make Port), nếu còn ô trống.'],
  ['Eat', 'ăn Fish trên tay như hành động tự do (không dùng khi chơi một mình).'],
  ['Small / Middling / Large', 'cỡ Fish. Một số Rod chỉ giảm Difficulty cho một cỡ.'],
  ['Ocean Survey', 'chế độ một người: mỗi ván là một tuần 5 ngày với 60 lá Regret. Fish mang về ghi vào tờ Survey để mở khóa trang bị cho các ván sau.'],
  ['Lamentable Tentacles / Biggest Regrets', 'hai bản mở rộng, bật trong mục Tùy chọn ở menu. Biggest Regrets: mỗi người một lá, khả năng đổi theo số Regret.'],
  ['Tên lá bài: Whispering Skull, Iron Coffin, Bone Wheel, Rod of the Infinite, Reel of Fortune', null],
];

/** first visit: the rules in a few steps, then the glossary. Opened from the menu (menu.js). */
export function openGuide() {
  const sec = (title, ...kids) => h('section', { class: 'guide-sec' }, h('h3', null, title), ...kids);
  const body = h(
    'div',
    { class: 'guide' },
    sec(
      '1. Mỗi ngày',
      h(
        'ul',
        null,
        h('li', null, 'Trong phần hành động, đến lượt bạn thì chọn một hành động chính hoặc Pass trong hộp quyết định. Hành động tự do (ăn Fish, Dink, Supply...) làm thêm được trong lượt.'),
        h('li', null, 'Các lượt tiếp tục cho đến khi mọi người Pass. Khi chỉ còn một người chưa Pass, người đó được thêm hai lượt rồi ngày kết thúc.'),
      ),
    ),
    sec(
      '2. Biển và Cảng',
      h(
        'ul',
        null,
        h('li', null, h('b', null, 'Biển: '), 'bấm một Shoal sáng trên bàn để quăng câu. Fish trên cùng được lật; trả Difficulty bằng xúc xắc Fresh để bắt. Không trả được thì dùng một xúc xắc và rút một Dink, Fish ở lại Shoal.'),
        h('li', null, h('b', null, 'Cảng: '), 'bấm Bán Fish để đổi Fish lấy Fishbucks ($); bấm một tiệm để mua Rod, Reel, Supply hoặc xúc xắc Tackle; chọn Mount trong hộp quyết định để gắn Fish lên tường.'),
      ),
    ),
    sec(
      '3. Kết thúc ván',
      h(
        'ul',
        null,
        h('li', null, 'Ván kết thúc sau ngày cuối (Thứ Bảy; chơi một mình là Thứ Sáu) hoặc khi Biển hết Fish.'),
        h('li', null, 'Nhiều người chơi: điểm = Fish trên tay + Fish đã Mount (nhân theo ô ×2, ×3, ×2) + Fishbucks (mỗi 2$ = 1 điểm).'),
        h('li', null, 'Regret không trừ điểm trực tiếp, nhưng nhiều Regret làm Fair Fish đáng ít đi và Foul Fish đáng nhiều hơn. Người có Regret Value cao nhất phải bỏ một Fish đã Mount.'),
      ),
    ),
    h(
      'section',
      { class: 'guide-sec guide-gloss' },
      h('h3', null, 'Thuật ngữ tiếng Anh'),
      h(
        'ul',
        null,
        GLOSSARY.map(([term, def]) => h('li', null, h('b', null, term), def ? `: ${def}` : null)),
      ),
    ),
  );
  openModal({ title: 'Hướng dẫn nhanh', body });
}

// RESULTS ------------------------------------------------------------------------------------------------
/** extra.panel: the Ocean Survey purchase of a solo week (survey.js), shown under the Fish brought back */
export function openResults(actions, extra = {}) {
  const r = S.res;
  if (!r) return null;
  let body;
  if (r.mode === 'multi') {
    const names = r.winners.map((c) => SEAT[c].name).join(' & ');
    const rows = r.rows.map((x, i) => {
      const p = S.P[x.c];
      const win = r.winners.includes(x.c);
      const mounts = h('div', { class: 'rmounts' });
      p.mount.forEach((id, k) => {
        if (id) mounts.append(card('fish', id, { cls: 'xs', badge: `×${Rl.mountMult(k + 1)}` }));
      });
      if (p.clo) mounts.append(card('fish', p.clo, { cls: 'xs', badge: '×2' }));
      return h(
        'tr',
        { class: win ? 'win' : '', style: { '--c': seatColor(x.c) } },
        h('td', null, `${i + 1}`),
        h('td', { class: 'who' }, seatChip(x.c), S.seats[x.c] === 'bot' ? h('small', null, ' (máy)') : null, mounts),
        h('td', { class: 'tot' }, x.total),
        h('td', null, x.hand),
        h('td', null, x.mount),
        h('td', null, x.bucks),
        h('td', null, x.regV + (x.lb ? ' (có Lifeboat)' : '')),
        h('td', null, x.regN),
      );
    });
    body = h(
      'div',
      { class: 'results' },
      h('div', { class: 'winner' }, h('span', { class: 'trophy' }, ic('trophy')), h('div', null, h('b', null, `${names} chiến thắng!`), h('small', null, `Regret Value cao nhất: ${r.hiReg}`))),
      h(
        'div',
        { class: 'tblwrap' },
        h(
          'table',
          { class: 'tbl res' },
          h('thead', null, h('tr', null, ['#', 'Người chơi', 'Tổng điểm', 'Tay', 'Mount', 'Fishbucks', 'Regret Value', 'Số Regret'].map((x) => h('th', null, x)))),
          h('tbody', null, rows),
        ),
      ),
      r.pens && r.pens.length
        ? h('div', { class: 'pens' }, h('h3', null, 'Hình phạt Regret cao nhất'), ...r.pens.map((x) => h('p', null, seatChip(x.c), ` mất ${x.name} (${x.pts} điểm) khỏi tường.`)))
        : null,
    );
  } else {
    const kept = h('div', { class: 'gygrid' }, r.kept.map((k) => h('figure', null, card('fish', k.id), h('figcaption', null, `${k.name} · ${k.v}`))));
    body = h(
      'div',
      { class: 'results solo' },
      h('div', { class: 'winner' }, h('span', { class: 'trophy' }, ic('rod')), h('div', null, h('b', null, `Bạn mang về ${r.kept.length} Fish trị giá ${r.total}`), h('small', null, `Regret Value của bạn: ${r.regV}${r.plug ? ' · The Plug đã bị cắm' : ''}`))),
      r.jet.length ? h('p', null, h('b', null, 'Đã ném bỏ: '), r.jet.join(', ')) : h('p', { class: 'dim' }, 'Không phải ném bỏ Fish nào.'),
      r.kept.length ? kept : null,
      r.dinks && r.dinks.length ? h('p', { class: 'dim' }, h('b', null, 'Dink giảm giá khi mua trang bị: '), r.dinks.join(', ')) : null,
      extra.panel || null,
    );
  }
  return openModal({ title: r.mode === 'multi' ? 'Kết quả ván đấu' : 'Kết quả tuần lễ', body, wide: true, actions });
}
