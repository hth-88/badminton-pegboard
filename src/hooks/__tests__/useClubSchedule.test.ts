import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Club,
  ClubMember,
  MemberScheduleEntry,
} from '../../types/schedule';
import type { SubscribeClubScheduleCallbacks } from '../../services/clubScheduleSync';
import { getActiveClubCode, getClubRoster } from '../../engine/clubRosterStorage';
import {
  SESSION_KEY_CLUB_PINS,
  STORAGE_KEY_CLUB_SCHEDULE_CONTEXT,
  useClubSchedule,
} from '../useClubSchedule';

const mockFetchClubScheduleBundle = vi.fn();
const mockFetchClubMembers = vi.fn();
const mockFetchWeekSchedules = vi.fn();
const mockCreateClub = vi.fn();
const mockVerifyClubHostPin = vi.fn();
const mockVerifyMemberPin = vi.fn();
const mockUpsertMemberSchedule = vi.fn();

let activeRealtimeCallbacks: SubscribeClubScheduleCallbacks | null = null;
const mockSubscribeToClubSchedule = vi.fn(
  (_clubCode: string, callbacks: SubscribeClubScheduleCallbacks) => {
    activeRealtimeCallbacks = callbacks;
    return () => {
      activeRealtimeCallbacks = null;
    };
  }
);

vi.mock('../../services/clubScheduleSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/clubScheduleSync')>();
  return {
    ...actual,
    fetchClubScheduleBundle: (...args: unknown[]) => mockFetchClubScheduleBundle(...args),
    fetchClubMembers: (...args: unknown[]) => mockFetchClubMembers(...args),
    fetchWeekSchedules: (...args: unknown[]) => mockFetchWeekSchedules(...args),
    createClub: (...args: unknown[]) => mockCreateClub(...args),
    verifyClubHostPin: (...args: unknown[]) => mockVerifyClubHostPin(...args),
    verifyMemberPin: (...args: unknown[]) => mockVerifyMemberPin(...args),
    upsertMemberSchedule: (...args: unknown[]) => mockUpsertMemberSchedule(...args),
    subscribeToClubSchedule: (code: string, cb: SubscribeClubScheduleCallbacks) =>
      mockSubscribeToClubSchedule(code, cb),
  };
});

// React Hook Test Harness (tương thích React 19 giống useCloudRoomSync.test.ts)
function createHookHarness<P, R>(hookFn: (props: P) => R) {
  const internals =
    (React as unknown as Record<string, Record<string, unknown>>)
      .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
    (React as unknown as Record<string, Record<string, unknown>>)
      .__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

  let hookIndex = 0;
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const callbacks: Array<{ fn: unknown; deps: unknown[] }> = [];
  const memos: Array<{ val: unknown; deps: unknown[] }> = [];
  const effects: Array<{
    effect: () => void | (() => void);
    deps?: unknown[];
    prev?: { deps?: unknown[]; cleanup?: () => void };
    cleanup?: () => void;
  }> = [];
  let isRunning = false;
  let rerenderQueued = false;

  const dispatcher = {
    useState(initial: unknown) {
      const idx = hookIndex++;
      if (states[idx] === undefined) {
        states[idx] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      }
      const setState = (next: unknown) => {
        const val =
          typeof next === 'function'
            ? (next as (prev: unknown) => unknown)(states[idx])
            : next;
        if (!Object.is(val, states[idx])) {
          states[idx] = val;
          queueRerender();
        }
      };
      return [states[idx], setState];
    },
    useRef(initial: unknown) {
      const idx = hookIndex++;
      if (refs[idx] === undefined) {
        refs[idx] = { current: initial };
      }
      return refs[idx];
    },
    useCallback(fn: unknown, deps: unknown[]) {
      const idx = hookIndex++;
      const prev = callbacks[idx];
      if (prev && deps && prev.deps.every((d, i) => Object.is(d, deps[i]))) {
        return prev.fn;
      }
      callbacks[idx] = { fn, deps };
      return fn;
    },
    useMemo(fn: () => unknown, deps: unknown[]) {
      const idx = hookIndex++;
      const prev = memos[idx];
      if (prev && deps && prev.deps.every((d, i) => Object.is(d, deps[i]))) {
        return prev.val;
      }
      const val = fn();
      memos[idx] = { val, deps };
      return val;
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const idx = hookIndex++;
      effects[idx] = { effect, deps, prev: effects[idx] };
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
        item.deps.some((d, idx) => !Object.is(d, item.prev?.deps?.[idx]));
      if (shouldRun) {
        item.prev?.cleanup?.();
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

function makeMockClub(clubCode = 'CLB-T35'): Club {
  return {
    clubCode,
    name: 'CLB Thứ 3 - Thứ 5',
    activeRooms: [],
    lockedWeeks: [],
    settings: {
      allowSelfRegister: true,
      defaultDurationHours: 2,
      minPlayersPerShift: 4,
      timezone: 'Asia/Ho_Chi_Minh',
    },
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
}

function makeMember(id: string, name: string, hasPin = false): ClubMember {
  return {
    id,
    clubCode: 'CLB-T35',
    name,
    gender: 'M',
    rank: 'tb',
    rankScore: 10,
    noSingles: false,
    hasPin,
    isActive: true,
    authUserId: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
}

describe('Phase 2 — useClubSchedule Hook & Realtime Integration', () => {
  let mockLocal: Record<string, string> = {};
  let mockSession: Record<string, string> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    mockLocal = {};
    mockSession = {};
    activeRealtimeCallbacks = null;
    mockFetchClubScheduleBundle.mockReset();
    mockFetchClubMembers.mockReset();
    mockFetchWeekSchedules.mockReset();
    mockCreateClub.mockReset();
    mockVerifyClubHostPin.mockReset();
    mockVerifyMemberPin.mockReset();
    mockUpsertMemberSchedule.mockReset();
    mockSubscribeToClubSchedule.mockClear();

    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => mockLocal[k] ?? null,
        setItem: (k: string, v: string) => {
          mockLocal[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockLocal[k];
        },
        clear: () => {
          mockLocal = {};
        },
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: (k: string) => mockSession[k] ?? null,
        setItem: (k: string, v: string) => {
          mockSession[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockSession[k];
        },
        clear: () => {
          mockSession = {};
        },
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          search: '',
          href: 'https://badminton.app/',
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. connectClub nạp lịch tuần, nhận diện quyền CLUB_HOST và cập nhật Realtime member_schedules + club_members an toàn', async () => {
    const members = [
      makeMember('uuid-1', 'Đức Anh', true),
      makeMember('uuid-2', 'Huy Hoàng', false),
      makeMember('uuid-3', 'Minh Trí', false),
      makeMember('uuid-4', 'Quốc Tuấn', false),
    ];

    const initialEntries: MemberScheduleEntry[] = [
      {
        id: 's1',
        clubCode: 'CLB-T35',
        weekKey: '2026-W48',
        memberId: 'uuid-1',
        busySlots: [],
        note: '',
        updatedAt: '2026-11-24T00:00:00Z',
      },
      {
        id: 's2',
        clubCode: 'CLB-T35',
        weekKey: '2026-W48',
        memberId: 'uuid-2',
        busySlots: [],
        note: '',
        updatedAt: '2026-11-24T00:00:00Z',
      },
      {
        id: 's3',
        clubCode: 'CLB-T35',
        weekKey: '2026-W48',
        memberId: 'uuid-3',
        busySlots: [],
        note: '',
        updatedAt: '2026-11-24T00:00:00Z',
      },
    ];

    mockFetchClubScheduleBundle.mockResolvedValue({
      data: {
        club: makeMockClub('CLB-T35'),
        members,
        weekEntries: initialEntries,
        fixedEntries: [
          {
            id: 'f4',
            clubCode: 'CLB-T35',
            weekKey: 'FIXED',
            memberId: 'uuid-4',
            busySlots: ['0-19'],
            note: 'Bận T2 tối',
            updatedAt: '2026-11-01T00:00:00Z',
          },
        ],
      },
      error: null,
      errorCode: null,
    });
    mockVerifyClubHostPin.mockResolvedValue({ data: true, error: null, errorCode: null });

    const harness = createHookHarness(() =>
      useClubSchedule({ initialWeekKey: '2026-W48' })
    );
    harness.render(undefined);

    await harness.getResult().connectClub('clb-t35', {
      weekKey: '2026-W48',
      hostPin: '9999',
    });

    expect(harness.getResult().isHost).toBe(true);
    expect(harness.getResult().role).toBe('CLUB_HOST');
    expect(harness.getResult().submissionSummary.submittedCount).toBe(3);
    expect(harness.getResult().goldenSlots).toHaveLength(0); // Mới 3 người nộp < 4

    // Host gắn note kín cho uuid-1
    harness.getResult().updatePrivateMemberMeta('uuid-1', {
      notes: 'Đội trưởng CLB',
      tags: ['Trình cứng'],
    });

    // Realtime: uuid-4 nộp lịch -> đủ 4 người rảnh -> xuất hiện goldenSlots & twoShiftSuggestions!
    activeRealtimeCallbacks?.onScheduleChange?.({
      eventType: 'INSERT',
      entry: {
        id: 's4',
        clubCode: 'CLB-T35',
        weekKey: '2026-W48',
        memberId: 'uuid-4',
        busySlots: [],
        note: '',
        updatedAt: '2026-11-26T00:00:00Z',
      },
    });

    expect(harness.getResult().submissionSummary.submittedCount).toBe(4);
    expect(harness.getResult().goldenSlots.length).toBeGreaterThan(0);
    expect(harness.getResult().twoShiftSuggestions.length).toBeGreaterThan(0);

    // Realtime: uuid-1 đổi tên và payload thiếu cột sinh has_pin (hasPinIncluded = false)
    mockFetchClubMembers.mockResolvedValue({
      data: [
        { ...members[0], name: 'Đức Anh (Mới)', hasPin: true },
        ...members.slice(1),
      ],
      error: null,
      errorCode: null,
    });

    activeRealtimeCallbacks?.onMemberChange?.({
      eventType: 'UPDATE',
      hasPinIncluded: false,
      rawRecord: {
        id: 'uuid-1',
        club_code: 'CLB-T35',
        name: 'Đức Anh (Mới)',
        gender: 'M',
        rank: 'tb+',
        rank_score: 11.5,
        no_singles: false,
        is_active: true,
        auth_user_id: null,
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-26T01:00:00Z',
      },
    });

    // Ngay lập tức: không bị mất hasPin: true và không mất note kín theo UUID!
    const m1Immediate = harness.getResult().members.find((m) => m.id === 'uuid-1');
    expect(m1Immediate?.name).toBe('Đức Anh (Mới)');
    expect(m1Immediate?.hasPin).toBe(true);
    expect(
      harness.getResult().rosterWithPrivateMeta.find((m) => m.id === 'uuid-1')?.notes
    ).toBe('Đội trưởng CLB');

    // Sau 150ms debounce, fetchClubMembers được gọi để đồng bộ chuẩn cột sinh has_pin
    await vi.advanceTimersByTimeAsync(200);
    expect(mockFetchClubMembers).toHaveBeenCalledWith('CLB-T35', { includeInactive: true });
  });

  it('2. copyMyFixedToCurrentWeek chép lịch cố định sang tuần hiện tại và gọi upsertMemberSchedule', async () => {
    const m1 = makeMember('uuid-1', 'Đức Anh', false);
    mockFetchClubScheduleBundle.mockResolvedValue({
      data: {
        club: makeMockClub('CLB-T35'),
        members: [m1],
        weekEntries: [],
        fixedEntries: [
          {
            id: 'fixed-1',
            clubCode: 'CLB-T35',
            weekKey: 'FIXED',
            memberId: 'uuid-1',
            busySlots: ['1-19', '3-20'],
            note: 'Lịch cố định tối',
            updatedAt: '2026-11-01T00:00:00Z',
          },
        ],
      },
      error: null,
      errorCode: null,
    });

    mockUpsertMemberSchedule.mockResolvedValue({
      data: {
        id: 'week-1',
        clubCode: 'CLB-T35',
        weekKey: '2026-W48',
        memberId: 'uuid-1',
        busySlots: ['1-19', '3-20'],
        note: 'Lịch cố định tối',
        updatedAt: '2026-11-26T02:00:00Z',
      },
      error: null,
      errorCode: null,
    });

    const harness = createHookHarness(() =>
      useClubSchedule({ initialWeekKey: '2026-W48' })
    );
    harness.render(undefined);
    await harness.getResult().connectClub('CLB-T35');
    harness.getResult().selectCurrentMember('uuid-1');

    expect(harness.getResult().role).toBe('CLUB_MEMBER');

    const copyRes = await harness.getResult().copyMyFixedToCurrentWeek({ copyNote: true });
    expect(copyRes.error).toBeNull();
    expect(mockUpsertMemberSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        clubCode: 'CLB-T35',
        weekKey: '2026-W48',
        memberId: 'uuid-1',
        busySlots: ['1-19', '3-20'],
        note: 'Lịch cố định tối',
      })
    );
    expect(harness.getResult().submissionSummary.submittedCount).toBe(1);
  });

  it('3. createNewClub tự bỏ qua không đẩy 9 thành viên mẫu mặc định lên Cloud', async () => {
    // Máy mới tinh gọi getClubRoster() -> ghi 9 thành viên mẫu vào localStorage
    expect(getClubRoster()).toHaveLength(9);

    mockCreateClub.mockResolvedValue({
      data: makeMockClub('CLB-FRESH'),
      error: null,
      errorCode: null,
    });

    const harness = createHookHarness(() =>
      useClubSchedule({ initialWeekKey: '2026-W48' })
    );
    harness.render(undefined);

    const createRes = await harness.getResult().createNewClub({
      clubCode: 'clb-fresh',
      name: 'CLB Mới Tinh',
      hostPin: '1234',
    });

    expect(createRes.error).toBeNull();
    expect(createRes.data?.migration?.status).toBe('SKIPPED_DEFAULT_SAMPLE');
    expect(harness.getResult().members).toEqual([]);
  });

  it('4. copyClubFixedToWeekAsHost sang tuần khác tự tải lịch Cloud của tuần đích để KHÔNG ghi đè người đã nộp', async () => {
    const m1 = makeMember('uuid-1', 'Đức Anh', false);
    const m2 = makeMember('uuid-2', 'Huy Hoàng', false);

    mockFetchClubScheduleBundle.mockResolvedValue({
      data: {
        club: makeMockClub('CLB-T35'),
        members: [m1, m2],
        weekEntries: [],
        fixedEntries: [
          {
            id: 'f1',
            clubCode: 'CLB-T35',
            weekKey: 'FIXED',
            memberId: 'uuid-1',
            busySlots: ['0-19'],
            note: 'Fixed M1',
            updatedAt: '2026-11-01T00:00:00Z',
          },
          {
            id: 'f2',
            clubCode: 'CLB-T35',
            weekKey: 'FIXED',
            memberId: 'uuid-2',
            busySlots: ['2-20'],
            note: 'Fixed M2',
            updatedAt: '2026-11-01T00:00:00Z',
          },
        ],
      },
      error: null,
      errorCode: null,
    });
    mockVerifyClubHostPin.mockResolvedValue({ data: true, error: null, errorCode: null });

    // Trên Cloud ở tuần 2026-W49 (chưa có trong localStorage), uuid-1 ĐÃ tự nộp lịch riêng
    mockFetchWeekSchedules.mockResolvedValue({
      data: [
        {
          id: 'w49-m1',
          clubCode: 'CLB-T35',
          weekKey: '2026-W49',
          memberId: 'uuid-1',
          busySlots: ['4-19'],
          note: 'Lịch riêng tuần sau của M1',
          updatedAt: '2026-11-25T00:00:00Z',
        },
      ],
      error: null,
      errorCode: null,
    });

    mockUpsertMemberSchedule.mockResolvedValue({
      data: {
        id: 'w49-m2',
        clubCode: 'CLB-T35',
        weekKey: '2026-W49',
        memberId: 'uuid-2',
        busySlots: ['2-20'],
        note: '',
        updatedAt: '2026-11-26T05:00:00Z',
      },
      error: null,
      errorCode: null,
    });

    const harness = createHookHarness(() =>
      useClubSchedule({ initialWeekKey: '2026-W48' })
    );
    harness.render(undefined);
    await harness.getResult().connectClub('CLB-T35', { hostPin: '9999' });

    const copyRes = await harness.getResult().copyClubFixedToWeekAsHost({
      targetWeekKey: '2026-W49',
      overwriteExisting: false,
    });

    expect(mockFetchWeekSchedules).toHaveBeenCalledWith('CLB-T35', '2026-W49');
    expect(copyRes).toEqual({
      appliedCount: 1,
      skippedExistingCount: 1,
      missingFixedCount: 0,
      error: null,
    });
    // Chỉ upsert cho uuid-2, TUYỆT ĐỐI không ghi đè uuid-1!
    expect(mockUpsertMemberSchedule).toHaveBeenCalledTimes(1);
    expect(mockUpsertMemberSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        weekKey: '2026-W49',
        memberId: 'uuid-2',
      })
    );
  });

  it('5. Cách ly ngữ cảnh khi mở link ?club= mới, nhận defaultDurationHours của CLB và không lưu mã ?club= 404 vào localStorage', async () => {
    // Ngữ cảnh cũ đang lưu CLB-OLD với member của CLB-OLD và duration 3h
    localStorage.setItem(
      STORAGE_KEY_CLUB_SCHEDULE_CONTEXT,
      JSON.stringify({
        clubCode: 'CLB-OLD',
        selectedMemberId: 'uuid-from-old-club',
        weekKey: 'FIXED',
        durationHours: 3,
      })
    );

    // 5a. Mở link ?club=TYPO-404 không tồn tại -> không được ghi đè CLB-OLD trong localStorage
    (globalThis.window as { location: { search: string; href: string } }).location.search =
      '?club=TYPO-404';
    mockFetchClubScheduleBundle.mockResolvedValueOnce({
      data: null,
      error: 'Không tìm thấy CLB.',
      errorCode: 'CLUB_NOT_FOUND',
    });

    const typoHarness = createHookHarness(() => useClubSchedule({ nowDate: new Date('2026-11-26T00:00:00Z') }));
    typoHarness.render(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(typoHarness.getResult().syncState).toBe('ERROR');
    expect(getActiveClubCode()).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY_CLUB_SCHEDULE_CONTEXT) || '{}').clubCode
    ).toBe('CLB-OLD');

    // 5b. Mở link ?club=CLB-90MIN hợp lệ có defaultDurationHours = 1.5 -> không bị dính uuid-from-old-club hay 3h của CLB-OLD
    (globalThis.window as { location: { search: string; href: string } }).location.search =
      '?club=CLB-90MIN';
    const club90: Club = {
      ...makeMockClub('CLB-90MIN'),
      settings: {
        allowSelfRegister: true,
        defaultDurationHours: 1.5,
        minPlayersPerShift: 4,
        timezone: 'Asia/Ho_Chi_Minh',
      },
    };
    mockFetchClubScheduleBundle.mockResolvedValueOnce({
      data: {
        club: club90,
        members: [makeMember('uuid-new-1', 'Thành Viên Mới')],
        weekEntries: [],
        fixedEntries: [],
      },
      error: null,
      errorCode: null,
    });

    const newClubHarness = createHookHarness(() =>
      useClubSchedule({ nowDate: new Date('2026-11-26T00:00:00Z') })
    );
    newClubHarness.render(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(newClubHarness.getResult().syncState).toBe('SYNCED');
    expect(newClubHarness.getResult().selectedMemberId).toBeNull();
    expect(newClubHarness.getResult().weekKey).toBe('2026-W48');
    expect(newClubHarness.getResult().durationHours).toBe(1.5);
  });

  it('6. Xử lý gói DELETE member_schedules chỉ có scheduleId (REPLICA IDENTITY DEFAULT) và tự gỡ Host PIN hết hạn khi lưu lịch', async () => {
    const m1 = makeMember('uuid-1', 'Đức Anh', false);
    sessionStorage.setItem(
      SESSION_KEY_CLUB_PINS,
      JSON.stringify({ hostPins: { 'CLB-T35': 'STALE_PIN' }, memberPins: {} })
    );

    mockFetchClubScheduleBundle.mockResolvedValue({
      data: {
        club: makeMockClub('CLB-T35'),
        members: [m1],
        weekEntries: [
          {
            id: 'sched-w48-1',
            clubCode: 'CLB-T35',
            weekKey: '2026-W48',
            memberId: 'uuid-1',
            busySlots: ['0-19'],
            note: '',
            updatedAt: '2026-11-26T00:00:00Z',
          },
        ],
        fixedEntries: [
          {
            id: 'sched-fixed-1',
            clubCode: 'CLB-T35',
            weekKey: 'FIXED',
            memberId: 'uuid-1',
            busySlots: ['1-19'],
            note: 'Giữ nguyên FIXED',
            updatedAt: '2026-11-20T00:00:00Z',
          },
        ],
      },
      error: null,
      errorCode: null,
    });

    const harness = createHookHarness(() =>
      useClubSchedule({ initialClubCode: 'CLB-T35', initialWeekKey: '2026-W48' })
    );
    harness.render(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.getResult().isHost).toBe(true);
    expect(harness.getResult().submissionSummary.submittedCount).toBe(1);

    // Gói DELETE từ PG REPLICA IDENTITY DEFAULT chỉ chứa old.id (scheduleId), không có memberId/weekKey
    activeRealtimeCallbacks?.onScheduleChange?.({
      eventType: 'DELETE',
      scheduleId: 'sched-w48-1',
    });

    expect(harness.getResult().submissionSummary.submittedCount).toBe(0);
    // Lịch FIXED không bị xóa nhầm!
    expect(harness.getResult().fixedEntriesByMemberId['uuid-1']?.id).toBe('sched-fixed-1');

    // Lưu lịch khi STALE_PIN đã hết hạn -> tự gỡ STALE_PIN và retry lưu thành công với quyền thành viên
    harness.getResult().selectCurrentMember('uuid-1');
    mockUpsertMemberSchedule
      .mockResolvedValueOnce({
        data: null,
        error: 'Mã PIN Host không chính xác.',
        errorCode: 'INVALID_HOST_PIN',
      })
      .mockResolvedValueOnce({
        data: {
          id: 'sched-w48-2',
          clubCode: 'CLB-T35',
          weekKey: '2026-W48',
          memberId: 'uuid-1',
          busySlots: ['2-20'],
          note: '',
          updatedAt: '2026-11-26T03:00:00Z',
        },
        error: null,
        errorCode: null,
      });

    const saveRes = await harness.getResult().saveScheduleEntry({ busySlots: ['2-20'] });
    expect(saveRes.error).toBeNull();
    expect(harness.getResult().isHost).toBe(false);
    expect(harness.getResult().role).toBe('CLUB_MEMBER');
    expect(harness.getResult().submissionSummary.submittedCount).toBe(1);
  });

  it('7. isMemberPinUnlocked phản ánh tức thì trạng thái mở khóa PIN cá nhân trên thiết bị hiện tại và tự hủy khi PIN cũ hết hạn', async () => {
    const mPinned = makeMember('uuid-pin', 'Tuấn Hùng', true);
    mockFetchClubScheduleBundle.mockResolvedValue({
      data: {
        club: makeMockClub('CLB-T35'),
        members: [mPinned],
        weekEntries: [],
        fixedEntries: [],
      },
      error: null,
      errorCode: null,
    });

    const harness = createHookHarness(() =>
      useClubSchedule({ initialClubCode: 'CLB-T35', initialWeekKey: '2026-W48' })
    );
    harness.render(undefined);
    await Promise.resolve();
    await Promise.resolve();

    harness.getResult().selectCurrentMember('uuid-pin');
    expect(harness.getResult().isMemberPinUnlocked('uuid-pin')).toBe(false);

    // Nhập sai PIN -> vẫn khóa
    mockVerifyMemberPin.mockResolvedValueOnce({
      data: false,
      error: 'Mã PIN cá nhân không chính xác.',
      errorCode: 'INVALID_MEMBER_PIN',
    });
    const wrongRes = await harness.getResult().verifyAndCacheMemberPin('uuid-pin', '0000');
    expect(wrongRes.data).toBe(false);
    expect(harness.getResult().isMemberPinUnlocked('uuid-pin')).toBe(false);

    // Nhập đúng PIN -> mở khóa ngay trên thiết bị hiện tại & giữ bền vững trong localStorage kể cả khi đóng WebView/tab (xóa sessionStorage)
    mockVerifyMemberPin.mockResolvedValueOnce({
      data: true,
      error: null,
      errorCode: null,
    });
    const rightRes = await harness.getResult().verifyAndCacheMemberPin('uuid-pin', '0686');
    expect(rightRes.data).toBe(true);
    expect(harness.getResult().isMemberPinUnlocked('uuid-pin')).toBe(true);

    // Giả lập đóng hẳn WebView Zalo (sessionStorage bị xóa trắng), mở lại trang mới -> vẫn mở khóa trên máy hiện tại & gửi đúng memberPin khi lưu
    sessionStorage.clear();
    const reopenedHarness = createHookHarness(() =>
      useClubSchedule({ initialClubCode: 'CLB-T35', initialWeekKey: '2026-W48' })
    );
    reopenedHarness.render(undefined);
    await Promise.resolve();
    await Promise.resolve();
    reopenedHarness.getResult().selectCurrentMember('uuid-pin');
    expect(reopenedHarness.getResult().isMemberPinUnlocked('uuid-pin')).toBe(true);

    mockUpsertMemberSchedule.mockResolvedValueOnce({
      data: {
        id: 'sched-pin-ok',
        clubCode: 'CLB-T35',
        weekKey: '2026-W48',
        memberId: 'uuid-pin',
        busySlots: ['0-6'],
        note: '',
        updatedAt: '2026-11-26T04:00:00Z',
      },
      error: null,
      errorCode: null,
    });
    const persistedSave = await reopenedHarness
      .getResult()
      .saveScheduleEntry({ busySlots: ['0-6'] });
    expect(persistedSave.error).toBeNull();
    expect(mockUpsertMemberSchedule).toHaveBeenLastCalledWith(
      expect.objectContaining({
        memberId: 'uuid-pin',
        memberPin: '0686',
      })
    );

    // Nếu máy khác đổi PIN khiến RPC trả INVALID_MEMBER_PIN -> tự gỡ cache khỏi cả localStorage & sessionStorage để hỏi lại PIN mới
    mockUpsertMemberSchedule.mockResolvedValueOnce({
      data: null,
      error: 'Mã PIN cá nhân không chính xác.',
      errorCode: 'INVALID_MEMBER_PIN',
    });
    await reopenedHarness.getResult().saveScheduleEntry({ busySlots: ['0-7'] });
    expect(reopenedHarness.getResult().isMemberPinUnlocked('uuid-pin')).toBe(false);

    // Kiểm chứng lockMemberPin khóa lại thủ công trên máy mượn & selectWeek báo trạng thái ERROR khi rớt mạng
    mockVerifyMemberPin.mockResolvedValueOnce({ data: true, error: null, errorCode: null });
    await reopenedHarness.getResult().verifyAndCacheMemberPin('uuid-pin', '0686');
    expect(reopenedHarness.getResult().isMemberPinUnlocked('uuid-pin')).toBe(true);
    reopenedHarness.getResult().lockMemberPin('uuid-pin');
    expect(reopenedHarness.getResult().isMemberPinUnlocked('uuid-pin')).toBe(false);

    mockFetchWeekSchedules.mockResolvedValueOnce({
      data: null,
      error: 'Không thể kết nối mạng. Vui lòng kiểm tra Wi-Fi/4G và thử lại.',
      errorCode: null,
    });
    await reopenedHarness.getResult().selectWeek('2026-W49');
    expect(reopenedHarness.getResult().syncState).toBe('ERROR');
    expect(reopenedHarness.getResult().errorMessage).toContain('Không thể kết nối mạng');
  });
});
