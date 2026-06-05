import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SceneKey } from '@/config/GameConfig';
import { questDestinationForPendingStep } from '@/systems/QuestDestinations';
import type { QuestDefinition, QuestState } from '@/types';

describe('quest board action center', () => {
  it('registers the gpt-image-2 quest hall background and fast runtime derivative', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    const preloaderSource = readFileSync(
      path.resolve('src/systems/SceneAssetPreloader.ts'),
      'utf8',
    );

    expect(preloadSource).toContain(
      "premium_quest_hall_image2: 'assets/legacy/image2-restored/ui/premium_quest_hall_image2.webp'",
    );
    expect(preloaderSource).toContain("'premium_quest_hall_image2'");

    const sourceAsset = path.resolve(
      'public/assets/legacy/image2-restored/ui/premium_quest_hall_image2.webp',
    );
    const fastAsset = path.resolve(
      'public/assets/legacy/fast/image2-restored/ui/premium_quest_hall_image2_fast.webp',
    );
    expect(existsSync(sourceAsset)).toBe(true);
    expect(existsSync(fastAsset)).toBe(true);
    expect(statSync(sourceAsset).size).toBeGreaterThan(180_000);
    expect(statSync(fastAsset).size).toBeGreaterThan(80_000);
  });

  it('routes pending quest steps to their next playable destination', () => {
    const quest: QuestDefinition = {
      id: 'test_quest',
      kind: 'main',
      title: '测试任务',
      description: '测试任务目的地',
      conditions: [{ kind: 'reach_map', mapId: 'library' }],
      reward: { coins: 1 },
    };
    const state: QuestState = { status: 'active', progress: {}, updatedAt: 0 };

    const destination = questDestinationForPendingStep(quest, state);

    expect(destination?.scene).toBe(SceneKey.LEGACY_LOCATION);
    expect(destination?.sceneData).toEqual({ locationId: 'library' });
  });

  it('routes new gym calibration objectives back to the playable dojo', () => {
    const quest: QuestDefinition = {
      id: 'test_gym_quest',
      kind: 'daily',
      title: '校准徽章',
      description: '完成徽章校准',
      conditions: [{ kind: 'minigame_runs', minigameId: 'gym_badge_calibration', count: 1 }],
      reward: { coins: 1 },
    };
    const state: QuestState = { status: 'active', progress: {}, updatedAt: 0 };

    const destination = questDestinationForPendingStep(quest, state);

    expect(destination?.scene).toBe(SceneKey.GYM);
    expect(destination?.actionLabel).toBe('去校准');
  });
});
