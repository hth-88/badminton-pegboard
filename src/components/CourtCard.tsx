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
} from 'lucide-react';
import type {
  BadmintonRank,
  BadmintonSessionState,
  Court,
  Lineup,
  Player,
} from '../types/badminton';
import {
  canSuggestNextUp,
  isNextUpComplete,
  isNextUpEmpty,
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
  onRearrangeNextUp,
  onSwapPlayers,
  onUpdateCourt,
  onSnoozeAutoSingles: _onSnoozeAutoSingles,
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

  const getPlayer = (id: string): Player | undefined => playerMap.get(id);

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

    if (isNextUpComplete(court.nextUp)) {
      const nextLineup = slotsToLineup(court.nextUp);
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
    if (!isNextUpComplete(court.nextUp)) {
      onShowWarningToast?.('Chưa đủ 4 người để vào sân');
      return;
    }
    const lineup = slotsToLineup(court.nextUp);
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

  // Render thẻ người chơi cho trận đang đánh (CURRENT match)
  const renderCurrentPlayerBadge = (
    playerId: string,
    onClick?: () => void
  ) => {
    const player = getPlayer(playerId);
    if (!player) {
      return (
        <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-500">
          Chưa rõ
        </div>
      );
    }

    const rankMeta = RANK_METADATA[player.rank];

    return (
      <div
        onClick={onClick}
        className="p-2 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-slate-600 transition cursor-pointer flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="font-semibold text-xs text-slate-100 truncate">
            {player.name}
          </span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
              player.sex === 'M' ? 'bg-sky-950 text-sky-300' : 'bg-pink-950 text-pink-300'
            }`}
          >
            {player.sex === 'M' ? 'Nam' : 'Nữ'}
          </span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${rankMeta.badgeBg} ${rankMeta.badgeText}`}
          >
            {rankMeta.code}
          </span>
        </div>

        {onEditRank && (
          <div
            className="flex items-center gap-0.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onEditRank(player.id, stepRankDown(player.rank))}
              title="Hạ 1 bậc trình"
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition flex items-center justify-center text-[10px]"
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <button
              type="button"
              onClick={() => onEditRank(player.id, stepRankUp(player.rank))}
              title="Tăng 1 bậc trình"
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition flex items-center justify-center text-[10px]"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`rounded-3xl border transition duration-200 overflow-hidden shadow-xl ${
        court.isActive
          ? 'bg-slate-950/80 border-slate-800/80'
          : 'bg-slate-950/40 border-slate-900 opacity-60'
      }`}
    >
      {/* ==================================================== */}
      {/* 1. HEADER SÂN */}
      {/* ==================================================== */}
      <div className="p-3.5 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              court.isActive
                ? court.currentMatch
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400'
                : 'bg-slate-600'
            }`}
          />
          <h2 className="font-extrabold text-base text-slate-100 truncate tracking-wide">
            {court.name}
          </h2>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            {court.policy === 'MIX'
              ? 'Đôi/Đơn'
              : court.policy === 'DOUBLES_ONLY'
              ? 'Chỉ đôi'
              : 'Chỉ đơn'}
          </span>
        </div>

        {/* Nút bật/tắt sân */}
        <button
          type="button"
          onClick={() => onUpdateCourt(court.id, { isActive: !court.isActive })}
          title={court.isActive ? 'Tắt sân này' : 'Bật sân này'}
          className={`p-2 rounded-xl transition ${
            court.isActive
              ? 'bg-emerald-950/50 text-emerald-400 hover:bg-emerald-900/50 border border-emerald-800/50'
              : 'bg-slate-800 text-slate-500 hover:bg-slate-700 border border-slate-700'
          }`}
        >
          <Power className="w-4 h-4" />
        </button>
      </div>

      {court.isActive ? (
        <div className="p-3.5 space-y-3.5">
          {/* ==================================================== */}
          {/* 2. KHUNG TRẬN ĐANG ĐÁNH (CURRENT MATCH) */}
          {/* ==================================================== */}
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800/60 p-3">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>Đang đánh</span>
                {court.currentMatch && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {court.currentMatch.type === 'DOUBLES' ? 'Trận Đôi' : 'Trận Đơn'}
                  </span>
                )}
              </span>

              {/* Timer badge */}
              {court.currentMatch && (
                <div
                  className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border transition ${
                    isOvertime
                      ? 'bg-rose-950/80 text-rose-300 border-rose-700/80 animate-pulse'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{matchDurationMinutes} phút</span>
                </div>
              )}
            </div>

            {court.currentMatch ? (
              <>
                {/* Match Teams Grid */}
                <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 mb-3">
                  {/* Team 1 */}
                  <div className="space-y-1.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">
                      ĐỘI 1
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
                <div className="space-y-2">
                  {/* Hàng phụ: Đảo cặp, Cân kèo (nếu Đôi) và Nút "⏹ Chỉ kết thúc" */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {court.currentMatch.type === 'DOUBLES' && (
                      <>
                        <button
                          type="button"
                          onClick={handleRotatePairings}
                          title="Xoay 3 thế đứng (Đảo cặp)"
                          className="flex-1 min-w-[70px] py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition flex items-center justify-center gap-1"
                        >
                          <Shuffle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Đảo cặp</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleAutoBalancePairings}
                          title="Tự động xếp cặp có chênh lệch trình độ nhỏ nhất"
                          className="flex-1 min-w-[70px] py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-800/40 font-semibold text-xs transition flex items-center justify-center gap-1"
                        >
                          <Scale className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Cân kèo</span>
                        </button>
                      </>
                    )}

                    {/* Nút "⏹ Chỉ kết thúc" */}
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
                      className="flex-1 min-w-[105px] py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-amber-300 border border-amber-500/40 font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Square className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>Chỉ kết thúc</span>
                    </button>
                  </div>

                  {/* Nút chính lớn: KẾT THÚC & VÀO LƯỢT MỚI */}
                  <button
                    type="button"
                    onClick={handleEndMatchClick}
                    className="w-full py-3 px-3 sm:px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-950/50 active:scale-[0.98] transition flex items-center justify-center gap-1.5 sm:gap-2 select-none"
                  >
                    <span>
                      {isNextUpComplete(court.nextUp)
                        ? 'KẾT THÚC & VÀO LƯỢT MỚI >'
                        : 'KẾT THÚC TRẬN'}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </>
            ) : (
              <div className="py-5 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2 text-xl">
                  🏸
                </div>
                <p className="font-bold text-sm text-slate-300">Sân đang trống</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">
                  {isNextUpComplete(court.nextUp)
                    ? 'Đội hình lượt sau đã sẵn sàng'
                    : 'Điền đủ người ở lượt kế tiếp để bắt đầu trận'}
                </p>

                <button
                  type="button"
                  disabled={!isNextUpComplete(court.nextUp)}
                  onClick={handleStartNextUpClick}
                  title={!isNextUpComplete(court.nextUp) ? 'Chưa đủ 4 người' : 'Bắt đầu trận này'}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>BẮT ĐẦU TRẬN LƯỢT NÀY &gt;</span>
                </button>
              </div>
            )}
          </div>

          {/* ==================================================== */}
          {/* 3. LƯỢT KẾ TIẾP (NEXT UP) - LƯU TRỰC TIẾP TRONG STATE */}
          {/* ==================================================== */}
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800/60 p-3">
            <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>Lượt kế tiếp (Next Up)</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {court.nextUp.type === 'DOUBLES' ? 'Đôi' : 'Đơn'}
                </span>
              </span>

              {/* Toolbar Next Up */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    if (!canSuggestNextUp(state, court.id)) {
                      onShowWarningToast?.('Không đủ 4 người rảnh để gợi ý');
                      return;
                    }
                    onSuggestNextUp(court.id);
                  }}
                  title="Gợi ý đội hình cho lượt kế tiếp"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
                >
                  <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isNextUpEmpty(court.nextUp) ? 'Gợi ý kèo' : 'Gợi ý lại'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onClearNextUp(court.id)}
                  disabled={isNextUpEmpty(court.nextUp)}
                  title="Xóa trắng toàn bộ các ô lượt sau"
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-300 border border-slate-700 transition"
                >
                  <span>🗑️ Xóa trắng</span>
                </button>

                {court.nextUp.type === 'DOUBLES' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onRearrangeNextUp(court.id, 'ROTATE')}
                      disabled={!isNextUpComplete(court.nextUp)}
                      title="Đảo cặp cho 4 người hiện có"
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-300 border border-slate-700 transition flex items-center gap-1"
                    >
                      <Shuffle className="w-3 h-3 text-emerald-400" />
                      <span>Đảo cặp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onRearrangeNextUp(court.id, 'BALANCE')}
                      disabled={!isNextUpComplete(court.nextUp)}
                      title="Cân kèo cho 4 người hiện có"
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-emerald-300 border border-slate-700 transition flex items-center gap-1"
                    >
                      <Scale className="w-3 h-3 text-emerald-400" />
                      <span>Cân kèo</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Next Up Slots Grid */}
            {court.nextUp.type === 'SINGLES' ? (
              <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 mb-2">
                {/* Team 1 */}
                <div className="space-y-1.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] font-bold text-slate-500 block">ĐỘI 1</span>
                  {renderNextUpSlot(court.nextUp.slots[0], 0)}
                </div>

                {/* Team 2 */}
                <div className="space-y-1.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] font-bold text-slate-500 block">ĐỘI 2</span>
                  {renderNextUpSlot(court.nextUp.slots[1], 1)}
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 mb-2">
                {/* Team 1 (Slot 0, 1) */}
                <div className="space-y-1.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] font-bold text-slate-500 block">ĐỘI 1</span>
                  {renderNextUpSlot(court.nextUp.slots[0], 0)}
                  {renderNextUpSlot(court.nextUp.slots[1], 1)}
                </div>

                {/* VS Divider on Mobile */}
                <div className="sm:hidden flex items-center justify-center my-0.5">
                  <div className="h-px bg-slate-800 flex-1" />
                  <span className="px-3 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-black text-amber-400 tracking-wider">
                    VS
                  </span>
                  <div className="h-px bg-slate-800 flex-1" />
                </div>

                {/* Team 2 (Slot 2, 3) */}
                <div className="space-y-1.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] font-bold text-slate-500 block">ĐỘI 2</span>
                  {renderNextUpSlot(court.nextUp.slots[2], 2)}
                  {renderNextUpSlot(court.nextUp.slots[3], 3)}
                </div>
              </div>
            )}

            {/* Evaluation line under Next Up (Chênh X điểm • 3 Nam – 1 Nữ) */}
            {isNextUpComplete(court.nextUp) && nextUpEval && (
              <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs font-medium text-slate-300">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Chênh {nextUpEval.skillDiff}đ</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-400">{nextUpEval.genderPattern}</span>
                </div>
                {nextUpEval.warnings.length > 0 && (
                  <span className="text-[10px] text-amber-300 font-semibold bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                    {nextUpEval.warnings[0]}
                  </span>
                )}
              </div>
            )}
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
    </div>
  );

  // Helper render 1 slot của Next Up
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
          className="w-full py-2 px-3 rounded-xl border border-dashed border-slate-700 hover:border-emerald-500/60 bg-slate-950/40 hover:bg-emerald-950/20 text-slate-400 hover:text-emerald-300 transition text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <span>➕ Chọn người</span>
        </button>
      );
    }

    const player = getPlayer(pid);
    const isManual = court.nextUp.slotSource[idx] === 'MANUAL';
    const rankMeta = player ? RANK_METADATA[player.rank] : null;

    return (
      <div
        onClick={() =>
          setSlotSheetTarget({
            target: 'NEXT_UP',
            slotIndex: idx,
          })
        }
        className="relative p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition cursor-pointer flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
          <span className="font-semibold text-xs text-slate-100 truncate">
            {player?.name || pid}
          </span>
          {player && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                player.sex === 'M' ? 'bg-sky-950 text-sky-300' : 'bg-pink-950 text-pink-300'
              }`}
            >
              {player.sex === 'M' ? 'Nam' : 'Nữ'}
            </span>
          )}
          {rankMeta && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${rankMeta.badgeBg} ${rankMeta.badgeText}`}
            >
              {rankMeta.code}
            </span>
          )}
          {isManual && (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
              <Lock className="w-2.5 h-2.5" /> Tay
            </span>
          )}
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
          className="w-8 h-8 -mr-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition flex items-center justify-center shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
};
