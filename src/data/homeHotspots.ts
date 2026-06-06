import type { ContourHitArea } from '@/systems/ContourHitArea';

export const HOME_FIXED_HOTSPOT_IDS = [
  'bed-rest',
  'books-task',
  'energy-flower',
  'toy-chest',
  'trade-counter',
  'garden-plot',
  'farm-entrance',
  'pet-incubator',
  'purify-table',
  'build-book',
  'pet-bed',
] as const;

export type HomeHotspotId = (typeof HOME_FIXED_HOTSPOT_IDS)[number];

export const HOME_HOTSPOT_CONTOURS = {
  'bed-rest': {
    kind: 'polygon',
    points: [
      { x: 72, y: 216 },
      { x: 144, y: 178 },
      { x: 204, y: 210 },
      { x: 206, y: 276 },
      { x: 132, y: 320 },
      { x: 62, y: 278 },
    ],
  },
  'books-task': {
    kind: 'polygon',
    points: [
      { x: 250, y: 98 },
      { x: 350, y: 92 },
      { x: 372, y: 138 },
      { x: 334, y: 176 },
      { x: 260, y: 168 },
      { x: 238, y: 124 },
    ],
  },
  'energy-flower': {
    kind: 'polygon',
    points: [
      { x: 18, y: 368 },
      { x: 66, y: 350 },
      { x: 102, y: 386 },
      { x: 92, y: 438 },
      { x: 40, y: 456 },
      { x: 8, y: 420 },
    ],
  },
  'toy-chest': {
    kind: 'polygon',
    points: [
      { x: 708, y: 198 },
      { x: 780, y: 174 },
      { x: 824, y: 216 },
      { x: 808, y: 266 },
      { x: 736, y: 288 },
      { x: 696, y: 244 },
    ],
  },
  'trade-counter': {
    kind: 'polygon',
    points: [
      { x: 736, y: 334 },
      { x: 866, y: 326 },
      { x: 900, y: 382 },
      { x: 852, y: 438 },
      { x: 742, y: 432 },
      { x: 706, y: 378 },
    ],
  },
  'garden-plot': {
    kind: 'polygon',
    points: [
      { x: 128, y: 458 },
      { x: 242, y: 410 },
      { x: 356, y: 468 },
      { x: 250, y: 542 },
      { x: 132, y: 514 },
    ],
  },
  'farm-entrance': {
    kind: 'polygon',
    points: [
      { x: 560, y: 134 },
      { x: 622, y: 84 },
      { x: 688, y: 134 },
      { x: 696, y: 224 },
      { x: 650, y: 282 },
      { x: 594, y: 282 },
      { x: 548, y: 224 },
    ],
  },
  'pet-incubator': {
    kind: 'polygon',
    points: [
      { x: 592, y: 318 },
      { x: 672, y: 292 },
      { x: 730, y: 344 },
      { x: 714, y: 414 },
      { x: 628, y: 440 },
      { x: 576, y: 390 },
    ],
  },
  'purify-table': {
    kind: 'polygon',
    points: [
      { x: 386, y: 192 },
      { x: 454, y: 162 },
      { x: 526, y: 194 },
      { x: 508, y: 260 },
      { x: 438, y: 286 },
      { x: 376, y: 250 },
    ],
  },
  'build-book': {
    kind: 'polygon',
    points: [
      { x: 184, y: 152 },
      { x: 244, y: 134 },
      { x: 294, y: 168 },
      { x: 278, y: 218 },
      { x: 214, y: 236 },
      { x: 172, y: 202 },
    ],
  },
  'pet-bed': {
    kind: 'polygon',
    points: [
      { x: 802, y: 208 },
      { x: 870, y: 182 },
      { x: 918, y: 220 },
      { x: 906, y: 274 },
      { x: 838, y: 300 },
      { x: 790, y: 262 },
    ],
  },
} satisfies Readonly<Record<HomeHotspotId, ContourHitArea>>;
