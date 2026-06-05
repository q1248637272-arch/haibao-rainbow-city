import { describe, expect, it } from 'vitest';

import { BEACH, RAINBOW_CITY, type IsoMapDef, type IsoPropCell, type IsoTileId } from '@/data/maps';
import {
  buildMovementGrid,
  buildWalkabilityGrid,
  findPath,
  findNearestReachableWalkableCell,
  isWalkable,
  type GridCell,
  type WalkabilityGrid,
} from '@/systems/Pathfinding';

/**
 * FEAT-301 点击寻路纯逻辑覆盖。
 *
 * 只测 Pathfinding 纯函数：buildWalkabilityGrid / findPath / isWalkable。
 * Phaser 侧的 attachClickMovement 走编译级校验（typecheck + build），不做 Vitest 集成测试。
 */

// ---- 测试辅助：构造小型合成地图 ---------------------------------------

function makeGroundFill(rows: number, cols: number, tile: IsoTileId): IsoTileId[][] {
  const grid: IsoTileId[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: IsoTileId[] = [];
    for (let c = 0; c < cols; c++) row.push(tile);
    grid.push(row);
  }
  return grid;
}

function makeMap(
  rows: number,
  cols: number,
  opts: {
    readonly groundOverrides?: ReadonlyArray<{ col: number; row: number; tile: IsoTileId }>;
    readonly props?: readonly IsoPropCell[];
    readonly landmarks?: ReadonlyArray<{
      col: number;
      row: number;
      key?: string;
      widthInTiles?: number;
      heightInTiles?: number;
    }>;
  } = {},
): IsoMapDef {
  const ground = makeGroundFill(rows, cols, 'iso_grass');
  for (const o of opts.groundOverrides ?? []) {
    const row = ground[o.row];
    if (row) row[o.col] = o.tile;
  }
  // IsoMapDef 的 id 限制为 'rainbow_city' | 'beach'，合成地图复用 'rainbow_city' 做结构匹配。
  return {
    id: 'rainbow_city',
    name: 'synthetic',
    cols,
    rows,
    ground,
    props: opts.props ?? [],
    landmarks: (opts.landmarks ?? []).map((lm) => ({
      col: lm.col,
      row: lm.row,
      key: lm.key ?? `lm_${lm.col}_${lm.row}`,
      label: lm.key ?? 'lm',
      target: null,
      pendingMessage: '占位',
      ...(lm.widthInTiles !== undefined ? { widthInTiles: lm.widthInTiles } : {}),
      ...(lm.heightInTiles !== undefined ? { heightInTiles: lm.heightInTiles } : {}),
    })),
    encounterZones: [],
    spawn: { col: 0, row: 0 },
  };
}

/** path 必须是 `[start, ..., goal]` 序列；检查每一步都在 4 邻接。 */
function assertValidPathShape(
  path: GridCell[],
  start: GridCell,
  goal: GridCell,
): void {
  expect(path.length).toBeGreaterThanOrEqual(1);
  const first = path[0];
  const last = path[path.length - 1];
  expect(first).toBeDefined();
  expect(last).toBeDefined();
  if (!first || !last) return;
  expect(first.col).toBe(start.col);
  expect(first.row).toBe(start.row);
  expect(last.col).toBe(goal.col);
  expect(last.row).toBe(goal.row);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) throw new Error('path 元素缺失');
    const d = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
    expect(d).toBe(1);
  }
}

// ---- buildWalkabilityGrid -----------------------------------------------

describe('buildWalkabilityGrid (FEAT-301)', () => {
  it('全草地 5×5 默认 25 格全部可走', () => {
    const map = makeMap(5, 5);
    const grid = buildWalkabilityGrid(map);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        expect(isWalkable(grid, c, r)).toBe(true);
      }
    }
  });

  it('ground 为 iso_water / empty 的格子不可走', () => {
    const map = makeMap(3, 3, {
      groundOverrides: [
        { col: 1, row: 1, tile: 'iso_water' },
        { col: 2, row: 2, tile: 'empty' },
      ],
    });
    const grid = buildWalkabilityGrid(map);
    expect(isWalkable(grid, 1, 1)).toBe(false);
    expect(isWalkable(grid, 2, 2)).toBe(false);
    expect(isWalkable(grid, 0, 0)).toBe(true);
  });

  it('props 中 iso_rock / iso_tree_pine / iso_wall_brick / iso_roof_red / iso_roof_blue 均视为障碍', () => {
    const map = makeMap(2, 5, {
      props: [
        { col: 0, row: 1, tile: 'iso_rock' },
        { col: 1, row: 1, tile: 'iso_tree_pine' },
        { col: 2, row: 1, tile: 'iso_wall_brick' },
        { col: 3, row: 1, tile: 'iso_roof_red' },
        { col: 4, row: 1, tile: 'iso_roof_blue' },
      ],
    });
    const grid = buildWalkabilityGrid(map);
    for (let c = 0; c < 5; c++) {
      expect(isWalkable(grid, c, 1)).toBe(false);
    }
    // 第 0 行未被阻挡。
    for (let c = 0; c < 5; c++) {
      expect(isWalkable(grid, c, 0)).toBe(true);
    }
  });

  it('新增建筑素材均视为障碍，避免角色穿进建筑底座', () => {
    const map = makeMap(1, 5, {
      props: [
        { col: 0, row: 0, tile: 'iso_building_gym' },
        { col: 1, row: 0, tile: 'iso_building_home' },
        { col: 2, row: 0, tile: 'iso_building_shop' },
        { col: 3, row: 0, tile: 'iso_building_vip' },
        { col: 4, row: 0, tile: 'iso_building_quest' },
      ],
    });
    const grid = buildWalkabilityGrid(map);
    for (let c = 0; c < 5; c++) {
      expect(isWalkable(grid, c, 0)).toBe(false);
    }
  });

  it('非阻挡 props（iso_bush / iso_grass_flower）不影响可走性', () => {
    const map = makeMap(2, 2, {
      props: [
        { col: 0, row: 0, tile: 'iso_bush' },
        { col: 1, row: 1, tile: 'iso_grass_flower' },
      ],
    });
    const grid = buildWalkabilityGrid(map);
    expect(isWalkable(grid, 0, 0)).toBe(true);
    expect(isWalkable(grid, 1, 1)).toBe(true);
  });

  it('landmark 中心按 widthInTiles × heightInTiles 展开均不可走，邻格仍可走', () => {
    const map = makeMap(4, 4, {
      landmarks: [{ col: 1, row: 1, widthInTiles: 2, heightInTiles: 2, key: 'L' }],
    });
    const grid = buildWalkabilityGrid(map);
    // 2×2 占位不可走。
    expect(isWalkable(grid, 1, 1)).toBe(false);
    expect(isWalkable(grid, 2, 1)).toBe(false);
    expect(isWalkable(grid, 1, 2)).toBe(false);
    expect(isWalkable(grid, 2, 2)).toBe(false);
    // 邻格可走。
    expect(isWalkable(grid, 0, 1)).toBe(true);
    expect(isWalkable(grid, 3, 1)).toBe(true);
    expect(isWalkable(grid, 1, 0)).toBe(true);
    expect(isWalkable(grid, 1, 3)).toBe(true);
  });
});

// ---- findPath ----------------------------------------------------------

describe('findPath (FEAT-301)', () => {
  it('空地直线：起点到同行的终点路径长度 = 步数 + 1', () => {
    const map = makeMap(3, 6);
    const grid = buildWalkabilityGrid(map);
    const start: GridCell = { col: 0, row: 1 };
    const goal: GridCell = { col: 5, row: 1 };
    const path = findPath(grid, start, goal);
    expect(path).not.toBeNull();
    if (!path) return;
    assertValidPathShape(path, start, goal);
    expect(path.length).toBe(6);
  });

  it('绕障碍：中间一堵墙迫使路径至少走 7 步', () => {
    // 5×5 地图：在 col=2 的第 0~3 行铺岩石，第 4 行留一个缺口。
    const map = makeMap(5, 5, {
      props: [
        { col: 2, row: 0, tile: 'iso_rock' },
        { col: 2, row: 1, tile: 'iso_rock' },
        { col: 2, row: 2, tile: 'iso_rock' },
        { col: 2, row: 3, tile: 'iso_rock' },
      ],
    });
    const grid = buildWalkabilityGrid(map);
    const start: GridCell = { col: 0, row: 0 };
    const goal: GridCell = { col: 4, row: 0 };
    const path = findPath(grid, start, goal);
    expect(path).not.toBeNull();
    if (!path) return;
    assertValidPathShape(path, start, goal);
    // 直线距离 4，绕到 row=4 缺口至少 4 步下去 + 4 步回来 + 4 步横走 = 12 步（13 个格子）。
    expect(path.length).toBeGreaterThanOrEqual(8);
    // 不得经过任何岩石格。
    for (const cell of path) {
      expect(isWalkable(grid, cell.col, cell.row)).toBe(true);
    }
  });

  it('起点 === 终点时返回 [start]（单元素路径）', () => {
    const map = makeMap(3, 3);
    const grid = buildWalkabilityGrid(map);
    const s: GridCell = { col: 1, row: 1 };
    const path = findPath(grid, s, s);
    expect(path).not.toBeNull();
    if (!path) return;
    expect(path.length).toBe(1);
    const first = path[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.col).toBe(1);
    expect(first.row).toBe(1);
  });

  it('终点不可走（岩石 / landmark 中心）时返回 null', () => {
    const map = makeMap(3, 3, {
      props: [{ col: 2, row: 2, tile: 'iso_rock' }],
      landmarks: [{ col: 0, row: 2, key: 'L' }],
    });
    const grid = buildWalkabilityGrid(map);
    expect(findPath(grid, { col: 0, row: 0 }, { col: 2, row: 2 })).toBeNull();
    expect(findPath(grid, { col: 1, row: 0 }, { col: 0, row: 2 })).toBeNull();
  });

  it('孤岛 / 无解：目标四面被障碍包围，findPath 返回 null', () => {
    // 把 (2,2) 四个邻居都封死。(2,2) 本身可走，但从 (0,0) 过去无解。
    const map = makeMap(5, 5, {
      props: [
        { col: 2, row: 1, tile: 'iso_rock' },
        { col: 2, row: 3, tile: 'iso_rock' },
        { col: 1, row: 2, tile: 'iso_rock' },
        { col: 3, row: 2, tile: 'iso_rock' },
      ],
    });
    const grid = buildWalkabilityGrid(map);
    // 预检：(2,2) 自身可走，但邻居全被锁。
    expect(isWalkable(grid, 2, 2)).toBe(true);
    const path = findPath(grid, { col: 0, row: 0 }, { col: 2, row: 2 });
    expect(path).toBeNull();
  });

  it('起点不可走时返回 null（防御性）', () => {
    const map = makeMap(3, 3, { props: [{ col: 0, row: 0, tile: 'iso_rock' }] });
    const grid = buildWalkabilityGrid(map);
    expect(findPath(grid, { col: 0, row: 0 }, { col: 2, row: 2 })).toBeNull();
  });

  it('4 方向邻居：同一曼哈顿距离下路径长度 = 距离 + 1', () => {
    const map = makeMap(5, 5);
    const grid = buildWalkabilityGrid(map);
    const start: GridCell = { col: 0, row: 0 };
    const goal: GridCell = { col: 3, row: 2 };
    const path = findPath(grid, start, goal);
    expect(path).not.toBeNull();
    if (!path) return;
    assertValidPathShape(path, start, goal);
    expect(path.length).toBe(3 + 2 + 1);
  });
});

describe('findNearestReachableWalkableCell (点击建筑时走到门口)', () => {
  it('目标不可走时返回附近可达的可走格', () => {
    const map = makeMap(5, 5, {
      props: [{ col: 2, row: 2, tile: 'iso_building_shop' }],
    });
    const grid = buildWalkabilityGrid(map);
    const target = findNearestReachableWalkableCell(
      grid,
      { col: 0, row: 2 },
      { col: 2, row: 2 },
      1,
    );
    expect(target).not.toBeNull();
    if (!target) return;
    expect(isWalkable(grid, target.col, target.row)).toBe(true);
    expect(Math.abs(target.col - 2) + Math.abs(target.row - 2)).toBe(1);
  });

  it('不可走目标周围没有可达格时返回 null', () => {
    const map = makeMap(3, 3, {
      props: [
        { col: 1, row: 1, tile: 'iso_building_gym' },
        { col: 0, row: 1, tile: 'iso_rock' },
        { col: 2, row: 1, tile: 'iso_rock' },
        { col: 1, row: 0, tile: 'iso_rock' },
        { col: 1, row: 2, tile: 'iso_rock' },
      ],
    });
    const grid = buildWalkabilityGrid(map);
    expect(
      findNearestReachableWalkableCell(grid, { col: 0, row: 0 }, { col: 1, row: 1 }, 1),
    ).toBeNull();
  });
});

describe('buildMovementGrid (建筑视觉占位)', () => {
  it('建筑会额外封住侧面和背后，但保留正前方门口', () => {
    const map = makeMap(5, 5, {
      props: [{ col: 2, row: 2, tile: 'iso_building_shop' }],
    });
    const grid = buildMovementGrid(map);

    expect(isWalkable(grid, 2, 2)).toBe(false);
    expect(isWalkable(grid, 1, 2)).toBe(false);
    expect(isWalkable(grid, 3, 2)).toBe(false);
    expect(isWalkable(grid, 2, 1)).toBe(false);
    expect(isWalkable(grid, 1, 1)).toBe(false);
    expect(isWalkable(grid, 3, 1)).toBe(false);
    expect(isWalkable(grid, 2, 0)).toBe(false);
    expect(isWalkable(grid, 2, 3)).toBe(true);
  });

  it('真实彩虹城里，道馆侧后方不可走，门口仍可达', () => {
    const grid = buildMovementGrid(RAINBOW_CITY);

    expect(isWalkable(grid, 6, 6)).toBe(false);
    expect(isWalkable(grid, 5, 6)).toBe(false);
    expect(isWalkable(grid, 7, 6)).toBe(false);
    expect(isWalkable(grid, 6, 5)).toBe(false);
    expect(isWalkable(grid, 6, 4)).toBe(false);
    expect(isWalkable(grid, 6, 7)).toBe(true);

    const target = findNearestReachableWalkableCell(
      grid,
      { col: RAINBOW_CITY.spawn.col, row: RAINBOW_CITY.spawn.row },
      { col: 6, row: 6 },
      2,
    );
    expect(target).toEqual({ col: 6, row: 7 });
  });
});

// ---- 真实地图回归 -------------------------------------------------------

describe('findPath 在真实地图上（FEAT-301 验收）', () => {
  it('彩虹城 spawn 可走；道馆中心 (6,6) 不可走，但其邻格 (6,7) 可走', () => {
    const grid: WalkabilityGrid = buildWalkabilityGrid(RAINBOW_CITY);
    const { col, row } = RAINBOW_CITY.spawn;
    expect(isWalkable(grid, col, row)).toBe(true);
    // 道馆 landmark.col=6, row=6 → 不可走。
    expect(isWalkable(grid, 6, 6)).toBe(false);
    // 邻格 (6,7) 可走（草地无阻挡 prop）。
    expect(isWalkable(grid, 6, 7)).toBe(true);
  });

  it('彩虹城 spawn → 道馆邻格 (6,7) 能找到路径且路径不经过 landmark 中心', () => {
    const grid = buildWalkabilityGrid(RAINBOW_CITY);
    const start = { col: RAINBOW_CITY.spawn.col, row: RAINBOW_CITY.spawn.row };
    const goal = { col: 6, row: 7 };
    const path = findPath(grid, start, goal);
    expect(path).not.toBeNull();
    if (!path) return;
    assertValidPathShape(path, start, goal);
    // 路径长度合理（曼哈顿距离 1，应为 2 格）。
    expect(path.length).toBe(2);
    // 路径不得经过任何 landmark 中心（尤其道馆 (6,6)）。
    for (const cell of path) {
      expect(isWalkable(grid, cell.col, cell.row)).toBe(true);
    }
  });

  it('彩虹城 spawn → 海滨传送门 (10,9) 能找到路径', () => {
    const grid = buildWalkabilityGrid(RAINBOW_CITY);
    const start = { col: RAINBOW_CITY.spawn.col, row: RAINBOW_CITY.spawn.row };
    // portal_beach landmark 在 (10,9)，landmark 本身不可走；从 spawn 走到邻格 (10,8) 即可。
    const goal = { col: 10, row: 8 };
    const path = findPath(grid, start, goal);
    expect(path).not.toBeNull();
    if (!path) return;
    assertValidPathShape(path, start, goal);
  });

  it('海滨 spawn (8,10) 可走，且到 portal_back 邻格 (1,6) 有路径（绕开沙滩南侧的 bush/树障碍）', () => {
    const grid = buildWalkabilityGrid(BEACH);
    expect(isWalkable(grid, BEACH.spawn.col, BEACH.spawn.row)).toBe(true);
    // portal_back landmark 在 (0,6)，不可走。邻格 (1,6) 是 path_dirt，可走。
    expect(isWalkable(grid, 0, 6)).toBe(false);
    expect(isWalkable(grid, 1, 6)).toBe(true);
    const path = findPath(
      grid,
      { col: BEACH.spawn.col, row: BEACH.spawn.row },
      { col: 1, row: 6 },
    );
    expect(path).not.toBeNull();
    if (!path) return;
    assertValidPathShape(
      path,
      { col: BEACH.spawn.col, row: BEACH.spawn.row },
      { col: 1, row: 6 },
    );
    // 路径不得落在水面。
    for (const cell of path) {
      expect(isWalkable(grid, cell.col, cell.row)).toBe(true);
    }
  });

  it('海滨北侧水面不可走：从沙滩走到水面格返回 null', () => {
    const grid = buildWalkabilityGrid(BEACH);
    // 北 5 行 (row 0..4) 全部水面。
    expect(isWalkable(grid, 5, 2)).toBe(false);
    const path = findPath(
      grid,
      { col: BEACH.spawn.col, row: BEACH.spawn.row },
      { col: 5, row: 2 },
    );
    expect(path).toBeNull();
  });

  it('彩虹城 4 个建筑 landmark（home/shop/quest/gym）中心均不可走', () => {
    const grid = buildWalkabilityGrid(RAINBOW_CITY);
    for (const lm of RAINBOW_CITY.landmarks) {
      // portal_beach 是通行点（只标记 path_dirt 瓦片），中心也不可走，符合"任何 landmark 中心皆障碍"。
      expect(isWalkable(grid, lm.col, lm.row)).toBe(false);
    }
  });
});
