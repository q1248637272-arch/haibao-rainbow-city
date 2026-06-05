/**
 * 等距（2:1 diamond）视角下的 4 向朝向。
 *
 * 命名取北东 / 东南 / 西南 / 北西，对应屏幕上菱形世界的 4 个斜向：
 *   - 'ne'：右上（屏幕 x 增大 + y 减小）
 *   - 'se'：右下（屏幕 x 增大 + y 增大）
 *   - 'sw'：左下（屏幕 x 减小 + y 增大）
 *   - 'nw'：左上（屏幕 x 减小 + y 减小）
 *
 * 主角海宝只美术生成 NE / SE 两向帧，NW / SW 通过 `sprite.setFlipX(true)` 水平镜像复用。
 */
export type IsoDir = 'ne' | 'se' | 'nw' | 'sw';
