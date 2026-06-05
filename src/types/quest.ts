/**
 * 任务系统类型声明（FEAT-300 引入，FEAT-302 / FEAT-304 消费）。
 *
 * 本文件只定义"任务是什么"与"运行时状态的 shape"，不包含状态机转换函数（在 QuestEngine）。
 * QuestDefinition 由 `src/data/quests.ts` 导出的数据表生产；
 * QuestState 由 PlayerSaveV3.questStates 持久化落盘。
 */

/**
 * 任务 id。语义化字符串，如 `main_defeat_shadow_overlord` / `daily_catch_any_3`。
 */
export type QuestId = string;

/**
 * 任务种类：
 * - `main`：主线任务。解锁顺序由 `prerequisites` 驱动，完成即永久 completed。
 * - `daily`：每日任务。UTC 0 点由 DailyQuest 纯函数刷新并重置 state。
 */
export type QuestKind = 'main' | 'daily';

/**
 * 任务四态状态机：
 * - `locked`：前置未满足，玩家看不到或看到灰色。
 * - `active`：已发布，玩家正在做。
 * - `claimable`：条件达成，等待玩家领奖。
 * - `completed`：奖励已领取，终态（每日任务 UTC 刷新时会回退到 locked/active）。
 */
export type QuestStatus = 'locked' | 'active' | 'claimable' | 'completed';

/**
 * 任务达成判据。判别联合：`kind` 字段做分派，QuestEngine 按 `kind` switch 到具体判定分支。
 *
 * 扩展新判据时：加新的字面量成员即可；QuestEngine 的 switch 必须 exhaustively 覆盖全部 kind。
 */
export type QuestCondition =
  | { readonly kind: 'defeat_boss'; readonly bossId: string }
  | { readonly kind: 'defeat_wild'; readonly count: number }
  | { readonly kind: 'defeat_trainer'; readonly count: number }
  | { readonly kind: 'capture_pet'; readonly petId: string }
  | { readonly kind: 'capture_any'; readonly count: number }
  | { readonly kind: 'hatch_pet'; readonly petId: string }
  | { readonly kind: 'hatch_any'; readonly count: number }
  | { readonly kind: 'reach_map'; readonly mapId: string }
  | { readonly kind: 'visit_any_map'; readonly count: number }
  | { readonly kind: 'spend_coins'; readonly amount: number }
  | { readonly kind: 'collect_item'; readonly itemId: string; readonly count: number }
  | {
      readonly kind: 'collect_item_from';
      readonly itemId?: string;
      readonly source: string;
      readonly count: number;
    }
  | { readonly kind: 'purchase_any'; readonly count: number }
  | { readonly kind: 'level_up'; readonly petId: string; readonly targetLevel: number }
  | { readonly kind: 'level_up_any'; readonly count: number }
  | { readonly kind: 'minigame_runs'; readonly minigameId: string; readonly count: number }
  | { readonly kind: 'minigame_score'; readonly minigameId: string; readonly targetScore: number };

/**
 * 任务奖励。QuestEngine 在玩家点击"领取"时把 `coins` / `items` 写回 PlayerState，
 * `grantVip` 用于 VIP 隐藏关完成后直接授予 VIP。
 */
export interface QuestReward {
  readonly coins?: number;
  readonly items?: ReadonlyArray<{ readonly itemId: string; readonly quantity: number }>;
  readonly grantVip?: boolean;
}

/**
 * 任务静态定义。
 */
export interface QuestDefinition {
  readonly id: QuestId;
  readonly kind: QuestKind;
  readonly title: string;
  readonly description: string;
  readonly imageKey?: string;
  readonly conditions: ReadonlyArray<QuestCondition>;
  readonly reward: QuestReward;
  /** 前置任务 id 列表。全部 completed 后本任务由 locked→active（QuestEngine 负责）。 */
  readonly prerequisites?: ReadonlyArray<QuestId>;
}

/**
 * 运行时任务状态。持久化到 PlayerSaveV3.questStates[id]。
 *
 * `progress` 为可变数值打点（"击败 shadow_overlord 3 次"记 `progress['shadow_overlord']=3`），
 * 字段键由 QuestEngine 按 condition.kind 约定；UI 直接展示数字即可。
 * `updatedAt` 用于每日任务刷新判断。
 */
export interface QuestState {
  readonly status: QuestStatus;
  readonly progress: Readonly<Record<string, number>>;
  readonly updatedAt: number;
}
