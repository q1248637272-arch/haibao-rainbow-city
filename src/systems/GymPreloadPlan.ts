import { PETS } from '@/data/pets';
import type { PlayerSave } from '@/types';

const GYM_COMMON_PET_IDS = [
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
  'xuanqing_jingwei',
  'aotian_dragon',
] as const;

export interface GymPetPreloadPlan {
  readonly commonPetIds: readonly string[];
  readonly ownedPetIds: readonly string[];
}

export function gymPetPreloadPlanForSave(
  save: Pick<PlayerSave, 'playerPets' | 'petStorage'>,
): GymPetPreloadPlan {
  const commonPetIds = new Set<string>();
  const ownedPetIds = new Set<string>();

  for (const petId of GYM_COMMON_PET_IDS) {
    if (PETS[petId]) commonPetIds.add(petId);
  }

  for (const pet of [...save.playerPets, ...save.petStorage]) {
    if (PETS[pet.petId]) ownedPetIds.add(pet.petId);
  }

  return {
    commonPetIds: [...commonPetIds],
    ownedPetIds: [...ownedPetIds],
  };
}
