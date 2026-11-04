import React, { useEffect, useState } from 'react';
import { AlertCircle, RotateCcw, X } from 'lucide-react';

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

  return (
    <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div
        className={`border rounded-2xl shadow-2xl p-3.5 flex items-center justify-between gap-3 text-slate-100 ${
          type === 'warning'
            ? 'bg-amber-950/95 border-amber-500/80 text-amber-100'
            : type === 'error'
              ? 'bg-rose-950/95 border-rose-500/80 text-rose-100'
              : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-xs font-semibold leading-relaxed">{message}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition shrink-0"
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
    <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-3.5 flex items-center justify-between gap-3 text-slate-100">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate text-slate-100">{message}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Bấm Hoàn tác trong {Math.ceil((progress / 100) * (durationMs / 1000))}s
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              onUndo();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Hoàn tác</span>
          </button>
          <button
            onClick={onClose}
            aria-label="Đóng thông báo"
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-slate-800 rounded-b-2xl overflow-hidden -mt-1 mx-1">
        <div
          className="h-full bg-emerald-500 transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

