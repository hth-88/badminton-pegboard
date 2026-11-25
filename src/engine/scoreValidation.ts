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
    n2 < 0
  ) {
    return {
      status: 'ERROR',
      message: 'Điểm phải là số nguyên không âm.',
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

  // Từ 30 điểm trở lên (tính chạm 30/31...): chấp nhận cách 1 quả. Dưới 30: phải cách ít nhất 2 quả.
  if (hi < 30 && diff < 2) {
    return {
      status: 'ERROR',
      message:
        'Điểm thắng phải cách điểm thua ít nhất 2 quả (chỉ chấp nhận cách 1 quả khi chạm từ 30 điểm trở lên).',
    };
  }

  return {
    status: 'VALID',
    score: { team1: n1, team2: n2 },
  };
}
