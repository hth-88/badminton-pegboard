import { beforeEach, describe, expect, it } from 'vitest';
import {
  getClubRoster,
  upsertClubMember,
  deleteClubMember,
  isClubMember,
  syncClubMemberRank,
} from '../clubRosterStorage';

describe('SỔ THÀNH VIÊN CLB CỐ ĐỊNH (Club Roster Storage)', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          for (const k of Object.keys(mockStorage)) {
            delete mockStorage[k];
          }
        },
      },
      writable: true,
      configurable: true,
    });
  });

  const seedLocal = () => {
    upsertClubMember({ name: 'Đức Anh', sex: 'M', rank: 'y-', noSingles: false });
    upsertClubMember({ name: 'Phương Thảo', sex: 'F', rank: 'tby-', noSingles: false });
  };

  it('Sổ CLB rỗng (0 người) khi máy local chưa có dữ liệu, không seed người mẫu', () => {
    expect(getClubRoster()).toHaveLength(0);
    expect(mockStorage['badminton_club_roster:local']).toBeUndefined();
  });

  it('Sổ CLB local lưu ở namespace roster:local, tách khỏi roster:<club_code>', () => {
    seedLocal();
    expect(JSON.parse(mockStorage['badminton_club_roster:local'])).toHaveLength(2);
    expect(getClubRoster('CLB-X')).toHaveLength(0);
  });

  it('Thêm mới thành viên vào Sổ CLB', () => {
    const newMember = upsertClubMember({
      name: 'Văn Toàn',
      sex: 'M',
      rank: 'tbk',
      noSingles: false,
    });

    const roster = getClubRoster();
    expect(roster.length).toBe(1);
    const found = roster.find((m) => m.id === newMember.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe('Văn Toàn');
    expect(found?.rank).toBe('tbk');
  });

  it('Cập nhật thông tin thành viên đã tồn tại theo tên trùng', () => {
    seedLocal();
    upsertClubMember({
      name: 'Đức Anh',
      sex: 'M',
      rank: 'tb+',
      noSingles: true,
    });

    const roster = getClubRoster();
    expect(roster.length).toBe(2); // Không tăng số lượng
    const da = roster.find((m) => m.name === 'Đức Anh');
    expect(da?.rank).toBe('tb+');
    expect(da?.noSingles).toBe(true);
  });

  it('isClubMember kiểm tra chính xác không phân biệt hoa thường và khoảng trắng', () => {
    seedLocal();
    const roster = getClubRoster();
    expect(isClubMember('  đức Anh  ', roster)).toBe(true);
    expect(isClubMember('Khách Vãng Lai', roster)).toBe(false);
  });

  it('syncClubMemberRank đồng bộ trình độ vào Sổ CLB', () => {
    seedLocal();
    syncClubMemberRank('Phương Thảo', 'tb+');
    const roster = getClubRoster();
    const pt = roster.find((m) => m.name === 'Phương Thảo');
    expect(pt?.rank).toBe('tb+');
  });

  it('deleteClubMember xóa thành viên khỏi Sổ CLB', () => {
    seedLocal();
    const roster = getClubRoster();
    const firstId = roster[0].id;
    deleteClubMember(firstId);

    const updated = getClubRoster();
    expect(updated.length).toBe(1);
    expect(updated.some((m) => m.id === firstId)).toBe(false);
  });
});
