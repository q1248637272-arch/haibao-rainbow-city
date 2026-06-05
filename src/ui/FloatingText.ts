import type Phaser from 'phaser';

/**
 * 浮动文本样式可选项。
 */
export interface FloatingTextOptions {
  /** 字号，默认 22。 */
  fontSize?: number;
}

/**
 * 在 (x, y) 位置弹出一段文字，700ms 内上移 40px 且 alpha 做 0→1→0 呼吸后销毁。
 * 典型用途：战斗伤害数字、"未命中" 提示。
 */
export function spawnFloatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: number = 0xffffff,
  opts: FloatingTextOptions = {},
): Phaser.GameObjects.Text {
  const fontSize = opts.fontSize ?? 22;
  const hex = `#${color.toString(16).padStart(6, '0')}`;

  const label = scene.add
    .text(x, y, text, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: `${fontSize}px`,
      color: hex,
      stroke: '#1b1b3a',
      strokeThickness: 4,
      fontStyle: 'bold',
    })
    .setOrigin(0.5, 1)
    .setDepth(1500)
    .setAlpha(0);

  // 0 → 1（120ms 淡入）→ 保持到 400ms → 1 → 0（300ms 淡出），同时向上漂 40px。
  scene.tweens.add({
    targets: label,
    y: y - 40,
    duration: 700,
    ease: 'Sine.easeOut',
  });
  scene.tweens.add({
    targets: label,
    alpha: 1,
    duration: 120,
    ease: 'Linear',
  });
  scene.tweens.add({
    targets: label,
    alpha: 0,
    delay: 400,
    duration: 300,
    ease: 'Linear',
    onComplete: () => label.destroy(),
  });

  return label;
}
