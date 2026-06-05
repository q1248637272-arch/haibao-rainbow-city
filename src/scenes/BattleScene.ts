import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { resolveBattleBgm } from '@/config/audio';
import { getBoss } from '@/data/bosses';
import { ELEMENT_COLOR, ELEMENT_LABEL_CN, ELEMENT_MATCHUP } from '@/data/elements';
import { getItem } from '@/data/items';
import { getPet } from '@/data/pets';
import { SKILLS } from '@/data/skills';
import {
  type BattleState,
  type Combatant,
  calcDamage,
  computeTurnOrder,
  makeCombatantFromBoss,
  makeCombatantFromPlayerPet,
  makeCombatantFromWild,
  resolveTurn,
} from '@/systems/BattleEngine';
import { calcCaptureRate } from '@/systems/CaptureFormula';
import { computeStats, expOnDefeat, expToNext } from '@/systems/LevelCurve';
import { AudioManager } from '@/systems/AudioManager';
import { evolvedPetName, stageForWildLevel } from '@/systems/EvolutionSystem';
import { gameEvents } from '@/systems/EventBus';
import { createPlayerPet } from '@/systems/PetInstance';
import { effectParticleCount, motionScale } from '@/systems/PerformanceProfile';
import { PlayerState } from '@/systems/PlayerState';
import { preloadBattleAssets } from '@/systems/SceneAssetPreloader';
import { virtualPlayerDisplayName, type VirtualPlayer } from '@/systems/VirtualPlayers';
import { getCoinMultiplier, getExpMultiplier } from '@/systems/VipSystem';
import { spawnFloatingText } from '@/ui/FloatingText';
import { type ExpBarHandle, makeExpBar } from '@/ui/ExpBar';
import { type HealthBarHandle, makeHealthBar } from '@/ui/HealthBar';
import { spawnLevelUpBadge } from '@/ui/LevelUpBadge';
import type { BossData, Element, PetData, PlayerPet, SkillData } from '@/types';
import { ensureBossTexture } from '@/utils/placeholder';
import { ensurePetTextureForStage, ensurePlayerPetTexture } from '@/utils/playerPetTexture';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';
import type { LegacyLocationId } from './LegacyContent';

/**
 * BattleScene 的启动参数。
 *
 * 两种模式：
 *   - `mode: 'boss'`：道馆挑战 BOSS；必须传 `bossId`；胜利后金币 / 勋章结算。
 *   - `mode: 'wild'`：野外遭遇；必须传 `wildPetId` + `wildLevel`；多出一颗"投球"按钮；
 *     `fromScene` 用于战斗结束回到哪张地图（WorldMapScene / BeachScene）。
 */
export interface BattleSceneData {
  mode?: 'boss' | 'wild' | 'trainer';
  /** 我方出战精灵 id（必选）。 */
  petId: string;
  /** BOSS 模式必选。 */
  bossId?: string;
  /** wild 模式必选。 */
  wildPetId?: string;
  /** wild 模式必选。 */
  wildLevel?: number;
  /** trainer 模式：电脑随机生成的虚拟玩家。 */
  trainer?: VirtualPlayer;
  /** wild 模式：战斗结束后回到哪张地图；默认回 WorldMapScene。 */
  fromScene?: string;
  /** 从旧版地点进战斗时，回去仍停留在原地点。 */
  returnLocationId?: string;
}

type Phase = 'IDLE' | 'RESOLVING' | 'END';

const LOG_INTERVAL_MS = 600;
const END_TO_WORLD_MS = 3000;
const CAPTURE_SUCCESS_TO_WORLD_MS = 1200;
const WILD_WIN_TO_WORLD_MS = 1500;

const LOG_LINE_COUNT = 3;
const OLD_BATTLE_BG = 'legacy_17173_1';
const BATTLE_ARENA_BG = 'legacy_battle_arena_image2';
const PREMIUM_BATTLE_ARENA_V2_BG = 'premium_battle_arena_v2_image2';
const PREMIUM_BATTLE_ARENA_BG = 'premium_battle_arena_image2';
const ACTION_BUTTON_HEIGHT = 42;
const ITEM_COMMAND_BUTTON_HEIGHT = 34;

export const BATTLE_HEALING_ITEM_IDS = ['potion_small', 'potion_medium', 'potion_large'] as const;

type BattleHealingItemId = (typeof BATTLE_HEALING_ITEM_IDS)[number];

type ButtonFrameUpdater = (hover: boolean, enabled: boolean) => void;

/**
 * BOSS 没有 level 字段，这里给一个"等效等级"常量供 expOnDefeat 的 wildLevel 入参。
 */
const BOSS_EQUIVALENT_LEVEL = 10;
const NO_MONEY_MEAL_SKILL_ID = 'no_money_meal';
const RANDOM_TELEPORT_LOCATIONS: readonly LegacyLocationId[] = [
  'center',
  'library',
  'magic_school',
  'lab',
  'maze',
  'doll_base',
  'energy_field',
  'energy_cave',
  'spaceship',
  'casino',
  'bath_center',
];

const ELEMENT_FRUIT_ITEM_ID: Record<Element, string> = {
  fire: 'element_fruit_fire',
  water: 'element_fruit_water',
  grass: 'element_fruit_grass',
  electric: 'element_fruit_electric',
  normal: 'element_fruit_normal',
  light: 'element_fruit_light',
};

function elementFruitItemId(element: Element): string {
  return ELEMENT_FRUIT_ITEM_ID[element];
}

/**
 * 回合制战斗场景。
 *
 * 状态机：IDLE（等玩家选技能）→ RESOLVING（播放 log + tween + floating text）→ IDLE 或 END。
 * wild 模式下额外支持「投球」动作：消耗 1 颗精灵球，按 `calcCaptureRate` 判定：
 *   - 成功 → addPlayerPet + 延迟 1200ms 回 fromScene 并附 justCapturedPetId；
 *   - 失败 → 推一条"精灵球晃了晃又掉出来了！"的日志；野生本回合仍随机用一技能打你，然后回到 IDLE。
 */
export class BattleScene extends Phaser.Scene {
  private mode: 'boss' | 'wild' | 'trainer' = 'boss';
  private ctxPetId: string = '';
  private ctxBossId: string | null = null;
  private ctxWildPetId: string | null = null;
  private ctxWildLevel: number = 1;
  private fromScene: string = SceneKey.WORLD;
  private returnLocationId: string | null = null;

  private pet!: PetData;
  private playerPet!: PlayerPet;
  private boss: BossData | null = null;
  private wildPet: PetData | null = null;
  private wildLevel: number = 1;
  private trainer: VirtualPlayer | null = null;
  private trainerPet: PetData | null = null;
  private trainerPetLevel: number = 1;

  private state!: BattleState;
  private phase: Phase = 'IDLE';
  private turnIndex = 1;

  // 视觉引用
  private playerSprite!: Phaser.GameObjects.Image;
  private bossSprite!: Phaser.GameObjects.Image;
  private playerBar!: HealthBarHandle;
  private bossBar!: HealthBarHandle;
  private logText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private skillButtons: Phaser.GameObjects.Text[] = [];
  private itemButton: Phaser.GameObjects.Text | null = null;
  private itemPanel: Phaser.GameObjects.Container | null = null;
  private captureButton: Phaser.GameObjects.Text | null = null;
  private escapeButton: Phaser.GameObjects.Text | null = null;
  private resultPanel: Phaser.GameObjects.Container | null = null;
  private expBar: ExpBarHandle | null = null;

  private logBuffer: string[] = [];
  private pendingTimers: Phaser.Time.TimerEvent[] = [];
  private noMoneyMealUsed = false;

  public constructor() {
    super({ key: SceneKey.BATTLE });
  }

  public init(data: BattleSceneData): void {
    this.mode = data?.mode ?? 'boss';
    this.ctxPetId = data?.petId ?? '';
    this.ctxBossId = data?.bossId ?? null;
    this.ctxWildPetId = data?.wildPetId ?? null;
    this.ctxWildLevel = Math.max(1, Math.floor(data?.wildLevel ?? 1));
    this.trainer = data?.trainer ?? null;
    this.fromScene = data?.fromScene ?? SceneKey.WORLD;
    this.returnLocationId = data?.returnLocationId ?? null;
    this.noMoneyMealUsed = false;
  }

  public preload(): void {
    const assetData: BattleSceneData = {
      mode: this.mode,
      petId: this.ctxPetId,
    };
    if (this.ctxBossId) assetData.bossId = this.ctxBossId;
    if (this.ctxWildPetId) assetData.wildPetId = this.ctxWildPetId;
    if (this.trainer) assetData.trainer = this.trainer;
    preloadBattleAssets(this, assetData);
  }

  public create(): void {
    const pet = getPet(this.ctxPetId);
    if (!pet) {
      console.warn('[BattleScene] 未知 petId：', this.ctxPetId);
      this.scene.start(this.fromScene);
      return;
    }
    const playerPet = PlayerState.getPlayerPet(pet.id);
    if (!playerPet) {
      console.warn('[BattleScene] 队伍中找不到该精灵：', pet.id);
      this.scene.start(this.fromScene);
      return;
    }
    this.pet = pet;
    this.playerPet = playerPet;

    // 构造对手 combatant：boss / wild 两种。
    let enemyCombatant: Combatant;
    if (this.mode === 'boss') {
      const boss = getBoss(this.ctxBossId ?? '');
      if (!boss) {
        console.warn('[BattleScene] 未知 bossId：', this.ctxBossId);
        this.scene.start(this.fromScene);
        return;
      }
      this.boss = boss;
      enemyCombatant = makeCombatantFromBoss(boss);
    } else if (this.mode === 'wild') {
      const wildPet = getPet(this.ctxWildPetId ?? '');
      if (!wildPet) {
        console.warn('[BattleScene] wild 模式但找不到 wildPetId：', this.ctxWildPetId);
        this.scene.start(this.fromScene);
        return;
      }
      this.wildPet = wildPet;
      this.wildLevel = this.ctxWildLevel;
      enemyCombatant = makeCombatantFromWild(wildPet, this.wildLevel, computeStats);
    } else {
      const lead = this.trainer?.party[0];
      const trainerPet = getPet(lead?.petId ?? '');
      if (!this.trainer || !lead || !trainerPet) {
        console.warn('[BattleScene] trainer 模式缺少虚拟玩家或首发精灵');
        this.scene.start(this.fromScene);
        return;
      }
      this.trainerPet = trainerPet;
      this.trainerPetLevel = lead.level;
      enemyCombatant = makeCombatantFromPlayerPet(lead, trainerPet);
    }

    this.state = {
      player: makeCombatantFromPlayerPet(playerPet, pet),
      boss: enemyCombatant,
    };
    this.phase = 'IDLE';
    this.turnIndex = 1;
    this.logBuffer = [];
    this.pendingTimers = [];
    this.skillButtons = [];
    this.itemButton = null;
    this.itemPanel = null;
    this.captureButton = null;
    this.escapeButton = null;
    this.resultPanel = null;

    this.drawBackground();
    this.drawPlayer();
    this.drawEnemy();
    this.drawLogPanel();
    this.drawTurnLabel();
    this.drawItemCommandButton();
    this.drawSkillButtons();

    // 战斗 BGM：按战斗双方 id + 对手类型决定 key。
    // - cai_xukun 玩家或敌方 → battle_special_cai_xukun；
    // - rainbow_wing 玩家或敌方 → battle_special_rainbow；
    // - 其余：boss 模式→battle_boss，wild 模式→battle_normal。
    const enemyKind: 'boss' | 'wild' = this.mode === 'boss' ? 'boss' : 'wild';
    const enemyId =
      this.mode === 'boss'
        ? (this.boss?.id ?? null)
        : this.mode === 'trainer'
          ? (this.trainerPet?.id ?? null)
          : (this.wildPet?.id ?? null);
    const bgmKey = resolveBattleBgm(this.pet.id, enemyId, enemyKind);
    AudioManager.play(bgmKey, { fadeMs: 400 }, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.onShutdown());
  }

  // ---- 绘制 --------------------------------------------------------------

  /**
   * 返回当前对手的"通用资料"，方便绘制 / 结算共用。
   */
  private enemyMeta(): { id: string; name: string; element: Element } {
    if (this.mode === 'boss' && this.boss) {
      return { id: this.boss.id, name: this.boss.name, element: this.boss.element };
    }
    if (this.mode === 'wild' && this.wildPet) {
      const suffix = ` Lv${this.wildLevel}`;
      const name = evolvedPetName(this.wildPet, stageForWildLevel(this.wildLevel));
      return {
        id: this.wildPet.id,
        name: `野生 ${name}${suffix}`,
        element: this.wildPet.element,
      };
    }
    if (this.mode === 'trainer' && this.trainer && this.trainerPet) {
      const leadName = evolvedPetName(
        this.trainerPet,
        this.trainer.party[0]?.evolutionStage ?? stageForWildLevel(this.trainerPetLevel),
      );
      const trainerName = virtualPlayerDisplayName(this.trainer);
      return {
        id: this.trainerPet.id,
        name: `${trainerName}的 ${leadName} Lv${this.trainerPetLevel}`,
        element: this.trainerPet.element,
      };
    }
    return { id: 'unknown', name: '未知对手', element: 'normal' };
  }

  private drawBackground(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    if (this.textures.exists(PREMIUM_BATTLE_ARENA_V2_BG)) {
      this.addCoverImage(PREMIUM_BATTLE_ARENA_V2_BG, 0);
    } else if (this.textures.exists(PREMIUM_BATTLE_ARENA_BG)) {
      this.addCoverImage(PREMIUM_BATTLE_ARENA_BG, 0);
    } else if (this.textures.exists(BATTLE_ARENA_BG)) {
      this.addCoverImage(BATTLE_ARENA_BG, 0);
    } else if (this.textures.exists(OLD_BATTLE_BG)) {
      createResponsiveMapBackground(this, OLD_BATTLE_BG, {
        depth: 0,
        stageWidth: 1174,
        stageHeight: GAME_HEIGHT,
      });
    } else {
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x34b4d2, 1).setOrigin(0);
    }

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x00182c, 0.12).setOrigin(0).setDepth(2);
    this.add.rectangle(0, 0, GAME_WIDTH, 96, 0x00243d, 0.2).setOrigin(0).setDepth(3);
    this.drawArenaSparkles();

    this.drawGlassPanel(12, 494, GAME_WIDTH - 24, 132, 0x063a63, 0.78, 0x9cf0ff, 16, 8);
    this.drawGlassPanel(24, 510, 348, 102, 0xe8fbff, 0.88, 0xffffff, 12, 9);
    this.drawGlassPanel(390, 510, 546, 102, 0x083d68, 0.7, 0xa8f2ff, 12, 9);

    this.add
      .text(42, 514, '战斗记录', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#12637e',
        fontStyle: 'bold',
      })
      .setDepth(30);
    this.add
      .text(414, 514, '技能指令', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#d8fbff',
        stroke: '#092e4b',
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setDepth(30);

    const title =
      this.mode === 'wild' ? '野外遭遇！' : this.mode === 'trainer' ? '玩家对战' : '战斗';
    this.drawGlassPanel(GAME_WIDTH - 186, 16, 162, 40, 0x073b66, 0.72, 0xffffff, 12, 28);
    this.add
      .text(GAME_WIDTH - 105, 36, title, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30);
  }

  private addCoverImage(key: string, depth: number): Phaser.GameObjects.Image {
    return createResponsiveMapBackground(this, key, { depth }).stage;
  }

  private drawGlassPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: number,
    alpha: number,
    border: number,
    radius: number,
    depth: number,
  ): Phaser.GameObjects.Graphics {
    const panel = this.add.graphics().setDepth(depth);
    panel.fillStyle(0x00172a, Math.min(0.45, alpha * 0.45));
    panel.fillRoundedRect(x + 4, y + 5, width, height, radius);
    panel.fillStyle(fill, alpha);
    panel.fillRoundedRect(x, y, width, height, radius);
    panel.lineStyle(2, border, 0.84);
    panel.strokeRoundedRect(x, y, width, height, radius);
    panel.fillStyle(0xffffff, 0.16);
    panel.fillRoundedRect(x + 8, y + 7, width - 16, Math.min(20, height - 14), radius - 3);
    return panel;
  }

  private drawArenaSparkles(): void {
    const sparkleData: Array<[number, number, number, number]> = [
      [116, 134, 4, 0.2],
      [214, 92, 3, 0.24],
      [530, 126, 5, 0.18],
      [790, 96, 4, 0.22],
      [874, 184, 3, 0.2],
      [454, 280, 4, 0.16],
    ];
    for (const [x, y, radius, alpha] of sparkleData) {
      const bubble = this.add.circle(x, y, radius, 0xffffff, alpha).setDepth(4);
      bubble.setStrokeStyle(1, 0xa8f2ff, alpha + 0.16);
      this.tweens.add({
        targets: bubble,
        y: y - 10,
        alpha: Math.max(0.04, alpha - 0.1),
        duration: 2200 + x,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private drawBattlePlatform(
    x: number,
    y: number,
    width: number,
    height: number,
    element: Element,
  ): void {
    const color = ELEMENT_COLOR[element] ?? 0xffffff;
    this.add.ellipse(x, y + 9, width * 0.98, height, 0x00182b, 0.24).setDepth(10);
    const aura = this.add.ellipse(x, y, width, height, color, 0.17).setDepth(11);
    aura.setStrokeStyle(2, 0xffffff, 0.42);
    const ring = this.add.ellipse(x, y, width * 0.72, height * 0.58, color, 0).setDepth(12);
    ring.setStrokeStyle(2, color, 0.72);
    this.tweens.add({
      targets: [aura, ring],
      scaleX: 1.05,
      scaleY: 1.08,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawPlayer(): void {
    const texKey = ensurePlayerPetTexture(this, this.playerPet);
    const x = 248;
    const y = 398;
    this.drawBattlePlatform(x, y + 70, 226, 52, this.pet.element);
    this.playerSprite = this.add.image(x, y, texKey).setDisplaySize(140, 140).setDepth(20);

    // 名称加等级标签
    const nameWithLevel = `${this.state.player.name} Lv${this.playerPet.level}`;
    this.drawNameTag(250, 452, nameWithLevel, this.pet.element, 292);

    this.playerBar = makeHealthBar(this, 114, 482, 272, this.state.player.stats.hp);
    this.playerBar.container.setDepth(21);
    this.playerBar.setHp(this.state.player.currentHp);
  }

  /**
   * 绘制对手（BOSS 或野生精灵）。
   */
  private drawEnemy(): void {
    const meta = this.enemyMeta();
    const texKey =
      this.mode === 'boss' && this.boss
        ? ensureBossTexture(this, this.boss.id)
        : ensurePetTextureForStage(
            this,
            meta.id,
            this.mode === 'trainer'
              ? (this.trainer?.party[0]?.evolutionStage ?? stageForWildLevel(this.trainerPetLevel))
              : stageForWildLevel(this.wildLevel),
            this.mode === 'trainer' ? this.trainerPetLevel : this.wildLevel,
          );
    const x = 692;
    const y = 252;
    this.drawBattlePlatform(x, y + 68, 188, 42, meta.element);
    this.bossSprite = this.add.image(x, y, texKey).setDisplaySize(138, 138).setDepth(20);

    this.drawNameTag(674, 84, meta.name, meta.element, 318);

    this.bossBar = makeHealthBar(this, 536, 116, 276, this.state.boss.stats.hp);
    this.bossBar.container.setDepth(21);
    this.bossBar.setHp(this.state.boss.currentHp);
  }

  /**
   * 在 (cx, cy) 居中绘制 "名称 · [色块] 元素" 行。
   */
  private drawNameTag(cx: number, cy: number, name: string, element: Element, width = 284): void {
    const label = ELEMENT_LABEL_CN[element];
    const color = ELEMENT_COLOR[element];
    this.drawGlassPanel(cx - width / 2, cy - 22, width, 44, 0x093b66, 0.82, 0xb7f4ff, 12, 21);

    const nameText = this.add
      .text(0, 0, name, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
        stroke: '#102d56',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    const pillWidth = Math.max(54, 32 + label.length * 14);
    const pillX = cx + width / 2 - pillWidth - 12;
    const pill = this.add.graphics().setDepth(22);
    pill.fillStyle(color, 0.92);
    pill.fillRoundedRect(pillX, cy - 13, pillWidth, 26, 13);
    pill.lineStyle(1, 0xffffff, 0.78);
    pill.strokeRoundedRect(pillX, cy - 13, pillWidth, 26, 13);
    const elementText = this.add
      .text(pillX + pillWidth / 2, cy, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#12324e',
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const maxNameWidth = width - pillWidth - 44;
    if (nameText.width > maxNameWidth) {
      nameText.setScale(maxNameWidth / nameText.width);
    }
    nameText.setPosition(cx - width / 2 + 16, cy);
    [nameText, elementText].forEach((o) => o.setDepth(23));
  }

  private drawLogPanel(): void {
    this.logText = this.add
      .text(42, 534, '', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#174d69',
        lineSpacing: 4,
        wordWrap: { width: 304 },
      })
      .setOrigin(0, 0)
      .setDepth(11);

    const meta = this.enemyMeta();
    this.pushLog(`${this.state.player.name} 出战！对手是 ${meta.name}！`);
  }

  private drawTurnLabel(): void {
    this.drawGlassPanel(22, 16, 130, 40, 0x073b66, 0.76, 0xffffff, 12, 28);
    this.turnText = this.add
      .text(87, 36, `回合 ${this.turnIndex}`, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30);
  }

  private drawItemCommandButton(): void {
    const x = 190;
    const y = 36;
    const width = 96;
    const btn = this.add
      .text(x, y, '药剂', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#f7fdff',
        align: 'center',
        stroke: '#06243b',
        strokeThickness: 4,
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
        fixedWidth: width,
        fixedHeight: ITEM_COMMAND_BUTTON_HEIGHT,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.attachActionButtonFrame(btn, x, y, width, ITEM_COMMAND_BUTTON_HEIGHT, 0x176d96, 0xb7f4ff);

    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => {
      if (this.phase !== 'IDLE') return;
      this.redrawButtonFrame(btn, true, true);
      btn.setColor('#fff4a8');
    });
    btn.on('pointerout', () => {
      this.redrawButtonFrame(btn, false, this.phase === 'IDLE');
      btn.setColor('#f7fdff');
    });
    btn.on('pointerup', () => {
      if (this.phase !== 'IDLE') return;
      this.toggleItemPanel();
    });
    this.itemButton = btn;

    if (this.mode === 'wild') {
      this.captureButton = this.makeCaptureButton(306, 36, 108);
      this.escapeButton = this.makeEscapeButton(426, 36, 108);
    }
  }

  private drawSkillButtons(): void {
    const skillIds = this.state.player.skillIds;

    const visibleSkillIds = skillIds.slice(0, 8);
    const colCount = 4;
    const startX = 462;
    const startY = 542;
    const gapX = 128;
    const gapY = 46;
    visibleSkillIds.forEach((sid, i) => {
      const skill = SKILLS[sid];
      if (!skill) return;
      const x = startX + (i % colCount) * gapX;
      const y = startY + Math.floor(i / colCount) * gapY;
      const btn = this.makeSkillButton(x, y, 118, skill);
      this.drawSkillEffectivenessBadge(x + 45, y - 16, skill);
      this.skillButtons.push(btn);
    });
  }

  private makeSkillButton(
    x: number,
    y: number,
    width: number,
    skill: SkillData,
  ): Phaser.GameObjects.Text {
    const borderColor = ELEMENT_COLOR[skill.element];

    const label = `${skill.name}\n威力 ${skill.power}  命中 ${Math.round(skill.accuracy * 100)}%`;
    const btn = this.add
      .text(x, y, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: '#f7fdff',
        align: 'center',
        stroke: '#06243b',
        strokeThickness: 4,
        padding: { left: 7, right: 7, top: 5, bottom: 4 },
        fixedWidth: width,
        fixedHeight: ACTION_BUTTON_HEIGHT,
        wordWrap: { width: width - 12 },
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.attachActionButtonFrame(btn, x, y, width, ACTION_BUTTON_HEIGHT, 0x0b4b74, borderColor);

    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => {
      if (this.phase !== 'IDLE') return;
      this.redrawButtonFrame(btn, true, true);
      btn.setColor('#fff4a8');
    });
    btn.on('pointerout', () => {
      this.redrawButtonFrame(btn, false, this.phase === 'IDLE');
      btn.setColor('#f7fdff');
    });
    btn.on('pointerup', () => {
      if (this.phase !== 'IDLE') return;
      this.onPlayerPick(skill.id);
    });
    return btn;
  }

  private drawSkillEffectivenessBadge(x: number, y: number, skill: SkillData): void {
    const multiplier = this.skillElementMultiplier(skill, this.state.boss.element);
    const label = this.skillEffectivenessTag(multiplier);
    if (label === '普通') return;
    const color = multiplier >= 2 ? 0xffd93d : 0x9ecfff;
    const stroke = multiplier >= 2 ? 0x8a3e00 : 0x24415f;
    const badge = this.add.container(x, y).setDepth(33);
    const bg = this.add.graphics();
    bg.fillStyle(color, 0.94);
    bg.fillRoundedRect(-22, -10, 44, 20, 9);
    bg.lineStyle(1, 0xffffff, 0.88);
    bg.strokeRoundedRect(-22, -10, 44, 20, 9);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '11px',
        color: '#ffffff',
        stroke: `#${stroke.toString(16).padStart(6, '0')}`,
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    badge.add([bg, text]);
  }

  private skillElementMultiplier(skill: SkillData, defenderElement: Element): number {
    return ELEMENT_MATCHUP[skill.element]?.[defenderElement] ?? 1;
  }

  private skillEffectivenessTag(multiplier: number): string {
    if (multiplier >= 2) return '克制';
    if (multiplier > 0 && multiplier <= 0.5) return '抵抗';
    return '普通';
  }

  /**
   * wild 模式独有的"投球"按钮。
   */
  private makeCaptureButton(x: number, y: number, width: number): Phaser.GameObjects.Text {
    const btn = this.add
      .text(x, y, this.captureButtonLabel(), {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#623200',
        align: 'center',
        stroke: '#fff6c7',
        strokeThickness: 3,
        padding: { left: 8, right: 8, top: 5, bottom: 5 },
        fixedWidth: width,
        fixedHeight: ACTION_BUTTON_HEIGHT,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.attachActionButtonFrame(btn, x, y, width, ACTION_BUTTON_HEIGHT, 0xffc653, 0xfff1a6);

    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => {
      if (this.phase !== 'IDLE') return;
      this.redrawButtonFrame(btn, true, true);
      btn.setColor('#2e1d00');
    });
    btn.on('pointerout', () => {
      this.redrawButtonFrame(btn, false, this.phase === 'IDLE');
      btn.setColor('#623200');
    });
    btn.on('pointerup', () => {
      if (this.phase !== 'IDLE') return;
      this.onCaptureAttempt();
    });
    return btn;
  }

  private captureButtonLabel(): string {
    return `投球\n剩余 ${PlayerState.getPokeballs()}`;
  }

  private refreshCaptureButtonLabel(): void {
    if (this.captureButton && this.captureButton.active) {
      this.captureButton.setText(this.captureButtonLabel());
    }
  }

  private makeEscapeButton(x: number, y: number, width: number): Phaser.GameObjects.Text {
    const btn = this.add
      .text(x, y, '逃跑\n离开战斗', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#24415f',
        align: 'center',
        stroke: '#ffffff',
        strokeThickness: 3,
        padding: { left: 8, right: 8, top: 5, bottom: 5 },
        fixedWidth: width,
        fixedHeight: ACTION_BUTTON_HEIGHT,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.attachActionButtonFrame(btn, x, y, width, ACTION_BUTTON_HEIGHT, 0xc9ecff, 0xffffff);

    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => {
      if (this.phase !== 'IDLE') return;
      this.redrawButtonFrame(btn, true, true);
      btn.setColor('#0b3959');
    });
    btn.on('pointerout', () => {
      this.redrawButtonFrame(btn, false, this.phase === 'IDLE');
      btn.setColor('#24415f');
    });
    btn.on('pointerup', () => {
      if (this.phase !== 'IDLE') return;
      this.onEscapeAttempt();
    });
    return btn;
  }

  private toggleItemPanel(): void {
    if (this.itemPanel?.active) {
      this.closeItemPanel();
      return;
    }
    this.openItemPanel();
  }

  private openItemPanel(): void {
    this.closeItemPanel();
    const panel = this.add.container(GAME_WIDTH / 2, 338).setDepth(880);
    const bg = this.add.graphics();
    bg.fillStyle(0x00182b, 0.52);
    bg.fillRoundedRect(-256, -94, 512, 188, 16);
    bg.fillStyle(0x0b4b74, 0.94);
    bg.fillRoundedRect(-246, -104, 492, 188, 14);
    bg.fillStyle(0xffffff, 0.14);
    bg.fillRoundedRect(-224, -88, 448, 24, 12);
    bg.lineStyle(3, 0xb7f4ff, 0.92);
    bg.strokeRoundedRect(-246, -104, 492, 188, 14);
    panel.add(bg);

    panel.add(
      this.add
        .text(0, -72, '战斗药剂', {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '24px',
          color: '#fff4a8',
          stroke: '#1b1b3a',
          strokeThickness: 5,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(0, -42, '使用后会恢复当前出战精灵，并消耗本回合让对手行动。', {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '14px',
          color: '#d8fbff',
          align: 'center',
        })
        .setOrigin(0.5),
    );

    BATTLE_HEALING_ITEM_IDS.forEach((itemId, index) => {
      panel.add(this.makeHealingItemChoice(itemId, -154 + index * 154, 24));
    });

    const close = this.add
      .text(210, -76, 'x', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.closeItemPanel());
    panel.add(close);

    this.itemPanel = panel;
  }

  private makeHealingItemChoice(
    itemId: BattleHealingItemId,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const item = getItem(itemId);
    const count = PlayerState.getItemCount(itemId);
    const healValue = this.healingItemValue(itemId);
    const canUse = count > 0 && this.state.player.currentHp < this.state.player.stats.hp;
    const card = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(canUse ? 0xfffbdf : 0x6b7c88, canUse ? 0.96 : 0.58);
    bg.fillRoundedRect(-66, -42, 132, 84, 12);
    bg.lineStyle(2, canUse ? 0xffd93d : 0xb6c3d1, canUse ? 0.92 : 0.5);
    bg.strokeRoundedRect(-66, -42, 132, 84, 12);
    card.add(bg);

    const iconKey = `item_${itemId}`;
    if (this.textures.exists(iconKey)) {
      card.add(this.add.image(-38, -10, iconKey).setDisplaySize(38, 38));
    } else {
      const dot = this.add.circle(-38, -10, 18, item?.iconColor ?? 0xff9ec7, 0.95);
      dot.setStrokeStyle(2, 0xffffff, 0.78);
      card.add(dot);
    }

    card.add(
      this.add
        .text(4, -28, item?.name ?? itemId, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '13px',
          color: canUse ? '#174a6b' : '#e8f4f8',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );
    card.add(
      this.add
        .text(4, -4, `${this.healingItemLabel(healValue)}  x${count}`, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '12px',
          color: canUse ? '#2b627a' : '#d8e4ea',
        })
        .setOrigin(0, 0.5),
    );
    const action = this.add
      .text(0, 24, canUse ? '使用' : count > 0 ? '已满' : '没有', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        backgroundColor: canUse ? '#ff8f2f' : '#607080',
        padding: { left: 10, right: 10, top: 3, bottom: 3 },
      })
      .setOrigin(0.5);
    card.add(action);

    if (canUse) {
      card
        .setSize(132, 84)
        .setInteractive(
          new Phaser.Geom.Rectangle(-66, -42, 132, 84),
          Phaser.Geom.Rectangle.Contains,
        )
        .on('pointerup', () => this.useHealingItem(itemId));
    }

    return card;
  }

  private closeItemPanel(): void {
    if (!this.itemPanel) return;
    this.itemPanel.destroy();
    this.itemPanel = null;
  }

  private healingItemValue(itemId: BattleHealingItemId): number {
    const effect = getItem(itemId)?.effect;
    return effect?.kind === 'heal' ? effect.value : 0;
  }

  private healingItemLabel(value: number): string {
    return value >= 99999 ? '回满' : `+${value}`;
  }

  private attachActionButtonFrame(
    btn: Phaser.GameObjects.Text,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: number,
    accent: number,
  ): void {
    const frame = this.add.graphics().setDepth(29);
    const redraw: ButtonFrameUpdater = (hover: boolean, enabled: boolean): void => {
      frame.clear();
      const bodyAlpha = enabled ? (hover ? 0.94 : 0.82) : 0.38;
      const borderAlpha = enabled ? (hover ? 1 : 0.82) : 0.38;
      frame.fillStyle(0x00182b, enabled ? 0.3 : 0.18);
      frame.fillRoundedRect(x - width / 2 + 3, y - height / 2 + 4, width, height, 12);
      frame.fillStyle(fill, bodyAlpha);
      frame.fillRoundedRect(x - width / 2, y - height / 2, width, height, 12);
      frame.fillStyle(0xffffff, enabled ? 0.22 : 0.08);
      frame.fillRoundedRect(x - width / 2 + 7, y - height / 2 + 5, width - 14, 10, 8);
      frame.lineStyle(2, accent, borderAlpha);
      frame.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 12);
      if (hover && enabled) {
        frame.lineStyle(1, 0xffffff, 0.78);
        frame.strokeRoundedRect(x - width / 2 + 4, y - height / 2 + 4, width - 8, height - 8, 9);
      }
    };
    redraw(false, true);
    btn.setData('buttonFrameRedraw', redraw);
  }

  private redrawButtonFrame(btn: Phaser.GameObjects.Text, hover: boolean, enabled: boolean): void {
    const redraw = btn.getData('buttonFrameRedraw') as ButtonFrameUpdater | undefined;
    redraw?.(hover, enabled);
  }

  // ---- 状态机 ------------------------------------------------------------

  private onPlayerPick(playerSkillId: string): void {
    if (playerSkillId === NO_MONEY_MEAL_SKILL_ID && this.noMoneyMealUsed) {
      this.pushLog('没钱吃饭每场战斗只能使用一次！');
      return;
    }
    if (playerSkillId === NO_MONEY_MEAL_SKILL_ID) {
      this.noMoneyMealUsed = true;
    }

    this.phase = 'RESOLVING';
    this.setButtonsEnabled(false);

    const enemySkillId = this.pickEnemySkill();

    const before = this.state;
    const result = resolveTurn(before, playerSkillId, enemySkillId, Math.random);

    const firstActor = computeTurnOrder(before);
    const order: Array<'player' | 'boss'> =
      firstActor === 'player' ? ['player', 'boss'] : ['boss', 'player'];

    const steps = result.log.length;

    for (let i = 0; i < steps; i++) {
      const actor = order[i] ?? 'player';
      const logLine = result.log[i] ?? '';
      const skillId = actor === 'player' ? playerSkillId : enemySkillId;
      const delay = i * LOG_INTERVAL_MS;
      const timer = this.time.delayedCall(delay, () => {
        this.playStep(actor, logLine, result.nextState, skillId);
      });
      this.pendingTimers.push(timer);
    }

    const finalizeDelay = steps * LOG_INTERVAL_MS + 100;
    const finalizeTimer = this.time.delayedCall(finalizeDelay, () => {
      this.state = result.nextState;
      if (result.ended === null) {
        this.turnIndex += 1;
        this.turnText.setText(`回合 ${this.turnIndex}`);
        this.phase = 'IDLE';
        this.setButtonsEnabled(true);
        return;
      }
      this.onBattleEnd(result.ended);
    });
    this.pendingTimers.push(finalizeTimer);
  }

  /**
   * 从对手技能列表随机挑一条。wild 模式走 `makeCombatantFromWild` 截断过的技能池。
   */
  private pickEnemySkill(): string {
    const skills = this.state.boss.skillIds;
    if (skills.length === 0) return 'tackle';
    return Phaser.Math.RND.pick(skills);
  }

  /**
   * wild 模式：玩家按"投球"。
   *
   * 现在同种精灵可以捕捉多只，因此这里只拦截"精灵球不足"；
   * 成功收服时会生成一只带独立编号与性格的新个体。
   */
  private onCaptureAttempt(): void {
    if (this.mode !== 'wild' || !this.wildPet) return;
    if (this.phase !== 'IDLE') return;

    const wildPet = this.wildPet;
    if (PlayerState.getPokeballs() <= 0) {
      this.pushLog('精灵球不够了！');
      return;
    }

    this.phase = 'RESOLVING';
    this.setButtonsEnabled(false);

    PlayerState.consumePokeball();
    this.refreshCaptureButtonLabel();

    const wildLevel = this.wildLevel;
    const maxHp = Math.max(1, this.state.boss.stats.hp);
    const rate = calcCaptureRate({
      wildHpRatio: this.state.boss.currentHp / maxHp,
      playerLevel: this.playerPet.level,
      wildLevel,
      bonusMult: 1,
    });

    this.pushLog(`${this.state.player.name} 投出了精灵球！`);

    const success = Math.random() < rate;
    if (success) {
      this.onCaptureSuccess(wildPet, wildLevel);
      return;
    }

    this.onCaptureFailure(wildPet);
  }

  private onEscapeAttempt(): void {
    if (this.mode !== 'wild') return;
    if (this.phase !== 'IDLE') return;

    this.phase = 'END';
    this.setButtonsEnabled(false);
    this.pushLog('你离开了战斗。');

    const timer = this.time.delayedCall(650, () => {
      this.startReturnScene({ escapedFromBattle: true });
    });
    this.pendingTimers.push(timer);
  }

  private useHealingItem(itemId: BattleHealingItemId): void {
    if (this.phase !== 'IDLE') return;
    const healValue = this.healingItemValue(itemId);
    const item = getItem(itemId);
    if (healValue <= 0 || !item) return;

    const beforeHp = this.state.player.currentHp;
    const maxHp = this.state.player.stats.hp;
    if (beforeHp >= maxHp) {
      this.pushLog(`${this.state.player.name} 的体力已经是满的。`);
      this.closeItemPanel();
      return;
    }
    if (PlayerState.getItemCount(itemId) <= 0 || !PlayerState.removeItem(itemId, 1)) {
      this.pushLog(`${item.name} 不够了。`);
      this.closeItemPanel();
      return;
    }

    const healed = Math.min(maxHp - beforeHp, healValue >= 99999 ? maxHp : healValue);
    const nextHp = Math.min(maxHp, beforeHp + healed);
    this.state = {
      player: { ...this.state.player, currentHp: nextHp },
      boss: this.state.boss,
    };
    this.playerPet.currentHp = nextHp;
    PlayerState.persist();
    this.playerBar.setHp(nextHp);
    this.spawnHealEffect(this.playerSprite.x, this.playerSprite.y - 40);
    spawnFloatingText(this, this.playerSprite.x, this.playerSprite.y - 76, `+${healed}`, 0x67e88d, {
      fontSize: 20,
    });
    this.pushLog(`${this.state.player.name} 使用 ${item.name}，恢复 ${healed} 点体力！`);
    this.closeItemPanel();

    this.phase = 'RESOLVING';
    this.setButtonsEnabled(false);
    const timer = this.time.delayedCall(LOG_INTERVAL_MS, () => this.playEnemyCounterAfterItem());
    this.pendingTimers.push(timer);
  }

  private playEnemyCounterAfterItem(): void {
    const enemySkillId = this.pickEnemySkill();
    const enemySkill = SKILLS[enemySkillId];
    const enemyName = this.enemyMeta().name;
    if (!enemySkill) {
      this.resumeIdleAfterTurn();
      return;
    }

    const dmg = calcDamage(this.state.boss, this.state.player, enemySkill, Math.random);
    this.playSkillEffect('boss', enemySkill);
    if (dmg.isMiss) {
      this.pushLog(`${enemyName} 趁机打出 ${enemySkill.name}，但未命中！`);
      spawnFloatingText(this, this.playerSprite.x, this.playerSprite.y - 40, '未命中', 0xcccccc, {
        fontSize: 20,
      });
      this.resumeIdleAfterTurn();
      return;
    }

    const newHp = Math.max(0, this.state.player.currentHp - dmg.damage);
    const suffix =
      dmg.elementMul >= 2
        ? '（效果拔群！）'
        : dmg.elementMul > 0 && dmg.elementMul <= 0.5
          ? '（效果甚微...）'
          : '';
    this.pushLog(
      `${enemyName} 趁机打出 ${enemySkill.name}，对 ${this.state.player.name} 造成 ${dmg.damage} 点伤害！${suffix}`,
    );
    const color = dmg.elementMul >= 2 ? 0xffd93d : 0xff5252;
    spawnFloatingText(this, this.playerSprite.x, this.playerSprite.y - 40, `-${dmg.damage}`, color);
    this.playerBar.setHp(newHp);
    this.state = {
      player: { ...this.state.player, currentHp: newHp },
      boss: this.state.boss,
    };
    this.playerPet.currentHp = newHp;
    PlayerState.persist();
    this.spawnDamageQualityText(
      this.playerSprite.x,
      this.playerSprite.y - 70,
      dmg.elementMul,
      dmg.damage,
    );
    if (newHp === 0) {
      this.onBattleEnd('player');
      return;
    }
    this.resumeIdleAfterTurn();
  }

  private onCaptureSuccess(wildPet: PetData, wildLevel: number): void {
    this.pushLog(`成功收服了 ${wildPet.name}！`);

    // 构造独立个体：同种精灵可以反复捕捉，每只都会拥有自己的性格和成长。
    const evolutionStage = stageForWildLevel(wildLevel);
    const newPet: PlayerPet = createPlayerPet(wildPet, wildLevel, { evolutionStage });
    const placement = PlayerState.addPlayerPet(newPet);
    if (placement === 'storage') {
      this.pushLog(`${wildPet.name} 已传送到精灵仓库。`);
    }

    // FEAT-303：通知 QuestEngine 推进主线 "收服 5 只" / 每日 d_capture_1 任务。
    gameEvents.emit('capture:success', { petId: wildPet.id });

    this.phase = 'END';
    const timer = this.time.delayedCall(CAPTURE_SUCCESS_TO_WORLD_MS, () => {
      this.startReturnScene({
        justCapturedPetId: wildPet.id,
        capturedToStorage: placement === 'storage',
      });
    });
    this.pendingTimers.push(timer);
  }

  /**
   * 捕捉失败：推一条"晃了晃又掉出来了"的日志；野生用随机一技能反打玩家一下；然后回到 IDLE。
   *
   * 这里刻意不复用 resolveTurn：resolveTurn 会把"玩家用某一技能"作为先手演算，
   * 但捕捉行为并非技能施放，也不会给玩家造成 `playerSkillId` 的伤害。
   * 因此直接用 calcDamage 走野生→玩家一次伤害应用，然后判定是否击败玩家。
   */
  private onCaptureFailure(wildPet: PetData): void {
    this.pushLog('精灵球晃了晃又掉出来了！');

    // 延迟一下再播放野生反打，避免 log 堆叠过快。
    const reactDelay = this.time.delayedCall(LOG_INTERVAL_MS, () => {
      const enemySkillId = this.pickEnemySkill();
      const enemySkill = SKILLS[enemySkillId];
      if (!enemySkill) {
        this.resumeIdleAfterTurn();
        return;
      }

      const dmg = calcDamage(this.state.boss, this.state.player, enemySkill, Math.random);
      this.playSkillEffect('boss', enemySkill);
      if (dmg.isMiss) {
        this.pushLog(`${wildPet.name} 打出 ${enemySkill.name}，但未命中！`);
        spawnFloatingText(this, this.playerSprite.x, this.playerSprite.y - 40, '未命中', 0xcccccc, {
          fontSize: 20,
        });
      } else {
        const newHp = Math.max(0, this.state.player.currentHp - dmg.damage);
        const suffix =
          dmg.elementMul >= 2
            ? '（效果拔群！）'
            : dmg.elementMul > 0 && dmg.elementMul <= 0.5
              ? '（效果甚微…）'
              : '';
        this.pushLog(
          `${wildPet.name} 打出 ${enemySkill.name}，对 ${this.state.player.name} 造成 ${dmg.damage} 点伤害！${suffix}`,
        );
        const color = dmg.elementMul >= 2 ? 0xffd93d : 0xff5252;
        spawnFloatingText(
          this,
          this.playerSprite.x,
          this.playerSprite.y - 40,
          `-${dmg.damage}`,
          color,
        );
        this.playerBar.setHp(newHp);
        this.state = {
          player: { ...this.state.player, currentHp: newHp },
          boss: this.state.boss,
        };
        if (newHp === 0) {
          this.onBattleEnd('player');
          return;
        }
      }

      this.resumeIdleAfterTurn();
    });
    this.pendingTimers.push(reactDelay);
  }

  private resumeIdleAfterTurn(): void {
    this.turnIndex += 1;
    this.turnText.setText(`回合 ${this.turnIndex}`);
    this.phase = 'IDLE';
    this.setButtonsEnabled(true);
  }

  /**
   * 单步播放：log / 浮字 / 扣血 tween。
   */
  private playStep(
    actor: 'player' | 'boss',
    logLine: string,
    finalState: BattleState,
    skillId: string,
  ): void {
    this.pushLog(logLine);
    const isMiss = logLine.includes('未命中');
    const skill = SKILLS[skillId];
    if (skill) {
      this.playSkillEffect(actor, skill);
    }
    const effectiveness = skill
      ? this.skillElementMultiplier(
          skill,
          actor === 'player' ? this.state.boss.element : this.state.player.element,
        )
      : 1;

    if (actor === 'player') {
      const before = this.state.boss.currentHp;
      const after = finalState.boss.currentHp;
      const dmg = Math.max(0, before - after);
      if (isMiss) {
        spawnFloatingText(this, this.bossSprite.x, this.bossSprite.y - 40, '未命中', 0xcccccc, {
          fontSize: 20,
        });
      } else if (dmg > 0) {
        const color = logLine.includes('拔群') ? 0xffd93d : 0xff5252;
        spawnFloatingText(this, this.bossSprite.x, this.bossSprite.y - 40, `-${dmg}`, color);
        this.spawnDamageQualityText(this.bossSprite.x, this.bossSprite.y - 70, effectiveness, dmg);
      }
      this.bossBar.setHp(after);
      this.state = {
        player: this.state.player,
        boss: { ...this.state.boss, currentHp: after },
      };
    } else {
      const before = this.state.player.currentHp;
      const after = finalState.player.currentHp;
      const dmg = Math.max(0, before - after);
      if (isMiss) {
        spawnFloatingText(this, this.playerSprite.x, this.playerSprite.y - 40, '未命中', 0xcccccc, {
          fontSize: 20,
        });
      } else if (dmg > 0) {
        const color = logLine.includes('拔群') ? 0xffd93d : 0xff5252;
        spawnFloatingText(this, this.playerSprite.x, this.playerSprite.y - 40, `-${dmg}`, color);
        this.spawnDamageQualityText(
          this.playerSprite.x,
          this.playerSprite.y - 70,
          effectiveness,
          dmg,
        );
      }
      this.playerBar.setHp(after);
      this.state = {
        player: { ...this.state.player, currentHp: after },
        boss: this.state.boss,
      };
    }
  }

  private spawnDamageQualityText(
    x: number,
    y: number,
    effectiveness: number,
    damage: number,
  ): void {
    if (effectiveness >= 2) {
      spawnFloatingText(this, x, y, '效果拔群！', 0xffd93d, { fontSize: 18 });
      this.pulseCamera(0.0048);
      return;
    }
    if (effectiveness > 0 && effectiveness <= 0.5) {
      spawnFloatingText(this, x, y, '效果甚微...', 0x9ecfff, { fontSize: 16 });
      return;
    }
    if (damage >= 42) {
      this.pulseCamera(0.0032);
    }
  }

  private pulseCamera(intensity: number): void {
    const scale = motionScale();
    if (scale <= 0.58) return;
    this.cameras.main.shake(110, intensity * scale);
  }

  private playSkillEffect(actor: 'player' | 'boss', skill: SkillData): void {
    const caster = actor === 'player' ? this.playerSprite : this.bossSprite;
    const target = actor === 'player' ? this.bossSprite : this.playerSprite;
    const color = ELEMENT_COLOR[skill.element] ?? 0xffffff;
    const casterX = caster.x;
    const casterY = caster.y - 44;
    const targetX = target.x;
    const targetY = target.y - 34;

    const windupX = actor === 'player' ? 18 : -18;
    this.spawnCastAura(casterX, casterY, color);
    this.tweens.add({
      targets: caster,
      x: caster.x + windupX,
      y: caster.y - 8,
      duration: 120,
      yoyo: true,
      ease: 'Sine.easeOut',
    });

    const isBasketball = this.isBasketballSkill(skill.id);
    const isChicken = this.isChickenSkill(skill.id);
    const projectile = this.add.container(casterX, casterY).setDepth(145);
    const projectileColor = isBasketball ? 0xff8f2f : isChicken ? 0xfff1a8 : color;
    const core = this.add.circle(0, 0, isBasketball ? 13 : 11, projectileColor, 0.96);
    core.setStrokeStyle(3, 0xffffff, 0.8);
    projectile.add(core);
    if (isBasketball) {
      const seams = this.add.graphics();
      seams.lineStyle(2, 0x5e3214, 0.82);
      seams.strokeCircle(0, 0, 9);
      seams.lineBetween(-12, 0, 12, 0);
      seams.lineBetween(0, -12, 0, 12);
      projectile.add(seams);
    } else if (isChicken) {
      const feather = this.add.graphics();
      feather.fillStyle(0xfff7d0, 0.95);
      feather.fillEllipse(-5, -2, 9, 18);
      feather.fillEllipse(6, 3, 7, 15);
      feather.lineStyle(2, 0xffd35c, 0.85);
      feather.lineBetween(-5, -10, -5, 8);
      feather.lineBetween(6, -4, 6, 10);
      projectile.add(feather);
    }
    this.tweens.add({
      targets: projectile,
      x: targetX,
      y: targetY,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 190,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        projectile.destroy();
        this.spawnElementImpact(targetX, targetY, skill.element, color);
        if (isBasketball) this.spawnBasketballImpact(targetX, targetY);
        if (isChicken) this.spawnChickenImpact(targetX, targetY);
        this.tweens.add({
          targets: target,
          x: target.x + (actor === 'player' ? 10 : -10),
          duration: 60,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
        });
      },
    });
  }

  private isBasketballSkill(skillId: string): boolean {
    return ['dance_kick', 'three_point_spark', 'backboard_rebound'].includes(skillId);
  }

  private isChickenSkill(skillId: string): boolean {
    return ['rhythm_pose', 'rooster_crossover', 'divine_chicken_call'].includes(skillId);
  }

  private spawnCastAura(x: number, y: number, color: number): void {
    const aura = this.add.circle(x, y, 24, color, 0.18).setDepth(144);
    aura.setStrokeStyle(4, 0xffffff, 0.86);
    const star = this.add.star(x, y, 6, 10, 30, color, 0.7).setDepth(145);
    star.setStrokeStyle(2, 0xffffff, 0.72);
    this.tweens.add({
      targets: aura,
      scaleX: 1.8,
      scaleY: 1.8,
      alpha: 0,
      duration: 520,
      ease: 'Sine.easeOut',
      onComplete: () => aura.destroy(),
    });
    this.tweens.add({
      targets: star,
      angle: 120,
      scaleX: 1.45,
      scaleY: 1.45,
      alpha: 0,
      duration: 520,
      ease: 'Back.easeOut',
      onComplete: () => star.destroy(),
    });
  }

  private spawnElementImpact(x: number, y: number, element: Element, color: number): void {
    const ring = this.add.circle(x, y, 28, color, 0.22).setDepth(146);
    ring.setStrokeStyle(4, color, 0.95);
    this.tweens.add({
      targets: ring,
      scaleX: 2.55,
      scaleY: 2.55,
      alpha: 0,
      duration: 680,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });

    if (element === 'electric') {
      this.spawnElectricImpact(x, y, color);
    } else if (element === 'fire') {
      this.spawnFireImpact(x, y, color);
    } else if (element === 'water') {
      this.spawnWaterImpact(x, y, color);
    } else if (element === 'grass') {
      this.spawnGrassImpact(x, y, color);
    } else if (element === 'light') {
      this.spawnLightImpact(x, y, color);
    } else {
      this.spawnNormalImpact(x, y, color);
    }
  }

  private spawnBasketballImpact(x: number, y: number): void {
    const count = effectParticleCount(3);
    for (let i = 0; i < count; i++) {
      const ball = this.add
        .circle(x - 28 + i * 28, y - 10 - i * 4, 9, 0xff8f2f, 0.86)
        .setDepth(148);
      ball.setStrokeStyle(2, 0xffffff, 0.72);
      this.tweens.add({
        targets: ball,
        y: ball.y - 28,
        scaleX: 0.35,
        scaleY: 0.35,
        alpha: 0,
        duration: 560,
        ease: 'Cubic.easeOut',
        onComplete: () => ball.destroy(),
      });
    }
  }

  private spawnChickenImpact(x: number, y: number): void {
    const count = effectParticleCount(7);
    for (let i = 0; i < count; i++) {
      const feather = this.add.ellipse(x, y, 8, 22, 0xfff1a8, 0.9).setDepth(148);
      feather.setStrokeStyle(1, 0xffd35c, 0.82);
      const angle = -Math.PI + (Math.PI * 2 * i) / count;
      this.tweens.add({
        targets: feather,
        x: x + Math.cos(angle) * (34 + i * 3),
        y: y + Math.sin(angle) * (22 + i * 2),
        angle: Phaser.Math.RadToDeg(angle) + 90,
        alpha: 0,
        duration: 620,
        ease: 'Sine.easeOut',
        onComplete: () => feather.destroy(),
      });
    }
  }

  private spawnHealEffect(x: number, y: number): void {
    const ring = this.add.circle(x, y, 30, 0x67e88d, 0.22).setDepth(148);
    ring.setStrokeStyle(4, 0xffffff, 0.86);
    this.tweens.add({
      targets: ring,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 620,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });

    const count = effectParticleCount(8);
    for (let i = 0; i < count; i++) {
      const mote = this.add
        .circle(x, y + 18, 5, i % 2 === 0 ? 0x67e88d : 0xfff4a8, 0.92)
        .setDepth(149);
      const angle = -Math.PI + (Math.PI * i) / Math.max(1, count - 1);
      this.tweens.add({
        targets: mote,
        x: x + Math.cos(angle) * Phaser.Math.Between(22, 48),
        y: y + Math.sin(angle) * Phaser.Math.Between(24, 58),
        alpha: 0,
        scaleX: 0.42,
        scaleY: 0.42,
        duration: 620,
        ease: 'Cubic.easeOut',
        onComplete: () => mote.destroy(),
      });
    }
  }

  private spawnElectricImpact(x: number, y: number, color: number): void {
    const count = effectParticleCount(4);
    for (let i = 0; i < count; i++) {
      const g = this.add.graphics().setDepth(147);
      const angle = -0.8 + i * 0.5;
      const len = 46 + i * 7;
      g.lineStyle(4, color, 0.95);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(angle) * len * 0.45, y + Math.sin(angle) * len * 0.45);
      g.lineTo(x + Math.cos(angle + 0.25) * len, y + Math.sin(angle + 0.25) * len);
      g.strokePath();
      this.tweens.add({
        targets: g,
        alpha: 0,
        duration: 520,
        ease: 'Sine.easeOut',
        onComplete: () => g.destroy(),
      });
    }
  }

  private spawnFireImpact(x: number, y: number, color: number): void {
    const count = effectParticleCount(7);
    for (let i = 0; i < count; i++) {
      const ember = this.add.circle(x, y, Phaser.Math.Between(4, 8), color, 0.9).setDepth(147);
      const angle = Phaser.Math.FloatBetween(-Math.PI, 0);
      const dist = Phaser.Math.Between(28, 64);
      this.tweens.add({
        targets: ember,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.35,
        scaleY: 0.35,
        duration: 620,
        ease: 'Cubic.easeOut',
        onComplete: () => ember.destroy(),
      });
    }
  }

  private spawnWaterImpact(x: number, y: number, color: number): void {
    const count = effectParticleCount(6);
    for (let i = 0; i < count; i++) {
      const bubble = this.add.circle(x, y, 7, color, 0.22).setDepth(147);
      bubble.setStrokeStyle(2, 0xffffff, 0.85);
      this.tweens.add({
        targets: bubble,
        x: x + Phaser.Math.Between(-46, 46),
        y: y + Phaser.Math.Between(-54, 18),
        alpha: 0,
        scaleX: 1.65,
        scaleY: 1.65,
        duration: 640,
        ease: 'Sine.easeOut',
        onComplete: () => bubble.destroy(),
      });
    }
  }

  private spawnGrassImpact(x: number, y: number, color: number): void {
    const count = effectParticleCount(6);
    for (let i = 0; i < count; i++) {
      const leaf = this.add.triangle(x, y, 0, -12, 8, 10, -8, 10, color, 0.92).setDepth(147);
      leaf.setRotation(Phaser.Math.FloatBetween(-0.9, 0.9));
      this.tweens.add({
        targets: leaf,
        x: x + Phaser.Math.Between(-52, 52),
        y: y + Phaser.Math.Between(-50, 28),
        angle: leaf.angle + Phaser.Math.Between(120, 260),
        alpha: 0,
        duration: 660,
        ease: 'Sine.easeOut',
        onComplete: () => leaf.destroy(),
      });
    }
  }

  private spawnLightImpact(x: number, y: number, color: number): void {
    const rays = this.add.graphics().setDepth(147);
    rays.lineStyle(3, color, 0.9);
    const count = effectParticleCount(10);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      rays.lineBetween(x, y, x + Math.cos(angle) * 58, y + Math.sin(angle) * 58);
    }
    this.tweens.add({
      targets: rays,
      alpha: 0,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 620,
      ease: 'Sine.easeOut',
      onComplete: () => rays.destroy(),
    });
  }

  private spawnNormalImpact(x: number, y: number, color: number): void {
    const star = this.add.star(x, y, 5, 12, 34, color, 0.88).setDepth(147);
    star.setStrokeStyle(3, 0xffffff, 0.8);
    this.tweens.add({
      targets: star,
      angle: 80,
      scaleX: 1.6,
      scaleY: 1.6,
      alpha: 0,
      duration: 620,
      ease: 'Back.easeOut',
      onComplete: () => star.destroy(),
    });
  }

  private pushLog(line: string): void {
    this.logBuffer.push(line);
    if (this.logBuffer.length > LOG_LINE_COUNT) {
      this.logBuffer = this.logBuffer.slice(-LOG_LINE_COUNT);
    }
    if (this.logText && this.logText.active) {
      this.logText.setText(this.logBuffer.join('\n'));
    }
  }

  private setButtonsEnabled(enabled: boolean): void {
    if (!enabled) this.closeItemPanel();
    for (const btn of this.skillButtons) {
      if (!btn.active) continue;
      if (enabled) {
        btn.setInteractive({ useHandCursor: true });
        btn.setAlpha(1);
      } else {
        btn.disableInteractive();
        btn.setAlpha(0.55);
      }
      this.redrawButtonFrame(btn, false, enabled);
    }
    const item = this.itemButton;
    if (item && item.active) {
      if (enabled) {
        item.setInteractive({ useHandCursor: true });
        item.setAlpha(1);
      } else {
        item.disableInteractive();
        item.setAlpha(0.55);
      }
      this.redrawButtonFrame(item, false, enabled);
    }
    const cap = this.captureButton;
    if (cap && cap.active) {
      if (enabled) {
        cap.setInteractive({ useHandCursor: true });
        cap.setAlpha(1);
      } else {
        cap.disableInteractive();
        cap.setAlpha(0.55);
      }
      this.redrawButtonFrame(cap, false, enabled);
    }
    const escape = this.escapeButton;
    if (escape && escape.active) {
      if (enabled) {
        escape.setInteractive({ useHandCursor: true });
        escape.setAlpha(1);
      } else {
        escape.disableInteractive();
        escape.setAlpha(0.55);
      }
      this.redrawButtonFrame(escape, false, enabled);
    }
  }

  private onBattleEnd(ended: 'player' | 'boss'): void {
    this.phase = 'END';
    this.setButtonsEnabled(false);

    if (this.mode === 'boss') {
      this.finishBossBattle(ended);
    } else if (this.mode === 'trainer') {
      this.finishTrainerBattle(ended);
    } else {
      this.finishWildBattle(ended);
    }
  }

  /**
   * BOSS 模式结算（原 FEAT-205 逻辑）。
   */
  private finishBossBattle(ended: 'player' | 'boss'): void {
    const boss = this.boss;
    if (!boss) return;
    const wonBossId = ended === 'boss' ? boss.id : null;
    if (ended === 'boss') {
      // VIP 金币倍率：boss.rewardCoins × getCoinMultiplier（向下取整，保证金币为整数）。
      const coinGain = Math.floor(boss.rewardCoins * getCoinMultiplier(PlayerState.isVip()));
      PlayerState.addCoins(coinGain);
      PlayerState.markBossDefeated(boss.id);
      this.showResultPanel('胜利！', boss.rewardText, true);
      const leveledUp = this.awardVictoryExp({
        isBoss: true,
        defeatedLevel: BOSS_EQUIVALENT_LEVEL,
      });
      // FEAT-303：通知 QuestEngine 推进主线 defeat_boss / daily level_up_any。
      gameEvents.emit('battle:victory', {
        enemyId: boss.id,
        enemyKind: 'boss',
        petId: this.pet.id,
        leveledUp,
      });
    } else {
      this.showResultPanel('挑战失败…下次再来！', '不要灰心，小海宝！再培养一下精灵吧~', false);
    }
    const timer = this.time.delayedCall(END_TO_WORLD_MS, () => {
      if (wonBossId) {
        this.startReturnScene({ justWonBossId: wonBossId });
      } else {
        this.startReturnScene();
      }
    });
    this.pendingTimers.push(timer);
  }

  /**
   * wild 模式结算。
   *
   * - 胜：发放经验 + 结算面板 + 1500ms 后回 fromScene 并附 justDefeatedWildPetId；
   * - 负：不扣金币，直接回 fromScene，附 toast 信号由 fromScene 自行弹。
   *
   * 这里不额外弹 toast，因为回到 World/Beach 后由那边的 init → create 末尾统一处理。
   */
  private finishWildBattle(ended: 'player' | 'boss'): void {
    const wildPet = this.wildPet;
    if (!wildPet) return;
    if (ended === 'boss') {
      // 玩家赢了野生精灵
      const coinGain = Math.floor(
        (8 + this.wildLevel * 2) * getCoinMultiplier(PlayerState.isVip()),
      );
      PlayerState.addCoins(coinGain);
      const drop = this.rollWildSpoils(wildPet.element);
      if (drop) PlayerState.addItem(drop.itemId, drop.quantity);
      const dropText = drop ? `\n额外掉落：${drop.name} x${drop.quantity}` : '';
      this.showResultPanel(
        '胜利！',
        `战胜了 ${wildPet.name}，获得 ${coinGain} 彩贝！${dropText}`,
        true,
      );
      const leveledUp = this.awardVictoryExp({
        isBoss: false,
        defeatedLevel: this.wildLevel,
      });
      // FEAT-303：通知 QuestEngine 推进主线 / 每日野外战斗任务。
      gameEvents.emit('battle:victory', {
        enemyId: wildPet.id,
        enemyKind: 'wild',
        petId: this.pet.id,
        leveledUp,
      });
      const timer = this.time.delayedCall(WILD_WIN_TO_WORLD_MS, () => {
        this.startReturnScene({ justDefeatedWildPetId: wildPet.id });
      });
      this.pendingTimers.push(timer);
    } else {
      this.showResultPanel('战斗失败…下次再来！', '野生精灵跑远了，回去调整一下再来吧~', false);
      const timer = this.time.delayedCall(END_TO_WORLD_MS, () => {
        this.startReturnScene({ justLostWildBattle: true });
      });
      this.pendingTimers.push(timer);
    }
  }

  private finishTrainerBattle(ended: 'player' | 'boss'): void {
    if (!this.trainer || !this.trainerPet) return;
    const trainerName = virtualPlayerDisplayName(this.trainer);
    if (ended === 'boss') {
      const trainerBonus = this.trainer.isVip ? 40 : 0;
      const coins = Math.floor(
        (42 + this.trainerPetLevel * 5 + trainerBonus) * getCoinMultiplier(PlayerState.isVip()),
      );
      PlayerState.addCoins(coins);
      this.showResultPanel(
        '胜利！',
        `战胜了虚拟玩家 ${trainerName}，获得 ${coins} 彩贝！`,
        true,
      );
      const leveledUp = this.awardVictoryExp({
        isBoss: false,
        defeatedLevel: this.trainerPetLevel + (this.trainer.isVip ? 3 : 1),
      });
      gameEvents.emit('battle:victory', {
        enemyId: this.trainer.id,
        enemyKind: 'trainer',
        petId: this.pet.id,
        leveledUp,
      });
      const timer = this.time.delayedCall(WILD_WIN_TO_WORLD_MS, () => {
        this.startReturnScene({ justDefeatedTrainerName: trainerName });
      });
      this.pendingTimers.push(timer);
    } else {
      this.showResultPanel('对战失败…', `${trainerName} 赢下了这场玩家对战。`, false);
      const timer = this.time.delayedCall(END_TO_WORLD_MS, () => {
        this.startReturnScene({ justLostTrainerBattle: true });
      });
      this.pendingTimers.push(timer);
    }
  }

  private rollWildSpoils(
    element: Element,
  ): { readonly itemId: string; readonly quantity: number; readonly name: string } | null {
    const roll = Math.random() - (PlayerState.isVip() ? 0.06 : 0);
    const itemId =
      roll < 0.2
        ? elementFruitItemId(element)
        : roll < 0.34
          ? 'energy_seed'
          : roll < 0.43
            ? 'exp_candy'
            : null;
    if (!itemId) return null;
    const quantity = itemId === 'energy_seed' && this.wildLevel >= 18 ? 2 : 1;
    return {
      itemId,
      quantity,
      name: getItem(itemId)?.name ?? itemId,
    };
  }

  private startReturnScene(extra?: Record<string, unknown>): void {
    const data: Record<string, unknown> = { ...(extra ?? {}) };
    if (this.noMoneyMealUsed) {
      const loss = Math.min(PlayerState.getCoins(), Phaser.Math.Between(45, 90));
      if (loss > 0) PlayerState.addCoins(-loss);
      const locationId = Phaser.Math.RND.pick([...RANDOM_TELEPORT_LOCATIONS]);
      data.locationId = locationId;
      data.escapedFromBattle = false;
      this.scene.start(SceneKey.LEGACY_LOCATION, data);
      return;
    }
    if (this.returnLocationId) {
      data.locationId = this.returnLocationId;
    }
    this.scene.start(this.fromScene, Object.keys(data).length > 0 ? data : undefined);
  }

  /**
   * 胜利经验分发（BOSS 与 wild 共用）。返回本场战斗是否至少升级一次，
   * 供 battle:victory 事件的 leveledUp 字段填值（FEAT-303 每日 level_up_any 任务依赖此字段）。
   */
  private awardVictoryExp(opts: { isBoss: boolean; defeatedLevel: number }): boolean {
    const pp = PlayerState.getPlayerPet(this.pet.id);
    if (!pp) return false;

    const playerLv = pp.level;
    const prevExp = pp.exp;
    const prevLevel = pp.level;
    // VIP 经验倍率：expOnDefeat × getExpMultiplier，再 round 为整数发放。
    const baseGained = expOnDefeat({
      wildLevel: opts.defeatedLevel,
      playerLevel: playerLv,
      isBoss: opts.isBoss,
    });
    const gained = Math.round(baseGained * getExpMultiplier(PlayerState.isVip()));

    const result = PlayerState.gainExp(this.pet.id, gained);
    const leveledUp = result?.leveledUp ?? false;
    const newLevel = result?.newLevel ?? prevLevel;

    const barWidth = 420;
    const barX = (GAME_WIDTH - barWidth) / 2;
    const barY = GAME_HEIGHT / 2 - 20 + 110;

    const startExp = leveledUp ? 0 : prevExp;
    const startMax = leveledUp ? expToNext(newLevel) : expToNext(prevLevel);
    const finalExp = pp.exp;
    const finalMax = expToNext(newLevel);

    this.expBar = makeExpBar(this, barX, barY, barWidth, startExp, startMax);
    this.expBar.container.setDepth(520);

    const tweenDelay = this.time.delayedCall(280, () => {
      this.expBar?.setExp(finalExp, finalMax);
    });
    this.pendingTimers.push(tweenDelay);

    const expLabel = this.add
      .text(GAME_WIDTH / 2, barY - 14, `获得经验 +${gained}`, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#ffd93d',
        stroke: '#1b1b3a',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(520);
    // wild 模式下结算回退比 BOSS 快，expLabel 存活时间匹配相应窗口。
    const labelLife = opts.isBoss ? END_TO_WORLD_MS - 200 : WILD_WIN_TO_WORLD_MS - 200;
    this.pendingTimers.push(this.time.delayedCall(labelLife, () => expLabel.destroy()));

    if (leveledUp) {
      const badgeTimer = this.time.delayedCall(500, () => {
        spawnLevelUpBadge(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 140, newLevel);
      });
      this.pendingTimers.push(badgeTimer);
    }

    return leveledUp;
  }

  private showResultPanel(title: string, subtitle: string, win: boolean): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 - 20;

    const panel = this.add.container(cx, cy).setDepth(500).setAlpha(0).setScale(0.96);
    const dim = this.add.rectangle(0, 20, GAME_WIDTH, GAME_HEIGHT, 0x00182c, 0.42);
    panel.add(dim);

    const bg = this.add.graphics();
    bg.fillStyle(0x00162a, 0.46);
    bg.fillRoundedRect(-292, -86, 584, 184, 22);
    bg.fillStyle(win ? 0x0e4c73 : 0x24364d, 0.93);
    bg.fillRoundedRect(-280, -96, 560, 184, 20);
    bg.fillStyle(0xffffff, 0.14);
    bg.fillRoundedRect(-260, -82, 520, 26, 14);
    bg.lineStyle(4, win ? 0xffd93d : 0xb6c3d1, 0.94);
    bg.strokeRoundedRect(-280, -96, 560, 184, 20);
    bg.lineStyle(1, 0xffffff, 0.55);
    bg.strokeRoundedRect(-268, -84, 536, 160, 16);
    panel.add(bg);

    const emblem = win
      ? this.add.star(-232, -48, 7, 13, 28, 0xffd93d, 0.95)
      : this.add.circle(-232, -48, 22, 0xaeb8c8, 0.86);
    emblem.setStrokeStyle(3, 0xffffff, 0.8);
    panel.add(emblem);

    const titleColor = win ? '#ffd93d' : '#ffffff';
    const titleText = this.add
      .text(0, -42, title, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '40px',
        color: titleColor,
        stroke: '#1b1b3a',
        strokeThickness: 6,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    panel.add(titleText);

    const subtitleText = this.add
      .text(0, 22, subtitle, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        align: 'center',
        stroke: '#0b243d',
        strokeThickness: 3,
        wordWrap: { width: 500 },
      })
      .setOrigin(0.5);
    panel.add(subtitleText);

    const hint = this.add
      .text(0, 68, '正在返回彩虹城...', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#d8fbff',
      })
      .setOrigin(0.5);
    panel.add(hint);

    this.tweens.add({
      targets: panel,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });

    this.resultPanel = panel;
  }

  private onShutdown(): void {
    for (const t of this.pendingTimers) {
      t.remove(false);
    }
    this.pendingTimers = [];
    this.playerBar?.destroy();
    this.bossBar?.destroy();
    this.expBar?.destroy();
    this.expBar = null;
    if (this.resultPanel) {
      this.resultPanel.destroy();
      this.resultPanel = null;
    }
    this.closeItemPanel();
    this.itemButton = null;
    this.captureButton = null;
    this.escapeButton = null;
  }
}
