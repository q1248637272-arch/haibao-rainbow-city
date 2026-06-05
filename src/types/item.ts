/**
 * 物品系统类型声明（FEAT-300 引入，FEAT-303 商店与背包消费）。
 *
 * 本文件只定义"物品是什么"，不涉及购买或库存持久化（后者在 PlayerState + ShopSystem）。
 * `ItemDefinition` 由 `src/data/items.ts` 导出的数据表生产，PlayerSaveV3.inventory
 * 以 `Record<ItemId, number>` 形式落盘（value 为持有数量）。
 */

/**
 * 物品 id。语义化字符串，如 `potion_small` / `pokeball_basic` / `furniture_wooden_bed`。
 * 用 string alias 而不是硬枚举，数据表扩展时不用改类型声明。
 */
export type ItemId = string;

/**
 * 物品分类。商店与背包的 Tab 分页、任务条件判定都依赖该枚举。
 *
 * - `consumable`：消耗品（药水）。
 * - `equipment`：装备类（未来扩展，MVP 暂不上架可战斗装备）。
 * - `material`：素材（任务收集物、合成原料）。
 * - `pokeball`：精灵球系列（独立分类便于捕获系统快速拉列表）。
 * - `enhance`：强化道具（经验糖、元素果实，用于永久强化精灵）。
 * - `evolution`：进化石系列（第三阶段进化预留）。
 * - `furniture`：家具（放入家园 `homeLayout`，不可堆叠使用）。
 * - `cosmetic`：装饰性物品（VIP 头衔挂件等）。
 */
export type ItemKind =
  | 'consumable'
  | 'equipment'
  | 'material'
  | 'pokeball'
  | 'enhance'
  | 'evolution'
  | 'furniture'
  | 'cosmetic';

/**
 * 物品消耗/生效效果的判别联合。
 *
 * - `capture_bonus`：提升捕捉率（百分比，1.0 表示基础命中）。由捕捉公式读取。
 * - `heal`：恢复 HP（`value` 为具体 HP 数；99999 表示满血）。
 * - `revive`：复活倒下的精灵（`value` 为复活后的 HP 值）。
 * - `exp`：给当前队伍精灵加经验。
 * - `element_fruit`：永久提升某一元素基础攻击 `value` 点；`elementId` 必填。
 * - `evolve`：触发对应 `elementId` 元素的第三阶段进化。
 * - `furniture`：占位效果，数据表里 furniture 类的 effect 不会被消费，仅作自描述。
 */
export interface ItemEffect {
  readonly kind:
    | 'capture_bonus'
    | 'heal'
    | 'revive'
    | 'exp'
    | 'element_fruit'
    | 'evolve'
    | 'furniture';
  readonly value: number;
  readonly elementId?: string;
}

/**
 * 单件物品的静态定义。运行时库存不放这里，放 PlayerState.getInventory()。
 */
export interface ItemDefinition {
  readonly id: ItemId;
  readonly name: string;
  readonly kind: ItemKind;
  /** 基础售价（彩虹币）。每日折扣由 ShopSystem 运行时应用。 */
  readonly price: number;
  readonly description: string;
  /** VIP 专属物品：非 VIP 玩家看到但不能购买。缺省视为 false。 */
  readonly vipOnly?: boolean;
  /** 活动/任务专属信物不进入普通商店或每日限时折扣池。缺省视为 true。 */
  readonly shopAvailable?: boolean;
  /** 单格背包的最大堆叠数量。`furniture` 一般为 1，消耗品 99。缺省不限。 */
  readonly maxStack?: number;
  /** 占位图标颜色（0xRRGGBB），用于程序化绘制 Tab 图标与商品格。 */
  readonly iconColor: number;
  /** 使用效果。furniture/cosmetic 可省略；可消费类应给出。 */
  readonly effect?: ItemEffect;
}

/**
 * 商店界面允许的单次购买数量选项。UI 下拉用。
 *
 * - `1` / `10`：具体数量；
 * - `'max'`：由 UI 根据玩家金币与每日折扣展开成具体整数再下发给 ShopSystem。
 */
export type PurchaseQuantity = 1 | 10 | 'max';
