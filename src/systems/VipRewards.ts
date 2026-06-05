import { PETS } from '@/data/pets';
import type { PlayerPet } from '@/types';

import { createPlayerPet } from './PetInstance';
import { PlayerState, type AddPetPlacement } from './PlayerState';

export const VIP_MEMBER_PET_IDS = ['rainbow_wing', 'xuanqing_jingwei', 'aotian_dragon'] as const;

export type VipMemberPetId = (typeof VIP_MEMBER_PET_IDS)[number];

const VIP_MEMBER_PET_LEVEL = 8;

export interface VipGrantResult {
  readonly petId: VipMemberPetId;
  readonly placement: AddPetPlacement;
}

export function makeVipMemberPet(petId: VipMemberPetId): PlayerPet | null {
  const pet = PETS[petId];
  if (!pet) return null;
  const level = VIP_MEMBER_PET_LEVEL;
  return createPlayerPet(pet, level, { evolutionStage: 0 });
}

export function grantVipMemberPets(): VipGrantResult[] {
  const results: VipGrantResult[] = [];
  for (const petId of VIP_MEMBER_PET_IDS) {
    if (PlayerState.hasPet(petId)) {
      results.push({ petId, placement: 'duplicate' });
      continue;
    }
    const pp = makeVipMemberPet(petId);
    if (!pp) continue;
    results.push({ petId, placement: PlayerState.addPlayerPet(pp) });
  }
  return results;
}
