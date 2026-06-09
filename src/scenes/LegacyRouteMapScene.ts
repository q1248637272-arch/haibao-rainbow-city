import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { recommendedLevelLabel } from '@/data/locationDifficulty';
import { getPet } from '@/data/pets';
import {
  ROUTE_MAP_HOTSPOTS,
  ROUTE_MAP_HOTSPOT_IMAGE_MASKS,
  ROUTE_MAP_SOURCE_SIZE,
  type RouteMapHotspotDefinition,
  type RouteMapHotspotId,
  type RouteMapHotspotImageMask,
} from '@/data/routeMapHotspots';
import routeMapHitmapsData from '@/data/routeMapHitmaps.json';
import { AudioManager } from '@/systems/AudioManager';
import {
  hasClaimedLegacyPatrolToday,
  legacyLocationHasPatrol,
} from '@/systems/LegacyPatrol';
import { preloadRouteMapAssets } from '@/systems/SceneAssetPreloader';
import { createNavIconButton } from '@/ui/NavIconButton';
import {
  createResponsiveMapBackground,
  type ResponsiveMapBackground,
  type ResponsiveMapDisplayBounds,
} from '@/utils/responsiveBackground';


interface RouteMapHotspotView {
  readonly hotspot: RouteMapHotspotDefinition;
  readonly mask: RouteMapHotspotImageMask;
  readonly edge: Phaser.GameObjects.Image;
  readonly labelBg: Phaser.GameObjects.Graphics;
  readonly labelText: Phaser.GameObjects.Text;
  readonly challengeText: Phaser.GameObjects.Text;
  readonly zone: Phaser.GameObjects.Zone;
  readonly hitArea: Phaser.Geom.Rectangle;
}

interface RouteMaskActiveBounds {
  readonly bottom: number;
  readonly centerX: number;
}

interface RouteMapHitmaskBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface RouteMapHitmask {
  readonly width: number;
  readonly height: number;
  readonly threshold: number;
  readonly hitPixels: number;
  readonly bbox: RouteMapHitmaskBounds | null;
  readonly runs: Readonly<Record<string, readonly (readonly [number, number])[]>>;
}

interface RouteMapHitmapsFile {
  readonly format: 'route-map-alpha-hitmaps-v1';
  readonly threshold: number;
  readonly masks: Readonly<Partial<Record<RouteMapHotspotId, RouteMapHitmask>>>;
}

const MAP_IMAGE_KEY = 'legacy_world_map_full';
const ROUTE_MAP_NAME_LABEL_HEIGHT = 28;
const ROUTE_MAP_NAME_LABEL_GAP = 2;
const ROUTE_MAP_HITMAPS = routeMapHitmapsData as unknown as RouteMapHitmapsFile;

function routeHitmaskFor(hotspotId: RouteMapHotspotId): RouteMapHitmask | null {
  return ROUTE_MAP_HITMAPS.masks[hotspotId] ?? null;
}

function routeHitmaskContains(hitmask: RouteMapHitmask, imageX: number, imageY: number): boolean {
  const x = Math.floor(imageX);
  const y = Math.floor(imageY);
  if (x < 0 || y < 0 || x >= hitmask.width || y >= hitmask.height) return false;
  const row = hitmask.runs[String(y)];
  if (!row) return false;
  for (const [start, end] of row) {
    if (x >= start && x < end) return true;
    if (x < start) return false;
  }
  return false;
}

export class LegacyRouteMapScene extends Phaser.Scene {
  private fromScene: string = SceneKey.WORLD;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private justCapturedPetId: string | null = null;
  private justDefeatedWildPetId: string | null = null;
  private justLostWildBattle = false;
  private escapedFromBattle = false;
  private routeBackground: ResponsiveMapBackground | null = null;
  private routeHotspotViews: RouteMapHotspotView[] = [];
  private navScrim: Phaser.GameObjects.Rectangle | null = null;
  private hoveredRouteHotspot: RouteMapHotspotDefinition | null = null;
  private readonly routeMaskActiveBoundsCache = new Map<string, RouteMaskActiveBounds>();

  public constructor() {
    super({ key: SceneKey.LEGACY_ROUTE_MAP });
  }

  public init(data?: {
    readonly fromScene?: string;
    readonly justCapturedPetId?: string;
    readonly justDefeatedWildPetId?: string;
    readonly justLostWildBattle?: boolean;
    readonly escapedFromBattle?: boolean;
  }): void {
    this.fromScene = data?.fromScene ?? SceneKey.WORLD;
    this.justCapturedPetId = data?.justCapturedPetId ?? null;
    this.justDefeatedWildPetId = data?.justDefeatedWildPetId ?? null;
    this.justLostWildBattle = data?.justLostWildBattle === true;
    this.escapedFromBattle = data?.escapedFromBattle === true;
    this.routeBackground = null;
    this.routeHotspotViews = [];
    this.navScrim = null;
    this.hoveredRouteHotspot = null;
  }

  public preload(): void {
    preloadRouteMapAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.drawMap();

    this.createNavButton(54, 42, '返回', () => this.scene.start(this.fromScene));
    this.createNavButton(142, 42, '进城', () => this.scene.start(SceneKey.WORLD));
    this.createNavButton(230, 42, '精灵', () =>
      this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.LEGACY_ROUTE_MAP }),
    );
    this.createNavButton(318, 42, '图鉴', () =>
      this.scene.start(SceneKey.PET_DEX, { fromScene: SceneKey.LEGACY_ROUTE_MAP }),
    );
    this.createNavButton(406, 42, '家园', () =>
      this.scene.start(SceneKey.HOME, { fromScene: SceneKey.LEGACY_ROUTE_MAP }),
    );
    this.createNavButton(494, 42, '活动', () =>
      this.scene.start(SceneKey.ACTIVITY, { fromScene: SceneKey.LEGACY_ROUTE_MAP }),
    );
    this.createNavButton(582, 42, '背包', () =>
      this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.LEGACY_ROUTE_MAP }),
    );
    this.createNavButton(670, 42, '存档', () =>
      this.scene.start(SceneKey.SAVE_SLOTS, { fromScene: SceneKey.LEGACY_ROUTE_MAP }),
    );
    this.createNavButton(758, 42, '签到', () => this.scene.start(SceneKey.VIP_PANEL));

    this.scale.on(Phaser.Scale.Events.RESIZE, this.refreshRouteLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.refreshRouteLayout, this);
      this.destroyRouteHotspots();
      this.clearToast();
      this.routeBackground = null;
      this.navScrim = null;
      this.hoveredRouteHotspot = null;
    });
    this.showReturnToast();
    AudioManager.play('world_rainbow', undefined, this);
  }

  private drawMap(): void {
    if (this.textures.exists(MAP_IMAGE_KEY)) {
      this.routeBackground = createResponsiveMapBackground(this, MAP_IMAGE_KEY, {
        fitMode: 'fillWidth',
      });
    } else {
      this.routeBackground = null;
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x86d5ea, 1).setOrigin(0);
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '彩虹城大地图素材加载失败', {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '24px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
    }

    this.navScrim = this.add
      .rectangle(0, 0, this.routeViewportWidth(), 88, 0x082b5c, 0.22)
      .setOrigin(0)
      .setScrollFactor(0);
    this.rebuildRouteHotspots();
  }

  private refreshRouteLayout(): void {
    this.routeBackground?.refresh();
    this.navScrim?.setSize(this.routeViewportWidth(), 88);
    this.refreshRouteHotspots();
  }

  private routeViewportWidth(): number {
    return Math.max(GAME_WIDTH, this.cameras.main.width);
  }

  private rebuildRouteHotspots(): void {
    this.destroyRouteHotspots();
    ROUTE_MAP_HOTSPOTS.forEach((hotspot) => this.createMapHotspot(hotspot));
  }

  private destroyRouteHotspots(): void {
    for (const view of this.routeHotspotViews) {
      this.tweens.killTweensOf(view.edge);
      view.edge.destroy();
      view.labelBg.destroy();
      view.labelText.destroy();
      view.challengeText.destroy();
      view.zone.destroy();
    }
    this.routeHotspotViews = [];
  }

  private routeMapDisplayBounds(): ResponsiveMapDisplayBounds {
    return (
      this.routeBackground?.getDisplayBounds() ?? {
        left: 0,
        top: 0,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
      }
    );
  }

  private routeMaskDisplayRect(mask: RouteMapHotspotImageMask): {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } {
    const bounds = this.routeMapDisplayBounds();
    const scaleX = bounds.width / ROUTE_MAP_SOURCE_SIZE.width;
    const scaleY = bounds.height / ROUTE_MAP_SOURCE_SIZE.height;
    return {
      x: bounds.left + mask.x * scaleX,
      y: bounds.top + mask.y * scaleY,
      width: mask.width * scaleX,
      height: mask.height * scaleY,
    };
  }

  private routeLabelPoint(
    hotspotId: RouteMapHotspotId,
    mask: RouteMapHotspotImageMask,
  ): {
    readonly x: number;
    readonly y: number;
  } {
    const bounds = this.routeMapDisplayBounds();
    const scaleX = bounds.width / ROUTE_MAP_SOURCE_SIZE.width;
    const scaleY = bounds.height / ROUTE_MAP_SOURCE_SIZE.height;
    const active = this.routeMaskActiveBounds(hotspotId, mask);
    const rawX = bounds.left + (mask.x + active.centerX) * scaleX;
    const responseBottomY = bounds.top + (mask.y + active.bottom + 1) * scaleY;
    const rawY = responseBottomY + ROUTE_MAP_NAME_LABEL_HEIGHT / 2 + ROUTE_MAP_NAME_LABEL_GAP;
    return {
      x: Phaser.Math.Clamp(rawX, bounds.left + 56, bounds.left + bounds.width - 56),
      y: Phaser.Math.Clamp(rawY, Math.max(104, bounds.top + 28), bounds.top + bounds.height - 40),
    };
  }

  private routeMaskActiveBounds(
    hotspotId: RouteMapHotspotId,
    mask: RouteMapHotspotImageMask,
  ): RouteMaskActiveBounds {
    const cached = this.routeMaskActiveBoundsCache.get(hotspotId);
    if (cached) return cached;

    const hitmask = routeHitmaskFor(hotspotId);
    if (hitmask?.bbox && hitmask.width === mask.width && hitmask.height === mask.height) {
      const active = {
        bottom: hitmask.bbox.y + hitmask.bbox.height - 1,
        centerX: hitmask.bbox.x + hitmask.bbox.width / 2,
      };
      this.routeMaskActiveBoundsCache.set(hotspotId, active);
      return active;
    }

    const width = Math.max(1, mask.width);
    const height = Math.max(1, mask.height);
    let left = width;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = this.textures.getPixelAlpha(x, y, mask.maskTextureKey);
        if (!Number.isFinite(alpha) || alpha < mask.alphaTolerance) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }

    const active =
      right >= left && bottom >= 0
        ? {
            bottom,
            centerX: (left + right + 1) / 2,
          }
        : {
            bottom: height - 1,
            centerX: width / 2,
          };
    this.routeMaskActiveBoundsCache.set(hotspotId, active);
    return active;
  }

  private createMapHotspot(hotspot: RouteMapHotspotDefinition): void {
    const mask = ROUTE_MAP_HOTSPOT_IMAGE_MASKS[hotspot.id];
    if (!this.textures.exists(mask.maskTextureKey) || !this.textures.exists(mask.edgeTextureKey)) {
      console.warn(`[LegacyRouteMapScene] missing route-map mask hotspot assets: ${hotspot.id}`);
      return;
    }

    const rect = this.routeMaskDisplayRect(mask);
    const edge = this.add
      .image(rect.x, rect.y, mask.edgeTextureKey)
      .setOrigin(0)
      .setDisplaySize(rect.width, rect.height)
      .setDepth(40)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    const labelBg = this.add.graphics().setDepth(41);
    const labelPoint = this.routeLabelPoint(hotspot.id, mask);
    const labelText = this.add
      .text(labelPoint.x, labelPoint.y, hotspot.label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(42);
    const challengeText = this.add
      .text(labelPoint.x, labelPoint.y + 24, this.routeChallengeLabel(hotspot.locationId), {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: this.routeChallengeColor(hotspot.locationId),
        stroke: '#1b1b3a',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(42);
    const hitArea = new Phaser.Geom.Rectangle(0, 0, rect.width, rect.height);
    const contains: Phaser.Types.Input.HitAreaCallback = (_hitArea, x, y) =>
      this.containsRouteMaskPoint(hotspot.id, mask, hitArea.width, hitArea.height, x, y);
    const zone = this.add
      .zone(rect.x, rect.y, rect.width, rect.height)
      .setOrigin(0)
      .setDepth(43)
      .setInteractive(hitArea, contains);
    if (zone.input) zone.input.cursor = 'pointer';

    const view: RouteMapHotspotView = {
      hotspot,
      mask,
      edge,
      labelBg,
      labelText,
      challengeText,
      zone,
      hitArea,
    };
    this.drawRouteHotspotState(view, false);

    zone
      .on('pointerover', () => {
        this.hoveredRouteHotspot = hotspot;
        this.refreshRouteHotspotStates(hotspot.id);
      })
      .on('pointerout', () => {
        if (this.hoveredRouteHotspot?.id === hotspot.id) this.hoveredRouteHotspot = null;
        this.refreshRouteHotspotStates();
      })
      .on('pointerup', () => this.openHotspot(hotspot));
    this.routeHotspotViews.push(view);
  }

  private refreshRouteHotspots(): void {
    for (const view of this.routeHotspotViews) {
      const rect = this.routeMaskDisplayRect(view.mask);
      view.edge.setPosition(rect.x, rect.y).setDisplaySize(rect.width, rect.height);
      view.hitArea.setTo(0, 0, rect.width, rect.height);
      view.zone.setPosition(rect.x, rect.y).setSize(rect.width, rect.height);
      this.drawRouteHotspotState(view, false);
    }
  }

  private refreshRouteHotspotStates(activeHotspotId: string | null = null): void {
    for (const view of this.routeHotspotViews) {
      this.drawRouteHotspotState(view, view.hotspot.id === activeHotspotId);
    }
  }

  private routeChallengeLabel(locationId: RouteMapHotspotDefinition['locationId']): string {
    if (!legacyLocationHasPatrol(locationId)) {
      return recommendedLevelLabel(locationId);
    }
    return `${recommendedLevelLabel(locationId)} · ${
      hasClaimedLegacyPatrolToday(locationId) ? '已巡护' : '巡护'
    }`;
  }

  private routeChallengeColor(locationId: RouteMapHotspotDefinition['locationId']): string {
    if (!legacyLocationHasPatrol(locationId)) return '#fff4a8';
    return hasClaimedLegacyPatrolToday(locationId) ? '#bff8ff' : '#fff4a8';
  }

  private drawRouteHotspotState(view: RouteMapHotspotView, active: boolean): void {
    const labelPoint = this.routeLabelPoint(view.hotspot.id, view.mask);
    view.challengeText
      .setText(this.routeChallengeLabel(view.hotspot.locationId))
      .setColor(this.routeChallengeColor(view.hotspot.locationId));
    const labelWidth = Math.max(92, Math.min(156, view.labelText.width + 22));
    const labelHeight = ROUTE_MAP_NAME_LABEL_HEIGHT;
    const patrolColor =
      legacyLocationHasPatrol(view.hotspot.locationId) &&
      !hasClaimedLegacyPatrolToday(view.hotspot.locationId)
        ? 0xffd166
        : 0x8fe8ff;

    view.edge.setAlpha(active ? 0.95 : 0);
    view.labelText.setPosition(labelPoint.x, labelPoint.y);
    view.challengeText.setPosition(labelPoint.x, labelPoint.y + 24);
    view.labelBg.clear();
    view.labelBg.fillStyle(active ? 0xff9f2f : 0x1599c8, 0.94);
    view.labelBg.lineStyle(2, 0xffffff, active ? 0.96 : 0.82);
    view.labelBg.fillRoundedRect(
      labelPoint.x - labelWidth / 2,
      labelPoint.y - labelHeight / 2,
      labelWidth,
      labelHeight,
      7,
    );
    view.labelBg.strokeRoundedRect(
      labelPoint.x - labelWidth / 2,
      labelPoint.y - labelHeight / 2,
      labelWidth,
      labelHeight,
      7,
    );

    const challengeWidth = Math.max(92, Math.min(190, view.challengeText.width + 18));
    view.labelBg.fillStyle(0x0b3768, 0.84);
    view.labelBg.lineStyle(1, patrolColor, active ? 0.9 : 0.64);
    view.labelBg.fillRoundedRect(
      labelPoint.x - challengeWidth / 2,
      labelPoint.y + 12,
      challengeWidth,
      22,
      6,
    );
    view.labelBg.strokeRoundedRect(
      labelPoint.x - challengeWidth / 2,
      labelPoint.y + 12,
      challengeWidth,
      22,
      6,
    );
  }

  private containsRouteMaskPoint(
    hotspotId: RouteMapHotspotId,
    mask: RouteMapHotspotImageMask,
    displayWidth: number,
    displayHeight: number,
    x: number,
    y: number,
  ): boolean {
    if (displayWidth <= 0 || displayHeight <= 0) return false;
    if (x < 0 || y < 0 || x >= displayWidth || y >= displayHeight) return false;
    const hitmask = routeHitmaskFor(hotspotId);
    if (hitmask && hitmask.width === mask.width && hitmask.height === mask.height) {
      const sampleX = Math.min(
        hitmask.width - 1,
        Math.floor((x / displayWidth) * hitmask.width),
      );
      const sampleY = Math.min(
        hitmask.height - 1,
        Math.floor((y / displayHeight) * hitmask.height),
      );
      return routeHitmaskContains(hitmask, sampleX, sampleY);
    }

    const sampleX = Math.min(mask.width - 1, Math.floor((x / displayWidth) * mask.width));
    const sampleY = Math.min(mask.height - 1, Math.floor((y / displayHeight) * mask.height));
    const alpha = this.textures.getPixelAlpha(sampleX, sampleY, mask.maskTextureKey);
    return Number.isFinite(alpha) && alpha >= mask.alphaTolerance;
  }

  private openHotspot(hotspot: RouteMapHotspotDefinition): void {
    this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: hotspot.locationId });
  }

  private createNavButton(x: number, y: number, label: string, onClick: () => void): void {
    createNavIconButton(this, {
      x,
      y,
      label,
      onClick,
      depth: 100,
      width: label.length >= 3 ? 78 : 66,
      height: 48,
    });
  }

  private showReturnToast(): void {
    if (this.escapedFromBattle) {
      this.showToast('已经离开战斗。');
      this.escapedFromBattle = false;
      return;
    }
    if (this.justCapturedPetId) {
      const pet = getPet(this.justCapturedPetId);
      this.showToast(pet ? `你收服了 ${pet.name}！` : '你收服了一只新伙伴！');
      this.justCapturedPetId = null;
      return;
    }
    if (this.justDefeatedWildPetId) {
      const pet = getPet(this.justDefeatedWildPetId);
      this.showToast(pet ? `战胜 ${pet.name}！` : '战胜了野生精灵！');
      this.justDefeatedWildPetId = null;
      return;
    }
    if (this.justLostWildBattle) {
      this.showToast('野生精灵跑远了。');
      this.justLostWildBattle = false;
    }
  }

  private showToast(message: string): void {
    this.clearToast();
    this.toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, message, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.toastTimer = this.time.delayedCall(2000, () => {
      this.toast?.destroy();
      this.toast = null;
      this.toastTimer = null;
    });
  }

  private clearToast(): void {
    if (this.toastTimer) {
      this.toastTimer.remove(false);
      this.toastTimer = null;
    }
    this.toast?.destroy();
    this.toast = null;
  }
}
