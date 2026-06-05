import type Phaser from 'phaser';

interface NavIconButtonOptions {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly onClick: () => void;
  readonly depth?: number;
  readonly width?: number;
  readonly height?: number;
  readonly touchWidth?: number;
  readonly touchHeight?: number;
}

const NAV_BUTTON_TEXTURE_KEY = 'premium_nav_button_image2';

export function createNavIconButton(
  scene: Phaser.Scene,
  options: NavIconButtonOptions,
): Phaser.GameObjects.Container {
  const width = Math.max(options.width ?? 66, options.label.length >= 3 ? 78 : 68);
  const height = Math.max(options.height ?? 52, 52);
  const touchWidth = Math.max(options.touchWidth ?? width, width);
  const touchHeight = Math.max(options.touchHeight ?? height, height);
  const depth = options.depth ?? 100;
  const container = scene.add.container(options.x, options.y).setDepth(depth);
  container.setScrollFactor(0);
  const hasTexture = scene.textures.exists(NAV_BUTTON_TEXTURE_KEY);
  if (hasTexture) {
    container.add(
      scene.add
        .image(0, 0, NAV_BUTTON_TEXTURE_KEY)
        .setDisplaySize(width + 13, height + 15)
        .setAlpha(0.98),
    );
  }
  const g = scene.add.graphics();
  container.add(g);

  drawButton(g, width, height, 0.88, hasTexture);
  drawIcon(scene, container, options.label, -14, -10);

  const text = scene.add
    .text(0, height / 2 - 13, options.label, {
      fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
      fontSize: options.label.length >= 3 ? '13px' : '15px',
      color: '#fff4a8',
      stroke: '#1b1b3a',
      strokeThickness: 5,
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  const maxTextWidth = width - 12;
  if (text.width > maxTextWidth) {
    text.setScale(Math.max(0.78, maxTextWidth / text.width), 1);
  }

  let pressed = false;
  let firing = false;
  const setVisualState = (alpha: number, scale: number): void => {
    g.clear();
    drawButton(g, width, height, alpha, hasTexture);
    scene.tweens.killTweensOf(container);
    scene.tweens.add({
      targets: container,
      scaleX: scale,
      scaleY: scale,
      duration: 92,
      ease: 'Sine.easeOut',
    });
  };

  let activePointerId: number | null = null;
  const hit = scene.add
    .zone(0, 0, touchWidth, touchHeight)
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true })
    .on(
      'pointerover',
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        stopInputPropagation(pointer, event);
        if (!pressed) setVisualState(1, 1.06);
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
        stopInputPropagation(pointer, event);
        activePointerId = null;
        pressed = false;
        if (!firing) setVisualState(0.88, 1);
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
        stopInputPropagation(pointer, event);
        activePointerId = pointer.id;
        pressed = true;
        setVisualState(1.08, 0.96);
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
        stopInputPropagation(pointer, event);
        if (firing) return;
        if (activePointerId !== pointer.id || !pressed) {
          activePointerId = null;
          pressed = false;
          if (!firing) setVisualState(0.88, 1);
          return;
        }
        firing = true;
        activePointerId = null;
        pressed = false;
        setVisualState(1.06, 1.04);
        createClickSpark(scene, container, width, height);
        scene.time.delayedCall(76, options.onClick);
        scene.time.delayedCall(320, () => {
          firing = false;
          if (!container.active || !scene.scene.isActive()) return;
          setVisualState(0.88, 1);
        });
      },
    );

  container.add([text, hit]);
  return container;
}

function stopInputPropagation(
  pointer?: Phaser.Input.Pointer,
  event?: Phaser.Types.Input.EventData,
): void {
  event?.stopPropagation?.();
  pointer?.event?.stopPropagation?.();
}

function createClickSpark(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
): void {
  const spark = scene.add.graphics();
  spark.lineStyle(2, 0xfff4a8, 0.86);
  spark.strokeRoundedRect(-width / 2 + 7, -height / 2 + 7, width - 14, height - 14, 9);
  spark.lineStyle(1, 0xffffff, 0.8);
  spark.strokeEllipse(0, -height * 0.16, width * 0.5, height * 0.28);
  container.add(spark);
  scene.tweens.add({
    targets: spark,
    alpha: 0,
    scaleX: 1.16,
    scaleY: 1.16,
    duration: 240,
    ease: 'Sine.easeOut',
    onComplete: () => spark.destroy(),
  });
}

function drawButton(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  alpha: number,
  hasTexture = false,
): void {
  const x = -width / 2;
  const y = -height / 2;
  if (!hasTexture) {
    g.fillStyle(0x073a6f, 0.86 * alpha);
    g.fillRoundedRect(x, y, width, height, 12);
    g.fillStyle(0x43c8ff, 0.24 * alpha);
    g.fillRoundedRect(x + 4, y + 4, width - 8, height - 8, 10);
  } else {
    g.fillStyle(0x021b34, 0.08 * alpha);
    g.fillRoundedRect(x + 7, y + 7, width - 14, height - 14, 10);
    g.fillStyle(0xffffff, 0.12 * alpha);
    g.fillRoundedRect(x + 10, y + 8, width - 20, 14, 8);
  }
  g.lineStyle(2, 0xffffff, 0.62 * alpha);
  g.strokeRoundedRect(x + 4, y + 4, width - 8, height - 8, 10);
  g.lineStyle(1, 0xfff1a6, 0.56 * alpha);
  g.strokeRoundedRect(x + 8, y + 8, width - 16, height - 16, 8);
}

function drawIcon(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  label: string,
  x: number,
  y: number,
): void {
  const icon = scene.add.graphics();
  icon.lineStyle(2, 0x1b1b3a, 0.95);
  if (label.includes('玩法') || label.includes('导览')) {
    icon.fillStyle(0xffd93d, 1);
    icon.fillCircle(x + 14, y, 15);
    icon.fillStyle(0x67c6ee, 1);
    icon.fillTriangle(x + 14, y - 10, x + 23, y + 8, x + 5, y + 8);
    icon.fillStyle(0xffffff, 1);
    icon.fillCircle(x + 14, y, 4);
    icon.lineStyle(2, 0x1b1b3a, 0.9);
    icon.strokeCircle(x + 14, y, 15);
    container.add(icon);
    return;
  }
  if (label.includes('返回') || label.includes('上一')) {
    icon.fillStyle(0xffd93d, 1);
    icon.fillTriangle(x - 3, y, x + 15, y - 12, x + 15, y + 12);
    icon.fillRoundedRect(x + 11, y - 7, 18, 14, 4);
  } else if (label.includes('下一')) {
    icon.fillStyle(0xffd93d, 1);
    icon.fillTriangle(x + 29, y, x + 11, y - 12, x + 11, y + 12);
    icon.fillRoundedRect(x - 1, y - 7, 18, 14, 4);
  } else if (label.includes('首页') || label.includes('家园')) {
    icon.fillStyle(0xffb84d, 1);
    icon.fillTriangle(x, y - 2, x + 14, y - 16, x + 28, y - 2);
    icon.fillStyle(0x67c6ee, 1);
    icon.fillRoundedRect(x + 4, y - 2, 20, 20, 4);
    icon.fillStyle(0xfffbdf, 1);
    icon.fillRect(x + 13, y + 6, 6, 12);
  } else if (label.includes('地图')) {
    icon.fillStyle(0x8cecff, 1);
    icon.fillRoundedRect(x, y - 15, 28, 28, 4);
    icon.lineStyle(2, 0xffffff, 0.9);
    icon.lineBetween(x + 9, y - 13, x + 9, y + 12);
    icon.lineBetween(x + 19, y - 13, x + 19, y + 12);
    icon.fillStyle(0xffd93d, 1);
    icon.fillCircle(x + 20, y - 5, 4);
  } else if (label.includes('图鉴')) {
    icon.fillStyle(0xfff4a8, 1);
    icon.fillRoundedRect(x + 2, y - 15, 24, 30, 4);
    icon.fillStyle(0x67c6ee, 1);
    icon.fillRoundedRect(x + 6, y - 11, 16, 22, 3);
    icon.lineStyle(2, 0x1b1b3a, 0.85);
    icon.strokeRoundedRect(x + 2, y - 15, 24, 30, 4);
    icon.lineBetween(x + 10, y - 5, x + 20, y - 5);
    icon.lineBetween(x + 10, y + 2, x + 20, y + 2);
    icon.fillStyle(0xff7a1f, 1);
    icon.fillCircle(x + 14, y + 10, 3);
  } else if (label.includes('精灵')) {
    icon.fillStyle(0xffffff, 1);
    icon.fillCircle(x + 14, y, 15);
    icon.fillStyle(0xff5252, 1);
    icon.fillPoints(arcPoints(x + 14, y, 15, Math.PI, Math.PI * 2), true);
    icon.lineStyle(2, 0x1b1b3a, 0.95);
    icon.strokeCircle(x + 14, y, 15);
    icon.lineBetween(x - 1, y, x + 29, y);
    icon.fillStyle(0xffd93d, 1);
    icon.fillCircle(x + 14, y, 5);
  } else if (label.includes('存档')) {
    icon.fillStyle(0x5dd2ff, 1);
    icon.fillRoundedRect(x + 1, y - 15, 27, 30, 4);
    icon.fillStyle(0xffffff, 1);
    icon.fillRoundedRect(x + 6, y - 11, 16, 8, 2);
    icon.fillStyle(0xffd93d, 1);
    icon.fillRoundedRect(x + 7, y + 2, 15, 10, 2);
    icon.lineStyle(2, 0x1b1b3a, 0.95);
    icon.strokeRoundedRect(x + 1, y - 15, 27, 30, 4);
  } else if (label.includes('签到')) {
    icon.fillStyle(0xfff4a8, 1);
    icon.fillRoundedRect(x + 1, y - 12, 27, 25, 5);
    icon.fillStyle(0xff6b8a, 1);
    icon.fillRoundedRect(x + 1, y - 16, 27, 9, 4);
    icon.fillStyle(0x42c8ff, 1);
    icon.fillCircle(x + 10, y + 2, 4);
    icon.fillCircle(x + 19, y + 2, 4);
    icon.lineStyle(2, 0x1b1b3a, 0.9);
    icon.strokeRoundedRect(x + 1, y - 12, 27, 25, 5);
    icon.lineBetween(x + 8, y - 18, x + 8, y - 11);
    icon.lineBetween(x + 21, y - 18, x + 21, y - 11);
  } else if (label.includes('背包')) {
    icon.fillStyle(0xffb84d, 1);
    icon.fillRoundedRect(x + 2, y - 10, 24, 24, 5);
    icon.fillStyle(0xfff0a8, 1);
    icon.fillRoundedRect(x + 7, y - 17, 14, 11, 5);
    icon.lineStyle(3, 0x1b1b3a, 0.75);
    icon.strokeRoundedRect(x + 2, y - 10, 24, 24, 5);
    icon.lineBetween(x + 8, y - 1, x + 20, y - 1);
  } else if (label.includes('活动')) {
    icon.fillStyle(0xffd93d, 1);
    icon.fillPoints(starPoints(x + 14, y, 6, 16, 5), true);
    icon.lineStyle(2, 0xffffff, 0.78);
    icon.strokeCircle(x + 14, y, 18);
  } else if (label.includes('家具')) {
    icon.fillStyle(0xffb84d, 1);
    icon.fillRoundedRect(x + 3, y - 10, 22, 18, 5);
    icon.fillStyle(0x7cc8ff, 1);
    icon.fillRoundedRect(x, y + 3, 28, 10, 4);
    icon.lineStyle(3, 0x1b1b3a, 0.8);
    icon.lineBetween(x + 5, y + 13, x + 3, y + 21);
    icon.lineBetween(x + 23, y + 13, x + 25, y + 21);
  } else {
    icon.fillStyle(0xffd93d, 1);
    icon.fillCircle(x + 14, y, 14);
    icon.fillStyle(0xffffff, 1);
    icon.fillCircle(x + 14, y, 6);
  }
  container.add(icon);
}

function arcPoints(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
): Phaser.Types.Math.Vector2Like[] {
  const points: Phaser.Types.Math.Vector2Like[] = [{ x: cx, y: cy }];
  const steps = 16;
  for (let i = 0; i <= steps; i += 1) {
    const angle = start + ((end - start) * i) / steps;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return points;
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
