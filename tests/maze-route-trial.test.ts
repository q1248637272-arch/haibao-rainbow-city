import { describe, expect, it } from 'vitest';

import { SceneKey } from '@/config/GameConfig';
import { LEGACY_LOCATIONS } from '@/scenes/LegacyContent';
import {
  MAZE_ROUTE_TRIAL_DAILY_REWARD_LIMIT,
  MAZE_ROUTE_TRIAL_MINIGAME_ID,
  MAZE_ROUTE_TRIAL_SOURCE,
  MAZE_ROUTE_TRIAL_TARGET_DEPTH,
  generateMazeRouteSequence,
  normalizeMazeRouteTrialState,
  readMazeRouteTrialState,
  settleMazeRouteTrialRun,
} from '@/systems/MazeRouteTrial';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('MazeRouteTrial', () => {
  it('generates stable readable rune routes from a seed', () => {
    const route = generateMazeRouteSequence('2026-06-04:maze', MAZE_ROUTE_TRIAL_TARGET_DEPTH);

    expect(route).toHaveLength(MAZE_ROUTE_TRIAL_TARGET_DEPTH);
    expect(generateMazeRouteSequence('2026-06-04:maze', MAZE_ROUTE_TRIAL_TARGET_DEPTH)).toEqual(route);
    expect(new Set(route).size).toBeGreaterThan(1);
  });

  it('resets stale daily state and clamps invalid counters', () => {
    expect(
      normalizeMazeRouteTrialState(
        {
          date: '2026-06-04',
          bestDepth: 99,
          rewardClaims: 99,
          totalRuns: -4,
          perfectRuns: 3.8,
        },
        '2026-06-04',
      ),
    ).toEqual({
      date: '2026-06-04',
      bestDepth: MAZE_ROUTE_TRIAL_TARGET_DEPTH,
      rewardClaims: MAZE_ROUTE_TRIAL_DAILY_REWARD_LIMIT,
      totalRuns: 0,
      perfectRuns: 3,
    });

    expect(normalizeMazeRouteTrialState({ date: '2026-06-03', bestDepth: 5 }, '2026-06-04')).toEqual({
      date: '2026-06-04',
      bestDepth: 0,
      rewardClaims: 0,
      totalRuns: 0,
      perfectRuns: 0,
    });
  });

  it('grants rewards only for completed routes and respects the daily cap', () => {
    const first = settleMazeRouteTrialRun(MAZE_ROUTE_TRIAL_TARGET_DEPTH, 0, {
      date: '2026-06-04',
      bestDepth: 0,
      rewardClaims: 0,
      totalRuns: 0,
      perfectRuns: 0,
    });

    expect(first.rewardGranted).toBe(true);
    expect(first.reward).toMatchObject({ expCandy: 2, greatBalls: 2, crystalShards: 1 });
    expect(first.next.rewardClaims).toBe(1);
    expect(first.next.perfectRuns).toBe(1);

    const failed = settleMazeRouteTrialRun(MAZE_ROUTE_TRIAL_TARGET_DEPTH - 1, 1, first.next);
    expect(failed.rewardGranted).toBe(false);
    expect(failed.next.rewardClaims).toBe(1);
    expect(failed.next.bestDepth).toBe(MAZE_ROUTE_TRIAL_TARGET_DEPTH);

    const capped = settleMazeRouteTrialRun(MAZE_ROUTE_TRIAL_TARGET_DEPTH, 2, {
      ...failed.next,
      rewardClaims: MAZE_ROUTE_TRIAL_DAILY_REWARD_LIMIT,
    });
    expect(capped.rewardGranted).toBe(false);
    expect(capped.remainingClaims).toBe(0);
  });

  it('keeps routing constants and maze hotspot wired to the new playable scene', () => {
    expect(MAZE_ROUTE_TRIAL_MINIGAME_ID).toBe('maze_route_trial');
    expect(MAZE_ROUTE_TRIAL_SOURCE).toBe('maze:route_trial');
    expect(SceneKey.MAZE_TRIAL).toBe('MazeTrialScene');

    const trial = LEGACY_LOCATIONS.maze.hotspots.find((hotspot) => hotspot.id === 'maze-trial');
    expect(trial?.action).toMatchObject({
      kind: 'scene',
      target: SceneKey.MAZE_TRIAL,
    });
    expect(LEGACY_LOCATIONS.maze.hotspots.some((hotspot) => hotspot.id === 'maze-battle')).toBe(true);

    const storage = new MemoryStorage();
    const state = readMazeRouteTrialState(storage, new Date('2026-06-04T03:00:00Z'));
    expect(state.date).toBe('2026-06-04');
  });
});
