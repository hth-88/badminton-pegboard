import { describe, expect, it } from 'vitest';
import { validateBadmintonScore } from '../scoreValidation';

describe('validateBadmintonScore (Stage 6)', () => {
  it('cho phép để trống cả 2 ô điểm', () => {
    expect(validateBadmintonScore('', '').status).toBe('EMPTY');
  });

  it('chặn khi chỉ nhập 1 bên hoặc điểm < 0 hoặc > 30', () => {
    expect(validateBadmintonScore('21', '').status).toBe('ERROR');
    expect(validateBadmintonScore('', '18').status).toBe('ERROR');
    expect(validateBadmintonScore('-1', '21').status).toBe('ERROR');
    expect(validateBadmintonScore('31', '29').status).toBe('ERROR');
  });

  it('chặn tỉ số hòa (21-21, 15-15)', () => {
    expect(validateBadmintonScore('21', '21').status).toBe('ERROR');
    expect(validateBadmintonScore('15', '15').status).toBe('ERROR');
  });

  it('hợp lệ chuẩn BWF 21 điểm (21-17, 23-21, 30-29)', () => {
    expect(validateBadmintonScore('21', '17')).toEqual({
      status: 'VALID',
      score: { team1: 21, team2: 17 },
    });
    expect(validateBadmintonScore('23', '21').status).toBe('VALID');
    expect(validateBadmintonScore('30', '29').status).toBe('VALID');
  });

  it('cảnh báo nhẹ (vẫn cho lưu) với set ngắn hoặc thắng 21-20', () => {
    const shortSet = validateBadmintonScore('15', '12');
    expect(shortSet.status).toBe('WARNING');
    expect(shortSet.score).toEqual({ team1: 15, team2: 12 });

    expect(validateBadmintonScore('21', '20').status).toBe('WARNING');
  });
});
