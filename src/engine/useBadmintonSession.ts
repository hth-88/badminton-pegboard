import { useCallback, useEffect, useReducer } from 'react';
import type {
  BadmintonRank,
  Court,
  CourtPolicy,
  CourtPlanMap,
  Lineup,
  PairRule,
  Player,
  SessionSettings,
} from '../types/badminton';
import { planAllCourts } from './matchmaker';
import {
  badmintonReducer,
  createInitialSessionState,
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

  const swapPlayers = useCallback(
    (
      courtId: string,
      target: 'CURRENT' | 'NEXT_UP',
      slot1: { team: 1 | 2; index: number },
      slot2: { team: 1 | 2; index: number } | { playerId: string }
    ) => {
      dispatch({
        type: 'SWAP_PLAYERS',
        payload: { courtId, target, slot1, slot2 },
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
      playerId: string
    ) => {
      dispatch({
        type: 'SET_MANUAL_SLOT',
        payload: { courtId, target, team, index, playerId },
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

  const updateCourt = useCallback((courtId: string, updates: Partial<Court>) => {
    dispatch({ type: 'UPDATE_COURT', payload: { courtId, updates } });
  }, []);

  const removeCourt = useCallback((courtId: string) => {
    dispatch({ type: 'REMOVE_COURT', payload: { courtId } });
  }, []);

  const addPairRule = useCallback((rule: Omit<PairRule, 'id'>) => {
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
    // Actions
    startMatch,
    endMatch,
    swapPlayers,
    setManualSlot,
    setNextUp,
    clearNextUp,
    enqueueReadyQueue,
    dequeueReadyQueue,
    reorderReadyQueue,
    pausePlayer,
    resumePlayer,
    addPlayer,
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
    undo,
    redo,
    resetSession,
    planCourts,
  };
}
