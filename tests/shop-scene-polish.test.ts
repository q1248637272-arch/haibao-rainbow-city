import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { shopVipOnlyItems } from '@/data/items';

describe('shop scene polish', () => {
  it('registers the gpt-image-2 premium supply shop background and fast derivative', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');
    const preloaderSource = readFileSync(
      path.resolve('src/systems/SceneAssetPreloader.ts'),
      'utf8',
    );
    const shopSource = readFileSync(path.resolve('src/scenes/ShopScene.ts'), 'utf8');

    expect(preloadSource).toContain('premium_rainbow_supply_shop_image2');
    expect(preloaderSource).toContain("'premium_rainbow_supply_shop_image2'");
    expect(shopSource).toContain("const SHOP_BACKGROUND_KEY = 'premium_rainbow_supply_shop_image2'");

    const sourceAsset = path.resolve(
      'public/assets/legacy/image2-restored/ui/premium_rainbow_supply_shop_image2.webp',
    );
    const fastAsset = path.resolve(
      'public/assets/legacy/fast/image2-restored/ui/premium_rainbow_supply_shop_image2_fast.webp',
    );
    expect(existsSync(sourceAsset)).toBe(true);
    expect(existsSync(fastAsset)).toBe(true);
    expect(statSync(sourceAsset).size).toBeGreaterThan(180_000);
    expect(statSync(fastAsset).size).toBeGreaterThan(70_000);
  });

  it('keeps the VIP shelf as real stocked content with visible purchase states', () => {
    const shopSource = readFileSync(path.resolve('src/scenes/ShopScene.ts'), 'utf8');

    expect(shopVipOnlyItems().length).toBeGreaterThanOrEqual(5);
    expect(shopSource).toContain('VIP 货架已开放');
    expect(shopSource).toContain('purchaseStatusFor');
    expect(shopSource).not.toContain('VIP 专属商品即将上架');
  });
});
