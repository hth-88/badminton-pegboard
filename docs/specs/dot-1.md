# SPEC ĐỢT 1 — VÁ LỖI LÕI (A2, A3, A10, A11, A7, A1, A4)

> **Đối tượng đọc**:
> - **Chủ dự án (không biết lập trình)**: Đọc phần **GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE** và **CÁCH TỰ THỬ BẰNG TAY** của từng mục để duyệt trước khi giao làm và tự kiểm tra sau khi làm xong.
> - **Model thực thi (coding agent)**: Làm **chính xác từng chữ** theo thứ tự bên dưới. Không tự ý refactor, không mở rộng phạm vi sang các mục ngoài Đợt 1. Chạy `npm run check:harness` sau mỗi mục (và sau mục cuối).

---

## Thứ tự thực hiện (dễ trước, gom theo file sửa chung)

| Thứ tự | ID | Trạng thái | File sửa chính | Nhóm sửa chung file |
| :---: | :---: | :---: | :--- | :--- |
| 1 | **A2** | XÁC NHẬN | `src/engine/settlement.ts` | Nhóm 1 (`settlement.ts`): **A2 → A3** |
| 2 | **A3** | XÁC NHẬN | `src/engine/settlement.ts` | Nhóm 1 (`settlement.ts`): **A2 → A3** |
| 3 | **A10** | XÁC NHẬN | `src/engine/sessionReducer.ts` | Nhóm 2 (`sessionReducer.ts`): **A10 → A11 → A7** |
| 4 | **A11** | XÁC NHẬN | `src/engine/sessionReducer.ts`, `src/engine/matchmaker.ts`, `src/engine/useBadmintonSession.ts` (+ 4 file test có sẵn) | Nhóm 2 (`sessionReducer.ts`): **A10 → A11 → A7** |
| 5 | **A7** | XÁC NHẬN | `src/engine/sessionReducer.ts` | Nhóm 2 (`sessionReducer.ts`): **A10 → A11 → A7** |
| 6 | **A1** | XÁC NHẬN | `src/hooks/useCloudRoom.ts` | Nhóm 3 (`useCloudRoom.ts`): **A1 → A4** |
| 7 | **A4** | XÁC NHẬN | `src/hooks/useCloudRoom.ts` | Nhóm 3 (`useCloudRoom.ts`): **A1 → A4** |

> **Lưu ý quan trọng về thứ tự sửa chung file**:
> - **Nhóm 1 (`src/engine/settlement.ts`)**: Làm **A2 trước, A3 sau**. A2 chỉ thay đúng 1 dòng tại dòng 317 nên không làm lệch số dòng của A3 (dòng 111–114 và dòng 296).
> - **Nhóm 2 (`src/engine/sessionReducer.ts`)**: Làm **A10 → A11 → A7**. Làm **A11 trước A7** để chữ ký `UPDATE_COURT` có `now: number` hoàn chỉnh trước khi viết test cho A7 (tránh phải quay lại sửa test của A7). Sau khi thêm dòng ở A10 và A11, số dòng bên dưới trong `sessionReducer.ts` sẽ dịch nhẹ — luôn đối chiếu theo **tên `case` và đoạn `Code trước`**.
> - **Nhóm 3 (`src/hooks/useCloudRoom.ts`)**: Làm **A1 trước, A4 sau**. A1 chỉ sửa vùng dưới dòng 300 (effect #4 và `leaveRoom`) nên giữ nguyên hoàn toàn số dòng của `areSessionSnapshotsEqual` (dòng 25–109) cho A4.

---

## 1. Mục A2 — Sai tiền người 0 trận ở chế độ `Đóng đủ như mọi người` (`zeroGamesPolicy = 'FULL'`)

**Kiểm chứng**: **XÁC NHẬN** (đúng tại `src/engine/settlement.ts` dòng 199–205 và dòng 317).

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Khi Host chọn chính sách **Người chơi 0 trận: Đóng đủ như mọi người** (ví dụ thành viên đã đăng ký kèo sân nhưng không đánh trận nào vẫn phải chia đều tiền sân), app lại áp dụng nhầm luật "giảm giá cho người đánh ít trận (≤ 2 trận)" lên người 0 trận đó, khiến họ bị giảm 80% / 50% hoặc miễn phí và đổ phần tiền thiếu sang các thành viên khác. Sau khi sửa, người đánh 0 trận ở chế độ "Đóng đủ" sẽ đóng đúng 100% suất của mình, chỉ những người đánh từ 1 trận đến ngưỡng giảm (1–2 trận) mới được xét giảm giá.
**Ví dụ số cụ thể**: Buổi có 4 người (An, Bình, Cường đánh 4 trận; Dũng đánh 0 trận), tổng tiền sân + cầu là **200.000đ**, chia đều, bật "Giảm giá người chơi ít trận" (theo tỉ lệ số trận, ngưỡng ≤ 2 trận) và chọn "Người chơi 0 trận: Đóng đủ như mọi người".
- **Trước khi sửa**: Dũng (0 trận) bị giảm xuống còn **10.000đ** (chỉ đóng 20%), còn An, Bình, Cường mỗi người bị gánh thêm thành **64.000đ** (tổng thu 202.000đ).
- **Sau khi sửa**: Cả 4 người An, Bình, Cường, Dũng đều đóng đủ **50.000đ/người** (tổng thu đúng 200.000đ, dư 0đ).

### File + tên hàm cần sửa
- `src/engine/settlement.ts` — hàm `calculateSettlement` (dòng 317).
- *(Đã grep `zeroGamesPolicy` toàn dự án: chỉ dùng ở `settlement.ts:200` và `SettlementTab.tsx:701-703`, không có file nào khác phải sửa theo.)*

### Code trước / code sau

File `src/engine/settlement.ts` (trong hàm `calculateSettlement`, dòng 315–319):

**Code trước:**
```ts
  for (const p of payingPlayers) {
    const share = initialShares[p.id];
    const isUnderPlayed = settings.discountUnderPlayed && p.gamesPlayed <= threshold;

    if (isUnderPlayed) {
```

**Code sau:**
```ts
  for (const p of payingPlayers) {
    const share = initialShares[p.id];
    const isUnderPlayed =
      settings.discountUnderPlayed && p.gamesPlayed > 0 && p.gamesPlayed <= threshold;

    if (isUnderPlayed) {
```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/settlement.test.ts` (thêm vào cuối `describe('PHA 2 – THUẬT TOÁN TÍNH TIỀN SÂN (SETTLEMENT ENGINE)', ...)`)
- **Tên test**:
  1. `15. Mục A2: zeroGamesPolicy = FULL không bị giảm giá bởi discountUnderPlayed (PROPORTIONAL, PERCENT_50, FREE)`
  2. `16. Mục A2: zeroGamesPolicy = FULL vẫn giảm giá bình thường cho người đánh 1..threshold trận và chia bù cho cả người 0 trận`
- **Input cụ thể & kết quả mong đợi**:
  - **Test 15**:
    - `players`: `makePlayer('p1', 'An', 'M', 4)`, `makePlayer('p2', 'Bình', 'M', 4)`, `makePlayer('p3', 'Cường', 'M', 4)`, `makePlayer('pZero', 'Dũng', 'M', 0)`.
    - Chạy vòng lặp với 3 kiểu `underPlayedDiscountType`: `'PROPORTIONAL'`, `'PERCENT_50'`, `'FREE'`, cùng cấu hình `courtCostMode: 'DIRECT'`, `courtCostDirect: 200000`, `shuttleCostMode: 'DIRECT'`, `shuttleCostDirect: 0`, `extraCost: 0`, `splitMode: 'EQUAL'`, `discountUnderPlayed: true`, `underPlayedThreshold: 2`, `zeroGamesPolicy: 'FULL'`.
    - **Kết quả mong đợi** (cho cả 3 kiểu giảm):
      - `pZero.isDiscounted === false`
      - `pZero.roundedAmount === 50000`
      - `p1`, `p2`, `p3` đều có `roundedAmount === 50000`
      - `res.totalCollected === 200000`, `res.surplus === 0`
  - **Test 16**:
    - `players`: `makePlayer('p1', 'An', 'M', 4)`, `makePlayer('p2', 'Bình', 'M', 4)`, `makePlayer('pOne', 'Hùng', 'M', 1)`, `makePlayer('pZero', 'Dũng', 'M', 0)`.
    - `settings`: giống trên nhưng `underPlayedDiscountType: 'PERCENT_50'`, `zeroGamesPolicy: 'FULL'`.
    - **Kết quả mong đợi**:
      - `pOne.isDiscounted === true`, `pOne.roundedAmount === 25000`
      - `pZero.isDiscounted === false`, `pZero.roundedAmount === 59000`
      - `p1.roundedAmount === 59000`, `p2.roundedAmount === 59000`
      - `res.totalCollected === 202000`, `res.surplus === 2000`

### KHÔNG được đụng vào
- Không sửa điều kiện phân loại `freePlayers` ở dòng 199–205 (`zeroGamesPolicy === 'FREE'`).
- Không sửa công thức `GENDER_RATIO` (dòng 248–256), `MALE_EXTRA` (dòng 259–285), `DEFAULT_SETTLEMENT_SETTINGS` (dòng 49–80).
- Không sửa giao diện `src/components/SettlementTab.tsx`.

### Rule nào trong CLAUDE.md liên quan, và vì sao spec không vi phạm
- **Rule 4 (Công Thức Quyết Toán Bất Biến)** và **Rule 5 (Pre-Commit Harness Gate)**: Spec giữ nguyên 100% công thức `perMaleWeight / perFemaleWeight` cá nhân và giữ nguyên giá mặc định (`160.000đ/giờ`, `30.000đ/quả`, phụ phí `0đ`), chỉ sửa điều kiện áp dụng giảm giá cho người đánh `> 0` trận để không ghi đè chính sách `zeroGamesPolicy = 'FULL'`.

### CÁCH TỰ THỬ BẰNG TAY trên app
1. Mở tab **Hàng chờ**, tạo hoặc giữ 4 người chơi (ví dụ An, Bình, Cường, Dũng).
2. Vào tab **Sân đấu**, cho 3–4 người đánh sao cho An, Bình, Cường mỗi người có ít nhất **3–4 trận**, còn Dũng vẫn **0 trận** (chưa đánh trận nào).
3. Chuyển sang tab **Tính tiền**:
   - Ở mục **1. Chi phí buổi chơi**: chọn nhập trực tiếp tiền sân `200.000đ`, tiền cầu `0đ`, chi phí khác `0đ`.
   - Ở mục **2. Chế độ phân chia & Giảm giá**: chọn **Chia đều**, giữ bật công tắc **Giảm giá người chơi ít trận** (chọn "Từ 2 trận trở xuống", "Theo tỉ lệ số trận"), và ở dòng **Người chơi 0 trận (hoặc tạm nghỉ suốt buổi)** chọn **Đóng đủ như mọi người**.
4. Nhìn xuống mục **3. Bảng thu tiền từng người**:
   - **Kết quả đúng**: Dũng (0 trận) hiện đúng **50.000đ** (không có nhãn giảm giá), An, Bình, Cường mỗi người cũng hiện đúng **50.000đ**, tổng thu **200.000đ**.

### Commit message đề xuất
```text
fix(settlement): do not apply under-played discount to 0-game players under FULL policy (A2)
```

---

## 2. Mục A3 — Đội tiền +1.000đ do sai số dấu phẩy động IEEE-754 khi làm tròn

**Kiểm chứng**: **XÁC NHẬN** (lỗi có thật tại `src/engine/settlement.ts` dòng 111–114 và dòng 296).
*(Ghi chú kiểm chứng: Ví dụ `70/30, 3 Nam + 3 Nữ, 300.000đ` trong báo cáo audit thực tế trong JavaScript cho ra đúng `70000` không lỗi; tuy nhiên với cấu hình mặc định `60/40, 3 Nam + 4 Nữ, 340.000đ` thì `(60 / 340) * 340000 === 60000.00000000001` và bị đội thành `61.000đ`. Spec và test bên dưới dùng đúng ca thực tế này.)*

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Khi chia tiền theo tỉ lệ Nam/Nữ, phép chia máy tính đôi khi sinh ra số lẻ cực nhỏ (ví dụ đúng ra là `60.000đ` chẵn nhưng máy tính tính ra `60.000,00000000001đ`), khiến hàm làm tròn lên 1.000đ đẩy nhầm thành **61.000đ** dù tổng tiền chia ra hoàn toàn tròn nghìn. Sau khi sửa, app sẽ nhân trước chia sau và bỏ qua sai số làm tròn máy tính nhỏ hơn 1 phần triệu đồng nên tiền chia chẵn sẽ hiển thị đúng số chẵn, không bị thu dư oan 1.000đ mỗi người.
**Ví dụ số cụ thể**: Buổi có **3 Nam và 4 Nữ** (đều đánh đủ trận), giá mặc định CLB gồm 1 giờ sân (`160.000đ`) + 6 quả cầu (`180.000đ`) = **340.000đ**, chọn chế độ **Tỉ lệ Nam/Nữ 60% – 40%** (tổng trọng số `3×60 + 4×40 = 340`).
- **Trước khi sửa**: Mỗi Nam bị tính `60.000,00000000001đ` rồi làm tròn lên thành **61.000đ**, mỗi Nữ **40.000đ** → tổng thu **343.000đ** (báo dư ảo **+3.000đ**).
- **Sau khi sửa**: Mỗi Nam đóng đúng **60.000đ**, mỗi Nữ đóng đúng **40.000đ** → tổng thu đúng **340.000đ** (dư **0đ**).

### File + tên hàm cần sửa
- `src/engine/settlement.ts` — hàm `ceilToNearest1000` (dòng 111–114) và hàm `calculateSettlement` (dòng 296).
- *(Đã grep `ceilToNearest1000` toàn dự án: chỉ gọi ở `settlement.ts:364` và test ở `settlement.test.ts:30-34`, không có file nào khác phải sửa theo.)*

### Code trước / code sau

**Vị trí 1** — `src/engine/settlement.ts` (hàm `ceilToNearest1000`, dòng 111–114):

**Code trước:**
```ts
export function ceilToNearest1000(amount: number): number {
  if (amount <= 0) return 0;
  return Math.ceil(amount / 1000) * 1000;
}
```

**Code sau:**
```ts
export function ceilToNearest1000(amount: number): number {
  if (amount <= 1e-6) return 0;
  return Math.ceil((amount - 1e-6) / 1000) * 1000;
}
```

> *(Ghi chú kỹ thuật: Chặn `amount <= 1e-6` thay vì `amount <= 0` để tránh trường hợp `amount` là nhiễu `1e-9` tạo ra `-0` khi trừ `1e-6`.)*

**Vị trí 2** — `src/engine/settlement.ts` (trong hàm `calculateSettlement`, dòng 293–298):

**Code trước:**
```ts
  } else {
    const sumWeights = Object.values(baseWeights).reduce((a, b) => a + b, 0);
    for (const p of payingPlayers) {
      initialShares[p.id] = (baseWeights[p.id] / (sumWeights || 1)) * totalCost;
    }
  }
```

**Code sau:**
```ts
  } else {
    const sumWeights = Object.values(baseWeights).reduce((a, b) => a + b, 0);
    for (const p of payingPlayers) {
      initialShares[p.id] = (baseWeights[p.id] * totalCost) / (sumWeights || 1);
    }
  }
```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/settlement.test.ts`
- **Tên test**:
  1. `17. Mục A3: ceilToNearest1000 không bị đội thêm 1.000đ do sai số IEEE-754 và không trả về -0`
  2. `18. Mục A3: GENDER_RATIO 60/40 với 3 Nam + 4 Nữ, tổng 340.000đ chia tròn 60.000đ / 40.000đ (không dư ảo 3.000đ)`
- **Input cụ thể & kết quả mong đợi**:
  - **Test 17**:
    - `ceilToNearest1000(60000.00000000001)` → `60000`
    - `ceilToNearest1000(50000.01)` → `51000` (số lẻ thật vẫn làm tròn lên)
    - `const zeroRes = ceilToNearest1000(1e-9)` → `expect(zeroRes).toBe(0)` và `expect(Object.is(zeroRes, 0)).toBe(true)`
  - **Test 18**:
    - `players`: 3 Nam (`m1..m3`, 4 trận) + 4 Nữ (`f1..f4`, 4 trận).
    - `settings`: `...DEFAULT_SETTLEMENT_SETTINGS`, `courtCostMode: 'HOURLY'`, `courtHourlyRate: 160000`, `courtHours: 1`, `shuttleCostMode: 'BY_SHUTTLE'`, `shuttleCount: 6`, `shuttlePrice: 30000`, `extraCost: 0`, `splitMode: 'GENDER_RATIO'`, `genderRatioMalePercent: 60`, `genderRatioFemalePercent: 40`, `discountUnderPlayed: false`.
    - **Kết quả mong đợi**:
      - `res.totalCost === 340000`
      - Tất cả 3 Nam có `roundedAmount === 60000`
      - Tất cả 4 Nữ có `roundedAmount === 40000`
      - `res.totalCollected === 340000`, `res.surplus === 0`

### KHÔNG được đụng vào
- Không thay đổi công thức `baseWeights` của `GENDER_RATIO` (dòng 248–256) và `MALE_EXTRA` (dòng 259–285).
- Không sửa mức giá mặc định trong `DEFAULT_SETTLEMENT_SETTINGS`.
- Không sửa điều kiện A2 vừa làm ở dòng 317.
- Không sửa các test cũ (test số 1–14) trong `settlement.test.ts`.

### Rule nào trong CLAUDE.md liên quan, và vì sao spec không vi phạm
- **Rule 4 (Công Thức Quyết Toán Bất Biến)**: Biểu thức `(baseWeights[p.id] * totalCost) / sumWeights` tương đương toán học 100% với `(baseWeights[p.id] / sumWeights) * totalCost`, vẫn dùng đúng trọng số cá nhân `perMaleWeight` và `perFemaleWeight` mà không chia cho tổng số người mỗi giới. Các giá mặc định `160.000đ/giờ`, `30.000đ/quả`, `0đ` giữ nguyên hoàn toàn.

### CÁCH TỰ THỬ BẰNG TAY trên app
1. Chuẩn bị danh sách gồm đúng **3 Nam và 4 Nữ**, cho mọi người đều đánh ít nhất 3 trận (hoặc vào tab **Tính tiền** tắt tạm công tắc "Giảm giá người chơi ít trận" và chọn người 0 trận "Đóng đủ như mọi người").
2. Ở tab **Tính tiền**, mục **1. Chi phí buổi chơi**: nhập **Giá/giờ** `160.000`, **Số giờ đánh** `1`, **Số quả cầu** `6`, **Giá/quả** `30.000`, **Chi phí khác** `0` (tổng chi = `340.000đ`).
3. Ở mục **2. Chế độ phân chia & Giảm giá**: chọn **Tỉ lệ Nam/Nữ**, kéo thanh trượt hoặc chọn nhanh **Nam 60% – Nữ 40%**.
4. Nhìn mục **3. Bảng thu tiền từng người**:
   - **Kết quả đúng**: Cả 3 bạn Nam đều hiện **60.000đ** (không phải 61.000đ), cả 4 bạn Nữ đều hiện **40.000đ**, tổng thu đúng **340.000đ**, không có dòng dôi dư `+3.000đ`.

### Commit message đề xuất
```text
fix(settlement): prevent IEEE-754 floating-point +1000 VND rounding inflation (A3)
```

---

## 3. Mục A10 — `PAUSE_PLAYER` cho phép tạm nghỉ người đang đánh trên sân

**Kiểm chứng**: **XÁC NHẬN** (đúng tại `src/engine/sessionReducer.ts` dòng 993–1032).
*(Ghi chú kiểm chứng: Báo cáo ghi "gây lỗi BLOCK khi muốn đổi người khác ở sân đó" — thực tế trong `validateLineup.ts:169-182` mã `PLAYER_PAUSED` là `WARN` chứ không phải `BLOCK`. Tuy nhiên lỗi gốc là có thật 100%: `PAUSE_PLAYER` không chặn người đang trong `currentMatch`, trái ngược với `PAUSE_PLAYERS` (dòng 1035–1044) và `REMOVE_PLAYER` (dòng 1218–1226), khiến người đang đánh trên sân bị chuyển xuống mục "Tạm nghỉ" và reset `waitStreak = 0` giữa trận.)*

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Hiện tại khi một người chơi đang đánh trên sân, nếu Host bấm nhầm biểu tượng **tách cà phê (Tạm nghỉ)** trên thẻ người đó ở tab Hàng chờ thì app vẫn cho họ chuyển sang trạng thái "Tạm nghỉ" và đẩy xuống danh sách nghỉ dù họ vẫn đang ở giữa trận trên sân. Sau khi sửa, app sẽ tự động bỏ qua lệnh tạm nghỉ đơn lẻ đối với người đang thi đấu (giống hệt cách app đang chặn khi chọn tạm nghỉ hàng loạt hoặc rút khỏi buổi), giữ nguyên trạng thái người đang đánh trên sân và không tạo bước Undo rỗng.

### File + tên hàm cần sửa
- `src/engine/sessionReducer.ts` — hàm `badmintonReducer`, nhánh `case 'PAUSE_PLAYER':` (dòng 993–1001).
- *(Đã grep `PAUSE_PLAYER` toàn dự án: `UPDATE_PLAYER` ở dòng 1181–1184 gọi lại `PAUSE_PLAYER` nên tự động được bảo vệ theo; `useBadmintonSession.ts:181` chỉ dispatch `{ playerId }`, không cần sửa chữ ký.)*

### Code trước / code sau

File `src/engine/sessionReducer.ts` (nhánh `case 'PAUSE_PLAYER':`, dòng 993–1001):

**Code trước:**
```ts
    case 'PAUSE_PLAYER': {
      const pid = action.payload.playerId;
      const target = state.players.find((p) => p.id === pid);
      if (!target || target.status === 'PAUSED') {
        return state;
      }
      const updatedPlayers = baseNextState.players.map((p) =>
```

**Code sau:**
```ts
    case 'PAUSE_PLAYER': {
      const pid = action.payload.playerId;
      const target = state.players.find((p) => p.id === pid);
      if (!target || target.status === 'PAUSED') {
        return state;
      }
      const isPlayingOnCourt = state.courts.some(
        (c) =>
          c.isActive &&
          c.currentMatch !== null &&
          (c.currentMatch.team1.includes(pid) || c.currentMatch.team2.includes(pid))
      );
      if (isPlayingOnCourt) {
        return state;
      }
      const updatedPlayers = baseNextState.players.map((p) =>
```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/reducerFixes.test.ts` (thêm vào bên trong `describe('PAUSE_PLAYER', ...)` sau Trường hợp 3, khoảng dòng 277)
- **Tên test**:
  1. `Trường hợp 4 (A10): player đang đánh trong currentMatch của sân active -> chặn và return state`
  2. `Trường hợp 5 (A10): UPDATE_PLAYER đổi status thành PAUSED cho player đang đánh -> chặn và return state`
- **Input cụ thể & kết quả mong đợi**:
  - **Test 4**:
    - `state = createInitialSessionState()`, `state.players = [p1, p2, p3, p4]` (đều `ACTIVE`, `waitStreak: 2`).
    - Gán `state.courts[0].isActive = true` và `state.courts[0].currentMatch = { type: 'DOUBLES', team1: ['p1', 'p2'], team2: ['p3', 'p4'], slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' }, startedAt: 1000, id: 'm1' }`.
    - Dispatch `{ type: 'PAUSE_PLAYER', payload: { playerId: 'p1' } }`.
    - **Kết quả mong đợi**: `expect(res).toBe(state)`, `expect(res.undoStack.length).toBe(0)`, `expect(res.players.find((p) => p.id === 'p1')?.status).toBe('ACTIVE')`, `expect(res.players.find((p) => p.id === 'p1')?.waitStreak).toBe(2)`.
  - **Test 5**:
    - Cùng `state` đang có `p1` trong `currentMatch`, dispatch `{ type: 'UPDATE_PLAYER', payload: { player: { id: 'p1', status: 'PAUSED' } } }`.
    - **Kết quả mong đợi**: `expect(res).toBe(state)`, `expect(res.undoStack.length).toBe(0)`, `expect(res.players.find((p) => p.id === 'p1')?.status).toBe('ACTIVE')`.

### KHÔNG được đụng vào
- Không sửa `PAUSE_PLAYERS` (dòng 1034–1075), `REMOVE_PLAYER` (dòng 1212–1264), `UPDATE_PLAYER` (dòng 1173–1209).
- Không sửa logic dọn `nextUp` và `readyQueue` khi tạm nghỉ người đang rảnh (dòng 1003–1023).
- Không sửa `src/components/QueueTab.tsx` hay `src/engine/validateLineup.ts`.

### Rule nào trong CLAUDE.md liên quan, và vì sao spec không vi phạm
- **Rule 1 (Pure Reducer)** và **Rule 2 (Độc Lập 3 Sân)**: Kiểm tra chỉ đọc `state.courts` thuần túy (không gọi hàm ngoài hay `Date.now()`), khi bị chặn trả về đúng `state` cũ nên không ghi snapshot rỗng vào `undoStack` và không động tới `nextUp` của bất kỳ sân nào.

### CÁCH TỰ THỬ BẰNG TAY trên app
1. Ở tab **Sân đấu**, bấm **Gợi ý kèo** rồi bấm **BẮT ĐẦU TRẬN LƯỢT NÀY >** ở Sân 1 để đưa 4 người vào trận đang đánh. Ghi nhớ tên 1 người đang trên sân (ví dụ "An").
2. Chuyển sang tab **Hàng chờ**, tìm dòng của "An" (đang có nhãn xanh **Đang đánh**).
3. Bấm vào nút biểu tượng **tách cà phê** (Tạm nghỉ giải lao) ở bên phải dòng của "An".
4. Kiểm tra kết quả:
   - **Kết quả đúng**: "An" vẫn nằm nguyên trong danh sách đang hoạt động với nhãn **Đang đánh**, **không** bị đẩy xuống mục "Tạm nghỉ", và nút **Hoàn tác (Undo)** trên thanh tiêu đề không tăng thêm bước mới. (Thử bấm nút tách cà phê với 1 người đang ngồi chờ không có nhãn "Đang đánh" thì người đó vẫn chuyển sang "Tạm nghỉ" bình thường.)

### Commit message đề xuất
```text
fix(reducer): block PAUSE_PLAYER while player is in an active currentMatch (A10)
```

---

## 4. Mục A11 — Loại bỏ gọi ngầm `Date.now()` bên trong reducer (`SUGGEST_NEXT_UP`, `UPDATE_COURT`)

**Kiểm chứng**: **XÁC NHẬN** (đúng tại `src/engine/sessionReducer.ts` dòng 397–399, 483–488, 773, 1452; `src/engine/matchmaker.ts` dòng 746; `src/engine/useBadmintonSession.ts` dòng 133–135, 240–253).

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
App có quy tắc bắt buộc rằng bộ xử lý trạng thái trung tâm (`sessionReducer`) không được tự xem đồng hồ máy (`Date.now()`), để mọi phép xếp sân luôn cho kết quả nhất quán, dễ hoàn tác và dễ kiểm thử. Hiện tại khi Host bấm "Gợi ý kèo" hoặc "Bật sân", app lại quên truyền giờ hiện tại vào, khiến bộ xử lý phải tự gọi ngầm đồng hồ máy. Sau khi sửa, giao diện người dùng không đổi, nhưng toàn bộ việc lấy giờ đều được thực hiện ở lớp ngoài trước khi gửi vào bộ xử lý — đảm bảo tuân thủ 100% Rule 1.

### File + tên hàm cần sửa
*(Đã grep toàn bộ `SUGGEST_NEXT_UP`, `UPDATE_COURT`, `suggestNextUpForCourt`, `suggestNextUp`, `updateCourt` trên toàn `src/`.)*

**File mã nguồn (3 file):**
1. `src/engine/sessionReducer.ts`:
   - Kiểu `BadmintonAction`: nhánh `SUGGEST_NEXT_UP` (dòng 397–399) đổi `now?: number` thành `now: number`.
   - Kiểu `BadmintonAction`: nhánh `UPDATE_COURT` (dòng 483–488) thêm trường `now: number` vào `payload`.
   - Hàm `badmintonReducer` → `case 'UPDATE_COURT':` (dòng 1360 và dòng 1452) truyền `action.payload.now` vào `suggestNextUpForCourt(nextState, courtId, action.payload.now)`.
2. `src/engine/matchmaker.ts`:
   - Hàm `suggestNextUpForCourt` (dòng 743–747): bỏ giá trị mặc định `= Date.now()` khỏi tham số `now: number`.
3. `src/engine/useBadmintonSession.ts`:
   - Hàm `suggestNextUp` (dòng 133–135): truyền `now: now ?? Date.now()`.
   - Hàm `updateCourt` (dòng 240–253): truyền `now: Date.now()` trong `dispatch`.

**File test có sẵn phải cập nhật thêm `now` cho `UPDATE_COURT` (4 file, tổng 5 chỗ — để `tsc -b` không báo lỗi thiếu thuộc tính):**
4. `src/engine/__tests__/harnessBusinessRules.test.ts` (dòng 68–71): thêm `now: 1000` vào `payload` của `UPDATE_COURT`.
5. `src/engine/__tests__/nextUpRedesign.test.ts` (dòng 173–176): thêm `now: 1500` vào `payload` của `UPDATE_COURT`.
6. `src/engine/__tests__/reducerFixes.test.ts` (dòng 478–484): thêm `now: 1000` vào `payload` của `UPDATE_COURT`.
7. `src/engine/__tests__/step1D.test.ts` (dòng 300–303 và dòng 307–310): thêm `now: 1000` vào cả 2 `payload` của `UPDATE_COURT`.

*(Lưu ý: Mọi chỗ gọi `SUGGEST_NEXT_UP` và `suggestNextUpForCourt` trong các file test cũ đều đã truyền `now`, nên không cần sửa chúng.)*

### Code trước / code sau

**File 1** — `src/engine/sessionReducer.ts`:

*(1a. Kiểu `SUGGEST_NEXT_UP`, dòng 396–399)*
**Code trước:**
```ts
  | {
      type: 'SUGGEST_NEXT_UP';
      payload: { courtId: string; now?: number };
    }
```
**Code sau:**
```ts
  | {
      type: 'SUGGEST_NEXT_UP';
      payload: { courtId: string; now: number };
    }
```

*(1b. Kiểu `UPDATE_COURT`, dòng 482–488)*
**Code trước:**
```ts
  | {
      type: 'UPDATE_COURT';
      payload: {
        courtId: string;
        updates: { name?: string; policy?: CourtPolicy; isActive?: boolean; forcedType?: 'DOUBLES' | 'SINGLES' | null };
      };
    }
```
**Code sau:**
```ts
  | {
      type: 'UPDATE_COURT';
      payload: {
        courtId: string;
        updates: { name?: string; policy?: CourtPolicy; isActive?: boolean; forcedType?: 'DOUBLES' | 'SINGLES' | null };
        now: number;
      };
    }
```

*(1c. Trong `case 'UPDATE_COURT':`, dòng 1451–1453 — tìm gần cuối `case 'UPDATE_COURT'` vì số dòng đã dịch sau A10)*
**Code trước:**
```ts
      if (isActivating) {
        const draft = suggestNextUpForCourt(nextState, courtId);
        if (draft) {
```
**Code sau:**
```ts
      if (isActivating) {
        const draft = suggestNextUpForCourt(nextState, courtId, action.payload.now);
        if (draft) {
```

**File 2** — `src/engine/matchmaker.ts` (dòng 743–747):

**Code trước:**
```ts
export function suggestNextUpForCourt(
  state: BadmintonSessionState,
  courtId: string,
  now: number = Date.now()
): NextUpDraft | null {
```
**Code sau:**
```ts
export function suggestNextUpForCourt(
  state: BadmintonSessionState,
  courtId: string,
  now: number
): NextUpDraft | null {
```

**File 3** — `src/engine/useBadmintonSession.ts`:

*(3a. Hàm `suggestNextUp`, dòng 133–135)*
**Code trước:**
```ts
  const suggestNextUp = useCallback((courtId: string, now?: number) => {
    dispatch({ type: 'SUGGEST_NEXT_UP', payload: { courtId, now } });
  }, []);
```
**Code sau:**
```ts
  const suggestNextUp = useCallback((courtId: string, now?: number) => {
    dispatch({ type: 'SUGGEST_NEXT_UP', payload: { courtId, now: now ?? Date.now() } });
  }, []);
```

*(3b. Hàm `updateCourt`, dòng 240–253)*
**Code trước:**
```ts
  const updateCourt = useCallback(
    (
      courtId: string,
      updates: {
        name?: string;
        policy?: CourtPolicy;
        isActive?: boolean;
        forcedType?: 'DOUBLES' | 'SINGLES' | null;
      }
    ) => {
      dispatch({ type: 'UPDATE_COURT', payload: { courtId, updates } });
    },
    []
  );
```
**Code sau:**
```ts
  const updateCourt = useCallback(
    (
      courtId: string,
      updates: {
        name?: string;
        policy?: CourtPolicy;
        isActive?: boolean;
        forcedType?: 'DOUBLES' | 'SINGLES' | null;
      }
    ) => {
      dispatch({ type: 'UPDATE_COURT', payload: { courtId, updates, now: Date.now() } });
    },
    []
  );
```

**File 4–7** — Cập nhật 5 chỗ dispatch `UPDATE_COURT` trong các test cũ:

- `src/engine/__tests__/harnessBusinessRules.test.ts` (dòng 68–71):
```ts
      state = badmintonReducer(state, {
        type: 'UPDATE_COURT',
        payload: { courtId: 'court-1', updates: { forcedType: 'SINGLES' }, now: 1000 },
      });
```
- `src/engine/__tests__/nextUpRedesign.test.ts` (dòng 173–176):
```ts
    state = badmintonReducer(state, {
      type: 'UPDATE_COURT',
      payload: { courtId: 'court-2', updates: { isActive: true }, now: 1500 },
    });
```
- `src/engine/__tests__/reducerFixes.test.ts` (dòng 478–484):
```ts
      const res = badmintonReducer(state, {
        type: 'UPDATE_COURT',
        payload: {
          courtId: 'court-1',
          updates: { isActive: false },
          now: 1000,
        },
      });
```
- `src/engine/__tests__/step1D.test.ts` (dòng 300–310):
```ts
    const stateAfter = badmintonReducer(state, {
      type: 'UPDATE_COURT',
      payload: { courtId: 'court-1', updates: { isActive: false }, now: 1000 },
    });
    expect(stateAfter).toBe(stateBefore);

    // Tắt Sân 2 (đang rảnh) -> thành công, nextUp bị reset rỗng, suggestCursor = 0, xóa snooze
    const stateAfterTurnOff2 = badmintonReducer(state, {
      type: 'UPDATE_COURT',
      payload: { courtId: 'court-2', updates: { isActive: false }, now: 1000 },
    });
```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/harnessBusinessRules.test.ts` (thêm `vi` vào import dòng 1: `import { describe, it, expect, vi } from 'vitest';` và `nextUpMemberIds` vào import từ `'../nextUp'`, thêm một `describe('Rule 1 (A11): Pure Reducer không gọi ngầm Date.now()', ...)` ở cuối file)
- **Tên test**: `UPDATE_COURT (bật sân) và SUGGEST_NEXT_UP dùng action.payload.now và tuyệt đối không gọi Date.now()`
- **Input cụ thể & kết quả mong đợi**:
  - Tạo `baseState` từ `createInitialSessionState()` với:
    - `courts`: giữ `court-1` với `isActive: false`, `forcedType: null`, `policy: 'MIX'`, `nextUp: { type: 'DOUBLES', slots: [null, null, null, null], slotSource: [null, null, null, null] }`.
    - `players`: `[createMockPlayer('p1', 'Player 1'), createMockPlayer('p2', 'Player 2')]`.
    - `settings`: `{ ...createInitialSessionState().settings, autoSingles: 'AUTO', matchMix: { doubles: 1, singles: 0 } }`.
    - `autoSinglesSnooze`: `{ 'court-1': { untilTs: 15000, queueSizeAtSnooze: 2 } }`.
  - Gắn `const dateNowSpy = vi.spyOn(Date, 'now');` bọc trong `try { ... } finally { dateNowSpy.mockRestore(); }`.
  - **Bước 1 (`UPDATE_COURT` khi còn trong snooze, `now: 12000`)**:
    - `const s1 = badmintonReducer(baseState, { type: 'UPDATE_COURT', payload: { courtId: 'court-1', updates: { isActive: true }, now: 12000 } });`
    - Mong đợi: `s1.courts[0].isActive === true`, `s1.courts[0].nextUp.slots` bằng `[null, null, null, null]` (vì còn snooze đến 15000 nên chỉ xếp Đôi, 2 người không đủ).
  - **Bước 2 (`UPDATE_COURT` sau khi hết snooze, `now: 16000`)**:
    - `const s2 = badmintonReducer(baseState, { type: 'UPDATE_COURT', payload: { courtId: 'court-1', updates: { isActive: true }, now: 16000 } });`
    - Mong đợi: `s2.courts[0].isActive === true`, `s2.courts[0].nextUp.type === 'SINGLES'`, `nextUpMemberIds(s2.courts[0].nextUp).sort()` bằng `['p1', 'p2']`.
  - **Bước 3 (`SUGGEST_NEXT_UP` từ `s1` — sân đã bật, còn snooze `now: 12000` vs hết snooze `now: 16000`)**:
    - `const s3 = badmintonReducer(s1, { type: 'SUGGEST_NEXT_UP', payload: { courtId: 'court-1', now: 12000 } });` → mong đợi `expect(s3).toBe(s1)`.
    - `const s4 = badmintonReducer(s1, { type: 'SUGGEST_NEXT_UP', payload: { courtId: 'court-1', now: 16000 } });` → mong đợi `s4.courts[0].nextUp.type === 'SINGLES'`, `nextUpMemberIds(s4.courts[0].nextUp).sort()` bằng `['p1', 'p2']`.
  - **Bước 4**: `expect(dateNowSpy).toHaveBeenCalledTimes(0)`!

### KHÔNG được đụng vào
- Không sửa `src/engine/nextUp.ts` (không bỏ giá trị mặc định `now: number = Date.now()` của `resolveTargetMatchType` ở dòng 475 vì `canSuggestNextUp` ở dòng 552 gọi từ component `CourtCard.tsx`).
- Không sửa `src/App.tsx` hoặc `src/components/CourtCard.tsx` (chữ ký hàm `suggestNextUp` và `updateCourt` của `useBadmintonSession` giữ nguyên tương thích 100%).
- Không sửa logic chấm điểm hay chọn kèo bên trong `suggestNextUpForCourt`.

### Rule nào trong CLAUDE.md liên quan, và vì sao spec không vi phạm
- **Rule 1 (Pure Reducer & State Machine)**: Đây chính là mục sửa để **khôi phục tuân thủ Rule 1** — triệt tiêu hoàn toàn lời gọi ngầm `Date.now()` bên trong `sessionReducer.ts` và ép buộc mọi timestamp đi qua `action.payload.now` được tính sẵn trong `useBadmintonSession.ts`.
- **Rule 2 (Độc Lập 3 Sân)**: Không thay đổi phạm vi tác động của `SUGGEST_NEXT_UP` hay `UPDATE_COURT`.

### CÁCH TỰ THỬ BẰNG TAY trên app
1. Mở tab **Sân đấu**, đảm bảo có ít nhất 4 người đang hoạt động.
2. Tắt **Sân 2** bằng nút nguồn (góc trên bên phải thẻ Sân 2), sau đó bấm bật lại **Sân 2**.
3. Kiểm tra **Kết quả đúng**: Sân 2 bật lại bình thường và tự gợi ý lượt tiếp theo ngay mà không bị treo hay báo lỗi console.
4. Bấm nút **Gợi ý kèo** / **Gợi ý lại** nhiều lần trên Sân 1:
   - **Kết quả đúng**: Sân 1 xoay qua các kèo gợi ý bình thường, Sân 2 và Sân 3 không bị nhảy đội hình.

### Commit message đề xuất
```text
fix(reducer): require payload.now on UPDATE_COURT and SUGGEST_NEXT_UP for pure reducer (A11)
```

---

## 5. Mục A7 — Mất người ở ô số 1 khi chuyển Next Up từ Đôi (4 ô) sang Đơn (2 ô)

**Kiểm chứng**: **XÁC NHẬN** (đúng tại cả 4 vị trí trong `src/engine/sessionReducer.ts`: `TOGGLE_NEXT_UP_TYPE` dòng 921–924; `UPDATE_COURT` dòng 1400–1403 và dòng 1421–1424; `UPDATE_SETTINGS` dòng 1571–1574).

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Khi Host đang để khung lượt tiếp theo ở dạng **Đôi (4 ô)** và đã chọn tay 2 người vào 2 ô của Đội 1 (ví dụ `[An, Bình, trống, trống]`), nếu bấm chuyển sang **Đơn (2 ô)** (hoặc đổi chế độ sân / cài đặt sang Đơn) thì app vô tình làm **mất tên Bình** ở ô thứ 2, chỉ còn lại `[An, trống]`. Sau khi sửa, nếu Đội 2 (ô số 2) đang trống thì app sẽ giữ lại Bình ở ô số 1 đưa sang làm đối thủ của An thành `[An, Bình]` (còn nếu Đội 2 đã có người, ví dụ `[An, Bình, Cường, Dũng]`, thì vẫn ưu tiên giữ `[An, Cường]` như trước).

### File + tên hàm cần sửa
- `src/engine/sessionReducer.ts` — hàm `badmintonReducer`, **đủ cả 4 chỗ**:
  1. `case 'TOGGLE_NEXT_UP_TYPE':` (gốc dòng 921–924)
  2. `case 'UPDATE_COURT':` nhánh `if (newForced === 'SINGLES' && c.nextUp?.type !== 'SINGLES')` (gốc dòng 1400–1403)
  3. `case 'UPDATE_COURT':` nhánh `else if (newForced === null)` khi `matchMix?.singles === 1` (gốc dòng 1421–1424)
  4. `case 'UPDATE_SETTINGS':` nhánh `if (normalizedMix.singles === 1)` (gốc dòng 1571–1574)
- *(Đã grep `oldSlots` toàn dự án: không còn vị trí nào khác chuyển Đôi → Đơn.)*

### Code trước / code sau

Trong cả **4 vị trí** nêu trên của `src/engine/sessionReducer.ts`, đoạn code gốc đều giống hệt nhau:

**Code trước (lặp lại ở cả 4 vị trí):**
```ts
          const s0 = oldSlots[0];
          const s1 = oldSlots[2] !== undefined ? oldSlots[2] : oldSlots[1];
          const src0 = oldSource[0];
          const src1 = oldSource[2] !== undefined ? oldSource[2] : oldSource[1];
```

**Code sau (thay giống hệt ở cả 4 vị trí, giữ đúng mức thụt đầu dòng của từng khối):**
```ts
          const s0 = oldSlots[0];
          const s1Index = oldSlots[2] != null ? 2 : 1;
          const s1 = oldSlots[s1Index];
          const src0 = oldSource[0];
          const src1 = oldSource[s1Index];
```

> *(Ghi chú: Dùng `s1Index = oldSlots[2] != null ? 2 : 1` đảm bảo cả `s1` lẫn `src1` luôn lấy cùng một chỉ số — vừa xử lý cả `null` lẫn `undefined`, vừa giữ đúng nhãn `'MANUAL'`/`'AUTO'` đi theo đúng người chơi.)*

### Test cần thêm
- **Tên file**: `src/engine/__tests__/nextUpRedesign.test.ts` (thêm vào cuối `describe(...)` trước dấu `});` cuối file)
- **Tên test**: `11. Mục A7: Chuyển Next Up từ Đôi [p1, p2, null, null] sang Đơn giữ nguyên p2 và nhãn MANUAL ở cả 4 luồng (TOGGLE, UPDATE_COURT forcedType/null, UPDATE_SETTINGS)`
- **Input cụ thể & kết quả mong đợi**:
  - Khởi tạo hàm helper nội bộ trong test tạo state có 1 sân `court-1` active, 4 người `p1..p4`, và `courts[0].nextUp = { type: 'DOUBLES', slots: ['p1', 'p2', null, null], slotSource: ['MANUAL', 'MANUAL', null, null] }`.
  - **Luồng 1 (`TOGGLE_NEXT_UP_TYPE`)**: dispatch `{ type: 'TOGGLE_NEXT_UP_TYPE', payload: { courtId: 'court-1', nextType: 'SINGLES' } }` → mong đợi `nextUp.type === 'SINGLES'`, `nextUp.slots` bằng `['p1', 'p2']`, `nextUp.slotSource` bằng `['MANUAL', 'MANUAL']`.
  - **Luồng 2 (`UPDATE_COURT` `forcedType: 'SINGLES'`)**: dispatch `{ type: 'UPDATE_COURT', payload: { courtId: 'court-1', updates: { forcedType: 'SINGLES' }, now: 1000 } }` → mong đợi `nextUp.type === 'SINGLES'`, `nextUp.slots` bằng `['p1', 'p2']`, `nextUp.slotSource` bằng `['MANUAL', 'MANUAL']`.
  - **Luồng 3 (`UPDATE_COURT` `forcedType: null` khi `matchMix.singles === 1`)**: đặt `state.settings.matchMix = { doubles: 0, singles: 1 }` và `state.courts[0].forcedType = 'DOUBLES'`, rồi dispatch `{ type: 'UPDATE_COURT', payload: { courtId: 'court-1', updates: { forcedType: null }, now: 1000 } }` → mong đợi `nextUp.type === 'SINGLES'`, `nextUp.slots` bằng `['p1', 'p2']`, `nextUp.slotSource` bằng `['MANUAL', 'MANUAL']`.
  - **Luồng 4 (`UPDATE_SETTINGS` `matchMix: { doubles: 0, singles: 1 }`)**: dispatch `{ type: 'UPDATE_SETTINGS', payload: { settings: { matchMix: { doubles: 0, singles: 1 } } } }` → mong đợi `nextUp.type === 'SINGLES'`, `nextUp.slots` bằng `['p1', 'p2']`, `nextUp.slotSource` bằng `['MANUAL', 'MANUAL']`.
  - **Luồng 5 (khi ô số 2 CÓ người)**: đặt `nextUp = { type: 'DOUBLES', slots: ['p1', 'p2', 'p3', 'p4'], slotSource: ['MANUAL', 'AUTO', 'MANUAL', 'AUTO'] }`, dispatch `TOGGLE_NEXT_UP_TYPE` sang `'SINGLES'` → mong đợi `nextUp.slots` bằng `['p1', 'p3']`, `nextUp.slotSource` bằng `['MANUAL', 'MANUAL']` (ưu tiên ô 2 khi ô 2 có người).

### KHÔNG được đụng vào
- Không sửa chiều ngược lại (`SINGLES -> DOUBLES`, các dòng `[oldSlots[0] ?? null, null, oldSlots[1] ?? null, null]`).
- Không sửa `src/engine/nextUp.ts` (`normalizeNextUp`).
- Không sửa các sân khác (chỉ đổi `courtId` tương ứng trong `TOGGLE_NEXT_UP_TYPE` và `UPDATE_COURT`).

### Rule nào trong CLAUDE.md liên quan, và vì sao spec không vi phạm
- **Rule 2 (Độc Lập 3 Sân & Tôn Trọng Manual Edit)**: Giữ nguyên người chơi Host đã gán tay (`'MANUAL'`) ở ô 1 khi chuyển từ 4 ô sang 2 ô (thay vì làm mất thành `null`), giữ nguyên nhãn `'MANUAL'` đi kèm đúng người đó, và không đụng đến `nextUp` của sân khác.

### CÁCH TỰ THỬ BẰNG TAY trên app
1. Mở tab **Sân đấu**, trên thẻ **Sân 1** đảm bảo phần lượt tiếp theo đang là **Đôi (4 ô) ⇄** và bấm **🗑️ Xóa trắng** để trống cả 4 ô.
2. Bấm vào **ô đầu tiên của ĐỘI 1** chọn người A (ví dụ "An"), bấm vào **ô thứ hai của ĐỘI 1** chọn người B (ví dụ "Bình"); để trống cả 2 ô của ĐỘI 2.
3. Bấm nút **Đôi (4 ô) ⇄** để chuyển khung lượt tiếp theo sang **Đơn (2 ô) ⇄** (hoặc bấm nút **Đơn** trên thanh `Auto | Đôi | Đơn` ở góc trên thẻ Sân 1).
4. Kiểm tra 2 ô của lượt Đơn:
   - **Kết quả đúng**: ĐỘI 1 hiện **An**, ĐỘI 2 hiện **Bình** (không bị mất tên Bình thành ô trống).

### Commit message đề xuất
```text
fix(reducer): preserve slot 1 player and source when switching nextUp from DOUBLES to SINGLES (A7)
```

---

## 6. Mục A1 — Treo đồng bộ Cloud vĩnh viễn khi bấm Undo nhanh (< 250ms) hoặc rời phòng khi đang chờ đẩy

**Kiểm chứng**: **XÁC NHẬN** (đúng tại `src/hooks/useCloudRoom.ts` dòng 301–346 và `leaveRoom` dòng 444–472).

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Khi hai người dùng chung một phòng Online (chế độ Co-Host), nếu người thứ nhất vừa bấm sửa một ô rồi bấm **Hoàn tác (Undo)** thật nhanh trong vòng chưa đầy 0,25 giây (trước khi kịp đẩy lên mạng), app bị kẹt vĩnh viễn ở trạng thái "đang đồng bộ" (chấm vàng nhấp nháy mãi) và **ngừng nhận mọi cập nhật từ máy Co-Host còn lại**. Lỗi tương tự cũng có thể xảy ra nếu bấm rời phòng trong lúc đang chờ đẩy dữ liệu rồi vào phòng mới. Sau khi sửa, app sẽ hủy trạng thái "đang chờ đẩy" ngay khi dữ liệu quay về khớp với bản trên Cloud hoặc khi rời phòng, chấm trạng thái quay về xanh và máy tiếp tục nhận đồng bộ bình thường.

### File + tên hàm cần sửa
- `src/hooks/useCloudRoom.ts`:
  - `useCloudRoom` → `useEffect` số 4 (đẩy thay đổi cục bộ lên Supabase, dòng 301–304 và cleanup dòng 342–346).
  - `useCloudRoom` → hàm `leaveRoom` (dòng 444–450).
- *(Đã grep `leaveRoom` và `hasPendingLocalChangeRef` toàn dự án: không có file nào khác cần sửa theo.)*

### Code trước / code sau

**Vị trí 1** — `src/hooks/useCloudRoom.ts` (trong `useEffect` số 4, dòng 300–305):

**Code trước:**
```ts
    // A5: Nếu state hiện tại khớp với snapshot vừa nhận từ xa, không gửi ngược lại
    if (areSessionSnapshotsEqual(currentState, lastAppliedRemoteSnapshotRef.current)) {
      isApplyingRemoteRef.current = false;
      return;
    }
```

**Code sau:**
```ts
    // A5: Nếu state hiện tại khớp với snapshot vừa nhận từ xa, không gửi ngược lại
    if (areSessionSnapshotsEqual(currentState, lastAppliedRemoteSnapshotRef.current)) {
      isApplyingRemoteRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      hasPendingLocalChangeRef.current = false;
      setSyncStatus('SYNCED');
      return;
    }
```

**Vị trí 2** — `src/hooks/useCloudRoom.ts` (cleanup của `useEffect` số 4, dòng 342–346):

**Code trước:**
```ts
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
```

**Code sau:**
```ts
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
```

**Vị trí 3** — `src/hooks/useCloudRoom.ts` (đầu hàm `leaveRoom`, dòng 444–450):

**Code trước:**
```ts
  const leaveRoom = useCallback(() => {
    setRoomCode(null);
    setPinCode(null);
    setRole('OFFLINE');
    setSyncStatus('OFFLINE');
    setErrorMessage(null);
```

**Code sau:**
```ts
  const leaveRoom = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    hasPendingLocalChangeRef.current = false;
    setRoomCode(null);
    setPinCode(null);
    setRole('OFFLINE');
    setSyncStatus('OFFLINE');
    setErrorMessage(null);
```

### Test cần thêm
- **Tên file**: `src/hooks/__tests__/useCloudRoomSync.test.ts` (thêm vào cuối `describe('useCloudRoom Realtime & Sync Loop Hardening', ...)`)
- **Tên test**:
  1. `8. Mục A1: Bấm Undo nhanh (<250ms) quay về snapshot khớp Cloud phải giải phóng cờ pending, về SYNCED và tiếp tục nhận Realtime`
  2. `9. Mục A1: Rời phòng (leaveRoom) khi đang pending debounce (<250ms) phải reset cờ pending để lần vào phòng sau vẫn nhận Realtime`
- **Input cụ thể & kết quả mong đợi**:
  - **Test 8**:
    - Vào phòng `'SAN-49'` với PIN `'1234'` (`CO_HOST`), `baseState = createInitialSessionState()`, `updated_at: 1000`, `updated_by: 'OTHER'`. Chạy `await vi.runAllTimersAsync()`. Xóa sạch mảng `appliedSnapshots` và `mockUpsertRoom.mockClear()`.
    - Rerender với `modifiedState` (`mixDebt: { doubles: 3, singles: 0 }`). Tua đồng hồ `100ms` (`await vi.advanceTimersByTimeAsync(100)`).
    - Kiểm tra lúc này: `harness.getResult().syncStatus === 'SYNCING'`, `mockUpsertRoom` chưa được gọi (`0` lần).
    - Rerender quay ngược lại `baseState` (giả lập Undo nhanh < 250ms).
    - Kiểm tra ngay: `harness.getResult().syncStatus === 'SYNCED'`.
    - Tua tiếp `300ms`: `mockUpsertRoom` vẫn gọi `0` lần.
    - Bắn gói `realtimeSubscriber` từ `'OTHER_HOST'` với `updated_at: 5000`, `session_data: { ...baseState, mixDebt: { doubles: 7, singles: 1 } }`.
    - **Kết quả mong đợi**: `appliedSnapshots.length === 1` và `appliedSnapshots[0].mixDebt.doubles === 7`.
  - **Test 9**:
    - Vào phòng `'SAN-49'` (`CO_HOST`), `await vi.runAllTimersAsync()`.
    - Rerender với `modifiedState` (`mixDebt: { doubles: 4, singles: 0 }`), tua `100ms` (đang pending).
    - Gọi `harness.getResult().leaveRoom()`, kiểm tra `harness.getResult().syncStatus === 'OFFLINE'`.
    - Vào lại phòng `'SAN-49'` (quyền `VIEWER`, không truyền PIN), `await vi.runAllTimersAsync()`, xóa `appliedSnapshots`.
    - Bắn gói `realtimeSubscriber` từ `'OTHER_HOST'` với `updated_at: 6000`, `session_data: { ...baseState, mixDebt: { doubles: 9, singles: 0 } }`.
    - **Kết quả mong đợi**: `appliedSnapshots.length === 1` và `appliedSnapshots[0].mixDebt.doubles === 9`.

### KHÔNG được đụng vào
- Không sửa dependency array của `useEffect` số 2 (dòng 249: `[joinRoom]`) hay `useEffect` số 3 (dòng 292: `[roomCode, clientId]`).
- Không bỏ điều kiện guard `if (hasPendingLocalChangeRef.current) return;` (dòng 265), anti-echo `record.updated_by === clientId` (dòng 270), hoặc kiểm tra timestamp `record.updated_at <= lastAppliedTimestampRef.current` (dòng 275).
- Không sửa thời gian debounce `250ms` (dòng 340).
- Không sửa `areSessionSnapshotsEqual` ở bước này (để dành riêng cho mục A4 ngay sau đây).

### Rule nào trong CLAUDE.md liên quan, và vì sao spec không vi phạm
- **Rule 3 (Chống Vòng Lặp Reset Dữ LiỆU Cloud Sync - CRITICAL)**: Spec giữ nguyên tuyệt đối dependency array của các `useEffect` kết nối/Realtime (không thêm `state` hay callback không bọc ref), giữ nguyên anti-echo và kiểm tra timestamp `remote.updated_at > lastAppliedTimestampRef`, chỉ giải phóng cờ `hasPendingLocalChangeRef` khi không còn thay đổi local nào chờ đẩy (do đã Undo khớp bản Cloud hoặc đã rời phòng).

### CÁCH TỰ THỬ BẰNG TAY trên app
1. Mở app trên **2 điện thoại** (hoặc 2 cửa sổ trình duyệt) cùng kết nối vào **1 Phòng Online** với quyền **Co-Host** (nhập mã phòng + mã PIN).
2. Trên **máy 1**, đổi nhanh 1 người ở ô Next Up của Sân 1 rồi bấm ngay nút **Hoàn tác (Undo)** trên thanh trên cùng thật nhanh (ngay lập tức, trong vòng < 0,25 giây).
3. Quan sát chấm tròn bên cạnh mã phòng ở góc trên bên phải của **máy 1**:
   - **Kết quả đúng**: Chấm tròn quay về **màu xanh lá** (không bị kẹt nhấp nháy màu vàng mãi mãi).
4. Trên **máy 2**, bấm **Gợi ý kèo** ở Sân 1 (hoặc thêm 1 người mới ở tab Hàng chờ):
   - **Kết quả đúng**: Sau ~1 giây, **máy 1** tự cập nhật theo đúng thay đổi của **máy 2** (không bị đứng hình).

### Commit message đề xuất
```text
fix(cloud): clear pending sync flag on fast undo match and leaveRoom (A1)
```

---

## 7. Mục A4 — `areSessionSnapshotsEqual` bỏ sót `sex`, `virtualGamesOffset`, `court.name`, `settings.weights` và nội dung `pairRules`/`history`/`readyQueue`

**Kiểm chứng**: **XÁC NHẬN** (đúng tại `src/hooks/useCloudRoom.ts` dòng 25–109).

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Trước khi đẩy dữ liệu lên Phòng Online, app dùng một hàm so sánh để kiểm tra xem buổi chơi có gì thay đổi so với bản trên mạng hay không. Do hàm so sánh hiện tại quên kiểm tra **giới tính (Nam/Nữ)**, **tên sân**, **trọng số thuật toán**, và chỉ đếm số lượng (không kiểm tra nội dung bên trong) của **luật cặp**, **lịch sử trận**, **hàng đợi sẵn sàng**, nên khi Co-Host bấm đổi Nam ↔ Nữ hoặc sửa 1 luật cặp (xóa cũ thêm mới cùng số lượng), app tưởng là "không có gì thay đổi" và **không bao giờ đẩy lên Cloud** cho các máy khác. Sau khi sửa, mọi thay đổi này đều được phát hiện và đồng bộ ngay sang tất cả các điện thoại trong phòng.

### File + tên hàm cần sửa
- `src/hooks/useCloudRoom.ts` — hàm `areSessionSnapshotsEqual` (dòng 25–109).
- *(Đã grep `areSessionSnapshotsEqual` toàn dự án: chỉ dùng ở `useCloudRoom.ts:301` và test ở `useCloudRoomSync.test.ts:479`, không có file nào khác cần sửa theo.)*

### Code trước / code sau

File `src/hooks/useCloudRoom.ts` (trong hàm `areSessionSnapshotsEqual`):

**Phần 1 — Kiểm tra `court.name` trong vòng lặp `courts` (dòng 47–53):**

**Code trước:**
```ts
  // So sánh courts
  for (let i = 0; i < a.courts.length; i++) {
    const cA = a.courts[i];
    const cB = b.courts[i];
    if (cA.id !== cB.id || cA.isActive !== cB.isActive || cA.policy !== cB.policy) return false;
```

**Code sau:**
```ts
  // So sánh courts
  for (let i = 0; i < a.courts.length; i++) {
    const cA = a.courts[i];
    const cB = b.courts[i];
    if (
      cA.id !== cB.id ||
      cA.name !== cB.name ||
      cA.isActive !== cB.isActive ||
      cA.policy !== cB.policy
    ) {
      return false;
    }
```

**Phần 2 — Kiểm tra `sex` và `virtualGamesOffset` trong vòng lặp `players` (dòng 77–93):**

**Code trước:**
```ts
  // So sánh players
  for (let i = 0; i < a.players.length; i++) {
    const pA = a.players[i];
    const pB = b.players[i];
    if (
      pA.id !== pB.id ||
      pA.name !== pB.name ||
      pA.status !== pB.status ||
      pA.rank !== pB.rank ||
      pA.gamesPlayed !== pB.gamesPlayed ||
      pA.waitStreak !== pB.waitStreak ||
      pA.assignedPool !== pB.assignedPool ||
      pA.noSingles !== pB.noSingles
    ) {
      return false;
    }
  }
```

**Code sau:**
```ts
  // So sánh players
  for (let i = 0; i < a.players.length; i++) {
    const pA = a.players[i];
    const pB = b.players[i];
    if (
      pA.id !== pB.id ||
      pA.name !== pB.name ||
      pA.sex !== pB.sex ||
      pA.status !== pB.status ||
      pA.rank !== pB.rank ||
      pA.gamesPlayed !== pB.gamesPlayed ||
      pA.virtualGamesOffset !== pB.virtualGamesOffset ||
      pA.waitStreak !== pB.waitStreak ||
      pA.assignedPool !== pB.assignedPool ||
      pA.noSingles !== pB.noSingles
    ) {
      return false;
    }
  }
```

**Phần 3 — Kiểm tra `settings.weights` và nội dung `pairRules`, `history`, `readyQueue` (dòng 95–109):**

**Code trước:**
```ts
  // So sánh settings cơ bản
  if (
    a.settings?.maleBonus !== b.settings?.maleBonus ||
    a.settings?.courtMode !== b.settings?.courtMode ||
    a.settings?.autoSingles !== b.settings?.autoSingles ||
    a.settings?.autoSinglesSnoozeMin !== b.settings?.autoSinglesSnoozeMin ||
    a.settings?.preferMixedDoubles !== b.settings?.preferMixedDoubles ||
    a.settings?.matchMix?.doubles !== b.settings?.matchMix?.doubles ||
    a.settings?.matchMix?.singles !== b.settings?.matchMix?.singles
  ) {
    return false;
  }

  return true;
}
```

**Code sau:**
```ts
  // So sánh settings cơ bản
  if (
    a.settings?.maleBonus !== b.settings?.maleBonus ||
    a.settings?.courtMode !== b.settings?.courtMode ||
    a.settings?.autoSingles !== b.settings?.autoSingles ||
    a.settings?.autoSinglesSnoozeMin !== b.settings?.autoSinglesSnoozeMin ||
    a.settings?.preferMixedDoubles !== b.settings?.preferMixedDoubles ||
    a.settings?.matchMix?.doubles !== b.settings?.matchMix?.doubles ||
    a.settings?.matchMix?.singles !== b.settings?.matchMix?.singles
  ) {
    return false;
  }

  // So sánh settings.weights
  const wA = a.settings?.weights;
  const wB = b.settings?.weights;
  if (wA !== wB) {
    if (!wA || !wB) return false;
    const keysA = Object.keys(wA) as Array<keyof typeof wA>;
    const keysB = Object.keys(wB) as Array<keyof typeof wB>;
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) {
      if (wA[k] !== wB[k]) return false;
    }
  }

  // So sánh nội dung pairRules
  const rulesA = a.pairRules || [];
  const rulesB = b.pairRules || [];
  for (let i = 0; i < rulesA.length; i++) {
    const rA = rulesA[i];
    const rB = rulesB[i];
    if (
      rA.id !== rB.id ||
      rA.playerAId !== rB.playerAId ||
      rA.playerBId !== rB.playerBId ||
      rA.type !== rB.type
    ) {
      return false;
    }
  }

  // So sánh nội dung history
  const histA = a.history || [];
  const histB = b.history || [];
  for (let i = 0; i < histA.length; i++) {
    const hA = histA[i];
    const hB = histB[i];
    if (
      hA.id !== hB.id ||
      hA.courtId !== hB.courtId ||
      hA.endedAt !== hB.endedAt ||
      hA.team1?.join(',') !== hB.team1?.join(',') ||
      hA.team2?.join(',') !== hB.team2?.join(',')
    ) {
      return false;
    }
  }

  // So sánh nội dung readyQueue
  const queueA = a.readyQueue || [];
  const queueB = b.readyQueue || [];
  for (let i = 0; i < queueA.length; i++) {
    const qA = queueA[i];
    const qB = queueB[i];
    if (
      qA.id !== qB.id ||
      qA.courtId !== qB.courtId ||
      qA.isLockedByHost !== qB.isLockedByHost ||
      qA.lineup?.type !== qB.lineup?.type ||
      qA.lineup?.team1?.join(',') !== qB.lineup?.team1?.join(',') ||
      qA.lineup?.team2?.join(',') !== qB.lineup?.team2?.join(',')
    ) {
      return false;
    }
  }

  return true;
}
```

### Test cần thêm
- **Tên file**: `src/hooks/__tests__/useCloudRoomSync.test.ts` (thêm vào cuối `describe('useCloudRoom Realtime & Sync Loop Hardening', ...)`)
- **Tên test**:
  1. `10. Mục A4: areSessionSnapshotsEqual phát hiện thay đổi sex, virtualGamesOffset, court.name, settings.weights và phần tử trong pairRules/history/readyQueue`
  2. `11. Mục A4: Co-Host đổi giới tính Nam/Nữ (player.sex) được phát hiện và đẩy lên Cloud qua upsertRoom`
- **Input cụ thể & kết quả mong đợi**:
  - **Test 10**:
    - Tạo `base = createInitialSessionState()` kèm:
      - 2 player (`p1` Nam `virtualGamesOffset: 0`, `p2` Nữ `virtualGamesOffset: 0`),
      - 1 `pairRule`: `{ id: 'r1', playerAId: 'p1', playerBId: 'p2', type: 'LOCK_PARTNER' }`,
      - 1 `history`: `{ id: 'h1', courtId: 'court-1', type: 'SINGLES', team1: ['p1'], team2: ['p2'], slotSource: { p1: 'AUTO', p2: 'AUTO' }, startedAt: 1000, endedAt: 2000, durationMinutes: 10 }`,
      - 1 `readyQueue`: `{ id: 'q1', courtId: 'court-1', isLockedByHost: false, createdAt: 1000, lineup: { type: 'SINGLES', team1: ['p1'], team2: ['p2'], slotSource: { p1: 'AUTO', p2: 'AUTO' } } }`.
    - Kiểm tra clone giống hệt: `areSessionSnapshotsEqual(base, structuredClone(base))` → `true`.
    - Tạo 7 bản sao, mỗi bản chỉ sửa đúng 1 điểm và đều kỳ vọng `areSessionSnapshotsEqual(base, variant)` trả về `false`:
      1. Đổi `players[0].sex = 'F'` → `false`
      2. Đổi `players[0].virtualGamesOffset = 2` → `false`
      3. Đổi `courts[0].name = 'Sân VIP'` → `false`
      4. Đổi `settings.weights.skillBalanceMultiplier = 99` → `false`
      5. Đổi `pairRules[0]` thành `{ id: 'r2', playerAId: 'p1', playerBId: 'p2', type: 'AVOID_PARTNER' }` (cùng length = 1) → `false`
      6. Đổi `history[0].id = 'h2'` (cùng length = 1) → `false`
      7. Đổi `readyQueue[0].courtId = 'court-2'` (cùng length = 1) → `false`
  - **Test 11**:
    - Vào phòng `'SAN-49'` (`CO_HOST`) với `baseState` có 1 player `p1` (`sex: 'M'`). Chạy `await vi.runAllTimersAsync()`, `mockUpsertRoom.mockClear()`.
    - Rerender với state mới chỉ đổi `players[0].sex = 'F'`.
    - Tua đồng hồ `300ms`.
    - **Kết quả mong đợi**: `expect(mockUpsertRoom).toHaveBeenCalledTimes(1)` và `mockUpsertRoom.mock.calls[0][0].session_data.players[0].sex === 'F'`.

### KHÔNG được đụng vào
- Không so sánh `undoStack`, `redoStack`, hoặc `schemaVersion` bên trong `areSessionSnapshotsEqual` (chúng không phải dữ liệu đồng bộ giữa các máy).
- Không sửa các đoạn code vừa hoàn tất ở mục A1 (`hasPendingLocalChangeRef`, `leaveRoom`).
- Không sửa `useEffect` số 2 hay số 3 trong `src/hooks/useCloudRoom.ts`.
- Không sửa `src/services/supabaseSync.ts`.

### Rule nào trong CLAUDE.md liên quan, và vì sao spec không vi phạm
- **Rule 3 (Chống Vòng Lặp Reset Dữ LiỆU Cloud Sync - CRITICAL)**: Bổ sung các trường dữ liệu thật vào `areSessionSnapshotsEqual` vẫn giữ tính đối xứng & lũy thừa (2 snapshot giống nhau luôn trả `true` nên không bao giờ tạo vòng lặp ping-pong), không đụng vào dependency array của `useEffect` kết nối phòng, và đảm bảo thay đổi thật của Co-Host không bị bỏ sót.

### CÁCH TỰ THỬ BẰNG TAY trên app
1. Mở app trên **2 điện thoại** (hoặc 2 cửa sổ trình duyệt) cùng vào **1 Phòng Online** (máy 1 là **Co-Host**, máy 2 là **Chỉ xem** hoặc **Co-Host**).
2. Trên **máy 1**, mở tab **Hàng chờ**, chọn 1 người chơi bất kỳ đang hiện nút **♂ Nam** rồi bấm 1 chạm để đổi sang **♀ Nữ** (không bấm thêm thao tác nào khác).
3. Chờ khoảng 1 giây rồi nhìn tab **Hàng chờ** trên **máy 2**:
   - **Kết quả đúng**: Người chơi đó trên **máy 2** tự động đổi từ **♂ Nam** sang **♀ Nữ** (trước khi sửa thì máy 2 vẫn kẹt nguyên là **♂ Nam** mãi mãi).
4. Thử thêm với tab **Luật cặp**: xóa 1 luật cũ rồi thêm ngay 1 luật mới khác (tổng số luật giữ nguyên) trên **máy 1** → kiểm tra **máy 2** cập nhật đúng luật mới.

### Commit message đề xuất
```text
fix(cloud): compare player sex, virtualGamesOffset, court name, weights, and list items in snapshot equality (A4)
```

---

## Lệnh kiểm tra bắt buộc (Pre-Commit Harness Gate — Rule 5)

Sau khi hoàn thành **từng mục** và sau khi hoàn thành **toàn bộ Đợt 1**, bắt buộc chạy lệnh sau và đảm bảo vượt qua 100% (`tsc -b`, `vitest run`, `vite build` đều 0 lỗi):

```bash
npm run check:harness
```
