import type Phaser from 'phaser';

import { BOSSES } from '@/data/bosses';
import { PETS } from '@/data/pets';
import type { PetShape } from '@/types';
import { ensureIsoBossTexture, ensureIsoPetTexture } from '@/utils/isoPetSprite';

/**
 * 默认占位纹理尺寸。
 */
const SPRITE_SIZE = 64;

/**
 * 精灵纹理 key 前缀。真美术替换后只需在这里统一换。
 */
export const PET_TEXTURE_PREFIX = 'pet:';
export const BOSS_TEXTURE_PREFIX = 'boss:';
export const TILE_TEXTURE_PREFIX = 'tile:';

function tileKey(name: string): string {
  return `${TILE_TEXTURE_PREFIX}${name}`;
}

/**
 * 按形状把主体画到 Graphics 上。原点 (0,0) 为纹理左上角。
 */
function drawShape(
  g: Phaser.GameObjects.Graphics,
  shape: PetShape,
  color: number,
  size: number,
): void {
  const half = size / 2;
  g.fillStyle(color, 1);
  g.lineStyle(2, 0x000000, 0.8);

  switch (shape) {
    case 'circle': {
      g.fillCircle(half, half, half - 4);
      g.strokeCircle(half, half, half - 4);
      return;
    }
    case 'square': {
      g.fillRect(6, 6, size - 12, size - 12);
      g.strokeRect(6, 6, size - 12, size - 12);
      return;
    }
    case 'diamond': {
      const pts = [
        { x: half, y: 4 },
        { x: size - 4, y: half },
        { x: half, y: size - 4 },
        { x: 4, y: half },
      ];
      g.fillPoints(pts, true);
      g.strokePoints(pts, true, true);
      return;
    }
    case 'star': {
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      const outer = half - 4;
      const inner = outer * 0.45;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push({ x: half + Math.cos(angle) * r, y: half + Math.sin(angle) * r });
      }
      g.fillPoints(pts, true);
      g.strokePoints(pts, true, true);
      return;
    }
    case 'turtle': {
      // 椭圆龟壳 + 四只小脚 + 圆头
      const shellW = size - 16;
      const shellH = size - 24;
      g.fillEllipse(half, half + 4, shellW, shellH);
      g.strokeEllipse(half, half + 4, shellW, shellH);
      // 四只脚（小圆）
      g.fillCircle(10, size - 12, 6);
      g.fillCircle(size - 10, size - 12, 6);
      g.fillCircle(10, 16, 5);
      g.fillCircle(size - 10, 16, 5);
      // 头：顶上的小圆
      g.fillCircle(half, 10, 8);
      g.strokeCircle(half, 10, 8);
      return;
    }
    case 'pig': {
      // 粉色圆身 + 三角耳 + 猪鼻（两黑点）
      g.fillCircle(half, half + 4, half - 8);
      g.strokeCircle(half, half + 4, half - 8);
      // 猪耳：两个三角形
      const leftEar = [
        { x: half - 18, y: 14 },
        { x: half - 6, y: 10 },
        { x: half - 10, y: 22 },
      ];
      const rightEar = [
        { x: half + 18, y: 14 },
        { x: half + 6, y: 10 },
        { x: half + 10, y: 22 },
      ];
      g.fillPoints(leftEar, true);
      g.strokePoints(leftEar, true, true);
      g.fillPoints(rightEar, true);
      g.strokePoints(rightEar, true, true);
      // 猪鼻：小椭圆 + 两个鼻孔点
      g.fillStyle(0x000000, 0.8);
      g.fillCircle(half - 5, half + 14, 2);
      g.fillCircle(half + 5, half + 14, 2);
      return;
    }
    case 'rabbit': {
      // 圆脸 + 长耳朵
      g.fillCircle(half, half + 8, half - 14);
      g.strokeCircle(half, half + 8, half - 14);
      // 左耳（长椭圆）
      g.fillEllipse(half - 10, 16, 8, 24);
      g.strokeEllipse(half - 10, 16, 8, 24);
      // 右耳
      g.fillEllipse(half + 10, 16, 8, 24);
      g.strokeEllipse(half + 10, 16, 8, 24);
      return;
    }
    case 'bird': {
      // 圆身 + 尖喙三角 + 翅膀三角
      g.fillCircle(half, half, half - 8);
      g.strokeCircle(half, half, half - 8);
      // 喙：右侧三角
      const beak = [
        { x: size - 6, y: half - 4 },
        { x: size - 6, y: half + 4 },
        { x: size + 4, y: half },
      ];
      g.fillStyle(0xffaa22, 1);
      g.fillPoints(beak, true);
      g.strokePoints(beak, true, true);
      // 翅膀：左侧三角
      g.fillStyle(color, 1);
      const wing = [
        { x: half - 8, y: half - 2 },
        { x: half + 4, y: half - 2 },
        { x: half - 4, y: half + 10 },
      ];
      g.fillPoints(wing, true);
      g.strokePoints(wing, true, true);
      return;
    }
    case 'mountain': {
      // 大三角 + 顶部白色积雪
      const mountain = [
        { x: 6, y: size - 6 },
        { x: size - 6, y: size - 6 },
        { x: half, y: 8 },
      ];
      g.fillPoints(mountain, true);
      g.strokePoints(mountain, true, true);
      // 雪顶：小三角
      g.fillStyle(0xffffff, 0.9);
      const snow = [
        { x: half - 10, y: 24 },
        { x: half + 10, y: 24 },
        { x: half, y: 10 },
      ];
      g.fillPoints(snow, true);
      return;
    }
    case 'chicken': {
      // 圆身 + 鸡冠（锯齿）+ 橙喙
      g.fillCircle(half, half + 4, half - 10);
      g.strokeCircle(half, half + 4, half - 10);
      // 鸡冠：红色三齿
      g.fillStyle(0xff3b3b, 1);
      const comb = [
        { x: half - 10, y: 16 },
        { x: half - 5, y: 6 },
        { x: half, y: 14 },
        { x: half + 5, y: 6 },
        { x: half + 10, y: 16 },
      ];
      g.fillPoints(comb, true);
      g.strokePoints(comb, true, true);
      // 喙：橙色小三角
      g.fillStyle(0xffaa22, 1);
      const beak = [
        { x: half - 4, y: half + 2 },
        { x: half + 4, y: half + 2 },
        { x: half, y: half + 10 },
      ];
      g.fillPoints(beak, true);
      g.strokePoints(beak, true, true);
      return;
    }
    case 'blade': {
      // 细长剑身（竖向长矩形）+ 横向十字护手 + 圆形握把
      // 剑身
      g.fillRect(half - 4, 10, 8, size - 30);
      g.strokeRect(half - 4, 10, 8, size - 30);
      // 护手：横条
      g.fillStyle(0xcca15a, 1);
      g.fillRect(half - 16, size - 24, 32, 6);
      g.strokeRect(half - 16, size - 24, 32, 6);
      // 握把：圆
      g.fillStyle(0x5a3820, 1);
      g.fillCircle(half, size - 10, 6);
      g.strokeCircle(half, size - 10, 6);
      // 剑尖：顶部三角
      g.fillStyle(color, 1);
      const tip = [
        { x: half - 4, y: 10 },
        { x: half + 4, y: 10 },
        { x: half, y: 4 },
      ];
      g.fillPoints(tip, true);
      g.strokePoints(tip, true, true);
      return;
    }
    default: {
      // 穷尽性断言：PetShape 将来新增成员而忘记在此加 case 时，
      // TypeScript 会在编译期直接挡住（never 赋值错），运行期保底抛错。
      const _exhaustive: never = shape;
      throw new Error(`未知 PetShape: ${String(_exhaustive)}`);
    }
  }
}

/**
 * 幂等地生成精灵占位纹理。若已存在则直接返回已有 key。
 * 返回值为纹理 key，供 `sprite.setTexture(key)` 使用。
 *
 * FEAT-203 起：内部直接转发到 `ensureIsoPetTexture`，使所有调用点（BattleScene /
 * PetCard / WorldMapScene）零改动地受益于等距 Q 版造型。未知 id 时交由
 * `ensureIsoPetTexture` 的内部兜底画灰圆。
 *
 * @deprecated 新代码建议直接使用 `ensureIsoPetTexture`。本包装仅为兼容保留。
 */
export function ensurePetTexture(scene: Phaser.Scene, petId: string): string {
  return ensureIsoPetTexture(scene, petId);
}

/**
 * 幂等地生成 BOSS 占位纹理。
 *
 * FEAT-203 起：内部直接转发到 `ensureIsoBossTexture`。
 *
 * @deprecated 新代码建议直接使用 `ensureIsoBossTexture`。本包装仅为兼容保留。
 */
export function ensureBossTexture(scene: Phaser.Scene, bossId: string): string {
  return ensureIsoBossTexture(scene, bossId);
}

/**
 * 旧几何占位纹理生成（deprecated fallback）。保留为防御性分支：当 `PetData.visual` 缺失
 * （编译期已由必填约束拦截）或未来移除 iso 管线时可直接切回本函数。不再主动调用。
 *
 * @deprecated FEAT-203 起走 ensureIsoPetTexture。
 */
export function ensureLegacyPetTexture(scene: Phaser.Scene, petId: string): string {
  const key = `legacy-${PET_TEXTURE_PREFIX}${petId}`;
  if (scene.textures.exists(key)) return key;

  const pet = PETS[petId];
  if (!pet) {
    return ensureTileTexture(scene, `unknown-pet-${petId}`, 0x888888, SPRITE_SIZE);
  }

  const g = scene.add.graphics({ x: 0, y: 0 });
  drawShape(g, pet.shape, pet.portraitColor, SPRITE_SIZE);
  g.generateTexture(key, SPRITE_SIZE, SPRITE_SIZE);
  g.destroy();
  return key;
}

/**
 * 旧 BOSS 占位纹理生成（deprecated fallback）。同上，不再主动调用。
 *
 * @deprecated FEAT-203 起走 ensureIsoBossTexture。
 */
export function ensureLegacyBossTexture(scene: Phaser.Scene, bossId: string): string {
  const key = `legacy-${BOSS_TEXTURE_PREFIX}${bossId}`;
  if (scene.textures.exists(key)) return key;

  const boss = BOSSES[bossId];
  if (!boss) {
    return ensureTileTexture(scene, `unknown-boss-${bossId}`, 0x444444, 96);
  }

  const size = 96;
  const g = scene.add.graphics({ x: 0, y: 0 });
  drawShape(g, boss.shape, boss.portraitColor, size);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/**
 * 幂等地生成一块纯色带描边的 tile 纹理，用于地图格子 / UI 背景。
 */
export function ensureTileTexture(
  scene: Phaser.Scene,
  name: string,
  color: number,
  size: number,
): string {
  const key = tileKey(name);
  if (scene.textures.exists(key)) return key;

  const g = scene.add.graphics({ x: 0, y: 0 });
  g.fillStyle(color, 1);
  g.fillRect(0, 0, size, size);
  g.lineStyle(2, 0x000000, 0.35);
  g.strokeRect(1, 1, size - 2, size - 2);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}
