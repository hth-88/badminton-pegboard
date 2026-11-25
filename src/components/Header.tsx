import React, { useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  Sun,
  Moon,
  Laptop,
  AlertTriangle,
  Flame,
  SlidersHorizontal,
  Download,
  Users,
  Cloud,
  Eye,
  Minus,
  Plus,
} from 'lucide-react';
import type { AutoSinglesMode, CourtMode, SessionSettings } from '../types/badminton';
import type { ThemeMode } from '../hooks/useTheme';
import type { RoomRole, SyncStatus } from '../hooks/useCloudRoom';
import { UiModal } from './ui/Primitives';

interface HeaderProps {
  activeCourtsCount: number;
  totalCourtsCount: number;
  courtMode: CourtMode;
  onToggleCourtMode: () => void;
  matchMix: { doubles: number; singles: number };
  onUpdateMatchMix: (doubles: number, singles: number) => void;
  autoSingles: AutoSinglesMode;
  onUpdateAutoSingles: (mode: AutoSinglesMode) => void;
  maleBonus: number;
  onUpdateMaleBonus: (bonus: number) => void;
  wakeLockActive: boolean;
  onToggleWakeLock: () => void;
  wakeLockSupported: boolean;
  theme: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  storageError: boolean;
  onExportJson: () => void;
  updateSettings: (settings: Partial<SessionSettings>) => void;
  promptPostMatchReview?: boolean;
  onTogglePromptPostMatchReview?: (enabled: boolean) => void;
  roomCode?: string | null;
  pinCode?: string | null;
  role?: RoomRole;
  syncStatus?: SyncStatus;
  onOpenCloudModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeCourtsCount,
  totalCourtsCount,
  courtMode,
  onToggleCourtMode,
  matchMix,
  onUpdateMatchMix,
  autoSingles,
  onUpdateAutoSingles,
  maleBonus,
  onUpdateMaleBonus,
  wakeLockActive,
  onToggleWakeLock,
  wakeLockSupported,
  theme,
  onSelectTheme,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  storageError,
  onExportJson,
  promptPostMatchReview = true,
  onTogglePromptPostMatchReview,
  roomCode = null,
  role = 'OFFLINE',
  syncStatus = 'OFFLINE',
  onOpenCloudModal,
}) => {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempMaleBonus, setTempMaleBonus] = useState(maleBonus);

  const isViewer = role === 'VIEWER';

  const isCurrentlyDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleQuickToggleTheme = () => {
    onSelectTheme(isCurrentlyDark ? 'light' : 'dark');
  };

  const getMixPreset = () => {
    if (matchMix.doubles === 1 && matchMix.singles === 0) return '100_0';
    if (matchMix.doubles === 0.7 && matchMix.singles === 0.3) return '70_30';
    if (matchMix.doubles === 0.5 && matchMix.singles === 0.5) return '50_50';
    if (matchMix.doubles === 0 && matchMix.singles === 1) return '0_100';
    return 'custom';
  };

  return (
    <header className="sticky top-0 z-30 ui-header">
      {/* Storage Warning Banner */}
      {storageError && !isViewer && (
        <div
          className="px-4 py-2 border-b ui-divider"
          style={{
            backgroundColor: 'var(--color-warning-soft)',
            color: 'var(--color-warning)',
          }}
        >
          <div className="ui-container flex items-center justify-between gap-3 text-[14px]">
            <div className="flex items-center gap-2 font-medium min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Bộ nhớ trình duyệt đầy, dữ liệu có thể không được lưu!
              </span>
            </div>
            <button
              type="button"
              onClick={onExportJson}
              className="ui-btn ui-btn-primary min-h-[36px] px-3 rounded-full text-[13px] shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất JSON</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Top Bar */}
      <div className="ui-container px-3 sm:px-4 md:px-6 py-2.5 flex items-center justify-between gap-2">
        {/* Brand & Court Count */}
        <div className="flex items-center gap-2.5 min-w-0 shrink">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
            }}
            aria-hidden="true"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 19 19 5" />
              <path d="M11 5h8v8" />
              <circle cx="7" cy="17" r="2.5" />
              <path d="M14.5 9.5 9.5 14.5" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1
              className="font-bold text-[15px] sm:text-[16px] tracking-[-0.02em] leading-tight whitespace-nowrap"
              style={{ color: 'var(--text-primary)' }}
            >
              Badminton
            </h1>
            <div
              className="flex items-center gap-1.5 mt-0.5 text-[12px] font-medium whitespace-nowrap"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--color-accent)' }}
              />
              <span className="tabular-nums">
                {activeCourtsCount}/{totalCourtsCount} sân
              </span>
              {!isViewer && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden sm:inline truncate tabular-nums">
                    {courtMode === 'SHARED_POOL' ? 'Chung bể' : 'Tách sân'} · Bù +
                    {maleBonus.toFixed(1)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Cloud Room Status Button */}
          {roomCode && role !== 'OFFLINE' ? (
            <button
              type="button"
              onClick={onOpenCloudModal}
              title={`Phòng ${roomCode} — ${role === 'CO_HOST' ? 'Quản trị' : 'Chỉ xem'} (${syncStatus})`}
              className={`ui-btn px-2.5 sm:px-3 rounded-full shrink-0 ${
                role === 'CO_HOST' ? 'ui-btn-accent-soft' : 'ui-btn-secondary'
              }`}
            >
              {role === 'CO_HOST' ? (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      syncStatus === 'SYNCING'
                        ? 'var(--color-warning)'
                        : syncStatus === 'ERROR'
                        ? 'var(--color-danger)'
                        : 'var(--color-accent)',
                  }}
                />
              ) : (
                <Eye
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--text-secondary)' }}
                />
              )}
              <span className="font-mono-tabular text-[13px] font-bold">
                {roomCode}
              </span>
              <span className="hidden md:inline text-[12px] font-medium opacity-80">
                {role === 'CO_HOST' ? 'Host' : 'Xem'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenCloudModal}
              title="Phòng Online Realtime (Đồng bộ nhiều điện thoại)"
              aria-label="Phòng Online"
              className="ui-btn ui-btn-secondary w-11 sm:w-auto px-0 sm:px-3 rounded-xl sm:rounded-full shrink-0"
            >
              <Cloud
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-accent)' }}
              />
              <span className="hidden sm:inline text-[13px]">Phòng Online</span>
            </button>
          )}

          {/* Undo / Redo (Host only) */}
          {!isViewer && (
            <>
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="Hoàn tác (Undo)"
                aria-label="Hoàn tác (Undo)"
                className="ui-icon-btn w-11 h-11"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                title="Làm lại (Redo)"
                aria-label="Làm lại (Redo)"
                className="hidden sm:inline-flex ui-icon-btn w-11 h-11"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Quick Light / Dark Toggle */}
          <button
            type="button"
            onClick={handleQuickToggleTheme}
            title={isCurrentlyDark ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
            aria-label={isCurrentlyDark ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
            className="ui-icon-btn w-11 h-11"
          >
            {isCurrentlyDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Screen Wake Lock (always on desktop & mobile VIEWER; mobile Host accesses via Settings to keep header clean) */}
          {wakeLockSupported && (
            <button
              type="button"
              onClick={onToggleWakeLock}
              title={wakeLockActive ? 'Màn hình luôn sáng: BẬT' : 'Màn hình luôn sáng: TẮT'}
              aria-label={wakeLockActive ? 'Màn hình luôn sáng: BẬT' : 'Màn hình luôn sáng: TẮT'}
              className={`ui-icon-btn w-11 h-11 ${isViewer ? 'inline-flex' : 'hidden sm:inline-flex'}`}
              style={
                wakeLockActive
                  ? {
                      backgroundColor: 'var(--color-warning-soft)',
                      color: 'var(--color-warning)',
                    }
                  : undefined
              }
            >
              <Flame className="w-4 h-4" />
            </button>
          )}

          {/* Host Settings Sheet Trigger (Host only) */}
          {!isViewer && (
            <button
              type="button"
              onClick={() => {
                setTempMaleBonus(maleBonus);
                setShowSettingsModal(true);
              }}
              title="Cài đặt xếp sân, tỷ lệ & giao diện"
              aria-label="Cài đặt xếp sân, tỷ lệ & giao diện"
              className="ui-icon-btn w-11 h-11"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Host Settings Modal */}
      <UiModal
        isOpen={!isViewer && showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        sheetOnMobile
        maxWidthClass="max-w-md"
        title="Cài đặt xếp sân & buổi chơi"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowSettingsModal(false)}
              className="ui-btn ui-btn-secondary px-4"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateMaleBonus(tempMaleBonus);
                setShowSettingsModal(false);
              }}
              className="ui-btn ui-btn-primary px-5 rounded-full"
            >
              Lưu cài đặt
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 1. Pool mode & Match mix */}
          <div className="ui-tile p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div
                  className="text-[14px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Chế độ bể người chơi
                </div>
                <div
                  className="text-[13px] mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Chung bể cho cả {totalCourtsCount} sân hoặc tách riêng từng sân
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleCourtMode}
                className="ui-btn ui-btn-accent-soft px-3.5 shrink-0"
              >
                <Users className="w-4 h-4" />
                <span>{courtMode === 'SHARED_POOL' ? 'Chung bể' : 'Tách sân'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t ui-divider">
              <div>
                <label
                  htmlFor="settings-match-mix"
                  className="block text-[13px] font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Tỷ lệ Đôi / Đơn
                </label>
                <select
                  id="settings-match-mix"
                  name="matchMix"
                  value={getMixPreset()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '100_0') onUpdateMatchMix(1, 0);
                    else if (val === '70_30') onUpdateMatchMix(0.7, 0.3);
                    else if (val === '50_50') onUpdateMatchMix(0.5, 0.5);
                    else if (val === '0_100') onUpdateMatchMix(0, 1);
                  }}
                  className="ui-select"
                >
                  <option value="100_0">100% Đôi</option>
                  <option value="70_30">70% Đôi - 30% Đơn</option>
                  <option value="50_50">50% Đôi - 50% Đơn</option>
                  <option value="0_100">100% Đơn</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="settings-auto-singles"
                  className="block text-[13px] font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Đơn khi ít người
                </label>
                <select
                  id="settings-auto-singles"
                  name="autoSingles"
                  value={autoSingles}
                  onChange={(e) => onUpdateAutoSingles(e.target.value as AutoSinglesMode)}
                  className="ui-select"
                >
                  <option value="OFF">Tắt</option>
                  <option value="ASK">Hỏi trước (ASK)</option>
                  <option value="AUTO">Tự động (AUTO)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. Male Bonus */}
          <div className="ui-tile p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <label
                  htmlFor="settings-male-bonus"
                  className="block text-[14px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Điểm bù Nam vs Nữ
                </label>
                <p
                  className="text-[13px] mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Mặc định +1.5 (Nam TB- ngang Nữ TB)
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setTempMaleBonus(Math.max(0, Number((tempMaleBonus - 0.5).toFixed(1))))
                  }
                  aria-label="Giảm điểm bù Nam"
                  className="ui-icon-btn w-11 h-11"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span
                  className="font-bold text-[15px] tabular-nums w-12 text-center"
                  style={{ color: 'var(--color-accent)' }}
                >
                  +{tempMaleBonus.toFixed(1)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setTempMaleBonus(Math.min(5, Number((tempMaleBonus + 0.5).toFixed(1))))
                  }
                  aria-label="Tăng điểm bù Nam"
                  className="ui-icon-btn w-11 h-11"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <input
              id="settings-male-bonus"
              name="maleBonus"
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={tempMaleBonus}
              onChange={(e) => setTempMaleBonus(parseFloat(e.target.value))}
              className="ui-range w-full"
            />

            <div className="flex items-center gap-1.5 flex-wrap">
              {[0, 1.0, 1.5, 2.0, 2.5, 3.0].map((preset) => {
                const active = Math.abs(tempMaleBonus - preset) < 0.01;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTempMaleBonus(preset)}
                    className={`min-w-[44px] min-h-[44px] px-3 rounded-xl text-[13px] font-semibold tabular-nums transition ${
                      active ? 'ui-btn-primary' : ''
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
                    +{preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wake Lock inside Settings for Mobile convenience */}
          {wakeLockSupported && (
            <div className="ui-tile p-4 flex items-center justify-between gap-3">
              <div>
                <div
                  className="text-[14px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Giữ màn hình luôn sáng
                </div>
                <p
                  className="text-[13px] mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Chống tắt màn hình điện thoại ngoài sân
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleWakeLock}
                className={`ui-btn px-4 shrink-0 ${
                  wakeLockActive ? 'ui-btn-warning-soft' : 'ui-btn-secondary'
                }`}
                style={
                  !wakeLockActive
                    ? { backgroundColor: 'var(--bg-surface)' }
                    : undefined
                }
              >
                <Flame className="w-4 h-4" />
                <span>{wakeLockActive ? 'Đang bật' : 'Đang tắt'}</span>
              </button>
            </div>
          )}

          {/* 3. Theme */}
          <div className="space-y-2">
            <label
              className="block text-[14px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Giao diện
            </label>
            <div className="ui-segmented-track grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'dark', label: 'Tối', icon: Moon },
                  { id: 'light', label: 'Sáng', icon: Sun },
                  { id: 'system', label: 'Hệ thống', icon: Laptop },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = theme === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTheme(item.id)}
                    className="min-h-[44px] px-2 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-1.5 transition"
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
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Post-match review prompt toggle */}
          {onTogglePromptPostMatchReview && (
            <label className="ui-tile p-4 flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div
                  className="text-[14px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Hỏi nhanh tỉ số &amp; nhận xét sau trận
                </div>
                <p
                  className="text-[13px] mt-0.5 leading-snug"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Nuôi dữ liệu phân tích trình độ. Trận có kèo độ luôn nhắc chốt đội thắng.
                </p>
              </div>
              <input
                type="checkbox"
                checked={promptPostMatchReview}
                onChange={(e) => onTogglePromptPostMatchReview(e.target.checked)}
                className="ui-checkbox w-5 h-5 shrink-0 cursor-pointer"
              />
            </label>
          )}
        </div>
      </UiModal>
    </header>
  );
};
