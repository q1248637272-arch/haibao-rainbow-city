import type { ItemDefinition } from '@/types';

/**
 * 商店与背包的物品数据表（FEAT-304）。
 *
 * 设计约束（见 tests/items.test.ts）：
 * - 条目总数 ≥ 42。
 * - 所有 id 在整个表中唯一。
 * - vip_only 物品 ≥ 4 件（见 pokeball_master / potion_revive / bed_vip / rainbow_arch / pet_bed_cloud）。
 * - 每个分类覆盖至少 4 件；`furniture` ≥ 10。
 * - `element_fruit_*` 覆盖全部 6 个元素：fire / water / grass / electric / normal / light。
 *
 * 文案风格：少儿简体中文，不使用生僻字、不含任何商业歌曲/艺人引用。
 */
export const ITEMS: Record<string, ItemDefinition> = {
  // ---- pokeball 系列（4 件） -------------------------------------------
  pokeball_normal: {
    id: 'pokeball_normal',
    name: '普通精灵球',
    kind: 'pokeball',
    price: 10,
    description: '最常见的精灵球，捕捉野生精灵用。',
    iconColor: 0xff4b5c,
    effect: { kind: 'capture_bonus', value: 1 },
  },
  pokeball_great: {
    id: 'pokeball_great',
    name: '高级精灵球',
    kind: 'pokeball',
    price: 50,
    description: '捕捉率更高的精灵球，+15% 成功率。',
    iconColor: 0x3aa0ff,
    effect: { kind: 'capture_bonus', value: 1.15 },
  },
  pokeball_ultra: {
    id: 'pokeball_ultra',
    name: '超级精灵球',
    kind: 'pokeball',
    price: 200,
    description: '闪着金光的精灵球，+30% 成功率。',
    iconColor: 0xffd93d,
    effect: { kind: 'capture_bonus', value: 1.3 },
  },
  pokeball_master: {
    id: 'pokeball_master',
    name: '大师精灵球',
    kind: 'pokeball',
    price: 2000,
    description: 'VIP 专属，必定命中任何野生精灵。',
    vipOnly: true,
    iconColor: 0xcc4bff,
    effect: { kind: 'capture_bonus', value: 999 },
  },

  // ---- consumable 药水系列（4 件） --------------------------------------
  potion_small: {
    id: 'potion_small',
    name: '小伤药',
    kind: 'consumable',
    price: 30,
    description: '恢复一只精灵 50 点体力。',
    iconColor: 0xff9ec7,
    effect: { kind: 'heal', value: 50 },
  },
  potion_medium: {
    id: 'potion_medium',
    name: '中伤药',
    kind: 'consumable',
    price: 80,
    description: '恢复一只精灵 120 点体力。',
    iconColor: 0xff6b9a,
    effect: { kind: 'heal', value: 120 },
  },
  potion_large: {
    id: 'potion_large',
    name: '大伤药',
    kind: 'consumable',
    price: 150,
    description: '把一只精灵的体力补到满。',
    iconColor: 0xff3b6f,
    effect: { kind: 'heal', value: 99999 },
  },
  potion_revive: {
    id: 'potion_revive',
    name: '复活药',
    kind: 'consumable',
    price: 300,
    description: 'VIP 专属，让倒下的精灵重新站起来。',
    vipOnly: true,
    iconColor: 0xffd93d,
    effect: { kind: 'revive', value: 50 },
  },

  // ---- enhance 强化道具（8 件：2 糖 + 6 元素果实） ------------------------
  exp_candy: {
    id: 'exp_candy',
    name: '经验糖',
    kind: 'enhance',
    price: 100,
    description: '吃下去能立刻获得 200 点经验。',
    iconColor: 0xffcc4b,
    effect: { kind: 'exp', value: 200 },
  },
  exp_cake: {
    id: 'exp_cake',
    name: '经验蛋糕',
    kind: 'enhance',
    price: 500,
    description: '甜甜的大蛋糕，一次获得 1000 点经验。',
    iconColor: 0xffaa4b,
    effect: { kind: 'exp', value: 1000 },
  },
  potential_seed: {
    id: 'potential_seed',
    name: '潜能星砂',
    kind: 'enhance',
    price: 260,
    description: '给精灵做潜能训练，随机提高一项较低天赋。',
    iconColor: 0xb48cff,
  },
  element_fruit_fire: {
    id: 'element_fruit_fire',
    name: '红焰果',
    kind: 'enhance',
    price: 400,
    description: '火元素永久提升 5 点基础攻击。',
    iconColor: 0xff6b35,
    effect: { kind: 'element_fruit', value: 5, elementId: 'fire' },
  },
  element_fruit_water: {
    id: 'element_fruit_water',
    name: '蓝波果',
    kind: 'enhance',
    price: 400,
    description: '水元素永久提升 5 点基础攻击。',
    iconColor: 0x3aa0ff,
    effect: { kind: 'element_fruit', value: 5, elementId: 'water' },
  },
  element_fruit_grass: {
    id: 'element_fruit_grass',
    name: '嫩叶果',
    kind: 'enhance',
    price: 400,
    description: '草元素永久提升 5 点基础攻击。',
    iconColor: 0x4cc26b,
    effect: { kind: 'element_fruit', value: 5, elementId: 'grass' },
  },
  element_fruit_electric: {
    id: 'element_fruit_electric',
    name: '雷鸣果',
    kind: 'enhance',
    price: 400,
    description: '电元素永久提升 5 点基础攻击。',
    iconColor: 0xffd93d,
    effect: { kind: 'element_fruit', value: 5, elementId: 'electric' },
  },
  element_fruit_normal: {
    id: 'element_fruit_normal',
    name: '柔光果',
    kind: 'enhance',
    price: 400,
    description: '普通元素永久提升 5 点基础攻击。',
    iconColor: 0xcccccc,
    effect: { kind: 'element_fruit', value: 5, elementId: 'normal' },
  },
  element_fruit_light: {
    id: 'element_fruit_light',
    name: '彩虹果',
    kind: 'enhance',
    price: 400,
    description: '光元素永久提升 5 点基础攻击。',
    iconColor: 0xffc0ff,
    effect: { kind: 'element_fruit', value: 5, elementId: 'light' },
  },

  // ---- evolution 进化石（6 件） ----------------------------------------
  evo_stone_fire: {
    id: 'evo_stone_fire',
    name: '火焰进化石',
    kind: 'evolution',
    price: 800,
    description: '火系精灵满足条件时，用它触发终极进化。',
    iconColor: 0xff6b35,
    effect: { kind: 'evolve', value: 1, elementId: 'fire' },
  },
  evo_stone_water: {
    id: 'evo_stone_water',
    name: '水波进化石',
    kind: 'evolution',
    price: 800,
    description: '水系精灵满足条件时，用它触发终极进化。',
    iconColor: 0x3aa0ff,
    effect: { kind: 'evolve', value: 1, elementId: 'water' },
  },
  evo_stone_grass: {
    id: 'evo_stone_grass',
    name: '翠叶进化石',
    kind: 'evolution',
    price: 800,
    description: '草系精灵满足条件时，用它触发终极进化。',
    iconColor: 0x4cc26b,
    effect: { kind: 'evolve', value: 1, elementId: 'grass' },
  },
  evo_stone_electric: {
    id: 'evo_stone_electric',
    name: '雷光进化石',
    kind: 'evolution',
    price: 800,
    description: '电系精灵满足条件时，用它触发终极进化。',
    iconColor: 0xffd93d,
    effect: { kind: 'evolve', value: 1, elementId: 'electric' },
  },
  evo_stone_normal: {
    id: 'evo_stone_normal',
    name: '柔光进化石',
    kind: 'evolution',
    price: 800,
    description: '普通系精灵满足条件时，用它触发终极进化。',
    iconColor: 0xaaaaaa,
    effect: { kind: 'evolve', value: 1, elementId: 'normal' },
  },
  evo_stone_light: {
    id: 'evo_stone_light',
    name: '彩虹进化石',
    kind: 'evolution',
    price: 800,
    description: '光系精灵满足条件时，用它触发终极进化。',
    iconColor: 0xff8ff0,
    effect: { kind: 'evolve', value: 1, elementId: 'light' },
  },
  zeng_ming_stage2_token: {
    id: 'zeng_ming_stage2_token',
    name: '疾羽信物',
    kind: 'evolution',
    price: 0,
    description: '曾鸣进化到第二形态需要的蓝羽信物，通过“乐乐的诱惑”活动获得。',
    shopAvailable: false,
    iconColor: 0x48c8ff,
    effect: { kind: 'evolve', value: 1, elementId: 'electric' },
  },
  zeng_ming_stage3_token: {
    id: 'zeng_ming_stage3_token',
    name: '饭香玄羽',
    kind: 'evolution',
    price: 0,
    description: '曾鸣进化到第三形态需要的最终信物，通过“前女友的饭”活动获得。',
    shopAvailable: false,
    iconColor: 0x1e8cff,
    effect: { kind: 'evolve', value: 1, elementId: 'electric' },
  },

  // ---- material 旧版采集素材（5 件） --------------------------------------
  crystal_shard: {
    id: 'crystal_shard',
    name: '净化水晶',
    kind: 'material',
    price: 0,
    description: '从水晶矿洞采到的亮晶晶碎片，可用于旧版净化活动。',
    iconColor: 0x8fe8ff,
  },
  energy_seed: {
    id: 'energy_seed',
    name: '能源种子',
    kind: 'material',
    price: 0,
    description: '芳草地能源田里采集到的小种子，带着微弱彩光。',
    iconColor: 0x7bd66f,
  },
  rainbow_pet_egg: {
    id: 'rainbow_pet_egg',
    name: '彩虹精灵蛋',
    kind: 'material',
    price: 0,
    description: '培育屋活动获得的神秘精灵蛋，放进家园培育舱后可以孵化。',
    iconColor: 0xffd6ff,
  },
  angel_chest: {
    id: 'angel_chest',
    name: '天使宝箱',
    kind: 'material',
    price: 0,
    description: '旧版活动里的神秘宝箱，打开前先好好收藏。',
    iconColor: 0xfff2a8,
  },
  repair_chip: {
    id: 'repair_chip',
    name: '飞船芯片',
    kind: 'material',
    price: 0,
    description: '修复飞船时找到的旧零件，边角还闪着蓝光。',
    iconColor: 0x69c8ff,
  },
  gold_shell: {
    id: 'gold_shell',
    name: '金贝壳',
    kind: 'material',
    price: 0,
    description: '旧版劳动玩法的纪念贝壳，攒起来很有成就感。',
    iconColor: 0xffc94a,
  },
  kun_chicken_token: {
    id: 'kun_chicken_token',
    name: '鸡形态信物',
    kind: 'material',
    price: 0,
    description: '完成“鸡你太美”活动获得的金色信物，可让蔡徐坤成年体进化为神·蔡徐坤。',
    shopAvailable: false,
    iconColor: 0xffd93d,
  },

  // ---- furniture 家具（22 件，含 3 件 vip_only） ------------------------
  wallpaper_blue: {
    id: 'wallpaper_blue',
    name: '蓝色壁纸',
    kind: 'furniture',
    price: 200,
    description: '像夏日海浪的浅蓝色壁纸。',
    iconColor: 0x88c8ff,
    effect: { kind: 'furniture', value: 0 },
  },
  wallpaper_pink: {
    id: 'wallpaper_pink',
    name: '粉色壁纸',
    kind: 'furniture',
    price: 200,
    description: '甜甜的草莓牛奶色。',
    iconColor: 0xffb6d1,
    effect: { kind: 'furniture', value: 0 },
  },
  wallpaper_yellow: {
    id: 'wallpaper_yellow',
    name: '黄色壁纸',
    kind: 'furniture',
    price: 200,
    description: '阳光洒满房间的暖黄色。',
    iconColor: 0xffe48a,
    effect: { kind: 'furniture', value: 0 },
  },
  wallpaper_rainbow: {
    id: 'wallpaper_rainbow',
    name: '彩虹壁纸',
    kind: 'furniture',
    price: 200,
    description: '七色条纹，像把彩虹挂在墙上。',
    iconColor: 0xff9ec7,
    effect: { kind: 'furniture', value: 0 },
  },
  floor_wood: {
    id: 'floor_wood',
    name: '木地板',
    kind: 'furniture',
    price: 200,
    description: '暖黄色木地板，踩上去软软的。',
    iconColor: 0xc69c6d,
    effect: { kind: 'furniture', value: 0 },
  },
  floor_stone: {
    id: 'floor_stone',
    name: '石地板',
    kind: 'furniture',
    price: 200,
    description: '结实的青石地板，凉凉的。',
    iconColor: 0x8a8a9a,
    effect: { kind: 'furniture', value: 0 },
  },
  floor_sand: {
    id: 'floor_sand',
    name: '沙滩地板',
    kind: 'furniture',
    price: 200,
    description: '把海滨的沙子搬回家吧！',
    iconColor: 0xf6d58a,
    effect: { kind: 'furniture', value: 0 },
  },
  floor_grass: {
    id: 'floor_grass',
    name: '草坪地板',
    kind: 'furniture',
    price: 200,
    description: '踩上去毛茸茸的草坪。',
    iconColor: 0x7cc26b,
    effect: { kind: 'furniture', value: 0 },
  },
  sofa_red: {
    id: 'sofa_red',
    name: '红色沙发',
    kind: 'furniture',
    price: 500,
    description: '像熟透的番茄一样的柔软沙发。',
    iconColor: 0xd94b4b,
    effect: { kind: 'furniture', value: 0 },
  },
  sofa_blue: {
    id: 'sofa_blue',
    name: '蓝色沙发',
    kind: 'furniture',
    price: 500,
    description: '像海洋色的舒服沙发。',
    iconColor: 0x4b7fd9,
    effect: { kind: 'furniture', value: 0 },
  },
  table_wood: {
    id: 'table_wood',
    name: '木桌子',
    kind: 'furniture',
    price: 300,
    description: '朴素的圆木桌，可以摆一壶茶。',
    iconColor: 0xb88a5a,
    effect: { kind: 'furniture', value: 0 },
  },
  table_stone: {
    id: 'table_stone',
    name: '石桌子',
    kind: 'furniture',
    price: 400,
    description: '敦实的青石桌，下棋聊天都合适。',
    iconColor: 0x7a7a88,
    effect: { kind: 'furniture', value: 0 },
  },
  bed_small: {
    id: 'bed_small',
    name: '小床',
    kind: 'furniture',
    price: 600,
    description: '刚好够一只精灵窝着睡大觉。',
    iconColor: 0xffcc99,
    effect: { kind: 'furniture', value: 0 },
  },
  bed_vip: {
    id: 'bed_vip',
    name: 'VIP 大床',
    kind: 'furniture',
    price: 1000,
    description: 'VIP 专属，棉花糖做成的大床。',
    vipOnly: true,
    iconColor: 0xff9ec7,
    effect: { kind: 'furniture', value: 0 },
  },
  plant_small: {
    id: 'plant_small',
    name: '小盆栽',
    kind: 'furniture',
    price: 100,
    description: '一株在眨眼的小绿苗。',
    iconColor: 0x6ec26b,
    effect: { kind: 'furniture', value: 0 },
  },
  plant_big: {
    id: 'plant_big',
    name: '大盆栽',
    kind: 'furniture',
    price: 300,
    description: '一棵迷你小树，郁郁葱葱。',
    iconColor: 0x4c8c4b,
    effect: { kind: 'furniture', value: 0 },
  },
  lamp_lantern: {
    id: 'lamp_lantern',
    name: '灯笼',
    kind: 'furniture',
    price: 250,
    description: '一盏暖暖的小灯笼。',
    iconColor: 0xffbb55,
    effect: { kind: 'furniture', value: 0 },
  },
  rainbow_arch: {
    id: 'rainbow_arch',
    name: '彩虹拱门',
    kind: 'furniture',
    price: 800,
    description: 'VIP 专属，一座迷你彩虹桥。',
    vipOnly: true,
    iconColor: 0xff66cc,
    effect: { kind: 'furniture', value: 0 },
  },
  pet_bed_cloud: {
    id: 'pet_bed_cloud',
    name: '云朵宠物床',
    kind: 'furniture',
    price: 450,
    description: 'VIP 专属，像踩在云上一样的精灵床。',
    vipOnly: true,
    iconColor: 0xeaf0ff,
    effect: { kind: 'furniture', value: 0 },
  },
  rug_rainbow: {
    id: 'rug_rainbow',
    name: '彩虹地毯',
    kind: 'furniture',
    price: 350,
    description: '七色条纹的毛茸茸地毯。',
    iconColor: 0xff8fa3,
    effect: { kind: 'furniture', value: 0 },
  },
  curtain_star: {
    id: 'curtain_star',
    name: '星星窗帘',
    kind: 'furniture',
    price: 280,
    description: '印着小星星的蓝色窗帘。',
    iconColor: 0x4060a0,
    effect: { kind: 'furniture', value: 0 },
  },
  toy_chest: {
    id: 'toy_chest',
    name: '玩具箱',
    kind: 'furniture',
    price: 320,
    description: '装满小玩具的木头箱子。',
    iconColor: 0xa87040,
    effect: { kind: 'furniture', value: 0 },
  },
} as const;

/**
 * 以 id 索引一件物品。未命中返回 undefined（noUncheckedIndexedAccess 下类型一致）。
 */
export function getItem(id: string): ItemDefinition | undefined {
  return ITEMS[id];
}

/**
 * 商店 Tab 分类枚举（UI 用）。`limited` Tab 动态展示每日折扣；`vip` Tab 汇总 vip_only 商品。
 */
export type ShopTab =
  | 'pokeball'
  | 'consumable'
  | 'enhance'
  | 'evolution'
  | 'furniture'
  | 'limited'
  | 'vip';

/**
 * 每个 Tab 的中文标签。用于 ShopScene 绘制 Tab 标题。
 */
export const SHOP_TAB_LABELS: Record<ShopTab, string> = {
  pokeball: '精灵球',
  consumable: '恢复药品',
  enhance: '强化道具',
  evolution: '进化道具',
  furniture: '家具装扮',
  limited: '限时商品',
  vip: 'VIP 专属',
};

/**
 * 依 Tab 过滤商品列表（不含 `limited` / `vip` 两个动态 Tab）。
 *
 * - `limited`：由 ShopScene 调用方自行从 dailyContext.shopDiscountIds 解析；
 * - `vip`：由调用方用 `item.vipOnly === true` 过滤全表。
 */
export function itemsByKind(kind: ItemDefinition['kind']): ItemDefinition[] {
  return Object.values(ITEMS).filter((it) => it.kind === kind);
}

export function isShopAvailableItem(item: ItemDefinition): boolean {
  return item.shopAvailable !== false;
}

export function shopItemsByKind(kind: ItemDefinition['kind']): ItemDefinition[] {
  return Object.values(ITEMS).filter((it) => it.kind === kind && isShopAvailableItem(it));
}

export function shopCatalogItems(): ItemDefinition[] {
  return Object.values(ITEMS).filter(isShopAvailableItem);
}

/**
 * 取所有 vip_only 商品。
 */
export function vipOnlyItems(): ItemDefinition[] {
  return Object.values(ITEMS).filter((it) => it.vipOnly === true);
}

export function shopVipOnlyItems(): ItemDefinition[] {
  return Object.values(ITEMS).filter((it) => it.vipOnly === true && isShopAvailableItem(it));
}
