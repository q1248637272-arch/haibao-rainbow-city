import type Phaser from 'phaser';

/**
 * ExpBar 句柄：对外暴露 container（便于放到父容器或场景坐标系）、
 * `setExp(curr, max)`（带 tween 过渡的更新方法）、以及 `destroy()`。
 */
export interface ExpBarHandle {
  container: Phaser.GameObjects.Container;
  setExp(curr: number, max: number): void;
  destroy(): void;
}

const BAR_HEIGHT = 10;
const BAR_BG_COLOR = 0x1b1b3a;
const BAR_BG_ALPHA = 0.85;
const BAR_BORDER_COLOR = 0x000000;
const BAR_FG_COLOR = 0x4cc2ff; // 经验条用蓝青色，与血条（绿/红）区分

/**
 * 创建一条经验条：背景条 + 前景条 + 右上 `curr/max` 文字。
 *
 * 与 HealthBar 的差异：
 * - 颜色固定蓝青色（经验永远不会"低值"触发告警变红）；
 * - 高度更矮（10px），通常放在精灵头像下方或结算面板里；
 * - tween 时长 280ms（经验加成偏慢一点，让玩家看清进度爬升）。
 *
 * 参数：
 * - `width` 条的像素宽度；
 * - `currentLevelExp` 初始已获得的经验；
 * - `expToNextLevel` 当前等级升级所需经验（0 视为满值条）。
 */
export function makeExpBar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  currentLevelExp: number,
  expToNextLevel: number,
): ExpBarHandle {
  const container = scene.add.container(x, y);

  const bg = scene.add.rectangle(0, 0, width, BAR_HEIGHT, BAR_BG_COLOR, BAR_BG_ALPHA);
  bg.setStrokeStyle(2, BAR_BORDER_COLOR, 0.8);
  bg.setOrigin(0, 0.5);
  container.add(bg);

  let max = Math.max(1, Math.floor(expToNextLevel));
  let curr = Math.max(0, Math.min(max, Math.floor(currentLevelExp)));

  const fg = scene.add.rectangle(0, 0, (curr / max) * width, BAR_HEIGHT, BAR_FG_COLOR, 1);
  fg.setOrigin(0, 0.5);
  container.add(fg);

  const label = scene.add
    .text(width, -BAR_HEIGHT / 2 - 2, `${curr}/${max}`, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#1b1b3a',
      strokeThickness: 3,
    })
    .setOrigin(1, 1);
  container.add(label);

  let activeTween: Phaser.Tweens.Tween | null = null;

  const setExp = (nextCurr: number, nextMax: number): void => {
    const m = Math.max(1, Math.floor(nextMax));
    const c = Math.max(0, Math.min(m, Math.floor(nextCurr)));
    max = m;
    curr = c;

    if (activeTween && activeTween.isPlaying()) {
      activeTween.stop();
    }
    const targetWidth = (c / m) * width;
    const from = fg.width;

    const proxy = { w: from };
    activeTween = scene.tweens.add({
      targets: proxy,
      w: targetWidth,
      duration: 280,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        fg.width = proxy.w;
      },
      onComplete: () => {
        fg.width = targetWidth;
        label.setText(`${c}/${m}`);
        activeTween = null;
      },
    });
    // 立即刷新 label 一次避免长 tween 里显示过期数值；最终值会在 onComplete 再覆盖。
    label.setText(`${c}/${m}`);
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

  return { container, setExp, destroy };
}
