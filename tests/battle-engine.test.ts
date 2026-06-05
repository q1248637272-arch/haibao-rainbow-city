import { describe, expect, it } from 'vitest';

import { getBoss } from '@/data/bosses';
import { getPet } from '@/data/pets';
import { SKILLS } from '@/data/skills';
import {
  calcDamage,
  type Combatant,
  computeTurnOrder,
  makeCombatantFromBoss,
  makeCombatantFromPet,
  makeCombatantFromPlayerPet,
  makeCombatantFromWild,
  resolveTurn,
} from '@/systems/BattleEngine';
import { computeStats } from '@/systems/LevelCurve';
import type { Element, PlayerPet, SkillData } from '@/types';

/**
 * 种子化 PRNG（mulberry32）。测试内部私有，避免污染 src。
 * 保证不同测试用相同种子能得到完全相同的随机序列。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 构造一个测试用 combatant：指定 atk/def/spd/hp/element，便于隔离克制倍率的影响。
 */
function makeTestCombatant(overrides: {
  id?: string;
  name?: string;
  element: Element;
  hp?: number;
  atk?: number;
  def?: number;
  spd?: number;
  skillIds?: string[];
}): Combatant {
  const hp = overrides.hp ?? 100;
  return {
    id: overrides.id ?? 'test',
    name: overrides.name ?? '测试单位',
    element: overrides.element,
    stats: {
      hp,
      atk: overrides.atk ?? 50,
      def: overrides.def ?? 30,
      spd: overrides.spd ?? 40,
    },
    currentHp: hp,
    skillIds: overrides.skillIds ?? [],
  };
}

/**
 * 构造测试技能。默认 100 命中、无元素克制（element 由调用方指定）。
 */
function makeTestSkill(overrides: Partial<SkillData> & { element: Element }): SkillData {
  return {
    id: overrides.id ?? 'test_skill',
    name: overrides.name ?? '测试技',
    element: overrides.element,
    power: overrides.power ?? 50,
    accuracy: overrides.accuracy ?? 1.0,
    description: overrides.description ?? '测试用',
  };
}

describe('calcDamage', () => {
  it('rng 恒返回 0 时必命中，且按公式给出最低随机抖动下的伤害', () => {
    // 构造：攻 50 / 防 25，power=50，element 自反 1.0
    const attacker = makeTestCombatant({ element: 'normal', atk: 50, def: 20 });
    const defender = makeTestCombatant({ element: 'normal', atk: 50, def: 25 });
    const skill = makeTestSkill({ element: 'normal', power: 50, accuracy: 1.0 });

    // rng 始终 0：hitRoll = 0 < 1.0（命中），rand = 0.85 + 0 * 0.15 = 0.85
    // base = (50/25) * 50 * 0.5 + 2 = 52；elementMul = 1；damage = floor(52 * 1 * 0.85) = 44
    const alwaysZero = (): number => 0;
    const r = calcDamage(attacker, defender, skill, alwaysZero);
    expect(r.isMiss).toBe(false);
    expect(r.elementMul).toBe(1);
    expect(r.damage).toBe(44);
  });

  it('水系技能打火系 damage 约为打 normal 系的 2 倍（同种子）', () => {
    const attacker = makeTestCombatant({ element: 'water', atk: 50, def: 20 });
    const fireDefender = makeTestCombatant({ element: 'fire', def: 25 });
    const normalDefender = makeTestCombatant({ element: 'normal', def: 25 });
    const skill = makeTestSkill({ element: 'water', power: 50 });

    // 用同一序列的 rng，两次调用分别对比。
    const rngA = mulberry32(42);
    const rngB = mulberry32(42);
    const vsFire = calcDamage(attacker, fireDefender, skill, rngA);
    const vsNormal = calcDamage(attacker, normalDefender, skill, rngB);

    expect(vsFire.isMiss).toBe(false);
    expect(vsNormal.isMiss).toBe(false);
    expect(vsFire.elementMul).toBe(2.0);
    expect(vsNormal.elementMul).toBe(1.0);
    // 水对火应正好是水对 normal 的 2 倍（rng 相同 → rand 相同）。
    // 由于 floor 存在，允许 ±1 点偏差。
    expect(Math.abs(vsFire.damage - vsNormal.damage * 2)).toBeLessThanOrEqual(1);
  });

  it('火系技能打水系 damage 约为打 normal 系的 0.5 倍（同种子）', () => {
    const attacker = makeTestCombatant({ element: 'fire', atk: 60, def: 20 });
    const waterDefender = makeTestCombatant({ element: 'water', def: 25 });
    const normalDefender = makeTestCombatant({ element: 'normal', def: 25 });
    const skill = makeTestSkill({ element: 'fire', power: 60 });

    const rngA = mulberry32(1234);
    const rngB = mulberry32(1234);
    const vsWater = calcDamage(attacker, waterDefender, skill, rngA);
    const vsNormal = calcDamage(attacker, normalDefender, skill, rngB);

    expect(vsWater.elementMul).toBe(0.5);
    expect(vsNormal.elementMul).toBe(1.0);
    // vsNormal 应约为 vsWater 的 2 倍。允许 ±1 floor 偏差。
    expect(Math.abs(vsNormal.damage - vsWater.damage * 2)).toBeLessThanOrEqual(1);
  });

  it('skill.accuracy = 0 时无论 rng 如何都 miss，damage 为 0', () => {
    const attacker = makeTestCombatant({ element: 'normal' });
    const defender = makeTestCombatant({ element: 'normal' });
    const skill = makeTestSkill({ element: 'normal', accuracy: 0 });

    for (const rngValue of [0, 0.1, 0.5, 0.999]) {
      const r = calcDamage(attacker, defender, skill, () => rngValue);
      expect(r.isMiss).toBe(true);
      expect(r.damage).toBe(0);
    }
  });
});

describe('computeTurnOrder', () => {
  it('speed 更高的一方先行动', () => {
    const fastPlayer = makeTestCombatant({ element: 'normal', spd: 80 });
    const slowBoss = makeTestCombatant({ element: 'normal', spd: 30 });
    expect(computeTurnOrder({ player: fastPlayer, boss: slowBoss })).toBe('player');

    const slowPlayer = makeTestCombatant({ element: 'normal', spd: 20 });
    const fastBoss = makeTestCombatant({ element: 'normal', spd: 50 });
    expect(computeTurnOrder({ player: slowPlayer, boss: fastBoss })).toBe('boss');
  });

  it('speed 相等时玩家先行动', () => {
    const p = makeTestCombatant({ element: 'normal', spd: 40 });
    const b = makeTestCombatant({ element: 'normal', spd: 40 });
    expect(computeTurnOrder({ player: p, boss: b })).toBe('player');
  });
});

describe('resolveTurn', () => {
  it('一方 HP 被打到 0 时 ended 非 null，且慢方不再行动（log 只有 1 条）', () => {
    const player: Combatant = makeTestCombatant({
      id: 'p',
      name: '测玩家',
      element: 'normal',
      hp: 200,
      atk: 80,
      def: 30,
      spd: 50,
      skillIds: ['tackle'],
    });
    // BOSS 仅剩 1 HP，玩家先手一击必杀；BOSS 不应再行动，log 只有 1 条。
    const boss: Combatant = {
      ...makeTestCombatant({
        id: 'b',
        name: '测 BOSS',
        element: 'normal',
        hp: 1,
        atk: 30,
        def: 10,
        spd: 10,
        skillIds: ['tackle'],
      }),
      currentHp: 1,
    };
    const result = resolveTurn(
      { player, boss },
      'tackle',
      'tackle',
      mulberry32(7),
    );
    expect(result.ended).toBe('boss');
    expect(result.log.length).toBe(1);
    expect(result.nextState.boss.currentHp).toBe(0);
    // 入参不被修改（纯函数式）
    expect(boss.currentHp).toBe(1);
    expect(player.currentHp).toBe(200);
  });

  it('VIP 精灵 rainbow_wing 用固定种子能在 ≤ 12 回合内击败 shadow_overlord', () => {
    const pet = getPet('rainbow_wing');
    const boss = getBoss('shadow_overlord');
    expect(pet).toBeDefined();
    expect(boss).toBeDefined();
    if (!pet || !boss) return;

    const rng = mulberry32(20240301);
    let state = {
      player: makeCombatantFromPet(pet),
      boss: makeCombatantFromBoss(boss),
    };
    const maxTurns = 12;
    let turns = 0;
    let ended: 'player' | 'boss' | null = null;

    while (turns < maxTurns) {
      turns += 1;
      // 玩家优先选最强的 sacred_beam（VIP 招牌技）。其余回合交替使用余下技能。
      const playerSkill = pet.skillIds.includes('sacred_beam')
        ? 'sacred_beam'
        : (pet.skillIds[turns % pet.skillIds.length] ?? pet.skillIds[0] ?? 'tackle');
      // BOSS 用伪随机选技。
      const idx = Math.floor(rng() * boss.skillIds.length);
      const enemySkill = boss.skillIds[idx] ?? boss.skillIds[0] ?? 'tackle';

      const r = resolveTurn(state, playerSkill, enemySkill, rng);
      state = r.nextState;
      if (r.ended) {
        ended = r.ended;
        break;
      }
    }

    expect(ended).toBe('boss');
    expect(turns).toBeLessThanOrEqual(12);
  });

  it('resolveTurn 返回的 nextState 为全新对象，不修改入参', () => {
    const player = makeTestCombatant({
      element: 'water',
      hp: 100,
      atk: 60,
      def: 25,
      spd: 50,
      skillIds: ['water_jet'],
    });
    const boss = makeTestCombatant({
      element: 'fire',
      hp: 100,
      atk: 40,
      def: 20,
      spd: 30,
      skillIds: ['ember_spark'],
    });
    expect(SKILLS['water_jet']).toBeDefined();
    expect(SKILLS['ember_spark']).toBeDefined();

    const initialState = { player, boss };
    const rng = mulberry32(999);
    const r = resolveTurn(initialState, 'water_jet', 'ember_spark', rng);

    // 原对象未被改动
    expect(player.currentHp).toBe(100);
    expect(boss.currentHp).toBe(100);
    // 返回新引用
    expect(r.nextState).not.toBe(initialState);
    expect(r.nextState.player).not.toBe(player);
    expect(r.nextState.boss).not.toBe(boss);
    // 至少有一条 log
    expect(r.log.length).toBeGreaterThanOrEqual(1);
    expect(r.log.length).toBeLessThanOrEqual(2);
  });

  it('速度高者先手；相同速度时玩家先手', () => {
    // 玩家 spd = boss spd，玩家应先手：玩家一击秒杀，log 只有 1 条。
    const player = makeTestCombatant({
      id: 'p',
      element: 'normal',
      hp: 50,
      atk: 100,
      def: 10,
      spd: 30,
      skillIds: ['tackle'],
    });
    const boss: Combatant = {
      ...makeTestCombatant({
        id: 'b',
        element: 'normal',
        hp: 1,
        atk: 10,
        def: 10,
        spd: 30,
        skillIds: ['tackle'],
      }),
      currentHp: 1,
    };
    const r = resolveTurn({ player, boss }, 'tackle', 'tackle', mulberry32(1));
    expect(r.ended).toBe('boss');
    expect(r.log.length).toBe(1);
  });
});

/**
 * FEAT-206 · wild 遭遇相关的 smoke test。
 *
 * BattleEngine 本身不区分 boss / wild（都是 Combatant），所以这里只是验证：
 *   (1) `makeCombatantFromPlayerPet` + `makeCombatantFromWild` 能构造出正确 spd / hp 的对手；
 *   (2) resolveTurn 跑一回合后双方 HP 变化合理（至少有一方扣血 > 0）；
 *   (3) computeTurnOrder 不受 wild / boss 区分影响。
 */
describe('FEAT-206 wild battle smoke', () => {
  it('rainbow_wing Lv5 对 wild aqua_turtle Lv5：一回合后 HP 均合理下降', () => {
    const rainbow = getPet('rainbow_wing');
    const aqua = getPet('aqua_turtle');
    expect(rainbow).toBeDefined();
    expect(aqua).toBeDefined();
    if (!rainbow || !aqua) return;

    // 玩家 Lv5 PlayerPet 快照：用 LevelCurve 算出 currentStats 与满血。
    const rainbowStats = computeStats(rainbow.baseStats, 5);
    const playerPet: PlayerPet = {
      petId: rainbow.id,
      level: 5,
      exp: 0,
      learnedSkillIds: rainbow.skillIds.slice(0, 2),
      currentStats: rainbowStats,
      currentHp: rainbowStats.hp,
    };

    const player = makeCombatantFromPlayerPet(playerPet, rainbow);
    const wild = makeCombatantFromWild(aqua, 5, computeStats);

    // wild HP 与玩家 stats 都应与 Lv5 预期一致（base + 4 * 成长）。
    expect(wild.currentHp).toBe(aqua.baseStats.hp + 4 * 3);
    expect(player.currentHp).toBe(rainbow.baseStats.hp + 4 * 3);
    expect(player.stats.hp).toBe(player.currentHp);
    expect(wild.stats.hp).toBe(wild.currentHp);

    const playerSkill = player.skillIds[0] ?? 'tackle';
    const wildSkill = wild.skillIds[0] ?? 'tackle';
    expect(SKILLS[playerSkill]).toBeDefined();
    expect(SKILLS[wildSkill]).toBeDefined();

    const rng = mulberry32(42);
    const result = resolveTurn({ player, boss: wild }, playerSkill, wildSkill, rng);

    // 合理性 smoke：返回了 1 或 2 条 log、nextState 是新引用、双方 HP 未升高。
    expect(result.log.length).toBeGreaterThanOrEqual(1);
    expect(result.log.length).toBeLessThanOrEqual(2);
    expect(result.nextState).not.toBe({ player, boss: wild });
    expect(result.nextState.player.currentHp).toBeLessThanOrEqual(player.currentHp);
    expect(result.nextState.boss.currentHp).toBeLessThanOrEqual(wild.currentHp);
  });

  it('computeTurnOrder 对 wild 对手与 BOSS 对手一视同仁，仅看 spd', () => {
    const aqua = getPet('aqua_turtle');
    const rainbow = getPet('rainbow_wing');
    const shadow = getBoss('shadow_overlord');
    expect(aqua).toBeDefined();
    expect(rainbow).toBeDefined();
    expect(shadow).toBeDefined();
    if (!aqua || !rainbow || !shadow) return;

    // 玩家 rainbow_wing spd base 65 + 4 = 69；wild aqua_turtle spd base 40 + 4 = 44；
    // 应该玩家先手。
    const rainbowStats = computeStats(rainbow.baseStats, 5);
    const playerPet: PlayerPet = {
      petId: rainbow.id,
      level: 5,
      exp: 0,
      learnedSkillIds: rainbow.skillIds.slice(0, 2),
      currentStats: rainbowStats,
      currentHp: rainbowStats.hp,
    };
    const player = makeCombatantFromPlayerPet(playerPet, rainbow);
    const wild = makeCombatantFromWild(aqua, 5, computeStats);
    const bossCombatant = makeCombatantFromBoss(shadow);

    expect(computeTurnOrder({ player, boss: wild })).toBe('player');
    // 对 BOSS 同样根据 spd 判定（rainbow_wing Lv5 spd=69 vs shadow_overlord spd=18 → player）
    expect(computeTurnOrder({ player, boss: bossCombatant })).toBe('player');
  });
});
