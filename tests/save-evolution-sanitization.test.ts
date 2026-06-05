import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import { createPlayerPet } from '@/systems/PetInstance';
import { SAVE_KEY, clear, defaultSave, load, save } from '@/systems/SaveManager';
import type { PlayerSave } from '@/types';

import { installMemoryLocalStorage, uninstallLocalStorage } from './_helpers/localStorage';

describe('save evolution sanitization', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    clear();
  });

  afterEach(() => {
    uninstallLocalStorage();
  });

  it('sanitizes and writes back stale low-level evolution flags from old v4 saves', () => {
    const saveFile = defaultSave();
    const staleReward = createPlayerPet(PETS.cai_xukun!, 6);
    staleReward.evolutionStage = 1;
    staleReward.currentStats = { hp: 999, atk: 999, def: 999, spd: 999 };
    staleReward.currentHp = 999;
    saveFile.playerPets = [staleReward];
    save(saveFile);

    const loaded = load();
    expect(loaded.playerPets[0]?.level).toBe(6);
    expect(loaded.playerPets[0]?.evolutionStage).toBe(0);
    expect(loaded.playerPets[0]?.currentStats.hp).toBeLessThan(999);
    expect(loaded.playerPets[0]?.currentHp).toBe(loaded.playerPets[0]?.currentStats.hp);

    const persisted = JSON.parse(globalThis.localStorage.getItem(SAVE_KEY) ?? '{}') as PlayerSave;
    expect(persisted.playerPets[0]?.evolutionStage).toBe(0);
  });

  it('preserves a legitimate first evolution at level 16 when the rebalance marker is absent', () => {
    const saveFile = defaultSave();
    const evolved = createPlayerPet(PETS.cai_xukun!, 16, { evolutionStage: 1 });
    saveFile.playerPets = [evolved];
    save(saveFile);

    const loaded = load();
    expect(loaded.playerPets[0]?.level).toBe(16);
    expect(loaded.playerPets[0]?.evolutionStage).toBe(1);
  });

  it('preserves Cai Xukun third evolution after a fresh storage reload', () => {
    const saveFile = defaultSave();
    const evolved = createPlayerPet(PETS.cai_xukun!, 32, { evolutionStage: 2 });
    saveFile.playerPets = [evolved];
    save(saveFile);

    const loaded = load();
    expect(loaded.playerPets[0]?.level).toBe(32);
    expect(loaded.playerPets[0]?.evolutionStage).toBe(2);
  });
});
