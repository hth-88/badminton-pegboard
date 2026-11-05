import React, { useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  Sun,
  Moon,
  Laptop,
  AlertTriangle,
  Flame,
  Settings2,
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
  roomCode = null,
  role = 'OFFLINE',
  syncStatus = 'OFFLINE',
  onOpenCloudModal,
}) => {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempMaleBonus, setTempMaleBonus] = useState(maleBonus);

  // Preset matchMix
  const getMixPreset = () => {
    if (matchMix.doubles === 1 && matchMix.singles === 0) return '100_0';
    if (matchMix.doubles === 0.7 && matchMix.singles === 0.3) return '70_30';
    if (matchMix.doubles === 0.5 && matchMix.singles === 0.5) return '50_50';
    if (matchMix.doubles === 0 && matchMix.singles === 1) return '0_100';
    return 'custom';
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-800 text-slate-100">
      {/* Banner cảnh báo lỗi bộ nhớ */}
      {storageError && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 px-3 py-2 text-xs md:text-sm text-amber-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Bộ nhớ trình duyệt đầy, dữ liệu có thể không được lưu!</span>
          </div>
          <button
            onClick={onExportJson}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded text-xs transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất JSON</span>
          </button>
        </div>
      )}

      {/* Main Top Bar */}
      <div className="max-w-6xl mx-auto px-3 py-2.5 flex items-center justify-between gap-2">
        {/* Brand & Sân Active */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-base shadow-sm">
            🏸
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-sm md:text-base tracking-tight leading-none text-slate-100">
                Badminton Rotation
              </h1>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                {activeCourtsCount}/{totalCourtsCount} sân hoạt động
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions (Cloud Room, Undo, Redo, Screen Wake, Settings) */}
        <div className="flex items-center gap-1.5">
          {/* Nút Trạng Thái Phòng Cloud Realtime */}
          {roomCode && role !== 'OFFLINE' ? (
            <button
              onClick={onOpenCloudModal}
              title={`Phòng ${roomCode} - ${role === 'CO_HOST' ? 'Co-Host (Toàn quyền)' : 'Chỉ xem'} (${syncStatus})`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-bold text-xs transition shrink-0 shadow-sm min-h-[36px] ${
                role === 'CO_HOST'
                  ? 'bg-emerald-950/80 hover:bg-emerald-900/80 border-emerald-700/80 text-emerald-200'
                  : 'bg-indigo-950/80 hover:bg-indigo-900/80 border-indigo-700/80 text-indigo-200'
              }`}
            >
              {role === 'CO_HOST' ? (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    syncStatus === 'SYNCING'
                      ? 'bg-amber-400 animate-ping'
                      : syncStatus === 'ERROR'
                      ? 'bg-rose-500'
                      : 'bg-emerald-400 animate-pulse'
                  }`}
                />
              ) : (
                <Eye className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              )}
              <span>{roomCode}</span>
              <span className="hidden md:inline text-[10px] font-normal opacity-80">
                ({role === 'CO_HOST' ? 'Co-Host' : 'Chỉ xem'})
              </span>
            </button>
          ) : (
            <button
              onClick={onOpenCloudModal}
              title="Phòng Online Realtime (Đồng bộ nhiều điện thoại)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-950/60 hover:bg-sky-900/80 border border-sky-800/60 text-sky-300 font-semibold text-xs transition shrink-0 min-h-[36px]"
            >
              <Cloud className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="hidden sm:inline">Phòng Online</span>
            </button>
          )}

          {/* Undo / Redo */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Hoàn tác (Undo)"
            aria-label="Hoàn tác (Undo)"
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Làm lại (Redo)"
            aria-label="Làm lại (Redo)"
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Screen Wake Lock */}
          {wakeLockSupported && (
            <button
              onClick={onToggleWakeLock}
              title={wakeLockActive ? 'Màn hình luôn sáng: BẬT' : 'Màn hình luôn sáng: TẮT'}
              aria-label={wakeLockActive ? 'Màn hình luôn sáng: BẬT' : 'Màn hình luôn sáng: TẮT'}
              className={`p-2 rounded-lg transition min-w-[36px] min-h-[36px] flex items-center justify-center ${
                wakeLockActive
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              <Flame className="w-4 h-4" />
            </button>
          )}

          {/* Settings Modal Button */}
          <button
            onClick={() => {
              setTempMaleBonus(maleBonus);
              setShowSettingsModal(true);
            }}
            title="Cài đặt luật & tỷ lệ"
            aria-label="Cài đặt luật & tỷ lệ"
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Settings Ribbon (Scrollable horizontally on mobile) */}
      <div className="border-t border-slate-800/60 bg-slate-900/60 dark:bg-slate-950/60 px-3 py-1.5 overflow-x-auto no-scrollbar flex items-center gap-2 text-xs">
        {/* Toggle Court Mode */}
        <button
          onClick={onToggleCourtMode}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 shrink-0 font-medium transition"
        >
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span>{courtMode === 'SHARED_POOL' ? 'Chung bể' : 'Tách sân'}</span>
        </button>

        {/* Tỉ lệ Match Mix Dropdown Preset */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-800/90 rounded-md p-0.5 border border-slate-700">
          <span className="text-slate-400 px-1.5 text-[11px] font-medium">Tỷ lệ:</span>
          <select
            value={getMixPreset()}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '100_0') onUpdateMatchMix(1, 0);
              else if (val === '70_30') onUpdateMatchMix(0.7, 0.3);
              else if (val === '50_50') onUpdateMatchMix(0.5, 0.5);
              else if (val === '0_100') onUpdateMatchMix(0, 1);
            }}
            className="bg-slate-900 text-slate-100 rounded px-1.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="100_0">100% Đôi</option>
            <option value="70_30">70% Đôi - 30% Đơn</option>
            <option value="50_50">50% Đôi - 50% Đơn</option>
            <option value="0_100">100% Đơn</option>
          </select>
        </div>

        {/* Auto Singles Mode Selector */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-800/90 rounded-md p-0.5 border border-slate-700">
          <span className="text-slate-400 px-1.5 text-[11px] font-medium">Đơn khi ít người:</span>
          <select
            value={autoSingles}
            onChange={(e) => onUpdateAutoSingles(e.target.value as AutoSinglesMode)}
            className="bg-slate-900 text-slate-100 rounded px-1.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="OFF">Tắt</option>
            <option value="ASK">Hỏi trước (ASK)</option>
            <option value="AUTO">Tự động (AUTO)</option>
          </select>
        </div>

        {/* Bù trừ Nam/Nữ Stepper & Presets */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-800/90 rounded-md p-0.5 border border-slate-700">
          <span className="text-slate-400 px-1 text-[11px] font-medium">Bù Nam:</span>

          <button
            type="button"
            onClick={() => onUpdateMaleBonus(Math.max(0, Number((maleBonus - 0.5).toFixed(1))))}
            title="Giảm 0.5 điểm bù Nam"
            className="w-5 h-5 rounded flex items-center justify-center bg-slate-700/80 hover:bg-slate-600 text-slate-200 transition text-xs"
          >
            <Minus className="w-3 h-3" />
          </button>

          <span
            onClick={() => {
              setTempMaleBonus(maleBonus);
              setShowSettingsModal(true);
            }}
            title="Bấm để mở cài đặt chi tiết"
            className="font-bold text-amber-400 px-1 min-w-[28px] text-center cursor-pointer hover:underline"
          >
            +{maleBonus.toFixed(1)}
          </span>

          <button
            type="button"
            onClick={() => onUpdateMaleBonus(Math.min(5, Number((maleBonus + 0.5).toFixed(1))))}
            title="Tăng 0.5 điểm bù Nam"
            className="w-5 h-5 rounded flex items-center justify-center bg-slate-700/80 hover:bg-slate-600 text-slate-200 transition text-xs"
          >
            <Plus className="w-3 h-3" />
          </button>

          {/* Quick Presets */}
          <div className="hidden sm:flex items-center gap-0.5 pl-1 border-l border-slate-700">
            {[0, 1.0, 1.5, 2.0, 2.5, 3.0].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onUpdateMaleBonus(preset)}
                className={`px-1 py-0.2 rounded text-[10px] font-semibold transition ${
                  Math.abs(maleBonus - preset) < 0.01
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                +{preset}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-100 shadow-2xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-emerald-400" />
              <span>Cài đặt buổi giao lưu</span>
            </h3>

            <div className="space-y-4 text-sm">
              {/* Bù trừ điểm Nam/Nữ */}
              <div>
                <label className="block font-medium mb-1 text-slate-300">
                  Điểm cộng chênh lệch Nam vs Nữ (maleBonus)
                </label>
                <p className="text-xs text-slate-400 mb-2">
                  Phản ánh thể lực phong trào: Mặc định +1.5 (Nam TB- = 10.0 ngang Nữ TB = 10.0).
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    value={tempMaleBonus}
                    onChange={(e) => setTempMaleBonus(parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-500"
                  />
                  <span className="font-bold text-base text-emerald-400 w-12 text-center">
                    +{tempMaleBonus.toFixed(1)}
                  </span>
                </div>
                {/* Presets in modal */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {[0, 1.0, 1.5, 2.0, 2.5, 3.0].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTempMaleBonus(preset)}
                      className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                        Math.abs(tempMaleBonus - preset) < 0.01
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Giao diện sáng / tối */}
              <div>
                <label className="block font-medium mb-2 text-slate-300">Giao diện (Theme)</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => onSelectTheme('dark')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-semibold transition ${
                      theme === 'dark'
                        ? 'bg-slate-800 border-emerald-500 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Moon className="w-4 h-4" />
                    <span>Tối (Sân)</span>
                  </button>

                  <button
                    onClick={() => onSelectTheme('light')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-semibold transition ${
                      theme === 'light'
                        ? 'bg-slate-800 border-emerald-500 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Sun className="w-4 h-4" />
                    <span>Sáng</span>
                  </button>

                  <button
                    onClick={() => onSelectTheme('system')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-semibold transition ${
                      theme === 'system'
                        ? 'bg-slate-800 border-emerald-500 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Laptop className="w-4 h-4" />
                    <span>Hệ thống</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 text-sm font-medium transition"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  onUpdateMaleBonus(tempMaleBonus);
                  setShowSettingsModal(false);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-lg transition"
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

