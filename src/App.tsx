import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBadmintonSession } from './engine/useBadmintonSession';
import { useTheme } from './hooks/useTheme';
import { useWakeLock } from './hooks/useWakeLock';
import { useCloudRoom, type RoomRole } from './hooks/useCloudRoom';
import { useSettlementState } from './hooks/useSettlementState';
import type { CloudSettlementData } from './engine/settlement';
import { Header } from './components/Header';
import { BottomNav, type NavTab } from './components/BottomNav';
import { CourtCard } from './components/CourtCard';
import { QueueTab } from './components/QueueTab';
import { PairRulesTab } from './components/PairRulesTab';
import { HistoryTab } from './components/HistoryTab';
import { SettlementTab } from './components/SettlementTab';
import { CloudRoomModal } from './components/CloudRoomModal';
import { PostMatchModal } from './components/PostMatchModal';
import { InfoToast, UndoToast } from './components/Toast';
import { Eye, KeyRound, Lock } from 'lucide-react';
import {
  deleteReceiptFiles,
  deleteRoomReceipts,
} from './services/supabaseSync';
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
    toggleNextUpType,
    rearrangeNextUp,
    pausePlayer,
    pausePlayers,
    resumePlayer,
    addPlayer,
    addPlayers,
    updatePlayer,
    removePlayer,
    removePlayers,
    editRank,
    updateCourt,
    addPairRule,
    removePairRule,
    updateSettings,
    snoozeAutoSingles,
    deleteHistoryMatch,
    setCourtBet,
    updateMatchResult,
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
  const [infoToastMessage, setInfoToastMessage] = useState<string | null>(null);
  const [warningToastMessage, setWarningToastMessage] = useState<string | null>(null);
  const [corruptStatus, setCorruptStatus] = useState<LoadStatus>(() => getLastLoadStatus());

  // Lucian sliding glass pill measurement for Court Switcher
  const courtSegRef = useRef<HTMLDivElement | null>(null);
  const courtBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [courtPill, setCourtPill] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const measureCourtPill = useCallback(() => {
    const track = courtSegRef.current;
    const btn = courtBtnRefs.current[selectedCourtFilter];
    if (!track || !btn) return;
    const tRect = track.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setCourtPill({
      left: bRect.left - tRect.left + track.scrollLeft,
      width: bRect.width,
      ready: true,
    });
  }, [selectedCourtFilter]);

  useLayoutEffect(() => {
    if (activeTab !== 'courts') return;
    measureCourtPill();
    const track = courtSegRef.current;
    if (!track) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureCourtPill) : null;
    ro?.observe(track);
    window.addEventListener('resize', measureCourtPill);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measureCourtPill);
    };
  }, [activeTab, measureCourtPill, courts.length]);

  const handleCloudToast = useCallback((msg: string) => {
    setInfoToastMessage(msg);
  }, []);

  // Cloud Room state
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [upgradePinInput, setUpgradePinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [postMatchModalState, setPostMatchModalState] = useState<{
    matchId: string;
    mode: 'POST_MATCH' | 'EDIT_HISTORY';
  } | null>(null);

  const {
    settlementData,
    updateSettlementSettings,
    toggleApprovePayment,
    rejectPendingPayment,
    toggleBetPaid,
    resetPaymentsForNewSession,
    applyCloudSettlement,
    reloadLocalSettlement,
  } = useSettlementState();

  const handleApplyCloudSettlement = useCallback(
    (remoteData: CloudSettlementData, assignedRole: RoomRole) => {
      applyCloudSettlement(remoteData, assignedRole !== 'VIEWER');
    },
    [applyCloudSettlement]
  );

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
    reportPlayerPayment,
    updateRoomPin,
  } = useCloudRoom({
    currentState: state,
    onApplyCloudState: loadCloudState,
    onShowToast: handleCloudToast,
    currentSettlement: settlementData,
    onApplyCloudSettlement: handleApplyCloudSettlement,
  });

  // Tự động rời khỏi tab Luật cặp nếu đang ở chế độ Chỉ xem (VIEWER)
  useEffect(() => {
    if (role === 'VIEWER' && activeTab === 'rules') {
      setActiveTab('courts');
    }
  }, [role, activeTab]);

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

  // Số yêu cầu chuyển khoản đang chờ Host duyệt
  const pendingPaymentsCount = useMemo(() => {
    return Object.values(settlementData.payments).filter(
      (rec) => rec?.status === 'PENDING_REVIEW'
    ).length;
  }, [settlementData.payments]);

  return (
    <div className="vo-app-shell flex flex-col select-none antialiased">
      {/* BANNER DỮ LIỆU HỎNG (Mục F) */}
      {(corruptStatus === 'CORRUPT_BACKED_UP' || corruptStatus === 'CORRUPT_NO_BACKUP') && (
        <div className="bg-rose-900 border-b border-rose-700 text-rose-100 px-4 py-2 text-xs flex items-center justify-between gap-3 sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="truncate">
              {corruptStatus === 'CORRUPT_BACKED_UP'
                ? 'Phát hiện dữ liệu cũ bị hỏng, đã sao lưu. Bấm để xuất bản sao'
                : 'Phát hiện dữ liệu cũ bị hỏng, không thể tạo bản sao lưu.'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {corruptStatus === 'CORRUPT_BACKED_UP' && (
              <button
                type="button"
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
              type="button"
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
        promptPostMatchReview={settings.promptPostMatchReview !== false}
        onTogglePromptPostMatchReview={(enabled) =>
          guardAction(() => updateSettings({ promptPostMatchReview: enabled }))
        }
        roomCode={roomCode}
        pinCode={pinCode}
        role={role}
        syncStatus={syncStatus}
        onOpenCloudModal={() => setShowCloudModal(true)}
      />

      {/* VIEWER NOTICE BANNER */}
      {role === 'VIEWER' && roomCode && (
        <div className="bg-indigo-950/85 border-b border-indigo-800/50 px-4 py-2 text-xs text-indigo-200 flex items-center justify-between gap-3 sticky top-[57px] z-20 backdrop-blur-md">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Eye className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="truncate">
              Chế độ <strong className="text-white">Chỉ Xem</strong> phòng <strong className="text-white">{roomCode}</strong>.
            </span>
          </div>
          <button
            type="button"
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
          <div className="vo-glass-card rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400">
              <Lock className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                Mở khóa quyền Co-Host
              </h3>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Bạn đang ở chế độ <strong>Chỉ Xem</strong> phòng <strong>{roomCode}</strong>. Vui lòng nhập mã PIN do chủ phòng cung cấp để thực hiện thao tác này.
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
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-center font-mono-tabular font-bold text-lg text-white tracking-widest focus:outline-none focus:border-lime-400"
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
                  className="flex-1 py-2.5 vo-btn-subtle rounded-xl text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 vo-cta-lime rounded-xl text-xs font-extrabold"
                >
                  Mở khóa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. MAIN CONTENT TABS */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto">
        <div key={activeTab} className="vo-tab-enter">
          {/* TAB 1: SÂN (Màn hình điều khiển chính) */}
          {activeTab === 'courts' && (
            <div className="p-3.5 md:p-6 pb-28">
              {/* Lucian Sliding Glass Pill Court Switcher */}
              {courts.length >= 2 && (
                <div
                  ref={courtSegRef}
                  role="tablist"
                  aria-label="Lọc sân"
                  className="vo-sliding-track relative flex items-center p-1 rounded-2xl mb-4 overflow-x-auto no-scrollbar max-w-xl"
                >
                  {courtPill.ready && (
                    <div
                      aria-hidden="true"
                      className="vo-sliding-thumb"
                      style={{
                        width: `${courtPill.width}px`,
                        transform: `translate3d(${courtPill.left}px, 0, 0)`,
                      }}
                    />
                  )}
                  <button
                    ref={(el) => {
                      courtBtnRefs.current['ALL'] = el;
                    }}
                    type="button"
                    onClick={() => setSelectedCourtFilter('ALL')}
                    className="relative z-10 flex-1 min-w-[76px] h-9 px-3 rounded-xl text-[13px] font-semibold tracking-[-0.015em] flex items-center justify-center gap-1.5 transition-colors active:scale-95 shrink-0"
                    style={{
                      color:
                        selectedCourtFilter === 'ALL'
                          ? 'var(--text-primary)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    <span>Tất cả</span>
                    <span className="text-[11px] opacity-65 font-mono-tabular">
                      ({courts.length})
                    </span>
                  </button>
                  {courts.map((c) => {
                    const isPlaying = c.currentMatch !== null;
                    const active = selectedCourtFilter === c.id;
                    return (
                      <button
                        key={c.id}
                        ref={(el) => {
                          courtBtnRefs.current[c.id] = el;
                        }}
                        type="button"
                        onClick={() => setSelectedCourtFilter(c.id)}
                        className="relative z-10 flex-1 min-w-[76px] h-9 px-3 rounded-xl text-[13px] font-semibold tracking-[-0.015em] flex items-center justify-center gap-1.5 transition-colors active:scale-95 shrink-0"
                        style={{
                          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{
                            background: isPlaying ? 'var(--accent-lime)' : 'var(--text-muted)',
                            opacity: isPlaying ? 1 : 0.45,
                            boxShadow: isPlaying ? '0 0 8px var(--accent-lime)' : 'none',
                          }}
                        />
                        <span className="truncate">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div
                className={`grid gap-4 items-start ${
                  selectedCourtFilter === 'ALL'
                    ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                    : 'grid-cols-1 max-w-xl mx-auto'
                }`}
              >
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
                      guardAction(() => {
                        const target = courts.find((c) => c.id === courtId);
                        const hadLiveBet = Boolean(target?.currentMatch?.bet);
                        const endedId = endMatch(courtId, expectedMatchId);
                        if (
                          endedId &&
                          (settings.promptPostMatchReview !== false || hadLiveBet)
                        ) {
                          setPostMatchModalState({ matchId: endedId, mode: 'POST_MATCH' });
                        }
                      })
                    }
                    onEndAndStartMatch={(courtId, nextLineup, expectedMatchId) =>
                      guardAction(() => {
                        const target = courts.find((c) => c.id === courtId);
                        const hadLiveBet = Boolean(target?.currentMatch?.bet);
                        const endedId = endAndStartMatch(courtId, nextLineup, expectedMatchId);
                        if (
                          endedId &&
                          (settings.promptPostMatchReview !== false || hadLiveBet)
                        ) {
                          setPostMatchModalState({ matchId: endedId, mode: 'POST_MATCH' });
                        }
                      })
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
                    onToggleNextUpType={(courtId, nextType) =>
                      guardAction(() => toggleNextUpType(courtId, nextType))
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
                    isViewer={role === 'VIEWER'}
                    onSetCourtBet={(courtId, bet) =>
                      guardAction(() => setCourtBet(courtId, bet))
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
            <div className="pb-28">
              <QueueTab
                players={players}
                courts={courts}
                maleBonus={settings.maleBonus}
                isViewer={role === 'VIEWER'}
                onAddPlayer={(data) => guardAction(() => addPlayer(data))}
                onAddPlayers={(list) => guardAction(() => addPlayers(list))}
                onPausePlayer={(id) => guardAction(() => pausePlayer(id))}
                onPausePlayers={(ids) => guardAction(() => pausePlayers(ids))}
                onResumePlayer={(id) => guardAction(() => resumePlayer(id))}
                onEditRank={(id, rank) => guardAction(() => editRank(id, rank))}
                onUpdatePlayer={(player) => guardAction(() => updatePlayer(player))}
                onRemovePlayer={(id) => guardAction(() => removePlayer(id))}
                onRemovePlayers={(ids) => guardAction(() => removePlayers(ids))}
              />
            </div>
          )}

          {/* TAB 3: LUẬT CẶP (Hiển thị đầy đủ cho Host / Co-Host, ẩn với VIEWER) */}
          {activeTab === 'rules' && (
            <div className="pb-28">
              <PairRulesTab
                pairRules={pairRules}
                players={players}
                ruleConflicts={ruleConflicts}
                isViewer={role === 'VIEWER'}
                onRequestUpgrade={() => setShowPinPrompt(true)}
                onAddRule={(r) => guardAction(() => addPairRule(r))}
                onRemoveRule={(id) => guardAction(() => removePairRule(id))}
              />
            </div>
          )}

          {/* TAB 4: LỊCH SỬ */}
          {activeTab === 'history' && (
            <div className="pb-28">
              <HistoryTab
                history={history}
                players={players}
                isViewer={role === 'VIEWER'}
                onEditMatchResult={(m) =>
                  guardAction(() =>
                    setPostMatchModalState({ matchId: m.id, mode: 'EDIT_HISTORY' })
                  )
                }
                onDeleteMatch={(id) => guardAction(() => deleteHistoryMatch(id))}
              />
            </div>
          )}

          {/* TAB 5: TÍNH TIỀN */}
          {activeTab === 'settlement' && (
            <div className="pb-28">
              <SettlementTab
                players={players}
                history={history}
                stats={stats}
                currentState={state}
                role={role}
                roomCode={roomCode}
                settlementData={settlementData}
                onUpdateSettlementSettings={(updates) =>
                  guardAction(() => updateSettlementSettings(updates))
                }
                onToggleApprovePayment={(playerId) =>
                  guardAction(() => toggleApprovePayment(playerId))
                }
                onRejectPendingPayment={(playerId, reason) =>
                  guardAction(() => {
                    const receiptPath = settlementData.payments[playerId]?.receiptPath;
                    if (receiptPath) {
                      deleteReceiptFiles([receiptPath]).catch(() => {});
                    }
                    rejectPendingPayment(playerId, reason);
                  })
                }
                onReportPlayerPayment={reportPlayerPayment}
                onToggleBetPaid={(obligationId) =>
                  guardAction(() => toggleBetPaid(obligationId))
                }
                onQuickEditMatchResult={(m) =>
                  guardAction(() =>
                    setPostMatchModalState({ matchId: m.id, mode: 'EDIT_HISTORY' })
                  )
                }
                maleBonus={settings.maleBonus}
                onEditRank={(id, rank) => guardAction(() => editRank(id, rank))}
                onExportJson={exportSession}
                onImportJson={(json) => {
                  if (role === 'VIEWER') {
                    guardAction(() => importSession(json));
                    return { ok: false, error: 'Cần mã PIN Host để nhập dữ liệu!' };
                  }
                  return importSession(json);
                }}
                onNewSessionKeepPlayers={(totalCost, settlementSnapshot) =>
                  guardAction(() => {
                    newSessionKeepPlayers(totalCost, settlementSnapshot);
                    resetPaymentsForNewSession();
                    if (roomCode) {
                      deleteRoomReceipts(roomCode).catch(() => {});
                    }
                  })
                }
                onResetSession={() =>
                  guardAction(() => {
                    resetSession();
                    resetPaymentsForNewSession();
                    if (roomCode) {
                      deleteRoomReceipts(roomCode).catch(() => {});
                    }
                  })
                }
              />
            </div>
          )}
        </div>
      </main>

      {/* 3. TOAST HOÀN TÁC, THÔNG BÁO HỆ THỐNG & CẢNH BÁO */}
      {undoToastMessage && (
        <UndoToast
          message={undoToastMessage}
          onUndo={undo}
          onClose={() => setUndoToastMessage(null)}
        />
      )}
      {infoToastMessage && (
        <InfoToast
          message={infoToastMessage}
          type="info"
          onClose={() => setInfoToastMessage(null)}
        />
      )}
      {warningToastMessage && (
        <InfoToast
          message={warningToastMessage}
          type="warning"
          onClose={() => setWarningToastMessage(null)}
        />
      )}

      {/* 4. FLOATING GLASS BOTTOM NAVIGATION */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        waitingCount={waitingCount}
        conflictCount={ruleConflicts.length}
        pendingPaymentsCount={pendingPaymentsCount}
        isViewer={role === 'VIEWER'}
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
        onCreateRoom={(code, pin, stateToSync) =>
          createRoom(code, pin, stateToSync, settlementData)
        }
        onJoinRoom={joinRoom}
        onLeaveRoom={() => {
          const wasViewer = role === 'VIEWER';
          leaveRoom();
          if (wasViewer) {
            reloadLocalSettlement();
          }
        }}
        onUpgradeToCoHost={upgradeToCoHost}
        onUpdateRoomPin={updateRoomPin}
      />

      {/* 6. POST-MATCH QUICK REVIEW & BET MODAL */}
      <PostMatchModal
        isOpen={Boolean(postMatchModalState)}
        match={
          postMatchModalState
            ? history.find((h) => h.id === postMatchModalState.matchId) ?? null
            : null
        }
        players={players}
        mode={postMatchModalState?.mode || 'POST_MATCH'}
        isViewer={role === 'VIEWER'}
        onSave={(result) => {
          updateMatchResult(result);
          setPostMatchModalState(null);
        }}
        onSkipOrClose={() => setPostMatchModalState(null)}
      />
    </div>
  );
}

export default App;
