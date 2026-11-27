import { useCallback, useEffect, useRef, useState } from 'react';
import {
  areSettlementDataEqual,
  createDefaultCloudSettlementData,
  normalizeCloudSettlementData,
  type CloudSettlementData,
  type PlayerPaymentRecord,
} from '../engine/settlement';
import { createInitialSessionState } from '../engine/sessionReducer';
import { migrateSessionState } from '../engine/stateMigration';
import type { BadmintonSessionSnapshot, BadmintonSessionState } from '../types/badminton';
import {
  fetchRoom,
  getClientId,
  STORAGE_KEY_CLOUD_ROOM,
  type StoredCloudRoom,
  subscribeToRoom,
  updateRoomPinOnly,
  updateRoomSettlementOnly,
  upsertRoom,
} from '../services/supabaseSync';

export type RoomRole = 'OFFLINE' | 'VIEWER' | 'CO_HOST';
export type SyncStatus = 'OFFLINE' | 'IDLE' | 'SYNCING' | 'SYNCED' | 'ERROR';
export const STORAGE_KEY_OFFLINE_BACKUP = 'badminton_offline_backup_v1';

interface UseCloudRoomProps {
  currentState: BadmintonSessionState;
  onApplyCloudState: (newState: BadmintonSessionState) => void;
  onShowToast?: (message: string) => void;
  currentSettlement?: CloudSettlementData;
  onApplyCloudSettlement?: (data: CloudSettlementData, role: RoomRole) => void;
}

/**
 * So sánh cấu trúc 2 session snapshot để phát hiện biến động thực sự,
 * tránh ping-pong loop giữa các Co-Host và tránh nuốt nhầm thao tác local.
 */
export function areSessionSnapshotsEqual(
  a: BadmintonSessionState | BadmintonSessionSnapshot | null | undefined,
  b: BadmintonSessionState | BadmintonSessionSnapshot | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  if (a.players?.length !== b.players?.length) return false;
  if (a.courts?.length !== b.courts?.length) return false;
  if (a.history?.length !== b.history?.length) return false;
  if (a.pairRules?.length !== b.pairRules?.length) return false;
  if (a.readyQueue?.length !== b.readyQueue?.length) return false;

  // mixDebt
  if (
    a.mixDebt?.doubles !== b.mixDebt?.doubles ||
    a.mixDebt?.singles !== b.mixDebt?.singles
  ) {
    return false;
  }

  // So sánh courts
  for (let i = 0; i < a.courts.length; i++) {
    const cA = a.courts[i];
    const cB = b.courts[i];
    if (
      cA.id !== cB.id ||
      cA.name !== cB.name ||
      cA.isActive !== cB.isActive ||
      cA.policy !== cB.policy
    ) {
      return false;
    }
    if (cA.forcedType !== cB.forcedType) return false;
    if (cA.suggestCursor !== cB.suggestCursor) return false;

    // currentMatch
    if (Boolean(cA.currentMatch) !== Boolean(cB.currentMatch)) return false;
    if (cA.currentMatch && cB.currentMatch) {
      if (cA.currentMatch.id !== cB.currentMatch.id) return false;
      if (cA.currentMatch.team1?.join(',') !== cB.currentMatch.team1?.join(',')) return false;
      if (cA.currentMatch.team2?.join(',') !== cB.currentMatch.team2?.join(',')) return false;
      if (
        JSON.stringify(cA.currentMatch.bet || null) !==
        JSON.stringify(cB.currentMatch.bet || null)
      ) {
        return false;
      }
    }

    // nextUp
    const nA = cA.nextUp;
    const nB = cB.nextUp;
    if (Boolean(nA) !== Boolean(nB)) return false;
    if (nA && nB) {
      if (nA.type !== nB.type) return false;
      const sA = nA.slots || [];
      const sB = nB.slots || [];
      if (sA.join(',') !== sB.join(',')) return false;
      const srcA = nA.slotSource || [];
      const srcB = nB.slotSource || [];
      if (srcA.join(',') !== srcB.join(',')) return false;
    }
  }

  // So sánh players
  for (let i = 0; i < a.players.length; i++) {
    const pA = a.players[i];
    const pB = b.players[i];
    if (
      pA.id !== pB.id ||
      pA.name !== pB.name ||
      pA.sex !== pB.sex ||
      pA.status !== pB.status ||
      pA.rank !== pB.rank ||
      pA.gamesPlayed !== pB.gamesPlayed ||
      pA.virtualGamesOffset !== pB.virtualGamesOffset ||
      pA.waitStreak !== pB.waitStreak ||
      pA.assignedPool !== pB.assignedPool ||
      pA.noSingles !== pB.noSingles
    ) {
      return false;
    }
  }

  // So sánh settings cơ bản
  if (
    a.settings?.maleBonus !== b.settings?.maleBonus ||
    a.settings?.courtMode !== b.settings?.courtMode ||
    a.settings?.autoSingles !== b.settings?.autoSingles ||
    a.settings?.autoSinglesSnoozeMin !== b.settings?.autoSinglesSnoozeMin ||
    a.settings?.preferMixedDoubles !== b.settings?.preferMixedDoubles ||
    (a.settings?.promptPostMatchReview ?? true) !== (b.settings?.promptPostMatchReview ?? true) ||
    a.settings?.matchMix?.doubles !== b.settings?.matchMix?.doubles ||
    a.settings?.matchMix?.singles !== b.settings?.matchMix?.singles
  ) {
    return false;
  }

  // So sánh settings.weights
  const wA = a.settings?.weights;
  const wB = b.settings?.weights;
  if (wA !== wB) {
    if (!wA || !wB) return false;
    const keysA = Object.keys(wA) as Array<keyof typeof wA>;
    const keysB = Object.keys(wB) as Array<keyof typeof wB>;
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) {
      if (wA[k] !== wB[k]) return false;
    }
  }

  // So sánh nội dung pairRules
  const rulesA = a.pairRules || [];
  const rulesB = b.pairRules || [];
  for (let i = 0; i < rulesA.length; i++) {
    const rA = rulesA[i];
    const rB = rulesB[i];
    if (
      rA.id !== rB.id ||
      rA.playerAId !== rB.playerAId ||
      rA.playerBId !== rB.playerBId ||
      rA.type !== rB.type
    ) {
      return false;
    }
  }

  // So sánh nội dung history
  const histA = a.history || [];
  const histB = b.history || [];
  for (let i = 0; i < histA.length; i++) {
    const hA = histA[i];
    const hB = histB[i];
    if (
      hA.id !== hB.id ||
      hA.courtId !== hB.courtId ||
      hA.endedAt !== hB.endedAt ||
      hA.team1?.join(',') !== hB.team1?.join(',') ||
      hA.team2?.join(',') !== hB.team2?.join(',') ||
      (hA.balanceRating || '') !== (hB.balanceRating || '') ||
      (hA.betWinner ?? null) !== (hB.betWinner ?? null) ||
      JSON.stringify(hA.score || null) !== JSON.stringify(hB.score || null) ||
      JSON.stringify(hA.bet || null) !== JSON.stringify(hB.bet || null)
    ) {
      return false;
    }
  }

  // So sánh nội dung readyQueue
  const queueA = a.readyQueue || [];
  const queueB = b.readyQueue || [];
  for (let i = 0; i < queueA.length; i++) {
    const qA = queueA[i];
    const qB = queueB[i];
    if (
      qA.id !== qB.id ||
      qA.courtId !== qB.courtId ||
      qA.isLockedByHost !== qB.isLockedByHost ||
      qA.lineup?.type !== qB.lineup?.type ||
      qA.lineup?.team1?.join(',') !== qB.lineup?.team1?.join(',') ||
      qA.lineup?.team2?.join(',') !== qB.lineup?.team2?.join(',')
    ) {
      return false;
    }
  }

  return true;
}

export function useCloudRoom({
  currentState,
  onApplyCloudState,
  onShowToast,
  currentSettlement,
  onApplyCloudSettlement,
}: UseCloudRoomProps) {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [pinCode, setPinCode] = useState<string | null>(null);
  const [role, setRole] = useState<RoomRole>('OFFLINE');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('OFFLINE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPinPrompt, setShowPinPromptState] = useState<boolean>(false);
  const setShowPinPrompt = useCallback((open: boolean) => {
    if (!open) {
      pendingActionRef.current = null;
    }
    setShowPinPromptState(open);
  }, []);

  const [clientId] = useState<string>(() => getClientId());

  // A1: Lưu callback vào Ref để tham chiếu luôn ổn định và không làm đổi joinRoom/effects
  const onApplyRef = useRef(onApplyCloudState);
  onApplyRef.current = onApplyCloudState;

  const onToastRef = useRef(onShowToast);
  onToastRef.current = onShowToast;

  const currentStateRef = useRef(currentState);
  currentStateRef.current = currentState;

  const onApplySettlementRef = useRef(onApplyCloudSettlement);
  onApplySettlementRef.current = onApplyCloudSettlement;

  const currentSettlementRef = useRef(currentSettlement);
  currentSettlementRef.current = currentSettlement;

  const roleRef = useRef(role);
  roleRef.current = role;

  const roomCodeRef = useRef(roomCode);
  roomCodeRef.current = roomCode;

  const pinCodeRef = useRef(pinCode);
  pinCodeRef.current = pinCode;

  const pendingStorageKey = `${STORAGE_KEY_CLOUD_ROOM}_pending_ts`;

  // A2: Cờ guard kết nối khởi động đúng 1 lần
  const hasConnectedInitialRef = useRef<boolean>(false);

  // A4 (ii): Cờ đánh dấu có thay đổi local đang pending hoặc đang bay lên cloud
  const hasPendingLocalChangeRef = useRef<boolean>(false);
  const hasPendingSettlementChangeRef = useRef<boolean>(false);

  // Hydration Lock: khóa không cho đẩy state/settlement cũ (VD phiên trống sau khi rời phòng) lên Cloud trước khi state Cloud vừa fetch kịp commit
  const awaitingRemoteSessionHydrationRef = useRef<boolean>(false);
  const awaitingRemoteSettlementHydrationRef = useRef<boolean>(false);

  const lastAppliedTimestampRef = useRef<number>(0);
  const lastAppliedRemoteSnapshotRef = useRef<BadmintonSessionSnapshot | BadmintonSessionState | null>(null);
  const lastAppliedSettlementTsRef = useRef<number>(0);
  const lastAppliedRemoteSettlementRef = useRef<CloudSettlementData | null>(null);
  const isApplyingRemoteRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settlementDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  // 1. Vào phòng có sẵn (Viewer hoặc Co-Host)
  // A1: joinRoom có tham chiếu ổn định tuyệt đối (deps = [])
  const joinRoom = useCallback(
    async (
      code: string,
      pin?: string,
      options?: { isAutoReconnect?: boolean }
    ): Promise<{ ok: boolean; role: RoomRole; error?: string }> => {
      const cleanCode = code.toUpperCase().trim();
      const cleanPin = pin?.trim() || '';

      setSyncStatus('SYNCING');
      const res = await fetchRoom(cleanCode);

      if (res.error || !res.data) {
        setSyncStatus('ERROR');
        const err = res.error || `Không tìm thấy phòng "${cleanCode}"`;
        setErrorMessage(err);
        return { ok: false, role: 'OFFLINE', error: err };
      }

      const roomData = res.data;
      const isCoHost = Boolean(cleanPin && cleanPin === roomData.pin_code);
      const assignedRole: RoomRole = isCoHost ? 'CO_HOST' : 'VIEWER';

      // Sao lưu phiên offline cục bộ trước khi nạp dữ liệu phòng ở chế độ VIEWER
      if (assignedRole === 'VIEWER' && roleRef.current === 'OFFLINE') {
        try {
          if (!localStorage.getItem(STORAGE_KEY_OFFLINE_BACKUP)) {
            localStorage.setItem(
              STORAGE_KEY_OFFLINE_BACKUP,
              JSON.stringify({
                sessionData: currentStateRef.current,
                settlementData: currentSettlementRef.current ?? null,
              })
            );
          }
        } catch {
          // Bỏ qua lỗi quota
        }
      }

      let shouldPreservePendingLocal = false;
      if (options?.isAutoReconnect && isCoHost) {
        try {
          const rawPending = localStorage.getItem(pendingStorageKey);
          if (rawPending) {
            const parsedPending = JSON.parse(rawPending) as { roomCode?: string; updatedAt?: number };
            if (
              parsedPending.roomCode === cleanCode &&
              typeof parsedPending.updatedAt === 'number' &&
              parsedPending.updatedAt > roomData.updated_at &&
              !areSessionSnapshotsEqual(currentStateRef.current, roomData.session_data)
            ) {
              shouldPreservePendingLocal = true;
            }
          }
        } catch {
          // Bỏ qua lỗi đọc pending_ts
        }
      }

      // Nạp dữ liệu phòng vào ứng dụng (hoặc giữ nguyên bản local mới hơn khi F5 lúc đang debounce)
      let normalizedRemoteSession = roomData.session_data;
      try {
        normalizedRemoteSession = migrateSessionState(roomData.session_data);
      } catch {
        // Fallback nếu dữ liệu cloud tối giản trong mock/test
      }
      lastAppliedTimestampRef.current = roomData.updated_at;
      lastAppliedRemoteSnapshotRef.current = normalizedRemoteSession;
      if (shouldPreservePendingLocal) {
        awaitingRemoteSessionHydrationRef.current = false;
        hasPendingLocalChangeRef.current = true;
      } else {
        awaitingRemoteSessionHydrationRef.current = !areSessionSnapshotsEqual(
          currentStateRef.current,
          normalizedRemoteSession
        );
        isApplyingRemoteRef.current = true;
        onApplyRef.current(normalizedRemoteSession);
        try {
          localStorage.removeItem(pendingStorageKey);
        } catch {
          // Bỏ qua
        }
      }

      // Nạp settlement_data độc lập nếu có (đặt ref TRƯỚC setRoomCode/setRole để useEffect không bắn debounce thừa)
      const normalizedSettlement = normalizeCloudSettlementData(roomData.settlement_data);
      if (normalizedSettlement) {
        lastAppliedSettlementTsRef.current =
          normalizedSettlement.updatedAt || roomData.updated_at;
        lastAppliedRemoteSettlementRef.current = normalizedSettlement;
        awaitingRemoteSettlementHydrationRef.current = !areSettlementDataEqual(
          currentSettlementRef.current,
          normalizedSettlement
        );
        onApplySettlementRef.current?.(normalizedSettlement, assignedRole);
      } else if (assignedRole === 'VIEWER') {
        const empty = createDefaultCloudSettlementData(0);
        lastAppliedSettlementTsRef.current = 0;
        lastAppliedRemoteSettlementRef.current = empty;
        awaitingRemoteSettlementHydrationRef.current = false;
        onApplySettlementRef.current?.(empty, 'VIEWER');
      } else {
        lastAppliedSettlementTsRef.current = 0;
        lastAppliedRemoteSettlementRef.current = null;
        awaitingRemoteSettlementHydrationRef.current = false;
      }

      setRoomCode(cleanCode);
      setPinCode(isCoHost ? roomData.pin_code : null);
      setRole(assignedRole);
      setSyncStatus('SYNCED');
      setErrorMessage(null);

      // Lưu vào localStorage
      try {
        const stored: StoredCloudRoom = {
          roomCode: cleanCode,
          pinCode: isCoHost ? cleanPin : '',
          role: assignedRole,
        };
        localStorage.setItem(STORAGE_KEY_CLOUD_ROOM, JSON.stringify(stored));
      } catch {
        // Bỏ qua
      }

      // A3: Làm sạch URL - chỉ khi joinRoom thành công (res.ok)
      // Xóa room và pin khỏi URL nhưng giữ nguyên các query param khác và hash
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has('room') || url.searchParams.has('pin')) {
            url.searchParams.delete('room');
            url.searchParams.delete('pin');
            const search = url.searchParams.toString();
            const cleanUrl = url.pathname + (search ? `?${search}` : '') + url.hash;
            window.history.replaceState({}, '', cleanUrl);
          }
        } catch {
          // Bỏ qua lỗi parsing trong môi trường test
        }
      }

      if (assignedRole === 'CO_HOST') {
        onToastRef.current?.(`Đã kết nối phòng "${cleanCode}" với quyền CÙNG ĐIỀU KHIỂN (Co-Host)`);
      } else {
        onToastRef.current?.(`Đã vào phòng "${cleanCode}" ở chế độ CHỈ XEM`);
      }

      return { ok: true, role: assignedRole };
    },
    []
  );

  // 2. Đọc phòng đã lưu hoặc tham số URL (?room=...&pin=...) khi khởi động
  // A2: Chạy đúng 1 lần khi mount, guarded bởi hasConnectedInitialRef
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasConnectedInitialRef.current) return;
    hasConnectedInitialRef.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const paramRoom = urlParams.get('room')?.toUpperCase().trim();
    const paramPin = urlParams.get('pin')?.trim();

    if (paramRoom) {
      // Tự động kết nối qua link URL
      joinRoom(paramRoom, paramPin);
      return;
    }

    // Nếu không có URL params, đọc từ localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CLOUD_ROOM);
      if (saved) {
        const parsed = JSON.parse(saved) as StoredCloudRoom;
        if (parsed.roomCode) {
          joinRoom(parsed.roomCode, parsed.pinCode, { isAutoReconnect: true });
        }
      }
    } catch {
      // Bỏ qua lỗi
    }
  }, [joinRoom]);

  // 3. Lắng nghe thay đổi Realtime từ Supabase cho phòng hiện tại
  useEffect(() => {
    if (!roomCode) {
      setSyncStatus('OFFLINE');
      return;
    }

    setSyncStatus('SYNCED');

    const unsubscribe = subscribeToRoom(roomCode, (record) => {
      // A4 (i): Bỏ qua nếu gói tin do chính tab này gửi lên (Anti-Echo Loop)
      if (record.updated_by === clientId) {
        return;
      }

      // Nhánh 1: session_data (chỉ cập nhật khi không pending và dữ liệu thực sự mới & khác)
      if (
        !hasPendingLocalChangeRef.current &&
        record.updated_at > lastAppliedTimestampRef.current &&
        record.session_data &&
        !areSessionSnapshotsEqual(record.session_data, lastAppliedRemoteSnapshotRef.current)
      ) {
        lastAppliedTimestampRef.current = record.updated_at;
        lastAppliedRemoteSnapshotRef.current = record.session_data;
        isApplyingRemoteRef.current = true;

        onApplyRef.current(record.session_data);
        setSyncStatus('SYNCED');
        try {
          localStorage.removeItem(pendingStorageKey);
        } catch {
          // Bỏ qua
        }
      }

      // Nhánh 2: settlement_data độc lập (không chạm session_data hay undoStack)
      if (
        onApplySettlementRef.current &&
        !hasPendingSettlementChangeRef.current &&
        record.settlement_data != null
      ) {
        const normalized = normalizeCloudSettlementData(record.settlement_data);
        if (normalized) {
          const remoteTs = normalized.updatedAt || record.updated_at;
          if (
            remoteTs > lastAppliedSettlementTsRef.current &&
            !areSettlementDataEqual(normalized, lastAppliedRemoteSettlementRef.current)
          ) {
            lastAppliedSettlementTsRef.current = remoteTs;
            lastAppliedRemoteSettlementRef.current = normalized;
            onApplySettlementRef.current(normalized, roleRef.current);
          }
        }
      }

      // Nhánh 3: Đồng bộ mã PIN mới cho Co-Host khác tránh ghi đè PIN cũ khi upsertRoom
      if (
        roleRef.current === 'CO_HOST' &&
        typeof record.pin_code === 'string' &&
        record.pin_code.trim() &&
        record.pin_code.trim() !== pinCodeRef.current
      ) {
        const syncedPin = record.pin_code.trim();
        pinCodeRef.current = syncedPin;
        setPinCode(syncedPin);
        try {
          const stored: StoredCloudRoom = {
            roomCode,
            pinCode: syncedPin,
            role: 'CO_HOST',
          };
          localStorage.setItem(STORAGE_KEY_CLOUD_ROOM, JSON.stringify(stored));
        } catch {
          // Bỏ qua
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [roomCode, clientId]);

  // 4. Đẩy thay đổi cục bộ lên Supabase (Debounce 250ms, chỉ dành cho CO_HOST)
  useEffect(() => {
    if (!roomCode || role !== 'CO_HOST') {
      return;
    }

    // A5: Nếu state hiện tại khớp với snapshot vừa nhận từ xa, không gửi ngược lại
    if (areSessionSnapshotsEqual(currentState, lastAppliedRemoteSnapshotRef.current)) {
      awaitingRemoteSessionHydrationRef.current = false;
      isApplyingRemoteRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      hasPendingLocalChangeRef.current = false;
      setSyncStatus('SYNCED');
      try {
        localStorage.removeItem(pendingStorageKey);
      } catch {
        // Bỏ qua
      }
      return;
    }

    // Hydration Lock: đang chờ React commit state vừa tải từ Cloud, không được đẩy state cũ lên đè Cloud
    if (awaitingRemoteSessionHydrationRef.current) {
      return;
    }

    // Nếu state khác với remote snapshot, đây là thay đổi cục bộ của Host
    isApplyingRemoteRef.current = false;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // A4 (ii): Đánh dấu đang có thay đổi cục bộ chờ đẩy lên cloud
    hasPendingLocalChangeRef.current = true;
    setSyncStatus('SYNCING');
    try {
      localStorage.setItem(
        pendingStorageKey,
        JSON.stringify({ roomCode, updatedAt: Date.now() })
      );
    } catch {
      // Bỏ qua
    }

    debounceTimerRef.current = setTimeout(async () => {
      const now = Date.now();
      try {
        const res = await upsertRoom({
          room_code: roomCode,
          pin_code: pinCode || '1234',
          session_data: currentState,
          updated_at: now,
          updated_by: clientId,
        });

        if (res.error) {
          setSyncStatus('ERROR');
          setErrorMessage(res.error);
        } else {
          lastAppliedTimestampRef.current = now;
          lastAppliedRemoteSnapshotRef.current = currentState;
          setSyncStatus('SYNCED');
          setErrorMessage(null);
          try {
            localStorage.removeItem(pendingStorageKey);
          } catch {
            // Bỏ qua
          }
        }
      } finally {
        hasPendingLocalChangeRef.current = false;
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [currentState, roomCode, role, pinCode, clientId]);

  // 5. Đẩy thay đổi bảng Quyết toán lên Supabase (Debounce 250ms, chỉ dành cho CO_HOST)
  useEffect(() => {
    if (!roomCode || role !== 'CO_HOST' || !currentSettlement) {
      return;
    }

    if (areSettlementDataEqual(currentSettlement, lastAppliedRemoteSettlementRef.current)) {
      awaitingRemoteSettlementHydrationRef.current = false;
      if (settlementDebounceTimerRef.current) {
        clearTimeout(settlementDebounceTimerRef.current);
        settlementDebounceTimerRef.current = null;
      }
      hasPendingSettlementChangeRef.current = false;
      return;
    }

    // Hydration Lock: đang chờ React commit settlement vừa tải từ Cloud, không được đẩy bản trống lên đè Cloud
    if (awaitingRemoteSettlementHydrationRef.current) {
      return;
    }

    if (settlementDebounceTimerRef.current) {
      clearTimeout(settlementDebounceTimerRef.current);
    }

    hasPendingSettlementChangeRef.current = true;
    settlementDebounceTimerRef.current = setTimeout(async () => {
      const now = Date.now();
      const payloadToSync: CloudSettlementData = {
        ...currentSettlement,
        updatedAt: now,
      };
      try {
        const res = await updateRoomSettlementOnly(roomCode, payloadToSync, now, clientId);
        if (res?.error) {
          setSyncStatus('ERROR');
          setErrorMessage(res.error);
        } else {
          lastAppliedSettlementTsRef.current = now;
          lastAppliedRemoteSettlementRef.current = payloadToSync;
          setSyncStatus('SYNCED');
          setErrorMessage(null);
        }
      } finally {
        hasPendingSettlementChangeRef.current = false;
      }
    }, 250);

    return () => {
      if (settlementDebounceTimerRef.current) {
        clearTimeout(settlementDebounceTimerRef.current);
        settlementDebounceTimerRef.current = null;
      }
    };
  }, [currentSettlement, roomCode, role, clientId]);

  // 6. Tạo phòng mới (Host chính)
  const createRoom = useCallback(
    async (
      code: string,
      pin: string,
      stateToSync: BadmintonSessionState,
      settlementToSync?: CloudSettlementData
    ): Promise<{ ok: boolean; error?: string }> => {
      const cleanCode = code.toUpperCase().trim();
      const cleanPin = pin.trim() || '1234';
      const now = Date.now();

      setSyncStatus('SYNCING');
      const existing = await fetchRoom(cleanCode);
      if (
        existing.data &&
        ((existing.data.session_data?.players?.length ?? 0) > 0 ||
          (existing.data.session_data?.history?.length ?? 0) > 0)
      ) {
        setSyncStatus('OFFLINE');
        return {
          ok: false,
          error: `Phòng "${cleanCode}" đã tồn tại và đang có dữ liệu! Vui lòng chuyển sang tab "Vào phòng" để kết nối lại.`,
        };
      }

      const res = await upsertRoom({
        room_code: cleanCode,
        pin_code: cleanPin,
        session_data: stateToSync,
        settlement_data: settlementToSync,
        updated_at: now,
        updated_by: clientId,
      });

      if (res.error) {
        setSyncStatus('ERROR');
        setErrorMessage(res.error);
        return { ok: false, error: res.error };
      }

      setRoomCode(cleanCode);
      setPinCode(cleanPin);
      setRole('CO_HOST');
      setSyncStatus('SYNCED');
      lastAppliedTimestampRef.current = now;
      lastAppliedRemoteSnapshotRef.current = stateToSync;
      if (settlementToSync) {
        lastAppliedSettlementTsRef.current = now;
        lastAppliedRemoteSettlementRef.current = settlementToSync;
      }

      // Lưu trạng thái phòng vào localStorage
      try {
        const stored: StoredCloudRoom = {
          roomCode: cleanCode,
          pinCode: cleanPin,
          role: 'CO_HOST',
        };
        localStorage.setItem(STORAGE_KEY_CLOUD_ROOM, JSON.stringify(stored));
      } catch {
        // Bỏ qua
      }

      onToastRef.current?.(`Đã mở phòng online "${cleanCode}" thành công!`);
      return { ok: true };
    },
    [clientId]
  );

  // 6. Nâng cấp quyền từ VIEWER lên CO_HOST bằng mã PIN
  const upgradeToCoHost = useCallback(
    async (inputPin: string): Promise<{ ok: boolean; error?: string }> => {
      if (!roomCode) return { ok: false, error: 'Chưa vào phòng' };

      const res = await fetchRoom(roomCode);
      if (res.error || !res.data) {
        return { ok: false, error: res.error || 'Lỗi khi kiểm tra phòng' };
      }

      if (inputPin.trim() === res.data.pin_code) {
        setPinCode(res.data.pin_code);
        setRole('CO_HOST');

        // Lưu lại vai trò mới vào localStorage
        try {
          const stored: StoredCloudRoom = {
            roomCode,
            pinCode: res.data.pin_code,
            role: 'CO_HOST',
          };
          localStorage.setItem(STORAGE_KEY_CLOUD_ROOM, JSON.stringify(stored));
        } catch {
          // Bỏ qua
        }

        setShowPinPrompt(false);
        onToastRef.current?.('Mở khóa quyền điều khiển (Co-Host) thành công!');

        // Thực hiện hành động bị chặn trước đó nếu có
        if (pendingActionRef.current) {
          pendingActionRef.current();
          pendingActionRef.current = null;
        }

        return { ok: true };
      }

      return { ok: false, error: 'Mã PIN không chính xác! Vui lòng thử lại.' };
    },
    [roomCode]
  );

  // 7. Rời khỏi phòng (quay về Offline / LocalStorage)
  const leaveRoom = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (settlementDebounceTimerRef.current) {
      clearTimeout(settlementDebounceTimerRef.current);
      settlementDebounceTimerRef.current = null;
    }

    // Flush thay đổi cục bộ đang chờ debounce trước khi ngắt kết nối (tránh mất thao tác vừa làm trước lúc Rời phòng)
    if (roleRef.current === 'CO_HOST' && roomCodeRef.current) {
      const flushTs = Date.now();
      if (
        hasPendingLocalChangeRef.current &&
        !awaitingRemoteSessionHydrationRef.current
      ) {
        void upsertRoom({
          room_code: roomCodeRef.current,
          pin_code: pinCodeRef.current || '1234',
          session_data: currentStateRef.current,
          updated_at: flushTs,
          updated_by: clientId,
        });
      }
      if (
        hasPendingSettlementChangeRef.current &&
        !awaitingRemoteSettlementHydrationRef.current &&
        currentSettlementRef.current
      ) {
        void updateRoomSettlementOnly(
          roomCodeRef.current,
          { ...currentSettlementRef.current, updatedAt: flushTs },
          flushTs,
          clientId
        );
      }
    }

    awaitingRemoteSessionHydrationRef.current = false;
    awaitingRemoteSettlementHydrationRef.current = false;
    hasPendingLocalChangeRef.current = false;
    hasPendingSettlementChangeRef.current = false;
    lastAppliedSettlementTsRef.current = 0;
    lastAppliedRemoteSettlementRef.current = null;
    setRoomCode(null);
    setPinCode(null);
    setRole('OFFLINE');
    setSyncStatus('OFFLINE');
    setErrorMessage(null);

    try {
      localStorage.removeItem(STORAGE_KEY_CLOUD_ROOM);
      localStorage.removeItem(pendingStorageKey);
      localStorage.removeItem(STORAGE_KEY_OFFLINE_BACKUP);
    } catch {
      // Bỏ qua
    }

    // Cách ly dữ liệu phòng đồng nhất cho cả Host (CO_HOST) & Viewer:
    // Rời phòng là đưa máy về phiên trống sạch (dữ liệu phòng trên Cloud vẫn giữ nguyên).
    isApplyingRemoteRef.current = true;
    onApplyRef.current(createInitialSessionState());
    onApplySettlementRef.current?.(createDefaultCloudSettlementData(0), 'OFFLINE');

    // Xóa param ?room= khỏi URL mà không reload trang
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        url.searchParams.delete('pin');
        const search = url.searchParams.toString();
        const cleanUrl = url.pathname + (search ? `?${search}` : '') + url.hash;
        window.history.replaceState({}, '', cleanUrl);
      } catch {
        // Bỏ qua lỗi
      }
    }

    onToastRef.current?.('Đã ngắt kết nối phòng online. Quay về chế độ máy đơn.');
  }, []);

  // 7b. Host CLB đã mở khóa → tự có quyền Host Sân trên phòng gắn CLB (không cần nhập lại PIN phòng).
  // Chỉ nâng role phiên hiện tại; KHÔNG chạm vào cơ chế hydration/ref guard.
  const grantHostFromClub = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const targetRoom = roomCodeRef.current;
    if (!targetRoom) return { ok: false, error: 'Chưa vào phòng' };
    if (roleRef.current === 'CO_HOST') return { ok: true };

    const res = await fetchRoom(targetRoom);
    if (res.error || !res.data) {
      return { ok: false, error: res.error || 'Lỗi khi kiểm tra phòng' };
    }
    if (roomCodeRef.current !== targetRoom) return { ok: false, error: 'Đã đổi phòng' };

    pinCodeRef.current = res.data.pin_code;
    setPinCode(res.data.pin_code);
    setRole('CO_HOST');
    try {
      const stored: StoredCloudRoom = {
        roomCode: targetRoom,
        pinCode: res.data.pin_code,
        role: 'CO_HOST',
      };
      localStorage.setItem(STORAGE_KEY_CLOUD_ROOM, JSON.stringify(stored));
    } catch {
      // Bỏ qua
    }
    setShowPinPrompt(false);
    onToastRef.current?.(`Host CLB: đã mở quyền Host Sân cho phòng "${targetRoom}"`);
    return { ok: true };
  }, [setShowPinPrompt]);

  // 7c. Chuyển sang chế độ Xem: hạ phiên hiện tại xuống VIEWER + xóa cache PIN đã mở khóa,
  // KHÔNG rời phòng và KHÔNG xóa dữ liệu hiện tại.
  const downgradeToViewer = useCallback(() => {
    const currentRoom = roomCodeRef.current;
    if (!currentRoom || roleRef.current !== 'CO_HOST') return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (settlementDebounceTimerRef.current) {
      clearTimeout(settlementDebounceTimerRef.current);
      settlementDebounceTimerRef.current = null;
    }

    // Đẩy nốt thay đổi đang chờ debounce trước khi mất quyền ghi
    const flushTs = Date.now();
    if (hasPendingLocalChangeRef.current && !awaitingRemoteSessionHydrationRef.current) {
      lastAppliedTimestampRef.current = flushTs;
      lastAppliedRemoteSnapshotRef.current = currentStateRef.current;
      void upsertRoom({
        room_code: currentRoom,
        pin_code: pinCodeRef.current || '1234',
        session_data: currentStateRef.current,
        updated_at: flushTs,
        updated_by: clientId,
      });
    }
    if (
      hasPendingSettlementChangeRef.current &&
      !awaitingRemoteSettlementHydrationRef.current &&
      currentSettlementRef.current
    ) {
      lastAppliedSettlementTsRef.current = flushTs;
      lastAppliedRemoteSettlementRef.current = {
        ...currentSettlementRef.current,
        updatedAt: flushTs,
      };
      void updateRoomSettlementOnly(
        currentRoom,
        { ...currentSettlementRef.current, updatedAt: flushTs },
        flushTs,
        clientId
      );
    }
    hasPendingLocalChangeRef.current = false;
    hasPendingSettlementChangeRef.current = false;

    pinCodeRef.current = null;
    setPinCode(null);
    setRole('VIEWER');
    try {
      const stored: StoredCloudRoom = { roomCode: currentRoom, pinCode: '', role: 'VIEWER' };
      localStorage.setItem(STORAGE_KEY_CLOUD_ROOM, JSON.stringify(stored));
      localStorage.removeItem(pendingStorageKey);
    } catch {
      // Bỏ qua
    }
    onToastRef.current?.('Đã chuyển sang chế độ Xem. Muốn điều khiển lại cần nhập PIN.');
  }, [clientId, pendingStorageKey]);

  // 8. Chặn hành động sửa đổi nếu chỉ ở quyền VIEWER (Action Guard)
  const guardAction = useCallback(
    (actionFn: () => void) => {
      if (role === 'VIEWER') {
        pendingActionRef.current = actionFn;
        setShowPinPrompt(true);
        return;
      }
      actionFn();
    },
    [role]
  );

  // 9. Thành viên (VIEWER) báo "Tôi đã chuyển" (chỉ cập nhật 1 entry PENDING_REVIEW qua updateRoomSettlementOnly)
  const reportPlayerPayment = useCallback(
    async (
      playerId: string,
      options?: { receiptUrl?: string; receiptPath?: string }
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!roomCode) {
        return { ok: false, error: 'Chưa kết nối phòng Online' };
      }

      const res = await fetchRoom(roomCode);
      if (res.error || !res.data) {
        const err = res.error || 'Không thể tải trạng thái phòng mới nhất';
        onToastRef.current?.(err);
        return { ok: false, error: err };
      }

      const latest =
        normalizeCloudSettlementData(res.data.settlement_data) ??
        currentSettlementRef.current ??
        createDefaultCloudSettlementData(0);

      if (latest.payments[playerId]?.status === 'PAID') {
        lastAppliedRemoteSettlementRef.current = latest;
        lastAppliedSettlementTsRef.current = latest.updatedAt || res.data.updated_at;
        onApplySettlementRef.current?.(latest, roleRef.current);
        onToastRef.current?.('Thành viên này đã được Chủ sân xác nhận đã đóng rồi!');
        return { ok: true };
      }

      const now = Date.now();
      const nextRec: PlayerPaymentRecord = {
        status: 'PENDING_REVIEW',
        reportedAt: now,
      };
      if (options?.receiptUrl) {
        nextRec.receiptUrl = options.receiptUrl;
      }
      if (options?.receiptPath) {
        nextRec.receiptPath = options.receiptPath;
      }

      const merged: CloudSettlementData = {
        settings: latest.settings,
        payments: {
          ...latest.payments,
          [playerId]: nextRec,
        },
        betPayments: latest.betPayments || {},
        updatedAt: now,
      };

      hasPendingSettlementChangeRef.current = true;
      try {
        const upd = await updateRoomSettlementOnly(roomCode, merged, now, clientId);
        if (upd?.error) {
          onToastRef.current?.(upd.error);
          return { ok: false, error: upd.error };
        }
        lastAppliedSettlementTsRef.current = now;
        lastAppliedRemoteSettlementRef.current = merged;
        onApplySettlementRef.current?.(merged, roleRef.current);
        onToastRef.current?.('Đã báo chuyển khoản! Chờ Chủ sân duyệt.');
        return { ok: true };
      } finally {
        hasPendingSettlementChangeRef.current = false;
      }
    },
    [roomCode, clientId]
  );

  // 10. Đổi mã PIN phòng sau khi đã tạo (chỉ dành cho CO_HOST)
  const updateRoomPin = useCallback(
    async (newPin: string): Promise<{ ok: boolean; error?: string }> => {
      if (!roomCode || role !== 'CO_HOST') {
        return { ok: false, error: 'Chỉ Chủ sân hoặc Co-Host mới có quyền đổi mã PIN.' };
      }

      const cleanPin = newPin.trim();
      if (cleanPin.length < 4 || cleanPin.length > 6) {
        return { ok: false, error: 'Mã PIN phải từ 4 đến 6 ký tự.' };
      }

      const now = Date.now();
      const res = await updateRoomPinOnly(roomCode, cleanPin, now, clientId);
      if (res?.error) {
        return { ok: false, error: res.error };
      }

      lastAppliedTimestampRef.current = now;
      pinCodeRef.current = cleanPin;
      setPinCode(cleanPin);

      try {
        const stored: StoredCloudRoom = {
          roomCode,
          pinCode: cleanPin,
          role: 'CO_HOST',
        };
        localStorage.setItem(STORAGE_KEY_CLOUD_ROOM, JSON.stringify(stored));
      } catch {
        // Bỏ qua
      }

      onToastRef.current?.(`Đã đổi mã PIN phòng "${roomCode}" thành công!`);
      return { ok: true };
    },
    [roomCode, role, clientId]
  );

  return {
    roomCode,
    pinCode,
    role,
    syncStatus,
    errorMessage,
    showPinPrompt,
    setShowPinPrompt,
    createRoom,
    joinRoom,
    upgradeToCoHost,
    grantHostFromClub,
    downgradeToViewer,
    leaveRoom,
    guardAction,
    reportPlayerPayment,
    updateRoomPin,
  };
}
