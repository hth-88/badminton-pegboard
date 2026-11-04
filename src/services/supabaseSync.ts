import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { BadmintonSessionState } from '../types/badminton';

export const STORAGE_KEY_SUPABASE_CONFIG = 'badminton_supabase_config';
export const STORAGE_KEY_CLOUD_ROOM = 'badminton_cloud_room';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface StoredCloudRoom {
  roomCode: string;
  pinCode: string;
  role: 'VIEWER' | 'CO_HOST';
}

export interface BadmintonRoomRecord {
  room_code: string;
  pin_code: string;
  session_data: BadmintonSessionState;
  settlement_data?: any;
  updated_at: number;
  updated_by: string;
}

/**
 * Đọc cấu hình Supabase từ localStorage hoặc biến môi trường .env
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_SUPABASE_CONFIG);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.url && parsed.anonKey) {
          return {
            url: parsed.url.trim(),
            anonKey: parsed.anonKey.trim(),
          };
        }
      }
    }
  } catch {
    // Bỏ qua lỗi parse
  }

  // Fallback từ import.meta.env
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envKey) {
    return {
      url: String(envUrl).trim(),
      anonKey: String(envKey).trim(),
    };
  }

  return null;
}

/**
 * Lưu cấu hình Supabase vào localStorage
 */
export function saveSupabaseConfig(config: SupabaseConfig): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_SUPABASE_CONFIG, JSON.stringify(config));
    // Reset cache client
    cachedClient = null;
    cachedConfigKey = '';
  } catch (err) {
    console.error('Không thể lưu cấu hình Supabase:', err);
  }
}

/**
 * Xóa cấu hình Supabase khỏi localStorage
 */
export function clearSupabaseConfig(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_SUPABASE_CONFIG);
    cachedClient = null;
    cachedConfigKey = '';
  } catch (err) {
    console.error('Không thể xóa cấu hình Supabase:', err);
  }
}

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

/**
 * Khởi tạo hoặc lấy Supabase Client đã được cache
 */
export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config?.url || !config?.anonKey) {
    cachedClient = null;
    cachedConfigKey = '';
    return null;
  }

  const key = `${config.url}::${config.anonKey}`;
  if (cachedClient && cachedConfigKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedConfigKey = key;
    return cachedClient;
  } catch (err) {
    console.error('Không thể khởi tạo Supabase Client:', err);
    return null;
  }
}

/**
 * Sinh và lưu Client ID duy nhất cho mỗi tab trình duyệt (chống Anti-Echo Loop)
 */
export function getClientId(): string {
  if (typeof sessionStorage === 'undefined') {
    return 'client_test_env';
  }
  let id = sessionStorage.getItem('badminton_client_id');
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('badminton_client_id', id);
  }
  return id;
}

/**
 * 2.1. Tối ưu gói tin JSON gửi lên Cloud:
 * Loại bỏ toàn bộ undoStack và redoStack để gói tin luôn nhẹ < 10KB,
 * đồng bộ cực nhanh dưới 200ms trên sóng 4G/Wifi sân cầu lông.
 */
export function serializeForCloud(state: BadmintonSessionState): BadmintonSessionState {
  return {
    ...state,
    undoStack: [],
    redoStack: [],
  };
}

/**
 * Tải thông tin phòng từ Supabase
 */
export async function fetchRoom(
  roomCode: string
): Promise<{ data: BadmintonRoomRecord | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: null, error: 'Chưa cấu hình Supabase URL & Anon Key' };
  }

  try {
    const cleanCode = roomCode.toUpperCase().trim();
    const { data, error } = await supabase
      .from('badminton_rooms')
      .select('*')
      .eq('room_code', cleanCode)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data as BadmintonRoomRecord | null, error: null };
  } catch (err: any) {
    return { data: null, error: err?.message || 'Lỗi khi tải phòng từ Supabase' };
  }
}

/**
 * Lưu / cập nhật phòng lên Supabase
 */
export async function upsertRoom(
  record: BadmintonRoomRecord
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { error: 'Chưa cấu hình Supabase URL & Anon Key' };
  }

  try {
    const cleanCode = record.room_code.toUpperCase().trim();
    const payload = {
      ...record,
      room_code: cleanCode,
      session_data: serializeForCloud(record.session_data),
    };

    const { error } = await supabase
      .from('badminton_rooms')
      .upsert(payload, { onConflict: 'room_code' });

    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch (err: any) {
    return { error: err?.message || 'Lỗi khi đồng bộ phòng lên Supabase' };
  }
}

/**
 * Lắng nghe thay đổi Realtime của phòng từ Supabase
 */
export function subscribeToRoom(
  roomCode: string,
  onRemoteChange: (record: BadmintonRoomRecord) => void
): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const cleanCode = roomCode.toUpperCase().trim();
  const channelName = `room_${cleanCode}_${Math.random().toString(36).slice(2, 7)}`;

  const channel: RealtimeChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'badminton_rooms',
        filter: `room_code=eq.${cleanCode}`,
      },
      (payload) => {
        if (payload.new && typeof payload.new === 'object') {
          onRemoteChange(payload.new as BadmintonRoomRecord);
        }
      }
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // Bỏ qua lỗi dọn dẹp
    }
  };
}

