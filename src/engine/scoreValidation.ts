export interface ScoreValidationResult {
  status: 'EMPTY' | 'VALID' | 'WARNING' | 'ERROR';
  message?: string;
  score?: { team1: number; team2: number };
}

export function validateBadmintonScore(
  rawTeam1: string,
  rawTeam2: string
): ScoreValidationResult {
  const s1 = rawTeam1.trim();
  const s2 = rawTeam2.trim();

  if (s1 === '' && s2 === '') {
    return { status: 'EMPTY' };
  }

  if (s1 === '' || s2 === '') {
    return {
      status: 'ERROR',
      message: 'Vui lòng nhập đủ điểm cả 2 đội hoặc để trống cả 2.',
    };
  }

  const n1 = Number(s1);
  const n2 = Number(s2);

  if (
    !Number.isInteger(n1) ||
    !Number.isInteger(n2) ||
    n1 < 0 ||
    n2 < 0 ||
    n1 > 30 ||
    n2 > 30
  ) {
    return {
      status: 'ERROR',
      message: 'Điểm cầu lông hợp lệ phải là số nguyên từ 0 đến 30.',
    };
  }

  if (n1 === n2) {
    return {
      status: 'ERROR',
      message: 'Tỉ số cầu lông không thể hòa — vui lòng nhập đội thắng.',
    };
  }

  const hi = Math.max(n1, n2);
  const lo = Math.min(n1, n2);
  const diff = hi - lo;

  const isStandardBwf21 =
    (hi === 21 && lo <= 19) ||
    (hi > 21 && hi < 30 && diff === 2) ||
    (hi === 30 && (lo === 28 || lo === 29));

  if (!isStandardBwf21) {
    return {
      status: 'WARNING',
      message:
        'Tỉ số không theo chuẩn set 21 BWF (VD đánh set ngắn) — vẫn có thể lưu nếu đúng thực tế.',
      score: { team1: n1, team2: n2 },
    };
  }

  return {
    status: 'VALID',
    score: { team1: n1, team2: n2 },
  };
}
