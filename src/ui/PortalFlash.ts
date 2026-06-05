import Phaser from 'phaser';

export interface PortalFlashOptions {
  readonly radius?: number;
  readonly depth?: number;
  readonly color?: number;
  readonly yScale?: number;
}

export function createPortalFlash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: PortalFlashOptions = {},
): Phaser.GameObjects.Container {
  const radius = options.radius ?? 30;
  const color = options.color ?? 0xffd93d;
  const yScale = options.yScale ?? 0.72;
  const container = scene.add.container(x, y).setDepth(options.depth ?? 350);

  const outer = scene.add
    .ellipse(0, 0, radius * 2.42, radius * 2.42 * yScale, color, 0.08)
    .setStrokeStyle(2, 0xffffff, 0.5)
    .setBlendMode(Phaser.BlendModes.ADD);
  const glow = scene.add
    .ellipse(0, 0, radius * 2.02, radius * 2.02 * yScale, color, 0.15)
    .setStrokeStyle(2, 0xffffff, 0.66)
    .setBlendMode(Phaser.BlendModes.ADD);
  const ringA = scene.add
    .ellipse(0, 0, radius * 1.55, radius * 1.55 * yScale)
    .setStrokeStyle(3, color, 0.9)
    .setBlendMode(Phaser.BlendModes.ADD);
  const ringB = scene.add
    .ellipse(0, 0, radius * 0.94, radius * 0.94 * yScale)
    .setStrokeStyle(2, 0xffffff, 0.86)
    .setBlendMode(Phaser.BlendModes.ADD);
  const core = scene.add
    .ellipse(0, 0, radius * 0.42, radius * 0.42 * yScale, 0xffffff, 0.38)
    .setBlendMode(Phaser.BlendModes.ADD);

  const sparks = [-1, -0.35, 0.35, 1].map((dir) =>
    scene.add
      .circle(
        dir * radius * 0.68,
        -radius * (0.32 + Math.abs(dir) * 0.14),
        Math.max(3, radius * 0.1),
        0xffffff,
        0.82,
      )
      .setStrokeStyle(1, color, 0.78)
      .setBlendMode(Phaser.BlendModes.ADD),
  );

  container.add([outer, glow, ringA, ringB, core, ...sparks]);

  scene.tweens.add({
    targets: outer,
    alpha: 0.24,
    scaleX: 1.1,
    scaleY: 1.1,
    duration: 1280,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: glow,
    alpha: 0.42,
    scaleX: 1.16,
    scaleY: 1.16,
    duration: 920,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: ringA,
    alpha: 0.35,
    scaleX: 1.28,
    scaleY: 1.28,
    duration: 1080,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: ringB,
    alpha: 0.28,
    scaleX: 1.5,
    scaleY: 1.5,
    duration: 820,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: sparks,
    y: `-=${Math.max(8, radius * 0.22)}`,
    alpha: 0.28,
    duration: 760,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return container;
}
