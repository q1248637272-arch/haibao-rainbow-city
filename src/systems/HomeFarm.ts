export const FARM_SAVE_KEY = 'hbcc:home-farm:v1';
export const FARM_PLOT_COUNT = 6;
export const FARM_GROW_MS = 90 * 1000;

export interface FarmCropDefinition {
  readonly id: string;
  readonly name: string;
  readonly seedName: string;
  readonly rewardItemId: string;
  readonly color: number;
  readonly accent: number;
}

export const FARM_CROPS = [
  {
    id: 'fire',
    name: '红焰莓',
    seedName: '红焰种苗',
    rewardItemId: 'element_fruit_fire',
    color: 0xff6b35,
    accent: 0xffd08a,
  },
  {
    id: 'water',
    name: '蓝波果',
    seedName: '蓝波种苗',
    rewardItemId: 'element_fruit_water',
    color: 0x3aa0ff,
    accent: 0x9ee8ff,
  },
  {
    id: 'grass',
    name: '嫩叶果',
    seedName: '嫩叶种苗',
    rewardItemId: 'element_fruit_grass',
    color: 0x4cc26b,
    accent: 0xc7f38a,
  },
  {
    id: 'electric',
    name: '雷鸣果',
    seedName: '雷鸣种苗',
    rewardItemId: 'element_fruit_electric',
    color: 0xffd93d,
    accent: 0xfff3a6,
  },
  {
    id: 'normal',
    name: '柔光麦',
    seedName: '柔光麦穗',
    rewardItemId: 'element_fruit_normal',
    color: 0xd7c58d,
    accent: 0xfff0bb,
  },
  {
    id: 'light',
    name: '彩虹果',
    seedName: '彩虹种苗',
    rewardItemId: 'element_fruit_light',
    color: 0xff8ff0,
    accent: 0x98f8ff,
  },
] as const satisfies readonly FarmCropDefinition[];

export interface FarmPlotState {
  readonly cropId?: string;
  readonly plantedAt?: number;
  readonly watered?: boolean;
}

export interface FarmOrderRequirement {
  readonly cropId: string;
  readonly itemId: string;
  readonly quantity: number;
}

export interface FarmOrderState {
  readonly date: string;
  readonly requirements: readonly FarmOrderRequirement[];
  readonly completed?: boolean;
}

export interface FarmOrderReward {
  readonly coins: number;
  readonly items: readonly { readonly itemId: string; readonly quantity: number }[];
}

export interface FarmState {
  readonly plots: readonly FarmPlotState[];
  readonly helperDate?: string;
  readonly seedDate?: string;
  readonly order?: FarmOrderState;
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function defaultFarmState(): FarmState {
  return { plots: Array.from({ length: FARM_PLOT_COUNT }, () => ({})) };
}

export function readFarmState(): FarmState {
  try {
    const raw = globalThis.localStorage?.getItem(FARM_SAVE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<FarmState>) : {};
    return normalizeFarmState(parsed);
  } catch {
    return defaultFarmState();
  }
}

export function writeFarmState(state: FarmState): void {
  try {
    globalThis.localStorage?.setItem(FARM_SAVE_KEY, JSON.stringify(normalizeFarmState(state)));
  } catch {
    // Private browsing or blocked storage should not break play.
  }
}

export function normalizeFarmState(state: Partial<FarmState>): FarmState {
  const source = Array.isArray(state.plots) ? state.plots : [];
  const plots = Array.from({ length: FARM_PLOT_COUNT }, (_unused, index) =>
    normalizeFarmPlot(source[index]),
  );
  const helperDate = typeof state.helperDate === 'string' ? state.helperDate : undefined;
  const seedDate = typeof state.seedDate === 'string' ? state.seedDate : undefined;
  const order = normalizeFarmOrder(state.order);
  return {
    plots,
    ...(helperDate ? { helperDate } : {}),
    ...(seedDate ? { seedDate } : {}),
    ...(order ? { order } : {}),
  };
}

export function normalizeFarmPlot(plot: unknown): FarmPlotState {
  if (!plot || typeof plot !== 'object') return {};
  const source = plot as Partial<FarmPlotState>;
  const cropId =
    typeof source.cropId === 'string' && getFarmCrop(source.cropId) ? source.cropId : undefined;
  const plantedAt =
    typeof source.plantedAt === 'number' && Number.isFinite(source.plantedAt)
      ? source.plantedAt
      : undefined;
  const watered = source.watered === true;
  return {
    ...(cropId ? { cropId } : {}),
    ...(plantedAt !== undefined ? { plantedAt } : {}),
    ...(watered ? { watered } : {}),
  };
}

export function getFarmCrop(cropId: string | undefined): FarmCropDefinition | undefined {
  if (!cropId) return undefined;
  return FARM_CROPS.find((crop) => crop.id === cropId);
}

export function randomFarmCrop(): FarmCropDefinition {
  return FARM_CROPS[Math.floor(Math.random() * FARM_CROPS.length)] ?? FARM_CROPS[0];
}

export function currentFarmOrder(state: FarmState, date = todayKey()): FarmOrderState {
  if (state.order?.date === date) return state.order;
  return createFarmOrderForDate(date);
}

export function createFarmOrderForDate(date: string): FarmOrderState {
  const seed = hashDate(date);
  const firstIndex = seed % FARM_CROPS.length;
  const secondIndex = (firstIndex + 2 + (seed % 3)) % FARM_CROPS.length;
  const first = FARM_CROPS[firstIndex] ?? FARM_CROPS[0];
  const second = FARM_CROPS[secondIndex] ?? FARM_CROPS[1] ?? FARM_CROPS[0];
  return {
    date,
    requirements: [
      { cropId: first.id, itemId: first.rewardItemId, quantity: 1 + (seed % 2) },
      { cropId: second.id, itemId: second.rewardItemId, quantity: 1 },
    ],
  };
}

export function farmOrderReward(order: FarmOrderState): FarmOrderReward {
  const total = order.requirements.reduce((sum, req) => sum + req.quantity, 0);
  return {
    coins: 180 + total * 70,
    items: [
      { itemId: 'exp_candy', quantity: 1 + Math.floor(total / 3) },
      { itemId: 'potential_seed', quantity: 1 },
      { itemId: 'energy_seed', quantity: 1 },
    ],
  };
}

export function canSubmitFarmOrder(
  order: FarmOrderState,
  getItemCount: (itemId: string) => number,
): boolean {
  if (order.completed) return false;
  return order.requirements.every((req) => getItemCount(req.itemId) >= req.quantity);
}

export function formatFarmOrderRequirement(req: FarmOrderRequirement): string {
  const crop = getFarmCrop(req.cropId);
  return `${crop?.name ?? req.cropId} x${req.quantity}`;
}

export function isFarmPlotReady(plot: FarmPlotState, now = Date.now()): boolean {
  return Boolean(plot.cropId && plot.plantedAt && now - plot.plantedAt >= FARM_GROW_MS);
}

export function farmPlotProgress(plot: FarmPlotState, now = Date.now()): number {
  if (!plot.cropId || !plot.plantedAt) return 0;
  return Math.max(0, Math.min(1, (now - plot.plantedAt) / FARM_GROW_MS));
}

function normalizeFarmOrder(order: unknown): FarmOrderState | undefined {
  if (!order || typeof order !== 'object') return undefined;
  const source = order as Partial<FarmOrderState>;
  if (typeof source.date !== 'string') return undefined;
  const requirements = Array.isArray(source.requirements)
    ? source.requirements.map(normalizeFarmOrderRequirement).filter(isFarmOrderRequirement)
    : [];
  if (requirements.length <= 0) return undefined;
  return {
    date: source.date,
    requirements,
    ...(source.completed === true ? { completed: true } : {}),
  };
}

function normalizeFarmOrderRequirement(req: unknown): FarmOrderRequirement | null {
  if (!req || typeof req !== 'object') return null;
  const source = req as Partial<FarmOrderRequirement>;
  const crop = getFarmCrop(source.cropId);
  const quantity =
    typeof source.quantity === 'number' && Number.isFinite(source.quantity)
      ? Math.max(1, Math.floor(source.quantity))
      : 1;
  if (!crop) return null;
  return { cropId: crop.id, itemId: crop.rewardItemId, quantity };
}

function isFarmOrderRequirement(req: FarmOrderRequirement | null): req is FarmOrderRequirement {
  return req !== null;
}

function hashDate(date: string): number {
  let hash = 17;
  for (let i = 0; i < date.length; i += 1) {
    hash = (hash * 31 + date.charCodeAt(i)) >>> 0;
  }
  return hash;
}
