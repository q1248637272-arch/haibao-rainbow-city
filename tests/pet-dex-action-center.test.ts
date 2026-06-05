import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import { createPlayerPet } from '@/systems/PetInstance';
import {
  buildPetDexSnapshot,
  filterDexEntries,
  firstTraceForEntry,
  PET_DEX_FILTERS,
} from '@/systems/PetDexProgress';
import type { PlayerSave } from '@/types';

type PetDexSave = Pick<PlayerSave, 'playerPets' | 'petStorage'>;

describe('pet dex action center progress', () => {
  it('summarizes owned, missing, and element completion from the current save', () => {
    const save: PetDexSave = {
      playerPets: [createPlayerPet(PETS.flame_puppy!, 8)],
      petStorage: [createPlayerPet(PETS.storm_ray!, 24)],
    };

    const snapshot = buildPetDexSnapshot(save);

    expect(snapshot.summary.total).toBe(Object.keys(PETS).length);
    expect(snapshot.summary.owned).toBe(2);
    expect(snapshot.summary.missing).toBe(snapshot.summary.total - 2);
    expect(snapshot.summary.byElement.fire.owned).toBe(1);
    expect(snapshot.summary.byElement.electric.owned).toBe(1);
    expect(snapshot.summary.completionRatio).toBeCloseTo(2 / Object.keys(PETS).length, 5);
  });

  it('filters entries without losing trace routing data', () => {
    const save: PetDexSave = {
      playerPets: [createPlayerPet(PETS.flame_puppy!, 8)],
      petStorage: [],
    };
    const snapshot = buildPetDexSnapshot(save);

    const owned = filterDexEntries(snapshot.allEntries, 'owned');
    const missing = filterDexEntries(snapshot.allEntries, 'missing');
    const water = filterDexEntries(snapshot.allEntries, 'water');
    const cloudFerret = snapshot.allEntries.find((entry) => entry.pet.id === 'cloud_ferret');

    expect(PET_DEX_FILTERS).toContain('missing');
    expect(owned.map((entry) => entry.pet.id)).toEqual(['flame_puppy']);
    expect(missing.some((entry) => entry.pet.id === 'flame_puppy')).toBe(false);
    expect(water.every((entry) => entry.pet.element === 'water')).toBe(true);
    expect(cloudFerret?.traces.length).toBeGreaterThan(1);
    expect(firstTraceForEntry(cloudFerret!)).toBe(cloudFerret?.traces[0]);
  });
});

describe('pet dex archive scene assets', () => {
  it('registers the gpt-image-2 pet archive background and fast derivative', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    const preloaderSource = readFileSync(
      path.resolve('src/systems/SceneAssetPreloader.ts'),
      'utf8',
    );
    const sceneSource = readFileSync(path.resolve('src/scenes/PetDexScene.ts'), 'utf8');

    expect(preloadSource).toContain(
      "premium_pet_archive_image2: 'assets/legacy/image2-restored/ui/premium_pet_archive_image2.webp'",
    );
    expect(preloaderSource).toContain("'premium_pet_archive_image2'");
    expect(sceneSource).toContain("PET_DEX_BACKGROUND_KEY = 'premium_pet_archive_image2'");
    expect(sceneSource).toContain('buildPetDexSnapshot');
    expect(sceneSource).toContain('drawTraceButtons');

    const sourceAsset = path.resolve(
      'public/assets/legacy/image2-restored/ui/premium_pet_archive_image2.webp',
    );
    const fastAsset = path.resolve(
      'public/assets/legacy/fast/image2-restored/ui/premium_pet_archive_image2_fast.webp',
    );
    expect(existsSync(sourceAsset)).toBe(true);
    expect(existsSync(fastAsset)).toBe(true);
    expect(statSync(sourceAsset).size).toBeGreaterThan(80_000);
    expect(statSync(fastAsset).size).toBeGreaterThan(30_000);
  });
});
