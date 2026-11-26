import {
  DAY_LABELS_VI,
  DEFAULT_CLUB_SETTINGS,
  SCHEDULE_DAYS,
  SCHEDULE_HOURS,
  SESSION_DURATION_OPTIONS,
  type Club,
  type ClubMember,
  type DayOfWeek,
  type HeatmapSlot,
  type MemberScheduleEntry,
  type ScheduleHour,
  type ScheduleSlotKey,
  type SessionDurationHours,
  type TwoShiftSuggestion,
  type WeekKey,
  type WeeklySchedule,
} from '../types/schedule';

// =============================================================================
// 1. Lưới 17 kíp (7h–24h) × 7 ngày (T2..CN) = 119 kíp
// =============================================================================

export const TOTAL_WEEKLY_SLOTS = SCHEDULE_DAYS.length * SCHEDULE_HOURS.length; // 119

const SLOT_KEY_REGEX = /^([0-6])-(7|8|9|1[0-9]|2[0-3])$/;
const ISO_WEEK_KEY_REGEX = /^([0-9]{4})-W(0[1-9]|[1-4][0-9]|5[0-3])$/;

/**
 * Tạo khóa kíp chuẩn `${dayOfWeek}-${hour}`
 */
export function makeSlotKey(dayOfWeek: DayOfWeek, hour: ScheduleHour): ScheduleSlotKey {
  return `${dayOfWeek}-${hour}`;
}

/**
 * Phân tách và kiểm tra hợp lệ một khóa kíp chuẩn (khớp 100% constraint SQL, không chứa khoảng trắng thừa)
 */
export function parseSlotKey(
  rawKey: string
): { dayOfWeek: DayOfWeek; hour: ScheduleHour } | null {
  if (typeof rawKey !== 'string') return null;
  const match = SLOT_KEY_REGEX.exec(rawKey);
  if (!match) return null;
  return {
    dayOfWeek: Number(match[1]) as DayOfWeek,
    hour: Number(match[2]) as ScheduleHour,
  };
}

/**
 * Kiểm tra chuỗi có phải ScheduleSlotKey chuẩn trong lưới 7h–24h × T2..CN không
 */
export function isValidSlotKey(rawKey: string): rawKey is ScheduleSlotKey {
  return parseSlotKey(rawKey) !== null;
}

/**
 * Sinh toàn bộ 119 khóa kíp theo thứ tự thời gian (T2 7h..23h -> CN 7h..23h)
 */
export function buildAllSlotKeys(): ScheduleSlotKey[] {
  const keys: ScheduleSlotKey[] = [];
  for (const day of SCHEDULE_DAYS) {
    for (const hour of SCHEDULE_HOURS) {
      keys.push(makeSlotKey(day, hour));
    }
  }
  return keys;
}

/**
 * So sánh thứ tự thời gian của 2 khóa kíp hợp lệ
 */
export function compareSlotKeys(a: ScheduleSlotKey, b: ScheduleSlotKey): number {
  const pA = parseSlotKey(a);
  const pB = parseSlotKey(b);
  if (!pA || !pB) return a.localeCompare(b);
  if (pA.dayOfWeek !== pB.dayOfWeek) return pA.dayOfWeek - pB.dayOfWeek;
  return pA.hour - pB.hour;
}

/**
 * Làm sạch, khử trùng lặp và sắp xếp mảng busySlots theo thứ tự thời gian
 */
export function normalizeBusySlots(slots: readonly string[] | null | undefined): ScheduleSlotKey[] {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  const unique = new Set<ScheduleSlotKey>();
  for (const item of slots) {
    if (typeof item !== 'string') continue;
    const parsed = parseSlotKey(item.trim());
    if (parsed) {
      unique.add(makeSlotKey(parsed.dayOfWeek, parsed.hour));
    }
  }
  return Array.from(unique).sort(compareSlotKeys);
}

/**
 * Đảo trạng thái bận/rảnh của 1 kíp (pure)
 */
export function toggleBusySlot(
  currentSlots: readonly ScheduleSlotKey[],
  slotKey: ScheduleSlotKey
): ScheduleSlotKey[] {
  const parsed = typeof slotKey === 'string' ? parseSlotKey(slotKey) : null;
  if (!parsed) {
    return normalizeBusySlots(currentSlots);
  }
  const canonicalKey = makeSlotKey(parsed.dayOfWeek, parsed.hour);
  const set = new Set(normalizeBusySlots(currentSlots));
  if (set.has(canonicalKey)) {
    set.delete(canonicalKey);
  } else {
    set.add(canonicalKey);
  }
  return Array.from(set).sort(compareSlotKeys);
}

/**
 * Đánh dấu bận hoặc rảnh toàn bộ 17 kíp của một ngày trong tuần (pure)
 */
export function setDayBusySlots(
  currentSlots: readonly ScheduleSlotKey[],
  dayOfWeek: DayOfWeek,
  isBusy: boolean
): ScheduleSlotKey[] {
  const set = new Set(normalizeBusySlots(currentSlots));
  for (const hour of SCHEDULE_HOURS) {
    const key = makeSlotKey(dayOfWeek, hour);
    if (isBusy) {
      set.add(key);
    } else {
      set.delete(key);
    }
  }
  return Array.from(set).sort(compareSlotKeys);
}

/**
 * Định dạng mốc giờ (vd: 19 -> "19h", 20.5 -> "20h30")
 */
export function formatHourPoint(hour: number): string {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  if (minutes === 0) return `${whole}h`;
  return `${whole}h${String(minutes).padStart(2, '0')}`;
}

/**
 * Định dạng nhãn khung giờ tiếng Việt (vd: "T3 · 19h–20h30")
 */
export function formatWindowLabel(
  dayOfWeek: DayOfWeek,
  startHour: number,
  endHour: number
): string {
  return `${DAY_LABELS_VI[dayOfWeek]} · ${formatHourPoint(startHour)}–${formatHourPoint(endHour)}`;
}

// =============================================================================
// 2. Xử lý khóa tuần ISO ('FIXED' | 'YYYY-Www') — Thuần túy 100%
// =============================================================================

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Tính số tuần chuẩn ISO-8601 (52 hoặc 53) của một năm ISO
 */
export function getIsoWeeksInYear(isoYear: number): 52 | 53 {
  const jan1Day = new Date(Date.UTC(isoYear, 0, 1)).getUTCDay(); // 0 = Sun .. 6 = Sat
  // Năm ISO có 53 tuần khi 1/1 là Thứ Năm (4), hoặc năm nhuận có 1/1 là Thứ Tư (3)
  if (jan1Day === 4 || (isLeapYear(isoYear) && jan1Day === 3)) {
    return 53;
  }
  return 52;
}

/**
 * Kiểm tra khóa tuần chuẩn ('FIXED' hoặc 'YYYY-Www' tồn tại thực sự theo lịch ISO, không chứa khoảng trắng thừa)
 */
export function isValidWeekKey(weekKey: string): weekKey is WeekKey {
  if (typeof weekKey !== 'string') return false;
  if (weekKey === 'FIXED') return true;
  const match = ISO_WEEK_KEY_REGEX.exec(weekKey);
  if (!match) return false;
  const isoYear = Number(match[1]);
  const weekNo = Number(match[2]);
  return weekNo >= 1 && weekNo <= getIsoWeeksInYear(isoYear);
}

/**
 * Kiểm tra khóa tuần có phải tuần cụ thể 'YYYY-Www' (không phải 'FIXED') hay không
 */
export function isIsoWeekKey(weekKey: string): weekKey is `${number}-W${string}` {
  return weekKey !== 'FIXED' && isValidWeekKey(weekKey);
}

function extractLocalDateParts(
  date: Date,
  timeZone = 'Asia/Ho_Chi_Minh'
): { year: number; month: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return { year, month, day };
    }
  } catch {
    // Fallback sang UTC+7 cố định nếu môi trường thiếu ICU timezone
  }
  const vnTime = new Date(date.getTime() + 7 * 3600 * 1000);
  return {
    year: vnTime.getUTCFullYear(),
    month: vnTime.getUTCMonth() + 1,
    day: vnTime.getUTCDate(),
  };
}

/**
 * Tính mã tuần ISO 'YYYY-Www' từ đối tượng Date được truyền tường minh (pure)
 */
export function getIsoWeekKeyFromDate(
  date: Date,
  timeZone: string = DEFAULT_CLUB_SETTINGS.timezone || 'Asia/Ho_Chi_Minh'
): `${number}-W${string}` {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('INVALID_DATE');
  }
  const { year, month, day } = extractLocalDateParts(date, timeZone);
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  const isoDay = (utcMidnight.getUTCDay() + 6) % 7; // 0 = T2 .. 6 = CN
  const thursday = new Date(Date.UTC(year, month - 1, day - isoDay + 3));
  const isoYear = thursday.getUTCFullYear();

  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4IsoDay = (jan4.getUTCDay() + 6) % 7;
  const week1MondayMs = Date.UTC(isoYear, 0, 4 - jan4IsoDay);
  const currentMondayMs = Date.UTC(year, month - 1, day - isoDay);

  const weekNo = Math.round((currentMondayMs - week1MondayMs) / (7 * 86_400_000)) + 1;
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

function formatUtcDateIso(utcMs: number): string {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Trả về ngày Thứ 2 .. Chủ Nhật ('YYYY-MM-DD') tương ứng với mã tuần 'YYYY-Www'
 */
export function getIsoWeekDateRange(weekKey: string): {
  mondayIso: string;
  sundayIso: string;
  datesByDay: Record<DayOfWeek, string>;
} | null {
  if (!isIsoWeekKey(weekKey)) return null;
  const match = ISO_WEEK_KEY_REGEX.exec(weekKey.trim());
  if (!match) return null;

  const isoYear = Number(match[1]);
  const weekNo = Number(match[2]);
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4IsoDay = (jan4.getUTCDay() + 6) % 7;
  const mondayMs = Date.UTC(isoYear, 0, 4 - jan4IsoDay + (weekNo - 1) * 7);

  const datesByDay = {} as Record<DayOfWeek, string>;
  for (const d of SCHEDULE_DAYS) {
    datesByDay[d] = formatUtcDateIso(mondayMs + d * 86_400_000);
  }

  return {
    mondayIso: datesByDay[0],
    sundayIso: datesByDay[6],
    datesByDay,
  };
}

/**
 * Dịch chuyển tuần ISO sang tuần kế tiếp / tuần trước (vd deltaWeeks = +1 hoặc -1)
 */
export function shiftIsoWeekKey(
  weekKey: string,
  deltaWeeks: number
): `${number}-W${string}` | null {
  const range = getIsoWeekDateRange(weekKey);
  if (!range || !Number.isFinite(deltaWeeks)) return null;
  const [y, m, d] = range.mondayIso.split('-').map(Number);
  const targetMonday = new Date(Date.UTC(y, m - 1, d + Math.trunc(deltaWeeks) * 7, 12, 0, 0));
  return getIsoWeekKeyFromDate(targetMonday, 'UTC');
}

// =============================================================================
// 3. Sao chép lịch FIXED sang tuần YYYY-Www (Pure)
// =============================================================================

export type CopyFixedMode = 'OVERWRITE' | 'MERGE_UNION' | 'ONLY_IF_NOT_SUBMITTED';

export interface CopyFixedMemberOptions {
  mode?: CopyFixedMode;
  copyNote?: boolean;
  existingWeekEntry?: Pick<MemberScheduleEntry, 'busySlots' | 'note'> | null;
}

export interface CopyFixedMemberResult {
  busySlots: ScheduleSlotKey[];
  note: string;
  copied: boolean;
}

/**
 * Chép lịch bận cố định ('FIXED') của 1 thành viên sang bản nháp tuần mới
 */
export function copyFixedSlotsForMember(
  fixedEntry: Pick<MemberScheduleEntry, 'busySlots' | 'note'> | null | undefined,
  options: CopyFixedMemberOptions = {}
): CopyFixedMemberResult {
  const mode = options.mode ?? 'OVERWRITE';
  const existing = options.existingWeekEntry ?? null;

  if (!fixedEntry) {
    return {
      busySlots: existing ? normalizeBusySlots(existing.busySlots) : [],
      note: existing?.note ?? '',
      copied: false,
    };
  }

  if (mode === 'ONLY_IF_NOT_SUBMITTED' && existing) {
    return {
      busySlots: normalizeBusySlots(existing.busySlots),
      note: existing.note,
      copied: false,
    };
  }

  const fixedSlots = normalizeBusySlots(fixedEntry.busySlots);
  const mergedSlots =
    mode === 'MERGE_UNION' && existing
      ? normalizeBusySlots([...existing.busySlots, ...fixedSlots])
      : fixedSlots;

  const nextNote = options.copyNote
    ? (fixedEntry.note ?? '').trim().slice(0, 300)
    : (existing?.note ?? '').trim().slice(0, 300);

  return {
    busySlots: mergedSlots,
    note: nextNote,
    copied: true,
  };
}

export interface CopyFixedScheduleToWeekParams {
  clubCode: string;
  targetWeekKey: WeekKey;
  fixedEntriesByMemberId: Record<string, MemberScheduleEntry>;
  existingWeekEntriesByMemberId?: Record<string, MemberScheduleEntry>;
  /** Nếu truyền vào, chỉ xét các thành viên đang active trong danh sách này */
  activeMemberIds?: readonly string[];
  /** Mặc định false: giữ nguyên lịch tuần của người đã tự nộp, chỉ chép cho người chưa nộp */
  overwriteExisting?: boolean;
  /** Có chép ghi chú từ lịch FIXED sang tuần mới hay không (mặc định false) */
  copyNotes?: boolean;
  /** Timestamp ISO truyền từ bên ngoài để đảm bảo hàm thuần túy */
  nowIso: string;
}

export interface CopyFixedScheduleToWeekResult {
  targetWeekKey: `${number}-W${string}`;
  entriesToUpsert: MemberScheduleEntry[];
  /** Thành viên đã có lịch tuần và bị bỏ qua do overwriteExisting = false */
  skippedExistingMemberIds: string[];
  /** Thành viên active chưa từng lưu lịch FIXED (KHÔNG tự bịa lịch rỗng để tránh sai lệch submitted) */
  missingFixedMemberIds: string[];
}

/**
 * Sao chép lịch FIXED sang tuần 'YYYY-Www' cho danh sách thành viên.
 * Lưu ý bất biến nghiệp vụ: Không bao giờ tự sinh bản ghi rỗng cho người chưa có lịch FIXED,
 * đảm bảo không làm sai lệch bộ đếm "đã nộp lịch (submitted)" trên Heatmap.
 */
export function copyFixedScheduleToWeek(
  params: CopyFixedScheduleToWeekParams
): CopyFixedScheduleToWeekResult {
  const {
    clubCode,
    targetWeekKey,
    fixedEntriesByMemberId,
    existingWeekEntriesByMemberId = {},
    activeMemberIds,
    overwriteExisting = false,
    copyNotes = false,
    nowIso,
  } = params;

  if (!isIsoWeekKey(targetWeekKey)) {
    throw new Error('INVALID_WEEK_KEY');
  }

  const cleanClubCode = clubCode.trim().toUpperCase();
  const candidateIds = activeMemberIds
    ? Array.from(new Set(activeMemberIds))
    : Object.keys(fixedEntriesByMemberId);

  const entriesToUpsert: MemberScheduleEntry[] = [];
  const skippedExistingMemberIds: string[] = [];
  const missingFixedMemberIds: string[] = [];

  for (const memberId of candidateIds) {
    const fixedEntry = fixedEntriesByMemberId[memberId];
    if (!fixedEntry) {
      missingFixedMemberIds.push(memberId);
      continue;
    }

    const existingWeek = existingWeekEntriesByMemberId[memberId];
    if (existingWeek && !overwriteExisting) {
      skippedExistingMemberIds.push(memberId);
      continue;
    }

    const copied = copyFixedSlotsForMember(fixedEntry, {
      mode: 'OVERWRITE',
      copyNote: copyNotes,
      existingWeekEntry: existingWeek,
    });

    entriesToUpsert.push({
      id: existingWeek?.id || `local_${cleanClubCode}_${targetWeekKey}_${memberId}`,
      clubCode: cleanClubCode,
      weekKey: targetWeekKey,
      memberId,
      busySlots: copied.busySlots,
      note: copied.note,
      updatedAt: nowIso,
    });
  }

  return {
    targetWeekKey,
    entriesToUpsert,
    skippedExistingMemberIds,
    missingFixedMemberIds,
  };
}

/**
 * Dựng cấu trúc WeeklySchedule chuẩn từ Club + danh sách MemberScheduleEntry
 */
export function buildWeeklyScheduleView(params: {
  club: Pick<Club, 'clubCode' | 'lockedWeeks'>;
  weekKey: WeekKey;
  weekEntries: readonly MemberScheduleEntry[];
  fixedEntries?: readonly MemberScheduleEntry[];
}): WeeklySchedule {
  const entriesByMemberId: Record<string, MemberScheduleEntry> = {};
  for (const entry of params.weekEntries) {
    entriesByMemberId[entry.memberId] = {
      ...entry,
      busySlots: normalizeBusySlots(entry.busySlots),
    };
  }

  let fixedEntriesByMemberId: Record<string, MemberScheduleEntry> | undefined;
  if (params.fixedEntries) {
    fixedEntriesByMemberId = {};
    for (const entry of params.fixedEntries) {
      fixedEntriesByMemberId[entry.memberId] = {
        ...entry,
        busySlots: normalizeBusySlots(entry.busySlots),
      };
    }
  }

  return {
    clubCode: params.club.clubCode,
    weekKey: params.weekKey,
    isLocked: params.club.lockedWeeks.includes(params.weekKey),
    entriesByMemberId,
    ...(fixedEntriesByMemberId ? { fixedEntriesByMemberId } : {}),
  };
}

// =============================================================================
// 4. Thống kê nộp lịch & Tính Heatmap (Sliding Window 1h, 1.5h, 2h, 3h)
// =============================================================================

export interface ScheduleSubmissionSummary {
  activeMembers: ClubMember[];
  submittedMembers: ClubMember[];
  unsubmittedMembers: ClubMember[];
  submittedCount: number;
  totalActiveCount: number;
  submissionRatio: number;
}

/**
 * Phân tách rõ thành viên active đã nộp lịch (submitted) và chưa nộp lịch (unsubmitted).
 * Thành viên isActive = false hoặc bản ghi mồ côi không thuộc danh sách active sẽ bị loại trừ.
 */
export function getScheduleSubmissionSummary(
  members: readonly ClubMember[],
  entriesByMemberId: Record<string, Pick<MemberScheduleEntry, 'busySlots'>>
): ScheduleSubmissionSummary {
  const seenIds = new Set<string>();
  const activeMembers: ClubMember[] = [];
  for (const m of members) {
    if (!m.isActive || !m.id || seenIds.has(m.id)) continue;
    seenIds.add(m.id);
    activeMembers.push(m);
  }
  const submittedMembers: ClubMember[] = [];
  const unsubmittedMembers: ClubMember[] = [];

  for (const member of activeMembers) {
    if (Object.prototype.hasOwnProperty.call(entriesByMemberId, member.id) && entriesByMemberId[member.id]) {
      submittedMembers.push(member);
    } else {
      unsubmittedMembers.push(member);
    }
  }

  const submittedCount = submittedMembers.length;
  const totalActiveCount = activeMembers.length;

  return {
    activeMembers,
    submittedMembers,
    unsubmittedMembers,
    submittedCount,
    totalActiveCount,
    submissionRatio: totalActiveCount > 0 ? submittedCount / totalActiveCount : 0,
  };
}

/**
 * Trả về các kíp 1 tiếng liền kề bị phủ bởi cửa sổ thời lượng `durationHours` bắt đầu từ `startHour`.
 * - 1h   -> 1 kíp  [h]          (endHour = h + 1 <= 24, startHour 7..23)
 * - 1.5h -> 2 kíp  [h, h+1]     (endHour = h + 1.5 <= 24, startHour 7..22)
 * - 2h   -> 2 kíp  [h, h+1]     (endHour = h + 2 <= 24, startHour 7..22)
 * - 3h   -> 3 kíp  [h, h+1, h+2] (endHour = h + 3 <= 24, startHour 7..21)
 */
export function getCoveredSlotKeysForWindow(
  dayOfWeek: DayOfWeek,
  startHour: ScheduleHour,
  durationHours: SessionDurationHours
): ScheduleSlotKey[] | null {
  if (!(SESSION_DURATION_OPTIONS as readonly number[]).includes(durationHours)) {
    return null;
  }
  const requiredSlots = Math.ceil(durationHours); // 1 -> 1, 1.5 -> 2, 2 -> 2, 3 -> 3
  const endHour = startHour + durationHours;
  if (endHour > 24 || startHour + requiredSlots > 24) {
    return null;
  }

  const keys: ScheduleSlotKey[] = [];
  for (let offset = 0; offset < requiredSlots; offset++) {
    const h = (startHour + offset) as ScheduleHour;
    keys.push(makeSlotKey(dayOfWeek, h));
  }
  return keys;
}

/**
 * Phân loại trạng thái bận một phần trong cửa sổ >= 2 kíp:
 * - 'LATE_ARRIVAL': Bận liên tiếp từ đầu buổi nhưng rảnh ở phần cuối (vào muộn)
 * - 'EARLY_LEAVE':  Rảnh từ đầu buổi nhưng bận liên tiếp ở phần cuối (về sớm)
 * - 'MID_BREAK':    Bận xen kẽ ở giữa (chỉ xảy ra với khung >= 3h như [rảnh, bận, rảnh])
 */
export type PartialBusyKind = 'LATE_ARRIVAL' | 'EARLY_LEAVE' | 'MID_BREAK';

export function classifyPartialBusyPattern(busyFlags: readonly boolean[]): PartialBusyKind {
  // Tìm kíp rảnh đầu tiên và kíp rảnh cuối cùng
  const firstFreeIdx = busyFlags.indexOf(false);
  const lastFreeIdx = busyFlags.lastIndexOf(false);

  // Bận phần đầu (busyFlags[0] === true) và từ firstFreeIdx tới hết đều rảnh -> Vào muộn
  if (busyFlags[0] === true && firstFreeIdx > 0) {
    let allSuffixFree = true;
    for (let i = firstFreeIdx; i < busyFlags.length; i++) {
      if (busyFlags[i]) {
        allSuffixFree = false;
        break;
      }
    }
    if (allSuffixFree) {
      return 'LATE_ARRIVAL';
    }
  }

  // Rảnh phần đầu (busyFlags[0] === false) và từ sau lastFreeIdx tới hết đều bận -> Về sớm
  if (busyFlags[0] === false && lastFreeIdx >= 0 && lastFreeIdx < busyFlags.length - 1) {
    let allPrefixFree = true;
    for (let i = 0; i <= lastFreeIdx; i++) {
      if (busyFlags[i]) {
        allPrefixFree = false;
        break;
      }
    }
    if (allPrefixFree) {
      return 'EARLY_LEAVE';
    }
  }

  return 'MID_BREAK';
}

export interface ComputeHeatmapParams {
  members: readonly ClubMember[];
  entriesByMemberId: Record<string, Pick<MemberScheduleEntry, 'busySlots'>>;
  durationHours: SessionDurationHours;
  minPlayersPerShift?: number;
}

/**
 * Tính toàn bộ bảng Heatmap theo cửa sổ trượt (Sliding Window).
 * Quy tắc bất biến:
 * - CHỈ đếm các thành viên đang active VÀ đã nộp lịch (`submitted`).
 * - Thành viên chưa nộp lịch được liệt kê riêng ở `unsubmittedMemberIds`, không tính là rảnh hay bận.
 * - Với thời lượng 1.5h (và >= 2h), quét các kíp liền kề và tách bạch:
 *   + `fullFreeMemberIds` (Rảnh trọn buổi)
 *   + `lateArrivalMemberIds` (Bận kíp đầu / vào muộn)
 *   + `earlyLeaveMemberIds` (Bận kíp cuối / về sớm)
 *   + `partialBusyMemberIds` (Tổng hợp nhóm bận một phần)
 */
export function computeHeatmap(params: ComputeHeatmapParams): HeatmapSlot[] {
  const {
    members,
    entriesByMemberId,
    durationHours,
    minPlayersPerShift = DEFAULT_CLUB_SETTINGS.minPlayersPerShift,
  } = params;

  const effectiveMinPlayers = Number.isFinite(minPlayersPerShift)
    ? Math.max(1, Math.trunc(minPlayersPerShift))
    : DEFAULT_CLUB_SETTINGS.minPlayersPerShift;
  const summary = getScheduleSubmissionSummary(members, entriesByMemberId);
  const { submittedMembers, unsubmittedMembers, submittedCount, totalActiveCount } = summary;
  const unsubmittedIds = unsubmittedMembers.map((m) => m.id);

  // Tiền xử lý Set busySlots cho từng thành viên đã nộp để tra cứu O(1)
  const busySetByMember = new Map<string, Set<ScheduleSlotKey>>();
  for (const member of submittedMembers) {
    const rawSlots = entriesByMemberId[member.id]?.busySlots ?? [];
    busySetByMember.set(member.id, new Set(normalizeBusySlots(rawSlots)));
  }

  const results: HeatmapSlot[] = [];

  for (const dayOfWeek of SCHEDULE_DAYS) {
    for (const startHour of SCHEDULE_HOURS) {
      const coveredSlotKeys = getCoveredSlotKeysForWindow(dayOfWeek, startHour, durationHours);
      if (!coveredSlotKeys) continue;

      const fullFreeMemberIds: string[] = [];
      const partialBusyMemberIds: string[] = [];
      const lateArrivalMemberIds: string[] = [];
      const earlyLeaveMemberIds: string[] = [];
      const fullBusyMemberIds: string[] = [];

      for (const member of submittedMembers) {
        const busySet = busySetByMember.get(member.id)!;
        let busyCountInWindow = 0;
        const busyFlags: boolean[] = new Array(coveredSlotKeys.length);

        for (let i = 0; i < coveredSlotKeys.length; i++) {
          const isBusy = busySet.has(coveredSlotKeys[i]);
          busyFlags[i] = isBusy;
          if (isBusy) busyCountInWindow++;
        }

        if (busyCountInWindow === 0) {
          fullFreeMemberIds.push(member.id);
        } else if (busyCountInWindow === coveredSlotKeys.length) {
          fullBusyMemberIds.push(member.id);
        } else {
          partialBusyMemberIds.push(member.id);
          const kind = classifyPartialBusyPattern(busyFlags);
          if (kind === 'LATE_ARRIVAL') {
            lateArrivalMemberIds.push(member.id);
          } else if (kind === 'EARLY_LEAVE') {
            earlyLeaveMemberIds.push(member.id);
          }
        }
      }

      const freeCount = fullFreeMemberIds.length;
      const partialCount = partialBusyMemberIds.length;
      const availabilityRatio = submittedCount > 0 ? freeCount / submittedCount : 0;

      results.push({
        dayOfWeek,
        startHour,
        endHour: startHour + durationHours,
        durationHours,
        coveredSlotKeys,
        fullFreeMemberIds,
        partialBusyMemberIds,
        lateArrivalMemberIds,
        earlyLeaveMemberIds,
        fullBusyMemberIds,
        unsubmittedMemberIds: [...unsubmittedIds],
        freeCount,
        partialCount,
        submittedCount,
        totalActiveMembers: totalActiveCount,
        availabilityRatio,
        meetsMinPlayers: freeCount >= effectiveMinPlayers,
      });
    }
  }

  return results;
}

/**
 * Kiểm tra 2 khung giờ trên Heatmap có đè/giao nhau về thời gian hoặc kíp phủ hay không
 */
export function doHeatmapSlotsOverlap(a: HeatmapSlot, b: HeatmapSlot): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  if (a.startHour < b.endHour && b.startHour < a.endHour) return true;
  const keysA = new Set(a.coveredSlotKeys);
  for (const key of b.coveredSlotKeys) {
    if (keysA.has(key)) return true;
  }
  return false;
}

function compareHeatmapChronological(a: HeatmapSlot, b: HeatmapSlot): number {
  if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
  return a.startHour - b.startHour;
}

// =============================================================================
// 5. Xếp hạng Top khung giờ vàng & Gợi ý chia 2 ca tối ưu (Maximum 2-Set Coverage)
// =============================================================================

export interface RankGoldenSlotsOptions {
  /** Số lượng khung giờ tối đa trả về (mặc định 5) */
  limit?: number;
  /** Chỉ giữ các khung giờ đạt ngưỡng tối thiểu người/ca (mặc định true) */
  requireMinPlayers?: boolean;
  /** Loại bỏ các cửa sổ trượt đè giờ nhau trong cùng một ngày để lấy đỉnh độc lập (mặc định false) */
  deduplicateOverlapping?: boolean;
}

/**
 * Xếp hạng các khung giờ vàng tốt nhất trong tuần theo:
 * 1. Số người rảnh trọn buổi (`freeCount`) giảm dần
 * 2. Số người bận một phần có thể vào muộn/về sớm (`partialCount`) giảm dần
 * 3. Thứ tự thời gian tăng dần (T2 -> CN, sáng -> tối) để 100% tất định
 */
export function rankGoldenSlots(
  heatmapSlots: readonly HeatmapSlot[],
  options: RankGoldenSlotsOptions = {}
): HeatmapSlot[] {
  const {
    limit = 5,
    requireMinPlayers = true,
    deduplicateOverlapping = false,
  } = options;

  const effectiveLimit = Number.isFinite(limit) ? Math.trunc(limit) : 5;
  if (effectiveLimit <= 0 || heatmapSlots.length === 0) return [];

  const candidates = heatmapSlots.filter((slot) => {
    if (slot.freeCount <= 0) return false;
    if (requireMinPlayers && !slot.meetsMinPlayers) return false;
    return true;
  });

  const sorted = [...candidates].sort((a, b) => {
    if (a.meetsMinPlayers !== b.meetsMinPlayers) {
      return a.meetsMinPlayers ? -1 : 1;
    }
    if (b.freeCount !== a.freeCount) {
      return b.freeCount - a.freeCount;
    }
    if (b.partialCount !== a.partialCount) {
      return b.partialCount - a.partialCount;
    }
    return compareHeatmapChronological(a, b);
  });

  if (!deduplicateOverlapping) {
    return sorted.slice(0, effectiveLimit);
  }

  const picked: HeatmapSlot[] = [];
  for (const slot of sorted) {
    if (picked.some((existing) => doHeatmapSlotsOverlap(existing, slot))) {
      continue;
    }
    picked.push(slot);
    if (picked.length >= effectiveLimit) break;
  }
  return picked;
}

function popcountBigInt(mask: bigint): number {
  let m = mask;
  let count = 0;
  while (m > 0n) {
    m &= m - 1n; // Xóa bit 1 thấp nhất (Brian Kernighan's algorithm)
    count++;
  }
  return count;
}

export interface SuggestTwoShiftsParams {
  heatmapSlots: readonly HeatmapSlot[];
  members: readonly ClubMember[];
  entriesByMemberId: Record<string, Pick<MemberScheduleEntry, 'busySlots'>>;
  /** Ngưỡng người tối thiểu cho MỖI ca (mặc định 4 người/ca) */
  minPlayersPerShift?: number;
  /** Số phương án cặp 2 ca tối đa trả về (mặc định 5) */
  limit?: number;
  /** Bắt buộc 2 ca phải nằm ở 2 ngày khác nhau trong tuần (mặc định false) */
  requireDifferentDays?: boolean;
}

/**
 * Thuật toán Gợi ý chia 2 ca tối ưu (Exact Global Maximum 2-Set Coverage):
 * - Ràng buộc cứng:
 *   1. Mỗi ca bắt buộc có `freeCount >= minPlayersPerShift` (mặc định >= 4 người rảnh trọn buổi).
 *   2. Hai ca không được trùng/giao nhau về thời gian (`!doHeatmapSlotsOverlap`).
 *   3. Chỉ tính trên tập thành viên active ĐÃ NỘP LỊCH (`submitted`).
 * - Hàm mục tiêu phân tầng nghiêm ngặt:
 *   1. Tối đa hóa độ phủ hợp `|ShiftA ∪ ShiftB|` (tổng số thành viên duy nhất được đi đánh ít nhất 1 ca).
 *   2. Tối đa hóa quy mô ca nhỏ hơn `min(|A|, |B|)` để 2 ca cân bằng người mở sân.
 *   3. Tối đa hóa tổng công suất `|A| + |B|`.
 *   4. Ưu tiên nhẹ 2 ca khác ngày so với 2 ca cùng ngày.
 *   5. Ưu tiên tổng số người có thể vào muộn/về sớm (`partialCount`).
 */
export function suggestTwoShifts(params: SuggestTwoShiftsParams): TwoShiftSuggestion[] {
  const {
    heatmapSlots,
    members,
    entriesByMemberId,
    minPlayersPerShift = DEFAULT_CLUB_SETTINGS.minPlayersPerShift,
    limit = 5,
    requireDifferentDays = false,
  } = params;

  const effectiveLimit = Number.isFinite(limit) ? Math.trunc(limit) : 5;
  if (effectiveLimit <= 0 || heatmapSlots.length < 2) return [];

  const effectiveMinPlayers = Number.isFinite(minPlayersPerShift)
    ? Math.max(1, Math.trunc(minPlayersPerShift))
    : DEFAULT_CLUB_SETTINGS.minPlayersPerShift;
  const summary = getScheduleSubmissionSummary(members, entriesByMemberId);
  const { submittedMembers, submittedCount } = summary;

  if (submittedCount < effectiveMinPlayers) {
    return [];
  }

  // Ánh xạ mỗi thành viên đã nộp sang chỉ số bit 0..M-1 (hỗ trợ số lượng thành viên bất kỳ nhờ BigInt)
  const memberBitIndex = new Map<string, number>();
  for (let idx = 0; idx < submittedMembers.length; idx++) {
    memberBitIndex.set(submittedMembers[idx].id, idx);
  }

  interface PreparedEligibleSlot {
    slot: HeatmapSlot;
    mask: bigint;
    validFreeIds: string[];
  }

  const eligible: PreparedEligibleSlot[] = [];
  for (const slot of [...heatmapSlots].sort(compareHeatmapChronological)) {
    let mask = 0n;
    const validFreeIds: string[] = [];
    const seenInSlot = new Set<string>();
    for (const memberId of slot.fullFreeMemberIds) {
      if (seenInSlot.has(memberId)) continue;
      const bitIdx = memberBitIndex.get(memberId);
      if (bitIdx !== undefined) {
        seenInSlot.add(memberId);
        validFreeIds.push(memberId);
        mask |= 1n << BigInt(bitIdx);
      }
    }
    if (validFreeIds.length >= effectiveMinPlayers) {
      eligible.push({ slot, mask, validFreeIds });
    }
  }

  if (eligible.length < 2) {
    return [];
  }

  interface ScoredCandidatePair {
    idxA: number;
    idxB: number;
    unionMask: bigint;
    interMask: bigint;
    coveredCount: number;
    score: number;
  }

  const candidates: ScoredCandidatePair[] = [];

  for (let i = 0; i < eligible.length; i++) {
    const itemA = eligible[i];
    const slotA = itemA.slot;
    const maskA = itemA.mask;
    const sizeA = itemA.validFreeIds.length;

    for (let j = i + 1; j < eligible.length; j++) {
      const itemB = eligible[j];
      const slotB = itemB.slot;
      if (requireDifferentDays && slotA.dayOfWeek === slotB.dayOfWeek) {
        continue;
      }
      if (doHeatmapSlotsOverlap(slotA, slotB)) {
        continue;
      }

      const maskB = itemB.mask;
      const sizeB = itemB.validFreeIds.length;
      const unionMask = maskA | maskB;
      const interMask = maskA & maskB;
      const coveredCount = popcountBigInt(unionMask);
      const minShiftSize = Math.min(sizeA, sizeB);
      const totalCapacity = sizeA + sizeB;
      const differentDayBonus = slotA.dayOfWeek !== slotB.dayOfWeek ? 500 : 0;
      const partialBonus = Math.min(99, slotA.partialCount + slotB.partialCount);

      const score =
        coveredCount * 1_000_000_000 +
        minShiftSize * 1_000_000 +
        totalCapacity * 1_000 +
        differentDayBonus +
        partialBonus;

      candidates.push({
        idxA: i,
        idxB: j,
        unionMask,
        interMask,
        coveredCount,
        score,
      });
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const cmpA = compareHeatmapChronological(eligible[a.idxA].slot, eligible[b.idxA].slot);
    if (cmpA !== 0) return cmpA;
    return compareHeatmapChronological(eligible[a.idxB].slot, eligible[b.idxB].slot);
  });

  const topPairs = candidates.slice(0, effectiveLimit);

  return topPairs.map((pair) => {
    const itemA = eligible[pair.idxA];
    const itemB = eligible[pair.idxB];

    const coveredMemberIds: string[] = [];
    const overlapMemberIds: string[] = [];
    const uncoveredMemberIds: string[] = [];

    for (let mIdx = 0; mIdx < submittedMembers.length; mIdx++) {
      const bit = 1n << BigInt(mIdx);
      const memberId = submittedMembers[mIdx].id;
      if ((pair.unionMask & bit) !== 0n) {
        coveredMemberIds.push(memberId);
        if ((pair.interMask & bit) !== 0n) {
          overlapMemberIds.push(memberId);
        }
      } else {
        uncoveredMemberIds.push(memberId);
      }
    }

    return {
      shiftA: {
        slot: itemA.slot,
        assignedMemberIds: [...itemA.validFreeIds],
      },
      shiftB: {
        slot: itemB.slot,
        assignedMemberIds: [...itemB.validFreeIds],
      },
      coveredMemberIds,
      overlapMemberIds,
      uncoveredMemberIds,
      coverageRatio: submittedCount > 0 ? coveredMemberIds.length / submittedCount : 0,
      score: pair.score,
    };
  });
}
