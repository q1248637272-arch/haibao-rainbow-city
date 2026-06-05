import type { PetData, PetStats, PlayerPet } from '@/types';

export const MAX_EVOLUTION_STAGE = 2;
export const EVOLUTION_LEVELS = [16, 32] as const;
export const CAI_XUKUN_ID = 'cai_xukun';
export const CAI_XUKUN_THIRD_EVOLUTION_ITEM_ID = 'kun_chicken_token';
export const ZENG_MING_ID = 'zeng_ming';
export const ZENG_MING_SECOND_EVOLUTION_ITEM_ID = 'zeng_ming_stage2_token';
export const ZENG_MING_THIRD_EVOLUTION_ITEM_ID = 'zeng_ming_stage3_token';

export function getEvolutionStage(
  playerPet: Pick<PlayerPet, 'evolutionStage'> & Partial<Pick<PlayerPet, 'level'>>,
): number {
  return normalizeEvolutionStageForLevel(playerPet.evolutionStage ?? 0, playerPet.level);
}

export function normalizeEvolutionStageForLevel(stage: number, level?: number): number {
  const clampedStage = clampStage(stage);
  if (level === undefined) return clampedStage;
  return Math.min(clampedStage, stageForWildLevel(level));
}

export function nextEvolutionLevel(
  playerPet: Pick<PlayerPet, 'evolutionStage'> & Partial<Pick<PlayerPet, 'level'>>,
): number | null {
  const stage = getEvolutionStage(playerPet);
  if (stage >= MAX_EVOLUTION_STAGE) return null;
  return EVOLUTION_LEVELS[stage] ?? null;
}

export function canEvolve(playerPet: Pick<PlayerPet, 'level' | 'evolutionStage'>): boolean {
  const nextLevel = nextEvolutionLevel(playerPet);
  return nextLevel !== null && playerPet.level >= nextLevel;
}

export function requiredEvolutionItem(
  playerPet: Pick<PlayerPet, 'petId' | 'evolutionStage'> & Partial<Pick<PlayerPet, 'level'>>,
): string | null {
  const stage = getEvolutionStage(playerPet);
  if (playerPet.petId === ZENG_MING_ID) {
    if (stage === 0) return ZENG_MING_SECOND_EVOLUTION_ITEM_ID;
    if (stage === 1) return ZENG_MING_THIRD_EVOLUTION_ITEM_ID;
  }
  if (playerPet.petId === CAI_XUKUN_ID && stage === 1) {
    return CAI_XUKUN_THIRD_EVOLUTION_ITEM_ID;
  }
  return null;
}

export function evolvedPetName(
  pet: PetData,
  stageOrPet: number | (Pick<PlayerPet, 'evolutionStage'> & Partial<Pick<PlayerPet, 'level'>>),
): string {
  const stage =
    typeof stageOrPet === 'number' ? clampStage(stageOrPet) : getEvolutionStage(stageOrPet);
  if (pet.id === CAI_XUKUN_ID) {
    if (stage >= 2) return '神·蔡徐坤';
    if (stage === 1) return '蔡徐坤成年体';
    return '背带裤练习生蔡徐坤';
  }
  if (pet.id === 'li_yanwen') {
    if (stage >= 2) return '玄甲龟李衍文';
    if (stage === 1) return '卷甲龟李衍文';
    return '水龟李衍文';
  }
  if (pet.id === ZENG_MING_ID) {
    if (stage >= 2) return '雷鸣玄鸟曾鸣';
    if (stage === 1) return '疾羽曾鸣';
    return '幼羽曾鸣';
  }
  if (pet.id === 'zeng_yi') {
    if (stage >= 2) return '群山巨灵曾屹';
    if (stage === 1) return '岩岭曾屹';
    return '山灵曾屹';
  }
  if (stage >= 2) return `${pet.name}·完全体`;
  if (stage === 1) return `${pet.name}·成长体`;
  return pet.name;
}

export function evolutionLabel(
  stageOrPet:
    | number
    | (Pick<PlayerPet, 'evolutionStage'> & Partial<Pick<PlayerPet, 'level' | 'petId'>>),
): string {
  const stage =
    typeof stageOrPet === 'number' ? clampStage(stageOrPet) : getEvolutionStage(stageOrPet);
  const petId = typeof stageOrPet === 'number' ? null : stageOrPet.petId;
  if (petId === CAI_XUKUN_ID) {
    if (stage >= 2) return '神·鸡形态';
    if (stage === 1) return '成年体';
    return '背带裤练习生';
  }
  if (stage >= 2) return '完全体';
  if (stage === 1) return '成长体';
  return '初始';
}

export function applyEvolutionBonus(
  stats: PetStats,
  stageOrPet: number | (Pick<PlayerPet, 'evolutionStage'> & Partial<Pick<PlayerPet, 'level'>>),
): PetStats {
  const stage =
    typeof stageOrPet === 'number' ? clampStage(stageOrPet) : getEvolutionStage(stageOrPet);
  const out: PetStats = {
    ...stats,
    hp: stats.hp + stage * 18,
    atk: stats.atk + stage * 6,
    def: stats.def + stage * 6,
    spd: stats.spd + stage * 4,
  };
  if (stats.spAtk !== undefined) out.spAtk = stats.spAtk + stage * 6;
  if (stats.spDef !== undefined) out.spDef = stats.spDef + stage * 6;
  if (stats.crit !== undefined) out.crit = Math.min(0.5, stats.crit + stage * 0.015);
  if (stats.accuracy !== undefined) out.accuracy = Math.min(1.25, stats.accuracy + stage * 0.01);
  if (stats.evasion !== undefined) out.evasion = Math.min(0.4, stats.evasion + stage * 0.012);
  return out;
}

export function stageForWildLevel(level: number): number {
  if (level >= EVOLUTION_LEVELS[1]) return 2;
  if (level >= EVOLUTION_LEVELS[0]) return 1;
  return 0;
}

function clampStage(stage: number): number {
  if (!Number.isFinite(stage)) return 0;
  return Math.max(0, Math.min(MAX_EVOLUTION_STAGE, Math.floor(stage)));
}
