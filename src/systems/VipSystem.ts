import type { VipSnapshot } from '@/types';

import { todayUtcDateString } from './DailyQuest';

/**
 * VIP 系统纯函数集合（FEAT-305）。
 *
 * 本模块覆盖：
 *   1. 每日签到：`computeCheckin(prev, isVip, now, rng)` 返回 canCheckin / next 快照 / reward。
 *   2. 经验与金币倍率：`getExpMultiplier(isVip)` / `getCoinMultiplier(isVip)`。
 *   3. 野外稀有精灵触发：`rollRareWildEncounter(isVip, rng)` / `applyVipRareBoost(roll, isVip, rng)`。
 *
 * 所有 API 都是纯函数：
 *   - rng 依赖注入，便于测试稳定化；
 *   - 不触碰 PlayerState / EventBus / Phaser；
 *   - `computeCheckin` 不就地修改入参 `prev`，总是构造新 VipSnapshot 对象；
 *   - `applyVipRareBoost` 在命中稀有时新建一个 roll 对象返回，不改入参。
 *
 * 与 DailyQuest 共享 `todayUtcDateString`，确保"UTC 日"的格式化在项目中只有一处实现。
 */

// ---- 签到奖励常量（与设计文档锁定） ------------------------------------

/** 普通玩家每日签到金币。 */
const NORMAL_CHECKIN_COINS = 50;
/** VIP 玩家每日签到金币。 */
const VIP_CHECKIN_COINS = 200;

/**
 * VIP 签到随机药品池：每日从中抽 1 件。
 *
 * 严格只读：既不会被 rng 选空，也不会被外部 push 污染（tests 里会断言所有产出都属于此池）。
 * 三个 id 均来自 src/data/items.ts（FEAT-304 数据表），上层无需额外校验。
 */
const VIP_RANDOM_POTION_POOL: readonly string[] = [
  'potion_small',
  'potion_medium',
  'exp_candy',
];

// ---- 倍率常量 ----------------------------------------------------------

/** VIP 玩家战斗经验 / 金币倍率。 */
const VIP_MULTIPLIER = 1.5;

/** VIP 野外稀有触发概率（每次遭遇独立判定）。 */
const VIP_RARE_CHANCE = 0.1;

/** VIP 稀有命中时，野生精灵等级增加幅度。 */
const VIP_RARE_LEVEL_BOOST = 3;

// ---- 签到 --------------------------------------------------------------

/**
 * 签到奖励结构：金币 + 物品映射。
 *
 * - `coins === 0` 且 `items === {}` 表示"无奖励"（同日重复签到时返回）。
 * - `items` 的 key 是 item id，value 是数量（均 >= 1）。
 */
export interface CheckinReward {
  readonly coins: number;
  readonly items: Readonly<Record<string, number>>;
}

/**
 * `computeCheckin` 的返回值。
 *
 * - `canCheckin`：今天是否还能签到（已签过返回 false）；
 * - `next`：签到后（或无操作时）应写回的 VipSnapshot；
 * - `reward`：本次签到应发放的金币 + 物品。未签到时 reward.coins=0 且 items={}。
 */
export interface CheckinResult {
  readonly canCheckin: boolean;
  readonly next: VipSnapshot;
  readonly reward: CheckinReward;
}

/**
 * 内部：把 `todayStr` (`YYYY-MM-DD`) 减一天，返回"昨天"的字符串表达。
 *
 * 采用先把字符串解析为 UTC 午夜再减 86400s 的套路，避免本地时区的夏令时 / 时区偏移
 * 干扰"昨天"的判定。输入不合法（长度不符）时返回 null，调用方按"不连续"处理。
 */
function yesterdayUtc(todayStr: string): string | null {
  if (todayStr.length !== 10) return null;
  const y = Number(todayStr.slice(0, 4));
  const m = Number(todayStr.slice(5, 7));
  const d = Number(todayStr.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const t = Date.UTC(y, m - 1, d) - 86400_000;
  return todayUtcDateString(new Date(t));
}

/**
 * 计算一次签到的结果。
 *
 * 规则：
 *   1. 若 `prev.lastCheckinDate === todayStr`：`canCheckin=false`，
 *      `next=prev` 原样透传（**新构造**相同字段的对象，避免调用方意外共享引用），
 *      `reward = { coins:0, items:{} }`。
 *   2. 否则 `canCheckin=true`；`next.lastCheckinDate = todayStr`；
 *      `next.checkinStreak` 按"昨天是否签过"判定：
 *        - `prev.lastCheckinDate === yesterdayStr` → `prev.streak + 1`；
 *        - 否则（首次签到 / 中断后重签）→ 1。
 *   3. 奖励：
 *        - 非 VIP：`{ coins: 50, items: {} }`；
 *        - VIP：`{ coins: 200, items: { pokeball_normal: 1, <random_potion>: 1 } }`，
 *          其中 `<random_potion>` 从 `VIP_RANDOM_POTION_POOL` 中按 `rng()` 选 index。
 *
 * `rng` 在非 VIP 分支下不会被调用（保证纯 determinism，测试可注入 throw 函数验证）。
 */
export function computeCheckin(
  prev: VipSnapshot,
  isVip: boolean,
  now: Date,
  rng: () => number,
): CheckinResult {
  const todayStr = todayUtcDateString(now);

  if (prev.lastCheckinDate === todayStr) {
    // 同日再签：零奖励，快照不变（新建同值对象避免引用共享）。
    return {
      canCheckin: false,
      next: { lastCheckinDate: prev.lastCheckinDate, checkinStreak: prev.checkinStreak },
      reward: { coins: 0, items: {} },
    };
  }

  // 判定连续性：昨天 === prev.lastCheckinDate 则 streak + 1；否则重置为 1。
  const yestStr = yesterdayUtc(todayStr);
  const isConsecutive = prev.lastCheckinDate !== null && prev.lastCheckinDate === yestStr;
  const nextStreak = isConsecutive ? prev.checkinStreak + 1 : 1;

  const next: VipSnapshot = {
    lastCheckinDate: todayStr,
    checkinStreak: nextStreak,
  };

  // 非 VIP：固定 50 金币，无物品。
  if (!isVip) {
    return {
      canCheckin: true,
      next,
      reward: { coins: NORMAL_CHECKIN_COINS, items: {} },
    };
  }

  // VIP：200 金币 + 1 个精灵球 + 1 件随机药品。
  const randIdx = Math.floor(rng() * VIP_RANDOM_POTION_POOL.length);
  // 夹紧到 [0, pool.length - 1]：rng() 返回 1.0 时 floor(1.0 * n) = n，越界兜底。
  const safeIdx = Math.min(Math.max(0, randIdx), VIP_RANDOM_POTION_POOL.length - 1);
  const potionId = VIP_RANDOM_POTION_POOL[safeIdx];
  // TS 严格模式下 readonly 数组索引可能返回 undefined，但 pool 长度非 0 + safeIdx 夹紧
  // 保证此处总能拿到值；防御性地兜底到池首项。
  const pickedPotion = potionId ?? VIP_RANDOM_POTION_POOL[0] ?? 'potion_small';

  // 先塞精灵球，再覆盖 / 累加药品：本池当前不含 pokeball_normal，若未来扩池则同 key 累加。
  const items: Record<string, number> = { pokeball_normal: 1 };
  items[pickedPotion] = (items[pickedPotion] ?? 0) + 1;

  return {
    canCheckin: true,
    next,
    reward: { coins: VIP_CHECKIN_COINS, items },
  };
}

// ---- 倍率 --------------------------------------------------------------

/**
 * 返回战斗经验倍率：VIP 1.5；普通 1.0。
 *
 * BattleScene 的 `awardVictoryExp` 会把 `expOnDefeat(...)` 的结果乘上此值再取 round。
 */
export function getExpMultiplier(isVip: boolean): number {
  return isVip ? VIP_MULTIPLIER : 1;
}

/**
 * 返回战斗金币倍率：VIP 1.5；普通 1.0。
 *
 * BattleScene 的 BOSS 胜利分支把 `boss.rewardCoins * getCoinMultiplier(isVip)`
 * 再 `Math.floor` 后写入 `PlayerState.addCoins`，避免出现小数金币。
 */
export function getCoinMultiplier(isVip: boolean): number {
  return isVip ? VIP_MULTIPLIER : 1;
}

// ---- 稀有野外遭遇 ------------------------------------------------------

/**
 * 野外遭遇时：VIP 玩家有 10% 概率把本次遭遇升级为"稀有"。
 *
 * - 普通玩家：始终返回 `false`（不消耗 rng 调用次数，测试传入 throw 的 rng 也不触发）；
 * - VIP：`rng() < VIP_RARE_CHANCE`（0.1），临界值包括 `rng()=0.0999…` 命中、`rng()=0.1` 不命中。
 */
export function rollRareWildEncounter(isVip: boolean, rng: () => number): boolean {
  if (!isVip) return false;
  return rng() < VIP_RARE_CHANCE;
}

/**
 * 把 encounter roll 结果按 VIP 稀有加成调整并返回新对象。
 *
 * - 非 VIP 或未命中稀有：返回与入参等价的**新对象**（`{ petId, level }`，浅拷贝），
 *   调用方据此判断是否"命中稀有"可对比 `next.level !== roll.level`。
 * - VIP 命中：`level += VIP_RARE_LEVEL_BOOST`（+3），`petId` 保持不变；
 *   同样返回新对象，不修改入参。
 *
 * rng 在非 VIP 分支永远不会被调用（与 `rollRareWildEncounter` 对齐）。
 */
export function applyVipRareBoost(
  roll: { petId: string; level: number },
  isVip: boolean,
  rng: () => number,
): { petId: string; level: number } {
  if (!rollRareWildEncounter(isVip, rng)) {
    return { petId: roll.petId, level: roll.level };
  }
  return { petId: roll.petId, level: roll.level + VIP_RARE_LEVEL_BOOST };
}

// ---- 聚合导出 ----------------------------------------------------------

/**
 * 聚合命名空间，便于 `import { VipSystem } from '@/systems/VipSystem'`。
 */
export const VipSystem = {
  computeCheckin,
  getExpMultiplier,
  getCoinMultiplier,
  rollRareWildEncounter,
  applyVipRareBoost,
} as const;
