import React, { useMemo, useState } from 'react';
import {
  UserPlus,
  UserX,
  PlayCircle,
  Trash2,
  Sparkles,
  ClipboardPaste,
  AlertCircle,
  X,
} from 'lucide-react';
import type { BadmintonRank, Court, Player, Sex } from '../types/badminton';
import { ORDERED_RANKS, RANK_METADATA } from '../engine/skillConfig';
import { sortPlayersByWaitPriority } from '../engine/matchmaker';
import { SAMPLE_16_PLAYERS } from '../data/samplePlayers';
import { vibrateSuccess } from '../utils/vibrate';
import { parsePasteLines } from '../utils/parsePasteLines';

interface QueueTabProps {
  players: Player[];
  courts: Court[];
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
  onAddPlayer,
  onAddPlayers,
  onPausePlayer,
  onResumePlayer,
  onEditRank,
  onUpdatePlayer,
  onRemovePlayer,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'SINGLE' | 'PASTE'>('SINGLE');

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
          {/* Nút thêm người */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm người</span>
          </button>

          {/* Nút nạp 16 người mẫu */}
          {players.length === 0 && (
            <button
              onClick={handleLoadSample16}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-600/40 rounded-xl text-xs font-semibold transition"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Nạp 16 người mẫu</span>
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

            return (
              <div
                key={player.id}
                className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                  isPlaying
                    ? 'bg-slate-900/40 border-slate-800/80'
                    : 'bg-slate-900/90 hover:bg-slate-850 border-slate-800 shadow-sm'
                }`}
              >
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-100 truncate">
                      {player.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        player.sex === 'M'
                          ? 'bg-sky-950 text-sky-300'
                          : 'bg-pink-950 text-pink-300'
                      }`}
                    >
                      {player.sex === 'M' ? 'Nam' : 'Nữ'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${rankMeta.badgeBg} ${rankMeta.badgeText}`}
                    >
                      {rankMeta.code}
                    </span>
                    {isPlaying && (
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Đang đánh
                      </span>
                    )}
                  </div>

                  {/* Priority stats */}
                  <div className="flex items-center gap-2.5 text-xs text-slate-400 mt-1">
                    <span>
                      Đã đánh: <strong className="text-slate-200">{player.gamesPlayed}</strong>
                      {player.virtualGamesOffset > 0 && (
                        <span className="text-amber-400 text-[11px]"> (+{player.virtualGamesOffset} bù)</span>
                      )}
                    </span>
                    <span>•</span>
                    <span className={player.waitStreak > 1 ? 'text-emerald-400 font-semibold' : ''}>
                      Chờ: <strong>{player.waitStreak}</strong> lượt
                    </span>
                    {player.noSingles && (
                      <>
                        <span>•</span>
                        <span className="text-slate-500 text-[11px]">Không đơn</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions & Quick Config */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Sửa trình độ */}
                  <select
                    value={player.rank}
                    onChange={(e) => onEditRank(player.id, e.target.value as BadmintonRank)}
                    aria-label={`Trình độ của ${player.name}`}
                    className="bg-slate-800 text-slate-200 text-xs font-semibold rounded-lg px-2 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {ORDERED_RANKS.map((r) => (
                      <option key={r} value={r}>
                        {RANK_METADATA[r].code} ({RANK_METADATA[r].name})
                      </option>
                    ))}
                  </select>

                  {/* Gán sân (Pool) */}
                  <select
                    value={player.assignedPool}
                    onChange={(e) => onUpdatePlayer({ id: player.id, assignedPool: e.target.value })}
                    aria-label={`Gán sân cho ${player.name}`}
                    className="bg-slate-800 text-slate-200 text-xs font-semibold rounded-lg px-1.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 hidden sm:block"
                  >
                    <option value="ALL">Tất cả sân</option>
                    {courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  {/* Tạm nghỉ */}
                  <button
                    onClick={() => onPausePlayer(player.id)}
                    title="Tạm nghỉ (đi muộn / về sớm / nghỉ giải lao)"
                    aria-label={`Tạm nghỉ cho ${player.name}`}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition"
                  >
                    <UserX className="w-4 h-4" />
                  </button>

                  {/* Xóa người */}
                  <button
                    onClick={() => {
                      if (window.confirm(`Bạn có chắc muốn xóa "${player.name}"?`)) {
                        onRemovePlayer(player.id);
                      }
                    }}
                    title="Xóa người chơi"
                    aria-label={`Xóa người chơi ${player.name}`}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
                  onClick={() => {
                    if (window.confirm(`Xóa người chơi "${player.name}"?`)) {
                      onRemovePlayer(player.id);
                    }
                  }}
                  aria-label={`Xóa người chơi ${player.name}`}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                >
                  <Trash2 className="w-4 h-4" />
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
            <div className="grid grid-cols-2 gap-2 my-3 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setAddMode('SINGLE')}
                className={`py-1.5 rounded-lg text-xs font-bold transition ${
                  addMode === 'SINGLE'
                    ? 'bg-slate-800 text-emerald-400 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Nhập từng người
              </button>
              <button
                onClick={() => setAddMode('PASTE')}
                className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  addMode === 'PASTE'
                    ? 'bg-slate-800 text-emerald-400 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Dán nhanh (Quick Paste)</span>
              </button>
            </div>

            {/* Mode Content */}
            <div className="flex-1 overflow-y-auto space-y-4 py-1">
              {addMode === 'SINGLE' ? (
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
    </div>
  );
};
