import { describe, expect, it } from 'vitest';
import type { MatchHistory, Player } from '../../types/badminton';
import type { PrivateMatchReview } from '../matchFeedbackStorage';
import { analyzePlayerRanksLocal } from '../skillAnalyzer';
import { parseGeminiRankResponse } from '../../services/geminiRankAdvisor';

function makePlayer(
  id: string,
  name: string,
  rank: Player['rank'] = 'tb'
): Player {
  return {
    id,
    name,
    sex: 'M',
    rank,
    status: 'ACTIVE',
    assignedPool: 'ALL',
    gamesPlayed: 3,
    virtualGamesOffset: 0,
    waitStreak: 0,
    lastPlayedAt: 0,
    singlesCount: 0,
    noSingles: false,
    joinedAt: 1000,
  };
}

function makeScoredMatch(
  id: string,
  team1: string[],
  team2: string[],
  s1: number,
  s2: number
): MatchHistory {
  return {
    id,
    courtId: 'court-1',
    type: 'DOUBLES',
    team1,
    team2,
    slotSource: {},
    startedAt: 1000,
    endedAt: 2000,
    durationMinutes: 15,
    score: { team1: s1, team2: s2 },
  };
}

describe('Skill Analyzer & Gemini Rank Advisor (Nhóm 1B)', () => {
  it('1. Phân tích cục bộ gợi ý nâng 1 bậc khi người chơi có >= 2 thẻ OVER_RANK', () => {
    const players = [
      makePlayer('p1', 'Hùng', 'tb'),
      makePlayer('p2', 'An', 'tb'),
      makePlayer('p3', 'Bình', 'tb'),
      makePlayer('p4', 'Cường', 'tb'),
    ];
    const history = [
      makeScoredMatch('m1', ['p1', 'p2'], ['p3', 'p4'], 21, 14),
      makeScoredMatch('m2', ['p1', 'p3'], ['p2', 'p4'], 21, 12),
    ];
    const reviews: Record<string, PrivateMatchReview> = {
      m1: { matchId: 'm1', updatedAt: 1, playerFeedback: { p1: { tags: ['OVER_RANK'] } } },
      m2: { matchId: 'm2', updatedAt: 2, playerFeedback: { p1: { tags: ['OVER_RANK'] } } },
    };

    const res = analyzePlayerRanksLocal(players, history, reviews);
    const hungSug = res.suggestions.find((s) => s.playerId === 'p1');
    expect(hungSug).toBeDefined();
    expect(hungSug!.direction).toBe('UP');
    expect(hungSug!.suggestedRank).toBe('tb+');
    expect(hungSug!.confidence).toBe('HIGH');
  });

  it('2. Phân tích cục bộ gợi ý hạ 1 bậc khi thua >= 3 trận liên tiếp và chênh điểm <= -6', () => {
    const players = [
      makePlayer('p1', 'Minh', 'tb'),
      makePlayer('p2', 'An', 'tb'),
      makePlayer('p3', 'Bình', 'tb'),
      makePlayer('p4', 'Cường', 'tb'),
    ];
    const history = [
      makeScoredMatch('m1', ['p1', 'p2'], ['p3', 'p4'], 12, 21),
      makeScoredMatch('m2', ['p1', 'p3'], ['p2', 'p4'], 10, 21),
      makeScoredMatch('m3', ['p1', 'p4'], ['p2', 'p3'], 14, 21),
    ];

    const res = analyzePlayerRanksLocal(players, history, {});
    const minhSug = res.suggestions.find((s) => s.playerId === 'p1');
    expect(minhSug).toBeDefined();
    expect(minhSug!.direction).toBe('DOWN');
    expect(minhSug!.suggestedRank).toBe('tb-');
  });

  it('3. Không gợi ý khi dữ liệu ít (chỉ 1 trận) hoặc đã chạm trần tbk / đáy newbie', () => {
    const players = [
      makePlayer('pTop', 'Top', 'tbk'),
      makePlayer('pLow', 'New', 'newbie'),
      makePlayer('p3', 'C', 'tb'),
      makePlayer('p4', 'D', 'tb'),
    ];
    const history = [
      makeScoredMatch('m1', ['pTop', 'p3'], ['pLow', 'p4'], 21, 5),
      makeScoredMatch('m2', ['pTop', 'p4'], ['pLow', 'p3'], 21, 6),
    ];
    const reviews: Record<string, PrivateMatchReview> = {
      m1: {
        matchId: 'm1',
        updatedAt: 1,
        playerFeedback: {
          pTop: { tags: ['OVER_RANK'] },
          pLow: { tags: ['UNDER_RANK'] },
        },
      },
      m2: {
        matchId: 'm2',
        updatedAt: 2,
        playerFeedback: {
          pTop: { tags: ['OVER_RANK'] },
          pLow: { tags: ['UNDER_RANK'] },
        },
      },
    };

    const res = analyzePlayerRanksLocal(players, history, reviews);
    expect(res.suggestions).toEqual([]);
  });

  it('4. Bỏ qua gợi ý nếu thẻ đánh giá bị mâu thuẫn cả Vượt trình và Hơi đuối >= 2 lần', () => {
    const players = [makePlayer('p1', 'An', 'tb')];
    const history = [
      makeScoredMatch('m1', ['p1'], ['p2'], 21, 15),
      makeScoredMatch('m2', ['p1'], ['p2'], 10, 21),
      makeScoredMatch('m3', ['p1'], ['p2'], 21, 12),
      makeScoredMatch('m4', ['p1'], ['p2'], 8, 21),
    ];
    const reviews: Record<string, PrivateMatchReview> = {
      m1: { matchId: 'm1', updatedAt: 1, playerFeedback: { p1: { tags: ['OVER_RANK'] } } },
      m2: { matchId: 'm2', updatedAt: 2, playerFeedback: { p1: { tags: ['UNDER_RANK'] } } },
      m3: { matchId: 'm3', updatedAt: 3, playerFeedback: { p1: { tags: ['OVER_RANK'] } } },
      m4: { matchId: 'm4', updatedAt: 4, playerFeedback: { p1: { tags: ['UNDER_RANK'] } } },
    };

    const res = analyzePlayerRanksLocal(players, history, reviews);
    expect(res.suggestions).toEqual([]);
  });

  it('5. parseGeminiRankResponse bóc chuẩn JSON trong markdown fence ```json', () => {
    const players = [makePlayer('p1', 'An', 'tb'), makePlayer('p2', 'Bình', 'tby')];
    const raw = `\`\`\`json
    {
      "summary": "Buổi đánh khá cân bằng",
      "suggestions": [
        { "playerId": "p1", "suggestedRank": "tb+", "confidence": "HIGH", "reason": "Áp đảo liên tục" }
      ],
      "pairInsights": ["An + Bình rất cân kèo"]
    }
    \`\`\``;

    const parsed = parseGeminiRankResponse(raw, players);
    expect(parsed.summary).toBe('Buổi đánh khá cân bằng');
    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.suggestions[0].suggestedRank).toBe('tb+');
    expect(parsed.suggestions[0].direction).toBe('UP');
    expect(parsed.suggestions[0].source).toBe('GEMINI');
    expect(parsed.pairInsights).toEqual(['An + Bình rất cân kèo']);
  });

  it('6. parseGeminiRankResponse lọc bỏ playerId ảo và rank không hợp lệ', () => {
    const players = [makePlayer('p1', 'An', 'tb')];
    const raw = JSON.stringify({
      summary: 'Test',
      suggestions: [
        { playerId: 'p_fake', suggestedRank: 'tb+', confidence: 'HIGH', reason: 'Ảo' },
        { playerId: 'p1', suggestedRank: 'sieu_cao_thu', confidence: 'HIGH', reason: 'Rank lạ' },
      ],
      pairInsights: [],
    });

    const parsed = parseGeminiRankResponse(raw, players);
    expect(parsed.suggestions).toEqual([]);
  });

  it('7. parseGeminiRankResponse chặn AI nhảy cóc quá 2 bậc để tránh ảo giác', () => {
    const players = [makePlayer('p1', 'An', 'y')]; // index 2 ('y')
    const raw = JSON.stringify({
      summary: 'Nhảy quá mạnh',
      suggestions: [
        { playerId: 'p1', suggestedRank: 'tbk', confidence: 'HIGH', reason: 'Đánh quá hay' },
      ],
      pairInsights: [],
    });

    const parsed = parseGeminiRankResponse(raw, players);
    expect(parsed.suggestions).toHaveLength(1);
    // 'y' (2) + 2 = 'tby-' (4)
    expect(parsed.suggestions[0].suggestedRank).toBe('tby-');
  });
});
