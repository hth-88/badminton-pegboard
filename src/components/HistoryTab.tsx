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
    <div className="max-w-2xl mx-auto p-3.5 md:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2
            className="text-lg font-bold tracking-[-0.025em] flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <History className="w-5 h-5" style={{ color: 'var(--accent-lime)' }} />
            <span>Lịch sử các trận đấu</span>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-mono-tabular font-bold"
              style={{
                background: 'var(--accent-lime-soft)',
                color: 'var(--accent-lime)',
                border: '1px solid var(--accent-lime-border)',
              }}
            >
              {history.length} trận
            </span>
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Ghi nhận thời gian, tỉ số, kèo độ và nhận xét từng trận
          </p>
        </div>
      </div>

      {history.length === 0 ? (
        <div
          className="vo-glass-card p-8 text-center rounded-[22px]"
          style={{ color: 'var(--text-muted)' }}
        >
          <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>
            Chưa có trận nào kết thúc
          </p>
          <p className="text-xs mt-1">
            Khi bấm &quot;Kết thúc trận&quot; trên sân, lịch sử sẽ xuất hiện tại đây.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...history].reverse().map((match, idx) => {
            const matchIndex = history.length - idx;
            const privateReview = !isViewer ? getPrivateMatchReview(match.id) : null;
            return (
              <div
                key={match.id}
                className="vo-glass-card p-4 rounded-[20px] space-y-2.5 transition"
              >
                <div
                  className="flex items-center justify-between text-xs pb-2.5 gap-2 flex-wrap border-b"
                  style={{
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold font-mono-tabular" style={{ color: 'var(--text-primary)' }}>
                      #{matchIndex}
                    </span>
                    <span className="opacity-40">•</span>
                    <span className="font-semibold" style={{ color: 'var(--accent-lime)' }}>
                      {match.courtId.replace('court-', 'Sân ')}
                    </span>
                    <span className="opacity-40">•</span>
                    <span>{match.type === 'DOUBLES' ? 'Đôi' : 'Đơn'}</span>
                    {match.score && (
                      <span
                        className="px-2 py-0.5 rounded-lg font-extrabold font-mono-tabular text-[11.5px]"
                        style={{
                          background: 'var(--accent-lime-soft)',
                          color: 'var(--accent-lime)',
                          border: '1px solid var(--accent-lime-border)',
                        }}
                      >
                        {match.score.team1} — {match.score.team2}
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
                    <span className="flex items-center gap-1 font-mono-tabular text-[11px]">
                      <Clock className="w-3 h-3" />
                      {match.durationMinutes}p ({formatTime(match.startedAt)}–{formatTime(match.endedAt)})
                    </span>
                    {!isViewer && onEditMatchResult && (
                      <button
                        type="button"
                        onClick={() => onEditMatchResult(match)}
                        title="Cập nhật tỉ số / độ / nhận xét"
                        className="vo-btn-subtle px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                        style={{ color: 'var(--accent-lime)' }}
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Sửa</span>
                      </button>
                    )}
                    {!isViewer && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Xóa trận #${matchIndex}? Số trận và thống kê của người chơi sẽ được tự động cập nhật lại.`
                            )
                          ) {
                            onDeleteMatch(match.id);
                          }
                        }}
                        title="Xóa trận này"
                        aria-label="Xóa trận này"
                        className="p-1.5 rounded-lg hover:text-rose-400 transition"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {match.bet && (
                  <div
                    className="px-3 py-1.5 rounded-xl text-[11.5px] flex items-center justify-between gap-2"
                    style={{
                      background: 'var(--amber-soft)',
                      border: '1px solid var(--amber-border)',
                      color: 'var(--amber)',
                    }}
                  >
                    <span className="flex items-center gap-1.5 font-bold">
                      <Flame className="w-3.5 h-3.5" />
                      <span>Kèo độ: {match.bet.label}</span>
                    </span>
                    <span className="font-bold">
                      {match.betWinner === 1
                        ? 'Đội 1 thắng'
                        : match.betWinner === 2
                        ? 'Đội 2 thắng'
                        : 'Chưa chốt thắng'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Team 1 */}
                  <div className="vo-stage p-2.5 rounded-xl space-y-1.5">
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.06em] block"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Đội 1
                    </span>
                    {match.team1.map((pid) => {
                      const p = playerMap.get(pid);
                      return (
                        <div
                          key={pid}
                          className={`vo-tile ${
                            p?.sex === 'F' ? 'vo-gender-bar-f' : 'vo-gender-bar-m'
                          } pl-2.5 pr-2 py-1.5 rounded-lg flex items-center justify-between gap-1`}
                        >
                          <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {p?.name || pid}
                          </span>
                          {p && (
                            <span
                              className="text-[9.5px] font-bold font-mono-tabular px-1.5 py-0.2 rounded shrink-0"
                              style={{
                                background: 'var(--bg-pill-track)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {RANK_METADATA[p.rank].code}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Team 2 */}
                  <div className="vo-stage p-2.5 rounded-xl space-y-1.5">
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.06em] block"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Đội 2
                    </span>
                    {match.team2.map((pid) => {
                      const p = playerMap.get(pid);
                      return (
                        <div
                          key={pid}
                          className={`vo-tile ${
                            p?.sex === 'F' ? 'vo-gender-bar-f' : 'vo-gender-bar-m'
                          } pl-2.5 pr-2 py-1.5 rounded-lg flex items-center justify-between gap-1`}
                        >
                          <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {p?.name || pid}
                          </span>
                          {p && (
                            <span
                              className="text-[9.5px] font-bold font-mono-tabular px-1.5 py-0.2 rounded shrink-0"
                              style={{
                                background: 'var(--bg-pill-track)',
                                color: 'var(--text-secondary)',
                              }}
                            >
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
