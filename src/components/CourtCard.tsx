import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  RotateCw,
  Lock,
  Unlock,
  Shuffle,
  Scale,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Power,
  ChevronRight,
  UserCheck,
  Minus,
  Plus,
} from 'lucide-react';
import type {
  BadmintonRank,
  BadmintonSessionState,
  Court,
  CourtPlanStatus,
  Lineup,
  Player,
} from '../types/badminton';
import { getEffectiveSkill, RANK_METADATA, stepRankDown, stepRankUp } from '../engine/skillConfig';
import { describeLineup, validateLineup } from '../engine/validateLineup';
import { SlotSheet } from './SlotSheet';
import { vibrateSuccess, vibrateWarning } from '../utils/vibrate';

interface CourtCardProps {
  court: Court;
  state: BadmintonSessionState;
  courtPlan?: CourtPlanStatus;
  onStartMatch: (courtId: string, lineup?: Lineup) => void;
  onEndMatch: (courtId: string, expectedMatchId?: string) => void;
  onEndAndStartMatch: (courtId: string, nextLineup?: Lineup, expectedMatchId?: string) => void;
  onCycleNextUp: (courtId: string) => void;
  onSetNextUp: (courtId: string, lineup: Lineup, isLocked: boolean) => void;
  onSwapPlayers: (
    courtId: string,
    target: 'CURRENT' | 'NEXT_UP',
    slot1: { team: 1 | 2; index: number },
    slot2: { team: 1 | 2; index: number } | { playerId: string },
    baseLineup?: Lineup
  ) => void;
  onSetManualSlot: (
    courtId: string,
    target: 'CURRENT' | 'NEXT_UP',
    team: 1 | 2,
    index: number,
    playerId: string,
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
  onTriggerUndoToast: (message: string) => void;
  onShowWarningToast?: (message: string) => void;
}

export const CourtCard: React.FC<CourtCardProps> = ({
  court,
  state,
  courtPlan,
  onStartMatch,
  onEndMatch,
  onEndAndStartMatch,
  onCycleNextUp,
  onSetNextUp,
  onSwapPlayers,
  onSetManualSlot,
  onUpdateCourt,
  onSnoozeAutoSingles,
  onResumePlayer,
  onEditRank,
  onTriggerUndoToast,
  onShowWarningToast,
}) => {
  // Ref chống bấm đúp nút Kết thúc
  const lastEndClickRef = useRef<number>(0);

  // Slot sheet state
  const [slotSheetTarget, setSlotSheetTarget] = useState<{
    target: 'CURRENT' | 'NEXT_UP';
    team: 1 | 2;
    index: number;
    baseLineup: Lineup;
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

  const getPlayer = (id: string): Player | undefined => playerMap.get(id);

  // Kiểm tra tính hợp lệ của đội hình trước khi vào sân (Mục E)
  const checkLineupErrors = (lineup: Lineup): string | null => {
    const allIds = [...lineup.team1, ...lineup.team2];
    for (const pid of allIds) {
      const p = getPlayer(pid);
      if (p && p.status === 'PAUSED') {
        return `Không thể vào sân: Người chơi "${p.name}" đang ở trạng thái Tạm nghỉ.`;
      }
    }
    const issues = validateLineup(lineup, state, court.id, { target: 'NEXT_UP' });
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

    if (courtPlan && courtPlan.status === 'OK' && courtPlan.proposals.length > 0) {
      const nextProposal = courtPlan.proposals[courtPlan.selectedIndex];
      const err = checkLineupErrors(nextProposal.lineup);
      if (err) {
        vibrateWarning();
        onShowWarningToast?.(err);
        // KHÔNG dispatch phần bắt đầu; chỉ kết thúc trận hiện tại nếu có
        if (court.currentMatch) {
          onEndMatch(court.id, court.currentMatch.id);
          onTriggerUndoToast(`Đã kết thúc trận trên ${court.name}`);
        }
        return;
      }

      vibrateSuccess();
      onEndAndStartMatch(court.id, nextProposal.lineup, court.currentMatch?.id);
      onTriggerUndoToast(`Đã kết thúc và đẩy lượt mới cho ${court.name}`);
    } else {
      vibrateSuccess();
      onEndMatch(court.id, court.currentMatch?.id);
      onTriggerUndoToast(`Đã kết thúc trận trên ${court.name}`);
    }
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

    // Xác định thế hiện tại: 0 (A cặp B), 1 (A cặp C), 2 (A cặp D)
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

  // Tự cân cặp cho trận Đôi đang đánh (chọn thế có |diff| nhỏ nhất)
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

    // Điểm chênh lệch cho cả 3 thế
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

  // Nút Vào sân cho Next Up
  const handleStartNextUp = (lineup: Lineup) => {
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

  // Đảo cặp cho Next Up (khi là DOUBLES)
  const handleRotateNextUpPairings = (lineup: Lineup) => {
    const allIds = [...lineup.team1, ...lineup.team2];
    if (new Set(allIds).size !== 4) return;
    const [A, B, C, D] = [...allIds].sort();

    const aInTeam1 = lineup.team1.includes(A);
    const aTeamNum: 1 | 2 = aInTeam1 ? 1 : 2;
    const oppTeamNum: 1 | 2 = aInTeam1 ? 2 : 1;
    const aTeam = aInTeam1 ? lineup.team1 : lineup.team2;
    const oppTeam = aInTeam1 ? lineup.team2 : lineup.team1;
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
        'NEXT_UP',
        { team: aTeamNum, index: partnerIdx },
        { team: oppTeamNum, index: oppPartnerIdx },
        lineup
      );
      onTriggerUndoToast(`Đã đảo cặp lượt sau sang thế ${nextMode + 1}/3`);
    }
  };

  // Cân kèo cho Next Up (khi là DOUBLES)
  const handleAutoBalanceNextUpPairings = (lineup: Lineup) => {
    const allIds = [...lineup.team1, ...lineup.team2];
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

    const aInTeam1 = lineup.team1.includes(A);
    const aTeamNum: 1 | 2 = aInTeam1 ? 1 : 2;
    const oppTeamNum: 1 | 2 = aInTeam1 ? 2 : 1;
    const aTeam = aInTeam1 ? lineup.team1 : lineup.team2;
    const oppTeam = aInTeam1 ? lineup.team2 : lineup.team1;
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
      onTriggerUndoToast('Đội hình lượt sau đã ở trạng thái cân bằng nhất!');
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
        'NEXT_UP',
        { team: aTeamNum, index: partnerIdx },
        { team: oppTeamNum, index: oppPartnerIdx },
        lineup
      );
      onTriggerUndoToast(`Đã cân cặp lượt sau (lệch ${minDiff.toFixed(1)}đ)`);
    }
  };

  // Render thẻ người chơi (Mobile-First chuẩn điện thoại)
  const renderPlayerBadge = (
    playerId: string,
    source?: 'AUTO' | 'MANUAL',
    onClick?: () => void
  ) => {
    const player = getPlayer(playerId);
    if (!player) {
      return (
        <button
          onClick={onClick}
          className="flex items-center justify-between p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-dashed border-slate-600 text-slate-400 text-xs w-full transition text-left min-h-[40px]"
        >
          <span>Trống (Bấm để chọn)</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      );
    }

    const rankMeta = RANK_METADATA[player.rank];
    const isMale = player.sex === 'M';
    const genderTheme = isMale
      ? 'bg-sky-950/75 border-sky-500/40 text-sky-50 hover:border-sky-400/60'
      : 'bg-pink-950/75 border-pink-500/40 text-pink-50 hover:border-pink-400/60';

    return (
      <div
        onClick={onClick}
        className={`flex items-center justify-between gap-1.5 p-1.5 sm:p-2 rounded-xl border text-left transition w-full group min-h-[40px] cursor-pointer ${genderTheme}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          <span className="font-bold text-xs sm:text-sm leading-tight truncate">
            {player.name}
          </span>
          {source === 'MANUAL' && (
            <span
              title="Xếp tay cố định"
              className="flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.2 rounded bg-blue-900/80 text-blue-200 border border-blue-600/60 shrink-0"
            >
              <Lock className="w-2.5 h-2.5" />
              <span>Tay</span>
            </span>
          )}
        </div>

        {/* Cụm Stepper Rank [-] [Badge] [+] (Mobile-friendly, stopPropagation) */}
        <div
          className="flex items-center gap-0.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {onEditRank && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                vibrateSuccess();
                onEditRank(player.id, stepRankDown(player.rank));
              }}
              title="Hạ 1 bậc trình độ"
              className="w-5 h-6 rounded flex items-center justify-center bg-black/30 hover:bg-black/50 text-slate-300 hover:text-white transition active:scale-95 text-xs"
            >
              <Minus className="w-3 h-3" />
            </button>
          )}

          <span
            className={`text-[11px] font-black px-1.5 py-0.5 rounded tracking-wide select-none ${rankMeta.badgeBg} ${rankMeta.badgeText}`}
          >
            {rankMeta.code}
          </span>

          {onEditRank && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                vibrateSuccess();
                onEditRank(player.id, stepRankUp(player.rank));
              }}
              title="Tăng 1 bậc trình độ"
              className="w-5 h-6 rounded flex items-center justify-center bg-black/30 hover:bg-black/50 text-slate-300 hover:text-white transition active:scale-95 text-xs"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`rounded-3xl border transition-all duration-200 overflow-hidden shadow-xl ${
        court.isActive
          ? 'bg-slate-900/90 border-slate-800'
          : 'bg-slate-950/60 border-slate-900 opacity-60'
      }`}
    >
      {/* 1. COURT CARD HEADER */}
      <div className="px-4 py-3 bg-slate-850/80 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <h2 className="font-black text-base text-slate-100 tracking-tight">{court.name}</h2>
          {court.forcedType && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Ép {court.forcedType === 'DOUBLES' ? 'Đôi' : 'Đơn'}
            </span>
          )}
        </div>

        {/* Quick Type Switch & Active Toggle */}
        <div className="flex items-center gap-1.5">
          {/* Forced Type Quick Toggle */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[11px] font-semibold">
            <button
              onClick={() => onUpdateCourt(court.id, { forcedType: null })}
              title="Loại trận: Tự động theo thuật toán"
              className={`px-2 py-1 rounded transition ${
                court.forcedType === null
                  ? 'bg-slate-800 text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => onUpdateCourt(court.id, { forcedType: 'DOUBLES' })}
              title="Ép đánh ĐÔI"
              className={`px-2 py-1 rounded transition ${
                court.forcedType === 'DOUBLES'
                  ? 'bg-slate-800 text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Đôi
            </button>
            <button
              onClick={() => onUpdateCourt(court.id, { forcedType: 'SINGLES' })}
              title="Ép đánh ĐƠN"
              className={`px-2 py-1 rounded transition ${
                court.forcedType === 'SINGLES'
                  ? 'bg-slate-800 text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Đơn
            </button>
          </div>

          {/* Toggle Court On/Off */}
          <button
            onClick={() => {
              if (court.currentMatch !== null) {
                vibrateWarning();
                return;
              }
              onUpdateCourt(court.id, { isActive: !court.isActive });
            }}
            disabled={court.currentMatch !== null}
            title={
              court.currentMatch !== null
                ? 'Hãy kết thúc trận trước khi tắt sân'
                : court.isActive
                ? 'Tắt sân này'
                : 'Bật sân này'
            }
            className={`p-1.5 rounded-lg border transition ${
              court.currentMatch !== null
                ? 'opacity-40 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-500'
                : court.isActive
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/40'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      </div>

      {court.isActive ? (
        <div className="p-3.5 space-y-4">
          {/* ==================================================== */}
          {/* 2. ĐANG ĐÁNH (CURRENT MATCH) */}
          {/* ==================================================== */}
          <div className="rounded-2xl bg-slate-950/70 border border-slate-800/80 p-3.5 relative overflow-hidden">
            {court.currentMatch ? (
              <>
                {/* Header Section: Badge & Timer */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      Đang đánh • {court.currentMatch.type === 'DOUBLES' ? 'Trận Đôi' : 'Trận Đơn'}
                    </span>
                  </div>

                  {/* Timer */}
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
                      isOvertime
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                        : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{matchDurationMinutes} phút</span>
                  </div>
                </div>

                {/* Overtime warning banner */}
                {isOvertime && (
                  <div className="mb-2.5 px-2.5 py-1.5 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-center gap-2 text-rose-300 text-xs font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>Trận đấu đã kéo dài hơn 20 phút!</span>
                  </div>
                )}

                {/* Match Teams Grid */}
                <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 mb-3">
                  {/* Team 1 */}
                  <div className="space-y-1.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">
                      ĐỘI 1
                    </span>
                    {court.currentMatch.team1.map((pid, idx) => (
                      <div key={pid}>
                        {renderPlayerBadge(pid, undefined, () =>
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

                  {/* VS Divider on Mobile */}
                  <div className="sm:hidden flex items-center justify-center my-0.5">
                    <div className="h-px bg-slate-800 flex-1" />
                    <span className="px-3 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-black text-amber-400 tracking-wider">
                      VS
                    </span>
                    <div className="h-px bg-slate-800 flex-1" />
                  </div>

                  {/* Team 2 */}
                  <div className="space-y-1.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">
                      ĐỘI 2
                    </span>
                    {court.currentMatch.team2.map((pid, idx) => (
                      <div key={pid}>
                        {renderPlayerBadge(pid, undefined, () =>
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

                {/* Skill diff description */}
                {(() => {
                  const desc = describeLineup(court.currentMatch, state);
                  const colorClass =
                    desc.label === 'Cân kèo'
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
                      : desc.label === 'Lệch nhẹ'
                      ? 'bg-amber-950/40 text-amber-300 border-amber-800/50'
                      : 'bg-rose-950/40 text-rose-300 border-rose-800/50';

                  return (
                    <div
                      className={`mb-3 px-2.5 py-1.5 rounded-xl border flex items-center justify-between text-xs font-medium ${colorClass}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="font-bold">{desc.label}</span>
                      </div>
                      <span className="text-[11px] opacity-80">
                        Chênh: {desc.diff}đ ({desc.team1Skill} vs {desc.team2Skill})
                      </span>
                    </div>
                  );
                })()}

                {/* Match Action Buttons */}
                <div className="flex items-center gap-2">
                  {/* Đảo cặp & Cân kèo buttons for doubles */}
                  {court.currentMatch.type === 'DOUBLES' && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={handleRotatePairings}
                        title="Xoay 3 thế đứng (Đảo cặp)"
                        className="px-2.5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition flex items-center justify-center gap-1 shrink-0"
                      >
                        <Shuffle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Đảo cặp</span>
                      </button>
                      <button
                        onClick={handleAutoBalancePairings}
                        title="Tự động xếp cặp có chênh lệch trình độ nhỏ nhất"
                        className="px-2.5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-800/40 font-semibold text-xs transition flex items-center justify-center gap-1 shrink-0"
                      >
                        <Scale className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Cân kèo</span>
                      </button>
                    </div>
                  )}

                  {/* Big Primary 1-touch button: KẾT THÚC & ĐẨY LƯỢT MỚI */}
                  <button
                    onClick={handleEndMatchClick}
                    className="flex-1 py-3 px-3 sm:px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-950/50 active:scale-[0.98] transition flex items-center justify-center gap-1.5 sm:gap-2 select-none"
                  >
                    <span>
                      {courtPlan && courtPlan.status === 'OK'
                        ? 'KẾT THÚC & VÀO LƯỢT MỚI'
                        : 'KẾT THÚC TRẬN'}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </>
            ) : (
              <div className="py-6 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2 text-xl">
                  🏸
                </div>
                <p className="font-bold text-sm text-slate-300">Sân đang trống</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chọn lineup ở lượt sau để bắt đầu trận
                </p>
              </div>
            )}
          </div>

          {/* ==================================================== */}
          {/* 3. LƯỢT KẾ TIẾP (NEXT UP) */}
          {/* ==================================================== */}
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800/60 p-3">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>Lượt kế tiếp (Next Up)</span>
                {court.nextUp?.isLockedByHost && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Đã khóa
                  </span>
                )}
              </span>

              {/* Proposals actions */}
              {courtPlan && courtPlan.status === 'OK' && (
                <div className="flex items-center gap-1">
                  {/* Lock / Unlock Next Up */}
                  <button
                    onClick={() => {
                      const top = courtPlan.proposals[courtPlan.selectedIndex];
                      const isLocked = Boolean(top.lineup.isLockedByHost);
                      onSetNextUp(court.id, top.lineup, !isLocked);
                    }}
                    title={
                      court.nextUp?.isLockedByHost
                        ? 'Mở khóa lượt xếp này'
                        : 'Khóa cố định lượt xếp này'
                    }
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    {court.nextUp?.isLockedByHost ? (
                      <Unlock className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>

                  {/* Cycle Proposal */}
                  <button
                    onClick={() => onCycleNextUp(court.id)}
                    title="Gợi ý phương án khác"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Gợi ý lại</span>
                  </button>
                </div>
              )}
            </div>

            {/* Render based on courtPlan status */}
            {(() => {
              if (!courtPlan) return null;

              // CASE 1: STATUS === 'OK'
              if (courtPlan.status === 'OK') {
                const proposal = courtPlan.proposals[courtPlan.selectedIndex];
                const lineup = proposal.lineup;

                return (
                  <div>
                    {/* Projected from current match banner */}
                    {proposal.isProjectedFromCurrentMatch && (
                      <div className="mb-2 px-2.5 py-1 rounded-xl bg-purple-950/40 border border-purple-700/50 text-purple-300 text-[11px] font-bold flex items-center justify-between gap-1.5">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                          <span>Dự kiến (Gồm người đang trên sân)</span>
                        </span>
                        <span className="text-[10px] opacity-75 font-normal">Tự đảo cặp sau trận</span>
                      </div>
                    )}

                    {/* Relaxed banner */}
                    {proposal.relaxed && proposal.relaxedReasons.length > 0 && (
                      <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-amber-950/30 border border-amber-700/40 text-amber-300 text-[11px] font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Đã nới lỏng: {proposal.relaxedReasons.join(', ')}</span>
                      </div>
                    )}

                    {/* Next Up Teams Grid */}
                    <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 mb-2">
                      {/* Team 1 */}
                      <div className="space-y-1.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                        <span className="text-[10px] font-bold text-slate-500 block">
                          ĐỘI 1
                        </span>
                        {lineup.team1.map((pid, idx) => (
                          <div key={pid || `slot-t1-${idx}`}>
                            {renderPlayerBadge(
                              pid,
                              lineup.slotSource?.[pid] || 'AUTO',
                              () =>
                                setSlotSheetTarget({
                                   target: 'NEXT_UP',
                                   team: 1,
                                   index: idx,
                                   baseLineup: lineup,
                                 })
                            )}
                          </div>
                        ))}
                      </div>

                      {/* VS Divider on Mobile */}
                      <div className="sm:hidden flex items-center justify-center my-0.5">
                        <div className="h-px bg-slate-800 flex-1" />
                        <span className="px-3 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-black text-amber-400 tracking-wider">
                          VS
                        </span>
                        <div className="h-px bg-slate-800 flex-1" />
                      </div>

                      {/* Team 2 */}
                      <div className="space-y-1.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                        <span className="text-[10px] font-bold text-slate-500 block">
                          ĐỘI 2
                        </span>
                        {lineup.team2.map((pid, idx) => (
                          <div key={pid || `slot-t2-${idx}`}>
                            {renderPlayerBadge(
                              pid,
                              lineup.slotSource?.[pid] || 'AUTO',
                              () =>
                                setSlotSheetTarget({
                                   target: 'NEXT_UP',
                                   team: 2,
                                   index: idx,
                                   baseLineup: lineup,
                                 })
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Skill diff description cho Next Up */}
                    {(() => {
                      const desc = describeLineup(lineup, state);
                      const colorClass =
                        desc.label === 'Cân kèo'
                          ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
                          : desc.label === 'Lệch nhẹ'
                          ? 'bg-amber-950/40 text-amber-300 border-amber-800/50'
                          : 'bg-rose-950/40 text-rose-300 border-rose-800/50';

                      return (
                        <div
                          className={`mb-2 px-2.5 py-1 rounded-xl border flex items-center justify-between text-[11px] font-medium ${colorClass}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="font-bold">{desc.label}</span>
                          </div>
                          <span className="text-[10px] opacity-80">
                            Chênh: {desc.diff}đ ({desc.team1Skill} vs {desc.team2Skill})
                          </span>
                        </div>
                      );
                    })()}

                    {/* Nút Đảo cặp & Cân kèo cho Next Up nếu là trận Đôi */}
                    {lineup.type === 'DOUBLES' && lineup.team1.length === 2 && lineup.team2.length === 2 && (
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <button
                          type="button"
                          onClick={() => handleRotateNextUpPairings(lineup)}
                          title="Đảo cặp cho lượt sau"
                          className="flex-1 py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition flex items-center justify-center gap-1"
                        >
                          <Shuffle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Đảo cặp</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAutoBalanceNextUpPairings(lineup)}
                          title="Tự động xếp cặp cân nhất cho lượt sau"
                          className="flex-1 py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-800/40 font-semibold text-xs transition flex items-center justify-center gap-1"
                        >
                          <Scale className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Cân kèo</span>
                        </button>
                      </div>
                    )}

                    {/* Vào sân button hoặc Hướng dẫn nếu sân đang bận */}
                    {court.currentMatch ? (
                      <div className="py-2.5 px-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center text-xs text-slate-400 italic">
                        Bấm &quot;KẾT THÚC &amp; VÀO LƯỢT MỚI&quot; ở trên để đẩy {lineup.type === 'SINGLES' ? '2' : '4'} người này vào sân
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStartNextUp(lineup)}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-950/50 active:scale-[0.98] transition flex items-center justify-center gap-2"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>BẮT ĐẦU TRẬN NÀY</span>
                      </button>
                    )}
                  </div>
                );
              }

              // CASE 2: STATUS === 'NEEDS_CONFIRM'
              if (courtPlan.status === 'NEEDS_CONFIRM') {
                const proposal = courtPlan.proposal;
                return (
                  <div className="bg-amber-950/30 border border-amber-600/40 rounded-xl p-3 text-center">
                    <p className="font-bold text-xs text-amber-200 mb-2.5">
                      {courtPlan.reason}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          handleStartNextUp(proposal.lineup);
                        }}
                        className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow"
                      >
                        Đồng ý đánh đơn
                      </button>
                      <button
                        onClick={() => {
                          const avail = state.players.filter((p) => p.status === 'ACTIVE').length;
                          onSnoozeAutoSingles(court.id, avail);
                        }}
                        className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                      >
                        Chờ thêm người
                      </button>
                    </div>
                  </div>
                );
              }

              // CASE 3: STATUS === 'WAIT'
              return (
                <div className="py-3 px-2 text-center text-xs text-slate-400">
                  <p className="mb-2 text-slate-400">{courtPlan.reason}</p>
                  <button
                    onClick={() => {
                      const emptyLineup: Lineup = {
                        type: court.forcedType || 'DOUBLES',
                        team1: [],
                        team2: [],
                        slotSource: {},
                      };
                      setSlotSheetTarget({
                        target: 'NEXT_UP',
                        team: 1,
                        index: 0,
                        baseLineup: emptyLineup,
                      });
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tự xếp tay</span>
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-xs text-slate-500">
          <Power className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="font-semibold text-slate-400">Sân đang tắt</p>
          <p className="mt-0.5">Bật công tắc phía trên để đưa sân vào lượt xoay</p>
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
          team={slotSheetTarget.team}
          index={slotSheetTarget.index}
          currentLineup={slotSheetTarget.baseLineup}
          state={state}
          onSelectPlayer={(playerId) => {
            onSetManualSlot(
              court.id,
              slotSheetTarget.target,
              slotSheetTarget.team,
              slotSheetTarget.index,
              playerId,
              slotSheetTarget.baseLineup
            );
          }}
          onResumePlayer={onResumePlayer}
        />
      )}
    </div>
  );
};
