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

  it('Trả về 9 thành viên mẫu mặc định khi chưa có dữ liệu trong localStorage', () => {
    const roster = getClubRoster();
    expect(roster.length).toBe(9);
    expect(roster.some((m) => m.name === 'Đức Anh')).toBe(true);
    expect(roster.some((m) => m.name === 'Phương Thảo')).toBe(true);
  });

  it('Thêm mới thành viên vào Sổ CLB', () => {
    const newMember = upsertClubMember({
      name: 'Văn Toàn',
      sex: 'M',
      rank: 'tbk',
      noSingles: false,
    });

    const roster = getClubRoster();
    expect(roster.length).toBe(10);
    const found = roster.find((m) => m.id === newMember.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe('Văn Toàn');
    expect(found?.rank).toBe('tbk');
  });

  it('Cập nhật thông tin thành viên đã tồn tại theo tên trùng', () => {
    upsertClubMember({
      name: 'Đức Anh',
      sex: 'M',
      rank: 'tb+',
      noSingles: true,
    });

    const roster = getClubRoster();
    expect(roster.length).toBe(9); // Không tăng số lượng
    const da = roster.find((m) => m.name === 'Đức Anh');
    expect(da?.rank).toBe('tb+');
    expect(da?.noSingles).toBe(true);
  });

  it('isClubMember kiểm tra chính xác không phân biệt hoa thường và khoảng trắng', () => {
    const roster = getClubRoster();
    expect(isClubMember('  đức Anh  ', roster)).toBe(true);
    expect(isClubMember('Khách Vãng Lai', roster)).toBe(false);
  });

  it('syncClubMemberRank đồng bộ trình độ vào Sổ CLB', () => {
    syncClubMemberRank('Phương Thảo', 'tb+');
    const roster = getClubRoster();
    const pt = roster.find((m) => m.name === 'Phương Thảo');
    expect(pt?.rank).toBe('tb+');
  });

  it('deleteClubMember xóa thành viên khỏi Sổ CLB', () => {
    const roster = getClubRoster();
    const firstId = roster[0].id;
    deleteClubMember(firstId);

    const updated = getClubRoster();
    expect(updated.length).toBe(8);
    expect(updated.some((m) => m.id === firstId)).toBe(false);
  });
});
