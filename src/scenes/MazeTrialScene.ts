import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { gameEvents } from '@/systems/EventBus';
import {
  MAZE_ROUTE_TRIAL_MINIGAME_ID,
  MAZE_ROUTE_TRIAL_SOURCE,
  MAZE_ROUTE_TRIAL_TARGET_DEPTH,
  generateMazeRouteSequence,
  readMazeRouteTrialState,
  remainingMazeRouteTrialRewards,
  settleMazeRouteTrialRun,
  writeMazeRouteTrialState,
  type MazeRouteRune,
  type MazeRouteTrialState,
} from '@/systems/MazeRouteTrial';
import { PlayerState } from '@/systems/PlayerState';
import { preloadMazeTrialAssets } from '@/systems/SceneAssetPreloader';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

import type { LegacyLocationId } from './LegacyContent';

const ROUND_MS = 32_000;
const MAX_TORCH = 3;
const ROUTE_PREVIEW_MS = 4_200;
const HINT_PREVIEW_MS = 2_400;

const RUNE_META: Record<
  MazeRouteRune,
  { readonly label: string; readonly glyph: string; readonly clue: string; readonly color: number }
> = {
  sun: { label: '日辉门', glyph: '日', clue: '看见暖金光，就走日辉门。', color: 0xffc44d },
  moon: { label: '月影门', glyph: '月', clue: '听见轻铃声，就走月影门。', color: 0x8ac7ff },
  leaf: { label: '藤叶门', glyph: '叶', clue: '闻到青草气，就走藤叶门。', color: 0x65d784 },
  crystal: { label: '晶石门', glyph: '晶', clue: '地面发蓝光，就走晶石门。', color: 0xb9a8ff },
};

export class MazeTrialScene extends Phaser.Scene {
  private returnLocationId: LegacyLocationId = 'maze';
  private state!: MazeRouteTrialState;
  private route: MazeRouteRune[] = [];
  private depth = 0;
  private mistakes = 0;
  private torch = MAX_TORCH;
  private roundActive = false;
  private roundEndsAt = 0;
  private previewVisibleUntil = 0;
  private routeTexts: Phaser.GameObjects.Text[] = [];
  private depthText!: Phaser.GameObjects.Text;
  private torchText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private rewardText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hintButton: Phaser.GameObjects.Container | null = null;
  private resultPanel: Phaser.GameObjects.Container | null = null;

  public constructor() {
    super({ key: SceneKey.MAZE_TRIAL });
  }

  public init(data?: { readonly returnLocationId?: LegacyLocationId }): void {
    this.returnLocationId = data?.returnLocationId ?? 'maze';
  }

  public preload(): void {
    preloadMazeTrialAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.state = readMazeRouteTrialState(globalThis.localStorage);
    this.drawBackground();
    this.drawHud();
    this.drawBoard();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.resultPanel?.destroy(true);
      this.resultPanel = null;
      this.hintButton?.destroy(true);
      this.hintButton = null;
    });
    this.startRound();
  }

  public update(time: number): void {
    if (!this.roundActive) return;
    if (time >= this.roundEndsAt) {
      this.finishRound(false);
      return;
    }
    this.refreshHud(time);
  }

  private drawBackground(): void {
    createResponsiveMapBackground(this, 'legacy_maze_gate_clean');
    this.add.rectangle(0, 0, GAME_WIDTH, 92, 0x06264f, 0.72).setOrigin(0).setDepth(8);
    this.add.rectangle(0, GAME_HEIGHT - 72, GAME_WIDTH, 72, 0x06264f, 0.38).setOrigin(0).setDepth(8);
    this.add.ellipse(GAME_WIDTH / 2, 430, 780, 210, 0xfff3b0, 0.12).setDepth(9);
  }

  private drawHud(): void {
    createNavIconButton(this, {
      x: 48,
      y: 34,
      label: '返回',
      onClick: () => this.returnToMaze(),
      depth: 90,
      width: 66,
      height: 46,
    });
    createNavIconButton(this, {
      x: 126,
      y: 34,
      label: '地图',
      onClick: () => this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.MAZE_TRIAL }),
      depth: 90,
      width: 66,
      height: 46,
    });

    this.add
      .text(210, 18, '迷宫路线试炼', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '26px',
        color: '#fff4a8',
        stroke: '#14306b',
        strokeThickness: 5,
      })
      .setDepth(90);

    this.depthText = this.createHudText(432, 35, '深度 0/5');
    this.torchText = this.createHudText(570, 35, '火把 3');
    this.timeText = this.createHudText(704, 35, '32.0s');
    this.rewardText = this.createHudText(820, 35, '奖励 2/2');

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 38, '', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#14306b',
        strokeThickness: 4,
        align: 'center',
        wordWrap: { width: 850 },
      })
      .setOrigin(0.5)
      .setDepth(90);
  }

  private drawBoard(): void {
    const panel = this.add.graphics().setDepth(20);
    panel.fillStyle(0x17365f, 0.72);
    panel.fillRoundedRect(94, 112, 772, 344, 10);
    panel.lineStyle(3, 0xfff0a8, 0.8);
    panel.strokeRoundedRect(94, 112, 772, 344, 10);

    this.add
      .text(GAME_WIDTH / 2, 132, '开局先记住符文顺序，随后按顺序选择四种门。看提示会消耗 1 支火把。', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#e8fbff',
        stroke: '#102a50',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(24);

    this.routeTexts = Array.from({ length: MAZE_ROUTE_TRIAL_TARGET_DEPTH }, (_, index) =>
      this.add
        .text(320 + index * 62, 188, '?', {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '30px',
          color: '#ffffff',
          stroke: '#102a50',
          strokeThickness: 5,
          backgroundColor: '#00000055',
          fixedWidth: 46,
          align: 'center',
          padding: { top: 6, bottom: 6 },
        })
        .setOrigin(0.5)
        .setDepth(24),
    );

    this.createRuneButton('sun', 252, 316);
    this.createRuneButton('moon', 406, 316);
    this.createRuneButton('leaf', 560, 316);
    this.createRuneButton('crystal', 714, 316);
    this.hintButton = this.createActionButton(480, 418, '回想路线', () => this.revealHint());
  }

  private createHudText(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#123767',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(90);
  }

  private createRuneButton(rune: MazeRouteRune, x: number, y: number): void {
    const meta = RUNE_META[rune];
    const group = this.add.container(x, y).setDepth(28);
    const bg = this.add.graphics();
    bg.fillStyle(meta.color, 0.94);
    bg.fillRoundedRect(-58, -68, 116, 136, 10);
    bg.lineStyle(3, 0xffffff, 0.86);
    bg.strokeRoundedRect(-58, -68, 116, 136, 10);
    const glyph = this.add
      .text(0, -22, meta.glyph, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '42px',
        color: '#ffffff',
        stroke: '#102a50',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    const label = this.add
      .text(0, 36, meta.label, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#102a50',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const zone = this.add
      .zone(0, 0, 116, 136)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => group.setScale(1.04))
      .on('pointerout', () => group.setScale(1))
      .on('pointerup', () => this.chooseRune(rune));
    group.add([bg, glyph, label, zone]);
  }

  private createActionButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const group = this.add.container(x, y).setDepth(40);
    const bg = this.add.graphics();
    bg.fillStyle(0xffbd4a, 0.96);
    bg.fillRoundedRect(-72, -22, 144, 44, 8);
    bg.lineStyle(2, 0xffffff, 0.86);
    bg.strokeRoundedRect(-72, -22, 144, 44, 8);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#8a4a00',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const zone = this.add
      .zone(0, 0, 144, 44)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
    group.add([bg, text, zone]);
    return group;
  }

  private startRound(): void {
    this.resultPanel?.destroy(true);
    this.resultPanel = null;
    this.depth = 0;
    this.mistakes = 0;
    this.torch = MAX_TORCH;
    this.hintButton?.setVisible(true);
    this.roundEndsAt = this.time.now + ROUND_MS;
    this.previewVisibleUntil = this.time.now + ROUTE_PREVIEW_MS;
    this.roundActive = true;
    this.route = generateMazeRouteSequence(`${this.state.date}:${this.state.totalRuns}:${Date.now()}`);
    this.statusText.setText('记住上方路线。预览消失后，按顺序选择正确的符文门。');
    this.refreshHud(this.time.now);
  }

  private chooseRune(rune: MazeRouteRune): void {
    if (!this.roundActive) return;
    const target = this.route[this.depth] ?? this.route[0]!;
    if (rune === target) {
      this.depth += 1;
      this.floatText(480, 238, `路线正确：${RUNE_META[rune].label}`, '#d8ffff');
      this.cameras.main.flash(80, 126, 255, 218, false);
      if (this.depth >= MAZE_ROUTE_TRIAL_TARGET_DEPTH) {
        this.finishRound(true);
        return;
      }
      const next = this.route[this.depth] ?? target;
      this.statusText.setText(RUNE_META[next].clue);
    } else {
      this.mistakes += 1;
      this.torch -= 1;
      this.previewVisibleUntil = this.time.now + 900;
      this.floatText(480, 238, `走错了，火把 -1`, '#ffc0df');
      this.cameras.main.flash(100, 130, 62, 160, false);
      if (this.torch <= 0) {
        this.finishRound(false);
        return;
      }
      this.statusText.setText('墙上的符文重新亮了一瞬，稳住路线再继续。');
    }
    this.refreshHud(this.time.now);
  }

  private revealHint(): void {
    if (!this.roundActive) return;
    if (this.torch <= 1) {
      this.statusText.setText('只剩最后一支火把了，不能再用来回想路线。');
      return;
    }
    this.torch -= 1;
    this.previewVisibleUntil = this.time.now + HINT_PREVIEW_MS;
    this.statusText.setText('路线短暂显现。记住后继续走，火把已经消耗 1 支。');
    this.refreshHud(this.time.now);
  }

  private finishRound(success: boolean): void {
    if (!this.roundActive) return;
    this.roundActive = false;
    this.hintButton?.setVisible(false);
    const result = settleMazeRouteTrialRun(this.depth, this.mistakes, this.state);
    this.state = result.next;
    writeMazeRouteTrialState(globalThis.localStorage, this.state);
    gameEvents.emit('minigame:complete', {
      minigameId: MAZE_ROUTE_TRIAL_MINIGAME_ID,
      score: this.depth,
    });

    if (success && result.rewardGranted && result.reward) {
      PlayerState.addCoins(result.reward.coins);
      this.grantItem('exp_candy', result.reward.expCandy);
      this.grantItem('pokeball_great', result.reward.greatBalls);
      if (result.reward.crystalShards > 0) this.grantItem('crystal_shard', result.reward.crystalShards);
      this.statusText.setText('路线试炼完成，迷宫守卫把奖励交给了你。');
    } else if (success) {
      this.statusText.setText('今天的迷宫奖励已经领完，本次成绩仍会写入最高深度。');
    } else {
      this.statusText.setText('火把熄灭或时间耗尽，先退回入口重新整理路线。');
    }
    this.refreshHud(this.time.now);
    this.showResultPanel(success, result.rewardGranted);
  }

  private grantItem(itemId: string, quantity: number): void {
    if (quantity <= 0) return;
    PlayerState.addItem(itemId, quantity);
    gameEvents.emit('item:collect', {
      itemId,
      quantity,
      source: MAZE_ROUTE_TRIAL_SOURCE,
    });
  }

  private showResultPanel(success: boolean, rewardGranted: boolean): void {
    this.resultPanel?.destroy(true);
    const group = this.add.container(GAME_WIDTH / 2, 234).setDepth(120);
    const bg = this.add.graphics();
    bg.fillStyle(0x0d2f58, 0.92);
    bg.fillRoundedRect(-230, -96, 460, 192, 12);
    bg.lineStyle(3, success ? 0x9fffe4 : 0xffb1d4, 0.9);
    bg.strokeRoundedRect(-230, -96, 460, 192, 12);
    const title = this.add
      .text(0, -58, success ? '路线试炼完成' : '迷宫退回入口', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: success ? '#d8ffff' : '#ffd8ec',
        stroke: '#102a50',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    const detail = this.add
      .text(
        0,
        -10,
        `深度 ${this.depth}/${MAZE_ROUTE_TRIAL_TARGET_DEPTH}  失误 ${this.mistakes}  今日奖励 ${remainingMazeRouteTrialRewards(this.state)}/2`,
        {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '17px',
          color: '#ffffff',
          stroke: '#102a50',
          strokeThickness: 3,
        },
      )
      .setOrigin(0.5);
    const reward = this.add
      .text(0, 30, rewardGranted ? '获得经验糖、高级球和彩虹币。完美路线额外带回净化水晶。' : '继续练习也会记录路线成绩。', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#e8fbff',
        stroke: '#102a50',
        strokeThickness: 3,
        align: 'center',
        wordWrap: { width: 390 },
      })
      .setOrigin(0.5);
    group.add([bg, title, detail, reward]);
    const retry = this.createActionButton(-86, 96, '再走一次', () => this.startRound());
    const back = this.createActionButton(86, 96, '回入口', () => this.returnToMaze());
    group.add([retry, back]);
    this.resultPanel = group;
  }

  private refreshHud(time: number): void {
    const remaining = this.roundActive ? Math.max(0, this.roundEndsAt - time) / 1000 : 0;
    this.depthText.setText(`深度 ${this.depth}/${MAZE_ROUTE_TRIAL_TARGET_DEPTH}`);
    this.torchText.setText(`火把 ${Math.max(0, this.torch)}`);
    this.timeText.setText(`${remaining.toFixed(1)}s`);
    this.rewardText.setText(`奖励 ${remainingMazeRouteTrialRewards(this.state)}/2`);
    this.refreshRoutePreview(time);
  }

  private refreshRoutePreview(time: number): void {
    const showRoute = !this.roundActive || time <= this.previewVisibleUntil;
    for (const [index, text] of this.routeTexts.entries()) {
      const rune = this.route[index];
      const meta = rune ? RUNE_META[rune] : null;
      const visible = showRoute || index < this.depth;
      text.setText(visible && meta ? meta.glyph : '?');
      text.setColor(index < this.depth ? '#9fffe4' : visible ? '#ffffff' : '#ffe0a8');
      text.setAlpha(index === this.depth && this.roundActive ? 1 : 0.86);
    }
  }

  private floatText(x: number, y: number, message: string, color: string): void {
    const text = this.add
      .text(x, y, message, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '19px',
        color,
        stroke: '#102a50',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(130);
    this.tweens.add({
      targets: text,
      y: y - 36,
      alpha: 0,
      duration: 760,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private returnToMaze(): void {
    this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: this.returnLocationId });
  }
}
