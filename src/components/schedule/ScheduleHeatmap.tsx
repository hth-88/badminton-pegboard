import React, { useMemo, useState } from 'react';
import {
  Award,
  ChevronDown,
  ChevronUp,
  Clock,
  GitBranch,
  Users,
  X,
} from 'lucide-react';
import {
  findFullCoverageSlot,
  formatHourPoint,
  formatWindowLabel,
  getTimeOfDayBucket,
  rankGoldenSlots,
  suggestTwoShifts,
  type TimeOfDayBucket,
} from '../../engine/scheduleEngine';
import type { useClubSchedule } from '../../hooks/useClubSchedule';
import {
  DAY_LABELS_VI,
  SCHEDULE_DAYS,
  SESSION_DURATION_OPTIONS,
  type DayOfWeek,
  type HeatmapSlot,
  type ScheduleHour,
} from '../../types/schedule';
import { StatusPill } from '../ui/Primitives';
import {
  formatWeekKeyDisplay,
  getHeatmapIntensityTier,
  getVisibleScheduleHours,
} from './scheduleUiHelpers';

export interface ScheduleHeatmapProps {
  schedule: ReturnType<typeof useClubSchedule>;
  onSelectHeatmapSlot: (
    slot: HeatmapSlot,
    preselectedMemberIds?: readonly string[],
    shiftLabel?: string
  ) => void;
}

export const ScheduleHeatmap: React.FC<ScheduleHeatmapProps> = ({
  schedule,
  onSelectHeatmapSlot,
}) => {
  const {
    weekKey,
    durationHours,
    submissionSummary,
    heatmapSlots,
    goldenSlots,
    twoShiftSuggestions,
    setDurationHours,
  } = schedule;

  const [showUnsubmittedList, setShowUnsubmittedList] = useState(false);
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [slotFilter, setSlotFilter] = useState<SlotFilter>('ALL');
  const [showTwoDayAlternatives, setShowTwoDayAlternatives] = useState(false);

  // Toàn bộ khung giờ đạt ngưỡng (không giới hạn 5) cho modal `Xem tất cả`
  const allGoldenSlots = useMemo(
    () =>
      rankGoldenSlots(heatmapSlots, {
        limit: Math.max(1, heatmapSlots.length),
        requireMinPlayers: true,
      }),
    [heatmapSlots]
  );

  const filteredAllSlots = useMemo(
    () =>
      slotFilter === 'ALL'
        ? allGoldenSlots
        : allGoldenSlots.filter((s) => getTimeOfDayBucket(s.startHour) === slotFilter),
    [allGoldenSlots, slotFilter]
  );

  // Đã có khung đơn phủ 100% người nộp lịch -> chưa cần chia 2 ca
  const fullCoverageSlot = useMemo(() => findFullCoverageSlot(heatmapSlots), [heatmapSlots]);

  // Phương án 2 buổi khác ngày (chỉ tính khi Host yêu cầu lúc đã có khung phủ 100%)
  const twoDayAlternatives = useMemo(
    () =>
      fullCoverageSlot && showTwoDayAlternatives
        ? suggestTwoShifts({
            heatmapSlots,
            members: schedule.members,
            entriesByMemberId: schedule.weekEntriesByMemberId,
            minPlayersPerShift: schedule.club?.settings.minPlayersPerShift,
            limit: 3,
            requireDifferentDays: true,
            allowRedundantPairs: true,
          })
        : [],
    [
      fullCoverageSlot,
      showTwoDayAlternatives,
      heatmapSlots,
      schedule.members,
      schedule.weekEntriesByMemberId,
      schedule.club,
    ]
  );

  const visibleTwoShiftList = fullCoverageSlot ? twoDayAlternatives : twoShiftSuggestions;

  const weekDisplay = useMemo(() => formatWeekKeyDisplay(weekKey), [weekKey]);

  // Ánh xạ O(1) theo `${dayOfWeek}-${startHour}`
  const slotMap = useMemo(() => {
    const map = new Map<string, HeatmapSlot>();
    for (const s of heatmapSlots) {
      map.set(`${s.dayOfWeek}-${s.startHour}`, s);
    }
    return map;
  }, [heatmapSlots]);

  const visibleStartHours = useMemo(() => {
    const candidateHours = getVisibleScheduleHours();
    return candidateHours.filter((h) => h + Math.ceil(durationHours) <= 24 && h + durationHours <= 24);
  }, [durationHours]);

  const submissionPercent = Math.round(submissionSummary.submissionRatio * 100);

  return (
    <div className="space-y-4">
      {/* 1. Tiến độ nộp lịch & Bộ chọn thời lượng */}
      <div className="ui-card p-4 md:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[15px] font-bold tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                Đã nộp lịch: {submissionSummary.submittedCount}/{submissionSummary.totalActiveCount} thành viên
              </span>
              <StatusPill tone={submissionSummary.submittedCount > 0 ? 'accent' : 'neutral'}>
                <span className="tabular-nums">{submissionPercent}%</span>
              </StatusPill>
            </div>
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-surface-secondary)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${submissionPercent}%`,
                  backgroundColor: 'var(--color-accent)',
                }}
              />
            </div>
          </div>

          {submissionSummary.unsubmittedMembers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowUnsubmittedList((v) => !v)}
              className="ui-btn ui-btn-secondary px-3.5 shrink-0 self-start sm:self-auto"
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Chưa nộp ({submissionSummary.unsubmittedMembers.length})</span>
              {showUnsubmittedList ? (
                <ChevronUp className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0" />
              )}
            </button>
          )}
        </div>

        {showUnsubmittedList && submissionSummary.unsubmittedMembers.length > 0 && (
          <div className="ui-tile p-3 flex flex-wrap gap-1.5">
            {submissionSummary.unsubmittedMembers.map((m) => (
              <span
                key={m.id}
                className="ui-pill ui-pill-neutral text-[12px]"
                style={{ backgroundColor: 'var(--bg-surface)' }}
              >
                {m.name}
              </span>
            ))}
          </div>
        )}

        {/* Bộ chọn thời lượng (1h / 1.5h / 2h / 3h) */}
        <div className="pt-2 border-t ui-divider flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold mr-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>Thời lượng ca:</span>
          </span>
          <div
            role="radiogroup"
            aria-label="Chọn thời lượng buổi đánh"
            className="ui-segmented-track inline-flex items-center gap-1"
          >
            {SESSION_DURATION_OPTIONS.map((opt) => {
              const active = durationHours === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDurationHours(opt)}
                  className="min-h-[44px] min-w-[56px] px-3 rounded-xl text-[14px] font-bold tabular-nums transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  }}
                >
                  {opt}h
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Lưới Heatmap đơn sắc (--color-accent) */}
      <div className="ui-card p-4 md:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3
              className="text-[16px] font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Bản đồ người rảnh ({durationHours}h/ca)
            </h3>
            <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
              Chạm vào bất kỳ ô nào để xem danh sách rảnh / vào muộn / về sớm và chốt kèo
            </p>
          </div>

          {/* Chú giải 5 bậc opacity đơn sắc --color-accent */}
          <div className="flex items-center gap-1.5 text-[12px] shrink-0" style={{ color: 'var(--text-muted)' }}>
            <span>Ít</span>
            <span className="w-4 h-4 rounded ui-heatmap-0 inline-block" aria-hidden="true" />
            <span className="w-4 h-4 rounded ui-heatmap-1 inline-block" aria-hidden="true" />
            <span className="w-4 h-4 rounded ui-heatmap-2 inline-block" aria-hidden="true" />
            <span className="w-4 h-4 rounded ui-heatmap-3 inline-block" aria-hidden="true" />
            <span className="w-4 h-4 rounded ui-heatmap-4 inline-block" aria-hidden="true" />
            <span>Đông</span>
          </div>
        </div>

        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[520px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th
                  className="w-[82px] sticky left-0 z-10 text-left text-[14px] font-semibold px-2 py-1.5"
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-surface)',
                  }}
                >
                  Giờ vào
                </th>
                {SCHEDULE_DAYS.map((day: DayOfWeek) => (
                  <th key={day} className="text-center px-1 py-1">
                    <div className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      {DAY_LABELS_VI[day]}
                    </div>
                    {weekDisplay.dayDateLabels[day] && (
                      <div
                        className="text-[12px] tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {weekDisplay.dayDateLabels[day]}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleStartHours.map((startHour: ScheduleHour) => {
                const endHour = startHour + durationHours;
                return (
                  <tr key={startHour}>
                    <td
                      className="sticky left-0 z-10 text-[14px] font-semibold tabular-nums px-2 py-1 whitespace-nowrap"
                      style={{
                        color: 'var(--text-secondary)',
                        backgroundColor: 'var(--bg-surface)',
                      }}
                    >
                      {formatHourPoint(startHour)}–{formatHourPoint(endHour)}
                    </td>
                    {SCHEDULE_DAYS.map((day: DayOfWeek) => {
                      const slot = slotMap.get(`${day}-${startHour}`);
                      if (!slot) {
                        return <td key={day} />;
                      }
                      const tier = getHeatmapIntensityTier(slot);
                      return (
                        <td key={day} className="p-0">
                          <button
                            type="button"
                            onClick={() => onSelectHeatmapSlot(slot)}
                            aria-label={`${formatWindowLabel(
                              day,
                              slot.startHour,
                              slot.endHour
                            )}: ${slot.freeCount}/${slot.submittedCount} rảnh trọn buổi`}
                            className={`w-full min-h-[46px] px-1.5 py-1 flex flex-col items-center justify-center ui-heatmap-cell ui-heatmap-${tier}`}
                          >
                            <span className="text-[14px] font-bold tabular-nums leading-tight">
                              {slot.freeCount}/{slot.submittedCount}
                            </span>
                            {slot.partialCount > 0 && (
                              <span className="text-[12px] tabular-nums leading-tight opacity-85">
                                +{slot.partialCount} kíp
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Khối Top Khung Giờ Vàng & Gợi ý chia 2 ca tối ưu (2 card cao bằng nhau) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Top khung giờ vàng */}
        <div className="ui-card p-4 md:p-5 space-y-3 h-full flex flex-col">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 shrink-0" style={{ color: 'var(--color-accent)' }} />
            <h3
              className="text-[16px] font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Top khung giờ vàng ({durationHours}h)
            </h3>
          </div>

          {goldenSlots.length === 0 ? (
            <div className="ui-tile px-4 py-4 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
              {submissionSummary.submittedCount === 0
                ? 'Chưa có thành viên nào nộp lịch cho tuần này.'
                : 'Chưa có khung giờ nào đủ số người tối thiểu để mở sân.'}
            </div>
          ) : (
            <div className="space-y-2">
              {goldenSlots.map((slot, idx) => (
                <GoldenSlotRow
                  key={`${slot.dayOfWeek}-${slot.startHour}`}
                  slot={slot}
                  rank={idx + 1}
                  onPick={() => onSelectHeatmapSlot(slot)}
                />
              ))}
            </div>
          )}

          {allGoldenSlots.length > goldenSlots.length && (
            <button
              type="button"
              onClick={() => setShowAllSlots(true)}
              className="ui-btn ui-btn-secondary w-full mt-auto"
            >
              Xem tất cả ({allGoldenSlots.length} khung giờ)
            </button>
          )}
        </div>

        {/* Gợi ý chia 2 ca tối ưu */}
        <div className="ui-card p-4 md:p-5 space-y-3 h-full flex flex-col">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 shrink-0" style={{ color: 'var(--color-accent)' }} />
            <h3
              className="text-[16px] font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Gợi ý chia 2 ca tối ưu
            </h3>
          </div>

          {fullCoverageSlot ? (
            <div className="space-y-2.5">
              <div
                className="ui-tile px-4 py-3.5 text-[14px] font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Cả nhóm đã có khung giờ rảnh chung ({fullCoverageSlot.freeCount}/
                {fullCoverageSlot.submittedCount}) — chưa cần chia 2 ca
                <div
                  className="mt-1 text-[13px] font-medium tabular-nums"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {formatWindowLabel(
                    fullCoverageSlot.dayOfWeek,
                    fullCoverageSlot.startHour,
                    fullCoverageSlot.endHour
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSelectHeatmapSlot(fullCoverageSlot)}
                  className="ui-btn ui-btn-primary w-full"
                >
                  Đưa vào buổi
                </button>
                <button
                  type="button"
                  aria-pressed={showTwoDayAlternatives}
                  onClick={() => setShowTwoDayAlternatives((v) => !v)}
                  className="ui-btn ui-btn-secondary w-full"
                >
                  Tìm 2 buổi khác ngày trong tuần
                </button>
              </div>
            </div>
          ) : null}

          {fullCoverageSlot && !showTwoDayAlternatives ? null : visibleTwoShiftList.length === 0 ? (
            <div className="ui-tile px-4 py-4 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
              {fullCoverageSlot
                ? 'Chưa tìm được 2 buổi khác ngày cùng đạt số người tối thiểu.'
                : 'Cần ít nhất 2 khung giờ độc lập, mỗi khung đạt số người tối thiểu và bổ sung người cho nhau, để hệ thống gợi ý chia 2 ca.'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleTwoShiftList.slice(0, 3).map((sug, idx) => (
                <div
                  key={`${sug.shiftA.slot.dayOfWeek}-${sug.shiftA.slot.startHour}_${sug.shiftB.slot.dayOfWeek}-${sug.shiftB.slot.startHour}`}
                  className="ui-tile p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className="text-[14px] font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Phương án {idx + 1}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusPill tone="accent">
                        <span className="tabular-nums">
                          Phủ {sug.coveredMemberIds.length}/{submissionSummary.submittedCount} người
                        </span>
                      </StatusPill>
                      {sug.overlapMemberIds.length > 0 && (
                        <StatusPill tone="neutral">
                          <span className="tabular-nums">
                            Trùng {sug.overlapMemberIds.length}
                          </span>
                        </StatusPill>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {([
                      ['Ca 1', sug.shiftA],
                      ['Ca 2', sug.shiftB],
                    ] as const).map(([label, shift]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          onSelectHeatmapSlot(shift.slot, shift.assignedMemberIds, label)
                        }
                        aria-label={`Chọn ${label}: ${formatWindowLabel(
                          shift.slot.dayOfWeek,
                          shift.slot.startHour,
                          shift.slot.endHour
                        )}`}
                        className="ui-btn ui-btn-secondary justify-between px-3 w-full"
                        style={{ backgroundColor: 'var(--bg-surface)' }}
                      >
                        <span className="truncate font-semibold">
                          {label}:{' '}
                          {formatWindowLabel(
                            shift.slot.dayOfWeek,
                            shift.slot.startHour,
                            shift.slot.endHour
                          )}
                        </span>
                        <span
                          className="tabular-nums font-bold shrink-0"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          {shift.slot.freeCount} người · Chọn ca
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal/Drawer: Xem tất cả khung giờ + bộ lọc nhanh */}
      {showAllSlots && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowAllSlots(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Tất cả ${allGoldenSlots.length} khung giờ`}
            className="ui-card w-full sm:max-w-lg max-h-[85vh] flex flex-col p-4 md:p-5 gap-3"
            style={{ borderRadius: 'var(--radius-modal)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Tất cả khung giờ ({allGoldenSlots.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowAllSlots(false)}
                aria-label="Đóng"
                className="ui-btn ui-btn-secondary px-3"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              role="radiogroup"
              aria-label="Lọc theo buổi"
              className="ui-segmented-track inline-flex items-center gap-1 self-start"
            >
              {SLOT_FILTER_OPTIONS.map((opt) => {
                const active = slotFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSlotFilter(opt.value)}
                    className="min-h-[44px] px-3.5 rounded-xl text-[14px] font-bold transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                      color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 overflow-y-auto min-h-0">
              {filteredAllSlots.length === 0 ? (
                <div className="ui-tile px-4 py-4 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
                  Không có khung giờ nào trong buổi này.
                </div>
              ) : (
                filteredAllSlots.map((slot) => (
                  <GoldenSlotRow
                    key={`all-${slot.dayOfWeek}-${slot.startHour}`}
                    slot={slot}
                    onPick={() => {
                      setShowAllSlots(false);
                      onSelectHeatmapSlot(slot);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

type SlotFilter = 'ALL' | TimeOfDayBucket;

const SLOT_FILTER_OPTIONS: { value: SlotFilter; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'MORNING', label: 'Sáng' },
  { value: 'AFTERNOON', label: 'Chiều' },
  { value: 'EVENING', label: 'Tối' },
];

/** Dòng gợi ý khung giờ kèm nút 1 chạm `Đưa vào buổi` */
const GoldenSlotRow: React.FC<{
  slot: HeatmapSlot;
  rank?: number;
  onPick: () => void;
}> = ({ slot, rank, onPick }) => (
  <div className="w-full min-h-[52px] px-3.5 py-2.5 ui-tile flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      {rank !== undefined && (
        <span
          className="w-7 h-7 rounded-full text-[12px] font-bold tabular-nums flex items-center justify-center shrink-0"
          style={{
            backgroundColor: rank === 1 ? 'var(--color-accent)' : 'var(--color-accent-soft)',
            color: rank === 1 ? 'var(--text-on-accent)' : 'var(--color-accent)',
          }}
        >
          #{rank}
        </span>
      )}
      <div className="min-w-0">
        <div
          className="text-[15px] font-bold truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {formatWindowLabel(slot.dayOfWeek, slot.startHour, slot.endHour)}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusPill tone="accent">
            <span className="tabular-nums font-bold">
              {slot.freeCount}/{slot.submittedCount} rảnh
            </span>
          </StatusPill>
          {slot.partialCount > 0 && (
            <span className="text-[12px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              +{slot.partialCount} vào muộn / về sớm
            </span>
          )}
        </div>
      </div>
    </div>

    <button
      type="button"
      onClick={onPick}
      aria-label={`Đưa vào buổi: ${formatWindowLabel(slot.dayOfWeek, slot.startHour, slot.endHour)}`}
      className="ui-btn ui-btn-primary px-3.5 shrink-0"
    >
      Đưa vào buổi
    </button>
  </div>
);
