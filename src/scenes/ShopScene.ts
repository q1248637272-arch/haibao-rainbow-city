import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import {
  ITEMS,
  SHOP_TAB_LABELS,
  type ShopTab,
  isShopAvailableItem,
  shopCatalogItems,
  shopItemsByKind,
  shopVipOnlyItems,
} from '@/data/items';
import { AudioManager } from '@/systems/AudioManager';
import { DailyQuest } from '@/systems/DailyQuest';
import { gameEvents } from '@/systems/EventBus';
import { PlayerState } from '@/systems/PlayerState';
import { preloadShopAssets } from '@/systems/SceneAssetPreloader';
import { ShopSystem, type PurchaseDeniedReason } from '@/systems/ShopSystem';
import { makeHud, type HudHandle } from '@/ui/Hud';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';
import type { ItemDefinition, PurchaseQuantity } from '@/types';

import type { LegacyLocationId } from './LegacyContent';

/**
 * 彩虹城商店场景（FEAT-304）。
 *
 * 特点：
 * - 7 个 Tab：精灵球 / 恢复药品 / 强化道具 / 进化道具 / 家具装扮 / 限时商品 / VIP 专属。
 * - 限时 Tab 读 `PlayerState.getDailyContext().shopDiscountIds` 展示今日 × 0.7 打折品；
 * - VIP 专属 Tab 聚合 `ITEMS` 中所有 `vipOnly === true` 的商品。非 VIP 玩家依然能看到，
 *   只是购买按钮会被禁用并显示"VIP 专属"。
 * - 商品卡片显示：名称 / 效果简述 / 原价 + 折后价 / 当前持有数。
 * - 点击商品卡片弹出购买弹窗：1 / 10 / max 三个数量按钮 + 总价 + 购买后剩余金币。
 * - 购买流程：ShopSystem.applyPurchase → PlayerState.addCoins(-total) + addItem(id, qty) →
 *   emit `shop:purchase`。
 *
 * 设计原因：场景内所有状态都由 currentTab + activeModal 两个字段描述。Tab 切换与弹窗
 * 开关都走"销毁旧容器 → 重建新容器"的朴素路径，不做差量更新。
 * 7 Tab 的商品数量级不大（全表 < 50），这样更容易维护且 UI 行为一致。
 */

const TITLE_COLOR = '#ff3b9a';
const SUBTITLE_COLOR = '#ffffff';
const CARD_BG = 0x1b1b3a;
const CARD_BG_ALPHA = 0.82;
const CARD_BORDER = 0xff3b9a;
const CARD_BORDER_HOVER = 0xffd93d;

const TAB_IDLE_BG = '#1b1b3a';
const TAB_ACTIVE_BG = '#ff3b9a';
const TAB_LABEL_COLOR = '#ffffff';

const BUTTON_STROKE = '#1b6fa8';
const BUTTON_BG = '#ff3b9a';

const TAB_ORDER: ShopTab[] = [
  'pokeball',
  'consumable',
  'enhance',
  'evolution',
  'furniture',
  'limited',
  'vip',
];

const CARD_WIDTH = 180;
const CARD_HEIGHT = 118;
const CARD_GAP_X = 16;
const CARD_GAP_Y = 12;
const GRID_COLS = 4;
const GRID_TOP = 268;
const PAGE_SIZE = 12;
const LIMITED_OFFER_COUNT = 6;
const LIMITED_REFRESH_LABEL = '每日 08:00 刷新｜今日限时商品随机 1-9 折';
const SHOP_BACKGROUND_KEY = 'premium_rainbow_supply_shop_image2';
const SHOP_BACKGROUND_SOURCE_WIDTH = 1672;
const SHOP_BACKGROUND_SOURCE_HEIGHT = 941;

const LIMITED_SPECIAL_PRICES: Readonly<Record<string, number>> = {
  crystal_shard: 220,
  energy_seed: 180,
  angel_chest: 900,
  repair_chip: 260,
  gold_shell: 300,
};

export class ShopScene extends Phaser.Scene {
  private currentTab: ShopTab = 'pokeball';
  private tabButtons: Map<ShopTab, Phaser.GameObjects.Text> = new Map();
  private grid: Phaser.GameObjects.Container | null = null;
  private hud: HudHandle | null = null;
  private modal: Phaser.GameObjects.Container | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private page = 0;
  private fromScene: string = SceneKey.WORLD;
  private returnLocationId: LegacyLocationId | null = null;

  public constructor() {
    super({ key: SceneKey.SHOP });
  }

  public init(data?: {
    readonly fromScene?: string;
    readonly returnLocationId?: LegacyLocationId;
  }): void {
    this.fromScene = data?.fromScene ?? SceneKey.WORLD;
    this.returnLocationId = data?.returnLocationId ?? null;
  }

  public preload(): void {
    preloadShopAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.currentTab = 'pokeball';
    this.tabButtons = new Map();
    this.page = 0;

    this.drawBackdrop();
    this.drawHeader();
    this.drawTabBar();
    this.drawBackButton();
    this.refreshLimitedOffersIfNeeded();
    this.rebuildGrid();

    this.hud = makeHud(this, 'topright');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud?.destroy();
      this.hud = null;
      this.destroyGrid();
      this.closeModal();
      this.clearToast();
    });

    AudioManager.play('shop', undefined, this);
  }

  // ---- 顶部 / Tab 栏 / 返回 ----------------------------------------------

  private drawBackdrop(): void {
    if (this.textures.exists(SHOP_BACKGROUND_KEY)) {
      createResponsiveMapBackground(this, SHOP_BACKGROUND_KEY, {
        stageAlpha: 0.82,
        coverAlpha: 0.82,
        stageWidth: SHOP_BACKGROUND_SOURCE_WIDTH,
        stageHeight: SHOP_BACKGROUND_SOURCE_HEIGHT,
      });
    } else if (this.textures.exists('legacy_lab_clean')) {
      createResponsiveMapBackground(this, 'legacy_lab_clean', {
        stageAlpha: 0.68,
        coverAlpha: 0.68,
      });
    } else {
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR).setOrigin(0);
    }
    this.add.rectangle(0, 0, GAME_WIDTH, 100, 0x063b64, 0.62).setOrigin(0).setScrollFactor(0);
    this.add
      .rectangle(0, 100, GAME_WIDTH, GAME_HEIGHT - 100, 0xeaf9ff, 0.2)
      .setOrigin(0)
      .setScrollFactor(0);
    this.add
      .rectangle(28, 154, GAME_WIDTH - 56, 446, 0xffffff, 0.68)
      .setOrigin(0)
      .setScrollFactor(0)
      .setStrokeStyle(3, 0x43a9d8, 0.82);
  }

  private drawHeader(): void {
    this.add
      .text(GAME_WIDTH / 2, 16, '彩虹补给站', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '36px',
        color: TITLE_COLOR,
        stroke: '#ffffff',
        strokeThickness: 6,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(900);

    this.add
      .text(GAME_WIDTH / 2, 62, '药品、精灵球、进化石和家园装扮都在这里补齐', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: SUBTITLE_COLOR,
        stroke: '#1b6fa8',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(900);
  }

  private drawTabBar(): void {
    const y = 118;
    const tabWidth = 120;
    const gap = 8;
    const totalWidth = TAB_ORDER.length * tabWidth + (TAB_ORDER.length - 1) * gap;
    const startX = (GAME_WIDTH - totalWidth) / 2 + tabWidth / 2;

    TAB_ORDER.forEach((tab, idx) => {
      const x = startX + idx * (tabWidth + gap);
      const isActive = tab === this.currentTab;
      const btn = this.add
        .text(x, y, SHOP_TAB_LABELS[tab], {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '18px',
          color: TAB_LABEL_COLOR,
          stroke: '#1b1b3a',
          strokeThickness: 3,
          backgroundColor: isActive ? TAB_ACTIVE_BG : TAB_IDLE_BG,
          padding: { left: 10, right: 10, top: 6, bottom: 6 },
          fixedWidth: tabWidth,
          align: 'center',
          fontStyle: isActive ? 'bold' : 'normal',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(900)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerup', () => this.selectTab(tab));
      btn.on('pointerover', () => {
        if (this.currentTab !== tab) btn.setColor('#ffd93d');
      });
      btn.on('pointerout', () => btn.setColor(TAB_LABEL_COLOR));

      this.tabButtons.set(tab, btn);
    });
  }

  private drawBackButton(): void {
    const btn = this.add
      .text(40, 40, '← 返回彩虹城', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        backgroundColor: '#00000066',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerup', () => this.returnToPreviousScene());
    btn.on('pointerover', () => btn.setColor('#ffd93d'));
    btn.on('pointerout', () => btn.setColor('#ffffff'));
  }

  private returnToPreviousScene(): void {
    if (this.fromScene === SceneKey.LEGACY_LOCATION && this.returnLocationId) {
      this.scene.start(SceneKey.LEGACY_LOCATION, { locationId: this.returnLocationId });
      return;
    }
    this.scene.start(SceneKey.WORLD);
  }

  private selectTab(tab: ShopTab): void {
    if (this.currentTab === tab) return;
    this.currentTab = tab;
    this.page = 0;
    for (const [t, btn] of this.tabButtons) {
      const isActive = t === tab;
      btn.setBackgroundColor(isActive ? TAB_ACTIVE_BG : TAB_IDLE_BG);
      btn.setFontStyle(isActive ? 'bold' : 'normal');
    }
    this.closeModal();
    this.rebuildGrid();
  }

  // ---- Grid 渲染 ---------------------------------------------------------

  private refreshLimitedOffersIfNeeded(): void {
    const today = DailyQuest.todayUtcDateString(new Date());
    const ctx = PlayerState.getDailyContext();
    if (ctx.shopDiscountDate === today && ctx.shopDiscountIds.length > 0) {
      return;
    }

    PlayerState.setDailyContext({
      lastRolledDate: ctx.lastRolledDate,
      shopDiscountIds: ShopSystem.pickDailyDiscounts(
        shopCatalogItems(),
        `limited-shop:${today}`,
        LIMITED_OFFER_COUNT,
      ),
      shopDiscountDate: today,
      dailyQuestIds: ctx.dailyQuestIds,
    });
  }

  private currentDiscountSeed(): string {
    return (
      PlayerState.getDailyContext().shopDiscountDate ?? DailyQuest.todayUtcDateString(new Date())
    );
  }

  /**
   * 依 currentTab 从数据源拉取商品列表。
   *
   * - `pokeball` / `consumable` / `enhance` / `evolution` / `furniture`：按 kind 过滤；
   * - `limited`：读 dailyContext.shopDiscountIds，按顺序映射到 ITEMS；
   * - `vip`：全表筛 vipOnly === true。
   */
  private currentItems(): ItemDefinition[] {
    switch (this.currentTab) {
      case 'pokeball':
        return shopItemsByKind('pokeball');
      case 'consumable':
        return shopItemsByKind('consumable');
      case 'enhance':
        return shopItemsByKind('enhance');
      case 'evolution':
        return shopItemsByKind('evolution');
      case 'furniture':
        return shopItemsByKind('furniture');
      case 'limited': {
        const ids = PlayerState.getDailyContext().shopDiscountIds;
        const out: ItemDefinition[] = [];
        for (const id of ids) {
          const def = ITEMS[id];
          if (def && isShopAvailableItem(def)) out.push(toLimitedShopItem(def));
        }
        return out;
      }
      case 'vip':
        return shopVipOnlyItems();
    }
  }

  private destroyGrid(): void {
    if (this.grid) {
      this.grid.destroy();
      this.grid = null;
    }
  }

  private rebuildGrid(): void {
    this.destroyGrid();
    const items = this.currentItems();
    const dailyCtx = PlayerState.getDailyContext();
    const dailyIds = dailyCtx.shopDiscountIds;
    const discountSeed = this.currentDiscountSeed();
    const isVip = PlayerState.isVip();

    const group = this.add.container(0, 0);
    group.setScrollFactor(0);
    group.setDepth(800);
    this.grid = group;

    const title = this.add
      .text(50, 154, `${SHOP_TAB_LABELS[this.currentTab]}  ${items.length} 件`, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#1b5f7c',
        stroke: '#ffffff',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5);
    group.add(title);
    this.drawShelfInfo(group, items, dailyIds, isVip, discountSeed);

    if (items.length === 0) {
      const empty = this.add
        .text(GAME_WIDTH / 2, GRID_TOP + 40, this.emptyMessage(), {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '20px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 4,
          backgroundColor: '#00000055',
          padding: { left: 14, right: 14, top: 8, bottom: 8 },
          align: 'center',
        })
        .setOrigin(0.5, 0);
      group.add(empty);
      return;
    }

    const maxPage = Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1);
    this.page = Phaser.Math.Clamp(this.page, 0, maxPage);
    const pageItems = items.slice(this.page * PAGE_SIZE, this.page * PAGE_SIZE + PAGE_SIZE);

    const totalWidth = GRID_COLS * CARD_WIDTH + (GRID_COLS - 1) * CARD_GAP_X;
    const startX = (GAME_WIDTH - totalWidth) / 2 + CARD_WIDTH / 2;

    pageItems.forEach((item, idx) => {
      const col = idx % GRID_COLS;
      const row = Math.floor(idx / GRID_COLS);
      const cx = startX + col * (CARD_WIDTH + CARD_GAP_X);
      const cy = GRID_TOP + row * (CARD_HEIGHT + CARD_GAP_Y);
      const card = this.createCard(item, cx, cy, dailyIds, isVip, discountSeed);
      group.add(card);
    });

    this.drawPager(group, maxPage);
  }

  private drawShelfInfo(
    group: Phaser.GameObjects.Container,
    items: readonly ItemDefinition[],
    dailyIds: readonly string[],
    isVip: boolean,
    discountSeed: string,
  ): void {
    const y = 184;
    const strip = this.add
      .rectangle(50, y, 678, 38, 0x07335d, 0.68)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0x7ad8ff, 0.72);
    group.add(strip);

    const text = this.add
      .text(68, y, this.shelfInfoText(items, dailyIds, isVip, discountSeed), {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#07335d',
        strokeThickness: 3,
        wordWrap: { width: 636, useAdvancedWrap: true },
        maxLines: 2,
      })
      .setOrigin(0, 0.5);
    group.add(text);

    if (this.currentTab !== 'vip' || isVip) return;
    const btn = this.add
      .text(790, y, '去签到', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#1b1b3a',
        backgroundColor: '#ffd93d',
        padding: { left: 18, right: 18, top: 8, bottom: 8 },
        fixedWidth: 110,
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn
      .on('pointerover', () => btn.setBackgroundColor('#fff4a8'))
      .on('pointerout', () => btn.setBackgroundColor('#ffd93d'))
      .on('pointerup', () => this.scene.start(SceneKey.VIP_PANEL));
    group.add(btn);
  }

  private shelfInfoText(
    items: readonly ItemDefinition[],
    dailyIds: readonly string[],
    isVip: boolean,
    discountSeed: string,
  ): string {
    switch (this.currentTab) {
      case 'limited':
        return `${LIMITED_REFRESH_LABEL}。本页 ${items.length} 件，最低 ${this.bestDiscountLabel(dailyIds, discountSeed)}，VIP 普通商品折扣可叠加。`;
      case 'vip': {
        if (isVip) {
          return 'VIP 货架已开放：大师球、复活药和专属家具可直接购买，核心福利保持原价。';
        }
        const streak = PlayerState.getVipSnapshot().checkinStreak;
        const remaining = Math.max(0, 3 - streak);
        const unlockText = remaining <= 0 ? '今天签到即可解锁购买' : `再签到 ${remaining} 天可购买`;
        return `VIP 货架可预览：大师球、复活药和专属家具已上架。当前连续签到 ${streak}/3，${unlockText}。`;
      }
      default:
        return isVip
          ? 'VIP 身份已生效：普通商品自动 9 折，今日限时折扣还会继续叠加。'
          : '点击商品可批量购买；连续签到第 3 天后会解锁 VIP 折扣和专属货架。';
    }
  }

  private bestDiscountLabel(dailyIds: readonly string[], discountSeed: string): string {
    if (dailyIds.length <= 0) return '暂无折扣';
    const best = dailyIds.reduce((lowest, id) => {
      const mult = ShopSystem.dailyDiscountMultiplier(id, discountSeed);
      return Math.min(lowest, mult);
    }, 1);
    return `${Math.round(best * 10)} 折`;
  }

  private drawPager(group: Phaser.GameObjects.Container, maxPage: number): void {
    if (maxPage <= 0) return;
    this.createPageButton(group, 382, 612, '上一页', this.page <= 0, () => {
      this.page = Math.max(0, this.page - 1);
      this.rebuildGrid();
    });
    group.add(
      this.add
        .text(GAME_WIDTH / 2, 612, `${this.page + 1}/${maxPage + 1}`, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#1b5f7c',
          stroke: '#ffffff',
          strokeThickness: 3,
        })
        .setOrigin(0.5),
    );
    this.createPageButton(group, 578, 612, '下一页', this.page >= maxPage, () => {
      this.page = Math.min(maxPage, this.page + 1);
      this.rebuildGrid();
    });
  }

  private createPageButton(
    group: Phaser.GameObjects.Container,
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
        padding: { left: 16, right: 16, top: 6, bottom: 6 },
        fixedWidth: 104,
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(disabled ? 0.64 : 1);
    group.add(btn);
    if (disabled) return;
    btn
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => btn.setColor('#fff4a8'))
      .on('pointerout', () => btn.setColor('#ffffff'))
      .on('pointerup', onClick);
  }

  private emptyMessage(): string {
    switch (this.currentTab) {
      case 'limited':
        return `${LIMITED_REFRESH_LABEL}\n正在刷新今日限时商品，请重新打开补给站试试。`;
      case 'vip':
        return 'VIP 货架正在读取商品资料，请重新打开补给站试试。';
      default:
        return '该分类暂无商品。';
    }
  }

  private createCard(
    item: ItemDefinition,
    cx: number,
    cy: number,
    dailyIds: readonly string[],
    isVip: boolean,
    discountSeed: string,
  ): Phaser.GameObjects.Container {
    const card = this.add.container(cx, cy);

    const bg = this.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_BG, CARD_BG_ALPHA);
    bg.setStrokeStyle(2, CARD_BORDER);
    bg.setOrigin(0.5);
    card.add(bg);

    // image2 商品图标；缺图时保留纯色兜底，避免补给站因为单个资源缺失无法打开。
    const iconSize = 36;
    const iconX = -CARD_WIDTH / 2 + 12 + iconSize / 2;
    const iconY = -CARD_HEIGHT / 2 + 12 + iconSize / 2;
    const iconTextureKey = `item_${item.id}`;
    if (this.textures.exists(iconTextureKey)) {
      const icon = this.add.image(iconX, iconY, iconTextureKey).setDisplaySize(46, 46);
      card.add(icon);
    } else {
      const icon = this.add.rectangle(iconX, iconY, iconSize, iconSize, item.iconColor, 1);
      icon.setStrokeStyle(2, 0xffffff, 0.75);
      icon.setOrigin(0.5);
      card.add(icon);
    }

    // 名称
    const nameText = this.add
      .text(iconX + iconSize / 2 + 10, iconY - iconSize / 2, item.name, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
        fixedWidth: CARD_WIDTH - 76,
      })
      .setOrigin(0, 0);
    card.add(nameText);

    // VIP 标签
    if (item.vipOnly === true) {
      const vipTag = this.add
        .text(CARD_WIDTH / 2 - 8, -CARD_HEIGHT / 2 + 8, 'VIP', {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '12px',
          color: '#1b1b3a',
          backgroundColor: '#ffd93d',
          padding: { left: 4, right: 4, top: 1, bottom: 1 },
          fontStyle: 'bold',
        })
        .setOrigin(1, 0);
      card.add(vipTag);
    }

    if (dailyIds.includes(item.id) && item.vipOnly !== true) {
      const discountTag = this.add
        .text(
          CARD_WIDTH / 2 - 8,
          -CARD_HEIGHT / 2 + 30,
          ShopSystem.dailyDiscountLabel(item.id, discountSeed),
          {
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            fontSize: '12px',
            color: '#5b2600',
            backgroundColor: '#fff0a8',
            padding: { left: 5, right: 5, top: 1, bottom: 1 },
            fontStyle: 'bold',
          },
        )
        .setOrigin(1, 0);
      card.add(discountTag);
    }

    // 效果简述
    const desc = this.add
      .text(-CARD_WIDTH / 2 + 10, -CARD_HEIGHT / 2 + 52, item.description, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: '#dcdcff',
        wordWrap: { width: CARD_WIDTH - 20, useAdvancedWrap: true },
        maxLines: 2,
      })
      .setOrigin(0, 0);
    card.add(desc);

    // 价格（可能带折扣：原价划线，新价金色）
    const { unit } = ShopSystem.priceForQuantity(item, 1, dailyIds, isVip, discountSeed);
    const discounted = unit < item.price;
    const priceY = CARD_HEIGHT / 2 - 34;
    if (discounted) {
      const oldPriceText = this.add
        .text(-CARD_WIDTH / 2 + 10, priceY, `原价 ${item.price}`, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '11px',
          color: '#999999',
        })
        .setOrigin(0, 0);
      card.add(oldPriceText);

      // 简单的删除线：在文字中部覆盖一条横线。
      const strike = this.add.rectangle(
        oldPriceText.x + oldPriceText.width / 2,
        oldPriceText.y + oldPriceText.height / 2,
        oldPriceText.width,
        1,
        0x999999,
        1,
      );
      strike.setOrigin(0.5);
      card.add(strike);

      const newPriceText = this.add
        .text(-CARD_WIDTH / 2 + 10, priceY + 14, `${unit} 彩虹币`, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '14px',
          color: '#ffd93d',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0);
      card.add(newPriceText);
    } else {
      const priceText = this.add
        .text(-CARD_WIDTH / 2 + 10, priceY + 14, `${unit} 彩虹币`, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '14px',
          color: '#ffd93d',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0);
      card.add(priceText);
    }

    // 拥有数
    const haveText = this.add
      .text(
        CARD_WIDTH / 2 - 10,
        CARD_HEIGHT / 2 - 10,
        `拥有 ${PlayerState.getItemCount(item.id)}`,
        {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '12px',
          color: '#aaccff',
        },
      )
      .setOrigin(1, 1);
    card.add(haveText);

    const status = this.purchaseStatusFor(item, dailyIds, isVip, discountSeed);
    const statusText = this.add
      .text(CARD_WIDTH / 2 - 10, CARD_HEIGHT / 2 - 34, status.label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '11px',
        color: status.color,
        backgroundColor: status.backgroundColor,
        padding: { left: 6, right: 6, top: 2, bottom: 2 },
        fixedWidth: 66,
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    card.add(statusText);

    // 整卡片交互：点击 → 打开购买弹窗（vip_only 非 vip → toast）。
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setStrokeStyle(3, CARD_BORDER_HOVER));
    bg.on('pointerout', () => bg.setStrokeStyle(2, CARD_BORDER));
    bg.on('pointerup', () => {
      if (item.vipOnly === true && !isVip) {
        this.showToast('此商品仅限 VIP 购买，连续签到第 3 天可解锁。');
        return;
      }
      this.openPurchaseModal(item);
    });

    return card;
  }

  private purchaseStatusFor(
    item: ItemDefinition,
    dailyIds: readonly string[],
    isVip: boolean,
    discountSeed: string,
  ): { readonly label: string; readonly color: string; readonly backgroundColor: string } {
    const check = ShopSystem.canPurchase({
      item,
      qty: 1,
      coins: PlayerState.getCoins(),
      isVip,
      dailyDiscountIds: dailyIds,
      dailyDiscountSeed: discountSeed,
    });
    if (check.ok) {
      return {
        label: item.vipOnly ? 'VIP 可购' : '可购买',
        color: '#ffffff',
        backgroundColor: '#1e7a5a',
      };
    }
    if (check.reason === 'vip_locked') {
      return { label: '签到解锁', color: '#1b1b3a', backgroundColor: '#ffd93d' };
    }
    if (check.reason === 'coins_low') {
      return { label: '金币不足', color: '#ffffff', backgroundColor: '#9b4d42' };
    }
    return { label: '不可购买', color: '#ffffff', backgroundColor: '#555566' };
  }

  // ---- 购买弹窗 ----------------------------------------------------------

  private closeModal(): void {
    if (this.modal) {
      this.modal.destroy();
      this.modal = null;
    }
  }

  private openPurchaseModal(item: ItemDefinition): void {
    this.closeModal();

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const w = 420;
    const h = 300;

    const modal = this.add.container(cx, cy);
    modal.setScrollFactor(0);
    modal.setDepth(2000);
    this.modal = modal;

    // 遮罩
    const mask = this.add.rectangle(-cx, -cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setOrigin(0);
    mask.setInteractive();
    // 点击遮罩关闭弹窗：给一个"点击空白处取消"的体验。
    mask.on('pointerup', () => this.closeModal());
    modal.add(mask);

    const panel = this.add.rectangle(0, 0, w, h, 0x1b1b3a, 0.96);
    panel.setStrokeStyle(4, CARD_BORDER);
    modal.add(panel);

    // 弹窗点击本身不穿透。
    panel.setInteractive();

    const title = this.add
      .text(0, -h / 2 + 22, item.name, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '22px',
        color: '#ffd93d',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);
    modal.add(title);

    const iconTextureKey = `item_${item.id}`;
    if (this.textures.exists(iconTextureKey)) {
      modal.add(this.add.image(-w / 2 + 54, -h / 2 + 60, iconTextureKey).setDisplaySize(58, 58));
    }

    const desc = this.add
      .text(22, -h / 2 + 56, item.description, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: w - 112 },
      })
      .setOrigin(0.5, 0);
    modal.add(desc);

    // 合计展示区：会被"更新数量"按钮的回调刷新。
    const totalText = this.add
      .text(0, -h / 2 + 110, '', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0);
    modal.add(totalText);

    const remainText = this.add
      .text(0, -h / 2 + 136, '', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#aaccff',
      })
      .setOrigin(0.5, 0);
    modal.add(remainText);

    const dailyIds = PlayerState.getDailyContext().shopDiscountIds;
    const discountSeed = this.currentDiscountSeed();
    const isVip = PlayerState.isVip();

    // max 具体展开值：玩家钱能买几件（至少 1，最多 999 避免极端数字）。
    const computeMaxQty = (): number => {
      const coins = PlayerState.getCoins();
      const { unit } = ShopSystem.priceForQuantity(item, 1, dailyIds, isVip, discountSeed);
      if (unit <= 0) return 999;
      const n = Math.floor(coins / unit);
      if (n <= 0) return 1;
      return Math.min(999, n);
    };

    let currentQty: PurchaseQuantity = 1;
    let currentExpandedQty = 1;

    const refreshSummary = (): void => {
      const effectiveQty = currentQty === 'max' ? computeMaxQty() : (currentQty as number);
      currentExpandedQty = effectiveQty;
      const breakdown = ShopSystem.priceForQuantity(
        item,
        effectiveQty,
        dailyIds,
        isVip,
        discountSeed,
      );
      const coins = PlayerState.getCoins();
      const remain = coins - breakdown.total;
      totalText.setText(`购买 ${effectiveQty} 件，合计 ${breakdown.total} 彩虹币`);
      const remainColor = remain < 0 ? '#ff5252' : '#aaccff';
      remainText.setText(`当前金币 ${coins}，购买后剩余 ${remain}`);
      remainText.setColor(remainColor);
    };

    // 数量按钮：1 / 10 / max。
    const qtyButtonY = 52;
    const qtyButtonW = 82;
    const qtyButtonGap = 16;
    const qtyOptions: { qty: PurchaseQuantity; label: string }[] = [
      { qty: 1, label: 'x1' },
      { qty: 10, label: 'x10' },
      { qty: 'max', label: 'MAX' },
    ];
    const totalQtyWidth = qtyOptions.length * qtyButtonW + (qtyOptions.length - 1) * qtyButtonGap;
    const qtyStartX = -totalQtyWidth / 2 + qtyButtonW / 2;
    const qtyButtons: Phaser.GameObjects.Text[] = [];

    qtyOptions.forEach((opt, idx) => {
      const x = qtyStartX + idx * (qtyButtonW + qtyButtonGap);
      const btn = this.add
        .text(x, qtyButtonY, opt.label, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: '#ffffff',
          stroke: BUTTON_STROKE,
          strokeThickness: 3,
          backgroundColor: opt.qty === currentQty ? TAB_ACTIVE_BG : TAB_IDLE_BG,
          padding: { left: 8, right: 8, top: 8, bottom: 8 },
          fixedWidth: qtyButtonW,
          align: 'center',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerup', () => {
        currentQty = opt.qty;
        qtyButtons.forEach((b, i) => {
          const iOpt = qtyOptions[i];
          const picked = iOpt !== undefined && iOpt.qty === currentQty;
          b.setBackgroundColor(picked ? TAB_ACTIVE_BG : TAB_IDLE_BG);
        });
        refreshSummary();
      });
      modal.add(btn);
      qtyButtons.push(btn);
    });

    // 购买 / 关闭按钮
    const buyBtn = this.add
      .text(-72, h / 2 - 40, '购买', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: BUTTON_STROKE,
        strokeThickness: 3,
        backgroundColor: BUTTON_BG,
        padding: { left: 24, right: 24, top: 8, bottom: 8 },
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    modal.add(buyBtn);

    const cancelBtn = this.add
      .text(72, h / 2 - 40, '关闭', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: BUTTON_STROKE,
        strokeThickness: 3,
        backgroundColor: '#555566',
        padding: { left: 24, right: 24, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    modal.add(cancelBtn);

    buyBtn.on('pointerup', () => {
      this.onConfirmPurchase(item, currentExpandedQty);
    });
    cancelBtn.on('pointerup', () => this.closeModal());

    refreshSummary();
  }

  private onConfirmPurchase(item: ItemDefinition, qty: number): void {
    const dailyIds = PlayerState.getDailyContext().shopDiscountIds;
    const discountSeed = this.currentDiscountSeed();
    const isVip = PlayerState.isVip();
    const coins = PlayerState.getCoins();

    const check = ShopSystem.canPurchase({
      item,
      qty,
      coins,
      isVip,
      dailyDiscountIds: dailyIds,
      dailyDiscountSeed: discountSeed,
    });
    if (!check.ok) {
      this.showToast(this.reasonToMessage(check.reason));
      return;
    }

    // 走 applyPurchase 纯函数得到 totalCost；PlayerState 单例自行做 persist + emit。
    const save = PlayerState.snapshot();
    const result = ShopSystem.applyPurchase(save, item, qty, dailyIds, discountSeed);

    PlayerState.addCoins(-result.totalCost);
    PlayerState.addItem(item.id, qty);

    gameEvents.emit('shop:purchase', {
      itemId: item.id,
      quantity: qty,
      totalCost: result.totalCost,
    });

    this.showToast(`购买 ${item.name} ×${qty} 成功！`);
    this.closeModal();
    this.rebuildGrid();
  }

  private reasonToMessage(reason?: PurchaseDeniedReason): string {
    switch (reason) {
      case 'shop_unavailable':
        return '这是活动专属信物，要通过对应活动获得。';
      case 'vip_locked':
        return '此商品仅限 VIP 购买。';
      case 'coins_low':
        return '彩虹币不够啦，去冒险赚一些吧~';
      case 'invalid_qty':
        return '购买数量不正确。';
      default:
        return '购买失败，请稍后再试。';
    }
  }

  // ---- toast -------------------------------------------------------------

  private showToast(message: string, durationMs = 1800): void {
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
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2100);
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

function toLimitedShopItem(def: ItemDefinition): ItemDefinition {
  const overridePrice = LIMITED_SPECIAL_PRICES[def.id];
  if (overridePrice === undefined) return def;
  return {
    ...def,
    price: overridePrice,
    description: `${def.description} 限时补给站今日可兑换。`,
  };
}
