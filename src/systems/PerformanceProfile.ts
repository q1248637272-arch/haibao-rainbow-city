export type PerformanceTier = 'low' | 'medium' | 'high';

interface NavigatorHints {
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly userAgent?: string;
}

export function detectPerformanceTier(): PerformanceTier {
  const nav = readNavigatorHints();
  const memory = safeNumber(nav.deviceMemory, 8);
  const cores = safeNumber(nav.hardwareConcurrency, 8);
  const coarsePointer = matchesMedia('(pointer: coarse)');
  const smallViewport = matchesMedia('(max-width: 720px)');
  const reducedMotion = matchesMedia('(prefers-reduced-motion: reduce)');
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent ?? '');

  let score = 0;
  if (memory <= 3) score -= 2;
  else if (memory <= 4) score -= 1;
  else if (memory >= 8) score += 1;

  if (cores <= 4) score -= 1;
  else if (cores >= 8) score += 1;

  if (coarsePointer || smallViewport || mobileAgent) score -= 1;
  if (reducedMotion) score -= 2;

  if (score <= -2) return 'low';
  if (score <= 0) return 'medium';
  return 'high';
}

export function preloadParallelDownloads(): number {
  const tier = detectPerformanceTier();
  if (tier === 'low') return 6;
  if (tier === 'medium') return 10;
  return 16;
}

export function roamingPetBudget(base: number): number {
  const tier = detectPerformanceTier();
  if (tier === 'high') return Math.max(base, 2);
  return Math.max(1, Math.min(base, 1));
}

export function virtualPlayerBudget(base: number): number {
  const tier = detectPerformanceTier();
  if (tier === 'low') return 1;
  if (tier === 'medium') return Math.max(1, Math.min(base, 2));
  return Math.max(base, 3);
}

export function effectParticleCount(base: number): number {
  const tier = detectPerformanceTier();
  if (matchesMedia('(prefers-reduced-motion: reduce)')) return Math.max(1, Math.ceil(base * 0.32));
  if (tier === 'low') return Math.max(1, Math.ceil(base * 0.45));
  if (tier === 'medium') return Math.max(1, Math.ceil(base * 0.72));
  return base;
}

export function motionScale(): number {
  const tier = detectPerformanceTier();
  if (matchesMedia('(prefers-reduced-motion: reduce)')) return 0.55;
  if (tier === 'low') return 0.68;
  if (tier === 'medium') return 0.86;
  return 1;
}

function readNavigatorHints(): NavigatorHints {
  const nav = globalThis.navigator as NavigatorHints | undefined;
  return nav ?? {};
}

function matchesMedia(query: string): boolean {
  const matchMedia = globalThis.matchMedia;
  if (typeof matchMedia !== 'function') return false;
  try {
    return matchMedia(query).matches;
  } catch {
    return false;
  }
}

function safeNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
