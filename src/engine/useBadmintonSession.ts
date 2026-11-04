import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type {
  BadmintonRank,
  CourtPolicy,
  CourtPlanMap,
  Lineup,
  PairRule,
  Player,
  SessionSettings,
} from '../types/badminton';
import { planAllCourts, selectCourtPlans } from './matchmaker';
import {
  badmintonReducer,
  createInitialSessionState,
  selectRuleConflicts,
  type RuleConflictInfo,
} from './sessionReducer';
import {
  clearSession,
  debouncedSaveSession,
  loadSession,
  saveSessionImmediate,
} from './storage';

export function useBadmintonSession() {
  const [state, dispatch] = useReducer(badmintonReducer, null, () => {
    const saved = loadSession();
    return saved ?? createInitialSessionState();
  });

  // Tự động lưu vào localStorage có debounce 300ms
  useEffect(() => {
    debouncedSaveSession(state);
  }, [state]);

  // Đảm bảo lưu tức thì khi tab đóng hoặc reload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveSessionImmediate(state);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state]);

  // --- ACTIONS ---

  const startMatch = useCallback(
    (courtId: string, lineup?: Lineup) => {
      dispatch({
        type: 'START_MATCH',
        payload: { courtId, lineup, now: Date.now() },
      });
    },
    []
  );

  const endMatch = useCallback((courtId: string) => {
    dispatch({
      type: 'END_MATCH',
      payload: { courtId, now: Date.now() },
    });
  }, []);

  const endAndStartMatch = useCallback(
    (courtId: string, nextLineup?: Lineup) => {
      dispatch({
        type: 'END_AND_START',
        payload: { courtId, now: Date.now(), nextLineup },
      });
    },
    []
  );

  const swapPlayers = useCallback(
    (
      courtId: string,
      target: 'CURRENT' | 'NEXT_UP',
      slot1: { team: 1 | 2; index: number },
      slot2: { team: 1 | 2; index: number } | { playerId: string },
      baseLineup?: Lineup
    ) => {
      dispatch({
        type: 'SWAP_PLAYERS',
        payload: { courtId, target, slot1, slot2, baseLineup },
      });
    },
    []
  );

  const setManualSlot = useCallback(
    (
      courtId: string,
      target: 'CURRENT' | 'NEXT_UP',
      team: 1 | 2,
      index: number,
      playerId: string,
      baseLineup?: Lineup
    ) => {
      dispatch({
        type: 'SET_MANUAL_SLOT',
        payload: { courtId, target, team, index, playerId, baseLineup },
      });
    },
    []
  );

  const setNextUp = useCallback(
    (courtId: string, lineup: Lineup, isLockedByHost = false) => {
      dispatch({
        type: 'SET_NEXT_UP',
        payload: { courtId, lineup, isLockedByHost },
      });
    },
    []
  );

  const clearNextUp = useCallback((courtId: string) => {
    dispatch({ type: 'CLEAR_NEXT_UP', payload: { courtId } });
  }, []);

  const cycleNextUpProposal = useCallback((courtId: string) => {
    dispatch({ type: 'CYCLE_NEXT_UP_PROPOSAL', payload: { courtId } });
  }, []);

  const enqueueReadyQueue = useCallback(
    (lineup: Lineup, courtId?: string, isLockedByHost = false) => {
      dispatch({
        type: 'ENQUEUE_READY_QUEUE',
        payload: { lineup, courtId, isLockedByHost, now: Date.now() },
      });
    },
    []
  );

  const dequeueReadyQueue = useCallback((itemId: string) => {
    dispatch({ type: 'DEQUEUE_READY_QUEUE', payload: { itemId } });
  }, []);

  const reorderReadyQueue = useCallback((fromIndex: number, toIndex: number) => {
    dispatch({ type: 'REORDER_READY_QUEUE', payload: { fromIndex, toIndex } });
  }, []);

  const pausePlayer = useCallback((playerId: string) => {
    dispatch({ type: 'PAUSE_PLAYER', payload: { playerId } });
  }, []);

  const resumePlayer = useCallback((playerId: string) => {
    dispatch({ type: 'RESUME_PLAYER', payload: { playerId } });
  }, []);

  const addPlayer = useCallback(
    (
      playerData: Omit<
        Player,
        'gamesPlayed' | 'virtualGamesOffset' | 'waitStreak' | 'lastPlayedAt' | 'singlesCount'
      >
    ) => {
      dispatch({
        type: 'ADD_PLAYER',
        payload: { player: playerData, now: Date.now() },
      });
    },
    []
  );

  const addPlayers = useCallback(
    (
      playersData: Array<
        Omit<
          Player,
          'gamesPlayed' | 'virtualGamesOffset' | 'waitStreak' | 'lastPlayedAt' | 'singlesCount'
        >
      >
    ) => {
      dispatch({
        type: 'ADD_PLAYERS',
        payload: { players: playersData, now: Date.now() },
      });
    },
    []
  );

  const updatePlayer = useCallback((player: Partial<Player> & { id: string }) => {
    dispatch({ type: 'UPDATE_PLAYER', payload: { player } });
  }, []);

  const removePlayer = useCallback((playerId: string) => {
    dispatch({ type: 'REMOVE_PLAYER', payload: { playerId } });
  }, []);

  const editRank = useCallback((playerId: string, rank: BadmintonRank) => {
    dispatch({ type: 'EDIT_RANK', payload: { playerId, rank } });
  }, []);

  const addCourt = useCallback((name?: string, policy?: CourtPolicy) => {
    dispatch({ type: 'ADD_COURT', payload: { name, policy } });
  }, []);

  const updateCourt = useCallback((courtId: string, updates: { name?: string; policy?: CourtPolicy; isActive?: boolean }) => {
    dispatch({ type: 'UPDATE_COURT', payload: { courtId, updates } });
  }, []);

  const removeCourt = useCallback((courtId: string) => {
    dispatch({ type: 'REMOVE_COURT', payload: { courtId } });
  }, []);

  const addPairRule = useCallback((rule: PairRule | (Omit<PairRule, 'id'> & { id?: string })) => {
    dispatch({ type: 'ADD_PAIR_RULE', payload: { rule } });
  }, []);

  const removePairRule = useCallback((ruleId: string) => {
    dispatch({ type: 'REMOVE_PAIR_RULE', payload: { ruleId } });
  }, []);

  const updateSettings = useCallback((settings: Partial<SessionSettings>) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { settings } });
  }, []);

  const snoozeAutoSingles = useCallback(
    (courtId: string, queueSize: number) => {
      const snoozeMs = (state.settings.autoSinglesSnoozeMin || 5) * 60 * 1000;
      dispatch({
        type: 'SNOOZE_AUTO_SINGLES',
        payload: {
          courtId,
          untilTs: Date.now() + snoozeMs,
          queueSize,
        },
      });
    },
    [state.settings.autoSinglesSnoozeMin]
  );

  const deleteHistoryMatch = useCallback((matchId: string) => {
    dispatch({ type: 'DELETE_HISTORY_MATCH', payload: { matchId } });
  }, []);

  const newSessionKeepPlayers = useCallback(() => {
    dispatch({ type: 'NEW_SESSION_KEEP_PLAYERS', payload: { now: Date.now() } });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const resetSession = useCallback(() => {
    clearSession();
    dispatch({ type: 'RESET_SESSION' });
  }, []);

  // Lập kế hoạch cho toàn bộ các sân
  const planCourts = useCallback(
    (seed = 42): CourtPlanMap => {
      return planAllCourts(state, Date.now(), seed);
    },
    [state]
  );

  const ruleConflicts = useMemo<RuleConflictInfo[]>(() => {
    return selectRuleConflicts(state);
  }, [state]);

  return {
    state,
    players: state.players,
    courts: state.courts,
    history: state.history,
    pairRules: state.pairRules,
    settings: state.settings,
    stats: state.stats,
    mixDebt: state.mixDebt,
    readyQueue: state.readyQueue,
    autoSinglesSnooze: state.autoSinglesSnooze,
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,
    ruleConflicts,
    // Actions
    startMatch,
    endMatch,
    endAndStartMatch,
    swapPlayers,
    setManualSlot,
    setNextUp,
    clearNextUp,
    cycleNextUpProposal,
    enqueueReadyQueue,
    dequeueReadyQueue,
    reorderReadyQueue,
    pausePlayer,
    resumePlayer,
    addPlayer,
    addPlayers,
    updatePlayer,
    removePlayer,
    editRank,
    addCourt,
    updateCourt,
    removeCourt,
    addPairRule,
    removePairRule,
    updateSettings,
    snoozeAutoSingles,
    deleteHistoryMatch,
    newSessionKeepPlayers,
    undo,
    redo,
    resetSession,
    planCourts,
  };
}

export { selectCourtPlans, selectRuleConflicts };
