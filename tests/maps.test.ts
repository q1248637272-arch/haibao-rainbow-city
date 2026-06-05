import { describe, expect, it } from 'vitest';

import { SceneKey } from '@/config/GameConfig';
import { ENCOUNTERS } from '@/data/encounters';
import { BEACH, MAPS, RAINBOW_CITY, type IsoMapDef } from '@/data/maps';

const SCENE_KEY_SET = new Set<string>(Object.values(SceneKey));

/**
 * FEAT-204 地图数据结构校验。
 *
 * 不依赖 Phaser 运行时，纯结构断言：
 *   - ground 矩阵维度 = rows × cols
 *   - props / landmarks / encounterZones 坐标必须落在地图内
 *   - landmark.target 非 null 时必须是已注册的 SceneKey
 *   - encounterZones[i].zoneId 必须在 ENCOUNTERS 里有定义
 *   - spawn 坐标落在地图内
 */

function assertGroundShape(map: IsoMapDef): void {
  expect(map.ground.length, `${map.id}.ground 行数应等于 rows`).toBe(map.rows);
  for (let r = 0; r < map.rows; r++) {
    const row = map.ground[r];
    expect(row, `${map.id}.ground[${r}] 存在`).toBeDefined();
    expect(row?.length, `${map.id}.ground[${r}] 列数应等于 cols`).toBe(map.cols);
  }
}

function assertCellInRange(map: IsoMapDef, col: number, row: number, ctx: string): void {
  expect(col, `${ctx} col in [0, ${map.cols - 1}]`).toBeGreaterThanOrEqual(0);
  expect(col, `${ctx} col in [0, ${map.cols - 1}]`).toBeLessThan(map.cols);
  expect(row, `${ctx} row in [0, ${map.rows - 1}]`).toBeGreaterThanOrEqual(0);
  expect(row, `${ctx} row in [0, ${map.rows - 1}]`).toBeLessThan(map.rows);
}

describe('FEAT-204 IsoMapDef 结构校验', () => {
  it('RAINBOW_CITY ground 维度 = rows × cols，且 cols=12, rows=12', () => {
    expect(RAINBOW_CITY.cols).toBe(12);
    expect(RAINBOW_CITY.rows).toBe(12);
    assertGroundShape(RAINBOW_CITY);
  });

  it('BEACH ground 维度 = rows × cols，且 cols=16, rows=12', () => {
    expect(BEACH.cols).toBe(16);
    expect(BEACH.rows).toBe(12);
    assertGroundShape(BEACH);
  });

  it('两张地图的 props 坐标全部落在地图内', () => {
    for (const map of [RAINBOW_CITY, BEACH]) {
      for (const [i, p] of map.props.entries()) {
        assertCellInRange(map, p.col, p.row, `${map.id}.props[${i}]`);
      }
    }
  });

  it('两张地图的 landmark 坐标全部落在地图内', () => {
    for (const map of [RAINBOW_CITY, BEACH]) {
      for (const lm of map.landmarks) {
        assertCellInRange(map, lm.col, lm.row, `${map.id}.landmark(${lm.key})`);
      }
    }
  });

  it('landmark.target 非 null 时必须是 SceneKey 字面量之一', () => {
    for (const map of [RAINBOW_CITY, BEACH]) {
      for (const lm of map.landmarks) {
        if (lm.target !== null) {
          expect(
            SCENE_KEY_SET.has(lm.target),
            `${map.id}.landmark(${lm.key}).target=${lm.target} 应是已注册 SceneKey`,
          ).toBe(true);
        }
      }
    }
  });

  it('两张地图的 spawn 坐标落在地图内', () => {
    assertCellInRange(
      RAINBOW_CITY,
      RAINBOW_CITY.spawn.col,
      RAINBOW_CITY.spawn.row,
      'RAINBOW_CITY.spawn',
    );
    assertCellInRange(BEACH, BEACH.spawn.col, BEACH.spawn.row, 'BEACH.spawn');
  });

  it('encounterZones 的 zoneId 必须在 ENCOUNTERS 里有定义，且 mapId 与地图匹配', () => {
    for (const map of [RAINBOW_CITY, BEACH]) {
      for (const [i, z] of map.encounterZones.entries()) {
        const def = ENCOUNTERS[z.zoneId];
        expect(
          def,
          `${map.id}.encounterZones[${i}] zoneId=${z.zoneId} 在 ENCOUNTERS 中存在`,
        ).toBeDefined();
        if (def) {
          expect(def.mapId, `${z.zoneId}.mapId 应匹配 ${map.id}`).toBe(map.id);
        }
        assertCellInRange(map, z.col, z.row, `${map.id}.encounterZones[${i}]`);
      }
    }
  });

  it('RAINBOW_CITY 必含 gym 与 portal_beach 地标；BEACH 必含 portal_back', () => {
    const rcKeys = RAINBOW_CITY.landmarks.map((l) => l.key);
    expect(rcKeys).toContain('gym');
    expect(rcKeys).toContain('portal_beach');

    const beachKeys = BEACH.landmarks.map((l) => l.key);
    expect(beachKeys).toContain('portal_back');
  });

  it('MAPS 注册表包含两张地图的别名', () => {
    expect(MAPS.rainbow_city).toBe(RAINBOW_CITY);
    expect(MAPS.beach).toBe(BEACH);
  });

  /**
   * v1 review major #4 回归：landmark.target 非 null 时不得再填 pendingMessage，
   * 否则那条字符串会变成死文案，一旦 target 临时下线反而误导玩家。
   */
  it('landmark.target !== null 时不得同时声明 pendingMessage（v1 review major #4）', () => {
    for (const map of [RAINBOW_CITY, BEACH]) {
      for (const lm of map.landmarks) {
        if (lm.target !== null && lm.pendingMessage !== undefined) {
          throw new Error(
            `${map.id}.landmark(${lm.key}) 同时声明了 target=${lm.target} 与 pendingMessage='${lm.pendingMessage}'，` +
              `target 非 null 时 pendingMessage 永远不会读到，应删除 pendingMessage。`,
          );
        }
      }
    }
  });

  it('landmark.target === null 时 pendingMessage 必须存在（回退文案兜底）', () => {
    for (const map of [RAINBOW_CITY, BEACH]) {
      for (const lm of map.landmarks) {
        if (lm.target === null) {
          expect(
            typeof lm.pendingMessage,
            `${map.id}.landmark(${lm.key}) target=null 时必须填 pendingMessage`,
          ).toBe('string');
          expect(lm.pendingMessage && lm.pendingMessage.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('bush encounterZones 在 RAINBOW_CITY 至少 4 个、在 BEACH 至少 6 个', () => {
    expect(RAINBOW_CITY.encounterZones.length).toBeGreaterThanOrEqual(4);
    expect(BEACH.encounterZones.length).toBeGreaterThanOrEqual(6);
  });
});
