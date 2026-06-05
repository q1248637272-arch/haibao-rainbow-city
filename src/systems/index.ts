/**
 * 系统层桶式导出。
 */
export { EventBus, gameEvents } from './EventBus';
export type { GameEvents } from './EventBus';
export {
  SaveManager,
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
} from './SaveManager';
export { PlayerState } from './PlayerState';
export { VIP_MEMBER_PET_IDS, grantVipMemberPets, makeVipMemberPet } from './VipRewards';
export { expToNext, expOnDefeat, computeStats } from './LevelCurve';
