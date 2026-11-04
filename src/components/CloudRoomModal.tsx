import React, { useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  Copy,
  Check,
  KeyRound,
  Database,
  LogOut,
  RefreshCw,
  X,
  Lock,
  Eye,
} from 'lucide-react';
import type { BadmintonSessionState } from '../types/badminton';
import {
  clearSupabaseConfig,
  getSupabaseConfig,
  saveSupabaseConfig,
} from '../services/supabaseSync';
import type { RoomRole, SyncStatus } from '../hooks/useCloudRoom';
import { vibrateSuccess, vibrateWarning } from '../utils/vibrate';

interface CloudRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string | null;
  pinCode: string | null;
  role: RoomRole;
  syncStatus: SyncStatus;
  errorMessage: string | null;
  currentState: BadmintonSessionState;
  onCreateRoom: (
    code: string,
    pin: string,
    stateToSync: BadmintonSessionState
  ) => Promise<{ ok: boolean; error?: string }>;
  onJoinRoom: (
    code: string,
    pin?: string
  ) => Promise<{ ok: boolean; role: RoomRole; error?: string }>;
  onLeaveRoom: () => void;
  onUpgradeToCoHost: (pin: string) => Promise<{ ok: boolean; error?: string }>;
}

export const CloudRoomModal: React.FC<CloudRoomModalProps> = ({
  isOpen,
  onClose,
  roomCode,
  pinCode,
  role,
  syncStatus,
  errorMessage,
  currentState,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onUpgradeToCoHost,
}) => {
  const [activeTab, setActiveTab] = useState<'MANAGE' | 'JOIN' | 'CONFIG'>('MANAGE');

  // Form tạo phòng
  const [newRoomCode, setNewRoomCode] = useState(() => {
    const num = Math.floor(10 + Math.random() * 90);
    return `SAN-${num}`;
  });
  const [newPinCode, setNewPinCode] = useState('1234');

  // Form vào phòng
  const [joinCode, setJoinCode] = useState('');
  const [joinPin, setJoinPin] = useState('');

  // Form cấu hình Supabase
  const [customUrl, setCustomUrl] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [configSaved, setConfigSaved] = useState(false);

  // Copy state
  const [copiedViewerLink, setCopiedViewerLink] = useState(false);
  const [copiedHostLink, setCopiedHostLink] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Upgrade PIN prompt
  const [upgradePinInput, setUpgradePinInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load config hiện tại khi mở modal
  useEffect(() => {
    if (isOpen) {
      const currentConfig = getSupabaseConfig();
      if (currentConfig) {
        setCustomUrl(currentConfig.url);
        setCustomKey(currentConfig.anonKey);
      }
    }
  }, [isOpen]);

  const baseUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      return window.location.origin + window.location.pathname;
    }
    return '';
  }, []);

  const viewerUrl = roomCode ? `${baseUrl}?room=${roomCode}` : '';
  const coHostUrl = roomCode && pinCode ? `${baseUrl}?room=${roomCode}&pin=${pinCode}` : viewerUrl;

  const qrImageUrl = useMemo(() => {
    if (!coHostUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      coHostUrl
    )}`;
  }, [coHostUrl]);

  const handleCopy = async (text: string, type: 'VIEWER' | 'HOST' | 'SQL') => {
    vibrateSuccess();
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'VIEWER') {
        setCopiedViewerLink(true);
        setTimeout(() => setCopiedViewerLink(false), 2000);
      } else if (type === 'HOST') {
        setCopiedHostLink(true);
        setTimeout(() => setCopiedHostLink(false), 2000);
      } else {
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 2000);
      }
    } catch {
      alert('Không thể sao chép tự động.');
    }
  };

  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomCode.trim()) return;
    setIsSubmitting(true);
    const res = await onCreateRoom(newRoomCode, newPinCode, currentState);
    setIsSubmitting(false);
    if (!res.ok) {
      vibrateWarning();
      alert(`Lỗi tạo phòng: ${res.error}`);
    }
  };

  const handleJoinRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setIsSubmitting(true);
    const res = await onJoinRoom(joinCode, joinPin);
    setIsSubmitting(false);
    if (!res.ok) {
      vibrateWarning();
      alert(`Không thể vào phòng: ${res.error}`);
    } else {
      setActiveTab('MANAGE');
    }
  };

  const handleSaveConfig = () => {
    if (!customUrl.trim() || !customKey.trim()) {
      alert('Vui lòng nhập cả Supabase URL và Anon Public Key!');
      return;
    }
    vibrateSuccess();
    saveSupabaseConfig({
      url: customUrl.trim(),
      anonKey: customKey.trim(),
    });
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2000);
    alert('Đã lưu cấu hình kết nối Supabase thành công!');
  };

  const handleResetConfig = () => {
    if (window.confirm('Khôi phục cấu hình Supabase về mặc định (.env)?')) {
      clearSupabaseConfig();
      setCustomUrl('');
      setCustomKey('');
      alert('Đã xóa cấu hình tùy chỉnh!');
    }
  };

  if (!isOpen) return null;

  const sqlSetupCode = `-- Tạo bảng lưu phòng cầu lông\ncreate table if not exists public.badminton_rooms (\n  room_code text primary key,\n  pin_code text not null default '1234',\n  session_data jsonb not null,\n  settlement_data jsonb,\n  updated_at bigint not null,\n  updated_by text not null\n);\nalter table public.badminton_rooms enable row level security;\ncreate policy "Allow public read and write by room_code" on public.badminton_rooms for all using (true) with check (true);\nalter publication supabase_realtime add table public.badminton_rooms;`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg text-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Phòng Online Đồng Bộ</h3>
              <p className="text-[11px] text-slate-400">
                Đồng bộ realtime giữa Host và người xem trên sân
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('MANAGE')}
              className={`pb-2.5 text-xs font-bold transition border-b-2 ${
                activeTab === 'MANAGE'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {roomCode ? 'Quản lý phòng' : 'Tạo phòng mới'}
            </button>

            <button
              onClick={() => setActiveTab('JOIN')}
              className={`pb-2.5 text-xs font-bold transition border-b-2 ${
                activeTab === 'JOIN'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Vào phòng có sẵn
            </button>

            <button
              onClick={() => setActiveTab('CONFIG')}
              className={`pb-2.5 text-xs font-bold transition border-b-2 ${
                activeTab === 'CONFIG'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Cấu hình Supabase
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Status Banner nếu đang kết nối */}
          {roomCode && (
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    syncStatus === 'SYNCING'
                      ? 'bg-amber-400 animate-ping'
                      : syncStatus === 'ERROR'
                      ? 'bg-rose-500'
                      : 'bg-emerald-400'
                  }`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-100">
                      Phòng: {roomCode}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        role === 'CO_HOST'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                      }`}
                    >
                      {role === 'CO_HOST' ? 'Co-Host (Toàn quyền)' : 'Chỉ xem (Viewer)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {syncStatus === 'SYNCING'
                      ? 'Đang đồng bộ...'
                      : syncStatus === 'ERROR'
                      ? `Lỗi: ${errorMessage}`
                      : 'Đang kết nối Realtime'}
                  </p>
                </div>
              </div>

              <button
                onClick={onLeaveRoom}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 border border-slate-700 text-slate-300 text-[11px] font-semibold transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Rời phòng</span>
              </button>
            </div>
          )}

          {/* TAB 1: TẠO / QUẢN LÝ PHÒNG */}
          {activeTab === 'MANAGE' && (
            <div className="space-y-4">
              {roomCode ? (
                /* ĐÃ TRONG PHÒNG -> HIỆN LINK & MÃ QR */
                <div className="space-y-4">
                  <div className="text-center p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <p className="text-slate-400 mb-2 font-medium">
                      Quét mã QR để mở phòng trực tiếp trên điện thoại:
                    </p>
                    {qrImageUrl && (
                      <div className="w-44 h-44 bg-white p-2.5 rounded-2xl mx-auto shadow-lg flex items-center justify-center">
                        <img
                          src={qrImageUrl}
                          alt="Room QR Code"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <p className="text-[11px] text-slate-500 mt-2">
                      (Chứa link kèm mã PIN để Co-Host điều khiển ngay)
                    </p>
                  </div>

                  {/* Nút Copy Links */}
                  <div className="space-y-2">
                    {/* Link Co-Host */}
                    <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-1.5">
                      <div className="flex items-center justify-between text-slate-300 font-semibold">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <KeyRound className="w-4 h-4" />
                          <span>Link cho Người Host Hộ (Co-Host)</span>
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          PIN: {pinCode || '1234'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Người mở link này có toàn quyền bấm Kết thúc trận, Xếp người thay bạn.
                      </p>
                      <button
                        onClick={() => handleCopy(coHostUrl, 'HOST')}
                        className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-2"
                      >
                        {copiedHostLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedHostLink ? 'ĐÃ SAO CHÉP LINK CO-HOST!' : 'Sao chép Link Co-Host'}</span>
                      </button>
                    </div>

                    {/* Link Viewer */}
                    <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-slate-300 font-semibold">
                        <span className="flex items-center gap-1.5 text-sky-400">
                          <Eye className="w-4 h-4" />
                          <span>Link cho Thành viên xem lượt (Chỉ xem)</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Mọi người trong nhóm bấm vào để xem ai sắp vào sân, không lo bị bấm nhầm.
                      </p>
                      <button
                        onClick={() => handleCopy(viewerUrl, 'VIEWER')}
                        className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition flex items-center justify-center gap-2 border border-slate-700"
                      >
                        {copiedViewerLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedViewerLink ? 'ĐÃ SAO CHÉP LINK XEM!' : 'Sao chép Link Chỉ Xem'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Nâng cấp Co-Host nếu đang là Viewer */}
                  {role === 'VIEWER' && (
                    <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-800/60 space-y-2">
                      <p className="font-bold text-amber-300 flex items-center gap-1.5">
                        <Lock className="w-4 h-4" />
                        <span>Mở khóa quyền Cùng Điều Khiển (Co-Host)</span>
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          maxLength={6}
                          placeholder="Nhập mã PIN 4 số..."
                          value={upgradePinInput}
                          onChange={(e) => setUpgradePinInput(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-center font-mono font-bold text-sm"
                        />
                        <button
                          onClick={async () => {
                            if (!upgradePinInput.trim()) return;
                            const res = await onUpgradeToCoHost(upgradePinInput);
                            if (!res.ok) alert(res.error);
                            else setUpgradePinInput('');
                          }}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-white rounded-xl shadow"
                        >
                          Mở khóa
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* CHƯA CÓ PHÒNG -> FORM TẠO MỚI */
                <form onSubmit={handleCreateRoomSubmit} className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Mã phòng (Gợi ý hoặc tự đặt)
                      </label>
                      <input
                        type="text"
                        required
                        value={newRoomCode}
                        onChange={(e) => setNewRoomCode(e.target.value.toUpperCase())}
                        placeholder="SAN-68, CLB-88..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-mono font-bold text-sm text-emerald-400 uppercase tracking-wider"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Mã PIN bảo mật (4 số để cùng điều khiển)
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={newPinCode}
                        onChange={(e) => setNewPinCode(e.target.value)}
                        placeholder="1234"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-mono font-bold text-sm text-slate-100"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Người có mã PIN này mới được phép bấm Kết thúc trận và Đổi người.
                      </p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2"
                  >
                    <Cloud className="w-4 h-4" />
                    <span>{isSubmitting ? 'ĐANG MỞ PHÒNG...' : 'MỞ PHÒNG ONLINE & ĐỒNG BỘ NGAY'}</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: VÀO PHÒNG CÓ SẴN */}
          {activeTab === 'JOIN' && (
            <form onSubmit={handleJoinRoomSubmit} className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Nhập Mã phòng
                  </label>
                  <input
                    type="text"
                    required
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Ví dụ: SAN-68"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-mono font-bold text-sm text-emerald-400 uppercase tracking-wider"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Mã PIN Co-Host (Bỏ trống nếu chỉ muốn xem)
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={joinPin}
                    onChange={(e) => setJoinPin(e.target.value)}
                    placeholder="Nhập 4 số PIN nếu muốn Host hộ..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-mono font-bold text-sm text-slate-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{isSubmitting ? 'ĐANG KẾT NỐI...' : 'KẾT NỐI VÀ TẢI DỮ LIỆU PHÒNG'}</span>
              </button>
            </form>
          )}

          {/* TAB 3: CẤU HÌNH SUPABASE */}
          {activeTab === 'CONFIG' && (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Khóa kết nối Supabase Project</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Lưu trực tiếp vào thiết bị này mà không cần build lại mã nguồn.
                </p>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Project URL</label>
                  <input
                    type="text"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://xyzcompany.supabase.co"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 font-mono text-xs text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Anon Public Key</label>
                  <input
                    type="password"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 font-mono text-xs text-slate-200"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow transition"
                  >
                    {configSaved ? 'Đã lưu!' : 'Lưu cấu hình'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetConfig}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition"
                  >
                    Xóa
                  </button>
                </div>
              </div>

              {/* Hướng dẫn SQL 1-chạm */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300">Script SQL tạo bảng tự động</span>
                  <button
                    onClick={() => handleCopy(sqlSetupCode, 'SQL')}
                    className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold hover:underline"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? 'Đã chép SQL!' : 'Sao chép SQL'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Vào Supabase Dashboard -&gt; SQL Editor -&gt; Dán script này vào và bấm Run.
                </p>
                <pre className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-24">
                  {sqlSetupCode}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
