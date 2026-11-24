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
import { getEffectiveSkill, RANK_METADATA, stepRankDown, stepRankUp } from '../engine/skillConfig';
import { describeLineup, validateLineup } from '../engine/validateLineup';
import { SlotSheet } from './SlotSheet';
import { vibrateSuccess, vibrateWarning } from '../utils/vibrate';

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
  // Ref chống bấm đúp nút Kết thúc
  const lastEndClickRef = useRef<number>(0);

  // Menu tùy chọn gọn (•••) cho sân (Auto/Đôi/Đơn, Bật/Tắt sân, Bật/tắt chỉnh trình nhanh)
  const [showCourtMenu, setShowCourtMenu] = useState(false);
  const [showQuickRankControls, setShowQuickRankControls] = useState(false);

  // Popup chỉnh kèo độ live trên sân
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

  // Slot sheet state
  const [slotSheetTarget, setSlotSheetTarget] = useState<{
    target: 'CURRENT' | 'NEXT_UP';
    slotIndex?: number;
    team?: 1 | 2;
    index?: number;
    baseLineup?: Lineup;
  } | null>(null);

  // Live timer tick cho trận đang đánh (mỗi giây)
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

  // Tìm xem người chơi có đang đánh ở sân khác không
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

  // Người chơi đầu tiên trong nextUp đang bận thi đấu ở sân khác
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

  // Kiểm tra tính hợp lệ của đội hình trước khi vào sân
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

  // Tính số phút trận đấu đang diễn ra
  const matchDurationMinutes = court.currentMatch
    ? Math.max(0, Math.floor((liveNow - court.currentMatch.startedAt) / 60000))
    : 0;

  const isOvertime = matchDurationMinutes >= 20;

  // Xử lý nút KẾT THÚC & ĐẨY LƯỢT MỚI (Debounce 600ms)
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

  // Đảo cặp 3 thế đứng cho trận Đôi đang đánh (Xoay vòng: 0 -> 1 -> 2 -> 0)
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

  // Tự cân cặp cho trận Đôi đang đánh
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

  // Nút Vào sân khi sân đang trống
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

  // Render thẻ người chơi cho trận đang đánh (CURRENT match) — 3px gender bar + gọn + đủ nút chỉnh trình khi cần
  const renderCurrentPlayerBadge = (playerId: string, onClick?: () => void) => {
    const player = getPlayer(playerId);
    if (!player) {
      return (
        <div
          className="vo-tile px-2.5 py-2 rounded-xl text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          Chưa rõ
        </div>
      );
    }

    const rankMeta = RANK_METADATA[player.rank];

    return (
      <div
        onClick={onClick}
        className={`vo-tile ${
          player.sex === 'M' ? 'vo-gender-bar-m' : 'vo-gender-bar-f'
        } pl-3 pr-2 py-2 rounded-xl cursor-pointer flex items-center justify-between gap-1.5 min-w-0 active:scale-[0.98]`}
      >
        <div className="min-w-0 flex-1 flex items-center justify-between gap-1.5">
          <span
            className="font-semibold text-[13.5px] tracking-[-0.015em] truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {player.name}
          </span>
          <span
            className="shrink-0 text-[10px] font-bold font-mono-tabular px-1.5 py-0.5 rounded-md"
            style={{
              background: 'var(--bg-pill-track)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            {rankMeta.code}
          </span>
        </div>

        {showQuickRankControls && onEditRank && !isViewer && (
          <div
            className="flex items-center gap-0.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onEditRank(player.id, stepRankDown(player.rank))}
              title="Hạ 1 bậc trình"
              className="vo-btn-subtle w-6 h-6 rounded-md flex items-center justify-center"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onEditRank(player.id, stepRankUp(player.rank))}
              title="Tăng 1 bậc trình"
              className="vo-btn-subtle w-6 h-6 rounded-md flex items-center justify-center"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <article
      className={`rounded-[22px] overflow-hidden transition-all duration-200 ${
        isPlaying
          ? 'vo-glass-card-active'
          : court.isActive
          ? 'vo-glass-card'
          : 'vo-glass-card opacity-55'
      }`}
    >
      {/* ==================================================== */}
      {/* 1. HEADER SÂN (Gọn + Đủ tùy chọn qua menu •••) */}
      {/* ==================================================== */}
      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h2
            className="font-bold text-[17px] tracking-[-0.025em] truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {court.name}
          </h2>

          {court.isActive ? (
            court.currentMatch ? (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold tracking-[0.03em]"
                style={{
                  background: 'var(--live-soft)',
                  color: 'var(--live)',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{
                    background: 'var(--live)',
                    boxShadow: '0 0 8px var(--live)',
                  }}
                />
                <span>ĐANG ĐÁNH</span>
              </span>
            ) : (
              <span
                className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
                style={{
                  background: 'var(--bg-pill-track)',
                  color: 'var(--text-muted)',
                }}
              >
                Đang trống
              </span>
            )
          ) : (
            <span
              className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
              style={{
                background: 'var(--bg-pill-track)',
                color: 'var(--text-muted)',
              }}
            >
              Đang tắt
            </span>
          )}

          {court.forcedType && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: 'var(--accent-lime-soft)',
                color: 'var(--accent-lime)',
                border: '1px solid var(--accent-lime-border)',
              }}
            >
              {court.forcedType === 'DOUBLES' ? 'Ép Đôi' : 'Ép Đơn'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {court.currentMatch && (
            <div
              className={`flex items-center gap-1 px-2.5 h-8 rounded-xl text-xs font-semibold font-mono-tabular ${
                isOvertime ? 'animate-pulse' : ''
              }`}
              style={
                isOvertime
                  ? {
                      background: 'var(--live-soft)',
                      color: 'var(--live)',
                      border: '1px solid rgba(251, 113, 133, 0.35)',
                    }
                  : {
                      background: 'var(--bg-stage)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                    }
              }
            >
              <Clock className="w-3.5 h-3.5" style={{ color: isOvertime ? 'var(--live)' : 'var(--accent-lime)' }} />
              <span>{matchDurationMinutes}p</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowCourtMenu((prev) => !prev)}
            title={`Tùy chọn ${court.name}`}
            aria-label={`Tùy chọn ${court.name}`}
            className="vo-btn-subtle w-8 h-8 rounded-xl flex items-center justify-center"
            style={
              showCourtMenu
                ? {
                    background: 'var(--accent-lime-soft)',
                    borderColor: 'var(--accent-lime-border)',
                    color: 'var(--accent-lime)',
                  }
                : undefined
            }
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inline Collapsible Court Options Drawer (Auto | Đôi | Đơn, Chỉnh trình, Tắt/Bật sân) */}
      {showCourtMenu && (
        <div className="mx-3.5 mb-2.5 p-2.5 rounded-2xl vo-stage space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Kiểu sân:
            </span>
            <div className="flex items-center gap-1 p-0.5 rounded-xl" style={{ background: 'var(--bg-pill-track)' }}>
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
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition"
                    style={
                      active
                        ? {
                            background: 'var(--accent-cta)',
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

          <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-white/5">
            {onEditRank && !isViewer && court.currentMatch && (
              <button
                type="button"
                onClick={() => setShowQuickRankControls((v) => !v)}
                className="vo-btn-subtle flex-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1"
                style={
                  showQuickRankControls
                    ? {
                        background: 'var(--accent-lime-soft)',
                        borderColor: 'var(--accent-lime-border)',
                        color: 'var(--accent-lime)',
                      }
                    : undefined
                }
              >
                <span>{showQuickRankControls ? 'Ẩn nút ± trình' : 'Hiện nút ± trình'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onUpdateCourt(court.id, { isActive: !court.isActive });
                setShowCourtMenu(false);
              }}
              className="vo-btn-subtle flex-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5"
              style={
                !court.isActive
                  ? {
                      background: 'var(--accent-lime-soft)',
                      borderColor: 'var(--accent-lime-border)',
                      color: 'var(--accent-lime)',
                    }
                  : undefined
              }
            >
              <Power className="w-3.5 h-3.5" />
              <span>{court.isActive ? 'Tắt sân này' : 'Bật sân này'}</span>
            </button>
          </div>
        </div>
      )}

      {court.isActive ? (
        <div className="px-3.5 pb-3.5 space-y-3">
          {/* ==================================================== */}
          {/* 2. KHUNG TRẬN ĐANG ĐÁNH (CURRENT MATCH) */}
          {/* ==================================================== */}
          {court.currentMatch ? (
            <div className="space-y-2.5">
              {/* Nhãn Kèo Đánh Độ Live (Hiển thị cho cả VIEWER tạo không khí) */}
              {court.currentMatch.bet && (
                <button
                  type="button"
                  disabled={isViewer || !onSetCourtBet}
                  onClick={() => !isViewer && openLiveBetEditor()}
                  className="w-full px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs font-bold text-left disabled:cursor-default transition"
                  style={{
                    background: 'var(--amber-soft)',
                    border: '1px solid var(--amber-border)',
                    color: 'var(--amber)',
                  }}
                >
                  <span className="flex items-center gap-1.5 min-w-0 truncate">
                    <Flame className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      KÈO ĐỘ: {court.currentMatch.bet.label} (
                      {court.currentMatch.bet.unit === 'PER_PLAYER' ? 'mỗi người' : 'cả đội'}
                      {' • '}
                      {court.currentMatch.bet.payoutMode === 'LOSER_TO_FUND'
                        ? 'Góp quỹ'
                        : 'Trả đội thắng'}
                      )
                    </span>
                  </span>
                  {!isViewer && onSetCourtBet && (
                    <span className="text-[10.5px] underline shrink-0">Sửa</span>
                  )}
                </button>
              )}

              {/* Popup mini chỉnh nhanh kèo độ live */}
              {showBetEditor && !isViewer && onSetCourtBet && (
                <div className="p-3 rounded-2xl vo-stage border border-amber-500/40 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-400 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" />
                      <span>Cài kèo độ trực tiếp</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowBetEditor(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: '1 nước', amt: 0, unit: 'PER_PLAYER' as BetUnit, pay: 'TEAM_TO_TEAM' as BetPayoutMode },
                      { label: '1 quả cầu', amt: 0, unit: 'PER_TEAM' as BetUnit, pay: 'LOSER_TO_FUND' as BetPayoutMode },
                      { label: '20k/người', amt: 20000, unit: 'PER_PLAYER' as BetUnit, pay: 'TEAM_TO_TEAM' as BetPayoutMode },
                      { label: '50k/đội', amt: 50000, unit: 'PER_TEAM' as BetUnit, pay: 'TEAM_TO_TEAM' as BetPayoutMode },
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
                        className="vo-btn-subtle px-2.5 py-1 rounded-lg font-semibold text-[11px]"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      placeholder="Tên kèo..."
                      value={betLabelInput}
                      onChange={(e) => setBetLabelInput(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"
                    />
                    <input
                      type="number"
                      step={5000}
                      min={0}
                      placeholder="Tiền VNĐ (0=vật)"
                      value={betAmountInput}
                      onChange={(e) => setBetAmountInput(Number(e.target.value) || 0)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold text-amber-300 font-mono-tabular"
                    />
                    <select
                      value={betUnitInput}
                      onChange={(e) => setBetUnitInput(e.target.value as BetUnit)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-100"
                    >
                      <option value="PER_PLAYER">Mỗi người</option>
                      <option value="PER_TEAM">Cả đội</option>
                    </select>
                    <select
                      value={betPayoutInput}
                      onChange={(e) => setBetPayoutInput(e.target.value as BetPayoutMode)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-100"
                    >
                      <option value="TEAM_TO_TEAM">Trả đội thắng</option>
                      <option value="LOSER_TO_FUND">Góp Quỹ chung</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    {court.currentMatch.bet && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetCourtBet(court.id, null);
                          setShowBetEditor(false);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-950/70 text-rose-300 border border-rose-700/60 text-[11px] font-bold"
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
                      className="vo-cta-lime px-3 py-1 rounded-lg text-[11px] font-extrabold"
                    >
                      Áp dụng
                    </button>
                  </div>
                </div>
              )}

              {/* Match Stage: 2 Columns + Subtle Badminton Net Center Line */}
              <div className="vo-stage rounded-2xl p-2.5 grid grid-cols-[1fr_22px_1fr] items-stretch gap-1.5">
                {/* Team 1 */}
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.06em] pl-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Đội 1
                  </span>
                  {court.currentMatch.team1.map((pid, idx) => (
                    <div key={pid}>
                      {renderCurrentPlayerBadge(pid, () =>
                        setSlotSheetTarget({
                          target: 'CURRENT',
                          team: 1,
                          index: idx,
                          baseLineup: court.currentMatch!,
                        })
                      )}
                    </div>
                  ))}
                </div>

                {/* Subtle Badminton Net Divider */}
                <div className="vo-court-net" aria-hidden="true">
                  <span
                    className="relative z-10 w-[22px] h-[22px] rounded-md flex items-center justify-center text-[9px] font-extrabold tracking-wide"
                    style={{
                      background: 'var(--bg-card-solid)',
                      border: '1px solid var(--border-card)',
                      color: 'var(--accent-lime)',
                    }}
                  >
                    VS
                  </span>
                </div>

                {/* Team 2 */}
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.06em] text-right pr-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Đội 2
                  </span>
                  {court.currentMatch.team2.map((pid, idx) => (
                    <div key={pid}>
                      {renderCurrentPlayerBadge(pid, () =>
                        setSlotSheetTarget({
                          target: 'CURRENT',
                          team: 2,
                          index: idx,
                          baseLineup: court.currentMatch!,
                        })
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Compact Skill Balance Bar */}
              {(() => {
                const desc = describeLineup(court.currentMatch, state);
                const accentColor =
                  desc.label === 'Cân kèo'
                    ? 'var(--accent-lime)'
                    : desc.label === 'Lệch nhẹ'
                    ? 'var(--amber)'
                    : 'var(--live)';

                return (
                  <div
                    className="px-2.5 py-1.5 rounded-xl flex items-center justify-between text-[11.5px] font-medium"
                    style={{
                      background: 'var(--bg-tile)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-1.5" style={{ color: accentColor }}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-bold">{desc.label}</span>
                    </div>
                    <span className="font-mono-tabular text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Chênh {desc.diff}đ ({desc.team1Skill} vs {desc.team2Skill})
                    </span>
                  </div>
                );
              })()}

              {/* Primary One-Handed CTA (Glossy Volt Lime Pill) */}
              <button
                type="button"
                onClick={handleEndMatchClick}
                className="vo-cta-lime w-full min-h-[48px] py-2.5 px-4 rounded-full font-extrabold text-[13.5px] tracking-[-0.015em] flex items-center justify-center gap-1.5 select-none"
              >
                <span>
                  {isNextUpComplete(court.nextUp)
                    ? 'Kết thúc & Vào lượt mới'
                    : 'Kết thúc trận'}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>

              {/* Compact 1-Row Quick Match Controls (Giữ đủ 100% tính năng: Đảo cặp, Cân kèo, Độ, Chỉ kết thúc) */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {court.currentMatch.type === 'DOUBLES' && (
                  <>
                    <button
                      type="button"
                      onClick={handleRotatePairings}
                      title="Xoay 3 thế đứng (Đảo cặp)"
                      className="vo-btn-subtle flex-1 min-w-[70px] h-8 px-2 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1"
                    >
                      <Shuffle className="w-3 h-3" style={{ color: 'var(--accent-lime)' }} />
                      <span>Đảo cặp</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAutoBalancePairings}
                      title="Tự động xếp cặp có chênh lệch trình độ nhỏ nhất"
                      className="vo-btn-subtle flex-1 min-w-[70px] h-8 px-2 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1"
                    >
                      <Scale className="w-3 h-3" style={{ color: 'var(--accent-lime)' }} />
                      <span>Cân kèo</span>
                    </button>
                  </>
                )}

                {!isViewer && onSetCourtBet && (
                  <button
                    type="button"
                    onClick={openLiveBetEditor}
                    title="Cài kèo đánh độ (nước / cầu / tiền) cho trận này"
                    className="vo-btn-subtle h-8 px-2.5 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1"
                    style={
                      court.currentMatch.bet
                        ? {
                            background: 'var(--amber-soft)',
                            borderColor: 'var(--amber-border)',
                            color: 'var(--amber)',
                          }
                        : undefined
                    }
                  >
                    <Flame className="w-3 h-3" style={{ color: 'var(--amber)' }} />
                    <span>Độ</span>
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
                  title="Kết thúc trận hiện tại để người chơi ra nghỉ, giữ sân trống và KHÔNG tự đẩy lượt mới vào"
                  className="vo-btn-subtle flex-1 min-w-[96px] h-8 px-2.5 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1"
                >
                  <Square className="w-3 h-3" style={{ color: 'var(--amber)' }} />
                  <span>Chỉ kết thúc</span>
                </button>
              </div>

              {isNextUpComplete(court.nextUp) && blockedPlayerPlayingElsewhere && (
                <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 font-semibold flex items-center justify-center gap-1.5">
                  <AlertOctagon className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>
                    Không thể vào lượt mới: {blockedPlayerPlayingElsewhere.playerName} đang đánh ở{' '}
                    {blockedPlayerPlayingElsewhere.courtName}.
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="vo-stage rounded-2xl py-4 px-3 text-center">
                <p
                  className="font-semibold text-[14px]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {court.name} đang sẵn sàng
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {isNextUpComplete(court.nextUp)
                    ? `Đã đủ ${maxNextCount}/${maxNextCount} người ở Sắp vào sân`
                    : `Cần đủ ${maxNextCount} người ở Sắp vào sân để bắt đầu`}
                </p>
              </div>

              <button
                type="button"
                disabled={!isNextUpComplete(court.nextUp) || !!blockedPlayerPlayingElsewhere}
                onClick={handleStartNextUpClick}
                className="vo-cta-lime w-full min-h-[46px] py-2.5 px-4 rounded-full font-extrabold text-[13.5px] disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Bắt đầu trận trên {court.name}</span>
              </button>

              {blockedPlayerPlayingElsewhere && (
                <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 font-semibold flex items-center justify-center gap-1.5">
                  <AlertOctagon className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>
                    Không thể bắt đầu: {blockedPlayerPlayingElsewhere.playerName} đang đánh ở{' '}
                    {blockedPlayerPlayingElsewhere.courtName}.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* 3. LƯỢT KẾ TIẾP (NEXT UP — LƯỚI 2×2 GỌN, ĐỦ TÍNH NĂNG) */}
          {/* ==================================================== */}
          <div className="pt-3 border-t border-white/[0.07]">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-xs font-bold tracking-[-0.01em]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Sắp vào sân
                </span>
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10.5px] font-bold font-mono-tabular"
                  style={{
                    background: 'var(--accent-lime-soft)',
                    color: 'var(--accent-lime)',
                  }}
                >
                  {filledNextCount}/{maxNextCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onToggleNextUpType
                      ? onToggleNextUpType(court.id)
                      : onUpdateCourt(court.id, {
                          forcedType: safeNextUp.type === 'DOUBLES' ? 'SINGLES' : 'DOUBLES',
                        })
                  }
                  title="Bấm để chuyển nhanh khung Next Up giữa Đôi (4 ô) và Đơn (2 ô)"
                  className="vo-btn-subtle px-2 py-0.5 rounded-full text-[10.5px] font-bold"
                >
                  {safeNextUp.type === 'DOUBLES' ? 'Đôi ⇄' : 'Đơn ⇄'}
                </button>
              </div>

              {/* Compact Next Up Toolbar (Đủ Gợi ý, Đảo cặp, Cân kèo, Xóa trắng) */}
              <div className="flex items-center gap-1">
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
                  className="vo-btn-subtle h-7 px-2 rounded-full text-[11px] font-semibold flex items-center gap-1"
                >
                  <RotateCw className="w-3 h-3" style={{ color: 'var(--accent-lime)' }} />
                  <span>{isNextUpEmpty(safeNextUp) ? 'Gợi ý' : 'Gợi ý lại'}</span>
                </button>

                {safeNextUp.type === 'DOUBLES' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onRearrangeNextUp(court.id, 'ROTATE')}
                      disabled={!isNextUpComplete(safeNextUp)}
                      title="Đảo cặp cho 4 người hiện có"
                      aria-label="Đảo cặp lượt kế tiếp"
                      className="vo-btn-subtle w-7 h-7 rounded-full disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center"
                    >
                      <Shuffle className="w-3 h-3" style={{ color: 'var(--accent-lime)' }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRearrangeNextUp(court.id, 'BALANCE')}
                      disabled={!isNextUpComplete(safeNextUp)}
                      title="Cân kèo cho 4 người hiện có"
                      aria-label="Cân kèo lượt kế tiếp"
                      className="vo-btn-subtle w-7 h-7 rounded-full disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center"
                    >
                      <Scale className="w-3 h-3" style={{ color: 'var(--accent-lime)' }} />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => onClearNextUp(court.id)}
                  disabled={isNextUpEmpty(safeNextUp)}
                  title="Xóa trắng toàn bộ các ô lượt sau"
                  aria-label="Xóa trắng lượt kế tiếp"
                  className="vo-btn-subtle w-7 h-7 rounded-full disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center hover:text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Next Up 2×2 Symmetric Grid (Even on Mobile!) */}
            {safeNextUp.type === 'SINGLES' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.06em] pl-0.5 block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Đội 1
                  </span>
                  {renderNextUpSlot(safeNextUp.slots[0], 0)}
                </div>
                <div className="space-y-1.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.06em] pl-0.5 block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Đội 2
                  </span>
                  {renderNextUpSlot(safeNextUp.slots[1], 1)}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {/* Team 1 (Slot 0, 1) */}
                <div className="space-y-1.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.06em] pl-0.5 block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Đội 1
                  </span>
                  {renderNextUpSlot(safeNextUp.slots[0], 0)}
                  {renderNextUpSlot(safeNextUp.slots[1], 1)}
                </div>

                {/* Team 2 (Slot 2, 3) */}
                <div className="space-y-1.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.06em] pl-0.5 block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Đội 2
                  </span>
                  {renderNextUpSlot(safeNextUp.slots[2], 2)}
                  {renderNextUpSlot(safeNextUp.slots[3], 3)}
                </div>
              </div>
            )}

            {/* Evaluation line under Next Up */}
            {isNextUpComplete(safeNextUp) && nextUpEval && (
              <div
                className="mt-2.5 px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-[11px] font-medium flex-wrap"
                style={{
                  background: 'var(--bg-stage)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <div className="flex items-center gap-1.5 font-mono-tabular">
                  <CheckCircle2
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--accent-lime)' }}
                  />
                  <span>Chênh {nextUpEval.skillDiff}đ</span>
                  <span className="opacity-40">•</span>
                  <span>{nextUpEval.genderPattern}</span>
                </div>
                {nextUpEval.warnings.length > 0 && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                    style={{
                      background: 'var(--amber-soft)',
                      color: 'var(--amber)',
                      border: '1px solid var(--amber-border)',
                    }}
                  >
                    {nextUpEval.warnings[0]}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          <Power className="w-7 h-7 mx-auto mb-2 opacity-40" />
          <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Sân đang tắt
          </p>
          <button
            type="button"
            onClick={() => onUpdateCourt(court.id, { isActive: true })}
            className="mt-3 vo-btn-subtle px-3.5 py-1.5 rounded-full text-xs font-semibold"
          >
            Bật lại sân này
          </button>
        </div>
      )}

      {/* Substitution Bottom Sheet Modal */}
      {slotSheetTarget && (
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

  // Helper render 1 slot của Next Up (Ảnh 1 glass tile + 3px gender bar + nút ×)
  function renderNextUpSlot(pid: string | null, idx: number) {
    if (!pid) {
      return (
        <button
          type="button"
          onClick={() =>
            setSlotSheetTarget({
              target: 'NEXT_UP',
              slotIndex: idx,
            })
          }
          className="w-full min-h-[52px] px-2.5 py-2 rounded-[14px] border border-dashed text-xs font-semibold flex items-center justify-center gap-1 transition active:scale-[0.97]"
          style={{
            borderColor: 'var(--border-card)',
            color: 'var(--text-muted)',
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Chọn người</span>
        </button>
      );
    }

    const player = getPlayer(pid);
    const isManual = safeNextUp.slotSource?.[idx] === 'MANUAL';
    const rankMeta = player ? RANK_METADATA[player.rank] : null;
    const playingCourtName = getPlayingCourtName(pid);

    return (
      <div
        onClick={() =>
          setSlotSheetTarget({
            target: 'NEXT_UP',
            slotIndex: idx,
          })
        }
        className={`vo-tile ${
          player?.sex === 'F' ? 'vo-gender-bar-f' : 'vo-gender-bar-m'
        } min-h-[52px] pl-3 pr-1.5 py-1.5 rounded-[14px] cursor-pointer flex items-center justify-between gap-1 active:scale-[0.98]`}
        style={
          playingCourtName
            ? {
                borderColor: 'rgba(251, 113, 133, 0.48)',
                background: 'rgba(251, 113, 133, 0.08)',
              }
            : isManual
            ? {
                borderColor: 'var(--amber-border)',
                background:
                  'linear-gradient(135deg, rgba(251, 191, 36, 0.07) 0%, var(--bg-tile) 100%)',
              }
            : undefined
        }
      >
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <span
            className="font-semibold text-[13.5px] leading-tight tracking-[-0.015em] truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {player?.name || pid}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {rankMeta && (
              <span
                className="text-[10px] font-bold font-mono-tabular px-1.5 py-0.2 rounded"
                style={{
                  background: 'var(--bg-pill-track)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {rankMeta.code}
              </span>
            )}
            {isManual && (
              <span
                className="text-[9.5px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5"
                style={{
                  background: 'var(--amber-soft)',
                  color: 'var(--amber)',
                  border: '1px solid var(--amber-border)',
                }}
              >
                <Lock className="w-2.5 h-2.5" />
                <span>Tay</span>
              </span>
            )}
            {playingCourtName && (
              <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-rose-950/90 text-rose-300 border border-rose-700/60 animate-pulse truncate">
                Ở {playingCourtName}
              </span>
            )}
          </div>
        </div>

        {/* Nút ✕ nhỏ góc phải: xóa đúng slot này */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSetNextUpSlot(court.id, idx, null);
          }}
          aria-label={`Bỏ ${player?.name || 'người'} khỏi lượt kế tiếp`}
          title="Bỏ người khỏi lượt kế tiếp"
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition hover:bg-rose-500/15 hover:text-rose-400 active:scale-90"
          style={{ color: 'var(--text-muted)' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }
};
