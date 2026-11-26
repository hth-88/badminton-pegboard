import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCloudRosterSnapshot,
  DEFAULT_9_CLUB_MEMBERS,
  deleteClubMember,
  getClubRoster,
  getHostMemberPrivateMeta,
  hasCustomLegacyLocalRoster,
  isDefaultSampleRoster,
  mergeCloudMembersWithPrivateMeta,
  migrateLocalRosterToCloud,
  setActiveClubCode,
  STORAGE_KEY_CLUB_ROSTER,
  syncClubMemberRank,
  updateClubMemberProfile,
  upsertClubMember,
  upsertHostMemberPrivateMeta,
  type ClubRosterCloudAdapter,
} from '../clubRosterStorage';
import { clearSession, saveSessionImmediate } from '../storage';
import { createInitialSessionState } from '../sessionReducer';
import { STORAGE_KEY_CLOUD_ROOM } from '../../services/supabaseSync';
import type { ClubMember as CloudClubMember } from '../../types/schedule';

function makeCloudMember(
  id: string,
  name: string,
  overrides: Partial<CloudClubMember> = {}
): CloudClubMember {
  return {
    id,
    clubCode: 'CLB-HN',
    name,
    gender: 'M',
    rank: 'tb',
    rankScore: 10,
    noSingles: false,
    hasPin: false,
    isActive: true,
    authUserId: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

describe('Phase 2 — Club Roster Local-First + Cloud Sync & Safe Migration', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        get length() {
          return Object.keys(mockStorage).length;
        },
        key: (idx: number) => Object.keys(mockStorage)[idx] ?? null,
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          for (const k of Object.keys(mockStorage)) {
            delete mockStorage[k];
          }
        },
      },
      writable: true,
      configurable: true,
    });
  });

  it('1. Giữ nguyên notes/tags kín của Host ở localStorage theo member.id (UUID) ngay cả khi thành viên đổi tên trên Cloud', () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440000';
    const initialCloudMembers: CloudClubMember[] = [
      makeCloudMember(memberUuid, 'Minh Trí', { clubCode: 'CLB-HN', rank: 'tby+' }),
      makeCloudMember('660e8400-e29b-41d4-a716-446655440111', 'Phương Thảo', {
        clubCode: 'CLB-HN',
        gender: 'F',
        rank: 'tby',
      }),
    ];

    setActiveClubCode('CLB-HN');
    applyCloudRosterSnapshot('CLB-HN', initialCloudMembers);

    // Host cập nhật ghi chú & nhãn kín qua hàm đồng bộ đang dùng ở QueueTab
    const updated = updateClubMemberProfile(memberUuid, {
      notes: '  Đau gối trái, tránh xếp đơn liên tục  ',
      tags: ['Đau gối / nhẹ tay', 'Đánh nhiệt', 'Đau gối / nhẹ tay'],
    });

    expect(updated?.notes).toBe('Đau gối trái, tránh xếp đơn liên tục');
    expect(updated?.tags).toEqual(['Đau gối / nhẹ tay', 'Đánh nhiệt']);

    // Thành viên đổi tên trên Cloud từ "Minh Trí" -> "Trí Nguyễn VIP" (giữ nguyên UUID)
    const renamedCloudMembers: CloudClubMember[] = [
      makeCloudMember(memberUuid, 'Trí Nguyễn VIP', { clubCode: 'CLB-HN', rank: 'tb-' }),
      initialCloudMembers[1],
    ];

    const mergedAfterRename = applyCloudRosterSnapshot('CLB-HN', renamedCloudMembers);
    const tri = mergedAfterRename.find((m) => m.id === memberUuid);

    expect(tri?.name).toBe('Trí Nguyễn VIP');
    expect(tri?.rank).toBe('tb-');
    expect(tri?.notes).toBe('Đau gối trái, tránh xếp đơn liên tục');
    expect(tri?.tags).toEqual(['Đau gối / nhẹ tay', 'Đánh nhiệt']);

    // Đọc lại qua getClubRoster() không tham số khi CLB đang active cũng nhận đủ notes/tags
    const fromGetter = getClubRoster();
    expect(fromGetter.find((m) => m.id === memberUuid)?.notes).toBe(
      'Đau gối trái, tránh xếp đơn liên tục'
    );
  });

  it('2. Cách ly dữ liệu notes/tags và roster giữa các club_code khác nhau và ẩn thành viên isActive = false', () => {
    const sharedUuid = '770e8400-e29b-41d4-a716-446655440999';
    upsertHostMemberPrivateMeta('CLB-A', sharedUuid, {
      notes: 'Ghi chú riêng CLB A',
      tags: ['Trình cứng'],
    });
    upsertHostMemberPrivateMeta('CLB-B', sharedUuid, {
      notes: 'Ghi chú riêng CLB B',
      tags: ['Vãng lai'],
    });

    const mergedA = mergeCloudMembersWithPrivateMeta(
      [
        makeCloudMember(sharedUuid, 'Quốc Tuấn', { clubCode: 'CLB-A', isActive: true }),
        makeCloudMember('inactive-uuid', 'Đã Nghỉ', { clubCode: 'CLB-A', isActive: false }),
      ],
      { [sharedUuid]: getHostMemberPrivateMeta('CLB-A', sharedUuid)! }
    );

    expect(mergedA).toHaveLength(1);
    expect(mergedA[0].notes).toBe('Ghi chú riêng CLB A');
    expect(getHostMemberPrivateMeta('CLB-B', sharedUuid)?.notes).toBe('Ghi chú riêng CLB B');
  });

  it('3. KHÔNG tự động đẩy 9 thành viên mẫu mặc định (DEFAULT_9_CLUB_MEMBERS) lên Cloud khi máy chưa tùy biến', async () => {
    // Giả lập người dùng mở app lần đầu -> getClubRoster() tự ghi DEFAULT_9_CLUB_MEMBERS vào localStorage
    const initial = getClubRoster();
    expect(initial).toHaveLength(9);
    expect(isDefaultSampleRoster(initial)).toBe(true);
    expect(hasCustomLegacyLocalRoster()).toBe(false);

    const fetchMembersMock = vi.fn();
    const registerMemberMock = vi.fn();
    const adapter: ClubRosterCloudAdapter = {
      fetchMembers: fetchMembersMock,
      registerMember: registerMemberMock,
    };

    const migration = await migrateLocalRosterToCloud({
      clubCode: 'CLB-MOI',
      hostPin: '1234',
      adapter,
    });

    expect(migration.status).toBe('SKIPPED_DEFAULT_SAMPLE');
    expect(migration.createdMembers).toEqual([]);
    expect(fetchMembersMock).not.toHaveBeenCalled();
    expect(registerMemberMock).not.toHaveBeenCalled();
  });

  it('4. Migrate an toàn Sổ CLB đã tùy biến lên Cloud: khớp tên đã tồn tại, đẩy người mới, bảo toàn notes/tags theo UUID và KHÔNG lộ notes lên RPC', async () => {
    // Khởi tạo Sổ CLB local và tùy biến:
    // - Sửa note cho Minh Trí (sẽ trùng tên với người đã có sẵn trên Cloud)
    // - Thêm mới Văn Toàn kèm note & tag kín
    // - Giữ chỉ 2 người tùy biến để kiểm chứng gọn
    localStorage.setItem(
      'badminton_club_roster',
      JSON.stringify([
        {
          id: 'roster_3',
          name: 'Minh Trí',
          sex: 'M',
          rank: 'tby',
          noSingles: false,
          notes: 'Chuyên đánh cầu bền',
          tags: ['Đánh nhiệt'],
        },
        {
          id: 'roster_custom_vt',
          name: 'Văn Toàn',
          sex: 'M',
          rank: 'tbk',
          noSingles: true,
          notes: 'Tay trái đập gắt, hay đến sát giờ',
          tags: ['Trình cứng', 'Hay hủy sát giờ'],
        },
      ])
    );

    expect(hasCustomLegacyLocalRoster()).toBe(true);

    const existingCloudTri = makeCloudMember(
      'uuid-cloud-minh-tri',
      '  minh trí ',
      { clubCode: 'CLB-PRO', rank: 'tby+' }
    );

    const registerPayloads: unknown[] = [];
    const adapter: ClubRosterCloudAdapter = {
      fetchMembers: vi.fn().mockResolvedValue({
        data: [existingCloudTri],
        error: null,
        errorCode: null,
      }),
      registerMember: vi.fn().mockImplementation(async (payload) => {
        registerPayloads.push(payload);
        return {
          data: makeCloudMember('uuid-cloud-van-toan', payload.name, {
            clubCode: payload.clubCode,
            gender: payload.gender,
            rank: payload.rank,
            rankScore: payload.rankScore,
            noSingles: payload.noSingles,
          }),
          error: null,
          errorCode: null,
        };
      }),
    };

    const res = await migrateLocalRosterToCloud({
      clubCode: 'clb-pro',
      hostPin: '8888',
      nowIso: '2026-11-26T12:00:00Z',
      adapter,
    });

    expect(res.status).toBe('MIGRATED');
    expect(res.matchedExistingMembers.map((m) => m.id)).toEqual(['uuid-cloud-minh-tri']);
    expect(res.createdMembers.map((m) => m.id)).toEqual(['uuid-cloud-van-toan']);
    expect(res.memberIdMap).toEqual({
      roster_3: 'uuid-cloud-minh-tri',
      roster_custom_vt: 'uuid-cloud-van-toan',
    });
    expect(res.migratedPrivateMetaCount).toBe(2);

    // Kiểm tra bảo mật: payload gửi lên Cloud TUYỆT ĐỐI không chứa notes hay tags kín của Host
    expect(registerPayloads).toHaveLength(1);
    expect(registerPayloads[0]).not.toHaveProperty('notes');
    expect(registerPayloads[0]).not.toHaveProperty('tags');

    // Ghi chú kín của cả người cũ lẫn người mới đều đã được gắn đúng sang UUID của Cloud
    expect(getHostMemberPrivateMeta('CLB-PRO', 'uuid-cloud-minh-tri')).toMatchObject({
      memberId: 'uuid-cloud-minh-tri',
      notes: 'Chuyên đánh cầu bền',
      tags: ['Đánh nhiệt'],
    });
    expect(getHostMemberPrivateMeta('CLB-PRO', 'uuid-cloud-van-toan')).toMatchObject({
      memberId: 'uuid-cloud-van-toan',
      notes: 'Tay trái đập gắt, hay đến sát giờ',
      tags: ['Trình cứng', 'Hay hủy sát giờ'],
    });

    // Gọi lại lần 2 trả về ALREADY_MIGRATED, không gọi lại mạng
    const secondRun = await migrateLocalRosterToCloud({
      clubCode: 'CLB-PRO',
      hostPin: '8888',
      adapter,
    });
    expect(secondRun.status).toBe('ALREADY_MIGRATED');
  });

  it('5. Xử lý an toàn race condition MEMBER_NAME_ALREADY_EXISTS khi migrate song song từ 2 máy', async () => {
    upsertClubMember({
      name: 'Quang Hải',
      sex: 'M',
      rank: 'tb',
      notes: 'Ghi chú máy Host 2',
    });

    let fetchCount = 0;
    const racedCloudMember = makeCloudMember('uuid-raced-qh', 'Quang Hải', {
      clubCode: 'CLB-RACE',
    });

    const adapter: ClubRosterCloudAdapter = {
      fetchMembers: vi.fn().mockImplementation(async () => {
        fetchCount++;
        // Lần 1 chưa có Quang Hải, lần 2 (sau race) đã có Quang Hải do máy kia vừa tạo
        return {
          data: fetchCount === 1 ? [] : [racedCloudMember],
          error: null,
          errorCode: null,
        };
      }),
      registerMember: vi.fn().mockImplementation(async (payload) => {
        if (payload.name === 'Quang Hải') {
          return {
            data: null,
            error: 'Tên thành viên đã tồn tại',
            errorCode: 'MEMBER_NAME_ALREADY_EXISTS',
          };
        }
        return {
          data: makeCloudMember(`uuid_${payload.name}`, payload.name, { clubCode: 'CLB-RACE' }),
          error: null,
          errorCode: null,
        };
      }),
    };

    const res = await migrateLocalRosterToCloud({
      clubCode: 'CLB-RACE',
      hostPin: '1234',
      adapter,
    });

    expect(res.status).toBe('MIGRATED');
    expect(res.errors).toEqual([]);
    expect(getHostMemberPrivateMeta('CLB-RACE', 'uuid-raced-qh')?.notes).toBe(
      'Ghi chú máy Host 2'
    );
  });

  it('6. Độc lập vòng đời: clearSession() hay xóa phòng online (STORAGE_KEY_CLOUD_ROOM) không làm mất dữ liệu CLB & ghi chú kín', () => {
    setActiveClubCode('CLB-KEEP');
    applyCloudRosterSnapshot('CLB-KEEP', [
      makeCloudMember('uuid-keep-1', 'Tiến Minh', { clubCode: 'CLB-KEEP', rank: 'tbk' }),
    ]);
    upsertHostMemberPrivateMeta('CLB-KEEP', 'uuid-keep-1', {
      notes: 'Không bao giờ được mất khi rời phòng sân',
      tags: ['Trình cứng'],
    });
    syncClubMemberRank('uuid-keep-1', 'tb++', 'CLB-KEEP');

    // Giả lập phiên đánh cầu & phòng online đang hoạt động rồi reset/leaveRoom
    saveSessionImmediate(createInitialSessionState());
    localStorage.setItem(
      STORAGE_KEY_CLOUD_ROOM,
      JSON.stringify({ roomCode: 'SAN-99', pinCode: '1234', role: 'CO_HOST' })
    );

    clearSession();
    localStorage.removeItem(STORAGE_KEY_CLOUD_ROOM);

    const rosterAfterReset = getClubRoster();
    expect(rosterAfterReset).toHaveLength(1);
    expect(rosterAfterReset[0].id).toBe('uuid-keep-1');
    expect(rosterAfterReset[0].rank).toBe('tb++');
    expect(rosterAfterReset[0].notes).toBe('Không bao giờ được mất khi rời phòng sân');
    expect(rosterAfterReset[0].tags).toEqual(['Trình cứng']);
  });

  it('7. Thao tác legacy với clubCode="" không bị trộn/ghi đè bởi CLB Cloud đang active, chống trùng ID ở isDefaultSampleRoster & migrate', async () => {
    // Legacy roster có sẵn 1 người riêng
    localStorage.setItem(
      STORAGE_KEY_CLUB_ROSTER,
      JSON.stringify([{ id: 'leg_1', name: 'Người Máy Đơn', sex: 'M', rank: 'tb' }])
    );

    // Kích hoạt CLB Cloud có thành viên hoàn toàn khác
    setActiveClubCode('CLB-CLOUD');
    applyCloudRosterSnapshot('CLB-CLOUD', [
      makeCloudMember('uuid-cloud-only', 'Người Trên Mây', { clubCode: 'CLB-CLOUD' }),
    ]);

    // Ghi tường minh vào legacy (clubCode = '') KHÔNG ĐƯỢC kéo 'Người Trên Mây' xuống đè legacy
    upsertClubMember({ name: 'Người Máy Đơn 2', sex: 'F', rank: 'tby' }, '');
    updateClubMemberProfile('leg_1', { notes: 'Ghi chú máy đơn' }, '');
    syncClubMemberRank('leg_1', 'tb+', '');
    deleteClubMember('non-existent', '');

    const legacyList = getClubRoster('');
    expect(legacyList.map((m) => m.name)).toEqual(['Người Máy Đơn', 'Người Máy Đơn 2']);
    expect(legacyList[0].rank).toBe('tb+');
    expect(legacyList[0].notes).toBe('Ghi chú máy đơn');

    // 9 bản sao trùng ID của thành viên mẫu đầu tiên KHÔNG ĐƯỢC coi là DEFAULT_9_CLUB_MEMBERS
    const nineDuplicates = Array.from({ length: 9 }, () => ({ ...DEFAULT_9_CLUB_MEMBERS[0] }));
    expect(isDefaultSampleRoster(nineDuplicates)).toBe(false);

    // Migrate danh sách local có 2 dòng trùng tên (khác hoa/thường) không sinh UUID trùng lặp
    localStorage.setItem(
      STORAGE_KEY_CLUB_ROSTER,
      JSON.stringify([
        { id: 'dup_1', name: 'Hoàng Nam', sex: 'M', rank: 'tbk', tags: ['Trình cứng'] },
        { id: 'dup_2', name: 'hoàng nam', sex: 'M', rank: 'tbk', notes: 'Tay phải' },
      ])
    );
    const adapter: ClubRosterCloudAdapter = {
      fetchMembers: vi.fn().mockResolvedValue({ data: [], error: null, errorCode: null }),
      registerMember: vi.fn().mockResolvedValue({
        data: makeCloudMember('uuid-hoang-nam', 'Hoàng Nam', { clubCode: 'CLB-DUP' }),
        error: null,
        errorCode: null,
      }),
    };
    const mig = await migrateLocalRosterToCloud({
      clubCode: 'CLB-DUP',
      hostPin: '1234',
      adapter,
    });
    expect(mig.createdMembers).toHaveLength(1);
    expect(mig.matchedExistingMembers).toHaveLength(0);
    expect(mig.memberIdMap).toEqual({
      dup_1: 'uuid-hoang-nam',
      dup_2: 'uuid-hoang-nam',
    });
    expect(getHostMemberPrivateMeta('CLB-DUP', 'uuid-hoang-nam')).toMatchObject({
      notes: 'Tay phải',
      tags: ['Trình cứng'],
    });
  });
});
