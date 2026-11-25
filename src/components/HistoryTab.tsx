import React from 'react';
import { History, Trash2, Clock, Edit3, Flame, Lock } from 'lucide-react';
import type { MatchHistory, Player } from '../types/badminton';
import { getPrivateMatchReview } from '../engine/matchFeedbackStorage';
import {
  GenderDot,
  RankBadge,
  StatusPill,
  UiEmptyState,
} from './ui/Primitives';

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
    return `${d.getHours().toString().padStart(2, '0')}:${d
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  };

  return (
    <div className="max-w-[780px] mx-auto px-4 md:px-6 pt-4 pb-28 space-y-5">
      <div>
        <div className="flex items-center gap-2.5">
          <h2
            className="text-[20px] font-bold tracking-[-0.02em]"
            style={{ color: 'var(--text-primary)' }}
          >
            Lịch sử trận đấu
          </h2>
          <StatusPill tone="neutral">
            <span className="tabular-nums">{history.length} trận</span>
          </StatusPill>
        </div>
        <p
          className="text-[14px] mt-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          Ghi nhận thời gian, tỉ số, kèo độ và nhận xét từng trận
        </p>
      </div>

      {history.length === 0 ? (
        <UiEmptyState
          icon={<History className="w-6 h-6" />}
          title="Chưa có trận nào kết thúc"
          description='Khi bấm "Kết thúc trận" trên sân, lịch sử sẽ được ghi lại tại đây.'
        />
      ) : (
        <div className="space-y-3">
          {[...history].reverse().map((match, idx) => {
            const matchIndex = history.length - idx;
            const privateReview = !isViewer ? getPrivateMatchReview(match.id) : null;

            return (
              <article key={match.id} className="ui-card p-4 space-y-3.5">
                {/* Match Meta Header */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b ui-divider flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[15px] font-bold tabular-nums"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      #{matchIndex}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span
                      className="text-[14px] font-semibold"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {match.courtId.replace('court-', 'Sân ')}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span
                      className="text-[14px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {match.type === 'DOUBLES' ? 'Đôi' : 'Đơn'}
                    </span>

                    {match.score && (
                      <StatusPill tone="accent" className="tabular-nums font-bold">
                        {match.score.team1} — {match.score.team2}
                      </StatusPill>
                    )}

                    {!isViewer && match.balanceRating && (
                      <StatusPill
                        tone={
                          match.balanceRating === 'BALANCED'
                            ? 'accent'
                            : match.balanceRating === 'SLIGHT_GAP'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {match.balanceRating === 'BALANCED'
                          ? 'Cân hay'
                          : match.balanceRating === 'SLIGHT_GAP'
                            ? 'Chênh nhẹ'
                            : 'Chênh quá'}
                      </StatusPill>
                    )}

                    {!isViewer && privateReview && (
                      <span
                        title="Có nhận xét kín từng người"
                        className="inline-flex items-center"
                        style={{ color: 'var(--color-warning)' }}
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 text-[13px] tabular-nums"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {match.durationMinutes}p ({formatTime(match.startedAt)}–
                      {formatTime(match.endedAt)})
                    </span>

                    {!isViewer && onEditMatchResult && (
                      <button
                        type="button"
                        onClick={() => onEditMatchResult(match)}
                        title="Cập nhật tỉ số / độ / nhận xét"
                        className="ui-btn ui-btn-secondary min-h-[44px] px-3.5 text-[13px]"
                      >
                        <Edit3
                          className="w-3.5 h-3.5"
                          style={{ color: 'var(--color-accent)' }}
                        />
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
                        className="ui-icon-btn w-11 h-11"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Bet Result Banner */}
                {match.bet && (
                  <div className="ui-banner-warning px-3.5 py-2 text-[14px] flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Flame className="w-4 h-4 shrink-0" />
                      <span>Kèo độ: {match.bet.label}</span>
                    </span>
                    <span className="font-semibold">
                      {match.betWinner === 1
                        ? 'Đội 1 thắng'
                        : match.betWinner === 2
                          ? 'Đội 2 thắng'
                          : 'Chưa chốt thắng'}
                    </span>
                  </div>
                )}

                {/* Direct 2-Column Teams (No card-in-card nesting) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <span
                      className="text-[12px] font-semibold uppercase tracking-[0.04em] block"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Đội 1
                    </span>
                    {match.team1.map((pid) => {
                      const p = playerMap.get(pid);
                      return (
                        <div
                          key={pid}
                          className="ui-tile h-[48px] px-3 flex items-center justify-between gap-2 min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {p && <GenderDot sex={p.sex} />}
                            <span
                              className="text-[14px] font-semibold truncate"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {p?.name || pid}
                            </span>
                          </div>
                          {p && <RankBadge rank={p.rank} surface="tile" />}
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <span
                      className="text-[12px] font-semibold uppercase tracking-[0.04em] block"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Đội 2
                    </span>
                    {match.team2.map((pid) => {
                      const p = playerMap.get(pid);
                      return (
                        <div
                          key={pid}
                          className="ui-tile h-[48px] px-3 flex items-center justify-between gap-2 min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {p && <GenderDot sex={p.sex} />}
                            <span
                              className="text-[14px] font-semibold truncate"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {p?.name || pid}
                            </span>
                          </div>
                          {p && <RankBadge rank={p.rank} surface="tile" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
