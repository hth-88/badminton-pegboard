import React, { useMemo, useState } from 'react';
import {
  X,
  AlertTriangle,
  AlertOctagon,
  Check,
  UserCheck,
  UserX,
  Search,
} from 'lucide-react';
import type {
  BadmintonSessionState,
  Lineup,
  Player,
} from '../types/badminton';
import { RANK_METADATA } from '../engine/skillConfig';
import { sortPlayersByWaitPriority } from '../engine/matchmaker';
import { validateLineup } from '../engine/validateLineup';

interface SlotSheetProps {
  isOpen: boolean;
  onClose: () => void;
  courtName: string;
  target: 'CURRENT' | 'NEXT_UP';
  team: 1 | 2;
  index: number;
  courtId: string;
  currentLineup: Lineup;
  state: BadmintonSessionState;
  onSelectPlayer: (playerId: string) => void;
  onResumePlayer: (playerId: string) => void;
}

export const SlotSheet: React.FC<SlotSheetProps> = ({
  isOpen,
  onClose,
  courtName,
  target,
  team,
  index,
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

  // Sắp xếp người chơi: ACTIVE rảnh ưu tiên trước, PAUSED phía sau
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

  // Tính toán thử nghiệm khi thay người vào slot này
  const previewIssuesFor = (candidateId: string) => {
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

    return validateLineup(testLineup, state, courtId, { target });
  };

  const handleChoose = (player: Player) => {
    const issues = previewIssuesFor(player.id);
    const blockIssue = issues.find((i) => i.severity === 'BLOCK');
    if (blockIssue) {
      return; // Không cho phép chọn nếu bị BLOCK
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end">
      <div className="bg-slate-900 border-t border-slate-700 rounded-t-3xl max-h-[85vh] flex flex-col w-full max-w-lg mx-auto overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Header Sheet */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-100">
              Chọn người thay vào {courtName}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Đội {team} • Vị trí {index + 1} ({target === 'CURRENT' ? 'Đang đánh' : 'Lượt sau'})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-800/80 bg-slate-950/40">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên hoặc trình độ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 text-slate-100 pl-9 pr-3 py-2 rounded-xl text-xs placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Candidate List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredCandidates.map((player) => {
            const rankMeta = RANK_METADATA[player.rank];
            const issues = previewIssuesFor(player.id);
            const blockIssue = issues.find((i) => i.severity === 'BLOCK');
            const warnIssue = issues.find((i) => i.severity === 'WARN');
            const isPaused = player.status === 'PAUSED';

            return (
              <div
                key={player.id}
                className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                  blockIssue
                    ? 'bg-rose-950/20 border-rose-900/40 opacity-60'
                    : warnIssue || isPaused
                    ? 'bg-amber-950/20 border-amber-800/40'
                    : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60'
                }`}
              >
                {/* Player info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm text-slate-100 truncate">
                      {player.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        player.sex === 'M' ? 'bg-sky-950 text-sky-300' : 'bg-pink-950 text-pink-300'
                      }`}
                    >
                      {player.sex === 'M' ? 'Nam' : 'Nữ'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rankMeta.badgeBg} ${rankMeta.badgeText}`}
                    >
                      {rankMeta.code}
                    </span>
                    {isPaused && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-amber-600/40 flex items-center gap-1">
                        <UserX className="w-3 h-3" /> Tạm nghỉ
                      </span>
                    )}
                  </div>

                  {/* Priority stats */}
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                    <span>Trận: {player.gamesPlayed} (+{player.virtualGamesOffset})</span>
                    <span>•</span>
                    <span className={player.waitStreak > 1 ? 'text-emerald-400 font-semibold' : ''}>
                      Chờ: {player.waitStreak} lượt
                    </span>
                  </div>

                  {/* Issue Warning Chips */}
                  {blockIssue && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-300 font-medium">
                      <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>{blockIssue.message}</span>
                    </div>
                  )}

                  {!blockIssue && warnIssue && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-300 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{warnIssue.message}</span>
                    </div>
                  )}
                </div>

                {/* Choose button */}
                <div className="shrink-0">
                  {blockIssue ? (
                    <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-500 cursor-not-allowed">
                      Bận
                    </span>
                  ) : warnIssue || isPaused ? (
                    <button
                      onClick={() => handleChoose(player)}
                      className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 transition shadow"
                    >
                      {isPaused ? 'Kích hoạt' : 'Vẫn chọn'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleChoose(player)}
                      className="text-xs font-bold px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Chọn</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Confirmation Dialog Overlay */}
        {confirmingPlayer && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm p-5 flex flex-col justify-center items-center text-center z-20 animate-in fade-in">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-base text-slate-100 mb-2">Xác nhận đưa vào sân</h4>
            <p className="text-xs text-slate-300 max-w-xs mb-5 leading-relaxed">
              {confirmingPlayer.message}
            </p>
            <div className="flex gap-2 w-full max-w-xs">
              <button
                onClick={() => setConfirmingPlayer(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center justify-center gap-1"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Đồng ý</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

