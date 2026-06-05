import type { FurniturePlacement } from './furniture';
import type { PlayerPet } from './pet';
import type { QuestState } from './quest';
import type { VipSnapshot } from './vip';

/**
 * 玩家设置快照：BGM / SFX 音量。由 AudioManager / SettingsPanel 读写。
 *
 * - 音量值为 [0, 1] 闭区间的浮点数，PlayerState 的 setBgmVolume / setSfxVolume
 *   会在写入时夹紧到合法范围，避免 localStorage 被外部污染。
 */
export type PlayerGender = 'female' | 'male';

export interface PlayerSettings {
  readonly bgmVolume: number;
  readonly sfxVolume: number;
  readonly playerGender?: PlayerGender;
}

/**
 * 每日滚动上下文：记录上一次按 UTC 日期刷新每日任务 / 商店折扣的结果。
 *
 * - `lastRolledDate`：最近一次滚动发生的 UTC 日期字符串（YYYY-MM-DD）。null 表示从未滚动。
 * - `shopDiscountIds`：今日打折的商品 id 列表。空数组表示没有折扣或尚未滚动。
 * - `dailyQuestIds`：今日发布的每日任务 id 列表。
 *
 * DailyQuest 纯函数负责在跨日时重新计算这三项并返回新的 context；PlayerState 负责落盘。
 */
export interface DailyContext {
  readonly lastRolledDate: string | null;
  readonly shopDiscountIds: ReadonlyArray<string>;
  readonly shopDiscountDate?: string | null;
  readonly dailyQuestIds: ReadonlyArray<string>;
}

/**
 * 玩家存档 v3（FEAT-300 起）。
 *
 * 相比 v2 新增：
 * - `inventory: Record<string, number>`：背包物品计数（key=ItemId，value=持有数量）。
 * - `homeLayout: FurniturePlacement[]`：家园 8×6 房间的家具摆放。
 * - `questStates: Record<QuestId, QuestState>`：任务状态机持久化。
 * - `vip: VipSnapshot`：VIP 签到连续天数快照（与已有 isVip 字段正交共存）。
 * - `settings: PlayerSettings`：BGM/SFX 音量。
 * - `dailyContext: DailyContext`：每日任务 & 商店折扣的上次滚动记录。
 *
 * `SaveManager.SAVE_KEY` 仍保持 `'hbcc:savefile:v1'`（硬红线：不换 key），
 * schema 版本号通过 `version` 字段判别并自动迁移（v1→v2→v3）。
 */
export interface PlayerSaveV3 {
  version: 3;
  playerName: string;
  coins: number;
  isVip: boolean;
  playerPets: PlayerPet[];
  defeatedBossIds: string[];
  unlockedMaps: string[];
  pokeballs: number;
  /** 物品库存：key=ItemId，value=持有数量（>=0）。空 `{}` 表示没有任何物品。 */
  inventory: Record<string, number>;
  /** 已摆放的家园家具列表。空 `[]` 表示家园空房。 */
  homeLayout: FurniturePlacement[];
  /** 任务状态机：key=QuestId，value=QuestState。主线任务默认 locked，daily 默认空。 */
  questStates: Record<string, QuestState>;
  /** VIP 签到快照。 */
  vip: VipSnapshot;
  /** BGM/SFX 音量设置。 */
  settings: PlayerSettings;
  /** 每日刷新上下文。 */
  dailyContext: DailyContext;
  /** 毫秒级时间戳，便于 UI 显示"上次保存于..." */
  lastSavedAt: number;
}

/**
 * 当前玩家存档 v4。
 *
 * v4 在 v3 基础上新增 `petStorage`：队伍以 `playerPets` 表示，精灵仓库以
 * `petStorage` 表示。读取旧 v3 存档时，前 6 只保留在队伍，剩余精灵自动迁入仓库。
 */
export interface PlayerSaveV4 extends Omit<PlayerSaveV3, 'version'> {
  version: 4;
  petStorage: PlayerPet[];
}

/**
 * 当前业务层使用的存档类型别名：始终指向最新 schema 版本。
 * 迁移识别用的历史 shape 在 PlayerSaveV1 / PlayerSaveV2 中独立保留。
 */
export type PlayerSave = PlayerSaveV4;

/**
 * Legacy v2 存档结构（FEAT-205 ~ FEAT-300 之前）。
 *
 * 仅供 `SaveManager.load()` 识别旧 JSON 并走 `migrateV2ToV3` 流程。
 * 业务层不应再写入此结构；一旦 load 过即被自动升级为 v3 并写回。
 */
export interface PlayerSaveV2 {
  version: 2;
  playerName: string;
  coins: number;
  isVip: boolean;
  playerPets: PlayerPet[];
  defeatedBossIds: string[];
  unlockedMaps: string[];
  pokeballs: number;
  lastSavedAt: number;
}

/**
 * Legacy v1 存档结构（FEAT-205 之前）。
 *
 * 仅用于 `SaveManager.load()` 识别旧 JSON 并走 `migrateV1ToV2` 流程。
 * v1 存档一旦 load 过即被自动升级并写回（目前会直接链式到 v3）。
 */
export interface PlayerSaveV1 {
  version: 1;
  playerName: string;
  coins: number;
  isVip: boolean;
  ownedPetIds: string[];
  defeatedBossIds: string[];
  lastSavedAt: number;
}
