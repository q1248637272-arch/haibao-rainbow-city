import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LEGACY_LOCATIONS,
  findLegacyMapRoute,
  getLegacyMapNode,
  isLegacyInteractiveMapNode,
} from '@/scenes/LegacyContent';
import { isPortalLikeHotspot, legacyHotspotTexture } from '@/systems/LegacyHotspotVisuals';

function hotspot(locationId: keyof typeof LEGACY_LOCATIONS, hotspotId: string) {
  const found = LEGACY_LOCATIONS[locationId].hotspots.find((item) => item.id === hotspotId);
  if (!found) throw new Error(`${locationId}.${hotspotId} missing`);
  return found;
}

describe('legacy map routing', () => {
  it('routes along the old red-line graph instead of jumping across the map', () => {
    expect(findLegacyMapRoute('pan_hideout', 'energy_field')).toEqual([
      'pan_hideout',
      'rainbow_lab',
      'lab_passage',
      'rainbow_center',
      'energy_field',
    ]);
  });

  it('keeps bottom spaceship content wired to a playable old location', () => {
    const node = getLegacyMapNode('spaceship');
    expect(isLegacyInteractiveMapNode(node)).toBe(true);
    expect(node.locationId).toBe('spaceship');
    expect(LEGACY_LOCATIONS.spaceship.hotspots.length).toBeGreaterThanOrEqual(3);
  });

  it('wires the new casino map into the old route graph and location table', () => {
    const node = getLegacyMapNode('rainbow_casino');
    expect(isLegacyInteractiveMapNode(node)).toBe(true);
    expect(node.locationId).toBe('casino');
    expect(LEGACY_LOCATIONS.casino.hotspots.some((hotspot) => hotspot.id === 'casino-play')).toBe(
      true,
    );
  });

  it('wires tide trial into the route graph and playable location table', () => {
    const node = getLegacyMapNode('tide_playground');
    expect(isLegacyInteractiveMapNode(node)).toBe(true);
    expect(node.locationId).toBe('tide_playground');
    expect(
      LEGACY_LOCATIONS.tide_playground.hotspots.some(
        (hotspot) => hotspot.id === 'tide-trial-start',
      ),
    ).toBe(true);
    expect(findLegacyMapRoute('bath_center', 'star_observatory')).toEqual([
      'bath_center',
      'tide_playground',
      'star_observatory',
    ]);
  });

  it('keeps legacy interaction objects embedded in the map art instead of prop overlays', () => {
    expect(legacyHotspotTexture(hotspot('library', 'library-quest'))).toBeNull();
    expect(legacyHotspotTexture(hotspot('star_observatory', 'star-observatory-quest'))).toBeNull();
    expect(legacyHotspotTexture(hotspot('coral_market', 'coral-market-stall'))).toBeNull();
    expect(legacyHotspotTexture(hotspot('tide_playground', 'tide-trial-start'))).toBeNull();
    expect(legacyHotspotTexture(hotspot('casino', 'casino-daily-chips'))).toBeNull();
  });

  it('makes old location battle hotspots visible and adds a library combat loop', () => {
    const sceneSource = readFileSync(path.resolve('src/scenes/LegacyLocationScene.ts'), 'utf8');
    const echo = hotspot('library', 'library-archive-echo');

    expect(echo.action.kind).toBe('battle');
    expect(echo.action.encounterZoneId).toBe('rainbow_city:garden');
    expect(sceneSource).toContain('for (const hotspot of def.hotspots)');
    expect(sceneSource).toContain('hotspotStatusSuffix');
    expect(sceneSource).toContain('showBattlePrepPanel');
    expect(sceneSource).toContain('startPreparedWildBattle');
    expect(sceneSource).toContain('战斗准备 · ${action.label}');
    expect(sceneSource).toContain('开始遭遇');
    expect(sceneSource).toContain('整理队伍');
    expect(sceneSource).toContain('巡护奖励：胜利/收服后');
    expect(sceneSource).toContain('this.showBattlePrepPanel(action)');
    expect(sceneSource).not.toContain('this.startWildBattle(action.encounterZoneId)');
    expect(sceneSource).not.toContain("item.action.kind !== 'battle'");
  });

  it('rewards one daily old-location patrol from successful wild encounters', () => {
    const sceneSource = readFileSync(path.resolve('src/scenes/LegacyLocationScene.ts'), 'utf8');
    const patrolSource = readFileSync(path.resolve('src/systems/LegacyPatrol.ts'), 'utf8');

    expect(sceneSource).toContain('legacyPatrolRewardKey');
    expect(sceneSource).toContain('legacyPatrolRewardForLocation');
    expect(sceneSource).toContain('tryClaimLegacyPatrolReward');
    expect(sceneSource).toContain('this.drawDifficultyBadge();');
    expect(sceneSource).toContain('PlayerState.addCoins(reward.coins)');
    expect(sceneSource).toContain('PlayerState.addItem(reward.itemId, reward.itemQuantity)');
    expect(sceneSource).toContain('const patrolMessage = this.tryClaimLegacyPatrolReward();');
    expect(sceneSource).toContain('showRewardBanner');
    expect(sceneSource).toContain('destroyRewardBanner');
    expect(sceneSource).toContain('经验、彩虹币与掉落已在战斗结算中发放。');
    expect(sceneSource).not.toContain('drawPatrolBadge');
    expect(sceneSource).not.toContain('patrolHud');
    expect(sceneSource).not.toContain('destroyPatrolHud');
    expect(patrolSource).toContain('LEGACY_REWARD_SAVE_KEY');
    expect(patrolSource).toContain('legacyLocationHasPatrol');
  });

  it('keeps route-map patrol state lightweight without blocking the map art', () => {
    const routeMapSource = readFileSync(path.resolve('src/scenes/LegacyRouteMapScene.ts'), 'utf8');

    expect(routeMapSource).toContain('routeChallengeLabel');
    expect(routeMapSource).toContain('hasClaimedLegacyPatrolToday');
    expect(routeMapSource).toContain('containsRouteMaskPoint');
    expect(routeMapSource).not.toContain('drawRouteIntelPanel');
    expect(routeMapSource).not.toContain('routeIntelPanel');
    expect(routeMapSource).not.toContain('trackedRouteHotspot');
    expect(routeMapSource).not.toContain('pickRouteRecommendation');
    expect(routeMapSource).not.toContain('routePanelHotspot');
    expect(routeMapSource).not.toContain('redrawRoutePreview');
    expect(routeMapSource).not.toContain('legacyPatrolRewardSummary');
    expect(routeMapSource).not.toContain('createVerifiedContourZone');
    expect(routeMapSource).not.toContain("kind: 'polygon'");
    expect(routeMapSource).not.toContain("kind: 'ellipse'");
  });

  it('keeps generated patrol UI assets available but out of map overlays', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    const preloaderSource = readFileSync(
      path.resolve('src/systems/SceneAssetPreloader.ts'),
      'utf8',
    );
    const locationSource = readFileSync(path.resolve('src/scenes/LegacyLocationScene.ts'), 'utf8');
    const routeMapSource = readFileSync(path.resolve('src/scenes/LegacyRouteMapScene.ts'), 'utf8');
    const assets = [
      'legacy_patrol_badge_image2',
      'legacy_patrol_task_panel_image2',
      'legacy_route_patrol_stamp_image2',
    ] as const;

    for (const key of assets) {
      const assetPath = `public/assets/legacy/image2-restored/ui/${key}.webp`;
      const fastPath = `public/assets/legacy/fast/image2-restored/ui/${key}_fast.webp`;
      expect(preloadSource).toContain(`${key}:`);
      expect(preloaderSource).not.toContain(key);
      expect(existsSync(path.resolve(assetPath)), assetPath).toBe(true);
      expect(existsSync(path.resolve(fastPath)), fastPath).toBe(true);
      expect(statSync(path.resolve(assetPath)).size, assetPath).toBeGreaterThan(8_000);
      expect(statSync(path.resolve(fastPath)).size, fastPath).toBeGreaterThan(4_000);
    }

    expect(locationSource).not.toContain("PATROL_BADGE_TEXTURE_KEY = 'legacy_patrol_badge_image2'");
    expect(locationSource).not.toContain(
      "PATROL_PANEL_TEXTURE_KEY = 'legacy_patrol_task_panel_image2'",
    );
    expect(locationSource).not.toContain('this.add.image(x, y, PATROL_PANEL_TEXTURE_KEY)');
    expect(routeMapSource).not.toContain(
      "ROUTE_PATROL_STAMP_TEXTURE_KEY = 'legacy_route_patrol_stamp_image2'",
    );
  });

  it('keeps cross-map exits as portals instead of unrelated prop sprites', () => {
    const centerCasino = hotspot('center', 'center-casino');
    const caveMap = hotspot('energy_cave', 'cave-map');
    expect(isPortalLikeHotspot(centerCasino.action)).toBe(true);
    expect(isPortalLikeHotspot(caveMap.action)).toBe(true);
    expect(legacyHotspotTexture(centerCasino)).toBeNull();
    expect(legacyHotspotTexture(caveMap)).toBeNull();
  });
});
