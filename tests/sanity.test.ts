import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';

describe('工程脚手架烟雾测试', () => {
  it('基础算术应工作', () => {
    expect(1 + 1).toBe(2);
  });

  it('GameConfig 常量应存在并符合预期', () => {
    expect(GAME_WIDTH).toBe(960);
    expect(GAME_HEIGHT).toBe(640);
    expect(SceneKey.BOOT).toBe('BootScene');
    expect(SceneKey.PRELOAD).toBe('PreloadScene');
    expect(SceneKey.TITLE).toBe('TitleScene');
    expect(SceneKey.WORLD).toBe('WorldMapScene');
    expect(SceneKey.GYM).toBe('GymScene');
    expect(SceneKey.CRYSTAL_MINE).toBe('CrystalMineScene');
    expect(SceneKey.MAZE_TRIAL).toBe('MazeTrialScene');
    expect(SceneKey.SHIP_CORE).toBe('ShipCoreScene');
    expect(SceneKey.BATTLE).toBe('BattleScene');
  });
});
