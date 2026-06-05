import { describe, expect, it } from 'vitest';

import { findPixelPath, type PixelPoint } from '@/systems/PixelPathfinding';

const bounds = { left: 0, right: 100, top: 0, bottom: 100 } as const;

function isWalkable(x: number, y: number): boolean {
  const inside = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  const inWall = x >= 45 && x <= 55 && y >= 0 && y <= 75;
  return inside && !inWall;
}

function segmentIsWalkable(from: PixelPoint, to: PixelPoint): boolean {
  const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
  const steps = Math.ceil(distance / 4);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (!isWalkable(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)) {
      return false;
    }
  }
  return true;
}

describe('findPixelPath', () => {
  it('绕开手绘地图里的像素障碍，而不是只走直线', () => {
    const path = findPixelPath({
      bounds,
      start: { x: 20, y: 20 },
      target: { x: 80, y: 20 },
      isWalkable,
      cellSize: 10,
    });

    expect(path).not.toBeNull();
    if (!path) return;
    expect(path.length).toBeGreaterThan(2);
    expect(path.some((point) => point.y > 75)).toBe(true);
    for (let i = 1; i < path.length; i += 1) {
      const from = path[i - 1];
      const to = path[i];
      if (!from || !to) throw new Error('路径节点缺失');
      expect(segmentIsWalkable(from, to)).toBe(true);
    }
  });
});
