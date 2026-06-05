import { PETS } from '@/data/pets';
import { skillIdsForLevel } from '@/data/petLearnsets';
import type {
  DailyContext,
  FurniturePlacement,
  PetData,
  PlayerGender,
  PlayerPet,
  PlayerSave,
  PlayerSettings,
  QuestState,
  VipSnapshot,
} from '@/types';

import { gameEvents } from './EventBus';
import {
  canEvolve,
  getEvolutionStage,
  requiredEvolutionItem,
} from './EvolutionSystem';
import { expToNext } from './LevelCurve';
import {
  computePlayerPetStats,
  createPlayerPet,
  normalizePlayerPetForRuntime,
} from './PetInstance';
import { improvePetTalent, talentStatLabel } from './PetTalent';
import { SaveManager } from './SaveManager';

/**
 * 等级系统升级的返回结构（`gainExp` 输出）。
 *
 * - `leveledUp` 表示这次 gainExp 调用内是否至少发生了一次升级；
 * - `newLevel` 是扣完 exp 后的当前等级（不管有没有升都给，方便 UI 直接读）。
 */
export interface GainExpResult {
  leveledUp: boolean;
  newLevel: number;
}

export const PARTY_PET_LIMIT = 6;

export type AddPetPlacement = 'party' | 'storage' | 'duplicate';

export interface MovePetResult {
  readonly ok: boolean;
  readonly swappedPetId?: string;
}

export interface TrainTalentResult {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * 玩家运行时状态单例。
 *
 * 写入方法内部会自动 persist（写 localStorage + emit save:updated）。
 * FEAT-205 起，队伍以 `PlayerPet` 为单位：每只带 level/exp/learnedSkillIds 等状态。
 * `hasPet(id)` / `addPet(id)` 两个旧 API 作为兼容 shim 保留，内部委托给新 API，
 * 这样 GymScene 的"领取 VIP 送彩虹光翼"调用点无需改动。
 */
class PlayerStateImpl {
  private save: PlayerSave | null = null;

  /**
   * 从 SaveManager 加载存档。可多次调用，后者覆盖前者（主要便于测试）。
   */
  init(): void {
    this.save = SaveManager.load();
  }

  /**
   * 取当前 save 引用。未 init 时自动 init，保证始终有值。
   */
  private ensure(): PlayerSave {
    if (!this.save) {
      this.save = SaveManager.load();
    }
    return this.save;
  }

  private collectPetInstanceIds(save: PlayerSave): Set<string> {
    const ids = new Set<string>();
    for (const pet of [...save.playerPets, ...save.petStorage]) {
      if (pet.instanceId) ids.add(pet.instanceId);
    }
    return ids;
  }

  private matchesPetKey(pet: PlayerPet, key: string): boolean {
    return pet.instanceId === key || pet.petId === key;
  }

  private findPetByKey(
    key: string,
  ): { readonly pet: PlayerPet; readonly shelf: 'party' | 'storage'; readonly index: number } | null {
    const s = this.ensure();
    const partyIndex = s.playerPets.findIndex((p) => this.matchesPetKey(p, key));
    if (partyIndex >= 0) {
      const pet = s.playerPets[partyIndex];
      return pet ? { pet, shelf: 'party', index: partyIndex } : null;
    }
    const storageIndex = s.petStorage.findIndex((p) => this.matchesPetKey(p, key));
    if (storageIndex >= 0) {
      const pet = s.petStorage[storageIndex];
      return pet ? { pet, shelf: 'storage', index: storageIndex } : null;
    }
    return null;
  }

  getCoins(): number {
    return this.ensure().coins;
  }

  /**
   * 增加（或减少，传负数）彩虹币。下限为 0。
   */
  addCoins(delta: number): void {
    const s = this.ensure();
    s.coins = Math.max(0, s.coins + delta);
    this.persist();
  }

  isVip(): boolean {
    return this.ensure().isVip;
  }

  /**
   * 授予 VIP 身份。幂等：已为 VIP 时不会重复 emit player:vip。
   */
  grantVip(): void {
    const s = this.ensure();
    if (s.isVip) return;
    s.isVip = true;
    this.persist();
    gameEvents.emit('player:vip');
  }

  // ---- 精灵队伍 API（v2）--------------------------------------------------

  /**
   * 按 id 取出玩家队伍中的一只精灵。
   *
   * 返回的是 `save.playerPets` 内部引用（非深拷贝），允许调用方（例如 BattleScene）
   * 直接原地修改 `currentHp`，再调用 `PlayerState.persist()` 写盘。需要不可变快照时用 `snapshot()`。
   */
  getPlayerPet(id: string): PlayerPet | undefined {
    const s = this.ensure();
    return s.playerPets.find((p) => p.petId === id) ?? s.petStorage.find((p) => p.petId === id);
  }

  getPlayerPetByInstanceId(instanceId: string): PlayerPet | undefined {
    const s = this.ensure();
    return (
      s.playerPets.find((p) => p.instanceId === instanceId) ??
      s.petStorage.find((p) => p.instanceId === instanceId)
    );
  }

  getPetStorage(): ReadonlyArray<PlayerPet> {
    return [...this.ensure().petStorage];
  }

  /**
   * 将某只已拥有精灵移到队伍首位，作为默认出战精灵。
   */
  setActivePet(petKey: string): boolean {
    const s = this.ensure();
    const idx = s.playerPets.findIndex((p) => this.matchesPetKey(p, petKey));
    if (idx < 0) return false;
    if (idx === 0) return true;
    const [pet] = s.playerPets.splice(idx, 1);
    if (!pet) return false;
    s.playerPets.unshift(pet);
    this.persist();
    return true;
  }

  /**
   * 恢复单只精灵生命值到当前等级上限。
   */
  healPet(petKey: string): boolean {
    const found = this.findPetByKey(petKey);
    if (!found) return false;
    if (found.pet.currentHp >= found.pet.currentStats.hp) return true;
    found.pet.currentHp = found.pet.currentStats.hp;
    this.persist();
    return true;
  }

  evolvePet(petKey: string): boolean {
    const found = this.findPetByKey(petKey);
    if (!found) return false;
    const pp = found.pet;
    if (!canEvolve(pp)) return false;
    const pet = PETS[pp.petId];
    if (!pet) return false;
    const requiredItemId = requiredEvolutionItem(pp);
    if (requiredItemId && this.getItemCount(requiredItemId) < 1) return false;
    if (requiredItemId && !this.removeItem(requiredItemId, 1)) return false;

    pp.evolutionStage = getEvolutionStage(pp) + 1;
    pp.currentStats = computePlayerPetStats(pet, pp.level, pp, pp.natureId, pp.talent);
    pp.currentHp = pp.currentStats.hp;
    pp.learnedSkillIds = skillIdsForLevel(pet.id, pp.level);
    this.persist();
    return true;
  }

  /**
   * 把一只构造好的 PlayerPet 加入队伍。
   *
   * - 同一种 `petId` 可以拥有多只；写入前会补齐独立个体编号和性格。
   * - 队伍未满时加入队伍，队伍满时进入仓库，并 persist + emit `save:updated`。
   *
   * 本方法不做 PETS 合法性校验（调用方应保证 `pp.petId` 存在于 PETS 表），
   * 让调用方能自由构造测试用的 PlayerPet。
   */
  addPlayerPet(pp: PlayerPet): AddPetPlacement {
    const s = this.ensure();
    const normalized = normalizePlayerPetForRuntime(pp, this.collectPetInstanceIds(s));
    const placement: AddPetPlacement = s.playerPets.length < PARTY_PET_LIMIT ? 'party' : 'storage';
    if (placement === 'party') {
      s.playerPets.push(normalized);
    } else {
      s.petStorage.push(normalized);
    }
    this.persist();
    return placement;
  }

  /**
   * 兼容 shim：判断玩家是否拥有该 id 的精灵。
   *
   * 语义与 v1 时代的 `hasPet` 等价，内部委托给 `getPlayerPet`。
   * 保留此 API 是为了避免修改 GymScene / computePetCardState 等旧调用点。
   */
  hasPet(id: string): boolean {
    return this.getPlayerPet(id) !== undefined;
  }

  movePetToParty(petKey: string): MovePetResult {
    const s = this.ensure();
    const idx = s.petStorage.findIndex((p) => this.matchesPetKey(p, petKey));
    if (idx < 0) return { ok: false };
    const [pet] = s.petStorage.splice(idx, 1);
    if (!pet) return { ok: false };

    let swappedPetId: string | undefined;
    if (s.playerPets.length < PARTY_PET_LIMIT) {
      s.playerPets.push(pet);
    } else {
      const swapIndex = Math.max(0, s.playerPets.length - 1);
      const [swapped] = s.playerPets.splice(swapIndex, 1, pet);
      if (swapped) {
        swappedPetId = swapped.petId;
        s.petStorage.push(swapped);
      }
    }
    this.persist();
    return swappedPetId ? { ok: true, swappedPetId } : { ok: true };
  }

  sendPetToStorage(petKey: string): boolean {
    const s = this.ensure();
    if (s.playerPets.length <= 1) return false;
    const idx = s.playerPets.findIndex((p) => this.matchesPetKey(p, petKey));
    if (idx < 0) return false;
    const [pet] = s.playerPets.splice(idx, 1);
    if (!pet) return false;
    s.petStorage.push(pet);
    this.persist();
    return true;
  }

  /**
   * 兼容 shim：按 id 添加一只 Lv5 精灵到队伍。
   *
   * 典型调用点：GymScene 的"领取 VIP"赠送彩虹光翼。
   * 未知 id（PETS 表找不到）时直接 no-op，不抛。内部走 `addPlayerPet` 路径。
   */
  addPet(id: string): void {
    if (this.hasPet(id)) return;
    const pet = PETS[id];
    if (!pet) return;
    const pp = this.makeLv5PlayerPet(pet);
    this.addPlayerPet(pp);
  }

  /**
   * 内部工具：按 Lv5 构造一只 PlayerPet，默认学前缀 2 条技能（Lv5 解锁第 2 条）。
   */
  private makeLv5PlayerPet(pet: PetData): PlayerPet {
    const level = 5;
    return createPlayerPet(pet, level, { evolutionStage: 0 });
  }

  // ---- 等级系统 ----------------------------------------------------------

  /**
   * 给 `petId` 指向的精灵发经验。
   *
   * - 若队伍中没有该 id → 返回 `null`；
   * - 否则 `exp += delta`，然后循环：只要 `exp >= expToNext(level)` 就扣掉该数并 `level += 1`，
   *   同时根据最新 level 重算 currentStats（HP 成长量自动补到 currentHp 上）；
   * - 每到 5 的倍数等级若 `PetData.skillIds` 里还有未学技能，追加到 `learnedSkillIds`。
   *
   * 这些变化会 persist + emit `save:updated`。返回 `{ leveledUp, newLevel }`。
   *
   * 边界：
   * - `delta <= 0`：不扣经验、不升级，直接返回 `{ leveledUp: false, newLevel }`（也不 persist）。
   *   这样方便调用方在 `expOnDefeat` 返回 0 时直接传进来而无副作用。
   * - PETS 表找不到 `petId`：同样 no-op 返回 `{ leveledUp: false, newLevel }`。
   */
  gainExp(petKey: string, delta: number): GainExpResult | null {
    const found = this.findPetByKey(petKey);
    if (!found) return null;
    const pp = found.pet;
    if (delta <= 0) return { leveledUp: false, newLevel: pp.level };

    const pet = PETS[pp.petId];
    if (!pet) return { leveledUp: false, newLevel: pp.level };

    let leveledUp = false;
    pp.exp += delta;

    // 若已经在封顶等级（>=100）：不累积经验，直接吞掉 delta 保持 exp=0，
    // 避免"Lv100 玩家吃经验后 exp 持续累加但永远没升级"的脏数据。
    if (pp.level >= 100) {
      pp.exp = 0;
      this.persist();
      return { leveledUp: false, newLevel: pp.level };
    }

    // 循环扣经验升级。两条退出路径：
    //   1. exp < expToNext(level) → 正常退出，exp 保留给下次；
    //   2. 升到 Lv100 → 立即 break 并把 exp 清零（封顶后不再累积溢出经验）。
    while (pp.exp >= expToNext(pp.level) && pp.level < 100) {
      pp.exp -= expToNext(pp.level);
      const oldMaxHp = pp.currentStats.hp;
      pp.level += 1;
      pp.currentStats = computePlayerPetStats(pet, pp.level, pp, pp.natureId, pp.talent);
      // HP 成长同步到 currentHp：多出的部分直接回血（贴合传统 RPG 体验）；
      // 残血比例不保留，避免"升级变更残血"感觉。
      const gainedHp = pp.currentStats.hp - oldMaxHp;
      pp.currentHp = Math.min(pp.currentStats.hp, pp.currentHp + Math.max(0, gainedHp));
      leveledUp = true;

      pp.learnedSkillIds = skillIdsForLevel(pet.id, pp.level);

      // Lv99→Lv100 的跨级：丢弃所有溢出经验，封顶后不再累积。
      if (pp.level >= 100) {
        pp.exp = 0;
        break;
      }
    }

    this.persist();
    return { leveledUp, newLevel: pp.level };
  }

  /**
   * 消耗一枚潜能星砂，提高当前个体最低的几项天赋之一。
   *
   * 这层养成借鉴经典页游宠物“天赋/资质”思路：同种精灵不再完全一样，
   * 玩家也能通过长期活动慢慢把喜欢的伙伴培养上去。
   */
  trainPetTalent(petKey: string, itemId = 'potential_seed'): TrainTalentResult {
    const found = this.findPetByKey(petKey);
    if (!found) return { ok: false, message: '没有找到这只精灵。' };
    const pet = PETS[found.pet.petId];
    if (!pet) return { ok: false, message: '这只精灵的数据还没有登记。' };
    if (this.getItemCount(itemId) < 1) {
      return { ok: false, message: '需要潜能星砂，去活动广场完成学院委托获得。' };
    }

    const trained = improvePetTalent(found.pet.talent);
    if (!trained.stat || trained.gained <= 0) {
      return { ok: false, message: '这只精灵的天赋已经练满了。' };
    }
    if (!this.removeItem(itemId, 1)) {
      return { ok: false, message: '潜能星砂不足。' };
    }

    const oldMaxHp = found.pet.currentStats.hp;
    found.pet.talent = trained.talent;
    found.pet.currentStats = computePlayerPetStats(
      pet,
      found.pet.level,
      found.pet,
      found.pet.natureId,
      found.pet.talent,
    );
    const hpGain = Math.max(0, found.pet.currentStats.hp - oldMaxHp);
    found.pet.currentHp = Math.min(found.pet.currentStats.hp, found.pet.currentHp + hpGain);
    this.persist();
    return {
      ok: true,
      message: `${pet.name} 的${talentStatLabel(trained.stat)}天赋提升了 ${trained.gained} 点。`,
    };
  }

  // ---- 精灵球 -----------------------------------------------------------

  /**
   * 精灵球库存。
   *
   * FEAT-304 起"普通精灵球" `pokeball_normal` 从独立的 `save.pokeballs` 字段
   * 迁移到 `save.inventory['pokeball_normal']`，让商店购买与战斗消耗共用同一份库存。
   * 本方法通过委托给 `getItemCount` 保持向后兼容的调用点（BattleScene 等）。
   */
  getPokeballs(): number {
    return this.getItemCount('pokeball_normal');
  }

  /**
   * 增加（传负数则减少）精灵球数量，下限 0。
   *
   * 内部委托给 `addItem` / `removeItem`，所有精灵球写入都会同步到 `inventory`。
   */
  addPokeballs(delta: number): void {
    if (delta === 0) return;
    if (delta > 0) {
      this.addItem('pokeball_normal', delta);
      return;
    }
    // 负数：最多只能扣到 0；当前不足则全部扣光。
    const have = this.getItemCount('pokeball_normal');
    const toRemove = Math.min(have, -delta);
    if (toRemove > 0) this.removeItem('pokeball_normal', toRemove);
  }

  /**
   * 消耗一颗精灵球。库存不足时返回 false 并不修改存档。
   */
  consumePokeball(): boolean {
    return this.removeItem('pokeball_normal', 1);
  }

  // ---- BOSS 进度 ---------------------------------------------------------

  hasDefeatedBoss(id: string): boolean {
    return this.ensure().defeatedBossIds.includes(id);
  }

  /**
   * 记录击败过的 BOSS id。幂等。
   */
  markBossDefeated(id: string): void {
    const s = this.ensure();
    if (s.defeatedBossIds.includes(id)) return;
    s.defeatedBossIds.push(id);
    this.persist();
  }

  // ---- 背包（FEAT-300 v3）------------------------------------------------

  /**
   * 只读返回当前物品库存。返回值是 save.inventory 的浅拷贝快照，
   * 调用方可以安全地展开 / 迭代而不会污染内部状态。
   */
  getInventory(): Readonly<Record<string, number>> {
    return { ...this.ensure().inventory };
  }

  /**
   * 取某件物品当前持有数量。未持有返回 0。
   */
  getItemCount(itemId: string): number {
    const inv = this.ensure().inventory;
    const n = inv[itemId];
    return typeof n === 'number' ? n : 0;
  }

  /**
   * 往背包里加入 `quantity` 件 `itemId`。
   *
   * - `quantity <= 0` 视为 no-op（既不写盘也不 emit），避免误用导致脏事件。
   * - 新加入的 id 会在 inventory 里新开一个键。
   * - 成功写入后 persist + emit save:updated。
   */
  addItem(itemId: string, quantity: number): void {
    if (quantity <= 0) return;
    const s = this.ensure();
    const current = s.inventory[itemId];
    s.inventory[itemId] = (typeof current === 'number' ? current : 0) + quantity;
    this.persist();
  }

  /**
   * 从背包里扣除 `quantity` 件 `itemId`。
   *
   * - 库存不足（`current < quantity`）时：返回 `false` 且**不修改**存档；
   * - 扣完后若归零则把键直接删除（让 `Object.keys(inventory).length` 准确反映 UI 可见条目数）；
   * - 成功扣除后 persist + emit save:updated。
   * - `quantity <= 0` 视为 no-op 并返回 `true`（没有要扣的东西，视为成功）。
   */
  removeItem(itemId: string, quantity: number): boolean {
    if (quantity <= 0) return true;
    const s = this.ensure();
    const current = s.inventory[itemId];
    const have = typeof current === 'number' ? current : 0;
    if (have < quantity) return false;
    const after = have - quantity;
    if (after <= 0) {
      delete s.inventory[itemId];
    } else {
      s.inventory[itemId] = after;
    }
    this.persist();
    return true;
  }

  // ---- VIP 签到 ----------------------------------------------------------

  /**
   * 取 VIP 签到快照（连续天数 / 上次签到日期）。返回引用即可，调用方不得修改。
   */
  getVipSnapshot(): VipSnapshot {
    return this.ensure().vip;
  }

  /**
   * 覆写 VIP 签到快照。由 VipSystem 纯函数算完新快照后回写进来。
   * 写入后 persist + emit save:updated。
   */
  setCheckinState(snapshot: VipSnapshot): void {
    const s = this.ensure();
    s.vip = { lastCheckinDate: snapshot.lastCheckinDate, checkinStreak: snapshot.checkinStreak };
    this.persist();
  }

  // ---- 设置（BGM/SFX 音量）-----------------------------------------------

  /**
   * 取音量设置快照（浅拷贝只读）。
   */
  getSettings(): PlayerSettings {
    const cur = this.ensure().settings;
    return { bgmVolume: cur.bgmVolume, sfxVolume: cur.sfxVolume };
  }

  getPlayerGender(): PlayerGender {
    return this.ensure().settings.playerGender === 'male' ? 'male' : 'female';
  }

  setPlayerGender(gender: PlayerGender): void {
    const s = this.ensure();
    s.settings = {
      ...s.settings,
      playerGender: gender === 'male' ? 'male' : 'female',
    };
    this.persist();
  }

  /**
   * 设置 BGM 音量。入参会被夹紧到 [0, 1]。写入后 persist。
   */
  setBgmVolume(volume: number): void {
    const s = this.ensure();
    const clamped = clamp01(volume);
    s.settings = { ...s.settings, bgmVolume: clamped };
    this.persist();
  }

  /**
   * 设置 SFX 音量。入参会被夹紧到 [0, 1]。写入后 persist。
   */
  setSfxVolume(volume: number): void {
    const s = this.ensure();
    const clamped = clamp01(volume);
    s.settings = { ...s.settings, sfxVolume: clamped };
    this.persist();
  }

  // ---- 家园布局 ----------------------------------------------------------

  /**
   * 取家园摆放列表的只读快照。返回的是数组浅拷贝，内部条目仍是 readonly shape。
   */
  getHomeLayout(): ReadonlyArray<FurniturePlacement> {
    return [...this.ensure().homeLayout];
  }

  /**
   * 覆写整个家园布局。由 HomeScene 拖拽结束后一次性回写整张布局，
   * 这样既避免"增删改"三个 API 重复造轮子，也让撤销/重做只需快照对比。
   *
   * 入参数组浅拷贝后落盘，防止外部后续修改源数组串改存档。
   */
  setHomeLayout(placements: ReadonlyArray<FurniturePlacement>): void {
    const s = this.ensure();
    s.homeLayout = placements.map((p) => ({
      itemId: p.itemId,
      gridX: p.gridX,
      gridY: p.gridY,
      rotation: p.rotation,
    }));
    this.persist();
  }

  // ---- 任务状态 ----------------------------------------------------------

  /**
   * 取某任务当前运行时状态。未初始化则返回 undefined（QuestEngine 会据此懒发布）。
   */
  getQuestState(id: string): QuestState | undefined {
    const states = this.ensure().questStates;
    return states[id];
  }

  /**
   * 覆写某任务状态。写入后 persist + emit save:updated。
   *
   * `state.progress` 做一层浅拷贝，避免调用方持有的引用被后续修改后反串存档。
   */
  setQuestState(id: string, state: QuestState): void {
    const s = this.ensure();
    s.questStates[id] = {
      status: state.status,
      progress: { ...state.progress },
      updatedAt: state.updatedAt,
    };
    this.persist();
  }

  // ---- 每日上下文 --------------------------------------------------------

  /**
   * 取每日滚动上下文（上次滚动日期 / 折扣 / 发布的每日任务 id）。
   */
  getDailyContext(): DailyContext {
    const c = this.ensure().dailyContext;
    return {
      lastRolledDate: c.lastRolledDate,
      shopDiscountIds: [...c.shopDiscountIds],
      shopDiscountDate: c.shopDiscountDate ?? c.lastRolledDate,
      dailyQuestIds: [...c.dailyQuestIds],
    };
  }

  /**
   * 覆写每日上下文。写入后 persist + emit save:updated。
   * 数组字段浅拷贝落盘以防外部源变更。
   */
  setDailyContext(context: DailyContext): void {
    const s = this.ensure();
    s.dailyContext = {
      lastRolledDate: context.lastRolledDate,
      shopDiscountIds: [...context.shopDiscountIds],
      shopDiscountDate: context.shopDiscountDate ?? context.lastRolledDate,
      dailyQuestIds: [...context.dailyQuestIds],
    };
    this.persist();
  }

  // ---- 通用 -------------------------------------------------------------

  /**
   * 当前存档快照（只读拷贝，顶层字段浅拷贝即可），供调试或 UI 显示。
   */
  snapshot(): PlayerSave {
    return { ...this.ensure() };
  }

  /**
   * 立即写入 localStorage 并 emit save:updated。供外部手动 flush。
   */
  persist(): void {
    const s = this.ensure();
    SaveManager.save(s);
    gameEvents.emit('save:updated');
  }

  /**
   * 重置为一份全新的默认存档（主要给测试 / 新游戏按钮用）。
   */
  resetToDefault(): void {
    this.save = SaveManager.defaultSave();
    this.persist();
  }
}

/**
 * 玩家状态单例。
 */
export const PlayerState: PlayerStateImpl = new PlayerStateImpl();

/**
 * 把任意实数夹紧到 [0, 1] 闭区间。非数字（NaN）按 0 处理。
 * 供 setBgmVolume / setSfxVolume 防御脏输入。
 */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
