/**
 * 战斗中"投球"捕捉率的纯函数公式（FEAT-206）。
 *
 * 对应 design.md §6.2：
 *   hpFactor = 1 - 0.8 * wildHpRatio     // 满血 0.2，残血 ~1.0
 *   lvFactor = clamp(1 + (playerLv - wildLv) / 10, 0.4, 1.6)
 *   rate     = clamp(hpFactor * lvFactor * bonusMult, 0.05, 0.95)
 *
 * 所有输入都做了防御性夹紧：
 *   - `wildHpRatio` 被强制到 [0, 1]；
 *   - `bonusMult < 0` 视作 0（零加成 → 返回下界 0.05）；
 *   - `playerLevel / wildLevel` 差值超过 ±10 时被夹紧到 [0.4, 1.6] 等级系数。
 *
 * 不依赖任何外部模块，便于 Vitest 覆盖各种边界。
 */
export interface CaptureInput {
  /** 野怪剩余 HP 比例，[0, 1]；0 = 空血，1 = 满血。 */
  wildHpRatio: number;
  playerLevel: number;
  wildLevel: number;
  /** 道具或羁绊加成乘子；MVP 永远传 1。小于 0 视作 0。 */
  bonusMult: number;
}

export function calcCaptureRate(opts: CaptureInput): number {
  const hp = Math.max(0, Math.min(1, opts.wildHpRatio));
  const hpFactor = 1 - 0.8 * hp;
  const lvRatio = (opts.playerLevel - opts.wildLevel) / 10;
  const lvFactor = Math.max(0.4, Math.min(1.6, 1 + lvRatio));
  const bonus = Math.max(0, opts.bonusMult);
  return Math.max(0.05, Math.min(0.95, hpFactor * lvFactor * bonus));
}

/**
 * 判断当前是否允许投球捕捉。
 *
 * 早期版本用它拦截"同种只能拥有一只"。现在玩家可以捕捉多只同种精灵，
 * 所以该函数保留为兼容旧调用点的轻量包装：只要传入的是有效 id，就允许投球。
 *
 * `lookup` 参数保留但不再影响结果，避免老测试或老模块编译失败。
 */
export function shouldAllowCapture(
  wildPetId: string,
  lookup: (petId: string) => boolean,
): boolean {
  void lookup;
  return wildPetId.trim().length > 0;
}
