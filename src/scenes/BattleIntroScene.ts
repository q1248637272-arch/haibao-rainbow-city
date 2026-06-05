import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { getBoss } from '@/data/bosses';
import { getPet } from '@/data/pets';
import { evolvedPetName, stageForWildLevel } from '@/systems/EvolutionSystem';
import { preloadBattleAssets } from '@/systems/SceneAssetPreloader';
import { virtualPlayerDisplayName } from '@/systems/VirtualPlayers';
import { ensureBossTexture } from '@/utils/placeholder';
import { ensurePetTextureForStage } from '@/utils/playerPetTexture';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

import type { BattleSceneData } from './BattleScene';

const PREMIUM_BATTLE_ARENA_V2_BG = 'premium_battle_arena_v2_image2';
const PREMIUM_BATTLE_ARENA_BG = 'premium_battle_arena_image2';

export class BattleIntroScene extends Phaser.Scene {
  private payload: BattleSceneData = { petId: '' };

  public constructor() {
    super({ key: SceneKey.BATTLE_INTRO });
  }

  public init(data: BattleSceneData): void {
    this.payload = data;
  }

  public preload(): void {
    preloadBattleAssets(this, this.payload);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.drawBackplate();
    this.playDampedEncounter();
  }

  private drawBackplate(): void {
    const bgKey = this.textures.exists(PREMIUM_BATTLE_ARENA_V2_BG)
      ? PREMIUM_BATTLE_ARENA_V2_BG
      : this.textures.exists(PREMIUM_BATTLE_ARENA_BG)
        ? PREMIUM_BATTLE_ARENA_BG
        : 'legacy_17173_2';
    createResponsiveMapBackground(this, bgKey, { stageAlpha: 0.88, coverAlpha: 0.88 });
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x062d57, 0.48).setOrigin(0);
  }

  private playDampedEncounter(): void {
    const enemy = this.enemyMeta();
    const title =
      this.payload.mode === 'boss'
        ? '道馆挑战'
        : this.payload.mode === 'trainer'
          ? '玩家对战'
          : '野外遭遇';

    const ring = this.add.graphics().setDepth(10);
    ring.lineStyle(5, 0xb7f4ff, 0.85);
    ring.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 4, 96);
    ring.lineStyle(2, 0xffffff, 0.9);
    ring.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 4, 124);
    ring.setScale(0.3);
    ring.setAlpha(0);

    const plate = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(20);
    const bg = this.add.graphics();
    bg.fillStyle(0xffb533, 0.94);
    bg.fillRoundedRect(-205, -72, 410, 144, 10);
    bg.lineStyle(4, 0xffffff, 0.95);
    bg.strokeRoundedRect(-205, -72, 410, 144, 10);
    bg.fillStyle(0x0b6faf, 0.9);
    bg.fillRoundedRect(-190, -58, 380, 38, 8);
    plate.add(bg);

    const enemyImage = this.add.image(-130, 28, enemy.textureKey).setOrigin(0.5);
    const source = this.textures.get(enemy.textureKey).getSourceImage() as {
      width: number;
      height: number;
    };
    enemyImage.setScale(92 / Math.max(source.width, source.height));
    plate.add(enemyImage);
    plate.add(
      this.add
        .text(-96, -39, title, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '24px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 4,
        })
        .setOrigin(0, 0.5),
    );
    plate.add(
      this.add
        .text(-62, 8, enemy.name, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '28px',
          color: '#1b1b3a',
        })
        .setOrigin(0, 0.5),
    );
    plate.add(
      this.add
        .text(-62, 42, enemy.levelLabel, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#385f76',
        })
        .setOrigin(0, 0.5),
    );

    plate.setScale(0.72);
    plate.setAlpha(0);

    this.tweens.add({
      targets: ring,
      alpha: 1,
      scale: 1,
      duration: 460,
      ease: 'Back.Out',
    });
    this.tweens.add({
      targets: plate,
      alpha: 1,
      scale: 1.08,
      y: GAME_HEIGHT / 2 - 10,
      duration: 420,
      ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: plate,
          scale: 1,
          y: GAME_HEIGHT / 2,
          duration: 260,
          ease: 'Sine.easeOut',
        });
      },
    });
    this.tweens.add({
      targets: [ring, plate],
      alpha: 0,
      delay: 820,
      duration: 240,
      ease: 'Sine.easeIn',
      onComplete: () => this.scene.start(SceneKey.BATTLE, this.payload),
    });
  }

  private enemyMeta(): {
    readonly name: string;
    readonly textureKey: string;
    readonly levelLabel: string;
  } {
    if (this.payload.mode === 'boss') {
      const boss = getBoss(this.payload.bossId ?? '');
      if (boss) {
        return {
          name: boss.name,
          textureKey: ensureBossTexture(this, boss.id),
          levelLabel: '道馆守护者',
        };
      }
    }

    const pet = getPet(this.payload.wildPetId ?? '');
    if (pet) {
      const level = Math.max(1, Math.floor(this.payload.wildLevel ?? 1));
      const stage = stageForWildLevel(level);
      return {
        name: evolvedPetName(pet, stage),
        textureKey: ensurePetTextureForStage(this, pet.id, stage, level),
        levelLabel: `Lv${level}`,
      };
    }

    if (this.payload.mode === 'trainer') {
      const trainer = this.payload.trainer;
      const lead = trainer?.party[0];
      const trainerPet = getPet(lead?.petId ?? '');
      if (trainer && lead && trainerPet) {
        const stage = lead.evolutionStage ?? stageForWildLevel(lead.level);
        return {
          name: `${virtualPlayerDisplayName(trainer)}的 ${evolvedPetName(trainerPet, stage)}`,
          textureKey: ensurePetTextureForStage(this, trainerPet.id, stage, lead.level),
          levelLabel: `虚拟玩家 · Lv${lead.level}`,
        };
      }
    }

    return {
      name: '未知玩偶',
      textureKey: 'legacy_pet_spark_mouse',
      levelLabel: '准备战斗',
    };
  }
}
