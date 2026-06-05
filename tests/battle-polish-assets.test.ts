import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('battle polish asset wiring', () => {
  it('registers the gpt-image-2 v2 battle arena and its fast runtime derivative', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    expect(preloadSource).toContain(
      "premium_battle_arena_v2_image2:\n    'assets/legacy/image2-restored/ui/premium_battle_arena_v2_image2.webp'",
    );

    const sourceAsset = path.resolve(
      'public/assets/legacy/image2-restored/ui/premium_battle_arena_v2_image2.webp',
    );
    const fastAsset = path.resolve(
      'public/assets/legacy/fast/image2-restored/ui/premium_battle_arena_v2_image2_fast.webp',
    );
    expect(existsSync(sourceAsset)).toBe(true);
    expect(existsSync(fastAsset)).toBe(true);
    expect(statSync(sourceAsset).size).toBeGreaterThan(250_000);
    expect(statSync(fastAsset).size).toBeGreaterThan(100_000);
  });

  it('preloads battle potions for the in-battle healing command', () => {
    const preloaderSource = readFileSync(
      path.resolve('src/systems/SceneAssetPreloader.ts'),
      'utf8',
    );
    expect(preloaderSource).toContain("'premium_battle_arena_v2_image2'");
    expect(preloaderSource).toContain("'potion_small'");
    expect(preloaderSource).toContain("'potion_medium'");
    expect(preloaderSource).toContain("'potion_large'");
  });

  it('uses the v2 arena and exposes healing items in BattleScene', () => {
    const battleSource = readFileSync(path.resolve('src/scenes/BattleScene.ts'), 'utf8');
    const introSource = readFileSync(path.resolve('src/scenes/BattleIntroScene.ts'), 'utf8');
    expect(battleSource).toContain(
      "const PREMIUM_BATTLE_ARENA_V2_BG = 'premium_battle_arena_v2_image2'",
    );
    expect(introSource).toContain(
      "const PREMIUM_BATTLE_ARENA_V2_BG = 'premium_battle_arena_v2_image2'",
    );
    expect(battleSource).toContain('export const BATTLE_HEALING_ITEM_IDS');
  });

  it('keeps wild battle capture and escape commands visible above the skill grid', () => {
    const battleSource = readFileSync(path.resolve('src/scenes/BattleScene.ts'), 'utf8');
    const drawItemCommand = battleSource.slice(
      battleSource.indexOf('private drawItemCommandButton(): void'),
      battleSource.indexOf('private drawSkillButtons(): void'),
    );
    const drawSkillButtons = battleSource.slice(
      battleSource.indexOf('private drawSkillButtons(): void'),
      battleSource.indexOf('private makeSkillButton('),
    );

    expect(drawItemCommand).toContain('this.captureButton = this.makeCaptureButton(306, 36, 108)');
    expect(drawItemCommand).toContain('this.escapeButton = this.makeEscapeButton(426, 36, 108)');
    expect(drawSkillButtons).toContain('const visibleSkillIds = skillIds.slice(0, 8)');
    expect(drawSkillButtons).not.toContain('makeCaptureButton');
    expect(drawSkillButtons).not.toContain('makeEscapeButton');
  });
});
