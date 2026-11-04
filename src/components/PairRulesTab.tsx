import React, { useState } from 'react';
import {
  Scale,
  Plus,
  Trash2,
  AlertTriangle,
  Lock,
  ShieldAlert,
  Swords,
  X,
} from 'lucide-react';
import type { PairRule, PairRuleType, Player } from '../types/badminton';
import type { RuleConflictInfo } from '../engine/sessionReducer';
import { RANK_METADATA } from '../engine/skillConfig';
import { vibrateSuccess } from '../utils/vibrate';

interface PairRulesTabProps {
  pairRules: PairRule[];
  players: Player[];
  ruleConflicts: RuleConflictInfo[];
  onAddRule: (rule: Omit<PairRule, 'id'>) => void;
  onRemoveRule: (ruleId: string) => void;
}

export const PairRulesTab: React.FC<PairRulesTabProps> = ({
  pairRules,
  players,
  ruleConflicts,
  onAddRule,
  onRemoveRule,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [ruleType, setRuleType] = useState<PairRuleType>('LOCK_PARTNER');

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

  const getRuleBadge = (type: PairRuleType) => {
    switch (type) {
      case 'LOCK_PARTNER':
        return {
          icon: Lock,
          label: 'Cùng đội (LOCK)',
          color: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
          desc: 'Luôn xếp chung 1 đội khi vào sân',
        };
      case 'AVOID_PARTNER':
        return {
          icon: ShieldAlert,
          label: 'Cấm cùng đội (AVOID)',
          color: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
          desc: 'Không bao giờ xếp chung 1 đội',
        };
      case 'AVOID_MATCH':
        return {
          icon: Swords,
          label: 'Cấm đối đầu (NO MATCH)',
          color: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
          desc: 'Không vào chung 1 trận đấu (cả cùng đội lẫn đối thủ)',
        };
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 p-3 md:p-4 space-y-4">
      {/* Top Banner & Action */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-400" />
            <span>Luật cặp đôi</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {pairRules.length} luật
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cố định vợ chồng, tách đối thủ kỵ nhau hoặc giới hạn đối đầu
          </p>
        </div>

        <button
          onClick={() => {
            if (players.length < 2) {
              alert('Cần ít nhất 2 người chơi để tạo luật');
              return;
            }
            setShowAddModal(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm luật</span>
        </button>
      </div>

      {/* CẢNH BÁO MÂU THUẪN LUẬT (RULE CONFLICTS) */}
      {ruleConflicts.length > 0 && (
        <div className="rounded-2xl bg-rose-950/40 border border-rose-800/80 p-3.5 space-y-2 text-rose-200 animate-in fade-in">
          <div className="flex items-center gap-2 font-bold text-xs text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Phát hiện {ruleConflicts.length} mâu thuẫn luật:</span>
          </div>
          <div className="space-y-1.5 text-xs">
            {ruleConflicts.map((c, i) => (
              <p key={i} className="bg-rose-900/30 p-2 rounded-xl border border-rose-800/40">
                {c.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* DANH SÁCH LUẬT HIỆN CÓ */}
      <div className="space-y-2">
        {pairRules.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/60 border border-slate-800 text-slate-500">
            <Scale className="w-10 h-10 mx-auto mb-2 text-slate-600" />
            <p className="font-semibold text-slate-400 text-sm">Chưa có luật cặp nào</p>
            <p className="text-xs mt-1 text-slate-500">
              Thuật toán sẽ ghép tự do cân bằng theo trình độ và hàng đợi.
            </p>
          </div>
        ) : (
          pairRules.map((rule) => {
            const pA = playerMap.get(rule.playerAId);
            const pB = playerMap.get(rule.playerBId);
            const meta = getRuleBadge(rule.type);
            const Icon = meta.icon;

            return (
              <div
                key={rule.id}
                className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 shadow-sm hover:border-slate-700 transition"
              >
                <div className="flex-1 min-w-0">
                  {/* Badge rule type */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${meta.color}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{meta.label}</span>
                    </span>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                      • {meta.desc}
                    </span>
                  </div>

                  {/* Players involved */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                    <span className="truncate">{pA?.name || rule.playerAId}</span>
                    {pA && (
                      <span
                        className={`text-[9px] px-1 rounded ${RANK_METADATA[pA.rank].badgeBg} ${
                          RANK_METADATA[pA.rank].badgeText
                        }`}
                      >
                        {RANK_METADATA[pA.rank].code}
                      </span>
                    )}
                    <span className="text-slate-500">và</span>
                    <span className="truncate">{pB?.name || rule.playerBId}</span>
                    {pB && (
                      <span
                        className={`text-[9px] px-1 rounded ${RANK_METADATA[pB.rank].badgeBg} ${
                          RANK_METADATA[pB.rank].badgeText
                        }`}
                      >
                        {RANK_METADATA[pB.rank].code}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onRemoveRule(rule.id)}
                  title="Xóa luật này"
                  aria-label="Xóa luật này"
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL THÊM LUẬT */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-400" />
                <span>Thêm luật cặp</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 py-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Người chơi thứ nhất (A) *
                </label>
                <select
                  required
                  value={playerAId}
                  onChange={(e) => setPlayerAId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Người chơi thứ hai (B) *
                </label>
                <select
                  required
                  value={playerBId}
                  onChange={(e) => setPlayerBId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Loại luật áp dụng
                </label>
                <div className="space-y-2">
                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                      ruleType === 'LOCK_PARTNER'
                        ? 'bg-emerald-950/40 border-emerald-600 text-emerald-300'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ruleType"
                      checked={ruleType === 'LOCK_PARTNER'}
                      onChange={() => setRuleType('LOCK_PARTNER')}
                      className="mt-0.5 text-emerald-600"
                    />
                    <div>
                      <span className="font-bold text-xs block">Cùng đội (LOCK_PARTNER)</span>
                      <span className="text-[11px] text-slate-400">
                        Luôn xếp 2 người chung đội mỗi khi cùng vào sân.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                      ruleType === 'AVOID_PARTNER'
                        ? 'bg-amber-950/40 border-amber-600 text-amber-300'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ruleType"
                      checked={ruleType === 'AVOID_PARTNER'}
                      onChange={() => setRuleType('AVOID_PARTNER')}
                      className="mt-0.5 text-amber-600"
                    />
                    <div>
                      <span className="font-bold text-xs block">Cấm cùng đội (AVOID_PARTNER)</span>
                      <span className="text-[11px] text-slate-400">
                        Không bao giờ xếp chung đội (nhưng vẫn có thể là đối thủ của nhau).
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                      ruleType === 'AVOID_MATCH'
                        ? 'bg-rose-950/40 border-rose-600 text-rose-300'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ruleType"
                      checked={ruleType === 'AVOID_MATCH'}
                      onChange={() => setRuleType('AVOID_MATCH')}
                      className="mt-0.5 text-rose-600"
                    />
                    <div>
                      <span className="font-bold text-xs block">Cấm đối đầu (AVOID_MATCH)</span>
                      <span className="text-[11px] text-slate-400">
                        Tránh xếp chung trận đấu (cả cùng đội lẫn đối thủ khác đội).
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg transition"
                >
                  Lưu luật
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

