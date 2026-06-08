import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { getEncounter } from '@/data/encounters';
import {
  difficultyForLocation,
  recommendedLevelLabel,
  rollLocationWildLevel,
} from '@/data/locationDifficulty';
import { getPet } from '@/data/pets';
import { completeActivityTask, consumePendingActivityTask } from '@/systems/ActivityProgress';
import { gameEvents } from '@/systems/EventBus';
import { buildGameplaySuggestions } from '@/systems/GameplayAdvisor';
import { isPortalLikeHotspot, legacyHotspotContour } from '@/systems/LegacyHotspotVisuals';
import { PlayerState } from '@/systems/PlayerState';
import { rollEncounter } from '@/systems/EncounterRoller';
import { motionScale, roamingPetBudget, virtualPlayerBudget } from '@/systems/PerformanceProfile';
import { preloadLegacyLocationAssets } from '@/systems/SceneAssetPreloader';
import { applyVipRareBoost } from '@/systems/VipSystem';
import {
  generateVirtualPlayers,
  virtualPlayerDisplayName,
  type VirtualPlayer,
} from '@/systems/VirtualPlayers';
import { findPixelPath, type PixelPoint } from '@/systems/PixelPathfinding';
import { createGameplayAdvisorPanel } from '@/ui/GameplayAdvisorPanel';
import { createVerifiedContourZone, drawRaisedContour } from '@/ui/ContourInteractive';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createPortalFlash } from '@/ui/PortalFlash';
import { ensurePetTexture } from '@/utils/placeholder';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';
import { isWildBattleBlocked, toggleWildBattleBlocked } from '@/systems/WildBattleSettings';
import {
  hasClaimedLegacyPatrolToday,
  hasClaimedLegacyRewardToday,
  legacyDailyRewardKey,
  legacyLocationHasPatrol,
  legacyPatrolChainTarget,
  legacyPatrolChainProgressLabel,
  legacyPatrolRewardForLocation,
  legacyPatrolRewardKey,
  legacyTodayKey,
  markLegacyRewardClaimedToday,
  claimLegacyPatrolChainBonus,
  recordLegacyPatrolCompletion,
} from '@/systems/LegacyPatrol';
import {
  currentPlayerButtonLabel,
  currentPlayerSheetKey,
  currentPlayerWalkAnimKey,
  ensureCurrentPlayerWalkAnimation,
  togglePlayerGender,
} from '@/utils/playerAvatar';

import {
  LEGACY_LOCATIONS,
  type LegacyAction,
  type LegacyLocationDef,
  type LegacyLocationHotspot,
  type LegacyLocationId,
  type LegacyLocationNpc,
  type LegacyWalkZone,
} from './LegacyContent';

const PLAYER_SPEED = 178;
const PET_MIN_SPEED = 18;
const PET_MAX_SPEED = 40;
const PET_TOUCH_RADIUS = 24;
const PET_SPAWN_SAFE_RADIUS = 180;
const LOCATION_ROAMING_PET_COUNT = 1;
const LOCATION_VIRTUAL_PLAYER_COUNT = 2;
const ENCOUNTER_RETURN_COOLDOWN_MS = 1800;
const ENCOUNTER_RESUME_MOVE_DISTANCE = 28;
const PATROL_BADGE_TEXTURE_KEY = 'legacy_patrol_badge_image2';

interface WalkTarget {
  readonly x: number;
  readonly y: number;
  readonly action?: LegacyAction;
  readonly path?: PixelPoint[];
}

interface RoamingPet {
  readonly petId: string;
  readonly encounterZoneId: string;
  level: number;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  speed: number;
  retargetAt: number;
  homeX: number;
  homeY: number;
  roamRadius: number;
  idleUntil: number;
  baseScale: number;
  animationSeed: number;
}

interface RoamingVirtualPlayer {
  readonly data: VirtualPlayer;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  speed: number;
  retargetAt: number;
  homeX: number;
  homeY: number;
  roamRadius: number;
  idleUntil: number;
}

const LOCATION_PET_POOLS: Readonly<Record<string, readonly string[]>> = {
  'rainbow_city:garden': [
    'flame_puppy',
    'spark_mouse',
    'sunny_puppy',
    'dew_sprite',
    'stone_calf',
    'pester_priest',
    'fars_fire_donkey',
    'arthur_knight',
    'xuanqing_jingwei',
  ],
  'beach:shoreline': [
    'sand_crab',
    'seabreeze_gull',
    'spark_mouse',
    'sunny_puppy',
    'pearl_guard',
    'elephant_walrus',
    'aotian_dragon',
    'erebus_penguin',
    'ingmar_night',
    'hekapu_night',
  ],
  'bath_center:spa': ['zeng_ming'],
  'coral_market:harbor': ['coral_fin', 'coral_lantern', 'pearl_guard', 'sand_crab', 'cloud_ferret'],
  'star_observatory:starlight': ['star_jelly', 'aurora_deer', 'cloud_ferret', 'rainbow_wing'],
  'storm_ruins:tempest': ['storm_ray', 'crystal_golem', 'oni_tyranno', 'zeng_yi', 'aotian_dragon'],
  'tide_playground:lagoon': [
    'tide_otter',
    'pearl_guard',
    'coral_lantern',
    'seabreeze_gull',
    'aurora_deer',
  ],
};

const STORY_NPCS: Readonly<Partial<Record<LegacyLocationId, readonly LegacyLocationNpc[]>>> = {
  center: [
    {
      id: 'story-rainbow-warden',
      name: '虹心守望者',
      x: 504,
      y: 466,
      textureKey: 'npc_rainbow_archivist',
      scale: 0.11,
      dialogue:
        '彩虹核心记录着每只精灵和每条旧航线。裂光出现后，真正的修复只能靠探索、战斗和收集来完成。',
    },
  ],
  library: [
    {
      id: 'story-rainbow-archivist',
      name: '彩虹档案师',
      x: 506,
      y: 444,
      textureKey: 'npc_rainbow_archivist',
      scale: 0.11,
      dialogue:
        '我在旧档案里找到了虹心、飞船和水晶矿洞的记录。任务板上的主线会按你的真实行动推进。',
    },
  ],
  energy_cave: [
    {
      id: 'story-crystal-miner',
      name: '水晶矿工',
      x: 612,
      y: 438,
      textureKey: 'npc_crystal_miner',
      scale: 0.34,
      dialogue: '矿洞的蓝光会记录你的脚步。只要你真的进入这里，主线和每日巡晶任务都会收到回声。',
    },
  ],
};

export class LegacyLocationScene extends Phaser.Scene {
  private locationId: LegacyLocationId = 'center';
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private moveTarget: WalkTarget | null = null;
  private keyboardMoving = false;
  private hotspotPointerHandled = false;
  private battleStarting = false;
  private encounterCooldownUntil = 0;
  private encounterRequiresPlayerMove = false;
  private encounterResumePoint: { readonly x: number; readonly y: number } | null = null;
  private roamingPets: RoamingPet[] = [];
  private virtualPlayers: RoamingVirtualPlayer[] = [];
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: {
    readonly W: Phaser.Input.Keyboard.Key;
    readonly A: Phaser.Input.Keyboard.Key;
    readonly S: Phaser.Input.Keyboard.Key;
    readonly D: Phaser.Input.Keyboard.Key;
  } | null = null;
  private justCapturedPetId: string | null = null;
  private justDefeatedWildPetId: string | null = null;
  private justLostWildBattle = false;
  private escapedFromBattle = false;
  private justDefeatedTrainerName: string | null = null;
  private justLostTrainerBattle = false;

  public constructor() {
    super({ key: SceneKey.LEGACY_LOCATION });
  }

  public init(data?: {
    readonly locationId?: LegacyLocationId;
    readonly justCapturedPetId?: string;
    readonly justDefeatedWildPetId?: string;
    readonly justLostWildBattle?: boolean;
    readonly escapedFromBattle?: boolean;
    readonly justDefeatedTrainerName?: string;
    readonly justLostTrainerBattle?: boolean;
  }): void {
    this.locationId = data?.locationId ?? this.locationId;
    this.justCapturedPetId = data?.justCapturedPetId ?? null;
    this.justDefeatedWildPetId = data?.justDefeatedWildPetId ?? null;
    this.justLostWildBattle = data?.justLostWildBattle === true;
    this.escapedFromBattle = data?.escapedFromBattle === true;
    this.justDefeatedTrainerName = data?.justDefeatedTrainerName ?? null;
    this.justLostTrainerBattle = data?.justLostTrainerBattle === true;
    this.battleStarting = false;
    this.encounterCooldownUntil = 0;
    this.encounterRequiresPlayerMove = false;
    this.encounterResumePoint = null;
  }

  public preload(): void {
    preloadLegacyLocationAssets(this, this.locationId);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);

    const def = LEGACY_LOCATIONS[this.locationId];
    this.ensurePlayerAnimation();
    this.drawScene(def);
    this.setupInput();
    this.spawnRoamingPets(def);
    this.spawnVirtualPlayers(def);
    this.armEncounterReturnCooldown();
    this.completePendingLocationActivity();
    this.drawDifficultyBadge();
    this.createTopButton(42, 28, '地图', () =>
      this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.LEGACY_LOCATION }),
    );
    this.createTopButton(116, 28, '精灵', () =>
      this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.LEGACY_LOCATION }),
    );
    this.createTopButton(190, 28, '图鉴', () =>
      this.scene.start(SceneKey.PET_DEX, { fromScene: SceneKey.LEGACY_LOCATION }),
    );
    this.createTopButton(264, 28, '家园', () =>
      this.scene.start(SceneKey.HOME, { fromScene: SceneKey.LEGACY_LOCATION }),
    );
    this.createTopButton(338, 28, '活动', () =>
      this.scene.start(SceneKey.ACTIVITY, { fromScene: SceneKey.LEGACY_LOCATION }),
    );
    this.createTopButton(412, 28, '背包', () =>
      this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.LEGACY_LOCATION }),
    );
    this.createTopButton(486, 28, '存档', () =>
      this.scene.start(SceneKey.SAVE_SLOTS, { fromScene: SceneKey.LEGACY_LOCATION }),
    );
    this.createTopButton(560, 28, currentPlayerButtonLabel(), () => {
      togglePlayerGender();
      this.scene.restart({ locationId: this.locationId });
    });
    this.createTopButton(640, 28, this.wildBattleButtonLabel(), () => this.toggleWildBattle());
    this.createTopButton(724, 28, '签到', () => this.scene.start(SceneKey.VIP_PANEL));

    this.createTopButton(804, 28, '玩法', () =>
      this.scene.start(SceneKey.GUIDE, { fromScene: SceneKey.LEGACY_LOCATION }),
    );
    this.drawGameplayAdvisor();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearToast();
    });

    this.showReturnToast();
    gameEvents.emit('map:enter', { mapId: this.locationId });
  }

  public update(time: number, delta: number): void {
    const def = LEGACY_LOCATIONS[this.locationId];
    this.keyboardMoving = false;
    this.updateKeyboardMove(def, delta);
    this.updateClickMove(def, delta);
    this.updateRoamingPets(time, delta);
    this.updateVirtualPlayers(time, delta);
    this.updatePlayerVisual();
    this.checkPetTouch();
  }

  private drawScene(def: LegacyLocationDef): void {
    createResponsiveMapBackground(this, def.textureKey, {
      interactive: true,
      onPointerUp: (pointer: Phaser.Input.Pointer) => {
        if (this.hotspotPointerHandled) {
          this.hotspotPointerHandled = false;
          return;
        }
        this.walkToPoint(def, pointer.worldX, pointer.worldY);
      },
    });

    this.setupPlayer(def);
    for (const npc of def.npcs ?? []) {
      this.drawNpc(npc);
    }
    for (const npc of STORY_NPCS[def.id] ?? []) {
      this.drawNpc(npc);
    }
    for (const hotspot of def.hotspots) {
      this.drawHotspot(hotspot);
    }
  }

  private setupPlayer(def: LegacyLocationDef): void {
    this.playerShadow = this.add
      .ellipse(def.playerStart.x, def.playerStart.y + 20, 52, 17, 0x000000, 0.26)
      .setDepth(400);
    this.player = this.add
      .sprite(def.playerStart.x, def.playerStart.y - 18, currentPlayerSheetKey(), 0)
      .setOrigin(0.5, 0.88)
      .setScale(0.74)
      .setDepth(430);
  }

  private ensurePlayerAnimation(): void {
    ensureCurrentPlayerWalkAnimation(this);
  }

  private drawHotspot(hotspot: LegacyLocationHotspot): void {
    const radius = hotspot.radius ?? 28;
    const contour = legacyHotspotContour(hotspot);
    const contourBounds = createVerifiedContourZone(this, {
      area: contour,
      depth: 1200,
      label: `${this.locationId}.${hotspot.id}`,
      minWidth: 24,
      minHeight: 18,
      worldBounds: { left: 0, right: GAME_WIDTH, top: 0, bottom: GAME_HEIGHT },
    });
    if (isPortalLikeHotspot(hotspot.action)) {
      createPortalFlash(this, hotspot.x, hotspot.y, {
        radius: Math.max(radius + 2, contourBounds.bounds.width * 0.32),
        depth: 358,
        yScale: 0.7,
      });
    }
    const g = this.add.graphics().setDepth(360);
    const labelBg = this.add.graphics().setDepth(361);
    const label = this.add
      .text(hotspot.x, contourBounds.bounds.top - 20, this.hotspotLabel(hotspot), {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        align: 'center',
        lineSpacing: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(362)
      .setAlpha(0);
    const color = this.hotspotColor(hotspot.action);
    const draw = (hover: boolean): void => {
      g.clear();
      labelBg.clear();
      label.setText(this.hotspotLabel(hotspot));
      label.setAlpha(hover ? 1 : 0);
      if (hover) {
        const width = Math.max(96, Math.min(214, label.width + 22));
        const height = label.height + 12;
        labelBg.fillStyle(0x0b3768, 0.86);
        labelBg.lineStyle(2, color, 0.88);
        labelBg.fillRoundedRect(
          hotspot.x - width / 2,
          contourBounds.bounds.top - height - 28,
          width,
          height,
          7,
        );
        labelBg.strokeRoundedRect(
          hotspot.x - width / 2,
          contourBounds.bounds.top - height - 28,
          width,
          height,
          7,
        );
      }
      drawRaisedContour(g, contourBounds.area, {
        color,
        active: hover,
        fillAlpha: hover ? 0.16 : 0.04,
      });
      label.setColor('#fff7c7');
    };
    draw(false);

    const hit = contourBounds.zone;
    hit.on('pointerover', () => draw(true));
    hit.on('pointerout', () => draw(false));
    hit.on('pointerup', () => {
      this.hotspotPointerHandled = true;
      this.time.delayedCall(30, () => {
        this.hotspotPointerHandled = false;
      });
      this.walkToHotspot(hotspot);
    });
  }

  private hotspotColor(action: LegacyAction): number {
    if (isPortalLikeHotspot(action)) return 0xffd93d;
    switch (action.kind) {
      case 'battle':
        return 0xff6b6b;
      case 'reward':
        return 0xff9f2f;
      case 'scene':
        return 0x8fe8ff;
      case 'location':
        return 0xffd93d;
      case 'toast':
        return 0xc9a7ff;
    }
    return 0x8fe8ff;
  }

  private hotspotLabel(hotspot: LegacyLocationHotspot): string {
    const status = this.hotspotStatusSuffix(hotspot);
    return `${hotspot.label}\n${hotspot.action.label}${status}`;
  }

  private hotspotStatusSuffix(hotspot: LegacyLocationHotspot): string {
    if (hotspot.action.kind === 'battle' && hotspot.action.encounterZoneId) {
      return hasClaimedLegacyPatrolToday(this.locationId) ? ' · 巡护已完成' : ' · 巡护未完成';
    }

    const reward = hotspot.action.reward;
    if (!reward?.oncePerDay) return '';
    const key = legacyDailyRewardKey(this.locationId, hotspot.action.label);
    return hasClaimedLegacyRewardToday(key) ? ' · 今日已领' : ' · 每日';
  }

  private drawNpc(npc: LegacyLocationNpc): void {
    const textureKey = this.textures.exists(npc.textureKey)
      ? npc.textureKey
      : 'legacy_player_fairy';
    const shadow = this.add
      .ellipse(npc.x, npc.y + 18, 42, 14, 0x000000, 0.24)
      .setDepth(420 + npc.y);
    const sprite = this.add
      .image(npc.x, npc.y, textureKey)
      .setOrigin(0.5, 0.88)
      .setScale(npc.scale ?? 0.64)
      .setDepth(430 + npc.y)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(npc.x, npc.y - 58, npc.name, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#fff7c7',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(sprite.depth + 1)
      .setAlpha(0);
    const showLabel = (): void => {
      label.setAlpha(1);
    };
    const hideLabel = (): void => {
      label.setAlpha(0);
    };
    const startTalk = (): void => {
      this.hotspotPointerHandled = true;
      this.time.delayedCall(30, () => {
        this.hotspotPointerHandled = false;
      });
      this.walkToNpc(npc);
    };
    sprite.on('pointerover', showLabel).on('pointerout', hideLabel).on('pointerup', startTalk);
    shadow.setInteractive(new Phaser.Geom.Ellipse(0, 0, 64, 42), Phaser.Geom.Ellipse.Contains);
    shadow.on('pointerover', showLabel).on('pointerout', hideLabel).on('pointerup', startTalk);
  }

  private setupInput(): void {
    this.cursors = this.input.keyboard?.createCursorKeys() ?? null;
    this.wasd = this.input.keyboard
      ? (this.input.keyboard.addKeys({
          W: Phaser.Input.Keyboard.KeyCodes.W,
          A: Phaser.Input.Keyboard.KeyCodes.A,
          S: Phaser.Input.Keyboard.KeyCodes.S,
          D: Phaser.Input.Keyboard.KeyCodes.D,
        }) as {
          W: Phaser.Input.Keyboard.Key;
          A: Phaser.Input.Keyboard.Key;
          S: Phaser.Input.Keyboard.Key;
          D: Phaser.Input.Keyboard.Key;
        })
      : null;
  }

  private spawnRoamingPets(def: LegacyLocationDef): void {
    this.roamingPets.forEach((pet) => {
      pet.sprite.destroy();
      pet.shadow.destroy();
      pet.label.destroy();
    });
    this.roamingPets = [];

    const zoneId = this.findLocationEncounterZone(def);
    if (!zoneId) return;
    const pool = LOCATION_PET_POOLS[zoneId] ?? LOCATION_PET_POOLS['rainbow_city:garden'];
    if (!pool) return;

    const picked = Phaser.Utils.Array.Shuffle([...pool]).slice(
      0,
      roamingPetBudget(LOCATION_ROAMING_PET_COUNT),
    );
    for (const petId of picked) {
      if (!petId) continue;
      const point = this.randomLocationPoint(def, PET_SPAWN_SAFE_RADIUS);
      const x = point.x;
      const y = point.y;
      const textureKey = ensurePetTexture(this, petId);
      const shadow = this.add.ellipse(x, y + 18, 38, 13, 0x000000, 0.22).setDepth(410);
      const sprite = this.add
        .image(x, y, textureKey)
        .setOrigin(0.5, 0.82)
        .setInteractive({ useHandCursor: true })
        .setDepth(430 + y);
      const source = this.textures.get(textureKey).getSourceImage() as {
        width: number;
        height: number;
      };
      const targetSize = textureKey.startsWith('legacy_doll_') ? 64 : 48;
      const baseScale = targetSize / Math.max(source.width, source.height);
      sprite.setScale(baseScale);
      const name = getPet(petId)?.name ?? '旧版精灵';
      const label = this.add
        .text(x, y - 48, name, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '15px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(sprite.depth + 1)
        .setAlpha(0);
      const pet: RoamingPet = {
        petId,
        encounterZoneId: zoneId,
        level: rollLocationWildLevel(this.locationId),
        sprite,
        shadow,
        label,
        targetX: x,
        targetY: y,
        speed: Phaser.Math.Between(PET_MIN_SPEED, PET_MAX_SPEED),
        retargetAt: 0,
        homeX: x,
        homeY: y,
        roamRadius: Phaser.Math.Between(70, 125),
        idleUntil: 0,
        baseScale,
        animationSeed: Phaser.Math.FloatBetween(0, Math.PI * 2),
      };
      this.pickPetTarget(def, pet, this.time.now);
      sprite
        .on('pointerover', () => label.setAlpha(1))
        .on('pointerout', () => label.setAlpha(0))
        .on('pointerup', () => this.startRoamingPetBattle(pet));
      this.roamingPets.push(pet);
    }
  }

  private spawnVirtualPlayers(def: LegacyLocationDef): void {
    this.virtualPlayers.forEach((vp) => {
      vp.sprite.destroy();
      vp.shadow.destroy();
      vp.label.destroy();
    });
    this.virtualPlayers = [];

    const diff = difficultyForLocation(this.locationId);
    const players = generateVirtualPlayers({
      locationId: this.locationId,
      count: virtualPlayerBudget(LOCATION_VIRTUAL_PLAYER_COUNT),
      minLevel: diff.wildLevelRange[0],
      maxLevel: Math.max(diff.wildLevelRange[1], diff.recommended + 1),
      seed: `${this.locationId}:${legacyTodayKey()}`,
    });

    for (const data of players) {
      const point = this.randomLocationPoint(def, 140);
      const shadow = this.add.ellipse(point.x, point.y + 20, 46, 15, 0x000000, 0.25).setDepth(414);
      const sprite = this.add
        .sprite(point.x, point.y - 14, data.avatarKey, 0)
        .setOrigin(0.5, 0.88)
        .setScale(0.64)
        .setTint(data.tint)
        .setDepth(434 + point.y)
        .setInteractive({ useHandCursor: true });
      const labelText = this.virtualPlayerLabel(data);
      const label = this.add
        .text(point.x, point.y - 74, labelText, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '15px',
          color: '#fff7c7',
          stroke: '#1b1b3a',
          strokeThickness: 4,
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(sprite.depth + 1)
        .setAlpha(0.92);
      const vp: RoamingVirtualPlayer = {
        data,
        sprite,
        shadow,
        label,
        targetX: point.x,
        targetY: point.y,
        speed: Phaser.Math.Between(42, 78),
        retargetAt: 0,
        homeX: point.x,
        homeY: point.y,
        roamRadius: Phaser.Math.Between(92, 168),
        idleUntil: 0,
      };
      this.ensureVirtualPlayerAnimation(data.avatarKey);
      this.pickVirtualPlayerTarget(def, vp, this.time.now);
      sprite
        .on('pointerover', () => label.setAlpha(1))
        .on('pointerout', () => label.setAlpha(0.92))
        .on('pointerup', () => this.walkToVirtualPlayer(vp));
      shadow.setInteractive(new Phaser.Geom.Ellipse(0, 0, 70, 44), Phaser.Geom.Ellipse.Contains);
      shadow
        .on('pointerover', () => label.setAlpha(1))
        .on('pointerout', () => label.setAlpha(0.92))
        .on('pointerup', () => this.walkToVirtualPlayer(vp));
      this.virtualPlayers.push(vp);
    }
  }

  private updateVirtualPlayers(time: number, delta: number): void {
    const def = LEGACY_LOCATIONS[this.locationId];
    for (const vp of this.virtualPlayers) {
      const dx = vp.targetX - vp.sprite.x;
      const dy = vp.targetY - vp.sprite.y;
      const dist = Math.hypot(dx, dy);
      const moving = time >= vp.idleUntil && vp.speed > 0 && dist >= 6 && time < vp.retargetAt;
      if (time < vp.idleUntil) {
        this.updateVirtualPlayerVisual(vp, false, dx);
        continue;
      }
      if (dist < 6 || time >= vp.retargetAt) {
        this.pickVirtualPlayerTarget(def, vp, time);
        this.updateVirtualPlayerVisual(vp, false, dx);
        continue;
      }
      const step = (vp.speed * delta) / 1000;
      vp.sprite.setPosition(vp.sprite.x + (dx / dist) * step, vp.sprite.y + (dy / dist) * step);
      vp.sprite.setFlipX(dx < 0);
      this.updateVirtualPlayerVisual(vp, moving, dx);
    }
  }

  private updateVirtualPlayerVisual(vp: RoamingVirtualPlayer, moving: boolean, dx: number): void {
    if (moving) {
      const key = this.virtualPlayerAnimKey(vp.data.avatarKey);
      if (!vp.sprite.anims.isPlaying) vp.sprite.play(key);
      vp.sprite.setFlipX(dx < 0);
    } else {
      vp.sprite.anims.stop();
      vp.sprite.setFrame(0);
    }
    vp.shadow.setPosition(vp.sprite.x, vp.sprite.y + 20);
    vp.label.setPosition(vp.sprite.x, vp.sprite.y - 74);
    vp.sprite.setDepth(434 + vp.sprite.y);
    vp.shadow.setDepth(vp.sprite.depth - 1);
    vp.label.setDepth(vp.sprite.depth + 1);
  }

  private pickVirtualPlayerTarget(
    def: LegacyLocationDef,
    vp: RoamingVirtualPlayer,
    time: number,
  ): void {
    if (Math.random() < 0.36) {
      vp.targetX = vp.sprite.x;
      vp.targetY = vp.sprite.y;
      vp.speed = 0;
      vp.idleUntil = time + Phaser.Math.Between(1100, 3200);
      vp.retargetAt = vp.idleUntil;
      return;
    }
    vp.idleUntil = 0;
    const target = this.randomLocationPointNear(def, vp.homeX, vp.homeY, vp.roamRadius);
    vp.targetX = target.x;
    vp.targetY = target.y;
    vp.speed = Phaser.Math.Between(42, 78);
    vp.retargetAt = time + Phaser.Math.Between(2400, 5600);
  }

  private updateRoamingPets(time: number, delta: number): void {
    const def = LEGACY_LOCATIONS[this.locationId];
    for (const pet of this.roamingPets) {
      const dx = pet.targetX - pet.sprite.x;
      const dy = pet.targetY - pet.sprite.y;
      const dist = Math.hypot(dx, dy);
      const moving = time >= pet.idleUntil && pet.speed > 0 && dist >= 6 && time < pet.retargetAt;
      if (time < pet.idleUntil) {
        this.updateRoamingPetVisual(pet, time, false, 0, 0);
        continue;
      }
      if (dist < 6 || time >= pet.retargetAt) {
        this.pickPetTarget(def, pet, time);
        this.updateRoamingPetVisual(pet, time, false, dx, dy);
        continue;
      }
      const step = (pet.speed * delta) / 1000;
      pet.sprite.setPosition(pet.sprite.x + (dx / dist) * step, pet.sprite.y + (dy / dist) * step);
      pet.sprite.setFlipX(dx < 0);
      this.updateRoamingPetVisual(pet, time, moving, dx, dy);
    }
  }

  private updateRoamingPetVisual(
    pet: RoamingPet,
    time: number,
    moving: boolean,
    dx: number,
    dy: number,
  ): void {
    const intensity = motionScale();
    const phase = time / (moving ? 135 : 260) + pet.animationSeed;
    const bounce = Math.sin(phase);
    const sway = Math.sin(time / 185 + pet.animationSeed * 0.7);
    const breathe = Math.sin(time / 420 + pet.animationSeed);
    const squash = (moving ? Math.abs(bounce) * 0.055 : breathe * 0.025) * intensity;
    const scaleX = pet.baseScale * (1 + squash * 0.7);
    const scaleY = pet.baseScale * (1 - squash * 0.52);
    const bob = (moving ? Math.abs(bounce) * 5.2 : breathe * 1.8) * intensity;
    const lean =
      moving && Math.abs(dx) + Math.abs(dy) > 0.1 ? Phaser.Math.Clamp(dx / 90, -1, 1) : 0;

    pet.sprite.setScale(scaleX, scaleY);
    pet.sprite.setRotation((sway * (moving ? 0.045 : 0.018) + lean * 0.025) * intensity);
    pet.shadow.setPosition(pet.sprite.x, pet.sprite.y + 18);
    pet.shadow.setScale(1 + Math.abs(bounce) * (moving ? 0.09 : 0.03), 1 - Math.abs(bounce) * 0.05);
    pet.shadow.setAlpha(moving ? 0.18 + Math.abs(bounce) * 0.06 : 0.2);
    pet.label.setPosition(pet.sprite.x, pet.sprite.y - 48 - (moving ? bob * 0.25 : 0));
    pet.sprite.setDepth(430 + pet.sprite.y);
    pet.shadow.setDepth(pet.sprite.depth - 1);
    pet.label.setDepth(pet.sprite.depth + 1);
  }

  private pickPetTarget(def: LegacyLocationDef, pet: RoamingPet, time: number): void {
    if (Math.random() < 0.45) {
      pet.targetX = pet.sprite.x;
      pet.targetY = pet.sprite.y;
      pet.speed = 0;
      pet.idleUntil = time + Phaser.Math.Between(900, 2600);
      pet.retargetAt = pet.idleUntil;
      return;
    }
    pet.idleUntil = 0;
    const target = this.randomLocationPointNear(def, pet.homeX, pet.homeY, pet.roamRadius);
    pet.targetX = target.x;
    pet.targetY = target.y;
    pet.speed = Phaser.Math.Between(PET_MIN_SPEED, PET_MAX_SPEED);
    pet.retargetAt = time + Phaser.Math.Between(2400, 6200);
  }

  private checkPetTouch(): void {
    if (isWildBattleBlocked()) return;
    if (this.battleStarting) return;
    if (this.time.now < this.encounterCooldownUntil) return;
    if (this.encounterRequiresPlayerMove) return;
    for (const pet of this.roamingPets) {
      const dist = Math.hypot(pet.sprite.x - this.player.x, pet.sprite.y - this.player.y);
      if (dist <= PET_TOUCH_RADIUS) {
        this.startRoamingPetBattle(pet);
        return;
      }
    }
  }

  private updateKeyboardMove(def: LegacyLocationDef, delta: number): void {
    if (!this.cursors || !this.wasd) return;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left?.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.cursors.right?.isDown || this.wasd.D.isDown) vx += 1;
    if (this.cursors.up?.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.cursors.down?.isDown || this.wasd.S.isDown) vy += 1;
    if (vx === 0 && vy === 0) return;

    this.moveTarget = null;
    const len = Math.hypot(vx, vy);
    const step = (PLAYER_SPEED * delta) / 1000;
    if (vx !== 0) this.player.setFlipX(vx < 0);
    this.keyboardMoving = true;
    this.setPlayerPosition(
      def,
      this.player.x + (vx / len) * step,
      this.player.y + (vy / len) * step,
    );
  }

  private updateClickMove(def: LegacyLocationDef, delta: number): void {
    if (!this.moveTarget) return;
    const dx = this.moveTarget.x - this.player.x;
    const dy = this.moveTarget.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    const step = (PLAYER_SPEED * delta) / 1000;
    if (dist <= Math.max(4, step)) {
      const action = this.moveTarget.action;
      this.setPlayerPosition(def, this.moveTarget.x, this.moveTarget.y);
      if (this.advanceMoveTarget()) return;
      this.moveTarget = null;
      if (action) this.runAction(action);
      return;
    }
    if (Math.abs(dx) > 2) this.player.setFlipX(dx < 0);
    const moved = this.setPlayerPosition(
      def,
      this.player.x + (dx / dist) * step,
      this.player.y + (dy / dist) * step,
    );
    if (!moved) this.moveTarget = null;
  }

  private updatePlayerVisual(): void {
    const moving = Boolean(this.moveTarget) || this.keyboardMoving;
    if (moving) {
      if (!this.player.anims.isPlaying) {
        this.player.play(currentPlayerWalkAnimKey());
      }
    } else {
      this.player.anims.stop();
      this.player.setFrame(0);
    }
    this.playerShadow.setPosition(this.player.x, this.player.y + 20);
    this.player.setDepth(430 + this.player.y);
    this.playerShadow.setDepth(this.player.depth - 1);
  }

  private walkToHotspot(hotspot: LegacyLocationHotspot): void {
    const def = LEGACY_LOCATIONS[this.locationId];
    const target = this.findNearestLocationWalkable(def, hotspot.x, hotspot.y - 18);
    this.setMovePath(def, target, hotspot.action);
  }

  private walkToNpc(npc: LegacyLocationNpc): void {
    const def = LEGACY_LOCATIONS[this.locationId];
    const target = this.findNearestLocationWalkable(def, npc.x - 36, npc.y - 14);
    this.setMovePath(def, target, {
      label: npc.name,
      kind: 'toast',
      message: `${npc.name}：${npc.dialogue}`,
    });
  }

  private walkToVirtualPlayer(vp: RoamingVirtualPlayer): void {
    const def = LEGACY_LOCATIONS[this.locationId];
    const target = this.findNearestLocationWalkable(def, vp.sprite.x - 38, vp.sprite.y + 4);
    this.setMovePath(def, target);
    const check = this.time.addEvent({
      delay: 120,
      repeat: 30,
      callback: () => {
        if (
          !this.moveTarget ||
          Math.hypot(this.player.x - vp.sprite.x, this.player.y - vp.sprite.y) < 74
        ) {
          check.remove(false);
          this.startVirtualPlayerBattle(vp.data);
        }
      },
    });
  }

  private walkToPoint(def: LegacyLocationDef, x: number, y: number): void {
    const target = this.findNearestLocationWalkable(def, x, y - 18);
    this.setMovePath(def, target);
  }

  private setMovePath(def: LegacyLocationDef, target: PixelPoint, action?: LegacyAction): void {
    const path = findPixelPath({
      bounds: def.walkArea,
      start: { x: this.player.x, y: this.player.y },
      target,
      isWalkable: (x, y) => this.isLocationWalkable(def, x, y),
      cellSize: 24,
    });
    if (!path) {
      this.moveTarget = null;
      return;
    }
    const route = path.slice(1);
    const first = route.shift();
    if (first) {
      this.moveTarget = { x: first.x, y: first.y, path: route, ...(action ? { action } : {}) };
      return;
    }
    this.moveTarget = null;
    if (action) this.runAction(action);
  }

  private advanceMoveTarget(): boolean {
    const next = this.moveTarget?.path?.shift();
    if (!next || !this.moveTarget) return false;
    this.moveTarget = {
      ...this.moveTarget,
      x: next.x,
      y: next.y,
    };
    return true;
  }

  private setPlayerPosition(def: LegacyLocationDef, x: number, y: number): boolean {
    const next = {
      x: Phaser.Math.Clamp(x, def.walkArea.left, def.walkArea.right),
      y: Phaser.Math.Clamp(y, def.walkArea.top, def.walkArea.bottom),
    };
    if (!this.isLocationWalkable(def, next.x, next.y)) {
      return false;
    }
    this.player.setPosition(next.x, next.y);
    this.updateEncounterResumeByMovement(next.x, next.y);
    return true;
  }

  private createTopButton(x: number, y: number, label: string, onClick: () => void): void {
    createNavIconButton(this, {
      x,
      y,
      label,
      onClick,
      depth: 901,
      width: label.length >= 3 ? 78 : 66,
      height: 48,
    });
  }

  private runAction(action: LegacyAction): void {
    if (action.kind === 'scene' && action.target) {
      if (action.target === SceneKey.SHOP) {
        this.scene.start(action.target, {
          fromScene: SceneKey.LEGACY_LOCATION,
          returnLocationId: this.locationId,
        });
      } else if (action.target === SceneKey.CASINO) {
        this.scene.start(action.target, {
          fromScene: SceneKey.LEGACY_LOCATION,
          returnLocationId: this.locationId,
        });
      } else if (action.target === SceneKey.CRYSTAL_MINE) {
        this.scene.start(action.target, {
          returnLocationId: this.locationId,
        });
      } else if (action.target === SceneKey.MAZE_TRIAL) {
        this.scene.start(action.target, {
          returnLocationId: this.locationId,
        });
      } else if (action.target === SceneKey.LIBRARY_ARCHIVE) {
        this.scene.start(action.target, {
          returnLocationId: this.locationId,
        });
      } else if (action.target === SceneKey.SHIP_CORE) {
        this.scene.start(action.target, {
          returnLocationId: this.locationId,
        });
      } else {
        this.scene.start(action.target);
      }
      return;
    }
    if (action.kind === 'location' && action.locationId) {
      this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: action.locationId });
      return;
    }
    if (action.kind === 'battle' && action.encounterZoneId) {
      if (isWildBattleBlocked()) {
        this.showToast('已开启避战，野生精灵不会主动拉你进入战斗。');
        return;
      }
      this.startWildBattle(action.encounterZoneId);
      return;
    }
    if (action.kind === 'reward') {
      this.claimLegacyReward(action);
      return;
    }
    this.showToast(action.message ?? '这里还在修复中。');
  }

  private claimLegacyReward(action: LegacyAction): void {
    const reward = action.reward;
    if (!reward) {
      this.showToast('这里还在修复中。');
      return;
    }

    const key = legacyDailyRewardKey(this.locationId, action.label);
    if (reward.oncePerDay && hasClaimedLegacyRewardToday(key)) {
      this.showToast(reward.claimedMessage ?? '今天已经领取过了。');
      return;
    }

    if (reward.coins) {
      PlayerState.addCoins(reward.coins);
    }
    for (const item of reward.items ?? []) {
      PlayerState.addItem(item.itemId, item.quantity);
    }
    if (reward.oncePerDay) {
      markLegacyRewardClaimedToday(key);
    }
    this.showToast(reward.successMessage);
  }

  private tryClaimLegacyPatrolReward(): string | null {
    if (!legacyLocationHasPatrol(this.locationId) || hasClaimedLegacyPatrolToday(this.locationId)) {
      return null;
    }

    const reward = legacyPatrolRewardForLocation(this.locationId);
    PlayerState.addCoins(reward.coins);
    PlayerState.addItem(reward.itemId, reward.itemQuantity);
    markLegacyRewardClaimedToday(legacyPatrolRewardKey(this.locationId));
    const progress = recordLegacyPatrolCompletion(this.locationId);
    const bonus = claimLegacyPatrolChainBonus();
    const messages = [
      `巡护完成：+${reward.coins} 彩虹币，+${reward.itemQuantity} ${reward.itemLabel}`,
      `连续巡护：今日${progress.completedLocationIds.length}/${legacyPatrolChainTarget()} · 连勤${progress.streakDays}天`,
    ];
    if (bonus) {
      PlayerState.addCoins(bonus.reward.coins);
      PlayerState.addItem(bonus.reward.itemId, bonus.reward.itemQuantity);
      messages.push(
        `连锁奖励：+${bonus.reward.coins} 彩虹币，+${bonus.reward.itemQuantity} ${bonus.reward.itemLabel}`,
      );
    }
    return messages.join('\n');
  }

  private startRoamingPetBattle(pet: RoamingPet): void {
    if (this.battleStarting) return;
    if (this.time.now < this.encounterCooldownUntil) return;
    if (isWildBattleBlocked()) {
      this.showToast('已开启避战，野生精灵不会主动拉你进入战斗。');
      return;
    }
    this.battleStarting = true;
    this.startWildBattle(pet.encounterZoneId, pet.petId, pet.level);
  }

  private armEncounterReturnCooldown(): void {
    if (
      this.justCapturedPetId ||
      this.justDefeatedWildPetId ||
      this.justLostWildBattle ||
      this.escapedFromBattle
    ) {
      this.encounterCooldownUntil = this.time.now + ENCOUNTER_RETURN_COOLDOWN_MS;
      this.encounterRequiresPlayerMove = true;
      this.encounterResumePoint = { x: this.player.x, y: this.player.y };
    }
  }

  private updateEncounterResumeByMovement(x: number, y: number): void {
    if (!this.encounterRequiresPlayerMove || !this.encounterResumePoint) return;
    const dist = Math.hypot(x - this.encounterResumePoint.x, y - this.encounterResumePoint.y);
    if (dist >= ENCOUNTER_RESUME_MOVE_DISTANCE) {
      this.encounterRequiresPlayerMove = false;
      this.encounterResumePoint = null;
    }
  }

  private randomLocationPoint(
    def: LegacyLocationDef,
    minDistanceFromPlayer = 0,
  ): { readonly x: number; readonly y: number } {
    for (let i = 0; i < 80; i += 1) {
      const point = {
        x: Phaser.Math.Between(def.walkArea.left + 30, def.walkArea.right - 30),
        y: Phaser.Math.Between(def.walkArea.top + 30, def.walkArea.bottom - 20),
      };
      const farEnough =
        minDistanceFromPlayer <= 0 ||
        !this.player ||
        Math.hypot(point.x - this.player.x, point.y - this.player.y) >= minDistanceFromPlayer;
      if (farEnough && this.isLocationWalkable(def, point.x, point.y)) return point;
    }
    return { x: def.playerStart.x, y: def.playerStart.y };
  }

  private randomLocationPointNear(
    def: LegacyLocationDef,
    centerX: number,
    centerY: number,
    radius: number,
  ): { readonly x: number; readonly y: number } {
    for (let i = 0; i < 60; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(12, radius);
      const point = {
        x: Phaser.Math.Clamp(
          centerX + Math.cos(angle) * distance,
          def.walkArea.left,
          def.walkArea.right,
        ),
        y: Phaser.Math.Clamp(
          centerY + Math.sin(angle) * distance,
          def.walkArea.top,
          def.walkArea.bottom,
        ),
      };
      if (this.isLocationWalkable(def, point.x, point.y)) return point;
    }
    return { x: centerX, y: centerY };
  }

  private completePendingLocationActivity(): void {
    if (this.locationId !== 'bath_center') return;
    const pending = consumePendingActivityTask('bath_center');
    if (!pending) return;
    if (
      pending.activityId === 'lele_temptation_tasks' &&
      pending.taskId === 'visit_bath_center' &&
      completeActivityTask(pending.activityId, pending.taskId)
    ) {
      PlayerState.addCoins(30);
      this.showToast('乐乐的诱惑：已到达洗浴中心，任务进度已记录。');
    }
  }

  private wildBattleButtonLabel(): string {
    return isWildBattleBlocked() ? '避战开' : '避战关';
  }

  private drawGameplayAdvisor(): void {
    createGameplayAdvisorPanel(this, {
      x: 20,
      y: 74,
      width: 308,
      depth: 902,
      fromScene: SceneKey.LEGACY_LOCATION,
      sceneData: { returnLocationId: this.locationId },
      maxRows: 2,
      suggestions: buildGameplaySuggestions({ save: PlayerState.snapshot(), max: 2 }),
    });
  }

  private toggleWildBattle(): void {
    const blocked = toggleWildBattleBlocked();
    this.showToast(blocked ? '已屏蔽野生精灵战斗。' : '已恢复野生精灵战斗。');
    this.scene.restart({ locationId: this.locationId });
  }

  private findNearestLocationWalkable(
    def: LegacyLocationDef,
    x: number,
    y: number,
  ): { readonly x: number; readonly y: number } {
    const base = {
      x: Phaser.Math.Clamp(x, def.walkArea.left, def.walkArea.right),
      y: Phaser.Math.Clamp(y, def.walkArea.top, def.walkArea.bottom),
    };
    if (this.isLocationWalkable(def, base.x, base.y)) return base;

    for (let radius = 12; radius <= 190; radius += 12) {
      for (let angle = 0; angle < 360; angle += 30) {
        const rad = Phaser.Math.DegToRad(angle);
        const point = {
          x: Phaser.Math.Clamp(
            base.x + Math.cos(rad) * radius,
            def.walkArea.left,
            def.walkArea.right,
          ),
          y: Phaser.Math.Clamp(
            base.y + Math.sin(rad) * radius,
            def.walkArea.top,
            def.walkArea.bottom,
          ),
        };
        if (this.isLocationWalkable(def, point.x, point.y)) return point;
      }
    }
    return def.playerStart;
  }

  private isLocationWalkable(def: LegacyLocationDef, x: number, y: number): boolean {
    if (
      x < def.walkArea.left ||
      x > def.walkArea.right ||
      y < def.walkArea.top ||
      y > def.walkArea.bottom
    ) {
      return false;
    }
    const walkZones = def.walkZones ?? [
      {
        kind: 'rect' as const,
        left: def.walkArea.left,
        right: def.walkArea.right,
        top: def.walkArea.top,
        bottom: def.walkArea.bottom,
      },
    ];
    const inWalkZone = walkZones.some((zone) => this.isPointInWalkZone(zone, x, y));
    const inBlockedZone = (def.blockZones ?? []).some((zone) => this.isPointInWalkZone(zone, x, y));
    return inWalkZone && !inBlockedZone;
  }

  private isPointInWalkZone(zone: LegacyWalkZone, x: number, y: number): boolean {
    if (zone.kind === 'rect') {
      return x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom;
    }
    const dx = (x - zone.x) / zone.rx;
    const dy = (y - zone.y) / zone.ry;
    return dx * dx + dy * dy <= 1;
  }

  private startWildBattle(zoneId: string, visiblePetId?: string, visibleLevel?: number): void {
    const myPet = PlayerState.snapshot().playerPets[0];
    if (!myPet) {
      this.battleStarting = false;
      this.showToast('没有可出战的精灵。');
      return;
    }
    const live = PlayerState.getPlayerPet(myPet.petId);
    if (live && live.currentHp <= 0) {
      live.currentHp = live.currentStats.hp;
      PlayerState.persist();
    }

    const def = getEncounter(zoneId);
    if (!def) {
      this.battleStarting = false;
      this.showToast('这里暂时没有精灵出没。');
      return;
    }
    const roll = rollEncounter({ ...def, triggerPerStep: 1 }, Math.random);
    const encounter = visiblePetId
      ? { petId: visiblePetId, level: visibleLevel ?? roll?.level ?? 5 }
      : roll;
    if (!encounter) {
      this.battleStarting = false;
      this.showToast('这里暂时很安静。');
      return;
    }
    const fixedLevelEncounter = {
      ...encounter,
      level: rollLocationWildLevel(this.locationId),
    };
    const boosted = applyVipRareBoost(fixedLevelEncounter, PlayerState.isVip(), Math.random);
    this.scene.start(SceneKey.BATTLE_INTRO, {
      mode: 'wild',
      petId: myPet.petId,
      wildPetId: boosted.petId,
      wildLevel: boosted.level,
      fromScene: this.scene.key,
      returnLocationId: this.locationId,
    });
  }

  private findLocationEncounterZone(def: LegacyLocationDef): string | null {
    for (const hotspot of def.hotspots) {
      if (hotspot.action.kind === 'battle' && hotspot.action.encounterZoneId) {
        return hotspot.action.encounterZoneId;
      }
    }
    return null;
  }

  private drawDifficultyBadge(): void {
    const diff = difficultyForLocation(this.locationId);
    const label = `${recommendedLevelLabel(this.locationId)}  野外 Lv${diff.wildLevelRange[0]}-${diff.wildLevelRange[1]}`;
    const x = GAME_WIDTH - 146;
    const y = 76;
    const width = 236;
    this.add
      .rectangle(x, y, width, 34, 0x0b3768, 0.74)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setDepth(902);
    this.add
      .text(x, y, label, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(903);

    this.drawPatrolBadge(x, y + 42, width);
  }

  private drawPatrolBadge(x: number, y: number, width: number): void {
    if (!legacyLocationHasPatrol(this.locationId)) return;

    const reward = legacyPatrolRewardForLocation(this.locationId);
    const claimed = hasClaimedLegacyPatrolToday(this.locationId);
    const fill = claimed ? 0x123b4b : 0x174b68;
    const stroke = claimed ? 0x8fe8ff : 0xffd166;
    const title = claimed ? '巡护 已完成' : '巡护 待完成';
    const detail = claimed
      ? legacyPatrolChainProgressLabel()
      : `战斗/收服 +${reward.coins}币 · ${legacyPatrolChainProgressLabel()}`;

    this.add.rectangle(x, y, width, 48, fill, 0.82).setStrokeStyle(2, stroke, 0.66).setDepth(902);

    this.drawPatrolBadgeIcon(x - width / 2 + 26, y, stroke, claimed);

    this.add
      .text(x - width / 2 + 50, y, `${title}\n${detail}`, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: claimed ? '#c8f7ff' : '#fff6d2',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        fixedWidth: width - 60,
        lineSpacing: 1,
      })
      .setOrigin(0, 0.5)
      .setDepth(903);
  }

  private drawPatrolBadgeIcon(x: number, y: number, stroke: number, claimed: boolean): void {
    if (this.textures.exists(PATROL_BADGE_TEXTURE_KEY)) {
      this.add.image(x, y, PATROL_BADGE_TEXTURE_KEY).setDisplaySize(34, 34).setDepth(903);
      return;
    }

    const icon = this.add.graphics().setDepth(903);
    icon.lineStyle(2, stroke, 0.92);
    icon.strokeCircle(x, y, 12);
    icon.lineStyle(1, 0xffffff, 0.72);
    icon.beginPath();
    icon.moveTo(x, y - 16);
    icon.lineTo(x, y + 16);
    icon.moveTo(x - 16, y);
    icon.lineTo(x + 16, y);
    icon.strokePath();
    icon.fillStyle(claimed ? 0x8fe8ff : 0xffef9a, 0.9);
    icon.fillTriangle(x, y - 9, x + 5, y + 4, x - 4, y + 2);
  }

  private showReturnToast(): void {
    if (this.escapedFromBattle) {
      this.showToast('已经离开战斗。');
      this.escapedFromBattle = false;
    } else if (this.justDefeatedTrainerName) {
      this.showToast(`战胜了虚拟玩家 ${this.justDefeatedTrainerName}！`);
      this.justDefeatedTrainerName = null;
    } else if (this.justLostTrainerBattle) {
      this.showToast('这次玩家对战输了，调整队伍后再挑战吧。');
      this.justLostTrainerBattle = false;
    } else if (this.justCapturedPetId) {
      const pet = getPet(this.justCapturedPetId);
      const patrolMessage = this.tryClaimLegacyPatrolReward();
      const captureMessage = pet ? `你收服了 ${pet.name}！` : '你收服了一只新伙伴！';
      this.showToast(patrolMessage ? `${captureMessage}\n${patrolMessage}` : captureMessage);
      this.justCapturedPetId = null;
    } else if (this.justDefeatedWildPetId) {
      const pet = getPet(this.justDefeatedWildPetId);
      const patrolMessage = this.tryClaimLegacyPatrolReward();
      const defeatMessage = pet ? `战胜 ${pet.name}！` : '战胜了野生精灵！';
      this.showToast(patrolMessage ? `${defeatMessage}\n${patrolMessage}` : defeatMessage);
      this.justDefeatedWildPetId = null;
    } else if (this.justLostWildBattle) {
      this.showToast('野生精灵跑远了。');
      this.justLostWildBattle = false;
    }
  }

  private startVirtualPlayerBattle(trainer: VirtualPlayer): void {
    if (this.battleStarting) return;
    const myPet = PlayerState.snapshot().playerPets[0];
    const lead = trainer.party[0];
    if (!myPet) {
      this.showToast('没有可出战的精灵。');
      return;
    }
    if (!lead) {
      this.showToast(`${virtualPlayerDisplayName(trainer)} 的队伍还没准备好。`);
      return;
    }
    const live = PlayerState.getPlayerPet(myPet.petId);
    if (live && live.currentHp <= 0) {
      live.currentHp = live.currentStats.hp;
      PlayerState.persist();
    }
    this.battleStarting = true;
    this.scene.start(SceneKey.BATTLE_INTRO, {
      mode: 'trainer',
      petId: myPet.petId,
      trainer,
      fromScene: this.scene.key,
      returnLocationId: this.locationId,
    });
  }

  private virtualPlayerLabel(player: VirtualPlayer): string {
    const lead = player.party[0];
    const petName = lead ? (getPet(lead.petId)?.name ?? '精灵') : '精灵';
    return `${virtualPlayerDisplayName(player)}\n搭档 ${petName} Lv${lead?.level ?? 1}`;
  }

  private ensureVirtualPlayerAnimation(sheetKey: string): void {
    const key = this.virtualPlayerAnimKey(sheetKey);
    if (this.anims.exists(key)) return;
    this.anims.create({
      key,
      frames: this.anims.generateFrameNumbers(sheetKey, { start: 0, end: 3 }),
      frameRate: 5,
      repeat: -1,
    });
  }

  private virtualPlayerAnimKey(sheetKey: string): string {
    return `virtual-player-walk-${sheetKey}`;
  }

  private showToast(message: string): void {
    this.clearToast();
    this.toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 128, message, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        wordWrap: { width: 760 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.toastTimer = this.time.delayedCall(2000, () => {
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
