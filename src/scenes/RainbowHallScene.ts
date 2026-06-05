import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { BOSSES } from '@/data/bosses';
import { ITEMS } from '@/data/items';
import { PETS } from '@/data/pets';
import { AudioManager } from '@/systems/AudioManager';
import { gameEvents } from '@/systems/EventBus';
import { createPlayerPet } from '@/systems/PetInstance';
import { PlayerState } from '@/systems/PlayerState';
import { preloadRainbowHallAssets } from '@/systems/SceneAssetPreloader';
import { VIP_MEMBER_PET_IDS, grantVipMemberPets, type VipMemberPetId } from '@/systems/VipRewards';
import { createVerifiedContourZone, drawRaisedContour } from '@/ui/ContourInteractive';
import { makeHud, type HudHandle } from '@/ui/Hud';
import { ensureCurrentPlayerWalkAnimation, currentPlayerSheetKey } from '@/utils/playerAvatar';
import { ensureBossTexture } from '@/utils/placeholder';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

interface RainbowHallData {
  readonly justWonBossId?: string;
}

interface TrialDef {
  readonly bossId: string;
  readonly title: string;
  readonly hint: string;
  readonly reward: {
    readonly coins: number;
    readonly items: ReadonlyArray<{ readonly itemId: string; readonly quantity: number }>;
  };
}

interface DodoRoute {
  readonly id: string;
  readonly title: string;
  readonly desc: string;
  readonly items: ReadonlyArray<{
    readonly itemId: string;
    readonly min: number;
    readonly max: number;
  }>;
  readonly coins: readonly [number, number];
}

const WALK_AREA = new Phaser.Geom.Rectangle(95, 175, 760, 390);
const VIP_TRIAL_REWARD_PREFIX = 'vip_hall_reward_';
const VIP_TRAINING_PREFIX = 'vip_hall_training_';
const VIP_DODO_PREFIX = 'vip_dodo_';
const MAX_DODO_ATTEMPTS = 2;

const TRIALS: readonly TrialDef[] = [
  {
    bossId: 'vip_card_guardian',
    title: '一阶 星卡守门',
    hint: '光系试炼，推荐水/光系站稳后消耗。',
    reward: { coins: 120, items: [{ itemId: 'gold_shell', quantity: 1 }] },
  },
  {
    bossId: 'vip_jingwei_echo',
    title: '二阶 玄卿赤羽',
    hint: '火系高速，水系技能能明显压制。',
    reward: {
      coins: 160,
      items: [
        { itemId: 'crystal_shard', quantity: 2 },
        { itemId: 'exp_candy', quantity: 1 },
      ],
    },
  },
  {
    bossId: 'vip_aotian_echo',
    title: '三阶 傲天矿井',
    hint: '水系厚血，草系与电系更适合突破。',
    reward: {
      coins: 220,
      items: [
        { itemId: 'pokeball_ultra', quantity: 1 },
        { itemId: 'evo_stone_light', quantity: 1 },
      ],
    },
  },
  {
    bossId: 'vip_rainbow_overlord',
    title: '终阶 彩虹殿堂主',
    hint: '终阶光系，建议主宠 Lv12+ 并备好药品。',
    reward: {
      coins: 320,
      items: [
        { itemId: 'pokeball_master', quantity: 1 },
        { itemId: 'exp_cake', quantity: 1 },
      ],
    },
  },
];

const DODO_ROUTES: readonly DodoRoute[] = [
  {
    id: 'coral',
    title: '珊瑚浅湾',
    desc: '朵朵从旧版珊瑚台带回药品和贝壳。',
    items: [
      { itemId: 'potion_medium', min: 1, max: 2 },
      { itemId: 'gold_shell', min: 1, max: 1 },
    ],
    coins: [70, 130],
  },
  {
    id: 'card',
    title: '星卡书架',
    desc: '翻找 72 张魔法牌的残页，适合给精灵练级。',
    items: [
      { itemId: 'exp_candy', min: 1, max: 2 },
      { itemId: 'element_fruit_light', min: 1, max: 1 },
    ],
    coins: [50, 100],
  },
  {
    id: 'mine',
    title: '水晶回廊',
    desc: '沿着矿井水光寻找净化材料。',
    items: [
      { itemId: 'crystal_shard', min: 2, max: 4 },
      { itemId: 'pokeball_great', min: 1, max: 2 },
    ],
    coins: [60, 120],
  },
];

export class RainbowHallScene extends Phaser.Scene {
  private hud: HudHandle | null = null;
  private player: Phaser.GameObjects.Sprite | null = null;
  private panel: Phaser.GameObjects.Container | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private lastWonBossId: string | null = null;

  public constructor() {
    super({ key: SceneKey.RAINBOW_HALL });
  }

  public preload(): void {
    preloadRainbowHallAssets(this);
  }

  public init(data?: RainbowHallData): void {
    this.lastWonBossId = data?.justWonBossId ?? null;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.drawMap();
    this.drawPlayer();
    this.drawHotspots();
    this.drawTopButtons();
    this.hud = makeHud(this, 'topright');
    this.consumeBattleReturnReward();
    gameEvents.emit('map:enter', { mapId: 'rainbow_hall' });
    AudioManager.play('world_rainbow', undefined, this);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.panel) return;
      if (!Phaser.Geom.Rectangle.Contains(WALK_AREA, pointer.x, pointer.y)) return;
      this.walkTo(pointer.x, pointer.y);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud?.destroy();
      this.hud = null;
      this.clearPanel();
      this.clearToast();
    });
  }

  private drawMap(): void {
    createResponsiveMapBackground(this, 'legacy_rainbow_hall_vip');
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x053c71, 0.08).setOrigin(0);
  }

  private drawPlayer(): void {
    const animKey = ensureCurrentPlayerWalkAnimation(this);
    const sprite = this.add.sprite(480, 470, currentPlayerSheetKey(), 0).setDepth(80);
    sprite.setScale(0.58);
    this.player = sprite;
    try {
      sprite.play(animKey);
      sprite.anims.pause();
    } catch {
      sprite.setFrame(0);
    }
  }

  private drawHotspots(): void {
    this.createHotspot(178, 444, '朵朵寻宝', 0x88f7ff, () => this.showDodoPanel());
    this.createHotspot(486, 244, '星座试炼', 0xffd93d, () => this.showTrialPanel());
    this.createHotspot(762, 316, '会员玩偶', 0xff7bd5, () => this.showVipPetsPanel());
    this.createHotspot(690, 514, '圣衣修炼', 0xb9ff8a, () => this.showTrainingPanel());
    this.createHotspot(90, 188, '返回彩虹城', 0xffffff, () => this.scene.start(SceneKey.WORLD));
  }

  private createHotspot(
    x: number,
    y: number,
    label: string,
    color: number,
    onClick: () => void,
  ): void {
    const contour = createVerifiedContourZone(this, {
      area: {
        kind: 'ellipse',
        x,
        y,
        rx: 44,
        ry: 28,
      },
      depth: 70,
      label: `rainbow-hall.${label}`,
      minWidth: 32,
      minHeight: 22,
      worldBounds: { left: 0, right: GAME_WIDTH, top: 0, bottom: GAME_HEIGHT },
    });
    const ring = this.add.graphics().setDepth(68);
    const draw = (active: boolean): void => {
      ring.clear();
      drawRaisedContour(ring, contour.area, {
        color,
        active,
      });
    };
    draw(false);
    this.tweens.add({
      targets: ring,
      alpha: 0.5,
      yoyo: true,
      repeat: -1,
      duration: 780,
      ease: 'Sine.easeInOut',
    });
    contour.zone
      .on('pointerover', () => draw(true))
      .on('pointerout', () => draw(false))
      .on('pointerup', onClick);
    this.add
      .text(x, y + 36, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#163a69',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(71);
  }

  private drawTopButtons(): void {
    this.createSmallButton(24, 24, '返回', () => this.scene.start(SceneKey.WORLD));
    this.createSmallButton(96, 24, '精灵', () => this.scene.start(SceneKey.PET_MANAGER));
    this.createSmallButton(168, 24, '背包', () => this.scene.start(SceneKey.BACKPACK));
  }

  private createSmallButton(x: number, y: number, label: string, onClick: () => void): void {
    const btn = this.add
      .text(x, y, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        backgroundColor: '#0b5f9ecc',
        padding: { left: 12, right: 12, top: 6, bottom: 6 },
        fixedWidth: 60,
        align: 'center',
      })
      .setOrigin(0, 0)
      .setDepth(200)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ffd93d'));
    btn.on('pointerout', () => btn.setColor('#ffffff'));
    btn.on('pointerup', onClick);
  }

  private walkTo(x: number, y: number): void {
    const sprite = this.player;
    if (!sprite) return;
    const targetX = Phaser.Math.Clamp(x, WALK_AREA.left, WALK_AREA.right);
    const targetY = Phaser.Math.Clamp(y, WALK_AREA.top, WALK_AREA.bottom);
    const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, targetX, targetY);
    const duration = Phaser.Math.Clamp(dist * 4.2, 180, 1200);
    if (sprite.anims.currentAnim) sprite.anims.resume();
    this.tweens.killTweensOf(sprite);
    this.tweens.add({
      targets: sprite,
      x: targetX,
      y: targetY,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (sprite.anims.currentAnim) sprite.anims.pause();
        sprite.setFrame(0);
      },
    });
  }

  private showVipPetsPanel(): void {
    const rows = VIP_MEMBER_PET_IDS.map((petId) => {
      const pet = PETS[petId];
      const owned = PlayerState.hasPet(petId);
      return {
        title: `${pet?.name ?? petId} ${owned ? '已拥有' : '待领取'}`,
        desc: pet?.description ?? '旧版会员精灵',
      };
    });
    const panel = this.openPanel('VIP 会员玩偶', '旧版资料中标注为会员玩偶的精灵会在这里补发。');
    this.addRows(panel, 118, rows);
    this.addPanelButton(panel, -130, 208, '一键补发', () => {
      if (!this.ensureVip()) return;
      const result = grantVipMemberPets();
      const fresh = result.filter((r) => r.placement !== 'duplicate').length;
      this.showToast(
        fresh > 0 ? `已补发 ${fresh} 只会员精灵。` : '会员精灵都已经在队伍或仓库里了。',
      );
      this.clearPanel();
      this.showVipPetsPanel();
    });
    this.addPanelButton(panel, 130, 208, '打开精灵管理', () =>
      this.scene.start(SceneKey.PET_MANAGER),
    );
  }

  private showTrialPanel(): void {
    const panel = this.openPanel(
      '彩虹星座试炼',
      '按顺序挑战殿堂守护者，像页游副本一样逐层领取奖励。',
    );
    TRIALS.forEach((trial, idx) => {
      const y = -106 + idx * 74;
      const unlocked = this.isTrialUnlocked(idx);
      const cleared = PlayerState.hasDefeatedBoss(trial.bossId);
      const boss = BOSSES[trial.bossId];
      const iconKey = boss ? ensureBossTexture(this, boss.id) : 'legacy_pet_rainbow_wing';
      const icon = this.add.image(-242, y + 18, iconKey).setDisplaySize(44, 44);
      panel.add(icon);
      panel.add(
        this.add
          .text(
            -212,
            y - 2,
            `${trial.title} ${cleared ? '已通关' : unlocked ? '可挑战' : '未解锁'}`,
            {
              fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
              fontSize: '17px',
              color: cleared ? '#a8ffbf' : unlocked ? '#ffd93d' : '#9aa8c5',
              stroke: '#163a69',
              strokeThickness: 3,
              fontStyle: 'bold',
            },
          )
          .setOrigin(0, 0),
      );
      panel.add(
        this.add
          .text(-212, y + 24, trial.hint, {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '13px',
            color: '#e8f6ff',
            wordWrap: { width: 330 },
          })
          .setOrigin(0, 0),
      );
      this.addPanelButton(
        panel,
        214,
        y + 18,
        cleared ? '重战' : '挑战',
        () => {
          if (!this.ensureVip()) return;
          if (!unlocked) {
            this.showToast('先完成上一阶试炼。');
            return;
          }
          this.startTrial(trial.bossId);
        },
        96,
      );
    });
  }

  private showDodoPanel(): void {
    const attempts = this.getTodayDodoAttempts();
    const panel = this.openPanel(
      '精灵朵朵寻宝',
      `今日还可出发 ${Math.max(0, MAX_DODO_ATTEMPTS - attempts)} 次。`,
    );
    DODO_ROUTES.forEach((route, idx) => {
      const y = -92 + idx * 78;
      panel.add(
        this.add
          .text(-248, y, route.title, {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '18px',
            color: '#ffd93d',
            stroke: '#163a69',
            strokeThickness: 3,
            fontStyle: 'bold',
          })
          .setOrigin(0, 0),
      );
      panel.add(
        this.add
          .text(-248, y + 28, route.desc, {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '14px',
            color: '#e8f6ff',
            wordWrap: { width: 390 },
          })
          .setOrigin(0, 0),
      );
      this.addPanelButton(panel, 220, y + 30, '出发', () => this.runDodoRoute(route), 96);
    });
  }

  private showTrainingPanel(): void {
    const active = PlayerState.snapshot().playerPets[0];
    const activePet = active ? PETS[active.petId] : undefined;
    const panel = this.openPanel(
      '宠物圣衣修炼',
      activePet
        ? `当前主宠：${activePet.name} Lv${active?.level ?? 1}。消耗 1 金贝壳 + 1 净化水晶，获得经验并回满体力。`
        : '队伍里没有可修炼的精灵。',
    );
    const haveShell = PlayerState.getItemCount('gold_shell');
    const haveCrystal = PlayerState.getItemCount('crystal_shard');
    panel.add(
      this.add
        .text(-248, -62, `材料：金贝壳 ${haveShell}/1    净化水晶 ${haveCrystal}/1`, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '18px',
          color: '#e8f6ff',
          stroke: '#163a69',
          strokeThickness: 3,
        })
        .setOrigin(0, 0),
    );
    panel.add(
      this.add
        .text(
          -248,
          -18,
          '这个模块参考旧版“宠物圣衣”与页游宠物培养：不是直接白送，而是用殿堂材料强化当前主宠。',
          {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '15px',
            color: '#d8eeff',
            wordWrap: { width: 496 },
          },
        )
        .setOrigin(0, 0),
    );
    this.addPanelButton(panel, 0, 150, '开始修炼', () => this.runTraining(), 150);
  }

  private openPanel(title: string, subtitle: string): Phaser.GameObjects.Container {
    this.clearPanel();
    const panel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8).setDepth(400);
    panel.add(this.add.rectangle(0, 0, 620, 488, 0x062f5c, 0.92).setStrokeStyle(4, 0x8cecff, 0.96));
    panel.add(
      this.add
        .text(0, -214, title, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '28px',
          color: '#ffd93d',
          stroke: '#163a69',
          strokeThickness: 4,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(0, -178, subtitle, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '15px',
          color: '#e8f6ff',
          align: 'center',
          wordWrap: { width: 520 },
        })
        .setOrigin(0.5),
    );
    this.addPanelButton(panel, 260, -214, '×', () => this.clearPanel(), 42);
    this.panel = panel;
    return panel;
  }

  private addRows(
    panel: Phaser.GameObjects.Container,
    startY: number,
    rows: ReadonlyArray<{ readonly title: string; readonly desc: string }>,
  ): void {
    rows.forEach((row, idx) => {
      const y = -startY + idx * 86;
      panel.add(
        this.add
          .text(-248, y, row.title, {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '19px',
            color: '#ffd93d',
            stroke: '#163a69',
            strokeThickness: 3,
            fontStyle: 'bold',
          })
          .setOrigin(0, 0),
      );
      panel.add(
        this.add
          .text(-248, y + 30, row.desc, {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '14px',
            color: '#e8f6ff',
            wordWrap: { width: 496 },
          })
          .setOrigin(0, 0),
      );
    });
  }

  private addPanelButton(
    panel: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    width = 132,
  ): void {
    const btn = this.add
      .text(x, y, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#1b1b3a',
        stroke: '#ffffff',
        strokeThickness: 2,
        backgroundColor: '#ffd93d',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
        fixedWidth: width,
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ff3b9a'));
    btn.on('pointerout', () => btn.setColor('#1b1b3a'));
    btn.on('pointerup', onClick);
    panel.add(btn);
  }

  private startTrial(bossId: string): void {
    const active = PlayerState.snapshot().playerPets[0];
    if (!active) {
      this.showToast('队伍里没有可出战的精灵。');
      return;
    }
    this.scene.start(SceneKey.BATTLE_INTRO, {
      mode: 'boss',
      petId: active.petId,
      bossId,
      fromScene: SceneKey.RAINBOW_HALL,
    });
  }

  private consumeBattleReturnReward(): void {
    const bossId = this.lastWonBossId;
    this.lastWonBossId = null;
    if (!bossId) return;
    const trial = TRIALS.find((t) => t.bossId === bossId);
    if (!trial) return;
    const flagId = `${VIP_TRIAL_REWARD_PREFIX}${bossId}`;
    if (PlayerState.getQuestState(flagId)?.status === 'completed') {
      this.showToast('试炼已通关，可重复挑战但奖励只领取一次。');
      return;
    }
    PlayerState.addCoins(trial.reward.coins);
    for (const reward of trial.reward.items) {
      PlayerState.addItem(reward.itemId, reward.quantity);
    }
    PlayerState.setQuestState(flagId, {
      status: 'completed',
      progress: { claimed: 1 },
      updatedAt: Date.now(),
    });
    this.showToast(
      `试炼奖励：金币 +${trial.reward.coins}，${formatItems(trial.reward.items)}`,
      2600,
    );
  }

  private runDodoRoute(route: DodoRoute): void {
    if (!this.ensureVip()) return;
    const attempts = this.getTodayDodoAttempts();
    if (attempts >= MAX_DODO_ATTEMPTS) {
      this.showToast('朵朵今天已经很努力了，明天再出发。');
      return;
    }
    const coins = Phaser.Math.Between(route.coins[0], route.coins[1]);
    PlayerState.addCoins(coins);
    const granted: { itemId: string; quantity: number }[] = [];
    for (const item of route.items) {
      const quantity = Phaser.Math.Between(item.min, item.max);
      PlayerState.addItem(item.itemId, quantity);
      granted.push({ itemId: item.itemId, quantity });
    }
    this.setTodayDodoAttempts(attempts + 1);
    this.showToast(`朵朵带回：金币 +${coins}，${formatItems(granted)}`, 2600);
    this.clearPanel();
    this.showDodoPanel();
  }

  private runTraining(): void {
    if (!this.ensureVip()) return;
    const active = PlayerState.snapshot().playerPets[0];
    if (!active) {
      this.showToast('队伍里没有可修炼的精灵。');
      return;
    }
    const today = todayKey();
    const flagId = `${VIP_TRAINING_PREFIX}${today}`;
    if (PlayerState.getQuestState(flagId)?.status === 'completed') {
      this.showToast('今天已经完成过圣衣修炼。');
      return;
    }
    if (
      PlayerState.getItemCount('gold_shell') < 1 ||
      PlayerState.getItemCount('crystal_shard') < 1
    ) {
      this.showToast('材料不足：需要 1 金贝壳和 1 净化水晶。');
      return;
    }
    PlayerState.removeItem('gold_shell', 1);
    PlayerState.removeItem('crystal_shard', 1);
    const activeKey = active.instanceId ?? active.petId;
    PlayerState.gainExp(activeKey, 450);
    PlayerState.healPet(activeKey);
    PlayerState.setQuestState(flagId, {
      status: 'completed',
      progress: { trained: 1 },
      updatedAt: Date.now(),
    });
    this.showToast('圣衣修炼完成：主宠获得 450 经验并恢复满体力。', 2600);
    this.clearPanel();
  }

  private ensureVip(): boolean {
    if (PlayerState.isVip()) return true;
    this.showToast('这里是 VIP 彩虹殿堂，先在 VIP 宫领取会员权限。');
    return false;
  }

  private isTrialUnlocked(index: number): boolean {
    if (index <= 0) return true;
    const prev = TRIALS[index - 1];
    return prev !== undefined && PlayerState.hasDefeatedBoss(prev.bossId);
  }

  private getTodayDodoAttempts(): number {
    const state = PlayerState.getQuestState(`${VIP_DODO_PREFIX}${todayKey()}`);
    return Math.max(0, Math.floor(state?.progress['attempts'] ?? 0));
  }

  private setTodayDodoAttempts(attempts: number): void {
    PlayerState.setQuestState(`${VIP_DODO_PREFIX}${todayKey()}`, {
      status: 'active',
      progress: { attempts },
      updatedAt: Date.now(),
    });
  }

  private clearPanel(): void {
    this.panel?.destroy();
    this.panel = null;
  }

  private showToast(message: string, durationMs = 1800): void {
    this.clearToast();
    const toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 48, message, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#163a69',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 14, right: 14, top: 7, bottom: 7 },
        wordWrap: { width: GAME_WIDTH - 80 },
      })
      .setOrigin(0.5)
      .setDepth(800);
    this.toast = toast;
    this.toastTimer = this.time.delayedCall(durationMs, () => {
      toast.destroy();
      if (this.toast === toast) this.toast = null;
      this.toastTimer = null;
    });
  }

  private clearToast(): void {
    this.toastTimer?.remove(false);
    this.toastTimer = null;
    this.toast?.destroy();
    this.toast = null;
  }
}

function formatItems(
  items: ReadonlyArray<{ readonly itemId: string; readonly quantity: number }>,
): string {
  return items
    .map((item) => `${ITEMS[item.itemId]?.name ?? item.itemId} ×${item.quantity}`)
    .join('，');
}

function todayKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function makeVipTrialPetForTest(petId: VipMemberPetId, level: number) {
  const pet = PETS[petId];
  if (!pet) return null;
  return createPlayerPet(pet, level, { evolutionStage: 0 });
}
