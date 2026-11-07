import { describe, it, expect } from 'vitest';
import { migrateSessionState } from '../storage';
import { evaluateNextUp } from '../nextUp';
import { badmintonReducer } from '../sessionReducer';

describe('Storage and State Migration Defensiveness', () => {
  it('handles null, undefined, and legacy nextUp without crashing', () => {
    const legacy = {
      schemaVersion: 2,
      players: [
        { id: 'p1', name: 'Player 1', sex: 'M', rank: 'tb', status: 'ACTIVE' },
        { id: 'p2', name: 'Player 2', sex: 'M', rank: 'tb', status: 'ACTIVE' },
        { id: 'p3', name: 'Player 3', sex: 'F', rank: 'tb', status: 'ACTIVE' },
        { id: 'p4', name: 'Player 4', sex: 'F', rank: 'tb', status: 'ACTIVE' },
      ],
      courts: [
        { id: 'court-1', name: 'Sân 1', isActive: true, currentMatch: null, nextUp: null },
        {
          id: 'court-2',
          name: 'Sân 2',
          isActive: true,
          currentMatch: null,
          nextUp: { team1: ['p1', 'p2'], team2: ['p3', 'p4'], type: 'DOUBLES' },
        },
        {
          id: 'court-3',
          name: 'Sân 3',
          isActive: false,
          currentMatch: null,
          nextUp: { status: 'WAIT', message: 'Chưa đủ người' },
        },
      ],
    };

    const migrated = migrateSessionState(legacy);
    expect(migrated.courts[0].nextUp).toBeDefined();
    expect(migrated.courts[0].nextUp.slots).toHaveLength(4);
    expect(migrated.courts[0].nextUp.slotSource).toHaveLength(4);
    expect(migrated.courts[1].nextUp.slots).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(migrated.courts[2].nextUp.slots).toEqual([null, null, null, null]);
  });

  it('LOAD_STATE reducer action should handle dirty or legacy cloud state safely', () => {
    const rawCloudState: any = {
      schemaVersion: 2,
      players: [
        { id: 'p1', name: 'Player 1', sex: 'M', rank: 'tb', status: 'ACTIVE' },
        { id: 'p2', name: 'Player 2', sex: 'M', rank: 'tb', status: 'ACTIVE' },
      ],
      courts: [
        { id: 'court-1', name: 'Sân 1', isActive: true, currentMatch: null, nextUp: null },
        {
          id: 'court-2',
          name: 'Sân 2',
          isActive: true,
          currentMatch: null,
          nextUp: { team1: ['p1', 'p2'], team2: ['p3', 'p4'], type: 'DOUBLES' },
        },
      ],
    };

    // If LOAD_STATE is dispatched directly:
    const nextState = badmintonReducer(undefined as any, {
      type: 'LOAD_STATE',
      payload: rawCloudState,
    });

    // In current code, nextState.courts[0].nextUp is null!
    console.log('court-1 nextUp in LOAD_STATE:', nextState.courts[0].nextUp);
    console.log('court-2 nextUp in LOAD_STATE:', nextState.courts[1].nextUp);

    // If court-1.nextUp is null, evaluateNextUp and CourtCard will crash!
    // And on court-2, evaluateNextUp will crash because nextUp.slots is undefined!
    expect(() => evaluateNextUp(nextState.courts[0].nextUp, nextState.players)).not.toThrow();
    expect(() => evaluateNextUp(nextState.courts[1].nextUp, nextState.players)).not.toThrow();
  });
});