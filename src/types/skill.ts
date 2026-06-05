import type { Element } from './elements';

export type SkillEffectKind =
  | 'atk_down'
  | 'def_down'
  | 'sp_atk_down'
  | 'sp_def_down'
  | 'spd_down'
  | 'accuracy_down'
  | 'evasion_down'
  | 'crit_up'
  | 'accuracy_up'
  | 'heal_self'
  | 'post_battle_random_teleport';

export type SkillDamageClass = 'physical' | 'special';

/**
 * 技能附加效果。
 * - `chance`：触发率，0~1，缺省为 1。
 * - `value`：数值强度。降属性表示扣除点数；回血表示恢复点数。
 */
export interface SkillEffect {
  readonly kind: SkillEffectKind;
  readonly chance?: number;
  readonly value: number;
}

/**
 * 技能数据。
 * - power：基础威力；0 表示纯状态类技能（MVP 先全部 power > 0）。
 * - accuracy：命中率，0~1 闭区间。
 * - element：技能系别，战斗里按技能系别计算克制，不只看精灵自身系别。
 */
export interface SkillData {
  id: string;
  name: string;
  element: Element;
  damageClass?: SkillDamageClass;
  power: number;
  accuracy: number;
  description: string;
  effect?: SkillEffect;
}
