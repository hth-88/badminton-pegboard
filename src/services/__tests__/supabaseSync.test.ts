import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  serializeForCloud,
  getClientId,
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  STORAGE_KEY_SUPABASE_CONFIG,
  type BadmintonRoomRecord,
} from '../supabaseSync';
import { createInitialSessionState } from '../../engine/sessionReducer';
import type { BadmintonSessionSnapshot, BadmintonSessionState } from '../../types/badminton';

describe('Supabase Realtime Cloud Sync Service', () => {
  const mockLocal: Record<string, string> = {};
  const mockSession: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(mockLocal)) delete mockLocal[k];
    for (const k of Object.keys(mockSession)) delete mockSession[k];

    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => mockLocal[k] ?? null,
        setItem: (k: string, v: string) => {
          mockLocal[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockLocal[k];
        },
        clear: () => {
          for (const k of Object.keys(mockLocal)) delete mockLocal[k];
        },
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: (k: string) => mockSession[k] ?? null,
        setItem: (k: string, v: string) => {
          mockSession[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockSession[k];
        },
        clear: () => {
          for (const k of Object.keys(mockSession)) delete mockSession[k];
        },
      },
      writable: true,
      configurable: true,
    });

    vi.clearAllMocks();
  });

  describe('serializeForCloud', () => {
    it('loại bỏ toàn bộ undoStack và redoStack để giảm dung lượng gói tin dưới 10KB', () => {
      const state = createInitialSessionState();
      // Giả lập state có lịch sử undo/redo lớn
      const snap1: BadmintonSessionSnapshot = { ...state };
      const snap2: BadmintonSessionSnapshot = { ...state, mixDebt: { doubles: 2, singles: 0 } };
      const snap3: BadmintonSessionSnapshot = { ...state, mixDebt: { doubles: 3, singles: 0 } };
      const snap4: BadmintonSessionSnapshot = { ...state, mixDebt: { doubles: 4, singles: 0 } };

      const populatedState: BadmintonSessionState = {
        ...state,
        undoStack: [snap1, snap2, snap3],
        redoStack: [snap4],
      };

      expect(populatedState.undoStack.length).toBe(3);
      expect(populatedState.redoStack.length).toBe(1);

      const serialized = serializeForCloud(populatedState);

      // undoStack và redoStack phải rỗng
      expect(serialized.undoStack).toEqual([]);
      expect(serialized.redoStack).toEqual([]);

      // Các trường dữ liệu cốt lõi khác phải giữ nguyên 100%
      expect(serialized.players).toEqual(populatedState.players);
      expect(serialized.courts).toEqual(populatedState.courts);
      expect(serialized.history).toEqual(populatedState.history);
      expect(serialized.pairRules).toEqual(populatedState.pairRules);
      expect(serialized.settings).toEqual(populatedState.settings);
      expect(serialized.stats).toEqual(populatedState.stats);
      expect(serialized.mixDebt).toBe(populatedState.mixDebt);

      // Không làm thay đổi (mutate) state gốc ban đầu
      expect(populatedState.undoStack.length).toBe(3);
      expect(populatedState.redoStack.length).toBe(1);
    });
  });

  describe('getClientId', () => {
    it('tạo Client ID duy nhất và lưu vào sessionStorage để tái sử dụng', () => {
      const id1 = getClientId();
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);

      // Lần gọi tiếp theo trong cùng tab/phiên phải trả về đúng ID đó
      const id2 = getClientId();
      expect(id2).toBe(id1);
      expect(mockSession['badminton_client_id']).toBe(id1);
    });

    it('đọc đúng Client ID đã tồn tại sẵn trong sessionStorage', () => {
      const customId = 'client_existing_tab_999';
      mockSession['badminton_client_id'] = customId;

      const retrieved = getClientId();
      expect(retrieved).toBe(customId);
    });
  });

  describe('Supabase Configuration Storage', () => {
    it('lưu và đọc cấu hình Supabase từ localStorage', () => {
      expect(getSupabaseConfig()).toBeNull();

      const config = {
        url: 'https://test-project.supabase.co',
        anonKey: 'anon-test-key-123456',
      };

      saveSupabaseConfig(config);

      const loaded = getSupabaseConfig();
      expect(loaded).toEqual({
        url: 'https://test-project.supabase.co',
        anonKey: 'anon-test-key-123456',
      });
    });

    it('tự động cắt khoảng trắng thừa (trim) trong URL và Key', () => {
      mockLocal[STORAGE_KEY_SUPABASE_CONFIG] = JSON.stringify({
        url: '  https://test-project.supabase.co/  ',
        anonKey: '  anon-key-with-spaces  ',
      });

      const loaded = getSupabaseConfig();
      expect(loaded).toEqual({
        url: 'https://test-project.supabase.co/',
        anonKey: 'anon-key-with-spaces',
      });
    });

    it('clearSupabaseConfig xóa sạch cấu hình khỏi localStorage', () => {
      saveSupabaseConfig({
        url: 'https://test.supabase.co',
        anonKey: 'test-key',
      });
      expect(getSupabaseConfig()).not.toBeNull();

      clearSupabaseConfig();
      expect(getSupabaseConfig()).toBeNull();
      expect(mockLocal[STORAGE_KEY_SUPABASE_CONFIG]).toBeUndefined();
    });

    it('xử lý an toàn khi localStorage chứa JSON hỏng', () => {
      mockLocal[STORAGE_KEY_SUPABASE_CONFIG] = 'INVALID_JSON_CORRUPTED';
      expect(getSupabaseConfig()).toBeNull();
    });
  });

  describe('Anti-Echo & Out-of-Order Packet Filtering Logic', () => {
    it('bộ lọc Anti-Echo bỏ qua gói tin do chính tab này gửi lên', () => {
      const currentClientId = 'my_tab_client_123';
      const lastAppliedTimestamp = 1000;
      let applied = false;

      const handleRemotePacket = (record: BadmintonRoomRecord) => {
        // Kiểm tra 1: Anti-Echo
        if (record.updated_by === currentClientId) {
          return;
        }
        // Kiểm tra 2: Out-of-Order
        if (record.updated_at <= lastAppliedTimestamp) {
          return;
        }
        applied = true;
      };

      // Gói tin phản xạ từ chính mình
      const echoRecord: BadmintonRoomRecord = {
        room_code: 'SAN-88',
        pin_code: '1234',
        session_data: createInitialSessionState(),
        updated_at: 2000,
        updated_by: currentClientId,
      };

      handleRemotePacket(echoRecord);
      expect(applied).toBe(false);

      // Gói tin từ máy khác gửi lên
      const remoteRecord: BadmintonRoomRecord = {
        room_code: 'SAN-88',
        pin_code: '1234',
        session_data: createInitialSessionState(),
        updated_at: 2000,
        updated_by: 'other_phone_client_456',
      };

      handleRemotePacket(remoteRecord);
      expect(applied).toBe(true);
    });

    it('bộ lọc Out-of-Order bỏ qua gói tin cũ hơn bản ghi mới nhất đã nhận', () => {
      const currentClientId = 'my_tab_client_123';
      let lastAppliedTimestamp = 5000;
      let appliedCount = 0;

      const handleRemotePacket = (record: BadmintonRoomRecord) => {
        if (record.updated_by === currentClientId) return;
        if (record.updated_at <= lastAppliedTimestamp) return;

        lastAppliedTimestamp = record.updated_at;
        appliedCount++;
      };

      // Gói tin cũ hơn (timestamp = 4000 <= 5000)
      handleRemotePacket({
        room_code: 'SAN-88',
        pin_code: '1234',
        session_data: createInitialSessionState(),
        updated_at: 4000,
        updated_by: 'phone_host_2',
      });
      expect(appliedCount).toBe(0);

      // Gói tin bằng timestamp hiện tại (timestamp = 5000 <= 5000)
      handleRemotePacket({
        room_code: 'SAN-88',
        pin_code: '1234',
        session_data: createInitialSessionState(),
        updated_at: 5000,
        updated_by: 'phone_host_2',
      });
      expect(appliedCount).toBe(0);

      // Gói tin mới hơn hợp lệ (timestamp = 6000 > 5000)
      handleRemotePacket({
        room_code: 'SAN-88',
        pin_code: '1234',
        session_data: createInitialSessionState(),
        updated_at: 6000,
        updated_by: 'phone_host_2',
      });
      expect(appliedCount).toBe(1);
      expect(lastAppliedTimestamp).toBe(6000);
    });
  });

  describe('Viewer Guard Logic', () => {
    it('chặn hành động khi ở vai trò VIEWER và kích hoạt prompt PIN', () => {
      let role: 'VIEWER' | 'CO_HOST' | 'OFFLINE' = 'VIEWER';
      let showPinPrompt = false;
      let actionExecuted = false;
      let pendingAction: (() => void) | null = null;

      const guardAction = (actionFn: () => void) => {
        if (role === 'VIEWER') {
          pendingAction = actionFn;
          showPinPrompt = true;
          return;
        }
        actionFn();
      };

      const dangerousAction = () => {
        actionExecuted = true;
      };

      // Gọi action khi đang là VIEWER
      guardAction(dangerousAction);
      expect(actionExecuted).toBe(false);
      expect(showPinPrompt).toBe(true);
      expect(pendingAction).not.toBeNull();

      // Giả lập nhập mã PIN chính xác -> nâng cấp lên CO_HOST
      role = 'CO_HOST';
      if (pendingAction) {
        (pendingAction as () => void)();
        pendingAction = null;
      }

      expect(actionExecuted).toBe(true);

      // Lần sau ở quyền CO_HOST -> thực thi ngay lập tức mà không chặn
      actionExecuted = false;
      guardAction(dangerousAction);
      expect(actionExecuted).toBe(true);
    });
  });
});
