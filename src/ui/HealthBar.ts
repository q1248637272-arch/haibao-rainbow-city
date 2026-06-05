import type Phaser from 'phaser';

/**
 * HealthBar 句柄：对外暴露 container（方便被父容器放置）、setHp（带 tween 过渡）、destroy。
 */
export interface HealthBarHandle {
  container: Phaser.GameObjects.Container;
  setHp(n: number): void;
  destroy(): void;
}

const BAR_HEIGHT = 18;
const BAR_BG_COLOR = 0x112f49;
const BAR_BG_ALPHA = 0.86;
const BAR_BORDER_COLOR = 0xd3fbff;
const BAR_COLOR_HEALTHY = 0x4cc26b;
const BAR_COLOR_WARN = 0xffc83d;
const BAR_COLOR_LOW = 0xff4b4b;
const LOW_HP_RATIO = 0.3;
const WARN_HP_RATIO = 0.55;

/**
 * 创建一条血条：背景条 + 前景条（健康绿 / 低血红）+ 右上"N/MAX"文字。
 * `setHp(n)` 带 150ms tween，过渡结束后同步数值文本。
 */
export function makeHealthBar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  maxHp: number,
): HealthBarHandle {
  const container = scene.add.container(x, y);

  const track = scene.add.graphics();
  const fill = scene.add.graphics();
  const gloss = scene.add.graphics();
  container.add([track, fill, gloss]);

  const label = scene.add
    .text(width - 8, 0, `${maxHp}/${maxHp}`, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#0a243b',
      strokeThickness: 4,
    })
    .setOrigin(1, 0.5);
  container.add(label);

  let currentHp = maxHp;
  let displayWidth = width;
  let activeTween: Phaser.Tweens.Tween | null = null;

  const fillColorFor = (hp: number): number => {
    const ratio = maxHp === 0 ? 0 : hp / maxHp;
    if (ratio <= LOW_HP_RATIO) return BAR_COLOR_LOW;
    if (ratio <= WARN_HP_RATIO) return BAR_COLOR_WARN;
    return BAR_COLOR_HEALTHY;
  };

  const draw = (hp: number, fillWidth: number): void => {
    track.clear();
    track.fillStyle(0x001827, 0.28);
    track.fillRoundedRect(2, -BAR_HEIGHT / 2 + 3, width, BAR_HEIGHT, 8);
    track.fillStyle(BAR_BG_COLOR, BAR_BG_ALPHA);
    track.fillRoundedRect(0, -BAR_HEIGHT / 2, width, BAR_HEIGHT, 8);
    track.lineStyle(2, BAR_BORDER_COLOR, 0.78);
    track.strokeRoundedRect(0, -BAR_HEIGHT / 2, width, BAR_HEIGHT, 8);

    fill.clear();
    const innerWidth = Math.max(0, fillWidth - 6);
    if (innerWidth > 0) {
      fill.fillStyle(fillColorFor(hp), 0.98);
      fill.fillRoundedRect(3, -BAR_HEIGHT / 2 + 3, innerWidth, BAR_HEIGHT - 6, 6);
      fill.fillStyle(0xffffff, 0.22);
      fill.fillRoundedRect(6, -BAR_HEIGHT / 2 + 5, Math.max(0, innerWidth - 6), 4, 4);
    }

    gloss.clear();
    gloss.fillStyle(0xffffff, 0.08);
    gloss.fillRoundedRect(3, -BAR_HEIGHT / 2 + 2, width - 6, 5, 4);
  };
  draw(maxHp, displayWidth);

  const setHp = (n: number): void => {
    const clamped = Math.max(0, Math.min(maxHp, Math.floor(n)));
    if (clamped === currentHp) return;

    // 打断上一个 tween，避免并发。
    if (activeTween && activeTween.isPlaying()) {
      activeTween.stop();
    }
    const targetWidth = maxHp === 0 ? 0 : (clamped / maxHp) * width;
    const from = displayWidth;

    const proxy = { w: from };
    activeTween = scene.tweens.add({
      targets: proxy,
      w: targetWidth,
      duration: 150,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        displayWidth = proxy.w;
        draw(clamped, displayWidth);
      },
      onComplete: () => {
        displayWidth = targetWidth;
        draw(clamped, displayWidth);
        label.setText(`${clamped}/${maxHp}`);
        activeTween = null;
      },
    });

    currentHp = clamped;
    // 提前切换颜色让玩家更快感知掉血。
    draw(clamped, displayWidth);
  };

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    if (activeTween && activeTween.isPlaying()) {
      activeTween.stop();
    }
    activeTween = null;
    container.destroy();
  };

  return { container, setHp, destroy };
}
