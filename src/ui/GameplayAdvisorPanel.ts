import type Phaser from 'phaser';

import { SceneKey } from '@/config/GameConfig';
import type { GameplaySuggestion, GameplaySuggestionTone } from '@/systems/GameplayAdvisor';

export interface GameplayAdvisorPanelOptions {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly depth?: number;
  readonly initiallyCollapsed?: boolean;
  readonly fromScene: string;
  readonly sceneData?: Readonly<Record<string, unknown>>;
  readonly suggestions: readonly GameplaySuggestion[];
  readonly maxRows?: number;
}

const TONE_COLOR: Record<GameplaySuggestionTone, number> = {
  urgent: 0xff7a54,
  reward: 0xffd85a,
  growth: 0x65d6ff,
  explore: 0xb8a0ff,
  home: 0x9ae66e,
};
const ADVISOR_PANEL_TEXTURE_KEY = 'premium_advisor_panel_image2';

export function createGameplayAdvisorPanel(
  scene: Phaser.Scene,
  options: GameplayAdvisorPanelOptions,
): Phaser.GameObjects.Container {
  const width = options.width ?? 320;
  const depth = options.depth ?? 1100;
  const rows = options.suggestions.slice(0, options.maxRows ?? 3);
  const rowHeight = 58;
  const height = 48 + rows.length * rowHeight + 42;
  const panel = scene.add.container(options.x, options.y).setDepth(depth).setScrollFactor(0);
  const content = scene.add.container(0, 0);
  panel.add(content);

  let expanded = !(options.initiallyCollapsed ?? true);
  const redraw = (): void => {
    content.removeAll(true);
    content.setAlpha(0);
    content.setScale(0.96);
    if (expanded) {
      drawExpandedAdvisor(scene, content, width, height, rowHeight, rows, options, () => {
        expanded = false;
        redraw();
      });
    } else {
      drawCollapsedAdvisor(scene, content, rows, () => {
        expanded = true;
        redraw();
      });
    }
    scene.tweens.add({
      targets: content,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 160,
      ease: 'Sine.easeOut',
    });
  };
  redraw();

  return panel;
}

function drawExpandedAdvisor(
  scene: Phaser.Scene,
  content: Phaser.GameObjects.Container,
  width: number,
  height: number,
  rowHeight: number,
  rows: readonly GameplaySuggestion[],
  options: GameplayAdvisorPanelOptions,
  onCollapse: () => void,
): void {
  const chrome: Phaser.GameObjects.GameObject[] = [];
  if (scene.textures.exists(ADVISOR_PANEL_TEXTURE_KEY)) {
    const image = scene.add
      .image(width / 2, height / 2, ADVISOR_PANEL_TEXTURE_KEY)
      .setDisplaySize(width, height)
      .setAlpha(0.95);
    const veil = scene.add.graphics();
    veil.fillStyle(0x042a4c, 0.2);
    veil.fillRoundedRect(8, 8, width - 16, height - 16, 12);
    veil.fillStyle(0xffffff, 0.14);
    veil.fillRoundedRect(12, 10, width - 24, 30, 10);
    veil.lineStyle(2, 0xffffff, 0.38);
    veil.strokeRoundedRect(0, 0, width, height, 14);
    chrome.push(image, veil);
  } else {
    const g = scene.add.graphics();
    g.fillStyle(0x073a6f, 0.78);
    g.fillRoundedRect(0, 0, width, height, 14);
    g.fillStyle(0xffffff, 0.12);
    g.fillRoundedRect(8, 8, width - 16, 32, 12);
    g.lineStyle(2, 0xffffff, 0.34);
    g.strokeRoundedRect(0, 0, width, height, 14);
    chrome.push(g);
  }

  const title = scene.add
    .text(16, 15, '今日推荐', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '18px',
      color: '#fff7be',
      stroke: '#073a6f',
      strokeThickness: 4,
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5);
  const hint = scene.add
    .text(width - 54, 15, '点击前往', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: '#d7f7ff',
    })
    .setOrigin(1, 0.5);

  content.add([...chrome, title, hint, createCollapseButton(scene, width - 26, 17, onCollapse)]);

  rows.forEach((suggestion, index) => {
    content.add(
      createSuggestionRow(scene, suggestion, 12, 48 + index * rowHeight, width - 24, () =>
        openSuggestion(scene, suggestion, options.fromScene, options.sceneData),
      ),
    );
  });

  content.add(
    createMoreButton(scene, width / 2, height - 22, () =>
      scene.scene.start(SceneKey.GUIDE, { fromScene: options.fromScene }),
    ),
  );
}

function drawCollapsedAdvisor(
  scene: Phaser.Scene,
  content: Phaser.GameObjects.Container,
  rows: readonly GameplaySuggestion[],
  onExpand: () => void,
): void {
  const width = 190;
  const height = 58;
  const g = scene.add.graphics();
  g.fillStyle(0x032b51, 0.82);
  g.fillRoundedRect(0, 0, width, height, 16);
  g.fillStyle(0xffffff, 0.16);
  g.fillRoundedRect(8, 7, width - 16, 20, 10);
  g.lineStyle(2, 0xfff1a6, 0.78);
  g.strokeRoundedRect(0, 0, width, height, 16);
  g.lineStyle(1, 0x8cecff, 0.45);
  g.strokeRoundedRect(5, 5, width - 10, height - 10, 13);

  const badge = scene.add.graphics();
  badge.fillStyle(0xffd85a, 0.98);
  badge.fillCircle(28, 29, 18);
  badge.lineStyle(2, 0xffffff, 0.9);
  badge.strokeCircle(28, 29, 18);
  badge.fillStyle(0xffffff, 0.96);
  badge.fillPoints(starPoints(28, 29, 5, 11, 5), true);

  const title = scene.add
    .text(54, 20, '今日推荐', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '17px',
      color: '#fff7be',
      stroke: '#073a6f',
      strokeThickness: 4,
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5);
  const detail = scene.add
    .text(54, 40, `${rows.length} 条待办 · 点开`, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: '#e8fbff',
      stroke: '#073a6f',
      strokeThickness: 2,
    })
    .setOrigin(0, 0.5);
  const arrow = scene.add
    .text(width - 18, 29, '展开', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      stroke: '#8a3e00',
      strokeThickness: 3,
      fontStyle: 'bold',
    })
    .setOrigin(1, 0.5);
  const hit = scene.add
    .zone(width / 2, height / 2, width, height)
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true })
    .on('pointerup', onExpand);
  content.add([g, badge, title, detail, arrow, hit]);
}

function createSuggestionRow(
  scene: Phaser.Scene,
  suggestion: GameplaySuggestion,
  x: number,
  y: number,
  width: number,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const row = scene.add.container(x, y);
  const g = scene.add.graphics();
  const color = TONE_COLOR[suggestion.tone];
  const draw = (hover: boolean): void => {
    g.clear();
    g.fillStyle(0xffffff, hover ? 0.22 : 0.13);
    g.fillRoundedRect(0, 0, width, 52, 10);
    g.lineStyle(1, color, hover ? 0.82 : 0.5);
    g.strokeRoundedRect(0, 0, width, 52, 10);
  };
  draw(false);

  const icon = scene.add.graphics();
  icon.fillStyle(color, 0.95);
  icon.fillCircle(22, 26, 13);
  icon.fillStyle(0xffffff, 0.95);
  icon.fillCircle(22, 26, 5);

  const title = scene.add
    .text(44, 7, suggestion.title, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '15px',
      color: '#fff7be',
      stroke: '#073a6f',
      strokeThickness: 3,
      fontStyle: 'bold',
    })
    .setOrigin(0, 0);

  const detail = scene.add
    .text(44, 27, suggestion.detail, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '11px',
      color: '#e8fbff',
      lineSpacing: 1,
      wordWrap: { width: width - 128, useAdvancedWrap: true },
    })
    .setOrigin(0, 0);

  const action = scene.add
    .text(width - 12, 26, suggestion.actionLabel, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: suggestion.actionLabel.length > 4 ? '12px' : '13px',
      color: '#ffffff',
      stroke: '#8a3e00',
      strokeThickness: 3,
      backgroundColor: '#ff9f2f',
      padding: { left: 7, right: 7, top: 3, bottom: 3 },
    })
    .setOrigin(1, 0.5);

  const hit = scene.add
    .zone(width / 2, 26, width, 52)
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true })
    .on('pointerover', () => draw(true))
    .on('pointerout', () => draw(false))
    .on('pointerup', onClick);

  row.add([g, icon, title, detail, action, hit]);
  return row;
}

function createCollapseButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const button = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (hover: boolean): void => {
    g.clear();
    g.fillStyle(hover ? 0xffc653 : 0x0b4b74, hover ? 0.95 : 0.82);
    g.fillCircle(0, 0, 13);
    g.lineStyle(2, 0xffffff, hover ? 0.92 : 0.72);
    g.strokeCircle(0, 0, 13);
  };
  draw(false);
  const mark = scene.add
    .text(0, -1, '收', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#073a6f',
      strokeThickness: 3,
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  const hit = scene.add
    .zone(0, 0, 30, 30)
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true })
    .on('pointerover', () => draw(true))
    .on('pointerout', () => draw(false))
    .on('pointerup', onClick);
  button.add([g, mark, hit]);
  return button;
}

function createMoreButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const button = scene.add.container(x, y);
  const width = 128;
  const height = 28;
  const g = scene.add.graphics();
  const draw = (hover: boolean): void => {
    g.clear();
    g.fillStyle(hover ? 0xff8f2d : 0xffb23d, 0.98);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    g.lineStyle(2, 0xffffff, 0.72);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
  };
  draw(false);

  const text = scene.add
    .text(0, 0, '更多玩法', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#8a3e00',
      strokeThickness: 3,
      fontStyle: 'bold',
    })
    .setOrigin(0.5);

  const hit = scene.add
    .zone(0, 0, width, height)
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true })
    .on('pointerover', () => draw(true))
    .on('pointerout', () => draw(false))
    .on('pointerup', onClick);

  button.add([g, text, hit]);
  return button;
}

function openSuggestion(
  scene: Phaser.Scene,
  suggestion: GameplaySuggestion,
  fromScene: string,
  sceneData?: Readonly<Record<string, unknown>>,
): void {
  scene.scene.start(suggestion.scene, {
    ...(suggestion.sceneData ?? {}),
    ...(sceneData ?? {}),
    fromScene,
  });
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
