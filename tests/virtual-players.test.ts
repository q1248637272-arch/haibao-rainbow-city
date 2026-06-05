import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import {
  generateVirtualPlayers,
  VIRTUAL_PLAYER_AVATAR_ASSETS,
  VIRTUAL_PLAYER_AVATAR_COUNT,
  VIRTUAL_PLAYER_AVATAR_FRAME_HEIGHT,
  VIRTUAL_PLAYER_AVATAR_FRAME_WIDTH,
  virtualPlayerDisplayName,
} from '@/systems/VirtualPlayers';

const PROTAGONIST_AVATAR_KEYS = new Set([
  'legacy_player_hero_sheet',
  'legacy_player_merman_male_sheet',
  'legacy_player_fairy_sheet',
]);

function readPngInfo(filePath: string): { width: number; height: number; colorType: number } {
  const buffer = readFileSync(filePath);
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer.readUInt8(25),
  };
}

describe('virtual players', () => {
  it('generates named computer players with valid avatars and playable parties', () => {
    const players = generateVirtualPlayers({
      locationId: 'center',
      count: VIRTUAL_PLAYER_AVATAR_COUNT,
      minLevel: 7,
      maxLevel: 12,
      seed: 'test-seed',
    });

    expect(VIRTUAL_PLAYER_AVATAR_COUNT).toBeGreaterThanOrEqual(20);
    expect(players).toHaveLength(VIRTUAL_PLAYER_AVATAR_COUNT);

    const seenAvatarKeys = new Set<string>();
    for (const player of players) {
      expect(player.name.length).toBeGreaterThanOrEqual(2);
      expect(player.title.length).toBeGreaterThanOrEqual(4);
      expect(virtualPlayerDisplayName(player)).toContain(player.title);
      expect(virtualPlayerDisplayName(player)).toContain(player.name);
      if (player.isVip) expect(virtualPlayerDisplayName(player)).toMatch(/^VIP /);
      expect(player.avatarKey).toMatch(/^legacy_virtual_player_\d{2}_image2_sheet$/);
      expect(PROTAGONIST_AVATAR_KEYS.has(player.avatarKey)).toBe(false);
      seenAvatarKeys.add(player.avatarKey);
      expect(player.party.length).toBeGreaterThanOrEqual(1);
      for (const pet of player.party) {
        expect(PETS[pet.petId]).toBeDefined();
        expect(pet.level).toBeGreaterThanOrEqual(7);
        expect(pet.level).toBeLessThanOrEqual(12);
        expect(pet.currentHp).toBe(pet.currentStats.hp);
        expect(pet.learnedSkillIds.length).toBeGreaterThanOrEqual(1);
      }
    }
    expect(seenAvatarKeys.size).toBe(VIRTUAL_PLAYER_AVATAR_COUNT);
  });

  it('keeps 24 dedicated gpt-image-2 virtual-player avatar sheets available', () => {
    expect(VIRTUAL_PLAYER_AVATAR_ASSETS).toHaveLength(24);

    for (const [index, asset] of VIRTUAL_PLAYER_AVATAR_ASSETS.entries()) {
      const number = String(index + 1).padStart(2, '0');
      const baseName = `legacy_virtual_player_${number}_image2`;
      expect(asset.key).toBe(`${baseName}_sheet`);
      expect(asset.path).toBe(
        `assets/legacy/image2-restored/characters/virtual-players/sheets/${baseName}_sheet.png`,
      );

      const source = path.resolve(
        'public/assets/legacy/image2-restored/characters/virtual-players',
        `${baseName}.png`,
      );
      const sheet = path.resolve('public', asset.path);
      const fast = path.resolve(
        'public/assets/legacy/fast/image2-restored/characters/virtual-players',
        `${baseName}_fast.webp`,
      );

      expect(existsSync(source), `${baseName} source`).toBe(true);
      expect(existsSync(sheet), `${baseName} sheet`).toBe(true);
      expect(existsSync(fast), `${baseName} fast`).toBe(true);
      expect(readPngInfo(source)).toMatchObject({
        width: VIRTUAL_PLAYER_AVATAR_FRAME_WIDTH,
        height: VIRTUAL_PLAYER_AVATAR_FRAME_HEIGHT,
        colorType: 6,
      });
      expect(readPngInfo(sheet)).toMatchObject({
        width: VIRTUAL_PLAYER_AVATAR_FRAME_WIDTH * 4,
        height: VIRTUAL_PLAYER_AVATAR_FRAME_HEIGHT,
        colorType: 6,
      });
      expect(readFileSync(fast).byteLength, `${baseName} fast bytes`).toBeGreaterThan(2_000);
    }

    for (let index = 1; index <= 4; index += 1) {
      const raw = path.resolve(
        'output/imagegen',
        `premium_virtual_players_v1_sheet_${index}_gpt-image-2.png`,
      );
      expect(existsSync(raw), `raw sheet ${index}`).toBe(true);
      expect(readPngInfo(raw)).toMatchObject({ colorType: 2 });
      expect(readPngInfo(raw).width, `raw sheet ${index} width`).toBeGreaterThan(1000);
      expect(readPngInfo(raw).height, `raw sheet ${index} height`).toBeGreaterThan(1000);
    }

  });

  it('wires virtual-player avatars through scene preloading and labels', () => {
    const virtualPlayerSource = readFileSync(path.resolve('src/systems/VirtualPlayers.ts'), 'utf8');
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    const scenePreloaderSource = readFileSync(
      path.resolve('src/systems/SceneAssetPreloader.ts'),
      'utf8',
    );
    const locationSource = readFileSync(path.resolve('src/scenes/LegacyLocationScene.ts'), 'utf8');
    const introSource = readFileSync(path.resolve('src/scenes/BattleIntroScene.ts'), 'utf8');

    expect(virtualPlayerSource).toContain('legacy_virtual_player_${number}_image2_sheet');
    expect(virtualPlayerSource).not.toContain('legacy_player_hero_sheet');
    expect(virtualPlayerSource).not.toContain('legacy_player_merman_male_sheet');
    expect(virtualPlayerSource).not.toContain('legacy_player_fairy_sheet');
    expect(preloadSource).toContain('VIRTUAL_PLAYER_AVATAR_ASSETS');
    expect(preloadSource).toContain('this.load.spritesheet(avatar.key, avatar.path');
    expect(scenePreloaderSource).toContain('spritesheets: VIRTUAL_PLAYER_AVATAR_ASSETS');
    expect(scenePreloaderSource).toContain('scene.load.spritesheet(sheet.key, sheet.path');
    expect(locationSource).toContain('virtualPlayerDisplayName(player)');
    expect(locationSource).toContain('搭档 ${petName} Lv');
    expect(introSource).toContain('virtualPlayerDisplayName(trainer)');
  });
});
