import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Lock,
  KeyRound,
  TrendingUp,
  TrendingDown,
  Check,
  Loader2,
  Lightbulb,
} from 'lucide-react';
import type { BadmintonRank, MatchHistory, Player } from '../types/badminton';
import { getAllPrivateMatchReviews } from '../engine/matchFeedbackStorage';
import { analyzePlayerRanksLocal, type RankSuggestion } from '../engine/skillAnalyzer';
import { getClubRoster, syncClubMemberRank } from '../engine/clubRosterStorage';
import { RANK_METADATA } from '../engine/skillConfig';
import {
  clearGeminiApiKey,
  getGeminiApiKey,
  requestGeminiRankAnalysis,
  saveGeminiApiKey,
} from '../services/geminiRankAdvisor';
import { vibrateSuccess, vibrateWarning } from '../utils/vibrate';
import { StatusPill } from './ui/Primitives';

interface RankAdvisorPanelProps {
  players: Player[];
  history: MatchHistory[];
  maleBonus: number;
  onApplyRank: (playerId: string, newRank: BadmintonRank) => void;
}

export const RankAdvisorPanel: React.FC<RankAdvisorPanelProps> = ({
  players,
  history,
  maleBonus,
  onApplyRank,
}) => {
  const localAnalysis = useMemo(
    () => analyzePlayerRanksLocal(players, history, getAllPrivateMatchReviews()),
    [players, history]
  );

  const [apiKey, setApiKey] = useState<string>(() => getGeminiApiKey());
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{
    summary: string;
    suggestions: RankSuggestion[];
    pairInsights: string[];
  } | null>(null);
  const [appliedPlayerIds, setAppliedPlayerIds] = useState<Set<string>>(new Set());

  const handleApplySuggestion = (s: RankSuggestion) => {
    vibrateSuccess();
    onApplyRank(s.playerId, s.suggestedRank);
    syncClubMemberRank(s.playerName, s.suggestedRank);
    setAppliedPlayerIds((prev) => new Set(prev).add(s.playerId));
  };

  const handleRunGemini = async () => {
    const activeKey = apiKey.trim() || getGeminiApiKey();
    if (!activeKey) {
      setShowKeyConfig(true);
      setAiError('Vui lòng nhập Gemini API Key miễn phí trước khi phân tích.');
      return;
    }

    setAiError(null);
    setLoadingAi(true);
    try {
      const res = await requestGeminiRankAnalysis({
        apiKey: activeKey,
        players,
        history,
        privateReviews: getAllPrivateMatchReviews(),
        clubRoster: getClubRoster(),
        maleBonus,
      });
      if ('error' in res) {
        vibrateWarning();
        setAiError(res.error);
      } else {
        vibrateSuccess();
        setAiResult(res.data);
      }
    } finally {
      setLoadingAi(false);
    }
  };

  const renderSuggestionCard = (s: RankSuggestion) => {
    const isApplied = appliedPlayerIds.has(s.playerId);
    const curMeta = RANK_METADATA[s.currentRank];
    const nextMeta = RANK_METADATA[s.suggestedRank];

    return (
      <div
        key={`${s.source}_${s.playerId}`}
        className="ui-tile p-3.5 space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {s.direction === 'UP' ? (
              <TrendingUp
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-accent)' }}
              />
            ) : (
              <TrendingDown
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-danger)' }}
              />
            )}
            <span
              className="font-semibold text-[15px] truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {s.playerName}
            </span>
            <StatusPill tone="neutral" className="tabular-nums">
              {curMeta.code} → {nextMeta.code}
            </StatusPill>
            <StatusPill tone={s.confidence === 'HIGH' ? 'accent' : 'warning'}>
              {s.confidence === 'HIGH' ? 'Rõ rệt' : 'Gợi ý'}
            </StatusPill>
          </div>

          <button
            type="button"
            disabled={isApplied}
            onClick={() => handleApplySuggestion(s)}
            className={`ui-btn min-h-[40px] px-3.5 text-[13px] ${
              isApplied ? 'ui-btn-accent-soft' : 'ui-btn-primary rounded-full'
            }`}
          >
            {isApplied && <Check className="w-3.5 h-3.5" />}
            <span>
              {isApplied
                ? 'Đã áp dụng'
                : `Áp dụng (${curMeta.code} → ${nextMeta.code})`}
            </span>
          </button>
        </div>

        <p
          className="text-[14px] leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {s.reason}
        </p>
      </div>
    );
  };

  return (
    <div className="ui-card p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3
            className="font-bold text-[16px] flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Sparkles
              className="w-4 h-4"
              style={{ color: 'var(--color-accent)' }}
            />
            <span>Phân tích trình độ &amp; Trợ lý AI</span>
          </h3>
          <p
            className="text-[13px] mt-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            Tổng hợp tỉ số, nhận xét riêng và ghi chú Sổ CLB cho Ban điều hành
          </p>
        </div>

        <StatusPill tone="warning">
          <Lock className="w-3 h-3" />
          <span>Chỉ quản trị</span>
        </StatusPill>
      </div>

      {/* Session Performance Summary Table */}
      {(() => {
        const activeSummaries = localAnalysis.summaries
          .filter(
            (s) =>
              s.scoredMatches > 0 ||
              s.overRankTags > 0 ||
              s.underRankTags > 0 ||
              s.greatPlayTags > 0 ||
              s.notes.length > 0
          )
          .sort((a, b) => b.scoredMatches - a.scoredMatches || b.avgPointDiff - a.avgPointDiff);

        return (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div
                className="text-[13px] font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                Tổng hợp phong độ buổi chơi ({activeSummaries.length} người có dữ liệu)
              </div>
            </div>

            {activeSummaries.length === 0 ? (
              <div
                className="ui-tile p-4 text-[14px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Chưa có trận nào được nhập tỉ số hoặc nhận xét trong buổi này.
              </div>
            ) : (
              <div className="space-y-2">
                {activeSummaries.map((s) => (
                  <div key={s.playerId} className="ui-tile p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="font-semibold text-[14px] truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {s.playerName}
                        </span>
                        <span
                          className="text-[12px] font-semibold px-2 py-0.5 rounded-md"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {s.currentRank}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[13px] tabular-nums">
                        {s.scoredMatches > 0 && (
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {s.wins}T–{s.losses}B ({s.avgPointDiff >= 0 ? '+' : ''}
                            {s.avgPointDiff}đ)
                          </span>
                        )}
                        {s.sessionFormOffset !== 0 && (
                          <StatusPill
                            tone={s.sessionFormOffset > 0 ? 'accent' : 'warning'}
                          >
                            Phong độ {s.sessionFormOffset > 0 ? '+' : ''}
                            {s.sessionFormOffset}đ
                          </StatusPill>
                        )}
                      </div>
                    </div>

                    {(s.overRankTags > 0 ||
                      s.underRankTags > 0 ||
                      s.greatPlayTags > 0) && (
                      <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
                        {s.overRankTags > 0 && (
                          <StatusPill tone="accent">
                            Vượt trình ×{s.overRankTags}
                          </StatusPill>
                        )}
                        {s.underRankTags > 0 && (
                          <StatusPill tone="warning">
                            Hơi đuối ×{s.underRankTags}
                          </StatusPill>
                        )}
                        {s.greatPlayTags > 0 && (
                          <StatusPill tone="neutral">
                            Đánh hay ×{s.greatPlayTags}
                          </StatusPill>
                        )}
                      </div>
                    )}

                    {s.notes.length > 0 && (
                      <div
                        className="text-[12px] italic"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Ghi chú: {s.notes.join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Local Offline Analysis */}
      <div className="space-y-2.5">
        <div
          className="text-[13px] font-semibold"
          style={{ color: 'var(--text-secondary)' }}
        >
          Đề xuất cục bộ (không cần mạng)
        </div>
        {localAnalysis.suggestions.length === 0 ? (
          <div
            className="ui-tile p-4 text-[14px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            Chưa có người chơi nào lệch trình rõ rệt theo tỉ số &amp; nhận xét hiện tại.
          </div>
        ) : (
          <div className="space-y-2">
            {localAnalysis.suggestions.map((s) => renderSuggestionCard(s))}
          </div>
        )}
      </div>

      {/* Gemini AI Analysis */}
      <div className="pt-3 border-t ui-divider space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            disabled={loadingAi || history.length === 0}
            onClick={handleRunGemini}
            className="ui-btn ui-btn-primary flex-1 min-w-[200px] rounded-full"
          >
            {loadingAi ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang phân tích buổi đánh...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>AI Gemini phân tích trình độ</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowKeyConfig((prev) => !prev)}
            className="ui-btn ui-btn-secondary px-4"
          >
            <KeyRound
              className="w-4 h-4"
              style={{ color: 'var(--color-warning)' }}
            />
            <span>{apiKey ? 'Đổi Key AI' : 'Nhập Key Gemini'}</span>
          </button>
        </div>

        {showKeyConfig && (
          <div className="ui-tile p-4 space-y-2.5">
            <div
              className="text-[13px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              Gemini API Key (miễn phí tại{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold"
                style={{ color: 'var(--color-accent)' }}
              >
                aistudio.google.com/apikey
              </a>
              , chỉ lưu trên máy bạn)
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza..."
                className="ui-input font-mono-tabular"
                style={{ backgroundColor: 'var(--bg-surface)' }}
              />
              <button
                type="button"
                onClick={() => {
                  saveGeminiApiKey(apiKey);
                  setShowKeyConfig(false);
                  vibrateSuccess();
                }}
                className="ui-btn ui-btn-primary px-4 shrink-0"
              >
                Lưu
              </button>
              {apiKey && (
                <button
                  type="button"
                  onClick={() => {
                    clearGeminiApiKey();
                    setApiKey('');
                  }}
                  className="ui-btn ui-btn-secondary px-3 shrink-0"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                >
                  Xóa
                </button>
              )}
            </div>
          </div>
        )}

        {aiError && (
          <div className="ui-banner-danger p-3 text-[13px]">{aiError}</div>
        )}

        {aiResult && (
          <div className="ui-tile p-4 space-y-3">
            <div
              className="text-[14px] font-bold"
              style={{ color: 'var(--color-accent)' }}
            >
              Nhận định của AI Gemini
            </div>
            <p
              className="text-[14px] leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
            >
              {aiResult.summary}
            </p>

            {aiResult.suggestions.length > 0 && (
              <div className="space-y-2">
                {aiResult.suggestions.map((s) => renderSuggestionCard(s))}
              </div>
            )}

            {aiResult.pairInsights.length > 0 && (
              <div className="pt-2.5 border-t ui-divider space-y-1.5">
                <div
                  className="font-semibold text-[13px] flex items-center gap-1.5"
                  style={{ color: 'var(--color-warning)' }}
                >
                  <Lightbulb className="w-4 h-4" />
                  <span>Gợi ý ghép cặp / tách cặp</span>
                </div>
                <ul
                  className="list-disc list-inside space-y-1 text-[14px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {aiResult.pairInsights.map((tip, idx) => (
                    <li key={idx}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
