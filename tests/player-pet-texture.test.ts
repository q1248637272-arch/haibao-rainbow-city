import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';

import { ensurePetTextureForStage } from '@/utils/playerPetTexture';

function fakeSceneWithTextures(keys: readonly string[]) {
  const textureKeys = new Set(keys);
  return {
    textures: {
      exists: (key: string) => textureKeys.has(key),
    },
  } as Phaser.Scene;
}

describe('player pet texture selection', () => {
  const scene = fakeSceneWithTextures([
    'legacy_pet_cai_xukun',
    'legacy_pet_cai_xukun_evolved',
    'legacy_pet_cai_xukun_divine_chicken',
    'legacy_pet_flame_puppy',
    'legacy_pet_flame_puppy_stage1',
    'legacy_pet_flame_puppy_stage2',
  ]);

  it('keeps low-level Cai Xukun in trainee form even if an old save has an evolution flag', () => {
    expect(ensurePetTextureForStage(scene, 'cai_xukun', 1, 6)).toBe('legacy_pet_cai_xukun');
  });

  it('uses Cai Xukun evolved form only after the evolution level is reached', () => {
    expect(ensurePetTextureForStage(scene, 'cai_xukun', 1, 16)).toBe(
      'legacy_pet_cai_xukun_evolved',
    );
  });

  it('does not evolve Cai Xukun before the player triggers evolution', () => {
    expect(ensurePetTextureForStage(scene, 'cai_xukun', 0, 32)).toBe('legacy_pet_cai_xukun');
  });

  it('uses Cai Xukun divine chicken texture for the third form', () => {
    expect(ensurePetTextureForStage(scene, 'cai_xukun', 2, 32)).toBe(
      'legacy_pet_cai_xukun_divine_chicken',
    );
  });

  it('uses generic image2 growth and final textures for evolved pets', () => {
    expect(ensurePetTextureForStage(scene, 'flame_puppy', 1, 16)).toBe(
      'legacy_pet_flame_puppy_stage1',
    );
    expect(ensurePetTextureForStage(scene, 'flame_puppy', 2, 32)).toBe(
      'legacy_pet_flame_puppy_stage2',
    );
  });

  it('keeps stale low-level generic pets on their base texture', () => {
    expect(ensurePetTextureForStage(scene, 'flame_puppy', 1, 6)).toBe(
      'legacy_pet_flame_puppy',
    );
  });

  it('falls back to the growth texture when a final texture is missing', () => {
    const partialScene = fakeSceneWithTextures([
      'legacy_pet_leaf_sprite',
      'legacy_pet_leaf_sprite_stage1',
    ]);
    expect(ensurePetTextureForStage(partialScene, 'leaf_sprite', 2, 32)).toBe(
      'legacy_pet_leaf_sprite_stage1',
    );
  });
});
