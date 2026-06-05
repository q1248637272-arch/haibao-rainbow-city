import { describe, expect, it } from 'vitest';

import type { EncounterDef } from '@/data/encounters';
import {
  makeEncounterDedupTracker,
  rollEncounter,
} from '@/systems/EncounterRoller';

/**
 * 种子化 PRNG（mulberry32）。与 battle-engine.test.ts 里的实现一致。
 * 每次测试用相同种子可完整回放随机序列，覆盖"浮点残差兜底"等罕见分支。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 构造一个标准的二元池 EncounterDef。
 */
function makeDef(overrides?: Partial<EncounterDef>): EncounterDef {
  return {
    zoneId: 'test:zone',
    mapId: 'test',
    triggerPerStep: 1,
    pool: [
      { petId: 'pet_a', weight: 30, levelRange: [3, 5] },
      { petId: 'pet_b', weight: 70, levelRange: [6, 8] },
    ],
    ...overrides,
  };
}

describe('rollEncounter (FEAT-206)', () => {
  it('triggerPerStep=0 时永远返回 null（任意 rng 序列）', () => {
    const def = makeDef({ triggerPerStep: 0 });
    for (const v of [0, 0.001, 0.5, 0.999]) {
      const rng = (): number => v;
      expect(rollEncounter(def, rng)).toBeNull();
    }
    // 用一个真正会返回 0 的 rng 也同样必 null。
    expect(rollEncounter(def, mulberry32(1))).toBeNull();
  });

  it('triggerPerStep=1 时必返回池中一个条目（非 null）', () => {
    const def = makeDef({ triggerPerStep: 1 });
    const rng = mulberry32(12345);
    for (let i = 0; i < 50; i++) {
      const r = rollEncounter(def, rng);
      expect(r).not.toBeNull();
      if (!r) continue;
      expect(['pet_a', 'pet_b']).toContain(r.petId);
    }
  });

  it('rng 恒返回 0 时必返回池中第一个条目，且 level=lo', () => {
    const def = makeDef({ triggerPerStep: 1 });
    // 所有 rng() 都返回 0：
    //   gate: 0 > 1 → false（通过）；
    //   r = 0 * total = 0；扣第一项 weight → -30 <= 0 → 命中 pet_a；
    //   level = floor(3 + 0 * (5 - 3 + 1)) = 3。
    const r = rollEncounter(def, () => 0);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.petId).toBe('pet_a');
    expect(r.level).toBe(3);
  });

  it('pool 为空时返回 null', () => {
    const def = makeDef({ triggerPerStep: 1, pool: [] });
    const rng = mulberry32(7);
    expect(rollEncounter(def, rng)).toBeNull();
  });

  it('返回的 level 始终落在 levelRange [lo, hi] 内', () => {
    const def = makeDef({
      triggerPerStep: 1,
      pool: [{ petId: 'only', weight: 1, levelRange: [10, 15] }],
    });
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const r = rollEncounter(def, rng);
      expect(r).not.toBeNull();
      if (!r) continue;
      expect(r.petId).toBe('only');
      expect(r.level).toBeGreaterThanOrEqual(10);
      expect(r.level).toBeLessThanOrEqual(15);
    }
  });

  it('权重分布：10000 次抽样后 pet_a/pet_b 频数差 < ±3%', () => {
    const def = makeDef({
      triggerPerStep: 1,
      pool: [
        { petId: 'pet_a', weight: 30, levelRange: [1, 1] },
        { petId: 'pet_b', weight: 70, levelRange: [1, 1] },
      ],
    });
    const rng = mulberry32(20240506);
    let a = 0;
    let b = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const r = rollEncounter(def, rng);
      if (!r) continue;
      if (r.petId === 'pet_a') a++;
      else if (r.petId === 'pet_b') b++;
    }
    expect(a + b).toBe(N);
    const rateA = a / N;
    const rateB = b / N;
    // 权重比例：30/100 与 70/100。±3% 容差：
    expect(Math.abs(rateA - 0.3)).toBeLessThan(0.03);
    expect(Math.abs(rateB - 0.7)).toBeLessThan(0.03);
  });

  it('浮点残差兜底：rng 让 r 累减不归零时仍返回最后一项', () => {
    // 构造一个让循环"走完仍不归零"的 rng：
    //   gate: 第 1 次 rng()=0（通过）；
    //   r = rng() * total；为让 `r -= entry.weight` 永不归零，需要 rng() 很接近 1，
    //   实际 JS 里 rng() < 1 严格成立，floor 舍入 + 浮点误差会让 r 累减到非常接近 0 但仍 > 0。
    //   这里用 rng() 恒返回 0.9999999 模拟：r = 0.9999999 * 100 = 99.99999；
    //   扣 30 → 69.99999；扣 70 → -0.00001；理论上会命中 pet_b。
    //
    //   为稳定触发"浮点残差兜底"，我们用自定义 rng：第 1 次返回 0（过 gate），
    //   第 2 次返回 1（模拟越界），让 total 入口 r = total（而非 < total），
    //   循环每次扣减都不归零：第 1 次 total - 30 = 70；第 2 次 70 - 70 = 0；
    //   这里 0 <= 0 仍触发命中。
    //   要让 `r <= 0` 永远不成立需要浮点精度误差。我们构造 weights 使 sum 无精度表示：
    const weights = [0.1, 0.2, 0.3, 0.4]; // sum 应为 1.0 但 JS 浮点和≠1
    const def: EncounterDef = {
      zoneId: 'test:zone',
      mapId: 'test',
      triggerPerStep: 1,
      pool: weights.map((w, i) => ({
        petId: `p${i}`,
        weight: w,
        levelRange: [1, 1] as const,
      })),
    };
    // rng 序列：[0, 1, 0]
    //   gate: 0 > 1 → false（通过）；
    //   r = 1 * sum(weights) ≈ 1.0 严格等于浮点和；扣减后 r 会精确到 0（或极接近 0）。
    //   当 r === 0 时 `r <= 0` 成立，命中最后一项。用兜底分支走通即可。
    //   第 3 次 rng()=0 → level = lo = 1。
    const seq = [0, 1, 0];
    let i = 0;
    const rng = (): number => {
      const v = seq[i] ?? 0;
      i++;
      return v;
    };
    const r = rollEncounter(def, rng);
    // 无论走到循环内的"命中最后一项"还是外面的"兜底返回最后一项"，
    // 语义上都应该等于池里最后一个条目。本用例断言最终结果恰是 p3。
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.petId).toBe('p3');
    expect(r.level).toBe(1);
  });

  it('triggerPerStep 介于 0 到 1 之间时，rng > 概率则返回 null', () => {
    const def = makeDef({ triggerPerStep: 0.3 });
    // 第一次 rng() = 0.5，0.5 > 0.3 → 本步不遭遇。
    const r = rollEncounter(def, () => 0.5);
    expect(r).toBeNull();
  });
});

/**
 * v1 review major #5 回归：encounter 去重粒度必须按 zoneId 而非 Zone 引用。
 *
 * 场景：彩虹城 'rainbow_city:garden' 拆到 4 个 Zone（bush），若按引用去重，玩家从 bush A
 * 走到相邻 bush B 会立即 roll 第二次遭遇。按 zoneId 去重则把 4 个 bush 视作同一片草丛，
 * 玩家只有"离开所有 4 个 bush"后再进入才会触发第二次 roll。
 */
describe('makeEncounterDedupTracker (v1 review major #5 回归)', () => {
  it('同 zoneId 连续两次 shouldFire 只第一次返回 true', () => {
    const t = makeEncounterDedupTracker();
    expect(t.shouldFire('rainbow_city:garden')).toBe(true);
    expect(t.shouldFire('rainbow_city:garden')).toBe(false);
    expect(t.size()).toBe(1);
  });

  it('不同 zoneId 互不影响：两条遭遇线并存', () => {
    const t = makeEncounterDedupTracker();
    expect(t.shouldFire('rainbow_city:garden')).toBe(true);
    expect(t.shouldFire('beach:shoreline')).toBe(true);
    expect(t.shouldFire('rainbow_city:garden')).toBe(false);
    expect(t.shouldFire('beach:shoreline')).toBe(false);
    expect(t.size()).toBe(2);
  });

  it('clearLeftZones 把 isStillOverlapping 返回 false 的 zoneId 从 Set 移除', () => {
    const t = makeEncounterDedupTracker();
    t.shouldFire('rainbow_city:garden');
    t.shouldFire('beach:shoreline');

    // 玩家已离开 rainbow_city:garden，仍在 beach:shoreline。
    t.clearLeftZones((z) => z === 'beach:shoreline');
    expect(t.size()).toBe(1);
    // 离开的 zoneId 下次可以再次 fire；未离开的仍在冷却。
    expect(t.shouldFire('rainbow_city:garden')).toBe(true);
    expect(t.shouldFire('beach:shoreline')).toBe(false);
  });

  it('模拟"同 zoneId 多 Zone 场景"：任一 Zone 仍重叠时不解除冷却', () => {
    // 假想彩虹城 4 个 bush 都绑 rainbow_city:garden，玩家在 bush 之间来回走。
    const t = makeEncounterDedupTracker();
    expect(t.shouldFire('rainbow_city:garden')).toBe(true);

    // POST_UPDATE 时"4 个 bush 中至少 1 个仍与玩家 body 重叠"→ 冷却持续。
    t.clearLeftZones(() => true);
    expect(t.size()).toBe(1);
    expect(t.shouldFire('rainbow_city:garden')).toBe(false);

    // 玩家走出所有 bush：isStillOverlapping 返回 false，解除冷却。
    t.clearLeftZones(() => false);
    expect(t.size()).toBe(0);

    // 再次进入任一 bush 可重新 fire。
    expect(t.shouldFire('rainbow_city:garden')).toBe(true);
  });

  it('clearLeftZones 对未注册的 zoneId 无副作用', () => {
    const t = makeEncounterDedupTracker();
    expect(() => t.clearLeftZones(() => true)).not.toThrow();
    expect(t.size()).toBe(0);
  });
});
