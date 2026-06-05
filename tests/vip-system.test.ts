import { describe, expect, it } from 'vitest';

import {
  applyVipRareBoost,
  computeCheckin,
  getCoinMultiplier,
  getExpMultiplier,
  rollRareWildEncounter,
  VipSystem,
} from '@/systems/VipSystem';
import type { VipSnapshot } from '@/types';

/**
 * FEAT-305 VIP 系统纯函数单测。
 *
 * 所有用例都通过注入确定性 rng / 显式 Date 避免引入运行时不确定性；
 * 不引用 PlayerState / Phaser / EventBus，保证纯逻辑失败时能第一眼定位到 VipSystem。
 */

/** 小工具：构造 VipSnapshot 便于多个用例共用。 */
function snap(lastCheckinDate: string | null, streak = 0): VipSnapshot {
  return { lastCheckinDate, checkinStreak: streak };
}

/**
 * 构造一个"每次调用返回同一个固定值"的伪 rng，便于断言 VIP 签到奖励的药品选择稳定。
 */
function rngOf(value: number): () => number {
  return () => value;
}

/** 如果 rng 被误调用会抛错，用于验证非 VIP 分支零随机。 */
function rngNever(): number {
  throw new Error('rng should not be called in this branch');
}

describe('VipSystem.computeCheckin', () => {
  it('普通玩家首签：50 金币，无物品，streak=1', () => {
    const now = new Date(Date.UTC(2025, 0, 15));
    const r = computeCheckin(snap(null, 0), false, now, rngNever);
    expect(r.canCheckin).toBe(true);
    expect(r.reward.coins).toBe(50);
    expect(r.reward.items).toEqual({});
    expect(r.next.lastCheckinDate).toBe('2025-01-15');
    expect(r.next.checkinStreak).toBe(1);
  });

  it('VIP 玩家首签：200 金币 + 1 精灵球 + 1 药品', () => {
    const now = new Date(Date.UTC(2025, 0, 15));
    // rng 固定 0 → 抽到池首项 potion_small
    const r = computeCheckin(snap(null, 0), true, now, rngOf(0));
    expect(r.canCheckin).toBe(true);
    expect(r.reward.coins).toBe(200);
    expect(r.reward.items).toEqual({ pokeball_normal: 1, potion_small: 1 });
    expect(r.next.lastCheckinDate).toBe('2025-01-15');
    expect(r.next.checkinStreak).toBe(1);
  });

  it('同日重复签到：canCheckin=false，快照值不变，无奖励', () => {
    const now = new Date(Date.UTC(2025, 0, 15));
    const prev = snap('2025-01-15', 3);
    const r = computeCheckin(prev, true, now, rngNever);
    expect(r.canCheckin).toBe(false);
    expect(r.reward).toEqual({ coins: 0, items: {} });
    expect(r.next.lastCheckinDate).toBe('2025-01-15');
    expect(r.next.checkinStreak).toBe(3);
    // 返回的 next 不应与 prev 共享引用（防护存档层改 prev 污染）
    expect(r.next).not.toBe(prev);
  });

  it('跨日连续签到：streak +1', () => {
    const yesterday = snap('2025-01-15', 4);
    const now = new Date(Date.UTC(2025, 0, 16));
    const r = computeCheckin(yesterday, true, now, rngOf(0.5));
    expect(r.canCheckin).toBe(true);
    expect(r.next.lastCheckinDate).toBe('2025-01-16');
    expect(r.next.checkinStreak).toBe(5);
  });

  it('跨日隔两天：streak 重置为 1', () => {
    const prev = snap('2025-01-15', 4);
    const now = new Date(Date.UTC(2025, 0, 17)); // 隔了 16 日没签
    const r = computeCheckin(prev, false, now, rngNever);
    expect(r.canCheckin).toBe(true);
    expect(r.next.checkinStreak).toBe(1);
    expect(r.next.lastCheckinDate).toBe('2025-01-17');
  });

  it('VIP 签到药品池稳定从白名单随机（rng 决定 index）', () => {
    const now = new Date(Date.UTC(2025, 0, 15));
    const whitelist = new Set(['potion_small', 'potion_medium', 'exp_candy']);

    // 遍历不同 rng 值，验证选中的药品始终落在白名单内
    for (const v of [0, 0.2, 0.34, 0.5, 0.67, 0.999]) {
      const r = computeCheckin(snap(null, 0), true, now, rngOf(v));
      const itemKeys = Object.keys(r.reward.items);
      expect(itemKeys).toContain('pokeball_normal');
      const picked = itemKeys.find((k) => k !== 'pokeball_normal');
      expect(picked).toBeDefined();
      expect(whitelist.has(picked ?? '')).toBe(true);
    }
  });

  it('VIP 签到药品覆盖池的 3 个 id（不同 rng 能分别选中 3 种）', () => {
    const now = new Date(Date.UTC(2025, 0, 15));
    // 三档 rng 值分别命中 index 0 / 1 / 2
    const results = [0, 0.5, 0.99].map((v) =>
      computeCheckin(snap(null, 0), true, now, rngOf(v)),
    );
    const picks = results.map((r) => {
      const keys = Object.keys(r.reward.items).filter((k) => k !== 'pokeball_normal');
      return keys[0];
    });
    expect(new Set(picks)).toEqual(new Set(['potion_small', 'potion_medium', 'exp_candy']));
  });

  it('非 VIP 签到 items 为空对象（不吞 rng 调用次数）', () => {
    const now = new Date(Date.UTC(2025, 0, 15));
    const r = computeCheckin(snap(null, 0), false, now, rngNever);
    expect(r.reward.items).toEqual({});
  });

  it('computeCheckin 不修改入参 prev', () => {
    const prev = snap('2025-01-15', 2);
    const snapshot = { ...prev };
    const now = new Date(Date.UTC(2025, 0, 16));
    computeCheckin(prev, true, now, rngOf(0));
    expect(prev).toEqual(snapshot);
  });
});

describe('VipSystem 倍率', () => {
  it('getExpMultiplier：VIP 1.5，普通 1', () => {
    expect(getExpMultiplier(true)).toBe(1.5);
    expect(getExpMultiplier(false)).toBe(1);
  });

  it('getCoinMultiplier：VIP 1.5，普通 1', () => {
    expect(getCoinMultiplier(true)).toBe(1.5);
    expect(getCoinMultiplier(false)).toBe(1);
  });
});

describe('VipSystem.rollRareWildEncounter', () => {
  it('普通玩家始终 false，不调用 rng', () => {
    expect(rollRareWildEncounter(false, rngNever)).toBe(false);
  });

  it('VIP + rng<0.1 命中稀有；rng>=0.1 不命中', () => {
    expect(rollRareWildEncounter(true, rngOf(0.0))).toBe(true);
    expect(rollRareWildEncounter(true, rngOf(0.0999))).toBe(true);
    // 边界 0.1 严格大于等于 → false
    expect(rollRareWildEncounter(true, rngOf(0.1))).toBe(false);
    expect(rollRareWildEncounter(true, rngOf(0.5))).toBe(false);
    expect(rollRareWildEncounter(true, rngOf(0.99))).toBe(false);
  });
});

describe('VipSystem.applyVipRareBoost', () => {
  it('VIP 命中：level +3，返回新对象，不改入参', () => {
    const roll = { petId: 'flame_puppy', level: 5 };
    const next = applyVipRareBoost(roll, true, rngOf(0.05));
    expect(next.petId).toBe('flame_puppy');
    expect(next.level).toBe(8);
    expect(next).not.toBe(roll);
    // 入参保持
    expect(roll.level).toBe(5);
  });

  it('VIP 未命中：返回 level 不变的新对象', () => {
    const roll = { petId: 'flame_puppy', level: 7 };
    const next = applyVipRareBoost(roll, true, rngOf(0.9));
    expect(next.level).toBe(7);
    expect(next).not.toBe(roll);
  });

  it('普通玩家：始终不触发稀有，rng 不被调用', () => {
    const roll = { petId: 'flame_puppy', level: 7 };
    const next = applyVipRareBoost(roll, false, rngNever);
    expect(next.level).toBe(7);
    expect(next.petId).toBe('flame_puppy');
  });
});

describe('VipSystem 聚合导出', () => {
  it('VipSystem.* 与具名导出指向同一实现', () => {
    expect(VipSystem.computeCheckin).toBe(computeCheckin);
    expect(VipSystem.getExpMultiplier).toBe(getExpMultiplier);
    expect(VipSystem.getCoinMultiplier).toBe(getCoinMultiplier);
    expect(VipSystem.rollRareWildEncounter).toBe(rollRareWildEncounter);
    expect(VipSystem.applyVipRareBoost).toBe(applyVipRareBoost);
  });
});
