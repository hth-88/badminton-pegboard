import type { MatchHistory, Player, Sex } from '../types/badminton';

export type CourtCostMode = 'DIRECT' | 'HOURLY';
export type ShuttleCostMode = 'DIRECT' | 'BY_SHUTTLE' | 'BY_TUBE';
export type SplitMode = 'EQUAL' | 'GENDER_RATIO' | 'MALE_EXTRA';
export type UnderPlayedDiscountType = 'PROPORTIONAL' | 'PERCENT_50' | 'FREE';
export type ZeroGamesPolicy = 'FREE' | 'FULL';

export interface SettlementSettings {
  // Tiền sân
  courtCostMode: CourtCostMode;
  courtCostDirect: number;
  courtHourlyRate: number;
  courtHours: number;

  // Tiền cầu
  shuttleCostMode: ShuttleCostMode;
  shuttleCostDirect: number;
  shuttleCount: number;
  shuttlePrice: number;
  shuttleTubeCount: number;
  shuttleTubePrice: number;

  // Chi phí khác
  extraCost: number;
  extraCostNote: string;

  // Chế độ chia tiền
  splitMode: SplitMode;
  genderRatioMalePercent: number; // e.g. 60 (tức 60%)
  genderRatioFemalePercent: number; // e.g. 40 (tức 40%)
  maleExtraAmount: number; // e.g. 20000 (Nam đóng hơn Nữ 20.000đ)

  // Giảm giá người chơi ít (<= 2 trận)
  discountUnderPlayed: boolean;
  underPlayedThreshold: number; // default 2
  underPlayedDiscountType: UnderPlayedDiscountType;

  // Chính sách người 0 trận / PAUSED suốt buổi
  zeroGamesPolicy: ZeroGamesPolicy;

  // Thông tin chuyển khoản
  bankName: string;
  bankAccount: string;
  bankAccountHolder: string;
  bankNote: string;
}

export const DEFAULT_SETTLEMENT_SETTINGS: SettlementSettings = {
  courtCostMode: 'HOURLY',
  courtCostDirect: 0,
  courtHourlyRate: 90000,
  courtHours: 2,

  shuttleCostMode: 'BY_SHUTTLE',
  shuttleCostDirect: 0,
  shuttleCount: 6,
  shuttlePrice: 22000,
  shuttleTubeCount: 0,
  shuttleTubePrice: 250000,

  extraCost: 30000,
  extraCostNote: 'Nước uống',

  splitMode: 'EQUAL',
  genderRatioMalePercent: 60,
  genderRatioFemalePercent: 40,
  maleExtraAmount: 20000,

  discountUnderPlayed: true,
  underPlayedThreshold: 2,
  underPlayedDiscountType: 'PROPORTIONAL',

  zeroGamesPolicy: 'FREE',

  bankName: '',
  bankAccount: '',
  bankAccountHolder: '',
  bankNote: 'Tien cau long',
};

export interface PlayerSettlementItem {
  playerId: string;
  name: string;
  sex: Sex;
  gamesPlayed: number;
  isDiscounted: boolean;
  discountNote?: string;
  rawAmount: number;
  roundedAmount: number; // Ceiling to nearest 1,000 VNĐ
}

export interface SettlementCalculationResult {
  totalCost: number;
  courtCost: number;
  shuttleCost: number;
  extraCost: number;
  totalCollected: number;
  surplus: number;
  shortfall: number;
  warning?: string;
  payingPlayerCount: number;
  freePlayerCount: number;
  players: PlayerSettlementItem[];
  zaloMessage: string;
}

/**
 * Làm tròn lên đến 1.000đ gần nhất (Ceiling to nearest 1,000 VNĐ)
 */
export function ceilToNearest1000(amount: number): number {
  if (amount <= 0) return 0;
  return Math.ceil(amount / 1000) * 1000;
}

/**
 * Định dạng tiền tệ VNĐ (ví dụ: 50.000đ)
 */
export function formatVND(amount: number): string {
  const rounded = Math.round(amount);
  return `${rounded.toLocaleString('vi-VN')}đ`;
}

/**
 * Tính toán tổng chi phí từ cài đặt
 */
export function calculateTotalCosts(settings: SettlementSettings): {
  courtCost: number;
  shuttleCost: number;
  extraCost: number;
  totalCost: number;
} {
  // 1. Tiền sân
  let courtCost = 0;
  if (settings.courtCostMode === 'DIRECT') {
    courtCost = Math.max(0, Math.round(settings.courtCostDirect));
  } else {
    courtCost = Math.max(0, Math.round(settings.courtHourlyRate * settings.courtHours));
  }

  // 2. Tiền cầu
  let shuttleCost = 0;
  if (settings.shuttleCostMode === 'DIRECT') {
    shuttleCost = Math.max(0, Math.round(settings.shuttleCostDirect));
  } else if (settings.shuttleCostMode === 'BY_SHUTTLE') {
    shuttleCost = Math.max(0, Math.round(settings.shuttleCount * settings.shuttlePrice));
  } else {
    shuttleCost = Math.max(0, Math.round(settings.shuttleTubeCount * settings.shuttleTubePrice));
  }

  // 3. Chi phí khác
  const extraCost = Math.max(0, Math.round(settings.extraCost));

  const totalCost = courtCost + shuttleCost + extraCost;

  return { courtCost, shuttleCost, extraCost, totalCost };
}

/**
 * Hàm thuần tính toán quyết toán chi phí buổi đánh (Settlement Engine)
 */
export function calculateSettlement(
  allPlayers: Player[],
  settings: SettlementSettings = DEFAULT_SETTLEMENT_SETTINGS,
  _history: MatchHistory[] = [],
  dateStr?: string
): SettlementCalculationResult {
  const { courtCost, shuttleCost, extraCost, totalCost } = calculateTotalCosts(settings);

  if (allPlayers.length === 0 || totalCost === 0) {
    return {
      totalCost,
      courtCost,
      shuttleCost,
      extraCost,
      totalCollected: 0,
      surplus: 0,
      shortfall: totalCost,
      payingPlayerCount: 0,
      freePlayerCount: 0,
      players: allPlayers.map((p) => ({
        playerId: p.id,
        name: p.name,
        sex: p.sex,
        gamesPlayed: p.gamesPlayed,
        isDiscounted: false,
        rawAmount: 0,
        roundedAmount: 0,
      })),
      zaloMessage: 'Chưa có chi phí hoặc chưa có người chơi.',
    };
  }

  // 1. Phân loại người chơi: Miễn phí hay Tham gia đóng tiền
  const payingPlayers: Player[] = [];
  const freePlayers: Player[] = [];

  for (const p of allPlayers) {
    if (p.gamesPlayed === 0 && settings.zeroGamesPolicy === 'FREE') {
      freePlayers.push(p);
    } else {
      payingPlayers.push(p);
    }
  }

  if (payingPlayers.length === 0) {
    return {
      totalCost,
      courtCost,
      shuttleCost,
      extraCost,
      totalCollected: 0,
      surplus: 0,
      shortfall: totalCost,
      payingPlayerCount: 0,
      freePlayerCount: freePlayers.length,
      players: freePlayers.map((p) => ({
        playerId: p.id,
        name: p.name,
        sex: p.sex,
        gamesPlayed: 0,
        isDiscounted: false,
        discountNote: 'Chưa đánh trận nào (Miễn phí)',
        rawAmount: 0,
        roundedAmount: 0,
      })),
      zaloMessage: 'Tất cả người chơi đều đánh 0 trận (Miễn phí).',
    };
  }

  // 2. Kiểm tra tỉ lệ giới tính (Edge case: toàn Nam hoặc toàn Nữ -> Fallback về chia đều)
  const malePaying = payingPlayers.filter((p) => p.sex === 'M');
  const femalePaying = payingPlayers.filter((p) => p.sex === 'F');
  let effectiveSplitMode = settings.splitMode;

  if (malePaying.length === 0 || femalePaying.length === 0) {
    effectiveSplitMode = 'EQUAL';
  }

  // 3. Tính hệ số trọng số ban đầu (baseWeight) cho từng người theo splitMode
  const baseWeights: Record<string, number> = {};

  if (effectiveSplitMode === 'EQUAL') {
    for (const p of payingPlayers) {
      baseWeights[p.id] = 1;
    }
  } else if (effectiveSplitMode === 'GENDER_RATIO') {
    // Tỉ lệ Nam / Nữ (ví dụ 60% / 40%)
    // Tổng tỉ trọng Nam = malePercent, Nữ = femalePercent
    const totalMalePercent = settings.genderRatioMalePercent || 50;
    const totalFemalePercent = settings.genderRatioFemalePercent || 50;
    const perMaleWeight = totalMalePercent / (malePaying.length || 1);
    const perFemaleWeight = totalFemalePercent / (femalePaying.length || 1);

    for (const p of payingPlayers) {
      baseWeights[p.id] = p.sex === 'M' ? perMaleWeight : perFemaleWeight;
    }
  }

  let maleExtraWarning: string | undefined;
  if (effectiveSplitMode === 'MALE_EXTRA') {
    // Nam đóng thêm X đồng
    // Ta tính theo công thức: Nữ đóng F, Nam đóng F + X
    // femalePaying.length * F + malePaying.length * (F + X) = totalCost
    // F * (N) + malePaying.length * X = totalCost
    // F = (totalCost - malePaying.length * X) / N
    const N = payingPlayers.length;
    let maleExtra = settings.maleExtraAmount || 0;
    const totalExtra = malePaying.length * maleExtra;
    let femaleBaseShare = 0;
    let maleBaseShare = 0;

    // (2) MALE_EXTRA: nếu totalExtra > totalCost thì không ép về 0, mà giới hạn maleExtra để tổng vẫn bằng totalCost và đặt cờ warning vào kết quả
    if (totalExtra > totalCost) {
      maleExtra = totalCost / (malePaying.length || 1);
      femaleBaseShare = 0;
      maleBaseShare = maleExtra;
      maleExtraWarning = 'Tiền phụ thu Nam vượt quá tổng chi phí, đã tự động giới hạn mức phụ thu để tổng bằng tổng chi phí.';
    } else {
      femaleBaseShare = (totalCost - totalExtra) / N;
      maleBaseShare = femaleBaseShare + maleExtra;
    }

    for (const p of payingPlayers) {
      baseWeights[p.id] = p.sex === 'M' ? maleBaseShare : femaleBaseShare;
    }
  }

  // Chuẩn hóa trọng số thành số tiền ban đầu (initialShare)
  const initialShares: Record<string, number> = {};
  if (effectiveSplitMode === 'MALE_EXTRA') {
    for (const p of payingPlayers) {
      initialShares[p.id] = baseWeights[p.id];
    }
  } else {
    const sumWeights = Object.values(baseWeights).reduce((a, b) => a + b, 0);
    for (const p of payingPlayers) {
      initialShares[p.id] = (baseWeights[p.id] / (sumWeights || 1)) * totalCost;
    }
  }

  // 4. Áp dụng Giảm giá người chơi ít (Under-played Discount)
  // Tính số trận trung bình của người đủ trận để tính tỉ lệ
  const threshold = settings.underPlayedThreshold || 2;
  const maxGames = Math.max(...payingPlayers.map((p) => p.gamesPlayed), 1);
  const avgFullGames = Math.max(
    threshold + 1,
    payingPlayers.filter((p) => p.gamesPlayed > threshold).reduce((sum, p) => sum + p.gamesPlayed, 0) /
      (payingPlayers.filter((p) => p.gamesPlayed > threshold).length || 1)
  );

  const discountNotes: Record<string, string> = {};
  const discountedShares: Record<string, number> = {};
  let totalDeficit = 0;
  const regularPlayerIds: string[] = [];

  for (const p of payingPlayers) {
    const share = initialShares[p.id];
    const isUnderPlayed = settings.discountUnderPlayed && p.gamesPlayed <= threshold;

    if (isUnderPlayed) {
      let finalDiscounted = share;
      if (settings.underPlayedDiscountType === 'FREE') {
        finalDiscounted = 0;
        discountNotes[p.id] = `Đánh ${p.gamesPlayed} trận (Miễn phí)`;
      } else if (settings.underPlayedDiscountType === 'PERCENT_50') {
        finalDiscounted = share * 0.5;
        discountNotes[p.id] = `Đánh ${p.gamesPlayed} trận (Giảm 50%)`;
      } else {
        // PROPORTIONAL: tỉ lệ số trận đánh / số trận trung bình
        const ratio = Math.min(1, Math.max(0.2, p.gamesPlayed / (avgFullGames || maxGames)));
        finalDiscounted = share * ratio;
        discountNotes[p.id] = `Đánh ${p.gamesPlayed} trận (Giảm theo số trận: ${Math.round(ratio * 100)}%)`;
      }

      discountedShares[p.id] = finalDiscounted;
      totalDeficit += share - finalDiscounted;
    } else {
      discountedShares[p.id] = share;
      regularPlayerIds.push(p.id);
    }
  }

  // 5. Bù phần tiền thiếu hụt (deficit) do giảm giá chia đều cho những người chơi đủ trận
  // (1) nếu không có người chơi đủ trận để bù phần giảm giá thì HỦY toàn bộ giảm giá (mọi người trả đúng phần chia gốc) để tổng thu >= tổng chi
  if (totalDeficit > 0) {
    if (regularPlayerIds.length > 0) {
      const deficitPerRegular = totalDeficit / regularPlayerIds.length;
      for (const rid of regularPlayerIds) {
        discountedShares[rid] += deficitPerRegular;
      }
    } else {
      for (const p of payingPlayers) {
        discountedShares[p.id] = initialShares[p.id];
        delete discountNotes[p.id];
      }
    }
  }

  // 6. Làm tròn LÊN đến 1.000đ gần nhất (Ceiling to nearest 1,000 VNĐ)
  const resultItems: PlayerSettlementItem[] = [];
  let totalCollected = 0;

  for (const p of payingPlayers) {
    const raw = discountedShares[p.id];
    const rounded = ceilToNearest1000(raw);
    totalCollected += rounded;

    resultItems.push({
      playerId: p.id,
      name: p.name,
      sex: p.sex,
      gamesPlayed: p.gamesPlayed,
      isDiscounted: Boolean(discountNotes[p.id]),
      discountNote: discountNotes[p.id],
      rawAmount: Math.round(raw),
      roundedAmount: rounded,
    });
  }

  // Thêm người miễn phí 0 trận
  for (const p of freePlayers) {
    resultItems.push({
      playerId: p.id,
      name: p.name,
      sex: p.sex,
      gamesPlayed: 0,
      isDiscounted: false,
      discountNote: '0 trận (Miễn phí)',
      rawAmount: 0,
      roundedAmount: 0,
    });
  }

  // Sắp xếp kết quả: số tiền giảm dần, sau đó theo tên
  resultItems.sort((a, b) => {
    if (b.roundedAmount !== a.roundedAmount) {
      return b.roundedAmount - a.roundedAmount;
    }
    return a.name.localeCompare(b.name);
  });

  const surplus = Math.max(0, totalCollected - totalCost);
  const shortfall = Math.max(0, totalCost - totalCollected);

  // 7. Tạo tin nhắn Zalo chuẩn mẫu
  const zaloMessage = generateZaloSettlementMessage({
    totalCost,
    courtCost,
    shuttleCost,
    extraCost,
    totalCollected,
    surplus,
    shortfall,
    players: resultItems,
    settings,
    dateStr,
  });

  return {
    totalCost,
    courtCost,
    shuttleCost,
    extraCost,
    totalCollected,
    surplus,
    shortfall,
    warning: maleExtraWarning,
    payingPlayerCount: payingPlayers.length,
    freePlayerCount: freePlayers.length,
    players: resultItems,
    zaloMessage,
  };
}

/**
 * Sinh nội dung tin nhắn Zalo đẹp, đầy đủ thông tin để Host dán vào nhóm
 */
export function generateZaloSettlementMessage(data: {
  totalCost: number;
  courtCost: number;
  shuttleCost: number;
  extraCost: number;
  totalCollected: number;
  surplus: number;
  shortfall?: number;
  players: PlayerSettlementItem[];
  settings: SettlementSettings;
  dateStr?: string;
}): string {
  const { totalCost, courtCost, shuttleCost, extraCost, surplus, shortfall = 0, players, settings, dateStr } = data;
  const displayDate = dateStr || new Date().toLocaleDateString('vi-VN');

  const lines: string[] = [];
  lines.push(`🏸 TỔNG KẾT CHI PHÍ CẦU LÔNG (${displayDate}) 🏸`);
  lines.push('----------------------------------------');
  lines.push(`• Tiền sân: ${formatVND(courtCost)}`);
  lines.push(`• Tiền cầu: ${formatVND(shuttleCost)}`);
  if (extraCost > 0) {
    lines.push(`• Chi phí khác (${settings.extraCostNote || 'Nước...'}): ${formatVND(extraCost)}`);
  }
  lines.push(`👉 TỔNG CỘNG: ${formatVND(totalCost)}`);
  if (surplus > 0) {
    lines.push(`(Làm tròn chẵn 1.000đ dôi dư: +${formatVND(surplus)} vào quỹ cầu lần sau)`);
  }
  if (shortfall > 0) {
    lines.push(`⚠️ CẢNH BÁO: Thu thiếu ${formatVND(shortfall)} so với tổng chi phí!`);
  }
  lines.push('----------------------------------------');
  lines.push('💰 DANH SÁCH ĐÓNG TIỀN:');

  players.forEach((p, idx) => {
    const amountStr = p.roundedAmount === 0 ? 'Miễn phí' : formatVND(p.roundedAmount);
    const noteStr = p.discountNote ? ` (${p.discountNote})` : '';
    lines.push(`${idx + 1}. ${p.name}: ${amountStr}${noteStr}`);
  });

  if (settings.bankAccount && settings.bankName) {
    lines.push('----------------------------------------');
    lines.push('🏦 THÔNG TIN CHUYỂN KHOẢN:');
    lines.push(`• Ngân hàng: ${settings.bankName}`);
    lines.push(`• Số TK: ${settings.bankAccount}`);
    if (settings.bankAccountHolder) {
      lines.push(`• Chủ TK: ${settings.bankAccountHolder}`);
    }
    if (settings.bankNote) {
      lines.push(`• Nội dung CK: ${settings.bankNote}`);
    }
  }

  lines.push('----------------------------------------');
  lines.push('Cảm ơn mọi người đã tham gia buổi giao lưu! Chúc anh em buổi tối vui vẻ! ❤️');

  return lines.join('\n');
}
