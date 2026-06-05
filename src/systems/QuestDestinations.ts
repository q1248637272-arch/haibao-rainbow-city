import { SceneKey, type SceneKeyValue } from '@/config/GameConfig';
import type { QuestCondition, QuestDefinition, QuestState } from '@/types';

export interface QuestDestination {
  readonly scene: SceneKeyValue;
  readonly sceneData?: Readonly<Record<string, unknown>>;
  readonly placeLabel: string;
  readonly actionLabel: string;
}

export function questDestinationForPendingStep(
  quest: QuestDefinition,
  state: QuestState,
): QuestDestination | undefined {
  const pendingCondition = quest.conditions.find(
    (condition) => !isConditionMetForDestination(condition, state.progress),
  );
  if (pendingCondition === undefined) return undefined;
  return destinationForCondition(pendingCondition);
}

export function destinationForCondition(condition: QuestCondition): QuestDestination | undefined {
  switch (condition.kind) {
    case 'reach_map':
      return destinationForMap(condition.mapId);
    case 'collect_item_from':
      return destinationForCollectSource(condition.source);
    case 'minigame_runs':
    case 'minigame_score':
      return destinationForMinigame(condition.minigameId);
    case 'purchase_any':
    case 'spend_coins':
      return {
        scene: SceneKey.SHOP,
        placeLabel: '商店',
        actionLabel: '去补给',
      };
    case 'hatch_any':
    case 'hatch_pet':
      return {
        scene: SceneKey.HOME,
        placeLabel: '家园培育舱',
        actionLabel: '回家园',
      };
    default:
      return undefined;
  }
}

export function isConditionMetForDestination(
  condition: QuestCondition,
  progress: Readonly<Record<string, number>>,
): boolean {
  switch (condition.kind) {
    case 'defeat_boss':
      return (progress[condition.bossId] ?? 0) >= 1;
    case 'defeat_wild':
      return (progress.defeat_wild ?? 0) >= condition.count;
    case 'defeat_trainer':
      return (progress.defeat_trainer ?? 0) >= condition.count;
    case 'capture_pet':
      return (progress[condition.petId] ?? 0) >= 1;
    case 'capture_any':
      return (progress.capture_any ?? 0) >= condition.count;
    case 'hatch_pet':
      return (progress[`hatch:${condition.petId}`] ?? 0) >= 1;
    case 'hatch_any':
      return (progress.hatch_any ?? 0) >= condition.count;
    case 'reach_map':
      return (progress[condition.mapId] ?? 0) >= 1;
    case 'visit_any_map':
      return (progress.visit_any_map ?? 0) >= condition.count;
    case 'spend_coins':
      return (progress.spend_coins ?? 0) >= condition.amount;
    case 'collect_item':
      return (progress[condition.itemId] ?? 0) >= condition.count;
    case 'collect_item_from':
      return (
        (progress[collectSourceProgressKey(condition.source, condition.itemId)] ?? 0) >=
        condition.count
      );
    case 'purchase_any':
      return (progress.purchase_any ?? 0) >= condition.count;
    case 'level_up':
      return (progress[condition.petId] ?? 0) >= 1;
    case 'level_up_any':
      return (progress.level_up_any ?? 0) >= condition.count;
    case 'minigame_runs':
      return (progress[`minigame_runs:${condition.minigameId}`] ?? 0) >= condition.count;
    case 'minigame_score':
      return (progress[`minigame_score:${condition.minigameId}`] ?? 0) >= condition.targetScore;
  }
}

function destinationForCollectSource(source: string): QuestDestination | undefined {
  switch (source) {
    case 'beach:shell_ridge':
      return {
        scene: SceneKey.BEACH,
        placeLabel: '海滩贝脊',
        actionLabel: '去海滩',
      };
    case 'beach:coral_glint':
      return {
        scene: SceneKey.BEACH,
        placeLabel: '海滩珊瑚浅滩',
        actionLabel: '去海滩',
      };
    case 'farm:harvest':
      return {
        scene: SceneKey.FARM,
        placeLabel: '家园农场',
        actionLabel: '去农场',
      };
    case 'farm:seed_crates':
      return {
        scene: SceneKey.FARM,
        placeLabel: '农场种子箱',
        actionLabel: '去农场',
      };
    case 'energy_cave:crystal_survey':
      return {
        scene: SceneKey.CRYSTAL_MINE,
        placeLabel: '水晶矿洞巡采',
        actionLabel: '去巡采',
      };
    case 'library:archive_sort':
      return {
        scene: SceneKey.LIBRARY_ARCHIVE,
        sceneData: { returnLocationId: 'library' },
        placeLabel: '图书馆档案修复台',
        actionLabel: '去修复',
      };
    case 'spaceship:core_calibration':
      return {
        scene: SceneKey.SHIP_CORE,
        sceneData: { returnLocationId: 'spaceship' },
        placeLabel: '飞船核心校准台',
        actionLabel: '去校准',
      };
    default:
      return undefined;
  }
}

function destinationForMap(mapId: string): QuestDestination | undefined {
  if (mapId === 'beach') {
    return {
      scene: SceneKey.BEACH,
      placeLabel: '海滩',
      actionLabel: '去海滩',
    };
  }
  if (mapId === 'farm') {
    return {
      scene: SceneKey.FARM,
      placeLabel: '家园农场',
      actionLabel: '去农场',
    };
  }
  if (mapId === 'home') {
    return {
      scene: SceneKey.HOME,
      placeLabel: '家园',
      actionLabel: '回家园',
    };
  }
  if (mapId === 'rainbow_city') {
    return {
      scene: SceneKey.WORLD,
      placeLabel: '彩虹城',
      actionLabel: '进城',
    };
  }
  const label = LEGACY_MAP_LABELS[mapId];
  if (label !== undefined) {
    return {
      scene: SceneKey.LEGACY_LOCATION,
      sceneData: { locationId: mapId },
      placeLabel: label,
      actionLabel: '去地点',
    };
  }
  return undefined;
}

function destinationForMinigame(minigameId: string): QuestDestination | undefined {
  if (minigameId === 'tide_trial') {
    return {
      scene: SceneKey.TIDE_TRIAL,
      placeLabel: '潮汐试炼场',
      actionLabel: '去试炼',
    };
  }
  if (minigameId === 'crystal_mine_survey') {
    return {
      scene: SceneKey.CRYSTAL_MINE,
      placeLabel: '水晶矿洞巡采',
      actionLabel: '去巡采',
    };
  }
  if (minigameId === 'library_archive_sort') {
    return {
      scene: SceneKey.LIBRARY_ARCHIVE,
      sceneData: { returnLocationId: 'library' },
      placeLabel: '图书馆档案修复台',
      actionLabel: '去修复',
    };
  }
  if (minigameId === 'ship_core_calibration') {
    return {
      scene: SceneKey.SHIP_CORE,
      sceneData: { returnLocationId: 'spaceship' },
      placeLabel: '飞船核心校准台',
      actionLabel: '去校准',
    };
  }
  if (minigameId === 'gym_badge_calibration') {
    return {
      scene: SceneKey.GYM,
      placeLabel: '徽章道馆',
      actionLabel: '去校准',
    };
  }
  if (minigameId.startsWith('activity:')) {
    return {
      scene: SceneKey.ACTIVITY,
      placeLabel: '活动广场',
      actionLabel: '去活动',
    };
  }
  return undefined;
}

function collectSourceProgressKey(source: string, itemId: string | undefined): string {
  return `collect:${source}:${itemId ?? '*'}`;
}

const LEGACY_MAP_LABELS: Readonly<Record<string, string>> = {
  center: '彩虹城中心',
  library: '图书馆',
  magic_school: '魔法学院',
  lab: '彩虹城实验室',
  maze: '迷宫',
  doll_base: '玩偶基地',
  energy_field: '能源田',
  energy_cave: '水晶矿洞',
  spaceship: '飞船内部',
  casino: '彩贝赌场',
  bath_center: '洗浴中心',
  coral_market: '珊瑚集市',
  tide_playground: '潮汐试炼场',
  star_observatory: '星辉观测台',
  storm_ruins: '风暴遗迹',
};
