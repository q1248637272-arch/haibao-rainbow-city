import { describe, expect, it } from 'vitest';

import {
  CRYSTAL_MINE_DAILY_REWARD_LIMIT,
  CRYSTAL_MINE_SOURCE,
  CRYSTAL_MINE_TARGET_SCORE,
  normalizeCrystalMineSurveyState,
  readCrystalMineSurveyState,
  settleCrystalMineSurveyRun,
} from '@/systems/CrystalMineSurvey';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('CrystalMineSurvey', () => {
  it('resets stale daily state and clamps invalid counters', () => {
    const state = normalizeCrystalMineSurveyState(
      {
        date: '2026-05-31',
        bestScore: 12.8,
        rewardClaims: 99,
        totalRuns: -4,
      },
      '2026-05-31',
    );

    expect(state).toEqual({
      date: '2026-05-31',
      bestScore: 12,
      rewardClaims: CRYSTAL_MINE_DAILY_REWARD_LIMIT,
      totalRuns: 0,
    });
    expect(
      normalizeCrystalMineSurveyState({ date: '2026-05-30', bestScore: 99 }, '2026-05-31'),
    ).toEqual({
      date: '2026-05-31',
      bestScore: 0,
      rewardClaims: 0,
      totalRuns: 0,
    });
  });

  it('grants rewards only for successful runs and respects the daily cap', () => {
    const first = settleCrystalMineSurveyRun(CRYSTAL_MINE_TARGET_SCORE, {
      date: '2026-05-31',
      bestScore: 0,
      rewardClaims: 0,
      totalRuns: 0,
    });

    expect(first.rewardGranted).toBe(true);
    expect(first.reward).toMatchObject({ crystalShards: 1 });
    expect(first.next.rewardClaims).toBe(1);

    const failed = settleCrystalMineSurveyRun(CRYSTAL_MINE_TARGET_SCORE - 1, first.next);
    expect(failed.rewardGranted).toBe(false);
    expect(failed.next.rewardClaims).toBe(1);

    const capped = settleCrystalMineSurveyRun(18, {
      ...failed.next,
      rewardClaims: CRYSTAL_MINE_DAILY_REWARD_LIMIT,
    });
    expect(capped.rewardGranted).toBe(false);
    expect(capped.remainingClaims).toBe(0);
    expect(capped.next.bestScore).toBe(18);
  });

  it('keeps the collect source stable for quest routing', () => {
    expect(CRYSTAL_MINE_SOURCE).toBe('energy_cave:crystal_survey');

    const storage = new MemoryStorage();
    const state = readCrystalMineSurveyState(storage, new Date('2026-05-31T03:00:00Z'));
    expect(state.date).toBe('2026-05-31');
  });
});
