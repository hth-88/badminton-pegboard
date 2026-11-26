import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Flame,
  KeyRound,
  Link2,
  Lock,
  PlusCircle,
  Radio,
  ShieldCheck,
  Unplug,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  getIsoWeekKeyFromDate,
  shiftIsoWeekKey,
} from '../../engine/scheduleEngine';
import type { useClubSchedule } from '../../hooks/useClubSchedule';
import type { Player } from '../../types/badminton';
import type {
  HeatmapSlot,
  ResolvedUiPermissions,
  SessionRoomRole,
  WeekKey,
} from '../../types/schedule';
import { vibrateSuccess, vibrateWarning } from '../../utils/vibrate';
import { StatusPill, UiEmptyState, UiModal } from '../ui/Primitives';
import { ClubHostPanel } from './ClubHostPanel';
import {
  FinalizeBookingSheet,
  type CreateClubRoomBookingPayload,
} from './FinalizeBookingSheet';
import { MyScheduleEditor } from './MyScheduleEditor';
import { ScheduleHeatmap } from './ScheduleHeatmap';
import {
  formatWeekKeyDisplay,
  type FinalizeQueueActionOptions,
  type NewQueuePlayerPayload,
} from './scheduleUiHelpers';

export interface ScheduleViewProps {
  schedule: ReturnType<typeof useClubSchedule>;
  uiPermissions: ResolvedUiPermissions;
  roomCode: string | null;
  roomRole: SessionRoomRole;
  sessionPlayers: Player[];
  maleBonus?: number;
  onJoinLiveRoom: (targetRoomCode: string) => Promise<void> | void;
  onPushPlayersToQueue: (
    playersToPush: NewQueuePlayerPayload[],
    options?: FinalizeQueueActionOptions
  ) => void;
  onResetAndPushPlayersToQueue: (
    playersToPush: NewQueuePlayerPayload[],
    options?: FinalizeQueueActionOptions
  ) => void;
  onCreateClubRoomWithPlayers: (
    payload: CreateClubRoomBookingPayload
  ) => Promise<{ ok: boolean; error?: string }>;
  onShowToast?: (message: string) => void;
}

export type ScheduleMainMode = 'my_schedule' | 'heatmap';

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  schedule,
  uiPermissions,
  roomCode,
  roomRole,
  sessionPlayers,
  maleBonus = 1.5,
  onJoinLiveRoom,
  onPushPlayersToQueue,
  onResetAndPushPlayersToQueue,
  onCreateClubRoomWithPlayers,
  onShowToast,
}) => {
  const {
    clubCode,
    club,
    weekKey,
    selectedMember,
    submissionSummary,
    syncState,
    errorMessage,
    connectClub,
    createNewClub,
    disconnectClub,
    selectWeek,
    unlockHostRole,
  } = schedule;

  const [activeMode, setActiveMode] = useState<ScheduleMainMode>('my_schedule');
  const [connectTab, setConnectTab] = useState<'JOIN' | 'CREATE'>('JOIN');

  // Form kết nối CLB sẵn có
  const [clubCodeInput, setClubCodeInput] = useState(clubCode ?? '');
  const [isConnecting, setIsConnecting] = useState(false);

  // Form tạo CLB mới
  const [newClubCode, setNewClubCode] = useState('');
  const [newClubName, setNewClubName] = useState('');
  const [newClubHostPin, setNewClubHostPin] = useState('');
  const [migrateLocalOnCreate, setMigrateLocalOnCreate] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  // Copy link ?club=CODE
  const [copiedClubLink, setCopiedClubLink] = useState(false);

  // Modal mở khóa quyền Host CLB
  const [showHostPinModal, setShowHostPinModal] = useState(false);
  const [hostPinInput, setHostPinInput] = useState('');
  const [hostPinError, setHostPinError] = useState<string | null>(null);
  const [isVerifyingHost, setIsVerifyingHost] = useState(false);

  // Bottom Sheet Chốt kèo
  const [selectedBookingState, setSelectedBookingState] = useState<{
    slot: HeatmapSlot;
    preselectedMemberIds?: readonly string[];
    shiftLabel?: string;
  } | null>(null);

  const [currentIsoWeek] = useState(() => getIsoWeekKeyFromDate(new Date()));
  const [lastIsoWeekRefState, setLastIsoWeekRefState] = useState<`${number}-W${string}`>(() =>
    weekKey !== 'FIXED' ? weekKey : currentIsoWeek
  );
  if (weekKey !== 'FIXED' && weekKey !== lastIsoWeekRefState) {
    setLastIsoWeekRefState(weekKey);
  }

  const weekDisplay = useMemo(() => formatWeekKeyDisplay(weekKey), [weekKey]);
  const isWeekLocked = Boolean(club?.lockedWeeks?.includes(weekKey));
  const liveRooms = club?.activeRooms ?? [];

  const roleLabel =
    uiPermissions.clubRole === 'CLUB_HOST'
      ? 'Quản trị CLB'
      : uiPermissions.clubRole === 'CLUB_MEMBER' && selectedMember
        ? `Thành viên · ${selectedMember.name}`
        : 'Khách xem lịch';

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = clubCodeInput.trim().toUpperCase();
    if (!trimmed) return;
    setIsConnecting(true);
    try {
      const res = await connectClub(trimmed);
      if (!res.error && res.data) {
        vibrateSuccess();
        onShowToast?.(`Đã kết nối CLB "${res.data.name}" (${res.data.clubCode})`);
      } else {
        vibrateWarning();
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCreateClubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = newClubCode.trim().toUpperCase();
    const cleanName = newClubName.trim();
    const cleanPin = newClubHostPin.trim();
    setCreateError(null);

    if (!/^[A-Z0-9_-]{3,32}$/.test(cleanCode)) {
      setCreateError('Mã CLB từ 3–32 ký tự (chỉ dùng chữ không dấu, số, gạch ngang/dưới).');
      return;
    }
    if (!cleanName) {
      setCreateError('Vui lòng nhập tên Câu lạc bộ.');
      return;
    }
    if (cleanPin.length < 4 || cleanPin.length > 32) {
      setCreateError('Mã PIN Quản trị CLB phải từ 4 ký tự trở lên.');
      return;
    }

    setIsConnecting(true);
    try {
      const res = await createNewClub({
        clubCode: cleanCode,
        name: cleanName,
        hostPin: cleanPin,
        autoMigrateLocalRoster: migrateLocalOnCreate,
      });
      if (res.error || !res.data) {
        vibrateWarning();
        setCreateError(res.error ?? 'Không thể tạo CLB mới.');
        return;
      }
      vibrateSuccess();
      setNewClubCode('');
      setNewClubName('');
      setNewClubHostPin('');
      onShowToast?.(`Đã tạo CLB "${res.data.club.name}" (?club=${res.data.club.clubCode})!`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCopyClubLink = async () => {
    if (!club) return;
    const base =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : '';
    const link = `${base}?club=${encodeURIComponent(club.clubCode)}`;
    try {
      await navigator.clipboard.writeText(link);
      vibrateSuccess();
      setCopiedClubLink(true);
      setTimeout(() => setCopiedClubLink(false), 2000);
      onShowToast?.('Đã sao chép đường dẫn mời thành viên báo lịch!');
    } catch {
      onShowToast?.(`Đường dẫn CLB: ${link}`);
    }
  };

  const handleShiftWeek = (delta: number) => {
    const baseWeek = weekKey === 'FIXED' ? lastIsoWeekRefState : weekKey;
    const shifted = shiftIsoWeekKey(baseWeek, delta);
    if (shifted) {
      void selectWeek(shifted);
    }
  };

  const handleUnlockHostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostPinInput.trim()) return;
    setIsVerifyingHost(true);
    setHostPinError(null);
    try {
      const res = await unlockHostRole(hostPinInput.trim());
      if (res.data !== true) {
        vibrateWarning();
        setHostPinError(res.error ?? 'Mã PIN Quản trị CLB không đúng.');
        return;
      }
      vibrateSuccess();
      setHostPinInput('');
      setShowHostPinModal(false);
      onShowToast?.('Đã mở khóa quyền Quản trị CLB (CLUB_HOST)!');
    } finally {
      setIsVerifyingHost(false);
    }
  };

  return (
    <div className="max-w-[920px] mx-auto px-4 md:px-6 pt-4 pb-28 space-y-4">
      {/* Header định danh màn hình */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              className="text-[20px] font-bold tracking-[-0.02em]"
              style={{ color: 'var(--text-primary)' }}
            >
              {club ? club.name : 'Lịch tuần & Chốt sân'}
            </h2>
            {club && (
              <StatusPill tone="accent">
                <span className="font-mono-tabular">?club={club.clubCode}</span>
              </StatusPill>
            )}
            {isWeekLocked && (
              <StatusPill tone="warning">
                <Lock className="w-3 h-3" />
                <span>Đã khóa tuần</span>
              </StatusPill>
            )}
          </div>
          <p
            className="text-[14px] mt-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            Gom lịch bận 7 ngày × 17 kíp, tìm khung giờ vàng và chốt người vào Hàng chờ
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill tone={uiPermissions.clubRole === 'CLUB_HOST' ? 'accent' : 'neutral'}>
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{roleLabel}</span>
          </StatusPill>

          {club && uiPermissions.clubRole !== 'CLUB_HOST' && (
            <button
              type="button"
              onClick={() => {
                setHostPinInput('');
                setHostPinError(null);
                setShowHostPinModal(true);
              }}
              className="ui-btn ui-btn-secondary px-3.5"
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Mở quyền Host</span>
            </button>
          )}
        </div>
      </div>

      {/* TRẠNG THÁI CHƯA KẾT NỐI CLB */}
      {!club ? (
        <>
          <div className="ui-card p-4 md:p-5 space-y-4">
            <div
              role="tablist"
              aria-label="Kết nối hoặc tạo CLB"
              className="ui-segmented-track grid grid-cols-2 gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={connectTab === 'JOIN'}
                onClick={() => setConnectTab('JOIN')}
                className="min-h-[44px] rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-colors"
                style={{
                  backgroundColor:
                    connectTab === 'JOIN' ? 'var(--bg-surface-elevated)' : 'transparent',
                  color:
                    connectTab === 'JOIN' ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <Link2 className="w-4 h-4 shrink-0" />
                <span>Vào CLB sẵn có</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={connectTab === 'CREATE'}
                onClick={() => setConnectTab('CREATE')}
                className="min-h-[44px] rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-colors"
                style={{
                  backgroundColor:
                    connectTab === 'CREATE' ? 'var(--bg-surface-elevated)' : 'transparent',
                  color:
                    connectTab === 'CREATE' ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>Tạo CLB mới</span>
              </button>
            </div>

            {connectTab === 'JOIN' ? (
              <form
                onSubmit={handleConnectSubmit}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
              >
                <div className="flex-1">
                  <label htmlFor="schedule-club-code-input" className="sr-only">
                    Mã câu lạc bộ
                  </label>
                  <input
                    id="schedule-club-code-input"
                    type="text"
                    value={clubCodeInput}
                    onChange={(e) => setClubCodeInput(e.target.value.toUpperCase())}
                    placeholder="Nhập mã CLB (VD: CAULONG-BK)..."
                    className="ui-input font-mono-tabular uppercase"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isConnecting || !clubCodeInput.trim()}
                  className="ui-btn ui-btn-primary px-5 rounded-full shrink-0"
                >
                  <Link2 className="w-4 h-4 shrink-0" />
                  <span>
                    {syncState === 'LOADING' || isConnecting ? 'Đang kết nối...' : 'Kết nối CLB'}
                  </span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleCreateClubSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="create-club-code"
                      className="block text-[14px] font-semibold mb-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Mã CLB (dùng trên link ?club=)
                    </label>
                    <input
                      id="create-club-code"
                      type="text"
                      maxLength={32}
                      value={newClubCode}
                      onChange={(e) =>
                        setNewClubCode(
                          e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
                        )
                      }
                      placeholder="VD: CAULONG-BK"
                      className="ui-input font-mono-tabular uppercase"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="create-club-name"
                      className="block text-[14px] font-semibold mb-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Tên Câu lạc bộ
                    </label>
                    <input
                      id="create-club-name"
                      type="text"
                      maxLength={80}
                      value={newClubName}
                      onChange={(e) => setNewClubName(e.target.value)}
                      placeholder="VD: CLB Cầu Lông Bách Khoa"
                      className="ui-input"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="create-club-pin"
                    className="block text-[14px] font-semibold mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Mã PIN Quản trị CLB (tối thiểu 4 ký tự)
                  </label>
                  <input
                    id="create-club-pin"
                    type="password"
                    maxLength={32}
                    value={newClubHostPin}
                    onChange={(e) => setNewClubHostPin(e.target.value)}
                    placeholder="Dùng cho Host khóa tuần, sửa trình & chốt sân..."
                    className="ui-input font-mono-tabular"
                  />
                </div>

                <label className="ui-tile px-3.5 py-3 min-h-[48px] flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-[14px]" style={{ color: 'var(--text-primary)' }}>
                    Đồng bộ sẵn Sổ thành viên CLB đang lưu trên máy này lên Cloud
                  </span>
                  <input
                    type="checkbox"
                    checked={migrateLocalOnCreate}
                    onChange={(e) => setMigrateLocalOnCreate(e.target.checked)}
                    className="ui-checkbox w-5 h-5 shrink-0"
                  />
                </label>

                {createError && (
                  <div className="ui-banner-danger px-3.5 py-2.5 text-[14px]">
                    {createError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isConnecting}
                  className="ui-btn ui-btn-primary rounded-full px-6 w-full sm:w-auto"
                >
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>{isConnecting ? 'Đang khởi tạo...' : 'Khởi tạo CLB mới'}</span>
                </button>
              </form>
            )}

            {errorMessage && connectTab === 'JOIN' && (
              <div className="ui-banner-danger px-3.5 py-2.5 text-[14px]">
                {errorMessage}
              </div>
            )}
          </div>

          <UiEmptyState
            icon={<CalendarDays className="w-6 h-6" />}
            title={
              clubCode && syncState === 'LOADING'
                ? `Đang tải dữ liệu CLB "${clubCode}"...`
                : 'Kết nối CLB để gom lịch rảnh cả nhóm'
            }
            description="Mỗi thành viên tự quét giờ bận trong 10 giây trên điện thoại, Host nhìn Heatmap chốt ngay ca đông nhất vào Hàng chờ."
          />
        </>
      ) : (
        /* TRẠNG THÁI ĐÃ KẾT NỐI CLB */
        <>
          {/* Thanh điều hướng Tuần lịch + Chia sẻ link CLB + Phòng LIVE */}
          <div className="ui-card p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              {/* Bộ chuyển tuần */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleShiftWeek(-1)}
                  aria-label="Tuần trước"
                  className="ui-icon-btn w-11 h-11"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="ui-tile px-3.5 py-1.5 min-h-[44px] flex flex-col justify-center">
                  <span
                    className="text-[14px] font-bold font-mono-tabular leading-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {weekDisplay.title}
                  </span>
                  {weekDisplay.dateSublabel && (
                    <span
                      className="text-[12px] tabular-nums leading-tight"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {weekDisplay.dateSublabel}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleShiftWeek(1)}
                  aria-label="Tuần kế tiếp"
                  className="ui-icon-btn w-11 h-11"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {weekKey !== currentIsoWeek && (
                  <button
                    type="button"
                    onClick={() => {
                      void selectWeek(currentIsoWeek);
                    }}
                    className="ui-btn ui-btn-secondary px-3 text-[14px]"
                  >
                    Tuần này
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const nextTarget: WeekKey =
                      weekKey === 'FIXED' ? lastIsoWeekRefState : 'FIXED';
                    void selectWeek(nextTarget);
                  }}
                  className={`ui-btn px-3 text-[14px] ${
                    weekKey === 'FIXED' ? 'ui-btn-accent-soft' : 'ui-btn-secondary'
                  }`}
                >
                  {weekKey === 'FIXED' ? 'Quay lại tuần cụ thể' : 'Mẫu FIXED'}
                </button>
              </div>

              {/* Chia sẻ link mời & Ngắt CLB */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyClubLink();
                  }}
                  className="ui-btn ui-btn-secondary px-3.5"
                >
                  {copiedClubLink ? (
                    <>
                      <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
                      <span>Đã chép link</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 shrink-0" />
                      <span>Copy link mời</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    disconnectClub();
                    setClubCodeInput('');
                    onShowToast?.('Đã ngắt kết nối CLB trên thiết bị này.');
                  }}
                  title="Ngắt kết nối CLB (không ảnh hưởng phòng đánh hiện tại)"
                  className="ui-btn ui-btn-ghost px-3"
                >
                  <Unplug className="w-4 h-4 shrink-0" />
                  <span>Đổi CLB</span>
                </button>
              </div>
            </div>

            {/* Banner phòng LIVE ngay trong tab Lịch tuần (nếu có) */}
            {liveRooms.length > 0 && (
              <div className="ui-banner-accent px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Radio className="w-4 h-4 shrink-0" />
                  <span className="text-[14px] font-semibold truncate">
                    CLB đang có {liveRooms.length} sân LIVE hoạt động
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {liveRooms.map((lr) => {
                    const isJoined = roomCode === lr.roomCode;
                    return (
                      <button
                        key={lr.roomCode}
                        type="button"
                        onClick={() => onJoinLiveRoom(lr.roomCode)}
                        className={`ui-btn px-3.5 rounded-full text-[14px] ${
                          isJoined ? 'ui-btn-secondary' : 'ui-btn-primary'
                        }`}
                      >
                        {isJoined ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>Mở {lr.label || lr.roomCode}</span>
                          </>
                        ) : (
                          <>
                            <Users className="w-4 h-4 shrink-0" />
                            <span>Vào {lr.label || lr.roomCode}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Segmented Control 2 chế độ chính: Lịch của tôi | Tổng hợp & Chốt sân */}
          <div
            role="tablist"
            aria-label="Chế độ xem Lịch tuần"
            className="ui-segmented-track grid grid-cols-2 gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'my_schedule'}
              onClick={() => setActiveMode('my_schedule')}
              className="min-h-[46px] px-3 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-colors"
              style={{
                backgroundColor:
                  activeMode === 'my_schedule'
                    ? 'var(--bg-surface-elevated)'
                    : 'transparent',
                color:
                  activeMode === 'my_schedule'
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                boxShadow: activeMode === 'my_schedule' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              <UserCheck
                className="w-4 h-4 shrink-0"
                style={{
                  color:
                    activeMode === 'my_schedule'
                      ? 'var(--color-accent)'
                      : 'var(--text-secondary)',
                }}
              />
              <span>Lịch của tôi</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'heatmap'}
              onClick={() => setActiveMode('heatmap')}
              className="min-h-[46px] px-3 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-colors"
              style={{
                backgroundColor:
                  activeMode === 'heatmap'
                    ? 'var(--bg-surface-elevated)'
                    : 'transparent',
                color:
                  activeMode === 'heatmap'
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                boxShadow: activeMode === 'heatmap' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              <Flame
                className="w-4 h-4 shrink-0"
                style={{
                  color:
                    activeMode === 'heatmap'
                      ? 'var(--color-accent)'
                      : 'var(--text-secondary)',
                }}
              />
              <span>Tổng hợp & Chốt sân</span>
              <span
                className="text-[12px] tabular-nums px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'var(--color-accent-soft)',
                  color: 'var(--color-accent)',
                }}
              >
                {submissionSummary.submittedCount}/{submissionSummary.totalActiveCount}
              </span>
            </button>
          </div>

          {/* Nội dung Chế độ 1 hoặc Chế độ 2 */}
          {activeMode === 'my_schedule' ? (
            <MyScheduleEditor
              schedule={schedule}
              uiPermissions={uiPermissions}
              onShowToast={onShowToast}
            />
          ) : (
            <ScheduleHeatmap
              schedule={schedule}
              onSelectHeatmapSlot={(slot, preselectedMemberIds, shiftLabel) =>
                setSelectedBookingState({ slot, preselectedMemberIds, shiftLabel })
              }
            />
          )}

          {/* Bảng điều khiển gọn cho CLUB_HOST */}
          <ClubHostPanel
            schedule={schedule}
            uiPermissions={uiPermissions}
            maleBonus={maleBonus}
            onShowToast={onShowToast}
          />

          {/* Bottom Sheet Chốt kèo & Đưa vào Hàng chờ */}
          <FinalizeBookingSheet
            slot={selectedBookingState?.slot ?? null}
            preselectedMemberIds={selectedBookingState?.preselectedMemberIds}
            shiftLabel={selectedBookingState?.shiftLabel}
            onClose={() => setSelectedBookingState(null)}
            schedule={schedule}
            uiPermissions={uiPermissions}
            roomCode={roomCode}
            roomRole={roomRole}
            sessionPlayers={sessionPlayers}
            maleBonus={maleBonus}
            onPushPlayersToQueue={onPushPlayersToQueue}
            onResetAndPushPlayersToQueue={onResetAndPushPlayersToQueue}
            onCreateClubRoomWithPlayers={onCreateClubRoomWithPlayers}
            onShowToast={onShowToast}
          />
        </>
      )}

      {/* Modal nhập PIN Host CLB */}
      <UiModal
        isOpen={showHostPinModal}
        onClose={() => {
          setShowHostPinModal(false);
          setHostPinInput('');
          setHostPinError(null);
        }}
        maxWidthClass="max-w-sm"
        title="Mở quyền Quản trị CLB (Host)"
        subtitle={club ? club.name : undefined}
      >
        <form onSubmit={handleUnlockHostSubmit} className="space-y-4">
          <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
            Nhập mã PIN Quản trị CLB để khóa/mở tuần, sửa trình độ thành viên và chốt kèo vào Hàng chờ.
          </p>

          <input
            type="password"
            maxLength={32}
            autoFocus
            value={hostPinInput}
            onChange={(e) => {
              setHostPinInput(e.target.value);
              setHostPinError(null);
            }}
            placeholder="Nhập mã PIN Host CLB..."
            className="ui-input font-mono-tabular text-center text-[18px] tracking-widest font-bold"
          />

          {hostPinError && (
            <div className="ui-banner-danger px-3.5 py-2.5 text-[14px]">{hostPinError}</div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowHostPinModal(false);
                setHostPinInput('');
                setHostPinError(null);
              }}
              className="ui-btn ui-btn-secondary flex-1"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isVerifyingHost || !hostPinInput.trim()}
              className="ui-btn ui-btn-primary rounded-full flex-1"
            >
              {isVerifyingHost ? 'Đang kiểm tra...' : 'Mở khóa'}
            </button>
          </div>
        </form>
      </UiModal>
    </div>
  );
};
