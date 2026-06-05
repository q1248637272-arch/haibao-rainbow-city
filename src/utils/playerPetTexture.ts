import type Phaser from 'phaser';

import { getEvolutionStage } from '@/systems/EvolutionSystem';
import type { PlayerPet } from '@/types';
import { ensurePetTexture } from '@/utils/placeholder';

type PetTextureState = Pick<PlayerPet, 'petId' | 'level' | 'evolutionStage'>;
const CAI_XUKUN_EVOLUTION_LEVEL = 16;
const FIRST_EVOLUTION_LEVEL = 16;
const SECOND_EVOLUTION_LEVEL = 32;

export function ensurePlayerPetTexture(scene: Phaser.Scene, owned: PetTextureState): string {
  return ensurePetTextureForStage(scene, owned.petId, getEvolutionStage(owned), owned.level);
}

export function ensurePetTextureForStage(
  scene: Phaser.Scene,
  petId: string,
  evolutionStage: number,
  level = Number.POSITIVE_INFINITY,
): string {
  if (petId === 'cai_xukun') {
    const stageKey =
      evolutionStage >= 2 && level >= SECOND_EVOLUTION_LEVEL
        ? 'legacy_pet_cai_xukun_divine_chicken'
        : evolutionStage >= 1 && level >= CAI_XUKUN_EVOLUTION_LEVEL
          ? 'legacy_pet_cai_xukun_evolved'
          : 'legacy_pet_cai_xukun';
    if (scene.textures.exists(stageKey)) return stageKey;
  }

  for (const stageKey of textureStageCandidates(petId, evolutionStage, level)) {
    if (scene.textures.exists(stageKey)) return stageKey;
  }

  return ensurePetTexture(scene, petId);
}

function textureStageCandidates(petId: string, evolutionStage: number, level: number): string[] {
  if (evolutionStage >= 2 && level >= SECOND_EVOLUTION_LEVEL) {
    return [`legacy_pet_${petId}_stage2`, `legacy_pet_${petId}_stage1`];
  }
  if (evolutionStage >= 1 && level >= FIRST_EVOLUTION_LEVEL) {
    return [`legacy_pet_${petId}_stage1`];
  }
  return [];
}
