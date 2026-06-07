import { GAME_HEIGHT, GAME_WIDTH } from '@/config/GameConfig';

export interface ResponsiveMapDisplayInput {
  readonly visibleWidth: number;
  readonly visibleHeight: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly isWideRedraw: boolean;
  readonly fitMode?: 'contain' | 'cover' | 'stretch';
  readonly stageWidth?: number;
  readonly stageHeight?: number;
}

export interface ResponsiveMapDisplaySize {
  readonly width: number;
  readonly height: number;
}

export interface EdgeFollowCameraScrollInput {
  readonly currentScroll: number;
  readonly targetPosition: number;
  readonly visibleSize: number;
  readonly worldStart: number;
  readonly worldSize: number;
  readonly interpolation: number;
  readonly edgeRatio?: number;
  readonly minEdgeSize?: number;
  readonly maxEdgeSize?: number;
}

export function computeResponsiveMapDisplaySize(
  input: ResponsiveMapDisplayInput,
): ResponsiveMapDisplaySize {
  const sourceWidth = Math.max(1, input.sourceWidth);
  const sourceHeight = Math.max(1, input.sourceHeight);
  const width = input.stageWidth ?? (input.isWideRedraw ? sourceWidth : GAME_WIDTH);
  const height = input.stageHeight ?? (input.isWideRedraw ? sourceHeight : GAME_HEIGHT);
  const visibleWidth = Math.max(GAME_WIDTH, input.visibleWidth);
  const visibleHeight = Math.max(GAME_HEIGHT, input.visibleHeight);
  const widthScale = visibleWidth / width;
  const heightScale = visibleHeight / height;
  if (input.fitMode === 'stretch') {
    return {
      width: visibleWidth,
      height: visibleHeight,
    };
  }

  const rawScale =
    input.fitMode === 'contain'
      ? Math.min(widthScale, heightScale)
      : Math.max(widthScale, heightScale);
  const scale = input.isWideRedraw ? rawScale : Math.max(1, rawScale);

  return {
    width: width * scale,
    height: height * scale,
  };
}

export function computeEdgeFollowCameraScroll(input: EdgeFollowCameraScrollInput): number {
  const visibleSize = Math.max(1, input.visibleSize);
  const worldSize = Math.max(visibleSize, input.worldSize);
  const minScroll = input.worldStart;
  const maxScroll = input.worldStart + worldSize - visibleSize;
  if (maxScroll - minScroll <= 1) return minScroll;

  const edgeRatio = input.edgeRatio ?? 0.26;
  const minEdgeSize = input.minEdgeSize ?? 96;
  const maxEdgeSize = input.maxEdgeSize ?? 420;
  const rawEdgeSize = Math.max(minEdgeSize, Math.min(maxEdgeSize, visibleSize * edgeRatio));
  const edgeSize = Math.max(1, Math.min(rawEdgeSize, visibleSize / 2 - 1));
  const currentScroll = Math.max(minScroll, Math.min(maxScroll, input.currentScroll));
  const leftEdge = currentScroll + edgeSize;
  const rightEdge = currentScroll + visibleSize - edgeSize;

  let targetScroll = currentScroll;
  if (input.targetPosition < leftEdge) {
    targetScroll = input.targetPosition - edgeSize;
  } else if (input.targetPosition > rightEdge) {
    targetScroll = input.targetPosition - (visibleSize - edgeSize);
  }

  const clampedTarget = Math.max(minScroll, Math.min(maxScroll, targetScroll));
  const interpolation = Math.max(0, Math.min(1, input.interpolation));
  return currentScroll + (clampedTarget - currentScroll) * interpolation;
}
