# BÁO CÁO TOÀN DIỆN: PHÂN TÍCH LỖI VÒNG LẶP RESET DỮ LIỆU CLOUD SYNC & KIỂM TRA LUỒNG SÂN / HÀNG CHỜ
**Thời gian lập báo cáo:** 2026-11-07  
**Dự án:** Xếp Sân Cầu Lông Thông Minh (Badminton Pegboard)  
**Trạng thái kiểm tra Harness:** `check:harness` (`tsc --noEmit && vitest run && vite build`) PASS 100% (140/140 unit tests)

---

## PHẦN 1: NGUYÊN NHÂN CHÍNH XÁC CỦA LỖI RESET DỮ LIỆU KHI MỞ LINK `?room=SAN-49&pin=1234`

### 1.1. Hiện tượng thực tế người dùng gặp phải
- Khi truy cập ứng dụng có tham số phòng trên URL: `https://badminton-pegboard.vercel.app/?room=SAN-49&pin=1234`.
- Người dùng bấm bất kỳ thao tác nào ở Tab Sân (ví dụ: bấm *Gợi ý kèo*, *Cân kèo*, *Đảo cặp*, *Xóa slot*, *Đổi người*) hoặc ở Tab Hàng chờ (thêm người, tạm nghỉ, đổi trình độ):
  1. Thao tác vừa bấm lập tức bị biến mất, dữ liệu bị đưa ngược về trạng thái cũ ban đầu từ Supabase (Reset data loop).
  2. Màn hình liên tục hiện lại thông báo: `"Đã kết nối phòng SAN-49 với quyền CÙNG ĐIỀU KHIỂN (Co-Host)"`.
  3. Trên thông báo kết nối này lại hiển thị nút bấm `[Hoàn tác]` (Undo), gây rối loạn trải nghiệm vận hành.

---

### 1.2. Trích xuất mã nguồn nguyên văn liên quan

#### A. Đoạn code truyền callback trong `src/App.tsx` (dòng 94 - 98):
```tsx
  const {
    roomCode,
    pinCode,
    role,
    syncStatus,
    errorMessage: cloudError,
    showPinPrompt,
    setShowPinPrompt,
    createRoom,
    joinRoom,
    upgradeToCoHost,
    leaveRoom,
    guardAction,
  } = useCloudRoom({
    currentState: state,
    onApplyCloudState: loadCloudState,
    onShowToast: (msg) => setUndoToastMessage(msg),
  });
```

#### B. Đoạn code định nghĩa `joinRoom` trong `src/hooks/useCloudRoom.ts` (dòng 40 - 94):
```tsx
  // 1. Vào phòng có sẵn (Viewer hoặc Co-Host)
  const joinRoom = useCallback(
    async (
      code: string,
      pin?: string
    ): Promise<{ ok: boolean; role: RoomRole; error?: string }> => {
      const cleanCode = code.toUpperCase().trim();
      const cleanPin = pin?.trim() || '';

      setSyncStatus('SYNCING');
      const res = await fetchRoom(cleanCode);

      if (res.error || !res.data) {
        setSyncStatus('ERROR');
        const err = res.error || `Không tìm thấy phòng "${cleanCode}"`;
        setErrorMessage(err);
        return { ok: false, role: 'OFFLINE', error: err };
      }

      const roomData = res.data;
      const isCoHost = Boolean(cleanPin && cleanPin === roomData.pin_code);
      const assignedRole: RoomRole = isCoHost ? 'CO_HOST' : 'VIEWER';

      // Nạp dữ liệu phòng vào ứng dụng
      lastAppliedTimestampRef.current = roomData.updated_at;
      isApplyingRemoteRef.current = true;
      onApplyCloudState(roomData.session_data);

      setRoomCode(cleanCode);
      setPinCode(roomData.pin_code);
      setRole(assignedRole);
      setSyncStatus('SYNCED');
      setErrorMessage(null);

      // Lưu vào localStorage
      try {
        const stored: StoredCloudRoom = {
          roomCode: cleanCode,
          pinCode: isCoHost ? cleanPin : '',
          role: assignedRole,
        };
        localStorage.setItem(STORAGE_KEY_CLOUD_ROOM, JSON.stringify(stored));
      } catch {
        // Bỏ qua
      }

      if (assignedRole === 'CO_HOST') {
        onShowToast?.(`Đã kết nối phòng "${cleanCode}" với quyền CÙNG ĐIỀU KHIỂN (Co-Host)`);
      } else {
        onShowToast?.(`Đã vào phòng "${cleanCode}" ở chế độ CHỈ XEM`);
      }

      return { ok: true, role: assignedRole };
    },
    [onApplyCloudState, onShowToast]
  );
```

#### C. Đoạn code `useEffect` đọc URL params và gọi kết nối trong `src/hooks/useCloudRoom.ts` (dòng 96 - 122):
```tsx
  // 2. Đọc phòng đã lưu hoặc tham số URL (?room=...&pin=...) khi khởi động
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const paramRoom = urlParams.get('room')?.toUpperCase().trim();
    const paramPin = urlParams.get('pin')?.trim();

    if (paramRoom) {
      // Tự động kết nối qua link URL
      joinRoom(paramRoom, paramPin);
      return;
    }

    // Nếu không có URL params, đọc từ localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CLOUD_ROOM);
      if (saved) {
        const parsed = JSON.parse(saved) as StoredCloudRoom;
        if (parsed.roomCode) {
          joinRoom(parsed.roomCode, parsed.pinCode);
        }
      }
    } catch {
      // Bỏ qua lỗi
    }
  }, [joinRoom]);
```

#### D. Đoạn code `useEffect` đẩy dữ liệu 2 chiều lên Supabase trong `src/hooks/useCloudRoom.ts` (dòng 159 - 201):
```tsx
  // 3. Đẩy thay đổi cục bộ lên Supabase (Debounce 250ms, chỉ dành cho CO_HOST)
  useEffect(() => {
    if (!roomCode || role !== 'CO_HOST') {
      return;
    }

    // Nếu thay đổi này vừa được nạp từ máy khác qua realtime, không gửi ngược lại
    if (isApplyingRemoteRef.current) {
      isApplyingRemoteRef.current = false;
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setSyncStatus('SYNCING');

    debounceTimerRef.current = setTimeout(async () => {
      const now = Date.now();
      const res = await upsertRoom({
        room_code: roomCode,
        pin_code: pinCode || '1234',
        session_data: currentState,
        updated_at: now,
        updated_by: clientId,
      });

      if (res.error) {
        setSyncStatus('ERROR');
        setErrorMessage(res.error);
      } else {
        lastAppliedTimestampRef.current = now;
        setSyncStatus('SYNCED');
        setErrorMessage(null);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentState, roomCode, role, pinCode, clientId]);
```

---

### 1.3. Cơ chế kích hoạt lỗi từng bước (Root Cause Step-by-Step)

1. **Inline Function không được memoize tại `App.tsx`**:
   - Trong `App.tsx`, `useCloudRoom` được truyền: `onShowToast: (msg) => setUndoToastMessage(msg)`.
   - Mỗi lần component `App` render lại, arrow function `(msg) => setUndoToastMessage(msg)` là một instance hàm hoàn toàn mới (khác tham chiếu bộ nhớ).

2. **`joinRoom` bị khởi tạo lại liên tục**:
   - Trong `useCloudRoom.ts`, `joinRoom` có dependency array là `[onApplyCloudState, onShowToast]`.
   - Vì `onShowToast` thay đổi tham chiếu ở mỗi lần render, `joinRoom` lập tức bị hủy và gán lại tham chiếu mới.

3. **`useEffect` khởi động bị re-trigger ở MỌI cú click chuột**:
   - `useEffect` đọc tham số URL phụ thuộc vào `[joinRoom]`.
   - Khi người dùng bấm bất kỳ nút nào ở Tab Sân hoặc Hàng chờ:
     + Action được dispatch vào reducer -> `state` thay đổi.
     + `App` re-render -> `onShowToast` đổi tham chiếu -> `joinRoom` đổi tham chiếu.
     + `useEffect` đọc URL params phát hiện `joinRoom` thay đổi -> **Chạy lại ngay lập tức**!
   - Vì trên thanh địa chỉ URL vẫn còn nguyên chuỗi `?room=SAN-49&pin=1234`, `useEffect` lại gọi `joinRoom('SAN-49', '1234')`.

4. **Cuộc đua dữ liệu (Race Condition) và Đè dữ liệu cũ**:
   - `joinRoom` gọi hàm `fetchRoom('SAN-49')` lên Supabase để lấy snapshot phòng.
   - Trong lúc đó, effect đẩy dữ liệu cục bộ lên Supabase (Effect 3) đang bị hoãn lại bởi debounce `250ms` (`setTimeout`).
   - `fetchRoom` trả về bản ghi cũ trên Supabase trước khi bản ghi mới kịp lưu.
   - `joinRoom` gọi `onApplyCloudState(roomData.session_data)` -> kích hoạt reducer `LOAD_STATE`.
   - `LOAD_STATE` đè bẹp toàn bộ thao tác người dùng vừa thực hiện bằng snapshot cũ trên Cloud!
   - Đồng thời, `joinRoom` gọi `onShowToast?.("Đã kết nối phòng SAN-49 với quyền CÙNG ĐIỀU KHIỂN (Co-Host)")`.
   - Do `App.tsx` nối hàm này vào `setUndoToastMessage`, component `<UndoToast>` hiện lên kèm nút `[Hoàn tác]`.

---

## PHẦN 2: TRẠNG THÁI HIỆN TẠI CỦA LUỒNG SÂN & HÀNG CHỜ

### 2.1. Mã nguồn xử lý Next Up trong `sessionReducer.ts`

#### A. Gợi ý đội hình (`SUGGEST_NEXT_UP` - thay thế `CYCLE_NEXT_UP_PROPOSAL` cũ):
*(src/engine/sessionReducer.ts, dòng 785 - 808)*
```tsx
    case 'SUGGEST_NEXT_UP': {
      const { courtId } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt || !targetCourt.isActive) return state;

      const draft = suggestNextUpForCourt(baseNextState, courtId, action.payload.now);
      if (!draft) {
        return state;
      }

      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          nextUp: draft,
          suggestCursor: (c.suggestCursor || 0) + 1,
        };
      });

      return {
        ...baseNextState,
        courts: updatedCourts,
      };
    }
```
**Đánh giá:**
- Chuẩn Rule 2: Chỉ cập nhật đúng `courtId` được yêu cầu (`courts.map((c) => c.id !== courtId ? c : ...)`).
- Không chạm vào `nextUp` hay `suggestCursor` của các sân khác -> Không bị hiệu ứng domino.

#### B. Đặt người thủ công vào slot (`SET_NEXT_UP_SLOT`):
*(src/engine/sessionReducer.ts, dòng 810 - 868)*
```tsx
    case 'SET_NEXT_UP_SLOT': {
      const { courtId, slotIndex, playerId } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt || !targetCourt.isActive) return state;

      const expectedLength = targetCourt.nextUp.type === 'SINGLES' ? 2 : 4;
      if (slotIndex < 0 || slotIndex >= expectedLength) return state;

      if (playerId === null) {
        const newSlots = [...targetCourt.nextUp.slots];
        const newSource = [...targetCourt.nextUp.slotSource];
        newSlots[slotIndex] = null;
        newSource[slotIndex] = null;

        const updatedCourts = baseNextState.courts.map((c) => {
          if (c.id !== courtId) return c;
          return {
            ...c,
            nextUp: {
              ...c.nextUp,
              slots: newSlots,
              slotSource: newSource,
            },
          };
        });

        return {
          ...baseNextState,
          courts: updatedCourts,
        };
      }

      const status = getSlotCandidateStatus(baseNextState, courtId, slotIndex, playerId);
      if (!status.selectable) {
        return state;
      }

      const newSlots = [...targetCourt.nextUp.slots];
      const newSource = [...targetCourt.nextUp.slotSource];
      newSlots[slotIndex] = playerId;
      newSource[slotIndex] = 'MANUAL';

      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          nextUp: {
            ...c.nextUp,
            slots: newSlots,
            slotSource: newSource,
          },
        };
      });

      return {
        ...baseNextState,
        courts: updatedCourts,
      };
    }
```
**Đánh giá:**
- Khi `playerId === null` (bấm nút ✕ ở slot): Xóa đúng slot đó về `null` và `slotSource` về `null`. 3 slot còn lại được bảo toàn nguyên vẹn.
- Khi chọn người mới: Chỉ gán đúng `newSlots[slotIndex] = playerId` và `newSource[slotIndex] = 'MANUAL'`. Hoàn toàn không gọi matchmaker để tự ý xáo trộn 3 slot còn lại.

#### C. Xóa trắng toàn bộ Next Up (`CLEAR_NEXT_UP`):
*(src/engine/sessionReducer.ts, dòng 903 - 920)*
```tsx
    case 'CLEAR_NEXT_UP': {
      const { courtId } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt) return state;

      const updatedCourts = baseNextState.courts.map((c) =>
        c.id === courtId
          ? {
              ...c,
              nextUp: createEmptyNextUp(c.nextUp?.type || 'DOUBLES'),
              suggestCursor: 0,
            }
          : c
      );

      return {
        ...baseNextState,
        courts: updatedCourts,
      };
    }
```
**Đánh giá:**
- Xóa sạch 4 ô về `null`, giữ nguyên trạng thái trống cho đến khi Host bấm nút mới.

---

### 2.2. Kiểm tra các rào cản và nguy cơ lỗi khi kết nối Online Room

1. **Cơ chế Action Guard (`guardAction`)**:
   - `guardAction` được áp dụng cho toàn bộ các action trong `CourtCard` và `QueueTab`.
   - Nếu `role === 'VIEWER'`, khi bấm nút sẽ bật pop-up yêu cầu nhập mã PIN bảo mật. Sau khi nhập đúng mã PIN và nâng cấp thành `CO_HOST`, thao tác pending sẽ được thực thi.
   - **Tuy nhiên**, trong trạng thái `CO_HOST`, lỗi vòng lặp `joinRoom` ở Mục 1.3 sẽ lập tức kích hoạt và đè mất thao tác này sau vài mili-giây, khiến người dùng lầm tưởng nút bấm "bị đơ" hoặc "bị chặn".

2. **Thiếu cơ chế Local Action Lock (`lastLocalActionAt`)**:
   - Hiện tại `useCloudRoom.ts` chỉ có cờ `isApplyingRemoteRef`. Khi tab cục bộ thực hiện thao tác, nếu gói tin từ Realtime Supabase hoặc từ fetch đến muộn thì chưa có cơ chế chặn thời gian 1500ms để bảo vệ thao tác người dùng.

3. **Toast kết nối phòng hiển thị sai loại Toast**:
   - `onShowToast` của `useCloudRoom` đang truyền thông báo kết nối qua `setUndoToastMessage(msg)`.
   - Component `<UndoToast>` có nút bấm `[Hoàn tác]` (Undo), trong khi việc kết nối phòng không phải là một action có thể hoàn tác trong `undoStack`.

---

## PHẦN 3: ĐỀ XUẤT KIẾN TRÚC KHẮC PHỤC TRIỆT ĐỂ (THEO HARNESS RULES)

1. **Bọc Callback bằng `useRef` trong `useCloudRoom`**:
   - Lưu trữ `onApplyCloudState` và `onShowToast` vào `useRef` (`onApplyRef`, `onToastRef`).
   - Loại bỏ hoàn toàn callback khỏi dependency array của `joinRoom` và các `useEffect`.

2. **Khóa vòng đời khởi tạo (Initial Connect Guard)**:
   - Thêm `const hasConnectedInitialRef = useRef(false);`.
   - Effect đọc URL params và localStorage CHỈ ĐƯỢC PHÉP chạy đúng **1 LẦN DUY NHẤT** khi component mount:
     ```tsx
     useEffect(() => {
       if (hasConnectedInitialRef.current) return;
       hasConnectedInitialRef.current = true;
       // Xử lý paramRoom / savedRoom
     }, []); // dependency array rỗng tuyệt đối
     ```
   - Xóa bỏ param `?room=...&pin=...` trên thanh địa chỉ URL sau khi đã kết nối thành công bằng `window.history.replaceState` để tránh re-trigger khi F5 hoặc định tuyến.

3. **Thêm Khóa Thời Gian Cục Bộ (Local Action Lock 1500ms)**:
   - Thêm `const lastLocalActionAtRef = useRef<number>(0);`.
   - Khi `guardAction` hoặc người dùng thực hiện thao tác local, cập nhật `lastLocalActionAtRef.current = Date.now()`.
   - Trong listener `subscribeToRoom`, nếu `Date.now() - lastLocalActionAtRef.current < 1500` hoặc `record.updated_at <= lastLocalActionAtRef.current`, bỏ qua gói tin từ xa.

4. **Tách biệt Toast thông báo hệ thống**:
   - Thay vì dùng `setUndoToastMessage` (hiện nút Hoàn tác), dùng Toast cảnh báo / thông tin không có nút Hoàn tác cho các sự kiện kết nối phòng Online.

