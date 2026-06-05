import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { getItem } from '@/data/items';
import {
  CASINO_DAILY_SPEND_LIMIT,
  CASINO_GAMES,
  casinoDailyRemaining,
  canPlayCasinoRound,
  playCasinoRound,
  type CasinoGameId,
  type CasinoRoundOutcome,
} from '@/systems/CasinoSystem';
import { PlayerState } from '@/systems/PlayerState';
import { preloadCasinoAssets } from '@/systems/SceneAssetPreloader';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

import type { LegacyLocationId } from './LegacyContent';

const CASINO_SAVE_KEY = 'hbcc:casino-daily:v1';

interface CasinoDailySave {
  readonly date?: string;
  readonly spent?: number;
}

export class CasinoScene extends Phaser.Scene {
  private fromScene: string = SceneKey.LEGACY_LOCATION;
  private returnLocationId: LegacyLocationId = 'casino';
  private selectedShell = 1;
  private dailySpent = 0;
  private panel: Phaser.GameObjects.Container | null = null;
  private status = '选择一个项目，只消耗单机彩虹币，没有充值或提现。';

  public constructor() {
    super({ key: SceneKey.CASINO });
  }

  public init(data?: {
    readonly fromScene?: string;
    readonly returnLocationId?: LegacyLocationId;
  }): void {
    this.fromScene = data?.fromScene ?? SceneKey.LEGACY_LOCATION;
    this.returnLocationId = data?.returnLocationId ?? 'casino';
  }

  public preload(): void {
    preloadCasinoAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.dailySpent = readDailySpent();
    this.drawBackdrop();
    this.drawNav();
    this.renderPanel();
  }

  private drawBackdrop(): void {
    createResponsiveMapBackground(this, 'legacy_casino_clean');
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05152e, 0.14).setOrigin(0);

    this.add.image(120, 494, 'npc_casino_guard').setOrigin(0.5, 0.88).setScale(0.92).setDepth(40);
    this.add.image(826, 492, 'npc_casino_host').setOrigin(0.5, 0.88).setScale(0.94).setDepth(40);
    const chips = this.add.image(478, 378, 'object_casino_chips').setScale(0.84).setDepth(42);
    this.tweens.add({
      targets: chips,
      y: chips.y - 6,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(GAME_WIDTH / 2, 76, '彩贝赌场', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '36px',
        color: '#fff4a8',
        stroke: '#12305e',
        strokeThickness: 6,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(50);
  }

  private drawNav(): void {
    createNavIconButton(this, {
      x: 52,
      y: 30,
      label: '返回',
      onClick: () => this.goBack(),
      depth: 100,
    });
    createNavIconButton(this, {
      x: 126,
      y: 30,
      label: '地图',
      onClick: () => this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.CASINO }),
      depth: 100,
    });
    createNavIconButton(this, {
      x: 200,
      y: 30,
      label: '精灵',
      onClick: () => this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.CASINO }),
      depth: 100,
    });
    createNavIconButton(this, {
      x: 274,
      y: 30,
      label: '图鉴',
      onClick: () => this.scene.start(SceneKey.PET_DEX, { fromScene: SceneKey.CASINO }),
      depth: 100,
    });
    createNavIconButton(this, {
      x: 348,
      y: 30,
      label: '背包',
      onClick: () => this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.CASINO }),
      depth: 100,
    });
  }

  private renderPanel(): void {
    this.panel?.destroy(true);
    this.panel = this.add.container(0, 0).setDepth(80);
    const panel = this.panel;

    const g = this.add.graphics();
    g.fillStyle(0x062a54, 0.82);
    g.fillRoundedRect(58, 102, 844, 496, 16);
    g.lineStyle(3, 0xffffff, 0.68);
    g.strokeRoundedRect(58, 102, 844, 496, 16);
    panel.add(g);

    const remaining = casinoDailyRemaining(this.dailySpent);
    panel.add(
      this.add
        .text(
          96,
          128,
          `彩虹币 ${PlayerState.getCoins()}   今日额度 ${remaining}/${CASINO_DAILY_SPEND_LIMIT}`,
          {
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontSize: '20px',
            color: '#ffffff',
            stroke: '#12305e',
            strokeThickness: 4,
          },
        )
        .setDepth(81),
    );

    this.drawGameCard(panel, 92, 172, 'shell_spinner');
    this.drawGameCard(panel, 356, 172, 'rainbow_shell');
    this.drawGameCard(panel, 620, 172, 'pearl_cards');

    const statusBox = this.add.graphics();
    statusBox.fillStyle(0x0a1736, 0.76);
    statusBox.fillRoundedRect(96, 500, 768, 70, 12);
    statusBox.lineStyle(2, 0xfff4a8, 0.64);
    statusBox.strokeRoundedRect(96, 500, 768, 70, 12);
    panel.add(statusBox);
    panel.add(
      this.add
        .text(480, 535, this.status, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '18px',
          color: '#fff4a8',
          stroke: '#12305e',
          strokeThickness: 3,
          wordWrap: { width: 720 },
          align: 'center',
        })
        .setOrigin(0.5),
    );
  }

  private drawGameCard(
    panel: Phaser.GameObjects.Container,
    x: number,
    y: number,
    gameId: CasinoGameId,
  ): void {
    const game = CASINO_GAMES[gameId];
    const g = this.add.graphics();
    g.fillStyle(0xfdf7dd, 0.94);
    g.fillRoundedRect(x, y, 236, 292, 14);
    g.lineStyle(3, 0x5bb8ea, 0.9);
    g.strokeRoundedRect(x, y, 236, 292, 14);
    panel.add(g);

    panel.add(
      this.add
        .text(x + 118, y + 26, game.label, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '23px',
          color: '#12305e',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(x + 22, y + 58, wrapCasinoText(game.blurb, 11), {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '14px',
          color: '#24507d',
          lineSpacing: 4,
          fixedWidth: 192,
          fixedHeight: 58,
        })
        .setOrigin(0),
    );

    if (gameId === 'rainbow_shell') {
      for (let i = 1; i <= 3; i += 1) {
        panel.add(this.createShellChoiceButton(x + 50 + (i - 1) * 58, y + 136, i));
      }
    } else {
      const icon = gameId === 'shell_spinner' ? 'object_casino_chips' : 'object_reward_chest';
      panel.add(this.add.image(x + 118, y + 148, icon).setDisplaySize(86, 86));
    }

    const firstStake = game.stakes[0];
    const secondStake = game.stakes[1];
    if (firstStake !== undefined) {
      panel.add(
        this.createCasinoButton(x + 48, y + 222, `${firstStake}币`, () =>
          this.play(gameId, firstStake),
        ),
      );
    }
    if (secondStake !== undefined) {
      panel.add(
        this.createCasinoButton(x + 132, y + 222, `${secondStake}币`, () =>
          this.play(gameId, secondStake),
        ),
      );
    }
  }

  private createShellChoiceButton(
    x: number,
    y: number,
    value: number,
  ): Phaser.GameObjects.Container {
    const active = this.selectedShell === value;
    const container = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(active ? 0xffd93d : 0x8fe8ff, 1);
    g.fillCircle(0, 0, 22);
    g.lineStyle(3, active ? 0xf06a2f : 0x2177a8, 0.9);
    g.strokeCircle(0, 0, 22);
    const text = this.add
      .text(0, 1, String(value), {
        fontFamily: 'Arial, Microsoft YaHei, sans-serif',
        fontSize: '19px',
        color: '#12305e',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const hit = this.add
      .zone(0, 0, 50, 50)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        this.selectedShell = value;
        this.status = `已选择第 ${value} 枚贝壳。`;
        this.renderPanel();
      });
    container.add([g, text, hit]);
    return container;
  }

  private createCasinoButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const g = this.add.graphics();
    const draw = (active: boolean): void => {
      g.clear();
      g.fillStyle(active ? 0xffbd4a : 0x2aa7d8, 0.96);
      g.fillRoundedRect(0, 0, 66, 42, 10);
      g.lineStyle(2, 0xffffff, active ? 1 : 0.75);
      g.strokeRoundedRect(0, 0, 66, 42, 10);
    };
    draw(false);
    const text = this.add
      .text(33, 21, label, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#12305e',
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const hit = this.add
      .zone(33, 21, 66, 42)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => draw(true))
      .on('pointerout', () => draw(false))
      .on('pointerup', onClick);
    container.add([g, text, hit]);
    return container;
  }

  private play(gameId: CasinoGameId, stake: number): void {
    const check = canPlayCasinoRound(gameId, stake, PlayerState.getCoins(), this.dailySpent);
    if (!check.ok) {
      this.status = deniedMessage(check.reason);
      this.renderPanel();
      return;
    }

    const outcome = playCasinoRound(
      gameId === 'rainbow_shell'
        ? { gameId, stake, choice: this.selectedShell }
        : { gameId, stake },
    );
    PlayerState.addCoins(-stake);
    if (outcome.payoutCoins > 0) PlayerState.addCoins(outcome.payoutCoins);
    for (const item of outcome.items) {
      PlayerState.addItem(item.itemId, item.quantity);
    }
    this.dailySpent += stake;
    writeDailySpent(this.dailySpent);

    const net = outcome.payoutCoins - stake;
    const rewardText = formatRewards(outcome);
    this.status = `${outcome.title}：${outcome.message} ${outcome.reveal ?? ''} ${net >= 0 ? `净得 ${net}` : `净少 ${Math.abs(net)}`} 彩虹币${rewardText}`;
    this.playRewardTween(outcome);
    this.renderPanel();
  }

  private playRewardTween(outcome: CasinoRoundOutcome): void {
    const marker = this.add
      .image(480, 358, 'object_casino_chips')
      .setScale(outcome.payoutCoins > outcome.stake ? 1.2 : 0.82)
      .setDepth(120)
      .setAlpha(0.95);
    this.tweens.add({
      targets: marker,
      y: marker.y - 44,
      scale: marker.scale + 0.2,
      alpha: 0,
      duration: 760,
      ease: 'Back.easeOut',
      onComplete: () => marker.destroy(),
    });
  }

  private goBack(): void {
    if (this.fromScene === SceneKey.LEGACY_LOCATION) {
      this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: this.returnLocationId });
      return;
    }
    this.scene.start(this.fromScene);
  }
}

function readDailySpent(): number {
  try {
    const raw = globalThis.localStorage?.getItem(CASINO_SAVE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as CasinoDailySave;
    if (parsed.date !== todayKey()) return 0;
    return Math.max(0, Math.floor(parsed.spent ?? 0));
  } catch {
    return 0;
  }
}

function writeDailySpent(spent: number): void {
  try {
    globalThis.localStorage?.setItem(
      CASINO_SAVE_KEY,
      JSON.stringify({ date: todayKey(), spent: Math.max(0, Math.floor(spent)) }),
    );
  } catch {
    // Storage failures should not block a local mini-game.
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function deniedMessage(reason?: string): string {
  if (reason === 'coins_low') return '彩虹币不够，先去补给站、任务板或野外战斗赚一点。';
  if (reason === 'daily_limit') return '今天的彩贝额度已经用完，明天再来试手气。';
  if (reason === 'invalid_stake') return '这个筹码档位暂时不能使用。';
  return '彩贝厅正在整理这项玩法。';
}

function formatRewards(outcome: CasinoRoundOutcome): string {
  if (outcome.items.length === 0) return '。';
  const itemText = outcome.items
    .map((item) => {
      const def = getItem(item.itemId);
      return `${def?.name ?? item.itemId}x${item.quantity}`;
    })
    .join('、');
  return `，并获得 ${itemText}。`;
}

function wrapCasinoText(text: string, maxChars: number): string {
  const chars = [...text];
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += maxChars) {
    lines.push(chars.slice(i, i + maxChars).join(''));
  }
  return lines.join('\n');
}
