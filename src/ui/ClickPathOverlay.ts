import Phaser from 'phaser';

import { TILE_H } from '@/config/GameConfig';
import { worldToScreen } from '@/systems/IsoProjection';
import { tileDepth } from '@/systems/IsoProjection';
import type { GridCell } from '@/systems/Pathfinding';

/**
 * 路径光点 overlay（FEAT-301）。
 *
 * 职责：把 A* 返回的路径（世界格序列）画成一串淡色光点，提示玩家寻路路线。
 *
 * 视觉规则：
 * - 每个路径格的屏幕坐标取自 `worldToScreen(col, row)`，上抬 `TILE_H / 2` 对齐瓦片中心，
 *   与"宝"字 label / 地标 zone 使用的"中心锚点"一致；
 * - 光点用圆形 graphics：半径 6px，填充色偏暖黄（#ffd93d），alpha 0.35；
 * - 起点不绘制（玩家脚下已经有海宝本体），从第二格起绘制；
 * - 终点额外加一个略大的环形标记，让玩家一眼看到目的地。
 *
 * 实现细节：
 * - 用一个 Phaser Container 容纳所有 Graphics 子对象，destroy 时一次性清。
 * - 每次点击新路径会先 destroy 旧 overlay，再 create 一份新的，避免泄漏。
 */

/**
 * 路径 overlay 句柄。
 */
export interface PathOverlayHandle {
  /** 根容器，调用方可用它控制 setDepth / setVisible。 */
  readonly root: Phaser.GameObjects.Container;
  /** 销毁 overlay 及所有子对象。多次调用幂等。 */
  destroy(): void;
}

/** 光点半径（像素）。 */
const DOT_RADIUS = 6;
/** 光点 alpha。 */
const DOT_ALPHA = 0.35;
/** 光点填充色（柔和黄）。 */
const DOT_COLOR = 0xffd93d;
/** 终点标记环的半径（像素）。 */
const GOAL_RING_RADIUS = 10;

/**
 * 沿路径创建一个光点 overlay。
 *
 * 入参 `path` 是 A* 返回的 `[start, ..., goal]` 序列。
 * 返回 overlay handle；若 `path.length <= 1` 也会返回一个空 overlay（destroy 幂等）。
 */
export function createPathOverlay(
  scene: Phaser.Scene,
  path: ReadonlyArray<GridCell>,
): PathOverlayHandle {
  const root = scene.add.container(0, 0);

  // 路径 overlay 的 depth：略低于 actor 但高于 prop / ground。用路径中最远格子的
  // actor depth 作为上限的参考，保证不会压过玩家本体。
  // 不同格子用不同 depth，让光点跟随等距前后关系自然排序。
  if (path.length >= 2) {
    for (let i = 1; i < path.length; i++) {
      const cell = path[i];
      if (!cell) continue;
      const { x, y } = worldToScreen(cell.col, cell.row);
      const screenY = y - TILE_H / 2;
      const isGoal = i === path.length - 1;

      const g = scene.add.graphics();
      if (isGoal) {
        g.lineStyle(2, DOT_COLOR, DOT_ALPHA + 0.2);
        g.strokeCircle(x, screenY, GOAL_RING_RADIUS);
        g.fillStyle(DOT_COLOR, DOT_ALPHA + 0.15);
        g.fillCircle(x, screenY, DOT_RADIUS);
      } else {
        g.fillStyle(DOT_COLOR, DOT_ALPHA);
        g.fillCircle(x, screenY, DOT_RADIUS);
      }
      // 让光点与同格 prop 同层：比 ground 高、比 actor 低。
      g.setDepth(tileDepth(cell.col, cell.row, 'prop') + 0.5);
      root.add(g);
    }
  }

  let destroyed = false;
  const handle: PathOverlayHandle = {
    root,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      root.destroy(true);
    },
  };
  return handle;
}
