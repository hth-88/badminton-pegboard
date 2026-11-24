# SPEC ĐỢT 2 — VÁ LỖI LÕI & CA BIÊN (A5, A6, A9, B4, B5, B2, B3, B7, A8, B6)

> **Đối tượng đọc**:
> - **Chủ dự án (không biết lập trình)**: Đọc phần **GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE** của từng mục để nắm rõ lỗi được sửa và kết quả mong đợi.
> - **Model thực thi (coding agent)**: Làm **lần lượt từng mục theo đúng thứ tự** trong file này (`A5 → A6 → A9 → B4 → B5 → B2 → B3 → B7 → A8 → B6`). Không tự ý refactor ngoài phạm vi từng mục, không sửa `CLAUDE.md`, không sửa/xóa test có sẵn. Chạy `npm run check:harness` sau mỗi mục và `git commit` theo đúng commit message đề xuất nếu xanh.

---

## Thứ tự thực hiện & phân chia đợt 2a / 2b

### Đợt 2a — Reducer & State Integrity (`A5 → A6 → A9 → B4 → B5`)
| Thứ tự | ID | File sửa chính |
| :---: | :---: | :--- |
| 1 | **A5** | `src/engine/sessionReducer.ts` (`SWAP_PLAYERS`) |
| 2 | **A6** | `src/engine/sessionReducer.ts` (`REARRANGE_NEXT_UP`) |
| 3 | **A9** | `src/engine/sessionReducer.ts` (`UPDATE_COURT`), `src/engine/matchmaker.ts`, `src/engine/nextUp.ts` (`canSuggestNextUp`) |
| 4 | **B4** | `src/engine/sessionReducer.ts` (`DELETE_HISTORY_MATCH`) |
| 5 | **B5** | `src/engine/sessionReducer.ts` (no-op guards cho `REARRANGE_NEXT_UP`, `CLEAR_NEXT_UP`, `SET_NEXT_UP_SLOT`, `DEQUEUE_READY_QUEUE`, `REORDER_READY_QUEUE`, `REMOVE_PAIR_RULE`) |

### Đợt 2b — Cloud Sync, Migration & Matchmaker/NextUp (`B2 → B3 → B7 → A8 → B6`)
| Thứ tự | ID | File sửa chính |
| :---: | :---: | :--- |
| 6 | **B2** | `src/hooks/useCloudRoom.ts` (`joinRoom`, `setShowPinPrompt`) |
| 7 | **B3** | `src/engine/stateMigration.ts` (`migrateSessionState`) |
| 8 | **B7** | `src/hooks/useCloudRoom.ts` (bảo toàn thay đổi local pending khi F5 auto-reconnect; **không sửa `CLAUDE.md`**) |
| 9 | **A8** | `src/engine/matchmaker.ts` (`suggestNextUpForCourt`), `src/engine/nextUp.ts` (`canSuggestNextUp`) |
| 10 | **B6** | `src/engine/nextUp.ts` (`getSlotCandidateStatus`, `evaluateNextUp`) |

---

## 1. Mục A5 — `SWAP_PLAYERS` quên reset `waitStreak` và quên dọn `nextUp` sân khác / `readyQueue`

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Khi một trận đang diễn ra trên Sân 1 và Host bấm đổi 1 người đang đánh bằng một người khác từ ngoài hàng chờ (`SWAP_PLAYERS`), app đưa người mới vào sân nhưng quên xóa bộ đếm "số lượt ngồi chờ" (`waitStreak`) của họ về `0` và cũng quên gỡ tên họ khỏi khung "Lượt kế tiếp" của Sân 2 / hàng đợi sẵn sàng. Hậu quả là hết trận người đó vẫn có điểm chờ cao bất thường và vẫn còn tên kẹt ở sân khác. Sau khi sửa, người vừa vào thay giữa trận được reset `waitStreak = 0` và dọn sạch khỏi `nextUp` các sân khác + `readyQueue` giống hệt lúc bắt đầu trận bình thường.

### File + tên hàm cần sửa
- `src/engine/sessionReducer.ts` — `badmintonReducer`, nhánh `case 'SWAP_PLAYERS':`

### Code trước / code sau
File `src/engine/sessionReducer.ts` (trong `case 'SWAP_PLAYERS':`, sau đoạn `validateLineup` và cập nhật `updatedCourts`):

**Code trước:**
```ts
      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          currentMatch: c.currentMatch ? { ...c.currentMatch, ...newLineup } : null,
        };
      });

      return {
        ...baseNextState,
        courts: updatedCourts,
      };
```

**Code sau:**
```ts
      const swappedInPlayerId = 'playerId' in slot2 ? slot2.playerId : null;

      const updatedPlayers = swappedInPlayerId
        ? baseNextState.players.map((p) =>
            p.id === swappedInPlayerId ? { ...p, waitStreak: 0 } : p
          )
        : baseNextState.players;

      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id === courtId) {
          return {
            ...c,
            currentMatch: c.currentMatch ? { ...c.currentMatch, ...newLineup } : null,
          };
        }
        if (swappedInPlayerId && c.nextUp && Array.isArray(c.nextUp.slots) && c.nextUp.slots.includes(swappedInPlayerId)) {
          const newSlots = c.nextUp.slots.map((id) => (id === swappedInPlayerId ? null : id));
          const newSource = (c.nextUp.slotSource || []).map((src, idx) =>
            c.nextUp.slots[idx] === swappedInPlayerId ? null : src
          );
          return {
            ...c,
            nextUp: {
              ...c.nextUp,
              slots: newSlots,
              slotSource: newSource,
            },
          };
        }
        return c;
      });

      const updatedReadyQueue = swappedInPlayerId
        ? baseNextState.readyQueue.filter(
            (item) =>
              !item.lineup.team1.includes(swappedInPlayerId) &&
              !item.lineup.team2.includes(swappedInPlayerId)
          )
        : baseNextState.readyQueue;

      return {
        ...baseNextState,
        players: updatedPlayers,
        courts: updatedCourts,
        readyQueue: updatedReadyQueue,
      };
```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/reducerFixes.test.ts` (thêm `describe('5) Mục A5: SWAP_PLAYERS reset waitStreak & dọn nextUp/readyQueue', ...)` ở cuối `describe` chính)
- **Test**:
  1. `SWAP_PLAYERS đưa người từ ngoài vào currentMatch -> reset waitStreak = 0, xóa khỏi nextUp sân khác (giữ nguyên 3 slot còn lại) và xóa khỏi readyQueue`
  2. `SWAP_PLAYERS hoán đổi 2 người nội bộ trên cùng sân -> không chạm nextUp sân khác và không xóa readyQueue`

### KHÔNG được đụng vào
- Không sửa `applyStartMatch` hay `validateLineup`.
- Không tự động xóa người khỏi `nextUp` của chính `courtId` khi swap.

### Commit message đề xuất
```text
fix(reducer): reset waitStreak and clean other nextUp/readyQueue on SWAP_PLAYERS (A5)
```

---

## 2. Mục A6 — `REARRANGE_NEXT_UP` làm nhảy sai nhãn `MANUAL` sau khi xếp tay

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Khi Host tự chọn tay 1 người ở Next Up (gắn nhãn khóa tay `MANUAL`) rồi bấm nút **Đảo cặp** hoặc **Cân kèo** (`REARRANGE_NEXT_UP`), danh sách 4 người được xếp lại vị trí nhưng nhãn `MANUAL` lại đứng yên ở vị trí ô cũ, khiến nhãn khóa tay gắn nhầm sang người khác. Sau khi sửa, nhãn `AUTO`/`MANUAL` sẽ đi theo đúng người chơi ở vị trí mới.

### File + tên hàm cần sửa
- `src/engine/sessionReducer.ts` — `badmintonReducer`, nhánh `case 'REARRANGE_NEXT_UP':`

### Code trước / code sau
File `src/engine/sessionReducer.ts`:

**Code trước:**
```ts
      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          nextUp: {
            ...c.nextUp,
            slots: newSlots,
          },
        };
      });
```

**Code sau:**
```ts
      const sourceByPlayer = new Map<string, 'AUTO' | 'MANUAL' | null>();
      targetCourt.nextUp.slots.forEach((pid, idx) => {
        if (pid) {
          sourceByPlayer.set(pid, targetCourt.nextUp.slotSource?.[idx] ?? 'AUTO');
        }
      });
      const newSlotSource = newSlots.map((pid) =>
        pid ? (sourceByPlayer.get(pid) ?? 'AUTO') : null
      );

      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          nextUp: {
            ...c.nextUp,
            slots: newSlots,
            slotSource: newSlotSource,
          },
        };
      });
```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/nextUpRedesign.test.ts` (thêm test `12. Mục A6: ...` ở cuối `describe`)
- **Test**:
  - Gán 4 người `p1..p4` (`p1` có `MANUAL`, `p2..p4` có `AUTO`, với `p1` trình `xs`, `p2` trình `tb`, `p3` trình `yeu`, `p4` trình `tb`), chạy `REARRANGE_NEXT_UP` mode `ROTATE` và `BALANCE` → kiểm tra vị trí mới của `p1` luôn có `slotSource === 'MANUAL'`, 3 người còn lại giữ `'AUTO'`.

### KHÔNG được đụng vào
- Không sửa `rotatePairing` và `balancePairing` trong `src/engine/nextUp.ts`.

### Commit message đề xuất
```text
fix(reducer): preserve per-player slotSource labels during REARRANGE_NEXT_UP (A6)
```

---

## 3. Mục A9 — Tắt sân trong `SPLIT_COURT` làm mồ côi người chơi & đồng bộ bộ lọc `canSuggestNextUp`

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Ở chế độ **Chia sân riêng (`SPLIT_COURT`)**, nếu một số người được gán vào Sân 2 nhưng giữa buổi Host tắt Sân 2, những người đó không được trả về nhóm chung (`ALL`) nên Sân 1 không bao giờ xếp được họ. Đồng thời, nút kiểm tra đủ người trước khi gợi ý (`canSuggestNextUp`) chưa lọc theo sân gán riêng (`assignedPool`) và người từ chối đánh đơn (`noSingles`), nên có thể báo "đủ người" sai trong khi thuật toán không xếp được kèo.

### File + tên hàm cần sửa
1. `src/engine/sessionReducer.ts` — `case 'UPDATE_COURT':` (khi `isDeactivating` chuyển `assignedPool === courtId` về `'ALL'`)
2. `src/engine/matchmaker.ts` — `suggestNextUpForCourt` (coi `assignedPool` trỏ tới sân không active như `'ALL'`)
3. `src/engine/nextUp.ts` — `canSuggestNextUp` (đồng bộ bộ lọc `SPLIT_COURT` và `noSingles` khi mục tiêu là `SINGLES`)

### Code trước / code sau

**File 1** — `src/engine/sessionReducer.ts` (trong `case 'UPDATE_COURT':`):

**Code trước:**
```ts
      let nextReadyQueue = baseNextState.readyQueue;
      if (isDeactivating) {
        nextReadyQueue = nextReadyQueue.map((item) =>
          item.courtId === courtId ? { ...item, courtId: undefined } : item
        );
      }

      let nextState: BadmintonSessionState = {
        ...baseNextState,
        courts: updatedCourts,
        readyQueue: nextReadyQueue,
        autoSinglesSnooze: nextAutoSnooze,
      };
```

**Code sau:**
```ts
      let nextReadyQueue = baseNextState.readyQueue;
      let nextPlayers = baseNextState.players;
      if (isDeactivating) {
        nextReadyQueue = nextReadyQueue.map((item) =>
          item.courtId === courtId ? { ...item, courtId: undefined } : item
        );
        nextPlayers = nextPlayers.map((p) =>
          p.assignedPool === courtId ? { ...p, assignedPool: 'ALL' as const } : p
        );
      }

      let nextState: BadmintonSessionState = {
        ...baseNextState,
        players: nextPlayers,
        courts: updatedCourts,
        readyQueue: nextReadyQueue,
        autoSinglesSnooze: nextAutoSnooze,
      };
```

**File 2** — `src/engine/matchmaker.ts` (trong `suggestNextUpForCourt`):

**Code trước:**
```ts
  // 3. Pool chính (ưu tiên): ACTIVE, không thi đấu ở bất kỳ sân nào, không nằm trong nextUp sân khác
  const primaryAvailable = state.players.filter((p) => {
    if (p.status !== 'ACTIVE') return false;
    if (playingPlayerIds.has(p.id)) return false;
    if (otherNextUpPlayerIds.has(p.id)) return false;
    if (state.settings.courtMode === 'SPLIT_COURT') {
      return p.assignedPool === court.id || p.assignedPool === 'ALL';
    }
    return true;
  });

  // 4. Pool mở rộng (khi thiếu người): ACTIVE, không thi đấu ở bất kỳ sân nào, nhưng đang ở nextUp sân khác
  const secondaryAvailable = state.players.filter((p) => {
    if (p.status !== 'ACTIVE') return false;
    if (playingPlayerIds.has(p.id)) return false;
    if (!otherNextUpPlayerIds.has(p.id)) return false;
    if (state.settings.courtMode === 'SPLIT_COURT') {
      return p.assignedPool === court.id || p.assignedPool === 'ALL';
    }
    return true;
  });
```

**Code sau:**
```ts
  const activeCourtIdSet = new Set(state.courts.filter((c) => c.isActive).map((c) => c.id));
  const matchesCourtPool = (p: Player) =>
    state.settings.courtMode !== 'SPLIT_COURT' ||
    p.assignedPool === court.id ||
    p.assignedPool === 'ALL' ||
    !activeCourtIdSet.has(p.assignedPool);

  // 3. Pool chính (ưu tiên): ACTIVE, không thi đấu ở bất kỳ sân nào, không nằm trong nextUp sân khác
  const primaryAvailable = state.players.filter((p) => {
    if (p.status !== 'ACTIVE') return false;
    if (playingPlayerIds.has(p.id)) return false;
    if (otherNextUpPlayerIds.has(p.id)) return false;
    return matchesCourtPool(p);
  });

  // 4. Pool mở rộng (khi thiếu người): ACTIVE, không thi đấu ở bất kỳ sân nào, nhưng đang ở nextUp sân khác
  const secondaryAvailable = state.players.filter((p) => {
    if (p.status !== 'ACTIVE') return false;
    if (playingPlayerIds.has(p.id)) return false;
    if (!otherNextUpPlayerIds.has(p.id)) return false;
    return matchesCourtPool(p);
  });
```

**File 3** — `src/engine/nextUp.ts` (hàm `canSuggestNextUp`):

**Code trước:**
```ts
export function canSuggestNextUp(state: BadmintonSessionState, courtId: string): boolean {
  const court = state.courts.find((c) => c.id === courtId);
  if (!court || !court.isActive) return false;

  const busyInCurrentMatches = new Set<string>();
  for (const c of state.courts) {
    if (c.isActive && c.currentMatch) {
      c.currentMatch.team1.forEach((id) => busyInCurrentMatches.add(id));
      c.currentMatch.team2.forEach((id) => busyInCurrentMatches.add(id));
    }
  }

  // Tập người rảnh (không đang đánh trực tiếp trên bất kỳ sân nào)
  const availableOutside = state.players.filter(
    (p) => p.status === 'ACTIVE' && !busyInCurrentMatches.has(p.id)
  );

  let totalPotential = availableOutside.length;
  if (court.currentMatch) {
    totalPotential += court.currentMatch.team1.length + court.currentMatch.team2.length;
  }

  const targetType = resolveTargetMatchType(court, state, totalPotential);
  const needed = targetType === 'SINGLES' ? 2 : 4;

  return totalPotential >= needed;
}
```

**Code sau:**
```ts
export function canSuggestNextUp(state: BadmintonSessionState, courtId: string): boolean {
  const court = state.courts.find((c) => c.id === courtId);
  if (!court || !court.isActive) return false;

  const activeCourtIdSet = new Set(state.courts.filter((c) => c.isActive).map((c) => c.id));
  const matchesCourtPool = (p: Player) =>
    state.settings?.courtMode !== 'SPLIT_COURT' ||
    p.assignedPool === court.id ||
    p.assignedPool === 'ALL' ||
    !activeCourtIdSet.has(p.assignedPool);

  const busyInCurrentMatches = new Set<string>();
  for (const c of state.courts) {
    if (c.isActive && c.currentMatch) {
      c.currentMatch.team1.forEach((id) => busyInCurrentMatches.add(id));
      c.currentMatch.team2.forEach((id) => busyInCurrentMatches.add(id));
    }
  }

  // Tập người rảnh hợp lệ với pool của sân này
  const availableOutside = state.players.filter(
    (p) => p.status === 'ACTIVE' && !busyInCurrentMatches.has(p.id) && matchesCourtPool(p)
  );

  const playerMap = new Map(state.players.map((p) => [p.id, p]));
  const currentCourtActivePlayers: Player[] = [];
  if (court.currentMatch) {
    for (const pid of [...court.currentMatch.team1, ...court.currentMatch.team2]) {
      const p = playerMap.get(pid);
      if (p && p.status === 'ACTIVE') {
        currentCourtActivePlayers.push(p);
      }
    }
  }

  const potentialPool = [...availableOutside, ...currentCourtActivePlayers];
  const totalPotential = potentialPool.length;
  const targetType = resolveTargetMatchType(court, state, totalPotential);

  if (targetType === 'SINGLES') {
    const singlesEligibleCount = potentialPool.filter((p) => !p.noSingles).length;
    return singlesEligibleCount >= 2;
  }

  return totalPotential >= 4;
}
```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/step1D.test.ts` (thêm test `l) Mục A9: ...`)
- **Test**:
  1. Trong `SPLIT_COURT`, tắt Sân 2 (`UPDATE_COURT` `isActive: false`) chuyển `assignedPool === 'court-2'` về `'ALL'`, `suggestNextUpForCourt(state, 'court-1', 1000)` xếp được họ.
  2. Khi Sân 2 đang bật nhưng tất cả 4 người đang rảnh đều thuộc `'court-2'`, `canSuggestNextUp(state, 'court-1') === false`.
  3. Khi Sân 1 đang forced `'SINGLES'` và có 2 người rảnh nhưng 1 người `noSingles: true`, `canSuggestNextUp(state, 'court-1') === false`.

### Commit message đề xuất
```text
fix(engine): reassign deactivated court pool to ALL and sync canSuggestNextUp filters (A9)
```

---

## 4. Mục B4 — `DELETE_HISTORY_MATCH` không tính lại `lastPlayedAt`

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Khi Host xóa một trận đã ghi nhầm trong lịch sử (`DELETE_HISTORY_MATCH`), số trận của người chơi được trừ đi nhưng thời điểm đánh trận gần nhất (`lastPlayedAt`) vẫn giữ mốc giờ của trận vừa xóa, làm ảnh hưởng thứ tự ưu tiên chờ. Sau khi sửa, `lastPlayedAt` của các người chơi liên quan được tính lại từ trận gần nhất còn lại trong lịch sử (hoặc `0` nếu không còn trận nào).

### File + tên hàm cần sửa
- `src/engine/sessionReducer.ts` — `badmintonReducer`, nhánh `case 'DELETE_HISTORY_MATCH':`

### Code trước / code sau
File `src/engine/sessionReducer.ts`:

**Code trước:**
```ts
      const updatedPlayers = baseNextState.players.map((p) => {
        if (matchPlayerIds.has(p.id)) {
          return {
            ...p,
            gamesPlayed: Math.max(0, p.gamesPlayed - 1),
            singlesCount: match.type === 'SINGLES' ? Math.max(0, p.singlesCount - 1) : p.singlesCount,
          };
        }
        return p;
      });

      const remainingHistory = baseNextState.history.filter((h) => h.id !== matchId);
      const updatedStats = buildStatsFromHistory(remainingHistory);
```

**Code sau:**
```ts
      const remainingHistory = baseNextState.history.filter((h) => h.id !== matchId);
      const updatedStats = buildStatsFromHistory(remainingHistory);

      const maxEndedAtByPlayer = new Map<string, number>();
      for (const h of remainingHistory) {
        for (const pid of [...h.team1, ...h.team2]) {
          const prev = maxEndedAtByPlayer.get(pid) ?? 0;
          if (h.endedAt > prev) {
            maxEndedAtByPlayer.set(pid, h.endedAt);
          }
        }
      }

      const updatedPlayers = baseNextState.players.map((p) => {
        if (matchPlayerIds.has(p.id)) {
          return {
            ...p,
            gamesPlayed: Math.max(0, p.gamesPlayed - 1),
            singlesCount: match.type === 'SINGLES' ? Math.max(0, p.singlesCount - 1) : p.singlesCount,
            lastPlayedAt: maxEndedAtByPlayer.get(p.id) ?? 0,
          };
        }
        return p;
      });
```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/step1D.test.ts` (thêm test `m) Mục B4: ...`)
- **Test**:
  - Có 2 trận `m1` (`endedAt: 2000`, gồm `p1, p2`) và `m2` (`endedAt: 4000`, gồm `p1, p2, p3, p4`). Xóa `m2`: `p1, p2` có `lastPlayedAt === 2000`, `p3, p4` có `lastPlayedAt === 0`.

### Commit message đề xuất
```text
fix(reducer): recompute lastPlayedAt from remaining history in DELETE_HISTORY_MATCH (B4)
```

---

## 5. Mục B5 — Không tạo snapshot Undo rỗng và không xóa `redoStack` khi thao tác không đổi dữ liệu

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Một số thao tác dù không làm thay đổi gì (ví dụ: bấm **Cân kèo** khi cặp đã cân sẵn hoặc khi khung đang là trận Đơn, bấm **Xóa trắng** khi cả 4 ô đã trống sẵn, xóa một phần tử không tồn tại trong danh sách) vẫn ghi thêm 1 bước rỗng vào lịch sử Hoàn tác (`undoStack`) và xóa mất `redoStack`. Sau khi sửa, những thao tác không đổi dữ liệu sẽ trả về nguyên `state` cũ.

*(Ghi chú kiểm chứng: Không thêm no-op guard vào `EDIT_RANK` vì test có sẵn trong `src/engine/__tests__/reducerAndUndo.test.ts:81-89` kiểm tra việc dispatch `EDIT_RANK` 5 lần cùng `'tb+'` phải đẩy đủ 5 snapshot vào `undoStack`.)*

### File + tên hàm cần sửa
- `src/engine/sessionReducer.ts` — các nhánh:
  1. `case 'SET_NEXT_UP_SLOT':`
  2. `case 'REARRANGE_NEXT_UP':`
  3. `case 'CLEAR_NEXT_UP':`
  4. `case 'DEQUEUE_READY_QUEUE':`
  5. `case 'REORDER_READY_QUEUE':`
  6. `case 'REMOVE_PAIR_RULE':`

### Code trước / code sau

1. Trong `case 'SET_NEXT_UP_SLOT':`:
- Khi `playerId === null`:
```ts
      if (playerId === null) {
        if (
          targetCourt.nextUp.slots[slotIndex] === null &&
          targetCourt.nextUp.slotSource[slotIndex] === null
        ) {
          return state;
        }
        const newSlots = [...targetCourt.nextUp.slots];
```
- Khi `playerId !== null` (ngay trước `const status = getSlotCandidateStatus(...)`):
```ts
      if (
        targetCourt.nextUp.slots[slotIndex] === playerId &&
        targetCourt.nextUp.slotSource[slotIndex] === 'MANUAL'
      ) {
        return state;
      }

      const status = getSlotCandidateStatus(baseNextState, courtId, slotIndex, playerId);
```

2. Trong `case 'REARRANGE_NEXT_UP':`:
```ts
      if (
        !targetCourt ||
        targetCourt.nextUp.type !== 'DOUBLES' ||
        !isNextUpComplete(targetCourt.nextUp)
      ) {
        return state;
      }
```
và sau khi tính `newSlots`:
```ts
      const isUnchanged = newSlots.every((id, idx) => id === targetCourt.nextUp.slots[idx]);
      if (isUnchanged) {
        return state;
      }
```

3. Trong `case 'CLEAR_NEXT_UP':`:
```ts
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt) return state;
      if (isNextUpEmpty(targetCourt.nextUp) && (targetCourt.suggestCursor || 0) === 0) {
        return state;
      }
```

4. Trong `case 'DEQUEUE_READY_QUEUE':`:
```ts
    case 'DEQUEUE_READY_QUEUE': {
      if (!baseNextState.readyQueue.some((item) => item.id === action.payload.itemId)) {
        return state;
      }
      return {
        ...baseNextState,
        readyQueue: baseNextState.readyQueue.filter((item) => item.id !== action.payload.itemId),
      };
    }
```

5. Trong `case 'REORDER_READY_QUEUE':`:
```ts
      const { fromIndex, toIndex } = action.payload;
      const queue = [...baseNextState.readyQueue];
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= queue.length ||
        toIndex < 0 ||
        toIndex >= queue.length
      ) {
        return state;
      }
```

6. Trong `case 'REMOVE_PAIR_RULE':`:
```ts
    case 'REMOVE_PAIR_RULE': {
      if (!baseNextState.pairRules.some((r) => r.id === action.payload.ruleId)) {
        return state;
      }
      return {
        ...baseNextState,
        pairRules: baseNextState.pairRules.filter((r) => r.id !== action.payload.ruleId),
         // Mục 4: reset khi đổi luật cặp
      };
    }
```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/reducerFixes.test.ts` (thêm `describe('6) Mục B5: Không tạo undo snapshot rỗng và giữ nguyên redoStack khi no-op', ...)`)
- **Test**:
  - Có sẵn 1 item trong `redoStack`. Thực hiện: `REARRANGE_NEXT_UP` (`BALANCE` khi đã cân nhất & trên sân `SINGLES`), `CLEAR_NEXT_UP` khi đã trống, `SET_NEXT_UP_SLOT` `null` vào ô đã `null`, `DEQUEUE_READY_QUEUE` ID không tồn tại, `REORDER_READY_QUEUE` `fromIndex === toIndex`, `REMOVE_PAIR_RULE` ID không tồn tại → tất cả phải `expect(res).toBe(state)`, `undoStack` không tăng, `redoStack` giữ nguyên.

### Commit message đề xuất
```text
fix(reducer): return original state without pushing undo snapshot on no-op actions (B5)
```

---

## 6. Mục B2 — Không lưu `pin_code` vào state của `VIEWER` & xóa `pendingActionRef` khi hủy nhập PIN

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Khi người dùng vào phòng ở chế độ **Chỉ xem (`VIEWER`)**, app không nên giữ mã `pin_code` của chủ phòng trong bộ nhớ hiển thị (`pinCode`). Ngoài ra, nếu `VIEWER` bấm nhầm một nút điều khiển khiến hộp thoại nhập PIN hiện lên, rồi bấm **Hủy**, thao tác bị chặn trước đó vẫn còn lưu ngầm; nếu lúc sau người đó mở khóa Co-Host thì thao tác cũ tự động chạy ngoài ý muốn. Sau khi sửa, `pinCode` chỉ được lưu khi là `CO_HOST`, và việc đóng hộp thoại nhập PIN sẽ xóa sạch `pendingActionRef`.

### File + tên hàm cần sửa
- `src/hooks/useCloudRoom.ts` — `joinRoom` và wrapper `handleSetShowPinPrompt` trả ra dưới tên `setShowPinPrompt`

### Code trước / code sau

**Vị trí 1** (`joinRoom`):
**Code trước:**
```ts
      setRoomCode(cleanCode);
      setPinCode(roomData.pin_code);
      setRole(assignedRole);
```
**Code sau:**
```ts
      setRoomCode(cleanCode);
      setPinCode(isCoHost ? roomData.pin_code : null);
      setRole(assignedRole);
```

**Vị trí 2** (`setShowPinPrompt` trả về từ `useCloudRoom`):
**Code trước:**
```ts
  const [showPinPrompt, setShowPinPrompt] = useState<boolean>(false);
```
và ở `return { ... }`:
```ts
    showPinPrompt,
    setShowPinPrompt,
```
**Code sau:**
```ts
  const [showPinPrompt, setShowPinPromptState] = useState<boolean>(false);
  const setShowPinPrompt = useCallback((open: boolean) => {
    if (!open) {
      pendingActionRef.current = null;
    }
    setShowPinPromptState(open);
  }, []);
```
*(Bên trong `upgradeToCoHost` dòng `setShowPinPrompt(false)` và `guardAction` dòng `setShowPinPrompt(true)` giữ nguyên vì `pendingActionRef.current` đã chạy xong ở dòng 511–512 trước `setShowPinPrompt(false)`.)*

### Test cần thêm
- **Tên file**: `src/hooks/__tests__/useCloudRoomSync.test.ts` (thêm test `12. Mục B2: ...`)
- **Test**:
  1. `joinRoom('SAN-49')` (VIEWER) -> `pinCode === null`, `role === 'VIEWER'`.
  2. `VIEWER` gọi `guardAction(spy)` -> `showPinPrompt === true`; gọi `setShowPinPrompt(false)` (hủy); sau đó gọi `upgradeToCoHost('1234')` -> `pinCode === '1234'`, `role === 'CO_HOST'`, nhưng `spy` gọi `0` lần!

### Commit message đề xuất
```text
fix(cloud): keep pinCode null for VIEWER and clear pendingActionRef when closing PIN prompt (B2)
```

---

## 7. Mục B3 — `migrateSessionState` giữ nguyên người trùng giữa các `nextUp` khác nhau

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
App cho phép Host mượn tạm một người đang chờ ở Next Up Sân 1 đưa sang Next Up Sân 2 (kèm cảnh báo vàng). Tuy nhiên mỗi lần đồng bộ nhận snapshot từ Cloud (`LOAD_STATE`), hàm dọn dữ liệu `migrateSessionState` lại xóa người trùng ở sân phía sau, làm mất slot vừa xếp. Sau khi sửa, hàm chỉ khử trùng trong nội bộ từng sân (và vẫn chặn người đang đánh `currentMatch` ở sân khác).

### File + tên hàm cần sửa
- `src/engine/stateMigration.ts` — hàm `migrateSessionState` (vòng lặp `for (const c of courts)`)

### Code trước / code sau
File `src/engine/stateMigration.ts`:

**Code trước:**
```ts
  const seenNextUpPlayerIds = new Set<string>();

  for (const c of courts) {
    if (!c.nextUp) {
      c.nextUp = createEmptyNextUp(c.forcedType || (c.policy === 'SINGLES_ONLY' ? 'SINGLES' : 'DOUBLES'));
    }
    const slots = [...c.nextUp.slots];
```

**Code sau:**
```ts
  for (const c of courts) {
    const seenNextUpPlayerIds = new Set<string>();
    if (!c.nextUp) {
      c.nextUp = createEmptyNextUp(c.forcedType || (c.policy === 'SINGLES_ONLY' ? 'SINGLES' : 'DOUBLES'));
    }
    const slots = [...c.nextUp.slots];
```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/migrationRegression.test.ts` (thêm test `preserves player shared across two different courts nextUp while deduplicating within same court`)
- **Test**:
  - `court-1.nextUp.slots = ['p1', 'p2', 'p3', 'p4']`, `court-2.nextUp.slots = ['p1', 'p1', 'p3', null]` → sau `migrateSessionState`, `court-1` giữ `['p1', 'p2', 'p3', 'p4']`, `court-2` giữ `['p1', null, 'p3', null]` (`p1` được giữ giữa 2 sân, nhưng ô trùng trong cùng `court-2` bị xóa).

### Commit message đề xuất
```text
fix(migration): allow shared players across different court nextUp drafts in migrateSessionState (B3)
```

---

## 8. Mục B7 — Bảo toàn thay đổi local chưa kịp đồng bộ khi F5 trong lúc debounce 250ms

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Khi Co-Host vừa bấm thao tác sửa trên máy và bấm **F5 (tải lại trang)** ngay trong vòng chưa tới 0,25 giây (trước khi kịp đẩy lên Supabase), app khởi động lại sẽ tự kết nối phòng và tải bản cũ từ Cloud về đè mất thao tác vừa làm trong `localStorage`. Sau khi sửa, app lưu dấu thời gian thay đổi local chưa đẩy (`pending_ts`) và khi tự động kết nối lại phòng lúc F5, nếu bản local mới hơn bản trên Cloud thì giữ nguyên dữ liệu local và đẩy lên Cloud thay vì bị ghi đè.

*(Lưu ý: Theo LUẬT CỨNG, **KHÔNG sửa `CLAUDE.md`**.)*

### File + tên hàm cần sửa
- `src/hooks/useCloudRoom.ts` — lưu/xóa `${STORAGE_KEY_CLOUD_ROOM}_pending_ts`, thêm `currentStateRef`, xử lý `isAutoReconnect` trong `joinRoom` và `useEffect` số 2.

### Code trước / code sau

1. Thêm helper nội bộ & `currentStateRef` trong `useCloudRoom`:
   - `const pendingStorageKey = `${STORAGE_KEY_CLOUD_ROOM}_pending_ts`;`
   - `const currentStateRef = useRef(currentState); currentStateRef.current = currentState;`
2. Trong `useEffect` số 4:
   - Khi fast-undo khớp remote / trong `setTimeout` khi `upsertRoom` thành công / trong `leaveRoom` / khi nhận gói Realtime từ xa ở `useEffect` số 3: xóa `localStorage.removeItem(pendingStorageKey)`.
   - Khi đặt `hasPendingLocalChangeRef.current = true`: ghi `localStorage.setItem(pendingStorageKey, JSON.stringify({ roomCode, updatedAt: Date.now() }))`.
3. Trong `joinRoom(code, pin, options?: { isAutoReconnect?: boolean })`:
   - Khi `options?.isAutoReconnect && isCoHost`: đọc `pendingStorageKey`. Nếu `pending.roomCode === cleanCode && pending.updatedAt > roomData.updated_at && !areSessionSnapshotsEqual(currentStateRef.current, roomData.session_data)`:
     - KHÔNG gọi `onApplyRef.current(roomData.session_data)`!
     - Ghi nhận `lastAppliedTimestampRef.current = roomData.updated_at` và `lastAppliedRemoteSnapshotRef.current = roomData.session_data`.
     - Khi set `roomCode` và `role = 'CO_HOST'`, `useEffect` số 4 sẽ tự động phát hiện khác biệt và đẩy `currentState` mới từ local lên Cloud!
   - Ngược lại (vào phòng bình thường qua nút Join hoặc URL, hoặc Cloud mới hơn/bằng `pending.updatedAt`): giữ nguyên hành vi nạp `roomData.session_data` và xóa `pendingStorageKey`.

### Test cần thêm
- **Tên file**: `src/hooks/__tests__/useCloudRoomSync.test.ts` (thêm test `13. Mục B7: ...`)
- **Test**:
  - Giả lập F5 tự động kết nối lại từ `STORAGE_KEY_CLOUD_ROOM` khi `pending_ts` có `updatedAt: 5000 > roomData.updated_at (1000)` và `currentState` khác `roomData.session_data` → `onApplyCloudState` KHÔNG bị gọi để ghi đè local, và sau `300ms` debounce `mockUpsertRoom` được gọi để đẩy `currentState` mới lên Cloud.

### KHÔNG được đụng vào
- **TUYỆT ĐỐI KHÔNG sửa `CLAUDE.md`**.
- Không sửa dependency array của `useEffect` số 2 (`[joinRoom]`) hay `useEffect` số 3 (`[roomCode, clientId]`).

### Commit message đề xuất
```text
fix(cloud): preserve pending local edits across F5 auto-reconnect during debounce window (B7)
```

---

## 9. Mục A8 — Ca biên số người lẻ / `noSingles` làm tịt gợi ý kèo

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Hiện tại có 2 ca biên khiến nút **Gợi ý kèo** không ra kết quả dù vẫn đủ người đánh:
1. Khi có ≥4 người rảnh nhưng tỉ lệ pha trộn (`mixDebt`) chọn đánh **Đơn**, nếu phần lớn người đó đã đánh dấu **Không đánh đơn (`noSingles`)** khiến không đủ 2 người đánh đơn, app trả về trống thay vì tự chuyển về gợi ý trận **Đôi** (khi sân không khóa cứng đánh Đơn).
2. Khi thiếu người và cần mượn thêm từ Next Up sân khác (`secondaryAvailable`), app không sắp xếp người mượn theo độ ưu tiên chờ (`sortPlayersByWaitPriority`) và dừng vòng lặp ngay khi đủ tổng số người mà không kiểm tra `noSingles` khi đang tìm kèo Đơn.

### File + tên hàm cần sửa
1. `src/engine/matchmaker.ts` — `suggestNextUpForCourt`
2. `src/engine/nextUp.ts` — `canSuggestNextUp` (cho phép fallback sang `DOUBLES` khi sân không khóa cứng `SINGLES` và `totalPotential >= 4`)

### Code trước / code sau

**File 1** — `src/engine/matchmaker.ts` (trong `suggestNextUpForCourt`):
- Sắp xếp `const sortedSecondary = sortPlayersByWaitPriority(secondaryAvailable);`
- Tách hàm cục bộ `buildProposalsForType(type: MatchType)` bên trong `suggestNextUpForCourt`:
  - Xây dựng `effectiveAvailable` cho `type` (`needed = type === 'SINGLES' ? 2 : 4`):
    - Bắt đầu từ `primaryAvailable` (hoặc `proj.projectedAvailable` nếu cần dự kiến từ `court.currentMatch`).
    - Nếu thiếu (`type === 'SINGLES'` kiểm tra số người `!p.noSingles < 2`; `type === 'DOUBLES'` kiểm tra `length < 4`), mượn từ `sortedSecondary`:
      - Với `SINGLES`: chỉ mượn người `!p.noSingles` cho đến khi đủ 2 người hợp lệ đánh đơn.
      - Với `DOUBLES`: mượn cho đến khi đủ 4 người.
  - Sinh `rawProposals` bằng `generateSinglesProposals` hoặc `generateDoublesProposals`.
- Kiểm tra:
  ```ts
  const isHardLockedSingles =
    court.forcedType === 'SINGLES' ||
    court.policy === 'SINGLES_ONLY' ||
    (state.settings?.matchMix?.singles === 1 && court.forcedType !== 'DOUBLES') ||
    court.nextUp?.type === 'SINGLES';
  ```
- Chạy `buildProposalsForType(matchType)`. Nếu `matchType === 'SINGLES' && rawProposals.length === 0 && !isHardLockedSingles`, thử fallback `matchType = 'DOUBLES'` và chạy lại `buildProposalsForType('DOUBLES')`.

**File 2** — `src/engine/nextUp.ts` (trong `canSuggestNextUp`):
- Khi `targetType === 'SINGLES'`:
  ```ts
  if (targetType === 'SINGLES') {
    const singlesEligibleCount = potentialPool.filter((p) => !p.noSingles).length;
    if (singlesEligibleCount >= 2) return true;
    const isHardLockedSingles =
      court.forcedType === 'SINGLES' ||
      court.policy === 'SINGLES_ONLY' ||
      (state.settings?.matchMix?.singles === 1 && court.forcedType !== 'DOUBLES') ||
      court.nextUp?.type === 'SINGLES';
    return !isHardLockedSingles && totalPotential >= 4;
  }
  ```

### Test cần thêm
- **Tên file**: `src/engine/__tests__/matchmaker1B.test.ts` (thêm 2 test ở cuối `describe`)
- **Test**:
  1. `Mục A8: 5 người rảnh, mixDebt chọn SINGLES nhưng 4 người noSingles -> fallback sang DOUBLES thay vì trả null`
  2. `Mục A8: mượn từ secondaryAvailable cho SINGLES sắp xếp theo waitPriority và bỏ qua người noSingles để lấy đúng người hợp lệ`

### Commit message đề xuất
```text
fix(matchmaker): sort secondary pool by wait priority, filter noSingles, and fallback SINGLES to DOUBLES (A8)
```

---

## 10. Mục B6 — Cảnh báo luật cặp (`AVOID_PARTNER`/`AVOID_MATCH`) và cảnh báo trận `SINGLES` khi xếp tay

### GIẢI THÍCH CHO NGƯỜI KHÔNG BIẾT CODE
Khi Host xếp tay người chơi vào Next Up, app mới chỉ cảnh báo trùng đồng đội, chênh trình và lệch giới cho trận Đôi 4 người, mà quên cảnh báo khi chọn người vi phạm luật cặp (**Cấm cùng đội** / **Hạn chế chung sân**), khi chọn người **Từ chối đánh đơn** vào sân Đơn, hoặc khi xếp trận Đơn bị chênh trình lớn. Tương tự, thanh đánh giá nhanh dưới khung Next Up (`evaluateNextUp`) cũng đang bỏ qua hoàn toàn trận Đơn. Sau khi sửa, cả hai nơi đều hiển thị cảnh báo mềm đầy đủ (chỉ cảnh báo, không chặn quyền chọn tay của Host).

### File + tên hàm cần sửa
- `src/engine/nextUp.ts` — `getSlotCandidateStatus` và `evaluateNextUp`

### Code trước / code sau

**Vị trí 1** — `getSlotCandidateStatus` (`src/engine/nextUp.ts`):
Trong khối `if (thisCourt?.nextUp)`:
- Kiểm tra `state.pairRules` trên `simSlots`:
  - Với `AVOID_MATCH`: nếu có người khác trong `simSlots` (ở slot `idx !== slotIndex`) có luật `AVOID_MATCH` với `playerId` → `warnings.push('Hạn chế chung sân (luật cặp)')`.
  - Với `AVOID_PARTNER` (khi `thisCourt.nextUp.type === 'DOUBLES'`): tìm `partnerSlotIndex = slotIndex === 0 ? 1 : slotIndex === 1 ? 0 : slotIndex === 2 ? 3 : 2`. Nếu `simSlots[partnerSlotIndex]` có luật `AVOID_PARTNER` với `playerId` → `warnings.push('Cấm cùng đội (luật cặp)')`.
- Nếu `thisCourt.nextUp.type === 'SINGLES'`:
  - Nếu `player.noSingles` → `warnings.push('Người chơi từ chối đánh đơn')`.
  - Nếu `filledCount === 2`: tính `diff = Math.abs(s0 - s1)` (với `getEffectiveSkill(..., maleBonus)`). Nếu `diff > 1.5` → `warnings.push(\`Chênh trình: lệch \${diff.toFixed(1)}đ\`)`.
- Giữ nguyên toàn bộ phần `DOUBLES` (`filledCount === 4`) hiện có.

**Vị trí 2** — `evaluateNextUp` (`src/engine/nextUp.ts`):
- Thay vì `if (!nextUp || !isNextUpComplete(nextUp) || nextUp.type !== 'DOUBLES') return null;`:
  - Nếu `nextUp.type === 'SINGLES'` và `isNextUpComplete(nextUp)`:
    - Tính `skillDiff = Number(Math.abs(s0 - s1).toFixed(1))`.
    - `genderPattern`: `'2 Nam'`, `'2 Nữ'`, hoặc `'1 Nam – 1 Nữ'`.
    - `warnings`: thêm `'Chênh lệch trình độ khá lớn (${skillDiff}đ)'` nếu `skillDiff > 1.5`, và `'Có người chơi từ chối đánh đơn'` nếu `p0.noSingles || p1.noSingles`.

### Test cần thêm
- **Tên file**: `src/engine/__tests__/nextUpRedesign.test.ts` (thêm test `13. Mục B6: ...`)
- **Test**:
  1. `getSlotCandidateStatus` trả `selectable: true` kèm warning khi vi phạm `AVOID_PARTNER` (cùng team), `AVOID_MATCH` (chung sân), chọn `noSingles` vào sân `SINGLES`, và chênh trình `SINGLES > 1.5đ`.
  2. `evaluateNextUp` cho trận `SINGLES` hoàn chỉnh trả về `{ skillDiff, genderPattern, warnings }` đầy đủ (cảnh báo chênh trình > 1.5 và `noSingles`).

### Commit message đề xuất
```text
feat(nextUp): add pair-rule, noSingles, and SINGLES skill-diff warnings in candidate status and evaluation (B6)
```
