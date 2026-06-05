import Phaser from 'phaser';

import { PETS } from '@/data/pets';
import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { gameEvents } from '@/systems/EventBus';
import { stageForWildLevel } from '@/systems/EvolutionSystem';
import { createPlayerPet } from '@/systems/PetInstance';
import { PlayerState } from '@/systems/PlayerState';
import { preloadTideTrialAssets } from '@/systems/SceneAssetPreloader';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

import type { PlayerPet } from '@/types';

const MINIGAME_ID = 'tide_trial';
const BEST_SCORE_KEY = 'hbcc:tide-trial-best:v1';
const ROUND_MS = 35_000;
const PLAYER_Y = 526;
const PLAYER_MIN_X = 110;
const PLAYER_MAX_X = 850;

type TrialObjectKind = 'pearl' | 'mine';

interface TrialObject {
  readonly kind: TrialObjectKind;
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly wobbleSeed: number;
  readonly baseSpeed: number;
  collected: boolean;
}

export class TideTrialScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private targetX = GAME_WIDTH / 2;
  private roundEndsAt = 0;
  private score = 0;
  private streak = 0;
  private bestScore = 0;
  private roundActive = false;
  private stunUntil = 0;
  private objects: TrialObject[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private leftKey: Phaser.Input.Keyboard.Key | null = null;
  private rightKey: Phaser.Input.Keyboard.Key | null = null;
  private aKey: Phaser.Input.Keyboard.Key | null = null;
  private dKey: Phaser.Input.Keyboard.Key | null = null;

  public constructor() {
    super({ key: SceneKey.TIDE_TRIAL });
  }

  public preload(): void {
    preloadTideTrialAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.bestScore = readBestScore();
    this.drawBackground();
    this.drawHud();
    this.createPlayer();
    this.bindInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.spawnTimer?.remove(false);
      this.spawnTimer = null;
      this.clearObjects();
    });
    this.startRound();
  }

  public update(time: number, delta: number): void {
    if (!this.roundActive) return;
    this.updatePlayer(time, delta);
    this.updateObjects(time, delta);
    this.updateHud(time);
    if (time >= this.roundEndsAt) this.finishRound();
  }

  private drawBackground(): void {
    if (this.textures.exists('legacy_tide_playground_clean')) {
      createResponsiveMapBackground(this, 'legacy_tide_playground_clean');
    } else {
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x6bd4ff, 1).setOrigin(0);
    }

    this.add.rectangle(0, 0, GAME_WIDTH, 78, 0x07335d, 0.72).setOrigin(0).setDepth(50);
    this.add
      .rectangle(0, GAME_HEIGHT - 92, GAME_WIDTH, 92, 0x0b3768, 0.28)
      .setOrigin(0)
      .setDepth(8);
    this.add.ellipse(GAME_WIDTH / 2, PLAYER_Y + 24, 760, 58, 0x8fe8ff, 0.18).setDepth(9);
  }

  private drawHud(): void {
    createNavIconButton(this, {
      x: 48,
      y: 30,
      label: '返回',
      onClick: () => this.returnToPlayground(),
      depth: 80,
      width: 66,
      height: 46,
    });

    this.add
      .text(126, 19, '潮汐试炼', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        stroke: '#123767',
        strokeThickness: 4,
      })
      .setDepth(80);

    this.scoreText = this.createHudText(372, 30, '分数 0');
    this.timeText = this.createHudText(526, 30, '35.0s');
    this.streakText = this.createHudText(666, 30, '连击 0');
    this.bestText = this.createHudText(812, 30, `最高 ${this.bestScore}`);
  }

  private createHudText(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#fff4a8',
        stroke: '#10294f',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(80);
  }

  private createPlayer(): void {
    this.playerShadow = this.add
      .ellipse(this.targetX, PLAYER_Y + 34, 92, 24, 0x000000, 0.22)
      .setDepth(24);
    const texture = this.textures.exists('legacy_pet_tide_otter')
      ? 'legacy_pet_tide_otter'
      : 'object_tide_playground';
    this.player = this.add
      .image(this.targetX, PLAYER_Y, texture)
      .setDisplaySize(82, 82)
      .setDepth(25);
  }

  private bindInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
      this.setTargetFromPointer(pointer),
    );
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) this.setTargetFromPointer(pointer);
    });
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
      this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
      this.aKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.dKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    }
  }

  private startRound(): void {
    this.clearObjects();
    this.score = 0;
    this.streak = 0;
    this.targetX = GAME_WIDTH / 2;
    this.roundEndsAt = this.time.now + ROUND_MS;
    this.stunUntil = 0;
    this.roundActive = true;
    this.updateHud(this.time.now);
    this.spawnTimer?.remove(false);
    this.spawnTimer = this.time.addEvent({
      delay: 560,
      loop: true,
      callback: () => this.spawnObject(),
    });
    this.time.delayedCall(180, () => this.spawnObject());
    this.time.delayedCall(420, () => this.spawnObject());
  }

  private setTargetFromPointer(pointer: Phaser.Input.Pointer): void {
    this.targetX = Phaser.Math.Clamp(pointer.x, PLAYER_MIN_X, PLAYER_MAX_X);
  }

  private updatePlayer(time: number, delta: number): void {
    const left = this.leftKey?.isDown === true || this.aKey?.isDown === true;
    const right = this.rightKey?.isDown === true || this.dKey?.isDown === true;
    if (left) this.targetX -= 340 * (delta / 1000);
    if (right) this.targetX += 340 * (delta / 1000);
    this.targetX = Phaser.Math.Clamp(this.targetX, PLAYER_MIN_X, PLAYER_MAX_X);

    const damp = time < this.stunUntil ? 0.045 : 0.14;
    this.player.x += (this.targetX - this.player.x) * Math.min(1, damp * (delta / 16.67));
    this.player.y = PLAYER_Y + Math.sin(time * 0.006) * 4;
    this.player.rotation = Phaser.Math.Clamp((this.targetX - this.player.x) * 0.006, -0.12, 0.12);
    this.playerShadow.setPosition(this.player.x, PLAYER_Y + 36);
  }

  private spawnObject(): void {
    if (!this.roundActive) return;
    const elapsed = 1 - Math.max(0, this.roundEndsAt - this.time.now) / ROUND_MS;
    const kind: TrialObjectKind = Math.random() < 0.74 ? 'pearl' : 'mine';
    const texture = kind === 'pearl' ? 'object_trial_pearl' : 'object_trial_mine';
    const x = Phaser.Math.Between(112, 848);
    const y = 92;
    const shadow = this.add.ellipse(x, y + 28, 46, 14, 0x000000, 0.14).setDepth(16);
    const sprite = this.add
      .image(x, y, texture)
      .setDisplaySize(kind === 'pearl' ? 50 : 56, kind === 'pearl' ? 50 : 56)
      .setDepth(17);
    this.objects.push({
      kind,
      sprite,
      shadow,
      wobbleSeed: Math.random() * Math.PI * 2,
      baseSpeed: Phaser.Math.Between(148, 218) + elapsed * 72,
      collected: false,
    });
  }

  private updateObjects(time: number, delta: number): void {
    const dt = delta / 1000;
    for (const obj of this.objects) {
      if (obj.collected) continue;
      obj.sprite.y += obj.baseSpeed * dt;
      obj.sprite.x += Math.sin(time * 0.006 + obj.wobbleSeed) * 0.8;
      obj.sprite.rotation += (obj.kind === 'pearl' ? 0.015 : -0.021) * (delta / 16.67);
      obj.shadow.setPosition(obj.sprite.x, obj.sprite.y + 28);
      const distance = Phaser.Math.Distance.Between(
        obj.sprite.x,
        obj.sprite.y,
        this.player.x,
        this.player.y,
      );
      if (distance <= (obj.kind === 'pearl' ? 54 : 50)) {
        this.collectObject(obj);
      } else if (obj.sprite.y > GAME_HEIGHT + 40) {
        this.missObject(obj);
      }
    }
    this.objects = this.objects.filter((obj) => !obj.collected);
  }

  private collectObject(obj: TrialObject): void {
    obj.collected = true;
    if (obj.kind === 'pearl') {
      this.streak += 1;
      const bonus = this.streak > 0 && this.streak % 5 === 0 ? 15 : 0;
      this.score += 10 + bonus;
      this.spawnBurst(obj.sprite.x, obj.sprite.y, 0xfff4a8);
      this.floatText(
        obj.sprite.x,
        obj.sprite.y - 16,
        bonus > 0 ? `+${10 + bonus}` : '+10',
        '#fff4a8',
      );
    } else {
      this.streak = 0;
      this.score = Math.max(0, this.score - 18);
      this.stunUntil = this.time.now + 680;
      this.cameras.main.shake(130, 0.006);
      this.spawnBurst(obj.sprite.x, obj.sprite.y, 0xff5a6d);
      this.floatText(obj.sprite.x, obj.sprite.y - 16, '-18', '#ffccd4');
    }
    obj.sprite.destroy();
    obj.shadow.destroy();
    this.updateHud(this.time.now);
  }

  private missObject(obj: TrialObject): void {
    obj.collected = true;
    if (obj.kind === 'pearl') {
      this.streak = 0;
      this.floatText(obj.sprite.x, GAME_HEIGHT - 68, '断连', '#bdefff');
    }
    obj.sprite.destroy();
    obj.shadow.destroy();
  }

  private updateHud(time: number): void {
    const leftMs = Math.max(0, this.roundEndsAt - time);
    this.scoreText.setText(`分数 ${this.score}`);
    this.timeText.setText(`${(leftMs / 1000).toFixed(1)}s`);
    this.streakText.setText(`连击 ${this.streak}`);
    this.bestText.setText(`最高 ${Math.max(this.bestScore, this.score)}`);
  }

  private finishRound(): void {
    if (!this.roundActive) return;
    this.roundActive = false;
    this.spawnTimer?.remove(false);
    this.spawnTimer = null;
    this.clearObjects();
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      writeBestScore(this.bestScore);
    }
    gameEvents.emit('minigame:complete', { minigameId: MINIGAME_ID, score: this.score });
    const reward = this.applyRoundReward();
    this.showResultPanel(reward);
  }

  private applyRoundReward(): string {
    const coins = Math.min(280, 80 + Math.floor(this.score * 0.85));
    PlayerState.addCoins(coins);
    const rewardLines: string[] = [`${coins} 彩虹币`];

    if (this.score >= 80) {
      PlayerState.addItem('gold_shell', 1);
      rewardLines.push('金贝壳 x1');
    }
    if (this.score >= 120) {
      PlayerState.addItem('exp_candy', 1);
      rewardLines.push('经验糖 x1');
    }
    if (this.score >= 150) {
      PlayerState.addItem('element_fruit_water', 1);
      rewardLines.push('蓝波果 x1');
    }

    if (this.score >= 120 && !PlayerState.hasPet('tide_otter')) {
      const pet = makeLevelPet('tide_otter', 15);
      if (pet) {
        const placement = PlayerState.addPlayerPet(pet);
        rewardLines.push(placement === 'storage' ? '潮汐水獭已入仓库' : '潮汐水獭加入队伍');
      }
    }

    return rewardLines.join('、');
  }

  private showResultPanel(rewardText: string): void {
    const panel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(120);
    const bg = this.add.rectangle(0, 0, 520, 310, 0x07335d, 0.92).setStrokeStyle(3, 0xffffff, 0.78);
    const title = this.add
      .text(0, -112, this.score >= 120 ? '试炼完成' : '继续练习', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
        stroke: '#0b3768',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const scoreLine = this.add
      .text(0, -58, `本次 ${this.score}    最高 ${this.bestScore}`, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '22px',
        color: '#fff4a8',
      })
      .setOrigin(0.5);
    const reward = this.add
      .text(0, 2, rewardText, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#d9f7ff',
        align: 'center',
        wordWrap: { width: 430 },
      })
      .setOrigin(0.5);
    const tip = this.add
      .text(0, 58, this.score >= 120 ? '潮汐档案已同步' : '达到 120 分可获得潮汐水獭', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    panel.add([bg, title, scoreLine, reward, tip]);
    let retryButton: Phaser.GameObjects.Container | null = null;
    let returnButton: Phaser.GameObjects.Container | null = null;
    retryButton = createNavIconButton(this, {
      x: GAME_WIDTH / 2 - 98,
      y: GAME_HEIGHT / 2 + 116,
      label: '再来',
      onClick: () => {
        panel.destroy(true);
        retryButton?.destroy(true);
        returnButton?.destroy(true);
        this.startRound();
      },
      depth: 130,
      width: 88,
      height: 48,
    });
    returnButton = createNavIconButton(this, {
      x: GAME_WIDTH / 2 + 98,
      y: GAME_HEIGHT / 2 + 116,
      label: '返回',
      onClick: () => this.returnToPlayground(),
      depth: 130,
      width: 88,
      height: 48,
    });
  }

  private spawnBurst(x: number, y: number, color: number): void {
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8;
      const dot = this.add.circle(x, y, 5, color, 0.86).setDepth(70);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * 42,
        y: y + Math.sin(angle) * 32,
        alpha: 0,
        scale: 0.4,
        duration: 360,
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color,
        stroke: '#10294f',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(75);
    this.tweens.add({
      targets: label,
      y: y - 34,
      alpha: 0,
      duration: 620,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private clearObjects(): void {
    for (const obj of this.objects) {
      obj.sprite.destroy();
      obj.shadow.destroy();
    }
    this.objects = [];
  }

  private returnToPlayground(): void {
    this.roundActive = false;
    this.spawnTimer?.remove(false);
    this.spawnTimer = null;
    this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: 'tide_playground' });
  }
}

function readBestScore(): number {
  try {
    const raw = globalThis.localStorage?.getItem(BEST_SCORE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  } catch {
    return 0;
  }
}

function writeBestScore(score: number): void {
  try {
    globalThis.localStorage?.setItem(BEST_SCORE_KEY, String(Math.max(0, Math.floor(score))));
  } catch {
    // localStorage can be unavailable in some embedded browsers.
  }
}

function makeLevelPet(petId: string, level: number): PlayerPet | null {
  const pet = PETS[petId];
  if (!pet) return null;
  const evolutionStage = stageForWildLevel(level);
  return createPlayerPet(pet, level, { evolutionStage });
}
