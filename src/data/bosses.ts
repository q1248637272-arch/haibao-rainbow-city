import type { BossData } from '@/types';

/**
 * BOSS 数据表。MVP 先只放主 BOSS `shadow_overlord`。
 */
export const BOSSES: Record<string, BossData> = {
  shadow_overlord: {
    id: 'shadow_overlord',
    name: '暗影霸主',
    element: 'normal',
    stats: { hp: 180, atk: 28, def: 22, spd: 18 },
    skillIds: ['tackle', 'power_slam', 'spark_bolt', 'flame_burst'],
    rewardCoins: 500,
    rewardText: '恭喜击败暗影霸主！获得 500 彩虹币。',
    portraitColor: 0x3a2a4a,
    shape: 'diamond',
    visual: {
      legacyShape: 'diamond',
      silhouette: 'static',
      bodyColor: 0x3a2a4a,
      accentColor: 0x6a4a7a,
      outlineColor: 0x1b1b3a,
      shadowOpacity: 0.5,
      sizeClass: 'xlarge',
    },
  },
  vip_card_guardian: {
    id: 'vip_card_guardian',
    name: '星卡守门人',
    element: 'light',
    stats: { hp: 190, atk: 30, def: 24, spd: 24 },
    skillIds: ['rainbow_arc', 'starlight_prayer', 'courage_card', 'star_dust_hit'],
    rewardCoins: 420,
    rewardText: '星卡守门人的光纹散开，彩虹殿堂的第一层试炼完成。',
    portraitColor: 0xffd93d,
    shape: 'star',
    visual: {
      legacyShape: 'star',
      silhouette: 'floater',
      bodyColor: 0xffd93d,
      accentColor: 0xffffff,
      outlineColor: 0x1b1b3a,
      shadowOpacity: 0.36,
      sizeClass: 'large',
    },
  },
  vip_jingwei_echo: {
    id: 'vip_jingwei_echo',
    name: '玄卿试炼影',
    element: 'fire',
    stats: { hp: 210, atk: 34, def: 24, spd: 32 },
    skillIds: ['fill_sea_prayer', 'sky_dive', 'red_magic_card', 'flame_burst'],
    rewardCoins: 520,
    rewardText: '精卫的赤羽划开彩虹雾，会员玩偶玄卿认可了你。',
    portraitColor: 0xf06a42,
    shape: 'bird',
    visual: {
      legacyShape: 'bird',
      silhouette: 'floater',
      bodyColor: 0xf06a42,
      accentColor: 0xffd86a,
      outlineColor: 0x1b1b3a,
      shadowOpacity: 0.3,
      sizeClass: 'large',
    },
  },
  vip_aotian_echo: {
    id: 'vip_aotian_echo',
    name: '傲天试炼影',
    element: 'water',
    stats: { hp: 240, atk: 32, def: 30, spd: 28 },
    skillIds: ['dragon_tide', 'blue_magic_card', 'aqua_shield', 'pearl_bubble'],
    rewardCoins: 620,
    rewardText: '矿井水纹聚成龙影，会员玩偶小龙傲天认可了你。',
    portraitColor: 0x3aa0ff,
    shape: 'turtle',
    visual: {
      legacyShape: 'turtle',
      silhouette: 'biped',
      bodyColor: 0x3aa0ff,
      accentColor: 0x92e7ff,
      outlineColor: 0x1b1b3a,
      shadowOpacity: 0.35,
      sizeClass: 'large',
    },
  },
  vip_rainbow_overlord: {
    id: 'vip_rainbow_overlord',
    name: '彩虹殿堂主',
    element: 'light',
    stats: { hp: 280, atk: 38, def: 34, spd: 30 },
    skillIds: ['rainbow_magic_card', 'sacred_beam', 'starlight_prayer', 'rainbow_arc'],
    rewardCoins: 780,
    rewardText: '彩虹殿堂主收起魔法卡，VIP 终阶试炼完成。',
    portraitColor: 0xffe8b0,
    shape: 'star',
    visual: {
      legacyShape: 'star',
      silhouette: 'floater',
      bodyColor: 0xffe8b0,
      accentColor: 0xff8ff0,
      outlineColor: 0x1b1b3a,
      shadowOpacity: 0.36,
      sizeClass: 'xlarge',
    },
  },
};

/**
 * 安全地按 id 取 BOSS。
 */
export function getBoss(id: string): BossData | undefined {
  return BOSSES[id];
}
