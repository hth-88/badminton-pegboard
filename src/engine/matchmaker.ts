import type {
  BadmintonSessionState,
  Court,
  CourtPlanMap,
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
 * - Không nằm trong nextUp của sân khác (dù khóa hay không)
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
    // Không nằm trong nextUp của sân khác
    if (c.id !== court.id && c.isActive && c.nextUp) {
      c.nextUp.team1.forEach((id) => busyIds.add(id));
      c.nextUp.team2.forEach((id) => busyIds.add(id));
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
 * Quyết định loại trận (decideMatchType) bằng bộ đếm thiếu hụt (mixDebt) thay cho random:
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
 * Thuật toán ghép ĐƠN:
 * - Chọn 2 người trong top K=6 theo ưu tiên chờ
 * - Loại người noSingles
 * - Penalty: chênh lệch trình độ bình phương, opponentCount cũ, lặp đối thủ trận trước, singlesCount cao hơn trung bình
 * - LOCK_PARTNER vô hiệu, AVOID_PARTNER không áp dụng, AVOID_MATCH phạt +weights.avoidMatchPenalty
 */
export function generateSinglesProposals(
  availablePlayers: Player[],
  state: BadmintonSessionState,
  weights: PenaltyWeights,
  seed: number
): MatchProposal[] {
  // Lọc người không từ chối đánh đơn
  const eligiblePlayers = availablePlayers.filter((p) => !p.noSingles);
  if (eligiblePlayers.length < 2) {
    return [];
  }

  const sorted = sortPlayersByWaitPriority(eligiblePlayers);
  const topK = sorted.slice(0, Math.min(6, sorted.length));

  // Tính trung bình số trận đơn của toàn bộ người chơi active
  const activeAll = state.players.filter((p) => p.status === 'ACTIVE');
  const avgSingles =
    activeAll.reduce((sum, p) => sum + p.singlesCount, 0) / (activeAll.length || 1);

  const proposals: MatchProposal[] = [];

  for (let i = 0; i < topK.length - 1; i++) {
    for (let j = i + 1; j < topK.length; j++) {
      const p1 = topK[i];
      const p2 = topK[j];

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
      const skillDiff = Math.abs(eff1 - eff2);
      const skillBalancePenalty = Math.pow(skillDiff, 2) * weights.singlesSkillBalanceMultiplier;

      // 2. Opponent Count & Recent Opponent
      const oppCount = getOpponentCount(state.stats, p1.id, p2.id);
      let opponentRepeatPenalty = oppCount * weights.singlesOpponentRepeatMultiplier;

      if (isRecentOpponent(state.stats, p1.id, p2.id)) {
        opponentRepeatPenalty += weights.singlesRecentOpponentPenalty;
      }

      // 3. Singles Count Penalty (phạt nếu 1 người đã đánh đơn quá nhiều so với trung bình)
      const excess1 = Math.max(0, p1.singlesCount - avgSingles);
      const excess2 = Math.max(0, p2.singlesCount - avgSingles);
      const singlesCountPenalty = (excess1 + excess2) * weights.singlesCountExcessMultiplier;

      // 4. Wait penalty (nếu bỏ rơi người có waitStreak cao hơn hoặc ít trận hơn)
      let waitPenalty = 0;
      const minChosenWait = Math.min(p1.waitStreak, p2.waitStreak);
      const maxChosenEff = Math.max(
        p1.gamesPlayed + p1.virtualGamesOffset,
        p2.gamesPlayed + p2.virtualGamesOffset
      );

      for (const p of availablePlayers) {
        if (p.id !== p1.id && p.id !== p2.id) {
          if (p.waitStreak > minChosenWait) {
            waitPenalty += (p.waitStreak - minChosenWait) * weights.waitStreakMultiplier;
          }
          const pEff = p.gamesPlayed + p.virtualGamesOffset;
          if (pEff < maxChosenEff) {
            waitPenalty += (maxChosenEff - pEff) * 6000;
          }
        }
      }

      const totalPenalty =
        skillBalancePenalty +
        opponentRepeatPenalty +
        singlesCountPenalty +
        waitPenalty +
        avoidMatchPenalty;

      const debugScore: MatchScoreBreakdown = {
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

      const lineup: Lineup = {
        type: 'SINGLES',
        team1: [p1.id],
        team2: [p2.id],
        slotSource: { [p1.id]: 'AUTO', [p2.id]: 'AUTO' },
      };

      proposals.push({ lineup, debugScore, penalty: totalPenalty });
    }
  }

  // Sắp xếp deterministic: penalty tăng dần, tie-break bằng pseudoHash
  proposals.sort((a, b) => {
    if (a.penalty !== b.penalty) return a.penalty - b.penalty;
    const hashA = pseudoHash(a.lineup.team1[0] + a.lineup.team2[0], seed);
    const hashB = pseudoHash(b.lineup.team1[0] + b.lineup.team2[0], seed);
    return hashA - hashB;
  });

  return proposals.slice(0, 5);
}

/**
 * Sinh tổ hợp 4 người
 */
function getCombinations4<T>(arr: T[]): [T, T, T, T][] {
  const result: [T, T, T, T][] = [];
  const n = arr.length;
  for (let i = 0; i < n - 3; i++) {
    for (let j = i + 1; j < n - 2; j++) {
      for (let k = j + 1; k < n - 1; k++) {
        for (let l = k + 1; l < n; l++) {
          result.push([arr[i], arr[j], arr[k], arr[l]]);
        }
      }
    }
  }
  return result;
}

/**
 * Thuật toán ghép ĐÔI:
 * - Coi cặp LOCK_PARTNER là MỘT đơn vị khi chọn top K
 * - Ràng buộc cứng: AVOID_PARTNER (cấm đứng cùng đội) và LOCK_PARTNER khi cả 2 rảnh (phải cùng đội)
 * - Ràng buộc mềm: AVOID_MATCH (phạt +weights.avoidMatchPenalty), Wait, Repeat, Skill, Gender
 * - Nới ràng buộc mềm có giới hạn số lần thử (bounded relaxation stages, tối đa 3 vòng)
 */
export function generateDoublesProposals(
  courtId: string,
  availablePlayers: Player[],
  state: BadmintonSessionState,
  weights: PenaltyWeights,
  seed: number
): MatchProposal[] {
  if (availablePlayers.length < 4) {
    return [];
  }

  const sortedAvailable = sortPlayersByWaitPriority(availablePlayers);
  const availableIdSet = new Set(sortedAvailable.map((p) => p.id));
  const maleBonus = state.settings.maleBonus;
  const preferMixed = state.settings.preferMixedDoubles;

  // Xây dựng candidate pool K (mặc định 8)
  // Coi cặp LOCK_PARTNER là MỘT đơn vị khi chọn top K:
  // Nếu A nằm trong top K và B rảnh thì B cũng được kéo vào top K
  const candidateIds = new Set<string>();
  const activePairRules = state.pairRules.filter((r) => {
    // Nếu một người trong cặp đang PAUSED thì rule tạm vô hiệu
    const pA = state.players.find((p) => p.id === r.playerAId);
    const pB = state.players.find((p) => p.id === r.playerBId);
    return pA && pB && pA.status === 'ACTIVE' && pB.status === 'ACTIVE';
  });

  const baseK = Math.min(8, sortedAvailable.length);
  for (let i = 0; i < baseK; i++) {
    candidateIds.add(sortedAvailable[i].id);
  }

  for (const rule of activePairRules) {
    if (rule.type === 'LOCK_PARTNER') {
      const freeA = availableIdSet.has(rule.playerAId);
      const freeB = availableIdSet.has(rule.playerBId);
      if (freeA && freeB) {
        if (candidateIds.has(rule.playerAId)) candidateIds.add(rule.playerBId);
        if (candidateIds.has(rule.playerBId)) candidateIds.add(rule.playerAId);
      }
    }
  }

  const candidatePlayers = sortedAvailable.filter((p) => candidateIds.has(p.id));
  if (candidatePlayers.length < 4) {
    return [];
  }

  const quartets = getCombinations4(candidatePlayers);
  const lastCourtMatch = state.stats.lastMatchOfCourt[courtId];

  // Bounded relaxation stages: Stage 0 (nghiêm ngặt) -> Stage 1 (nới mềm AVOID_MATCH) -> Stage 2 (nới tối đa)
  let foundProposals: MatchProposal[] = [];

  for (let stage = 0; stage < 3; stage++) {
    for (const quartet of quartets) {
      const quartetIds = new Set(quartet.map((p) => p.id));

      // Kiểm tra quy tắc LOCK_PARTNER ở cấp bộ 4 người:
      // Nếu A và B đều rảnh, không thể chỉ có A mà thiếu B
      let violatesLockQuartet = false;
      for (const rule of activePairRules) {
        if (rule.type === 'LOCK_PARTNER') {
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
      }
      if (violatesLockQuartet && stage < 2) {
        continue;
      }

      const [pA, pB, pC, pD] = quartet;
      const pairings: Array<{ team1: [Player, Player]; team2: [Player, Player] }> = [
        { team1: [pA, pB], team2: [pC, pD] },
        { team1: [pA, pC], team2: [pB, pD] },
        { team1: [pA, pD], team2: [pB, pC] },
      ];

      for (const { team1, team2 } of pairings) {
        const [p1, p2] = team1;
        const [p3, p4] = team2;

        let hardViolation = false;

        for (const rule of activePairRules) {
          // RÀNG BUỘC CỨNG 1: AVOID_PARTNER cấm đứng cùng đội
          if (rule.type === 'AVOID_PARTNER') {
            const sameT1 =
              (p1.id === rule.playerAId && p2.id === rule.playerBId) ||
              (p1.id === rule.playerBId && p2.id === rule.playerAId);
            const sameT2 =
              (p3.id === rule.playerAId && p4.id === rule.playerBId) ||
              (p3.id === rule.playerBId && p4.id === rule.playerAId);
            if (sameT1 || sameT2) {
              hardViolation = true;
              break;
            }
          }

          // RÀNG BUỘC CỨNG 2: LOCK_PARTNER khi cả 2 rảnh thì nếu cùng vào trận phải cùng đội
          if (rule.type === 'LOCK_PARTNER') {
            const inT1A = p1.id === rule.playerAId || p2.id === rule.playerAId;
            const inT1B = p1.id === rule.playerBId || p2.id === rule.playerBId;
            const inT2A = p3.id === rule.playerAId || p4.id === rule.playerAId;
            const inT2B = p3.id === rule.playerBId || p4.id === rule.playerBId;

            if ((inT1A && inT2B) || (inT2A && inT1B)) {
              hardViolation = true;
              break;
            }
          }
        }

        if (hardViolation) {
          continue;
        }

        // TÍNH TOÁN CÁC HÀM PHẠT PENALTY

        // 1. WaitPenalty
        let waitPenalty = 0;
        const minChosenWait = Math.min(...quartet.map((p) => p.waitStreak));
        const maxChosenEff = Math.max(...quartet.map((p) => p.gamesPlayed + p.virtualGamesOffset));

        for (const p of sortedAvailable) {
          if (!quartetIds.has(p.id)) {
            // Phạt nếu người đang đợi ở ngoài có waitStreak cao hơn người được chọn
            if (p.waitStreak > minChosenWait) {
              waitPenalty += (p.waitStreak - minChosenWait) * weights.waitStreakMultiplier;
            }
            // Phạt cực nặng nếu người đang đợi ở ngoài có số trận ít hơn người được chọn (chống lệch số trận)
            const pEff = p.gamesPlayed + p.virtualGamesOffset;
            if (pEff < maxChosenEff) {
              waitPenalty += (maxChosenEff - pEff) * 6000;
            }
          }
        }

        // 2. Exact Repeat Penalty & Chống lặp cặp liên tiếp
        let exactQuartetRepeatPenalty = 0;
        let exactPairRepeatPenalty = 0;

        const candidateMatchesToCheck: MatchHistory[] = [];
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

        // 3. Partner Repeat Penalty (phạt cực nặng nếu vừa đứng cùng nhau ở trận gần nhất để không ai lặp cặp liên tiếp)
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

        const team1Skill = eff1 + eff2;
        const team2Skill = eff3 + eff4;
        const skillDiff = Math.abs(team1Skill - team2Skill);
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
          genderStructurePenalty += 20;
        }

        // 7. AVOID_MATCH Penalty (+200 mỗi cặp nếu cùng sân)
        let avoidMatchPenalty = 0;
        for (const rule of activePairRules) {
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

        const debugScore: MatchScoreBreakdown = {
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

        const lineup: Lineup = {
          type: 'DOUBLES',
          team1: [p1.id, p2.id],
          team2: [p3.id, p4.id],
          slotSource: { [p1.id]: 'AUTO', [p2.id]: 'AUTO', [p3.id]: 'AUTO', [p4.id]: 'AUTO' },
        };

        foundProposals.push({ lineup, debugScore, penalty: totalPenalty });
      }
    }

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
 * - Duyệt các sân cần Next Up theo thứ tự
 * - Đưa người đã chọn vào tập reserved để các sân sau không chọn trùng
 * - Trả về top N (N=5) phương án xếp hạng cho từng sân
 * - Tôn trọng policy, autoSingles, snooze, waitStreak và mixDebt
 */
export function planAllCourts(
  state: BadmintonSessionState,
  now: number,
  seed: number = 42
): CourtPlanMap {
  const result: CourtPlanMap = {};
  const reservedPlayerIds = new Set<string>();

  // Lấy các sân active: ưu tiên duyệt các sân đang rảnh trước (currentMatch === null) để có đội hình vào sân ngay
  const activeCourts = [...state.courts.filter((c) => c.isActive)].sort((a, b) => {
    const aFree = a.currentMatch === null ? 0 : 1;
    const bFree = b.currentMatch === null ? 0 : 1;
    if (aFree !== bFree) return aFree - bFree;
    return a.id.localeCompare(b.id);
  });

  for (const court of activeCourts) {
    // Nếu sân đã có nextUp bị khóa bởi Host, không lập phương án thay thế, nhưng giữ chỗ cho người trong đó
    if (court.nextUp && court.nextUp.isLockedByHost) {
      court.nextUp.team1.forEach((id) => reservedPlayerIds.add(id));
      court.nextUp.team2.forEach((id) => reservedPlayerIds.add(id));
      result[court.id] = {
        status: 'OK',
        proposals: [
          {
            lineup: court.nextUp,
            debugScore: {
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
            },
            penalty: 0,
          },
        ],
        selectedIndex: 0,
      };
      continue;
    }

    // 1. Lấy người chơi hợp lệ cho sân này
    const available = getValidAvailablePlayersForCourt(
      court,
      state.courts,
      state.players,
      reservedPlayerIds,
      state.settings
    );

    // 2. Quyết định loại trận và kiểm tra ngưỡng người chơi
    if (available.length < 2) {
      result[court.id] = {
        status: 'WAIT',
        reason: 'Không đủ người chơi hợp lệ (cần ít nhất 2 người)',
      };
      continue;
    }

    // Xử lý trường hợp dưới 4 người (còn 2 hoặc 3 người)
    if (available.length < 4) {
      if (court.policy === 'DOUBLES_ONLY') {
        result[court.id] = {
          status: 'WAIT',
          reason: 'Sân chỉ đánh đôi nhưng chỉ có ' + available.length + ' người',
        };
        continue;
      }

      // Kiểm tra cấu hình autoSingles
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

      // Tạo gợi ý Đơn (nếu 3 người thì lấy 2 người ưu tiên cao nhất)
      const singlesProposals = generateSinglesProposals(
        available,
        state,
        state.settings.weights,
        seed
      );

      if (singlesProposals.length === 0) {
        result[court.id] = {
          status: 'WAIT',
          reason: 'Không đủ người sẵn sàng đánh đơn (có người chọn không đánh đơn)',
        };
        continue;
      }

      const topProposal = singlesProposals[0];

      if (autoSinglesMode === 'ASK') {
        result[court.id] = {
          status: 'NEEDS_CONFIRM',
          proposal: topProposal,
          reason: `Còn ${available.length} người chờ, bạn có muốn xếp trận ĐƠN không?`,
        };
        continue;
      }

      // autoSinglesMode === 'AUTO'
      topProposal.lineup.team1.forEach((id) => reservedPlayerIds.add(id));
      topProposal.lineup.team2.forEach((id) => reservedPlayerIds.add(id));
      result[court.id] = {
        status: 'OK',
        proposals: singlesProposals,
        selectedIndex: 0,
      };
      continue;
    }

    // Khi có >= 4 người, quyết định theo policy và mixDebt
    const targetType = decideTargetMatchType(court, available.length, state);

    if (targetType === 'SINGLES') {
      const singlesProposals = generateSinglesProposals(
        available,
        state,
        state.settings.weights,
        seed
      );
      if (singlesProposals.length > 0) {
        singlesProposals[0].lineup.team1.forEach((id) => reservedPlayerIds.add(id));
        singlesProposals[0].lineup.team2.forEach((id) => reservedPlayerIds.add(id));
        result[court.id] = {
          status: 'OK',
          proposals: singlesProposals,
          selectedIndex: 0,
        };
        continue;
      }
    }

    // Mặc định hoặc fallback sang DOUBLES
    const doublesProposals = generateDoublesProposals(
      court.id,
      available,
      state,
      state.settings.weights,
      seed
    );

    if (doublesProposals.length === 0) {
      // Fallback thử sang Singles nếu doubles bị kẹt ràng buộc
      const fallbackSingles = generateSinglesProposals(
        available,
        state,
        state.settings.weights,
        seed
      );
      if (fallbackSingles.length > 0) {
        fallbackSingles[0].lineup.team1.forEach((id) => reservedPlayerIds.add(id));
        fallbackSingles[0].lineup.team2.forEach((id) => reservedPlayerIds.add(id));
        result[court.id] = {
          status: 'OK',
          proposals: fallbackSingles,
          selectedIndex: 0,
        };
      } else {
        result[court.id] = {
          status: 'WAIT',
          reason: 'Không tìm thấy tổ hợp hợp lệ thỏa mãn các ràng buộc',
        };
      }
      continue;
    }

    // Đưa những người được chọn ở proposal tốt nhất vào reserved
    doublesProposals[0].lineup.team1.forEach((id) => reservedPlayerIds.add(id));
    doublesProposals[0].lineup.team2.forEach((id) => reservedPlayerIds.add(id));

    result[court.id] = {
      status: 'OK',
      proposals: doublesProposals,
      selectedIndex: 0,
    };
  }

  return result;
}

/**
 * Hàm tương thích ngược (Backward-compatible helper) cho các bài test hoặc caller đơn lẻ
 */
export function generateSuggestedMatch(
  courtId: number | string,
  players: Player[],
  courts: Court[],
  history: MatchHistory[],
  pairRules: PairRule[],
  settings: SessionSettings
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
    undoStack: [],
    redoStack: [],
  };

  const plan = planAllCourts(state, Date.now(), 42);
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

