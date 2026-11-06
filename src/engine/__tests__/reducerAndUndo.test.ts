import { describe, expect, it } from 'vitest';
import type { Lineup, Player } from '../../types/badminton';
import {
  badmintonReducer,
  createDefaultCourts,
  createInitialSessionState,
} from '../sessionReducer';

describe('Badminton Session Reducer & Undo/Redo Engine', () => {
  const makePlayer = (id: string, name: string, sex: 'M' | 'F' = 'M', rank: any = 'tb'): Player => ({
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
  });

  it('định nghĩa rõ waitStreak: khi trận BẮT ĐẦU, người vào trận reset 0, người rảnh +1', () => {
    let state = createInitialSessionState();
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
      makePlayer('p5', 'P5'), // rảnh
      makePlayer('p6', 'P6'), // rảnh
    ];

    const lineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p3', 'p4'],
      slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
    };

    // Bắt đầu trận ở sân 1
    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: { courtId: 'court-1', lineup, now: 2000 },
    });

    const p1 = state.players.find((p: Player) => p.id === 'p1');
    const p5 = state.players.find((p: Player) => p.id === 'p5');
    const p6 = state.players.find((p: Player) => p.id === 'p6');

    // Người vào trận có waitStreak = 0
    expect(p1?.waitStreak).toBe(0);
    // Người rảnh có waitStreak tăng lên 1
    expect(p5?.waitStreak).toBe(1);
    expect(p6?.waitStreak).toBe(1);

    // Bắt đầu trận tiếp theo ở sân 2 cho p5 và p6 đánh đơn
    const singlesLineup: Lineup = {
      type: 'SINGLES',
      team1: ['p5'],
      team2: ['p6'],
      slotSource: { p5: 'AUTO', p6: 'AUTO' },
    };

    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: { courtId: 'court-2', lineup: singlesLineup, now: 3000 },
    });

    const p5After = state.players.find((p: Player) => p.id === 'p5');
    expect(p5After?.waitStreak).toBe(0);
  });

  it('quản lý undoStack tối đa 30 snapshot và hoàn tác/phục hồi chuẩn xác', () => {
    let state = createInitialSessionState();
    state.players = [makePlayer('p1', 'P1')];

    // Thực hiện 5 lần đổi rank
    for (let i = 1; i <= 5; i++) {
      state = badmintonReducer(state, {
        type: 'EDIT_RANK',
        payload: { playerId: 'p1', rank: 'tb+' },
      });
    }

    expect(state.undoStack.length).toBe(5);

    // Thực hiện UNDO
    state = badmintonReducer(state, { type: 'UNDO' });
    expect(state.undoStack.length).toBe(4);
    expect(state.redoStack.length).toBe(1);

    // Thực hiện REDO
    state = badmintonReducer(state, { type: 'REDO' });
    expect(state.undoStack.length).toBe(5);
    expect(state.redoStack.length).toBe(0);

    // Kiểm tra giới hạn 30 snapshot
    for (let i = 0; i < 40; i++) {
      state = badmintonReducer(state, {
        type: 'UPDATE_SETTINGS',
        payload: { settings: { maleBonus: 1.5 + i * 0.1 } },
      });
    }
    expect(state.undoStack.length).toBe(30);
  });

  it('SET_NEXT_UP_SLOT đánh dấu slotSource thành MANUAL', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
    ];

    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 0, playerId: 'p1' },
    });

    const nextUp = state.courts[0].nextUp;
    expect(nextUp.slots[0]).toBe('p1');
    expect(nextUp.slotSource[0]).toBe('MANUAL');
  });

  it('SHARED_POOL: Nhóm đầu hàng readyQueue tự động đi vào sân khi trận kết thúc', () => {
    let state = createInitialSessionState();
    state.settings.courtMode = 'SHARED_POOL';
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
      makePlayer('p5', 'P5'),
      makePlayer('p6', 'P6'),
      makePlayer('p7', 'P7'),
      makePlayer('p8', 'P8'),
    ];

    const currentLineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p3', 'p4'],
      slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
    };

    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: { courtId: 'court-1', lineup: currentLineup, now: 1000 },
    });

    const queuedLineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p5', 'p6'],
      team2: ['p7', 'p8'],
      slotSource: { p5: 'AUTO', p6: 'AUTO', p7: 'AUTO', p8: 'AUTO' },
    };

    // Đưa trận tiếp theo vào readyQueue
    state = badmintonReducer(state, {
      type: 'ENQUEUE_READY_QUEUE',
      payload: { lineup: queuedLineup, isLockedByHost: false, now: 1100 },
    });

    expect(state.readyQueue.length).toBe(1);

    // Kết thúc trận sân 1
    state = badmintonReducer(state, {
      type: 'END_MATCH',
      payload: { courtId: 'court-1', now: 2000 },
    });

    // Trận trong readyQueue được tự động nâng thành nextUp của court-1
    expect(state.courts[0].nextUp).not.toBeNull();
    expect(state.courts[0].nextUp.slots.slice(0, 2)).toEqual(['p5', 'p6']);
    expect(state.readyQueue.length).toBe(0);
  });
});
