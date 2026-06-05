import { PETS } from '@/data/pets';
import { stageForWildLevel } from '@/systems/EvolutionSystem';
import { createPlayerPet } from '@/systems/PetInstance';
import type { PlayerPet } from '@/types';

export interface VirtualPlayer {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly avatarKey: string;
  readonly tint: number;
  readonly party: readonly PlayerPet[];
  readonly coins: number;
  readonly isVip: boolean;
}

export interface VirtualPlayerAvatarAsset {
  readonly key: string;
  readonly path: string;
}

export const VIRTUAL_PLAYER_AVATAR_FRAME_WIDTH = 96;
export const VIRTUAL_PLAYER_AVATAR_FRAME_HEIGHT = 128;
export const VIRTUAL_PLAYER_AVATAR_COUNT = 24;

export const VIRTUAL_PLAYER_AVATAR_ASSETS: readonly VirtualPlayerAvatarAsset[] = Array.from(
  { length: VIRTUAL_PLAYER_AVATAR_COUNT },
  (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const key = `legacy_virtual_player_${number}_image2_sheet`;
    return {
      key,
      path: `assets/legacy/image2-restored/characters/virtual-players/sheets/${key}.png`,
    };
  },
);

export const VIRTUAL_PLAYER_AVATAR_KEYS = VIRTUAL_PLAYER_AVATAR_ASSETS.map((asset) => asset.key);

const FAMILY_NAMES = [
  '林',
  '顾',
  '沈',
  '许',
  '叶',
  '程',
  '苏',
  '陆',
  '周',
  '夏',
  '洛',
  '蓝',
  '星',
  '海',
  '岚',
  '沐',
];

const GIVEN_NAMES = [
  '澈',
  '遥',
  '羽',
  '宁',
  '晴',
  '舟',
  '芮',
  '然',
  '瑾',
  '霖',
  '星野',
  '听潮',
  '知夏',
  '云起',
  '青岚',
  '小贝',
];

const TRAINER_TITLES = [
  '巡海训练师',
  '星潮挑战者',
  '珊瑚学员',
  '贝壳收藏家',
  '灯塔向导',
  '彩虹冒险家',
  '潮汐舞者',
  '水晶研究员',
  '风帆队长',
  '泡泡画师',
  '秘境跑者',
  '能量调律师',
];

const PET_IDS = Object.values(PETS)
  .filter((pet) => pet.vipOnly !== true)
  .map((pet) => pet.id);

const VIP_PET_IDS = Object.values(PETS)
  .filter((pet) => pet.vipOnly === true)
  .map((pet) => pet.id);

export function generateVirtualPlayers(opts: {
  readonly locationId: string;
  readonly count: number;
  readonly minLevel: number;
  readonly maxLevel: number;
  readonly seed?: string;
}): VirtualPlayer[] {
  const rng = mulberry32(hashString(opts.seed ?? opts.locationId));
  const count = Math.max(0, Math.floor(opts.count));
  const minLevel = Math.max(1, Math.floor(opts.minLevel));
  const maxLevel = Math.max(minLevel, Math.floor(opts.maxLevel));
  const players: VirtualPlayer[] = [];
  const avatarOffset = pickInt(rng, 0, VIRTUAL_PLAYER_AVATAR_KEYS.length - 1);

  for (let i = 0; i < count; i += 1) {
    const id = `${opts.locationId}:virtual-player:${i}`;
    const isVip = rng() > 0.82;
    const partySize = pickInt(rng, 1, isVip ? 3 : 2);
    const party = buildParty(rng, partySize, minLevel, maxLevel, isVip);
    players.push({
      id,
      name: `${pick(rng, FAMILY_NAMES)}${pick(rng, GIVEN_NAMES)}`,
      title: pick(rng, TRAINER_TITLES),
      avatarKey: VIRTUAL_PLAYER_AVATAR_KEYS[(avatarOffset + i) % VIRTUAL_PLAYER_AVATAR_KEYS.length]!,
      tint: 0xffffff,
      party,
      coins: pickInt(rng, 120, 980),
      isVip,
    });
  }

  return players;
}

export function virtualPlayerDisplayName(player: VirtualPlayer): string {
  const vip = player.isVip ? 'VIP ' : '';
  return `${vip}${player.title} ${player.name}`;
}

function buildParty(
  rng: () => number,
  partySize: number,
  minLevel: number,
  maxLevel: number,
  isVip: boolean,
): PlayerPet[] {
  const available = [...PET_IDS];
  if (isVip) available.push(...VIP_PET_IDS);
  const party: PlayerPet[] = [];
  for (let i = 0; i < partySize; i += 1) {
    const petId = pick(rng, available);
    const pet = PETS[petId];
    if (!pet) continue;
    const level = pickInt(rng, minLevel, maxLevel);
    const evolutionStage = stageForWildLevel(level);
    party.push(createPlayerPet(pet, level, { evolutionStage, rng }));
  }
  return party;
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)] ?? values[0]!;
}

function pickInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
