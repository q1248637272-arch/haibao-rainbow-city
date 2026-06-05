/**
 * 音频配置表（FEAT-302）。
 *
 * 合规硬红线：文件 / 代码 / 注释中严禁出现任何指向具体版权歌曲或艺人身份的关键词。
 * 所有 BGM key 均采用功能化命名（场景名 / 战斗类型），唯一带"角色 id"的 key
 * `battle_special_cai_xukun` 引用的是项目内部精灵 id（见 src/data/pets.ts 的 20 精灵清单），
 * 而非任何外部艺人或歌曲名。
 *
 * 实际音频文件由玩家 / 部署者自备合法素材放入 `public/assets/audio/`，
 * 仓库不打包任何 `.mp3/.ogg/.wav`（见 `.gitignore`）。
 * AudioManager 在文件缺失时会静默降级到静音，不影响游戏运行。
 */

/**
 * BGM key → 资源相对路径（相对 Vite public/ 根）。
 *
 * 运行时 PreloadScene 会遍历本对象用 `this.load.audio(key, path)` 入队；
 * loader 在文件 404 / decode 失败时触发 `loaderror`，由 AudioManager.markFailed
 * 统一把 key 加入失败集合避免反复 warn。
 */
export const BGM_CONFIG = {
  title: 'assets/audio/bgm_title.mp3',
  world_rainbow: 'assets/audio/bgm_worldmap.mp3',
  world_beach: 'assets/audio/bgm_beach.mp3',
  world_forest: 'assets/audio/bgm_forest.mp3',
  world_volcano: 'assets/audio/bgm_volcano.mp3',
  battle_normal: 'assets/audio/battle_normal.mp3',
  battle_boss: 'assets/audio/battle_boss.mp3',
  home: 'assets/audio/bgm_home.mp3',
  shop: 'assets/audio/bgm_shop.mp3',
  battle_special_cai_xukun: 'assets/audio/battle_special_cai_xukun.mp3',
  battle_special_rainbow: 'assets/audio/battle_special_rainbow.mp3',
} as const;

/** BGM_CONFIG 的 key 联合类型。 */
export type BgmKey = keyof typeof BGM_CONFIG;

/**
 * 战斗 BGM 覆盖表：当战斗涉及特定精灵 id（无论玩家方还是敌方）时，
 * 覆盖默认的 `battle_normal` / `battle_boss` 改用专属战斗曲。
 *
 * value 必须是 BGM_CONFIG 中真实存在的 key（在 tests/audio-config.test.ts 里强制校验）。
 */
export const BATTLE_BGM_OVERRIDES: Record<string, BgmKey> = {
  cai_xukun: 'battle_special_cai_xukun',
  rainbow_wing: 'battle_special_rainbow',
  xuanqing_jingwei: 'battle_special_rainbow',
  aotian_dragon: 'battle_special_rainbow',
};

/**
 * 根据战斗双方 id 与战斗类型决定 BGM key。
 *
 * 决议顺序：
 *   1. 若 `petId` 或 `enemyId` 命中 BATTLE_BGM_OVERRIDES，则使用该覆盖曲（玩家命中优先于敌方）；
 *   2. 否则按 `enemyKind` 分派：`boss` → `battle_boss`，`wild` → `battle_normal`。
 *
 * - `petId === null` / `enemyId === null` 表示该方未知（例如测试传空）；
 *   仅当另一侧命中覆盖时才会生效，null 不会错误命中 override。
 * - 这是一个纯函数，不依赖 Phaser / PlayerState，供 BattleScene 与测试共同使用。
 */
export function resolveBattleBgm(
  petId: string | null,
  enemyId: string | null,
  enemyKind: 'boss' | 'wild',
): BgmKey {
  if (petId !== null) {
    const playerOverride = BATTLE_BGM_OVERRIDES[petId];
    if (playerOverride !== undefined) return playerOverride;
  }
  if (enemyId !== null) {
    const enemyOverride = BATTLE_BGM_OVERRIDES[enemyId];
    if (enemyOverride !== undefined) return enemyOverride;
  }
  return enemyKind === 'boss' ? 'battle_boss' : 'battle_normal';
}
