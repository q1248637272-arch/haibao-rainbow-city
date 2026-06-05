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

  it('keeps cross-map exits as portals instead of unrelated prop sprites', () => {
    const centerCasino = hotspot('center', 'center-casino');
    const caveMap = hotspot('energy_cave', 'cave-map');
    expect(isPortalLikeHotspot(centerCasino.action)).toBe(true);
    expect(isPortalLikeHotspot(caveMap.action)).toBe(true);
    expect(legacyHotspotTexture(centerCasino)).toBeNull();
    expect(legacyHotspotTexture(caveMap)).toBeNull();
  });
});
