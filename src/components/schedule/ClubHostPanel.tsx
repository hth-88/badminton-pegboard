import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Lock,
  LockOpen,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  XCircle,
} from 'lucide-react';
import {
  CLUB_MEMBER_PRESET_TAGS,
  type ClubMember as MergedRosterMember,
} from '../../engine/clubRosterStorage';
import {
  formatSkillScore,
  getEffectiveSkill,
  ORDERED_RANKS,
  RANK_METADATA,
  stepRankDown,
  stepRankUp,
} from '../../engine/skillConfig';
import type { useClubSchedule } from '../../hooks/useClubSchedule';
import type { BadmintonRank, Sex } from '../../types/badminton';
import type { ResolvedUiPermissions } from '../../types/schedule';
import { vibrateSuccess, vibrateWarning } from '../../utils/vibrate';
import {
  GenderDot,
  GenderToggleButton,
  StatusPill,
  UiModal,
} from '../ui/Primitives';

export interface ClubHostPanelProps {
  schedule: ReturnType<typeof useClubSchedule>;
  uiPermissions: ResolvedUiPermissions;
  maleBonus: number;
  onShowToast?: (message: string) => void;
}

export const ClubHostPanel: React.FC<ClubHostPanelProps> = ({
  schedule,
  uiPermissions,
  maleBonus,
  onShowToast,
}) => {
  const {
    club,
    weekKey,
    rosterWithPrivateMeta,
    lockHostRole,
    toggleWeekLockAsHost,
    updateSettingsAsHost,
    updateMemberAsHost,
    deleteMemberAsHost,
    setMemberPersonalPin,
    copyClubFixedToWeekAsHost,
    detachActiveRoomAsHost,
    migrateLegacyRosterAsHost,
  } = schedule;

  const [isExpanded, setIsExpanded] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

  // Modal chỉnh sửa chi tiết thành viên + Ghi chú kín localStorage
  const [editingMember, setEditingMember] = useState<MergedRosterMember | null>(null);
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState<Sex>('M');
  const [editRank, setEditRank] = useState<BadmintonRank>('tby');
  const [editNoSingles, setEditNoSingles] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);

  const inactiveCount = useMemo(
    () => rosterWithPrivateMeta.filter((m) => m.isActive === false).length,
    [rosterWithPrivateMeta]
  );

  const visibleRoster = useMemo(
    () =>
      showInactive
        ? rosterWithPrivateMeta
        : rosterWithPrivateMeta.filter((m) => m.isActive !== false),
    [rosterWithPrivateMeta, showInactive]
  );

  if (!club || uiPermissions.clubRole !== 'CLUB_HOST') {
    return null;
  }

  const isWeekLocked = club.lockedWeeks.includes(weekKey);
  const allowSelfRegister = club.settings.allowSelfRegister;

  const openEditMemberModal = (member: MergedRosterMember) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditGender(member.sex);
    setEditRank(member.rank);
    setEditNoSingles(Boolean(member.noSingles));
    setEditNotes(member.notes ?? '');
    setEditTags(member.tags ?? []);
  };

  const handleToggleAllowSelfRegister = async () => {
    if (!uiPermissions.canUpdateClubSettings) return;
    setBusyActionKey('SELF_REG');
    setPanelError(null);
    try {
      const nextVal = !allowSelfRegister;
      const res = await updateSettingsAsHost({
        settings: { allowSelfRegister: nextVal },
      });
      if (res.error) {
        vibrateWarning();
        setPanelError(res.error);
        return;
      }
      vibrateSuccess();
      onShowToast?.(
        nextVal
          ? 'Đã bật cho phép thành viên tự thêm tên mới.'
          : 'Đã tắt tự thêm tên mới (chỉ Host mới được thêm).'
      );
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleToggleWeekLock = async () => {
    if (!uiPermissions.canLockOrUnlockWeek) return;
    setBusyActionKey('LOCK_WEEK');
    setPanelError(null);
    try {
      const nextLocked = !isWeekLocked;
      const res = await toggleWeekLockAsHost(nextLocked, weekKey);
      if (res.error) {
        vibrateWarning();
        setPanelError(res.error);
        return;
      }
      vibrateSuccess();
      onShowToast?.(
        nextLocked
          ? `Đã khóa sổ lịch tuần ${weekKey}.`
          : `Đã mở khóa báo lịch tuần ${weekKey}.`
      );
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleStepMemberRank = async (member: MergedRosterMember, dir: 'UP' | 'DOWN') => {
    if (!uiPermissions.canManageClubRoster) return;
    const nextRank = dir === 'UP' ? stepRankUp(member.rank) : stepRankDown(member.rank);
    if (nextRank === member.rank) return;

    setBusyActionKey(`RANK_${member.id}`);
    setPanelError(null);
    try {
      const res = await updateMemberAsHost({
        memberId: member.id,
        rank: nextRank,
      });
      if (res.error) {
        vibrateWarning();
        setPanelError(res.error);
        return;
      }
      vibrateSuccess();
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleHideOrRestoreMember = async (member: MergedRosterMember) => {
    if (!uiPermissions.canDeleteOrHideMember) return;
    setBusyActionKey(`HIDE_${member.id}`);
    setPanelError(null);
    try {
      if (member.isActive === false) {
        const res = await updateMemberAsHost({
          memberId: member.id,
          isActive: true,
        });
        if (res.error) {
          vibrateWarning();
          setPanelError(res.error);
          return;
        }
        vibrateSuccess();
        onShowToast?.(`Đã khôi phục thành viên "${member.name}".`);
      } else {
        const res = await deleteMemberAsHost({
          memberId: member.id,
          hardDelete: false,
        });
        if (res.error) {
          vibrateWarning();
          setPanelError(res.error);
          return;
        }
        vibrateSuccess();
        onShowToast?.(`Đã tạm ẩn "${member.name}" khỏi danh sách báo lịch.`);
      }
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleResetMemberPinAsHost = async (member: MergedRosterMember) => {
    if (!uiPermissions.canResetMemberPin) return;
    setBusyActionKey(`PIN_${member.id}`);
    setPanelError(null);
    try {
      const res = await setMemberPersonalPin({
        memberId: member.id,
        newPin: null,
        resetAsHost: true,
      });
      if (res.error || res.data !== true) {
        vibrateWarning();
        setPanelError(res.error ?? 'Không thể reset PIN thành viên.');
        return;
      }
      vibrateSuccess();
      onShowToast?.(`Đã xóa mã PIN cá nhân cho "${member.name}". Thành viên có thể đặt lại PIN mới.`);
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleSaveEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    const cleanName = editName.trim();
    if (!cleanName) return;

    setBusyActionKey(`SAVE_${editingMember.id}`);
    setPanelError(null);
    try {
      const res = await updateMemberAsHost({
        memberId: editingMember.id,
        name: cleanName,
        gender: editGender,
        rank: editRank,
        noSingles: editNoSingles,
        notes: editNotes.trim(),
        tags: editTags,
      });
      if (res.error) {
        vibrateWarning();
        setPanelError(res.error);
        return;
      }
      vibrateSuccess();
      setEditingMember(null);
      onShowToast?.(`Đã cập nhật thông tin "${cleanName}".`);
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleBulkCopyFixed = async () => {
    setBusyActionKey('BULK_FIXED');
    setPanelError(null);
    try {
      const res = await copyClubFixedToWeekAsHost({
        targetWeekKey: weekKey,
        overwriteExisting: false,
        copyNotes: false,
      });
      if (res.error) {
        vibrateWarning();
        setPanelError(res.error);
        return;
      }
      vibrateSuccess();
      onShowToast?.(
        `Đã chép lịch FIXED cho ${res.appliedCount} người (giữ nguyên ${res.skippedExistingCount} người đã nộp).`
      );
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleSyncLocalRoster = async () => {
    setBusyActionKey('SYNC_LOCAL');
    setPanelError(null);
    try {
      const res = await migrateLegacyRosterAsHost({ force: true });
      if (!res) return;
      vibrateSuccess();
      onShowToast?.(
        res.createdMembers.length > 0
          ? `Đã đồng bộ thêm ${res.createdMembers.length} thành viên từ Sổ CLB trên máy.`
          : 'Tất cả thành viên trong Sổ CLB máy này đã có mặt trên Cloud.'
      );
    } finally {
      setBusyActionKey(null);
    }
  };

  return (
    <div className="ui-card p-4 md:p-5 space-y-4">
      {/* Header gọn của Bảng điều khiển Host */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <h3
            className="text-[16px] font-bold truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            Bảng điều khiển Quản trị CLB
          </h3>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              lockHostRole();
              onShowToast?.('Đã khóa quyền Quản trị CLB trên phiên này.');
            }}
            className="ui-btn ui-btn-ghost px-3 text-[14px]"
          >
            <Lock className="w-4 h-4 shrink-0" />
            <span>Thoát Host</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            aria-expanded={isExpanded}
            className="ui-btn ui-btn-secondary px-3"
          >
            <span>{isExpanded ? 'Thu gọn' : 'Mở rộng'}</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>
        </div>
      </div>

      {panelError && (
        <div className="ui-banner-danger px-3.5 py-2.5 text-[14px]">{panelError}</div>
      )}

      {isExpanded && (
        <div className="space-y-4 pt-1 border-t ui-divider">
          {/* 1. Công tắc cài đặt nhanh */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={busyActionKey === 'SELF_REG'}
              onClick={() => {
                void handleToggleAllowSelfRegister();
              }}
              className="ui-tile ui-tile-interactive px-3.5 py-3 min-h-[54px] flex items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <div
                  className="text-[14px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Thành viên tự thêm tên
                </div>
                <div
                  className="text-[12px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {allowSelfRegister ? 'Đang bật (mọi người tự ghi danh)' : 'Đang tắt (chỉ Host thêm)'}
                </div>
              </div>
              {allowSelfRegister ? (
                <ToggleRight
                  className="w-7 h-7 shrink-0"
                  style={{ color: 'var(--color-accent)' }}
                />
              ) : (
                <ToggleLeft
                  className="w-7 h-7 shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                />
              )}
            </button>

            <button
              type="button"
              disabled={busyActionKey === 'LOCK_WEEK'}
              onClick={() => {
                void handleToggleWeekLock();
              }}
              className="ui-tile ui-tile-interactive px-3.5 py-3 min-h-[54px] flex items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <div
                  className="text-[14px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {isWeekLocked ? `Mở khóa tuần ${weekKey}` : `Khóa sổ tuần ${weekKey}`}
                </div>
                <div
                  className="text-[12px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {isWeekLocked
                    ? 'Đang khóa — thành viên không tự sửa được'
                    : 'Đang mở cho thành viên nộp lịch'}
                </div>
              </div>
              {isWeekLocked ? (
                <Lock className="w-5 h-5 shrink-0" style={{ color: 'var(--color-warning)' }} />
              ) : (
                <LockOpen className="w-5 h-5 shrink-0" style={{ color: 'var(--color-accent)' }} />
              )}
            </button>
          </div>

          {/* Tiện ích đồng bộ lịch FIXED & Sổ CLB */}
          <div className="flex items-center gap-2 flex-wrap">
            {weekKey !== 'FIXED' && (
              <button
                type="button"
                disabled={busyActionKey === 'BULK_FIXED'}
                onClick={() => {
                  void handleBulkCopyFixed();
                }}
                className="ui-btn ui-btn-secondary px-3.5"
              >
                <Copy className="w-4 h-4 shrink-0" />
                <span>Chép FIXED cho người chưa nộp</span>
              </button>
            )}

            <button
              type="button"
              disabled={busyActionKey === 'SYNC_LOCAL'}
              onClick={() => {
                void handleSyncLocalRoster();
              }}
              className="ui-btn ui-btn-secondary px-3.5"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>Nhập từ Sổ CLB máy này</span>
            </button>
          </div>

          {/* Quản lý các phòng LIVE đang ghim trên CLB (nếu có) */}
          {club.activeRooms.length > 0 && (
            <div className="space-y-2">
              <div
                className="text-[14px] font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                Phòng LIVE đang ghim trên CLB ({club.activeRooms.length})
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {club.activeRooms.map((r) => (
                  <div
                    key={r.roomCode}
                    className="ui-tile pl-3.5 pr-1.5 py-1 flex items-center gap-2 min-h-[44px]"
                  >
                    <span className="text-[14px] font-semibold">
                      {r.label} (<span className="font-mono-tabular">{r.roomCode}</span>)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void detachActiveRoomAsHost(r.roomCode).then((res) => {
                          if (!res.error) {
                            onShowToast?.(`Đã gỡ phòng LIVE "${r.roomCode}" khỏi CLB.`);
                          }
                        });
                      }}
                      aria-label={`Gỡ phòng LIVE ${r.roomCode}`}
                      className="ui-icon-btn w-11 h-11"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Danh sách thành viên: Sửa trình độ / Ghi chú kín / Reset PIN hộ / Ẩn */}
          <div className="space-y-2.5 pt-2 border-t ui-divider">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span
                className="text-[15px] font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Danh sách thành viên ({visibleRoster.length})
              </span>

              {inactiveCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowInactive((v) => !v)}
                  className="ui-btn ui-btn-ghost px-3 text-[14px]"
                >
                  {showInactive ? (
                    <>
                      <EyeOff className="w-4 h-4 shrink-0" />
                      <span>Ẩn bớt ({inactiveCount} đã ẩn)</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 shrink-0" />
                      <span>Hiện thành viên đã ẩn ({inactiveCount})</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {visibleRoster.map((member) => {
                const isInactive = member.isActive === false;
                const rankIdx = ORDERED_RANKS.indexOf(member.rank);
                const effScore = formatSkillScore(
                  getEffectiveSkill(member.rank, member.sex, maleBonus)
                );
                const hasPrivateNote = Boolean(
                  member.notes?.trim() || (member.tags && member.tags.length > 0)
                );

                return (
                  <div
                    key={member.id}
                    className="ui-tile p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                    style={{ opacity: isInactive ? 0.65 : 1 }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <GenderDot sex={member.sex} />
                        <span
                          className="text-[14px] font-bold truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {member.name}
                        </span>
                        {isInactive && <StatusPill tone="warning">Đã ẩn</StatusPill>}
                        {member.hasPin && (
                          <StatusPill tone="neutral">
                            <KeyRound className="w-3 h-3" />
                            <span>Có PIN</span>
                          </StatusPill>
                        )}
                      </div>

                      {hasPrivateNote && (
                        <p
                          className="text-[12px] truncate mt-0.5"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Ghi chú kín:{' '}
                          {[...(member.tags ?? []), member.notes?.trim()]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                      {/* Stepper trình độ cố định kích thước chuẩn DESIGN.md §3.1 */}
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={rankIdx <= 0 || busyActionKey === `RANK_${member.id}`}
                          onClick={() => {
                            void handleStepMemberRank(member, 'DOWN');
                          }}
                          aria-label={`Giảm trình ${member.name}`}
                          className="ui-icon-btn w-11 h-11"
                          style={{ backgroundColor: 'var(--bg-surface)' }}
                        >
                          <Minus className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditMemberModal(member)}
                          title="Bấm để sửa hồ sơ & ghi chú kín"
                          className="ui-btn ui-btn-secondary w-[118px] px-2 tabular-nums text-[14px] font-bold"
                          style={{ backgroundColor: 'var(--bg-surface)' }}
                        >
                          <span>
                            {RANK_METADATA[member.rank].code} · {effScore}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={
                            rankIdx >= ORDERED_RANKS.length - 1 ||
                            busyActionKey === `RANK_${member.id}`
                          }
                          onClick={() => {
                            void handleStepMemberRank(member, 'UP');
                          }}
                          aria-label={`Tăng trình ${member.name}`}
                          className="ui-icon-btn w-11 h-11"
                          style={{ backgroundColor: 'var(--bg-surface)' }}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Ghi chú kín & Sửa chi tiết */}
                      <button
                        type="button"
                        onClick={() => openEditMemberModal(member)}
                        aria-label={`Ghi chú kín & sửa ${member.name}`}
                        title="Sửa hồ sơ & Ghi chú kín (chỉ lưu máy Host)"
                        className="ui-icon-btn w-11 h-11"
                        style={{
                          backgroundColor: hasPrivateNote
                            ? 'var(--color-accent-soft)'
                            : 'var(--bg-surface)',
                          color: hasPrivateNote
                            ? 'var(--color-accent)'
                            : 'var(--text-secondary)',
                        }}
                      >
                        <FileText className="w-4 h-4" />
                      </button>

                      {/* Reset PIN hộ */}
                      {member.hasPin && (
                        <button
                          type="button"
                          disabled={busyActionKey === `PIN_${member.id}`}
                          onClick={() => {
                            void handleResetMemberPinAsHost(member);
                          }}
                          title="Xóa PIN cá nhân hộ thành viên quên PIN"
                          className="ui-btn ui-btn-secondary px-3 text-[14px]"
                          style={{ backgroundColor: 'var(--bg-surface)' }}
                        >
                          <KeyRound className="w-4 h-4 shrink-0" />
                          <span>Reset PIN</span>
                        </button>
                      )}

                      {/* Ẩn / Mở lại thành viên */}
                      <button
                        type="button"
                        disabled={busyActionKey === `HIDE_${member.id}`}
                        onClick={() => {
                          void handleHideOrRestoreMember(member);
                        }}
                        className="ui-btn ui-btn-secondary px-3 text-[14px]"
                        style={{ backgroundColor: 'var(--bg-surface)' }}
                      >
                        {isInactive ? (
                          <>
                            <Eye className="w-4 h-4 shrink-0" />
                            <span>Mở lại</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-4 h-4 shrink-0" />
                            <span>Ẩn</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal sửa thành viên & Ghi chú kín localStorage */}
      <UiModal
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        sheetOnMobile
        title={editingMember ? `Chỉnh sửa: ${editingMember.name}` : 'Chỉnh sửa thành viên'}
        subtitle="Ghi chú & nhãn nhận diện chỉ lưu riêng trên thiết bị của Host"
      >
        <form onSubmit={handleSaveEditMember} className="space-y-4">
          <div>
            <label
              htmlFor="host-edit-member-name"
              className="block text-[14px] font-semibold mb-1.5"
              style={{ color: 'var(--text-primary)' }}
            >
              Tên thành viên
            </label>
            <input
              id="host-edit-member-name"
              type="text"
              maxLength={60}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="ui-input"
            />
          </div>

          <div className="flex items-end gap-3">
            <div>
              <span
                className="block text-[14px] font-semibold mb-1.5"
                style={{ color: 'var(--text-primary)' }}
              >
                Giới tính
              </span>
              <GenderToggleButton
                sex={editGender}
                onClick={() => setEditGender((g) => (g === 'M' ? 'F' : 'M'))}
              />
            </div>

            <div className="flex-1 min-w-0">
              <label
                htmlFor="host-edit-member-rank"
                className="block text-[14px] font-semibold mb-1.5"
                style={{ color: 'var(--text-primary)' }}
              >
                Bậc trình độ
              </label>
              <select
                id="host-edit-member-rank"
                value={editRank}
                onChange={(e) => setEditRank(e.target.value as BadmintonRank)}
                className="ui-select"
              >
                {ORDERED_RANKS.map((rk) => (
                  <option key={rk} value={rk}>
                    {RANK_METADATA[rk].code} — {RANK_METADATA[rk].name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="ui-tile px-3.5 py-3 min-h-[48px] flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
              Chỉ đánh đôi (không xếp đánh đơn)
            </span>
            <input
              type="checkbox"
              checked={editNoSingles}
              onChange={(e) => setEditNoSingles(e.target.checked)}
              className="ui-checkbox w-5 h-5"
            />
          </label>

          {/* Nhãn kín & Ghi chú kín localStorage */}
          <div className="space-y-2 pt-2 border-t ui-divider">
            <div
              className="text-[14px] font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Nhãn kín của Host (chỉ lưu máy này)
            </div>
            <div className="flex flex-wrap gap-2">
              {CLUB_MEMBER_PRESET_TAGS.map((tag) => {
                const active = editTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setEditTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      )
                    }
                    className={`ui-btn px-3 text-[14px] ${
                      active ? 'ui-btn-accent-soft' : 'ui-btn-secondary'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div>
              <label
                htmlFor="host-edit-member-notes"
                className="block text-[14px] font-semibold mb-1.5 mt-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Ghi chú kín (localStorage)
              </label>
              <textarea
                id="host-edit-member-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Ghi chú riêng về lối đánh / thể lực / thói quen đi sân..."
                className="ui-textarea"
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setEditingMember(null)}
              className="ui-btn ui-btn-secondary flex-1"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={Boolean(busyActionKey)}
              className="ui-btn ui-btn-primary rounded-full flex-1"
            >
              Lưu thay đổi
            </button>
          </div>
        </form>
      </UiModal>
    </div>
  );
};
