import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBadmintonSession } from './engine/useBadmintonSession';
import { useTheme } from './hooks/useTheme';
import { useWakeLock } from './hooks/useWakeLock';
import { useCloudRoom, type RoomRole } from './hooks/useCloudRoom';
import { useClubSchedule } from './hooks/useClubSchedule';
import { useSettlementState } from './hooks/useSettlementState';
import type { CloudSettlementData } from './engine/settlement';
import { normalizeClubCode } from './services/clubScheduleSync';
import { getCachedCloudClubMembers } from './engine/clubRosterStorage';
import {
  resolveClubUrlInitialTab,
  resolveUiPermissions,
} from './types/schedule';
import { Header } from './components/Header';
import { BottomNav, type NavTab } from './components/BottomNav';
import { CourtCard } from './components/CourtCard';
import { QueueTab } from './components/QueueTab';
import { HistoryTab } from './components/HistoryTab';
import { SettlementTab } from './components/SettlementTab';
import { ScheduleView } from './components/schedule/ScheduleView';
import type { CreateClubRoomBookingPayload } from './components/schedule/FinalizeBookingSheet';
import {
  buildFreshSessionFromPayloads,
  buildFreshSessionWithPlayers,
  buildFreshSettlementForNewRoom,
} from './components/schedule/scheduleUiHelpers';
import { vibrateSuccess } from './utils/vibrate';
import { CloudRoomModal } from './components/CloudRoomModal';
import { PostMatchModal } from './components/PostMatchModal';
import { savePrivateMatchReview } from './engine/matchFeedbackStorage';
import type { BadmintonRank, Lineup, MatchHistory, Sex } from './types/badminton';
import { InfoToast, UndoToast } from './components/Toast';
import { UiModal } from './components/ui/Primitives';
import { ArrowRight, Eye, KeyRound, Lock, Radio } from 'lucide-react';
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

  const [userSelectedTab, setUserSelectedTab] = useState<NavTab | null>(null);
  const [autoClubInitialTab, setAutoClubInitialTab] = useState<NavTab | null>(null);
  const [initialUrlEntry] = useState(() => {
    if (typeof window === 'undefined') {
      return { hasClubParam: false, hasRoomParam: false };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      hasClubParam: Boolean(normalizeClubCode(params.get('club'))),
      hasRoomParam: Boolean(params.get('room')?.trim()),
    };
  });

  const handleSelectTab = useCallback((nextTab: NavTab) => {
    setUserSelectedTab(nextTab);
  }, []);
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
  const [pendingEndAction, setPendingEndAction] = useState<{
    kind: 'END_ONLY' | 'END_AND_START';
    courtId: string;
    expectedMatchId?: string;
    nextLineup?: Lineup;
    previewMatch: MatchHistory;
  } | null>(null);

  const buildPreviewMatchFromCourt = (
    courtId: string,
    currentMatch: NonNullable<typeof courts[number]['currentMatch']>
  ): MatchHistory => ({
    id: currentMatch.id || `preview-${courtId}`,
    courtId,
    type: currentMatch.type,
    team1: [...currentMatch.team1],
    team2: [...currentMatch.team2],
    slotSource: { ...currentMatch.slotSource },
    startedAt: currentMatch.startedAt,
    endedAt: Date.now(),
    durationMinutes: Math.max(
      1,
      Math.round((Date.now() - currentMatch.startedAt) / 60000)
    ),
    bet: currentMatch.bet,
  });

  const executePendingEnd = (action: NonNullable<typeof pendingEndAction>): string | null => {
    if (action.kind === 'END_AND_START' && action.nextLineup) {
      return endAndStartMatch(action.courtId, action.nextLineup, action.expectedMatchId);
    }
    return endMatch(action.courtId, action.expectedMatchId);
  };

  const {
    settlementData,
    updateSettlementSettings,
    toggleApprovePayment,
    rejectPendingPayment,
    toggleBetPaid,
    resetPaymentsForNewSession,
    applyCloudSettlement,
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
    grantHostFromClub,
    downgradeToViewer,
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

  const clubSchedule = useClubSchedule();

  const isCurrentWeekLocked = Boolean(
    clubSchedule.club?.lockedWeeks?.includes(clubSchedule.weekKey)
  );

  const uiPermissions = useMemo(
    () =>
      resolveUiPermissions({
        roomRole: role,
        clubRole: clubSchedule.role,
        clubSettings: clubSchedule.club?.settings,
        isCurrentWeekLocked,
      }),
    [role, clubSchedule.role, clubSchedule.club?.settings, isCurrentWeekLocked]
  );

  // Host CLB đã mở khóa → tự có quyền Host Sân trên mọi phòng gắn CLB đó (không nhập lại PIN phòng).
  const isRoomAttachedToClub = Boolean(
    roomCode && clubSchedule.club?.activeRooms?.some((r) => r.roomCode === roomCode)
  );
  const autoHostAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    if (clubSchedule.role !== 'CLUB_HOST' || role !== 'VIEWER' || !roomCode || !isRoomAttachedToClub) {
      autoHostAttemptRef.current = null;
      return;
    }
    if (autoHostAttemptRef.current === roomCode) return;
    autoHostAttemptRef.current = roomCode;
    void grantHostFromClub();
  }, [clubSchedule.role, role, roomCode, isRoomAttachedToClub, grantHostFromClub]);

  // Nút "Chuyển sang chế độ Xem": hạ xuống VIEWER + xóa cache PIN, KHÔNG leaveRoom/disconnectClub
  const handleSwitchToViewMode = useCallback(() => {
    downgradeToViewer();
    clubSchedule.lockHostRole();
    setInfoToastMessage('Đã chuyển sang chế độ Xem. Nhập PIN để điều khiển lại.');
  }, [downgradeToViewer, clubSchedule]);

  // Đổi CLB / rời CLB khi Hàng chờ còn người của CLB cũ → hỏi Làm mới hoặc Giữ nguyên
  const [trackedClubCode, setTrackedClubCode] = useState<string | null>(clubSchedule.clubCode);
  const [clubSwitchPrompt, setClubSwitchPrompt] = useState<{
    fromCode: string;
    toCode: string | null;
    playerIds: string[];
  } | null>(null);
  if ((clubSchedule.clubCode ?? null) !== trackedClubCode) {
    const prevCode = trackedClubCode;
    setTrackedClubCode(clubSchedule.clubCode ?? null);
    if (prevCode) {
      const oldNames = new Set(
        getCachedCloudClubMembers(prevCode)
          .filter((m) => m.isActive !== false)
          .map((m) => m.name.trim().toLowerCase())
      );
      const stalePlayerIds = players
        .filter((p) => oldNames.has(p.name.trim().toLowerCase()))
        .map((p) => p.id);
      if (stalePlayerIds.length > 0) {
        setClubSwitchPrompt({
          fromCode: prevCode,
          toCode: clubSchedule.clubCode ?? null,
          playerIds: stalePlayerIds,
        });
      }
    }
  }

  const handleRefreshQueueAfterClubSwitch = () => {
    if (!clubSwitchPrompt) return;
    const playingIds = new Set<string>();
    for (const c of courts) {
      if (c.isActive && c.currentMatch) {
        c.currentMatch.team1.forEach((id) => playingIds.add(id));
        c.currentMatch.team2.forEach((id) => playingIds.add(id));
      }
    }
    const removable = clubSwitchPrompt.playerIds.filter((id) => !playingIds.has(id));
    const skipped = clubSwitchPrompt.playerIds.length - removable.length;
    guardAction(() => {
      if (removable.length > 0) removePlayers(removable);
    });
    setClubSwitchPrompt(null);
    setInfoToastMessage(
      skipped > 0
        ? `Đã làm mới Hàng chờ (giữ lại ${skipped} người đang thi đấu trên sân).`
        : 'Đã làm mới Hàng chờ.'
    );
  };

  // Sổ CLB ↔ Lịch tuần dùng chung nguồn club_members (RPC)
  const handleAddClubMember = useCallback(
    async (params: {
      name: string;
      gender: Sex;
      rank: BadmintonRank;
      noSingles?: boolean;
    }): Promise<{ ok: boolean; error?: string }> => {
      const res = await clubSchedule.registerMember(params);
      return res.data && !res.error ? { ok: true } : { ok: false, error: res.error ?? undefined };
    },
    [clubSchedule]
  );

  const handleDeleteClubMember = useCallback(
    async (memberId: string): Promise<{ ok: boolean; error?: string }> => {
      const res = await clubSchedule.deleteMemberAsHost({ memberId, hardDelete: false });
      return res.data === true ? { ok: true } : { ok: false, error: res.error ?? undefined };
    },
    [clubSchedule]
  );

  const handleUpdateClubMemberRank = useCallback(
    async (
      memberId: string,
      rank: BadmintonRank
    ): Promise<{ ok: boolean; error?: string }> => {
      const res = await clubSchedule.updateMemberAsHost({ memberId, rank });
      return res.data && !res.error ? { ok: true } : { ok: false, error: res.error ?? undefined };
    },
    [clubSchedule]
  );

  // Tự động mở tab Lịch tuần CHỈ KHI vào qua ?club=CODE (không có ?room=) mà CLB chưa có sân LIVE
  if (
    userSelectedTab === null &&
    autoClubInitialTab === null &&
    initialUrlEntry.hasClubParam &&
    !initialUrlEntry.hasRoomParam &&
    clubSchedule.syncState !== 'LOADING'
  ) {
    setAutoClubInitialTab(
      resolveClubUrlInitialTab({
        hasClubParam: initialUrlEntry.hasClubParam,
        hasRoomParam: initialUrlEntry.hasRoomParam,
        activeRoomsCount: clubSchedule.club?.activeRooms?.length ?? 0,
      })
    );
  }

  const unjoinedClubLiveRooms = useMemo(() => {
    const activeRooms = clubSchedule.club?.activeRooms ?? [];
    return activeRooms.filter((r) => r.roomCode && r.roomCode !== roomCode);
  }, [clubSchedule.club?.activeRooms, roomCode]);

  const handleJoinClubLiveRoom = useCallback(
    async (targetRoomCode: string) => {
      const clean = targetRoomCode.trim().toUpperCase();
      if (!clean) return;
      if (roomCode === clean) {
        handleSelectTab('courts');
        return;
      }
      const res = await joinRoom(clean);
      if (res.ok) {
        handleSelectTab('courts');
      } else if (res.error) {
        setWarningToastMessage(res.error);
      }
    },
    [roomCode, joinRoom, handleSelectTab]
  );

  const handleCreateClubRoomWithPlayers = useCallback(
    async (
      payload: CreateClubRoomBookingPayload
    ): Promise<{ ok: boolean; error?: string }> => {
      const now = Date.now();
      const cleanCode = payload.newRoomCode.trim().toUpperCase();
      const freshSession = buildFreshSessionWithPlayers(
        payload.selectedMembers,
        settings,
        now,
        courts
      );
      const freshSettlement = buildFreshSettlementForNewRoom(settlementData, now);

      const roomRes = await createRoom(
        cleanCode,
        payload.newRoomPin,
        freshSession,
        freshSettlement
      );
      if (!roomRes.ok) {
        return { ok: false, error: roomRes.error };
      }

      loadCloudState(freshSession);
      resetPaymentsForNewSession();

      const attachRes = await clubSchedule.attachActiveRoomAsHost({
        roomCode: cleanCode,
        label: payload.roomLabel,
        weekKey: payload.weekKey,
        dayOfWeek: payload.dayOfWeek,
        startHour: payload.startHour,
        durationHours: payload.durationHours,
      });

      handleSelectTab('queue');
      if (attachRes.error) {
        setWarningToastMessage(
          `Đã tạo phòng "${cleanCode}", nhưng chưa ghim được lên banner CLB: ${attachRes.error}`
        );
      } else {
        setInfoToastMessage(
          `Đã tạo phòng LIVE "${cleanCode}" gắn với CLB và nạp ${payload.selectedMembers.length} người vào Hàng chờ!`
        );
      }
      return { ok: true };
    },
    [
      settings,
      courts,
      settlementData,
      createRoom,
      loadCloudState,
      resetPaymentsForNewSession,
      clubSchedule,
      handleSelectTab,
    ]
  );

  const clubRosterSyncKey = useMemo(
    () =>
      `${clubSchedule.clubCode ?? 'LOCAL'}:${clubSchedule.members
        .map((m) => `${m.id}:${m.updatedAt}:${m.isActive ? 1 : 0}`)
        .join(',')}:${Object.entries(clubSchedule.privateMetaMap)
        .map(([id, meta]) => `${id}:${meta.updatedAt}`)
        .join(',')}`,
    [clubSchedule.clubCode, clubSchedule.members, clubSchedule.privateMetaMap]
  );

  // Cả Host và VIEWER đều có đủ 5 tab trên BottomNav (mặc định Sân)
  const effectiveTab: NavTab = userSelectedTab ?? autoClubInitialTab ?? 'courts';

  useLayoutEffect(() => {
    if (effectiveTab !== 'courts') return;
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
  }, [effectiveTab, measureCourtPill, courts.length]);

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
          navigator.clipboard.writeText(jsonStr).catch(() => { });
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
        clubRole={clubSchedule.role}
        onSwitchToViewMode={handleSwitchToViewMode}
      />

      {/* VIEWER NOTICE BANNER */}
      {uiPermissions.isRoomViewer && roomCode && (
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

      {/* CLUB LIVE ROOM BANNER (1 chạm nhảy vào phòng đánh của CLB) */}
      {unjoinedClubLiveRooms.length > 0 && clubSchedule.club && (
        <div
          className="border-b px-4 py-2.5 z-20"
          style={{
            backgroundColor: 'var(--color-accent-soft)',
            borderColor: 'var(--color-accent-border)',
          }}
        >
          <div className="ui-container flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div
              className="flex items-center gap-2.5 min-w-0 text-[14px]"
              style={{ color: 'var(--text-primary)' }}
            >
              <Radio
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-accent)' }}
              />
              <span className="truncate">
                <strong>{clubSchedule.club.name}</strong> đang có sân LIVE:{' '}
                <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                  {unjoinedClubLiveRooms.map((r) => r.label || r.roomCode).join(' · ')}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {unjoinedClubLiveRooms.map((liveRoom) => (
                <button
                  key={liveRoom.roomCode}
                  type="button"
                  onClick={() => {
                    void handleJoinClubLiveRoom(liveRoom.roomCode);
                  }}
                  className="ui-btn ui-btn-primary px-4 rounded-full text-[14px]"
                >
                  <span>
                    {unjoinedClubLiveRooms.length === 1
                      ? 'Vào sân LIVE'
                      : `Vào ${liveRoom.label || liveRoom.roomCode}`}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              ))}
            </div>
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
        <div key={effectiveTab} className="ui-tab-enter">
          {/* TAB 0: LỊCH TUẦN & CHỐT SÂN */}
          {effectiveTab === 'schedule' && (
            <ScheduleView
              schedule={clubSchedule}
              uiPermissions={uiPermissions}
              roomCode={roomCode}
              roomRole={role}
              sessionPlayers={players}
              maleBonus={settings.maleBonus}
              onJoinLiveRoom={handleJoinClubLiveRoom}
              onPushPlayersToQueue={(playersToPush, opts) =>
                guardAction(() => {
                  addPlayers(playersToPush);
                  if (roomCode && opts?.attachRoomMeta) {
                    void clubSchedule
                      .attachActiveRoomAsHost({
                        ...opts.attachRoomMeta,
                        roomCode,
                      })
                      .then((res) => {
                        if (res.error) {
                          setWarningToastMessage(
                            `Đã nạp vào Hàng chờ, nhưng chưa ghim được banner CLB: ${res.error}`
                          );
                        }
                      });
                  }
                  vibrateSuccess();
                  if (opts?.successToast) {
                    handleCloudToast(opts.successToast);
                  }
                  handleSelectTab('queue');
                })
              }
              onResetAndPushPlayersToQueue={(playersToPush, opts) =>
                guardAction(() => {
                  const fresh = buildFreshSessionFromPayloads(
                    playersToPush,
                    settings,
                    Date.now(),
                    courts
                  );
                  loadCloudState(fresh);
                  resetPaymentsForNewSession();
                  if (roomCode) {
                    deleteRoomReceipts(roomCode).catch(() => {});
                    if (opts?.attachRoomMeta) {
                      void clubSchedule
                        .attachActiveRoomAsHost({
                          ...opts.attachRoomMeta,
                          roomCode,
                        })
                        .then((res) => {
                          if (res.error) {
                            setWarningToastMessage(
                              `Đã làm mới buổi đánh, nhưng chưa ghim được banner CLB: ${res.error}`
                            );
                          }
                        });
                    }
                  }
                  vibrateSuccess();
                  if (opts?.successToast) {
                    handleCloudToast(opts.successToast);
                  }
                  handleSelectTab('queue');
                })
              }
              onCreateClubRoomWithPlayers={handleCreateClubRoomWithPlayers}
              onShowToast={handleCloudToast}
            />
          )}

          {/* TAB 1: SÂN (Màn hình điều khiển chính) */}
          {effectiveTab === 'courts' && (
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
                    className="relative z-10 flex-1 min-h-[44px] px-2 sm:px-3.5 rounded-xl text-[13px] sm:text-[14px] font-semibold flex items-center justify-center gap-1 whitespace-nowrap transition-colors shrink-0"
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
                        className="relative z-10 flex-1 min-h-[44px] px-2 sm:px-3.5 rounded-xl text-[13px] sm:text-[14px] font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors shrink-0"
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
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div
                className={`grid gap-4 lg:gap-5 items-stretch md:auto-rows-fr ${selectedCourtFilter === 'ALL'
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
                        if (
                          target?.currentMatch &&
                          (settings.promptPostMatchReview !== false || hadLiveBet)
                        ) {
                          setPendingEndAction({
                            kind: 'END_ONLY',
                            courtId,
                            expectedMatchId,
                            previewMatch: buildPreviewMatchFromCourt(
                              courtId,
                              target.currentMatch
                            ),
                          });
                          return;
                        }
                        endMatch(courtId, expectedMatchId);
                      })
                    }
                    onEndAndStartMatch={(courtId, nextLineup, expectedMatchId) =>
                      guardAction(() => {
                        const target = courts.find((c) => c.id === courtId);
                        const hadLiveBet = Boolean(target?.currentMatch?.bet);
                        if (
                          target?.currentMatch &&
                          (settings.promptPostMatchReview !== false || hadLiveBet)
                        ) {
                          setPendingEndAction({
                            kind: 'END_AND_START',
                            courtId,
                            expectedMatchId,
                            nextLineup,
                            previewMatch: buildPreviewMatchFromCourt(
                              courtId,
                              target.currentMatch
                            ),
                          });
                          return;
                        }
                        endAndStartMatch(courtId, nextLineup, expectedMatchId);
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

          {/* TAB 2: HÀNG CHỜ (Tích hợp sub-tab Danh sách chờ | Luật cặp) */}
          {effectiveTab === 'queue' && (
            <QueueTab
              players={players}
              courts={courts}
              maleBonus={settings.maleBonus}
              isViewer={uiPermissions.isRoomViewer}
              onAddPlayer={(data) => guardAction(() => addPlayer(data))}
              onAddPlayers={(list) => guardAction(() => addPlayers(list))}
              onPausePlayer={(id) => guardAction(() => pausePlayer(id))}
              onPausePlayers={(ids) => guardAction(() => pausePlayers(ids))}
              onResumePlayer={(id) => guardAction(() => resumePlayer(id))}
              onEditRank={(id, rank) => guardAction(() => editRank(id, rank))}
              onUpdatePlayer={(player) => guardAction(() => updatePlayer(player))}
              onRemovePlayer={(id) => guardAction(() => removePlayer(id))}
              onRemovePlayers={(ids) => guardAction(() => removePlayers(ids))}
              pairRules={pairRules}
              ruleConflicts={ruleConflicts}
              onRequestUpgrade={() => setShowPinPrompt(true)}
              onAddRule={(r) => guardAction(() => addPairRule(r))}
              onRemoveRule={(id) => guardAction(() => removePairRule(id))}
              clubRosterSyncKey={clubRosterSyncKey}
              clubCode={clubSchedule.clubCode}
              isClubHost={clubSchedule.role === 'CLUB_HOST'}
              onAddClubMember={handleAddClubMember}
              onDeleteClubMember={handleDeleteClubMember}
              onUpdateClubMemberRank={handleUpdateClubMemberRank}
            />
          )}

          {/* TAB 4: LỊCH SỬ */}
          {effectiveTab === 'history' && (
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
          )}

          {/* TAB 5: TÍNH TIỀN */}
          {effectiveTab === 'settlement' && (
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
                    deleteReceiptFiles([receiptPath]).catch(() => { });
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
                    deleteRoomReceipts(roomCode).catch(() => { });
                  }
                })
              }
              onResetSession={() =>
                guardAction(() => {
                  resetSession();
                  resetPaymentsForNewSession();
                  if (roomCode) {
                    deleteRoomReceipts(roomCode).catch(() => { });
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
        activeTab={effectiveTab}
        onSelectTab={handleSelectTab}
        waitingCount={waitingCount}
        conflictCount={ruleConflicts.length}
        pendingPaymentsCount={pendingPaymentsCount}
        isViewer={uiPermissions.isRoomViewer}
      />

      {/* 4b. HỘP THOẠI ĐỔI / RỜI CLB KHI HÀNG CHỜ CÒN NGƯỜI CỦA CLB CŨ */}
      <UiModal
        isOpen={clubSwitchPrompt !== null}
        onClose={() => setClubSwitchPrompt(null)}
        maxWidthClass="max-w-sm"
        title="Hàng chờ còn người của CLB cũ"
        footer={
          <>
            <button
              type="button"
              onClick={() => setClubSwitchPrompt(null)}
              className="ui-btn ui-btn-secondary px-4"
            >
              Giữ nguyên
            </button>
            <button
              type="button"
              onClick={handleRefreshQueueAfterClubSwitch}
              className="ui-btn ui-btn-primary px-5 rounded-full"
            >
              Làm mới Hàng chờ
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Bạn vừa {clubSwitchPrompt?.toCode ? 'chuyển sang CLB' : 'rời CLB'}{' '}
          {clubSwitchPrompt?.toCode ? (
            <strong style={{ color: 'var(--text-primary)' }}>{clubSwitchPrompt.toCode}</strong>
          ) : (
            <strong style={{ color: 'var(--text-primary)' }}>{clubSwitchPrompt?.fromCode}</strong>
          )}
          , nhưng Hàng chờ đang có{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {clubSwitchPrompt?.playerIds.length ?? 0} người
          </strong>{' '}
          của CLB <strong>{clubSwitchPrompt?.fromCode}</strong>. Bạn muốn làm mới Hàng chờ hay giữ nguyên?
        </p>
      </UiModal>

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
          leaveRoom();
        }}
        onUpgradeToCoHost={upgradeToCoHost}
        onUpdateRoomPin={updateRoomPin}
      />

      {/* 6. POST-MATCH QUICK REVIEW & BET MODAL (ẩn với VIEWER) */}
      <PostMatchModal
        isOpen={role !== 'VIEWER' && Boolean(pendingEndAction || postMatchModalState)}
        match={
          pendingEndAction
            ? pendingEndAction.previewMatch
            : postMatchModalState
              ? history.find((h) => h.id === postMatchModalState.matchId) ?? null
              : null
        }
        players={players}
        mode={pendingEndAction ? 'POST_MATCH' : postMatchModalState?.mode || 'POST_MATCH'}
        isViewer={role === 'VIEWER'}
        onCancel={() => {
          setPendingEndAction(null);
          setPostMatchModalState(null);
        }}
        onSave={(result) => {
          if (pendingEndAction) {
            const endedId = executePendingEnd(pendingEndAction);
            if (endedId) {
              updateMatchResult({ ...result, matchId: endedId });
              if (result.playerFeedback) {
                savePrivateMatchReview(endedId, result.playerFeedback);
              }
            }
            setPendingEndAction(null);
          } else {
            updateMatchResult(result);
            setPostMatchModalState(null);
          }
        }}
        onSkipOrClose={() => {
          if (pendingEndAction) {
            executePendingEnd(pendingEndAction);
            setPendingEndAction(null);
          } else {
            setPostMatchModalState(null);
          }
        }}
      />
    </div>
  );
}

export default App;
