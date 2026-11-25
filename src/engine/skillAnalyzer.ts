import type {
  BadmintonRank,
  MatchHistory,
  Player,
} from '../types/badminton';
import type { PrivateMatchReview } from './matchFeedbackStorage';
import { RANK_METADATA, stepRankDown, stepRankUp } from './skillConfig';

export interface PlayerPerformanceSummary {
  playerId: string;
  playerName: string;
  currentRank: BadmintonRank;
  scoredMatches: number;
  wins: number;
  losses: number;
  avgPointDiff: number;
  overRankTags: number;
  underRankTags: number;
  greatPlayTags: number;
  lopsidedWins: number;
  lopsidedLosses: number;
  notes: string[];
  sessionFormOffset: number;
}

export function computeSessionFormOffset(input: {
  scoredMatches: number;
  avgPointDiff: number;
  overRankTags: number;
  underRankTags: number;
}): number {
  const scoreWeight =
    input.scoredMatches > 0
      ? Math.max(
          -1.0,
          Math.min(
            1.0,
            (input.avgPointDiff / 8) * Math.min(1, input.scoredMatches / 2)
          )
        )
      : 0;
  const tagWeight = (input.overRankTags - input.underRankTags) * 0.45;
  const raw = scoreWeight + tagWeight;
  return Number(Math.max(-1.5, Math.min(1.5, raw)).toFixed(2));
}

export function buildSessionFormOffsetMap(
  players: Player[],
  history: MatchHistory[],
  privateReviews: Record<string, PrivateMatchReview> = {}
): Record<string, number> {
  if (history.length === 0) return {};
  const { summaries } = analyzePlayerRanksLocal(players, history, privateReviews);
  const map: Record<string, number> = {};
  for (const s of summaries) {
    if (s.sessionFormOffset !== 0) {
      map[s.playerId] = s.sessionFormOffset;
    }
  }
  return map;
}

export interface RankSuggestion {
  playerId: string;
  playerName: string;
  currentRank: BadmintonRank;
  suggestedRank: BadmintonRank;
  direction: 'UP' | 'DOWN';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  source: 'LOCAL' | 'GEMINI';
}

export function analyzePlayerRanksLocal(
  players: Player[],
  history: MatchHistory[],
  privateReviews: Record<string, PrivateMatchReview>
): { summaries: PlayerPerformanceSummary[]; suggestions: RankSuggestion[] } {
  const summaries: PlayerPerformanceSummary[] = [];
  const suggestions: RankSuggestion[] = [];

  for (const player of players) {
    let scoredMatches = 0;
    let wins = 0;
    let losses = 0;
    let pointDiffSum = 0;
    let overRankTags = 0;
    let underRankTags = 0;
    let greatPlayTags = 0;
    let lopsidedWins = 0;
    let lopsidedLosses = 0;
    const notes: string[] = [];

    for (const match of history) {
      const inT1 = match.team1.includes(player.id);
      const inT2 = match.team2.includes(player.id);
      if (!inT1 && !inT2) continue;

      if (match.score) {
        const diff = inT1
          ? match.score.team1 - match.score.team2
          : match.score.team2 - match.score.team1;
        scoredMatches++;
        pointDiffSum += diff;
        if (diff > 0) wins++;
        else if (diff < 0) losses++;

        if (match.balanceRating === 'LOPSIDED' || Math.abs(diff) >= 10) {
          if (diff > 0) lopsidedWins++;
          else if (diff < 0) lopsidedLosses++;
        }
      }

      const review = privateReviews[match.id];
      const fb = review?.playerFeedback?.[player.id];
      if (fb?.tags) {
        if (fb.tags.includes('OVER_RANK')) overRankTags++;
        if (fb.tags.includes('UNDER_RANK')) underRankTags++;
        if (fb.tags.includes('GREAT_PLAY')) greatPlayTags++;
      }
      if (fb?.note && fb.note.trim()) {
        notes.push(fb.note.trim());
      }
    }

    const avgPointDiff =
      scoredMatches > 0 ? Number((pointDiffSum / scoredMatches).toFixed(1)) : 0;
    const sessionFormOffset = computeSessionFormOffset({
      scoredMatches,
      avgPointDiff,
      overRankTags,
      underRankTags,
    });

    const summary: PlayerPerformanceSummary = {
      playerId: player.id,
      playerName: player.name,
      currentRank: player.rank,
      scoredMatches,
      wins,
      losses,
      avgPointDiff,
      overRankTags,
      underRankTags,
      greatPlayTags,
      lopsidedWins,
      lopsidedLosses,
      notes,
      sessionFormOffset,
    };
    summaries.push(summary);

    const upRank = stepRankUp(player.rank);
    const downRank = stepRankDown(player.rank);

    let wantsUp: 'HIGH' | 'MEDIUM' | null = null;
    if (upRank !== player.rank) {
      if (overRankTags >= 2) {
        wantsUp = 'HIGH';
      } else if (overRankTags >= 1 && scoredMatches >= 2 && avgPointDiff >= 5) {
        wantsUp = 'MEDIUM';
      } else if (
        scoredMatches >= 3 &&
        wins / scoredMatches >= 0.75 &&
        avgPointDiff >= 6
      ) {
        wantsUp = 'MEDIUM';
      }
    }

    let wantsDown: 'HIGH' | 'MEDIUM' | null = null;
    if (downRank !== player.rank) {
      if (underRankTags >= 2) {
        wantsDown = 'HIGH';
      } else if (underRankTags >= 1 && scoredMatches >= 2 && avgPointDiff <= -5) {
        wantsDown = 'MEDIUM';
      } else if (
        scoredMatches >= 3 &&
        wins / scoredMatches <= 0.25 &&
        avgPointDiff <= -6
      ) {
        wantsDown = 'MEDIUM';
      }
    }

    // Mâu thuẫn cả tăng và giảm -> không đề xuất để tránh nhiễu
    if (wantsUp && wantsDown) continue;

    if (wantsUp) {
      const parts: string[] = [];
      if (overRankTags > 0) parts.push(`Được gắn "Vượt trình" ${overRankTags} lần`);
      if (scoredMatches > 0) {
        parts.push(
          `thắng ${wins}/${scoredMatches} trận (+${avgPointDiff.toFixed(1)}đ/trận)`
        );
      }
      suggestions.push({
        playerId: player.id,
        playerName: player.name,
        currentRank: player.rank,
        suggestedRank: upRank,
        direction: 'UP',
        confidence: wantsUp,
        reason: `${parts.join(', ')} → nên cân nhắc nâng lên ${RANK_METADATA[upRank].code}.`,
        source: 'LOCAL',
      });
    } else if (wantsDown) {
      const parts: string[] = [];
      if (underRankTags > 0) parts.push(`Được gắn "Hơi đuối" ${underRankTags} lần`);
      if (scoredMatches > 0) {
        parts.push(
          `thắng ${wins}/${scoredMatches} trận (${avgPointDiff.toFixed(1)}đ/trận)`
        );
      }
      suggestions.push({
        playerId: player.id,
        playerName: player.name,
        currentRank: player.rank,
        suggestedRank: downRank,
        direction: 'DOWN',
        confidence: wantsDown,
        reason: `${parts.join(', ')} → nên cân nhắc hạ xuống ${RANK_METADATA[downRank].code}.`,
        source: 'LOCAL',
      });
    }
  }

  return { summaries, suggestions };
}
