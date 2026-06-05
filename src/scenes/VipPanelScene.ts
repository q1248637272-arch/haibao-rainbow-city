import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { ENCOUNTERS } from '@/data/encounters';
import { ITEMS } from '@/data/items';
import { PETS } from '@/data/pets';
import { AudioManager } from '@/systems/AudioManager';
import { createPlayerPet } from '@/systems/PetInstance';
import { PlayerState, type AddPetPlacement } from '@/systems/PlayerState';
import { VipSystem, type CheckinReward } from '@/systems/VipSystem';
import { grantVipMemberPets } from '@/systems/VipRewards';
import { makeHud, type HudHandle } from '@/ui/Hud';
import type { PlayerPet, VipSnapshot } from '@/types';

const TITLE_COLOR = '#ffd93d';
const PANEL_BG = 0x102947;
const PANEL_BG_ALPHA = 0.9;
const PANEL_BORDER = 0xffd93d;
const BUTTON_READY_BG = '#ffd93d';
const BUTTON_DISABLED_BG = '#666666';
const BUTTON_STROKE = '#1b6fa8';
const CHECKIN_PET_LEVEL = 15;

const SPECIAL_REWARD_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const WILD_CHECKIN_PET_IDS = Array.from(
  new Set(
    Object.values(ENCOUNTERS).flatMap((encounter) =>
      encounter.pool
        .map((entry) => entry.petId)
        .filter((petId) => PETS[petId] && PETS[petId].vipOnly !== true),
    ),
  ),
);

interface RichCheckinReward {
  readonly coins: number;
  readonly items: Readonly<Record<string, number>>;
  readonly vipUnlocked: boolean;
  readonly pet?: {
    readonly petId: string;
    readonly level: number;
    readonly placement: AddPetPlacement;
  };
}

export class VipPanelScene extends Phaser.Scene {
  private hud: HudHandle | null = null;
  private content: Phaser.GameObjects.Container | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  public constructor() {
    super({ key: SceneKey.VIP_PANEL });
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);

    this.drawBackground();
    this.drawHeader();
    this.drawBackButton();
    this.rebuildContent();

    this.hud = makeHud(this, 'topright');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud?.destroy();
      this.hud = null;
      this.destroyContent();
      this.clearToast();
    });

    AudioManager.play('world_rainbow', undefined, this);
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x0b5f93, 0x0b5f93, 0x061b3a, 0x09234a, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.fillStyle(0xffffff, 0.16);
    g.fillEllipse(GAME_WIDTH / 2, 128, 720, 150);
    g.fillStyle(0xffd93d, 0.16);
    for (const point of [
      { x: 124, y: 150, r: 54 },
      { x: 812, y: 154, r: 62 },
      { x: 480, y: 548, r: 90 },
    ]) {
      g.fillCircle(point.x, point.y, point.r);
    }
  }

  private drawHeader(): void {
    this.add
      .text(GAME_WIDTH / 2, 18, '每日签到', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '38px',
        color: TITLE_COLOR,
        stroke: '#1b1b3a',
        strokeThickness: 6,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(900);

    this.add
      .text(GAME_WIDTH / 2, 64, '连续签到领取大量奖励，第 1 天送 Lv15 野生精灵，第 3 天解锁 VIP。', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
        stroke: '#1b6fa8',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(900);
  }

  private drawBackButton(): void {
    const btn = this.add
      .text(40, 40, '< 返回彩虹城', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        backgroundColor: '#00000066',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerup', () => this.scene.start(SceneKey.WORLD));
    btn.on('pointerover', () => btn.setColor('#ffd93d'));
    btn.on('pointerout', () => btn.setColor('#ffffff'));
  }

  private destroyContent(): void {
    this.content?.destroy();
    this.content = null;
  }

  private rebuildContent(): void {
    this.destroyContent();
    const group = this.add.container(0, 0).setDepth(800);
    this.content = group;

    const snapshot = PlayerState.getVipSnapshot();
    const check = VipSystem.computeCheckin(snapshot, PlayerState.isVip(), new Date(), Math.random);
    this.drawStatusPanel(group, snapshot, check.canCheckin);
    this.drawRewardCalendar(group, snapshot, check.canCheckin);
    this.drawPerks(group);
  }

  private drawStatusPanel(
    group: Phaser.GameObjects.Container,
    snapshot: VipSnapshot,
    canCheckin: boolean,
  ): void {
    const x = GAME_WIDTH / 2;
    const y = 140;
    const w = 760;
    const h = 118;
    const bg = this.add.rectangle(x, y, w, h, PANEL_BG, PANEL_BG_ALPHA);
    bg.setStrokeStyle(3, PANEL_BORDER);
    group.add(bg);

    const nextDay = canCheckin ? nextCheckinDay(snapshot) : snapshot.checkinStreak;
    const vipText = PlayerState.isVip() ? '当前身份：VIP 已解锁' : '当前身份：普通玩家';
    group.add(
      this.add
        .text(x - w / 2 + 24, y - 32, `${vipText}  ·  连续签到 ${snapshot.checkinStreak} 天`, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '22px',
          color: '#fff4a8',
          stroke: '#1b1b3a',
          strokeThickness: 4,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );
    group.add(
      this.add
        .text(
          x - w / 2 + 24,
          y + 8,
          canCheckin
            ? `今日可签到：第 ${nextDay} 天奖励正在等待领取。`
            : '今日已经签到，明天继续保持连续奖励。',
          {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '16px',
            color: '#dff8ff',
            wordWrap: { width: 500 },
          },
        )
        .setOrigin(0, 0.5),
    );

    const button = this.add
      .text(x + w / 2 - 120, y, canCheckin ? '今日签到' : '已签到', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '22px',
        color: canCheckin ? '#1b1b3a' : '#cccccc',
        stroke: BUTTON_STROKE,
        strokeThickness: 3,
        backgroundColor: canCheckin ? BUTTON_READY_BG : BUTTON_DISABLED_BG,
        padding: { left: 18, right: 18, top: 9, bottom: 9 },
        fontStyle: 'bold',
        fixedWidth: 150,
        align: 'center',
      })
      .setOrigin(0.5);
    if (canCheckin) {
      button.setInteractive({ useHandCursor: true });
      button.on('pointerover', () => button.setColor('#ff3b9a'));
      button.on('pointerout', () => button.setColor('#1b1b3a'));
      button.on('pointerup', () => this.onCheckin());
    }
    group.add(button);
  }

  private drawRewardCalendar(
    group: Phaser.GameObjects.Container,
    snapshot: VipSnapshot,
    canCheckin: boolean,
  ): void {
    const startX = 96;
    const topY = 236;
    const cardW = 106;
    const cardH = 142;
    const gap = 16;
    const nextDay = canCheckin ? nextCheckinDay(snapshot) : snapshot.checkinStreak;

    for (const day of SPECIAL_REWARD_DAYS) {
      const idx = day - 1;
      const x = startX + idx * (cardW + gap);
      const isPast = day <= snapshot.checkinStreak && !canCheckin;
      const isCurrent = day === nextDay && canCheckin;
      const reward = rewardPreview(day, PlayerState.isVip());
      const bg = this.add.rectangle(x, topY, cardW, cardH, isCurrent ? 0xffb84d : 0xfffbdf, 0.96);
      bg.setOrigin(0, 0);
      bg.setStrokeStyle(3, isCurrent ? 0xffffff : 0x2d91c8);
      group.add(bg);
      group.add(
        this.add
          .text(x + cardW / 2, topY + 12, `第 ${day} 天`, {
            fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
            fontSize: '18px',
            color: isCurrent ? '#ffffff' : '#174a6b',
            stroke: isCurrent ? '#8a4a00' : '#ffffff',
            strokeThickness: 3,
            fontStyle: 'bold',
          })
          .setOrigin(0.5, 0),
      );
      group.add(
        this.add
          .text(x + 10, topY + 46, reward, {
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontSize: '13px',
            color: '#2d5a70',
            wordWrap: { width: cardW - 20 },
            align: 'center',
          })
          .setOrigin(0, 0),
      );
      if (isPast) {
        group.add(
          this.add
            .text(x + cardW / 2, topY + cardH - 18, '已领', {
              fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
              fontSize: '16px',
              color: '#2f9d67',
              stroke: '#ffffff',
              strokeThickness: 3,
            })
            .setOrigin(0.5),
        );
      }
    }
  }

  private drawPerks(group: Phaser.GameObjects.Container): void {
    const x = GAME_WIDTH / 2;
    const y = 444;
    const w = 760;
    const h = 118;
    const bg = this.add.rectangle(x, y, w, h, PANEL_BG, PANEL_BG_ALPHA);
    bg.setStrokeStyle(3, PlayerState.isVip() ? 0xffd93d : 0x6fa7c8);
    group.add(bg);
    group.add(
      this.add
        .text(x - w / 2 + 24, y - 34, 'VIP 特权', {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '22px',
          color: PlayerState.isVip() ? '#ffd93d' : '#b8c5cf',
          stroke: '#1b1b3a',
          strokeThickness: 4,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );
    group.add(
      this.add
        .text(
          x - w / 2 + 24,
          y + 6,
          '第 3 天签到解锁：经验 1.5 倍、金币 1.5 倍、商店 9 折、彩虹殿堂、会员精灵补发、野外稀有加成。',
          {
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontSize: '16px',
            color: '#dff8ff',
            wordWrap: { width: 560 },
          },
        )
        .setOrigin(0, 0.5),
    );
    const hall = this.add
      .text(x + w / 2 - 126, y + 4, PlayerState.isVip() ? '进入彩虹殿堂' : '第 3 天解锁', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: PlayerState.isVip() ? '#1b1b3a' : '#cccccc',
        stroke: BUTTON_STROKE,
        strokeThickness: 3,
        backgroundColor: PlayerState.isVip() ? BUTTON_READY_BG : BUTTON_DISABLED_BG,
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        fixedWidth: 170,
        align: 'center',
      })
      .setOrigin(0.5);
    if (PlayerState.isVip()) {
      hall.setInteractive({ useHandCursor: true });
      hall.on('pointerup', () => this.scene.start(SceneKey.RAINBOW_HALL));
    }
    group.add(hall);
  }

  private onCheckin(): void {
    const snapshot = PlayerState.getVipSnapshot();
    const result = VipSystem.computeCheckin(snapshot, PlayerState.isVip(), new Date(), Math.random);
    if (!result.canCheckin) {
      this.showToast('今日已经签到，明天再来吧。');
      return;
    }

    PlayerState.setCheckinState(result.next);
    const reward = this.applyRichReward(result.next.checkinStreak);
    this.showToast(`签到成功！${formatRichReward(reward)}`, 2800);
    this.rebuildContent();
  }

  private applyRichReward(streak: number): RichCheckinReward {
    const day = normalizeRewardDay(streak);
    const reward = buildRewardForDay(day, PlayerState.isVip());
    PlayerState.addCoins(reward.coins);
    for (const [itemId, qty] of Object.entries(reward.items)) {
      if (qty > 0) PlayerState.addItem(itemId, qty);
    }

    let petReward: RichCheckinReward['pet'];
    if (day === 1) {
      const petId = pickWildCheckinPet();
      if (petId) {
        const pp = makeLevelPet(petId, CHECKIN_PET_LEVEL);
        if (pp) {
          petReward = {
            petId,
            level: CHECKIN_PET_LEVEL,
            placement: PlayerState.addPlayerPet(pp),
          };
        }
      }
    }

    let vipUnlocked = false;
    if (day === 3 && !PlayerState.isVip()) {
      PlayerState.grantVip();
      grantVipMemberPets();
      vipUnlocked = true;
    }

    return { ...reward, vipUnlocked, ...(petReward ? { pet: petReward } : {}) };
  }

  private showToast(message: string, durationMs = 1800): void {
    this.clearToast();
    const toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, message, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        wordWrap: { width: 820 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2100);
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

function nextCheckinDay(snapshot: VipSnapshot): number {
  return normalizeRewardDay(snapshot.checkinStreak + 1);
}

function normalizeRewardDay(streak: number): number {
  return ((Math.max(1, streak) - 1) % 7) + 1;
}

function rewardPreview(day: number, isVip: boolean): string {
  if (day === 1) return '随机 Lv15 野生精灵\n金币 +1000\n高级球 x3';
  if (day === 2) return '金币 +1200\n经验蛋糕 x2\n元素果实 x3';
  if (day === 3) return isVip ? '大师球 x1\n光系果实 x3\n金币 +1600' : '解锁 VIP\n会员精灵\n大师球 x1';
  if (day === 7) return '金币 +2600\n大师球 x2\n天使宝箱 x3';
  return `金币 +${1000 + day * 180}\n高级球 x${day}\n大伤药 x${day}`;
}

function buildRewardForDay(day: number, isVip: boolean): CheckinReward {
  const vipBonus = isVip ? 500 : 0;
  const baseItems: Record<string, number> = {
    pokeball_great: 3,
    potion_large: 2,
    exp_candy: 2,
    gold_shell: 2,
  };

  if (day === 1) {
    return {
      coins: 1000 + vipBonus,
      items: { ...baseItems, pokeball_ultra: 3, exp_cake: 1 },
    };
  }
  if (day === 2) {
    return {
      coins: 1200 + vipBonus,
      items: {
        ...baseItems,
        exp_cake: 2,
        element_fruit_fire: 1,
        element_fruit_water: 1,
        element_fruit_grass: 1,
      },
    };
  }
  if (day === 3) {
    return {
      coins: 1600 + vipBonus,
      items: {
        ...baseItems,
        pokeball_master: 1,
        element_fruit_light: 3,
        exp_cake: 2,
      },
    };
  }
  if (day === 7) {
    return {
      coins: 2600 + vipBonus,
      items: {
        ...baseItems,
        pokeball_master: 2,
        angel_chest: 3,
        exp_cake: 3,
        element_fruit_light: 3,
      },
    };
  }
  return {
    coins: 1000 + day * 180 + vipBonus,
    items: {
      ...baseItems,
      pokeball_ultra: day,
      potion_revive: 1,
      exp_cake: 1,
    },
  };
}

function pickWildCheckinPet(): string | null {
  const candidates = WILD_CHECKIN_PET_IDS.filter((petId) => !PlayerState.hasPet(petId));
  const pool = candidates.length > 0 ? candidates : WILD_CHECKIN_PET_IDS;
  if (pool.length <= 0) return null;
  const index = Phaser.Math.Between(0, pool.length - 1);
  return pool[index] ?? null;
}

function makeLevelPet(petId: string, level: number): PlayerPet | null {
  const pet = PETS[petId];
  if (!pet) return null;
  return createPlayerPet(pet, level, { evolutionStage: 0 });
}

function formatRichReward(reward: RichCheckinReward): string {
  const base = formatReward({ coins: reward.coins, items: reward.items });
  const extras: string[] = [base];
  if (reward.pet) {
    const name = PETS[reward.pet.petId]?.name ?? reward.pet.petId;
    extras.push(
      reward.pet.placement === 'duplicate'
        ? `${name} 已拥有，精灵奖励跳过重复`
        : `${name} Lv${reward.pet.level} 已${reward.pet.placement === 'party' ? '加入队伍' : '进入仓库'}`,
    );
  }
  if (reward.vipUnlocked) {
    extras.push('VIP 已解锁，会员精灵已补发');
  }
  return extras.join('，');
}

export function formatReward(reward: CheckinReward): string {
  const parts: string[] = [];
  if (reward.coins > 0) parts.push(`金币 +${reward.coins}`);
  for (const [itemId, qty] of Object.entries(reward.items)) {
    if (qty <= 0) continue;
    const name = ITEMS[itemId]?.name ?? itemId;
    parts.push(`${name} x${qty}`);
  }
  return parts.length === 0 ? '无奖励' : parts.join('，');
}
