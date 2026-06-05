/**
 * 家园系统类型声明（FEAT-300 引入，FEAT-307 消费）。
 *
 * 家园是 8×6 的格子房间，玩家从 `inventory` 里拖入 `furniture` 类物品进行摆放。
 * 这里只声明摆放项的 shape；碰撞检测、画格、存盘全部由 HomeScene 与 PlayerState 完成。
 */

/**
 * 家具的 4 向旋转角度（度数字面量）。
 */
export type FurnitureRotation = 0 | 90 | 180 | 270;

/**
 * 一件已摆放在家园里的家具。
 *
 * - `itemId`：对应 ItemDefinition.id，且 kind 必须为 `furniture`。
 * - `gridX / gridY`：8×6 网格坐标，范围 [0,7] × [0,5]；由 HomeScene 校验越界。
 * - `rotation`：摆放旋转角。同一件家具同一格 + 不同旋转视为不同摆放实例。
 */
export interface FurniturePlacement {
  readonly itemId: string;
  readonly gridX: number;
  readonly gridY: number;
  readonly rotation: FurnitureRotation;
}
