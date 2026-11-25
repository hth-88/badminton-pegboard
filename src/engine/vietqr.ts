export interface VietnamBankOption {
  code: string;
  bin: string;
  shortName: string;
  aliases: string[];
}

export const VIETNAM_BANKS: VietnamBankOption[] = [
  { code: 'VCB', bin: '970436', shortName: 'Vietcombank', aliases: ['vcb', 'vietcombank', 'ngoai thuong'] },
  { code: 'MB', bin: '970422', shortName: 'MB Bank', aliases: ['mb', 'mbbank', 'mb bank', 'quan doi'] },
  { code: 'TCB', bin: '970407', shortName: 'Techcombank', aliases: ['tcb', 'techcombank', 'ky thuong'] },
  { code: 'BIDV', bin: '970418', shortName: 'BIDV', aliases: ['bidv', 'dau tu va phat trien'] },
  { code: 'ICB', bin: '970415', shortName: 'VietinBank', aliases: ['icb', 'vietinbank', 'vietin', 'cong thuong'] },
  { code: 'ACB', bin: '970416', shortName: 'ACB', aliases: ['acb', 'a chau'] },
  { code: 'VPB', bin: '970432', shortName: 'VPBank', aliases: ['vpb', 'vpbank', 'vp bank', 'viet nam thinh vuong'] },
  { code: 'TPB', bin: '970423', shortName: 'TPBank', aliases: ['tpb', 'tpbank', 'tien phong'] },
  { code: 'STB', bin: '970403', shortName: 'Sacombank', aliases: ['stb', 'sacombank', 'sai gon thuong tin'] },
  { code: 'VBA', bin: '970405', shortName: 'Agribank', aliases: ['vba', 'agribank', 'nong nghiep'] },
  { code: 'HDB', bin: '970437', shortName: 'HDBank', aliases: ['hdb', 'hdbank'] },
  { code: 'VIB', bin: '970441', shortName: 'VIB', aliases: ['vib', 'quoc te'] },
  { code: 'MSB', bin: '970426', shortName: 'MSB', aliases: ['msb', 'maritime', 'hang hai'] },
  { code: 'OCB', bin: '970448', shortName: 'OCB', aliases: ['ocb', 'phuong dong'] },
  { code: 'SHB', bin: '970443', shortName: 'SHB', aliases: ['shb', 'sai gon ha noi'] },
  { code: 'EIB', bin: '970431', shortName: 'Eximbank', aliases: ['eib', 'eximbank', 'xuat nhap khau'] },
  { code: 'LPB', bin: '970449', shortName: 'LPBank', aliases: ['lpb', 'lpbank', 'lien viet', 'lienvietpostbank'] },
  { code: 'SEAB', bin: '970440', shortName: 'SeABank', aliases: ['seab', 'seabank', 'dong nam a'] },
  { code: 'CAKE', bin: '546034', shortName: 'Cake by VPBank', aliases: ['cake', 'cake by vpbank'] },
  { code: 'TIMO', bin: '963388', shortName: 'Timo', aliases: ['timo', 'timo plus'] },
];

export function stripVietnameseDiacritics(input: string): string {
  return String(input || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function sanitizeTransferNote(input: string, maxLength = 50): string {
  const cleaned = stripVietnameseDiacritics(input)
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLength > 0 && cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength).trim();
  }
  return cleaned;
}

export function sanitizeAccountNumber(account: string): string {
  return String(account || '').replace(/[^a-zA-Z0-9]/g, '');
}

export function resolveBankOption(
  bankCode?: string,
  bankName?: string
): VietnamBankOption | null {
  const normCode = String(bankCode || '').trim().toLowerCase();
  if (normCode) {
    const byCode = VIETNAM_BANKS.find(
      (b) => b.code.toLowerCase() === normCode || b.bin.toLowerCase() === normCode
    );
    if (byCode) return byCode;
  }

  const normName = stripVietnameseDiacritics(bankName || '')
    .toLowerCase()
    .trim();
  if (!normName) return null;

  const exact = VIETNAM_BANKS.find(
    (b) =>
      b.code.toLowerCase() === normName ||
      b.bin.toLowerCase() === normName ||
      stripVietnameseDiacritics(b.shortName).toLowerCase() === normName ||
      b.aliases.includes(normName)
  );
  if (exact) return exact;

  return (
    VIETNAM_BANKS.find((b) =>
      b.aliases.some((alias) => normName.includes(alias))
    ) || null
  );
}

export function buildPlayerTransferNote(
  baseNote: string | undefined,
  playerName: string
): string {
  const prefix = baseNote?.trim() || 'Tien cau long';
  const upperName = sanitizeTransferNote(playerName, 50).toUpperCase();
  const cleanPrefix = sanitizeTransferNote(prefix, 50);
  if (!upperName) return cleanPrefix;
  if (!cleanPrefix) return upperName;
  return sanitizeTransferNote(`${upperName} ${cleanPrefix}`, 50);
}

export function buildVietQrUrl(params: {
  bankCode?: string;
  bankName?: string;
  bankAccount?: string;
  bankAccountHolder?: string;
  amount: number;
  addInfo?: string;
  template?: 'compact2' | 'compact' | 'qr_only';
}): string | null {
  const bank = resolveBankOption(params.bankCode, params.bankName);
  if (!bank) return null;

  const cleanAccount = sanitizeAccountNumber(params.bankAccount || '');
  if (!cleanAccount) return null;

  const cleanAmount = Math.round(params.amount);
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) return null;

  const template = params.template || 'compact2';
  const query = new URLSearchParams();
  query.set('amount', String(cleanAmount));

  const cleanAddInfo = params.addInfo ? sanitizeTransferNote(params.addInfo, 50) : '';
  if (cleanAddInfo) {
    query.set('addInfo', cleanAddInfo);
  }

  const cleanAccountName = params.bankAccountHolder
    ? sanitizeTransferNote(params.bankAccountHolder, 50).toUpperCase()
    : '';
  if (cleanAccountName) {
    query.set('accountName', cleanAccountName);
  }

  return `https://img.vietqr.io/image/${bank.code}-${cleanAccount}-${template}.png?${query.toString()}`;
}

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) theo chuẩn EMVCo / VietQR
 */
export function computeEmvCrc16(payloadWithoutCrcValue: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payloadWithoutCrcValue.length; i++) {
    crc ^= payloadWithoutCrcValue.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Sinh chuỗi QR chuẩn EMVCo / NAPAS 247 (VietQR) để vẽ trực tiếp bằng Canvas offline.
 */
export function buildVietQrPayload(params: {
  bankCode?: string;
  bankName?: string;
  bankAccount?: string;
  amount: number;
  addInfo?: string;
}): string | null {
  const bank = resolveBankOption(params.bankCode, params.bankName);
  if (!bank) return null;

  const cleanAccount = sanitizeAccountNumber(params.bankAccount || '');
  if (!cleanAccount) return null;

  const cleanAmount = Math.round(params.amount);
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) return null;

  const beneficiaryInfo = tlv('00', bank.bin) + tlv('01', cleanAccount);
  const merchantAccountInfo =
    tlv('00', 'A000000727') +
    tlv('01', beneficiaryInfo) +
    tlv('02', 'QRIBFTTA');

  const cleanAddInfo = params.addInfo ? sanitizeTransferNote(params.addInfo, 50) : '';
  const additionalData = cleanAddInfo ? tlv('08', cleanAddInfo) : '';

  const base =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchantAccountInfo) +
    tlv('53', '704') +
    tlv('54', String(cleanAmount)) +
    tlv('58', 'VN') +
    (additionalData ? tlv('62', additionalData) : '') +
    '6304';

  return `${base}${computeEmvCrc16(base)}`;
}
