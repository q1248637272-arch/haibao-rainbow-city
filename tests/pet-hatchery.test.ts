import { describe, expect, it } from 'vitest';

import {
  HATCHERY_REQUIRED_CARE,
  applyHatcheryCare,
  boostHatcheryEgg,
  canHatchEgg,
  defaultHatcheryState,
  finishHatcheryCycle,
  hatcheryCareProgress,
  normalizeHatcheryState,
  rollHatchedPet,
  startHatcheryEgg,
} from '@/systems/PetHatchery';

describe('PetHatchery', () => {
  it('精灵蛋需要完成足够照料步骤才能孵化', () => {
    let state = startHatcheryEgg(defaultHatcheryState(), 1000, () => 0.12);
    expect(canHatchEgg(state)).toBe(false);

    state = applyHatcheryCare(state, 'warm');
    state = applyHatcheryCare(state, 'polish');
    expect(hatcheryCareProgress(state)).toBe(2);
    expect(canHatchEgg(state)).toBe(false);

    state = applyHatcheryCare(state, 'song');
    expect(hatcheryCareProgress(state)).toBe(HATCHERY_REQUIRED_CARE);
    expect(canHatchEgg(state)).toBe(true);
  });

  it('重复照料不会刷进度', () => {
    let state = startHatcheryEgg(defaultHatcheryState(), 1000, () => 0.1);
    state = applyHatcheryCare(state, 'warm');
    state = applyHatcheryCare(state, 'warm');
    expect(state.careActions).toEqual(['warm']);
  });

  it('加入星砂会提高孵化等级', () => {
    const base = applyHatcheryCare(
      applyHatcheryCare(applyHatcheryCare(startHatcheryEgg(defaultHatcheryState(), 2000, () => 0.2), 'warm'), 'polish'),
      'song',
    );
    const normal = rollHatchedPet(base);
    const boosted = rollHatchedPet(boostHatcheryEgg(base));
    expect(boosted.level).toBeGreaterThanOrEqual(normal.level + 1);
  });

  it('孵化完成后清空当前蛋并累计次数', () => {
    const state = startHatcheryEgg(defaultHatcheryState(), 1000, () => 0.1);
    const done = finishHatcheryCycle(state);
    expect(done.active).toBe(false);
    expect(done.hatchedCount).toBe(1);
  });

  it('读取旧数据时会过滤无效照料动作', () => {
    const normalized = normalizeHatcheryState({
      active: true,
      startedAt: 1,
      seed: 2,
      careActions: ['warm', 'bad', 'warm', 'record'],
      boosted: true,
      hatchedCount: 3,
    });
    expect(normalized.careActions).toEqual(['warm', 'record']);
  });
});
