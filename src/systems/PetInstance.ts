import { PETS } from '@/data/pets';
import { skillIdsForLevel } from '@/data/petLearnsets';
import type { PetData, PetNatureId, PetStats, PetTalent, PlayerPet } from '@/types';

import { applyEvolutionBonus, normalizeEvolutionStageForLevel } from './EvolutionSystem';
import { computeStats } from './LevelCurve';
import { applyNatureToStats, normalizePetNatureId, rollPetNature } from './PetNature';
import { applyTalentToStats, normalizePetTalent, rollPetTalent } from './PetTalent';

export function createPetInstanceId(
  petId: string,
  rng: () => number = Math.random,
): string {
  const safeId = petId.replace(/[^a-z0-9_-]/gi, '_').slice(0, 32) || 'pet';
  const time = Date.now().toString(36);
  const rand = Math.floor(rng() * 0xffffff)
    .toString(36)
    .padStart(4, '0');
  return `inst_${safeId}_${time}_${rand}`;
}

export function computePlayerPetStats(
  pet: PetData,
  level: number,
  evolutionStage: number | { readonly evolutionStage?: number; readonly level?: number },
  natureId: unknown,
  talent?: unknown,
): PetStats {
  return applyNatureToStats(
    applyTalentToStats(
      applyEvolutionBonus(
        computeStats(pet.baseStats, Math.max(1, Math.floor(level))),
        evolutionStage,
      ),
      talent,
      level,
    ),
    natureId,
  );
}

export function createPlayerPet(
  pet: PetData,
  level: number,
  opts: {
    readonly evolutionStage?: number;
    readonly natureId?: PetNatureId;
    readonly talent?: PetTalent;
    readonly rng?: () => number;
    readonly usedInstanceIds?: ReadonlySet<string>;
  } = {},
): PlayerPet {
  const rng = opts.rng ?? Math.random;
  const lv = Math.max(1, Math.floor(level));
  const evolutionStage = normalizeEvolutionStageForLevel(opts.evolutionStage ?? 0, lv);
  const natureId = opts.natureId ?? rollPetNature(rng);
  const talent = opts.talent ?? rollPetTalent(rng);
  const stats = computePlayerPetStats(pet, lv, evolutionStage, natureId, talent);
  return {
    instanceId: ensureUniqueInstanceId(pet.id, undefined, opts.usedInstanceIds, rng),
    petId: pet.id,
    natureId,
    talent,
    level: lv,
    exp: 0,
    learnedSkillIds: skillIdsForLevel(pet.id, lv),
    evolutionStage,
    currentStats: stats,
    currentHp: stats.hp,
  };
}

export function normalizePlayerPetForRuntime(
  pp: PlayerPet,
  usedInstanceIds?: Set<string>,
): PlayerPet {
  const level = Math.max(1, Math.floor(pp.level));
  const evolutionStage = normalizeEvolutionStageForLevel(pp.evolutionStage ?? 0, level);
  const natureId = normalizePetNatureId(pp.natureId ?? rollPetNature());
  const talent = normalizePetTalent(pp.talent);
  const preferredInstanceId = typeof pp.instanceId === 'string' ? pp.instanceId : undefined;
  const instanceId = ensureUniqueInstanceId(pp.petId, preferredInstanceId, usedInstanceIds);
  usedInstanceIds?.add(instanceId);

  const pet = PETS[pp.petId];
  const currentStats = pet
    ? computePlayerPetStats(pet, level, evolutionStage, natureId, talent)
    : { ...pp.currentStats };

  return {
    ...pp,
    instanceId,
    natureId,
    talent,
    level,
    learnedSkillIds: [...pp.learnedSkillIds],
    evolutionStage,
    currentStats,
    currentHp: Math.max(0, Math.min(pp.currentHp, currentStats.hp)),
  };
}

function ensureUniqueInstanceId(
  petId: string,
  preferred?: string,
  usedInstanceIds?: ReadonlySet<string>,
  rng: () => number = Math.random,
): string {
  if (preferred && (!usedInstanceIds || !usedInstanceIds.has(preferred))) {
    return preferred;
  }
  for (let i = 0; i < 12; i += 1) {
    const id = createPetInstanceId(petId, rng);
    if (!usedInstanceIds || !usedInstanceIds.has(id)) return id;
  }
  return `inst_${petId}_${Date.now().toString(36)}_${Math.floor(rng() * 1_000_000)}`;
}
