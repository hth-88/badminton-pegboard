import type { BadmintonRank, Sex } from '../types/badminton';
import type {
  ClubMember as CloudClubMember,
  HostMemberPrivateMeta,
} from '../types/schedule';
import { RANK_BASE_SCORES } from './skillConfig';
import {
  fetchClubMembers,
  normalizeClubCode,
  registerClubMember,
  type ClubSyncResult,
} from '../services/clubScheduleSync';

export const CLUB_MEMBER_PRESET_TAGS = [
  'Trình cứng',
  'Vãng lai',
  'Đau gối / nhẹ tay',
  'Đánh nhiệt',
  'Hay hủy sát giờ',
] as const;

export interface ClubMember {
  id: string;
  name: string;
  sex: Sex;
  rank: BadmintonRank;
  noSingles?: boolean;
  notes?: string;
  tags?: string[];
  joinedAt?: number;
  /** Metadata mở rộng khi đồng bộ với Cloud theo club_code */
  clubCode?: string;
  rankScore?: number;
  hasPin?: boolean;
  isActive?: boolean;
  updatedAt?: string;
}

export const STORAGE_KEY_CLUB_ROSTER = 'badminton_club_roster';
export const STORAGE_KEY_CLUB_ROSTER_CUSTOMIZED = 'badminton_club_roster_customized';
export const STORAGE_KEY_ACTIVE_CLUB_CODE = 'badminton_active_club_code';
export const STORAGE_PREFIX_CLOUD_ROSTER = 'badminton_club_cloud_roster_';
export const STORAGE_PREFIX_PRIVATE_META = 'badminton_club_private_meta_';
export const STORAGE_PREFIX_MIGRATION_STATE = 'badminton_club_migration_';

/**
 * 9 thành viên mẫu ban đầu nếu máy người dùng chưa từng tạo Sổ CLB
 */
export const DEFAULT_9_CLUB_MEMBERS: ClubMember[] = [
  { id: 'roster_1', name: 'Đức Anh', sex: 'M', rank: 'y-', noSingles: false, joinedAt: 1001 },
  { id: 'roster_2', name: 'Huy Hoàng', sex: 'M', rank: 'y+', noSingles: false, joinedAt: 1002 },
  { id: 'roster_3', name: 'Minh Trí', sex: 'M', rank: 'tby', noSingles: false, joinedAt: 1003 },
  { id: 'roster_4', name: 'Quốc Tuấn', sex: 'M', rank: 'tby+', noSingles: false, joinedAt: 1004 },
  { id: 'roster_5', name: 'Tiến Đạt', sex: 'M', rank: 'tb', noSingles: false, joinedAt: 1005 },
  { id: 'roster_6', name: 'Thùy Linh', sex: 'F', rank: 'newbie', noSingles: false, joinedAt: 1006 },
  { id: 'roster_7', name: 'Mai Anh', sex: 'F', rank: 'y-', noSingles: false, joinedAt: 1007 },
  { id: 'roster_8', name: 'Phương Thảo', sex: 'F', rank: 'tby-', noSingles: false, joinedAt: 1008 },
  { id: 'roster_9', name: 'Hồng Nhung', sex: 'F', rank: 'tby', noSingles: false, joinedAt: 1009 },
];

// =============================================================================
// 1. Quản lý ngữ cảnh CLB đang kích hoạt & khóa lưu trữ theo club_code
//    (Hoàn toàn độc lập với STORAGE_KEY_CLOUD_ROOM và STORAGE_KEY_V2)
// =============================================================================

export function getClubCloudRosterStorageKey(clubCode: string): string {
  return `${STORAGE_PREFIX_CLOUD_ROSTER}${normalizeClubCode(clubCode)}`;
}

export function getClubPrivateMetaStorageKey(clubCode: string): string {
  return `${STORAGE_PREFIX_PRIVATE_META}${normalizeClubCode(clubCode)}`;
}

export function getClubMigrationStateStorageKey(clubCode: string): string {
  return `${STORAGE_PREFIX_MIGRATION_STATE}${normalizeClubCode(clubCode)}`;
}

export function getActiveClubCode(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_CLUB_CODE);
    const clean = normalizeClubCode(raw);
    return clean || null;
  } catch {
    return null;
  }
}

export function setActiveClubCode(clubCode: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const clean = normalizeClubCode(clubCode);
    if (!clean) {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_CLUB_CODE);
    } else {
      localStorage.setItem(STORAGE_KEY_ACTIVE_CLUB_CODE, clean);
    }
  } catch {
    // Bỏ qua lỗi quota
  }
}

function resolveTargetClubCode(explicitClubCode?: string): string | null {
  if (explicitClubCode !== undefined) {
    const clean = normalizeClubCode(explicitClubCode);
    return clean || null;
  }
  return getActiveClubCode();
}

// =============================================================================
// 2. Ghi chú & thẻ kín của Host (localStorage-only, map theo member.id UUID)
// =============================================================================

function sanitizeTags(tags: readonly string[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return Array.from(
    new Set(
      tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );
}

/**
 * Đọc bản đồ ghi chú & thẻ kín của Host theo `club_code` (key = `member.id` UUID)
 */
export function getHostPrivateMetaMap(clubCode: string): Record<string, HostMemberPrivateMeta> {
  const cleanCode = normalizeClubCode(clubCode);
  if (!cleanCode || typeof localStorage === 'undefined') return {};

  try {
    const raw = localStorage.getItem(getClubPrivateMetaStorageKey(cleanCode));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: Record<string, HostMemberPrivateMeta> = {};
    for (const [memberId, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!memberId || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const rec = entry as Record<string, unknown>;
      const notes = typeof rec.notes === 'string' ? rec.notes.trim() : '';
      const tags = sanitizeTags(rec.tags as string[] | undefined);
      if (!notes && tags.length === 0) continue;
      result[memberId] = {
        memberId,
        notes,
        tags,
        updatedAt:
          typeof rec.updatedAt === 'string' && rec.updatedAt
            ? rec.updatedAt
            : new Date(0).toISOString(),
      };
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Lưu bản đồ ghi chú & thẻ kín của Host theo `club_code`
 */
export function saveHostPrivateMetaMap(
  clubCode: string,
  metaMap: Record<string, HostMemberPrivateMeta>
): void {
  const cleanCode = normalizeClubCode(clubCode);
  if (!cleanCode || typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(getClubPrivateMetaStorageKey(cleanCode), JSON.stringify(metaMap));
  } catch (err) {
    console.error('Không thể lưu ghi chú kín của Host:', err);
  }
}

export function getHostMemberPrivateMeta(
  clubCode: string,
  memberId: string
): HostMemberPrivateMeta | null {
  if (!memberId) return null;
  const map = getHostPrivateMetaMap(clubCode);
  return map[memberId] ?? null;
}

/**
 * Thêm/cập nhật ghi chú & thẻ kín của Host theo `memberId` (UUID).
 * Đảm bảo khi thành viên đổi tên trên Cloud, `member.id` giữ nguyên nên không bao giờ mất note/tags.
 */
export function upsertHostMemberPrivateMeta(
  clubCode: string,
  memberId: string,
  updates: { notes?: string; tags?: string[] },
  nowIso: string = new Date().toISOString()
): HostMemberPrivateMeta | null {
  const cleanCode = normalizeClubCode(clubCode);
  if (!cleanCode || !memberId) return null;

  const map = getHostPrivateMetaMap(cleanCode);
  const prev = map[memberId];

  const nextNotes =
    updates.notes !== undefined ? updates.notes.trim() : (prev?.notes ?? '');
  const nextTags =
    updates.tags !== undefined ? sanitizeTags(updates.tags) : (prev?.tags ?? []);

  if (!nextNotes && nextTags.length === 0) {
    if (prev) {
      delete map[memberId];
      saveHostPrivateMetaMap(cleanCode, map);
    }
    return null;
  }

  const nextEntry: HostMemberPrivateMeta = {
    memberId,
    notes: nextNotes,
    tags: nextTags,
    updatedAt: nowIso,
  };
  map[memberId] = nextEntry;
  saveHostPrivateMetaMap(cleanCode, map);
  return nextEntry;
}

export function removeHostMemberPrivateMeta(clubCode: string, memberId: string): void {
  const cleanCode = normalizeClubCode(clubCode);
  if (!cleanCode || !memberId) return;
  const map = getHostPrivateMetaMap(cleanCode);
  if (map[memberId]) {
    delete map[memberId];
    saveHostPrivateMetaMap(cleanCode, map);
  }
}

// =============================================================================
// 3. Cache danh sách Cloud theo club_code & Hàm Merge thuần túy theo UUID
// =============================================================================

export function hasCachedCloudClubRoster(clubCode: string): boolean {
  const cleanCode = normalizeClubCode(clubCode);
  if (!cleanCode || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(getClubCloudRosterStorageKey(cleanCode)) !== null;
  } catch {
    return false;
  }
}

export function getCachedCloudClubMembers(clubCode: string): CloudClubMember[] {
  const cleanCode = normalizeClubCode(clubCode);
  if (!cleanCode || typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(getClubCloudRosterStorageKey(cleanCode));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CloudClubMember[]) : [];
  } catch {
    return [];
  }
}

export function saveCachedCloudClubMembers(
  clubCode: string,
  members: readonly CloudClubMember[]
): void {
  const cleanCode = normalizeClubCode(clubCode);
  if (!cleanCode || typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(getClubCloudRosterStorageKey(cleanCode), JSON.stringify(members));
  } catch (err) {
    console.error('Không thể lưu cache thành viên CLB từ Cloud:', err);
  }
}

/**
 * Hàm thuần túy (pure): Trộn danh sách thành viên Cloud với ghi chú/thẻ kín cục bộ của Host theo `member.id` (UUID).
 */
export function mergeCloudMembersWithPrivateMeta(
  cloudMembers: readonly CloudClubMember[],
  privateMetaMap: Record<string, HostMemberPrivateMeta>,
  options: { includeInactive?: boolean } = {}
): ClubMember[] {
  const filtered = options.includeInactive
    ? cloudMembers
    : cloudMembers.filter((m) => m.isActive !== false);

  return filtered.map((m) => {
    const meta = privateMetaMap[m.id];
    const parsedTs = Date.parse(m.createdAt);
    return {
      id: m.id,
      name: m.name,
      sex: m.gender,
      rank: m.rank,
      noSingles: Boolean(m.noSingles),
      ...(meta?.notes ? { notes: meta.notes } : {}),
      ...(meta?.tags && meta.tags.length > 0 ? { tags: [...meta.tags] } : {}),
      joinedAt: Number.isFinite(parsedTs) ? parsedTs : undefined,
      clubCode: m.clubCode,
      rankScore: m.rankScore,
      hasPin: m.hasPin,
      isActive: m.isActive,
      updatedAt: m.updatedAt,
    };
  });
}

/**
 * Lưu snapshot thành viên từ Cloud vào cache local của `clubCode` và trả về danh sách đã ghép notes/tags.
 */
export function applyCloudRosterSnapshot(
  clubCode: string,
  cloudMembers: readonly CloudClubMember[],
  options: { includeInactive?: boolean } = {}
): ClubMember[] {
  const cleanCode = normalizeClubCode(clubCode);
  if (!cleanCode) return [];
  saveCachedCloudClubMembers(cleanCode, cloudMembers);
  const metaMap = getHostPrivateMetaMap(cleanCode);
  return mergeCloudMembersWithPrivateMeta(cloudMembers, metaMap, options);
}

// =============================================================================
// 4. Kiểm tra danh sách mẫu mặc định & Migrate an toàn Sổ CLB local lên Cloud
// =============================================================================

/**
 * Kiểm tra xem một danh sách có trùng khớp nguyên bản với 9 thành viên mẫu mặc định
 * (`DEFAULT_9_CLUB_MEMBERS`) chưa từng được tùy biến hay không.
 */
export function isDefaultSampleRoster(roster: readonly ClubMember[]): boolean {
  if (!Array.isArray(roster) || roster.length !== DEFAULT_9_CLUB_MEMBERS.length) {
    return false;
  }

  const typedRoster = roster as readonly ClubMember[];
  const defaultById = new Map<string, ClubMember>();
  for (const sample of DEFAULT_9_CLUB_MEMBERS) {
    defaultById.set(sample.id, sample);
  }

  const seenIds = new Set<string>();
  for (const item of typedRoster) {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.id !== 'string' || typeof item.name !== 'string') return false;
    if (seenIds.has(item.id)) return false;
    seenIds.add(item.id);

    const sample = defaultById.get(item.id);
    if (!sample) return false;
    if (item.name.trim() !== sample.name.trim()) return false;
    if (item.sex !== sample.sex) return false;
    if (item.rank !== sample.rank) return false;
    if (Boolean(item.noSingles) !== Boolean(sample.noSingles)) return false;
    if (typeof item.notes === 'string' && item.notes.trim().length > 0) return false;
    if (item.tags !== undefined) {
      if (!Array.isArray(item.tags)) return false;
      if (item.tags.some((t: unknown) => typeof t === 'string' && t.trim().length > 0)) {
        return false;
      }
    }
  }

  return seenIds.size === DEFAULT_9_CLUB_MEMBERS.length;
}

/**
 * Đọc danh sách legacy trong `STORAGE_KEY_CLUB_ROSTER` mà KHÔNG tự ghi 9 thành viên mẫu xuống máy
 */
export function peekLegacyLocalRoster(): ClubMember[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLUB_ROSTER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ClubMember[]) : null;
  } catch {
    return null;
  }
}

/**
 * Kiểm tra máy hiện tại có danh sách Sổ CLB đã được người dùng tùy biến thật sự hay chưa
 * (trả `false` nếu trống hoặc vẫn là đúng 9 thành viên mẫu `DEFAULT_9_CLUB_MEMBERS`).
 */
export function hasCustomLegacyLocalRoster(): boolean {
  const legacy = peekLegacyLocalRoster();
  if (!legacy || legacy.length === 0) return false;
  return !isDefaultSampleRoster(legacy);
}

export interface ClubRosterCloudAdapter {
  fetchMembers: (
    clubCode: string,
    options?: { includeInactive?: boolean }
  ) => Promise<ClubSyncResult<CloudClubMember[]>>;
  registerMember: (params: {
    clubCode: string;
    name: string;
    gender: Sex;
    rank?: BadmintonRank;
    rankScore?: number;
    noSingles?: boolean;
    hostPin?: string | null;
  }) => Promise<ClubSyncResult<CloudClubMember>>;
}

const defaultCloudAdapter: ClubRosterCloudAdapter = {
  fetchMembers: fetchClubMembers,
  registerMember: registerClubMember,
};

export interface MigrateLocalRosterToCloudParams {
  clubCode: string;
  hostPin?: string | null;
  /** Bỏ qua cờ đã migrate trước đó để chạy đồng bộ bù */
  force?: boolean;
  /** Chỉ bật true nếu người dùng chủ động xác nhận muốn đẩy cả bộ 9 người mẫu */
  forceIncludeDefaultSample?: boolean;
  nowIso?: string;
  adapter?: ClubRosterCloudAdapter;
}

export interface MigrateLocalRosterResult {
  status:
    | 'MIGRATED'
    | 'SKIPPED_EMPTY'
    | 'SKIPPED_DEFAULT_SAMPLE'
    | 'ALREADY_MIGRATED'
    | 'PARTIAL_ERROR';
  clubCode: string;
  createdMembers: CloudClubMember[];
  matchedExistingMembers: CloudClubMember[];
  /** Ánh xạ `legacyLocalId -> cloudMemberUuid` */
  memberIdMap: Record<string, string>;
  migratedPrivateMetaCount: number;
  errors: Array<{ memberName: string; error: string }>;
}

interface StoredClubMigrationRecord {
  migratedAt: string;
  memberIdMap: Record<string, string>;
}

function getStoredMigrationRecord(clubCode: string): StoredClubMigrationRecord | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getClubMigrationStateStorageKey(clubCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return {
      migratedAt: typeof parsed.migratedAt === 'string' ? parsed.migratedAt : '',
      memberIdMap:
        parsed.memberIdMap && typeof parsed.memberIdMap === 'object'
          ? (parsed.memberIdMap as Record<string, string>)
          : {},
    };
  } catch {
    return null;
  }
}

function mergePrivateMetaForUuid(
  clubCode: string,
  cloudUuid: string,
  localMember: ClubMember,
  nowIso: string
): boolean {
  const localNotes = localMember.notes?.trim() ?? '';
  const localTags = sanitizeTags(localMember.tags);
  if (!localNotes && localTags.length === 0) {
    return false;
  }

  const existing = getHostMemberPrivateMeta(clubCode, cloudUuid);
  const combinedNotes = existing?.notes?.trim()
    ? existing.notes.trim()
    : localNotes;
  const combinedTags = sanitizeTags([...(existing?.tags ?? []), ...localTags]);

  upsertHostMemberPrivateMeta(
    clubCode,
    cloudUuid,
    { notes: combinedNotes, tags: combinedTags },
    nowIso
  );
  return true;
}

/**
 * Migrate an toàn danh sách Sổ CLB cũ ở `localStorage` lên Cloud theo `club_code`:
 * - KHÔNG tự động đẩy `DEFAULT_9_CLUB_MEMBERS` khi máy chưa tùy biến.
 * - Khớp thông minh theo tên với các thành viên đã có sẵn trên Cloud (tránh lỗi trùng tên).
 * - Giữ nguyên 100% `notes` & `tags` kín ở `localStorage`, chuyển sang ánh xạ theo `cloudMember.id` (UUID),
 *   TUYỆT ĐỐI không gửi `notes/tags` lên bảng công khai `public.club_members`.
 */
export async function migrateLocalRosterToCloud(
  params: MigrateLocalRosterToCloudParams
): Promise<MigrateLocalRosterResult> {
  const cleanCode = normalizeClubCode(params.clubCode);
  const nowIso = params.nowIso ?? new Date().toISOString();
  const adapter = params.adapter ?? defaultCloudAdapter;

  if (!params.force) {
    const prevMigration = getStoredMigrationRecord(cleanCode);
    if (prevMigration?.migratedAt) {
      return {
        status: 'ALREADY_MIGRATED',
        clubCode: cleanCode,
        createdMembers: [],
        matchedExistingMembers: [],
        memberIdMap: prevMigration.memberIdMap,
        migratedPrivateMetaCount: 0,
        errors: [],
      };
    }
  }

  const localRoster = peekLegacyLocalRoster();
  if (!localRoster || localRoster.length === 0) {
    return {
      status: 'SKIPPED_EMPTY',
      clubCode: cleanCode,
      createdMembers: [],
      matchedExistingMembers: [],
      memberIdMap: {},
      migratedPrivateMetaCount: 0,
      errors: [],
    };
  }

  if (isDefaultSampleRoster(localRoster) && !params.forceIncludeDefaultSample) {
    return {
      status: 'SKIPPED_DEFAULT_SAMPLE',
      clubCode: cleanCode,
      createdMembers: [],
      matchedExistingMembers: [],
      memberIdMap: {},
      migratedPrivateMetaCount: 0,
      errors: [],
    };
  }

  const existingRes = await adapter.fetchMembers(cleanCode, { includeInactive: true });
  if (existingRes.error || !existingRes.data) {
    return {
      status: 'PARTIAL_ERROR',
      clubCode: cleanCode,
      createdMembers: [],
      matchedExistingMembers: [],
      memberIdMap: {},
      migratedPrivateMetaCount: 0,
      errors: [{ memberName: '*', error: existingRes.error ?? 'Không tải được danh sách CLB trên Cloud.' }],
    };
  }

  const allCloudMembers: CloudClubMember[] = [...existingRes.data];
  const initialCloudIds = new Set<string>(allCloudMembers.map((m) => m.id));
  const matchedExistingIds = new Set<string>();
  const activeCloudByName = new Map<string, CloudClubMember>();
  for (const m of allCloudMembers) {
    if (m.isActive !== false) {
      activeCloudByName.set(m.name.trim().toLowerCase(), m);
    }
  }

  const createdMembers: CloudClubMember[] = [];
  const matchedExistingMembers: CloudClubMember[] = [];
  const memberIdMap: Record<string, string> = {};
  const errors: Array<{ memberName: string; error: string }> = [];
  let migratedPrivateMetaCount = 0;

  for (const localMember of localRoster) {
    if (!localMember || typeof localMember !== 'object' || typeof localMember.name !== 'string') {
      continue;
    }
    const cleanName = localMember.name.trim();
    if (!cleanName) continue;
    const normName = cleanName.toLowerCase();

    const existingCloud = activeCloudByName.get(normName);
    if (existingCloud) {
      if (typeof localMember.id === 'string' && localMember.id) {
        memberIdMap[localMember.id] = existingCloud.id;
      }
      if (initialCloudIds.has(existingCloud.id) && !matchedExistingIds.has(existingCloud.id)) {
        matchedExistingIds.add(existingCloud.id);
        matchedExistingMembers.push(existingCloud);
      }
      if (mergePrivateMetaForUuid(cleanCode, existingCloud.id, localMember, nowIso)) {
        migratedPrivateMetaCount++;
      }
      continue;
    }

    const createRes = await adapter.registerMember({
      clubCode: cleanCode,
      name: cleanName,
      gender: localMember.sex,
      rank: localMember.rank,
      rankScore: RANK_BASE_SCORES[localMember.rank] ?? 6.0,
      noSingles: Boolean(localMember.noSingles),
      hostPin: params.hostPin ?? null,
    });

    if (createRes.data && !createRes.error) {
      const created = createRes.data;
      allCloudMembers.push(created);
      activeCloudByName.set(normName, created);
      createdMembers.push(created);
      if (typeof localMember.id === 'string' && localMember.id) {
        memberIdMap[localMember.id] = created.id;
      }
      if (mergePrivateMetaForUuid(cleanCode, created.id, localMember, nowIso)) {
        migratedPrivateMetaCount++;
      }
      continue;
    }

    // Xử lý race condition nếu một máy khác vừa thêm trùng tên ngay lúc đang migrate
    if (createRes.errorCode === 'MEMBER_NAME_ALREADY_EXISTS') {
      const refreshRes = await adapter.fetchMembers(cleanCode, { includeInactive: true });
      const racedMember = refreshRes.data?.find(
        (m) => m.isActive !== false && m.name.trim().toLowerCase() === normName
      );
      if (racedMember) {
        activeCloudByName.set(normName, racedMember);
        if (!allCloudMembers.some((m) => m.id === racedMember.id)) {
          allCloudMembers.push(racedMember);
        }
        initialCloudIds.add(racedMember.id);
        if (!matchedExistingIds.has(racedMember.id)) {
          matchedExistingIds.add(racedMember.id);
          matchedExistingMembers.push(racedMember);
        }
        if (typeof localMember.id === 'string' && localMember.id) {
          memberIdMap[localMember.id] = racedMember.id;
        }
        if (mergePrivateMetaForUuid(cleanCode, racedMember.id, localMember, nowIso)) {
          migratedPrivateMetaCount++;
        }
        continue;
      }
    }

    errors.push({
      memberName: cleanName,
      error: createRes.error ?? 'Không thể đồng bộ thành viên lên Cloud.',
    });
  }

  saveCachedCloudClubMembers(cleanCode, allCloudMembers);

  if (errors.length === 0 && typeof localStorage !== 'undefined') {
    try {
      const migrationRecord: StoredClubMigrationRecord = {
        migratedAt: nowIso,
        memberIdMap,
      };
      localStorage.setItem(
        getClubMigrationStateStorageKey(cleanCode),
        JSON.stringify(migrationRecord)
      );
    } catch {
      // Bỏ qua lỗi quota
    }
  }

  return {
    status: errors.length === 0 ? 'MIGRATED' : 'PARTIAL_ERROR',
    clubCode: cleanCode,
    createdMembers,
    matchedExistingMembers,
    memberIdMap,
    migratedPrivateMetaCount,
    errors,
  };
}

// =============================================================================
// 5. Các hàm đồng bộ tương thích ngược 100% với QueueTab, RankAdvisorPanel & Test cũ
// =============================================================================

function markLegacyRosterCustomized(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_CLUB_ROSTER_CUSTOMIZED, '1');
  } catch {
    // Bỏ qua
  }
}

function saveLegacyClubRosterInternal(roster: ClubMember[], markCustom: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_CLUB_ROSTER, JSON.stringify(roster));
    if (markCustom) {
      markLegacyRosterCustomized();
    }
  } catch (err) {
    console.error('Không thể lưu Sổ thành viên CLB:', err);
  }
}

/**
 * Đọc toàn bộ danh sách thành viên trong Sổ CLB:
 * - Nếu truyền `clubCode` (hoặc đang kích hoạt `activeClubCode` đã có cache Cloud),
 *   trả về danh sách thành viên của CLB đó đã ghép `notes/tags` kín theo UUID.
 * - Ngược lại (chế độ máy đơn / legacy), giữ nguyên hành vi đọc `STORAGE_KEY_CLUB_ROSTER`
 *   và khởi tạo 9 thành viên mẫu lần đầu.
 */
export function getClubRoster(clubCode?: string): ClubMember[] {
  const targetClub = resolveTargetClubCode(clubCode);
  if (targetClub) {
    if (clubCode !== undefined || hasCachedCloudClubRoster(targetClub)) {
      const cloudMembers = getCachedCloudClubMembers(targetClub);
      const privateMetaMap = getHostPrivateMetaMap(targetClub);
      return mergeCloudMembersWithPrivateMeta(cloudMembers, privateMetaMap);
    }
  }

  if (typeof localStorage === 'undefined') {
    return DEFAULT_9_CLUB_MEMBERS.map((m) => ({ ...m }));
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLUB_ROSTER);
    if (!raw) {
      // Khởi tạo 9 thành viên mặc định lần đầu (KHÔNG đánh dấu customized để tránh đẩy nhầm lên Cloud)
      saveLegacyClubRosterInternal(DEFAULT_9_CLUB_MEMBERS, false);
      return DEFAULT_9_CLUB_MEMBERS.map((m) => ({ ...m }));
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Bỏ qua lỗi parse
  }
  return DEFAULT_9_CLUB_MEMBERS.map((m) => ({ ...m }));
}

/**
 * Lưu toàn bộ danh sách thành viên vào Sổ CLB (legacy local)
 */
export function saveClubRoster(roster: ClubMember[]): void {
  const isCustom = !isDefaultSampleRoster(roster);
  saveLegacyClubRosterInternal(roster, isCustom);
}

/**
 * Thêm hoặc cập nhật thành viên vào Sổ CLB (Local-first)
 */
export function upsertClubMember(
  member: Omit<ClubMember, 'id'> & { id?: string },
  clubCode?: string
): ClubMember {
  const targetClub = resolveTargetClubCode(clubCode);
  if (targetClub && (clubCode !== undefined || hasCachedCloudClubRoster(targetClub))) {
    const cloudMembers = getCachedCloudClubMembers(targetClub);
    const normName = member.name.trim().toLowerCase();
    const existingIdx = cloudMembers.findIndex(
      (m) =>
        (member.id && m.id === member.id) ||
        (m.isActive !== false && m.name.trim().toLowerCase() === normName)
    );
    const existing = existingIdx !== -1 ? cloudMembers[existingIdx] : undefined;
    const nowIso = new Date().toISOString();
    const resolvedId =
      existing?.id ||
      member.id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    const updatedCloud: CloudClubMember = {
      id: resolvedId,
      clubCode: targetClub,
      name: member.name.trim(),
      gender: member.sex,
      rank: member.rank,
      rankScore: member.rankScore ?? RANK_BASE_SCORES[member.rank] ?? 6.0,
      noSingles: Boolean(member.noSingles),
      hasPin: existing?.hasPin ?? Boolean(member.hasPin),
      isActive: true,
      authUserId: existing?.authUserId ?? null,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    if (existingIdx !== -1) {
      cloudMembers[existingIdx] = updatedCloud;
    } else {
      cloudMembers.push(updatedCloud);
    }
    saveCachedCloudClubMembers(targetClub, cloudMembers);

    if (member.notes !== undefined || member.tags !== undefined) {
      upsertHostMemberPrivateMeta(
        targetClub,
        resolvedId,
        { notes: member.notes, tags: member.tags },
        nowIso
      );
    }

    const meta = getHostMemberPrivateMeta(targetClub, resolvedId);
    return mergeCloudMembersWithPrivateMeta(
      [updatedCloud],
      meta ? { [resolvedId]: meta } : {}
    )[0];
  }

  const current = getClubRoster('');
  const id = member.id || `roster_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const existingIdx = current.findIndex(
    (m) => m.id === id || m.name.trim().toLowerCase() === member.name.trim().toLowerCase()
  );
  const existing = existingIdx !== -1 ? current[existingIdx] : undefined;

  const newEntry: ClubMember = {
    id: existing ? existing.id : id,
    name: member.name.trim(),
    sex: member.sex,
    rank: member.rank,
    noSingles: Boolean(member.noSingles),
    notes: member.notes !== undefined ? member.notes : existing?.notes,
    tags: member.tags !== undefined ? member.tags : existing?.tags,
    joinedAt: member.joinedAt || existing?.joinedAt || Date.now(),
  };

  if (existingIdx !== -1) {
    current[existingIdx] = newEntry;
  } else {
    current.push(newEntry);
  }

  saveLegacyClubRosterInternal(current, true);
  return newEntry;
}

/**
 * Cập nhật ghi chú & thẻ kín (và trình độ nếu có) của thành viên trong Sổ CLB.
 * Khi đang gắn `club_code`, `notes` & `tags` luôn được lưu tách biệt theo `member.id` (UUID) ở `localStorage`.
 */
export function updateClubMemberProfile(
  nameOrId: string,
  updates: { notes?: string; tags?: string[]; rank?: BadmintonRank },
  clubCode?: string
): ClubMember | null {
  const targetClub = resolveTargetClubCode(clubCode);
  if (targetClub && (clubCode !== undefined || hasCachedCloudClubRoster(targetClub))) {
    const cloudMembers = getCachedCloudClubMembers(targetClub);
    const norm = nameOrId.trim().toLowerCase();
    const idx = cloudMembers.findIndex(
      (m) =>
        m.id === nameOrId ||
        (m.isActive !== false && m.name.trim().toLowerCase() === norm)
    );
    if (idx === -1) return null;

    const nowIso = new Date().toISOString();
    let targetMember = cloudMembers[idx];

    if (updates.rank && updates.rank !== targetMember.rank) {
      targetMember = {
        ...targetMember,
        rank: updates.rank,
        rankScore: RANK_BASE_SCORES[updates.rank] ?? targetMember.rankScore,
        updatedAt: nowIso,
      };
      cloudMembers[idx] = targetMember;
      saveCachedCloudClubMembers(targetClub, cloudMembers);
    }

    const meta =
      updates.notes !== undefined || updates.tags !== undefined
        ? upsertHostMemberPrivateMeta(
            targetClub,
            targetMember.id,
            { notes: updates.notes, tags: updates.tags },
            nowIso
          )
        : getHostMemberPrivateMeta(targetClub, targetMember.id);

    return mergeCloudMembersWithPrivateMeta(
      [targetMember],
      meta ? { [targetMember.id]: meta } : {},
      { includeInactive: true }
    )[0];
  }

  const current = getClubRoster('');
  const norm = nameOrId.trim().toLowerCase();
  const idx = current.findIndex(
    (m) => m.id === nameOrId || m.name.trim().toLowerCase() === norm
  );
  if (idx === -1) return null;

  const prev = current[idx];
  const nextNotes =
    updates.notes !== undefined ? updates.notes.trim() : prev.notes;
  const nextTags =
    updates.tags !== undefined
      ? Array.from(new Set(updates.tags.map((t) => t.trim()).filter(Boolean)))
      : prev.tags;

  const updated: ClubMember = {
    ...prev,
    rank: updates.rank ?? prev.rank,
    notes: nextNotes || undefined,
    tags: nextTags && nextTags.length > 0 ? nextTags : undefined,
  };
  current[idx] = updated;
  saveLegacyClubRosterInternal(current, true);
  return updated;
}

/**
 * Cập nhật trình độ của thành viên trong Sổ CLB theo tên hoặc ID
 */
export function syncClubMemberRank(
  nameOrId: string,
  rank: BadmintonRank,
  clubCode?: string
): boolean {
  const targetClub = resolveTargetClubCode(clubCode);
  if (targetClub && (clubCode !== undefined || hasCachedCloudClubRoster(targetClub))) {
    const cloudMembers = getCachedCloudClubMembers(targetClub);
    const norm = nameOrId.trim().toLowerCase();
    const idx = cloudMembers.findIndex(
      (m) =>
        m.id === nameOrId ||
        (m.isActive !== false && m.name.trim().toLowerCase() === norm)
    );
    if (idx === -1) return false;

    cloudMembers[idx] = {
      ...cloudMembers[idx],
      rank,
      rankScore: RANK_BASE_SCORES[rank] ?? cloudMembers[idx].rankScore,
      updatedAt: new Date().toISOString(),
    };
    saveCachedCloudClubMembers(targetClub, cloudMembers);
    return true;
  }

  const current = getClubRoster('');
  const idx = current.findIndex(
    (m) => m.id === nameOrId || m.name.trim().toLowerCase() === nameOrId.trim().toLowerCase()
  );
  if (idx === -1) return false;

  current[idx] = { ...current[idx], rank };
  saveLegacyClubRosterInternal(current, true);
  return true;
}

/**
 * Xóa (hoặc ẩn local) thành viên khỏi Sổ CLB
 */
export function deleteClubMember(id: string, clubCode?: string): void {
  const targetClub = resolveTargetClubCode(clubCode);
  if (targetClub && (clubCode !== undefined || hasCachedCloudClubRoster(targetClub))) {
    const cloudMembers = getCachedCloudClubMembers(targetClub);
    const updated = cloudMembers.filter((m) => m.id !== id);
    saveCachedCloudClubMembers(targetClub, updated);
    return;
  }

  const current = getClubRoster('');
  const updated = current.filter((m) => m.id !== id);
  saveLegacyClubRosterInternal(updated, true);
}

/**
 * Kiểm tra xem một người có nằm trong Sổ CLB hay không
 */
export function isClubMember(nameOrId: string, roster: ClubMember[]): boolean {
  const norm = nameOrId.trim().toLowerCase();
  return roster.some((m) => m.id === nameOrId || m.name.trim().toLowerCase() === norm);
}
