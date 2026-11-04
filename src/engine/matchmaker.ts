import type {
  BadmintonSessionState,
  Court,
  CourtPlanMap,
  FixedSlot,
  Lineup,
  MatchHistory,
  MatchProposal,
  MatchScoreBreakdown,
  MatchType,
  PairRule,
  PenaltyWeights,
  Player,
  SessionSettings,
  Team,
} from '../types/badminton';
import { getEffectiveSkill } from './skillConfig';
import {
  buildStatsFromHistory,
  getOpponentCount,
  getPartnerCount,
  isRecentOpponent,
  isRecentPartner,
} from './statsManager';

/**
 * Hàm băm giả lập tất định (Deterministic Pseudo Hash) từ chuỗi và seed
 * Không sử dụng Math.random() để đảm bảo tính thuần túy (pure function)
 */
export function pseudoHash(str: string, seed: number): number {
  let h = (seed ^ 0x12345678) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Tạo một MatchScoreBreakdown rỗng
 */
export function createEmptyBreakdown(): MatchScoreBreakdown {
  return {
    waitPenalty: 0,
    exactQuartetRepeatPenalty: 0,
    exactPairRepeatPenalty: 0,
    partnerRepeatPenalty: 0,
    opponentRepeatPenalty: 0,
    skillBalancePenalty: 0,
    genderStructurePenalty: 0,
    avoidMatchPenalty: 0,
    singlesCountPenalty: 0,
    totalPenalty: 0,
    team1Skill: 0,
    team2Skill: 0,
    skillDiff: 0,
  };
}

/**
 * Sắp xếp người chơi theo độ ưu tiên chờ đợi:
 * - Ưu tiên 1: waitStreak cao nhất (descending)
 * - Ưu tiên 2: effectiveGames = gamesPlayed + virtualGamesOffset thấp nhất (ascending)
 * - Ưu tiên 3: lastPlayedAt lâu nhất (ascending, 0 là chưa từng đánh)
 * - Tie-breaker: id tăng dần để đảm bảo tính tất định
 */
export function sortPlayersByWaitPriority(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    if (b.waitStreak !== a.waitStreak) {
      return b.waitStreak - a.waitStreak;
    }
    const effA = a.gamesPlayed + a.virtualGamesOffset;
    const effB = b.gamesPlayed + b.virtualGamesOffset;
    if (effA !== effB) {
      return effA - effB;
    }
    if (a.lastPlayedAt !== b.lastPlayedAt) {
      return a.lastPlayedAt - b.lastPlayedAt;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Lọc danh sách người chơi hợp lệ cho một sân cụ thể:
 * - status === 'ACTIVE'
 * - Không đang đánh ở bất kỳ sân nào (currentMatch)
 * - (Mục 4) Chỉ coi là bận người thuộc:
 *   (a) currentMatch
 *   (b) nextUp ĐÃ KHÓA của sân khác (isLockedByHost === true)
 *   (c) nextUp có slot MANUAL của sân khác (đúng các slot MANUAL)
 *   nextUp chưa khóa và toàn AUTO bị bỏ qua và được tính lại.
 * - Không nằm trong tập reserved (đã gán cho sân trước trong cùng lượt planAllCourts)
 * - Nếu SPLIT_COURT: assignedPool === court.id hoặc assignedPool === 'ALL'
 */
export function getValidAvailablePlayersForCourt(
  court: Court,
  courts: Court[],
  players: Player[],
  reservedPlayerIds: Set<string>,
  settings: SessionSettings
): Player[] {
  const busyIds = new Set<string>();

  for (const c of courts) {
    if (c.isActive && c.currentMatch) {
      c.currentMatch.team1.forEach((id) => busyIds.add(id));
      c.currentMatch.team2.forEach((id) => busyIds.add(id));
    }
    // Sân khác có nextUp
    if (c.id !== court.id && c.isActive && c.nextUp) {
      if (c.nextUp.isLockedByHost) {
        c.nextUp.team1.forEach((id) => busyIds.add(id));
        c.nextUp.team2.forEach((id) => busyIds.add(id));
      } else {
        const slotSource = c.nextUp.slotSource || {};
        for (const [pid, source] of Object.entries(slotSource)) {
          if (source === 'MANUAL') {
            busyIds.add(pid);
          }
        }
      }
    }
  }

  return players.filter((p) => {
    if (p.status !== 'ACTIVE') return false;
    if (busyIds.has(p.id)) return false;
    if (reservedPlayerIds.has(p.id)) return false;

    if (settings.courtMode === 'SPLIT_COURT') {
      return p.assignedPool === court.id || p.assignedPool === 'ALL';
    }

    return true;
  });
}

/**
 * Quyết định loại trận (decideTargetMatchType) bằng bộ đếm thiếu hụt (mixDebt) thay cho random:
 * - Court.policy ép loại nếu không phải 'MIX'
 * - Nếu 'MIX': cộng tỉ lệ mix vào debt, chọn loại có debt lớn hơn (hòa -> Đôi)
 * - Nếu loại được chọn không đủ người -> fallback loại còn lại
 */
export function decideTargetMatchType(
  court: Court,
  availableCount: number,
  state: BadmintonSessionState
): MatchType | 'NONE' {
  // 1. Nếu court ép policy
  if (court.policy === 'DOUBLES_ONLY') {
    return availableCount >= 4 ? 'DOUBLES' : 'NONE';
  }
  if (court.policy === 'SINGLES_ONLY') {
    return availableCount >= 2 ? 'SINGLES' : 'NONE';
  }

  // 2. Policy là 'MIX'
  const simDebtD = state.mixDebt.doubles + state.settings.matchMix.doubles;
  const simDebtS = state.mixDebt.singles + state.settings.matchMix.singles;

  const preferredType: MatchType = simDebtS > simDebtD ? 'SINGLES' : 'DOUBLES';

  if (preferredType === 'DOUBLES') {
    if (availableCount >= 4) return 'DOUBLES';
    if (availableCount >= 2) return 'SINGLES';
    return 'NONE';
  } else {
    if (availableCount >= 2) return 'SINGLES';
    if (availableCount >= 4) return 'DOUBLES';
    return 'NONE';
  }
}

/**
 * Tính điểm phạt chi tiết cho một trận ĐƠN
 * (Mục 9: waitPenalty chỉ duyệt eligiblePlayers - loại người noSingles)
 * (Mục 10: toàn bộ trọng số dùng từ weights)
 */
export function calculateSinglesScore(
  p1: Player,
  p2: Player,
  state: BadmintonSessionState,
  weights: PenaltyWeights,
  eligiblePlayers: Player[]
): MatchScoreBreakdown {
  // AVOID_MATCH rule
  let avoidMatchPenalty = 0;
  for (const rule of state.pairRules) {
    if (rule.type === 'AVOID_MATCH') {
      if (
        (rule.playerAId === p1.id && rule.playerBId === p2.id) ||
        (rule.playerAId === p2.id && rule.playerBId === p1.id)
      ) {
        avoidMatchPenalty += weights.avoidMatchPenalty;
      }
    }
  }

  // 1. Skill Balance
  const eff1 = getEffectiveSkill(p1.rank, p1.sex, state.settings.maleBonus);
  const eff2 = getEffectiveSkill(p2.rank, p2.sex, state.settings.maleBonus);
  const skillDiff = Number(Math.abs(eff1 - eff2).toFixed(2));
  const skillBalancePenalty = Math.pow(skillDiff, 2) * weights.singlesSkillBalanceMultiplier;

  // 2. Opponent Count & Recent Opponent
  const oppCount = getOpponentCount(state.stats, p1.id, p2.id);
  let opponentRepeatPenalty = oppCount * weights.singlesOpponentRepeatMultiplier;
  if (isRecentOpponent(state.stats, p1.id, p2.id)) {
    opponentRepeatPenalty += weights.singlesRecentOpponentPenalty;
  }

  // 3. Singles Count Penalty
  const activeAll = state.players.filter((p) => p.status === 'ACTIVE');
  const avgSingles =
    activeAll.reduce((sum, p) => sum + p.singlesCount, 0) / (activeAll.length || 1);
  const excess1 = Math.max(0, p1.singlesCount - avgSingles);
  const excess2 = Math.max(0, p2.singlesCount - avgSingles);
  const singlesCountPenalty = (excess1 + excess2) * weights.singlesCountExcessMultiplier;

  // 4. Wait penalty (chỉ duyệt eligiblePlayers - loại noSingles!)
  let waitPenalty = 0;
  const minChosenWait = Math.min(p1.waitStreak, p2.waitStreak);
  const maxChosenEff = Math.max(
    p1.gamesPlayed + p1.virtualGamesOffset,
    p2.gamesPlayed + p2.virtualGamesOffset
  );

  for (const p of eligiblePlayers) {
    if (p.id !== p1.id && p.id !== p2.id) {
      if (p.waitStreak > minChosenWait) {
        waitPenalty += (p.waitStreak - minChosenWait) * weights.waitStreakMultiplier;
      }
      const pEff = p.gamesPlayed + p.virtualGamesOffset;
      if (pEff < maxChosenEff) {
        waitPenalty += (maxChosenEff - pEff) * weights.gamesGapPenalty;
      }
    }
  }

  const totalPenalty =
    skillBalancePenalty +
    opponentRepeatPenalty +
    singlesCountPenalty +
    waitPenalty +
    avoidMatchPenalty;

  return {
    waitPenalty,
    exactQuartetRepeatPenalty: 0,
    exactPairRepeatPenalty: 0,
    partnerRepeatPenalty: 0,
    opponentRepeatPenalty,
    skillBalancePenalty,
    genderStructurePenalty: 0,
    avoidMatchPenalty,
    singlesCountPenalty,
    totalPenalty,
    team1Skill: eff1,
    team2Skill: eff2,
    skillDiff,
  };
}

/**
 * Tính điểm phạt chi tiết cho một trận ĐÔI
 * (Mục 10: toàn bộ trọng số dùng từ weights)
 */
export function calculateDoublesScore(
  p1: Player,
  p2: Player,
  p3: Player,
  p4: Player,
  courtId: string,
  state: BadmintonSessionState,
  weights: PenaltyWeights,
  availablePlayers: Player[]
): MatchScoreBreakdown {
  const quartet = [p1, p2, p3, p4];
  const quartetIds = new Set(quartet.map((p) => p.id));
  const maleBonus = state.settings.maleBonus;
  const preferMixed = state.settings.preferMixedDoubles;

  // 1. WaitPenalty
  let waitPenalty = 0;
  const minChosenWait = Math.min(...quartet.map((p) => p.waitStreak));
  const maxChosenEff = Math.max(...quartet.map((p) => p.gamesPlayed + p.virtualGamesOffset));

  for (const p of availablePlayers) {
    if (!quartetIds.has(p.id)) {
      if (p.waitStreak > minChosenWait) {
        waitPenalty += (p.waitStreak - minChosenWait) * weights.waitStreakMultiplier;
      }
      const pEff = p.gamesPlayed + p.virtualGamesOffset;
      if (pEff < maxChosenEff) {
        waitPenalty += (maxChosenEff - pEff) * weights.gamesGapPenalty;
      }
    }
  }

  // 2. Exact Repeat Penalty & Chống lặp cặp liên tiếp
  let exactQuartetRepeatPenalty = 0;
  let exactPairRepeatPenalty = 0;

  const candidateMatchesToCheck: MatchHistory[] = [];
  const lastCourtMatch = state.stats.lastMatchOfCourt[courtId];
  if (lastCourtMatch) candidateMatchesToCheck.push(lastCourtMatch);
  const p1Last = state.stats.lastMatchOfPlayer[p1.id];
  if (p1Last) {
    const m = state.history.find((h) => h.id === p1Last.matchId);
    if (m && !candidateMatchesToCheck.some((c) => c.id === m.id)) {
      candidateMatchesToCheck.push(m);
    }
  }

  for (const matchToCheck of candidateMatchesToCheck) {
    if (matchToCheck && matchToCheck.type === 'DOUBLES') {
      const prevQuartet = new Set([...matchToCheck.team1, ...matchToCheck.team2]);
      if (
        prevQuartet.size === 4 &&
        prevQuartet.has(p1.id) &&
        prevQuartet.has(p2.id) &&
        prevQuartet.has(p3.id) &&
        prevQuartet.has(p4.id)
      ) {
        exactQuartetRepeatPenalty = weights.exactQuartetPenalty;

        const prevT1 = matchToCheck.team1;
        const prevT2 = matchToCheck.team2;

        const isSameT1 =
          (prevT1.includes(p1.id) && prevT1.includes(p2.id)) ||
          (prevT2.includes(p1.id) && prevT2.includes(p2.id));
        const isSameT2 =
          (prevT1.includes(p3.id) && prevT1.includes(p4.id)) ||
          (prevT2.includes(p3.id) && prevT2.includes(p4.id));

        if (isSameT1 && isSameT2) {
          exactPairRepeatPenalty = weights.exactPairPenalty;
        }
        break;
      }
    }
  }

  // 3. Partner Repeat Penalty
  let partnerRepeatPenalty = 0;
  const p1p2Count = getPartnerCount(state.stats, p1.id, p2.id);
  partnerRepeatPenalty += p1p2Count * weights.partnerRepeatBase;
  if (isRecentPartner(state.stats, p1.id, p2.id)) {
    partnerRepeatPenalty += weights.exactPairPenalty;
  }

  const p3p4Count = getPartnerCount(state.stats, p3.id, p4.id);
  partnerRepeatPenalty += p3p4Count * weights.partnerRepeatBase;
  if (isRecentPartner(state.stats, p3.id, p4.id)) {
    partnerRepeatPenalty += weights.exactPairPenalty;
  }

  // 4. Opponent Repeat Penalty
  const opp13 = getOpponentCount(state.stats, p1.id, p3.id);
  const opp14 = getOpponentCount(state.stats, p1.id, p4.id);
  const opp23 = getOpponentCount(state.stats, p2.id, p3.id);
  const opp24 = getOpponentCount(state.stats, p2.id, p4.id);
  const opponentRepeatPenalty = (opp13 + opp14 + opp23 + opp24) * weights.opponentRepeatMultiplier;

  // 5. Skill Balance
  const eff1 = getEffectiveSkill(p1.rank, p1.sex, maleBonus);
  const eff2 = getEffectiveSkill(p2.rank, p2.sex, maleBonus);
  const eff3 = getEffectiveSkill(p3.rank, p3.sex, maleBonus);
  const eff4 = getEffectiveSkill(p4.rank, p4.sex, maleBonus);

  const team1Skill = Number((eff1 + eff2).toFixed(2));
  const team2Skill = Number((eff3 + eff4).toFixed(2));
  const skillDiff = Number(Math.abs(team1Skill - team2Skill).toFixed(2));
  const skillBalancePenalty = Math.pow(skillDiff, 2) * weights.skillBalanceMultiplier;

  // 6. Gender Structure
  let genderStructurePenalty = 0;
  const maleCount =
    (p1.sex === 'M' ? 1 : 0) +
    (p2.sex === 'M' ? 1 : 0) +
    (p3.sex === 'M' ? 1 : 0) +
    (p4.sex === 'M' ? 1 : 0);

  if (maleCount === 2) {
    const t1Males = (p1.sex === 'M' ? 1 : 0) + (p2.sex === 'M' ? 1 : 0);
    if (t1Males === 2 || t1Males === 0) {
      if (preferMixed) genderStructurePenalty += weights.gender2M2FUnbalancedPenalty;
    } else {
      if (preferMixed) genderStructurePenalty -= weights.gender2M2FMixedBonus;
    }
  } else if (maleCount === 1 || maleCount === 3) {
    genderStructurePenalty += weights.oddGenderSplitPenalty;
  }

  // 7. AVOID_MATCH Penalty
  let avoidMatchPenalty = 0;
  for (const rule of state.pairRules) {
    if (rule.type === 'AVOID_MATCH') {
      if (quartetIds.has(rule.playerAId) && quartetIds.has(rule.playerBId)) {
        avoidMatchPenalty += weights.avoidMatchPenalty;
      }
    }
  }

  const totalPenalty =
    waitPenalty +
    exactQuartetRepeatPenalty +
    exactPairRepeatPenalty +
    partnerRepeatPenalty +
    opponentRepeatPenalty +
    skillBalancePenalty +
    genderStructurePenalty +
    avoidMatchPenalty;

  return {
    waitPenalty,
    exactQuartetRepeatPenalty,
    exactPairRepeatPenalty,
    partnerRepeatPenalty,
    opponentRepeatPenalty,
    skillBalancePenalty,
    genderStructurePenalty,
    avoidMatchPenalty,
    singlesCountPenalty: 0,
    totalPenalty,
    team1Skill,
    team2Skill,
    skillDiff,
  };
}

/**
 * Thuật toán ghép ĐƠN:
 * (Mục 5: hỗ trợ fixedSlots, giữ nguyên slotSource 'MANUAL' cho người cố định)
 * (Mục 9: waitPenalty chỉ duyệt eligiblePlayers)
 */
export function generateSinglesProposals(
  availablePlayers: Player[],
  state: BadmintonSessionState,
  weights: PenaltyWeights,
  seed: number,
  fixedSlots?: FixedSlot[]
): MatchProposal[] {
  // Lọc người không từ chối đánh đơn
  const eligiblePlayers = availablePlayers.filter((p) => !p.noSingles);
  if (eligiblePlayers.length < 2) {
    return [];
  }

  const playerMap = new Map(eligiblePlayers.map((p) => [p.id, p]));

  // Nếu có fixedSlots
  if (fixedSlots && fixedSlots.length > 0) {
    // Validate fixedSlots
    const fixedT1 = fixedSlots.filter((s) => s.team === 1);
    const fixedT2 = fixedSlots.filter((s) => s.team === 2);
    if (fixedT1.length > 1 || fixedT2.length > 1 || fixedSlots.length > 2) {
      return [];
    }
    for (const slot of fixedSlots) {
      if (!playerMap.has(slot.playerId)) {
        return []; // Người cố định không có sẵn hoặc từ chối đánh đơn
      }
    }
    if (fixedSlots.length === 2 && fixedSlots[0].playerId === fixedSlots[1].playerId) {
      return [];
    }

    // Trường hợp cả 2 slot đều cố định
    if (fixedT1.length === 1 && fixedT2.length === 1) {
      const p1 = playerMap.get(fixedT1[0].playerId)!;
      const p2 = playerMap.get(fixedT2[0].playerId)!;
      const debugScore = calculateSinglesScore(p1, p2, state, weights, eligiblePlayers);
      return [
        {
          lineup: {
            type: 'SINGLES',
            team1: [p1.id],
            team2: [p2.id],
            slotSource: { [p1.id]: 'MANUAL', [p2.id]: 'MANUAL' },
          },
          debugScore,
          penalty: debugScore.totalPenalty,
          relaxed: false,
          relaxedReasons: [],
        },
      ];
    }

    // Trường hợp chỉ cố định Team 1
    if (fixedT1.length === 1) {
      const p1 = playerMap.get(fixedT1[0].playerId)!;
      const candidates = sortPlayersByWaitPriority(
        eligiblePlayers.filter((p) => p.id !== p1.id)
      ).slice(0, 6);

      const proposals: MatchProposal[] = [];
      for (const p2 of candidates) {
        const debugScore = calculateSinglesScore(p1, p2, state, weights, eligiblePlayers);
        proposals.push({
          lineup: {
            type: 'SINGLES',
            team1: [p1.id],
            team2: [p2.id],
            slotSource: { [p1.id]: 'MANUAL', [p2.id]: 'AUTO' },
          },
          debugScore,
          penalty: debugScore.totalPenalty,
          relaxed: false,
          relaxedReasons: [],
        });
      }

      proposals.sort((a, b) => {
        if (a.penalty !== b.penalty) return a.penalty - b.penalty;
        const hashA = pseudoHash(a.lineup.team1[0] + a.lineup.team2[0], seed);
        const hashB = pseudoHash(b.lineup.team1[0] + b.lineup.team2[0], seed);
        return hashA - hashB;
      });

      return proposals.slice(0, 5);
    }

    // Trường hợp chỉ cố định Team 2
    if (fixedT2.length === 1) {
      const p2 = playerMap.get(fixedT2[0].playerId)!;
      const candidates = sortPlayersByWaitPriority(
        eligiblePlayers.filter((p) => p.id !== p2.id)
      ).slice(0, 6);

      const proposals: MatchProposal[] = [];
      for (const p1 of candidates) {
        const debugScore = calculateSinglesScore(p1, p2, state, weights, eligiblePlayers);
        proposals.push({
          lineup: {
            type: 'SINGLES',
            team1: [p1.id],
            team2: [p2.id],
            slotSource: { [p1.id]: 'AUTO', [p2.id]: 'MANUAL' },
          },
          debugScore,
          penalty: debugScore.totalPenalty,
          relaxed: false,
          relaxedReasons: [],
        });
      }

      proposals.sort((a, b) => {
        if (a.penalty !== b.penalty) return a.penalty - b.penalty;
        const hashA = pseudoHash(a.lineup.team1[0] + a.lineup.team2[0], seed);
        const hashB = pseudoHash(b.lineup.team1[0] + b.lineup.team2[0], seed);
        return hashA - hashB;
      });

      return proposals.slice(0, 5);
    }
  }

  // Không có fixedSlots: thuật toán chuẩn tự động
  const sorted = sortPlayersByWaitPriority(eligiblePlayers);
  const topK = sorted.slice(0, Math.min(6, sorted.length));
  const proposals: MatchProposal[] = [];

  for (let i = 0; i < topK.length - 1; i++) {
    for (let j = i + 1; j < topK.length; j++) {
      const p1 = topK[i];
      const p2 = topK[j];
      const debugScore = calculateSinglesScore(p1, p2, state, weights, eligiblePlayers);

      const lineup: Lineup = {
        type: 'SINGLES',
        team1: [p1.id],
        team2: [p2.id],
        slotSource: { [p1.id]: 'AUTO', [p2.id]: 'AUTO' },
      };

      proposals.push({
        lineup,
        debugScore,
        penalty: debugScore.totalPenalty,
        relaxed: false,
        relaxedReasons: [],
      });
    }
  }

  proposals.sort((a, b) => {
    if (a.penalty !== b.penalty) return a.penalty - b.penalty;
    const hashA = pseudoHash(a.lineup.team1[0] + a.lineup.team2[0], seed);
    const hashB = pseudoHash(b.lineup.team1[0] + b.lineup.team2[0], seed);
    return hashA - hashB;
  });

  return proposals.slice(0, 5);
}

/**
 * Sinh tổ hợp k phần tử từ mảng
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const result: T[][] = [];
  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

/**
 * Thuật toán ghép ĐÔI:
 * (Mục 5: hỗ trợ fixedSlots, giữ nguyên slotSource 'MANUAL' cho người cố định)
 * (Mục 8: 3 stages nới lỏng ràng buộc có kiểm soát, xử lý mâu thuẫn LOCK+AVOID, relaxed flag & reasons)
 * (Mục 10: toàn bộ trọng số dùng từ weights)
 */
export function generateDoublesProposals(
  courtId: string,
  availablePlayers: Player[],
  state: BadmintonSessionState,
  weights: PenaltyWeights,
  seed: number,
  fixedSlots?: FixedSlot[]
): MatchProposal[] {
  if (availablePlayers.length < 4) {
    return [];
  }

  const sortedAvailable = sortPlayersByWaitPriority(availablePlayers);
  const availableIdSet = new Set(sortedAvailable.map((p) => p.id));
  const playerMap = new Map(sortedAvailable.map((p) => [p.id, p]));

  // 1. Phân loại và xử lý mâu thuẫn luật (Mục 8)
  const activePairRules = state.pairRules.filter((r) => {
    const pA = state.players.find((p) => p.id === r.playerAId);
    const pB = state.players.find((p) => p.id === r.playerBId);
    return pA && pB && pA.status === 'ACTIVE' && pB.status === 'ACTIVE';
  });

  const conflictPairKeys = new Set<string>();
  const lockRules: PairRule[] = [];
  const avoidRules: PairRule[] = [];

  for (const rule of activePairRules) {
    if (rule.type === 'LOCK_PARTNER') {
      lockRules.push(rule);
    } else if (rule.type === 'AVOID_PARTNER') {
      avoidRules.push(rule);
    }
  }

  // Cùng một cặp vừa LOCK vừa AVOID -> AVOID thắng, bỏ LOCK, ghi nhận mâu thuẫn
  for (const l of lockRules) {
    const hasAvoid = avoidRules.some(
      (a) =>
        (a.playerAId === l.playerAId && a.playerBId === l.playerBId) ||
        (a.playerAId === l.playerBId && a.playerBId === l.playerAId)
    );
    if (hasAvoid) {
      const key = [l.playerAId, l.playerBId].sort().join(':');
      conflictPairKeys.add(key);
    }
  }

  const effectiveLockRules = lockRules.filter((l) => {
    const key = [l.playerAId, l.playerBId].sort().join(':');
    return !conflictPairKeys.has(key);
  });

  // 2. Validate fixedSlots (Mục 5)
  const fixedT1 = (fixedSlots || []).filter((s) => s.team === 1).map((s) => s.playerId);
  const fixedT2 = (fixedSlots || []).filter((s) => s.team === 2).map((s) => s.playerId);

  if (fixedT1.length > 2 || fixedT2.length > 2) {
    return [];
  }
  const fixedList = [...fixedT1, ...fixedT2];
  const fixedSet = new Set(fixedList);
  if (fixedSet.size !== fixedList.length) {
    return []; // Trùng người cố định
  }
  for (const fid of fixedSet) {
    if (!availableIdSet.has(fid)) {
      return []; // Người cố định không có sẵn
    }
  }

  const neededT1 = 2 - fixedT1.length;
  const neededT2 = 2 - fixedT2.length;
  const neededTotal = neededT1 + neededT2;

  const remainingAvailable = sortedAvailable.filter((p) => !fixedSet.has(p.id));
  if (remainingAvailable.length < neededTotal) {
    return [];
  }

  // 3. Xây dựng candidate pool cho các slot còn thiếu
  let candidateCombos: Player[][] = [];
  if (neededTotal === 0) {
    candidateCombos = [[]];
  } else {
    const candidateIds = new Set<string>();
    const baseK = Math.min(8, remainingAvailable.length);
    for (let i = 0; i < baseK; i++) {
      candidateIds.add(remainingAvailable[i].id);
    }

    // Kéo partner của LOCK_PARTNER vào candidate pool nếu 1 người trong candidate pool
    for (const rule of effectiveLockRules) {
      const freeA = availableIdSet.has(rule.playerAId) && !fixedSet.has(rule.playerAId);
      const freeB = availableIdSet.has(rule.playerBId) && !fixedSet.has(rule.playerBId);
      if (freeA && freeB) {
        if (candidateIds.has(rule.playerAId)) candidateIds.add(rule.playerBId);
        if (candidateIds.has(rule.playerBId)) candidateIds.add(rule.playerAId);
      }
    }

    const candidatePlayers = remainingAvailable.filter((p) => candidateIds.has(p.id));
    if (candidatePlayers.length < neededTotal) {
      return [];
    }
    candidateCombos = getCombinations(candidatePlayers, neededTotal);
  }

  // 4. Sinh tất cả các phương án xếp đội có thể cho mỗi tổ hợp
  let foundProposals: MatchProposal[] = [];
  const seenLineupSignatures = new Set<string>();

  // 3 Stages (Mục 8):
  // Stage 0: Đầy đủ ràng buộc
  // Stage 1: Cho phép bỏ qua LOCK_PARTNER (nới tách cặp/thiếu cặp), AVOID_PARTNER vẫn nghiêm ngặt
  // Stage 2: Cho phép bỏ cả AVOID_PARTNER
  for (let stage = 0; stage < 3; stage++) {
    for (const newCombo of candidateCombos) {
      // Tạo các phương án phân bổ newCombo vào Team 1 và Team 2
      const teamAssignments: Array<{ team1: Player[]; team2: Player[] }> = [];

      if (neededTotal === 0) {
        teamAssignments.push({
          team1: fixedT1.map((id) => playerMap.get(id)!),
          team2: fixedT2.map((id) => playerMap.get(id)!),
        });
      } else if (neededTotal === 1) {
        if (neededT1 === 1) {
          teamAssignments.push({
            team1: [...fixedT1.map((id) => playerMap.get(id)!), newCombo[0]],
            team2: fixedT2.map((id) => playerMap.get(id)!),
          });
        } else {
          teamAssignments.push({
            team1: fixedT1.map((id) => playerMap.get(id)!),
            team2: [...fixedT2.map((id) => playerMap.get(id)!), newCombo[0]],
          });
        }
      } else if (neededTotal === 2) {
        if (neededT1 === 2) {
          teamAssignments.push({
            team1: [newCombo[0], newCombo[1]],
            team2: fixedT2.map((id) => playerMap.get(id)!),
          });
        } else if (neededT2 === 2) {
          teamAssignments.push({
            team1: fixedT1.map((id) => playerMap.get(id)!),
            team2: [newCombo[0], newCombo[1]],
          });
        } else {
          const f1 = playerMap.get(fixedT1[0])!;
          const f2 = playerMap.get(fixedT2[0])!;
          teamAssignments.push({
            team1: [f1, newCombo[0]],
            team2: [f2, newCombo[1]],
          });
          teamAssignments.push({
            team1: [f1, newCombo[1]],
            team2: [f2, newCombo[0]],
          });
        }
      } else if (neededTotal === 3) {
        if (neededT1 === 1 && neededT2 === 2) {
          const f1 = playerMap.get(fixedT1[0])!;
          teamAssignments.push({
            team1: [f1, newCombo[0]],
            team2: [newCombo[1], newCombo[2]],
          });
          teamAssignments.push({
            team1: [f1, newCombo[1]],
            team2: [newCombo[0], newCombo[2]],
          });
          teamAssignments.push({
            team1: [f1, newCombo[2]],
            team2: [newCombo[0], newCombo[1]],
          });
        } else {
          const f2 = playerMap.get(fixedT2[0])!;
          teamAssignments.push({
            team1: [newCombo[1], newCombo[2]],
            team2: [f2, newCombo[0]],
          });
          teamAssignments.push({
            team1: [newCombo[0], newCombo[2]],
            team2: [f2, newCombo[1]],
          });
          teamAssignments.push({
            team1: [newCombo[0], newCombo[1]],
            team2: [f2, newCombo[2]],
          });
        }
      } else if (neededTotal === 4) {
        const [pA, pB, pC, pD] = newCombo;
        teamAssignments.push({ team1: [pA, pB], team2: [pC, pD] });
        teamAssignments.push({ team1: [pA, pC], team2: [pB, pD] });
        teamAssignments.push({ team1: [pA, pD], team2: [pB, pC] });
      }

      for (const assignment of teamAssignments) {
        const [p1, p2] = assignment.team1;
        const [p3, p4] = assignment.team2;
        const quartet = [p1, p2, p3, p4];
        const quartetIds = new Set(quartet.map((p) => p.id));

        // Kiểm tra xem quartet có chứa người thuộc cặp mâu thuẫn luật không
        let hasConflictInQuartet = false;
        for (const key of conflictPairKeys) {
          const [idA, idB] = key.split(':');
          if (quartetIds.has(idA) || quartetIds.has(idB)) {
            hasConflictInQuartet = true;
          }
        }

        // Kiểm tra LOCK_PARTNER ở cấp bộ 4 người (có 1 mà thiếu 1 khi cả 2 rảnh)
        let violatesLockQuartet = false;
        for (const rule of effectiveLockRules) {
          const freeA = availableIdSet.has(rule.playerAId);
          const freeB = availableIdSet.has(rule.playerBId);
          if (freeA && freeB) {
            const inA = quartetIds.has(rule.playerAId);
            const inB = quartetIds.has(rule.playerBId);
            if ((inA && !inB) || (!inA && inB)) {
              violatesLockQuartet = true;
              break;
            }
          }
        }

        if (violatesLockQuartet && stage === 0) {
          continue;
        }

        // Kiểm tra AVOID_PARTNER (cùng đội)
        let violatesAvoidPartner = false;
        for (const rule of avoidRules) {
          const sameT1 =
            (p1.id === rule.playerAId && p2.id === rule.playerBId) ||
            (p1.id === rule.playerBId && p2.id === rule.playerAId);
          const sameT2 =
            (p3.id === rule.playerAId && p4.id === rule.playerBId) ||
            (p3.id === rule.playerBId && p4.id === rule.playerAId);
          if (sameT1 || sameT2) {
            violatesAvoidPartner = true;
            break;
          }
        }

        // Kiểm tra LOCK_PARTNER (bị chia 2 đội)
        let violatesLockSplit = false;
        for (const rule of effectiveLockRules) {
          const inT1A = p1.id === rule.playerAId || p2.id === rule.playerAId;
          const inT1B = p1.id === rule.playerBId || p2.id === rule.playerBId;
          const inT2A = p3.id === rule.playerAId || p4.id === rule.playerAId;
          const inT2B = p3.id === rule.playerBId || p4.id === rule.playerBId;

          if ((inT1A && inT2B) || (inT2A && inT1B)) {
            violatesLockSplit = true;
            break;
          }
        }

        // Phân loại theo Stage
        let relaxed = false;
        const relaxedReasons: string[] = [];

        if (stage === 0) {
          if (violatesAvoidPartner || violatesLockSplit || violatesLockQuartet) {
            continue;
          }
          if (hasConflictInQuartet) {
            relaxed = true;
            relaxedReasons.push('Luật mâu thuẫn: ưu tiên AVOID_PARTNER');
          }
        } else if (stage === 1) {
          if (violatesAvoidPartner) {
            continue;
          }
          relaxed = true;
          relaxedReasons.push('Bỏ qua ràng buộc LOCK_PARTNER để đủ người');
          if (hasConflictInQuartet) {
            relaxedReasons.push('Luật mâu thuẫn: ưu tiên AVOID_PARTNER');
          }
        } else {
          // stage 2: nới cả AVOID_PARTNER
          relaxed = true;
          if (violatesLockSplit || violatesLockQuartet) {
            relaxedReasons.push('Bỏ qua ràng buộc LOCK_PARTNER để đủ người');
          }
          if (violatesAvoidPartner) {
            relaxedReasons.push('Bỏ qua ràng buộc AVOID_PARTNER do kẹt người');
          }
          if (relaxedReasons.length === 0) {
            relaxedReasons.push('Nới lỏng ràng buộc ở Stage 2');
          }
          if (hasConflictInQuartet) {
            relaxedReasons.push('Luật mâu thuẫn: ưu tiên AVOID_PARTNER');
          }
        }

        // Tránh trùng lặp phương án
        const sig = `${[p1.id, p2.id].sort().join('-')}:${[p3.id, p4.id].sort().join('-')}`;
        if (seenLineupSignatures.has(sig)) {
          continue;
        }
        seenLineupSignatures.add(sig);

        const debugScore = calculateDoublesScore(
          p1,
          p2,
          p3,
          p4,
          courtId,
          state,
          weights,
          availablePlayers
        );

        const slotSource: Record<string, 'AUTO' | 'MANUAL'> = {
          [p1.id]: fixedSet.has(p1.id) ? 'MANUAL' : 'AUTO',
          [p2.id]: fixedSet.has(p2.id) ? 'MANUAL' : 'AUTO',
          [p3.id]: fixedSet.has(p3.id) ? 'MANUAL' : 'AUTO',
          [p4.id]: fixedSet.has(p4.id) ? 'MANUAL' : 'AUTO',
        };

        const lineup: Lineup = {
          type: 'DOUBLES',
          team1: [p1.id, p2.id],
          team2: [p3.id, p4.id],
          slotSource,
        };

        foundProposals.push({
          lineup,
          debugScore,
          penalty: debugScore.totalPenalty,
          relaxed,
          relaxedReasons,
        });
      }
    }

    // Chỉ sang stage sau khi stage trước không có phương án
    if (foundProposals.length > 0) {
      break;
    }
  }

  // Sắp xếp deterministic: penalty tăng dần, tie-break bằng pseudoHash
  foundProposals.sort((a, b) => {
    if (a.penalty !== b.penalty) return a.penalty - b.penalty;
    const hashA = pseudoHash(
      a.lineup.team1.join('-') + ':' + a.lineup.team2.join('-'),
      seed
    );
    const hashB = pseudoHash(
      b.lineup.team1.join('-') + ':' + b.lineup.team2.join('-'),
      seed
    );
    return hashA - hashB;
  });

  return foundProposals.slice(0, 5);
}

/**
 * Thuật toán lập kế hoạch cho toàn bộ các sân (Pure Engine Function):
 * Thay thế generateSuggestedMatch bằng planAllCourts(state, now, seed)
 *
 * - (Mục 1) Tôn trọng tuyệt đối policy (SINGLES_ONLY chỉ đơn, DOUBLES_ONLY chỉ đôi, không fallback chéo).
 * - (Mục 2) Chỉ hỏi khi sân trống (court.currentMatch === null). Sân đang đánh mà thiếu người -> WAIT.
 * - (Mục 3) Proposal của NEEDS_CONFIRM đưa người vào reserved.
 * - (Mục 4) getValidAvailablePlayersForCourt chỉ coi bận người đang đánh hoặc locked nextUp / manual slot sân khác.
 * - (Mục 5) Truyền fixedSlots từ nextUp của từng sân.
 * - (Mục 7) Mô phỏng mixDebt cục bộ trong lượt plan.
 * - (Mục 11) Tính real debugScore cho locked nextUp.
 * - (Mục 13) Sử dụng courtPlanIndex để chọn proposal ổn định.
 */
export function planAllCourts(
  state: BadmintonSessionState,
  now: number,
  seed: number = 42
): CourtPlanMap {
  const result: CourtPlanMap = {};
  const reservedPlayerIds = new Set<string>();

  // Bản sao mixDebt cục bộ để mô phỏng tuần tự qua các sân (Mục 7)
  const simMixDebt = { ...state.mixDebt };

  // Lấy các sân active: ưu tiên duyệt các sân đang rảnh trước (currentMatch === null)
  const activeCourts = [...state.courts.filter((c) => c.isActive)].sort((a, b) => {
    const aFree = a.currentMatch === null ? 0 : 1;
    const bFree = b.currentMatch === null ? 0 : 1;
    if (aFree !== bFree) return aFree - bFree;
    return a.id.localeCompare(b.id);
  });

  for (const court of activeCourts) {
    // Nếu sân đã có nextUp bị khóa bởi Host, tính real debugScore và giữ chỗ người trong đó (Mục 11)
    if (court.nextUp && court.nextUp.isLockedByHost) {
      court.nextUp.team1.forEach((id) => reservedPlayerIds.add(id));
      court.nextUp.team2.forEach((id) => reservedPlayerIds.add(id));

      let debugScore: MatchScoreBreakdown;
      let penalty = 0;

      if (court.nextUp.type === 'DOUBLES') {
        const p1 = state.players.find((p) => p.id === court.nextUp!.team1[0]);
        const p2 = state.players.find((p) => p.id === court.nextUp!.team1[1]);
        const p3 = state.players.find((p) => p.id === court.nextUp!.team2[0]);
        const p4 = state.players.find((p) => p.id === court.nextUp!.team2[1]);
        if (p1 && p2 && p3 && p4) {
          debugScore = calculateDoublesScore(
            p1,
            p2,
            p3,
            p4,
            court.id,
            state,
            state.settings.weights,
            state.players.filter((p) => p.status === 'ACTIVE')
          );
          penalty = debugScore.totalPenalty;
        } else {
          debugScore = createEmptyBreakdown();
        }
      } else {
        const p1 = state.players.find((p) => p.id === court.nextUp!.team1[0]);
        const p2 = state.players.find((p) => p.id === court.nextUp!.team2[0]);
        if (p1 && p2) {
          const eligible = state.players.filter((p) => p.status === 'ACTIVE' && !p.noSingles);
          debugScore = calculateSinglesScore(p1, p2, state, state.settings.weights, eligible);
          penalty = debugScore.totalPenalty;
        } else {
          debugScore = createEmptyBreakdown();
        }
      }

      result[court.id] = {
        status: 'OK',
        proposals: [
          {
            lineup: court.nextUp,
            debugScore,
            penalty,
            relaxed: false,
            relaxedReasons: [],
          },
        ],
        selectedIndex: 0,
      };
      continue;
    }

    // Trích xuất fixedSlots từ nextUp hiện tại của sân nếu có slot MANUAL (Mục 5)
    let fixedSlots: FixedSlot[] | undefined = undefined;
    if (court.nextUp && !court.nextUp.isLockedByHost && court.nextUp.slotSource) {
      const extracted: FixedSlot[] = [];
      court.nextUp.team1.forEach((pid) => {
        if (court.nextUp!.slotSource[pid] === 'MANUAL') {
          extracted.push({ playerId: pid, team: 1 });
        }
      });
      court.nextUp.team2.forEach((pid) => {
        if (court.nextUp!.slotSource[pid] === 'MANUAL') {
          extracted.push({ playerId: pid, team: 2 });
        }
      });
      if (extracted.length > 0) {
        fixedSlots = extracted;
      }
    }

    // 1. Lấy người chơi hợp lệ cho sân này (Mục 4)
    const available = getValidAvailablePlayersForCourt(
      court,
      state.courts,
      state.players,
      reservedPlayerIds,
      state.settings
    );

    // ==========================================
    // CASE A: POLICY === 'SINGLES_ONLY' (Mục 1)
    // ==========================================
    if (court.policy === 'SINGLES_ONLY') {
      if (available.length < 2) {
        result[court.id] = {
          status: 'WAIT',
          reason: 'Không đủ người chơi hợp lệ cho sân đơn',
        };
        continue;
      }

      const singlesProposals = generateSinglesProposals(
        available,
        state,
        state.settings.weights,
        seed,
        fixedSlots
      );

      if (singlesProposals.length === 0) {
        result[court.id] = {
          status: 'WAIT',
          reason: 'Không tìm thấy tổ hợp hợp lệ cho sân đơn',
        };
        continue;
      }

      // Cập nhật simMixDebt
      simMixDebt.doubles += state.settings.matchMix.doubles;
      simMixDebt.singles += state.settings.matchMix.singles;
      simMixDebt.singles -= 1;

      // Chọn proposal theo courtPlanIndex (Mục 13)
      const selectedIndex = (state.courtPlanIndex?.[court.id] ?? 0) % singlesProposals.length;
      const topProposal = singlesProposals[selectedIndex];
      topProposal.lineup.team1.forEach((id) => reservedPlayerIds.add(id));
      topProposal.lineup.team2.forEach((id) => reservedPlayerIds.add(id));

      result[court.id] = {
        status: 'OK',
        proposals: singlesProposals,
        selectedIndex,
      };
      continue;
    }

    // ==========================================
    // CASE B: POLICY === 'DOUBLES_ONLY' (Mục 1)
    // ==========================================
    if (court.policy === 'DOUBLES_ONLY') {
      if (available.length < 4) {
        result[court.id] = {
          status: 'WAIT',
          reason:
            court.currentMatch !== null
              ? 'Chưa đủ người cho lượt sau'
              : `Sân chỉ đánh đôi nhưng chỉ có ${available.length} người`,
        };
        continue;
      }

      const doublesProposals = generateDoublesProposals(
        court.id,
        available,
        state,
        state.settings.weights,
        seed,
        fixedSlots
      );

      if (doublesProposals.length === 0) {
        result[court.id] = {
          status: 'WAIT',
          reason: 'Không tìm thấy tổ hợp hợp lệ cho sân đôi',
        };
        continue;
      }

      // Cập nhật simMixDebt
      simMixDebt.doubles += state.settings.matchMix.doubles;
      simMixDebt.singles += state.settings.matchMix.singles;
      simMixDebt.doubles -= 1;

      const selectedIndex = (state.courtPlanIndex?.[court.id] ?? 0) % doublesProposals.length;
      const topProposal = doublesProposals[selectedIndex];
      topProposal.lineup.team1.forEach((id) => reservedPlayerIds.add(id));
      topProposal.lineup.team2.forEach((id) => reservedPlayerIds.add(id));

      result[court.id] = {
        status: 'OK',
        proposals: doublesProposals,
        selectedIndex,
      };
      continue;
    }

    // ==========================================
    // CASE C: POLICY === 'MIX'
    // ==========================================
    if (available.length < 2) {
      result[court.id] = {
        status: 'WAIT',
        reason: 'Không đủ người chơi hợp lệ (cần ít nhất 2 người)',
      };
      continue;
    }

    // Khi còn dưới 4 người (2 hoặc 3 người):
    // (Mục 2: CHỈ HỎI KHI SÂN TRỐNG. Sân đang đánh mà không đủ 4 người -> WAIT 'Chưa đủ người cho lượt sau')
    if (available.length < 4) {
      if (court.currentMatch !== null) {
        result[court.id] = {
          status: 'WAIT',
          reason: 'Chưa đủ người cho lượt sau',
        };
        continue;
      }

      // Sân đang trống (currentMatch === null):
      const autoSinglesMode = state.settings.autoSingles;
      if (autoSinglesMode === 'OFF') {
        result[court.id] = {
          status: 'WAIT',
          reason: 'Dưới 4 người và chế độ Tự động đánh đơn đang TẮT',
        };
        continue;
      }

      // Kiểm tra snooze
      const snooze = state.autoSinglesSnooze[court.id];
      if (
        snooze &&
        now < snooze.untilTs &&
        snooze.queueSizeAtSnooze === available.length
      ) {
        result[court.id] = {
          status: 'WAIT',
          reason: 'Đang tạm ẩn đề xuất đánh đơn',
        };
        continue;
      }

      const singlesProposals = generateSinglesProposals(
        available,
        state,
        state.settings.weights,
        seed,
        fixedSlots
      );

      if (singlesProposals.length === 0) {
        result[court.id] = {
          status: 'WAIT',
          reason: 'Không đủ người sẵn sàng đánh đơn (có người chọn không đánh đơn)',
        };
        continue;
      }

      const selectedIndex = (state.courtPlanIndex?.[court.id] ?? 0) % singlesProposals.length;
      const chosenProposal = singlesProposals[selectedIndex];

      if (autoSinglesMode === 'ASK') {
        // (Mục 3: RESERVE CHO NEEDS_CONFIRM theo phương án đang được chọn)
        chosenProposal.lineup.team1.forEach((id) => reservedPlayerIds.add(id));
        chosenProposal.lineup.team2.forEach((id) => reservedPlayerIds.add(id));

        result[court.id] = {
          status: 'NEEDS_CONFIRM',
          proposal: chosenProposal,
          reason: `Còn ${available.length} người chờ, bạn có muốn xếp trận ĐƠN không?`,
        };
        continue;
      }

      // autoSinglesMode === 'AUTO'
      simMixDebt.doubles += state.settings.matchMix.doubles;
      simMixDebt.singles += state.settings.matchMix.singles;
      simMixDebt.singles -= 1;

      chosenProposal.lineup.team1.forEach((id) => reservedPlayerIds.add(id));
      chosenProposal.lineup.team2.forEach((id) => reservedPlayerIds.add(id));

      result[court.id] = {
        status: 'OK',
        proposals: singlesProposals,
        selectedIndex,
      };
      continue;
    }

    // Khi có >= 4 người trên sân MIX:
    // Quyết định theo simMixDebt
    const debtD = simMixDebt.doubles + state.settings.matchMix.doubles;
    const debtS = simMixDebt.singles + state.settings.matchMix.singles;
    const preferredType: MatchType = debtS > debtD ? 'SINGLES' : 'DOUBLES';

    if (preferredType === 'SINGLES') {
      const singlesProposals = generateSinglesProposals(
        available,
        state,
        state.settings.weights,
        seed,
        fixedSlots
      );
      if (singlesProposals.length > 0) {
        simMixDebt.doubles += state.settings.matchMix.doubles;
        simMixDebt.singles += state.settings.matchMix.singles;
        simMixDebt.singles -= 1;

        const selectedIndex = (state.courtPlanIndex?.[court.id] ?? 0) % singlesProposals.length;
        const topProposal = singlesProposals[selectedIndex];
        topProposal.lineup.team1.forEach((id) => reservedPlayerIds.add(id));
        topProposal.lineup.team2.forEach((id) => reservedPlayerIds.add(id));

        result[court.id] = {
          status: 'OK',
          proposals: singlesProposals,
          selectedIndex,
        };
        continue;
      }
      // Fallback sang DOUBLES: không trừ debt của loại bị bỏ qua (Mục 7)
    }

    // Thử DOUBLES
    const doublesProposals = generateDoublesProposals(
      court.id,
      available,
      state,
      state.settings.weights,
      seed,
      fixedSlots
    );

    if (doublesProposals.length > 0) {
      simMixDebt.doubles += state.settings.matchMix.doubles;
      simMixDebt.singles += state.settings.matchMix.singles;
      simMixDebt.doubles -= 1;

      const selectedIndex = (state.courtPlanIndex?.[court.id] ?? 0) % doublesProposals.length;
      const topProposal = doublesProposals[selectedIndex];
      topProposal.lineup.team1.forEach((id) => reservedPlayerIds.add(id));
      topProposal.lineup.team2.forEach((id) => reservedPlayerIds.add(id));

      result[court.id] = {
        status: 'OK',
        proposals: doublesProposals,
        selectedIndex,
      };
      continue;
    }

    // Nếu DOUBLES không tìm được (do kẹt ràng buộc), fallback thử SINGLES nếu chưa thử
    if (preferredType === 'DOUBLES') {
      const fallbackSingles = generateSinglesProposals(
        available,
        state,
        state.settings.weights,
        seed,
        fixedSlots
      );
      if (fallbackSingles.length > 0) {
        simMixDebt.doubles += state.settings.matchMix.doubles;
        simMixDebt.singles += state.settings.matchMix.singles;
        simMixDebt.singles -= 1;

        const selectedIndex = (state.courtPlanIndex?.[court.id] ?? 0) % fallbackSingles.length;
        const topProposal = fallbackSingles[selectedIndex];
        topProposal.lineup.team1.forEach((id) => reservedPlayerIds.add(id));
        topProposal.lineup.team2.forEach((id) => reservedPlayerIds.add(id));

        result[court.id] = {
          status: 'OK',
          proposals: fallbackSingles,
          selectedIndex,
        };
        continue;
      }
    }

    result[court.id] = {
      status: 'WAIT',
      reason: 'Không tìm thấy tổ hợp hợp lệ thỏa mãn các ràng buộc',
    };
  }

  return result;
}

/**
 * Hàm tương thích ngược (Backward-compatible helper) cho các bài test hoặc caller đơn lẻ
 * (Mục 12: nhận now, không đọc Date.now())
 */
export function generateSuggestedMatch(
  courtId: number | string,
  players: Player[],
  courts: Court[],
  history: MatchHistory[],
  pairRules: PairRule[],
  settings: SessionSettings,
  now: number = 0
): { courtId: string; team1: Team; team2: Team; debugScore: MatchScoreBreakdown } | null {
  const cid = String(courtId);
  const normalizedCourts = courts.map((c) => ({
    ...c,
    id: String(c.id),
    policy: c.policy || 'MIX',
  }));

  const state: BadmintonSessionState = {
    schemaVersion: 2,
    players,
    courts: normalizedCourts,
    history,
    pairRules,
    settings,
    stats: buildStatsFromHistory(history),
    mixDebt: { doubles: 0, singles: 0 },
    readyQueue: [],
    autoSinglesSnooze: {},
    courtPlanIndex: {},
    undoStack: [],
    redoStack: [],
  };

  const plan = planAllCourts(state, now, 42);
  const courtPlan = plan[cid] ?? Object.values(plan)[0];
  if (courtPlan && courtPlan.status === 'OK' && courtPlan.proposals.length > 0) {
    const top = courtPlan.proposals[0];
    return {
      courtId: cid,
      team1: top.lineup.team1,
      team2: top.lineup.team2,
      debugScore: top.debugScore,
    };
  }
  return null;
}

/**
 * Selector thuần tính toán kế hoạch xếp sân cho UI (gọi planAllCourts, không lưu tự động vào state)
 */
export function selectCourtPlans(
  state: BadmintonSessionState,
  now: number,
  seed: number = 42
): CourtPlanMap {
  return planAllCourts(state, now, seed);
}

