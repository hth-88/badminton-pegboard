import type { CloudSettlementData } from '../../engine/settlement';
import {
  badmintonReducer,
  createInitialSessionState,
} from '../../engine/sessionReducer';
import {
  getIsoWeekDateRange,
  makeSlotKey,
  normalizeBusySlots,
  parseSlotKey,
} from '../../engine/scheduleEngine';
import type {
  BadmintonSessionState,
  Player,
  SessionSettings,
} from '../../types/badminton';
import {
  DAY_LABELS_VI,
  SCHEDULE_HOURS,
  type ClubMember,
  type DayOfWeek,
  type HeatmapSlot,
  type ScheduleHour,
  type ScheduleSlotKey,
  type WeekKey,
} from '../../types/schedule';

/** Mặc định hiển thị khung chiều-tối từ 15h (15h–24h), mở rộng sáng sớm sẽ thêm 7h–15h */
export const DEFAULT_VISIBLE_START_HOUR: ScheduleHour = 15;

export type HeatmapIntensityTier = 0 | 1 | 2 | 3 | 4;

export type PartialMemberAvailabilityTag = 'LATE_ARRIVAL' | 'EARLY_LEAVE' | 'MID_BREAK';

export interface PartialBusyMemberItem {
  member: ClubMember;
  tag: PartialMemberAvailabilityTag;
  tagLabelVi: string;
}

export type FinalizeBookingMode = 'DIRECT_PUSH' | 'MERGE_MISSING' | 'RESET_AND_PUSH' | 'CREATE_CLUB_ROOM';

/**
 * Trả về danh sách các giờ bắt đầu kíp 1h hiển thị trên lưới:
 * - Mặc định (`expandEarlyMorning = false`): `15..23` (tức `15h–16h` tới `23h–24h`)
 * - Mở rộng (`expandEarlyMorning = true`): `7..23` (toàn bộ 17 kíp `7h–24h`)
 */
export function getVisibleScheduleHours(expandEarlyMorning: boolean): ScheduleHour[] {
  if (expandEarlyMorning) {
    return [...SCHEDULE_HOURS];
  }
  return SCHEDULE_HOURS.filter((h) => h >= DEFAULT_VISIBLE_START_HOUR);
}

/**
 * Đếm số kíp bận nằm trong khung sáng sớm (`7h–15h`, tức `startHour < 15`)
 * để hiển thị nhắc trên nút "Mở rộng sáng sớm" tránh ẩn ngầm dữ liệu.
 */
export function countEarlyMorningBusySlots(
  busySlots: readonly ScheduleSlotKey[],
  dayOfWeek?: DayOfWeek
): number {
  let count = 0;
  for (const key of normalizeBusySlots(busySlots)) {
    const parsed = parseSlotKey(key);
    if (!parsed) continue;
    if (dayOfWeek !== undefined && parsed.dayOfWeek !== dayOfWeek) continue;
    if (parsed.hour < DEFAULT_VISIBLE_START_HOUR) {
      count++;
    }
  }
  return count;
}

/**
 * Quét tô liên tục (drag-to-paint) các kíp từ `fromHour` tới `toHour` trong danh sách giờ đang mở
 * của một ngày `dayOfWeek`. Kể cả khi ngón tay vuốt nhanh nhảy qua nhiều hàng, mọi kíp nằm giữa
 * `fromHour` và `toHour` đều được điền liền mạch, đồng thời giữ nguyên 100% các kíp ngoài vùng quét.
 */
export function paintBusySlotsRange(params: {
  currentBusySlots: readonly ScheduleSlotKey[];
  dayOfWeek: DayOfWeek;
  visibleHours: readonly ScheduleHour[];
  fromHour: ScheduleHour;
  toHour: ScheduleHour;
  targetBusy: boolean;
}): ScheduleSlotKey[] {
  const { currentBusySlots, dayOfWeek, visibleHours, fromHour, toHour, targetBusy } = params;
  const idxA = visibleHours.indexOf(fromHour);
  const idxB = visibleHours.indexOf(toHour);

  if (idxA === -1 && idxB === -1) {
    return normalizeBusySlots(currentBusySlots);
  }

  const startIdx = idxA === -1 ? idxB : idxB === -1 ? idxA : Math.min(idxA, idxB);
  const endIdx = idxA === -1 ? idxB : idxB === -1 ? idxA : Math.max(idxA, idxB);

  const nextSet = new Set<ScheduleSlotKey>(normalizeBusySlots(currentBusySlots));
  for (let i = startIdx; i <= endIdx; i++) {
    const hour = visibleHours[i];
    if (hour === undefined) continue;
    const key = makeSlotKey(dayOfWeek, hour);
    if (targetBusy) {
      nextSet.add(key);
    } else {
      nextSet.delete(key);
    }
  }

  return normalizeBusySlots(Array.from(nextSet));
}

/**
 * Bậc màu đơn sắc (0..4) cho Heatmap dựa duy nhất trên `--color-accent`:
 * - 0: Chưa có ai nộp hoặc 0 người rảnh
 * - 1: Có người rảnh nhưng chưa đủ `meetsMinPlayers` hoặc tỷ lệ < 40%
 * - 2: Đủ người tối thiểu & tỷ lệ 40% – <65%
 * - 3: Đủ người tối thiểu & tỷ lệ 65% – <85%
 * - 4: Đủ người tối thiểu & tỷ lệ >= 85% (khung giờ cao điểm)
 */
export function getHeatmapIntensityTier(
  slot: Pick<HeatmapSlot, 'freeCount' | 'submittedCount' | 'availabilityRatio' | 'meetsMinPlayers'>
): HeatmapIntensityTier {
  if (slot.submittedCount <= 0 || slot.freeCount <= 0) {
    return 0;
  }
  if (!slot.meetsMinPlayers || slot.availabilityRatio < 0.4) {
    return 1;
  }
  if (slot.availabilityRatio < 0.65) {
    return 2;
  }
  if (slot.availabilityRatio < 0.85) {
    return 3;
  }
  return 4;
}

function formatDayMonthVi(isoDate: string | undefined): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

/**
 * Định dạng hiển thị mã tuần và khoảng ngày T2–CN ngắn gọn cho giao diện mobile
 */
export function formatWeekKeyDisplay(weekKey: WeekKey): {
  title: string;
  dateSublabel: string | null;
  dayDateLabels: Partial<Record<DayOfWeek, string>>;
} {
  if (weekKey === 'FIXED') {
    return {
      title: 'Lịch cố định (FIXED)',
      dateSublabel: 'Áp dụng mẫu hàng tuần',
      dayDateLabels: {},
    };
  }

  const range = getIsoWeekDateRange(weekKey);
  if (!range) {
    return {
      title: weekKey,
      dateSublabel: null,
      dayDateLabels: {},
    };
  }

  const dayDateLabels: Partial<Record<DayOfWeek, string>> = {};
  for (const [dayKey, iso] of Object.entries(range.datesByDay)) {
    dayDateLabels[Number(dayKey) as DayOfWeek] = formatDayMonthVi(iso);
  }

  return {
    title: weekKey,
    dateSublabel: `${formatDayMonthVi(range.mondayIso)} – ${formatDayMonthVi(range.sundayIso)}`,
    dayDateLabels,
  };
}

/**
 * Kiểm tra mã PIN cá nhân 4 chữ số chuẩn
 */
export function isValidFourDigitPin(rawPin: string): boolean {
  return /^\d{4}$/.test(rawPin.trim());
}

/**
 * Phân nhóm danh sách thành viên cho Bottom Sheet Chốt kèo từ 1 HeatmapSlot:
 * - `fullFreeMembers`: rảnh trọn buổi
 * - `partialBusyItems`: bận 1 phần kèm nhãn `Vào muộn` / `Về sớm` / `Bận giữa buổi`
 * - `defaultCheckedIds`: mặc định tick sẵn toàn bộ `fullFreeMembers` (hoặc theo `preselectedIds` nếu mở từ Gợi ý chia 2 ca)
 */
export function buildBookingSheetGroups(params: {
  slot: HeatmapSlot;
  members: readonly ClubMember[];
  preselectedMemberIds?: readonly string[];
}): {
  fullFreeMembers: ClubMember[];
  partialBusyItems: PartialBusyMemberItem[];
  defaultCheckedIds: string[];
} {
  const { slot, members, preselectedMemberIds } = params;
  const memberById = new Map<string, ClubMember>();
  for (const m of members) {
    if (m.isActive) {
      memberById.set(m.id, m);
    }
  }

  const fullFreeMembers = slot.fullFreeMemberIds
    .map((id) => memberById.get(id))
    .filter((m): m is ClubMember => Boolean(m));

  const lateSet = new Set(slot.lateArrivalMemberIds);
  const earlySet = new Set(slot.earlyLeaveMemberIds);

  const partialBusyItems: PartialBusyMemberItem[] = [];
  for (const id of slot.partialBusyMemberIds) {
    const member = memberById.get(id);
    if (!member) continue;
    if (lateSet.has(id)) {
      partialBusyItems.push({ member, tag: 'LATE_ARRIVAL', tagLabelVi: 'Vào muộn' });
    } else if (earlySet.has(id)) {
      partialBusyItems.push({ member, tag: 'EARLY_LEAVE', tagLabelVi: 'Về sớm' });
    } else {
      partialBusyItems.push({ member, tag: 'MID_BREAK', tagLabelVi: 'Bận giữa buổi' });
    }
  }

  const validCandidateSet = new Set<string>([
    ...fullFreeMembers.map((m) => m.id),
    ...partialBusyItems.map((i) => i.member.id),
  ]);

  const defaultCheckedIds =
    preselectedMemberIds && preselectedMemberIds.length > 0
      ? preselectedMemberIds.filter((id) => validCandidateSet.has(id))
      : fullFreeMembers.map((m) => m.id);

  return {
    fullFreeMembers,
    partialBusyItems,
    defaultCheckedIds,
  };
}

/**
 * Gợi ý mã phòng ngắn gọn khi Host chọn Kịch bản 3 (Tạo phòng mới gắn CLB)
 */
export function buildSuggestedClubRoomCode(
  clubCode: string,
  slot: Pick<HeatmapSlot, 'dayOfWeek' | 'startHour'>
): string {
  const prefix = clubCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || 'SAN';
  const dayTag = DAY_LABELS_VI[slot.dayOfWeek].toUpperCase();
  return `${prefix}-${dayTag}-${slot.startHour}H`;
}

export type NewQueuePlayerPayload = Omit<
  Player,
  'gamesPlayed' | 'virtualGamesOffset' | 'waitStreak' | 'lastPlayedAt' | 'singlesCount'
>;

/**
 * Chuyển danh sách thành viên CLB sang payload Player cho Hàng chờ,
 * giữ nguyên giới tính (`gender -> sex`), bậc trình độ (`rank`) và cờ `noSingles`.
 */
export function mapClubMembersToSessionPlayers(
  selectedMembers: readonly ClubMember[],
  now: number
): NewQueuePlayerPayload[] {
  return selectedMembers.map((m, idx) => ({
    id: `p_club_${m.id}_${now}_${idx}`,
    name: m.name.trim(),
    sex: m.gender,
    rank: m.rank,
    status: 'ACTIVE' as const,
    assignedPool: 'ALL',
    noSingles: Boolean(m.noSingles),
    joinedAt: now,
  }));
}

/**
 * Kịch bản 2a (Gộp thêm người chưa có vào phòng đang có người):
 * Lọc bỏ những thành viên đã tồn tại trong `existingPlayers` (theo tên chuẩn hóa không phân biệt hoa thường).
 */
export function partitionMergePlayers(
  selectedMembers: readonly ClubMember[],
  existingPlayers: readonly Player[],
  now: number
): {
  playersToAdd: NewQueuePlayerPayload[];
  alreadyInRoomMembers: ClubMember[];
} {
  const existingNames = new Set(
    existingPlayers.map((p) => p.name.trim().toLowerCase()).filter(Boolean)
  );
  const existingIds = new Set(existingPlayers.map((p) => p.id));

  const missingMembers: ClubMember[] = [];
  const alreadyInRoomMembers: ClubMember[] = [];

  const seenBatchNames = new Set<string>();
  for (const m of selectedMembers) {
    const cleanNameKey = m.name.trim().toLowerCase();
    if (!cleanNameKey) continue;
    if (
      existingNames.has(cleanNameKey) ||
      existingIds.has(m.id) ||
      seenBatchNames.has(cleanNameKey)
    ) {
      alreadyInRoomMembers.push(m);
    } else {
      seenBatchNames.add(cleanNameKey);
      missingMembers.push(m);
    }
  }

  return {
    playersToAdd: mapClubMembersToSessionPlayers(missingMembers, now),
    alreadyInRoomMembers,
  };
}

/**
 * Dựng state buổi đánh mới sạch (giữ cấu hình `currentSettings` như `maleBonus`, `courtMode`)
 * và nạp sẵn danh sách người chơi đã chốt kèo, dùng cho Kịch bản 3 (Tạo phòng mới gắn CLB).
 */
export function buildFreshSessionWithPlayers(
  selectedMembers: readonly ClubMember[],
  currentSettings: SessionSettings,
  now: number
): BadmintonSessionState {
  const base = createInitialSessionState();
  const baseWithSettings: BadmintonSessionState = {
    ...base,
    settings: {
      ...base.settings,
      ...currentSettings,
      matchMix: { ...currentSettings.matchMix },
      weights: { ...currentSettings.weights },
    },
  };

  const payloads = mapClubMembersToSessionPlayers(selectedMembers, now);
  if (payloads.length === 0) {
    return {
      ...baseWithSettings,
      undoStack: [],
      redoStack: [],
    };
  }

  const populated = badmintonReducer(baseWithSettings, {
    type: 'ADD_PLAYERS',
    payload: {
      players: payloads,
      now,
    },
  });

  return {
    ...populated,
    undoStack: [],
    redoStack: [],
  };
}

/**
 * Dựng dữ liệu quyết toán sạch cho phòng mới (giữ thông tin tài khoản VietQR & đơn giá sân/cầu,
 * xóa sạch biên lai & trạng thái thanh toán của buổi cũ).
 */
export function buildFreshSettlementForNewRoom(
  currentSettlement: CloudSettlementData,
  now: number
): CloudSettlementData {
  return {
    settings: { ...currentSettlement.settings },
    payments: {},
    betPayments: {},
    updatedAt: now,
  };
}
