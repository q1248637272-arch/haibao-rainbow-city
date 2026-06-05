import Phaser from 'phaser';

/**
 * 升级视觉反馈：在 (x, y) 处弹出一枚金色「Lv Up!」徽章，
 * 并在其周围生成 8 颗小星星做"爆散"tween，1.2s 后整体销毁。
 *
 * 不返回句柄：完全一次性，tween 链负责清理。
 * 用途：BattleScene 胜利后若某只精灵升级，在结算面板上方或精灵头像顶 spawn 一次。
 */
export function spawnLevelUpBadge(scene: Phaser.Scene, x: number, y: number, newLevel: number): void {
  const container = scene.add.container(x, y).setDepth(600);

  // 底座圆环（金色描边 + 深蓝填充），营造徽章感。
  const ring = scene.add.circle(0, 0, 42, 0x1b1b3a, 0.9);
  ring.setStrokeStyle(4, 0xffd93d, 1);
  container.add(ring);

  const title = scene.add
    .text(0, -10, 'Lv Up!', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '22px',
      color: '#ffd93d',
      stroke: '#1b1b3a',
      strokeThickness: 4,
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  container.add(title);

  const sub = scene.add
    .text(0, 14, `Lv ${Math.max(1, Math.floor(newLevel))}`, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#1b1b3a',
      strokeThickness: 3,
    })
    .setOrigin(0.5);
  container.add(sub);

  container.setScale(0.6);
  container.setAlpha(0);

  // 主徽章：放大浮出 → 停顿 → 淡出。
  scene.tweens.add({
    targets: container,
    alpha: { from: 0, to: 1 },
    scale: { from: 0.6, to: 1 },
    duration: 200,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        scale: 1.15,
        delay: 600,
        duration: 300,
        ease: 'Sine.easeIn',
        onComplete: () => container.destroy(),
      });
    },
  });

  // 8 颗金色小星星环绕爆散。用简单几何形状（4 角星）避免引入额外素材。
  const STAR_COUNT = 8;
  const STAR_RADIUS = 6;
  for (let i = 0; i < STAR_COUNT; i++) {
    const angle = (i / STAR_COUNT) * Math.PI * 2;
    const star = scene.add.star(x, y, 4, STAR_RADIUS / 2, STAR_RADIUS, 0xffd93d, 1);
    star.setDepth(599);
    const distance = 56 + Phaser.Math.Between(-4, 10);
    const tx = x + Math.cos(angle) * distance;
    const ty = y + Math.sin(angle) * distance;
    scene.tweens.add({
      targets: star,
      x: tx,
      y: ty,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.8, to: 1.4 },
      duration: 700,
      delay: 100,
      ease: 'Sine.easeOut',
      onComplete: () => star.destroy(),
    });
  }
}
