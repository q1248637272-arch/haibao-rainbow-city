import type { Element } from '@/types';
import { ELEMENTS } from '@/types';

/**
 * 构造一条元素的默认克制映射：对所有元素造成 1.0 倍伤害。
 */
function defaultRow(): Record<Element, number> {
  const row = {} as Record<Element, number>;
  for (const e of ELEMENTS) {
    row[e] = 1.0;
  }
  return row;
}

/**
 * 属性克制矩阵。ELEMENT_MATCHUP[attacker][defender] 表示攻击方对防守方的倍率。
 * 简化规则：
 *   水 > 火 > 草 > 水（循环克制 2.0 / 反向 0.5）
 *   电 > 水，火 > 电（单向，反向 0.5）
 *   其它组合为 1.0（含 normal / light 对所有元素）。
 */
export const ELEMENT_MATCHUP: Record<Element, Record<Element, number>> = {
  fire: {
    ...defaultRow(),
    water: 0.5,
    grass: 2.0,
    electric: 0.5,
  },
  water: {
    ...defaultRow(),
    fire: 2.0,
    grass: 0.5,
    electric: 1.0,
  },
  grass: {
    ...defaultRow(),
    water: 2.0,
    fire: 0.5,
  },
  electric: {
    ...defaultRow(),
    water: 2.0,
  },
  normal: defaultRow(),
  light: defaultRow(),
};

/**
 * 元素中文名，用于战斗信息栏与精灵卡。
 */
export const ELEMENT_LABEL_CN: Record<Element, string> = {
  fire: '火',
  water: '水',
  grass: '草',
  electric: '电',
  normal: '普通',
  light: '光',
};

/**
 * 元素配色（0xRRGGBB），用于占位纹理描边与 UI。
 */
export const ELEMENT_COLOR: Record<Element, number> = {
  fire: 0xff6b35,
  water: 0x3aa0ff,
  grass: 0x4cc26b,
  electric: 0xffd83a,
  normal: 0xb0b0b0,
  light: 0xffe8b0,
};
