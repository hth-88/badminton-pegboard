import { describe, it, expect } from 'vitest';
import type { Player } from '../../types/badminton';
import {
  badmintonReducer,
  createDefaultCourts,
  createInitialSessionState,
  DEFAULT_SETTINGS,
} from '../sessionReducer';
import {
  getSlotCandidateStatus,
  isNextUpComplete,
  isNextUpEmpty,
  nextUpMemberIds,
} from '../nextUp';
import { migrateSessionState } from '../storage';

function makePlayer(
  id: string,
  name: string,
  sex: 'M' | 'F' = 'M',
  rank: any = 'tb',
  extra: Partial<Player> = {}
): Player {
  return {
    id,
    name,
    sex,
    rank,
    status: 'ACTIVE',
    assignedPool: 'ALL',
    gamesPlayed: 0,
    virtualGamesOffset: 0,
    waitStreak: 0,
    lastPlayedAt: 0,
    singlesCount: 0,
    noSingles: false,
    joinedAt: 1000,
    ...extra,
  };
}

describe('Tái thiết kế court.nextUp - 10 Test Bắt Buộc (Mục 10)', () => {
  // =========================================================================
  // 1. Domino: 3 sân đều có nextUp; SUGGEST_NEXT_UP sân 1 liên tiếp >= 6 lần -> courts[1], courts[2] cùng tham chiếu
  // =========================================================================
  it('1. Domino: Gợi ý sân 1 liên tiếp không thay đổi tham chiếu courts[1] và courts[2]', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(3);
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
      makePlayer('p5', 'P5'),
      makePlayer('p6', 'P6'),
      makePlayer('p7', 'P7'),
      makePlayer('p8', 'P8'),
      makePlayer('p9', 'P9'),
      makePlayer('p10', 'P10'),
      makePlayer('p11', 'P11'),
      makePlayer('p12', 'P12'),
      makePlayer('p13', 'P13'),
      makePlayer('p14', 'P14'),
    ];

    // Khởi tạo nextUp cho cả 3 sân
    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-1', now: 1000 },
    });
    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-2', now: 1000 },
    });
    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-3', now: 1000 },
    });

    const court2RefBefore = state.courts[1];
    const court3RefBefore = state.courts[2];

    // Bấm SUGGEST_NEXT_UP trên court-1 liên tiếp 6 lần
    for (let i = 0; i < 6; i++) {
      state = badmintonReducer(state, {
        type: 'SUGGEST_NEXT_UP',
        payload: { courtId: 'court-1', now: 1000 + i },
      });
      // Sân 2 và Sân 3 PHẢI giữ nguyên cùng tham chiếu đối tượng
      expect(state.courts[1]).toBe(court2RefBefore);
      expect(state.courts[2]).toBe(court3RefBefore);
    }
  });

  // =========================================================================
  // 2. "Gợi ý lại" khi cả 4 slot đang MANUAL -> đổi được đội hình, mọi slotSource thành AUTO; chuỗi gợi ý không trùng lặp khi n > 1
  // =========================================================================
  it('2. Gợi ý lại khi cả 4 slot MANUAL: đổi được đội hình, slotSource thành AUTO, chuỗi gợi ý không trùng lặp', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
      makePlayer('p5', 'P5'),
      makePlayer('p6', 'P6'),
    ];

    // Điền 4 người thủ công: đều là MANUAL
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 0, playerId: 'p1' },
    });
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 1, playerId: 'p2' },
    });
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 2, playerId: 'p3' },
    });
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 3, playerId: 'p4' },
    });

    expect(state.courts[0].nextUp.slotSource).toEqual(['MANUAL', 'MANUAL', 'MANUAL', 'MANUAL']);

    // Bấm Gợi ý lại
    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-1', now: 2000 },
    });

    const nextUp1 = state.courts[0].nextUp;
    expect(nextUp1.slotSource).toEqual(['AUTO', 'AUTO', 'AUTO', 'AUTO']);

    // Bấm Gợi ý lại lần 2: khi n > 1 thì đội hình phải đổi sang phương án khác, không trùng lặp
    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-1', now: 2001 },
    });

    const nextUp2 = state.courts[0].nextUp;
    expect(nextUp2.slots).not.toEqual(nextUp1.slots);
    expect(nextUp2.slotSource).toEqual(['AUTO', 'AUTO', 'AUTO', 'AUTO']);
  });

  // =========================================================================
  // 3. Sân 1 gợi ý được bình thường dù Sân 2/3 tắt hay bật
  // =========================================================================
  it('3. Sân 1 gợi ý bình thường độc lập dù Sân 2/3 tắt hay bật', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(3);
    state.courts[1].isActive = false;
    state.courts[2].isActive = false;
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
    ];

    // Sân 2 và 3 đang tắt
    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-1', now: 1000 },
    });
    expect(isNextUpComplete(state.courts[0].nextUp)).toBe(true);

    // Bật Sân 2 lên, Sân 1 vẫn gợi ý bình thường
    state = badmintonReducer(state, {
      type: 'UPDATE_COURT',
      payload: { courtId: 'court-2', updates: { isActive: true } },
    });

    state = badmintonReducer(state, {
      type: 'SUGGEST_NEXT_UP',
      payload: { courtId: 'court-1', now: 2000 },
    });
    expect(isNextUpComplete(state.courts[0].nextUp)).toBe(true);
  });

  // =========================================================================
  // 4. 4 Nam, thay D bằng Nữ X: A, B, C giữ nguyên vị trí; chỉ có cảnh báo, không BLOCK
  // =========================================================================
  it('4. Đổi 1 người: 3 người còn lại giữ nguyên 100%, chỉ sinh cảnh báo không chặn', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    state.players = [
      makePlayer('m1', 'Nam 1', 'M', 'tb'),
      makePlayer('m2', 'Nam 2', 'M', 'tb'),
      makePlayer('m3', 'Nam 3', 'M', 'tb'),
      makePlayer('m4', 'Nam 4', 'M', 'tb'),
      makePlayer('f1', 'Nữ 1', 'F', 'tb'),
    ];

    // Gán 4 nam vào nextUp
    for (let i = 0; i < 4; i++) {
      state = badmintonReducer(state, {
        type: 'SET_NEXT_UP_SLOT',
        payload: { courtId: 'court-1', slotIndex: i, playerId: `m${i + 1}` },
      });
    }

    // Kiểm tra candidate status của f1 cho slot 3: selectable = true
    const candStatus = getSlotCandidateStatus(state, 'court-1', 3, 'f1');
    expect(candStatus.selectable).toBe(true);
    expect(candStatus.blockCode).toBeUndefined();
    // Có cảnh báo lệch giới tính (3 Nam - 1 Nữ)
    expect(candStatus.warnings.length).toBeGreaterThan(0);

    // Host đổi slot 3 thành f1
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 3, playerId: 'f1' },
    });

    // 3 slot còn lại PHẢI giữ nguyên 100%
    expect(state.courts[0].nextUp.slots[0]).toBe('m1');
    expect(state.courts[0].nextUp.slots[1]).toBe('m2');
    expect(state.courts[0].nextUp.slots[2]).toBe('m3');
    expect(state.courts[0].nextUp.slots[3]).toBe('f1');
    expect(state.courts[0].nextUp.slotSource[3]).toBe('MANUAL');
  });

  // =========================================================================
  // 5. ✕ -> đúng 1 slot thành null, 3 slot kia nguyên; người đó chọn được ở sân khác. CLEAR_NEXT_UP -> 4 null
  // =========================================================================
  it('5. ✕ xóa đúng 1 slot; người đó chọn được ở sân khác; CLEAR_NEXT_UP xóa sạch và giữ nguyên sau render', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(2);
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
    ];

    // Gán p1..p4 vào Sân 1
    for (let i = 0; i < 4; i++) {
      state = badmintonReducer(state, {
        type: 'SET_NEXT_UP_SLOT',
        payload: { courtId: 'court-1', slotIndex: i, playerId: `p${i + 1}` },
      });
    }

    // Lúc này p1 đang ở nextUp của Sân 1 -> Sân 2 kiểm tra p1 bị BLOCK IN_OTHER_NEXT_UP
    const candBefore = getSlotCandidateStatus(state, 'court-2', 0, 'p1');
    expect(candBefore.selectable).toBe(false);
    expect(candBefore.blockCode).toBe('IN_OTHER_NEXT_UP');

    // Host bấm ✕ ở slot 0 của Sân 1 (bỏ p1)
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 0, playerId: null },
    });

    expect(state.courts[0].nextUp.slots[0]).toBeNull();
    expect(state.courts[0].nextUp.slots[1]).toBe('p2');
    expect(state.courts[0].nextUp.slots[2]).toBe('p3');
    expect(state.courts[0].nextUp.slots[3]).toBe('p4');

    // Giờ p1 đã được giải phóng -> Sân 2 chọn được p1
    const candAfter = getSlotCandidateStatus(state, 'court-2', 0, 'p1');
    expect(candAfter.selectable).toBe(true);
    expect(candAfter.blockCode).toBeUndefined();

    // CLEAR_NEXT_UP -> 4 ô đều thành null
    state = badmintonReducer(state, {
      type: 'CLEAR_NEXT_UP',
      payload: { courtId: 'court-1' },
    });
    expect(isNextUpEmpty(state.courts[0].nextUp)).toBe(true);
  });

  // =========================================================================
  // 6. BLOCK đúng 4 mã ở mục 6; mọi lý do khác không chặn
  // =========================================================================
  it('6. Candidate status: CHỈ BLOCK đúng 4 mã: NOT_AVAILABLE, PLAYING_ELSEWHERE, IN_OTHER_NEXT_UP, IN_THIS_NEXT_UP', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(2);
    state.players = [
      makePlayer('p_paused', 'Paused', 'M', 'tb', { status: 'PAUSED' }),
      makePlayer('p_playing', 'Playing', 'M', 'tb'),
      makePlayer('p_nextup_c2', 'In Court 2 NextUp', 'M', 'tb'),
      makePlayer('p_nextup_c1', 'In Court 1 NextUp', 'M', 'tb'),
      makePlayer('p_pro', 'Pro A', 'M', 'xs'),
      makePlayer('p_newbie', 'Newbie', 'F', 'yeu-'),
    ];

    // p_playing đang chơi trên sân 2
    state.courts[1].currentMatch = {
      type: 'DOUBLES',
      team1: ['p_playing', 'dummy1'],
      team2: ['dummy2', 'dummy3'],
      slotSource: {},
      startedAt: 1000,
    };

    // p_nextup_c2 đang ở nextUp của sân 2
    state.courts[1].nextUp.slots[0] = 'p_nextup_c2';

    // p_nextup_c1 đang ở slot 0 của sân 1
    state.courts[0].nextUp.slots[0] = 'p_nextup_c1';

    // 1. NOT_AVAILABLE
    const s1 = getSlotCandidateStatus(state, 'court-1', 1, 'p_paused');
    expect(s1.selectable).toBe(false);
    expect(s1.blockCode).toBe('NOT_AVAILABLE');

    // 2. PLAYING_ELSEWHERE
    const s2 = getSlotCandidateStatus(state, 'court-1', 1, 'p_playing');
    expect(s2.selectable).toBe(false);
    expect(s2.blockCode).toBe('PLAYING_ELSEWHERE');

    // 3. IN_OTHER_NEXT_UP
    const s3 = getSlotCandidateStatus(state, 'court-1', 1, 'p_nextup_c2');
    expect(s3.selectable).toBe(false);
    expect(s3.blockCode).toBe('IN_OTHER_NEXT_UP');

    // 4. IN_THIS_NEXT_UP
    const s4 = getSlotCandidateStatus(state, 'court-1', 1, 'p_nextup_c1');
    expect(s4.selectable).toBe(false);
    expect(s4.blockCode).toBe('IN_THIS_NEXT_UP');

    // 5. Chênh lệch trình độ cực lớn hoặc giới tính -> KHÔNG BLOCK, selectable = true
    const s5 = getSlotCandidateStatus(state, 'court-1', 1, 'p_pro');
    expect(s5.selectable).toBe(true);
    expect(s5.blockCode).toBeUndefined();

    const s6 = getSlotCandidateStatus(state, 'court-1', 1, 'p_newbie');
    expect(s6.selectable).toBe(true);
    expect(s6.blockCode).toBeUndefined();
  });

  // =========================================================================
  // 7. REARRANGE ROTATE/BALANCE: tập 4 người không đổi
  // =========================================================================
  it('7. REARRANGE_NEXT_UP (ROTATE & BALANCE): bảo toàn tập 4 người chơi', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    state.players = [
      makePlayer('p1', 'P1', 'M', 'xs'),
      makePlayer('p2', 'P2', 'M', 'tb'),
      makePlayer('p3', 'P3', 'M', 'yeu'),
      makePlayer('p4', 'P4', 'M', 'xs'),
    ];

    for (let i = 0; i < 4; i++) {
      state = badmintonReducer(state, {
        type: 'SET_NEXT_UP_SLOT',
        payload: { courtId: 'court-1', slotIndex: i, playerId: `p${i + 1}` },
      });
    }

    const originalSet = new Set(['p1', 'p2', 'p3', 'p4']);

    // ROTATE
    state = badmintonReducer(state, {
      type: 'REARRANGE_NEXT_UP',
      payload: { courtId: 'court-1', mode: 'ROTATE' },
    });
    expect(new Set(state.courts[0].nextUp.slots)).toEqual(originalSet);

    // ROTATE tiếp
    state = badmintonReducer(state, {
      type: 'REARRANGE_NEXT_UP',
      payload: { courtId: 'court-1', mode: 'ROTATE' },
    });
    expect(new Set(state.courts[0].nextUp.slots)).toEqual(originalSet);

    // BALANCE
    state = badmintonReducer(state, {
      type: 'REARRANGE_NEXT_UP',
      payload: { courtId: 'court-1', mode: 'BALANCE' },
    });
    expect(new Set(state.courts[0].nextUp.slots)).toEqual(originalSet);
  });

  // =========================================================================
  // 8. Tiêu thụ: đủ 4 -> thành currentMatch rồi tự gợi ý đúng 1 lần cho sân đó; thiếu -> không promote
  // =========================================================================
  it('8. START_MATCH tiêu thụ nextUp nếu đủ 4 và tự gợi ý lượt sau; nếu thiếu 4 thì không bắt đầu', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
      makePlayer('p5', 'P5'),
      makePlayer('p6', 'P6'),
      makePlayer('p7', 'P7'),
      makePlayer('p8', 'P8'),
    ];

    // Trường hợp thiếu: chỉ có 3 người
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 0, playerId: 'p1' },
    });
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 1, playerId: 'p2' },
    });
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 2, playerId: 'p3' },
    });

    const stateBefore = state;
    // Bấm START_MATCH khi chưa đủ 4 -> không bắt đầu trận
    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: { courtId: 'court-1', now: 1000 },
    });
    expect(state).toBe(stateBefore);
    expect(state.courts[0].currentMatch).toBeNull();

    // Điền thêm p4 cho đủ 4 người
    state = badmintonReducer(state, {
      type: 'SET_NEXT_UP_SLOT',
      payload: { courtId: 'court-1', slotIndex: 3, playerId: 'p4' },
    });

    // Bấm START_MATCH -> bắt đầu trận thành công
    state = badmintonReducer(state, {
      type: 'START_MATCH',
      payload: { courtId: 'court-1', now: 2000 },
    });

    expect(state.courts[0].currentMatch).not.toBeNull();
    expect(state.courts[0].currentMatch?.team1).toEqual(['p1', 'p2']);
    expect(state.courts[0].currentMatch?.team2).toEqual(['p3', 'p4']);

    // Tự động gợi ý lượt sau cho chính sân đó (lấy từ p5..p8)
    expect(isNextUpComplete(state.courts[0].nextUp)).toBe(true);
    const newNextUp = nextUpMemberIds(state.courts[0].nextUp);
    for (const p of ['p1', 'p2', 'p3', 'p4']) {
      expect(newNextUp).not.toContain(p);
    }
  });

  // =========================================================================
  // 9. Người nghỉ -> chỉ slot chứa họ thành null
  // =========================================================================
  it('9. PAUSE_PLAYER chỉ đặt đúng slot chứa người đó thành null, 3 slot còn lại giữ nguyên 100%', () => {
    let state = createInitialSessionState();
    state.courts = createDefaultCourts(1);
    state.players = [
      makePlayer('p1', 'P1'),
      makePlayer('p2', 'P2'),
      makePlayer('p3', 'P3'),
      makePlayer('p4', 'P4'),
    ];

    for (let i = 0; i < 4; i++) {
      state = badmintonReducer(state, {
        type: 'SET_NEXT_UP_SLOT',
        payload: { courtId: 'court-1', slotIndex: i, playerId: `p${i + 1}` },
      });
    }

    // Cho p2 nghỉ
    state = badmintonReducer(state, {
      type: 'PAUSE_PLAYER',
      payload: { playerId: 'p2' },
    });

    expect(state.courts[0].nextUp.slots[0]).toBe('p1');
    expect(state.courts[0].nextUp.slots[1]).toBeNull();
    expect(state.courts[0].nextUp.slotSource[1]).toBeNull();
    expect(state.courts[0].nextUp.slots[2]).toBe('p3');
    expect(state.courts[0].nextUp.slots[3]).toBe('p4');
  });

  // =========================================================================
  // 10. Migration từ state cũ
  // =========================================================================
  it('10. migrateSessionState: chuyển đổi Lineup sang NextUpDraft, bỏ courtPlanIndex, dọn dẹp vệ sinh dữ liệu', () => {
    const legacyState: any = {
      players: [
        makePlayer('p1', 'P1'),
        makePlayer('p2', 'P2'),
        makePlayer('p3', 'P3'),
        makePlayer('p4', 'P4'),
      ],
      courts: [
        {
          id: 'court-1',
          name: 'Sân 1',
          isActive: true,
          policy: 'DOUBLES_ONLY',
          forcedType: null,
          currentMatch: null,
          nextUp: {
            id: 'legacy_match',
            type: 'DOUBLES',
            team1: ['p1', 'p2'],
            team2: ['p3', 'p4'],
            slotSource: { p1: 'AUTO', p2: 'AUTO', p3: 'AUTO', p4: 'AUTO' },
          },
        },
      ],
      courtPlanIndex: { 'court-1': 5 },
      settings: DEFAULT_SETTINGS,
      history: [],
      stats: { matchCount: 0, playerStats: {}, pairStats: {}, opponentStats: {} },
      readyQueue: [],
      pairRules: [],
      mixDebt: { doubles: 0, singles: 0 },
      autoSinglesSnooze: {},
      undoStack: [{ some: 'data' }],
      redoStack: [{ some: 'data' }],
    };

    const migrated = migrateSessionState(legacyState);

    // courtPlanIndex bị loại bỏ
    expect((migrated as any).courtPlanIndex).toBeUndefined();

    // undoStack và redoStack được làm sạch
    expect(migrated.undoStack).toEqual([]);
    expect(migrated.redoStack).toEqual([]);

    // nextUp được chuyển sang NextUpDraft chuẩn
    const court1 = migrated.courts[0];
    expect(court1.nextUp.type).toBe('DOUBLES');
    expect(court1.nextUp.slots).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(court1.nextUp.slotSource).toEqual(['AUTO', 'AUTO', 'AUTO', 'AUTO']);
    expect(court1.suggestCursor).toBe(0);
  });
});
