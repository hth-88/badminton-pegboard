import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { BadmintonRank, Sex } from '../../types/badminton';
import { RANK_METADATA } from '../../engine/skillConfig';

/**
 * Simplified gender indicator: a crisp 8px circle dot with accessible label.
 * Avoids uneven widths and loud multi-color blocks.
 */
export const GenderDot: React.FC<{
  sex: Sex;
  className?: string;
}> = ({ sex, className = '' }) => (
  <span
    className={`ui-gender-dot ${
      sex === 'M' ? 'ui-gender-dot-m' : 'ui-gender-dot-f'
    } ${className}`}
    title={sex === 'M' ? 'Nam' : 'Nữ'}
    aria-label={sex === 'M' ? 'Nam' : 'Nữ'}
  />
);

/**
 * Uniform fixed-width, fixed-height gender label/toggle button.
 * Always keeps identical dimensions for "Nam" and "Nữ".
 */
export const GenderToggleButton: React.FC<{
  sex: Sex;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}> = ({ sex, onClick, disabled, title, className = '' }) => {
  const label = sex === 'M' ? 'Nam' : 'Nữ';
  if (!onClick) {
    return (
      <span
        className={`inline-flex items-center justify-center gap-1.5 w-[74px] h-[32px] rounded-full text-[13px] font-semibold shrink-0 ${className}`}
        style={{
          backgroundColor: 'var(--bg-surface-secondary)',
          color: 'var(--text-secondary)',
        }}
      >
        <GenderDot sex={sex} />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || `Giới tính: ${label}`}
      aria-label={title || `Giới tính: ${label}`}
      className={`ui-btn ui-btn-secondary w-[76px] px-0 shrink-0 ${className}`}
    >
      <GenderDot sex={sex} />
      <span>{label}</span>
    </button>
  );
};

/**
 * Uniform rank badge across the entire application.
 * Fixed width (58px) and fixed height (24px) in compact mode so badges never
 * shift surrounding elements regardless of label length ("Y" vs "TBY+" vs "Newbie").
 */
export const RankBadge: React.FC<{
  rank: BadmintonRank;
  surface?: 'card' | 'tile';
  className?: string;
}> = ({ rank, surface = 'tile', className = '' }) => {
  const meta = RANK_METADATA[rank];
  return (
    <span
      className={`ui-rank-badge ${
        surface === 'card' ? 'ui-rank-badge-muted' : ''
      } ${className}`}
      title={`${meta.code} — ${meta.name}`}
    >
      {meta.code}
    </span>
  );
};

/**
 * Uniform semantic status pill.
 */
export const StatusPill: React.FC<{
  tone?: 'neutral' | 'accent' | 'warning' | 'danger';
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'neutral', children, className = '' }) => {
  const toneClass =
    tone === 'accent'
      ? 'ui-pill-accent'
      : tone === 'warning'
      ? 'ui-pill-warning'
      : tone === 'danger'
      ? 'ui-pill-danger'
      : 'ui-pill-neutral';

  return <span className={`ui-pill ${toneClass} ${className}`}>{children}</span>;
};

/**
 * Shared minimalist Modal / Sheet wrapper.
 * Supports centered desktop modal or mobile bottom sheet with consistent header & backdrop.
 */
export const UiModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerRight?: React.ReactNode;
  maxWidthClass?: string;
  sheetOnMobile?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  headerRight,
  maxWidthClass = 'max-w-lg',
  sheetOnMobile = false,
  children,
  footer,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 z-50 ui-modal-backdrop flex justify-center ${
        sheetOnMobile
          ? 'items-end sm:items-center p-0 sm:p-4'
          : 'items-center p-3 sm:p-4'
      }`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxWidthClass} flex flex-col max-h-[85vh] max-h-[85dvh] overflow-hidden ${
          sheetOnMobile
            ? 'ui-sheet-panel sm:rounded-[28px] sm:border'
            : 'ui-modal-panel'
        }`}
      >
        {sheetOnMobile && (
          <div
            className="sm:hidden w-10 h-1 rounded-full mx-auto mt-3 shrink-0"
            style={{ backgroundColor: 'var(--border-strong)' }}
            aria-hidden="true"
          />
        )}

        <div
          className="px-5 py-4 border-b ui-divider flex items-center justify-between gap-3 shrink-0"
        >
          <div className="min-w-0 flex-1">
            <h3
              className="font-bold text-[17px] tracking-[-0.02em] leading-snug truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                className="text-[13px] mt-0.5 truncate"
                style={{ color: 'var(--text-secondary)' }}
              >
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="ui-icon-btn w-11 h-11"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>

        {footer && (
          <div className="px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t ui-divider shrink-0 flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

/**
 * Shared Empty State container with generous whitespace and clear hierarchy.
 */
export const UiEmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, action, className = '' }) => (
  <div
    className={`ui-card px-6 py-10 text-center flex flex-col items-center justify-center gap-2.5 ${className}`}
  >
    <div
      className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1"
      style={{
        backgroundColor: 'var(--bg-surface-secondary)',
        color: 'var(--text-muted)',
      }}
      aria-hidden="true"
    >
      {icon}
    </div>
    <p
      className="text-[15px] font-semibold"
      style={{ color: 'var(--text-primary)' }}
    >
      {title}
    </p>
    {description && (
      <p
        className="text-[14px] max-w-sm leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        {description}
      </p>
    )}
    {action && <div className="mt-2">{action}</div>}
  </div>
);
