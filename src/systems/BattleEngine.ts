/**
 * 纯逻辑战斗引擎（不依赖 Phaser）。
 *
 * 对外提供：
 * - `Combatant` 运行时战斗单位
 * - `makeCombatantFromPet` / `makeCombatantFromBoss` 工厂
 * - `calcDamage` 单次伤害计算（含命中判定 + 元素克制 + 随机抖动）
 * - `resolveTurn` 一回合决议（速度比较、先后手、HP 扣减、胜负判定）
 *
 * 纯函数式设计：输入 state 不会被修改，`resolveTurn` 返回一份新的 nextState。
 * 所有随机性通过外部注入的 `rng: () => number` 来控制，方便 Vitest 用种子化 PRNG 覆盖。
 */

import { ELEMENT_MATCHUP } from '@/data/elements';
import { skillIdsForLevel } from '@/data/petLearnsets';
import { SKILLS } from '@/data/skills';
import type { BossData, Element, PetData, PetStats, PlayerPet, SkillData } from '@/types';

import { clampProbability, normalizeBattleStats, skillDamageClass } from './BattleStats';
import {
  applyEvolutionBonus,
  evolvedPetName,
  getEvolutionStage,
  stageForWildLevel,
} from './EvolutionSystem';

/**
 * 战斗中的作战单位。既可来自玩家精灵，也可来自 BOSS。
 */
export interface Combatant {
  id: string;
  name: string;
  element: Element;
  stats: PetStats;
  currentHp: number;
  skillIds: string[];
}

/**
 * 战斗状态快照：双方 Combatant 的 pair。resolveTurn 纯函数式地演进此状态。
 */
export interface BattleState {
  player: Combatant;
  boss: Combatant;
}

/**
 * 单次 calcDamage 的返回结构。elementMul 在 miss 时为 0。
 */
export interface DamageResult {
  damage: number;
  elementMul: number;
  isMiss: boolean;
  isCritical: boolean;
}

/**
 * 一回合的决议结果。
 */
export interface TurnResult {
  /** 本回合产生的 1 或 2 条中文战斗日志，按行动顺序排列。 */
  log: string[];
  /** 回合结束时的新状态快照（输入 state 不被修改）。 */
  nextState: BattleState;
  /**
   * 胜负标记：
   * - `null`：战斗仍在继续；
   * - `'player'`：玩家阵营的 Combatant HP 归零（玩家败）；
   * - `'boss'`：BOSS 阵营的 Combatant HP 归零（玩家胜）。
   */
  ended: 'player' | 'boss' | null;
}

/**
 * 从 PetData 生成 Combatant：currentHp 初始化为 baseStats.hp。
 * stats/skillIds 均做浅拷贝，避免调用方改动数据表常量。
 */
export function makeCombatantFromPet(pet: PetData): Combatant {
  return {
    id: pet.id,
    name: pet.name,
    element: pet.element,
    stats: { ...pet.baseStats },
    currentHp: pet.baseStats.hp,
    skillIds: [...pet.skillIds],
  };
}

/**
 * 从 BossData 生成 Combatant。
 */
export function makeCombatantFromBoss(boss: BossData): Combatant {
  return {
    id: boss.id,
    name: boss.name,
    element: boss.element,
    stats: { ...boss.stats },
    currentHp: boss.stats.hp,
    skillIds: [...boss.skillIds],
  };
}

/**
 * 基于玩家队伍中的 PlayerPet 实例生成 Combatant（FEAT-206）。
 *
 * 与 `makeCombatantFromPet` 的差异：
 *   - 读取 `playerPet.currentStats` / `currentHp` / `learnedSkillIds`，让等级化数值 + 残血 +
 *     当前已学技能真正进入战斗；
 *   - 若 `learnedSkillIds` 为空（不该出现但 defensive），退回 `PetData.skillIds` 防止战斗无技能。
 *
 * 不修改入参；stats / skills 都做浅拷贝。
 */
export function makeCombatantFromPlayerPet(
  playerPet: PlayerPet,
  pet: PetData,
): Combatant {
  const skills = unique([
    ...(playerPet.learnedSkillIds.length > 0 ? playerPet.learnedSkillIds : pet.skillIds),
    ...skillIdsForLevel(pet.id, playerPet.level),
  ]);
  const stage = getEvolutionStage(playerPet);
  return {
    id: pet.id,
    name: evolvedPetName(pet, stage),
    element: pet.element,
    stats: { ...playerPet.currentStats },
    currentHp: Math.max(0, Math.min(playerPet.currentStats.hp, playerPet.currentHp)),
    skillIds: skills,
  };
}

/**
 * 基于 PetData.baseStats 和一个等级生成 "野生 combatant"（FEAT-206）。
 *
 * 用 `LevelCurve.computeStats` 算出该等级下的属性（HP+3/级、ATK/DEF/SPD+1/级），
 * 技能按 `PetData.skillIds.slice(0, 1 + floor(level/5))` 截取（与 PlayerState 里的
 * `makeLv5PlayerPet` 保持同一套规则：Lv5 有 2 条；Lv10 有 3 条；上限 `skillIds.length`）。
 * currentHp = stats.hp 满血。
 */
export function makeCombatantFromWild(
  pet: PetData,
  level: number,
  computeStats: (base: PetStats, lv: number) => PetStats,
): Combatant {
  const stage = stageForWildLevel(level);
  const stats = applyEvolutionBonus(computeStats(pet.baseStats, level), stage);
  return {
    id: pet.id,
    name: evolvedPetName(pet, stage),
    element: pet.element,
    stats,
    currentHp: stats.hp,
    skillIds: skillIdsForLevel(pet.id, level),
  };
}

/**
 * 单次技能的伤害计算。
 *
 * 命中判定：`rng() < skill.accuracy`（accuracy 位于 0~1 闭区间，0 必然 miss）。
 * 未命中时返回 `{ damage: 0, elementMul: 0, isMiss: true }`。
 *
 * 命中时：
 *   base = (attacker.atk / max(1, defender.def)) * power * 0.5 + 2
 *   elementMul = ELEMENT_MATCHUP[skill.element]?.[defender.element] ?? 1
 *   rand = 0.85 + rng() * 0.15
 *   damage = max(1, floor(base * elementMul * rand))
 */
export function calcDamage(
  attacker: Combatant,
  defender: Combatant,
  skill: SkillData,
  rng: () => number = Math.random,
): DamageResult {
  // 注意：SKILLS 表里的 accuracy 本身就是 0~1（见 FEAT-002 数据编码），
  // 因此这里不除以 100。FEAT-005 计划文字里写的 `/ 100` 与该数据编码冲突，
  // 若照搬会导致所有技能几乎必 miss，测试 (e) 的 12 回合通关条件无法达成。
  const hitRoll = rng();
  const attackStats = normalizeBattleStats(attacker.stats);
  const defendStats = normalizeBattleStats(defender.stats);
  const hitChance = Math.max(
    0,
    Math.min(1, skill.accuracy * attackStats.accuracy - defendStats.evasion),
  );
  if (hitRoll >= hitChance) {
    return { damage: 0, elementMul: 0, isMiss: true, isCritical: false };
  }

  const klass = skillDamageClass(skill);
  const attackValue = klass === 'special' ? attackStats.spAtk : attackStats.atk;
  const defenseValue = klass === 'special' ? defendStats.spDef : defendStats.def;
  const base =
    (attackValue / Math.max(1, defenseValue)) * skill.power * 0.5 + 2;
  const row = ELEMENT_MATCHUP[skill.element];
  const elementMul = row?.[defender.element] ?? 1;
  const critChance = clampProbability(attackStats.crit);
  const isCritical = critChance > 0 ? rng() < critChance : false;
  const critMul = isCritical ? 1.5 : 1;
  const rand = 0.85 + rng() * 0.15;
  const damage = Math.max(1, Math.floor(base * elementMul * critMul * rand));
  return { damage, elementMul, isMiss: false, isCritical };
}

/**
 * 深拷贝 Combatant，用于 resolveTurn 生成 nextState。
 */
function cloneCombatant(c: Combatant): Combatant {
  return {
    id: c.id,
    name: c.name,
    element: c.element,
    stats: { ...c.stats },
    currentHp: c.currentHp,
    skillIds: [...c.skillIds],
  };
}

/**
 * 根据元素倍率生成日志后缀：≥2 为"效果拔群"，≤0.5 且 >0 为"效果甚微"，其余无后缀。
 */
function elementSuffix(mul: number): string {
  if (mul >= 2) return '（效果拔群！）';
  if (mul > 0 && mul <= 0.5) return '（效果甚微…）';
  return '';
}

/**
 * 单次动作的执行：选中技能、计算伤害、生成日志行。返回的 damage 由调用方扣到目标 HP 上。
 *
 * 若 skillId 在 SKILLS 表里找不到（理论上不会发生），记一条"懵住了"日志并返回 0 伤害。
 */
function performAction(
  actor: Combatant,
  target: Combatant,
  skillId: string,
  rng: () => number,
): { log: string; actor: Combatant; target: Combatant } {
  const skill = SKILLS[skillId];
  if (!skill) {
    return { log: `${actor.name} 懵住了，没有施展技能！`, actor, target };
  }

  const result = calcDamage(actor, target, skill, rng);
  if (result.isMiss) {
    return { log: `${actor.name} 打出 ${skill.name}，但未命中！`, actor, target };
  }

  const suffix = `${elementSuffix(result.elementMul)}${result.isCritical ? ' 暴击！' : ''}`;
  const damagedTarget = {
    ...target,
    currentHp: Math.max(0, target.currentHp - result.damage),
  };
  const effectResult = applySkillEffect(actor, damagedTarget, skill, rng);
  return {
    log: `${actor.name} 打出 ${skill.name}，对 ${target.name} 造成 ${result.damage} 点伤害！${suffix}${effectResult.suffix}`,
    actor: effectResult.actor,
    target: effectResult.target,
  };
}

function applySkillEffect(
  actor: Combatant,
  target: Combatant,
  skill: SkillData,
  rng: () => number,
): { actor: Combatant; target: Combatant; suffix: string } {
  const effect = skill.effect;
  if (!effect) return { actor, target, suffix: '' };
  if (rng() >= (effect.chance ?? 1)) return { actor, target, suffix: '' };

  if (effect.kind === 'heal_self') {
    const nextHp = Math.min(actor.stats.hp, actor.currentHp + effect.value);
    const healed = nextHp - actor.currentHp;
    if (healed <= 0) return { actor, target, suffix: '' };
    return {
      actor: { ...actor, currentHp: nextHp },
      target,
      suffix: ` ${actor.name} 恢复 ${healed} 点生命！`,
    };
  }

  if (effect.kind === 'crit_up' || effect.kind === 'accuracy_up') {
    const current = normalizeBattleStats(actor.stats);
    const stats = { ...actor.stats };
    if (effect.kind === 'crit_up') {
      stats.crit = clampProbability(current.crit + effect.value);
      return { actor: { ...actor, stats }, target, suffix: ` ${actor.name} 的暴击提高了！` };
    }
    stats.accuracy = Math.min(1.35, current.accuracy + effect.value);
    return { actor: { ...actor, stats }, target, suffix: ` ${actor.name} 的命中提高了！` };
  }

  const currentTargetStats = normalizeBattleStats(target.stats);
  const stats = { ...target.stats };
  if (effect.kind === 'atk_down') {
    stats.atk = Math.max(1, stats.atk - effect.value);
    return { actor, target: { ...target, stats }, suffix: ` ${target.name} 的攻击下降了！` };
  }
  if (effect.kind === 'def_down') {
    stats.def = Math.max(1, stats.def - effect.value);
    return { actor, target: { ...target, stats }, suffix: ` ${target.name} 的防御下降了！` };
  }
  if (effect.kind === 'sp_atk_down') {
    stats.spAtk = Math.max(1, currentTargetStats.spAtk - effect.value);
    return { actor, target: { ...target, stats }, suffix: ` ${target.name} 的特攻下降了！` };
  }
  if (effect.kind === 'sp_def_down') {
    stats.spDef = Math.max(1, currentTargetStats.spDef - effect.value);
    return { actor, target: { ...target, stats }, suffix: ` ${target.name} 的特防下降了！` };
  }
  if (effect.kind === 'accuracy_down') {
    stats.accuracy = Math.max(0.35, currentTargetStats.accuracy - effect.value);
    return { actor, target: { ...target, stats }, suffix: ` ${target.name} 的命中下降了！` };
  }
  if (effect.kind === 'evasion_down') {
    stats.evasion = Math.max(0, currentTargetStats.evasion - effect.value);
    return { actor, target: { ...target, stats }, suffix: ` ${target.name} 的闪避下降了！` };
  }
  if (effect.kind === 'post_battle_random_teleport') {
    return { actor, target, suffix: ' 战斗结束后将触发随机传送！' };
  }
  stats.spd = Math.max(1, stats.spd - effect.value);
  return { actor, target: { ...target, stats }, suffix: ` ${target.name} 的速度下降了！` };
}

/**
 * 计算先后手：对比双方 spd，高者先行动；相等时玩家先手。
 *
 * 把这条规则抽出成独立纯函数是为了让 BattleScene（floating text / HP 条
 * 播放顺序）与 BattleEngine（实际的伤害结算顺序）共用同一份判定，未来
 * engine 加入麻痹/先发制人等状态时只改此处即可。
 */
export function computeTurnOrder(state: BattleState): 'player' | 'boss' {
  return state.player.stats.spd >= state.boss.stats.spd ? 'player' : 'boss';
}

/**
 * 一回合的完整结算。
 *
 * 先后手：对比双方 spd，高者先手；相等时玩家先手。
 * 若快方把慢方 HP 打到 0，慢方不再行动，ended 置为慢方阵营。
 * 否则慢方反击；若慢方反击使对方 HP 归 0，ended 对应置为对方阵营。
 */
export function resolveTurn(
  state: BattleState,
  playerSkillId: string,
  enemySkillId: string,
  rng: () => number,
): TurnResult {
  const player = cloneCombatant(state.player);
  const boss = cloneCombatant(state.boss);
  const log: string[] = [];
  let ended: 'player' | 'boss' | null = null;

  const playerFirst = computeTurnOrder(state) === 'player';

  const applyPlayer = (): void => {
    const r = performAction(player, boss, playerSkillId, rng);
    log.push(r.log);
    player.currentHp = r.actor.currentHp;
    player.stats = { ...r.actor.stats };
    boss.currentHp = r.target.currentHp;
    boss.stats = { ...r.target.stats };
    if (boss.currentHp === 0) {
      ended = 'boss';
    }
  };

  const applyBoss = (): void => {
    const r = performAction(boss, player, enemySkillId, rng);
    log.push(r.log);
    boss.currentHp = r.actor.currentHp;
    boss.stats = { ...r.actor.stats };
    player.currentHp = r.target.currentHp;
    player.stats = { ...r.target.stats };
    if (player.currentHp === 0) {
      ended = 'player';
    }
  };

  if (playerFirst) {
    applyPlayer();
    if (!ended) applyBoss();
  } else {
    applyBoss();
    if (!ended) applyPlayer();
  }

  return {
    log,
    nextState: { player, boss },
    ended,
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
