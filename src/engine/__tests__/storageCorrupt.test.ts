import { describe, expect, it, beforeEach } from 'vitest';
import {
  getLastLoadStatus,
  getLatestCorruptBackup,
  loadSession,
  pruneCorruptBackups,
  STORAGE_KEY_V2,
} from '../storage';

describe('Item F: Banner dữ liệu hỏng & Quản lý sao lưu hỏng', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        key: (idx: number) => Object.keys(mockStorage)[idx] ?? null,
        get length() {
          return Object.keys(mockStorage).length;
        },
        clear: () => {
          for (const k of Object.keys(mockStorage)) delete mockStorage[k];
        },
      },
      writable: true,
      configurable: true,
    });
  });

  it('loadSession trả về EMPTY khi localStorage không có dữ liệu', () => {
    const res = loadSession(1000);
    expect(res).toBeNull();
    expect(getLastLoadStatus()).toBe('EMPTY');
  });

  it('loadSession trả về OK khi dữ liệu hợp lệ', () => {
    mockStorage[STORAGE_KEY_V2] = JSON.stringify({
      schemaVersion: 3,
      players: [],
      courts: [],
    });
    const res = loadSession(1000);
    expect(res).not.toBeNull();
    expect(getLastLoadStatus()).toBe('OK');
  });

  it('loadSession cập nhật CORRUPT_BACKED_UP khi dữ liệu hỏng và sao lưu thành công', () => {
    mockStorage[STORAGE_KEY_V2] = 'CORRUPTED_JSON_NOT_VALID';
    const res = loadSession(12345);
    expect(res).toBeNull();
    expect(getLastLoadStatus()).toBe('CORRUPT_BACKED_UP');
    expect(mockStorage['badminton_court_session_corrupt_12345']).toBe('CORRUPTED_JSON_NOT_VALID');
  });

  it('chỉ giữ tối đa 2 key badminton_court_session_corrupt_* mới nhất', () => {
    // Giả lập 4 lần hỏng liên tiếp
    mockStorage[STORAGE_KEY_V2] = 'CORRUPT_1';
    loadSession(1000);
    expect(mockStorage['badminton_court_session_corrupt_1000']).toBe('CORRUPT_1');

    mockStorage[STORAGE_KEY_V2] = 'CORRUPT_2';
    loadSession(2000);
    expect(mockStorage['badminton_court_session_corrupt_2000']).toBe('CORRUPT_2');

    mockStorage[STORAGE_KEY_V2] = 'CORRUPT_3';
    loadSession(3000);
    expect(mockStorage['badminton_court_session_corrupt_3000']).toBe('CORRUPT_3');

    // Sau lần 3, key cũ nhất (1000) phải bị xóa
    const corruptKeys = Object.keys(mockStorage).filter((k) =>
      k.startsWith('badminton_court_session_corrupt_')
    );
    expect(corruptKeys).toHaveLength(2);
    expect(corruptKeys).toContain('badminton_court_session_corrupt_3000');
    expect(corruptKeys).toContain('badminton_court_session_corrupt_2000');
    expect(corruptKeys).not.toContain('badminton_court_session_corrupt_1000');

    // getLatestCorruptBackup trả về key 3000
    const latest = getLatestCorruptBackup();
    expect(latest?.key).toBe('badminton_court_session_corrupt_3000');
    expect(latest?.raw).toBe('CORRUPT_3');
  });

  it('pruneCorruptBackups dọn dẹp chính xác theo số lượng mong muốn', () => {
    mockStorage['badminton_court_session_corrupt_100'] = 'oldest';
    mockStorage['badminton_court_session_corrupt_200'] = 'middle';
    mockStorage['badminton_court_session_corrupt_300'] = 'newest';

    pruneCorruptBackups(2);

    expect(mockStorage['badminton_court_session_corrupt_100']).toBeUndefined();
    expect(mockStorage['badminton_court_session_corrupt_200']).toBe('middle');
    expect(mockStorage['badminton_court_session_corrupt_300']).toBe('newest');
  });
});

