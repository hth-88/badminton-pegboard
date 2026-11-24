import { describe, expect, it } from 'vitest';
import type { MatchBet, Player } from '../../types/badminton';
import { badmintonReducer, createInitialSessionState } from '../sessionReducer';
import { migrateSessionState } from '../stateMigration';
import { calculateLopsidedHistoryPenalty, generateDoublesProposals } from '../matchmaker';
import { areSessionSnapshotsEqual } from '../../hooks/useCloudRoom';

function makePlayer(id: string, name: string, rank: Player['rank'] = 'tb'): Player {
  return {
    id,
    name,
    sex: 'M',
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
  };
}

const SAMPLE_BET: MatchBet = {
  category: 'DRINK',
  label: '1 nước lọc',
  quantity: 1,
  unit: 'PER_PLAYER',
  amountVnd: 0,
  payoutMode: 'TEAM_TO_TEAM',
};

describe('Match Result, Betting & Lopsided Penalty (Nhóm 1A + 2A)', () => {
  it('1. SET_COURT_BET gắn và gỡ kèo độ trên sân đang đánh, khi END_MATCH tự giữ lại trong history', () => {
    let state = createInitialSessionState();
    state = {
      ...state,
      players: [makePlayer('p1', 'A'), makePlayer('p2', 'B'), makePlayer('p3', 'C'), makePlayer('p4', 'D')],
    };
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
      type: 'SET_COURT_BET',
      payload: { courtId: 'court-1', bet: SAMPLE_BET },
    });
    expect(state.courts[0].currentMatch?.bet).toEqual(SAMPLE_BET);

    state = badmintonReducer(state, {
      type: 'END_MATCH',
      payload: { courtId: 'court-1', now: 2000 },
    });

    expect(state.history).toHaveLength(1);
    expect(state.history[0].bet).toEqual(SAMPLE_BET);
    expect(state.history[0].betWinner).toBeNull();
  });

  it('2. SET_COURT_BET trả nguyên state khi sân trống và xóa bet khi truyền null', () => {
    const emptyState = createInitialSessionState();
    const unchanged = badmintonReducer(emptyState, {
      type: 'SET_COURT_BET',
      payload: { courtId: 'court-1', bet: SAMPLE_BET },
    });
    expect(unchanged).toBe(emptyState);

    let activeState = {
      ...emptyState,
      players: [makePlayer('p1', 'A'), makePlayer('p2', 'B'), makePlayer('p3', 'C'), makePlayer('p4', 'D')],
    };
    activeState = badmintonReducer(activeState, {
      type: 'START_MATCH',
      payload: {
        courtId: 'court-1',
        lineup: {
          type: 'DOUBLES',
          team1: ['p1', 'p2'],
          team2: ['p3', 'p4'],
          slotSource: {},
        },
        now: 1000,
      },
    });
    activeState = badmintonReducer(activeState, {
      type: 'SET_COURT_BET',
      payload: { courtId: 'court-1', bet: SAMPLE_BET },
    });
    activeState = badmintonReducer(activeState, {
      type: 'SET_COURT_BET',
      payload: { courtId: 'court-1', bet: null },
    });
    expect(activeState.courts[0].currentMatch?.bet).toBeUndefined();
  });

  it('3. UPDATE_MATCH_RESULT cập nhật tỉ số, độ cân kèo, kèo độ + đội thắng và hỗ trợ Undo', () => {
    let state = createInitialSessionState();
    state = {
      ...state,
      players: [makePlayer('p1', 'A'), makePlayer('p2', 'B'), makePlayer('p3', 'C'), makePlayer('p4', 'D')],
    };
    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: {
        courtId: 'court-1',
        lineup: { type: 'DOUBLES', team1: ['p1', 'p2'], team2: ['p3', 'p4'], slotSource: {} },
        now: 1000,
      },
    });
    state = badmintonReducer(state, {
      type: 'END_MATCH',
      payload: { courtId: 'court-1', now: 2000 },
    });
    const matchId = state.history[0].id;

    state = badmintonReducer(state, {
      type: 'UPDATE_MATCH_RESULT',
      payload: {
        matchId,
        score: { team1: 21, team2: 11 },
        balanceRating: 'LOPSIDED',
        bet: { ...SAMPLE_BET, amountVnd: 20000, category: 'MONEY', label: '20k/người' },
        betWinner: 1,
      },
    });

    expect(state.history[0].score).toEqual({ team1: 21, team2: 11 });
    expect(state.history[0].balanceRating).toBe('LOPSIDED');
    expect(state.history[0].betWinner).toBe(1);

    state = badmintonReducer(state, { type: 'UNDO' });
    expect(state.history[0].score).toBeUndefined();
    expect(state.history[0].balanceRating).toBeUndefined();
    expect(state.history[0].bet).toBeUndefined();
  });

  it('4. migrateSessionState bảo toàn đầy đủ score, balanceRating, bet, betWinner và đảm bảo idempotent', () => {
    const raw = createInitialSessionState();
    raw.history = [
      {
        id: 'm1',
        courtId: 'court-1',
        type: 'DOUBLES',
        team1: ['p1', 'p2'],
        team2: ['p3', 'p4'],
        slotSource: {},
        startedAt: 1000,
        endedAt: 2000,
        durationMinutes: 12,
        score: { team1: 21, team2: 18 },
        balanceRating: 'BALANCED',
        bet: SAMPLE_BET,
        betWinner: 2,
      },
    ];

    const once = migrateSessionState(raw);
    const twice = migrateSessionState(once);
    expect(once.history[0].score).toEqual({ team1: 21, team2: 18 });
    expect(once.history[0].balanceRating).toBe('BALANCED');
    expect(once.history[0].bet).toEqual(SAMPLE_BET);
    expect(once.history[0].betWinner).toBe(2);
    expect(twice).toEqual(once);
  });

  it('5. migrateSessionState lọc bỏ dữ liệu tỉ số hoặc kèo bị hỏng', () => {
    const raw = createInitialSessionState() as any;
    raw.history = [
      {
        id: 'm1',
        courtId: 'court-1',
        type: 'DOUBLES',
        team1: ['p1', 'p2'],
        team2: ['p3', 'p4'],
        slotSource: {},
        startedAt: 1000,
        endedAt: 2000,
        durationMinutes: 12,
        score: { team1: -5, team2: 21 },
        balanceRating: 'UNKNOWN',
        bet: { category: 'DRINK', label: '' },
      },
    ];

    const migrated = migrateSessionState(raw);
    expect(migrated.history[0].score).toBeUndefined();
    expect(migrated.history[0].balanceRating).toBeUndefined();
    expect(migrated.history[0].bet).toBeUndefined();
  });

  it('6. areSessionSnapshotsEqual phát hiện thay đổi currentMatch.bet, history.score, history.betWinner và promptPostMatchReview', () => {
    const base = createInitialSessionState();
    base.courts[0].currentMatch = {
      id: 'm_live',
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p3', 'p4'],
      slotSource: {},
      startedAt: 1000,
    };
    base.history = [
      {
        id: 'm1',
        courtId: 'court-1',
        type: 'DOUBLES',
        team1: ['p1', 'p2'],
        team2: ['p3', 'p4'],
        slotSource: {},
        startedAt: 100,
        endedAt: 500,
        durationMinutes: 10,
      },
    ];

    const withBet = structuredClone(base);
    withBet.courts[0].currentMatch!.bet = SAMPLE_BET;
    expect(areSessionSnapshotsEqual(base, withBet)).toBe(false);

    const withScore = structuredClone(base);
    withScore.history[0].score = { team1: 21, team2: 15 };
    expect(areSessionSnapshotsEqual(base, withScore)).toBe(false);

    const withSetting = structuredClone(base);
    withSetting.settings.promptPostMatchReview = false;
    expect(areSessionSnapshotsEqual(base, withSetting)).toBe(false);
  });

  it('7. calculateLopsidedHistoryPenalty trả 0 khi chưa có trận chênh lệch và phạt nặng khi trùng đội hình LOPSIDED / thua >= 10đ', () => {
    expect(calculateLopsidedHistoryPenalty(['p1', 'p2'], ['p3', 'p4'], [])).toBe(0);

    const lopsidedHistory = [
      {
        id: 'm1',
        courtId: 'court-1',
        type: 'DOUBLES' as const,
        team1: ['p1', 'p2'],
        team2: ['p3', 'p4'],
        slotSource: {},
        startedAt: 100,
        endedAt: 200,
        durationMinutes: 10,
        score: { team1: 21, team2: 8 },
        balanceRating: 'LOPSIDED' as const,
      },
    ];

    expect(
      calculateLopsidedHistoryPenalty(['p1', 'p2'], ['p3', 'p4'], lopsidedHistory)
    ).toBe(1200);
    expect(
      calculateLopsidedHistoryPenalty(['p1', 'p2'], ['p5', 'p6'], lopsidedHistory)
    ).toBe(350);
    expect(
      calculateLopsidedHistoryPenalty(['p1', 'p3'], ['p2', 'p4'], lopsidedHistory)
    ).toBe(0);
  });

  it('8. generateDoublesProposals tránh lặp lại cặp vừa bị gắn LOPSIDED để chọn thế cân hơn', () => {
    const players = [
      makePlayer('p1', 'A', 'tb'),
      makePlayer('p2', 'B', 'tb'),
      makePlayer('p3', 'C', 'tb'),
      makePlayer('p4', 'D', 'tb'),
    ];
    let state = createInitialSessionState();
    state.players = players;
    state.history = [
      {
        id: 'm1',
        courtId: 'court-1',
        type: 'DOUBLES',
        team1: ['p1', 'p2'],
        team2: ['p3', 'p4'],
        slotSource: {},
        startedAt: 100,
        endedAt: 200,
        durationMinutes: 10,
        balanceRating: 'LOPSIDED',
      },
    ];

    const proposals = generateDoublesProposals(
      'court-1',
      players,
      state,
      state.settings.weights,
      0
    );
    expect(proposals.length).toBeGreaterThan(0);
    const best = proposals[0].lineup;
    const sameSide12 =
      (best.team1.includes('p1') && best.team1.includes('p2')) ||
      (best.team2.includes('p1') && best.team2.includes('p2'));
    expect(sameSide12).toBe(false);
  });
});
