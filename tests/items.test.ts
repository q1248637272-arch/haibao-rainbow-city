import { describe, expect, it } from 'vitest';

import {
  ITEMS,
  SHOP_TAB_LABELS,
  getItem,
  itemsByKind,
  shopCatalogItems,
  shopItemsByKind,
  vipOnlyItems,
} from '@/data/items';
import { ELEMENTS } from '@/types';

describe('ITEMS 数据表（FEAT-304）', () => {
  const all = Object.values(ITEMS);

  it('条目总数 ≥ 42', () => {
    expect(all.length).toBeGreaterThanOrEqual(42);
  });

  it('所有 id 唯一且与 key 一致', () => {
    const ids = new Set<string>();
    for (const [key, def] of Object.entries(ITEMS)) {
      expect(def.id, `ITEMS[${key}].id 应等于 key`).toBe(key);
      expect(ids.has(def.id), `id 重复: ${def.id}`).toBe(false);
      ids.add(def.id);
    }
  });

  it('vip_only 物品数量 ≥ 4', () => {
    expect(vipOnlyItems().length).toBeGreaterThanOrEqual(4);
  });

  it('各 category 条目数量达标：furniture ≥ 10，其他至少 4', () => {
    expect(itemsByKind('pokeball').length).toBeGreaterThanOrEqual(4);
    expect(itemsByKind('consumable').length).toBeGreaterThanOrEqual(4);
    expect(itemsByKind('enhance').length).toBeGreaterThanOrEqual(4);
    expect(itemsByKind('evolution').length).toBeGreaterThanOrEqual(4);
    expect(itemsByKind('furniture').length).toBeGreaterThanOrEqual(10);
  });

  it('element_fruit 覆盖全部 6 个元素', () => {
    const fruits = Object.values(ITEMS).filter((i) => i.effect?.kind === 'element_fruit');
    const covered = new Set<string>();
    for (const f of fruits) {
      const el = f.effect?.elementId;
      if (typeof el === 'string') covered.add(el);
    }
    for (const el of ELEMENTS) {
      expect(covered.has(el), `element_fruit 未覆盖 ${el} 元素`).toBe(true);
    }
    expect(covered.size).toBe(ELEMENTS.length);
  });

  it('evolution 石头覆盖全部 6 个元素', () => {
    const stones = Object.values(ITEMS).filter((i) => i.effect?.kind === 'evolve');
    const covered = new Set<string>();
    for (const s of stones) {
      const el = s.effect?.elementId;
      if (typeof el === 'string') covered.add(el);
    }
    for (const el of ELEMENTS) {
      expect(covered.has(el), `evo_stone 未覆盖 ${el} 元素`).toBe(true);
    }
  });

  it('每件商品必填字段齐全：name / kind / price≥0 / description / iconColor', () => {
    for (const def of all) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.price).toBeGreaterThanOrEqual(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(typeof def.iconColor).toBe('number');
      expect(def.iconColor).toBeGreaterThanOrEqual(0);
      expect(def.kind).toBeDefined();
    }
  });

  it('getItem 按 id 查询；未知 id 返回 undefined', () => {
    expect(getItem('pokeball_normal')).toBeDefined();
    expect(getItem('does_not_exist_xyz')).toBeUndefined();
  });

  it('SHOP_TAB_LABELS 覆盖全部 7 个 Tab 且标签非空', () => {
    const expectedTabs = ['pokeball', 'consumable', 'enhance', 'evolution', 'furniture', 'limited', 'vip'];
    for (const tab of expectedTabs) {
      const label = SHOP_TAB_LABELS[tab as keyof typeof SHOP_TAB_LABELS];
      expect(label, `Tab ${tab} 标签缺失`).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('vip_only 商品至少覆盖 pokeball / consumable / furniture 三个分类', () => {
    const vipItems = vipOnlyItems();
    const kinds = new Set(vipItems.map((i) => i.kind));
    expect(kinds.has('pokeball')).toBe(true);
    expect(kinds.has('consumable')).toBe(true);
    expect(kinds.has('furniture')).toBe(true);
  });

  it('活动专属信物不进入商店目录', () => {
    const blocked = ['zeng_ming_stage2_token', 'zeng_ming_stage3_token', 'kun_chicken_token'];
    const shopIds = new Set(shopCatalogItems().map((item) => item.id));
    const evolutionShopIds = new Set(shopItemsByKind('evolution').map((item) => item.id));

    for (const id of blocked) {
      expect(ITEMS[id]?.shopAvailable).toBe(false);
      expect(shopIds.has(id), `${id} 不应在商店目录中`).toBe(false);
      expect(evolutionShopIds.has(id), `${id} 不应出现在进化道具商店页`).toBe(false);
    }
  });
});
