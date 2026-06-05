import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { getItem } from '@/data/items';
import { getPet } from '@/data/pets';
import {
  completeActivityTask,
  readActivityProgressToday,
  setPendingActivityTask,
} from '@/systems/ActivityProgress';
import { gameEvents } from '@/systems/EventBus';
import { stageForWildLevel } from '@/systems/EvolutionSystem';
import { createPlayerPet } from '@/systems/PetInstance';
import { PlayerState } from '@/systems/PlayerState';
import { preloadActivityAssets } from '@/systems/SceneAssetPreloader';
import { createNavIconButton } from '@/ui/NavIconButton';
import { ensurePetTexture } from '@/utils/placeholder';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

interface ActivityReward {
  readonly coins?: number;
  readonly costItems?: ReadonlyArray<{ readonly itemId: string; readonly quantity: number }>;
  readonly items?: ReadonlyArray<{ readonly itemId: string; readonly quantity: number }>;
  readonly petId?: string;
  readonly petLevel?: number;
}

interface ActivityTask {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly reward?: ActivityReward;
}

interface ActivityDef {
  readonly id: string;
  readonly title: string;
  readonly place: string;
  readonly note: string;
  readonly source: string;
  readonly petId?: string;
  readonly level?: number;
  readonly tasks?: readonly ActivityTask[];
  readonly reward?: ActivityReward;
}

const ACTIVITY_SAVE_KEY = 'hbcc:legacy-activities:v1';
const CARD_W = 286;
const CARD_H = 206;
const ACTIVITIES_PER_PAGE = 6;
const ACTIVITY_IMAGE_KEYS: Readonly<Record<string, string>> = {
  rainbow_core_relay_tasks: 'activity_rainbow_core_relay',
  star_tide_purification_tasks: 'activity_star_tide_purification',
  basketball_practice_25_tasks: 'activity_basketball_practice',
  chicken_you_are_beautiful_tasks: 'activity_chicken_beauty',
  lele_temptation_tasks: 'activity_lele_temptation',
  ex_girlfriend_meal_tasks: 'activity_ex_girlfriend_meal',
  rainbow_carnival_tasks: 'activity_rainbow_carnival',
  crystal_cave_rush_tasks: 'activity_crystal_rush',
  star_bubble_rescue_tasks: 'activity_star_bubble_rescue',
  rainbow_academy_commission_tasks: 'activity_rainbow_academy',
  pet_breeding_hatchery_tasks: 'activity_pet_hatchery',
  rainbow_trial_tower_tasks: 'activity_trial_tower',
};

const ACTIVITIES: readonly ActivityDef[] = [
  {
    id: 'rainbow_core_relay_tasks',
    title: '虹心接力工坊',
    place: '彩虹城虹心广场',
    note: '新开放的五色能量节点训练，按光路完成接力，稳定虹心装置并领取高阶补给',
    source: '全新高质量活动',
    tasks: [
      {
        id: 'core_relay',
        title: '五色节点接力',
        detail: '观察虹心给出的颜色顺序，依次点亮 5 个能量节点；点错会降低稳定度。',
        reward: { coins: 140 },
      },
      {
        id: 'star_memory',
        title: '虹心回路复核',
        detail: '用星泡记忆复核虹心回路，确认节点亮起顺序没有偏差。',
        reward: { items: [{ itemId: 'potential_seed', quantity: 1 }] },
      },
      {
        id: 'crystal_rush',
        title: '能量碎片回收',
        detail: '从工坊漂浮台回收 7 枚亮晶晶碎片，避开暗淡干扰源。',
        reward: { items: [{ itemId: 'crystal_shard', quantity: 2 }] },
      },
      {
        id: 'core_relay_overdrive',
        title: '虹心满载校准',
        detail: '在更稳定的节奏里再次完成五色节点接力，让虹心装置满载运行。',
        reward: { items: [{ itemId: 'element_fruit_light', quantity: 1 }] },
      },
    ],
    reward: {
      coins: 560,
      items: [
        { itemId: 'potential_seed', quantity: 2 },
        { itemId: 'repair_chip', quantity: 2 },
        { itemId: 'element_fruit_light', quantity: 2 },
        { itemId: 'pokeball_ultra', quantity: 2 },
      ],
    },
  },
  {
    id: 'star_tide_purification_tasks',
    title: '星潮净化台',
    place: '星潮净化工坊',
    note: '全新开放的五色潮能净化活动，校准潮能、回收星泡、清理晶尘，让彩虹城水脉恢复明亮。',
    source: '全新高质量活动',
    tasks: [
      {
        id: 'tide_purify',
        title: '潮能校准',
        detail: '根据净化台提示点击对应五色潮能垫，连续完成 6 次净化。',
        reward: { coins: 150 },
      },
      {
        id: 'bubble_rescue',
        title: '星泡回收',
        detail: '在星泡飘走前救下 6 个金色星泡，避开暗流泡泡。',
        reward: { items: [{ itemId: 'element_fruit_water', quantity: 1 }] },
      },
      {
        id: 'crystal_rush',
        title: '晶尘清理',
        detail: '从净化水道里回收 7 枚发光晶尘，别碰到暗淡矿尘。',
        reward: { items: [{ itemId: 'crystal_shard', quantity: 2 }] },
      },
      {
        id: 'tide_purify_overdrive',
        title: '满载净化',
        detail: '在更快节奏里完成 9 次潮能校准，让净化台满载运行。',
        reward: {
          items: [
            { itemId: 'potential_seed', quantity: 1 },
            { itemId: 'repair_chip', quantity: 1 },
          ],
        },
      },
    ],
    reward: {
      coins: 620,
      items: [
        { itemId: 'potential_seed', quantity: 2 },
        { itemId: 'element_fruit_water', quantity: 2 },
        { itemId: 'crystal_shard', quantity: 2 },
        { itemId: 'exp_cake', quantity: 1 },
      ],
    },
  },
  {
    id: 'rainbow_carnival_tasks',
    title: '彩虹嘉年华',
    place: '彩虹城中心',
    note: '限时灯阵、记忆灯谜和奖券抢收，连击越稳奖励越香',
    source: '今日推荐活动',
    tasks: [
      {
        id: 'rhythm_rush',
        title: '开彩虹灯阵',
        detail: '在倒计时内点中连续出现的彩虹音符，打出 6 连击。',
        reward: { coins: 80 },
      },
      {
        id: 'star_memory',
        title: '珍珠灯谜',
        detail: '记住星泡亮起顺序，再按同样顺序点亮它们。',
        reward: { items: [{ itemId: 'exp_candy', quantity: 1 }] },
      },
      {
        id: 'crystal_rush',
        title: '奖券抢收',
        detail: '在奖品台里抢到 7 枚闪光奖券，避开暗淡陷阱。',
        reward: { items: [{ itemId: 'gold_shell', quantity: 2 }] },
      },
      {
        id: 'stage_match',
        title: '终场演出',
        detail: '跟上舞台节拍，完成最后一轮嘉年华演出。',
        reward: { coins: 120 },
      },
    ],
    reward: {
      coins: 420,
      items: [
        { itemId: 'pokeball_ultra', quantity: 3 },
        { itemId: 'exp_cake', quantity: 1 },
        { itemId: 'element_fruit_light', quantity: 2 },
        { itemId: 'gold_shell', quantity: 3 },
      ],
    },
  },
  {
    id: 'crystal_cave_rush_tasks',
    title: '水晶矿洞急行',
    place: '水晶矿洞',
    note: '矿车开跑、晶簇点亮、终点开宝箱，节奏更快的采集活动',
    source: '高收益采集挑战',
    tasks: [
      {
        id: 'crystal_rush',
        title: '晶簇抢采',
        detail: '限时采到 7 块亮晶晶水晶，碰到暗矿会扣进度。',
        reward: { items: [{ itemId: 'crystal_shard', quantity: 2 }] },
      },
      {
        id: 'dribble',
        title: '矿车转向',
        detail: '按提示完成矿车左右转向，别让矿车撞上岩壁。',
        reward: { coins: 90 },
      },
      {
        id: 'three_point',
        title: '轨道校准',
        detail: '在绿色命中区完成 3 次轨道校准，打开深处宝箱。',
        reward: { items: [{ itemId: 'repair_chip', quantity: 1 }] },
      },
    ],
    reward: {
      coins: 360,
      items: [
        { itemId: 'crystal_shard', quantity: 4 },
        { itemId: 'evo_stone_light', quantity: 1 },
        { itemId: 'exp_cake', quantity: 1 },
      ],
    },
  },
  {
    id: 'star_bubble_rescue_tasks',
    title: '星泡救援夜',
    place: '星辉观测台',
    note: '记忆星轨、救援星泡、点亮灯塔，完成后可获得星泡水母',
    source: '夜间救援活动',
    tasks: [
      {
        id: 'star_memory',
        title: '观测星轨',
        detail: '记住星泡轨迹顺序，校准救援灯塔。',
        reward: { coins: 90 },
      },
      {
        id: 'bubble_rescue',
        title: '救援星泡',
        detail: '在星泡漂走前救下 6 个小星泡，别点到暗流泡泡。',
        reward: { items: [{ itemId: 'element_fruit_light', quantity: 1 }] },
      },
      {
        id: 'rhythm_rush',
        title: '灯塔连闪',
        detail: '用连击点亮灯塔，让星泡顺着光路回家。',
        reward: { items: [{ itemId: 'pokeball_great', quantity: 2 }] },
      },
    ],
    reward: {
      coins: 300,
      petId: 'star_jelly',
      petLevel: 15,
      items: [
        { itemId: 'exp_cake', quantity: 1 },
        { itemId: 'element_fruit_light', quantity: 2 },
      ],
    },
  },
  {
    id: 'rainbow_academy_commission_tasks',
    title: '彩虹学院委托',
    place: '魔法学院',
    note: '完成课堂记忆、魔法阵校准和救援演练，领取精灵潜能训练材料',
    source: '参考经典宠物页游的学院委托链重新设计',
    tasks: [
      {
        id: 'star_memory',
        title: '课堂星图记忆',
        detail: '记住星泡灯亮起的顺序，帮学院档案师校对精灵图鉴页码。',
        reward: { coins: 90 },
      },
      {
        id: 'rhythm_rush',
        title: '魔法阵校准',
        detail: '连续点亮漂浮音符，让彩虹魔法阵稳定运行。',
        reward: { items: [{ itemId: 'potential_seed', quantity: 1 }] },
      },
      {
        id: 'bubble_rescue',
        title: '迷路精灵救援',
        detail: '在泡泡漂走前救下 6 只迷路精灵，别碰到暗色泡泡。',
        reward: { items: [{ itemId: 'pokeball_great', quantity: 2 }] },
      },
      {
        id: 'stage_match',
        title: '学院结业演练',
        detail: '跟上结业演练节拍，通过学院老师的最后检查。',
        reward: { coins: 120 },
      },
    ],
    reward: {
      coins: 520,
      items: [
        { itemId: 'potential_seed', quantity: 2 },
        { itemId: 'exp_cake', quantity: 1 },
        { itemId: 'pokeball_ultra', quantity: 2 },
      ],
    },
  },
  {
    id: 'pet_breeding_hatchery_tasks',
    title: '精灵培育屋',
    place: '家园农场',
    note: '清理孵化舱、记录蛋纹、收集温控水晶，孵出一只带随机性格和天赋的新伙伴',
    source: '参考经典宠物页游的孵蛋与培育循环抽象设计',
    tasks: [
      {
        id: 'warmup',
        title: '清理孵化舱',
        detail: '按提示完成孵化舱清洁，让精灵蛋获得稳定环境。',
        reward: { items: [{ itemId: 'energy_seed', quantity: 1 }] },
      },
      {
        id: 'star_memory',
        title: '记录蛋纹',
        detail: '记住蛋壳上的发光纹路顺序，完成培育记录。',
        reward: { coins: 100 },
      },
      {
        id: 'crystal_rush',
        title: '收集温控水晶',
        detail: '限时收集温控水晶，避开暗淡水晶，保持孵化温度。',
        reward: { items: [{ itemId: 'potential_seed', quantity: 1 }] },
      },
    ],
    reward: {
      coins: 360,
      items: [
        { itemId: 'rainbow_pet_egg', quantity: 1 },
        { itemId: 'exp_candy', quantity: 2 },
        { itemId: 'element_fruit_light', quantity: 1 },
      ],
    },
  },
  {
    id: 'rainbow_trial_tower_tasks',
    title: '彩虹试炼塔',
    place: '精灵道馆',
    note: '分层训练、元素判断和节奏挑战，适合中期队伍刷材料与潜能',
    source: '参考宠物页游挑战塔与活动副本结构重新设计',
    tasks: [
      {
        id: 'crystal_rush',
        title: '第一层：资源判断',
        detail: '收集明亮水晶，练习在战斗前快速筛选有价值的目标。',
        reward: { items: [{ itemId: 'potion_medium', quantity: 2 }] },
      },
      {
        id: 'three_point',
        title: '第二层：精准出手',
        detail: '在绿色命中区完成三次精准出手，模拟技能命中时机。',
        reward: { items: [{ itemId: 'potential_seed', quantity: 1 }] },
      },
      {
        id: 'stage_match',
        title: '第三层：节奏压制',
        detail: '跟上试炼塔的彩光节拍，完成最终训练。',
        reward: { coins: 160 },
      },
    ],
    reward: {
      coins: 620,
      items: [
        { itemId: 'potential_seed', quantity: 2 },
        { itemId: 'evo_stone_light', quantity: 1 },
        { itemId: 'pokeball_ultra', quantity: 2 },
      ],
    },
  },
  {
    id: 'basketball_practice_25_tasks',
    title: '练习时长两年半',
    place: '彩虹篮球场',
    note: '完成运球、投篮和节拍练习，点亮篮球场舞台',
    source: '单机特别活动',
    tasks: [
      {
        id: 'warmup',
        title: '热身签到',
        detail: '去彩虹篮球场完成拉伸和节拍热身。',
        reward: { coins: 30 },
      },
      {
        id: 'dribble',
        title: '运球练习',
        detail: '完成左右手运球训练，获得投篮资格。',
        reward: { items: [{ itemId: 'potion_small', quantity: 1 }] },
      },
      {
        id: 'three_point',
        title: '三分投篮',
        detail: '连续完成三次定点投篮，点亮球场灯牌。',
        reward: { items: [{ itemId: 'element_fruit_electric', quantity: 1 }] },
      },
      {
        id: 'stage_match',
        title: '舞台合练',
        detail: '完成最后的篮球舞台合练，解锁最终奖励。',
        reward: { coins: 70 },
      },
    ],
    reward: {
      coins: 250,
      petId: 'cai_xukun',
      petLevel: 6,
      items: [
        { itemId: 'exp_cake', quantity: 1 },
        { itemId: 'pokeball_ultra', quantity: 2 },
        { itemId: 'element_fruit_electric', quantity: 2 },
        { itemId: 'gold_shell', quantity: 2 },
      ],
    },
  },
  {
    id: 'chicken_you_are_beautiful_tasks',
    title: '鸡你太美',
    place: '彩虹篮球场',
    note: '完成节奏、投篮和舞台合练，领取蔡徐坤第三形态进化信物',
    source: '单机特别活动',
    tasks: [
      {
        id: 'warmup',
        title: '节奏热身',
        detail: '按顺序点亮节拍光圈，唤醒球场灯光。',
        reward: { coins: 20 },
      },
      {
        id: 'dribble',
        title: '运球节拍',
        detail: '按提示完成左右手运球，保持节奏不乱。',
        reward: { items: [{ itemId: 'potion_medium', quantity: 1 }] },
      },
      {
        id: 'three_point',
        title: '三分应援',
        detail: '命中三次定点投篮，收集舞台能量。',
        reward: { items: [{ itemId: 'element_fruit_electric', quantity: 1 }] },
      },
      {
        id: 'stage_match',
        title: '终极合练',
        detail: '跟上舞台节拍，完成最后的篮球合练。',
        reward: { coins: 80 },
      },
    ],
    reward: {
      coins: 120,
      items: [
        { itemId: 'kun_chicken_token', quantity: 1 },
        { itemId: 'exp_cake', quantity: 1 },
      ],
    },
  },
  {
    id: 'lele_temptation_tasks',
    title: '乐乐的诱惑',
    place: '洗浴中心',
    note: '完成泡泡、引导和鸣叫训练，获得曾鸣第二形态进化信物',
    source: '单机特别活动',
    tasks: [
      {
        id: 'visit_bath_center',
        title: '到达洗浴中心',
        detail: '角色必须真正进入洗浴中心，感受泡泡雾气后才能完成。',
        reward: { coins: 30 },
      },
      {
        id: 'dribble',
        title: '蓝羽引导',
        detail: '按顺序完成蓝羽方向练习，稳定曾鸣的飞行节奏。',
        reward: { items: [{ itemId: 'potion_medium', quantity: 1 }] },
      },
      {
        id: 'three_point',
        title: '鸣声定位',
        detail: '在雾气里完成三次定位训练，锁定曾鸣的踪迹。',
        reward: { coins: 60 },
      },
    ],
    reward: {
      coins: 100,
      items: [
        { itemId: 'zeng_ming_stage2_token', quantity: 1 },
        { itemId: 'exp_candy', quantity: 2 },
      ],
    },
  },
  {
    id: 'ex_girlfriend_meal_tasks',
    title: '前女友的饭',
    place: '家园',
    note: '完成饭盒、送餐和返回家园任务，获得曾鸣第三形态进化信物',
    source: '单机特别活动',
    tasks: [
      {
        id: 'warmup',
        title: '整理饭盒',
        detail: '先把饭盒整理好，准备给曾鸣补充体力。',
        reward: { items: [{ itemId: 'potion_small', quantity: 1 }] },
      },
      {
        id: 'dribble',
        title: '送餐路线',
        detail: '按节奏完成送餐路线练习，不要把饭洒出来。',
        reward: { coins: 40 },
      },
      {
        id: 'three_point',
        title: '饭香定位',
        detail: '在雾气里完成三次饭香定位，唤醒第三形态的羽光。',
        reward: { items: [{ itemId: 'element_fruit_electric', quantity: 1 }] },
      },
      {
        id: 'return_home',
        title: '返回家园',
        detail: '角色必须真正回到家园，把饭放到家园桌上，即可完成。',
        reward: { coins: 60 },
      },
    ],
    reward: {
      coins: 120,
      items: [
        { itemId: 'zeng_ming_stage3_token', quantity: 1 },
        { itemId: 'exp_cake', quantity: 1 },
      ],
    },
  },
  {
    id: 'purify_temple_knight',
    title: '玩偶净化',
    place: '深海镇',
    note: '挑战圣殿骑士团玩偶',
    source: '7k7k 新手指南之净化玩偶',
    petId: 'arthur_knight',
    level: 12,
  },
  {
    id: 'starfish_volcano',
    title: '海星火山岩',
    place: '海星火山岩',
    note: '火驴法尔斯出没',
    source: '7k7k 玩偶大全',
    petId: 'fars_fire_donkey',
    level: 12,
  },
  {
    id: 'penguin_valley',
    title: '冰封企鹅谷',
    place: '冰封企鹅谷',
    note: '企鹅兵团首领挑战',
    source: '7k7k 玩偶大全',
    petId: 'erebus_penguin',
    level: 28,
  },
  {
    id: 'dinosaur_delta',
    title: '帝鲨三角洲',
    place: '帝鲨三角洲',
    note: '霸王龙奥尼巡逻中',
    source: '7k7k 玩偶大全',
    petId: 'oni_tyranno',
    level: 23,
  },
  {
    id: 'build_haibao_home',
    title: '共建小屋',
    place: '家园',
    note: '领取旧版小屋装扮',
    source: '旧版游戏介绍',
    reward: {
      coins: 80,
      items: [
        { itemId: 'rug_rainbow', quantity: 1 },
        { itemId: 'plant_big', quantity: 1 },
      ],
    },
  },
  {
    id: 'energy_field_harvest',
    title: '能源田采集',
    place: '能源田',
    note: '采集培育材料',
    source: '旧版游戏介绍',
    reward: {
      coins: 60,
      items: [
        { itemId: 'energy_seed', quantity: 2 },
        { itemId: 'exp_candy', quantity: 1 },
        { itemId: 'element_fruit_water', quantity: 1 },
      ],
    },
  },
  {
    id: 'spaceship_repair',
    title: '飞船修复',
    place: '飞船内部',
    note: '修复设备换精灵球',
    source: '旧版主线任务统计',
    reward: {
      coins: 50,
      items: [
        { itemId: 'repair_chip', quantity: 1 },
        { itemId: 'pokeball_normal', quantity: 3 },
      ],
    },
  },
  {
    id: 'jingwei_visit',
    title: '鱼民之家',
    place: '鱼民之家',
    note: '精卫鸟玄卿来访',
    source: '7k7k 玩偶大全',
    petId: 'xuanqing_jingwei',
    level: 18,
  },
  {
    id: 'haibao_partner_register',
    title: '领取小伙伴',
    place: '彩虹城中心',
    note: '完成旧版小伙伴登记',
    source: '7k7k 获取海宝小伙伴',
    reward: {
      coins: 40,
      items: [
        { itemId: 'pokeball_normal', quantity: 2 },
        { itemId: 'potion_small', quantity: 1 },
      ],
    },
  },
  {
    id: 'doris_training',
    title: '多丽丝训练',
    place: '任务大厅',
    note: '跟随多丽丝熟悉战斗',
    source: '7k7k 多丽丝的任务',
    petId: 'dew_sprite',
    level: 9,
  },
  {
    id: 'main_task_report',
    title: '主要任务统计',
    place: '任务面板',
    note: '整理主线进度领取补给',
    source: '7k7k 主要任务统计',
    reward: {
      coins: 90,
      items: [{ itemId: 'exp_candy', quantity: 1 }],
    },
  },
  {
    id: 'level_course',
    title: '升级说明',
    place: '训练场',
    note: '完成旧版升级教程',
    source: '7k7k 升级说明',
    reward: {
      coins: 50,
      items: [{ itemId: 'potion_medium', quantity: 1 }],
    },
  },
  {
    id: 'crystal_mine',
    title: '水晶矿洞',
    place: '迷宫入口',
    note: '采集净化水晶',
    source: '旧版采集玩法复刻',
    reward: {
      coins: 70,
      items: [
        { itemId: 'crystal_shard', quantity: 2 },
        { itemId: 'evo_stone_light', quantity: 1 },
      ],
    },
  },
  {
    id: 'night_emperor_patrol',
    title: '夜帝巡游',
    place: '迷宫深处',
    note: '夜帝英格玛巡逻中',
    source: '7k7k 玩偶大全',
    petId: 'ingmar_night',
    level: 30,
  },
  {
    id: 'gunner_fort',
    title: '机枪手要塞',
    place: '飞船内部',
    note: '机枪手伦纳德守卫设备',
    source: '7k7k 玩偶大全',
    petId: 'leonard_gunner',
    level: 22,
  },
  {
    id: 'maori_visit',
    title: '毛利人来访',
    place: '鱼民之家',
    note: '毛利人丢丢带来礼物',
    source: '7k7k 玩偶大全',
    petId: 'diudiu_maori',
    level: 16,
  },
  {
    id: 'angel_chest_event',
    title: '天使宝箱',
    place: '玩偶基地',
    note: '旧版宝箱活动补给',
    source: '旧版活动资料',
    reward: {
      coins: 80,
      items: [
        { itemId: 'angel_chest', quantity: 1 },
        { itemId: 'pokeball_great', quantity: 1 },
      ],
    },
  },
  {
    id: 'magic_secret',
    title: '魔法秘境',
    place: '迷宫深处',
    note: '收集秘境里的净化水晶',
    source: '7k7k 旧版玩法资料',
    reward: {
      coins: 90,
      items: [
        { itemId: 'crystal_shard', quantity: 2 },
        { itemId: 'evo_stone_light', quantity: 1 },
      ],
    },
  },
  {
    id: 'gold_shell_labor',
    title: '金贝劳动',
    place: '彩虹城中心',
    note: '完成一次旧版劳动委托',
    source: '7k7k 赚钱玩法资料',
    reward: {
      coins: 100,
      items: [{ itemId: 'gold_shell', quantity: 2 }],
    },
  },
  {
    id: 'trade_supply',
    title: '交易补给',
    place: '图书馆',
    note: '整理旧版交易清单',
    source: '7k7k 交易系统资料',
    reward: {
      coins: 30,
      costItems: [
        { itemId: 'gold_shell', quantity: 1 },
        { itemId: 'repair_chip', quantity: 1 },
      ],
      items: [
        { itemId: 'pokeball_ultra', quantity: 1 },
        { itemId: 'potion_medium', quantity: 1 },
      ],
    },
  },
];

export class ActivityScene extends Phaser.Scene {
  private fromScene: string = SceneKey.WORLD;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private taskPanel: Phaser.GameObjects.Container | null = null;
  private miniGamePanel: Phaser.GameObjects.Container | null = null;
  private miniGameCleanups: Array<() => void> = [];
  private page = 0;

  public constructor() {
    super({ key: SceneKey.ACTIVITY });
  }

  public init(data?: {
    readonly fromScene?: string;
    readonly justCapturedPetId?: string;
    readonly justDefeatedWildPetId?: string;
    readonly justLostWildBattle?: boolean;
    readonly escapedFromBattle?: boolean;
    readonly rewardMessage?: string;
    readonly page?: number;
  }): void {
    this.fromScene = data?.fromScene ?? this.fromScene ?? SceneKey.WORLD;
    this.page = Phaser.Math.Clamp(data?.page ?? this.page ?? 0, 0, this.maxPage());
    if (data?.rewardMessage) {
      this.pendingToast = data.rewardMessage;
    } else if (data?.justCapturedPetId) {
      const name = getPet(data.justCapturedPetId)?.name ?? '旧版玩偶';
      this.pendingToast = `成功净化并收服 ${name}`;
    } else if (data?.justDefeatedWildPetId) {
      const name = getPet(data.justDefeatedWildPetId)?.name ?? '旧版玩偶';
      this.pendingToast = `净化挑战完成：${name}`;
    } else if (data?.justLostWildBattle) {
      this.pendingToast = '这次净化失败了，先整理队伍再来。';
    } else if (data?.escapedFromBattle) {
      this.pendingToast = '已经离开活动挑战。';
    } else {
      this.pendingToast = null;
    }
  }

  private pendingToast: string | null = null;

  public preload(): void {
    preloadActivityAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.drawBackground();
    this.drawTopBar();
    this.drawActivities();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.taskPanel?.destroy();
      this.taskPanel = null;
      this.closeMiniGame();
      this.clearToast();
    });
    if (this.pendingToast) {
      this.showToast(this.pendingToast);
    }
  }

  private drawBackground(): void {
    createResponsiveMapBackground(this, 'legacy_haidi_lab', {
      stageAlpha: 0.92,
      coverAlpha: 0.92,
    });
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x154f8a, 0.22).setOrigin(0);
    this.add.rectangle(0, 0, GAME_WIDTH, 108, 0x0b3768, 0.72).setOrigin(0);
    this.add
      .text(GAME_WIDTH / 2, 92, '海宝彩虹城 活动广场', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
  }

  private drawTopBar(): void {
    this.createTopButton(56, 44, '返回', () => this.scene.start(this.fromScene));
    this.createTopButton(138, 44, '地图', () =>
      this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.ACTIVITY }),
    );
    this.createTopButton(220, 44, '精灵', () =>
      this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.ACTIVITY }),
    );
    this.createTopButton(302, 44, '图鉴', () =>
      this.scene.start(SceneKey.PET_DEX, { fromScene: SceneKey.ACTIVITY }),
    );
    this.createTopButton(384, 44, '家园', () =>
      this.scene.start(SceneKey.HOME, { fromScene: SceneKey.ACTIVITY }),
    );
    this.createTopButton(466, 44, '背包', () =>
      this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.ACTIVITY }),
    );
    this.createTopButton(548, 44, '存档', () =>
      this.scene.start(SceneKey.SAVE_SLOTS, { fromScene: SceneKey.ACTIVITY }),
    );
    this.createTopButton(630, 44, '签到', () => this.scene.start(SceneKey.VIP_PANEL));
    this.createTopButton(712, 44, '玩法', () =>
      this.scene.start(SceneKey.GUIDE, { fromScene: SceneKey.ACTIVITY }),
    );
  }

  private drawActivities(): void {
    const claimed = this.claimedToday();
    const pageActivities = ACTIVITIES.slice(
      this.page * ACTIVITIES_PER_PAGE,
      this.page * ACTIVITIES_PER_PAGE + ACTIVITIES_PER_PAGE,
    );
    pageActivities.forEach((activity, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = 36 + col * 308;
      const y = 126 + row * 228;
      this.drawActivityCard(activity, x, y, claimed.has(activity.id));
    });
    this.drawActivityPager();
  }

  private drawActivityPager(): void {
    const maxPage = this.maxPage();
    this.createPagerButton(360, 606, '上一页', () => {
      if (this.page <= 0) return;
      this.scene.restart({ fromScene: this.fromScene, page: this.page - 1 });
    });
    this.add
      .text(480, 606, `${this.page + 1}/${maxPage + 1}`, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.createPagerButton(600, 606, '下一页', () => {
      if (this.page >= maxPage) return;
      this.scene.restart({ fromScene: this.fromScene, page: this.page + 1 });
    });
  }

  private maxPage(): number {
    return Math.max(0, Math.ceil(ACTIVITIES.length / ACTIVITIES_PER_PAGE) - 1);
  }

  private drawActivityCard(activity: ActivityDef, x: number, y: number, claimed: boolean): void {
    const rewardPetId = activity.petId ?? activity.reward?.petId;
    const imageKey = this.activityImageKey(activity);
    const accent = this.activityAccentColor(activity);
    const g = this.add.graphics();
    g.fillStyle(0xfffbdf, 0.96);
    g.fillRoundedRect(x, y, CARD_W, CARD_H, 8);
    g.lineStyle(3, accent, 0.95);
    g.strokeRoundedRect(x, y, CARD_W, CARD_H, 8);
    const overlay = this.add.graphics().setDepth(2);
    if (imageKey) {
      this.add
        .image(x + CARD_W / 2, y + 64, imageKey)
        .setDisplaySize(CARD_W - 18, 94)
        .setDepth(1);
      overlay.fillStyle(0x071d38, 0.32);
      overlay.fillRoundedRect(x + 9, y + 9, CARD_W - 18, 94, 6);
      g.fillStyle(0xfffbdf, 0.95);
      g.fillRoundedRect(x + 10, y + 106, CARD_W - 20, 62, 6);
    }
    overlay.fillStyle(rewardPetId ? 0x67c6ee : accent, imageKey ? 0.9 : 0.94);
    overlay.fillRoundedRect(x + 8, y + 8, CARD_W - 16, 30, 6);

    const title = this.add
      .text(x + 18, y + 13, activity.title, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#15426d',
        strokeThickness: 3,
      })
      .setDepth(4);
    const titleMaxWidth = CARD_W - 36;
    if (title.width > titleMaxWidth) {
      title.setScale(Math.max(0.72, titleMaxWidth / title.width), 1);
    }

    this.add
      .text(x + 18, imageKey ? y + 112 : y + 52, activity.place, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#174a6b',
        wordWrap: { width: CARD_W - 120 },
      })
      .setDepth(4);
    if (!imageKey) {
      this.add
        .text(x + 18, y + 70, activity.note, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '13px',
          color: '#2d5a70',
          wordWrap: { width: CARD_W - 122 },
        })
        .setDepth(4);
    }
    this.drawCardBadge(
      x + 16,
      imageKey || rewardPetId ? y + 134 : y + 122,
      this.activityBadgeText(activity, claimed),
      accent,
    );
    const sourceText = activity.tasks
      ? `任务进度：${this.completedTaskIds(activity).size}/${activity.tasks.length}`
      : activity.reward?.costItems?.length
        ? `需要：${this.formatCost(activity.reward.costItems)}`
        : activity.source;
    const compactSourceText =
      !imageKey && rewardPetId ? (activity.source.split(/\s+/)[0] ?? activity.source) : sourceText;
    const source = this.add
      .text(x + CARD_W - 18, imageKey || rewardPetId ? y + 137 : y + 104, compactSourceText, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '11px',
        color: imageKey ? '#fff7c7' : '#6a7f8d',
        stroke: imageKey ? '#0b3768' : '#000000',
        strokeThickness: imageKey ? 3 : 0,
        wordWrap: { width: 118 },
        align: 'right',
      })
      .setOrigin(1, 0)
      .setDepth(4);
    if (source.height > 30) {
      source.setScale(1, 30 / source.height);
    }

    const summaryText = this.add
      .text(
        x + 18,
        imageKey ? y + 158 : rewardPetId ? y + 148 : y + 144,
        this.rewardSummary(activity),
        {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '11px',
          color: '#2b627a',
        },
      )
      .setDepth(4);
    const summaryMaxWidth = imageKey || rewardPetId ? CARD_W - 36 : CARD_W - 118;
    if (summaryText.width > summaryMaxWidth) {
      summaryText.setScale(summaryMaxWidth / summaryText.width);
    }

    if (imageKey && rewardPetId) {
      this.drawTinyPetBadge(rewardPetId, x + CARD_W - 42, y + 92);
    } else if (rewardPetId) {
      this.drawPetPreview(rewardPetId, x + CARD_W - 58, y + 78);
    } else if (!imageKey) {
      this.drawRewardIcon(x + CARD_W - 58, y + 82);
    }

    const label = activity.petId
      ? `挑战 Lv${activity.level ?? 1}`
      : claimed
        ? '今日已领'
        : activity.tasks
          ? '查看任务'
          : activity.reward?.costItems?.length
            ? '兑换补给'
            : '领取奖励';
    const openActivity = (): void => {
      if (activity.petId) {
        this.startPetBattle(activity);
      } else if (activity.tasks) {
        this.openTaskPanel(activity);
      } else {
        this.claimReward(activity);
      }
    };
    this.createCardButton(
      x + CARD_W / 2,
      y + CARD_H - 24,
      label,
      claimed && !activity.petId,
      openActivity,
    );
    this.createActivityCardHitZone(x, y, accent, openActivity);
  }

  private drawPetPreview(petId: string, x: number, y: number): void {
    const textureKey = ensurePetTexture(this, petId);
    this.add.ellipse(x, y + 30, 78, 18, 0x000000, 0.16);
    const image = this.add.image(x, y + 10, textureKey).setOrigin(0.5, 0.72);
    const source = this.textures.get(textureKey).getSourceImage() as {
      width: number;
      height: number;
    };
    image.setScale(74 / Math.max(source.width, source.height));
  }

  private drawTinyPetBadge(petId: string, x: number, y: number): void {
    const textureKey = ensurePetTexture(this, petId);
    this.add.ellipse(x, y + 15, 46, 12, 0x000000, 0.18).setDepth(3);
    const image = this.add.image(x, y, textureKey).setOrigin(0.5, 0.72).setDepth(4);
    const source = this.textures.get(textureKey).getSourceImage() as {
      width: number;
      height: number;
    };
    image.setScale(42 / Math.max(source.width, source.height));
  }

  private activityAccentColor(activity: ActivityDef): number {
    if (activity.id.includes('crystal')) return 0x48c8ff;
    if (activity.id.includes('star')) return 0x8f7cff;
    if (activity.id.includes('carnival')) return 0xff8fd8;
    if (activity.reward?.petId || activity.petId) return 0x67c6ee;
    if (activity.tasks) return 0xffb84d;
    return 0x2d91c8;
  }

  private activityBadgeText(activity: ActivityDef, claimed: boolean): string {
    if (claimed && !activity.petId) return '今日完成';
    if (activity.reward?.petId) return '精灵奖励';
    if (activity.tasks) return '连锁挑战';
    if (activity.petId) return '精灵挑战';
    if (activity.reward?.costItems?.length) return '兑换';
    return '补给';
  }

  private drawCardBadge(x: number, y: number, label: string, color: number): void {
    const width = Math.max(62, label.length * 16 + 18);
    const g = this.add.graphics().setDepth(3);
    g.fillStyle(0x071d38, 0.42);
    g.fillRoundedRect(x + 2, y + 3, width, 22, 11);
    g.fillStyle(color, 0.92);
    g.fillRoundedRect(x, y, width, 22, 11);
    g.lineStyle(1, 0xffffff, 0.86);
    g.strokeRoundedRect(x, y, width, 22, 11);
    this.add
      .text(x + width / 2, y + 11, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#12324e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(4);
  }

  private rewardSummary(activity: ActivityDef): string {
    const pieces: string[] = [];
    if (activity.petId) {
      const petName = getPet(activity.petId)?.name ?? activity.petId;
      return `目标：${petName} Lv${activity.level ?? 1}`;
    }
    if (activity.reward?.petId) {
      const petName = getPet(activity.reward.petId)?.name ?? activity.reward.petId;
      pieces.push(`${petName} Lv${activity.reward.petLevel ?? 5}`);
    }
    if (activity.reward?.coins) pieces.push(`${activity.reward.coins}彩贝`);
    for (const item of activity.reward?.items?.slice(0, 2) ?? []) {
      pieces.push(`${getItem(item.itemId)?.name ?? item.itemId}x${item.quantity}`);
    }
    if (pieces.length <= 0) return activity.note;
    const shown = pieces.slice(0, 2).join('、');
    return `奖励：${shown}${pieces.length > 2 ? ' 等' : ''}`;
  }

  private activityImageKey(activity: ActivityDef): string | null {
    const key = ACTIVITY_IMAGE_KEYS[activity.id];
    return key && this.textures.exists(key) ? key : null;
  }

  private drawActivityIllustration(
    panel: Phaser.GameObjects.Container,
    activity: ActivityDef,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const imageKey = this.activityImageKey(activity);
    if (!imageKey) return;
    const frame = this.add.graphics();
    frame.fillStyle(0xffffff, 0.92);
    frame.fillRoundedRect(x - width / 2 - 5, y - height / 2 - 5, width + 10, height + 10, 8);
    frame.lineStyle(3, 0xffd93d, 0.95);
    frame.strokeRoundedRect(x - width / 2 - 5, y - height / 2 - 5, width + 10, height + 10, 8);
    const image = this.add.image(x, y, imageKey);
    const frameData = this.textures.getFrame(imageKey);
    if (frameData) {
      const scale = Math.min(width / frameData.width, height / frameData.height);
      image.setDisplaySize(frameData.width * scale, frameData.height * scale);
    } else {
      image.setDisplaySize(width, height);
    }
    const shade = this.add.graphics();
    shade.fillStyle(0x071d38, 0.16);
    shade.fillRoundedRect(x - width / 2, y - height / 2, width, height, 6);
    panel.add([frame, image, shade]);
  }

  private drawRewardIcon(x: number, y: number): void {
    const g = this.add.graphics();
    g.fillStyle(0xffd35a, 1);
    g.fillCircle(x, y, 34);
    g.lineStyle(4, 0xffffff, 0.9);
    g.strokeCircle(x, y, 30);
    g.fillStyle(0x39a96b, 1);
    g.fillCircle(x - 12, y + 2, 9);
    g.fillStyle(0x4aa3ff, 1);
    g.fillCircle(x + 10, y - 8, 10);
    this.add
      .text(x, y + 2, '奖', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        stroke: '#8a4a00',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
  }

  private formatCost(
    items: ReadonlyArray<{ readonly itemId: string; readonly quantity: number }>,
  ): string {
    return items
      .map((item) => `${getItem(item.itemId)?.name ?? item.itemId}x${item.quantity}`)
      .join('、');
  }

  private startPetBattle(activity: ActivityDef): void {
    const activePet = PlayerState.snapshot().playerPets[0];
    if (!activePet) {
      this.showToast('还没有可出战的精灵。');
      return;
    }
    const live = PlayerState.getPlayerPet(activePet.petId);
    if (live && live.currentHp <= 0) {
      live.currentHp = live.currentStats.hp;
      PlayerState.persist();
    }
    this.scene.start(SceneKey.BATTLE_INTRO, {
      mode: 'wild',
      petId: activePet.petId,
      wildPetId: activity.petId,
      wildLevel: activity.level ?? 1,
      fromScene: SceneKey.ACTIVITY,
    });
  }

  private claimReward(activity: ActivityDef): void {
    if (!activity.reward) return;
    const claimed = this.claimedToday();
    if (claimed.has(activity.id)) {
      this.showToast('这个活动今天已经领过了。');
      return;
    }
    if (activity.tasks && !this.areTasksComplete(activity)) {
      this.openTaskPanel(activity);
      this.showToast('先按顺序完成活动任务。');
      return;
    }
    for (const item of activity.reward.costItems ?? []) {
      if (PlayerState.getItemCount(item.itemId) < item.quantity) {
        this.showToast(`${activity.title} 需要先准备材料。`);
        return;
      }
    }
    for (const item of activity.reward.costItems ?? []) {
      PlayerState.removeItem(item.itemId, item.quantity);
    }
    if (activity.reward.coins) {
      PlayerState.addCoins(activity.reward.coins);
    }
    for (const item of activity.reward.items ?? []) {
      PlayerState.addItem(item.itemId, item.quantity);
    }
    const petGrant = activity.reward.petId
      ? this.grantRewardPet(activity.reward.petId, activity.reward.petLevel ?? 5)
      : null;
    claimed.add(activity.id);
    this.writeClaimedToday(claimed);
    const petSuffix =
      petGrant?.placement === 'party'
        ? `，${petGrant.name} 已加入队伍`
        : petGrant?.placement === 'storage'
          ? `，${petGrant.name} 已进入精灵仓库`
          : petGrant?.placement === 'duplicate'
            ? `，${petGrant.name} 已拥有，道具照常发放`
            : '';
    this.scene.restart({
      fromScene: this.fromScene,
      page: this.page,
      rewardMessage: `${activity.title} 奖励已放入背包${petSuffix}。`,
    });
  }

  private openTaskPanel(activity: ActivityDef): void {
    if (!activity.tasks) return;
    this.taskPanel?.destroy();
    const completed = this.completedTaskIds(activity);
    const nextTask = activity.tasks.find((task) => !completed.has(task.id)) ?? null;
    const panel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(1200);
    const g = this.add.graphics();
    g.fillStyle(0x071d38, 0.84);
    g.fillRoundedRect(-340, -214, 680, 428, 10);
    g.lineStyle(4, 0xffd93d, 0.92);
    g.strokeRoundedRect(-340, -214, 680, 428, 10);
    g.fillStyle(0x0b6faf, 0.95);
    g.fillRoundedRect(-318, -194, 636, 52, 8);
    panel.add(g);
    panel.add(
      this.add
        .text(0, -168, activity.title, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '28px',
          color: '#fff4a8',
          stroke: '#1b1b3a',
          strokeThickness: 5,
        })
        .setOrigin(0.5),
    );
    const imageKey = this.activityImageKey(activity);
    if (imageKey) {
      this.drawActivityIllustration(panel, activity, -212, -36, 204, 138);
    }
    activity.tasks.forEach((task, index) => {
      const done = completed.has(task.id);
      const current = nextTask?.id === task.id;
      const y = -104 + index * 58;
      const rowX = imageKey ? -86 : -300;
      const rowW = imageKey ? 376 : 600;
      const row = this.add.graphics();
      row.fillStyle(done ? 0x2f9d67 : current ? 0xffb84d : 0xe8fbff, done || current ? 0.96 : 0.76);
      row.fillRoundedRect(rowX, y - 22, rowW, 44, 8);
      row.lineStyle(2, current ? 0xffffff : 0x67c6ee, 0.72);
      row.strokeRoundedRect(rowX, y - 22, rowW, 44, 8);
      panel.add(row);
      panel.add(
        this.add
          .text(rowX + 14, y, `${done ? '✓' : index + 1}. ${task.title}`, {
            fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
            fontSize: '17px',
            color: done ? '#ffffff' : '#174a6b',
            stroke: done ? '#0b4f39' : '#ffffff',
            strokeThickness: done ? 3 : 2,
          })
          .setOrigin(0, 0.5),
      );
      panel.add(
        this.add
          .text(imageKey ? rowX + 134 : -98, y, task.detail, {
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontSize: '14px',
            color: done ? '#ffffff' : '#2d5a70',
            wordWrap: { width: imageKey ? 226 : 360 },
          })
          .setOrigin(0, 0.5),
      );
    });

    if (nextTask) {
      this.createTaskPanelButton(panel, -84, 164, `开始：${nextTask.title}`, () =>
        this.startActivityTask(activity, nextTask),
      );
    } else {
      this.createTaskPanelButton(panel, -84, 164, '领取最终奖励', () => this.claimReward(activity));
    }
    this.createTaskPanelButton(panel, 188, 164, '关闭', () => {
      this.taskPanel?.destroy();
      this.taskPanel = null;
    });
    this.taskPanel = panel;
  }

  private createTaskPanelButton(
    panel: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(0xff9f2f, 0.98);
    g.lineStyle(2, 0xffffff, 1);
    g.fillRoundedRect(x - 98, y - 18, 196, 36, 7);
    g.strokeRoundedRect(x - 98, y - 18, 196, 36, 7);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#8a4a00',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const hit = this.add
      .zone(x, y, 196, 36)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
    panel.add([g, text, hit]);
  }

  private startActivityTask(activity: ActivityDef, task: ActivityTask): void {
    const completed = this.completedTaskIds(activity);
    const expected = activity.tasks?.find((candidate) => !completed.has(candidate.id));
    if (!expected || expected.id !== task.id) {
      this.showToast('需要按顺序完成前面的任务。');
      return;
    }

    switch (task.id) {
      case 'core_relay':
      case 'core_relay_overdrive':
        this.openCoreRelayMiniGame(activity, task);
        return;
      case 'tide_purify':
      case 'tide_purify_overdrive':
        this.openTidePurifyMiniGame(activity, task);
        return;
      case 'rhythm_rush':
        this.openRhythmRushMiniGame(activity, task);
        return;
      case 'crystal_rush':
        this.openCrystalRushMiniGame(activity, task);
        return;
      case 'star_memory':
        this.openStarMemoryMiniGame(activity, task);
        return;
      case 'bubble_rescue':
        this.openBubbleRescueMiniGame(activity, task);
        return;
      case 'warmup':
        this.openWarmupMiniGame(activity, task);
        return;
      case 'dribble':
        this.openDribbleMiniGame(activity, task);
        return;
      case 'three_point':
        this.openThreePointMiniGame(activity, task);
        return;
      case 'stage_match':
        this.openStageMatchMiniGame(activity, task);
        return;
      case 'visit_bath_center':
        setPendingActivityTask({
          activityId: activity.id,
          taskId: task.id,
          target: 'bath_center',
        });
        this.taskPanel?.destroy();
        this.taskPanel = null;
        this.showToast('请真正进入洗浴中心，到达后会自动记录任务进度。');
        this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: 'bath_center' });
        return;
      case 'return_home':
        setPendingActivityTask({
          activityId: activity.id,
          taskId: task.id,
          target: 'home',
        });
        this.taskPanel?.destroy();
        this.taskPanel = null;
        this.showToast('请真正返回家园，到达后会自动记录任务进度。');
        this.scene.start(SceneKey.HOME, { fromScene: SceneKey.ACTIVITY });
        return;
      default:
        this.openWarmupMiniGame(activity, task);
    }
  }

  private createMiniGameShell(title: string, detail: string): Phaser.GameObjects.Container {
    this.taskPanel?.destroy();
    this.taskPanel = null;
    this.closeMiniGame();

    const panel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(1300);
    const bg = this.add.graphics();
    bg.fillStyle(0x071d38, 0.88);
    bg.fillRoundedRect(-340, -214, 680, 428, 10);
    bg.lineStyle(4, 0xffd93d, 0.92);
    bg.strokeRoundedRect(-340, -214, 680, 428, 10);
    bg.fillStyle(0x0b6faf, 0.95);
    bg.fillRoundedRect(-318, -194, 636, 54, 8);
    panel.add(bg);
    panel.add(
      this.add
        .text(0, -168, title, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '27px',
          color: '#fff4a8',
          stroke: '#1b1b3a',
          strokeThickness: 5,
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(0, -122, detail, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 3,
          align: 'center',
          wordWrap: { width: 580 },
        })
        .setOrigin(0.5),
    );
    this.createTaskPanelButton(panel, 220, 166, '退出练习', () => this.closeMiniGame());
    this.miniGamePanel = panel;
    return panel;
  }

  private openWarmupMiniGame(activity: ActivityDef, task: ActivityTask): void {
    const panel = this.createMiniGameShell('热身签到', '按顺序点亮 5 个节拍光圈，完成篮球场热身。');
    const positions = [
      { x: -210, y: -22 },
      { x: -96, y: 48 },
      { x: 42, y: -6 },
      { x: 170, y: 58 },
      { x: 226, y: -46 },
    ] as const;
    const targetLayer = this.add.container(0, 0);
    panel.add(targetLayer);
    const progressText = this.add
      .text(-244, 142, '进度 0/5', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5);
    panel.add(progressText);
    let step = 0;
    const renderTarget = (): void => {
      targetLayer.removeAll(true);
      progressText.setText(`进度 ${step}/${positions.length}`);
      if (step >= positions.length) {
        this.finishActivityTask(activity, task);
        return;
      }
      const target = positions[step];
      if (!target) return;
      const g = this.add.graphics();
      g.fillStyle(0xffd93d, 0.24);
      g.fillCircle(target.x, target.y, 42);
      g.lineStyle(5, 0xffffff, 0.9);
      g.strokeCircle(target.x, target.y, 38);
      g.fillStyle(0xff9f2f, 0.95);
      g.fillCircle(target.x, target.y, 16);
      const zone = this.add
        .zone(target.x, target.y, 86, 86)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          step += 1;
          renderTarget();
        });
      targetLayer.add([g, zone]);
    };
    renderTarget();
  }

  private openDribbleMiniGame(activity: ActivityDef, task: ActivityTask): void {
    const panel = this.createMiniGameShell(
      '运球练习',
      '按提示完成方向节奏。可以点按钮，也可以按键盘方向键。',
    );
    const sequence = ['左', '右', '左', '右', '上', '下'] as const;
    let index = 0;
    const status = this.add
      .text(0, -44, '', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    panel.add(status);
    const updateStatus = (): void => {
      status.setText(`节奏 ${index}/${sequence.length}  下一个：${sequence[index] ?? '完成'}`);
    };
    const handle = (input: string): void => {
      if (input === sequence[index]) {
        index += 1;
        if (index >= sequence.length) {
          this.finishActivityTask(activity, task);
          return;
        }
      } else {
        index = 0;
        this.showToast('节奏乱了，重新运球。');
      }
      updateStatus();
    };
    updateStatus();
    [
      { label: '左', x: -132, y: 60 },
      { label: '右', x: 132, y: 60 },
      { label: '上', x: 0, y: 20 },
      { label: '下', x: 0, y: 102 },
    ].forEach((button) => {
      this.createTaskPanelButton(panel, button.x, button.y, button.label, () =>
        handle(button.label),
      );
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      const keyMap: Record<string, string> = {
        ArrowLeft: '左',
        ArrowRight: '右',
        ArrowUp: '上',
        ArrowDown: '下',
        KeyA: '左',
        KeyD: '右',
        KeyW: '上',
        KeyS: '下',
      };
      const value = keyMap[event.code];
      if (value) handle(value);
    };
    this.input.keyboard?.on('keydown', onKeyDown);
    this.miniGameCleanups.push(() => this.input.keyboard?.off('keydown', onKeyDown));
  }

  private openThreePointMiniGame(activity: ActivityDef, task: ActivityTask): void {
    const panel = this.createMiniGameShell(
      '三分投篮',
      '光标进入中间绿色命中区时投篮，命中 3 球完成任务。',
    );
    let score = 0;
    const gauge = this.add.graphics();
    gauge.fillStyle(0xe8fbff, 0.95);
    gauge.fillRoundedRect(-190, -20, 380, 38, 8);
    gauge.fillStyle(0x39a96b, 0.92);
    gauge.fillRoundedRect(-42, -20, 84, 38, 8);
    gauge.lineStyle(3, 0xffffff, 0.9);
    gauge.strokeRoundedRect(-190, -20, 380, 38, 8);
    panel.add(gauge);
    const marker = this.add.rectangle(-180, -1, 8, 64, 0xff9f2f, 1);
    panel.add(marker);
    const status = this.add
      .text(0, 58, '命中 0/3', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '22px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    panel.add(status);
    const tween = this.tweens.add({
      targets: marker,
      x: 180,
      duration: 980,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.miniGameCleanups.push(() => tween.stop());
    this.createTaskPanelButton(panel, -20, 130, '投篮', () => {
      if (Math.abs(marker.x) <= 42) {
        score += 1;
        status.setText(`命中 ${score}/3`);
        if (score >= 3) {
          this.finishActivityTask(activity, task);
        }
      } else {
        score = Math.max(0, score - 1);
        status.setText(`偏了！命中 ${score}/3`);
      }
    });
  }

  private openStageMatchMiniGame(activity: ActivityDef, task: ActivityTask): void {
    const panel = this.createMiniGameShell('舞台合练', '跟上舞台节拍，点中 5 个出现的篮球音符。');
    let hits = 0;
    const status = this.add
      .text(0, 128, '节拍 0/5', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '22px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    panel.add(status);
    const lanes = [-220, -110, 0, 110, 220];
    const spawnNote = (): void => {
      const x = Phaser.Utils.Array.GetRandom(lanes);
      const y = Phaser.Math.Between(-42, 64);
      const note = this.add.graphics();
      note.fillStyle(0xff9f2f, 0.96);
      note.fillCircle(x, y, 26);
      note.lineStyle(4, 0xffffff, 0.92);
      note.strokeCircle(x, y, 22);
      note.lineStyle(3, 0x7a3d00, 0.9);
      note.lineBetween(x - 18, y, x + 18, y);
      note.lineBetween(x, y - 18, x, y + 18);
      const zone = this.add
        .zone(x, y, 62, 62)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          note.destroy();
          zone.destroy();
          hits += 1;
          status.setText(`节拍 ${hits}/5`);
          if (hits >= 5) {
            this.finishActivityTask(activity, task);
          }
        });
      panel.add([note, zone]);
      this.tweens.add({
        targets: note,
        alpha: 0.15,
        scale: 0.72,
        duration: 1050,
        onComplete: () => {
          note.destroy();
          zone.destroy();
        },
      });
    };
    const timer = this.time.addEvent({ delay: 760, callback: spawnNote, repeat: 12 });
    this.miniGameCleanups.push(() => timer.remove(false));
    spawnNote();
  }

  private openCoreRelayMiniGame(activity: ActivityDef, task: ActivityTask): void {
    const panel = this.createMiniGameShell(
      '虹心接力',
      task.id === 'core_relay_overdrive'
        ? '按虹心提示完成 8 步高压接力。点错会降低稳定度，稳定度归零后会重置。'
        : '按虹心提示完成 6 步五色接力。点错会降低稳定度，稳定度归零后会重置。',
    );
    const sequence =
      task.id === 'core_relay_overdrive'
        ? [0, 2, 4, 1, 3, 0, 4, 2]
        : [0, 2, 4, 1, 3, 2];
    const nodes = [
      { x: -180, y: 40, color: 0x52f08b, glow: 0xc7ffd8, label: '绿' },
      { x: -78, y: -94, color: 0x4eb7ff, glow: 0xcfeeff, label: '蓝' },
      { x: 0, y: 56, color: 0xff5458, glow: 0xffc0c2, label: '红' },
      { x: 96, y: -84, color: 0xffd64d, glow: 0xfff0ba, label: '黄' },
      { x: 186, y: 36, color: 0xcc6bff, glow: 0xf0d2ff, label: '紫' },
    ] as const;

    let step = 0;
    let stability = 3;
    let active = true;
    const beamLayer = this.add.graphics();
    const coreGlow = this.add.circle(0, -48, 92, 0x8fe8ff, 0.18);
    const coreHalo = this.add.circle(0, -48, 54, 0xffd93d, 0.24);
    coreHalo.setStrokeStyle(2, 0xffffff, 0.48);
    const core = this.add.circle(0, -48, 38, 0xfff3b2, 0.95);
    core.setStrokeStyle(4, 0xffffff, 0.92);
    const nodeLayer = this.add.container(0, 0);
    panel.add([beamLayer, coreGlow, coreHalo, core, nodeLayer]);

    const status = this.add
      .text(-246, 132, '', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '19px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5);
    const hint = this.add
      .text(0, 136, '', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#e9fbff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        align: 'center',
        wordWrap: { width: 380 },
      })
      .setOrigin(0.5);
    const roundLabel = this.add
      .text(246, 132, task.id === 'core_relay_overdrive' ? '高压' : '标准', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(1, 0.5);
    panel.add([status, hint, roundLabel]);

    const nodeWidgets = nodes.map((node, index) => {
      const ring = this.add.circle(node.x, node.y, 42, 0x0f305f, 0.42);
      ring.setStrokeStyle(4, node.glow, 0.7);
      const orb = this.add.circle(node.x, node.y, 26, node.color, 0.86);
      orb.setStrokeStyle(4, 0xffffff, 0.88);
      const label = this.add
        .text(node.x, node.y, node.label, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '18px',
          color: '#ffffff',
          stroke: '#14345f',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      const zone = this.add
        .zone(node.x, node.y, 92, 92)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (!active) return;
          const targetIndex = sequence[step];
          if (index === targetIndex) {
            step += 1;
            stability = Math.min(3, stability + 1);
            this.tweens.add({
              targets: [orb, ring],
              scale: 1.16,
              duration: 120,
              yoyo: true,
            });
            if (step >= sequence.length) {
              active = false;
              this.finishActivityTask(activity, task);
              return;
            }
          } else {
            stability -= 1;
            this.showToast('虹心节点偏移了，稳定度下降。');
            if (stability <= 0) {
              step = 0;
              stability = 3;
              this.showToast('虹心回路重置，重新接力。');
            }
          }
          refreshBoard();
        });
      nodeLayer.add([ring, orb, label, zone]);
      return { ring, orb, label };
    });

    const refreshBoard = (): void => {
      beamLayer.clear();
      const activeIndex = sequence[step];
      const activeNode = activeIndex === undefined ? undefined : nodes[activeIndex];
      status.setText(`接力 ${step}/${sequence.length}  稳定 ${stability}/3`);
      hint.setText(
        activeNode === undefined
          ? '虹心装置已满载，继续保持节奏。'
          : `下一个节点：${activeNode.label}`,
      );

      for (let i = 0; i < sequence.length - 1; i += 1) {
        const fromIndex = sequence[i];
        const toIndex = sequence[i + 1];
        if (fromIndex === undefined || toIndex === undefined) continue;
        const from = nodes[fromIndex];
        const to = nodes[toIndex];
        if (!from || !to) continue;
        const finished = i < step - 1;
        beamLayer.lineStyle(7, from.color, finished ? 0.9 : 0.18);
        beamLayer.lineBetween(from.x, from.y, to.x, to.y);
      }
      beamLayer.lineStyle(3, 0xffffff, 0.22);
      beamLayer.strokeCircle(0, -48, 144);

      nodeWidgets.forEach((widget, index) => {
        const node = nodes[index];
        if (!node) return;
        const current = index === activeIndex;
        const visited = sequence.slice(0, step).includes(index);
        widget.orb.setFillStyle(node.color, current ? 0.98 : visited ? 0.82 : 0.38);
        widget.orb.setStrokeStyle(
          4,
          current ? 0xffffff : node.glow,
          current ? 1 : 0.82,
        );
        widget.ring.setAlpha(current ? 0.95 : visited ? 0.75 : 0.35);
        widget.label.setAlpha(current ? 1 : visited ? 0.88 : 0.55);
      });
    };

    const pulse = this.tweens.add({
      targets: [coreGlow, coreHalo],
      scale: { from: 0.92, to: 1.08 },
      alpha: { from: 0.14, to: 0.28 },
      duration: 920,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.miniGameCleanups.push(() => pulse.stop());

    refreshBoard();
  }

  private openTidePurifyMiniGame(activity: ActivityDef, task: ActivityTask): void {
    const overdrive = task.id === 'tide_purify_overdrive';
    const panel = this.createMiniGameShell(
      overdrive ? '星潮满载净化' : '星潮净化',
      overdrive
        ? '提示切换会更快。看清净化台中央的目标颜色，点亮对应潮能垫完成 9 次校准。'
        : '看清净化台中央的目标颜色，点亮对应潮能垫完成 6 次校准。错过或点错会降低稳定度。',
    );
    const pads = [
      { x: -218, y: 38, color: 0xff565f, glow: 0xffc6c9, label: '红' },
      { x: -106, y: -78, color: 0x4fb8ff, glow: 0xcfedff, label: '蓝' },
      { x: 0, y: 58, color: 0x45d978, glow: 0xc8ffd9, label: '绿' },
      { x: 112, y: -76, color: 0xffd34d, glow: 0xfff1b6, label: '金' },
      { x: 220, y: 38, color: 0xb86bff, glow: 0xf0d4ff, label: '紫' },
    ] as const;
    const required = overdrive ? 9 : 6;
    let purified = 0;
    let stability = 3;
    let targetIndex = Phaser.Math.Between(0, pads.length - 1);
    const initialTarget = pads[targetIndex] ?? pads[0];
    let active = true;

    const channel = this.add.graphics();
    const coreGlow = this.add.circle(0, -28, 82, 0x8fe8ff, 0.17);
    const core = this.add.circle(0, -28, 42, initialTarget.color, 0.96);
    core.setStrokeStyle(5, 0xffffff, 0.92);
    const marker = this.add.circle(initialTarget.x, initialTarget.y, 48, 0xffffff, 0.02);
    marker.setStrokeStyle(5, 0xffffff, 0.9);
    const padLayer = this.add.container(0, 0);
    panel.add([channel, coreGlow, core, marker, padLayer]);

    const status = this.add
      .text(-252, 130, '', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '19px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5);
    const targetText = this.add
      .text(0, 132, '', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#e9fbff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const paceText = this.add
      .text(252, 130, overdrive ? '快速' : '标准', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(1, 0.5);
    panel.add([status, targetText, paceText]);

    const chooseTarget = (): void => {
      const previous = targetIndex;
      do {
        targetIndex = Phaser.Math.Between(0, pads.length - 1);
      } while (targetIndex === previous && pads.length > 1);
    };

    const failStep = (message: string): void => {
      stability -= 1;
      purified = Math.max(0, purified - 1);
      if (stability <= 0) {
        stability = 3;
        purified = 0;
        this.showToast('星潮稳定度归零，净化台重新校准。');
      } else {
        this.showToast(message);
      }
      chooseTarget();
      refreshBoard();
    };

    const finish = (): void => {
      if (!active) return;
      active = false;
      this.finishActivityTask(activity, task);
    };

    const padWidgets = pads.map((pad, index) => {
      const ring = this.add.circle(pad.x, pad.y, 42, 0x123b66, 0.45);
      ring.setStrokeStyle(4, pad.glow, 0.72);
      const orb = this.add.circle(pad.x, pad.y, 27, pad.color, 0.82);
      orb.setStrokeStyle(4, 0xffffff, 0.86);
      const label = this.add
        .text(pad.x, pad.y, pad.label, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '18px',
          color: '#ffffff',
          stroke: '#14345f',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      const zone = this.add
        .zone(pad.x, pad.y, 92, 92)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (!active) return;
          if (index !== targetIndex) {
            failStep('潮能颜色偏移，稳定度下降。');
            return;
          }
          purified += 1;
          stability = Math.min(3, stability + 1);
          this.tweens.add({
            targets: [ring, orb],
            scale: 1.16,
            duration: 120,
            yoyo: true,
          });
          if (purified >= required) {
            finish();
            return;
          }
          chooseTarget();
          refreshBoard();
        });
      padLayer.add([ring, orb, label, zone]);
      return { ring, orb, label };
    });

    function refreshBoard(): void {
      const target = pads[targetIndex];
      if (!target) return;
      channel.clear();
      channel.lineStyle(8, target.color, 0.45);
      channel.lineBetween(0, -28, target.x, target.y);
      channel.lineStyle(2, 0xffffff, 0.22);
      channel.strokeCircle(0, -28, 132);
      marker.setPosition(target.x, target.y);
      marker.setStrokeStyle(5, target.glow, 0.95);
      core.setFillStyle(target.color, 0.96);
      status.setText(`净化 ${purified}/${required}  稳定 ${stability}/3`);
      targetText.setText(`目标：${target.label}色潮能`);
      padWidgets.forEach((widget, index) => {
        const pad = pads[index];
        if (!pad) return;
        const current = index === targetIndex;
        widget.ring.setAlpha(current ? 1 : 0.45);
        widget.orb.setAlpha(current ? 1 : 0.58);
        widget.orb.setStrokeStyle(4, current ? 0xffffff : pad.glow, current ? 1 : 0.7);
        widget.label.setAlpha(current ? 1 : 0.68);
      });
    }

    const pulse = this.tweens.add({
      targets: [coreGlow, marker],
      scale: { from: 0.94, to: 1.08 },
      alpha: { from: 0.15, to: 0.34 },
      duration: overdrive ? 620 : 820,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const timer = this.time.addEvent({
      delay: overdrive ? 1120 : 1480,
      callback: () => {
        if (!active) return;
        failStep('星潮提示已经切换，稳定度下降。');
      },
      repeat: -1,
    });
    this.miniGameCleanups.push(() => {
      active = false;
      pulse.stop();
      timer.remove(false);
    });
    refreshBoard();
  }

  private openRhythmRushMiniGame(activity: ActivityDef, task: ActivityTask): void {
    const panel = this.createMiniGameShell(
      '限时连击',
      '音符出现后迅速点中它们，14 秒内打出 6 连击即可完成。',
    );
    let hits = 0;
    let combo = 0;
    let seconds = 14;
    let active = true;
    const noteLayer = this.add.container(0, 0);
    panel.add(noteLayer);
    const status = this.add
      .text(-254, 126, '连击 0/6', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5);
    const timerText = this.add
      .text(242, 126, '14s', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#ffdf5d',
        stroke: '#1b1b3a',
        strokeThickness: 5,
      })
      .setOrigin(1, 0.5);
    panel.add([status, timerText]);

    const updateStatus = (): void => {
      status.setText(`连击 ${hits}/6  当前x${combo}`);
      timerText.setText(`${seconds}s`);
    };
    const resetRound = (): void => {
      hits = 0;
      combo = 0;
      seconds = 14;
      noteLayer.removeAll(true);
      updateStatus();
      this.showToast('时间到了，灯阵重新开始。');
    };
    const finish = (): void => {
      if (!active) return;
      active = false;
      this.finishActivityTask(activity, task);
    };
    const spawnNote = (): void => {
      if (!active) return;
      const x = Phaser.Math.Between(-246, 246);
      const y = Phaser.Math.Between(-58, 78);
      const note = this.add.star(x, y, 5, 12, 29, 0xffd93d, 0.96);
      note.setStrokeStyle(4, 0xffffff, 0.88);
      const glow = this.add.circle(x, y, 42, 0xff9f2f, 0.18);
      glow.setStrokeStyle(2, 0xffffff, 0.64);
      const zone = this.add
        .zone(x, y, 76, 76)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (!active) return;
          note.destroy();
          glow.destroy();
          zone.destroy();
          hits += 1;
          combo += 1;
          updateStatus();
          if (hits >= 6) {
            finish();
          }
        });
      noteLayer.add([glow, note, zone]);
      this.tweens.add({
        targets: [note, glow],
        scale: 0.45,
        alpha: 0.12,
        duration: 920,
        ease: 'Sine.easeIn',
        onComplete: () => {
          if (!note.active) return;
          note.destroy();
          glow.destroy();
          zone.destroy();
          combo = 0;
          updateStatus();
        },
      });
    };

    const spawnTimer = this.time.addEvent({ delay: 620, callback: spawnNote, repeat: -1 });
    const countdown = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (!active) return;
        seconds -= 1;
        if (seconds <= 0) {
          resetRound();
        } else {
          updateStatus();
        }
      },
      repeat: -1,
    });
    this.miniGameCleanups.push(() => {
      active = false;
      spawnTimer.remove(false);
      countdown.remove(false);
    });
    updateStatus();
    spawnNote();
  }

  private openCrystalRushMiniGame(activity: ActivityDef, task: ActivityTask): void {
    const panel = this.createMiniGameShell(
      '极速采集',
      '采到 7 个亮晶晶目标即可完成；点到暗淡陷阱会扣进度。',
    );
    let collected = 0;
    let seconds = 16;
    let active = true;
    const targetLayer = this.add.container(0, 0);
    panel.add(targetLayer);
    const status = this.add
      .text(-254, 126, '采集 0/7', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5);
    const timerText = this.add
      .text(242, 126, '16s', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#8fe8ff',
        stroke: '#1b1b3a',
        strokeThickness: 5,
      })
      .setOrigin(1, 0.5);
    panel.add([status, timerText]);

    const updateStatus = (): void => {
      status.setText(`采集 ${collected}/7`);
      timerText.setText(`${seconds}s`);
    };
    const resetRound = (): void => {
      collected = 0;
      seconds = 16;
      targetLayer.removeAll(true);
      updateStatus();
      this.showToast('矿灯暗了，重新开采。');
      spawnShard();
    };
    const finish = (): void => {
      if (!active) return;
      active = false;
      this.finishActivityTask(activity, task);
    };
    const spawnShard = (): void => {
      if (!active) return;
      targetLayer.removeAll(true);
      const trap = Math.random() < 0.26;
      const x = Phaser.Math.Between(-250, 250);
      const y = Phaser.Math.Between(-70, 78);
      const color = trap ? 0x45516d : 0x8fe8ff;
      const crystal = this.add.triangle(x, y, 0, -28, 22, 22, -22, 22, color, 0.96);
      crystal.setStrokeStyle(4, trap ? 0x9aa3b8 : 0xffffff, 0.9);
      const glow = this.add.circle(x, y + 6, 44, trap ? 0x000000 : 0x48c8ff, trap ? 0.22 : 0.18);
      const zone = this.add
        .zone(x, y, 82, 82)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (!active) return;
          if (trap) {
            collected = Math.max(0, collected - 1);
            this.showToast('暗矿震动，进度掉了一格。');
          } else {
            collected += 1;
          }
          updateStatus();
          if (collected >= 7) {
            finish();
            return;
          }
          spawnShard();
        });
      targetLayer.add([glow, crystal, zone]);
      this.tweens.add({
        targets: [crystal, glow],
        scale: trap ? 0.92 : 1.16,
        duration: 460,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    };
    const countdown = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (!active) return;
        seconds -= 1;
        if (seconds <= 0) {
          resetRound();
        } else {
          updateStatus();
        }
      },
      repeat: -1,
    });
    this.miniGameCleanups.push(() => {
      active = false;
      countdown.remove(false);
    });
    updateStatus();
    spawnShard();
  }

  private openStarMemoryMiniGame(activity: ActivityDef, task: ActivityTask): void {
    const panel = this.createMiniGameShell(
      '星泡记忆',
      '先观察星泡亮起的顺序，随后按同样顺序点亮它们。',
    );
    const positions = [
      { x: -210, y: -28 },
      { x: -96, y: 70 },
      { x: 12, y: -46 },
      { x: 132, y: 58 },
      { x: 236, y: -10 },
    ] as const;
    const sequence = Array.from({ length: 5 }, () => Phaser.Math.Between(0, positions.length - 1));
    const orbs: Phaser.GameObjects.Arc[] = [];
    let inputIndex = 0;
    let accepting = false;
    const status = this.add
      .text(0, 128, '观察星泡光序...', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '21px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    panel.add(status);

    positions.forEach((pos, index) => {
      const orb = this.add.circle(pos.x, pos.y, 30, 0x8fe8ff, 0.52);
      orb.setStrokeStyle(4, 0xffffff, 0.78);
      const label = this.add
        .text(pos.x, pos.y, `${index + 1}`, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '18px',
          color: '#ffffff',
          stroke: '#0b3768',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      const zone = this.add
        .zone(pos.x, pos.y, 72, 72)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (!accepting) return;
          if (sequence[inputIndex] === index) {
            orb.setFillStyle(0xffd93d, 0.95);
            this.time.delayedCall(180, () => orb.setFillStyle(0x8fe8ff, 0.52));
            inputIndex += 1;
            status.setText(`输入 ${inputIndex}/${sequence.length}`);
            if (inputIndex >= sequence.length) {
              this.finishActivityTask(activity, task);
            }
          } else {
            accepting = false;
            inputIndex = 0;
            status.setText('顺序错了，重新观察。');
            this.showSequence(orbs, sequence, status, () => {
              accepting = true;
              status.setText('轮到你点亮星泡。');
            });
          }
        });
      orbs.push(orb);
      panel.add([orb, label, zone]);
    });
    this.showSequence(orbs, sequence, status, () => {
      accepting = true;
      status.setText('轮到你点亮星泡。');
    });
  }

  private showSequence(
    orbs: readonly Phaser.GameObjects.Arc[],
    sequence: readonly number[],
    status: Phaser.GameObjects.Text,
    onComplete: () => void,
  ): void {
    const timers: Phaser.Time.TimerEvent[] = [];
    sequence.forEach((orbIndex, step) => {
      const timer = this.time.delayedCall(520 + step * 520, () => {
        const orb = orbs[orbIndex];
        if (!orb?.active) return;
        status.setText(`观察 ${step + 1}/${sequence.length}`);
        orb.setFillStyle(0xffd93d, 0.96);
        this.tweens.add({
          targets: orb,
          scale: 1.24,
          duration: 160,
          yoyo: true,
          onComplete: () => {
            if (orb.active) orb.setFillStyle(0x8fe8ff, 0.52);
          },
        });
      });
      timers.push(timer);
    });
    const doneTimer = this.time.delayedCall(680 + sequence.length * 520, onComplete);
    timers.push(doneTimer);
    this.miniGameCleanups.push(() => timers.forEach((timer) => timer.remove(false)));
  }

  private openBubbleRescueMiniGame(activity: ActivityDef, task: ActivityTask): void {
    const panel = this.createMiniGameShell(
      '星泡救援',
      '救下 6 个金色星泡。暗流泡泡会干扰灯塔，点到会扣进度。',
    );
    let rescued = 0;
    let seconds = 15;
    let active = true;
    const bubbleLayer = this.add.container(0, 0);
    panel.add(bubbleLayer);
    const status = this.add
      .text(-254, 126, '救援 0/6', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5);
    const timerText = this.add
      .text(242, 126, '15s', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#8fe8ff',
        stroke: '#1b1b3a',
        strokeThickness: 5,
      })
      .setOrigin(1, 0.5);
    panel.add([status, timerText]);

    const updateStatus = (): void => {
      status.setText(`救援 ${rescued}/6`);
      timerText.setText(`${seconds}s`);
    };
    const resetRound = (): void => {
      rescued = 0;
      seconds = 15;
      bubbleLayer.removeAll(true);
      updateStatus();
      this.showToast('星泡漂远了，重新定位。');
    };
    const finish = (): void => {
      if (!active) return;
      active = false;
      this.finishActivityTask(activity, task);
    };
    const spawnBubble = (): void => {
      if (!active) return;
      const hazard = Math.random() < 0.28;
      const x = Phaser.Math.Between(-250, 250);
      const startY = Phaser.Math.Between(78, 100);
      const bubble = this.add.circle(
        x,
        startY,
        hazard ? 26 : 30,
        hazard ? 0x45516d : 0xfff1a6,
        0.58,
      );
      bubble.setStrokeStyle(4, hazard ? 0xa7b0c0 : 0xffffff, 0.88);
      const star = this.add.star(x, startY, 5, 8, 18, hazard ? 0x78849f : 0xffd93d, 0.92);
      const zone = this.add
        .zone(x, startY, 78, 78)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (!active) return;
          bubble.destroy();
          star.destroy();
          zone.destroy();
          if (hazard) {
            rescued = Math.max(0, rescued - 1);
            this.showToast('暗流泡泡扰乱了灯塔。');
          } else {
            rescued += 1;
          }
          updateStatus();
          if (rescued >= 6) finish();
        });
      bubbleLayer.add([bubble, star, zone]);
      this.tweens.add({
        targets: [bubble, star, zone],
        y: -88,
        alpha: 0.15,
        duration: 1850,
        ease: 'Sine.easeIn',
        onComplete: () => {
          bubble.destroy();
          star.destroy();
          zone.destroy();
        },
      });
    };
    const spawnTimer = this.time.addEvent({ delay: 620, callback: spawnBubble, repeat: -1 });
    const countdown = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (!active) return;
        seconds -= 1;
        if (seconds <= 0) {
          resetRound();
        } else {
          updateStatus();
        }
      },
      repeat: -1,
    });
    this.miniGameCleanups.push(() => {
      active = false;
      spawnTimer.remove(false);
      countdown.remove(false);
    });
    updateStatus();
    spawnBubble();
  }

  private finishActivityTask(activity: ActivityDef, task: ActivityTask): void {
    this.closeMiniGame();
    gameEvents.emit('minigame:complete', {
      minigameId: `activity:${task.id}`,
      score: 100,
    });
    this.completeTask(activity, task);
  }

  private closeMiniGame(): void {
    for (const cleanup of this.miniGameCleanups.splice(0)) {
      cleanup();
    }
    this.miniGamePanel?.destroy();
    this.miniGamePanel = null;
  }

  private completeTask(activity: ActivityDef, task: ActivityTask): void {
    const progress = this.readProgressToday();
    const current = new Set(progress[activity.id] ?? []);
    const expected = activity.tasks?.find((candidate) => !current.has(candidate.id));
    if (!expected || expected.id !== task.id) {
      this.showToast('需要按顺序完成前面的任务。');
      return;
    }
    const completed = completeActivityTask(activity.id, task.id);
    if (!completed) {
      this.showToast('这个阶段今天已经完成了。');
      return;
    }
    this.applyReward(task.reward);
    this.taskPanel?.destroy();
    this.taskPanel = null;
    this.scene.restart({
      fromScene: this.fromScene,
      page: this.page,
      rewardMessage: `${task.title} 完成，继续下一个阶段。`,
    });
  }

  private applyReward(reward?: ActivityReward): void {
    if (!reward) return;
    if (reward.coins) PlayerState.addCoins(reward.coins);
    for (const item of reward.items ?? []) {
      PlayerState.addItem(item.itemId, item.quantity);
    }
  }

  private completedTaskIds(activity: ActivityDef): Set<string> {
    const progress = this.readProgressToday();
    return new Set(progress[activity.id] ?? []);
  }

  private areTasksComplete(activity: ActivityDef): boolean {
    if (!activity.tasks) return true;
    const completed = this.completedTaskIds(activity);
    return activity.tasks.every((task) => completed.has(task.id));
  }

  private readProgressToday(): Record<string, string[]> {
    return readActivityProgressToday();
  }

  private grantRewardPet(
    petId: string,
    level: number,
  ): { readonly name: string; readonly placement: 'party' | 'storage' | 'duplicate' } | null {
    const pet = getPet(petId);
    if (!pet) return null;

    const lv = Math.max(1, Math.floor(level));
    const evolutionStage = stageForWildLevel(lv);
    const placement = PlayerState.addPlayerPet(createPlayerPet(pet, lv, { evolutionStage }));
    return { name: pet.name, placement };
  }

  private claimedToday(): Set<string> {
    const today = todayKey();
    try {
      const raw = globalThis.localStorage?.getItem(ACTIVITY_SAVE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as { date?: string; claimedIds?: string[] };
      if (parsed.date !== today || !Array.isArray(parsed.claimedIds)) return new Set();
      return new Set(parsed.claimedIds.filter((id) => typeof id === 'string'));
    } catch {
      return new Set();
    }
  }

  private writeClaimedToday(claimed: Set<string>): void {
    try {
      globalThis.localStorage?.setItem(
        ACTIVITY_SAVE_KEY,
        JSON.stringify({ date: todayKey(), claimedIds: [...claimed] }),
      );
    } catch {
      // Ignore private browsing storage failures.
    }
  }

  private createTopButton(x: number, y: number, label: string, onClick: () => void): void {
    createNavIconButton(this, {
      x,
      y,
      label,
      onClick,
      depth: 100,
      width: label.length >= 3 ? 86 : 66,
    });
  }

  private createPagerButton(x: number, y: number, label: string, onClick: () => void): void {
    const g = this.add.graphics().setDepth(100);
    g.fillStyle(0x0b3768, 0.72);
    g.fillRoundedRect(x - 54, y - 18, 108, 36, 10);
    g.lineStyle(2, 0xfff4a8, 0.82);
    g.strokeRoundedRect(x - 54, y - 18, 108, 36, 10);
    this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(101);
    this.add
      .zone(x, y, 108, 36)
      .setDepth(102)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
  }

  private createActivityCardHitZone(
    x: number,
    y: number,
    accent: number,
    onClick: () => void,
  ): void {
    const hover = this.add.graphics().setDepth(8);
    const drawHover = (): void => {
      hover.clear();
      hover.lineStyle(3, 0xffffff, 0.88);
      hover.strokeRoundedRect(x + 3, y + 3, CARD_W - 6, CARD_H - 6, 8);
      hover.lineStyle(2, accent, 0.96);
      hover.strokeRoundedRect(x + 7, y + 7, CARD_W - 14, CARD_H - 14, 7);
      hover.fillStyle(0xffffff, 0.12);
      hover.fillRoundedRect(x + 10, y + 10, CARD_W - 20, 34, 6);
    };
    this.add
      .zone(x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H)
      .setDepth(4.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', drawHover)
      .on('pointerout', () => hover.clear())
      .on('pointerdown', drawHover)
      .on('pointerup', onClick);
  }

  private createCardButton(
    x: number,
    y: number,
    label: string,
    disabled: boolean,
    onClick: () => void,
  ): void {
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(disabled ? 0xb8c5cf : 0xff9f2f, 0.98);
    g.lineStyle(2, 0xffffff, 1);
    g.fillRoundedRect(x - 72, y - 15, 144, 30, 6);
    g.strokeRoundedRect(x - 72, y - 15, 144, 30, 6);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: disabled ? '#5f6d77' : '#8a4a00',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    text.setDepth(6);
    if (disabled) {
      text.setAlpha(0.82);
      return;
    }
    this.add
      .zone(x, y, 144, 30)
      .setDepth(7)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
  }

  private showToast(message: string): void {
    this.clearToast();
    this.toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, message, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '19px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.toastTimer = this.time.delayedCall(1800, () => {
      this.toast?.destroy();
      this.toast = null;
      this.toastTimer = null;
    });
  }

  private clearToast(): void {
    if (this.toastTimer) {
      this.toastTimer.remove(false);
      this.toastTimer = null;
    }
    this.toast?.destroy();
    this.toast = null;
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
