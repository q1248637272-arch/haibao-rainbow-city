import { afterEach, describe, expect, it } from 'vitest';

import {
  LEGACY_PATROL_CHAIN_SAVE_KEY,
  LEGACY_REWARD_SAVE_KEY,
  claimLegacyPatrolChainBonus,
  hasClaimedLegacyPatrolToday,
  hasClaimedLegacyRewardToday,
  legacyDailyRewardKey,
  legacyPatrolChainBonusReady,
  legacyPatrolChainProgressLabel,
  legacyPatrolChainTarget,
  legacyLocationHasPatrol,
  legacyPatrolLocationIds,
  legacyPatrolRewardForLocation,
  legacyPatrolRewardKey,
  legacyPatrolRewardSummary,
  legacyTodayKey,
  markLegacyRewardClaimedToday,
  readLegacyPatrolChainState,
  readLegacyRewardsToday,
  recordLegacyPatrolCompletion,
} from '@/systems/LegacyPatrol';

import { installMemoryLocalStorage, uninstallLocalStorage } from './_helpers/localStorage';

afterEach(() => {
  uninstallLocalStorage();
});

function previousDayKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

describe('legacy patrol rewards', () => {
  it('shares daily reward storage between legacy rewards and patrols', () => {
    const storage = installMemoryLocalStorage();
    const rewardKey = legacyDailyRewardKey('center', '完成金贝劳动');
    const patrolKey = legacyPatrolRewardKey('center');

    markLegacyRewardClaimedToday(rewardKey, storage);
    markLegacyRewardClaimedToday(patrolKey, storage);

    expect(hasClaimedLegacyRewardToday(rewardKey, storage)).toBe(true);
    expect(hasClaimedLegacyPatrolToday('center', storage)).toBe(true);
    expect(readLegacyRewardsToday(storage)).toEqual(new Set([rewardKey, patrolKey]));
    expect(JSON.parse(storage.getItem(LEGACY_REWARD_SAVE_KEY) ?? '{}')).toMatchObject({
      date: legacyTodayKey(),
      claimedIds: expect.arrayContaining([rewardKey, patrolKey]),
    });
  });

  it('ignores stale or malformed daily reward storage', () => {
    const storage = installMemoryLocalStorage();
    storage.setItem(
      LEGACY_REWARD_SAVE_KEY,
      JSON.stringify({ date: '2000-01-01', claimedIds: [legacyPatrolRewardKey('library')] }),
    );

    expect(readLegacyRewardsToday(storage).size).toBe(0);
    expect(hasClaimedLegacyPatrolToday('library', storage)).toBe(false);

    storage.setItem(LEGACY_REWARD_SAVE_KEY, '{bad json');
    expect(readLegacyRewardsToday(storage).size).toBe(0);
  });

  it('scales patrol rewards by old-location difficulty', () => {
    const center = legacyPatrolRewardForLocation('center');
    const storm = legacyPatrolRewardForLocation('storm_ruins');

    expect(legacyLocationHasPatrol('center')).toBe(true);
    expect(legacyLocationHasPatrol('storm_ruins')).toBe(true);
    expect(storm.coins).toBeGreaterThan(center.coins);
    expect(center.itemQuantity).toBe(1);
    expect(storm.itemQuantity).toBe(2);
    expect(legacyPatrolRewardSummary('storm_ruins')).toContain('经验糖');
  });

  it('tracks a same-day patrol chain and grants the chain bonus once', () => {
    const storage = installMemoryLocalStorage();
    const today = '2026-06-08';
    const locations = legacyPatrolLocationIds();

    expect(locations.length).toBeGreaterThanOrEqual(legacyPatrolChainTarget());

    const firstLocation = locations[0]!;
    const secondLocation = locations[1]!;
    const thirdLocation = locations[2]!;

    const first = recordLegacyPatrolCompletion(firstLocation, storage, today);
    expect(first.completedLocationIds).toEqual([firstLocation]);
    expect(first.streakDays).toBe(1);
    expect(legacyPatrolChainBonusReady(first)).toBe(false);

    recordLegacyPatrolCompletion(secondLocation, storage, today);
    const ready = recordLegacyPatrolCompletion(thirdLocation, storage, today);
    expect(ready.completedLocationIds).toHaveLength(legacyPatrolChainTarget());
    expect(legacyPatrolChainBonusReady(ready)).toBe(true);

    const bonus = claimLegacyPatrolChainBonus(storage, today);
    expect(bonus?.reward.coins).toBeGreaterThan(0);
    expect(bonus?.reward.itemLabel).toBe('经验糖');
    expect(claimLegacyPatrolChainBonus(storage, today)).toBeNull();
    expect(readLegacyPatrolChainState(storage, today).bonusClaimed).toBe(true);
  });

  it('infers same-day chain progress from existing patrol reward keys', () => {
    const storage = installMemoryLocalStorage();
    const locations = legacyPatrolLocationIds();

    markLegacyRewardClaimedToday(legacyPatrolRewardKey(locations[0]!), storage);
    markLegacyRewardClaimedToday(legacyPatrolRewardKey(locations[1]!), storage);
    markLegacyRewardClaimedToday(legacyPatrolRewardKey(locations[2]!), storage);

    const inferred = readLegacyPatrolChainState(storage);
    expect(inferred.completedLocationIds).toEqual([locations[0], locations[1], locations[2]]);
    expect(inferred.streakDays).toBe(1);
    expect(legacyPatrolChainBonusReady(inferred)).toBe(true);
  });

  it('carries patrol streaks across adjacent days and resets stale daily progress', () => {
    const storage = installMemoryLocalStorage();
    const today = '2026-06-08';
    const yesterday = previousDayKey(today);
    const locations = legacyPatrolLocationIds();

    const firstLocation = locations[0]!;
    const secondLocation = locations[1]!;

    const dayOne = recordLegacyPatrolCompletion(firstLocation, storage, yesterday);
    expect(dayOne.completedLocationIds).toEqual([firstLocation]);
    expect(dayOne.streakDays).toBe(1);

    const dayTwoBeforeCompletion = readLegacyPatrolChainState(storage, today);
    expect(dayTwoBeforeCompletion.completedLocationIds).toEqual([]);
    expect(dayTwoBeforeCompletion.streakDays).toBe(1);

    const dayTwo = recordLegacyPatrolCompletion(secondLocation, storage, today);
    expect(dayTwo.completedLocationIds).toEqual([secondLocation]);
    expect(dayTwo.streakDays).toBe(2);
    expect(legacyPatrolChainProgressLabel(storage)).toContain('连勤');
  });

  it('ignores malformed patrol chain storage safely', () => {
    const storage = installMemoryLocalStorage();
    storage.setItem(
      LEGACY_PATROL_CHAIN_SAVE_KEY,
      JSON.stringify({
        date: legacyTodayKey(),
        completedLocationIds: ['center', 'not_real'],
        streakDays: -12,
        bonusClaimed: true,
        lastCompletionDate: '2000-01-01',
      }),
    );

    const state = readLegacyPatrolChainState(storage);
    expect(state.completedLocationIds).toEqual(['center']);
    expect(state.streakDays).toBe(1);
    expect(state.lastCompletionDate).toBe(legacyTodayKey());

    storage.setItem(LEGACY_PATROL_CHAIN_SAVE_KEY, '{bad json');
    expect(readLegacyPatrolChainState(storage).completedLocationIds).toEqual([]);
  });
});
