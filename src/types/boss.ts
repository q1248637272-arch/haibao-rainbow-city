import type { Element } from './elements';
import type { PetShape, PetStats, PetVisual } from './pet';

/**
 * BOSS 数据表条目。相比 PetData 额外携带奖励信息。
 */
export interface BossData {
  id: string;
  name: string;
  element: Element;
  stats: PetStats;
  /** 3~4 个技能 id，对应 SKILLS 表。 */
  skillIds: string[];
  rewardCoins: number;
  rewardText: string;
  portraitColor: number;
  shape: PetShape;
  /** 等距 Q 版视觉配置（FEAT-203）。BOSS 建议 sizeClass='large'。 */
  visual: PetVisual;
}
