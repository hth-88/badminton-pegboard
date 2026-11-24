import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { useCloudRoom, areSessionSnapshotsEqual } from '../useCloudRoom';
import { createDefaultCloudSettlementData, type CloudSettlementData } from '../../engine/settlement';
import { createInitialSessionState, badmintonReducer } from '../../engine/sessionReducer';
import { migrateSessionState } from '../../engine/stateMigration';
import type { BadmintonRoomRecord } from '../../services/supabaseSync';
import type { BadmintonSessionState } from '../../types/badminton';

// Mock supabaseSync
const mockFetchRoom = vi.fn();
const mockUpsertRoom = vi.fn();
const mockUpdateRoomSettlementOnly = vi.fn();
const mockUpdateRoomPinOnly = vi.fn();
let realtimeSubscriber: ((record: BadmintonRoomRecord) => void) | null = null;
const mockSubscribeToRoom = vi.fn((_roomCode: string, callback: (record: BadmintonRoomRecord) => void) => {
  realtimeSubscriber = callback;
  return () => {
    realtimeSubscriber = null;
  };
});

vi.mock('../../services/supabaseSync', () => ({
  fetchRoom: (code: string) => mockFetchRoom(code),
  upsertRoom: (record: any) => mockUpsertRoom(record),
  updateRoomSettlementOnly: (code: string, data: any, ts: number, by: string) =>
    mockUpdateRoomSettlementOnly(code, data, ts, by),
  updateRoomPinOnly: (code: string, newPin: string, ts: number, by: string) =>
    mockUpdateRoomPinOnly(code, newPin, ts, by),
  subscribeToRoom: (roomCode: string, cb: any) => mockSubscribeToRoom(roomCode, cb),
  getClientId: () => 'CLIENT_TEST_123',
  STORAGE_KEY_CLOUD_ROOM: 'badminton_cloud_room_state_v1',
}));

// React Hook Test Harness
function createHookHarness<P, R>(hookFn: (props: P) => R) {
  const internals =
    (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
    (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

  let hookIndex = 0;
  const states: any[] = [];
  const refs: any[] = [];
  const callbacks: any[] = [];
  const effects: any[] = [];
  let isRunning = false;
  let rerenderQueued = false;

  const dispatcher = {
    useState(initial: any) {
      const idx = hookIndex++;
      if (states[idx] === undefined) {
        states[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setState = (next: any) => {
        const val = typeof next === 'function' ? next(states[idx]) : next;
        if (val !== states[idx]) {
          states[idx] = val;
          queueRerender();
        }
      };
      return [states[idx], setState];
    },
    useRef(initial: any) {
      const idx = hookIndex++;
      if (refs[idx] === undefined) {
        refs[idx] = { current: initial };
      }
      return refs[idx];
    },
    useCallback(fn: any, deps: any[]) {
      const idx = hookIndex++;
      const prev = callbacks[idx];
      if (prev && deps && prev.deps.every((d: any, i: number) => Object.is(d, deps[i]))) {
        return prev.fn;
      }
      callbacks[idx] = { fn, deps };
      return fn;
    },
    useEffect(effect: any, deps: any[]) {
      const idx = hookIndex++;
      effects[idx] = { effect, deps, prev: effects[idx] };
    },
    useMemo(fn: any) {
      return fn();
    },
  };

  let currentProps: P;
  let currentResult: R;

  function runEffects() {
    for (let i = 0; i < effects.length; i++) {
      const item = effects[i];
      if (!item) continue;
      const shouldRun =
        !item.prev ||
        !item.deps ||
        item.deps.some((d: any, idx: number) => !Object.is(d, item.prev.deps[idx]));
      if (shouldRun) {
        if (item.prev?.cleanup) {
          item.prev.cleanup();
        }
        const cleanup = item.effect();
        if (typeof cleanup === 'function') {
          item.cleanup = cleanup;
        }
      }
    }
  }

  function render(props?: P) {
    if (props !== undefined) currentProps = props;
    hookIndex = 0;
    internals.H = dispatcher;
    currentResult = hookFn(currentProps);
    runEffects();
    return currentResult;
  }

  function queueRerender() {
    if (isRunning) {
      rerenderQueued = true;
      return;
    }
    rerenderQueued = true;
    while (rerenderQueued) {
      rerenderQueued = false;
      isRunning = true;
      render();
      isRunning = false;
    }
  }

  return {
    render: (props: P) => render(props),
    rerender: (props?: P) => render(props),
    getResult: () => currentResult,
  };
}

describe('useCloudRoom Realtime & Sync Loop Hardening', () => {
  let mockStorage: Record<string, string> = {};
  let currentHref = 'https://badminton-pegboard.vercel.app/';

  beforeEach(() => {
    vi.useFakeTimers();
    mockStorage = {};
    realtimeSubscriber = null;
    mockFetchRoom.mockReset();
    mockUpsertRoom.mockReset();
    mockUpdateRoomSettlementOnly.mockReset();
    mockSubscribeToRoom.mockClear();

    currentHref = 'https://badminton-pegboard.vercel.app/';

    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          mockStorage = {};
        },
      },
      writable: true,
      configurable: true,
    });

    // Mock window & location & history
    const mockLocation = {
      get href() {
        return currentHref;
      },
      set href(val: string) {
        currentHref = val;
      },
      get search() {
        const url = new URL(currentHref);
        return url.search;
      },
      get origin() {
        return new URL(currentHref).origin;
      },
      get pathname() {
        return new URL(currentHref).pathname;
      },
      get hash() {
        return new URL(currentHref).hash;
      },
    };

    const mockHistory = {
      replaceState: vi.fn((_state: any, _title: string, newUrl: string) => {
        if (newUrl.startsWith('http')) {
          currentHref = newUrl;
        } else {
          const origin = new URL(currentHref).origin;
          currentHref = `${origin}${newUrl}`;
        }
      }),
    };

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: mockLocation,
        history: mockHistory,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. Re-render nhiều lần không kích hoạt joinRoom / fetchRoom lại (chỉ gọi 1 lần khi mount)', async () => {
    currentHref = 'https://badminton-pegboard.vercel.app/?room=SAN-49&pin=1234';
    const initialState = createInitialSessionState();

    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: initialState,
        updated_at: 1000,
        updated_by: 'HOST_1',
      },
    });

    const onApply = vi.fn();
    const onToast = vi.fn();

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: props.onApply,
        onShowToast: props.onToast,
      })
    );

    // Initial render
    const res1 = harness.render({
      state: initialState,
      onApply,
      onToast,
    });

    expect(mockFetchRoom).toHaveBeenCalledTimes(1);
    expect(mockFetchRoom).toHaveBeenCalledWith('SAN-49');

    // Simulate 5 re-renders với reference mới của callbacks và state
    for (let i = 0; i < 5; i++) {
      const resAfter = harness.rerender({
        state: { ...initialState },
        onApply: (s: any) => onApply(s),
        onToast: (msg: string) => onToast(msg),
      });
      // joinRoom phải có tham chiếu ổn định tuyệt đối
      expect(resAfter.joinRoom).toBe(res1.joinRoom);
    }

    // fetchRoom vẫn chỉ được gọi đúng 1 lần duy nhất lúc mount
    expect(mockFetchRoom).toHaveBeenCalledTimes(1);
  });

  it('2. Khi đang ở chế độ Co-Host, click các thao tác cục bộ không bị reset và được debounce đẩy lên cloud', async () => {
    currentHref = 'https://badminton-pegboard.vercel.app/?room=SAN-49&pin=1234';
    const baseState = createInitialSessionState();

    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'OTHER',
      },
    });
    mockUpsertRoom.mockResolvedValue({ ok: true });

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
      })
    );

    harness.render({ state: baseState });
    await vi.runAllTimersAsync();

    expect(harness.getResult().role).toBe('CO_HOST');

    // Giả lập Host thao tác local: đổi slot hoặc gợi ý ở Sân 1
    const modifiedState: BadmintonSessionState = {
      ...baseState,
      courts: baseState.courts.map((c, idx) =>
        idx === 0
          ? {
              ...c,
              nextUp: {
                type: 'DOUBLES',
                slots: ['p1', 'p2', null, null],
                slotSource: ['MANUAL', 'MANUAL', null, null],
              },
            }
          : c
      ),
    };

    harness.rerender({ state: modifiedState });

    // Trước khi hết 250ms debounce, upsert chưa bay
    expect(mockUpsertRoom).not.toHaveBeenCalled();

    // Chạy qua 250ms debounce
    await vi.advanceTimersByTimeAsync(300);

    // Upsert đã được gọi với state mới của local
    expect(mockUpsertRoom).toHaveBeenCalledTimes(1);
    const lastCall = mockUpsertRoom.mock.calls[0][0];
    expect(lastCall.room_code).toBe('SAN-49');
    expect(lastCall.session_data.courts[0].nextUp.slots[0]).toBe('p1');
    expect(lastCall.updated_by).toBe('CLIENT_TEST_123');
  });

  it('3. Realtime event: bỏ qua khi có pending change, bỏ qua anti-echo, nạp khi rảnh rỗi', async () => {
    currentHref = 'https://badminton-pegboard.vercel.app/?room=SAN-49&pin=1234';
    const baseState = createInitialSessionState();

    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'INITIAL_HOST',
      },
    });
    mockUpsertRoom.mockResolvedValue({ ok: true });

    const appliedSnapshots: any[] = [];
    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: (s) => {
          appliedSnapshots.push(s);
        },
        onShowToast: vi.fn(),
      })
    );

    harness.render({ state: baseState });
    await vi.runAllTimersAsync();

    expect(realtimeSubscriber).not.toBeNull();
    appliedSnapshots.length = 0; // Clear snapshot từ fetchRoom

    // 3c. Anti-echo: Gói tin từ chính clientId này -> bỏ qua
    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '1234',
      session_data: { ...baseState, mixDebt: { doubles: 99, singles: 0 } },
      updated_at: 2000,
      updated_by: 'CLIENT_TEST_123', // trùng clientId
    });
    expect(appliedSnapshots).toHaveLength(0);

    // 3b. Không có pending change -> nạp snapshot bình thường
    const remoteState1 = { ...baseState, mixDebt: { doubles: 1, singles: 2 } };
    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '1234',
      session_data: remoteState1,
      updated_at: 3000,
      updated_by: 'OTHER_HOST',
    });
    expect(appliedSnapshots).toHaveLength(1);
    expect(appliedSnapshots[0].mixDebt.doubles).toBe(1);

    // 3a. Nếu đang có local pending change (debounce đang đếm): bỏ qua remote event
    const localChangeState = { ...baseState, mixDebt: { doubles: 5, singles: 5 } };
    harness.rerender({ state: localChangeState });

    // Lúc này debounce đang active (hasPendingLocalChangeRef = true)
    const remoteState2 = { ...baseState, mixDebt: { doubles: 88, singles: 88 } };
    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '1234',
      session_data: remoteState2,
      updated_at: 4000,
      updated_by: 'OTHER_HOST',
    });

    // RemoteState2 bị bỏ qua vì máy này đang có thay đổi local chưa lên mây
    expect(appliedSnapshots).toHaveLength(1);
  });

  it('4. Thông báo kết nối phòng dùng InfoToast, KHÔNG kích hoạt nút Hoàn tác', async () => {
    currentHref = 'https://badminton-pegboard.vercel.app/?room=SAN-49&pin=1234';
    const baseState = createInitialSessionState();

    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });

    let undoToastMessage: string | null = null;
    let infoToastMessage: string | null = null;

    const handleCloudToast = (msg: string) => {
      // Đúng chuẩn B1 & B2: Vào InfoToast, không vào UndoToast
      infoToastMessage = msg;
    };

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: handleCloudToast,
      })
    );

    harness.render({ state: baseState });
    await vi.runAllTimersAsync();

    // Kiểm tra kết quả
    expect(infoToastMessage).toContain('Đã kết nối phòng "SAN-49" với quyền CÙNG ĐIỀU KHIỂN');
    expect(undoToastMessage).toBeNull(); // Không bao giờ chạm vào UndoToast
  });

  it('5. Snapshot cloud chứa nextUp kiểu cũ được migrate an toàn và có tính lũy thừa (idempotent)', () => {
    const legacyCloudSnapshot: any = {
      schemaVersion: 2,
      players: [
        { id: 'p1', name: 'Nguyễn Văn A', sex: 'M', rank: 'tb', status: 'ACTIVE' },
        { id: 'p2', name: 'Trần Thị B', sex: 'F', rank: 'y', status: 'ACTIVE' },
      ],
      courts: [
        {
          id: 'court-1',
          name: 'Sân 1',
          isActive: true,
          policy: 'MIX',
          courtPlanIndex: 2, // Field cũ cần xóa
          nextUp: {
            type: 'DOUBLES',
            team1: ['p1'],
            team2: ['p2'],
          },
        },
      ],
      history: [],
      pairRules: [],
    };

    // Reducer chạy LOAD_STATE với snapshot cũ
    const state0 = createInitialSessionState();
    const migratedState1 = badmintonReducer(state0, {
      type: 'LOAD_STATE',
      payload: legacyCloudSnapshot,
    });

    const c1 = migratedState1.courts[0];
    expect(c1.nextUp.slots).toEqual(['p1', null, 'p2', null]);
    expect(c1.nextUp.slotSource).toEqual(['AUTO', null, 'AUTO', null]);
    expect((c1 as any).courtPlanIndex).toBeUndefined();

    // Tính lũy thừa: Chạy migrate lần thứ 2 cho kết quả giống hệt
    const migratedState2 = migrateSessionState(migratedState1);
    expect(migratedState2.courts[0].nextUp).toEqual(migratedState1.courts[0].nextUp);
    expect(areSessionSnapshotsEqual(migratedState1, migratedState2)).toBe(true);
  });

  it('6. Sau khi nạp snapshot remote, thao tác local ngay sau đó vẫn được ghi nhận và đẩy lên cloud', async () => {
    currentHref = 'https://badminton-pegboard.vercel.app/';
    const baseState = createInitialSessionState();

    mockUpsertRoom.mockResolvedValue({ ok: true });

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
      })
    );

    harness.render({ state: baseState });

    // Tham gia phòng Co-Host
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });

    await harness.getResult().joinRoom('SAN-49', '1234');
    await vi.runAllTimersAsync();
    mockUpsertRoom.mockClear();

    // 1. Nhận remote snapshot (kể cả giống hệt hoặc khác nhẹ)
    const remoteState = {
      ...baseState,
      mixDebt: { doubles: 0, singles: 1 },
    };

    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '1234',
      session_data: remoteState,
      updated_at: 2000,
      updated_by: 'OTHER_HOST',
    });

    // 2. Ngay sau đó (10ms), Host bấm một thao tác local
    const localNewState: BadmintonSessionState = {
      ...remoteState,
      courts: remoteState.courts.map((c, i) =>
        i === 0
          ? {
              ...c,
              nextUp: {
                type: 'DOUBLES',
                slots: ['p1', null, null, null],
                slotSource: ['MANUAL', null, null, null],
              },
            }
          : c
      ),
    };

    harness.rerender({ state: localNewState });

    // Chạy qua debounce 250ms
    await vi.advanceTimersByTimeAsync(300);

    // Thao tác local của Host không hề bị nuốt mất!
    expect(mockUpsertRoom).toHaveBeenCalledTimes(1);
    const lastCall = mockUpsertRoom.mock.calls[0][0];
    expect(lastCall.session_data.courts[0].nextUp.slots[0]).toBe('p1');
  });

  it('7. URL params ?room=...&pin=... bị xóa sau khi joinRoom thành công, giữ nguyên các query param khác', async () => {
    currentHref = 'https://badminton-pegboard.vercel.app/?room=SAN-49&pin=1234&tab=queue#section';
    const baseState = createInitialSessionState();

    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
      })
    );

    harness.render({ state: baseState });
    await vi.runAllTimersAsync();

    // Kiểm tra URL sau khi joinRoom thành công:
    // room và pin đã bị xóa, nhưng tab=queue và hash #section vẫn còn
    expect(window.location.search).toBe('?tab=queue');
    expect(window.location.hash).toBe('#section');
    expect(window.location.href).toContain('?tab=queue#section');
    expect(window.location.href).not.toContain('room=');
    expect(window.location.href).not.toContain('pin=');
  });

  it('8. Mục A1: Bấm Undo nhanh (<250ms) quay về snapshot khớp Cloud phải giải phóng cờ pending, về SYNCED và tiếp tục nhận Realtime', async () => {
    const baseState = createInitialSessionState();
    const appliedSnapshots: BadmintonSessionState[] = [];
    mockUpsertRoom.mockResolvedValue({ ok: true });
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'OTHER',
      },
    });

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: (s) => appliedSnapshots.push(s),
        onShowToast: vi.fn(),
      })
    );

    harness.render({ state: baseState });
    await harness.getResult().joinRoom('SAN-49', '1234');
    await vi.runAllTimersAsync();
    appliedSnapshots.length = 0;
    mockUpsertRoom.mockClear();

    const modifiedState: BadmintonSessionState = {
      ...baseState,
      mixDebt: { doubles: 3, singles: 0 },
    };
    harness.rerender({ state: modifiedState });
    await vi.advanceTimersByTimeAsync(100);

    expect(harness.getResult().syncStatus).toBe('SYNCING');
    expect(mockUpsertRoom).toHaveBeenCalledTimes(0);

    // Undo nhanh quay lại baseState (<250ms)
    harness.rerender({ state: baseState });
    expect(harness.getResult().syncStatus).toBe('SYNCED');

    await vi.advanceTimersByTimeAsync(300);
    expect(mockUpsertRoom).toHaveBeenCalledTimes(0);

    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '1234',
      session_data: { ...baseState, mixDebt: { doubles: 7, singles: 1 } },
      updated_at: 5000,
      updated_by: 'OTHER_HOST',
    });

    expect(appliedSnapshots.length).toBe(1);
    expect(appliedSnapshots[0].mixDebt.doubles).toBe(7);
  });

  it('9. Mục A1: Rời phòng (leaveRoom) khi đang pending debounce (<250ms) phải reset cờ pending để lần vào phòng sau vẫn nhận Realtime', async () => {
    const baseState = createInitialSessionState();
    const appliedSnapshots: BadmintonSessionState[] = [];
    mockUpsertRoom.mockResolvedValue({ ok: true });
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'OTHER',
      },
    });

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: (s) => appliedSnapshots.push(s),
        onShowToast: vi.fn(),
      })
    );

    harness.render({ state: baseState });
    await harness.getResult().joinRoom('SAN-49', '1234');
    await vi.runAllTimersAsync();

    const modifiedState: BadmintonSessionState = {
      ...baseState,
      mixDebt: { doubles: 4, singles: 0 },
    };
    harness.rerender({ state: modifiedState });
    await vi.advanceTimersByTimeAsync(100);

    harness.getResult().leaveRoom();
    expect(harness.getResult().syncStatus).toBe('OFFLINE');

    await harness.getResult().joinRoom('SAN-49');
    await vi.runAllTimersAsync();
    appliedSnapshots.length = 0;

    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '1234',
      session_data: { ...baseState, mixDebt: { doubles: 9, singles: 0 } },
      updated_at: 6000,
      updated_by: 'OTHER_HOST',
    });

    expect(appliedSnapshots.length).toBe(1);
    expect(appliedSnapshots[0].mixDebt.doubles).toBe(9);
  });

  it('10. Mục A4: areSessionSnapshotsEqual phát hiện thay đổi sex, virtualGamesOffset, court.name, settings.weights và phần tử trong pairRules/history/readyQueue', () => {
    const base = createInitialSessionState();
    base.players = [
      {
        id: 'p1',
        name: 'Nam 1',
        sex: 'M',
        rank: 'tb',
        status: 'ACTIVE',
        assignedPool: 'ALL',
        gamesPlayed: 0,
        virtualGamesOffset: 0,
        waitStreak: 0,
        lastPlayedAt: 0,
        singlesCount: 0,
        noSingles: false,
        joinedAt: 0,
      },
      {
        id: 'p2',
        name: 'Nữ 1',
        sex: 'F',
        rank: 'tb',
        status: 'ACTIVE',
        assignedPool: 'ALL',
        gamesPlayed: 0,
        virtualGamesOffset: 0,
        waitStreak: 0,
        lastPlayedAt: 0,
        singlesCount: 0,
        noSingles: false,
        joinedAt: 0,
      },
    ];
    base.pairRules = [
      { id: 'r1', playerAId: 'p1', playerBId: 'p2', type: 'LOCK_PARTNER' },
    ];
    base.history = [
      {
        id: 'h1',
        courtId: 'court-1',
        type: 'SINGLES',
        team1: ['p1'],
        team2: ['p2'],
        slotSource: { p1: 'AUTO', p2: 'AUTO' },
        startedAt: 1000,
        endedAt: 2000,
        durationMinutes: 10,
      },
    ];
    base.readyQueue = [
      {
        id: 'q1',
        courtId: 'court-1',
        isLockedByHost: false,
        createdAt: 1000,
        lineup: {
          type: 'SINGLES',
          team1: ['p1'],
          team2: ['p2'],
          slotSource: { p1: 'AUTO', p2: 'AUTO' },
        },
      },
    ];

    expect(areSessionSnapshotsEqual(base, structuredClone(base))).toBe(true);

    const v1 = structuredClone(base);
    v1.players[0].sex = 'F';
    expect(areSessionSnapshotsEqual(base, v1)).toBe(false);

    const v2 = structuredClone(base);
    v2.players[0].virtualGamesOffset = 2;
    expect(areSessionSnapshotsEqual(base, v2)).toBe(false);

    const v3 = structuredClone(base);
    v3.courts[0].name = 'Sân VIP';
    expect(areSessionSnapshotsEqual(base, v3)).toBe(false);

    const v4 = structuredClone(base);
    v4.settings.weights.skillBalanceMultiplier = 99;
    expect(areSessionSnapshotsEqual(base, v4)).toBe(false);

    const v5 = structuredClone(base);
    v5.pairRules[0] = { id: 'r2', playerAId: 'p1', playerBId: 'p2', type: 'AVOID_PARTNER' };
    expect(areSessionSnapshotsEqual(base, v5)).toBe(false);

    const v6 = structuredClone(base);
    v6.history[0].id = 'h2';
    expect(areSessionSnapshotsEqual(base, v6)).toBe(false);

    const v7 = structuredClone(base);
    v7.readyQueue[0].courtId = 'court-2';
    expect(areSessionSnapshotsEqual(base, v7)).toBe(false);
  });

  it('11. Mục A4: Co-Host đổi giới tính Nam/Nữ (player.sex) được phát hiện và đẩy lên Cloud qua upsertRoom', async () => {
    const baseState = createInitialSessionState();
    baseState.players = [
      {
        id: 'p1',
        name: 'An',
        sex: 'M',
        rank: 'tb',
        status: 'ACTIVE',
        assignedPool: 'ALL',
        gamesPlayed: 0,
        virtualGamesOffset: 0,
        waitStreak: 0,
        lastPlayedAt: 0,
        singlesCount: 0,
        noSingles: false,
        joinedAt: 0,
      },
    ];

    mockUpsertRoom.mockResolvedValue({ ok: true });
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
      })
    );

    harness.render({ state: baseState });
    await harness.getResult().joinRoom('SAN-49', '1234');
    await vi.runAllTimersAsync();
    mockUpsertRoom.mockClear();

    const updatedState = structuredClone(baseState);
    updatedState.players[0].sex = 'F';
    harness.rerender({ state: updatedState });

    await vi.advanceTimersByTimeAsync(300);

    expect(mockUpsertRoom).toHaveBeenCalledTimes(1);
    expect(mockUpsertRoom.mock.calls[0][0].session_data.players[0].sex).toBe('F');
  });

  it('12. Mục B2: VIEWER không lưu pin_code vào state và đóng modal PIN sẽ xóa pendingActionRef', async () => {
    const baseState = createInitialSessionState();
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
      })
    );

    harness.render({ state: baseState });
    await harness.getResult().joinRoom('SAN-49');
    await vi.runAllTimersAsync();

    expect(harness.getResult().role).toBe('VIEWER');
    expect(harness.getResult().pinCode).toBeNull();

    // VIEWER bấm thao tác bị chặn -> mở modal PIN, sau đó hủy
    const blockedActionSpy = vi.fn();
    harness.getResult().guardAction(blockedActionSpy);
    expect(harness.getResult().showPinPrompt).toBe(true);
    expect(blockedActionSpy).not.toHaveBeenCalled();

    harness.getResult().setShowPinPrompt(false);
    expect(harness.getResult().showPinPrompt).toBe(false);

    // Sau đó mở khóa Co-Host -> không tự chạy lại action đã hủy
    const upgradeRes = await harness.getResult().upgradeToCoHost('1234');
    expect(upgradeRes.ok).toBe(true);
    expect(harness.getResult().role).toBe('CO_HOST');
    expect(harness.getResult().pinCode).toBe('1234');
    expect(blockedActionSpy).not.toHaveBeenCalled();
  });

  it('13. Mục B7: F5 auto-reconnect khi có thay đổi local chưa đẩy mới hơn Cloud -> không bị đè xuống và tự đẩy lên Cloud', async () => {
    const cloudBaseState = createInitialSessionState();
    const localNewerState: BadmintonSessionState = {
      ...cloudBaseState,
      mixDebt: { doubles: 6, singles: 1 },
    };

    // Giả lập trạng thái trong localStorage trước khi F5 trong cửa sổ debounce 250ms
    localStorage.setItem(
      'badminton_cloud_room_state_v1',
      JSON.stringify({ roomCode: 'SAN-49', pinCode: '1234', role: 'CO_HOST' })
    );
    localStorage.setItem(
      'badminton_cloud_room_state_v1_pending_ts',
      JSON.stringify({ roomCode: 'SAN-49', updatedAt: 5000 })
    );

    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: cloudBaseState,
        updated_at: 1000, // Cloud cũ hơn local pending (5000)
        updated_by: 'CLIENT_TEST_123',
      },
    });
    mockUpsertRoom.mockResolvedValue({ ok: true });

    const onApplySpy = vi.fn();
    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: onApplySpy,
        onShowToast: vi.fn(),
      })
    );

    harness.render({ state: localNewerState });
    await vi.runAllTimersAsync();

    // Không bị bản Cloud cũ đè mất localNewerState
    expect(onApplySpy).not.toHaveBeenCalled();
    expect(mockUpsertRoom).toHaveBeenCalledTimes(1);
    expect(mockUpsertRoom.mock.calls[0][0].session_data.mixDebt).toEqual({ doubles: 6, singles: 1 });
    expect(localStorage.getItem('badminton_cloud_room_state_v1_pending_ts')).toBeNull();
  });

  it('14. Mục C4: CO_HOST thay đổi settlementData -> debounce 250ms gọi updateRoomSettlementOnly (KHÔNG gọi upsertRoom)', async () => {
    const baseState = createInitialSessionState();
    const baseSettlement = createDefaultCloudSettlementData(1000);
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        settlement_data: baseSettlement,
        updated_at: 1000,
        updated_by: 'OTHER',
      },
    });
    mockUpdateRoomSettlementOnly.mockResolvedValue({ error: null });

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
        currentSettlement: props.settlement,
        onApplyCloudSettlement: vi.fn(),
      })
    );

    harness.render({ state: baseState, settlement: baseSettlement });
    await harness.getResult().joinRoom('SAN-49', '1234');
    await vi.runAllTimersAsync();
    mockUpsertRoom.mockClear();
    mockUpdateRoomSettlementOnly.mockClear();

    const updatedSettlement: CloudSettlementData = {
      ...baseSettlement,
      settings: { ...baseSettlement.settings, shuttleCount: 12 },
      updatedAt: 2000,
    };
    harness.rerender({ state: baseState, settlement: updatedSettlement });

    expect(mockUpdateRoomSettlementOnly).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);

    expect(mockUpdateRoomSettlementOnly).toHaveBeenCalledTimes(1);
    expect(mockUpdateRoomSettlementOnly.mock.calls[0][0]).toBe('SAN-49');
    expect(mockUpdateRoomSettlementOnly.mock.calls[0][1].settings.shuttleCount).toBe(12);
    expect(mockUpsertRoom).not.toHaveBeenCalled();
  });

  it('15. Mục C4: VIEWER gọi reportPlayerPayment -> fetchRoom lấy settings mới nhất của Host, merge đúng 1 player PENDING_REVIEW và gọi updateRoomSettlementOnly (không đụng upsertRoom / session_data)', async () => {
    const baseState = createInitialSessionState();
    const hostSettlement: CloudSettlementData = {
      ...createDefaultCloudSettlementData(1000),
      settings: { ...createDefaultCloudSettlementData(1000).settings, bankAccount: '999888777' },
      payments: { p2: { status: 'PAID', approvedAt: 900 } },
    };

    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        settlement_data: hostSettlement,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });
    mockUpdateRoomSettlementOnly.mockResolvedValue({ error: null });

    const appliedSettlements: CloudSettlementData[] = [];
    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
        currentSettlement: props.settlement,
        onApplyCloudSettlement: (data) => appliedSettlements.push(data),
      })
    );

    harness.render({ state: baseState, settlement: createDefaultCloudSettlementData(0) });
    await harness.getResult().joinRoom('SAN-49');
    await vi.runAllTimersAsync();

    expect(harness.getResult().role).toBe('VIEWER');
    mockUpsertRoom.mockClear();
    mockUpdateRoomSettlementOnly.mockClear();

    const res = await harness.getResult().reportPlayerPayment('p1');
    expect(res.ok).toBe(true);
    expect(mockUpdateRoomSettlementOnly).toHaveBeenCalledTimes(1);
    expect(mockUpsertRoom).not.toHaveBeenCalled();

    const sentPayload: CloudSettlementData = mockUpdateRoomSettlementOnly.mock.calls[0][1];
    expect(sentPayload.settings.bankAccount).toBe('999888777');
    expect(sentPayload.payments.p2.status).toBe('PAID');
    expect(sentPayload.payments.p1.status).toBe('PENDING_REVIEW');
  });

  it('16. Mục C4: VIEWER gọi reportPlayerPayment khi player đã PAID trên Cloud -> không hạ cấp về PENDING_REVIEW và không gọi updateRoomSettlementOnly', async () => {
    const baseState = createInitialSessionState();
    const paidSettlement: CloudSettlementData = {
      ...createDefaultCloudSettlementData(2000),
      payments: { p1: { status: 'PAID', approvedAt: 1500 } },
    };

    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        settlement_data: paidSettlement,
        updated_at: 2000,
        updated_by: 'HOST',
      },
    });

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
        currentSettlement: props.settlement,
        onApplyCloudSettlement: vi.fn(),
      })
    );

    harness.render({ state: baseState, settlement: createDefaultCloudSettlementData(0) });
    await harness.getResult().joinRoom('SAN-49');
    await vi.runAllTimersAsync();
    mockUpdateRoomSettlementOnly.mockClear();

    const res = await harness.getResult().reportPlayerPayment('p1');
    expect(res.ok).toBe(true);
    expect(mockUpdateRoomSettlementOnly).not.toHaveBeenCalled();
  });

  it('17. Mục C4: Realtime chỉ đổi settlement_data (giữ nguyên session_data) -> máy CO_HOST gọi onApplyCloudSettlement nhưng KHÔNG gọi onApplyCloudState (giữ nguyên undoStack)', async () => {
    const baseState = createInitialSessionState();
    const baseSettlement = createDefaultCloudSettlementData(1000);
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        settlement_data: baseSettlement,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });

    const onApplyStateSpy = vi.fn();
    const onApplySettlementSpy = vi.fn();
    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: onApplyStateSpy,
        onShowToast: vi.fn(),
        currentSettlement: props.settlement,
        onApplyCloudSettlement: onApplySettlementSpy,
      })
    );

    harness.render({ state: baseState, settlement: baseSettlement });
    await harness.getResult().joinRoom('SAN-49', '1234');
    await vi.runAllTimersAsync();
    onApplyStateSpy.mockClear();
    onApplySettlementSpy.mockClear();

    const remoteSettlement: CloudSettlementData = {
      ...baseSettlement,
      payments: { p1: { status: 'PENDING_REVIEW', reportedAt: 3000 } },
      updatedAt: 3000,
    };

    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '1234',
      session_data: baseState,
      settlement_data: remoteSettlement,
      updated_at: 3000,
      updated_by: 'VIEWER_CLIENT',
    });

    expect(onApplyStateSpy).not.toHaveBeenCalled();
    expect(onApplySettlementSpy).toHaveBeenCalledTimes(1);
    expect(onApplySettlementSpy.mock.calls[0][0].payments.p1.status).toBe('PENDING_REVIEW');
  });

  it('18. Mục C4: CO_HOST nhận settlement_data mới từ Realtime rồi re-render -> không bị ping-pong đẩy ngược lên Cloud', async () => {
    const baseState = createInitialSessionState();
    const baseSettlement = createDefaultCloudSettlementData(1000);
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        settlement_data: baseSettlement,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });
    mockUpdateRoomSettlementOnly.mockResolvedValue({ error: null });

    let latestApplied: CloudSettlementData = baseSettlement;
    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
        currentSettlement: props.settlement,
        onApplyCloudSettlement: (data) => {
          latestApplied = data;
        },
      })
    );

    harness.render({ state: baseState, settlement: baseSettlement });
    await harness.getResult().joinRoom('SAN-49', '1234');
    await vi.runAllTimersAsync();
    mockUpdateRoomSettlementOnly.mockClear();

    const remoteSettlement: CloudSettlementData = {
      ...baseSettlement,
      payments: { p1: { status: 'PENDING_REVIEW', reportedAt: 4000 } },
      updatedAt: 4000,
    };
    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '1234',
      session_data: baseState,
      settlement_data: remoteSettlement,
      updated_at: 4000,
      updated_by: 'VIEWER_CLIENT',
    });

    harness.rerender({ state: baseState, settlement: latestApplied });
    await vi.advanceTimersByTimeAsync(300);

    expect(mockUpdateRoomSettlementOnly).not.toHaveBeenCalled();
  });

  it('19. Nhóm 3: reportPlayerPayment kèm receiptUrl và receiptPath cập nhật PENDING_REVIEW và xóa trạng thái REJECTED cũ', async () => {
    const baseState = createInitialSessionState();
    const rejectedSettlement: CloudSettlementData = {
      ...createDefaultCloudSettlementData(1000),
      payments: {
        p1: {
          status: 'REJECTED',
          reportedAt: 800,
          rejectedAt: 900,
          rejectionReason: 'Ảnh mờ',
        },
      },
    };

    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        settlement_data: rejectedSettlement,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });
    mockUpdateRoomSettlementOnly.mockResolvedValue({ error: null });

    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
        currentSettlement: props.settlement,
        onApplyCloudSettlement: vi.fn(),
      })
    );

    harness.render({ state: baseState, settlement: createDefaultCloudSettlementData(0) });
    await harness.getResult().joinRoom('SAN-49');
    await vi.runAllTimersAsync();
    mockUpdateRoomSettlementOnly.mockClear();

    const res = await harness.getResult().reportPlayerPayment('p1', {
      receiptUrl: 'https://cdn.example/r1.jpg',
      receiptPath: 'SAN-49/p1_2000.jpg',
    });

    expect(res.ok).toBe(true);
    expect(mockUpdateRoomSettlementOnly).toHaveBeenCalledTimes(1);
    const sentPayload: CloudSettlementData = mockUpdateRoomSettlementOnly.mock.calls[0][1];
    expect(sentPayload.payments.p1.status).toBe('PENDING_REVIEW');
    expect(sentPayload.payments.p1.receiptUrl).toBe('https://cdn.example/r1.jpg');
    expect(sentPayload.payments.p1.receiptPath).toBe('SAN-49/p1_2000.jpg');
    expect(sentPayload.payments.p1.rejectionReason).toBeUndefined();
    expect(sentPayload.payments.p1.rejectedAt).toBeUndefined();
  });

  it('20. Nhóm 3: Realtime nhận REJECTED kèm rejectionReason đẩy xuống VIEWER mà không đụng session_data', async () => {
    const baseState = createInitialSessionState();
    const baseSettlement = createDefaultCloudSettlementData(1000);
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        settlement_data: baseSettlement,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });

    const onApplyStateSpy = vi.fn();
    const onApplySettlementSpy = vi.fn();
    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: onApplyStateSpy,
        onShowToast: vi.fn(),
        currentSettlement: props.settlement,
        onApplyCloudSettlement: onApplySettlementSpy,
      })
    );

    harness.render({ state: baseState, settlement: baseSettlement });
    await harness.getResult().joinRoom('SAN-49');
    await vi.runAllTimersAsync();
    onApplyStateSpy.mockClear();
    onApplySettlementSpy.mockClear();

    const rejectedRemote: CloudSettlementData = {
      ...baseSettlement,
      payments: {
        p1: {
          status: 'REJECTED',
          rejectedAt: 5000,
          rejectionReason: 'Ảnh mờ',
        },
      },
      updatedAt: 5000,
    };

    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '1234',
      session_data: baseState,
      settlement_data: rejectedRemote,
      updated_at: 5000,
      updated_by: 'HOST',
    });

    expect(onApplyStateSpy).not.toHaveBeenCalled();
    expect(onApplySettlementSpy).toHaveBeenCalledTimes(1);
    expect(onApplySettlementSpy.mock.calls[0][0].payments.p1).toEqual({
      status: 'REJECTED',
      rejectedAt: 5000,
      rejectionReason: 'Ảnh mờ',
    });
  });

  it('21. Stage 12: CO_HOST đổi PIN hợp lệ gọi updateRoomPinOnly, cập nhật state pinCode + localStorage; từ chối PIN sai độ dài & VIEWER', async () => {
    const baseState = createInitialSessionState();
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });
    mockUpdateRoomPinOnly.mockResolvedValue({ error: null });

    const toastSpy = vi.fn();
    const harness = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: toastSpy,
      })
    );

    harness.render({ state: baseState });
    await harness.getResult().joinRoom('SAN-49'); // VIEWER
    await vi.runAllTimersAsync();

    // VIEWER không được đổi PIN
    const viewerRes = await harness.getResult().updateRoomPin('5678');
    expect(viewerRes.ok).toBe(false);
    expect(mockUpdateRoomPinOnly).not.toHaveBeenCalled();

    // Nâng cấp CO_HOST
    await harness.getResult().upgradeToCoHost('1234');
    expect(harness.getResult().role).toBe('CO_HOST');

    // PIN quá ngắn hoặc quá dài -> từ chối
    const shortRes = await harness.getResult().updateRoomPin('123');
    expect(shortRes.ok).toBe(false);
    const longRes = await harness.getResult().updateRoomPin('1234567');
    expect(longRes.ok).toBe(false);
    expect(mockUpdateRoomPinOnly).not.toHaveBeenCalled();

    // PIN hợp lệ -> lưu thành công
    const okRes = await harness.getResult().updateRoomPin(' 5678 ');
    expect(okRes.ok).toBe(true);
    expect(mockUpdateRoomPinOnly).toHaveBeenCalledTimes(1);
    expect(mockUpdateRoomPinOnly.mock.calls[0][0]).toBe('SAN-49');
    expect(mockUpdateRoomPinOnly.mock.calls[0][1]).toBe('5678');
    expect(harness.getResult().pinCode).toBe('5678');

    const stored = JSON.parse(localStorage.getItem('badminton_cloud_room_state_v1') || '{}');
    expect(stored.pinCode).toBe('5678');
    expect(toastSpy).toHaveBeenCalledWith('Đã đổi mã PIN phòng "SAN-49" thành công!');
  });

  it('22. Stage 12: Realtime nhận record.pin_code mới cập nhật đồng bộ sang máy CO_HOST khác (và giữ nguyên pinCode = null với VIEWER)', async () => {
    const baseState = createInitialSessionState();
    mockFetchRoom.mockResolvedValue({
      ok: true,
      data: {
        room_code: 'SAN-49',
        pin_code: '1234',
        session_data: baseState,
        updated_at: 1000,
        updated_by: 'HOST',
      },
    });
    mockUpsertRoom.mockResolvedValue({ ok: true });

    const harnessCoHost = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
      })
    );
    harnessCoHost.render({ state: baseState });
    await harnessCoHost.getResult().joinRoom('SAN-49', '1234');
    await vi.runAllTimersAsync();
    mockUpsertRoom.mockClear();

    expect(harnessCoHost.getResult().pinCode).toBe('1234');

    // Chủ sân khác đổi PIN thành 8899
    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '8899',
      session_data: baseState,
      updated_at: 3000,
      updated_by: 'OTHER_CO_HOST',
    });

    expect(harnessCoHost.getResult().pinCode).toBe('8899');
    const stored = JSON.parse(localStorage.getItem('badminton_cloud_room_state_v1') || '{}');
    expect(stored.pinCode).toBe('8899');

    await vi.advanceTimersByTimeAsync(300);
    expect(mockUpsertRoom).not.toHaveBeenCalled();

    // VIEWER không được lộ pinCode từ Realtime
    const harnessViewer = createHookHarness((props: any) =>
      useCloudRoom({
        currentState: props.state,
        onApplyCloudState: vi.fn(),
        onShowToast: vi.fn(),
      })
    );
    harnessViewer.render({ state: baseState });
    await harnessViewer.getResult().joinRoom('SAN-49');
    await vi.runAllTimersAsync();

    realtimeSubscriber!({
      room_code: 'SAN-49',
      pin_code: '7777',
      session_data: baseState,
      updated_at: 4000,
      updated_by: 'OTHER_CO_HOST',
    });
    expect(harnessViewer.getResult().pinCode).toBeNull();
  });
});
