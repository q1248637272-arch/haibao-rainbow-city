import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '@/config/GameConfig';
import { ROUTE_MAP_SOURCE_SIZE } from '@/data/routeMapHotspots';
import {
  computeEdgeFollowCameraScroll,
  computeResponsiveMapDisplaySize,
} from '@/utils/responsiveMapDisplay';

const WIDE_LEGACY_ASSET_PATHS: Readonly<Record<string, string>> = {
  legacy_7k7k_2: 'assets/legacy/redraw-wide/legacy_7k7k_2_wide_v3_image2.png',
  legacy_world_map_full: 'assets/legacy/redraw-wide/legacy_world_map_full_wide_v2_image2.png',
  legacy_home_walkable: 'assets/legacy/redraw-wide/legacy_home_walkable_wide_v2_image2.png',
  legacy_farm_walkable: 'assets/legacy/redraw-wide/legacy_farm_walkable_wide_v2_image2.png',
  legacy_beach_integrated: 'assets/legacy/redraw-wide/legacy_beach_integrated_wide_v2_image2.png',
  legacy_gym_badge_dojo: 'assets/legacy/redraw-wide/legacy_gym_badge_dojo_wide_v1_image2.png',
  legacy_crystal_cave_clean:
    'assets/legacy/redraw-wide/legacy_crystal_cave_clean_wide_v1_image2.png',
};

const EXPANDED_LEGACY_FALLBACKS = [
  'legacy_library_clean',
  'legacy_lab_clean',
  'legacy_maze_gate_clean',
  'legacy_spaceship_clean',
] as const;

function readPngSize(filePath: string): { width: number; height: number } {
  const buffer = readFileSync(filePath);
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe('responsive wide map redraw assets', () => {
  it('registers the fullscreen redraws used by the most exposed maps', () => {
    expect(Object.keys(WIDE_LEGACY_ASSET_PATHS).sort()).toEqual([
      'legacy_7k7k_2',
      'legacy_beach_integrated',
      'legacy_crystal_cave_clean',
      'legacy_farm_walkable',
      'legacy_gym_badge_dojo',
      'legacy_home_walkable',
      'legacy_world_map_full',
    ]);
  });

  it('keeps wide redraw keys and files discoverable', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    for (const [key, assetPath] of Object.entries(WIDE_LEGACY_ASSET_PATHS)) {
      expect(preloadSource).toContain(`${key}:`);
      expect(preloadSource).toContain(`'${assetPath}'`);
      expect(existsSync(path.resolve('public', assetPath))).toBe(true);
    }
  });

  it('falls back cleanly when a map has no dedicated wide redraw yet', () => {
    expect(WIDE_LEGACY_ASSET_PATHS.legacy_lab_clean).toBeUndefined();
  });

  it('uses expanded legacy redraw fallbacks for old maps without dedicated wide art', () => {
    const responsiveBackgroundSource = readFileSync(
      path.resolve('src/utils/responsiveBackground.ts'),
      'utf8',
    );
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    const scenePreloaderSource = readFileSync(
      path.resolve('src/systems/SceneAssetPreloader.ts'),
      'utf8',
    );

    expect(responsiveBackgroundSource).toContain('expandedKey');
    expect(responsiveBackgroundSource).toContain('scene.textures.exists(expandedKey)');
    expect(preloadSource).toContain('expandedLegacyAssetPath(key)');
    expect(scenePreloaderSource).toContain('expandedLegacyAssetPath(key)');

    for (const key of EXPANDED_LEGACY_FALLBACKS) {
      const expanded = path.resolve('public/assets/legacy/expanded', `${key}_expanded.webp`);
      expect(existsSync(expanded), `${key} expanded fallback`).toBe(true);
      expect(readFileSync(expanded).byteLength, `${key} expanded bytes`).toBeGreaterThan(120_000);
    }
  });

  it('uses true ultrawide redraws instead of the old square-ish wide maps', () => {
    for (const assetPath of Object.values(WIDE_LEGACY_ASSET_PATHS)) {
      const { width, height } = readPngSize(path.resolve('public', assetPath));
      expect(width / height).toBeGreaterThanOrEqual(2.19);
    }
  });

  it('uses the latest image2 redraw and keeps the deployable fast derivative available', () => {
    const mainMapSource = path.resolve(
      'public/assets/legacy/redraw-wide/legacy_7k7k_2_wide_v3_image2.png',
    );
    const mainMapFast = path.resolve(
      'public/assets/legacy/fast/redraw-wide/legacy_7k7k_2_wide_v3_image2_fast.webp',
    );

    expect(WIDE_LEGACY_ASSET_PATHS.legacy_7k7k_2).toContain('_wide_v3_image2.png');
    expect(existsSync(mainMapSource)).toBe(true);
    expect(existsSync(mainMapFast)).toBe(true);
    expect(readFileSync(mainMapSource).byteLength).toBeGreaterThan(3_000_000);
    expect(readFileSync(mainMapFast).byteLength).toBeGreaterThan(150_000);
  });

  it('keeps the route-map mask coordinate space tied to the native wide redraw', () => {
    const routeMapAssetPath = WIDE_LEGACY_ASSET_PATHS.legacy_world_map_full;
    expect(routeMapAssetPath).toBeDefined();
    if (!routeMapAssetPath) throw new Error('route map wide redraw path is missing');
    const routeMapSource = path.resolve('public', routeMapAssetPath);

    expect(readPngSize(routeMapSource)).toEqual(ROUTE_MAP_SOURCE_SIZE);
  });

  it('allows ultrawide map redraws to shrink so the whole image fits phone landscape cameras', () => {
    const phoneLandscapes = [
      {
        width: Math.round((2048 / 922) * GAME_HEIGHT),
        height: GAME_HEIGHT,
      },
      {
        width: Math.round((844 / 390) * GAME_HEIGHT),
        height: GAME_HEIGHT,
      },
    ];

    for (const assetPath of Object.values(WIDE_LEGACY_ASSET_PATHS)) {
      const { width, height } = readPngSize(path.resolve('public', assetPath));
      for (const phoneLandscape of phoneLandscapes) {
        const display = computeResponsiveMapDisplaySize({
          visibleWidth: phoneLandscape.width,
          visibleHeight: phoneLandscape.height,
          sourceWidth: width,
          sourceHeight: height,
          isWideRedraw: true,
          fitMode: 'contain',
        });

        expect(display.width).toBeLessThanOrEqual(phoneLandscape.width + 2);
        expect(display.height).toBeLessThanOrEqual(phoneLandscape.height + 2);
        expect(
          Math.max(display.width / phoneLandscape.width, display.height / phoneLandscape.height),
        ).toBeGreaterThan(0.998);
      }
    }
  });

  it('can render each wide redraw as one cover-sized image for stable expanded map views', () => {
    const phoneLandscape = {
      width: Math.round((844 / 390) * GAME_HEIGHT),
      height: GAME_HEIGHT,
    };

    for (const assetPath of Object.values(WIDE_LEGACY_ASSET_PATHS)) {
      const { width, height } = readPngSize(path.resolve('public', assetPath));
      const cover = computeResponsiveMapDisplaySize({
        visibleWidth: phoneLandscape.width,
        visibleHeight: phoneLandscape.height,
        sourceWidth: width,
        sourceHeight: height,
        isWideRedraw: true,
        fitMode: 'cover',
      });

      expect(cover.width).toBeGreaterThanOrEqual(phoneLandscape.width - 2);
      expect(cover.height).toBeGreaterThanOrEqual(phoneLandscape.height - 2);
    }
  });

  it('can stretch a complete map image to fill an expanded viewport without side gaps', () => {
    const visibleWidth = Math.round((2048 / 922) * GAME_HEIGHT);
    const stretch = computeResponsiveMapDisplaySize({
      visibleWidth,
      visibleHeight: GAME_HEIGHT,
      sourceWidth: 1536,
      sourceHeight: 1024,
      isWideRedraw: false,
      fitMode: 'stretch',
    });

    expect(stretch.width).toBe(visibleWidth);
    expect(stretch.height).toBe(GAME_HEIGHT);
  });

  it('keeps legacy map cameras independent from pointer movement', () => {
    const responsiveBackgroundSource = readFileSync(
      path.resolve('src/utils/responsiveBackground.ts'),
      'utf8',
    );
    const worldMapSource = readFileSync(path.resolve('src/scenes/LegacyMapScene.ts'), 'utf8');
    const routeMapSource = readFileSync(path.resolve('src/scenes/LegacyRouteMapScene.ts'), 'utf8');

    expect(responsiveBackgroundSource).not.toContain('panWithPointer');
    expect(responsiveBackgroundSource).not.toContain('pointermove');
    expect(worldMapSource).not.toContain('panWithPointer');
    expect(routeMapSource).not.toContain('panWithPointer');
  });

  it('keeps Image2 home response masks synced to the responsive background transform', () => {
    const homeSceneSource = readFileSync(path.resolve('src/scenes/HomeScene.ts'), 'utf8');

    expect(homeSceneSource).toContain('homeMaskDisplayRect');
    expect(homeSceneSource).toContain('getDisplayBounds');
    expect(homeSceneSource).toContain('bounds.left + mask.x * scaleX');
    expect(homeSceneSource).toContain('containsHomeMaskPoint(mask, hitArea.width, hitArea.height');
    expect(homeSceneSource).toContain("fitMode: 'stretch'");
    expect(homeSceneSource).not.toContain("fitMode: 'contain'");
  });

  it('keeps route-map response areas synced to the stretched background transform', () => {
    const routeMapSource = readFileSync(path.resolve('src/scenes/LegacyRouteMapScene.ts'), 'utf8');

    expect(routeMapSource).toContain("fitMode: 'stretch'");
    expect(routeMapSource).toContain('ROUTE_MAP_HOTSPOTS');
    expect(routeMapSource).toContain('ROUTE_MAP_SOURCE_SIZE');
    expect(routeMapSource).toContain('routeMapDisplayBounds');
    expect(routeMapSource).toContain('routeMaskDisplayRect');
    expect(routeMapSource).toContain('getDisplayBounds');
    expect(routeMapSource).toContain('bounds.left + mask.x * scaleX');
    expect(routeMapSource).toContain('containsRouteMaskPoint(mask, hitArea.width, hitArea.height');
    expect(routeMapSource).toContain('getPixelAlpha');
    expect(routeMapSource).toContain('this.routeMapPoint(sourceStart.x, sourceStart.y)');
    expect(routeMapSource).not.toContain('createVerifiedContourZone');
    expect(routeMapSource).not.toContain('drawRaisedContour');
    expect(routeMapSource).not.toContain('allowGeneratedFallback');
    expect(routeMapSource).not.toContain("kind: 'ellipse'");
    expect(routeMapSource).not.toContain("kind: 'polygon'");
    expect(routeMapSource).not.toContain("fitMode: 'contain'");
  });

  it('scrolls page-game style only after the player enters the viewport edge band', () => {
    const currentScroll = 0;
    const visibleSize = GAME_WIDTH;
    const worldStart = -220;
    const worldSize = GAME_WIDTH + 440;

    expect(
      computeEdgeFollowCameraScroll({
        currentScroll,
        targetPosition: GAME_WIDTH / 2,
        visibleSize,
        worldStart,
        worldSize,
        interpolation: 1,
      }),
    ).toBe(currentScroll);

    expect(
      computeEdgeFollowCameraScroll({
        currentScroll,
        targetPosition: 120,
        visibleSize,
        worldStart,
        worldSize,
        interpolation: 1,
      }),
    ).toBeLessThan(currentScroll);

    expect(
      computeEdgeFollowCameraScroll({
        currentScroll,
        targetPosition: GAME_WIDTH - 110,
        visibleSize,
        worldStart,
        worldSize,
        interpolation: 0.25,
      }),
    ).toBeGreaterThan(0);

    expect(
      computeEdgeFollowCameraScroll({
        currentScroll: -212.5,
        targetPosition: 832,
        visibleSize: 1385,
        worldStart: -231.5,
        worldSize: 1423,
        interpolation: 1,
      }),
    ).toBeGreaterThan(-212.5);
  });
});
