import Phaser from 'phaser';

import {
  chooseVerifiedContourHitArea,
  containsContourPoint,
  contourBounds,
  contourSamplePoints,
  type ContourBounds,
  type ContourHitArea,
  type ContourVerificationOptions,
} from '@/systems/ContourHitArea';

export interface RaisedContourStyle {
  readonly color: number;
  readonly active?: boolean;
  readonly fillAlpha?: number;
  readonly strokeAlpha?: number;
  readonly depthAlpha?: number;
  readonly lineWidth?: number;
}

export interface VerifiedContourZoneConfig extends ContourVerificationOptions {
  readonly area: ContourHitArea;
  readonly depth?: number;
  readonly fallbackArea?: ContourHitArea;
  readonly useHandCursor?: boolean;
}

export interface VerifiedContourZone {
  readonly zone: Phaser.GameObjects.Zone;
  readonly area: ContourHitArea;
  readonly bounds: ContourBounds;
  readonly attempts: number;
}

export function drawRaisedContour(
  graphics: Phaser.GameObjects.Graphics,
  area: ContourHitArea,
  style: RaisedContourStyle,
): void {
  const active = style.active === true;
  const color = style.color;
  const lineWidth = style.lineWidth ?? (active ? 4 : 3);
  const fillAlpha = style.fillAlpha ?? (active ? 0.18 : 0.055);
  const strokeAlpha = style.strokeAlpha ?? (active ? 0.96 : 0.58);
  const depthAlpha = style.depthAlpha ?? (active ? 0.45 : 0.28);

  drawContourPath(graphics, translateContour(area, 3, 5), {
    fill: 0x123657,
    fillAlpha: fillAlpha * 0.72,
    stroke: 0x123657,
    strokeAlpha: depthAlpha,
    lineWidth: lineWidth + 3,
  });
  drawContourPath(graphics, translateContour(area, -2, -2), {
    stroke: 0xffffff,
    strokeAlpha: Math.min(1, strokeAlpha * 0.62),
    lineWidth: Math.max(2, lineWidth - 1),
  });
  drawContourPath(graphics, area, {
    fill: color,
    fillAlpha,
    stroke: color,
    strokeAlpha,
    lineWidth,
  });
}

export function createVerifiedContourZone(
  scene: Phaser.Scene,
  config: VerifiedContourZoneConfig,
): VerifiedContourZone {
  const selection = chooseVerifiedContourHitArea(config.area, {
    ...(config.label !== undefined ? { label: config.label } : {}),
    ...(config.minWidth !== undefined ? { minWidth: config.minWidth } : {}),
    ...(config.minHeight !== undefined ? { minHeight: config.minHeight } : {}),
    ...(config.worldBounds !== undefined ? { worldBounds: config.worldBounds } : {}),
    ...(config.fallbackArea !== undefined ? { fallbackArea: config.fallbackArea } : {}),
  });
  const candidates = [
    selection.area,
    config.fallbackArea,
    {
      kind: 'rect' as const,
      x: selection.verification.bounds.centerX,
      y: selection.verification.bounds.centerY,
      width: Math.max(36, selection.verification.bounds.width),
      height: Math.max(28, selection.verification.bounds.height),
      radius: 8,
    },
  ].filter((area): area is ContourHitArea => Boolean(area));

  for (let i = 0; i < candidates.length; i += 1) {
    const area = candidates[i];
    if (!area) continue;
    const bounds = contourBounds(area);
    const zone = scene.add
      .zone(bounds.left, bounds.top, bounds.width, bounds.height)
      .setOrigin(0, 0)
      .setDepth(config.depth ?? 1000);
    const hitArea = toLocalPhaserHitArea(area, bounds);
    zone.setInteractive(hitArea.shape, hitArea.contains);
    if (config.useHandCursor !== false && zone.input) {
      zone.input.cursor = 'pointer';
    }
    if (verifyInstalledZone(zone, area, bounds)) {
      return {
        zone,
        area,
        bounds,
        attempts: selection.attempts + i,
      };
    }
    zone.destroy();
  }

  throw new Error(`Failed to install verified contour zone: ${config.label ?? 'unnamed'}`);
}

function drawContourPath(
  graphics: Phaser.GameObjects.Graphics,
  area: ContourHitArea,
  style: {
    readonly fill?: number;
    readonly fillAlpha?: number;
    readonly stroke?: number;
    readonly strokeAlpha?: number;
    readonly lineWidth?: number;
  },
): void {
  if (style.fill !== undefined) {
    graphics.fillStyle(style.fill, style.fillAlpha ?? 1);
  }
  if (style.stroke !== undefined) {
    graphics.lineStyle(style.lineWidth ?? 2, style.stroke, style.strokeAlpha ?? 1);
  }

  if (area.kind === 'ellipse') {
    if (style.fill !== undefined) graphics.fillEllipse(area.x, area.y, area.rx * 2, area.ry * 2);
    if (style.stroke !== undefined) {
      graphics.strokeEllipse(area.x, area.y, area.rx * 2, area.ry * 2);
    }
    return;
  }

  if (area.kind === 'rect') {
    const b = contourBounds(area);
    if (style.fill !== undefined) {
      graphics.fillRoundedRect(b.left, b.top, b.width, b.height, area.radius ?? 0);
    }
    if (style.stroke !== undefined) {
      graphics.strokeRoundedRect(b.left, b.top, b.width, b.height, area.radius ?? 0);
    }
    return;
  }

  if (area.points.length < 3) return;
  if (style.fill !== undefined) graphics.beginPath();
  if (style.stroke !== undefined && style.fill === undefined) graphics.beginPath();
  const first = area.points[0];
  if (!first) return;
  graphics.moveTo(first.x, first.y);
  for (const point of area.points.slice(1)) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.closePath();
  if (style.fill !== undefined) graphics.fillPath();
  if (style.stroke !== undefined) graphics.strokePath();
}

function translateContour(area: ContourHitArea, dx: number, dy: number): ContourHitArea {
  if (area.kind === 'ellipse') {
    return { ...area, x: area.x + dx, y: area.y + dy };
  }
  if (area.kind === 'rect') {
    return { ...area, x: area.x + dx, y: area.y + dy };
  }
  return {
    kind: 'polygon',
    points: area.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  };
}

function toLocalPhaserHitArea(
  area: ContourHitArea,
  bounds: ContourBounds,
): {
  readonly shape: Phaser.Geom.Ellipse | Phaser.Geom.Rectangle | Phaser.Geom.Polygon;
  readonly contains: Phaser.Types.Input.HitAreaCallback;
} {
  if (area.kind === 'ellipse') {
    return {
      shape: new Phaser.Geom.Ellipse(
        area.x - bounds.left,
        area.y - bounds.top,
        area.rx * 2,
        area.ry * 2,
      ),
      contains: Phaser.Geom.Ellipse.Contains,
    };
  }
  if (area.kind === 'rect') {
    return {
      shape: new Phaser.Geom.Rectangle(0, 0, bounds.width, bounds.height),
      contains: Phaser.Geom.Rectangle.Contains,
    };
  }
  return {
    shape: new Phaser.Geom.Polygon(
      area.points.map((point) => ({ x: point.x - bounds.left, y: point.y - bounds.top })),
    ),
    contains: Phaser.Geom.Polygon.Contains,
  };
}

function verifyInstalledZone(
  zone: Phaser.GameObjects.Zone,
  area: ContourHitArea,
  bounds: ContourBounds,
): boolean {
  if (!zone.input) return false;
  if (!Number.isFinite(zone.x) || !Number.isFinite(zone.y)) return false;
  if (Math.abs(zone.x - bounds.left) > 0.5 || Math.abs(zone.y - bounds.top) > 0.5) return false;
  if (Math.abs(zone.width - bounds.width) > 0.5 || Math.abs(zone.height - bounds.height) > 0.5) {
    return false;
  }

  for (let pass = 0; pass < 2; pass += 1) {
    for (const point of contourSamplePoints(area)) {
      if (!containsContourPoint(area, point.x, point.y)) return false;
      const localX = point.x - bounds.left;
      const localY = point.y - bounds.top;
      if (!zone.input.hitAreaCallback(zone.input.hitArea, localX, localY, zone)) return false;
    }
  }
  return true;
}
