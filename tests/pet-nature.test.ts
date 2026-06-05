import { describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import { createPlayerPet } from '@/systems/PetInstance';
import { applyNatureToStats, formatNatureGrowth, getPetNature } from '@/systems/PetNature';

describe('PetNature', () => {
  it('平衡性格不修改成长后的属性', () => {
    const stats = { hp: 100, atk: 50, def: 40, spd: 30, spAtk: 45, spDef: 35 };
    expect(applyNatureToStats(stats, 'balanced')).toEqual(stats);
  });

  it('性格会提高一项成长并降低另一项成长', () => {
    const stats = { hp: 100, atk: 50, def: 40, spd: 30, spAtk: 45, spDef: 35 };
    expect(applyNatureToStats(stats, 'brave')).toMatchObject({
      hp: 100,
      atk: 55,
      def: 40,
      spd: 27,
    });
  });

  it('新生成的同种精灵拥有独立编号与可读性格', () => {
    const pet = PETS['flame_puppy']!;
    const first = createPlayerPet(pet, 8, { natureId: 'sturdy' });
    const second = createPlayerPet(pet, 8, { natureId: 'agile' });

    expect(first.petId).toBe(second.petId);
    expect(first.instanceId).not.toBe(second.instanceId);
    expect(getPetNature(first.natureId).name).toBe('强壮');
    expect(formatNatureGrowth(second.natureId)).toContain('速度↑');
  });
});
