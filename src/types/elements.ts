/**
 * 元素属性。light 为稀有光属性，目前仅 VIP 精灵/圣光类技能使用。
 */
export type Element = 'fire' | 'water' | 'grass' | 'electric' | 'normal' | 'light';

/**
 * 所有可用的元素字面量数组，用于迭代构造属性克制矩阵或 UI 展示。
 */
export const ELEMENTS: readonly Element[] = [
  'fire',
  'water',
  'grass',
  'electric',
  'normal',
  'light',
] as const;
