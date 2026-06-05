import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import {
  SAVE_KEY,
  ACTIVE_SAVE_SLOT_KEY,
  SAVE_SLOTS_KEY,
  clear,
  deleteSaveSlot,
  defaultSave,
  getActiveSaveSlotId,
  listSaveSlots,
  loadSaveSlot,
  load,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4,
  overwriteSaveSlot,
  renameSaveSlot,
  save,
  saveToSlot,
} from '@/systems/SaveManager';
import type { PlayerSaveV1, PlayerSaveV2, PlayerSaveV3 } from '@/types';

import { installMemoryLocalStorage, uninstallLocalStorage } from './_helpers/localStorage';

/**
 * 构造一份"最小合法" v2 存档，便于迁移测试保持信号聚焦。
 */
function makeValidV2(overrides: Partial<PlayerSaveV2> = {}): PlayerSaveV2 {
  return {
    version: 2,
    playerName: '中继玩家',
    coins: 500,
    isVip: false,
    playerPets: [
      {
        petId: 'flame_puppy',
        level: 12,
        exp: 3,
        learnedSkillIds: ['ember_spark', 'flame_burst', 'flame_rush'],
        currentStats: { hp: 55, atk: 30, def: 18, spd: 24 },
        currentHp: 40,
      },
    ],
    defeatedBossIds: ['shadow_overlord'],
    unlockedMaps: ['rainbow_city', 'beach'],
    pokeballs: 7,
    lastSavedAt: 1700000000000,
    ...overrides,
  };
}

describe('SaveManager', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    uninstallLocalStorage();
  });

  it('localStorage 为空时 load() 返回 defaultSave()（v3 结构）', () => {
    const s = load();
    const d = defaultSave();
    expect(s.version).toBe(4);
    expect(s.playerName).toBe(d.playerName);
    expect(s.coins).toBe(d.coins);
    expect(s.isVip).toBe(false);
    expect(s.playerPets.map((p) => p.petId)).toEqual(d.playerPets.map((p) => p.petId));
    expect(s.petStorage).toEqual([]);
    expect(s.defeatedBossIds).toEqual([]);
    expect(s.unlockedMaps).toEqual(['rainbow_city']);
    expect(s.pokeballs).toBe(10);
    expect(s.inventory).toEqual({ pokeball_normal: 10 });
    expect(s.homeLayout).toEqual([]);
    expect(s.questStates).toEqual({});
    expect(s.vip).toEqual({ lastCheckinDate: null, checkinStreak: 0 });
    expect(s.settings).toEqual({ bgmVolume: 0.6, sfxVolume: 0.8 });
    expect(s.dailyContext).toEqual({
      lastRolledDate: null,
      shopDiscountIds: [],
      shopDiscountDate: null,
      dailyQuestIds: [],
    });
    expect(s.playerPets.every((p) => p.level === 8)).toBe(true);
  });

  it('defaultSave 的起始精灵 id 必须全部真实存在于 PETS 表', () => {
    const d = defaultSave();
    expect(d.playerPets.length).toBe(2);
    for (const pp of d.playerPets) {
      expect(PETS[pp.petId]).toBeDefined();
    }
  });

  it('save() 写入后 load() 能取回并自动刷新 lastSavedAt', () => {
    const before = Date.now();
    const s = defaultSave();
    s.coins = 888;
    s.isVip = true;
    save(s);
    const loaded = load();
    expect(loaded.coins).toBe(888);
    expect(loaded.isVip).toBe(true);
    expect(loaded.lastSavedAt).toBeGreaterThanOrEqual(before);
  });

  it('listSaveSlots() 会把旧的当前存档迁移成可命名存档槽', () => {
    const s = defaultSave();
    s.playerName = '迁移玩家';
    s.coins = 321;
    save(s);

    const slots = listSaveSlots();

    expect(slots).toHaveLength(1);
    expect(slots[0]?.name).toBe('自动存档');
    expect(slots[0]?.playerName).toBe('迁移玩家');
    expect(slots[0]?.coins).toBe(321);
    expect(getActiveSaveSlotId()).toBe(slots[0]?.id);
    expect(globalThis.localStorage.getItem(SAVE_SLOTS_KEY)).not.toBeNull();
    expect(globalThis.localStorage.getItem(ACTIVE_SAVE_SLOT_KEY)).toBe(slots[0]?.id);
  });

  it('saveToSlot() 支持命名、记录时间，并把该槽设为当前存档', () => {
    const before = Date.now();
    const s = defaultSave();
    s.playerName = '小存档';
    s.coins = 777;

    const meta = saveToSlot('  练级前  ', s);
    const slots = listSaveSlots();
    const loaded = load();

    expect(meta).not.toBeNull();
    expect(meta?.name).toBe('练级前');
    expect(meta?.savedAt).toBeGreaterThanOrEqual(before);
    expect(slots.some((slot) => slot.id === meta?.id)).toBe(true);
    expect(getActiveSaveSlotId()).toBe(meta?.id);
    expect(loaded.playerName).toBe('小存档');
    expect(loaded.coins).toBe(777);
  });

  it('读取、改名、覆盖、删除存档槽保持当前存档同步', () => {
    const a = defaultSave();
    a.playerName = '存档A';
    a.coins = 100;
    const slotA = saveToSlot('A线', a)!;

    const b = defaultSave();
    b.playerName = '存档B';
    b.coins = 900;
    const slotB = saveToSlot('B线', b)!;

    expect(loadSaveSlot(slotA.id)?.playerName).toBe('存档A');
    expect(load().coins).toBe(100);
    expect(getActiveSaveSlotId()).toBe(slotA.id);

    expect(renameSaveSlot(slotA.id, '主线一周目')?.name).toBe('主线一周目');
    const overwrite = defaultSave();
    overwrite.playerName = '覆盖后';
    overwrite.coins = 456;
    expect(overwriteSaveSlot(slotA.id, overwrite)?.coins).toBe(456);
    expect(load().playerName).toBe('覆盖后');

    expect(deleteSaveSlot(slotB.id)).toBe(true);
    expect(listSaveSlots().some((slot) => slot.id === slotB.id)).toBe(false);
    expect(deleteSaveSlot('missing-slot')).toBe(false);
  });

  it('损坏的 JSON 会回退到 defaultSave()', () => {
    const ls = globalThis.localStorage;
    ls.setItem(SAVE_KEY, '{ this is not valid json');
    const loaded = load();
    expect(loaded.playerName).toBe(defaultSave().playerName);
    expect(loaded.version).toBe(4);
  });

  it('未知版本号（既非 1/2/3）时回退到 defaultSave()', () => {
    const ls = globalThis.localStorage;
    ls.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 999,
        playerName: '旧版玩家',
        coins: 9999,
        isVip: true,
        ownedPetIds: [],
        defeatedBossIds: [],
        lastSavedAt: 0,
      }),
    );
    const loaded = load();
    expect(loaded.playerName).toBe(defaultSave().playerName);
    expect(loaded.coins).toBe(defaultSave().coins);
  });

  it('clear() 后 load() 回到默认', () => {
    const s = defaultSave();
    s.coins = 1;
    save(s);
    clear();
    expect(load().coins).toBe(defaultSave().coins);
  });

  describe('v1 → v2 → v3 链式迁移', () => {
    it('注入合法 v1 存档：load() 直接返回 v3 结构，保留字段且写回 v3', () => {
      const v1: PlayerSaveV1 = {
        version: 1,
        playerName: '老玩家',
        coins: 888,
        isVip: true,
        ownedPetIds: ['flame_puppy', 'aqua_turtle', 'rainbow_wing'],
        defeatedBossIds: ['shadow_overlord'],
        lastSavedAt: 1700000000000,
      };
      const ls = globalThis.localStorage;
      ls.setItem(SAVE_KEY, JSON.stringify(v1));

      const loaded = load();
      expect(loaded.version).toBe(4);
      expect(loaded.playerName).toBe('老玩家');
      expect(loaded.coins).toBe(888);
      expect(loaded.isVip).toBe(true);
      expect(loaded.defeatedBossIds).toEqual(['shadow_overlord']);
      expect(loaded.unlockedMaps).toEqual(['rainbow_city']);
      expect(loaded.pokeballs).toBe(10);
      // v3 新字段全部使用默认值；v2.pokeballs 在 migrateV2ToV3 里并入 inventory。
      expect(loaded.inventory).toEqual({ pokeball_normal: 10 });
      expect(loaded.homeLayout).toEqual([]);
      expect(loaded.questStates).toEqual({});
      expect(loaded.vip).toEqual({ lastCheckinDate: null, checkinStreak: 0 });
      expect(loaded.settings).toEqual({ bgmVolume: 0.6, sfxVolume: 0.8 });
      expect(loaded.dailyContext).toEqual({
        lastRolledDate: null,
        shopDiscountIds: [],
        shopDiscountDate: null,
        dailyQuestIds: [],
      });

      expect(loaded.playerPets.length).toBe(v1.ownedPetIds.length);
      expect(loaded.playerPets.map((p) => p.petId)).toEqual(v1.ownedPetIds);
      for (const pp of loaded.playerPets) {
        expect(pp.level).toBe(8);
        expect(pp.exp).toBe(0);
        expect(pp.currentStats.hp).toBeGreaterThan(0);
        expect(pp.currentHp).toBe(pp.currentStats.hp);
        expect(pp.learnedSkillIds.length).toBeGreaterThan(0);
      }

      // 迁移后应该已经把 v3 写回 localStorage（幂等）
      const persisted = ls.getItem(SAVE_KEY);
      expect(persisted).not.toBeNull();
      const parsed = JSON.parse(persisted as string) as { version: number };
      expect(parsed.version).toBe(4);
    });

    it('注入 v1 存档含未知 pet id：未知 id 被丢弃但不抛', () => {
      const v1: PlayerSaveV1 = {
        version: 1,
        playerName: '考古学家',
        coins: 50,
        isVip: false,
        ownedPetIds: ['flame_puppy', 'legendary_unicorn_does_not_exist', 'aqua_turtle'],
        defeatedBossIds: [],
        lastSavedAt: 0,
      };
      const ls = globalThis.localStorage;
      ls.setItem(SAVE_KEY, JSON.stringify(v1));

      const loaded = load();
      expect(loaded.version).toBe(4);
      expect(loaded.playerPets.length).toBeLessThan(v1.ownedPetIds.length);
      expect(loaded.playerPets.length).toBe(2);
      expect(loaded.playerPets.map((p) => p.petId)).toEqual(['flame_puppy', 'aqua_turtle']);
    });

    it('v3 存档 load 后 version 仍为 3（幂等，不会重复迁移）', () => {
      const first = load(); // defaultSave → 写回
      save(first);
      const second = load();
      const third = load();
      expect(second.version).toBe(4);
      expect(third.version).toBe(4);
      expect(third.playerPets.length).toBe(first.playerPets.length);
    });

    it('migrateV1ToV2 纯函数：空 ownedPetIds 产生空 playerPets 且仍填默认精灵球/地图', () => {
      const v1: PlayerSaveV1 = {
        version: 1,
        playerName: '白板',
        coins: 0,
        isVip: false,
        ownedPetIds: [],
        defeatedBossIds: [],
        lastSavedAt: 0,
      };
      const v2 = migrateV1ToV2(v1);
      expect(v2.version).toBe(2);
      expect(v2.playerPets).toEqual([]);
      expect(v2.unlockedMaps).toEqual(['rainbow_city']);
      expect(v2.pokeballs).toBe(10);
      expect(v2.playerName).toBe('白板');
    });

    /**
     * v1 review minor #8 回归：isValidSaveV1 只校验类型不校验值域，
     * 被外部污染的负金币 / 空昵称能原样迁移。migrateV1ToV2 层做一次软钳制。
     */
    it('migrateV1ToV2 值域兜底：负 coins 钳为 0，空昵称兜底为"小海宝"', () => {
      const v1: PlayerSaveV1 = {
        version: 1,
        playerName: '   ', // 全空白
        coins: -1000,
        isVip: false,
        ownedPetIds: ['flame_puppy'],
        defeatedBossIds: [],
        lastSavedAt: 0,
      };
      const v2 = migrateV1ToV2(v1);
      expect(v2.coins).toBe(0);
      expect(v2.playerName).toBe('小海宝');
    });

    it('migrateV1ToV2 值域兜底：正常合法 coins / 昵称保持原样', () => {
      const v1: PlayerSaveV1 = {
        version: 1,
        playerName: '大冒险家',
        coins: 888,
        isVip: true,
        ownedPetIds: ['flame_puppy'],
        defeatedBossIds: [],
        lastSavedAt: 0,
      };
      const v2 = migrateV1ToV2(v1);
      expect(v2.coins).toBe(888);
      expect(v2.playerName).toBe('大冒险家');
    });

    // ---- v2 → v3（FEAT-300 新增）------------------------------------------

    it('注入合法 v2 存档：load() 升级到 v3 并持久化为 v3 JSON', () => {
      const v2 = makeValidV2({ playerName: '过渡玩家', coins: 321, isVip: true });
      const ls = globalThis.localStorage;
      ls.setItem(SAVE_KEY, JSON.stringify(v2));

      const loaded = load();
      // 关键字段保留
      expect(loaded.version).toBe(4);
      expect(loaded.playerName).toBe('过渡玩家');
      expect(loaded.coins).toBe(321);
      expect(loaded.isVip).toBe(true);
      expect(loaded.defeatedBossIds).toEqual(['shadow_overlord']);
      expect(loaded.unlockedMaps).toEqual(['rainbow_city', 'beach']);
      expect(loaded.pokeballs).toBe(7);
      expect(loaded.playerPets.length).toBe(1);
      expect(loaded.playerPets[0]?.petId).toBe('flame_puppy');
      expect(loaded.playerPets[0]?.level).toBe(12);
      expect(loaded.playerPets[0]?.currentHp).toBe(40);

      // v3 新字段全部取默认值；v2.pokeballs=7 迁移并入 inventory。
      expect(loaded.inventory).toEqual({ pokeball_normal: 7 });
      expect(loaded.homeLayout).toEqual([]);
      expect(loaded.questStates).toEqual({});
      expect(loaded.vip).toEqual({ lastCheckinDate: null, checkinStreak: 0 });
      expect(loaded.settings).toEqual({ bgmVolume: 0.6, sfxVolume: 0.8 });
      expect(loaded.dailyContext).toEqual({
        lastRolledDate: null,
        shopDiscountIds: [],
        shopDiscountDate: null,
        dailyQuestIds: [],
      });

      // localStorage 已被回写成 v3 JSON
      const persisted = ls.getItem(SAVE_KEY);
      expect(persisted).not.toBeNull();
      const parsed = JSON.parse(persisted as string) as { version: number };
      expect(parsed.version).toBe(4);
    });

    it('v1→v2→v3 链式迁移：一次 load 即可完成双步升级并写回 v3', () => {
      const v1: PlayerSaveV1 = {
        version: 1,
        playerName: '链式迁移',
        coins: 42,
        isVip: false,
        ownedPetIds: ['flame_puppy'],
        defeatedBossIds: [],
        lastSavedAt: 9999,
      };
      const ls = globalThis.localStorage;
      ls.setItem(SAVE_KEY, JSON.stringify(v1));

      const loaded = load();
      expect(loaded.version).toBe(4);
      expect(loaded.playerName).toBe('链式迁移');
      expect(loaded.coins).toBe(42);
      // 链式迁移：v1 没有 pokeballs，migrateV1ToV2 发 10 颗默认，迁 v3 时写入 inventory。
      expect(loaded.inventory).toEqual({ pokeball_normal: 10 });
      expect(loaded.settings.bgmVolume).toBe(0.6);

      // 第二次 load 应该直接走 v3 快路径，不再重复迁移
      const persistedRaw = ls.getItem(SAVE_KEY);
      expect(persistedRaw).not.toBeNull();
      const persisted = JSON.parse(persistedRaw as string) as { version: number };
      expect(persisted.version).toBe(4);

      const second = load();
      expect(second.version).toBe(4);
      expect(second.coins).toBe(42);
    });

    it('migrateV2ToV3 纯函数：不修改入参对象（也不共享引用给数组/对象子字段）', () => {
      const v2 = makeValidV2();
      const v2Clone = JSON.parse(JSON.stringify(v2)) as PlayerSaveV2;
      const v3 = migrateV2ToV3(v2);

      // 入参没有被污染
      expect(v2).toEqual(v2Clone);

      // playerPets / defeatedBossIds / unlockedMaps 都是新引用
      expect(v3.playerPets).not.toBe(v2.playerPets);
      expect(v3.defeatedBossIds).not.toBe(v2.defeatedBossIds);
      expect(v3.unlockedMaps).not.toBe(v2.unlockedMaps);

      // 修改 v3 的新字段不影响 v2
      v3.inventory['potion_small'] = 5;
      v3.homeLayout.push({ itemId: 'furn_bed', gridX: 0, gridY: 0, rotation: 0 });
      expect((v2 as unknown as { inventory?: unknown }).inventory).toBeUndefined();
      expect((v2 as unknown as { homeLayout?: unknown }).homeLayout).toBeUndefined();
    });

    // ---- FEAT-304：v2.pokeballs 并入 inventory + dailyContext 初始态 ----

    it('migrateV2ToV3：v2.pokeballs>0 并入 inventory[pokeball_normal]（不双倒）', () => {
      const v2 = makeValidV2({ pokeballs: 7 });
      const v3 = migrateV2ToV3(v2);
      expect(v3.inventory['pokeball_normal']).toBe(7);
      // 兼容字段仍被保留，但语义已被 inventory 接管
      expect(v3.pokeballs).toBe(7);
    });

    it('migrateV2ToV3：v2.pokeballs=0 时 inventory 不写入 pokeball_normal 键', () => {
      const v2 = makeValidV2({ pokeballs: 0 });
      const v3 = migrateV2ToV3(v2);
      expect(v3.inventory['pokeball_normal']).toBeUndefined();
      expect(Object.keys(v3.inventory).length).toBe(0);
    });

    it('migrateV2ToV3：dailyContext 初始 shopDiscountIds / dailyQuestIds 为空数组', () => {
      const v2 = makeValidV2();
      const v3 = migrateV2ToV3(v2);
      expect(v3.dailyContext.shopDiscountIds).toEqual([]);
      expect(v3.dailyContext.shopDiscountDate).toBeNull();
      expect(v3.dailyContext.dailyQuestIds).toEqual([]);
      expect(v3.dailyContext.lastRolledDate).toBeNull();
    });

    it('migrateV3ToV4：超过 6 只的旧队伍会拆分到精灵仓库', () => {
      const template = makeValidV2().playerPets[0]!;
      const ids = [
        'flame_puppy',
        'aqua_turtle',
        'spark_mouse',
        'leaf_sprite',
        'dew_sprite',
        'stone_calf',
        'sunny_puppy',
      ];
      const v3: PlayerSaveV3 = migrateV2ToV3(
        makeValidV2({
          playerPets: ids.map((petId, index) => ({
            ...template,
            petId,
            level: 5 + index,
            learnedSkillIds: [...template.learnedSkillIds],
            currentStats: { ...template.currentStats },
          })),
        }),
      );

      const v4 = migrateV3ToV4(v3);
      expect(v4.version).toBe(4);
      expect(v4.playerPets.map((p) => p.petId)).toEqual(ids.slice(0, 6));
      expect(v4.petStorage.map((p) => p.petId)).toEqual(['sunny_puppy']);
    });
  });
});
