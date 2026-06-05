import Phaser from 'phaser';

import { ELEMENT_COLOR, ELEMENT_LABEL_CN } from '@/data/elements';
import { formatCompactBattleStats } from '@/systems/BattleStats';
import { expToNext } from '@/systems/LevelCurve';
import { PlayerState } from '@/systems/PlayerState';
import type { PetData } from '@/types';
import { ensurePetTexture } from '@/utils/placeholder';
import { ensurePlayerPetTexture } from '@/utils/playerPetTexture';

export const PET_CARD_WIDTH = 180;
export const PET_CARD_HEIGHT = 220;

const BORDER_WIDTH_NORMAL = 3;
const BORDER_WIDTH_SELECTED = 5;
const BORDER_COLOR_LOCKED = 0x888888;
const BORDER_COLOR_OWNED = 0xffffff;
const BORDER_COLOR_SELECTED = 0xffd93d;
const CARD_BG_COLOR = 0x1b1b3a;
const CARD_BG_ALPHA = 0.85;
const PORTRAIT_FRAME_SIZE = 88;

export interface PetCardOptions {
  owned: boolean;
  locked: boolean;
  selected: boolean;
  onClick: () => void;
}

function formatStats(pet: PetData): string {
  return formatCompactBattleStats(pet.baseStats);
}

export function createPetCard(
  scene: Phaser.Scene,
  pet: PetData,
  opts: PetCardOptions,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  const halfW = PET_CARD_WIDTH / 2;
  const halfH = PET_CARD_HEIGHT / 2;

  const bg = scene.add.rectangle(
    0,
    0,
    PET_CARD_WIDTH,
    PET_CARD_HEIGHT,
    CARD_BG_COLOR,
    CARD_BG_ALPHA,
  );
  const borderColor = opts.selected
    ? BORDER_COLOR_SELECTED
    : opts.owned
      ? BORDER_COLOR_OWNED
      : BORDER_COLOR_LOCKED;
  bg.setStrokeStyle(opts.selected ? BORDER_WIDTH_SELECTED : BORDER_WIDTH_NORMAL, borderColor, 1);
  container.add(bg);

  const pp = PlayerState.getPlayerPet(pet.id);
  const portraitKey = pp ? ensurePlayerPetTexture(scene, pp) : ensurePetTexture(scene, pet.id);
  const portraitY = -halfH + 10 + PORTRAIT_FRAME_SIZE / 2;
  const portraitFrame = scene.add.rectangle(
    0,
    portraitY,
    PORTRAIT_FRAME_SIZE,
    PORTRAIT_FRAME_SIZE,
    0x000000,
    0.3,
  );
  portraitFrame.setStrokeStyle(2, 0xffffff, 0.6);
  container.add(portraitFrame);

  const portrait = scene.add.image(0, portraitY, portraitKey);
  portrait.setDisplaySize(PORTRAIT_FRAME_SIZE - 8, PORTRAIT_FRAME_SIZE - 8);
  container.add(portrait);

  const nameText = scene.add
    .text(0, portraitY + PORTRAIT_FRAME_SIZE / 2 + 6, pet.name, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '17px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
    })
    .setOrigin(0.5, 0);
  nameText.setWordWrapWidth(PET_CARD_WIDTH - 18);
  container.add(nameText);

  const elementY = nameText.y + 24;
  const elementText = scene.add
    .text(0, elementY, ELEMENT_LABEL_CN[pet.element], {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#ffffff',
    })
    .setOrigin(0, 0.5);
  const swatch = scene.add.rectangle(0, elementY, 12, 12, ELEMENT_COLOR[pet.element], 1);
  swatch.setStrokeStyle(1, 0xffffff, 0.6);
  const gap = 6;
  const totalWidth = swatch.width + gap + elementText.width;
  swatch.x = -totalWidth / 2 + swatch.width / 2;
  elementText.x = swatch.x + swatch.width / 2 + gap;
  container.add(swatch);
  container.add(elementText);

  const statsText = scene.add
    .text(0, elementY + 16, formatStats(pet), {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '11px',
      color: '#f0f0f0',
      align: 'center',
      lineSpacing: 1,
    })
    .setOrigin(0.5, 0);
  container.add(statsText);

  const lvLine = pp ? `Lv ${pp.level} / EXP ${pp.exp}/${expToNext(pp.level)}` : 'Lv - / 未拥有';
  const lvText = scene.add
    .text(0, halfH - 22, lvLine, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: '#ffd93d',
      align: 'center',
    })
    .setOrigin(0.5, 0.5);
  container.add(lvText);

  if (opts.locked) {
    const mask = scene.add.rectangle(0, 0, PET_CARD_WIDTH, PET_CARD_HEIGHT, 0x000000, 0.6);
    container.add(mask);
    const lockLabel = scene.add
      .text(0, 0, 'VIP 专属', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#ffd93d',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(lockLabel);
  }

  container.setSize(PET_CARD_WIDTH, PET_CARD_HEIGHT);
  container.setInteractive(
    new Phaser.Geom.Rectangle(-halfW, -halfH, PET_CARD_WIDTH, PET_CARD_HEIGHT),
    Phaser.Geom.Rectangle.Contains,
  );
  container.on('pointerup', () => opts.onClick());

  return container;
}
