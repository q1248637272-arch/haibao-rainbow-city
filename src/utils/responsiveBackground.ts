import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '@/config/GameConfig';
import { computeResponsiveMapDisplaySize } from '@/utils/responsiveMapDisplay';

export interface ResponsiveMapBackgroundOptions {
  readonly depth?: number;
  readonly coverAlpha?: number;
  readonly stageAlpha?: number;
  readonly stageWidth?: number;
  readonly stageHeight?: number;
  readonly fitMode?: 'contain' | 'cover' | 'stretch';
  readonly interactive?: boolean;
  readonly useHandCursor?: boolean;
  readonly onPointerUp?: (
    pointer: Phaser.Input.Pointer,
    localX: number,
    localY: number,
    event: Phaser.Types.Input.EventData,
  ) => void;
}

export interface ResponsiveMapDisplayBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ResponsiveMapBackground {
  readonly cover: Phaser.GameObjects.Image;
  readonly stage: Phaser.GameObjects.Image;
  readonly refresh: () => void;
  readonly getDisplayBounds: () => ResponsiveMapDisplayBounds;
}

export function createResponsiveMapBackground(
  scene: Phaser.Scene,
  key: string,
  options: ResponsiveMapBackgroundOptions = {},
): ResponsiveMapBackground {
  const depth = options.depth ?? 0;
  const wideKey = `${key}_wide`;
  const textureKey = scene.textures.exists(wideKey) ? wideKey : key;
  const isWideRedraw = textureKey === wideKey;
  const stage = scene.add
    .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, textureKey)
    .setDepth(depth)
    .setAlpha(options.stageAlpha ?? options.coverAlpha ?? 1);
  const cover = stage;
  let cleanedUp = false;

  const getDisplayBounds = (): ResponsiveMapDisplayBounds => {
    const bounds = stage.getBounds();
    return {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  };

  const refresh = (): void => {
    const camera = scene.cameras.main;
    const visibleWidth = Math.max(GAME_WIDTH, camera.width);
    const visibleHeight = Math.max(GAME_HEIGHT, camera.height);
    const source = scene.textures.get(textureKey).getSourceImage() as {
      readonly width?: number;
      readonly height?: number;
    };
    const displayInput = {
      visibleWidth,
      visibleHeight,
      sourceWidth: source.width ?? GAME_WIDTH,
      sourceHeight: source.height ?? GAME_HEIGHT,
      isWideRedraw,
    };
    const display = computeResponsiveMapDisplaySize({
      ...displayInput,
      fitMode: options.fitMode ?? 'cover',
      ...(options.stageWidth === undefined ? {} : { stageWidth: options.stageWidth }),
      ...(options.stageHeight === undefined ? {} : { stageHeight: options.stageHeight }),
    });
    stage
      .setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setDisplaySize(display.width, display.height);
  };

  if (options.interactive) {
    const inputConfig = { useHandCursor: options.useHandCursor ?? true };
    stage.setInteractive(inputConfig);
    if (options.onPointerUp) {
      stage.on('pointerup', options.onPointerUp);
    }
  }

  refresh();
  scene.scale.on(Phaser.Scale.Events.RESIZE, refresh);
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    scene.scale.off(Phaser.Scale.Events.RESIZE, refresh);
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

  return { cover, stage, refresh, getDisplayBounds };
}
