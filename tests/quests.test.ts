import { describe, expect, it } from 'vitest';

import { ITEMS } from '@/data/items';
import {
  QUESTS_ALL,
  QUESTS_DAILY_POOL,
  QUESTS_MAIN,
  getQuest,
} from '@/data/quests';

describe('QUESTS_MAIN 数据表（FEAT-303）', () => {
  it('主线条目数覆盖扩展剧情章节', () => {
    expect(QUESTS_MAIN.length).toBeGreaterThanOrEqual(15);
  });

  it('所有主线 id 唯一', () => {
    const seen = new Set<string>();
    for (const q of QUESTS_MAIN) {
      expect(seen.has(q.id), `主线 id 重复: ${q.id}`).toBe(false);
      seen.add(q.id);
    }
  });

  it('所有 prerequisites 指向存在的主线 id（无孤儿）', () => {
    const ids = new Set(QUESTS_MAIN.map((q) => q.id));
    for (const q of QUESTS_MAIN) {
      const prereqs = q.prerequisites ?? [];
      for (const pid of prereqs) {
        expect(
          ids.has(pid),
          `主线 ${q.id} 的 prerequisites 引用了不存在的 id: ${pid}`,
        ).toBe(true);
      }
    }
  });

  it('rewards.items 全部 resolve 到 ITEMS 表里真实物品', () => {
    for (const q of QUESTS_MAIN) {
      const items = q.reward.items ?? [];
      for (const entry of items) {
        expect(
          ITEMS[entry.itemId] !== undefined,
          `主线 ${q.id} 的奖励引用了未知 itemId: ${entry.itemId}`,
        ).toBe(true);
        expect(entry.quantity).toBeGreaterThan(0);
      }
    }
  });

  it('主线 kind 全部为 main', () => {
    for (const q of QUESTS_MAIN) {
      expect(q.kind).toBe('main');
    }
  });

  it('首条主线无 prerequisites（保证 initQuestStates 至少发布一条 active 任务）', () => {
    expect(QUESTS_MAIN[0]?.prerequisites).toBeUndefined();
  });

  it('主线奖励链中保留 grantVip=true 的节点', () => {
    expect(QUESTS_MAIN.some((q) => q.reward.grantVip === true)).toBe(true);
  });
});

describe('QUESTS_DAILY_POOL 数据表（FEAT-303）', () => {
  it('每日池条目数 ≥ 5', () => {
    expect(QUESTS_DAILY_POOL.length).toBeGreaterThanOrEqual(5);
  });

  it('所有每日 id 唯一', () => {
    const seen = new Set<string>();
    for (const q of QUESTS_DAILY_POOL) {
      expect(seen.has(q.id), `每日 id 重复: ${q.id}`).toBe(false);
      seen.add(q.id);
    }
  });

  it('每日 kind 全部为 daily', () => {
    for (const q of QUESTS_DAILY_POOL) {
      expect(q.kind).toBe('daily');
    }
  });

  it('每日任务 rewards.items 全部 resolve 到 ITEMS 表', () => {
    for (const q of QUESTS_DAILY_POOL) {
      const items = q.reward.items ?? [];
      for (const entry of items) {
        expect(
          ITEMS[entry.itemId] !== undefined,
          `每日 ${q.id} 的奖励引用了未知 itemId: ${entry.itemId}`,
        ).toBe(true);
      }
    }
  });

  it('每日 id 与主线 id 不冲突', () => {
    const mainIds = new Set(QUESTS_MAIN.map((q) => q.id));
    for (const q of QUESTS_DAILY_POOL) {
      expect(mainIds.has(q.id), `每日 ${q.id} 与主线 id 冲突`).toBe(false);
    }
  });
});

describe('QUESTS_ALL 聚合与 getQuest', () => {
  it('QUESTS_ALL 长度 = 主线 + 每日', () => {
    expect(QUESTS_ALL.length).toBe(QUESTS_MAIN.length + QUESTS_DAILY_POOL.length);
  });

  it('getQuest 对已知 id 返回定义，未知 id 返回 undefined', () => {
    const first = QUESTS_MAIN[0];
    expect(first).toBeDefined();
    if (first) {
      expect(getQuest(first.id)?.id).toBe(first.id);
    }
    expect(getQuest('q_not_exist')).toBeUndefined();
  });
});
