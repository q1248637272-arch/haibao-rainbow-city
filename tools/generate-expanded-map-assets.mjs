import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

const ROOT = path.resolve('D:/haibao/kiro-main4');
const OUT_DIR = path.join(ROOT, 'public/assets/legacy/expanded');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TARGET_W = 1440;
const TARGET_H = 2160;
const STAGE_W = 960;
const STAGE_H = 640;

const ASSETS = [
  ['legacy_7k7k_2', 'public/assets/legacy/optimized/maps/legacy_city_center_3d_fast.webp'],
  ['legacy_world_map_full', 'public/assets/legacy/optimized/title/legacy_world_map_3d_fast.webp'],
  [
    'legacy_home_walkable',
    'public/assets/legacy/image2-restored/home/legacy_home_walkable_integrated_v1_image2.png',
  ],
  [
    'legacy_farm_walkable',
    'public/assets/legacy/image2-restored/home/legacy_farm_walkable_image2.webp',
  ],
  [
    'legacy_beach_integrated',
    'public/assets/legacy/image2-restored/maps/legacy_beach_integrated_v1_image2.png',
  ],
  [
    'legacy_library_clean',
    'public/assets/legacy/image2-restored/maps/legacy_library_clean_image2.png',
  ],
  ['legacy_lab_clean', 'public/assets/legacy/image2-restored/maps/legacy_lab_clean_image2.png'],
  ['legacy_gym_hall', 'public/assets/legacy/image2-restored/maps/legacy_gym_hall_image2.png'],
  [
    'legacy_maze_gate_clean',
    'public/assets/legacy/image2-restored/maps/legacy_maze_gate_clean_image2.png',
  ],
  [
    'legacy_doll_base_clean',
    'public/assets/legacy/image2-restored/maps/legacy_doll_base_clean_image2.png',
  ],
  [
    'legacy_energy_field_clean',
    'public/assets/legacy/image2-restored/maps/legacy_energy_field_clean_image2.png',
  ],
  [
    'legacy_crystal_cave_clean',
    'public/assets/legacy/image2-restored/maps/legacy_crystal_cave_walkable_clean_image2.png',
  ],
  [
    'legacy_spaceship_clean',
    'public/assets/legacy/image2-restored/maps/legacy_spaceship_clean_image2.png',
  ],
  [
    'legacy_casino_clean',
    'public/assets/legacy/image2-restored/maps/legacy_casino_clean_image2.png',
  ],
  [
    'legacy_bath_center_clean',
    'public/assets/legacy/image2-restored/maps/legacy_bath_center_clean_image2.png',
  ],
  [
    'legacy_coral_market_clean',
    'public/assets/legacy/image2-restored/maps/legacy_coral_market_clean_image2.png',
  ],
  [
    'legacy_tide_playground_clean',
    'public/assets/legacy/image2-restored/maps/legacy_tide_playground_clean_image2.png',
  ],
  [
    'legacy_star_observatory_clean',
    'public/assets/legacy/image2-restored/maps/legacy_star_observatory_clean_image2.png',
  ],
  [
    'legacy_storm_ruins_clean',
    'public/assets/legacy/image2-restored/maps/legacy_storm_ruins_clean_image2.png',
  ],
  [
    'legacy_rainbow_hall_vip',
    'public/assets/legacy/image2-restored/maps/legacy_rainbow_hall_vip_image2.png',
  ],
  [
    'legacy_battle_arena_image2',
    'public/assets/legacy/image2-restored/maps/legacy_battle_arena_image2.png',
  ],
  [
    'premium_battle_arena_image2',
    'public/assets/legacy/image2-restored/ui/premium_battle_arena_image2.webp',
  ],
  [
    'premium_guide_background_image2',
    'public/assets/legacy/image2-restored/ui/premium_guide_background_image2.webp',
  ],
  ['legacy_haidi_lab', 'public/assets/legacy/restored/rainbow-city-4399-3-restored.png'],
  ['legacy_17173_1', 'public/assets/legacy/restored/rainbow-city-17173-1-restored.png'],
  ['legacy_17173_2', 'public/assets/legacy/restored/rainbow-city-17173-2-restored.png'],
];

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: TARGET_W, height: TARGET_H } });

  for (const [key, relPath] of ASSETS) {
    const sourcePath = path.join(ROOT, relPath);
    await fs.access(sourcePath);
    const sourceBytes = await fs.readFile(sourcePath);
    const url = `data:${mimeFor(sourcePath)};base64,${sourceBytes.toString('base64')}`;
    const bytes = await page.evaluate(
      async ({ url, targetW, targetH, stageW, stageH }) => {
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2D canvas is unavailable');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const stageX = (targetW - stageW) / 2;
        const stageY = (targetH - stageH) / 2;
        const coverScale = Math.max(targetW / image.naturalWidth, targetH / image.naturalHeight);
        const coverW = image.naturalWidth * coverScale;
        const coverH = image.naturalHeight * coverScale;
        const coverX = (targetW - coverW) / 2;
        const coverY = (targetH - coverH) / 2;

        ctx.fillStyle = '#0b7fc0';
        ctx.fillRect(0, 0, targetW, targetH);

        ctx.save();
        ctx.filter = 'blur(28px) saturate(1.18) brightness(0.98)';
        ctx.drawImage(image, coverX - 42, coverY - 42, coverW + 84, coverH + 84);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.38;
        ctx.filter = 'saturate(1.08) brightness(1.02)';
        ctx.drawImage(image, coverX, coverY, coverW, coverH);
        ctx.restore();

        const central = document.createElement('canvas');
        central.width = stageW;
        central.height = stageH;
        const cctx = central.getContext('2d');
        if (!cctx) throw new Error('2D canvas is unavailable');
        cctx.imageSmoothingEnabled = true;
        cctx.imageSmoothingQuality = 'high';
        cctx.drawImage(image, 0, 0, stageW, stageH);

        const mask = document.createElement('canvas');
        mask.width = stageW;
        mask.height = stageH;
        const mctx = mask.getContext('2d');
        if (!mctx) throw new Error('2D canvas is unavailable');
        const feather = 76;
        const innerX = feather;
        const innerY = feather;
        const innerW = stageW - feather * 2;
        const innerH = stageH - feather * 2;
        mctx.fillStyle = '#000';
        mctx.fillRect(innerX, innerY, innerW, innerH);

        const top = mctx.createLinearGradient(0, 0, 0, feather);
        top.addColorStop(0, 'rgba(0,0,0,0)');
        top.addColorStop(1, 'rgba(0,0,0,1)');
        mctx.fillStyle = top;
        mctx.fillRect(innerX, 0, innerW, feather);

        const bottom = mctx.createLinearGradient(0, stageH, 0, stageH - feather);
        bottom.addColorStop(0, 'rgba(0,0,0,0)');
        bottom.addColorStop(1, 'rgba(0,0,0,1)');
        mctx.fillStyle = bottom;
        mctx.fillRect(innerX, stageH - feather, innerW, feather);

        const left = mctx.createLinearGradient(0, 0, feather, 0);
        left.addColorStop(0, 'rgba(0,0,0,0)');
        left.addColorStop(1, 'rgba(0,0,0,1)');
        mctx.fillStyle = left;
        mctx.fillRect(0, innerY, feather, innerH);

        const right = mctx.createLinearGradient(stageW, 0, stageW - feather, 0);
        right.addColorStop(0, 'rgba(0,0,0,0)');
        right.addColorStop(1, 'rgba(0,0,0,1)');
        mctx.fillStyle = right;
        mctx.fillRect(stageW - feather, innerY, feather, innerH);

        for (const [x, y] of [
          [0, 0],
          [stageW - feather, 0],
          [0, stageH - feather],
          [stageW - feather, stageH - feather],
        ]) {
          const rg = mctx.createRadialGradient(
            x + (x === 0 ? feather : 0),
            y + (y === 0 ? feather : 0),
            0,
            x + (x === 0 ? feather : 0),
            y + (y === 0 ? feather : 0),
            feather,
          );
          rg.addColorStop(0, 'rgba(0,0,0,1)');
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          mctx.fillStyle = rg;
          mctx.fillRect(x, y, feather, feather);
        }

        cctx.globalCompositeOperation = 'destination-in';
        cctx.drawImage(mask, 0, 0);

        ctx.drawImage(central, stageX, stageY, stageW, stageH);

        ctx.save();
        const vignette = ctx.createRadialGradient(
          targetW / 2,
          targetH / 2,
          Math.min(targetW, targetH) * 0.24,
          targetW / 2,
          targetH / 2,
          Math.max(targetW, targetH) * 0.7,
        );
        vignette.addColorStop(0, 'rgba(255,255,255,0.03)');
        vignette.addColorStop(1, 'rgba(0,42,80,0.2)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.restore();

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
        if (!blob) throw new Error('Failed to encode webp');
        return [...new Uint8Array(await blob.arrayBuffer())];
      },
      { url, targetW: TARGET_W, targetH: TARGET_H, stageW: STAGE_W, stageH: STAGE_H },
    );

    const outPath = path.join(OUT_DIR, `${key}_expanded.webp`);
    await fs.writeFile(outPath, Buffer.from(bytes));
    console.log(`${key} -> ${path.relative(ROOT, outPath)}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/png';
}
