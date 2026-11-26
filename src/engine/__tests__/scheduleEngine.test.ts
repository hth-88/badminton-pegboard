import { describe, expect, it, vi } from 'vitest';
import {
  buildAllSlotKeys,
  buildWeeklyScheduleView,
  computeHeatmap,
  copyFixedScheduleToWeek,
  copyFixedSlotsForMember,
  doHeatmapSlotsOverlap,
  formatHourPoint,
  formatWindowLabel,
  getCoveredSlotKeysForWindow,
  getIsoWeekDateRange,
  getIsoWeekKeyFromDate,
  getIsoWeeksInYear,
  getScheduleSubmissionSummary,
  isIsoWeekKey,
  isValidSlotKey,
  isValidWeekKey,
  makeSlotKey,
  normalizeBusySlots,
  parseSlotKey,
  rankGoldenSlots,
  setDayBusySlots,
  shiftIsoWeekKey,
  suggestTwoShifts,
   toggleBusySlot,
  TOTAL_WEEKLY_SLOTS,
} from '../scheduleEngine';
import type { ClubMember, MemberScheduleEntry, ScheduleSlotKey, WeekKey } from '../../types/schedule';

function makeMember(
  id: string,
  name: string,
  overrides: Partial<ClubMember> = {}
): ClubMember {
  return {
    id,
    clubCode: 'CLB-TEST',
    name,
    gender: 'M',
    rank: 'tb',
    rankScore: 10,
    noSingles: false,
    hasPin: false,
    isActive: true,
    authUserId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeScheduleEntry(
  memberId: string,
  busySlots: ScheduleSlotKey[],
  weekKey: WeekKey = '2026-W48',
  note = ''
): MemberScheduleEntry {
  return {
    id: `sched_${weekKey}_${memberId}`,
    clubCode: 'CLB-TEST',
    weekKey,
    memberId,
    busySlots,
    note,
    updatedAt: '2026-11-24T10:00:00Z',
  };
}

describe('Phase 2 — Pure Schedule Engine (src/engine/scheduleEngine.ts)', () => {
  describe('1. Lưới 17 kíp (7h–24h) × 7 ngày (T2..CN)', () => {
    it('sinh đủ 119 kíp hợp lệ từ 0-7 tới 6-23 và validate chặt chẽ khóa kíp', () => {
      const allKeys = buildAllSlotKeys();
      expect(TOTAL_WEEKLY_SLOTS).toBe(119);
      expect(allKeys).toHaveLength(119);
      expect(allKeys[0]).toBe('0-7');
      expect(allKeys[16]).toBe('0-23');
      expect(allKeys[118]).toBe('6-23');

      expect(isValidSlotKey('0-7')).toBe(true);
      expect(isValidSlotKey('4-19')).toBe(true);
      expect(isValidSlotKey('6-23')).toBe(true);

      // Các kíp ngoài biên hoặc sai định dạng phải bị từ chối
      expect(isValidSlotKey('0-6')).toBe(false);
      expect(isValidSlotKey('0-24')).toBe(false);
      expect(isValidSlotKey('7-19')).toBe(false);
      expect(isValidSlotKey('-1-19')).toBe(false);
      expect(isValidSlotKey('0-07')).toBe(false);
      expect(isValidSlotKey('0-19.5')).toBe(false);
      expect(parseSlotKey('')).toBeNull();
    });

    it('normalizeBusySlots, toggleBusySlot và setDayBusySlots hoạt động bất biến và đúng thứ tự thời gian', () => {
      const messy = ['2-20', '0-19', '0-8', '2-20', 'invalid-slot', '0-24', '6-7'];
      expect(normalizeBusySlots(messy)).toEqual(['0-8', '0-19', '2-20', '6-7']);

      const initial: ScheduleSlotKey[] = ['1-19'];
      const toggledOn = toggleBusySlot(initial, '1-18');
      expect(toggledOn).toEqual(['1-18', '1-19']);
      expect(initial).toEqual(['1-19']); // Không mutate mảng gốc

      const toggledOff = toggleBusySlot(toggledOn, '1-19');
      expect(toggledOff).toEqual(['1-18']);

      const fullTuesday = setDayBusySlots(['0-19'], 1, true);
      expect(fullTuesday).toHaveLength(18); // 1 kíp T2 + 17 kíp T3
      const clearedTuesday = setDayBusySlots(fullTuesday, 1, false);
      expect(clearedTuesday).toEqual(['0-19']);
    });

    it('định dạng nhãn giờ hỗ trợ cả giờ chẵn và khung lẻ 30 phút (1.5h)', () => {
      expect(formatHourPoint(7)).toBe('7h');
      expect(formatHourPoint(20.5)).toBe('20h30');
      expect(formatWindowLabel(1, 19, 20.5)).toBe('T3 · 19h–20h30');
      expect(formatWindowLabel(6, 22, 24)).toBe('CN · 22h–24h');
    });
  });

  describe('2. Tuần ISO (YYYY-Www) & Sao chép lịch FIXED sang YYYY-Www', () => {
    it('xác định chính xác năm có 52 tuần vs 53 tuần và dịch tuần qua giao thừa', () => {
      expect(getIsoWeeksInYear(2025)).toBe(52);
      expect(getIsoWeeksInYear(2026)).toBe(53);
      expect(getIsoWeeksInYear(2020)).toBe(53);

      expect(isValidWeekKey('FIXED')).toBe(true);
      expect(isValidWeekKey('2026-W48')).toBe(true);
      expect(isValidWeekKey('2026-W53')).toBe(true);
      expect(isValidWeekKey('2025-W53')).toBe(false); // 2025 chỉ có 52 tuần
      expect(isValidWeekKey('2026-W00')).toBe(false);
      expect(isValidWeekKey('2026-W54')).toBe(false);

      expect(shiftIsoWeekKey('2025-W52', 1)).toBe('2026-W01');
      expect(shiftIsoWeekKey('2026-W52', 1)).toBe('2026-W53');
      expect(shiftIsoWeekKey('2026-W53', 1)).toBe('2027-W01');
      expect(shiftIsoWeekKey('FIXED', 1)).toBeNull();
    });

    it('tính tuần ISO theo múi giờ Asia/Ho_Chi_Minh chính xác tại ranh giới Chủ Nhật / Thứ Hai', () => {
      // 2026-11-22T18:00:00Z là 01:00 sáng Thứ Hai 23/11/2026 giờ Việt Nam (UTC+7) -> sang tuần W48
      const crossMidnight = new Date('2026-11-22T18:00:00.000Z');
      expect(getIsoWeekKeyFromDate(crossMidnight, 'Asia/Ho_Chi_Minh')).toBe('2026-W48');
      expect(getIsoWeekKeyFromDate(crossMidnight, 'UTC')).toBe('2026-W47');

      const range = getIsoWeekDateRange('2026-W48');
      expect(range?.mondayIso).toBe('2026-11-23');
      expect(range?.sundayIso).toBe('2026-11-29');
    });

    it('copyFixedSlotsForMember hỗ trợ OVERWRITE, MERGE_UNION và ONLY_IF_NOT_SUBMITTED', () => {
      const fixed = { busySlots: ['0-19', '2-20'] as ScheduleSlotKey[], note: 'Lịch học tối' };
      const existing = { busySlots: ['4-19'] as ScheduleSlotKey[], note: 'Bận tiệc cưới T6' };

      expect(
        copyFixedSlotsForMember(fixed, { mode: 'OVERWRITE', existingWeekEntry: existing, copyNote: false })
      ).toEqual({
        busySlots: ['0-19', '2-20'],
        note: 'Bận tiệc cưới T6',
        copied: true,
      });

      expect(
        copyFixedSlotsForMember(fixed, { mode: 'MERGE_UNION', existingWeekEntry: existing, copyNote: true })
      ).toEqual({
        busySlots: ['0-19', '2-20', '4-19'],
        note: 'Lịch học tối',
        copied: true,
      });

      expect(
        copyFixedSlotsForMember(fixed, { mode: 'ONLY_IF_NOT_SUBMITTED', existingWeekEntry: existing })
      ).toEqual({
        busySlots: ['4-19'],
        note: 'Bận tiệc cưới T6',
        copied: false,
      });
    });

    it('copyFixedScheduleToWeek KHÔNG tự sinh lịch rỗng cho người chưa có FIXED để bảo toàn bộ đếm submitted', () => {
      const fixedMap: Record<string, MemberScheduleEntry> = {
        m1: makeScheduleEntry('m1', ['0-19', '0-20'], 'FIXED', 'Ca tối T2'),
        m2: makeScheduleEntry('m2', ['1-19'], 'FIXED', 'Học tiếng Anh'),
      };
      const existingWeekMap: Record<string, MemberScheduleEntry> = {
        m2: makeScheduleEntry('m2', ['3-20'], '2026-W48', 'Tuần này đổi sang T5'),
      };

      const res = copyFixedScheduleToWeek({
        clubCode: 'clb-test',
        targetWeekKey: '2026-W48',
        fixedEntriesByMemberId: fixedMap,
        existingWeekEntriesByMemberId: existingWeekMap,
        activeMemberIds: ['m1', 'm2', 'm3'], // m3 chưa từng nộp FIXED
        overwriteExisting: false,
        copyNotes: true,
        nowIso: '2026-11-24T12:00:00Z',
      });

      expect(res.entriesToUpsert).toHaveLength(1);
      expect(res.entriesToUpsert[0]).toMatchObject({
        clubCode: 'CLB-TEST',
        weekKey: '2026-W48',
        memberId: 'm1',
        busySlots: ['0-19', '0-20'],
        note: 'Ca tối T2',
      });
      expect(res.skippedExistingMemberIds).toEqual(['m2']);
      expect(res.missingFixedMemberIds).toEqual(['m3']);

      // Từ chối nếu chép ngược vào 'FIXED'
      expect(() =>
        copyFixedScheduleToWeek({
          clubCode: 'CLB-TEST',
          targetWeekKey: 'FIXED',
          fixedEntriesByMemberId: fixedMap,
          nowIso: '2026-11-24T12:00:00Z',
        })
      ).toThrow('INVALID_WEEK_KEY');
    });

    it('buildWeeklyScheduleView phản ánh đúng trạng thái khóa tuần của CLB', () => {
      const view = buildWeeklyScheduleView({
        club: { clubCode: 'CLB-TEST', lockedWeeks: ['2026-W48'] },
        weekKey: '2026-W48',
        weekEntries: [makeScheduleEntry('m1', ['0-20', '0-19'], '2026-W48')],
      });
      expect(view.isLocked).toBe(true);
      expect(view.entriesByMemberId.m1.busySlots).toEqual(['0-19', '0-20']);
    });
  });

  describe('3. Heatmap — Edge case 0 người nộp & Chỉ đếm thành viên active đã nộp (submitted)', () => {
    it('xử lý an toàn tuyệt đối khi 0 người nộp lịch (không NaN, không gợi ý ảo)', () => {
      const members = [
        makeMember('m1', 'Người 1'),
        makeMember('m2', 'Người 2'),
        makeMember('m3', 'Người 3'),
        makeMember('m4', 'Người 4'),
        makeMember('m5', 'Người 5'),
      ];

      const heatmap = computeHeatmap({
        members,
        entriesByMemberId: {},
        durationHours: 2,
      });

      expect(heatmap).toHaveLength(112); // 16 cửa sổ/ngày × 7 ngày
      for (const slot of heatmap) {
        expect(slot.submittedCount).toBe(0);
        expect(slot.totalActiveMembers).toBe(5);
        expect(slot.freeCount).toBe(0);
        expect(slot.partialCount).toBe(0);
        expect(slot.availabilityRatio).toBe(0);
        expect(Number.isNaN(slot.availabilityRatio)).toBe(false);
        expect(slot.meetsMinPlayers).toBe(false);
        expect(slot.unsubmittedMemberIds).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
      }

      expect(rankGoldenSlots(heatmap)).toEqual([]);
      expect(
        suggestTwoShifts({
          heatmapSlots: heatmap,
          members,
          entriesByMemberId: {},
        })
      ).toEqual([]);
    });

    it('chỉ đếm thành viên active đã nộp lịch, loại bỏ thành viên chưa nộp, inactive và bản ghi mồ côi', () => {
      const members = [
        makeMember('m1', 'Active Nộp 1'),
        makeMember('m2', 'Active Nộp 2'),
        makeMember('m3', 'Active Nộp 3'),
        makeMember('m4', 'Active Nộp 4'),
        makeMember('m5', 'Active Nộp 5'),
        makeMember('m6', 'Active Chưa Nộp 6'),
        makeMember('m7', 'Active Chưa Nộp 7'),
        makeMember('m8', 'Inactive Đã Nộp Cũ', { isActive: false }),
      ];

      const entriesByMemberId: Record<string, MemberScheduleEntry> = {
        m1: makeScheduleEntry('m1', []), // Rảnh toàn bộ
        m2: makeScheduleEntry('m2', []),
        m3: makeScheduleEntry('m3', []),
        m4: makeScheduleEntry('m4', []),
        m5: makeScheduleEntry('m5', ['0-19', '0-20']), // Bận T2 19h–21h
        m8: makeScheduleEntry('m8', []), // Inactive -> không được đếm!
        orphan_99: makeScheduleEntry('orphan_99', []), // Mồ côi -> không được đếm!
      };

      const summary = getScheduleSubmissionSummary(members, entriesByMemberId);
      expect(summary.totalActiveCount).toBe(7);
      expect(summary.submittedCount).toBe(5);
      expect(summary.unsubmittedMembers.map((m) => m.id)).toEqual(['m6', 'm7']);

      const heatmap = computeHeatmap({
        members,
        entriesByMemberId,
        durationHours: 2,
        minPlayersPerShift: 4,
      });

      const mon19To21 = heatmap.find((s) => s.dayOfWeek === 0 && s.startHour === 19)!;
      expect(mon19To21.submittedCount).toBe(5);
      expect(mon19To21.totalActiveMembers).toBe(7);
      expect(mon19To21.freeCount).toBe(4);
      expect(mon19To21.fullFreeMemberIds).toEqual(['m1', 'm2', 'm3', 'm4']);
      expect(mon19To21.fullBusyMemberIds).toEqual(['m5']);
      expect(mon19To21.unsubmittedMemberIds).toEqual(['m6', 'm7']);
      // Mẫu số là 5 người đã nộp -> 4/5 = 0.8 (KHÔNG phải 4/7 hay 4/8)
      expect(mon19To21.availabilityRatio).toBeCloseTo(0.8, 5);
      expect(mon19To21.meetsMinPlayers).toBe(true);
    });
  });

  describe('4. Sliding Window cho 1h, 1.5h, 2h, 3h & Tách rõ vào muộn / về sớm', () => {
    it('sinh đúng số lượng cửa sổ trượt và biên kết thúc 24h cho từng mức thời lượng', () => {
      const members = [makeMember('m1', 'M1')];
      const entries = { m1: makeScheduleEntry('m1', []) };

      const h1 = computeHeatmap({ members, entriesByMemberId: entries, durationHours: 1 });
      const h15 = computeHeatmap({ members, entriesByMemberId: entries, durationHours: 1.5 });
      const h2 = computeHeatmap({ members, entriesByMemberId: entries, durationHours: 2 });
      const h3 = computeHeatmap({ members, entriesByMemberId: entries, durationHours: 3 });

      expect(h1).toHaveLength(17 * 7); // 119
      expect(h15).toHaveLength(16 * 7); // 112 (startHour tối đa = 22 -> endHour = 23.5, quét kíp 22 & 23)
      expect(h2).toHaveLength(16 * 7); // 112 (startHour tối đa = 22 -> endHour = 24)
      expect(h3).toHaveLength(15 * 7); // 105 (startHour tối đa = 21 -> endHour = 24)

      expect(getCoveredSlotKeysForWindow(0, 22, 1.5)).toEqual(['0-22', '0-23']);
      expect(getCoveredSlotKeysForWindow(0, 23, 1.5)).toBeNull();
      expect(getCoveredSlotKeysForWindow(0, 21, 3)).toEqual(['0-21', '0-22', '0-23']);
      expect(getCoveredSlotKeysForWindow(0, 22, 3)).toBeNull();
    });

    it('Khung 1.5h quét 2 kíp liền kề, tách rõ Rảnh trọn buổi vs Bận kíp đầu (vào muộn) vs Bận kíp cuối (về sớm)', () => {
      const members = [
        makeMember('free_all', 'Rảnh Trọn Buổi'),
        makeMember('late_in', 'Vào Muộn'),
        makeMember('early_out', 'Về Sớm'),
        makeMember('busy_both', 'Bận Cả Hai'),
        makeMember('not_sub', 'Chưa Nộp'),
      ];

      // Xét Thứ 3 khung 19h–20h30 (quét 2 kíp liền kề '1-19' và '1-20')
      const entriesByMemberId: Record<string, MemberScheduleEntry> = {
        free_all: makeScheduleEntry('free_all', []),
        late_in: makeScheduleEntry('late_in', [makeSlotKey(1, 19)]), // Bận 19h–20h, rảnh 20h–21h
        early_out: makeScheduleEntry('early_out', [makeSlotKey(1, 20)]), // Rảnh 19h–20h, bận 20h–21h
        busy_both: makeScheduleEntry('busy_both', [makeSlotKey(1, 19), makeSlotKey(1, 20)]),
      };

      const heatmap = computeHeatmap({
        members,
        entriesByMemberId,
        durationHours: 1.5,
        minPlayersPerShift: 4,
      });

      const tue19 = heatmap.find((s) => s.dayOfWeek === 1 && s.startHour === 19)!;
      expect(tue19.endHour).toBe(20.5);
      expect(tue19.coveredSlotKeys).toEqual(['1-19', '1-20']);
      expect(tue19.fullFreeMemberIds).toEqual(['free_all']);
      expect(tue19.partialBusyMemberIds).toEqual(['late_in', 'early_out']);
      expect(tue19.lateArrivalMemberIds).toEqual(['late_in']);
      expect(tue19.earlyLeaveMemberIds).toEqual(['early_out']);
      expect(tue19.fullBusyMemberIds).toEqual(['busy_both']);
      expect(tue19.unsubmittedMemberIds).toEqual(['not_sub']);
      expect(tue19.freeCount).toBe(1);
      expect(tue19.partialCount).toBe(2);
      expect(tue19.submittedCount).toBe(4);
      expect(tue19.availabilityRatio).toBe(0.25);
    });

    it('Khung 3h phân biệt chính xác vào muộn, về sớm và bận kíp giữa giờ', () => {
      const members = [
        makeMember('m_late', 'Vào Muộn 20h'),
        makeMember('m_early', 'Về Sớm 21h'),
        makeMember('m_mid', 'Bận Giữa Giờ 20h-21h'),
      ];
      const entriesByMemberId: Record<string, MemberScheduleEntry> = {
        m_late: makeScheduleEntry('m_late', ['2-19']), // Bận [0], rảnh [1,2]
        m_early: makeScheduleEntry('m_early', ['2-21']), // Rảnh [0,1], bận [2]
        m_mid: makeScheduleEntry('m_mid', ['2-20']), // Rảnh [0], bận [1], rảnh [2]
      };

      const heatmap = computeHeatmap({
        members,
        entriesByMemberId,
        durationHours: 3,
      });
      const wed19To22 = heatmap.find((s) => s.dayOfWeek === 2 && s.startHour === 19)!;
      expect(wed19To22.partialBusyMemberIds).toEqual(['m_late', 'm_early', 'm_mid']);
      expect(wed19To22.lateArrivalMemberIds).toEqual(['m_late']);
      expect(wed19To22.earlyLeaveMemberIds).toEqual(['m_early']);
    });
  });

  describe('5. Top Khung Giờ Vàng & Thuật toán Gợi ý chia 2 ca tối ưu (Maximum 2-Set Coverage)', () => {
    it('xếp hạng Top khung giờ vàng ưu tiên freeCount, sau đó partialCount và hỗ trợ khử trùng lặp đè giờ', () => {
      const members = Array.from({ length: 6 }, (_, i) => makeMember(`m${i + 1}`, `M${i + 1}`));
      const allSlots = buildAllSlotKeys();

      const onlyFreeOn = (allowed: ScheduleSlotKey[]): ScheduleSlotKey[] => {
        const allowSet = new Set(allowed);
        return allSlots.filter((k) => !allowSet.has(k));
      };

      const entries: Record<string, MemberScheduleEntry> = {
        // T3 19h–21h có 5 full free + 1 partial; T5 19h–21h có 5 full free + 0 partial
        m1: makeScheduleEntry('m1', onlyFreeOn(['1-19', '1-20', '1-21', '3-19', '3-20'])),
        m2: makeScheduleEntry('m2', onlyFreeOn(['1-19', '1-20', '1-21', '3-19', '3-20'])),
        m3: makeScheduleEntry('m3', onlyFreeOn(['1-19', '1-20', '1-21', '3-19', '3-20'])),
        m4: makeScheduleEntry('m4', onlyFreeOn(['1-19', '1-20', '1-21', '3-19', '3-20'])),
        m5: makeScheduleEntry('m5', onlyFreeOn(['1-19', '1-20', '3-19', '3-20'])),
        m6: makeScheduleEntry('m6', onlyFreeOn(['1-20'])), // Partial trên T3 19h–21h (vào muộn 20h)
      };

      const heatmap = computeHeatmap({ members, entriesByMemberId: entries, durationHours: 2 });
      const top = rankGoldenSlots(heatmap, { limit: 3, deduplicateOverlapping: true });

      expect(top).toHaveLength(2);
      expect(top[0].dayOfWeek).toBe(1);
      expect(top[0].startHour).toBe(19);
      expect(top[0].freeCount).toBe(5);
      expect(top[0].partialCount).toBe(1);

      expect(top[1].dayOfWeek).toBe(3);
      expect(top[1].startHour).toBe(19);
      expect(top[1].freeCount).toBe(5);
      expect(top[1].partialCount).toBe(0);
    });

    it('tìm đúng nghiệm tối ưu toàn cục Maximum 2-Set Coverage ngay cả trong bẫy tham lam (Greedy Trap)', () => {
      // 10 thành viên đã nộp:
      // - Ca W1 (T2 19-21h): 6 người rảnh {m1..m6}
      // - Ca W2 (T4 19-21h): 5 người rảnh {m1, m2, m3, m7, m8}
      // - Ca W3 (T6 19-21h): 5 người rảnh {m4, m5, m6, m9, m10}
      // Thuật toán tham lam chọn W1 trước sẽ chỉ đạt tối đa 8/10 người.
      // Nghiệm tối ưu toàn cục (W2 + W3) phủ 10/10 = 100% thành viên và mỗi ca đều >= 4 người (5 người/ca)!
      const members = Array.from({ length: 10 }, (_, i) => makeMember(`m${i + 1}`, `M${i + 1}`));
      const allSlots = buildAllSlotKeys();
      const onlyFreeOn = (allowed: ScheduleSlotKey[]): ScheduleSlotKey[] => {
        const allowSet = new Set(allowed);
        return allSlots.filter((k) => !allowSet.has(k));
      };

      const w1: ScheduleSlotKey[] = ['0-19', '0-20'];
      const w2: ScheduleSlotKey[] = ['2-19', '2-20'];
      const w3: ScheduleSlotKey[] = ['4-19', '4-20'];

      const entries: Record<string, MemberScheduleEntry> = {
        m1: makeScheduleEntry('m1', onlyFreeOn([...w1, ...w2])),
        m2: makeScheduleEntry('m2', onlyFreeOn([...w1, ...w2])),
        m3: makeScheduleEntry('m3', onlyFreeOn([...w1, ...w2])),
        m4: makeScheduleEntry('m4', onlyFreeOn([...w1, ...w3])),
        m5: makeScheduleEntry('m5', onlyFreeOn([...w1, ...w3])),
        m6: makeScheduleEntry('m6', onlyFreeOn([...w1, ...w3])),
        m7: makeScheduleEntry('m7', onlyFreeOn(w2)),
        m8: makeScheduleEntry('m8', onlyFreeOn(w2)),
        m9: makeScheduleEntry('m9', onlyFreeOn(w3)),
        m10: makeScheduleEntry('m10', onlyFreeOn(w3)),
      };

      const heatmap = computeHeatmap({
        members,
        entriesByMemberId: entries,
        durationHours: 2,
        minPlayersPerShift: 4,
      });

      const suggestions = suggestTwoShifts({
        heatmapSlots: heatmap,
        members,
        entriesByMemberId: entries,
        minPlayersPerShift: 4,
      });

      expect(suggestions.length).toBeGreaterThan(0);
      const best = suggestions[0];
      expect(best.shiftA.slot.dayOfWeek).toBe(2); // T4 19h–21h
      expect(best.shiftA.slot.startHour).toBe(19);
      expect(best.shiftB.slot.dayOfWeek).toBe(4); // T6 19h–21h
      expect(best.shiftB.slot.startHour).toBe(19);
      expect(best.coveredMemberIds).toHaveLength(10);
      expect(best.overlapMemberIds).toEqual([]);
      expect(best.uncoveredMemberIds).toEqual([]);
      expect(best.coverageRatio).toBe(1);
    });

    it('Edge case: Chia 2 ca không đủ 4 người ở ca thứ 2 hoặc 2 cửa sổ đè giờ nhau -> trả về mảng rỗng []', () => {
      const members = Array.from({ length: 7 }, (_, i) => makeMember(`m${i + 1}`, `M${i + 1}`));
      const allSlots = buildAllSlotKeys();
      const onlyFreeOn = (allowed: ScheduleSlotKey[]): ScheduleSlotKey[] => {
        const allowSet = new Set(allowed);
        return allSlots.filter((k) => !allowSet.has(k));
      };

      // Nhóm A (4 người) rảnh T3 18h–21h (tạo ra 2 cửa sổ 2h đè nhau 18-20 và 19-21)
      // Nhóm B (CHỈ 3 người < 4) rảnh T5 19h–21h
      const entries: Record<string, MemberScheduleEntry> = {
        m1: makeScheduleEntry('m1', onlyFreeOn(['1-18', '1-19', '1-20'])),
        m2: makeScheduleEntry('m2', onlyFreeOn(['1-18', '1-19', '1-20'])),
        m3: makeScheduleEntry('m3', onlyFreeOn(['1-18', '1-19', '1-20'])),
        m4: makeScheduleEntry('m4', onlyFreeOn(['1-18', '1-19', '1-20'])),
        m5: makeScheduleEntry('m5', onlyFreeOn(['3-19', '3-20'])),
        m6: makeScheduleEntry('m6', onlyFreeOn(['3-19', '3-20'])),
        m7: makeScheduleEntry('m7', onlyFreeOn(['3-19', '3-20'])),
      };

      const heatmap = computeHeatmap({
        members,
        entriesByMemberId: entries,
        durationHours: 2,
        minPlayersPerShift: 4,
      });

      // Xác nhận 2 cửa sổ 18-20 và 19-21 cùng ngày bị phát hiện đè giờ
      const tue18 = heatmap.find((s) => s.dayOfWeek === 1 && s.startHour === 18)!;
      const tue19 = heatmap.find((s) => s.dayOfWeek === 1 && s.startHour === 19)!;
      expect(tue18.freeCount).toBe(4);
      expect(tue19.freeCount).toBe(4);
      expect(doHeatmapSlotsOverlap(tue18, tue19)).toBe(true);

      // Ca T5 chỉ có 3 người (< 4) và T3 chỉ có 2 cửa sổ đè nhau -> KHÔNG thể chia 2 ca >= 4 người!
      const suggestions = suggestTwoShifts({
        heatmapSlots: heatmap,
        members,
        entriesByMemberId: entries,
        minPlayersPerShift: 4,
      });
      expect(suggestions).toEqual([]);
    });

    it('Rule 1 Invariant: Toàn bộ engine thuần túy không gọi Date.now() hay Math.random()', () => {
      const nowSpy = vi.spyOn(Date, 'now');
      const randSpy = vi.spyOn(Math, 'random');

      try {
        const members = Array.from({ length: 8 }, (_, i) => makeMember(`p${i}`, `P${i}`));
        const entries: Record<string, MemberScheduleEntry> = {};
        for (const m of members) {
          entries[m.id] = makeScheduleEntry(m.id, []);
        }

        const week = getIsoWeekKeyFromDate(new Date('2026-11-26T10:00:00Z'));
        expect(week).toBe('2026-W48');

        const heatmap = computeHeatmap({
          members,
          entriesByMemberId: entries,
          durationHours: 1.5,
        });
        const top = rankGoldenSlots(heatmap);
        const shifts = suggestTwoShifts({
          heatmapSlots: heatmap,
          members,
          entriesByMemberId: entries,
        });

        expect(top.length).toBeGreaterThan(0);
        expect(shifts.length).toBeGreaterThan(0);
        expect(nowSpy).toHaveBeenCalledTimes(0);
        expect(randSpy).toHaveBeenCalledTimes(0);
      } finally {
        nowSpy.mockRestore();
        randSpy.mockRestore();
      }
    });

    it('chặn khóa kíp/tuần chứa khoảng trắng thừa, Date hỏng và tham số NaN', () => {
      // Không cho phép ' FIXED ' lọt qua isIsoWeekKey hay copyFixedScheduleToWeek
      expect(isValidWeekKey(' FIXED ')).toBe(false);
      expect(isIsoWeekKey(' FIXED ')).toBe(false);
      expect(isValidWeekKey(' 2026-W48 ')).toBe(false);
      expect(isIsoWeekKey(' 2026-W48 ')).toBe(false);
      expect(() =>
        copyFixedScheduleToWeek({
          clubCode: 'CLB-TEST',
          targetWeekKey: ' FIXED ' as unknown as WeekKey,
          fixedEntriesByMemberId: { m1: makeScheduleEntry('m1', ['0-19'], 'FIXED') },
          nowIso: '2026-11-26T00:00:00Z',
        })
      ).toThrow('INVALID_WEEK_KEY');

      // Không cho phép ' 0-7 ' lọt qua isValidSlotKey hay tạo phần tử lỗi trong toggleBusySlot
      expect(isValidSlotKey(' 0-7 ')).toBe(false);
      expect(toggleBusySlot(['0-7'], ' 0-7 ' as unknown as ScheduleSlotKey)).toEqual(['0-7']);
      expect(normalizeBusySlots([' 0-7 ', '0-7'])).toEqual(['0-7']);

      // Date không hợp lệ phải ném lỗi thay vì trả về 'NaN-WNaN'
      expect(() => getIsoWeekKeyFromDate(new Date('invalid-date'))).toThrow('INVALID_DATE');

      // minPlayersPerShift = NaN và trùng member.id không làm hỏng kết quả Heatmap / chia 2 ca
      const dupMembers = [
        makeMember('m1', 'M1'),
        makeMember('m1', 'M1 Bản Sao'),
        makeMember('m2', 'M2'),
        makeMember('m3', 'M3'),
        makeMember('m4', 'M4'),
      ];
      const entries: Record<string, MemberScheduleEntry> = {
        m1: makeScheduleEntry('m1', []),
        m2: makeScheduleEntry('m2', []),
        m3: makeScheduleEntry('m3', []),
        m4: makeScheduleEntry('m4', []),
      };
      const heatmap = computeHeatmap({
        members: dupMembers,
        entriesByMemberId: entries,
        durationHours: 2,
        minPlayersPerShift: Number.NaN,
      });
      expect(heatmap[0].submittedCount).toBe(4);
      expect(heatmap[0].freeCount).toBe(4);
      expect(heatmap[0].meetsMinPlayers).toBe(true);

      const shifts = suggestTwoShifts({
        heatmapSlots: heatmap,
        members: dupMembers,
        entriesByMemberId: entries,
        minPlayersPerShift: Number.NaN,
        limit: Number.NaN,
      });
      expect(shifts.length).toBe(5);
    });
  });
});
