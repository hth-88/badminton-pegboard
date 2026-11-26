import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLUB_MEMBER_PUBLIC_COLUMNS,
  CLUB_PUBLIC_COLUMNS,
  CLUB_RPC_ERROR_CODES,
  MEMBER_SCHEDULE_PUBLIC_COLUMNS,
} from '../../types/schedule';
import {
  createClub,
  deleteClubMemberByHost,
  fetchClub,
  fetchClubMembers,
  fetchClubScheduleBundle,
  fetchWeekSchedules,
  mapClubMemberRecord,
  NO_SUPABASE_CONFIG_ERROR,
  parseClubRpcError,
  registerClubMember,
  removeClubActiveRoom,
  setClubWeekLock,
  setMemberPin,
  subscribeToClubSchedule,
  updateClubMemberByHost,
  updateClubSettings,
  upsertClubActiveRoom,
  upsertMemberSchedule,
  verifyClubHostPin,
  verifyMemberPin,
} from '../clubScheduleSync';

const mockGetSupabaseClient = vi.fn();

vi.mock('../supabaseSync', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

describe('Phase 2 — Club Schedule Supabase Sync Service (src/services/clubScheduleSync.ts)', () => {
  beforeEach(() => {
    mockGetSupabaseClient.mockReset();
  });

  it('1. Trả lỗi rõ ràng khi chưa cấu hình Supabase Client', async () => {
    mockGetSupabaseClient.mockReturnValue(null);
    const res = await fetchClub('CLB-01');
    expect(res).toEqual({
      data: null,
      error: NO_SUPABASE_CONFIG_ERROR,
      errorCode: null,
    });
  });

  it('2. parseClubRpcError ánh xạ chính xác toàn bộ 22 mã lỗi SQL và không nhầm tiền tố INVALID_HOST_PIN vs INVALID_HOST_PIN_FORMAT', () => {
    for (const code of CLUB_RPC_ERROR_CODES) {
      const parsed = parseClubRpcError({ message: `PostgREST error: ${code}` });
      expect(parsed.code).toBe(code);
      expect(parsed.message.length).toBeGreaterThan(5);
    }

    expect(parseClubRpcError({ message: 'INVALID_HOST_PIN_FORMAT' }).code).toBe(
      'INVALID_HOST_PIN_FORMAT'
    );
    expect(parseClubRpcError({ message: 'INVALID_HOST_PIN' }).code).toBe('INVALID_HOST_PIN');
    expect(parseClubRpcError({ message: 'INVALID_MEMBER_PIN_FORMAT' }).code).toBe(
      'INVALID_MEMBER_PIN_FORMAT'
    );
    expect(parseClubRpcError({ message: 'INVALID_MEMBER_PIN' }).code).toBe('INVALID_MEMBER_PIN');
  });

  it('3. Các hàm SELECT luôn truyền tường minh *_PUBLIC_COLUMNS (TUYỆT ĐỐI không dùng select("*"))', async () => {
    const selectCalls: Array<{ table: string; columns: string }> = [];

    const mockClient = {
      from: vi.fn((table: string) => ({
        select: vi.fn((columns: string) => {
          selectCalls.push({ table, columns });
          if (table === 'clubs') {
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    club_code: 'CLB-HN',
                    name: 'CLB Hà Nội',
                    active_rooms: [],
                    locked_weeks: ['2026-W48'],
                    settings: { allowSelfRegister: true, defaultDurationHours: 2, minPlayersPerShift: 4 },
                    created_at: '2026-11-01T00:00:00Z',
                    updated_at: '2026-11-01T00:00:00Z',
                  },
                  error: null,
                }),
              })),
            };
          }
          if (table === 'club_members') {
            const chain: Record<string, unknown> = {};
            chain.eq = vi.fn(() => chain);
            chain.order = vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'uuid-m1',
                  club_code: 'CLB-HN',
                  name: 'Đức Anh',
                  gender: 'M',
                  rank: 'tb-',
                  rank_score: '8.5', // PostgreSQL numeric trả về chuỗi
                  no_singles: false,
                  has_pin: true,
                  is_active: true,
                  auth_user_id: null,
                  created_at: '2026-11-01T00:00:00Z',
                  updated_at: '2026-11-01T00:00:00Z',
                },
              ],
              error: null,
            });
            return chain;
          }
          const schedChain: Record<string, unknown> = {};
          schedChain.eq = vi.fn((col: string, val: string) => {
            if (col === 'week_key') {
              return Promise.resolve({
                data: [
                  {
                    id: `sched_${val}`,
                    club_code: 'CLB-HN',
                    week_key: val,
                    member_id: 'uuid-m1',
                    busy_slots: ['2-20', '0-19'],
                    note: 'Bận họp',
                    updated_at: '2026-11-20T00:00:00Z',
                  },
                ],
                error: null,
              });
            }
            return schedChain;
          });
          return schedChain;
        }),
      })),
    };

    mockGetSupabaseClient.mockReturnValue(mockClient);

    const bundleRes = await fetchClubScheduleBundle(' clb-hn ', '2026-W48');
    expect(bundleRes.error).toBeNull();
    expect(bundleRes.data?.club.clubCode).toBe('CLB-HN');
    expect(bundleRes.data?.members[0].rankScore).toBe(8.5);
    expect(bundleRes.data?.members[0].hasPin).toBe(true);
    expect(bundleRes.data?.weekEntries[0].busySlots).toEqual(['0-19', '2-20']);
    expect(bundleRes.data?.fixedEntries).toHaveLength(1);

    // Đảm bảo không có bất kỳ lệnh nào dùng '*'
    expect(selectCalls.some((c) => c.columns.includes('*'))).toBe(false);
    expect(selectCalls).toEqual([
      { table: 'clubs', columns: CLUB_PUBLIC_COLUMNS },
      { table: 'club_members', columns: CLUB_MEMBER_PUBLIC_COLUMNS },
      { table: 'member_schedules', columns: MEMBER_SCHEDULE_PUBLIC_COLUMNS },
      { table: 'member_schedules', columns: MEMBER_SCHEDULE_PUBLIC_COLUMNS },
    ]);

    const directClub = await fetchClub('CLB-HN');
    const directMembers = await fetchClubMembers('CLB-HN');
    const directSched = await fetchWeekSchedules('CLB-HN', 'FIXED');
    expect(directClub.error).toBeNull();
    expect(directMembers.error).toBeNull();
    expect(directSched.error).toBeNull();
  });

  it('4. Gọi đầy đủ và đúng tham số cho toàn bộ 12 RPC SECURITY DEFINER của Phase 1', async () => {
    const rpcMock = vi.fn(async (fnName: string, args: Record<string, unknown>) => {
      switch (fnName) {
        case 'create_club':
        case 'update_club_settings':
          return {
            data: [
              {
                club_code: args.p_club_code,
                name: args.p_name ?? 'CLB Cầu Lông',
                active_rooms: [],
                locked_weeks: [],
                settings: { allowSelfRegister: true, defaultDurationHours: 2, minPlayersPerShift: 4 },
                created_at: '2026-11-26T00:00:00Z',
                updated_at: '2026-11-26T00:00:00Z',
              },
            ],
            error: null,
          };
        case 'verify_club_host_pin':
        case 'delete_club_member_by_host':
        case 'set_member_pin':
        case 'verify_member_pin':
          return { data: true, error: null };
        case 'set_club_week_lock':
          return { data: ['2026-W48'], error: null };
        case 'upsert_club_active_room':
          return {
            data: [{ roomCode: 'SAN-01', label: 'Ca 1 T3', createdAt: '2026-11-26T00:00:00Z' }],
            error: null,
          };
        case 'remove_club_active_room':
          return { data: [], error: null };
        case 'register_club_member':
        case 'update_club_member_by_host':
          return {
            data: [
              {
                id: (args.p_member_id as string) ?? 'uuid-new-1',
                club_code: args.p_club_code,
                name: args.p_name ?? 'Thành Viên A',
                gender: args.p_gender ?? 'M',
                rank: args.p_rank ?? 'tb',
                rank_score: args.p_rank_score ?? 10.0,
                no_singles: Boolean(args.p_no_singles),
                has_pin: Boolean(args.p_member_pin),
                is_active: args.p_is_active ?? true,
                auth_user_id: null,
                created_at: '2026-11-26T00:00:00Z',
                updated_at: '2026-11-26T00:00:00Z',
              },
            ],
            error: null,
          };
        case 'upsert_member_schedule':
          return {
            data: [
              {
                id: 'sched-uuid-1',
                club_code: args.p_club_code,
                week_key: args.p_week_key,
                member_id: args.p_member_id,
                busy_slots: args.p_busy_slots,
                note: args.p_note,
                updated_at: '2026-11-26T00:00:00Z',
              },
            ],
            error: null,
          };
        default:
          return { data: null, error: { message: 'UNKNOWN_RPC' } };
      }
    });

    mockGetSupabaseClient.mockReturnValue({ rpc: rpcMock });

    expect((await createClub({ clubCode: 'clb-88', name: 'CLB 88', hostPin: '1234' })).data?.clubCode).toBe('CLB-88');
    expect((await verifyClubHostPin('clb-88', '1234')).data).toBe(true);
    expect((await updateClubSettings({ clubCode: 'clb-88', hostPin: '1234', name: 'CLB 88 Mới' })).data?.name).toBe('CLB 88 Mới');
    expect((await setClubWeekLock({ clubCode: 'clb-88', hostPin: '1234', weekKey: '2026-W48', locked: true })).data).toEqual(['2026-W48']);
    expect((await upsertClubActiveRoom({ clubCode: 'clb-88', hostPin: '1234', room: { roomCode: 'san-01', label: 'Ca 1 T3' } })).data).toHaveLength(1);
    expect((await removeClubActiveRoom({ clubCode: 'clb-88', hostPin: '1234', roomCode: 'san-01' })).data).toEqual([]);
    expect((await registerClubMember({ clubCode: 'clb-88', name: 'Hùng', gender: 'M', rank: 'tb', memberPin: '9999' })).data?.hasPin).toBe(true);
    expect((await updateClubMemberByHost({ clubCode: 'clb-88', hostPin: '1234', memberId: 'uuid-1', rank: 'tb+' })).data?.rankScore).toBe(11.5);
    expect((await deleteClubMemberByHost({ clubCode: 'clb-88', hostPin: '1234', memberId: 'uuid-1', hardDelete: false })).data).toBe(true);
    expect((await setMemberPin({ clubCode: 'clb-88', memberId: 'uuid-1', newPin: '5678' })).data).toBe(true);
    expect((await verifyMemberPin({ clubCode: 'clb-88', memberId: 'uuid-1', pin: '5678' })).data).toBe(true);

    const schedRes = await upsertMemberSchedule({
      clubCode: 'clb-88',
      weekKey: '2026-W48',
      memberId: 'uuid-1',
      busySlots: ['1-20', '1-19', 'invalid'],
      note: 'Bận ca đầu',
      memberPin: '5678',
    });
    expect(schedRes.data?.busySlots).toEqual(['1-19', '1-20']);

    const calledFns = rpcMock.mock.calls.map((c) => c[0]);
    expect(calledFns).toEqual([
      'create_club',
      'verify_club_host_pin',
      'update_club_settings',
      'set_club_week_lock',
      'upsert_club_active_room',
      'remove_club_active_room',
      'register_club_member',
      'update_club_member_by_host',
      'delete_club_member_by_host',
      'set_member_pin',
      'verify_member_pin',
      'upsert_member_schedule',
    ]);
  });

  it('5. subscribeToClubSchedule lắng nghe Realtime 3 bảng, xử lý thiếu cột sinh has_pin và dọn kênh sạch sẽ', () => {
    const handlersByTable: Record<string, (payload: unknown) => void> = {};
    const removeChannelMock = vi.fn();

    const channelObj = {
      on: vi.fn((_type: string, filterCfg: { table: string }, cb: (payload: unknown) => void) => {
        handlersByTable[filterCfg.table] = cb;
        return channelObj;
      }),
      subscribe: vi.fn((statusCb?: (s: string) => void) => {
        statusCb?.('SUBSCRIBED');
        return channelObj;
      }),
    };

    mockGetSupabaseClient.mockReturnValue({
      channel: vi.fn(() => channelObj),
      removeChannel: removeChannelMock,
    });

    const clubEvents: unknown[] = [];
    const memberEvents: unknown[] = [];
    const scheduleEvents: unknown[] = [];

    const unsub = subscribeToClubSchedule('clb-rt', {
      onClubChange: (e) => clubEvents.push(e),
      onMemberChange: (e) => memberEvents.push(e),
      onScheduleChange: (e) => scheduleEvents.push(e),
    });

    // 1. Sự kiện UPDATE trên club_members (không chứa has_pin giống hệt publication PG 15-17)
    handlersByTable.club_members({
      eventType: 'UPDATE',
      new: {
        id: 'uuid-m1',
        club_code: 'CLB-RT',
        name: 'Minh Trí',
        gender: 'M',
        rank: 'tb',
        rank_score: '10.0',
        no_singles: false,
        is_active: true,
        auth_user_id: null,
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-26T00:00:00Z',
      },
    });

    expect(memberEvents).toHaveLength(1);
    const firstMemberEvt = memberEvents[0] as {
      eventType: string;
      hasPinIncluded: boolean;
      rawRecord: Parameters<typeof mapClubMemberRecord>[0];
    };
    expect(firstMemberEvt.hasPinIncluded).toBe(false);
    // Khi map với fallbackHasPin = true, hasPin cũ không bị ghi đè mất thành false
    expect(mapClubMemberRecord(firstMemberEvt.rawRecord, true).hasPin).toBe(true);

    // 2. Sự kiện INSERT trên member_schedules
    handlersByTable.member_schedules({
      eventType: 'INSERT',
      new: {
        id: 'sched-1',
        club_code: 'CLB-RT',
        week_key: '2026-W48',
        member_id: 'uuid-m1',
        busy_slots: ['0-19'],
        note: '',
        updated_at: '2026-11-26T00:00:00Z',
      },
    });
    expect(scheduleEvents).toHaveLength(1);

    // 3. Sự kiện UPDATE trên clubs
    handlersByTable.clubs({
      eventType: 'UPDATE',
      new: {
        club_code: 'CLB-RT',
        name: 'CLB Realtime',
        active_rooms: [],
        locked_weeks: ['2026-W48'],
        settings: {},
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-26T00:00:00Z',
      },
    });
    expect(clubEvents).toHaveLength(1);

    unsub();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
  });

  it('6. Bắt mã lỗi SQL nằm trong details/hint và chặn weekKey sai định dạng ở fetchWeekSchedules', async () => {
    expect(
      parseClubRpcError({ message: 'Database error', details: 'Key error: WEEK_LOCKED' }).code
    ).toBe('WEEK_LOCKED');
    expect(
      parseClubRpcError({ message: 'RPC failed', hint: 'INVALID_MEMBER_PIN' }).code
    ).toBe('INVALID_MEMBER_PIN');

    mockGetSupabaseClient.mockReturnValue({ from: vi.fn() });
    const badWeek = await fetchWeekSchedules('CLB-HN', '2025-W53');
    expect(badWeek.errorCode).toBe('INVALID_WEEK_KEY');
    expect(badWeek.data).toBeNull();
  });
});
