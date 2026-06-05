import Phaser from 'phaser';

import { SceneKey } from '@/config/GameConfig';
import { PlayerState } from '@/systems/PlayerState';

/**
 * 应用启动入口场景：在任何其他场景之前读取存档，随后切到 PreloadScene。
 * 不做资源加载（那是 PreloadScene 的职责），仅负责状态初始化。
 */
export class BootScene extends Phaser.Scene {
  public constructor() {
    super({ key: SceneKey.BOOT });
  }

  public create(): void {
    PlayerState.init();
    this.scene.start(SceneKey.PRELOAD);
  }
}
