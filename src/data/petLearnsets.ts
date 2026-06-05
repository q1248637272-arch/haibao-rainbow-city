import { PETS } from './pets';

export interface SkillUnlock {
  readonly level: number;
  readonly skillId: string;
}

const COMMON_LEVELS = [1, 5, 10, 16, 24, 32] as const;

export const PET_LEARNSETS: Record<string, readonly SkillUnlock[]> = {
  flame_puppy: learnset([
    'ember_spark',
    'flame_burst',
    'flame_rush',
    'red_magic_card',
    'sunfire_spin',
    'courage_card',
  ]),
  aqua_turtle: learnset([
    'water_jet',
    'bubble_bomb',
    'aqua_shield',
    'blue_magic_card',
    'pearl_bubble',
    'iron_shell',
  ]),
  leaf_sprite: learnset([
    'vine_whip',
    'leaf_blade',
    'green_magic_card',
    'flower_guard',
    'dream_bloom',
    'courage_card',
  ]),
  spark_mouse: learnset([
    'thunder_shock',
    'spark_bolt',
    'magnet_flash',
    'thunder_magic_card',
    'courage_card',
    'star_dust_hit',
  ]),
  stone_calf: learnset([
    'tackle',
    'power_slam',
    'courage_card',
    'star_dust_hit',
    'rock_guard',
    'mountain_press',
  ]),
  rainbow_wing: learnset([
    'sacred_beam',
    'rainbow_arc',
    'starlight_prayer',
    'rainbow_magic_card',
    'star_dust_hit',
    'courage_card',
  ]),

  li_yanwen: learnset([
    'iron_shell',
    'wisdom_tide',
    'water_jet',
    'blue_magic_card',
    'pearl_bubble',
    'aqua_shield',
  ]),
  li_aoxiang: learnset([
    'chubby_charge',
    'happy_feast',
    'power_slam',
    'courage_card',
    'star_dust_hit',
    'tackle',
  ]),
  yu_mengqian: learnset([
    'moon_hop',
    'dream_bloom',
    'leaf_blade',
    'green_magic_card',
    'flower_guard',
    'vine_whip',
  ]),
  zeng_ming: learnset([
    'echoing_cry',
    'sky_dive',
    'feather_thunder',
    'storm_echo',
    'thunder_magic_card',
    'no_money_meal',
  ]),
  zeng_yi: learnset([
    'mountain_press',
    'rock_guard',
    'tackle',
    'star_dust_hit',
    'courage_card',
    'power_slam',
  ]),
  cai_xukun: learnset([
    'dance_kick',
    'rhythm_pose',
    'three_point_spark',
    'backboard_rebound',
    'rooster_crossover',
    'divine_chicken_call',
  ]),
  meng_lei: learnset([
    'tear_slash',
    'phantom_edge',
    'power_slam',
    'courage_card',
    'star_dust_hit',
    'tackle',
  ]),

  coral_fin: learnset([
    'water_jet',
    'bubble_bomb',
    'pearl_bubble',
    'blue_magic_card',
    'aqua_shield',
    'rainbow_arc',
  ]),
  sand_crab: learnset([
    'power_slam',
    'iron_shell',
    'tackle',
    'courage_card',
    'aqua_shield',
    'star_dust_hit',
  ]),
  seabreeze_gull: learnset([
    'thunder_shock',
    'sky_dive',
    'magnet_flash',
    'thunder_magic_card',
    'spark_bolt',
    'courage_card',
  ]),
  sunny_puppy: learnset([
    'ember_spark',
    'flame_rush',
    'flame_burst',
    'sunfire_spin',
    'red_magic_card',
    'courage_card',
  ]),
  dew_sprite: learnset([
    'leaf_blade',
    'dream_bloom',
    'flower_guard',
    'green_magic_card',
    'vine_whip',
    'starlight_prayer',
  ]),
  pearl_guard: learnset([
    'rainbow_arc',
    'aqua_shield',
    'pearl_bubble',
    'starlight_prayer',
    'blue_magic_card',
    'rainbow_magic_card',
  ]),

  fars_fire_donkey: learnset([
    'ember_spark',
    'volcano_stampede',
    'flame_rush',
    'flame_burst',
    'red_magic_card',
    'courage_card',
  ]),
  arthur_knight: learnset([
    'temple_charge',
    'flame_burst',
    'courage_card',
    'volcano_stampede',
    'red_magic_card',
    'star_dust_hit',
  ]),
  elephant_walrus: learnset([
    'water_jet',
    'aqua_shield',
    'bubble_bomb',
    'pearl_bubble',
    'blue_magic_card',
    'iron_shell',
  ]),
  xuanqing_jingwei: learnset([
    'fill_sea_prayer',
    'sky_dive',
    'flame_burst',
    'flower_guard',
    'red_magic_card',
    'starlight_prayer',
  ]),
  aotian_dragon: learnset([
    'dragon_tide',
    'water_jet',
    'pearl_bubble',
    'bubble_bomb',
    'blue_magic_card',
    'rainbow_arc',
  ]),
  erebus_penguin: learnset([
    'emperor_order',
    'ice_spear',
    'aqua_shield',
    'bubble_bomb',
    'blue_magic_card',
    'iron_shell',
  ]),
  ingmar_night: learnset([
    'ice_spear',
    'water_jet',
    'bubble_bomb',
    'dragon_tide',
    'blue_magic_card',
    'spark_bolt',
  ]),
  hekapu_night: learnset([
    'night_ice_wall',
    'aqua_shield',
    'ice_spear',
    'pearl_bubble',
    'blue_magic_card',
    'starlight_prayer',
  ]),
  leonard_gunner: learnset([
    'ice_spear',
    'water_jet',
    'spark_bolt',
    'bubble_bomb',
    'blue_magic_card',
    'magnet_flash',
  ]),
  pester_priest: learnset([
    'temple_charge',
    'flower_guard',
    'flame_burst',
    'volcano_stampede',
    'red_magic_card',
    'courage_card',
  ]),
  oni_tyranno: learnset([
    'dino_tail_slam',
    'power_slam',
    'rock_guard',
    'courage_card',
    'mountain_press',
    'star_dust_hit',
  ]),
  diudiu_maori: learnset([
    'spear_throw',
    'power_slam',
    'courage_card',
    'star_dust_hit',
    'dino_tail_slam',
    'phantom_edge',
  ]),
  cloud_ferret: learnset([
    'cloud_dash',
    'spark_bolt',
    'mist_snare',
    'thunder_magic_card',
    'storm_chain',
    'aurora_step',
  ]),
  coral_lantern: learnset([
    'mist_snare',
    'pearl_bubble',
    'coral_lamp_ray',
    'blue_magic_card',
    'star_bubble',
    'rainbow_magic_card',
  ]),
  star_jelly: learnset([
    'star_bubble',
    'rainbow_arc',
    'mist_snare',
    'starlight_prayer',
    'coral_lamp_ray',
    'rainbow_magic_card',
  ]),
  storm_ray: learnset([
    'thunder_shock',
    'cloud_dash',
    'storm_chain',
    'feather_thunder',
    'thunder_magic_card',
    'star_dust_hit',
  ]),
  crystal_golem: learnset([
    'tackle',
    'crystal_counter',
    'rock_guard',
    'mountain_press',
    'star_dust_hit',
    'courage_card',
  ]),
  aurora_deer: learnset([
    'vine_whip',
    'aurora_step',
    'dream_bloom',
    'green_magic_card',
    'star_bubble',
    'flower_guard',
  ]),
  tide_otter: learnset([
    'tide_roll',
    'pearl_guard_skill',
    'water_jet',
    'rip_current',
    'shell_breaker',
    'blue_magic_card',
  ]),
};

export function skillIdsForLevel(petId: string, level: number): string[] {
  const learnsetRows = PET_LEARNSETS[petId] ?? fallbackLearnset(petId);
  const learned = learnsetRows
    .filter((row) => level >= row.level)
    .sort((a, b) => a.level - b.level)
    .map((row) => row.skillId);
  return unique(learned.length > 0 ? learned : learnsetRows.slice(0, 1).map((row) => row.skillId));
}

export function nextSkillUnlock(petId: string, level: number): SkillUnlock | undefined {
  const learnsetRows = PET_LEARNSETS[petId] ?? fallbackLearnset(petId);
  return [...learnsetRows].sort((a, b) => a.level - b.level).find((row) => row.level > level);
}

function learnset(skillIds: readonly string[]): readonly SkillUnlock[] {
  return skillIds.map((skillId, index) => ({
    level: COMMON_LEVELS[Math.min(index, COMMON_LEVELS.length - 1)] ?? 32,
    skillId,
  }));
}

function fallbackLearnset(petId: string): readonly SkillUnlock[] {
  const pet = PETS[petId];
  return learnset(pet?.skillIds ?? ['tackle']);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
