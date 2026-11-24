import {
  computeMultiSessionFinanceSummary,
  type ArchivedSessionSummary,
} from '../engine/storage';

export const UTF8_BOM = '\uFEFF';

export function escapeCsvCell(
  value: string | number | boolean | null | undefined
): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Chống CSV formula injection cho Excel/Sheets, nhưng giữ nguyên số âm hợp lệ
  const isNegativeNumber = /^-\d+(\.\d+)?$/.test(str.trim());
  if (!isNegativeNumber && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvLine(cells: Array<string | number | boolean | null | undefined>): string {
  return cells.map((c) => escapeCsvCell(c)).join(',');
}

export function buildSessionStatementCsv(params: {
  dateStr: string;
  courtCost: number;
  shuttleCost: number;
  extraCost: number;
  extraCostNote?: string;
  totalCost: number;
  totalCollected: number;
  surplus: number;
  betFundTotal?: number;
  players: Array<{
    name: string;
    sex: 'M' | 'F';
    gamesPlayed: number;
    courtAmount: number;
    betAdjustmentVnd?: number;
    finalAmount: number;
    statusLabel: string;
    note?: string;
  }>;
}): string {
  const rows: string[] = [];

  rows.push(toCsvLine(['SAO KÊ BUỔI ĐÁNH CẦU LÔNG', params.dateStr]));
  rows.push(toCsvLine(['Tiền sân (VNĐ)', params.courtCost]));
  rows.push(toCsvLine(['Tiền cầu (VNĐ)', params.shuttleCost]));
  rows.push(
    toCsvLine([
      `Phụ phí (${params.extraCostNote || 'Khác'}) (VNĐ)`,
      params.extraCost,
    ])
  );
  rows.push(toCsvLine(['Tổng chi phí (VNĐ)', params.totalCost]));
  rows.push(toCsvLine(['Tổng thu sân dự kiến (VNĐ)', params.totalCollected]));
  rows.push(toCsvLine(['Dư làm tròn vào quỹ (VNĐ)', params.surplus]));
  if (params.betFundTotal && params.betFundTotal > 0) {
    rows.push(toCsvLine(['Quỹ từ kèo đánh độ (VNĐ)', params.betFundTotal]));
  }
  rows.push('');

  rows.push(
    toCsvLine([
      'STT',
      'Họ tên',
      'Giới tính',
      'Số trận',
      'Tiền sân cầu',
      'Tiền độ (+/-)',
      'Tổng cần đóng',
      'Trạng thái',
      'Ghi chú',
    ])
  );

  params.players.forEach((p, idx) => {
    rows.push(
      toCsvLine([
        idx + 1,
        p.name,
        p.sex === 'M' ? 'Nam' : 'Nữ',
        p.gamesPlayed,
        p.courtAmount,
        p.betAdjustmentVnd ?? 0,
        p.finalAmount,
        p.statusLabel,
        p.note || '',
      ])
    );
  });

  return UTF8_BOM + rows.join('\r\n');
}

export function buildMultiSessionStatementCsv(
  archives: ArchivedSessionSummary[]
): string {
  const rows: string[] = [];
  const summary = computeMultiSessionFinanceSummary(archives);

  rows.push(toCsvLine(['SAO KÊ TÀI CHÍNH NHIỀU BUỔI CLB']));
  rows.push(toCsvLine(['Số buổi có dữ liệu tài chính', summary.sessionsWithFinance]));
  rows.push(toCsvLine(['Tổng chi phí tích lũy (VNĐ)', summary.totalCostAll]));
  rows.push(toCsvLine(['Quỹ dư + Quỹ độ tích lũy (VNĐ)', summary.cumulativeSurplus]));
  rows.push(toCsvLine(['Tổng tiền chưa thu các buổi trước (VNĐ)', summary.totalUnpaidAmount]));
  rows.push('');

  rows.push(
    toCsvLine([
      'Ngày',
      'Số người',
      'Số trận',
      'Tiền sân',
      'Tiền cầu',
      'Phụ phí',
      'Tổng chi phí',
      'Đã thu dự kiến',
      'Dư chẵn quỹ',
      'Quỹ độ',
      'Số người chưa đóng',
      'Tổng tiền chưa đóng',
    ])
  );

  for (const session of archives) {
    const snap = session.settlementSnapshot;
    const dateLabel = new Date(session.createdAt).toLocaleDateString('vi-VN');
    if (!snap) {
      rows.push(
        toCsvLine([
          dateLabel,
          session.totalPlayers,
          session.totalGames,
          '',
          '',
          '',
          session.totalCost || 0,
          '',
          '',
          '',
          '',
          '',
        ])
      );
      continue;
    }

    const unpaidPlayers = (snap.players || []).filter(
      (p) => p.finalAmount > 0 && !p.paid
    );
    const unpaidTotal = unpaidPlayers.reduce((s, p) => s + p.finalAmount, 0);

    rows.push(
      toCsvLine([
        dateLabel,
        session.totalPlayers,
        session.totalGames,
        snap.courtCost,
        snap.shuttleCost,
        snap.extraCost,
        snap.totalCost,
        snap.totalCollected,
        snap.surplus,
        snap.betFundTotal || 0,
        unpaidPlayers.length,
        unpaidTotal,
      ])
    );
  }

  if (summary.unpaidDebts.length > 0) {
    rows.push('');
    rows.push(toCsvLine(['DANH SÁCH NỢ CŨ CHƯA ĐÓNG']));
    rows.push(toCsvLine(['Ngày', 'Họ tên', 'Số tiền còn thiếu (VNĐ)']));
    for (const d of summary.unpaidDebts) {
      rows.push(
        toCsvLine([
          new Date(d.createdAt).toLocaleDateString('vi-VN'),
          d.playerName,
          d.amount,
        ])
      );
    }
  }

  return UTF8_BOM + rows.join('\r\n');
}
