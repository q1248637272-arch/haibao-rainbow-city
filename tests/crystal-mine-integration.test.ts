import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SceneKey } from '@/config/GameConfig';
import { QUESTS_DAILY_POOL, QUESTS_MAIN } from '@/data/quests';
import { LEGACY_LOCATIONS } from '@/scenes/LegacyContent';

describe('crystal mine survey integration', () => {
  it('registers the crystal mine scene and gpt-image-2 wide map asset', () => {
    expect(SceneKey.CRYSTAL_MINE).toBe('CrystalMineScene');

    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    const assetPath = 'assets/legacy/redraw-wide/legacy_crystal_cave_clean_wide_v1_image2.png';
    expect(preloadSource).toContain(`legacy_crystal_cave_clean:\n    '${assetPath}'`);
    expect(existsSync(path.resolve('public', assetPath))).toBe(true);
  });

  it('routes the water crystal cave hotspot to the playable survey scene', () => {
    const hotspot = LEGACY_LOCATIONS.energy_cave.hotspots.find((item) => item.id === 'cave-crystal');
    expect(hotspot?.action).toMatchObject({
      kind: 'scene',
      target: SceneKey.CRYSTAL_MINE,
    });
  });

  it('turns cave story and daily goals into real crystal survey play', () => {
    const mainQuest = QUESTS_MAIN.find((quest) => quest.id === 'q_main_006');
    const dailyQuest = QUESTS_DAILY_POOL.find((quest) => quest.id === 'd_crystal_patrol');
    expect(mainQuest?.conditions).toContainEqual({
      kind: 'minigame_runs',
      minigameId: 'crystal_mine_survey',
      count: 1,
    });
    expect(dailyQuest?.conditions).toContainEqual({
      kind: 'collect_item_from',
      itemId: 'crystal_shard',
      source: 'energy_cave:crystal_survey',
      count: 1,
    });
  });
});
