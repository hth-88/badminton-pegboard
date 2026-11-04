import type {
  BadmintonRank,
  BadmintonSessionSnapshot,
  BadmintonSessionState,
  Court,
  CourtPolicy,
  Lineup,
  MatchHistory,
  PairRule,
  Player,
  ReadyQueueItem,
  SessionSettings,
} from '../types/badminton';
import { DEFAULT_PENALTY_WEIGHTS } from '../types/badminton';
import { createEmptyStats, recordCompletedMatch } from './statsManager';

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

export function createDefaultCourts(count = 2): Court[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `court-${i + 1}`,
    name: `Sân ${i + 1}`,
    isActive: true,
    policy: 'MIX',
    currentMatch: null,
    nextUp: null,
  }));
}

export function createInitialSessionState(): BadmintonSessionState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    players: [],
    courts: createDefaultCourts(2),
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
 * Kích hoạt người chơi với virtualGamesOffset tự động
 */
export function activatePlayerWithOffset(player: Player, allPlayers: Player[]): Player {
  const otherActivePlayers = allPlayers.filter(
    (p) => p.id !== player.id && p.status === 'ACTIVE'
  );

  let newOffset = 0;
  if (otherActivePlayers.length > 0) {
    const minActiveEffective = Math.min(
      ...otherActivePlayers.map((p) => p.gamesPlayed + p.virtualGamesOffset)
    );
    newOffset = Math.max(0, minActiveEffective - player.gamesPlayed);
  }

  return {
    ...player,
    status: 'ACTIVE',
    virtualGamesOffset: newOffset,
    waitStreak: 0,
  };
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
      type: 'SWAP_PLAYERS';
      payload: {
        courtId: string;
        target: 'CURRENT' | 'NEXT_UP';
        slot1: { team: 1 | 2; index: number };
        slot2: { team: 1 | 2; index: number } | { playerId: string };
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
      payload: { lineup: Lineup; courtId?: string; isLockedByHost: boolean; now: number };
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
      payload: { courtId: string; updates: Partial<Court> };
    }
  | {
      type: 'REMOVE_COURT';
      payload: { courtId: string };
    }
  | {
      type: 'ADD_PAIR_RULE';
      payload: { rule: Omit<PairRule, 'id'> };
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
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET_SESSION' }
  | { type: 'LOAD_STATE'; payload: BadmintonSessionSnapshot };

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

  // Đối với các action thay đổi trạng thái, lưu snapshot vào undoStack (tối đa 30)
  const currentSnapshot = createSnapshot(state);
  const nextUndoStack = [currentSnapshot, ...state.undoStack].slice(0, 30);

  const baseNextState: BadmintonSessionState = {
    ...state,
    undoStack: nextUndoStack,
    redoStack: [], // Xóa redoStack khi có action mới
  };

  switch (action.type) {
    case 'START_MATCH': {
      const { courtId, now } = action.payload;
      const targetCourt = baseNextState.courts.find((c) => c.id === courtId);
      if (!targetCourt) return state;

      const lineupToStart = action.payload.lineup ?? targetCourt.nextUp;
      if (!lineupToStart) return state;

      const matchPlayers = new Set([...lineupToStart.team1, ...lineupToStart.team2]);

      // 1. Cập nhật waitStreak theo định nghĩa B1:
      // "mỗi khi một trận BẮT ĐẦU ở bất kỳ sân nào, mọi người ACTIVE đang rảnh và không ở trong trận đó được +1; người vào trận thì reset về 0."
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

      // 2. Cập nhật mixDebt (nếu trận không phải hoàn toàn do Host gán tay)
      const isManual = Object.values(lineupToStart.slotSource).every((s) => s === 'MANUAL');
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

      // 3. Cập nhật sân
      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          currentMatch: {
            ...lineupToStart,
            id: `match_${courtId}_${now}`,
            startedAt: now,
          },
          nextUp: null,
        };
      });

      // 4. Bỏ khỏi readyQueue nếu có
      const updatedReadyQueue = baseNextState.readyQueue.filter((item) => {
        const itemIds = [...item.lineup.team1, ...item.lineup.team2];
        const hasOverlap = itemIds.some((id) => matchPlayers.has(id));
        return !hasOverlap;
      });

      return {
        ...baseNextState,
        players: updatedPlayers,
        courts: updatedCourts,
        mixDebt: newMixDebt,
        readyQueue: updatedReadyQueue,
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

      // Cập nhật người chơi đã kết thúc trận
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

      // Cập nhật stats
      const updatedStats = recordCompletedMatch(baseNextState.stats, historyItem);

      // Cập nhật readyQueue trong SHARED_POOL (mục B3):
      // "Khi một sân kết thúc, nhóm ĐẦU hàng không bị khóa đi vào sân đó.
      // Nhóm có isLockedByHost chỉ dành cho đúng sân host gán"
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
      };
    }

    case 'SWAP_PLAYERS': {
      const { courtId, target, slot1, slot2 } = action.payload;
      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        const lineup = target === 'CURRENT' ? c.currentMatch : c.nextUp;
        if (!lineup) return c;

        const team1 = [...lineup.team1];
        const team2 = [...lineup.team2];
        const slotSource = { ...lineup.slotSource };

        const getPlayerAt = (slot: { team: 1 | 2; index: number }) =>
          slot.team === 1 ? team1[slot.index] : team2[slot.index];

        const setPlayerAt = (slot: { team: 1 | 2; index: number }, pid: string) => {
          if (slot.team === 1) team1[slot.index] = pid;
          else team2[slot.index] = pid;
          slotSource[pid] = 'MANUAL';
        };

        if ('playerId' in slot2) {
          // Thay người từ ngoài vào slot1
          setPlayerAt(slot1, slot2.playerId);
        } else {
          // Đổi chỗ 2 slot trong trận
          const p1 = getPlayerAt(slot1);
          const p2 = getPlayerAt(slot2);
          setPlayerAt(slot1, p2);
          setPlayerAt(slot2, p1);
        }

        if (target === 'CURRENT' && c.currentMatch) {
          return {
            ...c,
            currentMatch: {
              ...c.currentMatch,
              team1,
              team2,
              slotSource,
            },
          };
        } else if (target === 'NEXT_UP' && c.nextUp) {
          return {
            ...c,
            nextUp: {
              ...c.nextUp,
              team1,
              team2,
              slotSource,
            },
          };
        }
        return c;
      });

      return {
        ...baseNextState,
        courts: updatedCourts,
      };
    }

    case 'SET_MANUAL_SLOT': {
      const { courtId, target, team, index, playerId } = action.payload;
      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        const lineup = target === 'CURRENT' ? c.currentMatch : c.nextUp;
        if (!lineup) return c;

        const team1 = [...lineup.team1];
        const team2 = [...lineup.team2];
        const slotSource = { ...lineup.slotSource, [playerId]: 'MANUAL' as const };

        if (team === 1) team1[index] = playerId;
        else team2[index] = playerId;

        if (target === 'CURRENT' && c.currentMatch) {
          return {
            ...c,
            currentMatch: {
              ...c.currentMatch,
              team1,
              team2,
              slotSource,
            },
          };
        } else if (target === 'NEXT_UP' && c.nextUp) {
          return {
            ...c,
            nextUp: {
              ...c.nextUp,
              team1,
              team2,
              slotSource,
            },
          };
        }
        return c;
      });

      return {
        ...baseNextState,
        courts: updatedCourts,
      };
    }

    case 'SET_NEXT_UP': {
      const { courtId, lineup, isLockedByHost = false } = action.payload;
      const updatedCourts = baseNextState.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          nextUp: { ...lineup, isLockedByHost },
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
      const newItem: ReadyQueueItem = {
        id: `queue_${action.payload.now}_${Math.random().toString(36).substring(2, 6)}`,
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

    case 'PAUSE_PLAYER': {
      const updatedPlayers = baseNextState.players.map((p) =>
        p.id === action.payload.playerId ? { ...p, status: 'PAUSED' as const, waitStreak: 0 } : p
      );
      return {
        ...baseNextState,
        players: updatedPlayers,
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
      };
    }

    case 'UPDATE_PLAYER': {
      const updatedPlayers = baseNextState.players.map((p) =>
        p.id === action.payload.player.id ? { ...p, ...action.payload.player } : p
      );
      return {
        ...baseNextState,
        players: updatedPlayers,
      };
    }

    case 'REMOVE_PLAYER': {
      const pid = action.payload.playerId;
      return {
        ...baseNextState,
        players: baseNextState.players.filter((p) => p.id !== pid),
        pairRules: baseNextState.pairRules.filter(
          (r) => r.playerAId !== pid && r.playerBId !== pid
        ),
      };
    }

    case 'EDIT_RANK': {
      const updatedPlayers = baseNextState.players.map((p) =>
        p.id === action.payload.playerId ? { ...p, rank: action.payload.rank } : p
      );
      return {
        ...baseNextState,
        players: updatedPlayers,
      };
    }

    case 'ADD_COURT': {
      const count = baseNextState.courts.length + 1;
      const newCourt: Court = {
        id: action.payload.id || `court-${count}`,
        name: action.payload.name || `Sân ${count}`,
        isActive: true,
        policy: action.payload.policy || 'MIX',
        currentMatch: null,
        nextUp: null,
      };
      return {
        ...baseNextState,
        courts: [...baseNextState.courts, newCourt],
      };
    }

    case 'UPDATE_COURT': {
      const updatedCourts = baseNextState.courts.map((c) =>
        c.id === action.payload.courtId ? { ...c, ...action.payload.updates } : c
      );
      return {
        ...baseNextState,
        courts: updatedCourts,
      };
    }

    case 'REMOVE_COURT': {
      return {
        ...baseNextState,
        courts: baseNextState.courts.filter((c) => c.id !== action.payload.courtId),
      };
    }

    case 'ADD_PAIR_RULE': {
      const id = `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newRule: PairRule = { ...action.payload.rule, id };
      return {
        ...baseNextState,
        pairRules: [...baseNextState.pairRules, newRule],
      };
    }

    case 'REMOVE_PAIR_RULE': {
      return {
        ...baseNextState,
        pairRules: baseNextState.pairRules.filter((r) => r.id !== action.payload.ruleId),
      };
    }

    case 'UPDATE_SETTINGS': {
      return {
        ...baseNextState,
        settings: {
          ...baseNextState.settings,
          ...action.payload.settings,
          weights: {
            ...baseNextState.settings.weights,
            ...(action.payload.settings.weights || {}),
          },
        },
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

    default:
      return state;
  }
}
