import { todayUtcDateString } from '@/systems/DailyQuest';

export const CRYSTAL_MINE_SAVE_KEY = 'hbcc:crystal-mine-survey:v1';
export const CRYSTAL_MINE_MINIGAME_ID = 'crystal_mine_survey';
export const CRYSTAL_MINE_SOURCE = 'energy_cave:crystal_survey';
export const CRYSTAL_MINE_DAILY_REWARD_LIMIT = 2;
export const CRYSTAL_MINE_TARGET_SCORE = 8;

export interface CrystalMineSurveyState {
  readonly date: string;
  readonly bestScore: number;
  readonly rewardClaims: number;
  readonly totalRuns: number;
}

export interface CrystalMineSurveyReward {
  readonly coins: number;
  readonly crystalShards: number;
  readonly repairChips: number;
}

export interface CrystalMineSurveyRunResult {
  readonly next: CrystalMineSurveyState;
  readonly rewardGranted: boolean;
  readonly reward: CrystalMineSurveyReward | null;
  readonly remainingClaims: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeCrystalMineSurveyState(
  raw: unknown,
  today: string,
): CrystalMineSurveyState {
  if (!raw || typeof raw !== 'object') return emptyCrystalMineSurveyState(today);
  const data = raw as {
    date?: unknown;
    bestScore?: unknown;
    rewardClaims?: unknown;
    totalRuns?: unknown;
  };
  if (data.date !== today) return emptyCrystalMineSurveyState(today);
  return {
    date: today,
    bestScore: clampNonNegativeInteger(data.bestScore),
    rewardClaims: Math.min(
      CRYSTAL_MINE_DAILY_REWARD_LIMIT,
      clampNonNegativeInteger(data.rewardClaims),
    ),
    totalRuns: clampNonNegativeInteger(data.totalRuns),
  };
}

export function readCrystalMineSurveyState(
  storage: StorageLike | null | undefined,
  now: Date = new Date(),
): CrystalMineSurveyState {
  const today = todayUtcDateString(now);
  if (!storage) return emptyCrystalMineSurveyState(today);
  const raw = storage.getItem(CRYSTAL_MINE_SAVE_KEY);
  if (!raw) return emptyCrystalMineSurveyState(today);
  try {
    return normalizeCrystalMineSurveyState(JSON.parse(raw), today);
  } catch {
    return emptyCrystalMineSurveyState(today);
  }
}

export function writeCrystalMineSurveyState(
  storage: StorageLike | null | undefined,
  state: CrystalMineSurveyState,
): void {
  if (!storage) return;
  storage.setItem(CRYSTAL_MINE_SAVE_KEY, JSON.stringify(state));
}

export function settleCrystalMineSurveyRun(
  score: number,
  state: CrystalMineSurveyState,
): CrystalMineSurveyRunResult {
  const safeScore = clampNonNegativeInteger(score);
  const baseNext: CrystalMineSurveyState = {
    ...state,
    bestScore: Math.max(state.bestScore, safeScore),
    totalRuns: state.totalRuns + 1,
  };

  if (safeScore < CRYSTAL_MINE_TARGET_SCORE) {
    return {
      next: baseNext,
      rewardGranted: false,
      reward: null,
      remainingClaims: remainingCrystalMineRewards(baseNext),
    };
  }

  if (baseNext.rewardClaims >= CRYSTAL_MINE_DAILY_REWARD_LIMIT) {
    return {
      next: baseNext,
      rewardGranted: false,
      reward: null,
      remainingClaims: 0,
    };
  }

  const reward = crystalMineRewardForScore(safeScore);
  const next: CrystalMineSurveyState = {
    ...baseNext,
    rewardClaims: baseNext.rewardClaims + 1,
  };
  return {
    next,
    rewardGranted: true,
    reward,
    remainingClaims: remainingCrystalMineRewards(next),
  };
}

export function crystalMineRewardForScore(score: number): CrystalMineSurveyReward {
  const safeScore = Math.max(CRYSTAL_MINE_TARGET_SCORE, clampNonNegativeInteger(score));
  const crystalShards = Math.min(3, 1 + Math.floor((safeScore - CRYSTAL_MINE_TARGET_SCORE) / 4));
  return {
    coins: 45 + safeScore * 7,
    crystalShards,
    repairChips: safeScore >= 14 ? 1 : 0,
  };
}

export function remainingCrystalMineRewards(state: CrystalMineSurveyState): number {
  return Math.max(0, CRYSTAL_MINE_DAILY_REWARD_LIMIT - state.rewardClaims);
}

function emptyCrystalMineSurveyState(today: string): CrystalMineSurveyState {
  return {
    date: today,
    bestScore: 0,
    rewardClaims: 0,
    totalRuns: 0,
  };
}

function clampNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
