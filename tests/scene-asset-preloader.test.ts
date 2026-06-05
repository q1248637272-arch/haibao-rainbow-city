import { describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import { gymPetPreloadPlanForSave } from '@/systems/GymPreloadPlan';
import type { PlayerPet, PlayerSave } from '@/types';

type GymSave = Pick<PlayerSave, 'playerPets' | 'petStorage'>;

function pet(petId: string, evolutionStage = 0): PlayerPet {
  return {
    petId,
    level: evolutionStage >= 2 ? 40 : 8,
    exp: 0,
    learnedSkillIds: [],
    evolutionStage,
    currentStats: { hp: 10, atk: 10, def: 10, spd: 10 },
    currentHp: 10,
  };
}

describe('gym asset preload selection', () => {
  it('keeps the gym preload focused instead of loading every pet in the game', () => {
    const plan = gymPetPreloadPlanForSave({ playerPets: [], petStorage: [] });

    expect(plan.commonPetIds).toContain('flame_puppy');
    expect(plan.commonPetIds).toContain('rainbow_wing');
    expect(plan.commonPetIds).toContain('xuanqing_jingwei');
    expect(plan.commonPetIds).toContain('aotian_dragon');
    expect(plan.commonPetIds).not.toContain('coral_lantern');
    expect(plan.commonPetIds.length).toBeLessThan(Object.keys(PETS).length);
  });

  it('adds owned pets separately so the scene preloader can request their stage artwork', () => {
    const save: GymSave = {
      playerPets: [pet('storm_ray', 2)],
      petStorage: [pet('crystal_golem', 1)],
    };

    const plan = gymPetPreloadPlanForSave(save);

    expect(plan.ownedPetIds).toContain('storm_ray');
    expect(plan.ownedPetIds).toContain('crystal_golem');
    expect(plan.commonPetIds).toContain('flame_puppy');
  });
});
