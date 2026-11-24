import type { BadmintonRank, MatchHistory, Player } from '../types/badminton';
import type { ClubMember } from '../engine/clubRosterStorage';
import type { PrivateMatchReview } from '../engine/matchFeedbackStorage';
import type { RankSuggestion } from '../engine/skillAnalyzer';
import { ORDERED_RANKS, RANK_BASE_SCORES, compareRanks } from '../engine/skillConfig';

export const STORAGE_KEY_GEMINI_API_KEY = 'badminton_gemini_api_key';

export function getGeminiApiKey(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_GEMINI_API_KEY);
      if (saved && saved.trim()) return saved.trim();
    }
  } catch {
    // Bỏ qua
  }
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  return envKey ? String(envKey).trim() : '';
}

export function saveGeminiApiKey(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const trimmed = key.trim();
    if (!trimmed) {
      localStorage.removeItem(STORAGE_KEY_GEMINI_API_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY_GEMINI_API_KEY, trimmed);
  } catch (err) {
    console.error('Không thể lưu Gemini API key:', err);
  }
}

export function clearGeminiApiKey(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_GEMINI_API_KEY);
  } catch {
    // Bỏ qua
  }
}

export function buildGeminiRankPrompt(params: {
  players: Player[];
  history: MatchHistory[];
  privateReviews: Record<string, PrivateMatchReview>;
  clubRoster: ClubMember[];
  maleBonus: number;
}): string {
  const rosterByName = new Map(
    params.clubRoster.map((m) => [m.name.trim().toLowerCase(), m])
  );

  const rankScale = ORDERED_RANKS.map((r) => `${r}(${RANK_BASE_SCORES[r]})`).join(', ');
  const playersData = params.players.map((p) => {
    const member = rosterByName.get(p.name.trim().toLowerCase()) as
      | (ClubMember & { tags?: string[] })
      | undefined;
    return {
      id: p.id,
      name: p.name,
      sex: p.sex,
      currentRank: p.rank,
      clubNotes: member?.notes || undefined,
      clubTags: member?.tags && member.tags.length > 0 ? member.tags : undefined,
    };
  });

  const matchesData = params.history.map((m, idx) => {
    const fb = params.privateReviews[m.id]?.playerFeedback;
    return {
      matchIndex: idx + 1,
      type: m.type,
      team1: m.team1,
      team2: m.team2,
      score: m.score || null,
      balanceRating: m.balanceRating || null,
      hostFeedbackByPlayerId: fb || null,
    };
  });

  return [
    'Bạn là trợ lý chuyên môn xếp kèo cầu lông phong trào Việt Nam.',
    `Thang 12 bậc từ thấp lên cao kèm điểm gốc: ${rankScale}.`,
    `Điểm cộng giới tính Nam (maleBonus): +${params.maleBonus}.`,
    'Hãy phân tích dữ liệu trận đấu, tỉ số, đánh giá độ cân kèo, thẻ nhận xét kín của chủ sân (OVER_RANK/UNDER_RANK/GREAT_PLAY + note) và ghi chú Sổ CLB dưới đây.',
    'Trả về DUY NHẤT JSON hợp lệ theo schema:',
    '{"summary":"tóm tắt ngắn bằng tiếng Việt","suggestions":[{"playerId":"...","suggestedRank":"một trong 12 mã bậc","confidence":"HIGH|MEDIUM|LOW","reason":"lý do súc tích tiếng Việt"}],"pairInsights":["nhận xét ngắn về cặp đấu nên giữ/nên tách"]}',
    'Quy tắc: Chỉ gợi ý thay đổi khi có đủ bằng chứng, mỗi lần đổi tối đa 1-2 bậc, không bịa playerId.',
    `DỮ LIỆU NGƯỜI CHƠI: ${JSON.stringify(playersData)}`,
    `LỊCH SỬ TRẬN: ${JSON.stringify(matchesData)}`,
  ].join('\n');
}

export function parseGeminiRankResponse(
  rawText: string,
  players: Player[]
): {
  summary: string;
  suggestions: RankSuggestion[];
  pairInsights: string[];
} {
  let cleanText = String(rawText || '').trim();
  const fenceMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleanText = fenceMatch[1].trim();
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(cleanText);
  } catch {
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      parsed = JSON.parse(cleanText.slice(firstBrace, lastBrace + 1));
    } else {
      throw new Error('AI trả về định dạng không phải JSON hợp lệ.');
    }
  }

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const rankSet = new Set<string>(ORDERED_RANKS);
  const suggestions: RankSuggestion[] = [];
  const seenPlayerIds = new Set<string>();

  if (Array.isArray(parsed?.suggestions)) {
    for (const item of parsed.suggestions) {
      if (!item || typeof item !== 'object') continue;
      const pid = String(item.playerId || '');
      const player = playerMap.get(pid);
      if (!player || seenPlayerIds.has(pid)) continue;

      const rawRank = String(item.suggestedRank || '') as BadmintonRank;
      if (!rankSet.has(rawRank)) continue;

      const curIdx = ORDERED_RANKS.indexOf(player.rank);
      const targetIdx = ORDERED_RANKS.indexOf(rawRank);
      if (curIdx === -1 || targetIdx === -1 || curIdx === targetIdx) continue;

      // Chặn nhảy quá 2 bậc chống AI ảo giác
      const clampedIdx = Math.max(
        0,
        Math.min(ORDERED_RANKS.length - 1, curIdx + Math.max(-2, Math.min(2, targetIdx - curIdx)))
      );
      const finalRank = ORDERED_RANKS[clampedIdx];
      if (finalRank === player.rank) continue;

      const conf =
        item.confidence === 'HIGH' || item.confidence === 'LOW'
          ? item.confidence
          : 'MEDIUM';
      const reason =
        typeof item.reason === 'string' && item.reason.trim()
          ? item.reason.trim()
          : 'Đề xuất dựa trên tổng hợp tỉ số và nhận xét sân.';

      seenPlayerIds.add(pid);
      suggestions.push({
        playerId: player.id,
        playerName: player.name,
        currentRank: player.rank,
        suggestedRank: finalRank,
        direction: compareRanks(finalRank, player.rank) > 0 ? 'UP' : 'DOWN',
        confidence: conf,
        reason,
        source: 'GEMINI',
      });
    }
  }

  const summary =
    typeof parsed?.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'Đã hoàn tất phân tích trình độ buổi đánh.';

  const pairInsights = Array.isArray(parsed?.pairInsights)
    ? parsed.pairInsights
        .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s: string) => s.trim())
        .slice(0, 6)
    : [];

  return { summary, suggestions, pairInsights };
}

async function callGeminiModel(
  modelName: string,
  apiKey: string,
  prompt: string
): Promise<Response> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });
}

export async function requestGeminiRankAnalysis(params: {
  apiKey: string;
  players: Player[];
  history: MatchHistory[];
  privateReviews: Record<string, PrivateMatchReview>;
  clubRoster: ClubMember[];
  maleBonus: number;
}): Promise<
  | {
      ok: true;
      data: {
        summary: string;
        suggestions: RankSuggestion[];
        pairInsights: string[];
      };
    }
  | { ok: false; error: string }
> {
  const cleanKey = params.apiKey.trim();
  if (!cleanKey) {
    return { ok: false, error: 'Chưa nhập Gemini API Key.' };
  }

  const prompt = buildGeminiRankPrompt(params);
  try {
    let response = await callGeminiModel('gemini-2.5-flash', cleanKey, prompt);
    if (response.status === 404) {
      response = await callGeminiModel('gemini-2.0-flash', cleanKey, prompt);
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: 'API Key Gemini không hợp lệ hoặc chưa được kích hoạt.',
        };
      }
      if (response.status === 429) {
        return {
          ok: false,
          error: 'API Key đã chạm giới hạn lượt miễn phí lúc này, vui lòng thử lại sau ít phút.',
        };
      }
      return {
        ok: false,
        error: `Lỗi kết nối Gemini (HTTP ${response.status}).`,
      };
    }

    const json = await response.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return { ok: false, error: 'Gemini không trả về nội dung phân tích.' };
    }

    const parsed = parseGeminiRankResponse(rawText, params.players);
    return { ok: true, data: parsed };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Không thể kết nối mạng tới Gemini AI.',
    };
  }
}
