import { todayUtcDateString } from '@/systems/DailyQuest';

export const LIBRARY_ARCHIVE_SAVE_KEY = 'hbcc:library-archive-sort:v1';
export const LIBRARY_ARCHIVE_MINIGAME_ID = 'library_archive_sort';
export const LIBRARY_ARCHIVE_SOURCE = 'library:archive_sort';
export const LIBRARY_ARCHIVE_DAILY_REWARD_LIMIT = 2;
export const LIBRARY_ARCHIVE_TARGET_SCORE = 6;

export type LibraryArchiveCategory = 'map' | 'pet' | 'item' | 'activity';

export interface LibraryArchiveCard {
  readonly id: string;
  readonly title: string;
  readonly category: LibraryArchiveCategory;
  readonly hint: string;
}

export interface LibraryArchiveSortState {
  readonly date: string;
  readonly bestScore: number;
  readonly rewardClaims: number;
  readonly totalRuns: number;
  readonly perfectRuns: number;
}

export interface LibraryArchiveSortReward {
  readonly coins: number;
  readonly expCandy: number;
  readonly lightFruit: number;
  readonly crystalShards: number;
}

export interface LibraryArchiveSortRunResult {
  readonly next: LibraryArchiveSortState;
  readonly rewardGranted: boolean;
  readonly reward: LibraryArchiveSortReward | null;
  readonly remainingClaims: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const LIBRARY_ARCHIVE_CATEGORIES: readonly LibraryArchiveCategory[] = [
  'map',
  'pet',
  'item',
  'activity',
];

export const LIBRARY_ARCHIVE_CATEGORY_LABELS: Readonly<Record<LibraryArchiveCategory, string>> = {
  map: '地图',
  pet: '精灵',
  item: '道具',
  activity: '活动',
};

export const LIBRARY_ARCHIVE_CARD_POOL: readonly LibraryArchiveCard[] = [
  {
    id: 'center_bridge',
    title: '彩虹城中心桥位记录',
    category: 'map',
    hint: '写着道路、传送点和城中心坐标。',
  },
  {
    id: 'library_shelf',
    title: '图书馆旧书架索引',
    category: 'map',
    hint: '标注了馆内书架、档案桌和回城门。',
  },
  {
    id: 'maze_gate_route',
    title: '迷宫入口路线草图',
    category: 'map',
    hint: '是一张入口、门廊和试炼门的平面图。',
  },
  {
    id: 'energy_field_plot',
    title: '能量田采集区标尺',
    category: 'map',
    hint: '记录的是田垄、矿洞入口和采集点。',
  },
  {
    id: 'arthur_knight',
    title: '骑士亚瑟形态档案',
    category: 'pet',
    hint: '附有性格、技能和进化阶段。',
  },
  {
    id: 'leonard_gunner',
    title: '机枪手伦纳德观察页',
    category: 'pet',
    hint: '写着一只战斗精灵的招式习惯。',
  },
  {
    id: 'li_aoxiang_pig',
    title: '李奥祥猪形态速写',
    category: 'pet',
    hint: '是一张精灵外观和来源说明。',
  },
  {
    id: 'meng_lei_sword',
    title: '梦泪剑形态残页',
    category: 'pet',
    hint: '描述的是剑形态精灵，而不是装备。',
  },
  {
    id: 'exp_candy_label',
    title: '经验糖封条',
    category: 'item',
    hint: '背包里可以使用，会让精灵成长。',
  },
  {
    id: 'light_fruit_receipt',
    title: '光元素果实收据',
    category: 'item',
    hint: '是养成材料，不是一张地图。',
  },
  {
    id: 'great_ball_stamp',
    title: '高级精灵球入库章',
    category: 'item',
    hint: '补给站常见，用来捕捉野外伙伴。',
  },
  {
    id: 'crystal_shard_sample',
    title: '净化水晶样本袋',
    category: 'item',
    hint: '矿洞和试炼会带回的材料。',
  },
  {
    id: 'tide_trial_log',
    title: '潮汐试炼记分单',
    category: 'activity',
    hint: '记录分数、连击和试炼奖励。',
  },
  {
    id: 'core_relay_badge',
    title: '虹心接力活动徽章',
    category: 'activity',
    hint: '来自活动广场的小游戏记录。',
  },
  {
    id: 'casino_table_note',
    title: '彩贝桌面玩法注记',
    category: 'activity',
    hint: '写着单机小游戏额度和结算。',
  },
  {
    id: 'archive_sort_ticket',
    title: '档案修复台预约票',
    category: 'activity',
    hint: '这是一张玩法参与记录，不是材料。',
  },
];

export function normalizeLibraryArchiveSortState(
  raw: unknown,
  today: string,
): LibraryArchiveSortState {
  if (!raw || typeof raw !== 'object') return emptyLibraryArchiveSortState(today);
  const data = raw as {
    date?: unknown;
    bestScore?: unknown;
    rewardClaims?: unknown;
    totalRuns?: unknown;
    perfectRuns?: unknown;
  };
  if (data.date !== today) return emptyLibraryArchiveSortState(today);
  return {
    date: today,
    bestScore: Math.min(LIBRARY_ARCHIVE_TARGET_SCORE, clampNonNegativeInteger(data.bestScore)),
    rewardClaims: Math.min(
      LIBRARY_ARCHIVE_DAILY_REWARD_LIMIT,
      clampNonNegativeInteger(data.rewardClaims),
    ),
    totalRuns: clampNonNegativeInteger(data.totalRuns),
    perfectRuns: clampNonNegativeInteger(data.perfectRuns),
  };
}

export function readLibraryArchiveSortState(
  storage: StorageLike | null | undefined,
  now: Date = new Date(),
): LibraryArchiveSortState {
  const today = todayUtcDateString(now);
  if (!storage) return emptyLibraryArchiveSortState(today);
  const raw = storage.getItem(LIBRARY_ARCHIVE_SAVE_KEY);
  if (!raw) return emptyLibraryArchiveSortState(today);
  try {
    return normalizeLibraryArchiveSortState(JSON.parse(raw), today);
  } catch {
    return emptyLibraryArchiveSortState(today);
  }
}

export function writeLibraryArchiveSortState(
  storage: StorageLike | null | undefined,
  state: LibraryArchiveSortState,
): void {
  if (!storage) return;
  storage.setItem(LIBRARY_ARCHIVE_SAVE_KEY, JSON.stringify(state));
}

export function generateLibraryArchiveDeck(
  seedText: string,
  size = LIBRARY_ARCHIVE_TARGET_SCORE,
): LibraryArchiveCard[] {
  const targetSize = Math.min(LIBRARY_ARCHIVE_CARD_POOL.length, Math.max(1, Math.floor(size)));
  const picked = new Set<string>();
  const deck: LibraryArchiveCard[] = [];
  let seed = hashSeed(seedText);

  for (const category of LIBRARY_ARCHIVE_CATEGORIES) {
    const candidates = LIBRARY_ARCHIVE_CARD_POOL.filter((card) => card.category === category);
    seed = nextSeed(seed + category.length * 17);
    const card = candidates[seed % candidates.length];
    if (card && !picked.has(card.id)) {
      picked.add(card.id);
      deck.push(card);
    }
  }

  const shuffled = shuffleCards(LIBRARY_ARCHIVE_CARD_POOL, seedText);
  for (const card of shuffled) {
    if (deck.length >= targetSize) break;
    if (picked.has(card.id)) continue;
    picked.add(card.id);
    deck.push(card);
  }

  return shuffleCards(deck, `${seedText}:final`).slice(0, targetSize);
}

export function settleLibraryArchiveSortRun(
  score: number,
  mistakes: number,
  state: LibraryArchiveSortState,
): LibraryArchiveSortRunResult {
  const safeScore = Math.min(LIBRARY_ARCHIVE_TARGET_SCORE, clampNonNegativeInteger(score));
  const safeMistakes = clampNonNegativeInteger(mistakes);
  const perfect = safeScore >= LIBRARY_ARCHIVE_TARGET_SCORE && safeMistakes === 0;
  const baseNext: LibraryArchiveSortState = {
    ...state,
    bestScore: Math.max(state.bestScore, safeScore),
    totalRuns: state.totalRuns + 1,
    perfectRuns: state.perfectRuns + (perfect ? 1 : 0),
  };

  if (safeScore < LIBRARY_ARCHIVE_TARGET_SCORE) {
    return {
      next: baseNext,
      rewardGranted: false,
      reward: null,
      remainingClaims: remainingLibraryArchiveRewards(baseNext),
    };
  }

  if (baseNext.rewardClaims >= LIBRARY_ARCHIVE_DAILY_REWARD_LIMIT) {
    return {
      next: baseNext,
      rewardGranted: false,
      reward: null,
      remainingClaims: 0,
    };
  }

  const reward = libraryArchiveRewardForRun(safeMistakes);
  const next: LibraryArchiveSortState = {
    ...baseNext,
    rewardClaims: baseNext.rewardClaims + 1,
  };

  return {
    next,
    rewardGranted: true,
    reward,
    remainingClaims: remainingLibraryArchiveRewards(next),
  };
}

export function libraryArchiveRewardForRun(mistakes: number): LibraryArchiveSortReward {
  const safeMistakes = clampNonNegativeInteger(mistakes);
  const perfectBonus = safeMistakes === 0;
  return {
    coins: Math.max(80, 150 - safeMistakes * 16),
    expCandy: perfectBonus ? 2 : 1,
    lightFruit: safeMistakes <= 1 ? 1 : 0,
    crystalShards: perfectBonus ? 1 : 0,
  };
}

export function remainingLibraryArchiveRewards(state: LibraryArchiveSortState): number {
  return Math.max(0, LIBRARY_ARCHIVE_DAILY_REWARD_LIMIT - state.rewardClaims);
}

function emptyLibraryArchiveSortState(today: string): LibraryArchiveSortState {
  return {
    date: today,
    bestScore: 0,
    rewardClaims: 0,
    totalRuns: 0,
    perfectRuns: 0,
  };
}

function shuffleCards(cards: readonly LibraryArchiveCard[], seedText: string): LibraryArchiveCard[] {
  const out = [...cards];
  let seed = hashSeed(seedText);
  for (let index = out.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed + index * 97);
    const swapIndex = seed % (index + 1);
    const tmp = out[index];
    out[index] = out[swapIndex]!;
    out[swapIndex] = tmp!;
  }
  return out;
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextSeed(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function clampNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
