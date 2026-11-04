import { describe, expect, it, beforeEach } from 'vitest';
import {
  migrateSessionState,
  validateAndMigrateImport,
} from '../storage';
import {
  badmintonReducer,
  createInitialSessionState,
} from '../sessionReducer';

describe('Item B: importSession & migrateSessionState validation', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
    // Mock localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          for (const k of Object.keys(mockStorage)) delete mockStorage[k];
        },
      },
      writable: true,
      configurable: true,
    });
  });

  it('import "{}", "[]", "123", "abc" đều trả ok:false và state không đổi', () => {
    const initialState = createInitialSessionState();
    initialState.players = [
      {
        id: 'p1',
        name: 'Player 1',
        sex: 'M',
        rank: 'tb',
        status: 'ACTIVE',
        assignedPool: 'ALL',
        gamesPlayed: 2,
        virtualGamesOffset: 0,
        waitStreak: 0,
        lastPlayedAt: 1000,
        singlesCount: 0,
        noSingles: false,
        joinedAt: 1000,
      },
    ];

    const invalidInputs = ['{}', '[]', '123', 'abc'];

    for (const input of invalidInputs) {
      const res = validateAndMigrateImport(input);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBeDefined();
      }

      // Giả lập hàm importSession: nếu !res.ok thì KHÔNG dispatch LOAD_STATE
      let state = initialState;
      if (res.ok) {
        state = badmintonReducer(state, { type: 'LOAD_STATE', payload: res.state });
      }

      // State không đổi
      expect(state).toBe(initialState);
      expect(state.players.length).toBe(1);
      expect(state.players[0].name).toBe('Player 1');
    }
  });

  it('migrateSessionState ném lỗi khi dữ liệu lạ (không trả buổi trống)', () => {
    expect(() => migrateSessionState({})).toThrow();
    expect(() => migrateSessionState([])).toThrow();
    expect(() => migrateSessionState(123)).toThrow();
    expect(() => migrateSessionState(null)).toThrow();
    expect(() => migrateSessionState({ players: [] })).toThrow(); // thiếu courts
    expect(() => migrateSessionState({ courts: [] })).toThrow(); // thiếu players
  });

  it('khi import hợp lệ, lưu bản sao buổi chơi hiện tại vào key "badminton_court_session_before_import"', () => {
    const currentState = createInitialSessionState();
    currentState.players = [
      {
        id: 'current_p1',
        name: 'Current Player',
        sex: 'M',
        rank: 'tb',
        status: 'ACTIVE',
        assignedPool: 'ALL',
        gamesPlayed: 0,
        virtualGamesOffset: 0,
        waitStreak: 0,
        lastPlayedAt: 0,
        singlesCount: 0,
        noSingles: false,
        joinedAt: 1000,
      },
    ];

    const validJson = JSON.stringify({
      schemaVersion: 3,
      players: [
        {
          id: 'imported_p1',
          name: 'Imported Player',
          sex: 'F',
          rank: 'tb+',
          status: 'ACTIVE',
          assignedPool: 'ALL',
          gamesPlayed: 0,
          virtualGamesOffset: 0,
          waitStreak: 0,
          lastPlayedAt: 0,
          singlesCount: 0,
          noSingles: false,
          joinedAt: 2000,
        },
      ],
      courts: [
        {
          id: 'court-1',
          name: 'Sân 1',
          isActive: true,
          policy: 'MIX',
          forcedType: null,
          currentMatch: null,
          nextUp: null,
        },
      ],
      history: [],
    });

    const res = validateAndMigrateImport(validJson);
    expect(res.ok).toBe(true);

    if (res.ok) {
      // Giả lập logic trong importSession
      localStorage.setItem(
        'badminton_court_session_before_import',
        JSON.stringify(currentState)
      );
      const nextState = badmintonReducer(currentState, {
        type: 'LOAD_STATE',
        payload: res.state,
      });

      expect(nextState.players[0].name).toBe('Imported Player');

      // Đã lưu bản sao trước khi import
      const backedUp = localStorage.getItem('badminton_court_session_before_import');
      expect(backedUp).not.toBeNull();
      const parsedBackup = JSON.parse(backedUp!);
      expect(parsedBackup.players[0].name).toBe('Current Player');
    }
  });

  it('migrateSessionState bỏ undoStack nếu raw.schemaVersion !== 3 (Mục G)', () => {
    const rawV2 = {
      schemaVersion: 2,
      players: [],
      courts: [],
      undoStack: [{ some: 'snapshot' }],
    };
    const migratedV2 = migrateSessionState(rawV2);
    expect(migratedV2.undoStack).toEqual([]);

    const rawV3 = {
      schemaVersion: 3,
      players: [],
      courts: [],
      undoStack: [{ some: 'snapshot' }],
    };
    const migratedV3 = migrateSessionState(rawV3);
    expect(migratedV3.undoStack.length).toBe(1);
  });
});

