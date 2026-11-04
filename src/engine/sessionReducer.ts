import type {
  BadmintonRank,
  BadmintonSessionSnapshot,
  BadmintonSessionState,
  Court,
  CourtPolicy,
  Lineup,
  MatchHistory,
  MatchType,
  PairRule,
  Player,
  ReadyQueueItem,
  SessionSettings,
} from '../types/badminton';
import { DEFAULT_PENALTY_WEIGHTS } from '../types/badminton';
import { buildStatsFromHistory, createEmptyStats, recordCompletedMatch } from './statsManager';
import { validateLineup } from './validateLineup';

export const CURRENT_SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: SessionSettings = {
  maleBonus: 1.5,
  courtMode: 'SHARED_POOL',
  matchMix: { doubles: 1, singles: 0 },
  autoSingles: 'ASK',
  autoSinglesSnoozeMin: 5,
  preferMixedDoubles: true,
  weights: { ...DEFAULT_PENALTY_WEIGHTS },
};

/**
 * Tạo sẵn 3 sân cố định (court-1, court-2, court-3), sân 3 mặc định isActive=false (Mục 15)
 */
export function createDefaultCourts(count = 3): Court[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `court-${i + 1}`,
    name: `Sân ${i + 1}`,
    isActive: i < 2, // Sân 1 và 2 active, sân 3 trở đi isActive = false
    policy: 'MIX',
    currentMatch: null,
    nextUp: null,
  }));
}

export function createInitialSessionState(): BadmintonSessionState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    players: [],
    courts: createDefaultCourts(3),
    history: [],
    pairRules: [],
    settings: { ...DEFAULT_SETTINGS },
    stats: createEmptyStats(),
    mixDebt: { doubles: 0, singles: 0 },
    readyQueue: [],
    autoSinglesSnooze: {},
    courtPlanIndex: {},
    undoStack: [],
    redoStack: [],
  };
}

/**
 * Tạo một snapshot đóng băng (không chứa undoStack / redoStack)
 */
function createSnapshot(state: BadmintonSessionState): BadmintonSessionSnapshot {
  return {
    players: JSON.parse(JSON.stringify(state.players)),
    courts: JSON.parse(JSON.stringify(state.courts)),
    history: JSON.parse(JSON.stringify(state.history)),
    pairRules: JSON.parse(JSON.stringify(state.pairRules)),
    settings: JSON.parse(JSON.stringify(state.settings)),
    stats: JSON.parse(JSON.stringify(state.stats)),
    mixDebt: { ...state.mixDebt },
    readyQueue: JSON.parse(JSON.stringify(state.readyQueue)),
    autoSinglesSnooze: JSON.parse(JSON.stringify(state.autoSinglesSnooze)),
    courtPlanIndex: { ...(state.courtPlanIndex || {}) },
  };
}

/**
 * Kích hoạt người chơi với virtualGamesOffset tự động (Mục 11)
 * newOffset = max(player.virtualGamesOffset, minActiveEffective - player.gamesPlayed, 0)
 */
export function activatePlayerWithOffset(player: Player, allPlayers: Player[]): Player {
  const otherActivePlayers = allPlayers.filter(
    (p) => p.id !== player.id && p.status === 'ACTIVE'
  );

  let newOffset = player.virtualGamesOffset || 0;
  if (otherActivePlayers.length > 0) {
    const minActiveEffective = Math.min(
      ...otherActivePlayers.map((p) => p.gamesPlayed + p.virtualGamesOffset)
    );
    newOffset = Math.max(player.virtualGamesOffset || 0, minActiveEffective - player.gamesPlayed, 0);
  }

  return {
    ...player,
    status: 'ACTIVE',
    virtualGamesOffset: newOffset,
    waitStreak: 0,
  };
}

/**
 * Kiểm tra tính hợp lệ của index vị trí theo loại trận
 */
function validateSlotIndex(type: MatchType, team: 1 | 2, index: number): boolean {
  if (team !== 1 && team !== 2) return false;
  if (type === 'SINGLES') return index === 0;
  if (type === 'DOUBLES') return index === 0 || index === 1;
  return false;
}

/**
 * Dựng lại slotSource CHỈ từ danh sách id đang có trong team1/team2 (Mục 7)
 */
function cleanLineupSlotSource(
  team1: string[],
  team2: string[],
  rawSlotSource: Record<string, 'AUTO' | 'MANUAL'> = {}
): Record<string, 'AUTO' | 'MANUAL'> {
  const result: Record<string, 'AUTO' | 'MANUAL'> = {};
  for (const id of [...team1, ...team2]) {
    result[id] = rawSlotSource[id] || 'AUTO';
  }
  return result;
}

export type BadmintonAction =
  | {
      type: 'START_MATCH';
      payload: { courtId: string; lineup?: Lineup; now: number };
    }
  | {
      type: 'END_MATCH';
      payload: { courtId: string; now: number };
    }
  | {
      type: 'END_AND_START';
      payload: { courtId: string; now: number; nextLineup?: Lineup };
    }
  | {
      type: 'SWAP_PLAYERS';
      payload: {
        courtId: string;
        target: 'CURRENT' | 'NEXT_UP';
        slot1: { team: 1 | 2; index: number };
        slot2: { team: 1 | 2; index: number } | { playerId: string };
        baseLineup?: Lineup;
      };
    }
  | {
      type: 'SET_MANUAL_SLOT';
      payload: {
        courtId: string;
        target: 'CURRENT' | 'NEXT_UP';
        team: 1 | 2;
        index: number;
        playerId: string;
        baseLineup?: Lineup;
      };
    }
  | {
      type: 'SET_NEXT_UP';
      payload: { courtId: string; lineup: Lineup; isLockedByHost?: boolean };
    }
  | {
      type: 'CLEAR_NEXT_UP';
      payload: { courtId: string };
    }
  | {
      type: 'ENQUEUE_READY_QUEUE';
      payload: { lineup: Lineup; courtId?: string; isLockedByHost: boolean; now: number; id?: string };
    }
  | {
      type: 'DEQUEUE_READY_QUEUE';
      payload: { itemId: string };
    }
  | {
      type: 'REORDER_READY_QUEUE';
      payload: { fromIndex: number; toIndex: number };
    }
  | {
      type: 'PAUSE_PLAYER';
      payload: { playerId: string };
    }
  | {
      type: 'RESUME_PLAYER';
      payload: { playerId: string };
    }
  | {
      type: 'ADD_PLAYER';
      payload: {
        player: Omit<
          Player,
          'gamesPlayed' | 'virtualGamesOffset' | 'waitStreak' | 'lastPlayedAt' | 'singlesCount'
        >;
        now: number;
      };
    }
  | {
      type: 'ADD_PLAYERS';
      payload: {
        players: Array<
          Omit<
            Player,
            'gamesPlayed' | 'virtualGamesOffset' | 'waitStreak' | 'lastPlayedAt' | 'singlesCount'
          >
        >;
        now: number;
      };
    }
  | {
      type: 'UPDATE_PLAYER';
      payload: { player: Partial<Player> & { id: string } };
    }
  | {
      type: 'REMOVE_PLAYER';
      payload: { playerId: string };
    }
  | {
      type: 'EDIT_RANK';
      payload: { playerId: string; rank: BadmintonRank };
    }
  | {
      type: 'ADD_COURT';
      payload: { id?: string; name?: string; policy?: CourtPolicy };
    }
  | {
      type: 'UPDATE_COURT';
      payload: { courtId: string; updates: { name?: string; policy?: CourtPolicy; isActive?: boolean } };
    }
  | {
      type: 'REMOVE_COURT';
      payload: { courtId: string };
    }
  | {
      type: 'ADD_PAIR_RULE';
      payload: { rule: PairRule | (Omit<PairRule, 'id'> & { id?: string }) };
    }
  | {
      type: 'REMOVE_PAIR_RULE';
      payload: { ruleId: string };
    }
  | {
      type: 'UPDATE_SETTINGS';
      payload: { settings: Partial<SessionSettings> };
    }
  | {
      type: 'SNOOZE_AUTO_SINGLES';
      payload: { courtId: string; untilTs: number; queueSize: number };
    }
  | {
      type: 'SNOOZE_AUTO_SINGLES_WAIT';
      payload: { courtId: string; untilTs: number; queueSize: number };
    }
  | {
      type: 'CYCLE_NEXT_UP_PROPOSAL';
      payload: { courtId: string };
    }
  | {
      type: 'DELETE_HISTORY_MATCH';
      payload: { matchId: string };
    }
  | {
      type: 'NEW_SESSION_KEEP_PLAYERS';
      payload: { now: number };
    }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET_SESSION' }
  | { type: 'LOAD_STATE'; payload: BadmintonSessionSnapshot };

const NO_UNDO_ACTIONS = new Set<BadmintonAction['type']>([
  'CYCLE_NEXT_UP_PROPOSAL',
  'SNOOZE_AUTO_SINGLES',
  'SNOOZE_AUTO_SINGLES_WAIT',
]);

/**
 * Pure Reducer quản lý toàn bộ State ứng dụng
 */
export function badmintonReducer(
  state: BadmintonSessionState,
  action: BadmintonAction
): BadmintonSessionState {
  if (action.type === 'UNDO') {
    if (state.undoStack.length === 0) return state;
    const previous = state.undoStack[0];
    const currentSnapshot = createSnapshot(state);
    return {
      ...previous,
      schemaVersion: state.schemaVersion,
      undoStack: state.undoStack.slice(1),
      redoStack: [currentSnapshot, ...state.redoStack].slice(0, 30),
    };
  }

  if (action.type === 'REDO') {
    if (state.redoStack.length === 0) return state;
    const next = state.redoStack[0];
    const currentSnapshot = createSnapshot(state);
    return {
      ...next,
      schemaVersion: state.schemaVersion,
      undoStack: [currentSnapshot, ...state.undoStack].slice(0, 30),
      redoStack: state.redoStack.slice(1),
    };
  }

  if (action.type === 'LOAD_STATE') {
    return {
      ...action.payload,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      undoStack: [],
      redoStack: [],
    };
  }

  if (action.type === 'RESET_SESSION') {
    return createInitialSessionState();
  }

  // Mục 18: NEW_SESSION_KEEP_PLAYERS
  if (action.type === 'NEW_SESSION_KEEP_PLAYERS') {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      players: state.players.map((p) => ({
        ...p,
        gamesPlayed: 0,
        virtualGamesOffset: 0,
        waitStreak: 0,
        lastPlayedAt: 0,
        singlesCount: 0,
        status: 'ACTIVE' as const,
      })),
      courts: state.courts.map((c) => ({
        ...c,
        currentMatch: null,
        nextUp: null,
      })),
      history: [],
      pairRules: [...state.pairRules],
      settings: { ...state.settings },
      stats: createEmptyStats(),
      mixDebt: { doubles: 0, singles: 0 },
      readyQueue: [],
      autoSinglesSnooze: {},
      courtPlanIndex: {},
      undoStack: [],
      redoStack: [],
    };
  }

  // Mục 3: Các action không tạo snapshot undo (CYCLE_NEXT_UP_PROPOSAL, SNOOZE_AUTO_SINGLES, SNOOZE_AUTO_SINGLES_WAIT)
  const isNoUndo = NO_UNDO_ACTIONS.has(action.type);
  const nextUndoStack = isNoUndo
    ? state.undoStack
    : [createSnapshot(state), ...state.undoStack].slice(0, 30);
  const nextRedoStack = isNoUndo ? state.redoStack : [];

  const baseNextState: BadmintonSessionState = {
    ...state,
    undoStack: nextUndoStack,
    redoStack: nextRedoStack,
  };

  switch (action.type) {
    case 'START_MATCH': {
      const { courtId, now } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      // Mục 5: nếu court không tồn tại, không active, hoặc currentMatch !== null -> return state
      if (!targetCourt || !targetCourt.isActive || targetCourt.currentMatch !== null) {
        return state;
      }

      const rawLineup = action.payload.lineup ?? targetCourt.nextUp;
      if (!rawLineup) return state;

      const cleanSlots = cleanLineupSlotSource(rawLineup.team1, rawLineup.team2, rawLineup.slotSource);
      const lineupToStart: Lineup = {
        ...rawLineup,
        slotSource: cleanSlots,
      };

      // Chạy validateLineup: có mã BLOCK -> return state
      const issues = validateLineup(lineupToStart, baseNextState, courtId);
      if (issues.some((i) => i.severity === 'BLOCK')) {
        return state;
      }

      const matchPlayers = new Set([...lineupToStart.team1, ...lineupToStart.team2]);

      // 1. Cập nhật waitStreak
      const playingOnOtherCourts = new Set<string>();
      for (const c of baseNextState.courts) {
        if (c.id !== courtId && c.isActive && c.currentMatch) {
          c.currentMatch.team1.forEach((id) => playingOnOtherCourts.add(id));
          c.currentMatch.team2.forEach((id) => playingOnOtherCourts.add(id));
        }
      }

      const updatedPlayers = baseNextState.players.map((p) => {
        if (matchPlayers.has(p.id)) {
          return { ...p, waitStreak: 0 };
        }
        if (p.status === 'ACTIVE' && !playingOnOtherCourts.has(p.id)) {
          if (baseNextState.settings.courtMode === 'SPLIT_COURT') {
            if (p.assignedPool === courtId || p.assignedPool === 'ALL') {
              return { ...p, waitStreak: p.waitStreak + 1 };
            }
            return p;
          }
          return { ...p, waitStreak: p.waitStreak + 1 };
        }
        return p;
      });

      // 2. Cập nhật mixDebt (Mục 8)
      const isManual =
        Object.values(cleanSlots).length > 0 &&
        Object.values(cleanSlots).every((s) => s === 'MANUAL');
      let newMixDebt = { ...baseNextState.mixDebt };
      if (!isManual) {
        newMixDebt.doubles += baseNextState.settings.matchMix.doubles;
        newMixDebt.singles += baseNextState.settings.matchMix.singles;
        if (lineupToStart.type === 'DOUBLES') {
          newMixDebt.doubles -= 1;
        } else {
          newMixDebt.singles -= 1;
        }
      }

      // 3. Cập nhật sân & rút người khỏi nextUp của sân khác (Mục 5)
      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id === courtId) {
          return {
            ...c,
            currentMatch: {
              ...lineupToStart,
              id: lineupToStart.id || `match_${courtId}_${now}`,
              startedAt: now,
            },
            nextUp: null,
          };
        }
        // Sân khác: rút người khỏi nextUp
        if (c.nextUp) {
          const hasOverlap = [...c.nextUp.team1, ...c.nextUp.team2].some((id) =>
            matchPlayers.has(id)
          );
          if (hasOverlap) {
            if (!c.nextUp.isLockedByHost) {
              return { ...c, nextUp: null };
            }
            const newT1 = c.nextUp.team1.filter((id) => !matchPlayers.has(id));
            const newT2 = c.nextUp.team2.filter((id) => !matchPlayers.has(id));
            const newSlots: Record<string, 'AUTO' | 'MANUAL'> = {};
            [...newT1, ...newT2].forEach((id) => {
              newSlots[id] = 'MANUAL';
            });
            return {
              ...c,
              nextUp: {
                ...c.nextUp,
                team1: newT1,
                team2: newT2,
                slotSource: newSlots,
              },
            };
          }
        }
        return c;
      });

      // 4. Bỏ khỏi readyQueue nếu có
      const updatedReadyQueue = baseNextState.readyQueue.filter((item) => {
        const itemIds = [...item.lineup.team1, ...item.lineup.team2];
        return !itemIds.some((id) => matchPlayers.has(id));
      });

      return {
        ...baseNextState,
        players: updatedPlayers,
        courts: updatedCourts,
        mixDebt: newMixDebt,
        readyQueue: updatedReadyQueue,
        courtPlanIndex: { ...baseNextState.courtPlanIndex, [courtId]: 0 }, // Mục 4: reset khi START_MATCH
      };
    }

    case 'END_MATCH': {
      const { courtId, now } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt || !targetCourt.currentMatch) return state;

      const current = targetCourt.currentMatch;
      const durationMinutes = Math.max(
        1,
        Math.round((now - (current.startedAt || now)) / 60000)
      );

      const historyItem: MatchHistory = {
        id: current.id || `hist_${courtId}_${now}`,
        courtId,
        type: current.type,
        team1: current.team1,
        team2: current.team2,
        slotSource: current.slotSource,
        startedAt: current.startedAt || now - 15 * 60000,
        endedAt: now,
        durationMinutes,
      };

      const matchPlayers = new Set([...current.team1, ...current.team2]);

      const updatedPlayers = baseNextState.players.map((p) => {
        if (matchPlayers.has(p.id)) {
          return {
            ...p,
            gamesPlayed: p.gamesPlayed + 1,
            singlesCount: current.type === 'SINGLES' ? p.singlesCount + 1 : p.singlesCount,
            lastPlayedAt: now,
          };
        }
        return p;
      });

      const updatedStats = recordCompletedMatch(baseNextState.stats, historyItem);

      let nextNextUp = targetCourt.nextUp;
      let remainingQueue = [...baseNextState.readyQueue];

      if (baseNextState.settings.courtMode === 'SHARED_POOL' && !nextNextUp && remainingQueue.length > 0) {
        const candidateIdx = remainingQueue.findIndex(
          (item) => !item.isLockedByHost || !item.courtId || item.courtId === courtId
        );
        if (candidateIdx >= 0) {
          const [promoted] = remainingQueue.splice(candidateIdx, 1);
          nextNextUp = {
            ...promoted.lineup,
            isLockedByHost: promoted.isLockedByHost,
          };
        }
      }

      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          currentMatch: null,
          nextUp: nextNextUp,
        };
      });

      return {
        ...baseNextState,
        players: updatedPlayers,
        courts: updatedCourts,
        history: [...baseNextState.history, historyItem],
        stats: updatedStats,
        readyQueue: remainingQueue,
        courtPlanIndex: { ...baseNextState.courtPlanIndex, [courtId]: 0 }, // Mục 4: reset khi END_MATCH
      };
    }

    // Mục 6: END_AND_START trong đúng 1 snapshot undo
    case 'END_AND_START': {
      const { courtId, now, nextLineup } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt || !targetCourt.currentMatch) return state;

      const current = targetCourt.currentMatch;
      const durationMinutes = Math.max(
        1,
        Math.round((now - (current.startedAt || now)) / 60000)
      );

      const historyItem: MatchHistory = {
        id: current.id || `hist_${courtId}_${now}`,
        courtId,
        type: current.type,
        team1: current.team1,
        team2: current.team2,
        slotSource: current.slotSource,
        startedAt: current.startedAt || now - 15 * 60000,
        endedAt: now,
        durationMinutes,
      };

      const endedPlayers = new Set([...current.team1, ...current.team2]);
      const playersAfterEnd = baseNextState.players.map((p) => {
        if (endedPlayers.has(p.id)) {
          return {
            ...p,
            gamesPlayed: p.gamesPlayed + 1,
            singlesCount: current.type === 'SINGLES' ? p.singlesCount + 1 : p.singlesCount,
            lastPlayedAt: now,
          };
        }
        return p;
      });

      const statsAfterEnd = recordCompletedMatch(baseNextState.stats, historyItem);
      const historyAfterEnd = [...baseNextState.history, historyItem];

      let nextNextUp = targetCourt.nextUp;
      let remainingQueue = [...baseNextState.readyQueue];
      if (baseNextState.settings.courtMode === 'SHARED_POOL' && !nextNextUp && remainingQueue.length > 0) {
        const candidateIdx = remainingQueue.findIndex(
          (item) => !item.isLockedByHost || !item.courtId || item.courtId === courtId
        );
        if (candidateIdx >= 0) {
          const [promoted] = remainingQueue.splice(candidateIdx, 1);
          nextNextUp = {
            ...promoted.lineup,
            isLockedByHost: promoted.isLockedByHost,
          };
        }
      }

      const courtsAfterEnd = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          currentMatch: null,
          nextUp: nextNextUp,
        };
      });

      const stateAfterEnd: BadmintonSessionState = {
        ...baseNextState,
        players: playersAfterEnd,
        courts: courtsAfterEnd,
        history: historyAfterEnd,
        stats: statsAfterEnd,
        readyQueue: remainingQueue,
        courtPlanIndex: { ...baseNextState.courtPlanIndex, [courtId]: 0 },
      };

      // Bước 2: START_MATCH cho lineup kế tiếp
      const rawLineupToStart = nextLineup ?? nextNextUp;
      if (!rawLineupToStart) {
        return stateAfterEnd;
      }

      const cleanSlots = cleanLineupSlotSource(
        rawLineupToStart.team1,
        rawLineupToStart.team2,
        rawLineupToStart.slotSource
      );
      const lineupToStart: Lineup = {
        ...rawLineupToStart,
        slotSource: cleanSlots,
      };

      const issues = validateLineup(lineupToStart, stateAfterEnd, courtId);
      if (issues.some((i) => i.severity === 'BLOCK')) {
        return stateAfterEnd;
      }

      const matchPlayers = new Set([...lineupToStart.team1, ...lineupToStart.team2]);
      const playingOnOtherCourts = new Set<string>();
      for (const c of courtsAfterEnd) {
        if (c.id !== courtId && c.isActive && c.currentMatch) {
          c.currentMatch.team1.forEach((id) => playingOnOtherCourts.add(id));
          c.currentMatch.team2.forEach((id) => playingOnOtherCourts.add(id));
        }
      }

      const finalPlayers = playersAfterEnd.map((p) => {
        if (matchPlayers.has(p.id)) {
          return { ...p, waitStreak: 0 };
        }
        if (p.status === 'ACTIVE' && !playingOnOtherCourts.has(p.id)) {
          if (stateAfterEnd.settings.courtMode === 'SPLIT_COURT') {
            if (p.assignedPool === courtId || p.assignedPool === 'ALL') {
              return { ...p, waitStreak: p.waitStreak + 1 };
            }
            return p;
          }
          return { ...p, waitStreak: p.waitStreak + 1 };
        }
        return p;
      });

      const isManual =
        Object.values(cleanSlots).length > 0 &&
        Object.values(cleanSlots).every((s) => s === 'MANUAL');
      let newMixDebt = { ...stateAfterEnd.mixDebt };
      if (!isManual) {
        newMixDebt.doubles += stateAfterEnd.settings.matchMix.doubles;
        newMixDebt.singles += stateAfterEnd.settings.matchMix.singles;
        if (lineupToStart.type === 'DOUBLES') {
          newMixDebt.doubles -= 1;
        } else {
          newMixDebt.singles -= 1;
        }
      }

      const finalCourts = courtsAfterEnd.map((c) => {
        if (c.id === courtId) {
          return {
            ...c,
            currentMatch: {
              ...lineupToStart,
              id: lineupToStart.id || `match_${courtId}_${now}`,
              startedAt: now,
            },
            nextUp: null,
          };
        }
        if (c.nextUp) {
          const hasOverlap = [...c.nextUp.team1, ...c.nextUp.team2].some((id) =>
            matchPlayers.has(id)
          );
          if (hasOverlap) {
            if (!c.nextUp.isLockedByHost) {
              return { ...c, nextUp: null };
            }
            const newT1 = c.nextUp.team1.filter((id) => !matchPlayers.has(id));
            const newT2 = c.nextUp.team2.filter((id) => !matchPlayers.has(id));
            const newSlots: Record<string, 'AUTO' | 'MANUAL'> = {};
            [...newT1, ...newT2].forEach((id) => {
              newSlots[id] = 'MANUAL';
            });
            return {
              ...c,
              nextUp: {
                ...c.nextUp,
                team1: newT1,
                team2: newT2,
                slotSource: newSlots,
              },
            };
          }
        }
        return c;
      });

      const finalReadyQueue = remainingQueue.filter((item) => {
        const itemIds = [...item.lineup.team1, ...item.lineup.team2];
        return !itemIds.some((id) => matchPlayers.has(id));
      });

      return {
        ...stateAfterEnd,
        players: finalPlayers,
        courts: finalCourts,
        mixDebt: newMixDebt,
        readyQueue: finalReadyQueue,
        courtPlanIndex: { ...stateAfterEnd.courtPlanIndex, [courtId]: 0 },
      };
    }

    // Mục 7: SWAP_PLAYERS
    case 'SWAP_PLAYERS': {
      const { courtId, target, slot1, slot2, baseLineup } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt) return state;

      const currentOrNext =
        target === 'CURRENT'
          ? targetCourt.currentMatch
          : (targetCourt.nextUp ?? baseLineup);

      if (!currentOrNext) return state;

      // Validate slot indices
      if (!validateSlotIndex(currentOrNext.type, slot1.team, slot1.index)) {
        return state;
      }
      if ('team' in slot2 && !validateSlotIndex(currentOrNext.type, slot2.team, slot2.index)) {
        return state;
      }

      const team1 = [...currentOrNext.team1];
      const team2 = [...currentOrNext.team2];
      const rawSlotSource = { ...currentOrNext.slotSource };

      if ('playerId' in slot2) {
        const newPid = slot2.playerId;
        if (slot1.team === 1) {
          team1[slot1.index] = newPid;
        } else {
          team2[slot1.index] = newPid;
        }
        rawSlotSource[newPid] = 'MANUAL';
      } else {
        const p1 = slot1.team === 1 ? team1[slot1.index] : team2[slot1.index];
        const p2 = slot2.team === 1 ? team1[slot2.index] : team2[slot2.index];
        if (slot1.team === 1) team1[slot1.index] = p2;
        else team2[slot1.index] = p2;
        if (slot2.team === 1) team1[slot2.index] = p1;
        else team2[slot2.index] = p1;
        rawSlotSource[p1] = 'MANUAL';
        rawSlotSource[p2] = 'MANUAL';
      }

      const cleanSlots = cleanLineupSlotSource(team1, team2, rawSlotSource);
      const newLineup: Lineup = {
        type: currentOrNext.type,
        team1,
        team2,
        slotSource: cleanSlots,
      };

      // Có mã BLOCK -> return state
      const issues = validateLineup(newLineup, baseNextState, courtId);
      if (issues.some((i) => i.severity === 'BLOCK')) {
        return state;
      }

      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        if (target === 'CURRENT') {
          return {
            ...c,
            currentMatch: c.currentMatch ? { ...c.currentMatch, ...newLineup } : null,
          };
        } else {
          return {
            ...c,
            nextUp: {
              ...newLineup,
              isLockedByHost: c.nextUp?.isLockedByHost ?? false,
            },
          };
        }
      });

      return {
        ...baseNextState,
        courts: updatedCourts,
      };
    }

    // Mục 7: SET_MANUAL_SLOT
    case 'SET_MANUAL_SLOT': {
      const { courtId, target, team, index, playerId, baseLineup } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt) return state;

      const currentOrNext =
        target === 'CURRENT'
          ? targetCourt.currentMatch
          : (targetCourt.nextUp ?? baseLineup);

      if (!currentOrNext) return state;

      if (!validateSlotIndex(currentOrNext.type, team, index)) {
        return state;
      }

      const team1 = [...currentOrNext.team1];
      const team2 = [...currentOrNext.team2];
      const rawSlotSource = { ...currentOrNext.slotSource, [playerId]: 'MANUAL' as const };

      if (team === 1) team1[index] = playerId;
      else team2[index] = playerId;

      const cleanSlots = cleanLineupSlotSource(team1, team2, rawSlotSource);
      const newLineup: Lineup = {
        type: currentOrNext.type,
        team1,
        team2,
        slotSource: cleanSlots,
      };

      const issues = validateLineup(newLineup, baseNextState, courtId);
      if (issues.some((i) => i.severity === 'BLOCK')) {
        return state;
      }

      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        if (target === 'CURRENT') {
          return {
            ...c,
            currentMatch: c.currentMatch ? { ...c.currentMatch, ...newLineup } : null,
          };
        } else {
          return {
            ...c,
            nextUp: {
              ...newLineup,
              isLockedByHost: c.nextUp?.isLockedByHost ?? false,
            },
          };
        }
      });

      return {
        ...baseNextState,
        courts: updatedCourts,
      };
    }

    case 'SET_NEXT_UP': {
      const { courtId, lineup, isLockedByHost = false } = action.payload;
      const cleanSlots = cleanLineupSlotSource(lineup.team1, lineup.team2, lineup.slotSource);
      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          nextUp: { ...lineup, slotSource: cleanSlots, isLockedByHost },
        };
      });
      return {
        ...baseNextState,
        courts: updatedCourts,
      };
    }

    case 'CLEAR_NEXT_UP': {
      const updatedCourts = baseNextState.courts.map((c) =>
        c.id === action.payload.courtId ? { ...c, nextUp: null } : c
      );
      return {
        ...baseNextState,
        courts: updatedCourts,
      };
    }

    case 'ENQUEUE_READY_QUEUE': {
      const id =
        action.payload.id ||
        `queue_${action.payload.now}_${baseNextState.readyQueue.length + 1}`;
      const newItem: ReadyQueueItem = {
        id,
        lineup: action.payload.lineup,
        courtId: action.payload.courtId,
        isLockedByHost: action.payload.isLockedByHost,
        createdAt: action.payload.now,
      };
      return {
        ...baseNextState,
        readyQueue: [...baseNextState.readyQueue, newItem],
      };
    }

    case 'DEQUEUE_READY_QUEUE': {
      return {
        ...baseNextState,
        readyQueue: baseNextState.readyQueue.filter((item) => item.id !== action.payload.itemId),
      };
    }

    case 'REORDER_READY_QUEUE': {
      const { fromIndex, toIndex } = action.payload;
      const queue = [...baseNextState.readyQueue];
      if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) {
        return state;
      }
      const [moved] = queue.splice(fromIndex, 1);
      queue.splice(toIndex, 0, moved);
      return {
        ...baseNextState,
        readyQueue: queue,
      };
    }

    // Mục 9: PAUSE_PLAYER
    case 'PAUSE_PLAYER': {
      const pid = action.payload.playerId;
      const updatedPlayers = baseNextState.players.map((p) =>
        p.id === pid ? { ...p, status: 'PAUSED' as const, waitStreak: 0 } : p
      );

      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.nextUp) {
          const inNextUp = c.nextUp.team1.includes(pid) || c.nextUp.team2.includes(pid);
          if (inNextUp) {
            if (!c.nextUp.isLockedByHost) {
              return { ...c, nextUp: null };
            }
            return c;
          }
        }
        return c;
      });

      const updatedReadyQueue = baseNextState.readyQueue.filter(
        (item) => !item.lineup.team1.includes(pid) && !item.lineup.team2.includes(pid)
      );

      return {
        ...baseNextState,
        players: updatedPlayers,
        courts: updatedCourts,
        readyQueue: updatedReadyQueue,
        courtPlanIndex: {}, // Mục 4: reset khi PAUSE
      };
    }

    case 'RESUME_PLAYER': {
      const target = baseNextState.players.find((p) => p.id === action.payload.playerId);
      if (!target) return state;
      const updatedPlayer = activatePlayerWithOffset(target, baseNextState.players);
      const updatedPlayers = baseNextState.players.map((p) =>
        p.id === target.id ? updatedPlayer : p
      );
      return {
        ...baseNextState,
        players: updatedPlayers,
        courtPlanIndex: {}, // Mục 4: reset khi RESUME
      };
    }

    case 'ADD_PLAYER': {
      const { player, now } = action.payload;
      let newPlayer: Player = {
        ...player,
        singlesCount: 0,
        noSingles: player.noSingles ?? false,
        joinedAt: player.joinedAt || now,
        gamesPlayed: 0,
        virtualGamesOffset: 0,
        waitStreak: 0,
        lastPlayedAt: 0,
      };

      if (newPlayer.status === 'ACTIVE') {
        newPlayer = activatePlayerWithOffset(newPlayer, baseNextState.players);
      }

      return {
        ...baseNextState,
        players: [...baseNextState.players, newPlayer],
        courtPlanIndex: {}, // Mục 4: reset khi ADD
      };
    }

    // Mục 13: ADD_PLAYERS
    case 'ADD_PLAYERS': {
      const { players: newPlayersData, now } = action.payload;
      let currentPlayers = [...baseNextState.players];

      for (const pData of newPlayersData) {
        let newPlayer: Player = {
          ...pData,
          singlesCount: 0,
          noSingles: pData.noSingles ?? false,
          joinedAt: pData.joinedAt || now,
          gamesPlayed: 0,
          virtualGamesOffset: 0,
          waitStreak: 0,
          lastPlayedAt: 0,
        };
        if (newPlayer.status === 'ACTIVE') {
          newPlayer = activatePlayerWithOffset(newPlayer, currentPlayers);
        }
        currentPlayers.push(newPlayer);
      }

      return {
        ...baseNextState,
        players: currentPlayers,
        courtPlanIndex: {}, // Mục 4: reset khi ADD
      };
    }

    // Mục 10: UPDATE_PLAYER
    case 'UPDATE_PLAYER': {
      const { player } = action.payload;
      const target = baseNextState.players.find((p) => p.id === player.id);
      if (!target) return state;

      // Nếu payload có status thì chuyển qua PAUSE/RESUME tương ứng
      if (player.status && player.status !== target.status) {
        if (player.status === 'PAUSED') {
          return badmintonReducer(state, {
            type: 'PAUSE_PLAYER',
            payload: { playerId: player.id },
          });
        } else if (player.status === 'ACTIVE') {
          return badmintonReducer(state, {
            type: 'RESUME_PLAYER',
            payload: { playerId: player.id },
          });
        }
      }

      // Không cho sửa gamesPlayed / virtualGamesOffset / waitStreak / singlesCount / status
      const sanitizedUpdates: Partial<Player> = { ...player };
      delete sanitizedUpdates.gamesPlayed;
      delete sanitizedUpdates.virtualGamesOffset;
      delete sanitizedUpdates.waitStreak;
      delete sanitizedUpdates.singlesCount;
      delete sanitizedUpdates.status;

      const hasSexOrPoolChange =
        (sanitizedUpdates.sex !== undefined && sanitizedUpdates.sex !== target.sex) ||
        (sanitizedUpdates.assignedPool !== undefined && sanitizedUpdates.assignedPool !== target.assignedPool);

      const updatedPlayers = baseNextState.players.map((p) =>
        p.id === player.id ? { ...p, ...sanitizedUpdates } : p
      );

      return {
        ...baseNextState,
        players: updatedPlayers,
        courtPlanIndex: hasSexOrPoolChange ? {} : baseNextState.courtPlanIndex,
      };
    }

    // Mục 12: REMOVE_PLAYER
    case 'REMOVE_PLAYER': {
      const pid = action.payload.playerId;
      const target = baseNextState.players.find((p) => p.id === pid);
      if (!target) return state;

      // Chỉ cho xóa khi không có trong currentMatch và gamesPlayed === 0
      const inCurrentMatch = baseNextState.courts.some(
        (c) =>
          c.isActive &&
          c.currentMatch &&
          (c.currentMatch.team1.includes(pid) || c.currentMatch.team2.includes(pid))
      );
      if (inCurrentMatch || target.gamesPlayed > 0) {
        return state;
      }

      const updatedPlayers = baseNextState.players.filter((p) => p.id !== pid);

      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.nextUp && (c.nextUp.team1.includes(pid) || c.nextUp.team2.includes(pid))) {
          return { ...c, nextUp: null };
        }
        return c;
      });

      const updatedReadyQueue = baseNextState.readyQueue.filter(
        (item) => !item.lineup.team1.includes(pid) && !item.lineup.team2.includes(pid)
      );

      const updatedPairRules = baseNextState.pairRules.filter(
        (r) => r.playerAId !== pid && r.playerBId !== pid
      );

      return {
        ...baseNextState,
        players: updatedPlayers,
        courts: updatedCourts,
        readyQueue: updatedReadyQueue,
        pairRules: updatedPairRules,
        courtPlanIndex: {}, // Mục 4: reset khi REMOVE
      };
    }

    case 'EDIT_RANK': {
      const updatedPlayers = baseNextState.players.map((p) =>
        p.id === action.payload.playerId ? { ...p, rank: action.payload.rank } : p
      );
      return {
        ...baseNextState,
        players: updatedPlayers,
        courtPlanIndex: {}, // Mục 4: reset khi EDIT_RANK
      };
    }

    // Mục 15: ADD_COURT
    case 'ADD_COURT': {
      const count = baseNextState.courts.length + 1;
      const newId = action.payload.id || `court-${count}`;
      if (baseNextState.courts.some((c) => c.id === newId)) {
        return state;
      }
      const newCourt: Court = {
        id: newId,
        name: action.payload.name || `Sân ${count}`,
        isActive: true,
        policy: action.payload.policy || 'MIX',
        currentMatch: null,
        nextUp: null,
      };
      return {
        ...baseNextState,
        courts: [...baseNextState.courts, newCourt],
        courtPlanIndex: {},
      };
    }

    // Mục 16: UPDATE_COURT
    case 'UPDATE_COURT': {
      const { courtId, updates } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt) return state;

      // Tắt sân chỉ cho phép khi currentMatch === null; gặp trận đang đánh -> return state
      if (updates.isActive === false && targetCourt.currentMatch !== null) {
        return state;
      }

      const sanitizedUpdates: Partial<Court> = {};
      if (updates.name !== undefined) sanitizedUpdates.name = updates.name;
      if (updates.policy !== undefined) sanitizedUpdates.policy = updates.policy;
      if (updates.isActive !== undefined) sanitizedUpdates.isActive = updates.isActive;

      const nextAutoSnooze = { ...baseNextState.autoSinglesSnooze };
      const nextPlanIndex = { ...baseNextState.courtPlanIndex };

      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        const isNowInactive = updates.isActive === false;
        if (isNowInactive) {
          delete nextAutoSnooze[courtId];
          delete nextPlanIndex[courtId];
          return {
            ...c,
            ...sanitizedUpdates,
            nextUp: null,
          };
        }
        return { ...c, ...sanitizedUpdates };
      });

      return {
        ...baseNextState,
        courts: updatedCourts,
        autoSinglesSnooze: nextAutoSnooze,
        courtPlanIndex: updates.policy !== undefined ? {} : nextPlanIndex,
      };
    }

    // Mục 15: REMOVE_COURT
    case 'REMOVE_COURT': {
      const { courtId } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt) return state;
      if (targetCourt.currentMatch !== null) {
        return state;
      }

      const updatedCourts = baseNextState.courts.filter((c) => c.id !== courtId);
      const updatedPlayers = baseNextState.players.map((p) =>
        p.assignedPool === courtId ? { ...p, assignedPool: 'ALL' as const } : p
      );

      return {
        ...baseNextState,
        courts: updatedCourts,
        players: updatedPlayers,
        courtPlanIndex: {},
      };
    }

    // Mục 14: ADD_PAIR_RULE
    case 'ADD_PAIR_RULE': {
      const { rule } = action.payload;
      if (!rule.playerAId || !rule.playerBId || rule.playerAId === rule.playerBId) {
        return state;
      }

      const isDuplicate = baseNextState.pairRules.some(
        (r) =>
          r.type === rule.type &&
          ((r.playerAId === rule.playerAId && r.playerBId === rule.playerBId) ||
            (r.playerAId === rule.playerBId && r.playerBId === rule.playerAId))
      );
      if (isDuplicate) {
        return state;
      }

      const id =
        rule.id ||
        `rule_${rule.playerAId}_${rule.playerBId}_${rule.type}`;
      const newRule: PairRule = { ...rule, id };
      return {
        ...baseNextState,
        pairRules: [...baseNextState.pairRules, newRule],
        courtPlanIndex: {}, // Mục 4: reset khi đổi luật cặp
      };
    }

    case 'REMOVE_PAIR_RULE': {
      return {
        ...baseNextState,
        pairRules: baseNextState.pairRules.filter((r) => r.id !== action.payload.ruleId),
        courtPlanIndex: {}, // Mục 4: reset khi đổi luật cặp
      };
    }

    // Mục 17: UPDATE_SETTINGS
    case 'UPDATE_SETTINGS': {
      const newSettings: SessionSettings = {
        ...baseNextState.settings,
        ...action.payload.settings,
        weights: {
          ...baseNextState.settings.weights,
          ...(action.payload.settings?.weights || {}),
        },
      };

      let updatedPlayers = baseNextState.players;
      if (newSettings.courtMode === 'SPLIT_COURT') {
        const existingCourtIds = new Set(baseNextState.courts.map((c) => c.id));
        updatedPlayers = baseNextState.players.map((p) => {
          if (p.assignedPool !== 'ALL' && !existingCourtIds.has(p.assignedPool)) {
            return { ...p, assignedPool: 'ALL' as const };
          }
          return p;
        });
      }

      return {
        ...baseNextState,
        settings: newSettings,
        players: updatedPlayers,
        courtPlanIndex: {}, // Mục 4: reset khi đổi settings
      };
    }

    case 'SNOOZE_AUTO_SINGLES':
    case 'SNOOZE_AUTO_SINGLES_WAIT': {
      return {
        ...baseNextState,
        autoSinglesSnooze: {
          ...baseNextState.autoSinglesSnooze,
          [action.payload.courtId]: {
            untilTs: action.payload.untilTs,
            queueSizeAtSnooze: action.payload.queueSize,
          },
        },
      };
    }

    case 'CYCLE_NEXT_UP_PROPOSAL': {
      const { courtId } = action.payload;
      const currentIdx = baseNextState.courtPlanIndex[courtId] ?? 0;
      return {
        ...baseNextState,
        courtPlanIndex: {
          ...baseNextState.courtPlanIndex,
          [courtId]: currentIdx + 1,
        },
      };
    }

    // Mục 19: DELETE_HISTORY_MATCH
    case 'DELETE_HISTORY_MATCH': {
      const { matchId } = action.payload;
      const matchIndex = baseNextState.history.findIndex((h) => h.id === matchId);
      if (matchIndex === -1) return state;

      const match = baseNextState.history[matchIndex];
      const matchPlayerIds = new Set([...match.team1, ...match.team2]);

      const updatedPlayers = baseNextState.players.map((p) => {
        if (matchPlayerIds.has(p.id)) {
          return {
            ...p,
            gamesPlayed: Math.max(0, p.gamesPlayed - 1),
            singlesCount: match.type === 'SINGLES' ? Math.max(0, p.singlesCount - 1) : p.singlesCount,
          };
        }
        return p;
      });

      const remainingHistory = baseNextState.history.filter((h) => h.id !== matchId);
      const updatedStats = buildStatsFromHistory(remainingHistory);

      return {
        ...baseNextState,
        players: updatedPlayers,
        history: remainingHistory,
        stats: updatedStats,
      };
    }

    default:
      return state;
  }
}

export interface RuleConflictInfo {
  playerAId: string;
  playerBId: string;
  ruleIds: string[];
  message: string;
}

/**
 * Selector kiểm tra các quy tắc cặp mâu thuẫn (LOCK vs AVOID) để cảnh báo trên UI (Mục 14)
 */
export function selectRuleConflicts(state: BadmintonSessionState): RuleConflictInfo[] {
  const conflicts: RuleConflictInfo[] = [];
  const rules = state.pairRules;

  for (let i = 0; i < rules.length - 1; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const r1 = rules[i];
      const r2 = rules[j];
      const isSamePair =
        (r1.playerAId === r2.playerAId && r1.playerBId === r2.playerBId) ||
        (r1.playerAId === r2.playerBId && r1.playerBId === r2.playerAId);

      if (isSamePair) {
        if (
          (r1.type === 'LOCK_PARTNER' && r2.type === 'AVOID_PARTNER') ||
          (r1.type === 'AVOID_PARTNER' && r2.type === 'LOCK_PARTNER')
        ) {
          const pA = state.players.find((p) => p.id === r1.playerAId);
          const pB = state.players.find((p) => p.id === r1.playerBId);
          conflicts.push({
            playerAId: r1.playerAId,
            playerBId: r1.playerBId,
            ruleIds: [r1.id, r2.id],
            message: `Mâu thuẫn luật: ${pA?.name || r1.playerAId} và ${pB?.name || r1.playerBId} vừa có luật CÙNG ĐỘI (LOCK) vừa có luật CẤM CÙNG ĐỘI (AVOID). Engine ưu tiên CẤM CÙNG ĐỘI.`,
          });
        }
      }
    }
  }
  return conflicts;
}
