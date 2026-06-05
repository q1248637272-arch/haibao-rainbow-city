import { QUESTS_ALL, QUESTS_MAIN } from '@/data/quests';
import { gameEvents } from '@/systems/EventBus';
import { PlayerState } from '@/systems/PlayerState';
import { QuestEngine, type QuestEvent } from '@/systems/QuestEngine';
import type { QuestDefinition, QuestId, QuestState } from '@/types';

/**
 * 任务运行时（FEAT-303，Phaser 依赖侧）。
 *
 * 职责：
 * - 在 Game 启动后订阅 gameEvents 的 battle:victory / capture:success / shop:purchase / map:enter；
 * - 把事件 payload 喂给 QuestEngine.evalProgress + tryUnlock；
 * - 变化后 persist 到 PlayerState.setQuestState；
 * - 暴露 `detach()` 以便单元测试/场景销毁时解绑。
 *
 * 单例 + 幂等：多次调用 attach 只会保留最后一次注册的 handle。PlayerState 在
 * 首次进入任何场景时若 questStates 为空，会由本模块补一次 initQuestStates（主线 +
 * 当前 dailyContext.dailyQuestIds）。
 */

/** 当前是否已经挂载的标记；用来让 attach 幂等。 */
let mountedHandle: QuestRuntimeHandle | null = null;

/** attach 返回值：提供 detach 方法解绑所有事件监听。 */
export interface QuestRuntimeHandle {
  /** 解绑所有事件监听器。幂等。 */
  detach(): void;
}

/**
 * 取当前已知的任务定义集合：主线全部 + `dailyContext.dailyQuestIds` 指向的每日任务。
 *
 * 不在 pool 里但已经在 questStates 中存在的每日任务（例如昨天发布但今天已被刷新掉的）
 * 也会一并纳入，避免历史进度被丢失；但这些任务不会再出现在"当前任务板"。
 */
function collectActiveDefs(): QuestDefinition[] {
  const result: QuestDefinition[] = [...QUESTS_MAIN];
  const dailyIds = PlayerState.getDailyContext().dailyQuestIds;
  for (const id of dailyIds) {
    const def = QUESTS_ALL.find((q) => q.id === id);
    if (def && !result.find((r) => r.id === def.id)) {
      result.push(def);
    }
  }
  // 如果存档里还持有其它任务的 state，也纳入遍历，避免旧状态永远不推进。
  const states = PlayerState.snapshot().questStates;
  for (const id of Object.keys(states)) {
    if (!result.find((r) => r.id === id)) {
      const def = QUESTS_ALL.find((q) => q.id === id);
      if (def) result.push(def);
    }
  }
  return result;
}

/**
 * 确保 PlayerState.questStates 中主线任务都已经有初始状态。
 *
 * 对于"老存档升级过来但 questStates 为空"的情况，会自动补上 initQuestStates 的结果。
 * 不会覆盖已有进度。
 */
function ensureInitialStates(defs: readonly QuestDefinition[], now: number): void {
  const existing = PlayerState.snapshot().questStates;
  const initial = QuestEngine.initQuestStates(defs, now);
  for (const id of Object.keys(initial)) {
    if (existing[id] === undefined) {
      const s = initial[id];
      if (s) PlayerState.setQuestState(id, s);
    }
  }
}

/**
 * 把事件施加到所有当前可见任务。单次循环完成"推进 + 持久化 + 解锁扩散"。
 */
function processEvent(event: QuestEvent): void {
  const defs = collectActiveDefs();
  const before = PlayerState.snapshot().questStates;

  // 先逐条推进。
  const after: Record<QuestId, QuestState> = {};
  let anyChanged = false;
  for (const def of defs) {
    const cur = before[def.id];
    if (!cur) continue;
    const next = QuestEngine.evalProgress(cur, def, event);
    after[def.id] = next;
    if (next !== cur) anyChanged = true;
  }

  if (!anyChanged) return;

  // 持久化每一条变化的任务。
  for (const def of defs) {
    const cur = before[def.id];
    const nx = after[def.id];
    if (cur && nx && nx !== cur) {
      PlayerState.setQuestState(def.id, nx);
    }
  }

  // 若事件让某条主线变 completed，这里不会发生（completed 只能由 claimReward 产生）；
  // 但 claimable 可能解锁后续，我们在每次事件处理后都跑一次 tryUnlock。
  // 注意：tryUnlock 只在 completed 时解锁 prereq；进度推到 claimable 不会触发下一条 active。
  const currentStates = PlayerState.snapshot().questStates;
  const unlocked = QuestEngine.tryUnlock(currentStates, defs);
  for (const id of Object.keys(unlocked)) {
    const prev = currentStates[id];
    const nx = unlocked[id];
    if (prev && nx && prev !== nx && prev.status !== nx.status) {
      PlayerState.setQuestState(id, nx);
    }
  }
}

/**
 * 挂载 QuestRuntime 到全局事件总线。
 *
 * - 幂等：再次 attach 会先 detach 上一轮再注册新一轮。
 * - 返回 handle，可以在场景销毁时调用 detach()。
 */
export function attachQuestRuntime(now: number = Date.now()): QuestRuntimeHandle {
  if (mountedHandle !== null) {
    mountedHandle.detach();
  }

  ensureInitialStates(collectActiveDefs(), now);

  const onBattle = (payload: {
    enemyId: string;
    enemyKind: 'boss' | 'wild' | 'trainer';
    petId: string;
    leveledUp?: boolean;
  }): void => {
    processEvent({ kind: 'battle:victory', ...payload });
  };
  const onCapture = (payload: { petId: string }): void => {
    processEvent({ kind: 'capture:success', ...payload });
  };
  const onHatch = (payload: { petId: string }): void => {
    processEvent({ kind: 'pet:hatch', ...payload });
  };
  const onShop = (payload: { itemId: string; quantity: number; totalCost: number }): void => {
    processEvent({ kind: 'shop:purchase', ...payload });
  };
  const onItemCollect = (payload: { itemId: string; quantity: number; source: string }): void => {
    processEvent({ kind: 'item:collect', ...payload });
  };
  const onMap = (payload: { mapId: string }): void => {
    processEvent({ kind: 'map:enter', ...payload });
  };
  const onMinigame = (payload: { minigameId: string; score: number }): void => {
    processEvent({ kind: 'minigame:complete', ...payload });
  };

  gameEvents.on('battle:victory', onBattle);
  gameEvents.on('capture:success', onCapture);
  gameEvents.on('pet:hatch', onHatch);
  gameEvents.on('shop:purchase', onShop);
  gameEvents.on('item:collect', onItemCollect);
  gameEvents.on('map:enter', onMap);
  gameEvents.on('minigame:complete', onMinigame);

  const handle: QuestRuntimeHandle = {
    detach(): void {
      gameEvents.off('battle:victory', onBattle);
      gameEvents.off('capture:success', onCapture);
      gameEvents.off('pet:hatch', onHatch);
      gameEvents.off('shop:purchase', onShop);
      gameEvents.off('item:collect', onItemCollect);
      gameEvents.off('map:enter', onMap);
      gameEvents.off('minigame:complete', onMinigame);
      if (mountedHandle === handle) mountedHandle = null;
    },
  };
  mountedHandle = handle;
  return handle;
}

/**
 * 把 QuestReward 应用到 PlayerState（金币 / 物品 / VIP）。
 *
 * QuestBoardScene 的"领取"按钮走 QuestEngine.claimReward(state, def, applyReward)。
 */
export function applyQuestReward(reward: {
  coins?: number;
  items?: ReadonlyArray<{ itemId: string; quantity: number }>;
  grantVip?: boolean;
}): void {
  if (typeof reward.coins === 'number' && reward.coins > 0) {
    PlayerState.addCoins(reward.coins);
  }
  if (reward.items) {
    for (const entry of reward.items) {
      if (entry.quantity > 0) {
        PlayerState.addItem(entry.itemId, entry.quantity);
      }
    }
  }
  if (reward.grantVip === true && !PlayerState.isVip()) {
    PlayerState.grantVip();
  }
}
