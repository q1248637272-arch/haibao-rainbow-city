import { todayUtcDateString } from '@/systems/DailyQuest';

export const MAZE_ROUTE_TRIAL_SAVE_KEY = 'hbcc:maze-route-trial:v1';
export const MAZE_ROUTE_TRIAL_MINIGAME_ID = 'maze_route_trial';
export const MAZE_ROUTE_TRIAL_SOURCE = 'maze:route_trial';
export const MAZE_ROUTE_TRIAL_DAILY_REWARD_LIMIT = 2;
export const MAZE_ROUTE_TRIAL_TARGET_DEPTH = 5;

export type MazeRouteRune = 'sun' | 'moon' | 'leaf' | 'crystal';

export interface MazeRouteTrialState {
  readonly date: string;
  readonly bestDepth: number;
  readonly rewardClaims: number;
  readonly totalRuns: number;
  readonly perfectRuns: number;
}

export interface MazeRouteTrialReward {
  readonly coins: number;
  readonly expCandy: number;
  readonly greatBalls: number;
  readonly crystalShards: number;
}

export interface MazeRouteTrialRunResult {
  readonly next: MazeRouteTrialState;
  readonly rewardGranted: boolean;
  readonly reward: MazeRouteTrialReward | null;
  readonly remainingClaims: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MAZE_ROUTE_RUNES: readonly MazeRouteRune[] = ['sun', 'moon', 'leaf', 'crystal'];

export function normalizeMazeRouteTrialState(
  raw: unknown,
  today: string,
): MazeRouteTrialState {
  if (!raw || typeof raw !== 'object') return emptyMazeRouteTrialState(today);
  const data = raw as {
    date?: unknown;
    bestDepth?: unknown;
    rewardClaims?: unknown;
    totalRuns?: unknown;
    perfectRuns?: unknown;
  };
  if (data.date !== today) return emptyMazeRouteTrialState(today);
  return {
    date: today,
    bestDepth: Math.min(MAZE_ROUTE_TRIAL_TARGET_DEPTH, clampNonNegativeInteger(data.bestDepth)),
    rewardClaims: Math.min(
      MAZE_ROUTE_TRIAL_DAILY_REWARD_LIMIT,
      clampNonNegativeInteger(data.rewardClaims),
    ),
    totalRuns: clampNonNegativeInteger(data.totalRuns),
    perfectRuns: clampNonNegativeInteger(data.perfectRuns),
  };
}

export function readMazeRouteTrialState(
  storage: StorageLike | null | undefined,
  now: Date = new Date(),
): MazeRouteTrialState {
  const today = todayUtcDateString(now);
  if (!storage) return emptyMazeRouteTrialState(today);
  const raw = storage.getItem(MAZE_ROUTE_TRIAL_SAVE_KEY);
  if (!raw) return emptyMazeRouteTrialState(today);
  try {
    return normalizeMazeRouteTrialState(JSON.parse(raw), today);
  } catch {
    return emptyMazeRouteTrialState(today);
  }
}

export function writeMazeRouteTrialState(
  storage: StorageLike | null | undefined,
  state: MazeRouteTrialState,
): void {
  if (!storage) return;
  storage.setItem(MAZE_ROUTE_TRIAL_SAVE_KEY, JSON.stringify(state));
}

export function generateMazeRouteSequence(seedText: string, length = MAZE_ROUTE_TRIAL_TARGET_DEPTH): MazeRouteRune[] {
  const route: MazeRouteRune[] = [];
  let seed = hashSeed(seedText);
  for (let index = 0; index < length; index += 1) {
    seed = nextSeed(seed + index * 101);
    route.push(MAZE_ROUTE_RUNES[seed % MAZE_ROUTE_RUNES.length] ?? MAZE_ROUTE_RUNES[0]!);
  }
  return route;
}

export function settleMazeRouteTrialRun(
  depth: number,
  mistakes: number,
  state: MazeRouteTrialState,
): MazeRouteTrialRunResult {
  const safeDepth = Math.min(MAZE_ROUTE_TRIAL_TARGET_DEPTH, clampNonNegativeInteger(depth));
  const safeMistakes = clampNonNegativeInteger(mistakes);
  const perfect = safeDepth >= MAZE_ROUTE_TRIAL_TARGET_DEPTH && safeMistakes === 0;
  const baseNext: MazeRouteTrialState = {
    ...state,
    bestDepth: Math.max(state.bestDepth, safeDepth),
    totalRuns: state.totalRuns + 1,
    perfectRuns: state.perfectRuns + (perfect ? 1 : 0),
  };

  if (safeDepth < MAZE_ROUTE_TRIAL_TARGET_DEPTH) {
    return {
      next: baseNext,
      rewardGranted: false,
      reward: null,
      remainingClaims: remainingMazeRouteTrialRewards(baseNext),
    };
  }

  if (baseNext.rewardClaims >= MAZE_ROUTE_TRIAL_DAILY_REWARD_LIMIT) {
    return {
      next: baseNext,
      rewardGranted: false,
      reward: null,
      remainingClaims: 0,
    };
  }

  const reward = mazeRouteTrialRewardForRun(safeMistakes);
  const next: MazeRouteTrialState = {
    ...baseNext,
    rewardClaims: baseNext.rewardClaims + 1,
  };
  return {
    next,
    rewardGranted: true,
    reward,
    remainingClaims: remainingMazeRouteTrialRewards(next),
  };
}

export function mazeRouteTrialRewardForRun(mistakes: number): MazeRouteTrialReward {
  const safeMistakes = clampNonNegativeInteger(mistakes);
  const perfectBonus = safeMistakes === 0;
  return {
    coins: Math.max(55, 115 - safeMistakes * 15),
    expCandy: perfectBonus ? 2 : 1,
    greatBalls: perfectBonus ? 2 : 1,
    crystalShards: perfectBonus ? 1 : 0,
  };
}

export function remainingMazeRouteTrialRewards(state: MazeRouteTrialState): number {
  return Math.max(0, MAZE_ROUTE_TRIAL_DAILY_REWARD_LIMIT - state.rewardClaims);
}

function emptyMazeRouteTrialState(today: string): MazeRouteTrialState {
  return {
    date: today,
    bestDepth: 0,
    rewardClaims: 0,
    totalRuns: 0,
    perfectRuns: 0,
  };
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextSeed(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function clampNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
