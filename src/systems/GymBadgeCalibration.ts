export const GYM_BADGE_CALIBRATION_MINIGAME_ID = 'gym_badge_calibration';
export const GYM_BADGE_CALIBRATION_SOURCE = 'gym:badge_calibration';
export const GYM_BADGE_CALIBRATION_DAILY_CLAIM_ID = 'badge_calibration';
export const GYM_BADGE_CALIBRATION_TARGET_SCORE = 12;

export type GymBadgePadId = 'water' | 'grass' | 'fire';

export const GYM_BADGE_CALIBRATION_SEQUENCE: readonly GymBadgePadId[] = [
  'water',
  'fire',
  'grass',
  'water',
  'grass',
];

export interface GymBadgeCalibrationReward {
  readonly exp: number;
  readonly coins: number;
  readonly potentialSeeds: number;
}

export function scoreGymBadgeCalibration(correctHits: number, remainingFocus: number): number {
  const safeHits = clampNonNegativeInteger(correctHits);
  const safeFocus = clampNonNegativeInteger(remainingFocus);
  return safeHits * 2 + safeFocus;
}

export function isGymBadgeCalibrationSuccess(
  correctHits: number,
  remainingFocus: number,
): boolean {
  return scoreGymBadgeCalibration(correctHits, remainingFocus) >= GYM_BADGE_CALIBRATION_TARGET_SCORE;
}

export function gymBadgeCalibrationRewardForScore(score: number): GymBadgeCalibrationReward {
  const safeScore = clampNonNegativeInteger(score);
  return {
    exp: 220 + safeScore * 18,
    coins: 50 + safeScore * 5,
    potentialSeeds: safeScore >= GYM_BADGE_CALIBRATION_TARGET_SCORE + 2 ? 1 : 0,
  };
}

function clampNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
