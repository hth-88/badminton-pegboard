import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { vibrateSuccess } from '../utils/vibrate';
import { GenderDot, RankBadge, StatusPill, UiModal } from './ui/Primitives';

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
    <UiModal
      isOpen={isOpen}
      onClose={onSkipOrClose}
      sheetOnMobile
      title={
        mode === 'POST_MATCH'
          ? 'Chốt nhanh trận vừa xong'
          : 'Cập nhật tỉ số & nhận xét'
      }
      subtitle={`${team1Names} vs ${team2Names}`}
      headerRight={
        mode === 'POST_MATCH' ? (
          <button
            type="button"
            onClick={onSkipOrClose}
            className="ui-btn ui-btn-secondary min-h-[40px] px-3 rounded-full text-[13px]"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>Bỏ qua</span>
          </button>
        ) : undefined
      }
      footer={
        <>
          <button
            type="button"
            onClick={onSkipOrClose}
            className="ui-btn ui-btn-secondary px-4"
          >
            {mode === 'POST_MATCH' ? 'Bỏ qua' : 'Hủy'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="ui-btn ui-btn-primary px-5 rounded-full"
          >
            <Check className="w-4 h-4" />
            <span>Lưu kết quả</span>
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 1. Match Score */}
        <div className="ui-tile p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span
              className="text-[14px] font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Tỉ số trận (tùy chọn)
            </span>
            <span
              className="text-[13px]"
              style={{ color: 'var(--text-muted)' }}
            >
              VD: 21 - 15
            </span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="space-y-1.5 text-center min-w-0">
              <div
                className="text-[13px] font-semibold truncate"
                style={{ color: 'var(--text-secondary)' }}
              >
                {team1Names}
              </div>
              <input
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                placeholder="21"
                value={score1}
                onChange={(e) => setScore1(e.target.value)}
                className="ui-input text-center font-bold text-[20px] tabular-nums"
                style={{ backgroundColor: 'var(--bg-surface)' }}
              />
            </div>

            <span
              className="font-bold text-[20px] pt-6"
              style={{ color: 'var(--text-muted)' }}
            >
              —
            </span>

            <div className="space-y-1.5 text-center min-w-0">
              <div
                className="text-[13px] font-semibold truncate"
                style={{ color: 'var(--text-secondary)' }}
              >
                {team2Names}
              </div>
              <input
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                placeholder="15"
                value={score2}
                onChange={(e) => setScore2(e.target.value)}
                className="ui-input text-center font-bold text-[20px] tabular-nums"
                style={{ backgroundColor: 'var(--bg-surface)' }}
              />
            </div>
          </div>
        </div>

        {/* 2. Balance Rating */}
        <div className="space-y-2">
          <div
            className="text-[14px] font-semibold flex items-center gap-1.5"
            style={{ color: 'var(--text-primary)' }}
          >
            <Scale
              className="w-4 h-4"
              style={{ color: 'var(--color-accent)' }}
            />
            <span>Đánh giá độ cân kèo</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { val: 'BALANCED', label: 'Cân hay', activeClass: 'ui-btn-primary' },
                { val: 'SLIGHT_GAP', label: 'Chênh nhẹ', activeClass: 'ui-btn-warning-soft' },
                { val: 'LOPSIDED', label: 'Chênh quá', activeClass: 'ui-btn-danger-soft' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() =>
                  setBalanceRating(balanceRating === opt.val ? null : opt.val)
                }
                className={`ui-btn px-2 ${
                  balanceRating === opt.val ? opt.activeClass : 'ui-btn-secondary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Match Bet */}
        <div className="ui-tile p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[14px] font-semibold flex items-center gap-1.5"
              style={{ color: 'var(--text-primary)' }}
            >
              <Flame
                className="w-4 h-4"
                style={{ color: 'var(--color-warning)' }}
              />
              <span>Kèo đánh độ</span>
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
              className={`ui-btn min-h-[38px] px-3.5 text-[13px] ${
                hasBet ? 'ui-btn-danger-soft' : 'ui-btn-warning-soft'
              }`}
            >
              {hasBet ? 'Bỏ kèo độ' : '+ Gắn kèo độ'}
            </button>
          </div>

          {hasBet && (
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {BET_PRESETS.map((p) => {
                  const selected =
                    betLabel === p.bet.label && betAmountVnd === p.bet.amountVnd;
                  return (
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
                      className={`ui-btn min-h-[36px] px-3 rounded-full text-[13px] ${
                        selected ? 'ui-btn-warning-soft' : 'ui-btn-secondary'
                      }`}
                      style={
                        !selected
                          ? { backgroundColor: 'var(--bg-surface)' }
                          : undefined
                      }
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label
                    className="block text-[13px] mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Tên kèo (VD: 1 nước, 20k)
                  </label>
                  <input
                    type="text"
                    value={betLabel}
                    onChange={(e) => setBetLabel(e.target.value)}
                    className="ui-input"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  />
                </div>
                <div>
                  <label
                    className="block text-[13px] mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Số tiền VNĐ (0 = hiện vật)
                  </label>
                  <input
                    type="number"
                    step={5000}
                    min={0}
                    value={betAmountVnd}
                    onChange={(e) => setBetAmountVnd(Number(e.target.value) || 0)}
                    className="ui-input font-semibold tabular-nums"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  />
                </div>
                <div>
                  <label
                    className="block text-[13px] mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Tính theo
                  </label>
                  <select
                    value={betUnit}
                    onChange={(e) => setBetUnit(e.target.value as BetUnit)}
                    className="ui-select"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  >
                    <option value="PER_PLAYER">Mỗi người thua</option>
                    <option value="PER_TEAM">Cả đội thua</option>
                  </select>
                </div>
                <div>
                  <label
                    className="block text-[13px] mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Hướng trả độ
                  </label>
                  <select
                    value={betPayoutMode}
                    onChange={(e) => setBetPayoutMode(e.target.value as BetPayoutMode)}
                    className="ui-select"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  >
                    <option value="TEAM_TO_TEAM">Thua trả Đội thắng</option>
                    <option value="LOSER_TO_FUND">Thua góp Quỹ chung</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t ui-divider">
                <div
                  className="text-[14px] font-semibold flex items-center gap-1.5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Trophy
                    className="w-4 h-4"
                    style={{ color: 'var(--color-warning)' }}
                  />
                  <span>Chọn đội thắng độ</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { team: 1 as const, label: 'Đội 1 thắng', names: team1Names },
                    { team: 2 as const, label: 'Đội 2 thắng', names: team2Names },
                  ].map((item) => {
                    const active = betWinner === item.team;
                    return (
                      <button
                        key={item.team}
                        type="button"
                        onClick={() =>
                          setBetWinner(betWinner === item.team ? null : item.team)
                        }
                        className="min-h-[56px] p-3 rounded-xl text-left transition"
                        style={
                          active
                            ? {
                                backgroundColor: 'var(--color-accent-soft)',
                                border: '1px solid var(--color-accent)',
                                color: 'var(--color-accent)',
                              }
                            : {
                                backgroundColor: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                              }
                        }
                      >
                        <div className="font-bold text-[14px]">{item.label}</div>
                        <div
                          className="text-[12px] truncate mt-0.5"
                          style={{
                            color: active
                              ? 'var(--color-accent)'
                              : 'var(--text-secondary)',
                          }}
                        >
                          {item.names}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Private Player Feedback (Host only) */}
        {!isViewer && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span
                className="text-[14px] font-semibold flex items-center gap-1.5"
                style={{ color: 'var(--text-primary)' }}
              >
                <Lock
                  className="w-4 h-4"
                  style={{ color: 'var(--color-warning)' }}
                />
                <span>Nhận xét riêng từng người</span>
              </span>
              <StatusPill tone="warning">Riêng tư</StatusPill>
            </div>

            <div className="space-y-2.5">
              {matchPlayerIds.map((pid) => {
                const p = playerMap.get(pid);
                if (!p) return null;
                const fb = playerFeedback[pid] || { tags: [], note: '' };

                return (
                  <div key={pid} className="ui-tile p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <GenderDot sex={p.sex} />
                        <span
                          className="font-semibold text-[14px] truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {p.name}
                        </span>
                        <RankBadge rank={p.rank} surface="tile" />
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => toggleFeedbackTag(pid, 'OVER_RANK')}
                          className={`ui-btn min-h-[36px] px-2.5 text-[12px] ${
                            fb.tags.includes('OVER_RANK')
                              ? 'ui-btn-accent-soft'
                              : 'ui-btn-secondary'
                          }`}
                          style={
                            !fb.tags.includes('OVER_RANK')
                              ? { backgroundColor: 'var(--bg-surface)' }
                              : undefined
                          }
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>Vượt trình</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFeedbackTag(pid, 'UNDER_RANK')}
                          className={`ui-btn min-h-[36px] px-2.5 text-[12px] ${
                            fb.tags.includes('UNDER_RANK')
                              ? 'ui-btn-danger-soft'
                              : 'ui-btn-secondary'
                          }`}
                          style={
                            !fb.tags.includes('UNDER_RANK')
                              ? { backgroundColor: 'var(--bg-surface)' }
                              : undefined
                          }
                        >
                          <TrendingDown className="w-3.5 h-3.5" />
                          <span>Hơi đuối</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFeedbackTag(pid, 'GREAT_PLAY')}
                          className={`ui-btn min-h-[36px] px-2.5 text-[12px] ${
                            fb.tags.includes('GREAT_PLAY')
                              ? 'ui-btn-warning-soft'
                              : 'ui-btn-secondary'
                          }`}
                          style={
                            !fb.tags.includes('GREAT_PLAY')
                              ? { backgroundColor: 'var(--bg-surface)' }
                              : undefined
                          }
                        >
                          <Star className="w-3.5 h-3.5" />
                          <span>Hay</span>
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Ghi chú kín ngắn (VD: phòng thủ chắc, hơi mệt)..."
                      value={fb.note || ''}
                      onChange={(e) => setFeedbackNote(pid, e.target.value)}
                      className="ui-input"
                      style={{ backgroundColor: 'var(--bg-surface)' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </UiModal>
  );
};
