import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { UiModal } from './ui/Primitives';

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
  const [showQrZoomHint, setShowQrZoomHint] = useState(false);

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

  const currentResetKey = `${isOpen}_${playerId}`;
  const [prevResetKey, setPrevResetKey] = useState(currentResetKey);
  if (currentResetKey !== prevResetKey) {
    setPrevResetKey(currentResetKey);
    if (!isOpen) {
      setSelectedBlob(null);
      setPreviewUrl(null);
      setUploadError(null);
      setCompressing(false);
      setSubmitting(false);
      setShowQrZoomHint(false);
    }
  }

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
    const fileName = `VietQR_${playerName.replace(/\s+/g, '_')}.png`;
    try {
      const response = await fetch(qrUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: blob.type || 'image/png' });

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] }) &&
        typeof navigator.share === 'function'
      ) {
        try {
          await navigator.share({ files: [file], title: `VietQR - ${playerName}` });
          return;
        } catch (shareErr: unknown) {
          if (shareErr instanceof Error && shareErr.name === 'AbortError') {
            return;
          }
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setShowQrZoomHint(true);
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
    } catch (err: unknown) {
      vibrateWarning();
      const msg = err instanceof Error ? err.message : 'Không thể xử lý ảnh này.';
      setUploadError(msg);
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmitWithOptionalReceipt = async (forceNoImage = false) => {
    if (!roomCode) {
      vibrateWarning();
      setUploadError('Chưa bật Phòng Online nên không thể gửi xác nhận lên máy chủ.');
      return;
    }
    setUploadError(null);
    setSubmitting(true);
    try {
      if (!forceNoImage && selectedBlob) {
        const upRes = await uploadPaymentReceipt(roomCode, playerId, selectedBlob);
        if (upRes.error || !upRes.url) {
          vibrateWarning();
          const detail = upRes.error ? ` (${upRes.error})` : '';
          setUploadError(
            `Không thể tải ảnh biên lai lúc này${detail}. Bạn có thể bấm "Xác nhận không kèm ảnh" bên dưới.`
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
    <UiModal
      isOpen={isOpen}
      onClose={onClose}
      sheetOnMobile
      maxWidthClass="max-w-md"
      title={`Chuyển khoản · ${playerName}`}
      subtitle={
        <span
          className="font-bold tabular-nums"
          style={{ color: 'var(--color-accent)' }}
        >
          Số tiền: {formatVND(amount)}
        </span>
      }
    >
      <div className="space-y-4">
        {/* Rejection Banner */}
        {paymentRecord?.status === 'REJECTED' && (
          <div className="ui-banner-danger p-3.5 flex items-start gap-2.5 text-[14px]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">
                Chủ sân đã từ chối lần báo trước
              </div>
              {paymentRecord.rejectionReason && (
                <p className="text-[13px] mt-0.5">
                  Lý do: <strong>{paymentRecord.rejectionReason}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {/* VietQR Box */}
        {qrUrl ? (
          <div className="ui-tile p-4 space-y-3.5 text-center">
            <div className="ui-qr-frame p-3 inline-block mx-auto border ui-divider">
              <img
                src={qrUrl}
                alt={`VietQR cho ${playerName}`}
                className={
                  showQrZoomHint
                    ? 'w-64 h-auto max-h-80 object-contain mx-auto'
                    : 'w-52 h-auto max-h-64 object-contain mx-auto'
                }
              />
            </div>

            {showQrZoomHint && (
              <div
                className="text-[13px] font-medium px-3 py-2 rounded-xl border"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--color-accent)',
                  color: 'var(--text-primary)',
                }}
              >
                Nhấn giữ vào ảnh QR bên trên để <strong>Lưu về máy</strong> (hoặc chụp màn hình).
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleCopyText(settings.bankAccount, 'STK')}
                className="ui-btn ui-btn-secondary px-2 text-[13px]"
                style={{ backgroundColor: 'var(--bg-surface)' }}
              >
                {copiedStk ? (
                  <Check
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--color-accent)' }}
                  />
                ) : (
                  <Copy className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">{copiedStk ? 'Đã chép' : 'STK'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopyText(transferNote, 'NOTE')}
                className="ui-btn ui-btn-secondary px-2 text-[13px]"
                style={{ backgroundColor: 'var(--bg-surface)' }}
              >
                {copiedNote ? (
                  <Check
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--color-accent)' }}
                  />
                ) : (
                  <Copy className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">{copiedNote ? 'Đã chép' : 'Nội dung'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadQr}
                className="ui-btn ui-btn-accent-soft px-2 text-[13px]"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span className="truncate">Tải QR</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="ui-tile p-5 text-center space-y-3 text-[14px]">
            <p style={{ color: 'var(--text-secondary)' }}>
              {isViewer
                ? 'Chủ sân chưa chọn ngân hàng chuẩn VietQR hoặc chưa điền số tài khoản.'
                : 'Hãy chọn ngân hàng chuẩn VietQR và nhập Số tài khoản ở Mục 4 để tạo mã QR tự động.'}
            </p>
            {settings.bankAccount && (
              <button
                type="button"
                onClick={() => handleCopyText(settings.bankAccount, 'STK')}
                className="ui-btn ui-btn-accent-soft px-4 rounded-full"
              >
                {copiedStk ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>
                  {copiedStk ? 'Đã chép STK!' : `Sao chép STK: ${settings.bankAccount}`}
                </span>
              </button>
            )}
          </div>
        )}

        {/* Bank Account Details */}
        {(bankOption || settings.bankName || settings.bankAccount) && (
          <div className="ui-tile p-4 space-y-2 text-[14px]">
            <div className="flex justify-between gap-2">
              <span style={{ color: 'var(--text-secondary)' }}>Ngân hàng</span>
              <span
                className="font-semibold text-right"
                style={{ color: 'var(--text-primary)' }}
              >
                {bankOption?.shortName || settings.bankName || '-'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span style={{ color: 'var(--text-secondary)' }}>Số tài khoản</span>
              <span
                className="font-mono-tabular font-bold text-right"
                style={{ color: 'var(--color-accent)' }}
              >
                {settings.bankAccount || '-'}
              </span>
            </div>
            {settings.bankAccountHolder && (
              <div className="flex justify-between gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>Chủ TK</span>
                <span
                  className="font-semibold uppercase text-right"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {settings.bankAccountHolder}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span style={{ color: 'var(--text-secondary)' }}>Nội dung CK</span>
              <span
                className="font-semibold text-right"
                style={{ color: 'var(--text-primary)' }}
              >
                {transferNote}
              </span>
            </div>
          </div>
        )}

        {/* Receipt Upload & Report */}
        {canUploadReceipt && (
          <div className="ui-tile p-4 space-y-3">
            <div
              className="font-bold text-[14px] flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <ImageIcon
                className="w-4 h-4"
                style={{ color: 'var(--color-accent)' }}
              />
              <span>Xác nhận chuyển khoản</span>
            </div>

            <label className="block cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={compressing || submitting}
                className="hidden"
              />
              <div className="ui-tile-dashed min-h-[48px] px-4 py-2.5 text-[14px] font-medium flex items-center justify-center gap-2">
                {compressing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang xử lý ảnh...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>
                      {selectedBlob
                        ? 'Đổi ảnh biên lai khác'
                        : 'Đính kèm ảnh biên lai (tùy chọn)'}
                    </span>
                  </>
                )}
              </div>
            </label>

            {previewUrl && selectedBlob && (
              <div className="space-y-2 text-center">
                <img
                  src={previewUrl}
                  alt="Xem trước biên lai"
                  className="max-h-44 rounded-xl mx-auto border ui-divider object-contain"
                />
                <div
                  className="text-[13px] font-semibold"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Đã chọn ảnh biên lai
                </div>
              </div>
            )}

            {uploadError && (
              <div className="ui-banner-danger p-3 text-[13px] space-y-2">
                <p>{uploadError}</p>
                {selectedBlob && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSubmitWithOptionalReceipt(true)}
                    className="ui-btn ui-btn-warning-soft w-full"
                  >
                    Xác nhận không kèm ảnh
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={submitting || compressing}
              onClick={() => handleSubmitWithOptionalReceipt(false)}
              className="ui-btn ui-btn-primary w-full rounded-full"
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
                    {selectedBlob ? 'Gửi biên lai & Xác nhận' : 'Xác nhận đã chuyển'}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </UiModal>
  );
};
