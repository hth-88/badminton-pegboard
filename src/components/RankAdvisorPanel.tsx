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
  const privateReviews = useMemo(() => getAllPrivateMatchReviews(), [history]);
  const localAnalysis = useMemo(
    () => analyzePlayerRanksLocal(players, history, privateReviews),
    [players, history, privateReviews]
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
        privateReviews,
        clubRoster: getClubRoster(),
        maleBonus,
      });
      if (!res.ok) {
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
        className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            {s.direction === 'UP' ? (
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-bold text-slate-100 text-xs truncate">{s.playerName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
              {curMeta.code} → {nextMeta.code}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                s.confidence === 'HIGH'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                  : 'bg-amber-950 text-amber-300 border border-amber-700/50'
              }`}
            >
              {s.confidence === 'HIGH' ? 'Rõ rệt' : 'Gợi ý'}
            </span>
          </div>

          <button
            type="button"
            disabled={isApplied}
            onClick={() => handleApplySuggestion(s)}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition ${
              isApplied
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
            }`}
          >
            {isApplied && <Check className="w-3 h-3" />}
            <span>
              {isApplied ? 'Đã áp dụng ✓' : `Áp dụng (${curMeta.code} → ${nextMeta.code})`}
            </span>
          </button>
        </div>

        <p className="text-[11px] text-slate-300 leading-relaxed">{s.reason}</p>
      </div>
    );
  };

  return (
    <div className="p-4 rounded-3xl bg-slate-900 border border-indigo-800/50 space-y-3.5 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-bold text-sm text-indigo-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Phân tích trình độ &amp; Trợ lý AI Gemini</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Tổng hợp tỉ số, nhận xét riêng và ghi chú Sổ CLB để Chủ sân tham khảo chỉnh trình
          </p>
        </div>

        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-950/70 text-amber-300 border border-amber-700/60 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          <span>Chỉ hiển thị với quản trị</span>
        </span>
      </div>

      {/* Tầng 1: Gợi ý cục bộ Offline */}
      <div className="space-y-2">
        <div className="font-bold text-slate-300 text-[11px]">
          📊 Đề xuất cục bộ (Chạy sẵn không cần mạng):
        </div>
        {localAnalysis.suggestions.length === 0 ? (
          <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800/80 text-slate-400 text-[11px]">
            Chưa có người chơi nào lệch trình rõ rệt theo tỉ số &amp; thẻ nhận xét hiện tại.
          </div>
        ) : (
          <div className="space-y-2">
            {localAnalysis.suggestions.map((s) => renderSuggestionCard(s))}
          </div>
        )}
      </div>

      {/* Tầng 2: AI Gemini phân tích sâu */}
      <div className="pt-2 border-t border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            disabled={loadingAi || history.length === 0}
            onClick={handleRunGemini}
            className="flex-1 min-w-[200px] py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg flex items-center justify-center gap-2 transition"
          >
            {loadingAi ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>AI Gemini đang phân tích dữ liệu buổi đánh...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>✨ AI Gemini phân tích trình độ</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowKeyConfig((prev) => !prev)}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span>{apiKey ? 'Đổi Key AI' : 'Nhập Key Gemini'}</span>
          </button>
        </div>

        {showKeyConfig && (
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="text-[11px] text-slate-300 font-semibold">
              Gemini API Key (Miễn phí tại{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 underline"
              >
                aistudio.google.com/apikey
              </a>
              , chỉ lưu trên máy bạn):
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-100"
              />
              <button
                type="button"
                onClick={() => {
                  saveGeminiApiKey(apiKey);
                  setShowKeyConfig(false);
                  vibrateSuccess();
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
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
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Xóa
                </button>
              )}
            </div>
          </div>
        )}

        {aiError && (
          <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-700/60 text-rose-200 text-[11px]">
            {aiError}
          </div>
        )}

        {aiResult && (
          <div className="p-3 rounded-2xl bg-indigo-950/30 border border-indigo-700/50 space-y-2.5">
            <div className="text-xs font-bold text-indigo-200">
              Nhận định của AI Gemini:
            </div>
            <p className="text-[11px] text-slate-200 leading-relaxed">{aiResult.summary}</p>

            {aiResult.suggestions.length > 0 && (
              <div className="space-y-2">
                {aiResult.suggestions.map((s) => renderSuggestionCard(s))}
              </div>
            )}

            {aiResult.pairInsights.length > 0 && (
              <div className="pt-2 border-t border-indigo-800/40 space-y-1">
                <div className="font-bold text-[11px] text-amber-300 flex items-center gap-1">
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Gợi ý ghép cặp / tách cặp:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-300">
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
