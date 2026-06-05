import { describe, expect, it } from 'vitest';

import { BOSSES } from '@/data/bosses';
import { PETS } from '@/data/pets';
import {
  ISO_BOSS_TEXTURE_PREFIX,
  ISO_PET_TEXTURE_PREFIX,
  sizeOf,
} from '@/utils/isoPetSprite';

/**
 * FEAT-203 iso 精灵贴图 + PetVisual 字段合法性测试。
 *
 * 设计说明：
 *   - 不 mock Phaser runtime（Phaser.Game 在 node 环境下依赖 canvas/WebGL，
 *     无法在 vitest 下直接走真实渲染）；
 *   - 转而验证 14 只精灵 + 1 BOSS 的 `visual` 字段"数据层面的合法性"——
 *     silhouette / sizeClass 枚举值、bodyColor 与 portraitColor 同步、
 *     轮廓色 & 阴影透明度范围等。
 *   - 同时对 `iso-pet:` / `iso-boss:` 前缀做冒烟检查，确保导出常量稳定。
 */

const LEGAL_SILHOUETTES = new Set([
  'quadruped',
  'biped',
  'floater',
  'static',
  'blade',
]);
const LEGAL_SIZES = new Set(['small', 'medium', 'large', 'xlarge']);

describe('FEAT-203 iso 精灵 visual 字段合法性', () => {
  it('所有已有精灵的 visual.silhouette 必须在 5 值枚举内', () => {
    const ids = Object.keys(PETS);
    // 当前 pets.ts 共 13 只（5 原生 + 1 VIP + 7 友情），FEAT-207 会扩到 20 只。
    expect(ids.length).toBeGreaterThanOrEqual(13);
    for (const id of ids) {
      const pet = PETS[id];
      expect(pet, `pet ${id} 必须存在`).toBeDefined();
      if (!pet) continue;
      expect(
        LEGAL_SILHOUETTES.has(pet.visual.silhouette),
        `${id}.visual.silhouette=${pet.visual.silhouette} 不在合法集合`,
      ).toBe(true);
    }
  });

  it('所有已有精灵的 visual.bodyColor 必须与 portraitColor 保持一致（防止数据漂移）', () => {
    for (const id of Object.keys(PETS)) {
      const pet = PETS[id];
      if (!pet) continue;
      expect(
        pet.visual.bodyColor,
        `${id}.visual.bodyColor 应等于 portraitColor`,
      ).toBe(pet.portraitColor);
    }
  });

  it('所有已有精灵的 visual.sizeClass 必须在 3 值枚举内，阴影透明度在 [0,1]', () => {
    for (const id of Object.keys(PETS)) {
      const pet = PETS[id];
      if (!pet) continue;
      expect(
        LEGAL_SIZES.has(pet.visual.sizeClass),
        `${id}.visual.sizeClass=${pet.visual.sizeClass} 不在合法集合`,
      ).toBe(true);
      expect(pet.visual.shadowOpacity).toBeGreaterThanOrEqual(0);
      expect(pet.visual.shadowOpacity).toBeLessThanOrEqual(1);
      // 轮廓色应为合法 0xRRGGBB
      expect(pet.visual.outlineColor).toBeGreaterThanOrEqual(0);
      expect(pet.visual.outlineColor).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('BOSS shadow_overlord 的 visual 必须齐备，silhouette=static，sizeClass=xlarge (FEAT-311)', () => {
    const boss = BOSSES['shadow_overlord'];
    expect(boss, 'shadow_overlord 必须存在').toBeDefined();
    if (!boss) return;
    expect(boss.visual.silhouette).toBe('static');
    expect(boss.visual.sizeClass).toBe('xlarge');
    expect(boss.visual.bodyColor).toBe(boss.portraitColor);
    expect(LEGAL_SILHOUETTES.has(boss.visual.silhouette)).toBe(true);
    expect(LEGAL_SIZES.has(boss.visual.sizeClass)).toBe(true);
  });

  it('iso 纹理 key 前缀常量稳定（调用点零改动的前提）', () => {
    expect(ISO_PET_TEXTURE_PREFIX).toBe('iso-pet:');
    expect(ISO_BOSS_TEXTURE_PREFIX).toBe('iso-boss:');
  });

  it('legacyShape 必须与 data 层的旧 shape 字段一致（兼容回退路径）', () => {
    for (const id of Object.keys(PETS)) {
      const pet = PETS[id];
      if (!pet) continue;
      expect(pet.visual.legacyShape, `${id}.visual.legacyShape`).toBe(pet.shape);
    }
    const boss = BOSSES['shadow_overlord'];
    if (boss) {
      expect(boss.visual.legacyShape).toBe(boss.shape);
    }
  });

  /**
   * FEAT-311：sizeOf 纹理尺寸映射（medium=64, large=96, xlarge=128）。
   */
  it('FEAT-311 sizeOf: medium 精灵 → 64px 纹理', () => {
    // 至少存在一只 medium；从 PETS 里抓一只真实案例。
    const medium = Object.values(PETS).find((p) => p.visual.sizeClass === 'medium');
    expect(medium, '至少应有一只 medium 精灵').toBeDefined();
    if (!medium) return;
    expect(sizeOf(medium.visual)).toBe(64);
  });

  it('FEAT-311 sizeOf: large 精灵 → 96px 纹理', () => {
    const large = Object.values(PETS).find((p) => p.visual.sizeClass === 'large');
    if (large) {
      expect(sizeOf(large.visual)).toBe(96);
    }
    // 即便当前 PETS 表里没有 large，也不让测试为空：直接构造一个字面量校验函数。
    expect(
      sizeOf({
        legacyShape: 'circle',
        silhouette: 'quadruped',
        bodyColor: 0,
        accentColor: 0,
        outlineColor: 0,
        shadowOpacity: 0.3,
        sizeClass: 'large',
      }),
    ).toBe(96);
  });

  it('FEAT-311 sizeOf: xlarge（BOSS 专用）→ 128px 纹理', () => {
    const boss = BOSSES['shadow_overlord'];
    expect(boss, 'shadow_overlord 必须存在').toBeDefined();
    if (!boss) return;
    expect(boss.visual.sizeClass).toBe('xlarge');
    expect(sizeOf(boss.visual)).toBe(128);
  });
});
