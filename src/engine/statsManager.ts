import type {
  MatchHistory,
  MatchmakingStats,
} from '../types/badminton';

/**
 * Tạo một thống kê matchmaking rỗng
 */
export function createEmptyStats(): MatchmakingStats {
  return {
    partnerCount: {},
    opponentCount: {},
    lastMatchOfPlayer: {},
    lastMatchOfCourt: {},
  };
}

/**
 * Lấy số lần 2 người đã làm đồng đội
 */
export function getPartnerCount(
  stats: MatchmakingStats,
  playerAId: string,
  playerBId: string
): number {
  return stats.partnerCount[playerAId]?.[playerBId] ?? 0;
}

/**
 * Lấy số lần 2 người đã đối đầu nhau
 */
export function getOpponentCount(
  stats: MatchmakingStats,
  playerAId: string,
  playerBId: string
): number {
  return stats.opponentCount[playerAId]?.[playerBId] ?? 0;
}

/**
 * Kiểm tra xem 2 người có vừa đứng cùng nhau ở trận gần nhất của 1 trong 2 người hay không (chỉ áp dụng cho đôi)
 */
export function isRecentPartner(
  stats: MatchmakingStats,
  playerAId: string,
  playerBId: string
): boolean {
  const pALast = stats.lastMatchOfPlayer[playerAId];
  if (pALast && pALast.partnerId === playerBId) {
    return true;
  }
  const pBLast = stats.lastMatchOfPlayer[playerBId];
  if (pBLast && pBLast.partnerId === playerAId) {
    return true;
  }
  return false;
}

/**
 * Kiểm tra xem 2 người có vừa đối đầu nhau ở trận gần nhất của 1 trong 2 người hay không
 */
export function isRecentOpponent(
  stats: MatchmakingStats,
  playerAId: string,
  playerBId: string
): boolean {
  const pALast = stats.lastMatchOfPlayer[playerAId];
  if (pALast && pALast.opponents.includes(playerBId)) {
    return true;
  }
  const pBLast = stats.lastMatchOfPlayer[playerBId];
  if (pBLast && pBLast.opponents.includes(playerAId)) {
    return true;
  }
  return false;
}

function incrementMatrix(
  matrix: Record<string, Record<string, number>>,
  p1: string,
  p2: string
) {
  if (!matrix[p1]) {
    matrix[p1] = {};
  }
  if (!matrix[p2]) {
    matrix[p2] = {};
  }
  matrix[p1][p2] = (matrix[p1][p2] ?? 0) + 1;
  matrix[p2][p1] = (matrix[p2][p1] ?? 0) + 1;
}

/**
 * Ghi nhận một trận đấu đã hoàn thành vào hệ thống thống kê (hàm thuần)
 */
export function recordCompletedMatch(
  stats: MatchmakingStats,
  match: MatchHistory
): MatchmakingStats {
  const isDoubles = match.type === 'DOUBLES';
  const participants = [...match.team1, ...match.team2];

  // Deep copy / immutable clone
  const partnerCount: Record<string, Record<string, number>> = {};
  for (const k of Object.keys(stats.partnerCount)) {
    partnerCount[k] = { ...stats.partnerCount[k] };
  }
  const opponentCount: Record<string, Record<string, number>> = {};
  for (const k of Object.keys(stats.opponentCount)) {
    opponentCount[k] = { ...stats.opponentCount[k] };
  }
  const lastMatchOfPlayer = { ...stats.lastMatchOfPlayer };
  const lastMatchOfCourt = { ...stats.lastMatchOfCourt };

  // 1. Cập nhật Partner Count (chỉ khi là DOUBLES)
  if (isDoubles) {
    const [t1p1, t1p2] = match.team1;
    const [t2p1, t2p2] = match.team2;
    incrementMatrix(partnerCount, t1p1, t1p2);
    incrementMatrix(partnerCount, t2p1, t2p2);
  }

  // 2. Cập nhật Opponent Count
  for (const p1 of match.team1) {
    for (const p2 of match.team2) {
      incrementMatrix(opponentCount, p1, p2);
    }
  }

  // 3. Cập nhật trận gần nhất cho từng người chơi
  for (const p of match.team1) {
    const partnerId = isDoubles ? match.team1.find((id) => id !== p) : undefined;
    lastMatchOfPlayer[p] = {
      matchId: match.id,
      courtId: match.courtId,
      type: match.type,
      participants,
      partnerId,
      opponents: [...match.team2],
      team1: match.team1,
      team2: match.team2,
      endedAt: match.endedAt,
    };
  }

  for (const p of match.team2) {
    const partnerId = isDoubles ? match.team2.find((id) => id !== p) : undefined;
    lastMatchOfPlayer[p] = {
      matchId: match.id,
      courtId: match.courtId,
      type: match.type,
      participants,
      partnerId,
      opponents: [...match.team1],
      team1: match.team1,
      team2: match.team2,
      endedAt: match.endedAt,
    };
  }

  // 4. Cập nhật trận gần nhất của sân
  lastMatchOfCourt[match.courtId] = match;

  return {
    partnerCount,
    opponentCount,
    lastMatchOfPlayer,
    lastMatchOfCourt,
  };
}

/**
 * Tái tạo toàn bộ thống kê từ danh sách lịch sử trận đấu (dùng khi reload hoặc khởi động)
 */
export function buildStatsFromHistory(history: MatchHistory[]): MatchmakingStats {
  let stats = createEmptyStats();
  const sorted = [...history].sort((a, b) => a.endedAt - b.endedAt);
  for (const match of sorted) {
    stats = recordCompletedMatch(stats, match);
  }
  return stats;
}
