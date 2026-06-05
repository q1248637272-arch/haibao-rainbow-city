import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SceneKey } from '@/config/GameConfig';
import { QUESTS_DAILY_POOL, QUESTS_MAIN } from '@/data/quests';
import { LEGACY_LOCATIONS } from '@/scenes/LegacyContent';
import {
  LIBRARY_ARCHIVE_CARD_POOL,
  LIBRARY_ARCHIVE_CATEGORIES,
  LIBRARY_ARCHIVE_DAILY_REWARD_LIMIT,
  LIBRARY_ARCHIVE_MINIGAME_ID,
  LIBRARY_ARCHIVE_SOURCE,
  LIBRARY_ARCHIVE_TARGET_SCORE,
  generateLibraryArchiveDeck,
  normalizeLibraryArchiveSortState,
  readLibraryArchiveSortState,
  settleLibraryArchiveSortRun,
} from '@/systems/LibraryArchiveSort';
import { destinationForCondition } from '@/systems/QuestDestinations';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('LibraryArchiveSort', () => {
  it('generates a stable balanced deck with all archive categories represented', () => {
    const deck = generateLibraryArchiveDeck('2026-06-04:library', LIBRARY_ARCHIVE_TARGET_SCORE);

    expect(deck).toHaveLength(LIBRARY_ARCHIVE_TARGET_SCORE);
    expect(generateLibraryArchiveDeck('2026-06-04:library', LIBRARY_ARCHIVE_TARGET_SCORE)).toEqual(deck);
    expect(new Set(deck.map((card) => card.id)).size).toBe(deck.length);
    for (const category of LIBRARY_ARCHIVE_CATEGORIES) {
      expect(deck.some((card) => card.category === category)).toBe(true);
    }
    expect(LIBRARY_ARCHIVE_CARD_POOL.length).toBeGreaterThan(LIBRARY_ARCHIVE_TARGET_SCORE);
  });

  it('resets stale daily state and clamps invalid counters', () => {
    expect(
      normalizeLibraryArchiveSortState(
        {
          date: '2026-06-04',
          bestScore: 99,
          rewardClaims: 99,
          totalRuns: -4,
          perfectRuns: 2.8,
        },
        '2026-06-04',
      ),
    ).toEqual({
      date: '2026-06-04',
      bestScore: LIBRARY_ARCHIVE_TARGET_SCORE,
      rewardClaims: LIBRARY_ARCHIVE_DAILY_REWARD_LIMIT,
      totalRuns: 0,
      perfectRuns: 2,
    });

    expect(normalizeLibraryArchiveSortState({ date: '2026-06-03', bestScore: 6 }, '2026-06-04')).toEqual({
      date: '2026-06-04',
      bestScore: 0,
      rewardClaims: 0,
      totalRuns: 0,
      perfectRuns: 0,
    });
  });

  it('grants rewards only for complete repairs and respects the daily cap', () => {
    const first = settleLibraryArchiveSortRun(LIBRARY_ARCHIVE_TARGET_SCORE, 0, {
      date: '2026-06-04',
      bestScore: 0,
      rewardClaims: 0,
      totalRuns: 0,
      perfectRuns: 0,
    });

    expect(first.rewardGranted).toBe(true);
    expect(first.reward).toMatchObject({ expCandy: 2, lightFruit: 1, crystalShards: 1 });
    expect(first.next.rewardClaims).toBe(1);
    expect(first.next.perfectRuns).toBe(1);

    const failed = settleLibraryArchiveSortRun(LIBRARY_ARCHIVE_TARGET_SCORE - 1, 1, first.next);
    expect(failed.rewardGranted).toBe(false);
    expect(failed.next.rewardClaims).toBe(1);

    const capped = settleLibraryArchiveSortRun(LIBRARY_ARCHIVE_TARGET_SCORE, 2, {
      ...failed.next,
      rewardClaims: LIBRARY_ARCHIVE_DAILY_REWARD_LIMIT,
    });
    expect(capped.rewardGranted).toBe(false);
    expect(capped.remainingClaims).toBe(0);
  });

  it('keeps constants, routing, quests, and image2 assets wired', () => {
    expect(SceneKey.LIBRARY_ARCHIVE).toBe('LibraryArchiveScene');
    expect(LIBRARY_ARCHIVE_MINIGAME_ID).toBe('library_archive_sort');
    expect(LIBRARY_ARCHIVE_SOURCE).toBe('library:archive_sort');

    const hotspot = LEGACY_LOCATIONS.library.hotspots.find((item) => item.id === 'library-archive');
    expect(hotspot?.action).toMatchObject({
      kind: 'scene',
      target: SceneKey.LIBRARY_ARCHIVE,
    });
    expect(LEGACY_LOCATIONS.library.hotspots.some((item) => item.id === 'library-quest')).toBe(true);
    expect(LEGACY_LOCATIONS.library.hotspots.some((item) => item.id === 'library-note')).toBe(true);

    const mainQuest = QUESTS_MAIN.find((quest) => quest.id === 'q_main_002');
    const dailyQuest = QUESTS_DAILY_POOL.find((quest) => quest.id === 'd_library_check');
    expect(mainQuest?.conditions).toContainEqual({
      kind: 'minigame_score',
      minigameId: LIBRARY_ARCHIVE_MINIGAME_ID,
      targetScore: LIBRARY_ARCHIVE_TARGET_SCORE,
    });
    expect(dailyQuest?.conditions).toContainEqual({
      kind: 'minigame_score',
      minigameId: LIBRARY_ARCHIVE_MINIGAME_ID,
      targetScore: LIBRARY_ARCHIVE_TARGET_SCORE,
    });
    expect(destinationForCondition(mainQuest!.conditions[0]!)).toMatchObject({
      scene: SceneKey.LIBRARY_ARCHIVE,
      sceneData: { returnLocationId: 'library' },
    });

    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    const preloaderSource = readFileSync(
      path.resolve('src/systems/SceneAssetPreloader.ts'),
      'utf8',
    );
    const sceneSource = readFileSync(path.resolve('src/scenes/LibraryArchiveScene.ts'), 'utf8');
    expect(preloadSource).toContain(
      "premium_library_archive_desk_image2:\n    'assets/legacy/image2-restored/ui/premium_library_archive_desk_image2.webp'",
    );
    expect(preloaderSource).toContain("'premium_library_archive_desk_image2'");
    expect(sceneSource).toContain("LIBRARY_ARCHIVE_BACKGROUND_KEY = 'premium_library_archive_desk_image2'");

    const sourceAsset = path.resolve(
      'public/assets/legacy/image2-restored/ui/premium_library_archive_desk_image2.webp',
    );
    const fastAsset = path.resolve(
      'public/assets/legacy/fast/image2-restored/ui/premium_library_archive_desk_image2_fast.webp',
    );
    expect(existsSync(sourceAsset)).toBe(true);
    expect(existsSync(fastAsset)).toBe(true);
    expect(statSync(sourceAsset).size).toBeGreaterThan(250_000);
    expect(statSync(fastAsset).size).toBeGreaterThan(60_000);

    const storage = new MemoryStorage();
    const state = readLibraryArchiveSortState(storage, new Date('2026-06-04T03:00:00Z'));
    expect(state.date).toBe('2026-06-04');
  });
});
