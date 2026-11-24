import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  QrCode,
  Copy,
  Check,
  Download,
  Camera,
  Send,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import {
  formatVND,
  type PlayerPaymentRecord,
  type SettlementSettings,
} from '../engine/settlement';
import {
  buildPlayerTransferNote,
  buildVietQrUrl,
  resolveBankOption,
} from '../engine/vietqr';
import { compressReceiptImage } from '../utils/imageCompress';
import { uploadPaymentReceipt } from '../services/supabaseSync';
import { vibrateSuccess, vibrateWarning } from '../utils/vibrate';

export interface PaymentQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  amount: number;
  settings: SettlementSettings;
  paymentRecord?: PlayerPaymentRecord;
  roomCode: string | null;
  isViewer: boolean;
  onReportPayment: (
    playerId: string,
    options?: { receiptUrl?: string; receiptPath?: string }
  ) => Promise<{ ok: boolean; error?: string }>;
}

export const PaymentQrModal: React.FC<PaymentQrModalProps> = ({
  isOpen,
  onClose,
  playerId,
  playerName,
  amount,
  settings,
  paymentRecord,
  roomCode,
  isViewer,
  onReportPayment,
}) => {
  const [copiedStk, setCopiedStk] = useState(false);
  const [copiedNote, setCopiedNote] = useState(false);

  const [selectedBlob, setSelectedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedBlob(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setUploadError(null);
      setCompressing(false);
      setSubmitting(false);
    }
  }, [isOpen, playerId]);

  const bankOption = useMemo(
    () => resolveBankOption(settings.bankCode, settings.bankName),
    [settings.bankCode, settings.bankName]
  );

  const transferNote = useMemo(
    () => buildPlayerTransferNote(settings.bankNote, playerName),
    [settings.bankNote, playerName]
  );

  const qrUrl = useMemo(
    () =>
      buildVietQrUrl({
        bankCode: settings.bankCode,
        bankName: settings.bankName,
        bankAccount: settings.bankAccount,
        bankAccountHolder: settings.bankAccountHolder,
        amount,
        addInfo: transferNote,
      }),
    [
      settings.bankCode,
      settings.bankName,
      settings.bankAccount,
      settings.bankAccountHolder,
      amount,
      transferNote,
    ]
  );

  if (!isOpen) return null;

  const handleCopyText = async (text: string, type: 'STK' | 'NOTE') => {
    if (!text) return;
    vibrateSuccess();
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'STK') {
        setCopiedStk(true);
        setTimeout(() => setCopiedStk(false), 2000);
      } else {
        setCopiedNote(true);
        setTimeout(() => setCopiedNote(false), 2000);
      }
    } catch {
      alert('Không thể sao chép tự động.');
    }
  };

  const handleDownloadQr = async () => {
    if (!qrUrl) return;
    vibrateSuccess();
    try {
      const response = await fetch(qrUrl);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VietQR_${playerName.replace(/\s+/g, '_')}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(qrUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setCompressing(true);
    try {
      const compressed = await compressReceiptImage(file);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setSelectedBlob(compressed);
      setPreviewUrl(URL.createObjectURL(compressed));
      vibrateSuccess();
    } catch (err: any) {
      vibrateWarning();
      setUploadError(err?.message || 'Không thể xử lý ảnh này.');
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmitWithOptionalReceipt = async (forceNoImage = false) => {
    if (!roomCode) return;
    setUploadError(null);
    setSubmitting(true);
    try {
      if (!forceNoImage && selectedBlob) {
        const upRes = await uploadPaymentReceipt(roomCode, playerId, selectedBlob);
        if (upRes.error || !upRes.url) {
          vibrateWarning();
          setUploadError(
            `Không tải được ảnh lên Storage (${upRes.error || 'Chưa cấu hình bucket'}). Bạn có thể bấm "Gửi báo không kèm ảnh" bên dưới.`
          );
          setSubmitting(false);
          return;
        }
        const rep = await onReportPayment(playerId, {
          receiptUrl: upRes.url,
          receiptPath: upRes.path || undefined,
        });
        if (rep.ok) {
          vibrateSuccess();
          onClose();
        } else {
          vibrateWarning();
          setUploadError(rep.error || 'Không thể gửi xác nhận.');
        }
      } else {
        const rep = await onReportPayment(playerId);
        if (rep.ok) {
          vibrateSuccess();
          onClose();
        } else {
          vibrateWarning();
          setUploadError(rep.error || 'Không thể gửi xác nhận.');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canUploadReceipt = Boolean(roomCode) && paymentRecord?.status !== 'PAID';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md text-slate-100 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-white truncate">
                Chuyển khoản — {playerName}
              </h3>
              <p className="text-[11px] text-emerald-400 font-bold">
                Số tiền: {formatVND(amount)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Rejection Banner */}
          {paymentRecord?.status === 'REJECTED' && (
            <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-700/70 text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-rose-300">Chủ sân đã từ chối lần báo trước</div>
                {paymentRecord.rejectionReason && (
                  <p className="text-[11px] text-rose-200 mt-0.5">
                    Lý do: <strong>{paymentRecord.rejectionReason}</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* VietQR Box */}
          {qrUrl ? (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 text-center">
              <div className="bg-white rounded-2xl p-3 inline-block mx-auto shadow-lg">
                <img
                  src={qrUrl}
                  alt={`VietQR cho ${playerName}`}
                  className="w-52 h-auto max-h-64 object-contain mx-auto"
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCopyText(settings.bankAccount, 'STK')}
                  className="py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center justify-center gap-1 transition"
                >
                  {copiedStk ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedStk ? 'Đã chép STK' : 'Chép STK'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyText(transferNote, 'NOTE')}
                  className="py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center justify-center gap-1 transition"
                >
                  {copiedNote ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedNote ? 'Đã chép ND' : 'Chép nội dung'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="py-2 px-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-600/40 font-semibold flex items-center justify-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải ảnh QR</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
              <p className="text-slate-400">
                {isViewer
                  ? 'Chủ sân chưa chọn ngân hàng chuẩn VietQR hoặc chưa điền số tài khoản.'
                  : 'Hãy chọn ngân hàng chuẩn VietQR và nhập Số tài khoản ở Mục 4 để tự động tạo mã QR.'}
              </p>
              {settings.bankAccount && (
                <button
                  type="button"
                  onClick={() => handleCopyText(settings.bankAccount, 'STK')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold"
                >
                  {copiedStk ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedStk ? 'Đã chép STK!' : `Sao chép STK: ${settings.bankAccount}`}</span>
                </button>
              )}
            </div>
          )}

          {/* Chi tiết TK rút gọn */}
          {(bankOption || settings.bankName || settings.bankAccount) && (
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Ngân hàng:</span>
                <span className="font-bold text-slate-200">
                  {bankOption?.shortName || settings.bankName || '-'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Số tài khoản:</span>
                <span className="font-mono font-bold text-emerald-300">
                  {settings.bankAccount || '-'}
                </span>
              </div>
              {settings.bankAccountHolder && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Chủ TK:</span>
                  <span className="font-bold text-slate-200 uppercase">
                    {settings.bankAccountHolder}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Nội dung CK:</span>
                <span className="font-semibold text-amber-300">{transferNote}</span>
              </div>
            </div>
          )}

          {/* Nộp ảnh biên lai kiểu Alobo khi Online */}
          {canUploadReceipt && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-sky-800/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sky-300 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4" />
                  <span>Gửi xác nhận &amp; Ảnh biên lai (kiểu Alobo)</span>
                </span>
              </div>

              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={compressing || submitting}
                  className="hidden"
                />
                <div className="w-full py-2.5 px-3 rounded-xl border border-dashed border-sky-700/70 bg-sky-950/30 hover:bg-sky-950/50 text-sky-200 text-center font-semibold flex items-center justify-center gap-2 transition">
                  {compressing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang nén ảnh nhẹ cho mạng 4G...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>
                        {selectedBlob
                          ? 'Đổi ảnh biên lai khác'
                          : '📷 Chọn ảnh chụp biên lai (Tự nén nhẹ ~70KB)'}
                      </span>
                    </>
                  )}
                </div>
              </label>

              {previewUrl && selectedBlob && (
                <div className="space-y-1.5 text-center">
                  <img
                    src={previewUrl}
                    alt="Xem trước biên lai"
                    className="max-h-44 rounded-xl mx-auto border border-slate-700 object-contain"
                  />
                  <div className="text-[11px] text-emerald-400 font-semibold">
                    Đã nén gọn: {Math.max(1, Math.round(selectedBlob.size / 1024))} KB
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-700/60 text-rose-200 text-[11px] space-y-2">
                  <p>{uploadError}</p>
                  {selectedBlob && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleSubmitWithOptionalReceipt(true)}
                      className="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition"
                    >
                      Gửi báo không kèm ảnh
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={submitting || compressing}
                  onClick={() => handleSubmitWithOptionalReceipt(false)}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold shadow flex items-center justify-center gap-2 transition"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang gửi xác nhận...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>
                        {selectedBlob
                          ? 'Gửi xác nhận + Ảnh biên lai'
                          : 'Tôi đã chuyển (Không cần ảnh)'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
