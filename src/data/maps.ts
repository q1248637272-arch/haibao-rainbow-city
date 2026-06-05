import { SceneKey, type SceneKeyValue } from '@/config/GameConfig';

/**
 * 等距地图上可以铺的瓦片 ID。
 *
 * 前 12 个对应 FEAT-201 在 PreloadScene 预加载的 Kenney CC0 纹理 key
 * （见 src/scenes/PreloadScene.ts 的 ISO_LANDSCAPE_TILES），顺序和那里一一对应；
 * 最后的 `empty` 表示"不铺任何图"，用于留出走道 / 透空格。
 */
export type IsoTileId =
  | 'iso_grass'
  | 'iso_grass_flower'
  | 'iso_sand'
  | 'iso_water'
  | 'iso_path_dirt'
  | 'iso_path_stone'
  | 'iso_wall_brick'
  | 'iso_roof_red'
  | 'iso_roof_blue'
  | 'iso_tree_pine'
  | 'iso_rock'
  | 'iso_bush'
  | 'iso_building_gym'
  | 'iso_building_home'
  | 'iso_building_shop'
  | 'iso_building_vip'
  | 'iso_building_quest'
  | 'empty';

/**
 * 装饰层单元（props layer）。稀疏列表，不铺满地图，仅在指定 (col, row) 叠加一个高物。
 */
export interface IsoPropCell {
  readonly col: number;
  readonly row: number;
  readonly tile: IsoTileId;
}

/**
 * 地标（建筑门口 / 传送门）。玩家与 zone overlap 时：
 *   - `target` 非 null：`scene.start(target)`；
 *   - `target` 为 null：调用方弹出 `pendingMessage` toast。
 *
 * `widthInTiles` / `heightInTiles` 可选：未指定视作 1×1。
 */
export interface IsoLandmark {
  readonly col: number;
  readonly row: number;
  readonly widthInTiles?: number;
  readonly heightInTiles?: number;
  readonly key: string;
  readonly label: string;
  readonly target: SceneKeyValue | null;
  readonly pendingMessage?: string;
}

/**
 * 野生遭遇区（草丛 / 礁石）。`zoneId` 指向 src/data/encounters.ts 的 ENCOUNTERS key。
 */
export interface IsoEncounterZone {
  readonly col: number;
  readonly row: number;
  readonly zoneId: string;
}

/**
 * 等距地图定义。所有二维索引采用 [row][col]；row/col 均为 0-based。
 *
 * 约束：
 *   - `ground` 的维度必须是 `rows × cols`，即 `ground.length === rows`，
 *     每行 `ground[r].length === cols`；tests/maps.test.ts 会做结构校验。
 *   - `props` / `landmarks` / `encounterZones` 中的 col/row 必须落在 [0, cols-1] / [0, rows-1]。
 *   - `spawn` 必须落在地图内。
 */
export interface IsoMapDef {
  readonly id: 'rainbow_city' | 'beach';
  readonly name: string;
  readonly cols: number;
  readonly rows: number;
  readonly ground: readonly (readonly IsoTileId[])[];
  readonly props: readonly IsoPropCell[];
  readonly landmarks: readonly IsoLandmark[];
  readonly encounterZones: readonly IsoEncounterZone[];
  readonly spawn: { readonly col: number; readonly row: number };
}

// ---- 工具：生成铺底矩阵 -----------------------------------------------

/**
 * 生成一张 rows × cols 的铺底矩阵。
 * `baseTile` 主瓦片，`flowerTile` 每 `flowerPeriod` 格点缀一个（取模判定，保证分布稳定可回放）。
 */
function makeGroundWithFlowers(
  rows: number,
  cols: number,
  baseTile: IsoTileId,
  flowerTile: IsoTileId,
  flowerPeriod: number,
): IsoTileId[][] {
  const grid: IsoTileId[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: IsoTileId[] = [];
    for (let c = 0; c < cols; c++) {
      // 用 (r * 3 + c) % period === 0 做伪随机点缀，避免棋盘感且可重现。
      const hit = (r * 3 + c * 2) % flowerPeriod === 0 && !(r === 0 && c === 0);
      row.push(hit ? flowerTile : baseTile);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * 生成海滨沙滩的铺底：北 `waterRows` 行海水 + 南 `rows - waterRows` 行沙地。
 */
function makeBeachGround(rows: number, cols: number, waterRows: number): IsoTileId[][] {
  const grid: IsoTileId[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: IsoTileId[] = [];
    const tile: IsoTileId = r < waterRows ? 'iso_water' : 'iso_sand';
    for (let c = 0; c < cols; c++) {
      row.push(tile);
    }
    grid.push(row);
  }
  return grid;
}

// ---- 彩虹城 -----------------------------------------------------------

const RAINBOW_CITY_COLS = 12;
const RAINBOW_CITY_ROWS = 12;

function makeRainbowCityGround(): IsoTileId[][] {
  const ground = makeGroundWithFlowers(
    RAINBOW_CITY_ROWS,
    RAINBOW_CITY_COLS,
    'iso_grass',
    'iso_grass_flower',
    5,
  );

  // 主干路：把几个可玩入口串起来，进入地图后不用靠猜。
  for (let c = 1; c <= 10; c++) {
    const lowerLoop = ground[8];
    if (lowerLoop) lowerLoop[c] = 'iso_path_stone';
  }
  for (let r = 1; r <= 9; r++) {
    const row = ground[r];
    if (row) {
      row[1] = 'iso_path_stone';
      row[6] = 'iso_path_stone';
      row[10] = 'iso_path_stone';
    }
  }
  for (const [col, row] of [
    [6, 6],
    [1, 1],
    [10, 1],
    [10, 4],
    [1, 9],
    [10, 9],
  ] satisfies Array<readonly [number, number]>) {
    const rowArr = ground[row];
    if (rowArr) rowArr[col] = 'iso_path_dirt';
  }

  return ground;
}

/**
 * 彩虹城等距地图：12×12 花园 + 中央 3×2 砖砌道馆 + 四角家园/商店/任务板/海滨传送门 + 草丛遭遇区。
 *
 * 坐标约定：col 向东递增，row 向南递增；spawn 放在南侧中间（玩家入场即抬头看见道馆）。
 */
export const RAINBOW_CITY: IsoMapDef = {
  id: 'rainbow_city',
  name: '彩虹城',
  cols: RAINBOW_CITY_COLS,
  rows: RAINBOW_CITY_ROWS,
  ground: makeRainbowCityGround(),
  props: [
    // 五个主要地点：用 CC0 建筑素材替换原先的墙/屋顶占位。
    { col: 6, row: 6, tile: 'iso_building_gym' },
    { col: 1, row: 1, tile: 'iso_building_home' },
    { col: 10, row: 1, tile: 'iso_building_shop' },
    { col: 10, row: 4, tile: 'iso_building_vip' },
    { col: 1, row: 9, tile: 'iso_building_quest' },
    // 草丛遭遇区的视觉：与 encounterZones 中的坐标对齐，让玩家看到草丛在哪里。
    { col: 3, row: 3, tile: 'iso_bush' },
    { col: 8, row: 4, tile: 'iso_bush' },
    { col: 2, row: 7, tile: 'iso_bush' },
    { col: 9, row: 6, tile: 'iso_bush' },
    // 几颗装饰树与石头，打破大面积草地的单调。
    { col: 4, row: 2, tile: 'iso_tree_pine' },
    { col: 9, row: 2, tile: 'iso_tree_pine' },
    { col: 2, row: 10, tile: 'iso_rock' },
    { col: 10, row: 10, tile: 'iso_rock' },
  ],
  landmarks: [
    // 中央道馆入口（与 props 的 (6,6) roof 对齐，玩家走近即触发进馆）。
    {
      col: 6,
      row: 6,
      widthInTiles: 1,
      heightInTiles: 1,
      key: 'gym',
      label: '精灵道馆',
      target: SceneKey.GYM,
    },
    // 四角建筑：home / shop / quest 三个占位地标。
    {
      col: 1,
      row: 1,
      key: 'home',
      label: '家园',
      target: SceneKey.HOME,
    },
    {
      col: 10,
      row: 1,
      key: 'shop',
      label: '商店',
      target: SceneKey.SHOP,
    },
    {
      col: 1,
      row: 9,
      key: 'quest',
      label: '任务板',
      target: SceneKey.QUEST_BOARD,
    },
    // 签到殿：连续签到领取大量奖励，第 3 天解锁 VIP。
    {
      col: 10,
      row: 4,
      key: 'vip_panel',
      label: '签到殿',
      target: SceneKey.VIP_PANEL,
    },
    // 海滨传送门：与 props 里 (10,9) 的 iso_path_dirt 对齐。
    // 仅保留 target，不写 pendingMessage：target!==null 时 overlap 路由直接走 onPortal，
    // pendingMessage 永远读不到；放一条死字符串反而容易在 target 临时下线时误导用户。
    {
      col: 10,
      row: 9,
      key: 'portal_beach',
      label: '海滨小径',
      target: SceneKey.BEACH,
    },
  ],
  encounterZones: [
    { col: 3, row: 3, zoneId: 'rainbow_city:garden' },
    { col: 8, row: 4, zoneId: 'rainbow_city:garden' },
    { col: 2, row: 7, zoneId: 'rainbow_city:garden' },
    { col: 9, row: 6, zoneId: 'rainbow_city:garden' },
  ],
  spawn: { col: 6, row: 8 },
} as const;

// ---- 海滨沙滩 ---------------------------------------------------------

const BEACH_COLS = 16;
const BEACH_ROWS = 12;
const BEACH_WATER_ROWS = 5;

/**
 * 海滨沙滩等距地图：16×12，北 5 行海水、南 7 行沙地，中间一条横贯的土路沙滩小径。
 *
 * 地标只有西北 portal_back 回到彩虹城；encounterZones 散布在沙滩南侧 6 个格子。
 */
function makeBeachPropsAndGround(): { ground: IsoTileId[][]; props: IsoPropCell[] } {
  const ground = makeBeachGround(BEACH_ROWS, BEACH_COLS, BEACH_WATER_ROWS);
  // 中间（row=6）横贯一条土路沙滩小径，贯穿整张地图东西。
  for (let c = 0; c < BEACH_COLS; c++) {
    const row = ground[6];
    if (row) row[c] = 'iso_path_dirt';
  }
  const props: IsoPropCell[] = [
    // 沙滩南侧三颗松树点缀（spawn 在 (8,10)，松树避开该格放到 (9,10)）。
    { col: 3, row: 9, tile: 'iso_tree_pine' },
    { col: 9, row: 10, tile: 'iso_tree_pine' },
    { col: 13, row: 9, tile: 'iso_tree_pine' },
    // 礁石点缀，分布在沙滩上。
    { col: 5, row: 8, tile: 'iso_rock' },
    { col: 11, row: 8, tile: 'iso_rock' },
    { col: 2, row: 11, tile: 'iso_rock' },
    // 6 个草丛 / 灌木视觉点，与 encounterZones 对齐。
    { col: 4, row: 7, tile: 'iso_bush' },
    { col: 7, row: 8, tile: 'iso_bush' },
    { col: 10, row: 7, tile: 'iso_bush' },
    { col: 6, row: 11, tile: 'iso_bush' },
    { col: 12, row: 10, tile: 'iso_bush' },
    { col: 14, row: 11, tile: 'iso_bush' },
  ];
  return { ground, props };
}

const { ground: BEACH_GROUND, props: BEACH_PROPS } = makeBeachPropsAndGround();

export const BEACH: IsoMapDef = {
  id: 'beach',
  name: '海滨沙滩',
  cols: BEACH_COLS,
  rows: BEACH_ROWS,
  ground: BEACH_GROUND,
  props: BEACH_PROPS,
  landmarks: [
    // 西侧沙滩小径入口：回到彩虹城。放在 (0, 6) 使玩家沿路径走到西端自然触发。
    // 仅保留 target（同 portal_beach，target!==null 时 pendingMessage 永不读）。
    {
      col: 0,
      row: 6,
      key: 'portal_back',
      label: '回彩虹城',
      target: SceneKey.WORLD,
    },
  ],
  encounterZones: [
    { col: 4, row: 7, zoneId: 'beach:shoreline' },
    { col: 7, row: 8, zoneId: 'beach:shoreline' },
    { col: 10, row: 7, zoneId: 'beach:shoreline' },
    { col: 6, row: 11, zoneId: 'beach:shoreline' },
    { col: 12, row: 10, zoneId: 'beach:shoreline' },
    { col: 14, row: 11, zoneId: 'beach:shoreline' },
  ],
  spawn: { col: 8, row: 10 },
} as const;

/**
 * 按 id 取地图。配合 noUncheckedIndexedAccess 的严格模式使用。
 */
export const MAPS: Record<'rainbow_city' | 'beach', IsoMapDef> = {
  rainbow_city: RAINBOW_CITY,
  beach: BEACH,
};
