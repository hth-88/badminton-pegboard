import React, { useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Link2,
  Lock,
  Radio,
  ShieldCheck,
  Unplug,
  Users,
} from 'lucide-react';
import type { Player } from '../../types/badminton';
import type { ResolvedUiPermissions, SessionRoomRole } from '../../types/schedule';
import type { useClubSchedule } from '../../hooks/useClubSchedule';
import { StatusPill, UiEmptyState } from '../ui/Primitives';

export interface ScheduleViewProps {
  schedule: ReturnType<typeof useClubSchedule>;
  uiPermissions: ResolvedUiPermissions;
  roomCode: string | null;
  roomRole: SessionRoomRole;
  sessionPlayers: Player[];
  onJoinLiveRoom: (targetRoomCode: string) => Promise<void> | void;
  onPushPlayersToQueue: (
    playersToPush: Array<
      Omit<
        Player,
        'gamesPlayed' | 'virtualGamesOffset' | 'waitStreak' | 'lastPlayedAt' | 'singlesCount'
      >
    >
  ) => void;
  onShowToast?: (message: string) => void;
}

/**
 * Placeholder gọn cho Tab "Lịch tuần & Chốt sân" ở Phase 3.
 * Đã kết nối đầy đủ state/actions từ useClubSchedule, Permission Matrix và Room Bridge
 * để sang Phase 4 lắp giao diện Lưới 17 kíp + Heatmap & Chốt sân trực tiếp.
 */
export const ScheduleView: React.FC<ScheduleViewProps> = ({
  schedule,
  uiPermissions,
  roomCode,
  sessionPlayers,
  onJoinLiveRoom,
  onShowToast,
}) => {
  const [clubCodeInput, setClubCodeInput] = useState(schedule.clubCode ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    clubCode,
    club,
    weekKey,
    durationHours,
    selectedMember,
    activeMembers,
    submissionSummary,
    goldenSlots,
    twoShiftSuggestions,
    syncState,
    errorMessage,
    connectClub,
    disconnectClub,
  } = schedule;

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
    setIsSubmitting(true);
    try {
      const res = await connectClub(trimmed);
      if (!res.error && res.data) {
        onShowToast?.(`Đã kết nối CLB "${res.data.name}" (${res.data.clubCode})`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[880px] mx-auto px-4 md:px-6 pt-4 pb-28 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2
              className="text-[20px] font-bold tracking-[-0.02em]"
              style={{ color: 'var(--text-primary)' }}
            >
              Lịch tuần & Chốt sân
            </h2>
            <StatusPill tone="accent">
              <span className="font-mono-tabular">{weekKey}</span>
            </StatusPill>
            {isWeekLocked && (
              <StatusPill tone="warning">
                <Lock className="w-3 h-3 mr-1 inline-block" />
                Đã khóa tuần
              </StatusPill>
            )}
          </div>
          <p
            className="text-[14px] mt-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Gom lịch bận 7 ngày × 17 kíp, tìm khung giờ vàng và chốt danh sách vào sân
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill tone={uiPermissions.clubRole === 'CLUB_HOST' ? 'accent' : 'neutral'}>
            <ShieldCheck className="w-3.5 h-3.5 mr-1 inline-block" />
            <span>{roleLabel}</span>
          </StatusPill>
        </div>
      </div>

      {/* Kết nối mã CLB nhanh (?club=CODE) */}
      <div className="ui-card p-4 md:p-5 space-y-4">
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
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="submit"
              disabled={isSubmitting || !clubCodeInput.trim()}
              className="ui-btn ui-btn-primary px-4 rounded-full flex-1 sm:flex-initial"
            >
              <Link2 className="w-4 h-4 shrink-0" />
              <span>{syncState === 'LOADING' || isSubmitting ? 'Đang tải...' : 'Kết nối CLB'}</span>
            </button>
            {clubCode && (
              <button
                type="button"
                onClick={() => {
                  disconnectClub();
                  setClubCodeInput('');
                  onShowToast?.('Đã ngắt kết nối CLB trên thiết bị này.');
                }}
                className="ui-btn ui-btn-secondary px-3.5"
                title="Ngắt kết nối CLB (không ảnh hưởng phòng đánh hiện tại)"
              >
                <Unplug className="w-4 h-4 shrink-0" />
                <span>Ngắt CLB</span>
              </button>
            )}
          </div>
        </form>

        {errorMessage && (
          <div className="ui-banner-danger px-3.5 py-2.5 text-[14px]">
            {errorMessage}
          </div>
        )}

        {club ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            <div className="ui-tile px-3.5 py-3">
              <div className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Câu lạc bộ
              </div>
              <div
                className="text-[15px] font-bold truncate mt-0.5"
                style={{ color: 'var(--text-primary)' }}
                title={`${club.name} (${club.clubCode})`}
              >
                {club.name}
              </div>
              <div
                className="text-[12px] font-mono-tabular"
                style={{ color: 'var(--color-accent)' }}
              >
                ?club={club.clubCode}
              </div>
            </div>

            <div className="ui-tile px-3.5 py-3">
              <div className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Đã nộp lịch
              </div>
              <div
                className="text-[15px] font-bold tabular-nums mt-0.5"
                style={{ color: 'var(--text-primary)' }}
              >
                {submissionSummary.submittedCount}/{submissionSummary.totalActiveCount} người
              </div>
              <div className="text-[12px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {activeMembers.length} thành viên hoạt động
              </div>
            </div>

            <div className="ui-tile px-3.5 py-3">
              <div className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Gợi ý ({durationHours}h)
              </div>
              <div
                className="text-[15px] font-bold tabular-nums mt-0.5"
                style={{ color: 'var(--text-primary)' }}
              >
                {goldenSlots.length} khung giờ vàng
              </div>
              <div className="text-[12px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {twoShiftSuggestions.length} phương án chia 2 ca
              </div>
            </div>

            <div className="ui-tile px-3.5 py-3">
              <div className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Phiên hiện tại
              </div>
              <div
                className="text-[15px] font-bold tabular-nums mt-0.5"
                style={{ color: 'var(--text-primary)' }}
              >
                {sessionPlayers.length} người trong hàng chờ
              </div>
              <div className="text-[12px] font-mono-tabular" style={{ color: 'var(--text-secondary)' }}>
                {roomCode ? `Phòng: ${roomCode}` : 'Chế độ máy đơn'}
              </div>
            </div>
          </div>
        ) : (
          <UiEmptyState
            icon={<CalendarDays className="w-6 h-6" />}
            title={clubCode ? `Đang kiểm tra CLB "${clubCode}"...` : 'Chưa kết nối Câu lạc bộ'}
            description="Nhập mã CLB hoặc mở qua đường dẫn ?club=MA_CLB để đồng bộ lịch tuần của nhóm."
          />
        )}

        {/* Danh sách phòng LIVE của CLB ngay trong tab Lịch tuần */}
        {liveRooms.length > 0 && (
          <div className="ui-banner-accent px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
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
                        <span>Mở sân {lr.label || lr.roomCode}</span>
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

      {/* Trạng thái chờ lắp UI Lưới Lịch & Heatmap ở Phase 4 */}
      <div className="ui-card p-5 flex items-start gap-3.5">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
          }}
        >
          <CalendarDays className="w-5 h-5" />
        </div>
        <div className="space-y-1 min-w-0">
          <h3
            className="text-[16px] font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            Sẵn sàng cho Phase 4 (Lịch của tôi & Heatmap chốt sân)
          </h3>
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            Định tuyến <code className="font-mono-tabular">?club=</code>, tách biệt vòng đời phòng đánh và ma trận phân quyền đã hoạt động đầy đủ. Giao diện tô lịch 1 chạm và Heatmap gợi ý chia ca sẽ hiển thị tại khung này ở bước tiếp theo.
          </p>
        </div>
      </div>
    </div>
  );
};
