import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { gameEvents } from '@/systems/EventBus';
import { PlayerState } from '@/systems/PlayerState';
import { preloadShipCoreAssets } from '@/systems/SceneAssetPreloader';
import {
  SHIP_CORE_CHANNEL_LABELS,
  SHIP_CORE_CHANNELS,
  SHIP_CORE_MINIGAME_ID,
  SHIP_CORE_SOURCE,
  SHIP_CORE_TARGET_LOCKS,
  generateShipCorePanels,
  readShipCoreCalibrationState,
  remainingShipCoreRewards,
  settleShipCoreCalibrationRun,
  writeShipCoreCalibrationState,
  type ShipCoreCalibrationState,
  type ShipCoreChannel,
  type ShipCorePanel,
} from '@/systems/ShipCoreCalibration';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

import type { LegacyLocationId } from './LegacyContent';

const ROUND_MS = 46_000;
const MAX_STABILITY = 3;

const CHANNEL_TONES: Readonly<Record<ShipCoreChannel, number>> = {
  power: 0xff6b4a,
  nav: 0x4fb8ff,
  shield: 0x64d782,
  beacon: 0xffd45a,
};

const CHANNEL_SUBTITLES: Readonly<Record<ShipCoreChannel, string>> = {
  power: '供能 / 喷口',
  nav: '航线 / 坐标',
  shield: '护罩 / 修补',
  beacon: '灯塔 / 回传',
};

export class ShipCoreScene extends Phaser.Scene {
  private returnLocationId: LegacyLocationId = 'spaceship';
  private state!: ShipCoreCalibrationState;
  private panels: ShipCorePanel[] = [];
  private panelIndex = 0;
  private locks = 0;
  private mistakes = 0;
  private stability = MAX_STABILITY;
  private roundActive = false;
  private roundEndsAt = 0;
  private panelTitleText!: Phaser.GameObjects.Text;
  private panelHintText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private stabilityText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private rewardText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private channelButtons: Phaser.GameObjects.Container[] = [];
  private resultPanel: Phaser.GameObjects.Container | null = null;

  public constructor() {
    super({ key: SceneKey.SHIP_CORE });
  }

  public init(data?: { readonly returnLocationId?: LegacyLocationId }): void {
    this.returnLocationId = data?.returnLocationId ?? 'spaceship';
  }

  public preload(): void {
    preloadShipCoreAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.state = readShipCoreCalibrationState(globalThis.localStorage);
    this.drawBackground();
    this.drawHud();
    this.drawCalibrationBench();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.resultPanel?.destroy(true);
      this.resultPanel = null;
      this.channelButtons = [];
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
    createResponsiveMapBackground(this, 'legacy_spaceship_clean');
    this.add.rectangle(0, 0, GAME_WIDTH, 92, 0x071f42, 0.72).setOrigin(0).setDepth(20);
    this.add.rectangle(0, GAME_HEIGHT - 76, GAME_WIDTH, 76, 0x071f42, 0.46).setOrigin(0).setDepth(20);
    this.add.ellipse(GAME_WIDTH / 2, 396, 720, 250, 0x87f3ff, 0.12).setDepth(21);
    this.add.ellipse(GAME_WIDTH / 2, 396, 420, 138, 0xfff4ba, 0.1).setDepth(22);

    if (this.textures.exists('object_ship_repair_core')) {
      this.add
        .image(GAME_WIDTH / 2, 382, 'object_ship_repair_core')
        .setOrigin(0.5)
        .setScale(0.42)
        .setAlpha(0.62)
        .setDepth(24);
    }
  }

  private drawHud(): void {
    createNavIconButton(this, {
      x: 48,
      y: 34,
      label: '返回',
      onClick: () => this.returnToShip(),
      depth: 90,
      width: 66,
      height: 46,
    });
    createNavIconButton(this, {
      x: 126,
      y: 34,
      label: '地图',
      onClick: () => this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.SHIP_CORE }),
      depth: 90,
      width: 66,
      height: 46,
    });

    this.add
      .text(214, 18, '飞船核心校准台', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '26px',
        color: '#fff4a8',
        stroke: '#14306b',
        strokeThickness: 5,
      })
      .setDepth(90);

    this.progressText = this.createHudText(446, 35, '锁点 0/6');
    this.stabilityText = this.createHudText(588, 35, '稳定 3');
    this.timeText = this.createHudText(704, 35, '46.0s');
    this.rewardText = this.createHudText(828, 35, '奖励 2/2');

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

  private drawCalibrationBench(): void {
    const panel = this.add.graphics().setDepth(30);
    panel.fillStyle(0x102e58, 0.78);
    panel.fillRoundedRect(92, 114, 776, 354, 10);
    panel.lineStyle(3, 0x9fffe4, 0.88);
    panel.strokeRoundedRect(92, 114, 776, 354, 10);

    panel.fillStyle(0xf4fbff, 0.94);
    panel.fillRoundedRect(266, 166, 428, 150, 10);
    panel.lineStyle(2, 0x2d92c9, 0.82);
    panel.strokeRoundedRect(266, 166, 428, 150, 10);

    this.add
      .text(GAME_WIDTH / 2, 136, '读取模块提示，把它接到正确通道。错接会让核心稳定度下降，完成 6 个锁点即可登记修复。', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#e8fbff',
        stroke: '#102a50',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(35);

    this.panelTitleText = this.add
      .text(GAME_WIDTH / 2, 204, '', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '26px',
        color: '#12315b',
        align: 'center',
        wordWrap: { width: 370 },
      })
      .setOrigin(0.5)
      .setDepth(36);
    this.panelHintText = this.add
      .text(GAME_WIDTH / 2, 268, '', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#245174',
        align: 'center',
        wordWrap: { width: 372 },
      })
      .setOrigin(0.5)
      .setDepth(36);

    const buttonWidth = 136;
    const gap = 16;
    const totalWidth = SHIP_CORE_CHANNELS.length * buttonWidth + (SHIP_CORE_CHANNELS.length - 1) * gap;
    const startX = GAME_WIDTH / 2 - totalWidth / 2 + buttonWidth / 2;
    SHIP_CORE_CHANNELS.forEach((channel, index) => {
      this.channelButtons.push(
        this.createChannelButton(channel, startX + index * (buttonWidth + gap), 374, buttonWidth, 92),
      );
    });
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

  private createChannelButton(
    channel: ShipCoreChannel,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const tone = CHANNEL_TONES[channel];
    const group = this.add.container(x, y).setDepth(42);
    const bg = this.add.graphics();
    bg.fillStyle(tone, 0.96);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 9);
    bg.lineStyle(3, 0xffffff, 0.88);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 9);
    const label = this.add
      .text(0, -10, SHIP_CORE_CHANNEL_LABELS[channel], {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '26px',
        color: '#ffffff',
        stroke: '#17345f',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(0, 24, CHANNEL_SUBTITLES[channel], {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#17345f',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const zone = this.add
      .zone(0, 0, width, height)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => group.setScale(1.04))
      .on('pointerout', () => group.setScale(1))
      .on('pointerup', () => this.chooseChannel(channel));
    group.add([bg, label, sub, zone]);
    return group;
  }

  private startRound(): void {
    this.resultPanel?.destroy(true);
    this.resultPanel = null;
    this.panelIndex = 0;
    this.locks = 0;
    this.mistakes = 0;
    this.stability = MAX_STABILITY;
    this.panels = generateShipCorePanels(`${this.state.date}:${this.state.totalRuns}`);
    this.roundEndsAt = this.time.now + ROUND_MS;
    this.roundActive = true;
    this.channelButtons.forEach((button) => button.setVisible(true));
    this.statusText.setText('核心已经打开。先读模块名称和提示，再选择它应该接入的通道。');
    this.showCurrentPanel();
    this.refreshHud(this.time.now);
  }

  private chooseChannel(channel: ShipCoreChannel): void {
    if (!this.roundActive) return;
    const panel = this.panels[this.panelIndex];
    if (!panel) return;

    if (channel === panel.channel) {
      this.locks += 1;
      this.panelIndex += 1;
      this.floatText(GAME_WIDTH / 2, 324, '接线正确 +1', '#d8ffff');
      this.cameras.main.flash(80, 126, 255, 218, false);
      if (this.locks >= SHIP_CORE_TARGET_LOCKS || this.panelIndex >= this.panels.length) {
        this.finishRound(true);
        return;
      }
      this.statusText.setText('锁点亮起。下一块模块已经推到校准台中央。');
      this.showCurrentPanel();
    } else {
      this.mistakes += 1;
      this.stability -= 1;
      const targetLabel = SHIP_CORE_CHANNEL_LABELS[panel.channel];
      this.floatText(GAME_WIDTH / 2, 324, `错接，应该接入${targetLabel}`, '#ffc0df');
      this.cameras.main.flash(100, 148, 62, 160, false);
      if (this.stability <= 0) {
        this.finishRound(false);
        return;
      }
      this.statusText.setText(`稳定度 -1。再看提示：${panel.hint}`);
    }
    this.refreshHud(this.time.now);
  }

  private showCurrentPanel(): void {
    const panel = this.panels[this.panelIndex];
    if (!panel) {
      this.panelTitleText.setText('核心锁点已点亮');
      this.panelHintText.setText('等待结算...');
      return;
    }
    this.panelTitleText.setText(panel.title);
    this.panelHintText.setText(panel.hint);
  }

  private finishRound(success: boolean): void {
    if (!this.roundActive) return;
    this.roundActive = false;
    this.channelButtons.forEach((button) => button.setVisible(false));
    const result = settleShipCoreCalibrationRun(this.locks, this.mistakes, this.state);
    this.state = result.next;
    writeShipCoreCalibrationState(globalThis.localStorage, this.state);
    gameEvents.emit('minigame:complete', {
      minigameId: SHIP_CORE_MINIGAME_ID,
      score: this.locks,
    });

    if (success && result.rewardGranted && result.reward) {
      PlayerState.addCoins(result.reward.coins);
      this.grantItem('repair_chip', result.reward.repairChips);
      this.grantItem('pokeball_great', result.reward.greatBalls);
      this.grantItem('element_fruit_electric', result.reward.electricFruit);
      this.grantItem('crystal_shard', result.reward.crystalShards);
      this.statusText.setText(`核心校准完成，获得彩虹币 +${result.reward.coins}。`);
    } else if (success) {
      this.statusText.setText('核心已记录本次校准，但今天的飞船奖励次数已经用完。');
    } else {
      this.statusText.setText('稳定度耗尽或时间到了。飞船技师把模块退回，等待你重新校准。');
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
      source: SHIP_CORE_SOURCE,
    });
  }

  private showResultPanel(success: boolean, rewardGranted: boolean): void {
    this.resultPanel?.destroy(true);
    const group = this.add.container(GAME_WIDTH / 2, 240).setDepth(130);
    const bg = this.add.graphics();
    bg.fillStyle(0x0d2f58, 0.94);
    bg.fillRoundedRect(-238, -102, 476, 204, 12);
    bg.lineStyle(3, success ? 0x9fffe4 : 0xffb1d4, 0.9);
    bg.strokeRoundedRect(-238, -102, 476, 204, 12);
    const title = this.add
      .text(0, -62, success ? '飞船核心重新点亮' : '核心稳定度归零', {
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
        -12,
        `锁点 ${this.locks}/${SHIP_CORE_TARGET_LOCKS}  错接 ${this.mistakes}  今日奖励 ${remainingShipCoreRewards(this.state)}/2`,
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
      .text(
        0,
        32,
        rewardGranted
          ? '修复芯片、高级精灵球和校准材料已放进背包；完美校准会额外带回净化水晶。'
          : '练习也会刷新最高校准记录，并能推进真实任务目标。',
        {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '15px',
          color: '#e8fbff',
          stroke: '#102a50',
          strokeThickness: 3,
          align: 'center',
          wordWrap: { width: 410 },
        },
      )
      .setOrigin(0.5);
    group.add([bg, title, detail, reward]);
    const retry = this.createActionButton(-88, 100, '再校准', () => this.startRound());
    const back = this.createActionButton(88, 100, '回飞船', () => this.returnToShip());
    group.add([retry, back]);
    this.resultPanel = group;
  }

  private createActionButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const group = this.add.container(x, y).setDepth(140);
    const bg = this.add.graphics();
    bg.fillStyle(0xffbd4a, 0.96);
    bg.fillRoundedRect(-76, -22, 152, 44, 8);
    bg.lineStyle(2, 0xffffff, 0.86);
    bg.strokeRoundedRect(-76, -22, 152, 44, 8);
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
      .zone(0, 0, 152, 44)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
    group.add([bg, text, zone]);
    return group;
  }

  private refreshHud(time: number): void {
    const remaining = this.roundActive ? Math.max(0, this.roundEndsAt - time) / 1000 : 0;
    this.progressText.setText(`锁点 ${this.locks}/${SHIP_CORE_TARGET_LOCKS}`);
    this.stabilityText.setText(`稳定 ${Math.max(0, this.stability)}`);
    this.timeText.setText(`${remaining.toFixed(1)}s`);
    this.rewardText.setText(`奖励 ${remainingShipCoreRewards(this.state)}/2`);
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
      .setDepth(150);
    this.tweens.add({
      targets: text,
      y: y - 36,
      alpha: 0,
      duration: 760,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private returnToShip(): void {
    this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: this.returnLocationId });
  }
}
