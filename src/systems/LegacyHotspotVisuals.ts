import { SceneKey } from '@/config/GameConfig';
import type { LegacyAction, LegacyLocationHotspot } from '@/scenes/LegacyContent';
import type { ContourHitArea } from '@/systems/ContourHitArea';

export function isPortalLikeHotspot(action: LegacyAction): boolean {
  return action.kind === 'location' || (action.kind === 'scene' && action.target === SceneKey.WORLD);
}

export function legacyHotspotTexture(hotspot: LegacyLocationHotspot): string | null {
  void hotspot;
  return null;
}

export function legacyHotspotContour(hotspot: LegacyLocationHotspot): ContourHitArea {
  const radius = hotspot.radius ?? 28;
  if (isPortalLikeHotspot(hotspot.action)) {
    return {
      kind: 'ellipse',
      x: hotspot.x,
      y: hotspot.y + radius * 0.1,
      rx: Math.max(34, radius * 1.42),
      ry: Math.max(22, radius * 0.78),
    };
  }

  if (hotspot.action.kind === 'reward') {
    return {
      kind: 'rect',
      x: hotspot.x,
      y: hotspot.y,
      width: Math.max(62, radius * 2.16),
      height: Math.max(38, radius * 1.36),
      radius: 10,
    };
  }

  if (hotspot.action.kind === 'scene') {
    return {
      kind: 'rect',
      x: hotspot.x,
      y: hotspot.y,
      width: Math.max(68, radius * 2.3),
      height: Math.max(40, radius * 1.46),
      radius: 9,
    };
  }

  return {
    kind: 'ellipse',
    x: hotspot.x,
    y: hotspot.y,
    rx: Math.max(34, radius * 1.24),
    ry: Math.max(20, radius * 0.72),
  };
}
