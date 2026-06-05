import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '@/config/GameConfig';
import { AudioManager } from '@/systems/AudioManager';
import { PlayerState } from '@/systems/PlayerState';

/**
 * 设置面板句柄（FEAT-302）。
 *
 * - `container`：整个面板的根 Container，调用方可以决定何时把它加入 scene。
 * - `destroy()`：销毁面板并移除输入事件。
 * - `refresh()`：从 PlayerState 重新读取音量并刷新滑块位置。
 */
export interface SettingsPanelHandle {
  readonly container: Phaser.GameObjects.Container;
  refresh(): void;
  destroy(): void;
}

/** 面板布局常量（逻辑像素）。 */
const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 260;
const SLIDER_TRACK_WIDTH = 260;
const SLIDER_TRACK_HEIGHT = 8;
const SLIDER_KNOB_RADIUS = 12;

/**
 * 在 scene 上创建一个设置面板 Container（含 BGM / SFX 两条滑条与关闭按钮）。
 *
 * - 面板默认居中于画布，带半透明遮罩拦截下层点击。
 * - 两条滑条读/写 PlayerState.settings；BGM 滑条额外同步到 AudioManager.setBgmVolume，
 *   实时影响当前正在播放的 BGM；SFX 目前只落盘。
 * - 所有事件监听都挂在 container 内部 child 上，scene SHUTDOWN 时被 Phaser 自动清理；
 *   我们额外用 handle.destroy() 提供显式销毁路径（调用后 container.destroy(true) 会连同滑条一起清掉）。
 */
export function createSettingsPanel(scene: Phaser.Scene): SettingsPanelHandle {
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;

  const container = scene.add.container(0, 0).setDepth(3000);

  // 半透明遮罩：吞掉下层点击。
  const overlay = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45)
    .setOrigin(0, 0)
    .setInteractive();
  container.add(overlay);

  // 面板底板。
  const bg = scene.add
    .rectangle(cx, cy, PANEL_WIDTH, PANEL_HEIGHT, 0x1b1b3a, 0.95)
    .setStrokeStyle(3, 0xffd93d, 1);
  container.add(bg);

  const title = scene.add
    .text(cx, cy - PANEL_HEIGHT / 2 + 30, '设置', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '28px',
      color: '#ffd93d',
      stroke: '#ff3b9a',
      strokeThickness: 4,
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  container.add(title);

  // 两条滑条分别占据上下半段。
  const bgmSliderY = cy - 20;
  const sfxSliderY = cy + 50;

  const initial = PlayerState.getSettings();
  const bgmSlider = makeSlider(scene, cx, bgmSliderY, 'BGM 音量', initial.bgmVolume, (v) => {
    AudioManager.setBgmVolume(v);
  });
  const sfxSlider = makeSlider(scene, cx, sfxSliderY, '音效 音量', initial.sfxVolume, (v) => {
    AudioManager.setSfxVolume(v);
  });
  container.add(bgmSlider.children);
  container.add(sfxSlider.children);

  // 关闭按钮（×）。
  const closeBtn = scene.add
    .text(cx + PANEL_WIDTH / 2 - 24, cy - PANEL_HEIGHT / 2 + 24, '×', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  closeBtn.on('pointerover', () => closeBtn.setColor('#ffd93d'));
  closeBtn.on('pointerout', () => closeBtn.setColor('#ffffff'));
  closeBtn.on('pointerup', () => {
    handle.destroy();
  });
  container.add(closeBtn);

  let destroyed = false;
  const refresh = (): void => {
    if (destroyed) return;
    const s = PlayerState.getSettings();
    bgmSlider.setValue(s.bgmVolume);
    sfxSlider.setValue(s.sfxVolume);
  };
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    bgmSlider.destroy();
    sfxSlider.destroy();
    container.destroy(true);
  };

  const handle: SettingsPanelHandle = {
    container,
    refresh,
    destroy,
  };

  return handle;
}

/**
 * 内部：一条带标签 / 轨道 / 滑块 / 百分比文字的滑条。
 */
interface SliderHandle {
  readonly children: Phaser.GameObjects.GameObject[];
  setValue(value: number): void;
  destroy(): void;
}

function makeSlider(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  label: string,
  initialValue: number,
  onChange: (value: number) => void,
): SliderHandle {
  const trackLeft = cx - SLIDER_TRACK_WIDTH / 2 + 60;
  const trackRight = trackLeft + SLIDER_TRACK_WIDTH;

  // 标签（左侧）。
  const labelText = scene.add
    .text(cx - SLIDER_TRACK_WIDTH / 2 - 10, cy, label, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
    })
    .setOrigin(1, 0.5);

  // 轨道。
  const track = scene.add.graphics();
  const drawTrack = (): void => {
    track.clear();
    track.fillStyle(0x333355, 1);
    track.fillRoundedRect(
      trackLeft,
      cy - SLIDER_TRACK_HEIGHT / 2,
      SLIDER_TRACK_WIDTH,
      SLIDER_TRACK_HEIGHT,
      SLIDER_TRACK_HEIGHT / 2,
    );
  };
  drawTrack();

  // 已填充段。
  const fill = scene.add.graphics();
  const drawFill = (value: number): void => {
    fill.clear();
    fill.fillStyle(0xff3b9a, 1);
    fill.fillRoundedRect(
      trackLeft,
      cy - SLIDER_TRACK_HEIGHT / 2,
      SLIDER_TRACK_WIDTH * clamp01(value),
      SLIDER_TRACK_HEIGHT,
      SLIDER_TRACK_HEIGHT / 2,
    );
  };

  // 百分比文字（右侧）。
  const percentText = scene.add
    .text(trackRight + 20, cy, formatPercent(initialValue), {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#ffd93d',
    })
    .setOrigin(0, 0.5);

  // 滑块本体：用一个半径为 SLIDER_KNOB_RADIUS 的圆形 sprite，跟随当前 value。
  const knob = scene.add.circle(
    trackLeft + SLIDER_TRACK_WIDTH * clamp01(initialValue),
    cy,
    SLIDER_KNOB_RADIUS,
    0xffd93d,
    1,
  );
  knob.setStrokeStyle(2, 0x1b1b3a, 1);
  knob
    .setInteractive({
      useHandCursor: true,
      hitArea: new Phaser.Geom.Circle(0, 0, SLIDER_KNOB_RADIUS + 4),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
    })
    .setDepth(1);

  // 当前值状态。
  let currentValue = clamp01(initialValue);
  drawFill(currentValue);

  /** 根据屏幕 x 坐标推算 value，并更新视觉 + 触发 onChange。 */
  const setFromScreenX = (screenX: number, triggerChange: boolean): void => {
    const ratio = (screenX - trackLeft) / SLIDER_TRACK_WIDTH;
    const next = clamp01(ratio);
    currentValue = next;
    knob.setPosition(trackLeft + SLIDER_TRACK_WIDTH * next, cy);
    drawFill(next);
    percentText.setText(formatPercent(next));
    if (triggerChange) onChange(next);
  };

  // 拖动交互：pointerdown 激活，pointermove / pointerup 跟进。
  let dragging = false;
  knob.on('pointerdown', () => {
    dragging = true;
  });
  // 整条轨道也接受点击（按到哪就跳到哪）。
  const trackCenterX = (trackLeft + trackRight) / 2;
  const trackHitZone = scene.add
    .zone(trackCenterX, cy, SLIDER_TRACK_WIDTH, SLIDER_KNOB_RADIUS * 2 + 8)
    .setOrigin(0.5)
    .setInteractive();
  trackHitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    setFromScreenX(pointer.x, true);
  });

  const onMove = (pointer: Phaser.Input.Pointer): void => {
    if (!dragging) return;
    setFromScreenX(pointer.x, true);
  };
  const onUp = (): void => {
    dragging = false;
  };
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('pointerupoutside', onUp);

  const children: Phaser.GameObjects.GameObject[] = [
    labelText,
    track,
    fill,
    percentText,
    trackHitZone,
    knob,
  ];

  let destroyed = false;
  return {
    children,
    setValue(value: number): void {
      const v = clamp01(value);
      currentValue = v;
      knob.setPosition(trackLeft + SLIDER_TRACK_WIDTH * v, cy);
      drawFill(v);
      percentText.setText(formatPercent(v));
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      scene.input.off('pointerupoutside', onUp);
      for (const c of children) c.destroy();
    },
  };
}

function formatPercent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
