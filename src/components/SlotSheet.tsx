import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  Check,
  UserCheck,
  UserX,
  Search,
} from 'lucide-react';
import type { BadmintonSessionState, Lineup, Player } from '../types/badminton';
import { sortPlayersByWaitPriority } from '../engine/matchmaker';
import { validateLineup } from '../engine/validateLineup';
import { getSlotCandidateStatus } from '../engine/nextUp';
import { GenderDot, RankBadge, StatusPill, UiModal } from './ui/Primitives';

interface SlotSheetProps {
  isOpen: boolean;
  onClose: () => void;
  courtName: string;
  target: 'CURRENT' | 'NEXT_UP';
  team?: 1 | 2;
  index?: number;
  slotIndex?: number;
  courtId: string;
  currentLineup?: Lineup;
  state: BadmintonSessionState;
  onSelectPlayer: (playerId: string) => void;
  onResumePlayer: (playerId: string) => void;
}

export const SlotSheet: React.FC<SlotSheetProps> = ({
  isOpen,
  onClose,
  courtName,
  target,
  team = 1,
  index = 0,
  slotIndex,
  courtId,
  currentLineup,
  state,
  onSelectPlayer,
  onResumePlayer,
}) => {
  const [search, setSearch] = useState('');
  const [confirmingPlayer, setConfirmingPlayer] = useState<{
    player: Player;
    type: 'PAUSED' | 'WARN';
    message: string;
  } | null>(null);

  const effectiveSlotIndex =
    slotIndex !== undefined ? slotIndex : team === 1 ? index : 2 + index;

  const sortedCandidates = useMemo(() => {
    const active = sortPlayersByWaitPriority(
      state.players.filter((p) => p.status === 'ACTIVE')
    );
    const paused = state.players.filter((p) => p.status === 'PAUSED');
    return [...active, ...paused];
  }, [state.players]);

  const filteredCandidates = useMemo(() => {
    if (!search.trim()) return sortedCandidates;
    const q = search.toLowerCase();
    return sortedCandidates.filter(
      (p) => p.name.toLowerCase().includes(q) || p.rank.toLowerCase().includes(q)
    );
  }, [sortedCandidates, search]);

  if (!isOpen) return null;

  const previewIssuesForCurrent = (candidateId: string) => {
    if (!currentLineup) return [];
    const newTeam1 = [...currentLineup.team1];
    const newTeam2 = [...currentLineup.team2];

    if (team === 1) {
      newTeam1[index] = candidateId;
    } else {
      newTeam2[index] = candidateId;
    }

    const testLineup: Lineup = {
      ...currentLineup,
      team1: newTeam1,
      team2: newTeam2,
      slotSource: {
        ...currentLineup.slotSource,
        [candidateId]: 'MANUAL',
      },
    };

    return validateLineup(testLineup, state, courtId, { target: 'CURRENT' });
  };

  const handleChoose = (player: Player) => {
    if (target === 'NEXT_UP') {
      const status = getSlotCandidateStatus(
        state,
        courtId,
        effectiveSlotIndex,
        player.id
      );
      if (!status.selectable) {
        return;
      }
      onSelectPlayer(player.id);
      onClose();
      return;
    }

    const issues = previewIssuesForCurrent(player.id);
    const blockIssue = issues.find((i) => i.severity === 'BLOCK');
    if (blockIssue) {
      return;
    }

    if (player.status === 'PAUSED') {
      setConfirmingPlayer({
        player,
        type: 'PAUSED',
        message: `Người chơi "${player.name}" đang tạm nghỉ. Bạn có muốn kích hoạt lại và đưa vào sân không?`,
      });
      return;
    }

    const warnIssue = issues.find((i) => i.severity === 'WARN');
    if (warnIssue) {
      setConfirmingPlayer({
        player,
        type: 'WARN',
        message: `${warnIssue.message}. Bạn có chắc chắn vẫn muốn xếp vào?`,
      });
      return;
    }

    onSelectPlayer(player.id);
    onClose();
  };

  const handleConfirm = () => {
    if (!confirmingPlayer) return;
    const { player, type } = confirmingPlayer;
    if (type === 'PAUSED') {
      onResumePlayer(player.id);
    }
    onSelectPlayer(player.id);
    setConfirmingPlayer(null);
    onClose();
  };

  return (
    <UiModal
      isOpen={isOpen}
      onClose={onClose}
      sheetOnMobile
      title={`Chọn người vào ${courtName}`}
      subtitle={
        target === 'NEXT_UP'
          ? `Lượt kế tiếp · Ô số ${effectiveSlotIndex + 1}`
          : `Đội ${team} · Vị trí ${index + 1} (Đang đánh)`
      }
    >
      <div className="relative space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc trình độ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input pl-10"
          />
        </div>

        {/* Candidate List */}
        <div className="space-y-2">
          {filteredCandidates.length === 0 && (
            <p
              className="py-8 text-center text-[14px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Không tìm thấy người chơi phù hợp.
            </p>
          )}

          {filteredCandidates.map((player) => {
            const isPaused = player.status === 'PAUSED';

            if (target === 'NEXT_UP') {
              const status = getSlotCandidateStatus(
                state,
                courtId,
                effectiveSlotIndex,
                player.id
              );
              const isBlocked = !status.selectable;
              const hasWarnings = status.warnings.length > 0;

              return (
                <div
                  key={player.id}
                  className="ui-tile px-3.5 py-3 flex items-center justify-between gap-3"
                  style={
                    isBlocked
                      ? {
                          backgroundColor: 'var(--color-danger-soft)',
                          opacity: 0.72,
                        }
                      : hasWarnings
                      ? {
                          backgroundColor: 'var(--color-warning-soft)',
                        }
                      : undefined
                  }
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <GenderDot sex={player.sex} />
                      <span
                        className="font-semibold text-[15px] truncate flex-1 min-w-0"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {player.name}
                      </span>
                      <RankBadge rank={player.rank} surface="tile" />
                      {isPaused && (
                        <StatusPill tone="warning">
                          <UserX className="w-3 h-3" />
                          <span>Nghỉ</span>
                        </StatusPill>
                      )}
                    </div>

                    <div
                      className="text-[13px] tabular-nums flex items-center gap-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span>
                        {player.gamesPlayed} trận
                        {player.virtualGamesOffset > 0
                          ? ` (+${player.virtualGamesOffset})`
                          : ''}
                      </span>
                      <span>·</span>
                      <span
                        style={
                          player.waitStreak > 1
                            ? { color: 'var(--color-accent)', fontWeight: 600 }
                            : undefined
                        }
                      >
                        Chờ {player.waitStreak} lượt
                      </span>
                    </div>

                    {isBlocked && (
                      <div
                        className="flex items-center gap-1.5 text-[13px] font-medium"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {status.blockLabel || 'Không khả dụng'}
                        </span>
                      </div>
                    )}

                    {!isBlocked &&
                      status.warnings.map((w) => (
                        <div
                          key={w}
                          className="flex items-center gap-1.5 text-[13px] font-medium"
                          style={{ color: 'var(--color-warning)' }}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                  </div>

                  <div className="shrink-0">
                    {isBlocked ? (
                      <span
                        className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-xl text-[13px] font-semibold"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        Bận
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleChoose(player)}
                        className="ui-btn ui-btn-primary px-4 rounded-xl"
                      >
                        <Check className="w-4 h-4" />
                        <span>Chọn</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            // TARGET: CURRENT MATCH
            const issues = previewIssuesForCurrent(player.id);
            const blockIssue = issues.find((i) => i.severity === 'BLOCK');
            const warnIssue = issues.find((i) => i.severity === 'WARN');

            return (
              <div
                key={player.id}
                className="ui-tile px-3.5 py-3 flex items-center justify-between gap-3"
                style={
                  blockIssue
                    ? {
                        backgroundColor: 'var(--color-danger-soft)',
                        opacity: 0.72,
                      }
                    : warnIssue || isPaused
                    ? {
                        backgroundColor: 'var(--color-warning-soft)',
                      }
                    : undefined
                }
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <GenderDot sex={player.sex} />
                    <span
                      className="font-semibold text-[15px] truncate flex-1 min-w-0"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {player.name}
                    </span>
                    <RankBadge rank={player.rank} surface="tile" />
                    {isPaused && (
                      <StatusPill tone="warning">
                        <UserX className="w-3 h-3" />
                        <span>Nghỉ</span>
                      </StatusPill>
                    )}
                  </div>

                  <div
                    className="text-[13px] tabular-nums flex items-center gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span>
                      {player.gamesPlayed} trận
                      {player.virtualGamesOffset > 0
                        ? ` (+${player.virtualGamesOffset})`
                        : ''}
                    </span>
                    <span>·</span>
                    <span
                      style={
                        player.waitStreak > 1
                          ? { color: 'var(--color-accent)', fontWeight: 600 }
                          : undefined
                      }
                    >
                      Chờ {player.waitStreak} lượt
                    </span>
                  </div>

                  {blockIssue && (
                    <div
                      className="flex items-center gap-1.5 text-[13px] font-medium"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                      <span>{blockIssue.message}</span>
                    </div>
                  )}

                  {!blockIssue && warnIssue && (
                    <div
                      className="flex items-center gap-1.5 text-[13px] font-medium"
                      style={{ color: 'var(--color-warning)' }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{warnIssue.message}</span>
                    </div>
                  )}
                </div>

                <div className="shrink-0">
                  {blockIssue ? (
                    <span
                      className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-xl text-[13px] font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Bận
                    </span>
                  ) : warnIssue || isPaused ? (
                    <button
                      type="button"
                      onClick={() => handleChoose(player)}
                      className="ui-btn ui-btn-warning-soft px-3.5 rounded-xl"
                    >
                      {isPaused ? 'Kích hoạt' : 'Vẫn chọn'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleChoose(player)}
                      className="ui-btn ui-btn-primary px-4 rounded-xl"
                    >
                      <Check className="w-4 h-4" />
                      <span>Chọn</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Inline Confirmation Overlay */}
        {confirmingPlayer && (
          <div
            className="fixed inset-0 z-50 ui-modal-backdrop flex items-center justify-center p-4"
            onClick={() => setConfirmingPlayer(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="ui-modal-panel p-6 max-w-sm w-full text-center space-y-4"
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
                style={{
                  backgroundColor: 'var(--color-warning-soft)',
                  color: 'var(--color-warning)',
                }}
              >
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h4
                  className="font-bold text-[17px]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Xác nhận đưa vào sân
                </h4>
                <p
                  className="text-[14px] leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {confirmingPlayer.message}
                </p>
              </div>
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmingPlayer(null)}
                  className="ui-btn ui-btn-secondary flex-1"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="ui-btn ui-btn-primary flex-1"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Đồng ý</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </UiModal>
  );
};
