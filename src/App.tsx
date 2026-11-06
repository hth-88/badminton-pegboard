import { useMemo, useState } from 'react';
import { useBadmintonSession } from './engine/useBadmintonSession';
import { useTheme } from './hooks/useTheme';
import { useWakeLock } from './hooks/useWakeLock';
import { useCloudRoom } from './hooks/useCloudRoom';
import { Header } from './components/Header';
import { BottomNav, type NavTab } from './components/BottomNav';
import { CourtCard } from './components/CourtCard';
import { QueueTab } from './components/QueueTab';
import { PairRulesTab } from './components/PairRulesTab';
import { HistoryTab } from './components/HistoryTab';
import { SettlementTab } from './components/SettlementTab';
import { CloudRoomModal } from './components/CloudRoomModal';
import { InfoToast, UndoToast } from './components/Toast';
import { Eye, KeyRound, Lock } from 'lucide-react';
import {
  getLastLoadStatus,
  getLatestCorruptBackup,
  type LoadStatus,
} from './engine/storage';

export function App() {
  const {
    state,
    players,
    courts,
    history,
    pairRules,
    settings,
    stats,
    canUndo,
    canRedo,
    ruleConflicts,
    nextUpEval,
    storageError,
    // Actions
    startMatch,
    endMatch,
    endAndStartMatch,
    swapPlayers,
    suggestNextUp,
    setNextUpSlot,
    clearNextUp,
    rearrangeNextUp,
    pausePlayer,
    resumePlayer,
    addPlayer,
    addPlayers,
    updatePlayer,
    removePlayer,
    editRank,
    updateCourt,
    addPairRule,
    removePairRule,
    updateSettings,
    snoozeAutoSingles,
    deleteHistoryMatch,
    newSessionKeepPlayers,
    undo,
    redo,
    resetSession,
    exportSession,
    importSession,
    loadCloudState,
  } = useBadmintonSession();

  const { theme, setTheme } = useTheme();
  const { isSupported: wakeLockSupported, isActive: wakeLockActive, toggleWakeLock } = useWakeLock();

  const [activeTab, setActiveTab] = useState<NavTab>('courts');
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<'ALL' | string>('ALL');
  const [undoToastMessage, setUndoToastMessage] = useState<string | null>(null);
  const [warningToastMessage, setWarningToastMessage] = useState<string | null>(null);
  const [corruptStatus, setCorruptStatus] = useState<LoadStatus>(() => getLastLoadStatus());

  // Cloud Room state
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [upgradePinInput, setUpgradePinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const {
    roomCode,
    pinCode,
    role,
    syncStatus,
    errorMessage: cloudError,
    showPinPrompt,
    setShowPinPrompt,
    createRoom,
    joinRoom,
    upgradeToCoHost,
    leaveRoom,
    guardAction,
  } = useCloudRoom({
    currentState: state,
    onApplyCloudState: loadCloudState,
    onShowToast: (msg) => setUndoToastMessage(msg),
  });

  // Tính số sân đang bật
  const activeCourtsCount = useMemo(() => {
    return courts.filter((c) => c.isActive).length;
  }, [courts]);

  // Tập hợp ID người đang đánh trên các sân
  const busyPlayingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of courts) {
      if (c.isActive && c.currentMatch) {
        c.currentMatch.team1.forEach((id) => ids.add(id));
        c.currentMatch.team2.forEach((id) => ids.add(id));
      }
    }
    return ids;
  }, [courts]);

  // Số người ACTIVE đang chờ
  const waitingCount = useMemo(() => {
    return players.filter((p) => p.status === 'ACTIVE' && !busyPlayingIds.has(p.id)).length;
  }, [players, busyPlayingIds]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* BANNER DỮ LIỆU HỎNG (Mục F) */}
      {(corruptStatus === 'CORRUPT_BACKED_UP' || corruptStatus === 'CORRUPT_NO_BACKUP') && (
        <div className="bg-rose-900 border-b border-rose-700 text-rose-100 px-4 py-2 text-xs flex items-center justify-between gap-3 sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-bold text-sm">⚠️</span>
            <span className="truncate">
              {corruptStatus === 'CORRUPT_BACKED_UP'
                ? 'Phát hiện dữ liệu cũ bị hỏng, đã sao lưu. Bấm để xuất bản sao'
                : 'Phát hiện dữ liệu cũ bị hỏng, không thể tạo bản sao lưu.'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {corruptStatus === 'CORRUPT_BACKED_UP' && (
              <button
                onClick={() => {
                  const backup = getLatestCorruptBackup();
                  if (backup) {
                    const blob = new Blob([backup.raw], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${backup.key}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }
                }}
                className="px-2.5 py-1 bg-white text-rose-900 font-bold rounded-lg hover:bg-rose-50 transition"
              >
                Xuất bản sao
              </button>
            )}
            <button
              onClick={() => setCorruptStatus('OK')}
              className="px-2 py-1 bg-rose-950/80 hover:bg-rose-950 text-rose-300 rounded-lg font-semibold transition"
            >
              Bỏ qua
            </button>
          </div>
        </div>
      )}

      {/* 1. HEADER */}
      <Header
        activeCourtsCount={activeCourtsCount}
        totalCourtsCount={courts.length}
        courtMode={settings.courtMode}
        onToggleCourtMode={() =>
          guardAction(() =>
            updateSettings({
              courtMode: settings.courtMode === 'SHARED_POOL' ? 'SPLIT_COURT' : 'SHARED_POOL',
            })
          )
        }
        matchMix={settings.matchMix}
        onUpdateMatchMix={(doubles, singles) =>
          guardAction(() => updateSettings({ matchMix: { doubles, singles } }))
        }
        autoSingles={settings.autoSingles}
        onUpdateAutoSingles={(autoSingles) =>
          guardAction(() => updateSettings({ autoSingles }))
        }
        maleBonus={settings.maleBonus}
        onUpdateMaleBonus={(maleBonus) =>
          guardAction(() => updateSettings({ maleBonus }))
        }
        wakeLockActive={wakeLockActive}
        onToggleWakeLock={toggleWakeLock}
        wakeLockSupported={wakeLockSupported}
        theme={theme}
        onSelectTheme={setTheme}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => guardAction(undo)}
        onRedo={() => guardAction(redo)}
        storageError={storageError}
        onExportJson={() => {
          const jsonStr = exportSession();
          navigator.clipboard.writeText(jsonStr).catch(() => {});
          alert('Đã sao chép toàn bộ dữ liệu JSON vào Clipboard!');
        }}
        updateSettings={(s) => guardAction(() => updateSettings(s))}
        roomCode={roomCode}
        pinCode={pinCode}
        role={role}
        syncStatus={syncStatus}
        onOpenCloudModal={() => setShowCloudModal(true)}
      />

      {/* VIEWER NOTICE BANNER */}
      {role === 'VIEWER' && roomCode && (
        <div className="bg-indigo-950/90 border-b border-indigo-800/60 px-4 py-2 text-xs text-indigo-200 flex items-center justify-between gap-3 sticky top-[57px] z-20 backdrop-blur">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Eye className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="truncate">
              Chế độ <strong className="text-white">Chỉ Xem</strong> phòng <strong className="text-white">{roomCode}</strong>.
            </span>
          </div>
          <button
            onClick={() => setShowPinPrompt(true)}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs transition shrink-0 flex items-center gap-1 shadow-sm"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Nhập PIN Host</span>
          </button>
        </div>
      )}

      {/* QUICK PIN PROMPT MODAL FOR VIEWER ACTION GUARD */}
      {showPinPrompt && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-amber-400">
              <Lock className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-base text-white">Mở khóa quyền Co-Host</h3>
            </div>
            <p className="text-xs text-slate-300">
              Bạn đang ở chế độ <strong>Chỉ Xem</strong> phòng <strong>{roomCode}</strong>. Vui lòng nhập mã PIN 4 số do chủ phòng cung cấp để thực hiện thao tác này.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!upgradePinInput.trim()) return;
                setPinError(null);
                const res = await upgradeToCoHost(upgradePinInput);
                if (!res.ok) {
                  setPinError(res.error || 'Mã PIN không đúng');
                } else {
                  setUpgradePinInput('');
                  setShowPinPrompt(false);
                }
              }}
              className="space-y-3"
            >
              <input
                type="password"
                maxLength={6}
                autoFocus
                placeholder="Nhập mã PIN..."
                value={upgradePinInput}
                onChange={(e) => {
                  setUpgradePinInput(e.target.value);
                  setPinError(null);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-center font-mono font-bold text-lg text-white tracking-widest focus:outline-none focus:border-emerald-500"
              />

              {pinError && (
                <p className="text-xs text-rose-400 font-medium text-center">{pinError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowPinPrompt(false);
                    setUpgradePinInput('');
                    setPinError(null);
                  }}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow"
                >
                  Mở khóa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. MAIN CONTENT TABS */}
      <main className="flex-1 w-full max-w-7xl mx-auto">
        {/* TAB 1: SÂN (Màn hình điều khiển chính) */}
        {activeTab === 'courts' && (
          <div className="p-3 md:p-6 pb-28">
            {/* Quick Court Switcher on Mobile (< 2 courts doesn't need it) */}
            {courts.length >= 2 && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-3 mb-2">
                <button
                  onClick={() => setSelectedCourtFilter('ALL')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition ${
                    selectedCourtFilter === 'ALL'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Tất cả sân ({courts.length})
                </button>
                {courts.map((c) => {
                  const isPlaying = c.currentMatch !== null;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCourtFilter(c.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition ${
                        selectedCourtFilter === c.id
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`}
                      />
                      <span>{c.name}</span>
                      <span className="text-[10px] opacity-75">
                        ({isPlaying ? 'Đang đánh' : 'Trống'})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(selectedCourtFilter === 'ALL'
                ? courts
                : courts.filter((c) => c.id === selectedCourtFilter)
              ).map((court) => (
                <CourtCard
                  key={court.id}
                  court={court}
                  state={state}
                  nextUpEval={nextUpEval[court.id]}
                  onStartMatch={(courtId, lineup) =>
                    guardAction(() => startMatch(courtId, lineup))
                  }
                  onEndMatch={(courtId, expectedMatchId) =>
                    guardAction(() => endMatch(courtId, expectedMatchId))
                  }
                  onEndAndStartMatch={(courtId, nextLineup, expectedMatchId) =>
                    guardAction(() => endAndStartMatch(courtId, nextLineup, expectedMatchId))
                  }
                  onSuggestNextUp={(courtId) =>
                    guardAction(() => suggestNextUp(courtId))
                  }
                  onSetNextUpSlot={(courtId, slotIndex, playerId) =>
                    guardAction(() => setNextUpSlot(courtId, slotIndex, playerId))
                  }
                  onClearNextUp={(courtId) =>
                    guardAction(() => clearNextUp(courtId))
                  }
                  onRearrangeNextUp={(courtId, mode) =>
                    guardAction(() => rearrangeNextUp(courtId, mode))
                  }
                  onSwapPlayers={(courtId, target, slot1, slot2, baseLineup) =>
                    guardAction(() => swapPlayers(courtId, target, slot1, slot2, baseLineup))
                  }
                  onUpdateCourt={(courtId, updates) =>
                    guardAction(() => updateCourt(courtId, updates))
                  }
                  onSnoozeAutoSingles={(courtId, minutes) =>
                    guardAction(() => snoozeAutoSingles(courtId, minutes))
                  }
                  onResumePlayer={(pId) =>
                    guardAction(() => resumePlayer(pId))
                  }
                  onEditRank={(id, rank) =>
                    guardAction(() => editRank(id, rank))
                  }
                  onTriggerUndoToast={(msg) => setUndoToastMessage(msg)}
                  onShowWarningToast={(msg) => setWarningToastMessage(msg)}
                />
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: HÀNG CHỜ */}
        {activeTab === 'queue' && (
          <QueueTab
            players={players}
            courts={courts}
            maleBonus={settings.maleBonus}
            onAddPlayer={(data) => guardAction(() => addPlayer(data))}
            onAddPlayers={(list) => guardAction(() => addPlayers(list))}
            onPausePlayer={(id) => guardAction(() => pausePlayer(id))}
            onResumePlayer={(id) => guardAction(() => resumePlayer(id))}
            onEditRank={(id, rank) => guardAction(() => editRank(id, rank))}
            onUpdatePlayer={(player) => guardAction(() => updatePlayer(player))}
            onRemovePlayer={(id) => guardAction(() => removePlayer(id))}
          />
        )}

        {/* TAB 3: LUẬT CẶP */}
        {activeTab === 'rules' && (
          <PairRulesTab
            pairRules={pairRules}
            players={players}
            ruleConflicts={ruleConflicts}
            onAddRule={(r) => guardAction(() => addPairRule(r))}
            onRemoveRule={(id) => guardAction(() => removePairRule(id))}
          />
        )}

        {/* TAB 4: LỊCH SỬ */}
        {activeTab === 'history' && (
          <HistoryTab
            history={history}
            players={players}
            onDeleteMatch={(id) => guardAction(() => deleteHistoryMatch(id))}
          />
        )}

        {/* TAB 5: TÍNH TIỀN */}
        {activeTab === 'settlement' && (
          <SettlementTab
            players={players}
            history={history}
            stats={stats}
            currentState={state}
            onExportJson={exportSession}
            onImportJson={(json) => {
              if (role === 'VIEWER') {
                guardAction(() => importSession(json));
                return { ok: false, error: 'Cần mã PIN Host để nhập dữ liệu!' };
              }
              return importSession(json);
            }}
            onNewSessionKeepPlayers={() => guardAction(newSessionKeepPlayers)}
            onResetSession={() => guardAction(resetSession)}
          />
        )}
      </main>

      {/* 3. TOAST HOÀN TÁC & TOAST CẢNH BÁO */}
      {undoToastMessage && (
        <UndoToast
          message={undoToastMessage}
          onUndo={undo}
          onClose={() => setUndoToastMessage(null)}
        />
      )}
      {warningToastMessage && (
        <InfoToast
          message={warningToastMessage}
          type="warning"
          onClose={() => setWarningToastMessage(null)}
        />
      )}

      {/* 4. FIXED BOTTOM NAVIGATION */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        waitingCount={waitingCount}
        conflictCount={ruleConflicts.length}
      />

      {/* 5. CLOUD ROOM REALTIME MODAL */}
      <CloudRoomModal
        isOpen={showCloudModal}
        onClose={() => setShowCloudModal(false)}
        roomCode={roomCode}
        pinCode={pinCode}
        role={role}
        syncStatus={syncStatus}
        errorMessage={cloudError}
        currentState={state}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onLeaveRoom={leaveRoom}
        onUpgradeToCoHost={upgradeToCoHost}
      />
    </div>
  );
}

export default App;
