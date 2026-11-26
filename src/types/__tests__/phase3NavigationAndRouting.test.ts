import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ALL_APP_NAV_TABS,
  resolveClubUrlInitialTab,
  resolveUiPermissions,
} from '../schedule';
import { BottomNav } from '../../components/BottomNav';
import { QueueTab } from '../../components/QueueTab';
import { useCloudRoom } from '../../hooks/useCloudRoom';
import { createInitialSessionState } from '../../engine/sessionReducer';
import type { BadmintonSessionState } from '../../types/badminton';
import type { CloudSettlementData } from '../../engine/settlement';
import {
  setActiveClubCode,
  upsertClubMember,
  getClubRoster,
} from '../../engine/clubRosterStorage';

vi.mock('../../services/supabaseSync', () => ({
  fetchRoom: vi.fn(async (code: string) => ({
    data: {
      room_code: code,
      pin_code: '1234',
      session_data: createInitialSessionState(),
      settlement_data: null,
      updated_at: 1000,
      updated_by: 'other-client',
    },
    error: null,
  })),
  upsertRoom: vi.fn(async () => ({ error: null })),
  updateRoomSettlementOnly: vi.fn(async () => ({ error: null })),
  updateRoomPinOnly: vi.fn(async () => ({ error: null })),
  subscribeToRoom: vi.fn(() => () => {}),
  getClientId: () => 'CLIENT_PHASE3_TEST',
  STORAGE_KEY_CLOUD_ROOM: 'badminton_cloud_room_state_v1',
}));

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
        states[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial;
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
    getResult: () => currentResult,
  };
}

describe('Phase 3 — Navigation 5 Tabs, Permission Matrix & ?club= Routing', () => {
  let mockLocal: Record<string, string> = {};
  let currentHref = 'https://pegboard.local/';

  beforeEach(() => {
    mockLocal = {};
    currentHref = 'https://pegboard.local/';

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

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          get href() {
            return currentHref;
          },
          get search() {
            return new URL(currentHref).search;
          },
          get pathname() {
            return new URL(currentHref).pathname;
          },
          get hash() {
            return new URL(currentHref).hash;
          },
        },
        history: {
          replaceState: (_data: unknown, _unused: string, nextUrl?: string | URL | null) => {
            if (nextUrl) {
              currentHref = new URL(String(nextUrl), 'https://pegboard.local').toString();
            }
          },
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  it('cố định đúng 5 tab trên BottomNav cho cả Host, Co-Host và VIEWER', () => {
    expect(ALL_APP_NAV_TABS).toEqual([
      'schedule',
      'courts',
      'queue',
      'history',
      'settlement',
    ]);

    const viewerGuest = resolveUiPermissions({
      roomRole: 'VIEWER',
      clubRole: 'GUEST',
    });
    const hostClubAdmin = resolveUiPermissions({
      roomRole: 'CO_HOST',
      clubRole: 'CLUB_HOST',
    });

    expect(viewerGuest.visibleTabs).toEqual(ALL_APP_NAV_TABS);
    expect(hostClubAdmin.visibleTabs).toEqual(ALL_APP_NAV_TABS);
    expect(viewerGuest.visibleTabs).toHaveLength(5);
  });

  it('ẩn sub-tab Luật cặp với VIEWER nhưng vẫn giữ độc lập quyền Lịch tuần theo ClubRole', () => {
    const viewerButClubMember = resolveUiPermissions({
      roomRole: 'VIEWER',
      clubRole: 'CLUB_MEMBER',
      isCurrentWeekLocked: false,
    });

    expect(viewerButClubMember.isRoomViewer).toBe(true);
    expect(viewerButClubMember.canViewPairRulesSubTab).toBe(false);
    expect(viewerButClubMember.canMutateSession).toBe(false);
    expect(viewerButClubMember.canSelfReportPayment).toBe(true);
    // Vẫn điền được lịch cá nhân của mình trong CLB dù đang là VIEWER ở phòng đánh!
    expect(viewerButClubMember.canEditOwnSchedule).toBe(true);
    expect(viewerButClubMember.canSetOwnPin).toBe(true);
    expect(viewerButClubMember.canFinalizeBookingAndRooms).toBe(false);

    // Khi tuần bị khóa bởi Host CLB: thành viên thường bị khóa sửa, chỉ CLUB_HOST sửa được
    const memberOnLockedWeek = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'CLUB_MEMBER',
      isCurrentWeekLocked: true,
    });
    const clubHostOnLockedWeek = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'CLUB_HOST',
      isCurrentWeekLocked: true,
    });

    expect(memberOnLockedWeek.canEditOwnSchedule).toBe(false);
    expect(clubHostOnLockedWeek.canEditOwnSchedule).toBe(true);
    expect(clubHostOnLockedWeek.canFinalizeBookingAndRooms).toBe(true);
    expect(clubHostOnLockedWeek.canViewPairRulesSubTab).toBe(true);
  });

  it('định tuyến URL ?club= & ?room=: mặc định mở Sân, chỉ tự mở Lịch tuần khi có ?club= mà chưa có sân LIVE', () => {
    expect(
      resolveClubUrlInitialTab({
        hasClubParam: false,
        hasRoomParam: false,
        activeRoomsCount: 0,
      })
    ).toBe('courts');

    expect(
      resolveClubUrlInitialTab({
        hasClubParam: false,
        hasRoomParam: true,
        activeRoomsCount: 0,
      })
    ).toBe('courts');

    expect(
      resolveClubUrlInitialTab({
        hasClubParam: true,
        hasRoomParam: true,
        activeRoomsCount: 1,
      })
    ).toBe('courts');

    expect(
      resolveClubUrlInitialTab({
        hasClubParam: true,
        hasRoomParam: false,
        activeRoomsCount: 1,
      })
    ).toBe('courts');

    expect(
      resolveClubUrlInitialTab({
        hasClubParam: true,
        hasRoomParam: false,
        activeRoomsCount: 0,
      })
    ).toBe('schedule');
  });

  it('leaveRoom chỉ reset session/settlement & xóa ?room=, tuyệt đối không xóa dữ liệu CLB / myMemberId / Lịch tuần', async () => {
    currentHref = 'https://pegboard.local/?club=CAULONG-BK&room=SAN-T7&pin=1234';

    const clubCtxKey = 'badminton_club_schedule_ctx_v1';
    const clubScheduleCacheKey = 'badminton_club_schedule_cache_v1_CAULONG-BK_2026-W48';
    localStorage.setItem(
      clubCtxKey,
      JSON.stringify({
        clubCode: 'CAULONG-BK',
        selectedMemberId: '11111111-2222-4333-8444-555555555555',
        weekKey: '2026-W48',
        durationHours: 2,
      })
    );
    localStorage.setItem(
      clubScheduleCacheKey,
      JSON.stringify([{ memberId: '11111111-2222-4333-8444-555555555555', busySlots: ['2-18'] }])
    );
    setActiveClubCode('CAULONG-BK');
    upsertClubMember({ name: 'Minh BK', sex: 'M', rank: 'tb+' });

    let appliedSession: BadmintonSessionState = createInitialSessionState();
    const onApplyCloudState = vi.fn((s: BadmintonSessionState) => {
      appliedSession = s;
    });
    const onApplyCloudSettlement = vi.fn(
      (_data: CloudSettlementData, _role: string) => {}
    );

    const harness = createHookHarness(() =>
      useCloudRoom({
        currentState: appliedSession,
        onApplyCloudState,
        currentSettlement: undefined,
        onApplyCloudSettlement,
      })
    );

    harness.render(undefined);
    await harness.getResult().joinRoom('SAN-T7', '1234');

    expect(harness.getResult().roomCode).toBe('SAN-T7');
    expect(window.location.search).toBe('?club=CAULONG-BK');

    harness.getResult().leaveRoom();

    expect(harness.getResult().roomCode).toBeNull();
    expect(harness.getResult().role).toBe('OFFLINE');
    expect(onApplyCloudSettlement).toHaveBeenLastCalledWith(
      expect.objectContaining({ payments: {} }),
      'OFFLINE'
    );

    // Kiểm chứng bảo toàn 100% dữ liệu CLB, myMemberId, cache lịch tuần & ?club= trên URL
    expect(window.location.search).toBe('?club=CAULONG-BK');
    const preservedCtx = JSON.parse(localStorage.getItem(clubCtxKey) || '{}') as {
      clubCode?: string;
      selectedMemberId?: string;
    };
    expect(preservedCtx.clubCode).toBe('CAULONG-BK');
    expect(preservedCtx.selectedMemberId).toBe('11111111-2222-4333-8444-555555555555');
    expect(localStorage.getItem(clubScheduleCacheKey)).toBeTruthy();
    expect(getClubRoster().some((m) => m.name === 'Minh BK')).toBe(true);
  });

  it('BottomNav render đủ 5 tab cho cả Host & VIEWER, giữ badge đỏ conflictCount trên Hàng chờ cho Host', () => {
    const hostHtml = renderToStaticMarkup(
      React.createElement(BottomNav, {
        activeTab: 'courts',
        onSelectTab: () => {},
        waitingCount: 6,
        conflictCount: 2,
        pendingPaymentsCount: 1,
        isViewer: false,
      })
    );

    for (const label of ['Lịch tuần', 'Sân', 'Hàng chờ', 'Lịch sử', 'Tính tiền']) {
      expect(hostHtml).toContain(label);
    }
    expect(hostHtml).toContain('grid-cols-5');
    expect(hostHtml).toContain('min-h-[44px]');
    expect(hostHtml).toContain('--color-danger-solid');
    expect(hostHtml).toContain('>2<');

    const viewerHtml = renderToStaticMarkup(
      React.createElement(BottomNav, {
        activeTab: 'schedule',
        onSelectTab: () => {},
        waitingCount: 6,
        conflictCount: 2,
        pendingPaymentsCount: 1,
        isViewer: true,
      })
    );

    for (const label of ['Lịch tuần', 'Sân', 'Hàng chờ', 'Lịch sử', 'Tính tiền']) {
      expect(viewerHtml).toContain(label);
    }
    expect(viewerHtml).toContain('grid-cols-5');
    // VIEWER không hiển thị cảnh báo đỏ của Luật cặp, thay vào đó hiển thị waitingCount = 6
    expect(viewerHtml).not.toContain('--color-danger-solid');
    expect(viewerHtml).toContain('>6<');
  });

  it('QueueTab render sub-tab Danh sách chờ | Luật cặp cho Host (kèm badge đỏ conflictCount) và ẩn hoàn toàn với VIEWER', () => {
    const noop = () => {};

    const hostQueueHtml = renderToStaticMarkup(
      React.createElement(QueueTab, {
        players: [],
        courts: [],
        isViewer: false,
        onAddPlayer: noop,
        onAddPlayers: noop,
        onPausePlayer: noop,
        onResumePlayer: noop,
        onEditRank: noop,
        onUpdatePlayer: noop,
        onRemovePlayer: noop,
        pairRules: [],
        ruleConflicts: [
          {
            playerAId: 'a',
            playerBId: 'b',
            ruleIds: ['r1', 'r2'],
            message: 'Xung đột luật cặp',
          },
        ],
        onAddRule: noop,
        onRemoveRule: noop,
      })
    );

    expect(hostQueueHtml).toContain('Danh sách chờ');
    expect(hostQueueHtml).toContain('Luật cặp');
    expect(hostQueueHtml).toContain('--color-danger-solid');

    const viewerQueueHtml = renderToStaticMarkup(
      React.createElement(QueueTab, {
        players: [],
        courts: [],
        isViewer: true,
        onAddPlayer: noop,
        onAddPlayers: noop,
        onPausePlayer: noop,
        onResumePlayer: noop,
        onEditRank: noop,
        onUpdatePlayer: noop,
        onRemovePlayer: noop,
        pairRules: [],
        ruleConflicts: [
          {
            playerAId: 'a',
            playerBId: 'b',
            ruleIds: ['r1', 'r2'],
            message: 'Xung đột luật cặp',
          },
        ],
        onAddRule: noop,
        onRemoveRule: noop,
      })
    );

    expect(viewerQueueHtml).not.toContain('Chế độ Hàng chờ và Luật cặp');
    expect(viewerQueueHtml).not.toContain('Luật cặp');
  });
});
