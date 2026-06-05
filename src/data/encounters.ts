/**
 * 野生精灵遭遇（encounter）配置。
 *
 * 每条 EncounterDef 描述一个 zoneId 的行为：
 *   - `triggerPerStep`：玩家每步触发概率（0..1）；
 *   - `pool`：加权精灵池，每项 `{ petId, weight, levelRange: [lo, hi] }`。
 *
 * 设计要点：
 *   - 本文件的所有 petId 必须能在 PETS 表中 resolve（FEAT-207 起由
 *     tests/encounters.test.ts 强校验）。新加的 sand_crab / coral_fin /
 *     seabreeze_gull / dew_sprite 已在 src/data/pets.ts 注册完毕。
 *   - 真正的 rollEncounter 纯函数 + BattleScene 捕捉触发流程在 FEAT-206 接入。
 */

export interface EncounterPoolEntry {
  readonly petId: string;
  readonly weight: number;
  readonly levelRange: readonly [number, number];
}

export interface EncounterDef {
  readonly zoneId: string;
  readonly mapId: string;
  readonly triggerPerStep: number;
  readonly pool: readonly EncounterPoolEntry[];
}

/**
 * 所有遭遇配置。键与 src/data/maps.ts 的 encounterZones[i].zoneId 一一对应。
 */
export const ENCOUNTERS: Record<string, EncounterDef> = {
  'rainbow_city:garden': {
    zoneId: 'rainbow_city:garden',
    mapId: 'rainbow_city',
    triggerPerStep: 0.18,
    pool: [
      { petId: 'leaf_sprite', weight: 50, levelRange: [7, 9] },
      { petId: 'spark_mouse', weight: 30, levelRange: [7, 9] },
      { petId: 'yu_mengqian', weight: 20, levelRange: [7, 9] },
      // FEAT-207：草系新成员低权重作点缀，保持主线草系选项丰富。
      { petId: 'dew_sprite', weight: 10, levelRange: [7, 9] },
      { petId: 'pester_priest', weight: 10, levelRange: [7, 9] },
      { petId: 'fars_fire_donkey', weight: 10, levelRange: [7, 9] },
      { petId: 'arthur_knight', weight: 8, levelRange: [7, 9] },
    ],
  },
  'beach:shoreline': {
    zoneId: 'beach:shoreline',
    mapId: 'beach',
    triggerPerStep: 0.22,
    pool: [
      { petId: 'aqua_turtle', weight: 40, levelRange: [14, 16] },
      // FEAT-207 起下列三项均已在 PETS 表注册。
      { petId: 'sand_crab', weight: 30, levelRange: [14, 16] },
      { petId: 'coral_fin', weight: 20, levelRange: [14, 16] },
      { petId: 'seabreeze_gull', weight: 10, levelRange: [14, 16] },
      { petId: 'elephant_walrus', weight: 12, levelRange: [14, 16] },
      { petId: 'aotian_dragon', weight: 8, levelRange: [14, 16] },
      { petId: 'erebus_penguin', weight: 5, levelRange: [14, 16] },
    ],
  },
  'bath_center:spa': {
    zoneId: 'bath_center:spa',
    mapId: 'bath_center',
    triggerPerStep: 0.24,
    pool: [
      { petId: 'zeng_ming', weight: 70, levelRange: [21, 24] },
      { petId: 'seabreeze_gull', weight: 18, levelRange: [21, 24] },
      { petId: 'pearl_guard', weight: 12, levelRange: [21, 24] },
    ],
  },
  'coral_market:harbor': {
    zoneId: 'coral_market:harbor',
    mapId: 'coral_market',
    triggerPerStep: 0.2,
    pool: [
      { petId: 'coral_fin', weight: 30, levelRange: [18, 20] },
      { petId: 'coral_lantern', weight: 28, levelRange: [18, 20] },
      { petId: 'pearl_guard', weight: 18, levelRange: [18, 21] },
      { petId: 'sand_crab', weight: 16, levelRange: [18, 20] },
      { petId: 'cloud_ferret', weight: 8, levelRange: [19, 21] },
    ],
  },
  'star_observatory:starlight': {
    zoneId: 'star_observatory:starlight',
    mapId: 'star_observatory',
    triggerPerStep: 0.18,
    pool: [
      { petId: 'star_jelly', weight: 34, levelRange: [24, 27] },
      { petId: 'aurora_deer', weight: 28, levelRange: [24, 27] },
      { petId: 'cloud_ferret', weight: 16, levelRange: [24, 26] },
      { petId: 'rainbow_wing', weight: 4, levelRange: [26, 28] },
    ],
  },
  'storm_ruins:tempest': {
    zoneId: 'storm_ruins:tempest',
    mapId: 'storm_ruins',
    triggerPerStep: 0.24,
    pool: [
      { petId: 'storm_ray', weight: 34, levelRange: [31, 35] },
      { petId: 'crystal_golem', weight: 30, levelRange: [31, 35] },
      { petId: 'oni_tyranno', weight: 14, levelRange: [32, 35] },
      { petId: 'zeng_yi', weight: 10, levelRange: [32, 35] },
      { petId: 'aotian_dragon', weight: 5, levelRange: [34, 36] },
    ],
  },
  'tide_playground:lagoon': {
    zoneId: 'tide_playground:lagoon',
    mapId: 'tide_playground',
    triggerPerStep: 0.2,
    pool: [
      { petId: 'tide_otter', weight: 34, levelRange: [22, 25] },
      { petId: 'pearl_guard', weight: 24, levelRange: [22, 25] },
      { petId: 'coral_lantern', weight: 18, levelRange: [22, 24] },
      { petId: 'seabreeze_gull', weight: 14, levelRange: [22, 24] },
      { petId: 'aurora_deer', weight: 6, levelRange: [24, 26] },
    ],
  },
};

/**
 * 按 zoneId 取 EncounterDef。严格模式下返回 undefined 代表未知 zone。
 */
export function getEncounter(zoneId: string): EncounterDef | undefined {
  return ENCOUNTERS[zoneId];
}
