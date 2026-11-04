import { describe, expect, it } from 'vitest';
import type { Court, MatchHistory, Player } from '../../types/badminton';
import { planAllCourts } from '../matchmaker';
import {
  badmintonReducer,
  createDefaultCourts,
  createInitialSessionState,
} from '../sessionReducer';

describe('20-Match Full Simulation on 2 Courts with 16 Players', () => {
  const create16Players = (): Player[] => {
    return [
      // 8 Nam (từ y- đến tbk)
      {
        id: 'm1',
        name: 'Nam 1',
        sex: 'M',
        rank: 'y-',
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
      {
        id: 'm2',
        name: 'Nam 2',
        sex: 'M',
        rank: 'y+',
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
      {
        id: 'm3',
        name: 'Nam 3',
        sex: 'M',
        rank: 'tby',
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
      {
        id: 'm4',
        name: 'Nam 4',
        sex: 'M',
        rank: 'tby+',
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
      {
        id: 'm5',
        name: 'Nam 5',
        sex: 'M',
        rank: 'tb-',
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
      {
        id: 'm6',
        name: 'Nam 6',
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
      {
        id: 'm7',
        name: 'Nam 7',
        sex: 'M',
        rank: 'tb+',
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
      {
        id: 'm8',
        name: 'Nam 8',
        sex: 'M',
        rank: 'tbk',
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

      // 8 Nữ (từ newbie đến tb++)
      {
        id: 'f1',
        name: 'Nữ 1',
        sex: 'F',
        rank: 'newbie',
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
      {
        id: 'f2',
        name: 'Nữ 2',
        sex: 'F',
        rank: 'y',
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
      {
        id: 'f3',
        name: 'Nữ 3',
        sex: 'F',
        rank: 'tby-',
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
      {
        id: 'f4',
        name: 'Nữ 4',
        sex: 'F',
        rank: 'tby',
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
      {
        id: 'f5',
        name: 'Nữ 5',
        sex: 'F',
        rank: 'tb-',
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
      {
        id: 'f6',
        name: 'Nữ 6',
        sex: 'F',
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
      {
        id: 'f7',
        name: 'Nữ 7',
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
        joinedAt: 1000,
      },
      {
        id: 'f8',
        name: 'Nữ 8',
        sex: 'F',
        rank: 'tb++',
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
  };

  it('chạy thử 20 trận liên tiếp với 16 người trên 2 sân thỏa mãn cả 3 tiêu chuẩn vàng', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(2);
    state.players = create16Players();
    state.settings.courtMode = 'SHARED_POOL';

    let currentTime = 100000;
    const matchDurations: number[] = [14, 15, 13, 16, 14, 15, 13, 15];
    let durationIdx = 0;

    // Quản lý thời gian kết thúc dự kiến của từng sân
    const scheduledEndTime: Record<string, number> = {};

    let totalFinishedMatches = 0;
    let totalStartedMatches = 0;
    const TARGET_MATCHES = 20;

    // Vòng lặp xoay tua cho tới khi hoàn tất đúng 20 trận
    while (totalFinishedMatches < TARGET_MATCHES) {
      // 1. Lập kế hoạch cho các sân đang rảnh (nếu chưa vượt quá số trận mục tiêu)
      const freeCourts = state.courts.filter((c: Court) => !c.currentMatch);

      if (freeCourts.length > 0 && totalStartedMatches < TARGET_MATCHES) {
        const plan = planAllCourts(state, currentTime, totalFinishedMatches * 31 + 7);

        for (const court of freeCourts) {
          if (totalStartedMatches >= TARGET_MATCHES) break;

          const courtPlan = plan[court.id];
          if (courtPlan && courtPlan.status === 'OK' && courtPlan.proposals.length > 0) {
            const chosen = courtPlan.proposals[0];
            const dur = matchDurations[durationIdx % matchDurations.length];
            durationIdx++;

            state = badmintonReducer(state, {
              type: 'START_MATCH',
              payload: {
                courtId: court.id,
                lineup: chosen.lineup,
                now: currentTime,
              },
            });

            scheduledEndTime[court.id] = currentTime + dur * 60000;
            totalStartedMatches++;
          }
        }
      }

      // 2. Tìm sân có trận kết thúc sớm nhất
      const busyCourts = state.courts.filter((c: Court) => c.currentMatch !== null);
      if (busyCourts.length === 0) break;

      busyCourts.sort((a: Court, b: Court) => scheduledEndTime[a.id] - scheduledEndTime[b.id]);
      const earliestCourt = busyCourts[0];
      const finishTime = scheduledEndTime[earliestCourt.id];

      currentTime = finishTime;
      delete scheduledEndTime[earliestCourt.id];

      state = badmintonReducer(state, {
        type: 'END_MATCH',
        payload: {
          courtId: earliestCourt.id,
          now: currentTime,
        },
      });

      totalFinishedMatches++;
    }

    // --- KIỂM CHỨNG TIÊU CHUẨN 1: Số trận mọi người chênh nhau không quá 1 trận ---
    const gamesPlayedList = state.players.map((p: Player) => p.gamesPlayed);
    const minGames = Math.min(...gamesPlayedList);
    const maxGames = Math.max(...gamesPlayedList);
    const gameDisparity = maxGames - minGames;

    console.log(
      `Kết quả phân phối số trận qua ${totalFinishedMatches} trận: Min = ${minGames}, Max = ${maxGames}, Chênh lệch = ${gameDisparity}`
    );
    expect(gameDisparity).toBeLessThanOrEqual(1);

    // --- KIỂM CHỨNG TIÊU CHUẨN 2: Không ai bị lặp lại nguyên xi cặp đấu liên tiếp ---
    for (const player of state.players) {
      const playerMatches = state.history.filter(
        (h: MatchHistory) => h.team1.includes(player.id) || h.team2.includes(player.id)
      );

      for (let i = 0; i < playerMatches.length - 1; i++) {
        const m1 = playerMatches[i];
        const m2 = playerMatches[i + 1];

        const partner1 = m1.team1.includes(player.id)
          ? m1.team1.find((id: string) => id !== player.id)
          : m1.team2.find((id: string) => id !== player.id);

        const partner2 = m2.team1.includes(player.id)
          ? m2.team1.find((id: string) => id !== player.id)
          : m2.team2.find((id: string) => id !== player.id);

        if (partner1 && partner2) {
          expect(partner1).not.toBe(partner2);
        }
      }
    }

    // --- KIỂM CHỨNG TIÊU CHUẨN 3: Tổng trình độ 2 bên luôn cân bằng ---
    const skillDiffs: number[] = [];
    for (const match of state.history) {
      const getSkill = (id: string) => {
        const p = state.players.find((pl: Player) => pl.id === id)!;
        const base =
          p.rank === 'newbie' ? 1.0 :
          p.rank === 'y-' ? 2.0 :
          p.rank === 'y' ? 3.0 :
          p.rank === 'y+' ? 4.0 :
          p.rank === 'tby-' ? 5.0 :
          p.rank === 'tby' ? 6.0 :
          p.rank === 'tby+' ? 7.0 :
          p.rank === 'tb-' ? 8.5 :
          p.rank === 'tb' ? 10.0 :
          p.rank === 'tb+' ? 11.5 :
          p.rank === 'tb++' ? 13.0 : 14.5;
        return p.sex === 'M' ? base + 1.5 : base;
      };

      const t1Skill = match.team1.reduce((sum: number, id: string) => sum + getSkill(id), 0);
      const t2Skill = match.team2.reduce((sum: number, id: string) => sum + getSkill(id), 0);
      const diff = Math.abs(t1Skill - t2Skill);
      skillDiffs.push(diff);

      expect(diff).toBeLessThanOrEqual(10.0);
    }

    const avgSkillDiff = skillDiffs.reduce((a, b) => a + b, 0) / skillDiffs.length;
    console.log(`Độ chênh lệch trình độ trung bình giữa 2 đội: ${avgSkillDiff.toFixed(2)}`);
    expect(avgSkillDiff).toBeLessThan(2.0);
  });
});
