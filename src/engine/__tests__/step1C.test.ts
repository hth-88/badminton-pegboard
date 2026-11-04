import { describe, expect, it } from 'vitest';
import type {
  BadmintonRank,
  BadmintonSessionState,
  Court,
  Lineup,
  Player,
} from '../../types/badminton';
import {
  generateDoublesProposals,
  generateSinglesProposals,
  planAllCourts,
} from '../matchmaker';
import {
  badmintonReducer,
  createDefaultCourts,
  createInitialSessionState,
  DEFAULT_SETTINGS,
} from '../sessionReducer';
import { describeLineup, validateLineup } from '../validateLineup';

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

describe('Bước 1C – VÁ và Kiểm chứng Hoàn chỉnh Engine Matchmaking', () => {
  // =========================================================================
  // Test 1: Policy isolation (SINGLES_ONLY never doubles, DOUBLES_ONLY never singles)
  // =========================================================================
  it('Test 1: Policy isolation - SINGLES_ONLY chỉ ra đơn, DOUBLES_ONLY chỉ ra đôi, không fallback chéo', () => {
    const players: Player[] = [
      createMockPlayer('p1', 'Player 1'),
      createMockPlayer('p2', 'Player 2'),
      createMockPlayer('p3', 'Player 3'),
      createMockPlayer('p4', 'Player 4'),
      createMockPlayer('p5', 'Player 5'),
      createMockPlayer('p6', 'Player 6'),
    ];

    const courts: Court[] = [
      {
        id: 'court-singles',
        name: 'Sân Đơn',
        isActive: true,
        policy: 'SINGLES_ONLY',
        currentMatch: null,
        nextUp: null,
      },
      {
        id: 'court-doubles',
        name: 'Sân Đôi',
        isActive: true,
        policy: 'DOUBLES_ONLY',
        currentMatch: null,
        nextUp: null,
      },
    ];

    const state: BadmintonSessionState = {
      ...createInitialSessionState(),
      players,
      courts,
    };

    const plan = planAllCourts(state, 1000, 42);

    // Sân SINGLES_ONLY dù có 6 người vẫn PHẢI chỉ ra trận đơn (SINGLES)
    const singlesPlan = plan['court-singles'];
    expect(singlesPlan.status).toBe('OK');
    if (singlesPlan.status === 'OK') {
      expect(singlesPlan.proposals[0].lineup.type).toBe('SINGLES');
      expect(singlesPlan.proposals[0].lineup.team1.length).toBe(1);
      expect(singlesPlan.proposals[0].lineup.team2.length).toBe(1);
    }

    // Nếu chỉ có 2 người rảnh cho sân DOUBLES_ONLY -> phải trả về WAIT, KHÔNG được fallback sang SINGLES
    const stateFewPlayers: BadmintonSessionState = {
      ...createInitialSessionState(),
      players: [createMockPlayer('p1', 'Player 1'), createMockPlayer('p2', 'Player 2')],
      courts: [courts[1]], // chỉ có sân doubles
    };

    const doublesFewPlan = planAllCourts(stateFewPlayers, 1000, 42);
    expect(doublesFewPlan['court-doubles'].status).toBe('WAIT');
  });

  // =========================================================================
  // Test 2: Busy court + 2 players -> WAIT ('Chưa đủ người cho lượt sau'), not NEEDS_CONFIRM
  // =========================================================================
  it('Test 2: Chỉ hỏi đơn khi sân trống - Sân đang bận mà thiếu người Next Up phải trả về WAIT, KHÔNG NEEDS_CONFIRM', () => {
    // 4 người đang đánh trên sân, ngoài sân chỉ có 2 người rảnh
    const playingPlayers = [
      createMockPlayer('p1', 'Player 1'),
      createMockPlayer('p2', 'Player 2'),
      createMockPlayer('p3', 'Player 3'),
      createMockPlayer('p4', 'Player 4'),
    ];
    const waitingPlayers = [
      createMockPlayer('p5', 'Player 5'),
      createMockPlayer('p6', 'Player 6'),
    ];

    const courts: Court[] = [
      {
        id: 'court-1',
        name: 'Sân 1',
        isActive: true,
        policy: 'MIX',
        currentMatch: {
          type: 'DOUBLES',
          team1: ['p1', 'p2'],
          team2: ['p3', 'p4'],
          slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
          startedAt: 1000,
        },
        nextUp: null,
      },
    ];

    const state: BadmintonSessionState = {
      ...createInitialSessionState(),
      players: [...playingPlayers, ...waitingPlayers],
      courts,
      settings: {
        ...DEFAULT_SETTINGS,
        autoSingles: 'ASK', // Thiết lập hỏi đơn khi dưới 4 người
      },
    };

    const plan = planAllCourts(state, 2000, 42);
    const courtPlan = plan['court-1'];

    // Sân đang đánh không được hiển thị popup hỏi đơn cho lượt sau
    expect(courtPlan.status).toBe('WAIT');
    if (courtPlan.status === 'WAIT') {
      expect(courtPlan.reason).toBe('Chưa đủ người cho lượt sau');
    }
  });

  // =========================================================================
  // Test 3: 3 players + 2 empty courts -> only 1 court gets proposal, no overlapping players
  // =========================================================================
  it('Test 3: Reserve cho NEEDS_CONFIRM - 3 người rảnh và 2 sân trống thì chỉ 1 sân đề xuất đơn, sân kia WAIT, không trùng người', () => {
    const players: Player[] = [
      createMockPlayer('p1', 'Player 1'),
      createMockPlayer('p2', 'Player 2'),
      createMockPlayer('p3', 'Player 3'),
    ];

    const courts: Court[] = createDefaultCourts(2); // 2 sân trống

    const state: BadmintonSessionState = {
      ...createInitialSessionState(),
      players,
      courts,
      settings: {
        ...DEFAULT_SETTINGS,
        autoSingles: 'ASK',
      },
    };

    const plan = planAllCourts(state, 1000, 42);

    const c1 = plan['court-1'];
    const c2 = plan['court-2'];

    // Sân 1 nhận đề xuất NEEDS_CONFIRM với 2 người
    expect(c1.status).toBe('NEEDS_CONFIRM');
    if (c1.status === 'NEEDS_CONFIRM') {
      const reserved = [...c1.proposal.lineup.team1, ...c1.proposal.lineup.team2];
      expect(reserved.length).toBe(2);

      // Sân 2 chỉ còn 1 người khả dụng -> phải là WAIT, không được dùng người của sân 1
      expect(c2.status).toBe('WAIT');
    }
  });

  // =========================================================================
  // Test 4: fixedSlots preserves MANUAL and fills remaining slots
  // =========================================================================
  it('Test 4: fixedSlots - Cố định vị trí giữ nguyên slotSource MANUAL và điền tự động các slot còn lại', () => {
    const players: Player[] = [
      createMockPlayer('p1', 'Player 1'),
      createMockPlayer('p2', 'Player 2'),
      createMockPlayer('p3', 'Player 3'),
      createMockPlayer('p4', 'Player 4'),
      createMockPlayer('p5', 'Player 5'),
    ];

    const state: BadmintonSessionState = {
      ...createInitialSessionState(),
      players,
    };

    // Trường hợp trận đôi: cố định p1 ở Team 1 và p2 ở Team 2
    const doublesProposals = generateDoublesProposals(
      'court-1',
      players,
      state,
      state.settings.weights,
      42,
      [
        { playerId: 'p1', team: 1 },
        { playerId: 'p2', team: 2 },
      ]
    );

    expect(doublesProposals.length).toBeGreaterThan(0);
    const topDoubles = doublesProposals[0];
    expect(topDoubles.lineup.team1).toContain('p1');
    expect(topDoubles.lineup.team2).toContain('p2');
    expect(topDoubles.lineup.slotSource['p1']).toBe('MANUAL');
    expect(topDoubles.lineup.slotSource['p2']).toBe('MANUAL');

    // 2 người còn lại phải có slotSource là AUTO
    const filledPlayers = [
      ...topDoubles.lineup.team1.filter((id) => id !== 'p1'),
      ...topDoubles.lineup.team2.filter((id) => id !== 'p2'),
    ];
    expect(filledPlayers.length).toBe(2);
    filledPlayers.forEach((id) => {
      expect(topDoubles.lineup.slotSource[id]).toBe('AUTO');
    });

    // Trường hợp trận đơn: cố định p1 ở Team 1
    const singlesProposals = generateSinglesProposals(
      players,
      state,
      state.settings.weights,
      42,
      [{ playerId: 'p1', team: 1 }]
    );
    expect(singlesProposals.length).toBeGreaterThan(0);
    const topSingles = singlesProposals[0];
    expect(topSingles.lineup.team1[0]).toBe('p1');
    expect(topSingles.lineup.slotSource['p1']).toBe('MANUAL');
    expect(topSingles.lineup.slotSource[topSingles.lineup.team2[0]]).toBe('AUTO');
  });

  // =========================================================================
  // Test 5: LOCK+AVOID conflict on same pair -> finite termination, AVOID wins, relaxed = true
  // =========================================================================
  it('Test 5: Mâu thuẫn luật - Cùng cặp vừa LOCK vừa AVOID thì dừng hữu hạn, AVOID thắng, relaxed = true', () => {
    const players: Player[] = [
      createMockPlayer('p1', 'Player 1'),
      createMockPlayer('p2', 'Player 2'),
      createMockPlayer('p3', 'Player 3'),
      createMockPlayer('p4', 'Player 4'),
    ];

    const state: BadmintonSessionState = {
      ...createInitialSessionState(),
      players,
      pairRules: [
        { id: 'r1', playerAId: 'p1', playerBId: 'p2', type: 'LOCK_PARTNER' },
        { id: 'r2', playerAId: 'p1', playerBId: 'p2', type: 'AVOID_PARTNER' },
      ],
    };

    const proposals = generateDoublesProposals(
      'court-1',
      players,
      state,
      state.settings.weights,
      42
    );

    // Phải tìm được phương án dừng hữu hạn, không loop vô tận
    expect(proposals.length).toBeGreaterThan(0);
    const top = proposals[0];

    // AVOID_PARTNER thắng: p1 và p2 KHÔNG BAO GIỜ cùng đội
    const sameTeam =
      (top.lineup.team1.includes('p1') && top.lineup.team1.includes('p2')) ||
      (top.lineup.team2.includes('p1') && top.lineup.team2.includes('p2'));
    expect(sameTeam).toBe(false);

    // Cờ relaxed phải là true và có ghi nhận mâu thuẫn
    expect(top.relaxed).toBe(true);
    expect(
      top.relaxedReasons.some((r) => r.includes('mâu thuẫn') || r.includes('AVOID'))
    ).toBe(true);
  });

  // =========================================================================
  // Test 6: 2 empty courts mix 0.7/0.3 simulated sequentially in 30 matches
  // =========================================================================
  it('Test 6: Mô phỏng cục bộ mixDebt - 2 sân trống tỉ lệ 0.7 đôi / 0.3 đơn qua chuỗi trận', () => {
    // Tạo 12 người chơi để luôn đủ người cho cả 2 sân
    const players: Player[] = Array.from({ length: 12 }, (_, i) =>
      createMockPlayer(`p${i + 1}`, `Player ${i + 1}`)
    );

    let state: BadmintonSessionState = {
      ...createInitialSessionState(),
      players,
      settings: {
        ...DEFAULT_SETTINGS,
        courtMode: 'SHARED_POOL',
        matchMix: { doubles: 0.7, singles: 0.3 },
        autoSingles: 'AUTO',
      },
    };

    let doublesCount = 0;
    let singlesCount = 0;

    let now = 1000;
    // Chạy 15 lượt lập kế hoạch và bắt đầu trận
    for (let round = 0; round < 15; round++) {
      const plan = planAllCourts(state, now, round);
      for (const courtId of ['court-1', 'court-2']) {
        const cPlan = plan[courtId];
        if (cPlan && cPlan.status === 'OK' && cPlan.proposals.length > 0) {
          const proposal = cPlan.proposals[cPlan.selectedIndex ?? 0];
          if (proposal.lineup.type === 'DOUBLES') {
            doublesCount++;
          } else {
            singlesCount++;
          }
          state = badmintonReducer(state, {
            type: 'START_MATCH',
            payload: { courtId, lineup: proposal.lineup, now },
          });
        }
      }

      // Kết thúc các trận đang đánh để giải phóng sân cho vòng kế
      for (const courtId of ['court-1', 'court-2']) {
        now += 15 * 60000;
        state = badmintonReducer(state, {
          type: 'END_MATCH',
          payload: { courtId, now },
        });
      }
    }

    const totalMatches = doublesCount + singlesCount;
    expect(totalMatches).toBeGreaterThanOrEqual(25);
    // Tỉ lệ đôi phải chiếm đa số (~70%), đơn chiếm ~30%
    expect(doublesCount).toBeGreaterThan(singlesCount);
    expect(singlesCount).toBeGreaterThan(0);
  });

  // =========================================================================
  // Test 7: validateLineup tests every BLOCK and WARN code
  // =========================================================================
  it('Test 7: validateLineup kiểm tra toàn diện tất cả các mã lỗi BLOCK và WARN', () => {
    const p1 = createMockPlayer('p1', 'Player 1', 'M', 'tb');
    const p2 = createMockPlayer('p2', 'Player 2', 'M', 'tb');
    const p3 = createMockPlayer('p3', 'Player 3', 'M', 'tb');
    const p4 = createMockPlayer('p4', 'Player 4', 'M', 'tb');
    const pPaused = createMockPlayer('pPaused', 'Paused Player', 'M', 'tb', {
      status: 'PAUSED',
    });
    const pNoSingles = createMockPlayer('pNoSingles', 'No Singles', 'M', 'tb', {
      noSingles: true,
    });
    const pWeak = createMockPlayer('pWeak', 'Weak Player', 'F', 'newbie');
    const pPro = createMockPlayer('pPro', 'Pro Player', 'M', 'tbk');

    const baseState: BadmintonSessionState = {
      ...createInitialSessionState(),
      players: [p1, p2, p3, p4, pPaused, pNoSingles, pWeak, pPro],
      pairRules: [
        { id: 'r1', playerAId: 'p1', playerBId: 'p2', type: 'AVOID_PARTNER' },
        { id: 'r2', playerAId: 'p3', playerBId: 'p4', type: 'LOCK_PARTNER' },
        { id: 'r3', playerAId: 'p1', playerBId: 'p3', type: 'AVOID_MATCH' },
      ],
      courts: [
        {
          id: 'court-1',
          name: 'Sân 1',
          isActive: true,
          policy: 'MIX',
          currentMatch: null,
          nextUp: null,
        },
        {
          id: 'court-2',
          name: 'Sân 2',
          isActive: true,
          policy: 'MIX',
          currentMatch: {
            type: 'SINGLES',
            team1: ['pPro'],
            team2: ['pWeak'],
            slotSource: { pPro: 'AUTO', pWeak: 'AUTO' },
            startedAt: 1000,
          },
          nextUp: {
            type: 'SINGLES',
            team1: ['p4'],
            team2: ['p3'],
            slotSource: { p4: 'AUTO', p3: 'AUTO' },
            isLockedByHost: false,
          },
        },
      ],
    };

    // 1. BLOCK: INVALID_SIZE (Đơn có 2 người ở 1 đội)
    const invalidSizeLineup: Lineup = {
      type: 'SINGLES',
      team1: ['p1', 'p2'],
      team2: ['p3'],
      slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO' },
    };
    const issues1 = validateLineup(invalidSizeLineup, baseState);
    expect(issues1.some((i) => i.code === 'INVALID_SIZE' && i.severity === 'BLOCK')).toBe(true);

    // 2. BLOCK: DUPLICATE_PLAYER (Trùng 1 người trong 2 vị trí)
    const duplicateLineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p1', 'p3'],
      slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO' },
    };
    const issues2 = validateLineup(duplicateLineup, baseState);
    expect(issues2.some((i) => i.code === 'DUPLICATE_PLAYER' && i.severity === 'BLOCK')).toBe(true);

    // 3. BLOCK: PLAYING_ELSEWHERE (pPro đang đánh ở Sân 2)
    const elsewhereLineup: Lineup = {
      type: 'SINGLES',
      team1: ['p1'],
      team2: ['pPro'],
      slotSource: { p1: 'AUTO', pPro: 'AUTO' },
    };
    const issues3 = validateLineup(elsewhereLineup, baseState, 'court-1');
    expect(issues3.some((i) => i.code === 'PLAYING_ELSEWHERE' && i.severity === 'BLOCK')).toBe(true);

    // 4. WARN: PLAYER_PAUSED
    const pausedLineup: Lineup = {
      type: 'SINGLES',
      team1: ['p1'],
      team2: ['pPaused'],
      slotSource: { p1: 'AUTO', pPaused: 'AUTO' },
    };
    const issues4 = validateLineup(pausedLineup, baseState);
    expect(issues4.some((i) => i.code === 'PLAYER_PAUSED' && i.severity === 'WARN')).toBe(true);

    // 5. WARN: AVOID_PARTNER_VIOLATION (p1 và p2 cùng Team 1)
    const avoidPartnerLineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p3', 'p4'],
      slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
    };
    const issues5 = validateLineup(avoidPartnerLineup, baseState);
    expect(issues5.some((i) => i.code === 'AVOID_PARTNER_VIOLATION' && i.severity === 'WARN')).toBe(true);

    // 6. WARN: LOCK_PARTNER_SPLIT (p3 và p4 bị chia 2 đội đối đầu khi đánh DOUBLES)
    const splitLockLineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p3'],
      team2: ['p2', 'p4'],
      slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
    };
    const issues6 = validateLineup(splitLockLineup, baseState);
    expect(issues6.some((i) => i.code === 'LOCK_PARTNER_SPLIT' && i.severity === 'WARN')).toBe(true);

    // Mục D: Ca đơn (SINGLES) đối đầu giữa p3 và p4 KHÔNG cảnh báo LOCK_PARTNER_SPLIT
    const singlesSplitLineup: Lineup = {
      type: 'SINGLES',
      team1: ['p3'],
      team2: ['p4'],
      slotSource: { p3: 'AUTO', p4: 'AUTO' },
    };
    const issuesSingles = validateLineup(singlesSplitLineup, baseState);
    expect(issuesSingles.some((i) => i.code === 'LOCK_PARTNER_SPLIT')).toBe(false);

    // 7. WARN: AVOID_MATCH_VIOLATION (p1 và p3 chung sân)
    const issues7 = validateLineup(splitLockLineup, baseState);
    expect(issues7.some((i) => i.code === 'AVOID_MATCH_VIOLATION' && i.severity === 'WARN')).toBe(true);

    // 8. WARN: SKILL_IMBALANCE (pWeak newbie vs pPro tbk lệch > 3.0)
    const imbalancedLineup: Lineup = {
      type: 'SINGLES',
      team1: ['pWeak'],
      team2: ['pPro'],
      slotSource: { pWeak: 'AUTO', pPro: 'AUTO' },
    };
    const issues8 = validateLineup(imbalancedLineup, baseState);
    const skillIssue = issues8.find((i) => i.code === 'SKILL_IMBALANCE');
    expect(skillIssue).toBeDefined();
    expect(skillIssue?.severity).toBe('WARN');
    expect(skillIssue?.message).toContain('chênh');

    // 9. WARN: NEXT_UP_ELSEWHERE (p4 đang nằm trong nextUp của sân 2)
    const nextUpLineup: Lineup = {
      type: 'SINGLES',
      team1: ['p1'],
      team2: ['p4'],
      slotSource: { p1: 'AUTO', p4: 'AUTO' },
    };
    const issues9 = validateLineup(nextUpLineup, baseState, 'court-1');
    expect(issues9.some((i) => i.code === 'NEXT_UP_ELSEWHERE' && i.severity === 'WARN')).toBe(true);

    // 10. WARN: NO_SINGLES_IN_SINGLES
    const noSinglesLineup: Lineup = {
      type: 'SINGLES',
      team1: ['p1'],
      team2: ['pNoSingles'],
      slotSource: { p1: 'AUTO', pNoSingles: 'AUTO' },
    };
    const issues10 = validateLineup(noSinglesLineup, baseState);
    expect(issues10.some((i) => i.code === 'NO_SINGLES_IN_SINGLES' && i.severity === 'WARN')).toBe(true);

    // 11. Kiểm tra mô tả cân bằng trình độ describeLineup
    const desc = describeLineup(imbalancedLineup, baseState);
    expect(desc.diff).toBeGreaterThan(3.0);
    expect(desc.label).toBe('Lệch nhiều');
  });

  // =========================================================================
  // Test 8: SPLIT_COURT waitStreak isolation
  // =========================================================================
  it('Test 8: SPLIT_COURT - waitStreak chỉ tăng cho người thuộc pool của sân hoặc ALL', () => {
    const pCourt1 = createMockPlayer('pC1', 'Pool Court 1', 'M', 'tb', {
      assignedPool: 'court-1',
      waitStreak: 0,
    });
    const pCourt2 = createMockPlayer('pC2', 'Pool Court 2', 'M', 'tb', {
      assignedPool: 'court-2',
      waitStreak: 0,
    });
    const pAll = createMockPlayer('pAll', 'Pool All', 'M', 'tb', {
      assignedPool: 'ALL',
      waitStreak: 0,
    });
    const matchPlayers = [
      createMockPlayer('m1', 'Match 1', 'M', 'tb', { assignedPool: 'court-1' }),
      createMockPlayer('m2', 'Match 2', 'M', 'tb', { assignedPool: 'court-1' }),
      createMockPlayer('m3', 'Match 3', 'M', 'tb', { assignedPool: 'court-1' }),
      createMockPlayer('m4', 'Match 4', 'M', 'tb', { assignedPool: 'court-1' }),
    ];

    const state: BadmintonSessionState = {
      ...createInitialSessionState(),
      players: [pCourt1, pCourt2, pAll, ...matchPlayers],
      settings: {
        ...DEFAULT_SETTINGS,
        courtMode: 'SPLIT_COURT', // Chế độ tách sân
      },
    };

    // Bắt đầu trận trên Sân 1 (court-1)
    const nextState = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: {
        courtId: 'court-1',
        lineup: {
          type: 'DOUBLES',
          team1: ['m1', 'm2'],
          team2: ['m3', 'm4'],
          slotSource: { m1: 'AUTO', m2: 'AUTO', m3: 'AUTO', m4: 'AUTO' },
        },
        now: 1000,
      },
    });

    const updatedC1 = nextState.players.find((p) => p.id === 'pC1');
    const updatedC2 = nextState.players.find((p) => p.id === 'pC2');
    const updatedAll = nextState.players.find((p) => p.id === 'pAll');

    // pC1 (thuộc Sân 1) và pAll (thuộc ALL) phải được +1 waitStreak
    expect(updatedC1?.waitStreak).toBe(1);
    expect(updatedAll?.waitStreak).toBe(1);

    // pC2 (thuộc Sân 2) KHÔNG được tăng waitStreak vì trận diễn ra trên Sân 1
    expect(updatedC2?.waitStreak).toBe(0);
  });
});
