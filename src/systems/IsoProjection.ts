/**
 * 等距（isometric）投影纯函数模块。
 *
 * 采用标准 2:1 diamond 投影：世界坐标 (col, row) → 屏幕像素 (x, y)。
 * 本文件零 Phaser 依赖，方便在 Vitest 下直接对拍与在任何渲染后端复用。
 *
 * 公式：
 *   screenX = (col - row) * TILE_W / 2 + originX
 *   screenY = (col + row) * TILE_H / 2 + originY
 *
 * 逆公式由上式线性求解：
 *   col = (dx / (TILE_W / 2) + dy / (TILE_H / 2)) / 2
 *   row = (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2
 * 其中 dx = screenX - originX, dy = screenY - originY。
 *
 * 由于 screenToWorld 用于命中测试与摄像机跟随，返回连续的浮点值，
 * 让调用方按需决定 Math.floor / Math.round。
 */

import { ISO_ORIGIN_X, ISO_ORIGIN_Y, TILE_H, TILE_W } from '@/config/GameConfig';
import type { IsoTileId } from '@/data/maps';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldPoint {
  readonly col: number;
  readonly row: number;
}

/**
 * 可绘制对象的类别。同一格内三类对象有固定的 depth 顺序：
 * ground < prop < actor，保证角色永远压在地面与装饰之上。
 */
export type TileKind = 'ground' | 'prop' | 'actor';

const KIND_BIAS: Readonly<Record<TileKind, number>> = {
  ground: 0,
  prop: 1,
  actor: 2,
};

/**
 * 世界网格坐标 → 屏幕像素坐标。
 *
 * @param col 世界列号，可以是任意浮点（方便插值移动）。
 * @param row 世界行号，可以是任意浮点。
 * @param originX 投影原点 x。默认取 {@link ISO_ORIGIN_X}。
 * @param originY 投影原点 y。默认取 {@link ISO_ORIGIN_Y}。
 */
export function worldToScreen(
  col: number,
  row: number,
  originX: number = ISO_ORIGIN_X,
  originY: number = ISO_ORIGIN_Y,
): ScreenPoint {
  const x = ((col - row) * TILE_W) / 2 + originX;
  const y = ((col + row) * TILE_H) / 2 + originY;
  return { x, y };
}

/**
 * 屏幕像素坐标 → 世界网格坐标（连续浮点，未取整）。
 *
 * 适合给命中测试使用：调用方在命中 tile 时再 `Math.floor` 取整，
 * 在跟随动画时保留小数做平滑插值。
 */
export function screenToWorld(
  x: number,
  y: number,
  originX: number = ISO_ORIGIN_X,
  originY: number = ISO_ORIGIN_Y,
): WorldPoint {
  const dx = x - originX;
  const dy = y - originY;
  const col = (dx / (TILE_W / 2) + dy / (TILE_H / 2)) / 2;
  const row = (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2;
  return { col, row };
}

/**
 * 计算一个 (col, row, kind) 组合的渲染深度。
 *
 * 排序规则（主序 → 次序 → 三序）：
 *   1. `col + row` 越大越靠前（远离等距菱形原点的格子画在更前面）；
 *   2. 同 `col + row` 下，`row` 更大的格子更靠前（视线沿屏幕 y 方向下沉的次级排序，
 *      避免侧身两格 z-fighting）；
 *   3. 同格内 kind 偏移：actor > prop > ground，保证角色压在脚下地格与装饰之上。
 *
 * 返回值是 Phaser 可直接用 `.setDepth(d)` 的 number。具体量级无固定范围，
 * 只保证上述三级单调性。
 */
export function tileDepth(col: number, row: number, kind: TileKind): number {
  const primary = (col + row) * 100;
  const rowBias = row; // 次级排序：同 col+row 下，row 大者靠前
  return primary + rowBias + KIND_BIAS[kind];
}

/**
 * 由角色精灵当前屏幕坐标 (x, y) 反推等距 actor depth。
 *
 * 这是玩家每帧 setDepth 的公共核心，专门用来修正 v1 review 发现的"depth 量纲崩塌"
 * ——原实现 `Math.floor(player.y) + 2` 的量纲（~500）与 `tileDepth(col,row,*)` 的量纲
 * （~1000~2400）不匹配，导致玩家每帧被地面瓦片盖过。
 *
 * 实现：
 *   1. 把屏幕坐标先抬起 `TILE_H/2` 作为"脚底所踩格子的屏幕中心"（对应 setOrigin(0.5,0.8)
 *      的海宝脚底位置），再用 `screenToWorld` 换算成连续 (col,row)；
 *   2. 复用 `tileDepth(col, row, 'actor')`，量纲立即与同格 ground / prop 对齐。
 *
 * 不做整数 floor：tileDepth 对浮点 col/row 仍单调，保留小数让人物在格子交界处有平滑过渡。
 */
export function actorDepthFromScreen(x: number, y: number): number {
  const { col, row } = screenToWorld(x, y + TILE_H / 2);
  return tileDepth(col, row, 'actor');
}

/**
 * FEAT-311：判断一个瓦片是否属于"高物"（纹理在瓦片格外向上显著延伸）。
 *
 * 当玩家与高物位于同格或相邻格时，标准 `tileDepth` 只能区分"格级"深度，
 * 无法解决同格高物顶部压盖玩家头顶的 z-fighting。调用方（renderIsoMap）对高物 prop
 * 在 `tileDepth(col, row, 'prop')` 基础上额外 `+50` 偏移，让玩家走到高物后方时被
 * 正确遮挡，走到前方时也压不过；视觉上对 2D 等距来说是合理折中。
 *
 * 命中集合来源于 Kenney Isometric Landscape 的 132×131 基底瓦片：
 *   - iso_tree_pine：松树，树冠高出瓦片约 70px
 *   - iso_wall_brick：砖墙，顶部切齐瓦片上边
 *   - iso_roof_red / iso_roof_blue：屋顶，斜面向上延伸
 *
 * 其他瓦片（iso_rock / iso_bush / iso_path_* / iso_grass*）为低矮或平贴地面，不算高物。
 */
export function isTallProp(tile: IsoTileId): boolean {
  return (
    tile === 'iso_tree_pine' ||
    tile === 'iso_wall_brick' ||
    tile === 'iso_roof_red' ||
    tile === 'iso_roof_blue' ||
    tile === 'iso_building_gym' ||
    tile === 'iso_building_home' ||
    tile === 'iso_building_shop' ||
    tile === 'iso_building_vip' ||
    tile === 'iso_building_quest'
  );
}
