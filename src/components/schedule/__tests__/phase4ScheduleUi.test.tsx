import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultCloudSettlementData } from '../../../engine/settlement';
import { createInitialSessionState } from '../../../engine/sessionReducer';
import {
  computeHeatmap,
  getScheduleSubmissionSummary,
  rankGoldenSlots,
  suggestTwoShifts,
} from '../../../engine/scheduleEngine';
import type { useClubSchedule } from '../../../hooks/useClubSchedule';
import type { Player } from '../../../types/badminton';
import {
  DEFAULT_CLUB_SETTINGS,
  resolveUiPermissions,
  type Club,
  type ClubMember,
  type MemberScheduleEntry,
  type WeekKey,
} from '../../../types/schedule';
import { ClubHostPanel } from '../ClubHostPanel';
import { FinalizeBookingSheet } from '../FinalizeBookingSheet';
import { FIXED_SCHEDULE_HELP_TEXT, MyScheduleEditor } from '../MyScheduleEditor';
import { ScheduleHeatmap } from '../ScheduleHeatmap';
import { ScheduleView } from '../ScheduleView';
import {
  buildBookingSheetGroups,
  buildFreshSessionWithPlayers,
  buildFreshSettlementForNewRoom,
  buildSuggestedClubRoomCode,
  formatScheduleSlotRange,
  formatWeekKeyDisplay,
  getHeatmapIntensityTier,
  getVisibleScheduleHours,
  isValidFourDigitPin,
  isValidRoomPin,
  mapClubMembersToSessionPlayers,
  paintBusySlotsRange,
  partitionMergePlayers,
  resolveNearestScheduleHour,
} from '../scheduleUiHelpers';

function makeMember(
  overrides: Partial<ClubMember> & Pick<ClubMember, 'id' | 'name'>
): ClubMember {
  return {
    clubCode: 'CLB-TEST',
    gender: 'M',
    rank: 'tb',
    rankScore: 10,
    noSingles: false,
    hasPin: false,
    isActive: true,
    authUserId: null,
    createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T00:00:00Z',
    ...overrides,
  };
}

function makeMockSchedule(params?: {
  role?: 'CLUB_HOST' | 'CLUB_MEMBER' | 'GUEST';
  weekKey?: WeekKey;
  isLocked?: boolean;
  allowSelfRegister?: boolean;
  selectedMemberId?: string | null;
  unlockedMemberIds?: readonly string[];
}): ReturnType<typeof useClubSchedule> {
  const weekKey: WeekKey = params?.weekKey ?? '2026-W48';
  const club: Club = {
    clubCode: 'CLB-TEST',
    name: 'CLB Bách Khoa',
    activeRooms: [
      {
        roomCode: 'CLBTEST-T3-19H',
        label: 'T3 · 19h–21h',
        weekKey: '2026-W48',
        dayOfWeek: 1,
        startHour: 19,
        durationHours: 2,
        createdAt: '2026-11-24T10:00:00Z',
      },
    ],
    lockedWeeks: params?.isLocked ? [weekKey] : [],
    settings: {
      ...DEFAULT_CLUB_SETTINGS,
      allowSelfRegister: params?.allowSelfRegister ?? true,
    },
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-24T10:00:00Z',
  };

  const members: ClubMember[] = [
    makeMember({ id: 'm1', name: 'Minh Trí', gender: 'M', rank: 'tb', hasPin: true }),
    makeMember({ id: 'm2', name: 'Hồng Nhung', gender: 'F', rank: 'tby+', noSingles: true }),
    makeMember({ id: 'm3', name: 'Quốc Tuấn', gender: 'M', rank: 'tb+' }),
    makeMember({ id: 'm4', name: 'Phương Thảo', gender: 'F', rank: 'tby' }),
    makeMember({ id: 'm5', name: 'Tiến Đạt', gender: 'M', rank: 'y+' }),
    makeMember({ id: 'm6', name: 'Đức Anh', gender: 'M', rank: 'y-', isActive: false }),
  ];

  const weekEntriesByMemberId: Record<string, MemberScheduleEntry> = {
    m1: {
      id: 'e1',
      clubCode: 'CLB-TEST',
      weekKey,
      memberId: 'm1',
      busySlots: ['0-6', '0-18'],
      note: 'Thứ 2 bận sáng sớm 6h',
      updatedAt: '2026-11-24T09:00:00Z',
    },
    m2: {
      id: 'e2',
      clubCode: 'CLB-TEST',
      weekKey,
      memberId: 'm2',
      busySlots: ['1-19'], // Thứ 3 bận 19h-20h, rảnh 20h-21h -> Vào muộn ở ca 19h-21h
      note: 'T3 vào trễ 30p',
      updatedAt: '2026-11-24T09:00:00Z',
    },
    m3: {
      id: 'e3',
      clubCode: 'CLB-TEST',
      weekKey,
      memberId: 'm3',
      busySlots: [],
      note: '',
      updatedAt: '2026-11-24T09:00:00Z',
    },
    m4: {
      id: 'e4',
      clubCode: 'CLB-TEST',
      weekKey,
      memberId: 'm4',
      busySlots: [],
      note: '',
      updatedAt: '2026-11-24T09:00:00Z',
    },
  };

  const activeMembers = members.filter((m) => m.isActive);
  const selectedMemberId =
    params?.selectedMemberId !== undefined ? params.selectedMemberId : 'm1';
  const selectedMember = activeMembers.find((m) => m.id === selectedMemberId) ?? null;
  const role = params?.role ?? 'CLUB_MEMBER';
  const unlockedSet = new Set(params?.unlockedMemberIds ?? []);

  const heatmapSlots = computeHeatmap({
    members,
    entriesByMemberId: weekEntriesByMemberId,
    durationHours: 2,
    minPlayersPerShift: 4,
  });

  const goldenSlots = rankGoldenSlots(heatmapSlots, { limit: 5, requireMinPlayers: true });
  const twoShiftSuggestions = suggestTwoShifts({
    heatmapSlots,
    members,
    entriesByMemberId: weekEntriesByMemberId,
    minPlayersPerShift: 4,
    limit: 3,
  });

  return {
    clubCode: 'CLB-TEST',
    club,
    role,
    isHost: role === 'CLUB_HOST',
    weekKey,
    durationHours: 2,
    selectedMemberId,
    selectedMember,
    members,
    activeMembers,
    rosterWithPrivateMeta: members.map((m) => ({
      id: m.id,
      name: m.name,
      sex: m.gender,
      rank: m.rank,
      noSingles: m.noSingles,
      hasPin: m.hasPin,
      isActive: m.isActive,
      notes: m.id === 'm1' ? 'Đánh bền' : undefined,
      tags: m.id === 'm1' ? ['Trình cứng'] : undefined,
    })),
    privateMetaMap: {},
    weeklySchedule: null,
    weekEntriesByMemberId,
    fixedEntriesByMemberId: {},
    submissionSummary: getScheduleSubmissionSummary(members, weekEntriesByMemberId),
    heatmapSlots,
    goldenSlots,
    twoShiftSuggestions,
    syncState: 'SYNCED',
    errorMessage: null,
    connectClub: vi.fn(),
    createNewClub: vi.fn(),
    disconnectClub: vi.fn(),
    selectWeek: vi.fn(),
    setDurationHours: vi.fn(),
    selectCurrentMember: vi.fn(),
    unlockHostRole: vi.fn(),
    lockHostRole: vi.fn(),
    isMemberPinUnlocked: vi.fn((memberId: string | null | undefined) =>
      Boolean(memberId && unlockedSet.has(memberId))
    ),
    lockMemberPin: vi.fn((memberId?: string) => {
      if (memberId) unlockedSet.delete(memberId);
    }),
    verifyAndCacheMemberPin: vi.fn(),
    saveScheduleEntry: vi.fn(),
    copyMyFixedToCurrentWeek: vi.fn(),
    copyClubFixedToWeekAsHost: vi.fn(),
    registerMember: vi.fn(),
    updateMemberAsHost: vi.fn(),
    deleteMemberAsHost: vi.fn(),
    updatePrivateMemberMeta: vi.fn(),
    setMemberPersonalPin: vi.fn(),
    toggleWeekLockAsHost: vi.fn(),
    updateSettingsAsHost: vi.fn(),
    attachActiveRoomAsHost: vi.fn(),
    detachActiveRoomAsHost: vi.fn(),
    migrateLegacyRosterAsHost: vi.fn(),
    refreshSchedule: vi.fn(),
  };
}

// Bộ giả lập cây component nhẹ trong môi trường Node (không cần jsdom) để test tương tác click/input/submit thật
interface RenderedNode {
  type: string;
  props: Record<string, unknown>;
  children: Array<RenderedNode | string>;
}

function createInteractiveTreeHarness<P extends object>(
  Component: React.FC<P>,
  initialProps: P
) {
  const internals =
    (React as unknown as Record<string, Record<string, unknown>>)
      .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
    (React as unknown as Record<string, Record<string, unknown>>)
      .__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

  interface ComponentCell {
    states: unknown[];
    refs: Array<{ current: unknown }>;
    memos: Array<{ val: unknown; deps: unknown[] }>;
    callbacks: Array<{ fn: unknown; deps: unknown[] }>;
  }

  const cells = new Map<string, ComponentCell>();
  let activeCell: ComponentCell | null = null;
  let hookIdx = 0;
  let currentProps = initialProps;
  let latestRoot: Array<RenderedNode | string> = [];

  const dispatcher = {
    useState(initial: unknown) {
      const cell = activeCell!;
      const idx = hookIdx++;
      if (!(idx in cell.states)) {
        cell.states[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial;
      }
      const setState = (next: unknown) => {
        const nextVal =
          typeof next === 'function'
            ? (next as (prev: unknown) => unknown)(cell.states[idx])
            : next;
        if (!Object.is(nextVal, cell.states[idx])) {
          cell.states[idx] = nextVal;
          render();
        }
      };
      return [cell.states[idx], setState];
    },
    useRef(initial: unknown) {
      const cell = activeCell!;
      const idx = hookIdx++;
      if (!cell.refs[idx]) {
        cell.refs[idx] = { current: initial };
      }
      return cell.refs[idx];
    },
    useMemo(fn: () => unknown, deps: unknown[]) {
      const cell = activeCell!;
      const idx = hookIdx++;
      const prev = cell.memos[idx];
      if (prev && deps && prev.deps.every((d, i) => Object.is(d, deps[i]))) {
        return prev.val;
      }
      const val = fn();
      cell.memos[idx] = { val, deps };
      return val;
    },
    useCallback(fn: unknown, deps: unknown[]) {
      const cell = activeCell!;
      const idx = hookIdx++;
      const prev = cell.callbacks[idx];
      if (prev && deps && prev.deps.every((d, i) => Object.is(d, deps[i]))) {
        return prev.fn;
      }
      cell.callbacks[idx] = { fn, deps };
      return fn;
    },
    useEffect() {
      hookIdx++;
    },
    useContext(ctx: { _currentValue?: unknown; _currentValue2?: unknown }) {
      return ctx?._currentValue ?? ctx?._currentValue2;
    },
    readContext(ctx: { _currentValue?: unknown; _currentValue2?: unknown }) {
      return ctx?._currentValue ?? ctx?._currentValue2;
    },
  };

  function evaluateNode(node: unknown, path: string): Array<RenderedNode | string> {
    if (node === null || node === undefined || typeof node === 'boolean') {
      return [];
    }
    if (typeof node === 'string' || typeof node === 'number') {
      return [String(node)];
    }
    if (Array.isArray(node)) {
      const out: Array<RenderedNode | string> = [];
      node.forEach((child, idx) => {
        out.push(...evaluateNode(child, `${path}.${idx}`));
      });
      return out;
    }
    if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
      const el = node as {
        type: unknown;
        key?: string | number | null;
        props?: Record<string, unknown>;
      };
      const props = el.props ?? {};
      const nodeKey = el.key != null ? `${path}:${String(el.key)}` : path;

      if (el.type === React.Fragment) {
        return evaluateNode(props.children, `${nodeKey}/frag`);
      }

      if (typeof el.type === 'function') {
        const fnComp = el.type as ((p: Record<string, unknown>) => unknown) & {
          displayName?: string;
          name?: string;
        };
        const compId = `${nodeKey}/${fnComp.displayName || fnComp.name || 'Anon'}`;
        let cell = cells.get(compId);
        if (!cell) {
          cell = { states: [], refs: [], memos: [], callbacks: [] };
          cells.set(compId, cell);
        }
        const prevCell = activeCell;
        const prevIdx = hookIdx;
        activeCell = cell;
        hookIdx = 0;
        let rendered: unknown;
        // Hỗ trợ component tự gọi setState trong render (derived state pattern)
        for (let pass = 0; pass < 4; pass++) {
          hookIdx = 0;
          const snapshot = [...cell.states];
          rendered = fnComp(props);
          const changed =
            snapshot.length !== cell.states.length ||
            snapshot.some((v, i) => !Object.is(v, cell!.states[i]));
          if (!changed) break;
        }
        activeCell = prevCell;
        hookIdx = prevIdx;
        return evaluateNode(rendered, compId);
      }

      if (typeof el.type === 'object' && el.type !== null) {
        // ForwardRef (ví dụ icon Lucide) -> không cần render sâu SVG để cây gọn nhẹ
        const maybeRender = (el.type as { render?: (p: unknown, r: unknown) => unknown })
          .render;
        if (typeof maybeRender === 'function') {
          return evaluateNode(maybeRender(props, null), `${nodeKey}/fwd`);
        }
        return [];
      }

      if (typeof el.type === 'string') {
        return [
          {
            type: el.type,
            props,
            children: evaluateNode(props.children, `${nodeKey}/${el.type}`),
          },
        ];
      }
    }
    return [];
  }

  function render(nextProps?: P) {
    if (nextProps !== undefined) {
      currentProps = nextProps;
    }
    const prevH = internals.H;
    internals.H = dispatcher;
    try {
      latestRoot = evaluateNode(React.createElement(Component, currentProps), 'root');
    } finally {
      internals.H = prevH;
    }
    return latestRoot;
  }

  function getText(n: RenderedNode | string): string {
    if (typeof n === 'string') return n;
    return n.children.map(getText).join('');
  }

  function findAll(predicate: (n: RenderedNode) => boolean): RenderedNode[] {
    const matches: RenderedNode[] = [];
    const walk = (items: Array<RenderedNode | string>) => {
      for (const item of items) {
        if (typeof item === 'string') continue;
        if (predicate(item)) matches.push(item);
        walk(item.children);
      }
    };
    walk(latestRoot);
    return matches;
  }

  render();

  return {
    rerender: (nextProps?: P) => render(nextProps),
    text: () => latestRoot.map(getText).join(' '),
    findAll,
    getNodeText: getText,
  };
}

describe('Phase 4 & Phase 5 — Schedule UI Helpers & Booking Bridge', () => {
  it('mặc định mở đầy đủ toàn bộ 18 khung giờ 06:00 – 24:00 (startHour 6..23)', () => {
    const visible = getVisibleScheduleHours();
    expect(visible).toHaveLength(18);
    expect(visible[0]).toBe(6);
    expect(visible[visible.length - 1]).toBe(23);
    expect(visible).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);

    expect(formatScheduleSlotRange(6)).toBe('06:00 – 07:00');
    expect(formatScheduleSlotRange(15)).toBe('15:00 – 16:00');
    expect(formatScheduleSlotRange(23)).toBe('23:00 – 24:00');
  });

  it('paintBusySlotsRange nội suy liền mạch khi vuốt nhanh từ sáng sớm 6h và bảo toàn các ngày khác', () => {
    const visible = getVisibleScheduleHours();
    const paintedBusy = paintBusySlotsRange({
      currentBusySlots: ['0-6', '3-20'],
      dayOfWeek: 0,
      visibleHours: visible,
      fromHour: 16,
      toHour: 20,
      targetBusy: true,
    });
    expect(paintedBusy).toEqual(['0-6', '0-16', '0-17', '0-18', '0-19', '0-20', '3-20']);

    // Vuốt ngược lên để xóa về Rảnh
    const paintedFree = paintBusySlotsRange({
      currentBusySlots: paintedBusy,
      dayOfWeek: 0,
      visibleHours: visible,
      fromHour: 19,
      toHour: 17,
      targetBusy: false,
    });
    expect(paintedFree).toEqual(['0-6', '0-16', '0-20', '3-20']);

    // Chạm trúng khe hở 6px giữa 2 hàng (17h bottom=148, 18h top=154) vẫn bắt dính hàng gần nhất
    const rowBounds = [
      { hour: 17 as const, top: 100, bottom: 148 },
      { hour: 18 as const, top: 154, bottom: 202 },
    ];
    expect(resolveNearestScheduleHour(150, rowBounds)).toBe(17);
    expect(resolveNearestScheduleHour(153, rowBounds)).toBe(18);
  });

  it('getHeatmapIntensityTier phân đúng 5 bậc (0..4) theo tỷ lệ người rảnh & ngưỡng tối thiểu', () => {
    expect(
      getHeatmapIntensityTier({
        freeCount: 0,
        submittedCount: 10,
        availabilityRatio: 0,
        meetsMinPlayers: false,
      })
    ).toBe(0);

    expect(
      getHeatmapIntensityTier({
        freeCount: 3,
        submittedCount: 3,
        availabilityRatio: 1,
        meetsMinPlayers: false,
      })
    ).toBe(1);

    expect(
      getHeatmapIntensityTier({
        freeCount: 4,
        submittedCount: 8,
        availabilityRatio: 0.5,
        meetsMinPlayers: true,
      })
    ).toBe(2);

    expect(
      getHeatmapIntensityTier({
        freeCount: 7,
        submittedCount: 10,
        availabilityRatio: 0.7,
        meetsMinPlayers: true,
      })
    ).toBe(3);

    expect(
      getHeatmapIntensityTier({
        freeCount: 9,
        submittedCount: 10,
        availabilityRatio: 0.9,
        meetsMinPlayers: true,
      })
    ).toBe(4);
  });

  it('isValidFourDigitPin và formatWeekKeyDisplay xử lý đúng biên dữ liệu', () => {
    expect(isValidFourDigitPin('0686')).toBe(true);
    expect(isValidFourDigitPin(' 1234 ')).toBe(true);
    expect(isValidFourDigitPin('123')).toBe(false);
    expect(isValidFourDigitPin('12345')).toBe(false);
    expect(isValidFourDigitPin('12a4')).toBe(false);
    expect(isValidFourDigitPin('')).toBe(false);

    // Hợp đồng PIN phòng trực tuyến: chỉ 4–6 ký tự (chặn 7–8 ký tự gây khóa Co-Host)
    expect(isValidRoomPin('1234')).toBe(true);
    expect(isValidRoomPin('123456')).toBe(true);
    expect(isValidRoomPin('123')).toBe(false);
    expect(isValidRoomPin('1234567')).toBe(false);
    expect(isValidRoomPin('12345678')).toBe(false);

    const fixedLabel = formatWeekKeyDisplay('FIXED');
    expect(fixedLabel.title).toBe('Lịch cứng hàng tuần');
    expect(fixedLabel.title).not.toContain('FIXED');

    const isoLabel = formatWeekKeyDisplay('2026-W48');
    expect(isoLabel.title).toBe('2026-W48');
    expect(isoLabel.dateSublabel).toBeTruthy();
    expect(isoLabel.dayDateLabels[0]).toMatch(/^\d{2}\/\d{2}$/);
  });

  it('xử lý trọn vẹn 3 kịch bản chốt kèo (Nạp thẳng, Gộp không trùng, Reset/Tạo phòng mới)', () => {
    const m1 = makeMember({ id: 'm1', name: 'Minh Trí', gender: 'M', rank: 'tb+' });
    const m2 = makeMember({
      id: 'm2',
      name: 'Hồng Nhung',
      gender: 'F',
      rank: 'tby+',
      noSingles: true,
    });
    const m3 = makeMember({ id: 'm3', name: 'Quốc Tuấn', gender: 'M', rank: 'tb' });

    // Kịch bản 1: Phòng trống -> giữ nguyên sex, rank, noSingles
    const directPayloads = mapClubMembersToSessionPlayers([m1, m2], 1700000000000);
    expect(directPayloads).toHaveLength(2);
    expect(directPayloads[0]).toMatchObject({
      name: 'Minh Trí',
      sex: 'M',
      rank: 'tb+',
      noSingles: false,
      status: 'ACTIVE',
    });
    expect(directPayloads[1]).toMatchObject({
      name: 'Hồng Nhung',
      sex: 'F',
      rank: 'tby+',
      noSingles: true,
      status: 'ACTIVE',
    });

    // Kịch bản 2a: Gộp thêm người chưa có (bỏ qua trùng tên không phân biệt hoa/thường)
    const existingPlayers: Player[] = [
      {
        id: 'p_existing_1',
        name: '  minh trí ',
        sex: 'M',
        rank: 'tb+',
        status: 'ACTIVE',
        assignedPool: 'ALL',
        gamesPlayed: 3,
        virtualGamesOffset: 0,
        waitStreak: 1,
        lastPlayedAt: 1699999999000,
        singlesCount: 0,
        noSingles: false,
        joinedAt: 1699999000000,
      },
    ];
    const merged = partitionMergePlayers([m1, m2, m3], existingPlayers, 1700000001000);
    expect(merged.alreadyInRoomMembers.map((m) => m.id)).toEqual(['m1']);
    expect(merged.playersToAdd.map((p) => p.name)).toEqual(['Hồng Nhung', 'Quốc Tuấn']);

    // Kịch bản 2b & 3: Dựng session mới & settlement mới giữ settings + bố cục sân nhưng sạch undo/thanh toán cũ
    const baseState = createInitialSessionState();
    const customSettings = { ...baseState.settings, maleBonus: 2.0 };
    const customCourts = baseState.courts.map((c, idx) =>
      idx === 2 ? { ...c, name: 'Sân VIP 3', isActive: true } : c
    );
    const freshSession = buildFreshSessionWithPlayers(
      [m1, m2],
      customSettings,
      1700000002000,
      customCourts
    );
    expect(freshSession.players).toHaveLength(2);
    expect(freshSession.settings.maleBonus).toBe(2.0);
    expect(freshSession.courts[2].name).toBe('Sân VIP 3');
    expect(freshSession.courts[2].isActive).toBe(true);
    expect(freshSession.history).toHaveLength(0);
    expect(freshSession.undoStack).toHaveLength(0);

    const dirtySettlement = createDefaultCloudSettlementData(100);
    dirtySettlement.settings.bankAccount = '99998888';
    dirtySettlement.payments = { p1: { status: 'PAID', approvedAt: 100 } };
    dirtySettlement.betPayments = { bet1: true };

    const freshSettlement = buildFreshSettlementForNewRoom(dirtySettlement, 200);
    expect(freshSettlement.settings.bankAccount).toBe('99998888');
    expect(freshSettlement.payments).toEqual({});
    expect(freshSettlement.betPayments).toEqual({});
    expect(buildSuggestedClubRoomCode('caulong-bk', { dayOfWeek: 1, startHour: 19 })).toBe(
      'CAULONGB-T3-19H'
    );
  });
});

function hasNestedUiCard(html: string): boolean {
  const tagRegex = /<\/?([a-zA-Z0-9-]+)([^>]*)>/g;
  const cardStack: string[] = [];
  const fullStack: Array<{ tag: string; isCard: boolean }> = [];
  const voidTags = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'path', 'circle', 'line', 'polyline', 'rect']);

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    const raw = match[0];
    const tag = match[1].toLowerCase();
    const attrs = match[2] || '';
    const isClosing = raw.startsWith('</');
    const isSelfClosing = raw.endsWith('/>') || voidTags.has(tag);

    if (isClosing) {
      for (let i = fullStack.length - 1; i >= 0; i--) {
        if (fullStack[i].tag === tag) {
          const popped = fullStack.splice(i);
          for (const p of popped) {
            if (p.isCard) cardStack.pop();
          }
          break;
        }
      }
      continue;
    }

    const classMatch = /class="([^"]*)"/.exec(attrs);
    const classes = classMatch ? classMatch[1].split(/\s+/) : [];
    const isCard = classes.includes('ui-card');

    if (isCard && cardStack.length > 0) {
      return true;
    }

    if (!isSelfClosing) {
      fullStack.push({ tag, isCard });
      if (isCard) cardStack.push(tag);
    }
  }
  return false;
}

describe('Phase 4 & Phase 5 — Rendered UI Invariants & 5 UX Refinements', () => {
  it('1.1 & 1.2 & 1.5 — MyScheduleEditor: 18 kíp mặc định (06:00–24:00), bỏ nút Mở rộng sáng sớm, dùng bộ chọn thành viên mới, Set lịch cứng / Áp dụng lịch cứng + nút ⓘ', () => {
    const schedule = makeMockSchedule({ role: 'CLUB_MEMBER', selectedMemberId: 'm1' });
    const perms = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'CLUB_MEMBER',
      clubSettings: schedule.club?.settings,
      isCurrentWeekLocked: false,
    });

    const html = renderToStaticMarkup(
      <MyScheduleEditor schedule={schedule} uiPermissions={perms} />
    );

    // Dải quét liền mạch duy nhất bên phải (data-drag-strip="true") chứa đủ 18 ô giờ mặc định (6h..23h),
    // và touch-action:none CHỈ xuất hiện duy nhất trên container dải quét đó
    const touchNoneMatches = html.match(/touch-action:none/g) ?? [];
    const dragStripMatches = html.match(/data-drag-strip="true"/g) ?? [];
    const dragSlotMatches = html.match(/data-slot-key="0-\d+"/g) ?? [];
    expect(dragStripMatches).toHaveLength(1);
    expect(touchNoneMatches).toHaveLength(1);
    expect(dragSlotMatches).toHaveLength(18);
    expect(html).toContain('06:00 – 07:00');
    expect(html).toContain('23:00 – 24:00');
    expect(html).not.toContain('Mở rộng sáng sớm');

    // Bộ chọn thành viên mới: hiện RankBadge, Đã báo, icon khóa, TUYỆT ĐỐI không có <select> thô hay chữ "Có PIN" / "Đặt PIN 4 số"
    expect(html).toContain('ui-rank-badge');
    expect(html).toContain('Đã báo');
    expect(html).not.toContain('Có PIN');
    expect(html).not.toContain('Đặt PIN 4 số');

    // Đổi tên FIXED sang Set lịch cứng & Áp dụng lịch cứng + nút ⓘ giải thích
    expect(html).toContain('Set lịch cứng');
    expect(html).toContain('Áp dụng lịch cứng');
    expect(html).not.toContain('Khai lịch FIXED');
    expect(html).not.toContain('Sửa mẫu FIXED');
    expect(html).toContain('Giải thích tính năng lịch cứng');
    expect(hasNestedUiCard(html)).toBe(false);

    // Trạng thái 1 của PIN (has_pin = false, ví dụ m2): hiển thị caption nhẹ "Chưa khóa lịch · Tạo PIN 4 số..."
    const unpinnedSchedule = makeMockSchedule({ role: 'CLUB_MEMBER', selectedMemberId: 'm2' });
    const unpinnedHtml = renderToStaticMarkup(
      <MyScheduleEditor schedule={unpinnedSchedule} uiPermissions={perms} />
    );
    expect(unpinnedHtml).toContain('Chưa khóa lịch');
    expect(unpinnedHtml).toContain('Tạo PIN 4 số nếu muốn tránh sửa nhầm');
    expect(unpinnedHtml).not.toContain('Đặt PIN 4 số');
  });

  it('1.1, 1.4 & 1.5 — Tương tác thực tế: Mở sheet chọn thành viên, bật ⓘ popover, chặn sửa khi có PIN chưa mở khóa và cho phép CLUB_HOST sửa thẳng', async () => {
    // A. Thành viên m1 có PIN (hasPin = true) & chưa mở khóa trên máy này
    const unlockedIds = new Set<string>();
    const schedule = makeMockSchedule({
      role: 'CLUB_MEMBER',
      selectedMemberId: 'm1',
      unlockedMemberIds: [],
    });
    schedule.isMemberPinUnlocked = vi.fn((id) => Boolean(id && unlockedIds.has(id)));
    schedule.verifyAndCacheMemberPin = vi.fn(async (memberId: string, pin: string) => {
      if (pin === '0686') {
        unlockedIds.add(memberId);
        return { data: true, error: null, errorCode: null };
      }
      return {
        data: false,
        error: 'Mã PIN cá nhân không chính xác.',
        errorCode: 'INVALID_MEMBER_PIN' as const,
      };
    });

    const perms = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'CLUB_MEMBER',
      clubSettings: schedule.club?.settings,
      isCurrentWeekLocked: false,
    });

    const ui = createInteractiveTreeHarness(MyScheduleEditor, {
      schedule,
      uiPermissions: perms,
    });

    // Lúc mới chọn tên: xem tự do toàn bộ lịch, KHÔNG bật sẵn modal hỏi PIN
    expect(ui.text()).toContain('06:00 – 07:00');
    expect(ui.text()).not.toContain('Nhập PIN 4 số để chỉnh sửa lịch');

    // 1.1 Mở Bottom Sheet chọn thành viên -> thấy cả Đã báo (m1..m4) & Chưa báo (m5), không có chữ "· Có PIN"
    const pickerTrigger = ui.findAll(
      (n) => n.type === 'button' && n.props.id === 'schedule-member-picker-trigger'
    )[0];
    expect(pickerTrigger).toBeDefined();
    (pickerTrigger.props.onClick as () => void)();
    expect(ui.text()).toContain('Chọn thành viên báo lịch');
    expect(ui.text()).toContain('Đã báo');
    expect(ui.text()).toContain('Chưa báo');
    expect(ui.text()).not.toContain('Có PIN');

    // Đóng sheet chọn lại m1
    const m1Row = ui.findAll(
      (n) => n.type === 'button' && ui.getNodeText(n).includes('Minh Trí') && n.props.id !== 'schedule-member-picker-trigger'
    )[0];
    (m1Row.props.onClick as () => void)();

    // 1.5 Bấm vào nút ⓘ -> hiện popover giải thích lịch cứng
    const infoBtn = ui.findAll(
      (n) => n.type === 'button' && n.props['aria-label'] === 'Giải thích tính năng lịch cứng'
    )[0];
    expect(infoBtn).toBeDefined();
    (infoBtn.props.onClick as () => void)();
    expect(ui.text()).toContain(FIXED_SCHEDULE_HELP_TEXT);

    // 1.4 Chạm vào ô giờ 07:00 – 08:00 khi m1 chưa mở khóa PIN -> chặn sửa & bật modal "Nhập PIN 4 số để chỉnh sửa lịch"
    const slot07Btn = ui.findAll(
      (n) => n.type === 'button' && ui.getNodeText(n).includes('07:00 – 08:00')
    )[0];
    expect(slot07Btn).toBeDefined();
    expect(ui.getNodeText(slot07Btn)).toContain('Rảnh');
    (slot07Btn.props.onClick as () => void)();
    expect(ui.text()).toContain('Nhập PIN 4 số để chỉnh sửa lịch');
    // Chưa đổi trạng thái ô 07:00 – 08:00 khi chưa nhập PIN
    const slot07StillFree = ui.findAll(
      (n) => n.type === 'button' && ui.getNodeText(n).includes('07:00 – 08:00')
    )[0];
    expect(ui.getNodeText(slot07StillFree)).toContain('Rảnh');

    // Nhập đúng PIN 0686 và submit -> mở khóa trên máy hiện tại & áp dụng ngay thao tác chạm ô 07:00 – 08:00 sang Bận
    const pinInput = ui.findAll(
      (n) => n.type === 'input' && n.props.placeholder === 'Nhập PIN 4 số...'
    )[0];
    (pinInput.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: '0686' },
    });
    const verifyForm = ui.findAll((n) => n.type === 'form')[0];
    await (verifyForm.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: () => {},
    });
    ui.rerender({ schedule, uiPermissions: perms });

    expect(schedule.verifyAndCacheMemberPin).toHaveBeenCalledWith('m1', '0686');
    expect(ui.text()).not.toContain('Nhập PIN 4 số để chỉnh sửa lịch');
    const slot07NowBusy = ui.findAll(
      (n) => n.type === 'button' && ui.getNodeText(n).includes('07:00 – 08:00')
    )[0];
    expect(ui.getNodeText(slot07NowBusy)).toContain('Bận');

    // Lần chạm tiếp theo vào ô 08:00 – 09:00 sửa thẳng KHÔNG hỏi lại PIN
    const slot08Btn = ui.findAll(
      (n) => n.type === 'button' && ui.getNodeText(n).includes('08:00 – 09:00')
    )[0];
    (slot08Btn.props.onClick as () => void)();
    expect(ui.text()).not.toContain('Nhập PIN 4 số để chỉnh sửa lịch');
    const slot08NowBusy = ui.findAll(
      (n) => n.type === 'button' && ui.getNodeText(n).includes('08:00 – 09:00')
    )[0];
    expect(ui.getNodeText(slot08NowBusy)).toContain('Bận');

    // B. Quyền CLUB_HOST: sửa trực tiếp lịch của thành viên có PIN mà KHÔNG bao giờ hỏi PIN cá nhân
    const hostSchedule = makeMockSchedule({
      role: 'CLUB_HOST',
      selectedMemberId: 'm1',
      unlockedMemberIds: [],
    });
    const hostPerms = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'CLUB_HOST',
      clubSettings: hostSchedule.club?.settings,
      isCurrentWeekLocked: false,
    });
    const hostUi = createInteractiveTreeHarness(MyScheduleEditor, {
      schedule: hostSchedule,
      uiPermissions: hostPerms,
    });
    const hostSlot09 = hostUi.findAll(
      (n) => n.type === 'button' && hostUi.getNodeText(n).includes('09:00 – 10:00')
    )[0];
    (hostSlot09.props.onClick as () => void)();
    expect(hostUi.text()).not.toContain('Nhập PIN 4 số để chỉnh sửa lịch');
    const hostSlot09After = hostUi.findAll(
      (n) => n.type === 'button' && hostUi.getNodeText(n).includes('09:00 – 10:00')
    )[0];
    expect(hostUi.getNodeText(hostSlot09After)).toContain('Bận');
  });

  it('ScheduleHeatmap: hiển thị đầy đủ từ 6h sáng, không còn nút Mở rộng sáng sớm và chỉ dùng class đơn sắc ui-heatmap-*', () => {
    const schedule = makeMockSchedule({ role: 'CLUB_MEMBER' });
    const html = renderToStaticMarkup(
      <ScheduleHeatmap schedule={schedule} onSelectHeatmapSlot={() => {}} />
    );

    expect(html).toContain('1h');
    expect(html).toContain('1.5h');
    expect(html).toContain('2h');
    expect(html).toContain('3h');
    expect(html).toContain('6h–8h');
    expect(html).not.toContain('Mở rộng sáng sớm');
    expect(html).toContain('Top khung giờ vàng');
    expect(html).toContain('Gợi ý chia 2 ca tối ưu');
    expect(html).toContain('ui-heatmap-4');
    // Tuyệt đối không dùng màu cầu vồng Tailwind
    expect(html).not.toMatch(/bg-(emerald|rose|amber|blue|violet|indigo|cyan|purple)-/);
  });

  it('ScheduleHeatmap Stage B: 2 card cao bằng nhau, nút 1 chạm Đưa vào buổi và thông báo chưa cần chia 2 ca', () => {
    const schedule = makeMockSchedule({ role: 'CLUB_HOST' });
    const html = renderToStaticMarkup(
      <ScheduleHeatmap schedule={schedule} onSelectHeatmapSlot={() => {}} />
    );

    expect(html).toContain('items-stretch');
    expect(html).not.toContain('items-start"');
    expect(html).toContain('Đưa vào buổi');
    expect(html).toContain('Xem tất cả (');
    expect(html).toContain('khung giờ)');
    // Mock: 4/4 người rảnh toàn tuần -> đã có khung phủ 100%
    expect(html).toContain('Cả nhóm đã có khung giờ rảnh chung (4/4) — chưa cần chia 2 ca');
    expect(html).toContain('Tìm 2 buổi khác ngày trong tuần');
  });

  it('FinalizeBookingSheet: phân tách Rảnh trọn buổi & Bận 1 kíp, ẩn nút chốt với thành viên thường và mở đủ 3 kịch bản cho CLUB_HOST', () => {
    const schedule = makeMockSchedule({ role: 'CLUB_MEMBER' });
    // Khung T3 19h–21h: m1, m3, m4 rảnh trọn buổi (3 người); m2 bận 19h rảnh 20h -> Vào muộn (1 người); m5 chưa nộp
    const tuesday19Slot = schedule.heatmapSlots.find(
      (s) => s.dayOfWeek === 1 && s.startHour === 19
    )!;
    expect(tuesday19Slot).toBeDefined();

    const groups = buildBookingSheetGroups({
      slot: tuesday19Slot,
      members: schedule.activeMembers,
    });
    expect(groups.fullFreeMembers).toHaveLength(3);
    expect(groups.partialBusyItems).toHaveLength(1);
    expect(groups.partialBusyItems[0].tagLabelVi).toBe('Vào muộn');
    expect(groups.defaultCheckedIds).toEqual(groups.fullFreeMembers.map((m) => m.id));

    const memberPerms = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'CLUB_MEMBER',
      clubSettings: schedule.club?.settings,
    });

    const memberHtml = renderToStaticMarkup(
      <FinalizeBookingSheet
        slot={tuesday19Slot}
        onClose={() => {}}
        schedule={schedule}
        uiPermissions={memberPerms}
        roomCode={null}
        roomRole="OFFLINE"
        sessionPlayers={[]}
        maleBonus={1.5}
        onPushPlayersToQueue={() => {}}
        onResetAndPushPlayersToQueue={() => {}}
        onCreateClubRoomWithPlayers={async () => ({ ok: true })}
      />
    );
    expect(memberHtml).toContain('Rảnh trọn buổi (3)');
    expect(memberHtml).toContain('Bận 1 kíp / vào muộn - về sớm (1)');
    expect(memberHtml).toContain('Vào muộn');
    expect(memberHtml).not.toContain('Chốt kèo &amp; Đưa vào Hàng chờ');

    // Với CLUB_HOST khi phòng trống (Kịch bản 1 & 3)
    const hostSchedule = makeMockSchedule({ role: 'CLUB_HOST' });
    const hostPerms = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'CLUB_HOST',
      clubSettings: hostSchedule.club?.settings,
    });

    const hostEmptyRoomHtml = renderToStaticMarkup(
      <FinalizeBookingSheet
        slot={tuesday19Slot}
        onClose={() => {}}
        schedule={hostSchedule}
        uiPermissions={hostPerms}
        roomCode={null}
        roomRole="OFFLINE"
        sessionPlayers={[]}
        maleBonus={1.5}
        onPushPlayersToQueue={() => {}}
        onResetAndPushPlayersToQueue={() => {}}
        onCreateClubRoomWithPlayers={async () => ({ ok: true })}
      />
    );
    expect(hostEmptyRoomHtml).toContain('Chốt kèo &amp; Đưa vào Hàng chờ');
    expect(hostEmptyRoomHtml).toContain('Nạp thẳng vào Hàng chờ hiện tại');
    expect(hostEmptyRoomHtml).toContain('Tạo phòng LIVE mới gắn với CLB');

    // Với CLUB_HOST khi phòng đang có người (Kịch bản 2a, 2b & 3)
    const existingSessionPlayers: Player[] = [
      {
        id: 'p1',
        name: 'Minh Trí',
        sex: 'M',
        rank: 'tb',
        status: 'ACTIVE',
        assignedPool: 'ALL',
        gamesPlayed: 1,
        virtualGamesOffset: 0,
        waitStreak: 0,
        lastPlayedAt: 0,
        singlesCount: 0,
        noSingles: false,
        joinedAt: 1,
      },
    ];
    const hostBusyRoomHtml = renderToStaticMarkup(
      <FinalizeBookingSheet
        slot={tuesday19Slot}
        onClose={() => {}}
        schedule={hostSchedule}
        uiPermissions={hostPerms}
        roomCode="SAN-99"
        roomRole="CO_HOST"
        sessionPlayers={existingSessionPlayers}
        maleBonus={1.5}
        onPushPlayersToQueue={() => {}}
        onResetAndPushPlayersToQueue={() => {}}
        onCreateClubRoomWithPlayers={async () => ({ ok: true })}
      />
    );
    expect(hostBusyRoomHtml).toContain('Gộp thêm người chưa có (2 người mới)');
    expect(hostBusyRoomHtml).toContain('Reset buổi mới &amp; nạp 3 người này');
    expect(hostBusyRoomHtml).toContain('Tạo phòng LIVE mới gắn với CLB');
  });

  it('1.3 & Host Panel — ScheduleView hiển thị pill "Mã CLB: CLB-TEST" (bấm copy link kèm toast "Đã sao chép link CLB"), mô tả 18 kíp và bảng quản trị CLUB_HOST', async () => {
    const guestSchedule = makeMockSchedule({ role: 'GUEST' });
    const guestPerms = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'GUEST',
      clubSettings: guestSchedule.club?.settings,
    });
    expect(
      renderToStaticMarkup(
        <ClubHostPanel schedule={guestSchedule} uiPermissions={guestPerms} maleBonus={1.5} />
      )
    ).toBe('');

    const hostSchedule = makeMockSchedule({ role: 'CLUB_HOST' });
    const hostPerms = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'CLUB_HOST',
      clubSettings: hostSchedule.club?.settings,
    });
    const hostViewHtml = renderToStaticMarkup(
      <ScheduleView
        schedule={hostSchedule}
        uiPermissions={hostPerms}
        roomCode={null}
        roomRole="OFFLINE"
        sessionPlayers={[]}
        maleBonus={1.5}
        onJoinLiveRoom={() => {}}
        onPushPlayersToQueue={() => {}}
        onResetAndPushPlayersToQueue={() => {}}
        onCreateClubRoomWithPlayers={async () => ({ ok: true })}
      />
    );

    expect(hostViewHtml).toContain('Mã CLB:');
    expect(hostViewHtml).toContain('CLB-TEST');
    expect(hostViewHtml).not.toContain('>?club=CLB-TEST<');
    expect(hostViewHtml).toContain('18 kíp');
    expect(hostViewHtml).toContain('Lịch của tôi');
    expect(hostViewHtml).toContain('Tổng hợp &amp; Chốt sân');
    expect(hostViewHtml).toContain('Bảng điều khiển Quản trị CLB');
    expect(hostViewHtml).toContain('Thành viên tự thêm tên');
    expect(hostViewHtml).toContain('Khóa sổ tuần 2026-W48');
    expect(hostViewHtml).toContain('Reset PIN');
    expect(hostViewHtml).toContain('Hiện thành viên đã ẩn (1)');
    expect(hasNestedUiCard(hostViewHtml)).toBe(false);

    // Kiểm chứng bấm vào pill Mã CLB copy link ?club=CLB-TEST vào clipboard & gọi toast "Đã sao chép link CLB"
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    const prevNavigator = globalThis.navigator;
    const prevWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://badminton.app', pathname: '/' } },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      configurable: true,
      writable: true,
    });

    try {
      const onShowToast = vi.fn();
      const viewUi = createInteractiveTreeHarness(ScheduleView, {
        schedule: hostSchedule,
        uiPermissions: hostPerms,
        roomCode: null,
        roomRole: 'OFFLINE',
        sessionPlayers: [],
        maleBonus: 1.5,
        onJoinLiveRoom: () => {},
        onPushPlayersToQueue: () => {},
        onResetAndPushPlayersToQueue: () => {},
        onCreateClubRoomWithPlayers: async () => ({ ok: true }),
        onShowToast,
      });

      const badgeBtn = viewUi.findAll(
        (n) =>
          n.type === 'button' &&
          n.props['aria-label'] === 'Sao chép link mời Mã CLB CLB-TEST'
      )[0];
      expect(badgeBtn).toBeDefined();
      await (badgeBtn.props.onClick as () => Promise<void> | void)();
      await Promise.resolve();

      expect(writeTextMock).toHaveBeenCalledWith('https://badminton.app/?club=CLB-TEST');
      expect(onShowToast).toHaveBeenCalledWith('Đã sao chép link CLB');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: prevWindow,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: prevNavigator,
        configurable: true,
        writable: true,
      });
    }
  });

  it('Hardening Phase 5 — Hiển thị lỗi offline ngay trong Modal PIN, chặn ghost-click dải quét, hỗ trợ click bàn phím/AT trên lưới Desktop, fallback copy HTTP LAN & banner offline khi xem cache CLB', async () => {
    // 1. Khi Modal 3 ("Nhập PIN 4 số để chỉnh sửa lịch") đang mở để lưu lịch mà rớt mạng / khóa tuần,
    //    lỗi phải hiện ngay bên trong Modal 3 (không bị che khuất phía sau scrim)
    const lockedMemberSched = makeMockSchedule({
      role: 'CLUB_MEMBER',
      selectedMemberId: 'm1',
      unlockedMemberIds: [],
    });
    lockedMemberSched.saveScheduleEntry = vi.fn().mockResolvedValue({
      data: null,
      error: 'Không thể kết nối mạng. Vui lòng kiểm tra Wi-Fi/4G và thử lại.',
      errorCode: null,
    });
    const memberPerms = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'CLUB_MEMBER',
      clubSettings: lockedMemberSched.club?.settings,
    });
    const editorUi = createInteractiveTreeHarness(MyScheduleEditor, {
      schedule: lockedMemberSched,
      uiPermissions: memberPerms,
    });

    // Kiểm chứng dải quét mobile gọi preventDefault() khi bị chặn PIN để chống ghost-click đóng modal
    const dragStrip = editorUi.findAll(
      (n) => n.type === 'div' && n.props['data-drag-strip'] === 'true'
    )[0];
    const preventDefaultSpy = vi.fn();
    const stopPropagationSpy = vi.fn();
    (dragStrip.props.onPointerDown as (e: unknown) => void)({
      pointerType: 'touch',
      button: 0,
      clientY: 120,
      pointerId: 1,
      preventDefault: preventDefaultSpy,
      stopPropagation: stopPropagationSpy,
    });
    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(stopPropagationSpy).toHaveBeenCalledTimes(1);
    expect(editorUi.text()).toContain('Nhập PIN 4 số để chỉnh sửa lịch');

    // Hủy modal dải quét rồi bấm nút "Cập nhật lịch tuần" -> nhập PIN -> gặp lỗi mạng -> hiện lỗi trong modal
    const cancelBtn = editorUi.findAll(
      (n) => n.type === 'button' && editorUi.getNodeText(n) === 'Hủy'
    )[0];
    (cancelBtn.props.onClick as () => void)();

    const submitBtn = editorUi.findAll(
      (n) => n.type === 'button' && editorUi.getNodeText(n).includes('Cập nhật lịch tuần')
    )[0];
    (submitBtn.props.onClick as () => void)();
    expect(editorUi.text()).toContain('Nhập PIN 4 số để chỉnh sửa lịch');

    const pinField = editorUi.findAll(
      (n) => n.type === 'input' && n.props.placeholder === 'Nhập PIN 4 số...'
    )[0];
    (pinField.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: '0686' },
    });
    const modalForm = editorUi.findAll((n) => n.type === 'form')[0];
    await (modalForm.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: () => {},
    });
    // Modal vẫn mở và hiển thị rõ thông báo rớt mạng ngay trong verifyPinError
    expect(editorUi.text()).toContain('Nhập PIN 4 số để chỉnh sửa lịch');
    expect(editorUi.text()).toContain('Không thể kết nối mạng');

    // 2. Trên lưới Desktop (7x18): cả kích hoạt bằng bàn phím/screen-reader (onClick đơn lẻ) lẫn kéo chuột (onMouseDown -> onClick) đều đảo đúng 1 lần không bị nháy kép
    const freeEditSched = makeMockSchedule({ role: 'CLUB_MEMBER', selectedMemberId: 'm2' });
    const desktopUi = createInteractiveTreeHarness(MyScheduleEditor, {
      schedule: freeEditSched,
      uiPermissions: memberPerms,
    });
    const getDesktopMon06Cell = () =>
      desktopUi.findAll(
        (n) =>
          n.type === 'button' &&
          typeof n.props.onMouseDown === 'function' &&
          typeof n.props.onMouseEnter === 'function'
      )[0];
    expect(desktopUi.getNodeText(getDesktopMon06Cell())).toBe('Rảnh');
    // Synthetic click (bàn phím / VoiceOver) không qua mousedown -> đảo sang Bận
    (getDesktopMon06Cell().props.onClick as () => void)();
    expect(desktopUi.getNodeText(getDesktopMon06Cell())).toBe('Bận');
    // Chuột thật: mousedown đảo về Rảnh, theo sau là click -> KHÔNG bị đảo ngược lại thành Bận
    (getDesktopMon06Cell().props.onMouseDown as (e: { button: number; preventDefault: () => void }) => void)({
      button: 0,
      preventDefault: () => {},
    });
    (getDesktopMon06Cell().props.onClick as () => void)();
    expect(desktopUi.getNodeText(getDesktopMon06Cell())).toBe('Rảnh');

    // 3. Việt hóa sạch sẽ trên màn hình FIXED & hiển thị banner offline kèm nút "Thử lại" khi CLB đã kết nối từ cache
    const hostFixedOffline = makeMockSchedule({
      role: 'CLUB_HOST',
      weekKey: 'FIXED',
    });
    hostFixedOffline.syncState = 'ERROR';
    hostFixedOffline.errorMessage = 'Không thể kết nối mạng. Vui lòng kiểm tra Wi-Fi/4G và thử lại.';
    const hostPerms = resolveUiPermissions({
      roomRole: 'OFFLINE',
      clubRole: 'CLUB_HOST',
      clubSettings: hostFixedOffline.club?.settings,
    });

    const prevNav = globalThis.navigator;
    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const execCopyMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'http://192.168.1.10:5173', pathname: '/' } },
      configurable: true,
      writable: true,
    });
    // Môi trường LAN HTTP trên điện thoại: navigator.clipboard bị undefined
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: {
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
        createElement: vi.fn(() => ({
          value: '',
          style: {},
          setAttribute: vi.fn(),
          select: vi.fn(),
        })),
        execCommand: execCopyMock,
      },
      configurable: true,
      writable: true,
    });

    try {
      const onToast = vi.fn();
      const viewUi = createInteractiveTreeHarness(ScheduleView, {
        schedule: hostFixedOffline,
        uiPermissions: hostPerms,
        roomCode: null,
        roomRole: 'OFFLINE',
        sessionPlayers: [],
        maleBonus: 1.5,
        onJoinLiveRoom: () => {},
        onPushPlayersToQueue: () => {},
        onResetAndPushPlayersToQueue: () => {},
        onCreateClubRoomWithPlayers: async () => ({ ok: true }),
        onShowToast: onToast,
      });

      expect(viewUi.text()).toContain('Lịch cứng hàng tuần');
      expect(viewUi.text()).toContain('Khóa sửa Lịch cứng');
      expect(viewUi.text()).not.toContain('Khóa sổ tuần FIXED');
      expect(viewUi.text()).toContain('Không thể kết nối mạng');

      const retryBtn = viewUi.findAll(
        (n) => n.type === 'button' && viewUi.getNodeText(n).includes('Thử lại')
      )[0];
      expect(retryBtn).toBeDefined();
      (retryBtn.props.onClick as () => void)();
      expect(hostFixedOffline.refreshSchedule).toHaveBeenCalledTimes(1);

      const copyPill = viewUi.findAll(
        (n) =>
          n.type === 'button' &&
          n.props['aria-label'] === 'Sao chép link mời Mã CLB CLB-TEST'
      )[0];
      await (copyPill.props.onClick as () => Promise<void>)();
      expect(execCopyMock).toHaveBeenCalledWith('copy');
      expect(onToast).toHaveBeenCalledWith('Đã sao chép link CLB');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: prevWin,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: prevNav,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'document', {
        value: prevDoc,
        configurable: true,
        writable: true,
      });
    }
  });
});
