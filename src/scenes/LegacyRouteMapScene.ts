import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { recommendedLevelLabel } from '@/data/locationDifficulty';
import { getPet } from '@/data/pets';
import { AudioManager } from '@/systems/AudioManager';
import { preloadRouteMapAssets } from '@/systems/SceneAssetPreloader';
import { createVerifiedContourZone, drawRaisedContour } from '@/ui/ContourInteractive';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createPortalFlash } from '@/ui/PortalFlash';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

import type { LegacyLocationId } from './LegacyContent';

interface RouteMapHotspot {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly labelX?: number;
  readonly labelY?: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly targetScene?: string;
  readonly locationId?: LegacyLocationId;
  readonly message?: string;
}

const MAP_IMAGE_KEY = 'legacy_world_map_full';
const HOTSPOTS: readonly RouteMapHotspot[] = [
  {
    label: '潮汐试炼场',
    x: 588,
    y: 424,
    labelX: 608,
    labelY: 372,
    radiusX: 86,
    radiusY: 52,
    locationId: 'tide_playground',
  },
  {
    label: '彩虹城中心',
    x: 480,
    y: 318,
    labelY: 388,
    radiusX: 96,
    radiusY: 64,
    locationId: 'center',
  },
  {
    label: '图书馆',
    x: 156,
    y: 148,
    labelX: 168,
    labelY: 218,
    radiusX: 96,
    radiusY: 58,
    locationId: 'library',
  },
  {
    label: '实验室',
    x: 478,
    y: 124,
    labelY: 188,
    radiusX: 100,
    radiusY: 56,
    locationId: 'lab',
  },
  {
    label: '魔法学院',
    x: 752,
    y: 146,
    labelY: 220,
    radiusX: 100,
    radiusY: 58,
    locationId: 'magic_school',
  },
  {
    label: '迷宫入口',
    x: 128,
    y: 300,
    labelX: 140,
    labelY: 366,
    radiusX: 98,
    radiusY: 58,
    locationId: 'maze',
  },
  {
    label: '玩偶基地',
    x: 806,
    y: 302,
    labelX: 816,
    labelY: 370,
    radiusX: 78,
    radiusY: 54,
    locationId: 'doll_base',
  },
  {
    label: '飞船内部',
    x: 132,
    y: 478,
    labelY: 548,
    radiusX: 106,
    radiusY: 62,
    locationId: 'spaceship',
  },
  {
    label: '彩贝赌场',
    x: 812,
    y: 490,
    labelX: 850,
    labelY: 430,
    radiusX: 92,
    radiusY: 58,
    locationId: 'casino',
  },
  {
    label: '洗浴中心',
    x: 712,
    y: 456,
    labelX: 705,
    labelY: 395,
    radiusX: 76,
    radiusY: 48,
    locationId: 'bath_center',
  },
  {
    label: '珊瑚集市',
    x: 394,
    y: 456,
    labelX: 398,
    labelY: 525,
    radiusX: 86,
    radiusY: 52,
    locationId: 'coral_market',
  },
  {
    label: '星辉观测台',
    x: 628,
    y: 112,
    labelX: 625,
    labelY: 174,
    radiusX: 88,
    radiusY: 48,
    locationId: 'star_observatory',
  },
  {
    label: '风暴遗迹',
    x: 288,
    y: 566,
    labelX: 296,
    labelY: 502,
    radiusX: 92,
    radiusY: 50,
    locationId: 'storm_ruins',
  },
  {
    label: '能量田',
    x: 748,
    y: 586,
    labelY: 525,
    radiusX: 112,
    radiusY: 64,
    locationId: 'energy_field',
  },
  {
    label: '水晶矿洞',
    x: 516,
    y: 574,
    labelX: 520,
    labelY: 604,
    radiusX: 112,
    radiusY: 66,
    locationId: 'energy_cave',
  },
];

export class LegacyRouteMapScene extends Phaser.Scene {
  private fromScene: string = SceneKey.WORLD;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private justCapturedPetId: string | null = null;
  private justDefeatedWildPetId: string | null = null;
  private justLostWildBattle = false;
  private escapedFromBattle = false;
  private routePreview: Phaser.GameObjects.Graphics | null = null;

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearToast());
    this.showReturnToast();
    AudioManager.play('world_rainbow', undefined, this);
  }

  private drawMap(): void {
    if (this.textures.exists(MAP_IMAGE_KEY)) {
      createResponsiveMapBackground(this, MAP_IMAGE_KEY);
    } else {
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

    this.add.rectangle(0, 0, GAME_WIDTH, 88, 0x082b5c, 0.22).setOrigin(0).setScrollFactor(0);
    HOTSPOTS.forEach((hotspot) => this.createMapHotspot(hotspot));
  }

  private createMapHotspot(hotspot: RouteMapHotspot): void {
    const contour = createVerifiedContourZone(this, {
      area: {
        kind: 'ellipse',
        x: hotspot.x,
        y: hotspot.y,
        rx: hotspot.radiusX,
        ry: hotspot.radiusY,
      },
      depth: 43,
      label: `route-map.${hotspot.label}`,
      minWidth: 40,
      minHeight: 28,
      worldBounds: { left: 0, right: GAME_WIDTH, top: 0, bottom: GAME_HEIGHT },
    });
    createPortalFlash(this, hotspot.x, hotspot.y, {
      radius: Math.min(34, Math.max(24, hotspot.radiusY * 0.42)),
      depth: 39,
      yScale: 0.72,
    });
    const marker = this.add.graphics().setDepth(40);
    const labelBg = this.add.graphics().setDepth(41);
    const autoLabelY =
      hotspot.y + hotspot.radiusY + 36 > GAME_HEIGHT
        ? hotspot.y - hotspot.radiusY - 24
        : hotspot.y + hotspot.radiusY + 18;
    const labelX = hotspot.labelX ?? hotspot.x;
    const labelY = hotspot.labelY ?? autoLabelY;
    const labelText = this.add
      .text(labelX, labelY, hotspot.label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(42);
    const labelWidth = Math.max(92, Math.min(148, labelText.width + 22));
    const labelHeight = 28;
    const challengeText = hotspot.locationId
      ? this.add
          .text(labelX, labelY + 24, recommendedLevelLabel(hotspot.locationId), {
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontSize: '12px',
            color: '#fff4a8',
            stroke: '#1b1b3a',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(42)
      : null;

    const drawHover = (active: boolean): void => {
      marker.clear();
      labelBg.clear();
      labelBg.fillStyle(active ? 0xff9f2f : 0x1599c8, 0.94);
      labelBg.lineStyle(2, 0xffffff, 0.96);
      labelBg.fillRoundedRect(
        labelX - labelWidth / 2,
        labelY - labelHeight / 2,
        labelWidth,
        labelHeight,
        7,
      );
      labelBg.strokeRoundedRect(
        labelX - labelWidth / 2,
        labelY - labelHeight / 2,
        labelWidth,
        labelHeight,
        7,
      );
      if (challengeText) {
        const challengeWidth = Math.max(82, challengeText.width + 18);
        labelBg.fillStyle(0x0b3768, 0.84);
        labelBg.lineStyle(1, 0xffffff, 0.58);
        labelBg.fillRoundedRect(labelX - challengeWidth / 2, labelY + 12, challengeWidth, 22, 6);
        labelBg.strokeRoundedRect(labelX - challengeWidth / 2, labelY + 12, challengeWidth, 22, 6);
      }
      drawRaisedContour(marker, contour.area, {
        color: active ? 0xffd93d : 0x8fe8ff,
        active,
        fillAlpha: active ? 0.16 : 0.045,
      });
    };
    drawHover(false);

    contour.zone
      .on('pointerover', () => {
        drawHover(true);
        this.drawRoutePreview(hotspot);
      })
      .on('pointerout', () => {
        drawHover(false);
        this.clearRoutePreview();
      })
      .on('pointerup', () => this.openHotspot(hotspot));
  }

  private drawRoutePreview(hotspot: RouteMapHotspot): void {
    this.clearRoutePreview();
    const route = this.add.graphics().setDepth(38);
    const start = { x: 480, y: 318 };
    const end = { x: hotspot.x, y: hotspot.y };
    const control = {
      x: (start.x + end.x) / 2,
      y: Math.min(start.y, end.y) - 54,
    };
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 28; i += 1) {
      const t = i / 28;
      const inv = 1 - t;
      points.push({
        x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
        y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
      });
    }

    route.lineStyle(9, 0x0b3768, 0.28);
    route.beginPath();
    points.forEach((point, index) => {
      if (index === 0) route.moveTo(point.x, point.y);
      else route.lineTo(point.x, point.y);
    });
    route.strokePath();

    route.lineStyle(4, 0xffffff, 0.76);
    route.beginPath();
    points.forEach((point, index) => {
      if (index === 0) route.moveTo(point.x, point.y);
      else route.lineTo(point.x, point.y);
    });
    route.strokePath();

    route.lineStyle(2, 0xffd93d, 0.92);
    route.beginPath();
    points.forEach((point, index) => {
      if (index === 0) route.moveTo(point.x, point.y);
      else route.lineTo(point.x, point.y);
    });
    route.strokePath();

    route.fillStyle(0xffffff, 0.88);
    for (let i = 4; i < points.length; i += 6) {
      const point = points[i];
      if (point) route.fillCircle(point.x, point.y, 3.4);
    }

    this.routePreview = route;
  }

  private clearRoutePreview(): void {
    this.routePreview?.destroy();
    this.routePreview = null;
  }

  private openHotspot(hotspot: RouteMapHotspot): void {
    this.clearRoutePreview();
    if (hotspot.locationId) {
      this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: hotspot.locationId });
      return;
    }
    if (hotspot.targetScene) {
      this.scene.start(hotspot.targetScene);
      return;
    }
    this.showToast(hotspot.message ?? '这里还在修复中。');
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
