import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SceneKey } from '@/config/GameConfig';
import { QUESTS_DAILY_POOL, QUESTS_MAIN } from '@/data/quests';
import { LEGACY_LOCATIONS } from '@/scenes/LegacyContent';
import { destinationForCondition } from '@/systems/QuestDestinations';
import {
  SHIP_CORE_CHANNELS,
  SHIP_CORE_DAILY_REWARD_LIMIT,
  SHIP_CORE_MINIGAME_ID,
  SHIP_CORE_PANEL_POOL,
  SHIP_CORE_SOURCE,
  SHIP_CORE_TARGET_LOCKS,
  generateShipCorePanels,
  normalizeShipCoreCalibrationState,
  readShipCoreCalibrationState,
  settleShipCoreCalibrationRun,
} from '@/systems/ShipCoreCalibration';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('ShipCoreCalibration', () => {
  it('generates a stable calibration panel set with every channel represented', () => {
    const panels = generateShipCorePanels('2026-06-04:ship', SHIP_CORE_TARGET_LOCKS);

    expect(panels).toHaveLength(SHIP_CORE_TARGET_LOCKS);
    expect(generateShipCorePanels('2026-06-04:ship', SHIP_CORE_TARGET_LOCKS)).toEqual(panels);
    expect(new Set(panels.map((panel) => panel.id)).size).toBe(panels.length);
    for (const channel of SHIP_CORE_CHANNELS) {
      expect(panels.some((panel) => panel.channel === channel)).toBe(true);
    }
    expect(SHIP_CORE_PANEL_POOL.length).toBeGreaterThan(SHIP_CORE_TARGET_LOCKS);
  });

  it('resets stale daily state and clamps invalid counters', () => {
    expect(
      normalizeShipCoreCalibrationState(
        {
          date: '2026-06-04',
          bestLocks: 99,
          rewardClaims: 99,
          totalRuns: -4,
          perfectRuns: 3.8,
        },
        '2026-06-04',
      ),
    ).toEqual({
      date: '2026-06-04',
      bestLocks: SHIP_CORE_TARGET_LOCKS,
      rewardClaims: SHIP_CORE_DAILY_REWARD_LIMIT,
      totalRuns: 0,
      perfectRuns: 3,
    });

    expect(normalizeShipCoreCalibrationState({ date: '2026-06-03', bestLocks: 6 }, '2026-06-04')).toEqual({
      date: '2026-06-04',
      bestLocks: 0,
      rewardClaims: 0,
      totalRuns: 0,
      perfectRuns: 0,
    });
  });

  it('grants rewards only for full calibration and respects the daily cap', () => {
    const first = settleShipCoreCalibrationRun(SHIP_CORE_TARGET_LOCKS, 0, {
      date: '2026-06-04',
      bestLocks: 0,
      rewardClaims: 0,
      totalRuns: 0,
      perfectRuns: 0,
    });

    expect(first.rewardGranted).toBe(true);
    expect(first.reward).toMatchObject({
      repairChips: 2,
      greatBalls: 2,
      electricFruit: 1,
      crystalShards: 1,
    });
    expect(first.next.rewardClaims).toBe(1);
    expect(first.next.perfectRuns).toBe(1);

    const failed = settleShipCoreCalibrationRun(SHIP_CORE_TARGET_LOCKS - 1, 1, first.next);
    expect(failed.rewardGranted).toBe(false);
    expect(failed.next.rewardClaims).toBe(1);

    const capped = settleShipCoreCalibrationRun(SHIP_CORE_TARGET_LOCKS, 2, {
      ...failed.next,
      rewardClaims: SHIP_CORE_DAILY_REWARD_LIMIT,
    });
    expect(capped.rewardGranted).toBe(false);
    expect(capped.remainingClaims).toBe(0);
  });

  it('keeps spaceship hotspot, quests, routing, and assets wired to the playable scene', () => {
    expect(SceneKey.SHIP_CORE).toBe('ShipCoreScene');
    expect(SHIP_CORE_MINIGAME_ID).toBe('ship_core_calibration');
    expect(SHIP_CORE_SOURCE).toBe('spaceship:core_calibration');

    const hotspot = LEGACY_LOCATIONS.spaceship.hotspots.find((item) => item.id === 'ship-repair');
    expect(hotspot?.action).toMatchObject({
      kind: 'scene',
      target: SceneKey.SHIP_CORE,
    });
    expect(LEGACY_LOCATIONS.spaceship.hotspots.some((item) => item.id === 'ship-shop')).toBe(true);
    expect(LEGACY_LOCATIONS.spaceship.hotspots.some((item) => item.id === 'ship-battle')).toBe(true);

    const mainQuest = QUESTS_MAIN.find((quest) => quest.id === 'q_main_008');
    const dailyQuest = QUESTS_DAILY_POOL.find((quest) => quest.id === 'd_ship_core_calibration');
    expect(mainQuest?.conditions).toContainEqual({
      kind: 'minigame_score',
      minigameId: SHIP_CORE_MINIGAME_ID,
      targetScore: SHIP_CORE_TARGET_LOCKS,
    });
    expect(dailyQuest?.conditions).toContainEqual({
      kind: 'minigame_score',
      minigameId: SHIP_CORE_MINIGAME_ID,
      targetScore: SHIP_CORE_TARGET_LOCKS,
    });
    expect(destinationForCondition(mainQuest!.conditions[0]!)).toMatchObject({
      scene: SceneKey.SHIP_CORE,
      sceneData: { returnLocationId: 'spaceship' },
    });
    expect(
      destinationForCondition({ kind: 'collect_item_from', source: SHIP_CORE_SOURCE, count: 1 }),
    ).toMatchObject({
      scene: SceneKey.SHIP_CORE,
      sceneData: { returnLocationId: 'spaceship' },
    });

    const preloaderSource = readFileSync(
      path.resolve('src/systems/SceneAssetPreloader.ts'),
      'utf8',
    );
    const sceneSource = readFileSync(path.resolve('src/scenes/ShipCoreScene.ts'), 'utf8');
    expect(preloaderSource).toContain('preloadShipCoreAssets');
    expect(preloaderSource).toContain("'legacy_spaceship_clean'");
    expect(preloaderSource).toContain("'object_ship_repair_core'");
    expect(sceneSource).toContain("SHIP_CORE_SOURCE");
    expect(sceneSource).toContain("createResponsiveMapBackground(this, 'legacy_spaceship_clean')");

    const sourceAsset = path.resolve(
      'public/assets/legacy/image2-restored/maps/legacy_spaceship_clean_image2.png',
    );
    const fastAsset = path.resolve(
      'public/assets/legacy/fast/image2-restored/maps/legacy_spaceship_clean_image2_fast.webp',
    );
    const coreAsset = path.resolve(
      'public/assets/legacy/fast/image2-restored/objects/object_ship_repair_core_image2_fast.webp',
    );
    expect(existsSync(sourceAsset)).toBe(true);
    expect(existsSync(fastAsset)).toBe(true);
    expect(existsSync(coreAsset)).toBe(true);
    expect(statSync(sourceAsset).size).toBeGreaterThan(200_000);
    expect(statSync(fastAsset).size).toBeGreaterThan(50_000);

    const storage = new MemoryStorage();
    const state = readShipCoreCalibrationState(storage, new Date('2026-06-04T03:00:00Z'));
    expect(state.date).toBe('2026-06-04');
  });
});
