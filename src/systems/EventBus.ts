/**
 * 类型化事件总线（mitt 风格，不引入外部依赖）。
 *
 * 用法：
 * ```
 * gameEvents.on('player:vip', () => { ... });
 * gameEvents.emit('save:updated');
 * gameEvents.emit('battle:victory', { enemyId: 'shadow_overlord', enemyKind: 'boss', petId: 'flame_puppy' });
 * ```
 */

/**
 * 全局事件签名表。key 为事件名，value 为 payload 类型。
 * payload 为 void 的事件不需要（也不应该）传参。
 *
 * FEAT-300 新增：
 * - `battle:victory` 战斗胜利（由 BattleScene 派发，QuestEngine / VipSystem 订阅做任务推进）。
 * - `capture:success` 捕获成功（由 BattleScene 的捕获分支派发）。
 * - `shop:purchase` 商店购买成功（由 ShopSystem 派发）。
 * - `item:collect` 场景内采集 / 小游戏结算获得材料（由具体玩法派发）。
 * - `map:enter` 进入某张地图（由各 Scene 的 create() 派发）。
 */
export type GameEvents = {
  'player:vip': void;
  'save:updated': void;
  'battle:victory': {
    /** 敌方 id（boss 则为 BossData.id，野怪则为 PetData.id）。 */
    readonly enemyId: string;
    /** 敌方类别：boss 或野怪，用于任务判据区分。 */
    readonly enemyKind: 'boss' | 'wild' | 'trainer';
    /** 本场战斗上场并最终留到胜利的玩家精灵 id（用于 level_up 任务）。 */
    readonly petId: string;
    /** 本场战斗是否触发了至少一次升级。由 BattleScene 在胜利分发 exp 后填入。 */
    readonly leveledUp?: boolean;
  };
  'capture:success': {
    /** 刚被抓到的精灵 id（存入队伍后发出）。 */
    readonly petId: string;
  };
  'pet:hatch': {
    /** 刚从家园培育舱孵化的精灵 id。 */
    readonly petId: string;
  };
  'shop:purchase': {
    readonly itemId: string;
    readonly quantity: number;
    /** 本次购买总花费（已应用折扣）。 */
    readonly totalCost: number;
  };
  'item:collect': {
    readonly itemId: string;
    readonly quantity: number;
    readonly source: string;
  };
  'map:enter': {
    /** 进入的地图 id（对应 maps.ts 数据表）。 */
    readonly mapId: string;
  };
  'minigame:complete': {
    readonly minigameId: string;
    readonly score: number;
  };
};

type Handler<T> = T extends void ? () => void : (payload: T) => void;

type HandlerMap<Events extends Record<string, unknown>> = {
  [K in keyof Events]?: Set<Handler<Events[K]>>;
};

/**
 * 最小类型化事件总线实现。
 */
export class EventBus<Events extends Record<string, unknown>> {
  private readonly handlers: HandlerMap<Events> = {};

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    let set = this.handlers[event];
    if (!set) {
      set = new Set();
      this.handlers[event] = set;
    }
    set.add(handler);
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    const set = this.handlers[event];
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      delete this.handlers[event];
    }
  }

  /**
   * 触发事件。对于 payload 为 void 的事件，不要传第二个参数。
   */
  emit<K extends keyof Events>(
    event: K,
    ...args: Events[K] extends void ? [] : [payload: Events[K]]
  ): void {
    const set = this.handlers[event];
    if (!set) return;
    // 克隆一份以避免回调在迭代过程中修改集合。
    const snapshot = Array.from(set);
    const payload = args[0] as Events[K];
    for (const handler of snapshot) {
      (handler as (p: Events[K]) => void)(payload);
    }
  }

  /**
   * 清空所有监听器（主要给测试用）。
   */
  clear(): void {
    for (const key of Object.keys(this.handlers) as (keyof Events)[]) {
      delete this.handlers[key];
    }
  }
}

/**
 * 全局游戏事件总线单例。
 */
export const gameEvents: EventBus<GameEvents> = new EventBus<GameEvents>();
