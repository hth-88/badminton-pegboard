import { describe, expect, it } from 'vitest';
import type {
  BadmintonRank,
  Lineup,
  Player,
  ReadyQueueItem,
} from '../../types/badminton';
import {
  badmintonReducer,
  createInitialSessionState,
} from '../sessionReducer';

function createMockPlayer(
  id: string,
  name: string,
  sex: 'M' | 'F' = 'M',
  rank: BadmintonRank = 'tb',
  overrides?: Partial<Player>
): Player {
  return {
    id,
    name,
    sex,
    rank,
    status: 'ACTIVE',
    assignedPool: 'ALL',
    gamesPlayed: 0,
    virtualGamesOffset: 0,
    waitStreak: 0,
    lastPlayedAt: 0,
    singlesCount: 0,
    noSingles: false,
    joinedAt: 1000,
    ...overrides,
  };
}

describe('Unit tests cho sessionReducer fixes (Mục 1 - 4)', () => {
  // =========================================================================
  // 1) END_MATCH & END_AND_START với expectedMatchId
  // =========================================================================
  describe('1) END_MATCH & END_AND_START với expectedMatchId', () => {
    it('dispatch END_AND_START 2 lần liên tiếp cùng expectedMatchId -> lần 2 là no-op; gamesPlayed mỗi người +1, history +1, undoStack +1', () => {
      let state = createInitialSessionState();
      state.players = [
        createMockPlayer('p1', 'Player 1'),
        createMockPlayer('p2', 'Player 2'),
        createMockPlayer('p3', 'Player 3'),
        createMockPlayer('p4', 'Player 4'),
        createMockPlayer('p5', 'Player 5'),
        createMockPlayer('p6', 'Player 6'),
        createMockPlayer('p7', 'Player 7'),
        createMockPlayer('p8', 'Player 8'),
      ];

      const initialMatchId = 'match_active_123';
      state.courts = [
        {
          id: 'court-1',
          name: 'Sân 1',
          isActive: true,
          policy: 'MIX',
          forcedType: null,
          currentMatch: {
            id: initialMatchId,
            type: 'DOUBLES',
            team1: ['p1', 'p2'],
            team2: ['p3', 'p4'],
            slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
            startedAt: 1000,
          },
          nextUp: null,
        },
      ];

      const nextLineup: Lineup = {
        id: 'match_next_456',
        type: 'DOUBLES',
        team1: ['p5', 'p6'],
        team2: ['p7', 'p8'],
        slotSource: { p5: 'AUTO', p6: 'AUTO', p7: 'AUTO', p8: 'AUTO' },
      };

      // Lần 1: Gọi END_AND_START với đúng expectedMatchId
      const state1 = badmintonReducer(state, {
        type: 'END_AND_START',
        payload: {
          courtId: 'court-1',
          now: 2000,
          nextLineup,
          expectedMatchId: initialMatchId,
        },
      });

      // Kiểm tra sau lần 1: trận cũ kết thúc, trận mới bắt đầu
      expect(state1).not.toBe(state);
      expect(state1.history.length).toBe(1);
      expect(state1.history[0].id).toBe(initialMatchId);
      expect(state1.undoStack.length).toBe(1);

      // p1..p4 đã đánh xong trận -> gamesPlayed = 1
      for (const pid of ['p1', 'p2', 'p3', 'p4']) {
        const p = state1.players.find((pl) => pl.id === pid)!;
        expect(p.gamesPlayed).toBe(1);
      }
      // p5..p8 vừa vào sân -> gamesPlayed vẫn = 0
      for (const pid of ['p5', 'p6', 'p7', 'p8']) {
        const p = state1.players.find((pl) => pl.id === pid)!;
        expect(p.gamesPlayed).toBe(0);
      }

      // Sân 1 hiện đang có trận mới đang đánh
      expect(state1.courts[0].currentMatch).not.toBeNull();
      expect(state1.courts[0].currentMatch?.id).toBe('match_next_456');

      // Lần 2: Gọi lại END_AND_START với cùng expectedMatchId cũ (mô phỏng click đúp hoặc race condition)
      const state2 = badmintonReducer(state1, {
        type: 'END_AND_START',
        payload: {
          courtId: 'court-1',
          now: 2500,
          nextLineup,
          expectedMatchId: initialMatchId,
        },
      });

      // Lần 2 phải là NO-OP hoàn toàn: cùng instance reference, không snapshot undo thêm
      expect(state2).toBe(state1);
      expect(state2.history.length).toBe(1);
      expect(state2.undoStack.length).toBe(1);
      for (const pid of ['p1', 'p2', 'p3', 'p4']) {
        const p = state2.players.find((pl) => pl.id === pid)!;
        expect(p.gamesPlayed).toBe(1);
      }
    });

    it('END_MATCH với expectedMatchId không khớp -> return state (không snapshot undo)', () => {
      let state = createInitialSessionState();
      state.players = [
        createMockPlayer('p1', 'Player 1'),
        createMockPlayer('p2', 'Player 2'),
        createMockPlayer('p3', 'Player 3'),
        createMockPlayer('p4', 'Player 4'),
      ];
      state.courts = [
        {
          id: 'court-1',
          name: 'Sân 1',
          isActive: true,
          policy: 'MIX',
          forcedType: null,
          currentMatch: {
            id: 'match_real_id',
            type: 'DOUBLES',
            team1: ['p1', 'p2'],
            team2: ['p3', 'p4'],
            slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
            startedAt: 1000,
          },
          nextUp: null,
        },
      ];

      // Dispatch END_MATCH với expectedMatchId sai
      const res = badmintonReducer(state, {
        type: 'END_MATCH',
        payload: {
          courtId: 'court-1',
          now: 2000,
          expectedMatchId: 'mismatched_id',
        },
      });

      expect(res).toBe(state);
      expect(res.undoStack.length).toBe(0);
      expect(res.history.length).toBe(0);
      expect(res.courts[0].currentMatch).not.toBeNull();
    });

    it('END_MATCH với expectedMatchId khớp -> kết thúc thành công và tạo 1 snapshot undo', () => {
      let state = createInitialSessionState();
      state.players = [
        createMockPlayer('p1', 'Player 1'),
        createMockPlayer('p2', 'Player 2'),
        createMockPlayer('p3', 'Player 3'),
        createMockPlayer('p4', 'Player 4'),
      ];
      state.courts = [
        {
          id: 'court-1',
          name: 'Sân 1',
          isActive: true,
          policy: 'MIX',
          forcedType: null,
          currentMatch: {
            id: 'match_target',
            type: 'DOUBLES',
            team1: ['p1', 'p2'],
            team2: ['p3', 'p4'],
            slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
            startedAt: 1000,
          },
          nextUp: null,
        },
      ];

      const res = badmintonReducer(state, {
        type: 'END_MATCH',
        payload: {
          courtId: 'court-1',
          now: 2000,
          expectedMatchId: 'match_target',
        },
      });

      expect(res).not.toBe(state);
      expect(res.undoStack.length).toBe(1);
      expect(res.history.length).toBe(1);
      expect(res.courts[0].currentMatch).toBeNull();
      expect(res.players.find((p) => p.id === 'p1')?.gamesPlayed).toBe(1);
    });
  });

  // =========================================================================
  // 2) RESUME_PLAYER & PAUSE_PLAYER (3 trường hợp)
  // =========================================================================
  describe('2) RESUME_PLAYER & PAUSE_PLAYER (3 trường hợp)', () => {
    describe('PAUSE_PLAYER', () => {
      it('Trường hợp 1: player không tồn tại -> return state', () => {
        const state = createInitialSessionState();
        state.players = [createMockPlayer('p1', 'Player 1')];

        const res = badmintonReducer(state, {
          type: 'PAUSE_PLAYER',
          payload: { playerId: 'nonexistent_id' },
        });

        expect(res).toBe(state);
        expect(res.undoStack.length).toBe(0);
      });

      it('Trường hợp 2: player đã PAUSED -> return state', () => {
        const state = createInitialSessionState();
        state.players = [
          createMockPlayer('p1', 'Player 1', 'M', 'tb', { status: 'PAUSED' }),
        ];

        const res = badmintonReducer(state, {
          type: 'PAUSE_PLAYER',
          payload: { playerId: 'p1' },
        });

        expect(res).toBe(state);
        expect(res.undoStack.length).toBe(0);
      });

      it('Trường hợp 3: chuyển đổi hợp lệ ACTIVE -> PAUSED (reset waitStreak, tạo undo snapshot)', () => {
        const state = createInitialSessionState();
        state.players = [
          createMockPlayer('p1', 'Player 1', 'M', 'tb', { status: 'ACTIVE', waitStreak: 3 }),
        ];

        const res = badmintonReducer(state, {
          type: 'PAUSE_PLAYER',
          payload: { playerId: 'p1' },
        });

        expect(res).not.toBe(state);
        expect(res.undoStack.length).toBe(1);
        const p1 = res.players.find((p) => p.id === 'p1')!;
        expect(p1.status).toBe('PAUSED');
        expect(p1.waitStreak).toBe(0);
      });
    });

    describe('RESUME_PLAYER', () => {
      it('Trường hợp 1: player không tồn tại -> return state', () => {
        const state = createInitialSessionState();
        state.players = [createMockPlayer('p1', 'Player 1')];

        const res = badmintonReducer(state, {
          type: 'RESUME_PLAYER',
          payload: { playerId: 'nonexistent_id' },
        });

        expect(res).toBe(state);
        expect(res.undoStack.length).toBe(0);
      });

      it('Trường hợp 2: player đã ACTIVE -> return state', () => {
        const state = createInitialSessionState();
        state.players = [
          createMockPlayer('p1', 'Player 1', 'M', 'tb', { status: 'ACTIVE' }),
        ];

        const res = badmintonReducer(state, {
          type: 'RESUME_PLAYER',
          payload: { playerId: 'p1' },
        });

        expect(res).toBe(state);
        expect(res.undoStack.length).toBe(0);
      });

      it('Trường hợp 3: chuyển đổi hợp lệ PAUSED -> ACTIVE (tính offset, tạo undo snapshot)', () => {
        const state = createInitialSessionState();
        state.players = [
          createMockPlayer('p1', 'Player 1', 'M', 'tb', { status: 'ACTIVE', gamesPlayed: 2 }),
          createMockPlayer('p2', 'Player 2', 'M', 'tb', { status: 'PAUSED', gamesPlayed: 0 }),
        ];

        const res = badmintonReducer(state, {
          type: 'RESUME_PLAYER',
          payload: { playerId: 'p2' },
        });

        expect(res).not.toBe(state);
        expect(res.undoStack.length).toBe(1);
        const p2 = res.players.find((p) => p.id === 'p2')!;
        expect(p2.status).toBe('ACTIVE');
        expect(p2.virtualGamesOffset).toBe(2);
      });
    });
  });

  // =========================================================================
  // 3) ADD_PLAYER & ADD_PLAYERS (bỏ qua id trùng, return state nếu không thêm được ai)
  // =========================================================================
  describe('3) ADD_PLAYER & ADD_PLAYERS', () => {
    it('ADD_PLAYER: nếu id đã tồn tại -> return state (không snapshot undo)', () => {
      const state = createInitialSessionState();
      state.players = [createMockPlayer('p1', 'Player 1')];

      const res = badmintonReducer(state, {
        type: 'ADD_PLAYER',
        payload: {
          player: createMockPlayer('p1', 'Player 1 Duplicate'),
          now: 2000,
        },
      });

      expect(res).toBe(state);
      expect(res.undoStack.length).toBe(0);
      expect(res.players.length).toBe(1);
    });

    it('ADD_PLAYER: id mới -> thêm thành công', () => {
      const state = createInitialSessionState();
      state.players = [createMockPlayer('p1', 'Player 1')];

      const res = badmintonReducer(state, {
        type: 'ADD_PLAYER',
        payload: {
          player: createMockPlayer('p2', 'Player 2'),
          now: 2000,
        },
      });

      expect(res).not.toBe(state);
      expect(res.undoStack.length).toBe(1);
      expect(res.players.length).toBe(2);
    });

    it('ADD_PLAYERS: bỏ qua id đã tồn tại và trùng trong cùng batch; return state nếu không thêm được ai', () => {
      const state = createInitialSessionState();
      state.players = [createMockPlayer('p1', 'Player 1')];

      // Batch 1: toàn người trùng id (p1 trùng với state, p1 trùng trong batch)
      const resDup = badmintonReducer(state, {
        type: 'ADD_PLAYERS',
        payload: {
          players: [
            createMockPlayer('p1', 'Dup In State'),
            createMockPlayer('p1', 'Dup In State Again'),
          ],
          now: 2000,
        },
      });
      expect(resDup).toBe(state);
      expect(resDup.undoStack.length).toBe(0);
      expect(resDup.players.length).toBe(1);

      // Batch 2: mảng rỗng -> return state
      const resEmpty = badmintonReducer(state, {
        type: 'ADD_PLAYERS',
        payload: {
          players: [],
          now: 2000,
        },
      });
      expect(resEmpty).toBe(state);
      expect(resEmpty.undoStack.length).toBe(0);

      // Batch 3: có cả trùng (p1) và trùng trong cùng batch (p2 xuất hiện 2 lần), và người duy nhất (p3)
      const resMixed = badmintonReducer(state, {
        type: 'ADD_PLAYERS',
        payload: {
          players: [
            createMockPlayer('p1', 'Dup In State'),
            createMockPlayer('p2', 'Player 2 First'),
            createMockPlayer('p2', 'Player 2 Second Duplicate In Batch'),
            createMockPlayer('p3', 'Player 3'),
          ],
          now: 2000,
        },
      });

      expect(resMixed).not.toBe(state);
      expect(resMixed.undoStack.length).toBe(1);
      expect(resMixed.players.length).toBe(3); // p1, p2, p3
      expect(resMixed.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
      expect(resMixed.players.find((p) => p.id === 'p2')?.name).toBe('Player 2 First');
    });
  });

  // =========================================================================
  // 4) REMOVE_COURT & UPDATE_COURT(isActive=false) reset courtId trong readyQueue
  // =========================================================================
  describe('4) REMOVE_COURT & UPDATE_COURT(isActive=false)', () => {
    it('UPDATE_COURT(isActive=false): item trong readyQueue có courtId = sân đó thì đặt courtId = undefined, giữ nguyên lineup', () => {
      const state = createInitialSessionState();
      state.courts = [
        {
          id: 'court-1',
          name: 'Sân 1',
          isActive: true,
          policy: 'MIX',
          forcedType: null,
          currentMatch: null,
          nextUp: null,
        },
        {
          id: 'court-2',
          name: 'Sân 2',
          isActive: true,
          policy: 'MIX',
          forcedType: null,
          currentMatch: null,
          nextUp: null,
        },
      ];

      const queueItem1: ReadyQueueItem = {
        id: 'q-1',
        courtId: 'court-1',
        isLockedByHost: true,
        createdAt: 1000,
        lineup: {
          type: 'DOUBLES',
          team1: ['p1', 'p2'],
          team2: ['p3', 'p4'],
          slotSource: { p1: 'MANUAL', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
        },
      };

      const queueItem2: ReadyQueueItem = {
        id: 'q-2',
        courtId: 'court-2',
        isLockedByHost: false,
        createdAt: 2000,
        lineup: {
          type: 'DOUBLES',
          team1: ['p5', 'p6'],
          team2: ['p7', 'p8'],
          slotSource: { p5: 'AUTO', p6: 'AUTO', p7: 'AUTO', p8: 'AUTO' },
        },
      };

      state.readyQueue = [queueItem1, queueItem2];

      // Tắt Sân 1
      const res = badmintonReducer(state, {
        type: 'UPDATE_COURT',
        payload: {
          courtId: 'court-1',
          updates: { isActive: false },
        },
      });

      expect(res.courts.find((c) => c.id === 'court-1')?.isActive).toBe(false);
      expect(res.readyQueue.length).toBe(2);

      // Item 1: courtId phải chuyển thành undefined, lineup giữ nguyên
      const item1After = res.readyQueue.find((q) => q.id === 'q-1')!;
      expect(item1After.courtId).toBeUndefined();
      expect(item1After.isLockedByHost).toBe(true);
      expect(item1After.lineup).toEqual(queueItem1.lineup);

      // Item 2: court-2 giữ nguyên
      const item2After = res.readyQueue.find((q) => q.id === 'q-2')!;
      expect(item2After.courtId).toBe('court-2');
      expect(item2After.lineup).toEqual(queueItem2.lineup);
    });

    it('REMOVE_COURT: item trong readyQueue có courtId = sân đó thì đặt courtId = undefined, giữ nguyên lineup', () => {
      const state = createInitialSessionState();
      state.courts = [
        {
          id: 'court-1',
          name: 'Sân 1',
          isActive: true,
          policy: 'MIX',
          forcedType: null,
          currentMatch: null,
          nextUp: null,
        },
      ];

      const queueItem: ReadyQueueItem = {
        id: 'q-1',
        courtId: 'court-1',
        isLockedByHost: false,
        createdAt: 1000,
        lineup: {
          type: 'SINGLES',
          team1: ['p1'],
          team2: ['p2'],
          slotSource: { p1: 'AUTO', p2: 'AUTO' },
        },
      };

      state.readyQueue = [queueItem];

      // Xóa Sân 1
      const res = badmintonReducer(state, {
        type: 'REMOVE_COURT',
        payload: { courtId: 'court-1' },
      });

      expect(res.courts.find((c) => c.id === 'court-1')).toBeUndefined();
      expect(res.readyQueue.length).toBe(1);
      const itemAfter = res.readyQueue[0];
      expect(itemAfter.courtId).toBeUndefined();
      expect(itemAfter.lineup).toEqual(queueItem.lineup);
    });
  });
});
