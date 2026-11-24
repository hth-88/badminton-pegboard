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
  X,
  AlertCircle,
} from 'lucide-react';
import type {
  BadmintonSessionState,
  MatchHistory,
  MatchmakingStats,
  Player,
} from '../types/badminton';
import {
  calculateSettlement,
  formatVND,
  type CloudSettlementData,
  type SettlementSettings,
  type UnderPlayedDiscountType,
} from '../engine/settlement';
import {
  type ArchivedSessionSummary,
  archiveCurrentSession,
  clearAllArchivedSessions,
  deleteArchivedSession,
  getArchivedSessions,
} from '../engine/storage';
import type { RoomRole } from '../hooks/useCloudRoom';
import { EquityTable } from './EquityTable';
import { PaymentQrModal } from './PaymentQrModal';
import { VIETNAM_BANKS, resolveBankOption } from '../engine/vietqr';
import { deleteRoomReceipts } from '../services/supabaseSync';
import { vibrateSuccess, vibrateWarning } from '../utils/vibrate';

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
  onExportJson: () => string;
  onImportJson: (json: string) => { ok: true } | { ok: false; error: string };
  onNewSessionKeepPlayers: () => void;
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
  onExportJson,
  onImportJson,
  onNewSessionKeepPlayers,
  onResetSession,
}) => {
  const [subTab, setSubTab] = useState<'CALC' | 'EQUITY'>('CALC');
  const [hideZeroCostInZalo, setHideZeroCostInZalo] = useState(true);

  const { settings, payments } = settlementData;
  const isViewer = role === 'VIEWER';

  const [confirmReportPlayerId, setConfirmReportPlayerId] = useState<string | null>(null);
  const [reportingPlayerId, setReportingPlayerId] = useState<string | null>(null);
  const [copiedBankAccount, setCopiedBankAccount] = useState(false);

  // VietQR & Lightbox biên lai (Nhóm 3 & 4)
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

  // Danh sách các buổi lưu trữ (Archive tối đa 20 buổi)
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

  // Lưu cài đặt tính tiền khi thay đổi
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

  // Lưu phiên hiện tại vào Archive
  const handleArchiveCurrentSession = () => {
    if (!currentState) {
      alert('Không tìm thấy dữ liệu phiên làm việc hiện tại!');
      return;
    }
    vibrateSuccess();
    archiveCurrentSession(currentState, settlementResult.totalCost);
    setArchivedSessions(getArchivedSessions());
    alert('Đã lưu thành công buổi đánh này vào sổ lưu trữ!');
  };

  // Tải JSON của một buổi lưu trữ
  const handleDownloadArchivedJson = (session: ArchivedSessionSummary) => {
    vibrateSuccess();
    const dataStr = JSON.stringify(session.sessionData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `badminton_archive_${new Date(session.createdAt).toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Khôi phục buổi lưu trữ
  const handleRestoreArchivedSession = (session: ArchivedSessionSummary) => {
    const dateFormatted = new Date(session.createdAt).toLocaleString('vi-VN');
    if (
      window.confirm(
        `Bạn có chắc muốn khôi phục buổi đánh lúc ${dateFormatted}?\n(Dữ liệu hiện tại sẽ được tự động sao lưu dự phòng)`
      )
    ) {
      vibrateSuccess();
      const res = onImportJson(JSON.stringify(session.sessionData));
      if (res.ok) {
        alert('Khôi phục buổi đánh thành công!');
      } else {
        alert(`Lỗi khi khôi phục: ${res.error}`);
      }
    }
  };

  // Xóa một buổi lưu trữ
  const handleDeleteArchivedSession = (id: string) => {
    if (window.confirm('Bạn có chắc muốn xóa buổi này khỏi sổ lưu trữ?')) {
      vibrateWarning();
      deleteArchivedSession(id);
      setArchivedSessions(getArchivedSessions());
    }
  };

  // Xóa toàn bộ sổ lưu trữ (2 bước)
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

  // Tính toán quyết toán
  const settlementResult = useMemo(() => {
    return calculateSettlement(players, settings, history, undefined, {
      hideZeroCostPlayers: hideZeroCostInZalo,
    });
  }, [players, settings, history, hideZeroCostInZalo]);

  // Sao chép tin nhắn Zalo
  const handleCopyZalo = async () => {
    vibrateSuccess();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(settlementResult.zaloMessage);
      } else {
        // Fallback cho trình duyệt cũ
        const textarea = document.createElement('textarea');
        textarea.value = settlementResult.zaloMessage;
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

  return (
    <div className="max-w-2xl mx-auto pb-24 p-3 md:p-4 space-y-4 text-slate-100">
      {/* Top Navigation Switcher: [Tính tiền] [Thống kê & Ma trận] */}
      <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800">
        <button
          onClick={() => setSubTab('CALC')}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${subTab === 'CALC'
              ? 'bg-slate-800 text-emerald-400 shadow'
              : 'text-slate-400 hover:text-slate-200'
            }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Tính tiền quyết toán</span>
        </button>

        <button
          onClick={() => setSubTab('EQUITY')}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${subTab === 'EQUITY'
              ? 'bg-slate-800 text-emerald-400 shadow'
              : 'text-slate-400 hover:text-slate-200'
            }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Thống kê & Ma trận</span>
        </button>
      </div>

      {subTab === 'EQUITY' ? (
        <EquityTable players={players} stats={stats} />
      ) : (
        <div className="space-y-4">
          {isViewer && (
            <div className="bg-indigo-950/60 border border-indigo-700/60 text-indigo-200 rounded-2xl p-3 text-xs leading-relaxed">
              Chế độ Thành viên (Chỉ xem){roomCode ? ` — Phòng ${roomCode}` : ''} — Xem số tiền cần đóng, thông tin chuyển khoản và bấm &quot;Tôi đã chuyển&quot; cạnh tên mình để Chủ sân duyệt.
            </div>
          )}

          {/* ========================================================= */}
          {/* 1. NHẬP CHI PHÍ BUỔI ĐÁNH */}
          {/* ========================================================= */}
          <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-400" />
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
                    title="Đặt lại mức giá mặc định CLB (160k/h, 30k/quả, 0đ phụ phí)"
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold underline decoration-dotted transition"
                  >
                    Đặt lại giá chuẩn CLB
                  </button>
                )}
                <span className="text-emerald-400 font-black text-base">
                  {formatVND(settlementResult.totalCost)}
                </span>
              </div>
            </div>

            {/* A. Tiền sân */}
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300">Tiền sân:</span>
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                  <button
                    type="button"
                    disabled={isViewer}
                    onClick={() => updateSettings({ courtCostMode: 'HOURLY' })}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold disabled:opacity-60 ${settings.courtCostMode === 'HOURLY'
                        ? 'bg-slate-800 text-emerald-400'
                        : 'text-slate-400'
                      }`}
                  >
                    Theo giờ
                  </button>
                  <button
                    type="button"
                    disabled={isViewer}
                    onClick={() => updateSettings({ courtCostMode: 'DIRECT' })}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold disabled:opacity-60 ${settings.courtCostMode === 'DIRECT'
                        ? 'bg-slate-800 text-emerald-400'
                        : 'text-slate-400'
                      }`}
                  >
                    Tổng trọn gói
                  </button>
                </div>
              </div>

              {settings.courtCostMode === 'HOURLY' ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Giá/giờ (VNĐ)</label>
                    <input
                      type="number"
                      step="10000"
                      disabled={isViewer}
                      value={settings.courtHourlyRate}
                      onChange={(e) => updateSettings({ courtHourlyRate: Number(e.target.value) })}
                      className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-bold border border-slate-700 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Số giờ đánh</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      disabled={isViewer}
                      value={settings.courtHours}
                      onChange={(e) => updateSettings({ courtHours: Number(e.target.value) })}
                      className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-bold border border-slate-700 disabled:opacity-60"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tổng tiền sân (VNĐ)</label>
                  <input
                    type="number"
                    step="10000"
                    disabled={isViewer}
                    value={settings.courtCostDirect}
                    onChange={(e) => updateSettings({ courtCostDirect: Number(e.target.value) })}
                    className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-bold border border-slate-700 disabled:opacity-60"
                  />
                </div>
              )}
            </div>

            {/* B. Tiền cầu */}
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300">Tiền cầu:</span>
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                  <button
                    type="button"
                    disabled={isViewer}
                    onClick={() => updateSettings({ shuttleCostMode: 'BY_SHUTTLE' })}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold disabled:opacity-60 ${settings.shuttleCostMode === 'BY_SHUTTLE'
                        ? 'bg-slate-800 text-emerald-400'
                        : 'text-slate-400'
                      }`}
                  >
                    Theo quả
                  </button>
                  <button
                    type="button"
                    disabled={isViewer}
                    onClick={() => updateSettings({ shuttleCostMode: 'BY_TUBE' })}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold disabled:opacity-60 ${settings.shuttleCostMode === 'BY_TUBE'
                        ? 'bg-slate-800 text-emerald-400'
                        : 'text-slate-400'
                      }`}
                  >
                    Theo ống
                  </button>
                  <button
                    type="button"
                    disabled={isViewer}
                    onClick={() => updateSettings({ shuttleCostMode: 'DIRECT' })}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold disabled:opacity-60 ${settings.shuttleCostMode === 'DIRECT'
                        ? 'bg-slate-800 text-emerald-400'
                        : 'text-slate-400'
                      }`}
                  >
                    Trọn gói
                  </button>
                </div>
              </div>

              {settings.shuttleCostMode === 'BY_SHUTTLE' ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Số quả cầu</label>
                    <input
                      type="number"
                      min="0"
                      disabled={isViewer}
                      value={settings.shuttleCount}
                      onChange={(e) => updateSettings({ shuttleCount: Number(e.target.value) })}
                      className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-bold border border-slate-700 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Giá/quả (VNĐ)</label>
                    <input
                      type="number"
                      step="1000"
                      disabled={isViewer}
                      value={settings.shuttlePrice}
                      onChange={(e) => updateSettings({ shuttlePrice: Number(e.target.value) })}
                      className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-bold border border-slate-700 disabled:opacity-60"
                    />
                  </div>
                </div>
              ) : settings.shuttleCostMode === 'BY_TUBE' ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Số ống cầu</label>
                    <input
                      type="number"
                      min="0"
                      disabled={isViewer}
                      value={settings.shuttleTubeCount}
                      onChange={(e) => updateSettings({ shuttleTubeCount: Number(e.target.value) })}
                      className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-bold border border-slate-700 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Giá/ống (VNĐ)</label>
                    <input
                      type="number"
                      step="10000"
                      disabled={isViewer}
                      value={settings.shuttleTubePrice}
                      onChange={(e) => updateSettings({ shuttleTubePrice: Number(e.target.value) })}
                      className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-bold border border-slate-700 disabled:opacity-60"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tổng tiền cầu (VNĐ)</label>
                  <input
                    type="number"
                    step="10000"
                    disabled={isViewer}
                    value={settings.shuttleCostDirect}
                    onChange={(e) => updateSettings({ shuttleCostDirect: Number(e.target.value) })}
                    className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-bold border border-slate-700 disabled:opacity-60"
                  />
                </div>
              )}
            </div>

            {/* C. Chi phí khác */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Chi phí khác (VNĐ)</label>
                <input
                  type="number"
                  step="5000"
                  disabled={isViewer}
                  value={settings.extraCost}
                  onChange={(e) => updateSettings({ extraCost: Number(e.target.value) })}
                  className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-bold border border-slate-700 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Ghi chú chi phí khác</label>
                <input
                  type="text"
                  disabled={isViewer}
                  value={settings.extraCostNote}
                  onChange={(e) => updateSettings({ extraCostNote: e.target.value })}
                  placeholder="Nước uống, gửi xe..."
                  className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 text-xs border border-slate-700 disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 2. CẤU HÌNH CHIA TIỀN & GIẢM GIÁ */}
          {/* ========================================================= */}
          <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-3.5 text-xs">
            <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
              <Percent className="w-4 h-4 text-emerald-400" />
              <span>2. Chế độ phân chia & Giảm giá</span>
            </h3>

            {/* Chế độ chia */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300 block">Chế độ phân chia (Split Mode)</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={isViewer}
                  onClick={() => updateSettings({ splitMode: 'EQUAL' })}
                  className={`p-2 rounded-xl border text-center font-bold transition disabled:opacity-60 ${settings.splitMode === 'EQUAL'
                      ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300'
                      : 'bg-slate-800/80 border-slate-700 text-slate-400'
                    }`}
                >
                  Chia đều
                </button>

                <button
                  type="button"
                  disabled={isViewer}
                  onClick={() => updateSettings({ splitMode: 'GENDER_RATIO' })}
                  className={`p-2 rounded-xl border text-center font-bold transition disabled:opacity-60 ${settings.splitMode === 'GENDER_RATIO'
                      ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300'
                      : 'bg-slate-800/80 border-slate-700 text-slate-400'
                    }`}
                >
                  Tỉ lệ Nam/Nữ
                </button>

                <button
                  type="button"
                  disabled={isViewer}
                  onClick={() => updateSettings({ splitMode: 'MALE_EXTRA' })}
                  className={`p-2 rounded-xl border text-center font-bold transition disabled:opacity-60 ${settings.splitMode === 'MALE_EXTRA'
                      ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300'
                      : 'bg-slate-800/80 border-slate-700 text-slate-400'
                    }`}
                >
                  Nam thêm +X
                </button>
              </div>
            </div>

            {/* Chi tiết cho Gender Ratio */}
            {settings.splitMode === 'GENDER_RATIO' && (
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-slate-200">
                  <span className="font-semibold text-xs text-slate-300">Tỷ lệ mỗi cá nhân (1 Nam : 1 Nữ):</span>
                  <span className="text-emerald-400 font-extrabold text-sm sm:text-base font-mono">
                    Nam: {settings.genderRatioMalePercent}% — Nữ: {settings.genderRatioFemalePercent}%
                  </span>
                </div>

                {/* Live Cost Preview for Male vs Female */}
                {(() => {
                  const sampleMale = settlementResult.players.find(
                    (p) => p.sex === 'M' && !p.isDiscounted && p.roundedAmount > 0
                  );
                  const sampleFemale = settlementResult.players.find(
                    (p) => p.sex === 'F' && !p.isDiscounted && p.roundedAmount > 0
                  );
                  return (
                    <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
                      <span>Mức thu 1 người (đủ trận):</span>
                      <span className="font-bold">
                        <span className="text-sky-300">Nam ~{formatVND(sampleMale?.roundedAmount ?? 0)}</span>
                        <span className="text-slate-500 mx-1.5">•</span>
                        <span className="text-pink-300">Nữ ~{formatVND(sampleFemale?.roundedAmount ?? 0)}</span>
                      </span>
                    </div>
                  );
                })()}

                {/* Range Slider cho Tỷ lệ Nam/Nữ */}
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
                    className="w-full accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>Nam 30%</span>
                    <span>Nam 55%</span>
                    <span>Nam 60%</span>
                    <span>Nam 80%</span>
                  </div>
                </div>

                {/* Quick preset buttons */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] text-slate-400 font-medium mr-1">Chọn nhanh:</span>
                  {[
                    { m: 55, f: 45, label: '55 / 45' },
                    { m: 60, f: 40, label: '60 / 40' },
                    { m: 65, f: 35, label: '65 / 35' },
                    { m: 70, f: 30, label: '70 / 30' },
                  ].map((preset) => (
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
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition disabled:opacity-60 ${
                        settings.genderRatioMalePercent === preset.m
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 pt-0.5">
                  * Tỷ lệ tính theo từng người: 1 Nam = {settings.genderRatioMalePercent} phần, 1 Nữ = {settings.genderRatioFemalePercent} phần (Nam luôn đóng đúng mức quy định kể cả khi đông hơn Nữ).
                </p>
              </div>
            )}

            {/* Chi tiết cho Male Extra */}
            {settings.splitMode === 'MALE_EXTRA' && (
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                <label className="text-slate-300 font-semibold block">
                  Số tiền Nam đóng thêm so với Nữ (VNĐ)
                </label>
                <input
                  type="number"
                  step="5000"
                  disabled={isViewer}
                  value={settings.maleExtraAmount}
                  onChange={(e) => updateSettings({ maleExtraAmount: Number(e.target.value) })}
                  className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-bold border border-slate-700 disabled:opacity-60"
                />
              </div>
            )}

            {/* Giảm giá người chơi ít (<= 2 trận) */}
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-300 block">Giảm giá người chơi ít trận</span>
                  <span className="text-[11px] text-slate-500">
                    Khoản tiền giảm bù vào người đủ trận (tối đa +30%, theo đúng chế độ chia tiền)
                  </span>
                </div>
                <input
                  type="checkbox"
                  disabled={isViewer}
                  checked={settings.discountUnderPlayed}
                  onChange={(e) => updateSettings({ discountUnderPlayed: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-800 text-emerald-500 disabled:opacity-60"
                />
              </div>

              {settings.discountUnderPlayed && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Ngưỡng trận giảm</label>
                    <select
                      disabled={isViewer}
                      value={settings.underPlayedThreshold}
                      onChange={(e) => updateSettings({ underPlayedThreshold: Number(e.target.value) })}
                      className="w-full bg-slate-800 text-slate-100 rounded-xl px-2 py-1.5 font-semibold border border-slate-700 disabled:opacity-60"
                    >
                      <option value={1}>Từ 1 trận trở xuống</option>
                      <option value={2}>Từ 2 trận trở xuống (chuẩn)</option>
                      <option value={3}>Từ 3 trận trở xuống</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Cách tính giảm</label>
                    <select
                      disabled={isViewer}
                      value={settings.underPlayedDiscountType}
                      onChange={(e) =>
                        updateSettings({
                          underPlayedDiscountType: e.target.value as UnderPlayedDiscountType,
                        })
                      }
                      className="w-full bg-slate-800 text-slate-100 rounded-xl px-2 py-1.5 font-semibold border border-slate-700 disabled:opacity-60"
                    >
                      <option value="PROPORTIONAL">Theo tỉ lệ số trận</option>
                      <option value="PERCENT_50">Giảm 50% tiền</option>
                      <option value="FREE">Miễn phí hoàn toàn</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Chính sách 0 trận */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80">
              <span className="text-slate-400">Người chơi 0 trận (hoặc tạm nghỉ suốt buổi):</span>
              <select
                disabled={isViewer}
                value={settings.zeroGamesPolicy}
                onChange={(e) =>
                  updateSettings({ zeroGamesPolicy: e.target.value as 'FREE' | 'FULL' })
                }
                className="bg-slate-800 text-slate-200 rounded-lg px-2 py-1 font-semibold border border-slate-700 disabled:opacity-60"
              >
                <option value="FREE">Miễn phí (0đ)</option>
                <option value="FULL">Đóng đủ như mọi người</option>
              </select>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 3. BẢNG KẾT QUẢ ĐÓNG TIỀN CHI TIẾT */}
          {/* ========================================================= */}
          {(() => {
            const paidCount = settlementResult.players.filter(
              (p) => payments[p.playerId]?.status === 'PAID'
            ).length;
            const pendingCount = settlementResult.players.filter(
              (p) => payments[p.playerId]?.status === 'PENDING_REVIEW'
            ).length;

            return (
              <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-400" />
                    <span>3. Bảng thu tiền từng người</span>
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 border border-slate-700">
                      Đã thu: {paidCount} / {settlementResult.players.length} người
                    </span>
                    {pendingCount > 0 && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/60">
                        Chờ duyệt: {pendingCount}
                      </span>
                    )}
                    {settlementResult.surplus > 0 && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                        Dư chẵn: +{formatVND(settlementResult.surplus)}
                      </span>
                    )}
                  </div>
                </div>

                {settlementResult.warning && (
                  <div className="bg-amber-950/40 border border-amber-700/60 text-amber-200 rounded-2xl p-3 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{settlementResult.warning}</span>
                  </div>
                )}

                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 px-2 font-semibold text-center min-w-[110px]">
                          {isViewer ? 'Trạng thái' : 'Đã đóng'}
                        </th>
                        <th className="py-2 px-2 font-semibold">Tên</th>
                        <th className="py-2 px-2 font-semibold text-center">Trận</th>
                        <th className="py-2 px-2 font-semibold text-right">Số tiền đóng</th>
                        <th className="py-2 px-2 font-semibold text-right">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {settlementResult.players.map((item) => {
                        const rec = payments[item.playerId];
                        const status = rec?.status ?? 'UNPAID';
                        const isPaid = status === 'PAID';
                        const isPending = status === 'PENDING_REVIEW';
                        const isRejected = status === 'REJECTED';

                        return (
                          <tr
                            key={item.playerId}
                            className={`transition ${
                              isPaid
                                ? 'bg-emerald-950/20'
                                : isPending
                                ? 'bg-amber-950/30'
                                : isRejected
                                ? 'bg-rose-950/20'
                                : 'hover:bg-slate-850'
                            }`}
                          >
                            <td className="py-2.5 px-2 text-center">
                              {!isViewer ? (
                                isPending ? (
                                  <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                                    {rec?.receiptUrl && (
                                      <button
                                        type="button"
                                        title="Xem ảnh biên lai"
                                        onClick={() => {
                                          setRejectReasonInput('');
                                          setReviewReceiptTarget({
                                            playerId: item.playerId,
                                            playerName: item.name,
                                            amount: item.roundedAmount,
                                            receiptUrl: rec.receiptUrl,
                                            isPending: true,
                                          });
                                        }}
                                        className="px-2 py-1 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-600/40 text-[11px] font-bold flex items-center gap-1 transition"
                                      >
                                        <ImageIcon className="w-3 h-3" />
                                        <span>Ảnh</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        vibrateSuccess();
                                        onToggleApprovePayment(item.playerId);
                                      }}
                                      className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow transition"
                                    >
                                      Duyệt ✓
                                    </button>
                                    <button
                                      type="button"
                                      title="Từ chối / Chưa nhận được tiền"
                                      onClick={() => {
                                        vibrateWarning();
                                        setRejectReasonInput('');
                                        setReviewReceiptTarget({
                                          playerId: item.playerId,
                                          playerName: item.name,
                                          amount: item.roundedAmount,
                                          receiptUrl: rec?.receiptUrl,
                                          isPending: true,
                                        });
                                      }}
                                      className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 text-[11px] font-bold transition"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1.5 justify-center">
                                    <input
                                      type="checkbox"
                                      checked={isPaid}
                                      onChange={() => {
                                        vibrateSuccess();
                                        onToggleApprovePayment(item.playerId);
                                      }}
                                      aria-label={`Đã đóng tiền: ${item.name}`}
                                      className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                                    />
                                    {rec?.receiptUrl && (
                                      <button
                                        type="button"
                                        title="Xem lại ảnh biên lai"
                                        onClick={() => {
                                          setRejectReasonInput('');
                                          setReviewReceiptTarget({
                                            playerId: item.playerId,
                                            playerName: item.name,
                                            amount: item.roundedAmount,
                                            receiptUrl: rec.receiptUrl,
                                            isPending: false,
                                          });
                                        }}
                                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 transition"
                                      >
                                        <ImageIcon className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {isRejected && (
                                      <span
                                        title={rec?.rejectionReason || 'Đã từ chối'}
                                        className="text-[10px] font-bold text-rose-400"
                                      >
                                        Từ chối
                                      </span>
                                    )}
                                  </div>
                                )
                              ) : item.roundedAmount === 0 ? (
                                <span className="text-[11px] text-slate-500">Miễn phí</span>
                              ) : isPaid ? (
                                <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 text-[11px] font-bold">
                                  ✅ Đã đóng
                                </span>
                              ) : isPending ? (
                                <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                                  <span className="inline-block px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/60 text-[11px] font-bold">
                                    ⏳ Chờ duyệt
                                  </span>
                                  {rec?.receiptUrl && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReviewReceiptTarget({
                                          playerId: item.playerId,
                                          playerName: item.name,
                                          amount: item.roundedAmount,
                                          receiptUrl: rec.receiptUrl,
                                          isPending: false,
                                        })
                                      }
                                      className="text-[10px] underline text-sky-300"
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
                                        amount: item.roundedAmount,
                                      })
                                    }
                                    className="px-2 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-600/60 text-[11px] font-bold transition"
                                  >
                                    ❌ Gửi lại
                                  </button>
                                  {rec?.rejectionReason && (
                                    <div className="text-[10px] text-rose-300 max-w-[110px] mx-auto leading-tight">
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
                                    className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-bold shadow transition"
                                  >
                                    {reportingPlayerId === item.playerId ? 'Đang gửi...' : 'Xác nhận'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={reportingPlayerId === item.playerId}
                                    onClick={() => setConfirmReportPlayerId(null)}
                                    className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition"
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
                                      amount: item.roundedAmount,
                                    })
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-700/50 text-[11px] font-semibold transition"
                                >
                                  Tôi đã chuyển
                                </button>
                              )}
                            </td>
                            <td className="py-2.5 px-2">
                              <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    item.sex === 'M' ? 'bg-sky-400' : 'bg-pink-400'
                                  }`}
                                />
                                <span
                                  className={`font-semibold truncate ${
                                    isPaid
                                      ? 'text-emerald-300'
                                      : isPending
                                      ? 'text-amber-200'
                                      : isRejected
                                      ? 'text-rose-200'
                                      : 'text-slate-200'
                                  }`}
                                >
                                  {item.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center text-slate-400">
                              {item.gamesPlayed}
                            </td>
                            <td className="py-2.5 px-2 text-right font-black text-sm">
                              {item.roundedAmount === 0 ? (
                                <span className="text-slate-500 font-normal">Miễn phí</span>
                              ) : (
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <span
                                    className={
                                      isPaid
                                        ? 'text-emerald-300'
                                        : isPending
                                        ? 'text-amber-300'
                                        : 'text-emerald-400'
                                    }
                                  >
                                    {formatVND(item.roundedAmount)}
                                  </span>
                                  <button
                                    type="button"
                                    title={`Mở mã VietQR cho ${item.name}`}
                                    onClick={() =>
                                      setQrModalTarget({
                                        playerId: item.playerId,
                                        playerName: item.name,
                                        amount: item.roundedAmount,
                                      })
                                    }
                                    className="p-1 rounded-lg bg-slate-800 hover:bg-emerald-950 text-emerald-400 border border-slate-700 hover:border-emerald-600/60 transition"
                                  >
                                    <QrCode className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-right text-[11px] text-slate-400">
                              {item.discountNote ? (
                                <span className="text-amber-400/90 font-medium">
                                  {item.discountNote}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Nút Sao chép tin nhắn Zalo & Toggle ẩn 0 trận */}
                <div className="pt-2 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-medium px-1 select-none hover:text-white transition">
                    <input
                      type="checkbox"
                      checked={hideZeroCostInZalo}
                      onChange={(e) => setHideZeroCostInZalo(e.target.checked)}
                      className="w-4 h-4 rounded bg-slate-800 accent-emerald-500 cursor-pointer"
                    />
                    <span>Ẩn người 0 trận (Miễn phí) khỏi bảng thu tiền gửi Zalo</span>
                  </label>

                  <button
                    onClick={handleCopyZalo}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-extrabold text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2"
                  >
                    {copiedZalo ? <Check className="w-5 h-5 text-white" /> : <Copy className="w-5 h-5" />}
                    <span>{copiedZalo ? 'ĐÃ SAO CHÉP VÀO CLIPBOARD!' : 'SAO CHÉP TIN NHẮN ZALO'}</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ========================================================= */}
          {/* 4. THÔNG TIN CHUYỂN KHOẢN (BANK INFO) */}
          {/* ========================================================= */}
          <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
            <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
              <Building className="w-4 h-4 text-emerald-400" />
              <span>4. Thông tin tài khoản nhận tiền</span>
            </h3>

            {isViewer ? (
              settings.bankAccount || settings.bankName ? (
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] text-slate-400">Ngân hàng</div>
                      <div className="font-bold text-slate-100 text-sm">
                        {settings.bankName || '-'}
                      </div>
                    </div>
                    {settings.bankAccount && (
                      <button
                        type="button"
                        onClick={handleCopyBankAccount}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition"
                      >
                        {copiedBankAccount ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedBankAccount ? 'Đã chép STK!' : 'Sao chép STK'}</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                    <div>
                      <div className="text-[11px] text-slate-400">Số tài khoản</div>
                      <div className="font-mono font-bold text-emerald-300 text-sm">
                        {settings.bankAccount || '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Chủ tài khoản</div>
                      <div className="font-bold text-slate-200 uppercase">
                        {settings.bankAccountHolder || '-'}
                      </div>
                    </div>
                  </div>
                  {settings.bankNote && (
                    <div className="pt-1 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-400">Nội dung CK: </span>
                      <span className="font-semibold text-slate-200">{settings.bankNote}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 text-xs py-2">
                  Chủ sân chưa nhập thông tin tài khoản nhận tiền.
                </p>
              )
            ) : (
              <div className="space-y-2.5">
                {(() => {
                  const selectedBank = resolveBankOption(settings.bankCode, settings.bankName);
                  return (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">
                          Ngân hàng (VietQR)
                        </label>
                        <select
                          value={selectedBank?.code || ''}
                          onChange={(e) => {
                            const found = VIETNAM_BANKS.find((b) => b.code === e.target.value);
                            if (found) {
                              updateSettings({
                                bankCode: found.code,
                                bankName: found.shortName,
                              });
                            } else {
                              updateSettings({ bankCode: '', bankName: '' });
                            }
                          }}
                          className="w-full bg-slate-800 text-slate-100 rounded-xl px-2.5 py-1.5 border border-slate-700 font-semibold"
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
                        <label className="text-[11px] text-slate-400 block mb-1">Số tài khoản</label>
                        <input
                          type="text"
                          placeholder="0123456789"
                          value={settings.bankAccount}
                          onChange={(e) => updateSettings({ bankAccount: e.target.value })}
                          className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 font-mono border border-slate-700"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Chủ tài khoản</label>
                        <input
                          type="text"
                          placeholder="NGUYEN VAN A"
                          value={settings.bankAccountHolder}
                          onChange={(e) => updateSettings({ bankAccountHolder: e.target.value })}
                          className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 uppercase border border-slate-700"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Cú pháp chuyển khoản</label>
                        <input
                          type="text"
                          placeholder="Tien cau long"
                          value={settings.bankNote}
                          onChange={(e) => updateSettings({ bankNote: e.target.value })}
                          className="w-full bg-slate-800 text-slate-100 rounded-xl px-3 py-1.5 border border-slate-700"
                        />
                      </div>
                    </div>
                  );
                })()}
                {resolveBankOption(settings.bankCode, settings.bankName) &&
                  settings.bankAccount.trim() && (
                    <div className="text-[11px] text-emerald-400 font-semibold">
                      ✅ Đã sẵn sàng tạo mã VietQR tự động theo đúng số tiền từng người
                    </div>
                  )}
              </div>
            )}
          </div>

          {!isViewer && (
            <>
              {/* ========================================================= */}
              {/* 5. QUẢN LÝ DỮ LIỆU & BUỔI MỚI */}
              {/* ========================================================= */}
          <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
            <h3 className="font-bold text-sm text-slate-200 flex items-center justify-between">
              <span>5. Quản lý dữ liệu &amp; Bắt đầu buổi mới</span>
              <span className="text-slate-400 font-mono">
                {players.length} người • {history.length} trận
              </span>
            </h3>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={handleArchiveCurrentSession}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                <Archive className="w-4 h-4" />
                <span>Lưu vào sổ các buổi đánh</span>
              </button>

              <button
                onClick={handleDownloadJson}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                <Download className="w-4 h-4" />
                <span>Tải JSON về máy</span>
              </button>

              <button
                onClick={handleCopyJson}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                {copiedJson ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedJson ? 'Đã sao chép!' : 'Sao chép JSON'}</span>
              </button>

              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                <Upload className="w-4 h-4" />
                <span>Nhập JSON</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
              <button
                onClick={() => setShowNewSessionModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                <RefreshCw className="w-4 h-4 text-emerald-400" />
                <span>Buổi mới (Giữ người chơi)</span>
              </button>

              <button
                onClick={() => {
                  setResetConfirmInput('');
                  setShowResetAllModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-semibold transition"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Xóa sạch toàn bộ (Reset All)</span>
              </button>

              {roomCode && (
                <button
                  type="button"
                  disabled={cleaningReceipts}
                  onClick={handleCleanupRoomReceipts}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-sky-300 rounded-xl text-xs font-semibold transition"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>{cleaningReceipts ? 'Đang dọn ảnh...' : 'Dọn ảnh biên lai cũ'}</span>
                </button>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* 6. SỔ LƯU TRỮ CÁC BUỔI ĐÁNH TRƯỚC (ARCHIVE) */}
          {/* ========================================================= */}
          <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Archive className="w-4 h-4 text-emerald-400" />
                <span>6. Sổ lưu trữ các buổi đánh trước</span>
              </h3>
              <span className="text-slate-400 font-mono">
                {archivedSessions.length}/20 buổi
              </span>
            </div>

            {archivedSessions.length === 0 ? (
              <div className="py-6 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                <p>Chưa có buổi đánh nào trong sổ lưu trữ.</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Bấm &quot;Lưu vào sổ các buổi đánh&quot; hoặc &quot;Buổi mới&quot; để lưu lại kết quả.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {archivedSessions.map((session) => {
                  const dateStr = new Date(session.createdAt).toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  });
                  const timeStr = new Date(session.createdAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={session.id}
                      className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-bold text-slate-200 text-xs">
                            {dateStr} lúc {timeStr}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>{session.totalPlayers} người</span>
                          <span>•</span>
                          <span>{session.totalGames} trận</span>
                          {session.totalCost > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-400 font-semibold">
                                {formatVND(session.totalCost)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleRestoreArchivedSession(session)}
                          title="Khôi phục buổi này vào ứng dụng"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Mở lại</span>
                        </button>

                        <button
                          onClick={() => handleDownloadArchivedJson(session)}
                          title="Tải tệp JSON của buổi này"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteArchivedSession(session.id)}
                          title="Xóa buổi này khỏi sổ lưu trữ"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Xóa toàn bộ sổ lưu trữ (2 bước) */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleClearAllArchive}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                      showClearArchiveConfirm
                        ? 'bg-rose-600 text-white border-rose-500 animate-pulse'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-rose-400'
                    }`}
                  >
                    {showClearArchiveConfirm
                      ? 'Bấm lần nữa để xác nhận XÓA TẤT CẢ'
                      : 'Xóa toàn bộ sổ lưu trữ'}
                  </button>
                </div>
              </div>
            )}
          </div>
            </>
          )}
        </div>
      )}

      {/* MODAL 1: Xác nhận Buổi mới (2 bước) */}
      {showNewSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 text-slate-100 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="font-bold text-base">Xác nhận bắt đầu buổi mới?</h4>
              <p className="text-xs text-slate-400">
                Toàn bộ lịch sử các trận đấu và số trận của từng người sẽ được reset về 0.
                Danh sách người chơi, giới tính và trình độ rank vẫn được giữ nguyên.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  vibrateSuccess();
                  onNewSessionKeepPlayers();
                  setShowNewSessionModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow"
              >
                Bắt đầu buổi mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Xác nhận Xóa sạch (Gõ XOA) */}
      {showResetAllModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-800/80 rounded-3xl w-full max-w-md p-5 text-slate-100 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="font-bold text-base text-rose-400">CẢNH BÁO: XÓA SẠCH DỮ LIỆU</h4>
              <p className="text-xs text-slate-300">
                Hành động này sẽ xóa vĩnh viễn toàn bộ người chơi, lịch sử và luật cặp trên thiết bị.
              </p>
              <p className="text-xs text-slate-400 pt-2">
                Để xác nhận, vui lòng gõ chữ <strong className="text-white">XOA</strong> vào ô bên dưới:
              </p>
            </div>
            <input
              type="text"
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value)}
              placeholder="Gõ XOA để xác nhận..."
              className="w-full bg-slate-950 text-slate-100 rounded-xl px-3 py-2 text-center text-sm font-bold border border-rose-700 focus:outline-none"
            />
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowResetAllModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                disabled={resetConfirmInput.trim().toUpperCase() !== 'XOA'}
                onClick={() => {
                  vibrateWarning();
                  onResetSession();
                  setShowResetAllModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold shadow"
              >
                Xác nhận xóa sạch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Nhập JSON */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 text-slate-100 shadow-2xl space-y-3">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-400" />
              <span>Nhập dữ liệu phiên (JSON)</span>
            </h3>
            <textarea
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Dán nội dung JSON đã sao lưu vào đây..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-slate-400 hover:bg-slate-800 rounded-xl text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  const res = onImportJson(importText);
                  if (res.ok) {
                    setShowImportModal(false);
                    setImportText('');
                    alert('Nhập dữ liệu thành công!');
                  } else {
                    alert(`Lỗi khi nhập: ${res.error}`);
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow"
              >
                Tải vào ứng dụng
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 4: QR Chuyển khoản & Nộp ảnh biên lai từng người */}
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

      {/* MODAL 5: Lightbox xem ảnh biên lai & Duyệt / Từ chối (kiểu Alobo) */}
      {reviewReceiptTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md text-slate-100 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="min-w-0">
                <h4 className="font-bold text-sm text-white truncate">
                  Biên lai — {reviewReceiptTarget.playerName}
                </h4>
                <p className="text-[11px] text-emerald-400 font-bold">
                  Cần đóng: {formatVND(reviewReceiptTarget.amount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewReceiptTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {reviewReceiptTarget.receiptUrl ? (
                <div className="bg-slate-950 rounded-2xl p-2 border border-slate-800 text-center">
                  <img
                    src={reviewReceiptTarget.receiptUrl}
                    alt={`Biên lai của ${reviewReceiptTarget.playerName}`}
                    className="max-h-80 w-auto mx-auto rounded-xl object-contain"
                  />
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center text-slate-400 flex flex-col items-center gap-1.5">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                  <span>Thành viên xác nhận không kèm ảnh biên lai.</span>
                </div>
              )}

              {!isViewer && reviewReceiptTarget.isPending && (
                <div className="space-y-3 pt-1 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      vibrateSuccess();
                      onToggleApprovePayment(reviewReceiptTarget.playerId);
                      setReviewReceiptTarget(null);
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm shadow transition"
                  >
                    Duyệt đã nhận đủ tiền ✓
                  </button>

                  <div className="p-3 rounded-2xl bg-rose-950/30 border border-rose-800/50 space-y-2">
                    <div className="font-bold text-rose-300 text-[11px]">
                      Hoặc từ chối (gửi lý do để thành viên nộp lại):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {['Ảnh mờ / khó đọc', 'Thiếu tiền', 'Chưa thấy tiền vào TK'].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setRejectReasonInput(chip)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition ${
                            rejectReasonInput === chip
                              ? 'bg-rose-600 text-white border-rose-500'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Nhập lý do khác (hoặc để trống)..."
                      value={rejectReasonInput}
                      onChange={(e) => setRejectReasonInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100"
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
                      className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition"
                    >
                      Từ chối &amp; Yêu cầu gửi lại
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
