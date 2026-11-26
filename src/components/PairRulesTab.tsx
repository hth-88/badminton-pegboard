import React, { useState } from 'react';
import {
  Scale,
  Plus,
  Trash2,
  AlertTriangle,
  Lock,
  ShieldAlert,
  Swords,
} from 'lucide-react';
import type { PairRule, PairRuleType, Player } from '../types/badminton';
import type { RuleConflictInfo } from '../engine/sessionReducer';
import { RANK_METADATA } from '../engine/skillConfig';
import { vibrateSuccess } from '../utils/vibrate';
import {
  GenderDot,
  RankBadge,
  StatusPill,
  UiEmptyState,
  UiModal,
} from './ui/Primitives';

interface PairRulesTabProps {
  pairRules: PairRule[];
  players: Player[];
  ruleConflicts: RuleConflictInfo[];
  isViewer?: boolean;
  embedded?: boolean;
  onRequestUpgrade?: () => void;
  onAddRule: (rule: Omit<PairRule, 'id'>) => void;
  onRemoveRule: (ruleId: string) => void;
}

export const PairRulesTab: React.FC<PairRulesTabProps> = ({
  pairRules,
  players,
  ruleConflicts,
  isViewer = false,
  embedded = false,
  onRequestUpgrade,
  onAddRule,
  onRemoveRule,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [ruleType, setRuleType] = useState<PairRuleType>('LOCK_PARTNER');

  if (isViewer) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <UiEmptyState
          icon={<Lock className="w-6 h-6" />}
          title="Mục chỉ dành cho Ban điều hành"
          description="Thiết lập luật cặp đôi chỉ hiển thị khi đăng nhập quyền quản trị phòng."
          action={
            onRequestUpgrade ? (
              <button
                type="button"
                onClick={onRequestUpgrade}
                className="ui-btn ui-btn-primary px-5 rounded-full"
              >
                Nhập mã PIN quản trị
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const playerMap = new Map(players.map((p) => [p.id, p]));

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerAId || !playerBId || playerAId === playerBId) {
      alert('Vui lòng chọn 2 người chơi khác nhau');
      return;
    }
    vibrateSuccess();

    onAddRule({
      playerAId,
      playerBId,
      type: ruleType,
    });

    setPlayerAId('');
    setPlayerBId('');
    setShowAddModal(false);
  };

  const getRuleMeta = (type: PairRuleType) => {
    switch (type) {
      case 'LOCK_PARTNER':
        return {
          icon: Lock,
          label: 'Cùng đội',
          tone: 'accent' as const,
          desc: 'Luôn xếp chung 1 đội khi vào sân',
        };
      case 'AVOID_PARTNER':
        return {
          icon: ShieldAlert,
          label: 'Cấm cùng đội',
          tone: 'warning' as const,
          desc: 'Không xếp chung 1 đội',
        };
      case 'AVOID_MATCH':
        return {
          icon: Swords,
          label: 'Cấm chung trận',
          tone: 'danger' as const,
          desc: 'Không vào chung 1 trận đấu',
        };
    }
  };

  return (
    <div
      className={
        embedded
          ? 'space-y-5'
          : 'max-w-[780px] mx-auto px-4 md:px-6 pt-4 pb-28 space-y-5'
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              className="text-[20px] font-bold tracking-[-0.02em]"
              style={{ color: 'var(--text-primary)' }}
            >
              Luật cặp đôi
            </h2>
            <StatusPill tone="neutral">
              <span className="tabular-nums">{pairRules.length} luật</span>
            </StatusPill>
          </div>
          <p
            className="text-[14px] mt-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cố định cặp đánh chung hoặc hạn chế ghép trùng trận
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (players.length < 2) {
              alert('Cần ít nhất 2 người chơi để tạo luật');
              return;
            }
            setShowAddModal(true);
          }}
          className="ui-btn ui-btn-primary px-4 rounded-full shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm luật</span>
        </button>
      </div>

      {/* Rule Conflicts Banner */}
      {ruleConflicts.length > 0 && (
        <div className="ui-banner-danger p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[14px]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Phát hiện {ruleConflicts.length} mâu thuẫn luật</span>
          </div>
          <div className="space-y-1.5 text-[14px]">
            {ruleConflicts.map((c, i) => (
              <p key={i} className="leading-relaxed">
                • {c.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-2.5">
        {pairRules.length === 0 ? (
          <UiEmptyState
            icon={<Scale className="w-6 h-6" />}
            title="Chưa có luật cặp nào"
            description="Hệ thống sẽ tự động ghép cân bằng theo trình độ và thứ tự chờ."
          />
        ) : (
          pairRules.map((rule) => {
            const pA = playerMap.get(rule.playerAId);
            const pB = playerMap.get(rule.playerBId);
            const meta = getRuleMeta(rule.type);
            const Icon = meta.icon;

            return (
              <div
                key={rule.id}
                className="ui-card px-4 py-3.5 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill tone={meta.tone}>
                      <Icon className="w-3.5 h-3.5" />
                      <span>{meta.label}</span>
                    </StatusPill>
                    <span
                      className="text-[13px] hidden sm:inline"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {meta.desc}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <div className="inline-flex items-center gap-1.5 min-w-0">
                      {pA && <GenderDot sex={pA.sex} />}
                      <span
                        className="text-[15px] font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {pA?.name || rule.playerAId}
                      </span>
                      {pA && <RankBadge rank={pA.rank} surface="card" />}
                    </div>

                    <span
                      className="text-[14px]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      và
                    </span>

                    <div className="inline-flex items-center gap-1.5 min-w-0">
                      {pB && <GenderDot sex={pB.sex} />}
                      <span
                        className="text-[15px] font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {pB?.name || rule.playerBId}
                      </span>
                      {pB && <RankBadge rank={pB.rank} surface="card" />}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveRule(rule.id)}
                  title="Xóa luật này"
                  aria-label="Xóa luật này"
                  className="ui-icon-btn w-11 h-11 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add Rule Modal */}
      <UiModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        sheetOnMobile
        maxWidthClass="max-w-md"
        title="Thêm luật cặp"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label
              className="block text-[14px] font-semibold mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Người chơi thứ nhất (A) *
            </label>
            <select
              required
              value={playerAId}
              onChange={(e) => setPlayerAId(e.target.value)}
              className="ui-select"
            >
              <option value="">-- Chọn người chơi A --</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({RANK_METADATA[p.rank].code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="block text-[14px] font-semibold mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Người chơi thứ hai (B) *
            </label>
            <select
              required
              value={playerBId}
              onChange={(e) => setPlayerBId(e.target.value)}
              className="ui-select"
            >
              <option value="">-- Chọn người chơi B --</option>
              {players
                .filter((p) => p.id !== playerAId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({RANK_METADATA[p.rank].code})
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="block text-[14px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Loại luật áp dụng
            </label>
            {(
              [
                {
                  val: 'LOCK_PARTNER' as const,
                  title: 'Cùng đội (LOCK)',
                  desc: 'Luôn xếp 2 người chung đội mỗi khi cùng vào sân.',
                },
                {
                  val: 'AVOID_PARTNER' as const,
                  title: 'Cấm cùng đội (AVOID)',
                  desc: 'Không xếp chung đội, vẫn có thể là đối thủ của nhau.',
                },
                {
                  val: 'AVOID_MATCH' as const,
                  title: 'Cấm chung trận (NO MATCH)',
                  desc: 'Tránh xếp vào chung 1 trận đấu (cả cùng đội lẫn đối thủ).',
                },
              ] as const
            ).map((opt) => {
              const active = ruleType === opt.val;
              return (
                <label
                  key={opt.val}
                  className="ui-tile flex items-start gap-3 p-3.5 cursor-pointer"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--color-accent-soft)',
                          border: '1px solid var(--color-accent-border)',
                        }
                      : { border: '1px solid transparent' }
                  }
                >
                  <input
                    type="radio"
                    name="ruleType"
                    checked={active}
                    onChange={() => setRuleType(opt.val)}
                    className="ui-radio mt-1 shrink-0"
                  />
                  <div>
                    <span
                      className="font-semibold text-[14px] block"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {opt.title}
                    </span>
                    <span
                      className="text-[13px] leading-snug"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {opt.desc}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="pt-3 border-t ui-divider flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="ui-btn ui-btn-secondary px-4"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="ui-btn ui-btn-primary px-5 rounded-full"
            >
              Lưu luật
            </button>
          </div>
        </form>
      </UiModal>
    </div>
  );
};
