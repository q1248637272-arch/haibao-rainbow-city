import { SceneKey, type SceneKeyValue } from '@/config/GameConfig';

import type { LegacyLocationId } from '@/scenes/LegacyContent';

export interface PetTrace {
  readonly label: string;
  readonly description: string;
  readonly scene: SceneKeyValue;
  readonly locationId?: LegacyLocationId;
}

const centerPatrol: PetTrace = {
  label: '彩虹城中心巡游',
  description: '会在彩虹城中心的广场附近随机刷新并移动。',
  scene: SceneKey.WORLD,
};

const gardenTrace: PetTrace = {
  label: '彩虹城花园遭遇',
  description: '中心、实验室和迷宫一带的草系/火系野外池会刷新。',
  scene: SceneKey.LEGACY_LOCATION,
  locationId: 'center',
};

const mazeTrace: PetTrace = {
  label: '迷宫入口',
  description: '迷宫附近的野外巡游和遭遇区更容易遇到。',
  scene: SceneKey.LEGACY_LOCATION,
  locationId: 'maze',
};

const energyTrace: PetTrace = {
  label: '能源田海滨路线',
  description: '能源田、水晶矿洞和飞船路线会刷新海滨系精灵。',
  scene: SceneKey.LEGACY_LOCATION,
  locationId: 'energy_field',
};

const crystalTrace: PetTrace = {
  label: '水晶矿洞',
  description: '矿洞里的水晶与海滨遭遇池会吸引稀有水系精灵。',
  scene: SceneKey.LEGACY_LOCATION,
  locationId: 'energy_cave',
};

const dollTrace: PetTrace = {
  label: '玩偶基地',
  description: '旧版玩偶和特殊巡游精灵主要在玩偶基地一线出现。',
  scene: SceneKey.LEGACY_LOCATION,
  locationId: 'doll_base',
};

const activityTrace: PetTrace = {
  label: '活动大厅',
  description: '通过限时活动、友情活动或活动奖励获得。',
  scene: SceneKey.ACTIVITY,
};

const bathTrace: PetTrace = {
  label: '洗浴中心',
  description: '只会在洗浴中心的温泉雾气附近随机刷新并移动。',
  scene: SceneKey.LEGACY_LOCATION,
  locationId: 'bath_center',
};

const coralMarketTrace: PetTrace = {
  label: '珊瑚集市灯潮',
  description: '珊瑚集市的灯潮区会刷新水系、光系和少量高速精灵。',
  scene: SceneKey.LEGACY_LOCATION,
  locationId: 'coral_market',
};

const starObservatoryTrace: PetTrace = {
  label: '星辉观测台',
  description: '星盘附近会刷新星泡水母、极光鹿和少量稀有光翼精灵。',
  scene: SceneKey.LEGACY_LOCATION,
  locationId: 'star_observatory',
};

const stormRuinsTrace: PetTrace = {
  label: '风暴遗迹雷柱',
  description: '高等级雷柱区域会刷新风暴鳐、晶岩守卫和少量遗迹强敌。',
  scene: SceneKey.LEGACY_LOCATION,
  locationId: 'storm_ruins',
};

const tidePlaygroundTrace: PetTrace = {
  label: '潮汐试炼场',
  description: '潮汐试炼场的潮池会刷新潮汐水獭，完成试炼小游戏也有机会得到它。',
  scene: SceneKey.LEGACY_LOCATION,
  locationId: 'tide_playground',
};

const vipTrace: PetTrace = {
  label: 'VIP 特权',
  description: '通过 VIP 面板、签到或会员玩偶路线获得。',
  scene: SceneKey.VIP_PANEL,
};

export const PET_TRACES: Record<string, readonly PetTrace[]> = {
  flame_puppy: [centerPatrol, gardenTrace],
  aqua_turtle: [energyTrace],
  leaf_sprite: [gardenTrace],
  spark_mouse: [centerPatrol, gardenTrace],
  stone_calf: [centerPatrol],
  rainbow_wing: [vipTrace, centerPatrol],
  li_yanwen: [activityTrace, crystalTrace],
  li_aoxiang: [activityTrace],
  yu_mengqian: [gardenTrace, activityTrace],
  zeng_ming: [bathTrace, activityTrace],
  zeng_yi: [activityTrace],
  cai_xukun: [activityTrace],
  meng_lei: [activityTrace],
  coral_fin: [energyTrace],
  sand_crab: [energyTrace],
  seabreeze_gull: [energyTrace],
  sunny_puppy: [centerPatrol],
  dew_sprite: [gardenTrace],
  pearl_guard: [energyTrace, crystalTrace],
  fars_fire_donkey: [centerPatrol, mazeTrace],
  arthur_knight: [centerPatrol, mazeTrace],
  elephant_walrus: [energyTrace],
  xuanqing_jingwei: [vipTrace, dollTrace],
  aotian_dragon: [vipTrace, crystalTrace],
  erebus_penguin: [energyTrace, crystalTrace],
  ingmar_night: [energyTrace],
  hekapu_night: [energyTrace],
  leonard_gunner: [energyTrace],
  pester_priest: [gardenTrace, mazeTrace],
  oni_tyranno: [dollTrace],
  diudiu_maori: [dollTrace],
  cloud_ferret: [coralMarketTrace, starObservatoryTrace],
  coral_lantern: [coralMarketTrace],
  star_jelly: [starObservatoryTrace],
  storm_ray: [stormRuinsTrace],
  crystal_golem: [stormRuinsTrace],
  aurora_deer: [starObservatoryTrace],
  tide_otter: [tidePlaygroundTrace],
};

export function getPetTraces(petId: string): readonly PetTrace[] {
  return PET_TRACES[petId] ?? [activityTrace];
}
