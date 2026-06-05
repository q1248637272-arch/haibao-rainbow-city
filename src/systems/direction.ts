import type { IsoDir } from '@/types/direction';

/**
 * 根据瞬时速度 (vx, vy) 推导海宝的等距朝向。纯函数，零 Phaser 依赖，方便 Vitest 覆盖。
 *
 * 规则（符号判定，不看量级）：
 *   - 四象限对齐斜向：
 *       vx>0 & vy>0 → 'se'
 *       vx>0 & vy<0 → 'ne'
 *       vx<0 & vy>0 → 'sw'
 *       vx<0 & vy<0 → 'nw'
 *   - 仅单轴输入时按屏幕投影取最近的斜向：
 *       vx>0 only → 'se'
 *       vx<0 only → 'sw'
 *       vy>0 only → 'se'
 *       vy<0 only → 'ne'
 *   - 完全静止（vx === 0 && vy === 0）：保留上一次朝向 `prev`，避免站立时头像"回正"抖动。
 *
 * 约定：只看 vx/vy 的正负号，0 被判为"无输入"；这样调用方归一化 / 未归一化都能得到相同结果。
 */
export function computeIsoFacing(vx: number, vy: number, prev: IsoDir): IsoDir {
  const sx = vx > 0 ? 1 : vx < 0 ? -1 : 0;
  const sy = vy > 0 ? 1 : vy < 0 ? -1 : 0;

  if (sx === 0 && sy === 0) return prev;

  if (sx > 0 && sy > 0) return 'se';
  if (sx > 0 && sy < 0) return 'ne';
  if (sx < 0 && sy > 0) return 'sw';
  if (sx < 0 && sy < 0) return 'nw';

  // 单轴输入：按屏幕投影靠哪个斜向近
  if (sx > 0) return 'se';
  if (sx < 0) return 'sw';
  if (sy > 0) return 'se';
  return 'ne';
}
