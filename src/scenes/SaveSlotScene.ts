import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, SceneKey } from '@/config/GameConfig';
import { PlayerState } from '@/systems/PlayerState';
import { SaveManager, type SaveSlotMeta } from '@/systems/SaveManager';
import { preloadSaveAssets } from '@/systems/SceneAssetPreloader';
import { createAutoScrollText } from '@/ui/AutoScrollText';
import { createNavIconButton } from '@/ui/NavIconButton';
import { createResponsiveMapBackground } from '@/utils/responsiveBackground';

const PAGE_SIZE = 5;

export class SaveSlotScene extends Phaser.Scene {
  private fromScene: string = SceneKey.WORLD;
  private page = 0;
  private content: Phaser.GameObjects.Container | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  public constructor() {
    super({ key: SceneKey.SAVE_SLOTS });
  }

  public init(data?: { readonly fromScene?: string; readonly page?: number }): void {
    this.fromScene = data?.fromScene ?? SceneKey.WORLD;
    this.page = Math.max(0, data?.page ?? this.page);
  }

  public preload(): void {
    preloadSaveAssets(this);
  }

  public create(): void {
    this.drawShell();
    this.refresh();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.content?.destroy();
      this.content = null;
      this.clearToast();
    });
  }

  private drawShell(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x7bd4f0, 1).setOrigin(0);
    if (this.textures.exists('legacy_world_map_full')) {
      createResponsiveMapBackground(this, 'legacy_world_map_full', {
        stageAlpha: 0.18,
        coverAlpha: 0.18,
      });
    }

    const panel = this.add.graphics();
    panel.fillStyle(0xe8fbff, 0.96);
    panel.fillRoundedRect(42, 88, 876, 510, 8);
    panel.lineStyle(4, 0x58aeca, 0.92);
    panel.strokeRoundedRect(42, 88, 876, 510, 8);
    panel.fillStyle(0x0b6f9c, 0.92);
    panel.fillRoundedRect(58, 104, 844, 52, 8);

    this.add
      .text(GAME_WIDTH / 2, 130, '存档管理', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '30px',
        color: '#fff4a8',
        stroke: '#1b1b3a',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    this.createTopButton(62, 44, '返回', () => this.scene.start(this.fromScene));
    this.createTopButton(146, 44, '新存档', () => this.createNamedSlot());
    this.createTopButton(242, 44, '覆盖当前', () => this.overwriteActiveSlot());
  }

  private refresh(): void {
    this.content?.destroy();
    this.content = this.add.container(0, 0);

    const slots = SaveManager.listSaveSlots();
    const maxPage = Math.max(0, Math.ceil(slots.length / PAGE_SIZE) - 1);
    this.page = Phaser.Math.Clamp(this.page, 0, maxPage);
    const pageSlots = slots.slice(this.page * PAGE_SIZE, this.page * PAGE_SIZE + PAGE_SIZE);

    this.drawCurrentSlotHint();
    if (pageSlots.length === 0) {
      this.drawEmptyState();
    } else {
      pageSlots.forEach((slot, index) => this.drawSlotRow(slot, index));
    }
    this.drawPager(slots.length, maxPage);
  }

  private drawCurrentSlotHint(): void {
    const active = SaveManager.getActiveSaveSlotMeta();
    const label = active
      ? `当前：${active.name}  ${formatDate(active.savedAt)}`
      : '当前还没有绑定存档槽，可以先点“新存档”。';
    this.content?.add(
      this.add.text(68, 168, label, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#236277',
      }),
    );
  }

  private drawEmptyState(): void {
    const group = this.content;
    if (!group) return;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.86);
    g.lineStyle(2, 0x8bd2e8, 0.95);
    g.fillRoundedRect(74, 210, 812, 230, 8);
    g.strokeRoundedRect(74, 210, 812, 230, 8);
    const text = this.add
      .text(GAME_WIDTH / 2, 314, '还没有命名存档\n点上方“新存档”保存当前进度', {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#236277',
        align: 'center',
        lineSpacing: 10,
      })
      .setOrigin(0.5);
    group.add([g, text]);
  }

  private drawSlotRow(slot: SaveSlotMeta, index: number): void {
    const group = this.content;
    if (!group) return;
    const y = 202 + index * 76;
    const active = SaveManager.getActiveSaveSlotId() === slot.id;

    const g = this.add.graphics();
    g.fillStyle(active ? 0xfff4c4 : 0xffffff, 0.94);
    g.lineStyle(2, active ? 0xffa52f : 0x8bd2e8, 0.95);
    g.fillRoundedRect(70, y, 820, 64, 8);
    g.strokeRoundedRect(70, y, 820, 64, 8);
    group.add(g);

    createAutoScrollText({
      scene: this,
      layer: group,
      x: 92,
      y: y + 20,
      width: 250,
      height: 26,
      text: slot.name,
      style: {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '22px',
        color: active ? '#8a4a00' : '#173a54',
        fontStyle: 'bold',
      },
    });

    const detailStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#2a6278',
      lineSpacing: 5,
    };
    group.add(
      this.add.text(
        362,
        y + 13,
        `${formatDate(slot.savedAt)}\n${shortText(slot.playerName, 6)}  金币${slot.coins}`,
        detailStyle,
      ),
    );
    group.add(
      this.add.text(
        500,
        y + 13,
        `精灵 ${slot.partyCount}+${slot.storageCount}\n首发 ${shortText(slot.activePetName ?? '无', 6)}${slot.isVip ? ' VIP' : ''}`,
        detailStyle,
      ),
    );

    this.createRowButton(620, y + 32, active ? '当前' : '读取', active, () =>
      this.loadSlot(slot.id),
    );
    this.createRowButton(694, y + 32, '覆盖', false, () => this.overwriteSlot(slot.id));
    this.createRowButton(768, y + 32, '改名', false, () => this.renameSlot(slot));
    this.createRowButton(842, y + 32, '删除', false, () => this.deleteSlot(slot));
  }

  private drawPager(total: number, maxPage: number): void {
    const group = this.content;
    if (!group) return;
    group.add(
      this.add
        .text(GAME_WIDTH / 2, 560, total === 0 ? '0/0' : `${this.page + 1}/${maxPage + 1}`, {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '17px',
          color: '#236277',
          stroke: '#ffffff',
          strokeThickness: 2,
        })
        .setOrigin(0.5),
    );
    this.createPagerButton(360, 560, '上一页', this.page <= 0, () => {
      this.page -= 1;
      this.refresh();
    });
    this.createPagerButton(600, 560, '下一页', this.page >= maxPage, () => {
      this.page += 1;
      this.refresh();
    });
  }

  private createNamedSlot(): void {
    PlayerState.persist();
    const suggested = `存档 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
    const name = window.prompt('给当前存档起个名字：', suggested);
    if (name === null) return;
    const meta = SaveManager.saveToSlot(name, PlayerState.snapshot());
    if (!meta) {
      this.showToast('存档失败，请检查浏览器存储权限。');
      return;
    }
    PlayerState.init();
    this.showToast(`已保存：${meta.name}`);
    this.refresh();
  }

  private overwriteActiveSlot(): void {
    const active = SaveManager.getActiveSaveSlotMeta();
    if (!active) {
      this.createNamedSlot();
      return;
    }
    this.overwriteSlot(active.id);
  }

  private overwriteSlot(id: string): void {
    const slot = SaveManager.listSaveSlots().find((item) => item.id === id);
    if (!slot) {
      this.showToast('这个存档已经不存在了。');
      this.refresh();
      return;
    }
    if (!window.confirm(`用当前进度覆盖“${slot.name}”吗？`)) return;
    PlayerState.persist();
    const meta = SaveManager.overwriteSaveSlot(id, PlayerState.snapshot());
    if (!meta) {
      this.showToast('覆盖失败。');
      return;
    }
    PlayerState.init();
    this.showToast(`已覆盖：${meta.name}`);
    this.refresh();
  }

  private loadSlot(id: string): void {
    const slot = SaveManager.listSaveSlots().find((item) => item.id === id);
    if (!slot) {
      this.showToast('这个存档已经不存在了。');
      this.refresh();
      return;
    }
    if (!window.confirm(`读取“${slot.name}”吗？当前进度会切换到这个存档。`)) return;
    const loaded = SaveManager.loadSaveSlot(id);
    if (!loaded) {
      this.showToast('读取失败。');
      return;
    }
    PlayerState.init();
    this.showToast(`已读取：${slot.name}`);
    this.refresh();
  }

  private renameSlot(slot: SaveSlotMeta): void {
    const name = window.prompt('输入新的存档名：', slot.name);
    if (name === null) return;
    const meta = SaveManager.renameSaveSlot(slot.id, name);
    if (!meta) {
      this.showToast('改名失败。');
      return;
    }
    this.showToast(`已改名：${meta.name}`);
    this.refresh();
  }

  private deleteSlot(slot: SaveSlotMeta): void {
    if (!window.confirm(`删除“${slot.name}”吗？当前游戏进度不会被清空。`)) return;
    if (!SaveManager.deleteSaveSlot(slot.id)) {
      this.showToast('删除失败。');
      return;
    }
    this.showToast('存档槽已删除。');
    this.refresh();
  }

  private createTopButton(x: number, y: number, label: string, onClick: () => void): void {
    createNavIconButton(this, {
      x,
      y,
      label,
      onClick,
      depth: 1000,
      width: label.length >= 4 ? 96 : label.length >= 3 ? 84 : 66,
      height: 50,
    });
  }

  private createRowButton(
    x: number,
    y: number,
    label: string,
    disabled: boolean,
    onClick: () => void,
  ): void {
    const group = this.content;
    if (!group) return;
    const width = 62;
    const g = this.add.graphics();
    g.fillStyle(disabled ? 0xb3c9d3 : label === '删除' ? 0xd9654b : 0xff9f2f, 0.96);
    g.lineStyle(2, 0xffffff, 0.95);
    g.fillRoundedRect(x - width / 2, y - 16, width, 32, 6);
    g.strokeRoundedRect(x - width / 2, y - 16, width, 32, 6);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: disabled ? '#5f6d77' : '#8a4a00',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const hit = this.add.zone(x, y, width, 32);
    if (!disabled) hit.setInteractive({ useHandCursor: true }).on('pointerup', onClick);
    if (disabled) {
      g.setAlpha(0.75);
      text.setAlpha(0.82);
    }
    group.add([g, text, hit]);
  }

  private createPagerButton(
    x: number,
    y: number,
    label: string,
    disabled: boolean,
    onClick: () => void,
  ): void {
    const group = this.content;
    if (!group) return;
    const g = this.add.graphics();
    g.fillStyle(disabled ? 0xb3c9d3 : 0x1599c8, 0.94);
    g.lineStyle(2, 0xffffff, 0.95);
    g.fillRoundedRect(x - 58, y - 18, 116, 36, 7);
    g.strokeRoundedRect(x - 58, y - 18, 116, 36, 7);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const hit = this.add.zone(x, y, 116, 36);
    if (!disabled) hit.setInteractive({ useHandCursor: true }).on('pointerup', onClick);
    if (disabled) {
      g.setAlpha(0.72);
      text.setAlpha(0.82);
    }
    group.add([g, text, hit]);
  }

  private showToast(message: string): void {
    this.clearToast();
    this.toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, message, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '19px',
        color: '#ffffff',
        stroke: '#1b1b3a',
        strokeThickness: 4,
        backgroundColor: '#00000099',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setDepth(1200);
    this.toastTimer = this.time.delayedCall(1900, () => {
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

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '未记录';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function shortText(value: string, maxChars: number): string {
  const chars = [...value];
  if (chars.length <= maxChars) return value;
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join('')}…`;
}
