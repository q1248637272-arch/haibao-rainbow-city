import { SceneKey, type SceneKeyValue } from '@/config/GameConfig';
import { getQuest, QUESTS_MAIN } from '@/data/quests';
import type { PlayerSave, QuestDefinition } from '@/types';

import { canEvolve, requiredEvolutionItem } from './EvolutionSystem';
import { todayUtcDateString } from './DailyQuest';
import { canSubmitFarmOrder, currentFarmOrder, readFarmState } from './HomeFarm';
import { questDestinationForPendingStep, type QuestDestination } from './QuestDestinations';

export type GameplaySuggestionTone = 'urgent' | 'reward' | 'growth' | 'explore' | 'home';

export interface GameplaySuggestion {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly scene: SceneKeyValue;
  readonly sceneData?: Readonly<Record<string, unknown>>;
  readonly priority: number;
  readonly tone: GameplaySuggestionTone;
}

export interface GameplayAdvisorOptions {
  readonly save: PlayerSave;
  readonly now?: Date;
  readonly max?: number;
}

const LOW_CAPTURE_SUPPLY_THRESHOLD = 3;

export function buildGameplaySuggestions(options: GameplayAdvisorOptions): GameplaySuggestion[] {
  const now = options.now ?? new Date();
  const max = options.max ?? 3;
  const save = options.save;
  const suggestions: GameplaySuggestion[] = [];

  if (save.vip.lastCheckinDate !== todayUtcDateString(now)) {
    suggestions.push({
      id: 'checkin_today',
      title: '今日签到',
      detail: save.isVip
        ? 'VIP 奖励还没领，先拿金币和道具。'
        : vipProgressText(save.vip.checkinStreak),
      actionLabel: '去签到',
      scene: SceneKey.VIP_PANEL,
      priority: 5,
      tone: 'reward',
    });
  }

  const claimableQuestCount = Object.values(save.questStates).filter(
    (state) => state.status === 'claimable',
  ).length;
  if (claimableQuestCount > 0) {
    suggestions.push({
      id: 'claim_quests',
      title: '任务领奖',
      detail: `${claimableQuestCount} 个任务已完成，先把奖励领掉。`,
      actionLabel: '领奖励',
      scene: SceneKey.QUEST_BOARD,
      priority: 10,
      tone: 'reward',
    });
  }

  const woundedCount = save.playerPets.filter(
    (pet) => pet.currentHp < Math.ceil(pet.currentStats.hp * 0.5),
  ).length;
  if (woundedCount > 0) {
    suggestions.push({
      id: 'heal_party',
      title: '队伍恢复',
      detail: `${woundedCount} 只精灵血量偏低，回家休息更稳。`,
      actionLabel: '回家园',
      scene: SceneKey.HOME,
      priority: 18,
      tone: 'urgent',
    });
  }

  const evolvable = save.playerPets.find((pet) => {
    if (!canEvolve(pet)) return false;
    const itemId = requiredEvolutionItem(pet);
    return itemId === null || (save.inventory[itemId] ?? 0) > 0;
  });
  if (evolvable) {
    suggestions.push({
      id: 'evolve_ready',
      title: '可以进化',
      detail: `队伍里有精灵达到进化条件，战力能立刻提升。`,
      actionLabel: '去进化',
      scene: SceneKey.PET_MANAGER,
      priority: 20,
      tone: 'growth',
    });
  }

  const captureSupply = captureBallCount(save.inventory);
  if (captureSupply < LOW_CAPTURE_SUPPLY_THRESHOLD) {
    suggestions.push({
      id: 'restock_balls',
      title: '补充捕捉球',
      detail: `当前捕捉球 ${captureSupply} 个，探索前建议补货。`,
      actionLabel: '去补给',
      scene: SceneKey.SHOP,
      priority: 28,
      tone: 'urgent',
    });
  }

  if (save.playerPets.length < 3) {
    suggestions.push({
      id: 'expand_party',
      title: '扩充队伍',
      detail: `队伍只有 ${save.playerPets.length} 只，图鉴能帮你找刷新地点。`,
      actionLabel: '开图鉴',
      scene: SceneKey.PET_DEX,
      priority: 34,
      tone: 'growth',
    });
  }

  if ((save.inventory.rainbow_pet_egg ?? 0) > 0) {
    suggestions.push({
      id: 'hatch_egg',
      title: '孵化彩虹蛋',
      detail: '背包里有彩虹蛋，培育舱能孵出新伙伴。',
      actionLabel: '去孵化',
      scene: SceneKey.HOME,
      priority: 38,
      tone: 'home',
    });
  }

  if ((save.inventory.potential_seed ?? 0) > 0) {
    suggestions.push({
      id: 'train_potential',
      title: '潜能训练',
      detail: '潜能星砂可以强化个体成长，适合培养主力。',
      actionLabel: '去训练',
      scene: SceneKey.PET_MANAGER,
      priority: 42,
      tone: 'growth',
    });
  }

  const farmOrder = currentFarmOrder(readFarmState());
  if (canSubmitFarmOrder(farmOrder, (itemId) => save.inventory[itemId] ?? 0)) {
    suggestions.push({
      id: 'farm_order_ready',
      title: '农场订单',
      detail: '今日农场订单材料已凑齐，交付可换金币、经验糖和潜能星砂。',
      actionLabel: '去交付',
      scene: SceneKey.FARM,
      priority: 44,
      tone: 'home',
    });
  } else if ((save.inventory.energy_seed ?? 0) > 0 && !farmOrder.completed) {
    suggestions.push({
      id: 'farm_order_grow',
      title: '农场订单',
      detail: '背包里有能量种子，去农场种一轮，今天的订单就有进度。',
      actionLabel: '去种植',
      scene: SceneKey.FARM,
      priority: 46,
      tone: 'home',
    });
  }

  const activeDailyIds = save.dailyContext.dailyQuestIds.filter(
    (id) => save.questStates[id]?.status === 'active',
  );
  const activeDailyCount = activeDailyIds.length;
  const activeDailyFocus = findQuestFocus(activeDailyIds, save);
  if (activeDailyCount > 0 && activeDailyFocus) {
    suggestions.push({
      id: 'daily_commissions',
      title: '今日委托',
      detail: `${activeDailyFocus.quest.title} 需要去${activeDailyFocus.destination.placeLabel}完成真实互动。`,
      actionLabel: activeDailyFocus.destination.actionLabel,
      scene: activeDailyFocus.destination.scene,
      ...(activeDailyFocus.destination.sceneData !== undefined
        ? { sceneData: activeDailyFocus.destination.sceneData }
        : {}),
      priority: 48,
      tone: 'explore',
    });
  } else if (activeDailyCount > 0) {
    suggestions.push({
      id: 'daily_commissions',
      title: '今日委托',
      detail: `${activeDailyCount} 个每日委托正在进行，海滩采集、农场收成都能推进。`,
      actionLabel: '看委托',
      scene: SceneKey.QUEST_BOARD,
      priority: 48,
      tone: 'explore',
    });
  } else if (save.dailyContext.dailyQuestIds.length === 0) {
    suggestions.push({
      id: 'daily_commissions_roll',
      title: '领取今日委托',
      detail: '任务板会发布今天的探索、战斗和家园目标。',
      actionLabel: '去任务板',
      scene: SceneKey.QUEST_BOARD,
      priority: 49,
      tone: 'explore',
    });
  }

  const activeMainQuest = QUESTS_MAIN.find(
    (quest) => save.questStates[quest.id]?.status === 'active',
  );
  if (activeMainQuest) {
    const activeMainState = save.questStates[activeMainQuest.id];
    const activeMainDestination =
      activeMainState !== undefined
        ? questDestinationForPendingStep(activeMainQuest, activeMainState)
        : undefined;
    if (activeMainDestination !== undefined) {
      suggestions.push({
        id: 'main_quest',
        title: '推进主线',
        detail: `当前目标：${activeMainQuest.title}，下一步去${activeMainDestination.placeLabel}完成。`,
        actionLabel: activeMainDestination.actionLabel,
        scene: activeMainDestination.scene,
        ...(activeMainDestination.sceneData !== undefined
          ? { sceneData: activeMainDestination.sceneData }
          : {}),
        priority: 50,
        tone: 'explore',
      });
    } else {
      suggestions.push({
        id: 'main_quest',
        title: '推进主线',
        detail: `当前目标：${activeMainQuest.title}`,
        actionLabel: '看任务',
        scene: SceneKey.QUEST_BOARD,
        priority: 50,
        tone: 'explore',
      });
    }
  }

  suggestions.push({
    id: 'open_guide',
    title: '玩法总览',
    detail: '想换个方向时，查看全部玩法和一键入口。',
    actionLabel: '看导览',
    scene: SceneKey.GUIDE,
    priority: 90,
    tone: 'explore',
  });

  return suggestions
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, max));
}

function captureBallCount(inventory: Readonly<Record<string, number>>): number {
  return (
    (inventory.pokeball_normal ?? 0) +
    (inventory.pokeball_great ?? 0) +
    (inventory.pokeball_ultra ?? 0)
  );
}

function findQuestFocus(
  questIds: readonly string[],
  save: PlayerSave,
): { readonly quest: QuestDefinition; readonly destination: QuestDestination } | undefined {
  for (const questId of questIds) {
    const quest = getQuest(questId);
    const state = save.questStates[questId];
    if (quest === undefined || state === undefined) continue;
    const destination = questDestinationForPendingStep(quest, state);
    if (destination === undefined) continue;
    return { quest, destination };
  }
  return undefined;
}

function vipProgressText(checkinStreak: number): string {
  const remaining = Math.max(1, 3 - checkinStreak);
  return remaining <= 1 ? '今天签到后就能接近 VIP 奖励。' : `再签到 ${remaining} 天可拿到 VIP。`;
}
