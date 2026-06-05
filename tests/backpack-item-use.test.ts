import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import { useBackpackItemOnPet } from '@/systems/BackpackItemUse';
import { gameEvents } from '@/systems/EventBus';
import { createPlayerPet } from '@/systems/PetInstance';
import { PlayerState } from '@/systems/PlayerState';
import { clear, load } from '@/systems/SaveManager';

import { installMemoryLocalStorage, uninstallLocalStorage } from './_helpers/localStorage';

describe('backpack item use workbench', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    clear();
    PlayerState.resetToDefault();
    gameEvents.clear();
  });

  afterEach(() => {
    gameEvents.clear();
    uninstallLocalStorage();
  });

  it('uses healing potions on injured pets and consumes one item', () => {
    const pet = PlayerState.getPlayerPet('flame_puppy')!;
    pet.currentHp = pet.currentStats.hp - 40;
    PlayerState.persist();
    PlayerState.addItem('potion_small', 1);

    const result = useBackpackItemOnPet('potion_small', pet.instanceId!);

    expect(result.ok).toBe(true);
    expect(result.consumed).toBe(true);
    expect(PlayerState.getItemCount('potion_small')).toBe(0);
    expect(pet.currentHp).toBe(pet.currentStats.hp);
  });

  it('does not consume a healing potion when the target is already full', () => {
    const pet = PlayerState.getPlayerPet('flame_puppy')!;
    PlayerState.addItem('potion_small', 1);

    const result = useBackpackItemOnPet('potion_small', pet.instanceId!);

    expect(result.ok).toBe(false);
    expect(PlayerState.getItemCount('potion_small')).toBe(1);
  });

  it('revives only fainted pets and preserves the item on invalid targets', () => {
    const pet = PlayerState.getPlayerPet('aqua_turtle')!;
    pet.currentHp = 0;
    PlayerState.persist();
    PlayerState.addItem('potion_revive', 2);

    const revive = useBackpackItemOnPet('potion_revive', pet.instanceId!);
    const invalidRepeat = useBackpackItemOnPet('potion_revive', pet.instanceId!);

    expect(revive.ok).toBe(true);
    expect(pet.currentHp).toBeGreaterThan(0);
    expect(invalidRepeat.ok).toBe(false);
    expect(PlayerState.getItemCount('potion_revive')).toBe(1);
  });

  it('uses EXP candy through the backpack and consumes the candy', () => {
    const pet = PlayerState.getPlayerPet('flame_puppy')!;
    const beforeLevel = pet.level;
    const beforeExp = pet.exp;
    PlayerState.addItem('exp_candy', 1);

    const result = useBackpackItemOnPet('exp_candy', pet.instanceId!);

    expect(result.ok).toBe(true);
    expect(PlayerState.getItemCount('exp_candy')).toBe(0);
    expect(pet.level > beforeLevel || pet.exp > beforeExp).toBe(true);
  });

  it('uses potential seeds through the backpack talent path', () => {
    const pet = PlayerState.getPlayerPet('flame_puppy')!;
    pet.talent = { hp: 0, atk: 0, def: 0, spd: 0, spAtk: 0, spDef: 0 };
    PlayerState.persist();
    PlayerState.addItem('potential_seed', 1);

    const result = useBackpackItemOnPet('potential_seed', pet.instanceId!);

    expect(result.ok).toBe(true);
    expect(PlayerState.getItemCount('potential_seed')).toBe(0);
    expect(Object.values(pet.talent ?? {}).some((value) => value > 0)).toBe(true);
  });

  it('consumes the selected matching evolution stone and evolves the target pet', () => {
    const owned = createPlayerPet(PETS.flame_puppy!, 16, { evolutionStage: 0 });
    PlayerState.addPlayerPet(owned);
    PlayerState.addItem('evo_stone_fire', 1);

    const result = useBackpackItemOnPet('evo_stone_fire', owned.instanceId!);
    const evolved = PlayerState.getPlayerPetByInstanceId(owned.instanceId!)!;

    expect(result.ok).toBe(true);
    expect(PlayerState.getItemCount('evo_stone_fire')).toBe(0);
    expect(evolved.evolutionStage).toBe(1);
    expect(evolved.currentHp).toBe(evolved.currentStats.hp);
  });

  it('rejects mismatched evolution stones without consuming them', () => {
    const owned = createPlayerPet(PETS.aqua_turtle!, 16, { evolutionStage: 0 });
    PlayerState.addPlayerPet(owned);
    PlayerState.addItem('evo_stone_fire', 1);

    const result = useBackpackItemOnPet('evo_stone_fire', owned.instanceId!);

    expect(result.ok).toBe(false);
    expect(PlayerState.getItemCount('evo_stone_fire')).toBe(1);
    expect(PlayerState.getPlayerPetByInstanceId(owned.instanceId!)?.evolutionStage).toBe(0);
  });

  it('treats special material tokens as backpack evolution items', () => {
    const owned = createPlayerPet(PETS.cai_xukun!, 32, { evolutionStage: 1 });
    PlayerState.addPlayerPet(owned);
    PlayerState.addItem('kun_chicken_token', 1);

    const result = useBackpackItemOnPet('kun_chicken_token', owned.instanceId!);
    const reloaded = load();
    const persisted = reloaded.playerPets.find((pet) => pet.instanceId === owned.instanceId);

    expect(result.ok).toBe(true);
    expect(PlayerState.getItemCount('kun_chicken_token')).toBe(0);
    expect(PlayerState.getPlayerPetByInstanceId(owned.instanceId!)?.evolutionStage).toBe(2);
    expect(persisted?.evolutionStage).toBe(2);
    expect(persisted?.level).toBe(32);
  });
});

describe('backpack workbench scene assets', () => {
  it('registers the gpt-image-2 backpack workbench background and fast derivative', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    const preloaderSource = readFileSync(
      path.resolve('src/systems/SceneAssetPreloader.ts'),
      'utf8',
    );
    const backpackSource = readFileSync(path.resolve('src/scenes/BackpackScene.ts'), 'utf8');

    expect(preloadSource).toContain('premium_backpack_workbench_image2');
    expect(preloadSource).toContain(
      "'assets/legacy/image2-restored/ui/premium_backpack_workbench_image2.webp'",
    );
    expect(preloaderSource).toContain("'premium_backpack_workbench_image2'");
    expect(backpackSource).toContain("BACKPACK_BACKGROUND_KEY = 'premium_backpack_workbench_image2'");
    expect(backpackSource).toContain('useBackpackItemOnPet');
    expect(backpackSource).toContain('openItemModal');

    const sourceAsset = path.resolve(
      'public/assets/legacy/image2-restored/ui/premium_backpack_workbench_image2.webp',
    );
    const fastAsset = path.resolve(
      'public/assets/legacy/fast/image2-restored/ui/premium_backpack_workbench_image2_fast.webp',
    );
    expect(existsSync(sourceAsset)).toBe(true);
    expect(existsSync(fastAsset)).toBe(true);
    expect(statSync(sourceAsset).size).toBeGreaterThan(180_000);
    expect(statSync(fastAsset).size).toBeGreaterThan(70_000);
  });
});
