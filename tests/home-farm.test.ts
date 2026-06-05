import { describe, expect, it } from 'vitest';

import {
  canSubmitFarmOrder,
  createFarmOrderForDate,
  farmOrderReward,
  formatFarmOrderRequirement,
} from '@/systems/HomeFarm';

describe('HomeFarm daily orders', () => {
  it('creates stable daily farm orders with readable requirements', () => {
    const first = createFarmOrderForDate('2026-05-28');
    const again = createFarmOrderForDate('2026-05-28');

    expect(first).toEqual(again);
    expect(first.requirements.length).toBe(2);
    expect(first.requirements.every((req) => formatFarmOrderRequirement(req).includes('x'))).toBe(
      true,
    );
  });

  it('checks whether the player has enough harvested crops to submit', () => {
    const order = createFarmOrderForDate('2026-05-29');
    const enough = new Map(order.requirements.map((req) => [req.itemId, req.quantity]));
    const missingOne = new Map(order.requirements.map((req) => [req.itemId, req.quantity]));
    const firstReq = order.requirements[0];
    if (firstReq) missingOne.set(firstReq.itemId, firstReq.quantity - 1);

    expect(canSubmitFarmOrder(order, (itemId) => enough.get(itemId) ?? 0)).toBe(true);
    expect(canSubmitFarmOrder(order, (itemId) => missingOne.get(itemId) ?? 0)).toBe(false);
    expect(
      canSubmitFarmOrder({ ...order, completed: true }, (itemId) => enough.get(itemId) ?? 0),
    ).toBe(false);
  });

  it('rewards farm orders with coins and growth items', () => {
    const order = createFarmOrderForDate('2026-05-30');
    const reward = farmOrderReward(order);

    expect(reward.coins).toBeGreaterThanOrEqual(300);
    expect(reward.items.some((item) => item.itemId === 'exp_candy')).toBe(true);
    expect(reward.items.some((item) => item.itemId === 'potential_seed')).toBe(true);
  });
});
