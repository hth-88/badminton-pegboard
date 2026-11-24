import { describe, it, expect } from 'vitest';
import { suggestNextUpForCourt } from '../matchmaker';
import { createEmptyNextUp, isNextUpComplete, isNextUpEmpty } from '../nextUp';
import { describeLineup } from '../validateLineup';
import { stepRankUp, stepRankDown, ORDERED_RANKS } from '../skillConfig';
import type {
  BadmintonSessionState,
  Court,
  Player,
  Lineup,
} from '../../types/badminton';
import {
  badmintonReducer,
  createDefaultCourts,
  createInitialSessionState,
  DEFAULT_SETTINGS,
} from '../sessionReducer';

function createMockPlayer(id: string, name: string, rank: any = 'tb', sex: 'M' | 'F' = 'M'): Player {
  return {
    id,
    name,
    sex,
    rank,
    status: 'ACTIVE',
    assignedPool: 'ALL',
    noSingles: false,
    joinedAt: Date.now(),
    gamesPlayed: 0,
    virtualGamesOffset: 0,
    waitStreak: 0,
    lastPlayedAt: 0,
    singlesCount: 0,
  };
}

describe('Tính năng Dự kiến Next Up (Mục 1) & Tác dụng tức thì MaleBonus (Mục 2)', () => {
  it('Mục 1: Sân có 4 người đang đánh, 0 người ở hàng chờ -> Luôn gợi ý Next Up dự kiến với isProjectedFromCurrentMatch = true và tự đảo cặp', () => {
    const players: Player[] = [
      createMockPlayer('p1', 'Player 1'),
      createMockPlayer('p2', 'Player 2'),
      createMockPlayer('p3', 'Player 3'),
      createMockPlayer('p4', 'Player 4'),
    ];

    const courts: Court[] = [
      {
        id: 'court-1',
        name: 'Sân 1',
        isActive: true,
        policy: 'DOUBLES_ONLY',
        forcedType: null,
        currentMatch: {
          type: 'DOUBLES',
          team1: ['p1', 'p2'],
          team2: ['p3', 'p4'],
          slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
          startedAt: 1000,
        },
        nextUp: createEmptyNextUp('DOUBLES'),
        suggestCursor: 0,
      },
    ];

    const state: BadmintonSessionState = {
      ...createInitialSessionState(),
      players,
      courts,
      settings: DEFAULT_SETTINGS,
    };

    const nextUp = suggestNextUpForCourt(state, 'court-1', 2000);

    // 1. Phải trả về NextUpDraft đủ 4 người
    expect(nextUp).not.toBeNull();
    if (nextUp) {
      expect(nextUp.slots.length).toBe(4);
      expect(nextUp.slots.every(Boolean)).toBe(true);

      // 2. Phải đảo cặp: KHÔNG lặp lại cặp p1&p2 và p3&p4
      const [s0, s1, s2, s3] = nextUp.slots as string[];
      const p1Partner = [s0, s1].includes('p1')
        ? (s0 === 'p1' ? s1 : s0)
        : (s2 === 'p1' ? s3 : s2);

      // Đồng đội của p1 ở trận mới phải là p3 hoặc p4, KHÔNG được là p2
      expect(p1Partner).not.toBe('p2');
      expect(['p3', 'p4']).toContain(p1Partner);
    }
  });

  it('Mục 2: Thay đổi settings.maleBonus có tác dụng tức thì lên describeLineup', () => {
    // p1: Nam TB (skill: 12.0 + maleBonus)
    // p2: Nữ TB (skill: 12.0)
    const players: Player[] = [
      createMockPlayer('p1', 'Nam TB', 'tb', 'M'),
      createMockPlayer('p2', 'Nữ TB', 'tb', 'F'),
    ];

    const lineup: Lineup = {
      type: 'SINGLES',
      team1: ['p1'],
      team2: ['p2'],
      slotSource: { p1: 'AUTO', p2: 'AUTO' },
    };

    // Khi maleBonus = 1.5
    const state1: BadmintonSessionState = {
      ...createInitialSessionState(),
      players,
      settings: {
        ...DEFAULT_SETTINGS,
        maleBonus: 1.5,
      },
    };
    const desc1 = describeLineup(lineup, state1);
    expect(desc1.team1Skill).toBe(11.5); // 10.0 + 1.5
    expect(desc1.team2Skill).toBe(10.0); // 10.0 + 0
    expect(desc1.diff).toBe(1.5);

    // Khi maleBonus nâng lên 3.0
    const state2: BadmintonSessionState = {
      ...createInitialSessionState(),
      players,
      settings: {
        ...DEFAULT_SETTINGS,
        maleBonus: 3.0,
      },
    };
    const desc2 = describeLineup(lineup, state2);
    expect(desc2.team1Skill).toBe(13.0); // 10.0 + 3.0
    expect(desc2.team2Skill).toBe(10.0);
    expect(desc2.diff).toBe(3.0);
    expect(desc2.label).toBe('Lệch nhiều');
  });

  it('Mục 3: stepRankUp và stepRankDown hoạt động chuẩn xác qua 12 bậc', () => {
    // Đáy: newbie không thể giảm nữa
    expect(stepRankDown('newbie')).toBe('newbie');
    expect(stepRankUp('newbie')).toBe('y-');

    // Giữa: tb tăng lên tb+, giảm xuống tb-
    expect(stepRankUp('tb')).toBe('tb+');
    expect(stepRankDown('tb')).toBe('tb-');

    // Đỉnh: tbk không thể tăng nữa
    expect(stepRankUp('tbk')).toBe('tbk');
    expect(stepRankDown('tbk')).toBe('tb++');

    // Kiểm tra tính lũy tiến liên tục
    let r = ORDERED_RANKS[0];
    for (let i = 0; i < ORDERED_RANKS.length - 1; i++) {
      r = stepRankUp(r);
      expect(r).toBe(ORDERED_RANKS[i + 1]);
    }
  });

  it('Mục B1: 8 người / 2 sân SHARED_POOL (0 người chờ) -> START_MATCH sân 2 không tự điền lại 4 người cũ, cả 2 sân đều có nextUp trống', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(2);
    state.settings.courtMode = 'SHARED_POOL';
    state.players = Array.from({ length: 8 }, (_, i) =>
      createMockPlayer(`p${i + 1}`, `Player ${i + 1}`)
    );

    // Sân 1 bắt đầu trận với p1..p4 -> ngoài sân còn p5..p8 nên tự gợi ý p5..p8 cho Sân 1
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
    expect(isNextUpComplete(state.courts[0].nextUp)).toBe(true);

    // Sân 2 bắt đầu trận với p5..p8 -> lúc này 0 người chờ, 2 sân đang đánh -> Sân 2 phải để trống nextUp (không tự nhốt 4 người cũ), đồng thời Sân 1 bị dọn người đã vào Sân 2
    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: {
        courtId: 'court-2',
        lineup: {
          type: 'DOUBLES',
          team1: ['p5', 'p6'],
          team2: ['p7', 'p8'],
          slotSource: { p5: 'MANUAL', p6: 'MANUAL', p7: 'MANUAL', p8: 'MANUAL' },
        },
        now: 2000,
      },
    });

    expect(isNextUpEmpty(state.courts[0].nextUp)).toBe(true);
    expect(isNextUpEmpty(state.courts[1].nextUp)).toBe(true);
  });

  it('Mục B1: sau khi cả 2 sân END_MATCH (8 người rảnh) -> SUGGEST_NEXT_UP vẫn gợi ý bình thường và có thể trộn người giữa 2 sân', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(2);
    state.settings.courtMode = 'SHARED_POOL';
    state.players = Array.from({ length: 8 }, (_, i) =>
      createMockPlayer(`p${i + 1}`, `Player ${i + 1}`)
    );

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
    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: {
        courtId: 'court-2',
        lineup: {
          type: 'DOUBLES',
          team1: ['p5', 'p6'],
          team2: ['p7', 'p8'],
          slotSource: { p5: 'MANUAL', p6: 'MANUAL', p7: 'MANUAL', p8: 'MANUAL' },
        },
        now: 2000,
      },
    });

    state = badmintonReducer(state, {
      type: 'END_MATCH',
      payload: { courtId: 'court-1', now: 10000 },
    });
    state = badmintonReducer(state, {
      type: 'END_MATCH',
      payload: { courtId: 'court-2', now: 11000 },
    });

    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-1', now: 12000 },
    });

    expect(isNextUpComplete(state.courts[0].nextUp)).toBe(true);
  });

  it('Mục B1 ngoại lệ: 4 người / 1 sân đang chạy (kể cả khi sân 2 active nhưng trống) HOẶC chế độ SPLIT_COURT 8 người / 2 sân -> START_MATCH vẫn tự điền nextUp dự kiến như cũ', () => {
    // Ngoại lệ 1: 4 người trên Sân 1, Sân 2 active nhưng trống
    let stateSinglePlaying = createInitialSessionState();
    stateSinglePlaying.courts = createDefaultCourts(2);
    stateSinglePlaying.settings.courtMode = 'SHARED_POOL';
    stateSinglePlaying.players = Array.from({ length: 4 }, (_, i) =>
      createMockPlayer(`p${i + 1}`, `Player ${i + 1}`)
    );

    stateSinglePlaying = badmintonReducer(stateSinglePlaying, {
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
    expect(isNextUpComplete(stateSinglePlaying.courts[0].nextUp)).toBe(true);

    // Ngoại lệ 2: SPLIT_COURT 8 người / 2 sân
    let stateSplit = createInitialSessionState();
    stateSplit.courts = createDefaultCourts(2);
    stateSplit.settings.courtMode = 'SPLIT_COURT';
    stateSplit.players = Array.from({ length: 8 }, (_, i) => ({
      ...createMockPlayer(`p${i + 1}`, `Player ${i + 1}`),
      assignedPool: i < 4 ? 'court-1' : 'court-2',
    }));

    stateSplit = badmintonReducer(stateSplit, {
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
    stateSplit = badmintonReducer(stateSplit, {
      type: 'START_MATCH',
      payload: {
        courtId: 'court-2',
        lineup: {
          type: 'DOUBLES',
          team1: ['p5', 'p6'],
          team2: ['p7', 'p8'],
          slotSource: { p5: 'MANUAL', p6: 'MANUAL', p7: 'MANUAL', p8: 'MANUAL' },
        },
        now: 2000,
      },
    });

    expect(isNextUpComplete(stateSplit.courts[0].nextUp)).toBe(true);
    expect(isNextUpComplete(stateSplit.courts[1].nextUp)).toBe(true);
  });

  it('Mục B1 thao tác tay: khi cả 2 sân SHARED_POOL đang đánh (0 người chờ), Host bấm tay SUGGEST_NEXT_UP trên sân 1 vẫn gợi ý đảo cặp 4 người sân 1 được', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(2);
    state.settings.courtMode = 'SHARED_POOL';
    state.players = Array.from({ length: 8 }, (_, i) =>
      createMockPlayer(`p${i + 1}`, `Player ${i + 1}`)
    );

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
    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: {
        courtId: 'court-2',
        lineup: {
          type: 'DOUBLES',
          team1: ['p5', 'p6'],
          team2: ['p7', 'p8'],
          slotSource: { p5: 'MANUAL', p6: 'MANUAL', p7: 'MANUAL', p8: 'MANUAL' },
        },
        now: 2000,
      },
    });

    expect(isNextUpEmpty(state.courts[0].nextUp)).toBe(true);

    // Host bấm tay "Gợi ý kèo" trên Sân 1
    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-1', now: 3000 },
    });

    expect(isNextUpComplete(state.courts[0].nextUp)).toBe(true);
    expect(new Set(state.courts[0].nextUp.slots)).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
    // Sân 2 vẫn giữ nguyên trống (tuân thủ Rule 2)
    expect(isNextUpEmpty(state.courts[1].nextUp)).toBe(true);
  });
});
