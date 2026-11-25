import type {
  BadmintonSessionState,
  Court,
  FixedSlot,
  Lineup,
  MatchHistory,
  MatchProposal,
  MatchScoreBreakdown,
  MatchType,
  NextUpDraft,
  NextUpSlotSource,
  PairRule,
  PenaltyWeights,
  Player,
  SessionSettings,
  Team,
} from '../types/badminton';
import {
  createEmptyNextUp,
  isNextUpComplete,
  nextUpMemberIds,
  resolveTargetMatchType,
  slotsToLineup,
} from './nextUp';
import { getEffectiveSkill } from './skillConfig';
import { buildSessionFormOffsetMap } from './skillAnalyzer';
import {
  buildStatsFromHistory,
  getOpponentCount,
  getPartnerCount,
  isRecentOpponent,
  isRecentPartner,
  recordCompletedMatch,
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
 * Key chuẩn hóa đối xứng cho một trận (không phụ thuộc thứ tự đội hay thứ tự người trong cặp)
 */
export function getLineupCanonicalKey(team1: string[], team2: string[]): string {
  const t1 = [...team1].sort().join('+');
  const t2 = [...team2].sort().join('+');
  return [t1, t2].sort().join(' vs ');
}

/**
 * Phạt mềm khi lặp lại kèo từng bị gắn LOPSIDED ("Chênh quá") hoặc chênh >= 10 điểm.
 */
export function calculateLopsidedHistoryPenalty(
  team1: string[],
  team2: string[],
  history: MatchHistory[]
): number {
  if (!history || history.length === 0) return 0;

  const t1Key = [...team1].sort().join('|');
  const t2Key = [...team2].sort().join('|');
  const lineupPairSorted = [t1Key, t2Key].sort().join('::');

  let penalty = 0;
  for (const h of history) {
    const isLopsided =
      h.balanceRating === 'LOPSIDED' ||
      (h.score != null && Math.abs(h.score.team1 - h.score.team2) >= 10);
    if (!isLopsided) continue;

    const hk1 = [...h.team1].sort().join('|');
    const hk2 = [...h.team2].sort().join('|');
    const hLineupKey = [hk1, hk2].sort().join('::');

    if (lineupPairSorted === hLineupKey) {
      penalty += 1200;
    } else if (
      team1.length === 2 &&
      (t1Key === hk1 || t1Key === hk2 || t2Key === hk1 || t2Key === hk2)
    ) {
      penalty += 350;
    }
  }

  return penalty;
}

/**
 * Lấy canonical key cho một MatchProposal hoặc Lineup
 */
export function getProposalDedupeKey(lineup: Lineup): string {
  if (lineup.type === 'SINGLES') {
    return [lineup.team1[0], lineup.team2[0]].sort().join(' vs ');
  }
  return getLineupCanonicalKey(lineup.team1, lineup.team2);
}

/**
 * Lấy canonical key cho một NextUpDraft (trả về null nếu chưa đủ người)
 */
export function getNextUpDedupeKey(nextUp: NextUpDraft): string | null {
  if (!isNextUpComplete(nextUp)) return null;
  if (nextUp.type === 'SINGLES') {
    return [nextUp.slots[0]!, nextUp.slots[1]!].sort().join(' vs ');
  }
  return getLineupCanonicalKey(
    [nextUp.slots[0]!, nextUp.slots[1]!],
    [nextUp.slots[2]!, nextUp.slots[3]!]
  );
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

  // 1. Skill Balance (có tính thêm phong độ tạm trong buổi nếu bật)
  const formOffsets =
    state.settings.useSessionFormBalance !== false && state.history.length > 0
      ? buildSessionFormOffsetMap(state.players, state.history)
      : {};
  const eff1 =
    getEffectiveSkill(p1.rank, p1.sex, state.settings.maleBonus) +
    (formOffsets[p1.id] ?? 0);
  const eff2 =
    getEffectiveSkill(p2.rank, p2.sex, state.settings.maleBonus) +
    (formOffsets[p2.id] ?? 0);
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

  const lopsidedPenalty = calculateLopsidedHistoryPenalty([p1.id], [p2.id], state.history);

  const totalPenalty =
    skillBalancePenalty +
    opponentRepeatPenalty +
    singlesCountPenalty +
    waitPenalty +
    avoidMatchPenalty +
    lopsidedPenalty;

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

  // 5. Skill Balance (có tính thêm phong độ tạm trong buổi nếu bật)
  const formOffsets =
    state.settings.useSessionFormBalance !== false && state.history.length > 0
      ? buildSessionFormOffsetMap(state.players, state.history)
      : {};
  const eff1 =
    getEffectiveSkill(p1.rank, p1.sex, maleBonus) + (formOffsets[p1.id] ?? 0);
  const eff2 =
    getEffectiveSkill(p2.rank, p2.sex, maleBonus) + (formOffsets[p2.id] ?? 0);
  const eff3 =
    getEffectiveSkill(p3.rank, p3.sex, maleBonus) + (formOffsets[p3.id] ?? 0);
  const eff4 =
    getEffectiveSkill(p4.rank, p4.sex, maleBonus) + (formOffsets[p4.id] ?? 0);

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

  const lopsidedPenalty = calculateLopsidedHistoryPenalty(
    [p1.id, p2.id],
    [p3.id, p4.id],
    state.history
  );

  const totalPenalty =
    waitPenalty +
    exactQuartetRepeatPenalty +
    exactPairRepeatPenalty +
    partnerRepeatPenalty +
    opponentRepeatPenalty +
    skillBalancePenalty +
    genderStructurePenalty +
    avoidMatchPenalty +
    lopsidedPenalty;

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
 * Thuật toán ghép ĐƠN
 */
export function generateSinglesProposals(
  availablePlayers: Player[],
  state: BadmintonSessionState,
  weights: PenaltyWeights,
  seed: number,
  fixedSlot?: FixedSlot
): MatchProposal[] {
  if (fixedSlot) {
    const fixedPlayer = availablePlayers.find((p) => p.id === fixedSlot.playerId);
    if (!fixedPlayer) return [];

    const eligibleFillers = availablePlayers.filter(
      (p) => p.id !== fixedPlayer.id && !p.noSingles
    );
    if (eligibleFillers.length === 0) return [];

    const topK = sortPlayersByWaitPriority(eligibleFillers).slice(
      0,
      Math.min(6, eligibleFillers.length)
    );
    const eligibleForWait = [fixedPlayer, ...eligibleFillers];
    const proposals: MatchProposal[] = [];

    for (const filler of topK) {
      const p1 = fixedSlot.team === 1 ? fixedPlayer : filler;
      const p2 = fixedSlot.team === 1 ? filler : fixedPlayer;
      const debugScore = calculateSinglesScore(p1, p2, state, weights, eligibleForWait);

      const lineup: Lineup = {
        type: 'SINGLES',
        team1: [p1.id],
        team2: [p2.id],
        slotSource: {
          [p1.id]: p1.id === fixedPlayer.id ? 'MANUAL' : 'AUTO',
          [p2.id]: p2.id === fixedPlayer.id ? 'MANUAL' : 'AUTO',
        },
      };

      proposals.push({
        lineup,
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

  // Lọc người không từ chối đánh đơn
  const eligiblePlayers = availablePlayers.filter((p) => !p.noSingles);
  if (eligiblePlayers.length < 2) {
    return [];
  }

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
  _seed: number,
  fixedSlots?: FixedSlot[]
): MatchProposal[] {
  if (availablePlayers.length < 4) {
    return [];
  }

  const sortedAvailable = sortPlayersByWaitPriority(availablePlayers);
  const availableIdSet = new Set(sortedAvailable.map((p) => p.id));

  // 1. Phân loại và xử lý mâu thuẫn luật
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

  const hasPartialFixed = Boolean(fixedSlots && fixedSlots.length > 0 && fixedSlots.length < 4);
  const fixedIdSet = new Set<string>();
  const fixedT1: Player[] = [];
  const fixedT2: Player[] = [];
  let candidateCombinations: Array<{ team1: Player[]; team2: Player[] }> = [];

  if (hasPartialFixed && fixedSlots) {
    const playerById = new Map(sortedAvailable.map((p) => [p.id, p]));
    for (const fs of fixedSlots) {
      const p = playerById.get(fs.playerId);
      if (!p || fixedIdSet.has(p.id)) return [];
      fixedIdSet.add(p.id);
      if (fs.team === 1) fixedT1.push(p);
      else fixedT2.push(p);
    }
    if (fixedT1.length > 2 || fixedT2.length > 2) return [];

    const needT1 = 2 - fixedT1.length;
    const needT2 = 2 - fixedT2.length;
    const needTotal = needT1 + needT2;
    const fillerAvailable = sortedAvailable.filter((p) => !fixedIdSet.has(p.id));
    if (fillerAvailable.length < needTotal) return [];

    const fillerIdSet = new Set(fillerAvailable.map((p) => p.id));
    const candidateFillerIds = new Set<string>();
    const baseK = Math.min(8, fillerAvailable.length);
    for (let i = 0; i < baseK; i++) {
      candidateFillerIds.add(fillerAvailable[i].id);
    }
    for (const rule of effectiveLockRules) {
      const aInFiller = fillerIdSet.has(rule.playerAId);
      const bInFiller = fillerIdSet.has(rule.playerBId);
      if (aInFiller && (candidateFillerIds.has(rule.playerBId) || fixedIdSet.has(rule.playerBId))) {
        candidateFillerIds.add(rule.playerAId);
      }
      if (bInFiller && (candidateFillerIds.has(rule.playerAId) || fixedIdSet.has(rule.playerAId))) {
        candidateFillerIds.add(rule.playerBId);
      }
    }

    const candidateFillers = fillerAvailable.filter((p) => candidateFillerIds.has(p.id));
    if (candidateFillers.length < needTotal) return [];

    const fillerCombos = getCombinations(candidateFillers, needTotal);
    for (const fillers of fillerCombos) {
      const t1Options = getCombinations(fillers, needT1);
      for (const t1Fillers of t1Options) {
        const t1FillerIds = new Set(t1Fillers.map((p) => p.id));
        const t2Fillers = fillers.filter((p) => !t1FillerIds.has(p.id));
        candidateCombinations.push({
          team1: [...fixedT1, ...t1Fillers],
          team2: [...fixedT2, ...t2Fillers],
        });
      }
    }
  } else {
    // 2. Candidate pool: lấy tối đa 8 người rảnh ưu tiên cao nhất
    const candidateIds = new Set<string>();
    const baseK = Math.min(8, sortedAvailable.length);
    for (let i = 0; i < baseK; i++) {
      candidateIds.add(sortedAvailable[i].id);
    }

    // Kéo partner của LOCK_PARTNER vào candidate pool nếu 1 người trong candidate pool
    for (const rule of effectiveLockRules) {
      const freeA = availableIdSet.has(rule.playerAId);
      const freeB = availableIdSet.has(rule.playerBId);
      if (freeA && freeB) {
        if (candidateIds.has(rule.playerAId)) candidateIds.add(rule.playerBId);
        if (candidateIds.has(rule.playerBId)) candidateIds.add(rule.playerAId);
      }
    }

    const candidatePlayers = sortedAvailable.filter((p) => candidateIds.has(p.id));
    if (candidatePlayers.length < 4) {
      return [];
    }

    const candidateCombos = getCombinations(candidatePlayers, 4);
    for (const combo of candidateCombos) {
      const [p0, p1, p2, p3] = combo;
      candidateCombinations.push(
        { team1: [p0, p1], team2: [p2, p3] },
        { team1: [p0, p2], team2: [p1, p3] },
        { team1: [p0, p3], team2: [p1, p2] }
      );
    }
  }

  // 3. Sinh tất cả các phương án xếp đội có thể cho mỗi tổ hợp 4 người
  let foundProposals: MatchProposal[] = [];
  const seenLineupSignatures = new Set<string>();

  // 3 Stages:
  // Stage 0: Đầy đủ ràng buộc
  // Stage 1: Bỏ qua LOCK_PARTNER (nới tách cặp/thiếu cặp), AVOID_PARTNER vẫn nghiêm ngặt
  // Stage 2: Bỏ cả AVOID_PARTNER
  for (let stage = 0; stage < 3; stage++) {
    for (const { team1, team2 } of candidateCombinations) {
        const pA = team1[0];
        const pB = team1[1];
        const pC = team2[0];
        const pD = team2[1];

        const relaxedReasons: string[] = [];
        let valid = true;

        if (stage === 0) {
          // Check LOCK rules
          for (const rule of effectiveLockRules) {
            const inT1A = team1.some((p) => p.id === rule.playerAId);
            const inT1B = team1.some((p) => p.id === rule.playerBId);
            const inT2A = team2.some((p) => p.id === rule.playerAId);
            const inT2B = team2.some((p) => p.id === rule.playerBId);
            const inComboA = inT1A || inT2A;
            const inComboB = inT1B || inT2B;

            const freeA = availableIdSet.has(rule.playerAId);
            const freeB = availableIdSet.has(rule.playerBId);

            if (freeA && freeB) {
              if (inComboA !== inComboB) {
                valid = false;
                break;
              }
              if (inComboA && inComboB) {
                if (!((inT1A && inT1B) || (inT2A && inT2B))) {
                  valid = false;
                  break;
                }
              }
            }
          }
        } else if (stage >= 1) {
          relaxedReasons.push('Bỏ qua khóa cặp đôi');
        }

        if (valid && stage < 2) {
          // Check AVOID rules
          for (const rule of avoidRules) {
            const inT1A = team1.some((p) => p.id === rule.playerAId);
            const inT1B = team1.some((p) => p.id === rule.playerBId);
            const inT2A = team2.some((p) => p.id === rule.playerAId);
            const inT2B = team2.some((p) => p.id === rule.playerBId);
            if ((inT1A && inT1B) || (inT2A && inT2B)) {
              valid = false;
              break;
            }
          }
        } else if (stage === 2) {
          relaxedReasons.push('Bỏ qua tránh cặp đôi');
        }

        if (!valid) continue;

        // Tránh trùng lặp
        const sig = getLineupCanonicalKey(team1.map((p) => p.id), team2.map((p) => p.id));
        if (seenLineupSignatures.has(sig)) continue;
        seenLineupSignatures.add(sig);

        const debugScore = calculateDoublesScore(
          pA,
          pB,
          pC,
          pD,
          courtId,
          state,
          weights,
          availablePlayers
        );

        const lineup: Lineup = {
          type: 'DOUBLES',
          team1: [pA.id, pB.id],
          team2: [pC.id, pD.id],
          slotSource: {
            [pA.id]: fixedIdSet.has(pA.id) ? 'MANUAL' : 'AUTO',
            [pB.id]: fixedIdSet.has(pB.id) ? 'MANUAL' : 'AUTO',
            [pC.id]: fixedIdSet.has(pC.id) ? 'MANUAL' : 'AUTO',
            [pD.id]: fixedIdSet.has(pD.id) ? 'MANUAL' : 'AUTO',
          },
        };

        foundProposals.push({
          lineup,
          debugScore,
          penalty: debugScore.totalPenalty,
          relaxed: stage > 0,
          relaxedReasons,
        });
    }

    if (foundProposals.length > 0) {
      break;
    }
  }

  foundProposals.sort((a, b) => {
    if (Math.abs(a.penalty - b.penalty) > 1e-4) {
      return a.penalty - b.penalty;
    }
    const sigA = getProposalDedupeKey(a.lineup);
    const sigB = getProposalDedupeKey(b.lineup);
    return sigA.localeCompare(sigB);
  });

  return foundProposals.slice(0, 15);
}

/**
 * Helper giả lập trạng thái người chơi và thống kê sau khi kết thúc trận hiện tại của sân
 * Chỉ bổ sung người của currentMatch của CHÍNH sân này
 */
function buildProjectedEnvironment(
  court: Court,
  available: Player[],
  state: BadmintonSessionState,
  now: number
): {
  projectedAvailable: Player[];
  projectedState: BadmintonSessionState;
  currentMatchPlayerIdSet: Set<string>;
} | null {
  if (!court.currentMatch) return null;

  const currentMatchPlayerIds = [...court.currentMatch.team1, ...court.currentMatch.team2];
  const currentMatchPlayerIdSet = new Set(currentMatchPlayerIds);

  const activeCourtPlayers: Player[] = [];
  for (const pid of currentMatchPlayerIds) {
    const p = state.players.find((pl) => pl.id === pid);
    if (p && p.status === 'ACTIVE') {
      activeCourtPlayers.push({
        ...p,
        gamesPlayed: p.gamesPlayed + 1,
        waitStreak: 0,
        lastPlayedAt: now,
        singlesCount: court.currentMatch.type === 'SINGLES' ? p.singlesCount + 1 : p.singlesCount,
      });
    }
  }

  const projectedAvailable = [...available, ...activeCourtPlayers];

  const simulatedMatchHistory: MatchHistory = {
    id: court.currentMatch.id ?? `sim_${court.id}_${now}`,
    courtId: court.id,
    type: court.currentMatch.type,
    team1: [...court.currentMatch.team1],
    team2: [...court.currentMatch.team2],
    slotSource: court.currentMatch.slotSource ? { ...court.currentMatch.slotSource } : {},
    startedAt: court.currentMatch.startedAt,
    endedAt: now,
    durationMinutes: Math.max(1, Math.round((now - court.currentMatch.startedAt) / 60000)),
  };

  const projectedStats = recordCompletedMatch(state.stats, simulatedMatchHistory);

  const playerMap = new Map(state.players.map((p) => [p.id, p]));
  for (const simP of activeCourtPlayers) {
    playerMap.set(simP.id, simP);
  }

  const projectedState: BadmintonSessionState = {
    ...state,
    players: Array.from(playerMap.values()),
    stats: projectedStats,
    history: [simulatedMatchHistory, ...state.history],
  };

  return {
    projectedAvailable,
    projectedState,
    currentMatchPlayerIdSet,
  };
}

interface FixedSlotWithIndex extends FixedSlot {
  slotIndex: number;
}

function extractPartialManualSlots(
  court: Court,
  state: BadmintonSessionState,
  playingOnOtherCourts: Set<string>
): FixedSlotWithIndex[] {
  const nextUp = court.nextUp;
  if (!nextUp || !Array.isArray(nextUp.slots) || !Array.isArray(nextUp.slotSource)) {
    return [];
  }
  const draftType: MatchType = nextUp.type === 'SINGLES' ? 'SINGLES' : 'DOUBLES';
  const expectedCount = draftType === 'SINGLES' ? 2 : 4;
  const activePlayerIds = new Set(
    state.players.filter((p) => p.status === 'ACTIVE').map((p) => p.id)
  );
  const seenIds = new Set<string>();
  const result: FixedSlotWithIndex[] = [];

  for (let i = 0; i < expectedCount; i++) {
    const rawPid = nextUp.slots[i];
    const pid = typeof rawPid === 'string' && rawPid.trim().length > 0 ? rawPid.trim() : null;
    if (!pid) continue;
    if (nextUp.slotSource[i] !== 'MANUAL') continue;
    if (!activePlayerIds.has(pid)) continue;
    if (playingOnOtherCourts.has(pid)) continue;
    if (seenIds.has(pid)) continue;

    seenIds.add(pid);
    result.push({
      playerId: pid,
      team: draftType === 'SINGLES' ? (i === 0 ? 1 : 2) : i < 2 ? 1 : 2,
      slotIndex: i,
    });
  }

  if (result.length === 0 || result.length >= expectedCount) {
    return [];
  }
  return result;
}

export interface SuggestNextUpOptions {
  isAutoSuggest?: boolean;
}

/**
 * Gợi ý Next Up cho duy nhất 1 sân cụ thể (P3).
 * Chỉ tính cho ĐÚNG sân X, không ảnh hưởng hay ghi đè sân khác.
 */
export function suggestNextUpForCourt(
  state: BadmintonSessionState,
  courtId: string,
  now: number,
  options?: SuggestNextUpOptions
): NextUpDraft | null {
  const court = state.courts.find((c) => c.id === courtId);
  if (!court || !court.isActive) return null;

  // 1. Tập người đang thi đấu ở bất kỳ sân nào (currentMatch) - CẤM
  const playingPlayerIds = new Set<string>();
  const playingOnOtherCourts = new Set<string>();
  for (const c of state.courts) {
    if (c.isActive && c.currentMatch) {
      c.currentMatch.team1.forEach((id) => {
        playingPlayerIds.add(id);
        if (c.id !== courtId) playingOnOtherCourts.add(id);
      });
      c.currentMatch.team2.forEach((id) => {
        playingPlayerIds.add(id);
        if (c.id !== courtId) playingOnOtherCourts.add(id);
      });
    }
  }

  const partialFixedSlots = options?.isAutoSuggest
    ? []
    : extractPartialManualSlots(court, state, playingOnOtherCourts);

  // 2. Tập người đã nằm trong Next Up của sân KHÁC
  const otherNextUpPlayerIds = new Set<string>();
  for (const c of state.courts) {
    if (c.id !== courtId && c.isActive && c.nextUp) {
      nextUpMemberIds(c.nextUp).forEach((id) => otherNextUpPlayerIds.add(id));
    }
  }

  const activeCourtIdSet = new Set(state.courts.filter((c) => c.isActive).map((c) => c.id));
  const matchesCourtPool = (p: Player) =>
    state.settings.courtMode !== 'SPLIT_COURT' ||
    p.assignedPool === court.id ||
    p.assignedPool === 'ALL' ||
    !activeCourtIdSet.has(p.assignedPool);

  // 3. Pool chính (ưu tiên): ACTIVE, không thi đấu ở bất kỳ sân nào, không nằm trong nextUp sân khác
  const primaryAvailable = state.players.filter((p) => {
    if (p.status !== 'ACTIVE') return false;
    if (playingPlayerIds.has(p.id)) return false;
    if (otherNextUpPlayerIds.has(p.id)) return false;
    return matchesCourtPool(p);
  });

  // 4. Pool mở rộng (khi thiếu người): ACTIVE, không thi đấu ở bất kỳ sân nào, nhưng đang ở nextUp sân khác
  const secondaryAvailable = state.players.filter((p) => {
    if (p.status !== 'ACTIVE') return false;
    if (playingPlayerIds.has(p.id)) return false;
    if (!otherNextUpPlayerIds.has(p.id)) return false;
    return matchesCourtPool(p);
  });

  const sortedSecondary = sortPlayersByWaitPriority(secondaryAvailable);
  const totalFreeCount = primaryAvailable.length + sortedSecondary.length;
  const playingCourtsCount = state.courts.filter(
    (c) => c.isActive && c.currentMatch !== null
  ).length;
  if (
    options?.isAutoSuggest &&
    state.settings.courtMode === 'SHARED_POOL' &&
    playingCourtsCount > 1 &&
    totalFreeCount === 0
  ) {
    return null;
  }

  let matchType: MatchType = resolveTargetMatchType(court, state, totalFreeCount, now);
  if (partialFixedSlots.length > 0) {
    const hardForcedSingles = court.forcedType === 'SINGLES' || court.policy === 'SINGLES_ONLY';
    const hardForcedDoubles = court.forcedType === 'DOUBLES' || court.policy === 'DOUBLES_ONLY';
    if (court.nextUp.type === 'SINGLES' && !hardForcedDoubles) {
      matchType = 'SINGLES';
    } else if (court.nextUp.type === 'DOUBLES' && !hardForcedSingles) {
      matchType = 'DOUBLES';
    }
  }

  const buildProposalsForType = (targetType: MatchType): MatchProposal[] => {
    const neededCount = targetType === 'SINGLES' ? 2 : 4;
    const activeFixed =
      partialFixedSlots.length > 0 && targetType === court.nextUp.type ? partialFixedSlots : [];
    const fixedIdSet = new Set(activeFixed.map((f) => f.playerId));
    const neededFill = neededCount - activeFixed.length;

    let fillerCandidates = primaryAvailable.filter((p) => !fixedIdSet.has(p.id));
    let effectiveState = state;

    const hasEnoughPrimary =
      targetType === 'SINGLES'
        ? fillerCandidates.filter((p) => !p.noSingles).length >= neededFill
        : fillerCandidates.length >= neededFill;

    // Nếu thiếu người: thử dự kiến người từ trận đang đánh trên sân này
    if (!hasEnoughPrimary && court.currentMatch) {
      const proj = buildProjectedEnvironment(court, fillerCandidates, state, now);
      if (proj) {
        fillerCandidates = proj.projectedAvailable.filter((p) => !fixedIdSet.has(p.id));
        effectiveState = proj.projectedState;
      }
    }

    // Hạng mục 2.1: Nếu vẫn chưa đủ người, bổ sung người từ Next Up sân khác (ưu tiên waitPriority & lọc noSingles cho Đơn)
    const existingFillerIds = new Set(fillerCandidates.map((p) => p.id));
    if (targetType === 'SINGLES') {
      let singlesEligible = fillerCandidates.filter((p) => !p.noSingles).length;
      if (singlesEligible < neededFill) {
        for (const p of sortedSecondary) {
          if (!fixedIdSet.has(p.id) && !p.noSingles && !existingFillerIds.has(p.id)) {
            fillerCandidates.push(p);
            existingFillerIds.add(p.id);
            singlesEligible++;
            if (singlesEligible >= neededFill) break;
          }
        }
      }
    } else if (fillerCandidates.length < neededFill) {
      for (const p of sortedSecondary) {
        if (!fixedIdSet.has(p.id) && !existingFillerIds.has(p.id)) {
          fillerCandidates.push(p);
          existingFillerIds.add(p.id);
          if (fillerCandidates.length >= neededFill) break;
        }
      }
    }

    const effectivePlayerMap = new Map(effectiveState.players.map((p) => [p.id, p]));
    const fixedPlayerObjs: Player[] = [];
    for (const f of activeFixed) {
      const pObj = effectivePlayerMap.get(f.playerId);
      if (!pObj) return [];
      fixedPlayerObjs.push(pObj);
    }

    const seenCombined = new Set<string>();
    const effectiveAvailable: Player[] = [];
    for (const p of [...fixedPlayerObjs, ...fillerCandidates]) {
      if (!seenCombined.has(p.id)) {
        seenCombined.add(p.id);
        effectiveAvailable.push(p);
      }
    }

    if (effectiveAvailable.length < neededCount) {
      return [];
    }

    if (targetType === 'SINGLES') {
      return generateSinglesProposals(
        effectiveAvailable,
        effectiveState,
        effectiveState.settings.weights,
        42,
        activeFixed[0]
      );
    }

    return generateDoublesProposals(
      court.id,
      effectiveAvailable,
      effectiveState,
      effectiveState.settings.weights,
      42,
      activeFixed
    );
  };

  let rawProposals = buildProposalsForType(matchType);

  const isHardLockedSingles =
    court.forcedType === 'SINGLES' ||
    court.policy === 'SINGLES_ONLY' ||
    (state.settings?.matchMix?.singles === 1 && court.forcedType !== 'DOUBLES') ||
    court.nextUp?.type === 'SINGLES';

  if (
    matchType === 'SINGLES' &&
    rawProposals.length === 0 &&
    !isHardLockedSingles &&
    !(partialFixedSlots.length > 0 && court.nextUp.type === 'SINGLES')
  ) {
    const fallbackDoubles = buildProposalsForType('DOUBLES');
    if (fallbackDoubles.length > 0) {
      matchType = 'DOUBLES';
      rawProposals = fallbackDoubles;
    }
  }

  if (rawProposals.length === 0) {
    return null;
  }

  const uniqueProposals: MatchProposal[] = [];
  const seenKeys = new Set<string>();
  for (const p of rawProposals) {
    const key = getProposalDedupeKey(p.lineup);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueProposals.push(p);
    }
  }

  const n = uniqueProposals.length;
  if (n === 0) return null;

  const currentKey = getNextUpDedupeKey(court.nextUp);
  let pickedIndex = ((court.suggestCursor || 0) % n + n) % n;

  if (n > 1 && currentKey && getProposalDedupeKey(uniqueProposals[pickedIndex].lineup) === currentKey) {
    pickedIndex = (pickedIndex + 1) % n;
  }

  const chosen = uniqueProposals[pickedIndex];
  const chosenFixed =
    partialFixedSlots.length > 0 && matchType === court.nextUp.type ? partialFixedSlots : [];

  if (chosenFixed.length > 0) {
    const expectedCount = matchType === 'SINGLES' ? 2 : 4;
    const slots: (string | null)[] = Array(expectedCount).fill(null);
    const slotSource: (NextUpSlotSource | null)[] = Array(expectedCount).fill(null);
    const fixedIdSet = new Set(chosenFixed.map((f) => f.playerId));

    for (const f of chosenFixed) {
      slots[f.slotIndex] = f.playerId;
      slotSource[f.slotIndex] = 'MANUAL';
    }

    const autoT1 = chosen.lineup.team1.filter((id) => !fixedIdSet.has(id));
    const autoT2 = chosen.lineup.team2.filter((id) => !fixedIdSet.has(id));

    if (matchType === 'SINGLES') {
      if (slots[0] === null && autoT1[0]) {
        slots[0] = autoT1[0];
        slotSource[0] = 'AUTO';
      }
      if (slots[1] === null && autoT2[0]) {
        slots[1] = autoT2[0];
        slotSource[1] = 'AUTO';
      }
    } else {
      let t1Ptr = 0;
      for (const idx of [0, 1]) {
        if (slots[idx] === null && autoT1[t1Ptr]) {
          slots[idx] = autoT1[t1Ptr++];
          slotSource[idx] = 'AUTO';
        }
      }
      let t2Ptr = 0;
      for (const idx of [2, 3]) {
        if (slots[idx] === null && autoT2[t2Ptr]) {
          slots[idx] = autoT2[t2Ptr++];
          slotSource[idx] = 'AUTO';
        }
      }
    }

    return {
      type: matchType,
      slots,
      slotSource,
    };
  }

  if (matchType === 'SINGLES') {
    return {
      type: 'SINGLES',
      slots: [chosen.lineup.team1[0], chosen.lineup.team2[0]],
      slotSource: ['AUTO', 'AUTO'],
    };
  }

  return {
    type: 'DOUBLES',
    slots: [
      chosen.lineup.team1[0],
      chosen.lineup.team1[1],
      chosen.lineup.team2[0],
      chosen.lineup.team2[1],
    ],
    slotSource: ['AUTO', 'AUTO', 'AUTO', 'AUTO'],
  };
}

/**
 * Hàm tương thích ngược (Backward-compatible helper) cho các caller đơn lẻ
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
    nextUp: c.nextUp || createEmptyNextUp('DOUBLES'),
    suggestCursor: c.suggestCursor || 0,
  }));

  const state: BadmintonSessionState = {
    schemaVersion: 3,
    players,
    courts: normalizedCourts,
    history,
    pairRules,
    settings,
    stats: buildStatsFromHistory(history),
    mixDebt: { doubles: 0, singles: 0 },
    readyQueue: [],
    autoSinglesSnooze: {},
    undoStack: [],
    redoStack: [],
  };

  const draft = suggestNextUpForCourt(state, cid, now);
  if (!draft || !isNextUpComplete(draft)) {
    return null;
  }
  const lineup = slotsToLineup(draft);
  if (!lineup) return null;

  return {
    courtId: cid,
    team1: lineup.team1,
    team2: lineup.team2,
    debugScore: createEmptyBreakdown(),
  };
}
