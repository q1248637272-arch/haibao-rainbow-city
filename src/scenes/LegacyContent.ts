import { SceneKey, type SceneKeyValue } from '@/config/GameConfig';

export type LegacyLocationId =
  | 'center'
  | 'library'
  | 'magic_school'
  | 'lab'
  | 'maze'
  | 'doll_base'
  | 'energy_field'
  | 'energy_cave'
  | 'spaceship'
  | 'casino'
  | 'bath_center'
  | 'coral_market'
  | 'tide_playground'
  | 'star_observatory'
  | 'storm_ruins';

export type LegacyMapNodeId =
  | 'rainbow_center'
  | 'library'
  | 'magic_school'
  | 'rainbow_lab'
  | 'lab_passage'
  | 'pan_hideout'
  | 'maze_gate'
  | 'maze_inside'
  | 'doll_base'
  | 'spaceship'
  | 'rainbow_casino'
  | 'bath_center'
  | 'coral_market'
  | 'tide_playground'
  | 'star_observatory'
  | 'storm_ruins'
  | 'energy_field'
  | 'energy_cave';

export type LegacyActionKind = 'scene' | 'location' | 'battle' | 'toast' | 'reward';

export interface LegacyReward {
  readonly coins?: number;
  readonly items?: ReadonlyArray<{ readonly itemId: string; readonly quantity: number }>;
  readonly oncePerDay?: boolean;
  readonly successMessage: string;
  readonly claimedMessage?: string;
}

export interface LegacyAction {
  readonly label: string;
  readonly kind: LegacyActionKind;
  readonly target?: SceneKeyValue;
  readonly locationId?: LegacyLocationId;
  readonly encounterZoneId?: string;
  readonly message?: string;
  readonly reward?: LegacyReward;
}

export interface LegacyLocationHotspot {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly radius?: number;
  readonly action: LegacyAction;
}

export interface LegacyLocationNpc {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly textureKey: string;
  readonly scale?: number;
  readonly dialogue: string;
}

export type LegacyWalkZone =
  | {
      readonly kind: 'rect';
      readonly left: number;
      readonly right: number;
      readonly top: number;
      readonly bottom: number;
    }
  | {
      readonly kind: 'ellipse';
      readonly x: number;
      readonly y: number;
      readonly rx: number;
      readonly ry: number;
    };

export interface LegacyLocationDef {
  readonly id: LegacyLocationId;
  readonly title: string;
  readonly textureKey: string;
  readonly blurb: string;
  readonly playerStart: { readonly x: number; readonly y: number };
  readonly walkArea: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  };
  readonly walkZones?: readonly LegacyWalkZone[];
  readonly blockZones?: readonly LegacyWalkZone[];
  readonly npcs?: readonly LegacyLocationNpc[];
  readonly hotspots: readonly LegacyLocationHotspot[];
}

export interface LegacyMapNode {
  readonly id: LegacyMapNodeId;
  readonly label: string;
  readonly col: number;
  readonly row: number;
  readonly locationId?: LegacyLocationId;
  readonly target?: SceneKeyValue;
  readonly encounterZoneId?: string;
  readonly message?: string;
}

export type LegacyMapRoute = readonly [LegacyMapNodeId, LegacyMapNodeId];

export const LEGACY_DEFAULT_NODE_ID: LegacyMapNodeId = 'rainbow_center';

const commonWalkArea = { left: 78, right: 882, top: 196, bottom: 548 } as const;
const commonStart = { x: 220, y: 506 } as const;
const commonFloorZones: readonly LegacyWalkZone[] = [
  { kind: 'ellipse', x: 480, y: 430, rx: 420, ry: 144 },
  { kind: 'rect', left: 92, right: 868, top: 394, bottom: 548 },
];

export const LEGACY_LOCATIONS: Record<LegacyLocationId, LegacyLocationDef> = {
  center: {
    id: 'center',
    title: '彩虹城中心',
    textureKey: 'legacy_7k7k_2',
    blurb: '旧版彩虹城的魔法圆台。道馆、任务和野外遭遇都从这里展开。',
    playerStart: { x: 220, y: 510 },
    walkArea: commonWalkArea,
    walkZones: [
      { kind: 'ellipse', x: 486, y: 420, rx: 404, ry: 156 },
      { kind: 'ellipse', x: 492, y: 512, rx: 360, ry: 76 },
    ],
    blockZones: [{ kind: 'ellipse', x: 486, y: 320, rx: 144, ry: 70 }],
    npcs: [
      {
        id: 'center-guide',
        name: '彩虹向导',
        x: 312,
        y: 458,
        textureKey: 'legacy_player_fairy',
        scale: 0.72,
        dialogue: '传送点现在会发光，想去哪里就沿着光圈走吧。',
      },
      {
        id: 'center-rookie-trainer',
        name: '巡游训练师',
        x: 640,
        y: 468,
        textureKey: 'legacy_player_merman_male',
        scale: 0.68,
        dialogue: '彩虹城也有训练师巡游、小游戏奖励和每日额度，想换换手气可以去彩贝赌场。',
      },
    ],
    hotspots: [
      {
        id: 'center-gym',
        label: '道馆',
        x: 742,
        y: 348,
        action: { label: '挑战道馆', kind: 'scene', target: SceneKey.GYM },
      },
      {
        id: 'center-quest',
        label: '任务',
        x: 516,
        y: 302,
        action: { label: '任务板', kind: 'scene', target: SceneKey.QUEST_BOARD },
      },
      {
        id: 'center-battle',
        label: '遭遇',
        x: 374,
        y: 408,
        action: {
          label: '中心遭遇',
          kind: 'battle',
          encounterZoneId: 'rainbow_city:garden',
        },
      },
      {
        id: 'center-gold-shell',
        label: '金贝',
        x: 842,
        y: 292,
        radius: 34,
        action: {
          label: '完成金贝劳动',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 40,
            items: [{ itemId: 'gold_shell', quantity: 1 }],
            successMessage: '完成一次金贝劳动，金贝壳已经放进背包。',
            claimedMessage: '今天的金贝劳动已经完成了。',
          },
        },
      },
      {
        id: 'center-casino',
        label: '赌场',
        x: 678,
        y: 498,
        action: { label: '去彩贝赌场', kind: 'location', locationId: 'casino' },
      },
    ],
  },
  library: {
    id: 'library',
    title: '图书馆',
    textureKey: 'legacy_library_clean',
    blurb: '旧新闻里的图书馆画面接成可走可点的地点，用来承载任务与剧情。',
    playerStart: commonStart,
    walkArea: commonWalkArea,
    walkZones: commonFloorZones,
    npcs: [
      {
        id: 'library-keeper',
        name: '书库管理员',
        x: 622,
        y: 432,
        textureKey: 'legacy_player_moni',
        scale: 0.58,
        dialogue: '旧版资料都归档在这里，整理书架有时能找到经验糖。',
      },
      {
        id: 'library-quest-tutor',
        name: '任务讲解员',
        x: 390,
        y: 442,
        textureKey: 'legacy_player_fairy',
        scale: 0.66,
        dialogue: '每天刷任务、攒素材、练精灵，是很多经典精灵页游都会有的成长节奏。',
      },
    ],
    hotspots: [
      {
        id: 'library-archive',
        label: '修复',
        x: 500,
        y: 374,
        radius: 44,
        action: { label: '档案修复台', kind: 'scene', target: SceneKey.LIBRARY_ARCHIVE },
      },
      {
        id: 'library-quest',
        label: '书架',
        x: 708,
        y: 310,
        action: { label: '查看任务', kind: 'scene', target: SceneKey.QUEST_BOARD },
      },
      {
        id: 'library-archive-echo',
        label: '回声',
        x: 596,
        y: 418,
        radius: 42,
        action: {
          label: '清理档案回声',
          kind: 'battle',
          encounterZoneId: 'rainbow_city:garden',
        },
      },
      {
        id: 'library-note',
        label: '资料',
        x: 346,
        y: 392,
        action: {
          label: '翻找资料',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 20,
            items: [{ itemId: 'exp_candy', quantity: 1 }],
            successMessage: '找到一页主要任务统计，经验糖已经放进背包。',
            claimedMessage: '今天已经整理过图书馆资料了。',
          },
        },
      },
      {
        id: 'library-center',
        label: '回城',
        x: 238,
        y: 474,
        action: { label: '回到中心', kind: 'location', locationId: 'center' },
      },
    ],
  },
  magic_school: {
    id: 'magic_school',
    title: '魔法学院',
    textureKey: 'legacy_gym_hall',
    blurb: '魔法学院现在是独立地点，先进入学院大厅，再从训练门挑战道馆。',
    playerStart: commonStart,
    walkArea: commonWalkArea,
    walkZones: [
      { kind: 'ellipse', x: 480, y: 428, rx: 398, ry: 150 },
      { kind: 'rect', left: 104, right: 856, top: 382, bottom: 548 },
    ],
    npcs: [
      {
        id: 'magic-mentor',
        name: '魔法导师',
        x: 556,
        y: 424,
        textureKey: 'legacy_player_moni',
        scale: 0.58,
        dialogue: '魔法学院不是道馆入口本身，先练会魔法卡节奏，再去训练门挑战吧。',
      },
      {
        id: 'magic-card-student',
        name: '星辉学徒',
        x: 386,
        y: 448,
        textureKey: 'legacy_player_merman_male',
        scale: 0.66,
        dialogue: '属性克制、技能效果和等级学习都很重要，别只盯着一招打到底。',
      },
    ],
    hotspots: [
      {
        id: 'magic-gym-door',
        label: '训练门',
        x: 716,
        y: 344,
        action: { label: '进入道馆', kind: 'scene', target: SceneKey.GYM },
      },
      {
        id: 'magic-card-practice',
        label: '魔法卡',
        x: 494,
        y: 396,
        action: {
          label: '练习魔法卡',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 35,
            items: [{ itemId: 'element_fruit_light', quantity: 1 }],
            successMessage: '魔法卡练习完成，光元素果实已经放进背包。',
            claimedMessage: '今天已经完成过魔法卡练习了。',
          },
        },
      },
      {
        id: 'magic-center',
        label: '回城',
        x: 238,
        y: 476,
        action: { label: '回到中心', kind: 'location', locationId: 'center' },
      },
    ],
  },
  lab: {
    id: 'lab',
    title: '实验室通道',
    textureKey: 'legacy_lab_clean',
    blurb: '旧版实验室通道现在作为精灵研究点，连接捕捉、补给和强化路线。',
    playerStart: commonStart,
    walkArea: commonWalkArea,
    walkZones: commonFloorZones,
    npcs: [
      {
        id: 'lab-researcher',
        name: '实验员洛洛',
        x: 560,
        y: 430,
        textureKey: 'legacy_player_moni',
        scale: 0.58,
        dialogue: '补给站已经重新整理，药品、精灵球和进化石都能分页查看。',
      },
      {
        id: 'lab-evolution-helper',
        name: '进化研究员',
        x: 360,
        y: 444,
        textureKey: 'legacy_player_fairy',
        scale: 0.66,
        dialogue: '精灵到达等级会解锁技能，满足等级和道具条件后还能继续进化。',
      },
    ],
    hotspots: [
      {
        id: 'lab-battle',
        label: '实验',
        x: 658,
        y: 326,
        action: {
          label: '实验遭遇',
          kind: 'battle',
          encounterZoneId: 'rainbow_city:garden',
        },
      },
      {
        id: 'lab-shop',
        label: '补给',
        x: 742,
        y: 252,
        radius: 38,
        action: { label: '购买补给', kind: 'scene', target: SceneKey.SHOP },
      },
      {
        id: 'lab-center',
        label: '回城',
        x: 236,
        y: 480,
        action: { label: '回到中心', kind: 'location', locationId: 'center' },
      },
    ],
  },
  maze: {
    id: 'maze',
    title: '迷宫入口',
    textureKey: 'legacy_maze_gate_clean',
    blurb: '用旧场景图重建迷宫入口，作为低等级野外精灵的主要遭遇区。',
    playerStart: commonStart,
    walkArea: commonWalkArea,
    walkZones: commonFloorZones,
    npcs: [
      {
        id: 'maze-warden',
        name: '迷宫守卫',
        x: 454,
        y: 454,
        textureKey: 'legacy_player_fairy',
        scale: 0.68,
        dialogue: '迷宫里的精灵会四处巡游，靠近它们就会进入战斗。',
      },
      {
        id: 'maze-runner',
        name: '探路少年',
        x: 620,
        y: 464,
        textureKey: 'legacy_player_merman_male',
        scale: 0.66,
        dialogue: '有些老式页游会把稀有精灵藏在迷宫深处，看到游荡精灵就主动靠近试试。',
      },
    ],
    hotspots: [
      {
        id: 'maze-trial',
        label: '试炼',
        x: 732,
        y: 310,
        action: {
          label: '迷宫路线试炼',
          kind: 'scene',
          target: SceneKey.MAZE_TRIAL,
        },
      },
      {
        id: 'maze-battle',
        label: '迷宫',
        x: 654,
        y: 340,
        action: {
          label: '进入迷宫',
          kind: 'battle',
          encounterZoneId: 'rainbow_city:garden',
        },
      },
      {
        id: 'maze-center',
        label: '回城',
        x: 312,
        y: 470,
        action: { label: '回城中心', kind: 'location', locationId: 'center' },
      },
    ],
  },
  doll_base: {
    id: 'doll_base',
    title: '玩偶基地',
    textureKey: 'legacy_doll_base_clean',
    blurb: '把旧版玩偶素材整理成干净的基地背景，用来放置更有挑战感的遭遇。',
    playerStart: commonStart,
    walkArea: commonWalkArea,
    walkZones: commonFloorZones,
    npcs: [
      {
        id: 'doll-restorer',
        name: '玩偶修复师',
        x: 612,
        y: 430,
        textureKey: 'legacy_player_moni',
        scale: 0.58,
        dialogue: '净化水晶可以修复旧版玩偶，宝箱每天也会补充一次奖励。',
      },
    ],
    hotspots: [
      {
        id: 'doll-battle',
        label: '基地',
        x: 662,
        y: 330,
        action: {
          label: '基地遭遇',
          kind: 'battle',
          encounterZoneId: 'beach:shoreline',
        },
      },
      {
        id: 'doll-vip',
        label: '签到',
        x: 470,
        y: 430,
        action: { label: '每日签到', kind: 'scene', target: SceneKey.VIP_PANEL },
      },
      {
        id: 'doll-angel-chest',
        label: '宝箱',
        x: 558,
        y: 396,
        action: {
          label: '开启天使宝箱',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 30,
            items: [
              { itemId: 'angel_chest', quantity: 1 },
              { itemId: 'pokeball_great', quantity: 1 },
            ],
            successMessage: '天使宝箱轻轻打开，里面装着旧版活动补给。',
            claimedMessage: '今天的天使宝箱已经开启过了。',
          },
        },
      },
      {
        id: 'doll-map',
        label: '地图',
        x: 228,
        y: 478,
        action: { label: '回旧地图', kind: 'scene', target: SceneKey.WORLD },
      },
    ],
  },
  energy_field: {
    id: 'energy_field',
    title: '能源田',
    textureKey: 'legacy_energy_field_clean',
    blurb: '能源田使用去杂质后的旧版构图，承担海边精灵遭遇和材料采集感。',
    playerStart: commonStart,
    walkArea: commonWalkArea,
    walkZones: [
      { kind: 'ellipse', x: 482, y: 420, rx: 414, ry: 152 },
      { kind: 'rect', left: 96, right: 866, top: 374, bottom: 548 },
    ],
    npcs: [
      {
        id: 'energy-planter',
        name: '能源农夫',
        x: 516,
        y: 444,
        textureKey: 'legacy_player_fairy',
        scale: 0.68,
        dialogue: '能源田每天能采到种子和元素果实，记得去水晶矿洞补充净化水晶。',
      },
      {
        id: 'energy-harvest-kid',
        name: '采集童子',
        x: 660,
        y: 452,
        textureKey: 'legacy_player_merman_male',
        scale: 0.66,
        dialogue: '采集、种植、兑换这些小循环会慢慢补齐家园和精灵养成材料。',
      },
    ],
    hotspots: [
      {
        id: 'energy-battle',
        label: '能源',
        x: 704,
        y: 350,
        action: {
          label: '能源田遭遇',
          kind: 'battle',
          encounterZoneId: 'beach:shoreline',
        },
      },
      {
        id: 'energy-shop',
        label: '补给',
        x: 492,
        y: 322,
        radius: 42,
        action: { label: '购买补给', kind: 'scene', target: SceneKey.SHOP },
      },
      {
        id: 'energy-harvest',
        label: '采集',
        x: 560,
        y: 392,
        radius: 38,
        action: {
          label: '采集能源田',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 35,
            items: [
              { itemId: 'energy_seed', quantity: 2 },
              { itemId: 'element_fruit_grass', quantity: 1 },
            ],
            successMessage: '能源田采集完成，种子和元素果实已经收好。',
            claimedMessage: '今天的能源田已经采集过了。',
          },
        },
      },
      {
        id: 'energy-cave',
        label: '矿洞',
        x: 236,
        y: 480,
        action: { label: '去水晶矿洞', kind: 'location', locationId: 'energy_cave' },
      },
    ],
  },
  energy_cave: {
    id: 'energy_cave',
    title: '水晶矿洞',
    textureKey: 'legacy_crystal_cave_clean',
    blurb: '水晶矿洞升级为宽屏巡采场景，玩家需要点亮真实晶脉才能带回净化水晶。',
    playerStart: commonStart,
    walkArea: commonWalkArea,
    walkZones: [
      { kind: 'ellipse', x: 486, y: 426, rx: 404, ry: 148 },
      { kind: 'rect', left: 126, right: 840, top: 398, bottom: 548 },
    ],
    npcs: [
      {
        id: 'crystal-miner',
        name: '水晶矿工',
        x: 612,
        y: 438,
        textureKey: 'legacy_player_moni',
        scale: 0.58,
        dialogue: '越亮的晶簇越适合采集，今天采过以后要等明天再恢复。',
      },
    ],
    hotspots: [
      {
        id: 'cave-battle',
        label: '矿洞',
        x: 642,
        y: 340,
        action: {
          label: '矿洞遭遇',
          kind: 'battle',
          encounterZoneId: 'beach:shoreline',
        },
      },
      {
        id: 'cave-crystal',
        label: '晶脉',
        x: 510,
        y: 390,
        action: {
          label: '晶脉巡采',
          kind: 'scene',
          target: SceneKey.CRYSTAL_MINE,
        },
      },
      {
        id: 'cave-field',
        label: '能源田',
        x: 360,
        y: 462,
        action: { label: '回能源田', kind: 'location', locationId: 'energy_field' },
      },
      {
        id: 'cave-map',
        label: '地图',
        x: 206,
        y: 486,
        action: { label: '旧版地图', kind: 'scene', target: SceneKey.WORLD },
      },
    ],
  },
  spaceship: {
    id: 'spaceship',
    title: '飞船内部',
    textureKey: 'legacy_spaceship_clean',
    blurb: '旧大地图底部的飞船路线接入单机版，作为修复、补给和进阶遭遇点。',
    playerStart: commonStart,
    walkArea: commonWalkArea,
    walkZones: [
      { kind: 'ellipse', x: 480, y: 426, rx: 384, ry: 142 },
      { kind: 'rect', left: 122, right: 838, top: 390, bottom: 548 },
    ],
    npcs: [
      {
        id: 'ship-engineer',
        name: '飞船技师',
        x: 596,
        y: 432,
        textureKey: 'legacy_player_fairy',
        scale: 0.68,
        dialogue: '修复核心能拿到芯片和精灵球，补给站也可以从这里进入。',
      },
      {
        id: 'ship-route-agent',
        name: '航线管理员',
        x: 368,
        y: 446,
        textureKey: 'legacy_player_merman_male',
        scale: 0.66,
        dialogue: '飞船、能源田、赌场和水晶矿洞已经串成一条旧版探索路线。',
      },
    ],
    hotspots: [
      {
        id: 'ship-repair',
        label: '校准',
        x: 642,
        y: 330,
        action: {
          label: '飞船核心校准',
          kind: 'scene',
          target: SceneKey.SHIP_CORE,
        },
      },
      {
        id: 'ship-shop',
        label: '补给',
        x: 796,
        y: 270,
        radius: 38,
        action: { label: '购买补给', kind: 'scene', target: SceneKey.SHOP },
      },
      {
        id: 'ship-battle',
        label: '巡航',
        x: 246,
        y: 480,
        action: {
          label: '飞船遭遇',
          kind: 'battle',
          encounterZoneId: 'beach:shoreline',
        },
      },
    ],
  },
  casino: {
    id: 'casino',
    title: '彩贝赌场',
    textureKey: 'legacy_casino_clean',
    blurb: '按旧版海底场景风格重绘的彩贝赌场，只使用单机彩虹币和每日额度。',
    playerStart: { x: 240, y: 516 },
    walkArea: { left: 72, right: 888, top: 230, bottom: 560 },
    walkZones: [
      { kind: 'ellipse', x: 480, y: 438, rx: 428, ry: 158 },
      { kind: 'rect', left: 98, right: 860, top: 404, bottom: 560 },
    ],
    blockZones: [{ kind: 'ellipse', x: 480, y: 368, rx: 132, ry: 56 }],
    npcs: [
      {
        id: 'casino-host',
        name: '彩贝主持',
        x: 742,
        y: 450,
        textureKey: 'npc_casino_host',
        scale: 0.88,
        dialogue: '欢迎来到彩贝赌场，这里只玩单机彩虹币，今日额度用完就要明天再来。',
      },
      {
        id: 'casino-guard',
        name: '贝壳守卫',
        x: 232,
        y: 468,
        textureKey: 'npc_casino_guard',
        scale: 0.9,
        dialogue: '这里禁止真实交易，彩虹币输赢只是小游戏，别把任务和训练落下。',
      },
      {
        id: 'casino-card-kid',
        name: '卡牌学徒',
        x: 570,
        y: 476,
        textureKey: 'legacy_player_fairy',
        scale: 0.68,
        dialogue: '珍珠卡牌像其他精灵页游里的每日小游戏，抽到素材也算赚到。',
      },
    ],
    hotspots: [
      {
        id: 'casino-play',
        label: '彩贝盘',
        x: 482,
        y: 398,
        radius: 48,
        action: {
          label: '进入赌场玩法',
          kind: 'scene',
          target: SceneKey.CASINO,
        },
      },
      {
        id: 'casino-daily-chips',
        label: '彩筹',
        x: 676,
        y: 424,
        action: {
          label: '整理彩筹',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 25,
            items: [{ itemId: 'gold_shell', quantity: 1 }],
            successMessage: '整理完一盘彩筹，得到 25 彩虹币和一枚金贝壳。',
            claimedMessage: '今天已经帮彩贝赌场整理过彩筹了。',
          },
        },
      },
      {
        id: 'casino-center',
        label: '回城',
        x: 238,
        y: 520,
        action: { label: '回彩虹城中心', kind: 'location', locationId: 'center' },
      },
    ],
  },
  bath_center: {
    id: 'bath_center',
    title: '洗浴中心',
    textureKey: 'legacy_bath_center_clean',
    blurb: '珍珠温泉、贝壳浴池和蒸汽气泡组成的海底洗浴中心，曾鸣只会在这里刷新。',
    playerStart: { x: 240, y: 516 },
    walkArea: { left: 72, right: 888, top: 230, bottom: 560 },
    walkZones: [
      { kind: 'ellipse', x: 480, y: 438, rx: 426, ry: 154 },
      { kind: 'rect', left: 104, right: 856, top: 398, bottom: 560 },
    ],
    blockZones: [{ kind: 'ellipse', x: 480, y: 360, rx: 118, ry: 48 }],
    npcs: [
      {
        id: 'bath-attendant',
        name: '温泉管理员',
        x: 664,
        y: 450,
        textureKey: 'legacy_player_moni',
        scale: 0.58,
        dialogue: '洗浴中心的雾气会吸引曾鸣，想找它就别去别的地图乱撞啦。',
      },
      {
        id: 'bath-trainer',
        name: '泡泡训练师',
        x: 330,
        y: 468,
        textureKey: 'legacy_player_merman_male',
        scale: 0.66,
        dialogue: '曾鸣第三形态的绝招很强，但用完会随机传送，还会掉一些彩虹币。',
      },
    ],
    hotspots: [
      {
        id: 'bath-zeng-ming',
        label: '雾气',
        x: 538,
        y: 370,
        radius: 50,
        action: {
          label: '寻找曾鸣',
          kind: 'battle',
          encounterZoneId: 'bath_center:spa',
        },
      },
      {
        id: 'bath-soak',
        label: '泡池',
        x: 430,
        y: 430,
        action: {
          label: '温泉休整',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 20,
            items: [{ itemId: 'potion_medium', quantity: 1 }],
            successMessage: '泡池的暖流恢复了精神，中伤药已经放进背包。',
            claimedMessage: '今天已经在洗浴中心休整过了。',
          },
        },
      },
      {
        id: 'bath-center',
        label: '回城',
        x: 232,
        y: 520,
        action: { label: '回彩虹城中心', kind: 'location', locationId: 'center' },
      },
    ],
  },
  coral_market: {
    id: 'coral_market',
    title: '珊瑚集市',
    textureKey: 'legacy_coral_market_clean',
    blurb: '连接海底商路的热闹集市，珊瑚灯柱会吸引水系与光系精灵。',
    playerStart: { x: 238, y: 520 },
    walkArea: { left: 70, right: 890, top: 220, bottom: 560 },
    walkZones: [
      { kind: 'ellipse', x: 484, y: 440, rx: 430, ry: 156 },
      { kind: 'rect', left: 112, right: 850, top: 394, bottom: 560 },
    ],
    blockZones: [{ kind: 'ellipse', x: 522, y: 348, rx: 126, ry: 48 }],
    npcs: [
      {
        id: 'coral-merchant',
        name: '珊瑚商会长',
        x: 654,
        y: 452,
        textureKey: 'npc_coral_merchant',
        scale: 0.42,
        dialogue: '集市每天都会委托训练师登记野生精灵，捕到珊瑚灯灵可以推进主线。',
      },
      {
        id: 'coral-fisher',
        name: '贝壳渔师',
        x: 330,
        y: 470,
        textureKey: 'legacy_player_merman_male',
        scale: 0.64,
        dialogue: '这里的精灵等级固定在十八到二十一级，刚从矿洞出来正好练手。',
      },
    ],
    hotspots: [
      {
        id: 'coral-market-battle',
        label: '灯潮',
        x: 548,
        y: 380,
        radius: 50,
        action: { label: '调查灯潮', kind: 'battle', encounterZoneId: 'coral_market:harbor' },
      },
      {
        id: 'coral-market-stall',
        label: '商摊',
        x: 690,
        y: 428,
        action: { label: '购买补给', kind: 'scene', target: SceneKey.SHOP },
      },
      {
        id: 'coral-market-commission',
        label: '委托',
        x: 410,
        y: 440,
        action: {
          label: '完成集市委托',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 95,
            items: [{ itemId: 'gold_shell', quantity: 2 }],
            successMessage: '完成珊瑚集市委托，获得 95 彩虹币和 2 枚金贝壳。',
            claimedMessage: '今天已经帮珊瑚集市登记过货单了。',
          },
        },
      },
      {
        id: 'coral-market-center',
        label: '回城',
        x: 228,
        y: 520,
        action: { label: '回到彩虹城中心', kind: 'location', locationId: 'center' },
      },
    ],
  },
  tide_playground: {
    id: 'tide_playground',
    title: '潮汐试炼场',
    textureKey: 'legacy_tide_playground_clean',
    blurb:
      '由贝壳跑道、潮汐浮台和珍珠靶组成的训练场，适合在短局小游戏里练反应，也会刷新潮汐水獭。',
    playerStart: { x: 230, y: 520 },
    walkArea: { left: 70, right: 890, top: 218, bottom: 560 },
    walkZones: [
      { kind: 'ellipse', x: 492, y: 432, rx: 418, ry: 154 },
      { kind: 'rect', left: 112, right: 852, top: 398, bottom: 560 },
    ],
    blockZones: [
      { kind: 'ellipse', x: 490, y: 330, rx: 128, ry: 50 },
      { kind: 'rect', left: 704, right: 824, top: 286, bottom: 396 },
    ],
    npcs: [
      {
        id: 'tide-coach',
        name: '潮汐教练',
        x: 650,
        y: 448,
        textureKey: 'npc_tide_coach',
        scale: 0.34,
        dialogue:
          '试炼不是点一下就完成：要真的接珍珠、躲暗礁，分数够高才会把潮汐水獭交给你。',
      },
      {
        id: 'tide-score-keeper',
        name: '贝壳记分员',
        x: 340,
        y: 466,
        textureKey: 'legacy_player_fairy',
        scale: 0.64,
        dialogue:
          '潮汐试炼会记录最高分。新手先拿 90 分，熟练后挑战 150 分，会更像经典页游里的每日练功。',
      },
    ],
    hotspots: [
      {
        id: 'tide-trial-start',
        label: '试炼',
        x: 492,
        y: 368,
        radius: 54,
        action: { label: '开始潮汐试炼', kind: 'scene', target: SceneKey.TIDE_TRIAL },
      },
      {
        id: 'tide-trial-lagoon',
        label: '潮池',
        x: 560,
        y: 430,
        radius: 52,
        action: {
          label: '调查潮池',
          kind: 'battle',
          encounterZoneId: 'tide_playground:lagoon',
        },
      },
      {
        id: 'tide-trial-pearl-cache',
        label: '珍珠',
        x: 382,
        y: 420,
        action: {
          label: '整理试炼珍珠',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 140,
            items: [
              { itemId: 'gold_shell', quantity: 1 },
              { itemId: 'element_fruit_water', quantity: 1 },
            ],
            successMessage: '整理了潮汐珍珠，获得 140 彩虹币、1 枚金贝壳和 1 枚蓝波果。',
            claimedMessage: '今天已经整理过潮汐试炼场的珍珠了。',
          },
        },
      },
      {
        id: 'tide-trial-center',
        label: '回城',
        x: 228,
        y: 520,
        action: { label: '回到彩虹城中心', kind: 'location', locationId: 'center' },
      },
    ],
  },
  star_observatory: {
    id: 'star_observatory',
    title: '星辉观测台',
    textureKey: 'legacy_star_observatory_clean',
    blurb: '漂浮在浅海上方的观测台，星泡和极光会在夜色里刷新。',
    playerStart: { x: 250, y: 518 },
    walkArea: { left: 74, right: 886, top: 214, bottom: 560 },
    walkZones: [
      { kind: 'ellipse', x: 480, y: 426, rx: 408, ry: 146 },
      { kind: 'rect', left: 112, right: 856, top: 394, bottom: 560 },
    ],
    blockZones: [{ kind: 'ellipse', x: 480, y: 336, rx: 136, ry: 54 }],
    npcs: [
      {
        id: 'star-cartographer',
        name: '星图师',
        x: 610,
        y: 436,
        textureKey: 'npc_star_cartographer',
        scale: 0.4,
        dialogue: '星盘需要真实战斗数据校准，击败野生精灵才能让任务继续走。',
      },
      {
        id: 'aurora-trainee',
        name: '极光学徒',
        x: 362,
        y: 464,
        textureKey: 'legacy_player_fairy',
        scale: 0.66,
        dialogue: '星泡水母会回复，极光鹿会叠暴击。别只看攻击，特攻和特防也很重要。',
      },
    ],
    hotspots: [
      {
        id: 'star-observatory-battle',
        label: '星盘',
        x: 484,
        y: 360,
        radius: 52,
        action: {
          label: '校准星盘',
          kind: 'battle',
          encounterZoneId: 'star_observatory:starlight',
        },
      },
      {
        id: 'star-observatory-quest',
        label: '星图',
        x: 630,
        y: 410,
        action: { label: '查看星图任务', kind: 'scene', target: SceneKey.QUEST_BOARD },
      },
      {
        id: 'star-observatory-reward',
        label: '星屑',
        x: 364,
        y: 430,
        action: {
          label: '收集星屑',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 120,
            items: [{ itemId: 'element_fruit_light', quantity: 1 }],
            successMessage: '星盘落下星屑，获得 120 彩虹币和 1 枚光系果实。',
            claimedMessage: '今天的星屑已经收集完了。',
          },
        },
      },
      {
        id: 'star-observatory-center',
        label: '回城',
        x: 234,
        y: 520,
        action: { label: '回到彩虹城中心', kind: 'location', locationId: 'center' },
      },
    ],
  },
  storm_ruins: {
    id: 'storm_ruins',
    title: '风暴遗迹',
    textureKey: 'legacy_storm_ruins_clean',
    blurb: '高等级挑战地图，雷鳐与晶岩守卫盘踞在断裂的海底古柱之间。',
    playerStart: { x: 244, y: 520 },
    walkArea: { left: 70, right: 890, top: 224, bottom: 560 },
    walkZones: [
      { kind: 'ellipse', x: 480, y: 438, rx: 420, ry: 150 },
      { kind: 'rect', left: 110, right: 850, top: 398, bottom: 560 },
    ],
    blockZones: [
      { kind: 'ellipse', x: 458, y: 346, rx: 118, ry: 48 },
      { kind: 'rect', left: 662, right: 786, top: 304, bottom: 410 },
    ],
    npcs: [
      {
        id: 'storm-keeper',
        name: '遗迹守望者',
        x: 666,
        y: 452,
        textureKey: 'npc_storm_keeper',
        scale: 0.42,
        dialogue: '这里推荐三十三级再来。风暴鳐打特攻，晶岩守卫吃物防，队伍要有换手。',
      },
      {
        id: 'ruin-runner',
        name: '遗迹跑者',
        x: 330,
        y: 464,
        textureKey: 'legacy_player_merman_male',
        scale: 0.64,
        dialogue: '如果被雷链压低命中，可以回家园休整或者去补给站准备药品。',
      },
    ],
    hotspots: [
      {
        id: 'storm-ruins-battle',
        label: '雷柱',
        x: 530,
        y: 372,
        radius: 54,
        action: { label: '挑战雷柱', kind: 'battle', encounterZoneId: 'storm_ruins:tempest' },
      },
      {
        id: 'storm-ruins-cache',
        label: '遗物',
        x: 690,
        y: 430,
        action: {
          label: '修复遗物',
          kind: 'reward',
          reward: {
            oncePerDay: true,
            coins: 160,
            items: [{ itemId: 'crystal_shard', quantity: 2 }],
            successMessage: '修复遗迹残片，获得 160 彩虹币和 2 块水晶碎片。',
            claimedMessage: '今天的遗迹残片已经修复过了。',
          },
        },
      },
      {
        id: 'storm-ruins-center',
        label: '回城',
        x: 232,
        y: 520,
        action: { label: '回到彩虹城中心', kind: 'location', locationId: 'center' },
      },
    ],
  },
};

export const LEGACY_MAP_NODES: readonly LegacyMapNode[] = [
  { id: 'tide_playground', label: '潮汐试炼场', col: 536, row: 228, locationId: 'tide_playground' },
  { id: 'rainbow_center', label: '彩虹城中心', col: 258, row: 155, locationId: 'center' },
  { id: 'library', label: '图书馆', col: 317, row: 116, locationId: 'library' },
  { id: 'magic_school', label: '魔法学院', col: 309, row: 78, locationId: 'magic_school' },
  { id: 'rainbow_lab', label: '彩虹城实验室', col: 132, row: 120, locationId: 'lab' },
  { id: 'lab_passage', label: '实验室通道', col: 185, row: 143, locationId: 'lab' },
  {
    id: 'pan_hideout',
    label: '潘的藏身处',
    col: 78,
    row: 165,
    encounterZoneId: 'rainbow_city:garden',
  },
  { id: 'maze_gate', label: '迷宫入口处', col: 137, row: 209, locationId: 'maze' },
  { id: 'maze_inside', label: '迷宫内部', col: 69, row: 236, locationId: 'maze' },
  { id: 'doll_base', label: '玩偶基地', col: 282, row: 249, locationId: 'doll_base' },
  { id: 'spaceship', label: '飞船内部', col: 224, row: 279, locationId: 'spaceship' },
  { id: 'rainbow_casino', label: '彩贝赌场', col: 420, row: 278, locationId: 'casino' },
  { id: 'bath_center', label: '洗浴中心', col: 446, row: 216, locationId: 'bath_center' },
  { id: 'coral_market', label: '珊瑚集市', col: 494, row: 270, locationId: 'coral_market' },
  { id: 'star_observatory', label: '星辉观测台', col: 506, row: 122, locationId: 'star_observatory' },
  { id: 'storm_ruins', label: '风暴遗迹', col: 455, row: 326, locationId: 'storm_ruins' },
  { id: 'energy_field', label: '能源田', col: 370, row: 165, locationId: 'energy_field' },
  { id: 'energy_cave', label: '水晶矿洞', col: 359, row: 219, locationId: 'energy_cave' },
];

export const LEGACY_MAP_ROUTES: readonly LegacyMapRoute[] = [
  ['bath_center', 'tide_playground'],
  ['coral_market', 'tide_playground'],
  ['tide_playground', 'star_observatory'],
  ['pan_hideout', 'rainbow_lab'],
  ['rainbow_lab', 'lab_passage'],
  ['lab_passage', 'rainbow_center'],
  ['rainbow_center', 'library'],
  ['library', 'magic_school'],
  ['lab_passage', 'maze_gate'],
  ['maze_gate', 'maze_inside'],
  ['maze_gate', 'doll_base'],
  ['doll_base', 'spaceship'],
  ['spaceship', 'rainbow_casino'],
  ['rainbow_casino', 'bath_center'],
  ['rainbow_casino', 'coral_market'],
  ['coral_market', 'star_observatory'],
  ['coral_market', 'storm_ruins'],
  ['storm_ruins', 'energy_cave'],
  ['bath_center', 'energy_cave'],
  ['rainbow_casino', 'energy_cave'],
  ['doll_base', 'energy_cave'],
  ['energy_cave', 'energy_field'],
  ['energy_field', 'rainbow_center'],
];

export function getLegacyMapNode(id: LegacyMapNodeId): LegacyMapNode {
  const node = LEGACY_MAP_NODES.find((item) => item.id === id);
  if (!node) {
    throw new Error(`Unknown legacy map node: ${id}`);
  }
  return node;
}

export function isLegacyInteractiveMapNode(node: LegacyMapNode): boolean {
  return Boolean(node.locationId || node.target || node.encounterZoneId || node.message);
}

export function findLegacyMapRoute(
  startId: LegacyMapNodeId,
  goalId: LegacyMapNodeId,
): LegacyMapNodeId[] {
  if (startId === goalId) return [startId];

  const neighbors = new Map<LegacyMapNodeId, LegacyMapNodeId[]>();
  for (const [a, b] of LEGACY_MAP_ROUTES) {
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  }

  const queue: LegacyMapNodeId[] = [startId];
  const cameFrom = new Map<LegacyMapNodeId, LegacyMapNodeId | null>([[startId, null]]);

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (!current) continue;
    for (const next of neighbors.get(current) ?? []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, current);
      if (next === goalId) {
        const route: LegacyMapNodeId[] = [goalId];
        let cursor: LegacyMapNodeId | null = current;
        while (cursor) {
          route.push(cursor);
          cursor = cameFrom.get(cursor) ?? null;
        }
        return route.reverse();
      }
      queue.push(next);
    }
  }

  return [startId, goalId];
}
