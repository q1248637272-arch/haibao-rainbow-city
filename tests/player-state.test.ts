import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import { gameEvents } from '@/systems/EventBus';
import { CAI_XUKUN_THIRD_EVOLUTION_ITEM_ID } from '@/systems/EvolutionSystem';
import { expToNext } from '@/systems/LevelCurve';
import { createPlayerPet } from '@/systems/PetInstance';
import { getPetNature } from '@/systems/PetNature';
import { PlayerState } from '@/systems/PlayerState';
import { clear, load } from '@/systems/SaveManager';

import { installMemoryLocalStorage, uninstallLocalStorage } from './_helpers/localStorage';

describe('PlayerState 单例', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    clear();
    PlayerState.resetToDefault();
    gameEvents.clear();
  });

  afterEach(() => {
    gameEvents.clear();
    uninstallLocalStorage();
  });

  it('默认存档加载后 isVip=false 且携带 2 只 Lv8 起始精灵', () => {
    PlayerState.init();
    expect(PlayerState.isVip()).toBe(false);
    expect(PlayerState.hasPet('flame_puppy')).toBe(true);
    expect(PlayerState.hasPet('aqua_turtle')).toBe(true);
    expect(PlayerState.hasPet('rainbow_wing')).toBe(false);

    const flame = PlayerState.getPlayerPet('flame_puppy');
    expect(flame).toBeDefined();
    expect(flame?.level).toBe(8);
    expect(flame?.exp).toBe(0);
    expect(flame?.instanceId).toMatch(/^inst_flame_puppy_/);
    expect(getPetNature(flame?.natureId).id).toBe(flame?.natureId);
  });

  it('grantVip() 后 isVip=true，emit player:vip 且持久化后重新 load 仍为 VIP', () => {
    let vipEmitted = 0;
    gameEvents.on('player:vip', () => {
      vipEmitted += 1;
    });
    PlayerState.init();
    PlayerState.grantVip();
    expect(PlayerState.isVip()).toBe(true);
    expect(vipEmitted).toBe(1);

    // 重复 grantVip 应幂等，不再 emit
    PlayerState.grantVip();
    expect(vipEmitted).toBe(1);

    // 从 localStorage 重新加载，仍应是 VIP
    const loaded = load();
    expect(loaded.isVip).toBe(true);
  });

  it('addCoins / addPet / markBossDefeated 会自动 persist 并 emit save:updated', () => {
    let saveEmitted = 0;
    gameEvents.on('save:updated', () => {
      saveEmitted += 1;
    });
    PlayerState.init();
    const before = saveEmitted;

    PlayerState.addCoins(50);
    PlayerState.addPet('spark_mouse');
    PlayerState.markBossDefeated('shadow_overlord');

    expect(PlayerState.getCoins()).toBe(150);
    expect(PlayerState.hasPet('spark_mouse')).toBe(true);
    expect(PlayerState.hasDefeatedBoss('shadow_overlord')).toBe(true);
    expect(saveEmitted).toBe(before + 3);

    // 再次 addPet 同一 id 应幂等
    PlayerState.addPet('spark_mouse');
    expect(PlayerState.hasPet('spark_mouse')).toBe(true);

    // addPet shim 应构造出 Lv5 PlayerPet
    const sparkMouse = PlayerState.getPlayerPet('spark_mouse');
    expect(sparkMouse?.level).toBe(5);
    expect(sparkMouse?.currentHp).toBe(sparkMouse?.currentStats.hp);
  });

  it('addCoins 不会让彩虹币变为负数', () => {
    PlayerState.init();
    PlayerState.addCoins(-9999);
    expect(PlayerState.getCoins()).toBe(0);
  });

  it('Cai Xukun third evolution requires and consumes the Ji Ni Tai Mei token', () => {
    PlayerState.init();
    PlayerState.addPlayerPet({
      petId: 'cai_xukun',
      level: 32,
      exp: 0,
      learnedSkillIds: ['dance_kick', 'rhythm_pose', 'spark_bolt', 'magnet_flash'],
      evolutionStage: 1,
      currentStats: { hp: 1, atk: 1, def: 1, spd: 1 },
      currentHp: 1,
    });

    expect(PlayerState.evolvePet('cai_xukun')).toBe(false);
    PlayerState.addItem(CAI_XUKUN_THIRD_EVOLUTION_ITEM_ID, 1);
    expect(PlayerState.evolvePet('cai_xukun')).toBe(true);
    expect(PlayerState.getItemCount(CAI_XUKUN_THIRD_EVOLUTION_ITEM_ID)).toBe(0);
    expect(PlayerState.getPlayerPet('cai_xukun')?.evolutionStage).toBe(2);
  });

  it('setActivePet 会把已拥有精灵移到队伍首位；healPet 恢复生命', () => {
    PlayerState.init();
    expect(PlayerState.snapshot().playerPets[0]?.petId).toBe('flame_puppy');

    expect(PlayerState.setActivePet('aqua_turtle')).toBe(true);
    expect(PlayerState.snapshot().playerPets[0]?.petId).toBe('aqua_turtle');
    expect(PlayerState.setActivePet('missing_pet')).toBe(false);

    const turtle = PlayerState.getPlayerPet('aqua_turtle')!;
    turtle.currentHp = 1;
    PlayerState.persist();
    expect(PlayerState.healPet('aqua_turtle')).toBe(true);
    expect(PlayerState.getPlayerPet('aqua_turtle')?.currentHp).toBe(turtle.currentStats.hp);
    expect(PlayerState.healPet('missing_pet')).toBe(false);
  });

  describe('等级与经验', () => {
    it('gainExp 基本升级：累积超过 expToNext(level) 时 level+1 且 exp 扣减', () => {
      PlayerState.init();
      const pp = PlayerState.getPlayerPet('flame_puppy');
      expect(pp).toBeDefined();
      const startLevel = pp!.level;

      // 给刚好升一级再多 8 点经验，应升 1 级并保留 8 点经验。
      const delta = expToNext(startLevel) + 8;
      const r = PlayerState.gainExp('flame_puppy', delta);
      expect(r).not.toBeNull();
      expect(r?.leveledUp).toBe(true);
      expect(r?.newLevel).toBe(startLevel + 1);

      const after = PlayerState.getPlayerPet('flame_puppy');
      expect(after?.level).toBe(startLevel + 1);
      expect(after?.exp).toBe(8);
    });

    it('gainExp 跨多级：一次性给巨量经验时会连续升级', () => {
      PlayerState.init();
      const pp = PlayerState.getPlayerPet('flame_puppy');
      const startLevel = pp!.level;
      const spent =
        expToNext(startLevel) + expToNext(startLevel + 1) + expToNext(startLevel + 2);
      const r = PlayerState.gainExp('flame_puppy', spent + 20);
      expect(r?.leveledUp).toBe(true);
      expect(r?.newLevel).toBe(startLevel + 3);
      const after = PlayerState.getPlayerPet('flame_puppy');
      expect(after?.level).toBe(startLevel + 3);
      expect(after?.exp).toBe(20);
    });

    it('gainExp 对未知 petId 返回 null；对 0/负 delta 返回 no-op 结果', () => {
      PlayerState.init();
      expect(PlayerState.gainExp('nonexistent', 100)).toBeNull();

      const pp = PlayerState.getPlayerPet('flame_puppy');
      const startLv = pp!.level;
      const startExp = pp!.exp;
      const r0 = PlayerState.gainExp('flame_puppy', 0);
      expect(r0?.leveledUp).toBe(false);
      expect(r0?.newLevel).toBe(startLv);
      const afterZero = PlayerState.getPlayerPet('flame_puppy');
      expect(afterZero?.exp).toBe(startExp);
    });

    it('升级到 Lv10 / Lv15 时按 skillIds 顺序解锁 learnedSkillIds', () => {
      PlayerState.init();
      const pet = PETS['flame_puppy'];
      expect(pet).toBeDefined();
      expect(pet!.skillIds.length).toBeGreaterThanOrEqual(3); // ember_spark / flame_burst / flame_rush

      const pp = PlayerState.getPlayerPet('flame_puppy');
      // Lv8 起始：应已学会前 2 条（Lv1 1 条，Lv5 又 +1）
      expect(pp?.learnedSkillIds.length).toBe(2);
      expect(pp?.learnedSkillIds[0]).toBe(pet!.skillIds[0]);
      expect(pp?.learnedSkillIds[1]).toBe(pet!.skillIds[1]);

      // 推到 Lv10：应解锁第 3 条（如果 skillIds 有）
      const toLv10 = Array.from({ length: 10 - pp!.level }, (_unused, index) =>
        expToNext(pp!.level + index),
      ).reduce((sum, n) => sum + n, 0);
      const r = PlayerState.gainExp('flame_puppy', toLv10);
      expect(r?.newLevel).toBe(10);
      const at10 = PlayerState.getPlayerPet('flame_puppy');
      expect(at10?.learnedSkillIds.length).toBe(Math.min(pet!.skillIds.length, 3));
      if (pet!.skillIds.length >= 3) {
        expect(at10?.learnedSkillIds[2]).toBe(pet!.skillIds[2]);
      }
    });

    it('升级时 HP 上限增长且 currentHp 按差值补血', () => {
      PlayerState.init();
      const pp = PlayerState.getPlayerPet('flame_puppy');
      const maxBefore = pp!.currentStats.hp;
      // 故意把它打残：currentHp = 1
      pp!.currentHp = 1;
      PlayerState.persist();

      const delta = expToNext(pp!.level);
      const r = PlayerState.gainExp('flame_puppy', delta);
      expect(r?.leveledUp).toBe(true);

      const after = PlayerState.getPlayerPet('flame_puppy');
      expect(after!.currentStats.hp).toBeGreaterThan(maxBefore);
      const hpGain = after!.currentStats.hp - maxBefore;
      expect(after?.currentHp).toBe(1 + hpGain);
    });

    /**
     * v1 review major #3 回归：Lv100 封顶时 exp 归零路径必须一致。
     *
     * 旧实现的循环外 `if (pp.level >= 100) pp.exp = 0` 有两条故障路径：
     *   A) Lv99 一次吃 200 exp 跳 Lv100，循环退出后外部 if 把溢出 exp 全部归零；
     *   B) 玩家已 Lv100，再 gainExp(5)：循环条件 false 立刻退出，外部 if 再次把 delta 归零。
     * 新实现两条路径都在跨到 Lv100 时 break 并归零，不再二次写 exp。
     */
    describe('Lv100 封顶（v1 review major #3）', () => {
      it('Lv99→Lv100 跨级：溢出 exp 被丢弃，等级定格 100，不再累积', () => {
        PlayerState.init();
        const pp = PlayerState.getPlayerPet('flame_puppy')!;
        pp.level = 99;
        pp.exp = 0;
        PlayerState.persist();

        // expToNext(99) = 20 + 98*8 = 804；给 1000 → 升到 Lv100 且溢出 196 被丢弃
        const r = PlayerState.gainExp('flame_puppy', 1000);
        expect(r?.leveledUp).toBe(true);
        expect(r?.newLevel).toBe(100);

        const after = PlayerState.getPlayerPet('flame_puppy');
        expect(after?.level).toBe(100);
        expect(after?.exp).toBe(0);
      });

      it('已 Lv100 再 gainExp 正值：exp 保持 0，level 保持 100，leveledUp=false', () => {
        PlayerState.init();
        const pp = PlayerState.getPlayerPet('flame_puppy')!;
        pp.level = 100;
        pp.exp = 0;
        pp.currentStats = { ...pp.currentStats };
        PlayerState.persist();

        const r = PlayerState.gainExp('flame_puppy', 5000);
        expect(r?.leveledUp).toBe(false);
        expect(r?.newLevel).toBe(100);

        const after = PlayerState.getPlayerPet('flame_puppy');
        expect(after?.level).toBe(100);
        expect(after?.exp).toBe(0);
      });

      it('Lv99 exp 已累积时一次小 delta 仍升到 Lv100 并归零', () => {
        PlayerState.init();
        const pp = PlayerState.getPlayerPet('flame_puppy')!;
        pp.level = 99;
        pp.exp = 800; // 距 expToNext(99)=804 只差 4
        PlayerState.persist();

        const r = PlayerState.gainExp('flame_puppy', 10);
        expect(r?.leveledUp).toBe(true);
        expect(r?.newLevel).toBe(100);

        const after = PlayerState.getPlayerPet('flame_puppy');
        expect(after?.level).toBe(100);
        expect(after?.exp).toBe(0);
      });
    });
  });

  describe('addPlayerPet 多个同种个体', () => {
    it('对已拥有 id 调用 addPlayerPet 会新增一只独立个体，不覆盖原有精灵', () => {
      PlayerState.init();
      const before = PlayerState.getPlayerPet('flame_puppy')!;
      const snapshot = {
        instanceId: before.instanceId,
        level: before.level,
        exp: before.exp,
        currentHp: before.currentHp,
        skills: [...before.learnedSkillIds],
      };
      const pet = PETS['flame_puppy']!;
      const placement = PlayerState.addPlayerPet(
        createPlayerPet(pet, 12, { natureId: 'brave' }),
      );

      const after = PlayerState.getPlayerPet('flame_puppy');
      expect(after).toBeDefined();
      expect(after?.instanceId).toBe(snapshot.instanceId);
      expect(after?.level).toBe(snapshot.level);
      expect(after?.exp).toBe(snapshot.exp);
      expect(after?.currentHp).toBe(snapshot.currentHp);
      expect(after?.learnedSkillIds).toEqual(snapshot.skills);
      expect(placement).toBe('party');
      const copies = PlayerState.snapshot().playerPets.filter((p) => p.petId === 'flame_puppy');
      expect(copies).toHaveLength(2);
      expect(new Set(copies.map((p) => p.instanceId)).size).toBe(2);
      expect(copies[1]?.natureId).toBe('brave');
    });
  });

  describe('精灵仓库', () => {
    it('队伍满 6 只后，新收服的精灵会进入仓库', () => {
      PlayerState.init();
      for (const id of ['spark_mouse', 'leaf_sprite', 'dew_sprite', 'stone_calf', 'sunny_puppy']) {
        PlayerState.addPet(id);
      }

      const save = PlayerState.snapshot();
      expect(save.playerPets.length).toBe(6);
      expect(save.petStorage.map((p) => p.petId)).toEqual(['sunny_puppy']);
      expect(PlayerState.hasPet('sunny_puppy')).toBe(true);
    });

    it('仓库精灵调入队伍时，队伍满则和末位精灵交换', () => {
      PlayerState.init();
      for (const id of ['spark_mouse', 'leaf_sprite', 'dew_sprite', 'stone_calf', 'sunny_puppy']) {
        PlayerState.addPet(id);
      }

      const result = PlayerState.movePetToParty('sunny_puppy');
      expect(result.ok).toBe(true);
      expect(result.swappedPetId).toBe('stone_calf');
      expect(PlayerState.snapshot().playerPets.map((p) => p.petId)).toContain('sunny_puppy');
      expect(PlayerState.getPetStorage().map((p) => p.petId)).toContain('stone_calf');
    });
  });

  describe('精灵球', () => {
    it('默认存档精灵球数量为 10', () => {
      PlayerState.init();
      expect(PlayerState.getPokeballs()).toBe(10);
    });

    it('addPokeballs 与 consumePokeball 行为正确', () => {
      PlayerState.init();
      PlayerState.addPokeballs(5);
      expect(PlayerState.getPokeballs()).toBe(15);

      for (let i = 0; i < 15; i++) {
        expect(PlayerState.consumePokeball()).toBe(true);
      }
      expect(PlayerState.getPokeballs()).toBe(0);

      // 0 颗时消费失败
      expect(PlayerState.consumePokeball()).toBe(false);
      expect(PlayerState.getPokeballs()).toBe(0);

      // 减到负数会被钳回 0
      PlayerState.addPokeballs(-9999);
      expect(PlayerState.getPokeballs()).toBe(0);
    });
  });

  // ---- v3 新 API（FEAT-300）---------------------------------------------

  describe('背包（inventory，FEAT-300）', () => {
    it('默认背包含 10 颗 pokeball_normal（v3 起与精灵球共用库存）；addItem / removeItem 正常路径与幂等归零', () => {
      PlayerState.init();
      // FEAT-304：默认起始 10 颗普通精灵球直接落在 inventory 里。
      expect(PlayerState.getInventory()).toEqual({ pokeball_normal: 10 });
      expect(PlayerState.getItemCount('potion_small')).toBe(0);

      let saveEmitted = 0;
      gameEvents.on('save:updated', () => {
        saveEmitted += 1;
      });

      PlayerState.addItem('potion_small', 3);
      PlayerState.addItem('potion_small', 2);
      expect(PlayerState.getItemCount('potion_small')).toBe(5);
      expect(PlayerState.getInventory()).toEqual({ pokeball_normal: 10, potion_small: 5 });
      expect(saveEmitted).toBe(2);

      // 部分扣除保留剩余库存
      const ok1 = PlayerState.removeItem('potion_small', 2);
      expect(ok1).toBe(true);
      expect(PlayerState.getItemCount('potion_small')).toBe(3);

      // 扣到恰好归零：inventory 键会被清理掉
      const ok2 = PlayerState.removeItem('potion_small', 3);
      expect(ok2).toBe(true);
      expect(PlayerState.getItemCount('potion_small')).toBe(0);
      expect(PlayerState.getInventory()).toEqual({ pokeball_normal: 10 });

      // 再次 removeItem（库存不足）返回 false 且不 persist
      const before = saveEmitted;
      const ok3 = PlayerState.removeItem('potion_small', 1);
      expect(ok3).toBe(false);
      expect(saveEmitted).toBe(before);

      // quantity <= 0 视为 no-op
      const baseline = saveEmitted;
      PlayerState.addItem('pokeball_basic', 0);
      PlayerState.addItem('pokeball_basic', -5);
      expect(saveEmitted).toBe(baseline);
      expect(PlayerState.getItemCount('pokeball_basic')).toBe(0);
      // removeItem(<=0) 按契约返回 true 但不写盘
      expect(PlayerState.removeItem('pokeball_basic', 0)).toBe(true);
      expect(saveEmitted).toBe(baseline);
    });

    it('getInventory 返回浅拷贝：外部修改不会污染内部存档', () => {
      PlayerState.init();
      PlayerState.addItem('material_shell', 4);
      const snap = PlayerState.getInventory() as Record<string, number>;
      snap['material_shell'] = 9999;
      expect(PlayerState.getItemCount('material_shell')).toBe(4);
    });
  });

  describe('任务状态（questStates，FEAT-300）', () => {
    it('setQuestState 写入并读出相同 shape；progress 对象不共享引用', () => {
      PlayerState.init();
      expect(PlayerState.getQuestState('main_open_rainbow_city')).toBeUndefined();

      const progress = { shadow_overlord: 1 };
      PlayerState.setQuestState('main_open_rainbow_city', {
        status: 'active',
        progress,
        updatedAt: 1234,
      });
      const read = PlayerState.getQuestState('main_open_rainbow_city');
      expect(read).toBeDefined();
      expect(read?.status).toBe('active');
      expect(read?.progress).toEqual({ shadow_overlord: 1 });
      expect(read?.updatedAt).toBe(1234);

      // 修改原 progress 不影响落盘的 state
      progress.shadow_overlord = 99;
      const read2 = PlayerState.getQuestState('main_open_rainbow_city');
      expect(read2?.progress['shadow_overlord']).toBe(1);

      // 覆写 completed 再读
      PlayerState.setQuestState('main_open_rainbow_city', {
        status: 'completed',
        progress: {},
        updatedAt: 5678,
      });
      expect(PlayerState.getQuestState('main_open_rainbow_city')?.status).toBe('completed');
    });
  });

  describe('VIP 签到（FEAT-300）', () => {
    it('默认 VIP 快照空白；setCheckinState 写盘后 load 能读回', () => {
      PlayerState.init();
      expect(PlayerState.getVipSnapshot()).toEqual({
        lastCheckinDate: null,
        checkinStreak: 0,
      });

      PlayerState.setCheckinState({ lastCheckinDate: '2025-01-15', checkinStreak: 3 });
      expect(PlayerState.getVipSnapshot()).toEqual({
        lastCheckinDate: '2025-01-15',
        checkinStreak: 3,
      });

      // load 重新走 SaveManager.load() 应能取回
      const reloaded = load();
      expect(reloaded.vip).toEqual({ lastCheckinDate: '2025-01-15', checkinStreak: 3 });
    });

    /**
     * FEAT-305 回归：VipPanelScene 的签到回调会连续调 setCheckinState / addCoins / addItem，
     * 这里校验这三个 API 串起来后快照一致（签到天数 + 金币 + 背包条目都正确累加）。
     */
    it('签到场景常用路径：setCheckinState + addCoins + addItem 正确累加到存档', () => {
      PlayerState.init();
      const coinsBefore = PlayerState.getCoins();

      // 模拟 VipPanelScene.onCheckin 的串行写入
      PlayerState.setCheckinState({ lastCheckinDate: '2025-02-03', checkinStreak: 1 });
      PlayerState.addCoins(200);
      PlayerState.addItem('pokeball_normal', 1);
      PlayerState.addItem('potion_small', 1);

      expect(PlayerState.getVipSnapshot()).toEqual({
        lastCheckinDate: '2025-02-03',
        checkinStreak: 1,
      });
      expect(PlayerState.getCoins()).toBe(coinsBefore + 200);
      // 默认存档已含 pokeball_normal=10，再 +1=11
      expect(PlayerState.getItemCount('pokeball_normal')).toBe(11);
      expect(PlayerState.getItemCount('potion_small')).toBe(1);

      // 重新 load 一次应完全一致（验证写盘路径）
      const reloaded = load();
      expect(reloaded.vip.checkinStreak).toBe(1);
      expect(reloaded.coins).toBe(coinsBefore + 200);
      expect(reloaded.inventory['potion_small']).toBe(1);
      expect(reloaded.inventory['pokeball_normal']).toBe(11);
    });
  });

  describe('设置（settings，FEAT-300）', () => {
    it('默认音量 0.6 / 0.8；setBgmVolume 夹紧到 [0,1]', () => {
      PlayerState.init();
      expect(PlayerState.getSettings()).toEqual({ bgmVolume: 0.6, sfxVolume: 0.8 });

      PlayerState.setBgmVolume(0.4);
      expect(PlayerState.getSettings().bgmVolume).toBe(0.4);

      PlayerState.setBgmVolume(-5);
      expect(PlayerState.getSettings().bgmVolume).toBe(0);

      PlayerState.setBgmVolume(42);
      expect(PlayerState.getSettings().bgmVolume).toBe(1);

      PlayerState.setBgmVolume(Number.NaN);
      expect(PlayerState.getSettings().bgmVolume).toBe(0);

      // setSfxVolume 不影响 bgm
      PlayerState.setBgmVolume(0.7);
      PlayerState.setSfxVolume(2);
      expect(PlayerState.getSettings()).toEqual({ bgmVolume: 0.7, sfxVolume: 1 });
    });

    it('可以保存主角性别切换，且音量设置不会覆盖性别', () => {
      PlayerState.init();
      expect(PlayerState.getPlayerGender()).toBe('female');

      PlayerState.setPlayerGender('male');
      expect(PlayerState.getPlayerGender()).toBe('male');

      PlayerState.setBgmVolume(0.35);
      PlayerState.setSfxVolume(0.45);
      expect(PlayerState.getPlayerGender()).toBe('male');

      const reloaded = load();
      expect(reloaded.settings.playerGender).toBe('male');
    });
  });

  describe('家园布局（homeLayout，FEAT-300）', () => {
    it('setHomeLayout 深拷贝入参；getHomeLayout 返回浅拷贝', () => {
      PlayerState.init();
      expect(PlayerState.getHomeLayout()).toEqual([]);

      const src = [
        { itemId: 'furn_bed', gridX: 1, gridY: 2, rotation: 0 as const },
        { itemId: 'furn_lamp', gridX: 5, gridY: 3, rotation: 90 as const },
      ];
      PlayerState.setHomeLayout(src);

      // 外部修改源数组不影响存档
      src.pop();
      expect(PlayerState.getHomeLayout().length).toBe(2);

      // 返回的数组可以被安全修改
      const snap = PlayerState.getHomeLayout() as unknown as Array<{ itemId: string }>;
      snap.pop();
      expect(PlayerState.getHomeLayout().length).toBe(2);
    });
  });

  describe('每日上下文（dailyContext，FEAT-300）', () => {
    it('setDailyContext 写入后 getDailyContext 能读回，数组字段浅拷贝', () => {
      PlayerState.init();
      expect(PlayerState.getDailyContext()).toEqual({
        lastRolledDate: null,
        shopDiscountIds: [],
        shopDiscountDate: null,
        dailyQuestIds: [],
      });

      const shopIds = ['potion_small', 'pokeball_basic'];
      PlayerState.setDailyContext({
        lastRolledDate: '2025-03-01',
        shopDiscountIds: shopIds,
        shopDiscountDate: '2025-03-02',
        dailyQuestIds: ['daily_catch_3'],
      });

      // 外部修改源数组不污染
      shopIds.push('intruder');
      const read = PlayerState.getDailyContext();
      expect(read.lastRolledDate).toBe('2025-03-01');
      expect(read.shopDiscountIds).toEqual(['potion_small', 'pokeball_basic']);
      expect(read.shopDiscountDate).toBe('2025-03-02');
      expect(read.dailyQuestIds).toEqual(['daily_catch_3']);
    });
  });
});
