import { describe, expect, it } from 'vitest';

import { SceneKey } from '@/config/GameConfig';
import { buildGameplaySuggestions } from '@/systems/GameplayAdvisor';
import { defaultSave } from '@/systems/SaveManager';

const TODAY = new Date('2026-05-27T08:00:00.000Z');

describe('GameplayAdvisor', () => {
  it('puts unclaimed daily check-in first because it is the fastest reward', () => {
    const save = defaultSave();
    const suggestions = buildGameplaySuggestions({ save, now: TODAY, max: 3 });

    expect(suggestions[0]?.id).toBe('checkin_today');
    expect(suggestions[0]?.scene).toBe(SceneKey.VIP_PANEL);
  });

  it('surfaces claimable quest rewards before broad exploration advice', () => {
    const save = defaultSave();
    save.vip = { lastCheckinDate: '2026-05-27', checkinStreak: 1 };
    save.questStates.q_main_001 = {
      status: 'claimable',
      progress: {},
      updatedAt: 0,
    };

    const suggestions = buildGameplaySuggestions({ save, now: TODAY, max: 2 });

    expect(suggestions[0]?.id).toBe('claim_quests');
    expect(suggestions[0]?.scene).toBe(SceneKey.QUEST_BOARD);
  });

  it('warns players before exploration when capture supplies are low', () => {
    const save = defaultSave();
    save.vip = { lastCheckinDate: '2026-05-27', checkinStreak: 1 };
    save.inventory = {};

    const suggestions = buildGameplaySuggestions({ save, now: TODAY, max: 4 });

    expect(suggestions.some((suggestion) => suggestion.id === 'restock_balls')).toBe(true);
  });

  it('always keeps a route back to the full gameplay guide', () => {
    const save = defaultSave();
    save.vip = { lastCheckinDate: '2026-05-27', checkinStreak: 3 };
    save.playerPets = [...save.playerPets, ...save.playerPets.map((pet) => ({ ...pet }))];

    const suggestions = buildGameplaySuggestions({ save, now: TODAY, max: 20 });

    expect(suggestions.some((suggestion) => suggestion.scene === SceneKey.GUIDE)).toBe(true);
  });

  it('surfaces active daily commissions as a playable next step', () => {
    const save = defaultSave();
    save.vip = { lastCheckinDate: '2026-05-27', checkinStreak: 3 };
    save.dailyContext = {
      ...save.dailyContext,
      dailyQuestIds: ['d_farm_harvest_log'],
    };
    save.questStates.d_farm_harvest_log = {
      status: 'active',
      progress: {},
      updatedAt: 0,
    };

    const suggestions = buildGameplaySuggestions({ save, now: TODAY, max: 20 });

    const daily = suggestions.find((suggestion) => suggestion.id === 'daily_commissions');
    expect(daily?.scene).toBe(SceneKey.FARM);
  });

  it('routes active main quests to the pending destination when possible', () => {
    const save = defaultSave();
    save.vip = { lastCheckinDate: '2026-05-27', checkinStreak: 3 };
    save.questStates.q_main_001 = {
      status: 'completed',
      progress: {},
      updatedAt: 0,
    };
    save.questStates.q_main_002 = {
      status: 'active',
      progress: {},
      updatedAt: 0,
    };

    const suggestions = buildGameplaySuggestions({ save, now: TODAY, max: 20 });

    const main = suggestions.find((suggestion) => suggestion.id === 'main_quest');
    expect(main?.scene).toBe(SceneKey.LIBRARY_ARCHIVE);
    expect(main?.sceneData).toEqual({ returnLocationId: 'library' });
  });

  it('routes crystal survey collection quests into the playable mine scene', () => {
    const save = defaultSave();
    save.vip = { lastCheckinDate: '2026-05-27', checkinStreak: 3 };
    save.questStates.q_main_006 = {
      status: 'active',
      progress: {},
      updatedAt: 0,
    };

    const suggestions = buildGameplaySuggestions({ save, now: TODAY, max: 20 });

    const main = suggestions.find((suggestion) => suggestion.id === 'main_quest');
    expect(main?.scene).toBe(SceneKey.CRYSTAL_MINE);
  });
});
