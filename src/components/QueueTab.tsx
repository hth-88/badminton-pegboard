import React, { useMemo, useState } from 'react';
import {
  UserPlus,
  PlayCircle,
  Trash2,
  Sparkles,
  ClipboardPaste,
  AlertCircle,
  Minus,
  Plus,
  Star,
  Coffee,
  UserMinus,
  Users,
  FileText,
  Lock,
  Check,
  CheckSquare,
  Pause,
} from 'lucide-react';
import type { BadmintonRank, Court, Player, Sex } from '../types/badminton';
import {
  getEffectiveSkill,
  ORDERED_RANKS,
  RANK_METADATA,
  stepRankDown,
  stepRankUp,
} from '../engine/skillConfig';
import { sortPlayersByWaitPriority } from '../engine/matchmaker';
import { SAMPLE_16_PLAYERS } from '../data/samplePlayers';
import { vibrateSuccess, vibrateWarning } from '../utils/vibrate';
import { parsePasteLines } from '../utils/parsePasteLines';
import {
  type ClubMember,
  CLUB_MEMBER_PRESET_TAGS,
  getClubRoster,
  upsertClubMember,
  deleteClubMember,
  isClubMember,
  syncClubMemberRank,
  updateClubMemberProfile,
} from '../engine/clubRosterStorage';
import {
  GenderDot,
  GenderToggleButton,
  RankBadge,
  StatusPill,
  UiEmptyState,
  UiModal,
} from './ui/Primitives';

interface QueueTabProps {
  players: Player[];
  courts: Court[];
  maleBonus?: number;
  isViewer?: boolean;
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
  onRemovePlayers?: (playerIds: string[]) => void;
  onPausePlayers?: (playerIds: string[]) => void;
}

export const QueueTab: React.FC<QueueTabProps> = ({
  players,
  courts,
  maleBonus = 1.5,
  isViewer = false,
  onAddPlayer,
  onAddPlayers,
  onPausePlayer,
  onPausePlayers,
  onResumePlayer,
  onEditRank,
  onUpdatePlayer,
  onRemovePlayer,
  onRemovePlayers,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'ROSTER' | 'SINGLE' | 'PASTE'>('ROSTER');
  const [pickerPlayer, setPickerPlayer] = useState<Player | null>(null);

  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());

  const [clubRoster, setClubRoster] = useState<ClubMember[]>(() => getClubRoster());
  const [selectedRosterIds, setSelectedRosterIds] = useState<Set<string>>(new Set());
  const [showRosterAddInline, setShowRosterAddInline] = useState(false);
  const [rosterNewName, setRosterNewName] = useState('');
  const [rosterNewSex, setRosterNewSex] = useState<Sex>('M');
  const [rosterNewRank, setRosterNewRank] = useState<BadmintonRank>('tb');

  const [profileModalMember, setProfileModalMember] = useState<ClubMember | null>(null);
  const [profileNotesInput, setProfileNotesInput] = useState('');
  const [profileTagsInput, setProfileTagsInput] = useState<string[]>([]);

  const openClubProfileModal = (member: ClubMember) => {
    setProfileModalMember(member);
    setProfileNotesInput(member.notes || '');
    setProfileTagsInput(member.tags || []);
  };

  const handleSaveClubProfile = () => {
    if (!profileModalMember) return;
    updateClubMemberProfile(profileModalMember.id, {
      notes: profileNotesInput,
      tags: profileTagsInput,
    });
    setClubRoster(getClubRoster());
    setProfileModalMember(null);
    vibrateSuccess();
  };

  const handleOpenAddModal = (mode: 'ROSTER' | 'SINGLE' | 'PASTE' = 'ROSTER') => {
    const currentRoster = getClubRoster();
    setClubRoster(currentRoster);
    const inSession = new Set(players.map((p) => p.name.trim().toLowerCase()));
    const initialSelected = new Set<string>();
    currentRoster.forEach((m) => {
      if (!inSession.has(m.name.trim().toLowerCase())) {
        initialSelected.add(m.id);
      }
    });
    setSelectedRosterIds(initialSelected);
    setAddMode(mode);
    setShowAddModal(true);
  };

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

  const handleEditRankAndSync = (playerId: string, rank: BadmintonRank) => {
    onEditRank(playerId, rank);
    const p = players.find((pl) => pl.id === playerId);
    if (p) {
      syncClubMemberRank(p.name, rank);
      setClubRoster(getClubRoster());
    }
  };

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
    setClubRoster(getClubRoster());
    setShowRosterAddInline(false);
    vibrateSuccess();
  };

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

  const toggleSelectRosterMember = (id: string) => {
    setSelectedRosterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const inSessionNames = useMemo(() => {
    return new Set(players.map((p) => p.name.trim().toLowerCase()));
  }, [players]);

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

  const [newName, setNewName] = useState('');
  const [newSex, setNewSex] = useState<Sex>('M');
  const [newRank, setNewRank] = useState<BadmintonRank>('tb');
  const [newPool, setNewPool] = useState<string>('ALL');
  const [newNoSingles, setNewNoSingles] = useState(false);

  const [pasteText, setPasteText] = useState('');
  const [allowZaloDefaults, setAllowZaloDefaults] = useState(true);

  const activePlayers = useMemo(() => {
    return sortPlayersByWaitPriority(players.filter((p) => p.status === 'ACTIVE'));
  }, [players]);

  const pausedPlayers = useMemo(() => {
    return players.filter((p) => p.status === 'PAUSED');
  }, [players]);

  const playingPlayerIds = new Set<string>();
  for (const c of courts) {
    if (c.isActive && c.currentMatch) {
      for (const id of c.currentMatch.team1) playingPlayerIds.add(id);
      for (const id of c.currentMatch.team2) playingPlayerIds.add(id);
    }
  }

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

  const parsedPasteResults = useMemo(() => {
    return parsePasteLines(pasteText, players, { allowDefaults: allowZaloDefaults });
  }, [pasteText, players, allowZaloDefaults]);

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

  const handleLoadSample16 = () => {
    vibrateSuccess();
    onAddPlayers(SAMPLE_16_PLAYERS);
  };

  const selectedRosterCount = clubRoster.filter(
    (m) =>
      selectedRosterIds.has(m.id) &&
      !inSessionNames.has(m.name.trim().toLowerCase())
  ).length;

  return (
    <div className="max-w-[880px] mx-auto px-4 md:px-6 pt-4 pb-28 space-y-5">
      {/* Page Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              className="text-[20px] font-bold tracking-[-0.02em]"
              style={{ color: 'var(--text-primary)' }}
            >
              Hàng chờ
            </h2>
            <StatusPill tone="neutral">
              <span className="tabular-nums">{players.length} người</span>
            </StatusPill>
          </div>
          <p
            className="text-[14px] mt-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Ưu tiên người đợi lâu nhất và đánh ít trận nhất
          </p>
        </div>

        {!isViewer && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {players.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setIsBulkMode((prev) => !prev);
                  if (isBulkMode) {
                    setSelectedPlayerIds(new Set());
                  }
                }}
                title="Chọn nhiều người để tạm nghỉ hoặc rút hàng loạt"
                className={`ui-btn px-3.5 ${
                  isBulkMode ? 'ui-btn-accent-soft' : 'ui-btn-secondary'
                }`}
              >
                <CheckSquare className="w-4 h-4 shrink-0" />
                <span>Chọn nhiều</span>
                {selectedPlayerIds.size > 0 && (
                  <span className="tabular-nums font-bold">
                    ({selectedPlayerIds.size})
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => handleOpenAddModal('ROSTER')}
              className="ui-btn ui-btn-secondary px-3.5"
            >
              <Star
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-accent)' }}
              />
              <span>Điểm danh CLB</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenAddModal('SINGLE')}
              className="ui-btn ui-btn-primary px-4 rounded-full"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Thêm khách</span>
            </button>

            {players.length === 0 && (
              <button
                type="button"
                onClick={handleLoadSample16}
                className="ui-btn ui-btn-secondary px-3.5"
              >
                <Sparkles
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--color-accent)' }}
                />
                <span>16 mẫu</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ACTIVE PLAYERS LIST */}
      <section className="space-y-2.5">
        <div
          className="flex items-center justify-between px-1 text-[13px] font-semibold"
          style={{ color: 'var(--text-muted)' }}
        >
          <span>SẴN SÀNG ({activePlayers.length})</span>
          <span>{isViewer ? 'TRÌNH · TRẬN' : 'TRÌNH ĐỘ & THAO TÁC'}</span>
        </div>

        {activePlayers.length === 0 ? (
          <UiEmptyState
            icon={<Users className="w-6 h-6" />}
            title="Chưa có người chơi nào"
            description={
              isViewer
                ? 'Chủ sân chưa thêm danh sách người chơi cho buổi này.'
                : 'Bấm Thêm khách, Điểm danh CLB hoặc nạp 16 mẫu để bắt đầu buổi chơi.'
            }
          />
        ) : (
          <div className="space-y-2.5">
            {activePlayers.map((player, idx) => {
              const isPlaying = playingPlayerIds.has(player.id);
              const rankMeta = RANK_METADATA[player.rank];
              const effectiveSkill = getEffectiveSkill(player.rank, player.sex, maleBonus);
              const isMember = isClubMember(player.name, clubRoster);
              const clubMember = !isViewer
                ? clubRoster.find(
                    (m) => m.name.trim().toLowerCase() === player.name.trim().toLowerCase()
                  )
                : undefined;
              const hasNoteOrTags = Boolean(
                clubMember?.notes?.trim() || (clubMember?.tags && clubMember.tags.length > 0)
              );

              if (isViewer) {
                return (
                  <div
                    key={player.id}
                    className="ui-card px-4 py-3.5 flex items-center justify-between gap-3"
                    style={isPlaying ? { opacity: 0.78 } : undefined}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className="w-6 text-[13px] font-semibold tabular-nums text-center shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {idx + 1}
                      </span>
                      <GenderDot sex={player.sex} />
                      <span
                        className="text-[15px] font-semibold truncate min-w-0 flex-1"
                        style={{ color: 'var(--text-primary)' }}
                        title={player.name}
                      >
                        {player.name}
                      </span>
                      {isPlaying && (
                        <StatusPill tone="accent">Đang đánh</StatusPill>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <RankBadge rank={player.rank} surface="card" />
                      <div
                        className="text-[13px] tabular-nums text-right min-w-[96px]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <span>{player.gamesPlayed} trận</span>
                        <span className="mx-1">·</span>
                        <span
                          style={
                            player.waitStreak > 1
                              ? { color: 'var(--color-accent)', fontWeight: 600 }
                              : undefined
                          }
                        >
                          Nghỉ {player.waitStreak}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={player.id}
                  className="ui-card px-4 py-3.5 space-y-3"
                  style={isPlaying ? { opacity: 0.82 } : undefined}
                >
                  {/* Row 1: Identity & Stats */}
                  <div className="flex items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isBulkMode && (
                        <input
                          type="checkbox"
                          checked={selectedPlayerIds.has(player.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            const next = new Set(selectedPlayerIds);
                            if (next.has(player.id)) next.delete(player.id);
                            else next.add(player.id);
                            setSelectedPlayerIds(next);
                          }}
                          aria-label={`Chọn ${player.name}`}
                          className="ui-checkbox w-5 h-5 shrink-0 cursor-pointer"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleClubMember(player)}
                        title={
                          isMember
                            ? 'Thành viên CLB cố định (Bấm để cập nhật trình độ)'
                            : 'Lưu người này vào Sổ thành viên CLB cố định'
                        }
                        aria-label={`Sổ CLB cho ${player.name}`}
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition"
                        style={{
                          color: isMember ? 'var(--color-warning)' : 'var(--text-muted)',
                        }}
                      >
                        <Star
                          className="w-4 h-4"
                          fill={isMember ? 'currentColor' : 'none'}
                        />
                      </button>

                      <GenderDot sex={player.sex} />

                      <span
                        className="text-[15px] font-semibold truncate min-w-0 flex-1"
                        style={{ color: 'var(--text-primary)' }}
                        title={player.name}
                      >
                        {player.name}
                      </span>

                      {clubMember && (
                        <button
                          type="button"
                          onClick={() => openClubProfileModal(clubMember)}
                          title={
                            hasNoteOrTags
                              ? `Ghi chú kín CLB: ${clubMember.tags?.join(', ') || ''} ${clubMember.notes || ''}`
                              : 'Thêm ghi chú / thẻ kín Sổ CLB'
                          }
                          aria-label={`Ghi chú kín cho ${player.name}`}
                          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition"
                          style={
                            hasNoteOrTags
                              ? {
                                  backgroundColor: 'var(--color-warning-soft)',
                                  color: 'var(--color-warning)',
                                }
                              : {
                                  backgroundColor: 'var(--bg-surface-secondary)',
                                  color: 'var(--text-muted)',
                                }
                          }
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}

                      {isPlaying && (
                        <StatusPill tone="accent" className="shrink-0">
                          Đang đánh
                        </StatusPill>
                      )}
                    </div>

                    <div
                      className="flex items-center gap-1.5 text-[13px] tabular-nums shrink-0"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span>{player.gamesPlayed} trận</span>
                      <span>·</span>
                      <span
                        style={
                          player.waitStreak > 1
                            ? { color: 'var(--color-accent)', fontWeight: 600 }
                            : undefined
                        }
                      >
                        Nghỉ {player.waitStreak}
                      </span>
                      {player.virtualGamesOffset > 0 && (
                        <span
                          className="text-[12px] font-semibold"
                          style={{ color: 'var(--color-warning)' }}
                        >
                          (+{player.virtualGamesOffset})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Fixed-width Stepper & Uniform Controls */}
                  <div className="flex items-center justify-between gap-2 pt-2.5 border-t ui-divider flex-wrap">
                    {/* Fixed-width Rank Stepper: [-] [118px Rank · Score] [+] */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          vibrateSuccess();
                          handleEditRankAndSync(player.id, stepRankDown(player.rank));
                        }}
                        title="Hạ 1 bậc trình độ"
                        aria-label={`Hạ trình độ ${player.name}`}
                        className="ui-icon-btn w-11 h-11"
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setPickerPlayer(player)}
                        title="Bấm để chọn nhanh 1 trong 12 trình độ"
                        className="ui-btn ui-btn-secondary w-[118px] px-2 tabular-nums shrink-0"
                      >
                        <span className="font-bold">{rankMeta.code}</span>
                        <span
                          className="text-[12px] font-medium"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {effectiveSkill.toFixed(1)}đ
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          vibrateSuccess();
                          handleEditRankAndSync(player.id, stepRankUp(player.rank));
                        }}
                        title="Tăng 1 bậc trình độ"
                        aria-label={`Tăng trình độ ${player.name}`}
                        className="ui-icon-btn w-11 h-11"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Uniform Right Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <GenderToggleButton
                        sex={player.sex}
                        onClick={() => {
                          vibrateSuccess();
                          onUpdatePlayer({
                            id: player.id,
                            sex: player.sex === 'M' ? 'F' : 'M',
                          });
                        }}
                        title={`Chuyển sang ${player.sex === 'M' ? 'Nữ' : 'Nam'}`}
                      />

                      <select
                        id={`player-pool-${player.id}`}
                        name={`player-pool-${player.id}`}
                        value={player.assignedPool}
                        onChange={(e) =>
                          onUpdatePlayer({ id: player.id, assignedPool: e.target.value })
                        }
                        aria-label={`Gán sân cho ${player.name}`}
                        className="ui-select w-auto min-w-[112px] py-2 px-3 hidden md:block"
                      >
                        <option value="ALL">Tất cả sân</option>
                        {courts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => onPausePlayer(player.id)}
                        title="Tạm nghỉ giải lao"
                        aria-label={`Tạm nghỉ cho ${player.name}`}
                        className="ui-icon-btn w-11 h-11"
                      >
                        <Coffee className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleWithdrawPlayer(player)}
                        title="Rút khỏi buổi hôm nay"
                        aria-label={`Rút ${player.name} khỏi buổi hôm nay`}
                        className="ui-icon-btn w-11 h-11"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* PAUSED PLAYERS SECTION */}
      {pausedPlayers.length > 0 && (
        <section className="pt-4 border-t ui-divider space-y-2.5">
          <div className="flex items-center justify-between px-1 gap-2">
            <span
              className="text-[13px] font-semibold"
              style={{ color: 'var(--color-warning)' }}
            >
              TẠM NGHỈ ({pausedPlayers.length})
            </span>
            <span
              className="text-[13px] hidden sm:inline"
              style={{ color: 'var(--text-muted)' }}
            >
              Khi vào lại sẽ tự động bù lượt
            </span>
          </div>

          <div className="space-y-2">
            {pausedPlayers.map((player) => (
              <div
                key={player.id}
                className="ui-card px-4 py-3 flex items-center justify-between gap-3"
                style={{ opacity: 0.78 }}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {isBulkMode && !isViewer && (
                    <input
                      type="checkbox"
                      checked={selectedPlayerIds.has(player.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        const next = new Set(selectedPlayerIds);
                        if (next.has(player.id)) next.delete(player.id);
                        else next.add(player.id);
                        setSelectedPlayerIds(next);
                      }}
                      aria-label={`Chọn ${player.name}`}
                      className="ui-checkbox w-5 h-5 shrink-0 cursor-pointer"
                    />
                  )}
                  <GenderDot sex={player.sex} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-[15px] font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {player.name}
                      </span>
                      <RankBadge rank={player.rank} surface="card" />
                    </div>
                    <p
                      className="text-[13px] tabular-nums mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Đã đánh {player.gamesPlayed} trận
                    </p>
                  </div>
                </div>

                {!isViewer && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onResumePlayer(player.id)}
                      className="ui-btn ui-btn-primary px-3.5 rounded-full"
                    >
                      <PlayCircle className="w-4 h-4" />
                      <span>Đánh lại</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWithdrawPlayer(player)}
                      title="Rút khỏi buổi hôm nay"
                      aria-label={`Rút ${player.name} khỏi buổi hôm nay`}
                      className="ui-icon-btn w-11 h-11"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FLOATING BULK ACTION BAR (Host only) */}
      {!isViewer && isBulkMode && selectedPlayerIds.size > 0 && (
        <div className="fixed bottom-24 left-4 right-4 z-40 max-w-xl mx-auto">
          <div className="ui-toast p-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (selectedPlayerIds.size === players.length) {
                    setSelectedPlayerIds(new Set());
                  } else {
                    setSelectedPlayerIds(new Set(players.map((p) => p.id)));
                  }
                }}
                className="ui-btn ui-btn-secondary px-3"
              >
                {selectedPlayerIds.size === players.length
                  ? 'Bỏ chọn'
                  : `Chọn tất cả (${players.length})`}
              </button>
              <span
                className="text-[14px] font-semibold tabular-nums"
                style={{ color: 'var(--text-secondary)' }}
              >
                Đã chọn{' '}
                <strong style={{ color: 'var(--color-accent)' }}>
                  {selectedPlayerIds.size}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  vibrateSuccess();
                  if (onPausePlayers) {
                    onPausePlayers(Array.from(selectedPlayerIds));
                  } else {
                    selectedPlayerIds.forEach((id) => onPausePlayer(id));
                  }
                  setSelectedPlayerIds(new Set());
                }}
                className="ui-btn ui-btn-warning-soft px-3.5"
              >
                <Pause className="w-4 h-4" />
                <span>Tạm nghỉ ({selectedPlayerIds.size})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const count = selectedPlayerIds.size;
                  if (
                    window.confirm(
                      `Bạn có chắc chắn muốn xóa ${count} người đã chọn khỏi buổi hôm nay?`
                    )
                  ) {
                    vibrateSuccess();
                    if (onRemovePlayers) {
                      onRemovePlayers(Array.from(selectedPlayerIds));
                    } else {
                      selectedPlayerIds.forEach((id) => onRemovePlayer(id));
                    }
                    setSelectedPlayerIds(new Set());
                  }
                }}
                className="ui-btn ui-btn-danger px-3.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xóa ({selectedPlayerIds.size})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD PLAYER (ROSTER / SINGLE / PASTE) */}
      <UiModal
        isOpen={!isViewer && showAddModal}
        onClose={() => setShowAddModal(false)}
        sheetOnMobile
        title="Thêm người chơi"
      >
        <div className="space-y-4">
          {/* Segmented Mode Switcher */}
          <div className="ui-segmented-track grid grid-cols-3 gap-1">
            {(
              [
                { id: 'ROSTER', label: 'Sổ CLB', icon: Star },
                { id: 'SINGLE', label: 'Khách lẻ', icon: UserPlus },
                { id: 'PASTE', label: 'Dán Zalo', icon: ClipboardPaste },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = addMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAddMode(tab.id)}
                  className="min-h-[44px] px-2 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-1.5 transition"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--bg-surface-elevated)',
                          color: 'var(--text-primary)',
                          boxShadow: 'var(--shadow-sm)',
                        }
                      : { color: 'var(--text-secondary)' }
                  }
                >
                  <Icon
                    className="w-4 h-4 shrink-0"
                    style={active ? { color: 'var(--color-accent)' } : undefined}
                  />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {addMode === 'ROSTER' ? (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className="text-[14px] font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Sổ CLB ({clubRoster.length})
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSelectAllRoster}
                    className="ui-btn ui-btn-secondary min-h-[36px] px-3 text-[13px]"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllRoster}
                    className="ui-btn ui-btn-ghost min-h-[36px] px-3 text-[13px]"
                  >
                    Bỏ chọn
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRosterAddInline(!showRosterAddInline)}
                    className="ui-btn ui-btn-accent-soft min-h-[36px] px-3 text-[13px]"
                  >
                    {showRosterAddInline ? 'Đóng' : '+ Thêm vào Sổ'}
                  </button>
                </div>
              </div>

              {showRosterAddInline && (
                <form
                  onSubmit={handleAddMemberToRoster}
                  className="ui-tile p-4 space-y-3"
                >
                  <div
                    className="text-[14px] font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Thêm thành viên cố định mới
                  </div>
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Tên thành viên..."
                      value={rosterNewName}
                      onChange={(e) => setRosterNewName(e.target.value)}
                      className="ui-input"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRosterNewSex('M')}
                          className={`ui-btn px-2 ${
                            rosterNewSex === 'M' ? 'ui-btn-accent-soft' : 'ui-btn-secondary'
                          }`}
                        >
                          <GenderDot sex="M" />
                          <span>Nam</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRosterNewSex('F')}
                          className={`ui-btn px-2 ${
                            rosterNewSex === 'F' ? 'ui-btn-accent-soft' : 'ui-btn-secondary'
                          }`}
                        >
                          <GenderDot sex="F" />
                          <span>Nữ</span>
                        </button>
                      </div>
                      <select
                        value={rosterNewRank}
                        onChange={(e) => setRosterNewRank(e.target.value as BadmintonRank)}
                        className="ui-select"
                      >
                        {ORDERED_RANKS.map((r) => (
                          <option key={r} value={r}>
                            {RANK_METADATA[r].code} — {RANK_METADATA[r].name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRosterAddInline(false)}
                      className="ui-btn ui-btn-ghost px-3.5"
                    >
                      Hủy
                    </button>
                    <button type="submit" className="ui-btn ui-btn-primary px-4">
                      Lưu vào Sổ
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                {clubRoster.length === 0 ? (
                  <p
                    className="text-[14px] text-center py-8"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Sổ thành viên trống. Bấm &quot;+ Thêm vào Sổ&quot; để tạo mới.
                  </p>
                ) : (
                  clubRoster.map((member) => {
                    const inSession = inSessionNames.has(
                      member.name.trim().toLowerCase()
                    );
                    const isSelected = selectedRosterIds.has(member.id);

                    return (
                      <div
                        key={member.id}
                        className="ui-tile px-3.5 py-2.5 flex items-center justify-between gap-2"
                        style={
                          inSession
                            ? { opacity: 0.55 }
                            : isSelected
                            ? {
                                backgroundColor: 'var(--color-accent-soft)',
                                border: '1px solid var(--color-accent-border)',
                              }
                            : undefined
                        }
                      >
                        <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer min-h-[36px]">
                          <input
                            type="checkbox"
                            disabled={inSession}
                            checked={inSession ? true : isSelected}
                            onChange={() =>
                              !inSession && toggleSelectRosterMember(member.id)
                            }
                            className="ui-checkbox w-5 h-5 shrink-0"
                          />
                          <GenderDot sex={member.sex} />
                          <span
                            className="text-[15px] font-semibold truncate flex-1 min-w-0"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {member.name}
                          </span>
                          <RankBadge rank={member.rank} surface="tile" />
                        </label>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openClubProfileModal(member)}
                            title="Ghi chú & thẻ kín thành viên CLB"
                            aria-label={`Ghi chú kín ${member.name}`}
                            className="w-9 h-9 rounded-lg flex items-center justify-center transition"
                            style={{
                              color:
                                member.notes || (member.tags && member.tags.length > 0)
                                  ? 'var(--color-warning)'
                                  : 'var(--text-muted)',
                            }}
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {inSession ? (
                            <StatusPill tone="accent">Có mặt</StatusPill>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteFromRoster(member.id, member.name)
                              }
                              title="Xóa khỏi Sổ CLB"
                              aria-label={`Xóa ${member.name} khỏi Sổ CLB`}
                              className="w-9 h-9 rounded-lg flex items-center justify-center transition"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-3 border-t ui-divider flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="ui-btn ui-btn-secondary px-4"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleImportRosterMembers}
                  disabled={selectedRosterCount === 0}
                  className="ui-btn ui-btn-primary px-5 rounded-full"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Đưa vào buổi ({selectedRosterCount})</span>
                </button>
              </div>
            </div>
          ) : addMode === 'SINGLE' ? (
            <form onSubmit={handleAddSinglePlayer} className="space-y-4">
              <div>
                <label
                  className="block text-[14px] font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Tên người chơi *
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Hoàng Tuấn"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="ui-input"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    className="block text-[14px] font-semibold mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Giới tính
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewSex('M')}
                      className={`ui-btn ${
                        newSex === 'M' ? 'ui-btn-accent-soft' : 'ui-btn-secondary'
                      }`}
                    >
                      <GenderDot sex="M" />
                      <span>Nam</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSex('F')}
                      className={`ui-btn ${
                        newSex === 'F' ? 'ui-btn-accent-soft' : 'ui-btn-secondary'
                      }`}
                    >
                      <GenderDot sex="F" />
                      <span>Nữ</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    className="block text-[14px] font-semibold mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Trình độ
                  </label>
                  <select
                    value={newRank}
                    onChange={(e) => setNewRank(e.target.value as BadmintonRank)}
                    className="ui-select"
                  >
                    {ORDERED_RANKS.map((r) => (
                      <option key={r} value={r}>
                        {RANK_METADATA[r].code} ({RANK_METADATA[r].name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label
                    className="block text-[14px] font-semibold mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Gán sân
                  </label>
                  <select
                    value={newPool}
                    onChange={(e) => setNewPool(e.target.value)}
                    className="ui-select"
                  >
                    <option value="ALL">Tất cả sân (Chung)</option>
                    {courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="ui-tile min-h-[44px] px-3.5 flex items-center gap-2.5 cursor-pointer text-[14px] font-medium">
                  <input
                    type="checkbox"
                    checked={newNoSingles}
                    onChange={(e) => setNewNoSingles(e.target.checked)}
                    className="ui-checkbox w-4 h-4 shrink-0"
                  />
                  <span>Không đánh đơn</span>
                </label>
              </div>

              <div className="pt-3 border-t ui-divider flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="ui-btn ui-btn-secondary px-4"
                >
                  Hủy
                </button>
                <button type="submit" className="ui-btn ui-btn-primary px-5 rounded-full">
                  Thêm người
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3.5">
              <div>
                <label
                  className="block text-[14px] font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Dán danh sách (mỗi người 1 dòng)
                </label>
                <p
                  className="text-[13px] mb-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cú pháp: Tên - Nam/Nữ - Trình độ (ví dụ: &quot;Tuấn - Nam - tb&quot;)
                </p>
                <textarea
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`Tuấn - Nam - tb\nLinh - Nữ - tb-\nHoàng - Nam - y+\nThảo - Nữ - tby`}
                  className="ui-textarea font-mono-tabular"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer text-[14px]">
                <input
                  type="checkbox"
                  checked={allowZaloDefaults}
                  onChange={(e) => setAllowZaloDefaults(e.target.checked)}
                  className="ui-checkbox w-4 h-4 shrink-0"
                />
                <span style={{ color: 'var(--text-secondary)' }}>
                  Tự điền Nam &amp; TB- nếu thiếu (chuẩn tin nhắn Zalo)
                </span>
              </label>

              {pasteText.trim() && (
                <div className="ui-tile p-3.5 space-y-2 text-[14px]">
                  <div className="flex items-center justify-between font-semibold">
                    <span style={{ color: 'var(--color-accent)' }}>
                      Hợp lệ: {parsedPasteResults.valid.length} người
                    </span>
                    {parsedPasteResults.errors.length > 0 && (
                      <span style={{ color: 'var(--color-danger)' }}>
                        Lỗi: {parsedPasteResults.errors.length} dòng
                      </span>
                    )}
                  </div>

                  {parsedPasteResults.warnings.length > 0 && (
                    <div className="space-y-1.5 max-h-24 overflow-y-auto">
                      {parsedPasteResults.warnings.map((warn, i) => (
                        <div
                          key={i}
                          className="ui-banner-warning px-2.5 py-1.5 text-[13px] flex items-start gap-1.5"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>
                            Dòng {warn.lineIndex}: {warn.warning}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {parsedPasteResults.errors.length > 0 && (
                    <div className="space-y-1.5 max-h-28 overflow-y-auto">
                      {parsedPasteResults.errors.map((err, i) => (
                        <div
                          key={i}
                          className="ui-banner-danger px-2.5 py-1.5 text-[13px] flex items-start gap-1.5"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>
                            Dòng {err.lineIndex}: {err.error}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t ui-divider flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="ui-btn ui-btn-secondary px-4"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleImportPaste}
                  disabled={parsedPasteResults.valid.length === 0}
                  className="ui-btn ui-btn-primary px-5 rounded-full"
                >
                  Nhập {parsedPasteResults.valid.length} người
                </button>
              </div>
            </div>
          )}
        </div>
      </UiModal>

      {/* MODAL 2: QUICK 12-RANK PICKER */}
      <UiModal
        isOpen={!isViewer && Boolean(pickerPlayer)}
        onClose={() => setPickerPlayer(null)}
        maxWidthClass="max-w-sm"
        title={pickerPlayer ? `Trình độ · ${pickerPlayer.name}` : 'Chọn trình độ'}
        subtitle={
          pickerPlayer
            ? `${pickerPlayer.sex === 'M' ? 'Nam' : 'Nữ'} (Bù Nam +${maleBonus.toFixed(1)}đ)`
            : undefined
        }
      >
        {pickerPlayer && (
          <div className="grid grid-cols-3 gap-2">
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
                  className="min-h-[60px] p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 transition tabular-nums"
                  style={
                    isSelected
                      ? {
                          backgroundColor: 'var(--color-accent-soft)',
                          border: '1.5px solid var(--color-accent)',
                          color: 'var(--color-accent)',
                        }
                      : {
                          backgroundColor: 'var(--bg-surface-secondary)',
                          border: '1px solid transparent',
                          color: 'var(--text-primary)',
                        }
                  }
                >
                  <span className="text-[14px] font-bold">{meta.code}</span>
                  <span
                    className="text-[12px]"
                    style={{
                      color: isSelected
                        ? 'var(--color-accent)'
                        : 'var(--text-secondary)',
                    }}
                  >
                    {eff.toFixed(1)}đ
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </UiModal>

      {/* MODAL 3: PRIVATE CLUB MEMBER NOTES (Host only) */}
      <UiModal
        isOpen={!isViewer && Boolean(profileModalMember)}
        onClose={() => setProfileModalMember(null)}
        maxWidthClass="max-w-md"
        title={
          <span className="inline-flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" style={{ color: 'var(--color-warning)' }} />
            <span className="truncate">
              Ghi chú kín · {profileModalMember?.name}
            </span>
          </span>
        }
        subtitle="Chỉ lưu trên thiết bị này, thành viên khác không thể xem."
        footer={
          <>
            <button
              type="button"
              onClick={() => setProfileModalMember(null)}
              className="ui-btn ui-btn-secondary px-4"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSaveClubProfile}
              className="ui-btn ui-btn-primary px-5 rounded-full"
            >
              <Check className="w-4 h-4" />
              <span>Lưu ghi chú</span>
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div
              className="text-[14px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Thẻ nhanh
            </div>
            <div className="flex flex-wrap gap-2">
              {CLUB_MEMBER_PRESET_TAGS.map((tag) => {
                const active = profileTagsInput.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setProfileTagsInput((prev) =>
                        prev.includes(tag)
                          ? prev.filter((t) => t !== tag)
                          : [...prev, tag]
                      )
                    }
                    className={`ui-btn min-h-[38px] px-3.5 rounded-full text-[13px] ${
                      active ? 'ui-btn-accent-soft' : 'ui-btn-secondary'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-[14px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Ghi chú riêng
            </label>
            <textarea
              rows={3}
              value={profileNotesInput}
              onChange={(e) => setProfileNotesInput(e.target.value)}
              placeholder="VD: Trình khá cứng, hợp đánh công, hay xin về sớm..."
              className="ui-textarea"
            />
          </div>
        </div>
      </UiModal>
    </div>
  );
};
