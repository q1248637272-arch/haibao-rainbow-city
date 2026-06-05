import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import {
  GAMEPLAY_GUIDE_CATEGORIES,
  GAMEPLAY_GUIDE_SEEN_KEY,
  entriesForGameplayGuide,
  type GameplayGuideCategory,
  type GameplayGuideCategoryId,
  type GameplayGuideEntry,
} from '@/data/gameplayGuide';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

interface GuideSceneData {
  readonly fromScene?: string;
  readonly categoryId?: GameplayGuideCategoryId;
}

const CARD_W = 392;
const CARD_H = 144;
const GUIDE_BACKGROUND_KEY = 'premium_guide_background_image2';

export class GuideScene extends Phaser.Scene {
  private fromScene: string = SceneKey.WORLD;
  private activeCategoryId: GameplayGuideCategoryId = 'daily';
  private contentLayer: Phaser.GameObjects.Container | null = null;

  public constructor() {
    super({ key: SceneKey.GUIDE });
  }

  public init(data?: GuideSceneData): void {
    this.fromScene = data?.fromScene ?? SceneKey.WORLD;
    this.activeCategoryId = data?.categoryId ?? 'daily';
  }

  public create(): void {
    this.markGuideSeen();
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.drawBackground();
    this.drawHeader();
    this.drawTopActions();
    this.drawCategoryTabs();
    this.drawContent();
  }

  private drawBackground(): void {
    if (this.textures.exists(GUIDE_BACKGROUND_KEY)) {
      this.addCoverImage(GUIDE_BACKGROUND_KEY, 0).setAlpha(0.96);
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x021b34, 0.18).setOrigin(0).setDepth(1);
      this.add
        .rectangle(34, 104, GAME_WIDTH - 68, GAME_HEIGHT - 136, 0x032b51, 0.4)
        .setOrigin(0)
        .setDepth(2);
      return;
    }

    const bg = this.add.graphics();
    bg.setDepth(0);
    bg.fillGradientStyle(0x0b4d8d, 0x0b4d8d, 0x7bdcff, 0xf8eaa2, 1, 1, 1, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    bg.fillStyle(0xffffff, 0.18);
    for (let i = 0; i < 7; i += 1) {
      const x = 86 + i * 132;
      const y = 510 + Math.sin(i * 0.7) * 18;
      bg.fillEllipse(x, y, 150, 34);
    }

    bg.fillStyle(0x06335d, 0.68);
    bg.fillRoundedRect(32, 92, GAME_WIDTH - 64, GAME_HEIGHT - 124, 20);
    bg.lineStyle(3, 0xffffff, 0.42);
    bg.strokeRoundedRect(32, 92, GAME_WIDTH - 64, GAME_HEIGHT - 124, 20);
  }

  private addCoverImage(key: string, depth: number): Phaser.GameObjects.Image {
    return createResponsiveMapBackground(this, key, { depth }).stage;
  }

  private drawHeader(): void {
    this.add
      .text(GAME_WIDTH / 2, 24, '玩法导览', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '42px',
        color: '#fff7be',
        stroke: '#073a6f',
        strokeThickness: 7,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(4);

    this.add
      .text(GAME_WIDTH / 2, 70, '先看今日目标，再选择养成、冒险或家园路线', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
        stroke: '#073a6f',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setDepth(4);
  }

  private drawTopActions(): void {
    createNavIconButton(this, {
      x: 68,
      y: 44,
      label: '返回',
      width: 76,
      height: 50,
      depth: 10,
      onClick: () => this.scene.start(this.fromScene),
    });

    createNavIconButton(this, {
      x: GAME_WIDTH - 82,
      y: 44,
      label: '进城',
      width: 82,
      height: 50,
      depth: 10,
      onClick: () => this.scene.start(SceneKey.WORLD),
    });
  }

  private drawCategoryTabs(): void {
    GAMEPLAY_GUIDE_CATEGORIES.forEach((category, index) => {
      const x = 142 + index * 224;
      this.createCategoryTab(category, x, 126);
    });
  }

  private createCategoryTab(category: GameplayGuideCategory, x: number, y: number): void {
    const selected = category.id === this.activeCategoryId;
    const width = 190;
    const height = 54;
    const tab = this.add.container(x, y).setDepth(6);
    const g = this.add.graphics();
    g.fillStyle(selected ? category.accent : 0x0b3768, selected ? 0.95 : 0.72);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 14);
    g.lineStyle(2, selected ? 0xffffff : 0x8cecff, selected ? 0.92 : 0.5);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, 14);
    g.fillStyle(0xffffff, selected ? 0.26 : 0.08);
    g.fillRoundedRect(-width / 2 + 6, -height / 2 + 6, width - 12, 18, 9);

    const title = this.add
      .text(0, -7, category.title, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: selected ? '#073a6f' : '#fff7be',
        stroke: selected ? '#ffffff' : '#073a6f',
        strokeThickness: selected ? 3 : 4,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const count = entriesForGameplayGuide(category.id).length;
    const countLabel = this.add
      .text(0, 15, `${count} 个入口`, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: selected ? '#073a6f' : '#d7f7ff',
      })
      .setOrigin(0.5);

    const hit = this.add
      .zone(0, 0, width, height)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.activeCategoryId === category.id) return;
        this.scene.restart({ fromScene: this.fromScene, categoryId: category.id });
      });

    tab.add([g, title, countLabel, hit]);
  }

  private drawContent(): void {
    this.contentLayer?.destroy(true);
    this.contentLayer = this.add.container(0, 0).setDepth(5);
    const category = GAMEPLAY_GUIDE_CATEGORIES.find((item) => item.id === this.activeCategoryId);
    const entries = entriesForGameplayGuide(this.activeCategoryId);

    if (category) {
      this.contentLayer.add(
        this.add
          .text(64, 174, category.subtitle, {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '18px',
            color: '#ffffff',
            stroke: '#073a6f',
            strokeThickness: 4,
          })
          .setOrigin(0, 0),
      );
    }

    entries.slice(0, 4).forEach((entry, index) => {
      const x = 80 + (index % 2) * 420;
      const y = 218 + Math.floor(index / 2) * 170;
      this.contentLayer?.add(this.createEntryCard(entry, x, y));
    });

    this.drawRouteHint(entries);
  }

  private createEntryCard(
    entry: GameplayGuideEntry,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const card = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.9);
    g.fillRoundedRect(0, 0, CARD_W, CARD_H, 14);
    g.fillStyle(0x0b3768, 0.1);
    g.fillRoundedRect(8, 8, CARD_W - 16, CARD_H - 16, 12);
    g.lineStyle(3, entry.accent, 0.88);
    g.strokeRoundedRect(0, 0, CARD_W, CARD_H, 14);
    g.fillStyle(entry.accent, 0.22);
    g.fillRoundedRect(0, 0, CARD_W, 42, 14);

    const icon = this.add.graphics();
    icon.fillStyle(entry.accent, 1);
    icon.fillCircle(32, 30, 19);
    icon.lineStyle(3, 0xffffff, 0.88);
    icon.strokeCircle(32, 30, 19);
    this.drawEntryIcon(icon, 32, 30, entry.id);

    const title = this.add
      .text(62, 18, entry.title, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#073a6f',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    const summary = this.add
      .text(22, 54, entry.summary, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#123f63',
        lineSpacing: 3,
        wordWrap: { width: 250, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);

    const reward = this.add
      .text(22, 108, `奖励：${entry.rewardHint}`, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#6c4a00',
        wordWrap: { width: 236, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);

    const actionButton = this.createCardButton(CARD_W - 68, CARD_H - 36, entry.actionLabel, () =>
      this.openEntry(entry),
    );

    card.add([g, icon, title, summary, reward, actionButton]);
    if (entry.badge) {
      const badge = this.add.graphics();
      badge.fillStyle(entry.accent, 0.96);
      badge.fillRoundedRect(CARD_W - 76, 14, 58, 24, 12);
      const badgeText = this.add
        .text(CARD_W - 47, 26, entry.badge, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '13px',
          color: '#073a6f',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      card.add([badge, badgeText]);
    }
    return card;
  }

  private drawEntryIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, id: string): void {
    g.fillStyle(0xffffff, 0.96);
    if (id.includes('checkin')) {
      g.fillRoundedRect(x - 9, y - 8, 18, 17, 4);
      g.fillStyle(0xff6fae, 1);
      g.fillRoundedRect(x - 9, y - 13, 18, 6, 3);
      return;
    }
    if (id.includes('pet') || id.includes('hatchery') || id.includes('potential')) {
      g.fillCircle(x, y, 10);
      g.fillStyle(0xff6fae, 1);
      g.fillCircle(x, y - 4, 4);
      return;
    }
    if (id.includes('route') || id.includes('bath')) {
      g.fillTriangle(x, y - 12, x + 11, y + 9, x - 11, y + 9);
      return;
    }
    if (id.includes('farm') || id.includes('angel') || id.includes('furniture')) {
      g.fillRoundedRect(x - 11, y - 6, 22, 14, 4);
      g.fillTriangle(x - 13, y - 5, x, y - 17, x + 13, y - 5);
      return;
    }
    g.fillPoints(starPoints(x, y, 5, 12, 5), true);
  }

  private createCardButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const button = this.add.container(x, y);
    const width = 104;
    const height = 34;
    const g = this.add.graphics();
    const draw = (hover: boolean): void => {
      g.clear();
      g.fillStyle(hover ? 0xff8f2d : 0xffb23d, 0.98);
      g.fillRoundedRect(-width / 2, -height / 2, width, height, 9);
      g.lineStyle(2, 0xffffff, 0.78);
      g.strokeRoundedRect(-width / 2, -height / 2, width, height, 9);
    };
    draw(false);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: label.length > 4 ? '14px' : '16px',
        color: '#ffffff',
        stroke: '#8a3e00',
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const hit = this.add
      .zone(0, 0, width, height)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => draw(true))
      .on('pointerout', () => draw(false))
      .on('pointerup', onClick);
    button.add([g, text, hit]);
    return button;
  }

  private drawRouteHint(entries: readonly GameplayGuideEntry[]): void {
    const panel = this.add.container(GAME_WIDTH / 2, 574).setDepth(6);
    const g = this.add.graphics();
    g.fillStyle(0x073a6f, 0.72);
    g.fillRoundedRect(-414, -30, 828, 60, 14);
    g.lineStyle(2, 0xffffff, 0.28);
    g.strokeRoundedRect(-414, -30, 828, 60, 14);

    const route = entries
      .slice(0, 4)
      .map((entry, index) => `${index + 1}.${entry.title}`)
      .join('  >  ');
    const text = this.add
      .text(0, -5, `推荐顺序：${route}`, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#fff7be',
        stroke: '#073a6f',
        strokeThickness: 3,
        wordWrap: { width: 780, useAdvancedWrap: true },
      })
      .setOrigin(0.5);

    const small = this.add
      .text(0, 18, '这里会一直保留入口，忘了下一步就回来看。', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#d7f7ff',
      })
      .setOrigin(0.5);

    panel.add([g, text, small]);
  }

  private openEntry(entry: GameplayGuideEntry): void {
    const data = {
      ...(entry.sceneData ?? {}),
      fromScene: SceneKey.GUIDE,
    };
    this.scene.start(entry.scene, data);
  }

  private markGuideSeen(): void {
    try {
      globalThis.localStorage?.setItem(GAMEPLAY_GUIDE_SEEN_KEY, '1');
    } catch {
      // localStorage may be unavailable in private browsing.
    }
  }
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
