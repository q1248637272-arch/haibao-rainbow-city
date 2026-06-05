import { ITEMS } from '@/data/items';
import { PETS } from '@/data/pets';
import { skillIdsForLevel } from '@/data/petLearnsets';
import type { ItemDefinition, PlayerPet } from '@/types';

import {
  CAI_XUKUN_THIRD_EVOLUTION_ITEM_ID,
  canEvolve,
  evolvedPetName,
  getEvolutionStage,
  nextEvolutionLevel,
  requiredEvolutionItem,
  ZENG_MING_SECOND_EVOLUTION_ITEM_ID,
  ZENG_MING_THIRD_EVOLUTION_ITEM_ID,
} from './EvolutionSystem';
import { computePlayerPetStats } from './PetInstance';
import { PlayerState } from './PlayerState';

export type BackpackItemUseKind = 'heal' | 'revive' | 'exp' | 'potential' | 'evolve' | 'none';

export interface BackpackItemUseResult {
  readonly ok: boolean;
  readonly message: string;
  readonly consumed?: boolean;
}

const SPECIAL_EVOLUTION_ITEM_IDS = new Set<string>([
  CAI_XUKUN_THIRD_EVOLUTION_ITEM_ID,
  ZENG_MING_SECOND_EVOLUTION_ITEM_ID,
  ZENG_MING_THIRD_EVOLUTION_ITEM_ID,
]);

export function backpackItemUseKind(item: ItemDefinition): BackpackItemUseKind {
  if (item.id === 'potential_seed') return 'potential';
  if (SPECIAL_EVOLUTION_ITEM_IDS.has(item.id)) return 'evolve';

  switch (item.effect?.kind) {
    case 'heal':
      return 'heal';
    case 'revive':
      return 'revive';
    case 'exp':
      return 'exp';
    case 'evolve':
      return 'evolve';
    default:
      return 'none';
  }
}

export function isBackpackUsableItem(item: ItemDefinition): boolean {
  return backpackItemUseKind(item) !== 'none';
}

export function backpackItemActionLabel(item: ItemDefinition): string {
  switch (backpackItemUseKind(item)) {
    case 'heal':
    case 'revive':
      return '使用';
    case 'exp':
    case 'potential':
      return '养成';
    case 'evolve':
      return '进化';
    case 'none':
      if (item.kind === 'pokeball') return '捕捉中使用';
      if (item.kind === 'furniture') return '家园摆放';
      if (item.kind === 'material') return '任务材料';
      return '查看';
  }
}

export function backpackItemUseHint(item: ItemDefinition): string {
  if (isBackpackUsableItem(item)) {
    return `${item.name} 可以在背包里选择一只精灵使用。`;
  }
  if (item.effect?.kind === 'element_fruit') {
    return '元素果实的永久成长正在重做，先收藏起来，避免临时效果丢失。';
  }
  if (item.kind === 'pokeball') return '精灵球会在野外捕捉时自动使用。';
  if (item.kind === 'furniture') return '家具请前往家园布置界面摆放。';
  if (item.kind === 'material') return '任务、活动或特殊进化会自动读取这种材料。';
  return '这个道具暂时没有可直接使用的背包动作。';
}

export function useBackpackItemOnPet(
  itemId: string,
  petKey: string,
): BackpackItemUseResult {
  const item = ITEMS[itemId];
  if (!item) return { ok: false, message: '没有找到这个道具。' };
  if (PlayerState.getItemCount(itemId) < 1) {
    return { ok: false, message: `${item.name} 已经用完了。` };
  }

  const pet = findOwnedPet(petKey);
  if (!pet) return { ok: false, message: '没有找到目标精灵。' };

  switch (backpackItemUseKind(item)) {
    case 'heal':
      return useHealItem(item, pet);
    case 'revive':
      return useReviveItem(item, pet);
    case 'exp':
      return useExpItem(item, petKey, pet);
    case 'potential':
      return usePotentialItem(item, petKey);
    case 'evolve':
      return useEvolutionItem(item, pet);
    case 'none':
      return { ok: false, message: backpackItemUseHint(item) };
  }
}

function useHealItem(item: ItemDefinition, pet: PlayerPet): BackpackItemUseResult {
  const maxHp = pet.currentStats.hp;
  if (pet.currentHp <= 0) {
    return { ok: false, message: '这只精灵已经倒下了，需要复活药。' };
  }
  if (pet.currentHp >= maxHp) {
    return { ok: false, message: '这只精灵体力已经满了。' };
  }

  const healValue = Math.max(1, item.effect?.value ?? 0);
  if (!PlayerState.removeItem(item.id, 1)) {
    return { ok: false, message: `${item.name} 不足。` };
  }
  const before = pet.currentHp;
  pet.currentHp = Math.min(maxHp, pet.currentHp + healValue);
  PlayerState.persist();
  return {
    ok: true,
    consumed: true,
    message: `${petDisplayName(pet)} 恢复了 ${pet.currentHp - before} 点体力。`,
  };
}

function useReviveItem(item: ItemDefinition, pet: PlayerPet): BackpackItemUseResult {
  if (pet.currentHp > 0) {
    return { ok: false, message: '只有倒下的精灵才需要复活药。' };
  }

  const maxHp = pet.currentStats.hp;
  const reviveValue = Math.max(1, item.effect?.value ?? Math.ceil(maxHp / 2));
  if (!PlayerState.removeItem(item.id, 1)) {
    return { ok: false, message: `${item.name} 不足。` };
  }
  pet.currentHp = Math.min(maxHp, reviveValue);
  PlayerState.persist();
  return {
    ok: true,
    consumed: true,
    message: `${petDisplayName(pet)} 重新站起来了。`,
  };
}

function useExpItem(
  item: ItemDefinition,
  petKey: string,
  pet: PlayerPet,
): BackpackItemUseResult {
  if (pet.level >= 100) {
    return { ok: false, message: '这只精灵已经满级了。' };
  }

  const exp = Math.max(1, item.effect?.value ?? 0);
  if (!PlayerState.removeItem(item.id, 1)) {
    return { ok: false, message: `${item.name} 不足。` };
  }
  const beforeLevel = pet.level;
  const result = PlayerState.gainExp(petKey, exp);
  if (!result) return { ok: false, message: '经验使用失败。' };
  const levelText = result.newLevel > beforeLevel ? `，升到 Lv.${result.newLevel}` : '';
  return {
    ok: true,
    consumed: true,
    message: `${petDisplayName(pet)} 获得 ${exp} 经验${levelText}。`,
  };
}

function usePotentialItem(item: ItemDefinition, petKey: string): BackpackItemUseResult {
  const result = PlayerState.trainPetTalent(petKey, item.id);
  return result.ok
    ? { ok: true, consumed: true, message: result.message }
    : { ok: false, message: result.message };
}

function useEvolutionItem(item: ItemDefinition, pet: PlayerPet): BackpackItemUseResult {
  const petData = PETS[pet.petId];
  if (!petData) return { ok: false, message: '这只精灵的数据还没有登记。' };

  if (!canEvolve(pet)) {
    const nextLevel = nextEvolutionLevel(pet);
    const requirement = nextLevel ? `需要 Lv.${nextLevel}` : '已经是最终形态';
    return { ok: false, message: `${petData.name} 现在还不能进化：${requirement}。` };
  }

  const requiredItemId = requiredEvolutionItem(pet);
  if (requiredItemId) {
    if (item.id !== requiredItemId) {
      const required = ITEMS[requiredItemId]?.name ?? requiredItemId;
      return { ok: false, message: `${petData.name} 这次进化需要 ${required}。` };
    }
  } else if (item.effect?.kind !== 'evolve') {
    return { ok: false, message: `${item.name} 不是这次进化需要的信物。` };
  } else if (item.effect.elementId && item.effect.elementId !== petData.element) {
    return { ok: false, message: `${item.name} 只适合 ${item.effect.elementId} 系精灵。` };
  }

  if (!PlayerState.removeItem(item.id, 1)) {
    return { ok: false, message: `${item.name} 不足。` };
  }

  pet.evolutionStage = getEvolutionStage(pet) + 1;
  pet.currentStats = computePlayerPetStats(petData, pet.level, pet, pet.natureId, pet.talent);
  pet.currentHp = pet.currentStats.hp;
  pet.learnedSkillIds = skillIdsForLevel(petData.id, pet.level);
  PlayerState.persist();

  return {
    ok: true,
    consumed: true,
    message: `${petData.name} 进化为 ${evolvedPetName(petData, pet)}！`,
  };
}

function findOwnedPet(petKey: string): PlayerPet | undefined {
  return PlayerState.getPlayerPetByInstanceId(petKey) ?? PlayerState.getPlayerPet(petKey);
}

function petDisplayName(pet: PlayerPet): string {
  return PETS[pet.petId]?.name ?? pet.petId;
}
