// Modal windows: card zoom, graveyard, rules, end-of-game results, confirmation.

import { S } from '../engine/state.js';
import { SEAT, TIERS, ROMAN, Rl } from '../engine/core.js';
import { D } from '../engine/data.js';
import { h } from './dom.js';
import { card, cardInfo, src, Zoom, seatChip, seatColor } from './art.js';

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

export function confirmDialog({ title, text, ok = 'Đồng ý', cancel = 'Hủy', danger }) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    openModal({
      title,
      body: h('p', { class: 'confirm-text' }, text),
      onClose: () => fin(false),
      actions: (close) => [
        h('button', { type: 'button', class: 'btn', onclick: close }, cancel),
        h('button', { type: 'button', class: `btn primary${danger ? ' danger' : ''}`, onclick: () => { fin(true); close(); } }, ok),
      ],
    });
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
      h('p', null, h('b', null, 'Quăng câu: '), 'chọn một Shoal ở Depth không sâu hơn thuyền. Fish trên cùng được lật (kích hoạt Reveal), rồi bạn trả Difficulty bằng xúc xắc Fresh (tổng ≥ Difficulty; xúc xắc đã dùng chuyển sang Spent). Trả đủ thì bắt được Fish (kích hoạt Catch, Fish vào tay). Không trả nổi/không muốn: dùng 1 xúc xắc, rút 1 Dink và Fish nằm ngửa ở lại Shoal.'),
      h('p', null, h('b', null, 'Hành động tự do: '), 'ăn Fish (Eat, trừ/tăng Regret), dùng Dink, Supply, Rod, Reel, Thả chì (xuống Depth sâu hơn), xem lén...'),
      h('p', null, h('b', null, 'Abandon Ship: '), 'một lần mỗi ván, lật Lifeboat và về Cảng (+10 Regret Value).'),
    ),
    sec(
      'Hành động ở Cảng',
      h('p', null, h('b', null, 'Bán Fish: '), 'đổi Fish lấy Fishbucks ($). ', h('b', null, 'Mua sắm: '), 'Rod, Reel, Supply hoặc xúc xắc Tackle (giá phụ thuộc Madness và Dink giảm giá). ', h('b', null, 'Mount: '), 'gắn Fish lên tường vào 3 ô nhân ×2 / ×3 / ×2 (mỗi ô một Fish) để ghi điểm gấp nhiều lần.'),
    ),
    sec('Regret & Madness', h('p', null, 'Mỗi lá Regret bạn giữ làm bạn điên hơn: Fair Fish đáng giá ít đi, Foul Fish đáng giá nhiều hơn (tới mức nhất định), nhưng bạn được dùng nhiều xúc xắc Fresh hơn.'), madness),
    sec(
      'Tính điểm',
      h('p', null, 'Mỗi Fish trên tay = giá trị hiện tại (đã tính Madness); Fish đã Mount nhân theo ô (×2/×3/×2, Cloche ×2); mỗi 2$ = 1 điểm. Người có Regret Value cao nhất (tổng giá trị các lá Regret, +10 nếu đã dùng Lifeboat) phải bỏ một Fish đã Mount (2 người: Fish thấp điểm nhất). Hòa điểm: ai có Regret Value thấp hơn thắng, rồi ai ít lá Regret hơn.'),
      h('p', null, 'Ván kết thúc ngay khi Biển hết Fish hoặc sau ngày cuối cùng.'),
    ),
    sec(
      'Chơi một mình (Ocean Survey)',
      h('p', null, 'Chơi 5 ngày với toàn bộ 60 lá Regret. Cuối ván, bạn phải ném bỏ Fish có tổng giá trị ít nhất bằng Regret Value của bạn; phần Fish còn lại là điểm dùng để mở khóa trang bị trên tờ Survey.'),
    ),
    sec(
      'Cách chơi trên máy',
      h('p', null, 'Mọi thao tác kéo thả được tự động hóa: bạn chỉ cần chọn ở bảng quyết định. Bấm vào Shoal sáng trên bàn để quăng câu nhanh, bấm 🔍 hoặc vào lá bài để xem chi tiết, dùng 💡 để xem máy gợi ý và ↶ để hoàn tác quyết định của mình. Ván chơi được lưu tự động.'),
    ),
  );
  openModal({ title: 'Luật chơi Deep Regrets', body, wide: true });
}

// RESULTS ------------------------------------------------------------------------------------------------
export function openResults(actions) {
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
      h('div', { class: 'winner' }, h('span', { class: 'trophy' }, '🏆'), h('div', null, h('b', null, `${names} chiến thắng!`), h('small', null, `Regret Value cao nhất: ${r.hiReg}`))),
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
      h('div', { class: 'winner' }, h('span', { class: 'trophy' }, '🎣'), h('div', null, h('b', null, `Bạn mang về ${r.kept.length} Fish trị giá ${r.total}`), h('small', null, `Regret Value của bạn: ${r.regV}${r.plug ? ' · The Plug đã bị cắm' : ''}`))),
      r.jet.length ? h('p', null, h('b', null, 'Đã ném bỏ: '), r.jet.join(', ')) : h('p', { class: 'dim' }, 'Không phải ném bỏ Fish nào.'),
      r.kept.length ? kept : null,
      h('p', null, 'Hãy dùng số điểm này để mở khóa trang bị trên tờ Survey của bạn:'),
      h('img', { class: 'survey', src: 'assets/board/surveysolocoop.webp', alt: 'Tờ Survey (chơi một mình)' }),
    );
  }
  return openModal({ title: r.mode === 'multi' ? 'Kết quả ván đấu' : 'Kết quả tuần lễ', body, wide: true, actions });
}
