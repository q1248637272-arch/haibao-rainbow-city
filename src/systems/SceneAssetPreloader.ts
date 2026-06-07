import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '@/config/GameConfig';
import { ENCOUNTERS } from '@/data/encounters';
import {
  HOME_HOTSPOT_IMAGE_ASSETS,
  HOME_V3_BACKGROUND_KEY,
} from '@/data/homeHotspots';
import { ITEMS } from '@/data/items';
import { PETS } from '@/data/pets';
import { ROUTE_MAP_HOTSPOT_IMAGE_ASSETS } from '@/data/routeMapHotspots';
import {
  fastLegacyAssetPath,
  expandedLegacyAssetKey,
  expandedLegacyAssetPath,
  itemAssetPath,
  LEGACY_HAIDI_ASSETS,
  wideLegacyAssetKey,
  wideLegacyAssetPath,
} from '@/scenes/PreloadScene';
import { LEGACY_LOCATIONS, type LegacyLocationId } from '@/scenes/LegacyContent';
import { gymPetPreloadPlanForSave } from '@/systems/GymPreloadPlan';
import { preloadParallelDownloads } from '@/systems/PerformanceProfile';
import { PlayerState } from '@/systems/PlayerState';
import {
  VIRTUAL_PLAYER_AVATAR_ASSETS,
  VIRTUAL_PLAYER_AVATAR_FRAME_HEIGHT,
  VIRTUAL_PLAYER_AVATAR_FRAME_WIDTH,
  type VirtualPlayerAvatarAsset,
} from '@/systems/VirtualPlayers';

interface BattleAssetData {
  readonly mode?: 'boss' | 'wild' | 'trainer';
  readonly petId?: string;
  readonly bossId?: string;
  readonly wildPetId?: string;
  readonly trainer?: { readonly party?: ReadonlyArray<{ readonly petId: string }> };
}

const STARTUP_PET_IDS = [
  'flame_puppy',
  'spark_mouse',
  'sunny_puppy',
  'dew_sprite',
  'stone_calf',
  'rainbow_wing',
  'elephant_walrus',
  'pester_priest',
  'fars_fire_donkey',
  'arthur_knight',
] as const;

const LOCATION_PET_POOLS: Readonly<Record<string, readonly string[]>> = {
  'rainbow_city:garden': [
    'flame_puppy',
    'spark_mouse',
    'sunny_puppy',
    'dew_sprite',
    'stone_calf',
    'pester_priest',
    'fars_fire_donkey',
    'arthur_knight',
    'xuanqing_jingwei',
  ],
  'beach:shoreline': [
    'sand_crab',
    'seabreeze_gull',
    'spark_mouse',
    'sunny_puppy',
    'pearl_guard',
    'elephant_walrus',
    'aotian_dragon',
    'erebus_penguin',
    'ingmar_night',
    'hekapu_night',
  ],
  'bath_center:spa': ['zeng_ming'],
  'coral_market:harbor': ['coral_fin', 'coral_lantern', 'pearl_guard', 'sand_crab', 'cloud_ferret'],
  'star_observatory:starlight': ['star_jelly', 'aurora_deer', 'cloud_ferret', 'rainbow_wing'],
  'storm_ruins:tempest': ['storm_ray', 'crystal_golem', 'oni_tyranno', 'zeng_yi', 'aotian_dragon'],
  'tide_playground:lagoon': [
    'tide_otter',
    'pearl_guard',
    'coral_lantern',
    'seabreeze_gull',
    'aurora_deer',
  ],
};

const ACTIVITY_KEYS = [
  'legacy_haidi_lab',
  'activity_basketball_practice',
  'activity_chicken_beauty',
  'activity_lele_temptation',
  'activity_ex_girlfriend_meal',
  'activity_rainbow_carnival',
  'activity_crystal_rush',
  'activity_star_bubble_rescue',
  'activity_rainbow_core_relay',
  'activity_star_tide_purification',
  'activity_rainbow_academy',
  'activity_pet_hatchery',
  'activity_trial_tower',
] as const;

const HOME_KEYS = [
  HOME_V3_BACKGROUND_KEY,
  'legacy_home_walkable',
  'home_farm_panel',
  'object_pet_incubator',
] as const;

const HOME_ITEM_IDS = [
  'rainbow_pet_egg',
  'energy_seed',
  'angel_chest',
  'gold_shell',
  'repair_chip',
  'exp_candy',
  'potential_seed',
  'element_fruit_fire',
  'element_fruit_water',
  'element_fruit_grass',
  'element_fruit_electric',
  'element_fruit_light',
] as const;

const FARM_KEYS = ['legacy_farm_walkable'] as const;

const BEACH_KEYS = ['legacy_beach_integrated'] as const;

const BASE_CHARACTER_KEYS = [
  'legacy_player_hero',
  'legacy_player_merman_male',
  'legacy_player_fairy',
  'legacy_player_moni',
] as const;

export function preloadStartupWorldAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在准备彩虹城...',
    legacyKeys: [
      'legacy_entry_full',
      'legacy_world_map_full',
      'legacy_7k7k_2',
      'legacy_17173_1',
      'legacy_17173_2',
      ...BASE_CHARACTER_KEYS,
      ...petKeysForIds(STARTUP_PET_IDS, { includeStages: false }),
    ],
    itemIds: [
      'pokeball_normal',
      'pokeball_great',
      'pokeball_ultra',
      'potion_small',
      'potion_medium',
    ],
  });
}

export function preloadRouteMapAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在展开大地图...',
    legacyKeys: ['legacy_world_map_full', 'legacy_route_patrol_stamp_image2'],
    imageAssets: ROUTE_MAP_HOTSPOT_IMAGE_ASSETS,
  });
}

export function preloadHomeAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在准备家园...',
    legacyKeys: [...HOME_KEYS, ...BASE_CHARACTER_KEYS],
    imageAssets: HOME_HOTSPOT_IMAGE_ASSETS,
    itemIds: HOME_ITEM_IDS,
  });
}

export function preloadFarmAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在打开家园农场...',
    legacyKeys: [...FARM_KEYS, ...BASE_CHARACTER_KEYS],
    itemIds: [
      'energy_seed',
      'exp_candy',
      'potential_seed',
      'element_fruit_fire',
      'element_fruit_water',
      'element_fruit_grass',
      'element_fruit_electric',
      'element_fruit_normal',
      'element_fruit_light',
    ],
  });
}

export function preloadBeachAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在展开海滨沙滩...',
    legacyKeys: [...BEACH_KEYS, ...BASE_CHARACTER_KEYS],
    itemIds: ['gold_shell', 'crystal_shard'],
  });
}

export function preloadMazeTrialAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在点亮迷宫路线...',
    legacyKeys: ['legacy_maze_gate_clean', ...BASE_CHARACTER_KEYS],
    itemIds: ['exp_candy', 'pokeball_great', 'crystal_shard'],
  });
}

export function preloadLibraryArchiveAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在整理图书馆档案...',
    legacyKeys: [
      'premium_library_archive_desk_image2',
      'legacy_library_clean',
      'npc_rainbow_archivist',
      ...BASE_CHARACTER_KEYS,
    ],
    itemIds: ['exp_candy', 'element_fruit_light', 'crystal_shard'],
  });
}

export function preloadShipCoreAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在点亮飞船核心...',
    legacyKeys: [
      'legacy_spaceship_clean',
      'object_ship_repair_core',
      ...BASE_CHARACTER_KEYS,
    ],
    itemIds: [
      'repair_chip',
      'pokeball_great',
      'element_fruit_electric',
      'crystal_shard',
    ],
  });
}

export function preloadShopAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在整理补给站...',
    legacyKeys: ['premium_rainbow_supply_shop_image2', 'legacy_lab_clean'],
    itemIds: allItemIds(),
  });
}

export function preloadBackpackAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在整理背包...',
    legacyKeys: ['premium_backpack_workbench_image2', 'legacy_library_clean'],
    itemIds: allItemIds(),
  });
}

export function preloadPetLibraryAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在打开精灵资料...',
    legacyKeys: [
      'premium_pet_archive_image2',
      'legacy_haidi_top',
      'legacy_world_map_full',
      ...petKeysForIds(Object.keys(PETS), { includeStages: true }),
    ],
  });
}

export function preloadActivityAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在布置活动广场...',
    legacyKeys: [
      ...ACTIVITY_KEYS,
      ...petKeysForIds(['cai_xukun', 'zeng_ming', 'zeng_yi', 'yu_mengqian', 'star_jelly'], {
        includeStages: true,
      }),
    ],
    itemIds: ['kun_chicken_token', 'zeng_ming_stage2_token', 'zeng_ming_stage3_token'],
  });
}

export function preloadCasinoAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在准备彩贝赌场...',
    legacyKeys: [
      'legacy_casino_clean',
      'npc_casino_host',
      'npc_casino_guard',
      'object_casino_chips',
    ],
  });
}

export function preloadGymAssets(scene: Phaser.Scene): void {
  const petPlan = gymPetPreloadPlanForSave(PlayerState.snapshot());
  preloadAssetSet(scene, {
    label: '正在准备精灵道馆...',
    legacyKeys: [
      'legacy_gym_badge_dojo',
      'legacy_gym_hall',
      ...BASE_CHARACTER_KEYS,
      ...petKeysForIds(petPlan.commonPetIds, { includeStages: false }),
      ...petKeysForIds(petPlan.ownedPetIds, { includeStages: true }),
    ],
  });
}

export function preloadRainbowHallAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在准备 VIP 大厅...',
    legacyKeys: [
      'legacy_rainbow_hall_vip',
      ...petKeysForIds(
        [
          'rainbow_wing',
          'xuanqing_jingwei',
          'aotian_dragon',
          'erebus_penguin',
          'ingmar_night',
          'hekapu_night',
          'leonard_gunner',
          'pester_priest',
          'oni_tyranno',
          'diudiu_maori',
        ],
        { includeStages: true, includeDolls: true },
      ),
    ],
  });
}

export function preloadQuestAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在同步任务资料...',
    legacyKeys: [
      'story_rainbow_core',
      'story_archive_lab',
      'story_crystal_cave',
      'activity_rainbow_core_relay',
      'activity_star_tide_purification',
      'activity_rainbow_academy',
      'activity_pet_hatchery',
      'activity_trial_tower',
      'premium_quest_hall_image2',
      'legacy_beach_integrated',
      'legacy_farm_walkable',
      'npc_rainbow_archivist',
      'npc_crystal_miner',
    ],
    itemIds: ['rainbow_pet_egg', 'potential_seed', 'energy_seed', 'gold_shell', 'crystal_shard'],
  });
}

export function preloadTideTrialAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在准备潮汐试炼...',
    legacyKeys: [
      'legacy_tide_playground_clean',
      'npc_tide_coach',
      'object_tide_playground',
      'object_trial_pearl',
      'object_trial_mine',
      ...petKeysForIds(['tide_otter'], { includeStages: true }),
    ],
    itemIds: ['gold_shell', 'element_fruit_water', 'exp_candy'],
  });
}

export function preloadCrystalMineAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在准备水晶矿洞巡采...',
    legacyKeys: [
      'legacy_crystal_cave_clean',
      'object_trial_mine',
      'npc_crystal_miner',
    ],
    itemIds: ['crystal_shard', 'repair_chip', 'evo_stone_light'],
  });
}

export function preloadSaveAssets(scene: Phaser.Scene): void {
  preloadAssetSet(scene, {
    label: '正在读取存档...',
    legacyKeys: ['legacy_world_map_full'],
  });
}

export function preloadLegacyLocationAssets(
  scene: Phaser.Scene,
  locationId: LegacyLocationId,
): void {
  const def = LEGACY_LOCATIONS[locationId] ?? LEGACY_LOCATIONS.center;
  const encounterZoneIds = def.hotspots
    .map((hotspot) => hotspot.action.encounterZoneId)
    .filter((zoneId): zoneId is string => Boolean(zoneId));
  const encounterPetIds = new Set<string>();
  for (const zoneId of encounterZoneIds) {
    for (const petId of LOCATION_PET_POOLS[zoneId] ?? []) encounterPetIds.add(petId);
    for (const entry of ENCOUNTERS[zoneId]?.pool ?? []) encounterPetIds.add(entry.petId);
  }

  preloadAssetSet(scene, {
    label: `正在准备${def.title}...`,
    legacyKeys: [
      def.textureKey,
      'legacy_patrol_badge_image2',
      ...BASE_CHARACTER_KEYS,
      ...storyNpcKeys(locationId),
      ...(def.npcs ?? []).map((npc) => npc.textureKey),
      ...petKeysForIds([...encounterPetIds], { includeStages: false, includeDolls: true }),
    ],
    itemIds: def.hotspots
      .flatMap((hotspot) => hotspot.action.reward?.items ?? [])
      .map((item) => item.itemId),
    spritesheets: VIRTUAL_PLAYER_AVATAR_ASSETS,
  });
}

export function preloadBattleAssets(scene: Phaser.Scene, data: BattleAssetData): void {
  const petIds = new Set<string>();
  if (data.petId) petIds.add(data.petId);
  if (data.wildPetId) petIds.add(data.wildPetId);
  const trainerPet = data.trainer?.party?.[0]?.petId;
  if (trainerPet) petIds.add(trainerPet);

  preloadAssetSet(scene, {
    label: '正在准备战斗...',
    legacyKeys: [
      'premium_battle_arena_v2_image2',
      'premium_battle_arena_image2',
      'legacy_battle_arena_image2',
      'legacy_17173_1',
      'legacy_17173_2',
      data.bossId ? `legacy_boss_${data.bossId}` : null,
      ...petKeysForIds([...petIds], { includeStages: true, includeDolls: true }),
    ].filter(isString),
    itemIds: [
      'pokeball_normal',
      'pokeball_great',
      'pokeball_ultra',
      'pokeball_master',
      'potion_small',
      'potion_medium',
      'potion_large',
    ],
  });
}

interface AssetSet {
  readonly label: string;
  readonly legacyKeys?: readonly string[];
  readonly imageAssets?: Readonly<Record<string, string>>;
  readonly itemIds?: readonly string[];
  readonly spritesheets?: readonly VirtualPlayerAvatarAsset[];
}

function preloadAssetSet(scene: Phaser.Scene, set: AssetSet): void {
  const queued = new Set<string>();

  for (const key of set.legacyKeys ?? []) {
    queueLegacyKey(scene, key, queued);
  }
  for (const [key, path] of Object.entries(set.imageAssets ?? {})) {
    queueImageAsset(scene, key, path, queued);
  }
  for (const itemId of set.itemIds ?? []) {
    queueItemKey(scene, itemId, queued);
  }
  for (const sheet of set.spritesheets ?? []) {
    queueSpritesheet(scene, sheet, queued);
  }

  if (queued.size <= 0) return;
  scene.load.maxParallelDownloads = preloadParallelDownloads();
  showPreloadOverlay(scene, set.label);
}

function queueImageAsset(
  scene: Phaser.Scene,
  key: string,
  path: string,
  queued: Set<string>,
): void {
  if (scene.textures.exists(key) || queued.has(key)) return;
  scene.load.image(key, path);
  queued.add(key);
}

function queueLegacyKey(scene: Phaser.Scene, key: string, queued: Set<string>): void {
  const path = LEGACY_HAIDI_ASSETS[key];
  if (!path) return;
  if (!scene.textures.exists(key) && !queued.has(key)) {
    scene.load.image(key, fastLegacyAssetPath(path));
    queued.add(key);
  }

  const wideKey = wideLegacyAssetKey(key);
  const widePath = wideLegacyAssetPath(key);
  if (widePath !== null && !scene.textures.exists(wideKey) && !queued.has(wideKey)) {
    scene.load.image(wideKey, widePath);
    queued.add(wideKey);
  }

  const expandedKey = expandedLegacyAssetKey(key);
  const expandedPath = expandedLegacyAssetPath(key);
  if (expandedPath === null || scene.textures.exists(expandedKey) || queued.has(expandedKey)) {
    return;
  }
  scene.load.image(expandedKey, expandedPath);
  queued.add(expandedKey);
}

function queueItemKey(scene: Phaser.Scene, itemId: string, queued: Set<string>): void {
  const key = `item_${itemId}`;
  if (!ITEMS[itemId] || scene.textures.exists(key) || queued.has(key)) return;
  scene.load.image(key, itemAssetPath(itemId));
  queued.add(key);
}

function queueSpritesheet(
  scene: Phaser.Scene,
  sheet: VirtualPlayerAvatarAsset,
  queued: Set<string>,
): void {
  if (scene.textures.exists(sheet.key) || queued.has(sheet.key)) return;
  scene.load.spritesheet(sheet.key, sheet.path, {
    frameWidth: VIRTUAL_PLAYER_AVATAR_FRAME_WIDTH,
    frameHeight: VIRTUAL_PLAYER_AVATAR_FRAME_HEIGHT,
  });
  queued.add(sheet.key);
}

function petKeysForIds(
  petIds: Iterable<string>,
  opts: { readonly includeStages: boolean; readonly includeDolls?: boolean },
): string[] {
  const keys = new Set<string>();
  for (const petId of petIds) {
    if (!petId) continue;
    if (petId === 'cai_xukun') {
      keys.add('legacy_pet_cai_xukun');
      if (opts.includeStages) {
        keys.add('legacy_pet_cai_xukun_evolved');
        keys.add('legacy_pet_cai_xukun_divine_chicken');
      }
      continue;
    }
    keys.add(`legacy_pet_${petId}`);
    if (opts.includeStages) {
      keys.add(`legacy_pet_${petId}_stage1`);
      keys.add(`legacy_pet_${petId}_stage2`);
    }
    if (opts.includeDolls) keys.add(`legacy_doll_${petId}`);
  }
  return [...keys].filter((key) => Boolean(LEGACY_HAIDI_ASSETS[key]));
}

function storyNpcKeys(locationId: LegacyLocationId): string[] {
  switch (locationId) {
    case 'center':
    case 'library':
      return ['npc_rainbow_archivist'];
    case 'energy_cave':
      return ['npc_crystal_miner'];
    case 'coral_market':
      return ['npc_coral_merchant'];
    case 'star_observatory':
      return ['npc_star_cartographer'];
    case 'storm_ruins':
      return ['npc_storm_keeper'];
    case 'tide_playground':
      return ['npc_tide_coach'];
    default:
      return [];
  }
}

function allItemIds(): string[] {
  return Object.keys(ITEMS);
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function showPreloadOverlay(scene: Phaser.Scene, label: string): void {
  const layer = scene.add.container(0, 0).setDepth(10000);
  const bg = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07335d, 0.86).setOrigin(0);
  const title = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 46, label, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#0b3768',
      strokeThickness: 4,
    })
    .setOrigin(0.5);
  const track = scene.add
    .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 4, 360, 18, 0xffffff, 0.22)
    .setStrokeStyle(2, 0xffffff, 0.55);
  const fill = scene.add.rectangle(GAME_WIDTH / 2 - 178, GAME_HEIGHT / 2 + 4, 0, 12, 0xffd93d, 1);
  fill.setOrigin(0, 0.5);
  const pct = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 38, '0%', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#fff4a8',
    })
    .setOrigin(0.5);
  layer.add([bg, title, track, fill, pct]);

  const update = (progress: number): void => {
    const clamped = Math.max(0, Math.min(1, progress));
    fill.width = 356 * clamped;
    pct.setText(`${Math.round(clamped * 100)}%`);
  };
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    scene.load.off('progress', update);
    layer.destroy(true);
  };

  scene.load.on('progress', update);
  scene.load.once('complete', cleanup);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
}
