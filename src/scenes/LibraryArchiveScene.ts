import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { gameEvents } from '@/systems/EventBus';
import {
  LIBRARY_ARCHIVE_CATEGORY_LABELS,
  LIBRARY_ARCHIVE_CATEGORIES,
  LIBRARY_ARCHIVE_MINIGAME_ID,
  LIBRARY_ARCHIVE_SOURCE,
  LIBRARY_ARCHIVE_TARGET_SCORE,
  generateLibraryArchiveDeck,
  readLibraryArchiveSortState,
  remainingLibraryArchiveRewards,
  settleLibraryArchiveSortRun,
  writeLibraryArchiveSortState,
  type LibraryArchiveCard,
  type LibraryArchiveCategory,
  type LibraryArchiveSortState,
} from '@/systems/LibraryArchiveSort';
import { PlayerState } from '@/systems/PlayerState';
import { preloadLibraryArchiveAssets } from '@/systems/SceneAssetPreloader';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

import type { LegacyLocationId } from './LegacyContent';

export const LIBRARY_ARCHIVE_BACKGROUND_KEY = 'premium_library_archive_desk_image2';

const ARCHIVE_BACKGROUND_SOURCE_WIDTH = 1672;
const ARCHIVE_BACKGROUND_SOURCE_HEIGHT = 941;
const ROUND_MS = 44_000;
const MAX_FOCUS = 3;

const CATEGORY_TONES: Readonly<Record<LibraryArchiveCategory, number>> = {
  map: 0x49a9ff,
  pet: 0xff8ec5,
  item: 0xffc654,
  activity: 0x78d878,
};

export class LibraryArchiveScene extends Phaser.Scene {
  private returnLocationId: LegacyLocationId = 'library';
  private state!: LibraryArchiveSortState;
  private deck: LibraryArchiveCard[] = [];
  private cardIndex = 0;
  private score = 0;
  private mistakes = 0;
  private focus = MAX_FOCUS;
  private roundActive = false;
  private roundEndsAt = 0;
  private cardTitleText!: Phaser.GameObjects.Text;
  private cardHintText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private focusText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private rewardText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private categoryButtons: Phaser.GameObjects.Container[] = [];
  private resultPanel: Phaser.GameObjects.Container | null = null;

  public constructor() {
    super({ key: SceneKey.LIBRARY_ARCHIVE });
  }

  public init(data?: { readonly returnLocationId?: LegacyLocationId }): void {
    this.returnLocationId = data?.returnLocationId ?? 'library';
  }

  public preload(): void {
    preloadLibraryArchiveAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.state = readLibraryArchiveSortState(globalThis.localStorage);
    this.drawBackground();
    this.drawHud();
    this.drawArchiveDesk();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.resultPanel?.destroy(true);
      this.resultPanel = null;
      this.categoryButtons = [];
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
    if (this.textures.exists(LIBRARY_ARCHIVE_BACKGROUND_KEY)) {
      createResponsiveMapBackground(this, LIBRARY_ARCHIVE_BACKGROUND_KEY, {
        stageAlpha: 0.9,
        coverAlpha: 0.9,
        stageWidth: ARCHIVE_BACKGROUND_SOURCE_WIDTH,
        stageHeight: ARCHIVE_BACKGROUND_SOURCE_HEIGHT,
      });
    } else {
      createResponsiveMapBackground(this, 'legacy_library_clean', {
        stageAlpha: 0.64,
        coverAlpha: 0.64,
      });
    }
    this.add.rectangle(0, 0, GAME_WIDTH, 92, 0x092957, 0.72).setOrigin(0).setDepth(20);
    this.add.rectangle(0, GAME_HEIGHT - 76, GAME_WIDTH, 76, 0x092957, 0.42).setOrigin(0).setDepth(20);
    this.add.ellipse(GAME_WIDTH / 2, 392, 760, 230, 0xfff4ba, 0.1).setDepth(21);
  }

  private drawHud(): void {
    createNavIconButton(this, {
      x: 48,
      y: 34,
      label: '返回',
      onClick: () => this.returnToLibrary(),
      depth: 90,
      width: 66,
      height: 46,
    });
    createNavIconButton(this, {
      x: 126,
      y: 34,
      label: '地图',
      onClick: () => this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.LIBRARY_ARCHIVE }),
      depth: 90,
      width: 66,
      height: 46,
    });

    this.add
      .text(222, 18, '图书馆档案修复台', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '26px',
        color: '#fff4a8',
        stroke: '#14306b',
        strokeThickness: 5,
      })
      .setDepth(90);

    this.progressText = this.createHudText(452, 35, '修复 0/6');
    this.focusText = this.createHudText(586, 35, '专注 3');
    this.timeText = this.createHudText(704, 35, '44.0s');
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

  private drawArchiveDesk(): void {
    const panel = this.add.graphics().setDepth(30);
    panel.fillStyle(0x102e58, 0.76);
    panel.fillRoundedRect(92, 114, 776, 354, 10);
    panel.lineStyle(3, 0xffe39a, 0.88);
    panel.strokeRoundedRect(92, 114, 776, 354, 10);

    panel.fillStyle(0xfff8df, 0.94);
    panel.fillRoundedRect(270, 164, 420, 150, 10);
    panel.lineStyle(2, 0xc9792d, 0.8);
    panel.strokeRoundedRect(270, 164, 420, 150, 10);

    this.add
      .text(GAME_WIDTH / 2, 136, '把档案卡放回正确分类。错分会消耗专注，完成 6 张即可登记奖励。', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#e8fbff',
        stroke: '#102a50',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(35);

    this.cardTitleText = this.add
      .text(GAME_WIDTH / 2, 202, '', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '25px',
        color: '#522812',
        align: 'center',
        wordWrap: { width: 360 },
      })
      .setOrigin(0.5)
      .setDepth(36);
    this.cardHintText = this.add
      .text(GAME_WIDTH / 2, 266, '', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#6d4227',
        align: 'center',
        wordWrap: { width: 360 },
      })
      .setOrigin(0.5)
      .setDepth(36);

    const buttonWidth = 136;
    const gap = 16;
    const totalWidth = LIBRARY_ARCHIVE_CATEGORIES.length * buttonWidth + (LIBRARY_ARCHIVE_CATEGORIES.length - 1) * gap;
    const startX = GAME_WIDTH / 2 - totalWidth / 2 + buttonWidth / 2;
    LIBRARY_ARCHIVE_CATEGORIES.forEach((category, index) => {
      this.categoryButtons.push(
        this.createCategoryButton(category, startX + index * (buttonWidth + gap), 372, buttonWidth, 90),
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

  private createCategoryButton(
    category: LibraryArchiveCategory,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const tone = CATEGORY_TONES[category];
    const group = this.add.container(x, y).setDepth(42);
    const bg = this.add.graphics();
    bg.fillStyle(tone, 0.96);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 9);
    bg.lineStyle(3, 0xffffff, 0.88);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 9);
    const label = this.add
      .text(0, -8, LIBRARY_ARCHIVE_CATEGORY_LABELS[category], {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '26px',
        color: '#ffffff',
        stroke: '#17345f',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(0, 24, this.categorySubtitle(category), {
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
      .on('pointerup', () => this.chooseCategory(category));
    group.add([bg, label, sub, zone]);
    return group;
  }

  private categorySubtitle(category: LibraryArchiveCategory): string {
    switch (category) {
      case 'map':
        return '地点 / 路线';
      case 'pet':
        return '伙伴 / 形态';
      case 'item':
        return '背包 / 材料';
      case 'activity':
        return '试炼 / 玩法';
    }
  }

  private startRound(): void {
    this.resultPanel?.destroy(true);
    this.resultPanel = null;
    this.cardIndex = 0;
    this.score = 0;
    this.mistakes = 0;
    this.focus = MAX_FOCUS;
    this.deck = generateLibraryArchiveDeck(`${this.state.date}:${this.state.totalRuns}`);
    this.roundEndsAt = this.time.now + ROUND_MS;
    this.roundActive = true;
    this.categoryButtons.forEach((button) => button.setVisible(true));
    this.statusText.setText('读卡片标题和提示，然后选择它属于地图、精灵、道具还是活动。');
    this.showCurrentCard();
    this.refreshHud(this.time.now);
  }

  private chooseCategory(category: LibraryArchiveCategory): void {
    if (!this.roundActive) return;
    const card = this.deck[this.cardIndex];
    if (!card) return;

    if (category === card.category) {
      this.score += 1;
      this.cardIndex += 1;
      this.floatText(GAME_WIDTH / 2, 322, '归档正确 +1', '#d8ffff');
      this.cameras.main.flash(80, 114, 244, 210, false);
      if (this.score >= LIBRARY_ARCHIVE_TARGET_SCORE || this.cardIndex >= this.deck.length) {
        this.finishRound(true);
        return;
      }
      this.statusText.setText('很好，下一张档案已经翻到桌面上。');
      this.showCurrentCard();
    } else {
      this.mistakes += 1;
      this.focus -= 1;
      const targetLabel = LIBRARY_ARCHIVE_CATEGORY_LABELS[card.category];
      this.floatText(GAME_WIDTH / 2, 322, `分类不对，应该放到${targetLabel}`, '#ffc0df');
      this.cameras.main.flash(100, 148, 62, 160, false);
      if (this.focus <= 0) {
        this.finishRound(false);
        return;
      }
      this.statusText.setText(`纸页被打乱了，专注 -1。再看提示：${card.hint}`);
    }
    this.refreshHud(this.time.now);
  }

  private showCurrentCard(): void {
    const card = this.deck[this.cardIndex];
    if (!card) {
      this.cardTitleText.setText('档案已清空');
      this.cardHintText.setText('等待结算...');
      return;
    }
    this.cardTitleText.setText(card.title);
    this.cardHintText.setText(card.hint);
  }

  private finishRound(success: boolean): void {
    if (!this.roundActive) return;
    this.roundActive = false;
    this.categoryButtons.forEach((button) => button.setVisible(false));
    const result = settleLibraryArchiveSortRun(this.score, this.mistakes, this.state);
    this.state = result.next;
    writeLibraryArchiveSortState(globalThis.localStorage, this.state);
    gameEvents.emit('minigame:complete', {
      minigameId: LIBRARY_ARCHIVE_MINIGAME_ID,
      score: this.score,
    });

    if (success && result.rewardGranted && result.reward) {
      PlayerState.addCoins(result.reward.coins);
      this.grantItem('exp_candy', result.reward.expCandy);
      this.grantItem('element_fruit_light', result.reward.lightFruit);
      this.grantItem('crystal_shard', result.reward.crystalShards);
      this.statusText.setText(`档案修复完成，获得彩虹币 +${result.reward.coins}。`);
    } else if (success) {
      this.statusText.setText('档案已经登记，但今天的修复台奖励次数已用完。');
    } else {
      this.statusText.setText('专注耗尽或时间到了，先把桌面重新整理一下再试。');
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
      source: LIBRARY_ARCHIVE_SOURCE,
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
      .text(0, -62, success ? '档案修复完成' : '桌面需要重整', {
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
        `修复 ${this.score}/${LIBRARY_ARCHIVE_TARGET_SCORE}  错分 ${this.mistakes}  今日奖励 ${remainingLibraryArchiveRewards(this.state)}/2`,
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
          ? '经验糖、光元素果实会进入背包；完美修复还会带回净化水晶。'
          : '继续练习也会刷新最高修复记录，并能推进真实任务目标。',
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
    const retry = this.createActionButton(-88, 100, '再修一轮', () => this.startRound());
    const back = this.createActionButton(88, 100, '回图书馆', () => this.returnToLibrary());
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
    this.progressText.setText(`修复 ${this.score}/${LIBRARY_ARCHIVE_TARGET_SCORE}`);
    this.focusText.setText(`专注 ${Math.max(0, this.focus)}`);
    this.timeText.setText(`${remaining.toFixed(1)}s`);
    this.rewardText.setText(`奖励 ${remainingLibraryArchiveRewards(this.state)}/2`);
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

  private returnToLibrary(): void {
    this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: this.returnLocationId });
  }
}
