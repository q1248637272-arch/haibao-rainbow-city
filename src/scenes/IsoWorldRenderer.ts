import Phaser from 'phaser';

import {
  BACKGROUND_COLOR,
  GAME_HEIGHT,
  GAME_WIDTH,
  ISO_ORIGIN_X,
  ISO_ORIGIN_Y,
  PLAYER_SPEED,
  TILE_H,
  TILE_W,
} from '@/config/GameConfig';
import { getEncounter } from '@/data/encounters';
import type {
  IsoLandmark,
  IsoMapDef,
  IsoPropCell,
  IsoTileId,
} from '@/data/maps';
import { rollEncounter, makeEncounterDedupTracker } from '@/systems/EncounterRoller';
import {
  actorDepthFromScreen,
  isTallProp,
  screenToWorld,
  tileDepth,
  worldToScreen,
} from '@/systems/IsoProjection';
import {
  buildMovementGrid,
  findPath,
  findNearestReachableWalkableCell,
  isWalkable,
  type GridCell,
  type WalkabilityGrid,
} from '@/systems/Pathfinding';
import type { IsoDir } from '@/types/direction';
import { createPathOverlay, type PathOverlayHandle } from '@/ui/ClickPathOverlay';
import { makeHud, type HudHandle } from '@/ui/Hud';
import {
  generateHaibaoFrames,
  haibaoTextureKey,
  registerHaibaoAnims,
} from '@/utils/haibaoSprite';

/**
 * 等距世界渲染器 —— 多场景共享的"铺瓦片 + 挂 zone + 生海宝 + 初始化 HUD"工具集。
 *
 * 设计决策：
 *   1. 纯函数风格 + 显式返回句柄，而不是"继承一个 IsoBaseScene"。
 *      Phaser 的 Scene 生命周期复杂、测试难，继承链会让 sub-scene 特化逻辑（GymScene 的
 *      VIP 解锁、BeachScene 的 portal_back）互相牵扯。每个 scene 自行组合 renderIsoMap /
 *      setupPlayerAndHud / wireLandmarkOverlaps 心智最低。
 *   2. `setOrigin(0.5, 1)` 让瓦片的"底部中心"对齐 `worldToScreen(col,row)`。等距菱形的
 *      视觉中心在底部尖点，这样高物体（树、墙、屋顶 132×131）的底部都吸附在正确的格子，
 *      不会浮空或错位。
 *   3. Depth 用 `tileDepth(col, row, kind)`：主序 (col+row)*100 + row + kind 偏移，
 *      保证远近格子正确遮挡 + 同格内 actor > prop > ground。
 *   4. 物理世界边界 & 相机边界基于"当前地图屏幕包围盒"动态计算，而非 GAME_WIDTH/HEIGHT
 *      固定值——彩虹城 12×12 与海滨沙滩 16×12 的投影宽度都超过 960 画布，必须让相机
 *      follow 玩家。
 */

// ---- 返回句柄类型 ------------------------------------------------------

/**
 * 单个地标的实时句柄：供 overlap 路由阶段读取 key / target / pendingMessage 并触发副作用。
 */
export interface LandmarkZoneHandle {
  readonly key: string;
  readonly label: string;
  readonly target: string | null;
  readonly zone: Phaser.GameObjects.Zone;
  readonly pendingMessage?: string;
}

/**
 * 单个 encounter zone 的实时句柄：供 scene 在 overlap 时打点或（FEAT-206 起）触发战斗。
 */
export interface EncounterZoneHandle {
  readonly zoneId: string;
  readonly zone: Phaser.GameObjects.Zone;
}

/**
 * renderIsoMap 的返回值：landmark 与 encounter zone 两套句柄数组，以及非可走格的
 * 物理阻挡 static 组。blockerGroup 供调用场景 `scene.physics.add.collider(player, blockerGroup)`
 * 以阻止玩家物理上穿入建筑 / 树木 / 墙体（FEAT-311 穿模修复）。
 */
export interface RenderIsoMapResult {
  readonly landmarkZones: LandmarkZoneHandle[];
  readonly encounterZones: EncounterZoneHandle[];
  readonly blockerGroup: Phaser.Physics.Arcade.StaticGroup;
}

/**
 * setupPlayerAndHud 的返回值：玩家 sprite + "宝"字 label + HUD 句柄 + 朝向引用。
 *
 * `facingRef` 以对象 + `.current` 字段暴露，避免把 "上次朝向" 这种可变状态塞进
 * Phaser.Scene 子类字段；调用方（WorldMapScene / BeachScene）的 update() 里直接
 * 读写 `facingRef.current`。
 */
export interface PlayerAndHudHandle {
  readonly player: Phaser.Physics.Arcade.Sprite;
  readonly label: Phaser.GameObjects.Text;
  readonly hud: HudHandle;
  readonly facingRef: { current: IsoDir };
}

/**
 * setupWorldInput 返回的键盘句柄。
 */
export interface WorldInputHandle {
  readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  readonly wasd: {
    readonly W: Phaser.Input.Keyboard.Key;
    readonly A: Phaser.Input.Keyboard.Key;
    readonly S: Phaser.Input.Keyboard.Key;
    readonly D: Phaser.Input.Keyboard.Key;
  };
}

// ---- 内部辅助 ----------------------------------------------------------

/**
 * 计算一张地图在屏幕上的轴对齐包围盒。
 *
 * 取 4 个角 (0,0) / (cols-1,0) / (0,rows-1) / (cols-1,rows-1) 的投影并扩一格瓦片尺寸，
 * 让相机 / 物理世界有额外余量承载 setOrigin(0.5,1) 的高物体（树/墙顶部延伸到格上方）。
 */
function computeMapBounds(map: IsoMapDef): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const corners = [
    worldToScreen(0, 0),
    worldToScreen(map.cols - 1, 0),
    worldToScreen(0, map.rows - 1),
    worldToScreen(map.cols - 1, map.rows - 1),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of corners) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // 给高物体留出上边空间（树/屋顶 132×131 顶部向上延伸约 TILE_H）。
  return {
    left: minX - TILE_W / 2,
    right: maxX + TILE_W / 2,
    top: minY - TILE_H * 2,
    bottom: maxY + TILE_H,
  };
}

/**
 * 按 (col+row) 升序排列 prop 列表，保证同一次 render 调用内高物体的 depth 与绘制顺序吻合。
 */
function sortedProps(props: readonly IsoPropCell[]): IsoPropCell[] {
  return [...props].sort((a, b) => {
    const s = a.col + a.row - (b.col + b.row);
    if (s !== 0) return s;
    return a.row - b.row;
  });
}

/**
 * 把一块 zone 挂到 scene.physics 上，尺寸按瓦片数（默认 1×1）。
 *
 * zone 的中心放在瓦片屏幕中心（即 worldToScreen 结果再上抬 TILE_H/2，因为 setOrigin(0.5,1)
 * 的瓦片视觉中心在 "底" 点上方半格处）。
 */
function createTileZone(
  scene: Phaser.Scene,
  col: number,
  row: number,
  widthInTiles: number,
  heightInTiles: number,
): Phaser.GameObjects.Zone {
  const { x, y } = worldToScreen(col, row);
  const zone = scene.add.zone(
    x,
    y - TILE_H / 2,
    TILE_W * widthInTiles,
    TILE_H * heightInTiles,
  );
  scene.physics.add.existing(zone, true);
  return zone;
}

function drawFixedSkyAccents(scene: Phaser.Scene, map: IsoMapDef): void {
  const g = scene.add.graphics();
  g.setScrollFactor(0);
  g.setDepth(-1000);

  const isBeach = map.id === 'beach';
  const sunX = isBeach ? GAME_WIDTH - 92 : 88;
  const sunY = 72;
  g.fillStyle(isBeach ? 0xffd36e : 0xfff1a6, 0.9);
  g.fillCircle(sunX, sunY, 34);
  g.fillStyle(0xffffff, 0.28);
  g.fillCircle(sunX - 10, sunY - 10, 44);

  const cloudColor = 0xffffff;
  const clouds = isBeach
    ? [
        { x: 170, y: 84, s: 1.1 },
        { x: 760, y: 132, s: 0.85 },
      ]
    : [
        { x: 156, y: 96, s: 0.9 },
        { x: 782, y: 92, s: 1.05 },
      ];
  for (const cloud of clouds) {
    g.fillStyle(cloudColor, 0.35);
    g.fillEllipse(cloud.x, cloud.y, 88 * cloud.s, 28 * cloud.s);
    g.fillCircle(cloud.x - 28 * cloud.s, cloud.y - 4 * cloud.s, 18 * cloud.s);
    g.fillCircle(cloud.x + 8 * cloud.s, cloud.y - 14 * cloud.s, 24 * cloud.s);
    g.fillCircle(cloud.x + 34 * cloud.s, cloud.y - 2 * cloud.s, 16 * cloud.s);
  }

  if (!isBeach) {
    const arcX = GAME_WIDTH / 2;
    const arcY = 178;
    const colors = [0xff5f7a, 0xffc857, 0x4cc26b, 0x38bdf8, 0x9b5cff];
    colors.forEach((color, i) => {
      g.lineStyle(5, color, 0.28);
      g.beginPath();
      g.arc(arcX, arcY, 210 - i * 10, Math.PI * 1.1, Math.PI * 1.9, false);
      g.strokePath();
    });
  }
}

function drawMapShadow(scene: Phaser.Scene, bounds: {
  left: number;
  right: number;
  top: number;
  bottom: number;
}): void {
  const g = scene.add.graphics();
  const width = bounds.right - bounds.left;
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = bounds.bottom + TILE_H * 0.1;
  g.fillStyle(0x2f6f7a, 0.14);
  g.fillEllipse(centerX, centerY, width * 0.74, TILE_H * 2.25);
  g.setDepth(-100);
}

function landmarkColor(key: string): number {
  switch (key) {
    case 'gym':
      return 0xff4d8d;
    case 'shop':
      return 0x38bdf8;
    case 'quest':
      return 0xffc857;
    case 'vip_panel':
      return 0x9b5cff;
    case 'portal_beach':
    case 'portal_back':
      return 0x27c7a7;
    default:
      return 0xff8fb3;
  }
}

function drawLandmarkLabels(scene: Phaser.Scene, map: IsoMapDef): void {
  for (const lm of map.landmarks) {
    const w = lm.widthInTiles ?? 1;
    const h = lm.heightInTiles ?? 1;
    const cc = lm.col + (w - 1) / 2;
    const cr = lm.row + (h - 1) / 2;
    const { x, y } = worldToScreen(cc, cr);
    const color = landmarkColor(lm.key);
    const depth = tileDepth(cc, cr, 'prop') + 110;

    const marker = scene.add.graphics({ x, y: y - TILE_H / 2 });
    marker.fillStyle(color, 0.22);
    marker.lineStyle(2, color, 0.55);
    marker.fillEllipse(0, 0, TILE_W * 0.55, TILE_H * 0.46);
    marker.strokeEllipse(0, 0, TILE_W * 0.55, TILE_H * 0.46);
    marker.setDepth(depth - 3);

    const label = scene.add
      .text(x, y - TILE_H - 72, lm.label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#1b6fa8',
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
      })
      .setOrigin(0.5)
      .setDepth(depth);

    scene.tweens.add({
      targets: [marker, label],
      y: '+=3',
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}

// ---- 主入口：renderIsoMap ---------------------------------------------

/**
 * 把一整张 IsoMapDef 渲染到 scene 上：铺底、铺装饰、挂地标 zone、挂遭遇 zone。
 *
 * 不负责：
 *   - 背景色（由 scene 自行 `cameras.main.setBackgroundColor`）
 *   - 玩家 sprite（走 {@link setupPlayerAndHud}）
 *   - 标题文本（由 scene 自行加）
 *
 * @returns 每个地标 / encounter zone 的句柄列表，供 scene 通过 `wireLandmarkOverlaps` 路由。
 */
export function renderIsoMap(scene: Phaser.Scene, map: IsoMapDef): RenderIsoMapResult {
  // --- 相机 & 物理世界边界：依地图投影包围盒 ---
  const b = computeMapBounds(map);
  const worldW = b.right - b.left;
  const worldH = b.bottom - b.top;
  scene.physics.world.setBounds(b.left, b.top, worldW, worldH);
  scene.cameras.main.setBounds(b.left, b.top, worldW, worldH);
  drawFixedSkyAccents(scene, map);
  drawMapShadow(scene, b);

  // --- 铺底 ground ---
  for (let row = 0; row < map.rows; row++) {
    const rowArr = map.ground[row];
    if (!rowArr) continue;
    for (let col = 0; col < map.cols; col++) {
      const tile: IsoTileId | undefined = rowArr[col];
      if (!tile || tile === 'empty') continue;
      const { x, y } = worldToScreen(col, row);
      scene.add.image(x, y, tile).setOrigin(0.5, 1).setDepth(tileDepth(col, row, 'ground'));
    }
  }

  // --- 铺装饰 props（按 col+row 升序，保证高物深度顺序正确） ---
  for (const prop of sortedProps(map.props)) {
    if (prop.tile === 'empty') continue;
    const { x, y } = worldToScreen(prop.col, prop.row);
    // FEAT-311：高物（tree_pine / wall_brick / roof_red / roof_blue）的纹理会向上
    // 显著延伸出所在格，为避免玩家穿到高物背后时被"树冠/屋顶"的顶部压脸，这里在
    // 标准 prop depth 之上额外 +50，让同格内高物覆盖 actor（actor 比 prop 基础多 +1，
    // 但远低于 50 的 tall 加成；跨格深度仍由 col+row 主序决定，不受影响）。
    const propDepth =
      tileDepth(prop.col, prop.row, 'prop') + (isTallProp(prop.tile) ? 50 : 0);
    scene.add.image(x, y, prop.tile).setOrigin(0.5, 1).setDepth(propDepth);
  }

  // --- FEAT-311：可走性栅格 + 建筑物理阻挡 staticGroup ---
  // 不可走格（landmark 中心 / 阻挡类 props / 水面）对应玩家可能"穿入"的视觉陷阱。
  // 给每格挂一个不可见 static 矩形 body（尺寸约 TILE_W×0.7 × TILE_H×0.5，菱形近似），
  // 调用方再 `scene.physics.add.collider(player, blockerGroup)` 即可阻止穿模。
  const blockerGroup = scene.physics.add.staticGroup();
  const walkGrid = buildMovementGrid(map);
  const blockerW = TILE_W * 0.58;
  const blockerH = TILE_H * 0.46;
  for (let r = 0; r < map.rows; r++) {
    const rowArr = walkGrid[r];
    if (!rowArr) continue;
    for (let c = 0; c < map.cols; c++) {
      if (rowArr[c] !== false) continue;
      const { x, y } = worldToScreen(c, r);
      // setOrigin(0.5, 1) 的瓦片视觉中心在 "底" 点上方 TILE_H/2 处；blocker 对齐同一中心。
      const rect = scene.add
        .rectangle(x, y - TILE_H / 2, blockerW, blockerH, 0x000000, 0)
        .setDepth(tileDepth(c, r, 'prop'));
      scene.physics.add.existing(rect, true);
      blockerGroup.add(rect);
    }
  }

  // --- FEAT-311：建筑光晕 + 遭遇区淡绿虚线圈（overlay） ---
  // depth = tileDepth(...,'prop') - 0.5 保证在 ground 之上、actor / 高物 prop 之下，
  // 不会盖住角色或屋顶。
  for (const lm of map.landmarks) {
    const w = lm.widthInTiles ?? 1;
    const h = lm.heightInTiles ?? 1;
    // 取 landmark 区块中心：col + (w-1)/2, row + (h-1)/2
    const cc = lm.col + (w - 1) / 2;
    const cr = lm.row + (h - 1) / 2;
    const { x, y } = worldToScreen(cc, cr);
    const halo = scene.add.graphics({ x, y: y - TILE_H / 2 });
    halo.fillStyle(0xffffff, 0.2);
    halo.fillCircle(0, 0, 4);
    halo.setDepth(tileDepth(cc, cr, 'prop') - 0.5);
  }
  for (const ez of map.encounterZones) {
    const { x, y } = worldToScreen(ez.col, ez.row);
    const ring = scene.add.graphics({ x, y: y - TILE_H / 2 });
    ring.lineStyle(2, 0x4cc26b, 0.25);
    ring.strokeCircle(0, 0, TILE_W * 0.3);
    ring.setDepth(tileDepth(ez.col, ez.row, 'prop') - 0.5);
  }
  drawLandmarkLabels(scene, map);

  // --- 挂地标 zone（物理 body 静态） ---
  const landmarkZones: LandmarkZoneHandle[] = [];
  for (const lm of map.landmarks) {
    const w = lm.widthInTiles ?? 1;
    const h = lm.heightInTiles ?? 1;
    const zone = createTileZone(scene, lm.col, lm.row, w, h);
    const handle: LandmarkZoneHandle = buildLandmarkHandle(lm, zone);
    landmarkZones.push(handle);
  }

  // --- 挂 encounter zone ---
  const encounterZones: EncounterZoneHandle[] = [];
  for (const ez of map.encounterZones) {
    const zone = createTileZone(scene, ez.col, ez.row, 1, 1);
    encounterZones.push({ zoneId: ez.zoneId, zone });
  }

  return { landmarkZones, encounterZones, blockerGroup };
}

/**
 * 由地标定义 + zone 构建句柄。
 * 抽出来只为 `exactOptionalPropertyTypes` 下 pendingMessage 的可选字段赋值不把 `undefined` 显式写进对象。
 */
function buildLandmarkHandle(
  lm: IsoLandmark,
  zone: Phaser.GameObjects.Zone,
): LandmarkZoneHandle {
  const base = {
    key: lm.key,
    label: lm.label,
    target: lm.target,
    zone,
  };
  return lm.pendingMessage !== undefined
    ? { ...base, pendingMessage: lm.pendingMessage }
    : base;
}

// ---- setupPlayerAndHud -------------------------------------------------

const PLAYER_BODY_RADIUS = 24;

/**
 * 创建玩家 sprite（海宝）、"宝"字 label、HUD，并让主相机 follow 海宝。
 *
 * 调用前不需要 preload 海宝纹理——内部先 `generateHaibaoFrames` + `registerHaibaoAnims`
 * （幂等），再按 `spawn` 世界格子坐标生成 `physics.add.sprite`。
 */
export function setupPlayerAndHud(
  scene: Phaser.Scene,
  spawn: { col: number; row: number },
): PlayerAndHudHandle {
  generateHaibaoFrames(scene);
  registerHaibaoAnims(scene);

  const { x, y } = worldToScreen(spawn.col, spawn.row);

  const player = scene.physics.add.sprite(x, y - TILE_H / 2, haibaoTextureKey('se', 'idle'));
  player.setDepth(tileDepth(spawn.col, spawn.row, 'actor'));
  // FEAT-311：origin 从 (0.5, 0.8) 调到 (0.5, 0.75) 让脚底中心更贴瓦片中心，
  // 减少纹理顶部穿出当前格视觉范围的概率。
  player.setOrigin(0.5, 0.75);
  player.setFlipX(false);
  player.anims.play('haibao-se');

  const body = player.body as Phaser.Physics.Arcade.Body | null;
  if (body) {
    // 海宝脚下圆形碰撞盒：与 FEAT-202 保持一致。
    body.setCircle(PLAYER_BODY_RADIUS, 8, 48);
    body.setCollideWorldBounds(true);
  }

  // 相机跟随玩家（地图比 960×640 画布大得多）；设置 deadzone 让走动时视野更稳。
  scene.cameras.main.startFollow(player, true, 0.15, 0.15);
  scene.cameras.main.setDeadzone(GAME_WIDTH * 0.3, GAME_HEIGHT * 0.3);
  scene.cameras.main.setBackgroundColor(BACKGROUND_COLOR);

  // "宝"字标签跟随海宝（update 里调用方自行 setPosition）。
  const label = scene.add
    .text(x, y, '宝', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '18px',
      color: '#ff3b3b',
      stroke: '#ffffff',
      strokeThickness: 2,
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setDepth(tileDepth(spawn.col, spawn.row, 'actor') + 1);

  const hud = makeHud(scene, 'topright');
  const facingRef: { current: IsoDir } = { current: 'se' };

  return { player, label, hud, facingRef };
}

// ---- setupWorldInput ---------------------------------------------------

/**
 * 初始化 WASD + 方向键输入。
 */
export function setupWorldInput(scene: Phaser.Scene): WorldInputHandle {
  const keyboard = scene.input.keyboard;
  if (!keyboard) {
    throw new Error('键盘输入未初始化');
  }
  const cursors = keyboard.createCursorKeys();
  const wasd = keyboard.addKeys({
    W: Phaser.Input.Keyboard.KeyCodes.W,
    A: Phaser.Input.Keyboard.KeyCodes.A,
    S: Phaser.Input.Keyboard.KeyCodes.S,
    D: Phaser.Input.Keyboard.KeyCodes.D,
  }) as {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  return { cursors, wasd };
}

// ---- 共享 update 工具 --------------------------------------------------

/**
 * 统一读取 WASD / 方向键并返回归一化后的 (vx, vy)。对角线乘 1/√2 避免斜向更快。
 */
export function readMovementInput(input: WorldInputHandle): { vx: number; vy: number } {
  const { cursors, wasd } = input;
  let vx = 0;
  let vy = 0;
  if (cursors.left?.isDown || wasd.A.isDown) vx -= 1;
  if (cursors.right?.isDown || wasd.D.isDown) vx += 1;
  if (cursors.up?.isDown || wasd.W.isDown) vy -= 1;
  if (cursors.down?.isDown || wasd.S.isDown) vy += 1;

  if (vx !== 0 && vy !== 0) {
    const inv = 1 / Math.SQRT2;
    vx *= inv;
    vy *= inv;
  }
  return { vx: vx * PLAYER_SPEED, vy: vy * PLAYER_SPEED };
}

/**
 * 计算玩家角色在当前帧的等距 depth，让量纲与 {@link tileDepth} 的 ground/prop 对齐。
 *
 * 真正的数学在纯函数 {@link actorDepthFromScreen}（src/systems/IsoProjection.ts）中，
 * 本封装仅从 Phaser sprite 拿到 (x, y) 后转发，便于测试层直接覆盖"量纲一致性"。
 */
export function playerActorDepth(player: Phaser.Physics.Arcade.Sprite): number {
  return actorDepthFromScreen(player.x, player.y);
}

export function playerCellFromSprite(player: Phaser.Physics.Arcade.Sprite): GridCell {
  const { col, row } = screenToWorld(player.x, player.y + TILE_H / 2);
  return { col: Math.floor(col), row: Math.floor(row) };
}

const PLAYER_FOOTPRINT_SAMPLES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, -22],
  [0, 20],
  [-28, 0],
  [28, 0],
  [-18, -12],
  [18, -12],
  [-18, 12],
  [18, 12],
];

function playerFootprintCellsAt(x: number, y: number): GridCell[] {
  const cells = new Map<string, GridCell>();
  for (const [ox, oy] of PLAYER_FOOTPRINT_SAMPLES) {
    const { col, row } = screenToWorld(x + ox, y + oy + TILE_H / 2);
    const cell = { col: Math.floor(col), row: Math.floor(row) };
    cells.set(`${cell.col},${cell.row}`, cell);
  }
  return [...cells.values()];
}

function isPlayerFootprintWalkable(
  grid: WalkabilityGrid,
  x: number,
  y: number,
): boolean {
  return playerFootprintCellsAt(x, y).every((cell) =>
    isWalkable(grid, cell.col, cell.row),
  );
}

function findLandmarkVisualEntry(
  map: IsoMapDef,
  grid: WalkabilityGrid,
  start: GridCell,
  x: number,
  y: number,
): GridCell | null {
  for (const lm of map.landmarks) {
    if (lm.key.startsWith('portal')) continue;

    const w = lm.widthInTiles ?? 1;
    const h = lm.heightInTiles ?? 1;
    const centerCol = lm.col + (w - 1) / 2;
    const centerRow = lm.row + (h - 1) / 2;
    const screen = worldToScreen(centerCol, centerRow);
    const halfW = TILE_W * (0.72 + Math.max(0, w - 1) * 0.5);
    const top = screen.y - TILE_H * 2.35;
    const bottom = screen.y + TILE_H * 0.36;

    if (x < screen.x - halfW || x > screen.x + halfW || y < top || y > bottom) {
      continue;
    }

    const entry: GridCell = { col: Math.round(centerCol), row: lm.row + h };
    if (isWalkable(grid, entry.col, entry.row)) return entry;
    return findNearestReachableWalkableCell(grid, start, entry, 2);
  }

  return null;
}

/**
 * 位置守卫：物理碰撞之外的最后一道防线。
 *
 * Arcade 的矩形/圆形碰撞盒无法完全贴合等距菱形瓦片，角色在持续按键推挤时仍可能
 * 从建筑角落挤进不可走格。这里在每次物理更新后检查脚底多个采样点；一旦任一点
 * 落入水面、建筑、树、石头或地标中心，就把角色拉回上一帧的安全位置。
 */
export function attachWalkabilityGuard(
  scene: Phaser.Scene,
  player: Phaser.Physics.Arcade.Sprite,
  map: IsoMapDef,
): WalkabilityGuardHandle {
  const grid = buildMovementGrid(map);
  const lastSafe = { x: player.x, y: player.y };

  const updateLastSafeOrRollback = (): void => {
    if (!player.active) return;
    if (isPlayerFootprintWalkable(grid, player.x, player.y)) {
      lastSafe.x = player.x;
      lastSafe.y = player.y;
      return;
    }

    player.setPosition(lastSafe.x, lastSafe.y);
    const body = player.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setVelocity(0, 0);
    }
  };

  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, updateLastSafeOrRollback);

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, updateLastSafeOrRollback);
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  scene.events.once(Phaser.Scenes.Events.DESTROY, destroy);

  return { destroy };
}

// ---- overlap 路由 ------------------------------------------------------

/**
 * 地标 overlap 的去重 + 路由 helper。
 *
 * 传入的 `handlers` 中：
 *   - `onPortal(target, landmark)`：target 为 `SceneKey.*` 时调用（其中传入完整 key 字符串，
 *     由 scene 自行 `this.scene.start(target)`）；
 *   - `onGym(landmark)`：key === 'gym' 时调用（常规 WorldMapScene 切换至 GymScene 的入口）；
 *   - `onToast(message, landmark)`：target 为 null 且有 pendingMessage 时调用。
 *
 * 去重策略与 FEAT-202 的 WorldMapScene 版本一致：
 *   进入 zone 把 key 加入 `Set`，POST_UPDATE 周期检测"是否仍在重叠"；
 *   不再重叠则从 `Set` 移除，从而实现"进入-离开-再进入"时触发第二次。
 */
export interface LandmarkOverlapHandlers {
  readonly onGym?: (lm: LandmarkZoneHandle) => void;
  readonly onPortal?: (target: string, lm: LandmarkZoneHandle) => void;
  readonly onToast?: (message: string, lm: LandmarkZoneHandle) => void;
}

export function wireLandmarkOverlaps(
  scene: Phaser.Scene,
  player: Phaser.Physics.Arcade.Sprite,
  landmarkZones: readonly LandmarkZoneHandle[],
  handlers: LandmarkOverlapHandlers,
): void {
  const triggered = new Set<string>();

  for (const lm of landmarkZones) {
    scene.physics.add.overlap(player, lm.zone, () => {
      if (triggered.has(lm.key)) return;
      triggered.add(lm.key);

      if (lm.key === 'gym') {
        handlers.onGym?.(lm);
        return;
      }
      if (lm.target !== null) {
        handlers.onPortal?.(lm.target, lm);
        return;
      }
      if (lm.pendingMessage !== undefined) {
        handlers.onToast?.(lm.pendingMessage, lm);
      }
    });
  }

  // POST_UPDATE 周期检测离开 zone：Phaser arcade overlap 无 exit 回调。
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
    if (triggered.size === 0) return;
    const pb = player.body as Phaser.Physics.Arcade.Body | null;
    if (!pb) return;
    for (const lm of landmarkZones) {
      if (!triggered.has(lm.key)) continue;
      const zb = lm.zone.body as Phaser.Physics.Arcade.StaticBody | null;
      if (zb && !isRectsOverlap(pb, zb)) {
        triggered.delete(lm.key);
      }
    }
  });
}

/**
 * 野生遭遇的回调签名（FEAT-206）。
 *
 * 调用时机：玩家刚进入某个 encounter zone 且 `rollEncounter` 抽到非 null。
 * `roll.petId` 指向 PETS 表的 id；`roll.level` 是 encounter pool 里 levelRange 采样出的整数。
 */
export type EncounterTriggerHandler = (
  roll: { petId: string; level: number },
  zoneId: string,
) => void;

/**
 * encounter zone overlap 的去重 + 路由 helper。
 *
 * 本 helper 的职责：
 *   1. 玩家进入 zone 时（物理 overlap 触发）调用 `rollEncounter(def, rng)`；
 *   2. 非 null → 调 `onTrigger(roll, zoneId)`，把"是否真的切到 BattleScene"交给调用方；
 *   3. zone 已触发过一次后加入 `Set`，直到玩家 POST_UPDATE 周期检测到"不再重叠"才移除，
 *      使"进入 → 离开 → 再进入"才能再次 roll，避免每帧疯狂 roll。
 *
 * 设计决策：
 *   - rng / encounter 查表都接受依赖注入（默认使用 Math.random 和 getEncounter），
 *     便于测试路径和未来加入"幸运符加成"时替换；
 *   - 如果 `getEncounter(zoneId)` 返回 undefined（未注册 zone），静默跳过不报错，
 *     让地图配置可以超前 encounter 定义；
 *   - "onEnter 仅打点"的旧语义由调用方提供的 onTrigger 自行保留（FEAT-205 之前的
 *     console.info 占位被 BattleScene 切换取代）。
 */
export function wireEncounterOverlaps(
  scene: Phaser.Scene,
  player: Phaser.Physics.Arcade.Sprite,
  encounterZones: readonly EncounterZoneHandle[],
  onTrigger: EncounterTriggerHandler = (roll, zoneId) => {
    console.info(`[encounter:${zoneId}] roll: ${roll.petId} Lv${roll.level}`);
  },
  rng: () => number = Math.random,
): void {
  // 按 zoneId 去重（而非按 Zone 引用）：同一 zoneId 的多个 Zone 本质是"同一片草丛"，
  // 玩家在相邻 bush 之间走动时不应每进入一个 zone 就立刻 roll 一次。追踪器纯函数化，
  // 对应纯逻辑由 tests/encounter-roller.test.ts 覆盖。
  const tracker = makeEncounterDedupTracker();

  // 预先按 zoneId 聚合 zone，供 POST_UPDATE 离开检查时整体判定"是否仍与任一 zone 重叠"。
  const zonesByZoneId = new Map<string, Phaser.GameObjects.Zone[]>();
  for (const ez of encounterZones) {
    const arr = zonesByZoneId.get(ez.zoneId);
    if (arr) {
      arr.push(ez.zone);
    } else {
      zonesByZoneId.set(ez.zoneId, [ez.zone]);
    }
  }

  for (const ez of encounterZones) {
    scene.physics.add.overlap(player, ez.zone, () => {
      if (!tracker.shouldFire(ez.zoneId)) return;

      const def = getEncounter(ez.zoneId);
      if (!def) return;
      const roll = rollEncounter(def, rng);
      if (!roll) return;
      onTrigger(roll, ez.zoneId);
    });
  }

  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
    if (tracker.size() === 0) return;
    const pb = player.body as Phaser.Physics.Arcade.Body | null;
    if (!pb) return;
    tracker.clearLeftZones((zoneId) => {
      const zones = zonesByZoneId.get(zoneId);
      if (!zones) return false;
      return zones.some((z) => {
        const zb = z.body as Phaser.Physics.Arcade.StaticBody | null;
        return zb !== null && isRectsOverlap(pb, zb);
      });
    });
  });
}

/**
 * 轴对齐矩形相交判定：arcade overlap 离开逻辑共用。
 */
function isRectsOverlap(
  pb: Phaser.Physics.Arcade.Body,
  zb: Phaser.Physics.Arcade.StaticBody,
): boolean {
  return (
    pb.right > zb.left && pb.left < zb.right && pb.bottom > zb.top && pb.top < zb.bottom
  );
}

// ---- 鼠标左键点击自动寻路（FEAT-301） ---------------------------------

/**
 * 点击寻路控制器句柄。
 *
 * - `isPathing()`：当前是否处于自动寻路状态（有未走完的路径）；
 * - `cancel()`：中止自动寻路——销毁路径 overlay + 清空路径 + 把玩家速度清零。
 *   典型调用点：WASD / 方向键按下时 scene 立刻 cancel 交出控制权。
 * - `update(delta)`：每帧推进一次（delta 单位 ms）。若 `isPathing()` 为 true，
 *   朝下一个 waypoint 的瓦片屏幕中心以 PLAYER_SPEED 设置 body 速度；
 *   走到 ±4px 内即视为到达，推进到下一个；全部消耗后自动 cancel。
 *   **内部负责 setVelocity**，调用方不必再赋值。
 * - `destroy()`：解绑 pointerdown 监听并销毁当前 overlay；scene shutdown 时调用。
 * - `getPath()`：只读返回当前寻路剩余格子序列（含当前目标），供调试 / 测试。
 */
export interface ClickPathController {
  isPathing(): boolean;
  cancel(): void;
  update(delta: number): void;
  destroy(): void;
  getPath(): ReadonlyArray<GridCell>;
}

export interface WalkabilityGuardHandle {
  destroy(): void;
}

/** attachClickMovement 可选项。 */
export interface AttachClickMovementOpts {
  /**
   * 移动速度（像素/秒）。默认读 `PLAYER_SPEED`；测试或特殊场景可以覆写。
   */
  readonly speed?: number;
  /**
   * 到达 waypoint 的像素阈值：玩家中心距离瓦片中心小于该值时推进到下一个 waypoint。
   * 默认 4px，既避免高帧率下"越过目标点反复抖动"，又不至于让低帧率卡住。
   */
  readonly arriveEpsilon?: number;
}

/**
 * 给某个世界 scene 挂上鼠标左键点击自动寻路能力。
 *
 * 行为：
 * - 在 scene 的 `input` 上注册一次 `pointerdown`（本函数只在 create() 被调用一次，
 *   不要每帧重注册）。
 * - 左键按下 → 用 `scene.cameras.main.getWorldPoint(pointer.x, pointer.y)` 取真实
 *   世界坐标（考虑相机 follow 偏移），经 screenToWorld 得到浮点 (col,row)，
 *   再 `Math.floor` 取整。
 * - 读取玩家当前所在格（由玩家屏幕坐标反推）→ 调 `findPath`。
 * - 非空路径：销毁旧 overlay，生成新 overlay + 记录 waypoint 队列。
 * - 空 / null 路径：视作无效点击，不清空当前寻路状态。
 *
 * `update(delta)` 每帧推进：
 * - 当前 waypoint 用 `worldToScreen(col, row)` 的屏幕中心（与"宝"字 label 一致，
 *   y 上抬 TILE_H/2）；
 * - 玩家中心与 waypoint 距离 `< arriveEpsilon` → 进入下一个 waypoint；
 * - 有下一个 waypoint：把 `player.body.velocity` 设到朝向单位向量 × speed；
 * - 无下一个 waypoint → 自动 cancel（销毁 overlay + velocity 清零）。
 *
 * cancel 后再被点击就是一条全新路径；多次点击会销毁前一条 overlay 再造新的，
 * 不会泄漏。
 */
export function attachClickMovement(
  scene: Phaser.Scene,
  player: Phaser.Physics.Arcade.Sprite,
  map: IsoMapDef,
  opts: AttachClickMovementOpts = {},
): ClickPathController {
  const speed = opts.speed ?? PLAYER_SPEED;
  const arriveEpsilon = opts.arriveEpsilon ?? 4;

  // 静态可走栅格：地图一经渲染其可走性不变（本阶段没有"动态摧毁 / 建造"机制）。
  const grid: WalkabilityGrid = buildMovementGrid(map);

  // 当前剩余路径：队首是"目标 waypoint"（玩家正朝它走），队尾是终点。
  // 路径在被设置时会丢弃第 0 个元素（起点=玩家脚下），避免"原地转圈"。
  let remaining: GridCell[] = [];
  let overlay: PathOverlayHandle | null = null;

  /** 清空路径并销毁 overlay，玩家速度归零。 */
  const doCancel = (): void => {
    remaining = [];
    if (overlay) {
      overlay.destroy();
      overlay = null;
    }
    const body = player.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.setVelocity(0, 0);
  };

  /** 设置一条新路径（内含 start）。会剥离 path[0]。 */
  const setPath = (path: GridCell[]): void => {
    if (overlay) {
      overlay.destroy();
      overlay = null;
    }
    if (path.length <= 1) {
      remaining = [];
      return;
    }
    remaining = path.slice(1).map((c) => ({ col: c.col, row: c.row }));
    // overlay 基于完整路径绘制（含起点跳过的逻辑在 createPathOverlay 内），
    // 这样视觉上每个 waypoint 都有光点，终点还有环形标记。
    overlay = createPathOverlay(scene, path);
  };

  /** pointerdown 回调：左键生效，其余忽略。 */
  const onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.leftButtonDown()) return;
    const worldPoint = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const start = playerCellFromSprite(player);
    // 玩家脚下异常（越界 / 不可走）→ 放弃本次点击，不影响现有寻路。
    if (start.col < 0 || start.col >= map.cols) return;
    if (start.row < 0 || start.row >= map.rows) return;

    const visualEntry = findLandmarkVisualEntry(
      map,
      grid,
      start,
      worldPoint.x,
      worldPoint.y,
    );
    const wp = screenToWorld(worldPoint.x, worldPoint.y);
    const goal: GridCell =
      visualEntry ?? { col: Math.floor(wp.col), row: Math.floor(wp.row) };
    if (goal.row < 0 || goal.row >= map.rows) return;
    if (goal.col < 0 || goal.col >= map.cols) return;

    const target = findNearestReachableWalkableCell(grid, start, goal, 2);
    if (!target) return;
    const path = findPath(grid, start, target);
    if (!path || path.length === 0) return;
    setPath(path);
  };

  scene.input.on(Phaser.Input.Events.POINTER_DOWN, onPointerDown);

  // 每帧推进 waypoint。
  const update = (_delta: number): void => {
    if (remaining.length === 0) return;
    const body = player.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    // 消耗已到达的 waypoint（可能一次消耗多个，例如玩家被其他逻辑瞬移）。
    while (remaining.length > 0) {
      const wp = remaining[0];
      if (!wp) break;
      const screen = worldToScreen(wp.col, wp.row);
      const targetX = screen.x;
      const targetY = screen.y - TILE_H / 2;
      const dx = targetX - player.x;
      const dy = targetY - player.y;
      if (Math.abs(dx) < arriveEpsilon && Math.abs(dy) < arriveEpsilon) {
        remaining.shift();
        continue;
      }
      // 朝 waypoint 的单位向量乘 speed。
      const len = Math.hypot(dx, dy);
      const vx = (dx / len) * speed;
      const vy = (dy / len) * speed;
      body.setVelocity(vx, vy);
      return;
    }

    // 全部走完：cancel 清理。
    doCancel();
  };

  const destroy = (): void => {
    scene.input.off(Phaser.Input.Events.POINTER_DOWN, onPointerDown);
    doCancel();
  };

  return {
    isPathing(): boolean {
      return remaining.length > 0;
    },
    cancel(): void {
      doCancel();
    },
    update,
    destroy,
    getPath(): ReadonlyArray<GridCell> {
      return remaining;
    },
  };
}

// ---- 常量重导出（保持对外收敛） ----------------------------------------

export { ISO_ORIGIN_X, ISO_ORIGIN_Y, TILE_W, TILE_H };
