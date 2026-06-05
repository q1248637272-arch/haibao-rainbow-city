import { describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import { computeStats } from '@/systems/LevelCurve';
import { computePetCardState } from '@/systems/gymLogic';
import type { PetData, PetStats, PlayerPet, PlayerSave } from '@/types';

function makePlayerPet(petId: string, level = 5): PlayerPet {
  const pet = PETS[petId];
  if (!pet) throw new Error(`makePlayerPet: 未知精灵 ${petId}`);
  const stats: PetStats = computeStats(pet.baseStats, level);
  return {
    petId,
    level,
    exp: 0,
    learnedSkillIds: pet.skillIds.slice(0, Math.min(pet.skillIds.length, 1 + Math.floor(level / 5))),
    currentStats: stats,
    currentHp: stats.hp,
  };
}

function makeSave(partial: Partial<PlayerSave> = {}): PlayerSave {
  return {
    version: 4,
    playerName: '小海宝',
    coins: 100,
    isVip: false,
    playerPets: [makePlayerPet('flame_puppy'), makePlayerPet('aqua_turtle')],
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

function getPetOrThrow(id: string): PetData {
  const pet = PETS[id];
  if (!pet) throw new Error(`测试精灵不存在: ${id}`);
  return pet;
}

describe('computePetCardState', () => {
  it('非 VIP 玩家拿已拥有的普通精灵：owned=true, locked=false', () => {
    const pet = getPetOrThrow('flame_puppy');
    const state = computePetCardState(pet, makeSave());
    expect(state).toEqual({ owned: true, locked: false });
  });

  it('非 VIP 玩家看 VIP 精灵：owned=false, locked=true', () => {
    const pet = getPetOrThrow('rainbow_wing');
    const state = computePetCardState(pet, makeSave());
    expect(state).toEqual({ owned: false, locked: true });
  });

  it('VIP 玩家看 VIP 精灵（已入队）：owned=true, locked=false', () => {
    const pet = getPetOrThrow('rainbow_wing');
    const save = makeSave({
      isVip: true,
      playerPets: [
        makePlayerPet('flame_puppy'),
        makePlayerPet('aqua_turtle'),
        makePlayerPet('rainbow_wing'),
      ],
    });
    const state = computePetCardState(pet, save);
    expect(state).toEqual({ owned: true, locked: false });
  });

  it('非 VIP 玩家看未拥有的普通精灵：owned=false, locked=false', () => {
    const pet = getPetOrThrow('leaf_sprite');
    const state = computePetCardState(pet, makeSave());
    expect(state).toEqual({ owned: false, locked: false });
  });

  it('VIP 玩家看尚未入队的 VIP 精灵：owned=false, locked=false（未锁定）', () => {
    // 虽然 PlayerState.grantVip + addPet 是搭配调用，但逻辑函数需要分别正确处理。
    const pet = getPetOrThrow('rainbow_wing');
    const state = computePetCardState(pet, makeSave({ isVip: true }));
    expect(state).toEqual({ owned: false, locked: false });
  });
});
