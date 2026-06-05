import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function readPngInfo(filePath: string): { width: number; height: number; colorType: number } {
  const buffer = readFileSync(filePath);
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer.readUInt8(25),
  };
}

const PREMIUM_REDRAW_MAPS = [
  'legacy_library_clean',
  'legacy_maze_gate_clean',
  'legacy_spaceship_clean',
  'legacy_lab_clean',
  'legacy_doll_base_clean',
  'legacy_casino_clean',
  'legacy_energy_field_clean',
] as const;

const PREMIUM_REDRAW_MAP_RAW_NAMES = [
  'premium_legacy_library_redraw_v2_gpt-image-2.png',
  'premium_legacy_maze_gate_redraw_v2_gpt-image-2.png',
  'premium_legacy_spaceship_redraw_v2_gpt-image-2.png',
  'premium_legacy_lab_redraw_v2_gpt-image-2.png',
  'premium_legacy_doll_base_redraw_v2_gpt-image-2.png',
  'premium_legacy_casino_redraw_v2_gpt-image-2.png',
  'premium_legacy_energy_field_redraw_v2_gpt-image-2.png',
] as const;

const PREMIUM_REDRAW_PETS = [
  'arthur_knight',
  'leonard_gunner',
  'li_aoxiang',
  'diudiu_maori',
  'meng_lei',
] as const;

describe('premium image2 redraw assets', () => {
  it('keeps the seven premium legacy location redraws and derivatives available', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    expect(preloadSource).toContain('PREMIUM_MAP_REDRAW_V2_CACHE_BUSTER');
    expect(preloadSource).toContain('premium-map-redraw-v2-20260605');
    expect(preloadSource).toContain('fast.webp${suffix}');

    for (const rawName of PREMIUM_REDRAW_MAP_RAW_NAMES) {
      const raw = path.resolve('output/imagegen', rawName);
      expect(existsSync(raw), `${rawName} raw`).toBe(true);
      expect(readPngInfo(raw)).toMatchObject({
        width: 1536,
        height: 1024,
        colorType: 2,
      });
      expect(readFileSync(raw).byteLength, `${rawName} raw bytes`).toBeGreaterThan(2_000_000);
    }

    for (const key of PREMIUM_REDRAW_MAPS) {
      const source = path.resolve(
        'public/assets/legacy/image2-restored/maps',
        `${key}_image2.png`,
      );
      const fast = path.resolve(
        'public/assets/legacy/fast/image2-restored/maps',
        `${key}_image2_fast.webp`,
      );
      const expanded = path.resolve('public/assets/legacy/expanded', `${key}_expanded.webp`);

      expect(existsSync(source), `${key} source`).toBe(true);
      expect(existsSync(fast), `${key} fast`).toBe(true);
      expect(existsSync(expanded), `${key} expanded`).toBe(true);
      expect(preloadSource).toContain(`${key}: cacheBustLegacyAssetPath`);

      expect(readPngInfo(source)).toMatchObject({
        width: 1536,
        height: 1024,
        colorType: 2,
      });
      expect(readFileSync(fast).byteLength, `${key} fast bytes`).toBeGreaterThan(75_000);
      expect(readFileSync(expanded).byteLength, `${key} expanded bytes`).toBeGreaterThan(120_000);
    }
  });

  it('keeps premium pet sprites transparent and wired through the preload asset table', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');

    for (const petId of PREMIUM_REDRAW_PETS) {
      const source = path.resolve(
        'public/assets/legacy/image2-restored/pets',
        `legacy_pet_${petId}_image2.png`,
      );
      const fast = path.resolve(
        'public/assets/legacy/fast/image2-restored/pets',
        `legacy_pet_${petId}_image2_fast.webp`,
      );

      expect(existsSync(source), `${petId} source`).toBe(true);
      expect(existsSync(fast), `${petId} fast`).toBe(true);
      expect(readPngInfo(source)).toMatchObject({
        width: 1024,
        height: 1024,
        colorType: 6,
      });
      expect(readFileSync(fast).byteLength, `${petId} fast bytes`).toBeGreaterThan(45_000);
      expect(preloadSource).toContain(`legacy_pet_${petId}`);
    }
  });

  it('prefers the new Li Aoxiang and Meng Lei restored textures when loaded', () => {
    const isoPetSource = readFileSync(path.resolve('src/utils/isoPetSprite.ts'), 'utf8');

    expect(isoPetSource).toContain("'li_aoxiang'");
    expect(isoPetSource).toContain("'meng_lei'");
  });
});
