import type { PetData, PlayerSave } from '@/types';

/**
 * 一张精灵卡片在道馆中呈现出的两种状态。
 *
 * - `owned` 表示玩家是否已经拥有这只精灵（存档 playerPets 中存在对应 petId）。
 * - `locked` 表示卡片是否处于 VIP 锁定状态。只有"VIP 专属 且 玩家非 VIP"时为 true。
 *
 * 注意：这两个字段相互独立。例如 VIP 玩家领取彩虹光翼后，`owned=true` 且
 * 因为 `isVip=true`，`locked` 仍然是 false。
 */
export interface PetCardState {
  owned: boolean;
  locked: boolean;
}

/**
 * 纯函数：根据精灵定义与玩家存档，推导出这张精灵卡片在道馆里的状态。
 * 不依赖 Phaser / PlayerState 单例，便于 Vitest 直接断言。
 */
export function computePetCardState(pet: PetData, save: PlayerSave): PetCardState {
  const owned =
    save.playerPets.some((p) => p.petId === pet.id) ||
    save.petStorage.some((p) => p.petId === pet.id);
  const locked = pet.vipOnly && !save.isVip;
  return { owned, locked };
}
