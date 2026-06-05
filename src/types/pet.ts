import type { Element } from './elements';

/**
 * 精灵/BOSS 共用的基础数值。
 */
export interface PetStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  spAtk?: number;
  spDef?: number;
  crit?: number;
  accuracy?: number;
  evasion?: number;
}

/**
 * 精灵天赋值，参考经典页游宠物养成里的“先天资质”层。
 *
 * 数值范围统一为 0~31，运行时会按等级折算成少量属性加成；它不替代性格，
 * 而是让同一种精灵的不同个体在成长上有更明确的差异。
 */
export interface PetTalent {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  spAtk: number;
  spDef: number;
}

export type PetNatureId =
  | 'balanced'
  | 'brave'
  | 'bold'
  | 'timid'
  | 'calm'
  | 'smart'
  | 'sturdy'
  | 'fierce'
  | 'agile'
  | 'gentle'
  | 'focused'
  | 'guardian';

/**
 * 占位纹理的几何形状。
 *
 * @deprecated FEAT-203 起，精灵贴图由 `PetVisual.silhouette` 驱动等距 Q 版绘制；
 *             `PetShape` 仅保留为 `PetVisual.legacyShape` 的类型别名，用于回退兼容
 *             （未知 id 或旧纹理路径）。未来真美术替换后可整体移除。
 *
 * - 抽象几何：circle / square / diamond / star
 * - 特殊友情精灵形态：turtle / pig / rabbit / bird / mountain / chicken / blade
 */
export type PetShape =
  | 'circle'
  | 'square'
  | 'diamond'
  | 'star'
  | 'turtle'
  | 'pig'
  | 'rabbit'
  | 'bird'
  | 'mountain'
  | 'chicken'
  | 'blade';

/**
 * 精灵/BOSS 等距 Q 版视觉配置（FEAT-203 引入）。
 *
 * 由 `src/utils/isoPetSprite.ts` 根据 `silhouette` 分派到 5 个绘制子函数
 * （drawQuadruped / drawBiped / drawFloater / drawStatic / drawBlade），
 * 统一产出"椭圆阴影 → 底座/主体 → 高光 → 轮廓"的 2.5D 造型。
 *
 * - `legacyShape` 保留旧几何形状，仅供 MVP 占位回退与存档兼容使用。
 * - `bodyColor` 一般与 `PetData.portraitColor` 保持一致（测试会强校验），
 *   `accentColor` 是亮一档的高光色（建议 `bodyColor | 0x303030`），
 *   `outlineColor` 统一用深色（0x1b1b3a）描边让 Q 版感更强。
 * - `shadowOpacity` 控制地面椭圆阴影 alpha；floater 形态会自行把阴影偏下模拟漂浮。
 * - `sizeClass` 决定纹理尺寸：small=48, medium=64, large=96, xlarge=128（FEAT-311 起 BOSS 专用）。
 */
export interface PetVisual {
  readonly legacyShape: PetShape;
  readonly silhouette: 'quadruped' | 'biped' | 'floater' | 'static' | 'blade';
  readonly bodyColor: number;
  readonly accentColor: number;
  readonly outlineColor: number;
  readonly shadowOpacity: number;
  readonly sizeClass: 'small' | 'medium' | 'large' | 'xlarge';
}

/**
 * 玩家拥有的一只精灵的运行时状态（FEAT-205 引入）。
 *
 * - `petId` 指向 PETS 表中的 id（不可变）。
 * - 新存档起始精灵 / 迁移 v1 存档默认以当前开局等级登记，被捕获的野怪使用遭遇等级登记；
 * - `exp` 为当前级内已累积经验，达到 `expToNext(level)` 即升级一次（gainExp 会循环直到扣完）。
 * - `learnedSkillIds` 为当前已学到的技能 id 列表，按 `PetData.skillIds` 的顺序推进；
 *   FEAT-308 起优先按 `PET_LEARNSETS` 的等级表解锁。
 * - `evolutionStage`：0=初始，1=成长体，2=完全体。旧存档可缺省，读取时按 0 处理。
 * - `currentStats` 为 `LevelCurve.computeStats(base, level)` 的缓存，避免每次访问都重算。
 * - `currentHp` 用于在离开战斗后保留残血，进入下场战斗前由 BattleEngine 重置为 max。
 *
 * 这个对象会被 SaveManager 持久化到 localStorage，因此字段全部可序列化。
 */
export interface PlayerPet {
  readonly instanceId?: string;
  readonly petId: string;
  readonly natureId?: PetNatureId;
  talent?: PetTalent;
  level: number;
  exp: number;
  learnedSkillIds: string[];
  evolutionStage?: number;
  currentStats: PetStats;
  currentHp: number;
}

/**
 * 精灵数据表条目。
 */
export interface PetData {
  id: string;
  name: string;
  element: Element;
  baseStats: PetStats;
  /** 2~4 个基础技能 id，对应 SKILLS 表；完整升级技能表见 `PET_LEARNSETS`。 */
  skillIds: string[];
  /** 是否为 VIP 专属精灵。 */
  vipOnly: boolean;
  description: string;
  /** 占位纹理主色（0xRRGGBB）。 */
  portraitColor: number;
  shape: PetShape;
  /** 等距 Q 版视觉配置（FEAT-203）。必填：14 只已有精灵 + 1 BOSS 全部补齐。 */
  visual: PetVisual;
}
