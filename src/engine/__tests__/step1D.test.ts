import { describe, expect, it } from 'vitest';
import type {
  BadmintonRank,
  BadmintonSessionState,
  Lineup,
  Player,
} from '../../types/badminton';
import { buildStatsFromHistory } from '../statsManager';
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

describe('Bước 1D – VÁ Reducer + Selector Hoàn Chỉnh', () => {
  // =========================================================================
  // Test a: START_MATCH lần 2 trên sân đang đánh -> state không đổi
  // =========================================================================
  it('a) START_MATCH lần 2 trên sân đang đánh -> state không đổi (chống bấm đúp)', () => {
    let state = createInitialSessionState();
    state.players = [
      createMockPlayer('p1', 'P1'),
      createMockPlayer('p2', 'P2'),
      createMockPlayer('p3', 'P3'),
      createMockPlayer('p4', 'P4'),
      createMockPlayer('p5', 'P5'),
      createMockPlayer('p6', 'P6'),
    ];

    const lineup1: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p3', 'p4'],
      slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
    };

    // Bắt đầu trận lần 1
    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: { courtId: 'court-1', lineup: lineup1, now: 1000 },
    });
    expect(state.courts[0].currentMatch).not.toBeNull();

    const stateBeforeSecondStart = state;

    // Bấm bắt đầu trận lần 2 trên cùng sân đang đánh (kể cả có lineup mới)
    const lineup2: Lineup = {
      type: 'SINGLES',
      team1: ['p5'],
      team2: ['p6'],
      slotSource: { p5: 'AUTO', p6: 'AUTO' },
    };

    const stateAfterSecondStart = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: { courtId: 'court-1', lineup: lineup2, now: 1050 },
    });

    // State phải hoàn toàn không đổi (exact reference match)
    expect(stateAfterSecondStart).toBe(stateBeforeSecondStart);
    expect(stateAfterSecondStart.courts[0].currentMatch?.team1).toEqual(['p1', 'p2']);
  });

  // =========================================================================
  // Test b: END_AND_START rồi UNDO -> trạng thái giống hệt trước END_AND_START
  // =========================================================================
  it('b) END_AND_START rồi UNDO -> trạng thái giống hệt trước END_AND_START trong đúng 1 snapshot', () => {
    let state = createInitialSessionState();
    state.players = [
      createMockPlayer('p1', 'P1'),
      createMockPlayer('p2', 'P2'),
      createMockPlayer('p3', 'P3'),
      createMockPlayer('p4', 'P4'),
      createMockPlayer('p5', 'P5'),
      createMockPlayer('p6', 'P6'),
      createMockPlayer('p7', 'P7'),
      createMockPlayer('p8', 'P8'),
    ];

    const currentLineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p3', 'p4'],
      slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
    };

    // Bắt đầu trận hiện tại
    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: { courtId: 'court-1', lineup: currentLineup, now: 1000 },
    });

    const nextLineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p5', 'p6'],
      team2: ['p7', 'p8'],
      slotSource: { p5: 'AUTO', p6: 'AUTO', p7: 'AUTO', p8: 'AUTO' },
    };

    // Chụp lại bản sao sâu của state trước khi gọi END_AND_START
    const snapshotBefore = JSON.parse(JSON.stringify(state));

    // Thực hiện END_AND_START
    state = badmintonReducer(state, {
      type: 'END_AND_START',
      payload: { courtId: 'court-1', now: 2000, nextLineup },
    });

    // Trận mới đã vào sân, trận cũ đã vào history
    expect(state.courts[0].currentMatch?.team1).toEqual(['p5', 'p6']);
    expect(state.history.length).toBe(1);
    expect(state.players.find((p) => p.id === 'p1')?.gamesPlayed).toBe(1);

    // Thực hiện đúng 1 lần UNDO
    state = badmintonReducer(state, { type: 'UNDO' });

    // So sánh deep-equal các thành phần quan trọng
    expect(state.courts[0].currentMatch?.team1).toEqual(snapshotBefore.courts[0].currentMatch?.team1);
    expect(state.courts[0].currentMatch?.team2).toEqual(snapshotBefore.courts[0].currentMatch?.team2);
    expect(state.history.length).toBe(snapshotBefore.history.length);
    expect(state.players.map((p) => ({ id: p.id, games: p.gamesPlayed, wait: p.waitStreak }))).toEqual(
      snapshotBefore.players.map((p: Player) => ({ id: p.id, games: p.gamesPlayed, wait: p.waitStreak }))
    );
    expect(state.mixDebt).toEqual(snapshotBefore.mixDebt);
    expect(state.stats).toEqual(snapshotBefore.stats);
  });

  // =========================================================================
  // Test c: 20 lần SUGGEST_NEXT_UP không làm đầy undoStack
  // =========================================================================
  it('c) 20 lần SUGGEST_NEXT_UP không tạo snapshot undo', () => {
    let state = createInitialSessionState();
    expect(state.undoStack.length).toBe(0);

    for (let i = 0; i < 20; i++) {
      state = badmintonReducer(state, {
        type: 'SUGGEST_NEXT_UP',
        payload: { courtId: 'court-1', now: 1000 + i },
      });
    }

    // undoStack vẫn là 0 vì SUGGEST_NEXT_UP không tạo snapshot undo!
    expect(state.undoStack.length).toBe(0);
  });

  // =========================================================================
  // Test d: SET_NEXT_UP_SLOT -> slot MANUAL; trùng người -> return state
  // =========================================================================
  it('d) SET_NEXT_UP_SLOT -> lưu slot MANUAL; trùng người -> return state', () => {
    let state = createInitialSessionState();
    state.players = [
      createMockPlayer('p1', 'P1'),
      createMockPlayer('p2', 'P2'),
      createMockPlayer('p3', 'P3'),
      createMockPlayer('p4', 'P4'),
      createMockPlayer('p5', 'P5'),
    ];

    // Gán p1 vào slot 0
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 0, playerId: 'p1' },
    });

    const nextUp = state.courts[0].nextUp;
    expect(nextUp.slots[0]).toBe('p1');
    expect(nextUp.slotSource[0]).toBe('MANUAL');

    // Thử gán p1 vào slot 1 (trùng người trong cùng nextUp) -> BLOCK -> return state
    const stateBeforeDuplicate = state;
    const stateAfterDuplicate = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 1, playerId: 'p1' },
    });
    expect(stateAfterDuplicate).toBe(stateBeforeDuplicate);
  });

  // =========================================================================
  // Test e: PAUSE người trong nextUp -> chỉ đặt slot chứa người đó thành null
  // =========================================================================
  it('e) PAUSE người trong nextUp -> chỉ đặt đúng slot chứa người đó thành null, các slot khác giữ nguyên', () => {
    let state = createInitialSessionState();
    state.players = [
      createMockPlayer('p1', 'P1'),
      createMockPlayer('p2', 'P2'),
      createMockPlayer('p3', 'P3'),
      createMockPlayer('p4', 'P4'),
    ];

    // Gán p1..p4 vào Sân 1
    for (let i = 0; i < 4; i++) {
      state = badmintonReducer(state, {
        type: 'SET_NEXT_UP_SLOT',
        payload: { courtId: 'court-1', slotIndex: i, playerId: `p${i + 1}` },
      });
    }

    // Tạm nghỉ p1
    state = badmintonReducer(state, {
      type: 'PAUSE_PLAYER',
      payload: { playerId: 'p1' },
    });

    // Chỉ đúng slot chứa p1 thành null, 3 slot còn lại giữ nguyên 100%
    expect(state.courts[0].nextUp.slots[0]).toBeNull();
    expect(state.courts[0].nextUp.slotSource[0]).toBeNull();
    expect(state.courts[0].nextUp.slots[1]).toBe('p2');
    expect(state.courts[0].nextUp.slots[2]).toBe('p3');
    expect(state.courts[0].nextUp.slots[3]).toBe('p4');
  });

  // =========================================================================
  // Test f: REMOVE_PLAYER chặn người đang đánh; người đã có trận nhưng ngoài sân hoặc người mới -> xóa sạch khỏi buổi
  // =========================================================================
  it('f) REMOVE_PLAYER chặn người đang đánh; người đã có trận hoặc mới thêm ngoài sân -> xóa sạch khỏi buổi', () => {
    let state = createInitialSessionState();
    state.players = [
      createMockPlayer('pPlaying', 'Playing Player'),
      createMockPlayer('pPlayed', 'Played Player', 'M', 'tb', { gamesPlayed: 1 }),
      createMockPlayer('pNew', 'New Player'),
    ];

    state.courts[0].currentMatch = {
      type: 'SINGLES',
      team1: ['pPlaying'],
      team2: ['pOther'],
      slotSource: { pPlaying: 'AUTO', pOther: 'AUTO' },
      startedAt: 1000,
    };

    // 1. Thử xóa người đang trong currentMatch -> chặn, state không đổi
    const stateBefore1 = state;
    const stateAfter1 = badmintonReducer(state, {
      type: 'REMOVE_PLAYER',
      payload: { playerId: 'pPlaying' },
    });
    expect(stateAfter1).toBe(stateBefore1);

    // 2. Xóa người đã có gamesPlayed > 0 nhưng đang ngoài sân (rút khỏi buổi hôm nay) -> xóa thành công
    const stateAfter2 = badmintonReducer(state, {
      type: 'REMOVE_PLAYER',
      payload: { playerId: 'pPlayed' },
    });
    expect(stateAfter2.players.some((p) => p.id === 'pPlayed')).toBe(false);

    // 3. Xóa người mới thêm (chưa đánh trận nào, không đang đánh) -> xóa thành công
    const stateAfter3 = badmintonReducer(stateAfter2, {
      type: 'REMOVE_PLAYER',
      payload: { playerId: 'pNew' },
    });
    expect(stateAfter3.players.some((p) => p.id === 'pNew')).toBe(false);
  });

  // =========================================================================
  // Test g: Tắt sân đang đánh -> state không đổi; tắt sân trống -> reset nextUp
  // =========================================================================
  it('g) Tắt sân đang đánh -> state không đổi; tắt sân trống -> reset nextUp, xóa snooze', () => {
    let state = createInitialSessionState();
    state.courts[0].currentMatch = {
      type: 'SINGLES',
      team1: ['p1'],
      team2: ['p2'],
      slotSource: { p1: 'AUTO', p2: 'AUTO' },
      startedAt: 1000,
    };

    state.courts[1].nextUp = {
      type: 'SINGLES',
      slots: ['p3', 'p4'],
      slotSource: ['AUTO', 'AUTO'],
    };
    state.autoSinglesSnooze['court-2'] = { untilTs: 9999, queueSizeAtSnooze: 2 };

    // Tắt Sân 1 (đang có currentMatch) -> không cho phép, return state
    const stateBefore = state;
    const stateAfter = badmintonReducer(state, {
      type: 'UPDATE_COURT',
      payload: { courtId: 'court-1', updates: { isActive: false } },
    });
    expect(stateAfter).toBe(stateBefore);

    // Tắt Sân 2 (đang rảnh) -> thành công, nextUp bị reset rỗng, suggestCursor = 0, xóa snooze
    const stateAfterTurnOff2 = badmintonReducer(state, {
      type: 'UPDATE_COURT',
      payload: { courtId: 'court-2', updates: { isActive: false } },
    });

    const c2 = stateAfterTurnOff2.courts[1];
    expect(c2.isActive).toBe(false);
    expect(c2.nextUp.slots).toEqual([null, null]);
    expect(c2.suggestCursor).toBe(0);
    expect(stateAfterTurnOff2.autoSinglesSnooze['court-2']).toBeUndefined();
  });

  // =========================================================================
  // Test h: mixDebt đúng sau chuỗi START/END
  // =========================================================================
  it('h) mixDebt chính xác sau chuỗi START/END', () => {
    let state = createInitialSessionState();
    state.settings.matchMix = { doubles: 0.8, singles: 0.2 };
    state.players = [
      createMockPlayer('p1', 'P1'),
      createMockPlayer('p2', 'P2'),
      createMockPlayer('p3', 'P3'),
      createMockPlayer('p4', 'P4'),
    ];

    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: {
        courtId: 'court-1',
        lineup: {
          type: 'DOUBLES',
          team1: ['p1', 'p2'],
          team2: ['p3', 'p4'],
          slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
        },
        now: 1000,
      },
    });

    // mixDebt được cộng mix (0.8 / 0.2) và trừ 1 cho doubles (0.8 - 1 = -0.2)
    expect(Number(state.mixDebt.doubles.toFixed(2))).toBe(-0.2);
    expect(Number(state.mixDebt.singles.toFixed(2))).toBe(0.2);

    // Kết thúc trận
    state = badmintonReducer(state, {
      type: 'END_MATCH',
      payload: { courtId: 'court-1', now: 2000 },
    });
    expect(state.courts[0].currentMatch).toBeNull();
  });

  // =========================================================================
  // Test i: NEW_SESSION_KEEP_PLAYERS giữ người, xóa sạch lịch sử
  // =========================================================================
  it('i) NEW_SESSION_KEEP_PLAYERS giữ nguyên danh sách người chơi, xóa sạch lịch sử và trạng thái buổi cũ', () => {
    let state = createInitialSessionState();
    state.players = [
      createMockPlayer('p1', 'P1', 'M', 'tb', { gamesPlayed: 5, waitStreak: 2, status: 'PAUSED' }),
      createMockPlayer('p2', 'P2', 'F', 'tb+', { gamesPlayed: 3, singlesCount: 1 }),
    ];
    state.history = [
      {
        id: 'h1',
        courtId: 'court-1',
        type: 'SINGLES',
        team1: ['p1'],
        team2: ['p2'],
        slotSource: { p1: 'AUTO', p2: 'AUTO' },
        startedAt: 1000,
        endedAt: 2000,
        durationMinutes: 15,
      },
    ];
    state.mixDebt = { doubles: 2, singles: -1 };

    // Tạo buổi mới giữ người
    const newState = badmintonReducer(state, {
      type: 'NEW_SESSION_KEEP_PLAYERS',
      payload: { now: 5000 },
    });

    // Players giữ nguyên ID và Rank nhưng reset gamesPlayed, waitStreak, status trở về ACTIVE
    expect(newState.players.length).toBe(2);
    expect(newState.players[0].id).toBe('p1');
    expect(newState.players[0].gamesPlayed).toBe(0);
    expect(newState.players[0].waitStreak).toBe(0);
    expect(newState.players[0].status).toBe('ACTIVE');

    // History, mixDebt bị dọn sạch
    expect(newState.history).toEqual([]);
    expect(newState.mixDebt).toEqual({ doubles: 0, singles: 0 });
    expect((newState as any).courtPlanIndex).toBeUndefined();
    expect(newState.undoStack).toEqual([]);
    expect(newState.redoStack).toEqual([]);
  });

  // =========================================================================
  // Test j: DELETE_HISTORY_MATCH rồi so stats với buildStatsFromHistory(history còn lại)
  // =========================================================================
  it('j) DELETE_HISTORY_MATCH trừ số trận và xây dựng lại stats chuẩn xác từ lịch sử còn lại', () => {
    let state = createInitialSessionState();
    state.players = [
      createMockPlayer('p1', 'P1', 'M', 'tb', { gamesPlayed: 2, singlesCount: 1 }),
      createMockPlayer('p2', 'P2', 'M', 'tb', { gamesPlayed: 2, singlesCount: 1 }),
      createMockPlayer('p3', 'P3', 'M', 'tb', { gamesPlayed: 1 }),
      createMockPlayer('p4', 'P4', 'M', 'tb', { gamesPlayed: 1 }),
    ];

    const match1 = {
      id: 'm1',
      courtId: 'court-1',
      type: 'SINGLES' as const,
      team1: ['p1'],
      team2: ['p2'],
      slotSource: { p1: 'AUTO' as const, p2: 'AUTO' as const },
      startedAt: 1000,
      endedAt: 2000,
      durationMinutes: 15,
    };

    const match2 = {
      id: 'm2',
      courtId: 'court-1',
      type: 'DOUBLES' as const,
      team1: ['p1', 'p3'],
      team2: ['p2', 'p4'],
      slotSource: { p1: 'AUTO' as const, p3: 'AUTO' as const, p2: 'AUTO' as const, p4: 'AUTO' as const },
      startedAt: 3000,
      endedAt: 4000,
      durationMinutes: 15,
    };

    state.history = [match1, match2];
    state.stats = buildStatsFromHistory(state.history);

    // Xóa match1 (trận đơn giữa p1 và p2)
    const afterDeleteState = badmintonReducer(state, {
      type: 'DELETE_HISTORY_MATCH',
      payload: { matchId: 'm1' },
    });

    expect(afterDeleteState.history.length).toBe(1);
    expect(afterDeleteState.history[0].id).toBe('m2');

    // p1 và p2 được trừ 1 gamesPlayed và 1 singlesCount
    const p1 = afterDeleteState.players.find((p) => p.id === 'p1');
    const p2 = afterDeleteState.players.find((p) => p.id === 'p2');
    expect(p1?.gamesPlayed).toBe(1);
    expect(p1?.singlesCount).toBe(0);
    expect(p2?.gamesPlayed).toBe(1);
    expect(p2?.singlesCount).toBe(0);

    // stats được tái cấu trúc khớp 100% với buildStatsFromHistory của match2
    const expectedStats = buildStatsFromHistory([match2]);
    expect(afterDeleteState.stats).toEqual(expectedStats);
  });

  // =========================================================================
  // Test k: Reducer chạy 2 lần với cùng chuỗi action cho cùng kết quả (hoàn toàn thuần)
  // =========================================================================
  it('k) Reducer thuần túy tất định: chạy 2 lần với cùng chuỗi action cho cùng kết quả 100%', () => {
    const runActions = (): BadmintonSessionState => {
      let state = createInitialSessionState();
      state = badmintonReducer(state, {
        type: 'ADD_PLAYERS',
        payload: {
          players: [
            createMockPlayer('p1', 'P1'),
            createMockPlayer('p2', 'P2'),
            createMockPlayer('p3', 'P3'),
            createMockPlayer('p4', 'P4'),
          ],
          now: 1000,
        },
      });

      state = badmintonReducer(state, {
        type: 'ADD_PAIR_RULE',
        payload: {
          rule: { id: 'rule1', playerAId: 'p1', playerBId: 'p2', type: 'LOCK_PARTNER' },
        },
      });

      state = badmintonReducer(state, {
        type: 'START_MATCH',
        payload: {
          courtId: 'court-1',
          lineup: {
            type: 'DOUBLES',
            team1: ['p1', 'p2'],
            team2: ['p3', 'p4'],
            slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
          },
          now: 2000,
        },
      });

      state = badmintonReducer(state, {
        type: 'END_MATCH',
        payload: { courtId: 'court-1', now: 3000 },
      });

      return state;
    };

    const run1 = runActions();
    const run2 = runActions();

    // Loại bỏ undoStack/redoStack để so sánh snapshot trạng thái
    const { undoStack: _u1, redoStack: _r1, ...state1 } = run1;
    const { undoStack: _u2, redoStack: _r2, ...state2 } = run2;

    expect(state1).toEqual(state2);
  });
});
