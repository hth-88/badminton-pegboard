# QUY CHUẨN BẤT BIẾN DỰ ÁN XẾP SÂN CẦU LÔNG (BADMINTON HARNESS RULES)

> **MỤC ĐÍCH**: Tài liệu quy chuẩn tối cao của dự án. Mọi thay đổi mã nguồn, tính năng mới hoặc vá lỗi trong bất kỳ phiên làm việc nào bắt buộc phải tuân thủ nghiêm ngặt 6 quy tắc dưới đây.

---

## 0. Rule 0: Khởi Động Phiên Mới & Quản Lý Tài Liệu (BẮT BUỘC)
- **Khi bắt đầu phiên chat mới:** Trước khi đề xuất giải pháp hoặc sửa mã nguồn, **BẮT BUỘC** đọc:
  1. [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) — Nguồn ngữ cảnh duy nhất về kiến trúc, quyết định sản phẩm và các lỗi đang tạm hoãn.
  2. [docs/ui/DESIGN.md](docs/ui/DESIGN.md) — Hệ thiết kế & token CSS (nếu tác vụ liên quan đến giao diện).
- **Cấm xả file `.md` lên GitHub:**
  - **KHÔNG** tạo các file `.md` kế hoạch, audit, handoff hay báo cáo theo từng đợt ở thư mục gốc hoặc trong `docs/`.
  - Mọi file kế hoạch/nháp cục bộ chỉ được lưu trong thư mục `.local-docs/` (đã nằm trong `.gitignore`) hoặc Artifact của phiên chat.
  - Khi có quyết định sản phẩm hoặc thay đổi kiến trúc mới đã chốt, cập nhật trực tiếp vào [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

---

## 1. Rule 1: Pure Reducer & State Machine
- `src/engine/sessionReducer.ts` phải là hàm thuần túy (pure function) 100%.
- **CẤM** gọi `Date.now()`, `Math.random()`, các hàm bất định hoặc side-effects bên trong reducer.
- Mọi timestamp (`now`) hoặc dữ liệu ngẫu nhiên bắt buộc phải tính trước ở component/hook và truyền vào qua `action.payload.now`.
- Reducer không được thực hiện I/O, gọi mạng, `localStorage`, hay API Supabase bên trong.
- Lưu trữ `undoStack` giới hạn tối đa 5 bước, không lưu `redoStack` xuống bộ nhớ dài hạn, và không đưa các action non-undoable (`LOAD_STATE`, snooze, timer) vào `undoStack`.

---

## 2. Rule 2: Độc Lập 3 Sân & Tôn Trọng Manual Edit
- **Sân 1, Sân 2, Sân 3 hoạt động độc lập:**
  - `court.nextUp` của mỗi sân lưu trực tiếp trong state (`NextUpDraft`).
  - Thao tác tại Sân X (Gợi ý kèo, Gợi ý lại, Cân kèo, Đảo cặp, Xóa trắng) CHỈ ĐƯỢC PHÉP thay đổi `courts[X].nextUp` và `courts[X].suggestCursor`, **CẤM** hiệu ứng domino sang sân khác.
- **Tôn trọng sửa đổi thủ công (`MANUAL`):**
  - Khi Host đổi tay 1 slot trong Next Up (đánh dấu `'MANUAL'`), các vị trí còn lại trên sân đó **PHẢI ĐƯỢC GIỮ NGUYÊN 100%**.
  - CẤM matchmaker tự ý hoán đổi hoặc thay thế các slot `MANUAL`.
  - Nút `[X]` xóa đúng 1 slot chỉ định về `null`; nút `[Xóa trắng]` xóa cả 4 slot về `null` và giữ trống cho tới khi Host thao tác mới.

---

## 3. Rule 3: Bảo Vệ Đồng Bộ Cloud Sync (`useCloudRoom.ts`)
- **Kiểm soát vòng đời kết nối:**
  - Effect kết nối Realtime & fetch phòng trong `src/hooks/useCloudRoom.ts` CHỈ ĐƯỢC chạy theo `[roomCode, clientId]`.
  - **TUYỆT ĐỐI CẤM** đưa `sessionState`, `settlementState`, hoặc các callback chưa bọc `useRef` vào dependency array của effect kết nối phòng.
- **Cơ chế chống đè dữ liệu & bảo vệ khi vừa vào phòng:**
  - Phải giữ nguyên các ref guard: `isApplyingRemoteRef`, `hasPendingLocalChangeRef`, `lastAppliedTimestampRef`, `awaitingRemoteSessionHydrationRef`, `awaitingRemoteSettlementHydrationRef`.
  - Khi `joinRoom(...)`, khóa push local lên Cloud cho tới khi dữ liệu remote của phòng được nạp xong (tránh máy mới mở phòng rỗng đè mất dữ liệu phòng đang chạy trên Supabase).
  - Luôn kiểm tra timestamp nghiêm ngặt (`remoteUpdatedAt > lastAppliedTimestampRef.current`) trước khi áp dụng gói remote.
- **Không đưa Cloud Sync vào Undo:**
  - Không đẩy action `LOAD_STATE` vào `undoStack`, không dùng `UndoToast` cho thông báo kết nối phòng.

---

## 4. Rule 4: Công Thức Quyết Toán Bất Biến (Settlement Invariants)
- **Tỷ lệ Nam / Nữ (`GENDER_RATIO`):**
  - Tỷ lệ `genderRatioMalePercent : genderRatioFemalePercent` (vd `60 : 40`) là **TỶ LỆ MỨC ĐÓNG CỦA 1 CÁ NHÂN NAM SO VỚI 1 CÁ NHÂN NỮ**:
    $$\text{perMaleWeight} = \text{genderRatioMalePercent}, \quad \text{perFemaleWeight} = \text{genderRatioFemalePercent}$$
  - **TUYỆT ĐỐI CẤM** chia trọng số này cho tổng số người trong nhóm giới tính.
- **Mức giá mặc định:**
  - Tiền sân mặc định: `160.000đ/giờ`, Tiền cầu mặc định: `30.000đ/quả`, Phụ phí mặc định: `0đ`.

---

## 5. Rule 5: Pre-Commit Harness Gate
- Mọi thay đổi mã nguồn trước khi commit hoặc báo cáo hoàn thành bắt buộc phải pass 100%:
  ```bash
  npm run check:harness
  ```
- Bao gồm: `tsc -b` (0 lỗi), `vitest run` (100% test pass), và `vite build` (build thành công).
