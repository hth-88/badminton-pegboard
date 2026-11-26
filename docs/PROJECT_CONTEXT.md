# Ngữ Cảnh Tổng Hợp Dự Án — Xếp Sân Cầu Lông (Badminton Pegboard)

> **Nguồn sự thật duy nhất (Single Source of Truth).**  
> Quy chuẩn kỹ thuật bất biến xem tại [CLAUDE.md](../CLAUDE.md). Hệ thiết kế & CSS tokens xem tại [docs/ui/DESIGN.md](ui/DESIGN.md).

---

## 1. Tổng Quan & Triết Lý Sản Phẩm
- **Bài toán:** Hỗ trợ Host điều phối nhóm đánh cầu lông phong trào (8–24+ người, tối đa 3 sân) công bằng, thao tác nhanh bằng 1 tay trên điện thoại, hỗ trợ offline (`localStorage`) và đồng bộ nhiều máy qua Supabase Realtime không cần đăng nhập tài khoản (phân quyền bằng mã phòng + PIN 4 số: `CO_HOST` vs `VIEWER`).
- **Host Authority:** Matchmaker chỉ gợi ý; vị trí xếp tay (`MANUAL`) luôn được tôn trọng, cảnh báo mềm thay vì chặn cứng vô lý, có `Undo`/`Redo` (tối đa 5 bước).
- **Tech Stack:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Vitest 5, Oxlint, `@supabase/supabase-js`, `qrcode`, triển khai trên Vercel.

---

## 2. Bản Đồ Mã Nguồn (`src/`)

| Nhóm | File chính | Vai trò |
| :--- | :--- | :--- |
| **Types** | `src/types/badminton.ts` | Toàn bộ kiểu domain (`Player`, `Court`, `NextUpDraft`, `PairRule`, `MatchHistory`, `SessionSettings`, `BadmintonSessionState`). |
| **State & Engine** | `src/engine/sessionReducer.ts`, `src/engine/useBadmintonSession.ts`, `src/engine/stateMigration.ts`, `src/engine/storage.ts` | Reducer thuần túy, hook quản lý session, migrate dữ liệu & lưu `localStorage`. |
| **Xếp sân & Luật** | `src/engine/matchmaker.ts`, `src/engine/nextUp.ts`, `src/engine/validateLineup.ts`, `src/engine/scoreValidation.ts` | Thuật toán gợi ý kèo Đôi/Đơn, giữ slot `MANUAL`, kiểm tra luật cặp/giao lưu, validate tỉ số cầu lông. |
| **Phân tích & Kèo** | `src/engine/skillAnalyzer.ts`, `src/engine/skillConfig.ts`, `src/engine/matchFeedbackStorage.ts`, `src/engine/betLedger.ts`, `src/engine/statsManager.ts`, `src/engine/clubRosterStorage.ts` | Theo dõi phong độ buổi đánh (`sessionFormOffset`), lưu feedback trận, sổ kèo độ, danh sách CLB. |
| **Tính tiền & VietQR** | `src/engine/settlement.ts`, `src/engine/vietqr.ts`, `src/hooks/useSettlementState.ts`, `src/utils/statementCsv.ts` | Công thức chia tiền sân/cầu/phụ phí/giảm người ít trận, sinh payload VietQR chuẩn EMVCo/NAPAS 247 + CRC-16, xuất CSV. |
| **Cloud Sync & AI** | `src/hooks/useCloudRoom.ts`, `src/services/supabaseSync.ts`, `src/services/geminiRankAdvisor.ts` | Đồng bộ Realtime 2 chiều (session + settlement), phòng online/PIN, lưu ảnh biên lai, gọi Gemini AI. |
| **Lịch tuần & CLB** | `src/types/schedule.ts`, `src/engine/scheduleEngine.ts`, `src/services/clubScheduleSync.ts`, `src/hooks/useClubSchedule.ts`, `src/components/schedule/ScheduleView.tsx` | Lưới lịch 17 kíp (`7h–24h`), Heatmap theo `submitted` (`1h/1.5h/2h/3h`), Maximum 2-Set Coverage chia 2 ca, đồng bộ CLB & lịch qua RPC + Supabase Realtime, định tuyến `?club=` độc lập với phòng đánh. |
| **UI & Tiện ích** | `src/App.tsx`, `src/components/*`, `src/components/ui/Primitives.tsx`, `src/styles/tokens.css`, `src/utils/imageCompress.ts` | Giao diện 5 tab đồng nhất cho cả Host & Viewer (`Lịch tuần`, `Sân`, `Hàng chờ` [gồm sub-tab `Danh sách chờ \| Luật cặp`], `Lịch sử`, `Tính tiền`), banner phòng LIVE, modal VietQR, nén ảnh biên lai. |

---

## 3. Các Quyết Định Nghiệp Vụ Đang Áp Dụng

1. **Xếp sân & Hàng chờ:**
   - **3 sân độc lập:** Gợi ý / Cân kèo / Đảo cặp / Xóa trắng ở Sân X không làm nhảy `nextUp` của sân khác.
   - **Giữ nguyên `MANUAL`:** Bấm *Gợi ý lại* luôn giữ các slot đã khóa tay, chỉ xoay các slot tự động.
   - **Ca 0 người chờ ở nhiều sân chung (`SHARED_POOL`):** Để trống `nextUp` khi vừa vào trận (chờ sân xong để trộn người, hoặc Host bấm gợi ý tay).
   - **Tách sân & Giao lưu:** Hỗ trợ chọn nhiều người để chuyển sân hàng loạt; trong `SlotSheet` có nút gạt *Giao lưu (hiện sân khác)* khi bật chế độ `Tách sân`.
2. **Chốt trận & Tỉ số (`PostMatchModal.tsx`, `scoreValidation.ts`):**
   - Nút `×` chỉ đóng popup và **giữ nguyên trận đang đánh** trên sân; chỉ kết thúc trận khi bấm *Bỏ qua* hoặc *Lưu kết quả*.
   - Validate tỉ số: số nguyên không âm (`>= 0`), không cho hòa, dưới 30 điểm phải thắng cách biệt `>= 2` điểm, từ 30 điểm trở lên chấp nhận thắng cách biệt `>= 1` điểm (không khóa trần 30 để hỗ trợ kèo chạm/kéo dài).
3. **Tính tiền & VietQR (`SettlementTab.tsx`, `PaymentQrModal.tsx`):**
   - **Trần tiền bù giảm giá +30%:** Khóa mức bù tối đa `+30%` so với mức chia gốc cho mỗi người đánh đủ trận; nếu hụt thì co nhẹ mức giảm của nhóm đánh ít (ẩn ghi chú `+30%` rườm rà trên UI).
   - **Chế độ Theo giờ:** Tự nhân với số sân đang hoạt động; input số xử lý sạch số `0` đầu (không dính `0300000`).
   - **VietQR & Biên lai:** Tạo QR cục bộ bằng `qrcode` + Canvas (không phụ thuộc ảnh external CORS để tải về máy ổn định), nội dung chuyển khoản chuẩn `TEN IN HOA + noi dung`. Ảnh biên lai nén tự động và có fallback lưu Data URL inline nếu Supabase Storage thiếu bucket.
4. **Phân quyền `VIEWER`, Định tuyến `?club=` & Bảo mật phòng Online:**
   - Cả Host (`OFFLINE` / `CO_HOST`) và `VIEWER` đều có cố định **5 tab** trên `BottomNav`: `Lịch tuần`, `Sân`, `Hàng chờ`, `Lịch sử`, `Tính tiền`. Sub-tab `Luật cặp` nằm trong `Hàng chờ` và ẩn hoàn toàn với `VIEWER` (giữ nguyên badge đỏ `conflictCount` trên `Hàng chờ` cho Host).
   - Truy cập mặc định mở tab `Sân`; khi vào bằng `?club=CODE` (không kèm `?room=`) mà CLB chưa có sân LIVE thì tự mở `Lịch tuần`, nếu CLB đang có sân LIVE thì giữ ở `Sân` và hiện banner 1 chạm vào phòng LIVE.
   - Rời phòng (`leaveRoom`) chỉ reset session & settlement của phòng về trạng thái rỗng và xóa `?room=`/`?pin=`; **tuyệt đối không xóa** dữ liệu CLB, `?club=`, `selectedMemberId` (`myMemberId`) hay Lịch tuần.
   - Ẩn tab Cấu hình Supabase khỏi `CloudRoomModal` khi app đã cấu hình qua `.env`.
5. **Phong độ buổi đánh (`skillAnalyzer.ts`, `matchmaker.ts`):**
   - Bảng thống kê phong độ buổi đánh luôn hiển thị ở tab AI; `sessionFormOffset` (biên `[-1.5, +1.5]`) tham gia vào hàm tính cân kèo khi xếp sân.

---

## 4. Điểm Đang Tạm Hoãn / Known Issues

> [!WARNING]
> **Gemini AI Rank Advisor (`src/services/geminiRankAdvisor.ts`) — TẠM HOÃN CHƯA SỬA**  
> Hiện đang gặp lỗi kết nối API Gemini (`HTTP 404` khi người dùng test thực tế). Theo chỉ đạo ở Đợt 5, tạm thời **chỉ ghi nhận, chưa sửa** cho tới khi người dùng yêu cầu và chốt phương án mới (dự kiến có thể cần `/grill-me` về logic AI điều chỉnh trình & xử lý API).

---

## 5. Lệnh Kiểm Tra Bắt Buộc
```bash
npm run check:harness   # tsc -b && vitest run && vite build (bắt buộc pass trước khi commit)
npm run lint            # oxlint
```
