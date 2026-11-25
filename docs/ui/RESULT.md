# Báo cáo kết quả thiết kế lại giao diện (UI Redesign)

- **Nhánh Git:** `ui-redesign` (tạo từ `main`)
- **Phong cách:** Minimalist lấy cảm hứng Apple (Human Interface Guidelines) — nhiều khoảng trắng, một màu nhấn duy nhất (`--color-accent`, xanh sân cầu lông) kết hợp bảng màu trung tính Apple Light/Dark, font bo tròn hỗ trợ đầy đủ tiếng Việt (`Plus Jakarta Sans` + `Be Vietnam Pro`), không viền phát sáng, không bóng đổ nhiều lớp, không thẻ lồng thẻ.
- **Tuân thủ luật cứng:** **100% chỉ sửa giao diện/CSS/token/tài liệu UI**. Không sửa bất kỳ file logic nào (`src/engine/*`, `src/hooks/useCloudRoom.ts`, `src/services/supabaseSync.ts`, `src/engine/settlement.ts`, `src/engine/stateMigration.ts`, `src/utils/*`, `src/types/*`), không đổi tên prop/hàm/action/state, không sửa hay xóa test, không sửa `CLAUDE.md`, không `git push`.
- **Kiểm tra tự động cuối cùng:** `npm run check:harness` **XANH** (`tsc -b` 0 lỗi, Vitest `26/26` file — `248/248` test pass, `vite build` thành công, `npm run lint` 0 lỗi).

---

## 1. Bảng tổng hợp các giai đoạn

| Giai đoạn | Trạng thái | Commit hash | Tóm tắt công việc & xác minh |
| :--- | :--- | :---: | :--- |
| **G1** — Hệ thống thiết kế & Token | **Xong** | `236bed7` | Tạo bộ biến tập trung duy nhất `src/styles/tokens.css`, nhóm component nguyên thủy dùng chung `src/components/ui/Primitives.tsx` (`GenderDot`, `RankBadge`, `StatusPill`, `UiModal`, `UiEmptyState`), chuẩn hóa `src/index.css` & `index.html`, ghi tài liệu `docs/ui/DESIGN.md`. `check:harness` xanh. |
| **G2** — Màn Sân & SlotSheet | **Xong** | `23dfa9c` | Thiết kế lại `CourtCard.tsx`, `SlotSheet.tsx` và lưới sân + thanh chuyển sân trong `App.tsx`. Cố định kích thước thẻ sân đồng đều giữa sân 4 người (Đôi), 2 người (Đơn), sân trống, sân tắt; cố định chiều cao ô người chơi (`62px`), cắt `...` một dòng; đồng bộ nhãn trình độ và chấm giới tính. `check:harness` xanh. |
| **G3** — Hàng chờ, Luật cặp, Lịch sử | **Xong** | `3826bcb` | Thiết kế lại `QueueTab.tsx`, `PairRulesTab.tsx`, `HistoryTab.tsx`. Cố định khung trình độ `min-w-[118px]` và nút giới tính `min-w-[78px]` thẳng cột `0.0px` sai lệch trên mọi danh sách; loại bỏ thẻ lồng thẻ và mã màu cứng. `check:harness` xanh. |
| **G4** — Tính tiền, Phòng Online, Cài đặt, Modal & Toast | **Xong** | `50c866a` | Thiết kế lại toàn bộ `SettlementTab.tsx` (kể cả Mục 6 Sổ lưu trữ & Sao kê đa buổi sửa triệt để tương phản sáng/tối), `CloudRoomModal.tsx` (QR/PIN đồng bộ hoàn toàn Light/Dark, xóa màu navy cũ), `PaymentQrModal.tsx`, `PostMatchModal.tsx`, `EquityTable.tsx`, `RankAdvisorPanel.tsx`, `Header.tsx`, `BottomNav.tsx`, `Toast.tsx`, `ErrorBoundary.tsx`. Giảm mã màu cứng UI từ `1.072` xuống `0`. `check:harness` xanh. |
| **G5** — Chế độ VIEWER & Responsive Laptop | **Xong** | `7a9f94c` | Khóa toàn bộ tab/thành phần dành cho Host khỏi `role === 'VIEWER'` thuần ở tầng component (không sửa `useCloudRoom.ts` hay dữ liệu đồng bộ); tối ưu bố cục căn giữa `max-width: 1200px` cho laptop/tablet (`auto-rows-fr`, lưới 2–3 cột đều nhau). `check:harness` xanh. |
| **G6** — Kiểm thử `/browser` (3 vòng) & Bộ ảnh `docs/ui/after/` | **Xong** | `9bf7a50` | Mở app thực tế trên Chrome qua 3 vòng kiểm thử và tinh chỉnh tại 5 kích thước `360`, `390`, `430`, `768`, `1280` (cả Dark & Light): vá portal modal (`createPortal` vào `document.body` + đóng bằng `Escape`), vá tầng cascade `@layer components` của Tailwind v4, tối ưu thanh trên cùng/thanh chuyển sân/nút `Chỉ dừng`/dòng nợ quá khứ ở `360px`, nâng các nút chạm chính lên `>= 44px`. Lưu 24 ảnh đã xác minh vào `docs/ui/after/`. `check:harness` xanh. |

> Không có giai đoạn nào bị chặn; không phát sinh file `docs/ui/BLOCKED.md`.

---

## 2. Danh sách những gì đã ẩn hoàn toàn với chế độ VIEWER (`role === 'VIEWER'`)

Toàn bộ cơ chế ẩn chỉ dùng biến `role` / `isViewer` có sẵn ở tầng UI component, **không sửa `useCloudRoom.ts` và không thay đổi dữ liệu đồng bộ**:

1. **Điều hướng dưới cùng (`src/components/BottomNav.tsx`) & Điều tuyến tab (`src/App.tsx`)**:
   - Ẩn hoàn toàn 3 tab: **Luật cặp (`rules`)**, **Lịch sử (`history`)**, và **Tính tiền (`settlement`)**.
   - Thanh điều hướng của `VIEWER` chỉ còn đúng 2 tab: **Sân** và **Hàng chờ**.
   - Tự động chuyển về tab **Sân** nếu trạng thái tab hiện tại không thuộc `courts` hoặc `queue`, và không mount các component `PairRulesTab`, `HistoryTab`, `SettlementTab` khi `isViewer === true`.
2. **Thanh trên cùng (`src/components/Header.tsx`)**:
   - Ẩn toàn bộ cụm thao tác quản trị Host: nút **Hoàn tác (Undo)**, **Làm lại (Redo)**, nút mở **Cài đặt xếp sân (`Settings`)**, và modal **Cài đặt xếp sân & buổi chơi**.
   - Ẩn chuỗi thông số cấu hình nội bộ của Host (`Chung bể / Tách sân · Bù +x.x`) ở phụ đề; thay bằng nhãn gọn trạng thái `Chỉ xem` + số sân đang bật.
   - Ẩn banner cảnh báo lỗi lưu trữ cục bộ (`storageError` / tải bản sao lưu JSON) của máy Host.
   - Giữ lại cho `VIEWER`: trạng thái phòng Online (để xem mã phòng / rời phòng / nhập PIN nâng quyền nếu cần), nút chuyển giao diện Sáng/Tối, và nút giữ sáng màn hình (`WakeLock`).
3. **Thông báo & Popup ghi lại thao tác của Host (`src/App.tsx`)**:
   - Ẩn hoàn toàn **`UndoToast`** (thanh thông báo ghi lại thao tác vừa làm kèm nút Hoàn tác của Host).
   - Ẩn hoàn toàn **`PostMatchModal`** (popup chốt tỉ số / kèo độ / nhận xét sau trận của Host).
   - Ẩn banner cảnh báo dữ liệu `localStorage` hỏng của Host (`corruptBackupWarning`).
4. **Màn Sân (`src/components/CourtCard.tsx`)**:
   - Ẩn nút menu quản trị sân (`...` — bật/tắt sân, sửa tên sân, xóa sân), nút bật lại sân đang tắt.
   - Ẩn toàn bộ nút hành động trận đang đánh (`Kết thúc & Vào lượt mới`, `Đảo cặp`, `Cân kèo`, `Độ`, `Chỉ dừng`) và bộ chỉnh kèo độ trực tiếp (`Sửa`).
   - Ẩn toàn bộ nút điều phối lượt kế tiếp (`Đôi/Đơn`, `Gợi ý lại`, `Đảo cặp`, `Cân kèo`, `Xóa hàng chờ lượt sau`, nút `×` xóa người khỏi slot, biểu tượng ổ khóa chốt tay `Lock` của Host) và vô hiệu hóa tương tác bấm chọn/đổi người (`SlotSheet` không mở cho `VIEWER`).
   - `VIEWER` chỉ thấy sạch sẽ: tên sân, trạng thái (Đang đánh / Đang trống / Đang tắt), thời lượng trận, đội hình đang đánh, đánh giá độ cân kèo, và đội hình Sắp vào sân (Next Up).
5. **Màn Hàng chờ (`src/components/QueueTab.tsx`)**:
   - Ẩn hoàn toàn các nút quản trị: `Chọn nhiều`, `Điểm danh CLB`, `Thêm khách`, thanh thao tác hàng loạt (`BulkActionBar`), modal thêm khách / điểm danh CLB / ghi chú CLB.
   - Ẩn toàn bộ nút chỉnh sửa trên từng thẻ người chơi: nút gắn sao CLB (`Star`), ghi chú CLB (`FileText`), stepper `- / +` chỉnh trình độ, nút đổi giới tính, dropdown chọn sân cố định, nút tạm nghỉ (`Pause`) và nút xóa người chơi.
   - `VIEWER` chỉ thấy danh sách hàng chờ dạng chỉ đọc (tên, chấm giới tính, nhãn trình độ cố định cỡ, số trận đã đánh, số lượt đang nghỉ, trạng thái đang đánh / tạm nghỉ).
6. **Popup Phòng Online (`src/components/CloudRoomModal.tsx`)**:
   - Ẩn tab **Cấu hình Supabase** (thông tin kỹ thuật/API key của quản trị).
   - Ẩn thẻ **Link điều hành (Co-Host)** và **mã PIN quản trị**.
   - `VIEWER` chỉ thấy thông tin phòng đang tham gia, mã QR chia sẻ chế độ Chỉ xem, nút sao chép link chỉ xem, tùy chọn nhập PIN để nâng quyền (nếu muốn trở thành Co-Host) và nút Rời phòng.

---

## 3. Số lượng mã màu cứng còn lại trong `src/`

Kiểm tra bằng PowerShell `Select-String` với biểu thức tìm `#hex`, `rgb(...)`, `rgba(...)`, `hsl(...)`, `hsla(...)` và toàn bộ class màu Tailwind viết tay (`bg-slate-*`, `text-emerald-*`, `border-amber-*`, v.v.):

- **Trong toàn bộ file giao diện & stylesheet** (`src/App.tsx`, `src/index.css`, `src/components/*.tsx`, `src/components/ui/*.tsx`, không tính file định nghĩa token duy nhất `src/styles/tokens.css`): **`0`** (đạt mục tiêu **0**, giảm từ 1.072 dòng trước thiết kế lại).
- **Trong các file logic/hook/tiện ích KHÔNG thuộc phạm vi sửa (được bảo vệ bởi Luật cứng)**: `26` dòng giữ nguyên không chạm vào:
  - `src/engine/skillConfig.ts`: `24` dòng (`badgeBg` / `badgeText` thuộc bảng cấu hình engine cũ — hiện không còn component UI nào dùng các trường màu này).
  - `src/hooks/useTheme.ts`: `1` dòng (màu `#...` cho thẻ `<meta name="theme-color">` của trình duyệt di động).
  - `src/utils/imageCompress.ts`: `1` dòng (`#ffffff` tô nền canvas trước khi nén ảnh biên lai sang JPEG).

---

## 4. Kết quả đo kiểm thực tế trên Chrome (G6 — `docs/ui/after/`)

Đã lưu **24 ảnh chụp đã xác minh** tại `docs/ui/after/` bao phủ đầy đủ 5 bề rộng (`360`, `390`, `430`, `768`, `1280`), cả 2 giao diện Sáng/Tối và toàn bộ kịch bản yêu cầu:

- **Kích thước thẻ sân & ô người chơi cố định**:
  - Laptop `1280px` (lưới 3 cột): cả 4 trạng thái (Sân 1 Đôi 4 người có tên ngắn `An`/`Bo` và tên rất dài `Nguyễn Hoàng Minh Khôi Quốc Khánh`, Sân 2 Đơn 2 người, Sân 3 Đang trống, Sân 4 Đang tắt) có kích thước **đồng nhất tuyệt đối `370.7px × 799.7px`**.
  - Tablet `768px` (lưới 2 cột): cả Hàng 1 và Hàng 2 đều **đồng nhất `345.7px × 799.7px`**.
  - Toàn bộ ô người chơi (`Đang đánh` và `Sắp vào sân`) có chiều cao cố định **`62.0px`**, tên dài cắt gọn bằng `...` trên 1 dòng.
- **Nhãn trình độ & Hàng chờ (0 / 5 / 24 người)**:
  - Khung trình độ `Newbie`, `Y`, `TBY+`, `TB++`, `TBK` thẳng hàng tuyệt đối (**độ lệch `0.0px`** across toàn bộ 22 hàng đang hoạt động).
- **Tràn ngang & Modal**:
  - `scrollWidth <= innerWidth` (**0 tràn ngang**) trên mọi màn hình và mọi bề rộng.
  - Mọi modal (`Cài đặt`, `Thêm khách`, `SlotSheet`, `Phòng Online`) render qua `createPortal` vào `document.body`, nền mờ phủ trọn màn hình, không bị cắt bởi header hay bị `BottomNav` đè lên, hỗ trợ đóng bằng phím `Escape`.
- **Mục 6 Sổ lưu trữ (Tính tiền)**:
  - Hai thẻ tổng hợp (Quỹ dư tích lũy / Nợ chưa thu) có độ tương phản sắc nét ở cả chế độ Sáng và Tối; các dòng nợ buổi trước hiển thị đầy đủ Tên + Ngày + Số tiền (`60.000đ`, `55.000đ`, `80.000đ`) với khoảng trống rõ ràng bên cạnh nút `Đã trả bù` (`44px`) ngay cả ở màn hình `360px`.

---

## 5. Các điểm chưa chắc chắn / lưu ý nhỏ

1. **Chụp ảnh trực tiếp chế độ `VIEWER` qua Supabase realtime:** Môi trường kiểm thử local không cấu hình Supabase URL/Key thực nên khi mở `/?room=DEMO-AUDIT`, ứng dụng tự động rơi về chế độ máy đơn (đã xác minh không có lỗi console hay crash). Toàn bộ điều kiện ẩn cho `VIEWER` đã được kiểm tra kỹ ở tầng mã nguồn qua tất cả 6 component (`App.tsx`, `BottomNav.tsx`, `Header.tsx`, `CourtCard.tsx`, `QueueTab.tsx`, `CloudRoomModal.tsx`) và đảm bảo không đụng tới `useCloudRoom.ts`. Nếu muốn xem ảnh chụp trực tiếp trạng thái `VIEWER`, cần tạo 1 phòng thật với tài khoản Supabase đã cấu hình và mở link chỉ xem.
2. **Nút phụ trong bảng Sổ độ / xuất CSV trên `SettlementTab`:** Toàn bộ nút thao tác chính ở Màn Sân, Hàng chờ, Luật cặp, Lịch sử, Cài đặt, Modal, bảng thu tiền (VietQR, Duyệt, Từ chối) và Sổ lưu trữ đều đã đạt `>= 44px`. Còn 4 nút thứ cấp ít dùng trong phần Sổ độ chi tiết (`Đánh dấu trả`/`Đánh dấu góp` ở mức `36px`, và pill `Xuất sao kê Excel (.csv)` ở tiêu đề Mục 6 ở mức `38px`) giữ kích thước gọn để không làm vỡ hàng bảng trên điện thoại `360px`.
3. **Nền chụp ảnh toàn trang của `BottomNav`:** Trong 3 ảnh chụp `fullPage` ở kích thước `1280px` và `768px` (`courts-1280-dark.png`, `courts-1280-light.png`, `courts-768-light.png`), thanh `BottomNav` (`position: fixed; bottom: 0`) xuất hiện ở vị trí cuối khung nhìn đầu tiên (`y ≈ 900px`) do cơ chế ghép ảnh cuộn dọc của Chrome DevTools — trên trình duyệt thực tế thanh này luôn cố định ở mép dưới màn hình và phần nội dung có `pb-28` nên không che khuất nội dung khi cuộn hết trang.
4. **File `src/engine/skillConfig.ts` còn giữ trường `badgeBg`/`badgeText`:** Các chuỗi màu Tailwind cũ trong file này không còn được UI sử dụng nhưng được giữ nguyên để tuân thủ tuyệt đối luật cứng không chỉnh sửa `src/engine/*` và không phá vỡ tương thích kiểu dữ liệu/test hiện có.
