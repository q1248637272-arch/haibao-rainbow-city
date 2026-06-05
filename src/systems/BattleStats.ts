import type { PetStats, SkillData } from '@/types';

export interface NormalizedBattleStats {
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
  readonly spAtk: number;
  readonly spDef: number;
  readonly crit: number;
  readonly accuracy: number;
  readonly evasion: number;
}

export function normalizeBattleStats(stats: PetStats): NormalizedBattleStats {
  return {
    hp: safeNumber(stats.hp, 1),
    atk: safeNumber(stats.atk, 1),
    def: safeNumber(stats.def, 1),
    spd: safeNumber(stats.spd, 1),
    spAtk: safeNumber(stats.spAtk, stats.atk),
    spDef: safeNumber(stats.spDef, stats.def),
    crit: clampProbability(stats.crit ?? 0),
    accuracy: Math.max(0.05, Math.min(1.35, stats.accuracy ?? 1)),
    evasion: clampProbability(stats.evasion ?? 0),
  };
}

export function skillDamageClass(skill: SkillData): 'physical' | 'special' {
  if (skill.damageClass) return skill.damageClass;
  return skill.element === 'normal' ? 'physical' : 'special';
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.85, value));
}

export function formatBattleStats(stats: PetStats): string {
  const s = normalizeBattleStats(stats);
  return [
    `生命 ${s.hp}   物攻 ${s.atk}   物防 ${s.def}`,
    `速度 ${s.spd}   特攻 ${s.spAtk}   特防 ${s.spDef}`,
    `暴击 ${formatPct(s.crit)}   命中 ${formatPct(s.accuracy)}   闪避 ${formatPct(s.evasion)}`,
  ].join('\n');
}

export function formatCompactBattleStats(stats: PetStats): string {
  const s = normalizeBattleStats(stats);
  return [
    `HP ${s.hp}  ATK ${s.atk}  DEF ${s.def}`,
    `SPD ${s.spd}  SP ${s.spAtk}  RES ${s.spDef}`,
    `暴 ${formatPct(s.crit)}  命 ${formatPct(s.accuracy)}  闪 ${formatPct(s.evasion)}`,
  ].join('\n');
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function safeNumber(value: number | undefined, fallback: number): number {
  const next = value ?? fallback;
  return Number.isFinite(next) ? Math.max(1, Math.round(next)) : Math.max(1, Math.round(fallback));
}
