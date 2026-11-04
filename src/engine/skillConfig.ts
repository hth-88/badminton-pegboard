import type { BadmintonRank, Sex } from '../types/badminton';

/**
 * 12 bậc trình độ từ thấp lên cao theo thang chuẩn sân phong trào Việt Nam
 */
export const ORDERED_RANKS: readonly BadmintonRank[] = [
  'newbie',
  'y-',
  'y',
  'y+',
  'tby-',
  'tby',
  'tby+',
  'tb-',
  'tb',
  'tb+',
  'tb++',
  'tbk',
] as const;

/**
 * Điểm cơ sở (Base score) cho từng bậc trình độ
 */
export const RANK_BASE_SCORES: Record<BadmintonRank, number> = {
  'newbie': 1.0,
  'y-': 2.0,
  'y': 3.0,
  'y+': 4.0,
  'tby-': 5.0,
  'tby': 6.0,
  'tby+': 7.0,
  'tb-': 8.5,
  'tb': 10.0,
  'tb+': 11.5,
  'tb++': 13.0,
  'tbk': 14.5,
};

export interface RankMeta {
  rank: BadmintonRank;
  code: string;
  name: string;
  baseScore: number;
  description: string;
  badgeBg: string;
  badgeText: string;
}

export const RANK_METADATA: Record<BadmintonRank, RankMeta> = {
  'newbie': {
    rank: 'newbie',
    code: 'Newbie',
    name: 'Mới tập / Cầm vợt',
    baseScore: 1.0,
    description: 'Chưa biết bộ, đánh cầu chưa qua lưới đều',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeText: 'text-slate-700 dark:text-slate-300',
  },
  'y-': {
    rank: 'y-',
    code: 'Y-',
    name: 'Yếu trừ',
    baseScore: 2.0,
    description: 'Đánh được bóng qua lại cơ bản, di chuyển còn chậm',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
  },
  'y': {
    rank: 'y',
    code: 'Y',
    name: 'Yếu',
    baseScore: 3.0,
    description: 'Giao cầu ổn, biết phòng thủ đơn giản',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900',
    badgeText: 'text-emerald-800 dark:text-emerald-200',
  },
  'y+': {
    rank: 'y+',
    code: 'Y+',
    name: 'Yếu cộng',
    baseScore: 4.0,
    description: 'Bắt đầu có lực tay, phông cầu cuối sân',
    badgeBg: 'bg-teal-100 dark:bg-teal-900',
    badgeText: 'text-teal-800 dark:text-teal-200',
  },
  'tby-': {
    rank: 'tby-',
    code: 'TBY-',
    name: 'Trung bình yếu trừ',
    baseScore: 5.0,
    description: 'Biết đập cầu cơ bản, chuyển đổi tấn công - thủ',
    badgeBg: 'bg-cyan-100 dark:bg-cyan-900',
    badgeText: 'text-cyan-800 dark:text-cyan-200',
  },
  'tby': {
    rank: 'tby',
    code: 'TBY',
    name: 'Trung bình yếu',
    baseScore: 6.0,
    description: 'Chơi đều đặn, hiểu luật đánh đôi',
    badgeBg: 'bg-sky-100 dark:bg-sky-900',
    badgeText: 'text-sky-800 dark:text-sky-200',
  },
  'tby+': {
    rank: 'tby+',
    code: 'TBY+',
    name: 'Trung bình yếu cộng',
    baseScore: 7.0,
    description: 'Đánh bền, cắt nhỏ ổn định, thể lực tốt',
    badgeBg: 'bg-blue-100 dark:bg-blue-900',
    badgeText: 'text-blue-800 dark:text-blue-200',
  },
  'tb-': {
    rank: 'tb-',
    code: 'TB-',
    name: 'Trung bình trừ',
    baseScore: 8.5,
    description: 'Phản tạt nhanh, đập cầu có điểm rơi',
    badgeBg: 'bg-indigo-100 dark:bg-indigo-900',
    badgeText: 'text-indigo-800 dark:text-indigo-200',
  },
  'tb': {
    rank: 'tb',
    code: 'TB',
    name: 'Trung bình',
    baseScore: 10.0,
    description: 'Trình chuẩn phong trào, bao sân tốt, chiến thuật đôi rõ ràng',
    badgeBg: 'bg-violet-100 dark:bg-violet-900',
    badgeText: 'text-violet-800 dark:text-violet-200',
  },
  'tb+': {
    rank: 'tb+',
    code: 'TB+',
    name: 'Trung bình cộng',
    baseScore: 11.5,
    description: 'Đập cầu uy lực, phán đoán cầu tốt, ít lỗi hỏng',
    badgeBg: 'bg-purple-100 dark:bg-purple-900',
    badgeText: 'text-purple-800 dark:text-purple-200',
  },
  'tb++': {
    rank: 'tb++',
    code: 'TB++',
    name: 'Trung bình khá',
    baseScore: 13.0,
    description: 'Tay to, đập gõ hiểm hóc, bắt lưới nhanh',
    badgeBg: 'bg-fuchsia-100 dark:bg-fuchsia-900',
    badgeText: 'text-fuchsia-800 dark:text-fuchsia-200',
  },
  'tbk': {
    rank: 'tbk',
    code: 'TBK',
    name: 'Trung bình khá cứng / Khá',
    baseScore: 14.5,
    description: 'Top sân phong trào / Bán chuyên nghiệp địa phương',
    badgeBg: 'bg-rose-100 dark:bg-rose-900',
    badgeText: 'text-rose-800 dark:text-rose-200',
  },
};

/**
 * Tính điểm trình độ hiệu dụng (Effective Skill Score)
 * có tính bù trừ giới tính.
 *
 * @param rank Trình độ người chơi (1 trong 12 bậc)
 * @param sex Giới tính ('M' hoặc 'F')
 * @param maleBonus Điểm cộng cho Nam (mặc định 1.5)
 * @returns Điểm thực tế sau bù trừ
 *
 * Ví dụ thực tế:
 * - Nữ TB: 10.0
 * - Nam TB-: 8.5 + 1.5 = 10.0 (ngang Nữ TB)
 * - Nam TBY+: 7.0 + 1.5 = 8.5 (ngang Nữ TB-)
 */
export function getEffectiveSkill(
  rank: BadmintonRank,
  sex: Sex,
  maleBonus: number = 1.5
): number {
  const base = RANK_BASE_SCORES[rank] ?? 1.0;
  return sex === 'M' ? base + maleBonus : base;
}

/**
 * So sánh thứ tự 2 bậc trình độ
 * @returns số âm nếu r1 < r2, 0 nếu r1 == r2, số dương nếu r1 > r2
 */
export function compareRanks(r1: BadmintonRank, r2: BadmintonRank): number {
  const i1 = ORDERED_RANKS.indexOf(r1);
  const i2 = ORDERED_RANKS.indexOf(r2);
  return i1 - i2;
}

export function formatSkillScore(score: number): string {
  return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
}
