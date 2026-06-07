import { afterEach, describe, expect, it } from 'vitest';

import {
  LEGACY_REWARD_SAVE_KEY,
  hasClaimedLegacyPatrolToday,
  hasClaimedLegacyRewardToday,
  legacyDailyRewardKey,
  legacyLocationHasPatrol,
  legacyPatrolRewardForLocation,
  legacyPatrolRewardKey,
  legacyPatrolRewardSummary,
  legacyTodayKey,
  markLegacyRewardClaimedToday,
  readLegacyRewardsToday,
} from '@/systems/LegacyPatrol';

import { installMemoryLocalStorage, uninstallLocalStorage } from './_helpers/localStorage';

afterEach(() => {
  uninstallLocalStorage();
});

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
});
