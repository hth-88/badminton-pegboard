import React from 'react';
import { History, Trash2, Clock, Edit3, Flame, Lock } from 'lucide-react';
import type { MatchHistory, Player } from '../types/badminton';
import { RANK_METADATA } from '../engine/skillConfig';
import { getPrivateMatchReview } from '../engine/matchFeedbackStorage';

interface HistoryTabProps {
  history: MatchHistory[];
  players: Player[];
  isViewer?: boolean;
  onEditMatchResult?: (match: MatchHistory) => void;
  onDeleteMatch: (matchId: string) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  history,
  players,
  isViewer = false,
  onEditMatchResult,
  onDeleteMatch,
}) => {
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 p-3 md:p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <span>Lịch sử các trận đấu</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {history.length} trận
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ghi nhận thời gian và người tham gia từng trận
          </p>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-slate-900/60 border border-slate-800 text-slate-500">
          <History className="w-10 h-10 mx-auto mb-2 text-slate-600" />
          <p className="font-semibold text-slate-400 text-sm">Chưa có trận nào kết thúc</p>
          <p className="text-xs mt-1 text-slate-500">
            Khi bấm &quot;Kết thúc trận&quot; trên sân, lịch sử sẽ xuất hiện tại đây.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {[...history].reverse().map((match, idx) => {
            const matchIndex = history.length - idx;
            const privateReview = !isViewer ? getPrivateMatchReview(match.id) : null;
            return (
              <div
                key={match.id}
                className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition space-y-2"
              >
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-200">Trận #{matchIndex}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">{match.courtId.replace('court-', 'Sân ')}</span>
                    <span>•</span>
                    <span>{match.type === 'DOUBLES' ? 'Đôi' : 'Đơn'}</span>
                    {match.score && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-black font-mono text-[11px]">
                        {match.score.team1} - {match.score.team2}
                      </span>
                    )}
                    {!isViewer && match.balanceRating && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          match.balanceRating === 'BALANCED'
                            ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                            : match.balanceRating === 'SLIGHT_GAP'
                            ? 'bg-amber-950/70 text-amber-300 border-amber-800/60'
                            : 'bg-rose-950/70 text-rose-300 border-rose-800/60'
                        }`}
                      >
                        {match.balanceRating === 'BALANCED'
                          ? 'Cân hay'
                          : match.balanceRating === 'SLIGHT_GAP'
                          ? 'Chênh nhẹ'
                          : 'Chênh quá'}
                      </span>
                    )}
                    {!isViewer && privateReview && (
                      <span
                        title="Có nhận xét kín từng người"
                        className="text-[10px] text-amber-400 flex items-center gap-0.5"
                      >
                        <Lock className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {match.durationMinutes}p ({formatTime(match.startedAt)} - {formatTime(match.endedAt)})
                    </span>
                    {!isViewer && onEditMatchResult && (
                      <button
                        type="button"
                        onClick={() => onEditMatchResult(match)}
                        title="Cập nhật tỉ số / độ / nhận xét"
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-semibold flex items-center gap-1 transition"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Sửa</span>
                      </button>
                    )}
                    {!isViewer && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Xóa trận #${matchIndex}? Số trận và thống kê của người chơi sẽ được tự động cập nhật lại.`)) {
                            onDeleteMatch(match.id);
                          }
                        }}
                        title="Xóa trận này"
                        aria-label="Xóa trận này"
                        className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {match.bet && (
                  <div className="px-2.5 py-1 rounded-xl bg-amber-950/40 border border-amber-700/40 text-[11px] flex items-center justify-between gap-2 text-amber-200">
                    <span className="flex items-center gap-1 font-bold">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>Kèo độ: {match.bet.label}</span>
                    </span>
                    <span
                      className={`font-bold ${
                        match.betWinner === 1 || match.betWinner === 2
                          ? 'text-emerald-300'
                          : 'text-amber-400'
                      }`}
                    >
                      {match.betWinner === 1
                        ? '🏆 Đội 1 thắng'
                        : match.betWinner === 2
                        ? '🏆 Đội 2 thắng'
                        : '⚠️ Chưa chốt thắng'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Team 1 */}
                  <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/60 space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">ĐỘI 1</span>
                    {match.team1.map((pid) => {
                      const p = playerMap.get(pid);
                      return (
                        <div key={pid} className="flex items-center gap-1 truncate text-slate-200">
                          <span className={`w-1.5 h-1.5 rounded-full ${p?.sex === 'M' ? 'bg-sky-400' : 'bg-pink-400'}`} />
                          <span className="truncate">{p?.name || pid}</span>
                          {p && (
                            <span className={`text-[9px] px-1 rounded ${RANK_METADATA[p.rank].badgeBg} ${RANK_METADATA[p.rank].badgeText}`}>
                              {RANK_METADATA[p.rank].code}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Team 2 */}
                  <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/60 space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">ĐỘI 2</span>
                    {match.team2.map((pid) => {
                      const p = playerMap.get(pid);
                      return (
                        <div key={pid} className="flex items-center gap-1 truncate text-slate-200">
                          <span className={`w-1.5 h-1.5 rounded-full ${p?.sex === 'M' ? 'bg-sky-400' : 'bg-pink-400'}`} />
                          <span className="truncate">{p?.name || pid}</span>
                          {p && (
                            <span className={`text-[9px] px-1 rounded ${RANK_METADATA[p.rank].badgeBg} ${RANK_METADATA[p.rank].badgeText}`}>
                              {RANK_METADATA[p.rank].code}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
