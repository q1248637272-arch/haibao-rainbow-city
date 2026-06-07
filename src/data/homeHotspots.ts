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

export const HOME_V3_BACKGROUND_KEY = 'legacy_home_integrated_v3';

export interface HomeHotspotImageMask {
  readonly maskTextureKey: string;
  readonly edgeTextureKey: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alphaTolerance: number;
}

export const HOME_HOTSPOT_IMAGE_MASKS = {
  'bed-rest': {
    maskTextureKey: 'home_v3_bed_rest_mask',
    edgeTextureKey: 'home_v3_bed_rest_edge',
    x: 23,
    y: 150,
    width: 238,
    height: 193,
    alphaTolerance: 16,
  },
  'books-task': {
    maskTextureKey: 'home_v3_books_task_mask',
    edgeTextureKey: 'home_v3_books_task_edge',
    x: 181,
    y: 70,
    width: 160,
    height: 169,
    alphaTolerance: 16,
  },
  'energy-flower': {
    maskTextureKey: 'home_v3_energy_flower_mask',
    edgeTextureKey: 'home_v3_energy_flower_edge',
    x: 15,
    y: 382,
    width: 125,
    height: 173,
    alphaTolerance: 16,
  },
  'toy-chest': {
    maskTextureKey: 'home_v3_toy_chest_mask',
    edgeTextureKey: 'home_v3_toy_chest_edge',
    x: 674,
    y: 322,
    width: 109,
    height: 90,
    alphaTolerance: 16,
  },
  'trade-counter': {
    maskTextureKey: 'home_v3_trade_counter_mask',
    edgeTextureKey: 'home_v3_trade_counter_edge',
    x: 635,
    y: 416,
    width: 316,
    height: 187,
    alphaTolerance: 16,
  },
  'garden-plot': {
    maskTextureKey: 'home_v3_garden_plot_mask',
    edgeTextureKey: 'home_v3_garden_plot_edge',
    x: 153,
    y: 379,
    width: 267,
    height: 190,
    alphaTolerance: 16,
  },
  'farm-entrance': {
    maskTextureKey: 'home_v3_farm_entrance_mask',
    edgeTextureKey: 'home_v3_farm_entrance_edge',
    x: 680,
    y: 35,
    width: 144,
    height: 211,
    alphaTolerance: 16,
  },
  'pet-incubator': {
    maskTextureKey: 'home_v3_pet_incubator_mask',
    edgeTextureKey: 'home_v3_pet_incubator_edge',
    x: 570,
    y: 195,
    width: 107,
    height: 151,
    alphaTolerance: 16,
  },
  'purify-table': {
    maskTextureKey: 'home_v3_purify_table_mask',
    edgeTextureKey: 'home_v3_purify_table_edge',
    x: 424,
    y: 252,
    width: 121,
    height: 135,
    alphaTolerance: 16,
  },
  'build-book': {
    maskTextureKey: 'home_v3_build_book_mask',
    edgeTextureKey: 'home_v3_build_book_edge',
    x: 292,
    y: 242,
    width: 105,
    height: 107,
    alphaTolerance: 16,
  },
  'pet-bed': {
    maskTextureKey: 'home_v3_pet_bed_mask',
    edgeTextureKey: 'home_v3_pet_bed_edge',
    x: 789,
    y: 232,
    width: 163,
    height: 134,
    alphaTolerance: 16,
  },
} satisfies Readonly<Record<HomeHotspotId, HomeHotspotImageMask>>;

export const HOME_HOTSPOT_IMAGE_ASSETS = {
  home_v3_bed_rest_mask: 'assets/legacy/image2-restored/home-v3/bed-rest_mask.png',
  home_v3_bed_rest_edge: 'assets/legacy/image2-restored/home-v3/bed-rest_edge.png',
  home_v3_books_task_mask: 'assets/legacy/image2-restored/home-v3/books-task_mask.png',
  home_v3_books_task_edge: 'assets/legacy/image2-restored/home-v3/books-task_edge.png',
  home_v3_build_book_mask: 'assets/legacy/image2-restored/home-v3/build-book_mask.png',
  home_v3_build_book_edge: 'assets/legacy/image2-restored/home-v3/build-book_edge.png',
  home_v3_energy_flower_mask: 'assets/legacy/image2-restored/home-v3/energy-flower_mask.png',
  home_v3_energy_flower_edge: 'assets/legacy/image2-restored/home-v3/energy-flower_edge.png',
  home_v3_farm_entrance_mask: 'assets/legacy/image2-restored/home-v3/farm-entrance_mask.png',
  home_v3_farm_entrance_edge: 'assets/legacy/image2-restored/home-v3/farm-entrance_edge.png',
  home_v3_garden_plot_mask: 'assets/legacy/image2-restored/home-v3/garden-plot_mask.png',
  home_v3_garden_plot_edge: 'assets/legacy/image2-restored/home-v3/garden-plot_edge.png',
  home_v3_pet_bed_mask: 'assets/legacy/image2-restored/home-v3/pet-bed_mask.png',
  home_v3_pet_bed_edge: 'assets/legacy/image2-restored/home-v3/pet-bed_edge.png',
  home_v3_pet_incubator_mask: 'assets/legacy/image2-restored/home-v3/pet-incubator_mask.png',
  home_v3_pet_incubator_edge: 'assets/legacy/image2-restored/home-v3/pet-incubator_edge.png',
  home_v3_purify_table_mask: 'assets/legacy/image2-restored/home-v3/purify-table_mask.png',
  home_v3_purify_table_edge: 'assets/legacy/image2-restored/home-v3/purify-table_edge.png',
  home_v3_toy_chest_mask: 'assets/legacy/image2-restored/home-v3/toy-chest_mask.png',
  home_v3_toy_chest_edge: 'assets/legacy/image2-restored/home-v3/toy-chest_edge.png',
  home_v3_trade_counter_mask: 'assets/legacy/image2-restored/home-v3/trade-counter_mask.png',
  home_v3_trade_counter_edge: 'assets/legacy/image2-restored/home-v3/trade-counter_edge.png',
} as const;
