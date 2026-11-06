import type {
  BadmintonSessionState,
  Court,
  MatchHistory,
  Player,
} from '../types/badminton';
import { DEFAULT_PENALTY_WEIGHTS } from '../types/badminton';
import {
  createDefaultCourts,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
} from './sessionReducer';
import { buildStatsFromHistory, createEmptyStats } from './statsManager';
import { createEmptyNextUp, normalizeNextUp } from './nextUp';
export { normalizeNextUp };

export const STORAGE_KEY_V2 = 'badminton_court_session_v2';
export const STORAGE_KEY_V1 = 'badminton_court_session_v1';
export const CORRUPT_BACKUP_PREFIX = 'badminton_court_session_corrupt_';

export type LoadStatus = 'OK' | 'EMPTY' | 'CORRUPT_BACKED_UP' | 'CORRUPT_NO_BACKUP';
let lastLoadStatus: LoadStatus = 'EMPTY';

export function getLastLoadStatus(): LoadStatus {
  return lastLoadStatus;
}

export function setLastLoadStatus(status: LoadStatus): void {
  lastLoadStatus = status;
}

/**
 * Chỉ giữ tối đa maxKeep key 'badminton_court_session_corrupt_*' mới nhất (Mục F)
 */
export function pruneCorruptBackups(maxKeep = 2): void {
  try {
    const corruptKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CORRUPT_BACKUP_PREFIX)) {
        corruptKeys.push(k);
      }
    }
    if (corruptKeys.length <= maxKeep) return;

    // Sắp xếp giảm dần theo timestamp
    corruptKeys.sort((a, b) => {
      const tsA = Number(a.slice(CORRUPT_BACKUP_PREFIX.length)) || 0;
      const tsB = Number(b.slice(CORRUPT_BACKUP_PREFIX.length)) || 0;
      return tsB - tsA;
    });

    for (let i = maxKeep; i < corruptKeys.length; i++) {
      localStorage.removeItem(corruptKeys[i]);
    }
  } catch (err) {
    console.error('Lỗi khi dọn dẹp bản sao corrupt:', err);
  }
}

/**
 * Lấy bản sao hỏng mới nhất để tải về hoặc xuất file
 */
export function getLatestCorruptBackup(): { key: string; raw: string } | null {
  try {
    const corruptKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CORRUPT_BACKUP_PREFIX)) {
        corruptKeys.push(k);
      }
    }
    if (corruptKeys.length === 0) return null;
    corruptKeys.sort((a, b) => {
      const tsA = Number(a.slice(CORRUPT_BACKUP_PREFIX.length)) || 0;
      const tsB = Number(b.slice(CORRUPT_BACKUP_PREFIX.length)) || 0;
      return tsB - tsA;
    });
    const key = corruptKeys[0];
    const raw = localStorage.getItem(key);
    return raw ? { key, raw } : null;
  } catch {
    return null;
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let storageErrorFlag = false;
type StorageErrorListener = (hasError: boolean) => void;
const storageErrorListeners = new Set<StorageErrorListener>();

export function getStorageError(): boolean {
  return storageErrorFlag;
}

export function setStorageError(val: boolean): void {
  storageErrorFlag = val;
  storageErrorListeners.forEach((l) => l(val));
}

export function subscribeStorageError(listener: StorageErrorListener): () => void {
  storageErrorListeners.add(listener);
  return () => storageErrorListeners.delete(listener);
}

/**
 * Hàm di chuyển schema (Data Migration) từ các phiên bản cũ lên phiên bản mới nhất (Mục 0.20)
 * - Đảm bảo court-1..3 tồn tại (court-3 có isActive = false)
 * - Chuẩn hóa assignedPool trỏ tới sân không tồn tại về 'ALL'
 * - Thiết lập forcedType: null nếu chưa có
 * - Tái tạo stats từ history nếu stats rỗng và history có dữ liệu
 */
export function migrateSessionState(raw: any): BadmintonSessionState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Dữ liệu buổi chơi không phải là một đối tượng hợp lệ.');
  }
  if (!Array.isArray(raw.players) || !Array.isArray(raw.courts)) {
    throw new Error('Dữ liệu buổi chơi thiếu mảng players hoặc courts.');
  }

  // 1. History
  const history: MatchHistory[] = (Array.isArray(raw.history) ? raw.history : []).map((h: any) => ({
    id: String(h.id),
    courtId: String(h.courtId),
    type: h.type || 'DOUBLES',
    team1: h.team1 || [],
    team2: h.team2 || [],
    slotSource: h.slotSource || {},
    startedAt: Number(h.startedAt) || Date.now(),
    endedAt: Number(h.endedAt) || Date.now(),
    durationMinutes: Number(h.durationMinutes) || 15,
  }));

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
    const currentMatch = existing.currentMatch || null;
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
        currentMatch: c.currentMatch || null,
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
      joinedAt: Number(p.joinedAt) || Date.now(),
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
      c.currentMatch.team1.forEach((id) => set.add(id));
      c.currentMatch.team2.forEach((id) => set.add(id));
    }
    playingByCourt.set(c.id, set);
  }

  const seenNextUpPlayerIds = new Set<string>();

  for (const c of courts) {
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

/**
 * Kiểm tra và chuyển đổi dữ liệu khi người dùng Import JSON (Mục B):
 * - Từ chối nếu JSON không phải object có mảng players và courts.
 * - Không trả buổi trống khi dữ liệu lạ.
 */
export function validateAndMigrateImport(json: string):
  | { ok: true; state: BadmintonSessionState }
  | { ok: false; error: string } {
  if (!json || typeof json !== 'string' || !json.trim()) {
    return { ok: false, error: 'Chuỗi JSON không được để trống.' };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (e: any) {
    return { ok: false, error: `JSON không hợp lệ: ${e?.message || 'Lỗi cú pháp'}` };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Dữ liệu không hợp lệ: Phải là một đối tượng JSON.',
    };
  }

  if (!Array.isArray(parsed.players) || !Array.isArray(parsed.courts)) {
    return {
      ok: false,
      error: 'Dữ liệu không hợp lệ: Cần chứa mảng người chơi (players) và mảng sân (courts).',
    };
  }

  try {
    const migrated = migrateSessionState(parsed);
    return { ok: true, state: migrated };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Không thể chuyển đổi dữ liệu buổi chơi.' };
  }
}

/**
 * Lưu dữ liệu tức thì không debounce (Mục 0.18):
 * - Không lưu redoStack
 * - Giới hạn tối đa 5 bước undoStack
 * - Bắt QuotaExceededError: thử lại không lưu undoStack
 * - Đặt storageError flag
 */
export function saveSessionImmediate(state: BadmintonSessionState): void {
  const stateToSave = {
    ...state,
    undoStack: (state.undoStack || []).slice(0, 5),
    redoStack: [],
  };

  try {
    const serialized = JSON.stringify(stateToSave);
    localStorage.setItem(STORAGE_KEY_V2, serialized);
    setStorageError(false);
  } catch (e: any) {
    const isQuota =
      e?.name === 'QuotaExceededError' ||
      e?.code === 22 ||
      e?.code === 1014 ||
      (e?.message && /quota/i.test(e.message));

    if (isQuota) {
      try {
        const retryState = {
          ...stateToSave,
          undoStack: [],
        };
        localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(retryState));
        setStorageError(false);
        return;
      } catch (retryErr) {
        console.error('Lỗi quota localStorage ngay cả khi bỏ undoStack:', retryErr);
        setStorageError(true);
        return;
      }
    }
    console.error('Lỗi lưu session vào localStorage:', e);
    setStorageError(true);
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
 * Đọc dữ liệu từ localStorage và tự động migrate nếu là version cũ (Mục 0.19):
 * - Khi JSON bị hỏng, sao chép raw sang badminton_court_session_corrupt_<timestamp> trước khi trả null
 */
export function loadSession(now: number = Date.now()): BadmintonSessionState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) {
      raw = localStorage.getItem(STORAGE_KEY_V1);
    }
    if (!raw) {
      lastLoadStatus = 'EMPTY';
      return null;
    }

    const parsed = JSON.parse(raw);
    const result = migrateSessionState(parsed);
    lastLoadStatus = 'OK';
    return result;
  } catch (e) {
    console.error('Lỗi khi tải dữ liệu từ localStorage:', e);
    if (raw) {
      try {
        pruneCorruptBackups(1);
        localStorage.setItem(`${CORRUPT_BACKUP_PREFIX}${now}`, raw);
        pruneCorruptBackups(2);
        lastLoadStatus = 'CORRUPT_BACKED_UP';
      } catch (backupErr) {
        console.error('Không thể lưu bản sao corrupt vào localStorage:', backupErr);
        lastLoadStatus = 'CORRUPT_NO_BACKUP';
      }
    } else {
      lastLoadStatus = 'CORRUPT_NO_BACKUP';
    }
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

// ====================================================================
// QUẢN LÝ LƯU TRỮ QUYẾT TOÁN (PAID STATUS) & LỊCH SỬ BUỔI ĐÁNH (ARCHIVE)
// ====================================================================

export const STORAGE_KEY_PAID_PLAYERS = 'badminton_paid_players';
export const STORAGE_KEY_ARCHIVED_SESSIONS = 'badminton_archived_sessions';

export interface ArchivedSessionSummary {
  id: string;
  date: string;
  createdAt: number;
  totalGames: number;
  totalCost: number;
  totalPlayers: number;
  sessionData: BadmintonSessionState;
}

export function getPaidPlayerIds(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY_PAID_PLAYERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePaidPlayerIds(ids: string[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_PAID_PLAYERS, JSON.stringify(ids));
  } catch (e) {
    console.error('Lỗi khi lưu danh sách đã đóng tiền:', e);
  }
}

export function getArchivedSessions(): ArchivedSessionSummary[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY_ARCHIVED_SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveArchivedSessions(sessions: ArchivedSessionSummary[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const trimmed = sessions.slice(0, 20);
    localStorage.setItem(STORAGE_KEY_ARCHIVED_SESSIONS, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Lỗi khi lưu danh sách buổi lưu trữ:', e);
  }
}

export function archiveCurrentSession(
  state: BadmintonSessionState,
  totalCost: number = 0
): ArchivedSessionSummary {
  const existing = getArchivedSessions();
  const summary: ArchivedSessionSummary = {
    id: `archive_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    date: new Date().toISOString(),
    createdAt: Date.now(),
    totalGames: state.history.length,
    totalCost,
    totalPlayers: state.players.length,
    sessionData: JSON.parse(JSON.stringify(state)),
  };

  const updated = [summary, ...existing].slice(0, 20);
  saveArchivedSessions(updated);
  return summary;
}

export function deleteArchivedSession(id: string): void {
  const existing = getArchivedSessions();
  const updated = existing.filter((s) => s.id !== id);
  saveArchivedSessions(updated);
}

export function clearAllArchivedSessions(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_ARCHIVED_SESSIONS);
  } catch (e) {
    console.error('Lỗi khi xóa toàn bộ buổi lưu trữ:', e);
  }
}

