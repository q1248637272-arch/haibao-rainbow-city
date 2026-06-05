import { describe, expect, it } from 'vitest';

import type { PlayerSave } from '@/types';
import { formatHudText } from '@/ui/Hud';

function makeSave(partial: Partial<PlayerSave> = {}): PlayerSave {
  return {
    version: 4,
    playerName: '小海宝',
    coins: 100,
    isVip: false,
    playerPets: [],
    petStorage: [],
    defeatedBossIds: [],
    unlockedMaps: ['rainbow_city'],
    pokeballs: 10,
    inventory: {},
    homeLayout: [],
    questStates: {},
    vip: { lastCheckinDate: null, checkinStreak: 0 },
    settings: { bgmVolume: 0.6, sfxVolume: 0.8 },
    dailyContext: { lastRolledDate: null, shopDiscountIds: [], dailyQuestIds: [] },
    lastSavedAt: 0,
    ...partial,
  };
}

describe('formatHudText', () => {
  it('非 VIP 玩家渲染为 VIP: 否', () => {
    expect(formatHudText(makeSave())).toBe('小海宝 · 金币: 100 · VIP: 否');
  });

  it('VIP 玩家渲染为 VIP: 是 且金币数随 save 同步，末尾追加 VIP 徽章', () => {
    expect(formatHudText(makeSave({ isVip: true, coins: 523 }))).toBe(
      '小海宝 · 金币: 523 · VIP: 是 · VIP⭐',
    );
  });

  it('可自定义玩家昵称', () => {
    expect(formatHudText(makeSave({ playerName: '彩虹冒险家', coins: 0 }))).toBe(
      '彩虹冒险家 · 金币: 0 · VIP: 否',
    );
  });

  it('VIP 玩家末尾徽章格式稳定，非 VIP 无徽章', () => {
    // 非 VIP 尾部绝无徽章字样
    expect(formatHudText(makeSave()).includes('VIP⭐')).toBe(false);
    // VIP 身份必定携带徽章
    expect(formatHudText(makeSave({ isVip: true })).includes('· VIP⭐')).toBe(true);
  });
});
