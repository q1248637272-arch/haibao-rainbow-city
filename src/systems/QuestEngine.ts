import type { GameEvents } from '@/systems/EventBus';
import type {
  QuestCondition,
  QuestDefinition,
  QuestId,
  QuestReward,
  QuestState,
  QuestStatus,
} from '@/types';

/**
 * 任务状态机纯函数集合（FEAT-303）。
 *
 * 设计原则：
 * - 零副作用：所有函数都返回新的 state / states 对象，不修改入参。
 * - 不依赖 Phaser / PlayerState / EventBus 运行时，方便 Vitest 100% 覆盖。
 * - 奖励发放通过注入 `applyRewardFn` 回调，由调用方（QuestRuntime / QuestBoardScene）
 *   决定如何把奖励落盘（写 PlayerState）。
 *
 * 数据流：
 *   1. QuestRuntime 订阅 gameEvents.on('battle:victory' / 'capture:success' / ...)；
 *   2. 拿到事件后调用 `evalProgress(state, def, event)` 得到新 state；
 *   3. 如果状态变化则调用 `tryUnlock(states, defs)` 检查前置完成是否可解锁下一条；
 *   4. 写回 PlayerState.setQuestState。
 *
 *   玩家点击"领取"时：
 *   1. 调用 `claimReward(state, def, applyRewardFn)` 返回新 state（status=completed）；
 *   2. applyRewardFn(def.reward) 在内部把金币/道具/VIP 写到 PlayerState。
 */

// ---- 事件 payload 联合 --------------------------------------------------

/**
 * QuestEngine.evalProgress 接受的事件类型。
 *
 * 全部来自 GameEvents：`battle:victory` / `capture:success` / `shop:purchase` / `item:collect` / `map:enter`。
 * `kind` 字段用于判别联合分派，与 GameEvents 的 key 一一对应。
 */
export type QuestEvent =
  | ({ readonly kind: 'battle:victory' } & GameEvents['battle:victory'])
  | ({ readonly kind: 'capture:success' } & GameEvents['capture:success'])
  | ({ readonly kind: 'pet:hatch' } & GameEvents['pet:hatch'])
  | ({ readonly kind: 'shop:purchase' } & GameEvents['shop:purchase'])
  | ({ readonly kind: 'item:collect' } & GameEvents['item:collect'])
  | ({ readonly kind: 'map:enter' } & GameEvents['map:enter'])
  | ({ readonly kind: 'minigame:complete' } & GameEvents['minigame:complete']);

// ---- 初始化 -------------------------------------------------------------

/**
 * 依据任务定义表给每个任务构造初始 QuestState。
 *
 * - 主线任务（kind='main'）：
 *   - 没有 prerequisites 的 → status='active'（默认首条任务）；
 *   - 有 prerequisites 的 → status='locked'（等前置完成后由 tryUnlock 解锁）。
 * - 每日任务（kind='daily'）：默认 status='active'（发布即可做）。
 *
 * `progress` 初始为空对象，`updatedAt` 使用入参时间戳（默认 Date.now()）。
 */
export function initQuestStates(
  defs: readonly QuestDefinition[],
  now: number = Date.now(),
): Record<QuestId, QuestState> {
  const out: Record<QuestId, QuestState> = {};
  for (const def of defs) {
    const hasPrereq = def.prerequisites !== undefined && def.prerequisites.length > 0;
    const initialStatus: QuestStatus = hasPrereq ? 'locked' : 'active';
    out[def.id] = { status: initialStatus, progress: {}, updatedAt: now };
  }
  return out;
}

// ---- 进度推进 -----------------------------------------------------------

/**
 * 对单个任务施加一个事件，返回新的 QuestState（若无变化则返回与入参 shape 等价的新对象）。
 *
 * 规则：
 * - 只有 `status === 'active'` 的任务会被推进；locked / claimable / completed 直接返回原 state。
 * - 按条件的 `kind` 分派：
 *   - `defeat_boss`: 事件必须是 battle:victory 且 enemyKind='boss' 且 enemyId===bossId。
 *   - `defeat_wild`: 事件必须是 battle:victory 且 enemyKind='wild'，累计次数。
 *   - `capture_pet`: 事件必须是 capture:success 且 petId===condition.petId。
 *   - `capture_any`: 事件必须是 capture:success，任何 petId 都累加。
 *   - `reach_map`: 事件必须是 map:enter 且 mapId===condition.mapId。重复进入只算一次（置为 1）。
 *   - `visit_any_map`: 事件必须是 map:enter；每个不同 mapId 只算一次，存到 progress._visited_<mapId>=1。
 *   - `spend_coins`: 事件必须是 shop:purchase，累加 totalCost。
 *   - `collect_item`: 事件必须是 shop:purchase 或 item:collect 且 itemId===condition.itemId，累加 quantity。
 *   - `purchase_any`: 事件必须是 shop:purchase，累加次数（quantity 视为 1 次购买）。
 *   - `level_up`: 事件必须是 battle:victory 且 petId 匹配、leveledUp===true。累加 1。
 *   - `level_up_any`: 事件必须是 battle:victory 且 leveledUp===true，累加 1。
 * - 所有条件达标（progress 值 >= 目标值）时 status 变为 'claimable'；
 * - 任一条件未达标则保持 'active'。
 *
 * progress 的 key 是"语义稳定"的字符串，与 UI 展示无关。为了让重复事件不破坏
 * 去重语义（例如同一张地图进入 5 次仍然只算 1 次），reach_map 与 visit_any_map
 * 使用 `1`/`0` 标志位写入 progress['<mapId>']。
 */
export function evalProgress(
  state: QuestState,
  def: QuestDefinition,
  event: QuestEvent,
): QuestState {
  if (state.status !== 'active') return state;

  // 浅克隆 progress，避免写回入参。
  const next: Record<string, number> = { ...state.progress };
  let changed = false;

  for (const cond of def.conditions) {
    const res = applyConditionEvent(cond, next, event);
    if (res) changed = true;
  }

  if (!changed) return state;

  const allMet = def.conditions.every((c) => isConditionMet(c, next));
  const newStatus: QuestStatus = allMet ? 'claimable' : 'active';
  return {
    status: newStatus,
    progress: next,
    updatedAt: eventTimestampFallback(event),
  };
}

/**
 * 内部：把一个事件施加到单个 condition 上。返回值 true 表示 progress 有变化。
 *
 * 注意 progress 对象是本函数被允许**就地修改**的（由 evalProgress 提前浅克隆）。
 */
function applyConditionEvent(
  cond: QuestCondition,
  progress: Record<string, number>,
  event: QuestEvent,
): boolean {
  switch (cond.kind) {
    case 'defeat_boss': {
      if (event.kind !== 'battle:victory') return false;
      if (event.enemyKind !== 'boss') return false;
      if (event.enemyId !== cond.bossId) return false;
      progress[cond.bossId] = 1;
      return true;
    }
    case 'defeat_wild': {
      if (event.kind !== 'battle:victory') return false;
      if (event.enemyKind !== 'wild') return false;
      progress['defeat_wild'] = (progress['defeat_wild'] ?? 0) + 1;
      return true;
    }
    case 'defeat_trainer': {
      if (event.kind !== 'battle:victory') return false;
      if (event.enemyKind !== 'trainer') return false;
      progress['defeat_trainer'] = (progress['defeat_trainer'] ?? 0) + 1;
      return true;
    }
    case 'capture_pet': {
      if (event.kind !== 'capture:success') return false;
      if (event.petId !== cond.petId) return false;
      progress[cond.petId] = 1;
      return true;
    }
    case 'capture_any': {
      if (event.kind !== 'capture:success') return false;
      progress['capture_any'] = (progress['capture_any'] ?? 0) + 1;
      return true;
    }
    case 'hatch_pet': {
      if (event.kind !== 'pet:hatch') return false;
      if (event.petId !== cond.petId) return false;
      progress[`hatch:${cond.petId}`] = 1;
      return true;
    }
    case 'hatch_any': {
      if (event.kind !== 'pet:hatch') return false;
      progress['hatch_any'] = (progress['hatch_any'] ?? 0) + 1;
      return true;
    }
    case 'reach_map': {
      if (event.kind !== 'map:enter') return false;
      if (event.mapId !== cond.mapId) return false;
      if (progress[cond.mapId] === 1) return false; // 已到过此地图，不再重复推进
      progress[cond.mapId] = 1;
      return true;
    }
    case 'visit_any_map': {
      if (event.kind !== 'map:enter') return false;
      const key = `_visited_${event.mapId}`;
      if (progress[key] === 1) return false; // 同一张地图去重
      progress[key] = 1;
      progress['visit_any_map'] = (progress['visit_any_map'] ?? 0) + 1;
      return true;
    }
    case 'spend_coins': {
      if (event.kind !== 'shop:purchase') return false;
      progress['spend_coins'] = (progress['spend_coins'] ?? 0) + event.totalCost;
      return true;
    }
    case 'collect_item': {
      if (event.kind !== 'shop:purchase' && event.kind !== 'item:collect') return false;
      if (event.itemId !== cond.itemId) return false;
      progress[cond.itemId] = (progress[cond.itemId] ?? 0) + event.quantity;
      return true;
    }
    case 'collect_item_from': {
      if (event.kind !== 'item:collect') return false;
      if (event.source !== cond.source) return false;
      if (cond.itemId !== undefined && event.itemId !== cond.itemId) return false;
      const key = collectSourceProgressKey(cond.source, cond.itemId);
      progress[key] = (progress[key] ?? 0) + event.quantity;
      return true;
    }
    case 'purchase_any': {
      if (event.kind !== 'shop:purchase') return false;
      progress['purchase_any'] = (progress['purchase_any'] ?? 0) + 1;
      return true;
    }
    case 'level_up': {
      if (event.kind !== 'battle:victory') return false;
      if (event.leveledUp !== true) return false;
      if (event.petId !== cond.petId) return false;
      progress[cond.petId] = (progress[cond.petId] ?? 0) + 1;
      return true;
    }
    case 'level_up_any': {
      if (event.kind !== 'battle:victory') return false;
      if (event.leveledUp !== true) return false;
      progress['level_up_any'] = (progress['level_up_any'] ?? 0) + 1;
      return true;
    }
    case 'minigame_runs': {
      if (event.kind !== 'minigame:complete') return false;
      if (event.minigameId !== cond.minigameId) return false;
      const key = `minigame_runs:${cond.minigameId}`;
      progress[key] = (progress[key] ?? 0) + 1;
      return true;
    }
    case 'minigame_score': {
      if (event.kind !== 'minigame:complete') return false;
      if (event.minigameId !== cond.minigameId) return false;
      const key = `minigame_score:${cond.minigameId}`;
      progress[key] = Math.max(progress[key] ?? 0, event.score);
      return true;
    }
  }
}

/**
 * 内部：判断单个 condition 是否已达成（进度数字到了目标）。
 *
 * 对于"单击即达标"型判据（defeat_boss / capture_pet / reach_map），进度 >= 1 即达标。
 */
function isConditionMet(cond: QuestCondition, progress: Record<string, number>): boolean {
  switch (cond.kind) {
    case 'defeat_boss':
      return (progress[cond.bossId] ?? 0) >= 1;
    case 'defeat_wild':
      return (progress['defeat_wild'] ?? 0) >= cond.count;
    case 'defeat_trainer':
      return (progress['defeat_trainer'] ?? 0) >= cond.count;
    case 'capture_pet':
      return (progress[cond.petId] ?? 0) >= 1;
    case 'capture_any':
      return (progress['capture_any'] ?? 0) >= cond.count;
    case 'hatch_pet':
      return (progress[`hatch:${cond.petId}`] ?? 0) >= 1;
    case 'hatch_any':
      return (progress['hatch_any'] ?? 0) >= cond.count;
    case 'reach_map':
      return (progress[cond.mapId] ?? 0) >= 1;
    case 'visit_any_map':
      return (progress['visit_any_map'] ?? 0) >= cond.count;
    case 'spend_coins':
      return (progress['spend_coins'] ?? 0) >= cond.amount;
    case 'collect_item':
      return (progress[cond.itemId] ?? 0) >= cond.count;
    case 'collect_item_from':
      return (progress[collectSourceProgressKey(cond.source, cond.itemId)] ?? 0) >= cond.count;
    case 'purchase_any':
      return (progress['purchase_any'] ?? 0) >= cond.count;
    case 'level_up':
      return (progress[cond.petId] ?? 0) >= 1;
    case 'level_up_any':
      return (progress['level_up_any'] ?? 0) >= cond.count;
    case 'minigame_runs':
      return (progress[`minigame_runs:${cond.minigameId}`] ?? 0) >= cond.count;
    case 'minigame_score':
      return (progress[`minigame_score:${cond.minigameId}`] ?? 0) >= cond.targetScore;
  }
}

/**
 * 内部：事件没有自带时间戳，用 Date.now() 作为 fallback 填到 updatedAt。
 */
function eventTimestampFallback(_event: QuestEvent): number {
  return Date.now();
}

function collectSourceProgressKey(source: string, itemId: string | undefined): string {
  return `collect:${source}:${itemId ?? '*'}`;
}

// ---- 前置解锁 -----------------------------------------------------------

/**
 * 扫描所有 locked 任务，若其 prerequisites 全部 completed → 变为 active。
 *
 * 返回一个新的 states map（不改动入参）。
 * 支持链式：若 A 完成使 B 解锁，B 立刻变成 active 不需要二次调用；
 *           但若 B 同时也要求 C，本函数只负责单层传播——运行时一般一个任务
 *           完成即调用一次 tryUnlock，多层链会在下一个"完成事件"时自然解锁。
 */
export function tryUnlock(
  states: Readonly<Record<QuestId, QuestState>>,
  defs: readonly QuestDefinition[],
  now: number = Date.now(),
): Record<QuestId, QuestState> {
  const out: Record<QuestId, QuestState> = { ...states };
  let changedAny = true;
  // 反复扫描直到没有新解锁，支持一次性把链条全部解锁。
  while (changedAny) {
    changedAny = false;
    for (const def of defs) {
      const cur = out[def.id];
      if (!cur) continue;
      if (cur.status !== 'locked') continue;
      const prereqs = def.prerequisites ?? [];
      if (prereqs.length === 0) {
        // 理论上 initQuestStates 就把它置成 active 了，这里兜底一下。
        out[def.id] = { status: 'active', progress: { ...cur.progress }, updatedAt: now };
        changedAny = true;
        continue;
      }
      const allDone = prereqs.every((pid) => {
        const s = out[pid];
        return s !== undefined && s.status === 'completed';
      });
      if (allDone) {
        out[def.id] = { status: 'active', progress: { ...cur.progress }, updatedAt: now };
        changedAny = true;
      }
    }
  }
  return out;
}

// ---- 领取奖励 -----------------------------------------------------------

/**
 * 领取奖励。
 *
 * - 若 state.status !== 'claimable' → 直接返回原 state，不调用 applyRewardFn。
 * - 否则：调用 applyRewardFn(def.reward) 发放奖励，返回 status='completed' 的新 state。
 *
 * `applyRewardFn` 是注入点，由上层（QuestBoardScene）把 reward 写到 PlayerState。
 * 这样纯函数层不触碰 PlayerState，测试时传个 spy 函数即可断言。
 */
export function claimReward(
  state: QuestState,
  def: QuestDefinition,
  applyRewardFn: (reward: QuestReward) => void,
  now: number = Date.now(),
): QuestState {
  if (state.status !== 'claimable') return state;
  applyRewardFn(def.reward);
  return {
    status: 'completed',
    progress: { ...state.progress },
    updatedAt: now,
  };
}

/**
 * 聚合导出，便于 `import { QuestEngine } from '@/systems/QuestEngine'`。
 */
export const QuestEngine = {
  initQuestStates,
  evalProgress,
  tryUnlock,
  claimReward,
} as const;
