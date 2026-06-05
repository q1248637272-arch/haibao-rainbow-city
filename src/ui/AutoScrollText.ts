import type Phaser from 'phaser';

interface AutoScrollTextOptions {
  readonly scene: Phaser.Scene;
  readonly layer?: Phaser.GameObjects.Container | undefined;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text: string;
  readonly style: Phaser.Types.GameObjects.Text.TextStyle;
  readonly originY?: number;
  readonly speed?: number;
  readonly pauseMs?: number;
}

export function createAutoScrollText(options: AutoScrollTextOptions): Phaser.GameObjects.Container {
  const {
    scene,
    layer,
    x,
    y,
    width,
    height,
    text,
    style,
    originY = 0.5,
    speed = 28,
    pauseMs = 900,
  } = options;
  const group = scene.add.container(x, y);
  const label = scene.add.text(0, 0, text, style).setOrigin(0, originY);
  const clip = scene.add.rectangle(x + width / 2, y, width, height, 0xffffff, 0);
  clip.setVisible(false);
  label.setMask(clip.createGeometryMask());
  group.add(label);

  if (label.width > width) {
    const overflow = label.width - width + 10;
    const duration = Math.max(1600, Math.round((overflow / speed) * 1000));
    scene.tweens.add({
      targets: label,
      x: -overflow,
      delay: pauseMs,
      duration,
      yoyo: true,
      repeat: -1,
      repeatDelay: pauseMs,
      ease: 'Sine.easeInOut',
    });
  }

  if (layer) {
    layer.add([clip, group]);
  }

  return group;
}
