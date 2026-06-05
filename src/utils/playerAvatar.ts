import type Phaser from 'phaser';

import { PlayerState } from '@/systems/PlayerState';
import type { PlayerGender } from '@/types';

export const FEMALE_PLAYER_SHEET_KEY = 'legacy_player_hero_sheet';
export const MALE_PLAYER_SHEET_KEY = 'legacy_player_merman_male_sheet';

export function currentPlayerGender(): PlayerGender {
  return PlayerState.getPlayerGender();
}

export function currentPlayerSheetKey(): string {
  return currentPlayerGender() === 'male' ? MALE_PLAYER_SHEET_KEY : FEMALE_PLAYER_SHEET_KEY;
}

export function currentPlayerWalkAnimKey(): string {
  return `legacy-hero-walk-${currentPlayerGender()}`;
}

export function currentPlayerButtonLabel(): string {
  return currentPlayerGender() === 'male' ? '男角' : '女角';
}

export function togglePlayerGender(): PlayerGender {
  const next: PlayerGender = currentPlayerGender() === 'male' ? 'female' : 'male';
  PlayerState.setPlayerGender(next);
  return next;
}

export function ensureCurrentPlayerWalkAnimation(scene: Phaser.Scene): string {
  const key = currentPlayerWalkAnimKey();
  if (!scene.anims.exists(key)) {
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(currentPlayerSheetKey(), { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });
  }
  return key;
}
