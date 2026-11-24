import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLUB_MEMBER_PRESET_TAGS,
  getClubRoster,
  saveClubRoster,
  updateClubMemberProfile,
  upsertClubMember,
} from '../clubRosterStorage';
import {
  archiveCurrentSession,
  clearAllArchivedSessions,
  computeMultiSessionFinanceSummary,
  getArchivedSessions,
  toggleArchivedPlayerPaid,
} from '../storage';
import { createInitialSessionState } from '../sessionReducer';
import {
  UTF8_BOM,
  buildMultiSessionStatementCsv,
  buildSessionStatementCsv,
  escapeCsvCell,
} from '../../utils/statementCsv';

describe('Nhóm 6 Core: Sổ thành viên kín, Sao kê tài chính Archive & Xuất CSV', () => {
  const mockStore: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => mockStore[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStore[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockStore[k];
        },
        key: (idx: number) => Object.keys(mockStore)[idx] ?? null,
        get length() {
          return Object.keys(mockStore).length;
        },
        clear: () => {
          for (const k of Object.keys(mockStore)) delete mockStore[k];
        },
      },
      writable: true,
      configurable: true,
    });
    clearAllArchivedSessions();
  });

  it('1. updateClubMemberProfile cập nhật notes & tags mà không làm mất thành viên khác', () => {
    saveClubRoster([
      { id: 'r1', name: 'Đức Anh', sex: 'M', rank: 'tb', noSingles: false },
      { id: 'r2', name: 'Linh', sex: 'F', rank: 'tby', noSingles: false },
    ]);

    const updated = updateClubMemberProfile('Đức Anh', {
      notes: '  Hay đau gối trái  ',
      tags: [CLUB_MEMBER_PRESET_TAGS[2], CLUB_MEMBER_PRESET_TAGS[0], CLUB_MEMBER_PRESET_TAGS[2]],
    });

    expect(updated).not.toBeNull();
    expect(updated!.notes).toBe('Hay đau gối trái');
    expect(updated!.tags).toEqual(['Đau gối / nhẹ tay', 'Trình cứng']);
    expect(getClubRoster()).toHaveLength(2);
  });

  it('2. upsertClubMember bảo toàn notes & tags cũ nếu không truyền mới', () => {
    saveClubRoster([
      {
        id: 'r1',
        name: 'Đức Anh',
        sex: 'M',
        rank: 'tb',
        notes: 'Ghi chú kín cũ',
        tags: ['Trình cứng'],
      },
    ]);

    upsertClubMember({ name: 'Đức Anh', sex: 'M', rank: 'tb+' });
    const member = getClubRoster()[0];
    expect(member.rank).toBe('tb+');
    expect(member.notes).toBe('Ghi chú kín cũ');
    expect(member.tags).toEqual(['Trình cứng']);
  });

  it('3. archiveCurrentSession lưu settlementSnapshot đầy đủ và toggleArchivedPlayerPaid cập nhật nợ cũ', () => {
    const state = createInitialSessionState();
    const archived = archiveCurrentSession(state, 400000, {
      courtCost: 320000,
      shuttleCost: 80000,
      extraCost: 0,
      totalCost: 400000,
      totalCollected: 408000,
      surplus: 8000,
      betFundTotal: 20000,
      players: [
        {
          playerId: 'p1',
          name: 'An',
          sex: 'M',
          gamesPlayed: 4,
          courtAmount: 102000,
          finalAmount: 102000,
          paid: true,
          paidAt: 1000,
        },
        {
          playerId: 'p2',
          name: 'Bình',
          sex: 'M',
          gamesPlayed: 4,
          courtAmount: 102000,
          finalAmount: 102000,
          paid: false,
        },
      ],
    });

    expect(archived.settlementSnapshot?.players).toHaveLength(2);

    const beforeSummary = computeMultiSessionFinanceSummary(getArchivedSessions());
    expect(beforeSummary.sessionsWithFinance).toBe(1);
    expect(beforeSummary.cumulativeSurplus).toBe(28000);
    expect(beforeSummary.totalUnpaidAmount).toBe(102000);
    expect(beforeSummary.unpaidDebts).toHaveLength(1);
    expect(beforeSummary.unpaidDebts[0].playerName).toBe('Bình');

    // Đánh dấu đã trả bù
    const afterList = toggleArchivedPlayerPaid(archived.id, 'p2', 5000);
    const afterSummary = computeMultiSessionFinanceSummary(afterList);
    expect(afterSummary.totalUnpaidAmount).toBe(0);
    expect(afterSummary.unpaidDebts).toHaveLength(0);
  });

  it('4. computeMultiSessionFinanceSummary bỏ qua các buổi archive cũ chưa có settlementSnapshot', () => {
    const state = createInitialSessionState();
    archiveCurrentSession(state, 200000); // Không có snapshot
    const summary = computeMultiSessionFinanceSummary(getArchivedSessions());
    expect(summary.sessionsWithFinance).toBe(0);
    expect(summary.cumulativeSurplus).toBe(0);
    expect(summary.unpaidDebts).toEqual([]);
  });

  it('5. escapeCsvCell thoát dấu phẩy, ngoặc kép, xuống dòng và vô hiệu hóa công thức =SUM(...)', () => {
    expect(escapeCsvCell('Nguyễn, An')).toBe('"Nguyễn, An"');
    expect(escapeCsvCell('Biệt danh "Tí"')).toBe('"Biệt danh ""Tí"""');
    expect(escapeCsvCell('=SUM(A1:A5)')).toBe("'=SUM(A1:A5)");
    expect(escapeCsvCell('-40000')).toBe('-40000');
  });

  it('6. buildSessionStatementCsv bắt đầu bằng UTF-8 BOM và giữ nguyên tiếng Việt có dấu', () => {
    const csv = buildSessionStatementCsv({
      dateStr: '24/11/2026',
      courtCost: 320000,
      shuttleCost: 120000,
      extraCost: 0,
      totalCost: 440000,
      totalCollected: 444000,
      surplus: 4000,
      betFundTotal: 20000,
      players: [
        {
          name: 'Đức Anh',
          sex: 'M',
          gamesPlayed: 5,
          courtAmount: 111000,
          betAdjustmentVnd: 20000,
          finalAmount: 131000,
          statusLabel: 'Đã đóng',
          note: 'Thua kèo độ',
        },
      ],
    });

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain('Đức Anh');
    expect(csv).toContain('STT,Họ tên,Giới tính');
    expect(csv).toContain('1,Đức Anh,Nam,5,111000,20000,131000,Đã đóng,Thua kèo độ');
  });

  it('7. buildMultiSessionStatementCsv xuất đủ bảng tổng hợp và danh sách nợ cũ', () => {
    const state = createInitialSessionState();
    archiveCurrentSession(state, 300000, {
      courtCost: 240000,
      shuttleCost: 60000,
      extraCost: 0,
      totalCost: 300000,
      totalCollected: 305000,
      surplus: 5000,
      players: [
        {
          playerId: 'p1',
          name: 'Phương Thảo',
          sex: 'F',
          gamesPlayed: 3,
          courtAmount: 75000,
          finalAmount: 75000,
          paid: false,
        },
      ],
    });

    const csv = buildMultiSessionStatementCsv(getArchivedSessions());
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain('SAO KÊ TÀI CHÍNH NHIỀU BUỔI CLB');
    expect(csv).toContain('DANH SÁCH NỢ CŨ CHƯA ĐÓNG');
    expect(csv).toContain('Phương Thảo,75000');
  });
});
