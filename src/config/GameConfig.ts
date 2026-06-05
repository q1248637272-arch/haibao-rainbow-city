/**
 * 游戏全局配置与场景键。
 * 画布尺寸按早期 Flash 页游的 4:3 比例扩展到 960x640，兼顾 16:10 宽屏。
 */

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 640;
export const BACKGROUND_COLOR = 0x87ceeb;

/**
 * 彩虹城世界地图的网格参数：15 列 × 10 行，每格 64px，恰好铺满 960×640。
 */
export const TILE_SIZE = 64;
export const MAP_COLS = 15;
export const MAP_ROWS = 10;

/**
 * 小海宝的移动速度（像素 / 秒）。
 */
export const PLAYER_SPEED = 180;

/**
 * 等距（isometric）瓦片尺寸。
 *
 * 采用 2:1 diamond 投影：顶/底夹角 ≈ 26.57°，每一格在屏幕上是 128×64 的菱形。
 * 与 Kenney Isometric Landscape 素材（132×83 基底；132×99 有坡；132×131 高物）保持近似契合：
 * 132×83 的素材铺到 128×64 的格子里留有上下少量盖边，对应小斜坡阴影。
 */
export const TILE_W = 128;
export const TILE_H = 64;

/**
 * 世界 (0,0) 在屏幕上的像素位置。
 *
 * 水平居中 (GAME_WIDTH / 2)，纵向靠上留出 60px 头部空间，
 * 使得 col+row 较大的格子仍然落在可视区内。后续场景若需要偏移相机，
 * 应传入自己的 offset 参数给 worldToScreen / screenToWorld，而不修改此常量。
 */
export const ISO_ORIGIN_X = GAME_WIDTH / 2;
export const ISO_ORIGIN_Y = 60;

/**
 * 场景键常量。后续 feature 会逐个注册这些场景。
 * 使用 `as const` 以便 TypeScript 推导为字面量联合类型。
 */
export const SceneKey = {
  BOOT: 'BootScene',
  PRELOAD: 'PreloadScene',
  TITLE: 'TitleScene',
  GUIDE: 'GuideScene',
  LEGACY_LOCATION: 'LegacyLocationScene',
  LEGACY_ROUTE_MAP: 'LegacyRouteMapScene',
  PET_MANAGER: 'PetManagerScene',
  PET_DEX: 'PetDexScene',
  SAVE_SLOTS: 'SaveSlotScene',
  HOME: 'HomeScene',
  FARM: 'FarmScene',
  BACKPACK: 'BackpackScene',
  ACTIVITY: 'ActivityScene',
  RAINBOW_HALL: 'RainbowHallScene',
  CASINO: 'CasinoScene',
  WORLD: 'WorldMapScene',
  GYM: 'GymScene',
  CRYSTAL_MINE: 'CrystalMineScene',
  BATTLE_INTRO: 'BattleIntroScene',
  BATTLE: 'BattleScene',
  /**
   * FEAT-204 起新增：海滨沙滩地图。
   * 通过彩虹城东南角的 portal_beach 地标进入；在场景西侧有 portal_back 返回彩虹城。
   */
  BEACH: 'BeachScene',
  /**
   * FEAT-304 起新增：彩虹城商店。
   * 通过彩虹城 `shop` 地标进入。UI 有 7 个 Tab：精灵球 / 恢复药品 / 强化道具 /
   * 进化道具 / 家具装扮 / 限时商品 / VIP 专属。购买结算由 ShopSystem 纯函数。
   */
  SHOP: 'ShopScene',
  /**
   * FEAT-303 起新增：任务板。
   * 通过彩虹城 `quest` 地标进入。两 Tab 展示主线任务与每日任务，
   * 按钮直接领取 QuestEngine 计算出的奖励。
  */
  QUEST_BOARD: 'QuestBoardScene',
  LIBRARY_ARCHIVE: 'LibraryArchiveScene',
  MAZE_TRIAL: 'MazeTrialScene',
  SHIP_CORE: 'ShipCoreScene',
  /**
   * FEAT-305 起新增：签到 / VIP 特权面板。
   * 通过彩虹城 `vip_panel` 地标进入，连续签到第 3 天解锁 VIP。
   */
  VIP_PANEL: 'VipPanelScene',
  TIDE_TRIAL: 'TideTrialScene',
} as const;

export type SceneKeyValue = (typeof SceneKey)[keyof typeof SceneKey];
