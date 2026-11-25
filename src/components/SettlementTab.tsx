import React, { useMemo, useState } from 'react';
import {
  Calculator,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
  Coins,
  Percent,
  Banknote,
  Building,
  BarChart3,
  Archive,
  RotateCcw,
  Trash2,
  Calendar,
  QrCode,
  Image as ImageIcon,
  AlertCircle,
  Flame,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
} from 'lucide-react';
import type {
  BadmintonRank,
  BadmintonSessionState,
  MatchHistory,
  MatchmakingStats,
  Player,
} from '../types/badminton';
import {
  calculateSettlement,
  formatVND,
  generateZaloSettlementMessage,
  type CloudSettlementData,
  type SettlementSettings,
  type UnderPlayedDiscountType,
} from '../engine/settlement';
import {
  buildBetLedgerZaloSection,
  calculateBetLedger,
  getEffectivePlayerPayable,
} from '../engine/betLedger';
import {
  type ArchivedSessionSummary,
  type ArchivedSettlementSnapshot,
  archiveCurrentSession,
  clearAllArchivedSessions,
  computeMultiSessionFinanceSummary,
  deleteArchivedSession,
  getArchivedSessions,
  toggleArchivedPlayerPaid,
} from '../engine/storage';
import {
  buildMultiSessionStatementCsv,
  buildSessionStatementCsv,
} from '../utils/statementCsv';
import type { RoomRole } from '../hooks/useCloudRoom';
import { EquityTable } from './EquityTable';
import { RankAdvisorPanel } from './RankAdvisorPanel';
import { PaymentQrModal } from './PaymentQrModal';
import { VIETNAM_BANKS, resolveBankOption } from '../engine/vietqr';
import { deleteRoomReceipts } from '../services/supabaseSync';
import { vibrateSuccess, vibrateWarning } from '../utils/vibrate';
import { GenderDot, StatusPill, UiModal } from './ui/Primitives';

interface SettlementTabProps {
  players: Player[];
  history: MatchHistory[];
  stats: MatchmakingStats;
  currentState?: BadmintonSessionState;
  role: RoomRole;
  roomCode: string | null;
  settlementData: CloudSettlementData;
  onUpdateSettlementSettings: (updates: Partial<SettlementSettings>) => void;
  onToggleApprovePayment: (playerId: string) => void;
  onRejectPendingPayment: (playerId: string, reason?: string) => void;
  onReportPlayerPayment: (
    playerId: string,
    options?: { receiptUrl?: string; receiptPath?: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  onToggleBetPaid?: (obligationId: string) => void;
  onQuickEditMatchResult?: (match: MatchHistory) => void;
  maleBonus?: number;
  onEditRank?: (playerId: string, rank: BadmintonRank) => void;
  onExportJson: () => string;
  onImportJson: (json: string) => { ok: true } | { ok: false; error: string };
  onNewSessionKeepPlayers: (
    totalCost?: number,
    settlementSnapshot?: ArchivedSettlementSnapshot
  ) => void;
  onResetSession: () => void;
}

export const SettlementTab: React.FC<SettlementTabProps> = ({
  players,
  history,
  stats,
  currentState,
  role,
  roomCode,
  settlementData,
  onUpdateSettlementSettings,
  onToggleApprovePayment,
  onRejectPendingPayment,
  onReportPlayerPayment,
  onToggleBetPaid,
  onQuickEditMatchResult,
  maleBonus = 1.5,
  onEditRank,
  onExportJson,
  onImportJson,
  onNewSessionKeepPlayers,
  onResetSession,
}) => {
  const [subTab, setSubTab] = useState<'CALC' | 'EQUITY' | 'AI'>('CALC');
  const [hideZeroCostInZalo, setHideZeroCostInZalo] = useState(true);

  const { settings, payments } = settlementData;
  const isViewer = role === 'VIEWER';

  const [confirmReportPlayerId, setConfirmReportPlayerId] = useState<string | null>(null);
  const [reportingPlayerId, setReportingPlayerId] = useState<string | null>(null);
  const [copiedBankAccount, setCopiedBankAccount] = useState(false);

  const [qrModalTarget, setQrModalTarget] = useState<{
    playerId: string;
    playerName: string;
    amount: number;
  } | null>(null);
  const [reviewReceiptTarget, setReviewReceiptTarget] = useState<{
    playerId: string;
    playerName: string;
    amount: number;
    receiptUrl?: string;
    isPending: boolean;
  } | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [cleaningReceipts, setCleaningReceipts] = useState(false);
  const [expandedArchiveIds, setExpandedArchiveIds] = useState<Set<string>>(new Set());

  const [archivedSessions, setArchivedSessions] = useState<ArchivedSessionSummary[]>(() =>
    getArchivedSessions()
  );
  const [showClearArchiveConfirm, setShowClearArchiveConfirm] = useState(false);

  const [copiedZalo, setCopiedZalo] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [importText, setImportText] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');

  const updateSettings = (updates: Partial<SettlementSettings>) => {
    if (isViewer) return;
    onUpdateSettlementSettings(updates);
  };

  const handleReportPayment = async (
    playerId: string,
    options?: { receiptUrl?: string; receiptPath?: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    setReportingPlayerId(playerId);
    try {
      const res = await onReportPlayerPayment(playerId, options);
      if (res.ok) {
        vibrateSuccess();
        setConfirmReportPlayerId(null);
      } else {
        vibrateWarning();
      }
      return res;
    } finally {
      setReportingPlayerId(null);
    }
  };

  const handleCleanupRoomReceipts = async () => {
    if (!roomCode) return;
    if (!window.confirm(`Xóa toàn bộ ảnh biên lai cũ trong phòng ${roomCode}?`)) return;
    setCleaningReceipts(true);
    try {
      const res = await deleteRoomReceipts(roomCode);
      if (res.error) {
        vibrateWarning();
        alert(`Không thể dọn ảnh: ${res.error}`);
      } else {
        vibrateSuccess();
        alert(`Đã dọn sạch ${res.deletedCount} ảnh biên lai cũ.`);
      }
    } finally {
      setCleaningReceipts(false);
    }
  };

  const handleCopyBankAccount = async () => {
    if (!settings.bankAccount) return;
    vibrateSuccess();
    try {
      await navigator.clipboard.writeText(settings.bankAccount);
      setCopiedBankAccount(true);
      setTimeout(() => setCopiedBankAccount(false), 2000);
    } catch {
      alert('Không thể sao chép tự động.');
    }
  };

  const settlementResult = useMemo(() => {
    return calculateSettlement(players, settings, history, undefined, {
      hideZeroCostPlayers: hideZeroCostInZalo,
    });
  }, [players, settings, history, hideZeroCostInZalo]);

  const betLedger = useMemo(
    () => calculateBetLedger(players, history),
    [players, history]
  );
  const mergeBets = Boolean(settings.mergeBetsIntoSettlement && betLedger.hasBets);
  const betPayments = settlementData.betPayments || {};

  const buildCurrentSettlementSnapshot = (): ArchivedSettlementSnapshot => {
    const snapPlayers = settlementResult.players.map((item) => {
      const adj = betLedger.settlementAdjustmentByPlayer[item.playerId] || 0;
      const finalAmount = getEffectivePlayerPayable(
        item.roundedAmount,
        adj,
        mergeBets
      );
      const rec = payments[item.playerId];
      return {
        playerId: item.playerId,
        name: item.name,
        sex: item.sex,
        gamesPlayed: item.gamesPlayed,
        courtAmount: item.roundedAmount,
        ...(adj !== 0 ? { betAdjustmentVnd: adj } : {}),
        finalAmount,
        paid: rec?.status === 'PAID',
        ...(rec?.approvedAt ? { paidAt: rec.approvedAt } : {}),
      };
    });

    return {
      courtCost: settlementResult.courtCost,
      shuttleCost: settlementResult.shuttleCost,
      extraCost: settlementResult.extraCost,
      extraCostNote: settings.extraCostNote,
      totalCost: settlementResult.totalCost,
      totalCollected: settlementResult.totalCollected,
      surplus: settlementResult.surplus,
      betFundTotal: betLedger.totalFundVnd,
      mergeBetsIntoSettlement: mergeBets,
      players: snapPlayers,
    };
  };

  const downloadCsvFile = (filename: string, csvContent: string) => {
    vibrateSuccess();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCurrentSessionCsv = () => {
    const dateStr = new Date().toLocaleDateString('vi-VN');
    const csv = buildSessionStatementCsv({
      dateStr,
      courtCost: settlementResult.courtCost,
      shuttleCost: settlementResult.shuttleCost,
      extraCost: settlementResult.extraCost,
      extraCostNote: settings.extraCostNote,
      totalCost: settlementResult.totalCost,
      totalCollected: settlementResult.totalCollected,
      surplus: settlementResult.surplus,
      betFundTotal: betLedger.totalFundVnd,
      players: settlementResult.players.map((item) => {
        const adj = betLedger.settlementAdjustmentByPlayer[item.playerId] || 0;
        const eff = getEffectivePlayerPayable(item.roundedAmount, adj, mergeBets);
        const st = payments[item.playerId]?.status;
        const statusLabel =
          eff < 0
            ? 'Được nhận lại'
            : eff === 0
              ? 'Miễn phí'
              : st === 'PAID'
                ? 'Đã đóng'
                : st === 'PENDING_REVIEW'
                  ? 'Chờ duyệt'
                  : 'Chưa đóng';
        return {
          name: item.name,
          sex: item.sex,
          gamesPlayed: item.gamesPlayed,
          courtAmount: item.roundedAmount,
          betAdjustmentVnd: adj,
          finalAmount: eff,
          statusLabel,
          note: item.discountNote || '',
        };
      }),
    });
    downloadCsvFile(
      `sao_ke_caulongs_${new Date().toISOString().slice(0, 10)}.csv`,
      csv
    );
  };

  const handleArchiveCurrentSession = () => {
    if (!currentState) {
      alert('Không tìm thấy dữ liệu phiên làm việc hiện tại!');
      return;
    }
    vibrateSuccess();
    archiveCurrentSession(
      currentState,
      settlementResult.totalCost,
      buildCurrentSettlementSnapshot()
    );
    setArchivedSessions(getArchivedSessions());
    alert('Đã lưu thành công buổi đánh này (kèm bản chụp tài chính) vào sổ lưu trữ!');
  };

  const handleDownloadArchivedJson = (session: ArchivedSessionSummary) => {
    vibrateSuccess();
    const dataStr = JSON.stringify(session.sessionData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `badminton_archive_${new Date(session.createdAt)
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreArchivedSession = (session: ArchivedSessionSummary) => {
    const dateFormatted = new Date(session.createdAt).toLocaleString('vi-VN');
    if (
      window.confirm(
        `Bạn có chắc muốn khôi phục buổi đánh lúc ${dateFormatted}?\n(Dữ liệu hiện tại sẽ được tự động sao lưu dự phòng)`
      )
    ) {
      vibrateSuccess();
      const res = onImportJson(JSON.stringify(session.sessionData));
      if ('error' in res) {
        alert(`Lỗi khi khôi phục: ${res.error}`);
      } else {
        alert('Khôi phục buổi đánh thành công!');
      }
    }
  };

  const handleDeleteArchivedSession = (id: string) => {
    if (window.confirm('Bạn có chắc muốn xóa buổi này khỏi sổ lưu trữ?')) {
      vibrateWarning();
      deleteArchivedSession(id);
      setArchivedSessions(getArchivedSessions());
    }
  };

  const handleClearAllArchive = () => {
    if (!showClearArchiveConfirm) {
      setShowClearArchiveConfirm(true);
      return;
    }
    vibrateWarning();
    clearAllArchivedSessions();
    setArchivedSessions([]);
    setShowClearArchiveConfirm(false);
    alert('Đã xóa toàn bộ sổ lưu trữ!');
  };

  const fullZaloMessage = useMemo(() => {
    let baseMessage = settlementResult.zaloMessage;
    if (mergeBets) {
      const mergedPlayers = settlementResult.players.map((item) => {
        const adj = betLedger.settlementAdjustmentByPlayer[item.playerId] || 0;
        const eff = getEffectivePlayerPayable(item.roundedAmount, adj, true);
        if (adj === 0) return item;
        const betPartNote =
          eff < 0
            ? `Được nhận lại ${formatVND(Math.abs(eff))}`
            : `Sân ${formatVND(item.roundedAmount)} ${adj > 0 ? '+' : '-'
            } Độ ${formatVND(Math.abs(adj))}`;
        const combinedNote = [item.discountNote, betPartNote]
          .filter(Boolean)
          .join('; ');
        return {
          ...item,
          discountNote: combinedNote,
          roundedAmount: Math.max(0, eff),
        };
      });
      baseMessage = generateZaloSettlementMessage({
        totalCost: settlementResult.totalCost,
        courtCost: settlementResult.courtCost,
        shuttleCost: settlementResult.shuttleCost,
        extraCost: settlementResult.extraCost,
        totalCollected: settlementResult.totalCollected,
        surplus: settlementResult.surplus,
        shortfall: settlementResult.shortfall,
        players: mergedPlayers,
        settings,
        hideZeroCostPlayers: hideZeroCostInZalo,
      });
    }
    const betSection = buildBetLedgerZaloSection(betLedger, mergeBets);
    return betSection ? `${baseMessage}\n${betSection}` : baseMessage;
  }, [settlementResult, betLedger, mergeBets, settings, hideZeroCostInZalo]);

  const handleCopyZalo = async () => {
    vibrateSuccess();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullZaloMessage);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = fullZaloMessage;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedZalo(true);
      setTimeout(() => setCopiedZalo(false), 3000);
    } catch {
      alert('Không thể sao chép tự động, vui lòng chọn và sao chép thủ công.');
    }
  };

  const handleDownloadJson = () => {
    vibrateSuccess();
    const dataStr = onExportJson();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `badminton_session_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = async () => {
    vibrateSuccess();
    const dataStr = onExportJson();
    try {
      await navigator.clipboard.writeText(dataStr);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Fallback
    }
  };

  const financeSummary = useMemo(
    () => computeMultiSessionFinanceSummary(archivedSessions),
    [archivedSessions]
  );

  return (
    <div className="max-w-[820px] mx-auto px-4 md:px-6 pt-4 pb-28 space-y-5">
      {/* Sub-Navigation Segmented Control */}
      <div
        className={`ui-segmented-track grid gap-1 ${isViewer ? 'grid-cols-2' : 'grid-cols-3'
          }`}
      >
        {(
          [
            { id: 'CALC', label: 'Tính tiền', icon: Calculator },
            { id: 'EQUITY', label: 'Thống kê', icon: BarChart3 },
            ...(!isViewer
              ? [{ id: 'AI' as const, label: 'AI Nhận xét', icon: Sparkles }]
              : []),
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className="min-h-[44px] px-1.5 sm:px-3 rounded-xl text-[13px] sm:text-[14px] font-semibold flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap transition"
              style={
                active
                  ? {
                    backgroundColor: 'var(--bg-surface-elevated)',
                    color: 'var(--text-primary)',
                    boxShadow: 'var(--shadow-sm)',
                  }
                  : { color: 'var(--text-secondary)' }
              }
            >
              <Icon
                className="w-4 h-4 shrink-0"
                style={active ? { color: 'var(--color-accent)' } : undefined}
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {subTab === 'AI' && !isViewer ? (
        onEditRank ? (
          <RankAdvisorPanel
            players={players}
            history={history}
            maleBonus={maleBonus}
            onApplyRank={onEditRank}
          />
        ) : null
      ) : subTab === 'EQUITY' ? (
        <EquityTable
          players={players}
          stats={stats}
          history={history}
          maleBonus={maleBonus}
          isViewer={isViewer}
          hideRankAdvisor={!isViewer}
          onApplyRank={onEditRank}
        />
      ) : (
        <div className="space-y-5">
          {/* HERO SUMMARY CARD */}
          {(() => {
            const payablePlayers = settlementResult.players.filter((item) => {
              const adj = betLedger.settlementAdjustmentByPlayer[item.playerId] || 0;
              return getEffectivePlayerPayable(item.roundedAmount, adj, mergeBets) > 0;
            });
            const paidItems = payablePlayers.filter(
              (item) => payments[item.playerId]?.status === 'PAID'
            );
            const pendingItemsCount = payablePlayers.filter(
              (item) => payments[item.playerId]?.status === 'PENDING_REVIEW'
            ).length;
            const collectedVnd = paidItems.reduce((sum, item) => {
              const adj = betLedger.settlementAdjustmentByPlayer[item.playerId] || 0;
              return (
                sum +
                Math.max(
                  0,
                  getEffectivePlayerPayable(item.roundedAmount, adj, mergeBets)
                )
              );
            }, 0);
            const targetVnd = payablePlayers.reduce((sum, item) => {
              const adj = betLedger.settlementAdjustmentByPlayer[item.playerId] || 0;
              return (
                sum +
                Math.max(
                  0,
                  getEffectivePlayerPayable(item.roundedAmount, adj, mergeBets)
                )
              );
            }, 0);
            const progressPct =
              targetVnd > 0
                ? Math.min(100, Math.round((collectedVnd / targetVnd) * 100))
                : 0;

            return (
              <div className="ui-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div
                      className="text-[14px] font-medium"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Đã thu buổi chơi
                    </div>
                    <div
                      className="text-[32px] font-bold tabular-nums tracking-[-0.03em] leading-tight mt-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {formatVND(collectedVnd)}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[14px] font-semibold tabular-nums flex-wrap">
                      <span style={{ color: 'var(--color-accent)' }}>
                        {paidItems.length}/{payablePlayers.length} người đã đóng
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>·</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Tổng chi: {formatVND(settlementResult.totalCost)}
                      </span>
                    </div>
                  </div>

                  {pendingItemsCount > 0 && (
                    <StatusPill tone="warning" className="tabular-nums shrink-0">
                      {pendingItemsCount} chờ duyệt
                    </StatusPill>
                  )}
                </div>

                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-surface-secondary)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progressPct}%`,
                      backgroundColor: 'var(--color-accent)',
                    }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={handleCopyZalo}
                    className="ui-btn ui-btn-secondary flex-col h-auto py-3 px-2 gap-1.5"
                  >
                    {copiedZalo ? (
                      <Check
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                    ) : (
                      <Copy
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                    )}
                    <span className="text-[13px]">
                      {copiedZalo ? 'Đã chép' : 'Gửi Zalo'}
                    </span>
                  </button>

                  {!isViewer ? (
                    <button
                      type="button"
                      onClick={handleExportCurrentSessionCsv}
                      className="ui-btn ui-btn-secondary flex-col h-auto py-3 px-2 gap-1.5"
                    >
                      <FileSpreadsheet
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                      <span className="text-[13px]">Xuất CSV</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCopyBankAccount}
                      disabled={!settings.bankAccount}
                      className="ui-btn ui-btn-secondary flex-col h-auto py-3 px-2 gap-1.5"
                    >
                      <Copy
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                      <span className="text-[13px]">
                        {copiedBankAccount ? 'Đã chép' : 'Chép STK'}
                      </span>
                    </button>
                  )}

                  {!isViewer ? (
                    <button
                      type="button"
                      onClick={() => setSubTab('AI')}
                      className="ui-btn ui-btn-secondary flex-col h-auto py-3 px-2 gap-1.5"
                    >
                      <Sparkles
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                      <span className="text-[13px]">AI Nhận xét</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSubTab('EQUITY')}
                      className="ui-btn ui-btn-secondary flex-col h-auto py-3 px-2 gap-1.5"
                    >
                      <BarChart3
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                      <span className="text-[13px]">Thống kê</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 1. SESSION COSTS */}
          <section className="ui-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3
                className="font-bold text-[16px] flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <Coins
                  className="w-4 h-4"
                  style={{ color: 'var(--color-accent)' }}
                />
                <span>1. Chi phí buổi chơi</span>
              </h3>
              <div className="flex items-center gap-3">
                {!isViewer && (
                  <button
                    type="button"
                    onClick={() => {
                      vibrateSuccess();
                      updateSettings({
                        courtHourlyRate: 160000,
                        shuttlePrice: 30000,
                        extraCost: 0,
                        extraCostNote: 'Nước uống / Phụ phí',
                        genderRatioMalePercent: 60,
                        genderRatioFemalePercent: 40,
                      });
                    }}
                    className="min-h-[44px] px-2 inline-flex items-center text-[13px] font-semibold underline"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    Giá chuẩn CLB
                  </button>
                )}
                <span
                  className="font-bold text-[17px] tabular-nums"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {formatVND(settlementResult.totalCost)}
                </span>
              </div>
            </div>

            {/* Court Cost */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className="text-[14px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Tiền sân
                </span>
                <div className="ui-segmented-track inline-flex gap-1">
                  {(
                    [
                      { id: 'HOURLY', label: 'Theo giờ' },
                      { id: 'DIRECT', label: 'Trọn gói' },
                    ] as const
                  ).map((opt) => {
                    const active = settings.courtCostMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isViewer}
                        onClick={() => updateSettings({ courtCostMode: opt.id })}
                        className="min-h-[44px] px-3 rounded-lg text-[13px] font-semibold transition disabled:opacity-60"
                        style={
                          active
                            ? {
                              backgroundColor: 'var(--bg-surface-elevated)',
                              color: 'var(--color-accent)',
                              boxShadow: 'var(--shadow-sm)',
                            }
                            : { color: 'var(--text-secondary)' }
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {settings.courtCostMode === 'HOURLY' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="block text-[13px] mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Giá/giờ (VNĐ)
                    </label>
                    <input
                      type="number"
                      step="10000"
                      disabled={isViewer}
                      value={settings.courtHourlyRate}
                      onChange={(e) =>
                        updateSettings({ courtHourlyRate: Number(e.target.value) })
                      }
                      className="ui-input font-semibold tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      className="block text-[13px] mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Số giờ đánh
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      disabled={isViewer}
                      value={settings.courtHours}
                      onChange={(e) =>
                        updateSettings({ courtHours: Number(e.target.value) })
                      }
                      className="ui-input font-semibold tabular-nums"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    className="block text-[13px] mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Tổng tiền sân (VNĐ)
                  </label>
                  <input
                    type="number"
                    step="10000"
                    disabled={isViewer}
                    value={settings.courtCostDirect}
                    onChange={(e) =>
                      updateSettings({ courtCostDirect: Number(e.target.value) })
                    }
                    className="ui-input font-semibold tabular-nums"
                  />
                </div>
              )}
            </div>

            {/* Shuttle Cost */}
            <div className="space-y-3 pt-4 border-t ui-divider">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className="text-[14px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Tiền cầu
                </span>
                <div className="ui-segmented-track inline-flex gap-1">
                  {(
                    [
                      { id: 'BY_SHUTTLE', label: 'Theo quả' },
                      { id: 'BY_TUBE', label: 'Theo ống' },
                      { id: 'DIRECT', label: 'Trọn gói' },
                    ] as const
                  ).map((opt) => {
                    const active = settings.shuttleCostMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isViewer}
                        onClick={() => updateSettings({ shuttleCostMode: opt.id })}
                        className="min-h-[44px] px-3 rounded-lg text-[13px] font-semibold transition disabled:opacity-60"
                        style={
                          active
                            ? {
                              backgroundColor: 'var(--bg-surface-elevated)',
                              color: 'var(--color-accent)',
                              boxShadow: 'var(--shadow-sm)',
                            }
                            : { color: 'var(--text-secondary)' }
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {settings.shuttleCostMode === 'BY_SHUTTLE' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="block text-[13px] mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Số quả cầu
                    </label>
                    <input
                      type="number"
                      min="0"
                      disabled={isViewer}
                      value={settings.shuttleCount}
                      onChange={(e) =>
                        updateSettings({ shuttleCount: Number(e.target.value) })
                      }
                      className="ui-input font-semibold tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      className="block text-[13px] mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Giá/quả (VNĐ)
                    </label>
                    <input
                      type="number"
                      step="1000"
                      disabled={isViewer}
                      value={settings.shuttlePrice}
                      onChange={(e) =>
                        updateSettings({ shuttlePrice: Number(e.target.value) })
                      }
                      className="ui-input font-semibold tabular-nums"
                    />
                  </div>
                </div>
              ) : settings.shuttleCostMode === 'BY_TUBE' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="block text-[13px] mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Số ống cầu
                    </label>
                    <input
                      type="number"
                      min="0"
                      disabled={isViewer}
                      value={settings.shuttleTubeCount}
                      onChange={(e) =>
                        updateSettings({ shuttleTubeCount: Number(e.target.value) })
                      }
                      className="ui-input font-semibold tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      className="block text-[13px] mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Giá/ống (VNĐ)
                    </label>
                    <input
                      type="number"
                      step="10000"
                      disabled={isViewer}
                      value={settings.shuttleTubePrice}
                      onChange={(e) =>
                        updateSettings({ shuttleTubePrice: Number(e.target.value) })
                      }
                      className="ui-input font-semibold tabular-nums"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    className="block text-[13px] mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Tổng tiền cầu (VNĐ)
                  </label>
                  <input
                    type="number"
                    step="10000"
                    disabled={isViewer}
                    value={settings.shuttleCostDirect}
                    onChange={(e) =>
                      updateSettings({ shuttleCostDirect: Number(e.target.value) })
                    }
                    className="ui-input font-semibold tabular-nums"
                  />
                </div>
              )}
            </div>

            {/* Extra Cost */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t ui-divider">
              <div>
                <label
                  className="block text-[13px] mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Chi phí khác (VNĐ)
                </label>
                <input
                  type="number"
                  step="5000"
                  disabled={isViewer}
                  value={settings.extraCost}
                  onChange={(e) =>
                    updateSettings({ extraCost: Number(e.target.value) })
                  }
                  className="ui-input font-semibold tabular-nums"
                />
              </div>
              <div>
                <label
                  className="block text-[13px] mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Ghi chú chi phí khác
                </label>
                <input
                  type="text"
                  disabled={isViewer}
                  value={settings.extraCostNote}
                  onChange={(e) =>
                    updateSettings({ extraCostNote: e.target.value })
                  }
                  placeholder="Nước uống, gửi xe..."
                  className="ui-input"
                />
              </div>
            </div>
          </section>

          {/* 2. SPLIT MODE & DISCOUNTS */}
          <section className="ui-card p-5 space-y-4">
            <h3
              className="font-bold text-[16px] flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <Percent
                className="w-4 h-4"
                style={{ color: 'var(--color-accent)' }}
              />
              <span>2. Chế độ phân chia &amp; Giảm giá</span>
            </h3>

            <div className="ui-segmented-track grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'EQUAL', label: 'Chia đều' },
                  { id: 'GENDER_RATIO', label: 'Tỉ lệ Nam/Nữ' },
                  { id: 'MALE_EXTRA', label: 'Nam thêm +X' },
                ] as const
              ).map((opt) => {
                const active = settings.splitMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isViewer}
                    onClick={() => updateSettings({ splitMode: opt.id })}
                    className="min-h-[44px] px-2 rounded-xl text-[14px] font-semibold transition disabled:opacity-60"
                    style={
                      active
                        ? {
                          backgroundColor: 'var(--bg-surface-elevated)',
                          color: 'var(--color-accent)',
                          boxShadow: 'var(--shadow-sm)',
                        }
                        : { color: 'var(--text-secondary)' }
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {settings.splitMode === 'GENDER_RATIO' && (
              <div className="ui-tile p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className="text-[14px] font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Tỉ lệ 1 Nam : 1 Nữ
                  </span>
                  <span
                    className="text-[15px] font-bold tabular-nums"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    Nam {settings.genderRatioMalePercent}% · Nữ{' '}
                    {settings.genderRatioFemalePercent}%
                  </span>
                </div>

                {(() => {
                  const sampleMale = settlementResult.players.find(
                    (p) => p.sex === 'M' && !p.isDiscounted && p.roundedAmount > 0
                  );
                  const sampleFemale = settlementResult.players.find(
                    (p) => p.sex === 'F' && !p.isDiscounted && p.roundedAmount > 0
                  );
                  return (
                    <div
                      className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 rounded-xl text-[13px]"
                      style={{ backgroundColor: 'var(--bg-surface)' }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Mức thu 1 người (đủ trận)
                      </span>
                      <span className="font-semibold tabular-nums inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <GenderDot sex="M" />
                          <span>{formatVND(sampleMale?.roundedAmount ?? 0)}</span>
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>·</span>
                        <span className="inline-flex items-center gap-1">
                          <GenderDot sex="F" />
                          <span>{formatVND(sampleFemale?.roundedAmount ?? 0)}</span>
                        </span>
                      </span>
                    </div>
                  );
                })()}

                <div className="space-y-1">
                  <input
                    type="range"
                    min={30}
                    max={80}
                    step={1}
                    disabled={isViewer}
                    value={settings.genderRatioMalePercent}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      updateSettings({
                        genderRatioMalePercent: m,
                        genderRatioFemalePercent: 100 - m,
                      });
                    }}
                    className="ui-range w-full cursor-pointer disabled:opacity-60"
                  />
                  <div
                    className="flex justify-between text-[12px] tabular-nums"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span>30%</span>
                    <span>55%</span>
                    <span>60%</span>
                    <span>80%</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { m: 55, f: 45, label: '55 / 45' },
                    { m: 60, f: 40, label: '60 / 40' },
                    { m: 65, f: 35, label: '65 / 35' },
                    { m: 70, f: 30, label: '70 / 30' },
                  ].map((preset) => {
                    const active = settings.genderRatioMalePercent === preset.m;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={isViewer}
                        onClick={() =>
                          updateSettings({
                            genderRatioMalePercent: preset.m,
                            genderRatioFemalePercent: preset.f,
                          })
                        }
                        className={`min-h-[36px] px-3 rounded-full text-[13px] font-semibold tabular-nums transition ${active ? 'ui-btn-primary' : ''
                          }`}
                        style={
                          !active
                            ? {
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-secondary)',
                            }
                            : undefined
                        }
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {settings.splitMode === 'MALE_EXTRA' && (
              <div>
                <label
                  className="block text-[14px] font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Số tiền Nam đóng thêm so với Nữ (VNĐ)
                </label>
                <input
                  type="number"
                  step="5000"
                  disabled={isViewer}
                  value={settings.maleExtraAmount}
                  onChange={(e) =>
                    updateSettings({ maleExtraAmount: Number(e.target.value) })
                  }
                  className="ui-input font-semibold tabular-nums"
                />
              </div>
            )}

            {/* Under-played discount */}
            <div className="pt-3 border-t ui-divider space-y-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <span
                    className="font-semibold text-[14px] block"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Giảm giá người đánh ít trận
                  </span>
                  <span
                    className="text-[13px]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Bù vào người đủ trận (tối đa +30%, đúng theo chế độ chia tiền)
                  </span>
                </div>
                <input
                  type="checkbox"
                  disabled={isViewer}
                  checked={settings.discountUnderPlayed}
                  onChange={(e) =>
                    updateSettings({ discountUnderPlayed: e.target.checked })
                  }
                  className="ui-checkbox w-5 h-5 shrink-0"
                />
              </label>

              {settings.discountUnderPlayed && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      className="block text-[13px] mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Ngưỡng trận giảm
                    </label>
                    <select
                      disabled={isViewer}
                      value={settings.underPlayedThreshold}
                      onChange={(e) =>
                        updateSettings({
                          underPlayedThreshold: Number(e.target.value),
                        })
                      }
                      className="ui-select"
                    >
                      <option value={1}>Từ 1 trận trở xuống</option>
                      <option value={2}>Từ 2 trận trở xuống (chuẩn)</option>
                      <option value={3}>Từ 3 trận trở xuống</option>
                    </select>
                  </div>

                  <div>
                    <label
                      className="block text-[13px] mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Cách tính giảm
                    </label>
                    <select
                      disabled={isViewer}
                      value={settings.underPlayedDiscountType}
                      onChange={(e) =>
                        updateSettings({
                          underPlayedDiscountType:
                            e.target.value as UnderPlayedDiscountType,
                        })
                      }
                      className="ui-select"
                    >
                      <option value="PROPORTIONAL">Theo tỉ lệ số trận</option>
                      <option value="PERCENT_50">Giảm 50% tiền</option>
                      <option value="FREE">Miễn phí hoàn toàn</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Zero games policy */}
            <div className="pt-3 border-t ui-divider flex items-center justify-between gap-3 flex-wrap">
              <span
                className="text-[14px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Người chơi 0 trận
              </span>
              <select
                disabled={isViewer}
                value={settings.zeroGamesPolicy}
                onChange={(e) =>
                  updateSettings({
                    zeroGamesPolicy: e.target.value as 'FREE' | 'FULL',
                  })
                }
                className="ui-select w-auto min-w-[180px]"
              >
                <option value="FREE">Miễn phí (0đ)</option>
                <option value="FULL">Đóng đủ như mọi người</option>
              </select>
            </div>
          </section>

          {/* 3. PAYMENT TABLE */}
          {(() => {
            const paidCount = settlementResult.players.filter(
              (p) => payments[p.playerId]?.status === 'PAID'
            ).length;
            const pendingCount = settlementResult.players.filter(
              (p) => payments[p.playerId]?.status === 'PENDING_REVIEW'
            ).length;

            return (
              <section className="ui-card p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3
                    className="font-bold text-[16px] flex items-center gap-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Banknote
                      className="w-4 h-4"
                      style={{ color: 'var(--color-accent)' }}
                    />
                    <span>3. Bảng thu tiền từng người</span>
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill tone="accent" className="tabular-nums">
                      Đã thu {paidCount}/{settlementResult.players.length}
                    </StatusPill>
                    {pendingCount > 0 && (
                      <StatusPill tone="warning" className="tabular-nums">
                        Chờ duyệt: {pendingCount}
                      </StatusPill>
                    )}
                    {settlementResult.surplus > 0 && (
                      <StatusPill tone="neutral" className="tabular-nums">
                        Dư: +{formatVND(settlementResult.surplus)}
                      </StatusPill>
                    )}
                  </div>
                </div>

                {settlementResult.warning && (
                  <div className="ui-banner-warning p-3.5 text-[14px] flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{settlementResult.warning}</span>
                  </div>
                )}

                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-[14px] text-left">
                    <thead>
                      <tr
                        className="border-b ui-divider text-[13px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <th className="py-2.5 px-2 font-semibold text-center min-w-[110px]">
                          {isViewer ? 'Trạng thái' : 'Đã đóng'}
                        </th>
                        <th className="py-2.5 px-2 font-semibold">Tên</th>
                        <th className="py-2.5 px-2 font-semibold text-center">Trận</th>
                        <th className="py-2.5 px-2 font-semibold text-right">Số tiền</th>
                        <th className="py-2.5 px-2 font-semibold text-right">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y ui-divider">
                      {settlementResult.players.map((item) => {
                        const rec = payments[item.playerId];
                        const status = rec?.status ?? 'UNPAID';
                        const isPaid = status === 'PAID';
                        const isPending = status === 'PENDING_REVIEW';
                        const isRejected = status === 'REJECTED';
                        const betAdj =
                          betLedger.settlementAdjustmentByPlayer[item.playerId] || 0;
                        const effectiveAmount = getEffectivePlayerPayable(
                          item.roundedAmount,
                          betAdj,
                          mergeBets
                        );

                        return (
                          <tr
                            key={item.playerId}
                            style={
                              isPaid
                                ? { backgroundColor: 'var(--color-accent-soft)' }
                                : isPending
                                  ? { backgroundColor: 'var(--color-warning-soft)' }
                                  : isRejected
                                    ? { backgroundColor: 'var(--color-danger-soft)' }
                                    : undefined
                            }
                          >
                            <td className="py-3 px-2 text-center">
                              {!isViewer ? (
                                isPending ? (
                                  <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                                    {rec?.receiptUrl && (
                                      <button
                                        type="button"
                                        title="Xem ảnh biên lai"
                                        onClick={() => {
                                          setRejectReasonInput('');
                                          setReviewReceiptTarget({
                                            playerId: item.playerId,
                                            playerName: item.name,
                                            amount: Math.max(0, effectiveAmount),
                                            receiptUrl: rec.receiptUrl,
                                            isPending: true,
                                          });
                                        }}
                                        className="ui-btn ui-btn-secondary min-h-[44px] px-3 text-[13px]"
                                      >
                                        <ImageIcon className="w-3.5 h-3.5" />
                                        <span>Ảnh</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        vibrateSuccess();
                                        onToggleApprovePayment(item.playerId);
                                      }}
                                      className="ui-btn ui-btn-primary min-h-[44px] px-3 text-[13px]"
                                    >
                                      Duyệt
                                    </button>
                                    <button
                                      type="button"
                                      title="Từ chối"
                                      aria-label={`Từ chối biên lai của ${item.name}`}
                                      onClick={() => {
                                        vibrateWarning();
                                        setRejectReasonInput('');
                                        setReviewReceiptTarget({
                                          playerId: item.playerId,
                                          playerName: item.name,
                                          amount: Math.max(0, effectiveAmount),
                                          receiptUrl: rec?.receiptUrl,
                                          isPending: true,
                                        });
                                      }}
                                      className="ui-btn ui-btn-danger-soft min-w-[44px] min-h-[44px] px-3 text-[13px]"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-2 justify-center">
                                    <input
                                      type="checkbox"
                                      checked={isPaid}
                                      onChange={() => {
                                        vibrateSuccess();
                                        onToggleApprovePayment(item.playerId);
                                      }}
                                      aria-label={`Đã đóng tiền: ${item.name}`}
                                      className="ui-checkbox w-5 h-5 cursor-pointer"
                                    />
                                    {rec?.receiptUrl && (
                                      <button
                                        type="button"
                                        title="Xem lại ảnh biên lai"
                                        aria-label={`Xem ảnh biên lai của ${item.name}`}
                                        onClick={() => {
                                          setRejectReasonInput('');
                                          setReviewReceiptTarget({
                                            playerId: item.playerId,
                                            playerName: item.name,
                                            amount: Math.max(0, effectiveAmount),
                                            receiptUrl: rec.receiptUrl,
                                            isPending: false,
                                          });
                                        }}
                                        className="ui-icon-btn w-11 h-11"
                                      >
                                        <ImageIcon className="w-4 h-4" />
                                      </button>
                                    )}
                                    {isRejected && (
                                      <span
                                        title={rec?.rejectionReason || 'Đã từ chối'}
                                        className="text-[12px] font-semibold"
                                        style={{ color: 'var(--color-danger)' }}
                                      >
                                        Từ chối
                                      </span>
                                    )}
                                  </div>
                                )
                              ) : effectiveAmount < 0 ? (
                                <StatusPill tone="accent">Nhận lại</StatusPill>
                              ) : effectiveAmount === 0 ? (
                                <span
                                  className="text-[13px]"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  {mergeBets && betAdj < 0 ? 'Trừ độ' : 'Miễn phí'}
                                </span>
                              ) : isPaid ? (
                                <StatusPill tone="accent">Đã đóng</StatusPill>
                              ) : isPending ? (
                                <div className="inline-flex items-center gap-1.5 justify-center">
                                  <StatusPill tone="warning">Chờ duyệt</StatusPill>
                                  {rec?.receiptUrl && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReviewReceiptTarget({
                                          playerId: item.playerId,
                                          playerName: item.name,
                                          amount: effectiveAmount,
                                          receiptUrl: rec.receiptUrl,
                                          isPending: false,
                                        })
                                      }
                                      className="text-[12px] underline font-semibold"
                                      style={{ color: 'var(--color-accent)' }}
                                    >
                                      Ảnh
                                    </button>
                                  )}
                                </div>
                              ) : isRejected ? (
                                <div className="space-y-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setQrModalTarget({
                                        playerId: item.playerId,
                                        playerName: item.name,
                                        amount: effectiveAmount,
                                      })
                                    }
                                    className="ui-btn ui-btn-danger-soft min-h-[36px] px-2.5 text-[12px]"
                                  >
                                    Gửi lại
                                  </button>
                                  {rec?.rejectionReason && (
                                    <div
                                      className="text-[11px] max-w-[110px] mx-auto leading-tight"
                                      style={{ color: 'var(--color-danger)' }}
                                    >
                                      {rec.rejectionReason}
                                    </div>
                                  )}
                                </div>
                              ) : confirmReportPlayerId === item.playerId ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={reportingPlayerId === item.playerId}
                                    onClick={() => handleReportPayment(item.playerId)}
                                    className="ui-btn ui-btn-primary min-h-[36px] px-2.5 text-[12px]"
                                  >
                                    {reportingPlayerId === item.playerId
                                      ? 'Đang gửi...'
                                      : 'Xác nhận'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={reportingPlayerId === item.playerId}
                                    onClick={() => setConfirmReportPlayerId(null)}
                                    className="ui-btn ui-btn-secondary min-h-[36px] px-2 text-[12px]"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setQrModalTarget({
                                      playerId: item.playerId,
                                      playerName: item.name,
                                      amount: effectiveAmount,
                                    })
                                  }
                                  className="ui-btn ui-btn-secondary min-h-[36px] px-3 text-[12px]"
                                >
                                  Tôi đã chuyển
                                </button>
                              )}
                            </td>

                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2 max-w-[140px]">
                                <GenderDot sex={item.sex} />
                                <span
                                  className="font-semibold truncate"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {item.name}
                                </span>
                              </div>
                            </td>

                            <td
                              className="py-3 px-2 text-center tabular-nums"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {item.gamesPlayed}
                            </td>

                            <td className="py-3 px-2 text-right font-bold tabular-nums">
                              {effectiveAmount < 0 ? (
                                <StatusPill tone="accent">
                                  Nhận lại {formatVND(Math.abs(effectiveAmount))}
                                </StatusPill>
                              ) : effectiveAmount === 0 ? (
                                <span
                                  className="font-normal text-[13px]"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  {mergeBets && betAdj < 0
                                    ? '0đ (Trừ thắng độ)'
                                    : 'Miễn phí'}
                                </span>
                              ) : (
                                <div className="inline-flex flex-col items-end gap-0.5">
                                  <div className="inline-flex items-center justify-end gap-2">
                                    <span
                                      style={{
                                        color: isPending
                                          ? 'var(--color-warning)'
                                          : 'var(--color-accent)',
                                      }}
                                    >
                                      {formatVND(effectiveAmount)}
                                    </span>
                                    <button
                                      type="button"
                                      title={`Mở mã VietQR cho ${item.name}`}
                                      aria-label={`Mở mã VietQR cho ${item.name}`}
                                      onClick={() =>
                                        setQrModalTarget({
                                          playerId: item.playerId,
                                          playerName: item.name,
                                          amount: effectiveAmount,
                                        })
                                      }
                                      className="ui-icon-btn w-11 h-11"
                                      style={{ color: 'var(--color-accent)' }}
                                    >
                                      <QrCode className="w-4 h-4" />
                                    </button>
                                  </div>
                                  {mergeBets && betAdj !== 0 && (
                                    <span
                                      className="text-[12px] font-normal"
                                      style={{ color: 'var(--color-warning)' }}
                                    >
                                      (Sân {formatVND(item.roundedAmount)}{' '}
                                      {betAdj > 0
                                        ? `+ Độ ${formatVND(betAdj)}`
                                        : `- Thắng ${formatVND(Math.abs(betAdj))}`}
                                      )
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td
                              className="py-3 px-2 text-right text-[13px]"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {item.discountNote ? (
                                <span
                                  className="font-medium"
                                  style={{ color: 'var(--color-warning)' }}
                                >
                                  {item.discountNote}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-3 border-t ui-divider space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer text-[14px]">
                    <input
                      type="checkbox"
                      checked={hideZeroCostInZalo}
                      onChange={(e) => setHideZeroCostInZalo(e.target.checked)}
                      className="ui-checkbox w-4 h-4 shrink-0"
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Ẩn người 0 trận (Miễn phí) khỏi tin nhắn Zalo
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleCopyZalo}
                    className="ui-btn ui-btn-primary w-full h-[48px] rounded-full text-[15px]"
                  >
                    {copiedZalo ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                    <span>
                      {copiedZalo
                        ? 'Đã sao chép vào Clipboard'
                        : 'Sao chép tin nhắn Zalo'}
                    </span>
                  </button>

                  {!isViewer && (
                    <button
                      type="button"
                      onClick={handleExportCurrentSessionCsv}
                      className="ui-btn ui-btn-secondary w-full rounded-full"
                    >
                      <FileSpreadsheet
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                      <span>Xuất bảng thu tiền (Excel / CSV)</span>
                    </button>
                  )}
                </div>
              </section>
            );
          })()}

          {/* 3B. BET LEDGER */}
          {betLedger.hasBets && (
            <section className="ui-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3
                  className="font-bold text-[16px] flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Flame
                    className="w-4 h-4"
                    style={{ color: 'var(--color-warning)' }}
                  />
                  <span>3B. Sổ nợ độ buổi này</span>
                </h3>
                <StatusPill tone="warning" className="tabular-nums">
                  {betLedger.matches.length} trận có độ
                </StatusPill>
              </div>

              {betLedger.unresolvedMatches.length > 0 && (
                <div className="ui-banner-warning p-3.5 space-y-2 text-[14px]">
                  <div className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Có {betLedger.unresolvedMatches.length} trận đánh độ chưa chốt đội thắng
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {betLedger.unresolvedMatches.map((um) => {
                      const matchedHist = history.find((h) => h.id === um.matchId);
                      return (
                        <div
                          key={um.matchId}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13px]"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <span className="truncate">
                            Trận #{um.matchIndex}: {um.team1Names.join(' & ')} vs{' '}
                            {um.team2Names.join(' & ')} ({um.bet.label})
                          </span>
                          {!isViewer && matchedHist && onQuickEditMatchResult && (
                            <button
                              type="button"
                              onClick={() => onQuickEditMatchResult(matchedHist)}
                              className="ui-btn ui-btn-primary min-h-[34px] px-3 text-[12px] shrink-0"
                            >
                              Chốt ngay
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {betLedger.matches.some((m) => m.bet.amountVnd > 0) && (
                <label className="ui-tile p-3.5 flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <span
                      className="font-semibold text-[14px] block"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Gộp tiền độ vào tổng chuyển khoản ở bảng trên
                    </span>
                    <span
                      className="text-[13px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Gộp tiền độ vào số tiền chuyển khoản để thu một lần.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    disabled={isViewer}
                    checked={Boolean(settings.mergeBetsIntoSettlement)}
                    onChange={(e) =>
                      updateSettings({ mergeBetsIntoSettlement: e.target.checked })
                    }
                    className="ui-checkbox w-5 h-5 shrink-0"
                  />
                </label>
              )}

              {betLedger.transfers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Chuyển khoản độ (đã cấn trừ chéo)
                    </span>
                    {mergeBets && (
                      <span style={{ color: 'var(--color-accent)' }}>
                        Đã gộp vào tiền sân
                      </span>
                    )}
                  </div>
                  {betLedger.transfers.map((t) => {
                    const paid = Boolean(betPayments[t.id]);
                    return (
                      <div
                        key={t.id}
                        className="ui-tile px-3.5 py-2.5 flex items-center justify-between gap-2 text-[14px]"
                        style={
                          paid
                            ? { backgroundColor: 'var(--color-accent-soft)' }
                            : undefined
                        }
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-semibold">{t.fromName}</span>
                          <span
                            className="mx-1.5"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            →
                          </span>
                          <span className="font-semibold">{t.toName}</span>
                          <span
                            className="ml-2 font-bold tabular-nums"
                            style={{ color: 'var(--color-warning)' }}
                          >
                            {formatVND(t.amount)}
                          </span>
                        </div>
                        {!isViewer && onToggleBetPaid ? (
                          <button
                            type="button"
                            onClick={() => {
                              vibrateSuccess();
                              onToggleBetPaid(t.id);
                            }}
                            className={`ui-btn min-h-[36px] px-3 text-[13px] shrink-0 ${paid ? 'ui-btn-primary' : 'ui-btn-secondary'
                              }`}
                            style={
                              !paid
                                ? { backgroundColor: 'var(--bg-surface)' }
                                : undefined
                            }
                          >
                            {paid ? 'Đã trả' : 'Đánh dấu trả'}
                          </button>
                        ) : (
                          <StatusPill tone={paid ? 'accent' : 'neutral'}>
                            {paid ? 'Đã trả' : 'Chưa trả'}
                          </StatusPill>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {betLedger.fundContributions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Tiền độ góp Quỹ chung
                    </span>
                    <span
                      className="tabular-nums font-bold"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      Tổng quỹ: {formatVND(betLedger.totalFundVnd)}
                    </span>
                  </div>
                  {betLedger.fundContributions.map((f) => {
                    const paid = Boolean(betPayments[f.id]);
                    return (
                      <div
                        key={f.id}
                        className="ui-tile px-3.5 py-2.5 flex items-center justify-between gap-2 text-[14px]"
                        style={
                          paid
                            ? { backgroundColor: 'var(--color-accent-soft)' }
                            : undefined
                        }
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-semibold">{f.playerName}</span>
                          <span
                            className="mx-1.5"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            góp quỹ
                          </span>
                          <span
                            className="font-bold tabular-nums"
                            style={{ color: 'var(--color-warning)' }}
                          >
                            +{formatVND(f.amount)}
                          </span>
                        </div>
                        {!isViewer && onToggleBetPaid ? (
                          <button
                            type="button"
                            onClick={() => {
                              vibrateSuccess();
                              onToggleBetPaid(f.id);
                            }}
                            className={`ui-btn min-h-[36px] px-3 text-[13px] shrink-0 ${paid ? 'ui-btn-primary' : 'ui-btn-secondary'
                              }`}
                            style={
                              !paid
                                ? { backgroundColor: 'var(--bg-surface)' }
                                : undefined
                            }
                          >
                            {paid ? 'Đã góp' : 'Đánh dấu góp'}
                          </button>
                        ) : (
                          <StatusPill tone={paid ? 'accent' : 'neutral'}>
                            {paid ? 'Đã góp' : 'Chưa góp'}
                          </StatusPill>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {betLedger.itemObligations.length > 0 && (
                <div className="space-y-2">
                  <div
                    className="text-[13px] font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Kèo nước / cầu / hiện vật
                  </div>
                  {betLedger.itemObligations.map((item) => {
                    const paid = Boolean(betPayments[item.id]);
                    return (
                      <div
                        key={item.id}
                        className="ui-tile px-3.5 py-2.5 flex items-center justify-between gap-2 text-[14px]"
                        style={
                          paid
                            ? { backgroundColor: 'var(--color-accent-soft)' }
                            : undefined
                        }
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <StatusPill tone="warning">#{item.matchIndex}</StatusPill>
                          <span className="truncate">{item.description}</span>
                        </div>
                        {!isViewer && onToggleBetPaid ? (
                          <button
                            type="button"
                            onClick={() => {
                              vibrateSuccess();
                              onToggleBetPaid(item.id);
                            }}
                            className={`ui-btn min-h-[36px] px-3 text-[13px] shrink-0 ${paid ? 'ui-btn-primary' : 'ui-btn-secondary'
                              }`}
                            style={
                              !paid
                                ? { backgroundColor: 'var(--bg-surface)' }
                                : undefined
                            }
                          >
                            {paid ? 'Đã trả' : 'Đánh dấu trả'}
                          </button>
                        ) : (
                          <StatusPill tone={paid ? 'accent' : 'neutral'}>
                            {paid ? 'Đã trả' : 'Chưa trả'}
                          </StatusPill>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* 4. BANK INFO */}
          <section className="ui-card p-5 space-y-4">
            <h3
              className="font-bold text-[16px] flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <Building
                className="w-4 h-4"
                style={{ color: 'var(--color-accent)' }}
              />
              <span>4. Tài khoản nhận tiền</span>
            </h3>

            {isViewer ? (
              settings.bankAccount || settings.bankName ? (
                <div className="ui-tile p-4 space-y-3 text-[14px]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div
                        className="text-[12px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Ngân hàng
                      </div>
                      <div className="font-bold text-[15px]">
                        {settings.bankName || '-'}
                      </div>
                    </div>
                    {settings.bankAccount && (
                      <button
                        type="button"
                        onClick={handleCopyBankAccount}
                        className="ui-btn ui-btn-primary px-4 rounded-full"
                      >
                        {copiedBankAccount ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        <span>{copiedBankAccount ? 'Đã chép STK' : 'Chép STK'}</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t ui-divider">
                    <div>
                      <div
                        className="text-[12px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Số tài khoản
                      </div>
                      <div
                        className="font-mono-tabular font-bold"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        {settings.bankAccount || '-'}
                      </div>
                    </div>
                    <div>
                      <div
                        className="text-[12px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Chủ tài khoản
                      </div>
                      <div className="font-semibold uppercase">
                        {settings.bankAccountHolder || '-'}
                      </div>
                    </div>
                  </div>
                  {settings.bankNote && (
                    <div className="pt-2 border-t ui-divider">
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Nội dung CK:{' '}
                      </span>
                      <span className="font-semibold">{settings.bankNote}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p
                  className="text-[14px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Chủ sân chưa nhập thông tin tài khoản nhận tiền.
                </p>
              )
            ) : (
              <div className="space-y-3">
                {(() => {
                  const selectedBank = resolveBankOption(
                    settings.bankCode,
                    settings.bankName
                  );
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          className="block text-[13px] mb-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Ngân hàng (VietQR)
                        </label>
                        <select
                          value={selectedBank?.code || ''}
                          onChange={(e) => {
                            const found = VIETNAM_BANKS.find(
                              (b) => b.code === e.target.value
                            );
                            if (found) {
                              updateSettings({
                                bankCode: found.code,
                                bankName: found.shortName,
                              });
                            } else {
                              updateSettings({ bankCode: '', bankName: '' });
                            }
                          }}
                          className="ui-select"
                        >
                          <option value="">-- Chọn ngân hàng (VietQR) --</option>
                          {VIETNAM_BANKS.map((bank) => (
                            <option key={bank.code} value={bank.code}>
                              {bank.shortName} ({bank.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          className="block text-[13px] mb-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Số tài khoản
                        </label>
                        <input
                          type="text"
                          placeholder="0123456789"
                          value={settings.bankAccount}
                          onChange={(e) =>
                            updateSettings({ bankAccount: e.target.value })
                          }
                          className="ui-input font-mono-tabular"
                        />
                      </div>

                      <div>
                        <label
                          className="block text-[13px] mb-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Chủ tài khoản
                        </label>
                        <input
                          type="text"
                          placeholder="NGUYEN VAN A"
                          value={settings.bankAccountHolder}
                          onChange={(e) =>
                            updateSettings({ bankAccountHolder: e.target.value })
                          }
                          className="ui-input uppercase"
                        />
                      </div>

                      <div>
                        <label
                          className="block text-[13px] mb-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Cú pháp chuyển khoản
                        </label>
                        <input
                          type="text"
                          placeholder="Tien cau long"
                          value={settings.bankNote}
                          onChange={(e) =>
                            updateSettings({ bankNote: e.target.value })
                          }
                          className="ui-input"
                        />
                      </div>
                    </div>
                  );
                })()}
                {resolveBankOption(settings.bankCode, settings.bankName) &&
                  settings.bankAccount.trim() && (
                    <div
                      className="text-[13px] font-semibold flex items-center gap-1.5"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      <Check className="w-4 h-4 shrink-0" />
                      <span>
                        Đã sẵn sàng tạo mã VietQR tự động theo đúng số tiền từng người
                      </span>
                    </div>
                  )}
              </div>
            )}
          </section>

          {!isViewer && (
            <>
              {/* 5. SESSION & DATA MANAGEMENT */}
              <section className="ui-card p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3
                    className="font-bold text-[16px]"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    5. Quản lý dữ liệu &amp; Buổi mới
                  </h3>
                  <span
                    className="text-[13px] tabular-nums"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {players.length} người · {history.length} trận
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleArchiveCurrentSession}
                    className="ui-btn ui-btn-primary px-4 rounded-full"
                  >
                    <Archive className="w-4 h-4" />
                    <span>Lưu vào sổ buổi đánh</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="ui-btn ui-btn-secondary px-4"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="ui-btn ui-btn-secondary px-4"
                  >
                    {copiedJson ? (
                      <Check
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>{copiedJson ? 'Đã chép' : 'Chép JSON'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    className="ui-btn ui-btn-secondary px-4"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Nhập JSON</span>
                  </button>
                </div>

                <div className="pt-3 border-t ui-divider flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewSessionModal(true)}
                    className="ui-btn ui-btn-secondary px-4"
                  >
                    <RefreshCw
                      className="w-4 h-4"
                      style={{ color: 'var(--color-accent)' }}
                    />
                    <span>Buổi mới (Giữ người chơi)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setResetConfirmInput('');
                      setShowResetAllModal(true);
                    }}
                    className="ui-btn ui-btn-danger-soft px-4"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Xóa sạch toàn bộ</span>
                  </button>

                  {roomCode && (
                    <button
                      type="button"
                      disabled={cleaningReceipts}
                      onClick={handleCleanupRoomReceipts}
                      className="ui-btn ui-btn-secondary px-4"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>
                        {cleaningReceipts ? 'Đang dọn ảnh...' : 'Dọn ảnh biên lai cũ'}
                      </span>
                    </button>
                  )}
                </div>
              </section>

              {/* 6. ARCHIVE & MULTI-SESSION STATEMENT (Redesigned cleanly — fixes Screenshot 1!) */}
              <section className="ui-card p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3
                    className="font-bold text-[16px] flex items-center gap-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Archive
                      className="w-4 h-4"
                      style={{ color: 'var(--color-accent)' }}
                    />
                    <span>6. Sổ lưu trữ &amp; Sao kê đa buổi</span>
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    {financeSummary.sessionsWithFinance > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadCsvFile(
                            `sao_ke_nhieu_buoi_clb_${new Date()
                              .toISOString()
                              .slice(0, 10)}.csv`,
                            buildMultiSessionStatementCsv(archivedSessions)
                          )
                        }
                        className="ui-btn ui-btn-accent-soft min-h-[38px] px-3.5 rounded-full text-[13px]"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Xuất sao kê Excel (.csv)</span>
                      </button>
                    )}
                    <span
                      className="text-[13px] tabular-nums"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {archivedSessions.length}/20 buổi
                    </span>
                  </div>
                </div>

                {/* High-contrast Neutral KPI Tiles + Unpaid Debts List */}
                {financeSummary.sessionsWithFinance > 0 && (
                  <div className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="ui-tile p-4 space-y-1">
                        <div
                          className="text-[13px] font-medium"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Quỹ dư tích lũy ({financeSummary.sessionsWithFinance} buổi)
                        </div>
                        <div
                          className="text-[22px] font-bold tabular-nums"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          {formatVND(financeSummary.cumulativeSurplus)}
                        </div>
                      </div>

                      <div className="ui-tile p-4 space-y-1">
                        <div
                          className="text-[13px] font-medium"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Nợ chưa thu buổi trước ({financeSummary.unpaidDebts.length} khoản)
                        </div>
                        <div
                          className="text-[22px] font-bold tabular-nums"
                          style={{
                            color:
                              financeSummary.totalUnpaidAmount > 0
                                ? 'var(--color-warning)'
                                : 'var(--text-primary)',
                          }}
                        >
                          {formatVND(financeSummary.totalUnpaidAmount)}
                        </div>
                      </div>
                    </div>

                    {financeSummary.unpaidDebts.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div
                          className="text-[13px] font-semibold flex items-center gap-1.5"
                          style={{ color: 'var(--color-warning)' }}
                        >
                          <Clock className="w-4 h-4 shrink-0" />
                          <span>Danh sách còn nợ các buổi trước (bấm khi trả bù)</span>
                        </div>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                          {financeSummary.unpaidDebts.map((debt) => (
                            <div
                              key={`${debt.archiveId}_${debt.playerId}`}
                              className="ui-tile px-3 py-2.5 sm:px-3.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3"
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div
                                  className="font-semibold text-[14px] truncate"
                                  style={{ color: 'var(--text-primary)' }}
                                  title={debt.playerName}
                                >
                                  {debt.playerName}
                                </div>
                                <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[12.5px] sm:text-[13px] tabular-nums">
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                    {new Date(debt.createdAt).toLocaleDateString('vi-VN')}
                                  </span>
                                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                                  <span
                                    className="font-bold whitespace-nowrap"
                                    style={{ color: 'var(--color-warning)' }}
                                  >
                                    {formatVND(debt.amount)}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  vibrateSuccess();
                                  const next = toggleArchivedPlayerPaid(
                                    debt.archiveId,
                                    debt.playerId
                                  );
                                  setArchivedSessions(next);
                                }}
                                className="ui-btn ui-btn-primary min-h-[44px] px-3 sm:px-3.5 rounded-full text-[13px] gap-1 shrink-0"
                              >
                                <Check className="w-4 h-4 shrink-0" />
                                <span>Đã trả bù</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Archived Sessions List */}
                {archivedSessions.length === 0 ? (
                  <div
                    className="ui-tile-dashed py-8 px-4 text-center space-y-1 text-[14px]"
                  >
                    <p
                      className="font-medium"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Chưa có buổi đánh nào trong sổ lưu trữ.
                    </p>
                    <p
                      className="text-[13px]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Bấm &quot;Lưu vào sổ buổi đánh&quot; hoặc &quot;Buổi mới&quot; để lưu lại kết quả.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    {archivedSessions.map((session) => {
                      const dateStr = new Date(session.createdAt).toLocaleDateString(
                        'vi-VN',
                        {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        }
                      );
                      const timeStr = new Date(session.createdAt).toLocaleTimeString(
                        'vi-VN',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      );
                      const snap = session.settlementSnapshot;
                      const paidCountSnap = snap
                        ? snap.players.filter((p) => p.finalAmount <= 0 || p.paid)
                          .length
                        : 0;
                      const isExpanded = expandedArchiveIds.has(session.id);

                      return (
                        <div
                          key={session.id}
                          className="ui-tile p-3.5 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Calendar
                                  className="w-4 h-4 shrink-0"
                                  style={{ color: 'var(--color-accent)' }}
                                />
                                <span
                                  className="font-semibold text-[14px] tabular-nums"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {dateStr} lúc {timeStr}
                                </span>
                                {snap && (
                                  <StatusPill
                                    tone={
                                      paidCountSnap === snap.players.length
                                        ? 'accent'
                                        : 'warning'
                                    }
                                    className="tabular-nums"
                                  >
                                    Đã thu {paidCountSnap}/{snap.players.length}
                                  </StatusPill>
                                )}
                              </div>
                              <div
                                className="text-[13px] tabular-nums flex items-center gap-2 flex-wrap"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                <span>{session.totalPlayers} người</span>
                                <span>·</span>
                                <span>{session.totalGames} trận</span>
                                {session.totalCost > 0 && (
                                  <>
                                    <span>·</span>
                                    <span
                                      className="font-semibold"
                                      style={{ color: 'var(--color-accent)' }}
                                    >
                                      {formatVND(session.totalCost)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {snap && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedArchiveIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(session.id)) next.delete(session.id);
                                      else next.add(session.id);
                                      return next;
                                    });
                                  }}
                                  title="Xem chi tiết đóng tiền buổi này"
                                  aria-label="Mở rộng chi tiết đóng tiền"
                                  className="ui-icon-btn w-11 h-11"
                                  style={{ backgroundColor: 'var(--bg-surface)' }}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleRestoreArchivedSession(session)}
                                title="Khôi phục buổi này vào ứng dụng"
                                className="ui-btn ui-btn-secondary min-h-[44px] px-3 text-[13px]"
                                style={{ backgroundColor: 'var(--bg-surface)' }}
                              >
                                <RotateCcw
                                  className="w-3.5 h-3.5"
                                  style={{ color: 'var(--color-accent)' }}
                                />
                                <span>Mở lại</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownloadArchivedJson(session)}
                                title="Tải tệp JSON của buổi này"
                                aria-label="Tải tệp JSON"
                                className="ui-icon-btn w-11 h-11"
                                style={{ backgroundColor: 'var(--bg-surface)' }}
                              >
                                <Download className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteArchivedSession(session.id)}
                                title="Xóa buổi này khỏi sổ lưu trữ"
                                aria-label="Xóa buổi lưu trữ"
                                className="ui-icon-btn w-11 h-11"
                                style={{ backgroundColor: 'var(--bg-surface)' }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {snap && isExpanded && (
                            <div className="pt-2.5 border-t ui-divider space-y-1.5">
                              {snap.players.map((sp) => (
                                <div
                                  key={sp.playerId}
                                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13px]"
                                  style={{ backgroundColor: 'var(--bg-surface)' }}
                                >
                                  <span
                                    className="font-medium truncate"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {sp.name}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span
                                      className="tabular-nums font-semibold"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      {formatVND(sp.finalAmount)}
                                    </span>
                                    {sp.finalAmount > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          vibrateSuccess();
                                          setArchivedSessions(
                                            toggleArchivedPlayerPaid(
                                              session.id,
                                              sp.playerId
                                            )
                                          );
                                        }}
                                        className={`ui-btn min-h-[44px] px-3 text-[13px] ${sp.paid ? 'ui-btn-primary' : 'ui-btn-warning-soft'
                                          }`}
                                      >
                                        {sp.paid ? 'Đã đóng' : 'Chưa đóng'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleClearAllArchive}
                        className={`ui-btn px-4 text-[13px] ${showClearArchiveConfirm
                          ? 'ui-btn-danger'
                          : 'ui-btn-ghost'
                          }`}
                      >
                        {showClearArchiveConfirm
                          ? 'Bấm lần nữa để xác nhận xóa tất cả'
                          : 'Xóa toàn bộ sổ lưu trữ'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {/* MODAL 1: NEW SESSION CONFIRMATION */}
      <UiModal
        isOpen={showNewSessionModal}
        onClose={() => setShowNewSessionModal(false)}
        maxWidthClass="max-w-md"
        title="Bắt đầu buổi mới?"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowNewSessionModal(false)}
              className="ui-btn ui-btn-secondary px-4"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={() => {
                vibrateSuccess();
                onNewSessionKeepPlayers(
                  settlementResult.totalCost,
                  buildCurrentSettlementSnapshot()
                );
                setTimeout(() => setArchivedSessions(getArchivedSessions()), 50);
                setShowNewSessionModal(false);
              }}
              className="ui-btn ui-btn-primary px-5 rounded-full"
            >
              Bắt đầu buổi mới
            </button>
          </>
        }
      >
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          Toàn bộ lịch sử các trận đấu và số trận của từng người sẽ được đặt lại về 0 (buổi hiện tại được tự động lưu vào sổ lưu trữ). Danh sách người chơi, giới tính và trình độ vẫn được giữ nguyên.
        </p>
      </UiModal>

      {/* MODAL 2: RESET ALL CONFIRMATION */}
      <UiModal
        isOpen={showResetAllModal}
        onClose={() => setShowResetAllModal(false)}
        maxWidthClass="max-w-md"
        title="Xóa sạch toàn bộ dữ liệu"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowResetAllModal(false)}
              className="ui-btn ui-btn-secondary px-4"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={resetConfirmInput.trim().toUpperCase() !== 'XOA'}
              onClick={() => {
                vibrateWarning();
                onResetSession();
                setShowResetAllModal(false);
              }}
              className="ui-btn ui-btn-danger px-5 rounded-full"
            >
              Xác nhận xóa sạch
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="ui-banner-danger p-3.5 text-[14px] flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>
              Hành động này sẽ xóa vĩnh viễn toàn bộ người chơi, lịch sử và luật cặp trên thiết bị.
            </span>
          </div>
          <div className="space-y-1.5">
            <label
              className="block text-[14px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              Nhập chữ <strong style={{ color: 'var(--text-primary)' }}>XOA</strong> để xác nhận:
            </label>
            <input
              type="text"
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value)}
              placeholder="Gõ XOA..."
              className="ui-input text-center font-bold uppercase tracking-widest"
            />
          </div>
        </div>
      </UiModal>

      {/* MODAL 3: IMPORT JSON */}
      <UiModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        maxWidthClass="max-w-md"
        title="Nhập dữ liệu phiên (JSON)"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowImportModal(false)}
              className="ui-btn ui-btn-secondary px-4"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => {
                const res = onImportJson(importText);
                if ('error' in res) {
                  alert(`Lỗi khi nhập: ${res.error}`);
                } else {
                  setShowImportModal(false);
                  setImportText('');
                  alert('Nhập dữ liệu thành công!');
                }
              }}
              className="ui-btn ui-btn-primary px-5 rounded-full"
            >
              Tải vào ứng dụng
            </button>
          </>
        }
      >
        <textarea
          rows={6}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Dán nội dung JSON đã sao lưu vào đây..."
          className="ui-textarea font-mono-tabular"
        />
      </UiModal>

      {/* MODAL 4: PAYMENT QR */}
      <PaymentQrModal
        isOpen={Boolean(qrModalTarget)}
        onClose={() => setQrModalTarget(null)}
        playerId={qrModalTarget?.playerId || ''}
        playerName={qrModalTarget?.playerName || ''}
        amount={qrModalTarget?.amount || 0}
        settings={settings}
        paymentRecord={qrModalTarget ? payments[qrModalTarget.playerId] : undefined}
        roomCode={roomCode}
        isViewer={isViewer}
        onReportPayment={handleReportPayment}
      />

      {/* MODAL 5: RECEIPT REVIEW LIGHTBOX */}
      <UiModal
        isOpen={Boolean(reviewReceiptTarget)}
        onClose={() => setReviewReceiptTarget(null)}
        sheetOnMobile
        maxWidthClass="max-w-md"
        title={
          reviewReceiptTarget
            ? `Biên lai · ${reviewReceiptTarget.playerName}`
            : 'Biên lai'
        }
        subtitle={
          reviewReceiptTarget ? (
            <span
              className="font-bold tabular-nums"
              style={{ color: 'var(--color-accent)' }}
            >
              Cần đóng: {formatVND(reviewReceiptTarget.amount)}
            </span>
          ) : undefined
        }
      >
        {reviewReceiptTarget && (
          <div className="space-y-4">
            {reviewReceiptTarget.receiptUrl ? (
              <div className="ui-tile p-3 text-center">
                <img
                  src={reviewReceiptTarget.receiptUrl}
                  alt={`Biên lai của ${reviewReceiptTarget.playerName}`}
                  className="max-h-80 w-auto mx-auto rounded-xl object-contain"
                />
              </div>
            ) : (
              <div
                className="ui-tile p-5 text-center flex flex-col items-center gap-2 text-[14px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <AlertCircle
                  className="w-5 h-5"
                  style={{ color: 'var(--color-warning)' }}
                />
                <span>Thành viên xác nhận không kèm ảnh biên lai.</span>
              </div>
            )}

            {!isViewer && reviewReceiptTarget.isPending && (
              <div className="space-y-4 pt-2 border-t ui-divider">
                <button
                  type="button"
                  onClick={() => {
                    vibrateSuccess();
                    onToggleApprovePayment(reviewReceiptTarget.playerId);
                    setReviewReceiptTarget(null);
                  }}
                  className="ui-btn ui-btn-primary w-full rounded-full"
                >
                  <Check className="w-4 h-4" />
                  <span>Duyệt đã nhận đủ tiền</span>
                </button>

                <div className="ui-tile p-4 space-y-3">
                  <div
                    className="text-[14px] font-semibold"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    Hoặc từ chối (gửi lý do để thành viên nộp lại)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Ảnh mờ / khó đọc',
                      'Thiếu tiền',
                      'Chưa thấy tiền vào TK',
                    ].map((chip) => {
                      const active = rejectReasonInput === chip;
                      return (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setRejectReasonInput(chip)}
                          className={`ui-btn min-h-[36px] px-3 rounded-full text-[13px] ${active ? 'ui-btn-danger-soft' : 'ui-btn-secondary'
                            }`}
                          style={
                            !active
                              ? { backgroundColor: 'var(--bg-surface)' }
                              : undefined
                          }
                        >
                          {chip}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    placeholder="Nhập lý do khác (hoặc để trống)..."
                    value={rejectReasonInput}
                    onChange={(e) => setRejectReasonInput(e.target.value)}
                    className="ui-input"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      vibrateWarning();
                      onRejectPendingPayment(
                        reviewReceiptTarget.playerId,
                        rejectReasonInput.trim() || 'Chưa nhận được tiền'
                      );
                      setReviewReceiptTarget(null);
                    }}
                    className="ui-btn ui-btn-danger w-full rounded-full"
                  >
                    Từ chối &amp; Yêu cầu gửi lại
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </UiModal>
    </div>
  );
};
