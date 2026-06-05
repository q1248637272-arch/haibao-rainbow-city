import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { getBoss } from '@/data/bosses';
import { ELEMENT_LABEL_CN } from '@/data/elements';
import { getPet } from '@/data/pets';
import { SKILLS } from '@/data/skills';
import { AudioManager } from '@/systems/AudioManager';
import { gameEvents } from '@/systems/EventBus';
import { evolvedPetName, evolutionLabel, nextEvolutionLevel } from '@/systems/EvolutionSystem';
import {
  GYM_BADGE_CALIBRATION_DAILY_CLAIM_ID,
  GYM_BADGE_CALIBRATION_MINIGAME_ID,
  GYM_BADGE_CALIBRATION_SEQUENCE,
  GYM_BADGE_CALIBRATION_SOURCE,
  gymBadgeCalibrationRewardForScore,
  isGymBadgeCalibrationSuccess,
  scoreGymBadgeCalibration,
  type GymBadgePadId,
} from '@/systems/GymBadgeCalibration';
import { expToNext } from '@/systems/LevelCurve';
import { PlayerState } from '@/systems/PlayerState';
import { preloadGymAssets } from '@/systems/SceneAssetPreloader';
import { grantVipMemberPets } from '@/systems/VipRewards';
import { createAutoScrollText } from '@/ui/AutoScrollText';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createPortalFlash } from '@/ui/PortalFlash';
import type { PlayerPet } from '@/types';
import { ensureBossTexture } from '@/utils/placeholder';
import { ensurePlayerPetTexture } from '@/utils/playerPetTexture';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

type PetShelf = 'party' | 'storage';

const VIP_BOSS_ID = 'shadow_overlord';
const VIP_PET_ID = 'rainbow_wing';
const GYM_DAILY_SAVE_KEY = 'hbcc:gym-daily:v1';
const ROSTER_PAGE_SIZE = 6;
const LEGACY_TRAINING_CLAIM_ID = 'training';

const BADGE_PADS: ReadonlyArray<{
  readonly id: GymBadgePadId;
  readonly label: string;
  readonly color: number;
  readonly x: number;
  readonly y: number;
}> = [
  { id: 'water', label: '水纹', color: 0x38c9ff, x: 296, y: 410 },
  { id: 'grass', label: '叶脉', color: 0x63d668, x: 480, y: 426 },
  { id: 'fire', label: '火印', color: 0xff7c45, x: 664, y: 410 },
];

export class GymScene extends Phaser.Scene {
  private selectedPetId: string | null = null;
  private shelf: PetShelf = 'party';
  private page = 0;
  private rosterLayer: Phaser.GameObjects.Container | null = null;
  private stageLayer: Phaser.GameObjects.Container | null = null;
  private actionLayer: Phaser.GameObjects.Container | null = null;
  private trainingLayer: Phaser.GameObjects.Container | null = null;
  private trainingStep = 0;
  private trainingFocus = 3;
  private trainingHits = 0;
  private trainingStatusText: Phaser.GameObjects.Text | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private pendingToast: string | null = null;

  public constructor() {
    super({ key: SceneKey.GYM });
  }

  public preload(): void {
    preloadGymAssets(this);
  }

  public init(data?: { readonly justWonBossId?: string }): void {
    this.pendingToast = data?.justWonBossId ? '道馆徽章已经点亮，馆主挑战记录完成。' : null;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.shelf = 'party';
    this.page = 0;
    const firstPet = PlayerState.snapshot().playerPets[0];
    this.selectedPetId = firstPet ? playerPetKey(firstPet) : null;

    this.drawBackground();
    this.drawTopBar();
    this.refreshAll();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.rosterLayer?.destroy();
      this.stageLayer?.destroy();
      this.actionLayer?.destroy();
      this.trainingLayer?.destroy();
      this.clearToast();
    });

    AudioManager.play('world_rainbow', undefined, this);
    if (this.pendingToast) {
      this.showToast(this.pendingToast, 2400);
    }
  }

  private drawBackground(): void {
    if (this.textures.exists('legacy_gym_badge_dojo')) {
      createResponsiveMapBackground(this, 'legacy_gym_badge_dojo');
    } else if (this.textures.exists('legacy_gym_hall')) {
      createResponsiveMapBackground(this, 'legacy_gym_hall');
    } else {
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR).setOrigin(0);
    }
    this.add.rectangle(0, 0, GAME_WIDTH, 82, 0x07345f, 0.58).setOrigin(0);
    this.add.rectangle(0, GAME_HEIGHT - 72, GAME_WIDTH, 72, 0x07345f, 0.3).setOrigin(0);

    this.add
      .text(GAME_WIDTH / 2, 42, '徽章道馆', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '34px',
        color: '#fff4a8',
        stroke: '#123767',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(20);
  }

  private drawTopBar(): void {
    this.createNavButton(54, 40, '返回', () => this.scene.start(SceneKey.WORLD));
    this.createNavButton(128, 40, '地图', () =>
      this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.GYM }),
    );
    this.createNavButton(202, 40, '精灵', () =>
      this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.GYM }),
    );
    this.createNavButton(276, 40, '家园', () =>
      this.scene.start(SceneKey.HOME, { fromScene: SceneKey.GYM }),
    );
    this.createNavButton(350, 40, '背包', () =>
      this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.GYM }),
    );
  }

  private refreshAll(): void {
    this.refreshRoster();
    this.refreshStage();
    this.refreshActions();
  }

  private refreshRoster(): void {
    this.rosterLayer?.destroy();
    this.rosterLayer = this.add.container(0, 0).setDepth(40);

    const x = 34;
    const y = 104;
    const w = 302;
    const h = 472;
    this.drawPanel(this.rosterLayer, x, y, w, h, '精灵阵容');
    this.createTab(this.rosterLayer, x + 34, y + 52, '队伍', 'party');
    this.createTab(this.rosterLayer, x + 116, y + 52, '仓库', 'storage');

    const pets = this.currentShelfPets();
    const maxPage = Math.max(0, Math.ceil(pets.length / ROSTER_PAGE_SIZE) - 1);
    this.page = Phaser.Math.Clamp(this.page, 0, maxPage);

    if (pets.length === 0) {
      this.rosterLayer.add(
        this.add
          .text(
            x + w / 2,
            y + 230,
            this.shelf === 'party' ? '队伍里还没有精灵。' : '仓库是空的。',
            {
              fontFamily: 'Microsoft YaHei, sans-serif',
              fontSize: '18px',
              color: '#31566c',
            },
          )
          .setOrigin(0.5),
      );
    } else {
      pets
        .slice(this.page * ROSTER_PAGE_SIZE, this.page * ROSTER_PAGE_SIZE + ROSTER_PAGE_SIZE)
        .forEach((pet, index) => this.drawPetRow(pet, x + 22, y + 94 + index * 54));
    }

    this.createSmallButton(this.rosterLayer, x + 74, y + h - 30, '上一页', this.page <= 0, () => {
      this.page = Math.max(0, this.page - 1);
      this.refreshRoster();
    });
    this.rosterLayer.add(
      this.add
        .text(x + 151, y + h - 30, `${this.page + 1}/${maxPage + 1}`, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '14px',
          color: '#31566c',
        })
        .setOrigin(0.5),
    );
    this.createSmallButton(
      this.rosterLayer,
      x + 228,
      y + h - 30,
      '下一页',
      this.page >= maxPage,
      () => {
        this.page = Math.min(maxPage, this.page + 1);
        this.refreshRoster();
      },
    );
  }

  private refreshStage(): void {
    this.stageLayer?.destroy();
    this.stageLayer = this.add.container(0, 0).setDepth(35);

    const arenaFlash = createPortalFlash(this, GAME_WIDTH / 2, 438, {
      radius: 72,
      depth: 32,
      color: 0x8fe8ff,
      yScale: 0.42,
    });
    this.stageLayer.add(arenaFlash);

    for (const pad of BADGE_PADS) {
      const ring = this.add
        .ellipse(pad.x, pad.y, 120, 42, pad.color, 0.2)
        .setStrokeStyle(2, pad.color, 0.72);
      this.stageLayer.add(ring);
    }

    const boss = getBoss(VIP_BOSS_ID);
    if (boss) {
      const bossImage = this.add
        .image(585, 354, ensureBossTexture(this, boss.id))
        .setDisplaySize(152, 152)
        .setDepth(42);
      this.stageLayer.add(bossImage);
      this.stageLayer.add(
        this.add
          .text(585, 458, boss.name, {
            fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
            fontSize: '20px',
            color: '#fff4a8',
            stroke: '#1b1b3a',
            strokeThickness: 4,
          })
          .setOrigin(0.5),
      );
    }

    const selected = this.selectedPet();
    if (selected) {
      const pet = getPet(selected.petId);
      const name = pet ? evolvedPetName(pet, selected) : selected.petId;
      this.stageLayer.add(
        this.add.image(414, 372, ensurePlayerPetTexture(this, selected)).setDisplaySize(116, 116),
      );
      createAutoScrollText({
        scene: this,
        layer: this.stageLayer,
        x: 324,
        y: 458,
        width: 180,
        height: 28,
        text: `${name} Lv${selected.level}`,
        style: {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '19px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 4,
        },
      });
    } else {
      this.stageLayer.add(
        this.add
          .text(414, 372, '未选择精灵', {
            fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
            fontSize: '22px',
            color: '#ffffff',
            stroke: '#1b1b3a',
            strokeThickness: 4,
          })
          .setOrigin(0.5),
      );
    }

    this.stageLayer.add(
      this.add
        .text(GAME_WIDTH / 2, 366, 'VS', {
          fontFamily: 'Arial Black, Microsoft YaHei, sans-serif',
          fontSize: '34px',
          color: '#ffef7a',
          stroke: '#7a2d7c',
          strokeThickness: 6,
        })
        .setOrigin(0.5),
    );
  }

  private refreshActions(): void {
    this.actionLayer?.destroy();
    this.actionLayer = this.add.container(0, 0).setDepth(40);

    const x = 624;
    const y = 96;
    const w = 302;
    const h = 516;
    this.drawPanel(this.actionLayer, x, y, w, h, '道馆挑战');

    const selected = this.selectedPet();
    const boss = getBoss(VIP_BOSS_ID);
    const badgeReady = PlayerState.hasDefeatedBoss(VIP_BOSS_ID);
    const trainingDone = this.hasClaimedTrainingToday();
    const statusText = badgeReady ? '徽章：已点亮' : '徽章：未点亮';
    this.actionLayer.add(
      this.add.text(x + 24, y + 56, statusText, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: badgeReady ? '#1d7d48' : '#8a4a00',
        stroke: '#ffffff',
        strokeThickness: 3,
      }),
    );

    if (boss) {
      this.actionLayer.add(
        this.add.text(
          x + 24,
          y + 92,
          `${boss.name}\n${ELEMENT_LABEL_CN[boss.element]}系  生命 ${boss.stats.hp}\n奖励 ${boss.rewardCoins} 彩虹币`,
          {
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontSize: '15px',
            color: '#31566c',
            lineSpacing: 7,
          },
        ),
      );
    }

    const selectedLine = selected ? this.formatSelectedDetail(selected) : '请在左侧选择出战精灵。';
    this.actionLayer.add(
      this.add.text(x + 24, y + 180, selectedLine, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#31566c',
        lineSpacing: 5,
        wordWrap: { width: 246 },
      }),
    );

    this.createActionButton(x + w / 2, y + 284, '馆主挑战', !selected, () =>
      this.onChallengeBoss(),
    );
    this.createActionButton(
      x + w / 2,
      y + 330,
      trainingDone ? '校准已完成' : '徽章校准',
      !selected || trainingDone,
      () => this.onTrainingTrial(),
    );
    this.createActionButton(
      x + w / 2,
      y + 376,
      '净化试炼',
      PlayerState.getItemCount('crystal_shard') < 1,
      () => this.onPurifyTrial(),
    );
    this.createActionButton(x + w / 2, y + 422, '馆内恢复', false, () => this.onHealAll());

    if (!PlayerState.isVip()) {
      this.createActionButton(x + w / 2, y + 468, '领取彩虹光翼', false, () => this.onClaimVip());
    }
  }

  private drawPanel(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(0xeaf9ff, 0.92);
    g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(3, 0x3aa8d8, 0.92);
    g.strokeRoundedRect(x, y, w, h, 8);
    g.fillStyle(0x1599c8, 0.96);
    g.fillRoundedRect(x + 12, y + 12, w - 24, 34, 8);
    layer.add(g);
    layer.add(
      this.add
        .text(x + w / 2, y + 29, title, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '20px',
          color: '#ffffff',
          stroke: '#15426d',
          strokeThickness: 3,
        })
        .setOrigin(0.5),
    );
  }

  private createTab(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    shelf: PetShelf,
  ): void {
    const active = this.shelf === shelf;
    const g = this.add.graphics();
    g.fillStyle(active ? 0xffd35a : 0xffffff, 0.95);
    g.lineStyle(2, active ? 0xf08c00 : 0x63b9d2, 0.95);
    g.fillRoundedRect(x, y, 70, 30, 7);
    g.strokeRoundedRect(x, y, 70, 30, 7);
    layer.add(g);
    layer.add(
      this.add
        .text(x + 35, y + 15, label, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: active ? '#7b4200' : '#1b6fa8',
          stroke: '#ffffff',
          strokeThickness: 3,
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .zone(x + 35, y + 15, 70, 30)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.shelf = shelf;
          this.page = 0;
          this.refreshRoster();
        }),
    );
  }

  private drawPetRow(owned: PlayerPet, x: number, y: number): void {
    if (!this.rosterLayer) return;
    const pet = getPet(owned.petId);
    const selected = playerPetKey(owned) === this.selectedPetId;
    const g = this.add.graphics();
    g.fillStyle(selected ? 0xfff3a7 : 0xffffff, 0.95);
    g.lineStyle(2, selected ? 0xf08c00 : 0x8fd5e8, 0.94);
    g.fillRoundedRect(x, y, 258, 46, 7);
    g.strokeRoundedRect(x, y, 258, 46, 7);
    this.rosterLayer.add(g);

    this.rosterLayer.add(
      this.add.image(x + 28, y + 24, ensurePlayerPetTexture(this, owned)).setDisplaySize(38, 38),
    );
    createAutoScrollText({
      scene: this,
      layer: this.rosterLayer,
      x: x + 56,
      y: y + 18,
      width: 182,
      height: 22,
      text: pet ? evolvedPetName(pet, owned) : owned.petId,
      style: {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#1b5f7c',
      },
    });
    this.rosterLayer.add(
      this.add.text(
        x + 56,
        y + 28,
        `Lv${owned.level}  ${owned.currentHp}/${owned.currentStats.hp}`,
        {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '12px',
          color: '#4b6d78',
        },
      ),
    );
    this.rosterLayer.add(
      this.add
        .zone(x + 129, y + 23, 258, 46)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.selectedPetId = playerPetKey(owned);
          this.refreshAll();
        }),
    );
  }

  private createActionButton(
    x: number,
    y: number,
    label: string,
    disabled: boolean,
    onClick: () => void,
  ): void {
    if (!this.actionLayer) return;
    const g = this.add.graphics();
    g.fillStyle(disabled ? 0xb8c5cf : 0xff9f2f, 0.98);
    g.lineStyle(2, 0xffffff, 0.95);
    g.fillRoundedRect(x - 92, y - 17, 184, 34, 7);
    g.strokeRoundedRect(x - 92, y - 17, 184, 34, 7);
    this.actionLayer.add(g);
    this.actionLayer.add(
      this.add
        .text(x, y, label, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#ffffff',
          stroke: disabled ? '#5f6d77' : '#8a4a00',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setAlpha(disabled ? 0.75 : 1),
    );
    if (disabled) return;
    this.actionLayer.add(
      this.add.zone(x, y, 184, 34).setInteractive({ useHandCursor: true }).on('pointerup', onClick),
    );
  }

  private createSmallButton(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    disabled: boolean,
    onClick: () => void,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(disabled ? 0xc9d7de : 0x67c6ee, 0.95);
    g.lineStyle(2, 0xffffff, 0.94);
    g.fillRoundedRect(x - 47, y - 15, 94, 30, 6);
    g.strokeRoundedRect(x - 47, y - 15, 94, 30, 6);
    layer.add(g);
    layer.add(
      this.add
        .text(x, y, label, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '12px',
          color: '#ffffff',
          stroke: '#1b6fa8',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setAlpha(disabled ? 0.68 : 1),
    );
    if (disabled) return;
    layer.add(
      this.add.zone(x, y, 94, 30).setInteractive({ useHandCursor: true }).on('pointerup', onClick),
    );
  }

  private createNavButton(x: number, y: number, label: string, onClick: () => void): void {
    createNavIconButton(this, {
      x,
      y,
      label,
      onClick,
      depth: 90,
      width: label.length >= 3 ? 78 : 66,
      height: 50,
    });
  }

  private currentShelfPets(): readonly PlayerPet[] {
    return this.shelf === 'party' ? PlayerState.snapshot().playerPets : PlayerState.getPetStorage();
  }

  private selectedPet(): PlayerPet | undefined {
    if (!this.selectedPetId) return undefined;
    return (
      PlayerState.getPlayerPetByInstanceId(this.selectedPetId) ??
      PlayerState.getPlayerPet(this.selectedPetId)
    );
  }

  private formatSelectedDetail(owned: PlayerPet): string {
    const pet = getPet(owned.petId);
    if (!pet) return owned.petId;
    const skills = owned.learnedSkillIds
      .slice(0, 4)
      .map((id) => SKILLS[id]?.name ?? id)
      .join(' / ');
    const nextEvoLevel = nextEvolutionLevel(owned);
    const evoLine =
      nextEvoLevel === null
        ? '进化：完全体'
        : owned.level >= nextEvoLevel
          ? '进化：可进化'
          : `进化：Lv${nextEvoLevel}`;
    return `${evolvedPetName(pet, owned)}  ${ELEMENT_LABEL_CN[pet.element]}系\n${evolutionLabel(
      owned,
    )}  ${evoLine}\n经验 ${owned.exp}/${expToNext(owned.level)}\n技能 ${skills}`;
  }

  private onChallengeBoss(): void {
    const selected = this.selectedPet();
    if (!selected) {
      this.showToast('先选择一只出战精灵。');
      return;
    }
    if (selected.currentHp <= 0) {
      PlayerState.healPet(playerPetKey(selected));
    }
    PlayerState.setActivePet(playerPetKey(selected));
    this.scene.start(SceneKey.BATTLE_INTRO, {
      mode: 'boss',
      petId: selected.petId,
      bossId: VIP_BOSS_ID,
      fromScene: SceneKey.GYM,
    });
  }

  private onTrainingTrial(): void {
    const selected = this.selectedPet();
    if (!selected) {
      this.showToast('先选择一只训练精灵。');
      return;
    }
    if (this.hasClaimedTrainingToday()) {
      this.showToast('今天的徽章校准已经完成。');
      return;
    }
    this.openBadgeCalibrationTrial();
  }

  private openBadgeCalibrationTrial(): void {
    const selected = this.selectedPet();
    if (!selected) return;

    this.trainingLayer?.destroy();
    this.trainingStep = 0;
    this.trainingFocus = 3;
    this.trainingHits = 0;

    const layer = this.add.container(0, 0).setDepth(900);
    this.trainingLayer = layer;
    layer.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x031625, 0.62).setOrigin(0));

    const panel = this.add.graphics();
    panel.fillStyle(0xeefcff, 0.96);
    panel.fillRoundedRect(182, 92, 596, 420, 8);
    panel.lineStyle(4, 0x58d7ff, 0.95);
    panel.strokeRoundedRect(182, 92, 596, 420, 8);
    panel.fillStyle(0x0b82ba, 0.96);
    panel.fillRoundedRect(204, 112, 552, 48, 8);
    layer.add(panel);

    layer.add(
      this.add
        .text(GAME_WIDTH / 2, 136, '徽章校准', {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '26px',
          color: '#ffffff',
          stroke: '#07345f',
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .text(
          GAME_WIDTH / 2,
          196,
          '按提示依次点亮训练台。点错会消耗专注，完成后结算今日训练奖励。',
          {
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontSize: '17px',
            color: '#225875',
            wordWrap: { width: 500 },
            align: 'center',
          },
        )
        .setOrigin(0.5),
    );

    this.trainingStatusText = this.add
      .text(GAME_WIDTH / 2, 242, '', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#103c5c',
      })
      .setOrigin(0.5);
    layer.add(this.trainingStatusText);

    for (const pad of BADGE_PADS) {
      this.createCalibrationPadButton(layer, pad);
    }

    this.createCalibrationCloseButton(layer, GAME_WIDTH / 2, 474, '返回道馆', () => {
      this.trainingLayer?.destroy();
      this.trainingLayer = null;
      this.trainingStatusText = null;
    });
    this.updateBadgeCalibrationStatus();
  }

  private createCalibrationPadButton(
    layer: Phaser.GameObjects.Container,
    pad: (typeof BADGE_PADS)[number],
  ): void {
    const g = this.add.graphics();
    g.fillStyle(pad.color, 0.9);
    g.fillRoundedRect(pad.x - 74, pad.y - 42, 148, 84, 8);
    g.lineStyle(3, 0xffffff, 0.95);
    g.strokeRoundedRect(pad.x - 74, pad.y - 42, 148, 84, 8);
    layer.add(g);
    layer.add(
      this.add
        .text(pad.x, pad.y, pad.label, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '22px',
          color: '#ffffff',
          stroke: '#07345f',
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .zone(pad.x, pad.y, 148, 84)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.handleCalibrationPad(pad.id, g)),
    );
  }

  private handleCalibrationPad(id: GymBadgePadId, target: Phaser.GameObjects.Graphics): void {
    const expected = GYM_BADGE_CALIBRATION_SEQUENCE[this.trainingStep];
    if (!expected) return;

    this.tweens.add({
      targets: target,
      alpha: 0.58,
      yoyo: true,
      duration: 90,
      ease: 'Sine.easeOut',
    });

    if (id === expected) {
      this.trainingHits += 1;
      this.trainingStep += 1;
      if (this.trainingStep >= GYM_BADGE_CALIBRATION_SEQUENCE.length) {
        this.finishBadgeCalibration(true);
        return;
      }
    } else {
      this.trainingFocus -= 1;
      if (this.trainingFocus <= 0) {
        this.finishBadgeCalibration(false);
        return;
      }
    }
    this.updateBadgeCalibrationStatus();
  }

  private updateBadgeCalibrationStatus(): void {
    const expected = GYM_BADGE_CALIBRATION_SEQUENCE[this.trainingStep];
    const label = BADGE_PADS.find((pad) => pad.id === expected)?.label ?? '完成';
    const score = scoreGymBadgeCalibration(this.trainingHits, this.trainingFocus);
    this.trainingStatusText?.setText(
      `下一步：${label}  进度 ${this.trainingStep}/${GYM_BADGE_CALIBRATION_SEQUENCE.length}  专注 ${this.trainingFocus}  评分 ${score}`,
    );
  }

  private finishBadgeCalibration(completed: boolean): void {
    const score = scoreGymBadgeCalibration(this.trainingHits, this.trainingFocus);
    const success = completed && isGymBadgeCalibrationSuccess(this.trainingHits, this.trainingFocus);
    gameEvents.emit('minigame:complete', {
      minigameId: GYM_BADGE_CALIBRATION_MINIGAME_ID,
      score,
    });

    this.trainingLayer?.destroy();
    this.trainingLayer = null;
    this.trainingStatusText = null;

    if (!success) {
      this.showToast('校准中断，专注耗尽后可重新挑战。', 2200);
      return;
    }

    const selected = this.selectedPet();
    if (!selected) return;
    const reward = gymBadgeCalibrationRewardForScore(score);
    const result = PlayerState.gainExp(playerPetKey(selected), reward.exp);
    PlayerState.addCoins(reward.coins);
    if (reward.potentialSeeds > 0) {
      PlayerState.addItem('potential_seed', reward.potentialSeeds);
      gameEvents.emit('item:collect', {
        itemId: 'potential_seed',
        quantity: reward.potentialSeeds,
        source: GYM_BADGE_CALIBRATION_SOURCE,
      });
    }

    const claimed = this.claimedToday();
    claimed.add(LEGACY_TRAINING_CLAIM_ID);
    claimed.add(GYM_BADGE_CALIBRATION_DAILY_CLAIM_ID);
    this.writeClaimedToday(claimed);
    this.showToast(
      result?.leveledUp
        ? '校准完成，精灵升级了！'
        : `校准完成，获得 ${reward.exp} 经验和 ${reward.coins} 彩虹币。`,
      2600,
    );
    this.refreshAll();
  }

  private createCalibrationCloseButton(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(0xff9f2f, 0.98);
    g.lineStyle(2, 0xffffff, 0.95);
    g.fillRoundedRect(x - 70, y - 18, 140, 36, 7);
    g.strokeRoundedRect(x - 70, y - 18, 140, 36, 7);
    layer.add(g);
    layer.add(
      this.add
        .text(x, y, label, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#ffffff',
          stroke: '#8a4a00',
          strokeThickness: 3,
        })
        .setOrigin(0.5),
    );
    layer.add(this.add.zone(x, y, 140, 36).setInteractive({ useHandCursor: true }).on('pointerup', onClick));
  }

  private onPurifyTrial(): void {
    if (PlayerState.getItemCount('crystal_shard') < 1) {
      this.showToast('需要 1 个净化水晶。');
      return;
    }
    if (!PlayerState.removeItem('crystal_shard', 1)) return;
    PlayerState.addCoins(80);
    PlayerState.addItem('gold_shell', 1);
    PlayerState.addItem('exp_candy', 1);
    this.showToast('净化试炼完成，奖励已经放进背包。');
    this.refreshActions();
  }

  private onHealAll(): void {
    const pets = [...PlayerState.snapshot().playerPets, ...PlayerState.getPetStorage()];
    pets.forEach((pet) => PlayerState.healPet(playerPetKey(pet)));
    this.showToast('道馆恢复完成，全部精灵满血。');
    this.refreshAll();
  }

  private onClaimVip(): void {
    PlayerState.grantVip();
    grantVipMemberPets();
    const vipPet = PlayerState.getPlayerPet(VIP_PET_ID);
    this.selectedPetId = vipPet ? playerPetKey(vipPet) : VIP_PET_ID;
    this.shelf = 'party';
    this.page = 0;
    this.showToast('VIP 会员精灵已补发到队伍或仓库。', 2400);
    this.refreshAll();
  }

  private claimedToday(): Set<string> {
    try {
      const raw = globalThis.localStorage?.getItem(GYM_DAILY_SAVE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as { date?: string; claimedIds?: string[] };
      if (parsed.date !== todayKey() || !Array.isArray(parsed.claimedIds)) return new Set();
      return new Set(parsed.claimedIds.filter((id) => typeof id === 'string'));
    } catch {
      return new Set();
    }
  }

  private hasClaimedTrainingToday(): boolean {
    const claimed = this.claimedToday();
    return (
      claimed.has(LEGACY_TRAINING_CLAIM_ID) ||
      claimed.has(GYM_BADGE_CALIBRATION_DAILY_CLAIM_ID)
    );
  }

  private writeClaimedToday(claimed: Set<string>): void {
    try {
      globalThis.localStorage?.setItem(
        GYM_DAILY_SAVE_KEY,
        JSON.stringify({ date: todayKey(), claimedIds: [...claimed] }),
      );
    } catch {
      // Ignore private browsing storage failures.
    }
  }

  private showToast(message: string, durationMs = 2000): void {
    this.clearToast();
    this.toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 38, message, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.toastTimer = this.time.delayedCall(durationMs, () => {
      this.toast?.destroy();
      this.toast = null;
      this.toastTimer = null;
    });
  }

  private clearToast(): void {
    if (this.toastTimer) {
      this.toastTimer.remove(false);
      this.toastTimer = null;
    }
    this.toast?.destroy();
    this.toast = null;
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function playerPetKey(owned: PlayerPet): string {
  return owned.instanceId ?? owned.petId;
}
