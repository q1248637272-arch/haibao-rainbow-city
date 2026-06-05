import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { ELEMENT_COLOR, ELEMENT_LABEL_CN } from '@/data/elements';
import { PET_LEARNSETS } from '@/data/petLearnsets';
import { SKILLS } from '@/data/skills';
import { normalizeBattleStats } from '@/systems/BattleStats';
import { evolvedPetName } from '@/systems/EvolutionSystem';
import {
  buildPetDexSnapshot,
  firstTraceForEntry,
  PET_DEX_FILTERS,
  type PetDexEntry,
  type PetDexFilter,
} from '@/systems/PetDexProgress';
import { PlayerState } from '@/systems/PlayerState';
import { preloadPetLibraryAssets } from '@/systems/SceneAssetPreloader';
import { createAutoScrollText } from '@/ui/AutoScrollText';
import { createNavIconButton } from '@/ui/NavIconButton';
import type { PetTrace } from '@/data/petTraces';
import { ensurePetTextureForStage } from '@/utils/playerPetTexture';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

export const PET_DEX_BACKGROUND_KEY = 'premium_pet_archive_image2';

const PET_DEX_BACKGROUND_SOURCE_WIDTH = 960;
const PET_DEX_BACKGROUND_SOURCE_HEIGHT = 640;
const OUTER_MARGIN = 18;
const PANEL_RADIUS = 8;
const FILTER_ROW_GAP = 8;

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

interface PetDexLayout {
  readonly viewport: ViewBounds;
  readonly rootX: number;
  readonly rootY: number;
  readonly rootW: number;
  readonly rootH: number;
  readonly headerX: number;
  readonly headerY: number;
  readonly headerW: number;
  readonly headerH: number;
  readonly filterX: number;
  readonly filterY: number;
  readonly filterW: number;
  readonly filterH: number;
  readonly listX: number;
  readonly listY: number;
  readonly listW: number;
  readonly listH: number;
  readonly detailX: number;
  readonly detailY: number;
  readonly detailW: number;
  readonly detailH: number;
  readonly cardColumns: number;
  readonly cardHeight: number;
  readonly pageSize: number;
}

export class PetDexScene extends Phaser.Scene {
  private fromScene: string = SceneKey.WORLD;
  private selectedPetId: string | null = null;
  private filter: PetDexFilter = 'all';
  private page = 0;
  private shellObjects: Phaser.GameObjects.GameObject[] = [];
  private content: Phaser.GameObjects.Container | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  public constructor() {
    super({ key: SceneKey.PET_DEX });
  }

  public init(data?: { readonly fromScene?: string }): void {
    this.fromScene = data?.fromScene ?? SceneKey.WORLD;
    this.selectedPetId = null;
    this.filter = 'all';
    this.page = 0;
  }

  public preload(): void {
    preloadPetLibraryAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.drawBackground();
    this.refresh();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      this.destroyShell();
      this.content?.destroy();
      this.content = null;
      this.clearToast();
    });
  }

  private handleResize(): void {
    this.refresh();
  }

  private drawBackground(): void {
    if (this.textures.exists(PET_DEX_BACKGROUND_KEY)) {
      createResponsiveMapBackground(this, PET_DEX_BACKGROUND_KEY, {
        stageAlpha: 0.92,
        coverAlpha: 0.92,
        stageWidth: PET_DEX_BACKGROUND_SOURCE_WIDTH,
        stageHeight: PET_DEX_BACKGROUND_SOURCE_HEIGHT,
      });
      return;
    }
    createResponsiveMapBackground(this, 'legacy_world_map_full', {
      stageAlpha: 0.5,
      coverAlpha: 0.5,
    });
  }

  private refresh(): void {
    this.destroyShell();
    this.content?.destroy();

    const layout = this.getLayout();
    const snapshot = buildPetDexSnapshot(PlayerState.snapshot(), this.filter);
    const entries = snapshot.entries;
    if (!this.selectedPetId || !entries.some((entry) => entry.pet.id === this.selectedPetId)) {
      this.selectedPetId = entries[0]?.pet.id ?? snapshot.allEntries[0]?.pet.id ?? null;
      this.page = 0;
    }

    const selectedEntry =
      entries.find((entry) => entry.pet.id === this.selectedPetId) ??
      snapshot.allEntries.find((entry) => entry.pet.id === this.selectedPetId) ??
      snapshot.allEntries[0];

    const selectedIndex = entries.findIndex((entry) => entry.pet.id === selectedEntry?.pet.id);
    if (selectedIndex >= 0) {
      this.page = Math.floor(selectedIndex / layout.pageSize);
    }
    const maxPage = Math.max(0, Math.ceil(entries.length / layout.pageSize) - 1);
    this.page = Phaser.Math.Clamp(this.page, 0, maxPage);

    this.drawShell(layout, snapshot);
    this.content = this.add.container(0, 0).setDepth(40);
    this.drawFilters(layout, snapshot);
    this.drawList(layout, entries, maxPage);
    this.drawDetail(layout, selectedEntry);
  }

  private drawShell(
    layout: PetDexLayout,
    snapshot: ReturnType<typeof buildPetDexSnapshot>,
  ): void {
    const { viewport } = layout;
    const g = this.add.graphics().setDepth(20);
    g.fillStyle(0x071f3d, 0.4);
    g.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(layout.rootX, layout.rootY, layout.rootW, layout.rootH, PANEL_RADIUS);
    g.lineStyle(2, 0xffffff, 0.44);
    g.strokeRoundedRect(layout.rootX, layout.rootY, layout.rootW, layout.rootH, PANEL_RADIUS);
    g.fillGradientStyle(0x0c79a8, 0x0c79a8, 0x1768a6, 0x073d73, 0.94);
    g.fillRoundedRect(layout.headerX, layout.headerY, layout.headerW, layout.headerH, PANEL_RADIUS);
    g.lineStyle(1, 0xffffff, 0.5);
    g.strokeRoundedRect(layout.headerX, layout.headerY, layout.headerW, layout.headerH, PANEL_RADIUS);
    this.shellObjects.push(g);

    const title = this.add
      .text(viewport.centerX, layout.headerY + 29, '精灵图鉴档案馆', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '30px',
        color: '#fff4a8',
        stroke: '#062b54',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(24);
    this.shellObjects.push(title);

    const nextMissing = snapshot.allEntries.find((entry) => !entry.owned);
    const nextTrace = nextMissing ? firstTraceForEntry(nextMissing) : null;
    const subtitle = nextMissing
      ? `下一个目标：${nextMissing.pet.name}${nextTrace ? ` · ${nextTrace.label}` : ''}`
      : '全部精灵已登记，继续培养队伍吧';
    const subtitleText = this.add
      .text(viewport.centerX, layout.headerY + 58, subtitle, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#062b54',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(24);
    if (subtitleText.width > layout.headerW - 260) {
      subtitleText.setScale(Math.max(0.76, (layout.headerW - 260) / subtitleText.width), 1);
    }
    this.shellObjects.push(subtitleText);

    this.drawSummaryStrip(layout, snapshot);
    this.createShellButton(72, 42, '返回', () => this.scene.start(this.fromScene));
    this.createShellButton(154, 42, '地图', () =>
      this.scene.start(SceneKey.LEGACY_ROUTE_MAP, { fromScene: SceneKey.PET_DEX }),
    );
    this.createShellButton(236, 42, '精灵', () =>
      this.scene.start(SceneKey.PET_MANAGER, { fromScene: SceneKey.PET_DEX }),
    );
  }

  private drawSummaryStrip(
    layout: PetDexLayout,
    snapshot: ReturnType<typeof buildPetDexSnapshot>,
  ): void {
    const y = layout.headerY + 14;
    const x = layout.headerX + 22;
    const w = Math.min(220, layout.headerW * 0.24);
    const ratio = snapshot.summary.completionRatio;
    const g = this.add.graphics().setDepth(25);
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(x, y, w, 44, 8);
    g.fillStyle(0x052a50, 0.44);
    g.fillRoundedRect(x + 12, y + 27, w - 24, 8, 5);
    g.fillStyle(0xffd93d, 0.96);
    g.fillRoundedRect(x + 12, y + 27, Math.max(8, (w - 24) * ratio), 8, 5);
    this.shellObjects.push(g);

    const text = this.add
      .text(
        x + 12,
        y + 9,
        `收集 ${snapshot.summary.owned}/${snapshot.summary.total} · ${Math.round(ratio * 100)}%`,
        {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '15px',
          color: '#ffffff',
          stroke: '#062b54',
          strokeThickness: 3,
        },
      )
      .setDepth(26);
    this.shellObjects.push(text);
  }

  private drawFilters(
    layout: PetDexLayout,
    snapshot: ReturnType<typeof buildPetDexSnapshot>,
  ): void {
    const g = this.add.graphics();
    this.drawPanel(g, layout.filterX, layout.filterY, layout.filterW, layout.filterH, 0xf4fdff, 0.9);
    this.content?.add(g);

    const gap = FILTER_ROW_GAP;
    const buttonW = Math.max(74, Math.min(112, (layout.filterW - 28 - gap * 8) / 9));
    const rowY = layout.filterY + 17;
    const startX = layout.filterX + 14;

    PET_DEX_FILTERS.forEach((filter, index) => {
      const x = startX + index * (buttonW + gap);
      this.createTextButton({
        x,
        y: rowY,
        width: buttonW,
        height: 34,
        label: this.filterLabel(filter, snapshot),
        active: this.filter === filter,
        tone: filterTone(filter),
        onClick: () => {
          this.filter = filter;
          this.page = 0;
          this.selectedPetId = null;
          this.refresh();
        },
      });
    });
  }

  private drawList(
    layout: PetDexLayout,
    entries: readonly PetDexEntry[],
    maxPage: number,
  ): void {
    const g = this.add.graphics();
    this.drawPanel(g, layout.listX, layout.listY, layout.listW, layout.listH, 0xeafcff, 0.94);
    this.content?.add(g);
    this.addFittedText(layout.listX + 18, layout.listY + 14, '档案索引', layout.listW - 36, {
      fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
      fontSize: '19px',
      color: '#126b91',
      stroke: '#ffffff',
      strokeThickness: 3,
    });

    if (entries.length === 0) {
      this.content?.add(
        this.add
          .text(layout.listX + layout.listW / 2, layout.listY + layout.listH / 2, '暂无匹配精灵', {
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontSize: '18px',
            color: '#1b6fa8',
          })
          .setOrigin(0.5),
      );
      return;
    }

    const start = this.page * layout.pageSize;
    const visible = entries.slice(start, start + layout.pageSize);
    const cardGap = 10;
    const cardAreaX = layout.listX + 16;
    const cardAreaY = layout.listY + 50;
    const cardW =
      (layout.listW - 32 - cardGap * (layout.cardColumns - 1)) / layout.cardColumns;

    visible.forEach((entry, localIndex) => {
      const col = localIndex % layout.cardColumns;
      const row = Math.floor(localIndex / layout.cardColumns);
      const x = cardAreaX + col * (cardW + cardGap);
      const y = cardAreaY + row * (layout.cardHeight + 9);
      this.drawPetCard(entry, x, y, cardW, layout.cardHeight);
    });

    const pagerY = layout.listY + layout.listH - 42;
    const pagerW = Math.min(108, (layout.listW - 76) / 2);
    this.createTextButton({
      x: layout.listX + 16,
      y: pagerY,
      width: pagerW,
      height: 32,
      label: '上一页',
      disabled: this.page <= 0,
      onClick: () => {
        this.page = Math.max(0, this.page - 1);
        this.selectedPetId = entries[this.page * layout.pageSize]?.pet.id ?? this.selectedPetId;
        this.refresh();
      },
    });
    this.content?.add(
      this.add
        .text(layout.listX + layout.listW / 2, pagerY + 16, `${this.page + 1}/${maxPage + 1}`, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '15px',
          color: '#326b80',
        })
        .setOrigin(0.5),
    );
    this.createTextButton({
      x: layout.listX + layout.listW - 16 - pagerW,
      y: pagerY,
      width: pagerW,
      height: 32,
      label: '下一页',
      disabled: this.page >= maxPage,
      onClick: () => {
        this.page = Math.min(maxPage, this.page + 1);
        this.selectedPetId = entries[this.page * layout.pageSize]?.pet.id ?? this.selectedPetId;
        this.refresh();
      },
    });
  }

  private drawPetCard(entry: PetDexEntry, x: number, y: number, width: number, height: number): void {
    const selected = entry.pet.id === this.selectedPetId;
    const g = this.add.graphics();
    g.fillStyle(selected ? 0xfff1a8 : entry.owned ? 0xffffff : 0xdbeaf0, 0.96);
    g.lineStyle(2, selected ? 0xf08c00 : entry.owned ? 0x63b9d2 : 0x9ab7c2, 0.95);
    g.fillRoundedRect(x, y, width, height, PANEL_RADIUS);
    g.strokeRoundedRect(x, y, width, height, PANEL_RADIUS);
    g.fillStyle(ELEMENT_COLOR[entry.pet.element], entry.owned ? 0.24 : 0.12);
    g.fillRoundedRect(x + 7, y + 8, 48, height - 16, 7);
    this.content?.add(g);

    const art = this.add
      .image(x + 31, y + height / 2 + 2, ensurePetTextureForStage(this, entry.pet.id, 0, 1))
      .setDisplaySize(42, 42)
      .setAlpha(entry.owned ? 1 : 0.55);
    this.content?.add(art);

    createAutoScrollText({
      scene: this,
      layer: this.content ?? undefined,
      x: x + 64,
      y: y + 24,
      width: width - 74,
      height: 20,
      text: entry.pet.name,
      style: {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: entry.owned ? '#1b5f7c' : '#607983',
      },
    });
    this.content?.add(
      this.add.text(x + 64, y + 42, `${ELEMENT_LABEL_CN[entry.pet.element]}系 · ${entry.powerScore}`, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: '#4b6d78',
      }),
    );
    this.content?.add(
      this.add.text(x + width - 50, y + height - 22, entry.owned ? '已登记' : '未捕捉', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: entry.owned ? '#168a48' : '#8a5f2b',
      }),
    );
    this.content?.add(
      this.add
        .zone(x + width / 2, y + height / 2, width, height)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.selectedPetId = entry.pet.id;
          this.refresh();
        }),
    );
  }

  private drawDetail(layout: PetDexLayout, entry?: PetDexEntry): void {
    const g = this.add.graphics();
    this.drawPanel(g, layout.detailX, layout.detailY, layout.detailW, layout.detailH, 0xffffff, 0.96);
    this.content?.add(g);
    if (!entry) return;

    const pad = 18;
    const innerX = layout.detailX + pad;
    const innerY = layout.detailY + 52;
    const innerW = layout.detailW - pad * 2;
    const artW = Math.min(210, Math.max(150, innerW * 0.32));
    const artH = Math.min(216, Math.max(150, layout.detailH * 0.34));
    const infoX = innerX + artW + 18;
    const infoW = innerW - artW - 18;

    this.addFittedText(layout.detailX + 18, layout.detailY + 14, '精灵档案', layout.detailW - 36, {
      fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
      fontSize: '20px',
      color: '#126b91',
      stroke: '#ffffff',
      strokeThickness: 3,
    });

    const artPanel = this.add.graphics();
    this.drawPanel(artPanel, innerX, innerY, artW, artH, 0xf5fdff, 0.96);
    this.content?.add(artPanel);
    this.content?.add(
      this.add
        .image(
          innerX + artW / 2,
          innerY + artH / 2 - 8,
          ensurePetTextureForStage(this, entry.pet.id, 0, 1),
        )
        .setDisplaySize(Math.min(132, artW - 42), Math.min(132, artW - 42))
        .setAlpha(entry.owned ? 1 : 0.56),
    );
    this.drawElementBadge(innerX + 16, innerY + artH - 34, artW - 32, entry);

    createAutoScrollText({
      scene: this,
      layer: this.content ?? undefined,
      x: infoX,
      y: innerY + 18,
      width: infoW,
      height: 32,
      text: entry.pet.name,
      style: {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '25px',
        color: '#ff7a1f',
        stroke: '#ffffff',
        strokeThickness: 4,
      },
    });
    this.addFittedText(
      infoX,
      innerY + 47,
      `${ELEMENT_LABEL_CN[entry.pet.element]}系 · ${entry.owned ? '已登记' : '尚未捕捉'} · 战力 ${entry.powerScore}`,
      infoW,
      {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#1b6fa8',
      },
    );
    this.content?.add(
      this.add.text(infoX, innerY + 78, wrapByChars(entry.pet.description, Math.max(16, Math.floor(infoW / 15))), {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#315d6b',
        lineSpacing: 4,
        wordWrap: { width: infoW },
      }),
    );

    const statsY = innerY + artH + 12;
    const traceColumns = layout.detailW >= 420 ? Math.max(1, Math.min(3, entry.traces.length)) : 1;
    const traceRows = Math.max(1, Math.ceil(Math.min(3, entry.traces.length) / traceColumns));
    const traceY = layout.detailY + layout.detailH - (28 + traceRows * 38) - 16;
    const skillY = statsY + (innerW >= 520 ? 54 : 92);
    this.drawStats(layout, entry, innerX, statsY, innerW);
    if (skillY + 92 < traceY - 8) {
      this.drawSkillAndEvolution(layout, entry, innerX, skillY, innerW);
    }
    this.drawTraceButtons(layout, entry, innerX, traceY, innerW);
  }

  private drawElementBadge(
    x: number,
    y: number,
    width: number,
    entry: PetDexEntry,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(ELEMENT_COLOR[entry.pet.element], 0.26);
    g.lineStyle(1, ELEMENT_COLOR[entry.pet.element], 0.74);
    g.fillRoundedRect(x, y, width, 24, 7);
    g.strokeRoundedRect(x, y, width, 24, 7);
    this.content?.add(g);
    this.addFittedText(x + 8, y + 5, `${ELEMENT_LABEL_CN[entry.pet.element]}系图鉴`, width - 16, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#194f66',
    });
  }

  private drawStats(
    layout: PetDexLayout,
    entry: PetDexEntry,
    x: number,
    y: number,
    width: number,
  ): void {
    const stats = normalizeBattleStats(entry.pet.baseStats);
    const rows = [
      ['生命', stats.hp],
      ['物攻', stats.atk],
      ['物防', stats.def],
      ['速度', stats.spd],
      ['特攻', stats.spAtk],
      ['特防', stats.spDef],
    ] as const;
    const columns = width >= 520 ? 6 : 3;
    const gap = 7;
    const chipW = (width - gap * (columns - 1)) / columns;
    const chipH = 30;
    rows.forEach(([label, value], index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      this.drawStatChip(x + col * (chipW + gap), y + row * 36, chipW, chipH, `${label} ${value}`);
    });
    if (layout.detailH < 352) return;
    this.addFittedText(
      x,
      y + (columns >= 6 ? 40 : 76),
      `暴击 ${Math.round(stats.crit * 100)}% · 命中 ${Math.round(stats.accuracy * 100)}% · 闪避 ${Math.round(stats.evasion * 100)}%`,
      width,
      {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#5d7982',
      },
    );
  }

  private drawSkillAndEvolution(
    layout: PetDexLayout,
    entry: PetDexEntry,
    x: number,
    y: number,
    width: number,
  ): void {
    if (layout.detailH < 332) return;
    const g = this.add.graphics();
    this.drawPanel(g, x, y, width, 92, 0xf7feff, 0.96);
    this.content?.add(g);
    const skillLine = this.skillSummary(entry.pet.id);
    const evolutionLine = `进化：${evolvedPetName(entry.pet, 0)} / ${evolvedPetName(entry.pet, 1)} / ${evolvedPetName(entry.pet, 2)}`;
    this.addFittedText(x + 12, y + 12, skillLine, width - 24, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#2b5260',
    });
    this.content?.add(
      this.add.text(x + 12, y + 42, wrapByChars(evolutionLine, Math.max(28, Math.floor(width / 15))), {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#5d7982',
        lineSpacing: 4,
        wordWrap: { width: width - 24 },
      }),
    );
  }

  private drawTraceButtons(
    layout: PetDexLayout,
    entry: PetDexEntry,
    x: number,
    y: number,
    width: number,
  ): void {
    const traces = entry.traces.slice(0, 3);
    this.addFittedText(x, y, '发现踪迹', width, {
      fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
      fontSize: '17px',
      color: '#126b91',
      stroke: '#ffffff',
      strokeThickness: 3,
    });
    if (traces.length === 0) {
      this.addFittedText(x, y + 32, '暂时没有稳定记录', width, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#5d7982',
      });
      return;
    }

    const gap = 8;
    const columns = layout.detailW >= 420 ? Math.max(1, traces.length) : 1;
    const buttonW = columns > 1 ? (width - gap * (columns - 1)) / columns : width;
    traces.forEach((trace, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      this.createTextButton({
        x: x + col * (buttonW + gap),
        y: y + 28 + row * 38,
        width: buttonW,
        height: 32,
        label: trace.label,
        tone: 'gold',
        onClick: () => this.followTrace(trace),
      });
    });
  }

  private skillSummary(petId: string): string {
    const rows = (PET_LEARNSETS[petId] ?? []).slice(0, 4);
    if (rows.length === 0) return '技能：暂无资料';
    const labels = rows.map((row) => {
      const skill = SKILLS[row.skillId];
      return skill ? `Lv${row.level} ${skill.name}` : `Lv${row.level} ${row.skillId}`;
    });
    return `技能：${labels.join(' · ')}`;
  }

  private followTrace(trace?: PetTrace): void {
    if (!trace) {
      this.showToast('暂时没有记录到稳定踪迹。');
      return;
    }
    if (trace.scene === SceneKey.LEGACY_LOCATION && trace.locationId) {
      this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: trace.locationId });
      return;
    }
    if (trace.scene === SceneKey.ACTIVITY) {
      this.scene.start(SceneKey.ACTIVITY, { fromScene: SceneKey.PET_DEX });
      return;
    }
    if (trace.scene === SceneKey.VIP_PANEL) {
      this.scene.start(SceneKey.VIP_PANEL);
      return;
    }
    this.scene.start(trace.scene);
  }

  private filterLabel(
    filter: PetDexFilter,
    snapshot: ReturnType<typeof buildPetDexSnapshot>,
  ): string {
    if (filter === 'all') return `全部 ${snapshot.summary.total}`;
    if (filter === 'owned') return `已收 ${snapshot.summary.owned}`;
    if (filter === 'missing') return `未收 ${snapshot.summary.missing}`;
    const stats = snapshot.summary.byElement[filter];
    return `${ELEMENT_LABEL_CN[filter]} ${stats.owned}/${stats.total}`;
  }

  private createShellButton(x: number, y: number, label: string, onClick: () => void): void {
    this.shellObjects.push(
      createNavIconButton(this, {
        x,
        y,
        label,
        width: 76,
        onClick,
        depth: 100,
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
    readonly tone?: 'blue' | 'gold' | 'plain';
    readonly onClick: () => void;
  }): void {
    const disabled = options.disabled ?? false;
    const active = options.active ?? false;
    const tone = options.tone ?? 'blue';
    const fill = disabled
      ? 0xc9d7de
      : active
        ? 0xffd35a
        : tone === 'gold'
          ? 0xffba35
          : tone === 'plain'
            ? 0xffffff
            : 0x67c6ee;
    const stroke = active ? 0xf08c00 : tone === 'plain' ? 0x8acfe0 : 0xffffff;
    const textColor = disabled ? '#ecf5f8' : active ? '#7b4200' : tone === 'plain' ? '#126b91' : '#ffffff';
    const textStroke = disabled
      ? '#667783'
      : active || tone === 'plain'
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
        fontSize: options.width < 78 ? '12px' : '14px',
        color: textColor,
        stroke: textStroke,
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const maxTextWidth = options.width - 12;
    if (text.width > maxTextWidth) {
      text.setScale(Math.max(0.72, maxTextWidth / text.width), 1);
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

  private drawStatChip(x: number, y: number, width: number, height: number, label: string): void {
    const g = this.add.graphics();
    g.fillStyle(0xeaf8ff, 0.96);
    g.lineStyle(1, 0x9bd5e6, 0.95);
    g.fillRoundedRect(x, y, width, height, 7);
    g.strokeRoundedRect(x, y, width, height, 7);
    this.content?.add(g);
    this.addFittedText(x + 8, y + 8, label, width - 16, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#2c6075',
    });
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
    alpha = 0.96,
  ): void {
    g.fillStyle(fill, alpha);
    g.lineStyle(2, 0x65b8cf, 0.88);
    g.fillRoundedRect(x, y, width, height, PANEL_RADIUS);
    g.strokeRoundedRect(x, y, width, height, PANEL_RADIUS);
    g.fillStyle(0xffffff, 0.26);
    g.fillRoundedRect(x + 5, y + 5, width - 10, 20, 7);
  }

  private getLayout(): PetDexLayout {
    const viewport = this.getViewportBounds();
    const tallMode = viewport.height > viewport.width * 1.12;
    const rootX = viewport.left + OUTER_MARGIN;
    const rootY = viewport.top + OUTER_MARGIN;
    const rootW = viewport.width - OUTER_MARGIN * 2;
    const rootH = tallMode
      ? Math.min(viewport.height - OUTER_MARGIN * 2, 1250)
      : viewport.height - OUTER_MARGIN * 2;
    const headerX = rootX + 14;
    const headerY = rootY + 14;
    const headerW = rootW - 28;
    const headerH = 76;
    const filterX = rootX + 14;
    const filterY = headerY + headerH + 10;
    const filterW = headerW;
    const filterH = 62;
    const contentX = rootX + 14;
    const contentY = filterY + filterH + 12;
    const contentW = rootW - 28;
    const contentH = Math.max(340, rootY + rootH - contentY - 14);
    const gutter = 14;

    if (tallMode) {
      const listH = Math.min(520, Math.max(312, contentH * 0.42));
      const detailH = Math.max(330, contentH - listH - gutter);
      const cardColumns = contentW >= 820 ? 3 : 2;
      const cardHeight = 72;
      const cardRows = Math.max(2, Math.floor((listH - 102) / (cardHeight + 9)));
      return {
        viewport,
        rootX,
        rootY,
        rootW,
        rootH,
        headerX,
        headerY,
        headerW,
        headerH,
        filterX,
        filterY,
        filterW,
        filterH,
        listX: contentX,
        listY: contentY,
        listW: contentW,
        listH,
        detailX: contentX,
        detailY: contentY + listH + gutter,
        detailW: contentW,
        detailH,
        cardColumns,
        cardHeight,
        pageSize: cardColumns * cardRows,
      };
    }

    const listW = Math.min(458, Math.max(372, contentW * 0.42));
    const detailW = contentW - listW - gutter;
    const cardColumns = listW >= 420 ? 2 : 1;
    const cardHeight = 72;
    const cardRows = Math.max(3, Math.floor((contentH - 102) / (cardHeight + 9)));
    return {
      viewport,
      rootX,
      rootY,
      rootW,
      rootH,
      headerX,
      headerY,
      headerW,
      headerH,
      filterX,
      filterY,
      filterW,
      filterH,
      listX: contentX,
      listY: contentY,
      listW,
      listH: contentH,
      detailX: contentX + listW + gutter,
      detailY: contentY,
      detailW,
      detailH: contentH,
      cardColumns,
      cardHeight,
      pageSize: cardColumns * cardRows,
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
      .text(viewport.centerX, viewport.bottom - 42, message, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 14, right: 14, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.toastTimer = this.time.delayedCall(1900, () => this.clearToast());
  }

  private clearToast(): void {
    if (this.toastTimer) {
      this.toastTimer.remove(false);
      this.toastTimer = null;
    }
    this.toast?.destroy();
    this.toast = null;
  }

  private destroyShell(): void {
    for (const object of this.shellObjects) {
      object.destroy();
    }
    this.shellObjects = [];
  }
}

function filterTone(filter: PetDexFilter): 'blue' | 'gold' | 'plain' {
  if (filter === 'owned') return 'gold';
  if (filter === 'missing') return 'plain';
  return 'blue';
}

function wrapByChars(text: string, maxChars: number): string {
  const chars = [...text];
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += maxChars) {
    lines.push(chars.slice(i, i + maxChars).join(''));
  }
  return lines.join('\n');
}
