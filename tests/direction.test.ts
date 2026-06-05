import { describe, expect, it } from 'vitest';

import { computeIsoFacing } from '@/systems/direction';
import type { IsoDir } from '@/types/direction';

describe('computeIsoFacing', () => {
  it('vx>0 & vy>0（右下方）→ se', () => {
    expect(computeIsoFacing(1, 1, 'se')).toBe<IsoDir>('se');
  });

  it('vx>0 & vy<0（右上方）→ ne', () => {
    expect(computeIsoFacing(1, -1, 'se')).toBe<IsoDir>('ne');
  });

  it('vx<0 & vy>0（左下方）→ sw', () => {
    expect(computeIsoFacing(-1, 1, 'se')).toBe<IsoDir>('sw');
  });

  it('vx<0 & vy<0（左上方）→ nw', () => {
    expect(computeIsoFacing(-1, -1, 'se')).toBe<IsoDir>('nw');
  });

  it('只有 vx>0（单纯向右）→ se（屏幕投影最近斜向）', () => {
    expect(computeIsoFacing(1, 0, 'ne')).toBe<IsoDir>('se');
  });

  it('只有 vx<0（单纯向左）→ sw', () => {
    expect(computeIsoFacing(-1, 0, 'ne')).toBe<IsoDir>('sw');
  });

  it('只有 vy>0（单纯向下）→ se', () => {
    expect(computeIsoFacing(0, 1, 'nw')).toBe<IsoDir>('se');
  });

  it('只有 vy<0（单纯向上）→ ne', () => {
    expect(computeIsoFacing(0, -1, 'sw')).toBe<IsoDir>('ne');
  });

  it('静止（vx=0 && vy=0）保持 prev 不变', () => {
    expect(computeIsoFacing(0, 0, 'nw')).toBe<IsoDir>('nw');
    expect(computeIsoFacing(0, 0, 'se')).toBe<IsoDir>('se');
    expect(computeIsoFacing(0, 0, 'ne')).toBe<IsoDir>('ne');
    expect(computeIsoFacing(0, 0, 'sw')).toBe<IsoDir>('sw');
  });

  it('按符号而非量级判定（归一化前后结果一致）', () => {
    const raw = computeIsoFacing(3.7, -0.2, 'se');
    const norm = computeIsoFacing(1, -1, 'se');
    expect(raw).toBe(norm);
  });
});
