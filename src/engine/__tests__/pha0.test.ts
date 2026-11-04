import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Lineup,
  Player,
} from '../../types/badminton';
import {
  generateDoublesProposals,
  generateSinglesProposals,
  planAllCourts,
} from '../matchmaker';
import {
  applyEndMatch,
  applyStartMatch,
  badmintonReducer,
  createInitialSessionState,
} from '../sessionReducer';
import {
  getStorageError,
  loadSession,
  migrateSessionState,
  saveSessionImmediate,
  setStorageError,
  STORAGE_KEY_V2,
} from '../storage';
import { validateLineup } from '../validateLineup';

function makePlayer(
  id: string,
  name: string,
  sex: 'M' | 'F' = 'M',
  status: 'ACTIVE' | 'PAUSED' = 'ACTIVE'
): Player {
  return {
    id,
    name,
    sex,
    rank: 'tb',
    status,
    assignedPool: 'ALL',
    gamesPlayed: 0,
    virtualGamesOffset: 0,
    waitStreak: 0,
    lastPlayedAt: 0,
    singlesCount: 0,
    noSingles: false,
    joinedAt: 1000,
  };
}

const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    mockStorage[key] = String(val);
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
  }),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe('PHA 0 – VÁ ENGINE / REDUCER / HOOK / STORAGE', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    setStorageError(false);
  });

  // (a) forcedType ép loại, không dính mixDebt
  it('(a) forcedType ép loại, không dính mixDebt', () => {
    const state = createInitialSessionState();
    state.settings.courtMode = 'SHARED_POOL';
    state.settings.matchMix = { doubles: 1, singles: 0 }; // Settings chỉ định đôi
    state.courts[0].policy = 'MIX';
    state.courts[0].forcedType = 'SINGLES'; // Ép đơn
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
    ];

    const plan = planAllCourts(state, 1000, 42);
    const planCourt1 = plan['court-1'];
    expect(planCourt1?.status).toBe('OK');
    if (!planCourt1 || planCourt1.status !== 'OK') throw new Error('Plan failed');
    expect(planCourt1.proposals[0].lineup.type).toBe('SINGLES');

    // Bắt đầu trận với forcedType
    const nextState = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: {
        courtId: 'court-1',
        lineup: planCourt1.proposals[0].lineup,
        now: 1000,
      },
    });

    // mixDebt không bị trừ
    expect(nextState.mixDebt).toEqual({ doubles: 0, singles: 0 });
    expect(nextState.courts[0].currentMatch?.type).toBe('SINGLES');
  });

  // (b) Next Up khóa bị rút người rồi tự điền, vẫn khóa
  it('(b) Next Up khóa bị rút người rồi tự điền, vẫn khóa', () => {
    const state = createInitialSessionState();
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
      makePlayer('p5', 'P5'),
      makePlayer('p6', 'P6'),
    ];

    // Court-1 có nextUp bị khóa nhưng bị thiếu người (chỉ có p1 ở team 1, team 2 rỗng)
    state.courts[0].nextUp = {
      type: 'DOUBLES',
      team1: ['p1'],
      team2: [],
      slotSource: { p1: 'MANUAL' },
      isLockedByHost: true,
    };

    const plan = planAllCourts(state, 1000, 42);
    const planCourt1 = plan['court-1'];
    expect(planCourt1?.status).toBe('OK');
    if (!planCourt1 || planCourt1.status !== 'OK') throw new Error('Plan failed');
    const proposal = planCourt1.proposals[0];
    expect(proposal?.lineup.isLockedByHost).toBe(true);
    expect(proposal?.lineup.team1.length).toBe(2);
    expect(proposal?.lineup.team2.length).toBe(2);
    expect(proposal?.lineup.team1).toContain('p1');
    expect(proposal?.lineup.slotSource['p1']).toBe('MANUAL');
  });

  // (c) fixedSlots người PAUSED bị bỏ (không trả [])
  it('(c) fixedSlots người PAUSED bị bỏ', () => {
    const state = createInitialSessionState();
    const activePlayers = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
    ];
    state.players = [
      ...activePlayers,
      makePlayer('pPaused', 'P Paused', 'M', 'PAUSED'),
    ];

    // Truyền fixedSlots có pPaused (không có trong availablePlayers)
    const fixedSlots = [{ playerId: 'pPaused', team: 1 as const }];
    const proposals = generateDoublesProposals(
      'court-1',
      activePlayers,
      state,
      state.settings.weights,
      42,
      fixedSlots
    );

    // Không trả [] mà tự điền người khả dụng
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0].lineup.team1.length).toBe(2);
    expect(proposals[0].lineup.team2.length).toBe(2);
    expect(proposals[0].lineup.team1).not.toContain('pPaused');

    // Tương tự với singles
    const singlesProposals = generateSinglesProposals(
      activePlayers,
      state,
      state.settings.weights,
      42,
      fixedSlots
    );
    expect(singlesProposals.length).toBeGreaterThan(0);
    expect(singlesProposals[0].lineup.team1).not.toContain('pPaused');
  });

  // (d) UNKNOWN_PLAYER BLOCK
  it('(d) validateLineup phát hiện UNKNOWN_PLAYER BLOCK', () => {
    const state = createInitialSessionState();
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
    ];

    const lineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p3', 'unknown_ghost'],
      slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', unknown_ghost: 'AUTO' },
    };

    const issues = validateLineup(lineup, state, 'court-1');
    const blockIssue = issues.find((i) => i.code === 'UNKNOWN_PLAYER');
    expect(blockIssue).toBeDefined();
    expect(blockIssue?.severity).toBe('BLOCK');
  });

  // (e) START với người PAUSED → state không đổi
  it('(e) START với người PAUSED -> state không đổi', () => {
    const state = createInitialSessionState();
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4', 'M', 'PAUSED'), // p4 đang tạm nghỉ
    ];

    const lineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p3', 'p4'],
      slotSource: {},
    };

    const nextState = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: { courtId: 'court-1', lineup, now: 1000 },
    });

    expect(nextState).toBe(state);
    expect(nextState.courts[0].currentMatch).toBeNull();
  });

  // (f) applyEndMatch / applyStartMatch hoạt động độc lập và giữ tính thuần túy
  it('(f) applyEndMatch / applyStartMatch hoạt động độc lập', () => {
    const state = createInitialSessionState();
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
    ];

    const lineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p3', 'p4'],
      slotSource: {},
    };

    const startedState = applyStartMatch(state, 'court-1', lineup, 1000);
    expect(startedState.courts[0].currentMatch).not.toBeNull();
    expect(startedState.players.find((p) => p.id === 'p1')?.waitStreak).toBe(0);

    const endedState = applyEndMatch(startedState, 'court-1', 1000 + 15 * 60000);
    expect(endedState.courts[0].currentMatch).toBeNull();
    expect(endedState.history.length).toBe(1);
    expect(endedState.players.find((p) => p.id === 'p1')?.gamesPlayed).toBe(1);
  });

  // (g) SET_NEXT_UP có BLOCK bị từ chối
  it('(g) SET_NEXT_UP có BLOCK bị từ chối', () => {
    const state = createInitialSessionState();
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
    ];

    // Trùng người p1 ở cả 2 đội -> BLOCK DUPLICATE_PLAYER
    const invalidLineup: Lineup = {
      type: 'DOUBLES',
      team1: ['p1', 'p2'],
      team2: ['p1', 'p3'],
      slotSource: {},
    };

    const nextState = badmintonReducer(state, {
      type: 'SET_NEXT_UP',
      payload: { courtId: 'court-1', lineup: invalidLineup },
    });

    expect(nextState).toBe(state);
    expect(nextState.courts[0].nextUp).toBeNull();
  });

  // (h) migration 2 sân → 3 sân
  it('(h) migration 2 sân -> 3 sân, chuẩn hóa assignedPool và rebuild stats', () => {
    const rawLegacy = {
      schemaVersion: 1,
      courts: [
        { id: 'court-1', name: 'Sân 1', isActive: true },
        { id: 'court-2', name: 'Sân 2', isActive: true },
      ],
      players: [
        { id: 'p1', name: 'P1', assignedPool: 'court-nonexistent' },
        { id: 'p2', name: 'P2', assignedPool: 'court-1' },
      ],
      history: [
        {
          id: 'hist-1',
          courtId: 'court-1',
          type: 'DOUBLES',
          team1: ['p1', 'p2'],
          team2: ['p3', 'p4'],
          startedAt: 1000,
          endedAt: 2000,
        },
      ],
      stats: null, // stats rỗng cần rebuild
    };

    const migrated = migrateSessionState(rawLegacy);

    // 1. Đảm bảo có 3 sân, court-3 isActive = false
    expect(migrated.courts.length).toBe(3);
    expect(migrated.courts[0].id).toBe('court-1');
    expect(migrated.courts[1].id).toBe('court-2');
    expect(migrated.courts[2].id).toBe('court-3');
    expect(migrated.courts[2].isActive).toBe(false);
    expect(migrated.courts[0].forcedType).toBeNull();

    // 2. assignedPool của p1 được đưa về 'ALL'
    const p1 = migrated.players.find((p) => p.id === 'p1');
    expect(p1?.assignedPool).toBe('ALL');
    const p2 = migrated.players.find((p) => p.id === 'p2');
    expect(p2?.assignedPool).toBe('court-1');

    // 3. Stats được tái tạo từ history
    expect(migrated.stats.lastMatchOfPlayer['p1']).toBeDefined();
    expect(migrated.stats.lastMatchOfCourt['court-1']).toBeDefined();
  });

  // (i) lưu không kèm redo, giới hạn 5 undo & Quota handling & Corrupt backup
  it('(i) lưu không kèm redo, giới hạn 5 undo & QuotaExceededError retry & Corrupt backup', () => {
    const state = createInitialSessionState();
    // Tạo 10 snapshot trong undoStack và 3 trong redoStack
    const mockSnapshot = {
      players: [],
      courts: [],
      history: [],
      pairRules: [],
      settings: state.settings,
      stats: state.stats,
      mixDebt: state.mixDebt,
      readyQueue: [],
      autoSinglesSnooze: {},
      courtPlanIndex: {},
    };
    state.undoStack = Array(10).fill(mockSnapshot);
    state.redoStack = Array(3).fill(mockSnapshot);

    saveSessionImmediate(state);

    const savedRaw = localStorage.getItem(STORAGE_KEY_V2);
    expect(savedRaw).not.toBeNull();
    const savedObj = JSON.parse(savedRaw!);
    expect(savedObj.undoStack.length).toBe(5);
    expect(savedObj.redoStack.length).toBe(0);

    // QuotaExceededError test
    let callCount = 0;
    localStorageMock.setItem.mockImplementation((key: string, val: string) => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('Quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      mockStorage[key] = String(val);
    });

    saveSessionImmediate(state);
    expect(getStorageError()).toBe(false); // Retried successfully without undoStack

    // Corrupt JSON backup test
    mockStorage[STORAGE_KEY_V2] = 'INVALID_JSON_CORRUPTED{{{';
    const loaded = loadSession(9999);
    expect(loaded).toBeNull();
    const corruptBackup = mockStorage['badminton_court_session_corrupt_9999'];
    expect(corruptBackup).toBe('INVALID_JSON_CORRUPTED{{{');
  });
});
