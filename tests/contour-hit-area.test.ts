import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '@/config/GameConfig';
import {
  chooseVerifiedContourHitArea,
  containsContourPoint,
  contourBounds,
  verifyContourHitAreaTwice,
  type ContourHitArea,
} from '@/systems/ContourHitArea';
import { legacyHotspotContour } from '@/systems/LegacyHotspotVisuals';
import { LEGACY_LOCATIONS } from '@/scenes/LegacyContent';

const WORLD_BOUNDS = { left: 0, right: GAME_WIDTH, top: 0, bottom: GAME_HEIGHT } as const;

describe('contour hit areas', () => {
  it('double-verifies a valid contour before it can be used', () => {
    const area: ContourHitArea = { kind: 'ellipse', x: 480, y: 320, rx: 72, ry: 34 };

    const result = verifyContourHitAreaTwice(area, {
      minWidth: 24,
      minHeight: 18,
      worldBounds: WORLD_BOUNDS,
    });

    expect(result.ok).toBe(true);
    expect(result.passCount).toBe(2);
    expect(result.failures).toEqual([]);
    expect(containsContourPoint(area, 480, 320)).toBe(true);
    expect(containsContourPoint(area, 480 + 88, 320)).toBe(false);
  });

  it('rebuilds a bad response area until verification succeeds', () => {
    const invalid: ContourHitArea = { kind: 'ellipse', x: 120, y: 180, rx: -6, ry: 0 };
    const fallback: ContourHitArea = {
      kind: 'rect',
      x: 120,
      y: 180,
      width: 72,
      height: 42,
      radius: 8,
    };

    const selection = chooseVerifiedContourHitArea(invalid, {
      fallbackArea: fallback,
      minWidth: 24,
      minHeight: 18,
      worldBounds: WORLD_BOUNDS,
    });

    expect(selection.attempts).toBe(2);
    expect(selection.area).toEqual(fallback);
    expect(selection.verification.ok).toBe(true);
  });

  it('keeps legacy-location response contours visible, bounded, and non-circular', () => {
    for (const def of Object.values(LEGACY_LOCATIONS)) {
      for (const hotspot of def.hotspots) {
        const area = legacyHotspotContour(hotspot);
        const result = verifyContourHitAreaTwice(area, {
          label: `${def.id}.${hotspot.id}`,
          minWidth: 24,
          minHeight: 18,
          worldBounds: WORLD_BOUNDS,
        });
        const bounds = contourBounds(area);

        expect(area.kind, `${def.id}.${hotspot.id} should use an object contour`).not.toBe(
          'circle',
        );
        expect(result.failures).toEqual([]);
        expect(result.ok).toBe(true);
        expect(bounds.width, `${def.id}.${hotspot.id} width`).toBeGreaterThanOrEqual(24);
        expect(bounds.height, `${def.id}.${hotspot.id} height`).toBeGreaterThanOrEqual(18);
      }
    }
  });
});
