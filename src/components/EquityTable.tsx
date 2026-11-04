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
import type { MatchmakingStats, Player } from '../types/badminton';
import { RANK_METADATA } from '../engine/skillConfig';
import { getOpponentCount, getPartnerCount } from '../engine/statsManager';

interface EquityTableProps {
  players: Player[];
  stats: MatchmakingStats;
}

export const EquityTable: React.FC<EquityTableProps> = ({ players, stats }) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    players[0]?.id || ''
  );
  const [sortBy, setSortBy] = useState<'GAMES' | 'WAIT' | 'NAME'>('GAMES');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Active and paused players
  const activePlayers = useMemo(() => {
    return players.filter((p) => p.status === 'ACTIVE');
  }, [players]);

  // Max, Min, Gap
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

  // Sắp xếp danh sách
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
      return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    });
  }, [players, sortBy, sortAsc]);

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  // Ma trận đối đầu / bắt cặp của người được chọn
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
    <div className="space-y-5 text-slate-100">
      {/* 1. OVERVIEW SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Award className="w-3.5 h-3.5 text-emerald-400" />
            <span>Nhiều trận nhất</span>
          </div>
          <p className="text-xl font-black text-emerald-400">
            {summary.maxGames} <span className="text-xs font-normal text-slate-400">trận</span>
          </p>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span>Ít trận nhất</span>
          </div>
          <p className="text-xl font-black text-amber-400">
            {summary.minGames} <span className="text-xs font-normal text-slate-400">trận</span>
          </p>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
            <span>Độ lệch (Max - Min)</span>
          </div>
          <p className={`text-xl font-black ${summary.gap <= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {summary.gap} <span className="text-xs font-normal text-slate-400">trận</span>
          </p>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Trung bình</span>
          </div>
          <p className="text-xl font-black text-indigo-400">
            {summary.avgGames} <span className="text-xs font-normal text-slate-400">trận/người</span>
          </p>
        </div>
      </div>

      {/* 2. BẢNG TỔNG KẾT NGƯỜI CHƠI */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>Bảng thống kê số trận</span>
          </h3>

          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => {
                if (sortBy === 'GAMES') setSortAsc(!sortAsc);
                else {
                  setSortBy('GAMES');
                  setSortAsc(false);
                }
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
                sortBy === 'GAMES'
                  ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Số trận</span>
              <ArrowUpDown className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 px-2 font-semibold">Người chơi</th>
                <th className="py-2 px-2 font-semibold text-center">Trình</th>
                <th className="py-2 px-2 font-semibold text-center">Thực tế</th>
                <th className="py-2 px-2 font-semibold text-center">Bù ảo</th>
                <th className="py-2 px-2 font-semibold text-center">Hiệu dụng</th>
                <th className="py-2 px-2 font-semibold text-center">Đôi / Đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedPlayers.map((player) => {
                const rankMeta = RANK_METADATA[player.rank];
                const effectiveGames = player.gamesPlayed + player.virtualGamesOffset;
                const doublesCount = Math.max(0, player.gamesPlayed - (player.singlesCount || 0));

                const isMax = player.gamesPlayed === summary.maxGames && summary.maxGames > 0;
                const isMin = player.gamesPlayed === summary.minGames && summary.maxGames > summary.minGames;

                return (
                  <tr
                    key={player.id}
                    onClick={() => setSelectedPlayerId(player.id)}
                    className={`hover:bg-slate-850 cursor-pointer transition ${
                      selectedPlayerId === player.id ? 'bg-slate-800/70 font-semibold' : ''
                    }`}
                  >
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5 truncate max-w-[130px]">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            player.sex === 'M' ? 'bg-sky-400' : 'bg-pink-400'
                          }`}
                        />
                        <span className="truncate">{player.name}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-2 text-center">
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${rankMeta.badgeBg} ${rankMeta.badgeText}`}>
                        {rankMeta.code}
                      </span>
                    </td>

                    <td className="py-2.5 px-2 text-center font-bold">
                      <span
                        className={`px-2 py-0.5 rounded-full inline-block ${
                          isMax
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : isMin
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                            : 'text-slate-200'
                        }`}
                      >
                        {player.gamesPlayed}
                      </span>
                    </td>

                    <td className="py-2.5 px-2 text-center text-slate-400">
                      {player.virtualGamesOffset > 0 ? (
                        <span className="text-amber-400 font-semibold">+{player.virtualGamesOffset}</span>
                      ) : (
                        '0'
                      )}
                    </td>

                    <td className="py-2.5 px-2 text-center font-bold text-slate-100">
                      {effectiveGames}
                    </td>

                    <td className="py-2.5 px-2 text-center text-slate-400">
                      <span>{doublesCount} đôi</span>
                      {player.singlesCount > 0 && (
                        <span className="text-indigo-400 font-medium"> / {player.singlesCount} đơn</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. MA TRẬN BẮT CẶP & ĐỐI ĐẦU (PARTNER / OPPONENT MATRIX) */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
              <HeartHandshake className="w-4 h-4 text-emerald-400" />
              <span>Ma trận bắt cặp & đối đầu</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Chọn một người để xem lịch sử bắt cặp cùng đội và đối đầu
            </p>
          </div>

          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="bg-slate-800 text-slate-100 border border-slate-700 text-xs font-bold rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({RANK_METADATA[p.rank].code})
              </option>
            ))}
          </select>
        </div>

        {selectedPlayer && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Cùng đội (Partners) */}
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-bold border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <HeartHandshake className="w-4 h-4" />
                  <span>ĐÃ BẮT CẶP CÙNG ĐỘI</span>
                </span>
                <span className="text-[11px] text-slate-500">Số lần</span>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar pt-1">
                {playerRelationships.partners.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">Chưa bắt cặp với ai</p>
                ) : (
                  playerRelationships.partners.map(({ player, count }) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/40"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            player.sex === 'M' ? 'bg-sky-400' : 'bg-pink-400'
                          }`}
                        />
                        <span className="truncate">{player.name}</span>
                        <span className="text-[10px] text-slate-500">
                          ({RANK_METADATA[player.rank].code})
                        </span>
                      </div>
                      <span className={`font-bold font-mono px-2 py-0.5 rounded ${count > 0 ? 'bg-emerald-950 text-emerald-300' : 'text-slate-600'}`}>
                        {count} lần
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Đối đầu (Opponents) */}
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-bold border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5 text-rose-400">
                  <Swords className="w-4 h-4" />
                  <span>ĐÃ ĐỐI ĐẦU KHÁC ĐỘI</span>
                </span>
                <span className="text-[11px] text-slate-500">Số lần</span>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar pt-1">
                {playerRelationships.opponents.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">Chưa đối đầu với ai</p>
                ) : (
                  playerRelationships.opponents.map(({ player, count }) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/40"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            player.sex === 'M' ? 'bg-sky-400' : 'bg-pink-400'
                          }`}
                        />
                        <span className="truncate">{player.name}</span>
                        <span className="text-[10px] text-slate-500">
                          ({RANK_METADATA[player.rank].code})
                        </span>
                      </div>
                      <span className={`font-bold font-mono px-2 py-0.5 rounded ${count > 0 ? 'bg-rose-950 text-rose-300' : 'text-slate-600'}`}>
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
    </div>
  );
};
