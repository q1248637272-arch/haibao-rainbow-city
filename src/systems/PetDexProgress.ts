import { PETS } from '@/data/pets';
import { getPetTraces, type PetTrace } from '@/data/petTraces';
import { normalizeBattleStats } from '@/systems/BattleStats';
import { ELEMENTS, type Element, type PetData, type PlayerPet, type PlayerSave } from '@/types';

export type PetDexFilter = 'all' | 'owned' | 'missing' | Element;

export interface PetDexEntry {
  readonly pet: PetData;
  readonly owned: boolean;
  readonly traces: readonly PetTrace[];
  readonly powerScore: number;
}

export interface PetDexElementSummary {
  readonly total: number;
  readonly owned: number;
}

export interface PetDexSummary {
  readonly total: number;
  readonly owned: number;
  readonly missing: number;
  readonly completionRatio: number;
  readonly byElement: Readonly<Record<Element, PetDexElementSummary>>;
}

export interface PetDexSnapshot {
  readonly allEntries: readonly PetDexEntry[];
  readonly entries: readonly PetDexEntry[];
  readonly summary: PetDexSummary;
}

export const PET_DEX_FILTERS: readonly PetDexFilter[] = [
  'all',
  'owned',
  'missing',
  'fire',
  'water',
  'grass',
  'electric',
  'normal',
  'light',
] as const;

export function buildPetDexSnapshot(
  save: Pick<PlayerSave, 'playerPets' | 'petStorage'>,
  filter: PetDexFilter = 'all',
): PetDexSnapshot {
  const ownedIds = ownedPetIds(save);
  const allEntries = sortedPets().map((pet) => ({
    pet,
    owned: ownedIds.has(pet.id),
    traces: getPetTraces(pet.id),
    powerScore: petPowerScore(pet),
  }));
  const summary = summarizeDex(allEntries);
  return {
    allEntries,
    entries: filterDexEntries(allEntries, filter),
    summary,
  };
}

export function filterDexEntries(
  entries: readonly PetDexEntry[],
  filter: PetDexFilter,
): readonly PetDexEntry[] {
  if (filter === 'owned') return entries.filter((entry) => entry.owned);
  if (filter === 'missing') return entries.filter((entry) => !entry.owned);
  if (filter === 'all') return entries;
  return entries.filter((entry) => entry.pet.element === filter);
}

export function firstTraceForEntry(entry: PetDexEntry): PetTrace | null {
  return entry.traces[0] ?? null;
}

function sortedPets(): PetData[] {
  return Object.values(PETS).sort((a, b) => {
    const elementDelta = ELEMENTS.indexOf(a.element) - ELEMENTS.indexOf(b.element);
    if (elementDelta !== 0) return elementDelta;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
}

function ownedPetIds(save: Pick<PlayerSave, 'playerPets' | 'petStorage'>): Set<string> {
  const ids = new Set<string>();
  for (const pet of save.playerPets) addOwnedPetId(ids, pet);
  for (const pet of save.petStorage) addOwnedPetId(ids, pet);
  return ids;
}

function addOwnedPetId(ids: Set<string>, pet: PlayerPet): void {
  if (pet.petId) ids.add(pet.petId);
}

function summarizeDex(entries: readonly PetDexEntry[]): PetDexSummary {
  const byElement = Object.fromEntries(
    ELEMENTS.map((element) => [element, { total: 0, owned: 0 }]),
  ) as Record<Element, PetDexElementSummary>;

  let owned = 0;
  for (const entry of entries) {
    if (entry.owned) owned += 1;
    const current = byElement[entry.pet.element];
    byElement[entry.pet.element] = {
      total: current.total + 1,
      owned: current.owned + (entry.owned ? 1 : 0),
    };
  }

  const total = entries.length;
  return {
    total,
    owned,
    missing: Math.max(0, total - owned),
    completionRatio: total > 0 ? owned / total : 0,
    byElement,
  };
}

function petPowerScore(pet: PetData): number {
  const stats = normalizeBattleStats(pet.baseStats);
  return stats.hp + stats.atk + stats.def + stats.spd + stats.spAtk + stats.spDef;
}
