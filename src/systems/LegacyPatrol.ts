import { difficultyForLocation } from '@/data/locationDifficulty';
import { LEGACY_LOCATIONS, type LegacyLocationId } from '@/scenes/LegacyContent';

export const LEGACY_REWARD_SAVE_KEY = 'hbcc:legacy-location-rewards:v1';
export const LEGACY_PATROL_CHAIN_SAVE_KEY = 'hbcc:legacy-patrol-chain:v1';
export const LEGACY_PATROL_CHAIN_TARGET = 3;
export const LEGACY_PATROL_ITEM_ID = 'exp_candy';
export const LEGACY_PATROL_ITEM_LABEL = '经验糖';

export interface LegacyPatrolReward {
  readonly coins: number;
  readonly itemId: string;
  readonly itemLabel: string;
  readonly itemQuantity: number;
}

export interface LegacyPatrolChainState {
  readonly date: string;
  readonly completedLocationIds: readonly LegacyLocationId[];
  readonly streakDays: number;
  readonly bonusClaimed: boolean;
  readonly lastCompletionDate: string | null;
}

export function legacyTodayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function legacyPreviousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return legacyTodayKey(date);
}

function isLegacyLocationId(value: string): value is LegacyLocationId {
  return Object.prototype.hasOwnProperty.call(LEGACY_LOCATIONS, value);
}

export function legacyDailyRewardKey(locationId: LegacyLocationId, label: string): string {
  return `${locationId}:${label}`;
}

export function legacyPatrolRewardKey(locationId: LegacyLocationId): string {
  return `${locationId}:patrol`;
}

export function readLegacyRewardsToday(
  storage: Storage | null | undefined = globalThis.localStorage,
): Set<string> {
  try {
    const raw = storage?.getItem(LEGACY_REWARD_SAVE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date?: string; claimedIds?: string[] };
    if (parsed.date !== legacyTodayKey() || !Array.isArray(parsed.claimedIds)) return new Set();
    return new Set(parsed.claimedIds.filter((id) => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function hasClaimedLegacyRewardToday(
  key: string,
  storage: Storage | null | undefined = globalThis.localStorage,
): boolean {
  return readLegacyRewardsToday(storage).has(key);
}

export function markLegacyRewardClaimedToday(
  key: string,
  storage: Storage | null | undefined = globalThis.localStorage,
): void {
  const claimed = readLegacyRewardsToday(storage);
  claimed.add(key);
  try {
    storage?.setItem(
      LEGACY_REWARD_SAVE_KEY,
      JSON.stringify({ date: legacyTodayKey(), claimedIds: [...claimed] }),
    );
  } catch {
    // Ignore private browsing storage failures.
  }
}

export function legacyLocationHasPatrol(locationId: LegacyLocationId): boolean {
  return LEGACY_LOCATIONS[locationId].hotspots.some(
    (hotspot) => hotspot.action.kind === 'battle' && Boolean(hotspot.action.encounterZoneId),
  );
}

export function legacyPatrolLocationIds(): LegacyLocationId[] {
  return (Object.keys(LEGACY_LOCATIONS) as LegacyLocationId[]).filter(legacyLocationHasPatrol);
}

function legacyClaimedPatrolLocationIds(storage: Storage | null | undefined): LegacyLocationId[] {
  const claimed = readLegacyRewardsToday(storage);
  return legacyPatrolLocationIds().filter((locationId) =>
    claimed.has(legacyPatrolRewardKey(locationId)),
  );
}

function writeLegacyPatrolChainState(
  state: LegacyPatrolChainState,
  storage: Storage | null | undefined,
): void {
  try {
    storage?.setItem(LEGACY_PATROL_CHAIN_SAVE_KEY, JSON.stringify(state));
  } catch {
    // Ignore private browsing storage failures.
  }
}

export function readLegacyPatrolChainState(
  storage: Storage | null | undefined = globalThis.localStorage,
  dateKey = legacyTodayKey(),
): LegacyPatrolChainState {
  try {
    const raw = storage?.getItem(LEGACY_PATROL_CHAIN_SAVE_KEY);
    if (!raw) {
      const completedLocationIds = legacyClaimedPatrolLocationIds(storage);
      return {
        date: dateKey,
        completedLocationIds,
        streakDays: completedLocationIds.length > 0 ? 1 : 0,
        bonusClaimed: false,
        lastCompletionDate: completedLocationIds.length > 0 ? dateKey : null,
      };
    }

    const parsed = JSON.parse(raw) as {
      date?: unknown;
      completedLocationIds?: unknown;
      streakDays?: unknown;
      bonusClaimed?: unknown;
      lastCompletionDate?: unknown;
    };
    const savedDate = typeof parsed.date === 'string' ? parsed.date : null;
    const lastCompletionDate =
      typeof parsed.lastCompletionDate === 'string' ? parsed.lastCompletionDate : null;
    const streakAlive =
      lastCompletionDate === dateKey || lastCompletionDate === legacyPreviousDateKey(dateKey);
    let streakDays =
      streakAlive && typeof parsed.streakDays === 'number' && Number.isFinite(parsed.streakDays)
        ? Math.max(0, Math.floor(parsed.streakDays))
        : 0;
    const savedCompletedLocationIds =
      savedDate === dateKey && Array.isArray(parsed.completedLocationIds)
        ? [
            ...new Set(
              parsed.completedLocationIds.filter(
                (id): id is LegacyLocationId =>
                  typeof id === 'string' && isLegacyLocationId(id) && legacyLocationHasPatrol(id),
              ),
            ),
          ]
        : [];
    const claimedPatrolLocationIds = legacyClaimedPatrolLocationIds(storage);
    const completedLocationIds = [
      ...new Set([...savedCompletedLocationIds, ...claimedPatrolLocationIds]),
    ];
    const inferredCompletionDate =
      completedLocationIds.length > 0 && !streakAlive ? dateKey : lastCompletionDate;
    if (completedLocationIds.length > 0 && streakDays <= 0) {
      streakDays = 1;
    }

    return {
      date: dateKey,
      completedLocationIds,
      streakDays,
      bonusClaimed: savedDate === dateKey ? parsed.bonusClaimed === true : false,
      lastCompletionDate: inferredCompletionDate,
    };
  } catch {
    return {
      date: dateKey,
      completedLocationIds: [],
      streakDays: 0,
      bonusClaimed: false,
      lastCompletionDate: null,
    };
  }
}

export function hasClaimedLegacyPatrolToday(
  locationId: LegacyLocationId,
  storage: Storage | null | undefined = globalThis.localStorage,
): boolean {
  return hasClaimedLegacyRewardToday(legacyPatrolRewardKey(locationId), storage);
}

export function legacyPatrolRewardForLocation(locationId: LegacyLocationId): LegacyPatrolReward {
  const recommended = difficultyForLocation(locationId).recommended;
  return {
    coins: Math.min(160, Math.round((30 + recommended * 4) / 5) * 5),
    itemId: LEGACY_PATROL_ITEM_ID,
    itemLabel: LEGACY_PATROL_ITEM_LABEL,
    itemQuantity: recommended >= 18 ? 2 : 1,
  };
}

export function legacyPatrolRewardSummary(locationId: LegacyLocationId): string {
  const reward = legacyPatrolRewardForLocation(locationId);
  return `+${reward.coins}币 +${reward.itemQuantity}${reward.itemLabel}`;
}

export function legacyPatrolChainTarget(): number {
  return Math.min(LEGACY_PATROL_CHAIN_TARGET, legacyPatrolLocationIds().length);
}

export function recordLegacyPatrolCompletion(
  locationId: LegacyLocationId,
  storage: Storage | null | undefined = globalThis.localStorage,
  dateKey = legacyTodayKey(),
): LegacyPatrolChainState {
  const current = readLegacyPatrolChainState(storage, dateKey);
  if (!legacyLocationHasPatrol(locationId) || current.completedLocationIds.includes(locationId)) {
    return current;
  }

  let streakDays = current.streakDays;
  let lastCompletionDate = current.lastCompletionDate;
  if (lastCompletionDate !== dateKey) {
    streakDays =
      lastCompletionDate === legacyPreviousDateKey(dateKey) ? Math.max(1, streakDays + 1) : 1;
    lastCompletionDate = dateKey;
  }

  const next: LegacyPatrolChainState = {
    date: dateKey,
    completedLocationIds: [...current.completedLocationIds, locationId],
    streakDays,
    bonusClaimed: current.bonusClaimed,
    lastCompletionDate,
  };
  writeLegacyPatrolChainState(next, storage);
  return next;
}

export function legacyPatrolChainBonusForStreak(streakDays: number): LegacyPatrolReward {
  const safeStreak = Math.max(1, Math.floor(streakDays));
  return {
    coins: 40 + Math.min(safeStreak, 7) * 10,
    itemId: LEGACY_PATROL_ITEM_ID,
    itemLabel: LEGACY_PATROL_ITEM_LABEL,
    itemQuantity: safeStreak >= 5 ? 2 : 1,
  };
}

export function legacyPatrolChainBonusReady(state: LegacyPatrolChainState): boolean {
  return !state.bonusClaimed && state.completedLocationIds.length >= legacyPatrolChainTarget();
}

export function claimLegacyPatrolChainBonus(
  storage: Storage | null | undefined = globalThis.localStorage,
  dateKey = legacyTodayKey(),
): { readonly state: LegacyPatrolChainState; readonly reward: LegacyPatrolReward } | null {
  const current = readLegacyPatrolChainState(storage, dateKey);
  if (!legacyPatrolChainBonusReady(current)) return null;

  const next: LegacyPatrolChainState = {
    ...current,
    bonusClaimed: true,
  };
  writeLegacyPatrolChainState(next, storage);
  return {
    state: next,
    reward: legacyPatrolChainBonusForStreak(current.streakDays),
  };
}

export function legacyPatrolChainProgressLabel(
  storage: Storage | null | undefined = globalThis.localStorage,
): string {
  const state = readLegacyPatrolChainState(storage);
  const target = legacyPatrolChainTarget();
  const bonus = state.bonusClaimed
    ? '连锁已领'
    : legacyPatrolChainBonusReady(state)
      ? '连锁可领'
      : `目标${target}`;
  return `今日${state.completedLocationIds.length}/${target} · 连勤${state.streakDays}天 · ${bonus}`;
}
