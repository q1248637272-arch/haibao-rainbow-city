import { describe, expect, it } from 'vitest';

import { SceneKey } from '@/config/GameConfig';
import {
  GAMEPLAY_GUIDE_CATEGORIES,
  GAMEPLAY_GUIDE_ENTRIES,
  entriesForGameplayGuide,
} from '@/data/gameplayGuide';

describe('gameplay guide', () => {
  it('keeps every category populated with actionable entries', () => {
    for (const category of GAMEPLAY_GUIDE_CATEGORIES) {
      const entries = entriesForGameplayGuide(category.id);
      expect(entries.length).toBeGreaterThanOrEqual(4);
      expect(entries.every((entry) => entry.categoryId === category.id)).toBe(true);
    }
  });

  it('routes every guide entry to a registered scene key', () => {
    const sceneKeys = new Set<string>(Object.values(SceneKey));
    for (const entry of GAMEPLAY_GUIDE_ENTRIES) {
      expect(sceneKeys.has(entry.scene)).toBe(true);
      expect(entry.actionLabel.length).toBeGreaterThan(1);
    }
  });

  it('uses short copy so mobile cards stay readable', () => {
    for (const entry of GAMEPLAY_GUIDE_ENTRIES) {
      expect(entry.title.length).toBeLessThanOrEqual(8);
      expect(entry.summary.length).toBeLessThanOrEqual(38);
      expect(entry.rewardHint.length).toBeLessThanOrEqual(18);
    }
  });

  it('has stable unique entry ids', () => {
    const ids = GAMEPLAY_GUIDE_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
