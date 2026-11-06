/**
 * 12 bậc trình độ cầu lông theo thứ tự từ thấp lên cao
 */
export type BadmintonRank =
  | 'newbie' // Base: 1.0 - Mới chơi / cầm vợt
  | 'y-'     // Base: 2.0 - Yếu trừ
  | 'y'      // Base: 3.0 - Yếu
  | 'y+'     // Base: 4.0 - Yếu cộng
  | 'tby-'   // Base: 5.0 - Trung bình yếu trừ
  | 'tby'    // Base: 6.0 - Trung bình yếu
  | 'tby+'   // Base: 7.0 - Trung bình yếu cộng
  | 'tb-'    // Base: 8.5 - Trung bình trừ
  | 'tb'     // Base: 10.0 - Trung bình
  | 'tb+'    // Base: 11.5 - Trung bình cộng
  | 'tb++'   // Base: 13.0 - Trung bình khá
  | 'tbk';   // Base: 14.5 - Trung bình khá cứng / Khá

export type Sex = 'M' | 'F';

export type PlayerStatus = 'ACTIVE' | 'PAUSED';

export interface Player {
  id: string;
  name: string;
  sex: Sex;
  rank: BadmintonRank;
  status: PlayerStatus;
  /** 'ALL' hoặc ID sân (string = courtId) khi tách riêng nhóm người cố định theo sân */
  assignedPool: 'ALL' | string;
  /** Tổng số trận thực tế đã hoàn thành (cả đơn và đôi) */
  gamesPlayed: number;
  /**
   * Số trận bù ảo.
   * Khi người chơi vào muộn hoặc chuyển từ PAUSED -> ACTIVE,
   * virtualGamesOffset được tính tự động sao cho effectiveGames = gamesPlayed + virtualGamesOffset
   * bằng với mức thấp nhất của các thành viên đang Active để tránh bị ép đánh dồn dập.
   */
  virtualGamesOffset: number;
  /** Số lượt nghỉ liên tiếp kể từ trận gần nhất */
  waitStreak: number;
  /** Timestamp kết thúc trận gần nhất (0 nếu chưa đánh trận nào) */
  lastPlayedAt: number;
  /** Số trận đơn đã đánh */
  singlesCount: number;
  /** Cờ từ chối đánh đơn (true = chỉ muốn đánh đôi) */
  noSingles: boolean;
  /** Timestamp gia nhập buổi cầu */
  joinedAt: number;
}

export type PairRuleType =
  | 'LOCK_PARTNER'  // Luôn đứng cùng đội
  | 'AVOID_PARTNER' // Cấm đứng cùng đội
  | 'AVOID_MATCH';  // Hạn chế tối đa vào chung sân

export interface PairRule {
  id: string;
  playerAId: string;
  playerBId: string;
  type: PairRuleType;
}

export type MatchType = 'DOUBLES' | 'SINGLES';

/** Team: mảng ID người chơi (1 người với SINGLES, 2 người với DOUBLES) */
export type Team = string[];

export interface Lineup {
  type: MatchType;
  team1: Team;
  team2: Team;
  /** Nguồn gốc vị trí của từng người: do thuật toán ghép ('AUTO') hay Host gán tay ('MANUAL') */
  slotSource: Record<string, 'AUTO' | 'MANUAL'>;
  id?: string;
  isLockedByHost?: boolean;
}

export type NextUpSlotSource = 'AUTO' | 'MANUAL';

export interface NextUpDraft {
  type: MatchType;
  slots: (string | null)[];
  slotSource: (NextUpSlotSource | null)[];
}

export type CourtPolicy = 'MIX' | 'DOUBLES_ONLY' | 'SINGLES_ONLY';

export interface Court {
  id: string;
  name: string;
  isActive: boolean;
  policy: CourtPolicy;
  forcedType?: 'DOUBLES' | 'SINGLES' | null;
  currentMatch: (Lineup & { startedAt: number; id?: string }) | null;
  nextUp: NextUpDraft;
  suggestCursor: number;
}

export interface MatchHistory {
  id: string;
  courtId: string;
  type: MatchType;
  team1: Team;
  team2: Team;
  slotSource: Record<string, 'AUTO' | 'MANUAL'>;
  startedAt: number;
  endedAt: number;
  durationMinutes: number;
}

export type CourtMode = 'SHARED_POOL' | 'SPLIT_COURT';

export type AutoSinglesMode = 'OFF' | 'ASK' | 'AUTO';

export interface PenaltyWeights {
  waitStreakMultiplier: number;
  waitStreakSecondaryMultiplier: number;
  exactQuartetPenalty: number;
  exactPairPenalty: number;
  partnerRepeatBase: number;
  partnerRecentPenalty: number;
  opponentRepeatMultiplier: number;
  skillBalanceMultiplier: number;
  gender2M2FUnbalancedPenalty: number;
  gender2M2FMixedBonus: number;
  avoidMatchPenalty: number;
  singlesSkillBalanceMultiplier: number;
  singlesOpponentRepeatMultiplier: number;
  singlesRecentOpponentPenalty: number;
  singlesCountExcessMultiplier: number;
  gamesGapPenalty: number;
  oddGenderSplitPenalty: number;
}

export const DEFAULT_PENALTY_WEIGHTS: PenaltyWeights = {
  waitStreakMultiplier: 1200,
  waitStreakSecondaryMultiplier: 300,
  exactQuartetPenalty: 600,
  exactPairPenalty: 5000,
  partnerRepeatBase: 150,
  partnerRecentPenalty: 400,
  opponentRepeatMultiplier: 35,
  skillBalanceMultiplier: 65,
  gender2M2FUnbalancedPenalty: 250,
  gender2M2FMixedBonus: 50,
  avoidMatchPenalty: 200,
  singlesSkillBalanceMultiplier: 40,
  singlesOpponentRepeatMultiplier: 100,
  singlesRecentOpponentPenalty: 1500,
  singlesCountExcessMultiplier: 200,
  gamesGapPenalty: 6000,
  oddGenderSplitPenalty: 20,
};

export interface SessionSettings {
  /** Điểm cộng cho Nam so với Nữ (mặc định 1.5) */
  maleBonus: number;
  /** 'SHARED_POOL' (chung hàng chờ) hoặc 'SPLIT_COURT' (chia theo assignedPool) */
  courtMode: CourtMode;
  /** Tỉ lệ mong muốn giữa đôi và đơn (tổng = 1, mặc định 1/0 tức chỉ đôi) */
  matchMix: { doubles: number; singles: number };
  /** Chế độ tự động gợi ý đơn khi thiếu người: 'OFF' | 'ASK' | 'AUTO' */
  autoSingles: AutoSinglesMode;
  /** Thời gian tạm ẩn (phút) khi Host từ chối gợi ý đơn */
  autoSinglesSnoozeMin: number;
  /** Ưu tiên xếp Nam-Nữ vs Nam-Nữ khi có 2 Nam 2 Nữ (mặc định true) */
  preferMixedDoubles: boolean;
  /** Trọng số toàn bộ các hàm phạt để tinh chỉnh */
  weights: PenaltyWeights;
}

export interface PlayerLastMatchRecord {
  matchId: string;
  courtId: string;
  type: MatchType;
  participants: string[];
  partnerId?: string;
  opponents: string[];
  team1: Team;
  team2: Team;
  endedAt: number;
}

export interface MatchmakingStats {
  /** Số lần playerA và playerB đã làm đồng đội */
  partnerCount: Record<string, Record<string, number>>;
  /** Số lần playerA và playerB đã đối đầu nhau */
  opponentCount: Record<string, Record<string, number>>;
  /** Thông tin trận gần nhất của từng người chơi */
  lastMatchOfPlayer: Record<string, PlayerLastMatchRecord>;
  /** Trận gần nhất của từng sân */
  lastMatchOfCourt: Record<string, MatchHistory>;
}

export interface MatchScoreBreakdown {
  waitPenalty: number;
  exactQuartetRepeatPenalty: number;
  exactPairRepeatPenalty: number;
  partnerRepeatPenalty: number;
  opponentRepeatPenalty: number;
  skillBalancePenalty: number;
  genderStructurePenalty: number;
  avoidMatchPenalty: number;
  singlesCountPenalty: number;
  totalPenalty: number;
  team1Skill: number;
  team2Skill: number;
  skillDiff: number;
}

export interface FixedSlot {
  playerId: string;
  team: 1 | 2;
}

export type ValidationSeverity = 'BLOCK' | 'WARN';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  playerIds?: string[];
}

export interface LineupDescription {
  team1Skill: number;
  team2Skill: number;
  diff: number;
  label: 'Cân kèo' | 'Lệch nhẹ' | 'Lệch nhiều';
}

export interface MatchProposal {
  lineup: Lineup;
  debugScore: MatchScoreBreakdown;
  penalty: number;
  relaxed: boolean;
  relaxedReasons: string[];
  isProjectedFromCurrentMatch?: boolean;
}

export type CourtPlanStatus =
  | { status: 'OK'; proposals: MatchProposal[]; selectedIndex: number }
  | { status: 'WAIT'; reason: string }
  | { status: 'NEEDS_CONFIRM'; proposal: MatchProposal; reason: string };

export type CourtPlanMap = Record<string, CourtPlanStatus>;

export interface ReadyQueueItem {
  id: string;
  lineup: Lineup;
  courtId?: string;
  isLockedByHost: boolean;
  createdAt: number;
}

export interface BadmintonSessionSnapshot {
  players: Player[];
  courts: Court[];
  history: MatchHistory[];
  pairRules: PairRule[];
  settings: SessionSettings;
  stats: MatchmakingStats;
  mixDebt: { doubles: number; singles: number };
  readyQueue: ReadyQueueItem[];
  autoSinglesSnooze: Record<string, { untilTs: number; queueSizeAtSnooze: number }>;
}

export interface BadmintonSessionState extends BadmintonSessionSnapshot {
  schemaVersion: number;
  undoStack: BadmintonSessionSnapshot[];
  redoStack: BadmintonSessionSnapshot[];
}
