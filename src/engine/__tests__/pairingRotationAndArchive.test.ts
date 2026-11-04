import { beforeEach, describe, expect, it } from 'vitest';
import type { BadmintonSessionState, Lineup } from '../../types/badminton';
import {
  archiveCurrentSession,
  clearAllArchivedSessions,
  deleteArchivedSession,
  getArchivedSessions,
  getPaidPlayerIds,
  savePaidPlayerIds,
} from '../storage';
import { getEffectiveSkill } from '../skillConfig';
import { createDefaultCourts, createInitialSessionState } from '../sessionReducer';

describe('Hạng mục 1 & 4: Đảo cặp 3 vòng, Cân kèo & Lưu trữ Archive / Paid', () => {
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
        key: (idx: number) => Object.keys(mockStorage)[idx] ?? null,
        get length() {
          return Object.keys(mockStorage).length;
        },
        clear: () => {
          for (const k of Object.keys(mockStorage)) delete mockStorage[k];
        },
      },
      writable: true,
      configurable: true,
    });
  });

  describe('1. Logic Xoay vòng 3 thế của trận Đôi (Đảo cặp)', () => {
    // 4 người chơi với ID sắp xếp: A, B, C, D
    const A = 'p1_an';
    const B = 'p2_binh';
    const C = 'p3_cuong';
    const D = 'p4_dung';

    function getNextDoublesMode(currentLineup: Lineup): {
      currentMode: 0 | 1 | 2;
      nextMode: 0 | 1 | 2;
      targetPartner: string;
    } {
      const allIds = [...currentLineup.team1, ...currentLineup.team2].sort();
      const [sortedA, sortedB, sortedC, sortedD] = allIds;
      const aInTeam1 = currentLineup.team1.includes(sortedA);
      const aTeam = aInTeam1 ? currentLineup.team1 : currentLineup.team2;
      const aIdx = aTeam.indexOf(sortedA);
      const partnerIdx = aIdx === 0 ? 1 : 0;
      const currentPartner = aTeam[partnerIdx];

      let currentMode: 0 | 1 | 2 = 0;
      if (currentPartner === sortedC) currentMode = 1;
      else if (currentPartner === sortedD) currentMode = 2;
      else currentMode = 0;

      const nextMode = ((currentMode + 1) % 3) as 0 | 1 | 2;
      const targetPartner = nextMode === 0 ? sortedB : nextMode === 1 ? sortedC : sortedD;

      return { currentMode, nextMode, targetPartner };
    }

    it('từ Thế 0 ([A, B] vs [C, D]) chuyển sang Thế 1 ([A, C] vs [B, D])', () => {
      const lineup0: Lineup = {
        type: 'DOUBLES',
        team1: [A, B],
        team2: [C, D],
        slotSource: {},
      };

      const res = getNextDoublesMode(lineup0);
      expect(res.currentMode).toBe(0);
      expect(res.nextMode).toBe(1);
      expect(res.targetPartner).toBe(C);
    });

    it('từ Thế 1 ([A, C] vs [B, D]) chuyển sang Thế 2 ([A, D] vs [B, C])', () => {
      const lineup1: Lineup = {
        type: 'DOUBLES',
        team1: [A, C],
        team2: [B, D],
        slotSource: {},
      };

      const res = getNextDoublesMode(lineup1);
      expect(res.currentMode).toBe(1);
      expect(res.nextMode).toBe(2);
      expect(res.targetPartner).toBe(D);
    });

    it('từ Thế 2 ([A, D] vs [B, C]) xoay vòng về Thế 0 ([A, B] vs [C, D])', () => {
      const lineup2: Lineup = {
        type: 'DOUBLES',
        team1: [A, D],
        team2: [B, C],
        slotSource: {},
      };

      const res = getNextDoublesMode(lineup2);
      expect(res.currentMode).toBe(2);
      expect(res.nextMode).toBe(0);
      expect(res.targetPartner).toBe(B);
    });
  });

  describe('2. Logic Tự cân cặp (chọn thế có minDiff)', () => {
    // Giả sử có 4 người:
    // A: Nam tbk (14.5 + 1.5 = 16.0)
    // B: Nữ newbie (1.0)
    // C: Nam tb (10.0 + 1.5 = 11.5)
    // D: Nữ tby (6.0)
    it('chọn đúng thế có độ chênh lệch điểm nhỏ nhất', () => {
      const sA = getEffectiveSkill('tbk', 'M'); // 16.0
      const sB = getEffectiveSkill('newbie', 'F'); // 1.0
      const sC = getEffectiveSkill('tb', 'M'); // 11.5
      const sD = getEffectiveSkill('tby', 'F'); // 6.0

      // Thế 0: (A+B) vs (C+D) -> (16.0 + 1.0 = 17.0) vs (11.5 + 6.0 = 17.5) -> diff = 0.5
      const diff0 = Math.abs(sA + sB - (sC + sD));
      // Thế 1: (A+C) vs (B+D) -> (16.0 + 11.5 = 27.5) vs (1.0 + 6.0 = 7.0) -> diff = 20.5
      const diff1 = Math.abs(sA + sC - (sB + sD));
      // Thế 2: (A+D) vs (B+C) -> (16.0 + 6.0 = 22.0) vs (1.0 + 11.5 = 12.5) -> diff = 9.5
      const diff2 = Math.abs(sA + sD - (sB + sC));

      expect(diff0).toBe(0.5);
      expect(diff1).toBe(20.5);
      expect(diff2).toBe(9.5);

      const minDiff = Math.min(diff0, diff1, diff2);
      expect(minDiff).toBe(0.5); // Thế 0 là cân kèo nhất
    });
  });

  describe('3. Quản lý lưu trữ Trạng thái đã đóng tiền (paidPlayerIds)', () => {
    it('lưu và đọc danh sách paidPlayerIds từ localStorage', () => {
      expect(getPaidPlayerIds()).toEqual([]);

      savePaidPlayerIds(['p1', 'p2']);
      expect(getPaidPlayerIds()).toEqual(['p1', 'p2']);

      savePaidPlayerIds(['p1', 'p2', 'p3']);
      expect(getPaidPlayerIds()).toEqual(['p1', 'p2', 'p3']);
    });
  });

  describe('4. Quản lý Sổ lưu trữ Buổi đánh (Archive)', () => {
    it('lưu snapshot buổi hiện tại và giới hạn tối đa 20 buổi', () => {
      const state: BadmintonSessionState = createInitialSessionState();
      state.courts = createDefaultCourts(2);
      state.players = [
        {
          id: 'p1',
          name: 'Player 1',
          sex: 'M',
          rank: 'tb',
          status: 'ACTIVE',
          assignedPool: 'ALL',
          gamesPlayed: 2,
          virtualGamesOffset: 0,
          waitStreak: 0,
          lastPlayedAt: 1000,
          singlesCount: 0,
          noSingles: false,
          joinedAt: 1000,
        },
      ];

      expect(getArchivedSessions()).toHaveLength(0);

      // Lưu 1 buổi
      const s1 = archiveCurrentSession(state, 200000);
      expect(s1.totalPlayers).toBe(1);
      expect(s1.totalCost).toBe(200000);
      expect(getArchivedSessions()).toHaveLength(1);

      // Lưu thêm 25 buổi để kiểm tra giới hạn 20
      for (let i = 0; i < 25; i++) {
        archiveCurrentSession(state, 100000 + i);
      }

      const all = getArchivedSessions();
      expect(all.length).toBe(20);
    });

    it('xóa từng buổi lưu trữ và xóa sạch toàn bộ', () => {
      const state = createInitialSessionState();
      const s1 = archiveCurrentSession(state, 100000);
      const s2 = archiveCurrentSession(state, 200000);
      expect(getArchivedSessions()).toHaveLength(2);

      deleteArchivedSession(s1.id);
      const remaining = getArchivedSessions();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(s2.id);

      clearAllArchivedSessions();
      expect(getArchivedSessions()).toHaveLength(0);
    });
  });
});
