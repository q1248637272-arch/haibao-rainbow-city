import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { getBoss } from '@/data/bosses';
import { RAINBOW_CITY } from '@/data/maps';
import { getPet } from '@/data/pets';
import { AudioManager } from '@/systems/AudioManager';
import { gameEvents } from '@/systems/EventBus';
import { PlayerState } from '@/systems/PlayerState';
import { computeIsoFacing } from '@/systems/direction';
import { applyVipRareBoost } from '@/systems/VipSystem';
import type { IsoDir } from '@/types/direction';
import { type HudHandle } from '@/ui/Hud';
import { createNavIconButton } from '@/ui/NavIconButton';
import { haibaoTextureKey } from '@/utils/haibaoSprite';

import {
  attachClickMovement,
  attachWalkabilityGuard,
  playerActorDepth,
  readMovementInput,
  renderIsoMap,
  setupPlayerAndHud,
  setupWorldInput,
  wireEncounterOverlaps,
  wireLandmarkOverlaps,
  type ClickPathController,
  type WorldInputHandle,
} from './IsoWorldRenderer';

/**
 * 彩虹城世界地图（FEAT-204 起改为等距渲染）。
 *
 * - 地形数据从 `RAINBOW_CITY` 读取（见 src/data/maps.ts）；
 * - 渲染 / 玩家 / HUD / 输入 / overlap 均委托 `IsoWorldRenderer` 的共用工具；
 * - 本 scene 只保留：进入道馆 / 进入海滨传送门 / 入口兜底 toast / BOSS 勋章 / 贺词 toast 等特化逻辑。
 *
 * 与 FEAT-202 的差异：
 *   - `drawFloor` / `spawnLandmarks` / `spawnPlayer` 被 renderIsoMap + setupPlayerAndHud 取代；
 *   - 相机 follow 玩家、物理世界边界由 renderIsoMap 依地图投影包围盒设置；
 *   - 旧 `MAP_COLS/MAP_ROWS/TILE_SIZE` 常量在 GameConfig 仍保留但本文件不再使用。
 */
export class WorldMapScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private input_!: WorldInputHandle;
  private clickPath!: ClickPathController;

  /** 当前海宝朝向；update 内按输入推导。 */
  private readonly facing: { current: IsoDir } = { current: 'se' };

  private hud: HudHandle | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  /**
   * 刚从 BattleScene 返回且胜利时，由 BattleScene 通过 scene.start data 传入。
   */
  private justWonBossId: string | null = null;
  /**
   * 刚从 wild 战斗捕捉成功返回时传入的野生精灵 id（FEAT-206）。
   */
  private justCapturedPetId: string | null = null;
  /**
   * 刚从 wild 战斗胜利返回时传入的野生精灵 id（FEAT-206，用于展示战利品 toast）。
   */
  private justDefeatedWildPetId: string | null = null;

  public constructor() {
    super({ key: SceneKey.WORLD });
  }

  public init(data?: {
    justWonBossId?: string;
    justCapturedPetId?: string;
    justDefeatedWildPetId?: string;
  }): void {
    this.justWonBossId = data?.justWonBossId ?? null;
    this.justCapturedPetId = data?.justCapturedPetId ?? null;
    this.justDefeatedWildPetId = data?.justDefeatedWildPetId ?? null;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.facing.current = 'se';

    // 1. 铺地图 + 挂 zone。
    const { landmarkZones, encounterZones, blockerGroup } = renderIsoMap(this, RAINBOW_CITY);

    // 2. 生成海宝 + HUD，并让相机跟随玩家。
    const handle = setupPlayerAndHud(this, RAINBOW_CITY.spawn);
    this.player = handle.player;
    this.playerLabel = handle.label;
    this.hud = handle.hud;

    // 2.5 FEAT-311：给玩家与建筑/树木/墙体物理阻挡 group 之间加 collider，避免穿模。
    this.physics.add.collider(this.player, blockerGroup);
    attachWalkabilityGuard(this, this.player, RAINBOW_CITY);

    // 3. 初始化输入。
    this.input_ = setupWorldInput(this);

    // 4. 标题提示。
    this.drawTitleHint();
    this.drawQuickButtons();

    // 5. BOSS 勋章（若已击败）。
    this.drawBossMedal();

    // 6. 地标 overlap 路由。
    wireLandmarkOverlaps(this, this.player, landmarkZones, {
      onGym: (lm) => this.handleGymEnter(lm),
      onPortal: (target) => this.handlePortal(target),
      onToast: (message) => this.showToast(message),
    });

    // 7. encounter 遭遇 overlap：FEAT-206 起真正触发 BattleScene（wild 模式）。
    wireEncounterOverlaps(this, this.player, encounterZones, (roll, zoneId) => {
      this.handleWildEncounter(roll, zoneId);
    });

    // 8. 清理：HUD / toast 在 shutdown 时释放。
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud?.destroy();
      this.hud = null;
      this.clearToast();
      this.clickPath.destroy();
    });

    // 9. 刚从 BattleScene 胜利返回时弹贺词。
    if (this.justWonBossId) {
      const boss = getBoss(this.justWonBossId);
      if (boss) {
        this.showToast(`恭喜击败 ${boss.name}！`);
      }
      this.justWonBossId = null;
    } else if (this.justCapturedPetId) {
      const pet = getPet(this.justCapturedPetId);
      this.showToast(pet ? `你收服了 ${pet.name}！` : '你收服了一只新伙伴！');
      this.justCapturedPetId = null;
    } else if (this.justDefeatedWildPetId) {
      const pet = getPet(this.justDefeatedWildPetId);
      this.showToast(pet ? `战胜 ${pet.name}！` : '战胜了野生精灵！');
      this.justDefeatedWildPetId = null;
    }

    // 10. 彩虹城 BGM。从战斗 / 其它场景返回时也需要切回城市主题。
    AudioManager.play('world_rainbow', undefined, this);

    // 11. FEAT-303：进入彩虹城触发 map:enter，推进主线任务（例如"回到彩虹城"）。
    gameEvents.emit('map:enter', { mapId: RAINBOW_CITY.id });

    // 12. 鼠标左键点击自动寻路（FEAT-301）。键盘输入会在 update() 里优先打断。
    this.clickPath = attachClickMovement(this, this.player, RAINBOW_CITY);
  }

  public update(_time: number, delta: number): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    const { vx, vy } = readMovementInput(this.input_);

    // 键盘优先：只要 WASD / 方向键有任何输入，立即打断自动寻路并接管速度。
    if (vx !== 0 || vy !== 0) {
      this.clickPath.cancel();
      body.setVelocity(vx, vy);
    } else if (this.clickPath.isPathing()) {
      // 自动寻路推进（内部会 body.setVelocity）。
      this.clickPath.update(delta);
    } else {
      body.setVelocity(0, 0);
    }

    // 朝向用"实际速度"推导，兼顾键盘与自动寻路。
    const rvx = body.velocity.x;
    const rvy = body.velocity.y;
    const next = computeIsoFacing(rvx, rvy, this.facing.current);
    const isMoving = rvx !== 0 || rvy !== 0;
    this.applyFacing(next, isMoving);

    // 海宝下方"宝"字跟随；随玩家 y 变化动态更新 depth。
    this.playerLabel.setPosition(this.player.x, this.player.y + 24);
    const d = playerActorDepth(this.player);
    this.player.setDepth(d);
    this.playerLabel.setDepth(d + 1);
  }

  private applyFacing(next: IsoDir, isMoving: boolean): void {
    const directionChanged = next !== this.facing.current;
    this.facing.current = next;
    const view: 'ne' | 'se' = next === 'ne' || next === 'nw' ? 'ne' : 'se';
    const flipX = next === 'nw' || next === 'sw';

    this.player.setFlipX(flipX);

    if (!isMoving) {
      this.player.anims.stop();
      this.player.setTexture(haibaoTextureKey(view, 'idle'));
      return;
    }

    const animKey = `haibao-${view}`;
    const current = this.player.anims.currentAnim?.key;
    if (directionChanged || current !== animKey || !this.player.anims.isPlaying) {
      this.player.anims.play(animKey, true);
    }
  }

  // ---- overlap 分派 ------------------------------------------------------

  private handleGymEnter(lm?: { pendingMessage?: string }): void {
    const target = this.scene.get(SceneKey.GYM);
    if (target) {
      this.scene.start(SceneKey.GYM);
      return;
    }
    // scene.get 兜底：道馆场景未注册（测试构型）时，用通用入口文案提示玩家。
    const fallback = lm?.pendingMessage ?? '精灵道馆正在整理入口，请稍后再试。';
    this.showToast(fallback);
  }

  private handlePortal(target: string): void {
    // 直接 scene.start：BEACH 必有；若未注册（测试路径）就退回 toast。
    const next = this.scene.get(target);
    if (next) {
      this.scene.start(target);
      return;
    }
    this.showToast('这条入口正在整理，请先从大地图前往其他地点。');
  }

  /**
   * 遭遇野生精灵时的分派：
   *   1. 读取队伍第 1 只出战精灵；没有则弹 toast 退出（防御性，正常流程 starter 必有 2 只）；
   *   2. 若 currentHp <= 0（残血 / 0 血）先治疗到满 HP 再出战，避免秒杀；
   *   3. 否则 scene.start(BATTLE, { mode: 'wild', ... })，交给 BattleScene 处理。
   */
  private handleWildEncounter(roll: { petId: string; level: number }, _zoneId: string): void {
    const myPet = PlayerState.snapshot().playerPets[0];
    if (!myPet) {
      this.showToast('没有可出战的精灵！');
      return;
    }
    // 出战兜底：若第一只精灵 currentHp<=0，回满血再派出去，避免空血直接被秒杀。
    const live = PlayerState.getPlayerPet(myPet.petId);
    if (live && live.currentHp <= 0) {
      live.currentHp = live.currentStats.hp;
      PlayerState.persist();
    }
    // FEAT-305：VIP 玩家有 10% 概率把野生精灵升级为"稀有"（等级 +3）。
    const boosted = applyVipRareBoost(roll, PlayerState.isVip(), Math.random);
    if (boosted.level !== roll.level) {
      this.showToast('遇到了稀有精灵！');
    }
    this.scene.start(SceneKey.BATTLE_INTRO, {
      mode: 'wild',
      petId: myPet.petId,
      wildPetId: boosted.petId,
      wildLevel: boosted.level,
      fromScene: this.scene.key,
    });
  }

  // ---- 非地图相关 UI ------------------------------------------------------

  private drawQuickButtons(): void {
    const buttons = [
      {
        x: 46,
        label: '地图',
        onClick: () => this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.WORLD }),
      },
      {
        x: 120,
        label: '精灵',
        onClick: () => this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.WORLD }),
      },
      {
        x: 194,
        label: '背包',
        onClick: () => this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.WORLD }),
      },
      {
        x: 268,
        label: '存档',
        onClick: () => this.scene.start(SceneKey.SAVE_SLOTS, { fromScene: SceneKey.WORLD }),
      },
      {
        x: 342,
        label: '签到',
        onClick: () => this.scene.start(SceneKey.VIP_PANEL),
      },
      {
        x: 416,
        label: '玩法',
        onClick: () => this.scene.start(SceneKey.GUIDE, { fromScene: SceneKey.WORLD }),
      },
    ];
    buttons.forEach((button) =>
      createNavIconButton(this, {
        x: button.x,
        y: 34,
        label: button.label,
        onClick: button.onClick,
        width: 66,
        height: 48,
        depth: 1002,
      }),
    );
  }

  private drawTitleHint(): void {
    this.add
      .text(GAME_WIDTH / 2, 14, '彩虹城 · 小海宝出发啦！', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#ff3b9a',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(900);
  }

  private drawBossMedal(): void {
    if (!PlayerState.hasDefeatedBoss('shadow_overlord')) return;

    const centerX = GAME_WIDTH - 30;
    const centerY = 52;

    const g = this.add.graphics({ x: centerX, y: centerY });
    const outer = 12;
    const inner = outer * 0.45;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    g.fillStyle(0xffd93d, 1);
    g.lineStyle(2, 0x1b1b3a, 1);
    g.fillPoints(pts, true);
    g.strokePoints(pts, true, true);
    g.setScrollFactor(0).setDepth(1001);

    this.add
      .text(centerX - 18, centerY, '已击败暗影霸主', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#ffd93d',
        stroke: '#1b1b3a',
        strokeThickness: 3,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(1001);
  }

  private showToast(message: string): void {
    this.clearToast();
    const toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, message, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000);
    this.toast = toast;
    this.toastTimer = this.time.delayedCall(2000, () => {
      toast.destroy();
      if (this.toast === toast) this.toast = null;
      this.toastTimer = null;
    });
  }

  private clearToast(): void {
    if (this.toastTimer) {
      this.toastTimer.remove(false);
      this.toastTimer = null;
    }
    if (this.toast) {
      this.toast.destroy();
      this.toast = null;
    }
  }
}
