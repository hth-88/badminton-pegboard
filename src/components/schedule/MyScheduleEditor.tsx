import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  GripVertical,
  Info,
  Lock,
  LockOpen,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import {
  getIsoWeekKeyFromDate,
  makeSlotKey,
  normalizeBusySlots,
  setDayBusySlots,
  toggleBusySlot,
} from '../../engine/scheduleEngine';
import { ORDERED_RANKS, RANK_METADATA } from '../../engine/skillConfig';
import type { useClubSchedule } from '../../hooks/useClubSchedule';
import type { BadmintonRank, Sex } from '../../types/badminton';
import {
  DAY_LABELS_VI,
  SCHEDULE_DAYS,
  SCHEDULE_HOURS,
  type DayOfWeek,
  type ResolvedUiPermissions,
  type ScheduleHour,
  type ScheduleSlotKey,
} from '../../types/schedule';
import { vibrateSuccess, vibrateWarning } from '../../utils/vibrate';
import {
  GenderDot,
  GenderToggleButton,
  RankBadge,
  StatusPill,
  UiEmptyState,
  UiModal,
} from '../ui/Primitives';
import {
  formatScheduleSlotRange,
  formatWeekKeyDisplay,
  getVisibleScheduleHours,
  hasCachedMemberSessionPin,
  isValidFourDigitPin,
  paintBusySlotsRange,
  resolveNearestScheduleHour,
} from './scheduleUiHelpers';

export const FIXED_SCHEDULE_HELP_TEXT =
  'Lưu sẵn lịch học/làm cố định hàng tuần để setup nhanh; các tuần sau chỉ cần bấm Áp dụng lịch cứng rồi chỉnh lại vài buổi phát sinh.';

export interface MyScheduleEditorProps {
  schedule: ReturnType<typeof useClubSchedule>;
  uiPermissions: ResolvedUiPermissions;
  onShowToast?: (message: string) => void;
}

type PendingPinEditIntent =
  | { kind: 'TOGGLE_SLOT'; day: DayOfWeek; hour: ScheduleHour }
  | { kind: 'SET_DAY'; day: DayOfWeek; isBusy: boolean }
  | { kind: 'SAVE_DRAFT' }
  | { kind: 'COPY_FIXED' }
  | { kind: 'UNLOCK_ONLY' };

export const MyScheduleEditor: React.FC<MyScheduleEditorProps> = ({
  schedule,
  uiPermissions,
  onShowToast,
}) => {
  const {
    clubCode,
    club,
    weekKey,
    selectedMemberId,
    selectedMember,
    activeMembers,
    weekEntriesByMemberId,
    fixedEntriesByMemberId,
    isHost,
    selectCurrentMember,
    selectWeek,
    isMemberPinUnlocked,
    lockMemberPin,
    verifyAndCacheMemberPin,
    saveScheduleEntry,
    copyMyFixedToCurrentWeek,
    registerMember,
    setMemberPersonalPin,
  } = schedule;

  const savedEntry = selectedMember ? weekEntriesByMemberId[selectedMember.id] : undefined;
  const fixedEntry = selectedMember ? fixedEntriesByMemberId[selectedMember.id] : undefined;
  const isWeekLocked = Boolean(club?.lockedWeeks?.includes(weekKey));
  const canEditGrid = Boolean(selectedMember) && uiPermissions.canEditOwnSchedule;

  const hasUnlockedPersonalPin = selectedMember
    ? isMemberPinUnlocked
      ? isMemberPinUnlocked(selectedMember.id)
      : hasCachedMemberSessionPin(clubCode, selectedMember.id)
    : false;

  // CLUB_HOST bỏ qua hoàn toàn bước hỏi PIN cá nhân; thành viên có PIN chưa mở khóa thì xem tự do, chạm sửa mới hỏi
  const requiresPinBeforeEdit = Boolean(
    selectedMember && selectedMember.hasPin && !isHost && !hasUnlockedPersonalPin
  );

  // Ghi nhớ tuần ISO gần nhất để khi đang ở màn hình Set lịch cứng ('FIXED') có thể quay lại đúng tuần đang xem
  const [fallbackIsoWeek, setFallbackIsoWeek] = useState<`${number}-W${string}`>(() =>
    weekKey !== 'FIXED' ? weekKey : getIsoWeekKeyFromDate(new Date())
  );
  if (weekKey !== 'FIXED' && weekKey !== fallbackIsoWeek) {
    setFallbackIsoWeek(weekKey);
  }

  // Đồng bộ bản nháp theo thành viên / tuần / dữ liệu Cloud mới nhất mà không dùng setState trong useEffect
  const contextKey = `${clubCode ?? ''}|${weekKey}|${selectedMemberId ?? ''}`;
  const remoteSig = `${contextKey}|${savedEntry?.updatedAt ?? 'UNSUBMITTED'}`;

  const [lastContextKey, setLastContextKey] = useState(contextKey);
  const [lastRemoteSig, setLastRemoteSig] = useState(remoteSig);
  const [draftBusySlots, setDraftBusySlots] = useState<ScheduleSlotKey[]>(() =>
    normalizeBusySlots(savedEntry?.busySlots ?? [])
  );
  const [draftNote, setDraftNote] = useState<string>(() => savedEntry?.note ?? '');
  const [isDirty, setIsDirty] = useState(false);

  if (contextKey !== lastContextKey) {
    setLastContextKey(contextKey);
    setLastRemoteSig(remoteSig);
    setDraftBusySlots(normalizeBusySlots(savedEntry?.busySlots ?? []));
    setDraftNote(savedEntry?.note ?? '');
    setIsDirty(false);
  } else if (remoteSig !== lastRemoteSig) {
    setLastRemoteSig(remoteSig);
    if (!isDirty) {
      setDraftBusySlots(normalizeBusySlots(savedEntry?.busySlots ?? []));
      setDraftNote(savedEntry?.note ?? '');
    }
  }

  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Bộ chọn thành viên chuẩn mobile 1 tay (Bottom Sheet / Modal)
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  // Popover giải thích Lịch cứng (ⓘ)
  const [showFixedInfo, setShowFixedInfo] = useState(false);
  const fixedInfoWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showFixedInfo) return;
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (
        fixedInfoWrapRef.current &&
        event.target instanceof Node &&
        !fixedInfoWrapRef.current.contains(event.target)
      ) {
        setShowFixedInfo(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowFixedInfo(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showFixedInfo]);

  // Modal Tự đăng ký tên mới
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regName, setRegName] = useState('');
  const [regGender, setRegGender] = useState<Sex>('M');
  const [regRank, setRegRank] = useState<BadmintonRank>('tby');
  const [regNoSingles, setRegNoSingles] = useState(false);
  const [regPin, setRegPin] = useState('');
  const [regError, setRegError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // Modal Đặt / Đổi / Gỡ PIN 4 số cá nhân
  const [showPinSetupModal, setShowPinSetupModal] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinSetupError, setPinSetupError] = useState<string | null>(null);
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);

  // Modal Nhập PIN 4 số khi thao tác chỉnh sửa / lưu / áp dụng trên lịch đã khóa PIN
  const [pendingPinIntent, setPendingPinIntent] = useState<PendingPinEditIntent | null>(null);
  const [verifyPinInput, setVerifyPinInput] = useState('');
  const [verifyPinError, setVerifyPinError] = useState<string | null>(null);
  const [isVerifyingEditPin, setIsVerifyingEditPin] = useState(false);

  // Refs phục vụ dải quét Drag-to-Paint trên mobile & desktop
  const mobileRowRefs = useRef<Partial<Record<ScheduleHour, HTMLDivElement | null>>>({});
  const desktopMouseHandledRef = useRef(false);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    dayOfWeek: DayOfWeek;
    lastHour: ScheduleHour;
    targetBusy: boolean;
  } | null>(null);

  const visibleHours = useMemo(() => getVisibleScheduleHours(), []);
  const busySlotSet = useMemo(() => new Set(draftBusySlots), [draftBusySlots]);

  const filteredPickerMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return activeMembers;
    return activeMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        RANK_METADATA[m.rank].code.toLowerCase().includes(q)
    );
  }, [activeMembers, memberSearch]);

  const busyCountByDay = useMemo(() => {
    const counts: Record<DayOfWeek, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const slotKey of draftBusySlots) {
      const dashIdx = slotKey.indexOf('-');
      if (dashIdx > 0) {
        const day = Number(slotKey.slice(0, dashIdx)) as DayOfWeek;
        if (day >= 0 && day <= 6) {
          counts[day] += 1;
        }
      }
    }
    return counts;
  }, [draftBusySlots]);

  const weekDisplay = useMemo(() => formatWeekKeyDisplay(weekKey), [weekKey]);

  const openPinSetupModal = () => {
    setCurrentPinInput('');
    setNewPinInput('');
    setPinSetupError(null);
    setShowPinSetupModal(true);
  };

  const requestPinForEdit = (intent: PendingPinEditIntent) => {
    setVerifyPinInput('');
    setVerifyPinError(null);
    setPendingPinIntent(intent);
  };

  const applyDraftBusyChange = (updater: (prev: ScheduleSlotKey[]) => ScheduleSlotKey[]) => {
    if (!canEditGrid) return;
    setLocalError(null);
    setDraftBusySlots((prev) => updater(prev));
    setIsDirty(true);
  };

  const handleToggleSingleSlot = (day: DayOfWeek, hour: ScheduleHour) => {
    if (!canEditGrid) return;
    if (requiresPinBeforeEdit) {
      requestPinForEdit({ kind: 'TOGGLE_SLOT', day, hour });
      return;
    }
    applyDraftBusyChange((prev) => toggleBusySlot(prev, makeSlotKey(day, hour)));
  };

  const handleSetDayBusy = (day: DayOfWeek, isBusy: boolean) => {
    if (!canEditGrid) return;
    if (requiresPinBeforeEdit) {
      requestPinForEdit({ kind: 'SET_DAY', day, isBusy });
      return;
    }
    applyDraftBusyChange((prev) => setDayBusySlots(prev, day, isBusy));
  };

  const resolveMobileHitHour = (clientY: number): ScheduleHour | null => {
    if (visibleHours.length === 0) return null;
    const rowBounds: Array<{ hour: ScheduleHour; top: number; bottom: number }> = [];

    for (let i = 0; i < visibleHours.length; i++) {
      const h = visibleHours[i];
      const el = mobileRowRefs.current[h];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      rowBounds.push({ hour: h, top: rect.top, bottom: rect.bottom });
    }

    return resolveNearestScheduleHour(clientY, rowBounds);
  };

  const handleStripPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    day: DayOfWeek
  ) => {
    if (!canEditGrid) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const hour = resolveMobileHitHour(e.clientY);
    if (requiresPinBeforeEdit) {
      e.preventDefault();
      e.stopPropagation();
      requestPinForEdit(
        hour !== null ? { kind: 'TOGGLE_SLOT', day, hour } : { kind: 'UNLOCK_ONLY' }
      );
      return;
    }
    if (hour === null) return;

    const slotKey = makeSlotKey(day, hour);
    const nextTargetBusy = !busySlotSet.has(slotKey);

    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      dayOfWeek: day,
      lastHour: hour,
      targetBusy: nextTargetBusy,
    };

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Bỏ qua trên môi trường giả lập thiếu PointerCapture
    }

    applyDraftBusyChange((prev) =>
      paintBusySlotsRange({
        currentBusySlots: prev,
        dayOfWeek: day,
        visibleHours,
        fromHour: hour,
        toHour: hour,
        targetBusy: nextTargetBusy,
      })
    );
  };

  const handleStripPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (
      !drag ||
      !drag.active ||
      e.pointerId !== drag.pointerId ||
      !canEditGrid ||
      requiresPinBeforeEdit
    ) {
      return;
    }

    const hitHour = resolveMobileHitHour(e.clientY);
    if (hitHour === null || hitHour === drag.lastHour) return;

    const prevHour = drag.lastHour;
    const targetBusy = drag.targetBusy;
    const targetDay = drag.dayOfWeek;
    drag.lastHour = hitHour;

    applyDraftBusyChange((prev) =>
      paintBusySlotsRange({
        currentBusySlots: prev,
        dayOfWeek: targetDay,
        visibleHours,
        fromHour: prevHour,
        toHour: hitHour,
        targetBusy,
      })
    );
  };

  const finishStripDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current && dragStateRef.current.pointerId === e.pointerId) {
      dragStateRef.current = null;
    }
  };

  // Kéo chuột nhanh trên lưới Desktop (7 cột × 18 kíp)
  const handleDesktopCellMouseDown = (
    e: React.MouseEvent<HTMLButtonElement>,
    day: DayOfWeek,
    hour: ScheduleHour
  ) => {
    if (!canEditGrid || e.button !== 0) return;
    desktopMouseHandledRef.current = true;
    if (requiresPinBeforeEdit) {
      e.preventDefault();
      requestPinForEdit({ kind: 'TOGGLE_SLOT', day, hour });
      return;
    }
    const slotKey = makeSlotKey(day, hour);
    const nextTargetBusy = !busySlotSet.has(slotKey);
    dragStateRef.current = {
      active: true,
      pointerId: -1,
      dayOfWeek: day,
      lastHour: hour,
      targetBusy: nextTargetBusy,
    };
    applyDraftBusyChange((prev) =>
      paintBusySlotsRange({
        currentBusySlots: prev,
        dayOfWeek: day,
        visibleHours,
        fromHour: hour,
        toHour: hour,
        targetBusy: nextTargetBusy,
      })
    );
  };

  const handleDesktopCellClick = (day: DayOfWeek, hour: ScheduleHour) => {
    if (desktopMouseHandledRef.current) {
      desktopMouseHandledRef.current = false;
      return;
    }
    handleToggleSingleSlot(day, hour);
  };

  const handleDesktopCellMouseEnter = (day: DayOfWeek, hour: ScheduleHour) => {
    const drag = dragStateRef.current;
    if (
      !drag ||
      !drag.active ||
      drag.pointerId !== -1 ||
      !canEditGrid ||
      requiresPinBeforeEdit
    ) {
      return;
    }
    if (day !== drag.dayOfWeek) {
      drag.dayOfWeek = day;
      drag.lastHour = hour;
      const targetBusy = drag.targetBusy;
      applyDraftBusyChange((prev) =>
        paintBusySlotsRange({
          currentBusySlots: prev,
          dayOfWeek: day,
          visibleHours,
          fromHour: hour,
          toHour: hour,
          targetBusy,
        })
      );
      return;
    }
    if (hour === drag.lastHour) return;
    const prevHour = drag.lastHour;
    const targetBusy = drag.targetBusy;
    drag.lastHour = hour;
    applyDraftBusyChange((prev) =>
      paintBusySlotsRange({
        currentBusySlots: prev,
        dayOfWeek: day,
        visibleHours,
        fromHour: prevHour,
        toHour: hour,
        targetBusy,
      })
    );
  };

  const stopDesktopDrag = () => {
    if (dragStateRef.current?.pointerId === -1) {
      dragStateRef.current = null;
    }
  };

  const executeSaveSchedule = async (explicitMemberPin?: string) => {
    if (!selectedMember) return;

    if (!explicitMemberPin && requiresPinBeforeEdit) {
      requestPinForEdit({ kind: 'SAVE_DRAFT' });
      return;
    }

    setIsSaving(true);
    setLocalError(null);
    try {
      const res = await saveScheduleEntry({
        memberId: selectedMember.id,
        weekKey,
        busySlots: draftBusySlots,
        note: draftNote.trim(),
        memberPin: explicitMemberPin,
      });

      if (res.errorCode === 'INVALID_MEMBER_PIN') {
        if (explicitMemberPin) {
          setVerifyPinError(res.error ?? 'Mã PIN cá nhân không chính xác.');
        } else {
          requestPinForEdit({ kind: 'SAVE_DRAFT' });
        }
        return;
      }

      if (res.error || !res.data) {
        vibrateWarning();
        const errMsg = res.error ?? 'Không thể lưu lịch bận.';
        if (explicitMemberPin) {
          setVerifyPinError(errMsg);
        } else {
          setLocalError(errMsg);
        }
        return;
      }

      vibrateSuccess();
      setIsDirty(false);
      setPendingPinIntent(null);
      setVerifyPinInput('');
      setVerifyPinError(null);
      onShowToast?.(
        weekKey === 'FIXED'
          ? `Đã lưu lịch cứng hàng tuần cho ${selectedMember.name}.`
          : `Đã nộp lịch tuần ${weekKey} cho ${selectedMember.name}!`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const executeCopyFromFixed = async (explicitMemberPin?: string) => {
    if (!selectedMember) return;

    if (!explicitMemberPin && requiresPinBeforeEdit) {
      requestPinForEdit({ kind: 'COPY_FIXED' });
      return;
    }

    if (!fixedEntry) {
      if (explicitMemberPin) {
        setIsVerifyingEditPin(true);
        try {
          const pinRes = await verifyAndCacheMemberPin(selectedMember.id, explicitMemberPin);
          if (pinRes.data !== true) {
            vibrateWarning();
            setVerifyPinError(pinRes.error ?? 'Mã PIN cá nhân không chính xác.');
            return;
          }
          setPendingPinIntent(null);
          setVerifyPinInput('');
          setVerifyPinError(null);
        } finally {
          setIsVerifyingEditPin(false);
        }
      }
      onShowToast?.('Bạn chưa có lịch cứng. Đang mở màn hình Set lịch cứng...');
      void selectWeek('FIXED');
      return;
    }

    setIsSaving(true);
    setLocalError(null);
    try {
      const res = await copyMyFixedToCurrentWeek({
        memberId: selectedMember.id,
        mode: 'OVERWRITE',
        copyNote: !draftNote.trim(),
        memberPin: explicitMemberPin,
      });

      if (res.errorCode === 'INVALID_MEMBER_PIN') {
        if (explicitMemberPin) {
          setVerifyPinError(res.error ?? 'Mã PIN cá nhân không chính xác.');
        } else {
          requestPinForEdit({ kind: 'COPY_FIXED' });
        }
        return;
      }

      if (res.error || !res.data) {
        vibrateWarning();
        const errMsg = res.error ?? 'Không thể áp dụng lịch cứng.';
        if (explicitMemberPin) {
          setVerifyPinError(errMsg);
        } else {
          setLocalError(errMsg);
        }
        return;
      }

      vibrateSuccess();
      setDraftBusySlots(normalizeBusySlots(res.data.busySlots));
      setDraftNote(res.data.note ?? '');
      setIsDirty(false);
      setPendingPinIntent(null);
      setVerifyPinInput('');
      setVerifyPinError(null);
      onShowToast?.(`Đã áp dụng lịch cứng vào tuần ${weekKey} cho ${selectedMember.name}!`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerifyPinForEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !pendingPinIntent) return;

    const cleanPin = verifyPinInput.trim();
    if (!isValidFourDigitPin(cleanPin)) {
      setVerifyPinError('Vui lòng nhập đúng 4 chữ số PIN cá nhân.');
      return;
    }

    if (pendingPinIntent.kind === 'SAVE_DRAFT') {
      await executeSaveSchedule(cleanPin);
      return;
    }

    if (pendingPinIntent.kind === 'COPY_FIXED') {
      await executeCopyFromFixed(cleanPin);
      return;
    }

    setIsVerifyingEditPin(true);
    setVerifyPinError(null);
    try {
      const res = await verifyAndCacheMemberPin(selectedMember.id, cleanPin);
      if (res.data !== true) {
        vibrateWarning();
        setVerifyPinError(res.error ?? 'Mã PIN cá nhân không chính xác.');
        return;
      }

      const intent = pendingPinIntent;
      vibrateSuccess();
      setPendingPinIntent(null);
      setVerifyPinInput('');
      setVerifyPinError(null);

      if (intent.kind === 'TOGGLE_SLOT') {
        setLocalError(null);
        setDraftBusySlots((prev) =>
          toggleBusySlot(prev, makeSlotKey(intent.day, intent.hour))
        );
        setIsDirty(true);
      } else if (intent.kind === 'SET_DAY') {
        setLocalError(null);
        setDraftBusySlots((prev) => setDayBusySlots(prev, intent.day, intent.isBusy));
        setIsDirty(true);
      }

      onShowToast?.(`Đã mở khóa chỉnh sửa lịch cho ${selectedMember.name}.`);
    } finally {
      setIsVerifyingEditPin(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = regName.trim();
    if (!cleanName) {
      setRegError('Vui lòng nhập tên của bạn.');
      return;
    }
    const trimmedPin = regPin.trim();
    if (trimmedPin && !isValidFourDigitPin(trimmedPin)) {
      setRegError('Mã PIN cá nhân phải gồm đúng 4 chữ số (hoặc để trống).');
      return;
    }

    setIsRegistering(true);
    setRegError(null);
    try {
      const res = await registerMember({
        name: cleanName,
        gender: regGender,
        rank: regRank,
        noSingles: regNoSingles,
        memberPin: trimmedPin || null,
      });

      if (res.error || !res.data) {
        vibrateWarning();
        setRegError(res.error ?? 'Không thể thêm thành viên mới.');
        return;
      }

      vibrateSuccess();
      selectCurrentMember(res.data.id);
      setRegName('');
      setRegPin('');
      setRegNoSingles(false);
      setShowRegisterModal(false);
      onShowToast?.(`Đã thêm "${res.data.name}" vào CLB! Hãy quét chọn khung giờ bận rồi bấm Nộp lịch.`);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSavePersonalPin = async (removePin: boolean) => {
    if (!selectedMember) return;
    if (removePin && !isHost) return;
    setPinSetupError(null);

    const trimmedCurrent = currentPinInput.trim();
    const trimmedNew = newPinInput.trim();

    if (selectedMember.hasPin && !isHost && !isValidFourDigitPin(trimmedCurrent)) {
      setPinSetupError('Vui lòng nhập đúng 4 chữ số PIN hiện tại.');
      return;
    }

    if (!removePin && !isValidFourDigitPin(trimmedNew)) {
      setPinSetupError('Mã PIN cá nhân mới phải gồm đúng 4 chữ số (VD: 0686).');
      return;
    }

    setIsUpdatingPin(true);
    try {
      const res = await setMemberPersonalPin({
        memberId: selectedMember.id,
        newPin: removePin ? null : trimmedNew,
        currentPin: selectedMember.hasPin && !isHost ? trimmedCurrent : null,
        resetAsHost: isHost && (!trimmedCurrent || removePin),
      });

      if (res.error || res.data !== true) {
        vibrateWarning();
        setPinSetupError(res.error ?? 'Không thể cập nhật PIN cá nhân.');
        return;
      }

      vibrateSuccess();
      setShowPinSetupModal(false);
      setCurrentPinInput('');
      setNewPinInput('');
      onShowToast?.(
        removePin
          ? `Đã gỡ mã PIN cá nhân của ${selectedMember.name}.`
          : `Đã lưu mã PIN 4 số bảo vệ lịch cho ${selectedMember.name}.`
      );
    } finally {
      setIsUpdatingPin(false);
    }
  };

  return (
    <div className="space-y-4" onMouseUp={stopDesktopDrag} onMouseLeave={stopDesktopDrag}>
      {/* Khối chọn thành viên & công cụ Lịch cứng */}
      <div className="ui-card p-4 md:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
          <div className="flex-1 min-w-0">
            <span
              id="schedule-member-picker-label"
              className="block text-[14px] font-semibold mb-1.5"
              style={{ color: 'var(--text-primary)' }}
            >
              Tên của bạn trong CLB
            </span>
            <button
              id="schedule-member-picker-trigger"
              type="button"
              aria-labelledby="schedule-member-picker-label schedule-member-picker-trigger"
              aria-haspopup="dialog"
              aria-expanded={showMemberPicker}
              onClick={() => {
                setMemberSearch('');
                setShowMemberPicker(true);
              }}
              className="w-full min-h-[48px] px-3.5 py-2 rounded-xl flex items-center justify-between gap-2.5 text-left transition-colors"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {selectedMember ? (
                <>
                  <span className="flex items-center gap-2 min-w-0 flex-1">
                    <GenderDot sex={selectedMember.gender} />
                    <span
                      className="text-[14px] font-semibold truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {selectedMember.name}
                    </span>
                    <RankBadge rank={selectedMember.rank} surface="tile" />
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {selectedMember.hasPin && (
                      <Lock
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                        aria-label="Đã khóa PIN bảo vệ"
                      />
                    )}
                    <StatusPill tone={savedEntry ? 'accent' : 'neutral'}>
                      <span>{savedEntry ? 'Đã báo' : 'Chưa báo'}</span>
                    </StatusPill>
                    <ChevronDown
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--text-secondary)' }}
                    />
                  </span>
                </>
              ) : (
                <>
                  <span
                    className="text-[14px] truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Chọn tên thành viên để báo lịch...
                  </span>
                  <ChevronDown
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--text-secondary)' }}
                  />
                </>
              )}
            </button>
          </div>

          {uiPermissions.canSelfRegisterMember && (
            <button
              type="button"
              onClick={() => {
                setRegError(null);
                setShowRegisterModal(true);
              }}
              className="ui-btn ui-btn-secondary px-3.5 shrink-0 self-start sm:self-auto"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Thêm tên mới</span>
            </button>
          )}
        </div>

        {/* Dòng gợi ý / trạng thái PIN nhẹ nhàng bên dưới bộ chọn tên */}
        {selectedMember && (uiPermissions.canSetOwnPin || isHost) && (
          <div
            className="flex items-center gap-1.5 flex-wrap text-[14px] leading-snug"
            style={{ color: 'var(--text-secondary)' }}
          >
            {!selectedMember.hasPin ? (
              <>
                <span>Chưa khóa lịch ·</span>
                <button
                  type="button"
                  onClick={openPinSetupModal}
                  className="min-h-[44px] px-1 inline-flex items-center font-semibold underline decoration-dotted underline-offset-4"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Tạo PIN 4 số nếu muốn tránh sửa nhầm
                </button>
              </>
            ) : isHost ? (
              <>
                <Lock
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                />
                <span>Thành viên có PIN riêng (Host được chỉnh trực tiếp) ·</span>
                <button
                  type="button"
                  onClick={openPinSetupModal}
                  className="min-h-[44px] px-1 inline-flex items-center font-semibold underline decoration-dotted underline-offset-4"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Đổi / Gỡ PIN
                </button>
              </>
            ) : hasUnlockedPersonalPin ? (
              <>
                <LockOpen
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--color-accent)' }}
                />
                <span>Đã mở khóa chỉnh sửa trên máy này ·</span>
                <button
                  type="button"
                  onClick={openPinSetupModal}
                  className="min-h-[44px] px-1 inline-flex items-center font-semibold underline decoration-dotted underline-offset-4"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Đổi PIN 4 số
                </button>
                {lockMemberPin && (
                  <>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => {
                        lockMemberPin(selectedMember.id);
                        onShowToast?.(`Đã khóa lại lịch của ${selectedMember.name} trên máy này.`);
                      }}
                      className="min-h-[44px] px-1 inline-flex items-center font-semibold underline decoration-dotted underline-offset-4"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Khóa lại
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <Lock
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                />
                <span>Xem tự do · Chạm vào ô giờ để nhập PIN sửa lịch ·</span>
                <button
                  type="button"
                  onClick={openPinSetupModal}
                  className="min-h-[44px] px-1 inline-flex items-center font-semibold underline decoration-dotted underline-offset-4"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Đổi PIN 4 số
                </button>
              </>
            )}
          </div>
        )}

        {/* Thanh trạng thái báo lịch & cụm nút Lịch cứng + nút Thông tin (ⓘ) */}
        {selectedMember && (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 pt-2 border-t ui-divider">
            <div className="flex items-center gap-2 flex-wrap">
              {savedEntry ? (
                <StatusPill tone="accent">
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {weekKey === 'FIXED' ? 'Đã lưu lịch cứng' : 'Đã báo lịch tuần này'}
                  </span>
                </StatusPill>
              ) : (
                <StatusPill tone="warning">
                  <span>
                    {weekKey === 'FIXED' ? 'Chưa lưu lịch cứng' : 'Chưa báo lịch tuần này'}
                  </span>
                </StatusPill>
              )}
            </div>

            <div
              ref={fixedInfoWrapRef}
              className="relative flex items-center gap-1.5 flex-wrap"
            >
              {weekKey !== 'FIXED' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      void selectWeek('FIXED');
                    }}
                    className="ui-btn ui-btn-secondary px-3 gap-1.5"
                  >
                    <CalendarClock className="w-4 h-4 shrink-0" />
                    <span>Set lịch cứng</span>
                  </button>

                  <button
                    type="button"
                    disabled={!canEditGrid || isSaving}
                    onClick={() => {
                      void executeCopyFromFixed();
                    }}
                    className="ui-btn ui-btn-accent-soft px-3 gap-1.5"
                  >
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>Áp dụng lịch cứng</span>
                  </button>
                </>
              ) : (
                <>
                  <span
                    className="text-[14px] font-semibold"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    Đang chỉnh Lịch cứng hàng tuần
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void selectWeek(fallbackIsoWeek);
                    }}
                    className="ui-btn ui-btn-secondary px-3 gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4 shrink-0" />
                    <span>Quay lại tuần {fallbackIsoWeek}</span>
                  </button>
                </>
              )}

              <button
                type="button"
                aria-label="Giải thích tính năng lịch cứng"
                aria-expanded={showFixedInfo}
                aria-describedby={showFixedInfo ? 'fixed-schedule-help-popover' : undefined}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') {
                    setShowFixedInfo(true);
                  }
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === 'mouse') {
                    setShowFixedInfo(false);
                  }
                }}
                onClick={() => setShowFixedInfo((v) => !v)}
                className="ui-icon-btn w-11 h-11 rounded-full shrink-0"
              >
                <Info className="w-4 h-4" />
              </button>

              {showFixedInfo && (
                <div
                  id="fixed-schedule-help-popover"
                  role="tooltip"
                  className="absolute left-0 right-0 md:left-auto md:right-0 top-full mt-2 md:w-[340px] z-30 ui-toast p-3.5 text-[14px] leading-relaxed"
                >
                  {FIXED_SCHEDULE_HELP_TEXT}
                </div>
              )}
            </div>
          </div>
        )}

        {isWeekLocked && !isHost && (
          <div className="ui-banner-warning px-3.5 py-2.5 text-[14px] flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>Tuần lịch này đã được Host khóa sổ. Chỉ Host mới có thể điều chỉnh thêm.</span>
          </div>
        )}

        {localError && (
          <div className="ui-banner-danger px-3.5 py-2.5 text-[14px]">
            {localError}
          </div>
        )}
      </div>

      {/* Khi chưa chọn thành viên */}
      {!selectedMember ? (
        <UiEmptyState
          icon={<Sparkles className="w-6 h-6" />}
          title="Chọn tên của bạn để bắt đầu tô lịch"
          description={
            uiPermissions.canSelfRegisterMember
              ? 'Chọn tên từ danh sách thành viên CLB hoặc bấm "Thêm tên mới" nếu bạn lần đầu tham gia.'
              : 'Chọn tên của bạn trong danh sách CLB để khai báo khung giờ bận tuần này.'
          }
          action={
            uiPermissions.canSelfRegisterMember ? (
              <button
                type="button"
                onClick={() => {
                  setRegError(null);
                  setShowRegisterModal(true);
                }}
                className="ui-btn ui-btn-primary rounded-full px-5"
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                <span>Tự thêm tên vào CLB</span>
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="ui-card p-4 md:p-5 space-y-4">
          {/* Thanh chú giải Rảnh / Bận (mặc định hiển thị trọn vẹn 18 kíp 06:00 – 24:00) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap text-[14px]">
              <span
                className="inline-flex items-center gap-1.5 font-semibold"
                style={{ color: 'var(--color-accent)' }}
              >
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    border: '1.5px solid var(--color-accent)',
                  }}
                />
                <span>Rảnh (đi đánh được)</span>
              </span>
              <span
                className="inline-flex items-center gap-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{
                    backgroundColor: 'var(--bg-surface-secondary)',
                    border: '1.5px solid var(--border-strong)',
                  }}
                />
                <span>Bận ({draftBusySlots.length}/126 kíp)</span>
              </span>
            </div>

            <span
              className="text-[14px] tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              Khung giờ: 06:00 – 24:00 (18 kíp/ngày)
            </span>
          </div>

          {/* =================================================================
              GIAO DIỆN MOBILE (< md): Day-Pill T2..CN + Dải quét riêng bên phải
              (`touch-action: none` CHỈ đặt trên dải quét bên phải)
              ================================================================= */}
          <div className="md:hidden space-y-3">
            <div
              role="tablist"
              aria-label="Chọn ngày trong tuần"
              className="grid grid-cols-7 gap-1"
            >
              {SCHEDULE_DAYS.map((day) => {
                const isSelected = selectedDay === day;
                const dayBusy = busyCountByDay[day];
                const dateLabel = weekDisplay.dayDateLabels[day];
                return (
                  <button
                    key={day}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSelectedDay(day)}
                    className="min-h-[54px] rounded-xl flex flex-col items-center justify-center px-1 py-1.5 transition-colors"
                    style={{
                      backgroundColor: isSelected
                        ? 'var(--color-accent)'
                        : 'var(--bg-surface-secondary)',
                      color: isSelected ? 'var(--text-on-accent)' : 'var(--text-primary)',
                    }}
                  >
                    <span className="text-[14px] font-bold leading-tight">
                      {DAY_LABELS_VI[day]}
                    </span>
                    {dateLabel && (
                      <span className="text-[12px] tabular-nums leading-tight opacity-85">
                        {dateLabel}
                      </span>
                    )}
                    <span
                      className="text-[12px] tabular-nums font-semibold leading-tight mt-0.5"
                      style={{
                        opacity: dayBusy > 0 ? 1 : 0.45,
                      }}
                    >
                      {dayBusy > 0 ? `${dayBusy} bận` : 'Rảnh'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Nút thao tác nhanh cho ngày đang chọn + hướng dẫn dải quét */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={!canEditGrid}
                  onClick={() => handleSetDayBusy(selectedDay, false)}
                  className="ui-btn ui-btn-secondary px-3 text-[14px]"
                >
                  <span>Rảnh cả {DAY_LABELS_VI[selectedDay]}</span>
                </button>
                <button
                  type="button"
                  disabled={!canEditGrid}
                  onClick={() => handleSetDayBusy(selectedDay, true)}
                  className="ui-btn ui-btn-secondary px-3 text-[14px]"
                >
                  <span>Bận cả {DAY_LABELS_VI[selectedDay]}</span>
                </button>
              </div>
              <span
                className="text-[12px] font-semibold pr-1 text-right shrink-0"
                style={{ color: 'var(--text-muted)' }}
              >
                Dải quét ↓
              </span>
            </div>

            {/* Danh sách 18 kíp 1h: Cột trái cuộn dọc tự nhiên, Cột phải là 1 dải quét liên tục duy nhất (touch-action: none) */}
            <div className="flex items-start gap-1.5">
              {/* Cột trái: KHÔNG touch-action:none để vuốt dọc scroll mượt; chạm lẻ đảo trạng thái */}
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                {visibleHours.map((hour) => {
                  const slotKey = makeSlotKey(selectedDay, hour);
                  const isBusy = busySlotSet.has(slotKey);
                  return (
                    <button
                      key={hour}
                      type="button"
                      disabled={!canEditGrid}
                      onClick={() => handleToggleSingleSlot(selectedDay, hour)}
                      className="w-full h-[48px] min-h-[48px] px-3.5 rounded-xl flex items-center justify-between gap-3 transition-colors text-left"
                      style={{
                        backgroundColor: isBusy
                          ? 'var(--bg-surface-secondary)'
                          : 'var(--color-accent-soft)',
                        border: `1px solid ${
                          isBusy ? 'var(--border-subtle)' : 'var(--color-accent-border)'
                        }`,
                        color: isBusy ? 'var(--text-muted)' : 'var(--text-primary)',
                      }}
                    >
                      <span className="text-[14px] font-semibold tabular-nums">
                        {formatScheduleSlotRange(hour)}
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5 text-[14px] font-semibold"
                        style={{
                          color: isBusy ? 'var(--text-muted)' : 'var(--color-accent)',
                        }}
                      >
                        {isBusy ? (
                          <>
                            <X className="w-4 h-4 shrink-0" />
                            <span>Bận</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4 shrink-0" />
                            <span>Rảnh</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Cột phải: Dải quét Drag-to-Paint liền mạch — CHỈ đặt touch-action: none tại container này */}
              <div
                data-drag-strip="true"
                aria-label={`Dải quét nhanh khung giờ ngày ${DAY_LABELS_VI[selectedDay]}`}
                style={{
                  touchAction: 'none',
                  WebkitTouchCallout: 'none',
                  opacity: canEditGrid ? 1 : 0.45,
                }}
                onPointerDown={(e) => handleStripPointerDown(e, selectedDay)}
                onPointerMove={handleStripPointerMove}
                onPointerUp={finishStripDrag}
                onPointerCancel={finishStripDrag}
                onLostPointerCapture={finishStripDrag}
                className="w-[58px] shrink-0 flex flex-col gap-1.5 select-none cursor-ns-resize"
              >
                {visibleHours.map((hour) => {
                  const slotKey = makeSlotKey(selectedDay, hour);
                  const isBusy = busySlotSet.has(slotKey);
                  return (
                    <div
                      key={hour}
                      ref={(el) => {
                        mobileRowRefs.current[hour] = el;
                      }}
                      role="button"
                      tabIndex={canEditGrid ? 0 : -1}
                      aria-label={`Quét nhanh khung ${formatScheduleSlotRange(hour)} ${DAY_LABELS_VI[selectedDay]}`}
                      aria-disabled={!canEditGrid}
                      data-slot-key={slotKey}
                      style={{
                        backgroundColor: isBusy
                          ? 'var(--bg-surface-secondary)'
                          : 'var(--color-accent-soft)',
                        border: `1px solid ${
                          isBusy ? 'var(--border-subtle)' : 'var(--color-accent-border)'
                        }`,
                        color: isBusy ? 'var(--text-muted)' : 'var(--color-accent)',
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleToggleSingleSlot(selectedDay, hour);
                        }
                      }}
                      className="w-full h-[48px] min-h-[48px] rounded-xl flex items-center justify-center"
                    >
                      <GripVertical className="w-5 h-5 pointer-events-none" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* =================================================================
              GIAO DIỆN DESKTOP (>= md): Bảng 7 ngày × 18 kíp 1h trực quan
              ================================================================= */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-separate border-spacing-1.5">
              <thead>
                <tr>
                  <th
                    className="w-[112px] text-left text-[14px] font-semibold px-2 py-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Khung giờ
                  </th>
                  {SCHEDULE_DAYS.map((day) => (
                    <th key={day} className="text-center px-1 py-1">
                      <button
                        type="button"
                        disabled={!canEditGrid}
                        onClick={() => {
                          const allBusy = busyCountByDay[day] >= SCHEDULE_HOURS.length;
                          handleSetDayBusy(day, !allBusy);
                        }}
                        title={`Đảo nhanh cả ngày ${DAY_LABELS_VI[day]}`}
                        className="w-full min-h-[44px] rounded-xl px-2 py-1.5 flex flex-col items-center justify-center ui-tile ui-tile-interactive"
                      >
                        <span className="text-[14px] font-bold">{DAY_LABELS_VI[day]}</span>
                        {weekDisplay.dayDateLabels[day] && (
                          <span
                            className="text-[12px] tabular-nums"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {weekDisplay.dayDateLabels[day]}
                          </span>
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleHours.map((hour) => (
                  <tr key={hour}>
                    <td
                      className="text-[14px] font-semibold tabular-nums px-2 py-1 whitespace-nowrap"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {formatScheduleSlotRange(hour)}
                    </td>
                    {SCHEDULE_DAYS.map((day) => {
                      const slotKey = makeSlotKey(day, hour);
                      const isBusy = busySlotSet.has(slotKey);
                      return (
                        <td key={day} className="p-0">
                          <button
                            type="button"
                            disabled={!canEditGrid}
                            onMouseDown={(e) => handleDesktopCellMouseDown(e, day, hour)}
                            onMouseEnter={() => handleDesktopCellMouseEnter(day, hour)}
                            onClick={() => handleDesktopCellClick(day, hour)}
                            style={{
                              backgroundColor: isBusy
                                ? 'var(--bg-surface-secondary)'
                                : 'var(--color-accent-soft)',
                              border: `1px solid ${
                                isBusy ? 'var(--border-subtle)' : 'var(--color-accent-border)'
                              }`,
                              color: isBusy ? 'var(--text-muted)' : 'var(--color-accent)',
                            }}
                            className="w-full min-h-[44px] rounded-xl text-[14px] font-semibold flex items-center justify-center gap-1 select-none transition-colors"
                          >
                            {isBusy ? 'Bận' : 'Rảnh'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ghi chú cá nhân & Nút Nộp lịch */}
          <div className="pt-2 border-t ui-divider space-y-3">
            <div>
              <label
                htmlFor="schedule-member-note"
                className="block text-[14px] font-semibold mb-1.5"
                style={{ color: 'var(--text-primary)' }}
              >
                Ghi chú kèm theo (tùy chọn)
              </label>
              <input
                id="schedule-member-note"
                type="text"
                maxLength={300}
                disabled={!canEditGrid}
                readOnly={requiresPinBeforeEdit}
                value={draftNote}
                onClick={(e) => {
                  if (canEditGrid && requiresPinBeforeEdit) {
                    e.currentTarget.blur();
                    requestPinForEdit({ kind: 'UNLOCK_ONLY' });
                  }
                }}
                onFocus={(e) => {
                  if (canEditGrid && requiresPinBeforeEdit) {
                    e.currentTarget.blur();
                    requestPinForEdit({ kind: 'UNLOCK_ONLY' });
                  }
                }}
                onChange={(e) => {
                  if (requiresPinBeforeEdit) return;
                  setDraftNote(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="VD: Thứ 5 vào sân trễ 30 phút, Chủ Nhật xin về sớm..."
                className="ui-input"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
                {isDirty
                  ? 'Bạn có thay đổi mới chưa lưu lên Cloud.'
                  : !savedEntry
                    ? 'Nếu tuần này rảnh toàn bộ, hãy bấm Nộp lịch để xác nhận có mặt.'
                    : 'Lịch của bạn đã được đồng bộ.'}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isDirty && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      setDraftBusySlots(normalizeBusySlots(savedEntry?.busySlots ?? []));
                      setDraftNote(savedEntry?.note ?? '');
                      setIsDirty(false);
                      setLocalError(null);
                    }}
                    className="ui-btn ui-btn-secondary px-4"
                  >
                    <span>Hoàn tác nháp</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={!canEditGrid || isSaving}
                  onClick={() => {
                    void executeSaveSchedule();
                  }}
                  className="ui-btn ui-btn-primary rounded-full px-5 flex-1 sm:flex-initial"
                >
                  <Save className="w-4 h-4 shrink-0" />
                  <span>
                    {isSaving
                      ? 'Đang lưu...'
                      : weekKey === 'FIXED'
                        ? 'Lưu lịch cứng'
                        : savedEntry
                          ? 'Cập nhật lịch tuần'
                          : 'Nộp lịch tuần này'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 0: BỘ CHỌN THÀNH VIÊN CHUẨN MOBILE 1 TAY (BOTTOM SHEET / MODAL) */}
      <UiModal
        isOpen={showMemberPicker}
        onClose={() => {
          setShowMemberPicker(false);
          setMemberSearch('');
        }}
        sheetOnMobile
        maxWidthClass="max-w-md"
        title="Chọn thành viên báo lịch"
        subtitle={
          club ? `${club.name} · ${activeMembers.length} thành viên` : undefined
        }
        footer={
          uiPermissions.canSelfRegisterMember ? (
            <button
              type="button"
              onClick={() => {
                setShowMemberPicker(false);
                setMemberSearch('');
                setRegError(null);
                setShowRegisterModal(true);
              }}
              className="ui-btn ui-btn-secondary w-full justify-center"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Chưa có tên? Thêm tên mới vào CLB</span>
            </button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {activeMembers.length >= 5 && (
            <div className="relative">
              <Search
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Tìm nhanh theo tên hoặc trình độ..."
                className="ui-input pl-10"
              />
            </div>
          )}

          {filteredPickerMembers.length === 0 ? (
            <p
              className="py-6 text-center text-[14px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {activeMembers.length === 0
                ? 'CLB chưa có thành viên nào.'
                : 'Không tìm thấy thành viên phù hợp.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {filteredPickerMembers.map((m) => {
                const isSelected = m.id === selectedMemberId;
                const hasSubmitted = Boolean(weekEntriesByMemberId[m.id]);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setLocalError(null);
                      selectCurrentMember(m.id);
                      setShowMemberPicker(false);
                      setMemberSearch('');
                    }}
                    className="w-full min-h-[50px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors"
                    style={{
                      backgroundColor: isSelected
                        ? 'var(--color-accent-soft)'
                        : 'var(--bg-surface-secondary)',
                      border: `1px solid ${
                        isSelected ? 'var(--color-accent-border)' : 'var(--border-subtle)'
                      }`,
                    }}
                  >
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      <GenderDot sex={m.gender} />
                      <span
                        className="text-[14px] font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {m.name}
                      </span>
                      <RankBadge rank={m.rank} surface="tile" />
                    </span>

                    <span className="flex items-center gap-2 shrink-0">
                      {m.hasPin && (
                        <Lock
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                          aria-label="Đã khóa PIN bảo vệ"
                        />
                      )}
                      <StatusPill tone={hasSubmitted ? 'accent' : 'neutral'}>
                        <span>{hasSubmitted ? 'Đã báo' : 'Chưa báo'}</span>
                      </StatusPill>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </UiModal>

      {/* MODAL 1: TỰ ĐĂNG KÝ TÊN MỚI VÀO CLB */}
      <UiModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        sheetOnMobile
        title="Thêm thành viên vào CLB"
        subtitle={club ? `Câu lạc bộ ${club.name}` : undefined}
      >
        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="club-reg-name"
              className="block text-[14px] font-semibold mb-1.5"
              style={{ color: 'var(--text-primary)' }}
            >
              Tên hiển thị trên sân
            </label>
            <input
              id="club-reg-name"
              type="text"
              maxLength={60}
              autoFocus
              value={regName}
              onChange={(e) => {
                setRegName(e.target.value);
                setRegError(null);
              }}
              placeholder="VD: Minh Tuấn..."
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
                sex={regGender}
                onClick={() => setRegGender((g) => (g === 'M' ? 'F' : 'M'))}
              />
            </div>

            <div className="flex-1 min-w-0">
              <label
                htmlFor="club-reg-rank"
                className="block text-[14px] font-semibold mb-1.5"
                style={{ color: 'var(--text-primary)' }}
              >
                Trình độ ước tính
              </label>
              <select
                id="club-reg-rank"
                value={regRank}
                onChange={(e) => setRegRank(e.target.value as BadmintonRank)}
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

          <label className="ui-tile px-3.5 py-3 flex items-center justify-between gap-3 min-h-[48px] cursor-pointer">
            <span className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
              Chỉ đánh đôi (từ chối xếp trận đơn)
            </span>
            <input
              type="checkbox"
              checked={regNoSingles}
              onChange={(e) => setRegNoSingles(e.target.checked)}
              className="ui-checkbox w-5 h-5"
            />
          </label>

          <div>
            <label
              htmlFor="club-reg-pin"
              className="block text-[14px] font-semibold mb-1.5"
              style={{ color: 'var(--text-primary)' }}
            >
              Mã PIN 4 số cá nhân (tùy chọn)
            </label>
            <input
              id="club-reg-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={regPin}
              onChange={(e) => {
                setRegPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                setRegError(null);
              }}
              placeholder="Để trống hoặc nhập 4 chữ số (VD: 1234)"
              className="ui-input font-mono-tabular"
            />
            <p className="text-[14px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              Giúp tránh người khác bấm nhầm sửa lịch của bạn.
            </p>
          </div>

          {regError && (
            <div className="ui-banner-danger px-3.5 py-2.5 text-[14px]">{regError}</div>
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setShowRegisterModal(false)}
              className="ui-btn ui-btn-secondary flex-1"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isRegistering}
              className="ui-btn ui-btn-primary rounded-full flex-1"
            >
              {isRegistering ? 'Đang lưu...' : 'Thêm vào CLB'}
            </button>
          </div>
        </form>
      </UiModal>

      {/* MODAL 2: TẠO / ĐỔI / GỠ PIN 4 SỐ CÁ NHÂN */}
      <UiModal
        isOpen={showPinSetupModal && Boolean(selectedMember)}
        onClose={() => setShowPinSetupModal(false)}
        sheetOnMobile
        maxWidthClass="max-w-md"
        title={selectedMember?.hasPin ? 'Quản lý PIN 4 số cá nhân' : 'Tạo PIN 4 số cá nhân'}
        subtitle={selectedMember ? `Thành viên: ${selectedMember.name}` : undefined}
      >
        <div className="space-y-4">
          {selectedMember?.hasPin && !isHost && (
            <div>
              <label
                htmlFor="member-current-pin"
                className="block text-[14px] font-semibold mb-1.5"
                style={{ color: 'var(--text-primary)' }}
              >
                Mã PIN 4 số hiện tại
              </label>
              <input
                id="member-current-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={currentPinInput}
                onChange={(e) => {
                  setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setPinSetupError(null);
                }}
                placeholder="Nhập 4 số hiện tại..."
                className="ui-input font-mono-tabular text-center text-[18px] tracking-widest"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="member-new-pin"
              className="block text-[14px] font-semibold mb-1.5"
              style={{ color: 'var(--text-primary)' }}
            >
              {selectedMember?.hasPin ? 'Mã PIN 4 số mới' : 'Nhập mã PIN 4 chữ số'}
            </label>
            <input
              id="member-new-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={newPinInput}
              onChange={(e) => {
                setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                setPinSetupError(null);
              }}
              placeholder="VD: 0686"
              className="ui-input font-mono-tabular text-center text-[18px] tracking-widest"
            />
          </div>

          {selectedMember?.hasPin && !isHost && (
            <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
              Quên hoặc muốn gỡ hẳn mã PIN? Hãy nhờ Quản trị CLB bấm <strong>Reset PIN</strong>.
            </p>
          )}

          {pinSetupError && (
            <div className="ui-banner-danger px-3.5 py-2.5 text-[14px]">{pinSetupError}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            {selectedMember?.hasPin && isHost && (
              <button
                type="button"
                disabled={isUpdatingPin}
                onClick={() => {
                  void handleSavePersonalPin(true);
                }}
                className="ui-btn ui-btn-danger-soft flex-1"
              >
                Gỡ PIN
              </button>
            )}
            <button
              type="button"
              disabled={isUpdatingPin}
              onClick={() => {
                void handleSavePersonalPin(false);
              }}
              className="ui-btn ui-btn-primary rounded-full flex-1"
            >
              {isUpdatingPin ? 'Đang lưu...' : 'Lưu PIN 4 số'}
            </button>
          </div>
        </div>
      </UiModal>

      {/* MODAL 3: NHẬP PIN 4 SỐ ĐỂ CHỈNH SỬA LỊCH */}
      <UiModal
        isOpen={pendingPinIntent !== null && Boolean(selectedMember)}
        onClose={() => {
          setPendingPinIntent(null);
          setVerifyPinInput('');
          setVerifyPinError(null);
        }}
        sheetOnMobile
        maxWidthClass="max-w-sm"
        title="Nhập PIN 4 số để chỉnh sửa lịch"
        subtitle={selectedMember ? `Thành viên: ${selectedMember.name}` : undefined}
      >
        <form onSubmit={handleVerifyPinForEditSubmit} className="space-y-4">
          <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
            Lịch của <strong>{selectedMember?.name}</strong> đang được khóa bằng PIN 4 số. Nhập đúng một lần để chỉnh sửa thoải mái trên thiết bị này.
          </p>

          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoFocus
            value={verifyPinInput}
            onChange={(e) => {
              setVerifyPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
              setVerifyPinError(null);
            }}
            placeholder="Nhập PIN 4 số..."
            className="ui-input font-mono-tabular text-center text-[18px] tracking-widest font-bold"
          />

          {verifyPinError && (
            <div className="ui-banner-danger px-3.5 py-2.5 text-[14px]">{verifyPinError}</div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPendingPinIntent(null);
                setVerifyPinInput('');
                setVerifyPinError(null);
              }}
              className="ui-btn ui-btn-secondary flex-1"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving || isVerifyingEditPin}
              className="ui-btn ui-btn-primary rounded-full flex-1"
            >
              {isSaving || isVerifyingEditPin ? 'Đang mở khóa...' : 'Mở khóa'}
            </button>
          </div>
        </form>
      </UiModal>
    </div>
  );
};
