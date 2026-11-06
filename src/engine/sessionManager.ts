import type {
  BadmintonSessionState,
  Court,
  Lineup,
  NextUpDraft,
  Player,
} from '../types/badminton';
import { createEmptyNextUp } from './nextUp';
import {
  activatePlayerWithOffset,
  createDefaultCourts,
  createInitialSessionState,
  DEFAULT_SETTINGS,
} from './sessionReducer';
import {
  clearSession,
  loadSession,
  STORAGE_KEY_V2,
} from './storage';

export const STORAGE_KEY = STORAGE_KEY_V2;

export {
  activatePlayerWithOffset,
  createDefaultCourts,
  createInitialSessionState,
  DEFAULT_SETTINGS,
};

export type { BadmintonSessionState };

/**
 * Tạm dừng người chơi (nghỉ mệt, đi ra ngoài, về sớm)
 */
export function pausePlayer(player: Player): Player {
  return {
    ...player,
    status: 'PAUSED',
    waitStreak: 0,
  };
}

/**
 * Bắt đầu trận đấu trên sân
 */
export function startCourtMatch(
  courtId: string,
  courts: Court[],
  team1: string[],
  team2: string[],
  startedAt: number = Date.now()
): Court[] {
  const isDoubles = team1.length === 2 && team2.length === 2;
  const lineup: Lineup = {
    type: isDoubles ? 'DOUBLES' : 'SINGLES',
    team1,
    team2,
    slotSource: {
      ...Object.fromEntries(team1.map((id) => [id, 'AUTO' as const])),
      ...Object.fromEntries(team2.map((id) => [id, 'AUTO' as const])),
    },
  };

  return courts.map((court) => {
    if (court.id !== courtId) return court;
    return {
      ...court,
      currentMatch: {
        ...lineup,
        id: `match_${courtId}_${startedAt}`,
        startedAt,
      },
      nextUp: createEmptyNextUp(court.policy === 'SINGLES_ONLY' ? 'SINGLES' : 'DOUBLES'),
    };
  });
}

/**
 * Khóa hoặc mở khóa NextUp cho một sân
 */
export function setCourtNextUp(
  courtId: string,
  courts: Court[],
  nextUp: NextUpDraft
): Court[] {
  return courts.map((court) => {
    if (court.id !== courtId) return court;
    return {
      ...court,
      nextUp,
    };
  });
}

/**
 * Khôi phục trạng thái từ localStorage
 */
export function loadSessionFromStorage(): BadmintonSessionState | null {
  return loadSession();
}

/**
 * Xóa sạch dữ liệu trong localStorage để bắt đầu buổi mới
 */
export function clearSessionStorage(): void {
  clearSession();
}
