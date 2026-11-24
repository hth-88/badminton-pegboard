import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { CloudSettlementData } from '../engine/settlement';
import type { BadmintonSessionState } from '../types/badminton';

export const STORAGE_KEY_SUPABASE_CONFIG = 'badminton_supabase_config';
export const STORAGE_KEY_CLOUD_ROOM = 'badminton_cloud_room';
export const RECEIPT_STORAGE_BUCKET = 'payment-receipts';

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
  settlement_data?: CloudSettlementData | null;
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

  // Fallback từ import.meta.env (hỗ trợ cả VITE_ và biến tự động từ Vercel Supabase Integration)
  const envUrl =
    (import.meta as any).env?.VITE_SUPABASE_URL ||
    (import.meta as any).env?.SUPABASE_URL ||
    (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_URL;

  const envKey =
    (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
    (import.meta as any).env?.SUPABASE_ANON_KEY ||
    (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
    const payload: Record<string, unknown> = {
      room_code: cleanCode,
      pin_code: record.pin_code,
      session_data: serializeForCloud(record.session_data),
      updated_at: record.updated_at,
      updated_by: record.updated_by,
    };
    if (record.settlement_data !== undefined) {
      payload.settlement_data = record.settlement_data;
    }

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
 * Chỉ cập nhật cột settlement_data (không chạm session_data hay pin_code)
 */
export async function updateRoomSettlementOnly(
  roomCode: string,
  settlementData: CloudSettlementData,
  updatedAt: number,
  updatedBy: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { error: 'Chưa cấu hình Supabase URL & Anon Key' };
  }

  try {
    const cleanCode = roomCode.toUpperCase().trim();
    const { error } = await supabase
      .from('badminton_rooms')
      .update({
        settlement_data: settlementData,
        updated_at: updatedAt,
        updated_by: updatedBy,
      })
      .eq('room_code', cleanCode);

    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch (err: any) {
    return { error: err?.message || 'Lỗi khi cập nhật bảng quyết toán lên Supabase' };
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

function sanitizeStorageSegment(raw: string, upper = false): string {
  const base = upper ? raw.toUpperCase().trim() : raw.trim();
  return base.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Tải ảnh biên lai đã nén lên Supabase Storage (Nhóm 3)
 */
export async function uploadPaymentReceipt(
  roomCode: string,
  playerId: string,
  imageBlob: Blob,
  now: number = Date.now()
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { url: null, path: null, error: 'Chưa cấu hình Supabase URL & Anon Key' };
  }

  const cleanRoom = sanitizeStorageSegment(roomCode, true);
  const cleanPlayer = sanitizeStorageSegment(playerId, false);
  if (!cleanRoom || !cleanPlayer) {
    return { url: null, path: null, error: 'Mã phòng hoặc mã người chơi không hợp lệ' };
  }

  const path = `${cleanRoom}/${cleanPlayer}_${now}.jpg`;
  try {
    const { error } = await supabase.storage
      .from(RECEIPT_STORAGE_BUCKET)
      .upload(path, imageBlob, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '3600',
      });

    if (error) {
      return { url: null, path: null, error: error.message };
    }

    const { data } = supabase.storage
      .from(RECEIPT_STORAGE_BUCKET)
      .getPublicUrl(path);

    if (!data?.publicUrl) {
      return { url: null, path: null, error: 'Không lấy được đường dẫn ảnh công khai' };
    }

    return { url: data.publicUrl, path, error: null };
  } catch (err: any) {
    return {
      url: null,
      path: null,
      error: err?.message || 'Lỗi khi tải ảnh biên lai lên Supabase Storage',
    };
  }
}

/**
 * Xóa các file ảnh biên lai cụ thể trên Supabase Storage
 */
export async function deleteReceiptFiles(
  paths: string[]
): Promise<{ error: string | null }> {
  const validPaths = (paths || []).map((p) => p?.trim()).filter(Boolean) as string[];
  if (validPaths.length === 0) {
    return { error: null };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { error: null };
  }

  try {
    const { error } = await supabase.storage
      .from(RECEIPT_STORAGE_BUCKET)
      .remove(validPaths);

    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch (err: any) {
    return { error: err?.message || 'Lỗi khi xóa ảnh biên lai trên Supabase Storage' };
  }
}

/**
 * Dọn sạch toàn bộ ảnh biên lai của một phòng trên Supabase Storage
 */
export async function deleteRoomReceipts(
  roomCode: string
): Promise<{ deletedCount: number; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { deletedCount: 0, error: null };
  }

  const cleanRoom = sanitizeStorageSegment(roomCode, true);
  if (!cleanRoom) {
    return { deletedCount: 0, error: null };
  }

  try {
    const { data: files, error: listError } = await supabase.storage
      .from(RECEIPT_STORAGE_BUCKET)
      .list(cleanRoom, { limit: 200 });

    if (listError) {
      return { deletedCount: 0, error: listError.message };
    }

    if (!files || files.length === 0) {
      return { deletedCount: 0, error: null };
    }

    const paths = files
      .map((f) => f?.name)
      .filter(Boolean)
      .map((name) => `${cleanRoom}/${name}`);

    if (paths.length === 0) {
      return { deletedCount: 0, error: null };
    }

    const { error: removeError } = await supabase.storage
      .from(RECEIPT_STORAGE_BUCKET)
      .remove(paths);

    if (removeError) {
      return { deletedCount: 0, error: removeError.message };
    }

    return { deletedCount: paths.length, error: null };
  } catch (err: any) {
    return {
      deletedCount: 0,
      error: err?.message || 'Lỗi khi dọn ảnh biên lai của phòng',
    };
  }
}

