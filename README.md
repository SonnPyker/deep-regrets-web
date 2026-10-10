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

## Chơi chung online (co-op)

Mỗi người chơi trên máy riêng, cùng một ván. Kiến trúc:

- **Vercel**: giao diện tĩnh (`index.html`, `css/`, `dist/`), build bằng `scripts/publish-site.mjs`.
- **Render**: máy chủ co-op (`server/`, Node + WebSocket), chạy bằng `npm run server`.
- **Supabase**: lưu phòng, token ghế (đã băm) và bản ghi quyết định (`supabase/schema.sql`).

Máy chủ không giữ trạng thái ván. Nó ghi lại mọi quyết định vào một bản ghi duy nhất, và mỗi máy tự chạy lại ván từ bản ghi đó
bằng cùng bộ luật trong `src/engine`. Ghế máy do máy chủ quyết định.

### Chạy thử trên máy

```bash
npm install
npm run server      # máy chủ tại http://localhost:8787 (không có Supabase thì phòng nằm trong bộ nhớ)
npm run serve       # giao diện tại http://localhost:5173
```

Mở hai cửa sổ trình duyệt: một bên bấm **Tạo phòng**, bên kia nhập mã phòng.

### Triển khai

1. **Supabase**: tạo project, mở SQL Editor, chạy nội dung `supabase/schema.sql` (chạy lại cũng an toàn; nếu báo lỗi `pg_cron`, bật extension đó trong Database → Extensions rồi chạy lại). Lấy `Project URL` và khóa `service_role`
   (Project Settings → API). Khóa này bí mật: chỉ đặt trong Render, không đưa vào mã nguồn hay trình duyệt.
2. **Render**: New → Blueprint, chọn repo này (đọc `render.yaml`). Điền ba biến: `ALLOWED_ORIGINS` (địa chỉ Vercel, ví dụ
   `https://deep-regret.vercel.app`), `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`. Khi deploy xong, mở
   `https://<tên-dịch-vụ>.onrender.com/healthz`: phải thấy `{"ok":true,"store":"supabase"}`.
3. **Vercel**: Add New → Project, chọn repo. Cấu hình build đã nằm trong `vercel.json`. Thêm biến môi trường `DR_API_URL`
   = địa chỉ Render (không có dấu `/` cuối), rồi deploy lại nếu đổi biến.

Mọi địa chỉ Vercel (kể cả preview) phải nằm trong `ALLOWED_ORIGINS` thì máy chủ mới nhận kết nối từ địa chỉ đó.

### Giới hạn

- **Không có hình ảnh** trên bản Vercel: `assets/` không nằm trong git. Đưa hình lên trang công khai là phân phối lại tài sản
  có bản quyền. `INCLUDE_ASSETS=1 npm run site` chỉ copy `assets/` vào `public/` khi bạn tự quyết định làm vậy.
- **Dọn phòng cũ**: mỗi giờ, pg_cron xóa các phòng được tạo hơn 7 ngày trước và không có quyết định nào trong 7 ngày gần nhất.
  Thành viên và lịch sử quyết định của phòng đó cũng bị xóa. Ván đã kết thúc cũng bị xóa sau 7 ngày, nên hãy xem lại trước thời hạn đó.
  Muốn đổi thời hạn thì sửa `prune_idle_rooms` trong `supabase/schema.sql`.
- **Render gói miễn phí** tự ngủ sau 15 phút không có truy cập; lần vào đầu tiên có thể chậm vài chục giây.
- **Một máy chủ, mỗi tiến trình giữ một ván một lúc.** Chạy nhiều bản sao cần thiết kế lại phần phòng.
- **Bảo mật mức giao diện**: mọi máy đều có hạt giống của ván (giống chơi hot-seat), nên đây không phải cơ chế chống gian lận.
  Token ghế lưu trong `localStorage`: ai có token thì giữ được ghế đó. Chưa có giới hạn tốc độ tạo phòng.

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
server/       máy chủ co-op: app.mjs (HTTP + WebSocket), rooms.mjs (phòng, ghế, quyết định), store.mjs (bộ nhớ hoặc Supabase)
supabase/     schema.sql cho các bảng của máy chủ co-op
scripts/      publish-site.mjs (build bản Vercel vào public/)
render.yaml   cấu hình Render cho máy chủ co-op
vercel.json   cấu hình build Vercel cho giao diện
```

## Kiểm thử

```bash
npm test
```

Chạy hàng trăm ván ngẫu nhiên đủ 1-5 người (kèm kiểm tra phát lại cho cùng kết quả), thử từng lá Fish/Dink/Supply/Rod/Reel/Biggest Regret,
và kiểm thử controller (hoàn tác, lưu/tải, ghế người xen kẽ máy).
`tests/coop.mjs` khởi động máy chủ thật với hai tiến trình người chơi, kiểm tra kết nối lại, và xác nhận máy chủ
từ chối câu trả lời không hợp lệ hoặc token sai.

## Ghi chú

- Ván là hàm thuần của (cấu hình + hạt giống + các lựa chọn đã chọn), nên hoàn tác và tiếp tục ván đều dựa vào phát lại.
- Chưa dùng: các tile Clout / Inland của bản TTS.
- Dự án này không liên kết với nhà phát hành của Deep Regrets.
- Hình ảnh trong `assets/` được lấy từ bản Tabletop Simulator và thuộc bản quyền của nhà phát hành gốc. Repo không chứa hình ảnh này; chỉ sử dụng cho mục đích cá nhân và không phân phối lại nếu chưa được phép.
