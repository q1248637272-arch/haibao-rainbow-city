import type { PetStats } from '@/types';

/**
 * 升到 level+1 需要多少当前级内的 exp。
 *
 * 曲线：起步 20（Lv1→Lv2），每级 +8，线性成长。
 * 为防御极端输入：`level < 1` 视为 1，`level > 100` 视为 100。
 *
 * 对应 design.md §5.2 的经验曲线定义。本函数为纯函数，不读任何外部状态。
 */
export function expToNext(level: number): number {
  const l = Math.max(1, Math.min(level, 100));
  return 20 + (l - 1) * 8;
}

/**
 * 战胜一只野怪 / BOSS 后获得的经验。
 *
 * - 基础值随敌方等级小幅成长：中后期野外战斗不再只有象征性收益。
 * - 等级差系数 `wildLevel / playerLevel` 被钳制在 [0.35, 1.85]，
 *   避免高级 pet 打低级怪刷经验，也控制低级 pet 越级挑战时的爆发升级速度。
 * - 返回值四舍五入到整数。
 *
 * 纯函数。
 */
export function expOnDefeat(opts: {
  wildLevel: number;
  playerLevel: number;
  isBoss: boolean;
}): number {
  const enemyLv = Math.max(1, Math.min(100, Math.floor(opts.wildLevel)));
  const base = opts.isBoss
    ? 130 + Math.min(60, enemyLv * 4)
    : 30 + Math.min(42, Math.floor(enemyLv * 1.6));
  const playerLv = Math.max(1, opts.playerLevel);
  const ratio = Math.max(0.35, Math.min(1.85, enemyLv / playerLv));
  return Math.round(base * ratio);
}

/**
 * 基于 base stats 和当前等级，推导出 PlayerPet.currentStats。
 *
 * 成长规则（design.md §5.2）：每升 1 级 HP+3、ATK+1、DEF+1、SPD+1。
 *
 * 重要：必须返回一个全新对象，**不得修改传入的 `base`**。多只精灵共享同一条
 * PETS 数据引用，一旦原地改写会污染其它 PlayerPet 的 baseStats。
 */
export function computeStats(base: PetStats, level: number): PetStats {
  const l = Math.max(1, level);
  const advanced = deriveAdvancedStats(base);
  const out: PetStats = {
    hp: base.hp + (l - 1) * 3,
    atk: base.atk + (l - 1) * 1,
    def: base.def + (l - 1) * 1,
    spd: base.spd + (l - 1) * 1,
    spAtk: advanced.spAtk + Math.floor((l - 1) * 1.15),
    spDef: advanced.spDef + Math.floor((l - 1) * 1.05),
    crit: Math.min(0.45, advanced.crit + (l - 1) * 0.001),
    accuracy: Math.min(1.2, advanced.accuracy + (l - 1) * 0.0005),
    evasion: Math.min(0.35, advanced.evasion + (l - 1) * 0.0008),
  };
  return out;
}

function deriveAdvancedStats(base: PetStats): Required<Pick<
  PetStats,
  'spAtk' | 'spDef' | 'crit' | 'accuracy' | 'evasion'
>> {
  return {
    spAtk: base.spAtk ?? Math.max(1, Math.round(base.atk * 0.94)),
    spDef: base.spDef ?? Math.max(1, Math.round(base.def * 0.96)),
    crit: base.crit ?? Math.min(0.12, 0.04 + base.spd / 2000),
    accuracy: base.accuracy ?? 1,
    evasion: base.evasion ?? Math.min(0.12, base.spd / 1800),
  };
}
