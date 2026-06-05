import { describe, expect, it } from 'vitest';

import {
  CASINO_DAILY_SPEND_LIMIT,
  canPlayCasinoRound,
  playCasinoRound,
} from '@/systems/CasinoSystem';

describe('casino system', () => {
  it('blocks play when coins or daily virtual spend are insufficient', () => {
    expect(canPlayCasinoRound('shell_spinner', 10, 5, 0)).toMatchObject({
      ok: false,
      reason: 'coins_low',
    });
    expect(
      canPlayCasinoRound('shell_spinner', 50, 1000, CASINO_DAILY_SPEND_LIMIT - 20),
    ).toMatchObject({
      ok: false,
      reason: 'daily_limit',
      remainingDailySpend: 20,
    });
  });

  it('settles spinner jackpot with coins and item reward', () => {
    const outcome = playCasinoRound({
      gameId: 'shell_spinner',
      stake: 10,
      rng: () => 0.99,
    });

    expect(outcome.title).toBe('金贝大奖');
    expect(outcome.payoutCoins).toBe(80);
    expect(outcome.items).toEqual([{ itemId: 'gold_shell', quantity: 1 }]);
  });

  it('uses the selected shell for shell guessing', () => {
    const rolls = [0.1, 0.5];
    const outcome = playCasinoRound({
      gameId: 'rainbow_shell',
      stake: 10,
      choice: 1,
      rng: () => rolls.shift() ?? 0,
    });

    expect(outcome.title).toBe('猜中珍珠');
    expect(outcome.payoutCoins).toBe(30);
    expect(outcome.reveal).toBe('珍珠在第 1 枚');
  });

  it('can draw a rare pearl card reward', () => {
    const outcome = playCasinoRound({
      gameId: 'pearl_cards',
      stake: 20,
      rng: () => 0.99,
    });

    expect(outcome.title).toBe('星光大奖');
    expect(outcome.payoutCoins).toBe(200);
    expect(outcome.items).toEqual([{ itemId: 'pokeball_great', quantity: 1 }]);
  });
});
