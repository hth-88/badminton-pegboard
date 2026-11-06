import { describe, expect, it } from 'vitest';
import type { Court, PairRule, Player, SessionSettings } from '../../types/badminton';
import { DEFAULT_PENALTY_WEIGHTS } from '../../types/badminton';
import { generateSuggestedMatch } from '../matchmaker';
import { createEmptyNextUp } from '../nextUp';

describe('Pair Rules Enforcement in Matchmaking Engine', () => {
  const defaultSettings: SessionSettings = {
    maleBonus: 1.5,
    courtMode: 'SHARED_POOL',
    matchMix: { doubles: 1, singles: 0 },
    autoSingles: 'OFF',
    autoSinglesSnoozeMin: 5,
    preferMixedDoubles: true,
    weights: { ...DEFAULT_PENALTY_WEIGHTS },
  };

  const courts: Court[] = [
    { id: 'court-1', name: 'Sân 1', isActive: true, policy: 'MIX', currentMatch: null, nextUp: createEmptyNextUp('DOUBLES'), suggestCursor: 0 },
    { id: 'court-2', name: 'Sân 2', isActive: true, policy: 'MIX', currentMatch: null, nextUp: createEmptyNextUp('DOUBLES'), suggestCursor: 0 },
  ];

  const makePlayer = (id: string, name: string, sex: 'M' | 'F', rank: any): Player => ({
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

  it('LOCK_PARTNER: A và B luôn đứng cùng đội khi cả hai đều rảnh', () => {
    const players: Player[] = [
      makePlayer('p1', 'Nam 1', 'M', 'tb'),
      makePlayer('p2', 'Nữ 1', 'F', 'tb'),
      makePlayer('p3', 'Nam 2', 'M', 'tb'),
      makePlayer('p4', 'Nam 3', 'M', 'tb'),
      makePlayer('p5', 'Nữ 2', 'F', 'tb'),
      makePlayer('p6', 'Nam 4', 'M', 'tb'),
    ];

    const pairRules: PairRule[] = [
      {
        id: 'rule1',
        playerAId: 'p1',
        playerBId: 'p2',
        type: 'LOCK_PARTNER',
      },
    ];

    // Chạy gợi ý
    const suggestion = generateSuggestedMatch('court-1', players, courts, [], pairRules, defaultSettings);
    expect(suggestion).not.toBeNull();

    if (suggestion) {
      const { team1, team2 } = suggestion;
      const inTeam1 = team1.includes('p1') || team1.includes('p2');
      const inTeam2 = team2.includes('p1') || team2.includes('p2');

      if (inTeam1 || inTeam2) {
        // Cả p1 và p2 phải cùng 1 đội
        const bothInT1 = team1.includes('p1') && team1.includes('p2');
        const bothInT2 = team2.includes('p1') && team2.includes('p2');
        expect(bothInT1 || bothInT2).toBe(true);
      }
    }
  });

  it('LOCK_PARTNER: loại bỏ các phương án chỉ có A mà không có B khi cả 2 đều rảnh', () => {
    const players: Player[] = [
      makePlayer('p1', 'P1', 'M', 'tb'),
      makePlayer('p2', 'P2', 'F', 'tb'),
      makePlayer('p3', 'P3', 'M', 'tb'),
      makePlayer('p4', 'P4', 'M', 'tb'),
      makePlayer('p5', 'P5', 'F', 'tb'),
    ];

    const pairRules: PairRule[] = [
      {
        id: 'rule1',
        playerAId: 'p1',
        playerBId: 'p2',
        type: 'LOCK_PARTNER',
      },
    ];

    const suggestion = generateSuggestedMatch('court-1', players, courts, [], pairRules, defaultSettings);
    expect(suggestion).not.toBeNull();

    if (suggestion) {
      const matchPlayers = new Set([...suggestion.team1, ...suggestion.team2]);
      if (matchPlayers.has('p1')) {
        expect(matchPlayers.has('p2')).toBe(true);
      }
      if (matchPlayers.has('p2')) {
        expect(matchPlayers.has('p1')).toBe(true);
      }
    }
  });

  it('AVOID_PARTNER: cấm 2 người đứng cùng đội', () => {
    const players: Player[] = [
      makePlayer('p1', 'P1', 'M', 'tb'),
      makePlayer('p2', 'P2', 'M', 'tb'),
      makePlayer('p3', 'P3', 'M', 'tb'),
      makePlayer('p4', 'P4', 'M', 'tb'),
    ];

    const pairRules: PairRule[] = [
      {
        id: 'rule2',
        playerAId: 'p1',
        playerBId: 'p2',
        type: 'AVOID_PARTNER',
      },
    ];

    const suggestion = generateSuggestedMatch('court-1', players, courts, [], pairRules, defaultSettings);
    expect(suggestion).not.toBeNull();

    if (suggestion) {
      const { team1, team2 } = suggestion;
      const sameT1 = team1.includes('p1') && team1.includes('p2');
      const sameT2 = team2.includes('p1') && team2.includes('p2');
      expect(sameT1).toBe(false);
      expect(sameT2).toBe(false);
      expect((team1.includes('p1') && team2.includes('p2')) || (team2.includes('p1') && team1.includes('p2'))).toBe(true);
    }
  });

  it('AVOID_MATCH: ưu tiên không cho vào chung sân khi có người thay thế', () => {
    const players: Player[] = [
      makePlayer('p1', 'P1', 'M', 'tb'),
      makePlayer('p2', 'P2', 'M', 'tb'),
      makePlayer('p3', 'P3', 'M', 'tb'),
      makePlayer('p4', 'P4', 'M', 'tb'),
      makePlayer('p5', 'P5', 'M', 'tb'),
      makePlayer('p6', 'P6', 'M', 'tb'),
    ];

    const pairRules: PairRule[] = [
      {
        id: 'rule3',
        playerAId: 'p1',
        playerBId: 'p2',
        type: 'AVOID_MATCH',
      },
    ];

    const suggestion = generateSuggestedMatch('court-1', players, courts, [], pairRules, defaultSettings);
    expect(suggestion).not.toBeNull();

    if (suggestion) {
      const matchPlayers = new Set([...suggestion.team1, ...suggestion.team2]);
      const bothInMatch = matchPlayers.has('p1') && matchPlayers.has('p2');
      expect(bothInMatch).toBe(false);
    }
  });
});
