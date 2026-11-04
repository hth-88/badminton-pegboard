import type {
  BadmintonSessionState,
  Court,
  MatchHistory,
  Player,
} from '../types/badminton';
import { DEFAULT_PENALTY_WEIGHTS } from '../types/badminton';
import {
  createDefaultCourts,
  createInitialSessionState,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
} from './sessionReducer';
import { buildStatsFromHistory, createEmptyStats } from './statsManager';

export const STORAGE_KEY_V2 = 'badminton_court_session_v2';
export const STORAGE_KEY_V1 = 'badminton_court_session_v1';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Hàm di chuyển schema (Data Migration) từ các phiên bản cũ lên phiên bản mới nhất
 */
export function migrateSessionState(raw: any): BadmintonSessionState {
  if (!raw || typeof raw !== 'object') {
    return createInitialSessionState();
  }

  // Nếu là Schema Version 2 hoàn chỉnh
  if (raw.schemaVersion === CURRENT_SCHEMA_VERSION && Array.isArray(raw.players)) {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      players: raw.players.map((p: any) => ({
        ...p,
        assignedPool: String(p.assignedPool || 'ALL'),
        singlesCount: p.singlesCount ?? 0,
        noSingles: Boolean(p.noSingles),
        joinedAt: p.joinedAt ?? Date.now(),
      })),
      courts: (raw.courts || createDefaultCourts(2)).map((c: any) => ({
        ...c,
        id: String(c.id),
        policy: c.policy || 'MIX',
      })),
      history: Array.isArray(raw.history) ? raw.history : [],
      pairRules: Array.isArray(raw.pairRules) ? raw.pairRules : [],
      settings: {
        ...DEFAULT_SETTINGS,
        ...(raw.settings || {}),
        weights: {
          ...DEFAULT_PENALTY_WEIGHTS,
          ...(raw.settings?.weights || {}),
        },
      },
      stats: raw.stats || createEmptyStats(),
      mixDebt: raw.mixDebt || { doubles: 0, singles: 0 },
      readyQueue: Array.isArray(raw.readyQueue) ? raw.readyQueue : [],
      autoSinglesSnooze: raw.autoSinglesSnooze || {},
      courtPlanIndex: raw.courtPlanIndex || {},
      undoStack: Array.isArray(raw.undoStack) ? raw.undoStack.slice(0, 30) : [],
      redoStack: Array.isArray(raw.redoStack) ? raw.redoStack.slice(0, 30) : [],
    };
  }

  // Migration từ v1 hoặc dữ liệu cũ
  const players: Player[] = (raw.players || []).map((p: any) => ({
    id: String(p.id),
    name: p.name || 'Người chơi',
    sex: p.sex || 'M',
    rank: p.rank || 'tb',
    status: p.status || 'ACTIVE',
    assignedPool: p.assignedPool === 'ALL' ? 'ALL' : String(p.assignedPool),
    gamesPlayed: Number(p.gamesPlayed) || 0,
    virtualGamesOffset: Number(p.virtualGamesOffset) || 0,
    waitStreak: Number(p.waitStreak) || 0,
    lastPlayedAt: Number(p.lastPlayedAt) || 0,
    singlesCount: 0,
    noSingles: false,
    joinedAt: Date.now(),
  }));

  const courts: Court[] = (raw.courts || createDefaultCourts(2)).map((c: any) => {
    let currentMatch = null;
    if (c.currentMatch) {
      currentMatch = {
        type: 'DOUBLES' as const,
        team1: c.currentMatch.team1,
        team2: c.currentMatch.team2,
        slotSource: {
          [c.currentMatch.team1[0]]: 'AUTO' as const,
          [c.currentMatch.team1[1]]: 'AUTO' as const,
          [c.currentMatch.team2[0]]: 'AUTO' as const,
          [c.currentMatch.team2[1]]: 'AUTO' as const,
        },
        startedAt: c.currentMatch.startedAt || Date.now(),
        id: c.currentMatch.id,
      };
    }

    let nextUp = null;
    if (c.nextUp) {
      nextUp = {
        type: 'DOUBLES' as const,
        team1: c.nextUp.team1,
        team2: c.nextUp.team2,
        slotSource: {
          [c.nextUp.team1[0]]: 'AUTO' as const,
          [c.nextUp.team1[1]]: 'AUTO' as const,
          [c.nextUp.team2[0]]: 'AUTO' as const,
          [c.nextUp.team2[1]]: 'AUTO' as const,
        },
        isLockedByHost: Boolean(c.nextUp.isLockedByHost),
      };
    }

    return {
      id: String(c.id),
      name: c.name || `Sân ${c.id}`,
      isActive: Boolean(c.isActive ?? true),
      policy: 'MIX' as const,
      currentMatch,
      nextUp,
    };
  });

  const history: MatchHistory[] = (raw.history || []).map((h: any) => ({
    id: String(h.id),
    courtId: String(h.courtId),
    type: h.type || 'DOUBLES',
    team1: h.team1,
    team2: h.team2,
    slotSource: h.slotSource || {},
    startedAt: Number(h.startedAt) || Date.now(),
    endedAt: Number(h.endedAt) || Date.now(),
    durationMinutes: Number(h.durationMinutes) || 15,
  }));

  const stats = raw.stats && Object.keys(raw.stats.lastMatchOfPlayer || {}).length > 0
    ? raw.stats
    : buildStatsFromHistory(history);

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
    mixDebt: { doubles: 0, singles: 0 },
    readyQueue: [],
    autoSinglesSnooze: {},
    courtPlanIndex: {},
    undoStack: [],
    redoStack: [],
  };
}

/**
 * Lưu dữ liệu tức thì không debounce (dùng cho tests hoặc khi đóng tab)
 */
export function saveSessionImmediate(state: BadmintonSessionState): void {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY_V2, serialized);
  } catch (e) {
    console.error('Lỗi lưu session vào localStorage:', e);
  }
}

/**
 * Lưu dữ liệu với Debounce 300ms theo yêu cầu kiến trúc
 */
export function debouncedSaveSession(state: BadmintonSessionState, delayMs = 300): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    saveSessionImmediate(state);
    debounceTimer = null;
  }, delayMs);
}

/**
 * Đọc dữ liệu từ localStorage và tự động migrate nếu là version cũ
 */
export function loadSession(): BadmintonSessionState | null {
  try {
    let raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) {
      raw = localStorage.getItem(STORAGE_KEY_V1);
    }
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return migrateSessionState(parsed);
  } catch (e) {
    console.error('Lỗi khi tải dữ liệu từ localStorage:', e);
    return null;
  }
}

/**
 * Xóa sạch session trong localStorage
 */
export function clearSession(): void {
  try {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    localStorage.removeItem(STORAGE_KEY_V2);
    localStorage.removeItem(STORAGE_KEY_V1);
  } catch (e) {
    console.error('Lỗi khi xóa localStorage:', e);
  }
}
