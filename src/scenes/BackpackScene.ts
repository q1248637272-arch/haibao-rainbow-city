import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { ITEMS } from '@/data/items';
import { PETS } from '@/data/pets';
import {
  backpackItemActionLabel,
  backpackItemUseHint,
  backpackItemUseKind,
  isBackpackUsableItem,
  useBackpackItemOnPet,
} from '@/systems/BackpackItemUse';
import { getEvolutionStage } from '@/systems/EvolutionSystem';
import { PlayerState } from '@/systems/PlayerState';
import { preloadBackpackAssets } from '@/systems/SceneAssetPreloader';
import { createAutoScrollText } from '@/ui/AutoScrollText';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';
import type { ItemDefinition, ItemKind, PlayerPet } from '@/types';

type BackpackTab = 'all' | ItemKind;

const TABS: readonly BackpackTab[] = [
  'all',
  'pokeball',
  'consumable',
  'enhance',
  'evolution',
  'material',
  'furniture',
];

const TAB_LABELS: Record<BackpackTab, string> = {
  all: '全部',
  pokeball: '精灵球',
  consumable: '药品',
  enhance: '强化',
  evolution: '进化',
  material: '材料',
  furniture: '家具',
  equipment: '装备',
  cosmetic: '装扮',
};

const CARD_W = 198;
const CARD_H = 122;
const GRID_COLS = 4;
const PAGE_SIZE = 12;
const GRID_TOP = 286;
const GRID_ROW_GAP = 126;
const BACKPACK_BACKGROUND_KEY = 'premium_backpack_workbench_image2';
const BACKPACK_BACKGROUND_SOURCE_WIDTH = 1672;
const BACKPACK_BACKGROUND_SOURCE_HEIGHT = 941;
const TARGETS_PER_PAGE = 5;

type OwnedPetEntry = {
  readonly pet: PlayerPet;
  readonly shelf: 'party' | 'storage';
};

export class BackpackScene extends Phaser.Scene {
  private fromScene: string = SceneKey.WORLD;
  private currentTab: BackpackTab = 'all';
  private page = 0;
  private content: Phaser.GameObjects.Container | null = null;
  private modal: Phaser.GameObjects.Container | null = null;
  private modalTargetPage = 0;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  public constructor() {
    super({ key: SceneKey.BACKPACK });
  }

  public init(data?: { readonly fromScene?: string }): void {
    this.fromScene = data?.fromScene ?? SceneKey.WORLD;
    this.currentTab = 'all';
    this.page = 0;
    this.modalTargetPage = 0;
  }

  public preload(): void {
    preloadBackpackAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.drawShell();
    this.refresh();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.content?.destroy();
      this.content = null;
      this.closeModal();
      this.clearToast();
    });
  }

  private drawShell(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xeaf9ff, 1).setOrigin(0).setScrollFactor(0);
    if (this.textures.exists(BACKPACK_BACKGROUND_KEY)) {
      createResponsiveMapBackground(this, BACKPACK_BACKGROUND_KEY, {
        stageAlpha: 0.86,
        coverAlpha: 0.86,
        stageWidth: BACKPACK_BACKGROUND_SOURCE_WIDTH,
        stageHeight: BACKPACK_BACKGROUND_SOURCE_HEIGHT,
      });
    } else if (this.textures.exists('legacy_library_clean')) {
      createResponsiveMapBackground(this, 'legacy_library_clean', {
        stageAlpha: 0.48,
        coverAlpha: 0.48,
      });
    }

    this.add
      .rectangle(0, 0, GAME_WIDTH, 96, 0x0b3768, 0.7)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(820);
    this.add
      .rectangle(40, 104, GAME_WIDTH - 80, 512, 0xffffff, 0.58)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(810)
      .setStrokeStyle(3, 0x43a9d8, 0.72);
    this.add
      .text(GAME_WIDTH / 2, 34, '彩虹背包工作台', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '34px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(900);

    createNavIconButton(this, {
      x: 72,
      y: 42,
      label: '返回',
      width: 76,
      onClick: () => this.scene.start(this.fromScene),
      depth: 920,
    });
    createNavIconButton(this, {
      x: 152,
      y: 42,
      label: '图鉴',
      width: 76,
      onClick: () => this.scene.start(SceneKey.PET_DEX, { fromScene: SceneKey.BACKPACK }),
      depth: 920,
    });
    createNavIconButton(this, {
      x: 232,
      y: 42,
      label: '存档',
      width: 76,
      onClick: () => this.scene.start(SceneKey.SAVE_SLOTS, { fromScene: SceneKey.BACKPACK }),
      depth: 920,
    });
  }

  private refresh(): void {
    this.content?.destroy();
    this.content = this.add.container(0, 0).setScrollFactor(0).setDepth(850);
    this.drawSummary();
    this.drawTabs();
    this.drawGrid();
  }

  private drawSummary(): void {
    const inventory = PlayerState.getInventory();
    const itemKinds = Object.values(inventory).filter((n) => n > 0).length;
    const totalItems = Object.values(inventory).reduce((sum, n) => sum + Math.max(0, n), 0);
    const panel = this.add.rectangle(64, 112, GAME_WIDTH - 128, 58, 0xffffff, 0.88);
    panel.setOrigin(0, 0);
    panel.setStrokeStyle(2, 0x43a9d8, 0.82);
    this.content?.add(panel);
    this.content?.add(
      this.add
        .text(
          88,
          124,
          `金币 ${PlayerState.getCoins()}   道具种类 ${itemKinds}   道具总数 ${totalItems}`,
          {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '20px',
            color: '#1b5f7c',
            stroke: '#ffffff',
            strokeThickness: 3,
            fontStyle: 'bold',
          },
        )
        .setOrigin(0, 0),
    );
    this.content?.add(
      this.add
        .text(88, 149, '点击药品、经验、潜能和进化道具，选择精灵后立即生效。', {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '14px',
          color: '#24536b',
        })
        .setOrigin(0, 0),
    );
  }

  private drawTabs(): void {
    const y = 204;
    const w = 106;
    const gap = 8;
    const total = TABS.length * w + (TABS.length - 1) * gap;
    const startX = (GAME_WIDTH - total) / 2 + w / 2;
    TABS.forEach((tab, index) => {
      const active = tab === this.currentTab;
      const btn = this.add
        .text(startX + index * (w + gap), y, TAB_LABELS[tab], {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 3,
          backgroundColor: active ? '#ff3b9a' : '#1b5f7c',
          padding: { left: 8, right: 8, top: 6, bottom: 6 },
          fixedWidth: w,
          align: 'center',
          fontStyle: active ? 'bold' : 'normal',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerup', () => {
        this.currentTab = tab;
        this.page = 0;
        this.closeModal();
        this.refresh();
      });
      this.content?.add(btn);
    });
  }

  private drawGrid(): void {
    const items = this.filteredItems();
    if (items.length === 0) {
      this.content?.add(
        this.add
          .text(GAME_WIDTH / 2, 368, '这个分类里还没有道具', {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '22px',
            color: '#1b5f7c',
            stroke: '#ffffff',
            strokeThickness: 4,
          })
          .setOrigin(0.5),
      );
      return;
    }

    const maxPage = Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1);
    this.page = Phaser.Math.Clamp(this.page, 0, maxPage);
    const visible = items.slice(this.page * PAGE_SIZE, this.page * PAGE_SIZE + PAGE_SIZE);
    const totalW = GRID_COLS * CARD_W + (GRID_COLS - 1) * 14;
    const startX = (GAME_WIDTH - totalW) / 2 + CARD_W / 2;
    visible.forEach((entry, index) => {
      const col = index % GRID_COLS;
      const row = Math.floor(index / GRID_COLS);
      this.content?.add(
        this.createItemCard(entry, startX + col * (CARD_W + 14), GRID_TOP + row * GRID_ROW_GAP),
      );
    });
    this.drawPager(maxPage);
  }

  private filteredItems(): Array<{ readonly def: ItemDefinition; readonly count: number }> {
    const inventory = PlayerState.getInventory();
    return Object.entries(inventory)
      .map(([id, count]) => {
        const def = ITEMS[id];
        if (!def || count <= 0) return null;
        return { def, count };
      })
      .filter((entry): entry is { readonly def: ItemDefinition; readonly count: number } => {
        if (!entry) return false;
        return this.currentTab === 'all' || entry.def.kind === this.currentTab;
      })
      .sort((a, b) => a.def.kind.localeCompare(b.def.kind) || a.def.id.localeCompare(b.def.id));
  }

  private createItemCard(
    entry: { readonly def: ItemDefinition; readonly count: number },
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const card = this.add.container(x, y);
    const usable = isBackpackUsableItem(entry.def);
    const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x1b1b3a, usable ? 0.88 : 0.76);
    bg.setStrokeStyle(2, usable ? 0xffd93d : 0x43a9d8, 0.92);
    card.add(bg);

    const iconKey = `item_${entry.def.id}`;
    if (this.textures.exists(iconKey)) {
      card.add(this.add.image(-CARD_W / 2 + 34, -30, iconKey).setDisplaySize(54, 54));
    } else {
      const fallback = this.add.rectangle(-CARD_W / 2 + 34, -30, 44, 44, entry.def.iconColor, 1);
      fallback.setStrokeStyle(2, 0xffffff, 0.78);
      card.add(fallback);
    }

    createAutoScrollText({
      scene: this,
      layer: card,
      x: -CARD_W / 2 + 70,
      y: -50,
      width: CARD_W - 84,
      height: 24,
      text: entry.def.name,
      style: {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#ffd93d',
        stroke: '#1b1b3a',
        strokeThickness: 3,
      },
    });

    card.add(
      this.add
        .text(-CARD_W / 2 + 70, -20, TAB_LABELS[entry.def.kind] ?? entry.def.kind, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '12px',
          color: '#aaccff',
        })
        .setOrigin(0, 0.5),
    );
    card.add(
      this.add
        .text(CARD_W / 2 - 14, -50, `x${entry.count}`, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '17px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 3,
          fontStyle: 'bold',
        })
        .setOrigin(1, 0),
    );
    card.add(
      this.add
        .text(-CARD_W / 2 + 14, 4, entry.def.description, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '12px',
          color: '#ffffff',
          wordWrap: { width: CARD_W - 28, useAdvancedWrap: true },
          maxLines: 2,
        })
        .setOrigin(0, 0),
    );

    const actionLabel = backpackItemActionLabel(entry.def);
    const pillColor = usable ? 0xff3b9a : 0x1b6fa8;
    const pill = this.add.rectangle(CARD_W / 2 - 46, CARD_H / 2 - 18, 78, 22, pillColor, 0.94);
    pill.setStrokeStyle(1, 0xffffff, 0.62);
    card.add(pill);
    card.add(
      this.add
        .text(CARD_W / 2 - 46, CARD_H / 2 - 18, actionLabel, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: actionLabel.length > 4 ? '11px' : '13px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    card.setInteractive(
      new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H),
      Phaser.Geom.Rectangle.Contains,
    );
    card.on('pointerover', () => {
      bg.setStrokeStyle(3, 0xfff4a8, 1);
      card.setScale(1.025);
    });
    card.on('pointerout', () => {
      bg.setStrokeStyle(2, usable ? 0xffd93d : 0x43a9d8, 0.92);
      card.setScale(1);
    });
    card.on('pointerup', () => this.handleItemCardClick(entry.def));
    return card;
  }

  private handleItemCardClick(item: ItemDefinition): void {
    if (!isBackpackUsableItem(item)) {
      this.showToast(backpackItemUseHint(item), false);
      return;
    }
    this.openItemModal(item);
  }

  private drawPager(maxPage: number): void {
    if (maxPage <= 0) return;
    this.createPageButton(386, 618, '上一页', this.page <= 0, () => {
      this.page = Math.max(0, this.page - 1);
      this.refresh();
    });
    this.content?.add(
      this.add
        .text(GAME_WIDTH / 2, 618, `${this.page + 1}/${maxPage + 1}`, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#1b5f7c',
          stroke: '#ffffff',
          strokeThickness: 3,
        })
        .setOrigin(0.5),
    );
    this.createPageButton(574, 618, '下一页', this.page >= maxPage, () => {
      this.page = Math.min(maxPage, this.page + 1);
      this.refresh();
    });
  }

  private createPageButton(
    x: number,
    y: number,
    label: string,
    disabled: boolean,
    onClick: () => void,
  ): void {
    const btn = this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#1b6fa8',
        strokeThickness: 3,
        backgroundColor: disabled ? '#8aa4b4' : '#ff8f2f',
        padding: { left: 14, right: 14, top: 6, bottom: 6 },
        fixedWidth: 104,
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(disabled ? 0.64 : 1);
    this.content?.add(btn);
    if (disabled) return;
    btn.setInteractive({ useHandCursor: true }).on('pointerup', onClick);
  }

  private openItemModal(item: ItemDefinition): void {
    this.modalTargetPage = 0;
    this.renderItemModal(item);
  }

  private renderItemModal(item: ItemDefinition): void {
    this.closeModal();

    const modal = this.add.container(0, 0).setScrollFactor(0).setDepth(1300);
    const shade = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x04172c, 0.62)
      .setOrigin(0)
      .setInteractive();
    shade.on('pointerup', () => this.closeModal());
    modal.add(shade);

    const panelW = 742;
    const panelH = 504;
    const panelX = GAME_WIDTH / 2;
    const panelY = 332;
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0xf4fbff, 0.96);
    panel.setStrokeStyle(4, 0x43a9d8, 0.95);
    modal.add(panel);
    modal.add(
      this.add
        .text(panelX, 98, item.name, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '28px',
          color: '#ff3b9a',
          stroke: '#ffffff',
          strokeThickness: 5,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    modal.add(
      this.add
        .text(panelX, 132, `${backpackItemActionLabel(item)}  ·  持有 x${PlayerState.getItemCount(item.id)}`, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#1b5f7c',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    modal.add(
      this.add
        .text(panelX, 160, item.description, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '14px',
          color: '#24536b',
          align: 'center',
          wordWrap: { width: panelW - 88, useAdvancedWrap: true },
          maxLines: 2,
        })
        .setOrigin(0.5, 0),
    );
    modal.add(
      this.add
        .text(126, 214, '选择目标精灵', {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '20px',
          color: '#1b3768',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );

    const targets = this.ownedPets();
    if (targets.length === 0) {
      modal.add(
        this.add
          .text(panelX, 360, '还没有可使用道具的精灵。', {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '18px',
            color: '#1b5f7c',
          })
          .setOrigin(0.5),
      );
    } else {
      const maxPage = Math.max(0, Math.ceil(targets.length / TARGETS_PER_PAGE) - 1);
      this.modalTargetPage = Phaser.Math.Clamp(this.modalTargetPage, 0, maxPage);
      const visible = targets.slice(
        this.modalTargetPage * TARGETS_PER_PAGE,
        this.modalTargetPage * TARGETS_PER_PAGE + TARGETS_PER_PAGE,
      );
      visible.forEach((entry, index) => {
        modal.add(this.createTargetRow(item, entry, 126, 244 + index * 68, panelW - 112));
      });
      if (maxPage > 0) {
        modal.add(
          this.createModalButton(374, 566, '上一页', this.modalTargetPage <= 0, () => {
            this.modalTargetPage = Math.max(0, this.modalTargetPage - 1);
            this.renderItemModal(item);
          }),
        );
        modal.add(
          this.add
            .text(panelX, 566, `${this.modalTargetPage + 1}/${maxPage + 1}`, {
              fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
              fontSize: '15px',
              color: '#1b5f7c',
              stroke: '#ffffff',
              strokeThickness: 3,
            })
            .setOrigin(0.5),
        );
        modal.add(
          this.createModalButton(586, 566, '下一页', this.modalTargetPage >= maxPage, () => {
            this.modalTargetPage = Math.min(maxPage, this.modalTargetPage + 1);
            this.renderItemModal(item);
          }),
        );
      }
    }

    modal.add(this.createModalButton(808, 98, '关闭', false, () => this.closeModal()));
    this.modal = modal;
  }

  private createTargetRow(
    item: ItemDefinition,
    entry: OwnedPetEntry,
    x: number,
    y: number,
    width: number,
  ): Phaser.GameObjects.Container {
    const pet = entry.pet;
    const petData = PETS[pet.petId];
    const row = this.add.container(0, 0);
    const rowBg = this.add.rectangle(x, y, width, 58, 0x1b1b3a, 0.84).setOrigin(0, 0);
    rowBg.setStrokeStyle(2, pet.currentHp <= 0 ? 0xff8f8f : 0x43a9d8, 0.8);
    row.add(rowBg);

    const portraitColor = petData?.portraitColor ?? 0xffd93d;
    const avatar = this.add.circle(x + 31, y + 29, 19, portraitColor, 1);
    avatar.setStrokeStyle(2, 0xffffff, 0.8);
    row.add(avatar);

    const name = petData?.name ?? pet.petId;
    row.add(
      this.add
        .text(x + 58, y + 9, `${name}  Lv.${pet.level}`, {
          fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
          fontSize: '17px',
          color: '#fff4a8',
          stroke: '#1b1b3a',
          strokeThickness: 3,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0),
    );
    row.add(
      this.add
        .text(x + 58, y + 34, this.targetStatusText(item, entry), {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '13px',
          color: '#d9f4ff',
        })
        .setOrigin(0, 0),
    );

    const action = backpackItemUseKind(item) === 'evolve' ? '进化' : '使用';
    row.add(this.createModalButton(x + width - 64, y + 29, action, false, () => {
      this.applyItemToPet(item, pet);
    }));
    return row;
  }

  private targetStatusText(item: ItemDefinition, entry: OwnedPetEntry): string {
    const pet = entry.pet;
    const shelfLabel = entry.shelf === 'party' ? '队伍' : '仓库';
    const hpText = `HP ${pet.currentHp}/${pet.currentStats.hp}`;
    switch (backpackItemUseKind(item)) {
      case 'evolve':
        return `${shelfLabel} · ${hpText} · 阶段 ${getEvolutionStage(pet)}`;
      case 'exp':
        return `${shelfLabel} · ${hpText} · 当前经验 ${pet.exp}`;
      case 'potential':
        return `${shelfLabel} · ${hpText} · 潜能训练`;
      default:
        return `${shelfLabel} · ${hpText}`;
    }
  }

  private applyItemToPet(item: ItemDefinition, pet: PlayerPet): void {
    const result = useBackpackItemOnPet(item.id, this.petKey(pet));
    this.showToast(result.message, result.ok);
    if (!result.ok) return;
    this.closeModal();
    this.refresh();
  }

  private ownedPets(): OwnedPetEntry[] {
    const save = PlayerState.snapshot();
    return [
      ...save.playerPets.map((pet) => ({ pet, shelf: 'party' as const })),
      ...save.petStorage.map((pet) => ({ pet, shelf: 'storage' as const })),
    ];
  }

  private petKey(pet: PlayerPet): string {
    return pet.instanceId ?? pet.petId;
  }

  private createModalButton(
    x: number,
    y: number,
    label: string,
    disabled: boolean,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const btn = this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        backgroundColor: disabled ? '#8aa4b4' : '#ff3b9a',
        padding: { left: 14, right: 14, top: 7, bottom: 7 },
        fixedWidth: 92,
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(disabled ? 0.62 : 1);
    if (!disabled) {
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerup', onClick);
      btn.on('pointerover', () => btn.setColor('#fff4a8'));
      btn.on('pointerout', () => btn.setColor('#ffffff'));
    }
    return btn;
  }

  private closeModal(): void {
    this.modal?.destroy();
    this.modal = null;
  }

  private showToast(message: string, ok: boolean): void {
    this.clearToast();
    this.toast = this.add
      .text(GAME_WIDTH / 2, 604, message, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        backgroundColor: ok ? '#117a52' : '#9b3b50',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        align: 'center',
        wordWrap: { width: 760, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1600);
    this.toastTimer = this.time.delayedCall(2400, () => this.clearToast());
  }

  private clearToast(): void {
    this.toastTimer?.remove(false);
    this.toastTimer = null;
    this.toast?.destroy();
    this.toast = null;
  }
}
