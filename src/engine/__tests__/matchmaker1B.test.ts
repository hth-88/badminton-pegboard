import { describe, expect, it } from 'vitest';
import type { Player } from '../../types/badminton';
import { planAllCourts } from '../matchmaker';
import {
  createDefaultCourts,
  createInitialSessionState,
} from '../sessionReducer';

describe('Engine Matchmaker 1B - Pure Multi-Court & Singles/Doubles Engine', () => {
  const makePlayer = (
    id: string,
    name: string,
    sex: 'M' | 'F' = 'M',
    rank: any = 'tb',
    extra: Partial<Player> = {}
  ): Player => ({
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
    ...extra,
  });

  it('planAllCourts là hàm thuần (pure) và cho kết quả tất định (deterministic) với cùng seed', () => {
    const state = createInitialSessionState();
    state.players = [
      makePlayer('p1', 'P1', 'M', 'tb'),
      makePlayer('p2', 'P2', 'F', 'tb'),
      makePlayer('p3', 'P3', 'M', 'tb-'),
      makePlayer('p4', 'P4', 'F', 'tb-'),
      makePlayer('p5', 'P5', 'M', 'tby'),
      makePlayer('p6', 'P6', 'F', 'tby'),
      makePlayer('p7', 'P7', 'M', 'tb+'),
      makePlayer('p8', 'P8', 'F', 'tb+'),
    ];

    const plan1 = planAllCourts(state, 10000, 42);
    const plan2 = planAllCourts(state, 10000, 42);

    expect(plan1).toEqual(plan2);
  });

  it('planAllCourts phân bổ người chơi không trùng nhau giữa các sân (tập reserved)', () => {
    const state = createInitialSessionState();
    state.courts = createDefaultCourts(2);
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

    const plan = planAllCourts(state, 10000, 42);

    const court1Plan = plan['court-1'];
    const court2Plan = plan['court-2'];

    expect(court1Plan.status).toBe('OK');
    expect(court2Plan.status).toBe('OK');

    if (court1Plan.status === 'OK' && court2Plan.status === 'OK') {
      const c1Players = new Set([
        ...court1Plan.proposals[0].lineup.team1,
        ...court1Plan.proposals[0].lineup.team2,
      ]);
      const c2Players = new Set([
        ...court2Plan.proposals[0].lineup.team1,
        ...court2Plan.proposals[0].lineup.team2,
      ]);

      // Không có người nào bị xếp đồng thời ở cả 2 sân
      for (const p of c1Players) {
        expect(c2Players.has(p)).toBe(false);
      }
    }
  });

  it('trả về top N=5 phương án xếp hạng cho mỗi sân', () => {
    const state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    state.players = [
      makePlayer('p1', 'P1', 'M', 'tb'),
      makePlayer('p2', 'P2', 'F', 'tb'),
      makePlayer('p3', 'P3', 'M', 'tby+'),
      makePlayer('p4', 'P4', 'F', 'tby+'),
      makePlayer('p5', 'P5', 'M', 'tb+'),
      makePlayer('p6', 'P6', 'F', 'tb+'),
    ];

    const plan = planAllCourts(state, 10000, 42);
    const courtPlan = plan['court-1'];

    expect(courtPlan.status).toBe('OK');
    if (courtPlan.status === 'OK') {
      expect(courtPlan.proposals.length).toBeLessThanOrEqual(5);
      expect(courtPlan.proposals.length).toBeGreaterThan(1);
      // Kiểm tra tính đơn điệu của penalty
      for (let i = 0; i < courtPlan.proposals.length - 1; i++) {
        expect(courtPlan.proposals[i].penalty).toBeLessThanOrEqual(
          courtPlan.proposals[i + 1].penalty
        );
      }
    }
  });

  it('xử lý dưới 4 người theo autoSingles: OFF -> WAIT, ASK -> NEEDS_CONFIRM, AUTO -> OK', () => {
    const baseState = createInitialSessionState();
    baseState.courts = createDefaultCourts(1);
    baseState.players = [
      makePlayer('p1', 'P1', 'M', 'tb'),
      makePlayer('p2', 'P2', 'M', 'tb'),
      makePlayer('p3', 'P3', 'M', 'tb'), // Đúng 3 người
    ];

    // 1. autoSingles = 'OFF'
    const stateOff = {
      ...baseState,
      settings: { ...baseState.settings, autoSingles: 'OFF' as const },
    };
    const planOff = planAllCourts(stateOff, 10000);
    expect(planOff['court-1'].status).toBe('WAIT');

    // 2. autoSingles = 'ASK'
    const stateAsk = {
      ...baseState,
      settings: { ...baseState.settings, autoSingles: 'ASK' as const },
    };
    const planAsk = planAllCourts(stateAsk, 10000);
    expect(planAsk['court-1'].status).toBe('NEEDS_CONFIRM');
    if (planAsk['court-1'].status === 'NEEDS_CONFIRM') {
      expect(planAsk['court-1'].proposal.lineup.type).toBe('SINGLES');
    }

    // 3. autoSingles = 'AUTO'
    const stateAuto = {
      ...baseState,
      settings: { ...baseState.settings, autoSingles: 'AUTO' as const },
    };
    const planAuto = planAllCourts(stateAuto, 10000);
    expect(planAuto['court-1'].status).toBe('OK');
    if (planAuto['court-1'].status === 'OK') {
      expect(planAuto['court-1'].proposals[0].lineup.type).toBe('SINGLES');
      // Trận đơn có đúng 2 người, 1 người còn lại đợi
      expect(planAuto['court-1'].proposals[0].lineup.team1.length).toBe(1);
      expect(planAuto['court-1'].proposals[0].lineup.team2.length).toBe(1);
    }
  });

  it('tôn trọng snooze khi autoSingles = ASK', () => {
    const state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    state.settings.autoSingles = 'ASK';
    state.players = [
      makePlayer('p1', 'P1', 'M', 'tb'),
      makePlayer('p2', 'P2', 'M', 'tb'),
      makePlayer('p3', 'P3', 'M', 'tb'),
    ];

    // Đang bị snooze cho đến timestamp 15000 với queueSize = 3
    state.autoSinglesSnooze['court-1'] = { untilTs: 15000, queueSizeAtSnooze: 3 };

    // Tại thời điểm now = 12000 (chưa hết hạn)
    const planInSnooze = planAllCourts(state, 12000);
    expect(planInSnooze['court-1'].status).toBe('WAIT');

    // Tại thời điểm now = 16000 (đã hết hạn)
    const planAfterSnooze = planAllCourts(state, 16000);
    expect(planAfterSnooze['court-1'].status).toBe('NEEDS_CONFIRM');
  });

  it('ghép ĐƠN loại bỏ người chơi có noSingles === true', () => {
    const state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    state.settings.autoSingles = 'AUTO';
    state.players = [
      makePlayer('p1', 'P1', 'M', 'tb', { noSingles: true }),
      makePlayer('p2', 'P2', 'M', 'tb'),
      makePlayer('p3', 'P3', 'M', 'tb'),
    ];

    const plan = planAllCourts(state, 10000);
    expect(plan['court-1'].status).toBe('OK');
    if (plan['court-1'].status === 'OK') {
      const { team1, team2 } = plan['court-1'].proposals[0].lineup;
      expect(team1[0]).not.toBe('p1');
      expect(team2[0]).not.toBe('p1');
      expect([team1[0], team2[0]].sort()).toEqual(['p2', 'p3']);
    }
  });

  it('ghép ĐÔI coi cặp LOCK_PARTNER là MỘT đơn vị khi chọn top K', () => {
    const state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    // 9 người chơi, p1 và p9 bị LOCK_PARTNER
    state.players = [
      makePlayer('p1', 'P1', 'M', 'tb', { waitStreak: 5 }),
      makePlayer('p2', 'P2', 'M', 'tb', { waitStreak: 4 }),
      makePlayer('p3', 'P3', 'M', 'tb', { waitStreak: 4 }),
      makePlayer('p4', 'P4', 'M', 'tb', { waitStreak: 4 }),
      makePlayer('p5', 'P5', 'M', 'tb', { waitStreak: 3 }),
      makePlayer('p6', 'P6', 'M', 'tb', { waitStreak: 3 }),
      makePlayer('p7', 'P7', 'M', 'tb', { waitStreak: 3 }),
      makePlayer('p8', 'P8', 'M', 'tb', { waitStreak: 2 }),
      makePlayer('p9', 'P9', 'F', 'tb', { waitStreak: 0 }), // rank thấp nhất trong hàng chờ
    ];

    state.pairRules = [
      { id: 'rule1', playerAId: 'p1', playerBId: 'p9', type: 'LOCK_PARTNER' },
    ];

    const plan = planAllCourts(state, 10000);
    expect(plan['court-1'].status).toBe('OK');
    if (plan['court-1'].status === 'OK') {
      const topProposal = plan['court-1'].proposals[0].lineup;
      const participants = new Set([...topProposal.team1, ...topProposal.team2]);

      // Nếu p1 được chọn thì p9 PHẢI được kéo vào và cùng đội
      if (participants.has('p1')) {
        expect(participants.has('p9')).toBe(true);
        const inT1 = topProposal.team1.includes('p1') && topProposal.team1.includes('p9');
        const inT2 = topProposal.team2.includes('p1') && topProposal.team2.includes('p9');
        expect(inT1 || inT2).toBe(true);
      }
    }
  });

  it('nới lỏng ràng buộc có giới hạn (bounded relaxation) khi gặp thế cờ khó, không rơi vào vòng lặp vô hạn', () => {
    const state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    // Đúng 4 người: p1-p2 khóa cặp, nhưng p2-p3 có AVOID_MATCH
    state.players = [
      makePlayer('p1', 'P1', 'M', 'tb'),
      makePlayer('p2', 'P2', 'F', 'tb'),
      makePlayer('p3', 'P3', 'M', 'tb'),
      makePlayer('p4', 'P4', 'F', 'tb'),
    ];

    state.pairRules = [
      { id: 'r1', playerAId: 'p1', playerBId: 'p2', type: 'LOCK_PARTNER' },
      { id: 'r2', playerAId: 'p2', playerBId: 'p3', type: 'AVOID_MATCH' },
    ];

    const plan = planAllCourts(state, 10000);
    expect(plan['court-1'].status).toBe('OK');
    if (plan['court-1'].status === 'OK') {
      const topProposal = plan['court-1'].proposals[0];
      // Vẫn tìm được giải pháp (AVOID_MATCH được chuyển thành penalty thay vì chặn cứng)
      expect(topProposal.debugScore.avoidMatchPenalty).toBe(state.settings.weights.avoidMatchPenalty);
      // Ràng buộc cứng LOCK_PARTNER vẫn được giữ
      const team1 = topProposal.lineup.team1;
      const team2 = topProposal.lineup.team2;
      const sameT1 = team1.includes('p1') && team1.includes('p2');
      const sameT2 = team2.includes('p1') && team2.includes('p2');
      expect(sameT1 || sameT2).toBe(true);
    }
  });
});
