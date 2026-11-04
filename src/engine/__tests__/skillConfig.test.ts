import { describe, expect, it } from 'vitest';
import {
  compareRanks,
  getEffectiveSkill,
  ORDERED_RANKS,
  RANK_BASE_SCORES,
} from '../skillConfig';

describe('Skill Configuration & Effective Skill Calculation', () => {
  it('định nghĩa đúng 12 bậc trình độ theo thứ tự từ thấp lên cao', () => {
    expect(ORDERED_RANKS).toEqual([
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
    ]);
    expect(ORDERED_RANKS.length).toBe(12);
  });

  it('đảm bảo điểm Base cho 12 bậc trình độ chính xác theo tài liệu', () => {
    expect(RANK_BASE_SCORES['newbie']).toBe(1.0);
    expect(RANK_BASE_SCORES['y-']).toBe(2.0);
    expect(RANK_BASE_SCORES['y']).toBe(3.0);
    expect(RANK_BASE_SCORES['y+']).toBe(4.0);
    expect(RANK_BASE_SCORES['tby-']).toBe(5.0);
    expect(RANK_BASE_SCORES['tby']).toBe(6.0);
    expect(RANK_BASE_SCORES['tby+']).toBe(7.0);
    expect(RANK_BASE_SCORES['tb-']).toBe(8.5);
    expect(RANK_BASE_SCORES['tb']).toBe(10.0);
    expect(RANK_BASE_SCORES['tb+']).toBe(11.5);
    expect(RANK_BASE_SCORES['tb++']).toBe(13.0);
    expect(RANK_BASE_SCORES['tbk']).toBe(14.5);
  });

  it('bù trừ giới tính chuẩn: Nam tb- (8.5 + 1.5 = 10.0) ngang Nữ tb (10.0)', () => {
    const maleTbMinus = getEffectiveSkill('tb-', 'M', 1.5);
    const femaleTb = getEffectiveSkill('tb', 'F', 1.5);

    expect(maleTbMinus).toBe(10.0);
    expect(femaleTb).toBe(10.0);
    expect(maleTbMinus).toBe(femaleTb);
  });

  it('bù trừ giới tính chuẩn: Nam tby+ (7.0 + 1.5 = 8.5) ngang Nữ tb- (8.5)', () => {
    const maleTbyPlus = getEffectiveSkill('tby+', 'M', 1.5);
    const femaleTbMinus = getEffectiveSkill('tb-', 'F', 1.5);

    expect(maleTbyPlus).toBe(8.5);
    expect(femaleTbMinus).toBe(8.5);
    expect(maleTbyPlus).toBe(femaleTbMinus);
  });

  it('cho phép tùy biến maleBonus trong Session Settings', () => {
    const customBonus = 2.0;
    const maleSkill = getEffectiveSkill('y', 'M', customBonus);
    expect(maleSkill).toBe(3.0 + customBonus);

    const zeroBonus = 0;
    const maleZero = getEffectiveSkill('tb', 'M', zeroBonus);
    const femaleZero = getEffectiveSkill('tb', 'F', zeroBonus);
    expect(maleZero).toBe(femaleZero);
  });

  it('so sánh thứ tự bậc trình độ chính xác', () => {
    expect(compareRanks('newbie', 'y-')).toBeLessThan(0);
    expect(compareRanks('tb+', 'tb-')).toBeGreaterThan(0);
    expect(compareRanks('tb', 'tb')).toBe(0);
  });
});
