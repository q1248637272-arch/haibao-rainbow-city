import { describe, expect, it } from 'vitest';

import { computeStats, expOnDefeat, expToNext } from '@/systems/LevelCurve';
import type { PetStats } from '@/types';

const BASE: PetStats = { hp: 60, atk: 55, def: 40, spd: 60 }; // 对齐 flame_puppy
const BASE_ADVANCED = {
  spAtk: 52,
  spDef: 38,
  crit: 0.07,
  accuracy: 1,
  evasion: 60 / 1800,
} as const;

describe('expToNext', () => {
  it('Lv1 → Lv2 需要 20 点经验', () => {
    expect(expToNext(1)).toBe(20);
  });

  it('Lv2 → Lv3 需要 28 点经验（+8 递增）', () => {
    expect(expToNext(2)).toBe(28);
  });

  it('Lv10 → Lv11 需要 92 点经验', () => {
    expect(expToNext(10)).toBe(92);
  });

  it('边界钳制：level < 1 视为 1，level > 100 视为 100（避免 NaN / 过大）', () => {
    expect(expToNext(0)).toBe(expToNext(1));
    expect(expToNext(-5)).toBe(expToNext(1));
    expect(expToNext(1000)).toBe(expToNext(100));
  });
});

describe('computeStats', () => {
  it('Lv1 时会保留基础四维并派生高级战斗属性', () => {
    expect(computeStats(BASE, 1)).toEqual({
      ...BASE,
      ...BASE_ADVANCED,
    });
  });

  it('Lv10 时基础四维和高级战斗属性都会成长', () => {
    const s = computeStats(BASE, 10);
    expect(s).toEqual({
      hp: BASE.hp + 9 * 3,
      atk: BASE.atk + 9,
      def: BASE.def + 9,
      spd: BASE.spd + 9,
      spAtk: BASE_ADVANCED.spAtk + Math.floor(9 * 1.15),
      spDef: BASE_ADVANCED.spDef + Math.floor(9 * 1.05),
      crit: BASE_ADVANCED.crit + 9 * 0.001,
      accuracy: BASE_ADVANCED.accuracy + 9 * 0.0005,
      evasion: BASE_ADVANCED.evasion + 9 * 0.0008,
    });
  });

  it('不修改传入的 base（必须返回新对象）', () => {
    const base: PetStats = { hp: 10, atk: 10, def: 10, spd: 10 };
    const frozenSnapshot = { ...base };
    const out = computeStats(base, 20);
    expect(base).toEqual(frozenSnapshot);
    expect(out).not.toBe(base);
  });
});

describe('expOnDefeat', () => {
  it('BOSS 和普通野怪基础收益随敌方等级成长', () => {
    const boss = expOnDefeat({ wildLevel: 5, playerLevel: 5, isBoss: true });
    const wild = expOnDefeat({ wildLevel: 5, playerLevel: 5, isBoss: false });
    expect(boss).toBe(150);
    expect(wild).toBe(38);
  });

  it('玩家等级过高时 ratio 被下限 0.35 钳制，避免无收益', () => {
    const v = expOnDefeat({ wildLevel: 1, playerLevel: 100, isBoss: false });
    expect(v).toBe(11);
  });

  it('玩家等级过低时 ratio 被上限 1.85 钳制，避免刷级过快', () => {
    const v = expOnDefeat({ wildLevel: 100, playerLevel: 1, isBoss: true });
    expect(v).toBe(352);
  });

  it('playerLevel=0 时使用兜底除数 1，不会产生 NaN / Infinity', () => {
    const v = expOnDefeat({ wildLevel: 5, playerLevel: 0, isBoss: false });
    expect(Number.isFinite(v)).toBe(true);
  });
});
