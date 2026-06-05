import { SceneKey, type SceneKeyValue } from '@/config/GameConfig';

export const GAMEPLAY_GUIDE_SEEN_KEY = 'hbcc:gameplay-guide-seen:v1';

export type GameplayGuideCategoryId = 'daily' | 'growth' | 'adventure' | 'home';

export interface GameplayGuideCategory {
  readonly id: GameplayGuideCategoryId;
  readonly title: string;
  readonly subtitle: string;
  readonly accent: number;
}

export interface GameplayGuideEntry {
  readonly id: string;
  readonly categoryId: GameplayGuideCategoryId;
  readonly title: string;
  readonly summary: string;
  readonly rewardHint: string;
  readonly actionLabel: string;
  readonly scene: SceneKeyValue;
  readonly sceneData?: Readonly<Record<string, unknown>>;
  readonly priority: number;
  readonly badge?: string;
  readonly accent: number;
}

export const GAMEPLAY_GUIDE_CATEGORIES: readonly GameplayGuideCategory[] = [
  {
    id: 'daily',
    title: '今日必做',
    subtitle: '上线先拿稳定奖励，再挑活动推进。',
    accent: 0xffd85a,
  },
  {
    id: 'growth',
    title: '精灵养成',
    subtitle: '收集、查看踪迹、孵蛋、培养性格与潜能。',
    accent: 0x65d6ff,
  },
  {
    id: 'adventure',
    title: '冒险挑战',
    subtitle: '按推荐等级探索地图、挑战道馆与试炼。',
    accent: 0xff6fae,
  },
  {
    id: 'home',
    title: '家园经营',
    subtitle: '种植、孵化、开宝箱，把家园变成补给基地。',
    accent: 0x9ae66e,
  },
] as const;

export const GAMEPLAY_GUIDE_ENTRIES: readonly GameplayGuideEntry[] = [
  {
    id: 'checkin',
    categoryId: 'daily',
    title: '签到领大奖',
    summary: '每天领奖励，第三天解锁 VIP，第一天还有 15 级野生精灵。',
    rewardHint: '金币、道具、VIP、稀有精灵',
    actionLabel: '去签到',
    scene: SceneKey.VIP_PANEL,
    priority: 10,
    badge: '必点',
    accent: 0xffd85a,
  },
  {
    id: 'daily_quests',
    categoryId: 'daily',
    title: '任务板',
    summary: '主线和每日任务都会记录真实进度，适合不知道做什么时查看。',
    rewardHint: '彩虹币、进化材料、补给',
    actionLabel: '看任务',
    scene: SceneKey.QUEST_BOARD,
    priority: 20,
    badge: '路线',
    accent: 0xff9b54,
  },
  {
    id: 'events',
    categoryId: 'daily',
    title: '活动广场',
    summary: '篮球、鸡你太美、乐乐的诱惑等活动都有阶段任务和专属奖励。',
    rewardHint: '活动精灵、信物、限定道具',
    actionLabel: '参加活动',
    scene: SceneKey.ACTIVITY,
    priority: 30,
    badge: '限定',
    accent: 0xff6fae,
  },
  {
    id: 'shop',
    categoryId: 'daily',
    title: '彩虹补给站',
    summary: '限时商品会刷新折扣，补球、药品、强化道具都能在这里准备。',
    rewardHint: '1-9 折商品、恢复药、捕捉球',
    actionLabel: '去补给',
    scene: SceneKey.SHOP,
    priority: 40,
    accent: 0x70d6ff,
  },
  {
    id: 'pet_manager',
    categoryId: 'growth',
    title: '精灵管理',
    summary: '查看队伍和仓库，比较性格、资质、技能与进化条件。',
    rewardHint: '队伍配置、进化规划',
    actionLabel: '管理精灵',
    scene: SceneKey.PET_MANAGER,
    priority: 10,
    badge: '核心',
    accent: 0x65d6ff,
  },
  {
    id: 'pet_dex',
    categoryId: 'growth',
    title: '精灵图鉴',
    summary: '查看全部精灵资料，使用寻找踪迹导航到刷新地图。',
    rewardHint: '刷新地点、系别、进化线',
    actionLabel: '开图鉴',
    scene: SceneKey.PET_DEX,
    priority: 20,
    badge: '追踪',
    accent: 0x77f0bf,
  },
  {
    id: 'hatchery',
    categoryId: 'growth',
    title: '精灵蛋孵化',
    summary: '在家园培育舱照料彩虹蛋，孵出有性格和潜能差异的新伙伴。',
    rewardHint: '随机精灵、性格、潜能',
    actionLabel: '去孵化',
    scene: SceneKey.HOME,
    priority: 30,
    accent: 0xffd2f0,
  },
  {
    id: 'potential',
    categoryId: 'growth',
    title: '潜能训练',
    summary: '用潜能星砂提升生命、攻击、防御等成长，让同名精灵也有差异。',
    rewardHint: '属性成长、战斗强度',
    actionLabel: '去家园',
    scene: SceneKey.HOME,
    priority: 40,
    accent: 0xa98cff,
  },
  {
    id: 'route_map',
    categoryId: 'adventure',
    title: '旧版大地图',
    summary: '按地图推荐等级选择路线，找传送点、NPC、野生精灵和功能建筑。',
    rewardHint: '地图探索、NPC 任务、捕捉',
    actionLabel: '打开地图',
    scene: SceneKey.LEGACY_ROUTE_MAP,
    priority: 10,
    badge: '探索',
    accent: 0xff6fae,
  },
  {
    id: 'gym',
    categoryId: 'adventure',
    title: '精灵道馆',
    summary: '挑战阶段化关卡，检验队伍强度，拿更高阶养成材料。',
    rewardHint: '挑战奖励、稀有材料',
    actionLabel: '去挑战',
    scene: SceneKey.GYM,
    priority: 20,
    badge: '战斗',
    accent: 0xff8b54,
  },
  {
    id: 'tide_trial',
    categoryId: 'adventure',
    title: '彩虹试炼塔',
    summary: '连续挑战不同规则的敌人，适合培养成型后刷强力奖励。',
    rewardHint: '试炼币、强化材料',
    actionLabel: '去试炼',
    scene: SceneKey.TIDE_TRIAL,
    priority: 30,
    accent: 0x7bdcff,
  },
  {
    id: 'casino',
    categoryId: 'adventure',
    title: '彩贝赌场',
    summary: '转盘、猜贝壳、珍珠卡牌都能赚彩贝，但要注意风险。',
    rewardHint: '彩贝、稀有兑换物',
    actionLabel: '去赌场',
    scene: SceneKey.CASINO,
    priority: 40,
    accent: 0xffca5a,
  },
  {
    id: 'farm',
    categoryId: 'home',
    title: '农场',
    summary: '种植能源作物，浇水等待成熟，为日常补给提供材料。',
    rewardHint: '能源种子、金币、材料',
    actionLabel: '去农场',
    scene: SceneKey.FARM,
    priority: 10,
    badge: '经营',
    accent: 0x9ae66e,
  },
  {
    id: 'angel_chest',
    categoryId: 'home',
    title: '天使宝箱',
    summary: '家园实体宝箱可以开启奖励，是回家路上的稳定惊喜。',
    rewardHint: '金币、补给、稀有道具',
    actionLabel: '开宝箱',
    scene: SceneKey.HOME,
    priority: 20,
    accent: 0xfff06a,
  },
  {
    id: 'furniture',
    categoryId: 'home',
    title: '家具与共建',
    summary: '整理家园功能区，收集家具，让小屋兼顾美观和养成效率。',
    rewardHint: '家具、舒适度、互动点',
    actionLabel: '布置家园',
    scene: SceneKey.HOME,
    priority: 30,
    accent: 0xff9fcf,
  },
  {
    id: 'bath_center',
    categoryId: 'home',
    title: '洗浴中心线索',
    summary: '部分活动任务必须真的到达洗浴中心，曾鸣也只会在这里刷新。',
    rewardHint: '曾鸣踪迹、活动进度',
    actionLabel: '去洗浴',
    scene: SceneKey.LEGACY_LOCATION,
    sceneData: { locationId: 'bath_center' },
    priority: 40,
    accent: 0x78d8ff,
  },
] as const;

export function entriesForGameplayGuide(
  categoryId: GameplayGuideCategoryId,
): readonly GameplayGuideEntry[] {
  return GAMEPLAY_GUIDE_ENTRIES.filter((entry) => entry.categoryId === categoryId).sort(
    (a, b) => a.priority - b.priority,
  );
}
