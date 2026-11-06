import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type {
  BadmintonRank,
  BadmintonSessionState,
  CourtPolicy,
  Lineup,
  PairRule,
  Player,
  SessionSettings,
} from '../types/badminton';
import { evaluateNextUp, type NextUpEvaluation } from './nextUp';
import {
  badmintonReducer,
  createInitialSessionState,
  selectRuleConflicts,
  type RuleConflictInfo,
} from './sessionReducer';
import {
  archiveCurrentSession,
  clearSession,
  debouncedSaveSession,
  getStorageError,
  loadSession,
  saveSessionImmediate,
  subscribeStorageError,
  validateAndMigrateImport,
} from './storage';

/**
 * Hook cập nhật timestamp mỗi 60 giây (Mục 0.15)
 * Dùng cho timer trận đấu, tính duration và tính toán kế hoạch sân đồng bộ
 */
export function useNowMinute(): number {
  const [nowMinute, setNowMinute] = useState(() => Math.floor(Date.now() / 60000) * 60000);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMinute(Math.floor(Date.now() / 60000) * 60000);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return nowMinute;
}

export function useBadmintonSession() {
  const [state, dispatch] = useReducer(badmintonReducer, null, () => {
    const saved = loadSession();
    return saved ?? createInitialSessionState();
  });

  const [storageError, setStorageError] = useState(() => getStorageError());
  const nowMinute = useNowMinute();

  // Đăng ký nhận sự kiện lỗi lưu trữ
  useEffect(() => {
    return subscribeStorageError((hasErr) => setStorageError(hasErr));
  }, []);

  // Tự động lưu vào localStorage có debounce 300ms
  useEffect(() => {
    debouncedSaveSession(state);
  }, [state]);

  // Mục 0.16: Lưu tức thì khi visibilitychange (document.hidden), pagehide và beforeunload
  useEffect(() => {
    const handleSave = () => {
      saveSessionImmediate(state);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleSave();
      }
    };

    window.addEventListener('beforeunload', handleSave);
    window.addEventListener('pagehide', handleSave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleSave);
      window.removeEventListener('pagehide', handleSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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

  const endMatch = useCallback((courtId: string, expectedMatchId?: string) => {
    dispatch({
      type: 'END_MATCH',
      payload: { courtId, now: Date.now(), expectedMatchId },
    });
  }, []);

  const endAndStartMatch = useCallback(
    (courtId: string, nextLineup?: Lineup, expectedMatchId?: string) => {
      dispatch({
        type: 'END_AND_START',
        payload: { courtId, now: Date.now(), nextLineup, expectedMatchId },
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

  const suggestNextUp = useCallback((courtId: string, now?: number) => {
    dispatch({ type: 'SUGGEST_NEXT_UP', payload: { courtId, now } });
  }, []);

  const setNextUpSlot = useCallback(
    (courtId: string, slotIndex: number, playerId: string | null) => {
      dispatch({
        type: 'SET_NEXT_UP_SLOT',
        payload: { courtId, slotIndex, playerId },
      });
    },
    []
  );

  const clearNextUp = useCallback((courtId: string) => {
    dispatch({ type: 'CLEAR_NEXT_UP', payload: { courtId } });
  }, []);

  const rearrangeNextUp = useCallback(
    (courtId: string, mode: 'ROTATE' | 'BALANCE') => {
      dispatch({ type: 'REARRANGE_NEXT_UP', payload: { courtId, mode } });
    },
    []
  );

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

  const updateCourt = useCallback(
    (
      courtId: string,
      updates: {
        name?: string;
        policy?: CourtPolicy;
        isActive?: boolean;
        forcedType?: 'DOUBLES' | 'SINGLES' | null;
      }
    ) => {
      dispatch({ type: 'UPDATE_COURT', payload: { courtId, updates } });
    },
    []
  );

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
    // Tự động lưu snapshot buổi vừa kết thúc vào Archive (nếu có ít nhất 1 trận đấu đã hoàn thành)
    if (state.history.length > 0) {
      archiveCurrentSession(state);
    }
    dispatch({ type: 'NEW_SESSION_KEEP_PLAYERS', payload: { now: Date.now() } });
  }, [state]);

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

  // Mục 0.17: Export / Import JSON
  const exportSession = useCallback((): string => {
    return JSON.stringify(state, null, 2);
  }, [state]);

  const importSession = useCallback(
    (json: string): { ok: true } | { ok: false; error: string } => {
      const res = validateAndMigrateImport(json);
      if (!res.ok) {
        return res;
      }

      // Trước khi LOAD_STATE, lưu bản sao buổi hiện tại vào key 'badminton_court_session_before_import' (try/catch)
      try {
        localStorage.setItem(
          'badminton_court_session_before_import',
          JSON.stringify(state)
        );
      } catch (backupErr) {
        console.warn('Không thể lưu bản sao buổi chơi trước khi import:', backupErr);
      }

      dispatch({ type: 'LOAD_STATE', payload: res.state });
      return { ok: true };
    },
    [state]
  );

  const loadCloudState = useCallback((cloudState: BadmintonSessionState) => {
    dispatch({ type: 'LOAD_STATE', payload: cloudState });
  }, []);

  // Đánh giá trực quan Next Up của từng sân (Section 7)
  const nextUpEval = useMemo<Record<string, NextUpEvaluation | null>>(() => {
    const evals: Record<string, NextUpEvaluation | null> = {};
    for (const c of state.courts || []) {
      evals[c.id] = evaluateNextUp(c.nextUp, state.players || [], state.settings?.maleBonus);
    }
    return evals;
  }, [state.courts, state.players, state.settings?.maleBonus]);

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
    nextUpEval,
    nowMinute,
    storageError,
    // Actions
    startMatch,
    endMatch,
    endAndStartMatch,
    swapPlayers,
    suggestNextUp,
    setNextUpSlot,
    clearNextUp,
    rearrangeNextUp,
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
    updateCourt,
    addPairRule,
    removePairRule,
    updateSettings,
    snoozeAutoSingles,
    deleteHistoryMatch,
    newSessionKeepPlayers,
    undo,
    redo,
    resetSession,
    exportSession,
    importSession,
    loadCloudState,
  };
}

export { selectRuleConflicts };
