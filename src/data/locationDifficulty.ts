import type { LegacyLocationId } from '@/scenes/LegacyContent';

export interface LocationDifficulty {
  readonly recommended: number;
  readonly wildLevelRange: readonly [number, number];
}

export const LOCATION_DIFFICULTY: Record<LegacyLocationId, LocationDifficulty> = {
  center: { recommended: 8, wildLevelRange: [7, 9] },
  library: { recommended: 8, wildLevelRange: [7, 9] },
  lab: { recommended: 9, wildLevelRange: [8, 10] },
  magic_school: { recommended: 11, wildLevelRange: [10, 12] },
  maze: { recommended: 12, wildLevelRange: [11, 13] },
  doll_base: { recommended: 14, wildLevelRange: [13, 15] },
  spaceship: { recommended: 15, wildLevelRange: [14, 16] },
  casino: { recommended: 16, wildLevelRange: [15, 17] },
  energy_field: { recommended: 17, wildLevelRange: [16, 18] },
  energy_cave: { recommended: 19, wildLevelRange: [18, 20] },
  bath_center: { recommended: 22, wildLevelRange: [21, 24] },
  coral_market: { recommended: 19, wildLevelRange: [18, 21] },
  tide_playground: { recommended: 24, wildLevelRange: [22, 26] },
  star_observatory: { recommended: 25, wildLevelRange: [24, 28] },
  storm_ruins: { recommended: 33, wildLevelRange: [31, 36] },
};

export function difficultyForLocation(locationId: LegacyLocationId): LocationDifficulty {
  return LOCATION_DIFFICULTY[locationId];
}

export function rollLocationWildLevel(locationId: LegacyLocationId, rng = Math.random): number {
  const [lo, hi] = difficultyForLocation(locationId).wildLevelRange;
  const span = hi - lo + 1;
  return lo + Math.floor(rng() * span);
}

export function recommendedLevelLabel(locationId: LegacyLocationId): string {
  return `推荐 Lv${difficultyForLocation(locationId).recommended}`;
}
