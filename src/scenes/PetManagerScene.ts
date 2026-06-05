import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { ELEMENT_LABEL_CN } from '@/data/elements';
import { getItem } from '@/data/items';
import { nextSkillUnlock } from '@/data/petLearnsets';
import { getPet } from '@/data/pets';
import { SKILLS } from '@/data/skills';
import { normalizeBattleStats } from '@/systems/BattleStats';
import {
  canEvolve,
  evolutionLabel,
  evolvedPetName,
  nextEvolutionLevel,
  requiredEvolutionItem,
} from '@/systems/EvolutionSystem';
import { expToNext } from '@/systems/LevelCurve';
import { formatNatureGrowth, getPetNature } from '@/systems/PetNature';
import { formatPetTalent } from '@/systems/PetTalent';
import { PARTY_PET_LIMIT, PlayerState } from '@/systems/PlayerState';
import { preloadPetLibraryAssets } from '@/systems/SceneAssetPreloader';
import { createAutoScrollText } from '@/ui/AutoScrollText';
import { createNavIconButton } from '@/ui/NavIconButton';
import type { PlayerPet } from '@/types';
import { ensurePlayerPetTexture } from '@/utils/playerPetTexture';

type PetShelf = 'party' | 'storage';

interface ViewBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
}

interface PetManagerLayout {
  readonly viewport: ViewBounds;
  readonly rootX: number;
  readonly rootY: number;
  readonly rootW: number;
  readonly rootH: number;
  readonly titleY: number;
  readonly contentX: number;
  readonly contentY: number;
  readonly contentW: number;
  readonly contentH: number;
  readonly rosterX: number;
  readonly rosterY: number;
  readonly rosterW: number;
  readonly rosterH: number;
  readonly detailX: number;
  readonly detailY: number;
  readonly detailW: number;
  readonly detailH: number;
  readonly cardColumns: number;
  readonly cardRows: number;
  readonly pageSize: number;
}

interface EvolutionUiState {
  readonly canEvolveNow: boolean;
  readonly nextLevel: number | null;
  readonly requiredItemName: string | null;
  readonly hasRequiredItem: boolean;
  readonly line: string;
}

const OUTER_MARGIN = 18;
const PANEL_RADIUS = 8;

export class PetManagerScene extends Phaser.Scene {
  private fromScene: string = SceneKey.WORLD;
  private shelf: PetShelf = 'party';
  private selectedIndex = 0;
  private page = 0;
  private content: Phaser.GameObjects.Container | null = null;
  private shellObjects: Phaser.GameObjects.GameObject[] = [];
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  public constructor() {
    super({ key: SceneKey.PET_MANAGER });
  }

  public init(data?: { readonly fromScene?: string }): void {
    this.fromScene = data?.fromScene ?? SceneKey.WORLD;
    this.shelf = 'party';
    this.selectedIndex = 0;
    this.page = 0;
  }

  public preload(): void {
    preloadPetLibraryAssets(this);
  }

  public create(): void {
    this.drawShell();
    this.refresh();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      this.content?.destroy();
      this.content = null;
      this.destroyShell();
      this.clearToast();
    });
  }

  private handleResize(): void {
    this.drawShell();
    this.refresh();
  }

  private drawShell(): void {
    this.destroyShell();
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    const layout = this.getLayout();
    const { viewport } = layout;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0xd9f9ff, 0xd9f9ff, 0xa5dff3, 0x8ed3ec, 1);
    bg.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
    bg.fillStyle(0xffffff, 0.2);
    for (const glow of [
      { x: viewport.left + viewport.width * 0.18, y: viewport.top + 86, r: 118 },
      { x: viewport.left + viewport.width * 0.72, y: viewport.bottom - 80, r: 150 },
      { x: viewport.right - 96, y: viewport.top + 100, r: 92 },
    ]) {
      bg.fillCircle(glow.x, glow.y, glow.r);
    }
    bg.fillStyle(0x0d8ab4, 0.12);
    bg.fillRoundedRect(layout.rootX, layout.rootY, layout.rootW, layout.rootH, PANEL_RADIUS);
    bg.lineStyle(2, 0xffffff, 0.7);
    bg.strokeRoundedRect(layout.rootX, layout.rootY, layout.rootW, layout.rootH, PANEL_RADIUS);

    bg.fillGradientStyle(0x0f8fbd, 0x0f8fbd, 0x086a9c, 0x086a9c, 1);
    bg.fillRoundedRect(layout.rootX + 14, layout.rootY + 14, layout.rootW - 28, 66, PANEL_RADIUS);
    bg.lineStyle(1, 0xffffff, 0.45);
    bg.strokeRoundedRect(layout.rootX + 14, layout.rootY + 14, layout.rootW - 28, 66, PANEL_RADIUS);
    this.shellObjects.push(bg);

    const title = this.add
      .text(viewport.centerX, layout.titleY, '精灵管理', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '32px',
        color: '#ffffff',
        stroke: '#075176',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    this.shellObjects.push(title);

    this.createShellButton(58, 48, '返回', () => this.scene.start(this.fromScene));
    this.createShellButton(140, 48, '存档', () =>
      this.scene.start(SceneKey.SAVE_SLOTS, { fromScene: SceneKey.PET_MANAGER }),
    );
    this.createShellButton(222, 48, '图鉴', () =>
      this.scene.start(SceneKey.PET_DEX, { fromScene: SceneKey.PET_MANAGER }),
    );
    this.createShellButton(304, 48, '背包', () =>
      this.scene.start(SceneKey.BACKPACK, { fromScene: SceneKey.PET_MANAGER }),
    );
    this.createShellButton(386, 48, '地图', () =>
      this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.PET_MANAGER }),
    );
  }

  private destroyShell(): void {
    for (const object of this.shellObjects) {
      object.destroy();
    }
    this.shellObjects = [];
  }

  private refresh(): void {
    this.content?.destroy();
    this.content = this.add.container(0, 0);

    const layout = this.getLayout();
    this.drawMainPanels(layout);

    const party = PlayerState.snapshot().playerPets;
    const storage = PlayerState.getPetStorage();
    this.drawTabs(layout, party.length, storage.length);

    const pets = this.shelf === 'party' ? party : storage;
    const maxPage = Math.max(0, Math.ceil(pets.length / layout.pageSize) - 1);
    this.page = Phaser.Math.Clamp(this.page, 0, maxPage);
    this.selectedIndex = Phaser.Math.Clamp(this.selectedIndex, 0, Math.max(0, pets.length - 1));

    if (pets.length === 0) {
      this.drawEmptyState(layout);
      return;
    }

    this.drawPetGrid(layout, pets);
    const selectedPet = pets[this.selectedIndex] ?? pets[0];
    if (selectedPet) this.drawPetDetail(layout, selectedPet);
  }

  private drawMainPanels(layout: PetManagerLayout): void {
    const g = this.add.graphics();
    this.drawPanel(g, layout.rosterX, layout.rosterY, layout.rosterW, layout.rosterH, 0xeafcff);
    this.drawPanel(g, layout.detailX, layout.detailY, layout.detailW, layout.detailH, 0xffffff);
    this.content?.add(g);

    this.addFittedText(
      layout.rosterX + 18,
      layout.rosterY + 18,
      '队伍与仓库',
      layout.rosterW - 36,
      {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#126b91',
        stroke: '#ffffff',
        strokeThickness: 3,
      },
    );
    this.addFittedText(
      layout.detailX + 20,
      layout.detailY + 18,
      '精灵状态总览',
      layout.detailW - 40,
      {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#126b91',
        stroke: '#ffffff',
        strokeThickness: 3,
      },
    );
  }

  private drawTabs(layout: PetManagerLayout, partyCount: number, storageCount: number): void {
    const tabY = layout.rosterY + 54;
    const tabGap = 10;
    const tabW = (layout.rosterW - 36 - tabGap) / 2;
    this.createTextButton({
      x: layout.rosterX + 18,
      y: tabY,
      width: tabW,
      height: 34,
      label: `队伍 ${partyCount}/${PARTY_PET_LIMIT}`,
      active: this.shelf === 'party',
      onClick: () => {
        this.shelf = 'party';
        this.selectedIndex = 0;
        this.page = 0;
        this.refresh();
      },
    });
    this.createTextButton({
      x: layout.rosterX + 18 + tabW + tabGap,
      y: tabY,
      width: tabW,
      height: 34,
      label: `仓库 ${storageCount}`,
      active: this.shelf === 'storage',
      onClick: () => {
        this.shelf = 'storage';
        this.selectedIndex = 0;
        this.page = 0;
        this.refresh();
      },
    });

    this.content?.add(
      this.add.text(
        layout.rosterX + 18,
        layout.rosterY + layout.rosterH - 22,
        '捕捉成功后：队伍未满加入队伍，队伍满时自动进入仓库。',
        {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '13px',
          color: '#3d7184',
        },
      ),
    );
  }

  private drawEmptyState(layout: PetManagerLayout): void {
    const message =
      this.shelf === 'party'
        ? '队伍里还没有精灵。'
        : '仓库还是空的，队伍满后新收服的精灵会来到这里。';
    this.content?.add(
      this.add
        .text(layout.rosterX + layout.rosterW / 2, layout.rosterY + layout.rosterH / 2, message, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '21px',
          color: '#1b6fa8',
          align: 'center',
          wordWrap: { width: layout.rosterW - 54 },
        })
        .setOrigin(0.5),
    );
  }

  private drawPetGrid(layout: PetManagerLayout, pets: readonly PlayerPet[]): void {
    const pageStart = this.page * layout.pageSize;
    const visible = pets.slice(pageStart, pageStart + layout.pageSize);
    const gap = 10;
    const cardAreaX = layout.rosterX + 18;
    const cardAreaY = layout.rosterY + 100;
    const cardW = (layout.rosterW - 36 - gap * (layout.cardColumns - 1)) / layout.cardColumns;
    const cardH = 66;

    visible.forEach((owned, localIndex) => {
      const index = pageStart + localIndex;
      const col = localIndex % layout.cardColumns;
      const row = Math.floor(localIndex / layout.cardColumns);
      const x = cardAreaX + col * (cardW + gap);
      const y = cardAreaY + row * (cardH + 10);
      this.drawPetCard(owned, index, x, y, cardW, cardH);
    });

    const maxPage = Math.max(0, Math.ceil(pets.length / layout.pageSize) - 1);
    const pagerY = layout.rosterY + layout.rosterH - 58;
    const pagerW = Math.min(112, (layout.rosterW - 70) / 2);
    this.createTextButton({
      x: layout.rosterX + 18,
      y: pagerY,
      width: pagerW,
      height: 32,
      label: '上一页',
      disabled: this.page <= 0,
      onClick: () => {
        this.page = Math.max(0, this.page - 1);
        this.selectedIndex = this.page * layout.pageSize;
        this.refresh();
      },
    });
    this.content?.add(
      this.add
        .text(layout.rosterX + layout.rosterW / 2, pagerY + 16, `${this.page + 1}/${maxPage + 1}`, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#326b80',
        })
        .setOrigin(0.5),
    );
    this.createTextButton({
      x: layout.rosterX + layout.rosterW - 18 - pagerW,
      y: pagerY,
      width: pagerW,
      height: 32,
      label: '下一页',
      disabled: this.page >= maxPage,
      onClick: () => {
        this.page = Math.min(maxPage, this.page + 1);
        this.selectedIndex = this.page * layout.pageSize;
        this.refresh();
      },
    });
  }

  private drawPetCard(
    owned: PlayerPet,
    index: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const pet = getPet(owned.petId);
    const selected = index === this.selectedIndex;
    const g = this.add.graphics();
    g.fillStyle(selected ? 0xfff2b0 : 0xffffff, 0.98);
    g.lineStyle(2, selected ? 0xf08c00 : 0x78c8d8, 0.95);
    g.fillRoundedRect(x, y, width, height, PANEL_RADIUS);
    g.strokeRoundedRect(x, y, width, height, PANEL_RADIUS);
    if (this.shelf === 'party' && index === 0) {
      g.fillStyle(0xff8a2a, 0.95);
      g.fillRoundedRect(x + 8, y + 7, 38, 18, 6);
    }
    this.content?.add(g);

    this.content?.add(
      this.add
        .image(x + 30, y + height / 2 + 2, ensurePlayerPetTexture(this, owned))
        .setDisplaySize(42, 42),
    );
    if (this.shelf === 'party' && index === 0) {
      this.content?.add(
        this.add
          .text(x + 27, y + 16, '出战', {
            fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
            fontSize: '11px',
            color: '#ffffff',
          })
          .setOrigin(0.5),
      );
    }

    const name = pet ? evolvedPetName(pet, owned) : owned.petId;
    createAutoScrollText({
      scene: this,
      layer: this.content ?? undefined,
      x: x + 56,
      y: y + 23,
      width: width - 66,
      height: 20,
      text: name,
      style: {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#1b5f7c',
      },
    });
    this.content?.add(
      this.add.text(x + 56, y + 40, `Lv${owned.level}  ${getPetNature(owned.natureId).name}`, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#4b6d78',
      }),
    );

    this.content?.add(
      this.add
        .zone(x + width / 2, y + height / 2, width, height)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.selectedIndex = index;
          this.refresh();
        }),
    );
  }

  private drawPetDetail(layout: PetManagerLayout, owned: PlayerPet): void {
    const pet = getPet(owned.petId);
    if (!pet) return;

    const pad = 18;
    const innerX = layout.detailX + pad;
    const innerY = layout.detailY + 54;
    const innerW = layout.detailW - pad * 2;
    const actionY = layout.detailY + layout.detailH - 40;
    const topH = Math.min(222, Math.max(204, layout.detailH * 0.42));
    const artW = Math.min(228, Math.max(178, innerW * 0.34));
    const infoX = innerX + artW + 14;
    const infoW = innerW - artW - 14;
    const displayName = evolvedPetName(pet, owned);
    const evolution = this.getEvolutionUiState(owned);

    this.drawOverviewPanel(innerX, innerY, artW, topH, owned, displayName);
    this.drawStatsPanel(infoX, innerY, infoW, topH, owned, pet, displayName);
    this.drawSkillPanel(
      innerX,
      innerY + topH + 12,
      innerW,
      actionY - (innerY + topH + 12) - 24,
      owned,
      evolution,
    );
    this.drawActionBar(layout, owned, displayName, evolution, actionY);
  }

  private drawOverviewPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    owned: PlayerPet,
    displayName: string,
  ): void {
    const g = this.add.graphics();
    this.drawPanel(g, x, y, width, height, 0xf5fdff);
    this.content?.add(g);
    this.content?.add(
      this.add
        .image(x + width / 2, y + 74, ensurePlayerPetTexture(this, owned))
        .setDisplaySize(Math.min(128, width - 56), Math.min(128, width - 56)),
    );
    this.drawMiniMeter(
      x + 42,
      y + height - 58,
      width - 58,
      'HP',
      owned.currentHp / Math.max(1, owned.currentStats.hp),
      0x39a96b,
    );
    this.drawMiniMeter(
      x + 42,
      y + height - 38,
      width - 58,
      'EXP',
      owned.exp / Math.max(1, expToNext(owned.level)),
      0x4aa3ff,
    );
    this.addFittedText(
      x + 12,
      y + height - 19,
      formatPetTalent(owned.talent).split('\n')[0] ?? '',
      width - 24,
      {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: '#7a4d12',
      },
    );

    this.addFittedText(x + 14, y + 12, displayName, width - 28, {
      fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#126b91',
      stroke: '#ffffff',
      strokeThickness: 3,
    });
  }

  private drawStatsPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    owned: PlayerPet,
    pet: NonNullable<ReturnType<typeof getPet>>,
    displayName: string,
  ): void {
    const g = this.add.graphics();
    this.drawPanel(g, x, y, width, height, 0xffffff);
    this.content?.add(g);
    createAutoScrollText({
      scene: this,
      layer: this.content ?? undefined,
      x: x + 16,
      y: y + 26,
      width: width - 32,
      height: 30,
      text: `${displayName}  Lv${owned.level}`,
      style: {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#ff7a1f',
        stroke: '#ffffff',
        strokeThickness: 4,
      },
    });

    const nature = getPetNature(owned.natureId);
    this.addFittedText(
      x + 16,
      y + 55,
      `${evolutionLabel(owned)} | ${ELEMENT_LABEL_CN[pet.element]}系`,
      width - 32,
      {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#1b6fa8',
      },
    );
    this.addFittedText(
      x + 16,
      y + 82,
      `性格：${nature.name}（${formatNatureGrowth(nature.id)}）`,
      width - 32,
      {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#7a4d12',
      },
    );

    const s = normalizeBattleStats(owned.currentStats);
    const chips = [
      ['生命', s.hp],
      ['物攻', s.atk],
      ['物防', s.def],
      ['速度', s.spd],
      ['特攻', s.spAtk],
      ['特防', s.spDef],
      ['暴击', formatPct(s.crit)],
      ['命中', formatPct(s.accuracy)],
      ['闪避', formatPct(s.evasion)],
    ];
    const chipGap = 7;
    const columns = width >= 360 ? 3 : 2;
    const chipW = (width - 32 - chipGap * (columns - 1)) / columns;
    const chipH = 25;
    chips.forEach(([label, value], index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      this.drawStatChip(
        x + 16 + col * (chipW + chipGap),
        y + 104 + row * 29,
        chipW,
        chipH,
        `${label} ${value}`,
      );
    });
  }

  private drawSkillPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    owned: PlayerPet,
    evolution: EvolutionUiState,
  ): void {
    const panelH = Math.max(116, height);
    const g = this.add.graphics();
    this.drawPanel(g, x, y, width, panelH, 0xf7feff);
    this.content?.add(g);
    this.addFittedText(x + 16, y + 12, '技能与进化规划', width - 32, {
      fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
      fontSize: '17px',
      color: '#126b91',
      stroke: '#ffffff',
      strokeThickness: 3,
    });

    const learned = owned.learnedSkillIds
      .map((id) => SKILLS[id])
      .filter((skill): skill is NonNullable<(typeof SKILLS)[string]> => Boolean(skill));
    const skillAreaY = y + 42;
    const skillColumns = width >= 470 ? 2 : 1;
    const cardGap = 8;
    const cardW = (width - 32 - cardGap * (skillColumns - 1)) / skillColumns;
    const cardH = 42;
    const visibleSkills = learned.slice(0, 4);

    if (visibleSkills.length === 0) {
      this.content?.add(
        this.add.text(x + 16, skillAreaY + 8, '暂未学会技能。', {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '15px',
          color: '#4f7482',
        }),
      );
    }

    visibleSkills.forEach((skill, index) => {
      const col = index % skillColumns;
      const row = Math.floor(index / skillColumns);
      this.drawSkillCard(
        x + 16 + col * (cardW + cardGap),
        skillAreaY + row * (cardH + 8),
        cardW,
        cardH,
        skill,
      );
    });

    const nextSkill = nextSkillUnlock(owned.petId, owned.level);
    const nextSkillDef = nextSkill ? SKILLS[nextSkill.skillId] : undefined;
    const nextSkillLine =
      nextSkill && nextSkillDef
        ? `下个技能：Lv${nextSkill.level} ${nextSkillDef.name}`
        : '技能已经全部学会';
    const moreLine =
      learned.length > visibleSkills.length
        ? `另有 ${learned.length - visibleSkills.length} 个技能`
        : '';
    const info = [moreLine, nextSkillLine, evolution.line].filter(Boolean).join('  ·  ');
    this.addFittedText(x + 16, y + panelH - 28, info, width - 32, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#325d6b',
    });
  }

  private drawActionBar(
    layout: PetManagerLayout,
    owned: PlayerPet,
    displayName: string,
    evolution: EvolutionUiState,
    y: number,
  ): void {
    const petKey = playerPetKey(owned);
    const canSetActive = this.shelf === 'party' && this.selectedIndex !== 0;
    const actions = [
      {
        label: '设为出战',
        disabled: !canSetActive,
        onClick: () => {
          if (PlayerState.setActivePet(petKey)) {
            this.selectedIndex = 0;
            this.showToast(`${displayName} 已设为出战精灵。`);
            this.refresh();
          }
        },
      },
      {
        label: this.shelf === 'party' ? '存入仓库' : '调入队伍',
        disabled: false,
        onClick: () => this.togglePetShelf(owned, displayName),
      },
      {
        label: '恢复生命',
        disabled: false,
        onClick: () => {
          if (PlayerState.healPet(petKey)) {
            this.showToast(`${displayName} 的生命恢复了。`);
            this.refresh();
          }
        },
      },
      {
        label: '潜能训练',
        disabled: false,
        onClick: () => {
          const result = PlayerState.trainPetTalent(petKey);
          this.showToast(result.message);
          if (result.ok) this.refresh();
        },
      },
      {
        label: evolution.canEvolveNow ? '进化' : '未达条件',
        disabled: false,
        onClick: () => this.tryEvolvePet(owned, displayName, evolution),
      },
    ] as const;

    const gap = 8;
    const startX = layout.detailX + 18;
    const cssViewportWidth = globalThis.window?.innerWidth ?? layout.viewport.width;
    const fullscreenButtonReserve = cssViewportWidth <= 900 ? 164 : 0;
    const barW = layout.detailW - 36 - fullscreenButtonReserve;
    const buttonW = (barW - gap * (actions.length - 1)) / actions.length;
    actions.forEach((action, index) => {
      this.createTextButton({
        x: startX + index * (buttonW + gap),
        y,
        width: buttonW,
        height: 34,
        label: action.label,
        disabled: action.disabled,
        tone: action.label === '进化' ? 'gold' : 'blue',
        onClick: action.onClick,
      });
    });
  }

  private togglePetShelf(owned: PlayerPet, displayName: string): void {
    const petKey = playerPetKey(owned);
    if (this.shelf === 'party') {
      if (!PlayerState.sendPetToStorage(petKey)) {
        this.showToast('至少要留一只精灵在队伍里。');
        return;
      }
      this.selectedIndex = 0;
      this.showToast(`${displayName} 已放入精灵仓库。`);
    } else {
      const result = PlayerState.movePetToParty(petKey);
      if (!result.ok) return;
      this.shelf = 'party';
      this.selectedIndex = PlayerState.snapshot().playerPets.findIndex(
        (p) => playerPetKey(p) === petKey,
      );
      this.showToast(
        result.swappedPetId ? '队伍已满，已和末位精灵交换。' : `${displayName} 已加入队伍。`,
      );
    }
    this.refresh();
  }

  private tryEvolvePet(owned: PlayerPet, displayName: string, evolution: EvolutionUiState): void {
    if (!evolution.canEvolveNow) {
      if (evolution.nextLevel && owned.level < evolution.nextLevel) {
        this.showToast(`达到 Lv${evolution.nextLevel} 后可以进化。`);
      } else if (evolution.requiredItemName && !evolution.hasRequiredItem) {
        this.showToast(`需要 ${evolution.requiredItemName}，去活动广场完成对应活动。`);
      } else {
        this.showToast('已经是完全体。');
      }
      return;
    }
    if (PlayerState.evolvePet(playerPetKey(owned))) {
      this.showToast(`${displayName} 进化了！`);
      this.refresh();
    }
  }

  private getEvolutionUiState(owned: PlayerPet): EvolutionUiState {
    const nextLevel = nextEvolutionLevel(owned);
    const requiredItemId = requiredEvolutionItem(owned);
    const requiredItemName = requiredItemId
      ? (getItem(requiredItemId)?.name ?? requiredItemId)
      : null;
    const hasRequiredItem = !requiredItemId || PlayerState.getItemCount(requiredItemId) > 0;
    const canEvolveNow = canEvolve(owned) && hasRequiredItem;
    const line =
      nextLevel === null
        ? '进化：已达到完全体'
        : owned.level >= nextLevel && requiredItemName && !hasRequiredItem
          ? `进化：需要 ${requiredItemName}`
          : owned.level >= nextLevel
            ? '进化：现在可以进化'
            : `进化：Lv${nextLevel} 可进化`;
    return { canEvolveNow, nextLevel, requiredItemName, hasRequiredItem, line };
  }

  private drawSkillCard(
    x: number,
    y: number,
    width: number,
    height: number,
    skill: NonNullable<(typeof SKILLS)[string]>,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.98);
    g.lineStyle(1, 0x8acfe0, 0.95);
    g.fillRoundedRect(x, y, width, height, 7);
    g.strokeRoundedRect(x, y, width, height, 7);
    g.fillStyle(elementTint(skill.element), 0.18);
    g.fillRoundedRect(x + 6, y + 7, 52, height - 14, 7);
    this.content?.add(g);

    this.addFittedText(x + 12, y + 12, ELEMENT_LABEL_CN[skill.element], 40, {
      fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#126b91',
    });
    createAutoScrollText({
      scene: this,
      layer: this.content ?? undefined,
      x: x + 66,
      y: y + 15,
      width: width - 76,
      height: 18,
      text: skill.name,
      style: {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#204f66',
      },
    });
    this.addFittedText(
      x + 66,
      y + 27,
      `威力 ${skill.power}  命中 ${Math.round(skill.accuracy * 100)}%`,
      width - 76,
      {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: '#5a7580',
      },
    );
  }

  private drawStatChip(x: number, y: number, width: number, height: number, label: string): void {
    const g = this.add.graphics();
    g.fillStyle(0xeaf8ff, 0.96);
    g.lineStyle(1, 0x9bd5e6, 0.95);
    g.fillRoundedRect(x, y, width, height, 7);
    g.strokeRoundedRect(x, y, width, height, 7);
    this.content?.add(g);
    this.addFittedText(x + 8, y + 7, label, width - 16, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#2c6075',
    });
  }

  private drawMiniMeter(
    x: number,
    y: number,
    width: number,
    label: string,
    ratio: number,
    color: number,
  ): void {
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    const g = this.add.graphics();
    g.fillStyle(0x0b3768, 0.12);
    g.fillRoundedRect(x, y, width, 11, 6);
    g.lineStyle(1, 0x63b9d2, 0.6);
    g.strokeRoundedRect(x, y, width, 11, 6);
    g.fillStyle(color, 0.92);
    g.fillRoundedRect(x + 2, y + 2, Math.max(8, (width - 4) * clamped), 7, 4);
    this.content?.add(g);
    this.content?.add(
      this.add
        .text(x - 8, y + 5.5, label, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '10px',
          color: '#326b80',
          stroke: '#ffffff',
          strokeThickness: 2,
        })
        .setOrigin(1, 0.5),
    );
  }

  private createShellButton(x: number, y: number, label: string, onClick: () => void): void {
    this.shellObjects.push(
      createNavIconButton(this, {
        x,
        y,
        label,
        onClick,
        depth: 100,
        width: label.length >= 3 ? 78 : 66,
      }),
    );
  }

  private createTextButton(options: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly label: string;
    readonly disabled?: boolean;
    readonly active?: boolean;
    readonly tone?: 'blue' | 'gold';
    readonly onClick: () => void;
  }): void {
    const disabled = options.disabled ?? false;
    const active = options.active ?? false;
    const tone = options.tone ?? 'blue';
    const fill = disabled ? 0xc9d7de : active ? 0xffd35a : tone === 'gold' ? 0xffba35 : 0x67c6ee;
    const stroke = active ? 0xf08c00 : 0xffffff;
    const textColor = disabled ? '#ecf5f8' : active ? '#7b4200' : '#ffffff';
    const textStroke = disabled
      ? '#667783'
      : active
        ? '#ffffff'
        : tone === 'gold'
          ? '#94530c'
          : '#1b6fa8';

    const g = this.add.graphics();
    g.fillStyle(fill, disabled ? 0.82 : 0.96);
    g.lineStyle(2, stroke, 0.98);
    g.fillRoundedRect(options.x, options.y, options.width, options.height, PANEL_RADIUS);
    g.strokeRoundedRect(options.x, options.y, options.width, options.height, PANEL_RADIUS);
    this.content?.add(g);

    const text = this.add
      .text(options.x + options.width / 2, options.y + options.height / 2, options.label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: options.width < 104 ? '13px' : '15px',
        color: textColor,
        stroke: textStroke,
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const maxTextWidth = options.width - 12;
    if (text.width > maxTextWidth) {
      text.setScale(Math.max(0.78, maxTextWidth / text.width), 1);
    }
    this.content?.add(text);

    if (disabled) return;
    this.content?.add(
      this.add
        .zone(
          options.x + options.width / 2,
          options.y + options.height / 2,
          options.width,
          options.height,
        )
        .setInteractive({ useHandCursor: true })
        .on('pointerup', options.onClick),
    );
  }

  private addFittedText(
    x: number,
    y: number,
    text: string,
    maxWidth: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const label = this.add.text(x, y, text, style);
    if (label.width > maxWidth) {
      label.setScale(Math.max(0.72, maxWidth / label.width), 1);
    }
    this.content?.add(label);
    return label;
  }

  private drawPanel(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: number,
  ): void {
    g.fillStyle(fill, 0.96);
    g.lineStyle(2, 0x65b8cf, 0.9);
    g.fillRoundedRect(x, y, width, height, PANEL_RADIUS);
    g.strokeRoundedRect(x, y, width, height, PANEL_RADIUS);
    g.fillStyle(0xffffff, 0.28);
    g.fillRoundedRect(x + 5, y + 5, width - 10, 20, 7);
  }

  private getLayout(): PetManagerLayout {
    const viewport = this.getViewportBounds();
    const rootX = viewport.left + OUTER_MARGIN;
    const rootY = viewport.top + OUTER_MARGIN;
    const rootW = viewport.width - OUTER_MARGIN * 2;
    const rootH = viewport.height - OUTER_MARGIN * 2;
    const contentX = rootX + 16;
    const contentY = rootY + 96;
    const contentW = rootW - 32;
    const contentH = rootH - 112;
    const rosterW = Math.min(450, Math.max(340, contentW * 0.34));
    const gutter = 16;
    const detailW = contentW - rosterW - gutter;
    const cardColumns = rosterW >= 330 ? 2 : 1;
    const cardRows = Math.max(3, Math.floor((contentH - 172) / 76));
    const pageSize = Math.max(cardColumns, cardColumns * cardRows);

    return {
      viewport,
      rootX,
      rootY,
      rootW,
      rootH,
      titleY: rootY + 47,
      contentX,
      contentY,
      contentW,
      contentH,
      rosterX: contentX,
      rosterY: contentY,
      rosterW,
      rosterH: contentH,
      detailX: contentX + rosterW + gutter,
      detailY: contentY,
      detailW,
      detailH: contentH,
      cardColumns,
      cardRows,
      pageSize,
    };
  }

  private getViewportBounds(): ViewBounds {
    const camera = this.cameras.main;
    const width = Math.max(GAME_WIDTH, camera.width);
    const height = Math.max(GAME_HEIGHT, camera.height);
    const left = camera.scrollX;
    const top = camera.scrollY;
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    };
  }

  private showToast(message: string): void {
    this.clearToast();
    const viewport = this.getViewportBounds();
    this.toast = this.add
      .text(viewport.centerX, viewport.bottom - 38, message, {
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
    this.toastTimer = this.time.delayedCall(1800, () => {
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

function playerPetKey(owned: PlayerPet): string {
  return owned.instanceId ?? owned.petId;
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function elementTint(element: string): number {
  switch (element) {
    case 'fire':
      return 0xff8a2a;
    case 'water':
      return 0x42a5ff;
    case 'grass':
      return 0x55b76a;
    case 'electric':
      return 0xffd93d;
    case 'light':
      return 0xd58cff;
    default:
      return 0x8acfe0;
  }
}
