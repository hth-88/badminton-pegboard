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
  X,
} from 'lucide-react';
import type { AutoSinglesMode, CourtMode, SessionSettings } from '../types/badminton';
import type { ThemeMode } from '../hooks/useTheme';
import type { RoomRole, SyncStatus } from '../hooks/useCloudRoom';

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
  // Cloud Room props
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

  const isCurrentlyDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleQuickToggleTheme = () => {
    onSelectTheme(isCurrentlyDark ? 'light' : 'dark');
  };

  // Preset matchMix
  const getMixPreset = () => {
    if (matchMix.doubles === 1 && matchMix.singles === 0) return '100_0';
    if (matchMix.doubles === 0.7 && matchMix.singles === 0.3) return '70_30';
    if (matchMix.doubles === 0.5 && matchMix.singles === 0.5) return '50_50';
    if (matchMix.doubles === 0 && matchMix.singles === 1) return '0_100';
    return 'custom';
  };

  return (
    <header className="sticky top-0 z-30 vo-header">
      {/* Banner cảnh báo lỗi bộ nhớ */}
      {storageError && (
        <div className="bg-amber-500/15 border-b border-amber-500/35 px-3 py-2 text-xs md:text-sm text-amber-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Bộ nhớ trình duyệt đầy, dữ liệu có thể không được lưu!</span>
          </div>
          <button
            type="button"
            onClick={onExportJson}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất JSON</span>
          </button>
        </div>
      )}

      {/* Compact Main Top Bar */}
      <div className="max-w-7xl mx-auto px-3.5 md:px-6 py-2.5 flex items-center justify-between gap-2">
        {/* Brand & Sân Active */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background:
                'linear-gradient(145deg, rgba(196, 242, 89, 0.20) 0%, rgba(196, 242, 89, 0.05) 100%)',
              border: '1px solid var(--accent-lime-border)',
              color: 'var(--accent-lime)',
              boxShadow: 'inset 0 1px 0 var(--specular-lime)',
            }}
            aria-hidden="true"
          >
            <svg
              width="18"
              height="18"
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
              className="font-bold text-[15px] tracking-[-0.025em] leading-tight truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              Badminton
            </h1>
            <div
              className="flex items-center gap-1.5 mt-0.5 text-[11px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  background: 'var(--accent-lime)',
                  boxShadow: '0 0 8px var(--accent-lime)',
                }}
              />
              <span className="truncate font-mono-tabular">
                {activeCourtsCount}/{totalCourtsCount} sân
              </span>
              <span className="hidden sm:inline opacity-45">•</span>
              <span className="hidden sm:inline truncate">
                {courtMode === 'SHARED_POOL' ? 'Chung bể' : 'Tách sân'} • Bù +{maleBonus.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions (Cloud Room, Undo, Redo, Theme, Wake, Settings) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Nút Trạng Thái Phòng Cloud Realtime */}
          {roomCode && role !== 'OFFLINE' ? (
            <button
              type="button"
              onClick={onOpenCloudModal}
              title={`Phòng ${roomCode} - ${role === 'CO_HOST' ? 'Co-Host (Toàn quyền)' : 'Chỉ xem'} (${syncStatus})`}
              className="flex items-center gap-1.5 px-2.5 h-9 rounded-xl font-bold text-xs transition shrink-0"
              style={
                role === 'CO_HOST'
                  ? {
                      background: 'var(--accent-lime-soft)',
                      border: '1px solid var(--accent-lime-border)',
                      color: 'var(--accent-lime)',
                    }
                  : {
                      background: 'rgba(99, 102, 241, 0.14)',
                      border: '1px solid rgba(129, 140, 248, 0.35)',
                      color: '#A5B4FC',
                    }
              }
            >
              {role === 'CO_HOST' ? (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    syncStatus === 'SYNCING'
                      ? 'bg-amber-400 animate-ping'
                      : syncStatus === 'ERROR'
                      ? 'bg-rose-500'
                      : 'animate-pulse'
                  }`}
                  style={
                    syncStatus !== 'SYNCING' && syncStatus !== 'ERROR'
                      ? { background: 'var(--accent-lime)' }
                      : undefined
                  }
                />
              ) : (
                <Eye className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="font-mono-tabular">{roomCode}</span>
              <span className="hidden md:inline text-[10px] font-medium opacity-80">
                ({role === 'CO_HOST' ? 'Host' : 'Xem'})
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenCloudModal}
              title="Phòng Online Realtime (Đồng bộ nhiều điện thoại)"
              className="vo-btn-subtle flex items-center gap-1.5 px-2.5 h-9 rounded-xl font-semibold text-xs shrink-0"
            >
              <Cloud className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-lime)' }} />
              <span className="hidden sm:inline">Phòng Online</span>
            </button>
          )}

          {/* Undo / Redo */}
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Hoàn tác (Undo)"
            aria-label="Hoàn tác (Undo)"
            className="vo-btn-subtle w-9 h-9 rounded-xl disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Làm lại (Redo)"
            aria-label="Làm lại (Redo)"
            className="hidden sm:flex vo-btn-subtle w-9 h-9 rounded-xl disabled:opacity-30 disabled:pointer-events-none items-center justify-center"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Quick Theme Toggle (Dark <-> Light) */}
          <button
            type="button"
            onClick={handleQuickToggleTheme}
            title={isCurrentlyDark ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
            aria-label={isCurrentlyDark ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
            className="vo-btn-subtle w-9 h-9 rounded-xl flex items-center justify-center"
          >
            {isCurrentlyDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Screen Wake Lock */}
          {wakeLockSupported && (
            <button
              type="button"
              onClick={onToggleWakeLock}
              title={wakeLockActive ? 'Màn hình luôn sáng: BẬT' : 'Màn hình luôn sáng: TẮT'}
              aria-label={wakeLockActive ? 'Màn hình luôn sáng: BẬT' : 'Màn hình luôn sáng: TẮT'}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition vo-btn-subtle"
              style={
                wakeLockActive
                  ? {
                      background: 'var(--amber-soft)',
                      borderColor: 'var(--amber-border)',
                      color: 'var(--amber)',
                    }
                  : undefined
              }
            >
              <Flame className="w-4 h-4" />
            </button>
          )}

          {/* Settings Sheet Button (Contains Quick Settings + Rules + Theme) */}
          <button
            type="button"
            onClick={() => {
              setTempMaleBonus(maleBonus);
              setShowSettingsModal(true);
            }}
            title="Cài đặt xếp sân, tỷ lệ & giao diện"
            aria-label="Cài đặt xếp sân, tỷ lệ & giao diện"
            className="relative vo-btn-subtle w-9 h-9 rounded-xl flex items-center justify-center"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span
              className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--accent-lime)' }}
            />
          </button>
        </div>
      </div>

      {/* Settings Bottom Sheet / Modal (Includes Quick Settings moved cleanly out of top ribbon) */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="vo-glass-card rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 max-h-[88vh] overflow-y-auto shadow-2xl"
            style={{ background: 'var(--bg-card-solid)' }}
          >
            <div className="sm:hidden w-10 h-1 rounded-full mx-auto mb-3 opacity-30 bg-current" />
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-base font-bold flex items-center gap-2 tracking-[-0.02em]"
                style={{ color: 'var(--text-primary)' }}
              >
                <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--accent-lime)' }} />
                <span>Cài đặt xếp sân &amp; buổi chơi</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="vo-btn-subtle w-8 h-8 rounded-lg flex items-center justify-center"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-sm">
              {/* 1. Chế độ bể + Tỷ lệ Đôi/Đơn + Auto Singles */}
              <div className="vo-stage rounded-2xl p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
                      Chế độ bể người chơi
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Chung bể cho cả 3 sân hoặc tách riêng từng sân
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleCourtMode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition"
                    style={{
                      background: 'var(--accent-lime-soft)',
                      border: '1px solid var(--accent-lime-border)',
                      color: 'var(--accent-lime)',
                    }}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{courtMode === 'SHARED_POOL' ? 'Chung bể' : 'Tách sân'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                  <div>
                    <label
                      className="block text-[11px] font-medium mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Tỷ lệ Đôi / Đơn
                    </label>
                    <select
                      value={getMixPreset()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '100_0') onUpdateMatchMix(1, 0);
                        else if (val === '70_30') onUpdateMatchMix(0.7, 0.3);
                        else if (val === '50_50') onUpdateMatchMix(0.5, 0.5);
                        else if (val === '0_100') onUpdateMatchMix(0, 1);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-2.5 py-2 text-xs font-semibold focus:outline-none"
                    >
                      <option value="100_0">100% Đôi</option>
                      <option value="70_30">70% Đôi - 30% Đơn</option>
                      <option value="50_50">50% Đôi - 50% Đơn</option>
                      <option value="0_100">100% Đơn</option>
                    </select>
                  </div>

                  <div>
                    <label
                      className="block text-[11px] font-medium mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Đơn khi ít người
                    </label>
                    <select
                      value={autoSingles}
                      onChange={(e) => onUpdateAutoSingles(e.target.value as AutoSinglesMode)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-2.5 py-2 text-xs font-semibold focus:outline-none"
                    >
                      <option value="OFF">Tắt</option>
                      <option value="ASK">Hỏi trước (ASK)</option>
                      <option value="AUTO">Tự động (AUTO)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Bù trừ điểm Nam/Nữ */}
              <div className="vo-stage rounded-2xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label
                      className="block font-semibold text-xs"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Điểm bù Nam vs Nữ (maleBonus)
                    </label>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Mặc định +1.5 (Nam TB- ngang Nữ TB)
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setTempMaleBonus(Math.max(0, Number((tempMaleBonus - 0.5).toFixed(1))))
                      }
                      className="vo-btn-subtle w-7 h-7 rounded-lg flex items-center justify-center"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span
                      className="font-bold text-sm font-mono-tabular w-11 text-center"
                      style={{ color: 'var(--accent-lime)' }}
                    >
                      +{tempMaleBonus.toFixed(1)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setTempMaleBonus(Math.min(5, Number((tempMaleBonus + 0.5).toFixed(1))))
                      }
                      className="vo-btn-subtle w-7 h-7 rounded-lg flex items-center justify-center"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.5"
                  value={tempMaleBonus}
                  onChange={(e) => setTempMaleBonus(parseFloat(e.target.value))}
                  className="w-full accent-lime-400"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[0, 1.0, 1.5, 2.0, 2.5, 3.0].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTempMaleBonus(preset)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono-tabular transition"
                      style={
                        Math.abs(tempMaleBonus - preset) < 0.01
                          ? {
                              background: 'var(--accent-cta)',
                              color: 'var(--text-on-accent)',
                            }
                          : {
                              background: 'var(--bg-tile)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-secondary)',
                            }
                      }
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Giao diện sáng / tối */}
              <div>
                <label
                  className="block font-semibold text-xs mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Giao diện (Theme)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'dark', label: 'Tối (Sân)', icon: Moon },
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
                        className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold transition"
                        style={
                          active
                            ? {
                                background: 'var(--accent-lime-soft)',
                                border: '1px solid var(--accent-lime-border)',
                                color: 'var(--accent-lime)',
                              }
                            : {
                                background: 'var(--bg-tile)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-secondary)',
                              }
                        }
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Hỏi nhanh tỉ số & nhận xét sau trận */}
              {onTogglePromptPostMatchReview && (
                <label className="vo-stage p-3 rounded-2xl flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <div
                      className="font-semibold text-xs"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Hỏi nhanh tỉ số &amp; nhận xét sau khi kết thúc trận
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Dữ liệu này nuôi mục AI Nhận xét trình trong tab Tính tiền. Trận có kèo độ luôn nhắc chốt đội thắng.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={promptPostMatchReview}
                    onChange={(e) => onTogglePromptPostMatchReview(e.target.checked)}
                    className="w-4 h-4 rounded accent-lime-400 cursor-pointer shrink-0"
                  />
                </label>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="vo-btn-subtle px-4 py-2.5 rounded-xl text-xs font-semibold"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateMaleBonus(tempMaleBonus);
                  setShowSettingsModal(false);
                }}
                className="vo-cta-lime px-5 py-2.5 rounded-xl text-xs font-extrabold"
              >
                Lưu cài đặt
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
