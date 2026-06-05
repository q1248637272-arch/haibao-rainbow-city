import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import {
  FARM_CROPS,
  FARM_GROW_MS,
  canSubmitFarmOrder,
  currentFarmOrder,
  farmPlotProgress,
  farmOrderReward,
  formatFarmOrderRequirement,
  getFarmCrop,
  isFarmPlotReady,
  randomFarmCrop,
  readFarmState,
  todayKey,
  writeFarmState,
  type FarmCropDefinition,
  type FarmPlotState,
} from '@/systems/HomeFarm';
import { AudioManager } from '@/systems/AudioManager';
import { gameEvents } from '@/systems/EventBus';
import { findPixelPath, type PixelPoint } from '@/systems/PixelPathfinding';
import { PlayerState } from '@/systems/PlayerState';
import { preloadFarmAssets } from '@/systems/SceneAssetPreloader';
import { createNavIconButton } from '@/ui/NavIconButton';
import {
  currentPlayerSheetKey,
  currentPlayerWalkAnimKey,
  ensureCurrentPlayerWalkAnimation,
} from '@/utils/playerAvatar';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';
import type { PlayerPet } from '@/types';

const PLAYER_SPEED = 176;
const PLAYER_START = { x: 480, y: 548 } as const;
const FARM_WALK_AREA = { left: 72, right: 888, top: 178, bottom: 586 } as const;
const FARM_WALK_RECTS = [
  { left: 190, right: 820, top: 176, bottom: 248 },
  { left: 104, right: 852, top: 320, bottom: 388 },
  { left: 96, right: 852, top: 464, bottom: 584 },
  { left: 88, right: 202, top: 244, bottom: 520 },
  { left: 316, right: 388, top: 220, bottom: 520 },
  { left: 540, right: 606, top: 220, bottom: 520 },
  { left: 760, right: 874, top: 244, bottom: 520 },
  { left: 408, right: 552, top: 510, bottom: 586 },
] as const;
const FARM_WALK_ELLIPSES = [
  { x: 480, y: 548, rx: 155, ry: 62 },
  { x: 276, y: 210, rx: 132, ry: 68 },
  { x: 784, y: 204, rx: 112, ry: 66 },
  { x: 836, y: 464, rx: 104, ry: 72 },
] as const;
const FARM_BLOCK_RECTS = [
  { left: 134, right: 338, top: 236, bottom: 336 },
  { left: 372, right: 576, top: 236, bottom: 338 },
  { left: 606, right: 810, top: 236, bottom: 338 },
  { left: 56, right: 276, top: 354, bottom: 462 },
  { left: 364, right: 584, top: 354, bottom: 464 },
  { left: 600, right: 820, top: 354, bottom: 462 },
] as const;

interface FarmPlotAnchor {
  readonly index: number;
  readonly walkX: number;
  readonly walkY: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

const FARM_PLOT_ANCHORS: readonly FarmPlotAnchor[] = [
  {
    index: 0,
    walkX: 236,
    walkY: 350,
    sourceX: 412,
    sourceY: 266,
    sourceWidth: 270,
    sourceHeight: 132,
  },
  {
    index: 1,
    walkX: 474,
    walkY: 350,
    sourceX: 704,
    sourceY: 266,
    sourceWidth: 314,
    sourceHeight: 132,
  },
  {
    index: 2,
    walkX: 708,
    walkY: 350,
    sourceX: 1052,
    sourceY: 266,
    sourceWidth: 314,
    sourceHeight: 132,
  },
  {
    index: 3,
    walkX: 218,
    walkY: 508,
    sourceX: 320,
    sourceY: 440,
    sourceWidth: 330,
    sourceHeight: 142,
  },
  {
    index: 4,
    walkX: 474,
    walkY: 508,
    sourceX: 696,
    sourceY: 438,
    sourceWidth: 330,
    sourceHeight: 145,
  },
  {
    index: 5,
    walkX: 710,
    walkY: 508,
    sourceX: 1076,
    sourceY: 440,
    sourceWidth: 330,
    sourceHeight: 142,
  },
] as const;

interface FarmStation {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly walkX: number;
  readonly walkY: number;
  readonly radius: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly color: number;
  readonly action: () => void;
}

interface FarmWorldBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export class FarmScene extends Phaser.Scene {
  private fromScene: string = SceneKey.WORLD;
  private farmMapStage: Phaser.GameObjects.Image | null = null;
  private fieldLayer: Phaser.GameObjects.Container | null = null;
  private stationLayer: Phaser.GameObjects.Container | null = null;
  private statusPanel: Phaser.GameObjects.Container | null = null;
  private boardPanel: Phaser.GameObjects.Container | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private pointerHandled = false;
  private progressRefreshAt = 0;
  private moveTarget: {
    readonly x: number;
    readonly y: number;
    readonly action?: () => void;
    readonly triggerRadius?: number;
    readonly path?: PixelPoint[];
  } | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: {
    readonly W: Phaser.Input.Keyboard.Key;
    readonly A: Phaser.Input.Keyboard.Key;
    readonly S: Phaser.Input.Keyboard.Key;
    readonly D: Phaser.Input.Keyboard.Key;
  } | null = null;

  public constructor() {
    super({ key: SceneKey.FARM });
  }

  public init(data?: { readonly fromScene?: string }): void {
    this.fromScene = data?.fromScene ?? SceneKey.WORLD;
    this.moveTarget = null;
    this.pointerHandled = false;
    this.progressRefreshAt = 0;
  }

  public preload(): void {
    preloadFarmAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    gameEvents.emit('map:enter', { mapId: 'farm' });
    ensureCurrentPlayerWalkAnimation(this);
    this.drawFarmMap();
    this.setupPlayer();
    this.setupInput();
    this.drawStations();
    this.refreshFieldLayer();
    this.drawTopBar();
    this.showToast('欢迎来到家园农场：点击田地播种、浇水，成熟后收获。');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleFarmLayoutResize, this);
      this.fieldLayer?.destroy();
      this.stationLayer?.destroy();
      this.statusPanel?.destroy();
      this.boardPanel?.destroy();
      this.clearToast();
    });
    AudioManager.play('home', undefined, this);
  }

  public update(time: number, delta: number): void {
    const keyboardMoving = this.updateKeyboardMove(delta);
    this.updateClickMove(delta);
    this.updatePlayerVisual(Boolean(this.moveTarget) || keyboardMoving);
    if (time >= this.progressRefreshAt) {
      this.progressRefreshAt = time + 1400;
      this.refreshFieldLayer();
    }
  }

  private drawFarmMap(): void {
    const background = createResponsiveMapBackground(this, 'legacy_farm_walkable', {
      depth: 0,
      interactive: true,
      onPointerUp: (pointer: Phaser.Input.Pointer) => {
        if (this.pointerHandled) {
          this.pointerHandled = false;
          return;
        }
        this.walkToPoint(pointer.worldX, pointer.worldY);
      },
    });
    this.farmMapStage = background.stage;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleFarmLayoutResize, this);

    const vignette = this.add.graphics().setDepth(10);
    vignette.fillGradientStyle(0xffffff, 0xffffff, 0x004d80, 0x004d80, 0.02, 0.02, 0.18, 0.18);
    vignette.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  private handleFarmLayoutResize(): void {
    this.drawStations();
    this.refreshFieldLayer();
  }

  private drawTopBar(): void {
    const topBarWidth = Math.max(GAME_WIDTH, this.cameras.main.width);
    const titleX = Math.max(650, Math.min(topBarWidth / 2, topBarWidth - 250));
    this.add
      .rectangle(0, 0, topBarWidth, 74, 0x07345f, 0.72)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1800);
    this.add
      .text(titleX, 36, '海宝家园农场', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '27px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 5,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1801);

    const navButtons: ReadonlyArray<{ readonly label: string; readonly onClick: () => void }> = [
      { label: '家园', onClick: () => this.returnHome() },
      {
        label: '地图',
        onClick: () => this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.FARM }),
      },
      {
        label: '精灵',
        onClick: () => this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.FARM }),
      },
      {
        label: '背包',
        onClick: () => this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.FARM }),
      },
      {
        label: '存档',
        onClick: () => this.scene.start(SceneKey.SAVE_SLOTS, { fromScene: SceneKey.FARM }),
      },
      {
        label: '图鉴',
        onClick: () => this.scene.start(SceneKey.PET_DEX, { fromScene: SceneKey.FARM }),
      },
    ];
    navButtons.forEach((button, index) => {
      createNavIconButton(this, {
        x: 50 + index * 76,
        y: 38,
        label: button.label,
        depth: 1810,
        onClick: button.onClick,
      });
    });
  }

  private setupPlayer(): void {
    this.playerShadow = this.add
      .ellipse(PLAYER_START.x, PLAYER_START.y + 18, 48, 14, 0x000000, 0.27)
      .setDepth(650);
    this.player = this.add
      .sprite(PLAYER_START.x, PLAYER_START.y - 16, currentPlayerSheetKey(), 0)
      .setOrigin(0.5, 0.88)
      .setScale(0.68)
      .setDepth(690);
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

  private drawStations(): void {
    this.stationLayer?.destroy();
    this.stationLayer = this.add.container(0, 0).setDepth(760);
    const stations: readonly FarmStation[] = [
      {
        id: 'farm-house',
        label: '农舍账本',
        hint: '查看农场状态',
        walkX: 286,
        walkY: 222,
        radius: 42,
        sourceX: 500,
        sourceY: 60,
        sourceWidth: 260,
        sourceHeight: 185,
        color: 0xffd93d,
        action: () => this.openFarmBoard(),
      },
      {
        id: 'seed-crates',
        label: '种子仓库',
        hint: '每日领取种子',
        walkX: 176,
        walkY: 506,
        radius: 48,
        sourceX: 74,
        sourceY: 492,
        sourceWidth: 260,
        sourceHeight: 142,
        color: 0xff9f2f,
        action: () => this.claimFarmSeeds(),
      },
      {
        id: 'water-well',
        label: '灌溉井',
        hint: '一键浇水',
        walkX: 748,
        walkY: 226,
        radius: 42,
        sourceX: 1384,
        sourceY: 92,
        sourceWidth: 156,
        sourceHeight: 150,
        color: 0x54d6ff,
        action: () => this.waterAllPlots(),
      },
      {
        id: 'helper-lounge',
        label: '精灵帮工',
        hint: '首发精灵帮忙照料',
        walkX: 786,
        walkY: 468,
        radius: 44,
        sourceX: 1462,
        sourceY: 440,
        sourceWidth: 152,
        sourceHeight: 132,
        color: 0xff8ff0,
        action: () => this.claimFarmHelper(),
      },
      {
        id: 'home-portal',
        label: '返回家园',
        hint: '回到小屋',
        walkX: 480,
        walkY: 540,
        radius: 46,
        sourceX: 718,
        sourceY: 590,
        sourceWidth: 332,
        sourceHeight: 148,
        color: 0x98f8ff,
        action: () => this.returnHome(),
      },
    ];

    stations.forEach((station) => this.drawStation(station));
  }

  private drawStation(station: FarmStation): void {
    const layer = this.stationLayer;
    if (!layer) return;
    const box = this.sourceBoxToWorldBox(station);
    let hover: Phaser.GameObjects.Container | null = null;
    const clearHover = (): void => {
      if (hover?.active) hover.destroy();
      hover = null;
    };
    const hit = this.add
      .zone(box.x, box.y, box.width, box.height)
      .setDepth(1300)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        clearHover();
        hover = this.renderStationHover(station, box);
        layer.add(hover);
      })
      .on('pointerout', clearHover)
      .on('pointerup', () => {
        this.markPointerHandled();
        clearHover();
        this.walkToAction(station.walkX, station.walkY, station.action);
      });
    layer.add(hit);
  }

  private renderStationHover(station: FarmStation, box: FarmWorldBox): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(station.color, 0.16);
    g.fillRoundedRect(box.x - box.width / 2, box.y - box.height / 2, box.width, box.height, 14);
    g.lineStyle(3, station.color, 0.82);
    g.strokeRoundedRect(box.x - box.width / 2, box.y - box.height / 2, box.width, box.height, 14);
    g.lineStyle(1, 0xffffff, 0.72);
    g.strokeRoundedRect(
      box.x - box.width / 2 + 5,
      box.y - box.height / 2 + 5,
      box.width - 10,
      box.height - 10,
      12,
    );
    const labelY = Phaser.Math.Clamp(box.y - box.height / 2 - 18, 92, GAME_HEIGHT - 42);
    const hintY = Phaser.Math.Clamp(box.y + box.height / 2 + 18, 102, GAME_HEIGHT - 34);
    const camera = this.cameras.main;
    const labelX = Phaser.Math.Clamp(box.x, camera.scrollX + 86, camera.scrollX + camera.width - 86);
    container.add([
      g,
      this.createWorldLabel(labelX, labelY, station.label),
      this.createWorldPill(labelX, hintY, station.hint, 0x07345f),
    ]);
    return container;
  }

  private refreshFieldLayer(): void {
    this.fieldLayer?.destroy();
    this.fieldLayer = this.add.container(0, 0).setDepth(700);
    const state = readFarmState();
    FARM_PLOT_ANCHORS.forEach((anchor) => {
      const plot = state.plots[anchor.index] ?? {};
      this.drawFarmPlot(anchor, plot);
    });
  }

  private drawFarmPlot(anchor: FarmPlotAnchor, plot: FarmPlotState): void {
    const layer = this.fieldLayer;
    if (!layer) return;
    const box = this.sourceBoxToWorldBox(anchor);
    let hover: Phaser.GameObjects.Container | null = null;
    const clearHover = (): void => {
      if (hover?.active) hover.destroy();
      hover = null;
    };
    const hit = this.add
      .zone(box.x, box.y, box.width, box.height)
      .setDepth(1320)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        clearHover();
        hover = this.renderFarmPlotHover(anchor, box, plot);
        layer.add(hover);
      })
      .on('pointerout', clearHover)
      .on('pointerup', () => {
        this.markPointerHandled();
        clearHover();
        this.walkToAction(anchor.walkX, anchor.walkY, () => this.handlePlot(anchor.index));
      });
    layer.add(hit);
  }

  private renderFarmPlotHover(
    _anchor: FarmPlotAnchor,
    box: FarmWorldBox,
    plot: FarmPlotState,
  ): Phaser.GameObjects.Container {
    const crop = getFarmCrop(plot.cropId);
    const ready = isFarmPlotReady(plot);
    const progress = farmPlotProgress(plot);
    const container = this.add.container(box.x, box.y);
    const g = this.add.graphics();
    const baseColor = ready ? 0xffd93d : crop ? crop.color : 0xffffff;
    g.fillStyle(baseColor, ready ? 0.18 : 0.1);
    g.fillRoundedRect(-box.width / 2, -box.height / 2, box.width, box.height, 16);
    g.lineStyle(ready ? 4 : 3, baseColor, ready ? 0.98 : 0.76);
    g.strokeRoundedRect(-box.width / 2, -box.height / 2, box.width, box.height, 16);
    g.lineStyle(1, 0xffffff, 0.72);
    g.strokeRoundedRect(
      -box.width / 2 + 5,
      -box.height / 2 + 5,
      box.width - 10,
      box.height - 10,
      12,
    );
    if (!crop) {
      g.lineStyle(2, 0xffffff, 0.28);
      for (let i = -Math.floor(box.width / 2) + 28; i < box.width / 2 - 12; i += 30) {
        g.lineBetween(i, -box.height / 2 + 18, i + 20, box.height / 2 - 18);
      }
    } else {
      this.drawCropArt(container, crop, progress, plot.watered === true, ready);
    }
    container.add(g);

    const cropLabel = crop ? `${crop.name} ${Math.round(progress * 100)}%` : '空地';
    const label = this.add
      .text(0, -box.height / 2 - 18, cropLabel, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const actionLabel = crop ? (ready ? '收获' : plot.watered ? '成长中' : '浇水') : '播种';
    container.add([
      label,
      this.createWorldPill(0, box.height / 2 + 18, actionLabel, ready ? 0xff8a1f : 0x11699a),
    ]);
    return container;
  }

  private sourceBoxToWorldBox(box: {
    readonly sourceX: number;
    readonly sourceY: number;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
  }): FarmWorldBox {
    const stage = this.farmMapStage;
    if (!stage) {
      return {
        x: GAME_WIDTH / 2,
        y: GAME_HEIGHT / 2,
        width: box.sourceWidth,
        height: box.sourceHeight,
      };
    }
    const source = stage.texture.getSourceImage() as {
      readonly width?: number;
      readonly height?: number;
    };
    const sourceWidth = Math.max(1, source.width ?? GAME_WIDTH);
    const sourceHeight = Math.max(1, source.height ?? GAME_HEIGHT);
    const bounds = stage.getBounds();
    return {
      x: bounds.x + ((box.sourceX + box.sourceWidth / 2) / sourceWidth) * bounds.width,
      y: bounds.y + ((box.sourceY + box.sourceHeight / 2) / sourceHeight) * bounds.height,
      width: (box.sourceWidth / sourceWidth) * bounds.width,
      height: (box.sourceHeight / sourceHeight) * bounds.height,
    };
  }

  private drawCropArt(
    container: Phaser.GameObjects.Container,
    crop: FarmCropDefinition,
    progress: number,
    watered: boolean,
    ready: boolean,
  ): void {
    const g = this.add.graphics();
    if (ready) {
      g.fillStyle(crop.accent, 0.22);
      g.fillCircle(0, 0, 62);
      g.lineStyle(3, crop.accent, 0.86);
      g.strokeCircle(0, 0, 54);
    }
    const height = 14 + progress * 32;
    for (let i = 0; i < 5; i += 1) {
      const x = -48 + i * 24;
      const sway = Math.sin(Date.now() / 400 + i) * 2;
      g.lineStyle(5, 0x2f8f45, 0.95);
      g.lineBetween(x, 22, x + sway, 22 - height);
      g.fillStyle(0x4cc26b, 0.95);
      g.fillEllipse(x - 7, 10 - height * 0.42, 18, 9, Phaser.Math.DegToRad(-18));
      g.fillEllipse(x + 8, 8 - height * 0.48, 17, 9, Phaser.Math.DegToRad(18));
      if (progress > 0.34) {
        const fruitRadius = ready ? 10 : 6 + progress * 4;
        g.fillStyle(crop.color, 0.98);
        g.fillCircle(x + sway, 21 - height, fruitRadius);
        g.fillStyle(crop.accent, 0.5);
        g.fillCircle(x + sway - 3, 18 - height, Math.max(2, fruitRadius * 0.32));
      }
    }
    if (watered && !ready) {
      g.fillStyle(0x70d8ff, 0.9);
      g.fillCircle(-64, -26, 4);
      g.fillCircle(64, -24, 4);
      g.fillCircle(0, -34, 4);
    }
    container.add(g);

    const barWidth = 128;
    const track = this.add.graphics();
    track.fillStyle(0x2e3c31, 0.55);
    track.fillRoundedRect(-barWidth / 2, 34, barWidth, 8, 4);
    track.fillStyle(ready ? 0xffd93d : crop.color, 0.96);
    track.fillRoundedRect(-barWidth / 2, 34, barWidth * progress, 8, 4);
    container.add(track);
  }

  private handlePlot(index: number): void {
    const state = readFarmState();
    const plot = state.plots[index];
    if (!plot) return;
    if (!plot.cropId) {
      this.plantFarmPlot(index);
      return;
    }
    if (isFarmPlotReady(plot)) {
      this.harvestFarmPlot(index);
      return;
    }
    this.waterFarmPlot(index);
  }

  private plantFarmPlot(index: number): void {
    if (PlayerState.getItemCount('energy_seed') < 1) {
      this.showToast('需要能量种子。可以去左下角种子仓库每日领取。');
      return;
    }
    const state = readFarmState();
    if (state.plots[index]?.cropId) return;
    if (!PlayerState.removeItem('energy_seed', 1)) return;
    const crop = randomFarmCrop();
    const plots = [...state.plots];
    plots[index] = { cropId: crop.id, plantedAt: Date.now(), watered: false };
    writeFarmState({ ...state, plots });
    this.refreshFarmUi();
    this.showToast(`种下了${crop.seedName}，先浇水会长得更快。`);
  }

  private waterFarmPlot(index: number): void {
    const state = readFarmState();
    const plot = state.plots[index];
    if (!plot?.cropId || isFarmPlotReady(plot)) return;
    if (plot.watered) {
      this.showToast('这块地已经浇过水了，等作物成熟吧。');
      return;
    }
    const plots = [...state.plots];
    plots[index] = {
      ...plot,
      plantedAt: (plot.plantedAt ?? Date.now()) - FARM_GROW_MS * 0.55,
      watered: true,
    };
    writeFarmState({ ...state, plots });
    this.refreshFarmUi();
    this.showToast('浇水完成，成长速度提升。');
  }

  private harvestFarmPlot(index: number): void {
    const state = readFarmState();
    const plot = state.plots[index];
    if (!plot?.cropId || !isFarmPlotReady(plot)) {
      this.showToast('作物还没有成熟。');
      return;
    }
    const crop = getFarmCrop(plot.cropId) ?? FARM_CROPS[0];
    PlayerState.addItem(crop.rewardItemId, 1);
    gameEvents.emit('item:collect', {
      itemId: crop.rewardItemId,
      quantity: 1,
      source: 'farm:harvest',
    });
    if (Math.random() < 0.38) PlayerState.addItem('exp_candy', 1);
    if (Math.random() < 0.14) PlayerState.addItem('potential_seed', 1);
    const coins = Phaser.Math.Between(32, 62);
    PlayerState.addCoins(coins);
    const plots = [...state.plots];
    plots[index] = {};
    writeFarmState({ ...state, plots });
    this.refreshFarmUi();
    this.showToast(`收获${crop.name}，获得果实和 ${coins} 金币。`);
  }

  private claimFarmSeeds(): void {
    const state = readFarmState();
    const today = todayKey();
    if (state.seedDate === today) {
      this.showToast('今天已经领过种子了，明天再来。');
      return;
    }
    PlayerState.addItem('energy_seed', 3);
    gameEvents.emit('item:collect', {
      itemId: 'energy_seed',
      quantity: 3,
      source: 'farm:seed_crates',
    });
    PlayerState.addCoins(20);
    writeFarmState({ ...state, seedDate: today });
    this.refreshFarmUi();
    this.showToast('种子仓库发放了 3 颗能量种子和 20 金币。');
  }

  private waterAllPlots(): void {
    const state = readFarmState();
    let wateredCount = 0;
    const plots = state.plots.map((plot) => {
      if (!plot.cropId || plot.watered || isFarmPlotReady(plot)) return plot;
      wateredCount += 1;
      return {
        ...plot,
        plantedAt: (plot.plantedAt ?? Date.now()) - FARM_GROW_MS * 0.55,
        watered: true,
      };
    });
    if (wateredCount <= 0) {
      this.showToast('没有需要浇水的作物。');
      return;
    }
    writeFarmState({ ...state, plots });
    this.refreshFarmUi();
    this.showToast(`灌溉井启动，${wateredCount} 块田地已经浇水。`);
  }

  private claimFarmHelper(): void {
    const state = readFarmState();
    const today = todayKey();
    if (state.helperDate === today) {
      this.showToast('今天已经安排过精灵帮工了。');
      return;
    }
    const helper = PlayerState.snapshot().playerPets[0];
    if (!helper) {
      this.showToast('需要至少一只首发精灵才能帮工。');
      return;
    }
    const plots = state.plots.map((plot) => {
      if (!plot.cropId || isFarmPlotReady(plot)) return plot;
      return {
        ...plot,
        plantedAt: (plot.plantedAt ?? Date.now()) - FARM_GROW_MS * 0.3,
      };
    });
    PlayerState.gainExp(playerPetKey(helper), 180);
    PlayerState.addCoins(80);
    PlayerState.addItem('exp_candy', 1);
    writeFarmState({ ...state, plots, helperDate: today });
    this.refreshFarmUi();
    this.showToast('首发精灵完成帮工：获得经验、金币，作物也被照料了。');
  }

  private openFarmBoard(): void {
    this.boardPanel?.destroy();
    this.boardPanel = this.add.container(0, 0).setDepth(1900);
    const shade = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x062f5c, 0.35)
      .setOrigin(0)
      .setInteractive();
    const card = this.add.graphics();
    card.fillStyle(0xfffbdf, 0.97);
    card.fillRoundedRect(198, 118, 564, 360, 10);
    card.lineStyle(3, 0x2d91c8, 0.95);
    card.strokeRoundedRect(198, 118, 564, 360, 10);
    card.fillStyle(0x2d91c8, 0.94);
    card.fillRoundedRect(218, 136, 524, 54, 10);
    this.boardPanel.add([shade, card]);
    this.boardPanel.add(
      this.add.text(244, 148, '农舍账本', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
        stroke: '#15426d',
        strokeThickness: 4,
      }),
    );
    this.boardPanel.add(
      this.add.text(422, 156, '播种、浇水、收获会持续产出养成材料', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#15426d',
        strokeThickness: 3,
      }),
    );

    const state = readFarmState();
    const planted = state.plots.filter((plot) => Boolean(plot.cropId)).length;
    const ready = state.plots.filter((plot) => isFarmPlotReady(plot)).length;
    const seedCount = PlayerState.getItemCount('energy_seed');
    const order = currentFarmOrder(state);
    const lines = [
      `能量种子：${seedCount}    已种植：${planted}/6    可收获：${ready}`,
      `今日种子：${state.seedDate === todayKey() ? '已领取' : '可领取'}    精灵帮工：${
        state.helperDate === todayKey() ? '已完成' : '可派遣'
      }`,
      `今日订单：${order.completed ? '已交付' : order.requirements.map(formatFarmOrderRequirement).join('、')}`,
      '玩法节奏：领取种子 -> 播种浇水 -> 收获果实 -> 交付订单换大奖。',
    ];
    lines.forEach((line, index) => {
      this.boardPanel?.add(
        this.add.text(244, 220 + index * 38, line, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: index < 2 ? '18px' : '16px',
          color: '#31556b',
          wordWrap: { width: 476 },
          lineSpacing: 5,
        }),
      );
    });

    this.createPanelButton(284, 420, '领取种子', () => this.claimFarmSeeds());
    this.createPanelButton(414, 420, '一键浇水', () => this.waterAllPlots());
    this.createPanelButton(544, 420, '交付订单', () => this.submitFarmOrder());
    this.createPanelButton(674, 420, '关闭', () => this.closeFarmBoard());
  }

  private closeFarmBoard(): void {
    this.boardPanel?.destroy();
    this.boardPanel = null;
  }

  private createPanelButton(x: number, y: number, label: string, onClick: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(0xff9f2f, 0.98);
    g.lineStyle(2, 0xffffff, 1);
    g.fillRoundedRect(x - 62, y - 18, 124, 36, 8);
    g.strokeRoundedRect(x - 62, y - 18, 124, 36, 8);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#8a4a00',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const hit = this.add
      .zone(x, y, 124, 36)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        onClick();
        if (label !== '关闭') this.openFarmBoard();
      });
    this.boardPanel?.add([g, text, hit]);
  }

  private refreshStatusPanel(): void {
    this.statusPanel?.destroy();
    this.statusPanel = this.add.container(GAME_WIDTH - 278, 88).setDepth(1750);
    const state = readFarmState();
    const planted = state.plots.filter((plot) => Boolean(plot.cropId)).length;
    const ready = state.plots.filter((plot) => isFarmPlotReady(plot)).length;
    const seedCount = PlayerState.getItemCount('energy_seed');
    const order = currentFarmOrder(state);
    const orderReady = canSubmitFarmOrder(order, (itemId) => PlayerState.getItemCount(itemId));
    const g = this.add.graphics();
    g.fillStyle(0x07345f, 0.68);
    g.fillRoundedRect(0, 0, 250, 140, 10);
    g.lineStyle(2, 0xffffff, 0.42);
    g.strokeRoundedRect(0, 0, 250, 140, 10);
    this.statusPanel.add(g);
    const rows = [
      '农场状态',
      `种子 x${seedCount}    田地 ${planted}/6`,
      `成熟 ${ready}    今日种子 ${state.seedDate === todayKey() ? '已领' : '可领'}`,
      `帮工 ${state.helperDate === todayKey() ? '已完成' : '可派遣'}`,
      `订单 ${order.completed ? '已交付' : orderReady ? '可交付' : '进行中'}`,
    ];
    rows.forEach((row, index) => {
      this.statusPanel?.add(
        this.add.text(14, 10 + index * 25, row, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: index === 0 ? '17px' : '14px',
          color: index === 0 ? '#fff4a8' : '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 3,
        }),
      );
    });
  }

  private refreshFarmUi(): void {
    this.refreshFieldLayer();
  }

  private submitFarmOrder(): void {
    const state = readFarmState();
    const order = currentFarmOrder(state);
    if (order.completed) {
      this.showToast('今日订单已经交付过了，明天会刷新新的订单。');
      return;
    }
    const missing = order.requirements.find(
      (req) => PlayerState.getItemCount(req.itemId) < req.quantity,
    );
    if (missing) {
      this.showToast(`订单还缺 ${formatFarmOrderRequirement(missing)}，继续种植收获吧。`);
      return;
    }
    for (const req of order.requirements) {
      PlayerState.removeItem(req.itemId, req.quantity);
    }
    const reward = farmOrderReward(order);
    PlayerState.addCoins(reward.coins);
    for (const item of reward.items) PlayerState.addItem(item.itemId, item.quantity);
    writeFarmState({ ...state, order: { ...order, completed: true } });
    this.refreshFarmUi();
    this.showToast(`订单交付成功：获得 ${reward.coins} 金币、经验糖和潜能星砂。`);
  }

  private updateKeyboardMove(delta: number): boolean {
    if (!this.cursors || !this.wasd || this.boardPanel) return false;
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
    if (!this.moveTarget || this.boardPanel) return;
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
    this.playerShadow.setPosition(this.player.x, this.player.y + 18);
    this.player.setDepth(620 + this.player.y);
    this.playerShadow.setDepth(this.player.depth - 1);
  }

  private walkToPoint(x: number, y: number): void {
    if (this.boardPanel) return;
    const target = this.findNearestFarmWalkable(x, y - 18);
    this.setMovePath(target);
  }

  private walkToAction(x: number, y: number, action: () => void): void {
    if (this.boardPanel) return;
    const target = this.findNearestFarmWalkable(x, y);
    this.setMovePath(target, action, 20);
  }

  private setMovePath(target: PixelPoint, action?: () => void, triggerRadius?: number): void {
    const path = findPixelPath({
      bounds: FARM_WALK_AREA,
      start: { x: this.player.x, y: this.player.y },
      target,
      isWalkable: (x, y) => this.isFarmWalkable(x, y),
      cellSize: 22,
      maxTargetSearchRadius: 18,
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
    this.moveTarget = { ...this.moveTarget, x: next.x, y: next.y };
    return true;
  }

  private setPlayerPosition(x: number, y: number): boolean {
    const next = {
      x: Phaser.Math.Clamp(x, FARM_WALK_AREA.left, FARM_WALK_AREA.right),
      y: Phaser.Math.Clamp(y, FARM_WALK_AREA.top, FARM_WALK_AREA.bottom),
    };
    if (!this.isFarmWalkable(next.x, next.y)) return false;
    this.player.setPosition(next.x, next.y);
    return true;
  }

  private findNearestFarmWalkable(x: number, y: number): PixelPoint {
    const base = {
      x: Phaser.Math.Clamp(x, FARM_WALK_AREA.left, FARM_WALK_AREA.right),
      y: Phaser.Math.Clamp(y, FARM_WALK_AREA.top, FARM_WALK_AREA.bottom),
    };
    if (this.isFarmWalkable(base.x, base.y)) return base;
    for (let radius = 10; radius <= 190; radius += 10) {
      for (let angle = 0; angle < 360; angle += 24) {
        const rad = Phaser.Math.DegToRad(angle);
        const point = {
          x: Phaser.Math.Clamp(
            base.x + Math.cos(rad) * radius,
            FARM_WALK_AREA.left,
            FARM_WALK_AREA.right,
          ),
          y: Phaser.Math.Clamp(
            base.y + Math.sin(rad) * radius,
            FARM_WALK_AREA.top,
            FARM_WALK_AREA.bottom,
          ),
        };
        if (this.isFarmWalkable(point.x, point.y)) return point;
      }
    }
    return PLAYER_START;
  }

  private isFarmWalkable(x: number, y: number): boolean {
    if (
      x < FARM_WALK_AREA.left ||
      x > FARM_WALK_AREA.right ||
      y < FARM_WALK_AREA.top ||
      y > FARM_WALK_AREA.bottom
    ) {
      return false;
    }
    const inPath =
      FARM_WALK_RECTS.some(
        (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
      ) || FARM_WALK_ELLIPSES.some((zone) => this.inEllipse(x, y, zone));
    const blocked = FARM_BLOCK_RECTS.some(
      (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
    );
    return inPath && !blocked;
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

  private createWorldLabel(x: number, y: number, label: string): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const width = Math.max(72, text.width + 18);
    const bg = this.add.graphics();
    bg.fillStyle(0x07345f, 0.64);
    bg.fillRoundedRect(-width / 2, -14, width, 28, 8);
    bg.lineStyle(1, 0xffffff, 0.42);
    bg.strokeRoundedRect(-width / 2, -14, width, 28, 8);
    container.add([bg, text]);
    return container;
  }

  private createWorldPill(
    x: number,
    y: number,
    label: string,
    color: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: label.length > 5 ? '12px' : '14px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const width = Math.max(72, Math.min(128, text.width + 22));
    const bg = this.add.graphics();
    bg.fillStyle(color, 0.86);
    bg.fillRoundedRect(-width / 2, -13, width, 26, 8);
    bg.lineStyle(1, 0xffffff, 0.58);
    bg.strokeRoundedRect(-width / 2, -13, width, 26, 8);
    container.add([bg, text]);
    return container;
  }

  private markPointerHandled(): void {
    this.pointerHandled = true;
    this.time.delayedCall(30, () => {
      this.pointerHandled = false;
    });
  }

  private returnHome(): void {
    this.scene.start(SceneKey.HOME, { fromScene: this.fromScene });
  }

  private showToast(message: string): void {
    this.clearToast();
    this.toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 48, message, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: 'rgba(7, 52, 95, 0.82)',
        padding: { x: 18, y: 10 },
        wordWrap: { width: 780 },
      })
      .setOrigin(0.5)
      .setDepth(2200);
    this.toastTimer = this.time.delayedCall(2600, () => this.clearToast());
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

function playerPetKey(owned: PlayerPet): string {
  return owned.instanceId ?? owned.petId;
}
