import { describe, expect, it } from 'vitest';
import type { MatchHistory, Player } from '../../types/badminton';
import {
  buildBetLedgerZaloSection,
  calculateBetLedger,
  getEffectivePlayerPayable,
} from '../betLedger';
import { areSettlementDataEqual, createDefaultCloudSettlementData } from '../settlement';

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    sex: 'M',
    rank: 'tb',
    status: 'ACTIVE',
    assignedPool: 'ALL',
    gamesPlayed: 2,
    virtualGamesOffset: 0,
    waitStreak: 0,
    lastPlayedAt: 0,
    singlesCount: 0,
    noSingles: false,
    joinedAt: 1000,
  };
}

function makeMatch(
  id: string,
  team1: string[],
  team2: string[],
  bet: NonNullable<MatchHistory['bet']>,
  betWinner: 1 | 2 | null = 1
): MatchHistory {
  return {
    id,
    courtId: 'court-1',
    type: team1.length === 2 ? 'DOUBLES' : 'SINGLES',
    team1,
    team2,
    slotSource: {},
    startedAt: 1000,
    endedAt: 2000,
    durationMinutes: 15,
    bet,
    betWinner,
  };
}

describe('BetLedger Pure Engine (Nhóm 2B)', () => {
  const players = [
    makePlayer('p1', 'An'),
    makePlayer('p2', 'Bình'),
    makePlayer('p3', 'Cường'),
    makePlayer('p4', 'Dũng'),
  ];

  it('1. Kèo tiền PER_PLAYER + TEAM_TO_TEAM (20k/người, 2v2): 2 thua -20k, 2 thắng +20k, tổng ròng = 0', () => {
    const history = [
      makeMatch('m1', ['p1', 'p2'], ['p3', 'p4'], {
        category: 'MONEY',
        label: '20k/người',
        quantity: 1,
        unit: 'PER_PLAYER',
        amountVnd: 20000,
        payoutMode: 'TEAM_TO_TEAM',
      }, 1),
    ];

    const ledger = calculateBetLedger(players, history);
    expect(ledger.hasBets).toBe(true);
    expect(ledger.teamToTeamNetByPlayer.p1).toBe(20000);
    expect(ledger.teamToTeamNetByPlayer.p2).toBe(20000);
    expect(ledger.teamToTeamNetByPlayer.p3).toBe(-20000);
    expect(ledger.teamToTeamNetByPlayer.p4).toBe(-20000);

    const netSum = Object.values(ledger.teamToTeamNetByPlayer).reduce((a, b) => a + b, 0);
    expect(netSum).toBe(0);
    expect(ledger.transfers).toHaveLength(2);
  });

  it('2. Kèo tiền PER_TEAM + TEAM_TO_TEAM (50k/đội, 2v2): mỗi người thua -25k, mỗi người thắng +25k', () => {
    const history = [
      makeMatch('m1', ['p1', 'p2'], ['p3', 'p4'], {
        category: 'MONEY',
        label: '50k/đội',
        quantity: 1,
        unit: 'PER_TEAM',
        amountVnd: 50000,
        payoutMode: 'TEAM_TO_TEAM',
      }, 2),
    ];

    const ledger = calculateBetLedger(players, history);
    expect(ledger.teamToTeamNetByPlayer.p1).toBe(-25000);
    expect(ledger.teamToTeamNetByPlayer.p2).toBe(-25000);
    expect(ledger.teamToTeamNetByPlayer.p3).toBe(25000);
    expect(ledger.teamToTeamNetByPlayer.p4).toBe(25000);
  });

  it('3. Cấn trừ chéo 3 người: Trận 1 An thua Bình 20k, Trận 2 Bình thua Cường 20k -> rút gọn còn ĐÚNG 1 giao dịch An -> Cường 20.000đ', () => {
    const history = [
      makeMatch('m1', ['p2'], ['p1'], {
        category: 'MONEY',
        label: '20k đơn',
        quantity: 1,
        unit: 'PER_PLAYER',
        amountVnd: 20000,
        payoutMode: 'TEAM_TO_TEAM',
      }, 1), // p2 thắng p1 20k
      makeMatch('m2', ['p3'], ['p2'], {
        category: 'MONEY',
        label: '20k đơn',
        quantity: 1,
        unit: 'PER_PLAYER',
        amountVnd: 20000,
        payoutMode: 'TEAM_TO_TEAM',
      }, 1), // p3 thắng p2 20k
    ];

    const ledger = calculateBetLedger(players, history);
    expect(ledger.transfers).toEqual([
      {
        id: 'transfer_p1_p3',
        fromPlayerId: 'p1',
        fromName: 'An',
        toPlayerId: 'p3',
        toName: 'Cường',
        amount: 20000,
      },
    ]);
  });

  it('4. Kèo tiền LOSER_TO_FUND (20k/người góp quỹ): ghi nhận đúng fundContributions & totalFundVnd', () => {
    const history = [
      makeMatch('m1', ['p1', 'p2'], ['p3', 'p4'], {
        category: 'MONEY',
        label: '20k góp quỹ',
        quantity: 1,
        unit: 'PER_PLAYER',
        amountVnd: 20000,
        payoutMode: 'LOSER_TO_FUND',
      }, 1),
    ];

    const ledger = calculateBetLedger(players, history);
    expect(ledger.totalFundVnd).toBe(40000);
    expect(ledger.fundContributions).toHaveLength(2);
    expect(ledger.teamToTeamNetByPlayer).toEqual({});
    expect(ledger.settlementAdjustmentByPlayer.p3).toBe(20000);
    expect(ledger.settlementAdjustmentByPlayer.p1).toBeUndefined();
  });

  it('5. Kèo hiện vật 1 nước/người (amountVnd = 0) tách riêng khỏi tiền mặt và tóm tắt đúng theo người thua', () => {
    const history = [
      makeMatch('m1', ['p1', 'p2'], ['p3', 'p4'], {
        category: 'DRINK',
        label: '1 nước',
        quantity: 1,
        unit: 'PER_PLAYER',
        amountVnd: 0,
        payoutMode: 'TEAM_TO_TEAM',
      }, 1),
    ];

    const ledger = calculateBetLedger(players, history);
    expect(ledger.transfers).toEqual([]);
    expect(ledger.settlementAdjustmentByPlayer).toEqual({});
    expect(ledger.itemObligations).toHaveLength(1);
    expect(ledger.itemSummaryByLoser.p3).toEqual(['1× 1 nước']);
    expect(ledger.itemSummaryByLoser.p4).toEqual(['1× 1 nước']);
  });

  it('6. Trận đánh độ chưa chốt đội thắng (betWinner = null) đưa vào unresolvedMatches', () => {
    const history = [
      makeMatch('m1', ['p1', 'p2'], ['p3', 'p4'], {
        category: 'DRINK',
        label: '1 nước',
        quantity: 1,
        unit: 'PER_PLAYER',
        amountVnd: 0,
        payoutMode: 'TEAM_TO_TEAM',
      }, null),
    ];

    const ledger = calculateBetLedger(players, history);
    expect(ledger.hasBets).toBe(true);
    expect(ledger.unresolvedMatches).toHaveLength(1);
    expect(ledger.itemObligations).toHaveLength(0);
  });

  it('7. getEffectivePlayerPayable xử lý đúng cả cộng tiền thua và hoàn tiền âm khi thắng độ > tiền sân', () => {
    // Tắt gộp -> giữ nguyên tiền sân
    expect(getEffectivePlayerPayable(60000, 20000, false)).toBe(60000);
    // Bật gộp + thua độ -> cộng thêm và làm tròn nghìn
    expect(getEffectivePlayerPayable(60000, 25000, true)).toBe(85000);
    // Bật gộp + thắng độ 100k > tiền sân 60k -> -40000 (được nhận lại)
    expect(getEffectivePlayerPayable(60000, -100000, true)).toBe(-40000);
    // Bật gộp + thắng đúng bằng tiền sân -> 0
    expect(getEffectivePlayerPayable(60000, -60000, true)).toBe(0);
  });

  it('8. buildBetLedgerZaloSection sinh văn bản chuẩn cho cả chế độ gộp TẮT và BẬT', () => {
    const history = [
      makeMatch('m1', ['p1', 'p2'], ['p3', 'p4'], {
        category: 'MONEY',
        label: '20k/người',
        quantity: 1,
        unit: 'PER_PLAYER',
        amountVnd: 20000,
        payoutMode: 'TEAM_TO_TEAM',
      }, 1),
      makeMatch('m2', ['p1', 'p2'], ['p3', 'p4'], {
        category: 'DRINK',
        label: '1 nước',
        quantity: 1,
        unit: 'PER_PLAYER',
        amountVnd: 0,
        payoutMode: 'TEAM_TO_TEAM',
      }, 1),
    ];

    const ledger = calculateBetLedger(players, history);
    const unmergedText = buildBetLedgerZaloSection(ledger, false);
    expect(unmergedText).toContain('Chuyển khoản độ');
    expect(unmergedText).toContain('20.000đ');
    expect(unmergedText).toContain('Kèo nước / cầu / hiện vật');

    const mergedText = buildBetLedgerZaloSection(ledger, true);
    expect(mergedText).toContain('đã được gộp tự động');
    expect(mergedText).toContain('Kèo nước / cầu / hiện vật');
  });

  it('9. areSettlementDataEqual phát hiện thay đổi betPayments khi tick Đã trả độ', () => {
    const a = createDefaultCloudSettlementData(1000);
    const b = createDefaultCloudSettlementData(2000);
    expect(areSettlementDataEqual(a, b)).toBe(true);

    const c = {
      ...b,
      betPayments: { transfer_p1_p3: true },
    };
    expect(areSettlementDataEqual(a, c)).toBe(false);
  });
});
