import { describe, expect, it } from 'vitest';

import { calcCaptureRate, shouldAllowCapture } from '@/systems/CaptureFormula';

/**
 * FEAT-206 · 捕捉率公式（CaptureFormula.calcCaptureRate）的纯函数覆盖。
 *
 * 对应 design.md §6.2：
 *   hpFactor = 1 - 0.8 * wildHpRatio       // 满血 0.2，残血 ~1.0
 *   lvFactor = clamp(1 + (playerLv - wildLv) / 10, 0.4, 1.6)
 *   rate     = clamp(hpFactor * lvFactor * bonusMult, 0.05, 0.95)
 */

describe('calcCaptureRate', () => {
  it('满血 + 同级 + 默认加成 → 约 0.2（hpFactor=0.2, lvFactor=1, bonus=1）', () => {
    const rate = calcCaptureRate({
      wildHpRatio: 1,
      playerLevel: 5,
      wildLevel: 5,
      bonusMult: 1,
    });
    expect(rate).toBeCloseTo(0.2, 5);
  });

  it('残血（hpRatio≈0）+ 同级 → hpFactor≈1.0 被钳到上界 0.95', () => {
    const rate = calcCaptureRate({
      wildHpRatio: 0,
      playerLevel: 5,
      wildLevel: 5,
      bonusMult: 1,
    });
    // hpFactor=1.0, lvFactor=1.0, bonus=1 → raw 1.0，被 clamp 到 0.95。
    expect(rate).toBe(0.95);
  });

  it('playerLevel 远高于 wildLevel → lvFactor 被钳到上界 1.6，再乘 hpFactor 仍被钳到 0.95', () => {
    const rate = calcCaptureRate({
      wildHpRatio: 0.5, // hpFactor = 0.6
      playerLevel: 50,
      wildLevel: 5,
      bonusMult: 1,
    });
    // lvRatio = 4.5，lvFactor 被 clamp 到 1.6；0.6 * 1.6 = 0.96 → clamp 到 0.95。
    expect(rate).toBe(0.95);
  });

  it('wildLevel 远高于 playerLevel → lvFactor 被钳到下界 0.4', () => {
    const rate = calcCaptureRate({
      wildHpRatio: 1, // hpFactor = 0.2
      playerLevel: 5,
      wildLevel: 50,
      bonusMult: 1,
    });
    // lvFactor 被 clamp 到 0.4；0.2 * 0.4 = 0.08 → 不触及下界 0.05，返回 0.08。
    expect(rate).toBeCloseTo(0.08, 5);
  });

  it('wildHpRatio > 1 被钳到 1（按满血处理）', () => {
    const rateAbove1 = calcCaptureRate({
      wildHpRatio: 1.5,
      playerLevel: 5,
      wildLevel: 5,
      bonusMult: 1,
    });
    const rateExactly1 = calcCaptureRate({
      wildHpRatio: 1,
      playerLevel: 5,
      wildLevel: 5,
      bonusMult: 1,
    });
    expect(rateAbove1).toBeCloseTo(rateExactly1, 6);
    expect(rateAbove1).toBeCloseTo(0.2, 5);
  });

  it('wildHpRatio < 0 被钳到 0（按空血处理，触发上界 0.95）', () => {
    const rate = calcCaptureRate({
      wildHpRatio: -0.25,
      playerLevel: 5,
      wildLevel: 5,
      bonusMult: 1,
    });
    expect(rate).toBe(0.95);
  });

  it('bonusMult = 0 → 最终乘积 0，被钳到下界 0.05', () => {
    const rate = calcCaptureRate({
      wildHpRatio: 0,
      playerLevel: 50,
      wildLevel: 5,
      bonusMult: 0,
    });
    expect(rate).toBe(0.05);
  });

  it('bonusMult 为负 → 视作 0，被钳到下界 0.05', () => {
    const rate = calcCaptureRate({
      wildHpRatio: 0,
      playerLevel: 5,
      wildLevel: 5,
      bonusMult: -1,
    });
    expect(rate).toBe(0.05);
  });

  it('中段：半血 + 同级 + 默认加成 → 0.6（hpFactor=0.6, lvFactor=1）', () => {
    const rate = calcCaptureRate({
      wildHpRatio: 0.5,
      playerLevel: 5,
      wildLevel: 5,
      bonusMult: 1,
    });
    expect(rate).toBeCloseTo(0.6, 5);
  });
});

describe('shouldAllowCapture', () => {
  it('玩家已拥有同 id 也允许继续捕捉，用于获得多只同种精灵', () => {
    const owned = new Set(['aqua_turtle', 'flame_puppy']);
    expect(shouldAllowCapture('aqua_turtle', (id) => owned.has(id))).toBe(true);
    expect(shouldAllowCapture('flame_puppy', (id) => owned.has(id))).toBe(true);
  });

  it('玩家未拥有 → 返回 true，走正常捕捉流程', () => {
    const owned = new Set(['aqua_turtle']);
    expect(shouldAllowCapture('sand_crab', (id) => owned.has(id))).toBe(true);
    expect(shouldAllowCapture('seabreeze_gull', (id) => owned.has(id))).toBe(true);
  });

  it('兼容旧签名但不再查询 owned lookup', () => {
    const calls: string[] = [];
    shouldAllowCapture('aqua_turtle', (id) => {
      calls.push(id);
      return false;
    });
    expect(calls).toEqual([]);
  });

  it('空 id 仍返回 false，避免误触发捕捉流程', () => {
    expect(shouldAllowCapture('', () => false)).toBe(false);
  });
});
