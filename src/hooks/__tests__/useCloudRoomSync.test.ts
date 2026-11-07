import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { useCloudRoom, areSessionSnapshotsEqual } from '../useCloudRoom';
import { createInitialSessionState, badmintonReducer } from '../../engine/sessionReducer';
import { migrateSessionState } from '../../engine/stateMigration';
import type { BadmintonRoomRecord } from '../../services/supabaseSync';
import type { BadmintonSessionState } from '../../types/badminton';

// Mock supabaseSync
const mockFetchRoom = vi.fn();
const mockUpsertRoom = vi.fn();
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
});
