/**
 * 类型桶式导出，上层统一使用 `import type { ... } from '@/types'`。
 */
export type { Element } from './elements';
export { ELEMENTS } from './elements';
export type { SkillData, SkillEffect, SkillEffectKind } from './skill';
export type {
  PetData,
  PetNatureId,
  PetShape,
  PetStats,
  PetTalent,
  PetVisual,
  PlayerPet,
} from './pet';
export type { BossData } from './boss';
export type {
  DailyContext,
  PlayerSave,
  PlayerSaveV1,
  PlayerSaveV2,
  PlayerSaveV3,
  PlayerSaveV4,
  PlayerGender,
  PlayerSettings,
} from './save';
export type { ItemDefinition, ItemEffect, ItemId, ItemKind, PurchaseQuantity } from './item';
export type {
  QuestCondition,
  QuestDefinition,
  QuestId,
  QuestKind,
  QuestReward,
  QuestState,
  QuestStatus,
} from './quest';
export type { VipSnapshot } from './vip';
export type { FurniturePlacement, FurnitureRotation } from './furniture';
