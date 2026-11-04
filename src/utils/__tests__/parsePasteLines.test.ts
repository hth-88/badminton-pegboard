import { describe, expect, it } from 'vitest';
import { parsePasteLines } from '../parsePasteLines';

describe('parsePasteLines (Quick Paste parser)', () => {
  it('phân tích chính xác "Lan - Nữ - tb-" -> tb-', () => {
    const res = parsePasteLines('Lan - Nữ - tb-');
    expect(res.errors).toHaveLength(0);
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0].name).toBe('Lan');
    expect(res.valid[0].sex).toBe('F');
    expect(res.valid[0].rank).toBe('tb-');
  });

  it('phân tích chính xác "Hùng - Nam - y-" -> y-', () => {
    const res = parsePasteLines('Hùng - Nam - y-');
    expect(res.errors).toHaveLength(0);
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0].name).toBe('Hùng');
    expect(res.valid[0].sex).toBe('M');
    expect(res.valid[0].rank).toBe('y-');
  });

  it('phân tích chính xác "Anh-Tuấn, Nam, tby+" -> tên Anh-Tuấn, rank tby+', () => {
    const res = parsePasteLines('Anh-Tuấn, Nam, tby+');
    expect(res.errors).toHaveLength(0);
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0].name).toBe('Anh-Tuấn');
    expect(res.valid[0].sex).toBe('M');
    expect(res.valid[0].rank).toBe('tby+');
  });

  it('phân tích chính xác "Mai/Nữ/tb++" ok', () => {
    const res = parsePasteLines('Mai/Nữ/tb++');
    expect(res.errors).toHaveLength(0);
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0].name).toBe('Mai');
    expect(res.valid[0].sex).toBe('F');
    expect(res.valid[0].rank).toBe('tb++');
  });

  it('báo lỗi khi dòng thiếu rank', () => {
    const res = parsePasteLines('Lan - Nữ');
    expect(res.valid).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].lineIndex).toBe(1);
    expect(res.errors[0].error).toMatch(/thiếu trình độ/i);
  });

  it('báo lỗi khi dòng rank sai', () => {
    const res = parsePasteLines('Tuấn - Nam - pro');
    expect(res.valid).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].error).toMatch(/không hợp lệ/i);
  });

  it('báo lỗi khi dòng thiếu giới tính', () => {
    const res = parsePasteLines('Lan - tb');
    expect(res.valid).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].error).toMatch(/thiếu giới tính/i);
  });

  it('cảnh báo (không chặn) khi tên trùng trong danh sách hoặc trùng trong cùng lần dán', () => {
    const text = [
      'Lan - Nữ - tb-',
      'Lan - Nữ - tb',
      'Minh - Nam - tb',
    ].join('\n');

    // Lan đã tồn tại trong danh sách hiện tại
    const res = parsePasteLines(text, ['Minh']);

    // Cả 3 người vẫn vào valid (không bị chặn)
    expect(res.valid).toHaveLength(3);
    expect(res.errors).toHaveLength(0);

    // Cảnh báo:
    // - Lan dòng 2 trùng với Lan dòng 1
    // - Minh dòng 3 trùng với Minh trong existing
    expect(res.warnings.length).toBeGreaterThanOrEqual(2);
    expect(res.valid[1].warning).toBeDefined();
    expect(res.valid[2].warning).toBeDefined();
  });

  describe('Zalo / Messenger linh hoạt & allowDefaults', () => {
    it('bóc tách đúng khi có số thứ tự đầu dòng và dấu gạch đứng "|"', () => {
      const res = parsePasteLines('1. Hoàng | Nam | tb+');
      expect(res.errors).toHaveLength(0);
      expect(res.valid).toHaveLength(1);
      expect(res.valid[0].name).toBe('Hoàng');
      expect(res.valid[0].sex).toBe('M');
      expect(res.valid[0].rank).toBe('tb+');
    });

    it('bóc tách đúng khi giới tính trong ngoặc "(Nữ)"', () => {
      const res = parsePasteLines('2) Thu Thảo (Nữ) - tby');
      expect(res.errors).toHaveLength(0);
      expect(res.valid).toHaveLength(1);
      expect(res.valid[0].name).toBe('Thu Thảo');
      expect(res.valid[0].sex).toBe('F');
      expect(res.valid[0].rank).toBe('tby');
    });

    it('nhận diện từ đồng nghĩa Trai -> M, Gái -> F', () => {
      const text = ['• Tuấn - Trai - tbk', '- Ngọc - Gái - y+'].join('\n');
      const res = parsePasteLines(text);
      expect(res.errors).toHaveLength(0);
      expect(res.valid).toHaveLength(2);
      expect(res.valid[0].name).toBe('Tuấn');
      expect(res.valid[0].sex).toBe('M');
      expect(res.valid[0].rank).toBe('tbk');
      expect(res.valid[1].name).toBe('Ngọc');
      expect(res.valid[1].sex).toBe('F');
      expect(res.valid[1].rank).toBe('y+');
    });

    it('hỗ trợ allowDefaults: true tự điền Nam và tb- khi thiếu', () => {
      const text = [
        '1. Trần Văn Nam',
        '2. Lê Thị Hoa (Nữ)',
        '3. Nguyễn Văn An - Nam',
      ].join('\n');

      const res = parsePasteLines(text, [], { allowDefaults: true });
      expect(res.errors).toHaveLength(0);
      expect(res.valid).toHaveLength(3);

      expect(res.valid[0].name).toBe('Trần Văn Nam');
      expect(res.valid[0].sex).toBe('M');
      expect(res.valid[0].rank).toBe('tb-');

      expect(res.valid[1].name).toBe('Lê Thị Hoa');
      expect(res.valid[1].sex).toBe('F');
      expect(res.valid[1].rank).toBe('tb-');

      expect(res.valid[2].name).toBe('Nguyễn Văn An');
      expect(res.valid[2].sex).toBe('M');
      expect(res.valid[2].rank).toBe('tb-');
    });
  });
});

