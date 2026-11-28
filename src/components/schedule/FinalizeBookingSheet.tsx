import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Clock,
  Layers,
  PlusCircle,
  Radio,
  RotateCcw,
  Users,
} from 'lucide-react';
import { formatWindowLabel } from '../../engine/scheduleEngine';
import { formatSkillScore, getEffectiveSkill } from '../../engine/skillConfig';
import type { useClubSchedule } from '../../hooks/useClubSchedule';
import type { Player } from '../../types/badminton';
import type {
  ClubMember,
  DayOfWeek,
  HeatmapSlot,
  ResolvedUiPermissions,
  ScheduleHour,
  SessionDurationHours,
  SessionRoomRole,
  WeekKey,
} from '../../types/schedule';
import { vibrateSuccess, vibrateWarning } from '../../utils/vibrate';
import {
  GenderDot,
  RankBadge,
  StatusPill,
  UiModal,
} from '../ui/Primitives';
import {
  buildBookingSheetGroups,
  buildSuggestedClubRoomCode,
  mapClubMembersToSessionPlayers,
  partitionMergePlayers,
  type FinalizeBookingMode,
  type FinalizeQueueActionOptions,
  type NewQueuePlayerPayload,
} from './scheduleUiHelpers';

export interface CreateClubRoomBookingPayload {
  newRoomCode: string;
  newRoomPin: string;
  roomLabel: string;
  weekKey: WeekKey;
  dayOfWeek: DayOfWeek;
  startHour: ScheduleHour;
  durationHours: SessionDurationHours;
  selectedMembers: ClubMember[];
}

export interface FinalizeBookingSheetProps {
  slot: HeatmapSlot | null;
  preselectedMemberIds?: readonly string[];
  shiftLabel?: string;
  onClose: () => void;
  schedule: ReturnType<typeof useClubSchedule>;
  uiPermissions: ResolvedUiPermissions;
  roomCode: string | null;
  roomRole: SessionRoomRole;
  sessionPlayers: Player[];
  maleBonus: number;
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

/** PIN Co-Host mặc định khi tạo phòng từ CLB (ô nhập đã ẩn vì Host CLB kế thừa quyền Host) */
const DEFAULT_CLUB_ROOM_PIN = '1234';

export const FinalizeBookingSheet: React.FC<FinalizeBookingSheetProps> = ({
  slot,
  preselectedMemberIds,
  shiftLabel,
  onClose,
  schedule,
  uiPermissions,
  roomCode,
  roomRole,
  sessionPlayers,
  maleBonus,
  onPushPlayersToQueue,
  onResetAndPushPlayersToQueue,
  onCreateClubRoomWithPlayers,
}) => {
  const {
    clubCode,
    weekKey,
    activeMembers,
    weekEntriesByMemberId,
  } = schedule;

  const canFinalize = uiPermissions.canFinalizeBookingAndRooms;
  const isSessionEmpty = sessionPlayers.length === 0;

  const groups = useMemo(() => {
    if (!slot) {
      return {
        fullFreeMembers: [] as ClubMember[],
        partialBusyItems: [],
        defaultCheckedIds: [] as string[],
      };
    }
    return buildBookingSheetGroups({
      slot,
      members: activeMembers,
      preselectedMemberIds,
    });
  }, [slot, activeMembers, preselectedMemberIds]);

  const slotKeySig = slot
    ? `${clubCode ?? ''}|${weekKey}|${slot.dayOfWeek}-${slot.startHour}-${slot.durationHours}|${
        preselectedMemberIds?.join(',') ?? ''
      }|${isSessionEmpty ? 'EMPTY' : 'NON_EMPTY'}`
    : 'CLOSED';

  const [lastSlotKeySig, setLastSlotKeySig] = useState(slotKeySig);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(groups.defaultCheckedIds)
  );
  const [mode, setMode] = useState<FinalizeBookingMode>(() =>
    isSessionEmpty ? 'DIRECT_PUSH' : 'MERGE_MISSING'
  );
  const [newRoomCode, setNewRoomCode] = useState(() =>
    slot && clubCode ? buildSuggestedClubRoomCode(clubCode, slot) : 'SAN-LIVE'
  );
  const [newRoomLabel, setNewRoomLabel] = useState(() =>
    slot ? formatWindowLabel(slot.dayOfWeek, slot.startHour, slot.endHour) : ''
  );
  // Host CLB đã kế thừa quyền Host nên không cần nhập PIN Co-Host khi tạo phòng từ CLB
  const [alsoAttachExistingRoom, setAlsoAttachExistingRoom] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  if (slotKeySig !== lastSlotKeySig) {
    setLastSlotKeySig(slotKeySig);
    setCheckedIds(new Set(groups.defaultCheckedIds));
    setMode(isSessionEmpty ? 'DIRECT_PUSH' : 'MERGE_MISSING');
    if (slot) {
      setNewRoomCode(
        clubCode ? buildSuggestedClubRoomCode(clubCode, slot) : `SAN-${slot.startHour}H`
      );
      setNewRoomLabel(
        shiftLabel
          ? `${shiftLabel} · ${formatWindowLabel(slot.dayOfWeek, slot.startHour, slot.endHour)}`
          : formatWindowLabel(slot.dayOfWeek, slot.startHour, slot.endHour)
      );
    }
    setSheetError(null);
  }

  const inRoomNames = useMemo(
    () => new Set(sessionPlayers.map((p) => p.name.trim().toLowerCase())),
    [sessionPlayers]
  );

  const selectedMembersList = useMemo(() => {
    const orderedCandidates: ClubMember[] = [
      ...groups.fullFreeMembers,
      ...groups.partialBusyItems.map((i) => i.member),
    ];
    return orderedCandidates.filter((m) => checkedIds.has(m.id));
  }, [groups, checkedIds]);

  const mergePreview = useMemo(
    () => partitionMergePlayers(selectedMembersList, sessionPlayers, 0),
    [selectedMembersList, sessionPlayers]
  );

  if (!slot) return null;

  const windowTitle = shiftLabel
    ? `${shiftLabel}: ${formatWindowLabel(slot.dayOfWeek, slot.startHour, slot.endHour)}`
    : formatWindowLabel(slot.dayOfWeek, slot.startHour, slot.endHour);

  const toggleMemberCheck = (memberId: string) => {
    if (!canFinalize) return;
    setSheetError(null);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleSelectAllFullFree = () => {
    setCheckedIds(new Set(groups.fullFreeMembers.map((m) => m.id)));
  };

  const handleClearSelection = () => {
    setCheckedIds(new Set());
  };

  const handleExecuteFinalize = async () => {
    if (!canFinalize) return;
    setSheetError(null);

    if (selectedMembersList.length === 0) {
      vibrateWarning();
      setSheetError('Vui lòng chọn ít nhất 1 thành viên để đưa vào Hàng chờ.');
      return;
    }

    const now = Date.now();

    // KỊCH BẢN 3: Tạo phòng mới gắn với CLB (active_rooms)
    if (mode === 'CREATE_CLUB_ROOM') {
      const cleanCode = newRoomCode.trim().toUpperCase();
      const cleanPin = DEFAULT_CLUB_ROOM_PIN;
      if (cleanCode.length < 2 || cleanCode.length > 24 || /\s/.test(cleanCode)) {
        vibrateWarning();
        setSheetError('Mã phòng mới từ 2–24 ký tự và không chứa khoảng trắng.');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await onCreateClubRoomWithPlayers({
          newRoomCode: cleanCode,
          newRoomPin: cleanPin,
          roomLabel: newRoomLabel.trim() || windowTitle,
          weekKey,
          dayOfWeek: slot.dayOfWeek,
          startHour: slot.startHour,
          durationHours: slot.durationHours,
          selectedMembers: selectedMembersList,
        });

        if (!res.ok) {
          vibrateWarning();
          setSheetError(res.error ?? 'Không thể tạo phòng LIVE mới.');
          return;
        }

        vibrateSuccess();
        onClose();
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const attachRoomMeta =
      roomCode && alsoAttachExistingRoom && clubCode
        ? {
            label: newRoomLabel.trim() || windowTitle,
            weekKey,
            dayOfWeek: slot.dayOfWeek,
            startHour: slot.startHour,
            durationHours: slot.durationHours,
          }
        : null;

    // KỊCH BẢN 1: Phòng đang trống -> Nạp thẳng vào Hàng chờ kèm giới tính & điểm trình
    if (mode === 'DIRECT_PUSH' || isSessionEmpty) {
      const payloads = mapClubMembersToSessionPlayers(selectedMembersList, now);
      onClose();
      onPushPlayersToQueue(payloads, {
        attachRoomMeta,
        successToast: `Đã nạp ${payloads.length} thành viên vào Hàng chờ!`,
      });
      return;
    }

    // KỊCH BẢN 2A: Phòng đang có người -> Gộp thêm người chưa có
    if (mode === 'MERGE_MISSING') {
      const { playersToAdd, alreadyInRoomMembers } = partitionMergePlayers(
        selectedMembersList,
        sessionPlayers,
        now
      );
      if (playersToAdd.length === 0) {
        vibrateWarning();
        setSheetError(
          `Tất cả ${alreadyInRoomMembers.length} người đã chọn đều đang có mặt trong Hàng chờ hiện tại.`
        );
        return;
      }

      onClose();
      onPushPlayersToQueue(playersToAdd, {
        attachRoomMeta,
        successToast:
          alreadyInRoomMembers.length > 0
            ? `Đã gộp thêm ${playersToAdd.length} người mới (giữ nguyên ${alreadyInRoomMembers.length} người đã có).`
            : `Đã thêm ${playersToAdd.length} người vào Hàng chờ!`,
      });
      return;
    }

    // KỊCH BẢN 2B: Phòng đang có người -> Reset buổi mới & nạp danh sách này
    if (mode === 'RESET_AND_PUSH') {
      const payloads = mapClubMembersToSessionPlayers(selectedMembersList, now);
      onClose();
      onResetAndPushPlayersToQueue(payloads, {
        attachRoomMeta,
        successToast: `Đã tạo buổi mới sạch và nạp ${payloads.length} người vào Hàng chờ!`,
      });
    }
  };

  const renderMemberRow = (
    member: ClubMember,
    badgeNode?: React.ReactNode
  ) => {
    const isChecked = checkedIds.has(member.id);
    const note = weekEntriesByMemberId[member.id]?.note?.trim() || '';
    const effectiveScore = formatSkillScore(
      getEffectiveSkill(member.rank, member.gender, maleBonus)
    );
    const alreadyInSession = inRoomNames.has(member.name.trim().toLowerCase());

    if (!canFinalize) {
      return (
        <div
          key={member.id}
          className="ui-tile px-3.5 py-2.5 min-h-[48px] flex items-center justify-between gap-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <GenderDot sex={member.gender} />
              <span
                className="text-[14px] font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {member.name}
              </span>
              {badgeNode}
            </div>
            {note && (
              <p
                className="text-[12px] truncate mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Ghi chú: {note}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <RankBadge rank={member.rank} />
            <span
              className="text-[12px] font-semibold tabular-nums w-9 text-right"
              style={{ color: 'var(--text-secondary)' }}
            >
              {effectiveScore}đ
            </span>
          </div>
        </div>
      );
    }

    return (
      <button
        key={member.id}
        type="button"
        onClick={() => toggleMemberCheck(member.id)}
        className="w-full min-h-[50px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors"
        style={{
          backgroundColor: isChecked
            ? 'var(--color-accent-soft)'
            : 'var(--bg-surface-secondary)',
          border: `1px solid ${
            isChecked ? 'var(--color-accent-border)' : 'var(--border-subtle)'
          }`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <input
            type="checkbox"
            checked={isChecked}
            readOnly
            tabIndex={-1}
            className="ui-checkbox w-4 h-4 shrink-0 pointer-events-none"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <GenderDot sex={member.gender} />
              <span
                className="text-[14px] font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {member.name}
              </span>
              {badgeNode}
              {alreadyInSession && (
                <StatusPill tone="neutral" className="h-[22px] px-2">
                  Đã ở phòng
                </StatusPill>
              )}
            </div>
            {note && (
              <p
                className="text-[12px] truncate mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Ghi chú: {note}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <RankBadge rank={member.rank} />
          <span
            className="text-[12px] font-bold tabular-nums w-9 text-right"
            style={{ color: 'var(--text-secondary)' }}
          >
            {effectiveScore}đ
          </span>
        </div>
      </button>
    );
  };

  return (
    <UiModal
      isOpen={Boolean(slot)}
      onClose={onClose}
      sheetOnMobile
      maxWidthClass="max-w-xl"
      title={windowTitle}
      subtitle={`${weekKey === 'FIXED' ? 'Lịch cứng hàng tuần' : `Tuần ${weekKey}`} · Ca ${slot.durationHours}h · ${slot.freeCount}/${slot.submittedCount} rảnh trọn buổi`}
      footer={
        canFinalize ? (
          <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <span
              className="text-[14px] font-semibold tabular-nums"
              style={{ color: 'var(--text-secondary)' }}
            >
              Đã chọn: {selectedMembersList.length} người
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="ui-btn ui-btn-secondary px-4"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleExecuteFinalize();
                }}
                disabled={isSubmitting || selectedMembersList.length === 0}
                className="ui-btn ui-btn-primary rounded-full px-5 flex-1 sm:flex-initial"
              >
                <CheckSquare className="w-4 h-4 shrink-0" />
                <span>
                  {isSubmitting
                    ? 'Đang chốt...'
                    : 'Chốt kèo & Đưa vào Hàng chờ'}
                </span>
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {/* 1. Nhóm Rảnh trọn buổi */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
              <h4
                className="text-[15px] font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Rảnh trọn buổi ({groups.fullFreeMembers.length})
              </h4>
            </div>

            {canFinalize && groups.fullFreeMembers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllFullFree}
                  className="ui-btn ui-btn-ghost px-2.5 text-[14px]"
                >
                  Chọn đủ rảnh
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="ui-btn ui-btn-ghost px-2.5 text-[14px]"
                >
                  Bỏ chọn
                </button>
              </div>
            )}
          </div>

          {groups.fullFreeMembers.length === 0 ? (
            <div className="ui-tile px-3.5 py-3 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
              Không có thành viên nào rảnh trọn buổi ở khung giờ này.
            </div>
          ) : (
            <div className="space-y-1.5">
              {groups.fullFreeMembers.map((m) => renderMemberRow(m))}
            </div>
          )}
        </div>

        {/* 2. Nhóm Bận 1 kíp / vào muộn - về sớm */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 shrink-0" style={{ color: 'var(--color-warning)' }} />
            <h4
              className="text-[15px] font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Bận 1 kíp / vào muộn - về sớm ({groups.partialBusyItems.length})
            </h4>
          </div>

          {groups.partialBusyItems.length === 0 ? (
            <div className="ui-tile px-3.5 py-3 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
              Không có ai bận một phần trong khung giờ này.
            </div>
          ) : (
            <div className="space-y-1.5">
              {groups.partialBusyItems.map((item) =>
                renderMemberRow(
                  item.member,
                  <StatusPill tone="warning" className="h-[22px] px-2">
                    {item.tagLabelVi}
                  </StatusPill>
                )
              )}
            </div>
          )}
        </div>

        {/* Thông tin ngắn về người bận trọn buổi & chưa nộp */}
        {(slot.fullBusyMemberIds.length > 0 || slot.unsubmittedMemberIds.length > 0) && (
          <div
            className="text-[14px] flex items-center gap-3 flex-wrap pt-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="tabular-nums">Bận cả buổi: {slot.fullBusyMemberIds.length}</span>
            <span>·</span>
            <span className="tabular-nums">Chưa nộp lịch: {slot.unsubmittedMemberIds.length}</span>
          </div>
        )}

        {/* 3. Cấu hình kịch bản chốt kèo (chỉ CLUB_HOST) */}
        {canFinalize && (
          <div className="pt-3 border-t ui-divider space-y-3">
            <h4
              className="text-[15px] font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Phương thức đưa vào sân
            </h4>

            <div className="space-y-2">
              {isSessionEmpty ? (
                /* Kịch bản 1: Phòng hiện tại đang trống */
                <button
                  type="button"
                  onClick={() => setMode('DIRECT_PUSH')}
                  className="w-full min-h-[52px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-left transition-colors"
                  style={{
                    backgroundColor:
                      mode === 'DIRECT_PUSH'
                        ? 'var(--color-accent-soft)'
                        : 'var(--bg-surface-secondary)',
                    border: `1px solid ${
                      mode === 'DIRECT_PUSH'
                        ? 'var(--color-accent-border)'
                        : 'var(--border-subtle)'
                    }`,
                  }}
                >
                  <PlusCircle
                    className="w-5 h-5 shrink-0"
                    style={{
                      color:
                        mode === 'DIRECT_PUSH'
                          ? 'var(--color-accent)'
                          : 'var(--text-secondary)',
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[14px] font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Nạp thẳng vào Hàng chờ hiện tại (Phòng đang trống)
                    </div>
                    <div
                      className="text-[12px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Giữ nguyên giới tính, bậc trình độ & điểm trình của {selectedMembersList.length} thành viên
                    </div>
                  </div>
                </button>
              ) : (
                /* Kịch bản 2: Phòng đang có người -> Gộp thêm hoặc Reset buổi mới */
                <>
                  <button
                    type="button"
                    onClick={() => setMode('MERGE_MISSING')}
                    className="w-full min-h-[52px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-left transition-colors"
                    style={{
                      backgroundColor:
                        mode === 'MERGE_MISSING'
                          ? 'var(--color-accent-soft)'
                          : 'var(--bg-surface-secondary)',
                      border: `1px solid ${
                        mode === 'MERGE_MISSING'
                          ? 'var(--color-accent-border)'
                          : 'var(--border-subtle)'
                      }`,
                    }}
                  >
                    <Layers
                      className="w-5 h-5 shrink-0"
                      style={{
                        color:
                          mode === 'MERGE_MISSING'
                            ? 'var(--color-accent)'
                            : 'var(--text-secondary)',
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[14px] font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Gộp thêm người chưa có ({mergePreview.playersToAdd.length} người mới)
                      </div>
                      <div
                        className="text-[12px]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Phòng đang có {sessionPlayers.length} người · Bỏ qua {mergePreview.alreadyInRoomMembers.length} người trùng tên
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('RESET_AND_PUSH')}
                    className="w-full min-h-[52px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-left transition-colors"
                    style={{
                      backgroundColor:
                        mode === 'RESET_AND_PUSH'
                          ? 'var(--color-accent-soft)'
                          : 'var(--bg-surface-secondary)',
                      border: `1px solid ${
                        mode === 'RESET_AND_PUSH'
                          ? 'var(--color-accent-border)'
                          : 'var(--border-subtle)'
                      }`,
                    }}
                  >
                    <RotateCcw
                      className="w-5 h-5 shrink-0"
                      style={{
                        color:
                          mode === 'RESET_AND_PUSH'
                            ? 'var(--color-accent)'
                            : 'var(--text-secondary)',
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[14px] font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Reset buổi mới & nạp {selectedMembersList.length} người này
                      </div>
                      <div
                        className="text-[12px]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Làm mới Hàng chờ, lịch sử trận & bảng thu tiền cho ca đánh mới
                      </div>
                    </div>
                  </button>
                </>
              )}

              {/* Kịch bản 3: Tạo phòng mới gắn với CLB (active_rooms) */}
              <button
                type="button"
                onClick={() => setMode('CREATE_CLUB_ROOM')}
                className="w-full min-h-[52px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-left transition-colors"
                style={{
                  backgroundColor:
                    mode === 'CREATE_CLUB_ROOM'
                      ? 'var(--color-accent-soft)'
                      : 'var(--bg-surface-secondary)',
                  border: `1px solid ${
                    mode === 'CREATE_CLUB_ROOM'
                      ? 'var(--color-accent-border)'
                      : 'var(--border-subtle)'
                  }`,
                }}
              >
                <Radio
                  className="w-5 h-5 shrink-0"
                  style={{
                    color:
                      mode === 'CREATE_CLUB_ROOM'
                        ? 'var(--color-accent)'
                        : 'var(--text-secondary)',
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[14px] font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Tạo phòng LIVE mới gắn với CLB
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Mở mã phòng trực tuyến mới và ghim banner LIVE cho cả CLB vào xem 1 chạm
                  </div>
                </div>
              </button>
            </div>

            {/* Tùy chọn phụ khi đang ở phòng online sẵn có */}
            {mode !== 'CREATE_CLUB_ROOM' && roomCode && (
              <label className="ui-tile px-3.5 py-2.5 min-h-[46px] flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-[14px]" style={{ color: 'var(--text-primary)' }}>
                  Gắn phòng hiện tại (<strong className="font-mono-tabular">{roomCode}</strong>) lên banner LIVE của CLB
                </span>
                <input
                  type="checkbox"
                  checked={alsoAttachExistingRoom}
                  onChange={(e) => setAlsoAttachExistingRoom(e.target.checked)}
                  className="ui-checkbox w-5 h-5 shrink-0"
                />
              </label>
            )}

            {mode !== 'CREATE_CLUB_ROOM' && roomCode && roomRole === 'VIEWER' && (
              <div className="ui-banner-warning px-3.5 py-2.5 text-[14px]">
                Thiết bị đang ở chế độ Chỉ xem của phòng <strong className="font-mono-tabular">{roomCode}</strong>. Khi bấm chốt, hệ thống sẽ hỏi PIN phòng (hoặc bạn có thể chọn Tạo phòng LIVE mới).
              </div>
            )}

            {/* Form cấu hình phòng mới cho Kịch bản 3 */}
            {mode === 'CREATE_CLUB_ROOM' && (
              <div className="ui-tile p-3.5 space-y-3">
                <div>
                  <label
                    htmlFor="booking-new-room-code"
                    className="block text-[14px] font-semibold mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Mã phòng mới
                  </label>
                  <input
                    id="booking-new-room-code"
                    type="text"
                    maxLength={24}
                    value={newRoomCode}
                    onChange={(e) => {
                      setNewRoomCode(e.target.value.toUpperCase().replace(/\s+/g, '-'));
                      setSheetError(null);
                    }}
                    className="ui-input font-mono-tabular uppercase"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="booking-new-room-label"
                    className="block text-[14px] font-semibold mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Nhãn hiển thị trên banner LIVE CLB
                  </label>
                  <input
                    id="booking-new-room-label"
                    type="text"
                    maxLength={60}
                    value={newRoomLabel}
                    onChange={(e) => setNewRoomLabel(e.target.value)}
                    placeholder="VD: Sân T3 · 19h–21h"
                    className="ui-input"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  />
                </div>
              </div>
            )}

            {sheetError && (
              <div className="ui-banner-danger px-3.5 py-2.5 text-[14px]">{sheetError}</div>
            )}
          </div>
        )}
      </div>
    </UiModal>
  );
};
