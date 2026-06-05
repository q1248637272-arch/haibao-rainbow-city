export const HATCHERY_SAVE_KEY = 'hbcc:home-hatchery:v1';
export const HATCHERY_REQUIRED_CARE = 3;

export type HatcheryCareAction = 'warm' | 'polish' | 'song' | 'record';

export interface HatcheryCareDefinition {
  readonly id: HatcheryCareAction;
  readonly label: string;
  readonly detail: string;
}

export interface HatcheryState {
  readonly active: boolean;
  readonly startedAt: number | null;
  readonly seed: number;
  readonly careActions: readonly HatcheryCareAction[];
  readonly boosted: boolean;
  readonly hatchedCount: number;
}

export interface HatchResult {
  readonly petId: string;
  readonly level: number;
  readonly rarity: 'common' | 'uncommon' | 'rare';
}

interface HatchPoolEntry {
  readonly petId: string;
  readonly weight: number;
  readonly boostedWeight?: number;
  readonly rarity: HatchResult['rarity'];
}

export const HATCHERY_CARE_ACTIONS: readonly HatcheryCareDefinition[] = [
  { id: 'warm', label: '调节温度', detail: '稳定蛋壳里的彩光温度。' },
  { id: 'polish', label: '擦亮蛋纹', detail: '让蛋纹更清晰，便于记录。' },
  { id: 'song', label: '播放潮音', detail: '用轻柔潮音安抚蛋里的小精灵。' },
  { id: 'record', label: '记录闪光', detail: '把蛋壳闪光频率写进培育日志。' },
] as const;

const HATCH_POOL: readonly HatchPoolEntry[] = [
  { petId: 'dew_sprite', weight: 22, rarity: 'common' },
  { petId: 'sunny_puppy', weight: 20, rarity: 'common' },
  { petId: 'spark_mouse', weight: 18, rarity: 'common' },
  { petId: 'coral_fin', weight: 16, rarity: 'common' },
  { petId: 'sand_crab', weight: 14, rarity: 'common' },
  { petId: 'cloud_ferret', weight: 9, boostedWeight: 15, rarity: 'uncommon' },
  { petId: 'star_jelly', weight: 7, boostedWeight: 14, rarity: 'uncommon' },
  { petId: 'aurora_deer', weight: 6, boostedWeight: 12, rarity: 'uncommon' },
  { petId: 'tide_otter', weight: 5, boostedWeight: 11, rarity: 'rare' },
  { petId: 'pearl_guard', weight: 4, boostedWeight: 10, rarity: 'rare' },
] as const;

export function defaultHatcheryState(): HatcheryState {
  return {
    active: false,
    startedAt: null,
    seed: 0,
    careActions: [],
    boosted: false,
    hatchedCount: 0,
  };
}

export function normalizeHatcheryState(value: unknown): HatcheryState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return defaultHatcheryState();
  }
  const rec = value as Record<string, unknown>;
  const careActions = Array.isArray(rec['careActions'])
    ? rec['careActions'].filter(isCareAction)
    : [];
  return {
    active: rec['active'] === true,
    startedAt:
      typeof rec['startedAt'] === 'number' && Number.isFinite(rec['startedAt'])
        ? rec['startedAt']
        : null,
    seed:
      typeof rec['seed'] === 'number' && Number.isFinite(rec['seed'])
        ? Math.max(0, Math.floor(rec['seed']))
        : 0,
    careActions: uniqueCareActions(careActions),
    boosted: rec['boosted'] === true,
    hatchedCount:
      typeof rec['hatchedCount'] === 'number' && Number.isFinite(rec['hatchedCount'])
        ? Math.max(0, Math.floor(rec['hatchedCount']))
        : 0,
  };
}

export function startHatcheryEgg(
  state: HatcheryState,
  now = Date.now(),
  rng: () => number = Math.random,
): HatcheryState {
  return {
    ...state,
    active: true,
    startedAt: now,
    seed: Math.floor(rng() * 1_000_000_000) + now,
    careActions: [],
    boosted: false,
  };
}

export function applyHatcheryCare(
  state: HatcheryState,
  action: HatcheryCareAction,
): HatcheryState {
  if (!state.active || state.careActions.includes(action)) return state;
  return {
    ...state,
    careActions: uniqueCareActions([...state.careActions, action]),
  };
}

export function boostHatcheryEgg(state: HatcheryState): HatcheryState {
  if (!state.active || state.boosted) return state;
  return { ...state, boosted: true, seed: state.seed + 97_531 };
}

export function hatcheryCareProgress(state: HatcheryState): number {
  return Math.min(HATCHERY_REQUIRED_CARE, state.careActions.length);
}

export function canHatchEgg(state: HatcheryState): boolean {
  return state.active && hatcheryCareProgress(state) >= HATCHERY_REQUIRED_CARE;
}

export function rollHatchedPet(state: HatcheryState): HatchResult {
  const rng = seededRng(state.seed + state.careActions.length * 131 + (state.boosted ? 77 : 0));
  const entries = HATCH_POOL.map((entry) => ({
    ...entry,
    finalWeight: state.boosted ? (entry.boostedWeight ?? entry.weight) : entry.weight,
  }));
  const total = entries.reduce((sum, entry) => sum + entry.finalWeight, 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.finalWeight;
    if (roll <= 0) {
      return {
        petId: entry.petId,
        level: hatchLevel(entry.rarity, state),
        rarity: entry.rarity,
      };
    }
  }
  const fallback = entries[0]!;
  return { petId: fallback.petId, level: hatchLevel(fallback.rarity, state), rarity: fallback.rarity };
}

export function finishHatcheryCycle(state: HatcheryState): HatcheryState {
  return {
    active: false,
    startedAt: null,
    seed: 0,
    careActions: [],
    boosted: false,
    hatchedCount: state.hatchedCount + 1,
  };
}

function hatchLevel(rarity: HatchResult['rarity'], state: HatcheryState): number {
  const rarityBonus = rarity === 'rare' ? 3 : rarity === 'uncommon' ? 2 : 0;
  const careBonus = Math.max(0, state.careActions.length - HATCHERY_REQUIRED_CARE);
  return 10 + rarityBonus + careBonus + (state.boosted ? 4 : 0);
}

function isCareAction(value: unknown): value is HatcheryCareAction {
  return HATCHERY_CARE_ACTIONS.some((action) => action.id === value);
}

function uniqueCareActions(actions: readonly HatcheryCareAction[]): HatcheryCareAction[] {
  const seen = new Set<HatcheryCareAction>();
  const out: HatcheryCareAction[] = [];
  for (const action of actions) {
    if (seen.has(action)) continue;
    seen.add(action);
    out.push(action);
  }
  return out;
}

function seededRng(seed: number): () => number {
  let value = Math.max(1, Math.floor(seed)) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
