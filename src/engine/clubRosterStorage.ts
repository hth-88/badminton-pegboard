import type { BadmintonRank, Sex } from '../types/badminton';

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
}

export const STORAGE_KEY_CLUB_ROSTER = 'badminton_club_roster';

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

/**
 * Đọc toàn bộ danh sách thành viên trong Sổ CLB
 */
export function getClubRoster(): ClubMember[] {
  if (typeof localStorage === 'undefined') {
    return [...DEFAULT_9_CLUB_MEMBERS];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLUB_ROSTER);
    if (!raw) {
      // Khởi tạo 9 thành viên mặc định lần đầu
      saveClubRoster(DEFAULT_9_CLUB_MEMBERS);
      return [...DEFAULT_9_CLUB_MEMBERS];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Bỏ qua lỗi parse
  }
  return [...DEFAULT_9_CLUB_MEMBERS];
}

/**
 * Lưu toàn bộ danh sách thành viên vào Sổ CLB
 */
export function saveClubRoster(roster: ClubMember[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_CLUB_ROSTER, JSON.stringify(roster));
  } catch (err) {
    console.error('Không thể lưu Sổ thành viên CLB:', err);
  }
}

/**
 * Thêm hoặc cập nhật thành viên vào Sổ CLB
 */
export function upsertClubMember(member: Omit<ClubMember, 'id'> & { id?: string }): ClubMember {
  const current = getClubRoster();
  const id = member.id || `roster_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const existingIdx = current.findIndex((m) => m.id === id || m.name.trim().toLowerCase() === member.name.trim().toLowerCase());
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

  saveClubRoster(current);
  return newEntry;
}

/**
 * Cập nhật ghi chú & thẻ kín (và trình độ nếu có) của thành viên trong Sổ CLB
 */
export function updateClubMemberProfile(
  nameOrId: string,
  updates: { notes?: string; tags?: string[]; rank?: BadmintonRank }
): ClubMember | null {
  const current = getClubRoster();
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
  saveClubRoster(current);
  return updated;
}

/**
 * Cập nhật trình độ của thành viên trong Sổ CLB theo tên hoặc ID
 */
export function syncClubMemberRank(nameOrId: string, rank: BadmintonRank): boolean {
  const current = getClubRoster();
  const idx = current.findIndex(
    (m) => m.id === nameOrId || m.name.trim().toLowerCase() === nameOrId.trim().toLowerCase()
  );
  if (idx === -1) return false;

  current[idx] = { ...current[idx], rank };
  saveClubRoster(current);
  return true;
}

/**
 * Xóa thành viên khỏi Sổ CLB
 */
export function deleteClubMember(id: string): void {
  const current = getClubRoster();
  const updated = current.filter((m) => m.id !== id);
  saveClubRoster(updated);
}

/**
 * Kiểm tra xem một người có nằm trong Sổ CLB hay không
 */
export function isClubMember(nameOrId: string, roster: ClubMember[]): boolean {
  const norm = nameOrId.trim().toLowerCase();
  return roster.some((m) => m.id === nameOrId || m.name.trim().toLowerCase() === norm);
}
