import { useCallback, useEffect, useRef, useState } from 'react';
import type { BadmintonSessionState } from '../types/badminton';
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
  const lastAppliedTimestampRef = useRef<number>(0);
  const isApplyingRemoteRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  // 1. Vào phòng có sẵn (Viewer hoặc Co-Host)
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
      isApplyingRemoteRef.current = true;
      onApplyCloudState(roomData.session_data);

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

      if (assignedRole === 'CO_HOST') {
        onShowToast?.(`Đã kết nối phòng "${cleanCode}" với quyền CÙNG ĐIỀU KHIỂN (Co-Host)`);
      } else {
        onShowToast?.(`Đã vào phòng "${cleanCode}" ở chế độ CHỈ XEM`);
      }

      return { ok: true, role: assignedRole };
    },
    [onApplyCloudState, onShowToast]
  );

  // 2. Đọc phòng đã lưu hoặc tham số URL (?room=...&pin=...) khi khởi động
  useEffect(() => {
    if (typeof window === 'undefined') return;

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

  // 2. Lắng nghe thay đổi Realtime từ Supabase cho phòng hiện tại
  useEffect(() => {
    if (!roomCode) {
      setSyncStatus('OFFLINE');
      return;
    }

    setSyncStatus('SYNCED');

    const unsubscribe = subscribeToRoom(roomCode, (record) => {
      // Kiểm tra 1: Bỏ qua nếu gói tin do chính tab này gửi lên (Anti-Echo Loop)
      if (record.updated_by === clientId) {
        return;
      }

      // Kiểm tra 2: Bỏ qua nếu gói tin cũ hơn bản ghi mới nhất đã nạp
      if (record.updated_at <= lastAppliedTimestampRef.current) {
        return;
      }

      // Đánh dấu thời điểm và cờ nạp từ xa
      lastAppliedTimestampRef.current = record.updated_at;
      isApplyingRemoteRef.current = true;

      // Nạp dữ liệu vào state thông qua callback
      onApplyCloudState(record.session_data);
      setSyncStatus('SYNCED');
    });

    return () => {
      unsubscribe();
    };
  }, [roomCode, clientId, onApplyCloudState]);

  // 3. Đẩy thay đổi cục bộ lên Supabase (Debounce 250ms, chỉ dành cho CO_HOST)
  useEffect(() => {
    if (!roomCode || role !== 'CO_HOST') {
      return;
    }

    // Nếu thay đổi này vừa được nạp từ máy khác qua realtime, không gửi ngược lại
    if (isApplyingRemoteRef.current) {
      isApplyingRemoteRef.current = false;
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setSyncStatus('SYNCING');

    debounceTimerRef.current = setTimeout(async () => {
      const now = Date.now();
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
        setSyncStatus('SYNCED');
        setErrorMessage(null);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentState, roomCode, role, pinCode, clientId]);

  // 4. Tạo phòng mới (Host chính)
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

      onShowToast?.(`Đã mở phòng online "${cleanCode}" thành công!`);
      return { ok: true };
    },
    [clientId, onShowToast]
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
        onShowToast?.('Mở khóa quyền điều khiển (Co-Host) thành công!');

        // Thực hiện hành động bị chặn trước đó nếu có
        if (pendingActionRef.current) {
          pendingActionRef.current();
          pendingActionRef.current = null;
        }

        return { ok: true };
      }

      return { ok: false, error: 'Mã PIN không chính xác! Vui lòng thử lại.' };
    },
    [roomCode, onShowToast]
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
    if (typeof window !== 'undefined' && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      url.searchParams.delete('pin');
      window.history.replaceState({}, '', url.toString());
    }

    onShowToast?.('Đã ngắt kết nối phòng online. Quay về chế độ máy đơn.');
  }, [onShowToast]);

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
