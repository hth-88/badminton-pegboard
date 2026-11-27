import React, { useMemo, useState } from 'react';
import {
  Award,
  ChevronDown,
  ChevronUp,
  Clock,
  GitBranch,
  Users,
} from 'lucide-react';
import {
  formatHourPoint,
  formatWindowLabel,
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

      {/* 3. Khối Top Khung Giờ Vàng & Gợi ý chia 2 ca tối ưu */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Top khung giờ vàng */}
        <div className="ui-card p-4 md:p-5 space-y-3">
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
                <button
                  key={`${slot.dayOfWeek}-${slot.startHour}`}
                  type="button"
                  onClick={() => onSelectHeatmapSlot(slot)}
                  className="w-full min-h-[52px] px-3.5 py-2.5 ui-tile ui-tile-interactive flex items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-7 h-7 rounded-full text-[12px] font-bold tabular-nums flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor:
                          idx === 0 ? 'var(--color-accent)' : 'var(--color-accent-soft)',
                        color: idx === 0 ? 'var(--text-on-accent)' : 'var(--color-accent)',
                      }}
                    >
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div
                        className="text-[15px] font-bold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {formatWindowLabel(slot.dayOfWeek, slot.startHour, slot.endHour)}
                      </div>
                      {slot.partialCount > 0 && (
                        <div
                          className="text-[12px] tabular-nums"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          +{slot.partialCount} người vào muộn / về sớm
                        </div>
                      )}
                    </div>
                  </div>

                  <StatusPill tone="accent">
                    <span className="tabular-nums font-bold">
                      {slot.freeCount}/{slot.submittedCount} rảnh
                    </span>
                  </StatusPill>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Gợi ý chia 2 ca tối ưu */}
        <div className="ui-card p-4 md:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 shrink-0" style={{ color: 'var(--color-accent)' }} />
            <h3
              className="text-[16px] font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Gợi ý chia 2 ca tối ưu
            </h3>
          </div>

          {twoShiftSuggestions.length === 0 ? (
            <div className="ui-tile px-4 py-4 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
              Cần ít nhất 2 khung giờ độc lập đạt số người tối thiểu để hệ thống gợi ý chia 2 ca.
            </div>
          ) : (
            <div className="space-y-2.5">
              {twoShiftSuggestions.slice(0, 3).map((sug, idx) => (
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
                    <button
                      type="button"
                      onClick={() =>
                        onSelectHeatmapSlot(
                          sug.shiftA.slot,
                          sug.shiftA.assignedMemberIds,
                          'Ca 1'
                        )
                      }
                      className="ui-btn ui-btn-secondary justify-between px-3 w-full"
                      style={{ backgroundColor: 'var(--bg-surface)' }}
                    >
                      <span className="truncate font-semibold">
                        Ca 1: {formatWindowLabel(
                          sug.shiftA.slot.dayOfWeek,
                          sug.shiftA.slot.startHour,
                          sug.shiftA.slot.endHour
                        )}
                      </span>
                      <span
                        className="tabular-nums font-bold shrink-0"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        {sug.shiftA.slot.freeCount} người
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onSelectHeatmapSlot(
                          sug.shiftB.slot,
                          sug.shiftB.assignedMemberIds,
                          'Ca 2'
                        )
                      }
                      className="ui-btn ui-btn-secondary justify-between px-3 w-full"
                      style={{ backgroundColor: 'var(--bg-surface)' }}
                    >
                      <span className="truncate font-semibold">
                        Ca 2: {formatWindowLabel(
                          sug.shiftB.slot.dayOfWeek,
                          sug.shiftB.slot.startHour,
                          sug.shiftB.slot.endHour
                        )}
                      </span>
                      <span
                        className="tabular-nums font-bold shrink-0"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        {sug.shiftB.slot.freeCount} người
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
