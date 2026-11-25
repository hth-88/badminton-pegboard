import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RotateCcw, X } from 'lucide-react';

interface ToastProps {
  message: string;
  durationMs?: number;
  onUndo: () => void;
  onClose: () => void;
}

export interface InfoToastProps {
  message: string;
  type?: 'info' | 'warning' | 'error';
  durationMs?: number;
  onClose: () => void;
}

export const InfoToast: React.FC<InfoToastProps> = ({
  message,
  type = 'warning',
  durationMs = 4500,
  onClose,
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onClose]);

  const accentColor =
    type === 'error'
      ? 'var(--color-danger)'
      : type === 'warning'
      ? 'var(--color-warning)'
      : 'var(--color-accent)';

  const borderColor =
    type === 'error'
      ? 'var(--color-danger-border)'
      : type === 'warning'
      ? 'var(--color-warning-border)'
      : 'var(--border-subtle)';

  return (
    <div
      role="status"
      className="fixed bottom-24 left-4 right-4 max-w-md mx-auto z-50"
    >
      <div
        className="ui-toast px-4 py-3 flex items-center justify-between gap-3"
        style={{ borderColor }}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {type === 'info' ? (
            <CheckCircle2
              className="w-5 h-5 shrink-0"
              style={{ color: accentColor }}
            />
          ) : (
            <AlertCircle
              className="w-5 h-5 shrink-0"
              style={{ color: accentColor }}
            />
          )}
          <p
            className="text-[14px] font-medium leading-snug"
            style={{ color: 'var(--text-primary)' }}
          >
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="ui-icon-btn w-10 h-10 min-w-0 min-h-0 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const UndoToast: React.FC<ToastProps> = ({
  message,
  durationMs = 6000,
  onUndo,
  onClose,
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onClose();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [durationMs, onClose]);

  return (
    <div
      role="status"
      className="fixed bottom-24 left-4 right-4 max-w-md mx-auto z-50"
    >
      <div className="ui-toast overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p
              className="text-[14px] font-semibold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {message}
            </p>
            <p
              className="text-[12px] mt-0.5 tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              Hoàn tác trong {Math.ceil((progress / 100) * (durationMs / 1000))}s
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onUndo();
                onClose();
              }}
              className="ui-btn ui-btn-primary min-h-[40px] px-3.5 rounded-full text-[13px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Hoàn tác</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng thông báo"
              className="ui-icon-btn w-10 h-10 min-w-0 min-h-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          className="h-1 w-full"
          style={{ backgroundColor: 'var(--bg-surface-secondary)' }}
        >
          <div
            className="h-full transition-all duration-75"
            style={{
              width: `${progress}%`,
              backgroundColor: 'var(--color-accent)',
            }}
          />
        </div>
      </div>
    </div>
  );
};
