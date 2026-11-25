# Kế hoạch Đợt 3 — Sửa lỗi thực tế & Nâng cấp vận hành sân

> **Mục đích file:** Tài liệu bàn giao đầy đủ để triển khai sau khi hồi usage (có thể chạy tuần tự từng Stage và `git commit` sau mỗi Stage, luôn chạy `npm run check:harness` pass 100% trước khi commit).
> **Trạng thái:** Đã duyệt hướng thiết kế (chưa sửa code trong `src/`).

---

## Ràng buộc bất biến (đọc `CLAUDE.md` trước khi sửa)
1. **Harness Rule 1:** Giữ pure function trong `src/engine/sessionReducer.ts`, không mutate trực tiếp state.
2. **Harness Rule 2:** Giữ độc lập 3 sân (`courts`), tuyệt đối không ghi đè slot `MANUAL` trong `nextUp`.
3. **Harness Rule 3:** Trong `src/hooks/useCloudRoom.ts`, **KHÔNG đổi dependency array `[roomCode, clientId]`** của Realtime listener (effect #3) và giữ nguyên các ref guard đồng bộ (`isApplyingRemoteRef`, `hasPendingLocalChangeRef`, `lastAppliedTimestampRef`, ...).
4. **Harness Rule 4:** Không phá vỡ invariant tính tiền (`160k/h`, `30k/quả cầu`, chế độ chia đều / tỉ lệ / giảm người ít trận).
5. **Harness Rule 5:** Mọi thay đổi phải pass `npm run check:harness` (`vitest` + `tsc -b` + `vite build`).
6. **UI System:** Giữ thống nhất hệ thiết kế **Volt Obsidian** (`src/index.css` — `.vo-glass-card`, `.vo-tile`, `.vo-cta-lime`, `.ui-btn`, hỗ trợ cả Dark & Light mode).

---

## Danh sách file cần tác động (File Map)

| Nhóm / Stage | File chính cần sửa | Ghi chú kỹ thuật đã khảo sát |
|---|---|---|
| **Stage 1** | `src/components/SettlementTab.tsx` | Fix input dính số `0` đầu (`0300000`), liên kết số sân bật ở chế độ Theo giờ, xóa dòng `+30%`. |
| **Stage 2** | `src/engine/vietqr.ts`, `src/components/PaymentQrModal.tsx`, `src/utils/imageCompress.ts`, `src/services/supabaseSync.ts`, `src/engine/__tests__/vietqr.test.ts` | Đổi format CK thành `TÊN IN HOA + NỘI DUNG`, fix tải QR (CORS/mobile), fix & chẩn đoán upload ảnh biên lai. |
| **Stage 3** | `src/components/BottomNav.tsx`, `src/App.tsx`, `src/components/SettlementTab.tsx`, `src/components/HistoryTab.tsx` | Khôi phục tab `Lịch sử` & `Tính tiền` cho `VIEWER` (giao diện Tính tiền gọn cho khách, ẩn sổ lưu trữ/nợ cũ). |
| **Stage 4** | `src/hooks/useCloudRoom.ts`, `src/App.tsx`, `src/components/CloudRoomModal.tsx`, `src/services/supabaseSync.ts`, `src/hooks/__tests__/useCloudRoomSync.test.ts` | Cách ly dữ liệu phòng khi `VIEWER` rời phòng (khôi phục phiên offline cũ hoặc phiên trống) + ẩn tab `Cấu hình Supabase` & không pre-fill key `.env`. |
| **Stage 5** | `src/components/QueueTab.tsx`, `src/engine/sessionReducer.ts`, `src/engine/useBadmintonSession.ts`, `src/components/SlotSheet.tsx`, `src/engine/nextUp.ts`, `src/engine/validateLineup.ts`, `src/components/ui/Primitives.tsx`, `src/index.css` | Chọn nhiều → Chuyển sân hàng loạt; nút gạt `Giao lưu (hiện sân khác)` trong `SlotSheet` khi bật `Tách sân`; fix Modal Cài đặt bị đẩy lên góc trên trên iOS Safari. |
| **Stage 6** | `src/components/PostMatchModal.tsx` (+ unit test helper validate tỉ số) | Xóa nút `Bỏ qua` trùng ở header modal; kiểm tra tỉ số (chặn hòa `21-21`, `<0`, `>30`, 1 bên trống; cảnh báo nhẹ set ngắn `11`/`15`). |
| **Stage 7** | `src/engine/skillAnalyzer.ts`, `src/components/RankAdvisorPanel.tsx`, `src/engine/matchmaker.ts`, `src/components/Header.tsx` (+ unit tests) | Luôn hiển thị bảng thống kê phong độ buổi đánh ở tab AI + thêm `sessionFormOffset` (biên `[-1.5, +1.5]`) cho thuật toán xếp sân, tôn trọng tuyệt đối `FIXED_PAIR`/`AVOID`. |

---

## Chi tiết từng Stage

### Stage 1: Chi phí buổi chơi & ẩn ghi chú `+30%`
- **File:** `src/components/SettlementTab.tsx`
- **Yêu cầu:**
  1. **Sửa lỗi dính số `0` đầu (`0300000`):**
     - Mọi ô nhập số tiền/số lượng (`Tổng tiền sân`, `Giá/giờ`, `Số giờ`, `Số quả cầu`, `Giá/quả`, `Chi phí khác`, v.v.) không được ép hiển thị `0` khi người dùng xóa sạch để nhập mới.
     - Cho phép trạng thái rỗng tạm thời khi gõ (`inputMode="numeric"` / `decimal`), tự bỏ số `0` vô nghĩa ở đầu (`raw.replace(/^0+(?=\d)/, '')`) trước khi cập nhật state số.
  2. **Liên kết `Tiền sân → Theo giờ` với số sân đang hoạt động:**
     - Đọc số sân đang bật: `activeCourtsCount = Math.max(1, courts.filter((c) => c.isEnabled).length)`.
     - Khi ở chế độ `Theo giờ`, mặc định số sân nhân theo `activeCourtsCount` (có hiển thị gọn `Đang bật X/3 sân` và tự đồng bộ khi bật/tắt sân trừ khi Host đã chủ động sửa tay số sân khác).
  3. **Bỏ dòng phụ chú `+30%`:**
     - Xóa text `Bù vào người đủ trận (tối đa +30%, đúng theo chế độ chia tiền)` trong mục `2. Chế độ phân chia & Giảm giá` (không thay đổi thuật toán chia tiền trong `src/engine/settlement.ts`).

---

### Stage 2: Chuyển khoản VietQR & Đính kèm ảnh biên lai
- **Files:** `src/engine/vietqr.ts`, `src/components/PaymentQrModal.tsx`, `src/utils/imageCompress.ts`, `src/services/supabaseSync.ts`
- **Yêu cầu:**
  1. **Chuẩn hóa `Nội dung CK` (`buildPlayerTransferNote` trong `vietqr.ts`):**
     - Đổi từ `${prefix} ${playerName}` sang **`${UPPER_PLAYER_NAME} ${prefix}`**.
     - Tên người chơi phải bỏ dấu và **IN HOA HẾT** đứng trước (VD: `PHUONG CHUYEN TIEN CAU BUOI` hoặc `TUAN TIEN CAU 25 11`), giới hạn tối đa 50 ký tự.
     - Cập nhật test trong `src/engine/__tests__/vietqr.test.ts`.
  2. **Sửa lỗi nút `Tải QR` (`PaymentQrModal.tsx`):**
     - `fetch(qrUrl)` từ `img.vietqr.io` thường vướng CORS trên trình duyệt/mobile và rơi vào `window.open` (bị chặn popup hoặc không tải về máy).
     - Xử lý theo tầng ưu tiên:
       1. Thử `fetch(qrUrl, { mode: 'cors' })` lấy Blob → trên mobile hỗ trợ `navigator.share({ files })` (Share Sheet lưu thẳng vào Ảnh trên iOS/Android) hoặc tạo `<a download>` trên desktop.
       2. Nếu CORS chặn `fetch`, thử vẽ từ thẻ `<img>` (nếu không tainted canvas) hoặc fallback mở hộp xem ảnh QR phóng to kèm hướng dẫn rõ ràng `"Nhấn giữ vào ảnh QR để Lưu về máy"`.
  3. **Sửa lỗi upload ảnh biên lai (`PaymentQrModal.tsx`, `imageCompress.ts`, `supabaseSync.ts`):**
     - Kiểm tra `compressReceiptImage` (`src/utils/imageCompress.ts`): bổ sung fallback nếu trình duyệt iOS/mobile lỗi `createImageBitmap` (ví dụ ảnh HEIC/ảnh lớn) → fallback `FileReader` + `Image` hoặc gửi thẳng file gốc nếu kích thước ≤ 350KB.
     - Trong `uploadPaymentReceipt` (`supabaseSync.ts`) và `PaymentQrModal.tsx`: trả về và hiển thị mã lỗi cụ thể từ Supabase Storage (thay vì ẩn lỗi), phân biệt rõ trường hợp `roomCode` trống (chưa bật Phòng Online) với lỗi phân quyền bucket `payment-receipts` (chưa có policy `INSERT`/`SELECT` cho `anon`).
     - Kiểm tra lại cả luồng `onReportPayment` ở chế độ `VIEWER` và `CO_HOST` để đảm bảo ảnh biên lai được đính kèm & đồng bộ realtime lên Host.

---

### Stage 3: Khôi phục `Lịch sử` & `Tính tiền` cho Người xem (Viewer)
- **Files:** `src/components/BottomNav.tsx`, `src/App.tsx`, `src/components/SettlementTab.tsx`, `src/components/HistoryTab.tsx`
- **Yêu cầu:**
  1. **`BottomNav.tsx` (dòng 76–79) & `App.tsx`:**
     - Cho phép `VIEWER` thấy đủ **4 tab**: `Sân`, `Hàng chờ`, `Lịch sử`, `Tính tiền`.
     - Tiếp tục **ẩn hoàn toàn** tab `Luật cặp` (`rules`) đối với `VIEWER` và chặn điều hướng nếu URL/state trỏ vào `rules`.
  2. **`HistoryTab.tsx`:**
     - `VIEWER` xem được danh sách trận đã đấu, tỉ số, thời gian, kèo độ — **tuyệt đối ẩn** ghi chú riêng tư, tag nhận xét cá nhân và nút chỉnh sửa trận của Host.
  3. **`SettlementTab.tsx` (giao diện riêng cho `VIEWER`, giữ nguyên thẩm mỹ Volt Obsidian):**
     - **Phần tóm tắt chi phí buổi chơi (chỉ đọc):** Hiển thị gọn, chuyên nghiệp gồm:
       - Tiền sân hôm đó
       - Tiền cầu hôm đó
       - Phụ phí (chỉ hiện khi `extraCost > 0`, kèm ghi chú nếu có)
       - Tổng tiền buổi chơi
     - **Danh sách chọn từng người đóng tiền:** Hiển thị từng thành viên, số trận, số tiền cần đóng, trạng thái đóng tiền, cho phép bấm vào tên mình để mở `PaymentQrModal` (lấy VietQR / copy STK / báo đã chuyển + đính kèm biên lai).
     - **Ẩn hoàn toàn với `VIEWER`:**
       - Toàn bộ form cấu hình giá/chia tiền/ngân hàng của Host.
       - Tab `AI Nhận xét`.
       - Toàn bộ **Mục 6: Sổ lưu trữ & Sao kê đa buổi** (quỹ dư tích lũy, nợ chưa thu các buổi trước, nút xuất Excel, danh sách buổi cũ).

---

### Stage 4: Cách ly dữ liệu phòng khi Viewer rời phòng & Ẩn cấu hình Supabase mặc định
- **Files:** `src/hooks/useCloudRoom.ts`, `src/App.tsx`, `src/components/CloudRoomModal.tsx`, `src/services/supabaseSync.ts`, `src/hooks/__tests__/useCloudRoomSync.test.ts`
- **Yêu cầu:**
  1. **Cách ly dữ liệu phòng (tránh thoát Viewer thành Host trên data của phòng):**
     - Lưu ý tuân thủ **Harness Rule 3** (giữ nguyên deps `[roomCode, clientId]` của effect #3 trong `useCloudRoom.ts`).
     - Trước khi nạp dữ liệu phòng vào máy lúc `joinRoom` với vai trò `VIEWER` (khi máy đang `OFFLINE`): lưu bản sao lưu phiên offline hiện có (`session_data` + `settlement` local) vào `localStorage` key riêng (VD: `badminton_offline_backup_v1`).
     - Khi `VIEWER` bấm **`Rời phòng`**: khôi phục lại phiên offline đã sao lưu trước đó (nếu máy chưa từng tự tạo buổi nào thì reset sạch về phiên trống ban đầu), đồng thời xóa dữ liệu settlement tạm của phòng vừa rời.
     - Đảm bảo khi đang ở trong phòng, người xem thấy đúng dữ liệu phòng đó (trừ các mục riêng tư đã chặn ở Stage 3); rời phòng là sạch hoàn toàn dữ liệu phòng đó khỏi máy.
  2. **Ẩn cấu hình Supabase mặc định khỏi UI (`supabaseSync.ts` & `CloudRoomModal.tsx`):**
     - Thêm helper `hasEnvSupabaseConfig(): boolean` trong `src/services/supabaseSync.ts`.
     - Trong `src/components/CloudRoomModal.tsx` (dòng 92–99):
       - **Tuyệt đối không pre-fill** `URL` và `Anon Key` lấy từ biến môi trường (`.env` Vercel) vào 2 ô input `customUrl` / `customKey`.
       - Khi `hasEnvSupabaseConfig() === true`: **ẩn hoàn toàn tab `Cấu hình Supabase`** khỏi modal (chỉ hiện 2 tab `Quản lý phòng` và `Vào phòng có sẵn`). Chỉ hiện tab cấu hình nếu bản deploy chưa cấu hình `.env`.
  3. Bổ sung unit test trong `src/hooks/__tests__/useCloudRoomSync.test.ts` cho luồng Viewer rời phòng khôi phục đúng phiên offline / phiên trống.

---

### Stage 5: Hàng chờ (Chọn nhiều chuyển sân), Giao lưu tách sân & Fix Modal iOS Safari
- **Files:** `src/components/QueueTab.tsx`, `src/engine/sessionReducer.ts`, `src/engine/useBadmintonSession.ts`, `src/components/SlotSheet.tsx`, `src/engine/nextUp.ts`, `src/engine/validateLineup.ts`, `src/components/ui/Primitives.tsx`, `src/index.css`
- **Yêu cầu:**
  1. **Chọn nhiều → Chuyển sân hàng loạt (`QueueTab.tsx`, `sessionReducer.ts`):**
     - Thêm action `BULK_SET_PREFERRED_COURT` vào `sessionReducer.ts` (hỗ trợ Undo trong 1 bước).
     - Trong thanh nổi `Chọn nhiều` ở `QueueTab.tsx`: bổ sung nút **`Chuyển sân`** cạnh `Tạm nghỉ` và `Xóa` → chọn nhanh `Tất cả`, `Sân 1`, `Sân 2`, `Sân 3` để gán sân 1 lần cho toàn bộ người đang tick (VD: chọn 8 người gán ngay sang `Sân 1`).
  2. **Giao lưu 1 trận giữa các sân ở chế độ `Tách sân` (`SlotSheet.tsx`, `nextUp.ts`, `validateLineup.ts`):**
     - Rà soát lại hành vi `Chung bể` (`SHARED_POOL`) vs `Tách sân` (`SPLIT_COURT`) trong Settings và auto-matchmaker.
     - Trong `SlotSheet.tsx`: khi `courtMode === 'SPLIT_COURT'`, mặc định lọc danh sách theo sân đang chọn (và người `Tất cả`), kèm 1 nút gạt **`Giao lưu (hiện sân khác)`**:
       - Khi bật gạt: hiện thêm người thuộc các sân khác kèm badge sân gốc (VD `Sân 1`).
       - Khi Host chọn người giao lưu vào ô `Sắp vào sân` (hoặc thay người trên sân): đánh dấu slot `MANUAL` (bảo toàn theo Harness Rule 2) và **KHÔNG đổi `preferredCourtId` gốc** của người đó — kết thúc trận giao lưu họ tự quay về hàng chờ sân ban đầu.
  3. **Fix lỗi Modal Cài đặt bị đẩy tít lên góc trên trên iOS Web Mobile (`Primitives.tsx`, `index.css`):**
     - Trong `UiModal` (`src/components/ui/Primitives.tsx`):
       - Thay `max-h-[90vh]` bằng `max-h-[85dvh]` (có fallback `max-h-[85vh]`).
       - Thêm `min-h-0 overscroll-contain` vào container cuộn nội dung (`flex-1 min-h-0 overflow-y-auto overscroll-contain`) để WebKit iOS tính đúng chiều cao flex, không đẩy phần đầu modal ra ngoài viewport.
       - Khóa cuộn `document.body` khi modal đang mở và thêm safe-area inset ở đáy (`pb-[max(1rem,env(safe-area-inset-bottom))]`).

---

### Stage 6: Gọn hóa `PostMatchModal` & Kiểm tra logic tỉ số
- **Files:** `src/components/PostMatchModal.tsx` (+ tách helper `validateBadmintonScore` có unit test)
- **Yêu cầu:**
  1. **Xóa nút `Bỏ qua` trùng thừa:**
     - Gỡ nút `Bỏ qua` ở `headerRight` (dòng 252–261), giữ nút `×` ở góc trên cùng và 2 nút rõ ràng ở footer: `Bỏ qua` + `Lưu kết quả`.
  2. **Kiểm tra logic tỉ số (mức cân bằng):**
     - **Chặn lưu** (hiện lỗi đỏ ngay dưới ô tỉ số, disable hoặc chặn submit) khi:
       - Chỉ nhập điểm 1 đội mà bỏ trống đội kia.
       - Hai đội bằng điểm nhau (VD `21 - 21`, `15 - 15`).
       - Điểm `< 0` hoặc `> 30`.
     - **Cảnh báo nhẹ màu vàng (vẫn cho bấm `Lưu kết quả`)** khi:
       - Tỉ số hợp lệ không hòa nhưng chưa khớp chuẩn kết thúc set 21 BWF (VD đánh set ngắn `15 - 12`, `11 - 8`, hoặc thắng 21 nhưng cách 1 điểm như `21 - 20`).

---

### Stage 7: Nâng cấp Tab AI Nhận xét & "Phong độ tạm trong buổi" cho thuật toán xếp sân
- **Files:** `src/engine/skillAnalyzer.ts`, `src/components/RankAdvisorPanel.tsx`, `src/engine/matchmaker.ts`, `src/components/Header.tsx` (+ unit tests)
- **Yêu cầu:**
  1. **Luôn hiển thị dữ liệu sau khi đánh có tỉ số/nhận xét (`RankAdvisorPanel.tsx` & `skillAnalyzer.ts`):**
     - Khắc phục nguyên nhân đánh 14 trận nhưng tab AI trống (hiện tại `localAnalysis.summaries` đã tính nhưng không render, chỉ render `suggestions` khi vượt ngưỡng gắt `>= 3 trận & winRate >= 75% & diff >= +6`).
     - Render rõ **Bảng tổng hợp phong độ buổi chơi** cho mọi người đã có tỉ số hoặc nhận xét:
       - Số trận có tỉ số, Thắng–Thua, Hiệu số điểm trung bình (`+4.2` / `-3.5`), các tag đã gắn (`Vượt trình`, `Hơi đuối`, `Hay`), ghi chú riêng tư của Host, và **Phong độ tạm** đang cộng/trừ.
     - Giữ phần **Đề xuất điều chỉnh rank cố định** (Host chủ động bấm `Áp dụng` nếu muốn lưu lâu dài) và khu vực **Phân tích Gemini AI** (hiện trạng thái API Key rõ ràng).
  2. **Tích hợp "Phong độ tạm trong buổi" (`sessionFormOffset`) vào `matchmaker.ts`:**
     - Viết pure helper tính `sessionFormOffset` (biên kẹp chặt `[-1.5, +1.5]` điểm kỹ năng nội bộ) từ:
       - Hiệu số điểm các trận đã đấu trong buổi hiện tại.
       - Nhận xét `OVER_RANK` / `UNDER_RANK` của Host (chỉ áp dụng khi Host chạy xếp sân).
     - `matchmaker.ts` dùng `effectiveRank = baseRank + sessionFormOffset` khi cân kèo cho các trận tiếp theo:
       - **Không tự ý đổi rank gốc** của người chơi và tự reset khi bắt đầu buổi mới.
       - **Tôn trọng tuyệt đối** luật `FIXED_PAIR` (cặp vợ chồng/người yêu) và `AVOID`.
       - **Xử lý trường hợp nhóm quá chênh không thể cân hoàn hảo** (VD cặp cố định quá mạnh so với phần còn lại): luôn chọn phương án ít chênh nhất (không bị kẹt xếp sân) và trả về lý do/cảnh báo nhẹ để UI hiển thị cho Host hiểu.
     - Thêm tùy chọn bật/tắt **`Tự cân kèo theo phong độ buổi này`** trong Modal Cài đặt (`Header.tsx`, mặc định **BẬT**).

---

## Kiểm thử & Xác minh cuối cùng
- Sau mỗi Stage: chạy `npm run check:harness` (đảm bảo 100% pass `vitest`, `tsc -b`, `vite build`) rồi `git commit` gọn theo từng Stage.
- Kiểm tra thủ công nhanh trên cả **Desktop** và **iOS Safari Mobile**:
  - Modal Cài đặt không bị đẩy lên góc trên.
  - Xóa trắng ô tiền nhập `300000` không dính `0300000`; `Theo giờ` tự bám số sân đang bật.
  - `Nội dung CK` in hoa tên đứng trước; nút `Tải QR` và đính kèm biên lai hoạt động ổn định.
  - Viewer thấy đủ 4 tab (`Sân`, `Hàng chờ`, `Lịch sử`, `Tính tiền` gọn, không thấy sổ lưu trữ/nợ cũ); rời phòng không lộ data phòng và không thấy tab `Cấu hình Supabase`.
  - Chọn nhiều 8 người → `Chuyển sân` 1 bấm; chế độ `Tách sân` bật `Giao lưu` chọn được người sân khác đánh 1 trận rồi tự về sân gốc.
  - `PostMatchModal` chặn `21 - 21`, chỉ còn 1 nút `Bỏ qua`; tab AI hiện đủ bảng phong độ sau khi nhập tỉ số/nhận xét.
