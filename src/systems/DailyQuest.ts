import type { QuestDefinition } from '@/types';

/**
 * 每日任务滚动相关的纯函数（FEAT-303）。
 *
 * 与 ShopSystem.pickDailyDiscounts 同样的套路：不触碰 Phaser / PlayerState，
 * 只接收 seed 与数据池，返回稳定结果。这样测试里就可以 100% 覆盖 UTC 跨日判断、
 * 同 seed 稳定性、count 超池退化等边界情形。
 */

/**
 * 把时间戳格式化为 UTC 的 `YYYY-MM-DD`。
 *
 * 依赖 Date.getUTC* 系列方法保证跨时区稳定。不使用 toISOString().slice(0,10)
 * 是为了显式体现"UTC 日"语义（万一未来需要改为玩家本地日可以一键切换）。
 */
export function todayUtcDateString(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * 是否需要滚动每日任务 / 商店折扣。
 *
 * - `lastRolled === null`：首次进入，必须滚动。
 * - `lastRolled` 字符串与今天 UTC 日不同：跨日了，需要滚动。
 * - 其余情况：同日，不需要滚动。
 */
export function shouldRefreshDaily(lastRolled: string | null, now: Date = new Date()): boolean {
  if (lastRolled === null) return true;
  return lastRolled !== todayUtcDateString(now);
}

/**
 * 内部：xmur3 字符串哈希 → 32 位种子。与 ShopSystem 里的实现一致，
 * 为了让 DailyQuest 模块能独立引用（避免互相依赖）在此处复制一份，
 * 保证两个模块的"稳定洗牌"行为完全同构。
 */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function (): number {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/**
 * 内部：mulberry32 PRNG。返回 [0, 1) 的浮点。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从每日任务池里稳定抽取 `count` 条发布。
 *
 * - 结果顺序稳定：先按 id 字典序排序再 Fisher-Yates 洗牌，保证同 seed 同结果。
 * - `count <= 0` 或空池 → 返回空数组。
 * - `count` 超过池大小 → 退化为整个池（按洗牌后顺序输出）。
 *
 * 返回的是任务 id 列表（字符串），由调用方自行映射到 QuestDefinition。
 * 这样 PlayerSaveV3.dailyContext.dailyQuestIds 可以直接落盘。
 */
export function pickDailyQuests(
  pool: readonly QuestDefinition[],
  seed: string,
  count = 3,
): string[] {
  if (pool.length === 0 || count <= 0) return [];

  const ids = pool.map((q) => q.id);
  ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const hash = xmur3(seed);
  const rng = mulberry32(hash());

  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = ids[i];
    const other = ids[j];
    if (tmp === undefined || other === undefined) continue;
    ids[i] = other;
    ids[j] = tmp;
  }

  return ids.slice(0, Math.min(count, ids.length));
}

/**
 * 聚合导出，便于 `import { DailyQuest } from '@/systems/DailyQuest'`。
 */
export const DailyQuest = {
  todayUtcDateString,
  shouldRefreshDaily,
  pickDailyQuests,
} as const;
