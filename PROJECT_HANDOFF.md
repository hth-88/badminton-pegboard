# TÀI LIỆU TỔNG QUAN, Ý TƯỞNG & LUỒNG HOẠT ĐỘNG DỰ ÁN XẾP SÂN CẦU LÔNG (BADMINTON PEGBOARD)

> **Mục đích tài liệu**: Đây là tài liệu bàn giao toàn diện (Handoff Document) được trích xuất trực tiếp từ mã nguồn hiện tại của dự án để bất kỳ AI hoặc lập trình viên nào tiếp nhận sau này có thể nắm bắt ngay **ý tưởng sản phẩm, kiến trúc kỹ thuật, toàn bộ luồng nghiệp vụ, các quy chuẩn bất biến (Harness Rules), cũng như các điểm đang mở / hướng phát triển tiếp theo** mà không làm hỏng các tính năng đã ổn định.

---

## 1. Ý TƯỞNG CỐT LÕI & TRIẾT LÝ SẢN PHẨM

### 1.1. Bài toán thực tế giải quyết
Ở các câu lạc bộ / nhóm đánh cầu lông phong trào Việt Nam (thường có 8–24+ người, đánh trên 2–3 sân trong 2–3 giờ), người cầm trịch (**Host**) thường gặp 4 vấn đề lớn:
1. **Xếp lượt mất công bằng & cảm tính**: Người khỏe/quen hay được gọi liên tục, người mới/ít nói bị ngồi chờ lâu, hoặc vừa nghỉ 1 chút lại bị vào đánh dồn.
2. **Chênh trình & lệch cặp**: Nam và Nữ có chênh lệch thể lực/tốc độ nhất định; dễ bị trùng đồng đội hoặc lặp lại đúng 4 người trận trước.
3. **Thao tác vội vàng ngoài sân**: Cần ứng dụng mở nhanh trên điện thoại trong ánh sáng tối của sân cầu lông, không cần đăng nhập tài khoản, vẫn chạy mượt khi rớt mạng Wifi/4G.
4. **Chia tiền cuối buổi rắc rối**: Có người đánh ít trận, người đánh 0 trận, chia tỷ lệ Nam/Nữ hoặc Nam phụ thu thêm, làm tròn tiền lẻ và soạn tin nhắn thu tiền gửi nhóm Zalo.

### 1.2. Giải pháp "Digital Pegboard" (Bảng kẹp cầu lông số hóa)
- **Mobile-first PWA & Offline-first**: Mặc định chạy 100% ở trình duyệt với `localStorage`, Dark Theme dịu mắt, hỗ trợ `Wake Lock API` (giữ màn hình luôn sáng) và rung phản hồi (`navigator.vibrate`).
- **Tôn trọng quyền Host (Host Authority)**: Thuật toán Matchmaker chỉ đóng vai trò *gợi ý*. Mọi vị trí xếp tay đều được khóa nhãn thủ công (`MANUAL`), cho phép cảnh báo mềm thay vì chặn cứng vô lý, hỗ trợ `Undo`/`Redo` nhiều bước.
- **Đồng bộ Realtime không cần Backend riêng**: Khi cần nhiều người cùng xem lượt đánh hoặc nhờ người Host hộ (**Co-Host**), Host có thể mở **Phòng Online** qua Supabase Realtime với phân quyền bằng mã PIN 4 số (`VIEWER` chỉ xem vs `CO_HOST` toàn quyền).

---

## 2. TECH STACK & CẤU TRÚC MÃ NGUỒN

### 2.1. Công nghệ sử dụng (theo `package.json`)
- **Frontend**: React `^19.3.1`, TypeScript `~7.0.2`, Vite `^8.3.5`
- **Styling**: Tailwind CSS `^4.3.4` (`@tailwindcss/vite`), `lucide-react` `^1.67.0`
- **Realtime Sync**: `@supabase/supabase-js` `^2.118.0`
- **Testing & Linting**: Vitest `^5.1.0`, Oxlint `^1.89.0`
- **Deploy**: Vercel (`vercel.json` cấu hình SPA rewrite về `/index.html`, `vite.config.ts` hỗ trợ env prefix `VITE_`, `SUPABASE_`, `NEXT_PUBLIC_SUPABASE_`).

### 2.2. Lệnh kiểm tra bắt buộc (Harness Gate)
- `npm run check:harness`: Chạy `tsc -b && vitest run && vite build`
- `npm run lint`: Chạy `oxlint`
- Trạng thái hiện tại: `21/21` test files, `153/153` unit tests PASS.

### 2.3. Bản đồ thư mục `src/`
| Thư mục / File | Vai trò chính |
| :--- | :--- |
| `src/types/badminton.ts` | Toàn bộ TypeScript interfaces/types của domain (`Player`, `Court`, `NextUpDraft`, `Lineup`, `PairRule`, `MatchHistory`, `SessionSettings`, `BadmintonSessionState`, `DEFAULT_PENALTY_WEIGHTS`). |
| `src/engine/skillConfig.ts` | Thang 12 bậc trình độ phong trào Việt Nam và hàm `getEffectiveSkill`, `stepRankUp`, `stepRankDown`, `compareRanks`. |
| `src/engine/sessionReducer.ts` | Pure state machine `badmintonReducer`, xử lý toàn bộ actions + undo/redo stack + `selectRuleConflicts`. |
| `src/engine/nextUp.ts` | Các hàm thao tác với `NextUpDraft` (`normalizeNextUp`, `slotsToLineup`, `getSlotCandidateStatus`, `evaluateNextUp`, `rotatePairing`, `balancePairing`, `resolveTargetMatchType`, `canSuggestNextUp`). |
| `src/engine/matchmaker.ts` | Thuật toán chấm điểm & gợi ý trận Đôi/Đơn độc lập cho từng sân (`suggestNextUpForCourt`, `generateDoublesProposals`, `generateSinglesProposals`, `calculateDoublesScore`, `calculateSinglesScore`, `sortPlayersByWaitPriority`). |
| `src/engine/validateLineup.ts` | Kiểm tra hợp lệ `validateLineup` (trả về issue `BLOCK` hoặc `WARN`) và chấm chênh lệch trình độ `describeLineup`. |
| `src/engine/statsManager.ts` | Thống kê số lần cùng đội (`partnerCount`), đối đầu (`opponentCount`), trận gần nhất của từng người/từng sân, dựng lại stats từ history (`buildStatsFromHistory`). |
| `src/engine/stateMigration.ts` | `migrateSessionState` chuẩn hóa state từ bản cũ / JSON import / Cloud Snapshot về `CURRENT_SCHEMA_VERSION = 3` (idempotent). |
| `src/engine/storage.ts` | Lưu/tải `localStorage` (`v2`, fallback `v1`), backup dữ liệu hỏng (`badminton_court_session_corrupt_*`), danh sách đã đóng tiền, và sổ lưu trữ tối đa 20 buổi đánh (`Archive`). |
| `src/engine/clubRosterStorage.ts` | Lưu/đọc **Sổ Thành Viên CLB Cố Định** (`badminton_club_roster`, khởi tạo sẵn 9 thành viên mẫu). |
| `src/engine/settlement.ts` | Engine tính tiền cuối buổi (`calculateSettlement`, `generateZaloSettlementMessage`, `ceilToNearest1000`, `formatVND`). |
| `src/engine/useBadmintonSession.ts` | Hook React chính nối `badmintonReducer` với `localStorage` (debounce 300ms + lưu tức thì khi ẩn tab/đóng trang) và export actions/selectors. |
| `src/services/supabaseSync.ts` | Tầng gọi Supabase (`badminton_rooms` table), cấu hình URL/Key qua `.env` hoặc `localStorage`, sinh `clientId` trong `sessionStorage`, tối ưu payload (`serializeForCloud`). |
| `src/hooks/useCloudRoom.ts` | Quản lý vòng đời kết nối phòng Online, phân quyền `OFFLINE`/`VIEWER`/`CO_HOST`, chống vòng lặp sync, chống echo và debounce đẩy dữ liệu. |
| `src/hooks/useTheme.ts` & `useWakeLock.ts` | Quản lý theme (`dark` mặc định / `light` / `system`) và Screen Wake Lock. |
| `src/utils/parsePasteLines.ts` | Parser thuần bóc tách danh sách điểm danh copy từ Zalo / Messenger / Excel. |
| `src/utils/vibrate.ts` | Haptic feedback trên điện thoại. |
| `src/components/Header.tsx` | Thanh tiêu đề trên cùng: trạng thái phòng Online, Undo/Redo, Wake Lock, Ribbon cài đặt nhanh (Chung bể/Tách sân, Tỷ lệ Đôi/Đơn, Auto Singles, Bù Nam), Modal cài đặt theme. |
| `src/components/CourtCard.tsx` | Thẻ điều khiển từng sân: nút `Auto | Đôi | Đơn`, trận đang đánh (`currentMatch`), lượt kế tiếp (`nextUp`), các nút xoay cặp/cân kèo/kết thúc/gợi ý/xóa trắng. |
| `src/components/SlotSheet.tsx` | Bottom sheet chọn/thay người chơi cho cả trận đang đánh và các ô Next Up, hiển thị nhãn chặn `BLOCK` và cảnh báo `WARN`. |
| `src/components/QueueTab.tsx` | Tab Hàng chờ: Sổ thành viên CLB (điểm danh), thêm khách lẻ, dán danh sách Zalo, nạp 16 mẫu, stepper trình độ, toggle Nam/Nữ, tạm nghỉ/rút người, chọn nhiều để thao tác hàng loạt. |
| `src/components/PairRulesTab.tsx` | Tab Luật cặp (`LOCK_PARTNER`, `AVOID_PARTNER`, `AVOID_MATCH`) và hiển thị xung đột luật. |
| `src/components/HistoryTab.tsx` | Tab Lịch sử các trận đã đấu và xóa trận (tự động tính lại số trận & ma trận stats). |
| `src/components/SettlementTab.tsx` & `EquityTable.tsx` | Tab Tính tiền (chi phí, tỷ lệ, giảm giá, tick đã đóng, copy Zalo, xuất/nhập JSON, Archive) và Tab con Thống kê & Ma trận bắt cặp/đối đầu. |
| `src/components/CloudRoomModal.tsx` | Modal tạo phòng, vào phòng, chia sẻ link/QR Co-Host & Viewer, cấu hình Supabase trực tiếp trên điện thoại. |
| `src/components/Toast.tsx` & `ErrorBoundary.tsx` | `UndoToast` (kèm thanh đếm ngược hoàn tác), `InfoToast` (thông báo hệ thống/cảnh báo không có nút Hoàn tác), và màn hình khôi phục khi app gặp lỗi render. |

---

## 3. 5 QUY CHUẨN BẤT BIẾN (HARNESS INVARIANTS)

> Nguồn chuẩn: `CLAUDE.md` và `.agent/rules/badminton-harness-rules.md`. Mọi AI/dev sửa code bắt buộc phải tuân thủ 5 nguyên tắc sau:

1. **Rule 1 — Pure Reducer & State Machine**:
   - `src/engine/sessionReducer.ts` phải thuần túy 100%: **CẤM** gọi `Date.now()`, `Math.random()`, `localStorage`, Supabase hoặc I/O bên trong reducer.
   - Mọi timestamp (`now`) hoặc `id` ngẫu nhiên phải truyền từ ngoài vào qua `action.payload`.
   - Trong memory (`badmintonReducer`), `undoStack` / `redoStack` cắt tối đa 30 phần tử; khi lưu xuống `localStorage` (`saveSessionImmediate`) và `migrateSessionState`, `undoStack` chỉ giữ tối đa **5 bước** và `redoStack` luôn rỗng `[]`.
   - Các action không đưa vào `undoStack`: `LOAD_STATE`, `RESET_SESSION`, `NEW_SESSION_KEEP_PLAYERS`, `SNOOZE_AUTO_SINGLES`, `SNOOZE_AUTO_SINGLES_WAIT`.
2. **Rule 2 — Độc lập 3 sân & Tôn trọng Manual Edit**:
   - `court.nextUp` (`NextUpDraft`) được **lưu trực tiếp trong state**, KHÔNG tính toán lại khi render. Các khái niệm cũ như `planAllCourts`, `courtPlans` đã bị loại bỏ.
   - Action nhắm vào Sân X (`SUGGEST_NEXT_UP`, `SET_NEXT_UP_SLOT`, `CLEAR_NEXT_UP`, `REARRANGE_NEXT_UP`, `TOGGLE_NEXT_UP_TYPE`) **CHỈ được đổi** `courts[X].nextUp` và `courts[X].suggestCursor`, không gây hiệu ứng domino làm nhảy đội hình của Sân khác.
   - Khi Host gán tay 1 ô (`SET_NEXT_UP_SLOT`), ô đó gắn nhãn `'MANUAL'` (`🔒 Tay`) và **3 ô còn lại giữ nguyên 100%** (không gọi matchmaker, không chặn giới tính/trình độ — chỉ cảnh báo mềm).
   - Nút `[✕]` xóa đúng 1 ô về `null`; nút `[🗑️ Xóa trắng]` (`CLEAR_NEXT_UP`) xóa tất cả các ô về `null` và giữ trống, không tự động điền đè.
3. **Rule 3 — Chống vòng lặp Reset dữ liệu Cloud Sync (CRITICAL)**:
   - Effect khởi động kết nối theo URL `?room=...&pin=...` hoặc `localStorage` chỉ được chạy **đúng 1 lần khi mount**, bảo vệ bằng `hasConnectedInitialRef`.
   - **CẤM** đưa `currentState` hoặc các callback tạo mới mỗi render vào dependency array của `joinRoom` / effect kết nối. Toàn bộ callback truyền vào `useCloudRoom` (`onApplyCloudState`, `onShowToast`) phải được bọc trong `useRef` (`onApplyRef`, `onToastRef`).
   - Khi `joinRoom` thành công, xóa sạch `?room=` và `?pin=` khỏi URL bằng `window.history.replaceState` (giữ nguyên các param khác và `#hash`). Link chia sẻ trong `CloudRoomModal` phải dựng từ `roomCode` và `pinCode` trong state.
   - Thông báo kết nối/lỗi/cảnh báo hệ thống dùng `InfoToast` (KHÔNG dùng `UndoToast` để tránh nút "Hoàn tác" giả).
   - *Lưu ý triển khai thực tế của cơ chế chống đè*: Tài liệu `CLAUDE.md` ban đầu ghi "khóa `1500ms` theo `lastLocalActionAt`", nhưng code chính thức trong `src/hooks/useCloudRoom.ts` đã nâng cấp lên bộ 3 cơ chế chính xác hơn: (i) lọc echo `record.updated_by === clientId` & lọc gói cũ `record.updated_at <= lastAppliedTimestampRef.current`, (ii) cờ `hasPendingLocalChangeRef` bật `true` trong suốt lúc debounce/upsert đang chạy để bỏ qua snapshot từ xa tránh đè thao tác vừa bấm, và (iii) hàm `areSessionSnapshotsEqual` để không đẩy ngược snapshot vừa nhận từ Cloud lên lại Supabase.
4. **Rule 4 — Công thức Quyết toán Bất biến**:
   - Trong chế độ chia `GENDER_RATIO`, tỷ lệ `genderRatioMalePercent : genderRatioFemalePercent` (ví dụ `60:40`) là **trọng số mức đóng của 1 cá nhân Nam so với 1 cá nhân Nữ** (`perMaleWeight = genderRatioMalePercent`, `perFemaleWeight = genderRatioFemalePercent`). **TUYỆT ĐỐI CẤM** chia trọng số này cho tổng số Nam hoặc tổng số Nữ.
   - Đơn giá mặc định CLB: Tiền sân `160.000đ/giờ`, Tiền cầu `30.000đ/quả`, Phụ phí `0đ`.
5. **Rule 5 — Pre-commit Harness Gate**:
   - Mọi chỉnh sửa phải pass 100% `npm run check:harness` (`tsc -b && vitest run && vite build`).

---

## 4. MÔ HÌNH DỮ LIỆU & LUỒNG HOẠT ĐỘNG CHI TIẾT

### 4.1. Thang trình độ & Điểm hiệu dụng (`skillConfig.ts`)
Hệ thống dùng thang **12 bậc** chuẩn phong trào Việt Nam, có cộng bù giới tính cho Nam (`settings.maleBonus`, mặc định `+1.5`):
$$\text{effectiveSkill} = \begin{cases} \text{baseScore} + \text{maleBonus} & \text{nếu } \text{sex} = \text{'M'} \\ \text{baseScore} & \text{nếu } \text{sex} = \text{'F'} \end{cases}$$

12 bậc theo thứ tự: `newbie` (1.0), `y-` (2.0), `y` (3.0), `y+` (4.0), `tby-` (5.0), `tby` (6.0), `tby+` (7.0), `tb-` (8.5), `tb` (10.0), `tb+` (11.5), `tb++` (13.0), `tbk` (14.5).
Ví dụ: Nữ `tb` (10.0) ngang Nam `tb-` (8.5 + 1.5 = 10.0).

---

### 4.2. Luồng Quản lý Người chơi & Hàng chờ (`QueueTab.tsx`)
1. **3 nguồn thêm người chơi**:
   - **Điểm danh CLB (`ROSTER`)**: Đọc từ `badminton_club_roster` trong `localStorage` (mặc định có sẵn 9 thành viên). Tự nhận diện người đã có mặt trong buổi theo tên (không phân biệt hoa thường). Ngôi sao ★ trên thẻ người chơi cho phép lưu khách vào Sổ CLB hoặc đồng bộ lại rank; nút `-`/`+` chỉnh rank trên thẻ người chơi tự gọi `syncClubMemberRank`.
   - **Khách lẻ (`SINGLE`)**: Nhập tên, giới tính, rank, `assignedPool` (`ALL` hoặc sân cụ thể), `noSingles` (từ chối đánh đơn).
   - **Dán nhanh Zalo (`PASTE`)**: `parsePasteLines` nhận nhiều kiểu định dạng (`1. Tuấn - Nam - tb`, `Lan (Nữ) | tb-`, `Anh-Tuấn / Trai / tby+`, tự tách số thứ tự đầu dòng), có checkbox `allowDefaults` tự điền `Nam` và `tb-` khi danh sách Zalo chỉ ghi tên. Trùng tên chỉ báo warning chứ không chặn.
   - Khi danh sách buổi trống (`players.length === 0`), hiện thêm nút **`16 mẫu`** nạp `SAMPLE_16_PLAYERS` (8 Nam, 8 Nữ rải đều trình độ) để test nhanh.
2. **Thứ tự ưu tiên Hàng chờ (`sortPlayersByWaitPriority`)**:
   1. `waitStreak` cao nhất (người ngồi chờ nhiều lượt nhất lên đầu).
   2. `effectiveGames = gamesPlayed + virtualGamesOffset` thấp nhất.
   3. `lastPlayedAt` nhỏ nhất (0 = chưa đánh trận nào ưu tiên trước).
   4. `id` tăng dần (đảm bảo tất định / deterministic).
3. **Vào muộn / Tạm nghỉ & Quay lại (`activatePlayerWithOffset`)**:
   - Khi thêm người chơi mới khi các thành viên khác đã đánh, hoặc bấm **Đánh lại** (`RESUME_PLAYER`), hệ thống gán:
     $$\text{virtualGamesOffset} = \max(\text{offset hiện tại},\; \min(\text{effectiveGames của các người ACTIVE khác}) - \text{gamesPlayed},\; 0)$$
   - Nhờ đó người mới đến muộn không bị `gamesPlayed = 0` kéo đánh liên tục mọi lượt, vẫn hòa nhập mượt với mặt bằng chung.
   - `PAUSE_PLAYER` / `PAUSE_PLAYERS`: chuyển `status -> 'PAUSED'`, reset `waitStreak = 0`, dọn khỏi `nextUp.slots` và `readyQueue` (bỏ qua nếu đang đánh trong `currentMatch`).
   - `REMOVE_PLAYER` / `REMOVE_PLAYERS`: xóa khỏi `players`, dọn khỏi `nextUp.slots`, `readyQueue`, `pairRules` (chỉ chặn nếu đang trực tiếp ở trong `currentMatch`). Sổ CLB vẫn giữ nguyên thông tin cho buổi sau.
4. **Thao tác hàng loạt (`☑️ Chọn nhiều`)**:
   - Hiện checkbox ở cả danh sách **SẴN SÀNG (`ACTIVE`)** và **TẠM NGHỈ (`PAUSED`)**.
   - Thanh **Floating Action Bar** ở cuối màn hình cho phép: `Chọn tất cả / Bỏ chọn`, `⏸ Tạm nghỉ (N)` (`PAUSE_PLAYERS`), `🗑️ Xóa (N)` (`REMOVE_PLAYERS`) — tất cả gói gọn trong **đúng 1 snapshot Undo**.

---

### 4.3. Luồng Điều khiển Sân, Next Up & Trận đấu (`CourtCard.tsx`, `sessionReducer.ts`, `nextUp.ts`)
Mặc định khởi tạo **3 sân** (`court-1`, `court-2` bật; `court-3` tắt `isActive: false`).

1. **Chế độ Sân & Loại trận (`resolveTargetMatchType`)**:
   - Header mỗi sân có cụm 3 nút **`Auto | Đôi | Đơn`** (`court.forcedType`: `null` | `'DOUBLES'` | `'SINGLES'`).
   - Ngay tiêu đề Next Up có nút toggle nhanh **`[Đôi (4 ô) ⇄]` / `[Đơn (2 ô) ⇄]`** (`TOGGLE_NEXT_UP_TYPE`) giúp đổi cấu trúc 2 ô ↔ 4 ô mà vẫn bảo toàn tối đa người đã xếp ở slot 0 và slot 2/1.
   - Thứ tự ưu tiên xác định loại trận khi bấm Gợi ý kèo:
     1. `court.forcedType` hoặc `court.policy` (`SINGLES_ONLY` / `DOUBLES_ONLY`).
     2. `settings.matchMix.singles === 1` (100% Đơn trên Header) $\rightarrow$ luôn `'SINGLES'` (chỉ cần $\ge 2$ người).
     3. `court.nextUp.type === 'SINGLES'` $\rightarrow$ `'SINGLES'`.
     4. `settings.matchMix.doubles === 1` $\rightarrow$ `'DOUBLES'`, ngoại trừ khi sân đang trống (`!court.currentMatch`), thiếu người (`2 <= availableCount < 4`), `autoSingles` là `'AUTO'` hoặc `'ASK'` và chưa bị snooze $\rightarrow$ `'SINGLES'`.
     5. Chế độ pha trộn (70/30, 50/50): xét `mixDebt.singles > mixDebt.doubles && availableCount >= 2` $\rightarrow$ `'SINGLES'`.
     6. Fallback thiếu người khi sân trống & `autoSingles` cho phép $\rightarrow$ `'SINGLES'`.

2. **Luồng Gợi ý & Chỉnh sửa Next Up**:
   - Thuật toán `suggestNextUpForCourt(state, courtId, now)` chỉ được kích hoạt ở **3 nơi** trong Reducer:
     1. Host bấm **"Gợi ý kèo" / "Gợi ý lại"** (`SUGGEST_NEXT_UP`).
     2. Sân vừa được bật `isActive: false -> true` (`UPDATE_COURT`).
     3. Sân vừa bắt đầu trận (`applyStartMatch`) — tự gợi ý sẵn lượt kế tiếp tiếp theo cho *đúng sân đó*.
   - **Quy tắc mềm khi thiếu người ở Next Up (Hạng mục 2)**:
     - Pool chính (`primaryAvailable`): người `ACTIVE`, không ở `currentMatch` bất kỳ sân nào, không ở `nextUp` sân khác (lọc theo `assignedPool` nếu `courtMode === 'SPLIT_COURT'`).
     - Nếu `primaryAvailable` chưa đủ và sân đang có `currentMatch`: gọi `buildProjectedEnvironment` giả lập kết thúc trận đang đánh trên chính sân đó (cộng +1 trận, cập nhật stats tạm) để tính thêm người sắp ra sân.
     - Nếu vẫn chưa đủ: bổ sung từ `secondaryAvailable` (người rảnh đang nằm ở `nextUp` sân khác).
     - Trong `SlotSheet` (`getSlotCandidateStatus`): chỉ **BLOCK** khi (a) không tồn tại/`PAUSED`, (b) đang đánh trong `currentMatch` sân khác, hoặc (c) đã nằm ở ô khác trong *chính Next Up này*. Nếu người đó đang ở `nextUp` sân khác thì vẫn **cho phép chọn (`selectable: true`)** và gắn cảnh báo vàng nhẹ `Đang dự kiến ở Sân X`.
   - **Đánh giá & Sắp xếp 4 người ở Next Up**:
     - `Đảo cặp` (`ROTATE`): Xoay vòng 3 thế chia cặp cho đúng 4 người hiện có (`[A,B] vs [C,D]` $\rightarrow$ `[A,C] vs [B,D]` $\rightarrow$ `[A,D] vs [B,C]`).
     - `Cân kèo` (`BALANCE`): Chọn thế có `|team1Skill - team2Skill|` nhỏ nhất trong 3 thế.
     - Khi đủ 4 ô (Đôi), `evaluateNextUp` hiển thị dòng đánh giá: `Chênh Xđ • Pattern giới tính` + cảnh báo nếu chênh > 2.5đ hoặc 3 Nam–1 Nữ / 1 Nam–3 Nữ.

3. **Luồng Vào sân & Kết thúc trận (`START_MATCH`, `END_MATCH`, `END_AND_START`)**:
   - **Khóa cứng khi trùng người đang đánh ở sân khác**:
     - Trên UI `CourtCard.tsx`: ô nào trong Next Up chứa người đang thi đấu ở `currentMatch` sân khác sẽ có viền đỏ + badge nhấp nháy `Đang đánh ở Sân X`; nút **`BẮT ĐẦU TRẬN LƯỢT NÀY >`** bị `disabled`; hiện cảnh báo đỏ *"Không thể bắt đầu: [Tên] đang đánh ở Sân X. Hãy chờ trận xong hoặc đổi người khác"*.
     - Trong Reducer `applyStartMatch`: Kiểm tra chặn cứng nếu có thành viên `PAUSED`, có người đang đánh sân khác, hoặc `validateLineup` có issue `BLOCK`.
   - **Khi `applyStartMatch` thành công**:
     - Đưa `lineup` vào `court.currentMatch` với `startedAt: now`.
     - Người vào sân được reset `waitStreak = 0`; các người `ACTIVE` đang chờ (không đánh ở sân khác, đúng pool nếu `SPLIT_COURT`) được cộng `waitStreak + 1`.
     - Tự động **dọn người vừa vào sân khỏi `nextUp` của các sân khác** (biến slot tương ứng về `null`) và lọc `readyQueue`.
     - Cập nhật `mixDebt` nếu không phải kèo ép hoàn toàn tay (`!isManual && !isForced`).
     - Gọi `suggestNextUpForCourt` 1 lần cho chính sân đó.
   - **Trong lúc đang đánh (`currentMatch`)**:
     - Đếm phút thực tế, cảnh báo quá giờ (`isOvertime` $\ge 20$ phút).
     - Chạm vào người chơi trên sân để đổi người trực tiếp (`SWAP_PLAYERS` target `'CURRENT'`), cho phép kích hoạt lại người `PAUSED` nếu Host xác nhận.
     - Nút `Đảo cặp` / `Cân kèo` áp dụng ngay lên `currentMatch`.
   - **Kết thúc trận**:
     - **`⏹ Chỉ kết thúc`** (`END_MATCH`, chống bấm đúp 600ms): cộng `gamesPlayed + 1` (+1 `singlesCount` nếu Đơn), cập nhật `lastPlayedAt`, ghi vào `history`, cập nhật `stats` (`recordCompletedMatch`), xóa `currentMatch -> null`, giữ nguyên `nextUp` đang xếp (hoặc đẩy từ `readyQueue` nếu có trong `SHARED_POOL`).
     - **`KẾT THÚC & VÀO LƯỢT MỚI >`** (`END_AND_START`): chạy `applyEndMatch` rồi `applyStartMatch` trong **cùng 1 snapshot Undo**. Nếu Next Up đang bị vướng người đánh sân khác hoặc có issue `BLOCK`, UI báo warning toast và chỉ thực hiện `END_MATCH` để kết thúc trận cũ.

---

### 4.4. Thuật toán Ghép Trận (`matchmaker.ts`)
- **Đôi (`generateDoublesProposals`)**:
  - Lấy tối đa 8 người rảnh có độ ưu tiên cao nhất theo `sortPlayersByWaitPriority` (kéo thêm partner của `LOCK_PARTNER` vào tập ứng viên nếu cả hai đều rảnh).
  - Nếu 1 cặp vừa có luật `LOCK_PARTNER` vừa có `AVOID_PARTNER`: `AVOID_PARTNER` thắng, bỏ `LOCK_PARTNER`.
  - Xét tất cả tổ hợp $C(n, 4)$ $\times$ 3 cách chia cặp theo **3 Stage nới lỏng có kiểm soát**:
    - Stage 0: Tuân thủ đầy đủ `LOCK_PARTNER` và `AVOID_PARTNER`.
    - Stage 1 (nếu Stage 0 không có phương án): Bỏ qua `LOCK_PARTNER`, vẫn giữ `AVOID_PARTNER`.
    - Stage 2 (nếu Stage 1 vẫn rỗng): Bỏ qua cả `AVOID_PARTNER`.
  - **Các thành phần điểm phạt (`DEFAULT_PENALTY_WEIGHTS` trong `src/types/badminton.ts`)**:
    - `gamesGapPenalty` (`6000`): phạt nặng nếu bỏ lại người có `effectiveGames` thấp hơn người được chọn.
    - `exactPairPenalty` (`5000`): phạt khi vừa đứng cặp cùng nhau ở trận gần nhất (`isRecentPartner`) hoặc lặp lại y nguyên 2 cặp trận trước.
    - `waitStreakMultiplier` (`1200`): phạt nếu bỏ lại người có `waitStreak` cao hơn `minChosenWait`.
    - `exactQuartetPenalty` (`600`): phạt lặp đúng nhóm 4 người trận trước.
    - `gender2M2FUnbalancedPenalty` (`250`) / `gender2M2FMixedBonus` (`50`): khi có 2 Nam 2 Nữ và bật `preferMixedDoubles`, ưu tiên Nam–Nữ vs Nam–Nữ hơn 2 Nam vs 2 Nữ.
    - `avoidMatchPenalty` (`200`): phạt nếu cặp có luật `AVOID_MATCH` vào chung sân.
    - `partnerRepeatBase` (`150`): số lần đã từng làm đồng đội $\times 150$.
    - `skillBalanceMultiplier` (`65`): $(\text{skillDiff})^2 \times 65$.
    - `opponentRepeatMultiplier` (`35`): tổng số lần đối đầu của 4 cặp chéo $\times 35$.
    - `oddGenderSplitPenalty` (`20`): trận 3 Nam–1 Nữ hoặc 1 Nam–3 Nữ.
  - Giữ top 15 đề xuất tốt nhất, dùng `court.suggestCursor` để xoay vòng mỗi lần Host bấm **"Gợi ý lại"**.
- **Đơn (`generateSinglesProposals`)**:
  - Lọc bỏ người có `noSingles === true`.
  - Lấy top 6 người ưu tiên cao nhất, xét cặp $(i, j)$ theo `singlesRecentOpponentPenalty` (1500), `singlesCountExcessMultiplier` (200), `singlesOpponentRepeatMultiplier` (100), `singlesSkillBalanceMultiplier` (40 * `skillDiff^2`), `waitStreakMultiplier` (1200), `gamesGapPenalty` (6000), `avoidMatchPenalty` (200). Dùng `pseudoHash` tất định (không `Math.random()`).

---

### 4.5. Luật Cặp, Lịch Sử & Thống Kê Công Bằng
- **Luật cặp (`PairRulesTab.tsx`)**: Hỗ trợ `LOCK_PARTNER` (cùng đội), `AVOID_PARTNER` (cấm cùng đội), `AVOID_MATCH` (hạn chế vào chung sân). `selectRuleConflicts` tự phát hiện xung đột LOCK + AVOID trên cùng cặp và gắn badge đỏ trên `BottomNav`.
- **Lịch sử (`HistoryTab.tsx`)**: Ghi nhận thời gian bắt đầu, kết thúc, số phút, đội hình. Xóa trận (`DELETE_HISTORY_MATCH`) tự động trừ lại `gamesPlayed`/`singlesCount` và gọi `buildStatsFromHistory` dựng lại `MatchmakingStats`.
- **Thống kê & Ma trận (`EquityTable.tsx`)**: Xem Max/Min/Gap/Avg trận, cột `Thực tế`, `Bù ảo`, `Hiệu dụng`, số trận Đôi/Đơn, và chọn từng người để xem ma trận số lần đã bắt cặp / đã đối đầu với từng thành viên khác.

---

### 4.6. Quyết toán Tiền & Quản lý Buổi Đánh (`settlement.ts`, `SettlementTab.tsx`)
1. **Chi phí đầu vào**:
   - Tiền sân: Theo giờ (`courtHourlyRate * courtHours`, mặc định `160.000đ * 2`) hoặc trọn gói (`DIRECT`).
   - Tiền cầu: Theo quả (`shuttleCount * shuttlePrice`, mặc định `6 * 30.000đ`), theo ống (`BY_TUBE`), hoặc trọn gói (`DIRECT`).
   - Chi phí khác: Mặc định `0đ`. Có nút 1 chạm *"Đặt lại giá chuẩn CLB"*.
2. **Chế độ chia tiền (`SplitMode`)**:
   - `EQUAL`: Chia đều.
   - `GENDER_RATIO`: Trọng số trên **từng cá nhân** (`perMaleWeight = genderRatioMalePercent`, `perFemaleWeight = genderRatioFemalePercent`, mặc định `60:40`, slider 30–80%, preset 55/45, 60/40, 65/35, 70/30). Nếu toàn Nam hoặc toàn Nữ tự fallback về `EQUAL`.
   - `MALE_EXTRA`: Nam đóng hơn Nữ `X` đồng; nếu `malePaying * X > totalCost` tự giới hạn lại và gắn `warning`.
3. **Giảm giá & Chính sách 0 trận**:
   - `zeroGamesPolicy`: `'FREE'` (0đ) hoặc `'FULL'` (chia đủ).
   - `discountUnderPlayed`: người đánh $\le$ ngưỡng (1/2/3 trận) được giảm theo `PROPORTIONAL` (tối thiểu 20% theo tỉ lệ với `avgFullGames`), `PERCENT_50`, hoặc `FREE`. Phần hụt được chia đều cho nhóm người đánh đủ trận; nếu *không có ai* đánh đủ trận để bù thì tự động hủy giảm giá để không thu thiếu.
   - Làm tròn lên `1.000đ` gần nhất (`ceilToNearest1000`); tính số dư dôi (`surplus`) vào quỹ cầu.
4. **Tiện ích thực chiến**:
   - Checkbox **"Đã đóng"** bền vững trong `badminton_paid_players`.
   - Nhập thông tin ngân hàng + sinh **Tin nhắn Zalo** hoàn chỉnh (có tùy chọn ẩn người 0đ) + Copy 1 chạm.
   - **Sổ lưu trữ (Archive)**: Lưu tối đa 20 buổi (`badminton_archived_sessions`) kèm khôi phục (`Mở lại`), tải JSON, xóa 2 bước. Bấm **`Buổi mới (Giữ người chơi)`** sẽ tự archive buổi hiện tại (nếu có $\ge 1$ trận) và reset chỉ số trận/lịch sử/stats về 0.
   - **Backup & Restore**: Xuất/Nhập JSON (`validateAndMigrateImport` tự lưu backup khẩn cấp vào `badminton_court_session_before_import` trước khi ghi đè).

---

### 4.7. Phòng Online Đồng Bộ Realtime (`useCloudRoom.ts`, `supabaseSync.ts`, `CloudRoomModal.tsx`)
1. **Cấu trúc bảng Supabase (`badminton_rooms`)**:
   - `room_code` (PK), `pin_code`, `session_data` (`jsonb`), `settlement_data` (`jsonb`), `updated_at` (`bigint`), `updated_by` (`text`).
   - Hỗ trợ đọc Supabase URL & Anon Key từ `.env` hoặc nhập trực tiếp trên UI Modal (`badminton_supabase_config` trong `localStorage`).
2. **Luồng Role & Bảo vệ**:
   - **`OFFLINE`**: Hoạt động máy đơn với `localStorage`.
   - **`VIEWER`**: Vào phòng bằng link `?room=SAN-49` hoặc nhập mã phòng không có PIN. Mọi nút thao tác đi qua `guardAction(...)` sẽ bật modal nhập PIN; nhập đúng PIN tự nâng cấp lên `CO_HOST` và thực thi ngay thao tác vừa bị hoãn (`pendingActionRef`).
   - **`CO_HOST`**: Tạo phòng mới hoặc vào kèm PIN (`?room=SAN-49&pin=1234`). Mọi thay đổi state cục bộ được debounce **250ms**, nén nhẹ (`serializeForCloud` bỏ `undoStack`/`redoStack`), rồi `upsertRoom` lên Supabase.
3. **Chống lỗi đồng bộ**:
   - Callback bọc `useRef` + `hasConnectedInitialRef` tránh loop kết nối.
   - Xóa `?room` & `?pin` khỏi URL sau khi join thành công; lưu room vào `localStorage` (`badminton_cloud_room`) để F5 tự vào lại phòng.
   - Anti-echo (`updated_by === clientId`), lọc gói cũ (`updated_at <= lastAppliedTimestampRef`), chặn snapshot từ xa khi local đang có thay đổi chờ đẩy (`hasPendingLocalChangeRef`), và `areSessionSnapshotsEqual` để không gửi ngược dữ liệu vừa tải về.

---

## 5. CÁC ĐIỂM ĐANG MỞ, NỢ KỸ THUẬT & Ý TƯỞNG PHÁT TRIỂN TIẾP (VERIFIED FROM CODE)

Các AI tiếp quản dự án nên lưu ý những điểm thực tế đang tồn tại trong mã nguồn hiện tại:

1. **Bổ sung so sánh còn thiếu trong `areSessionSnapshotsEqual` (`src/hooks/useCloudRoom.ts`)**:
   - Hàm `areSessionSnapshotsEqual` (dòng 25–109) hiện kiểm tra `pA.id`, `name`, `status`, `rank`, `gamesPlayed`, `waitStreak`, `assignedPool`, `noSingles` nhưng **đang thiếu kiểm tra `pA.sex !== pB.sex`** (và `history` / `pairRules` mới chỉ so `.length`). Nếu Co-Host chỉ bấm đổi giới tính `Nam <-> Nữ` của 1 người trên `QueueTab`, hook đồng bộ có thể tưởng state không đổi và bỏ qua bước đẩy lên Supabase.
2. **Đồng bộ quy tắc Rule 3 trong `CLAUDE.md` & `.agent/rules/badminton-harness-rules.md`**:
   - File rule hiện vẫn ghi mô tả cũ "khóa 1500ms `lastLocalActionAt`", trong khi `useCloudRoom.ts` (từ commit `9c913b6`) đã chuyển sang cơ chế `hasPendingLocalChangeRef` + `areSessionSnapshotsEqual` + `updated_by`/`updated_at`. Khi cập nhật tài liệu rule (nếu được yêu cầu), cần đồng nhất lại để tránh AI mới đi thêm lại code 1500ms thừa.
3. **Tương tác giữa `migrateSessionState` và "Mượn người ở Next Up sân khác"**:
   - `src/engine/stateMigration.ts` (dòng 199–203) vẫn giữ vòng lọc `seenNextUpPlayerIds` để xóa bỏ người chơi bị trùng trong Next Up của nhiều sân khi `LOAD_STATE` / migrate chạy. Trong khi đó `suggestNextUpForCourt` và `getSlotCandidateStatus` cho phép mượn người giữa các Next Up kèm cảnh báo vàng khi thiếu người. Khi có Cloud Sync (`LOAD_STATE`), người trùng ở Next Up sân thứ 2 sẽ bị xóa tự động qua `migrateSessionState`. Cần quyết định giữ hành vi vệ sinh này khi sync hay nới lỏng tương ứng.
4. **Tính năng đã có khung trong Engine/Reducer nhưng chưa có UI**:
   - **Hàng chờ nhiều kèo sẵn (`readyQueue`)**: `sessionReducer.ts` và `useBadmintonSession.ts` đã hỗ trợ `ENQUEUE_READY_QUEUE`, `DEQUEUE_READY_QUEUE`, `REORDER_READY_QUEUE` và tự thăng cấp trong `applyEndMatch`, nhưng hiện tại chưa có giao diện quản lý `readyQueue`.
   - **Chế độ Hỏi trước khi tự gợi ý Đơn (`autoSingles === 'ASK'`)**: `CourtCard.tsx` đang nhận prop `onSnoozeAutoSingles: _onSnoozeAutoSingles` nhưng chưa render banner/popup hỏi Host khi thiếu 4 người (hiện `resolveTargetMatchType` xử lý `'ASK'` giống `'AUTO'` cho tới khi bị snooze).
   - **Thêm/bớt số sân (> 3 sân) & sửa `Court.policy`**: `sessionReducer.ts` đã có `ADD_COURT` và `REMOVE_COURT`, nhưng `useBadmintonSession.ts` và giao diện chưa có nút thêm/xóa sân hoặc chỉnh `policy`.
   - **Đồng bộ bảng Tính tiền lên Supabase**: Schema SQL (`SUPABASE_SETUP.md`) và `BadmintonRoomRecord` (`supabaseSync.ts`) có sẵn cột `settlement_data`, nhưng `useCloudRoom.ts` & `SettlementTab.tsx` hiện mới lưu cài đặt tính tiền & checkbox đã đóng tiền ở `localStorage` cục bộ (`badminton_settlement_settings`, `badminton_paid_players`).
5. **Các điểm tinh chỉnh UX nhỏ phát hiện trong UI**:
   - Trong `src/components/QueueTab.tsx` (dòng 1270–1274), modal chọn trình độ nhanh (`pickerPlayer`) gọi thẳng `onEditRank` thay vì `handleEditRankAndSync`, nên chưa tự đồng bộ trình độ vừa chọn ngược lại Sổ CLB như nút `-`/`+`.
   - Trong `src/components/QueueTab.tsx` (dòng 570), dropdown `assignedPool` đang để `hidden md:block`, khiến trên điện thoại khó đổi pool sân của người đã thêm khi bật chế độ `SPLIT_COURT` ("Tách sân").
   - Cảnh báo chi tiết trong `SlotSheet.tsx` (`getSlotCandidateStatus`) và `evaluateNextUp` (`src/engine/nextUp.ts`) mới phân tích lệch điểm/lặp cặp cho trận `DOUBLES` (4 ô); có thể mở rộng thêm hiển thị chênh điểm cho trận `SINGLES` (2 ô).
   - Trong `SettlementTab.tsx`: có thể tích hợp sinh **QR VietQR** tự động cho từng người dựa trên số tài khoản ngân hàng + số tiền từng người phải đóng.
