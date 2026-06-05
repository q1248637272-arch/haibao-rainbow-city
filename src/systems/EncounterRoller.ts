import type { EncounterDef } from '@/data/encounters';

/**
 * 野生遭遇的加权 roll（FEAT-206）。
 *
 * 设计要点：
 *   - 纯函数：不 import 任何 Phaser / 数据模块之外的东西，也不读任何全局状态；
 *     所有随机性通过 `rng: () => number` 显式注入，方便 Vitest 用种子化 PRNG 回放。
 *   - `triggerPerStep` 作为"每一步是否触发遭遇"的概率闸门：`rng() > triggerPerStep`
 *     直接返回 `null`。这里用严格大于，使 `triggerPerStep = 0` 永远不触发（`rng()` 值域 [0,1)，
 *     任意返回值都 > 0 为真；即便 rng() 恰返回 0，也会因 0 > 0 为 false 进入挑选阶段，
 *     但此时 pool 里 weight 总和 > 0 也会让 `r -= weight` 循环落到第一项并返回，所以还需要
 *     调用方显式把空池或概率 0 的 zone 做成"不注册"或本函数直接在 `triggerPerStep <= 0` 时
 *     短路返回 null，这里选后者）。
 *   - 权重挑选：`r` 在 [0, total) 上均匀分布，逐项扣减，扣到 <= 0 即命中；
 *   - 浮点残差兜底：极端情况下（rng 恰好很大，每次扣减都仍 > 0）循环可能走完也不归零，
 *     此时返回池中最后一项，避免返回 null 让调用方空跑一次步。
 */
export function rollEncounter(
  def: EncounterDef,
  rng: () => number,
): { petId: string; level: number } | null {
  // 概率为 0 或负 → 永远不触发。
  if (def.triggerPerStep <= 0) return null;

  // 概率闸门：rng() > triggerPerStep 则本步不遭遇。
  if (rng() > def.triggerPerStep) return null;

  if (def.pool.length === 0) return null;

  const total = def.pool.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return null;

  let r = rng() * total;
  for (const entry of def.pool) {
    r -= entry.weight;
    if (r <= 0) {
      return pickLevel(entry, rng);
    }
  }

  // 浮点残差兜底：返回池中最后一项。
  const last = def.pool[def.pool.length - 1];
  if (!last) return null;
  return pickLevel(last, rng);
}

/**
 * 野生遭遇去重追踪器（FEAT-206 v1 review polish）。
 *
 * `wireEncounterOverlaps` 原实现用 `Set<Phaser.GameObjects.Zone>` 按 zone 引用去重，
 * 导致同 zoneId 的多个物理 zone（例如彩虹城 4 个 bush 都绑 rainbow_city:garden）
 * 相邻移动时会立即连环触发遭遇。本追踪器改用 `Set<string>` 按 zoneId 去重：
 *
 *   - `shouldFire(zoneId)`：若 zoneId 未触发过则记录并返回 true；否则返回 false。
 *     调用方（IsoWorldRenderer 的 overlap 回调）用返回值决定是否真的调 rollEncounter；
 *   - `clearLeftZones(isStillOverlapping)`：每帧 POST_UPDATE 调用，传入"给定 zoneId
 *     是否仍与玩家的 arcade body 重叠"判定函数；不再重叠则从 Set 移除，让下一次进入
 *     可以重新 roll。
 *
 * 纯函数工厂：内部状态仅存在于闭包里，无 I/O 无 Phaser 依赖，方便 Vitest 直接覆盖。
 */
export interface EncounterDedupTracker {
  /**
   * 返回 `true` 当且仅当这次进入 zoneId 是"新的触发"（之前未记录）。
   * 返回 `true` 后即把 zoneId 加入内部 Set；`false` 表示正处于同 zoneId 的冷却期。
   */
  shouldFire(zoneId: string): boolean;
  /**
   * 遍历当前已触发的 zoneId，对每个 zoneId 调用 `isStillOverlapping(zoneId)`；
   * 若返回 false，把该 zoneId 从内部 Set 移除。
   *
   * 调用方通常在 Phaser 的 POST_UPDATE 周期内传入"聚合该 zoneId 下所有 Zone，只要
   * 玩家 body 仍与任一 Zone 重叠就返回 true"的闭包。
   */
  clearLeftZones(isStillOverlapping: (zoneId: string) => boolean): void;
  /**
   * 调试用：当前已触发的 zoneId 数量。纯只读。
   */
  size(): number;
}

export function makeEncounterDedupTracker(): EncounterDedupTracker {
  const triggered = new Set<string>();
  return {
    shouldFire(zoneId: string): boolean {
      if (triggered.has(zoneId)) return false;
      triggered.add(zoneId);
      return true;
    },
    clearLeftZones(isStillOverlapping: (zoneId: string) => boolean): void {
      for (const z of [...triggered]) {
        if (!isStillOverlapping(z)) triggered.delete(z);
      }
    },
    size(): number {
      return triggered.size;
    },
  };
}

/**
 * 在 `[lo, hi]` 闭区间内按 rng 均匀挑一个整数等级。
 * 防御性夹紧到 `[lo, hi]` 边界，避免 `rng()` 返回 1（理论上不会）时 floor 越界。
 */
function pickLevel(
  entry: EncounterDef['pool'][number],
  rng: () => number,
): { petId: string; level: number } {
  const [lo, hi] = entry.levelRange;
  const raw = Math.floor(lo + rng() * (hi - lo + 1));
  const level = Math.max(lo, Math.min(hi, raw));
  return { petId: entry.petId, level };
}
