import type { RealtimeChannel } from '@supabase/supabase-js';
import { ORDERED_RANKS, RANK_BASE_SCORES } from '../engine/skillConfig';
import { isValidWeekKey, normalizeBusySlots } from '../engine/scheduleEngine';
import type { BadmintonRank, Sex } from '../types/badminton';
import {
  CLUB_MEMBER_PUBLIC_COLUMNS,
  CLUB_PUBLIC_COLUMNS,
  CLUB_RPC_ERROR_CODES,
  DEFAULT_CLUB_SETTINGS,
  MEMBER_SCHEDULE_PUBLIC_COLUMNS,
  SESSION_DURATION_OPTIONS,
  type Club,
  type ClubActiveRoom,
  type ClubMember,
  type ClubMemberRecord,
  type ClubRecord,
  type ClubRpcErrorCode,
  type ClubSettings,
  type MemberScheduleEntry,
  type MemberScheduleRecord,
  type SessionDurationHours,
  type WeekKey,
} from '../types/schedule';
import { getSupabaseClient } from './supabaseSync';

export interface ClubSyncResult<T> {
  data: T | null;
  error: string | null;
  errorCode: ClubRpcErrorCode | null;
}

export const NO_SUPABASE_CONFIG_ERROR = 'Chưa cấu hình Supabase URL & Anon Key';

export const CLUB_RPC_ERROR_MESSAGES_VI: Record<ClubRpcErrorCode, string> = {
  INVALID_CLUB_CODE: 'Mã CLB không hợp lệ (chỉ dùng chữ in hoa, số, gạch ngang/dưới, dài 3–32 ký tự).',
  INVALID_CLUB_NAME: 'Tên CLB phải từ 1 đến 80 ký tự.',
  INVALID_HOST_PIN_FORMAT: 'Mã PIN Host phải từ 4 đến 32 ký tự.',
  INVALID_HOST_PIN: 'Mã PIN Host không chính xác.',
  INVALID_SETTINGS: 'Cấu hình CLB không hợp lệ.',
  CLUB_ALREADY_EXISTS: 'Mã CLB này đã tồn tại trên hệ thống.',
  CLUB_NOT_FOUND: 'Không tìm thấy CLB với mã đã nhập.',
  INVALID_WEEK_KEY: 'Mã tuần lịch không hợp lệ.',
  INVALID_ROOM_PAYLOAD: 'Thông tin phòng gắn với CLB không hợp lệ.',
  INVALID_ROOM_CODE: 'Mã phòng sân không hợp lệ.',
  SELF_REGISTER_DISABLED: 'Host đã tắt tính năng thành viên tự đăng ký tên mới.',
  INVALID_MEMBER_NAME: 'Tên thành viên phải từ 1 đến 60 ký tự.',
  INVALID_GENDER: 'Giới tính không hợp lệ (chỉ chấp nhận Nam/Nữ).',
  INVALID_RANK: 'Mức trình độ cầu lông không hợp lệ.',
  INVALID_RANK_SCORE: 'Điểm trình độ phải nằm trong khoảng 0 đến 30.',
  INVALID_MEMBER_PIN_FORMAT: 'Mã PIN cá nhân phải từ 4 đến 32 ký tự.',
  INVALID_MEMBER_PIN: 'Mã PIN cá nhân không chính xác.',
  MEMBER_NAME_ALREADY_EXISTS: 'Tên thành viên này đã tồn tại trong danh sách CLB.',
  MEMBER_NOT_FOUND: 'Không tìm thấy thành viên trong CLB.',
  MEMBER_INACTIVE: 'Thành viên này hiện đang tạm ẩn / ngừng hoạt động.',
  INVALID_BUSY_SLOTS: 'Danh sách khung giờ bận không hợp lệ.',
  WEEK_LOCKED: 'Tuần lịch này đã được Host khóa sổ, không thể tự chỉnh sửa.',
};

/**
 * Chuẩn hóa mã CLB (viết hoa, cắt khoảng trắng)
 */
export function normalizeClubCode(rawCode: string | null | undefined): string {
  return (rawCode ?? '').trim().toUpperCase();
}

export const NETWORK_OFFLINE_ERROR_VI =
  'Không thể kết nối mạng. Vui lòng kiểm tra Wi-Fi/4G và thử lại.';

/**
 * Tách mã lỗi chuẩn ClubRpcErrorCode từ lỗi trả về của Supabase RPC
 */
export function parseClubRpcError(err: unknown): {
  code: ClubRpcErrorCode | null;
  message: string;
} {
  const rawObj = err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
  const rawMessage =
    typeof err === 'string'
      ? err
      : typeof rawObj?.message === 'string' && rawObj.message.trim()
        ? rawObj.message
        : typeof rawObj?.details === 'string' && rawObj.details.trim()
          ? rawObj.details
          : 'Lỗi kết nối máy chủ Supabase.';

  const combinedSearchText =
    typeof err === 'string'
      ? err
      : [rawObj?.message, rawObj?.details, rawObj?.hint]
          .filter((s): s is string => typeof s === 'string')
          .join(' ');

  for (const code of CLUB_RPC_ERROR_CODES) {
    // Kiểm tra khớp nguyên từ để tránh INVALID_HOST_PIN khớp nhầm INVALID_HOST_PIN_FORMAT
    const boundaryRegex = new RegExp(`\\b${code}\\b`);
    if (boundaryRegex.test(combinedSearchText)) {
      return {
        code,
        message: CLUB_RPC_ERROR_MESSAGES_VI[code],
      };
    }
  }

  if (
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected/i.test(
      combinedSearchText || rawMessage
    ) ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  ) {
    return {
      code: null,
      message: NETWORK_OFFLINE_ERROR_VI,
    };
  }

  return {
    code: null,
    message: rawMessage,
  };
}

function unwrapSingleRow<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    return raw.length > 0 ? (raw[0] ?? null) : null;
  }
  return raw;
}

function normalizeClubSettings(raw: Partial<ClubSettings> | null | undefined): ClubSettings {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const durationCandidate = Number(src.defaultDurationHours);
  const validDuration: SessionDurationHours = (
    SESSION_DURATION_OPTIONS as readonly number[]
  ).includes(durationCandidate)
    ? (durationCandidate as SessionDurationHours)
    : DEFAULT_CLUB_SETTINGS.defaultDurationHours;

  const minPlayersCandidate = Number(src.minPlayersPerShift);
  const validMinPlayers =
    Number.isFinite(minPlayersCandidate) && minPlayersCandidate >= 1
      ? Math.trunc(minPlayersCandidate)
      : DEFAULT_CLUB_SETTINGS.minPlayersPerShift;

  const courtCountCandidate = Number(src.defaultCourtCount);

  return {
    allowSelfRegister:
      typeof src.allowSelfRegister === 'boolean'
        ? src.allowSelfRegister
        : DEFAULT_CLUB_SETTINGS.allowSelfRegister,
    defaultDurationHours: validDuration,
    minPlayersPerShift: validMinPlayers,
    ...(Number.isFinite(courtCountCandidate) && courtCountCandidate >= 1
      ? { defaultCourtCount: Math.trunc(courtCountCandidate) }
      : {}),
    timezone:
      typeof src.timezone === 'string' && src.timezone.trim()
        ? src.timezone.trim()
        : DEFAULT_CLUB_SETTINGS.timezone,
  };
}

function normalizeActiveRooms(raw: unknown): ClubActiveRoom[] {
  if (!Array.isArray(raw)) return [];
  const rooms: ClubActiveRoom[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const roomCode = typeof rec.roomCode === 'string' ? rec.roomCode.trim().toUpperCase() : '';
    if (!roomCode) continue;
    rooms.push({
      roomCode,
      label:
        typeof rec.label === 'string' && rec.label.trim() ? rec.label.trim() : roomCode,
      ...(typeof rec.weekKey === 'string' ? { weekKey: rec.weekKey as WeekKey } : {}),
      ...(typeof rec.dayOfWeek === 'number'
        ? { dayOfWeek: rec.dayOfWeek as ClubActiveRoom['dayOfWeek'] }
        : {}),
      ...(typeof rec.startHour === 'number'
        ? { startHour: rec.startHour as ClubActiveRoom['startHour'] }
        : {}),
      ...(typeof rec.durationHours === 'number'
        ? { durationHours: rec.durationHours as SessionDurationHours }
        : {}),
      createdAt:
        typeof rec.createdAt === 'string' && rec.createdAt
          ? rec.createdAt
          : new Date(0).toISOString(),
    });
  }
  return rooms;
}

function normalizeLockedWeeks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((item): item is string => typeof item === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ).sort();
}

/**
 * Chuyển đổi bản ghi ClubRecord từ Supabase sang domain Club (không bao giờ chứa host_pin_hash)
 */
export function mapClubRecord(rec: ClubRecord): Club {
  return {
    clubCode: normalizeClubCode(rec.club_code),
    name: (rec.name ?? '').trim(),
    activeRooms: normalizeActiveRooms(rec.active_rooms),
    lockedWeeks: normalizeLockedWeeks(rec.locked_weeks),
    settings: normalizeClubSettings(rec.settings),
    createdAt: rec.created_at,
    updatedAt: rec.updated_at,
  };
}

/**
 * Chuyển đổi bản ghi ClubMemberRecord từ Supabase sang domain ClubMember.
 * Xử lý an toàn:
 * - Cột `rank_score` kiểu PostgreSQL `numeric(4,1)` có thể trả về string (vd "6.0").
 * - Khi nhận gói tin từ Supabase Realtime `club_members`, cột sinh `has_pin` bị loại khỏi
 *   publication PG 15-17 (`undefined`), nên dùng `fallbackHasPin` để không mất trạng thái PIN.
 */
export function mapClubMemberRecord(
  rec: Omit<ClubMemberRecord, 'has_pin' | 'rank_score'> & {
    rank_score?: number | string;
    has_pin?: boolean;
  },
  fallbackHasPin = false
): ClubMember {
  const normalizedRank: BadmintonRank = (ORDERED_RANKS as readonly string[]).includes(rec.rank)
    ? rec.rank
    : 'tby';
  const numericScore = Number(rec.rank_score);
  const rankScore = Number.isFinite(numericScore)
    ? numericScore
    : (RANK_BASE_SCORES[normalizedRank] ?? 6.0);

  return {
    id: rec.id,
    clubCode: normalizeClubCode(rec.club_code),
    name: (rec.name ?? '').trim(),
    gender: rec.gender === 'F' ? 'F' : 'M',
    rank: normalizedRank,
    rankScore,
    noSingles: Boolean(rec.no_singles),
    hasPin: typeof rec.has_pin === 'boolean' ? rec.has_pin : fallbackHasPin,
    isActive: rec.is_active !== false,
    authUserId: rec.auth_user_id ?? null,
    createdAt: rec.created_at,
    updatedAt: rec.updated_at,
  };
}

/**
 * Chuyển đổi bản ghi MemberScheduleRecord từ Supabase sang domain MemberScheduleEntry
 */
export function mapMemberScheduleRecord(rec: MemberScheduleRecord): MemberScheduleEntry {
  return {
    id: rec.id,
    clubCode: normalizeClubCode(rec.club_code),
    weekKey: rec.week_key,
    memberId: rec.member_id,
    busySlots: normalizeBusySlots(rec.busy_slots),
    note: typeof rec.note === 'string' ? rec.note : '',
    updatedAt: rec.updated_at,
  };
}

function makeMissingConfigResult<T>(): ClubSyncResult<T> {
  return {
    data: null,
    error: NO_SUPABASE_CONFIG_ERROR,
    errorCode: null,
  };
}

function makeErrorResult<T>(err: unknown): ClubSyncResult<T> {
  const parsed = parseClubRpcError(err);
  return {
    data: null,
    error: parsed.message,
    errorCode: parsed.code,
  };
}

// =============================================================================
// 1. Các hàm ĐỌC bảng công khai (BẮT BUỘC liệt kê cột tường minh qua *_PUBLIC_COLUMNS)
// =============================================================================

/**
 * Đọc metadata CLB từ bảng `public.clubs` (tuyệt đối KHÔNG dùng select('*'))
 */
export async function fetchClub(clubCode: string): Promise<ClubSyncResult<Club>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  const cleanCode = normalizeClubCode(clubCode);
  if (!cleanCode) {
    return {
      data: null,
      error: CLUB_RPC_ERROR_MESSAGES_VI.INVALID_CLUB_CODE,
      errorCode: 'INVALID_CLUB_CODE',
    };
  }

  try {
    const { data, error } = await supabase
      .from('clubs')
      .select(CLUB_PUBLIC_COLUMNS)
      .eq('club_code', cleanCode)
      .maybeSingle();

    if (error) return makeErrorResult(error);
    if (!data) {
      return {
        data: null,
        error: CLUB_RPC_ERROR_MESSAGES_VI.CLUB_NOT_FOUND,
        errorCode: 'CLUB_NOT_FOUND',
      };
    }

    return {
      data: mapClubRecord(data as unknown as ClubRecord),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * Đọc danh sách thành viên CLB từ bảng `public.club_members` (dùng CLUB_MEMBER_PUBLIC_COLUMNS)
 */
export async function fetchClubMembers(
  clubCode: string,
  options: { includeInactive?: boolean } = {}
): Promise<ClubSyncResult<ClubMember[]>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  const cleanCode = normalizeClubCode(clubCode);
  if (!cleanCode) {
    return {
      data: null,
      error: CLUB_RPC_ERROR_MESSAGES_VI.INVALID_CLUB_CODE,
      errorCode: 'INVALID_CLUB_CODE',
    };
  }

  try {
    let query = supabase
      .from('club_members')
      .select(CLUB_MEMBER_PUBLIC_COLUMNS)
      .eq('club_code', cleanCode);

    if (!options.includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) return makeErrorResult(error);

    const rows = (data ?? []) as unknown as ClubMemberRecord[];
    return {
      data: rows.map((r) => mapClubMemberRecord(r)),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * Đọc danh sách lịch bận đã nộp của 1 tuần (`weekKey` = 'FIXED' hoặc 'YYYY-Www')
 */
export async function fetchWeekSchedules(
  clubCode: string,
  weekKey: WeekKey
): Promise<ClubSyncResult<MemberScheduleEntry[]>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  const cleanCode = normalizeClubCode(clubCode);
  const cleanWeek = (typeof weekKey === 'string' ? weekKey.trim() : '') as WeekKey;
  if (!cleanCode) {
    return {
      data: null,
      error: CLUB_RPC_ERROR_MESSAGES_VI.INVALID_CLUB_CODE,
      errorCode: 'INVALID_CLUB_CODE',
    };
  }
  if (!isValidWeekKey(cleanWeek)) {
    return {
      data: null,
      error: CLUB_RPC_ERROR_MESSAGES_VI.INVALID_WEEK_KEY,
      errorCode: 'INVALID_WEEK_KEY',
    };
  }

  try {
    const { data, error } = await supabase
      .from('member_schedules')
      .select(MEMBER_SCHEDULE_PUBLIC_COLUMNS)
      .eq('club_code', cleanCode)
      .eq('week_key', cleanWeek);

    if (error) return makeErrorResult(error);

    const rows = (data ?? []) as unknown as MemberScheduleRecord[];
    return {
      data: rows.map(mapMemberScheduleRecord),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

export interface ClubScheduleBundle {
  club: Club;
  members: ClubMember[];
  weekEntries: MemberScheduleEntry[];
  fixedEntries: MemberScheduleEntry[];
}

/**
 * Tải trọn gói thông tin CLB + danh sách thành viên + lịch tuần hiện tại + lịch FIXED song song
 */
export async function fetchClubScheduleBundle(
  clubCode: string,
  weekKey: WeekKey,
  options: { includeInactiveMembers?: boolean; includeFixed?: boolean } = {}
): Promise<ClubSyncResult<ClubScheduleBundle>> {
  const includeFixed = options.includeFixed !== false && weekKey !== 'FIXED';

  const [clubRes, membersRes, weekRes, fixedRes] = await Promise.all([
    fetchClub(clubCode),
    fetchClubMembers(clubCode, { includeInactive: options.includeInactiveMembers }),
    fetchWeekSchedules(clubCode, weekKey),
    includeFixed
      ? fetchWeekSchedules(clubCode, 'FIXED')
      : Promise.resolve<ClubSyncResult<MemberScheduleEntry[]>>({
          data: [],
          error: null,
          errorCode: null,
        }),
  ]);

  if (clubRes.error || !clubRes.data) {
    return {
      data: null,
      error: clubRes.error,
      errorCode: clubRes.errorCode,
    };
  }
  if (membersRes.error || !membersRes.data) {
    return {
      data: null,
      error: membersRes.error,
      errorCode: membersRes.errorCode,
    };
  }
  if (weekRes.error || !weekRes.data) {
    return {
      data: null,
      error: weekRes.error,
      errorCode: weekRes.errorCode,
    };
  }
  if (fixedRes.error || !fixedRes.data) {
    return {
      data: null,
      error: fixedRes.error,
      errorCode: fixedRes.errorCode,
    };
  }

  return {
    data: {
      club: clubRes.data,
      members: membersRes.data,
      weekEntries: weekRes.data,
      fixedEntries: weekKey === 'FIXED' ? weekRes.data : fixedRes.data,
    },
    error: null,
    errorCode: null,
  };
}

// =============================================================================
// 2. Các hàm GHI & XÁC THỰC qua 12 RPC SECURITY DEFINER (Phase 1)
// =============================================================================

/**
 * RPC 1: `create_club` — Tạo CLB mới với Host PIN băm bằng bcrypt phía server
 */
export async function createClub(params: {
  clubCode: string;
  name: string;
  hostPin: string;
  settings?: Partial<ClubSettings>;
}): Promise<ClubSyncResult<Club>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  try {
    const { data, error } = await supabase.rpc('create_club', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_name: params.name.trim(),
      p_host_pin: params.hostPin.trim(),
      p_settings: params.settings ?? null,
    });

    if (error) return makeErrorResult(error);
    const row = unwrapSingleRow(data as ClubRecord | ClubRecord[] | null);
    if (!row) {
      return { data: null, error: 'Không nhận được dữ liệu CLB sau khi tạo.', errorCode: null };
    }

    return {
      data: mapClubRecord(row),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 2: `verify_club_host_pin` — Xác thực mã PIN của Host phía server
 */
export async function verifyClubHostPin(
  clubCode: string,
  hostPin: string
): Promise<ClubSyncResult<boolean>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  try {
    const { data, error } = await supabase.rpc('verify_club_host_pin', {
      p_club_code: normalizeClubCode(clubCode),
      p_host_pin: hostPin.trim(),
    });

    if (error) return makeErrorResult(error);
    return {
      data: Boolean(data),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 3: `update_club_settings` — Host cập nhật tên CLB, cấu hình hoặc đổi Host PIN
 */
export async function updateClubSettings(params: {
  clubCode: string;
  hostPin: string;
  name?: string | null;
  settings?: Partial<ClubSettings> | null;
  newHostPin?: string | null;
}): Promise<ClubSyncResult<Club>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  try {
    const { data, error } = await supabase.rpc('update_club_settings', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_host_pin: params.hostPin.trim(),
      p_name: params.name !== undefined && params.name !== null ? params.name.trim() : null,
      p_settings: params.settings ?? null,
      p_new_host_pin: params.newHostPin?.trim() ? params.newHostPin.trim() : null,
    });

    if (error) return makeErrorResult(error);
    const row = unwrapSingleRow(data as ClubRecord | ClubRecord[] | null);
    if (!row) {
      return { data: null, error: 'Không nhận được dữ liệu CLB sau khi cập nhật.', errorCode: null };
    }

    return {
      data: mapClubRecord(row),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 4: `set_club_week_lock` — Host khóa hoặc mở khóa báo lịch của 1 tuần
 */
export async function setClubWeekLock(params: {
  clubCode: string;
  hostPin: string;
  weekKey: WeekKey;
  locked: boolean;
}): Promise<ClubSyncResult<string[]>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  try {
    const { data, error } = await supabase.rpc('set_club_week_lock', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_host_pin: params.hostPin.trim(),
      p_week_key: params.weekKey.trim(),
      p_locked: Boolean(params.locked),
    });

    if (error) return makeErrorResult(error);
    return {
      data: normalizeLockedWeeks(data),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 5: `upsert_club_active_room` — Host gắn phòng sân đang hoạt động vào CLB
 */
export async function upsertClubActiveRoom(params: {
  clubCode: string;
  hostPin: string;
  room: Omit<ClubActiveRoom, 'createdAt'> & { createdAt?: string };
}): Promise<ClubSyncResult<ClubActiveRoom[]>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  try {
    const { data, error } = await supabase.rpc('upsert_club_active_room', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_host_pin: params.hostPin.trim(),
      p_room: {
        ...params.room,
        roomCode: params.room.roomCode.trim().toUpperCase(),
        label: params.room.label.trim(),
      },
    });

    if (error) return makeErrorResult(error);
    return {
      data: normalizeActiveRooms(data),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 6: `remove_club_active_room` — Host gỡ phòng sân khỏi CLB
 */
export async function removeClubActiveRoom(params: {
  clubCode: string;
  hostPin: string;
  roomCode: string;
}): Promise<ClubSyncResult<ClubActiveRoom[]>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  try {
    const { data, error } = await supabase.rpc('remove_club_active_room', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_host_pin: params.hostPin.trim(),
      p_room_code: params.roomCode.trim().toUpperCase(),
    });

    if (error) return makeErrorResult(error);
    return {
      data: normalizeActiveRooms(data),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 7: `register_club_member` — Thành viên tự thêm tên hoặc Host thêm thành viên mới
 */
export async function registerClubMember(params: {
  clubCode: string;
  name: string;
  gender: Sex;
  rank?: BadmintonRank;
  rankScore?: number;
  noSingles?: boolean;
  memberPin?: string | null;
  hostPin?: string | null;
}): Promise<ClubSyncResult<ClubMember>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  const resolvedRank: BadmintonRank = params.rank ?? 'tby';
  const resolvedRankScore =
    typeof params.rankScore === 'number' && Number.isFinite(params.rankScore)
      ? params.rankScore
      : (RANK_BASE_SCORES[resolvedRank] ?? 6.0);

  try {
    const { data, error } = await supabase.rpc('register_club_member', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_name: params.name.trim(),
      p_gender: params.gender,
      p_rank: resolvedRank,
      p_rank_score: resolvedRankScore,
      p_no_singles: Boolean(params.noSingles),
      p_member_pin: params.memberPin?.trim() ? params.memberPin.trim() : null,
      p_host_pin: params.hostPin?.trim() ? params.hostPin.trim() : null,
    });

    if (error) return makeErrorResult(error);
    const row = unwrapSingleRow(data as ClubMemberRecord | ClubMemberRecord[] | null);
    if (!row) {
      return { data: null, error: 'Không nhận được dữ liệu thành viên sau khi thêm.', errorCode: null };
    }

    return {
      data: mapClubMemberRecord(row),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 8: `update_club_member_by_host` — Host chỉnh sửa thông tin / trình độ / trạng thái thành viên
 */
export async function updateClubMemberByHost(params: {
  clubCode: string;
  hostPin: string;
  memberId: string;
  name?: string | null;
  gender?: Sex | null;
  rank?: BadmintonRank | null;
  rankScore?: number | null;
  noSingles?: boolean | null;
  isActive?: boolean | null;
}): Promise<ClubSyncResult<ClubMember>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  const autoRankScore =
    params.rankScore !== undefined
      ? params.rankScore
      : params.rank
        ? (RANK_BASE_SCORES[params.rank] ?? null)
        : null;

  try {
    const { data, error } = await supabase.rpc('update_club_member_by_host', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_host_pin: params.hostPin.trim(),
      p_member_id: params.memberId,
      p_name: params.name !== undefined && params.name !== null ? params.name.trim() : null,
      p_gender: params.gender ?? null,
      p_rank: params.rank ?? null,
      p_rank_score: autoRankScore,
      p_no_singles: params.noSingles ?? null,
      p_is_active: params.isActive ?? null,
    });

    if (error) return makeErrorResult(error);
    const row = unwrapSingleRow(data as ClubMemberRecord | ClubMemberRecord[] | null);
    if (!row) {
      return {
        data: null,
        error: 'Không nhận được dữ liệu thành viên sau khi cập nhật.',
        errorCode: null,
      };
    }

    return {
      data: mapClubMemberRecord(row),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 9: `delete_club_member_by_host` — Host ẩn (soft delete) hoặc xóa hẳn (hard delete) thành viên
 */
export async function deleteClubMemberByHost(params: {
  clubCode: string;
  hostPin: string;
  memberId: string;
  hardDelete?: boolean;
}): Promise<ClubSyncResult<boolean>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  try {
    const { data, error } = await supabase.rpc('delete_club_member_by_host', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_host_pin: params.hostPin.trim(),
      p_member_id: params.memberId,
      p_hard_delete: Boolean(params.hardDelete),
    });

    if (error) return makeErrorResult(error);
    return {
      data: Boolean(data),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 10: `set_member_pin` — Thành viên tự đặt/đổi PIN cá nhân hoặc Host reset PIN hộ
 */
export async function setMemberPin(params: {
  clubCode: string;
  memberId: string;
  newPin?: string | null;
  currentPin?: string | null;
  hostPin?: string | null;
}): Promise<ClubSyncResult<boolean>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  try {
    const { data, error } = await supabase.rpc('set_member_pin', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_member_id: params.memberId,
      p_new_pin: params.newPin?.trim() ? params.newPin.trim() : null,
      p_current_pin: params.currentPin?.trim() ? params.currentPin.trim() : null,
      p_host_pin: params.hostPin?.trim() ? params.hostPin.trim() : null,
    });

    if (error) return makeErrorResult(error);
    return {
      data: Boolean(data),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 11: `verify_member_pin` — Xác thực mã PIN cá nhân của thành viên phía server
 */
export async function verifyMemberPin(params: {
  clubCode: string;
  memberId: string;
  pin: string;
}): Promise<ClubSyncResult<boolean>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  try {
    const { data, error } = await supabase.rpc('verify_member_pin', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_member_id: params.memberId,
      p_pin: params.pin.trim(),
    });

    if (error) return makeErrorResult(error);
    return {
      data: Boolean(data),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

/**
 * RPC 12: `upsert_member_schedule` — Lưu lịch bận cá nhân theo tuần ('FIXED' hoặc 'YYYY-Www')
 */
export async function upsertMemberSchedule(params: {
  clubCode: string;
  weekKey: WeekKey;
  memberId: string;
  busySlots: readonly string[];
  note?: string;
  memberPin?: string | null;
  hostPin?: string | null;
}): Promise<ClubSyncResult<MemberScheduleEntry>> {
  const supabase = getSupabaseClient();
  if (!supabase) return makeMissingConfigResult();

  const cleanSlots = normalizeBusySlots(params.busySlots);

  try {
    const { data, error } = await supabase.rpc('upsert_member_schedule', {
      p_club_code: normalizeClubCode(params.clubCode),
      p_week_key: params.weekKey.trim(),
      p_member_id: params.memberId,
      p_busy_slots: cleanSlots,
      p_note: (params.note ?? '').trim().slice(0, 300),
      p_member_pin: params.memberPin?.trim() ? params.memberPin.trim() : null,
      p_host_pin: params.hostPin?.trim() ? params.hostPin.trim() : null,
    });

    if (error) return makeErrorResult(error);
    const row = unwrapSingleRow(data as MemberScheduleRecord | MemberScheduleRecord[] | null);
    if (!row) {
      return { data: null, error: 'Không nhận được bản ghi lịch sau khi lưu.', errorCode: null };
    }

    return {
      data: mapMemberScheduleRecord(row),
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return makeErrorResult(err);
  }
}

// =============================================================================
// 3. Đăng ký lắng nghe Supabase Realtime cho clubs, club_members, member_schedules
// =============================================================================

export type ClubRealtimeEvent =
  | { eventType: 'INSERT' | 'UPDATE'; club: Club }
  | { eventType: 'DELETE'; clubCode: string };

export type ClubMemberRealtimeEvent =
  | {
      eventType: 'INSERT' | 'UPDATE';
      rawRecord: Omit<ClubMemberRecord, 'has_pin'> & { has_pin?: boolean };
      /** Cờ báo hiệu payload Realtime có sẵn has_pin hay không (thường false do PG publication loại cột sinh) */
      hasPinIncluded: boolean;
    }
  | { eventType: 'DELETE'; memberId: string };

export type MemberScheduleRealtimeEvent =
  | { eventType: 'INSERT' | 'UPDATE'; entry: MemberScheduleEntry }
  | { eventType: 'DELETE'; scheduleId: string; memberId?: string; weekKey?: WeekKey };

export interface SubscribeClubScheduleCallbacks {
  onClubChange?: (event: ClubRealtimeEvent) => void;
  onMemberChange?: (event: ClubMemberRealtimeEvent) => void;
  onScheduleChange?: (event: MemberScheduleRealtimeEvent) => void;
  onChannelStatus?: (status: string) => void;
}

/**
 * Subscribe Supabase Realtime cho CLB (`clubs`, `club_members`, `member_schedules`).
 * Trả về hàm `unsubscribe` để dọn kênh an toàn.
 */
export function subscribeToClubSchedule(
  clubCode: string,
  callbacks: SubscribeClubScheduleCallbacks
): () => void {
  const supabase = getSupabaseClient();
  const cleanCode = normalizeClubCode(clubCode);
  if (!supabase || !cleanCode) {
    return () => {};
  }

  const channelSuffix = Math.random().toString(36).slice(2, 8);
  const channelName = `club_schedule_${cleanCode}_${channelSuffix}`;

  const channel: RealtimeChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'clubs',
        filter: `club_code=eq.${cleanCode}`,
      },
      (payload) => {
        if (!callbacks.onClubChange) return;
        if (payload.eventType === 'DELETE') {
          const oldRec = payload.old as Partial<ClubRecord> | undefined;
          callbacks.onClubChange({
            eventType: 'DELETE',
            clubCode: normalizeClubCode(oldRec?.club_code) || cleanCode,
          });
          return;
        }
        if (payload.new && typeof payload.new === 'object') {
          callbacks.onClubChange({
            eventType: payload.eventType === 'INSERT' ? 'INSERT' : 'UPDATE',
            club: mapClubRecord(payload.new as ClubRecord),
          });
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'club_members',
        filter: `club_code=eq.${cleanCode}`,
      },
      (payload) => {
        if (!callbacks.onMemberChange) return;
        if (payload.eventType === 'DELETE') {
          const oldRec = payload.old as Partial<ClubMemberRecord> | undefined;
          if (oldRec?.id) {
            callbacks.onMemberChange({
              eventType: 'DELETE',
              memberId: oldRec.id,
            });
          }
          return;
        }
        if (payload.new && typeof payload.new === 'object') {
          const rawRec = payload.new as Omit<ClubMemberRecord, 'has_pin'> & {
            has_pin?: boolean;
          };
          if (rawRec.id) {
            callbacks.onMemberChange({
              eventType: payload.eventType === 'INSERT' ? 'INSERT' : 'UPDATE',
              rawRecord: rawRec,
              hasPinIncluded: typeof rawRec.has_pin === 'boolean',
            });
          }
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'member_schedules',
        filter: `club_code=eq.${cleanCode}`,
      },
      (payload) => {
        if (!callbacks.onScheduleChange) return;
        if (payload.eventType === 'DELETE') {
          const oldRec = payload.old as Partial<MemberScheduleRecord> | undefined;
          if (oldRec?.id) {
            callbacks.onScheduleChange({
              eventType: 'DELETE',
              scheduleId: oldRec.id,
              memberId: oldRec.member_id,
              weekKey: oldRec.week_key,
            });
          }
          return;
        }
        if (payload.new && typeof payload.new === 'object') {
          const rawRec = payload.new as MemberScheduleRecord;
          if (rawRec.id && rawRec.member_id && rawRec.week_key) {
            callbacks.onScheduleChange({
              eventType: payload.eventType === 'INSERT' ? 'INSERT' : 'UPDATE',
              entry: mapMemberScheduleRecord(rawRec),
            });
          }
        }
      }
    )
    .subscribe((status) => {
      callbacks.onChannelStatus?.(String(status));
    });

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // Bỏ qua lỗi cleanup channel
    }
  };
}
