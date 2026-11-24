import { describe, expect, it } from 'vitest';
import type { Player } from '../../types/badminton';
import {
  areSettlementDataEqual,
  calculateSettlement,
  ceilToNearest1000,
  createDefaultCloudSettlementData,
  DEFAULT_SETTLEMENT_SETTINGS,
  normalizeCloudSettlementData,
  type SettlementSettings,
} from '../settlement';
import {
  clearPaymentRecords,
  getPaymentRecords,
  savePaymentRecords,
  STORAGE_KEY_PAID_PLAYERS,
  STORAGE_KEY_PAYMENT_RECORDS,
} from '../storage';

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

  it('2b. GENDER_RATIO khi số lượng Nam và Nữ chênh lệch lớn (12 Nam, 4 Nữ): Nam luôn đóng nhiều hơn Nữ theo đúng tỷ lệ cá nhân', () => {
    const players = [
      ...Array.from({ length: 12 }, (_, i) => makePlayer(`m_${i}`, `Nam ${i + 1}`, 'M', 4)),
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`f_${i}`, `Nữ ${i + 1}`, 'F', 4)),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 880000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'GENDER_RATIO',
      genderRatioMalePercent: 60,
      genderRatioFemalePercent: 40,
      discountUnderPlayed: false,
    };

    const res = calculateSettlement(players, settings);
    expect(res.totalCost).toBe(880000);

    const males = res.players.filter((p) => p.sex === 'M');
    const females = res.players.filter((p) => p.sex === 'F');

    // 12 Nam * 60 + 4 Nữ * 40 = 720 + 160 = 880 phần
    // Mỗi Nam = 60/880 * 880.000 = 60.000đ
    // Mỗi Nữ = 40/880 * 880.000 = 40.000đ
    expect(males.every((p) => p.roundedAmount === 60000)).toBe(true);
    expect(females.every((p) => p.roundedAmount === 40000)).toBe(true);
    expect(res.totalCollected).toBe(880000);
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

  it('13. Tùy chọn hideZeroCostPlayers: ẩn người 0đ (0 trận) khỏi tin Zalo', () => {
    const players = [
      makePlayer('p1', 'Tuấn', 'M', 4),
      makePlayer('p2', 'Nghỉ Ở Nhà', 'M', 0),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 60000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      zeroGamesPolicy: 'FREE',
    };

    // Khi hideZeroCostPlayers: true
    const resHidden = calculateSettlement(players, settings, [], undefined, {
      hideZeroCostPlayers: true,
    });
    expect(resHidden.zaloMessage).toContain('Tuấn');
    expect(resHidden.zaloMessage).not.toContain('Nghỉ Ở Nhà');

    // Khi không ẩn (mặc định)
    const resDefault = calculateSettlement(players, settings);
    expect(resDefault.zaloMessage).toContain('Tuấn');
    expect(resDefault.zaloMessage).toContain('Nghỉ Ở Nhà');
  });

  it('14. Kiểm tra cấu hình giá mặc định chuẩn CLB', () => {
    expect(DEFAULT_SETTLEMENT_SETTINGS.courtHourlyRate).toBe(160000);
    expect(DEFAULT_SETTLEMENT_SETTINGS.shuttlePrice).toBe(30000);
    expect(DEFAULT_SETTLEMENT_SETTINGS.extraCost).toBe(0);
  });

  it('15. Mục A2: zeroGamesPolicy = FULL không bị giảm giá bởi discountUnderPlayed (PROPORTIONAL, PERCENT_50, FREE)', () => {
    const players = [
      makePlayer('p1', 'An', 'M', 4),
      makePlayer('p2', 'Bình', 'M', 4),
      makePlayer('p3', 'Cường', 'M', 4),
      makePlayer('pZero', 'Dũng', 'M', 0),
    ];

    const discountTypes: SettlementSettings['underPlayedDiscountType'][] = [
      'PROPORTIONAL',
      'PERCENT_50',
      'FREE',
    ];

    for (const underPlayedDiscountType of discountTypes) {
      const settings: SettlementSettings = {
        ...DEFAULT_SETTLEMENT_SETTINGS,
        courtCostMode: 'DIRECT',
        courtCostDirect: 200000,
        shuttleCostMode: 'DIRECT',
        shuttleCostDirect: 0,
        extraCost: 0,
        splitMode: 'EQUAL',
        discountUnderPlayed: true,
        underPlayedThreshold: 2,
        underPlayedDiscountType,
        zeroGamesPolicy: 'FULL',
      };

      const res = calculateSettlement(players, settings);
      const pZero = res.players.find((p) => p.playerId === 'pZero')!;
      const others = res.players.filter((p) => p.playerId !== 'pZero');

      expect(pZero.isDiscounted).toBe(false);
      expect(pZero.roundedAmount).toBe(50000);
      expect(others.every((p) => p.roundedAmount === 50000)).toBe(true);
      expect(res.totalCollected).toBe(200000);
      expect(res.surplus).toBe(0);
    }
  });

  it('16. Mục A2: zeroGamesPolicy = FULL vẫn giảm giá bình thường cho người đánh 1..threshold trận và chia bù cho cả người 0 trận', () => {
    const players = [
      makePlayer('p1', 'An', 'M', 4),
      makePlayer('p2', 'Bình', 'M', 4),
      makePlayer('pOne', 'Hùng', 'M', 1),
      makePlayer('pZero', 'Dũng', 'M', 0),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 200000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'EQUAL',
      discountUnderPlayed: true,
      underPlayedThreshold: 2,
      underPlayedDiscountType: 'PERCENT_50',
      zeroGamesPolicy: 'FULL',
    };

    const res = calculateSettlement(players, settings);
    const pOne = res.players.find((p) => p.playerId === 'pOne')!;
    const pZero = res.players.find((p) => p.playerId === 'pZero')!;
    const p1 = res.players.find((p) => p.playerId === 'p1')!;
    const p2 = res.players.find((p) => p.playerId === 'p2')!;

    expect(pOne.isDiscounted).toBe(true);
    expect(pOne.roundedAmount).toBe(25000);
    expect(pZero.isDiscounted).toBe(false);
    expect(pZero.roundedAmount).toBe(59000);
    expect(p1.roundedAmount).toBe(59000);
    expect(p2.roundedAmount).toBe(59000);
    expect(res.totalCollected).toBe(202000);
    expect(res.surplus).toBe(2000);
  });

  it('17. Mục A3: ceilToNearest1000 không bị đội thêm 1.000đ do sai số IEEE-754 và không trả về -0', () => {
    expect(ceilToNearest1000(60000.00000000001)).toBe(60000);
    expect(ceilToNearest1000(50000.01)).toBe(51000);
    const zeroRes = ceilToNearest1000(1e-9);
    expect(zeroRes).toBe(0);
    expect(Object.is(zeroRes, 0)).toBe(true);
  });

  it('18. Mục A3: GENDER_RATIO 60/40 với 3 Nam + 4 Nữ, tổng 340.000đ chia tròn 60.000đ / 40.000đ (không dư ảo 3.000đ)', () => {
    const players = [
      makePlayer('m1', 'Nam 1', 'M', 4),
      makePlayer('m2', 'Nam 2', 'M', 4),
      makePlayer('m3', 'Nam 3', 'M', 4),
      makePlayer('f1', 'Nữ 1', 'F', 4),
      makePlayer('f2', 'Nữ 2', 'F', 4),
      makePlayer('f3', 'Nữ 3', 'F', 4),
      makePlayer('f4', 'Nữ 4', 'F', 4),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'HOURLY',
      courtHourlyRate: 160000,
      courtHours: 1,
      shuttleCostMode: 'BY_SHUTTLE',
      shuttleCount: 6,
      shuttlePrice: 30000,
      extraCost: 0,
      splitMode: 'GENDER_RATIO',
      genderRatioMalePercent: 60,
      genderRatioFemalePercent: 40,
      discountUnderPlayed: false,
    };

    const res = calculateSettlement(players, settings);
    expect(res.totalCost).toBe(340000);
    for (const p of res.players) {
      if (p.sex === 'M') {
        expect(p.roundedAmount).toBe(60000);
      } else {
        expect(p.roundedAmount).toBe(40000);
      }
    }
    expect(res.totalCollected).toBe(340000);
    expect(res.surplus).toBe(0);
  });

  it('19. Mục A12: 800k / 8 người EQUAL (7 người 2 trận giảm 50%, 1 người 3 trận) -> khóa trần +30% (130k), 7 người đánh ít đóng 96k, tổng thu >= 800k, shortfall = 0, có warning', () => {
    const players = [
      makePlayer('pFull', 'Anh Nam', 'M', 3),
      ...Array.from({ length: 7 }, (_, i) => makePlayer(`p${i}`, `Người ${i + 1}`, 'M', 2)),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 800000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'EQUAL',
      discountUnderPlayed: true,
      underPlayedThreshold: 2,
      underPlayedDiscountType: 'PERCENT_50',
    };

    const res = calculateSettlement(players, settings);
    const full = res.players.find((p) => p.playerId === 'pFull')!;
    const under = res.players.filter((p) => p.playerId !== 'pFull');

    expect(full.roundedAmount).toBe(130000);
    expect(under.every((p) => p.roundedAmount === 96000)).toBe(true);
    expect(res.totalCollected).toBe(802000);
    expect(res.shortfall).toBe(0);
    expect(res.warning).toBeDefined();
  });

  it('20. Mục A12: chế độ FREE khi 7 người đánh ít và 1 người đủ trận -> người đủ trận vẫn tối đa 130k, không bị gánh 800k, có warning', () => {
    const players = [
      makePlayer('pFull', 'Anh Nam', 'M', 3),
      ...Array.from({ length: 7 }, (_, i) => makePlayer(`p${i}`, `Người ${i + 1}`, 'F', 2)),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 800000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'EQUAL',
      discountUnderPlayed: true,
      underPlayedThreshold: 2,
      underPlayedDiscountType: 'FREE',
    };

    const res = calculateSettlement(players, settings);
    const full = res.players.find((p) => p.playerId === 'pFull')!;
    const under = res.players.filter((p) => p.playerId !== 'pFull');

    expect(full.roundedAmount).toBe(130000);
    expect(under.every((p) => p.roundedAmount === 96000)).toBe(true);
    expect(res.totalCollected).toBe(802000);
    expect(res.shortfall).toBe(0);
    expect(res.warning).toBeDefined();
  });

  it('21. Mục A12: bảo toàn thứ tự công bằng khi co mức giảm (1 trận < 2 trận < 3 trận) trong PROPORTIONAL', () => {
    const players = [
      makePlayer('p1g', 'Ít nhất', 'M', 1),
      ...Array.from({ length: 6 }, (_, i) => makePlayer(`p2g_${i}`, `Vừa ${i + 1}`, 'M', 2)),
      makePlayer('p3g', 'Đủ trận', 'M', 3),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 800000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'EQUAL',
      discountUnderPlayed: true,
      underPlayedThreshold: 2,
      underPlayedDiscountType: 'PROPORTIONAL',
    };

    const res = calculateSettlement(players, settings);
    const p1 = res.players.find((p) => p.playerId === 'p1g')!;
    const p2 = res.players.find((p) => p.playerId === 'p2g_0')!;
    const p3 = res.players.find((p) => p.playerId === 'p3g')!;

    expect(p3.roundedAmount).toBe(130000);
    expect(p1.roundedAmount).toBeLessThan(p2.roundedAmount);
    expect(p2.roundedAmount).toBeLessThan(p3.roundedAmount);
    expect(res.shortfall).toBe(0);
    expect(res.warning).toBeDefined();
  });

  it('22. Mục C3: GENDER_RATIO 65/35 (4 Nam + 4 Nữ, 800k, 1 Nam + 1 Nữ về sớm giảm 50%) -> Nam đóng 152k, Nữ đóng 82k (giữ nguyên tỷ lệ 65:35 cả dưới trần lẫn khi chạm trần +30%)', () => {
    // Trường hợp 1: dưới trần
    const playersUnderCap = [
      makePlayer('m1', 'Nam 1', 'M', 2),
      makePlayer('m2', 'Nam 2', 'M', 4),
      makePlayer('m3', 'Nam 3', 'M', 4),
      makePlayer('m4', 'Nam 4', 'M', 4),
      makePlayer('f1', 'Nữ 1', 'F', 2),
      makePlayer('f2', 'Nữ 2', 'F', 4),
      makePlayer('f3', 'Nữ 3', 'F', 4),
      makePlayer('f4', 'Nữ 4', 'F', 4),
    ];

    const settings: SettlementSettings = {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 800000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'GENDER_RATIO',
      genderRatioMalePercent: 65,
      genderRatioFemalePercent: 35,
      discountUnderPlayed: true,
      underPlayedThreshold: 2,
      underPlayedDiscountType: 'PERCENT_50',
    };

    const resUnder = calculateSettlement(playersUnderCap, settings);
    const mFull = resUnder.players.find((p) => p.playerId === 'm2')!;
    const fFull = resUnder.players.find((p) => p.playerId === 'f2')!;

    expect(mFull.roundedAmount).toBe(152000);
    expect(fFull.roundedAmount).toBe(82000);
    expect(resUnder.warning).toBeUndefined();
    expect(resUnder.shortfall).toBe(0);

    // Trường hợp 2: chạm trần +30% (3 Nam + 3 Nữ về sớm, 1 Nam + 1 Nữ đủ trận)
    const playersAtCap = [
      makePlayer('m1', 'Nam 1', 'M', 2),
      makePlayer('m2', 'Nam 2', 'M', 2),
      makePlayer('m3', 'Nam 3', 'M', 2),
      makePlayer('m4', 'Nam 4', 'M', 4),
      makePlayer('f1', 'Nữ 1', 'F', 2),
      makePlayer('f2', 'Nữ 2', 'F', 2),
      makePlayer('f3', 'Nữ 3', 'F', 2),
      makePlayer('f4', 'Nữ 4', 'F', 4),
    ];

    const resCap = calculateSettlement(playersAtCap, settings);
    const m4 = resCap.players.find((p) => p.playerId === 'm4')!;
    const f4 = resCap.players.find((p) => p.playerId === 'f4')!;

    // Mức gốc: Nam 130k, Nữ 70k -> trần +30%: Nam 169k, Nữ 91k (đúng tỷ lệ 65:35)
    expect(m4.roundedAmount).toBe(169000);
    expect(f4.roundedAmount).toBe(91000);
    expect(m4.rawAmount / f4.rawAmount).toBeCloseTo(65 / 35, 4);
    expect(resCap.shortfall).toBe(0);
    expect(resCap.warning).toBeDefined();
  });

  it('23. Mục C3 + A12: MALE_EXTRA +20k dưới trần giữ đúng chênh lệch +20k; khi Nữ chạm trần +30% trước thì water-filling sang Nam không vượt +30%', () => {
    // 1. Dưới trần: 4 Nam + 4 Nữ, 800k, Nam thêm +20k -> M gốc 110k, F gốc 90k
    const playersUnder = [
      makePlayer('m1', 'Nam 1', 'M', 2),
      makePlayer('m2', 'Nam 2', 'M', 4),
      makePlayer('m3', 'Nam 3', 'M', 4),
      makePlayer('m4', 'Nam 4', 'M', 4),
      makePlayer('f1', 'Nữ 1', 'F', 2),
      makePlayer('f2', 'Nữ 2', 'F', 4),
      makePlayer('f3', 'Nữ 3', 'F', 4),
      makePlayer('f4', 'Nữ 4', 'F', 4),
    ];

    const resUnder = calculateSettlement(playersUnder, {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 800000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'MALE_EXTRA',
      maleExtraAmount: 20000,
      discountUnderPlayed: true,
      underPlayedThreshold: 2,
      underPlayedDiscountType: 'PERCENT_50',
    });

    const mUnder = resUnder.players.find((p) => p.playerId === 'm2')!;
    const fUnder = resUnder.players.find((p) => p.playerId === 'f2')!;
    expect(mUnder.roundedAmount - fUnder.roundedAmount).toBe(20000);
    expect(resUnder.shortfall).toBe(0);

    // 2. Chênh lớn khiến Nữ chạm trần +30% trước: 4M + 4F, 160k, maleExtra = 30k
    // Gốc: F = 5k (trần +30% = 6.5k), M = 35k (trần +30% = 45.5k)
    // 3M + 3F đánh ít (FREE), 1M + 1F đủ trận -> F khóa ở 6.5k (7k), M nhận tối đa 45.5k (46k)
    const playersCap = [
      makePlayer('m1', 'Nam 1', 'M', 1),
      makePlayer('m2', 'Nam 2', 'M', 1),
      makePlayer('m3', 'Nam 3', 'M', 1),
      makePlayer('m4', 'Nam 4', 'M', 4),
      makePlayer('f1', 'Nữ 1', 'F', 1),
      makePlayer('f2', 'Nữ 2', 'F', 1),
      makePlayer('f3', 'Nữ 3', 'F', 1),
      makePlayer('f4', 'Nữ 4', 'F', 4),
    ];

    const resCap = calculateSettlement(playersCap, {
      ...DEFAULT_SETTLEMENT_SETTINGS,
      courtCostMode: 'DIRECT',
      courtCostDirect: 160000,
      shuttleCostMode: 'DIRECT',
      shuttleCostDirect: 0,
      extraCost: 0,
      splitMode: 'MALE_EXTRA',
      maleExtraAmount: 30000,
      discountUnderPlayed: true,
      underPlayedThreshold: 2,
      underPlayedDiscountType: 'FREE',
    });

    const mCap = resCap.players.find((p) => p.playerId === 'm4')!;
    const fCap = resCap.players.find((p) => p.playerId === 'f4')!;
    expect(fCap.rawAmount).toBeLessThanOrEqual(6500);
    expect(mCap.rawAmount).toBeLessThanOrEqual(45500);
    expect(resCap.shortfall).toBe(0);
    expect(resCap.warning).toBeDefined();
  });

  it('24. Mục C4: normalizeCloudSettlementData chuẩn hóa dữ liệu thiếu trường, lọc UNPAID/rác và trả null khi input sai', () => {
    expect(normalizeCloudSettlementData(null)).toBeNull();
    expect(normalizeCloudSettlementData([])).toBeNull();
    expect(normalizeCloudSettlementData('bad')).toBeNull();

    const normalized = normalizeCloudSettlementData({
      settings: { shuttleCount: 10, bankAccount: '012345' },
      payments: {
        p1: { status: 'PAID', approvedAt: 5000 },
        p2: { status: 'PENDING_REVIEW', reportedAt: 4000 },
        p3: { status: 'UNPAID' },
        p4: { status: 'INVALID' },
        p5: null,
      },
      updatedAt: -10,
    });

    expect(normalized).not.toBeNull();
    expect(normalized!.settings.shuttleCount).toBe(10);
    expect(normalized!.settings.bankAccount).toBe('012345');
    expect(normalized!.settings.courtHourlyRate).toBe(DEFAULT_SETTLEMENT_SETTINGS.courtHourlyRate);
    expect(normalized!.payments).toEqual({
      p1: { status: 'PAID', approvedAt: 5000 },
      p2: { status: 'PENDING_REVIEW', reportedAt: 4000 },
    });
    expect(normalized!.updatedAt).toBe(0);
  });

  it('25. Mục C4: areSettlementDataEqual bỏ qua updatedAt khác nhau nhưng phát hiện thay đổi settings hoặc payments', () => {
    const a = createDefaultCloudSettlementData(1000);
    const b = createDefaultCloudSettlementData(9999);
    expect(areSettlementDataEqual(a, b)).toBe(true);

    const c = {
      ...b,
      settings: { ...b.settings, shuttleCount: 99 },
    };
    expect(areSettlementDataEqual(a, c)).toBe(false);

    const d = {
      ...b,
      payments: { p1: { status: 'PENDING_REVIEW' as const, reportedAt: 2000 } },
    };
    expect(areSettlementDataEqual(a, d)).toBe(false);

    const e = {
      ...b,
      payments: { p1: { status: 'PAID' as const, approvedAt: 3000 } },
    };
    expect(areSettlementDataEqual(d, e)).toBe(false);
  });

  it('26. Mục C4: storage getPaymentRecords migrate từ legacy badminton_paid_players, savePaymentRecords & clearPaymentRecords đồng bộ cả 2 key', () => {
    const mockStore: Record<string, string> = {
      [STORAGE_KEY_PAID_PLAYERS]: JSON.stringify(['p1', 'p2']),
    };
    const prevStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => mockStore[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStore[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockStore[k];
        },
      },
      writable: true,
      configurable: true,
    });

    try {
      const migrated = getPaymentRecords();
      expect(migrated).toEqual({
        p1: { status: 'PAID' },
        p2: { status: 'PAID' },
      });

      savePaymentRecords({
        p1: { status: 'PAID', approvedAt: 1000 },
        p3: { status: 'PENDING_REVIEW', reportedAt: 2000 },
        p4: { status: 'UNPAID' },
      });

      expect(JSON.parse(mockStore[STORAGE_KEY_PAYMENT_RECORDS])).toEqual({
        p1: { status: 'PAID', approvedAt: 1000 },
        p3: { status: 'PENDING_REVIEW', reportedAt: 2000 },
      });
      expect(JSON.parse(mockStore[STORAGE_KEY_PAID_PLAYERS])).toEqual(['p1']);

      clearPaymentRecords();
      expect(mockStore[STORAGE_KEY_PAYMENT_RECORDS]).toBeUndefined();
      expect(mockStore[STORAGE_KEY_PAID_PLAYERS]).toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: prevStorage,
        writable: true,
        configurable: true,
      });
    }
  });

  it('27. Nhóm 3: normalizeCloudSettlementData bảo toàn REJECTED, rejectionReason, receiptUrl hợp lệ và lọc URL lạ', () => {
    const normalized = normalizeCloudSettlementData({
      payments: {
        p1: {
          status: 'PENDING_REVIEW',
          reportedAt: 1000,
          receiptUrl: 'https://cdn.example.com/receipt1.jpg',
          receiptPath: 'SAN68/p1_1000.jpg',
        },
        p2: {
          status: 'REJECTED',
          rejectedAt: 2000,
          rejectionReason: '   Ảnh mờ   ',
          receiptUrl: 'javascript:alert(1)',
        },
      },
      updatedAt: 2500,
    });

    expect(normalized).not.toBeNull();
    expect(normalized!.payments.p1).toEqual({
      status: 'PENDING_REVIEW',
      reportedAt: 1000,
      receiptUrl: 'https://cdn.example.com/receipt1.jpg',
      receiptPath: 'SAN68/p1_1000.jpg',
    });
    expect(normalized!.payments.p2).toEqual({
      status: 'REJECTED',
      rejectedAt: 2000,
      rejectionReason: 'Ảnh mờ',
    });
  });

  it('28. Nhóm 3: areSettlementDataEqual phát hiện thay đổi receiptUrl hoặc rejectionReason dù cùng status', () => {
    const base = {
      ...createDefaultCloudSettlementData(1000),
      payments: {
        p1: {
          status: 'PENDING_REVIEW' as const,
          receiptUrl: 'https://cdn.example.com/a.jpg',
        },
        p2: {
          status: 'REJECTED' as const,
          rejectedAt: 2000,
          rejectionReason: 'Ảnh mờ',
        },
      },
    };

    const same = {
      ...base,
      updatedAt: 9999,
    };
    expect(areSettlementDataEqual(base, same)).toBe(true);

    const diffReceipt = {
      ...base,
      payments: {
        ...base.payments,
        p1: {
          status: 'PENDING_REVIEW' as const,
          receiptUrl: 'https://cdn.example.com/b.jpg',
        },
      },
    };
    expect(areSettlementDataEqual(base, diffReceipt)).toBe(false);

    const diffReason = {
      ...base,
      payments: {
        ...base.payments,
        p2: {
          status: 'REJECTED' as const,
          rejectedAt: 2000,
          rejectionReason: 'Thiếu tiền',
        },
      },
    };
    expect(areSettlementDataEqual(base, diffReason)).toBe(false);
  });
});
