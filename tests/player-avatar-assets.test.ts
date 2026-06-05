import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

interface PngInfo {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
}

interface AlphaBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 128;

function readPngInfo(filePath: string): PngInfo {
  const buffer = readFileSync(filePath);
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer.readUInt8(24),
    colorType: buffer.readUInt8(25),
  };
}

function readRgbaPng(filePath: string): { readonly info: PngInfo; readonly pixels: Buffer } {
  const buffer = readFileSync(filePath);
  const info = readPngInfo(filePath);
  expect(info.bitDepth).toBe(8);
  expect(info.colorType).toBe(6);

  const idatChunks: Buffer[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataStart + length));
    }
    offset = dataStart + length + 4;
  }

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const stride = info.width * bytesPerPixel;
  const pixels = Buffer.alloc(info.height * stride);
  let sourceOffset = 0;

  for (let y = 0; y < info.height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = inflated.subarray(sourceOffset, sourceOffset + stride);
    const outOffset = y * stride;
    sourceOffset += stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? pixels[outOffset + x - bytesPerPixel] ?? 0 : 0;
      const up = y > 0 ? pixels[outOffset + x - stride] ?? 0 : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[outOffset + x - stride - bytesPerPixel] ?? 0 : 0;
      const raw = row[x] ?? 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paeth(left, up, upLeft);
      else expect(filter).toBe(0);
      pixels[outOffset + x] = value & 0xff;
    }
  }

  return { info, pixels };
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function alphaBoundsForFrame(
  pixels: Buffer,
  imageWidth: number,
  frameIndex: number,
): AlphaBounds {
  const frameLeft = frameIndex * FRAME_WIDTH;
  let minX = FRAME_WIDTH;
  let minY = FRAME_HEIGHT;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < FRAME_HEIGHT; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const pixel = ((y * imageWidth + frameLeft + x) * 4);
      if ((pixels[pixel + 3] ?? 0) > 16) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + 1);
        maxY = Math.max(maxY, y + 1);
      }
    }
  }

  return { minX, minY, maxX, maxY };
}

function countVisibleMagentaPixels(pixels: Buffer): number {
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const a = pixels[i + 3] ?? 0;
    if (a > 16 && r > 180 && b > 180 && g < 110 && r - g > 80 && b - g > 80) {
      count += 1;
    }
  }
  return count;
}

describe('player avatar redraw assets', () => {
  it('keeps player avatar source and spritesheet paths wired through preloading', () => {
    const preloadSource = readFileSync(path.resolve('src/scenes/PreloadScene.ts'), 'utf8');

    expect(preloadSource).toContain('PLAYER_AVATAR_REDRAW_V2_CACHE_BUSTER');
    expect(preloadSource).toContain('player-avatar-redraw-v2-20260605');
    expect(preloadSource).toContain('legacy_player_hero: cacheBustLegacyAssetPath');
    expect(preloadSource).toContain('legacy_player_merman_male: cacheBustLegacyAssetPath');
    expect(preloadSource).toContain(
      'assets/legacy/image2-restored/characters/legacy_player_mermaid_image2.png',
    );
    expect(preloadSource).toContain(
      'assets/legacy/image2-restored/characters/legacy_player_merman_male_image2.png',
    );
    expect(preloadSource).toContain(
      'assets/legacy/image2-restored/characters/legacy_player_mermaid_image2_sheet.png',
    );
    expect(preloadSource).toContain(
      'assets/legacy/image2-restored/characters/legacy_player_merman_male_image2_sheet.png',
    );
  });

  it('keeps the female and male player spritesheets transparent and safely centered', () => {
    for (const name of [
      'legacy_player_mermaid_image2_sheet.png',
      'legacy_player_merman_male_image2_sheet.png',
    ]) {
      const sheet = path.resolve('public/assets/legacy/image2-restored/characters', name);
      const { info, pixels } = readRgbaPng(sheet);

      expect(info).toMatchObject({
        width: FRAME_WIDTH * 4,
        height: FRAME_HEIGHT,
        colorType: 6,
      });

      for (let frame = 0; frame < 4; frame += 1) {
        const bounds = alphaBoundsForFrame(pixels, info.width, frame);
        expect(bounds.minX, `${name} frame ${frame} left padding`).toBeGreaterThanOrEqual(4);
        expect(bounds.maxX, `${name} frame ${frame} right padding`).toBeLessThanOrEqual(92);
        expect(bounds.maxY, `${name} frame ${frame} bottom padding`).toBeLessThanOrEqual(126);
        expect(bounds.maxX - bounds.minX, `${name} frame ${frame} width`).toBeGreaterThan(42);
        expect(bounds.maxY - bounds.minY, `${name} frame ${frame} height`).toBeGreaterThan(86);
      }
    }
  });

  it('keeps the new male avatar source, fast derivative, and chroma-key cleanup available', () => {
    const raw = path.resolve('output/imagegen/premium_player_merman_male_v2_gpt-image-2.png');
    const source = path.resolve(
      'public/assets/legacy/image2-restored/characters/legacy_player_merman_male_image2.png',
    );
    const fast = path.resolve(
      'public/assets/legacy/fast/image2-restored/characters/legacy_player_merman_male_image2_fast.webp',
    );
    const sheet = path.resolve(
      'public/assets/legacy/image2-restored/characters/legacy_player_merman_male_image2_sheet.png',
    );
    const decoded = readRgbaPng(sheet);

    expect(existsSync(raw)).toBe(true);
    expect(readPngInfo(raw)).toMatchObject({ width: 1536, height: 1024, colorType: 2 });
    expect(readFileSync(raw).byteLength).toBeGreaterThan(1_000_000);
    expect(readPngInfo(source)).toMatchObject({ width: 96, height: 128, colorType: 6 });
    expect(existsSync(fast)).toBe(true);
    expect(readFileSync(fast).byteLength).toBeGreaterThan(4_000);
    expect(countVisibleMagentaPixels(decoded.pixels)).toBe(0);
  });
});
