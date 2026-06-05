export interface ContourPoint {
  readonly x: number;
  readonly y: number;
}

export interface ContourBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

export type ContourHitArea =
  | {
      readonly kind: 'ellipse';
      readonly x: number;
      readonly y: number;
      readonly rx: number;
      readonly ry: number;
    }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly radius?: number;
    }
  | {
      readonly kind: 'polygon';
      readonly points: readonly ContourPoint[];
    };

export interface ContourVerificationOptions {
  readonly label?: string;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly worldBounds?: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  };
}

export interface ContourVerificationResult {
  readonly ok: boolean;
  readonly passCount: number;
  readonly bounds: ContourBounds;
  readonly failures: readonly string[];
}

export interface VerifiedContourSelection {
  readonly area: ContourHitArea;
  readonly verification: ContourVerificationResult;
  readonly attempts: number;
}

const DEFAULT_MIN_WIDTH = 18;
const DEFAULT_MIN_HEIGHT = 18;
const VERIFY_PASSES = 2;

export function contourBounds(area: ContourHitArea): ContourBounds {
  if (area.kind === 'ellipse') {
    return buildBounds(area.x - area.rx, area.y - area.ry, area.x + area.rx, area.y + area.ry);
  }
  if (area.kind === 'rect') {
    return buildBounds(
      area.x - area.width / 2,
      area.y - area.height / 2,
      area.x + area.width / 2,
      area.y + area.height / 2,
    );
  }

  const first = area.points[0];
  if (!first) {
    return buildBounds(0, 0, 0, 0);
  }
  let left = first.x;
  let right = first.x;
  let top = first.y;
  let bottom = first.y;
  for (const point of area.points) {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  return buildBounds(left, top, right, bottom);
}

export function containsContourPoint(area: ContourHitArea, x: number, y: number): boolean {
  if (area.kind === 'ellipse') {
    if (area.rx <= 0 || area.ry <= 0) return false;
    const dx = (x - area.x) / area.rx;
    const dy = (y - area.y) / area.ry;
    return dx * dx + dy * dy <= 1;
  }
  if (area.kind === 'rect') {
    const bounds = contourBounds(area);
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }
  return pointInPolygon(area.points, x, y);
}

export function verifyContourHitAreaTwice(
  area: ContourHitArea,
  options: ContourVerificationOptions = {},
): ContourVerificationResult {
  const failures: string[] = [];
  let bounds = contourBounds(area);
  for (let pass = 1; pass <= VERIFY_PASSES; pass += 1) {
    bounds = contourBounds(area);
    failures.push(...verifyContourPass(area, bounds, pass, options));
  }
  return {
    ok: failures.length === 0,
    passCount: VERIFY_PASSES,
    bounds,
    failures,
  };
}

export function chooseVerifiedContourHitArea(
  preferred: ContourHitArea,
  options: ContourVerificationOptions & { readonly fallbackArea?: ContourHitArea } = {},
): VerifiedContourSelection {
  const candidates: ContourHitArea[] = [
    preferred,
    ...(options.fallbackArea ? [options.fallbackArea] : []),
    buildFallbackContour(preferred),
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate) continue;
    const verification = verifyContourHitAreaTwice(candidate, options);
    if (verification.ok) {
      return {
        area: candidate,
        verification,
        attempts: i + 1,
      };
    }
  }

  const fallback = buildFallbackContour(preferred, {
    minWidth: Math.max(options.minWidth ?? DEFAULT_MIN_WIDTH, 48),
    minHeight: Math.max(options.minHeight ?? DEFAULT_MIN_HEIGHT, 36),
  });
  const verification = verifyContourHitAreaTwice(fallback, withoutWorldBounds(options));
  if (!verification.ok) {
    throw new Error(`Contour hit area could not pass verification: ${verification.failures.join('; ')}`);
  }
  return {
    area: fallback,
    verification,
    attempts: candidates.length + 1,
  };
}

export function buildFallbackContour(
  area: ContourHitArea,
  options: { readonly minWidth?: number; readonly minHeight?: number } = {},
): ContourHitArea {
  const bounds = contourBounds(area);
  const width = Math.max(options.minWidth ?? DEFAULT_MIN_WIDTH, bounds.width);
  const height = Math.max(options.minHeight ?? DEFAULT_MIN_HEIGHT, bounds.height);
  return {
    kind: 'rect',
    x: bounds.centerX,
    y: bounds.centerY,
    width,
    height,
    radius: Math.min(12, Math.max(4, Math.min(width, height) * 0.18)),
  };
}

export function contourSamplePoints(area: ContourHitArea): readonly ContourPoint[] {
  if (area.kind === 'ellipse') {
    return [
      { x: area.x, y: area.y },
      { x: area.x - area.rx * 0.66, y: area.y },
      { x: area.x + area.rx * 0.66, y: area.y },
      { x: area.x, y: area.y - area.ry * 0.66 },
      { x: area.x, y: area.y + area.ry * 0.66 },
    ];
  }
  if (area.kind === 'rect') {
    const b = contourBounds(area);
    return [
      { x: b.centerX, y: b.centerY },
      { x: b.left + b.width * 0.18, y: b.top + b.height * 0.18 },
      { x: b.right - b.width * 0.18, y: b.top + b.height * 0.18 },
      { x: b.left + b.width * 0.18, y: b.bottom - b.height * 0.18 },
      { x: b.right - b.width * 0.18, y: b.bottom - b.height * 0.18 },
    ];
  }
  const b = contourBounds(area);
  return [
    { x: b.centerX, y: b.centerY },
    ...area.points.map((point) => ({
      x: b.centerX + (point.x - b.centerX) * 0.62,
      y: b.centerY + (point.y - b.centerY) * 0.62,
    })),
  ];
}

function verifyContourPass(
  area: ContourHitArea,
  bounds: ContourBounds,
  pass: number,
  options: ContourVerificationOptions,
): string[] {
  const label = options.label ? `${options.label} ` : '';
  const failures: string[] = [];
  const minWidth = options.minWidth ?? DEFAULT_MIN_WIDTH;
  const minHeight = options.minHeight ?? DEFAULT_MIN_HEIGHT;

  if (!isFiniteBounds(bounds)) failures.push(`${label}pass ${pass}: bounds are not finite`);
  if (bounds.width < minWidth) failures.push(`${label}pass ${pass}: width ${bounds.width} < ${minWidth}`);
  if (bounds.height < minHeight) {
    failures.push(`${label}pass ${pass}: height ${bounds.height} < ${minHeight}`);
  }

  if (area.kind === 'ellipse') {
    if (!Number.isFinite(area.x) || !Number.isFinite(area.y)) {
      failures.push(`${label}pass ${pass}: ellipse center is not finite`);
    }
    if (!Number.isFinite(area.rx) || area.rx <= 0) {
      failures.push(`${label}pass ${pass}: ellipse rx must be positive`);
    }
    if (!Number.isFinite(area.ry) || area.ry <= 0) {
      failures.push(`${label}pass ${pass}: ellipse ry must be positive`);
    }
  } else if (area.kind === 'rect') {
    if (!Number.isFinite(area.x) || !Number.isFinite(area.y)) {
      failures.push(`${label}pass ${pass}: rect center is not finite`);
    }
    if (!Number.isFinite(area.width) || area.width <= 0) {
      failures.push(`${label}pass ${pass}: rect width must be positive`);
    }
    if (!Number.isFinite(area.height) || area.height <= 0) {
      failures.push(`${label}pass ${pass}: rect height must be positive`);
    }
  } else {
    if (area.points.length < 3) failures.push(`${label}pass ${pass}: polygon needs at least 3 points`);
    if (Math.abs(polygonArea(area.points)) < minWidth * minHeight * 0.18) {
      failures.push(`${label}pass ${pass}: polygon area is too small`);
    }
    for (const point of area.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        failures.push(`${label}pass ${pass}: polygon point is not finite`);
        break;
      }
    }
  }

  if (options.worldBounds) {
    const world = options.worldBounds;
    if (
      bounds.left < world.left ||
      bounds.right > world.right ||
      bounds.top < world.top ||
      bounds.bottom > world.bottom
    ) {
      failures.push(`${label}pass ${pass}: contour falls outside world bounds`);
    }
  }

  for (const point of contourSamplePoints(area)) {
    if (!containsContourPoint(area, point.x, point.y)) {
      failures.push(`${label}pass ${pass}: sample point is outside contour`);
      break;
    }
  }

  return failures;
}

function buildBounds(left: number, top: number, right: number, bottom: number): ContourBounds {
  const width = right - left;
  const height = bottom - top;
  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

function isFiniteBounds(bounds: ContourBounds): boolean {
  return (
    Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.right) &&
    Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.bottom) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    Number.isFinite(bounds.centerX) &&
    Number.isFinite(bounds.centerY)
  );
}

function pointInPolygon(points: readonly ContourPoint[], x: number, y: number): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const current = points[i];
    const previous = points[j];
    if (!current || !previous) continue;
    const intersects =
      current.y > y !== previous.y > y &&
      x < ((previous.x - current.x) * (y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonArea(points: readonly ContourPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function withoutWorldBounds(options: ContourVerificationOptions): ContourVerificationOptions {
  return {
    ...(options.label !== undefined ? { label: options.label } : {}),
    ...(options.minWidth !== undefined ? { minWidth: options.minWidth } : {}),
    ...(options.minHeight !== undefined ? { minHeight: options.minHeight } : {}),
  };
}
