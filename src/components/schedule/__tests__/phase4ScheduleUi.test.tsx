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
import { MyScheduleEditor } from '../MyScheduleEditor';
import { ScheduleHeatmap } from '../ScheduleHeatmap';
import { ScheduleView } from '../ScheduleView';
import {
  buildBookingSheetGroups,
  buildFreshSessionWithPlayers,
  buildFreshSettlementForNewRoom,
  buildSuggestedClubRoomCode,
  countEarlyMorningBusySlots,
  formatWeekKeyDisplay,
  getHeatmapIntensityTier,
  getVisibleScheduleHours,
  isValidFourDigitPin,
  mapClubMembersToSessionPlayers,
  paintBusySlotsRange,
  partitionMergePlayers,
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
      busySlots: ['0-8', '0-18'],
      note: 'Thứ 2 bận sáng',
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
    m5: {
      id: 'e5',
      clubCode: 'CLB-TEST',
      weekKey,
      memberId: 'm5',
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

describe('Phase 4 — Schedule UI Helpers & Booking Bridge', () => {
  it('mặc định mở khung 15h–24h (startHour 15..23) và mở rộng sáng sớm thêm 7h–15h (startHour 7..23)', () => {
    const collapsed = getVisibleScheduleHours(false);
    expect(collapsed).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23]);

    const expanded = getVisibleScheduleHours(true);
    expect(expanded).toHaveLength(17);
    expect(expanded[0]).toBe(7);
    expect(expanded[expanded.length - 1]).toBe(23);

    expect(countEarlyMorningBusySlots(['0-7', '0-14', '0-15', '2-19'])).toBe(2);
    expect(countEarlyMorningBusySlots(['0-7', '2-8'], 2)).toBe(1);
  });

  it('paintBusySlotsRange nội suy liền mạch khi vuốt nhanh và bảo toàn các kíp sáng sớm/ngày khác', () => {
    const visible = getVisibleScheduleHours(false);
    const paintedBusy = paintBusySlotsRange({
      currentBusySlots: ['0-8', '3-20'],
      dayOfWeek: 0,
      visibleHours: visible,
      fromHour: 16,
      toHour: 20,
      targetBusy: true,
    });
    expect(paintedBusy).toEqual(['0-8', '0-16', '0-17', '0-18', '0-19', '0-20', '3-20']);

    // Vuốt ngược lên để xóa về Rảnh
    const paintedFree = paintBusySlotsRange({
      currentBusySlots: paintedBusy,
      dayOfWeek: 0,
      visibleHours: visible,
      fromHour: 19,
      toHour: 17,
      targetBusy: false,
    });
    expect(paintedFree).toEqual(['0-8', '0-16', '0-20', '3-20']);
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

    const fixedLabel = formatWeekKeyDisplay('FIXED');
    expect(fixedLabel.title).toContain('FIXED');

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

    // Kịch bản 2b & 3: Dựng session mới & settlement mới giữ settings nhưng sạch undo/thanh toán cũ
    const baseState = createInitialSessionState();
    const customSettings = { ...baseState.settings, maleBonus: 2.0 };
    const freshSession = buildFreshSessionWithPlayers([m1, m2], customSettings, 1700000002000);
    expect(freshSession.players).toHaveLength(2);
    expect(freshSession.settings.maleBonus).toBe(2.0);
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

describe('Phase 4 — Rendered UI Invariants (Touch Ergonomics, Single Accent & Permissions)', () => {
  it('MyScheduleEditor: chỉ gắn touch-action:none trên dải quét riêng bên phải, không chặn scroll phần còn lại', () => {
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

    // 9 kíp mặc định (15h..23h) -> đúng 9 dải quét bên phải có touch-action:none
    const touchNoneMatches = html.match(/touch-action:none/g) ?? [];
    const dragStripMatches = html.match(/data-drag-strip="true"/g) ?? [];
    expect(dragStripMatches).toHaveLength(9);
    expect(touchNoneMatches).toHaveLength(9);

    // Hiển thị đủ day-pills T2..CN, nút mở rộng sáng sớm kèm số kíp sáng bận (1 bận ở 8h)
    expect(html).toContain('T2');
    expect(html).toContain('CN');
    expect(html).toContain('Mở rộng sáng sớm (7h–15h) · 1 bận');
    expect(hasNestedUiCard(html)).toBe(false);
  });

  it('ScheduleHeatmap: hiển thị bộ chọn 1h/1.5h/2h/3h, Top khung giờ vàng, Gợi ý chia 2 ca và chỉ dùng class đơn sắc ui-heatmap-*', () => {
    const schedule = makeMockSchedule({ role: 'CLUB_MEMBER' });
    const html = renderToStaticMarkup(
      <ScheduleHeatmap schedule={schedule} onSelectHeatmapSlot={() => {}} />
    );

    expect(html).toContain('1h');
    expect(html).toContain('1.5h');
    expect(html).toContain('2h');
    expect(html).toContain('3h');
    expect(html).toContain('Top khung giờ vàng');
    expect(html).toContain('Gợi ý chia 2 ca tối ưu');
    expect(html).toContain('ui-heatmap-4');
    // Tuyệt đối không dùng màu cầu vồng Tailwind
    expect(html).not.toMatch(/bg-(emerald|rose|amber|blue|violet|indigo|cyan|purple)-/);
  });

  it('FinalizeBookingSheet: phân tách Rảnh trọn buổi & Bận 1 kíp, ẩn nút chốt với thành viên thường và mở đủ 3 kịch bản cho CLUB_HOST', () => {
    const schedule = makeMockSchedule({ role: 'CLUB_MEMBER' });
    // Khung T3 19h–21h: m1, m3, m4, m5 rảnh trọn buổi (4 người); m2 bận 19h rảnh 20h -> Vào muộn (1 người)
    const tuesday19Slot = schedule.heatmapSlots.find(
      (s) => s.dayOfWeek === 1 && s.startHour === 19
    )!;
    expect(tuesday19Slot).toBeDefined();

    const groups = buildBookingSheetGroups({
      slot: tuesday19Slot,
      members: schedule.activeMembers,
    });
    expect(groups.fullFreeMembers).toHaveLength(4);
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
    expect(memberHtml).toContain('Rảnh trọn buổi (4)');
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
    expect(hostBusyRoomHtml).toContain('Gộp thêm người chưa có (3 người mới)');
    expect(hostBusyRoomHtml).toContain('Reset buổi mới &amp; nạp 4 người này');
    expect(hostBusyRoomHtml).toContain('Tạo phòng LIVE mới gắn với CLB');
  });

  it('ClubHostPanel & ScheduleView: chỉ hiển thị bảng quản trị cho CLUB_HOST với đủ công tắc allowSelfRegister, khóa tuần, sửa trình, ẩn & reset PIN', () => {
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

    expect(hostViewHtml).toContain('Lịch của tôi');
    expect(hostViewHtml).toContain('Tổng hợp &amp; Chốt sân');
    expect(hostViewHtml).toContain('Bảng điều khiển Quản trị CLB');
    expect(hostViewHtml).toContain('Thành viên tự thêm tên');
    expect(hostViewHtml).toContain('Khóa sổ tuần 2026-W48');
    expect(hostViewHtml).toContain('Reset PIN');
    expect(hostViewHtml).toContain('Hiện thành viên đã ẩn (1)');
    expect(hasNestedUiCard(hostViewHtml)).toBe(false);
  });
});
