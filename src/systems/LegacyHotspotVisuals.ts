import { SceneKey } from '@/config/GameConfig';
import type { LegacyAction, LegacyLocationHotspot } from '@/scenes/LegacyContent';

export function isPortalLikeHotspot(action: LegacyAction): boolean {
  return action.kind === 'location' || (action.kind === 'scene' && action.target === SceneKey.WORLD);
}

export function legacyHotspotTexture(hotspot: LegacyLocationHotspot): string | null {
  void hotspot;
  return null;
}
