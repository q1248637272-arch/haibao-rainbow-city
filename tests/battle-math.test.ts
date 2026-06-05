import { describe, expect, it } from 'vitest';

import { ELEMENT_LABEL_CN, ELEMENT_MATCHUP } from '@/data/elements';
import { BOSSES } from '@/data/bosses';
import { PETS } from '@/data/pets';
import { SKILLS } from '@/data/skills';
import { ELEMENTS } from '@/types';

describe('属性克制矩阵', () => {
  it('对每一种元素都有一行，且每行覆盖所有元素', () => {
    for (const attacker of ELEMENTS) {
      const row = ELEMENT_MATCHUP[attacker];
      expect(row).toBeDefined();
      for (const defender of ELEMENTS) {
        expect(typeof row[defender]).toBe('number');
      }
    }
  });

  it('关键克制关系应符合设计：水↔火、火↔草、草↔水、电→水、火→电', () => {
    expect(ELEMENT_MATCHUP.water.fire).toBe(2.0);
    expect(ELEMENT_MATCHUP.fire.water).toBe(0.5);
    expect(ELEMENT_MATCHUP.fire.grass).toBe(2.0);
    expect(ELEMENT_MATCHUP.grass.fire).toBe(0.5);
    expect(ELEMENT_MATCHUP.grass.water).toBe(2.0);
    expect(ELEMENT_MATCHUP.water.grass).toBe(0.5);
    expect(ELEMENT_MATCHUP.electric.water).toBe(2.0);
    expect(ELEMENT_MATCHUP.fire.electric).toBe(0.5);
  });

  it('未明确定义的组合默认 1.0（自反性 / normal / light）', () => {
    expect(ELEMENT_MATCHUP.fire.fire).toBe(1.0);
    expect(ELEMENT_MATCHUP.normal.fire).toBe(1.0);
    expect(ELEMENT_MATCHUP.light.water).toBe(1.0);
    expect(ELEMENT_MATCHUP.water.electric).toBe(1.0);
  });
});

describe('数据表完整性', () => {
  it('SKILLS 至少 14 条且每条 id/name 非空，accuracy 在 [0,1]', () => {
    const ids = Object.keys(SKILLS);
    expect(ids.length).toBeGreaterThanOrEqual(14);
    for (const id of ids) {
      const s = SKILLS[id];
      expect(s).toBeDefined();
      if (!s) continue;
      expect(s.id).toBe(id);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.accuracy).toBeGreaterThanOrEqual(0);
      expect(s.accuracy).toBeLessThanOrEqual(1);
      expect(s.power).toBeGreaterThanOrEqual(0);
    }
  });

  it('PETS 至少包含 6 只原生精灵 + 7 只特殊友情精灵，并包含旧版会员 VIP 精灵', () => {
    const ids = Object.keys(PETS);
    // 6 原生 + 7 友情 = 13。后续 feature 可再扩，这里用 >= 做下限断言。
    expect(ids.length).toBeGreaterThanOrEqual(13);
    const vipPets = ids.filter((id) => {
      const p = PETS[id];
      return p?.vipOnly === true;
    });
    expect(vipPets).toEqual(['rainbow_wing', 'xuanqing_jingwei', 'aotian_dragon']);
    const vip = PETS['rainbow_wing'];
    expect(vip).toBeDefined();
    if (!vip) return;
    expect(vip.element).toBe('light');
    const sum = vip.baseStats.hp + vip.baseStats.atk + vip.baseStats.def + vip.baseStats.spd;
    // VIP 精灵数值应明显高于普通档（总和 ≥ 260）
    expect(sum).toBeGreaterThanOrEqual(260);
  });

  it('每只精灵的技能 id 都存在于 SKILLS 表', () => {
    for (const id of Object.keys(PETS)) {
      const p = PETS[id];
      if (!p) continue;
      expect(p.skillIds.length).toBeGreaterThanOrEqual(2);
      expect(p.skillIds.length).toBeLessThanOrEqual(4);
      for (const sid of p.skillIds) {
        expect(SKILLS[sid]).toBeDefined();
      }
    }
  });

  it('BOSSES 至少包含主 BOSS shadow_overlord 且奖励符合设计', () => {
    const boss = BOSSES['shadow_overlord'];
    expect(boss).toBeDefined();
    if (!boss) return;
    expect(boss.name).toBe('暗影霸主');
    expect(boss.rewardCoins).toBe(500);
    expect(boss.stats.hp).toBeGreaterThanOrEqual(150);
    for (const sid of boss.skillIds) {
      expect(SKILLS[sid]).toBeDefined();
    }
  });

  it('ELEMENT_LABEL_CN 覆盖所有元素', () => {
    for (const e of ELEMENTS) {
      expect(ELEMENT_LABEL_CN[e]).toBeDefined();
      expect(ELEMENT_LABEL_CN[e].length).toBeGreaterThan(0);
    }
  });

  it('特殊友情精灵全部存在、形态正确、技能合法', () => {
    const expected: ReadonlyArray<{ id: string; name: string; shape: string }> = [
      { id: 'li_yanwen', name: '李衍文', shape: 'turtle' },
      { id: 'li_aoxiang', name: '李奥祥', shape: 'pig' },
      { id: 'yu_mengqian', name: '俞梦倩', shape: 'rabbit' },
      { id: 'zeng_ming', name: '曾鸣', shape: 'bird' },
      { id: 'zeng_yi', name: '曾屹', shape: 'mountain' },
      { id: 'cai_xukun', name: '蔡徐坤', shape: 'chicken' },
      { id: 'meng_lei', name: '梦泪', shape: 'blade' },
    ];
    for (const spec of expected) {
      const pet = PETS[spec.id];
      expect(pet).toBeDefined();
      if (!pet) continue;
      expect(pet.name).toBe(spec.name);
      expect(pet.shape).toBe(spec.shape);
      expect(pet.vipOnly).toBe(false);
      expect(pet.skillIds.length).toBeGreaterThanOrEqual(2);
      for (const sid of pet.skillIds) {
        expect(SKILLS[sid]).toBeDefined();
      }
      const sum = pet.baseStats.hp + pet.baseStats.atk + pet.baseStats.def + pet.baseStats.spd;
      // 数值总和 230~250 之间，略强于原生普通精灵但不压过 VIP。
      expect(sum).toBeGreaterThanOrEqual(230);
      expect(sum).toBeLessThanOrEqual(250);
    }
  });
});
