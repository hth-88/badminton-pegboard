import type {
  BetPayoutMode,
  BetUnit,
  MatchBet,
  MatchHistory,
  Player,
} from '../types/badminton';
import { ceilToNearest1000, formatVND } from './settlement';

export interface BetMatchEntry {
  matchId: string;
  matchIndex: number;
  courtId: string;
  bet: MatchBet;
  team1Ids: string[];
  team2Ids: string[];
  team1Names: string[];
  team2Names: string[];
  winner: 1 | 2 | null;
  score?: { team1: number; team2: number };
}

export interface ItemBetObligation {
  id: string;
  matchId: string;
  matchIndex: number;
  label: string;
  quantity: number;
  unit: BetUnit;
  payoutMode: BetPayoutMode;
  loserIds: string[];
  loserNames: string[];
  winnerIds: string[];
  winnerNames: string[];
  description: string;
}

export interface MonetaryTransfer {
  id: string;
  fromPlayerId: string;
  fromName: string;
  toPlayerId: string;
  toName: string;
  amount: number;
}

export interface FundBetContribution {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
}

export interface BetLedgerResult {
  hasBets: boolean;
  matches: BetMatchEntry[];
  unresolvedMatches: BetMatchEntry[];
  teamToTeamNetByPlayer: Record<string, number>;
  fundOwedByPlayer: Record<string, number>;
  settlementAdjustmentByPlayer: Record<string, number>;
  transfers: MonetaryTransfer[];
  fundContributions: FundBetContribution[];
  totalFundVnd: number;
  itemObligations: ItemBetObligation[];
  itemSummaryByLoser: Record<string, string[]>;
}

/**
 * Tối giản số lượt chuyển khoản bằng thuật toán tham lam hai con trỏ (tất định).
 */
export function simplifyMonetaryTransfers(
  netBalances: Record<string, number>,
  nameMap: Map<string, string>
): MonetaryTransfer[] {
  const debtors: Array<{ id: string; remaining: number }> = [];
  const creditors: Array<{ id: string; remaining: number }> = [];

  for (const [id, rawVal] of Object.entries(netBalances)) {
    const rounded = Math.round(rawVal);
    if (rounded < -1) {
      debtors.push({ id, remaining: -rounded });
    } else if (rounded > 1) {
      creditors.push({ id, remaining: rounded });
    }
  }

  debtors.sort((a, b) =>
    b.remaining !== a.remaining ? b.remaining - a.remaining : a.id.localeCompare(b.id)
  );
  creditors.sort((a, b) =>
    b.remaining !== a.remaining ? b.remaining - a.remaining : a.id.localeCompare(b.id)
  );

  const transfers: MonetaryTransfer[] = [];
  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const d = debtors[di];
    const c = creditors[ci];
    const amount = Math.min(d.remaining, c.remaining);

    if (amount > 0) {
      transfers.push({
        id: `transfer_${d.id}_${c.id}`,
        fromPlayerId: d.id,
        fromName: nameMap.get(d.id) || d.id,
        toPlayerId: c.id,
        toName: nameMap.get(c.id) || c.id,
        amount,
      });
    }

    d.remaining -= amount;
    c.remaining -= amount;
    if (d.remaining <= 1) di++;
    if (c.remaining <= 1) ci++;
  }

  return transfers;
}

/**
 * Tính toán toàn bộ Sổ Nợ Độ cuối buổi (thuần 100%).
 */
export function calculateBetLedger(
  players: Player[],
  history: MatchHistory[]
): BetLedgerResult {
  const nameMap = new Map<string, string>(players.map((p) => [p.id, p.name]));

  const matches: BetMatchEntry[] = [];
  const unresolvedMatches: BetMatchEntry[] = [];
  const teamToTeamNetByPlayer: Record<string, number> = {};
  const fundOwedByPlayer: Record<string, number> = {};
  const itemObligations: ItemBetObligation[] = [];
  const itemCountByLoser: Record<string, Map<string, number>> = {};

  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    if (!h.bet) continue;

    const matchIndex = i + 1;
    const winner = h.betWinner === 1 || h.betWinner === 2 ? h.betWinner : null;
    const team1Names = h.team1.map((id) => nameMap.get(id) || id);
    const team2Names = h.team2.map((id) => nameMap.get(id) || id);

    const entry: BetMatchEntry = {
      matchId: h.id,
      matchIndex,
      courtId: h.courtId,
      bet: h.bet,
      team1Ids: [...h.team1],
      team2Ids: [...h.team2],
      team1Names,
      team2Names,
      winner,
      score: h.score,
    };
    matches.push(entry);

    if (winner === null) {
      unresolvedMatches.push(entry);
      continue;
    }

    const winnerIds = winner === 1 ? h.team1 : h.team2;
    const loserIds = winner === 1 ? h.team2 : h.team1;
    if (winnerIds.length === 0 || loserIds.length === 0) continue;

    if (h.bet.amountVnd > 0) {
      const totalStake =
        h.bet.unit === 'PER_PLAYER'
          ? h.bet.amountVnd * loserIds.length
          : h.bet.amountVnd;
      const perLoser = totalStake / loserIds.length;

      if (h.bet.payoutMode === 'TEAM_TO_TEAM') {
        const perWinner = totalStake / winnerIds.length;
        for (const lid of loserIds) {
          teamToTeamNetByPlayer[lid] = (teamToTeamNetByPlayer[lid] || 0) - perLoser;
        }
        for (const wid of winnerIds) {
          teamToTeamNetByPlayer[wid] = (teamToTeamNetByPlayer[wid] || 0) + perWinner;
        }
      } else {
        for (const lid of loserIds) {
          fundOwedByPlayer[lid] = (fundOwedByPlayer[lid] || 0) + perLoser;
        }
      }
    } else {
      const loserNames = loserIds.map((id) => nameMap.get(id) || id);
      const winnerNames = winnerIds.map((id) => nameMap.get(id) || id);
      const unitLabel = h.bet.unit === 'PER_PLAYER' ? 'người' : 'đội';
      const targetText =
        h.bet.payoutMode === 'LOSER_TO_FUND'
          ? `góp Quỹ chung`
          : `trả ${winnerNames.join(' & ')}`;

      itemObligations.push({
        id: `item_${h.id}`,
        matchId: h.id,
        matchIndex,
        label: h.bet.label,
        quantity: h.bet.quantity,
        unit: h.bet.unit,
        payoutMode: h.bet.payoutMode,
        loserIds: [...loserIds],
        loserNames,
        winnerIds: [...winnerIds],
        winnerNames,
        description: `${loserNames.join(' & ')} ${targetText}: ${h.bet.label} (${h.bet.unit === 'PER_PLAYER' ? 'mỗi người' : 'cả đội'} • ${unitLabel})`,
      });

      const perLoserCount =
        h.bet.unit === 'PER_PLAYER'
          ? h.bet.quantity
          : Number((h.bet.quantity / loserIds.length).toFixed(2));
      const itemKey = `${h.bet.label}${h.bet.payoutMode === 'LOSER_TO_FUND' ? ' (Quỹ)' : ''}`;
      for (const lid of loserIds) {
        if (!itemCountByLoser[lid]) {
          itemCountByLoser[lid] = new Map<string, number>();
        }
        itemCountByLoser[lid].set(
          itemKey,
          (itemCountByLoser[lid].get(itemKey) || 0) + perLoserCount
        );
      }
    }
  }

  const allPlayerIds = new Set<string>([
    ...players.map((p) => p.id),
    ...Object.keys(teamToTeamNetByPlayer),
    ...Object.keys(fundOwedByPlayer),
  ]);

  const settlementAdjustmentByPlayer: Record<string, number> = {};
  for (const pid of allPlayerIds) {
    const adj = Math.round(
      (fundOwedByPlayer[pid] || 0) - (teamToTeamNetByPlayer[pid] || 0)
    );
    if (adj !== 0) {
      settlementAdjustmentByPlayer[pid] = adj;
    }
  }

  const transfers = simplifyMonetaryTransfers(teamToTeamNetByPlayer, nameMap);

  const fundContributions: FundBetContribution[] = Object.entries(fundOwedByPlayer)
    .map(([pid, amt]) => ({
      id: `fund_${pid}`,
      playerId: pid,
      playerName: nameMap.get(pid) || pid,
      amount: Math.round(amt),
    }))
    .filter((f) => f.amount > 0)
    .sort((a, b) =>
      b.amount !== a.amount
        ? b.amount - a.amount
        : a.playerName.localeCompare(b.playerName)
    );

  const totalFundVnd = fundContributions.reduce((s, f) => s + f.amount, 0);

  const itemSummaryByLoser: Record<string, string[]> = {};
  for (const [lid, map] of Object.entries(itemCountByLoser)) {
    itemSummaryByLoser[lid] = Array.from(map.entries()).map(
      ([label, qty]) => `${qty}× ${label}`
    );
  }

  return {
    hasBets: matches.length > 0,
    matches,
    unresolvedMatches,
    teamToTeamNetByPlayer,
    fundOwedByPlayer,
    settlementAdjustmentByPlayer,
    transfers,
    fundContributions,
    totalFundVnd,
    itemObligations,
    itemSummaryByLoser,
  };
}

/**
 * Số tiền cuối cùng từng người khi có tùy chọn gộp tiền độ vào tổng chuyển khoản.
 * Số âm biểu thị người chơi thắng độ nhiều hơn tiền sân -> Chủ sân cần hoàn lại.
 */
export function getEffectivePlayerPayable(
  courtRoundedAmount: number,
  betAdjustmentVnd: number,
  mergeBetsIntoSettlement: boolean
): number {
  if (!mergeBetsIntoSettlement || betAdjustmentVnd === 0) {
    return courtRoundedAmount;
  }
  const raw = courtRoundedAmount + betAdjustmentVnd;
  if (raw > 0) {
    return ceilToNearest1000(raw);
  }
  if (raw < 0) {
    return -Math.round(Math.abs(raw));
  }
  return 0;
}

/**
 * Sinh đoạn tin nhắn Zalo tổng hợp kèo đánh độ (cả tiền & hiện vật).
 */
export function buildBetLedgerZaloSection(
  ledger: BetLedgerResult,
  mergeBetsIntoSettlement: boolean
): string {
  if (!ledger.hasBets) return '';

  const lines: string[] = [];
  lines.push('----------------------------------------');
  lines.push('🔥 TỔNG KẾT KÈO ĐỘ:');

  if (mergeBetsIntoSettlement) {
    lines.push('• (Tiền độ đã được gộp tự động vào tổng số tiền đóng ở trên)');
  } else {
    if (ledger.transfers.length > 0) {
      lines.push('• Chuyển khoản độ (đã cấn trừ chéo):');
      for (const t of ledger.transfers) {
        lines.push(`  - ${t.fromName} → ${t.toName}: ${formatVND(t.amount)}`);
      }
    }
    if (ledger.fundContributions.length > 0) {
      lines.push(`• Góp Quỹ chung (Tổng ${formatVND(ledger.totalFundVnd)}):`);
      for (const f of ledger.fundContributions) {
        lines.push(`  - ${f.playerName}: +${formatVND(f.amount)}`);
      }
    }
  }

  if (ledger.itemObligations.length > 0) {
    lines.push('• Kèo nước / cầu / hiện vật:');
    for (const item of ledger.itemObligations) {
      lines.push(`  - Trận #${item.matchIndex}: ${item.description}`);
    }
  }

  if (ledger.unresolvedMatches.length > 0) {
    lines.push(
      `• ⚠️ Còn ${ledger.unresolvedMatches.length} trận đánh độ chưa chốt đội thắng.`
    );
  }

  return lines.join('\n');
}
