import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GYM_BADGE_CALIBRATION_MINIGAME_ID,
  GYM_BADGE_CALIBRATION_SEQUENCE,
  GYM_BADGE_CALIBRATION_SOURCE,
  GYM_BADGE_CALIBRATION_TARGET_SCORE,
  gymBadgeCalibrationRewardForScore,
  isGymBadgeCalibrationSuccess,
  scoreGymBadgeCalibration,
} from '@/systems/GymBadgeCalibration';

describe('gym badge calibration', () => {
  it('keeps the minigame identity and source stable for quests', () => {
    expect(GYM_BADGE_CALIBRATION_MINIGAME_ID).toBe('gym_badge_calibration');
    expect(GYM_BADGE_CALIBRATION_SOURCE).toBe('gym:badge_calibration');
    expect(GYM_BADGE_CALIBRATION_SEQUENCE).toEqual(['water', 'fire', 'grass', 'water', 'grass']);
  });

  it('scores the badge calibration loop and rewards stronger runs', () => {
    const score = scoreGymBadgeCalibration(4, 2);
    expect(score).toBe(10);
    expect(isGymBadgeCalibrationSuccess(4, 2)).toBe(false);
    expect(isGymBadgeCalibrationSuccess(5, 2)).toBe(true);

    expect(gymBadgeCalibrationRewardForScore(GYM_BADGE_CALIBRATION_TARGET_SCORE)).toMatchObject(
      { exp: 436, coins: 110, potentialSeeds: 0 },
    );
    expect(
      gymBadgeCalibrationRewardForScore(GYM_BADGE_CALIBRATION_TARGET_SCORE + 2),
    ).toMatchObject({ potentialSeeds: 1 });
  });

  it('registers the new gym hall art asset for preload and runtime use', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    const assetPath = 'assets/legacy/redraw-wide/legacy_gym_badge_dojo_wide_v1_image2.png';
    expect(preloadSource).toContain(`legacy_gym_badge_dojo:\n    '${assetPath}'`);
    expect(existsSync(path.resolve('public', assetPath))).toBe(true);
    expect(
      existsSync(
        path.resolve(
          'public/assets/legacy/fast/image2-restored/maps/legacy_gym_badge_dojo_wide_v1_image2_fast.webp',
        ),
      ),
    ).toBe(true);
  });
});
