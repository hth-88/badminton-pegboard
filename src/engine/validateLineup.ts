import type {
  BadmintonSessionState,
  Lineup,
  LineupDescription,
  ValidationIssue,
} from '../types/badminton';
import { getEffectiveSkill } from './skillConfig';
import { isRecentPartner } from './statsManager';

/**
 * Mô tả đánh giá cân bằng trình độ của một đội hình (dùng chung cho UI & Engine)
 * (Mục 0.8: trận ĐƠN dùng ngưỡng bằng một nửa: ≤0.5 'Cân kèo', ≤1.5 'Lệch nhẹ', còn lại 'Lệch nhiều')
 */
export function describeLineup(
  lineup: Lineup,
  state: BadmintonSessionState
): LineupDescription {
  const maleBonus = state.settings?.maleBonus ?? 1.5;
  const playerMap = new Map(state.players.map((p) => [p.id, p]));

  const calcTeamSkill = (team: string[]): number => {
    return team.reduce((sum, pid) => {
      const p = playerMap.get(pid);
      if (!p) return sum;
      return sum + getEffectiveSkill(p.rank, p.sex, maleBonus);
    }, 0);
  };

  const team1Skill = Number(calcTeamSkill(lineup.team1).toFixed(2));
  const team2Skill = Number(calcTeamSkill(lineup.team2).toFixed(2));
  const diff = Number(Math.abs(team1Skill - team2Skill).toFixed(2));

  let label: 'Cân kèo' | 'Lệch nhẹ' | 'Lệch nhiều' = 'Cân kèo';
  if (lineup.type === 'SINGLES') {
    if (diff > 1.5) {
      label = 'Lệch nhiều';
    } else if (diff > 0.5) {
      label = 'Lệch nhẹ';
    }
  } else {
    if (diff > 3.0) {
      label = 'Lệch nhiều';
    } else if (diff > 1.0) {
      label = 'Lệch nhẹ';
    }
  }

  return { team1Skill, team2Skill, diff, label };
}

/**
 * Kiểm tra tính hợp lệ và cảnh báo cho một Lineup
 * Trả về danh sách issue: BLOCK (chặn) hoặc WARN (cảnh báo)
 * (Mục 0.5: BLOCK UNKNOWN_PLAYER)
 * (Mục 0.6: options.target === 'NEXT_UP' -> WARN PLAYING_NOW_SAME_COURT)
 * (Mục 0.7: REPEAT_QUARTET theo lastMatchOfPlayer và WARN REPEAT_PARTNER)
 */
export function validateLineup(
  lineup: Lineup,
  state: BadmintonSessionState,
  currentCourtId?: string,
  options?: { target?: 'CURRENT' | 'NEXT_UP' }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const playerMap = new Map(state.players.map((p) => [p.id, p]));

  const allLineupPlayers = [...lineup.team1, ...lineup.team2];

  // ==========================================
  // 0. BLOCK: UNKNOWN_PLAYER (Mục 0.5)
  // ==========================================
  const unknownIds = allLineupPlayers.filter((pid) => !playerMap.has(pid));
  if (unknownIds.length > 0) {
    issues.push({
      severity: 'BLOCK',
      code: 'UNKNOWN_PLAYER',
      message: 'Người chơi không tồn tại trong danh sách buổi cầu',
      playerIds: unknownIds,
    });
  }

  // ==========================================
  // 1. BLOCK: Số người sai với type
  // ==========================================
  if (lineup.type === 'SINGLES') {
    if (lineup.team1.length !== 1 || lineup.team2.length !== 1) {
      issues.push({
        severity: 'BLOCK',
        code: 'INVALID_SIZE',
        message: 'Trận đơn phải có đúng 1 người mỗi đội (1 vs 1)',
      });
    }
  } else if (lineup.type === 'DOUBLES') {
    if (lineup.team1.length !== 2 || lineup.team2.length !== 2) {
      issues.push({
        severity: 'BLOCK',
        code: 'INVALID_SIZE',
        message: 'Trận đôi phải có đúng 2 người mỗi đội (2 vs 2)',
      });
    }
  }

  // ==========================================
  // 2. BLOCK: Trùng người trong lineup
  // ==========================================
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const id of allLineupPlayers) {
    if (seenIds.has(id)) {
      duplicateIds.add(id);
    }
    seenIds.add(id);
  }
  if (duplicateIds.size > 0) {
    issues.push({
      severity: 'BLOCK',
      code: 'DUPLICATE_PLAYER',
      message: 'Có người chơi bị xếp trùng lặp trong trận đấu',
      playerIds: Array.from(duplicateIds),
    });
  }

  // ==========================================
  // 3. BLOCK: Người đang đánh ở sân khác
  // ==========================================
  for (const court of state.courts) {
    if (court.isActive && court.currentMatch && court.id !== currentCourtId) {
      const busyPlayers = [
        ...court.currentMatch.team1,
        ...court.currentMatch.team2,
      ];
      const overlap = allLineupPlayers.filter((pid) => busyPlayers.includes(pid));
      if (overlap.length > 0) {
        issues.push({
          severity: 'BLOCK',
          code: 'PLAYING_ELSEWHERE',
          message: `Người chơi đang đánh ở ${court.name || court.id}`,
          playerIds: overlap,
        });
      }
    }
  }

  // ==========================================
  // 3b. WARN: PLAYING_NOW_SAME_COURT (Mục 0.6)
  // ==========================================
  if (options?.target === 'NEXT_UP' && currentCourtId) {
    const thisCourt = state.courts.find((c) => c.id === currentCourtId);
    if (thisCourt?.currentMatch) {
      const busyOnThisCourt = [
        ...thisCourt.currentMatch.team1,
        ...thisCourt.currentMatch.team2,
      ];
      const overlapSame = allLineupPlayers.filter((pid) => busyOnThisCourt.includes(pid));
      if (overlapSame.length > 0) {
        issues.push({
          severity: 'WARN',
          code: 'PLAYING_NOW_SAME_COURT',
          message: `Người chơi đang đánh ngay trên ${thisCourt.name || thisCourt.id}`,
          playerIds: overlapSame,
        });
      }
    }
  }

  // ==========================================
  // 4. WARN: PAUSED
  // ==========================================
  const pausedPlayers = allLineupPlayers.filter((pid) => {
    const p = playerMap.get(pid);
    return p && p.status === 'PAUSED';
  });
  if (pausedPlayers.length > 0) {
    issues.push({
      severity: 'WARN',
      code: 'PLAYER_PAUSED',
      message: 'Người chơi đang trong trạng thái tạm nghỉ (PAUSED)',
      playerIds: pausedPlayers,
    });
  }

  // ==========================================
  // 5. WARN: AVOID_PARTNER (cùng đội)
  // ==========================================
  for (const rule of state.pairRules) {
    if (rule.type === 'AVOID_PARTNER') {
      const sameT1 =
        lineup.team1.includes(rule.playerAId) &&
        lineup.team1.includes(rule.playerBId);
      const sameT2 =
        lineup.team2.includes(rule.playerAId) &&
        lineup.team2.includes(rule.playerBId);
      if (sameT1 || sameT2) {
        const pA = playerMap.get(rule.playerAId);
        const pB = playerMap.get(rule.playerBId);
        issues.push({
          severity: 'WARN',
          code: 'AVOID_PARTNER_VIOLATION',
          message: `Vi phạm cấm cùng đội: ${pA?.name || rule.playerAId} và ${pB?.name || rule.playerBId}`,
          playerIds: [rule.playerAId, rule.playerBId],
        });
      }
    }
  }

  // ==========================================
  // 6. WARN: LOCK_PARTNER bị tách (chỉ cảnh báo khi đánh DOUBLES)
  // ==========================================
  if (lineup.type === 'DOUBLES') {
    for (const rule of state.pairRules) {
      if (rule.type === 'LOCK_PARTNER') {
        const inT1A = lineup.team1.includes(rule.playerAId);
        const inT1B = lineup.team1.includes(rule.playerBId);
        const inT2A = lineup.team2.includes(rule.playerAId);
        const inT2B = lineup.team2.includes(rule.playerBId);

        const inLineupA = inT1A || inT2A;
        const inLineupB = inT1B || inT2B;

        const pA = playerMap.get(rule.playerAId);
        const pB = playerMap.get(rule.playerBId);

        // Cả 2 cùng trong trận nhưng khác đội
        if ((inT1A && inT2B) || (inT2A && inT1B)) {
          issues.push({
            severity: 'WARN',
            code: 'LOCK_PARTNER_SPLIT',
            message: `Cặp đôi cố định bị chia sang hai đội đối đầu: ${pA?.name || rule.playerAId} và ${pB?.name || rule.playerBId}`,
            playerIds: [rule.playerAId, rule.playerBId],
          });
        } else if ((inLineupA && !inLineupB && pB?.status === 'ACTIVE') || (inLineupB && !inLineupA && pA?.status === 'ACTIVE')) {
          // Một người vào trận còn người kia đang rảnh bị bỏ lại
          issues.push({
            severity: 'WARN',
            code: 'LOCK_PARTNER_SPLIT',
            message: `Cặp đôi cố định bị thiếu người: ${pA?.name || rule.playerAId} và ${pB?.name || rule.playerBId}`,
            playerIds: [rule.playerAId, rule.playerBId],
          });
        }
      }
    }
  }

  // ==========================================
  // 7. WARN: AVOID_MATCH cùng sân
  // ==========================================
  for (const rule of state.pairRules) {
    if (rule.type === 'AVOID_MATCH') {
      const hasA = allLineupPlayers.includes(rule.playerAId);
      const hasB = allLineupPlayers.includes(rule.playerBId);
      if (hasA && hasB) {
        const pA = playerMap.get(rule.playerAId);
        const pB = playerMap.get(rule.playerBId);
        issues.push({
          severity: 'WARN',
          code: 'AVOID_MATCH_VIOLATION',
          message: `Hạn chế vào chung sân: ${pA?.name || rule.playerAId} và ${pB?.name || rule.playerBId}`,
          playerIds: [rule.playerAId, rule.playerBId],
        });
      }
    }
  }

  // ==========================================
  // 8. WARN: Lệch điểm hai đội
  // ==========================================
  const desc = describeLineup(lineup, state);
  if (desc.label === 'Lệch nhiều') {
    issues.push({
      severity: 'WARN',
      code: 'SKILL_IMBALANCE',
      message: `Lệch điểm hai đội: chênh ${desc.diff.toFixed(1)} điểm trình độ (${desc.team1Skill} vs ${desc.team2Skill})`,
    });
  }

  // ==========================================
  // 9. WARN: REPEAT_QUARTET & REPEAT_PARTNER (Mục 0.7)
  // ==========================================
  const targetCourt = currentCourtId ? state.courts.find((c) => c.id === currentCourtId) : undefined;
  const lastCourtMatch = targetCourt ? state.stats?.lastMatchOfCourt?.[targetCourt.id] : undefined;

  if (lineup.type === 'DOUBLES') {
    let isRepeatQuartet = false;
    const lineupSet = new Set(allLineupPlayers);
    if (lineupSet.size === 4) {
      // Kiểm tra qua lastMatchOfPlayer (mọi sân)
      for (const pid of allLineupPlayers) {
        const lastM = state.stats?.lastMatchOfPlayer?.[pid];
        if (lastM && lastM.type === 'DOUBLES' && lastM.participants.length === 4) {
          const prevSet = new Set(lastM.participants);
          if (prevSet.size === 4 && allLineupPlayers.every((id) => prevSet.has(id))) {
            isRepeatQuartet = true;
            break;
          }
        }
      }
      if (!isRepeatQuartet && lastCourtMatch && lastCourtMatch.type === 'DOUBLES') {
        const prevPlayers = [...lastCourtMatch.team1, ...lastCourtMatch.team2];
        const prevQuartetSet = new Set(prevPlayers);
        if (prevQuartetSet.size === 4 && allLineupPlayers.every((id) => prevQuartetSet.has(id))) {
          isRepeatQuartet = true;
        }
      }
    }

    if (isRepeatQuartet) {
      issues.push({
        severity: 'WARN',
        code: 'REPEAT_QUARTET',
        message: 'Lặp lại đúng nhóm 4 người của trận trước',
      });
    }

    // WARN REPEAT_PARTNER khi cặp đồng đội trùng isRecentPartner
    if (lineup.team1.length === 2 && isRecentPartner(state.stats, lineup.team1[0], lineup.team1[1])) {
      issues.push({
        severity: 'WARN',
        code: 'REPEAT_PARTNER',
        message: 'Có cặp đôi vừa đứng cùng nhau ở trận gần nhất',
        playerIds: [lineup.team1[0], lineup.team1[1]],
      });
    }
    if (lineup.team2.length === 2 && isRecentPartner(state.stats, lineup.team2[0], lineup.team2[1])) {
      issues.push({
        severity: 'WARN',
        code: 'REPEAT_PARTNER',
        message: 'Có cặp đôi vừa đứng cùng nhau ở trận gần nhất',
        playerIds: [lineup.team2[0], lineup.team2[1]],
      });
    }
  } else if (lineup.type === 'SINGLES' && lastCourtMatch && lastCourtMatch.type === 'SINGLES') {
    const prevSinglesSet = new Set([...lastCourtMatch.team1, ...lastCourtMatch.team2]);
    if (
      prevSinglesSet.size === 2 &&
      allLineupPlayers.length === 2 &&
      allLineupPlayers.every((id) => prevSinglesSet.has(id))
    ) {
      issues.push({
        severity: 'WARN',
        code: 'REPEAT_OPPONENT',
        message: 'Lặp lại đúng 2 đối thủ của trận đơn vừa đánh',
      });
    }
  }

  // ==========================================
  // 10. WARN: Người đang nằm trong Next Up sân khác
  // ==========================================
  for (const court of state.courts) {
    if (court.isActive && court.nextUp && court.id !== currentCourtId) {
      const nextUpPlayers = [
        ...court.nextUp.team1,
        ...court.nextUp.team2,
      ];
      const overlap = allLineupPlayers.filter((pid) => nextUpPlayers.includes(pid));
      if (overlap.length > 0) {
        issues.push({
          severity: 'WARN',
          code: 'NEXT_UP_ELSEWHERE',
          message: `Người chơi đang nằm trong lượt kế tiếp của ${court.name || court.id}`,
          playerIds: overlap,
        });
      }
    }
  }

  // ==========================================
  // 11. WARN: Người noSingles trong trận đơn
  // ==========================================
  if (lineup.type === 'SINGLES') {
    const noSinglesInMatch = allLineupPlayers.filter((pid) => {
      const p = playerMap.get(pid);
      return p && p.noSingles;
    });
    if (noSinglesInMatch.length > 0) {
      issues.push({
        severity: 'WARN',
        code: 'NO_SINGLES_IN_SINGLES',
        message: 'Có người chơi từ chối đánh đơn được xếp vào trận đơn',
        playerIds: noSinglesInMatch,
      });
    }
  }

  return issues;
}
