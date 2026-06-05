import { describe, expect, it } from 'vitest';

import { QUESTS_DAILY_POOL } from '@/data/quests';
import {
  DailyQuest,
  pickDailyQuests,
  shouldRefreshDaily,
  todayUtcDateString,
} from '@/systems/DailyQuest';

describe('DailyQuest.todayUtcDateString', () => {
  it('格式为 YYYY-MM-DD，按 UTC 计算', () => {
    const d = new Date(Date.UTC(2025, 0, 15, 23, 59, 59));
    expect(todayUtcDateString(d)).toBe('2025-01-15');
  });

  it('补零：月 / 日小于 10 时补 0', () => {
    const d = new Date(Date.UTC(2025, 2, 5, 0, 0, 0));
    expect(todayUtcDateString(d)).toBe('2025-03-05');
  });
});

describe('DailyQuest.shouldRefreshDaily', () => {
  it('lastRolled === null 必须返回 true', () => {
    expect(shouldRefreshDaily(null, new Date(Date.UTC(2025, 0, 15)))).toBe(true);
  });

  it('lastRolled 与今日 UTC 日相同：返回 false', () => {
    const now = new Date(Date.UTC(2025, 0, 15, 12, 0, 0));
    expect(shouldRefreshDaily('2025-01-15', now)).toBe(false);
  });

  it('跨过 UTC 0 点后：返回 true', () => {
    const now = new Date(Date.UTC(2025, 0, 16, 0, 0, 5));
    expect(shouldRefreshDaily('2025-01-15', now)).toBe(true);
  });

  it('同一自然日但时区边界情况：按 UTC 日字符串比对', () => {
    // 输入 UTC 15 日 01:00，字符串对齐应 false
    expect(shouldRefreshDaily('2025-01-15', new Date(Date.UTC(2025, 0, 15, 1, 0)))).toBe(
      false,
    );
    // 输入 UTC 16 日 00:00，应 true
    expect(shouldRefreshDaily('2025-01-15', new Date(Date.UTC(2025, 0, 16)))).toBe(true);
  });
});

describe('DailyQuest.pickDailyQuests', () => {
  it('同 seed 两次调用返回完全相同的序列', () => {
    const a = pickDailyQuests(QUESTS_DAILY_POOL, '2025-01-15', 3);
    const b = pickDailyQuests(QUESTS_DAILY_POOL, '2025-01-15', 3);
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
  });

  it('不同 seed 产生不同序列（在合理概率下）', () => {
    const a = pickDailyQuests(QUESTS_DAILY_POOL, '2025-01-15', 3);
    const b = pickDailyQuests(QUESTS_DAILY_POOL, '2025-06-30', 3);
    // 池只有 5 条，抽 3 会有重叠，但顺序不同即视为"产生了不同效果"
    expect(JSON.stringify(a) === JSON.stringify(b)).toBe(false);
  });

  it('count 超过池大小时返回整个池（不抛错）', () => {
    const out = pickDailyQuests(QUESTS_DAILY_POOL, 'seed', 9999);
    expect(out.length).toBe(QUESTS_DAILY_POOL.length);
  });

  it('count <= 0 或空池返回空数组', () => {
    expect(pickDailyQuests(QUESTS_DAILY_POOL, 's', 0)).toEqual([]);
    expect(pickDailyQuests(QUESTS_DAILY_POOL, 's', -5)).toEqual([]);
    expect(pickDailyQuests([], 's', 3)).toEqual([]);
  });

  it('返回的 id 都来自入参池，且无重复', () => {
    const out = pickDailyQuests(QUESTS_DAILY_POOL, 'hello', 5);
    const poolIds = new Set(QUESTS_DAILY_POOL.map((q) => q.id));
    for (const id of out) {
      expect(poolIds.has(id)).toBe(true);
    }
    expect(new Set(out).size).toBe(out.length);
  });
});

describe('DailyQuest 聚合导出', () => {
  it('DailyQuest.* 与具名导出指向同一实现', () => {
    expect(DailyQuest.todayUtcDateString).toBe(todayUtcDateString);
    expect(DailyQuest.shouldRefreshDaily).toBe(shouldRefreshDaily);
    expect(DailyQuest.pickDailyQuests).toBe(pickDailyQuests);
  });
});
