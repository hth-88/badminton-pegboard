import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Users,
  Swords,
  HeartHandshake,
  TrendingUp,
  Award,
  ArrowUpDown,
} from 'lucide-react';
import type {
  BadmintonRank,
  MatchHistory,
  MatchmakingStats,
  Player,
} from '../types/badminton';
import { RANK_METADATA } from '../engine/skillConfig';
import { getOpponentCount, getPartnerCount } from '../engine/statsManager';
import { RankAdvisorPanel } from './RankAdvisorPanel';
import { GenderDot, RankBadge, StatusPill } from './ui/Primitives';

interface EquityTableProps {
  players: Player[];
  stats: MatchmakingStats;
  history?: MatchHistory[];
  maleBonus?: number;
  isViewer?: boolean;
  hideRankAdvisor?: boolean;
  onApplyRank?: (playerId: string, rank: BadmintonRank) => void;
}

export const EquityTable: React.FC<EquityTableProps> = ({
  players,
  stats,
  history,
  maleBonus = 1.5,
  isViewer = false,
  hideRankAdvisor = false,
  onApplyRank,
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    players[0]?.id || ''
  );
  const [sortBy, setSortBy] = useState<'GAMES' | 'WAIT' | 'NAME'>('GAMES');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const activePlayers = useMemo(() => {
    return players.filter((p) => p.status === 'ACTIVE');
  }, [players]);

  const summary = useMemo(() => {
    if (activePlayers.length === 0) {
      return { maxGames: 0, minGames: 0, gap: 0, avgGames: 0 };
    }
    const counts = activePlayers.map((p) => p.gamesPlayed);
    const maxGames = Math.max(...counts);
    const minGames = Math.min(...counts);
    const total = counts.reduce((a, b) => a + b, 0);
    const avgGames = Number((total / activePlayers.length).toFixed(1));
    return { maxGames, minGames, gap: maxGames - minGames, avgGames };
  }, [activePlayers]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (sortBy === 'GAMES') {
        const diff = a.gamesPlayed - b.gamesPlayed;
        return sortAsc ? diff : -diff;
      }
      if (sortBy === 'WAIT') {
        const diff = a.waitStreak - b.waitStreak;
        return sortAsc ? diff : -diff;
      }
      return sortAsc
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });
  }, [players, sortBy, sortAsc]);

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  const playerRelationships = useMemo(() => {
    if (!selectedPlayerId) return { partners: [], opponents: [] };

    const others = players.filter((p) => p.id !== selectedPlayerId);

    const partners = others
      .map((other) => ({
        player: other,
        count: getPartnerCount(stats, selectedPlayerId, other.id),
      }))
      .sort((a, b) => b.count - a.count);

    const opponents = others
      .map((other) => ({
        player: other,
        count: getOpponentCount(stats, selectedPlayerId, other.id),
      }))
      .sort((a, b) => b.count - a.count);

    return { partners, opponents };
  }, [players, stats, selectedPlayerId]);

  return (
    <div className="space-y-5">
      {/* 1. SUMMARY METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Nhiều nhất',
            value: summary.maxGames,
            unit: 'trận',
            icon: Award,
            tone: 'var(--color-accent)',
          },
          {
            label: 'Ít nhất',
            value: summary.minGames,
            unit: 'trận',
            icon: TrendingUp,
            tone: 'var(--text-primary)',
          },
          {
            label: 'Độ lệch',
            value: summary.gap,
            unit: 'trận',
            icon: BarChart3,
            tone: summary.gap <= 1 ? 'var(--color-accent)' : 'var(--color-warning)',
          },
          {
            label: 'Trung bình',
            value: summary.avgGames,
            unit: 'trận',
            icon: Users,
            tone: 'var(--text-primary)',
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="ui-card p-4 space-y-1.5">
              <div
                className="flex items-center gap-1.5 text-[13px] font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Icon className="w-4 h-4 shrink-0" style={{ color: metric.tone }} />
                <span className="truncate">{metric.label}</span>
              </div>
              <p
                className="text-[22px] font-bold tabular-nums leading-tight"
                style={{ color: metric.tone }}
              >
                {metric.value}{' '}
                <span
                  className="text-[13px] font-medium"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {metric.unit}
                </span>
              </p>
            </div>
          );
        })}
      </div>

      {/* 2. EQUITY TABLE */}
      <div className="ui-card p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3
            className="font-bold text-[16px] flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <BarChart3
              className="w-4 h-4"
              style={{ color: 'var(--color-accent)' }}
            />
            <span>Thống kê số trận</span>
          </h3>

          <button
            type="button"
            onClick={() => {
              if (sortBy === 'GAMES') setSortAsc(!sortAsc);
              else {
                setSortBy('GAMES');
                setSortAsc(false);
              }
            }}
            className="ui-btn ui-btn-secondary min-h-[38px] px-3 text-[13px]"
          >
            <span>Số trận</span>
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-[14px] text-left">
            <thead>
              <tr
                className="border-b ui-divider text-[13px]"
                style={{ color: 'var(--text-muted)' }}
              >
                <th className="py-2.5 px-2 font-semibold">Người chơi</th>
                <th className="py-2.5 px-2 font-semibold text-center">Trình</th>
                <th className="py-2.5 px-2 font-semibold text-center">Thực tế</th>
                <th className="py-2.5 px-2 font-semibold text-center">Bù ảo</th>
                <th className="py-2.5 px-2 font-semibold text-center">Hiệu dụng</th>
                <th className="py-2.5 px-2 font-semibold text-center">Đôi / Đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y ui-divider">
              {sortedPlayers.map((player) => {
                const effectiveGames = player.gamesPlayed + player.virtualGamesOffset;
                const doublesCount = Math.max(
                  0,
                  player.gamesPlayed - (player.singlesCount || 0)
                );

                const isMax =
                  player.gamesPlayed === summary.maxGames && summary.maxGames > 0;
                const isMin =
                  player.gamesPlayed === summary.minGames &&
                  summary.maxGames > summary.minGames;
                const isSelected = selectedPlayerId === player.id;

                return (
                  <tr
                    key={player.id}
                    onClick={() => setSelectedPlayerId(player.id)}
                    className="cursor-pointer transition"
                    style={
                      isSelected
                        ? { backgroundColor: 'var(--bg-surface-secondary)' }
                        : undefined
                    }
                  >
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2 max-w-[140px]">
                        <GenderDot sex={player.sex} />
                        <span
                          className="font-semibold truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {player.name}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-2 text-center">
                      <RankBadge rank={player.rank} surface="card" />
                    </td>

                    <td className="py-3 px-2 text-center tabular-nums">
                      {isMax ? (
                        <StatusPill tone="accent">{player.gamesPlayed}</StatusPill>
                      ) : isMin ? (
                        <StatusPill tone="warning">{player.gamesPlayed}</StatusPill>
                      ) : (
                        <span
                          className="font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {player.gamesPlayed}
                        </span>
                      )}
                    </td>

                    <td
                      className="py-3 px-2 text-center tabular-nums"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {player.virtualGamesOffset > 0 ? (
                        <span
                          className="font-semibold"
                          style={{ color: 'var(--color-warning)' }}
                        >
                          +{player.virtualGamesOffset}
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>

                    <td
                      className="py-3 px-2 text-center font-bold tabular-nums"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {effectiveGames}
                    </td>

                    <td
                      className="py-3 px-2 text-center text-[13px] tabular-nums"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span>{doublesCount} đôi</span>
                      {player.singlesCount > 0 && (
                        <span> / {player.singlesCount} đơn</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. PARTNER / OPPONENT MATRIX */}
      <div className="ui-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3
              className="font-bold text-[16px] flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <HeartHandshake
                className="w-4 h-4"
                style={{ color: 'var(--color-accent)' }}
              />
              <span>Ma trận bắt cặp &amp; đối đầu</span>
            </h3>
            <p
              className="text-[13px] mt-0.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Chọn một người để xem lịch sử ghép cặp và đối đầu
            </p>
          </div>

          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="ui-select w-auto min-w-[168px]"
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({RANK_METADATA[p.rank].code})
              </option>
            ))}
          </select>
        </div>

        {selectedPlayer && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Partners */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-2 border-b ui-divider">
                <span
                  className="text-[13px] font-bold flex items-center gap-1.5"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <HeartHandshake className="w-4 h-4" />
                  <span>CÙNG ĐỘI</span>
                </span>
                <span
                  className="text-[12px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Số lần
                </span>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
                {playerRelationships.partners.length === 0 ? (
                  <p
                    className="text-[14px] text-center py-6"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Chưa bắt cặp với ai
                  </p>
                ) : (
                  playerRelationships.partners.map(({ player, count }) => (
                    <div
                      key={player.id}
                      className="ui-tile px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GenderDot sex={player.sex} />
                        <span
                          className="text-[14px] font-medium truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {player.name}
                        </span>
                        <RankBadge rank={player.rank} surface="tile" />
                      </div>
                      <span
                        className="text-[13px] font-semibold tabular-nums shrink-0"
                        style={{
                          color:
                            count > 0 ? 'var(--color-accent)' : 'var(--text-muted)',
                        }}
                      >
                        {count} lần
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Opponents */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-2 border-b ui-divider">
                <span
                  className="text-[13px] font-bold flex items-center gap-1.5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Swords className="w-4 h-4" />
                  <span>ĐỐI ĐẦU</span>
                </span>
                <span
                  className="text-[12px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Số lần
                </span>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
                {playerRelationships.opponents.length === 0 ? (
                  <p
                    className="text-[14px] text-center py-6"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Chưa đối đầu với ai
                  </p>
                ) : (
                  playerRelationships.opponents.map(({ player, count }) => (
                    <div
                      key={player.id}
                      className="ui-tile px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GenderDot sex={player.sex} />
                        <span
                          className="text-[14px] font-medium truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {player.name}
                        </span>
                        <RankBadge rank={player.rank} surface="tile" />
                      </div>
                      <span
                        className="text-[13px] font-semibold tabular-nums shrink-0"
                        style={{
                          color:
                            count > 0 ? 'var(--color-danger)' : 'var(--text-muted)',
                        }}
                      >
                        {count} lần
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Rank Advisor (Host only) */}
      {!hideRankAdvisor && !isViewer && onApplyRank && history && (
        <RankAdvisorPanel
          players={players}
          history={history}
          maleBonus={maleBonus}
          onApplyRank={onApplyRank}
        />
      )}
    </div>
  );
};
