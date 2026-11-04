import type { BadmintonRank, Player, Sex } from '../types/badminton';

/**
 * Regex bắt rank theo thứ tự từ dài đến ngắn:
 * tbk|tb\+\+|tb\+|tb-|tby\+|tby-|tby|tb|y\+|y-|y|newbie (không phân biệt hoa thường)
 */
export const RANK_REGEX = /^(tbk|tb\+\+|tb\+|tb-|tby\+|tby-|tby|tb|y\+|y-|y|newbie)$/i;

export interface ParsedPastePlayer {
  id: string;
  name: string;
  sex: Sex;
  rank: BadmintonRank;
  status: 'ACTIVE';
  assignedPool: 'ALL';
  noSingles: boolean;
  joinedAt: number;
  warning?: string;
}

export interface PasteLineError {
  lineIndex: number;
  raw: string;
  error: string;
}

export interface PasteLineWarning {
  lineIndex: number;
  raw: string;
  warning: string;
}

export interface ParsePasteResult {
  valid: ParsedPastePlayer[];
  errors: PasteLineError[];
  warnings: PasteLineWarning[];
}

export interface ParsePasteOptions {
  /**
   * Nếu bật: dòng thiếu trình độ sẽ tự điền 'tb-', dòng thiếu giới tính sẽ tự điền 'M'.
   * Phù hợp để paste nhanh từ danh sách điểm danh Zalo / Messenger.
   */
  allowDefaults?: boolean;
}

export function parseGender(raw: string): Sex | null {
  const s = raw.trim().toLowerCase();
  if (['nam', 'm', 'male', 'trai', 'boy'].includes(s)) return 'M';
  if (['nữ', 'nu', 'f', 'female', 'gái', 'gai', 'girl'].includes(s)) return 'F';
  return null;
}

export function parseRank(raw: string): BadmintonRank | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  const match = s.match(RANK_REGEX);
  if (!match) return null;
  return match[1].toLowerCase() as BadmintonRank;
}

// Bóc tách giới tính trong ngoặc như (Nam), (Nữ), (nu), (trai)...
// Tiêu thụ luôn dấu gạch '-' phía sau nếu có để tránh tạo thành ' - - '
const GENDER_PAREN_REGEX = /\s*\(((?:nam|nu|nữ|m|f|trai|gái|gai|female|male|boy|girl))\)\s*(?:-\s*)?/i;

// Bỏ số thứ tự / ký tự đầu dòng như "1. ", "2) ", "3 - ", "• ", "- ", "* "
const LEADING_NUMBER_REGEX = /^(?:\d+[\.\)\-:]\s*|[-•*]\s+)/;

// Delimiters: '/', ',', '|', tab '\t', hoặc ' - ' (khoảng trắng - khoảng trắng)
const DELIM_REGEX = /\s*[/,|\t]\s*|\s+-\s+/;

/**
 * Hàm thuần phân tích chuỗi Quick Paste thành danh sách người chơi
 *
 * Hỗ trợ định dạng từ Zalo / Messenger / Excel:
 * - Bỏ số thứ tự đầu dòng (1., 2), •, -)
 * - Tách token bằng /, ,, |, \t, hoặc ' - '
 * - Nhận diện giới tính cả dạng tự do và trong ngoặc: (Nam), (Nữ)...
 * - 12 bậc trình độ chuẩn
 * - Hỗ trợ options.allowDefaults để tự động điền Nam & TB- khi danh sách chỉ có Tên hoặc Tên - Giới tính
 */
export function parsePasteLines(
  text: string,
  existingPlayersOrNames: Array<Player | string> = [],
  options: ParsePasteOptions = {}
): ParsePasteResult {
  if (!text || !text.trim()) {
    return { valid: [], errors: [], warnings: [] };
  }

  const { allowDefaults = false } = options;

  const seenNames = new Set<string>();
  for (const item of existingPlayersOrNames) {
    const n = typeof item === 'string' ? item : item.name;
    if (n && n.trim()) {
      seenNames.add(n.trim().toLowerCase());
    }
  }

  const lines = text.split('\n');
  const valid: ParsedPastePlayer[] = [];
  const errors: PasteLineError[] = [];
  const warnings: PasteLineWarning[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const lineIndex = idx + 1;

    // 1. Bỏ số thứ tự hoặc bullet ở đầu dòng
    let cleaned = trimmed.replace(LEADING_NUMBER_REGEX, '').trim();

    // 2. Chuẩn hóa giới tính trong ngoặc đơn thành ' - GiớiTính - '
    cleaned = cleaned.replace(GENDER_PAREN_REGEX, ' - $1 - ');

    const parts = cleaned
      .split(DELIM_REGEX)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    let rawName = '';
    let sex: Sex | null = null;
    let rank: BadmintonRank | null = null;

    if (parts.length === 0) {
      return;
    }

    if (parts.length === 1) {
      if (allowDefaults) {
        rawName = parts[0];
        sex = sex || 'M';
        rank = 'tb-';
      } else {
        errors.push({
          lineIndex,
          raw: trimmed,
          error: 'Thiếu thông tin (Cần: Tên - Giới tính - Trình độ)',
        });
        return;
      }
    } else if (parts.length === 2) {
      const pLast = parts[1];
      const rankLast = parseRank(pLast);
      const genderLast = parseGender(pLast);

      if (rankLast) {
        if (sex) {
          // Đã có parenGender, parts[1] là rank, parts[0] là tên
          rawName = parts[0];
          rank = rankLast;
        } else if (allowDefaults) {
          rawName = parts[0];
          sex = 'M';
          rank = rankLast;
        } else {
          errors.push({
            lineIndex,
            raw: trimmed,
            error: 'Thiếu giới tính (Dùng Nam/Nữ hoặc M/F)',
          });
          return;
        }
      } else if (genderLast) {
        if (allowDefaults) {
          rawName = parts[0];
          sex = genderLast;
          rank = 'tb-';
        } else {
          errors.push({
            lineIndex,
            raw: trimmed,
            error: 'Thiếu trình độ (newbie, y-, y, y+, tby-, tby, tby+, tb-, tb, tb+, tb++, tbk)',
          });
          return;
        }
      } else {
        if (allowDefaults) {
          rawName = parts.join(' ');
          sex = sex || 'M';
          rank = 'tb-';
        } else {
          errors.push({
            lineIndex,
            raw: trimmed,
            error: 'Thiếu thông tin trình độ hoặc giới tính không hợp lệ',
          });
          return;
        }
      }
    } else {
      // parts.length >= 3
      const tLast = parts[parts.length - 1];
      const tPrev = parts[parts.length - 2];

      const rankAtLast = parseRank(tLast);
      const genderAtLast = parseGender(tLast);
      const rankAtPrev = parseRank(tPrev);
      const genderAtPrev = parseGender(tPrev);

      if (rankAtLast && genderAtPrev) {
        rank = rankAtLast;
        sex = genderAtPrev;
        rawName = parts.slice(0, parts.length - 2).join(' - ').trim();
      } else if (genderAtLast && rankAtPrev) {
        rank = rankAtPrev;
        sex = genderAtLast;
        rawName = parts.slice(0, parts.length - 2).join(' - ').trim();
      } else if (rankAtLast && sex) {
        // Có parenGender
        rank = rankAtLast;
        rawName = parts.slice(0, parts.length - 1).join(' - ').trim();
      } else {
        // Phân tích lỗi chi tiết để giữ nguyên test backwards-compatibility
        if (genderAtPrev !== null) {
          errors.push({
            lineIndex,
            raw: trimmed,
            error: `Trình độ "${tLast}" không hợp lệ (newbie, y-, y, y+, tby-, tby, tby+, tb-, tb, tb+, tb++, tbk)`,
          });
          return;
        } else if (rankAtLast !== null) {
          errors.push({
            lineIndex,
            raw: trimmed,
            error: `Giới tính "${tPrev}" không hợp lệ (Dùng Nam/Nữ hoặc M/F)`,
          });
          return;
        } else if (genderAtLast !== null) {
          errors.push({
            lineIndex,
            raw: trimmed,
            error: `Trình độ "${tPrev}" không hợp lệ (newbie, y-, y, y+, tby-, tby, tby+, tb-, tb, tb+, tb++, tbk)`,
          });
          return;
        } else if (rankAtPrev !== null) {
          errors.push({
            lineIndex,
            raw: trimmed,
            error: `Giới tính "${tLast}" không hợp lệ (Dùng Nam/Nữ hoặc M/F)`,
          });
          return;
        } else {
          errors.push({
            lineIndex,
            raw: trimmed,
            error: `Trình độ "${tLast}" không hợp lệ (newbie, y-, y, y+, tby-, tby, tby+, tb-, tb, tb+, tb++, tbk)`,
          });
          return;
        }
      }
    }

    if (!rawName) {
      errors.push({
        lineIndex,
        raw: trimmed,
        error: 'Tên người chơi không được để trống',
      });
      return;
    }

    if (!rank) {
      errors.push({
        lineIndex,
        raw: trimmed,
        error: 'Thiếu trình độ (newbie, y-, y, y+, tby-, tby, tby+, tb-, tb, tb+, tb++, tbk)',
      });
      return;
    }

    if (!sex) {
      errors.push({
        lineIndex,
        raw: trimmed,
        error: 'Thiếu giới tính (Dùng Nam/Nữ hoặc M/F)',
      });
      return;
    }

    // Kiểm tra cảnh báo trùng tên
    const normName = rawName.toLowerCase();
    let warningMsg: string | undefined;
    if (seenNames.has(normName)) {
      warningMsg = `Tên "${rawName}" bị trùng với người chơi đã có hoặc trùng trong cùng lần dán`;
      warnings.push({
        lineIndex,
        raw: trimmed,
        warning: warningMsg,
      });
    }
    seenNames.add(normName);

    valid.push({
      id: `candidate_${idx}`,
      name: rawName,
      sex,
      rank,
      status: 'ACTIVE',
      assignedPool: 'ALL',
      noSingles: false,
      joinedAt: 0,
      warning: warningMsg,
    });
  });

  return { valid, errors, warnings };
}
