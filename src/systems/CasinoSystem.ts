export type CasinoGameId = 'shell_spinner' | 'rainbow_shell' | 'pearl_cards';

export interface CasinoGameDef {
  readonly id: CasinoGameId;
  readonly label: string;
  readonly stakes: readonly number[];
  readonly blurb: string;
}

export interface CasinoItemReward {
  readonly itemId: string;
  readonly quantity: number;
}

export interface CasinoRoundOutcome {
  readonly gameId: CasinoGameId;
  readonly stake: number;
  readonly payoutCoins: number;
  readonly title: string;
  readonly message: string;
  readonly items: readonly CasinoItemReward[];
  readonly reveal?: string;
}

export type CasinoDeniedReason = 'invalid_game' | 'invalid_stake' | 'coins_low' | 'daily_limit';

export interface CasinoPlayCheck {
  readonly ok: boolean;
  readonly reason?: CasinoDeniedReason;
  readonly remainingDailySpend: number;
}

export const CASINO_DAILY_SPEND_LIMIT = 300;

export const CASINO_GAMES: Readonly<Record<CasinoGameId, CasinoGameDef>> = {
  shell_spinner: {
    id: 'shell_spinner',
    label: '彩贝转盘',
    stakes: [10, 50],
    blurb: '转动珍珠盘，贝壳停在哪里就按倍率结算。',
  },
  rainbow_shell: {
    id: 'rainbow_shell',
    label: '猜贝壳',
    stakes: [10, 30],
    blurb: '从三枚贝壳里选一枚，猜中藏着珍珠的那枚。',
  },
  pearl_cards: {
    id: 'pearl_cards',
    label: '珍珠卡牌',
    stakes: [20, 60],
    blurb: '抽一张海底卡牌，可能得到彩虹币或旧版素材。',
  },
} as const;

interface WeightedOutcome {
  readonly weight: number;
  readonly payoutMultiplier: number;
  readonly title: string;
  readonly message: string;
  readonly items?: readonly CasinoItemReward[];
  readonly reveal?: string;
}

export function casinoDailyRemaining(spentToday: number): number {
  return Math.max(0, CASINO_DAILY_SPEND_LIMIT - Math.max(0, Math.floor(spentToday)));
}

export function canPlayCasinoRound(
  gameId: CasinoGameId,
  stake: number,
  coins: number,
  spentToday: number,
): CasinoPlayCheck {
  const game = CASINO_GAMES[gameId];
  const remainingDailySpend = casinoDailyRemaining(spentToday);
  if (!game) return { ok: false, reason: 'invalid_game', remainingDailySpend };
  if (!game.stakes.includes(stake)) {
    return { ok: false, reason: 'invalid_stake', remainingDailySpend };
  }
  if (coins < stake) return { ok: false, reason: 'coins_low', remainingDailySpend };
  if (stake > remainingDailySpend) {
    return { ok: false, reason: 'daily_limit', remainingDailySpend };
  }
  return { ok: true, remainingDailySpend };
}

export function playCasinoRound(input: {
  readonly gameId: CasinoGameId;
  readonly stake: number;
  readonly choice?: number;
  readonly rng?: () => number;
}): CasinoRoundOutcome {
  const rng = input.rng ?? Math.random;
  const game = CASINO_GAMES[input.gameId];
  if (!game || !game.stakes.includes(input.stake)) {
    throw new Error(`Invalid casino round: ${input.gameId}:${input.stake}`);
  }

  if (input.gameId === 'rainbow_shell') {
    return playRainbowShell(input.stake, input.choice ?? 1, rng);
  }
  if (input.gameId === 'pearl_cards') {
    return playPearlCards(input.stake, rng);
  }
  return playShellSpinner(input.stake, rng);
}

function playShellSpinner(stake: number, rng: () => number): CasinoRoundOutcome {
  const outcome = pickWeighted(
    [
      {
        weight: 34,
        payoutMultiplier: 0,
        title: '空贝壳',
        message: '转盘停在空贝壳上，筹码被彩贝厅收走了。',
        reveal: '空贝',
      },
      {
        weight: 28,
        payoutMultiplier: 1,
        title: '稳稳停住',
        message: '拿回同等彩虹币，手气还在热身。',
        reveal: '保本',
      },
      {
        weight: 22,
        payoutMultiplier: 2,
        title: '双彩贝',
        message: '贝壳亮起双倍彩光，彩虹币翻了一倍。',
        reveal: 'x2',
      },
      {
        weight: 12,
        payoutMultiplier: 4,
        title: '珍珠连闪',
        message: '珍珠灯连着闪了四下，奖励很漂亮。',
        reveal: 'x4',
      },
      {
        weight: 4,
        payoutMultiplier: 8,
        title: '金贝大奖',
        message: '金贝壳从转盘中心弹出，还送一枚旧版金贝壳。',
        items: [{ itemId: 'gold_shell', quantity: 1 }],
        reveal: 'x8',
      },
    ],
    rng,
  );
  return toOutcome('shell_spinner', stake, outcome);
}

function playRainbowShell(stake: number, choice: number, rng: () => number): CasinoRoundOutcome {
  const normalizedChoice = Math.max(1, Math.min(3, Math.floor(choice)));
  const secret = 1 + Math.floor(rng() * 3);
  if (normalizedChoice === secret) {
    const bonusItems: CasinoItemReward[] =
      rng() < 0.18 ? [{ itemId: 'gold_shell', quantity: 1 }] : [];
    return {
      gameId: 'rainbow_shell',
      stake,
      payoutCoins: stake * 3,
      title: '猜中珍珠',
      message: '贝壳打开，里面正好藏着珍珠！',
      items: bonusItems,
      reveal: `珍珠在第 ${secret} 枚`,
    };
  }
  return {
    gameId: 'rainbow_shell',
    stake,
    payoutCoins: rng() < 0.2 ? Math.floor(stake / 2) : 0,
    title: '差一点',
    message: '贝壳里只有小气泡，下次换个位置试试。',
    items: [],
    reveal: `珍珠在第 ${secret} 枚`,
  };
}

function playPearlCards(stake: number, rng: () => number): CasinoRoundOutcome {
  const outcome = pickWeighted(
    [
      {
        weight: 30,
        payoutMultiplier: 0,
        title: '海藻牌',
        message: '抽到海藻牌，今天这张有点安静。',
        reveal: '海藻',
      },
      {
        weight: 26,
        payoutMultiplier: 1,
        title: '小贝牌',
        message: '小贝牌把彩虹币原样送了回来。',
        reveal: '小贝',
      },
      {
        weight: 22,
        payoutMultiplier: 2,
        title: '珍珠牌',
        message: '珍珠牌发出柔光，彩虹币变成双份。',
        reveal: '珍珠',
      },
      {
        weight: 14,
        payoutMultiplier: 0,
        title: '水晶牌',
        message: '没有彩虹币，但翻到一块净化水晶。',
        items: [{ itemId: 'crystal_shard', quantity: 1 }],
        reveal: '水晶',
      },
      {
        weight: 6,
        payoutMultiplier: 5,
        title: '彩虹牌',
        message: '彩虹牌出现了，额外送一颗经验糖。',
        items: [{ itemId: 'exp_candy', quantity: 1 }],
        reveal: '彩虹',
      },
      {
        weight: 2,
        payoutMultiplier: 10,
        title: '星光大奖',
        message: '星光从牌面飞出来，彩虹币和高级精灵球都入袋。',
        items: [{ itemId: 'pokeball_great', quantity: 1 }],
        reveal: '星光',
      },
    ],
    rng,
  );
  return toOutcome('pearl_cards', stake, outcome);
}

function toOutcome(
  gameId: CasinoGameId,
  stake: number,
  outcome: WeightedOutcome,
): CasinoRoundOutcome {
  const result: CasinoRoundOutcome = {
    gameId,
    stake,
    payoutCoins: stake * outcome.payoutMultiplier,
    title: outcome.title,
    message: outcome.message,
    items: outcome.items ?? [],
  };
  return outcome.reveal ? { ...result, reveal: outcome.reveal } : result;
}

function pickWeighted(outcomes: readonly WeightedOutcome[], rng: () => number): WeightedOutcome {
  const total = outcomes.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const outcome of outcomes) {
    roll -= outcome.weight;
    if (roll <= 0) return outcome;
  }
  const last = outcomes[outcomes.length - 1];
  if (!last) throw new Error('No casino outcomes configured.');
  return last;
}

export const CasinoSystem = {
  CASINO_DAILY_SPEND_LIMIT,
  CASINO_GAMES,
  casinoDailyRemaining,
  canPlayCasinoRound,
  playCasinoRound,
} as const;
