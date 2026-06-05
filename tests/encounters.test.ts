import { describe, expect, it } from 'vitest';

import { ENCOUNTERS, getEncounter } from '@/data/encounters';
import { PETS } from '@/data/pets';

/**
 * FEAT-204 encounter 配置结构校验。
 *
 * 注意：FEAT-207 起，encounter pool 中的 petId 必须都能在 PETS 表中 resolve
 * （sand_crab / coral_fin / seabreeze_gull / dew_sprite 已全部注册）。
 */

describe('FEAT-204 EncounterDef 结构校验', () => {
  it('每个 pool 的 weight 都是正整数（>0）', () => {
    for (const [zoneId, def] of Object.entries(ENCOUNTERS)) {
      for (const [i, entry] of def.pool.entries()) {
        expect(
          entry.weight,
          `${zoneId}.pool[${i}].weight 必须为正数，实际 ${entry.weight}`,
        ).toBeGreaterThan(0);
        expect(
          Number.isFinite(entry.weight),
          `${zoneId}.pool[${i}].weight 必须是有限数`,
        ).toBe(true);
      }
    }
  });

  it('每个 pool 的 levelRange 必须满足 lo <= hi 且均为正整数', () => {
    for (const [zoneId, def] of Object.entries(ENCOUNTERS)) {
      for (const [i, entry] of def.pool.entries()) {
        const [lo, hi] = entry.levelRange;
        expect(
          lo,
          `${zoneId}.pool[${i}].levelRange[0]=${lo} 应 >= 1`,
        ).toBeGreaterThanOrEqual(1);
        expect(
          hi,
          `${zoneId}.pool[${i}].levelRange[1]=${hi} 应 <= 100`,
        ).toBeLessThanOrEqual(100);
        expect(
          lo,
          `${zoneId}.pool[${i}].levelRange lo(${lo}) 必须 <= hi(${hi})`,
        ).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('triggerPerStep 必须落在 (0, 1] 范围内', () => {
    for (const [zoneId, def] of Object.entries(ENCOUNTERS)) {
      expect(
        def.triggerPerStep,
        `${zoneId}.triggerPerStep=${def.triggerPerStep} 必须 > 0`,
      ).toBeGreaterThan(0);
      expect(
        def.triggerPerStep,
        `${zoneId}.triggerPerStep=${def.triggerPerStep} 必须 <= 1`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('每个 pool entry 的 petId 必须是非空字符串', () => {
    for (const [zoneId, def] of Object.entries(ENCOUNTERS)) {
      for (const [i, entry] of def.pool.entries()) {
        expect(
          typeof entry.petId,
          `${zoneId}.pool[${i}].petId 必须为 string`,
        ).toBe('string');
        expect(
          entry.petId.length,
          `${zoneId}.pool[${i}].petId 不得为空字符串`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('每个 zoneId 的 def.zoneId 必须与键名一致，mapId 必须非空', () => {
    for (const [zoneId, def] of Object.entries(ENCOUNTERS)) {
      expect(def.zoneId).toBe(zoneId);
      expect(def.mapId.length).toBeGreaterThan(0);
    }
  });

  it('两条遭遇配置必须同时存在：rainbow_city:garden 与 beach:shoreline', () => {
    expect(ENCOUNTERS['rainbow_city:garden']).toBeDefined();
    expect(ENCOUNTERS['beach:shoreline']).toBeDefined();
  });

  it('getEncounter 能正确按 zoneId 返回 / 未知 id 返回 undefined', () => {
    expect(getEncounter('rainbow_city:garden')?.mapId).toBe('rainbow_city');
    expect(getEncounter('beach:shoreline')?.mapId).toBe('beach');
    expect(getEncounter('nonexistent:zone')).toBeUndefined();
  });

  it('all encounter pool petIds resolve to PETS entries', () => {
    // FEAT-207：每个 pool entry 的 petId 必须在 PETS 表中存在，
    // 避免 BattleScene 拉起野怪时 getPet 返回 undefined 导致运行时 console.warn。
    for (const [zoneId, def] of Object.entries(ENCOUNTERS)) {
      for (const [i, entry] of def.pool.entries()) {
        expect(
          PETS[entry.petId],
          `${zoneId}.pool[${i}].petId='${entry.petId}' 必须在 PETS 表中注册`,
        ).toBeDefined();
      }
    }
  });
});
