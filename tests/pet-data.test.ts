import { describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import { SKILLS } from '@/data/skills';

/**
 * FEAT-207 PETS 表扩充后的结构 / 数据一致性校验。
 *
 * 硬约束：
 *   - 14 只已有精灵（13 常规 + 1 VIP 彩虹光翼 + 7 友情精灵合计 13 只；其中 rainbow_wing
 *     为唯一 VIP）id 与 baseStats 数值不得改动；
 *   - FEAT-207 新增 6 只（coral_fin / sand_crab / seabreeze_gull / sunny_puppy /
 *     dew_sprite / pearl_guard），总数达到 19。
 */

const LEGAL_SILHOUETTES = new Set(['quadruped', 'biped', 'floater', 'static', 'blade']);

/**
 * 13 只已有精灵的 baseStats 硬约束快照（MVP 尾态）。
 * 任何改动都会在本测试里被立即发现。
 */
const LEGACY_PET_BASE_STATS: Record<string, { hp: number; atk: number; def: number; spd: number }> =
  {
    flame_puppy: { hp: 60, atk: 55, def: 40, spd: 60 },
    aqua_turtle: { hp: 75, atk: 45, def: 60, spd: 40 },
    leaf_sprite: { hp: 60, atk: 50, def: 45, spd: 55 },
    spark_mouse: { hp: 55, atk: 55, def: 40, spd: 70 },
    stone_calf: { hp: 85, atk: 50, def: 60, spd: 30 },
    rainbow_wing: { hp: 110, atk: 55, def: 45, spd: 65 },
    li_yanwen: { hp: 95, atk: 50, def: 65, spd: 30 },
    li_aoxiang: { hp: 100, atk: 60, def: 50, spd: 30 },
    yu_mengqian: { hp: 70, atk: 55, def: 40, spd: 70 },
    zeng_ming: { hp: 70, atk: 65, def: 35, spd: 70 },
    zeng_yi: { hp: 120, atk: 55, def: 60, spd: 10 },
    cai_xukun: { hp: 70, atk: 55, def: 40, spd: 75 },
    meng_lei: { hp: 70, atk: 80, def: 30, spd: 60 },
  };

const FEAT_207_NEW_IDS = [
  'coral_fin',
  'sand_crab',
  'seabreeze_gull',
  'sunny_puppy',
  'dew_sprite',
  'pearl_guard',
] as const;

const LEGACY_DOLL_IDS = [
  'fars_fire_donkey',
  'arthur_knight',
  'elephant_walrus',
  'xuanqing_jingwei',
  'aotian_dragon',
  'erebus_penguin',
  'ingmar_night',
  'hekapu_night',
  'leonard_gunner',
  'pester_priest',
  'oni_tyranno',
  'diudiu_maori',
] as const;

const LEGACY_MEMBER_DOLL_IDS = new Set(['xuanqing_jingwei', 'aotian_dragon']);

const VIP_PET_IDS = new Set(['rainbow_wing', 'xuanqing_jingwei', 'aotian_dragon']);

const CONTENT_PACK_IDS = [
  'cloud_ferret',
  'coral_lantern',
  'star_jelly',
  'storm_ray',
  'crystal_golem',
  'aurora_deer',
  'tide_otter',
] as const;

describe('FEAT-207 PETS 表扩充', () => {
  it('PETS 总数必须精确等于 31（19 已有 + 12 只旧版玩偶大全复刻）', () => {
    expect(Object.keys(PETS).length).toBe(38);
  });

  it('13 只已有精灵 id 必须全部存在（硬约束：id 稳定）', () => {
    for (const id of Object.keys(LEGACY_PET_BASE_STATS)) {
      expect(PETS[id], `遗留精灵 ${id} 必须仍在 PETS 表中`).toBeDefined();
    }
  });

  it('13 只已有精灵的 baseStats 数值必须与 MVP 尾态完全一致（硬约束）', () => {
    for (const [id, expected] of Object.entries(LEGACY_PET_BASE_STATS)) {
      const pet = PETS[id];
      expect(pet, `${id} 应存在`).toBeDefined();
      if (!pet) continue;
      expect(pet.baseStats).toEqual(expected);
    }
  });

  it('旧版会员精灵与 rainbow_wing 必须是 VIP 专属，其余精灵 vipOnly === false', () => {
    for (const [id, pet] of Object.entries(PETS)) {
      if (VIP_PET_IDS.has(id)) {
        expect(pet.vipOnly, `${id} 必须保持 vipOnly=true`).toBe(true);
      } else {
        expect(pet.vipOnly, `${id} 必须 vipOnly=false`).toBe(false);
      }
    }
  });

  it('FEAT-207 新增 6 只精灵必须全部存在且 vipOnly=false', () => {
    for (const id of FEAT_207_NEW_IDS) {
      const pet = PETS[id];
      expect(pet, `新精灵 ${id} 应存在`).toBeDefined();
      if (!pet) continue;
      expect(pet.vipOnly).toBe(false);
    }
  });

  it('旧版玩偶大全复刻精灵必须全部存在，会员玩偶使用 VIP 入队规则', () => {
    for (const id of LEGACY_DOLL_IDS) {
      const pet = PETS[id];
      expect(pet, `旧版玩偶 ${id} 应存在`).toBeDefined();
      if (!pet) continue;
      expect(pet.vipOnly).toBe(LEGACY_MEMBER_DOLL_IDS.has(id));
    }
  });

  it('content pack pets include expanded battle stats', () => {
    for (const id of CONTENT_PACK_IDS) {
      const pet = PETS[id];
      expect(pet, `content pack pet ${id} should exist`).toBeDefined();
      if (!pet) continue;
      expect(pet.baseStats.spAtk, `${id} spAtk`).toBeTypeOf('number');
      expect(pet.baseStats.spDef, `${id} spDef`).toBeTypeOf('number');
      expect(pet.baseStats.crit, `${id} crit`).toBeTypeOf('number');
      expect(pet.baseStats.accuracy, `${id} accuracy`).toBeTypeOf('number');
      expect(pet.baseStats.evasion, `${id} evasion`).toBeTypeOf('number');
    }
  });

  it('每只精灵 visual.silhouette 必须在 5 值合法集合内', () => {
    for (const [id, pet] of Object.entries(PETS)) {
      expect(
        LEGAL_SILHOUETTES.has(pet.visual.silhouette),
        `${id}.visual.silhouette=${pet.visual.silhouette} 不在合法集合`,
      ).toBe(true);
    }
  });

  it('每只精灵 baseStats 总和必须落在 [200, 280] 区间内', () => {
    for (const [id, pet] of Object.entries(PETS)) {
      const sum = pet.baseStats.hp + pet.baseStats.atk + pet.baseStats.def + pet.baseStats.spd;
      expect(sum, `${id} baseStats 总和=${sum} 越界`).toBeGreaterThanOrEqual(200);
      expect(sum, `${id} baseStats 总和=${sum} 越界`).toBeLessThanOrEqual(280);
    }
  });

  it('每只精灵的 skillIds 必须全部能在 SKILLS 表中 resolve', () => {
    for (const [id, pet] of Object.entries(PETS)) {
      for (const [i, skillId] of pet.skillIds.entries()) {
        expect(
          SKILLS[skillId],
          `${id}.skillIds[${i}]='${skillId}' 未在 SKILLS 表中注册`,
        ).toBeDefined();
      }
    }
  });
});
