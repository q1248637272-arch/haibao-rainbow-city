import type { ItemDefinition, PlayerSave } from '@/types';

/**
 * 商店系统纯函数集合（FEAT-304）。
 *
 * 这里不直接触碰 PlayerState / EventBus——UI 拿到 `applyPurchase` 返回的新快照后
 * 再调用 PlayerState 的 `addCoins` / `addItem` 即可（现有单例会自己 persist + emit）。
 *
 * 三道核心闸门：
 * 1. `priceForQuantity`：组合每日限时折扣 × 0.7 与 VIP 全品 × 0.9。
 *    VIP 专属商品对 VIP 不再叠 0.9（它已经是 VIP 的福利，不再加码）。
 *    每日折扣对 VIP 专属商品同样不生效（见约束：限时折扣仅针对普通品）。
 * 2. `canPurchase`：检查金币是否足够、VIP 锁、数量非法。
 * 3. `applyPurchase`：返回 `coinsAfter / inventoryAfter / totalCost` 新快照，不改入参。
 *
 * 每日折扣池由 `pickDailyDiscounts` 在跨日时由 DailyQuest 调用生成，结果落在
 * `PlayerSaveV3.dailyContext.shopDiscountIds`。
 */

/** 没有每日种子时沿用旧版固定七折，保持旧测试和旧调用兼容。 */
const DAILY_DISCOUNT_MULT = 0.7;
/** VIP 全品折扣倍率（vip_only 不吃此折扣）。 */
const VIP_DISCOUNT_MULT = 0.9;

export interface PriceBreakdown {
  /** 折扣后单价（向上取整，确保玩家金币不会因精度问题变负）。 */
  readonly unit: number;
  /** 购买 `quantity` 件的总价。 */
  readonly total: number;
}

/**
 * 计算单价 + 总价。
 *
 * @param def 商品定义。
 * @param quantity 正整数数量（`'max'` 应由调用方先展开成具体整数再传入）；
 *                 `<= 0` 会把 total 钉死为 0。
 * @param dailyDiscountIds 今日限时折扣 id 列表（通常来自 dailyContext.shopDiscountIds）。
 * @param isVip 当前玩家是否 VIP。
 *
 * @returns 折后单价与总价。unit / total 都取上整数，避免浮点误差。
 */
export function priceForQuantity(
  def: ItemDefinition,
  quantity: number,
  dailyDiscountIds: readonly string[],
  isVip: boolean,
  dailyDiscountSeed?: string | null,
): PriceBreakdown {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      unit: Math.ceil(priceAfterDiscounts(def, dailyDiscountIds, isVip, dailyDiscountSeed)),
      total: 0,
    };
  }
  const unit = Math.ceil(priceAfterDiscounts(def, dailyDiscountIds, isVip, dailyDiscountSeed));
  const total = unit * Math.floor(quantity);
  return { unit, total };
}

/**
 * 内部：按规则叠加两档折扣并返回"浮点单价"。上层自行取上整。
 *
 * 规则：
 * - VIP 专属商品（`def.vipOnly === true`）：永远按原价出售（两档折扣都不生效），
 *   因为它本身就是 VIP 福利，再叠 0.9 / 0.7 会破坏商品定位。
 * - 非 VIP 专属商品：
 *   - `isVip` → 乘 0.9；
 *   - 命中 dailyDiscountIds → 乘 0.7；
 *   - 两者可同时生效（0.9 × 0.7 = 0.63）。
 */
function priceAfterDiscounts(
  def: ItemDefinition,
  dailyDiscountIds: readonly string[],
  isVip: boolean,
  dailyDiscountSeed?: string | null,
): number {
  if (def.vipOnly === true) {
    return def.price;
  }
  let mult = 1;
  if (isVip) mult *= VIP_DISCOUNT_MULT;
  if (dailyDiscountIds.includes(def.id)) {
    mult *= dailyDiscountSeed
      ? dailyDiscountMultiplier(def.id, dailyDiscountSeed)
      : DAILY_DISCOUNT_MULT;
  }
  return def.price * mult;
}

/**
 * 每日限时商品的随机折扣倍率：0.1 ~ 0.9，分别表示 1 折到 9 折。
 *
 * 这里用日期 + 商品 id 作为稳定种子：同一天同一商品的折扣固定，跨天会变化，
 * 既像随机刷新，又不会因为反复打开补给站而跳价。
 */
export function dailyDiscountMultiplier(itemId: string, seed: string): number {
  const hash = xmur3(`${seed}:discount-rate:${itemId}`);
  const rng = mulberry32(hash());
  const tier = 1 + Math.floor(rng() * 9);
  return tier / 10;
}

export function dailyDiscountLabel(itemId: string, seed: string): string {
  return `${Math.round(dailyDiscountMultiplier(itemId, seed) * 10)}折`;
}

/**
 * `canPurchase` 的失败原因：
 * - `vip_locked`：非 VIP 玩家试图购买 vip_only 商品；
 * - `coins_low`：金币不足以承担折后总价；
 * - `invalid_qty`：数量非正整数（0 / 负数 / NaN / 非整数）；
 * - `shop_unavailable`：活动信物等非商店直售物品。
 */
export type PurchaseDeniedReason =
  | 'vip_locked'
  | 'coins_low'
  | 'invalid_qty'
  | 'shop_unavailable';

export interface CanPurchaseInput {
  readonly item: ItemDefinition;
  readonly qty: number;
  readonly coins: number;
  readonly isVip: boolean;
  readonly dailyDiscountIds: readonly string[];
  readonly dailyDiscountSeed?: string | null;
}

export interface CanPurchaseResult {
  readonly ok: boolean;
  readonly reason?: PurchaseDeniedReason;
  /** 计算好的总价。UI 可以直接展示。 */
  readonly totalCost: number;
}

/**
 * 判断是否可以购买。本函数不关心 `inventory`（背包没有容量上限），
 * 只做 VIP / 金币 / 数量闸门。
 */
export function canPurchase(input: CanPurchaseInput): CanPurchaseResult {
  const { item, qty, coins, isVip, dailyDiscountIds, dailyDiscountSeed } = input;

  // 数量非整数 / 非正：直接拦截。
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
    return { ok: false, reason: 'invalid_qty', totalCost: 0 };
  }

  if (item.shopAvailable === false) {
    return { ok: false, reason: 'shop_unavailable', totalCost: 0 };
  }

  // VIP 锁。
  if (item.vipOnly === true && !isVip) {
    const { total } = priceForQuantity(item, qty, dailyDiscountIds, isVip, dailyDiscountSeed);
    return { ok: false, reason: 'vip_locked', totalCost: total };
  }

  const { total } = priceForQuantity(item, qty, dailyDiscountIds, isVip, dailyDiscountSeed);
  if (coins < total) {
    return { ok: false, reason: 'coins_low', totalCost: total };
  }

  return { ok: true, totalCost: total };
}

export interface ApplyPurchaseResult {
  /** 扣款后剩余金币。 */
  readonly coinsAfter: number;
  /** 叠加后的新背包快照（不引用入参对象）。 */
  readonly inventoryAfter: Readonly<Record<string, number>>;
  /** 本次总花费（已应用折扣）。 */
  readonly totalCost: number;
}

/**
 * 结算一次购买：返回新金币 / 新背包 / 总花费，**不改动 `save` 入参**。
 *
 * 调用方责任：
 * - 在调用前用 `canPurchase` 验证；
 * - 拿到返回值后写回 PlayerState（`addCoins(-total)` + `addItem(id, qty)`），
 *   再 emit 'shop:purchase'。
 */
export function applyPurchase(
  save: PlayerSave,
  item: ItemDefinition,
  quantity: number,
  dailyDiscountIds: readonly string[],
  dailyDiscountSeed?: string | null,
): ApplyPurchaseResult {
  const { total } = priceForQuantity(
    item,
    quantity,
    dailyDiscountIds,
    save.isVip,
    dailyDiscountSeed,
  );
  const coinsAfter = Math.max(0, save.coins - total);
  const inventoryAfter: Record<string, number> = { ...save.inventory };
  const current = inventoryAfter[item.id];
  inventoryAfter[item.id] = (typeof current === 'number' ? current : 0) + quantity;
  return { coinsAfter, inventoryAfter, totalCost: total };
}

/**
 * 内部：xmur3 字符串哈希 → 32 位种子。轻量可移植。
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
 * 内部：mulberry32 PRNG。接受 xmur3 产生的 seed，返回 [0, 1) 的浮点。
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
 * 稳定的每日限时折扣抽取。
 *
 * - 仅从**非 vip_only** 的商品中抽取（VIP 专属商品永远保持原价）。
 * - 同一个 `seed` 必定得到同一组结果（跨重启、跨平台一致）。
 * - `count` 超过可选池时返回整个可选池（不足也不报错）。
 *
 * 算法：按 id 字典序排序 → xmur3(seed) 生成 32bit 种子 → mulberry32 PRNG →
 * Fisher-Yates 洗牌 → 取前 `count` 个 id。
 */
export function pickDailyDiscounts(
  items: readonly ItemDefinition[],
  seed: string,
  count = 3,
): string[] {
  const pool = items
    .filter((it) => it.vipOnly !== true && it.shopAvailable !== false)
    .map((it) => it.id);
  pool.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  if (pool.length === 0 || count <= 0) return [];

  const hash = xmur3(seed);
  const rng = mulberry32(hash());

  // Fisher-Yates 原地洗牌。
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    const other = pool[j];
    if (tmp === undefined || other === undefined) continue;
    pool[i] = other;
    pool[j] = tmp;
  }

  return pool.slice(0, Math.min(count, pool.length));
}

/**
 * 聚合导出，便于 `import { ShopSystem } from '@/systems/ShopSystem'`。
 */
export const ShopSystem = {
  priceForQuantity,
  dailyDiscountMultiplier,
  dailyDiscountLabel,
  canPurchase,
  applyPurchase,
  pickDailyDiscounts,
} as const;
