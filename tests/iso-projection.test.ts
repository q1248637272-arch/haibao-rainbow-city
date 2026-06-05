import { describe, expect, it } from 'vitest';

import { ISO_ORIGIN_X, ISO_ORIGIN_Y, TILE_H, TILE_W } from '@/config/GameConfig';
import type { IsoTileId } from '@/data/maps';
import {
  actorDepthFromScreen,
  isTallProp,
  screenToWorld,
  tileDepth,
  worldToScreen,
} from '@/systems/IsoProjection';

describe('IsoProjection', () => {
  describe('worldToScreen', () => {
    it('世界原点 (0,0) 投影到屏幕应返回 ISO_ORIGIN', () => {
      const p = worldToScreen(0, 0);
      expect(p.x).toBeCloseTo(ISO_ORIGIN_X, 6);
      expect(p.y).toBeCloseTo(ISO_ORIGIN_Y, 6);
    });

    it('向东走一格 (col+1) 屏幕应向右下方移动 (TILE_W/2, TILE_H/2)', () => {
      const p = worldToScreen(1, 0);
      expect(p.x - ISO_ORIGIN_X).toBeCloseTo(TILE_W / 2, 6);
      expect(p.y - ISO_ORIGIN_Y).toBeCloseTo(TILE_H / 2, 6);
    });

    it('向南走一格 (row+1) 屏幕应向左下方移动 (-TILE_W/2, TILE_H/2)', () => {
      const p = worldToScreen(0, 1);
      expect(p.x - ISO_ORIGIN_X).toBeCloseTo(-TILE_W / 2, 6);
      expect(p.y - ISO_ORIGIN_Y).toBeCloseTo(TILE_H / 2, 6);
    });
  });

  describe('screenToWorld', () => {
    it('worldToScreen ∘ screenToWorld 互为逆（允许 ±0.5 浮点）', () => {
      for (const [col, row] of [
        [0, 0],
        [5, 3],
        [14, 9],
        [-2, 7],
        [3.5, 2.25],
      ] satisfies ReadonlyArray<readonly [number, number]>) {
        const s = worldToScreen(col, row);
        const w = screenToWorld(s.x, s.y);
        expect(w.col).toBeCloseTo(col, 6);
        expect(w.row).toBeCloseTo(row, 6);
      }
    });

    it('屏幕原点输入应回到世界原点', () => {
      const w = screenToWorld(ISO_ORIGIN_X, ISO_ORIGIN_Y);
      expect(w.col).toBeCloseTo(0, 6);
      expect(w.row).toBeCloseTo(0, 6);
    });
  });

  describe('tileDepth', () => {
    it('row 更大的 ground 排在 row 更小的 ground 之前（depth 更大）', () => {
      expect(tileDepth(3, 0, 'ground')).toBeLessThan(tileDepth(0, 3, 'ground'));
    });

    it('同格内 actor depth 严格大于 ground', () => {
      const col = 4;
      const row = 2;
      expect(tileDepth(col, row, 'actor')).toBeGreaterThan(tileDepth(col, row, 'ground'));
    });

    it('同格内 prop depth 介于 ground 与 actor 之间', () => {
      const col = 1;
      const row = 6;
      const g = tileDepth(col, row, 'ground');
      const p = tileDepth(col, row, 'prop');
      const a = tileDepth(col, row, 'actor');
      expect(p).toBeGreaterThan(g);
      expect(a).toBeGreaterThan(p);
    });

    it('col+row 相等时 row 更大的格子 depth 更大（次级排序打破并列）', () => {
      expect(tileDepth(5, 2, 'ground')).toBeLessThan(tileDepth(2, 5, 'ground'));
    });
  });

  /**
   * v1 review blocker #1 回归：playerActorDepth（底层为 actorDepthFromScreen）的返回值
   * 与 tileDepth(col, row, 'actor') 量纲必须一致。
   *
   * 场景：彩虹城 spawn 在 (col=6, row=8)。海宝 sprite 在 worldToScreen(6,8).y - TILE_H/2
   * 处落位（setupPlayerAndHud 中的 y = screen.y - TILE_H/2 即"脚底"中心上浮半格）。
   *
   * 期望：actorDepthFromScreen(spawn.x, spawn.y) 与 tileDepth(spawn.col, spawn.row, 'actor')
   * 的差值应 ≤ 1（允许浮点误差 + spawn row 为 8 的次级偏移）。
   */
  describe('actorDepthFromScreen (v1 review blocker #1 回归)', () => {
    it('spawn 处的 actor depth 应与 tileDepth(col, row, actor) 量纲一致（±1 浮点容差）', () => {
      const spawnCol = 6;
      const spawnRow = 8;
      const { x, y } = worldToScreen(spawnCol, spawnRow);
      const spriteY = y - TILE_H / 2;
      const live = actorDepthFromScreen(x, spriteY);
      const expected = tileDepth(spawnCol, spawnRow, 'actor');
      expect(Math.abs(live - expected)).toBeLessThanOrEqual(1);
    });

    it('任一网格中心的 actor depth 都严格大于同格 ground 与 prop', () => {
      for (const [col, row] of [
        [0, 0],
        [3, 7],
        [11, 11],
        [6, 8],
      ] satisfies ReadonlyArray<readonly [number, number]>) {
        const { x, y } = worldToScreen(col, row);
        const spriteY = y - TILE_H / 2;
        const d = actorDepthFromScreen(x, spriteY);
        expect(d).toBeGreaterThan(tileDepth(col, row, 'ground'));
        expect(d).toBeGreaterThan(tileDepth(col, row, 'prop'));
      }
    });

    it('量纲绝对范围：12×12 地图内 actor depth 应落在与 ground 同一数量级（>=100）', () => {
      // 防御性回归：旧实现返回 Math.floor(y)+2 ~400-700，与 ground 的 ~1000-2400 脱节。
      for (const [col, row] of [
        [1, 1],
        [6, 8],
        [11, 11],
      ] satisfies ReadonlyArray<readonly [number, number]>) {
        const { x, y } = worldToScreen(col, row);
        const d = actorDepthFromScreen(x, y - TILE_H / 2);
        expect(d).toBeGreaterThanOrEqual(100);
      }
    });
  });

  /**
   * FEAT-311：高物瓦片识别 + 同格 actor/tall-prop 深度关系回归。
   *
   * 穿模修复的视觉侧逻辑：renderIsoMap 对 tall prop 的 depth 额外 +50，使玩家走到
   * 高物背后时被树冠/屋顶正确覆盖。测试在 IsoProjection 层断言：
   *   1. isTallProp 对 4 个高物瓦片返回 true，其他常见低矮瓦片返回 false；
   *   2. 同格 actor depth 始终严格大于同格 ground depth（基准不变）；
   *   3. 同格 actor depth 低于"tall prop + 50"的偏移结果，确保高物能压过玩家。
   */
  describe('FEAT-311 tall prop 与 actor 深度关系', () => {
    it('isTallProp 对 tree_pine / wall_brick / roof_red / roof_blue 返回 true，其他返回 false', () => {
      const tall: IsoTileId[] = [
        'iso_tree_pine',
        'iso_wall_brick',
        'iso_roof_red',
        'iso_roof_blue',
      ];
      for (const t of tall) {
        expect(isTallProp(t), `${t} 应该是 tall prop`).toBe(true);
      }
      const low: IsoTileId[] = [
        'iso_grass',
        'iso_grass_flower',
        'iso_sand',
        'iso_water',
        'iso_path_dirt',
        'iso_path_stone',
        'iso_rock',
        'iso_bush',
        'empty',
      ];
      for (const t of low) {
        expect(isTallProp(t), `${t} 不应是 tall prop`).toBe(false);
      }
    });

    it('同格 actor depth 始终严格大于 ground depth（基础单调性不变）', () => {
      for (const [col, row] of [
        [0, 0],
        [3, 7],
        [6, 8],
        [11, 11],
      ] satisfies ReadonlyArray<readonly [number, number]>) {
        const { x, y } = worldToScreen(col, row);
        const d = actorDepthFromScreen(x, y - TILE_H / 2);
        expect(d).toBeGreaterThan(tileDepth(col, row, 'ground'));
      }
    });

    it('同格 tall prop (prop depth + 50) 严格大于 actor depth，保证高物压过玩家', () => {
      for (const [col, row] of [
        [4, 2],
        [6, 6],
        [9, 2],
      ] satisfies ReadonlyArray<readonly [number, number]>) {
        const { x, y } = worldToScreen(col, row);
        const actorD = actorDepthFromScreen(x, y - TILE_H / 2);
        const tallPropD = tileDepth(col, row, 'prop') + 50;
        expect(tallPropD).toBeGreaterThan(actorD);
      }
    });
  });
});
