import { PETS } from '@/data/pets';
import { skillIdsForLevel } from '@/data/petLearnsets';
import type {
  DailyContext,
  PetData,
  PlayerPet,
  PlayerSave,
  PlayerSaveV1,
  PlayerSaveV2,
  PlayerSaveV3,
  PlayerGender,
  PlayerSettings,
  VipSnapshot,
} from '@/types';

import { normalizeEvolutionStageForLevel } from './EvolutionSystem';
import {
  computePlayerPetStats,
  createPlayerPet,
  normalizePlayerPetForRuntime,
} from './PetInstance';
import { isPetNatureId } from './PetNature';
import { isCompletePetTalent } from './PetTalent';

/**
 * 存档 localStorage key。
 *
 * 硬约束：即使存档 schema 从 v1 → v2 → v3 演进，key 依然保持 `'hbcc:savefile:v1'`，
 * 这样老玩家的存档能被 `load()` 识别到并原地迁移，不丢数据。
 * schema 版本号通过 JSON 载荷里的 `version` 字段判别。
 */
export const SAVE_KEY = 'hbcc:savefile:v1';
export const SAVE_SLOTS_KEY = 'hbcc:save-slots:v1';
export const ACTIVE_SAVE_SLOT_KEY = 'hbcc:active-save-slot:v1';
const CAI_XUKUN_REWARD_REBALANCE_KEY = 'hbcc:migration:cai-xukun-reward-lv6:v1';
const STARTER_STRENGTH_REBALANCE_KEY = 'hbcc:migration:starter-strength-lv8:v1';
const SAVE_VERSION = 4 as const;
const SAVE_SLOTS_VERSION = 1 as const;
const DEFAULT_PARTY_LIMIT = 6;
const CAI_XUKUN_REWARD_LEVEL = 6;
const LEGACY_AUTO_SLOT_ID = 'slot_legacy_auto';

export interface SaveSlotMeta {
  readonly id: string;
  readonly name: string;
  readonly savedAt: number;
  readonly playerName: string;
  readonly coins: number;
  readonly petCount: number;
  readonly partyCount: number;
  readonly storageCount: number;
  readonly activePetName: string | null;
  readonly isVip: boolean;
}

interface SaveSlotRecord {
  readonly meta: SaveSlotMeta;
  readonly save: PlayerSave;
}

/**
 * 迁移后补发的精灵球数量、默认起始精灵球数量（两者一致）。
 */
const DEFAULT_POKEBALLS = 10;
/**
 * 默认解锁的地图 id 列表。v1 玩家迁移过来时直接继承这份名单。
 */
const DEFAULT_UNLOCKED_MAPS: readonly string[] = ['rainbow_city'];
/**
 * 起始精灵初始等级（新存档 / v1 迁移 / 未来的捕获默认值）。
 */
const STARTER_LEVEL = 8;
const STARTER_PET_IDS = ['flame_puppy', 'aqua_turtle'] as const;

/**
 * v3 新增字段的默认值。defaultSave 与 migrateV2ToV3 都复用这些工厂，保证
 * "新存档与刚刚迁移过来的存档"里这些字段结构完全一致。
 */
const DEFAULT_BGM_VOLUME = 0.6;
const DEFAULT_SFX_VOLUME = 0.8;
const DEFAULT_PLAYER_GENDER: PlayerGender = 'female';

function defaultSettings(): PlayerSettings {
  return { bgmVolume: DEFAULT_BGM_VOLUME, sfxVolume: DEFAULT_SFX_VOLUME };
}

function normalizePlayerGender(value: unknown): PlayerGender {
  return value === 'male' ? 'male' : DEFAULT_PLAYER_GENDER;
}

function normalizeSettings(settings: PlayerSettings): PlayerSettings {
  const base = {
    bgmVolume: settings.bgmVolume,
    sfxVolume: settings.sfxVolume,
  };
  if (settings.playerGender === undefined) return base;
  return { ...base, playerGender: normalizePlayerGender(settings.playerGender) };
}

function defaultVipSnapshot(): VipSnapshot {
  return { lastCheckinDate: null, checkinStreak: 0 };
}

function defaultDailyContext(): DailyContext {
  return { lastRolledDate: null, shopDiscountIds: [], shopDiscountDate: null, dailyQuestIds: [] };
}

/**
 * 为给定精灵数据和等级构造一只全新的 `PlayerPet`（满血，按等级技能表学会技能）。
 *
 * 技能解锁规则：Lv1 学第 1 条，Lv5 再加第 2 条，之后按 `PET_LEARNSETS`
 * 的等级表继续解锁。
 *
 * 传入的 `PetData` 不会被修改；返回的对象字段全部可序列化。
 */
function buildPlayerPet(pet: PetData, level: number): PlayerPet {
  const lv = Math.max(1, level);
  return createPlayerPet(pet, lv, { evolutionStage: 0 });
}

function clonePlayerPet(pp: PlayerPet, usedInstanceIds?: Set<string>): PlayerPet {
  return normalizePlayerPetForRuntime(pp, usedInstanceIds);
}

function clonePlayerPetList(pets: readonly PlayerPet[], usedInstanceIds: Set<string>): PlayerPet[] {
  return pets.map((pp) => clonePlayerPet(pp, usedInstanceIds));
}

function needsPlayerPetIdentityMigration(
  party: readonly PlayerPet[],
  storage: readonly PlayerPet[] = [],
): boolean {
  const seen = new Set<string>();
  for (const pet of [...party, ...storage]) {
    if (typeof pet.instanceId !== 'string' || pet.instanceId.length <= 0) return true;
    if (seen.has(pet.instanceId)) return true;
    seen.add(pet.instanceId);
    if (!isPetNatureId(pet.natureId)) return true;
    if (!isCompletePetTalent(pet.talent)) return true;
  }
  return false;
}

function clonePlayerSave(saveFile: PlayerSave): PlayerSave {
  const usedPetInstanceIds = new Set<string>();
  return {
    ...saveFile,
    playerPets: clonePlayerPetList(saveFile.playerPets, usedPetInstanceIds),
    petStorage: clonePlayerPetList(saveFile.petStorage, usedPetInstanceIds),
    defeatedBossIds: [...saveFile.defeatedBossIds],
    unlockedMaps: [...saveFile.unlockedMaps],
    inventory: { ...saveFile.inventory },
    homeLayout: saveFile.homeLayout.map((p) => ({ ...p })),
    questStates: Object.fromEntries(
      Object.entries(saveFile.questStates).map(([id, state]) => [
        id,
        {
          status: state.status,
          progress: { ...state.progress },
          updatedAt: state.updatedAt,
        },
      ]),
    ),
    vip: { ...saveFile.vip },
    dailyContext: {
      lastRolledDate: saveFile.dailyContext.lastRolledDate,
      shopDiscountIds: [...saveFile.dailyContext.shopDiscountIds],
      shopDiscountDate:
        saveFile.dailyContext.shopDiscountDate ?? saveFile.dailyContext.lastRolledDate,
      dailyQuestIds: [...saveFile.dailyContext.dailyQuestIds],
    },
    settings: normalizeSettings(saveFile.settings),
  };
}

function shouldRebalanceCaiXukunRewardPet(pp: PlayerPet): boolean {
  if (pp.petId !== 'cai_xukun') return false;
  const stage = normalizeEvolutionStageForLevel(pp.evolutionStage ?? 0);
  const level = Number.isFinite(pp.level) ? Math.floor(pp.level) : CAI_XUKUN_REWARD_LEVEL;
  const legalStage = normalizeEvolutionStageForLevel(stage, level);
  return level <= CAI_XUKUN_REWARD_LEVEL && stage > legalStage;
}

function rebalanceCaiXukunRewardPet(pp: PlayerPet, force = false): boolean {
  if (!force && !shouldRebalanceCaiXukunRewardPet(pp)) return false;
  const pet = PETS[pp.petId];
  if (!pet) return false;
  const stats = computePlayerPetStats(pet, CAI_XUKUN_REWARD_LEVEL, 0, pp.natureId, pp.talent);
  pp.level = CAI_XUKUN_REWARD_LEVEL;
  pp.exp = 0;
  pp.learnedSkillIds = skillIdsForLevel(pet.id, CAI_XUKUN_REWARD_LEVEL);
  pp.evolutionStage = 0;
  pp.currentStats = stats;
  pp.currentHp = stats.hp;
  return true;
}

function applyCaiXukunRewardRebalanceOnce(
  saveFile: PlayerSave,
  storage: Storage,
  source?: {
    readonly playerPets: readonly PlayerPet[];
    readonly petStorage?: readonly PlayerPet[];
  },
): boolean {
  if (storage.getItem(CAI_XUKUN_REWARD_REBALANCE_KEY) === '1') return false;
  let changed = false;
  const sourceParty = source?.playerPets ?? saveFile.playerPets;
  const sourceStorage = source?.petStorage ?? saveFile.petStorage;
  for (const [index, pp] of saveFile.playerPets.entries()) {
    const original = sourceParty[index] ?? pp;
    changed = rebalanceCaiXukunRewardPet(pp, shouldRebalanceCaiXukunRewardPet(original)) || changed;
  }
  for (const [index, pp] of saveFile.petStorage.entries()) {
    const original = sourceStorage[index] ?? pp;
    changed = rebalanceCaiXukunRewardPet(pp, shouldRebalanceCaiXukunRewardPet(original)) || changed;
  }
  try {
    storage.setItem(CAI_XUKUN_REWARD_REBALANCE_KEY, '1');
  } catch {
    // Storage quotas/private mode should not block loading the save.
  }
  return changed;
}

function boostStarterPetToOpeningLevel(pp: PlayerPet): boolean {
  if (!STARTER_PET_IDS.some((id) => id === pp.petId)) return false;
  if (pp.level >= STARTER_LEVEL) return false;
  const pet = PETS[pp.petId];
  if (!pet) return false;
  const evolutionStage = normalizeEvolutionStageForLevel(pp.evolutionStage ?? 0, STARTER_LEVEL);
  const stats = computePlayerPetStats(
    pet,
    STARTER_LEVEL,
    { evolutionStage, level: STARTER_LEVEL },
    pp.natureId,
    pp.talent,
  );
  pp.level = STARTER_LEVEL;
  pp.exp = 0;
  pp.learnedSkillIds = skillIdsForLevel(pet.id, STARTER_LEVEL);
  pp.evolutionStage = evolutionStage;
  pp.currentStats = stats;
  pp.currentHp = stats.hp;
  return true;
}

function applyStarterStrengthRebalanceOnce(saveFile: PlayerSave, storage: Storage): boolean {
  if (storage.getItem(STARTER_STRENGTH_REBALANCE_KEY) === '1') return false;
  let changed = false;
  for (const pp of saveFile.playerPets) {
    changed = boostStarterPetToOpeningLevel(pp) || changed;
  }
  for (const pp of saveFile.petStorage) {
    changed = boostStarterPetToOpeningLevel(pp) || changed;
  }
  try {
    storage.setItem(STARTER_STRENGTH_REBALANCE_KEY, '1');
  } catch {
    // Storage quotas/private mode should not block loading the save.
  }
  return changed;
}

/**
 * 生成一份默认存档：起始 100 彩虹币 + 2 只 Lv8 起始精灵 + 10 颗精灵球 + 解锁彩虹城
 * + 空家园 / 空任务表 / 未签到 VIP / 默认音量。
 *
 * 起始精灵 id 必须真实存在于 PETS 表中。
 *
 * 精灵球存储：FEAT-304 起"普通精灵球"改为走 `inventory['pokeball_normal']`，
 * 让商店购买与战斗消耗共享同一份库存。v3 schema 里 `pokeballs` 字段仍保留以保证
 * 向后兼容，但 PlayerState.getPokeballs / addPokeballs / consumePokeball 都走 inventory。
 */
export function defaultSave(): PlayerSave {
  const starters: PlayerPet[] = [];
  for (const id of STARTER_PET_IDS) {
    const pet = PETS[id];
    if (pet) starters.push(buildPlayerPet(pet, STARTER_LEVEL));
  }
  return {
    version: SAVE_VERSION,
    playerName: '小海宝',
    coins: 100,
    isVip: false,
    playerPets: starters,
    petStorage: [],
    defeatedBossIds: [],
    unlockedMaps: [...DEFAULT_UNLOCKED_MAPS],
    pokeballs: DEFAULT_POKEBALLS,
    inventory: { pokeball_normal: DEFAULT_POKEBALLS },
    homeLayout: [],
    questStates: {},
    vip: defaultVipSnapshot(),
    settings: defaultSettings(),
    dailyContext: defaultDailyContext(),
    lastSavedAt: 0,
  };
}

/**
 * 获取 localStorage 实例。浏览器环境直接用全局 localStorage；
 * Node/测试环境可由调用方提前注入 `globalThis.localStorage`。
 * 无可用 storage 时返回 undefined，相关函数会静默降级。
 */
function getStorage(): Storage | undefined {
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  return ls;
}

function normalizeSaveSlotName(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed.slice(0, 24) : '未命名存档';
}

function createSaveSlotId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `slot_${time}_${rand}`;
}

function buildSaveSlotMeta(
  id: string,
  name: string,
  saveFile: PlayerSave,
  savedAt: number,
): SaveSlotMeta {
  const activePetId = saveFile.playerPets[0]?.petId;
  const activePetName = activePetId ? (PETS[activePetId]?.name ?? activePetId) : null;
  const storageCount = saveFile.petStorage.length;
  const partyCount = saveFile.playerPets.length;
  return {
    id,
    name: normalizeSaveSlotName(name),
    savedAt,
    playerName: saveFile.playerName,
    coins: saveFile.coins,
    petCount: partyCount + storageCount,
    partyCount,
    storageCount,
    activePetName,
    isVip: saveFile.isVip,
  };
}

function saveWithTimestamp(saveFile: PlayerSave, savedAt: number): PlayerSave {
  return clonePlayerSave({ ...saveFile, lastSavedAt: savedAt });
}

function coercePlayerSave(value: unknown): PlayerSave | null {
  if (isValidSave(value)) return clonePlayerSave(value);
  if (isValidSaveV3(value)) return migrateV3ToV4(value);
  if (isValidSaveV2(value)) return migrateV3ToV4(migrateV2ToV3(value));
  if (isValidSaveV1(value)) return migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(value)));
  return null;
}

function readSaveSlotsRaw(storage: Storage): SaveSlotRecord[] {
  const raw = storage.getItem(SAVE_SLOTS_KEY);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null) return [];
  const store = parsed as Record<string, unknown>;
  if (store['version'] !== SAVE_SLOTS_VERSION || !Array.isArray(store['slots'])) return [];

  const records: SaveSlotRecord[] = [];
  const seen = new Set<string>();
  for (const item of store['slots']) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const meta = record['meta'];
    if (typeof meta !== 'object' || meta === null) continue;
    const metaRec = meta as Record<string, unknown>;
    const id = typeof metaRec['id'] === 'string' ? metaRec['id'] : '';
    if (!id || seen.has(id)) continue;
    const saveFile = coercePlayerSave(record['save']);
    if (!saveFile) continue;
    const savedAt =
      typeof metaRec['savedAt'] === 'number' && Number.isFinite(metaRec['savedAt'])
        ? metaRec['savedAt']
        : saveFile.lastSavedAt || Date.now();
    const name =
      typeof metaRec['name'] === 'string' ? metaRec['name'] : `存档 ${records.length + 1}`;
    const snapshot = saveWithTimestamp(saveFile, savedAt);
    records.push({
      meta: buildSaveSlotMeta(id, name, snapshot, savedAt),
      save: snapshot,
    });
    seen.add(id);
  }
  return records;
}

function writeSaveSlotsRaw(storage: Storage, records: readonly SaveSlotRecord[]): void {
  try {
    storage.setItem(
      SAVE_SLOTS_KEY,
      JSON.stringify({ version: SAVE_SLOTS_VERSION, slots: records }),
    );
  } catch {
    // Ignore storage quota/private mode failures.
  }
}

function writeCurrentSaveRaw(storage: Storage, saveFile: PlayerSave): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(saveFile));
  } catch {
    // Ignore storage quota/private mode failures.
  }
}

function latestSaveSlotRecord(records: readonly SaveSlotRecord[]): SaveSlotRecord | undefined {
  return [...records].sort((a, b) => b.meta.savedAt - a.meta.savedAt)[0];
}

function activateSaveSlotRecord(storage: Storage, record: SaveSlotRecord): void {
  storage.setItem(ACTIVE_SAVE_SLOT_KEY, record.meta.id);
  writeCurrentSaveRaw(storage, record.save);
}

function ensureLegacyCurrentSlot(storage: Storage): void {
  const records = readSaveSlotsRaw(storage);
  if (records.length > 0) {
    writeSaveSlotsRaw(storage, records);
    const activeId = storage.getItem(ACTIVE_SAVE_SLOT_KEY);
    const activeRecord = activeId
      ? records.find((record) => record.meta.id === activeId)
      : undefined;
    if (activeRecord) {
      writeCurrentSaveRaw(storage, activeRecord.save);
    } else {
      const latest = latestSaveSlotRecord(records);
      if (latest) activateSaveSlotRecord(storage, latest);
    }
    return;
  }

  const raw = storage.getItem(SAVE_KEY);
  if (!raw) {
    storage.removeItem(ACTIVE_SAVE_SLOT_KEY);
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(ACTIVE_SAVE_SLOT_KEY);
    return;
  }
  const saveFile = coercePlayerSave(parsed);
  if (!saveFile) {
    storage.removeItem(ACTIVE_SAVE_SLOT_KEY);
    return;
  }
  const savedAt = saveFile.lastSavedAt || Date.now();
  const snapshot = saveWithTimestamp(saveFile, savedAt);
  const migrated: SaveSlotRecord = {
    meta: buildSaveSlotMeta(LEGACY_AUTO_SLOT_ID, '自动存档', snapshot, savedAt),
    save: snapshot,
  };
  writeSaveSlotsRaw(storage, [migrated]);
  activateSaveSlotRecord(storage, migrated);
}

function updateActiveSaveSlot(storage: Storage, saveFile: PlayerSave): void {
  const activeId = storage.getItem(ACTIVE_SAVE_SLOT_KEY);
  if (!activeId) return;
  const records = readSaveSlotsRaw(storage);
  const index = records.findIndex((record) => record.meta.id === activeId);
  if (index < 0) return;
  const savedAt = saveFile.lastSavedAt || Date.now();
  const snapshot = saveWithTimestamp(saveFile, savedAt);
  const current = records[index];
  if (!current) return;
  records[index] = {
    meta: buildSaveSlotMeta(activeId, current.meta.name, snapshot, savedAt),
    save: snapshot,
  };
  writeSaveSlotsRaw(storage, records);
}

/**
 * 判断一个未知值是否是合法的 v1 存档。
 *
 * 只做结构级校验，不校验 ownedPetIds 里的 id 是否都能解析到 PETS 表（那是 migrate 层的事）。
 */
function isValidSaveV1(value: unknown): value is PlayerSaveV1 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v['version'] !== 1) return false;
  if (typeof v['playerName'] !== 'string') return false;
  if (typeof v['coins'] !== 'number') return false;
  if (typeof v['isVip'] !== 'boolean') return false;
  if (!Array.isArray(v['ownedPetIds'])) return false;
  if (!(v['ownedPetIds'] as unknown[]).every((x) => typeof x === 'string')) return false;
  if (!Array.isArray(v['defeatedBossIds'])) return false;
  if (!(v['defeatedBossIds'] as unknown[]).every((x) => typeof x === 'string')) return false;
  if (typeof v['lastSavedAt'] !== 'number') return false;
  return true;
}

/**
 * 判断一个 playerPets 数组内部每一项是否是合法的 PlayerPet 结构。
 * v2 / v3 共用此校验，抽出来避免重复。
 */
function isValidPlayerPetArray(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return false;
    const p = item as Record<string, unknown>;
    if (typeof p['petId'] !== 'string') return false;
    if (typeof p['level'] !== 'number') return false;
    if (typeof p['exp'] !== 'number') return false;
    if (typeof p['currentHp'] !== 'number') return false;
    if (p['evolutionStage'] !== undefined && typeof p['evolutionStage'] !== 'number') {
      return false;
    }
    if (!Array.isArray(p['learnedSkillIds'])) return false;
    if (!(p['learnedSkillIds'] as unknown[]).every((x) => typeof x === 'string')) return false;
    const stats = p['currentStats'];
    if (typeof stats !== 'object' || stats === null) return false;
    const st = stats as Record<string, unknown>;
    if (typeof st['hp'] !== 'number') return false;
    if (typeof st['atk'] !== 'number') return false;
    if (typeof st['def'] !== 'number') return false;
    if (typeof st['spd'] !== 'number') return false;
  }
  return true;
}

/**
 * 判断一个未知值是否是合法的 v2 存档结构。
 *
 * 只做结构级校验；v2 里还没有 inventory / questStates / homeLayout / vip / settings /
 * dailyContext 等字段，这些全部由 migrateV2ToV3 补默认值。
 */
function isValidSaveV2(value: unknown): value is PlayerSaveV2 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v['version'] !== 2) return false;
  if (typeof v['playerName'] !== 'string') return false;
  if (typeof v['coins'] !== 'number') return false;
  if (typeof v['isVip'] !== 'boolean') return false;
  if (!isValidPlayerPetArray(v['playerPets'])) return false;
  if (!Array.isArray(v['defeatedBossIds'])) return false;
  if (!(v['defeatedBossIds'] as unknown[]).every((x) => typeof x === 'string')) return false;
  if (!Array.isArray(v['unlockedMaps'])) return false;
  if (!(v['unlockedMaps'] as unknown[]).every((x) => typeof x === 'string')) return false;
  if (typeof v['pokeballs'] !== 'number') return false;
  if (typeof v['lastSavedAt'] !== 'number') return false;
  return true;
}

/**
 * 判断一个未知值是否是合法的 v3 PlayerSave 结构（当前 schema）。
 *
 * 校验到字段级别："inventory / questStates" 需要是 object；homeLayout 需要是数组；
 * settings / vip / dailyContext 需要有对应子字段。任何一项失败就 fallback 到 defaultSave。
 */
function isValidSaveV3(value: unknown): value is PlayerSaveV3 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v['version'] !== 3) return false;
  if (typeof v['playerName'] !== 'string') return false;
  if (typeof v['coins'] !== 'number') return false;
  if (typeof v['isVip'] !== 'boolean') return false;
  if (!isValidPlayerPetArray(v['playerPets'])) return false;
  if (!Array.isArray(v['defeatedBossIds'])) return false;
  if (!(v['defeatedBossIds'] as unknown[]).every((x) => typeof x === 'string')) return false;
  if (!Array.isArray(v['unlockedMaps'])) return false;
  if (!(v['unlockedMaps'] as unknown[]).every((x) => typeof x === 'string')) return false;
  if (typeof v['pokeballs'] !== 'number') return false;
  if (typeof v['lastSavedAt'] !== 'number') return false;

  // inventory: Record<string, number>
  const inv = v['inventory'];
  if (typeof inv !== 'object' || inv === null || Array.isArray(inv)) return false;
  for (const [, n] of Object.entries(inv as Record<string, unknown>)) {
    if (typeof n !== 'number') return false;
  }

  // homeLayout: FurniturePlacement[]
  const home = v['homeLayout'];
  if (!Array.isArray(home)) return false;
  for (const item of home) {
    if (typeof item !== 'object' || item === null) return false;
    const f = item as Record<string, unknown>;
    if (typeof f['itemId'] !== 'string') return false;
    if (typeof f['gridX'] !== 'number') return false;
    if (typeof f['gridY'] !== 'number') return false;
    if (
      f['rotation'] !== 0 &&
      f['rotation'] !== 90 &&
      f['rotation'] !== 180 &&
      f['rotation'] !== 270
    ) {
      return false;
    }
  }

  // questStates: Record<string, QuestState>
  const quests = v['questStates'];
  if (typeof quests !== 'object' || quests === null || Array.isArray(quests)) return false;
  for (const [, state] of Object.entries(quests as Record<string, unknown>)) {
    if (typeof state !== 'object' || state === null) return false;
    const qs = state as Record<string, unknown>;
    if (
      qs['status'] !== 'locked' &&
      qs['status'] !== 'active' &&
      qs['status'] !== 'claimable' &&
      qs['status'] !== 'completed'
    ) {
      return false;
    }
    if (typeof qs['updatedAt'] !== 'number') return false;
    const prog = qs['progress'];
    if (typeof prog !== 'object' || prog === null || Array.isArray(prog)) return false;
    for (const [, nv] of Object.entries(prog as Record<string, unknown>)) {
      if (typeof nv !== 'number') return false;
    }
  }

  // vip: VipSnapshot
  const vip = v['vip'];
  if (typeof vip !== 'object' || vip === null) return false;
  const vipRec = vip as Record<string, unknown>;
  if (vipRec['lastCheckinDate'] !== null && typeof vipRec['lastCheckinDate'] !== 'string') {
    return false;
  }
  if (typeof vipRec['checkinStreak'] !== 'number') return false;

  // settings: PlayerSettings
  const settings = v['settings'];
  if (typeof settings !== 'object' || settings === null) return false;
  const sr = settings as Record<string, unknown>;
  if (typeof sr['bgmVolume'] !== 'number') return false;
  if (typeof sr['sfxVolume'] !== 'number') return false;
  if (
    sr['playerGender'] !== undefined &&
    sr['playerGender'] !== 'female' &&
    sr['playerGender'] !== 'male'
  ) {
    return false;
  }

  // dailyContext: DailyContext
  const daily = v['dailyContext'];
  if (typeof daily !== 'object' || daily === null) return false;
  const dr = daily as Record<string, unknown>;
  if (dr['lastRolledDate'] !== null && typeof dr['lastRolledDate'] !== 'string') return false;
  if (!Array.isArray(dr['shopDiscountIds'])) return false;
  if (!(dr['shopDiscountIds'] as unknown[]).every((x) => typeof x === 'string')) return false;
  if (
    dr['shopDiscountDate'] !== undefined &&
    dr['shopDiscountDate'] !== null &&
    typeof dr['shopDiscountDate'] !== 'string'
  ) {
    return false;
  }
  if (!Array.isArray(dr['dailyQuestIds'])) return false;
  if (!(dr['dailyQuestIds'] as unknown[]).every((x) => typeof x === 'string')) return false;

  return true;
}

function isValidSave(value: unknown): value is PlayerSave {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isValidSaveV3({ ...v, version: 3 })) {
    return false;
  }
  if (v['version'] !== SAVE_VERSION) return false;
  if (!isValidPlayerPetArray(v['petStorage'])) return false;
  return true;
}

/**
 * 把 v1 legacy 存档结构升级到 v2。
 *
 * 行为：
 * - `ownedPetIds` 中的每个 id 若能解析到 PETS 表，则生成一只 Lv8 PlayerPet；
 *   若不能解析（PETS 表里没有该 id，例如老版本数据表里有、后来被删掉的精灵），**安全丢弃**，
 *   不抛错也不记日志——让老存档尽量还原即可；
 * - `coins / isVip / defeatedBossIds / playerName` 原样保留；
 * - `unlockedMaps` 填入 `['rainbow_city']`（v1 玩家默认继承彩虹城解锁权）；
 * - `pokeballs` 补发 10 颗（欢迎老玩家回归）；
 * - `lastSavedAt` 沿用 v1 的值（load 时会由上层决定是否写回 localStorage）。
 *
 * 纯函数。返回的是 v2 结构；v3 字段由 migrateV2ToV3 接棒补齐。
 */
export function migrateV1ToV2(legacy: PlayerSaveV1): PlayerSaveV2 {
  const playerPets: PlayerPet[] = [];
  for (const id of legacy.ownedPetIds) {
    const pet = PETS[id];
    if (pet) {
      playerPets.push(buildPlayerPet(pet, STARTER_LEVEL));
    }
    // 未知 id：安静丢弃，不抛不警告（老存档里可能残留已下架精灵 id）。
  }
  // 值域兜底：v1 存档可能被外部工具污染（负金币 / 空字符串昵称）。
  // isValidSaveV1 只校验类型不校验值域，这里统一在迁移时做一次软钳制，避免
  // 脏数据直接进入 v2 PlayerSave 被上层业务看到。
  const clampedCoins = Math.max(0, Math.floor(legacy.coins));
  const trimmedName = legacy.playerName.trim() || '小海宝';
  return {
    version: 2,
    playerName: trimmedName,
    coins: clampedCoins,
    isVip: legacy.isVip,
    playerPets,
    defeatedBossIds: [...legacy.defeatedBossIds],
    unlockedMaps: [...DEFAULT_UNLOCKED_MAPS],
    pokeballs: DEFAULT_POKEBALLS,
    lastSavedAt: legacy.lastSavedAt,
  };
}

/**
 * 把 v2 legacy 存档结构升级到 v3。
 *
 * v3 新增 6 个字段，都采用"保守默认值"策略，不猜玩家任何意图：
 * - `inventory`：v2 里的 `pokeballs` 数量会被转入 `inventory['pokeball_normal']`，
 *   这样 FEAT-304 起战斗场景与商店共用同一个"普通精灵球库存"。
 *   为保持 v3 schema 的向后兼容，`pokeballs` 字段在 v3 存档里仍然存在，
 *   但 PlayerState 的读写 API 已经全部走 inventory，本字段不再被引用。
 * - `homeLayout = []`：家园空房。
 * - `questStates = {}`：任务状态机空白，QuestEngine 首次 init 时会把主线
 *   挂成 locked（由 QuestEngine 负责，不是 SaveManager 的职责）。
 * - `vip = { lastCheckinDate: null, checkinStreak: 0 }`：未签到。
 * - `settings = { bgmVolume: 0.6, sfxVolume: 0.8 }`：默认音量。
 * - `dailyContext = { lastRolledDate: null, shopDiscountIds: [], dailyQuestIds: [] }`：
 *   首次进入 DailyQuest 时会由其纯函数决定是否滚动。
 *
 * 纯函数：不会修改入参；返回一份全新的 PlayerSaveV3 对象（数组字段都浅拷贝）。
 */
export function migrateV2ToV3(legacy: PlayerSaveV2): PlayerSaveV3 {
  const inventory: Record<string, number> = {};
  if (legacy.pokeballs > 0) {
    inventory['pokeball_normal'] = legacy.pokeballs;
  }
  return {
    version: 3,
    playerName: legacy.playerName,
    coins: legacy.coins,
    isVip: legacy.isVip,
    // 精灵数据浅拷贝一层，避免外部对 legacy 的二次修改回传污染迁移结果。
    playerPets: clonePlayerPetList(legacy.playerPets, new Set<string>()),
    defeatedBossIds: [...legacy.defeatedBossIds],
    unlockedMaps: [...legacy.unlockedMaps],
    pokeballs: legacy.pokeballs,
    inventory,
    homeLayout: [],
    questStates: {},
    vip: defaultVipSnapshot(),
    settings: defaultSettings(),
    dailyContext: defaultDailyContext(),
    lastSavedAt: legacy.lastSavedAt,
  };
}

export function migrateV3ToV4(legacy: PlayerSaveV3): PlayerSave {
  const allPets = clonePlayerPetList(legacy.playerPets, new Set<string>());
  return {
    ...legacy,
    version: SAVE_VERSION,
    playerPets: allPets.slice(0, DEFAULT_PARTY_LIMIT),
    petStorage: allPets.slice(DEFAULT_PARTY_LIMIT),
    defeatedBossIds: [...legacy.defeatedBossIds],
    unlockedMaps: [...legacy.unlockedMaps],
    inventory: { ...legacy.inventory },
    homeLayout: legacy.homeLayout.map((p) => ({ ...p })),
    questStates: Object.fromEntries(
      Object.entries(legacy.questStates).map(([id, state]) => [
        id,
        {
          status: state.status,
          progress: { ...state.progress },
          updatedAt: state.updatedAt,
        },
      ]),
    ),
    vip: { ...legacy.vip },
    settings: normalizeSettings(legacy.settings),
    dailyContext: {
      lastRolledDate: legacy.dailyContext.lastRolledDate,
      shopDiscountIds: [...legacy.dailyContext.shopDiscountIds],
      shopDiscountDate: legacy.dailyContext.shopDiscountDate ?? legacy.dailyContext.lastRolledDate,
      dailyQuestIds: [...legacy.dailyContext.dailyQuestIds],
    },
  };
}

/**
 * 读取存档。
 *
 * 处理顺序：
 * 1. storage 不存在 / raw 为 null → defaultSave()。
 * 2. JSON 解析失败 → defaultSave()。
 * 3. `version === 3` 且结构合法 → 原样返回。
 * 4. `version === 2` 且结构合法 → 调 migrateV2ToV3 升级，并**把升级后的 v3 写回 localStorage**
 *    （同一个 key `hbcc:savefile:v1`），让下次启动直接走 v3 快路径。
 * 5. `version === 1` 且结构合法 → 先走 migrateV1ToV2，再走 migrateV2ToV3 链式升级，写回。
 * 6. 其它情况（版本号未知 / 结构非法）→ defaultSave()。
 *
 * 迁移链的设计要点：每层迁移只关心"上一版 → 当前版"的映射，互不交叉。
 * 这样未来再加 v4 时，只需新增 migrateV3ToV4 并把 load 末端的 v3 分支改为"load→migrate→writeback"。
 */
export function load(): PlayerSave {
  const storage = getStorage();
  if (!storage) return defaultSave();
  const raw = storage.getItem(SAVE_KEY);
  if (raw === null) return defaultSave();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultSave();
  }

  if (isValidSave(parsed)) {
    const needsIdentityMigration = needsPlayerPetIdentityMigration(
      parsed.playerPets,
      parsed.petStorage,
    );
    const loaded = clonePlayerSave(parsed);
    let changed = needsIdentityMigration;
    changed = applyCaiXukunRewardRebalanceOnce(loaded, storage, parsed) || changed;
    changed = applyStarterStrengthRebalanceOnce(loaded, storage) || changed;
    if (changed) {
      save(loaded);
    }
    ensureLegacyCurrentSlot(storage);
    return loaded;
  }
  if (isValidSaveV3(parsed)) {
    const migrated = migrateV3ToV4(parsed);
    applyCaiXukunRewardRebalanceOnce(migrated, storage, parsed);
    applyStarterStrengthRebalanceOnce(migrated, storage);
    save(migrated);
    ensureLegacyCurrentSlot(storage);
    return migrated;
  }
  if (isValidSaveV2(parsed)) {
    const migrated = migrateV3ToV4(migrateV2ToV3(parsed));
    applyCaiXukunRewardRebalanceOnce(migrated, storage, parsed);
    applyStarterStrengthRebalanceOnce(migrated, storage);
    save(migrated);
    ensureLegacyCurrentSlot(storage);
    return migrated;
  }
  if (isValidSaveV1(parsed)) {
    const v2 = migrateV1ToV2(parsed);
    const v4 = migrateV3ToV4(migrateV2ToV3(v2));
    applyCaiXukunRewardRebalanceOnce(v4, storage);
    applyStarterStrengthRebalanceOnce(v4, storage);
    save(v4);
    ensureLegacyCurrentSlot(storage);
    return v4;
  }
  return defaultSave();
}

/**
 * 写入存档。会自动把 lastSavedAt 刷新为当前时间戳。
 */
export function save(s: PlayerSave): void {
  const storage = getStorage();
  if (!storage) return;
  const snapshot: PlayerSave = { ...s, lastSavedAt: Date.now() };
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    updateActiveSaveSlot(storage, snapshot);
  } catch {
    // 配额满或隐私模式下静默失败即可，不抛出。
  }
}

export function listSaveSlots(): SaveSlotMeta[] {
  const storage = getStorage();
  if (!storage) return [];
  ensureLegacyCurrentSlot(storage);
  return readSaveSlotsRaw(storage)
    .map((record) => record.meta)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function getActiveSaveSlotId(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  ensureLegacyCurrentSlot(storage);
  return storage.getItem(ACTIVE_SAVE_SLOT_KEY);
}

export function getActiveSaveSlotMeta(): SaveSlotMeta | null {
  const activeId = getActiveSaveSlotId();
  if (!activeId) return null;
  return listSaveSlots().find((slot) => slot.id === activeId) ?? null;
}

export function saveToSlot(name: string, saveFile?: PlayerSave): SaveSlotMeta | null {
  const storage = getStorage();
  if (!storage) return null;
  ensureLegacyCurrentSlot(storage);
  const source = saveFile ?? load();
  const savedAt = Date.now();
  const snapshot = saveWithTimestamp(source, savedAt);
  const record: SaveSlotRecord = {
    meta: buildSaveSlotMeta(createSaveSlotId(), name, snapshot, savedAt),
    save: snapshot,
  };
  const records = readSaveSlotsRaw(storage);
  records.push(record);
  writeSaveSlotsRaw(storage, records);
  storage.setItem(ACTIVE_SAVE_SLOT_KEY, record.meta.id);
  writeCurrentSaveRaw(storage, snapshot);
  return record.meta;
}

export function overwriteSaveSlot(id: string, saveFile?: PlayerSave): SaveSlotMeta | null {
  const storage = getStorage();
  if (!storage) return null;
  ensureLegacyCurrentSlot(storage);
  const records = readSaveSlotsRaw(storage);
  const index = records.findIndex((record) => record.meta.id === id);
  if (index < 0) return null;
  const source = saveFile ?? load();
  const savedAt = Date.now();
  const snapshot = saveWithTimestamp(source, savedAt);
  const current = records[index];
  if (!current) return null;
  const updated: SaveSlotRecord = {
    meta: buildSaveSlotMeta(id, current.meta.name, snapshot, savedAt),
    save: snapshot,
  };
  records[index] = updated;
  writeSaveSlotsRaw(storage, records);
  storage.setItem(ACTIVE_SAVE_SLOT_KEY, id);
  writeCurrentSaveRaw(storage, snapshot);
  return updated.meta;
}

export function loadSaveSlot(id: string): PlayerSave | null {
  const storage = getStorage();
  if (!storage) return null;
  ensureLegacyCurrentSlot(storage);
  const record = readSaveSlotsRaw(storage).find((slot) => slot.meta.id === id);
  if (!record) return null;
  const snapshot = clonePlayerSave(record.save);
  writeCurrentSaveRaw(storage, snapshot);
  storage.setItem(ACTIVE_SAVE_SLOT_KEY, id);
  return snapshot;
}

export function renameSaveSlot(id: string, name: string): SaveSlotMeta | null {
  const storage = getStorage();
  if (!storage) return null;
  ensureLegacyCurrentSlot(storage);
  const records = readSaveSlotsRaw(storage);
  const index = records.findIndex((record) => record.meta.id === id);
  if (index < 0) return null;
  const current = records[index];
  if (!current) return null;
  const updated: SaveSlotRecord = {
    ...current,
    meta: buildSaveSlotMeta(id, name, current.save, current.meta.savedAt),
  };
  records[index] = updated;
  writeSaveSlotsRaw(storage, records);
  return updated.meta;
}

export function deleteSaveSlot(id: string): boolean {
  const storage = getStorage();
  if (!storage) return false;
  ensureLegacyCurrentSlot(storage);
  const records = readSaveSlotsRaw(storage);
  const next = records.filter((record) => record.meta.id !== id);
  if (next.length === records.length) return false;
  writeSaveSlotsRaw(storage, next);
  if (storage.getItem(ACTIVE_SAVE_SLOT_KEY) === id) {
    storage.removeItem(ACTIVE_SAVE_SLOT_KEY);
  }
  return true;
}

/**
 * 清除存档。
 */
export function clear(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(SAVE_KEY);
}

// 重新导出迁移链相关类型，便于下游模块引用（避免深路径导入）。
export type { DailyContext, PlayerSettings, VipSnapshot };

/**
 * 聚合对象形式导出，便于 `import { SaveManager } from '@/systems/SaveManager'`。
 */
export const SaveManager = {
  SAVE_KEY,
  SAVE_SLOTS_KEY,
  ACTIVE_SAVE_SLOT_KEY,
  load,
  save,
  clear,
  listSaveSlots,
  getActiveSaveSlotId,
  getActiveSaveSlotMeta,
  saveToSlot,
  overwriteSaveSlot,
  loadSaveSlot,
  renameSaveSlot,
  deleteSaveSlot,
  defaultSave,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4,
} as const;
