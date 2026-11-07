import type { BadmintonSessionState } from '../types/badminton';
import { normalizeNextUp } from './nextUp';
import { migrateSessionState } from './stateMigration';
export { normalizeNextUp, migrateSessionState };

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

