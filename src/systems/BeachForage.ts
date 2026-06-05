import { todayUtcDateString } from './DailyQuest';

export const BEACH_FORAGE_SAVE_KEY = 'hbcc:beach-forage:v1';
export const MAX_BEACH_FORAGE_CLAIMS_PER_DAY = 2;

export interface BeachForagePoint {
  readonly id: string;
  readonly label: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly source: string;
}

export interface BeachForageState {
  readonly date: string;
  readonly claimedPointIds: readonly string[];
}

export type BeachForageClaimResult =
  | {
      readonly ok: true;
      readonly point: BeachForagePoint;
      readonly next: BeachForageState;
      readonly remainingClaims: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'unknown_point' | 'already_claimed' | 'daily_limit_reached';
      readonly next: BeachForageState;
      readonly remainingClaims: number;
    };

export const BEACH_FORAGE_POINTS: readonly BeachForagePoint[] = [
  {
    id: 'shell_ridge',
    label: '拾贝沙脊',
    itemId: 'gold_shell',
    quantity: 1,
    source: 'beach:shell_ridge',
  },
  {
    id: 'coral_glint',
    label: '珊瑚微光',
    itemId: 'crystal_shard',
    quantity: 1,
    source: 'beach:coral_glint',
  },
];

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeBeachForageState(raw: unknown, today: string): BeachForageState {
  if (!raw || typeof raw !== 'object') {
    return { date: today, claimedPointIds: [] };
  }
  const obj = raw as { date?: unknown; claimedPointIds?: unknown };
  if (obj.date !== today) {
    return { date: today, claimedPointIds: [] };
  }
  const validPointIds = new Set(BEACH_FORAGE_POINTS.map((p) => p.id));
  const claimedPointIds = Array.isArray(obj.claimedPointIds)
    ? obj.claimedPointIds.filter(
        (id): id is string => typeof id === 'string' && validPointIds.has(id),
      )
    : [];
  return { date: today, claimedPointIds: [...new Set(claimedPointIds)] };
}

export function readBeachForageState(
  storage: StorageLike | null | undefined,
  now: Date = new Date(),
): BeachForageState {
  const today = todayUtcDateString(now);
  if (!storage) return { date: today, claimedPointIds: [] };
  const raw = storage.getItem(BEACH_FORAGE_SAVE_KEY);
  if (!raw) return { date: today, claimedPointIds: [] };
  try {
    return normalizeBeachForageState(JSON.parse(raw), today);
  } catch {
    return { date: today, claimedPointIds: [] };
  }
}

export function writeBeachForageState(
  storage: StorageLike | null | undefined,
  state: BeachForageState,
): void {
  if (!storage) return;
  storage.setItem(BEACH_FORAGE_SAVE_KEY, JSON.stringify(state));
}

export function claimBeachForagePoint(
  pointId: string,
  state: BeachForageState,
): BeachForageClaimResult {
  const point = BEACH_FORAGE_POINTS.find((p) => p.id === pointId);
  const remainingBefore = Math.max(
    0,
    MAX_BEACH_FORAGE_CLAIMS_PER_DAY - state.claimedPointIds.length,
  );
  if (!point) {
    return {
      ok: false,
      reason: 'unknown_point',
      next: state,
      remainingClaims: remainingBefore,
    };
  }
  if (state.claimedPointIds.includes(pointId)) {
    return {
      ok: false,
      reason: 'already_claimed',
      next: state,
      remainingClaims: remainingBefore,
    };
  }
  if (remainingBefore <= 0) {
    return {
      ok: false,
      reason: 'daily_limit_reached',
      next: state,
      remainingClaims: 0,
    };
  }
  const next: BeachForageState = {
    date: state.date,
    claimedPointIds: [...state.claimedPointIds, pointId],
  };
  return {
    ok: true,
    point,
    next,
    remainingClaims: Math.max(0, MAX_BEACH_FORAGE_CLAIMS_PER_DAY - next.claimedPointIds.length),
  };
}
