import Phaser from 'phaser';

/**
 * 海宝（2010 年上海世博会吉祥物）主角程序化绘制模块。
 *
 * 设计决策（见 design.md §3.1 / §3.2）：
 *   - 美术版权归世博会组委会，任何公开素材站都没有授权版；本项目承诺私人非商用，
 *     采用 Phaser Graphics 矢量绘制致敬形象（三条翻卷海浪头发 + 蓝色"人"字形身体 + 翘拇指手）；
 *   - 单帧尺寸 64×96；只绘制 NE / SE 两个朝向 × 4 个相位（idle / run0 / run1 / run2）= 8 张纹理；
 *     NW / SW 由业务层 `sprite.setFlipX(true)` 水平镜像复用，减少一半绘制工作量；
 *   - 动画只注册 2 条 `haibao-ne` / `haibao-se`，frames 顺序 [idle, run0, run1, run2, run1]
 *     形成"起步 → 左脚 → 中立 → 右脚 → 中立"的脚步摆动；frameRate 8，repeat -1；
 *   - 函数幂等：若 `haibao:ne:idle` 纹理已存在则直接 return，安全在 scene create() 多次调用。
 *
 * 返回 `generateHaibaoFrames` 生成的纹理 key 规则：`haibao:<view>:<phase>`。
 */

const FRAME_W = 64;
const FRAME_H = 96;

/** 调色板（design.md §3.2 + FEAT-311 美化调整）。 */
const COLOR_BODY = 0x00a6e0;
const COLOR_BODY_DARK = 0x0078b4;
// FEAT-311：高光色调亮一档（原 #86dbff → #b6ebff）让立体感更明显。
const COLOR_HIGHLIGHT = 0xb6ebff;
const COLOR_NAMEPLATE = 0xffe050;
const COLOR_HAND = 0xffd1a8;
const COLOR_EYE = 0x111827;
const COLOR_MOUTH = 0x6b2a0f;
const COLOR_SHADOW = 0x000000;

type View = 'ne' | 'se';
type Phase = 'idle' | 'run0' | 'run1' | 'run2';

const VIEWS: readonly View[] = ['ne', 'se'];
const PHASES: readonly Phase[] = ['idle', 'run0', 'run1', 'run2'];

/** 纹理 key：`haibao:<view>:<phase>`。 */
export function haibaoTextureKey(view: View, phase: Phase): string {
  return `haibao:${view}:${phase}`;
}

/**
 * 在传入 scene 的 textures 缓存里生成海宝全部 8 张帧纹理。
 * 幂等：若第一张 'haibao:ne:idle' 已注册则立即返回。
 *
 * 会打点 console.time('haibaoFrames')，便于 findings 里汇总生成耗时。
 */
export function generateHaibaoFrames(scene: Phaser.Scene): void {
  if (scene.textures.exists(haibaoTextureKey('ne', 'idle'))) return;

  console.time('haibaoFrames');
  for (const view of VIEWS) {
    for (const phase of PHASES) {
      const key = haibaoTextureKey(view, phase);
      if (scene.textures.exists(key)) continue;
      const g = scene.add.graphics({ x: 0, y: 0 });
      drawHaibao(g, view, phase);
      g.generateTexture(key, FRAME_W, FRAME_H);
      g.destroy();
    }
  }
  console.timeEnd('haibaoFrames');
}

/**
 * 注册 2 条跑动动画：`haibao-ne` / `haibao-se`。
 * frames 顺序 [idle, run0, run1, run2, run1] 营造"起步→左脚→回中→右脚→回中"的脚步摆动。
 * NW / SW 不注册单独动画，由业务层 `setFlipX(true)` 镜像 ne / se 实现。
 *
 * 幂等：若动画已存在则跳过，避免 Phaser 重复注册告警。
 */
export function registerHaibaoAnims(scene: Phaser.Scene): void {
  for (const view of VIEWS) {
    const animKey = `haibao-${view}`;
    if (scene.anims.exists(animKey)) continue;
    scene.anims.create({
      key: animKey,
      frames: [
        { key: haibaoTextureKey(view, 'idle') },
        { key: haibaoTextureKey(view, 'run0') },
        { key: haibaoTextureKey(view, 'run1') },
        { key: haibaoTextureKey(view, 'run2') },
        { key: haibaoTextureKey(view, 'run1') },
      ],
      frameRate: 8,
      repeat: -1,
    });
  }
}

// ---- 内部绘制 -------------------------------------------------------------

/**
 * 在 graphics 上画一帧海宝（64×96），左上角 (0,0) 为原点。
 *
 * 分层顺序（从背到前）：椭圆阴影 → 腿 → 身体 → 翘拇指手 → 头 → 海浪头发 → 黑豆眼 + 小弧嘴。
 *
 * 相位差异：
 *   - idle：身体 y=0，双腿居中并拢
 *   - run0：身体 y=-2（微提），左腿前伸、右腿后收，拇指手上抬 2px
 *   - run1：身体 y=0，双腿并拢（与 idle 接近但拇指手平举）
 *   - run2：身体 y=-2，右腿前伸、左腿后收，拇指手下摆 2px
 *
 * 视角差异：
 *   - NE（面向右上）：眼睛位置偏上，海浪头发往右上方翘
 *   - SE（面向右下）：眼睛位置偏下，海浪头发更靠下
 *   - NW / SW 由调用方 setFlipX 镜像，不在此绘制
 */
function drawHaibao(g: Phaser.GameObjects.Graphics, view: View, phase: Phase): void {
  const cx = FRAME_W / 2; // 32
  const bodyOffsetY = phase === 'run0' || phase === 'run2' ? -2 : 0;
  const handLift = phase === 'run0' ? -2 : phase === 'run2' ? 2 : 0;

  // --- 阴影：脚下压扁椭圆（FEAT-311：加深 + 拉扁，让落地感更明显） ---
  g.fillStyle(COLOR_SHADOW, 0.38);
  g.fillEllipse(cx, 90, 34, 10);

  // --- 腿：两根矩形，run 相位错开 ---------------------------------------
  drawLegs(g, cx, phase);

  // --- 身体：主蓝圆角矩形 + 左下暗部投影 + 胸前黄名牌 -------------------
  const bodyY = 40 + bodyOffsetY;
  const bodyW = 30;
  const bodyH = 28;
  const bodyX = cx - bodyW / 2;
  // 暗部（斜向右下 2px 偏移）模拟立体感
  g.fillStyle(COLOR_BODY_DARK, 1);
  g.fillRoundedRect(bodyX + 2, bodyY + 2, bodyW, bodyH, 8);
  // 主体
  g.fillStyle(COLOR_BODY, 1);
  g.fillRoundedRect(bodyX, bodyY, bodyW, bodyH, 8);
  // FEAT-311：高光从 10x6 小圆弧放大成 10x6 仍在左上角；这里改为 10x6 真正的亮色块，
  // 让身体左上角光泽明显（原先 3x2 几乎看不到）。
  g.fillStyle(COLOR_HIGHLIGHT, 0.85);
  g.fillRoundedRect(bodyX + 3, bodyY + 3, 10, 6, 3);
  // FEAT-311：胸前名牌缩小一档（12x6 → 10x5），避免压主角脸。
  g.fillStyle(COLOR_NAMEPLATE, 1);
  g.fillRoundedRect(cx - 5, bodyY + bodyH / 2 - 2, 10, 5, 2);

  // --- 翘拇指手（面向右侧）：小粉椭圆 + 竖起的拇指 -----------------------
  // 手位于身体右侧，模拟海宝经典"Thumbs up"动作
  const handY = bodyY + 10 + handLift;
  g.fillStyle(COLOR_HAND, 1);
  g.fillCircle(cx + bodyW / 2 + 4, handY, 5); // 拳头
  g.fillRect(cx + bodyW / 2 + 2, handY - 10, 4, 8); // 拇指
  // 手臂（蓝色，连到身体）
  g.fillStyle(COLOR_BODY, 1);
  g.fillRect(cx + bodyW / 2 - 2, handY - 3, 8, 6);

  // --- 头：圆形白脸（略带蓝边） ----------------------------------------
  const headCy = bodyY - 14;
  g.fillStyle(COLOR_BODY_DARK, 1);
  g.fillCircle(cx, headCy + 1, 14); // 头的边缘暗蓝
  g.fillStyle(0xffffff, 1);
  g.fillCircle(cx, headCy, 13);

  // --- 海浪头发：3 条翻卷蓝弧（依视角调整朝向） ------------------------
  drawWaveHair(g, cx, headCy, view);

  // --- 眼睛 + 小弧嘴（依视角放置偏移） ----------------------------------
  drawFace(g, cx, headCy, view);
}

function drawLegs(g: Phaser.GameObjects.Graphics, cx: number, phase: Phase): void {
  // 腿区位于 y=68~84，run0/run2 时前后错开
  const legYTop = 68;
  const legH = 14;
  const legW = 6;
  g.fillStyle(COLOR_BODY_DARK, 1);

  let lx = cx - 8;
  let rx = cx + 2;
  let lYOff = 0;
  let rYOff = 0;
  if (phase === 'run0') {
    // 左腿前伸（屏幕上略短 + 偏右）、右腿后收（FEAT-311：±2→±3 加大跑动活力）。
    lx = cx - 5;
    rx = cx + 5;
    lYOff = -1;
    rYOff = 3;
  } else if (phase === 'run2') {
    // 右腿前伸、左腿后收
    lx = cx - 11;
    rx = cx + 5;
    lYOff = 3;
    rYOff = -1;
  }
  g.fillRect(lx, legYTop + lYOff, legW, legH);
  g.fillRect(rx, legYTop + rYOff, legW, legH);

  // 脚（底部压扁小矩形）
  g.fillStyle(COLOR_EYE, 1);
  g.fillRect(lx - 1, legYTop + legH + lYOff, legW + 2, 3);
  g.fillRect(rx - 1, legYTop + legH + rYOff, legW + 2, 3);
}

function drawWaveHair(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  headCy: number,
  view: View,
): void {
  // 三条翻卷海浪：两道基础浪 + 高光浪
  const waveTopY = headCy - 14;
  g.fillStyle(COLOR_BODY, 1);

  // NE 视角：头发整体往右上翘（屏幕更上）
  // SE 视角：头发更靠右下（屏幕更下）
  const tilt = view === 'ne' ? -2 : 0;

  // 第一条（最左）
  g.fillTriangle(
    cx - 12,
    waveTopY + 4 + tilt,
    cx - 6,
    waveTopY + tilt,
    cx - 2,
    waveTopY + 6 + tilt,
  );
  // 第二条（中间，最高）
  g.fillTriangle(cx - 3, waveTopY + 5 + tilt, cx + 3, waveTopY - 2 + tilt, cx + 7, waveTopY + 5 + tilt);
  // 第三条（右边）
  g.fillTriangle(cx + 4, waveTopY + 6 + tilt, cx + 10, waveTopY + tilt, cx + 14, waveTopY + 7 + tilt);

  // 高光
  g.fillStyle(COLOR_HIGHLIGHT, 0.85);
  g.fillTriangle(cx - 2, waveTopY + 3 + tilt, cx + 2, waveTopY - 1 + tilt, cx + 4, waveTopY + 3 + tilt);
}

function drawFace(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  headCy: number,
  view: View,
): void {
  // 眼睛：两颗黑豆；NE 视角眼睛偏头顶上方一些，SE 视角偏头部中下
  const eyeOffY = view === 'ne' ? -3 : 1;
  g.fillStyle(COLOR_EYE, 1);
  g.fillCircle(cx - 4, headCy + eyeOffY, 1.8);
  g.fillCircle(cx + 4, headCy + eyeOffY, 1.8);

  // 嘴：小弧线（用小椭圆近似）
  g.fillStyle(COLOR_MOUTH, 1);
  g.fillEllipse(cx, headCy + eyeOffY + 5, 5, 2);
}
