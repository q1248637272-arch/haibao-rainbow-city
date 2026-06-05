import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import {
  CRYSTAL_MINE_MINIGAME_ID,
  CRYSTAL_MINE_SOURCE,
  CRYSTAL_MINE_TARGET_SCORE,
  readCrystalMineSurveyState,
  remainingCrystalMineRewards,
  settleCrystalMineSurveyRun,
  writeCrystalMineSurveyState,
  type CrystalMineSurveyState,
} from '@/systems/CrystalMineSurvey';
import { gameEvents } from '@/systems/EventBus';
import { PlayerState } from '@/systems/PlayerState';
import { preloadCrystalMineAssets } from '@/systems/SceneAssetPreloader';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

import type { LegacyLocationId } from './LegacyContent';

const ROUND_MS = 32_000;
const MAX_STABILITY = 3;
const NODE_LIFETIME_MS = 1850;

type MineNodeKind = 'shard' | 'ore' | 'trap';

interface MineNode {
  readonly kind: MineNodeKind;
  readonly sprite: Phaser.GameObjects.Image;
  readonly glow: Phaser.GameObjects.Ellipse;
  readonly expireAt: number;
  readonly seed: number;
  readonly size: number;
  readonly scoreValue: number;
  collected: boolean;
}

interface MineSpawnPoint {
  readonly x: number;
  readonly y: number;
}

const SPAWN_POINTS: readonly MineSpawnPoint[] = [
  { x: 156, y: 468 },
  { x: 236, y: 510 },
  { x: 324, y: 438 },
  { x: 420, y: 498 },
  { x: 506, y: 420 },
  { x: 594, y: 492 },
  { x: 692, y: 432 },
  { x: 778, y: 506 },
  { x: 842, y: 454 },
];

export class CrystalMineScene extends Phaser.Scene {
  private returnLocationId: LegacyLocationId = 'energy_cave';
  private state!: CrystalMineSurveyState;
  private nodes: MineNode[] = [];
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private roundActive = false;
  private roundEndsAt = 0;
  private score = 0;
  private streak = 0;
  private stability = MAX_STABILITY;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private stabilityText!: Phaser.GameObjects.Text;
  private rewardText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private restartButton: Phaser.GameObjects.Container | null = null;

  public constructor() {
    super({ key: SceneKey.CRYSTAL_MINE });
  }

  public init(data?: { readonly returnLocationId?: LegacyLocationId }): void {
    this.returnLocationId = data?.returnLocationId ?? 'energy_cave';
  }

  public preload(): void {
    preloadCrystalMineAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.state = readCrystalMineSurveyState(globalThis.localStorage);
    this.drawBackground();
    this.drawHud();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.spawnTimer?.remove(false);
      this.spawnTimer = null;
      this.clearNodes();
      this.restartButton?.destroy();
      this.restartButton = null;
    });
    this.startRound();
  }

  public update(time: number): void {
    if (!this.roundActive) return;
    this.updateNodes(time);
    this.updateHud(time);
    if (time >= this.roundEndsAt) {
      this.finishRound(this.score >= CRYSTAL_MINE_TARGET_SCORE);
    }
  }

  private drawBackground(): void {
    createResponsiveMapBackground(this, 'legacy_crystal_cave_clean');
    this.add.rectangle(0, 0, GAME_WIDTH, 86, 0x06264f, 0.72).setOrigin(0).setDepth(60);
    this.add.rectangle(0, GAME_HEIGHT - 62, GAME_WIDTH, 62, 0x06264f, 0.28).setOrigin(0).setDepth(7);
    this.add
      .ellipse(GAME_WIDTH / 2, 488, 720, 154, 0xa8f6ff, 0.11)
      .setDepth(8);
  }

  private drawHud(): void {
    createNavIconButton(this, {
      x: 48,
      y: 32,
      label: '返回',
      onClick: () => this.returnToCave(),
      depth: 90,
      width: 66,
      height: 46,
    });
    createNavIconButton(this, {
      x: 126,
      y: 32,
      label: '地图',
      onClick: () => this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.CRYSTAL_MINE }),
      depth: 90,
      width: 66,
      height: 46,
    });

    this.add
      .text(218, 18, '水晶矿洞巡采', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '25px',
        color: '#fff4a8',
        stroke: '#14306b',
        strokeThickness: 5,
      })
      .setDepth(90);

    this.scoreText = this.createHudText(432, 33, '晶簇 0/8');
    this.timeText = this.createHudText(568, 33, '32.0s');
    this.streakText = this.createHudText(690, 33, '连采 0');
    this.stabilityText = this.createHudText(812, 33, '稳定 3');

    this.rewardText = this.add
      .text(
        GAME_WIDTH / 2,
        70,
        `今日奖励 ${remainingCrystalMineRewards(this.state)}/2  最高 ${this.state.bestScore}`,
        {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '15px',
          color: '#d8fbff',
          stroke: '#123767',
          strokeThickness: 3,
        },
      )
      .setOrigin(0.5)
      .setDepth(90);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, '点亮发光晶簇，避开暗矿震动。采满 8 点可带回净化水晶。', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#123767',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(90);
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

  private startRound(): void {
    this.restartButton?.destroy();
    this.restartButton = null;
    this.clearNodes();
    this.score = 0;
    this.streak = 0;
    this.stability = MAX_STABILITY;
    this.roundEndsAt = this.time.now + ROUND_MS;
    this.roundActive = true;
    this.statusText.setText('点亮发光晶簇，避开暗矿震动。采满 8 点可带回净化水晶。');
    this.spawnTimer?.remove(false);
    this.spawnTimer = this.time.addEvent({
      delay: 620,
      loop: true,
      callback: () => this.spawnNode(),
    });
    this.time.delayedCall(120, () => this.spawnNode());
    this.time.delayedCall(360, () => this.spawnNode());
    this.updateHud(this.time.now);
  }

  private spawnNode(): void {
    if (!this.roundActive) return;
    const roll = Math.random();
    const kind: MineNodeKind = roll < 0.16 ? 'trap' : roll < 0.34 ? 'ore' : 'shard';
    const point = SPAWN_POINTS[Phaser.Math.Between(0, SPAWN_POINTS.length - 1)] ?? SPAWN_POINTS[0]!;
    const x = point.x + Phaser.Math.Between(-16, 16);
    const y = point.y + Phaser.Math.Between(-12, 12);
    const color = kind === 'trap' ? 0x6d59ff : kind === 'ore' ? 0xffd85c : 0x8ff6ff;
    const texture = kind === 'trap' ? 'object_trial_mine' : kind === 'ore' ? 'item_repair_chip' : 'item_crystal_shard';
    const size = kind === 'trap' ? 52 : kind === 'ore' ? 48 : 46;
    const glow = this.add.ellipse(x, y + 5, size + 24, size * 0.72, color, 0.28).setDepth(19);
    const sprite = this.add
      .image(x, y, this.textures.exists(texture) ? texture : 'item_crystal_shard')
      .setDisplaySize(size, size)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });
    const node: MineNode = {
      kind,
      sprite,
      glow,
      expireAt: this.time.now + NODE_LIFETIME_MS + Phaser.Math.Between(-220, 260),
      seed: Math.random() * Math.PI * 2,
      size,
      scoreValue: kind === 'ore' ? 2 : kind === 'shard' ? 1 : -1,
      collected: false,
    };
    sprite.on('pointerup', () => this.collectNode(node));
    this.nodes.push(node);
  }

  private updateNodes(time: number): void {
    for (const node of this.nodes) {
      if (node.collected) continue;
      if (time >= node.expireAt) {
        node.collected = true;
        this.fadeNode(node);
        continue;
      }
      const life = Phaser.Math.Clamp((node.expireAt - time) / NODE_LIFETIME_MS, 0, 1);
      const pulse = 1 + Math.sin(time * 0.012 + node.seed) * 0.08;
      node.sprite.setDisplaySize(node.size * pulse, node.size * pulse);
      node.glow.setScale(1 + Math.sin(time * 0.01 + node.seed) * 0.12);
      node.sprite.setAlpha(Math.max(0.35, Math.min(1, life * 1.35)));
      node.glow.setAlpha(Math.max(0.12, Math.min(0.32, life * 0.42)));
    }
    this.nodes = this.nodes.filter((node) => !node.collected);
  }

  private collectNode(node: MineNode): void {
    if (!this.roundActive || node.collected) return;
    node.collected = true;
    if (node.kind === 'trap') {
      this.stability -= 1;
      this.streak = 0;
      this.score = Math.max(0, this.score - 1);
      this.flashCamera(0x522b8f);
      this.floatText(node.sprite.x, node.sprite.y - 22, '暗矿震动 -1', '#ffc0df');
      this.statusText.setText('暗矿会扰乱矿脉，先找更亮的晶簇稳住节奏。');
      if (this.stability <= 0) this.finishRound(false);
    } else {
      this.score += node.scoreValue;
      this.streak += 1;
      if (node.kind === 'ore') this.stability = Math.min(MAX_STABILITY, this.stability + 1);
      this.floatText(
        node.sprite.x,
        node.sprite.y - 22,
        node.kind === 'ore' ? '稀有矿 +2' : '净化晶 +1',
        node.kind === 'ore' ? '#fff0a8' : '#d8ffff',
      );
      this.flashCamera(node.kind === 'ore' ? 0xffe076 : 0x7eefff);
      if (this.score >= CRYSTAL_MINE_TARGET_SCORE) this.finishRound(true);
    }
    this.destroyNode(node);
    this.updateHud(this.time.now);
  }

  private finishRound(success: boolean): void {
    if (!this.roundActive) return;
    this.roundActive = false;
    this.spawnTimer?.remove(false);
    this.spawnTimer = null;
    this.clearNodes();

    const result = settleCrystalMineSurveyRun(this.score, this.state);
    this.state = result.next;
    writeCrystalMineSurveyState(globalThis.localStorage, this.state);
    gameEvents.emit('minigame:complete', {
      minigameId: CRYSTAL_MINE_MINIGAME_ID,
      score: this.score,
    });

    if (success && result.rewardGranted && result.reward) {
      PlayerState.addCoins(result.reward.coins);
      PlayerState.addItem('crystal_shard', result.reward.crystalShards);
      gameEvents.emit('item:collect', {
        itemId: 'crystal_shard',
        quantity: result.reward.crystalShards,
        source: CRYSTAL_MINE_SOURCE,
      });
      if (result.reward.repairChips > 0) {
        PlayerState.addItem('repair_chip', result.reward.repairChips);
        gameEvents.emit('item:collect', {
          itemId: 'repair_chip',
          quantity: result.reward.repairChips,
          source: CRYSTAL_MINE_SOURCE,
        });
      }
      this.statusText.setText(
        `巡采完成：净化水晶 x${result.reward.crystalShards}，彩虹币 +${result.reward.coins}。`,
      );
    } else if (success) {
      this.statusText.setText('今日巡采奖励已领完，最高分和任务练习记录已更新。');
    } else {
      this.statusText.setText('矿脉稳定度归零，重新找一条更亮的晶线。');
    }
    this.rewardText.setText(
      `今日奖励 ${remainingCrystalMineRewards(this.state)}/2  最高 ${this.state.bestScore}`,
    );
    this.createRestartButton(success ? '再巡采' : '再试一次');
  }

  private updateHud(time: number): void {
    const remaining = Math.max(0, this.roundEndsAt - time) / 1000;
    this.scoreText.setText(`晶簇 ${this.score}/${CRYSTAL_MINE_TARGET_SCORE}`);
    this.timeText.setText(`${remaining.toFixed(1)}s`);
    this.streakText.setText(`连采 ${this.streak}`);
    this.stabilityText.setText(`稳定 ${Math.max(0, this.stability)}`);
  }

  private createRestartButton(label: string): void {
    this.restartButton?.destroy();
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 92;
    const group = this.add.container(x, y).setDepth(95);
    const bg = this.add.graphics();
    bg.fillStyle(0xffbd4a, 0.96);
    bg.fillRoundedRect(-62, -20, 124, 40, 8);
    bg.lineStyle(2, 0xffffff, 0.86);
    bg.strokeRoundedRect(-62, -20, 124, 40, 8);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
        stroke: '#8a4a00',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const zone = this.add
      .zone(0, 0, 124, 40)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.startRound());
    group.add([bg, text, zone]);
    this.restartButton = group;
  }

  private floatText(x: number, y: number, message: string, color: string): void {
    const text = this.add
      .text(x, y, message, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color,
        stroke: '#123767',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(120);
    this.tweens.add({
      targets: text,
      y: y - 34,
      alpha: 0,
      duration: 720,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private flashCamera(color: number): void {
    this.cameras.main.flash(90, (color >> 16) & 255, (color >> 8) & 255, color & 255, false);
  }

  private fadeNode(node: MineNode): void {
    this.tweens.add({
      targets: [node.sprite, node.glow],
      alpha: 0,
      duration: 180,
      onComplete: () => this.destroyNode(node),
    });
  }

  private destroyNode(node: MineNode): void {
    node.sprite.destroy();
    node.glow.destroy();
  }

  private clearNodes(): void {
    for (const node of this.nodes) {
      this.destroyNode(node);
    }
    this.nodes = [];
  }

  private returnToCave(): void {
    this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: this.returnLocationId });
  }
}
