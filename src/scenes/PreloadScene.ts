import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { ITEMS } from '@/data/items';
import { AudioManager } from '@/systems/AudioManager';
import { preloadParallelDownloads } from '@/systems/PerformanceProfile';
import {
  VIRTUAL_PLAYER_AVATAR_ASSETS,
  VIRTUAL_PLAYER_AVATAR_FRAME_HEIGHT,
  VIRTUAL_PLAYER_AVATAR_FRAME_WIDTH,
} from '@/systems/VirtualPlayers';

const BAR_WIDTH = 360;
const BAR_HEIGHT = 24;
const BAR_FILL_COLOR = 0xff3b9a;
const BAR_BG_COLOR = 0x000000;
const FAST_LEGACY_ROOT = 'assets/legacy/fast/';
const LEGACY_ROOT = 'assets/legacy/';
export const PREMIUM_MAP_REDRAW_V2_CACHE_BUSTER = 'premium-map-redraw-v2-20260605';
export const PLAYER_AVATAR_REDRAW_V2_CACHE_BUSTER = 'player-avatar-redraw-v2-20260605';

const FAST_LEGACY_MARKERS = [
  '/haidi001/',
  '/screens/',
  '/restored/',
  '/image2-restored/maps/',
  '/image2-restored/location-maps-v1/',
  '/image2-restored/home/',
  '/image2-restored/story/',
  '/image2-restored/ui/',
  '/image2-restored/activities/',
  '/image2-restored/pets/',
  '/image2-restored/objects/',
  '/image2-restored/items/',
  '/image2-restored/characters/',
  '/pets/',
  '/dolls/',
  '/characters/',
  '/optimized/pets/',
] as const;

export function fastLegacyAssetPath(path: string): string {
  const suffixStart = path.search(/[?#]/);
  const assetPath = suffixStart >= 0 ? path.slice(0, suffixStart) : path;
  const suffix = suffixStart >= 0 ? path.slice(suffixStart) : '';
  if (
    !assetPath.startsWith(LEGACY_ROOT) ||
    assetPath.startsWith('assets/legacy/optimized/title/') ||
    assetPath.startsWith('assets/legacy/optimized/maps/') ||
    assetPath.includes('_sheet.')
  ) {
    return path;
  }

  if (!FAST_LEGACY_MARKERS.some((marker) => assetPath.includes(marker))) {
    return path;
  }

  const legacyRelativePath = assetPath
    .slice(LEGACY_ROOT.length)
    .replace(/\.(png|jpe?g|webp)$/i, '');
  return `${FAST_LEGACY_ROOT}${legacyRelativePath}_fast.webp${suffix}`;
}

function cacheBustLegacyAssetPath(
  path: string,
  cacheBuster = PREMIUM_MAP_REDRAW_V2_CACHE_BUSTER,
): string {
  return `${path}?v=${cacheBuster}`;
}

export function itemAssetPath(itemId: string): string {
  return fastLegacyAssetPath(`assets/legacy/image2-restored/items/item_${itemId}_image2.png`);
}

export const EXPANDED_LEGACY_ASSET_KEYS: ReadonlySet<string> = new Set([
  'legacy_7k7k_2',
  'legacy_world_map_full',
  'legacy_home_walkable',
  'legacy_farm_walkable',
  'legacy_beach_integrated',
  'legacy_library_clean',
  'legacy_lab_clean',
  'legacy_gym_hall',
  'legacy_maze_gate_clean',
  'legacy_doll_base_clean',
  'legacy_energy_field_clean',
  'legacy_crystal_cave_clean',
  'legacy_spaceship_clean',
  'legacy_casino_clean',
  'legacy_bath_center_clean',
  'legacy_coral_market_clean',
  'legacy_tide_playground_clean',
  'legacy_star_observatory_clean',
  'legacy_storm_ruins_clean',
  'legacy_rainbow_hall_vip',
  'legacy_battle_arena_image2',
  'premium_battle_arena_image2',
  'premium_guide_background_image2',
  'legacy_haidi_lab',
  'legacy_17173_1',
  'legacy_17173_2',
]);

export function expandedLegacyAssetKey(key: string): string {
  return `${key}_expanded`;
}

export function expandedLegacyAssetPath(key: string): string | null {
  if (!EXPANDED_LEGACY_ASSET_KEYS.has(key)) return null;
  return `assets/legacy/expanded/${expandedLegacyAssetKey(key)}.webp`;
}

export const WIDE_LEGACY_ASSET_PATHS: Readonly<Record<string, string>> = {
  legacy_7k7k_2:
    'assets/legacy/image2-restored/location-maps-v1/legacy_7k7k_2_wide_v1_image2.png',
  legacy_world_map_full: 'assets/legacy/image2-restored/route-map-v6/route-map-v6-image2.png',
  legacy_home_walkable: 'assets/legacy/redraw-wide/legacy_home_walkable_wide_v2_image2.png',
  legacy_farm_walkable: 'assets/legacy/redraw-wide/legacy_farm_walkable_wide_v2_image2.png',
  legacy_beach_integrated: 'assets/legacy/redraw-wide/legacy_beach_integrated_wide_v2_image2.png',
  legacy_gym_badge_dojo:
    'assets/legacy/redraw-wide/legacy_gym_badge_dojo_wide_v1_image2.png',
  legacy_library_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_library_clean_wide_v1_image2.png',
  legacy_lab_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_lab_clean_wide_v1_image2.png',
  legacy_gym_hall:
    'assets/legacy/image2-restored/location-maps-v1/legacy_gym_hall_wide_v1_image2.png',
  legacy_maze_gate_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_maze_gate_clean_wide_v1_image2.png',
  legacy_doll_base_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_doll_base_clean_wide_v1_image2.png',
  legacy_energy_field_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_energy_field_clean_wide_v1_image2.png',
  legacy_crystal_cave_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_crystal_cave_clean_wide_v1_image2.png',
  legacy_spaceship_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_spaceship_clean_wide_v1_image2.png',
  legacy_casino_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_casino_clean_wide_v1_image2.png',
  legacy_bath_center_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_bath_center_clean_wide_v1_image2.png',
  legacy_coral_market_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_coral_market_clean_wide_v1_image2.png',
  legacy_tide_playground_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_tide_playground_clean_wide_v1_image2.png',
  legacy_star_observatory_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_star_observatory_clean_wide_v1_image2.png',
  legacy_storm_ruins_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_storm_ruins_clean_wide_v1_image2.png',
};

export function wideLegacyAssetKey(key: string): string {
  return `${key}_wide`;
}

export function wideLegacyAssetPath(key: string): string | null {
  return WIDE_LEGACY_ASSET_PATHS[key] ?? null;
}

/**
 * 等距地景瓦片（Kenney Isometric Landscape，CC0）的 texture key → 资源路径映射。
 *
 * 路径为 `assets/iso/landscape/xxx.png`，相对于 Vite 的 public/ 目录，
 * vite build 会原样复制到 dist/assets/iso/landscape/。
 */
export const ISO_LANDSCAPE_TILES: Readonly<Record<string, string>> = {
  iso_grass: 'assets/iso/landscape/grass.png',
  iso_grass_flower: 'assets/iso/landscape/grass_flower.png',
  iso_sand: 'assets/iso/landscape/sand.png',
  iso_water: 'assets/iso/landscape/water.png',
  iso_path_dirt: 'assets/iso/landscape/path_dirt.png',
  iso_path_stone: 'assets/iso/landscape/path_stone.png',
  iso_tree_pine: 'assets/iso/landscape/tree_pine.png',
  iso_rock: 'assets/iso/landscape/rock.png',
  iso_bush: 'assets/iso/landscape/bush.png',
  iso_wall_brick: 'assets/iso/landscape/wall_brick.png',
  iso_roof_red: 'assets/iso/landscape/roof_red.png',
  iso_roof_blue: 'assets/iso/landscape/roof_blue.png',
};

/**
 * Kenney Isometric Buildings（CC0）的建筑补充素材。
 *
 * 这些纹理让地图里的家园 / 商店 / 任务亭 / VIP 宫 / 道馆从"测试瓦片"变成可辨认地点。
 */
export const ISO_BUILDING_TILES: Readonly<Record<string, string>> = {
  iso_building_gym: 'assets/iso/buildings/gym.png',
  iso_building_home: 'assets/iso/buildings/home.png',
  iso_building_shop: 'assets/iso/buildings/shop.png',
  iso_building_vip: 'assets/iso/buildings/vip_palace.png',
  iso_building_quest: 'assets/iso/buildings/quest_kiosk.png',
};

export const LEGACY_HAIDI_ASSETS: Readonly<Record<string, string>> = {
  legacy_haidi_top: 'assets/legacy/haidi001/top.jpg',
  legacy_haidi_main_top: 'assets/legacy/haidi001/main_top.jpg',
  legacy_haidi_main_left: 'assets/legacy/haidi001/main_left.jpg',
  legacy_haidi_main_right: 'assets/legacy/haidi001/main_right.jpg',
  legacy_haidi_main_but: 'assets/legacy/haidi001/main_but.jpg',
  premium_entry_image2: 'assets/legacy/optimized/title/premium_entry_image2.webp',
  legacy_entry_full: 'assets/legacy/optimized/title/legacy_entry_full_v4_fast.webp',
  legacy_world_map_full: 'assets/legacy/optimized/title/legacy_world_map_3d_fast.webp',
  legacy_home_walkable:
    'assets/legacy/image2-restored/home/legacy_home_walkable_integrated_v1_image2.png',
  legacy_home_integrated_v3:
    'assets/legacy/image2-restored/home-v3/home-integrated-v3-image2.png',
  legacy_farm_walkable: 'assets/legacy/image2-restored/home/legacy_farm_walkable_image2.webp',
  home_farm_panel: 'assets/legacy/image2-restored/home/home_farm_panel_image2.jpg',
  legacy_gym_badge_dojo:
    'assets/legacy/redraw-wide/legacy_gym_badge_dojo_wide_v1_image2.png',
  legacy_beach_integrated:
    'assets/legacy/image2-restored/maps/legacy_beach_integrated_v1_image2.png',
  legacy_gym_hall: 'assets/legacy/image2-restored/maps/legacy_gym_hall_image2.png',
  legacy_haidi_brandstory_3: 'assets/legacy/haidi001/brandstory_3.jpg',
  legacy_haidi_p4: 'assets/legacy/haidi001/p4.jpg',
  legacy_haidi_p5: 'assets/legacy/haidi001/p5.jpg',
  legacy_haidi_map: 'assets/legacy/screens/rainbow-city-4399-1.jpeg',
  legacy_haidi_library: 'assets/legacy/restored/rainbow-city-4399-2-restored.png',
  legacy_haidi_lab: 'assets/legacy/restored/rainbow-city-4399-3-restored.png',
  legacy_library_clean: cacheBustLegacyAssetPath(
    'assets/legacy/image2-restored/maps/legacy_library_clean_image2.png',
  ),
  legacy_lab_clean: cacheBustLegacyAssetPath(
    'assets/legacy/image2-restored/maps/legacy_lab_clean_image2.png',
  ),
  legacy_energy_field_clean: cacheBustLegacyAssetPath(
    'assets/legacy/image2-restored/maps/legacy_energy_field_clean_image2.png',
  ),
  legacy_maze_gate_clean: cacheBustLegacyAssetPath(
    'assets/legacy/image2-restored/maps/legacy_maze_gate_clean_image2.png',
  ),
  legacy_spaceship_clean: cacheBustLegacyAssetPath(
    'assets/legacy/image2-restored/maps/legacy_spaceship_clean_image2.png',
  ),
  legacy_doll_base_clean: cacheBustLegacyAssetPath(
    'assets/legacy/image2-restored/maps/legacy_doll_base_clean_image2.png',
  ),
  legacy_crystal_cave_clean:
    'assets/legacy/image2-restored/maps/legacy_crystal_cave_walkable_clean_image2.png',
  legacy_rainbow_hall_vip: 'assets/legacy/image2-restored/maps/legacy_rainbow_hall_vip_image2.png',
  legacy_casino_clean: cacheBustLegacyAssetPath(
    'assets/legacy/image2-restored/maps/legacy_casino_clean_image2.png',
  ),
  legacy_bath_center_clean:
    'assets/legacy/image2-restored/maps/legacy_bath_center_clean_image2.png',
  legacy_coral_market_clean:
    'assets/legacy/image2-restored/maps/legacy_coral_market_clean_image2.png',
  legacy_star_observatory_clean:
    'assets/legacy/image2-restored/maps/legacy_star_observatory_clean_image2.png',
  legacy_storm_ruins_clean:
    'assets/legacy/image2-restored/maps/legacy_storm_ruins_clean_image2.png',
  legacy_tide_playground_clean:
    'assets/legacy/image2-restored/maps/legacy_tide_playground_clean_image2.png',
  legacy_battle_arena_image2: 'assets/legacy/image2-restored/maps/legacy_battle_arena_image2.png',
  premium_battle_arena_v2_image2:
    'assets/legacy/image2-restored/ui/premium_battle_arena_v2_image2.webp',
  premium_battle_arena_image2: 'assets/legacy/image2-restored/ui/premium_battle_arena_image2.webp',
  premium_guide_background_image2:
    'assets/legacy/image2-restored/ui/premium_guide_background_image2.webp',
  premium_advisor_panel_image2:
    'assets/legacy/image2-restored/ui/premium_advisor_panel_image2.webp',
  premium_quest_hall_image2: 'assets/legacy/image2-restored/ui/premium_quest_hall_image2.webp',
  premium_rainbow_supply_shop_image2:
    'assets/legacy/image2-restored/ui/premium_rainbow_supply_shop_image2.webp',
  premium_backpack_workbench_image2:
    'assets/legacy/image2-restored/ui/premium_backpack_workbench_image2.webp',
  premium_pet_archive_image2: 'assets/legacy/image2-restored/ui/premium_pet_archive_image2.webp',
  premium_library_archive_desk_image2:
    'assets/legacy/image2-restored/ui/premium_library_archive_desk_image2.webp',
  premium_nav_button_image2: 'assets/legacy/image2-restored/ui/premium_nav_button_image2.webp',
  legacy_patrol_badge_image2: 'assets/legacy/image2-restored/ui/legacy_patrol_badge_image2.webp',
  legacy_patrol_task_panel_image2:
    'assets/legacy/image2-restored/ui/legacy_patrol_task_panel_image2.webp',
  legacy_route_patrol_stamp_image2:
    'assets/legacy/image2-restored/ui/legacy_route_patrol_stamp_image2.webp',
  legacy_player_hero: cacheBustLegacyAssetPath(
    'assets/legacy/image2-restored/characters/legacy_player_mermaid_image2.png',
    PLAYER_AVATAR_REDRAW_V2_CACHE_BUSTER,
  ),
  legacy_player_merman_male: cacheBustLegacyAssetPath(
    'assets/legacy/image2-restored/characters/legacy_player_merman_male_image2.png',
    PLAYER_AVATAR_REDRAW_V2_CACHE_BUSTER,
  ),
  legacy_player_fairy: 'assets/legacy/characters/legacy_player_fairy.png',
  legacy_player_moni: 'assets/legacy/characters/legacy_player_moni.png',
  npc_casino_host: 'assets/legacy/image2-restored/characters/npc_casino_host_image2.png',
  npc_casino_guard: 'assets/legacy/image2-restored/characters/npc_casino_guard_image2.png',
  npc_rainbow_archivist:
    'assets/legacy/image2-restored/characters/npc_rainbow_archivist_image2.png',
  npc_crystal_miner: 'assets/legacy/image2-restored/characters/npc_crystal_miner_image2.png',
  npc_coral_merchant: 'assets/legacy/image2-restored/characters/npc_coral_merchant_image2.png',
  npc_star_cartographer:
    'assets/legacy/image2-restored/characters/npc_star_cartographer_image2.png',
  npc_storm_keeper: 'assets/legacy/image2-restored/characters/npc_storm_keeper_image2.png',
  npc_tide_coach: 'assets/legacy/image2-restored/characters/npc_tide_coach_image2.png',
  story_rainbow_core: 'assets/legacy/image2-restored/story/story_rainbow_core_image2.png',
  story_archive_lab: 'assets/legacy/image2-restored/story/story_archive_lab_image2.png',
  story_crystal_cave: 'assets/legacy/image2-restored/story/story_crystal_cave_image2.png',
  legacy_7k7k_1: 'assets/legacy/screens/rainbow-city-7k7k-1.jpg',
  legacy_7k7k_2: 'assets/legacy/optimized/maps/legacy_city_center_3d_fast.webp',
  legacy_7k7k_3: 'assets/legacy/restored/rainbow-city-7k7k-3-restored.png',
  legacy_7k7k_4: 'assets/legacy/restored/rainbow-city-7k7k-4-restored.png',
  legacy_7k7k_5: 'assets/legacy/restored/rainbow-city-7k7k-5-restored.png',
  legacy_7k7k_6: 'assets/legacy/screens/rainbow-city-7k7k-6.jpg',
  legacy_7k7k_7: 'assets/legacy/restored/rainbow-city-7k7k-7-restored.png',
  legacy_17173_1: 'assets/legacy/restored/rainbow-city-17173-1-restored.png',
  legacy_17173_2: 'assets/legacy/restored/rainbow-city-17173-2-restored.png',
  legacy_pet_flame_puppy:
    'assets/legacy/image2-restored/pets/legacy_pet_flame_puppy_dog_image2.png',
  legacy_pet_flame_puppy_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_flame_puppy_stage1_image2.png',
  legacy_pet_flame_puppy_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_flame_puppy_stage2_image2.png',
  legacy_pet_aqua_turtle:
    'assets/legacy/image2-restored/pets/legacy_pet_aqua_turtle_namefit_image2.png',
  legacy_pet_aqua_turtle_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_aqua_turtle_stage1_image2.png',
  legacy_pet_aqua_turtle_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_aqua_turtle_stage2_image2.png',
  legacy_pet_leaf_sprite:
    'assets/legacy/image2-restored/pets/legacy_pet_leaf_sprite_namefit_image2.png',
  legacy_pet_leaf_sprite_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_leaf_sprite_stage1_image2.png',
  legacy_pet_leaf_sprite_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_leaf_sprite_stage2_image2.png',
  legacy_pet_spark_mouse: 'assets/legacy/image2-restored/pets/legacy_pet_spark_mouse_v2_image2.png',
  legacy_pet_spark_mouse_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_spark_mouse_stage1_image2.png',
  legacy_pet_spark_mouse_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_spark_mouse_stage2_image2.png',
  legacy_pet_stone_calf:
    'assets/legacy/image2-restored/pets/legacy_pet_stone_calf_namefit_image2.png',
  legacy_pet_stone_calf_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_stone_calf_stage1_image2.png',
  legacy_pet_stone_calf_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_stone_calf_stage2_image2.png',
  legacy_pet_rainbow_wing: 'assets/legacy/image2-restored/pets/legacy_pet_rainbow_wing_image2.png',
  legacy_pet_rainbow_wing_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_rainbow_wing_stage1_image2.png',
  legacy_pet_rainbow_wing_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_rainbow_wing_stage2_image2.png',
  legacy_pet_li_yanwen: 'assets/legacy/image2-restored/pets/legacy_pet_li_yanwen_image2.png',
  legacy_pet_li_yanwen_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_li_yanwen_stage1_image2.png',
  legacy_pet_li_yanwen_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_li_yanwen_stage2_image2.png',
  legacy_pet_li_aoxiang: 'assets/legacy/image2-restored/pets/legacy_pet_li_aoxiang_image2.png',
  legacy_pet_yu_mengqian: 'assets/legacy/image2-restored/pets/legacy_pet_yu_mengqian_image2.png',
  legacy_pet_yu_mengqian_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_yu_mengqian_stage1_image2.png',
  legacy_pet_yu_mengqian_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_yu_mengqian_stage2_image2.png',
  legacy_pet_coral_fin: 'assets/legacy/image2-restored/pets/legacy_pet_coral_fin_image2.png',
  legacy_pet_coral_fin_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_coral_fin_stage1_image2.png',
  legacy_pet_coral_fin_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_coral_fin_stage2_image2.png',
  legacy_pet_sand_crab: 'assets/legacy/image2-restored/pets/legacy_pet_sand_crab_image2.png',
  legacy_pet_sand_crab_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_sand_crab_stage1_image2.png',
  legacy_pet_sand_crab_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_sand_crab_stage2_image2.png',
  legacy_pet_seabreeze_gull:
    'assets/legacy/image2-restored/pets/legacy_pet_seabreeze_gull_image2.png',
  legacy_pet_seabreeze_gull_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_seabreeze_gull_stage1_image2.png',
  legacy_pet_seabreeze_gull_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_seabreeze_gull_stage2_image2.png',
  legacy_pet_sunny_puppy: 'assets/legacy/image2-restored/pets/legacy_pet_sunny_puppy_image2.png',
  legacy_pet_sunny_puppy_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_sunny_puppy_stage1_image2.png',
  legacy_pet_sunny_puppy_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_sunny_puppy_stage2_image2.png',
  legacy_pet_dew_sprite: 'assets/legacy/image2-restored/pets/legacy_pet_dew_sprite_image2.png',
  legacy_pet_dew_sprite_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_dew_sprite_stage1_image2.png',
  legacy_pet_dew_sprite_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_dew_sprite_stage2_image2.png',
  legacy_pet_pearl_guard: 'assets/legacy/image2-restored/pets/legacy_pet_pearl_guard_image2.png',
  legacy_pet_pearl_guard_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_pearl_guard_stage1_image2.png',
  legacy_pet_pearl_guard_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_pearl_guard_stage2_image2.png',
  legacy_pet_cai_xukun:
    'assets/legacy/image2-restored/pets/legacy_pet_cai_xukun_trainee_image2.png',
  legacy_pet_cai_xukun_evolved:
    'assets/legacy/image2-restored/pets/legacy_pet_cai_xukun_realref_image2.png',
  legacy_pet_cai_xukun_divine_chicken:
    'assets/legacy/image2-restored/pets/legacy_pet_cai_xukun_divine_chicken_image2.png',
  legacy_pet_meng_lei: 'assets/legacy/image2-restored/pets/legacy_pet_meng_lei_image2.png',
  legacy_pet_zeng_ming: 'assets/legacy/optimized/pets/legacy_pet_zeng_ming_clean.png',
  legacy_pet_zeng_ming_stage1: 'assets/legacy/optimized/pets/legacy_pet_zeng_ming_stage1_clean.png',
  legacy_pet_zeng_ming_stage2: 'assets/legacy/optimized/pets/legacy_pet_zeng_ming_stage2_clean.png',
  legacy_pet_zeng_yi: 'assets/legacy/image2-restored/pets/legacy_pet_zeng_yi_image2.png',
  legacy_pet_zeng_yi_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_zeng_yi_stage1_image2.png',
  legacy_pet_zeng_yi_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_zeng_yi_stage2_image2.png',
  legacy_pet_fars_fire_donkey:
    'assets/legacy/image2-restored/pets/legacy_pet_fars_fire_donkey_image2.png',
  legacy_pet_fars_fire_donkey_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_fars_fire_donkey_stage1_image2.png',
  legacy_pet_fars_fire_donkey_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_fars_fire_donkey_stage2_image2.png',
  legacy_pet_arthur_knight:
    'assets/legacy/image2-restored/pets/legacy_pet_arthur_knight_image2.png',
  legacy_pet_arthur_knight_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_arthur_knight_stage1_image2.png',
  legacy_pet_arthur_knight_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_arthur_knight_stage2_image2.png',
  legacy_pet_elephant_walrus:
    'assets/legacy/image2-restored/pets/legacy_pet_elephant_walrus_image2.png',
  legacy_pet_elephant_walrus_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_elephant_walrus_stage1_image2.png',
  legacy_pet_elephant_walrus_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_elephant_walrus_stage2_image2.png',
  legacy_pet_xuanqing_jingwei:
    'assets/legacy/image2-restored/pets/legacy_pet_xuanqing_jingwei_image2.png',
  legacy_pet_xuanqing_jingwei_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_xuanqing_jingwei_stage1_image2.png',
  legacy_pet_xuanqing_jingwei_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_xuanqing_jingwei_stage2_image2.png',
  legacy_pet_aotian_dragon:
    'assets/legacy/image2-restored/pets/legacy_pet_aotian_dragon_image2.png',
  legacy_pet_aotian_dragon_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_aotian_dragon_stage1_image2.png',
  legacy_pet_aotian_dragon_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_aotian_dragon_stage2_image2.png',
  legacy_pet_erebus_penguin:
    'assets/legacy/image2-restored/pets/legacy_pet_erebus_penguin_image2.png',
  legacy_pet_erebus_penguin_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_erebus_penguin_stage1_image2.png',
  legacy_pet_erebus_penguin_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_erebus_penguin_stage2_image2.png',
  legacy_pet_ingmar_night: 'assets/legacy/image2-restored/pets/legacy_pet_ingmar_night_image2.png',
  legacy_pet_ingmar_night_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_ingmar_night_stage1_image2.png',
  legacy_pet_ingmar_night_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_ingmar_night_stage2_image2.png',
  legacy_pet_hekapu_night: 'assets/legacy/image2-restored/pets/legacy_pet_hekapu_night_image2.png',
  legacy_pet_hekapu_night_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_hekapu_night_stage1_image2.png',
  legacy_pet_hekapu_night_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_hekapu_night_stage2_image2.png',
  legacy_pet_leonard_gunner:
    'assets/legacy/image2-restored/pets/legacy_pet_leonard_gunner_image2.png',
  legacy_pet_leonard_gunner_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_leonard_gunner_stage1_image2.png',
  legacy_pet_leonard_gunner_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_leonard_gunner_stage2_image2.png',
  legacy_pet_pester_priest:
    'assets/legacy/image2-restored/pets/legacy_pet_pester_priest_image2.png',
  legacy_pet_pester_priest_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_pester_priest_stage1_image2.png',
  legacy_pet_pester_priest_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_pester_priest_stage2_image2.png',
  legacy_pet_oni_tyranno: 'assets/legacy/image2-restored/pets/legacy_pet_oni_tyranno_image2.png',
  legacy_pet_oni_tyranno_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_oni_tyranno_stage1_image2.png',
  legacy_pet_oni_tyranno_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_oni_tyranno_stage2_image2.png',
  legacy_pet_diudiu_maori: 'assets/legacy/image2-restored/pets/legacy_pet_diudiu_maori_image2.png',
  legacy_pet_diudiu_maori_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_diudiu_maori_stage1_image2.png',
  legacy_pet_diudiu_maori_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_diudiu_maori_stage2_image2.png',
  legacy_pet_cloud_ferret: 'assets/legacy/image2-restored/pets/legacy_pet_cloud_ferret_image2.png',
  legacy_pet_cloud_ferret_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_cloud_ferret_stage1_image2.png',
  legacy_pet_cloud_ferret_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_cloud_ferret_stage2_image2.png',
  legacy_pet_coral_lantern:
    'assets/legacy/image2-restored/pets/legacy_pet_coral_lantern_image2.png',
  legacy_pet_coral_lantern_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_coral_lantern_stage1_image2.png',
  legacy_pet_coral_lantern_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_coral_lantern_stage2_image2.png',
  legacy_pet_star_jelly: 'assets/legacy/image2-restored/pets/legacy_pet_star_jelly_image2.png',
  legacy_pet_star_jelly_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_star_jelly_stage1_image2.png',
  legacy_pet_star_jelly_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_star_jelly_stage2_image2.png',
  legacy_pet_storm_ray: 'assets/legacy/image2-restored/pets/legacy_pet_storm_ray_image2.png',
  legacy_pet_storm_ray_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_storm_ray_stage1_image2.png',
  legacy_pet_storm_ray_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_storm_ray_stage2_image2.png',
  legacy_pet_crystal_golem:
    'assets/legacy/image2-restored/pets/legacy_pet_crystal_golem_image2.png',
  legacy_pet_crystal_golem_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_crystal_golem_stage1_image2.png',
  legacy_pet_crystal_golem_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_crystal_golem_stage2_image2.png',
  legacy_pet_aurora_deer: 'assets/legacy/image2-restored/pets/legacy_pet_aurora_deer_image2.png',
  legacy_pet_aurora_deer_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_aurora_deer_stage1_image2.png',
  legacy_pet_aurora_deer_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_aurora_deer_stage2_image2.png',
  legacy_pet_tide_otter: 'assets/legacy/image2-restored/pets/legacy_pet_tide_otter_image2.png',
  legacy_pet_tide_otter_stage1:
    'assets/legacy/image2-restored/pets/legacy_pet_tide_otter_stage1_image2.png',
  legacy_pet_tide_otter_stage2:
    'assets/legacy/image2-restored/pets/legacy_pet_tide_otter_stage2_image2.png',
  legacy_boss_shadow_overlord: 'assets/legacy/pets/legacy_boss_shadow_overlord.png',
  legacy_doll_fars_fire_donkey: 'assets/legacy/dolls/fars_fire_donkey.png',
  legacy_doll_arthur_knight: 'assets/legacy/dolls/arthur_knight.png',
  legacy_doll_elephant_walrus: 'assets/legacy/dolls/elephant_walrus.png',
  legacy_doll_xuanqing_jingwei:
    'assets/legacy/image2-restored/pets/legacy_vip_xuanqing_jingwei_image2.png',
  legacy_doll_aotian_dragon:
    'assets/legacy/image2-restored/pets/legacy_vip_aotian_dragon_image2.png',
  legacy_doll_erebus_penguin: 'assets/legacy/dolls/erebus_penguin.png',
  legacy_doll_ingmar_night: 'assets/legacy/dolls/ingmar_night.png',
  legacy_doll_hekapu_night: 'assets/legacy/dolls/hekapu_night.png',
  legacy_doll_leonard_gunner: 'assets/legacy/dolls/leonard_gunner.png',
  legacy_doll_pester_priest: 'assets/legacy/dolls/pester_priest.png',
  legacy_doll_oni_tyranno: 'assets/legacy/dolls/oni_tyranno.png',
  legacy_doll_diudiu_maori: 'assets/legacy/dolls/diudiu_maori.png',
  object_angel_chest: 'assets/legacy/image2-restored/objects/object_angel_chest_image2.png',
  object_task_books: 'assets/legacy/image2-restored/objects/object_task_books_image2.png',
  object_energy_flower: 'assets/legacy/image2-restored/objects/object_energy_flower_image2.png',
  object_trade_counter: 'assets/legacy/image2-restored/objects/object_trade_counter_image2.png',
  object_garden_plot: 'assets/legacy/image2-restored/objects/object_garden_plot_image2.png',
  object_purify_table: 'assets/legacy/image2-restored/objects/object_purify_table_image2.png',
  object_build_book: 'assets/legacy/image2-restored/objects/object_build_book_image2.png',
  object_pet_bed: 'assets/legacy/image2-restored/objects/object_pet_bed_image2.png',
  object_pet_incubator: 'assets/legacy/image2-restored/objects/object_pet_incubator_image2.png',
  object_reward_chest: 'assets/legacy/image2-restored/objects/object_reward_chest_image2.png',
  object_notice_board: 'assets/legacy/image2-restored/objects/object_notice_board_image2.png',
  object_shop_stall: 'assets/legacy/image2-restored/objects/object_shop_stall_image2.png',
  object_gym_seal: 'assets/legacy/image2-restored/objects/object_gym_seal_image2.png',
  object_ship_repair_core:
    'assets/legacy/image2-restored/objects/object_ship_repair_core_image2.png',
  object_casino_chips: 'assets/legacy/image2-restored/objects/object_casino_chips_image2.png',
  object_bath_center: 'assets/legacy/image2-restored/objects/object_bath_center_image2.png',
  object_coral_market: 'assets/legacy/image2-restored/objects/object_coral_market_image2.png',
  object_star_observatory:
    'assets/legacy/image2-restored/objects/object_star_observatory_image2.png',
  object_storm_ruins: 'assets/legacy/image2-restored/objects/object_storm_ruins_image2.png',
  object_tide_playground: 'assets/legacy/image2-restored/objects/object_tide_playground_image2.png',
  object_trial_pearl: 'assets/legacy/image2-restored/objects/object_trial_pearl_image2.png',
  object_trial_mine: 'assets/legacy/image2-restored/objects/object_trial_mine_image2.png',
  activity_basketball_practice:
    'assets/legacy/image2-restored/activities/activity_basketball_practice_image2.jpg',
  activity_chicken_beauty:
    'assets/legacy/image2-restored/activities/activity_chicken_beauty_image2.jpg',
  activity_lele_temptation:
    'assets/legacy/image2-restored/activities/activity_lele_temptation_image2.jpg',
  activity_ex_girlfriend_meal:
    'assets/legacy/image2-restored/activities/activity_ex_girlfriend_meal_image2.jpg',
  activity_rainbow_carnival:
    'assets/legacy/image2-restored/activities/activity_rainbow_carnival_image2.jpg',
  activity_crystal_rush:
    'assets/legacy/image2-restored/activities/activity_crystal_rush_image2.jpg',
  activity_star_bubble_rescue:
    'assets/legacy/image2-restored/activities/activity_star_bubble_rescue_image2.jpg',
  activity_rainbow_core_relay:
    'assets/legacy/image2-restored/activities/activity_rainbow_core_relay_v1_image2.jpg',
  activity_star_tide_purification:
    'assets/legacy/image2-restored/activities/activity_star_tide_purification_v1_image2.jpg',
  activity_rainbow_academy:
    'assets/legacy/image2-restored/activities/activity_rainbow_academy_image2.png',
  activity_pet_hatchery:
    'assets/legacy/image2-restored/activities/activity_pet_hatchery_image2.png',
  activity_trial_tower: 'assets/legacy/image2-restored/activities/activity_trial_tower_image2.png',
};

export const CORE_LEGACY_ASSET_KEYS = new Set<string>([
  'premium_entry_image2',
  'legacy_entry_full',
  'legacy_world_map_full',
  'legacy_7k7k_2',
  'legacy_17173_1',
  'legacy_17173_2',
  'premium_guide_background_image2',
  'premium_advisor_panel_image2',
  'premium_nav_button_image2',
  'legacy_player_hero',
  'legacy_player_merman_male',
  'legacy_player_fairy',
  'legacy_player_moni',
  'legacy_pet_flame_puppy',
  'legacy_pet_spark_mouse',
  'legacy_pet_sunny_puppy',
  'legacy_pet_dew_sprite',
  'legacy_pet_stone_calf',
  'legacy_pet_rainbow_wing',
  'legacy_pet_elephant_walrus',
  'legacy_pet_pester_priest',
  'legacy_pet_fars_fire_donkey',
  'legacy_pet_arthur_knight',
]);

export const CORE_ITEM_ASSET_IDS = new Set<string>([
  'pokeball_normal',
  'pokeball_great',
  'pokeball_ultra',
  'potion_small',
  'potion_medium',
  'exp_candy',
  'potential_seed',
]);

/**
 * 资源加载场景。
 *
 * 从 FEAT-201 起接管真实外部素材（Kenney CC0 等距瓦片）的预加载：
 * 1. 绘制进度条；
 * 2. 在 preload() 里把 {@link ISO_LANDSCAPE_TILES} 的 12 张 PNG 全部入队；
 * 3. loader 的 'complete' 事件触发后再切到 TitleScene；
 * 4. 兜底 1500ms delayedCall，防止某些极端边界（例如全部命中浏览器缓存而未冒出 complete 事件，
 *    或 loader 队列为空导致 complete 已在下一帧前完成）。
 */
export class PreloadScene extends Phaser.Scene {
  private switchedToTitle = false;

  public constructor() {
    super({ key: SceneKey.PRELOAD });
  }

  public preload(): void {
    this.load.maxParallelDownloads = preloadParallelDownloads();
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);

    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;

    const sky = this.add.graphics();
    sky.fillGradientStyle(0x8fe8ff, 0x8fe8ff, 0x1275bd, 0x0d4a8c, 1);
    sky.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    sky.fillStyle(0xffffff, 0.24);
    sky.fillEllipse(centerX, centerY - 70, 720, 260);
    sky.fillStyle(0xfff3a6, 0.94);
    sky.fillCircle(170, 118, 54);
    sky.fillStyle(0xffffff, 0.82);
    for (const cloud of [
      { x: 308, y: 146, w: 156, h: 42 },
      { x: 656, y: 112, w: 196, h: 48 },
      { x: 770, y: 252, w: 134, h: 34 },
    ]) {
      sky.fillEllipse(cloud.x, cloud.y, cloud.w, cloud.h);
      sky.fillEllipse(cloud.x - cloud.w * 0.26, cloud.y + 8, cloud.w * 0.52, cloud.h * 0.82);
      sky.fillEllipse(cloud.x + cloud.w * 0.24, cloud.y + 5, cloud.w * 0.46, cloud.h * 0.76);
    }
    sky.lineStyle(18, 0xffffff, 0.72);
    sky.beginPath();
    sky.arc(centerX, centerY + 34, 210, Phaser.Math.DegToRad(204), Phaser.Math.DegToRad(336));
    sky.strokePath();
    sky.lineStyle(10, 0xffd93d, 0.82);
    sky.beginPath();
    sky.arc(centerX, centerY + 34, 188, Phaser.Math.DegToRad(204), Phaser.Math.DegToRad(336));
    sky.strokePath();
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x00345d, 0.1).setOrigin(0);
    this.add
      .rectangle(centerX, centerY + 192, 468, 108, 0x062f5c, 0.42)
      .setStrokeStyle(2, 0xffffff, 0.5);

    this.add
      .text(centerX, centerY + 158, '彩虹城载入中...', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        stroke: '#0b3768',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const bgBar = this.add.graphics();
    bgBar.fillStyle(BAR_BG_COLOR, 0.38);
    bgBar.fillRoundedRect(centerX - BAR_WIDTH / 2, centerY + 194, BAR_WIDTH, BAR_HEIGHT, 12);
    bgBar.lineStyle(2, 0xffffff, 0.62);
    bgBar.strokeRoundedRect(centerX - BAR_WIDTH / 2, centerY + 194, BAR_WIDTH, BAR_HEIGHT, 12);

    const percentText = this.add
      .text(centerX, centerY + 228, '0%', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#fff4a8',
        stroke: '#0b3768',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const fillBar = this.add.graphics();
    const drawFill = (progress: number): void => {
      const clamped = Math.max(0, Math.min(1, progress));
      fillBar.clear();
      fillBar.fillStyle(BAR_FILL_COLOR, 1);
      const fillWidth = (BAR_WIDTH - 4) * clamped;
      if (fillWidth > 0) {
        fillBar.fillRoundedRect(
          centerX - BAR_WIDTH / 2 + 2,
          centerY + 196,
          fillWidth,
          BAR_HEIGHT - 4,
          10,
        );
      }
      const percent = Math.round(clamped * 100);
      percentText.setText(`${percent}%`);
      this.updateHtmlLoadingProgress(clamped);
    };
    drawFill(0);

    this.load.on('progress', (progress: number) => drawFill(progress));
    this.load.on('loaderror', (file: { key?: string; src?: string }) => {
      console.warn('[PreloadScene] resource failed, continue startup:', file.key ?? file.src);
    });
    this.load.once('complete', () => {
      drawFill(1);
      this.goToTitle();
    });
    for (const [key, path] of Object.entries(ISO_LANDSCAPE_TILES)) {
      this.load.image(key, path);
    }
    for (const [key, path] of Object.entries(ISO_BUILDING_TILES)) {
      this.load.image(key, path);
    }
    for (const [key, path] of Object.entries(LEGACY_HAIDI_ASSETS)) {
      if (!CORE_LEGACY_ASSET_KEYS.has(key)) continue;
      this.load.image(key, fastLegacyAssetPath(path));
      const widePath = wideLegacyAssetPath(key);
      if (widePath !== null) this.load.image(wideLegacyAssetKey(key), widePath);
      const expandedPath = expandedLegacyAssetPath(key);
      if (expandedPath !== null) this.load.image(expandedLegacyAssetKey(key), expandedPath);
    }
    for (const item of Object.values(ITEMS)) {
      if (!CORE_ITEM_ASSET_IDS.has(item.id)) continue;
      this.load.image(`item_${item.id}`, itemAssetPath(item.id));
    }
    this.load.spritesheet(
      'legacy_player_fairy_sheet',
      'assets/legacy/characters/legacy_player_fairy_sheet.png',
      { frameWidth: 64, frameHeight: 72 },
    );
    this.load.spritesheet(
      'legacy_player_hero_sheet',
      cacheBustLegacyAssetPath(
        'assets/legacy/image2-restored/characters/legacy_player_mermaid_image2_sheet.png',
        PLAYER_AVATAR_REDRAW_V2_CACHE_BUSTER,
      ),
      { frameWidth: 96, frameHeight: 128 },
    );
    this.load.spritesheet(
      'legacy_player_merman_male_sheet',
      cacheBustLegacyAssetPath(
        'assets/legacy/image2-restored/characters/legacy_player_merman_male_image2_sheet.png',
        PLAYER_AVATAR_REDRAW_V2_CACHE_BUSTER,
      ),
      { frameWidth: 96, frameHeight: 128 },
    );
    for (const avatar of VIRTUAL_PLAYER_AVATAR_ASSETS) {
      this.load.spritesheet(avatar.key, avatar.path, {
        frameWidth: VIRTUAL_PLAYER_AVATAR_FRAME_WIDTH,
        frameHeight: VIRTUAL_PLAYER_AVATAR_FRAME_HEIGHT,
      });
    }
  }

  public create(): void {
    AudioManager.init(this);
  }

  private goToTitle(): void {
    if (this.switchedToTitle) {
      return;
    }
    this.switchedToTitle = true;
    this.scene.start(SceneKey.TITLE);
  }

  private updateHtmlLoadingProgress(progress: number): void {
    const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    const fill = globalThis.document?.getElementById('html-loading-fill');
    const label = globalThis.document?.getElementById('html-loading-percent');
    if (fill instanceof HTMLElement) {
      fill.style.width = `${percent}%`;
    }
    if (label) {
      label.textContent = `${percent}%`;
    }
  }
}
