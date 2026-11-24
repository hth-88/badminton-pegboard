import { describe, expect, it } from 'vitest';
import {
  VIETNAM_BANKS,
  buildPlayerTransferNote,
  buildVietQrUrl,
  resolveBankOption,
  sanitizeAccountNumber,
  sanitizeTransferNote,
  stripVietnameseDiacritics,
} from '../vietqr';

describe('VietQR Engine (Nhóm 4)', () => {
  it('chứa ít nhất 20 ngân hàng Việt Nam phổ biến với BIN và code chuẩn', () => {
    expect(VIETNAM_BANKS.length).toBeGreaterThanOrEqual(20);
    expect(VIETNAM_BANKS.some((b) => b.code === 'VCB' && b.bin === '970436')).toBe(true);
    expect(VIETNAM_BANKS.some((b) => b.code === 'MB' && b.bin === '970422')).toBe(true);
  });

  it('bỏ dấu tiếng Việt chính xác gồm cả chữ đ/Đ', () => {
    expect(stripVietnameseDiacritics('Đức Anh')).toBe('Duc Anh');
    expect(stripVietnameseDiacritics('Phương Thảo')).toBe('Phuong Thao');
    expect(stripVietnameseDiacritics('Nguyễn Văn Đạt')).toBe('Nguyen Van Dat');
  });

  it('làm sạch nội dung chuyển khoản và cắt tối đa 50 ký tự', () => {
    const cleaned = sanitizeTransferNote('Tiền cầu lông @@@ Đức Anh!!!');
    expect(cleaned).toBe('Tien cau long Duc Anh');

    const longText = sanitizeTransferNote(
      'Tien cau long thu bay san A voi rat nhieu nguoi tham gia hom nay'
    );
    expect(longText.length).toBeLessThanOrEqual(50);
  });

  it('làm sạch số tài khoản chỉ giữ ký tự chữ và số', () => {
    expect(sanitizeAccountNumber('0123-456 789')).toBe('0123456789');
  });

  it('resolveBankOption tìm đúng theo bankCode, BIN và suy luận từ bankName cũ', () => {
    expect(resolveBankOption('TCB')?.shortName).toBe('Techcombank');
    expect(resolveBankOption('970436')?.code).toBe('VCB');
    expect(resolveBankOption('', 'MB Bank')?.code).toBe('MB');
    expect(resolveBankOption('', 'vietcombank')?.code).toBe('VCB');
    expect(resolveBankOption('', 'Ngân hàng Vietinbank')?.code).toBe('ICB');
    expect(resolveBankOption('', 'Ngân hàng lạ chưa có')?.code).toBeUndefined();
  });

  it('buildPlayerTransferNote tự ghép nội dung mặc định + tên người chơi không dấu', () => {
    expect(buildPlayerTransferNote(undefined, 'Đức Anh')).toBe('Tien cau long Duc Anh');
    expect(buildPlayerTransferNote('Cầu thứ 5', 'Phương Thảo')).toBe('Cau thu 5 Phuong Thao');
  });

  it('buildVietQrUrl sinh URL động đúng chuẩn img.vietqr.io với đầy đủ tham số', () => {
    const url = buildVietQrUrl({
      bankCode: 'VCB',
      bankAccount: '0123 456 789',
      bankAccountHolder: 'Nguyễn Văn Đạt',
      amount: 125000,
      addInfo: 'Tien cau long Duc Anh',
    });

    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin).toBe('https://img.vietqr.io');
    expect(parsed.pathname).toBe('/image/VCB-0123456789-compact2.png');
    expect(parsed.searchParams.get('amount')).toBe('125000');
    expect(parsed.searchParams.get('addInfo')).toBe('Tien cau long Duc Anh');
    expect(parsed.searchParams.get('accountName')).toBe('NGUYEN VAN DAT');
  });

  it('buildVietQrUrl trả null khi thiếu STK, ngân hàng không hợp lệ hoặc amount <= 0', () => {
    expect(
      buildVietQrUrl({ bankCode: 'VCB', bankAccount: '', amount: 50000 })
    ).toBeNull();
    expect(
      buildVietQrUrl({ bankName: 'Unknown Bank', bankAccount: '123456', amount: 50000 })
    ).toBeNull();
    expect(
      buildVietQrUrl({ bankCode: 'MB', bankAccount: '123456', amount: 0 })
    ).toBeNull();
    expect(
      buildVietQrUrl({ bankCode: 'MB', bankAccount: '123456', amount: -20000 })
    ).toBeNull();
  });
});
