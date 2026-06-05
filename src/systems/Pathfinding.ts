import type { IsoMapDef, IsoTileId } from '@/data/maps';

/**
 * 点击寻路与地图可走性判定（FEAT-301）。
 *
 * 职责：
 * - `buildWalkabilityGrid(map)`：根据地图的 ground / props / landmarks 计算一张 boolean
 *   可走表。`grid[row][col] === true` 表示该格可站立。
 * - `findPath(grid, start, goal)`：标准 A*（曼哈顿启发式 + 4 向邻居）求最短路径。
 *
 * 本模块为纯函数，不 import Phaser，方便 Vitest 单测；与 IsoWorldRenderer 的
 * attachClickMovement 组合后才会被 scene 消费。
 *
 * 障碍判定规则（与 FEAT-301 规格一一对应）：
 * - ground 为 `iso_water` 或 `empty` → 不可走；
 * - props 出现以下任一纹理 → 不可走：
 *     `iso_rock` / `iso_tree_pine` / `iso_wall_brick`
 *     / `iso_roof_red` / `iso_roof_blue` / `iso_building_*`；
 * - 每个 landmark 中心点（按 widthInTiles × heightInTiles 展开，默认 1×1）
 *   → 不可走（建筑占位，玩家只能触发邻接 overlap）；
 * - 其他地面 / 装饰（花草 / 沙路 / 石路 / 灌木 / 沙地 / 草地）→ 可走。
 */

/**
 * 二维可走栅格：`grid[row][col]`。`true` 表示可走，`false` 表示障碍。
 */
export type WalkabilityGrid = boolean[][];

/**
 * 世界格坐标。
 */
export interface GridCell {
  readonly col: number;
  readonly row: number;
}

/**
 * props 中被视为"阻挡"的纹理集合。用 Set 方便 O(1) 查表，同时让将来扩充（新增山体/围墙等）
 * 成为单点改动。
 */
const BLOCKING_PROP_TILES: ReadonlySet<IsoTileId> = new Set<IsoTileId>([
  'iso_rock',
  'iso_tree_pine',
  'iso_wall_brick',
  'iso_roof_red',
  'iso_roof_blue',
  'iso_building_gym',
  'iso_building_home',
  'iso_building_shop',
  'iso_building_vip',
  'iso_building_quest',
]);

const WIDE_FOOTPRINT_PROP_TILES: ReadonlySet<IsoTileId> = new Set<IsoTileId>([
  'iso_building_gym',
  'iso_building_home',
  'iso_building_shop',
  'iso_building_vip',
  'iso_building_quest',
]);

/**
 * ground 层本身不可走的瓦片（水面 / 空格）。
 */
const BLOCKING_GROUND_TILES: ReadonlySet<IsoTileId> = new Set<IsoTileId>([
  'iso_water',
  'empty',
]);

/**
 * 计算地图的可走性栅格。
 *
 * 返回值维度 `rows × cols`，即 `grid.length === map.rows`，
 * `grid[r].length === map.cols`。行外 / 列外视为不可走（findPath 的邻居扩展会做边界检查）。
 */
export function buildWalkabilityGrid(map: IsoMapDef): WalkabilityGrid {
  const grid: WalkabilityGrid = [];
  for (let r = 0; r < map.rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < map.cols; c++) {
      const tile = map.ground[r]?.[c];
      // ground 为不可走瓦片或不存在 → 障碍。
      const groundOk = tile !== undefined && !BLOCKING_GROUND_TILES.has(tile);
      row.push(groundOk);
    }
    grid.push(row);
  }

  // props 层覆盖：阻挡类 props 让该格变为不可走。
  for (const prop of map.props) {
    if (!BLOCKING_PROP_TILES.has(prop.tile)) continue;
    const { col, row } = prop;
    if (row < 0 || row >= map.rows) continue;
    if (col < 0 || col >= map.cols) continue;
    const rowArr = grid[row];
    if (rowArr) rowArr[col] = false;
  }

  // landmark 中心按 widthInTiles × heightInTiles 展开，每格都不可走。
  // 玩家只能从 landmark 邻格触发 overlap 进入；建筑本身不可站立。
  for (const lm of map.landmarks) {
    const w = lm.widthInTiles ?? 1;
    const h = lm.heightInTiles ?? 1;
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        const r = lm.row + dr;
        const c = lm.col + dc;
        if (r < 0 || r >= map.rows) continue;
        if (c < 0 || c >= map.cols) continue;
        const rowArr = grid[r];
        if (rowArr) rowArr[c] = false;
      }
    }
  }

  return grid;
}

/**
 * 计算角色实际移动使用的可走性栅格。
 *
 * `buildWalkabilityGrid` 只描述每个地块本身是否可站；等距建筑的图片会向侧面和背后延伸，
 * 如果只禁用中心格，角色仍能从视觉边缘钻进建筑。这里额外封住建筑侧面与背后，
 * 但保留正前方的门口格，方便点击建筑时走到入口。
 */
export function buildMovementGrid(map: IsoMapDef): WalkabilityGrid {
  const base = buildWalkabilityGrid(map);
  const grid = base.map((row) => [...row]);

  for (const prop of map.props) {
    if (!WIDE_FOOTPRINT_PROP_TILES.has(prop.tile)) continue;
    blockBuildingFootprint(grid, base, prop.col, prop.row, 1, 1);
  }

  for (const lm of map.landmarks) {
    if (lm.key.startsWith('portal')) continue;
    blockBuildingFootprint(
      grid,
      base,
      lm.col,
      lm.row,
      lm.widthInTiles ?? 1,
      lm.heightInTiles ?? 1,
    );
  }

  return grid;
}

function blockBuildingFootprint(
  grid: WalkabilityGrid,
  base: WalkabilityGrid,
  col: number,
  row: number,
  widthInTiles: number,
  heightInTiles: number,
): void {
  const width = Math.max(1, widthInTiles);
  const height = Math.max(1, heightInTiles);

  for (let r = row - 2; r <= row + height - 1; r++) {
    for (let c = col - 1; c <= col + width; c++) {
      setGridCell(grid, c, r, false);
    }
  }

  const entryRow = row + height;
  for (let c = col; c < col + width; c++) {
    if (isWalkable(base, c, entryRow)) {
      setGridCell(grid, c, entryRow, true);
    }
  }
}

function setGridCell(
  grid: WalkabilityGrid,
  col: number,
  row: number,
  value: boolean,
): void {
  if (row < 0 || row >= grid.length) return;
  const rowArr = grid[row];
  if (!rowArr) return;
  if (col < 0 || col >= rowArr.length) return;
  rowArr[col] = value;
}

/**
 * 判断某个 `(col, row)` 是否在栅格内且可走。
 */
export function isWalkable(grid: WalkabilityGrid, col: number, row: number): boolean {
  if (row < 0 || row >= grid.length) return false;
  const rowArr = grid[row];
  if (!rowArr) return false;
  if (col < 0 || col >= rowArr.length) return false;
  return rowArr[col] === true;
}

/**
 * 点击到建筑、树或水面等不可走格时，找一个离点击点最近、并且从当前位置可达的可走格。
 *
 * 这让"点商店/道馆本体"的手感更接近老网页社区：角色会走到建筑门口附近，
 * 而不是原地无响应或硬往建筑里挤。
 */
export function findNearestReachableWalkableCell(
  grid: WalkabilityGrid,
  start: GridCell,
  goal: GridCell,
  maxRadius = 2,
): GridCell | null {
  if (!isWalkable(grid, start.col, start.row)) return null;
  if (isWalkable(grid, goal.col, goal.row)) return goal;

  let best: { cell: GridCell; pathLength: number } | null = null;
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (const candidate of cellsAtManhattanRadius(goal, radius)) {
      if (!isWalkable(grid, candidate.col, candidate.row)) continue;
      const path = findPath(grid, start, candidate);
      if (!path) continue;
      if (best === null || path.length < best.pathLength) {
        best = { cell: candidate, pathLength: path.length };
      }
    }
    if (best !== null) return best.cell;
  }

  return null;
}

function cellsAtManhattanRadius(center: GridCell, radius: number): GridCell[] {
  const cells: GridCell[] = [];
  for (let dc = -radius; dc <= radius; dc++) {
    const drAbs = radius - Math.abs(dc);
    cells.push({ col: center.col + dc, row: center.row + drAbs });
    if (drAbs !== 0) {
      cells.push({ col: center.col + dc, row: center.row - drAbs });
    }
  }
  return cells;
}

// ---- A* 寻路 -----------------------------------------------------------

/**
 * A* 开放表节点。
 *
 * - `g`：从 start 走到本节点的实际代价（步数）；
 * - `h`：从本节点到 goal 的启发式（曼哈顿）；
 * - `f = g + h`：优先级；
 * - `parentKey`：指向父节点在 Map 里的 key，用于最终回溯路径。
 */
interface AStarNode {
  readonly col: number;
  readonly row: number;
  readonly g: number;
  readonly h: number;
  readonly f: number;
  readonly parentKey: string | null;
}

/**
 * 曼哈顿距离启发式（4 向邻居时为可采纳 / 一致）。
 */
function manhattan(a: GridCell, b: GridCell): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/**
 * 以 `col,row` 拼接为 Map key。字符串 key 比元组在 JS 里查表更稳定（不需要自定义 hasher）。
 */
function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * 标准 A* 寻路（4 向邻居，曼哈顿启发式）。
 *
 * 约定：
 * - 返回的数组 `[start, ..., goal]` 包含起点与终点；
 * - `start === goal` → 返回 `[start]`；
 * - `goal` 不在栅格内 / 不可走 / 无解 → 返回 `null`；
 * - `start` 不可走时也返回 `null`（玩家脚下异常，交给调用方处理）。
 *
 * 复杂度：最坏 O(N log N)，N 为格子数；本游戏地图最大约 16×12 = 192 格，
 * 这里用"线性扫描选 f 最小节点"足够快，不引入二叉堆避免过度工程。
 */
export function findPath(
  grid: WalkabilityGrid,
  start: GridCell,
  goal: GridCell,
): GridCell[] | null {
  // 起点 / 终点可走性与边界。
  if (!isWalkable(grid, start.col, start.row)) return null;
  if (!isWalkable(grid, goal.col, goal.row)) return null;

  // 起点即终点：返回单元素路径，让调用方 overlay 也有迹可循。
  if (start.col === goal.col && start.row === goal.row) {
    return [{ col: start.col, row: start.row }];
  }

  const open = new Map<string, AStarNode>();
  const closed = new Set<string>();

  const startKey = cellKey(start.col, start.row);
  const startNode: AStarNode = {
    col: start.col,
    row: start.row,
    g: 0,
    h: manhattan(start, goal),
    f: manhattan(start, goal),
    parentKey: null,
  };
  open.set(startKey, startNode);

  // 记录每个格子最终扩展时使用的父节点 + g 值，方便 goal 被锁定后回溯路径。
  const visited = new Map<string, AStarNode>();

  while (open.size > 0) {
    // 线性扫描选 f 最小（同 f 选 h 更小，避免"绕路走"）。
    let currentKey: string | null = null;
    let current: AStarNode | null = null;
    for (const [k, n] of open) {
      if (
        current === null ||
        n.f < current.f ||
        (n.f === current.f && n.h < current.h)
      ) {
        current = n;
        currentKey = k;
      }
    }
    if (current === null || currentKey === null) break;

    open.delete(currentKey);
    closed.add(currentKey);
    visited.set(currentKey, current);

    if (current.col === goal.col && current.row === goal.row) {
      return reconstructPath(visited, currentKey);
    }

    for (const [dc, dr] of NEIGHBOR_OFFSETS) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (!isWalkable(grid, nc, nr)) continue;
      const nKey = cellKey(nc, nr);
      if (closed.has(nKey)) continue;

      const tentativeG = current.g + 1;
      const existing = open.get(nKey);
      if (existing !== undefined && tentativeG >= existing.g) continue;

      const h = manhattan({ col: nc, row: nr }, goal);
      open.set(nKey, {
        col: nc,
        row: nr,
        g: tentativeG,
        h,
        f: tentativeG + h,
        parentKey: currentKey,
      });
    }
  }

  return null;
}

/**
 * 4 向邻居偏移：东、南、西、北。斜向暂不支持，等距地图按 4 向足以表达大多数路径。
 */
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * 从 visited 表按 parentKey 链回溯路径，返回 [start, ..., goal] 顺序的格子序列。
 */
function reconstructPath(
  visited: Map<string, AStarNode>,
  goalKey: string,
): GridCell[] {
  const path: GridCell[] = [];
  let cursor: string | null = goalKey;
  while (cursor !== null) {
    const node = visited.get(cursor);
    if (!node) break;
    path.push({ col: node.col, row: node.row });
    cursor = node.parentKey;
  }
  path.reverse();
  return path;
}
