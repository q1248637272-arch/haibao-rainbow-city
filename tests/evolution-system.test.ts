import { describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import {
  CAI_XUKUN_THIRD_EVOLUTION_ITEM_ID,
  applyEvolutionBonus,
  canEvolve,
  evolvedPetName,
  evolutionLabel,
  getEvolutionStage,
  nextEvolutionLevel,
  requiredEvolutionItem,
} from '@/systems/EvolutionSystem';

describe('EvolutionSystem', () => {
  it('treats a stale low-level evolution flag as the initial stage', () => {
    const staleLowLevelPet = { level: 6, evolutionStage: 1 };
    const baseStats = { hp: 10, atk: 10, def: 10, spd: 10 };
    const cai = PETS['cai_xukun'];

    expect(cai).toBeDefined();
    expect(getEvolutionStage(staleLowLevelPet)).toBe(0);
    expect(evolutionLabel({ petId: 'cai_xukun', ...staleLowLevelPet })).toBe('背带裤练习生');
    expect(evolvedPetName(cai!, staleLowLevelPet)).toBe('背带裤练习生蔡徐坤');
    expect(nextEvolutionLevel(staleLowLevelPet)).toBe(16);
    expect(canEvolve(staleLowLevelPet)).toBe(false);
    expect(applyEvolutionBonus(baseStats, staleLowLevelPet)).toEqual(baseStats);
  });

  it('requires the Ji Ni Tai Mei token for Cai Xukun third evolution', () => {
    const adultCai = { petId: 'cai_xukun', level: 32, evolutionStage: 1 };

    expect(canEvolve(adultCai)).toBe(true);
    expect(requiredEvolutionItem(adultCai)).toBe(CAI_XUKUN_THIRD_EVOLUTION_ITEM_ID);
    expect(evolvedPetName(PETS['cai_xukun']!, { level: 32, evolutionStage: 2 })).toBe('神·蔡徐坤');
  });
});
