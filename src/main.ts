import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH } from '@/config/GameConfig';
import { BattleScene } from '@/scenes/BattleScene';
import { BattleIntroScene } from '@/scenes/BattleIntroScene';
import { BackpackScene } from '@/scenes/BackpackScene';
import { BeachScene } from '@/scenes/BeachScene';
import { BootScene } from '@/scenes/BootScene';
import { CasinoScene } from '@/scenes/CasinoScene';
import { CrystalMineScene } from '@/scenes/CrystalMineScene';
import { FarmScene } from '@/scenes/FarmScene';
import { GymScene } from '@/scenes/GymScene';
import { GuideScene } from '@/scenes/GuideScene';
import { HomeScene } from '@/scenes/HomeScene';
import { ActivityScene } from '@/scenes/ActivityScene';
import { LegacyLocationScene } from '@/scenes/LegacyLocationScene';
import { LegacyMapScene } from '@/scenes/LegacyMapScene';
import { LegacyRouteMapScene } from '@/scenes/LegacyRouteMapScene';
import { LibraryArchiveScene } from '@/scenes/LibraryArchiveScene';
import { MazeTrialScene } from '@/scenes/MazeTrialScene';
import { PetDexScene } from '@/scenes/PetDexScene';
import { PetManagerScene } from '@/scenes/PetManagerScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { QuestBoardScene } from '@/scenes/QuestBoardScene';
import { RainbowHallScene } from '@/scenes/RainbowHallScene';
import { SaveSlotScene } from '@/scenes/SaveSlotScene';
import { ShopScene } from '@/scenes/ShopScene';
import { ShipCoreScene } from '@/scenes/ShipCoreScene';
import { TitleScene } from '@/scenes/TitleScene';
import { TideTrialScene } from '@/scenes/TideTrialScene';
import { VipPanelScene } from '@/scenes/VipPanelScene';
import { attachQuestRuntime } from '@/systems/QuestRuntime';

/**
 * 游戏入口。FEAT-305 起注册 10 个场景：
 * Boot → Preload → Title → WorldMap ↔ Beach / Shop / QuestBoard / VipPanel → Gym → Battle。
 *
 * 同时在启动阶段挂上 QuestRuntime：订阅 gameEvents 的 battle:victory /
 * capture:success / shop:purchase / map:enter，自动推进任务状态机并写回 PlayerState。
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game',
  backgroundColor: BACKGROUND_COLOR,
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    GuideScene,
    LegacyRouteMapScene,
    SaveSlotScene,
    PetDexScene,
    PetManagerScene,
    HomeScene,
    FarmScene,
    BackpackScene,
    ActivityScene,
    RainbowHallScene,
    CasinoScene,
    LegacyMapScene,
    LegacyLocationScene,
    LibraryArchiveScene,
    MazeTrialScene,
    ShipCoreScene,
    CrystalMineScene,
    TideTrialScene,
    BeachScene,
    GymScene,
    BattleIntroScene,
    BattleScene,
    ShopScene,
    QuestBoardScene,
    VipPanelScene,
  ],
};

const game = new Phaser.Game(config);

(globalThis as { __HAIBAO_GAME__?: Phaser.Game }).__HAIBAO_GAME__ = game;

installResponsiveCameraCentering(game);

// BootScene 的 create() 会先 PlayerState.init() 读入存档；随后把 QuestRuntime 挂到
// 全局事件总线上。这里放在 new Game 之后即可：QuestRuntime 纯订阅事件，不依赖 scene。
attachQuestRuntime();

function installResponsiveCameraCentering(gameInstance: Phaser.Game): void {
  const installed = new WeakSet<Phaser.Scene>();

  const centerScene = (scene: Phaser.Scene): void => {
    const camera = scene.cameras?.main;
    if (!camera) return;
    camera.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  };

  const installScene = (scene: Phaser.Scene): void => {
    if (installed.has(scene)) return;
    installed.add(scene);

    const refresh = (): void => centerScene(scene);

    scene.events.on(Phaser.Scenes.Events.START, refresh);
    scene.events.on(Phaser.Scenes.Events.CREATE, refresh);
    scene.events.on(Phaser.Scenes.Events.WAKE, refresh);
    scene.events.on(Phaser.Scenes.Events.RESUME, refresh);
    scene.scale.on(Phaser.Scale.Events.RESIZE, refresh);
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, refresh);
    });
  };

  gameInstance.events.once(Phaser.Core.Events.READY, () => {
    for (const scene of gameInstance.scene.scenes) {
      installScene(scene);
      centerScene(scene);
    }
  });
}
