import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { getEncounter } from '@/data/encounters';
import { getPet } from '@/data/pets';
import { AudioManager } from '@/systems/AudioManager';
import { gameEvents } from '@/systems/EventBus';
import { buildGameplaySuggestions } from '@/systems/GameplayAdvisor';
import { PlayerState } from '@/systems/PlayerState';
import { rollEncounter } from '@/systems/EncounterRoller';
import { preloadStartupWorldAssets } from '@/systems/SceneAssetPreloader';
import { applyVipRareBoost } from '@/systems/VipSystem';
import { findPixelPath, type PixelPoint } from '@/systems/PixelPathfinding';
import { createGameplayAdvisorPanel } from '@/ui/GameplayAdvisorPanel';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createPortalFlash } from '@/ui/PortalFlash';
import { ensurePetTexture } from '@/utils/placeholder';
import {
  createResponsiveMapBackground,
  type ResponsiveMapBackground,
} from '@/utils/responsiveBackground';
import { isWildBattleBlocked, toggleWildBattleBlocked } from '@/systems/WildBattleSettings';
import {
  currentPlayerButtonLabel,
  currentPlayerSheetKey,
  currentPlayerWalkAnimKey,
  ensureCurrentPlayerWalkAnimation,
  togglePlayerGender,
} from '@/utils/playerAvatar';
import { computeEdgeFollowCameraScroll } from '@/utils/responsiveMapDisplay';
import {
  isWorldMapWalkable,
  nearestWorldMapWalkable,
  WORLD_MAP_WALK_BOUNDS,
} from '@/systems/WorldMapWalkMask';

import type { LegacyAction } from './LegacyContent';

const PLAYER_SPEED = 178;
const PET_MIN_SPEED = 20;
const PET_MAX_SPEED = 42;
const PET_TOUCH_RADIUS = 24;
const PET_SPAWN_SAFE_RADIUS = 270;
const ROAMING_PET_COUNT = 1;
const INITIAL_ENCOUNTER_GRACE_MS = 2200;
const ENCOUNTER_RETURN_COOLDOWN_MS = 1800;
const ENCOUNTER_RESUME_MOVE_DISTANCE = 28;
const CAMERA_EDGE_FOLLOW_LERP = 0.08;

const PLAYER_START = { x: 238, y: 510 } as const;

interface WalkTarget {
  readonly x: number;
  readonly y: number;
  readonly action?: LegacyAction;
  readonly path?: PixelPoint[];
}

interface WorldPortal {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly radius?: number;
  readonly action: LegacyAction;
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

const WORLD_PORTALS: readonly WorldPortal[] = [
  {
    label: '图书馆',
    x: 552,
    y: 276,
    radius: 24,
    action: { label: '图书馆', kind: 'location', locationId: 'library' },
  },
  {
    label: '实验室',
    x: 328,
    y: 356,
    radius: 24,
    action: { label: '实验室', kind: 'location', locationId: 'lab' },
  },
  {
    label: '魔法学院',
    x: 728,
    y: 300,
    radius: 24,
    action: { label: '魔法学院', kind: 'location', locationId: 'magic_school' },
  },
  {
    label: '迷宫',
    x: 824,
    y: 388,
    radius: 24,
    action: { label: '迷宫', kind: 'location', locationId: 'maze' },
  },
  {
    label: '能源田',
    x: 812,
    y: 500,
    radius: 23,
    action: { label: '能源田', kind: 'location', locationId: 'energy_field' },
  },
  {
    label: '飞船',
    x: 426,
    y: 498,
    radius: 23,
    action: { label: '飞船内部', kind: 'location', locationId: 'spaceship' },
  },
  {
    label: '赌场',
    x: 622,
    y: 520,
    radius: 23,
    action: { label: '彩贝赌场', kind: 'location', locationId: 'casino' },
  },
];

const ROAMING_POOL: ReadonlyArray<{
  readonly petId: string;
  readonly zoneId: string;
  readonly minLevel: number;
  readonly maxLevel: number;
}> = [
  { petId: 'flame_puppy', zoneId: 'rainbow_city:garden', minLevel: 7, maxLevel: 9 },
  { petId: 'spark_mouse', zoneId: 'rainbow_city:garden', minLevel: 7, maxLevel: 9 },
  { petId: 'sunny_puppy', zoneId: 'rainbow_city:garden', minLevel: 7, maxLevel: 9 },
  { petId: 'dew_sprite', zoneId: 'rainbow_city:garden', minLevel: 7, maxLevel: 9 },
  { petId: 'stone_calf', zoneId: 'rainbow_city:garden', minLevel: 7, maxLevel: 9 },
  { petId: 'pester_priest', zoneId: 'rainbow_city:garden', minLevel: 7, maxLevel: 9 },
  { petId: 'fars_fire_donkey', zoneId: 'rainbow_city:garden', minLevel: 7, maxLevel: 9 },
  { petId: 'arthur_knight', zoneId: 'rainbow_city:garden', minLevel: 7, maxLevel: 9 },
  { petId: 'elephant_walrus', zoneId: 'beach:shoreline', minLevel: 14, maxLevel: 16 },
  { petId: 'rainbow_wing', zoneId: 'rainbow_city:garden', minLevel: 7, maxLevel: 9 },
];

export class LegacyMapScene extends Phaser.Scene {
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private moveTarget: WalkTarget | null = null;
  private keyboardMoving = false;
  private portalPointerHandled = false;
  private battleStarting = false;
  private encounterCooldownUntil = 0;
  private encounterRequiresPlayerMove = false;
  private encounterResumePoint: { readonly x: number; readonly y: number } | null = null;
  private roamingPets: RoamingPet[] = [];
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: {
    readonly W: Phaser.Input.Keyboard.Key;
    readonly A: Phaser.Input.Keyboard.Key;
    readonly S: Phaser.Input.Keyboard.Key;
    readonly D: Phaser.Input.Keyboard.Key;
  } | null = null;
  private worldBackground: ResponsiveMapBackground | null = null;
  private cameraFollowBounds = { left: 0, top: 0, width: GAME_WIDTH, height: GAME_HEIGHT };
  private hasInitializedCameraBounds = false;
  private justCapturedPetId: string | null = null;
  private justDefeatedWildPetId: string | null = null;
  private justWonBossId: string | null = null;
  private justLostWildBattle = false;
  private escapedFromBattle = false;

  public constructor() {
    super({ key: SceneKey.WORLD });
  }

  public preload(): void {
    preloadStartupWorldAssets(this);
  }

  public init(data?: {
    readonly justCapturedPetId?: string;
    readonly justDefeatedWildPetId?: string;
    readonly justWonBossId?: string;
    readonly justLostWildBattle?: boolean;
    readonly escapedFromBattle?: boolean;
  }): void {
    this.justCapturedPetId = data?.justCapturedPetId ?? null;
    this.justDefeatedWildPetId = data?.justDefeatedWildPetId ?? null;
    this.justWonBossId = data?.justWonBossId ?? null;
    this.justLostWildBattle = data?.justLostWildBattle === true;
    this.escapedFromBattle = data?.escapedFromBattle === true;
    this.battleStarting = false;
    this.encounterCooldownUntil = 0;
    this.encounterRequiresPlayerMove = false;
    this.encounterResumePoint = null;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.drawWorld();
    this.ensurePlayerAnimation();
    this.setupPlayer();
    this.setupPlayerCameraFollow();
    this.setupInput();
    this.spawnRoamingPets();
    this.armEncounterReturnCooldown();
    this.encounterCooldownUntil = Math.max(
      this.encounterCooldownUntil,
      this.time.now + INITIAL_ENCOUNTER_GRACE_MS,
    );

    this.createTopButton(42, 28, '首页', () => this.scene.start(SceneKey.TITLE));
    this.createTopButton(116, 28, '地图', () =>
      this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.WORLD }),
    );
    this.createTopButton(190, 28, '精灵', () =>
      this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.WORLD }),
    );
    this.createTopButton(264, 28, '图鉴', () =>
      this.scene.start(SceneKey.PET_DEX, { fromScene: SceneKey.WORLD }),
    );
    this.createTopButton(338, 28, '家园', () =>
      this.scene.start(SceneKey.HOME, { fromScene: SceneKey.WORLD }),
    );
    this.createTopButton(412, 28, '活动', () =>
      this.scene.start(SceneKey.ACTIVITY, { fromScene: SceneKey.WORLD }),
    );
    this.createTopButton(486, 28, '背包', () =>
      this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.WORLD }),
    );
    this.createTopButton(560, 28, currentPlayerButtonLabel(), () => {
      togglePlayerGender();
      this.scene.restart();
    });
    this.createTopButton(640, 28, this.wildBattleButtonLabel(), () => this.toggleWildBattle());
    this.createTopButton(724, 28, '签到', () => this.scene.start(SceneKey.VIP_PANEL));

    this.createTopButton(804, 28, '玩法', () =>
      this.scene.start(SceneKey.GUIDE, { fromScene: SceneKey.WORLD }),
    );
    this.drawGameplayAdvisor();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.refreshPlayerCameraFollow, this);
      this.clearToast();
    });

    this.showReturnToast();
    AudioManager.play('world_rainbow', undefined, this);
    gameEvents.emit('map:enter', { mapId: 'legacy_rainbow_city_center' });
  }

  public update(time: number, delta: number): void {
    this.keyboardMoving = false;
    this.updateKeyboardMove(delta);
    this.updateClickMove(delta);
    this.updateRoamingPets(time, delta);
    this.updatePlayerVisual();
    this.updatePlayerCameraFollow(delta);
    this.checkPetTouch();
  }

  private drawWorld(): void {
    this.worldBackground = createResponsiveMapBackground(this, 'legacy_7k7k_2', {
      interactive: true,
      onPointerUp: (pointer: Phaser.Input.Pointer) => {
        if (this.portalPointerHandled) {
          this.portalPointerHandled = false;
          return;
        }
        this.walkToPoint(pointer.worldX, pointer.worldY);
      },
    });

    for (const portal of WORLD_PORTALS) {
      this.drawPortal(portal);
    }
  }

  private drawPortal(portal: WorldPortal): void {
    const radius = portal.radius ?? 24;
    createPortalFlash(this, portal.x, portal.y, {
      radius: radius + 2,
      depth: 358,
      yScale: 0.7,
    });
    const g = this.add.graphics().setDepth(360);
    const label = this.add
      .text(portal.x, portal.y - radius - 17, portal.label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(362)
      .setAlpha(0);
    const draw = (hover: boolean): void => {
      g.clear();
      label.setAlpha(hover ? 1 : 0);
      if (!hover) return;
      g.fillStyle(0xffd93d, 0.2);
      g.lineStyle(2, 0xffffff, 0.72);
      g.fillCircle(portal.x, portal.y, radius);
      g.strokeCircle(portal.x, portal.y, radius);
      label.setColor('#fff4a8');
    };
    draw(false);
    this.add
      .zone(portal.x, portal.y, radius * 2, radius * 2)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => draw(true))
      .on('pointerout', () => draw(false))
      .on('pointerup', () => {
        this.portalPointerHandled = true;
        this.time.delayedCall(30, () => {
          this.portalPointerHandled = false;
        });
        const target = this.findNearestWorldWalkable(portal.x, portal.y - 18);
        this.setMovePath(target, portal.action);
      });
  }

  private ensurePlayerAnimation(): void {
    ensureCurrentPlayerWalkAnimation(this);
  }

  private setupPlayer(): void {
    this.playerShadow = this.add
      .ellipse(PLAYER_START.x, PLAYER_START.y + 20, 52, 17, 0x000000, 0.26)
      .setDepth(400);
    this.player = this.add
      .sprite(PLAYER_START.x, PLAYER_START.y - 18, currentPlayerSheetKey(), 0)
      .setOrigin(0.5, 0.88)
      .setScale(0.74)
      .setDepth(430);
  }

  private setupPlayerCameraFollow(): void {
    this.refreshPlayerCameraBounds();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.refreshPlayerCameraFollow, this);
  }

  private refreshPlayerCameraFollow(): void {
    this.refreshPlayerCameraBounds();
  }

  private refreshPlayerCameraBounds(): void {
    if (!this.player) return;
    const camera = this.cameras.main;
    const visibleWidth = Math.max(GAME_WIDTH, camera.width);
    const visibleHeight = Math.max(GAME_HEIGHT, camera.height);
    const bounds = this.worldBackground?.getDisplayBounds() ?? {
      left: 0,
      top: 0,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    };
    const worldWidth = Math.max(bounds.width, visibleWidth);
    const worldHeight = Math.max(bounds.height, visibleHeight);
    const left = GAME_WIDTH / 2 - worldWidth / 2;
    const top = GAME_HEIGHT / 2 - worldHeight / 2;

    this.cameraFollowBounds = { left, top, width: worldWidth, height: worldHeight };
    camera.setBounds(left, top, worldWidth, worldHeight);
    if (!this.hasInitializedCameraBounds) {
      this.hasInitializedCameraBounds = true;
      camera.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    }
  }

  private updatePlayerCameraFollow(delta: number): void {
    if (!this.player) return;
    const camera = this.cameras.main;
    const visibleWidth = Math.max(GAME_WIDTH, camera.width);
    const visibleHeight = Math.max(GAME_HEIGHT, camera.height);
    const interpolation = 1 - Math.pow(1 - CAMERA_EDGE_FOLLOW_LERP, Math.max(1, delta) / 16.67);

    camera.setScroll(
      computeEdgeFollowCameraScroll({
        currentScroll: camera.scrollX,
        targetPosition: this.player.x,
        visibleSize: visibleWidth,
        worldStart: this.cameraFollowBounds.left,
        worldSize: this.cameraFollowBounds.width,
        interpolation,
      }),
      computeEdgeFollowCameraScroll({
        currentScroll: camera.scrollY,
        targetPosition: this.player.y,
        visibleSize: visibleHeight,
        worldStart: this.cameraFollowBounds.top,
        worldSize: this.cameraFollowBounds.height,
        interpolation,
        edgeRatio: 0.22,
        minEdgeSize: 86,
        maxEdgeSize: 210,
      }),
    );
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

  private spawnRoamingPets(): void {
    this.roamingPets.forEach((pet) => {
      pet.sprite.destroy();
      pet.shadow.destroy();
      pet.label.destroy();
    });
    this.roamingPets = [];

    const picked = Phaser.Utils.Array.Shuffle([...ROAMING_POOL]).slice(0, ROAMING_PET_COUNT);
    for (const spec of picked) {
      if (!spec) continue;
      const point = this.randomWorldPoint(PET_SPAWN_SAFE_RADIUS);
      const x = point.x;
      const y = point.y;
      const textureKey = ensurePetTexture(this, spec.petId);
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
      const targetSize = textureKey.startsWith('legacy_doll_') ? 62 : 48;
      const baseScale = targetSize / Math.max(source.width, source.height);
      sprite.setScale(baseScale);
      const name = getPet(spec.petId)?.name ?? '旧版精灵';
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
        petId: spec.petId,
        encounterZoneId: spec.zoneId,
        level: Phaser.Math.Between(spec.minLevel, spec.maxLevel),
        sprite,
        shadow,
        label,
        targetX: x,
        targetY: y,
        speed: Phaser.Math.Between(PET_MIN_SPEED, PET_MAX_SPEED),
        retargetAt: 0,
        homeX: x,
        homeY: y,
        roamRadius: Phaser.Math.Between(76, 140),
        idleUntil: 0,
        baseScale,
        animationSeed: Phaser.Math.FloatBetween(0, Math.PI * 2),
      };
      this.pickPetTarget(pet, this.time.now);
      sprite
        .on('pointerover', () => label.setAlpha(1))
        .on('pointerout', () => label.setAlpha(0))
        .on('pointerup', () => this.startRoamingPetBattle(pet));
      this.roamingPets.push(pet);
    }
  }

  private updateKeyboardMove(delta: number): void {
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
    this.setPlayerPosition(this.player.x + (vx / len) * step, this.player.y + (vy / len) * step);
  }

  private updateClickMove(delta: number): void {
    if (!this.moveTarget) return;
    const dx = this.moveTarget.x - this.player.x;
    const dy = this.moveTarget.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    const step = (PLAYER_SPEED * delta) / 1000;
    if (dist <= Math.max(4, step)) {
      const action = this.moveTarget.action;
      this.setPlayerPosition(this.moveTarget.x, this.moveTarget.y);
      if (this.advanceMoveTarget()) return;
      this.moveTarget = null;
      if (action) this.runAction(action);
      return;
    }
    if (Math.abs(dx) > 2) this.player.setFlipX(dx < 0);
    const moved = this.setPlayerPosition(
      this.player.x + (dx / dist) * step,
      this.player.y + (dy / dist) * step,
    );
    if (!moved) this.moveTarget = null;
  }

  private updateRoamingPets(time: number, delta: number): void {
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
        this.pickPetTarget(pet, time);
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
    const phase = time / (moving ? 135 : 260) + pet.animationSeed;
    const bounce = Math.sin(phase);
    const sway = Math.sin(time / 185 + pet.animationSeed * 0.7);
    const breathe = Math.sin(time / 420 + pet.animationSeed);
    const squash = moving ? Math.abs(bounce) * 0.055 : breathe * 0.025;
    const scaleX = pet.baseScale * (1 + squash * 0.7);
    const scaleY = pet.baseScale * (1 - squash * 0.52);
    const bob = moving ? Math.abs(bounce) * 5.2 : breathe * 1.8;
    const lean =
      moving && Math.abs(dx) + Math.abs(dy) > 0.1 ? Phaser.Math.Clamp(dx / 90, -1, 1) : 0;

    pet.sprite.setScale(scaleX, scaleY);
    pet.sprite.setRotation(sway * (moving ? 0.045 : 0.018) + lean * 0.025);
    pet.shadow.setPosition(pet.sprite.x, pet.sprite.y + 18);
    pet.shadow.setScale(1 + Math.abs(bounce) * (moving ? 0.09 : 0.03), 1 - Math.abs(bounce) * 0.05);
    pet.shadow.setAlpha(moving ? 0.18 + Math.abs(bounce) * 0.06 : 0.2);
    pet.label.setPosition(pet.sprite.x, pet.sprite.y - 48 - (moving ? bob * 0.25 : 0));
    pet.sprite.setDepth(430 + pet.sprite.y);
    pet.shadow.setDepth(pet.sprite.depth - 1);
    pet.label.setDepth(pet.sprite.depth + 1);
  }

  private pickPetTarget(pet: RoamingPet, time: number): void {
    if (Math.random() < 0.45) {
      pet.targetX = pet.sprite.x;
      pet.targetY = pet.sprite.y;
      pet.speed = 0;
      pet.idleUntil = time + Phaser.Math.Between(900, 2600);
      pet.retargetAt = pet.idleUntil;
      return;
    }
    pet.idleUntil = 0;
    const target = this.randomWorldPointNear(pet.homeX, pet.homeY, pet.roamRadius);
    pet.targetX = target.x;
    pet.targetY = target.y;
    pet.speed = Phaser.Math.Between(PET_MIN_SPEED, PET_MAX_SPEED);
    pet.retargetAt = time + Phaser.Math.Between(2400, 6200);
  }

  private updatePlayerVisual(): void {
    const moving = Boolean(this.moveTarget) || this.keyboardMoving;
    if (moving) {
      if (!this.player.anims.isPlaying) this.player.play(currentPlayerWalkAnimKey());
    } else {
      this.player.anims.stop();
      this.player.setFrame(0);
    }
    this.playerShadow.setPosition(this.player.x, this.player.y + 20);
    this.player.setDepth(430 + this.player.y);
    this.playerShadow.setDepth(this.player.depth - 1);
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

  private walkToPoint(x: number, y: number): void {
    const target = this.findNearestWorldWalkable(x, y - 18);
    this.setMovePath(target);
  }

  private setMovePath(target: PixelPoint, action?: LegacyAction): void {
    const path = findPixelPath({
      bounds: WORLD_MAP_WALK_BOUNDS,
      start: { x: this.player.x, y: this.player.y },
      target,
      isWalkable: (x, y) => this.isWorldWalkable(x, y),
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

  private setPlayerPosition(x: number, y: number): boolean {
    const next = {
      x: Phaser.Math.Clamp(x, WORLD_MAP_WALK_BOUNDS.left, WORLD_MAP_WALK_BOUNDS.right),
      y: Phaser.Math.Clamp(y, WORLD_MAP_WALK_BOUNDS.top, WORLD_MAP_WALK_BOUNDS.bottom),
    };
    if (!this.isWorldWalkable(next.x, next.y)) {
      return false;
    }
    this.player.setPosition(next.x, next.y);
    this.updateEncounterResumeByMovement(next.x, next.y);
    return true;
  }

  private randomWorldPoint(minDistanceFromPlayer = 0): { readonly x: number; readonly y: number } {
    for (let i = 0; i < 80; i += 1) {
      const point = {
        x: Phaser.Math.Between(WORLD_MAP_WALK_BOUNDS.left + 30, WORLD_MAP_WALK_BOUNDS.right - 30),
        y: Phaser.Math.Between(WORLD_MAP_WALK_BOUNDS.top + 30, WORLD_MAP_WALK_BOUNDS.bottom - 20),
      };
      const farEnough =
        minDistanceFromPlayer <= 0 ||
        !this.player ||
        Math.hypot(point.x - this.player.x, point.y - this.player.y) >= minDistanceFromPlayer;
      if (this.isWorldWalkable(point.x, point.y) && farEnough) return point;
    }
    return PLAYER_START;
  }

  private randomWorldPointNear(
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
          WORLD_MAP_WALK_BOUNDS.left,
          WORLD_MAP_WALK_BOUNDS.right,
        ),
        y: Phaser.Math.Clamp(
          centerY + Math.sin(angle) * distance,
          WORLD_MAP_WALK_BOUNDS.top,
          WORLD_MAP_WALK_BOUNDS.bottom,
        ),
      };
      if (this.isWorldWalkable(point.x, point.y)) return point;
    }
    return { x: centerX, y: centerY };
  }

  private findNearestWorldWalkable(
    x: number,
    y: number,
  ): { readonly x: number; readonly y: number } {
    return nearestWorldMapWalkable(x, y);
  }

  private isWorldWalkable(x: number, y: number): boolean {
    return isWorldMapWalkable(x, y);
  }

  private runAction(action: LegacyAction): void {
    if (action.kind === 'scene' && action.target) {
      this.scene.start(action.target);
      return;
    }
    if (action.kind === 'location' && action.locationId) {
      this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: action.locationId });
      return;
    }
    this.showToast(action.message ?? '这里还在修复中。');
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

  private wildBattleButtonLabel(): string {
    return isWildBattleBlocked() ? '避战开' : '避战关';
  }

  private drawGameplayAdvisor(): void {
    createGameplayAdvisorPanel(this, {
      x: 20,
      y: 74,
      width: 308,
      depth: 902,
      fromScene: SceneKey.WORLD,
      maxRows: 2,
      suggestions: buildGameplaySuggestions({ save: PlayerState.snapshot(), max: 2 }),
    });
  }

  private toggleWildBattle(): void {
    const blocked = toggleWildBattleBlocked();
    this.showToast(blocked ? '已屏蔽野生精灵战斗。' : '已恢复野生精灵战斗。');
    this.scene.restart();
  }

  private armEncounterReturnCooldown(): void {
    if (
      this.justCapturedPetId ||
      this.justDefeatedWildPetId ||
      this.justWonBossId ||
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
    const rolled = def ? rollEncounter({ ...def, triggerPerStep: 1 }, Math.random) : null;
    const encounter = visiblePetId
      ? { petId: visiblePetId, level: visibleLevel ?? rolled?.level ?? 5 }
      : rolled;
    if (!encounter) {
      this.battleStarting = false;
      this.showToast('这里暂时没有精灵出没。');
      return;
    }
    const boosted = applyVipRareBoost(encounter, PlayerState.isVip(), Math.random);
    this.scene.start(SceneKey.BATTLE_INTRO, {
      mode: 'wild',
      petId: myPet.petId,
      wildPetId: boosted.petId,
      wildLevel: boosted.level,
      fromScene: this.scene.key,
    });
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

  private showReturnToast(): void {
    if (this.escapedFromBattle) {
      this.showToast('已经离开战斗。');
      this.escapedFromBattle = false;
    } else if (this.justCapturedPetId) {
      const pet = getPet(this.justCapturedPetId);
      this.showToast(pet ? `你收服了 ${pet.name}！` : '你收服了一只新伙伴！');
      this.justCapturedPetId = null;
    } else if (this.justDefeatedWildPetId) {
      const pet = getPet(this.justDefeatedWildPetId);
      this.showToast(pet ? `战胜 ${pet.name}！` : '战胜了野外精灵！');
      this.justDefeatedWildPetId = null;
    } else if (this.justWonBossId) {
      this.showToast('道馆胜利已经记录！');
      this.justWonBossId = null;
    } else if (this.justLostWildBattle) {
      this.showToast('野生精灵跑远了。');
      this.justLostWildBattle = false;
    }
  }

  private showToast(message: string): void {
    this.clearToast();
    this.toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 70, message, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
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
