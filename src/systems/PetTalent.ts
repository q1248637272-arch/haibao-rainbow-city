import type { PetStats, PetTalent } from '@/types';

export type TalentStat = keyof PetTalent;

export const PET_TALENT_STATS: readonly TalentStat[] = [
  'hp',
  'atk',
  'def',
  'spd',
  'spAtk',
  'spDef',
] as const;

const TALENT_MAX = 31;
const DEFAULT_TALENT_VALUE = 16;

const TALENT_LABELS: Readonly<Record<TalentStat, string>> = {
  hp: '生命',
  atk: '物攻',
  def: '物防',
  spd: '速度',
  spAtk: '特攻',
  spDef: '特防',
};

export function rollPetTalent(rng: () => number = Math.random): PetTalent {
  return {
    hp: rollTalentValue(rng),
    atk: rollTalentValue(rng),
    def: rollTalentValue(rng),
    spd: rollTalentValue(rng),
    spAtk: rollTalentValue(rng),
    spDef: rollTalentValue(rng),
  };
}

export function defaultPetTalent(): PetTalent {
  return {
    hp: DEFAULT_TALENT_VALUE,
    atk: DEFAULT_TALENT_VALUE,
    def: DEFAULT_TALENT_VALUE,
    spd: DEFAULT_TALENT_VALUE,
    spAtk: DEFAULT_TALENT_VALUE,
    spDef: DEFAULT_TALENT_VALUE,
  };
}

export function isCompletePetTalent(value: unknown): value is PetTalent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return PET_TALENT_STATS.every((stat) => isTalentNumber(rec[stat]));
}

export function normalizePetTalent(value: unknown): PetTalent {
  if (isCompletePetTalent(value)) {
    return {
      hp: clampTalent(value.hp),
      atk: clampTalent(value.atk),
      def: clampTalent(value.def),
      spd: clampTalent(value.spd),
      spAtk: clampTalent(value.spAtk),
      spDef: clampTalent(value.spDef),
    };
  }
  return defaultPetTalent();
}

export function applyTalentToStats(
  stats: PetStats,
  talent: unknown,
  level: number,
): PetStats {
  const normalized = normalizePetTalent(talent);
  const lv = Math.max(1, Math.floor(level));
  const next: PetStats = { ...stats };
  for (const stat of PET_TALENT_STATS) {
    const base = next[stat];
    if (typeof base !== 'number' || !Number.isFinite(base)) continue;
    next[stat] = Math.max(1, Math.round(base + talentBonus(normalized[stat], lv)));
  }
  return next;
}

export function improvePetTalent(
  value: unknown,
  rng: () => number = Math.random,
): { readonly talent: PetTalent; readonly stat: TalentStat | null; readonly gained: number } {
  const talent = normalizePetTalent(value);
  const candidates = PET_TALENT_STATS.filter((stat) => talent[stat] < TALENT_MAX);
  if (candidates.length === 0) return { talent, stat: null, gained: 0 };

  candidates.sort((a, b) => talent[a] - talent[b]);
  const lowBand = candidates.slice(0, Math.min(3, candidates.length));
  const stat = lowBand[Math.floor(rng() * lowBand.length)] ?? candidates[0] ?? 'hp';
  const gained = Math.min(TALENT_MAX - talent[stat], 2 + Math.floor(rng() * 4));
  return {
    talent: { ...talent, [stat]: talent[stat] + gained },
    stat,
    gained,
  };
}

export function formatTalentGrade(value: unknown): string {
  const total = petTalentTotal(value);
  if (total >= 168) return 'S';
  if (total >= 144) return 'A';
  if (total >= 112) return 'B';
  if (total >= 78) return 'C';
  return 'D';
}

export function petTalentTotal(value: unknown): number {
  const talent = normalizePetTalent(value);
  return PET_TALENT_STATS.reduce((sum, stat) => sum + talent[stat], 0);
}

export function formatPetTalent(value: unknown): string {
  const talent = normalizePetTalent(value);
  return [
    `天赋 ${formatTalentGrade(talent)}  ${petTalentTotal(talent)}/186`,
    `生命 ${talent.hp}  物攻 ${talent.atk}  物防 ${talent.def}`,
    `速度 ${talent.spd}  特攻 ${talent.spAtk}  特防 ${talent.spDef}`,
  ].join('\n');
}

export function talentStatLabel(stat: TalentStat): string {
  return TALENT_LABELS[stat];
}

function rollTalentValue(rng: () => number): number {
  return Math.max(0, Math.min(TALENT_MAX, Math.floor(rng() * (TALENT_MAX + 1))));
}

function talentBonus(value: number, level: number): number {
  if (value <= 0) return 0;
  return Math.floor(value / 12 + (value * level) / 240);
}

function clampTalent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TALENT_VALUE;
  return Math.max(0, Math.min(TALENT_MAX, Math.floor(value)));
}

function isTalentNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
