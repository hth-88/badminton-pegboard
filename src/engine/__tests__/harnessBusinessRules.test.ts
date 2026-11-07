import { describe, it, expect } from 'vitest';
import {
  badmintonReducer,
  createInitialSessionState,
} from '../sessionReducer';
import { suggestNextUpForCourt } from '../matchmaker';
import { resolveTargetMatchType } from '../nextUp';
import type { BadmintonSessionState, Player } from '../../types/badminton';

function createMockPlayer(id: string, name: string): Player {
  return {
    id,
    name,
    sex: 'M',
    rank: 'tb',
    status: 'ACTIVE',
    gamesPlayed: 0,
    singlesCount: 0,
    noSingles: false,
    waitStreak: 0,
    virtualGamesOffset: 0,
    lastPlayedAt: 0,
    joinedAt: 0,
    assignedPool: 'ALL',
  };
}

describe('Hạng mục Business Rules - Test bắt buộc', () => {
  describe('Hạng mục 1: 100% Đơn và forcedType SINGLES', () => {
    it('khi settings.matchMix.singles === 1, gợi ý luôn tạo đội hình SINGLES (1 vs 1) chỉ với >= 2 người', () => {
      let state: BadmintonSessionState = {
        ...createInitialSessionState(),
        settings: {
          ...createInitialSessionState().settings,
          matchMix: { doubles: 0, singles: 1 },
        },
        players: [
          createMockPlayer('p1', 'Player 1'),
          createMockPlayer('p2', 'Player 2'),
          createMockPlayer('p3', 'Player 3'),
        ],
      };

      const targetType = resolveTargetMatchType(state.courts[0], state, 3);
      expect(targetType).toBe('SINGLES');

      const draft = suggestNextUpForCourt(state, 'court-1', 1000);
      expect(draft).not.toBeNull();
      expect(draft?.type).toBe('SINGLES');
      expect(draft?.slots.length).toBe(2);
      expect(draft?.slots[0]).toBeTruthy();
      expect(draft?.slots[1]).toBeTruthy();
    });

    it('khi court.forcedType === "SINGLES", gợi ý luôn tạo đội hình SINGLES ngay cả khi cài đặt chung là 100% Đôi', () => {
      let state: BadmintonSessionState = {
        ...createInitialSessionState(),
        settings: {
          ...createInitialSessionState().settings,
          matchMix: { doubles: 1, singles: 0 },
        },
        players: [
          createMockPlayer('p1', 'Player 1'),
          createMockPlayer('p2', 'Player 2'),
        ],
      };

      state = badmintonReducer(state, {
        type: 'UPDATE_COURT',
        payload: { courtId: 'court-1', updates: { forcedType: 'SINGLES' } },
      });

      expect(state.courts[0].forcedType).toBe('SINGLES');
      expect(state.courts[0].nextUp.type).toBe('SINGLES');
      expect(state.courts[0].nextUp.slots.length).toBe(2);

      const draft = suggestNextUpForCourt(state, 'court-1', 1000);
      expect(draft).not.toBeNull();
      expect(draft?.type).toBe('SINGLES');
      expect(draft?.slots.length).toBe(2);
    });
  });

  describe('Hạng mục 2: Khóa cứng START_MATCH khi có người đang thi đấu ở sân khác', () => {
    it('từ chối START_MATCH nếu bất kỳ ai trong lineup đang đánh ở currentMatch sân khác', () => {
      let state: BadmintonSessionState = {
        ...createInitialSessionState(),
        players: [
          createMockPlayer('p1', 'Player 1'),
          createMockPlayer('p2', 'Player 2'),
          createMockPlayer('p3', 'Player 3'),
          createMockPlayer('p4', 'Player 4'),
          createMockPlayer('p5', 'Player 5'),
          createMockPlayer('p6', 'Player 6'),
          createMockPlayer('p7', 'Player 7'),
        ],
      };

      // Cho Sân 1 bắt đầu trận với p1..p4
      state = badmintonReducer(state, {
        type: 'START_MATCH',
        payload: {
          courtId: 'court-1',
          lineup: {
            type: 'DOUBLES',
            team1: ['p1', 'p2'],
            team2: ['p3', 'p4'],
            slotSource: { p1: 'MANUAL', p2: 'MANUAL', p3: 'MANUAL', p4: 'MANUAL' },
          },
          now: 1000,
        },
      });

      expect(state.courts[0].currentMatch).not.toBeNull();

      // Cố gắng bắt đầu trận trên Sân 2 có chứa p1 (đang đánh ở Sân 1)
      const stateBeforeStartAttempt = state;
      const stateAfterStartAttempt = badmintonReducer(state, {
        type: 'START_MATCH',
        payload: {
          courtId: 'court-2',
          lineup: {
            type: 'DOUBLES',
            team1: ['p1', 'p5'],
            team2: ['p6', 'p7'],
            slotSource: { p1: 'MANUAL', p5: 'MANUAL', p6: 'MANUAL', p7: 'MANUAL' },
          },
          now: 2000,
        },
      });

      // Bị từ chối hoàn toàn: Sân 2 vẫn trống, state trả về tham chiếu cũ
      expect(stateAfterStartAttempt.courts[1].currentMatch).toBeNull();
      expect(stateAfterStartAttempt).toBe(stateBeforeStartAttempt);
    });
  });

  describe('Hạng mục 3: REMOVE_PLAYERS và PAUSE_PLAYERS', () => {
    it('REMOVE_PLAYERS xóa nhiều người cùng lúc trong ĐÚNG 1 snapshot Undo', () => {
      let state: BadmintonSessionState = {
        ...createInitialSessionState(),
        players: [
          createMockPlayer('p1', 'Player 1'),
          createMockPlayer('p2', 'Player 2'),
          createMockPlayer('p3', 'Player 3'),
          createMockPlayer('p4', 'Player 4'),
          createMockPlayer('p5', 'Player 5'),
        ],
      };

      // Đặt p1 vào Next Up của Sân 1
      state = badmintonReducer(state, {
        type: 'SET_NEXT_UP_SLOT',
        payload: { courtId: 'court-1', slotIndex: 0, playerId: 'p1' },
      });
      expect(state.courts[0].nextUp.slots[0]).toBe('p1');

      // Xóa p1, p2, p3
      const stateBeforeRemove = state;
      state = badmintonReducer(state, {
        type: 'REMOVE_PLAYERS',
        payload: { playerIds: ['p1', 'p2', 'p3'] },
      });

      expect(state.players.map((p) => p.id)).toEqual(['p4', 'p5']);
      expect(state.courts[0].nextUp.slots[0]).toBeNull();
      expect(state.undoStack.length).toBe(stateBeforeRemove.undoStack.length + 1);

      // Hoàn tác (Undo) ĐÚNG 1 bước -> khôi phục đầy đủ cả 3 người và slot ở Next Up
      state = badmintonReducer(state, { type: 'UNDO' });
      expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
      expect(state.courts[0].nextUp.slots[0]).toBe('p1');
    });

    it('REMOVE_PLAYERS bỏ qua người chơi đang trực tiếp thi đấu trong currentMatch', () => {
      let state: BadmintonSessionState = {
        ...createInitialSessionState(),
        players: [
          createMockPlayer('p1', 'Player 1'),
          createMockPlayer('p2', 'Player 2'),
          createMockPlayer('p3', 'Player 3'),
          createMockPlayer('p4', 'Player 4'),
          createMockPlayer('p5', 'Player 5'),
        ],
      };

      // Sân 1 đánh đơn p1 vs p2
      state = badmintonReducer(state, {
        type: 'START_MATCH',
        payload: {
          courtId: 'court-1',
          lineup: {
            type: 'SINGLES',
            team1: ['p1'],
            team2: ['p2'],
            slotSource: { p1: 'MANUAL', p2: 'MANUAL' },
          },
          now: 1000,
        },
      });

      // Yêu cầu xóa p1 (đang đánh) và p3, p4 (rảnh)
      state = badmintonReducer(state, {
        type: 'REMOVE_PLAYERS',
        payload: { playerIds: ['p1', 'p3', 'p4'] },
      });

      // p1 được giữ lại an toàn do đang đánh, p3 và p4 bị xóa
      expect(state.players.some((p) => p.id === 'p1')).toBe(true);
      expect(state.players.some((p) => p.id === 'p3')).toBe(false);
      expect(state.players.some((p) => p.id === 'p4')).toBe(false);
    });

    it('PAUSE_PLAYERS tạm nghỉ hàng loạt và dọn sạch khỏi Next Up', () => {
      let state: BadmintonSessionState = {
        ...createInitialSessionState(),
        players: [
          createMockPlayer('p1', 'Player 1'),
          createMockPlayer('p2', 'Player 2'),
          createMockPlayer('p3', 'Player 3'),
        ],
      };

      state = badmintonReducer(state, {
        type: 'SET_NEXT_UP_SLOT',
        payload: { courtId: 'court-1', slotIndex: 1, playerId: 'p2' },
      });
      expect(state.courts[0].nextUp.slots[1]).toBe('p2');

      state = badmintonReducer(state, {
        type: 'PAUSE_PLAYERS',
        payload: { playerIds: ['p1', 'p2'] },
      });

      expect(state.players.find((p) => p.id === 'p1')?.status).toBe('PAUSED');
      expect(state.players.find((p) => p.id === 'p2')?.status).toBe('PAUSED');
      expect(state.courts[0].nextUp.slots[1]).toBeNull();
    });
  });
});
