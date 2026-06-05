import { describe, expect, it } from 'vitest';

import { ITEMS } from '@/data/items';
import {
  ShopSystem,
  applyPurchase,
  canPurchase,
  pickDailyDiscounts,
  priceForQuantity,
} from '@/systems/ShopSystem';
import type { ItemDefinition, PlayerSave } from '@/types';

/**
 * 取一件非 vip_only 的物品（用 pokeball_normal 作为稳定锚点）。
 */
function pokeballNormal(): ItemDefinition {
  const def = ITEMS['pokeball_normal'];
  if (!def) throw new Error('pokeball_normal 未在 ITEMS 注册');
  return def;
}

/**
 * 取一件 vip_only 物品（pokeball_master）。
 */
function pokeballMaster(): ItemDefinition {
  const def = ITEMS['pokeball_master'];
  if (!def) throw new Error('pokeball_master 未在 ITEMS 注册');
  return def;
}

/**
 * 构造最小合法 PlayerSave 供 applyPurchase 测试使用。
 */
function makeSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  return {
    version: 4,
    playerName: '小海宝',
    coins: 1000,
    isVip: false,
    playerPets: [],
    petStorage: [],
    defeatedBossIds: [],
    unlockedMaps: ['rainbow_city'],
    pokeballs: 10,
    inventory: {},
    homeLayout: [],
    questStates: {},
    vip: { lastCheckinDate: null, checkinStreak: 0 },
    settings: { bgmVolume: 0.6, sfxVolume: 0.8 },
    dailyContext: { lastRolledDate: null, shopDiscountIds: [], dailyQuestIds: [] },
    lastSavedAt: 0,
    ...overrides,
  };
}

describe('ShopSystem.priceForQuantity', () => {
  it('普通品无折扣：单价 = 原价，总价 = 单价 × 数量', () => {
    const def = pokeballNormal(); // price = 10
    expect(priceForQuantity(def, 1, [], false)).toEqual({ unit: 10, total: 10 });
    expect(priceForQuantity(def, 10, [], false)).toEqual({ unit: 10, total: 100 });
    expect(priceForQuantity(def, 100, [], false)).toEqual({ unit: 10, total: 1000 });
  });

  it('dailyDiscountIds 命中：单价 × 0.7 并向上取整', () => {
    const def = pokeballNormal(); // price=10 → 7
    const r = priceForQuantity(def, 5, ['pokeball_normal'], false);
    expect(r.unit).toBe(7);
    expect(r.total).toBe(35);
  });

  it('VIP 非 vip_only 品：单价 × 0.9 并向上取整', () => {
    const def = pokeballNormal(); // price=10 → 9
    const r = priceForQuantity(def, 10, [], true);
    expect(r.unit).toBe(9);
    expect(r.total).toBe(90);
  });

  it('VIP 叠加每日折扣：单价 × 0.9 × 0.7 并向上取整', () => {
    const def = ITEMS['pokeball_great'];
    if (!def) throw new Error();
    // price 50 × 0.9 × 0.7 = 31.5 → 向上取整 32
    const r = priceForQuantity(def, 2, ['pokeball_great'], true);
    expect(r.unit).toBe(32);
    expect(r.total).toBe(64);
  });

  it('vip_only 对 VIP 不叠 0.9：保持原价', () => {
    const def = pokeballMaster(); // price = 2000
    const r = priceForQuantity(def, 1, [], true);
    expect(r.unit).toBe(2000);
    expect(r.total).toBe(2000);
  });

  it('vip_only 对 VIP 命中每日折扣也不生效：保持原价', () => {
    const def = pokeballMaster();
    const r = priceForQuantity(def, 1, ['pokeball_master'], true);
    expect(r.unit).toBe(2000);
    expect(r.total).toBe(2000);
  });

  it('非正数量：total=0', () => {
    const def = pokeballNormal();
    expect(priceForQuantity(def, 0, [], false).total).toBe(0);
    expect(priceForQuantity(def, -5, [], false).total).toBe(0);
    expect(priceForQuantity(def, Number.NaN, [], false).total).toBe(0);
  });
});

describe('ShopSystem.canPurchase', () => {
  it('金币不足：ok=false, reason=coins_low', () => {
    const def = pokeballNormal();
    const r = canPurchase({
      item: def,
      qty: 100,
      coins: 50, // 需要 1000，只有 50
      isVip: false,
      dailyDiscountIds: [],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('coins_low');
    expect(r.totalCost).toBe(1000);
  });

  it('VIP 锁：非 VIP 购买 vip_only 返回 vip_locked', () => {
    const def = pokeballMaster();
    const r = canPurchase({
      item: def,
      qty: 1,
      coins: 999999,
      isVip: false,
      dailyDiscountIds: [],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('vip_locked');
  });

  it('非法数量：0 / 负数 / 小数 / NaN 全部 invalid_qty', () => {
    const def = pokeballNormal();
    for (const qty of [0, -1, 1.5, Number.NaN]) {
      const r = canPurchase({
        item: def,
        qty,
        coins: 999,
        isVip: false,
        dailyDiscountIds: [],
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('invalid_qty');
    }
  });

  it('金币恰好等于总价：ok=true（边界等价）', () => {
    const def = pokeballNormal();
    const r = canPurchase({
      item: def,
      qty: 10,
      coins: 100,
      isVip: false,
      dailyDiscountIds: [],
    });
    expect(r.ok).toBe(true);
    expect(r.totalCost).toBe(100);
  });

  it('VIP 购买 vip_only 品：金币足够时 ok=true', () => {
    const def = pokeballMaster();
    const r = canPurchase({
      item: def,
      qty: 1,
      coins: 3000,
      isVip: true,
      dailyDiscountIds: [],
    });
    expect(r.ok).toBe(true);
    expect(r.totalCost).toBe(2000);
  });

  it('event-only tokens are blocked by the purchase gate', () => {
    const def = ITEMS['zeng_ming_stage2_token'];
    if (!def) throw new Error();
    const r = canPurchase({
      item: def,
      qty: 1,
      coins: 999999,
      isVip: true,
      dailyDiscountIds: [],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('shop_unavailable');
    expect(r.totalCost).toBe(0);
  });
});

describe('ShopSystem.applyPurchase', () => {
  it('不修改入参：save / inventory 引用完全隔离', () => {
    const def = pokeballNormal();
    const save = makeSave({ coins: 200, inventory: { potion_small: 2 } });
    const snapshot = JSON.parse(JSON.stringify(save)) as PlayerSave;

    const result = applyPurchase(save, def, 5, []);

    // 入参没被触碰
    expect(save).toEqual(snapshot);
    expect(save.inventory).toEqual(snapshot.inventory);

    // 返回值是新对象
    expect(result.inventoryAfter).not.toBe(save.inventory);
    expect(result.totalCost).toBe(50);
    expect(result.coinsAfter).toBe(150);
    expect(result.inventoryAfter['pokeball_normal']).toBe(5);
    expect(result.inventoryAfter['potion_small']).toBe(2);
  });

  it('累加已有库存：原 3 件 + 买 7 件 = 10 件', () => {
    const def = pokeballNormal();
    const save = makeSave({ coins: 500, inventory: { pokeball_normal: 3 } });
    const r = applyPurchase(save, def, 7, []);
    expect(r.inventoryAfter['pokeball_normal']).toBe(10);
    expect(r.coinsAfter).toBe(430); // 500 - 70
  });

  it('VIP + 每日折扣：applyPurchase 反映在 totalCost', () => {
    const def = ITEMS['pokeball_great'];
    if (!def) throw new Error();
    const save = makeSave({ coins: 500, isVip: true });
    // 50 × 0.9 × 0.7 = 31.5 → ceil 32
    const r = applyPurchase(save, def, 2, ['pokeball_great']);
    expect(r.totalCost).toBe(64);
    expect(r.coinsAfter).toBe(500 - 64);
    expect(r.inventoryAfter['pokeball_great']).toBe(2);
  });
});

describe('ShopSystem.pickDailyDiscounts', () => {
  const pool = Object.values(ITEMS);

  it('同 seed 稳定：两次调用结果完全一致', () => {
    const a = pickDailyDiscounts(pool, '2025-01-15', 3);
    const b = pickDailyDiscounts(pool, '2025-01-15', 3);
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
  });

  it('不同 seed 产生不同序列（在合理概率下）', () => {
    const a = pickDailyDiscounts(pool, '2025-01-15', 3);
    const b = pickDailyDiscounts(pool, '2025-01-16', 3);
    // 即使偶尔元素集合一样，至少不应该完全同序（样本池 >= 30 时概率很低）
    expect(JSON.stringify(a) === JSON.stringify(b)).toBe(false);
  });

  it('结果不含任何 vip_only 商品', () => {
    const out = pickDailyDiscounts(pool, 'some-seed', 10);
    for (const id of out) {
      const item = ITEMS[id];
      expect(item).toBeDefined();
      expect(item?.vipOnly).not.toBe(true);
    }
  });

  it('结果不含活动专属信物', () => {
    const out = pickDailyDiscounts(pool, 'event-token-seed', 9999);
    expect(out).not.toContain('zeng_ming_stage2_token');
    expect(out).not.toContain('zeng_ming_stage3_token');
    expect(out).not.toContain('kun_chicken_token');
  });

  it('返回 count 个唯一 id（无重复）', () => {
    const out = pickDailyDiscounts(pool, 'unique-seed', 5);
    const unique = new Set(out);
    expect(unique.size).toBe(out.length);
    expect(out.length).toBe(5);
  });

  it('count 超过池大小时返回整个池', () => {
    const nonVip = pool.filter((i) => i.vipOnly !== true && i.shopAvailable !== false);
    const out = pickDailyDiscounts(pool, 'seed', 9999);
    expect(out.length).toBe(nonVip.length);
  });

  it('count<=0 或空池返回空数组', () => {
    expect(pickDailyDiscounts(pool, 's', 0)).toEqual([]);
    expect(pickDailyDiscounts(pool, 's', -5)).toEqual([]);
    expect(pickDailyDiscounts([], 's', 3)).toEqual([]);
  });
});

describe('ShopSystem 聚合导出', () => {
  it('ShopSystem.* 与具名导出指向同一实现', () => {
    expect(ShopSystem.priceForQuantity).toBe(priceForQuantity);
    expect(ShopSystem.canPurchase).toBe(canPurchase);
    expect(ShopSystem.applyPurchase).toBe(applyPurchase);
    expect(ShopSystem.pickDailyDiscounts).toBe(pickDailyDiscounts);
  });
});
