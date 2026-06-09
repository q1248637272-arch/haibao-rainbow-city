import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '@/config/GameConfig';
import { LOCATION_MAP_SOURCE_SIZE } from '@/data/locationMapHotspots';
import {
  ROUTE_MAP_HOTSPOT_IDS,
  ROUTE_MAP_HOTSPOT_IMAGE_MASKS,
  ROUTE_MAP_SOURCE_SIZE,
} from '@/data/routeMapHotspots';
import {
  computeEdgeFollowCameraScroll,
  computeResponsiveMapDisplaySize,
} from '@/utils/responsiveMapDisplay';

const WIDE_LEGACY_ASSET_PATHS: Readonly<Record<string, string>> = {
  legacy_7k7k_2:
    'assets/legacy/image2-restored/location-maps-v1/legacy_7k7k_2_wide_v1_image2.png',
  legacy_world_map_full: 'assets/legacy/image2-restored/route-map-v12/route-map-v12-image2.png',
  legacy_home_walkable: 'assets/legacy/redraw-wide/legacy_home_walkable_wide_v2_image2.png',
  legacy_farm_walkable: 'assets/legacy/redraw-wide/legacy_farm_walkable_wide_v2_image2.png',
  legacy_beach_integrated: 'assets/legacy/redraw-wide/legacy_beach_integrated_wide_v2_image2.png',
  legacy_gym_badge_dojo: 'assets/legacy/redraw-wide/legacy_gym_badge_dojo_wide_v1_image2.png',
  legacy_library_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_library_clean_wide_v1_image2.png',
  legacy_lab_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_lab_clean_wide_v1_image2.png',
  legacy_gym_hall:
    'assets/legacy/image2-restored/location-maps-v1/legacy_gym_hall_wide_v1_image2.png',
  legacy_maze_gate_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_maze_gate_clean_wide_v1_image2.png',
  legacy_doll_base_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_doll_base_clean_wide_v1_image2.png',
  legacy_energy_field_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_energy_field_clean_wide_v1_image2.png',
  legacy_crystal_cave_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_crystal_cave_clean_wide_v1_image2.png',
  legacy_spaceship_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_spaceship_clean_wide_v1_image2.png',
  legacy_casino_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_casino_clean_wide_v1_image2.png',
  legacy_bath_center_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_bath_center_clean_wide_v1_image2.png',
  legacy_coral_market_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_coral_market_clean_wide_v1_image2.png',
  legacy_tide_playground_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_tide_playground_clean_wide_v1_image2.png',
  legacy_star_observatory_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_star_observatory_clean_wide_v1_image2.png',
  legacy_storm_ruins_clean:
    'assets/legacy/image2-restored/location-maps-v1/legacy_storm_ruins_clean_wide_v1_image2.png',
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

interface RouteMapHitmapFixture {
  readonly format: string;
  readonly threshold: number;
  readonly masks: Record<
    string,
    {
      readonly source: string;
      readonly width: number;
      readonly height: number;
      readonly threshold: number;
      readonly hitPixels: number;
      readonly bbox: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      } | null;
      readonly runs: Record<string, readonly (readonly [number, number])[]>;
    }
  >;
}

function readRouteMapHitmaps(): RouteMapHitmapFixture {
  const filePath = path.resolve('src/data/routeMapHitmaps.json');
  expect(existsSync(filePath)).toBe(true);
  return JSON.parse(readFileSync(filePath, 'utf8')) as RouteMapHitmapFixture;
}

describe('responsive wide map redraw assets', () => {
  it('registers the fullscreen redraws used by the most exposed maps', () => {
    expect(Object.keys(WIDE_LEGACY_ASSET_PATHS).sort()).toEqual([
      'legacy_7k7k_2',
      'legacy_bath_center_clean',
      'legacy_beach_integrated',
      'legacy_casino_clean',
      'legacy_coral_market_clean',
      'legacy_crystal_cave_clean',
      'legacy_doll_base_clean',
      'legacy_energy_field_clean',
      'legacy_farm_walkable',
      'legacy_gym_badge_dojo',
      'legacy_gym_hall',
      'legacy_home_walkable',
      'legacy_lab_clean',
      'legacy_library_clean',
      'legacy_maze_gate_clean',
      'legacy_spaceship_clean',
      'legacy_star_observatory_clean',
      'legacy_storm_ruins_clean',
      'legacy_tide_playground_clean',
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

  it('registers dedicated native-wide redraws for every legacy location map', () => {
    const locationKeys = [
      'legacy_7k7k_2',
      'legacy_library_clean',
      'legacy_gym_hall',
      'legacy_lab_clean',
      'legacy_maze_gate_clean',
      'legacy_doll_base_clean',
      'legacy_energy_field_clean',
      'legacy_crystal_cave_clean',
      'legacy_spaceship_clean',
      'legacy_casino_clean',
      'legacy_bath_center_clean',
      'legacy_coral_market_clean',
      'legacy_tide_playground_clean',
      'legacy_star_observatory_clean',
      'legacy_storm_ruins_clean',
    ] as const;

    for (const key of locationKeys) {
      expect(WIDE_LEGACY_ASSET_PATHS[key], key).toContain(
        'assets/legacy/image2-restored/location-maps-v1/',
      );
    }
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
      'public/assets/legacy/image2-restored/location-maps-v1/legacy_7k7k_2_wide_v1_image2.png',
    );
    const mainMapFast = path.resolve(
      'public/assets/legacy/fast/image2-restored/location-maps-v1/legacy_7k7k_2_wide_v1_image2_fast.webp',
    );

    expect(WIDE_LEGACY_ASSET_PATHS.legacy_7k7k_2).toContain('_wide_v1_image2.png');
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

  it('generates pixel-level route-map hitmaps from every same-source mask', () => {
    const hitmaps = readRouteMapHitmaps();

    expect(hitmaps.format).toBe('route-map-alpha-hitmaps-v1');
    expect(hitmaps.threshold).toBe(16);
    expect(Object.keys(hitmaps.masks).sort()).toEqual([...ROUTE_MAP_HOTSPOT_IDS].sort());

    for (const hotspotId of ROUTE_MAP_HOTSPOT_IDS) {
      const hitmap = hitmaps.masks[hotspotId];
      const mask = ROUTE_MAP_HOTSPOT_IMAGE_MASKS[hotspotId];
      expect(hitmap, hotspotId).toBeDefined();
      if (!hitmap) throw new Error(`${hotspotId} route hitmap missing`);

      expect(hitmap.source, hotspotId).toContain('/route-map-v12/');
      expect(hitmap.width, hotspotId).toBe(mask.width);
      expect(hitmap.height, hotspotId).toBe(mask.height);
      expect(hitmap.threshold, hotspotId).toBe(mask.alphaTolerance);
      expect(hitmap.hitPixels, hotspotId).toBeGreaterThan(1_000);
      expect(hitmap.bbox, hotspotId).not.toBeNull();
      expect(Object.keys(hitmap.runs).length, hotspotId).toBeGreaterThan(0);
      expect(Object.values(hitmap.runs).some((row) => row.length > 0), hotspotId).toBe(true);
    }
  });

  it('keeps every legacy location map tied to the native Image2 location source size', () => {
    for (const [key, assetPath] of Object.entries(WIDE_LEGACY_ASSET_PATHS)) {
      if (!assetPath.includes('/location-maps-v1/')) continue;
      expect(readPngSize(path.resolve('public', assetPath)), key).toEqual(
        LOCATION_MAP_SOURCE_SIZE,
      );
    }
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

  it('can fill wide map viewports horizontally without moving the top and bottom edges', () => {
    const phoneLandscape = {
      width: Math.round((844 / 390) * GAME_HEIGHT),
      height: GAME_HEIGHT,
    };

    for (const assetPath of Object.values(WIDE_LEGACY_ASSET_PATHS)) {
      const { width, height } = readPngSize(path.resolve('public', assetPath));
      const fillWidth = computeResponsiveMapDisplaySize({
        visibleWidth: phoneLandscape.width,
        visibleHeight: phoneLandscape.height,
        sourceWidth: width,
        sourceHeight: height,
        isWideRedraw: true,
        fitMode: 'fillWidth',
      });

      expect(fillWidth.width).toBe(phoneLandscape.width);
      expect(fillWidth.height).toBe(GAME_HEIGHT);
    }
  });

  it('lets the route map fill the target wide viewport without vertical movement', () => {
    const visibleWidth = Math.round((2048 / 922) * GAME_HEIGHT);
    const fillWidth = computeResponsiveMapDisplaySize({
      visibleWidth,
      visibleHeight: GAME_HEIGHT,
      sourceWidth: ROUTE_MAP_SOURCE_SIZE.width,
      sourceHeight: ROUTE_MAP_SOURCE_SIZE.height,
      isWideRedraw: true,
      fitMode: 'fillWidth',
    });

    expect(fillWidth.width).toBe(visibleWidth);
    expect(fillWidth.height).toBe(GAME_HEIGHT);
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

  it('keeps route-map response areas synced to the filled background and pixel hitmaps', () => {
    const routeMapSource = readFileSync(path.resolve('src/scenes/LegacyRouteMapScene.ts'), 'utf8');

    expect(routeMapSource).toContain("fitMode: 'fillWidth'");
    expect(routeMapSource).toContain('routeMapHitmapsData');
    expect(routeMapSource).toContain('ROUTE_MAP_HITMAPS');
    expect(routeMapSource).toContain('ROUTE_MAP_HOTSPOTS');
    expect(routeMapSource).toContain('ROUTE_MAP_SOURCE_SIZE');
    expect(routeMapSource).toContain('routeMapDisplayBounds');
    expect(routeMapSource).toContain('routeMaskDisplayRect');
    expect(routeMapSource).toContain('routeMaskActiveBounds');
    expect(routeMapSource).toContain('routeHitmaskFor');
    expect(routeMapSource).toContain('routeHitmaskContains');
    expect(routeMapSource).toContain('getDisplayBounds');
    expect(routeMapSource).toContain('bounds.left + mask.x * scaleX');
    expect(routeMapSource).toContain('mask.y + active.bottom + 1');
    expect(routeMapSource).not.toContain('this.routeMapPoint(mask.labelX, mask.labelY)');
    expect(routeMapSource).toContain(
      'containsRouteMaskPoint(hotspot.id, mask, hitArea.width, hitArea.height',
    );
    expect(routeMapSource).toContain('hitmask.runs[String(y)]');
    expect(routeMapSource).toContain('getPixelAlpha');
    expect(routeMapSource).not.toContain('drawRouteIntelPanel');
    expect(routeMapSource).not.toContain('routeIntelPanel');
    expect(routeMapSource).not.toContain('trackedRouteHotspot');
    expect(routeMapSource).not.toContain('pickRouteRecommendation');
    expect(routeMapSource).not.toContain('routePanelHotspot');
    expect(routeMapSource).not.toContain('redrawRoutePreview');
    expect(routeMapSource).not.toContain('今日推荐');
    expect(routeMapSource).not.toContain('createVerifiedContourZone');
    expect(routeMapSource).not.toContain('drawRaisedContour');
    expect(routeMapSource).not.toContain('allowGeneratedFallback');
    expect(routeMapSource).not.toContain("kind: 'ellipse'");
    expect(routeMapSource).not.toContain("kind: 'polygon'");
    expect(routeMapSource).not.toContain("fitMode: 'stretch'");
  });

  it('keeps legacy-location response areas synced to same-source wide-image masks', () => {
    const locationSceneSource = readFileSync(
      path.resolve('src/scenes/LegacyLocationScene.ts'),
      'utf8',
    );

    expect(locationSceneSource).toContain("fitMode: 'fillWidth'");
    expect(locationSceneSource).toContain('LOCATION_MAP_HOTSPOT_IMAGE_MASKS');
    expect(locationSceneSource).toContain('LOCATION_MAP_SOURCE_SIZE');
    expect(locationSceneSource).toContain('locationMaskDisplayRect');
    expect(locationSceneSource).toContain('screenToLocationLogicPoint');
    expect(locationSceneSource).toContain('getDisplayBounds');
    expect(locationSceneSource).toContain('bounds.left + mask.x * scaleX');
    expect(locationSceneSource).toContain(
      'containsLocationMaskPoint(mask, hitArea.width, hitArea.height',
    );
    expect(locationSceneSource).toContain('getPixelAlpha');
    expect(locationSceneSource).not.toContain('legacyHotspotContour');
    expect(locationSceneSource).not.toContain('createVerifiedContourZone');
    expect(locationSceneSource).not.toContain('drawRaisedContour');
    expect(locationSceneSource).not.toContain("fitMode: 'stretch'");
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
