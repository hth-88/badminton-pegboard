export const STORAGE_KEY_PRIVATE_MATCH_REVIEWS = 'badminton_private_match_reviews';

export type PlayerFeedbackTag = 'OVER_RANK' | 'UNDER_RANK' | 'GREAT_PLAY';

export interface PlayerMatchFeedback {
  tags: PlayerFeedbackTag[];
  note?: string;
}

export interface PrivateMatchReview {
  matchId: string;
  updatedAt: number;
  playerFeedback: Record<string, PlayerMatchFeedback>;
}

const VALID_TAGS = new Set<PlayerFeedbackTag>(['OVER_RANK', 'UNDER_RANK', 'GREAT_PLAY']);

export function getAllPrivateMatchReviews(): Record<string, PrivateMatchReview> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY_PRIVATE_MATCH_REVIEWS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: Record<string, PrivateMatchReview> = {};
    for (const [matchId, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (!matchId || !val || typeof val !== 'object' || Array.isArray(val)) continue;
      const obj = val as Record<string, unknown>;
      const rawFb = obj.playerFeedback;
      if (!rawFb || typeof rawFb !== 'object' || Array.isArray(rawFb)) continue;

      const cleanFeedback: Record<string, PlayerMatchFeedback> = {};
      for (const [pid, fbVal] of Object.entries(rawFb as Record<string, unknown>)) {
        if (!pid || !fbVal || typeof fbVal !== 'object' || Array.isArray(fbVal)) continue;
        const fb = fbVal as Record<string, unknown>;
        const tags = Array.isArray(fb.tags)
          ? Array.from(
              new Set(
                fb.tags.filter((t): t is PlayerFeedbackTag =>
                  VALID_TAGS.has(t as PlayerFeedbackTag)
                )
              )
            )
          : [];
        const note = typeof fb.note === 'string' ? fb.note.trim().slice(0, 120) : '';
        if (tags.length > 0 || note) {
          cleanFeedback[pid] = note ? { tags, note } : { tags };
        }
      }

      if (Object.keys(cleanFeedback).length > 0) {
        result[matchId] = {
          matchId,
          updatedAt: Number(obj.updatedAt) || 0,
          playerFeedback: cleanFeedback,
        };
      }
    }

    return result;
  } catch {
    return {};
  }
}

export function getPrivateMatchReview(matchId: string): PrivateMatchReview | null {
  if (!matchId) return null;
  const all = getAllPrivateMatchReviews();
  return all[matchId] || null;
}

export function savePrivateMatchReview(
  matchId: string,
  playerFeedback: Record<string, PlayerMatchFeedback>,
  now: number = Date.now()
): void {
  if (!matchId || typeof localStorage === 'undefined') return;

  const cleanFeedback: Record<string, PlayerMatchFeedback> = {};
  for (const [pid, fb] of Object.entries(playerFeedback || {})) {
    if (!pid || !fb) continue;
    const tags = Array.from(
      new Set((fb.tags || []).filter((t) => VALID_TAGS.has(t)))
    );
    const note = fb.note?.trim().slice(0, 120) || '';
    if (tags.length > 0 || note) {
      cleanFeedback[pid] = note ? { tags, note } : { tags };
    }
  }

  const all = getAllPrivateMatchReviews();
  if (Object.keys(cleanFeedback).length === 0) {
    delete all[matchId];
  } else {
    all[matchId] = {
      matchId,
      updatedAt: now,
      playerFeedback: cleanFeedback,
    };
  }

  // Giới hạn tối đa 200 trận gần nhất theo updatedAt
  const entries = Object.entries(all).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const trimmed: Record<string, PrivateMatchReview> = {};
  for (const [k, v] of entries.slice(0, 200)) {
    trimmed[k] = v;
  }

  try {
    localStorage.setItem(STORAGE_KEY_PRIVATE_MATCH_REVIEWS, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Lỗi khi lưu nhận xét kín trận đấu:', err);
  }
}

export function deletePrivateMatchReview(matchId: string): void {
  if (!matchId || typeof localStorage === 'undefined') return;
  const all = getAllPrivateMatchReviews();
  if (!(matchId in all)) return;
  delete all[matchId];
  try {
    localStorage.setItem(STORAGE_KEY_PRIVATE_MATCH_REVIEWS, JSON.stringify(all));
  } catch {
    // Bỏ qua
  }
}
