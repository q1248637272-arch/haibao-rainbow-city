import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { ITEMS, getItem, itemsByKind } from '@/data/items';
import { getPet } from '@/data/pets';
import { completeActivityTask, consumePendingActivityTask } from '@/systems/ActivityProgress';
import { AudioManager } from '@/systems/AudioManager';
import { gameEvents } from '@/systems/EventBus';
import {
  HATCHERY_CARE_ACTIONS,
  HATCHERY_REQUIRED_CARE,
  HATCHERY_SAVE_KEY,
  applyHatcheryCare,
  boostHatcheryEgg,
  canHatchEgg,
  defaultHatcheryState,
  finishHatcheryCycle,
  hatcheryCareProgress,
  normalizeHatcheryState,
  rollHatchedPet,
  startHatcheryEgg,
  type HatcheryCareAction,
  type HatcheryState,
} from '@/systems/PetHatchery';
import { createPlayerPet } from '@/systems/PetInstance';
import { findPixelPath, type PixelPoint } from '@/systems/PixelPathfinding';
import { PlayerState } from '@/systems/PlayerState';
import { preloadHomeAssets } from '@/systems/SceneAssetPreloader';
import { createVerifiedContourZone, drawRaisedContour } from '@/ui/ContourInteractive';
import { createNavIconButton } from '@/ui/NavIconButton';
import {
  currentPlayerButtonLabel,
  currentPlayerSheetKey,
  currentPlayerWalkAnimKey,
  ensureCurrentPlayerWalkAnimation,
  togglePlayerGender,
} from '@/utils/playerAvatar';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';
import type { FurniturePlacement, FurnitureRotation, ItemDefinition, PlayerPet } from '@/types';

const PLAYER_SPEED = 178;
const HOME_REWARD_SAVE_KEY = 'hbcc:home-rewards:v1';
const WALK_AREA = { left: 82, right: 878, top: 250, bottom: 566 } as const;
const PLAYER_START = { x: 486, y: 514 } as const;
const FURNITURE_PER_PAGE = 6;
const HOME_WALK_ELLIPSES = [
  { x: 500, y: 454, rx: 418, ry: 182 },
  { x: 512, y: 526, rx: 372, ry: 96 },
] as const;
const HOME_BLOCK_RECTS = [
  { left: 82, right: 338, top: 250, bottom: 408 },
  { left: 740, right: 878, top: 250, bottom: 386 },
  { left: 748, right: 878, top: 424, bottom: 566 },
  { left: 82, right: 246, top: 430, bottom: 566 },
] as const;

const STARTER_HOME_KIT = [
  'wallpaper_blue',
  'floor_wood',
  'bed_small',
  'table_wood',
  'plant_small',
  'sofa_blue',
  'rug_rainbow',
  'curtain_star',
  'toy_chest',
] as const;

const LEGACY_DOLL_PURIFY_ORDER = [
  'pester_priest',
  'fars_fire_donkey',
  'arthur_knight',
  'elephant_walrus',
  'aotian_dragon',
  'xuanqing_jingwei',
  'diudiu_maori',
  'oni_tyranno',
] as const;

const GARDEN_FRUITS = [
  'element_fruit_fire',
  'element_fruit_water',
  'element_fruit_grass',
  'element_fruit_electric',
  'element_fruit_light',
] as const;

const FARM_SAVE_KEY = 'hbcc:home-farm:v1';
const FARM_PLOT_COUNT = 6;
const FARM_GROW_MS = 90 * 1000;
const FARM_CROPS = [
  { id: 'fire', name: '红焰莓', rewardItemId: 'element_fruit_fire', color: 0xff6b35 },
  { id: 'water', name: '蓝波果', rewardItemId: 'element_fruit_water', color: 0x3aa0ff },
  { id: 'grass', name: '嫩叶果', rewardItemId: 'element_fruit_grass', color: 0x4cc26b },
  { id: 'electric', name: '雷鸣果', rewardItemId: 'element_fruit_electric', color: 0xffd93d },
  { id: 'light', name: '彩虹果', rewardItemId: 'element_fruit_light', color: 0xff8ff0 },
] as const;

interface FarmPlotState {
  readonly cropId?: string;
  readonly plantedAt?: number;
  readonly watered?: boolean;
}

interface FarmState {
  readonly plots: readonly FarmPlotState[];
  readonly helperDate?: string;
}

const HOME_MATERIALS = [
  { id: 'energy_seed', label: '能源种子' },
  { id: 'rainbow_pet_egg', label: '彩虹蛋' },
  { id: 'potential_seed', label: '潜能星砂' },
  { id: 'crystal_shard', label: '净化水晶' },
  { id: 'angel_chest', label: '天使宝箱' },
  { id: 'gold_shell', label: '金贝壳' },
  { id: 'repair_chip', label: '飞船芯片' },
] as const;

const DECOR_ANCHORS = [
  { x: 258, y: 532 },
  { x: 360, y: 562 },
  { x: 474, y: 556 },
  { x: 590, y: 556 },
  { x: 700, y: 532 },
  { x: 810, y: 482 },
  { x: 144, y: 462 },
  { x: 842, y: 368 },
] as const;

interface HomeHotspot {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly walkX?: number;
  readonly walkY?: number;
  readonly radius: number;
  readonly action: () => void;
}

export class HomeScene extends Phaser.Scene {
  private fromScene: string = SceneKey.WORLD;
  private selectedItemId: string | null = null;
  private furniturePage = 0;
  private furniturePanelOpen = false;
  private panel: Phaser.GameObjects.Container | null = null;
  private farmPanel: Phaser.GameObjects.Container | null = null;
  private hatcheryPanel: Phaser.GameObjects.Container | null = null;
  private materialPanel: Phaser.GameObjects.Container | null = null;
  private materialPanelExpanded = false;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private moveTarget: {
    readonly x: number;
    readonly y: number;
    readonly action?: () => void;
    readonly triggerRadius?: number;
    readonly path?: PixelPoint[];
  } | null = null;
  private hotspotPointerHandled = false;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: {
    readonly W: Phaser.Input.Keyboard.Key;
    readonly A: Phaser.Input.Keyboard.Key;
    readonly S: Phaser.Input.Keyboard.Key;
    readonly D: Phaser.Input.Keyboard.Key;
  } | null = null;

  public constructor() {
    super({ key: SceneKey.HOME });
  }

  public init(data?: { readonly fromScene?: string }): void {
    this.fromScene = data?.fromScene ?? SceneKey.WORLD;
    this.selectedItemId = null;
    this.furniturePanelOpen = false;
    this.materialPanelExpanded = false;
    this.furniturePage = 0;
    this.moveTarget = null;
  }

  public preload(): void {
    preloadHomeAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.ensurePlayerAnimation();
    this.drawHomeMap();
    this.drawPlacedFurniture();
    this.setupPlayer();
    this.setupInput();
    this.drawHotspots();
    this.drawTopBar();
    this.refreshMaterialPanel();
    this.refreshFurniturePanel();
    this.completePendingHomeActivity();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.panel?.destroy();
      this.panel = null;
      this.farmPanel?.destroy();
      this.farmPanel = null;
      this.hatcheryPanel?.destroy();
      this.hatcheryPanel = null;
      this.materialPanel?.destroy();
      this.materialPanel = null;
      this.clearToast();
    });
    AudioManager.play('home', undefined, this);
  }

  private completePendingHomeActivity(): void {
    const pending = consumePendingActivityTask('home');
    if (!pending) return;
    if (
      pending.activityId === 'ex_girlfriend_meal_tasks' &&
      pending.taskId === 'return_home' &&
      completeActivityTask(pending.activityId, pending.taskId)
    ) {
      PlayerState.addCoins(60);
      this.showToast('前女友的饭：已返回家园，任务进度已记录。');
    }
  }

  public update(_time: number, delta: number): void {
    const keyboardMoving = this.updateKeyboardMove(delta);
    this.updateClickMove(delta);
    this.updatePlayerVisual(Boolean(this.moveTarget) || keyboardMoving);
  }

  private drawHomeMap(): void {
    createResponsiveMapBackground(this, 'legacy_home_walkable', {
      interactive: true,
      onPointerUp: (pointer: Phaser.Input.Pointer) => {
        if (this.hotspotPointerHandled) {
          this.hotspotPointerHandled = false;
          return;
        }
        this.walkToPoint(pointer.worldX, pointer.worldY);
      },
    });
  }

  private setupPlayer(): void {
    this.playerShadow = this.add
      .ellipse(PLAYER_START.x, PLAYER_START.y + 20, 50, 15, 0x000000, 0.25)
      .setDepth(430);
    this.player = this.add
      .sprite(PLAYER_START.x, PLAYER_START.y - 18, currentPlayerSheetKey(), 0)
      .setOrigin(0.5, 0.88)
      .setScale(0.72)
      .setDepth(460);
  }

  private ensurePlayerAnimation(): void {
    ensureCurrentPlayerWalkAnimation(this);
  }

  private setupInput(): void {
    this.cursors = this.input.keyboard?.createCursorKeys() ?? null;
    this.wasd = this.input.keyboard
      ? (this.input.keyboard.addKeys({
          W: Phaser.Input.Keyboard.KeyCodes.W,
          A: Phaser.Input.Keyboard.KeyCodes.A,
          S: Phaser.Input.Keyboard.KeyCodes.S,
          D: Phaser.Input.Keyboard.KeyCodes.D,
        }) as {
          W: Phaser.Input.Keyboard.Key;
          A: Phaser.Input.Keyboard.Key;
          S: Phaser.Input.Keyboard.Key;
          D: Phaser.Input.Keyboard.Key;
        })
      : null;
  }

  private drawTopBar(): void {
    const topBarWidth = Math.max(GAME_WIDTH, this.cameras.main.width);
    const titleX = Math.min(topBarWidth - 70, Math.max(890, topBarWidth / 2 + 280));
    this.add
      .rectangle(0, 0, topBarWidth, 76, 0x0b3768, 0.62)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(900);
    this.add
      .text(titleX, 38, '我的海宝小屋', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '21px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(901);
    const topButtons: ReadonlyArray<{ readonly label: string; readonly onClick: () => void }> = [
      { label: '返回', onClick: () => this.scene.start(this.fromScene) },
      {
        label: '地图',
        onClick: () => this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.HOME }),
      },
      {
        label: '精灵',
        onClick: () => this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.HOME }),
      },
      { label: '图鉴', onClick: () => this.scene.start(SceneKey.PET_DEX, { fromScene: SceneKey.HOME }) },
      { label: '活动', onClick: () => this.scene.start(SceneKey.ACTIVITY, { fromScene: SceneKey.HOME }) },
      { label: '背包', onClick: () => this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.HOME }) },
      { label: '签到', onClick: () => this.scene.start(SceneKey.VIP_PANEL) },
      {
        label: '存档',
        onClick: () => this.scene.start(SceneKey.SAVE_SLOTS, { fromScene: SceneKey.HOME }),
      },
      {
        label: currentPlayerButtonLabel(),
        onClick: () => {
          togglePlayerGender();
          this.scene.restart({ fromScene: this.fromScene });
        },
      },
      {
        label: '家具',
        onClick: () => {
          this.furniturePanelOpen = !this.furniturePanelOpen;
          this.refreshFurniturePanel();
        },
      },
    ];
    topButtons.forEach((button, index) => {
      this.createTopButton(58 + index * 80, 38, button.label, button.onClick);
    });
  }

  private drawHotspots(): void {
    const hotspots: HomeHotspot[] = [
      {
        id: 'bed-rest',
        label: '休息',
        x: 126,
        y: 244,
        walkX: 260,
        walkY: 348,
        radius: 56,
        action: () => this.restAtHome(),
      },
      {
        id: 'books-task',
        label: '任务资料',
        x: 308,
        y: 132,
        walkX: 330,
        walkY: 268,
        radius: 34,
        action: () =>
          this.claimDailyReward('books-task', {
            coins: 30,
            items: [{ itemId: 'exp_candy', quantity: 1 }],
            success: '整理了主要任务统计，经验糖已经放进背包。',
            claimed: '今天已经整理过任务资料了。',
          }),
      },
      {
        id: 'energy-flower',
        label: '能源花盆',
        x: 54,
        y: 410,
        walkX: 138,
        walkY: 448,
        radius: 46,
        action: () =>
          this.claimDailyReward('energy-flower', {
            coins: 35,
            items: [
              { itemId: 'energy_seed', quantity: 1 },
              { itemId: 'element_fruit_grass', quantity: 1 },
            ],
            success: '能源花盆结出了种子和草元素果实。',
            claimed: '今天的能源花盆已经收过了。',
          }),
      },
      {
        id: 'toy-chest',
        label: '天使宝箱',
        x: 760,
        y: 230,
        walkX: 690,
        walkY: 320,
        radius: 48,
        action: () => this.openAngelChest(),
      },
      {
        id: 'trade-counter',
        label: '交易柜台',
        x: 808,
        y: 384,
        walkX: 700,
        walkY: 430,
        radius: 54,
        action: () =>
          this.claimDailyReward('trade-counter', {
            coins: 45,
            items: [
              { itemId: 'repair_chip', quantity: 1 },
              { itemId: 'gold_shell', quantity: 1 },
            ],
            success: '交易柜台整理完成，飞船芯片和金贝壳已经收好。',
            claimed: '今天已经整理过交易柜台了。',
          }),
      },
      {
        id: 'garden-plot',
        label: '种植盆',
        x: 244,
        y: 486,
        walkX: 358,
        walkY: 488,
        radius: 68,
        action: () => this.tendGardenPlot(),
      },
      {
        id: 'farm-entrance',
        label: '农场',
        x: 622,
        y: 198,
        walkX: 590,
        walkY: 330,
        radius: 74,
        action: () => this.scene.start(SceneKey.FARM, { fromScene: this.fromScene }),
      },
      {
        id: 'pet-incubator',
        label: '培育舱',
        x: 654,
        y: 372,
        walkX: 600,
        walkY: 430,
        radius: 58,
        action: () => this.openHatcheryPanel(),
      },
      {
        id: 'purify-table',
        label: '净化台',
        x: 454,
        y: 226,
        walkX: 454,
        walkY: 330,
        radius: 48,
        action: () => this.purifyLegacyDoll(),
      },
      {
        id: 'build-book',
        label: '共建册',
        x: 236,
        y: 186,
        walkX: 306,
        walkY: 282,
        radius: 38,
        action: () => this.claimBuildReward(),
      },
      {
        id: 'pet-bed',
        label: '精灵床',
        x: 856,
        y: 246,
        walkX: 780,
        walkY: 342,
        radius: 46,
        action: () => this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.HOME }),
      },
    ];

    hotspots.forEach((hotspot) => this.drawHotspot(hotspot));
  }

  private drawHotspot(hotspot: HomeHotspot): void {
    const textureKey = homeHotspotTexture(hotspot.id);
    const hasTexture = Boolean(textureKey && this.textures.exists(textureKey));
    if (hasTexture && textureKey) {
      const size = Math.max(58, hotspot.radius * 1.55);
      const shadow = this.add
        .ellipse(hotspot.x, hotspot.y + 10, size * 0.72, size * 0.24, 0x000000, 0.22)
        .setDepth(421);
      const sprite = this.add
        .image(hotspot.x, hotspot.y, textureKey)
        .setDisplaySize(size, size)
        .setOrigin(0.5, 0.78)
        .setDepth(422);
      this.tweens.add({
        targets: sprite,
        y: sprite.y - 3,
        duration: 1500 + hotspot.id.length * 38,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      shadow.setScale(0.96);
    }

    const contour = createVerifiedContourZone(this, {
      area: hasTexture
        ? {
            kind: 'rect',
            x: hotspot.x,
            y: hotspot.y - hotspot.radius * 0.06,
            width: Math.max(58, hotspot.radius * 1.66),
            height: Math.max(42, hotspot.radius * 1.28),
            radius: 10,
          }
        : {
            kind: 'ellipse',
            x: hotspot.x,
            y: hotspot.y,
            rx: Math.max(30, hotspot.radius * 1.04),
            ry: Math.max(20, hotspot.radius * 0.68),
          },
      depth: 783,
      label: `home.${hotspot.id}`,
      minWidth: 24,
      minHeight: 18,
      worldBounds: { left: 0, right: GAME_WIDTH, top: 0, bottom: GAME_HEIGHT },
    });
    const marker = this.add.graphics().setDepth(780);
    const label = this.add
      .text(hotspot.x, contour.bounds.top - 16, hotspot.label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(782)
      .setAlpha(0);

    const draw = (active: boolean): void => {
      marker.clear();
      label.setAlpha(active ? 1 : 0);
      drawRaisedContour(marker, contour.area, {
        color: 0xffd93d,
        active,
      });
    };
    draw(false);

    contour.zone
      .on('pointerover', () => draw(true))
      .on('pointerout', () => draw(false))
      .on('pointerup', () => {
        this.hotspotPointerHandled = true;
        this.time.delayedCall(30, () => {
          this.hotspotPointerHandled = false;
        });
        this.walkToAction(
          hotspot.walkX ?? hotspot.x,
          hotspot.walkY ?? hotspot.y + 28,
          hotspot.action,
        );
      });
  }

  private drawFarmEntranceDoor(hotspot: HomeHotspot): void {
    const x = hotspot.x;
    const y = hotspot.y;
    this.add.ellipse(x, y + 18, 116, 28, 0x000000, 0.24).setDepth(421);

    const g = this.add.graphics().setDepth(422);
    g.fillStyle(0x8edb8a, 0.28);
    g.fillEllipse(x, y - 34, 118, 88);
    g.fillStyle(0x8a532a, 1);
    g.fillRoundedRect(x - 52, y - 70, 18, 100, 7);
    g.fillRoundedRect(x + 34, y - 70, 18, 100, 7);
    g.lineStyle(10, 0x8a532a, 1);
    g.beginPath();
    g.arc(x, y - 50, 48, Math.PI, Math.PI * 2);
    g.strokePath();
    g.lineStyle(4, 0xfff0a8, 0.9);
    g.beginPath();
    g.arc(x, y - 50, 37, Math.PI, Math.PI * 2);
    g.strokePath();

    g.fillStyle(0x254e36, 0.86);
    g.fillRoundedRect(x - 36, y - 48, 72, 78, 12);
    g.fillStyle(0x79d174, 0.22);
    g.fillRoundedRect(x - 26, y - 38, 52, 58, 10);
    g.lineStyle(3, 0xb5f4a1, 0.88);
    g.strokeRoundedRect(x - 36, y - 48, 72, 78, 12);

    g.fillStyle(0xffd65a, 1);
    g.fillRoundedRect(x - 34, y - 78, 68, 24, 8);
    g.lineStyle(2, 0xffffff, 0.82);
    g.strokeRoundedRect(x - 34, y - 78, 68, 24, 8);

    this.add
      .text(x, y - 66, '农场门', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#5b3100',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(423);

    const path = this.add.graphics().setDepth(420);
    path.fillStyle(0xd4a45c, 0.58);
    path.fillPoints(
      [
        { x: x - 28, y: y + 20 },
        { x: x + 28, y: y + 20 },
        { x: x + 58, y: y + 78 },
        { x: x - 58, y: y + 78 },
      ],
      true,
    );
    path.lineStyle(2, 0xfff0a8, 0.5);
    path.strokePoints(
      [
        { x: x - 28, y: y + 20 },
        { x: x + 28, y: y + 20 },
        { x: x + 58, y: y + 78 },
        { x: x - 58, y: y + 78 },
      ],
      true,
    );
  }

  private updateKeyboardMove(delta: number): boolean {
    if (!this.cursors || !this.wasd) return false;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left?.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.cursors.right?.isDown || this.wasd.D.isDown) vx += 1;
    if (this.cursors.up?.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.cursors.down?.isDown || this.wasd.S.isDown) vy += 1;
    if (vx === 0 && vy === 0) return false;

    this.moveTarget = null;
    const len = Math.hypot(vx, vy);
    const step = (PLAYER_SPEED * delta) / 1000;
    if (vx !== 0) this.player.setFlipX(vx < 0);
    this.setPlayerPosition(this.player.x + (vx / len) * step, this.player.y + (vy / len) * step);
    return true;
  }

  private updateClickMove(delta: number): void {
    if (!this.moveTarget) return;
    const dx = this.moveTarget.x - this.player.x;
    const dy = this.moveTarget.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    const step = (PLAYER_SPEED * delta) / 1000;
    const finalWaypoint = (this.moveTarget.path?.length ?? 0) === 0;
    if (finalWaypoint && dist <= Math.max(this.moveTarget.triggerRadius ?? 4, step)) {
      this.runMoveTargetAction();
      return;
    }
    if (dist <= Math.max(4, step)) {
      this.setPlayerPosition(this.moveTarget.x, this.moveTarget.y);
      if (this.advanceMoveTarget()) return;
      this.runMoveTargetAction();
      return;
    }
    if (Math.abs(dx) > 2) this.player.setFlipX(dx < 0);
    const moved = this.setPlayerPosition(
      this.player.x + (dx / dist) * step,
      this.player.y + (dy / dist) * step,
    );
    if (!moved) {
      if (this.moveTarget.action) {
        this.runMoveTargetAction();
      } else {
        this.moveTarget = null;
      }
    }
  }

  private runMoveTargetAction(): void {
    const action = this.moveTarget?.action;
    this.moveTarget = null;
    action?.();
  }

  private updatePlayerVisual(moving: boolean): void {
    if (moving) {
      if (!this.player.anims.isPlaying) this.player.play(currentPlayerWalkAnimKey());
    } else {
      this.player.anims.stop();
      this.player.setFrame(0);
    }
    this.playerShadow.setPosition(this.player.x, this.player.y + 20);
    this.player.setDepth(460 + this.player.y);
    this.playerShadow.setDepth(this.player.depth - 1);
  }

  private walkToPoint(x: number, y: number): void {
    const target = this.findNearestHomeWalkable(x, y - 18);
    this.setMovePath(target);
  }

  private walkToAction(x: number, y: number, action: () => void): void {
    const target = this.findNearestHomeWalkable(x, y);
    this.setMovePath(target, action, 18);
  }

  private setMovePath(target: PixelPoint, action?: () => void, triggerRadius?: number): void {
    const path = findPixelPath({
      bounds: WALK_AREA,
      start: { x: this.player.x, y: this.player.y },
      target,
      isWalkable: (x, y) => this.isHomeWalkable(x, y),
      cellSize: 22,
    });
    if (!path) {
      this.moveTarget = null;
      return;
    }
    const route = path.slice(1);
    const first = route.shift();
    if (first) {
      this.moveTarget = {
        x: first.x,
        y: first.y,
        path: route,
        ...(action ? { action } : {}),
        ...(triggerRadius !== undefined ? { triggerRadius } : {}),
      };
      return;
    }
    this.moveTarget = null;
    action?.();
  }

  private advanceMoveTarget(): boolean {
    const next = this.moveTarget?.path?.shift();
    if (!next || !this.moveTarget) return false;
    this.moveTarget = {
      ...this.moveTarget,
      x: next.x,
      y: next.y,
    };
    return true;
  }

  private setPlayerPosition(x: number, y: number): boolean {
    const next = {
      x: Phaser.Math.Clamp(x, WALK_AREA.left, WALK_AREA.right),
      y: Phaser.Math.Clamp(y, WALK_AREA.top, WALK_AREA.bottom),
    };
    if (!this.isHomeWalkable(next.x, next.y)) return false;
    this.player.setPosition(next.x, next.y);
    return true;
  }

  private findNearestHomeWalkable(
    x: number,
    y: number,
  ): { readonly x: number; readonly y: number } {
    const base = {
      x: Phaser.Math.Clamp(x, WALK_AREA.left, WALK_AREA.right),
      y: Phaser.Math.Clamp(y, WALK_AREA.top, WALK_AREA.bottom),
    };
    if (this.isHomeWalkable(base.x, base.y)) return base;

    for (let radius = 10; radius <= 180; radius += 10) {
      for (let angle = 0; angle < 360; angle += 24) {
        const rad = Phaser.Math.DegToRad(angle);
        const point = {
          x: Phaser.Math.Clamp(base.x + Math.cos(rad) * radius, WALK_AREA.left, WALK_AREA.right),
          y: Phaser.Math.Clamp(base.y + Math.sin(rad) * radius, WALK_AREA.top, WALK_AREA.bottom),
        };
        if (this.isHomeWalkable(point.x, point.y)) return point;
      }
    }
    return PLAYER_START;
  }

  private isHomeWalkable(x: number, y: number): boolean {
    if (x < WALK_AREA.left || x > WALK_AREA.right || y < WALK_AREA.top || y > WALK_AREA.bottom) {
      return false;
    }
    const insideFloor = HOME_WALK_ELLIPSES.some((zone) => this.inEllipse(x, y, zone));
    const insideBlocked = HOME_BLOCK_RECTS.some(
      (zone) => x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom,
    );
    return insideFloor && !insideBlocked;
  }

  private inEllipse(
    x: number,
    y: number,
    zone: { readonly x: number; readonly y: number; readonly rx: number; readonly ry: number },
  ): boolean {
    const dx = (x - zone.x) / zone.rx;
    const dy = (y - zone.y) / zone.ry;
    return dx * dx + dy * dy <= 1;
  }

  private drawPlacedFurniture(): void {
    const layout = [...PlayerState.getHomeLayout()]
      .filter((item) => item.gridX >= 0 && item.gridX < DECOR_ANCHORS.length)
      .sort((a, b) => a.gridX - b.gridX)
      .slice(0, DECOR_ANCHORS.length);
    layout.forEach((item) => {
      const def = ITEMS[item.itemId];
      const anchor = DECOR_ANCHORS[item.gridX];
      if (!def || !anchor) return;
      const placed = this.add.container(anchor.x, anchor.y).setDepth(520 + anchor.y);
      this.drawFurnitureArt(placed, def, item.rotation);
      placed
        .setSize(64, 64)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.removePlacement(item))
        .on('pointerover', () => this.showToast(`点击收回：${def.name}`));
    });
  }

  private refreshMaterialPanel(): void {
    this.materialPanel?.destroy();
    this.materialPanel = this.add.container(GAME_WIDTH - 218, 84).setDepth(905);

    if (!this.materialPanelExpanded) {
      const g = this.add.graphics();
      g.fillStyle(0x0b3768, 0.62);
      g.fillRoundedRect(0, 0, 194, 34, 8);
      g.lineStyle(2, 0xffffff, 0.46);
      g.strokeRoundedRect(0, 0, 194, 34, 8);
      const label = this.add
        .text(97, 17, '家园材料', {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#fff4a8',
          stroke: '#1b1b3a',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      const hit = this.add
        .zone(97, 17, 194, 34)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.materialPanelExpanded = true;
          this.refreshMaterialPanel();
        });
      this.materialPanel.add([g, label, hit]);
      return;
    }

    const panelHeight = 48 + HOME_MATERIALS.length * 17;
    const g = this.add.graphics();
    g.fillStyle(0x0b3768, 0.58);
    g.fillRoundedRect(0, 0, 202, panelHeight, 8);
    g.lineStyle(2, 0xffffff, 0.42);
    g.strokeRoundedRect(0, 0, 202, panelHeight, 8);
    this.materialPanel.add(g);
    this.materialPanel.add(
      this.add.text(14, 10, '家园材料', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 3,
      }),
    );
    const collapse = this.add
      .text(176, 10, '收起', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0);
    const collapseHit = this.add
      .zone(176, 18, 48, 28)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        this.materialPanelExpanded = false;
        this.refreshMaterialPanel();
      });
    this.materialPanel.add([collapse, collapseHit]);

    HOME_MATERIALS.forEach((item, index) => {
      const count = PlayerState.getItemCount(item.id);
      const y = 38 + index * 17;
      this.materialPanel?.add(
        this.add.text(14, y, `${item.label} x${count}`, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '13px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 3,
        }),
      );
    });
  }

  private refreshFurniturePanel(): void {
    this.panel?.destroy();
    this.panel = this.add.container(0, 0).setDepth(920);
    if (!this.furniturePanelOpen) {
      return;
    }

    const g = this.add.graphics();
    g.fillStyle(0xfffbdf, 0.96);
    g.fillRoundedRect(116, 478, 728, 130, 8);
    g.lineStyle(3, 0x2d91c8, 0.95);
    g.strokeRoundedRect(116, 478, 728, 130, 8);
    g.fillStyle(0x67c6ee, 0.92);
    g.fillRoundedRect(132, 492, 154, 34, 8);
    this.panel.add(g);
    this.panel.add(
      this.add.text(148, 499, '家具库', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#15426d',
        strokeThickness: 3,
      }),
    );

    const availableItems = this.ownedFurniture();
    const pageCount = Math.max(1, Math.ceil(availableItems.length / FURNITURE_PER_PAGE));
    this.furniturePage = Phaser.Math.Clamp(this.furniturePage, 0, pageCount - 1);
    const pageItems = availableItems.slice(
      this.furniturePage * FURNITURE_PER_PAGE,
      this.furniturePage * FURNITURE_PER_PAGE + FURNITURE_PER_PAGE,
    );

    if (availableItems.length === 0) {
      this.panel.add(
        this.add.text(316, 500, '还没有家具，先领取一套小屋基础装扮。', {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#325d6b',
        }),
      );
      this.createPanelButton(712, 510, '领取装扮', () => this.claimStarterKit());
      return;
    }

    pageItems.forEach((item, index) => this.drawFurnitureChip(item, 146 + index * 108, 552));
    this.createPanelButton(738, 510, '上一页', () => {
      this.furniturePage = Math.max(0, this.furniturePage - 1);
      this.refreshFurniturePanel();
    });
    this.createPanelButton(808, 510, `${this.furniturePage + 1}/${pageCount}`, () => {
      this.furniturePage = Math.min(pageCount - 1, this.furniturePage + 1);
      this.refreshFurniturePanel();
    });
    this.createPanelButton(806, 588, '清空', () => {
      PlayerState.setHomeLayout([]);
      this.scene.restart({ fromScene: this.fromScene });
    });
  }

  private drawFurnitureChip(item: ItemDefinition, x: number, y: number): void {
    const available = this.availableCount(item.id);
    const selected = this.selectedItemId === item.id;
    const chip = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(selected ? 0xfff4a8 : 0xe8fbff, 0.98);
    g.lineStyle(2, selected ? 0xff9f2f : 0x63b9d2, 0.9);
    g.fillRoundedRect(-44, -26, 88, 52, 8);
    g.strokeRoundedRect(-44, -26, 88, 52, 8);
    g.fillStyle(item.iconColor, 1);
    g.fillCircle(-24, -4, 12);
    chip.add(g);
    chip.add(
      this.add
        .text(2, -11, item.name, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '12px',
          color: '#325d6b',
          align: 'center',
          wordWrap: { width: 54 },
        })
        .setOrigin(0.5),
    );
    chip.add(
      this.add
        .text(28, 15, `${available}`, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '12px',
          color: '#174a6b',
        })
        .setOrigin(0.5),
    );
    chip
      .setSize(88, 52)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        this.selectedItemId = item.id;
        this.placeSelectedFurniture();
      });
    this.panel?.add(chip);
  }

  private placeSelectedFurniture(): void {
    if (!this.selectedItemId) return;
    if (this.availableCount(this.selectedItemId) <= 0) {
      this.showToast('这件家具已经全部摆出来了。');
      return;
    }
    const layout = [...PlayerState.getHomeLayout()]
      .filter((item) => item.gridX >= 0 && item.gridX < DECOR_ANCHORS.length)
      .slice(0, DECOR_ANCHORS.length);
    if (layout.length >= DECOR_ANCHORS.length) {
      this.showToast('小屋里已经摆满了，先收回一件家具。');
      return;
    }
    const used = new Set(layout.map((item) => item.gridX));
    const slot = DECOR_ANCHORS.findIndex((_anchor, index) => !used.has(index));
    layout.push({
      itemId: this.selectedItemId,
      gridX: Math.max(0, slot),
      gridY: 0,
      rotation: 0,
    });
    PlayerState.setHomeLayout(layout);
    this.scene.restart({ fromScene: this.fromScene });
  }

  private removePlacement(target: FurniturePlacement): void {
    const next = PlayerState.getHomeLayout().filter(
      (item) =>
        item.itemId !== target.itemId ||
        item.gridX !== target.gridX ||
        item.gridY !== target.gridY ||
        item.rotation !== target.rotation,
    );
    PlayerState.setHomeLayout(next);
    this.scene.restart({ fromScene: this.fromScene });
  }

  private drawFurnitureArt(
    container: Phaser.GameObjects.Container,
    def: ItemDefinition,
    rotation: FurnitureRotation,
  ): void {
    const g = this.add.graphics();
    const c = def.iconColor;
    const outline = 0x1b1b3a;
    g.lineStyle(2, outline, 0.72);
    if (def.id.startsWith('sofa')) {
      g.fillStyle(c, 0.96);
      g.fillRoundedRect(-26, -14, 52, 30, 8);
      g.fillRoundedRect(-30, 2, 60, 19, 8);
      g.strokeRoundedRect(-30, 2, 60, 19, 8);
    } else if (def.id.startsWith('table')) {
      g.fillStyle(c, 0.96);
      g.fillEllipse(0, -2, 54, 30);
      g.strokeEllipse(0, -2, 54, 30);
      g.lineBetween(-12, 10, -18, 26);
      g.lineBetween(12, 10, 18, 26);
    } else if (def.id.startsWith('bed')) {
      g.fillStyle(c, 0.96);
      g.fillRoundedRect(-30, -18, 60, 42, 8);
      g.strokeRoundedRect(-30, -18, 60, 42, 8);
      g.fillStyle(0xffffff, 0.9);
      g.fillRoundedRect(-24, -14, 20, 16, 5);
    } else if (def.id.startsWith('plant')) {
      g.fillStyle(0x9a6232, 1);
      g.fillRoundedRect(-13, 8, 26, 19, 5);
      g.fillStyle(c, 1);
      g.fillCircle(-11, -2, 14);
      g.fillCircle(8, -7, 16);
      g.fillCircle(2, 5, 13);
    } else if (def.id.startsWith('lamp')) {
      g.lineStyle(4, 0x6b4a2d, 1);
      g.lineBetween(0, -4, 0, 24);
      g.fillStyle(c, 1);
      g.fillCircle(0, -14, 19);
      g.lineStyle(2, outline, 0.65);
      g.strokeCircle(0, -14, 19);
    } else if (def.id.startsWith('rug')) {
      g.fillStyle(c, 0.92);
      g.fillEllipse(0, 9, 62, 32);
      g.lineStyle(3, 0xffffff, 0.88);
      g.strokeEllipse(0, 9, 54, 24);
    } else if (def.id.startsWith('curtain')) {
      g.fillStyle(c, 0.94);
      g.fillRoundedRect(-26, -24, 22, 46, 5);
      g.fillRoundedRect(4, -24, 22, 46, 5);
      g.lineStyle(3, 0xffd93d, 1);
      g.lineBetween(-30, -24, 30, -24);
    } else if (def.id.startsWith('toy_chest')) {
      g.fillStyle(c, 1);
      g.fillRoundedRect(-26, -9, 52, 34, 5);
      g.strokeRoundedRect(-26, -9, 52, 34, 5);
      g.fillStyle(0xffd93d, 1);
      g.fillRect(-4, -9, 8, 34);
    } else if (def.id.startsWith('rainbow_arch')) {
      g.lineStyle(8, 0xff66cc, 1);
      g.beginPath();
      g.arc(0, 20, 30, Math.PI, 0);
      g.strokePath();
      g.lineStyle(5, 0xffd93d, 1);
      g.beginPath();
      g.arc(0, 20, 21, Math.PI, 0);
      g.strokePath();
    } else {
      g.fillStyle(c, 0.94);
      g.fillRoundedRect(-26, -21, 52, 42, 8);
      g.strokeRoundedRect(-26, -21, 52, 42, 8);
      g.fillStyle(0xffffff, 0.28);
      g.fillRoundedRect(-18, -14, 36, 10, 5);
    }
    container.add(g);
    container.setRotation(Phaser.Math.DegToRad(rotation));
  }

  private openFarmPanel(): void {
    this.farmPanel?.destroy();
    this.farmPanel = this.add.container(0, 0).setDepth(940);

    const shade = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x062f5c, 0.42)
      .setOrigin(0)
      .setInteractive();
    const card = this.add.graphics();
    card.fillStyle(0xfffbdf, 0.98);
    card.fillRoundedRect(88, 86, 784, 468, 8);
    card.lineStyle(3, 0x2d91c8, 0.95);
    card.strokeRoundedRect(88, 86, 784, 468, 8);
    card.fillStyle(0x67c6ee, 0.96);
    card.fillRoundedRect(108, 104, 744, 48, 8);
    this.farmPanel.add([shade, card]);

    this.farmPanel.add(
      this.add.text(130, 114, '家园农场', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        stroke: '#15426d',
        strokeThickness: 4,
      }),
    );
    this.farmPanel.add(
      this.add.text(332, 122, '播种、浇水、成熟后收获元素果实，也可以让首发精灵帮工。', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#15426d',
        strokeThickness: 3,
      }),
    );

    if (this.textures.exists('home_farm_panel')) {
      const image = this.add
        .image(296, 332, 'home_farm_panel')
        .setDisplaySize(320, 250)
        .setCrop(0, 0, 1280, 900);
      this.farmPanel.add(image);
    }

    const seedCount = PlayerState.getItemCount('energy_seed');
    const state = this.readFarmState();
    this.farmPanel.add(
      this.add.text(476, 172, `能量种子 x${seedCount}`, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#325d6b',
      }),
    );

    state.plots.forEach((plot, index) => {
      this.drawFarmPlot(index, plot, 468 + (index % 3) * 118, 234 + Math.floor(index / 3) * 112);
    });

    this.createFarmButton(196, 496, '领取两颗种子', () => this.claimFarmSeeds());
    this.createFarmButton(368, 496, '精灵帮工', () => this.claimFarmHelper());
    this.createFarmButton(776, 120, '关闭', () => this.closeFarmPanel(), 86);
  }

  private closeFarmPanel(): void {
    this.farmPanel?.destroy();
    this.farmPanel = null;
  }

  private drawFarmPlot(index: number, plot: FarmPlotState, x: number, y: number): void {
    const crop = FARM_CROPS.find((entry) => entry.id === plot.cropId);
    const ready = this.isFarmPlotReady(plot);
    const elapsed = plot.plantedAt ? Date.now() - plot.plantedAt : 0;
    const progress = Math.max(0, Math.min(1, elapsed / FARM_GROW_MS));
    const container = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x8b5a2b, 1);
    g.fillRoundedRect(-46, -34, 92, 68, 8);
    g.lineStyle(2, ready ? 0xffd93d : 0xffffff, ready ? 1 : 0.7);
    g.strokeRoundedRect(-46, -34, 92, 68, 8);
    g.fillStyle(0x5f3a1e, 0.5);
    g.fillRect(-34, -20, 68, 6);
    g.fillRect(-34, -2, 68, 6);
    g.fillRect(-34, 16, 68, 6);
    if (crop) {
      g.fillStyle(crop.color, 0.96);
      g.fillCircle(-8, -8, 12 + progress * 8);
      g.fillCircle(12, 6, 10 + progress * 7);
      g.fillStyle(0x2f8f45, 1);
      g.fillEllipse(0, 16, 30, 12);
    }
    container.add(g);
    container.add(
      this.add
        .text(0, -52, crop ? crop.name : '空地', {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '14px',
          color: '#325d6b',
        })
        .setOrigin(0.5),
    );
    const label = crop ? (ready ? '收获' : plot.watered ? '等待' : '浇水') : '播种';
    const action = crop
      ? ready
        ? () => this.harvestFarmPlot(index)
        : () => this.waterFarmPlot(index)
      : () => this.plantFarmPlot(index);
    container.setSize(100, 92).setInteractive({ useHandCursor: true }).on('pointerup', action);
    this.farmPanel?.add(container);
    this.createFarmButton(x, y + 52, label, action, 74);
  }

  private plantFarmPlot(index: number): void {
    if (PlayerState.getItemCount('energy_seed') < 1) {
      this.showToast('需要能量种子才能播种，先领取种子或收集能量花盆。');
      return;
    }
    const state = this.readFarmState();
    if (state.plots[index]?.cropId) return;
    if (!PlayerState.removeItem('energy_seed', 1)) return;
    const crop = Phaser.Utils.Array.GetRandom([...FARM_CROPS]) ?? FARM_CROPS[0];
    const plots = [...state.plots];
    plots[index] = { cropId: crop.id, plantedAt: Date.now(), watered: false };
    this.writeFarmState({ ...state, plots });
    this.refreshMaterialPanel();
    this.openFarmPanel();
    this.showToast(`种下了${crop.name}，稍后成熟。`);
  }

  private waterFarmPlot(index: number): void {
    const state = this.readFarmState();
    const plot = state.plots[index];
    if (!plot?.cropId || this.isFarmPlotReady(plot)) return;
    if (plot.watered) {
      this.showToast('这块地已经浇过水了，等它成熟吧。');
      return;
    }
    const plots = [...state.plots];
    plots[index] = {
      ...plot,
      plantedAt: (plot.plantedAt ?? Date.now()) - FARM_GROW_MS * 0.55,
      watered: true,
    };
    this.writeFarmState({ ...state, plots });
    this.openFarmPanel();
    this.showToast('浇水完成，作物成长速度加快。');
  }

  private harvestFarmPlot(index: number): void {
    const state = this.readFarmState();
    const plot = state.plots[index];
    if (!plot?.cropId || !this.isFarmPlotReady(plot)) {
      this.showToast('作物还没有成熟。');
      return;
    }
    const crop = FARM_CROPS.find((entry) => entry.id === plot.cropId) ?? FARM_CROPS[0];
    PlayerState.addItem(crop.rewardItemId, 1);
    if (Math.random() < 0.35) PlayerState.addItem('exp_candy', 1);
    PlayerState.addCoins(Phaser.Math.Between(24, 48));
    const plots = [...state.plots];
    plots[index] = {};
    this.writeFarmState({ ...state, plots });
    this.refreshMaterialPanel();
    this.openFarmPanel();
    this.showToast(`收获了${crop.name}，奖励已放入背包。`);
  }

  private claimFarmSeeds(): void {
    this.claimDailyReward('farm-seeds', {
      coins: 20,
      items: [{ itemId: 'energy_seed', quantity: 2 }],
      success: '农场今日种子已领取，可以开始播种了。',
      claimed: '今天已经领过农场种子了。',
    });
    this.openFarmPanel();
  }

  private claimFarmHelper(): void {
    const state = this.readFarmState();
    if (state.helperDate === todayKey()) {
      this.showToast('今天已经安排过精灵帮工了。');
      return;
    }
    const helper = PlayerState.snapshot().playerPets[0];
    if (!helper) {
      this.showToast('需要一只首发精灵才能帮工。');
      return;
    }
    PlayerState.gainExp(playerPetKey(helper), 160);
    PlayerState.addCoins(80);
    PlayerState.addItem('exp_candy', 1);
    this.writeFarmState({ ...state, helperDate: todayKey() });
    this.openFarmPanel();
    this.showToast('首发精灵完成农场帮工，获得经验糖和金币。');
  }

  private readFarmState(): FarmState {
    try {
      const raw = globalThis.localStorage?.getItem(FARM_SAVE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<FarmState>) : {};
      const source = Array.isArray(parsed.plots) ? parsed.plots : [];
      const helperDate = typeof parsed.helperDate === 'string' ? parsed.helperDate : undefined;
      return {
        plots: Array.from({ length: FARM_PLOT_COUNT }, (_unused, index) => {
          const plot = source[index];
          return plot && typeof plot === 'object' ? { ...plot } : {};
        }),
        ...(helperDate ? { helperDate } : {}),
      };
    } catch {
      return { plots: Array.from({ length: FARM_PLOT_COUNT }, () => ({})) };
    }
  }

  private writeFarmState(state: FarmState): void {
    try {
      globalThis.localStorage?.setItem(FARM_SAVE_KEY, JSON.stringify(state));
    } catch {
      // Ignore private browsing storage failures.
    }
  }

  private isFarmPlotReady(plot: FarmPlotState): boolean {
    return Boolean(plot.cropId && plot.plantedAt && Date.now() - plot.plantedAt >= FARM_GROW_MS);
  }

  private createFarmButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    width = 132,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(0xff9f2f, 0.98);
    g.lineStyle(2, 0xffffff, 1);
    g.fillRoundedRect(x - width / 2, y - 16, width, 32, 7);
    g.strokeRoundedRect(x - width / 2, y - 16, width, 32, 7);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: label.length > 5 ? '13px' : '14px',
        color: '#ffffff',
        stroke: '#8a4a00',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const hit = this.add
      .zone(x, y, width, 32)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
    this.farmPanel?.add([g, text, hit]);
  }

  private openHatcheryPanel(): void {
    this.hatcheryPanel?.destroy();
    this.hatcheryPanel = this.add.container(0, 0).setDepth(950);

    const shade = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x062f5c, 0.42)
      .setOrigin(0)
      .setInteractive();
    const card = this.add.graphics();
    card.fillStyle(0xf5fbff, 0.98);
    card.fillRoundedRect(96, 92, 768, 438, 8);
    card.lineStyle(3, 0x7b7bff, 0.95);
    card.strokeRoundedRect(96, 92, 768, 438, 8);
    card.fillStyle(0x7b7bff, 0.95);
    card.fillRoundedRect(116, 110, 728, 50, 8);
    this.hatcheryPanel.add([shade, card]);

    this.hatcheryPanel.add(
      this.add.text(136, 120, '精灵培育舱', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        stroke: '#25306f',
        strokeThickness: 4,
      }),
    );
    this.hatcheryPanel.add(
      this.add.text(344, 126, '把彩虹精灵蛋放入培育舱，完成照料后孵化新伙伴。', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#25306f',
        strokeThickness: 3,
      }),
    );

    if (this.textures.exists('object_pet_incubator')) {
      this.hatcheryPanel.add(
        this.add.image(282, 338, 'object_pet_incubator').setDisplaySize(278, 278),
      );
    }
    if (this.textures.exists('item_rainbow_pet_egg')) {
      this.hatcheryPanel.add(
        this.add.image(482, 214, 'item_rainbow_pet_egg').setDisplaySize(74, 74),
      );
    }

    const state = this.readHatcheryState();
    const eggCount = PlayerState.getItemCount('rainbow_pet_egg');
    const seedCount = PlayerState.getItemCount('potential_seed');
    const progress = hatcheryCareProgress(state);

    this.hatcheryPanel.add(
      this.add.text(438, 182, `彩虹精灵蛋 x${eggCount}    潜能星砂 x${seedCount}`, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#315075',
      }),
    );

    const statusText = state.active
      ? `照料进度 ${progress}/${HATCHERY_REQUIRED_CARE}${state.boosted ? '  |  已加入星砂' : ''}`
      : '培育舱空闲：先完成“精灵培育屋”活动获得彩虹精灵蛋。';
    this.hatcheryPanel.add(
      this.add.text(438, 242, statusText, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#315075',
        wordWrap: { width: 354 },
      }),
    );

    if (!state.active) {
      this.createHatcheryButton(554, 316, '放入精灵蛋', eggCount <= 0, () => this.startHomeEgg());
    } else {
      HATCHERY_CARE_ACTIONS.forEach((action, index) => {
        const used = state.careActions.includes(action.id);
        const x = 474 + (index % 2) * 154;
        const y = 310 + Math.floor(index / 2) * 50;
        this.createHatcheryButton(x, y, used ? '已完成' : action.label, used, () =>
          this.careHomeEgg(action.id),
        );
      });
      this.createHatcheryButton(
        474,
        422,
        state.boosted ? '已加星砂' : '加入星砂',
        state.boosted || seedCount <= 0,
        () => this.boostHomeEgg(),
      );
      this.createHatcheryButton(628, 422, '立即孵化', !canHatchEgg(state), () =>
        this.hatchHomeEgg(),
      );
    }

    this.createHatcheryButton(792, 128, '关闭', false, () => this.closeHatcheryPanel(), 86);
  }

  private closeHatcheryPanel(): void {
    this.hatcheryPanel?.destroy();
    this.hatcheryPanel = null;
  }

  private startHomeEgg(): void {
    if (PlayerState.getItemCount('rainbow_pet_egg') < 1) {
      this.showToast('需要彩虹精灵蛋，去活动广场完成“精灵培育屋”。');
      return;
    }
    if (!PlayerState.removeItem('rainbow_pet_egg', 1)) return;
    const state = startHatcheryEgg(this.readHatcheryState());
    this.writeHatcheryState(state);
    this.refreshMaterialPanel();
    this.openHatcheryPanel();
    this.showToast('彩虹精灵蛋已经放入培育舱，开始照料吧。');
  }

  private careHomeEgg(actionId: HatcheryCareAction): void {
    const action = HATCHERY_CARE_ACTIONS.find((entry) => entry.id === actionId);
    const state = this.readHatcheryState();
    const next = applyHatcheryCare(state, actionId);
    if (next === state) {
      this.showToast('这个照料步骤已经完成了。');
      return;
    }
    this.writeHatcheryState(next);
    this.openHatcheryPanel();
    this.showToast(action?.detail ?? '照料完成。');
  }

  private boostHomeEgg(): void {
    const state = this.readHatcheryState();
    if (!state.active || state.boosted) return;
    if (PlayerState.getItemCount('potential_seed') < 1) {
      this.showToast('需要潜能星砂才能提升孵化品质。');
      return;
    }
    if (!PlayerState.removeItem('potential_seed', 1)) return;
    this.writeHatcheryState(boostHatcheryEgg(state));
    this.refreshMaterialPanel();
    this.openHatcheryPanel();
    this.showToast('星砂融入蛋壳，稀有精灵和更高等级的概率提升了。');
  }

  private hatchHomeEgg(): void {
    const state = this.readHatcheryState();
    if (!canHatchEgg(state)) {
      this.showToast('至少完成 3 个照料步骤后才能孵化。');
      return;
    }
    const result = rollHatchedPet(state);
    const pet = getPet(result.petId);
    if (!pet) {
      this.writeHatcheryState(finishHatcheryCycle(state));
      this.showToast('培育记录异常，精灵蛋能量已经归档。');
      return;
    }

    const placement = PlayerState.addPlayerPet(createPlayerPet(pet, result.level));
    this.writeHatcheryState(finishHatcheryCycle(state));
    gameEvents.emit('pet:hatch', { petId: pet.id });
    this.refreshMaterialPanel();
    this.openHatcheryPanel();
    this.showToast(
      `${pet.name} Lv${result.level} 孵化成功，已进入${placement === 'party' ? '队伍' : '仓库'}。`,
    );
  }

  private readHatcheryState(): HatcheryState {
    try {
      const raw = globalThis.localStorage?.getItem(HATCHERY_SAVE_KEY);
      return normalizeHatcheryState(raw ? JSON.parse(raw) : undefined);
    } catch {
      return defaultHatcheryState();
    }
  }

  private writeHatcheryState(state: HatcheryState): void {
    try {
      globalThis.localStorage?.setItem(HATCHERY_SAVE_KEY, JSON.stringify(state));
    } catch {
      // Ignore private browsing storage failures.
    }
  }

  private createHatcheryButton(
    x: number,
    y: number,
    label: string,
    disabled: boolean,
    onClick: () => void,
    width = 132,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(disabled ? 0x9eb5c6 : 0xff9f2f, disabled ? 0.78 : 0.98);
    g.lineStyle(2, 0xffffff, 1);
    g.fillRoundedRect(x - width / 2, y - 17, width, 34, 7);
    g.strokeRoundedRect(x - width / 2, y - 17, width, 34, 7);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: label.length > 5 ? '13px' : '14px',
        color: '#ffffff',
        stroke: disabled ? '#52677a' : '#8a4a00',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.hatcheryPanel?.add([g, text]);
    if (disabled) return;
    const hit = this.add
      .zone(x, y, width, 34)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
    this.hatcheryPanel?.add(hit);
  }

  private restAtHome(): void {
    const pets = [...PlayerState.snapshot().playerPets, ...PlayerState.getPetStorage()];
    pets.forEach((pet) => PlayerState.healPet(playerPetKey(pet)));
    this.showToast('小屋休息完成，队伍和仓库里的精灵都恢复了。');
  }

  private tendGardenPlot(): void {
    const fruitId = Phaser.Utils.Array.GetRandom([...GARDEN_FRUITS]) ?? 'element_fruit_grass';
    const fruitName = getItem(fruitId)?.name ?? '元素果实';
    this.claimDailyReward('garden-plot', {
      coins: 35,
      costItems: [{ itemId: 'energy_seed', quantity: 1 }],
      items: [{ itemId: fruitId, quantity: 1 }],
      success: `能源种子发芽了，收获 ${fruitName} 和彩虹币。`,
      claimed: '今天的种植盆已经照料过了。',
      missing: '需要 1 颗能源种子才能种植。',
    });
  }

  private openAngelChest(): void {
    if (PlayerState.getItemCount('angel_chest') <= 0) {
      this.claimDailyReward('toy-chest', {
        coins: 40,
        items: [
          { itemId: 'angel_chest', quantity: 1 },
          { itemId: 'pokeball_great', quantity: 1 },
        ],
        success: '今天的小屋宝箱送来 1 个天使宝箱和高级精灵球。',
        claimed: '背包里没有天使宝箱，今天的小屋宝箱也已经开过了。',
      });
      return;
    }

    const rewards = [
      {
        message: '天使宝箱开出了超级精灵球和中伤药。',
        coins: 20,
        items: [
          { itemId: 'pokeball_ultra', quantity: 1 },
          { itemId: 'potion_medium', quantity: 1 },
        ],
      },
      {
        message: '天使宝箱开出了彩虹果和经验糖。',
        coins: 30,
        items: [
          { itemId: 'element_fruit_light', quantity: 1 },
          { itemId: 'exp_candy', quantity: 1 },
        ],
      },
      {
        message: '天使宝箱开出了彩虹壁纸和金贝壳。',
        coins: 25,
        items: [
          { itemId: 'wallpaper_rainbow', quantity: 1 },
          { itemId: 'gold_shell', quantity: 1 },
        ],
      },
    ] as const;
    const picked = Phaser.Utils.Array.GetRandom([...rewards]) ?? rewards[0];
    if (!PlayerState.removeItem('angel_chest', 1)) return;
    if (picked.coins) PlayerState.addCoins(picked.coins);
    picked.items.forEach((item) => PlayerState.addItem(item.itemId, item.quantity));
    this.refreshMaterialPanel();
    this.showToast(picked.message);
  }

  private purifyLegacyDoll(): void {
    const owned = new Set([
      ...PlayerState.snapshot().playerPets.map((pet) => pet.petId),
      ...PlayerState.getPetStorage().map((pet) => pet.petId),
    ]);
    const nextPetId = LEGACY_DOLL_PURIFY_ORDER.find((petId) => !owned.has(petId));
    if (!nextPetId) {
      this.showToast('当前可净化的旧版玩偶都已经加入你的精灵仓库了。');
      return;
    }
    if (PlayerState.getItemCount('crystal_shard') < 2) {
      this.showToast('净化旧版玩偶需要 2 个净化水晶。');
      return;
    }
    if (!PlayerState.removeItem('crystal_shard', 2)) return;

    PlayerState.addPet(nextPetId);
    const pet = getPet(nextPetId);
    const inParty = PlayerState.snapshot().playerPets.some(
      (ownedPet) => ownedPet.petId === nextPetId,
    );
    this.refreshMaterialPanel();
    this.showToast(
      `${pet?.name ?? '旧版玩偶'} 净化成功，已经进入${inParty ? '队伍' : '精灵仓库'}。`,
    );
  }

  private claimBuildReward(): void {
    const placedCount = PlayerState.getHomeLayout().length;
    if (placedCount < 3) {
      this.showToast('共建小屋至少摆放 3 件家具后可以领取奖励。');
      return;
    }
    this.claimDailyReward('build-book', {
      coins: Math.min(180, placedCount * 25),
      items: [
        { itemId: 'gold_shell', quantity: 1 },
        { itemId: 'exp_candy', quantity: 1 },
      ],
      success: '共建小屋进度已记录，奖励已经放进背包。',
      claimed: '今天已经领取过共建小屋奖励了。',
    });
  }

  private claimDailyReward(
    id: string,
    reward: {
      readonly coins?: number;
      readonly costItems?: ReadonlyArray<{ readonly itemId: string; readonly quantity: number }>;
      readonly items?: ReadonlyArray<{ readonly itemId: string; readonly quantity: number }>;
      readonly success: string;
      readonly claimed: string;
      readonly missing?: string;
    },
  ): void {
    const claimed = this.readHomeRewardsToday();
    if (claimed.has(id)) {
      this.showToast(reward.claimed);
      return;
    }
    for (const item of reward.costItems ?? []) {
      if (PlayerState.getItemCount(item.itemId) < item.quantity) {
        this.showToast(reward.missing ?? '材料还不够。');
        return;
      }
    }
    for (const item of reward.costItems ?? []) {
      PlayerState.removeItem(item.itemId, item.quantity);
    }
    if (reward.coins) PlayerState.addCoins(reward.coins);
    for (const item of reward.items ?? []) {
      PlayerState.addItem(item.itemId, item.quantity);
    }
    claimed.add(id);
    this.writeHomeRewardsToday(claimed);
    this.refreshMaterialPanel();
    this.showToast(reward.success);
  }

  private readHomeRewardsToday(): Set<string> {
    try {
      const raw = globalThis.localStorage?.getItem(HOME_REWARD_SAVE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as { date?: string; claimedIds?: string[] };
      if (parsed.date !== todayKey() || !Array.isArray(parsed.claimedIds)) return new Set();
      return new Set(parsed.claimedIds.filter((id) => typeof id === 'string'));
    } catch {
      return new Set();
    }
  }

  private writeHomeRewardsToday(claimed: Set<string>): void {
    try {
      globalThis.localStorage?.setItem(
        HOME_REWARD_SAVE_KEY,
        JSON.stringify({ date: todayKey(), claimedIds: [...claimed] }),
      );
    } catch {
      // Ignore private browsing storage failures.
    }
  }

  private claimStarterKit(): void {
    if (this.ownedFurniture().length > 0 || PlayerState.getHomeLayout().length > 0) {
      this.showToast('已经有家具了。');
      return;
    }
    for (const id of STARTER_HOME_KIT) {
      PlayerState.addItem(id, 1);
    }
    this.showToast('基础家具已经放进库存。');
    this.refreshFurniturePanel();
  }

  private ownedFurniture(): ItemDefinition[] {
    return itemsByKind('furniture').filter((item) => PlayerState.getItemCount(item.id) > 0);
  }

  private availableCount(itemId: string): number {
    const owned = PlayerState.getItemCount(itemId);
    const placed = PlayerState.getHomeLayout().filter((item) => item.itemId === itemId).length;
    return Math.max(0, owned - placed);
  }

  private createTopButton(x: number, y: number, label: string, onClick: () => void): void {
    createNavIconButton(this, {
      x,
      y,
      label,
      onClick,
      depth: 902,
      width: label.length >= 3 ? 78 : 66,
      height: 50,
    });
  }

  private createPanelButton(x: number, y: number, label: string, onClick: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(0xff9f2f, 0.98);
    g.lineStyle(2, 0xffffff, 1);
    g.fillRoundedRect(x - 46, y - 15, 92, 30, 6);
    g.strokeRoundedRect(x - 46, y - 15, 92, 30, 6);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#8a4a00',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const hit = this.add
      .zone(x, y, 92, 30)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
    this.panel?.add([g, text, hit]);
  }

  private showToast(message: string): void {
    this.clearToast();
    this.toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 36, message, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '19px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.toastTimer = this.time.delayedCall(1800, () => {
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

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function playerPetKey(owned: PlayerPet): string {
  return owned.instanceId ?? owned.petId;
}

function homeHotspotTexture(id: string): string | null {
  void id;
  return null;
}
