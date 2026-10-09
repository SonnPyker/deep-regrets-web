# Deep Regrets - bản web tự động hóa

Bản làm lại (không chính thức) của boardgame **Deep Regrets**, dùng hình ảnh từ bản Tabletop Simulator có sẵn trên máy.
Không cần kéo thả: máy lo toàn bộ phần chia bài, tung xúc xắc, lật Fish, tính điểm, Madness...; bạn chỉ chọn quyết định như trong một game text-RPG.

## Yêu cầu

- [Node.js](https://nodejs.org/) 18 trở lên (chỉ cần để build và chạy máy chủ local)
- Trình duyệt hiện đại: Chrome, Edge, Firefox hoặc Safari (desktop và điện thoại đều được)
- Thư mục hình ảnh `assets/` của bản Tabletop Simulator (xem bước 1 bên dưới)

## Cài đặt và chạy

1. **Chép hình ảnh vào `assets/`.** Repo này không kèm hình ảnh (bản quyền thuộc nhà phát hành). Hãy chép thư mục `assets/` từ bản Tabletop Simulator của bạn vào gốc repo, giữ nguyên cấu trúc con (`assets/fish/1/0.webp`, `assets/board/thebrinydeep.webp`, ...). Game sẽ không hiển thị hình nếu thiếu thư mục này.

2. Cài và chạy:

```bash
npm install        # lần đầu (chỉ cần esbuild)
npm run build      # gộp src/ thành dist/app.js
npm run serve      # mở http://localhost:5173
```

Máy chủ dùng cổng 5173 mặc định; muốn đổi cổng thì chạy `node serve.mjs 8080`.

Cũng có thể mở thẳng `index.html` bằng trình duyệt, không cần máy chủ (bundle `dist/app.js` là một file IIFE nên chạy được từ `file://`).
Khi sửa code trong `src/`, chạy `npm run watch` để tự build lại, hoặc `npm run build` một lần.

## Tính năng

- 1-5 người chơi (người hoặc máy, hot-seat có màn hình che bài), chế độ solo Ocean Survey (5 ngày).
- Đủ luật: 6 ngày, Refresh/Muster Courage, Declaration, Fresh/Spent, Fair/Foul, Madness theo số Regret, Regret Value,
  Lifeboat/Abandon Ship, Can of Worms, Omen, The Plug, Overfishing, mount tường (x2/x3/x2), cửa hàng (Dink/Supply/Rod/Reel), Life Preserver,
  phạt người có nhiều Regret nhất, tính điểm và phá hòa.
- Bản mở rộng: Lamentable Tentacles, Biggest Regrets; tùy chọn ván ngắn (5 ngày).
- Gợi ý (💡), Hoàn tác (↶), tự lưu và tiếp tục ván, hạt giống ngẫu nhiên có thể lặp lại, tốc độ máy chỉnh được.
- Bấm thẳng lên bàn: quăng câu bằng cách bấm Shoal trên bàn, chọn Slot Mount ngay trên tường của bạn, chọn người chơi hoặc lá bài đang nằm trước mặt.
- Hiệu ứng và âm thanh tổng hợp (có nút tắt 🔊): xúc xắc lăn, lật Fish, Fish bay về người bắt được, +Regret / +$ nổi lên, banner từng ngày, thanh đo Difficulty khi chọn xúc xắc trả.
- Bố cục gọn, ít phải cuộn: trên desktop cả bàn chơi, hộp quyết định, thông tin bàn và người chơi nằm vừa một màn hình; chỉ số hiển thị bằng icon + số (rê chuột để xem giải thích), nhật ký nằm trong ngăn kéo 📜 (dòng mới nhất luôn hiện ở thanh thông tin), trên điện thoại người chơi là dải vuốt ngang.
- Giao diện tiếng Việt, hiển thị tốt trên desktop và điện thoại.

## Cấu trúc thư mục

```
src/engine/   logic luật chơi (hàm thuần theo cấu hình + hạt giống + lựa chọn):
              game.js (điều khiển ván, lưu/hoàn tác/tiếp tục bằng phát lại), flow.js (ngày, lượt, kết thúc),
              fish.js (câu cá), port.js (bán/mua/mount), free.js (hành động miễn phí), data.js (cơ sở dữ liệu lá bài),
              bot.js (người chơi máy), setup.js (thiết lập ván mới)
src/ui/       giao diện: main.js (điểm vào), board.js (bàn chơi), decision.js (hộp quyết định), players.js,
              modals.js, log.js, store.js, fxdir.js + sfx.js (hiệu ứng và âm thanh)
css/          style.css, fx.css
assets/       hình ảnh: bàn chơi, thẻ bài, Fish, xúc xắc... (không kèm repo, xem bước 1)
dist/         bundle đã build (app.js), được commit để index.html chạy trực tiếp
tests/        kiểm thử tự động
build.mjs     script build bằng esbuild
serve.mjs     máy chủ tĩnh để chơi local
index.html    trang chính
```

## Kiểm thử

```bash
npm test
```

Chạy hàng trăm ván ngẫu nhiên đủ 1-5 người (kèm kiểm tra phát lại cho cùng kết quả), thử từng lá Fish/Dink/Supply/Rod/Reel/Biggest Regret,
và kiểm thử controller (hoàn tác, lưu/tải, ghế người xen kẽ máy).

## Ghi chú

- Ván là hàm thuần của (cấu hình + hạt giống + các lựa chọn đã chọn), nên hoàn tác và tiếp tục ván đều dựa vào phát lại.
- Chưa dùng: các tile Clout / Inland của bản TTS.
- Dự án này không liên kết với nhà phát hành của Deep Regrets.
- Hình ảnh trong `assets/` được lấy từ bản Tabletop Simulator và thuộc bản quyền của nhà phát hành gốc. Repo không chứa hình ảnh này; chỉ sử dụng cho mục đích cá nhân và không phân phối lại nếu chưa được phép.
