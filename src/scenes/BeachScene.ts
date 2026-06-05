import Phaser from 'phaser';

import {
  BACKGROUND_COLOR,
  GAME_HEIGHT,
  GAME_WIDTH,
  PLAYER_SPEED,
  SceneKey,
} from '@/config/GameConfig';
import { getEncounter } from '@/data/encounters';
import { getPet } from '@/data/pets';
import { rollEncounter } from '@/systems/EncounterRoller';
import { AudioManager } from '@/systems/AudioManager';
import {
  MAX_BEACH_FORAGE_CLAIMS_PER_DAY,
  claimBeachForagePoint,
  readBeachForageState,
  writeBeachForageState,
} from '@/systems/BeachForage';
import { gameEvents } from '@/systems/EventBus';
import { PlayerState } from '@/systems/PlayerState';
import { preloadBeachAssets } from '@/systems/SceneAssetPreloader';
import { applyVipRareBoost } from '@/systems/VipSystem';
import { computeIsoFacing } from '@/systems/direction';
import type { IsoDir } from '@/types/direction';
import { makeHud, type HudHandle } from '@/ui/Hud';
import { createNavIconButton } from '@/ui/NavIconButton';
import { generateHaibaoFrames, haibaoTextureKey, registerHaibaoAnims } from '@/utils/haibaoSprite';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

type BeachHotspotKind = 'portal' | 'encounter' | 'forage' | 'info';

interface BeachHotspot {
  readonly id: string;
  readonly kind: BeachHotspotKind;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly color: number;
  readonly target?: string;
  readonly zoneId?: string;
  readonly foragePointId?: string;
  readonly message?: string;
}

const BEACH_BACKGROUND_KEY = 'legacy_beach_integrated';
const PLAYER_SPAWN = { x: 404, y: 452 } as const;
const HOTSPOT_NEAR_PAD = 64;

const BEACH_HOTSPOTS: readonly BeachHotspot[] = [
  {
    id: 'portal_back',
    kind: 'portal',
    label: '回彩虹城',
    x: 108,
    y: 382,
    rx: 84,
    ry: 112,
    color: 0xffd93d,
    target: SceneKey.WORLD,
  },
  {
    id: 'coral_shallows',
    kind: 'encounter',
    label: '珊瑚浅滩',
    x: 390,
    y: 214,
    rx: 130,
    ry: 72,
    color: 0x42d7ff,
    zoneId: 'beach:shoreline',
  },
  {
    id: 'tide_pool',
    kind: 'encounter',
    label: '潮池巡游',
    x: 626,
    y: 304,
    rx: 148,
    ry: 94,
    color: 0x5de6be,
    zoneId: 'beach:shoreline',
  },
  {
    id: 'shell_ridge',
    kind: 'forage',
    label: '拾贝沙脊',
    x: 754,
    y: 506,
    rx: 166,
    ry: 82,
    color: 0xff9ec7,
    foragePointId: 'shell_ridge',
  },
  {
    id: 'coral_glint',
    kind: 'forage',
    label: '珊瑚微光',
    x: 476,
    y: 258,
    rx: 92,
    ry: 52,
    color: 0xc084fc,
    foragePointId: 'coral_glint',
  },
  {
    id: 'beach_sign',
    kind: 'info',
    label: '海滨告示',
    x: 304,
    y: 344,
    rx: 74,
    ry: 48,
    color: 0xfff4a8,
    message: '潮池和珊瑚浅滩会遇到海滨精灵，拾贝沙脊每天有少量材料。',
  },
];

/**
 * 海滨沙滩场景。
 *
 * 这一版把早期等距瓦片沙滩重建为 image2/gptimage2 整图地图：贝壳回城门、潮池、
 * 珊瑚浅滩和拾贝点都嵌在同一张背景里，运行时只保留轻量标签、触发圈和真实玩法。
 */
export class BeachScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    readonly W: Phaser.Input.Keyboard.Key;
    readonly A: Phaser.Input.Keyboard.Key;
    readonly S: Phaser.Input.Keyboard.Key;
    readonly D: Phaser.Input.Keyboard.Key;
  };

  private readonly facing: { current: IsoDir } = { current: 'se' };
  private readonly activeHotspots = new Set<string>();

  private hud: HudHandle | null = null;
  private moveTarget: Phaser.Math.Vector2 | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private encounterCooldownUntil = 0;
  private forageCounter: Phaser.GameObjects.Text | null = null;

  private justCapturedPetId: string | null = null;
  private justDefeatedWildPetId: string | null = null;

  public constructor() {
    super({ key: SceneKey.BEACH });
  }

  public init(data?: { justCapturedPetId?: string; justDefeatedWildPetId?: string }): void {
    this.justCapturedPetId = data?.justCapturedPetId ?? null;
    this.justDefeatedWildPetId = data?.justDefeatedWildPetId ?? null;
  }

  public preload(): void {
    preloadBeachAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0, 0);
    this.facing.current = 'se';
    this.activeHotspots.clear();
    this.encounterCooldownUntil = 0;

    this.drawMap();
    this.drawHotspots();
    this.setupPlayer();
    this.setupInput();
    this.drawTitleHint();
    this.drawQuickButtons();
    this.drawForageCounter();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud?.destroy();
      this.hud = null;
      this.clearToast();
      this.moveTarget = null;
      this.activeHotspots.clear();
    });

    if (this.justCapturedPetId) {
      const pet = getPet(this.justCapturedPetId);
      this.showToast(pet ? `你收服了 ${pet.name}！` : '你收服了一只新伙伴！');
      this.justCapturedPetId = null;
    } else if (this.justDefeatedWildPetId) {
      const pet = getPet(this.justDefeatedWildPetId);
      this.showToast(pet ? `战胜 ${pet.name}！` : '战胜了野生精灵！');
      this.justDefeatedWildPetId = null;
    } else {
      this.showToast('海风把贝壳路吹亮了。');
    }

    AudioManager.play('world_beach', undefined, this);
    gameEvents.emit('map:enter', { mapId: 'beach' });
  }

  public update(_time: number, delta: number): void {
    const keyboardVelocity = this.readKeyboardVelocity();
    const movingByKeyboard = keyboardVelocity.vx !== 0 || keyboardVelocity.vy !== 0;
    const velocity = movingByKeyboard ? keyboardVelocity : this.readClickVelocity();
    if (movingByKeyboard) this.moveTarget = null;

    this.movePlayer(velocity.vx, velocity.vy, delta);
    this.applyFacingFromVelocity(velocity.vx, velocity.vy);
    this.updateHotspotTriggers();
  }

  private drawMap(): void {
    if (this.textures.exists(BEACH_BACKGROUND_KEY)) {
      createResponsiveMapBackground(this, BEACH_BACKGROUND_KEY, { depth: 0 });
    } else {
      this.drawFallbackBeach();
    }

    const shade = this.add.graphics().setDepth(1);
    shade.fillGradientStyle(0xffffff, 0xffffff, 0x000000, 0x000000, 0.08, 0.02, 0.06, 0.18);
    shade.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  private drawFallbackBeach(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0x58d8ef, 0x58d8ef, 0x1ca7d6, 0x1ca7d6, 1);
    g.fillRect(0, 0, GAME_WIDTH, 260);
    g.fillGradientStyle(0xf8dc8a, 0xf8dc8a, 0xe9b45c, 0xe9b45c, 1);
    g.fillRect(0, 240, GAME_WIDTH, GAME_HEIGHT - 240);
    g.fillStyle(0xd9f6ff, 0.9);
    g.fillEllipse(110, 384, 142, 176);
    g.fillStyle(0x48c6d9, 0.85);
    g.fillEllipse(626, 304, 256, 158);
  }

  private drawHotspots(): void {
    for (const hotspot of BEACH_HOTSPOTS) {
      const g = this.add.graphics().setDepth(34);
      g.fillStyle(hotspot.color, hotspot.kind === 'info' ? 0.12 : 0.1);
      g.fillEllipse(hotspot.x, hotspot.y, hotspot.rx * 2, hotspot.ry * 2);
      g.lineStyle(2, hotspot.color, 0.58);
      g.strokeEllipse(hotspot.x, hotspot.y, hotspot.rx * 2, hotspot.ry * 2);
      this.tweens.add({
        targets: g,
        alpha: { from: 0.72, to: 0.36 },
        duration: 1300 + (hotspot.x % 5) * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      const label = this.add
        .text(hotspot.x, hotspot.y - hotspot.ry - 10, hotspot.label, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: hotspot.label.length >= 5 ? '14px' : '15px',
          color: '#ffffff',
          stroke: '#123657',
          strokeThickness: 4,
          backgroundColor: '#063b6488',
          padding: { left: 8, right: 8, top: 3, bottom: 3 },
        })
        .setOrigin(0.5)
        .setDepth(860);
      if (label.width > hotspot.rx * 2 + 46) {
        label.setScale(Math.max(0.8, (hotspot.rx * 2 + 46) / label.width), 1);
      }

      const zone = this.add
        .zone(hotspot.x, hotspot.y, hotspot.rx * 2, hotspot.ry * 2)
        .setInteractive({ useHandCursor: true })
        .setDepth(855);
      zone.on('pointerup', () => this.triggerHotspot(hotspot, 'tap'));
      zone.on('pointerover', () => label.setColor('#fff4a8'));
      zone.on('pointerout', () => label.setColor('#ffffff'));
    }
  }

  private setupPlayer(): void {
    generateHaibaoFrames(this);
    registerHaibaoAnims(this);

    this.player = this.physics.add.sprite(
      PLAYER_SPAWN.x,
      PLAYER_SPAWN.y,
      haibaoTextureKey('se', 'idle'),
    );
    this.player.setOrigin(0.5, 0.76);
    this.player.setDepth(this.player.y + 120);
    this.player.anims.play('haibao-se');
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setCircle(24, 8, 48);
      body.setAllowGravity(false);
      body.setCollideWorldBounds(true);
    }

    this.playerLabel = this.add
      .text(this.player.x, this.player.y + 24, '宝', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ff3b3b',
        stroke: '#ffffff',
        strokeThickness: 2,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(this.player.depth + 1);

    this.hud = makeHud(this, 'topright');
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('键盘输入未初始化');
    }
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    }) as typeof this.wasd;

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      if (pointer.y < 86) return;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      if (!this.isWalkable(worldPoint.x, worldPoint.y)) return;
      this.moveTarget = new Phaser.Math.Vector2(worldPoint.x, worldPoint.y);
    });
  }

  private readKeyboardVelocity(): { vx: number; vy: number } {
    let vx = 0;
    let vy = 0;
    if (this.cursors.left?.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.cursors.right?.isDown || this.wasd.D.isDown) vx += 1;
    if (this.cursors.up?.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.cursors.down?.isDown || this.wasd.S.isDown) vy += 1;

    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2;
      vx *= inv;
      vy *= inv;
    }
    return { vx: vx * PLAYER_SPEED, vy: vy * PLAYER_SPEED };
  }

  private readClickVelocity(): { vx: number; vy: number } {
    if (!this.moveTarget) return { vx: 0, vy: 0 };
    const dx = this.moveTarget.x - this.player.x;
    const dy = this.moveTarget.y - this.player.y;
    const len = Math.hypot(dx, dy);
    if (len <= 5) {
      this.moveTarget = null;
      return { vx: 0, vy: 0 };
    }
    return {
      vx: (dx / len) * PLAYER_SPEED,
      vy: (dy / len) * PLAYER_SPEED,
    };
  }

  private movePlayer(vx: number, vy: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    const nextX = Phaser.Math.Clamp(this.player.x + vx * dt, 44, GAME_WIDTH - 42);
    const nextY = Phaser.Math.Clamp(this.player.y + vy * dt, 224, GAME_HEIGHT - 34);
    if (this.isWalkable(nextX, nextY)) {
      this.player.setPosition(nextX, nextY);
    } else {
      this.moveTarget = null;
    }

    this.playerLabel.setPosition(this.player.x, this.player.y + 24);
    const depth = this.player.y + 120;
    this.player.setDepth(depth);
    this.playerLabel.setDepth(depth + 1);
  }

  private isWalkable(x: number, y: number): boolean {
    if (x < 42 || x > GAME_WIDTH - 36 || y < 220 || y > GAME_HEIGHT - 30) return false;

    const gatePlatform = x >= 46 && x <= 248 && y >= 236 && y <= 438;
    const mainSand = y >= 332 && y <= 594;
    const tideRim = x >= 432 && x <= 826 && y >= 238 && y <= 426;
    const coralWade = x >= 244 && x <= 548 && y >= 214 && y <= 322;
    const lowerPlantsBlocked = y > 542 && (x < 96 || x > 846);
    if (lowerPlantsBlocked) return false;

    return gatePlatform || mainSand || tideRim || coralWade;
  }

  private applyFacingFromVelocity(vx: number, vy: number): void {
    const next = computeIsoFacing(vx, vy, this.facing.current);
    const isMoving = vx !== 0 || vy !== 0;
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

  private updateHotspotTriggers(): void {
    for (const hotspot of BEACH_HOTSPOTS) {
      const inside = this.isPlayerInsideHotspot(hotspot);
      if (!inside) {
        this.activeHotspots.delete(hotspot.id);
        continue;
      }
      if (this.activeHotspots.has(hotspot.id)) continue;
      this.activeHotspots.add(hotspot.id);
      this.triggerHotspot(hotspot, 'walk');
    }
  }

  private triggerHotspot(hotspot: BeachHotspot, source: 'tap' | 'walk'): void {
    if (source === 'tap' && !this.isPlayerNearHotspot(hotspot)) {
      this.moveTarget = new Phaser.Math.Vector2(hotspot.x, hotspot.y);
      this.showToast(`先走近${hotspot.label}。`);
      return;
    }

    switch (hotspot.kind) {
      case 'portal':
        this.scene.start(hotspot.target ?? SceneKey.WORLD);
        return;
      case 'encounter':
        this.tryBeachEncounter(hotspot, source);
        return;
      case 'forage':
        this.tryForage(hotspot);
        return;
      case 'info':
        this.showToast(hotspot.message ?? '海滨风向正好。', 2600);
        return;
    }
  }

  private tryBeachEncounter(hotspot: BeachHotspot, source: 'tap' | 'walk'): void {
    if (!hotspot.zoneId) return;
    const now = this.time.now;
    if (now < this.encounterCooldownUntil) return;
    this.encounterCooldownUntil = now + 1700;

    const myPet = PlayerState.snapshot().playerPets[0];
    if (!myPet) {
      this.showToast('没有可出战的精灵！');
      return;
    }
    const live = PlayerState.getPlayerPet(myPet.petId);
    if (live && live.currentHp <= 0) {
      live.currentHp = live.currentStats.hp;
      PlayerState.persist();
    }

    const def = getEncounter(hotspot.zoneId);
    if (!def) {
      this.showToast('这片海潮还没有稳定踪迹。');
      return;
    }
    const roll = rollEncounter(source === 'tap' ? { ...def, triggerPerStep: 1 } : def, Math.random);
    if (!roll) {
      this.showToast(`${hotspot.label}现在只有浪花声。`);
      return;
    }
    const boosted = applyVipRareBoost(roll, PlayerState.isVip(), Math.random);
    if (boosted.level !== roll.level) {
      this.showToast('遇到了稀有海滨精灵！');
    }
    this.scene.start(SceneKey.BATTLE_INTRO, {
      mode: 'wild',
      petId: myPet.petId,
      wildPetId: boosted.petId,
      wildLevel: boosted.level,
      fromScene: this.scene.key,
    });
  }

  private tryForage(hotspot: BeachHotspot): void {
    if (!hotspot.foragePointId) return;
    const storage = globalThis.localStorage ?? null;
    const state = readBeachForageState(storage);
    const result = claimBeachForagePoint(hotspot.foragePointId, state);
    if (!result.ok) {
      const message =
        result.reason === 'already_claimed'
          ? `${hotspot.label}今天已经翻找过了。`
          : result.reason === 'daily_limit_reached'
            ? '今天的海滨采集次数用完了，明天再来。'
            : '这里暂时没有可拾取的材料。';
      this.showToast(message);
      this.refreshForageCounter(result.next);
      return;
    }

    writeBeachForageState(storage, result.next);
    PlayerState.addItem(result.point.itemId, result.point.quantity);
    gameEvents.emit('item:collect', {
      itemId: result.point.itemId,
      quantity: result.point.quantity,
      source: result.point.source,
    });
    this.showToast(
      `获得 ${result.point.label}：${this.itemName(result.point.itemId)} ×${result.point.quantity}`,
    );
    this.refreshForageCounter(result.next);
  }

  private itemName(itemId: string): string {
    switch (itemId) {
      case 'gold_shell':
        return '金贝壳';
      case 'crystal_shard':
        return '净化水晶';
      default:
        return itemId;
    }
  }

  private isPlayerInsideHotspot(hotspot: BeachHotspot): boolean {
    return ellipseContains(hotspot, this.player.x, this.player.y);
  }

  private isPlayerNearHotspot(hotspot: BeachHotspot): boolean {
    const dx = Math.max(0, Math.abs(this.player.x - hotspot.x) - hotspot.rx);
    const dy = Math.max(0, Math.abs(this.player.y - hotspot.y) - hotspot.ry);
    return Math.hypot(dx, dy) <= HOTSPOT_NEAR_PAD;
  }

  private drawQuickButtons(): void {
    const buttons = [
      {
        x: 46,
        label: '地图',
        onClick: () => this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.BEACH }),
      },
      {
        x: 120,
        label: '精灵',
        onClick: () => this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.BEACH }),
      },
      {
        x: 194,
        label: '背包',
        onClick: () => this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.BEACH }),
      },
      {
        x: 268,
        label: '存档',
        onClick: () => this.scene.start(SceneKey.SAVE_SLOTS, { fromScene: SceneKey.BEACH }),
      },
      {
        x: 342,
        label: '回城',
        onClick: () => this.scene.start(SceneKey.WORLD),
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
      .text(GAME_WIDTH / 2, 64, '海滨沙滩 · 潮池与拾贝路', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#1b6fa8',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(900);
  }

  private drawForageCounter(): void {
    const state = readBeachForageState(globalThis.localStorage ?? null);
    this.forageCounter = this.add
      .text(18, GAME_HEIGHT - 22, '', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#123657',
        strokeThickness: 3,
        backgroundColor: '#063b6499',
        padding: { left: 8, right: 8, top: 3, bottom: 3 },
      })
      .setOrigin(0, 1)
      .setDepth(920);
    this.refreshForageCounter(state);
  }

  private refreshForageCounter(
    state = readBeachForageState(globalThis.localStorage ?? null),
  ): void {
    const remaining = Math.max(0, MAX_BEACH_FORAGE_CLAIMS_PER_DAY - state.claimedPointIds.length);
    this.forageCounter?.setText(`今日海滨采集 ${remaining}/${MAX_BEACH_FORAGE_CLAIMS_PER_DAY}`);
  }

  private showToast(message: string, durationMs = 1900): void {
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
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 120, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(2200);
    this.toast = toast;
    this.toastTimer = this.time.delayedCall(durationMs, () => {
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

function ellipseContains(hotspot: BeachHotspot, x: number, y: number): boolean {
  const nx = (x - hotspot.x) / hotspot.rx;
  const ny = (y - hotspot.y) / hotspot.ry;
  return nx * nx + ny * ny <= 1;
}
