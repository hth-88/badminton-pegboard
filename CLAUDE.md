# QUY CHUẨN BẤT BIẾN DỰ ÁN XẾP SÂN CẦU LÔNG (BADMINTON HARNESS RULES)

> **MỤC ĐÍCH**: Đây là tài liệu quy chuẩn tối cao và bất biến của dự án. Mọi thay đổi mã nguồn, tính năng mới hoặc vá lỗi trong bất kỳ phiên làm việc nào bắt buộc phải tuân thủ nghiêm ngặt 5 Quy tắc Bất biến (Invariants) dưới đây. Tuyệt đối không tự ý vi phạm hoặc sửa đổi nguyên tắc mà không có yêu cầu trực tiếp.

---

## 1. Rule 1: Pure Reducer & State Machine
- `src/engine/sessionReducer.ts` phải là hàm thuần túy (pure function) 100%.
- **CẤM** gọi `Date.now()`, `Math.random()`, các hàm bất định hoặc side-effects bên trong reducer.
- Mọi timestamp (`now`) hoặc dữ liệu ngẫu nhiên bắt buộc phải được tính toán trước ở component/hook và truyền vào qua `action.payload.now`.
- Reducer không được thực hiện các tác vụ I/O, gọi mạng, gọi `localStorage`, hay tương tác API Supabase bên trong.
- Lưu trữ lịch sử hoàn tác (`undoStack`) giới hạn tối đa 5 bước, không lưu `redoStack` vào bộ nhớ dài hạn, và không đưa các action non-undoable (như `LOAD_STATE` từ cloud, snooze, timer) vào `undoStack`.

---

## 2. Rule 2: Độc Lập 3 Sân & Tôn Trọng Manual Edit
- **Sân 1, Sân 2, Sân 3 hoạt động độc lập:**
  - `court.nextUp` của mỗi sân được lưu trực tiếp trong state (`NextUpDraft`).
  - Thao tác tại Sân X (ví dụ: bấm "Gợi ý kèo", "Gợi ý lại", "Cân kèo", "Đảo cặp", hoặc "Xóa trắng") CHỈ ĐƯỢC PHÉP thay đổi `courts[X].nextUp` và `courts[X].suggestCursor`.
  - **CẤM TUYỆT ĐỐI** hiệu ứng domino: Thao tác ở Sân 1 không được làm thay đổi hoặc nhảy đội hình Next Up của Sân 2 hoặc Sân 3.
- **Tôn trọng sửa đổi thủ công (Manual Edit):**
  - Khi Host chạm vào 1 slot ở Next Up để đổi người (đánh dấu `'MANUAL'`), 3 vị trí còn lại trên sân đó **PHẢI ĐƯỢC GIỮ NGUYÊN 100%**.
  - CẤM matchmaker tự ý can thiệp, hoán đổi hoặc thay thế 3 người còn lại để ép cân trình hay ép tỷ lệ giới tính.
  - Nút `[X]` (xóa slot) xóa đúng 1 slot chỉ định về `null`.
  - Nút `[🗑️ Xóa trắng]` xóa cả 4 slot về `null` và giữ nguyên trạng thái trống cho tới khi Host có hành động mới, không tự động điền đè.

---

## 3. Rule 3: Chống Vòng Lặp Reset Dữ Liệu Cloud Sync (CRITICAL)
- **Kiểm soát vòng đời kết nối:**
  - Hook kết nối Supabase (`useCloudRoom.ts` / `App.tsx`) CHỈ ĐƯỢC chạy `useEffect` khởi tạo kết nối và fetch lần đầu dựa trên `[roomCode, pinCode]`.
  - **TUYỆT ĐỐI CẤM** đưa `state`, `currentState`, hoặc các hàm callback không bọc `useRef` (như `onRemoteState`, `onApplyCloudState`, `onShowToast`) vào dependency array của `useEffect` kết nối phòng. Việc làm này khiến mỗi lần người dùng bấm nút làm `state` đổi sẽ kích hoạt lại hàm kết nối từ đầu và kéo dữ liệu cũ từ Cloud về đè mất thao tác cục bộ!
- **Cơ chế chống đè dữ liệu (Local Action Guard):**
  - Khi người dùng vừa thực hiện thao tác cục bộ (`lastLocalActionAt`), phải khóa không cho gói tin từ Cloud ghi đè trong ít nhất `1500ms`.
  - Luôn so sánh nghiêm ngặt timestamp: `remote.updated_at > localLastUpdatedAt`. Nếu bản ghi từ xa cũ hơn hoặc bằng thao tác cục bộ, bỏ qua ngay lập tức.
- **Không đưa Cloud Sync vào Undo:**
  - Không bao giờ đẩy action `LOAD_STATE` nhận từ Cloud vào `undoStack`.
  - Không hiển thị nút "Hoàn tác" trên toast thông báo kết nối phòng (phải dùng Toast thông tin thông thường `InfoToast`, tuyệt đối không dùng `UndoToast` cho sự kiện hệ thống).

---

## 4. Rule 4: Công Thức Quyết Toán Bất Biến (Settlement Invariants)
- **Tỷ lệ Nam / Nữ (`GENDER_RATIO`):**
  - Tỷ lệ `genderRatioMalePercent : genderRatioFemalePercent` (ví dụ `60 : 40` hoặc `55 : 45`) là **TỶ LỆ MỨC ĐÓNG CỦA 1 CÁ NHÂN NAM SO VỚI 1 CÁ NHÂN NỮ**:
    $$\text{perMaleWeight} = \text{genderRatioMalePercent}, \quad \text{perFemaleWeight} = \text{genderRatioFemalePercent}$$
  - **TUYỆT ĐỐI CẤM** chia trọng số này cho tổng số người trong nhóm giới tính (sai bản chất toán học dẫn đến Nữ bị gánh tiền nhiều hơn Nam khi Nam đông hơn Nữ).
- **Mức giá mặc định:**
  - Tiền sân mặc định: `160.000đ/giờ`.
  - Tiền cầu mặc định: `30.000đ/quả`.
  - Phụ phí mặc định: `0đ`.

---

## 5. Rule 5: Pre-Commit Harness Gate
- Mọi thay đổi mã nguồn trước khi commit hoặc báo cáo hoàn thành bắt buộc phải vượt qua toàn bộ kiểm tra của bộ Harness Gate:
  ```bash
  npm run check:harness
  ```
- Lệnh này bao gồm:
  1. `tsc --noEmit`: Kiểm tra 0 lỗi kiểu dữ liệu TypeScript.
  2. `vitest run`: Vượt qua 100% tất cả các unit tests hiện có và regression tests mới.
  3. `vite build`: Đóng gói ứng dụng thành công, không phát sinh lỗi biên dịch hay import.

