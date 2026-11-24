import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Flame,
  Trophy,
  Lock,
  Scale,
  TrendingUp,
  TrendingDown,
  Star,
  Check,
  FastForward,
} from 'lucide-react';
import type {
  BetCategory,
  BetPayoutMode,
  BetUnit,
  MatchBalanceRating,
  MatchBet,
  MatchHistory,
  MatchScore,
  Player,
} from '../types/badminton';
import {
  getPrivateMatchReview,
  savePrivateMatchReview,
  type PlayerFeedbackTag,
  type PlayerMatchFeedback,
} from '../engine/matchFeedbackStorage';
import { RANK_METADATA } from '../engine/skillConfig';
import { vibrateSuccess } from '../utils/vibrate';

export interface PostMatchModalProps {
  isOpen: boolean;
  match: MatchHistory | null;
  players: Player[];
  mode: 'POST_MATCH' | 'EDIT_HISTORY';
  isViewer?: boolean;
  onSave: (result: {
    matchId: string;
    score: MatchScore | null;
    balanceRating: MatchBalanceRating | null;
    bet: MatchBet | null;
    betWinner: 1 | 2 | null;
  }) => void;
  onSkipOrClose: () => void;
}

const BET_PRESETS: Array<{ label: string; bet: MatchBet }> = [
  {
    label: '1 nước/người',
    bet: {
      category: 'DRINK',
      label: '1 nước',
      quantity: 1,
      unit: 'PER_PLAYER',
      amountVnd: 0,
      payoutMode: 'TEAM_TO_TEAM',
    },
  },
  {
    label: '1 quả cầu/đội',
    bet: {
      category: 'SHUTTLE',
      label: '1 quả cầu',
      quantity: 1,
      unit: 'PER_TEAM',
      amountVnd: 0,
      payoutMode: 'LOSER_TO_FUND',
    },
  },
  {
    label: '20k/người',
    bet: {
      category: 'MONEY',
      label: '20k/người',
      quantity: 1,
      unit: 'PER_PLAYER',
      amountVnd: 20000,
      payoutMode: 'TEAM_TO_TEAM',
    },
  },
  {
    label: '50k/đội',
    bet: {
      category: 'MONEY',
      label: '50k/đội',
      quantity: 1,
      unit: 'PER_TEAM',
      amountVnd: 50000,
      payoutMode: 'TEAM_TO_TEAM',
    },
  },
];

export const PostMatchModal: React.FC<PostMatchModalProps> = ({
  isOpen,
  match,
  players,
  mode,
  isViewer = false,
  onSave,
  onSkipOrClose,
}) => {
  const [score1, setScore1] = useState<string>('');
  const [score2, setScore2] = useState<string>('');
  const [balanceRating, setBalanceRating] = useState<MatchBalanceRating | null>(null);

  const [hasBet, setHasBet] = useState(false);
  const [betCategory, setBetCategory] = useState<BetCategory>('DRINK');
  const [betLabel, setBetLabel] = useState('1 nước');
  const [betQuantity, setBetQuantity] = useState(1);
  const [betUnit, setBetUnit] = useState<BetUnit>('PER_PLAYER');
  const [betAmountVnd, setBetAmountVnd] = useState<number>(0);
  const [betPayoutMode, setBetPayoutMode] = useState<BetPayoutMode>('TEAM_TO_TEAM');
  const [betWinner, setBetWinner] = useState<1 | 2 | null>(null);

  const [playerFeedback, setPlayerFeedback] = useState<
    Record<string, PlayerMatchFeedback>
  >({});

  useEffect(() => {
    if (!isOpen || !match) return;

    setScore1(match.score ? String(match.score.team1) : '');
    setScore2(match.score ? String(match.score.team2) : '');
    setBalanceRating(match.balanceRating || null);

    if (match.bet) {
      setHasBet(true);
      setBetCategory(match.bet.category);
      setBetLabel(match.bet.label);
      setBetQuantity(match.bet.quantity);
      setBetUnit(match.bet.unit);
      setBetAmountVnd(match.bet.amountVnd);
      setBetPayoutMode(match.bet.payoutMode);
      setBetWinner(match.betWinner ?? null);
    } else {
      setHasBet(false);
      setBetCategory('DRINK');
      setBetLabel('1 nước');
      setBetQuantity(1);
      setBetUnit('PER_PLAYER');
      setBetAmountVnd(0);
      setBetPayoutMode('TEAM_TO_TEAM');
      setBetWinner(null);
    }

    const existingPrivate = !isViewer ? getPrivateMatchReview(match.id) : null;
    setPlayerFeedback(existingPrivate?.playerFeedback || {});
  }, [isOpen, match, isViewer]);

  // Tự động gợi ý đội thắng kèo độ nếu nhập tỉ số khác nhau và chưa chọn đội thắng
  useEffect(() => {
    if (!hasBet) return;
    if (score1.trim() === '' || score2.trim() === '') return;
    const n1 = Number(score1);
    const n2 = Number(score2);
    if (!Number.isFinite(n1) || !Number.isFinite(n2)) return;
    if (n1 > n2) setBetWinner(1);
    else if (n2 > n1) setBetWinner(2);
  }, [score1, score2, hasBet]);

  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  if (!isOpen || !match) return null;

  const team1Names = match.team1.map((id) => playerMap.get(id)?.name || id).join(' & ');
  const team2Names = match.team2.map((id) => playerMap.get(id)?.name || id).join(' & ');
  const matchPlayerIds = [...match.team1, ...match.team2];

  const toggleFeedbackTag = (pid: string, tag: PlayerFeedbackTag) => {
    setPlayerFeedback((prev) => {
      const curr = prev[pid] || { tags: [] };
      const exists = curr.tags.includes(tag);
      let nextTags = exists
        ? curr.tags.filter((t) => t !== tag)
        : [...curr.tags, tag];
      // Không để cùng lúc Vượt trình và Hơi đuối
      if (!exists && tag === 'OVER_RANK') {
        nextTags = nextTags.filter((t) => t !== 'UNDER_RANK');
      } else if (!exists && tag === 'UNDER_RANK') {
        nextTags = nextTags.filter((t) => t !== 'OVER_RANK');
      }
      return {
        ...prev,
        [pid]: { ...curr, tags: nextTags },
      };
    });
  };

  const setFeedbackNote = (pid: string, note: string) => {
    setPlayerFeedback((prev) => {
      const curr = prev[pid] || { tags: [] };
      return {
        ...prev,
        [pid]: { ...curr, note },
      };
    });
  };

  const handleSave = () => {
    let finalScore: MatchScore | null = null;
    if (score1.trim() !== '' && score2.trim() !== '') {
      const n1 = Math.max(0, Math.min(99, Math.round(Number(score1))));
      const n2 = Math.max(0, Math.min(99, Math.round(Number(score2))));
      if (Number.isFinite(n1) && Number.isFinite(n2)) {
        finalScore = { team1: n1, team2: n2 };
      }
    }

    const finalBet: MatchBet | null =
      hasBet && betLabel.trim()
        ? {
            category: betCategory,
            label: betLabel.trim(),
            quantity: Math.max(1, Number(betQuantity) || 1),
            unit: betUnit,
            amountVnd: Math.max(0, Math.round(Number(betAmountVnd) || 0)),
            payoutMode: betPayoutMode,
          }
        : null;

    if (!isViewer) {
      savePrivateMatchReview(match.id, playerFeedback);
    }

    vibrateSuccess();
    onSave({
      matchId: match.id,
      score: finalScore,
      balanceRating,
      bet: finalBet,
      betWinner: finalBet ? betWinner : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg text-slate-100 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header với nút Bỏ qua nổi bật */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/50">
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-white truncate">
              {mode === 'POST_MATCH'
                ? 'Chốt nhanh trận vừa xong'
                : 'Cập nhật tỉ số & nhận xét'}
            </h3>
            <p className="text-[11px] text-slate-400 truncate">
              {team1Names} <span className="text-amber-400 font-bold">vs</span> {team2Names}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {mode === 'POST_MATCH' && (
              <button
                type="button"
                onClick={onSkipOrClose}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-extrabold flex items-center gap-1 transition"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Bỏ qua (Mặc định đều)</span>
              </button>
            )}
            <button
              type="button"
              onClick={onSkipOrClose}
              aria-label="Đóng"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* 1. Tỉ số trận (Tùy chọn) */}
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="font-bold text-slate-300 flex items-center justify-between">
              <span>Tỉ số trận (Tùy chọn)</span>
              <span className="text-[10px] font-normal text-slate-500">VD: 21 - 15</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="space-y-1 text-center">
                <div className="text-[10px] font-bold text-sky-400 truncate">{team1Names}</div>
                <input
                  type="number"
                  min={0}
                  max={99}
                  inputMode="numeric"
                  placeholder="21"
                  value={score1}
                  onChange={(e) => setScore1(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 text-center font-black text-lg text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <span className="font-black text-slate-500 text-lg pt-4">-</span>
              <div className="space-y-1 text-center">
                <div className="text-[10px] font-bold text-pink-400 truncate">{team2Names}</div>
                <input
                  type="number"
                  min={0}
                  max={99}
                  inputMode="numeric"
                  placeholder="15"
                  value={score2}
                  onChange={(e) => setScore2(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 text-center font-black text-lg text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* 2. Độ cân kèo 1 chạm */}
          <div className="space-y-1.5">
            <div className="font-bold text-slate-300 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-emerald-400" />
              <span>Độ cân kèo trận này (giúp máy học cho các trận sau)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  val: 'BALANCED' as const,
                  label: '⚖️ Cân hay',
                  active: 'bg-emerald-600 text-white border-emerald-500',
                },
                {
                  val: 'SLIGHT_GAP' as const,
                  label: '↗️ Chênh nhẹ',
                  active: 'bg-amber-600 text-white border-amber-500',
                },
                {
                  val: 'LOPSIDED' as const,
                  label: '⚠️ Chênh quá',
                  active: 'bg-rose-600 text-white border-rose-500',
                },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() =>
                    setBalanceRating(balanceRating === opt.val ? null : opt.val)
                  }
                  className={`py-2 px-2 rounded-xl border font-bold text-xs transition ${
                    balanceRating === opt.val
                      ? opt.active
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Kèo Đánh Độ */}
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-amber-800/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Kèo Đánh Độ</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  if (hasBet) {
                    setHasBet(false);
                    setBetWinner(null);
                  } else {
                    setHasBet(true);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                  hasBet
                    ? 'bg-rose-950/60 border-rose-700 text-rose-300'
                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                }`}
              >
                {hasBet ? 'Bỏ kèo độ' : '+ Gắn kèo độ'}
              </button>
            </div>

            {hasBet && (
              <div className="space-y-3 pt-1">
                {/* Preset chips */}
                <div className="flex flex-wrap gap-1.5">
                  {BET_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setBetCategory(p.bet.category);
                        setBetLabel(p.bet.label);
                        setBetQuantity(p.bet.quantity);
                        setBetUnit(p.bet.unit);
                        setBetAmountVnd(p.bet.amountVnd);
                        setBetPayoutMode(p.bet.payoutMode);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        betLabel === p.bet.label && betAmountVnd === p.bet.amountVnd
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Chi tiết kèo độ */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      Tên kèo (VD: 1 nước, 20k)
                    </label>
                    <input
                      type="text"
                      value={betLabel}
                      onChange={(e) => setBetLabel(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      Số tiền VNĐ (0 = hiện vật)
                    </label>
                    <input
                      type="number"
                      step={5000}
                      min={0}
                      value={betAmountVnd}
                      onChange={(e) => setBetAmountVnd(Number(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-amber-300"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Tính theo</label>
                    <select
                      value={betUnit}
                      onChange={(e) => setBetUnit(e.target.value as BetUnit)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-slate-100"
                    >
                      <option value="PER_PLAYER">Mỗi người thua</option>
                      <option value="PER_TEAM">Cả đội thua</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Hướng trả độ</label>
                    <select
                      value={betPayoutMode}
                      onChange={(e) => setBetPayoutMode(e.target.value as BetPayoutMode)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-slate-100"
                    >
                      <option value="TEAM_TO_TEAM">Thua trả Đội thắng</option>
                      <option value="LOSER_TO_FUND">Thua góp Quỹ chung</option>
                    </select>
                  </div>
                </div>

                {/* Chọn đội thắng */}
                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                  <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span>Chọn đội thắng độ:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBetWinner(betWinner === 1 ? null : 1)}
                      className={`p-2 rounded-xl border text-left transition ${
                        betWinner === 1
                          ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold text-[11px]">🏆 Đội 1 thắng</div>
                      <div className="text-[10px] opacity-80 truncate">{team1Names}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBetWinner(betWinner === 2 ? null : 2)}
                      className={`p-2 rounded-xl border text-left transition ${
                        betWinner === 2
                          ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold text-[11px]">🏆 Đội 2 thắng</div>
                      <div className="text-[10px] opacity-80 truncate">{team2Names}</div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. Nhận xét kín từng người (CHỈ Chủ sân, ẩn với VIEWER) */}
          {!isViewer && (
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Nhận xét riêng từng người (Tùy chọn)</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-700/50">
                  🔒 Chỉ lưu kín trên máy bạn
                </span>
              </div>

              <div className="space-y-2">
                {matchPlayerIds.map((pid) => {
                  const p = playerMap.get(pid);
                  if (!p) return null;
                  const fb = playerFeedback[pid] || { tags: [], note: '' };
                  const meta = RANK_METADATA[p.rank];

                  return (
                    <div
                      key={pid}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-slate-100 truncate">
                            {p.name}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${meta.badgeBg} ${meta.badgeText}`}
                          >
                            {meta.code}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleFeedbackTag(pid, 'OVER_RANK')}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-0.5 transition ${
                              fb.tags.includes('OVER_RANK')
                                ? 'bg-emerald-600 text-white border-emerald-500'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <TrendingUp className="w-3 h-3" />
                            <span>Vượt trình</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFeedbackTag(pid, 'UNDER_RANK')}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-0.5 transition ${
                              fb.tags.includes('UNDER_RANK')
                                ? 'bg-rose-600 text-white border-rose-500'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <TrendingDown className="w-3 h-3" />
                            <span>Hơi đuối</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFeedbackTag(pid, 'GREAT_PLAY')}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-0.5 transition ${
                              fb.tags.includes('GREAT_PLAY')
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <Star className="w-3 h-3" />
                            <span>Hay</span>
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        placeholder="Ghi chú kín ngắn (VD: phòng thủ chắc, hơi mệt)..."
                        value={fb.note || ''}
                        onChange={(e) => setFeedbackNote(pid, e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 placeholder:text-slate-600"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-950/60">
          <button
            type="button"
            onClick={onSkipOrClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            {mode === 'POST_MATCH' ? 'Bỏ qua' : 'Hủy'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-lg flex items-center gap-1.5 transition"
          >
            <Check className="w-4 h-4" />
            <span>Lưu kết quả</span>
          </button>
        </div>
      </div>
    </div>
  );
};
