import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  RotateCw,
  Lock,
  Shuffle,
  Scale,
  Clock,
  CheckCircle2,
  Power,
  ChevronRight,
  Minus,
  Plus,
  Square,
  X,
  AlertOctagon,
  AlertTriangle,
  Flame,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import type {
  BadmintonRank,
  BadmintonSessionState,
  BetPayoutMode,
  BetUnit,
  Court,
  Lineup,
  MatchBet,
  NextUpDraft,
  Player,
} from '../types/badminton';
import {
  canSuggestNextUp,
  isNextUpComplete,
  isNextUpEmpty,
  normalizeNextUp,
  slotsToLineup,
  type NextUpEvaluation,
} from '../engine/nextUp';
import { getEffectiveSkill, stepRankDown, stepRankUp } from '../engine/skillConfig';
import { describeLineup, validateLineup } from '../engine/validateLineup';
import { SlotSheet } from './SlotSheet';
import { vibrateSuccess, vibrateWarning } from '../utils/vibrate';
import { GenderDot, RankBadge, StatusPill } from './ui/Primitives';

interface CourtCardProps {
  court: Court;
  state: BadmintonSessionState;
  nextUpEval?: NextUpEvaluation | null;
  onStartMatch: (courtId: string, lineup?: Lineup) => void;
  onEndMatch: (courtId: string, expectedMatchId?: string) => void;
  onEndAndStartMatch: (courtId: string, nextLineup?: Lineup, expectedMatchId?: string) => void;
  onSuggestNextUp: (courtId: string) => void;
  onSetNextUpSlot: (courtId: string, slotIndex: number, playerId: string | null) => void;
  onClearNextUp: (courtId: string) => void;
  onToggleNextUpType?: (courtId: string, nextType?: 'DOUBLES' | 'SINGLES') => void;
  onRearrangeNextUp: (courtId: string, mode: 'ROTATE' | 'BALANCE') => void;
  onSwapPlayers: (
    courtId: string,
    target: 'CURRENT' | 'NEXT_UP',
    slot1: { team: 1 | 2; index: number },
    slot2: { team: 1 | 2; index: number } | { playerId: string },
    baseLineup?: Lineup
  ) => void;
  onUpdateCourt: (
    courtId: string,
    updates: {
      name?: string;
      isActive?: boolean;
      forcedType?: 'DOUBLES' | 'SINGLES' | null;
    }
  ) => void;
  onSnoozeAutoSingles: (courtId: string, queueSize: number) => void;
  onResumePlayer: (playerId: string) => void;
  onEditRank?: (playerId: string, rank: BadmintonRank) => void;
  isViewer?: boolean;
  onSetCourtBet?: (courtId: string, bet: MatchBet | null) => void;
  onTriggerUndoToast: (message: string) => void;
  onShowWarningToast?: (message: string) => void;
}

export const CourtCard: React.FC<CourtCardProps> = ({
  court,
  state,
  nextUpEval,
  onStartMatch,
  onEndMatch,
  onEndAndStartMatch,
  onSuggestNextUp,
  onSetNextUpSlot,
  onClearNextUp,
  onToggleNextUpType,
  onRearrangeNextUp,
  onSwapPlayers,
  onUpdateCourt,
  onSnoozeAutoSingles: _onSnoozeAutoSingles,
  onResumePlayer,
  onEditRank,
  isViewer = false,
  onSetCourtBet,
  onTriggerUndoToast,
  onShowWarningToast,
}) => {
  const lastEndClickRef = useRef<number>(0);

  const [showCourtMenu, setShowCourtMenu] = useState(false);
  const [showQuickRankControls, setShowQuickRankControls] = useState(false);

  const [showBetEditor, setShowBetEditor] = useState(false);
  const [betLabelInput, setBetLabelInput] = useState('1 nước');
  const [betAmountInput, setBetAmountInput] = useState(0);
  const [betUnitInput, setBetUnitInput] = useState<BetUnit>('PER_PLAYER');
  const [betPayoutInput, setBetPayoutInput] = useState<BetPayoutMode>('TEAM_TO_TEAM');

  const openLiveBetEditor = () => {
    const cur = court.currentMatch?.bet;
    if (cur) {
      setBetLabelInput(cur.label);
      setBetAmountInput(cur.amountVnd);
      setBetUnitInput(cur.unit);
      setBetPayoutInput(cur.payoutMode);
    } else {
      setBetLabelInput('1 nước');
      setBetAmountInput(0);
      setBetUnitInput('PER_PLAYER');
      setBetPayoutInput('TEAM_TO_TEAM');
    }
    setShowBetEditor((prev) => !prev);
  };

  const [slotSheetTarget, setSlotSheetTarget] = useState<{
    target: 'CURRENT' | 'NEXT_UP';
    slotIndex?: number;
    team?: 1 | 2;
    index?: number;
    baseLineup?: Lineup;
  } | null>(null);

  const [liveNow, setLiveNow] = useState(() => Date.now());
  useEffect(() => {
    if (!court.currentMatch) return;
    const interval = setInterval(() => setLiveNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [court.currentMatch]);

  const playerMap = useMemo(
    () => new Map(state.players.map((p) => [p.id, p])),
    [state.players]
  );

  const safeNextUp: NextUpDraft = useMemo(() => {
    return normalizeNextUp(court.nextUp, court.forcedType, court.policy);
  }, [court.nextUp, court.forcedType, court.policy]);

  const getPlayer = (id: string): Player | undefined => playerMap.get(id);

  const getPlayingCourtName = (playerId: string): string | null => {
    for (const c of state.courts) {
      if (c.id !== court.id && c.isActive && c.currentMatch) {
        const matchPlayerIds = [...c.currentMatch.team1, ...c.currentMatch.team2];
        if (matchPlayerIds.includes(playerId)) {
          return c.name || c.id;
        }
      }
    }
    return null;
  };

  const blockedPlayerPlayingElsewhere = useMemo(() => {
    if (!isNextUpComplete(safeNextUp)) return null;
    const currentSlots = safeNextUp.slots.filter(Boolean) as string[];
    for (const pid of currentSlots) {
      const courtName = getPlayingCourtName(pid);
      if (courtName) {
        const p = getPlayer(pid);
        return {
          playerName: p?.name || 'Người chơi',
          courtName,
        };
      }
    }
    return null;
  }, [safeNextUp, state.courts]);

  const checkLineupErrors = (lineup: Lineup): string | null => {
    const allIds = [...lineup.team1, ...lineup.team2];
    for (const pid of allIds) {
      const p = getPlayer(pid);
      if (p && p.status === 'PAUSED') {
        return `Không thể vào sân: ${p.name} đang tạm nghỉ`;
      }
    }
    const issues = validateLineup(lineup, state, court.id, { target: 'CURRENT' });
    const block = issues.find((i) => i.severity === 'BLOCK');
    if (block) {
      return `Không thể vào sân: ${block.message}`;
    }
    return null;
  };

  const matchDurationMinutes = court.currentMatch
    ? Math.max(0, Math.floor((liveNow - court.currentMatch.startedAt) / 60000))
    : 0;

  const isOvertime = matchDurationMinutes >= 20;

  const handleEndMatchClick = () => {
    const now = Date.now();
    if (now - lastEndClickRef.current < 600) {
      return;
    }
    lastEndClickRef.current = now;

    if (isNextUpComplete(safeNextUp)) {
      if (blockedPlayerPlayingElsewhere) {
        vibrateWarning();
        onShowWarningToast?.(
          `Không thể bắt đầu: ${blockedPlayerPlayingElsewhere.playerName} đang đánh ở ${blockedPlayerPlayingElsewhere.courtName}. Hãy chờ trận xong hoặc đổi người khác`
        );
        if (court.currentMatch) {
          onEndMatch(court.id, court.currentMatch.id);
          onTriggerUndoToast(`Đã kết thúc trận trên ${court.name}`);
        }
        return;
      }

      const nextLineup = slotsToLineup(safeNextUp);
      if (nextLineup) {
        const err = checkLineupErrors(nextLineup);
        if (err) {
          vibrateWarning();
          onShowWarningToast?.(err);
          if (court.currentMatch) {
            onEndMatch(court.id, court.currentMatch.id);
            onTriggerUndoToast(`Đã kết thúc trận trên ${court.name}`);
          }
          return;
        }

        vibrateSuccess();
        onEndAndStartMatch(court.id, nextLineup, court.currentMatch?.id);
        onTriggerUndoToast(`Đã kết thúc và đẩy lượt mới cho ${court.name}`);
        return;
      }
    }

    vibrateSuccess();
    onEndMatch(court.id, court.currentMatch?.id);
    onTriggerUndoToast(`Đã kết thúc trận trên ${court.name}`);
  };

  const handleRotatePairings = () => {
    if (!court.currentMatch || court.currentMatch.type !== 'DOUBLES') return;
    const allIds = [...court.currentMatch.team1, ...court.currentMatch.team2];
    if (new Set(allIds).size !== 4) return;

    const [A, B, C, D] = [...allIds].sort();

    const aInTeam1 = court.currentMatch.team1.includes(A);
    const aTeamNum: 1 | 2 = aInTeam1 ? 1 : 2;
    const oppTeamNum: 1 | 2 = aInTeam1 ? 2 : 1;
    const aTeam = aInTeam1 ? court.currentMatch.team1 : court.currentMatch.team2;
    const oppTeam = aInTeam1 ? court.currentMatch.team2 : court.currentMatch.team1;
    const aIdx = aTeam.indexOf(A);
    const partnerIdx = aIdx === 0 ? 1 : 0;
    const currentPartner = aTeam[partnerIdx];

    let currentMode: 0 | 1 | 2 = 0;
    if (currentPartner === C) currentMode = 1;
    else if (currentPartner === D) currentMode = 2;
    else currentMode = 0;

    const nextMode: 0 | 1 | 2 = ((currentMode + 1) % 3) as 0 | 1 | 2;
    const targetPartner = nextMode === 0 ? B : nextMode === 1 ? C : D;
    const oppPartnerIdx = oppTeam.indexOf(targetPartner);

    if (oppPartnerIdx !== -1) {
      vibrateSuccess();
      onSwapPlayers(
        court.id,
        'CURRENT',
        { team: aTeamNum, index: partnerIdx },
        { team: oppTeamNum, index: oppPartnerIdx },
        court.currentMatch
      );
      onTriggerUndoToast(`Đã đảo cặp sang thế ${nextMode + 1}/3`);
    }
  };

  const handleAutoBalancePairings = () => {
    if (!court.currentMatch || court.currentMatch.type !== 'DOUBLES') return;
    const allIds = [...court.currentMatch.team1, ...court.currentMatch.team2];
    if (new Set(allIds).size !== 4) return;

    const [A, B, C, D] = [...allIds].sort();
    const pA = getPlayer(A);
    const pB = getPlayer(B);
    const pC = getPlayer(C);
    const pD = getPlayer(D);
    if (!pA || !pB || !pC || !pD) return;

    const bonus = state.settings?.maleBonus ?? 1.5;
    const sA = getEffectiveSkill(pA.rank, pA.sex, bonus);
    const sB = getEffectiveSkill(pB.rank, pB.sex, bonus);
    const sC = getEffectiveSkill(pC.rank, pC.sex, bonus);
    const sD = getEffectiveSkill(pD.rank, pD.sex, bonus);

    const diff0 = Math.abs(sA + sB - (sC + sD));
    const diff1 = Math.abs(sA + sC - (sB + sD));
    const diff2 = Math.abs(sA + sD - (sB + sC));

    const aInTeam1 = court.currentMatch.team1.includes(A);
    const aTeamNum: 1 | 2 = aInTeam1 ? 1 : 2;
    const oppTeamNum: 1 | 2 = aInTeam1 ? 2 : 1;
    const aTeam = aInTeam1 ? court.currentMatch.team1 : court.currentMatch.team2;
    const oppTeam = aInTeam1 ? court.currentMatch.team2 : court.currentMatch.team1;
    const aIdx = aTeam.indexOf(A);
    const partnerIdx = aIdx === 0 ? 1 : 0;
    const currentPartner = aTeam[partnerIdx];

    let currentMode: 0 | 1 | 2 = 0;
    if (currentPartner === C) currentMode = 1;
    else if (currentPartner === D) currentMode = 2;
    else currentMode = 0;

    const diffs = [diff0, diff1, diff2];
    const minDiff = Math.min(...diffs);

    if (Math.abs(diffs[currentMode] - minDiff) < 0.001) {
      vibrateSuccess();
      onTriggerUndoToast('Đội hình đã ở trạng thái cân bằng nhất!');
      return;
    }

    let bestMode: 0 | 1 | 2 = 0;
    if (Math.abs(diff0 - minDiff) < 0.001) bestMode = 0;
    else if (Math.abs(diff1 - minDiff) < 0.001) bestMode = 1;
    else bestMode = 2;

    const targetPartner = bestMode === 0 ? B : bestMode === 1 ? C : D;
    const oppPartnerIdx = oppTeam.indexOf(targetPartner);
    if (oppPartnerIdx !== -1) {
      vibrateSuccess();
      onSwapPlayers(
        court.id,
        'CURRENT',
        { team: aTeamNum, index: partnerIdx },
        { team: oppTeamNum, index: oppPartnerIdx },
        court.currentMatch
      );
      onTriggerUndoToast(`Đã tự cân cặp (lệch ${minDiff.toFixed(1)}đ)`);
    }
  };

  const handleStartNextUpClick = () => {
    if (!isNextUpComplete(safeNextUp)) {
      const needed = safeNextUp.type === 'SINGLES' ? 2 : 4;
      onShowWarningToast?.(`Chưa đủ ${needed} người để vào sân`);
      return;
    }
    if (blockedPlayerPlayingElsewhere) {
      vibrateWarning();
      onShowWarningToast?.(
        `Không thể bắt đầu: ${blockedPlayerPlayingElsewhere.playerName} đang đánh ở ${blockedPlayerPlayingElsewhere.courtName}. Hãy chờ trận xong hoặc đổi người khác`
      );
      return;
    }
    const lineup = slotsToLineup(safeNextUp);
    if (!lineup) return;
    const err = checkLineupErrors(lineup);
    if (err) {
      vibrateWarning();
      onShowWarningToast?.(err);
      return;
    }
    vibrateSuccess();
    onStartMatch(court.id, lineup);
    onTriggerUndoToast(`Đã bắt đầu trận trên ${court.name}`);
  };

  const filledNextCount = safeNextUp.slots.filter(Boolean).length;
  const maxNextCount = safeNextUp.type === 'SINGLES' ? 2 : 4;
  const isPlaying = Boolean(court.isActive && court.currentMatch);

  // Fixed-height player slot for Current Match (62px height, 1-line truncated name, uniform rank badge + gender dot)
  const renderCurrentPlayerSlot = (playerId: string, onClick?: () => void) => {
    const player = getPlayer(playerId);
    if (!player) {
      return (
        <div
          className="ui-tile h-[62px] px-3 flex items-center text-[14px]"
          style={{ color: 'var(--text-muted)' }}
        >
          Chưa rõ
        </div>
      );
    }

    const canClick = !isViewer && Boolean(onClick);

    return (
      <div
        role={canClick ? 'button' : undefined}
        tabIndex={canClick ? 0 : undefined}
        onClick={canClick ? onClick : undefined}
        onKeyDown={
          canClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        className={`ui-tile h-[62px] px-3 py-2 flex flex-col justify-between min-w-0 w-full ${
          canClick ? 'ui-tile-interactive cursor-pointer' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GenderDot sex={player.sex} />
          <span
            className="text-[14px] font-semibold leading-tight truncate flex-1 min-w-0"
            style={{ color: 'var(--text-primary)' }}
            title={player.name}
          >
            {player.name}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <RankBadge rank={player.rank} surface="tile" />

          {showQuickRankControls && onEditRank && !isViewer && (
            <div
              className="flex items-center gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => onEditRank(player.id, stepRankDown(player.rank))}
                title="Hạ 1 bậc trình"
                aria-label={`Hạ trình ${player.name}`}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onEditRank(player.id, stepRankUp(player.rank))}
                title="Tăng 1 bậc trình"
                aria-label={`Tăng trình ${player.name}`}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Fixed-height spacer slot so 2-player Singles occupies the exact same vertical space as 4-player Doubles
  const renderSpacerSlot = () => (
    <div className="h-[62px] w-full rounded-[14px] invisible pointer-events-none" aria-hidden="true" />
  );

  // Fixed-height slot for Next Up (62px height, single-line truncated name, uniform badge)
  const renderNextUpSlot = (pid: string | null, idx: number) => {
    if (!pid) {
      if (isViewer) {
        return (
          <div
            className="ui-tile h-[62px] w-full px-3 flex items-center justify-center text-[14px]"
            style={{ color: 'var(--text-muted)' }}
          >
            Chưa xếp
          </div>
        );
      }

      return (
        <button
          type="button"
          onClick={() =>
            setSlotSheetTarget({
              target: 'NEXT_UP',
              slotIndex: idx,
            })
          }
          className="ui-tile-dashed h-[62px] w-full px-3 flex items-center justify-center gap-1.5 text-[14px] font-medium"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="truncate">Chọn người</span>
        </button>
      );
    }

    const player = getPlayer(pid);
    const isManual = safeNextUp.slotSource?.[idx] === 'MANUAL';
    const playingCourtName = getPlayingCourtName(pid);

    return (
      <div
        className="ui-tile h-[62px] w-full flex items-stretch min-w-0 overflow-hidden"
        style={
          playingCourtName
            ? {
                backgroundColor: 'var(--color-danger-soft)',
                border: '1px solid var(--color-danger-border)',
              }
            : isManual && !isViewer
            ? {
                border: '1px solid var(--color-warning-border)',
              }
            : undefined
        }
      >
        {!isViewer ? (
          <button
            type="button"
            onClick={() =>
              setSlotSheetTarget({
                target: 'NEXT_UP',
                slotIndex: idx,
              })
            }
            className="min-w-0 flex-1 h-full pl-3 pr-1 py-2 flex flex-col justify-between text-left transition ui-tile-interactive"
          >
            <div className="flex items-center gap-2 min-w-0 w-full">
              {player && <GenderDot sex={player.sex} />}
              <span
                className="text-[14px] font-semibold leading-tight truncate flex-1 min-w-0"
                style={{ color: 'var(--text-primary)' }}
                title={player?.name || pid}
              >
                {player?.name || pid}
              </span>
            </div>

            <div className="flex items-center gap-1.5 min-w-0 w-full overflow-hidden">
              {player && <RankBadge rank={player.rank} surface="tile" />}

              {isManual && !playingCourtName && (
                <span
                  className="inline-flex items-center text-[11px] font-semibold shrink-0"
                  style={{ color: 'var(--color-warning)' }}
                  title="Chọn thủ công"
                >
                  <Lock className="w-3 h-3" />
                </span>
              )}

              {playingCourtName && (
                <span
                  className="text-[11px] font-semibold truncate"
                  style={{ color: 'var(--color-danger)' }}
                  title={`Đang đánh ở ${playingCourtName}`}
                >
                  {playingCourtName}
                </span>
              )}
            </div>
          </button>
        ) : (
          <div className="min-w-0 flex-1 h-full px-3 py-2 flex flex-col justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {player && <GenderDot sex={player.sex} />}
              <span
                className="text-[14px] font-semibold leading-tight truncate flex-1 min-w-0"
                style={{ color: 'var(--text-primary)' }}
                title={player?.name || pid}
              >
                {player?.name || pid}
              </span>
            </div>

            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
              {player && <RankBadge rank={player.rank} surface="tile" />}
              {playingCourtName && (
                <span
                  className="text-[11px] font-semibold truncate"
                  style={{ color: 'var(--color-danger)' }}
                >
                  {playingCourtName}
                </span>
              )}
            </div>
          </div>
        )}

        {!isViewer && (
          <button
            type="button"
            onClick={() => onSetNextUpSlot(court.id, idx, null)}
            aria-label={`Bỏ ${player?.name || 'người'} khỏi lượt kế tiếp`}
            title="Bỏ người khỏi lượt kế tiếp"
            className="w-11 h-full flex items-center justify-center shrink-0 transition ui-tile-interactive"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  // Consistent card height for both Host and Viewer so every court in the grid matches identically
  const cardMinHeight = isViewer ? 'min-h-[476px]' : 'min-h-[612px]';

  return (
    <article
      className={`h-full flex flex-col overflow-hidden transition-colors ${cardMinHeight} ${
        isPlaying
          ? 'ui-card-active'
          : court.isActive
          ? 'ui-card'
          : 'ui-card-disabled'
      }`}
    >
      {/* 1. COURT HEADER (Fixed 64px height) */}
      <div className="h-[64px] px-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2
            className="font-bold text-[17px] tracking-[-0.02em] truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {court.name}
          </h2>

          {court.isActive ? (
            court.currentMatch ? (
              <StatusPill tone="accent">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                />
                <span>Đang đánh</span>
              </StatusPill>
            ) : (
              <StatusPill tone="neutral">Đang trống</StatusPill>
            )
          ) : (
            <StatusPill tone="neutral">Đang tắt</StatusPill>
          )}

          {court.forcedType && !isViewer && (
            <StatusPill tone="neutral">
              {court.forcedType === 'DOUBLES' ? 'Ép Đôi' : 'Ép Đơn'}
            </StatusPill>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {court.currentMatch && (
            <div
              className="h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-semibold tabular-nums"
              style={
                isOvertime
                  ? {
                      backgroundColor: 'var(--color-danger-soft)',
                      color: 'var(--color-danger)',
                    }
                  : {
                      backgroundColor: 'var(--bg-surface-secondary)',
                      color: 'var(--text-secondary)',
                    }
              }
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{matchDurationMinutes}p</span>
            </div>
          )}

          {!isViewer && (
            <button
              type="button"
              onClick={() => setShowCourtMenu((prev) => !prev)}
              title={`Tùy chọn ${court.name}`}
              aria-label={`Tùy chọn ${court.name}`}
              className="ui-icon-btn w-11 h-11"
              style={
                showCourtMenu
                  ? {
                      backgroundColor: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                    }
                  : undefined
              }
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* INLINE COURT OPTIONS DRAWER (Host only, shown on demand) */}
      {showCourtMenu && !isViewer && (
        <div
          className="mx-4 mb-3 p-3.5 rounded-[16px] space-y-3"
          style={{ backgroundColor: 'var(--bg-surface-secondary)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[14px] font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Kiểu sân
            </span>
            <div
              className="inline-flex items-center gap-1 p-1 rounded-xl"
              style={{ backgroundColor: 'var(--bg-surface)' }}
            >
              {(
                [
                  { val: null, label: 'Auto' },
                  { val: 'DOUBLES', label: 'Đôi' },
                  { val: 'SINGLES', label: 'Đơn' },
                ] as const
              ).map((opt) => {
                const active = (court.forcedType ?? null) === opt.val;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => onUpdateCourt(court.id, { forcedType: opt.val })}
                    className="min-h-[36px] px-3 rounded-lg text-[13px] font-semibold transition"
                    style={
                      active
                        ? {
                            backgroundColor: 'var(--color-accent)',
                            color: 'var(--text-on-accent)',
                          }
                        : { color: 'var(--text-secondary)' }
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t ui-divider">
            {onEditRank && court.currentMatch && (
              <button
                type="button"
                onClick={() => setShowQuickRankControls((v) => !v)}
                className={`ui-btn flex-1 px-3 ${
                  showQuickRankControls ? 'ui-btn-accent-soft' : 'ui-btn-ghost'
                }`}
                style={
                  !showQuickRankControls
                    ? { backgroundColor: 'var(--bg-surface)' }
                    : undefined
                }
              >
                {showQuickRankControls ? 'Ẩn ± trình' : 'Hiện ± trình'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onUpdateCourt(court.id, { isActive: !court.isActive });
                setShowCourtMenu(false);
              }}
              className={`ui-btn flex-1 px-3 ${
                !court.isActive ? 'ui-btn-accent-soft' : 'ui-btn-ghost'
              }`}
              style={
                court.isActive
                  ? { backgroundColor: 'var(--bg-surface)' }
                  : undefined
              }
            >
              <Power className="w-4 h-4" />
              <span>{court.isActive ? 'Tắt sân' : 'Bật sân'}</span>
            </button>
          </div>
        </div>
      )}

      {court.isActive ? (
        <div className="flex-1 flex flex-col justify-between px-4 pb-4 gap-3.5">
          {/* 2. TOP SECTION: ACTIVE MATCH OR READY STATE */}
          <div className="space-y-3">
            {/* Live Bet Badge (when active) */}
            {court.currentMatch?.bet && (
              <button
                type="button"
                disabled={isViewer || !onSetCourtBet}
                onClick={() => !isViewer && openLiveBetEditor()}
                className="ui-banner-warning w-full min-h-[44px] px-3.5 py-2 flex items-center justify-between gap-2 text-[14px] font-semibold text-left disabled:cursor-default"
              >
                <span className="flex items-center gap-2 min-w-0 truncate">
                  <Flame className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    Kèo độ: {court.currentMatch.bet.label} (
                    {court.currentMatch.bet.unit === 'PER_PLAYER' ? 'mỗi người' : 'cả đội'} ·{' '}
                    {court.currentMatch.bet.payoutMode === 'LOSER_TO_FUND'
                      ? 'Góp quỹ'
                      : 'Trả đội thắng'}
                    )
                  </span>
                </span>
                {!isViewer && onSetCourtBet && (
                  <span className="text-[13px] underline shrink-0">Sửa</span>
                )}
              </button>
            )}

            {/* Live Bet Mini Editor (Host only, shown on demand) */}
            {showBetEditor && !isViewer && onSetCourtBet && court.currentMatch && (
              <div
                className="p-3.5 rounded-[16px] space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface-secondary)',
                  border: '1px solid var(--color-warning-border)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[14px] font-bold flex items-center gap-1.5"
                    style={{ color: 'var(--color-warning)' }}
                  >
                    <Flame className="w-4 h-4" />
                    <span>Cài kèo độ trực tiếp</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowBetEditor(false)}
                    aria-label="Đóng chỉnh kèo độ"
                    className="ui-icon-btn w-9 h-9 min-w-0 min-h-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    {
                      label: '1 nước',
                      amt: 0,
                      unit: 'PER_PLAYER' as BetUnit,
                      pay: 'TEAM_TO_TEAM' as BetPayoutMode,
                    },
                    {
                      label: '1 quả cầu',
                      amt: 0,
                      unit: 'PER_TEAM' as BetUnit,
                      pay: 'LOSER_TO_FUND' as BetPayoutMode,
                    },
                    {
                      label: '20k/người',
                      amt: 20000,
                      unit: 'PER_PLAYER' as BetUnit,
                      pay: 'TEAM_TO_TEAM' as BetPayoutMode,
                    },
                    {
                      label: '50k/đội',
                      amt: 50000,
                      unit: 'PER_TEAM' as BetUnit,
                      pay: 'TEAM_TO_TEAM' as BetPayoutMode,
                    },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setBetLabelInput(p.label);
                        setBetAmountInput(p.amt);
                        setBetUnitInput(p.unit);
                        setBetPayoutInput(p.pay);
                      }}
                      className="min-h-[36px] px-3 rounded-xl text-[13px] font-semibold transition"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Tên kèo..."
                    value={betLabelInput}
                    onChange={(e) => setBetLabelInput(e.target.value)}
                    className="ui-input"
                  />
                  <input
                    type="number"
                    step={5000}
                    min={0}
                    placeholder="Tiền VNĐ (0=vật)"
                    value={betAmountInput}
                    onChange={(e) => setBetAmountInput(Number(e.target.value) || 0)}
                    className="ui-input tabular-nums font-semibold"
                  />
                  <select
                    value={betUnitInput}
                    onChange={(e) => setBetUnitInput(e.target.value as BetUnit)}
                    className="ui-select"
                  >
                    <option value="PER_PLAYER">Mỗi người</option>
                    <option value="PER_TEAM">Cả đội</option>
                  </select>
                  <select
                    value={betPayoutInput}
                    onChange={(e) => setBetPayoutInput(e.target.value as BetPayoutMode)}
                    className="ui-select"
                  >
                    <option value="TEAM_TO_TEAM">Trả đội thắng</option>
                    <option value="LOSER_TO_FUND">Góp Quỹ chung</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {court.currentMatch.bet && (
                    <button
                      type="button"
                      onClick={() => {
                        onSetCourtBet(court.id, null);
                        setShowBetEditor(false);
                      }}
                      className="ui-btn ui-btn-danger-soft px-3.5"
                    >
                      Tắt kèo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const clean = betLabelInput.trim() || '1 nước';
                      onSetCourtBet(court.id, {
                        category: betAmountInput > 0 ? 'MONEY' : 'DRINK',
                        label: clean,
                        quantity: 1,
                        unit: betUnitInput,
                        amountVnd: Math.max(0, Math.round(betAmountInput)),
                        payoutMode: betPayoutInput,
                      });
                      setShowBetEditor(false);
                    }}
                    className="ui-btn ui-btn-primary px-4"
                  >
                    Áp dụng
                  </button>
                </div>
              </div>
            )}

            {/* FIXED-HEIGHT MATCH STAGE (158px across 4-player, 2-player, and empty states) */}
            {court.currentMatch ? (
              <div className="h-[158px] flex flex-col justify-between">
                <div className="h-[20px] grid grid-cols-[1fr_24px_1fr] items-center gap-2">
                  <span
                    className="text-[12px] font-semibold uppercase tracking-[0.04em]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Đội 1
                  </span>
                  <span
                    className="text-[11px] font-bold text-center"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    VS
                  </span>
                  <span
                    className="text-[12px] font-semibold uppercase tracking-[0.04em] text-right"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Đội 2
                  </span>
                </div>

                <div className="grid grid-cols-[1fr_1px_1fr] gap-2.5 items-stretch">
                  <div className="flex flex-col gap-2 min-w-0">
                    {court.currentMatch.team1.map((pid, idx) => (
                      <div key={pid} className="min-w-0">
                        {renderCurrentPlayerSlot(pid, () =>
                          setSlotSheetTarget({
                            target: 'CURRENT',
                            team: 1,
                            index: idx,
                            baseLineup: court.currentMatch!,
                          })
                        )}
                      </div>
                    ))}
                    {court.currentMatch.team1.length < 2 && renderSpacerSlot()}
                  </div>

                  <div className="ui-court-divider my-2" aria-hidden="true" />

                  <div className="flex flex-col gap-2 min-w-0">
                    {court.currentMatch.team2.map((pid, idx) => (
                      <div key={pid} className="min-w-0">
                        {renderCurrentPlayerSlot(pid, () =>
                          setSlotSheetTarget({
                            target: 'CURRENT',
                            team: 2,
                            index: idx,
                            baseLineup: court.currentMatch!,
                          })
                        )}
                      </div>
                    ))}
                    {court.currentMatch.team2.length < 2 && renderSpacerSlot()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="ui-tile h-[158px] px-4 flex flex-col items-center justify-center text-center gap-1.5">
                <p
                  className="text-[15px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {court.name} đang sẵn sàng
                </p>
                <p
                  className="text-[14px] truncate max-w-full"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {isNextUpComplete(court.nextUp)
                    ? `Đã đủ ${maxNextCount}/${maxNextCount} người sắp vào sân`
                    : `Cần ${maxNextCount} người ở lượt kế tiếp`}
                </p>
              </div>
            )}

            {/* FIXED-HEIGHT BALANCE / STATUS BAR (28px single line) */}
            <div className="h-[28px] flex items-center justify-between gap-2 text-[13px] min-w-0">
              {court.currentMatch ? (
                (() => {
                  const desc = describeLineup(court.currentMatch, state);
                  const toneColor =
                    desc.label === 'Cân kèo'
                      ? 'var(--color-accent)'
                      : desc.label === 'Lệch nhẹ'
                      ? 'var(--color-warning)'
                      : 'var(--color-danger)';

                  return (
                    <>
                      <span
                        className="inline-flex items-center gap-1.5 font-semibold shrink-0"
                        style={{ color: toneColor }}
                      >
                        {desc.label === 'Cân kèo' ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                        )}
                        <span>{desc.label}</span>
                      </span>
                      <span
                        className="tabular-nums truncate"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Chênh {desc.diff}đ ({desc.team1Skill} vs {desc.team2Skill})
                      </span>
                    </>
                  );
                })()
              ) : blockedPlayerPlayingElsewhere ? (
                <span
                  className="inline-flex items-center gap-1.5 font-semibold truncate"
                  style={{ color: 'var(--color-danger)' }}
                  title={`Không thể bắt đầu: ${blockedPlayerPlayingElsewhere.playerName} đang đánh ở ${blockedPlayerPlayingElsewhere.courtName}`}
                >
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {blockedPlayerPlayingElsewhere.playerName} đang ở{' '}
                    {blockedPlayerPlayingElsewhere.courtName}
                  </span>
                </span>
              ) : (
                <span
                  className="truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {isViewer
                    ? 'Chưa có trận đang diễn ra'
                    : 'Chạm ô bên dưới hoặc bấm Gợi ý để xếp lượt'}
                </span>
              )}
            </div>

            {/* HOST ACTION CONTROLS (Hidden completely for VIEWER) */}
            {!isViewer && (
              <div className="space-y-2">
                {court.currentMatch ? (
                  <>
                    <button
                      type="button"
                      onClick={handleEndMatchClick}
                      className="ui-btn ui-btn-primary w-full h-[48px] rounded-full text-[15px]"
                    >
                      <span className="truncate">
                        {isNextUpComplete(court.nextUp)
                          ? 'Kết thúc & Vào lượt mới'
                          : 'Kết thúc trận'}
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0" />
                    </button>

                    <div className="h-[44px] flex items-center gap-1.5">
                      {court.currentMatch.type === 'DOUBLES' && (
                        <>
                          <button
                            type="button"
                            onClick={handleRotatePairings}
                            title="Xoay 3 thế đứng (Đảo cặp)"
                            aria-label="Đảo cặp đang đánh"
                            className="ui-icon-btn w-11 h-11 shrink-0"
                          >
                            <Shuffle
                              className="w-4 h-4"
                              style={{ color: 'var(--color-accent)' }}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={handleAutoBalancePairings}
                            title="Tự động xếp cặp có chênh lệch trình độ nhỏ nhất (Cân kèo)"
                            aria-label="Cân kèo đang đánh"
                            className="ui-icon-btn w-11 h-11 shrink-0"
                          >
                            <Scale
                              className="w-4 h-4"
                              style={{ color: 'var(--color-accent)' }}
                            />
                          </button>
                        </>
                      )}

                      {onSetCourtBet && (
                        <button
                          type="button"
                          onClick={openLiveBetEditor}
                          title="Cài kèo đánh độ (nước / cầu / tiền) cho trận này"
                          className={`ui-btn px-3 text-[13px] gap-1.5 min-w-0 ${
                            court.currentMatch.type === 'DOUBLES'
                              ? 'shrink-0'
                              : 'flex-1'
                          } ${
                            court.currentMatch.bet
                              ? 'ui-btn-warning-soft'
                              : 'ui-btn-secondary'
                          }`}
                        >
                          <Flame
                            className="w-4 h-4 shrink-0"
                            style={{ color: 'var(--color-warning)' }}
                          />
                          <span className="whitespace-nowrap">Độ</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const now = Date.now();
                          if (now - lastEndClickRef.current < 600) return;
                          lastEndClickRef.current = now;
                          vibrateSuccess();
                          onEndMatch(court.id, court.currentMatch?.id);
                          onTriggerUndoToast(
                            `Đã kết thúc trận trên ${court.name} (sân trống để thong thả xếp tiếp)`
                          );
                        }}
                        title="Chỉ kết thúc trận hiện tại, giữ sân trống và không tự đẩy lượt mới vào"
                        className="ui-btn ui-btn-secondary flex-1 px-2.5 text-[13px] gap-1.5 min-w-0"
                      >
                        <Square
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: 'var(--text-secondary)' }}
                        />
                        <span className="truncate">Chỉ dừng</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={
                        !isNextUpComplete(court.nextUp) || !!blockedPlayerPlayingElsewhere
                      }
                      onClick={handleStartNextUpClick}
                      className="ui-btn ui-btn-primary w-full h-[48px] rounded-full text-[15px]"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span className="truncate">Bắt đầu trận trên {court.name}</span>
                    </button>

                    {/* Reserved 44px row keeps Next Up section baseline identical to active courts */}
                    <div className="h-[44px] flex items-center justify-center">
                      <span
                        className="text-[13px] truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {isNextUpComplete(court.nextUp) && !blockedPlayerPlayingElsewhere
                          ? 'Sẵn sàng bấm bắt đầu trận mới'
                          : 'Đội hình lượt kế tiếp sẽ vào sân ngay khi bấm bắt đầu'}
                      </span>
                    </div>
                  </>
                )}

                {court.currentMatch &&
                  isNextUpComplete(court.nextUp) &&
                  blockedPlayerPlayingElsewhere && (
                    <div className="ui-banner-danger px-3 py-2 text-[13px] font-medium flex items-center gap-2">
                      <AlertOctagon className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {blockedPlayerPlayingElsewhere.playerName} đang đánh ở{' '}
                        {blockedPlayerPlayingElsewhere.courtName}.
                      </span>
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* 3. BOTTOM SECTION: NEXT UP (Fixed geometry across Doubles & Singles) */}
          <div className="pt-3.5 border-t ui-divider space-y-2.5">
            {/* Next Up Header (Fixed 44px touch height) */}
            <div className="min-h-[44px] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="text-[14px] font-semibold truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Sắp vào sân
                </span>
                <span
                  className="text-[13px] font-semibold tabular-nums"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {filledNextCount}/{maxNextCount}
                </span>
              </div>

              {!isViewer ? (
                <button
                  type="button"
                  onClick={() =>
                    onToggleNextUpType
                      ? onToggleNextUpType(court.id)
                      : onUpdateCourt(court.id, {
                          forcedType: safeNextUp.type === 'DOUBLES' ? 'SINGLES' : 'DOUBLES',
                        })
                  }
                  title="Chuyển nhanh giữa Đôi (4 ô) và Đơn (2 ô)"
                  className="ui-btn ui-btn-secondary min-h-[44px] px-3.5 rounded-full text-[13px] shrink-0"
                >
                  {safeNextUp.type === 'DOUBLES' ? 'Đôi ⇄' : 'Đơn ⇄'}
                </button>
              ) : (
                <span
                  className="text-[13px] font-medium"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {safeNextUp.type === 'DOUBLES' ? 'Đánh đôi' : 'Đánh đơn'}
                </span>
              )}
            </div>

            {/* Next Up Fixed 158px 2-Column Grid */}
            <div className="h-[158px] flex flex-col justify-between">
              <div className="h-[20px] grid grid-cols-2 gap-2.5 items-center">
                <span
                  className="text-[12px] font-semibold uppercase tracking-[0.04em]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Đội 1
                </span>
                <span
                  className="text-[12px] font-semibold uppercase tracking-[0.04em]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Đội 2
                </span>
              </div>

              {safeNextUp.type === 'SINGLES' ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex flex-col gap-2 min-w-0">
                    {renderNextUpSlot(safeNextUp.slots[0], 0)}
                    {renderSpacerSlot()}
                  </div>
                  <div className="flex flex-col gap-2 min-w-0">
                    {renderNextUpSlot(safeNextUp.slots[1], 1)}
                    {renderSpacerSlot()}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex flex-col gap-2 min-w-0">
                    {renderNextUpSlot(safeNextUp.slots[0], 0)}
                    {renderNextUpSlot(safeNextUp.slots[1], 1)}
                  </div>
                  <div className="flex flex-col gap-2 min-w-0">
                    {renderNextUpSlot(safeNextUp.slots[2], 2)}
                    {renderNextUpSlot(safeNextUp.slots[3], 3)}
                  </div>
                </div>
              )}
            </div>

            {/* Fixed-height 2-Line Evaluation Block (untruncated diff + warning, equal height across all courts) */}
            <div className="min-h-[48px] flex flex-col justify-center gap-1 text-[13px] min-w-0">
              {isNextUpComplete(safeNextUp) && nextUpEval ? (
                <>
                  <div
                    className="flex items-center gap-1.5 tabular-nums min-w-0"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {nextUpEval.warnings.length > 0 ? (
                      <AlertTriangle
                        className="w-4 h-4 shrink-0"
                        style={{ color: 'var(--color-warning)' }}
                      />
                    ) : (
                      <CheckCircle2
                        className="w-4 h-4 shrink-0"
                        style={{ color: 'var(--color-accent)' }}
                      />
                    )}
                    <span className="truncate font-medium">
                      Chênh {nextUpEval.skillDiff}đ · {nextUpEval.genderPattern}
                    </span>
                  </div>

                  {nextUpEval.warnings.length > 0 ? (
                    <div
                      className="text-[12px] font-medium leading-snug truncate"
                      style={{ color: 'var(--color-warning)' }}
                      title={nextUpEval.warnings.join(' • ')}
                    >
                      {nextUpEval.warnings[0]}
                    </div>
                  ) : (
                    <div
                      className="text-[12px] leading-snug"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Đội hình cân bằng, sẵn sàng vào sân
                    </div>
                  )}
                </>
              ) : (
                <span
                  className="text-[13px] truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {filledNextCount === 0
                    ? 'Chưa xếp đội hình lượt kế tiếp'
                    : `Còn thiếu ${maxNextCount - filledNextCount} vị trí`}
                </span>
              )}
            </div>

            {/* Next Up Action Bar (Fixed 44px height, Host only) */}
            {!isViewer && (
              <div className="h-[44px] flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!canSuggestNextUp(state, court.id)) {
                      const needed = safeNextUp.type === 'SINGLES' ? 2 : 4;
                      onShowWarningToast?.(`Không đủ ${needed} người rảnh để gợi ý`);
                      return;
                    }
                    onSuggestNextUp(court.id);
                  }}
                  title="Gợi ý đội hình cho lượt kế tiếp"
                  className="ui-btn ui-btn-secondary flex-1 px-3 min-w-0"
                >
                  <RotateCw
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--color-accent)' }}
                  />
                  <span className="truncate">
                    {isNextUpEmpty(safeNextUp) ? 'Gợi ý kèo' : 'Gợi ý lại'}
                  </span>
                </button>

                {safeNextUp.type === 'DOUBLES' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onRearrangeNextUp(court.id, 'ROTATE')}
                      disabled={!isNextUpComplete(safeNextUp)}
                      title="Đảo cặp cho 4 người hiện có"
                      aria-label="Đảo cặp lượt kế tiếp"
                      className="ui-icon-btn w-11 h-11 shrink-0"
                    >
                      <Shuffle
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRearrangeNextUp(court.id, 'BALANCE')}
                      disabled={!isNextUpComplete(safeNextUp)}
                      title="Cân kèo cho 4 người hiện có"
                      aria-label="Cân kèo lượt kế tiếp"
                      className="ui-icon-btn w-11 h-11 shrink-0"
                    >
                      <Scale
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => onClearNextUp(court.id)}
                  disabled={isNextUpEmpty(safeNextUp)}
                  title="Xóa trắng toàn bộ các ô lượt sau"
                  aria-label="Xóa trắng lượt kế tiếp"
                  className="ui-icon-btn w-11 h-11 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* DISABLED COURT: fills exact same height as active courts */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: 'var(--bg-surface-secondary)',
              color: 'var(--text-muted)',
            }}
          >
            <Power className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p
              className="text-[16px] font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Sân đang tắt
            </p>
            <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
              Không xếp lượt cho sân này
            </p>
          </div>
          {!isViewer && (
            <button
              type="button"
              onClick={() => onUpdateCourt(court.id, { isActive: true })}
              className="ui-btn ui-btn-secondary mt-2 px-5 rounded-full"
            >
              Bật lại sân này
            </button>
          )}
        </div>
      )}

      {/* Substitution Bottom Sheet Modal (Host only) */}
      {slotSheetTarget && !isViewer && (
        <SlotSheet
          isOpen={true}
          onClose={() => setSlotSheetTarget(null)}
          courtName={court.name}
          courtId={court.id}
          target={slotSheetTarget.target}
          slotIndex={slotSheetTarget.slotIndex}
          team={slotSheetTarget.team}
          index={slotSheetTarget.index}
          currentLineup={slotSheetTarget.baseLineup}
          state={state}
          onSelectPlayer={(playerId) => {
            if (slotSheetTarget.target === 'NEXT_UP' && slotSheetTarget.slotIndex !== undefined) {
              onSetNextUpSlot(court.id, slotSheetTarget.slotIndex, playerId);
            } else if (slotSheetTarget.target === 'CURRENT' && court.currentMatch) {
              onSwapPlayers(
                court.id,
                'CURRENT',
                { team: slotSheetTarget.team || 1, index: slotSheetTarget.index || 0 },
                { playerId },
                court.currentMatch
              );
            }
          }}
          onResumePlayer={onResumePlayer}
        />
      )}
    </article>
  );
};
