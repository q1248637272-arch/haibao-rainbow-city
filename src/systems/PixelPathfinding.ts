import { findPath, type GridCell, type WalkabilityGrid } from '@/systems/Pathfinding';

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface PixelBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface PixelPathOptions {
  readonly bounds: PixelBounds;
  readonly start: PixelPoint;
  readonly target: PixelPoint;
  readonly isWalkable: (x: number, y: number) => boolean;
  readonly cellSize?: number;
  readonly sampleStep?: number;
  readonly maxTargetSearchRadius?: number;
}

const DEFAULT_CELL_SIZE = 24;
const DEFAULT_MAX_TARGET_SEARCH_RADIUS = 12;

export function findPixelPath(options: PixelPathOptions): PixelPoint[] | null {
  const cellSize = Math.max(8, options.cellSize ?? DEFAULT_CELL_SIZE);
  const sampleStep = Math.max(4, options.sampleStep ?? Math.floor(cellSize / 3));
  const start = clampPoint(options.start, options.bounds);
  const target = clampPoint(options.target, options.bounds);

  if (
    isSegmentWalkable(start, target, options.isWalkable, sampleStep) &&
    options.isWalkable(target.x, target.y)
  ) {
    return [start, target];
  }

  const gridInfo = buildPixelGrid(options.bounds, cellSize, options.isWalkable);
  const startCell = nearestWalkableCell(gridInfo, start);
  if (!startCell) return null;

  const targetGuess = pointToCell(gridInfo, target);
  const targetCell = nearestReachableCell(
    gridInfo.grid,
    gridInfo,
    startCell,
    targetGuess,
    target,
    options.maxTargetSearchRadius ?? DEFAULT_MAX_TARGET_SEARCH_RADIUS,
  );
  if (!targetCell) return null;

  const cellPath = findPath(gridInfo.grid, startCell, targetCell);
  if (!cellPath || cellPath.length === 0) return null;

  const rawPath: PixelPoint[] = [start];
  for (const cell of cellPath.slice(1)) {
    rawPath.push(cellToPoint(gridInfo, cell));
  }

  const last = rawPath[rawPath.length - 1];
  if (
    last &&
    (Math.abs(last.x - target.x) > 1 || Math.abs(last.y - target.y) > 1) &&
    options.isWalkable(target.x, target.y) &&
    isSegmentWalkable(last, target, options.isWalkable, sampleStep)
  ) {
    rawPath.push(target);
  }

  return simplifyPixelPath(rawPath, options.isWalkable, sampleStep);
}

interface PixelGridInfo {
  readonly bounds: PixelBounds;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly grid: WalkabilityGrid;
}

function buildPixelGrid(
  bounds: PixelBounds,
  cellSize: number,
  isWalkable: (x: number, y: number) => boolean,
): PixelGridInfo {
  const cols = Math.floor((bounds.right - bounds.left) / cellSize) + 1;
  const rows = Math.floor((bounds.bottom - bounds.top) / cellSize) + 1;
  const grid: WalkabilityGrid = [];

  for (let row = 0; row < rows; row += 1) {
    const gridRow: boolean[] = [];
    for (let col = 0; col < cols; col += 1) {
      const point = cellToPoint({ bounds, cellSize, cols, rows, grid: [] }, { col, row });
      gridRow.push(isWalkable(point.x, point.y));
    }
    grid.push(gridRow);
  }

  return { bounds, cellSize, cols, rows, grid };
}

function nearestWalkableCell(info: PixelGridInfo, point: PixelPoint): GridCell | null {
  const guess = pointToCell(info, point);
  for (let radius = 0; radius <= 8; radius += 1) {
    let best: { readonly cell: GridCell; readonly distance: number } | null = null;
    for (const candidate of cellsAtRadius(guess, radius)) {
      if (!isGridWalkable(info.grid, candidate)) continue;
      const sample = cellToPoint(info, candidate);
      const distance = Math.hypot(sample.x - point.x, sample.y - point.y);
      if (best === null || distance < best.distance) {
        best = { cell: candidate, distance };
      }
    }
    if (best !== null) return best.cell;
  }
  return null;
}

function nearestReachableCell(
  grid: WalkabilityGrid,
  info: PixelGridInfo,
  start: GridCell,
  goal: GridCell,
  goalPoint: PixelPoint,
  maxRadius: number,
): GridCell | null {
  let best: { readonly cell: GridCell; readonly distance: number; readonly pathLength: number } | null =
    null;

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (const candidate of cellsAtRadius(goal, radius)) {
      if (!isGridWalkable(grid, candidate)) continue;
      const path = findPath(grid, start, candidate);
      if (!path) continue;
      const point = cellToPoint(info, candidate);
      const distance = Math.hypot(point.x - goalPoint.x, point.y - goalPoint.y);
      if (
        best === null ||
        distance < best.distance ||
        (distance === best.distance && path.length < best.pathLength)
      ) {
        best = { cell: candidate, distance, pathLength: path.length };
      }
    }
    if (best !== null) return best.cell;
  }

  return null;
}

function cellsAtRadius(center: GridCell, radius: number): GridCell[] {
  if (radius === 0) return [{ col: center.col, row: center.row }];
  const cells: GridCell[] = [];
  for (let dc = -radius; dc <= radius; dc += 1) {
    const dr = radius - Math.abs(dc);
    cells.push({ col: center.col + dc, row: center.row + dr });
    if (dr !== 0) cells.push({ col: center.col + dc, row: center.row - dr });
  }
  return cells;
}

function pointToCell(info: PixelGridInfo, point: PixelPoint): GridCell {
  return {
    col: clampInt(Math.round((point.x - info.bounds.left) / info.cellSize), 0, info.cols - 1),
    row: clampInt(Math.round((point.y - info.bounds.top) / info.cellSize), 0, info.rows - 1),
  };
}

function cellToPoint(info: PixelGridInfo, cell: GridCell): PixelPoint {
  return {
    x: Math.min(info.bounds.right, info.bounds.left + cell.col * info.cellSize),
    y: Math.min(info.bounds.bottom, info.bounds.top + cell.row * info.cellSize),
  };
}

function isGridWalkable(grid: WalkabilityGrid, cell: GridCell): boolean {
  if (cell.row < 0 || cell.row >= grid.length) return false;
  const row = grid[cell.row];
  if (!row || cell.col < 0 || cell.col >= row.length) return false;
  return row[cell.col] === true;
}

function simplifyPixelPath(
  path: readonly PixelPoint[],
  isWalkable: (x: number, y: number) => boolean,
  sampleStep: number,
): PixelPoint[] {
  if (path.length <= 2) return [...path];
  const simplified: PixelPoint[] = [];
  let index = 0;
  simplified.push(path[0] ?? { x: 0, y: 0 });

  while (index < path.length - 1) {
    let nextIndex = index + 1;
    for (let candidate = path.length - 1; candidate > index + 1; candidate -= 1) {
      const from = path[index];
      const to = path[candidate];
      if (from && to && isSegmentWalkable(from, to, isWalkable, sampleStep)) {
        nextIndex = candidate;
        break;
      }
    }
    const next = path[nextIndex];
    if (!next) break;
    simplified.push(next);
    index = nextIndex;
  }

  return simplified;
}

function isSegmentWalkable(
  from: PixelPoint,
  to: PixelPoint,
  isWalkable: (x: number, y: number) => boolean,
  sampleStep: number,
): boolean {
  const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
  const steps = Math.max(1, Math.ceil(distance / sampleStep));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (!isWalkable(x, y)) return false;
  }
  return true;
}

function clampPoint(point: PixelPoint, bounds: PixelBounds): PixelPoint {
  return {
    x: Math.max(bounds.left, Math.min(bounds.right, point.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom, point.y)),
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
