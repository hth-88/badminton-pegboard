import { describe, expect, it } from 'vitest';
import type { Player } from '../../types/badminton';
import {
  calculateSettlement,
  ceilToNearest1000,
  DEFAULT_SETTLEMENT_SETTINGS,
  type SettlementSettings,
} from '../settlement';

function makePlayer(id: string, name: string, sex: 'M' | 'F', gamesPlayed: number): Player {
  return {
    id,
    name,
    sex,
    rank: 'tb',
    status: 'ACTIVE',
    assignedPool: 'ALL',
    gamesPlayed,
    virtualGamesOffset: 0,
    waitStreak: 0,
    lastPlayedAt: 1000,
    singlesCount: 0,
    noSingles: false,
    joinedAt: 1000,
  };
}

describe('PHA 2 – THUẬT TOÁN TÍNH TIỀN SÂN (SETTLEMENT ENGINE)', () => {
  it('Làm tròn lên đến 1.000đ gần nhất (Ceiling to nearest 1,000 VNĐ)', () => {
    expect(ceilToNearest1000(0)).toBe(0);
    expect(ceilToNearest1000(100)).toBe(1000);
    expect(ceilToNearest1000(50000)).toBe(50000);
    expect(ceilToNearest1000(50001)).toBe(51000);
    expect(ceilToNearest1000(33333.33)).toBe(34000);
  });

  it('1. Chia đều (Equal Split): làm tròn lên 1.000đ và báo đúng số tiền dư', () => {
    const players = [
      makePlayer('p1', 'Tuấn', 'M', 4),
      makePlayer('p2', 'Hùng', 'M', 4),
      makePlayer('p3', 'Linh', 'F', 4),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 100000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'EQUAL',
      discountUnderPlayed: false,
    };

    const res = calculateSettlement(players, settings);
    expect(res.totalCost).toBe(100000);
    // 100.000 / 3 = 33.333,33đ -> làm tròn lên 34.000đ mỗi người
    expect(res.players.every((p) => p.roundedAmount === 34000)).toBe(true);
    expect(res.totalCollected).toBe(102000);
    expect(res.surplus).toBe(2000); // Dư 2.000đ
  });

  it('2. Phân chia Nam / Nữ theo tỉ lệ phần trăm (60% Nam - 40% Nữ)', () => {
    const players = [
      makePlayer('m1', 'Nam 1', 'M', 4),
      makePlayer('m2', 'Nam 2', 'M', 4),
      makePlayer('f1', 'Nữ 1', 'F', 4),
      makePlayer('f2', 'Nữ 2', 'F', 4),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 100000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'GENDER_RATIO',
      genderRatioMalePercent: 60,
      genderRatioFemalePercent: 40,
      discountUnderPlayed: false,
    };

    const res = calculateSettlement(players, settings);
    expect(res.totalCost).toBe(100000);

    const males = res.players.filter((p) => p.sex === 'M');
    const females = res.players.filter((p) => p.sex === 'F');

    // Nam: 60.000 / 2 = 30.000đ mỗi người
    expect(males.every((p) => p.roundedAmount === 30000)).toBe(true);
    // Nữ: 40.000 / 2 = 20.000đ mỗi người
    expect(females.every((p) => p.roundedAmount === 20000)).toBe(true);
    expect(res.totalCollected).toBe(100000);
    expect(res.surplus).toBe(0);
  });

  it('3. Nam đóng thêm cố định: Nam = Nữ + 20.000đ', () => {
    const players = [
      makePlayer('m1', 'Nam 1', 'M', 4),
      makePlayer('m2', 'Nam 2', 'M', 4),
      makePlayer('f1', 'Nữ 1', 'F', 4),
      makePlayer('f2', 'Nữ 2', 'F', 4),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 120000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'MALE_EXTRA',
      maleExtraAmount: 20000,
      discountUnderPlayed: false,
    };

    const res = calculateSettlement(players, settings);
    // Tổng 120.000đ. Nam đóng hơn 20k -> 2 * F + 2 * (F + 20k) = 120k -> 4F = 80k -> F = 20k, M = 40k
    const males = res.players.filter((p) => p.sex === 'M');
    const females = res.players.filter((p) => p.sex === 'F');

    expect(females.every((p) => p.roundedAmount === 20000)).toBe(true);
    expect(males.every((p) => p.roundedAmount === 40000)).toBe(true);
    expect(res.totalCollected).toBe(120000);
  });

  it('4. Edge case: Toàn Nam hoặc Toàn Nữ -> Tự động fallback về chia đều', () => {
    const allMales = [
      makePlayer('m1', 'Nam 1', 'M', 4),
      makePlayer('m2', 'Nam 2', 'M', 4),
      makePlayer('m3', 'Nam 3', 'M', 4),
      makePlayer('m4', 'Nam 4', 'M', 4),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 100000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'GENDER_RATIO', // Cài đặt tỉ lệ giới tính nhưng toàn nam
      discountUnderPlayed: false,
    };

    const res = calculateSettlement(allMales, settings);
    // Chia đều 25.000đ mỗi người
    expect(res.players.every((p) => p.roundedAmount === 25000)).toBe(true);
    expect(res.totalCollected).toBe(100000);
  });

  it('5. Giảm giá người chơi ít (<= 2 trận): bù hụt cho người đủ trận', () => {
    const players = [
      makePlayer('pLate', 'Người vào muộn', 'M', 1), // <= 2 trận
      makePlayer('pFull1', 'Đủ 1', 'M', 5),
      makePlayer('pFull2', 'Đủ 2', 'M', 5),
      makePlayer('pFull3', 'Đủ 3', 'M', 5),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 100000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'EQUAL',
      discountUnderPlayed: true,
      underPlayedThreshold: 2,
      underPlayedDiscountType: 'PERCENT_50', // Giảm 50%
    };

    const res = calculateSettlement(players, settings);
    const pLate = res.players.find((p) => p.playerId === 'pLate')!;
    const pFull = res.players.filter((p) => p.playerId !== 'pLate');

    // Share gốc mỗi người là 25.000đ.
    // pLate được giảm 50% -> đóng 12.500đ -> làm tròn lên là 13.000đ.
    // Khoản hụt 12.500đ chia đều cho 3 người đủ trận: 12.500 / 3 = 4.166đ
    // Mỗi người đủ trận gánh: 25.000 + 4.166,66 = 29.166,66đ -> làm tròn lên 30.000đ.
    expect(pLate.isDiscounted).toBe(true);
    expect(pLate.roundedAmount).toBe(13000);
    expect(pFull.every((p) => p.roundedAmount === 30000)).toBe(true);
    expect(res.totalCollected).toBe(13000 + 3 * 30000); // 103.000đ
    expect(res.surplus).toBe(3000);
  });

  it('6. Người 0 trận được miễn phí theo chính sách FREE', () => {
    const players = [
      makePlayer('pZero', 'Người không đánh', 'F', 0),
      makePlayer('p1', 'P1', 'M', 4),
      makePlayer('p2', 'P2', 'M', 4),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 100000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'EQUAL',
      zeroGamesPolicy: 'FREE',
      discountUnderPlayed: false,
    };

    const res = calculateSettlement(players, settings);
    const zeroP = res.players.find((p) => p.playerId === 'pZero')!;
    expect(zeroP.roundedAmount).toBe(0);

    const activeP = res.players.filter((p) => p.playerId !== 'pZero');
    // 2 người còn lại chia 100k -> 50k mỗi người
    expect(activeP.every((p) => p.roundedAmount === 50000)).toBe(true);
  });

  it('7. Edge case: Chi phí = 0 hoặc Danh sách người = 0', () => {
    const resZeroCost = calculateSettlement(
      [makePlayer('p1', 'P1', 'M', 3)],
      {
        ...DEFAULT_SETTLEMENT_SETTINGS,
        courtCostMode: 'DIRECT',
        courtCostDirect: 0,
        shuttleCostMode: 'DIRECT',
        shuttleCostDirect: 0,
        extraCost: 0,
      }
    );
    expect(resZeroCost.totalCost).toBe(0);
    expect(resZeroCost.players[0].roundedAmount).toBe(0);

    const resEmptyPlayers = calculateSettlement([], DEFAULT_SETTLEMENT_SETTINGS);
    expect(resEmptyPlayers.totalCollected).toBe(0);
  });

  it('8. Sinh tin nhắn Zalo đầy đủ chi tiết và thông tin chuyển khoản', () => {
    const players = [
      makePlayer('m1', 'Quốc Tuấn', 'M', 4),
      makePlayer('f1', 'Phương Thảo', 'F', 4),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 100000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 40000,
      extraCost: 20000,
      bankName: 'Vietcombank',
      bankAccount: '0123456789',
      bankAccountHolder: 'NGUYEN VAN A',
    };

    const res = calculateSettlement(players, settings);
    expect(res.zaloMessage).toContain('TỔNG KẾT CHI PHÍ CẦU LÔNG');
    expect(res.zaloMessage).toContain('Quốc Tuấn: 80.000đ');
    expect(res.zaloMessage).toContain('Vietcombank');
    expect(res.zaloMessage).toContain('0123456789');
    expect(res.zaloMessage).toContain('NGUYEN VAN A');
  });

  it('9. Mục C(1): HỦY toàn bộ giảm giá nếu không có ai đủ trận để bù -> tổng thu >= tổng chi', () => {
    // 3 người đều đánh 1 trận (dưới ngưỡng 2), giảm FREE
    const players = [
      makePlayer('p1', 'P1', 'M', 1),
      makePlayer('p2', 'P2', 'M', 1),
      makePlayer('p3', 'P3', 'F', 1),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 150000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'EQUAL',
      discountUnderPlayed: true,
      underPlayedThreshold: 2,
      underPlayedDiscountType: 'FREE',
    };

    const res = calculateSettlement(players, settings);
    expect(res.totalCost).toBe(150000);
    // Vì không ai đủ trận để bù, giảm giá bị hủy -> mỗi người đóng 50.000đ
    expect(res.players.every((p) => p.roundedAmount === 50000)).toBe(true);
    expect(res.players.every((p) => !p.isDiscounted)).toBe(true);
    expect(res.totalCollected).toBe(150000);
    expect(res.totalCollected).toBeGreaterThanOrEqual(res.totalCost);
    expect(res.shortfall).toBe(0);
  });

  it('10. Mục C(2): MALE_EXTRA khi totalExtra > totalCost -> giới hạn maleExtra để tổng vẫn bằng totalCost và có cờ warning', () => {
    const players = [
      makePlayer('m1', 'Nam 1', 'M', 4),
      makePlayer('m2', 'Nam 2', 'M', 4),
      makePlayer('f1', 'Nữ 1', 'F', 4),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 100000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'MALE_EXTRA',
      maleExtraAmount: 80000, // 2 Nam * 80k = 160k > 100k
      discountUnderPlayed: false,
    };

    const res = calculateSettlement(players, settings);
    expect(res.totalCost).toBe(100000);
    expect(res.warning).toBeDefined();

    const m1 = res.players.find((p) => p.playerId === 'm1')!;
    const m2 = res.players.find((p) => p.playerId === 'm2')!;
    const f1 = res.players.find((p) => p.playerId === 'f1')!;

    // 2 Nam chia đều 100k = 50k mỗi người, Nữ 0đ
    expect(m1.roundedAmount).toBe(50000);
    expect(m2.roundedAmount).toBe(50000);
    expect(f1.roundedAmount).toBe(0);
    expect(res.totalCollected).toBe(100000);
    expect(res.shortfall).toBe(0);
  });

  it('11. Mục C(3): trường shortfall = max(0, totalCost - totalCollected) và cảnh báo trong tin Zalo nếu > 0', () => {
    // 2 người đều 0 trận và chính sách FREE -> không thu được đồng nào
    const players = [
      makePlayer('p1', 'P1', 'M', 0),
      makePlayer('p2', 'P2', 'M', 0),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 100000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      zeroGamesPolicy: 'FREE',
    };

    const res = calculateSettlement(players, settings);
    expect(res.totalCost).toBe(100000);
    expect(res.totalCollected).toBe(0);
    expect(res.shortfall).toBe(100000);
  });

  it('12. Mục C(4): generateZaloSettlementMessage nhận dateStr từ ngoài thay vì new Date()', () => {
    const players = [
      makePlayer('p1', 'P1', 'M', 4),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 50000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
    };

    const customDate = '01/01/2030';
    const res = calculateSettlement(players, settings, [], customDate);
    expect(res.zaloMessage).toContain(`🏸 TỔNG KẾT CHI PHÍ CẦU LÔNG (${customDate}) 🏸`);
  });
});
