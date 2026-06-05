import type { PixelBounds, PixelPoint } from '@/systems/PixelPathfinding';

export const WORLD_MAP_WALK_BOUNDS: PixelBounds = {
  left: -232,
  right: 1192,
  top: 0,
  bottom: 640,
};

export function isWorldMapWalkable(x: number, y: number): boolean {
  return (
    x >= WORLD_MAP_WALK_BOUNDS.left &&
    x <= WORLD_MAP_WALK_BOUNDS.right &&
    y >= WORLD_MAP_WALK_BOUNDS.top &&
    y <= WORLD_MAP_WALK_BOUNDS.bottom
  );
}

export function nearestWorldMapWalkable(x: number, y: number): PixelPoint {
  return {
    x: clamp(x, WORLD_MAP_WALK_BOUNDS.left, WORLD_MAP_WALK_BOUNDS.right),
    y: clamp(y, WORLD_MAP_WALK_BOUNDS.top, WORLD_MAP_WALK_BOUNDS.bottom),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
