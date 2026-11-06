import { describe, it, expect } from 'vitest';
import { suggestNextUpForCourt } from '../matchmaker';
import { createEmptyNextUp } from '../nextUp';
import { describeLineup } from '../validateLineup';
import { stepRankUp, stepRankDown, ORDERED_RANKS } from '../skillConfig';
import type {
  BadmintonSessionState,
  Court,
  Player,
  Lineup,
} from '../../types/badminton';
import {
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
});
