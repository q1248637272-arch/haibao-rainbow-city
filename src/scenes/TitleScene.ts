import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { GAMEPLAY_GUIDE_SEEN_KEY } from '@/data/gameplayGuide';
import { AudioManager } from '@/systems/AudioManager';
import {
  buildGameplaySuggestions,
  type GameplaySuggestion,
  type GameplaySuggestionTone,
} from '@/systems/GameplayAdvisor';
import { effectParticleCount, motionScale } from '@/systems/PerformanceProfile';
import { PlayerState } from '@/systems/PlayerState';
import { createNavIconButton } from '@/ui/NavIconButton';

const PREMIUM_ENTRY_BG = 'premium_entry_image2';
const LEGACY_ENTRY_BG = 'legacy_entry_full';

export class TitleScene extends Phaser.Scene {
  private entryBackground?: Phaser.GameObjects.Image;

  private entryDimmer?: Phaser.GameObjects.Rectangle;

  private entryFallback?: Phaser.GameObjects.Rectangle;

  public constructor() {
    super({ key: SceneKey.TITLE });
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    globalThis.document?.getElementById('html-loading')?.classList.add('is-hidden');
    this.drawEntryImage();
    this.drawAmbientMotion();
    this.input.keyboard?.once('keydown-ENTER', () => this.enterRainbowCity());

    AudioManager.play('title', undefined, this);
  }

  private drawEntryImage(): void {
    const entryBg = this.textures.exists(PREMIUM_ENTRY_BG)
      ? PREMIUM_ENTRY_BG
      : this.textures.exists(LEGACY_ENTRY_BG)
        ? LEGACY_ENTRY_BG
        : null;
    if (entryBg) {
      this.entryBackground = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, entryBg).setDepth(0);
      this.entryDimmer = this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x00345d, 0.08)
        .setDepth(1);
    } else {
      this.entryFallback = this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR)
        .setDepth(0);
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '海宝彩虹城', {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '54px',
          color: '#ffffff',
          stroke: '#1b6fa8',
          strokeThickness: 8,
        })
        .setOrigin(0.5);
    }
    this.refreshEntryBackdrop();
    const refreshBackdrop = (): void => this.refreshEntryBackdrop();
    this.scale.on(Phaser.Scale.Events.RESIZE, refreshBackdrop);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, refreshBackdrop);
    });

    this.drawTitleLogo();
    this.drawStartButton();
    this.drawAdventureShowcase();

    const navWidth = 112;
    const navGap = 16;
    const navY = 50;
    const navTouchHeight = 104;

    createNavIconButton(this, {
      x: 72,
      y: navY,
      label: '签到',
      width: navWidth,
      height: 62,
      touchWidth: 118,
      touchHeight: navTouchHeight,
      depth: 20,
      onClick: () => this.scene.start(SceneKey.VIP_PANEL),
    });

    createNavIconButton(this, {
      x: 72 + navWidth + navGap,
      y: navY,
      label: '玩法',
      width: navWidth,
      height: 62,
      touchWidth: 118,
      touchHeight: navTouchHeight,
      depth: 20,
      onClick: () => this.openGuide(),
    });

    createNavIconButton(this, {
      x: 72 + (navWidth + navGap) * 2,
      y: navY,
      label: '存档',
      width: navWidth,
      height: 62,
      touchWidth: 118,
      touchHeight: navTouchHeight,
      depth: 20,
      onClick: () => this.scene.start(SceneKey.SAVE_SLOTS, { fromScene: SceneKey.TITLE }),
    });

    this.drawGuidePromptIfNeeded();
  }

  private refreshEntryBackdrop(): void {
    const camera = this.cameras.main;
    camera.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    const visibleWidth = Math.max(GAME_WIDTH, camera.width);
    const visibleHeight = Math.max(GAME_HEIGHT, camera.height);

    if (this.entryBackground) {
      const source = this.textures.get(this.entryBackground.texture.key).getSourceImage() as {
        width: number;
        height: number;
      };
      const scale = Math.max(visibleWidth / source.width, visibleHeight / source.height);
      this.entryBackground.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2);
      this.entryBackground.setScale(scale);
    }

    this.entryDimmer
      ?.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setDisplaySize(visibleWidth, visibleHeight);
    this.entryFallback
      ?.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setDisplaySize(visibleWidth, visibleHeight);
  }

  private drawAmbientMotion(): void {
    const scale = motionScale();
    if (scale <= 0.58) return;

    const beams = this.add.graphics().setDepth(2);
    beams.fillStyle(0xffffff, 0.1);
    beams.fillTriangle(310, -20, 382, -20, 260, 640);
    beams.fillTriangle(650, -20, 728, -20, 806, 640);

    const bubbleCount = effectParticleCount(16);
    for (let i = 0; i < bubbleCount; i += 1) {
      const x = Phaser.Math.Between(54, GAME_WIDTH - 54);
      const y = Phaser.Math.Between(110, GAME_HEIGHT + 90);
      const radius = Phaser.Math.Between(3, 9);
      const bubble = this.add.circle(x, y, radius, 0xffffff, 0.18).setDepth(3);
      bubble.setStrokeStyle(1, 0xcff7ff, 0.38);
      this.tweens.add({
        targets: bubble,
        y: y - Phaser.Math.Between(70, 150),
        x: x + Phaser.Math.Between(-18, 18),
        alpha: 0.04,
        duration: (2600 + Phaser.Math.Between(0, 1600)) / scale,
        delay: Phaser.Math.Between(0, 900),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const sparkleCount = effectParticleCount(9);
    for (let i = 0; i < sparkleCount; i += 1) {
      const sparkle = this.add
        .star(
          Phaser.Math.Between(130, GAME_WIDTH - 130),
          Phaser.Math.Between(92, GAME_HEIGHT - 92),
          5,
          3,
          9,
          0xfff4a8,
          0.42,
        )
        .setDepth(4);
      this.tweens.add({
        targets: sparkle,
        angle: 80,
        scaleX: 1.38,
        scaleY: 1.38,
        alpha: 0.08,
        duration: (1400 + Phaser.Math.Between(0, 1100)) / scale,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private drawTitleLogo(): void {
    const x = GAME_WIDTH / 2;
    const y = 162;
    const glow = this.add.graphics().setDepth(8);
    glow.fillStyle(0xffffff, 0.26);
    glow.fillEllipse(x, y + 4, 590, 124);
    glow.fillStyle(0x4ce7ff, 0.16);
    glow.fillEllipse(x, y + 8, 690, 166);

    this.add
      .text(x + 5, y + 7, '海宝彩虹城', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '82px',
        color: '#145f9b',
        stroke: '#ffffff',
        strokeThickness: 13,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setAlpha(0.8);

    this.add
      .text(x, y, '海宝彩虹城', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '82px',
        color: '#ecfbff',
        stroke: '#0866b4',
        strokeThickness: 10,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 5, '#082d63', 8, true, true);
  }

  private drawStartButton(): void {
    const x = GAME_WIDTH / 2;
    const y = 526;
    const button = this.add.graphics().setDepth(9);
    button.fillStyle(0xffffff, 0.72);
    button.fillRoundedRect(x - 205, y - 38, 410, 76, 18);
    button.fillStyle(0xffd95d, 1);
    button.fillRoundedRect(x - 194, y - 29, 388, 58, 16);
    button.fillStyle(0xff9e25, 1);
    button.fillRoundedRect(x - 184, y - 18, 368, 42, 14);
    button.lineStyle(3, 0xffffff, 0.92);
    button.strokeRoundedRect(x - 205, y - 38, 410, 76, 18);
    button.lineStyle(3, 0x8a4b00, 0.5);
    button.strokeRoundedRect(x - 194, y - 29, 388, 58, 16);

    const label = this.add
      .text(x, y + 1, '点击进入彩虹城', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '34px',
        color: '#ffffff',
        stroke: '#8b3a00',
        strokeThickness: 6,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(10);

    const glint = this.add
      .rectangle(x - 156, y - 3, 42, 56, 0xffffff, 0.22)
      .setAngle(-14)
      .setDepth(11);
    this.tweens.add({
      targets: glint,
      x: x + 168,
      alpha: 0.05,
      duration: 1450 / Math.max(0.7, motionScale()),
      delay: 420,
      repeatDelay: 900,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onRepeat: () => {
        glint.setX(x - 156);
        glint.setAlpha(0.22);
      },
    });

    let activePointerId: number | null = null;
    const hit = this.add
      .zone(x, y, 410, 86)
      .setDepth(12)
      .setInteractive({ useHandCursor: true })
      .on(
        'pointerdown',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          activePointerId = pointer.id;
        },
      )
      .on(
        'pointerout',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          activePointerId = null;
        },
      )
      .on(
        'pointerup',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          if (activePointerId !== pointer.id) return;
          activePointerId = null;
          this.enterRainbowCity();
        },
      );

    this.tweens.add({
      targets: [button, label, glint, hit],
      y: '+=4',
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawAdventureShowcase(): void {
    const suggestions = buildGameplaySuggestions({ save: PlayerState.snapshot(), max: 3 });
    const showcase = this.add.container(GAME_WIDTH / 2, 406).setDepth(13);

    const panel = this.add.graphics();
    panel.fillStyle(0x032b51, 0.68);
    panel.fillRoundedRect(-382, -76, 764, 152, 20);
    panel.fillStyle(0xffffff, 0.12);
    panel.fillRoundedRect(-370, -66, 740, 28, 14);
    panel.lineStyle(2, 0xfff1a6, 0.68);
    panel.strokeRoundedRect(-382, -76, 764, 152, 20);
    showcase.add(panel);

    showcase.add(
      this.add
        .text(-352, -52, '今日冒险看板', {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '18px',
          color: '#fff7be',
          stroke: '#073a6f',
          strokeThickness: 4,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );
    showcase.add(
      this.add
        .text(352, -52, '点卡片直接前往', {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '13px',
          color: '#d7f7ff',
          stroke: '#073a6f',
          strokeThickness: 3,
        })
        .setOrigin(1, 0.5),
    );

    suggestions.forEach((suggestion, index) => {
      const entry = this.createRecommendationEntry((index - 1) * 242, 18, suggestion, index);
      showcase.add(entry);
      this.tweens.add({
        targets: entry,
        y: entry.y - 5,
        duration: 1450 + index * 180,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    this.addTitlePet('legacy_pet_flame_puppy', 326, 510, 86, 0);
    this.addTitlePet('legacy_pet_elephant_walrus', 666, 506, 92, 260);
    this.addTitlePet('legacy_pet_rainbow_wing', 775, 340, 74, 520);
  }

  private createRecommendationEntry(
    x: number,
    y: number,
    suggestion: GameplaySuggestion,
    index: number,
  ): Phaser.GameObjects.Container {
    const entry = this.add.container(x, y);
    const color = titleToneColor(suggestion.tone);
    const width = 218;
    const height = 82;
    const g = this.add.graphics();
    const draw = (hover: boolean): void => {
      g.clear();
      g.fillStyle(0xffffff, hover ? 0.22 : 0.14);
      g.fillRoundedRect(-width / 2, -height / 2, width, height, 16);
      g.fillStyle(color, hover ? 0.28 : 0.2);
      g.fillRoundedRect(-width / 2 + 7, -height / 2 + 7, width - 14, 22, 11);
      g.lineStyle(2, color, hover ? 0.9 : 0.64);
      g.strokeRoundedRect(-width / 2, -height / 2, width, height, 16);
    };
    draw(false);

    const badge = this.add.graphics();
    badge.fillStyle(color, 0.96);
    badge.fillCircle(-84, -16, 16);
    badge.lineStyle(2, 0xffffff, 0.88);
    badge.strokeCircle(-84, -16, 16);
    badge.fillStyle(0xffffff, 0.96);
    badge.fillPoints(starPoints(-84, -16, 4, 10, 5), true);

    const title = this.add
      .text(-60, -17, `${index + 1}. ${suggestion.title}`, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#fff7be',
        stroke: '#073a6f',
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    if (title.width > 142) title.setScale(Math.max(0.76, 142 / title.width), 1);

    const detail = this.add
      .text(-92, 6, suggestion.detail, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '11px',
        color: '#e8fbff',
        lineSpacing: 1,
        wordWrap: { width: 184, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);

    const action = this.add
      .text(88, 27, suggestion.actionLabel, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: suggestion.actionLabel.length > 4 ? '11px' : '12px',
        color: '#ffffff',
        stroke: '#8a3e00',
        strokeThickness: 3,
        backgroundColor: '#ff9f2f',
        padding: { left: 7, right: 7, top: 3, bottom: 3 },
      })
      .setOrigin(1, 0.5);

    let activePointerId: number | null = null;
    const hit = this.add
      .zone(0, 0, width, height)
      .setInteractive({ useHandCursor: true })
      .on(
        'pointerover',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          draw(true);
        },
      )
      .on(
        'pointerout',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          activePointerId = null;
          draw(false);
        },
      )
      .on(
        'pointerdown',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          activePointerId = pointer.id;
        },
      )
      .on(
        'pointerup',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          if (activePointerId !== pointer.id) return;
          activePointerId = null;
          this.openSuggestion(suggestion);
        },
      );

    entry.add([g, badge, title, detail, action, hit]);
    return entry;
  }

  private openSuggestion(suggestion: GameplaySuggestion): void {
    this.markGuideSeen();
    this.scene.start(suggestion.scene, {
      ...(suggestion.sceneData ?? {}),
      fromScene: SceneKey.TITLE,
    });
  }

  private createShowcaseEntry(
    x: number,
    y: number,
    item: {
      readonly label: string;
      readonly detail: string;
      readonly color: number;
      readonly icon: string;
    },
  ): Phaser.GameObjects.Container {
    const entry = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x032b51, 0.64);
    g.fillRoundedRect(-104, -34, 208, 68, 16);
    g.fillStyle(0xffffff, 0.14);
    g.fillRoundedRect(-96, -27, 192, 21, 11);
    g.lineStyle(2, item.color, 0.72);
    g.strokeRoundedRect(-104, -34, 208, 68, 16);

    const icon = this.add.graphics();
    icon.fillStyle(item.color, 0.96);
    icon.fillCircle(-72, 0, 22);
    icon.lineStyle(2, 0xffffff, 0.86);
    icon.strokeCircle(-72, 0, 22);
    this.drawShowcaseIcon(icon, -72, 0, item.icon);

    const title = this.add
      .text(-38, -12, item.label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#fff7be',
        stroke: '#073a6f',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const detail = this.add
      .text(-38, 13, item.detail, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: '#e8fbff',
        stroke: '#073a6f',
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5);

    entry.add([g, icon, title, detail]);
    return entry;
  }

  private drawShowcaseIcon(
    icon: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    type: string,
  ): void {
    icon.fillStyle(0xffffff, 0.96);
    if (type === 'calendar') {
      icon.fillRoundedRect(x - 10, y - 9, 20, 18, 4);
      icon.fillStyle(0xff6b8a, 1);
      icon.fillRoundedRect(x - 10, y - 13, 20, 7, 3);
      icon.fillStyle(0xffd93d, 1);
      icon.fillCircle(x - 4, y + 2, 3);
      icon.fillCircle(x + 5, y + 2, 3);
      return;
    }
    if (type === 'pet') {
      icon.fillCircle(x, y, 11);
      icon.fillStyle(0xff6b35, 1);
      icon.fillCircle(x, y - 4, 4);
      icon.fillStyle(0x073a6f, 1);
      icon.fillCircle(x - 4, y - 2, 2);
      icon.fillCircle(x + 4, y - 2, 2);
      return;
    }
    icon.fillPoints(starPoints(x, y, 7, 14, 5), true);
  }

  private addTitlePet(key: string, x: number, y: number, maxSize: number, delay: number): void {
    if (!this.textures.exists(key)) return;
    const image = this.add.image(x, y, key).setDepth(14);
    const source = this.textures.get(key).getSourceImage() as { width: number; height: number };
    const scale = maxSize / Math.max(source.width, source.height);
    image.setScale(scale);
    image.setAlpha(0.94);
    this.tweens.add({
      targets: image,
      y: y - 9,
      angle: key.includes('rainbow') ? 5 : 2,
      duration: 1350 / Math.max(0.72, motionScale()),
      delay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private enterRainbowCity(): void {
    this.scene.start(SceneKey.WORLD);
  }

  private openGuide(): void {
    this.markGuideSeen();
    this.scene.start(SceneKey.GUIDE, { fromScene: SceneKey.TITLE });
  }

  private drawGuidePromptIfNeeded(): void {
    if (this.hasSeenGuide()) return;

    const panel = this.add.container(GAME_WIDTH / 2, 286).setDepth(30);
    const g = this.add.graphics();
    g.fillStyle(0x073a6f, 0.84);
    g.fillRoundedRect(-276, -48, 552, 96, 18);
    g.fillStyle(0xffffff, 0.16);
    g.fillRoundedRect(-264, -38, 528, 31, 14);
    g.lineStyle(3, 0xffffff, 0.52);
    g.strokeRoundedRect(-276, -48, 552, 96, 18);

    const title = this.add
      .text(0, -21, '新内容很多，先看看玩法导览吧', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#fff7be',
        stroke: '#073a6f',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(0, 4, '签到、活动、图鉴、家园、试炼都能从导览一键前往。', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const guideButton = this.createPromptButton(-74, 30, '查看导览', () => this.openGuide());
    const skipButton = this.createPromptButton(92, 30, '先进入', () => {
      this.markGuideSeen();
      this.enterRainbowCity();
    });

    panel.add([g, title, sub, guideButton, skipButton]);
  }

  private createPromptButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const button = this.add.container(x, y);
    const width = 132;
    const height = 32;
    const g = this.add.graphics();
    const draw = (hover: boolean): void => {
      g.clear();
      g.fillStyle(hover ? 0xff8f2d : 0xffb23d, 0.98);
      g.fillRoundedRect(-width / 2, -height / 2, width, height, 9);
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeRoundedRect(-width / 2, -height / 2, width, height, 9);
    };
    draw(false);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#8a3e00',
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    let activePointerId: number | null = null;
    const hit = this.add
      .zone(0, 0, width, height)
      .setInteractive({ useHandCursor: true })
      .on(
        'pointerover',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          draw(true);
        },
      )
      .on(
        'pointerout',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          activePointerId = null;
          draw(false);
        },
      )
      .on(
        'pointerdown',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          activePointerId = pointer.id;
        },
      )
      .on(
        'pointerup',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          stopTitleInput(pointer, event);
          if (activePointerId !== pointer.id) return;
          activePointerId = null;
          onClick();
        },
      );
    button.add([g, text, hit]);
    return button;
  }

  private hasSeenGuide(): boolean {
    try {
      return globalThis.localStorage?.getItem(GAMEPLAY_GUIDE_SEEN_KEY) === '1';
    } catch {
      return true;
    }
  }

  private markGuideSeen(): void {
    try {
      globalThis.localStorage?.setItem(GAMEPLAY_GUIDE_SEEN_KEY, '1');
    } catch {
      // Ignore storage failures so the title screen remains playable.
    }
  }
}

function stopTitleInput(
  pointer?: Phaser.Input.Pointer,
  event?: Phaser.Types.Input.EventData,
): void {
  event?.stopPropagation?.();
  pointer?.event?.stopPropagation?.();
}

function starPoints(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  points: number,
): Phaser.Types.Math.Vector2Like[] {
  const vertices: Phaser.Types.Math.Vector2Like[] = [];
  const total = points * 2;
  for (let i = 0; i < total; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / total;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    vertices.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return vertices;
}

function titleToneColor(tone: GameplaySuggestionTone): number {
  switch (tone) {
    case 'urgent':
      return 0xff7a54;
    case 'reward':
      return 0xffd85a;
    case 'growth':
      return 0x65d6ff;
    case 'home':
      return 0x9ae66e;
    case 'explore':
    default:
      return 0xb8a0ff;
  }
}
