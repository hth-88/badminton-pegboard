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
import { UiModal } from './components/ui/Primitives';
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

  // Tự động rời khỏi mọi tab không dành cho VIEWER (chỉ cho phép Sân & Hàng chờ)
  useEffect(() => {
    if (role === 'VIEWER' && activeTab !== 'courts' && activeTab !== 'queue') {
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
    <div className="ui-app-shell flex flex-col select-none antialiased">
      {/* BANNER DỮ LIỆU HỎNG (Mục F — ẩn với VIEWER) */}
      {role !== 'VIEWER' && (corruptStatus === 'CORRUPT_BACKED_UP' || corruptStatus === 'CORRUPT_NO_BACKUP') && (
        <div
          className="px-4 py-2.5 border-b ui-divider sticky top-0 z-50"
          style={{
            backgroundColor: 'var(--color-danger-soft)',
            color: 'var(--color-danger)',
          }}
        >
          <div className="ui-container flex items-center justify-between gap-3 text-[14px]">
            <span className="truncate font-medium">
              {corruptStatus === 'CORRUPT_BACKED_UP'
                ? 'Phát hiện dữ liệu cũ bị hỏng, đã sao lưu. Bấm để xuất bản sao'
                : 'Phát hiện dữ liệu cũ bị hỏng, không thể tạo bản sao lưu.'}
            </span>
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
                  className="ui-btn ui-btn-danger min-h-[36px] px-3 text-[13px] rounded-full"
                >
                  Xuất bản sao
                </button>
              )}
              <button
                type="button"
                onClick={() => setCorruptStatus('OK')}
                className="ui-btn ui-btn-secondary min-h-[36px] px-3 text-[13px] rounded-full"
              >
                Bỏ qua
              </button>
            </div>
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
        <div
          className="border-b ui-divider px-4 py-2 sticky top-[61px] z-20 ui-header"
        >
          <div className="ui-container flex items-center justify-between gap-3 text-[13px]">
            <div
              className="flex items-center gap-2 flex-1 min-w-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Eye
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-accent)' }}
              />
              <span className="truncate">
                Chế độ <strong style={{ color: 'var(--text-primary)' }}>Chỉ xem</strong> · Phòng{' '}
                <strong
                  className="font-mono-tabular"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {roomCode}
                </strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPinPrompt(true)}
              className="ui-btn ui-btn-secondary min-h-[36px] px-3 rounded-full text-[13px] shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Nhập PIN Host</span>
            </button>
          </div>
        </div>
      )}

      {/* QUICK PIN PROMPT MODAL FOR VIEWER ACTION GUARD */}
      <UiModal
        isOpen={showPinPrompt}
        onClose={() => {
          setShowPinPrompt(false);
          setUpgradePinInput('');
          setPinError(null);
        }}
        maxWidthClass="max-w-sm"
        title={
          <span className="inline-flex items-center gap-2">
            <Lock
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--color-accent)' }}
            />
            <span>Mở khóa quyền Co-Host</span>
          </span>
        }
      >
        <div className="space-y-4">
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            Bạn đang ở chế độ <strong style={{ color: 'var(--text-primary)' }}>Chỉ xem</strong> phòng{' '}
            <strong className="font-mono-tabular" style={{ color: 'var(--text-primary)' }}>
              {roomCode}
            </strong>
            . Nhập mã PIN từ chủ phòng để mở quyền điều hành.
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
              className="ui-input text-center font-mono-tabular font-bold text-[18px] tracking-widest"
            />

            {pinError && (
              <p
                className="text-[13px] font-medium text-center"
                style={{ color: 'var(--color-danger)' }}
              >
                {pinError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowPinPrompt(false);
                  setUpgradePinInput('');
                  setPinError(null);
                }}
                className="ui-btn ui-btn-secondary flex-1"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="ui-btn ui-btn-primary flex-1 rounded-full"
              >
                Mở khóa
              </button>
            </div>
          </form>
        </div>
      </UiModal>

      {/* 2. MAIN CONTENT TABS */}
      <main className="relative z-10 flex-1 ui-container">
        <div key={activeTab} className="ui-tab-enter">
          {/* TAB 1: SÂN (Màn hình điều khiển chính) */}
          {activeTab === 'courts' && (
            <div className="px-4 md:px-6 pt-4 pb-28">
              {/* Apple Minimalist Segmented Court Switcher */}
              {courts.length >= 2 && (
                <div
                  ref={courtSegRef}
                  role="tablist"
                  aria-label="Lọc sân"
                  className="ui-segmented-track flex items-center mb-5 overflow-x-auto no-scrollbar max-w-xl"
                >
                  {courtPill.ready && (
                    <div
                      aria-hidden="true"
                      className="ui-segmented-thumb"
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
                    role="tab"
                    aria-selected={selectedCourtFilter === 'ALL'}
                    onClick={() => setSelectedCourtFilter('ALL')}
                    className="relative z-10 flex-1 min-w-[84px] min-h-[44px] px-3 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
                    style={{
                      color:
                        selectedCourtFilter === 'ALL'
                          ? 'var(--text-primary)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    <span>Tất cả</span>
                    <span className="text-[12px] tabular-nums opacity-70">
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
                        role="tab"
                        aria-selected={active}
                        onClick={() => setSelectedCourtFilter(c.id)}
                        className="relative z-10 flex-1 min-w-[84px] min-h-[44px] px-3 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
                        style={{
                          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: isPlaying
                              ? 'var(--color-accent)'
                              : 'var(--text-muted)',
                            opacity: isPlaying ? 1 : 0.4,
                          }}
                        />
                        <span className="truncate">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div
                className={`grid gap-4 lg:gap-5 items-stretch ${
                  selectedCourtFilter === 'ALL'
                    ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                    : 'grid-cols-1 max-w-lg mx-auto'
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
          )}

          {/* TAB 3: LUẬT CẶP (Ẩn hoàn toàn với VIEWER) */}
          {activeTab === 'rules' && role !== 'VIEWER' && (
            <PairRulesTab
              pairRules={pairRules}
              players={players}
              ruleConflicts={ruleConflicts}
              isViewer={false}
              onRequestUpgrade={() => setShowPinPrompt(true)}
              onAddRule={(r) => guardAction(() => addPairRule(r))}
              onRemoveRule={(id) => guardAction(() => removePairRule(id))}
            />
          )}

          {/* TAB 4: LỊCH SỬ (Ẩn hoàn toàn với VIEWER) */}
          {activeTab === 'history' && role !== 'VIEWER' && (
            <HistoryTab
              history={history}
              players={players}
              isViewer={false}
              onEditMatchResult={(m) =>
                guardAction(() =>
                  setPostMatchModalState({ matchId: m.id, mode: 'EDIT_HISTORY' })
                )
              }
              onDeleteMatch={(id) => guardAction(() => deleteHistoryMatch(id))}
            />
          )}

          {/* TAB 5: TÍNH TIỀN (Ẩn hoàn toàn với VIEWER) */}
          {activeTab === 'settlement' && role !== 'VIEWER' && (
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
              onImportJson={(json) => importSession(json)}
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
          )}
        </div>
      </main>

      {/* 3. TOAST HOÀN TÁC (ẩn với VIEWER), THÔNG BÁO HỆ THỐNG & CẢNH BÁO */}
      {undoToastMessage && role !== 'VIEWER' && (
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

      {/* 6. POST-MATCH QUICK REVIEW & BET MODAL (ẩn với VIEWER) */}
      <PostMatchModal
        isOpen={role !== 'VIEWER' && Boolean(postMatchModalState)}
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
