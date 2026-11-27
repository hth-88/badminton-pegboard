import type { BadmintonRank, Sex } from './badminton';

// =============================================================================
// 1. Lưới thời gian 18 kíp 1 tiếng (6h–24h) × 7 ngày (T2..CN)
// =============================================================================

/** 18 khung giờ 1 tiếng bắt đầu từ 6h (06:00–07:00) tới 23h (23:00–24:00) */
export const SCHEDULE_HOURS = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
] as const;

export type ScheduleHour = (typeof SCHEDULE_HOURS)[number];

/** Thứ trong tuần theo chuẩn ISO: 0 = Thứ 2 ... 6 = Chủ Nhật */
export const SCHEDULE_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export type DayOfWeek = (typeof SCHEDULE_DAYS)[number];

export const DAY_LABELS_VI: Record<DayOfWeek, string> = {
  0: 'T2',
  1: 'T3',
  2: 'T4',
  3: 'T5',
  4: 'T6',
  5: 'T7',
  6: 'CN',
};

/** Khóa kíp chuẩn: `${dayOfWeek}-${hour}`, ví dụ "0-19" = Thứ 2, 19h–20h */
export type ScheduleSlotKey = `${DayOfWeek}-${ScheduleHour}`;

/** Khóa tuần: 'FIXED' (lịch bận cố định) hoặc tuần ISO 'YYYY-Www' (vd '2026-W48') */
export type WeekKey = 'FIXED' | `${number}-W${string}`;

/** Các mức thời lượng buổi đánh hỗ trợ quét cửa sổ liên tiếp trên Heatmap */
export const SESSION_DURATION_OPTIONS = [1, 1.5, 2, 3] as const;

export type SessionDurationHours = (typeof SESSION_DURATION_OPTIONS)[number];

// =============================================================================
// 2. Club (Bảng public.clubs)
// =============================================================================

export interface ClubSettings {
  /** Cho phép thành viên tự thêm tên mới vào CLB (Host có thể bật/tắt) */
  allowSelfRegister: boolean;
  /** Thời lượng mặc định khi mở Heatmap (giờ) */
  defaultDurationHours: SessionDurationHours;
  /** Số người rảnh tối thiểu cho mỗi ca khi gợi ý chốt kèo / chia 2 ca (mặc định 4) */
  minPlayersPerShift: number;
  /** Số sân dự kiến mặc định của CLB (tùy chọn) */
  defaultCourtCount?: number;
  /** Múi giờ chuẩn của CLB (mặc định 'Asia/Ho_Chi_Minh') */
  timezone?: string;
}

export const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  allowSelfRegister: true,
  defaultDurationHours: 2,
  minPlayersPerShift: 4,
  timezone: 'Asia/Ho_Chi_Minh',
};

export interface ClubActiveRoom {
  roomCode: string;
  label: string;
  weekKey?: WeekKey;
  dayOfWeek?: DayOfWeek;
  startHour?: ScheduleHour;
  durationHours?: SessionDurationHours;
  createdAt: string;
}

export interface Club {
  clubCode: string;
  name: string;
  activeRooms: ClubActiveRoom[];
  lockedWeeks: string[];
  settings: ClubSettings;
  createdAt: string;
  updatedAt: string;
}

/** Dòng dữ liệu trả về từ Supabase public.clubs (tuyệt đối KHÔNG chứa host_pin_hash) */
export interface ClubRecord {
  club_code: string;
  name: string;
  active_rooms: ClubActiveRoom[];
  locked_weeks: string[];
  settings: Partial<ClubSettings>;
  created_at: string;
  updated_at: string;
}

/** Danh sách cột công khai dùng cho .select(...) trên bảng public.clubs */
export const CLUB_PUBLIC_COLUMNS =
  'club_code, name, active_rooms, locked_weeks, settings, created_at, updated_at' as const;

// =============================================================================
// 3. ClubMember (Bảng public.club_members)
// =============================================================================

export interface ClubMember {
  id: string;
  clubCode: string;
  name: string;
  gender: Sex;
  rank: BadmintonRank;
  rankScore: number;
  noSingles: boolean;
  /** Cột sinh phía server (pin_hash IS NOT NULL), không bao giờ trả pin_hash */
  hasPin: boolean;
  isActive: boolean;
  /** Cột dự phòng cho Supabase Auth ở giai đoạn sau */
  authUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Dòng dữ liệu trả về từ Supabase public.club_members (tuyệt đối KHÔNG chứa pin_hash) */
export interface ClubMemberRecord {
  id: string;
  club_code: string;
  name: string;
  gender: Sex;
  rank: BadmintonRank;
  rank_score: number;
  no_singles: boolean;
  has_pin: boolean;
  is_active: boolean;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Danh sách cột công khai dùng cho .select(...) trên bảng public.club_members */
export const CLUB_MEMBER_PUBLIC_COLUMNS =
  'id, club_code, name, gender, rank, rank_score, no_singles, has_pin, is_active, auth_user_id, created_at, updated_at' as const;

/** Ghi chú & nhãn kín của Host cho từng thành viên (chỉ lưu localStorage, không đồng bộ lên bảng công khai) */
export interface HostMemberPrivateMeta {
  memberId: string;
  notes: string;
  tags: string[];
  updatedAt: string;
}

// =============================================================================
// 4. WeeklySchedule (Bảng public.member_schedules)
// =============================================================================

export interface MemberScheduleEntry {
  id: string;
  clubCode: string;
  weekKey: WeekKey;
  memberId: string;
  busySlots: ScheduleSlotKey[];
  note: string;
  updatedAt: string;
}

/** Dòng dữ liệu trả về từ Supabase public.member_schedules */
export interface MemberScheduleRecord {
  id: string;
  club_code: string;
  week_key: WeekKey;
  member_id: string;
  busy_slots: ScheduleSlotKey[];
  note: string;
  updated_at: string;
}

/** Danh sách cột dùng cho .select(...) trên bảng public.member_schedules */
export const MEMBER_SCHEDULE_PUBLIC_COLUMNS =
  'id, club_code, week_key, member_id, busy_slots, note, updated_at' as const;

export interface WeeklySchedule {
  clubCode: string;
  weekKey: WeekKey;
  isLocked: boolean;
  /** Lịch bận đã nộp của từng thành viên cho weekKey hiện tại */
  entriesByMemberId: Record<string, MemberScheduleEntry>;
  /** Lịch bận cố định ('FIXED') dùng để tham chiếu / chép nhanh sang tuần mới */
  fixedEntriesByMemberId?: Record<string, MemberScheduleEntry>;
}

// =============================================================================
// 5. HeatmapSlot & TwoShiftSuggestion
// =============================================================================

export interface HeatmapSlot {
  dayOfWeek: DayOfWeek;
  startHour: ScheduleHour;
  /** Giờ kết thúc (startHour + durationHours, tối đa 24) */
  endHour: number;
  durationHours: SessionDurationHours;
  /** Các kíp 1 tiếng bị phủ bởi cửa sổ thời lượng này */
  coveredSlotKeys: ScheduleSlotKey[];
  /** Thành viên active đã nộp lịch và rảnh trọn vẹn tất cả kíp trong cửa sổ */
  fullFreeMemberIds: string[];
  /** Thành viên active đã nộp lịch và bận một phần (rảnh ít nhất 1 kíp nhưng không rảnh trọn buổi) */
  partialBusyMemberIds: string[];
  /** Thành viên bận kíp đầu nhưng rảnh kíp cuối của cửa sổ (vào muộn) */
  lateArrivalMemberIds: string[];
  /** Thành viên rảnh kíp đầu nhưng bận kíp cuối của cửa sổ (về sớm) */
  earlyLeaveMemberIds: string[];
  /** Thành viên active đã nộp lịch và bận toàn bộ các kíp trong cửa sổ */
  fullBusyMemberIds: string[];
  /** Thành viên active chưa nộp lịch cho tuần đang xét (không tính vào mẫu số Heatmap) */
  unsubmittedMemberIds: string[];
  freeCount: number;
  partialCount: number;
  /** Số thành viên active đã nộp lịch (mẫu số chính thức của Heatmap) */
  submittedCount: number;
  /** Tổng số thành viên active của CLB (gồm cả người chưa nộp lịch) */
  totalActiveMembers: number;
  /** Tỷ lệ rảnh trọn buổi trên số người đã nộp lịch (0..1) */
  availabilityRatio: number;
  /** Đạt ngưỡng tối thiểu người/ca hay không (mặc định >= 4) */
  meetsMinPlayers: boolean;
}

export interface ShiftSlotSummary {
  slot: HeatmapSlot;
  /** Danh sách thành viên rảnh trọn buổi thuộc ca này */
  assignedMemberIds: string[];
}

export interface TwoShiftSuggestion {
  shiftA: ShiftSlotSummary;
  shiftB: ShiftSlotSummary;
  /** Tập hợp thành viên rảnh ít nhất 1 trong 2 ca (union) */
  coveredMemberIds: string[];
  /** Thành viên rảnh cả 2 ca (intersection) */
  overlapMemberIds: string[];
  /** Thành viên active không rảnh ca nào */
  uncoveredMemberIds: string[];
  /** Tỷ lệ phủ thành viên active của cặp 2 ca (0..1) */
  coverageRatio: number;
  /** Điểm xếp hạng tổng hợp để sắp xếp các phương án chia 2 ca */
  score: number;
}

// =============================================================================
// 6. Permission Matrix & Server RPC Error Codes
// =============================================================================

export type ClubRole = 'CLUB_HOST' | 'CLUB_MEMBER' | 'GUEST';

export type ClubPermissionAction =
  | 'VIEW_CLUB_SCHEDULE'
  | 'SELF_REGISTER_MEMBER'
  | 'EDIT_OWN_SCHEDULE'
  | 'SET_OWN_PIN'
  | 'EDIT_LOCKED_WEEK_SCHEDULE'
  | 'EDIT_OTHER_MEMBER_SCHEDULE'
  | 'EDIT_MEMBER_RANK_OR_PROFILE'
  | 'DELETE_OR_HIDE_MEMBER'
  | 'RESET_MEMBER_PIN'
  | 'LOCK_OR_UNLOCK_WEEK'
  | 'FINALIZE_BOOKING_AND_ROOMS'
  | 'UPDATE_CLUB_SETTINGS';

export type PermissionRule = 'ALLOW' | 'ALLOW_IF_SELF_REGISTER' | 'DENY';

export type ClubPermissionMatrix = Record<
  ClubRole,
  Record<ClubPermissionAction, PermissionRule>
>;

/**
 * Ma trận phân quyền chính thức của CLB:
 * - Thành viên được phép xem lịch, tự thêm tên (khi allowSelfRegister = true),
 *   tự sửa lịch của mình (khi tuần chưa khóa & đúng PIN cá nhân nếu đã đặt), và tự đặt/đổi PIN.
 * - Chỉ CLUB_HOST được sửa trình độ, ẩn/xóa thành viên khác, reset PIN hộ,
 *   khóa/mở tuần, sửa lịch khi tuần đã khóa, chốt kèo/phòng và đổi cài đặt CLB.
 */
export const CLUB_PERMISSION_MATRIX: ClubPermissionMatrix = {
  CLUB_HOST: {
    VIEW_CLUB_SCHEDULE: 'ALLOW',
    SELF_REGISTER_MEMBER: 'ALLOW',
    EDIT_OWN_SCHEDULE: 'ALLOW',
    SET_OWN_PIN: 'ALLOW',
    EDIT_LOCKED_WEEK_SCHEDULE: 'ALLOW',
    EDIT_OTHER_MEMBER_SCHEDULE: 'ALLOW',
    EDIT_MEMBER_RANK_OR_PROFILE: 'ALLOW',
    DELETE_OR_HIDE_MEMBER: 'ALLOW',
    RESET_MEMBER_PIN: 'ALLOW',
    LOCK_OR_UNLOCK_WEEK: 'ALLOW',
    FINALIZE_BOOKING_AND_ROOMS: 'ALLOW',
    UPDATE_CLUB_SETTINGS: 'ALLOW',
  },
  CLUB_MEMBER: {
    VIEW_CLUB_SCHEDULE: 'ALLOW',
    SELF_REGISTER_MEMBER: 'ALLOW_IF_SELF_REGISTER',
    EDIT_OWN_SCHEDULE: 'ALLOW',
    SET_OWN_PIN: 'ALLOW',
    EDIT_LOCKED_WEEK_SCHEDULE: 'DENY',
    EDIT_OTHER_MEMBER_SCHEDULE: 'DENY',
    EDIT_MEMBER_RANK_OR_PROFILE: 'DENY',
    DELETE_OR_HIDE_MEMBER: 'DENY',
    RESET_MEMBER_PIN: 'DENY',
    LOCK_OR_UNLOCK_WEEK: 'DENY',
    FINALIZE_BOOKING_AND_ROOMS: 'DENY',
    UPDATE_CLUB_SETTINGS: 'DENY',
  },
  GUEST: {
    VIEW_CLUB_SCHEDULE: 'ALLOW',
    SELF_REGISTER_MEMBER: 'ALLOW_IF_SELF_REGISTER',
    EDIT_OWN_SCHEDULE: 'DENY',
    SET_OWN_PIN: 'DENY',
    EDIT_LOCKED_WEEK_SCHEDULE: 'DENY',
    EDIT_OTHER_MEMBER_SCHEDULE: 'DENY',
    EDIT_MEMBER_RANK_OR_PROFILE: 'DENY',
    DELETE_OR_HIDE_MEMBER: 'DENY',
    RESET_MEMBER_PIN: 'DENY',
    LOCK_OR_UNLOCK_WEEK: 'DENY',
    FINALIZE_BOOKING_AND_ROOMS: 'DENY',
    UPDATE_CLUB_SETTINGS: 'DENY',
  },
};

/**
 * Kiểm tra quyền thực hiện thao tác CLB theo vai trò và cấu hình CLB
 */
export function canPerformClubAction(
  role: ClubRole,
  action: ClubPermissionAction,
  settings?: Pick<ClubSettings, 'allowSelfRegister'>
): boolean {
  const rule = CLUB_PERMISSION_MATRIX[role][action];
  if (rule === 'ALLOW') return true;
  if (rule === 'ALLOW_IF_SELF_REGISTER') {
    return settings ? settings.allowSelfRegister : DEFAULT_CLUB_SETTINGS.allowSelfRegister;
  }
  return false;
}

/** Danh sách mã lỗi chuẩn trả về từ các RPC SECURITY DEFINER trên Supabase */
export const CLUB_RPC_ERROR_CODES = [
  'INVALID_CLUB_CODE',
  'INVALID_CLUB_NAME',
  'INVALID_HOST_PIN_FORMAT',
  'INVALID_HOST_PIN',
  'INVALID_SETTINGS',
  'CLUB_ALREADY_EXISTS',
  'CLUB_NOT_FOUND',
  'INVALID_WEEK_KEY',
  'INVALID_ROOM_PAYLOAD',
  'INVALID_ROOM_CODE',
  'SELF_REGISTER_DISABLED',
  'INVALID_MEMBER_NAME',
  'INVALID_GENDER',
  'INVALID_RANK',
  'INVALID_RANK_SCORE',
  'INVALID_MEMBER_PIN_FORMAT',
  'INVALID_MEMBER_PIN',
  'MEMBER_NAME_ALREADY_EXISTS',
  'MEMBER_NOT_FOUND',
  'MEMBER_INACTIVE',
  'INVALID_BUSY_SLOTS',
  'WEEK_LOCKED',
] as const;

export type ClubRpcErrorCode = (typeof CLUB_RPC_ERROR_CODES)[number];

// ============================================================================
// 6. Điều hướng 5 Tab & Hợp nhất Permission Matrix UI (Room Role × Club Role)
// ============================================================================

/** 5 tab chính trên BottomNav cho cả Host và Viewer */
export const ALL_APP_NAV_TABS = [
  'schedule',
  'courts',
  'queue',
  'history',
  'settlement',
] as const;

export type AppNavTab = (typeof ALL_APP_NAV_TABS)[number];

/** Vai trò trong phòng đánh trực tuyến (khớp 1-1 với RoomRole của useCloudRoom) */
export type SessionRoomRole = 'OFFLINE' | 'CO_HOST' | 'VIEWER';

/** Quyền thực thi đã giải quyết cho tầng UI */
export interface ResolvedUiPermissions {
  visibleTabs: readonly AppNavTab[];
  roomRole: SessionRoomRole;
  clubRole: ClubRole;
  isRoomViewer: boolean;
  canMutateSession: boolean;
  canViewPairRulesSubTab: boolean;
  canSelfReportPayment: boolean;
  canViewClubSchedule: boolean;
  canSelfRegisterMember: boolean;
  canEditOwnSchedule: boolean;
  canSetOwnPin: boolean;
  canEditOtherMemberSchedule: boolean;
  canManageClubRoster: boolean;
  canDeleteOrHideMember: boolean;
  canResetMemberPin: boolean;
  canLockOrUnlockWeek: boolean;
  canFinalizeBookingAndRooms: boolean;
  canUpdateClubSettings: boolean;
}

/**
 * Hợp nhất phân quyền giữa Phòng đánh (RoomRole) và CLB/Lịch tuần (ClubRole).
 * - BottomNav luôn hiển thị đủ 5 tab cho cả Host và Viewer.
 * - Sub-tab Luật cặp trong Hàng chờ chỉ mở khi không phải VIEWER của phòng.
 * - Các thao tác Lịch tuần độc lập hoàn toàn với quyền VIEWER của phòng đánh.
 */
export function resolveUiPermissions(params: {
  roomRole: SessionRoomRole;
  clubRole: ClubRole;
  clubSettings?: Pick<ClubSettings, 'allowSelfRegister'>;
  isCurrentWeekLocked?: boolean;
}): ResolvedUiPermissions {
  const {
    roomRole,
    clubRole,
    clubSettings,
    isCurrentWeekLocked = false,
  } = params;
  const isRoomViewer = roomRole === 'VIEWER';

  return {
    visibleTabs: ALL_APP_NAV_TABS,
    roomRole,
    clubRole,
    isRoomViewer,
    canMutateSession: !isRoomViewer,
    canViewPairRulesSubTab: !isRoomViewer,
    canSelfReportPayment: isRoomViewer,
    canViewClubSchedule: canPerformClubAction(
      clubRole,
      'VIEW_CLUB_SCHEDULE',
      clubSettings
    ),
    canSelfRegisterMember: canPerformClubAction(
      clubRole,
      'SELF_REGISTER_MEMBER',
      clubSettings
    ),
    canEditOwnSchedule: isCurrentWeekLocked
      ? canPerformClubAction(
          clubRole,
          'EDIT_LOCKED_WEEK_SCHEDULE',
          clubSettings
        )
      : canPerformClubAction(clubRole, 'EDIT_OWN_SCHEDULE', clubSettings),
    canSetOwnPin: canPerformClubAction(clubRole, 'SET_OWN_PIN', clubSettings),
    canEditOtherMemberSchedule: canPerformClubAction(
      clubRole,
      'EDIT_OTHER_MEMBER_SCHEDULE',
      clubSettings
    ),
    canManageClubRoster: canPerformClubAction(
      clubRole,
      'EDIT_MEMBER_RANK_OR_PROFILE',
      clubSettings
    ),
    canDeleteOrHideMember: canPerformClubAction(
      clubRole,
      'DELETE_OR_HIDE_MEMBER',
      clubSettings
    ),
    canResetMemberPin: canPerformClubAction(
      clubRole,
      'RESET_MEMBER_PIN',
      clubSettings
    ),
    canLockOrUnlockWeek: canPerformClubAction(
      clubRole,
      'LOCK_OR_UNLOCK_WEEK',
      clubSettings
    ),
    canFinalizeBookingAndRooms: canPerformClubAction(
      clubRole,
      'FINALIZE_BOOKING_AND_ROOMS',
      clubSettings
    ),
    canUpdateClubSettings: canPerformClubAction(
      clubRole,
      'UPDATE_CLUB_SETTINGS',
      clubSettings
    ),
  };
}

/**
 * Quyết định tab mở đầu tiên khi truy cập từ URL:
 * - Mặc định luôn là 'courts' (Sân), kể cả khi có ?room=CODE hoặc có phòng LIVE.
 * - Chỉ tự động chuyển sang 'schedule' (Lịch tuần) khi vào bằng ?club=CODE
 *   (không kèm ?room=) VÀ CLB hiện chưa có phòng đánh LIVE nào.
 */
export function resolveClubUrlInitialTab(params: {
  hasClubParam: boolean;
  hasRoomParam: boolean;
  activeRoomsCount: number;
}): AppNavTab {
  if (
    params.hasClubParam &&
    !params.hasRoomParam &&
    params.activeRoomsCount <= 0
  ) {
    return 'schedule';
  }
  return 'courts';
}
