import type {
  BadmintonSessionState,
  Lineup,
  MatchType,
  NextUpDraft,
  Player,
} from '../types/badminton';
import { getEffectiveSkill } from './skillConfig';
import { isRecentPartner } from './statsManager';

/**
 * Hằng số cờ kiểm soát việc chặn người chơi đang thi đấu ở sân khác vào Next Up sân này.
 * Đặt true theo quy chuẩn để đảm bảo người đang đánh ở Sân B không bị chiếm vào Next Up Sân A.
 */
export const BLOCK_PLAYING_ELSEWHERE_FOR_NEXT_UP = true;

/**
 * Tạo một NextUpDraft rỗng cho sân
 */
export function createEmptyNextUp(type: MatchType = 'DOUBLES'): NextUpDraft {
  const count = type === 'SINGLES' ? 2 : 4;
  return {
    type,
    slots: Array(count).fill(null),
    slotSource: Array(count).fill(null),
  };
}

/**
 * Kiểm tra Next Up có hoàn toàn rỗng không (tất cả các slot đều null)
 */
export function isNextUpEmpty(nextUp: NextUpDraft): boolean {
  return nextUp.slots.every((s) => s === null);
}

/**
 * Kiểm tra Next Up đã điền đủ người chưa
 */
export function isNextUpComplete(nextUp: NextUpDraft | any): boolean {
  if (!nextUp) return false;
  if (!Array.isArray(nextUp.slots)) {
    if (Array.isArray(nextUp.team1) && Array.isArray(nextUp.team2)) {
      return nextUp.team1.length > 0 && nextUp.team2.length > 0;
    }
    return false;
  }
  const expectedCount = nextUp.type === 'SINGLES' ? 2 : 4;
  if (nextUp.slots.length !== expectedCount) return false;
  return nextUp.slots.every((s: any) => typeof s === 'string' && s.trim().length > 0);
}

/**
 * Lấy danh sách ID người chơi thực sự có mặt trong Next Up (bỏ qua null)
 */
export function nextUpMemberIds(nextUp: NextUpDraft | any): string[] {
  if (!nextUp) return [];
  if (Array.isArray(nextUp.slots)) {
    return nextUp.slots.filter((s: any): s is string => typeof s === 'string' && s.trim().length > 0);
  }
  if (Array.isArray(nextUp.team1) || Array.isArray(nextUp.team2)) {
    return [...(nextUp.team1 || []), ...(nextUp.team2 || [])].filter((x: any) => typeof x === 'string' && x.trim().length > 0);
  }
  return [];
}

/**
 * Chuyển đổi NextUpDraft hoàn chỉnh sang Lineup để đẩy vào currentMatch
 * Trả về null nếu chưa đủ người
 */
export function slotsToLineup(nextUp: NextUpDraft): Lineup | null {
  if (!isNextUpComplete(nextUp)) return null;

  if (nextUp.type === 'SINGLES') {
    const s0 = nextUp.slots[0]!;
    const s1 = nextUp.slots[1]!;
    return {
      type: 'SINGLES',
      team1: [s0],
      team2: [s1],
      slotSource: {
        [s0]: nextUp.slotSource[0] || 'AUTO',
        [s1]: nextUp.slotSource[1] || 'AUTO',
      },
    };
  }

  // DOUBLES (4 slots: T1a, T1b, T2a, T2b)
  const s0 = nextUp.slots[0]!;
  const s1 = nextUp.slots[1]!;
  const s2 = nextUp.slots[2]!;
  const s3 = nextUp.slots[3]!;

  return {
    type: 'DOUBLES',
    team1: [s0, s1],
    team2: [s2, s3],
    slotSource: {
      [s0]: nextUp.slotSource[0] || 'AUTO',
      [s1]: nextUp.slotSource[1] || 'AUTO',
      [s2]: nextUp.slotSource[2] || 'AUTO',
      [s3]: nextUp.slotSource[3] || 'AUTO',
    },
  };
}

export type SlotCandidateBlockCode =
  | 'NOT_AVAILABLE'
  | 'PLAYING_ELSEWHERE'
  | 'IN_OTHER_NEXT_UP'
  | 'IN_THIS_NEXT_UP';

export interface SlotCandidateStatus {
  selectable: boolean;
  blockCode?: SlotCandidateBlockCode;
  blockLabel?: string;
  warnings: string[];
}

/**
 * Kiểm tra trạng thái ứng viên khi Host muốn xếp vào slotIndex của courtId
 * CHỈ BLOCK 4 lý do cụ thể (P4 & Section 6):
 * 1. NOT_AVAILABLE (nghỉ/rời/không tồn tại)
 * 2. PLAYING_ELSEWHERE (đang đánh ở currentMatch của sân KHÁC; người đang đánh ở sân này thì ĐƯỢC CHỌN)
 * 3. IN_OTHER_NEXT_UP (đã xếp ở Next Up sân khác)
 * 4. IN_THIS_NEXT_UP (đã ở slot khác trong chính Next Up này)
 * Mọi lý do khác (giới tính, chênh trình, đối thủ cũ) CHỈ LÀ CẢNH BÁO không chặn.
 */
export function getSlotCandidateStatus(
  state: BadmintonSessionState,
  courtId: string,
  slotIndex: number,
  playerId: string
): SlotCandidateStatus {
  const player = state.players.find((p) => p.id === playerId);

  // 1. NOT_AVAILABLE
  if (!player || player.status !== 'ACTIVE') {
    return {
      selectable: false,
      blockCode: 'NOT_AVAILABLE',
      blockLabel: player?.status === 'PAUSED' ? 'Đã tạm nghỉ' : 'Không khả dụng',
      warnings: [],
    };
  }

  // 2. PLAYING_ELSEWHERE
  if (BLOCK_PLAYING_ELSEWHERE_FOR_NEXT_UP) {
    for (const c of state.courts) {
      if (c.id !== courtId && c.isActive && c.currentMatch) {
        const busy = [...c.currentMatch.team1, ...c.currentMatch.team2];
        if (busy.includes(playerId)) {
          return {
            selectable: false,
            blockCode: 'PLAYING_ELSEWHERE',
            blockLabel: `Đang đánh ${c.name || c.id}`,
            warnings: [],
          };
        }
      }
    }
  }

  // 3. IN_OTHER_NEXT_UP
  for (const c of state.courts) {
    if (c.id !== courtId && c.isActive && c.nextUp) {
      const members = nextUpMemberIds(c.nextUp);
      if (members.includes(playerId)) {
        return {
          selectable: false,
          blockCode: 'IN_OTHER_NEXT_UP',
          blockLabel: `Đã xếp ${c.name || c.id}`,
          warnings: [],
        };
      }
    }
  }

  // 4. IN_THIS_NEXT_UP
  const thisCourt = state.courts.find((c) => c.id === courtId);
  if (thisCourt?.nextUp) {
    const slots = thisCourt.nextUp.slots;
    for (let idx = 0; idx < slots.length; idx++) {
      if (idx !== slotIndex && slots[idx] === playerId) {
        return {
          selectable: false,
          blockCode: 'IN_THIS_NEXT_UP',
          blockLabel: 'Đã ở Next Up này',
          warnings: [],
        };
      }
    }
  }

  // Không bị BLOCK -> Tính các cảnh báo nếu có
  const warnings: string[] = [];

  // Giả lập đặt player vào slotIndex để kiểm tra cảnh báo
  if (thisCourt?.nextUp) {
    const simSlots = [...thisCourt.nextUp.slots];
    simSlots[slotIndex] = playerId;

    const maleBonus = state.settings?.maleBonus ?? 1.5;
    const filledCount = simSlots.filter(Boolean).length;

    // Cảnh báo giới tính nếu đã điền đủ 4 người
    if (filledCount === 4 && thisCourt.nextUp.type === 'DOUBLES') {
      const pMap = new Map(state.players.map((p) => [p.id, p]));
      const quartet = simSlots.map((id) => pMap.get(id!)).filter(Boolean) as Player[];
      if (quartet.length === 4) {
        const males = quartet.filter((p) => p.sex === 'M').length;
        const females = quartet.filter((p) => p.sex === 'F').length;
        if (males === 3 && females === 1) {
          warnings.push('Lệch giới: 3 Nam – 1 Nữ');
        } else if (males === 1 && females === 3) {
          warnings.push('Lệch giới: 1 Nam – 3 Nữ');
        } else if (males === 4) {
          warnings.push('Trận 4 Nam');
        } else if (females === 4) {
          warnings.push('Trận 4 Nữ');
        }

        // Chênh lệch trình độ
        const s0 = getEffectiveSkill(quartet[0].rank, quartet[0].sex, maleBonus);
        const s1 = getEffectiveSkill(quartet[1].rank, quartet[1].sex, maleBonus);
        const s2 = getEffectiveSkill(quartet[2].rank, quartet[2].sex, maleBonus);
        const s3 = getEffectiveSkill(quartet[3].rank, quartet[3].sex, maleBonus);
        const diff = Math.abs(s0 + s1 - (s2 + s3));
        if (diff > 2.5) {
          warnings.push(`Chênh trình: lệch ${diff.toFixed(1)}đ`);
        }

        // Kiểm tra lặp cặp đồng đội gần nhất
        if (isRecentPartner(state.stats, simSlots[0]!, simSlots[1]!)) {
          warnings.push('Đội 1 vừa đứng cặp trận trước');
        }
        if (isRecentPartner(state.stats, simSlots[2]!, simSlots[3]!)) {
          warnings.push('Đội 2 vừa đứng cặp trận trước');
        }
      }
    }
  }

  return {
    selectable: true,
    warnings,
  };
}

export interface NextUpEvaluation {
  skillDiff: number;
  genderPattern: string;
  warnings: string[];
}

/**
 * Đánh giá chất lượng kèo Next Up (chỉ chạy khi đủ 4 người)
 */
export function evaluateNextUp(
  nextUp: NextUpDraft,
  players: Player[],
  maleBonus: number = 1.5
): NextUpEvaluation | null {
  if (!isNextUpComplete(nextUp) || nextUp.type !== 'DOUBLES') return null;

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const p0 = playerMap.get(nextUp.slots[0]!);
  const p1 = playerMap.get(nextUp.slots[1]!);
  const p2 = playerMap.get(nextUp.slots[2]!);
  const p3 = playerMap.get(nextUp.slots[3]!);

  if (!p0 || !p1 || !p2 || !p3) return null;

  const s0 = getEffectiveSkill(p0.rank, p0.sex, maleBonus);
  const s1 = getEffectiveSkill(p1.rank, p1.sex, maleBonus);
  const s2 = getEffectiveSkill(p2.rank, p2.sex, maleBonus);
  const s3 = getEffectiveSkill(p3.rank, p3.sex, maleBonus);

  const team1Skill = s0 + s1;
  const team2Skill = s2 + s3;
  const skillDiff = Number(Math.abs(team1Skill - team2Skill).toFixed(1));

  const quartet = [p0, p1, p2, p3];
  const males = quartet.filter((p) => p.sex === 'M').length;
  const females = quartet.filter((p) => p.sex === 'F').length;

  let genderPattern = `${males} Nam – ${females} Nữ`;
  if (males === 4) genderPattern = '4 Nam';
  if (females === 4) genderPattern = '4 Nữ';

  const warnings: string[] = [];
  if (skillDiff > 2.5) {
    warnings.push(`Chênh lệch trình độ khá lớn (${skillDiff}đ)`);
  }
  if (males === 3 && females === 1) {
    warnings.push('Kèo 3 Nam – 1 Nữ');
  } else if (males === 1 && females === 3) {
    warnings.push('Kèo 1 Nam – 3 Nữ');
  }

  return {
    skillDiff,
    genderPattern,
    warnings,
  };
}

/**
 * Xoay vòng 3 thế chia cặp của đúng 4 người đang có trên sân:
 * Giả sử 4 người theo thứ tự sắp xếp là [A, B, C, D]
 * Thế 0: [A, B] vs [C, D] (A cặp với B)
 * Thế 1: [A, C] vs [B, D] (A cặp với C)
 * Thế 2: [A, D] vs [B, C] (A cặp với D)
 * Hàm này giữ nguyên đúng 4 người, xoay sang thế kế tiếp: 0 -> 1 -> 2 -> 0.
 */
export function rotatePairing(slots: (string | null)[]): (string | null)[] {
  if (slots.length !== 4 || slots.some((s) => s === null)) {
    return slots;
  }

  const [s0, s1, s2, s3] = slots as string[];
  const all = [s0, s1, s2, s3];
  if (new Set(all).size !== 4) return slots;

  // Cố định người có ID nhỏ nhất là A
  const sorted = [...all].sort();
  const [A, B, C, D] = sorted;

  // Xác định A đang cặp với ai trong slots hiện tại
  let currentPartnerOfA = '';
  if (s0 === A) currentPartnerOfA = s1;
  else if (s1 === A) currentPartnerOfA = s0;
  else if (s2 === A) currentPartnerOfA = s3;
  else if (s3 === A) currentPartnerOfA = s2;

  let currentMode: 0 | 1 | 2 = 0;
  if (currentPartnerOfA === C) currentMode = 1;
  else if (currentPartnerOfA === D) currentMode = 2;
  else currentMode = 0;

  const nextMode = ((currentMode + 1) % 3) as 0 | 1 | 2;

  if (nextMode === 0) {
    // Thế 0: A+B vs C+D
    return [A, B, C, D];
  } else if (nextMode === 1) {
    // Thế 1: A+C vs B+D
    return [A, C, B, D];
  } else {
    // Thế 2: A+D vs B+C
    return [A, D, B, C];
  }
}

/**
 * Tự động chọn thế chia cặp có độ lệch trình độ (skillDiff) nhỏ nhất trong 3 thế
 * Hòa thì theo thứ tự thế (0, 1, 2)
 */
export function balancePairing(
  slots: (string | null)[],
  players: Player[],
  maleBonus: number = 1.5
): (string | null)[] {
  if (slots.length !== 4 || slots.some((s) => s === null)) {
    return slots;
  }

  const all = slots as string[];
  if (new Set(all).size !== 4) return slots;

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const pMap = (id: string) => playerMap.get(id);

  const sorted = [...all].sort();
  const [A, B, C, D] = sorted;
  const pA = pMap(A);
  const pB = pMap(B);
  const pC = pMap(C);
  const pD = pMap(D);

  if (!pA || !pB || !pC || !pD) return slots;

  const sA = getEffectiveSkill(pA.rank, pA.sex, maleBonus);
  const sB = getEffectiveSkill(pB.rank, pB.sex, maleBonus);
  const sC = getEffectiveSkill(pC.rank, pC.sex, maleBonus);
  const sD = getEffectiveSkill(pD.rank, pD.sex, maleBonus);

  const diff0 = Math.abs(sA + sB - (sC + sD));
  const diff1 = Math.abs(sA + sC - (sB + sD));
  const diff2 = Math.abs(sA + sD - (sB + sC));

  const minDiff = Math.min(diff0, diff1, diff2);

  if (Math.abs(diff0 - minDiff) < 0.001) {
    return [A, B, C, D];
  } else if (Math.abs(diff1 - minDiff) < 0.001) {
    return [A, C, B, D];
  } else {
    return [A, D, B, C];
  }
}

/**
 * Kiểm tra nhanh xem sân có đủ người rảnh để sinh gợi ý Next Up không (dùng để hiện toast cảnh báo)
 */
export function canSuggestNextUp(state: BadmintonSessionState, courtId: string): boolean {
  const busyInCurrentMatches = new Set<string>();
  for (const c of state.courts) {
    if (c.isActive && c.currentMatch) {
      c.currentMatch.team1.forEach((id) => busyInCurrentMatches.add(id));
      c.currentMatch.team2.forEach((id) => busyInCurrentMatches.add(id));
    }
  }

  const busyInOtherNextUps = new Set<string>();
  for (const c of state.courts) {
    if (c.id !== courtId && c.isActive && c.nextUp) {
      nextUpMemberIds(c.nextUp).forEach((id) => busyInOtherNextUps.add(id));
    }
  }

  // Tập người rảnh bên ngoài (không trong trận nào, không trong nextUp sân khác)
  const availableOutside = state.players.filter(
    (p) =>
      p.status === 'ACTIVE' &&
      !busyInCurrentMatches.has(p.id) &&
      !busyInOtherNextUps.has(p.id)
  );

  if (availableOutside.length >= 4) return true;

  // Nếu thiếu: kiểm tra xem sân này có trận đang đánh không để dự kiến bổ sung
  const thisCourt = state.courts.find((c) => c.id === courtId);
  if (thisCourt?.isActive && thisCourt.currentMatch) {
    const currentOnThisCourt = [
      ...thisCourt.currentMatch.team1,
      ...thisCourt.currentMatch.team2,
    ];
    const totalPotential = availableOutside.length + currentOnThisCourt.length;
    return totalPotential >= 4;
  }

  return false;
}
