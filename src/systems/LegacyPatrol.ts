import { difficultyForLocation } from '@/data/locationDifficulty';
import { LEGACY_LOCATIONS, type LegacyLocationId } from '@/scenes/LegacyContent';

export const LEGACY_REWARD_SAVE_KEY = 'hbcc:legacy-location-rewards:v1';
export const LEGACY_PATROL_ITEM_ID = 'exp_candy';
export const LEGACY_PATROL_ITEM_LABEL = '经验糖';

export interface LegacyPatrolReward {
  readonly coins: number;
  readonly itemId: string;
  readonly itemLabel: string;
  readonly itemQuantity: number;
}

export function legacyTodayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
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
