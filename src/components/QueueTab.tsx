import React, { useMemo, useState } from 'react';
import {
  UserPlus,
  PlayCircle,
  Trash2,
  Sparkles,
  ClipboardPaste,
  AlertCircle,
  X,
  Minus,
  Plus,
  Star,
  Coffee,
  UserMinus,
  Users,
} from 'lucide-react';
import type { BadmintonRank, Court, Player, Sex } from '../types/badminton';
import { getEffectiveSkill, ORDERED_RANKS, RANK_METADATA, stepRankDown, stepRankUp } from '../engine/skillConfig';
import { sortPlayersByWaitPriority } from '../engine/matchmaker';
import { SAMPLE_16_PLAYERS } from '../data/samplePlayers';
import { vibrateSuccess, vibrateWarning } from '../utils/vibrate';
import { parsePasteLines } from '../utils/parsePasteLines';
import {
  type ClubMember,
  getClubRoster,
  upsertClubMember,
  deleteClubMember,
  isClubMember,
  syncClubMemberRank,
} from '../engine/clubRosterStorage';

interface QueueTabProps {
  players: Player[];
  courts: Court[];
  maleBonus?: number;
  onAddPlayer: (
    playerData: Omit<
      Player,
      'gamesPlayed' | 'virtualGamesOffset' | 'waitStreak' | 'lastPlayedAt' | 'singlesCount'
    >
  ) => void;
  onAddPlayers: (
    playersData: Array<
      Omit<
        Player,
        'gamesPlayed' | 'virtualGamesOffset' | 'waitStreak' | 'lastPlayedAt' | 'singlesCount'
      >
    >
  ) => void;
  onPausePlayer: (playerId: string) => void;
  onResumePlayer: (playerId: string) => void;
  onEditRank: (playerId: string, rank: BadmintonRank) => void;
  onUpdatePlayer: (player: Partial<Player> & { id: string }) => void;
  onRemovePlayer: (playerId: string) => void;
}

export const QueueTab: React.FC<QueueTabProps> = ({
  players,
  courts,
  maleBonus = 1.5,
  onAddPlayer,
  onAddPlayers,
  onPausePlayer,
  onResumePlayer,
  onEditRank,
  onUpdatePlayer,
  onRemovePlayer,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'ROSTER' | 'SINGLE' | 'PASTE'>('ROSTER');
  const [pickerPlayer, setPickerPlayer] = useState<Player | null>(null);

  // Sổ thành viên CLB & điểm danh
  const [clubRoster, setClubRoster] = useState<ClubMember[]>(() => getClubRoster());
  const [selectedRosterIds, setSelectedRosterIds] = useState<Set<string>>(new Set());
  const [showRosterAddInline, setShowRosterAddInline] = useState(false);
  const [rosterNewName, setRosterNewName] = useState('');
  const [rosterNewSex, setRosterNewSex] = useState<Sex>('M');
  const [rosterNewRank, setRosterNewRank] = useState<BadmintonRank>('tb');

  // Mở modal thêm người kèm chuẩn bị danh sách điểm danh CLB
  const handleOpenAddModal = (mode: 'ROSTER' | 'SINGLE' | 'PASTE' = 'ROSTER') => {
    const currentRoster = getClubRoster();
    setClubRoster(currentRoster);
    const inSessionNames = new Set(players.map((p) => p.name.trim().toLowerCase()));
    const initialSelected = new Set<string>();
    currentRoster.forEach((m) => {
      if (!inSessionNames.has(m.name.trim().toLowerCase())) {
        initialSelected.add(m.id);
      }
    });
    setSelectedRosterIds(initialSelected);
    setAddMode(mode);
    setShowAddModal(true);
  };

  // Toggle hoặc lưu người chơi vào Sổ CLB
  const handleToggleClubMember = (player: Player) => {
    const isMember = isClubMember(player.name, clubRoster);
    if (isMember) {
      if (
        window.confirm(
          `"${player.name}" đang là thành viên trong Sổ CLB.\nBạn có muốn cập nhật trình độ hiện tại (${RANK_METADATA[player.rank].code}) vào Sổ CLB không?`
        )
      ) {
        syncClubMemberRank(player.name, player.rank);
        setClubRoster(getClubRoster());
        vibrateSuccess();
      }
    } else {
      upsertClubMember({
        name: player.name,
        sex: player.sex,
        rank: player.rank,
        noSingles: player.noSingles,
      });
      setClubRoster(getClubRoster());
      vibrateSuccess();
    }
  };

  // Rút người chơi khỏi buổi hôm nay (Vắng mặt)
  const handleWithdrawPlayer = (player: Player) => {
    const isPlaying = playingPlayerIds.has(player.id);
    if (isPlaying) {
      vibrateWarning();
      alert(
        `Không thể rút người chơi "${player.name}" vì đang thi đấu trên sân. Vui lòng kết thúc trận hoặc đổi người ra trước.`
      );
      return;
    }
    const isMember = isClubMember(player.name, clubRoster);
    const confirmMsg =
      player.gamesPlayed > 0
        ? `Xác nhận rút "${player.name}" khỏi buổi hôm nay?\n(Người này đã đánh ${player.gamesPlayed} trận. Khi rút sẽ không còn trong danh sách và bảng tính tiền.${
            isMember
              ? ' Thông tin trong Sổ CLB vẫn được giữ nguyên để điểm danh lần sau.'
              : ''
          })`
        : `Xóa "${player.name}" khỏi danh sách buổi hôm nay?`;
    if (window.confirm(confirmMsg)) {
      vibrateWarning();
      onRemovePlayer(player.id);
    }
  };

  // Đổi trình độ và tự đồng bộ vào Sổ CLB nếu là thành viên
  const handleEditRankAndSync = (playerId: string, rank: BadmintonRank) => {
    onEditRank(playerId, rank);
    const p = players.find((pl) => pl.id === playerId);
    if (p) {
      syncClubMemberRank(p.name, rank);
      setClubRoster(getClubRoster());
    }
  };

  // Thêm thành viên mới vào Sổ CLB
  const handleAddMemberToRoster = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rosterNewName.trim()) return;
    upsertClubMember({
      name: rosterNewName.trim(),
      sex: rosterNewSex,
      rank: rosterNewRank,
      noSingles: false,
    });
    setRosterNewName('');
    const updated = getClubRoster();
    setClubRoster(updated);
    setShowRosterAddInline(false);
    vibrateSuccess();
  };

  // Xóa thành viên khỏi Sổ CLB
  const handleDeleteFromRoster = (id: string, name: string) => {
    if (window.confirm(`Xóa vĩnh viễn "${name}" khỏi Sổ Thành Viên CLB?`)) {
      deleteClubMember(id);
      setClubRoster(getClubRoster());
      setSelectedRosterIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      vibrateWarning();
    }
  };

  // Toggle chọn điểm danh 1 thành viên
  const toggleSelectRosterMember = (id: string) => {
    setSelectedRosterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Danh sách tên đang trong buổi chơi
  const inSessionNames = useMemo(() => {
    return new Set(players.map((p) => p.name.trim().toLowerCase()));
  }, [players]);

  // Chọn tất cả thành viên chưa có mặt
  const handleSelectAllRoster = () => {
    const next = new Set<string>();
    clubRoster.forEach((m) => {
      if (!inSessionNames.has(m.name.trim().toLowerCase())) {
        next.add(m.id);
      }
    });
    setSelectedRosterIds(next);
  };

  const handleDeselectAllRoster = () => {
    setSelectedRosterIds(new Set());
  };

  // Đưa các thành viên đã chọn vào buổi hôm nay
  const handleImportRosterMembers = () => {
    const selectedMembers = clubRoster.filter(
      (m) => selectedRosterIds.has(m.id) && !inSessionNames.has(m.name.trim().toLowerCase())
    );
    if (selectedMembers.length === 0) {
      setShowAddModal(false);
      return;
    }
    vibrateSuccess();
    const now = Date.now();
    const playersToImport: Player[] = selectedMembers.map((m, i) => ({
      id: `p_roster_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      name: m.name,
      sex: m.sex,
      rank: m.rank,
      status: 'ACTIVE',
      assignedPool: 'ALL',
      noSingles: Boolean(m.noSingles),
      gamesPlayed: 0,
      virtualGamesOffset: 0,
      waitStreak: 0,
      lastPlayedAt: 0,
      singlesCount: 0,
      joinedAt: now,
    }));
    onAddPlayers(playersToImport);
    setShowAddModal(false);
  };

  // Single form state
  const [newName, setNewName] = useState('');
  const [newSex, setNewSex] = useState<Sex>('M');
  const [newRank, setNewRank] = useState<BadmintonRank>('tb');
  const [newPool, setNewPool] = useState<string>('ALL');
  const [newNoSingles, setNewNoSingles] = useState(false);

  // Quick paste state
  const [pasteText, setPasteText] = useState('');
  const [allowZaloDefaults, setAllowZaloDefaults] = useState(true);

  // Tách nhóm ACTIVE và PAUSED
  const activePlayers = useMemo(() => {
    return sortPlayersByWaitPriority(players.filter((p) => p.status === 'ACTIVE'));
  }, [players]);

  const pausedPlayers = useMemo(() => {
    return players.filter((p) => p.status === 'PAUSED');
  }, [players]);

  // Người đang đánh trên sân
  const playingPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of courts) {
      if (c.isActive && c.currentMatch) {
        c.currentMatch.team1.forEach((id) => ids.add(id));
        c.currentMatch.team2.forEach((id) => ids.add(id));
      }
    }
    return ids;
  }, [courts]);

  // Thêm 1 người chơi
  const handleAddSinglePlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    vibrateSuccess();

    onAddPlayer({
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newName.trim(),
      sex: newSex,
      rank: newRank,
      status: 'ACTIVE',
      assignedPool: newPool,
      noSingles: newNoSingles,
      joinedAt: Date.now(),
    });

    setNewName('');
    setShowAddModal(false);
  };

  // Parser Quick Paste sử dụng hàm thuần parsePasteLines
  const parsedPasteResults = useMemo(() => {
    return parsePasteLines(pasteText, players, { allowDefaults: allowZaloDefaults });
  }, [pasteText, players, allowZaloDefaults]);

  // Nạp danh sách từ Quick Paste
  const handleImportPaste = () => {
    if (parsedPasteResults.valid.length === 0) return;
    vibrateSuccess();
    const now = Date.now();
    const playersToImport = parsedPasteResults.valid.map((item, i) => ({
      ...item,
      id: `p_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      joinedAt: now,
    }));
    onAddPlayers(playersToImport);
    setPasteText('');
    setShowAddModal(false);
  };

  // Nạp 16 người mẫu
  const handleLoadSample16 = () => {
    vibrateSuccess();
    onAddPlayers(SAMPLE_16_PLAYERS);
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 p-3 md:p-4 space-y-4">
      {/* Top Banner & Action */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>Hàng chờ xoay tua</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {players.length} người
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ưu tiên người đợi lâu nhất và có số trận ít nhất
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Nút Điểm danh thành viên CLB */}
          <button
            onClick={() => handleOpenAddModal('ROSTER')}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>Điểm danh CLB</span>
          </button>

          {/* Nút thêm khách */}
          <button
            onClick={() => handleOpenAddModal('SINGLE')}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm khách</span>
          </button>

          {/* Nút nạp 16 người mẫu */}
          {players.length === 0 && (
            <button
              onClick={handleLoadSample16}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-600/40 rounded-xl text-xs font-semibold transition"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>16 mẫu</span>
            </button>
          )}
        </div>
      </div>

      {/* DANH SÁCH NGƯỜI CHƠI ACTIVE */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-semibold">
          <span>SẴN SÀNG ({activePlayers.length})</span>
          <span>THAO TÁC / TRÌNH ĐỘ</span>
        </div>

        {activePlayers.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/60 border border-slate-800 text-slate-500">
            <UserPlus className="w-10 h-10 mx-auto mb-2 text-slate-600" />
            <p className="font-semibold text-slate-400 text-sm">Chưa có người chơi nào</p>
            <p className="text-xs mt-1 text-slate-500">
              Bấm &quot;Thêm người&quot; hoặc &quot;Nạp 16 người mẫu&quot; để bắt đầu buổi chơi.
            </p>
          </div>
        ) : (
          activePlayers.map((player) => {
            const isPlaying = playingPlayerIds.has(player.id);
            const rankMeta = RANK_METADATA[player.rank];
            const effectiveSkill = getEffectiveSkill(player.rank, player.sex, maleBonus);
            const isMember = isClubMember(player.name, clubRoster);

            return (
              <div
                key={player.id}
                className={`p-3 rounded-2xl border transition space-y-2 ${
                  isPlaying
                    ? 'bg-slate-900/40 border-slate-800/80'
                    : 'bg-slate-900/90 hover:bg-slate-850 border-slate-800 shadow-sm'
                }`}
              >
                {/* HÀNG 1: Tên người chơi & Thống kê số trận/nghỉ */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                    {/* Nút Ngôi sao thành viên CLB */}
                    <button
                      type="button"
                      onClick={() => handleToggleClubMember(player)}
                      title={
                        isMember
                          ? 'Thành viên CLB cố định (Bấm để cập nhật trình độ)'
                          : 'Bấm để lưu người này vào Sổ thành viên CLB cố định'
                      }
                      className="p-1 rounded text-slate-400 hover:text-amber-400 transition shrink-0"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          isMember
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-600 hover:text-amber-400'
                        }`}
                      />
                    </button>

                    <span className="font-bold text-sm sm:text-base text-slate-100 truncate">
                      {player.name}
                    </span>
                    {isPlaying && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50 flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Đang đánh
                      </span>
                    )}
                  </div>

                  {/* Priority stats */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0 font-medium">
                    <span>{player.gamesPlayed} trận</span>
                    <span>•</span>
                    <span className={player.waitStreak > 1 ? 'text-emerald-400 font-semibold' : ''}>
                      Nghỉ {player.waitStreak}
                    </span>
                    {player.virtualGamesOffset > 0 && (
                      <span className="text-amber-400 text-[10px]">(+{player.virtualGamesOffset})</span>
                    )}
                  </div>
                </div>

                {/* HÀNG 2: Cụm nút bấm thao tác nhanh gọn cho Mobile */}
                <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-800/50 flex-wrap">
                  {/* Stepper trình độ [-] [Badge (XX.Xđ)] [+] */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        vibrateSuccess();
                        handleEditRankAndSync(player.id, stepRankDown(player.rank));
                      }}
                      title="Hạ 1 bậc trình độ"
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 transition text-xs border border-slate-700/60"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setPickerPlayer(player)}
                      title="Bấm để chọn nhanh 1 trong 12 trình độ"
                      className={`px-2 py-1 rounded-lg text-xs font-black tracking-wide flex items-center gap-1 border border-transparent shadow-sm ${rankMeta.badgeBg} ${rankMeta.badgeText}`}
                    >
                      <span>{rankMeta.code}</span>
                      <span className="text-[10px] opacity-80 font-normal">
                        ({effectiveSkill.toFixed(1)}đ)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        vibrateSuccess();
                        handleEditRankAndSync(player.id, stepRankUp(player.rank));
                      }}
                      title="Tăng 1 bậc trình độ"
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 transition text-xs border border-slate-700/60"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Cụm Toggle Nam/Nữ, Gán Sân, Tạm Nghỉ, Rút khỏi buổi */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Toggle Nam/Nữ 1 chạm */}
                    <button
                      type="button"
                      onClick={() => {
                        vibrateSuccess();
                        onUpdatePlayer({ id: player.id, sex: player.sex === 'M' ? 'F' : 'M' });
                      }}
                      title={`Bấm để chuyển sang ${player.sex === 'M' ? 'Nữ' : 'Nam'}`}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 border ${
                        player.sex === 'M'
                          ? 'bg-sky-950/80 border-sky-600/40 text-sky-300 hover:bg-sky-900/80'
                          : 'bg-pink-950/80 border-pink-600/40 text-pink-300 hover:bg-pink-900/80'
                      }`}
                    >
                      <span>{player.sex === 'M' ? '♂ Nam' : '♀ Nữ'}</span>
                    </button>

                    {/* Gán sân (Pool) - ẩn trên màn hình quá nhỏ */}
                    <select
                      value={player.assignedPool}
                      onChange={(e) => onUpdatePlayer({ id: player.id, assignedPool: e.target.value })}
                      aria-label={`Gán sân cho ${player.name}`}
                      className="bg-slate-800 text-slate-200 text-xs font-semibold rounded-lg px-1.5 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 hidden md:block"
                    >
                      <option value="ALL">Tất cả sân</option>
                      {courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    {/* Tạm nghỉ (vẫn đi đánh hôm nay nhưng đang giải lao/đến muộn) */}
                    <button
                      onClick={() => onPausePlayer(player.id)}
                      title="Tạm nghỉ giải lao / uống nước (vẫn tham gia buổi hôm nay)"
                      aria-label={`Tạm nghỉ cho ${player.name}`}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition"
                    >
                      <Coffee className="w-4 h-4" />
                    </button>

                    {/* Vắng mặt / Rút khỏi buổi hôm nay (xóa khỏi danh sách & bảng tính tiền) */}
                    <button
                      onClick={() => handleWithdrawPlayer(player)}
                      title="Vắng mặt / Rút khỏi buổi hôm nay (xóa hoàn toàn khỏi danh sách & bảng tính tiền)"
                      aria-label={`Rút ${player.name} khỏi buổi hôm nay`}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-rose-400 transition"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DANH SÁCH NGƯỜI CHƠI TẠM NGHỈ (PAUSED) */}
      {pausedPlayers.length > 0 && (
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-amber-400/80 px-1 font-semibold">
            <span>TẠM NGHỈ ({pausedPlayers.length})</span>
            <span className="text-slate-500 font-normal">Khi vào lại sẽ được tính bù lượt tự động</span>
          </div>

          {pausedPlayers.map((player) => (
            <div
              key={player.id}
              className="p-3 rounded-2xl border border-slate-800/60 bg-slate-950/40 opacity-75 flex items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-300">{player.name}</span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {RANK_METADATA[player.rank].code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Đã đánh {player.gamesPlayed} trận
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onResumePlayer(player.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow"
                >
                  <PlayCircle className="w-4 h-4" />
                  <span>Đánh lại</span>
                </button>
                <button
                  onClick={() => handleWithdrawPlayer(player)}
                  title="Vắng mặt / Rút khỏi buổi hôm nay (xóa hoàn toàn khỏi danh sách & bảng tính tiền)"
                  aria-label={`Rút ${player.name} khỏi buổi hôm nay`}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL THÊM NGƯỜI CHƠI */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-5 text-slate-100 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <span>Thêm người chơi</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-3 gap-1.5 my-3 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setAddMode('ROSTER')}
                className={`py-1.5 px-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                  addMode === 'ROSTER'
                    ? 'bg-slate-800 text-amber-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span className="truncate">Thành viên CLB</span>
              </button>
              <button
                onClick={() => setAddMode('SINGLE')}
                className={`py-1.5 px-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                  addMode === 'SINGLE'
                    ? 'bg-slate-800 text-emerald-400 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="truncate">Khách lẻ</span>
              </button>
              <button
                onClick={() => setAddMode('PASTE')}
                className={`py-1.5 px-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                  addMode === 'PASTE'
                    ? 'bg-slate-800 text-emerald-400 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span className="truncate">Dán Zalo</span>
              </button>
            </div>

            {/* Mode Content */}
            <div className="flex-1 overflow-y-auto space-y-4 py-1">
              {addMode === 'ROSTER' ? (
                <div className="space-y-3">
                  {/* Top Bar inside Roster tab */}
                  <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-800/80">
                    <div className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-amber-400" />
                      <span>Sổ CLB: {clubRoster.length} người</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={handleSelectAllRoster}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-[11px]"
                      >
                        Chọn tất cả
                      </button>
                      <button
                        type="button"
                        onClick={handleDeselectAllRoster}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 transition text-[11px]"
                      >
                        Bỏ chọn
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRosterAddInline(!showRosterAddInline)}
                        className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition text-[11px] font-bold"
                      >
                        {showRosterAddInline ? 'Đóng' : '+ Thêm vào Sổ'}
                      </button>
                    </div>
                  </div>

                  {/* Form thêm nhanh thành viên mới vào Sổ CLB */}
                  {showRosterAddInline && (
                    <form
                      onSubmit={handleAddMemberToRoster}
                      className="p-3 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-2.5 animate-in fade-in"
                    >
                      <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>Thêm thành viên cố định mới vào Sổ CLB</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Tên thành viên..."
                          value={rosterNewName}
                          onChange={(e) => setRosterNewName(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => setRosterNewSex('M')}
                            className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                              rosterNewSex === 'M'
                                ? 'bg-sky-950 border-sky-500 text-sky-300'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            Nam
                          </button>
                          <button
                            type="button"
                            onClick={() => setRosterNewSex('F')}
                            className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                              rosterNewSex === 'F'
                                ? 'bg-pink-950 border-pink-500 text-pink-300'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            Nữ
                          </button>
                        </div>
                        <select
                          value={rosterNewRank}
                          onChange={(e) => setRosterNewRank(e.target.value as BadmintonRank)}
                          className="bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          {ORDERED_RANKS.map((r) => (
                            <option key={r} value={r}>
                              {RANK_METADATA[r].code} ({RANK_METADATA[r].name})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowRosterAddInline(false)}
                          className="px-3 py-1 rounded-lg text-xs text-slate-400 hover:bg-slate-800"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow"
                        >
                          Lưu vào Sổ
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Danh sách thành viên trong Sổ CLB để điểm danh */}
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {clubRoster.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">
                        Sổ thành viên trống. Bấm &quot;+ Thêm vào Sổ&quot; để thêm thành viên CLB.
                      </p>
                    ) : (
                      clubRoster.map((member) => {
                        const inSession = inSessionNames.has(member.name.trim().toLowerCase());
                        const isSelected = selectedRosterIds.has(member.id);
                        const meta = RANK_METADATA[member.rank];

                        return (
                          <div
                            key={member.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                              inSession
                                ? 'bg-slate-950/40 border-slate-800/50 opacity-60'
                                : isSelected
                                ? 'bg-amber-950/20 border-amber-500/40'
                                : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-850'
                            }`}
                          >
                            <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={inSession}
                                checked={inSession ? true : isSelected}
                                onChange={() => !inSession && toggleSelectRosterMember(member.id)}
                                className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0 disabled:opacity-50"
                              />
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm font-semibold text-slate-200 truncate">
                                  {member.name}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.badgeBg} ${meta.badgeText}`}
                                >
                                  {meta.code}
                                </span>
                                <span
                                  className={`text-[10px] px-1 rounded ${
                                    member.sex === 'M'
                                      ? 'bg-sky-950 text-sky-400'
                                      : 'bg-pink-950 text-pink-400'
                                  }`}
                                >
                                  {member.sex === 'M' ? 'Nam' : 'Nữ'}
                                </span>
                              </div>
                            </label>

                            <div className="flex items-center gap-2 shrink-0">
                              {inSession ? (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                                  Đã có mặt
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFromRoster(member.id, member.name)}
                                  title="Xóa khỏi Sổ CLB"
                                  className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-slate-800 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Bottom action button */}
                  <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 text-xs font-semibold"
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      onClick={handleImportRosterMembers}
                      disabled={
                        clubRoster.filter(
                          (m) =>
                            selectedRosterIds.has(m.id) &&
                            !inSessionNames.has(m.name.trim().toLowerCase())
                        ).length === 0
                      }
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center gap-1.5"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>
                        Đưa vào buổi hôm nay (
                        {
                          clubRoster.filter(
                            (m) =>
                              selectedRosterIds.has(m.id) &&
                              !inSessionNames.has(m.name.trim().toLowerCase())
                          ).length
                        }
                        )
                      </span>
                    </button>
                  </div>
                </div>
              ) : addMode === 'SINGLE' ? (
                <form onSubmit={handleAddSinglePlayer} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Tên người chơi *
                    </label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Hoàng Tuấn"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Giới tính
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setNewSex('M')}
                          className={`py-2 rounded-xl text-xs font-bold border transition ${
                            newSex === 'M'
                              ? 'bg-sky-950/80 border-sky-500 text-sky-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          Nam
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewSex('F')}
                          className={`py-2 rounded-xl text-xs font-bold border transition ${
                            newSex === 'F'
                              ? 'bg-pink-950/80 border-pink-500 text-pink-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          Nữ
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Trình độ
                      </label>
                      <select
                        value={newRank}
                        onChange={(e) => setNewRank(e.target.value as BadmintonRank)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {ORDERED_RANKS.map((r) => (
                          <option key={r} value={r}>
                            {RANK_METADATA[r].code} ({RANK_METADATA[r].name})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Gán sân
                      </label>
                      <select
                        value={newPool}
                        onChange={(e) => setNewPool(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="ALL">Tất cả sân (Chung)</option>
                        {courts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={newNoSingles}
                          onChange={(e) => setNewNoSingles(e.target.checked)}
                          className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-0"
                        />
                        <span>Không đánh đơn</span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 text-xs font-semibold"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg transition"
                    >
                      Thêm người
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Dán danh sách (mỗi người 1 dòng)
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Cú pháp: <code className="text-emerald-400">Tên - Nam/Nữ - Trình độ</code> (ví dụ: &quot;Tuấn - Nam - tb&quot;)
                    </p>
                    <textarea
                      rows={6}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={`Tuấn - Nam - tb\nLinh - Nữ - tb-\nHoàng - Nam - y+\nThảo - Nữ - tby`}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex items-center">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={allowZaloDefaults}
                        onChange={(e) => setAllowZaloDefaults(e.target.checked)}
                        className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-0"
                      />
                      <span>Tự điền Nam & TB- nếu thiếu (Chuẩn tin nhắn Zalo)</span>
                    </label>
                  </div>

                  {/* Parse Preview */}
                  {pasteText.trim() && (
                    <div className="rounded-xl border border-slate-800 p-2.5 bg-slate-950/60 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-emerald-400">
                          Hợp lệ: {parsedPasteResults.valid.length} người
                        </span>
                        {parsedPasteResults.errors.length > 0 && (
                          <span className="text-rose-400">
                            Lỗi: {parsedPasteResults.errors.length} dòng
                          </span>
                        )}
                      </div>

                      {parsedPasteResults.warnings.length > 0 && (
                        <div className="space-y-1 max-h-20 overflow-y-auto pt-1">
                          {parsedPasteResults.warnings.map((warn, i) => (
                            <div
                              key={i}
                              className="text-[11px] text-amber-300 bg-amber-950/40 p-1.5 rounded flex items-start gap-1"
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                              <span>
                                Dòng {warn.lineIndex}: {warn.warning}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {parsedPasteResults.errors.length > 0 && (
                        <div className="space-y-1 max-h-28 overflow-y-auto pt-1">
                          {parsedPasteResults.errors.map((err, i) => (
                            <div
                              key={i}
                              className="text-[11px] text-rose-300 bg-rose-950/40 p-1.5 rounded flex items-start gap-1"
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                              <span>
                                Dòng {err.lineIndex}: {err.error}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 text-xs font-semibold"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleImportPaste}
                      disabled={parsedPasteResults.valid.length === 0}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-lg transition"
                    >
                      Nhập {parsedPasteResults.valid.length} người
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* MODAL CHỌN TRÌNH ĐỘ NHANH (12 RANKS - GRID 4x3 CHUẨN MOBILE) */}
      {pickerPlayer && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 max-w-sm w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                  <span>Trình độ:</span>
                  <span className="text-emerald-400">{pickerPlayer.name}</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Giới tính: {pickerPlayer.sex === 'M' ? 'Nam' : 'Nữ'} (Bù Nam: +{maleBonus.toFixed(1)}đ)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerPlayer(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {ORDERED_RANKS.map((r) => {
                const meta = RANK_METADATA[r];
                const isSelected = pickerPlayer.rank === r;
                const eff = getEffectiveSkill(r, pickerPlayer.sex, maleBonus);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      vibrateSuccess();
                      onEditRank(pickerPlayer.id, r);
                      setPickerPlayer(null);
                    }}
                    className={`p-2 rounded-xl text-center border transition flex flex-col items-center justify-center active:scale-95 ${
                      isSelected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/50 bg-emerald-950/60'
                        : 'border-slate-800 bg-slate-950/60 hover:bg-slate-800'
                    }`}
                  >
                    <span className={`text-xs font-black px-1.5 py-0.5 rounded ${meta.badgeBg} ${meta.badgeText}`}>
                      {meta.code}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 font-mono">{eff.toFixed(1)}đ</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
