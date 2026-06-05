import { describe, expect, it } from 'vitest';

import {
  BEACH_FORAGE_SAVE_KEY,
  claimBeachForagePoint,
  normalizeBeachForageState,
  readBeachForageState,
  writeBeachForageState,
  type StorageLike,
} from '@/systems/BeachForage';

class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('BeachForage', () => {
  it('跨日会重置已采集点', () => {
    const state = normalizeBeachForageState(
      { date: '2026-05-27', claimedPointIds: ['shell_ridge'] },
      '2026-05-28',
    );
    expect(state).toEqual({ date: '2026-05-28', claimedPointIds: [] });
  });

  it('只保留已注册采集点并去重', () => {
    const state = normalizeBeachForageState(
      { date: '2026-05-28', claimedPointIds: ['shell_ridge', 'missing', 'shell_ridge'] },
      '2026-05-28',
    );
    expect(state.claimedPointIds).toEqual(['shell_ridge']);
  });

  it('成功采集后写入下一个状态并扣除今日次数', () => {
    const initial = { date: '2026-05-28', claimedPointIds: [] };
    const result = claimBeachForagePoint('shell_ridge', initial);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected claim success');
    expect(result.point.itemId).toBe('gold_shell');
    expect(result.next.claimedPointIds).toEqual(['shell_ridge']);
    expect(result.remainingClaims).toBe(1);
  });

  it('同一采集点每天只能领取一次', () => {
    const result = claimBeachForagePoint('shell_ridge', {
      date: '2026-05-28',
      claimedPointIds: ['shell_ridge'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected claim rejection');
    expect(result.reason).toBe('already_claimed');
  });

  it('读写 localStorage 兼容的存储对象', () => {
    const storage = new MemoryStorage();
    writeBeachForageState(storage, {
      date: '2026-05-28',
      claimedPointIds: ['coral_glint'],
    });
    expect(storage.getItem(BEACH_FORAGE_SAVE_KEY)).toContain('coral_glint');
    const read = readBeachForageState(storage, new Date(Date.UTC(2026, 4, 28)));
    expect(read.claimedPointIds).toEqual(['coral_glint']);
  });
});
