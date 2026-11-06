import { describe, expect, it } from 'vitest';
import type { Player } from '../../types/badminton';
import {
  generateDoublesProposals,
  suggestNextUpForCourt,
} from '../matchmaker';
import {
  badmintonReducer,
  createDefaultCourts,
  createInitialSessionState,
} from '../sessionReducer';
import { nextUpMemberIds } from '../nextUp';

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

  it('suggestNextUpForCourt là hàm thuần (pure) và cho kết quả tất định (deterministic)', () => {
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

    const draft1 = suggestNextUpForCourt(state, 'court-1', 10000);
    const draft2 = suggestNextUpForCourt(state, 'court-1', 10000);

    expect(draft1).not.toBeNull();
    expect(draft1).toEqual(draft2);
  });

  it('suggestNextUpForCourt phân bổ người chơi không trùng nhau giữa các sân', () => {
    let state = createInitialSessionState();
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

    // Gợi ý cho Sân 1 và lưu vào state
    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-1', now: 10000 },
    });

    // Gợi ý cho Sân 2 và lưu vào state
    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-2', now: 10000 },
    });

    const c1Players = new Set(nextUpMemberIds(state.courts[0].nextUp));
    const c2Players = new Set(nextUpMemberIds(state.courts[1].nextUp));

    expect(c1Players.size).toBe(4);
    expect(c2Players.size).toBe(4);

    // Không có người nào bị xếp đồng thời ở cả 2 sân
    for (const p of c1Players) {
      expect(c2Players.has(p)).toBe(false);
    }
  });

  it('generateDoublesProposals trả về top phương án xếp hạng theo penalty tăng dần', () => {
    const state = createInitialSessionState();
    const candidates = [
      makePlayer('p1', 'P1', 'M', 'tb'),
      makePlayer('p2', 'P2', 'F', 'tb'),
      makePlayer('p3', 'P3', 'M', 'tby+'),
      makePlayer('p4', 'P4', 'F', 'tby+'),
      makePlayer('p5', 'P5', 'M', 'tb+'),
      makePlayer('p6', 'P6', 'F', 'tb+'),
    ];

    const proposals = generateDoublesProposals(
      'court-1',
      candidates,
      state,
      state.settings.weights,
      10000
    );

    const topProposals = proposals.slice(0, 5);
    expect(topProposals.length).toBeLessThanOrEqual(5);
    expect(topProposals.length).toBeGreaterThan(1);
    // Kiểm tra tính đơn điệu của penalty
    for (let i = 0; i < proposals.length - 1; i++) {
      expect(proposals[i].penalty).toBeLessThanOrEqual(proposals[i + 1].penalty);
    }
  });

  it('xử lý dưới 4 người theo autoSingles: OFF -> null, AUTO -> SINGLES draft', () => {
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
    const draftOff = suggestNextUpForCourt(stateOff, 'court-1', 10000);
    expect(draftOff).toBeNull();

    // 2. autoSingles = 'AUTO'
    const stateAuto = {
      ...baseState,
      settings: { ...baseState.settings, autoSingles: 'AUTO' as const },
    };
    const draftAuto = suggestNextUpForCourt(stateAuto, 'court-1', 10000);
    expect(draftAuto).not.toBeNull();
    if (draftAuto) {
      expect(draftAuto.type).toBe('SINGLES');
      expect(draftAuto.slots.length).toBe(2);
      expect(draftAuto.slots.every(Boolean)).toBe(true);
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
    const draftInSnooze = suggestNextUpForCourt(state, 'court-1', 12000);
    expect(draftInSnooze).toBeNull();

    // Tại thời điểm now = 16000 (đã hết hạn)
    const draftAfterSnooze = suggestNextUpForCourt(state, 'court-1', 16000);
    expect(draftAfterSnooze).not.toBeNull();
    expect(draftAfterSnooze?.type).toBe('SINGLES');
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

    const draft = suggestNextUpForCourt(state, 'court-1', 10000);
    expect(draft).not.toBeNull();
    if (draft) {
      expect(draft.type).toBe('SINGLES');
      expect(draft.slots).not.toContain('p1');
      expect([...draft.slots].sort()).toEqual(['p2', 'p3']);
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

    const draft = suggestNextUpForCourt(state, 'court-1', 10000);
    expect(draft).not.toBeNull();
    if (draft) {
      const participants = new Set(draft.slots);

      // Nếu p1 được chọn thì p9 PHẢI được kéo vào và cùng đội
      if (participants.has('p1')) {
        expect(participants.has('p9')).toBe(true);
        const inT1 = draft.slots[0] === 'p1' && draft.slots[1] === 'p9' || draft.slots[0] === 'p9' && draft.slots[1] === 'p1';
        const inT2 = draft.slots[2] === 'p1' && draft.slots[3] === 'p9' || draft.slots[2] === 'p9' && draft.slots[3] === 'p1';
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

    const draft = suggestNextUpForCourt(state, 'court-1', 10000);
    expect(draft).not.toBeNull();
    if (draft) {
      // Ràng buộc cứng LOCK_PARTNER vẫn được giữ
      const inT1 = draft.slots[0] === 'p1' && draft.slots[1] === 'p2' || draft.slots[0] === 'p2' && draft.slots[1] === 'p1';
      const inT2 = draft.slots[2] === 'p1' && draft.slots[3] === 'p2' || draft.slots[2] === 'p2' && draft.slots[3] === 'p1';
      expect(inT1 || inT2).toBe(true);
    }
  });
});
