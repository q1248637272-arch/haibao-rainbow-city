import type Phaser from 'phaser';

import { BOSSES } from '@/data/bosses';
import { PETS } from '@/data/pets';
import type { PetVisual } from '@/types';

/**
 * 精灵 / BOSS 等距 Q 版程序化绘制模块（FEAT-203）。
 *
 * 职责：读取 `PetData.visual` / `BossData.visual`，按 `silhouette` 分派到 5 个绘制子函数，
 * 统一生成"椭圆阴影 → 底座/主体 → 高光 → 轮廓"的 2.5D 造型。
 *
 * 纹理 key 前缀采用 `iso-pet:` / `iso-boss:`，与旧 `pet:` / `boss:` 并列存在，避免任何
 * 已缓存的旧纹理冲突。上层 `ensurePetTexture` / `ensureBossTexture` 统一转发到本模块，
 * 所以 BattleScene / PetCard / WorldMapScene 调用点无需改动。
 *
 * 所有函数幂等：若纹理已注册则立即返回既有 key。未知 id 兜底调用 placeholder.ts 的旧
 * `ensurePetTexture` / `ensureBossTexture`（regression-safe）。
 */

export const ISO_PET_TEXTURE_PREFIX = 'iso-pet:';
export const ISO_BOSS_TEXTURE_PREFIX = 'iso-boss:';

const PREFER_GENERATED_PET_TEXTURE = new Set<string>();
const PREFER_RESTORED_PET_TEXTURE = new Set([
  'li_aoxiang',
  'meng_lei',
  'fars_fire_donkey',
  'arthur_knight',
  'elephant_walrus',
  'xuanqing_jingwei',
  'aotian_dragon',
  'erebus_penguin',
  'ingmar_night',
  'hekapu_night',
  'leonard_gunner',
  'pester_priest',
  'oni_tyranno',
  'diudiu_maori',
]);

function isoPetKey(id: string): string {
  return `${ISO_PET_TEXTURE_PREFIX}${id}`;
}

function isoBossKey(id: string): string {
  return `${ISO_BOSS_TEXTURE_PREFIX}${id}`;
}

/** sizeClass → 纹理像素尺寸。导出以便单测断言 FEAT-311 xlarge=128 / 常规 large=96。 */
export function sizeOf(visual: PetVisual): number {
  switch (visual.sizeClass) {
    case 'small':
      return 48;
    case 'large':
      return 96;
    case 'xlarge':
      return 128;
    case 'medium':
    default:
      return 64;
  }
}

/**
 * FEAT-311：基础阴影 alpha 叠 +0.05 加强落地感（封顶 0.7），polish 用。
 */
function enhancedShadow(base: number): number {
  return Math.min(0.7, base + 0.05);
}

/**
 * FEAT-311：大体型（large / xlarge）采用更粗的描边（2.5px），其他保持 2px。
 */
function outlineWidth(visual: PetVisual): number {
  return visual.sizeClass === 'large' || visual.sizeClass === 'xlarge' ? 2.5 : 2;
}

/**
 * 幂等生成精灵等距 Q 版纹理，返回纹理 key。
 *
 * 未知 id / 未填 visual（编译期已拦截，防御性分支）：回退到旧 `ensurePetTexture`。
 */
export function ensureIsoPetTexture(scene: Phaser.Scene, petId: string): string {
  const legacyKey = `legacy_pet_${petId}`;
  if (PREFER_RESTORED_PET_TEXTURE.has(petId) && scene.textures.exists(legacyKey)) {
    return legacyKey;
  }

  const dollKey = `legacy_doll_${petId}`;
  if (scene.textures.exists(dollKey)) return dollKey;

  if (scene.textures.exists(legacyKey) && !PREFER_GENERATED_PET_TEXTURE.has(petId)) {
    return legacyKey;
  }

  const key = isoPetKey(petId);
  if (scene.textures.exists(key)) return key;

  const pet = PETS[petId];
  if (!pet) {
    // 未知 id：延迟 require 旧 placeholder 以避免循环依赖（placeholder 也 import 本模块）。
    // 使用 dynamic import 语义的静态形式：直接走兜底灰色 tile key，交给旧 ensurePetTexture。
    return fallbackEnsurePet(scene, petId);
  }

  const size = sizeOf(pet.visual);
  const g = scene.add.graphics({ x: 0, y: 0 });
  drawBySilhouette(g, pet.visual, size);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/**
 * 幂等生成 BOSS 等距 Q 版纹理，返回纹理 key。
 */
export function ensureIsoBossTexture(scene: Phaser.Scene, bossId: string): string {
  const legacyKey = `legacy_boss_${bossId}`;
  if (scene.textures.exists(legacyKey)) return legacyKey;

  const key = isoBossKey(bossId);
  if (scene.textures.exists(key)) return key;

  const boss = BOSSES[bossId];
  if (!boss) {
    return fallbackEnsureBoss(scene, bossId);
  }

  const size = sizeOf(boss.visual);
  const g = scene.add.graphics({ x: 0, y: 0 });
  drawBySilhouette(g, boss.visual, size);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/**
 * 分派到 5 个 silhouette 绘制子函数。
 */
function drawBySilhouette(g: Phaser.GameObjects.Graphics, visual: PetVisual, size: number): void {
  switch (visual.silhouette) {
    case 'quadruped':
      drawQuadruped(g, visual, size);
      return;
    case 'biped':
      drawBiped(g, visual, size);
      return;
    case 'floater':
      drawFloater(g, visual, size);
      return;
    case 'static':
      drawStatic(g, visual, size);
      return;
    case 'blade':
      drawBlade(g, visual, size);
      return;
    default: {
      // 穷尽性断言
      const _exhaustive: never = visual.silhouette;
      throw new Error(`未知 silhouette: ${String(_exhaustive)}`);
    }
  }
}

// ---- 5 个 silhouette 分支 -------------------------------------------------

/**
 * 四足生物：低阔椭圆阴影 → 扁椭圆底座（身躯） → 四只短腿小圆 → 圆头 → 高光 → 轮廓。
 */
function drawQuadruped(g: Phaser.GameObjects.Graphics, visual: PetVisual, size: number): void {
  const cx = size / 2;
  const floorY = size - size * 0.18;

  // 1) 椭圆阴影（低阔，压在脚下；FEAT-311 +0.05 加强落地感）
  g.fillStyle(0x000000, enhancedShadow(visual.shadowOpacity));
  g.fillEllipse(cx, floorY + 2, size * 0.7, size * 0.18);

  // 2) 主体：扁椭圆躯干
  const bodyW = size * 0.62;
  const bodyH = size * 0.42;
  const bodyCy = floorY - bodyH * 0.55;
  g.fillStyle(visual.bodyColor, 1);
  g.fillEllipse(cx, bodyCy, bodyW, bodyH);

  // 3) 四只短脚（FEAT-311：从圆 → 椭圆 8x4，看起来更像爪子）
  const footW = size * 0.125;
  const footH = size * 0.0625;
  g.fillStyle(visual.bodyColor, 1);
  g.fillEllipse(cx - bodyW * 0.32, floorY - footH / 2, footW, footH);
  g.fillEllipse(cx + bodyW * 0.32, floorY - footH / 2, footW, footH);
  g.fillEllipse(cx - bodyW * 0.18, floorY - footH * 0.4, footW * 0.85, footH * 0.85);
  g.fillEllipse(cx + bodyW * 0.18, floorY - footH * 0.4, footW * 0.85, footH * 0.85);

  // 4) 圆头（面向右上，略偏前）
  const headR = size * 0.2;
  const headCx = cx + bodyW * 0.1;
  const headCy = bodyCy - bodyH * 0.35 - headR * 0.3;
  g.fillCircle(headCx, headCy, headR);

  // 5) 高光：主体左上 + 头左上
  g.fillStyle(visual.accentColor, 0.7);
  g.fillEllipse(cx - bodyW * 0.2, bodyCy - bodyH * 0.25, bodyW * 0.3, bodyH * 0.25);
  g.fillCircle(headCx - headR * 0.35, headCy - headR * 0.35, headR * 0.3);

  // 6) 黑豆眼（让卡通感更强）
  g.fillStyle(0x111827, 1);
  g.fillCircle(headCx + headR * 0.2, headCy - headR * 0.1, Math.max(1, size * 0.025));
  g.fillCircle(headCx + headR * 0.55, headCy - headR * 0.1, Math.max(1, size * 0.025));

  // 7) 轮廓
  g.lineStyle(outlineWidth(visual), visual.outlineColor, 0.9);
  g.strokeEllipse(cx, bodyCy, bodyW, bodyH);
  g.strokeCircle(headCx, headCy, headR);
}

/**
 * 双足生物：站立椭圆阴影 → 椭圆身体（纵向高） → 圆头 → 两条短腿 → 高光 → 轮廓。
 */
function drawBiped(g: Phaser.GameObjects.Graphics, visual: PetVisual, size: number): void {
  const cx = size / 2;
  const floorY = size - size * 0.15;

  // 1) 阴影（窄一点；FEAT-311 +0.05 加强落地感）
  g.fillStyle(0x000000, enhancedShadow(visual.shadowOpacity));
  g.fillEllipse(cx, floorY + 2, size * 0.5, size * 0.13);

  // 2) 两条短腿
  const legW = size * 0.09;
  const legH = size * 0.18;
  g.fillStyle(visual.bodyColor, 1);
  g.fillRect(cx - legW - 2, floorY - legH, legW, legH);
  g.fillRect(cx + 2, floorY - legH, legW, legH);
  // FEAT-311：双脚底部 1px 深色描边，贴地感更强
  g.lineStyle(1, visual.outlineColor, 0.8);
  g.strokeRect(cx - legW - 2, floorY - legH, legW, legH);
  g.strokeRect(cx + 2, floorY - legH, legW, legH);

  // 3) 主体：纵向椭圆身体
  const bodyW = size * 0.48;
  const bodyH = size * 0.42;
  const bodyCy = floorY - legH - bodyH * 0.45;
  g.fillEllipse(cx, bodyCy, bodyW, bodyH);

  // 4) 头（圆形，略大）
  const headR = size * 0.22;
  const headCy = bodyCy - bodyH * 0.5 - headR * 0.4;
  g.fillCircle(cx, headCy, headR);

  // 5) 高光
  g.fillStyle(visual.accentColor, 0.75);
  g.fillEllipse(cx - bodyW * 0.2, bodyCy - bodyH * 0.2, bodyW * 0.3, bodyH * 0.25);
  g.fillCircle(cx - headR * 0.35, headCy - headR * 0.35, headR * 0.3);

  // 6) 黑豆眼
  g.fillStyle(0x111827, 1);
  g.fillCircle(cx - headR * 0.3, headCy, Math.max(1, size * 0.025));
  g.fillCircle(cx + headR * 0.3, headCy, Math.max(1, size * 0.025));

  // 7) 轮廓
  g.lineStyle(outlineWidth(visual), visual.outlineColor, 0.9);
  g.strokeEllipse(cx, bodyCy, bodyW, bodyH);
  g.strokeCircle(cx, headCy, headR);
}

/**
 * 漂浮生物：阴影远离本体（下压 + 缩小），主体悬浮在上方；适合鸟/精灵类。
 */
function drawFloater(g: Phaser.GameObjects.Graphics, visual: PetVisual, size: number): void {
  const cx = size / 2;
  const floorY = size - size * 0.08;
  const floatLift = size * 0.2; // 本体相对地面再上浮一截

  // 1) 阴影：脚下压扁椭圆，离本体远（FEAT-311 +0.05）
  g.fillStyle(0x000000, enhancedShadow(visual.shadowOpacity));
  g.fillEllipse(cx, floorY, size * 0.44, size * 0.11);

  // 2) 主体：椭圆体 + 两翼（三角形）
  const bodyW = size * 0.48;
  const bodyH = size * 0.4;
  const bodyCy = floorY - floatLift - bodyH * 0.55;
  g.fillStyle(visual.bodyColor, 1);
  g.fillEllipse(cx, bodyCy, bodyW, bodyH);

  // 翅膀：左右三角
  g.fillTriangle(
    cx - bodyW * 0.5,
    bodyCy,
    cx - bodyW * 0.95,
    bodyCy - bodyH * 0.25,
    cx - bodyW * 0.3,
    bodyCy + bodyH * 0.1,
  );
  g.fillTriangle(
    cx + bodyW * 0.5,
    bodyCy,
    cx + bodyW * 0.95,
    bodyCy - bodyH * 0.25,
    cx + bodyW * 0.3,
    bodyCy + bodyH * 0.1,
  );
  // FEAT-311：翅膀顶边轮廓（从本体向翼尖的一条线），强化轮廓感
  g.lineStyle(1.5, visual.outlineColor, 0.85);
  g.lineBetween(cx - bodyW * 0.5, bodyCy, cx - bodyW * 0.95, bodyCy - bodyH * 0.25);
  g.lineBetween(cx + bodyW * 0.5, bodyCy, cx + bodyW * 0.95, bodyCy - bodyH * 0.25);

  // 3) 头（小圆，朝右前）
  const headR = size * 0.16;
  const headCx = cx + bodyW * 0.15;
  const headCy = bodyCy - bodyH * 0.4;
  g.fillCircle(headCx, headCy, headR);

  // 4) 高光
  g.fillStyle(visual.accentColor, 0.75);
  g.fillEllipse(cx - bodyW * 0.2, bodyCy - bodyH * 0.22, bodyW * 0.3, bodyH * 0.25);
  g.fillCircle(headCx - headR * 0.35, headCy - headR * 0.35, headR * 0.35);

  // 5) 黑豆眼
  g.fillStyle(0x111827, 1);
  g.fillCircle(headCx + headR * 0.25, headCy, Math.max(1, size * 0.025));

  // 6) 轮廓
  g.lineStyle(outlineWidth(visual), visual.outlineColor, 0.9);
  g.strokeEllipse(cx, bodyCy, bodyW, bodyH);
  g.strokeCircle(headCx, headCy, headR);
}

/**
 * 静止大体型：超大底座 + 主体三角/圆锥 + 顶部装饰（如雪顶）。
 * 适合山体拟人、BOSS、贝壳守卫等。
 */
function drawStatic(g: Phaser.GameObjects.Graphics, visual: PetVisual, size: number): void {
  const cx = size / 2;
  const floorY = size - size * 0.12;

  // 1) 大阴影（FEAT-311 +0.05）
  g.fillStyle(0x000000, enhancedShadow(visual.shadowOpacity));
  g.fillEllipse(cx, floorY + 2, size * 0.85, size * 0.2);

  // 2) 底座：厚实扁椭圆（模拟坐地基）
  const baseW = size * 0.78;
  const baseH = size * 0.2;
  g.fillStyle(visual.outlineColor, 1);
  g.fillEllipse(cx, floorY - baseH * 0.3, baseW, baseH);

  // 3) 主体：三角塔形
  const topY = size * 0.12;
  const leftX = cx - baseW * 0.42;
  const rightX = cx + baseW * 0.42;
  g.fillStyle(visual.bodyColor, 1);
  g.fillTriangle(leftX, floorY - baseH * 0.3, rightX, floorY - baseH * 0.3, cx, topY);

  // 4) 顶部装饰（FEAT-311：从单层小三角改为外大内小 2 层，类似雪顶 + 雪尖）
  // 外层（大）
  g.fillStyle(visual.accentColor, 0.85);
  g.fillTriangle(
    cx - size * 0.14,
    topY + size * 0.2,
    cx + size * 0.14,
    topY + size * 0.2,
    cx,
    topY + size * 0.02,
  );
  // 内层（小更亮）
  g.fillStyle(0xffffff, 0.75);
  g.fillTriangle(
    cx - size * 0.07,
    topY + size * 0.17,
    cx + size * 0.07,
    topY + size * 0.17,
    cx,
    topY + size * 0.05,
  );

  // 5) 一对小黑豆眼（在塔体中段）
  g.fillStyle(0x111827, 1);
  g.fillCircle(cx - size * 0.08, floorY - baseH * 0.3 - size * 0.2, Math.max(1.5, size * 0.03));
  g.fillCircle(cx + size * 0.08, floorY - baseH * 0.3 - size * 0.2, Math.max(1.5, size * 0.03));

  // 6) 高光（主体左侧边缘，斜向条带）
  g.fillStyle(visual.accentColor, 0.55);
  g.fillTriangle(
    leftX + size * 0.04,
    floorY - baseH * 0.3 - size * 0.04,
    cx - size * 0.02,
    topY + size * 0.04,
    leftX + size * 0.18,
    floorY - baseH * 0.3 - size * 0.04,
  );

  // 7) 轮廓
  g.lineStyle(outlineWidth(visual), visual.outlineColor, 0.9);
  g.strokeTriangle(leftX, floorY - baseH * 0.3, rightX, floorY - baseH * 0.3, cx, topY);
  g.strokeEllipse(cx, floorY - baseH * 0.3, baseW, baseH);
}

/**
 * 刀形：纵向刀尖 + 刀身 + 护手 + 握把；适合梦泪等化形武器。
 */
function drawBlade(g: Phaser.GameObjects.Graphics, visual: PetVisual, size: number): void {
  const cx = size / 2;
  const floorY = size - size * 0.1;

  // 1) 阴影（竖直窄椭圆，刀插地的投影；FEAT-311 +0.05）
  g.fillStyle(0x000000, enhancedShadow(visual.shadowOpacity));
  g.fillEllipse(cx, floorY + 2, size * 0.3, size * 0.08);

  // 2) 刀身：纵向长矩形
  const bladeW = Math.max(4, size * 0.11);
  const bladeTopY = size * 0.08;
  const bladeH = size * 0.66;
  g.fillStyle(visual.bodyColor, 1);
  g.fillRect(cx - bladeW / 2, bladeTopY, bladeW, bladeH);

  // 3) 刀尖：三角
  g.fillTriangle(
    cx - bladeW / 2,
    bladeTopY,
    cx + bladeW / 2,
    bladeTopY,
    cx,
    bladeTopY - size * 0.08,
  );

  // 4) 护手：横向扁矩形
  const guardW = size * 0.42;
  const guardH = size * 0.08;
  const guardY = bladeTopY + bladeH;
  g.fillStyle(visual.outlineColor, 1);
  g.fillRect(cx - guardW / 2, guardY, guardW, guardH);

  // 5) 握把：小矩形 + 圆底
  const handleW = size * 0.12;
  const handleH = size * 0.12;
  g.fillStyle(visual.accentColor, 1);
  g.fillRect(cx - handleW / 2, guardY + guardH, handleW, handleH);
  g.fillCircle(cx, guardY + guardH + handleH, handleW * 0.6);

  // 6) 高光：刀身左侧细条（寒光）
  g.fillStyle(visual.accentColor, 0.9);
  g.fillRect(
    cx - bladeW / 2 + 1,
    bladeTopY + size * 0.04,
    Math.max(1, bladeW * 0.25),
    bladeH * 0.85,
  );

  // 6b) FEAT-311：平行白色高光从刀尖延伸到刀身 3/4 位置，寒芒更明显
  g.fillStyle(0xffffff, 0.7);
  g.fillRect(cx - 1, bladeTopY + size * 0.04, Math.max(1, bladeW * 0.2), bladeH * 0.75);

  // 7) 轮廓
  g.lineStyle(outlineWidth(visual), visual.outlineColor, 0.9);
  g.strokeRect(cx - bladeW / 2, bladeTopY, bladeW, bladeH);
  g.strokeRect(cx - guardW / 2, guardY, guardW, guardH);
}

// ---- 未知 id 兜底（避免循环依赖：采用动态 import 不现实，TS 严格模式下改为
// ---- 显式在 placeholder 中单独持有旧分支。这里的 fallback 只需画一块纯色 tile。

function fallbackEnsurePet(scene: Phaser.Scene, petId: string): string {
  const key = isoPetKey(`unknown-${petId}`);
  if (scene.textures.exists(key)) return key;
  const size = 64;
  const g = scene.add.graphics({ x: 0, y: 0 });
  g.fillStyle(0x888888, 1);
  g.fillCircle(size / 2, size / 2, size / 2 - 4);
  g.lineStyle(2, 0x1b1b3a, 0.9);
  g.strokeCircle(size / 2, size / 2, size / 2 - 4);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

function fallbackEnsureBoss(scene: Phaser.Scene, bossId: string): string {
  const key = isoBossKey(`unknown-${bossId}`);
  if (scene.textures.exists(key)) return key;
  const size = 96;
  const g = scene.add.graphics({ x: 0, y: 0 });
  g.fillStyle(0x444444, 1);
  g.fillRect(8, 8, size - 16, size - 16);
  g.lineStyle(2, 0x1b1b3a, 0.9);
  g.strokeRect(8, 8, size - 16, size - 16);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}
