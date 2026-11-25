import React, { useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  Copy,
  Check,
  KeyRound,
  Database,
  LogOut,
  RefreshCw,
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
import { StatusPill, UiModal } from './ui/Primitives';

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
  onUpdateRoomPin?: (newPin: string) => Promise<{ ok: boolean; error?: string }>;
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
  onUpdateRoomPin,
}) => {
  const isViewer = role === 'VIEWER';
  const [activeTab, setActiveTab] = useState<'MANAGE' | 'JOIN' | 'CONFIG'>('MANAGE');

  const [newRoomCode, setNewRoomCode] = useState(() => {
    const num = Math.floor(10 + Math.random() * 90);
    return `SAN-${num}`;
  });
  const [newPinCode, setNewPinCode] = useState('1234');

  const [joinCode, setJoinCode] = useState('');
  const [joinPin, setJoinPin] = useState('');

  const [customUrl, setCustomUrl] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [configSaved, setConfigSaved] = useState(false);

  const [copiedViewerLink, setCopiedViewerLink] = useState(false);
  const [copiedHostLink, setCopiedHostLink] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const [upgradePinInput, setUpgradePinInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showChangePinForm, setShowChangePinForm] = useState(false);
  const [changePinInput, setChangePinInput] = useState('');
  const [changePinError, setChangePinError] = useState<string | null>(null);
  const [isSavingPin, setIsSavingPin] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const currentConfig = getSupabaseConfig();
      if (currentConfig) {
        setCustomUrl(currentConfig.url);
        setCustomKey(currentConfig.anonKey);
      }
      if (isViewer && activeTab === 'CONFIG') {
        setActiveTab('MANAGE');
      }
    }
  }, [isOpen, isViewer, activeTab]);

  const baseUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      return window.location.origin + window.location.pathname;
    }
    return '';
  }, []);

  const viewerUrl = roomCode ? `${baseUrl}?room=${roomCode}` : '';
  const coHostUrl =
    roomCode && role === 'CO_HOST' && pinCode
      ? `${baseUrl}?room=${roomCode}&pin=${pinCode}`
      : viewerUrl;

  const qrImageUrl = useMemo(() => {
    const targetUrl = role === 'CO_HOST' ? coHostUrl : viewerUrl;
    if (!targetUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      targetUrl
    )}`;
  }, [role, coHostUrl, viewerUrl]);

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

  const sqlSetupCode = `-- Tạo bảng lưu phòng cầu lông + Storage ảnh biên lai
create table if not exists public.badminton_rooms (
  room_code text primary key,
  pin_code text not null default '1234',
  session_data jsonb not null,
  settlement_data jsonb,
  updated_at bigint not null,
  updated_by text not null
);
alter table public.badminton_rooms enable row level security;
drop policy if exists "Allow public read and write by room_code" on public.badminton_rooms;
create policy "Allow public read and write by room_code" on public.badminton_rooms for all using (true) with check (true);
alter publication supabase_realtime add table public.badminton_rooms;

-- Bucket lưu ảnh biên lai chuyển khoản (Nhóm 3)
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read receipts" on storage.objects;
create policy "Public read receipts" on storage.objects for select using (bucket_id = 'payment-receipts');

drop policy if exists "Public upload receipts" on storage.objects;
create policy "Public upload receipts" on storage.objects for insert with check (bucket_id = 'payment-receipts');

drop policy if exists "Public update receipts" on storage.objects;
create policy "Public update receipts" on storage.objects for update using (bucket_id = 'payment-receipts');

drop policy if exists "Public delete receipts" on storage.objects;
create policy "Public delete receipts" on storage.objects for delete using (bucket_id = 'payment-receipts');`;

  const tabs: Array<{ id: 'MANAGE' | 'JOIN' | 'CONFIG'; label: string }> = isViewer
    ? [
        { id: 'MANAGE', label: roomCode ? 'Phòng hiện tại' : 'Phòng Online' },
        { id: 'JOIN', label: 'Đổi phòng' },
      ]
    : [
        { id: 'MANAGE', label: roomCode ? 'Quản lý phòng' : 'Tạo phòng' },
        { id: 'JOIN', label: 'Vào phòng' },
        { id: 'CONFIG', label: 'Cấu hình' },
      ];

  return (
    <UiModal
      isOpen={isOpen}
      onClose={onClose}
      sheetOnMobile
      title="Phòng Online Đồng Bộ"
      subtitle="Đồng bộ trực tiếp giữa Ban điều hành và người xem trên sân"
    >
      <div className="space-y-4">
        {/* Segmented Tab Switcher */}
        <div
          className={`ui-segmented-track grid gap-1 ${
            tabs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
          }`}
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="min-h-[44px] px-2 rounded-xl text-[14px] font-semibold transition"
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
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Connected Room Status Bar */}
        {roomCode && (
          <div className="ui-tile p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    syncStatus === 'SYNCING'
                      ? 'var(--color-warning)'
                      : syncStatus === 'ERROR'
                      ? 'var(--color-danger)'
                      : 'var(--color-accent)',
                }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="font-bold text-[15px] font-mono-tabular"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {roomCode}
                  </span>
                  <StatusPill tone={role === 'CO_HOST' ? 'accent' : 'neutral'}>
                    {role === 'CO_HOST' ? 'Quản trị (Co-Host)' : 'Chỉ xem'}
                  </StatusPill>
                </div>
                <p
                  className="text-[13px] mt-0.5 truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {syncStatus === 'SYNCING'
                    ? 'Đang đồng bộ...'
                    : syncStatus === 'ERROR'
                    ? `Lỗi: ${errorMessage}`
                    : 'Đang kết nối Realtime'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onLeaveRoom}
              className="ui-btn ui-btn-danger-soft px-3 shrink-0"
            >
              <LogOut className="w-4 h-4" />
              <span>Rời phòng</span>
            </button>
          </div>
        )}

        {/* TAB 1: MANAGE / CREATE */}
        {activeTab === 'MANAGE' && (
          <div className="space-y-4">
            {roomCode ? (
              <>
                {/* QR Code Panel */}
                <div className="ui-tile p-4 text-center space-y-3">
                  <p
                    className="text-[14px] font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Quét mã QR để mở phòng trên điện thoại
                  </p>
                  {qrImageUrl && (
                    <div
                      className="ui-qr-frame w-48 h-48 p-3 mx-auto flex items-center justify-center border ui-divider"
                    >
                      <img
                        src={qrImageUrl}
                        alt="Room QR Code"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <p
                    className="text-[13px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {role === 'CO_HOST'
                      ? 'Mã QR truy cập nhanh cho Ban điều hành (kèm mã PIN)'
                      : 'Quét mã để mở trang theo dõi sân (Chỉ xem)'}
                  </p>
                </div>

                {/* Co-Host Link & PIN Management (CO_HOST only) */}
                {role === 'CO_HOST' && (
                  <div className="ui-tile p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1.5 text-[14px] font-bold"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        <KeyRound className="w-4 h-4" />
                        <span>Link điều hành (Co-Host)</span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-[13px] font-mono-tabular font-semibold"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          PIN: {pinCode || '••••'}
                        </span>
                        {onUpdateRoomPin && (
                          <button
                            type="button"
                            onClick={() => {
                              setChangePinInput(pinCode || '');
                              setChangePinError(null);
                              setShowChangePinForm((prev) => !prev);
                            }}
                            className="min-h-[36px] px-3 rounded-lg text-[13px] font-semibold transition"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {showChangePinForm ? 'Đóng' : 'Đổi PIN'}
                          </button>
                        )}
                      </div>
                    </div>

                    {onUpdateRoomPin && showChangePinForm && (
                      <div
                        className="p-3 rounded-xl space-y-2"
                        style={{ backgroundColor: 'var(--bg-surface)' }}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            value={changePinInput}
                            onChange={(e) => {
                              setChangePinInput(e.target.value);
                              setChangePinError(null);
                            }}
                            placeholder="PIN mới (4–6 ký tự)..."
                            className="ui-input font-mono-tabular font-bold"
                          />
                          <button
                            type="button"
                            disabled={isSavingPin}
                            onClick={async () => {
                              setChangePinError(null);
                              setIsSavingPin(true);
                              const res = await onUpdateRoomPin(changePinInput);
                              setIsSavingPin(false);
                              if (res.ok) {
                                vibrateSuccess();
                                setShowChangePinForm(false);
                              } else {
                                vibrateWarning();
                                setChangePinError(res.error || 'Không thể đổi PIN');
                              }
                            }}
                            className="ui-btn ui-btn-primary px-4 shrink-0"
                          >
                            {isSavingPin ? 'Đang lưu...' : 'Lưu'}
                          </button>
                        </div>
                        {changePinError && (
                          <p
                            className="text-[13px] font-medium"
                            style={{ color: 'var(--color-danger)' }}
                          >
                            {changePinError}
                          </p>
                        )}
                      </div>
                    )}

                    <p
                      className="text-[13px] leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Dành cho người điều phối sân: có quyền xếp lượt, chốt trận và quản lý thu tiền.
                    </p>

                    <button
                      type="button"
                      onClick={() => handleCopy(coHostUrl, 'HOST')}
                      className="ui-btn ui-btn-primary w-full rounded-full"
                    >
                      {copiedHostLink ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span>
                        {copiedHostLink
                          ? 'Đã sao chép link điều hành'
                          : 'Sao chép link điều hành'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Viewer Share Link */}
                <div className="ui-tile p-4 space-y-3">
                  <div
                    className="inline-flex items-center gap-1.5 text-[14px] font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Eye
                      className="w-4 h-4"
                      style={{ color: 'var(--color-accent)' }}
                    />
                    <span>Link thành viên (Chỉ xem)</span>
                  </div>
                  <p
                    className="text-[13px] leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Gửi vào nhóm để thành viên theo dõi các sân đang đánh, lượt kế tiếp và hàng chờ.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCopy(viewerUrl, 'VIEWER')}
                    className="ui-btn ui-btn-secondary w-full rounded-full"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  >
                    {copiedViewerLink ? (
                      <Check
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>
                      {copiedViewerLink
                        ? 'Đã sao chép link chỉ xem'
                        : 'Sao chép link chỉ xem'}
                    </span>
                  </button>
                </div>

                {/* Upgrade to Co-Host (VIEWER only) */}
                {role === 'VIEWER' && (
                  <div className="ui-tile p-4 space-y-3">
                    <p
                      className="text-[14px] font-bold flex items-center gap-1.5"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <Lock
                        className="w-4 h-4"
                        style={{ color: 'var(--color-accent)' }}
                      />
                      <span>Mở khóa quyền quản trị (Co-Host)</span>
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        maxLength={6}
                        placeholder="Nhập mã PIN..."
                        value={upgradePinInput}
                        onChange={(e) => setUpgradePinInput(e.target.value)}
                        className="ui-input text-center font-mono-tabular font-bold"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!upgradePinInput.trim()) return;
                          const res = await onUpgradeToCoHost(upgradePinInput);
                          if (!res.ok) alert(res.error);
                          else setUpgradePinInput('');
                        }}
                        className="ui-btn ui-btn-primary px-5 shrink-0"
                      >
                        Mở khóa
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* CREATE NEW ROOM FORM */
              <form onSubmit={handleCreateRoomSubmit} className="space-y-4">
                <div className="space-y-3.5">
                  <div>
                    <label
                      className="block text-[14px] font-semibold mb-1.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Mã phòng (gợi ý hoặc tự đặt)
                    </label>
                    <input
                      type="text"
                      required
                      value={newRoomCode}
                      onChange={(e) => setNewRoomCode(e.target.value.toUpperCase())}
                      placeholder="SAN-68, CLB-88..."
                      className="ui-input font-mono-tabular font-bold uppercase tracking-wider"
                    />
                  </div>

                  <div>
                    <label
                      className="block text-[14px] font-semibold mb-1.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Mã PIN quản trị (4–6 ký tự)
                    </label>
                    <input
                      type="text"
                      required
                      minLength={4}
                      maxLength={6}
                      value={newPinCode}
                      onChange={(e) => setNewPinCode(e.target.value)}
                      placeholder="1234"
                      className="ui-input font-mono-tabular font-bold"
                    />
                    <p
                      className="text-[13px] mt-1.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Dùng để cấp quyền điều phối sân và quản lý thu tiền.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="ui-btn ui-btn-primary w-full rounded-full"
                >
                  <Cloud className="w-4 h-4" />
                  <span>
                    {isSubmitting ? 'Đang mở phòng...' : 'Mở phòng Online & Đồng bộ'}
                  </span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 2: JOIN EXISTING ROOM */}
        {activeTab === 'JOIN' && (
          <form onSubmit={handleJoinRoomSubmit} className="space-y-4">
            <div className="space-y-3.5">
              <div>
                <label
                  className="block text-[14px] font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Nhập mã phòng
                </label>
                <input
                  type="text"
                  required
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: SAN-68"
                  className="ui-input font-mono-tabular font-bold uppercase tracking-wider"
                />
              </div>

              <div>
                <label
                  className="block text-[14px] font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Mã PIN Co-Host (bỏ trống nếu chỉ xem)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={joinPin}
                  onChange={(e) => setJoinPin(e.target.value)}
                  placeholder="Nhập 4 số PIN nếu muốn Host hộ..."
                  className="ui-input font-mono-tabular font-bold"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="ui-btn ui-btn-primary w-full rounded-full"
            >
              <RefreshCw className="w-4 h-4" />
              <span>
                {isSubmitting ? 'Đang kết nối...' : 'Kết nối vào phòng'}
              </span>
            </button>
          </form>
        )}

        {/* TAB 3: SUPABASE CONFIG (Host / Offline only — hidden from VIEWER) */}
        {activeTab === 'CONFIG' && !isViewer && (
          <div className="space-y-4">
            <div className="ui-tile p-4 space-y-3">
              <h4
                className="font-bold text-[15px] flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <Database
                  className="w-4 h-4"
                  style={{ color: 'var(--color-accent)' }}
                />
                <span>Khóa kết nối Supabase</span>
              </h4>
              <p
                className="text-[13px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Lưu trực tiếp vào thiết bị này mà không cần build lại ứng dụng.
              </p>

              <div>
                <label
                  className="block text-[13px] font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Project URL
                </label>
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="ui-input font-mono-tabular"
                />
              </div>

              <div>
                <label
                  className="block text-[13px] font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Anon Public Key
                </label>
                <input
                  type="password"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  className="ui-input font-mono-tabular"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="ui-btn ui-btn-primary flex-1 rounded-full"
                >
                  {configSaved ? 'Đã lưu!' : 'Lưu cấu hình'}
                </button>
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="ui-btn ui-btn-secondary px-4"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                >
                  Xóa
                </button>
              </div>
            </div>

            <div className="ui-tile p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="font-semibold text-[14px]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Script SQL khởi tạo bảng
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(sqlSetupCode, 'SQL')}
                  className="ui-btn ui-btn-accent-soft min-h-[36px] px-3 text-[13px]"
                >
                  {copiedSql ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedSql ? 'Đã chép' : 'Chép SQL'}</span>
                </button>
              </div>
              <p
                className="text-[13px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Vào Supabase Dashboard → SQL Editor → Dán script này và bấm Run.
              </p>
              <pre
                className="p-3 rounded-xl font-mono-tabular text-[11px] overflow-x-auto max-h-28"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                }}
              >
                {sqlSetupCode}
              </pre>
            </div>
          </div>
        )}
      </div>
    </UiModal>
  );
};
