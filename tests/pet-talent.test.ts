import { describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import { createPlayerPet } from '@/systems/PetInstance';
import {
  applyTalentToStats,
  formatTalentGrade,
  improvePetTalent,
  normalizePetTalent,
  petTalentTotal,
} from '@/systems/PetTalent';

describe('PetTalent', () => {
  it('缺省天赋会归一化为中等资质', () => {
    const talent = normalizePetTalent(undefined);
    expect(petTalentTotal(talent)).toBe(96);
    expect(formatTalentGrade(talent)).toBe('C');
  });

  it('天赋会按等级折算为属性加成', () => {
    const stats = { hp: 100, atk: 50, def: 40, spd: 30, spAtk: 45, spDef: 35 };
    const boosted = applyTalentToStats(
      stats,
      { hp: 31, atk: 31, def: 0, spd: 0, spAtk: 15, spDef: 15 },
      30,
    );
    expect(boosted.hp).toBeGreaterThan(stats.hp);
    expect(boosted.atk).toBeGreaterThan(stats.atk);
    expect(boosted.def).toBe(stats.def);
  });

  it('新生成的精灵个体会携带可持久化天赋', () => {
    const pet = PETS['spark_mouse']!;
    const owned = createPlayerPet(pet, 12, {
      talent: { hp: 31, atk: 30, def: 29, spd: 28, spAtk: 27, spDef: 26 },
    });
    expect(owned.talent?.hp).toBe(31);
    expect(owned.currentStats.hp).toBeGreaterThan(owned.level * 3);
  });

  it('潜能训练优先提升较低天赋', () => {
    const result = improvePetTalent(
      { hp: 1, atk: 31, def: 31, spd: 31, spAtk: 31, spDef: 31 },
      () => 0,
    );
    expect(result.stat).toBe('hp');
    expect(result.talent.hp).toBeGreaterThan(1);
  });
});
