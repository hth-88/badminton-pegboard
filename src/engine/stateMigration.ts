import type {
  BadmintonSessionState,
  BetCategory,
  BetPayoutMode,
  BetUnit,
  Court,
  MatchBalanceRating,
  MatchBet,
  MatchHistory,
  MatchScore,
  Player,
  SessionSettings,
} from '../types/badminton';
import { DEFAULT_PENALTY_WEIGHTS } from '../types/badminton';
import { createEmptyStats, buildStatsFromHistory } from './statsManager';
import { createEmptyNextUp, normalizeNextUp } from './nextUp';

export const CURRENT_SCHEMA_VERSION = 3;

export const DEFAULT_SETTINGS: SessionSettings = {
  maleBonus: 1.5,
  courtMode: 'SHARED_POOL',
  matchMix: { doubles: 1, singles: 0 },
  autoSingles: 'ASK',
  autoSinglesSnoozeMin: 5,
  preferMixedDoubles: true,
  promptPostMatchReview: true,
  weights: { ...DEFAULT_PENALTY_WEIGHTS },
};

function sanitizeMatchScore(raw: unknown): MatchScore | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const t1 = Number(obj.team1);
  const t2 = Number(obj.team2);
  if (
    !Number.isInteger(t1) ||
    !Number.isInteger(t2) ||
    t1 < 0 ||
    t1 > 99 ||
    t2 < 0 ||
    t2 > 99
  ) {
    return undefined;
  }
  return { team1: t1, team2: t2 };
}

function sanitizeMatchBet(raw: unknown): MatchBet | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const validCategories: BetCategory[] = ['DRINK', 'SHUTTLE', 'MONEY', 'CUSTOM'];
  const validUnits: BetUnit[] = ['PER_PLAYER', 'PER_TEAM'];
  const validPayouts: BetPayoutMode[] = ['TEAM_TO_TEAM', 'LOSER_TO_FUND'];

  const category = validCategories.includes(obj.category as BetCategory)
    ? (obj.category as BetCategory)
    : 'CUSTOM';
  const label = typeof obj.label === 'string' ? obj.label.trim() : '';
  if (!label) return undefined;

  const rawQty = Number(obj.quantity);
  const quantity = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1;
  const unit = validUnits.includes(obj.unit as BetUnit)
    ? (obj.unit as BetUnit)
    : 'PER_PLAYER';
  const rawAmt = Number(obj.amountVnd);
  const amountVnd = Number.isFinite(rawAmt) && rawAmt >= 0 ? Math.round(rawAmt) : 0;
  const payoutMode = validPayouts.includes(obj.payoutMode as BetPayoutMode)
    ? (obj.payoutMode as BetPayoutMode)
    : 'TEAM_TO_TEAM';

  return {
    category,
    label,
    quantity,
    unit,
    amountVnd,
    payoutMode,
  };
}

function sanitizeCurrentMatch(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  const sanitizedBet = sanitizeMatchBet(raw.bet);
  if (sanitizedBet) {
    return { ...raw, bet: sanitizedBet };
  }
  if ('bet' in raw) {
    const clone = { ...raw };
    delete clone.bet;
    return clone;
  }
  return raw;
}

/**
 * Tạo sẵn 3 sân cố định (court-1, court-2, court-3), sân 3 mặc định isActive=false
 */
export function createDefaultCourts(count = 3): Court[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `court-${i + 1}`,
    name: `Sân ${i + 1}`,
    isActive: i < 2, // Sân 1 và 2 active, sân 3 trở đi isActive = false
    policy: 'MIX',
    forcedType: null,
    currentMatch: null,
    nextUp: createEmptyNextUp('DOUBLES'),
    suggestCursor: 0,
  }));
}

/**
 * Hàm di chuyển schema (Data Migration) đồng bộ dùng chung cho cả localStorage,
 * file JSON import, và Cloud Snapshot từ Supabase.
 * Đảm bảo tính Idempotent: chạy nhiều lần trên cùng 1 state hợp lệ sẽ cho kết quả giống hệt nhau.
 */
export function migrateSessionState(raw: any, fallbackNow: number = 0): BadmintonSessionState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Dữ liệu buổi chơi không phải là một đối tượng hợp lệ.');
  }
  if (!Array.isArray(raw.players) || !Array.isArray(raw.courts)) {
    throw new Error('Dữ liệu buổi chơi thiếu mảng players hoặc courts.');
  }

  // 1. History
  const validRatings: MatchBalanceRating[] = ['BALANCED', 'SLIGHT_GAP', 'LOPSIDED'];
  const history: MatchHistory[] = (Array.isArray(raw.history) ? raw.history : []).map((h: any) => {
    const item: MatchHistory = {
      id: String(h.id),
      courtId: String(h.courtId),
      type: h.type || 'DOUBLES',
      team1: Array.isArray(h.team1) ? h.team1 : [],
      team2: Array.isArray(h.team2) ? h.team2 : [],
      slotSource: h.slotSource || {},
      startedAt: Number(h.startedAt) || fallbackNow,
      endedAt: Number(h.endedAt) || fallbackNow,
      durationMinutes: Number(h.durationMinutes) || 15,
    };

    const score = sanitizeMatchScore(h.score);
    if (score) item.score = score;

    if (validRatings.includes(h.balanceRating)) {
      item.balanceRating = h.balanceRating;
    }

    const bet = sanitizeMatchBet(h.bet);
    if (bet) {
      item.bet = bet;
    }

    if (h.betWinner === 1 || h.betWinner === 2 || h.betWinner === null) {
      item.betWinner = h.betWinner;
    }

    return item;
  });

  // 2. Ensure court-1..3 exist (court-3 has isActive = false)
  const defaultCourts = createDefaultCourts(3);
  const rawCourtsList: any[] = Array.isArray(raw.courts) ? raw.courts : [];
  const courtMap = new Map<string, any>();
  for (const c of rawCourtsList) {
    if (c && c.id !== undefined) {
      courtMap.set(String(c.id), c);
    }
  }

  const courts: Court[] = defaultCourts.map((def) => {
    const existing = courtMap.get(def.id);
    if (!existing) {
      return def;
    }
    const currentMatch = sanitizeCurrentMatch(existing.currentMatch);
    const nextUp = normalizeNextUp(existing.nextUp, existing.forcedType, existing.policy);
    const suggestCursor = Number.isFinite(Number(existing.suggestCursor)) ? Number(existing.suggestCursor) : 0;

    return {
      id: def.id,
      name: existing.name || def.name,
      isActive: existing.isActive !== undefined ? Boolean(existing.isActive) : def.isActive,
      policy: existing.policy || 'MIX',
      forcedType: existing.forcedType !== undefined ? existing.forcedType : null,
      currentMatch,
      nextUp,
      suggestCursor,
    };
  });

  // Giữ lại các sân khác nếu có
  for (const [id, c] of courtMap.entries()) {
    if (!courts.some((fc) => fc.id === id)) {
      courts.push({
        id,
        name: c.name || `Sân ${id}`,
        isActive: Boolean(c.isActive ?? true),
        policy: c.policy || 'MIX',
        forcedType: c.forcedType !== undefined ? c.forcedType : null,
        currentMatch: sanitizeCurrentMatch(c.currentMatch),
        nextUp: normalizeNextUp(c.nextUp, c.forcedType, c.policy),
        suggestCursor: Number.isFinite(Number(c.suggestCursor)) ? Number(c.suggestCursor) : 0,
      });
    }
  }

  const validCourtIds = new Set(courts.map((c) => c.id));

  // 3. Players: normalize assignedPool pointing to non-existent court to 'ALL'
  const players: Player[] = (Array.isArray(raw.players) ? raw.players : []).map((p: any) => {
    const rawPool = String(p.assignedPool ?? 'ALL');
    const assignedPool = (rawPool === 'ALL' || validCourtIds.has(rawPool)) ? rawPool : 'ALL';

    return {
      id: String(p.id),
      name: p.name || 'Người chơi',
      sex: p.sex || 'M',
      rank: p.rank || 'tb',
      status: p.status || 'ACTIVE',
      assignedPool,
      gamesPlayed: Number(p.gamesPlayed) || 0,
      virtualGamesOffset: Number(p.virtualGamesOffset) || 0,
      waitStreak: Number(p.waitStreak) || 0,
      lastPlayedAt: Number(p.lastPlayedAt) || 0,
      singlesCount: Number(p.singlesCount) || 0,
      noSingles: Boolean(p.noSingles),
      joinedAt: Number(p.joinedAt) || fallbackNow,
    };
  });

  // 4. Stats: rebuild stats from history if stats empty and history has entries
  const isStatsEmpty =
    !raw.stats ||
    (Object.keys(raw.stats.lastMatchOfPlayer || {}).length === 0 &&
      Object.keys(raw.stats.partnerCount || {}).length === 0);

  const stats =
    history.length > 0 && isStatsEmpty
      ? buildStatsFromHistory(history)
      : raw.stats || createEmptyStats();

  // Data hygiene cho Next Up
  const activePlayerIds = new Set(
    players.filter((p) => p.status === 'ACTIVE').map((p) => p.id)
  );

  const playingByCourt = new Map<string, Set<string>>();
  for (const c of courts) {
    const set = new Set<string>();
    if (c.isActive && c.currentMatch) {
      if (Array.isArray(c.currentMatch.team1)) c.currentMatch.team1.forEach((id: string) => set.add(id));
      if (Array.isArray(c.currentMatch.team2)) c.currentMatch.team2.forEach((id: string) => set.add(id));
    }
    playingByCourt.set(c.id, set);
  }

  for (const c of courts) {
    const seenNextUpPlayerIds = new Set<string>();
    if (!c.nextUp) {
      c.nextUp = createEmptyNextUp(c.forcedType || (c.policy === 'SINGLES_ONLY' ? 'SINGLES' : 'DOUBLES'));
    }
    const slots = [...c.nextUp.slots];
    const slotSource = [...c.nextUp.slotSource];

    for (let i = 0; i < slots.length; i++) {
      const pid = slots[i];
      if (!pid) {
        slots[i] = null;
        slotSource[i] = null;
        continue;
      }

      if (!activePlayerIds.has(pid)) {
        slots[i] = null;
        slotSource[i] = null;
        continue;
      }

      let playingElsewhere = false;
      for (const [otherCourtId, playingSet] of playingByCourt.entries()) {
        if (otherCourtId !== c.id && playingSet.has(pid)) {
          playingElsewhere = true;
          break;
        }
      }
      if (playingElsewhere) {
        slots[i] = null;
        slotSource[i] = null;
        continue;
      }

      if (seenNextUpPlayerIds.has(pid)) {
        slots[i] = null;
        slotSource[i] = null;
        continue;
      }

      seenNextUpPlayerIds.add(pid);
    }

    c.nextUp.slots = slots;
    c.nextUp.slotSource = slotSource;
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    players,
    courts,
    history,
    pairRules: Array.isArray(raw.pairRules) ? raw.pairRules : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings || {}),
      weights: {
        ...DEFAULT_PENALTY_WEIGHTS,
        ...(raw.settings?.weights || {}),
      },
    },
    stats,
    mixDebt: raw.mixDebt || { doubles: 0, singles: 0 },
    readyQueue: Array.isArray(raw.readyQueue) ? raw.readyQueue : [],
    autoSinglesSnooze: raw.autoSinglesSnooze || {},
    undoStack:
      raw.schemaVersion === CURRENT_SCHEMA_VERSION && Array.isArray(raw.undoStack)
        ? raw.undoStack.slice(0, 5)
        : [],
    redoStack: [],
  };
}

