import { todayUtcDateString } from '@/systems/DailyQuest';

export const SHIP_CORE_SAVE_KEY = 'hbcc:ship-core-calibration:v1';
export const SHIP_CORE_MINIGAME_ID = 'ship_core_calibration';
export const SHIP_CORE_SOURCE = 'spaceship:core_calibration';
export const SHIP_CORE_DAILY_REWARD_LIMIT = 2;
export const SHIP_CORE_TARGET_LOCKS = 6;

export type ShipCoreChannel = 'power' | 'nav' | 'shield' | 'beacon';

export interface ShipCorePanel {
  readonly id: string;
  readonly title: string;
  readonly channel: ShipCoreChannel;
  readonly hint: string;
}

export interface ShipCoreCalibrationState {
  readonly date: string;
  readonly bestLocks: number;
  readonly rewardClaims: number;
  readonly totalRuns: number;
  readonly perfectRuns: number;
}

export interface ShipCoreCalibrationReward {
  readonly coins: number;
  readonly repairChips: number;
  readonly greatBalls: number;
  readonly electricFruit: number;
  readonly crystalShards: number;
}

export interface ShipCoreCalibrationRunResult {
  readonly next: ShipCoreCalibrationState;
  readonly rewardGranted: boolean;
  readonly reward: ShipCoreCalibrationReward | null;
  readonly remainingClaims: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SHIP_CORE_CHANNELS: readonly ShipCoreChannel[] = [
  'power',
  'nav',
  'shield',
  'beacon',
];

export const SHIP_CORE_CHANNEL_LABELS: Readonly<Record<ShipCoreChannel, string>> = {
  power: '动力',
  nav: '航线',
  shield: '护盾',
  beacon: '信标',
};

export const SHIP_CORE_PANEL_POOL: readonly ShipCorePanel[] = [
  {
    id: 'engine_prism',
    title: '主推进棱镜',
    channel: 'power',
    hint: '它负责把彩虹币能量推入飞船尾部喷口。',
  },
  {
    id: 'core_battery',
    title: '备用核心电池',
    channel: 'power',
    hint: '读数写着蓄能、放电和过载保护。',
  },
  {
    id: 'route_compass',
    title: '海底航线罗盘',
    channel: 'nav',
    hint: '刻度指向迷宫、能源田和赌场之间的旧航路。',
  },
  {
    id: 'star_chart',
    title: '星图对准盘',
    channel: 'nav',
    hint: '上面标着观测台坐标和回城航向。',
  },
  {
    id: 'bubble_barrier',
    title: '泡泡护盾环',
    channel: 'shield',
    hint: '它会在船体外层展开柔软的水泡屏障。',
  },
  {
    id: 'hull_patch',
    title: '船壳修补阵列',
    channel: 'shield',
    hint: '裂缝探针、修补胶和护罩读数都连在这里。',
  },
  {
    id: 'rescue_lantern',
    title: '救援灯塔晶片',
    channel: 'beacon',
    hint: '灯塔会把飞船的位置广播给彩虹城。',
  },
  {
    id: 'archive_ping',
    title: '档案回传天线',
    channel: 'beacon',
    hint: '它把校准记录发回图书馆和任务板。',
  },
  {
    id: 'chip_socket',
    title: '修复芯片插槽',
    channel: 'power',
    hint: '芯片插好后，核心才会重新开始供能。',
  },
  {
    id: 'storm_filter',
    title: '风暴滤波器',
    channel: 'shield',
    hint: '它专门抵消遗迹航线附近的雷暴杂波。',
  },
  {
    id: 'harbor_marker',
    title: '珊瑚港口标记器',
    channel: 'beacon',
    hint: '它会闪烁，让补给船知道停靠位置。',
  },
  {
    id: 'maze_wayfinder',
    title: '迷宫回航记录器',
    channel: 'nav',
    hint: '记录器里存的是路线、门序和返航点。',
  },
];

export function normalizeShipCoreCalibrationState(
  raw: unknown,
  today: string,
): ShipCoreCalibrationState {
  if (!raw || typeof raw !== 'object') return emptyShipCoreCalibrationState(today);
  const data = raw as {
    date?: unknown;
    bestLocks?: unknown;
    rewardClaims?: unknown;
    totalRuns?: unknown;
    perfectRuns?: unknown;
  };
  if (data.date !== today) return emptyShipCoreCalibrationState(today);
  return {
    date: today,
    bestLocks: Math.min(SHIP_CORE_TARGET_LOCKS, clampNonNegativeInteger(data.bestLocks)),
    rewardClaims: Math.min(
      SHIP_CORE_DAILY_REWARD_LIMIT,
      clampNonNegativeInteger(data.rewardClaims),
    ),
    totalRuns: clampNonNegativeInteger(data.totalRuns),
    perfectRuns: clampNonNegativeInteger(data.perfectRuns),
  };
}

export function readShipCoreCalibrationState(
  storage: StorageLike | null | undefined,
  now: Date = new Date(),
): ShipCoreCalibrationState {
  const today = todayUtcDateString(now);
  if (!storage) return emptyShipCoreCalibrationState(today);
  const raw = storage.getItem(SHIP_CORE_SAVE_KEY);
  if (!raw) return emptyShipCoreCalibrationState(today);
  try {
    return normalizeShipCoreCalibrationState(JSON.parse(raw), today);
  } catch {
    return emptyShipCoreCalibrationState(today);
  }
}

export function writeShipCoreCalibrationState(
  storage: StorageLike | null | undefined,
  state: ShipCoreCalibrationState,
): void {
  if (!storage) return;
  storage.setItem(SHIP_CORE_SAVE_KEY, JSON.stringify(state));
}

export function generateShipCorePanels(
  seedText: string,
  size = SHIP_CORE_TARGET_LOCKS,
): ShipCorePanel[] {
  const targetSize = Math.min(SHIP_CORE_PANEL_POOL.length, Math.max(1, Math.floor(size)));
  const picked = new Set<string>();
  const panels: ShipCorePanel[] = [];
  let seed = hashSeed(seedText);

  for (const channel of SHIP_CORE_CHANNELS) {
    const candidates = SHIP_CORE_PANEL_POOL.filter((panel) => panel.channel === channel);
    seed = nextSeed(seed + channel.length * 29);
    const panel = candidates[seed % candidates.length];
    if (panel && !picked.has(panel.id)) {
      picked.add(panel.id);
      panels.push(panel);
    }
  }

  const shuffled = shufflePanels(SHIP_CORE_PANEL_POOL, seedText);
  for (const panel of shuffled) {
    if (panels.length >= targetSize) break;
    if (picked.has(panel.id)) continue;
    picked.add(panel.id);
    panels.push(panel);
  }

  return shufflePanels(panels, `${seedText}:final`).slice(0, targetSize);
}

export function settleShipCoreCalibrationRun(
  locks: number,
  mistakes: number,
  state: ShipCoreCalibrationState,
): ShipCoreCalibrationRunResult {
  const safeLocks = Math.min(SHIP_CORE_TARGET_LOCKS, clampNonNegativeInteger(locks));
  const safeMistakes = clampNonNegativeInteger(mistakes);
  const perfect = safeLocks >= SHIP_CORE_TARGET_LOCKS && safeMistakes === 0;
  const baseNext: ShipCoreCalibrationState = {
    ...state,
    bestLocks: Math.max(state.bestLocks, safeLocks),
    totalRuns: state.totalRuns + 1,
    perfectRuns: state.perfectRuns + (perfect ? 1 : 0),
  };

  if (safeLocks < SHIP_CORE_TARGET_LOCKS) {
    return {
      next: baseNext,
      rewardGranted: false,
      reward: null,
      remainingClaims: remainingShipCoreRewards(baseNext),
    };
  }

  if (baseNext.rewardClaims >= SHIP_CORE_DAILY_REWARD_LIMIT) {
    return {
      next: baseNext,
      rewardGranted: false,
      reward: null,
      remainingClaims: 0,
    };
  }

  const reward = shipCoreRewardForRun(safeMistakes);
  const next: ShipCoreCalibrationState = {
    ...baseNext,
    rewardClaims: baseNext.rewardClaims + 1,
  };
  return {
    next,
    rewardGranted: true,
    reward,
    remainingClaims: remainingShipCoreRewards(next),
  };
}

export function shipCoreRewardForRun(mistakes: number): ShipCoreCalibrationReward {
  const safeMistakes = clampNonNegativeInteger(mistakes);
  const perfectBonus = safeMistakes === 0;
  return {
    coins: Math.max(95, 180 - safeMistakes * 18),
    repairChips: perfectBonus ? 2 : 1,
    greatBalls: perfectBonus ? 2 : 1,
    electricFruit: safeMistakes <= 1 ? 1 : 0,
    crystalShards: perfectBonus ? 1 : 0,
  };
}

export function remainingShipCoreRewards(state: ShipCoreCalibrationState): number {
  return Math.max(0, SHIP_CORE_DAILY_REWARD_LIMIT - state.rewardClaims);
}

function emptyShipCoreCalibrationState(today: string): ShipCoreCalibrationState {
  return {
    date: today,
    bestLocks: 0,
    rewardClaims: 0,
    totalRuns: 0,
    perfectRuns: 0,
  };
}

function shufflePanels(panels: readonly ShipCorePanel[], seedText: string): ShipCorePanel[] {
  const out = [...panels];
  let seed = hashSeed(seedText);
  for (let index = out.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed + index * 113);
    const swapIndex = seed % (index + 1);
    const tmp = out[index];
    out[index] = out[swapIndex]!;
    out[swapIndex] = tmp!;
  }
  return out;
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextSeed(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function clampNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
