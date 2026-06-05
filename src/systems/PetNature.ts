import type { PetNatureId, PetStats } from '@/types';

export type NatureStat = 'hp' | 'atk' | 'def' | 'spd' | 'spAtk' | 'spDef';

export interface PetNatureDefinition {
  readonly id: PetNatureId;
  readonly name: string;
  readonly plus?: NatureStat;
  readonly minus?: NatureStat;
  readonly description: string;
}

export const PET_NATURES: readonly PetNatureDefinition[] = [
  { id: 'balanced', name: '平衡', description: '各项成长保持均衡。' },
  {
    id: 'brave',
    name: '勇敢',
    plus: 'atk',
    minus: 'spd',
    description: '物攻成长更高，速度成长略低。',
  },
  {
    id: 'bold',
    name: '坚毅',
    plus: 'def',
    minus: 'atk',
    description: '物防成长更高，物攻成长略低。',
  },
  {
    id: 'timid',
    name: '灵敏',
    plus: 'spd',
    minus: 'atk',
    description: '速度成长更高，物攻成长略低。',
  },
  {
    id: 'calm',
    name: '沉着',
    plus: 'spDef',
    minus: 'spd',
    description: '特防成长更高，速度成长略低。',
  },
  {
    id: 'smart',
    name: '聪慧',
    plus: 'spAtk',
    minus: 'def',
    description: '特攻成长更高，物防成长略低。',
  },
  {
    id: 'sturdy',
    name: '强壮',
    plus: 'hp',
    minus: 'spd',
    description: '生命成长更高，速度成长略低。',
  },
  {
    id: 'fierce',
    name: '好胜',
    plus: 'atk',
    minus: 'spDef',
    description: '物攻成长更高，特防成长略低。',
  },
  {
    id: 'agile',
    name: '轻快',
    plus: 'spd',
    minus: 'hp',
    description: '速度成长更高，生命成长略低。',
  },
  {
    id: 'gentle',
    name: '温和',
    plus: 'spDef',
    minus: 'def',
    description: '特防成长更高，物防成长略低。',
  },
  {
    id: 'focused',
    name: '专注',
    plus: 'spAtk',
    minus: 'spd',
    description: '特攻成长更高，速度成长略低。',
  },
  {
    id: 'guardian',
    name: '守护',
    plus: 'def',
    minus: 'spAtk',
    description: '物防成长更高，特攻成长略低。',
  },
];

const NATURE_BY_ID: Readonly<Record<PetNatureId, PetNatureDefinition>> = Object.fromEntries(
  PET_NATURES.map((nature) => [nature.id, nature]),
) as Record<PetNatureId, PetNatureDefinition>;

const STAT_LABELS: Readonly<Record<NatureStat, string>> = {
  hp: '生命',
  atk: '物攻',
  def: '物防',
  spd: '速度',
  spAtk: '特攻',
  spDef: '特防',
};

export function isPetNatureId(value: unknown): value is PetNatureId {
  return typeof value === 'string' && value in NATURE_BY_ID;
}

export function normalizePetNatureId(value: unknown): PetNatureId {
  return isPetNatureId(value) ? value : 'balanced';
}

export function rollPetNature(rng: () => number = Math.random): PetNatureId {
  const index = Math.max(
    0,
    Math.min(PET_NATURES.length - 1, Math.floor(rng() * PET_NATURES.length)),
  );
  return PET_NATURES[index]?.id ?? 'balanced';
}

export function getPetNature(value: unknown): PetNatureDefinition {
  return NATURE_BY_ID[normalizePetNatureId(value)];
}

export function applyNatureToStats(stats: PetStats, natureId: unknown): PetStats {
  const nature = getPetNature(natureId);
  const next: PetStats = { ...stats };
  if (nature.plus) {
    setNatureStat(next, nature.plus, 1.1);
  }
  if (nature.minus && nature.minus !== nature.plus) {
    setNatureStat(next, nature.minus, 0.9);
  }
  return next;
}

export function formatNatureGrowth(natureId: unknown): string {
  const nature = getPetNature(natureId);
  if (!nature.plus && !nature.minus) return '无修正';
  const parts: string[] = [];
  if (nature.plus) parts.push(`${STAT_LABELS[nature.plus]}↑`);
  if (nature.minus) parts.push(`${STAT_LABELS[nature.minus]}↓`);
  return parts.join(' ');
}

function setNatureStat(stats: PetStats, stat: NatureStat, multiplier: number): void {
  const current = stats[stat];
  if (typeof current !== 'number' || !Number.isFinite(current)) return;
  stats[stat] = Math.max(1, Math.round(current * multiplier));
}
