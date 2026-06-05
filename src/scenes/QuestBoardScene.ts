import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { ITEMS } from '@/data/items';
import { QUESTS_ALL, QUESTS_DAILY_POOL, QUESTS_MAIN } from '@/data/quests';
import { AudioManager } from '@/systems/AudioManager';
import { DailyQuest } from '@/systems/DailyQuest';
import { QuestEngine } from '@/systems/QuestEngine';
import { applyQuestReward } from '@/systems/QuestRuntime';
import { PlayerState } from '@/systems/PlayerState';
import { questDestinationForPendingStep, type QuestDestination } from '@/systems/QuestDestinations';
import { preloadQuestAssets } from '@/systems/SceneAssetPreloader';
import { makeHud, type HudHandle } from '@/ui/Hud';
import type { QuestCondition, QuestDefinition, QuestKind, QuestState, QuestStatus } from '@/types';

/**
 * 任务板场景（FEAT-303）。
 *
 * 布局：
 *   - 顶部标题 + 返回按钮；
 *   - 两 Tab：主线 / 每日；
 *   - 每条任务一张卡片（标题、描述、进度文字、奖励文字、状态按钮）。
 *
 * 状态按钮文案：
 *   - locked   → "未解锁"（灰色，不可点击）
 *   - active   → "进行中"（不可点击）
 *   - claimable→ "领取奖励"（金色，可点击）
 *   - completed→ "已完成"（灰色，不可点击）
 *
 * 每日任务 Tab：
 *   - 进入 create() 时检查 shouldRefreshDaily：若需要刷新，用今天 UTC 日期做 seed
 *     从 QUESTS_DAILY_POOL 抽 3 条，写回 dailyContext.dailyQuestIds 并初始化状态。
 *   - 当日不再重复滚动。
 *
 * 奖励发放走 QuestEngine.claimReward(state, def, applyQuestReward) 注入回调，
 * applyQuestReward 把金币/物品/VIP 写入 PlayerState。
 */

const TITLE_COLOR = '#ffd93d';
const SUBTITLE_COLOR = '#ffffff';
const CARD_BG = 0x1b1b3a;
const CARD_BG_ALPHA = 0.88;
const CARD_BORDER = 0xff3b9a;
const QUEST_HALL_TEXTURE_KEY = 'premium_quest_hall_image2';

const TAB_IDLE_BG = '#1b1b3a';
const TAB_ACTIVE_BG = '#ff3b9a';

const CARD_WIDTH = 760;
const CARD_HEIGHT = 146;
const CARD_GAP_Y = 14;
const GRID_TOP = 166;
const LIST_VIEW_HEIGHT = 434;

/** 每日任务一次性发布几条。控制在 3，便于初学者一天集齐；池里备到 5 条让 seed 稳定。 */
const DAILY_QUEST_COUNT = 3;

/**
 * 用于排序的状态优先级：claimable > active > locked > completed。
 * 列表永远按此顺序展示，让玩家一眼看到可领取的奖励。
 */
const STATUS_PRIORITY: Record<QuestStatus, number> = {
  claimable: 0,
  active: 1,
  locked: 2,
  completed: 3,
};

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

export class QuestBoardScene extends Phaser.Scene {
  private currentTab: QuestKind = 'main';
  private mainTabBtn: Phaser.GameObjects.Text | null = null;
  private dailyTabBtn: Phaser.GameObjects.Text | null = null;
  private list: Phaser.GameObjects.Container | null = null;
  private listContent: Phaser.GameObjects.Container | null = null;
  private listMask: Phaser.GameObjects.Graphics | null = null;
  private scrollThumb: Phaser.GameObjects.Rectangle | null = null;
  private scrollOffset = 0;
  private listContentHeight = 0;
  private listTop = GRID_TOP;
  private listViewHeight = LIST_VIEW_HEIGHT;
  private listCenterX = GAME_WIDTH / 2;
  private scrollTrackX = GAME_WIDTH / 2 + CARD_WIDTH / 2 + 34;
  private hud: HudHandle | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  public constructor() {
    super({ key: SceneKey.QUEST_BOARD });
  }

  public preload(): void {
    preloadQuestAssets(this);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.currentTab = 'main';

    this.refreshDailyIfNeeded();

    this.drawBackground();
    this.drawHeader();
    this.drawTabBar();
    this.drawBackButton();
    this.rebuildList();
    this.input.on('wheel', this.onWheelScroll, this);

    this.hud = makeHud(this, 'topright');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud?.destroy();
      this.hud = null;
      this.destroyList();
      this.input.off('wheel', this.onWheelScroll, this);
      this.clearToast();
    });

    // 沿用彩虹城 BGM，没有单独的任务板 BGM。
    AudioManager.play('world_rainbow', undefined, this);
  }

  private drawBackground(): void {
    const viewport = this.getViewportBounds();
    if (this.textures.exists(QUEST_HALL_TEXTURE_KEY)) {
      const bg = this.add
        .image(viewport.centerX, viewport.centerY, QUEST_HALL_TEXTURE_KEY)
        .setOrigin(0.5)
        .setDepth(-20);
      const frame = bg.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const scale = Math.max(viewport.width / frame.width, viewport.height / frame.height);
      bg.setScale(scale);
    } else {
      const g = this.add.graphics().setDepth(-20);
      g.fillGradientStyle(0x0b3b69, 0x153f78, 0x071b37, 0x251a59, 1);
      g.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
      g.fillStyle(0xffffff, 0.1);
      g.fillCircle(viewport.left + 150, viewport.top + 120, 92);
      g.fillCircle(viewport.right - 150, viewport.top + 96, 70);
      g.fillCircle(viewport.right - 200, viewport.bottom - 80, 126);
    }

    const veil = this.add.graphics().setDepth(-10);
    veil.fillStyle(0x031b36, 0.32);
    veil.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
    veil.fillStyle(0x081f3e, 0.56);
    veil.fillRoundedRect(
      viewport.left + 28,
      viewport.top + 96,
      viewport.width - 56,
      viewport.height - 118,
      18,
    );
    veil.lineStyle(2, 0xffffff, 0.2);
    veil.strokeRoundedRect(
      viewport.left + 28,
      viewport.top + 96,
      viewport.width - 56,
      viewport.height - 118,
      18,
    );
  }

  // ---- 每日任务滚动 ------------------------------------------------------

  /**
   * 检查是否需要按 UTC 日刷新每日任务；若需要则从 QUESTS_DAILY_POOL 抽取并写回。
   *
   * - 同日第二次进入：shouldRefreshDaily = false，沿用上次结果。
   * - 首次进入 / 跨日：重新 pickDailyQuests，把旧 daily 任务的进度清空、状态置回 active。
   */
  private refreshDailyIfNeeded(): void {
    const now = new Date();
    const today = DailyQuest.todayUtcDateString(now);
    const ctx = PlayerState.getDailyContext();
    if (!DailyQuest.shouldRefreshDaily(ctx.lastRolledDate, now)) {
      // 确保当日 daily 任务状态已初始化（防御性）。
      this.ensureDailyStates(ctx.dailyQuestIds);
      return;
    }

    const newIds = DailyQuest.pickDailyQuests(QUESTS_DAILY_POOL, today, DAILY_QUEST_COUNT);

    PlayerState.setDailyContext({
      lastRolledDate: today,
      shopDiscountIds: ctx.shopDiscountIds,
      shopDiscountDate: ctx.shopDiscountDate ?? null,
      dailyQuestIds: newIds,
    });

    // 清洗所有 daily 任务的历史状态（未入选的也置回 active 不会被 UI 看到）。
    for (const q of QUESTS_DAILY_POOL) {
      PlayerState.setQuestState(q.id, {
        status: 'active',
        progress: {},
        updatedAt: Date.now(),
      });
    }
    this.ensureDailyStates(newIds);
  }

  /**
   * 确保当日 daily 任务状态已经存在；如果玩家没有对应 state（初始玩家 / 迁移过来的老存档），
   * 补一次 initQuestStates。
   */
  private ensureDailyStates(ids: readonly string[]): void {
    const defs: QuestDefinition[] = [];
    for (const id of ids) {
      const def = QUESTS_ALL.find((q) => q.id === id);
      if (def) defs.push(def);
    }
    const existing = PlayerState.snapshot().questStates;
    const init = QuestEngine.initQuestStates(defs);
    for (const id of Object.keys(init)) {
      if (existing[id] === undefined) {
        const s = init[id];
        if (s) PlayerState.setQuestState(id, s);
      }
    }
  }

  // ---- 顶部 UI / Tab / 返回 ---------------------------------------------

  private drawHeader(): void {
    const viewport = this.getViewportBounds();
    this.add
      .text(viewport.centerX, viewport.top + 18, '任务板', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '36px',
        color: TITLE_COLOR,
        stroke: '#1b1b3a',
        strokeThickness: 6,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(900);

    this.add
      .text(
        viewport.centerX,
        viewport.top + 64,
        '查看进度、领取奖励，也可以直接出发到下一步地点。',
        {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '16px',
          color: SUBTITLE_COLOR,
          stroke: '#1b6fa8',
          strokeThickness: 3,
        },
      )
      .setOrigin(0.5, 0)
      .setDepth(900);
  }

  private drawTabBar(): void {
    const viewport = this.getViewportBounds();
    const y = viewport.top + 120;
    const tabWidth = 140;
    const gap = 12;
    const totalWidth = tabWidth * 2 + gap;
    const startX = viewport.centerX - totalWidth / 2 + tabWidth / 2;

    const makeTab = (kind: QuestKind, label: string, x: number): Phaser.GameObjects.Text => {
      const active = kind === this.currentTab;
      const btn = this.add
        .text(x, y, label, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '20px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 3,
          backgroundColor: active ? TAB_ACTIVE_BG : TAB_IDLE_BG,
          padding: { left: 14, right: 14, top: 8, bottom: 8 },
          fixedWidth: tabWidth,
          align: 'center',
          fontStyle: active ? 'bold' : 'normal',
        })
        .setOrigin(0.5)
        .setDepth(900)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerup', () => this.selectTab(kind));
      btn.on('pointerover', () => {
        if (this.currentTab !== kind) btn.setColor('#ffd93d');
      });
      btn.on('pointerout', () => btn.setColor('#ffffff'));
      return btn;
    };

    this.mainTabBtn = makeTab('main', '主线任务', startX);
    this.dailyTabBtn = makeTab('daily', '每日任务', startX + tabWidth + gap);
  }

  private drawBackButton(): void {
    const viewport = this.getViewportBounds();
    const btn = this.add
      .text(viewport.left + 40, viewport.top + 40, '← 返回彩虹城', {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        backgroundColor: '#00000066',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setDepth(900)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerup', () => this.scene.start(SceneKey.WORLD));
    btn.on('pointerover', () => btn.setColor('#ffd93d'));
    btn.on('pointerout', () => btn.setColor('#ffffff'));
  }

  private selectTab(kind: QuestKind): void {
    if (kind === this.currentTab) return;
    this.currentTab = kind;
    const updateTab = (btn: Phaser.GameObjects.Text | null, active: boolean): void => {
      if (!btn) return;
      btn.setBackgroundColor(active ? TAB_ACTIVE_BG : TAB_IDLE_BG);
      btn.setFontStyle(active ? 'bold' : 'normal');
    };
    updateTab(this.mainTabBtn, kind === 'main');
    updateTab(this.dailyTabBtn, kind === 'daily');
    this.scrollOffset = 0;
    this.rebuildList();
  }

  // ---- 列表渲染 ----------------------------------------------------------

  private destroyList(): void {
    if (this.list) {
      this.list.destroy();
      this.list = null;
    }
    if (this.listMask) {
      this.listMask.destroy();
      this.listMask = null;
    }
    this.listContent = null;
    this.scrollThumb = null;
  }

  /**
   * 收集当前 Tab 要展示的 QuestDefinition 列表并按状态排序。
   */
  private currentDefs(): QuestDefinition[] {
    if (this.currentTab === 'main') {
      return [...QUESTS_MAIN];
    }
    // daily：按 dailyContext.dailyQuestIds 顺序解析。
    const ids = PlayerState.getDailyContext().dailyQuestIds;
    const defs: QuestDefinition[] = [];
    for (const id of ids) {
      const def = QUESTS_ALL.find((q) => q.id === id);
      if (def) defs.push(def);
    }
    return defs;
  }

  private rebuildList(): void {
    this.destroyList();
    const defs = this.currentDefs();

    const viewport = this.getViewportBounds();
    this.listTop = viewport.top + GRID_TOP;
    this.listViewHeight = Math.max(260, viewport.height - GRID_TOP - 38);
    this.listCenterX = viewport.centerX;
    this.scrollTrackX = viewport.centerX + CARD_WIDTH / 2 + 34;

    const list = this.add.container(0, 0);
    list.setDepth(800);
    this.list = list;

    if (defs.length === 0) {
      const msg =
        this.currentTab === 'daily'
          ? '今天的每日任务还没有发布，先去其它地方冒险吧！'
          : '暂无主线任务。';
      const empty = this.add
        .text(this.listCenterX, this.listTop + 40, msg, {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '18px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 4,
          backgroundColor: '#00000055',
          padding: { left: 16, right: 16, top: 8, bottom: 8 },
          align: 'center',
        })
        .setOrigin(0.5, 0);
      list.add(empty);
      return;
    }

    // 排序：claimable → active → locked → completed，同状态保持原序。
    const states = PlayerState.snapshot().questStates;
    const sorted = [...defs].sort((a, b) => {
      const sa = states[a.id]?.status ?? 'active';
      const sb = states[b.id]?.status ?? 'active';
      return STATUS_PRIORITY[sa] - STATUS_PRIORITY[sb];
    });

    const content = this.add.container(0, -this.scrollOffset);
    this.listContent = content;
    this.listContentHeight = sorted.length * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y;

    this.listMask = this.add.graphics().setVisible(false);
    this.listMask.fillStyle(0xffffff, 1);
    this.listMask.fillRect(
      this.listCenterX - CARD_WIDTH / 2 - 22,
      this.listTop - 6,
      CARD_WIDTH + 82,
      this.listViewHeight + 12,
    );
    content.setMask(this.listMask.createGeometryMask());

    sorted.forEach((def, idx) => {
      const y = this.listTop + idx * (CARD_HEIGHT + CARD_GAP_Y);
      const card = this.createCard(def, this.listCenterX, y);
      content.add(card);
    });
    list.add(content);
    this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset, 0, this.maxScroll());
    content.setY(-this.scrollOffset);
    this.drawScrollbar(list);
  }

  private maxScroll(): number {
    return Math.max(0, this.listContentHeight - this.listViewHeight);
  }

  private scrollTo(offset: number): void {
    const maxScroll = this.maxScroll();
    this.scrollOffset = Phaser.Math.Clamp(offset, 0, maxScroll);
    this.listContent?.setY(-this.scrollOffset);
    this.updateScrollThumb();
  }

  private onWheelScroll(
    _pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    if (!this.listContent || this.maxScroll() <= 0) return;
    this.scrollTo(this.scrollOffset + deltaY * 0.55);
  }

  private drawScrollbar(list: Phaser.GameObjects.Container): void {
    const maxScroll = this.maxScroll();
    if (maxScroll <= 0) return;

    const trackX = this.scrollTrackX;
    const trackY = this.listTop;
    const trackH = this.listViewHeight;
    const track = this.add.rectangle(trackX, trackY, 12, trackH, 0x0f4f75, 0.28);
    track.setOrigin(0.5, 0);
    list.add(track);

    const thumbH = Math.max(48, (this.listViewHeight / this.listContentHeight) * trackH);
    const thumb = this.add.rectangle(trackX, trackY + thumbH / 2, 18, thumbH, 0xffd93d, 0.95);
    thumb.setStrokeStyle(2, 0xffffff, 0.8);
    thumb.setInteractive({ useHandCursor: true });
    this.input.setDraggable(thumb);
    thumb.on('drag', (_pointer: Phaser.Input.Pointer, _dragX: number, dragY: number) => {
      const minY = trackY + thumbH / 2;
      const maxY = trackY + trackH - thumbH / 2;
      const clampedY = Phaser.Math.Clamp(dragY, minY, maxY);
      const ratio = maxY === minY ? 0 : (clampedY - minY) / (maxY - minY);
      this.scrollTo(maxScroll * ratio);
    });
    list.add(thumb);
    this.scrollThumb = thumb;
    this.updateScrollThumb();
  }

  private updateScrollThumb(): void {
    if (!this.scrollThumb || this.maxScroll() <= 0) return;
    const trackY = this.listTop;
    const trackH = this.listViewHeight;
    const thumbH = this.scrollThumb.height;
    const minY = trackY + thumbH / 2;
    const maxY = trackY + trackH - thumbH / 2;
    const ratio = this.scrollOffset / this.maxScroll();
    this.scrollThumb.setY(minY + (maxY - minY) * ratio);
  }

  /**
   * 创建单个任务卡片。
   */
  private createCard(def: QuestDefinition, cx: number, cy: number): Phaser.GameObjects.Container {
    const states = PlayerState.snapshot().questStates;
    const state: QuestState = states[def.id] ?? {
      status: 'active',
      progress: {},
      updatedAt: 0,
    };
    const destination =
      state.status === 'active' ? questDestinationForPendingStep(def, state) : undefined;
    const completion = questCompletionRatio(def, state);
    const card = this.add.container(cx, cy);

    const bg = this.add.graphics();
    bg.fillStyle(CARD_BG, CARD_BG_ALPHA);
    bg.fillRoundedRect(-CARD_WIDTH / 2, 0, CARD_WIDTH, CARD_HEIGHT, 12);
    bg.fillStyle(statusColor(state.status), 0.32);
    bg.fillRoundedRect(-CARD_WIDTH / 2 + 4, 4, 9, CARD_HEIGHT - 8, 7);
    bg.fillStyle(0xffffff, 0.08);
    bg.fillRoundedRect(-CARD_WIDTH / 2 + 16, 8, CARD_WIDTH - 32, 34, 10);
    bg.lineStyle(2, CARD_BORDER, 0.76);
    bg.strokeRoundedRect(-CARD_WIDTH / 2, 0, CARD_WIDTH, CARD_HEIGHT, 12);
    card.add(bg);

    if (def.imageKey && this.textures.exists(def.imageKey)) {
      const image = this.add.image(-CARD_WIDTH / 2 + 72, 64, def.imageKey).setOrigin(0.5);
      fitTextureInside(image, 112, 82);
      card.add(image);
      const imageFrame = this.add.rectangle(-CARD_WIDTH / 2 + 72, 64, 116, 86, 0xffffff, 0);
      imageFrame.setStrokeStyle(2, 0xffffff, 0.62);
      card.add(imageFrame);
    } else {
      const badge = this.add.graphics();
      badge.fillStyle(statusColor(state.status), 0.88);
      badge.fillCircle(-CARD_WIDTH / 2 + 72, 64, 40);
      badge.fillStyle(0xffffff, 0.22);
      badge.fillCircle(-CARD_WIDTH / 2 + 62, 52, 13);
      badge.lineStyle(2, 0xffffff, 0.72);
      badge.strokeCircle(-CARD_WIDTH / 2 + 72, 64, 40);
      card.add(badge);
      const badgeLabel = this.add
        .text(-CARD_WIDTH / 2 + 72, 64, state.status === 'claimable' ? '奖' : '行', {
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: '26px',
          color: '#ffffff',
          stroke: '#1b1b3a',
          strokeThickness: 4,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      card.add(badgeLabel);
    }

    const textLeft = -CARD_WIDTH / 2 + 142;
    const textWidth = CARD_WIDTH - (def.imageKey && this.textures.exists(def.imageKey) ? 332 : 202);

    const title = this.add
      .text(textLeft, 9, def.title, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        wordWrap: { width: textWidth },
      })
      .setOrigin(0, 0);
    card.add(title);

    const desc = this.add
      .text(textLeft, 39, def.description, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#dcdcff',
        wordWrap: { width: textWidth },
      })
      .setOrigin(0, 0);
    card.add(desc);

    const progressX = textLeft;
    const progressY = CARD_HEIGHT - 54;
    const progressTrack = this.add.rectangle(progressX, progressY, textWidth, 9, 0x07172f, 0.84);
    progressTrack.setOrigin(0, 0.5);
    card.add(progressTrack);
    const progressFill = this.add.rectangle(
      progressX,
      progressY,
      Math.max(8, textWidth * completion),
      9,
      state.status === 'locked' ? 0x5b6075 : 0xffd93d,
      0.95,
    );
    progressFill.setOrigin(0, 0.5);
    card.add(progressFill);

    const progressLabel = this.add
      .text(textLeft, CARD_HEIGHT - 36, formatProgress(def, state), {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: '#aaccff',
        wordWrap: { width: textWidth },
      })
      .setOrigin(0, 0);
    card.add(progressLabel);

    const destinationLabel = this.add
      .text(textLeft, CARD_HEIGHT - 18, destinationHint(destination, state), {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: destination ? '#fff7be' : '#b9d8ff',
        stroke: '#1b1b3a',
        strokeThickness: 2,
        wordWrap: { width: textWidth },
      })
      .setOrigin(0, 0.5);
    card.add(destinationLabel);

    const rewardLabel = this.add
      .text(CARD_WIDTH / 2 - 18, 50, formatReward(def), {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: '#ffd93d',
        align: 'right',
        wordWrap: { width: 170 },
      })
      .setOrigin(1, 0);
    card.add(rewardLabel);

    const statusTag = this.createStatusTag(state);
    statusTag.setPosition(CARD_WIDTH / 2 - 18, 10);
    card.add(statusTag);

    const actionButton = this.createActionButton(def, state, destination);
    actionButton.setPosition(CARD_WIDTH / 2 - 18, CARD_HEIGHT - 38);
    card.add(actionButton);

    return card;
  }

  private createStatusTag(state: QuestState): Phaser.GameObjects.Text {
    const label = STATUS_LABEL[state.status];
    return this.add
      .text(0, 0, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        backgroundColor: statusBgColor(state.status),
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
        fixedWidth: 96,
        align: 'center',
        fontStyle: state.status === 'claimable' ? 'bold' : 'normal',
      })
      .setOrigin(1, 0);
  }

  private createActionButton(
    def: QuestDefinition,
    state: QuestState,
    destination: QuestDestination | undefined,
  ): Phaser.GameObjects.Text {
    if (state.status === 'claimable') {
      return this.createCardButton('领取奖励', '#ff3b9a', () => this.onClaim(def));
    }
    if (state.status === 'active' && destination !== undefined) {
      return this.createCardButton(destination.actionLabel, '#1484d8', () =>
        this.openDestination(destination),
      );
    }
    if (state.status === 'active') {
      return this.createCardButton('继续探索', '#44506c', () =>
        this.showToast('这个目标会随战斗、捕捉或探索自然推进。'),
      );
    }
    const label = state.status === 'completed' ? '已入账' : '待解锁';
    return this.add
      .text(0, 0, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#d2d6e6',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        backgroundColor: '#555566',
        padding: { left: 10, right: 10, top: 8, bottom: 8 },
        fixedWidth: 112,
        align: 'center',
      })
      .setOrigin(1, 0);
  }

  private createCardButton(
    label: string,
    backgroundColor: string,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const btn = this.add
      .text(0, 0, label, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
        backgroundColor,
        padding: { left: 10, right: 10, top: 8, bottom: 8 },
        fixedWidth: 112,
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ffd93d'));
    btn.on('pointerout', () => btn.setColor('#ffffff'));
    btn.on('pointerup', onClick);
    return btn;
  }

  private openDestination(destination: QuestDestination): void {
    const sceneData = {
      ...(destination.sceneData ?? {}),
      fromScene: SceneKey.QUEST_BOARD,
    };
    this.scene.start(destination.scene, sceneData);
  }

  private onClaim(def: QuestDefinition): void {
    const state = PlayerState.getQuestState(def.id);
    if (!state) return;
    const after = QuestEngine.claimReward(state, def, applyQuestReward);
    if (after === state) {
      // claimReward 在 status 非 claimable 时会返回原对象（引用相等）。
      return;
    }
    PlayerState.setQuestState(def.id, after);

    // 完成后触发主线 unlock 链。
    const allStates = PlayerState.snapshot().questStates;
    const unlocked = QuestEngine.tryUnlock(allStates, QUESTS_MAIN);
    for (const id of Object.keys(unlocked)) {
      const prev = allStates[id];
      const nx = unlocked[id];
      if (prev && nx && prev !== nx && prev.status !== nx.status) {
        PlayerState.setQuestState(id, nx);
      }
    }

    this.showToast(`领取成功！${formatReward(def)}`);
    this.rebuildList();
  }

  // ---- Toast -----------------------------------------------------------

  private showToast(message: string, durationMs = 1800): void {
    this.clearToast();
    const viewport = this.getViewportBounds();
    const toast = this.add
      .text(viewport.centerX, viewport.bottom - 60, message, {
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
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
}

function collectSourceProgressKey(source: string, itemId: string | undefined): string {
  return `collect:${source}:${itemId ?? '*'}`;
}

function fitTextureInside(image: Phaser.GameObjects.Image, maxWidth: number, maxHeight: number): void {
  const source = image.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const scale = Math.min(maxWidth / source.width, maxHeight / source.height);
  image.setDisplaySize(source.width * scale, source.height * scale);
}

function statusColor(status: QuestStatus): number {
  switch (status) {
    case 'claimable':
      return 0xffd93d;
    case 'active':
      return 0x65d6ff;
    case 'completed':
      return 0x8fe66c;
    case 'locked':
      return 0x8f94aa;
  }
}

function statusBgColor(status: QuestStatus): string {
  switch (status) {
    case 'claimable':
      return '#ff3b9a';
    case 'active':
      return '#1484d8';
    case 'completed':
      return '#347a4e';
    case 'locked':
      return '#555566';
  }
}

function destinationHint(destination: QuestDestination | undefined, state: QuestState): string {
  if (state.status === 'locked') return '下一步：完成前置主线后解锁';
  if (state.status === 'completed') return '下一步：奖励已入账，可继续查看后续任务';
  if (state.status === 'claimable') return '下一步：先领取奖励，新的任务会自动解锁';
  if (destination !== undefined) return `下一步：${destination.placeLabel}`;
  return '下一步：通过战斗、捕捉、升级或探索推进';
}

function questCompletionRatio(def: QuestDefinition, state: QuestState): number {
  if (state.status === 'completed' || state.status === 'claimable') return 1;
  if (state.status === 'locked') return 0;
  if (def.conditions.length === 0) return 0;
  const total = def.conditions.reduce((sum, condition) => {
    return sum + conditionCompletionRatio(condition, state.progress);
  }, 0);
  return Phaser.Math.Clamp(total / def.conditions.length, 0, 1);
}

function conditionCompletionRatio(
  cond: QuestCondition,
  progress: Readonly<Record<string, number>>,
): number {
  switch (cond.kind) {
    case 'defeat_boss':
      return ratio(progress[cond.bossId] ?? 0, 1);
    case 'defeat_wild':
      return ratio(progress.defeat_wild ?? 0, cond.count);
    case 'defeat_trainer':
      return ratio(progress.defeat_trainer ?? 0, cond.count);
    case 'capture_pet':
      return ratio(progress[cond.petId] ?? 0, 1);
    case 'capture_any':
      return ratio(progress.capture_any ?? 0, cond.count);
    case 'hatch_pet':
      return ratio(progress[`hatch:${cond.petId}`] ?? 0, 1);
    case 'hatch_any':
      return ratio(progress.hatch_any ?? 0, cond.count);
    case 'reach_map':
      return ratio(progress[cond.mapId] ?? 0, 1);
    case 'visit_any_map':
      return ratio(progress.visit_any_map ?? 0, cond.count);
    case 'spend_coins':
      return ratio(progress.spend_coins ?? 0, cond.amount);
    case 'collect_item':
      return ratio(progress[cond.itemId] ?? 0, cond.count);
    case 'collect_item_from':
      return ratio(progress[collectSourceProgressKey(cond.source, cond.itemId)] ?? 0, cond.count);
    case 'purchase_any':
      return ratio(progress.purchase_any ?? 0, cond.count);
    case 'level_up':
      return ratio(progress[cond.petId] ?? 0, 1);
    case 'level_up_any':
      return ratio(progress.level_up_any ?? 0, cond.count);
    case 'minigame_runs':
      return ratio(progress[`minigame_runs:${cond.minigameId}`] ?? 0, cond.count);
    case 'minigame_score':
      return ratio(progress[`minigame_score:${cond.minigameId}`] ?? 0, cond.targetScore);
  }
}

function ratio(value: number, target: number): number {
  if (target <= 0) return 1;
  return Phaser.Math.Clamp(value / target, 0, 1);
}

/**
 * 状态按钮文案。
 */
const STATUS_LABEL: Record<QuestStatus, string> = {
  locked: '未解锁',
  active: '进行中',
  claimable: '领取奖励',
  completed: '已完成',
};

/**
 * 把一条 condition 格式化为 "x/y" 或 "已完成"。
 */
function formatConditionProgress(
  cond: QuestCondition,
  progress: Readonly<Record<string, number>>,
): string {
  switch (cond.kind) {
    case 'defeat_boss':
      return `${progress[cond.bossId] ?? 0}/1`;
    case 'defeat_wild':
      return `${progress['defeat_wild'] ?? 0}/${cond.count}`;
    case 'defeat_trainer':
      return `${progress['defeat_trainer'] ?? 0}/${cond.count}`;
    case 'capture_pet':
      return `${progress[cond.petId] ?? 0}/1`;
    case 'capture_any':
      return `${progress['capture_any'] ?? 0}/${cond.count}`;
    case 'hatch_pet':
      return `${progress[`hatch:${cond.petId}`] ?? 0}/1`;
    case 'hatch_any':
      return `${progress['hatch_any'] ?? 0}/${cond.count}`;
    case 'reach_map':
      return `${progress[cond.mapId] ?? 0}/1`;
    case 'visit_any_map':
      return `${progress['visit_any_map'] ?? 0}/${cond.count}`;
    case 'spend_coins':
      return `${progress['spend_coins'] ?? 0}/${cond.amount}`;
    case 'collect_item':
      return `${progress[cond.itemId] ?? 0}/${cond.count}`;
    case 'collect_item_from':
      return `${progress[collectSourceProgressKey(cond.source, cond.itemId)] ?? 0}/${cond.count}`;
    case 'purchase_any':
      return `${progress['purchase_any'] ?? 0}/${cond.count}`;
    case 'level_up':
      return `${progress[cond.petId] ?? 0}/1`;
    case 'level_up_any':
      return `${progress['level_up_any'] ?? 0}/${cond.count}`;
    case 'minigame_runs':
      return `${progress[`minigame_runs:${cond.minigameId}`] ?? 0}/${cond.count}`;
    case 'minigame_score':
      return `${progress[`minigame_score:${cond.minigameId}`] ?? 0}/${cond.targetScore}`;
  }
}

/**
 * 把任务的所有条件 progress 连接为一行文字。
 */
export function formatProgress(def: QuestDefinition, state: QuestState): string {
  if (state.status === 'completed') return '进度：已完成';
  if (state.status === 'locked') return '进度：前置任务未完成';
  const parts = def.conditions.map((c) => formatConditionProgress(c, state.progress));
  return `进度：${parts.join(' · ')}`;
}

/**
 * 把 QuestReward 格式化为"xx 彩虹币 + 道具 ×N"。
 */
export function formatReward(def: QuestDefinition): string {
  const parts: string[] = [];
  const r = def.reward;
  if (typeof r.coins === 'number' && r.coins > 0) parts.push(`${r.coins} 币`);
  if (r.items) {
    for (const entry of r.items) {
      const name = ITEMS[entry.itemId]?.name ?? entry.itemId;
      parts.push(`${name} ×${entry.quantity}`);
    }
  }
  if (r.grantVip === true) parts.push('VIP 特权');
  return parts.length === 0 ? '（无奖励）' : `奖励：${parts.join('，')}`;
}
