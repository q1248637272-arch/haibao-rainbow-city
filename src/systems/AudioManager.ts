import type Phaser from 'phaser';

import { BGM_CONFIG, type BgmKey } from '@/config/audio';

import { PlayerState } from './PlayerState';

/**
 * 单例 BGM 播放器（FEAT-302）。
 *
 * 职责：
 * - 封装 Phaser sound manager 的 BGM 生命周期（播放 / 停止 / 暂停 / 恢复）。
 * - 文件 404 / decode 失败时把 key 加入失败集合，后续 play(key) 静默 no-op。
 * - 音量跟 PlayerState.settings 双向同步：setBgmVolume 会回写 PlayerState，
 *   也会实时改变当前 sound 的播放音量；SFX 音量目前只落盘（给未来 SFX 系统留接口）。
 *
 * 使用方式：
 * 1. PreloadScene 在每个 audio 入队前 `this.load.once('loaderror', ...)` 钩上 markFailed；
 * 2. 任何 scene 的 create() 末尾调用 `AudioManager.play('xxx')`；
 *    第一次调用时 AudioManager 会自动用当前 scene 的 sound manager 完成 init。
 * 3. 场景切换时外部不必主动 stop；新 scene 的 play(newKey) 会 crossfade。
 *
 * 模块级 state 有意为之：BGM 本来就是跨场景单例，用单例可以避免 sound 在 scene 切换时被销毁
 * （Phaser 的 SoundManager 是 game 级别而非 scene 级别，所以同一份 sound 可以跨场景延续）。
 */

type Sound = Phaser.Sound.BaseSound;

/** BGM 播放参数。 */
export interface PlayOpts {
  /** crossfade / fade-in 时长（毫秒），默认 400。 */
  readonly fadeMs?: number;
  /** 是否循环。BGM 默认 true；如果想播放一次性片段可传 false。 */
  readonly loop?: boolean;
}

/** 已记录过"未找到"警告的 key 集合：同一个 key 只 warn 一次。 */
const failedKeys = new Set<string>();
/** 已记录过警告的非 key 级错误（例如 setVolume 抛异常）：同条消息只 warn 一次。 */
const warnedMessages = new Set<string>();

/** 当前挂载的 Phaser scene 引用（取其 sound manager 调度播放）。 */
let mountedScene: Phaser.Scene | null = null;
/** 当前正在播的 BGM key。undefined 表示没有 BGM 在播。 */
let currentKey: BgmKey | null = null;
/** 当前正在播的 Sound 实例（与 currentKey 一一对应）。 */
let currentSound: Sound | null = null;

/** 默认 crossfade 时长（毫秒）。 */
const DEFAULT_FADE_MS = 400;

/**
 * 内部：只 warn 一次。同一条 msg 重复调用时不会重复输出。
 */
function warnOnce(msg: string): void {
  if (warnedMessages.has(msg)) return;
  warnedMessages.add(msg);
  console.warn(msg);
}

/**
 * 内部：把一个 Sound 的音量渐变到目标值，tween 完成后执行 onComplete 回调。
 *
 * 用 scene.tweens 对 sound.volume 做插值。若 scene 不存在 / tween 系统不可用，
 * 则退化到直接 setVolume + 立即回调。
 */
function fadeVolumeTo(
  scene: Phaser.Scene,
  sound: Sound,
  target: number,
  durationMs: number,
  onComplete?: () => void,
): void {
  if (!('setVolume' in sound) || typeof (sound as { setVolume?: unknown }).setVolume !== 'function') {
    if (onComplete) onComplete();
    return;
  }
  if (durationMs <= 0) {
    (sound as unknown as { setVolume: (v: number) => void }).setVolume(target);
    if (onComplete) onComplete();
    return;
  }
  scene.tweens.add({
    targets: sound,
    volume: target,
    duration: durationMs,
    onComplete: () => {
      if (onComplete) onComplete();
    },
  });
}

/**
 * 内部：尝试把 key 对应的 sound 从 sound manager 里取出或新建。
 *
 * Phaser 的 sound manager add(key) 要求 cache.audio.exists(key) 为 true，
 * 否则会静默失败或抛错。我们在 try/catch 外层兜底，捕获到异常就 markFailed。
 *
 * 返回 null 表示获取失败（已 markFailed / warnOnce）。
 */
function getOrCreateSound(scene: Phaser.Scene, key: BgmKey): Sound | null {
  try {
    const sm = scene.sound;
    // scene.sound.get 在新版本 Phaser 里是合法 API，但为了兼容性走 any-free 的检查：
    const existing = (sm as Phaser.Sound.BaseSoundManager & { get?: (k: string) => Sound | null }).get?.(
      key,
    );
    if (existing) return existing;
    // cache 里没有该音频时直接 add 会抛错，这里提前判一下。
    if (!scene.cache.audio.exists(key)) {
      markFailed(key);
      return null;
    }
    return sm.add(key);
  } catch (err) {
    markFailed(key);
    warnOnce(`[AudioManager] 创建 BGM ${key} 失败：${String(err)}`);
    return null;
  }
}

/**
 * 内部：取一个 scene 引用。若 mountedScene 未设置，则尝试用入参 scene 挂载。
 */
function ensureScene(scene?: Phaser.Scene): Phaser.Scene | null {
  if (scene) mountedScene = scene;
  return mountedScene;
}

/**
 * 标记某个 BGM key 失败（404 / decode / add 抛错等）。
 *
 * - 同一个 key 只会 warn 一次；
 * - 标记后，后续 play(key) 立刻 no-op 返回。
 */
export function markFailed(key: string): void {
  if (failedKeys.has(key)) return;
  failedKeys.add(key);
}

/**
 * 把 AudioManager 挂载到给定 scene。重复调用会覆盖之前的引用。
 *
 * 通常 PreloadScene 完成时调用一次；之后场景切换不必显式 init，
 * play/stop 会用最后一次挂载的 scene 的 sound manager。
 *
 * 注：Phaser 的 SoundManager 是 game 级单例，跨场景仍然有效，
 * 所以这里只需要一个"有效的 scene 引用"拿 sound / tweens 即可。
 */
export function init(scene: Phaser.Scene): void {
  mountedScene = scene;
}

/**
 * 播放指定 BGM。
 *
 * 行为：
 * - 若 key 已在失败集合：no-op（但会顺手把音量同步一下 PlayerState 以保持一致）。
 * - 若 currentKey === key 且 sound 仍在播：no-op（幂等）。
 * - 否则：淡出旧 BGM，同步淡入新 BGM（crossfade）。
 *
 * 可选 fadeMs 默认 400ms；loop 默认 true（BGM 场景音必须循环）。
 *
 * 在没有挂载 scene 时会尝试用 PlayerState / console 路径静默降级，
 * 但首次调用建议传入当前 scene 以便建立挂载（使用场景：scene.create() 末尾 `AudioManager.play('xxx', undefined, this)`）。
 */
export function play(key: BgmKey, opts?: PlayOpts, scene?: Phaser.Scene): void {
  const s = ensureScene(scene);
  if (failedKeys.has(key)) return;
  if (!s) return;

  // 已在播同一首：no-op。
  if (currentKey === key && currentSound && (currentSound as { isPlaying?: boolean }).isPlaying) {
    return;
  }

  const fadeMs = opts?.fadeMs ?? DEFAULT_FADE_MS;
  const loop = opts?.loop ?? true;
  const targetVolume = clamp01(PlayerState.getSettings().bgmVolume);

  // 淡出旧 sound（如果有）。
  if (currentSound) {
    const oldSound = currentSound;
    fadeVolumeTo(s, oldSound, 0, fadeMs, () => {
      try {
        oldSound.stop();
        oldSound.destroy();
      } catch {
        // 忽略销毁异常（旧 sound 可能已被 scene shutdown 清理）。
      }
    });
  }

  // 创建并启动新 sound。
  const nextSound = getOrCreateSound(s, key);
  if (!nextSound) {
    // markFailed 已经在 getOrCreateSound 内部执行。
    currentKey = null;
    currentSound = null;
    return;
  }

  try {
    // 先把音量开到 0，然后 fade-in 到 targetVolume 实现 crossfade。
    (nextSound as unknown as { setVolume: (v: number) => void }).setVolume(0);
    (nextSound as unknown as { setLoop?: (l: boolean) => void }).setLoop?.(loop);
    nextSound.play();
    fadeVolumeTo(s, nextSound, targetVolume, fadeMs);
  } catch (err) {
    markFailed(key);
    warnOnce(`[AudioManager] 播放 BGM ${key} 失败：${String(err)}`);
    currentKey = null;
    currentSound = null;
    return;
  }

  currentKey = key;
  currentSound = nextSound;
}

/**
 * 停止当前 BGM。可选 fadeMs 淡出；0 表示立即停止。
 */
export function stop(fadeMs?: number): void {
  if (!currentSound) {
    currentKey = null;
    return;
  }
  const s = mountedScene;
  const dur = fadeMs ?? DEFAULT_FADE_MS;
  const sound = currentSound;
  currentKey = null;
  currentSound = null;

  if (!s || dur <= 0) {
    try {
      sound.stop();
      sound.destroy();
    } catch {
      // 忽略。
    }
    return;
  }
  fadeVolumeTo(s, sound, 0, dur, () => {
    try {
      sound.stop();
      sound.destroy();
    } catch {
      // 忽略。
    }
  });
}

/** 暂停当前 BGM（保留位置，下次 resume 继续）。 */
export function pause(): void {
  if (!currentSound) return;
  try {
    currentSound.pause();
  } catch {
    // 忽略。
  }
}

/** 恢复被 pause 的 BGM。 */
export function resume(): void {
  if (!currentSound) return;
  try {
    currentSound.resume();
  } catch {
    // 忽略。
  }
}

/**
 * 设置 BGM 音量，同步写回 PlayerState 并实时改变当前 sound。
 * 入参会被 clamp01 夹紧到 [0, 1]。
 */
export function setBgmVolume(volume: number): void {
  const clamped = clamp01(volume);
  PlayerState.setBgmVolume(clamped);
  if (currentSound) {
    try {
      (currentSound as unknown as { setVolume: (v: number) => void }).setVolume(clamped);
    } catch {
      // 忽略：有些 sound 实现不提供 setVolume（例如 NoAudioSound）。
    }
  }
}

/**
 * 设置 SFX 音量，写回 PlayerState。未来 SFX 系统会读取该值。
 * 入参会被 clamp01 夹紧到 [0, 1]。
 */
export function setSfxVolume(volume: number): void {
  PlayerState.setSfxVolume(clamp01(volume));
}

/** 取当前挂载的 scene（测试友好）。 */
export function getMountedScene(): Phaser.Scene | null {
  return mountedScene;
}

/** 取当前正在播的 BGM key（null 表示无）。 */
export function getCurrentKey(): BgmKey | null {
  return currentKey;
}

/** 某 key 是否已被标记为失败。测试友好。 */
export function isFailed(key: string): boolean {
  return failedKeys.has(key);
}

/** 重置内部状态（仅测试使用）。 */
export function __resetForTest(): void {
  failedKeys.clear();
  warnedMessages.clear();
  if (currentSound) {
    try {
      currentSound.stop();
      currentSound.destroy();
    } catch {
      // 忽略。
    }
  }
  mountedScene = null;
  currentKey = null;
  currentSound = null;
}

/**
 * 把任意实数夹紧到 [0, 1] 闭区间。非数字（NaN）按 0 处理。
 * 与 PlayerState 保持一致的语义。
 */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 预声明：BGM_CONFIG 所有 key 在 PreloadScene 被遍历入队，
 * 这里只是把常量 re-export 供外部使用（避免 AudioManager 消费方再从 config 里引一次）。
 */
export { BGM_CONFIG };

/**
 * 聚合单例。模块级 state 是事实上的单例；`AudioManager` 仅仅是便于按命名空间调用。
 */
export const AudioManager = {
  init,
  play,
  stop,
  pause,
  resume,
  setBgmVolume,
  setSfxVolume,
  markFailed,
  isFailed,
  getMountedScene,
  getCurrentKey,
  __resetForTest,
} as const;
