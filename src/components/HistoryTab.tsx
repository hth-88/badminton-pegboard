import React from 'react';
import { History, Trash2, Clock } from 'lucide-react';
import type { MatchHistory, Player } from '../types/badminton';
import { RANK_METADATA } from '../engine/skillConfig';

interface HistoryTabProps {
  history: MatchHistory[];
  players: Player[];
  onDeleteMatch: (matchId: string) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  history,
  players,
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
            return (
              <div
                key={match.id}
                className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition space-y-2"
              >
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">Trận #{matchIndex}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">{match.courtId.replace('court-', 'Sân ')}</span>
                    <span>•</span>
                    <span>{match.type === 'DOUBLES' ? 'Đôi' : 'Đơn'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {match.durationMinutes}p ({formatTime(match.startedAt)} - {formatTime(match.endedAt)})
                    </span>
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
                  </div>
                </div>

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
