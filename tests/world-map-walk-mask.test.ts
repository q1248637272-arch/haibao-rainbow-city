import { describe, expect, it } from 'vitest';

import { findPixelPath } from '@/systems/PixelPathfinding';
import {
  isWorldMapWalkable,
  nearestWorldMapWalkable,
  WORLD_MAP_WALK_BOUNDS,
} from '@/systems/WorldMapWalkMask';

describe('world map walk mask', () => {
  it('allows the full wide Rainbow City map rectangle', () => {
    expect(WORLD_MAP_WALK_BOUNDS).toEqual({
      left: -232,
      right: 1192,
      top: 0,
      bottom: 640,
    });

    expect(isWorldMapWalkable(-231, 8)).toBe(true);
    expect(isWorldMapWalkable(58, 438)).toBe(true);
    expect(isWorldMapWalkable(510, 24)).toBe(true);
    expect(isWorldMapWalkable(1188, 636)).toBe(true);
  });

  it('keeps only out-of-map coordinates blocked', () => {
    expect(isWorldMapWalkable(WORLD_MAP_WALK_BOUNDS.left - 1, 320)).toBe(false);
    expect(isWorldMapWalkable(WORLD_MAP_WALK_BOUNDS.right + 1, 320)).toBe(false);
    expect(isWorldMapWalkable(480, WORLD_MAP_WALK_BOUNDS.top - 1)).toBe(false);
    expect(isWorldMapWalkable(480, WORLD_MAP_WALK_BOUNDS.bottom + 1)).toBe(false);
  });

  it('keeps formerly overfit water and bridge-pocket points walkable for better feel', () => {
    expect(isWorldMapWalkable(356, 372)).toBe(true);
    expect(isWorldMapWalkable(676, 500)).toBe(true);
    expect(isWorldMapWalkable(706, 360)).toBe(true);
    expect(isWorldMapWalkable(58, 438)).toBe(true);
    expect(isWorldMapWalkable(-74, 390)).toBe(true);
  });

  it('allows direct traversal through the whole map instead of narrow corridors', () => {
    expect(isWorldMapWalkable(238, 510)).toBe(true);
    expect(isWorldMapWalkable(510, 370)).toBe(true);
    expect(isWorldMapWalkable(760, 308)).toBe(true);
    expect(isWorldMapWalkable(1038, 504)).toBe(true);

    const leftPath = findPixelPath({
      bounds: WORLD_MAP_WALK_BOUNDS,
      start: { x: 238, y: 510 },
      target: { x: -74, y: 390 },
      isWalkable: isWorldMapWalkable,
      cellSize: 20,
      maxTargetSearchRadius: 18,
    });
    expect(leftPath).not.toBeNull();
    expect(leftPath).toHaveLength(2);

    const topRightPath = findPixelPath({
      bounds: WORLD_MAP_WALK_BOUNDS,
      start: { x: 238, y: 510 },
      target: { x: 1110, y: 86 },
      isWalkable: isWorldMapWalkable,
      cellSize: 20,
      maxTargetSearchRadius: 18,
    });
    expect(topRightPath).not.toBeNull();
    expect(topRightPath).toHaveLength(2);
  });

  it('does not snap formerly blocked in-map clicks away from their requested position', () => {
    const point = nearestWorldMapWalkable(356, 372);

    expect(isWorldMapWalkable(point.x, point.y)).toBe(true);
    expect(point).toEqual({ x: 356, y: 372 });
  });

  it('snaps only off-map clicks back to the full-map rectangle', () => {
    expect(nearestWorldMapWalkable(-999, -44)).toEqual({
      x: WORLD_MAP_WALK_BOUNDS.left,
      y: WORLD_MAP_WALK_BOUNDS.top,
    });
    expect(nearestWorldMapWalkable(9999, 9999)).toEqual({
      x: WORLD_MAP_WALK_BOUNDS.right,
      y: WORLD_MAP_WALK_BOUNDS.bottom,
    });
  });
});
