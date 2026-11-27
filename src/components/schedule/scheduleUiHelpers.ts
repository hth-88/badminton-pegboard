import { createEmptyNextUp } from '../../engine/nextUp';
import type { CloudSettlementData } from '../../engine/settlement';
import {
  badmintonReducer,
  createInitialSessionState,
} from '../../engine/sessionReducer';
import {
  getIsoWeekDateRange,
  makeSlotKey,
  normalizeBusySlots,
} from '../../engine/scheduleEngine';
import {
  SESSION_KEY_CLUB_PINS,
  STORAGE_KEY_CLUB_MEMBER_PINS,
} from '../../hooks/useClubSchedule';
import { normalizeClubCode } from '../../services/clubScheduleSync';
import type {
  BadmintonSessionState,
  Court,
  Player,
  SessionSettings,
} from '../../types/badminton';
import {
  DAY_LABELS_VI,
  SCHEDULE_HOURS,
  type ClubActiveRoom,
  type ClubMember,
  type DayOfWeek,
  type HeatmapSlot,
  type ScheduleHour,
  type ScheduleSlotKey,
  type WeekKey,
} from '../../types/schedule';

export type HeatmapIntensityTier = 0 | 1 | 2 | 3 | 4;

export type PartialMemberAvailabilityTag = 'LATE_ARRIVAL' | 'EARLY_LEAVE' | 'MID_BREAK';

export interface PartialBusyMemberItem {
  member: ClubMember;
  tag: PartialMemberAvailabilityTag;
  tagLabelVi: string;
}

export type FinalizeBookingMode = 'DIRECT_PUSH' | 'MERGE_MISSING' | 'RESET_AND_PUSH' | 'CREATE_CLUB_ROOM';

/**
 * Trả về đầy đủ toàn bộ 18 khung giờ 1 tiếng trong ngày (`06:00 – 24:00`, các giờ `6..23`)
 */
export function getVisibleScheduleHours(): ScheduleHour[] {
  return [...SCHEDULE_HOURS];
}

/**
 * Định dạng nhãn khoảng giờ 1 tiếng căn cột đều (vd: `6` -> `"06:00 – 07:00"`, `23` -> `"23:00 – 24:00"`)
 */
export function formatScheduleSlotRange(hour: ScheduleHour): string {
  return `${String(hour).padStart(2, '0')}:00 – ${String(hour + 1).padStart(2, '0')}:00`;
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
 * Xác định kíp giờ gần nhất theo tọa độ dọc `clientY` trên dải quét mobile.
 * Kể cả khi ngón tay chạm vào khe hở 6px giữa 2 hàng liên tiếp, hàm vẫn ánh xạ
 * chính xác về hàng gần nhất theo điểm giữa (midpoint), loại bỏ hoàn toàn vùng chết.
 */
export function resolveNearestScheduleHour(
  clientY: number,
  rowBounds: ReadonlyArray<{ hour: ScheduleHour; top: number; bottom: number }>
): ScheduleHour | null {
  if (rowBounds.length === 0 || !Number.isFinite(clientY)) {
    return null;
  }

  if (clientY <= rowBounds[0].bottom) {
    return rowBounds[0].hour;
  }

  const last = rowBounds[rowBounds.length - 1];
  if (clientY >= last.top) {
    return last.hour;
  }

  for (let i = 0; i < rowBounds.length; i++) {
    const cur = rowBounds[i];
    if (clientY >= cur.top && clientY <= cur.bottom) {
      return cur.hour;
    }
    if (i + 1 < rowBounds.length) {
      const next = rowBounds[i + 1];
      if (clientY > cur.bottom && clientY < next.top) {
        const midpoint = (cur.bottom + next.top) / 2;
        return clientY <= midpoint ? cur.hour : next.hour;
      }
    }
  }

  return last.hour;
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
      title: 'Lịch cứng hàng tuần',
      dateSublabel: 'Mẫu cố định hàng tuần',
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
 * Kiểm tra mã PIN phòng đánh trực tuyến chuẩn (4–6 ký tự, khớp hợp đồng badminton_rooms)
 */
export function isValidRoomPin(rawPin: string): boolean {
  const clean = rawPin.trim();
  return clean.length >= 4 && clean.length <= 6;
}

/**
 * Kiểm tra phiên hiện tại đã lưu sẵn PIN cá nhân của thành viên trong `sessionStorage` hay chưa,
 * giúp mở popup nhập PIN tức thì mà không phải bắn một request RPC lỗi lên Supabase trước.
 */
export function hasCachedMemberSessionPin(
  clubCode: string | null | undefined,
  memberId: string | null | undefined
): boolean {
  const cleanCode = normalizeClubCode(clubCode ?? '');
  if (!cleanCode || !memberId) return false;
  const pinKey = `${cleanCode}::${memberId}`;

  if (typeof localStorage !== 'undefined') {
    try {
      const rawLocal = localStorage.getItem(STORAGE_KEY_CLUB_MEMBER_PINS);
      if (rawLocal) {
        const parsedLocal = JSON.parse(rawLocal) as Record<string, string>;
        const cachedLocal = parsedLocal?.[pinKey];
        if (typeof cachedLocal === 'string' && cachedLocal.trim().length > 0) {
          return true;
        }
      }
    } catch {
      // Bỏ qua
    }
  }

  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY_CLUB_PINS);
      if (raw) {
        const parsed = JSON.parse(raw) as { memberPins?: Record<string, string> };
        const cached = parsed?.memberPins?.[pinKey];
        if (typeof cached === 'string' && cached.trim().length > 0) {
          return true;
        }
      }
    } catch {
      // Bỏ qua
    }
  }

  return false;
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

export interface FinalizeQueueActionOptions {
  attachRoomMeta?: Omit<ClubActiveRoom, 'createdAt' | 'roomCode'> | null;
  successToast?: string;
}

/**
 * Dựng state buổi đánh mới sạch từ danh sách payload người chơi (giữ cấu hình `currentSettings`
 * và bố cục sân `currentCourts`, đặt `undoStack` / `redoStack` rỗng sạch).
 */
export function buildFreshSessionFromPayloads(
  payloads: readonly NewQueuePlayerPayload[],
  currentSettings: SessionSettings,
  now: number,
  currentCourts?: readonly Court[]
): BadmintonSessionState {
  const base = createInitialSessionState();
  const preservedCourts: Court[] =
    currentCourts && currentCourts.length > 0
      ? currentCourts.map((c) => ({
          id: c.id,
          name: c.name,
          isActive: c.isActive,
          policy: c.policy,
          forcedType: null,
          currentMatch: null,
          nextUp: createEmptyNextUp(c.policy === 'SINGLES_ONLY' ? 'SINGLES' : 'DOUBLES'),
          suggestCursor: 0,
        }))
      : base.courts;

  const baseWithSettings: BadmintonSessionState = {
    ...base,
    courts: preservedCourts,
    settings: {
      ...base.settings,
      ...currentSettings,
      matchMix: { ...currentSettings.matchMix },
      weights: { ...currentSettings.weights },
    },
  };

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
      players: [...payloads],
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
 * Dựng state buổi đánh mới sạch (giữ cấu hình `currentSettings` & bố cục sân `currentCourts`)
 * và nạp sẵn danh sách người chơi đã chốt kèo, dùng cho Kịch bản 2b & Kịch bản 3.
 */
export function buildFreshSessionWithPlayers(
  selectedMembers: readonly ClubMember[],
  currentSettings: SessionSettings,
  now: number,
  currentCourts?: readonly Court[]
): BadmintonSessionState {
  const payloads = mapClubMembersToSessionPlayers(selectedMembers, now);
  return buildFreshSessionFromPayloads(payloads, currentSettings, now, currentCourts);
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
