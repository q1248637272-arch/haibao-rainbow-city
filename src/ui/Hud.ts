import type Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '@/config/GameConfig';
import { gameEvents } from '@/systems/EventBus';
import { PlayerState } from '@/systems/PlayerState';
import type { PlayerSave } from '@/types';

/**
 * HUD 支持的锚点位置。目前场景里主要用到右上与右下；其余四角预留给后续 feature。
 */
export type HudAnchor = 'topleft' | 'topright' | 'bottomleft' | 'bottomright';

/**
 * HUD 句柄：`refresh()` 手动触发刷新，`destroy()` 移除文本并解绑事件。
 */
export interface HudHandle {
  refresh(): void;
  destroy(): void;
}

/**
 * HUD 内边距：离屏幕边缘 12px。
 */
const HUD_PADDING = 12;

/**
 * 纯函数：把 PlayerSave 渲染成 HUD 的一行文案。
 * 提取出来是为了单测友好，不依赖 Phaser。
 *
 * FEAT-305：VIP 玩家的 HUD 尾部追加 ` · VIP⭐` 徽章，让当前身份一眼可见。
 */
export function formatHudText(save: PlayerSave): string {
  const vip = save.isVip ? '是' : '否';
  const badge = save.isVip ? ' · VIP⭐' : '';
  return `${save.playerName} · 金币: ${save.coins} · VIP: ${vip}${badge}`;
}

/**
 * 根据锚点决定文本的 x/y 及 origin。
 */
function anchorLayout(anchor: HudAnchor): {
  x: number;
  y: number;
  originX: number;
  originY: number;
} {
  switch (anchor) {
    case 'topleft':
      return { x: HUD_PADDING, y: HUD_PADDING, originX: 0, originY: 0 };
    case 'topright':
      return { x: GAME_WIDTH - HUD_PADDING, y: HUD_PADDING, originX: 1, originY: 0 };
    case 'bottomleft':
      return { x: HUD_PADDING, y: GAME_HEIGHT - HUD_PADDING, originX: 0, originY: 1 };
    case 'bottomright':
      return {
        x: GAME_WIDTH - HUD_PADDING,
        y: GAME_HEIGHT - HUD_PADDING,
        originX: 1,
        originY: 1,
      };
  }
}

/**
 * 在指定场景上创建一块显示玩家基础信息的 HUD。
 *
 * - 自动订阅 `save:updated` / `player:vip`，数据变化时刷新。
 * - 在场景 SHUTDOWN 时自动销毁与解绑，避免跨场景事件泄漏。
 * - 调用方可随时手动 `refresh()` / `destroy()`。
 */
export function makeHud(scene: Phaser.Scene, anchor: HudAnchor): HudHandle {
  const layout = anchorLayout(anchor);
  const text = scene.add
    .text(layout.x, layout.y, '', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#1b1b3a',
      strokeThickness: 4,
    })
    .setOrigin(layout.originX, layout.originY)
    .setScrollFactor(0)
    .setDepth(1000);

  const refresh = (): void => {
    if (!text.active) return;
    text.setText(formatHudText(PlayerState.snapshot()));
  };

  // 初始渲染一次。
  refresh();

  // 订阅全局事件；PlayerState 的写入方法会自动 emit 'save:updated'。
  const onSaveUpdated = (): void => refresh();
  const onVip = (): void => refresh();
  gameEvents.on('save:updated', onSaveUpdated);
  gameEvents.on('player:vip', onVip);

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    gameEvents.off('save:updated', onSaveUpdated);
    gameEvents.off('player:vip', onVip);
    text.destroy();
  };

  // 场景关闭时统一清理，避免事件监听和文本对象跨场景泄漏。
  scene.events.once('shutdown', destroy);
  scene.events.once('destroy', destroy);

  return { refresh, destroy };
}
