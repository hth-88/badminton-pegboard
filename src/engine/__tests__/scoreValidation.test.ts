import { describe, expect, it } from 'vitest';
import { validateBadmintonScore } from '../scoreValidation';

describe('validateBadmintonScore (Đợt 5 Stage 2)', () => {
  it('cho phép để trống cả 2 ô điểm', () => {
    expect(validateBadmintonScore('', '').status).toBe('EMPTY');
  });

  it('chặn khi chỉ nhập 1 bên hoặc điểm âm', () => {
    expect(validateBadmintonScore('21', '').status).toBe('ERROR');
    expect(validateBadmintonScore('', '18').status).toBe('ERROR');
    expect(validateBadmintonScore('-1', '21').status).toBe('ERROR');
    expect(validateBadmintonScore('21', '-5').status).toBe('ERROR');
  });

  it('chặn tỉ số hòa (21-21, 15-15, 30-30)', () => {
    expect(validateBadmintonScore('21', '21').status).toBe('ERROR');
    expect(validateBadmintonScore('15', '15').status).toBe('ERROR');
    expect(validateBadmintonScore('30', '30').status).toBe('ERROR');
  });

  it('chặn khi điểm thắng < 30 mà chỉ cách 1 quả (21-20, 15-14)', () => {
    expect(validateBadmintonScore('21', '20').status).toBe('ERROR');
    expect(validateBadmintonScore('15', '14').status).toBe('ERROR');
  });

  it('hợp lệ khi không âm và cách ít nhất 2 quả (21-17, 15-12, 31-5)', () => {
    expect(validateBadmintonScore('21', '17')).toEqual({
      status: 'VALID',
      score: { team1: 21, team2: 17 },
    });
    expect(validateBadmintonScore('15', '12').status).toBe('VALID');
    expect(validateBadmintonScore('31', '5')).toEqual({
      status: 'VALID',
      score: { team1: 31, team2: 5 },
    });
  });

  it('chấp nhận cách 1 quả khi chạm từ 30 điểm trở lên (30-29, 31-30)', () => {
    expect(validateBadmintonScore('30', '29').status).toBe('VALID');
    expect(validateBadmintonScore('31', '30').status).toBe('VALID');
  });
});
