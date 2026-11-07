import { useCallback, useEffect, useRef, useState } from 'react';
import type { BadmintonSessionSnapshot, BadmintonSessionState } from '../types/badminton';
import {
  fetchRoom,
  getClientId,
  STORAGE_KEY_CLOUD_ROOM,
  type StoredCloudRoom,
  subscribeToRoom,
  upsertRoom,
} from '../services/supabaseSync';

export type RoomRole = 'OFFLINE' | 'VIEWER' | 'CO_HOST';
export type SyncStatus = 'OFFLINE' | 'IDLE' | 'SYNCING' | 'SYNCED' | 'ERROR';

interface UseCloudRoomProps {
  currentState: BadmintonSessionState;
  onApplyCloudState: (newState: BadmintonSessionState) => void;
  onShowToast?: (message: string) => void;
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
    if (cA.id !== cB.id || cA.isActive !== cB.isActive || cA.policy !== cB.policy) return false;
    if (cA.forcedType !== cB.forcedType) return false;
    if (cA.suggestCursor !== cB.suggestCursor) return false;

    // currentMatch
    if (Boolean(cA.currentMatch) !== Boolean(cB.currentMatch)) return false;
    if (cA.currentMatch && cB.currentMatch) {
      if (cA.currentMatch.id !== cB.currentMatch.id) return false;
      if (cA.currentMatch.team1?.join(',') !== cB.currentMatch.team1?.join(',')) return false;
      if (cA.currentMatch.team2?.join(',') !== cB.currentMatch.team2?.join(',')) return false;
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
      pA.status !== pB.status ||
      pA.rank !== pB.rank ||
      pA.gamesPlayed !== pB.gamesPlayed ||
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
    a.settings?.matchMix?.doubles !== b.settings?.matchMix?.doubles ||
    a.settings?.matchMix?.singles !== b.settings?.matchMix?.singles
  ) {
    return false;
  }

  return true;
}

export function useCloudRoom({
  currentState,
  onApplyCloudState,
  onShowToast,
}: UseCloudRoomProps) {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [pinCode, setPinCode] = useState<string | null>(null);
  const [role, setRole] = useState<RoomRole>('OFFLINE');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('OFFLINE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPinPrompt, setShowPinPrompt] = useState<boolean>(false);

  const [clientId] = useState<string>(() => getClientId());

  // A1: Lưu callback vào Ref để tham chiếu luôn ổn định và không làm đổi joinRoom/effects
  const onApplyRef = useRef(onApplyCloudState);
  onApplyRef.current = onApplyCloudState;

  const onToastRef = useRef(onShowToast);
  onToastRef.current = onShowToast;

  // A2: Cờ guard kết nối khởi động đúng 1 lần
  const hasConnectedInitialRef = useRef<boolean>(false);

  // A4 (ii): Cờ đánh dấu có thay đổi local đang pending hoặc đang bay lên cloud
  const hasPendingLocalChangeRef = useRef<boolean>(false);

  const lastAppliedTimestampRef = useRef<number>(0);
  const lastAppliedRemoteSnapshotRef = useRef<BadmintonSessionSnapshot | BadmintonSessionState | null>(null);
  const isApplyingRemoteRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  // 1. Vào phòng có sẵn (Viewer hoặc Co-Host)
  // A1: joinRoom có tham chiếu ổn định tuyệt đối (deps = [])
  const joinRoom = useCallback(
    async (
      code: string,
      pin?: string
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

      // Nạp dữ liệu phòng vào ứng dụng
      lastAppliedTimestampRef.current = roomData.updated_at;
      lastAppliedRemoteSnapshotRef.current = roomData.session_data;
      isApplyingRemoteRef.current = true;
      onApplyRef.current(roomData.session_data);

      setRoomCode(cleanCode);
      setPinCode(roomData.pin_code);
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
          joinRoom(parsed.roomCode, parsed.pinCode);
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
      // A4 (ii): Bỏ qua nếu đang có thay đổi local chưa đẩy lên Supabase (hoặc đang bay)
      // Last-write-wins: Nếu đang có thay đổi local chưa đẩy lên Supabase (hoặc đang bay),
      // bỏ qua snapshot từ xa để tránh đè mất thao tác vừa bấm. Lưu ý: 2 Co-Host cùng chỉnh sửa đồng thời
      // vẫn có thể ghi đè nếu thao tác sát giờ nhau, chấp nhận được cho app cầu lông này.
      if (hasPendingLocalChangeRef.current) {
        return;
      }

      // A4 (i): Bỏ qua nếu gói tin do chính tab này gửi lên (Anti-Echo Loop)
      if (record.updated_by === clientId) {
        return;
      }

      // A4 (i): Bỏ qua nếu gói tin cũ hơn bản ghi mới nhất đã nạp
      if (record.updated_at <= lastAppliedTimestampRef.current) {
        return;
      }

      // Đánh dấu thời điểm và ghi nhận snapshot từ xa
      lastAppliedTimestampRef.current = record.updated_at;
      lastAppliedRemoteSnapshotRef.current = record.session_data;
      isApplyingRemoteRef.current = true;

      // Nạp dữ liệu vào state thông qua ref callback
      onApplyRef.current(record.session_data);
      setSyncStatus('SYNCED');
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
      isApplyingRemoteRef.current = false;
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
        }
      } finally {
        hasPendingLocalChangeRef.current = false;
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentState, roomCode, role, pinCode, clientId]);

  // 5. Tạo phòng mới (Host chính)
  const createRoom = useCallback(
    async (
      code: string,
      pin: string,
      stateToSync: BadmintonSessionState
    ): Promise<{ ok: boolean; error?: string }> => {
      const cleanCode = code.toUpperCase().trim();
      const cleanPin = pin.trim() || '1234';
      const now = Date.now();

      setSyncStatus('SYNCING');
      const res = await upsertRoom({
        room_code: cleanCode,
        pin_code: cleanPin,
        session_data: stateToSync,
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
    setRoomCode(null);
    setPinCode(null);
    setRole('OFFLINE');
    setSyncStatus('OFFLINE');
    setErrorMessage(null);

    try {
      localStorage.removeItem(STORAGE_KEY_CLOUD_ROOM);
    } catch {
      // Bỏ qua
    }

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
    leaveRoom,
    guardAction,
  };
}
