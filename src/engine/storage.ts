import type { BadmintonSessionState } from '../types/badminton';
import {
  DEFAULT_SETTLEMENT_SETTINGS,
  type PlayerPaymentRecord,
  type SettlementSettings,
} from './settlement';
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
export const STORAGE_KEY_SETTLEMENT_SETTINGS = 'badminton_settlement_settings';
export const STORAGE_KEY_PAYMENT_RECORDS = 'badminton_payment_records';

export function getSettlementSettings(): SettlementSettings {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_SETTLEMENT_SETTINGS };
    }
    const saved = localStorage.getItem(STORAGE_KEY_SETTLEMENT_SETTINGS);
    if (!saved) {
      return { ...DEFAULT_SETTLEMENT_SETTINGS };
    }
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_SETTLEMENT_SETTINGS };
    }
    if (parsed.courtHourlyRate === 90000) parsed.courtHourlyRate = 160000;
    if (parsed.shuttlePrice === 22000) parsed.shuttlePrice = 30000;
    if (parsed.extraCost === 30000 && parsed.extraCostNote === 'Nước uống') parsed.extraCost = 0;
    return { ...DEFAULT_SETTLEMENT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTLEMENT_SETTINGS };
  }
}

export function saveSettlementSettings(settings: SettlementSettings): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_SETTLEMENT_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Lỗi khi lưu cài đặt quyết toán:', e);
  }
}

export function getPaymentRecords(): Record<string, PlayerPaymentRecord> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY_PAYMENT_RECORDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const result: Record<string, PlayerPaymentRecord> = {};
        for (const [pid, val] of Object.entries(parsed as Record<string, unknown>)) {
          if (!pid || !val || typeof val !== 'object' || Array.isArray(val)) continue;
          const rec = val as Record<string, unknown>;
          if (
            rec.status !== 'PENDING_REVIEW' &&
            rec.status !== 'PAID' &&
            rec.status !== 'REJECTED'
          ) {
            continue;
          }
          const cleanRec: PlayerPaymentRecord = { status: rec.status };
          if (typeof rec.reportedAt === 'number' && Number.isFinite(rec.reportedAt)) {
            cleanRec.reportedAt = rec.reportedAt;
          }
          if (typeof rec.approvedAt === 'number' && Number.isFinite(rec.approvedAt)) {
            cleanRec.approvedAt = rec.approvedAt;
          }
          if (typeof rec.rejectedAt === 'number' && Number.isFinite(rec.rejectedAt)) {
            cleanRec.rejectedAt = rec.rejectedAt;
          }
          if (typeof rec.rejectionReason === 'string' && rec.rejectionReason.trim()) {
            cleanRec.rejectionReason = rec.rejectionReason.trim().slice(0, 160);
          }
          if (typeof rec.receiptUrl === 'string' && rec.receiptUrl.trim()) {
            cleanRec.receiptUrl = rec.receiptUrl.trim();
          }
          if (typeof rec.receiptPath === 'string' && rec.receiptPath.trim()) {
            cleanRec.receiptPath = rec.receiptPath.trim();
          }
          result[pid] = cleanRec;
        }
        return result;
      }
    }

    // Migrate ngược từ danh sách legacy badminton_paid_players nếu chưa có key mới
    const legacyPaid = getPaidPlayerIds();
    const migrated: Record<string, PlayerPaymentRecord> = {};
    for (const id of legacyPaid) {
      if (typeof id === 'string' && id.trim()) {
        migrated[id] = { status: 'PAID' };
      }
    }
    return migrated;
  } catch {
    return {};
  }
}

export function savePaymentRecords(records: Record<string, PlayerPaymentRecord>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const filtered: Record<string, PlayerPaymentRecord> = {};
    const paidIds: string[] = [];
    for (const [pid, rec] of Object.entries(records || {})) {
      if (!pid || !rec) continue;
      if (
        rec.status === 'PENDING_REVIEW' ||
        rec.status === 'PAID' ||
        rec.status === 'REJECTED'
      ) {
        filtered[pid] = rec;
        if (rec.status === 'PAID') {
          paidIds.push(pid);
        }
      }
    }
    localStorage.setItem(STORAGE_KEY_PAYMENT_RECORDS, JSON.stringify(filtered));
    savePaidPlayerIds(paidIds);
  } catch (e) {
    console.error('Lỗi khi lưu trạng thái đóng tiền:', e);
  }
}

export function clearPaymentRecords(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_PAYMENT_RECORDS);
    localStorage.removeItem(STORAGE_KEY_PAID_PLAYERS);
  } catch (e) {
    console.error('Lỗi khi xóa trạng thái đóng tiền:', e);
  }
}

export interface ArchivedPlayerPaymentSnapshot {
  playerId: string;
  name: string;
  sex: 'M' | 'F';
  gamesPlayed: number;
  courtAmount: number;
  betAdjustmentVnd?: number;
  finalAmount: number;
  paid: boolean;
  paidAt?: number;
}

export interface ArchivedSettlementSnapshot {
  courtCost: number;
  shuttleCost: number;
  extraCost: number;
  extraCostNote?: string;
  totalCost: number;
  totalCollected: number;
  surplus: number;
  betFundTotal?: number;
  mergeBetsIntoSettlement?: boolean;
  players: ArchivedPlayerPaymentSnapshot[];
}

export interface ArchivedSessionSummary {
  id: string;
  date: string;
  createdAt: number;
  totalGames: number;
  totalCost: number;
  totalPlayers: number;
  sessionData: BadmintonSessionState;
  settlementSnapshot?: ArchivedSettlementSnapshot;
}

export interface UnpaidArchiveDebt {
  archiveId: string;
  date: string;
  createdAt: number;
  playerId: string;
  playerName: string;
  amount: number;
}

export interface MultiSessionFinanceSummary {
  sessionsWithFinance: number;
  totalCostAll: number;
  totalCollectedAll: number;
  cumulativeSurplus: number;
  totalUnpaidAmount: number;
  unpaidDebts: UnpaidArchiveDebt[];
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
  totalCost: number = 0,
  settlementSnapshot?: ArchivedSettlementSnapshot
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
    ...(settlementSnapshot
      ? { settlementSnapshot: JSON.parse(JSON.stringify(settlementSnapshot)) }
      : {}),
  };

  const updated = [summary, ...existing].slice(0, 20);
  saveArchivedSessions(updated);
  return summary;
}

export function toggleArchivedPlayerPaid(
  archiveId: string,
  playerId: string,
  now: number = Date.now()
): ArchivedSessionSummary[] {
  const existing = getArchivedSessions();
  const updated = existing.map((session) => {
    if (session.id !== archiveId || !session.settlementSnapshot) {
      return session;
    }
    const nextPlayers = session.settlementSnapshot.players.map((p) => {
      if (p.playerId !== playerId) return p;
      const nextPaid = !p.paid;
      return {
        ...p,
        paid: nextPaid,
        paidAt: nextPaid ? now : undefined,
      };
    });
    return {
      ...session,
      settlementSnapshot: {
        ...session.settlementSnapshot,
        players: nextPlayers,
      },
    };
  });
  saveArchivedSessions(updated);
  return updated;
}

export function computeMultiSessionFinanceSummary(
  archives: ArchivedSessionSummary[]
): MultiSessionFinanceSummary {
  let sessionsWithFinance = 0;
  let totalCostAll = 0;
  let totalCollectedAll = 0;
  let cumulativeSurplus = 0;
  let totalUnpaidAmount = 0;
  const unpaidDebts: UnpaidArchiveDebt[] = [];

  for (const session of archives) {
    const snap = session.settlementSnapshot;
    if (!snap) continue;

    sessionsWithFinance++;
    totalCostAll += snap.totalCost || 0;
    totalCollectedAll += snap.totalCollected || 0;
    cumulativeSurplus += (snap.surplus || 0) + (snap.betFundTotal || 0);

    for (const p of snap.players || []) {
      if (p.finalAmount > 0 && !p.paid) {
        totalUnpaidAmount += p.finalAmount;
        unpaidDebts.push({
          archiveId: session.id,
          date: session.date,
          createdAt: session.createdAt,
          playerId: p.playerId,
          playerName: p.name,
          amount: p.finalAmount,
        });
      }
    }
  }

  return {
    sessionsWithFinance,
    totalCostAll,
    totalCollectedAll,
    cumulativeSurplus,
    totalUnpaidAmount,
    unpaidDebts,
  };
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

