import { describe, expect, it, vi } from 'vitest';

import {
  QuestEngine,
  claimReward,
  evalProgress,
  initQuestStates,
  tryUnlock,
  type QuestEvent,
} from '@/systems/QuestEngine';
import type { QuestDefinition, QuestReward, QuestState } from '@/types';

/**
 * 构造一条简化的主线任务：击败 shadow_overlord。
 */
function questDefeatBoss(): QuestDefinition {
  return {
    id: 'q_test_001',
    kind: 'main',
    title: '击败暗影霸主',
    description: '测试用',
    conditions: [{ kind: 'defeat_boss', bossId: 'shadow_overlord' }],
    reward: { coins: 100 },
  };
}

/**
 * 构造一条捕捉指定精灵的任务。
 */
function questCapturePet(): QuestDefinition {
  return {
    id: 'q_test_capture',
    kind: 'main',
    title: '收服小犬',
    description: '测试用',
    conditions: [{ kind: 'capture_pet', petId: 'flame_puppy' }],
    reward: { coins: 50 },
  };
}

/**
 * 构造 capture_any 5 次的任务（也用于主线第 8 条）。
 */
function questCaptureAny(count: number): QuestDefinition {
  return {
    id: 'q_test_capture_any',
    kind: 'main',
    title: '收集精灵',
    description: '测试用',
    conditions: [{ kind: 'capture_any', count }],
    reward: { coins: 100 },
  };
}

/**
 * 构造到达某地图的任务。
 */
function questReachMap(mapId: string): QuestDefinition {
  return {
    id: 'q_test_reach',
    kind: 'main',
    title: `去 ${mapId}`,
    description: '测试用',
    conditions: [{ kind: 'reach_map', mapId }],
    reward: { coins: 50 },
  };
}

/**
 * 构造 shop:purchase 消费 N 币的任务。
 */
function questSpendCoins(amount: number): QuestDefinition {
  return {
    id: 'q_test_spend',
    kind: 'main',
    title: `消费 ${amount}`,
    description: '测试用',
    conditions: [{ kind: 'spend_coins', amount }],
    reward: { coins: 50 },
  };
}

function questCollectItem(itemId: string, count: number): QuestDefinition {
  return {
    id: 'q_test_collect',
    kind: 'daily',
    title: `收集 ${itemId}`,
    description: '测试用',
    conditions: [{ kind: 'collect_item', itemId, count }],
    reward: { coins: 50 },
  };
}

describe('QuestEngine.initQuestStates', () => {
  it('主线首条（无 prereq）默认 active；有 prereq 的主线默认 locked', () => {
    const defs: QuestDefinition[] = [
      questDefeatBoss(),
      {
        ...questDefeatBoss(),
        id: 'q_test_002',
        prerequisites: ['q_test_001'],
      },
    ];
    const states = initQuestStates(defs);
    expect(states['q_test_001']?.status).toBe('active');
    expect(states['q_test_002']?.status).toBe('locked');
  });

  it('daily 任务默认 active 且 progress 为空对象', () => {
    const daily: QuestDefinition = {
      id: 'd_x',
      kind: 'daily',
      title: 't',
      description: 'd',
      conditions: [{ kind: 'capture_any', count: 1 }],
      reward: { coins: 10 },
    };
    const states = initQuestStates([daily]);
    expect(states['d_x']?.status).toBe('active');
    expect(states['d_x']?.progress).toEqual({});
  });
});

describe('QuestEngine.evalProgress', () => {
  it('battle:victory 命中 defeat_boss 会把任务推到 claimable', () => {
    const def = questDefeatBoss();
    const init = initQuestStates([def])['q_test_001'];
    expect(init).toBeDefined();
    const event: QuestEvent = {
      kind: 'battle:victory',
      enemyId: 'shadow_overlord',
      enemyKind: 'boss',
      petId: 'flame_puppy',
    };
    const after = evalProgress(init as QuestState, def, event);
    expect(after.status).toBe('claimable');
    expect(after.progress['shadow_overlord']).toBe(1);
  });

  it('defeat_boss 对 enemyKind=wild 不响应', () => {
    const def = questDefeatBoss();
    const init = initQuestStates([def])['q_test_001'] as QuestState;
    const event: QuestEvent = {
      kind: 'battle:victory',
      enemyId: 'shadow_overlord',
      enemyKind: 'wild',
      petId: 'flame_puppy',
    };
    const after = evalProgress(init, def, event);
    expect(after).toBe(init);
  });

  it('battle:victory enemyKind=trainer 会推进 defeat_trainer 任务', () => {
    const def: QuestDefinition = {
      id: 'q_test_trainer',
      kind: 'daily',
      title: '训练师切磋',
      description: '测试用',
      conditions: [{ kind: 'defeat_trainer', count: 2 }],
      reward: { coins: 50 },
    };
    let state = initQuestStates([def])['q_test_trainer'] as QuestState;
    state = evalProgress(state, def, {
      kind: 'battle:victory',
      enemyId: 'center:virtual-player:0',
      enemyKind: 'trainer',
      petId: 'flame_puppy',
    });
    expect(state.status).toBe('active');
    expect(state.progress['defeat_trainer']).toBe(1);

    state = evalProgress(state, def, {
      kind: 'battle:victory',
      enemyId: 'center:virtual-player:1',
      enemyKind: 'trainer',
      petId: 'flame_puppy',
    });
    expect(state.status).toBe('claimable');
    expect(state.progress['defeat_trainer']).toBe(2);
  });

  it('capture:success 命中 capture_pet 转 claimable', () => {
    const def = questCapturePet();
    const init = initQuestStates([def])['q_test_capture'] as QuestState;
    const event: QuestEvent = { kind: 'capture:success', petId: 'flame_puppy' };
    const after = evalProgress(init, def, event);
    expect(after.status).toBe('claimable');
  });

  it('capture_any 累加多次才会 claimable（count=3）', () => {
    const def = questCaptureAny(3);
    let state = initQuestStates([def])['q_test_capture_any'] as QuestState;
    const event: QuestEvent = { kind: 'capture:success', petId: 'flame_puppy' };
    state = evalProgress(state, def, event);
    expect(state.status).toBe('active');
    expect(state.progress['capture_any']).toBe(1);
    state = evalProgress(state, def, { kind: 'capture:success', petId: 'aqua_turtle' });
    state = evalProgress(state, def, { kind: 'capture:success', petId: 'spark_mouse' });
    expect(state.progress['capture_any']).toBe(3);
    expect(state.status).toBe('claimable');
  });

  it('pet:hatch 会推进 hatch_any 任务', () => {
    const def: QuestDefinition = {
      id: 'q_test_hatch',
      kind: 'daily',
      title: '孵化记录',
      description: '测试用',
      conditions: [{ kind: 'hatch_any', count: 1 }],
      reward: { coins: 50 },
    };
    const init = initQuestStates([def])['q_test_hatch'] as QuestState;
    const after = evalProgress(init, def, { kind: 'pet:hatch', petId: 'cloud_ferret' });
    expect(after.status).toBe('claimable');
    expect(after.progress['hatch_any']).toBe(1);
  });

  it('reach_map 重复进入同一地图不会重复推进', () => {
    const def = questReachMap('beach');
    let state = initQuestStates([def])['q_test_reach'] as QuestState;
    const event: QuestEvent = { kind: 'map:enter', mapId: 'beach' };
    state = evalProgress(state, def, event);
    expect(state.status).toBe('claimable');
    expect(state.progress['beach']).toBe(1);
    // 再进一次：应返回同一引用（无变化）。
    const after = evalProgress(state, def, event);
    // claimable 状态下 evalProgress 直接返回原对象。
    expect(after).toBe(state);
  });

  it('shop:purchase 累计 spend_coins', () => {
    const def = questSpendCoins(150);
    let state = initQuestStates([def])['q_test_spend'] as QuestState;
    state = evalProgress(state, def, {
      kind: 'shop:purchase',
      itemId: 'pokeball_normal',
      quantity: 5,
      totalCost: 50,
    });
    expect(state.progress['spend_coins']).toBe(50);
    expect(state.status).toBe('active');
    state = evalProgress(state, def, {
      kind: 'shop:purchase',
      itemId: 'potion_small',
      quantity: 1,
      totalCost: 120,
    });
    expect(state.progress['spend_coins']).toBe(170);
    expect(state.status).toBe('claimable');
  });

  it('item:collect 会推进 collect_item，不需要伪装成商店购买', () => {
    const def = questCollectItem('gold_shell', 2);
    let state = initQuestStates([def])['q_test_collect'] as QuestState;

    state = evalProgress(state, def, {
      kind: 'item:collect',
      itemId: 'gold_shell',
      quantity: 1,
      source: 'beach:shell_ridge',
    });
    expect(state.status).toBe('active');
    expect(state.progress['gold_shell']).toBe(1);

    state = evalProgress(state, def, {
      kind: 'item:collect',
      itemId: 'gold_shell',
      quantity: 1,
      source: 'beach:shell_ridge',
    });
    expect(state.status).toBe('claimable');
    expect(state.progress['gold_shell']).toBe(2);
  });

  it('collect_item_from 只接受指定地图来源的真实采集', () => {
    const def: QuestDefinition = {
      id: 'q_test_collect_source',
      kind: 'daily',
      title: '来源采集',
      description: '测试用',
      conditions: [
        { kind: 'collect_item_from', itemId: 'gold_shell', source: 'beach:shell_ridge', count: 2 },
      ],
      reward: { coins: 1 },
    };
    let state = initQuestStates([def])['q_test_collect_source'] as QuestState;

    state = evalProgress(state, def, {
      kind: 'shop:purchase',
      itemId: 'gold_shell',
      quantity: 99,
      totalCost: 0,
    });
    expect(state.status).toBe('active');
    expect(state.progress['collect:beach:shell_ridge:gold_shell']).toBeUndefined();

    state = evalProgress(state, def, {
      kind: 'item:collect',
      itemId: 'gold_shell',
      quantity: 1,
      source: 'beach:coral_glint',
    });
    expect(state.status).toBe('active');
    expect(state.progress['collect:beach:shell_ridge:gold_shell']).toBeUndefined();

    state = evalProgress(state, def, {
      kind: 'item:collect',
      itemId: 'gold_shell',
      quantity: 2,
      source: 'beach:shell_ridge',
    });
    expect(state.status).toBe('claimable');
    expect(state.progress['collect:beach:shell_ridge:gold_shell']).toBe(2);
  });

  it('minigame:complete 鍚屾椂鎺ㄨ繘娆℃暟鍜屾渶楂樺垎鏉′欢', () => {
    const def: QuestDefinition = {
      id: 'q_test_minigame',
      kind: 'main',
      title: '潮汐试炼',
      description: '测试用',
      conditions: [
        { kind: 'minigame_runs', minigameId: 'tide_trial', count: 2 },
        { kind: 'minigame_score', minigameId: 'tide_trial', targetScore: 120 },
      ],
      reward: { coins: 100 },
    };
    let state = initQuestStates([def])['q_test_minigame'] as QuestState;
    state = evalProgress(state, def, {
      kind: 'minigame:complete',
      minigameId: 'tide_trial',
      score: 95,
    });
    expect(state.status).toBe('active');
    expect(state.progress['minigame_runs:tide_trial']).toBe(1);
    expect(state.progress['minigame_score:tide_trial']).toBe(95);

    state = evalProgress(state, def, {
      kind: 'minigame:complete',
      minigameId: 'tide_trial',
      score: 130,
    });
    expect(state.status).toBe('claimable');
    expect(state.progress['minigame_runs:tide_trial']).toBe(2);
    expect(state.progress['minigame_score:tide_trial']).toBe(130);
  });

  it('多条件组合（defeat_boss + defeat_boss）全部达成才 claimable', () => {
    const def: QuestDefinition = {
      id: 'q_multi',
      kind: 'main',
      title: '双杀',
      description: '',
      conditions: [
        { kind: 'defeat_boss', bossId: 'shadow_fox' },
        { kind: 'defeat_boss', bossId: 'silver_bat' },
      ],
      reward: { coins: 300 },
    };
    let state = initQuestStates([def])['q_multi'] as QuestState;
    state = evalProgress(state, def, {
      kind: 'battle:victory',
      enemyId: 'shadow_fox',
      enemyKind: 'boss',
      petId: 'flame_puppy',
    });
    expect(state.status).toBe('active'); // 还差一个 boss
    state = evalProgress(state, def, {
      kind: 'battle:victory',
      enemyId: 'silver_bat',
      enemyKind: 'boss',
      petId: 'flame_puppy',
    });
    expect(state.status).toBe('claimable');
  });

  it('事件不匹配任何条件：state 引用不变', () => {
    const def = questDefeatBoss();
    const init = initQuestStates([def])['q_test_001'] as QuestState;
    const event: QuestEvent = { kind: 'map:enter', mapId: 'beach' };
    const after = evalProgress(init, def, event);
    expect(after).toBe(init);
  });

  it('locked / claimable / completed 状态下 evalProgress 原样返回', () => {
    const def = questDefeatBoss();
    const lockedState: QuestState = { status: 'locked', progress: {}, updatedAt: 0 };
    const event: QuestEvent = {
      kind: 'battle:victory',
      enemyId: 'shadow_overlord',
      enemyKind: 'boss',
      petId: 'flame_puppy',
    };
    expect(evalProgress(lockedState, def, event)).toBe(lockedState);

    const completedState: QuestState = { status: 'completed', progress: {}, updatedAt: 0 };
    expect(evalProgress(completedState, def, event)).toBe(completedState);

    const claimableState: QuestState = { status: 'claimable', progress: {}, updatedAt: 0 };
    expect(evalProgress(claimableState, def, event)).toBe(claimableState);
  });
});

describe('QuestEngine.claimReward', () => {
  it('claimable → completed，applyRewardFn 被调用', () => {
    const def = questDefeatBoss();
    const state: QuestState = {
      status: 'claimable',
      progress: { shadow_overlord: 1 },
      updatedAt: 10,
    };
    const spy = vi.fn<(reward: QuestReward) => void>();
    const after = claimReward(state, def, spy, 20);
    expect(after.status).toBe('completed');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(def.reward);
    expect(after.progress).toEqual({ shadow_overlord: 1 });
    expect(after.updatedAt).toBe(20);
  });

  it('非 claimable 状态：原样返回且不调用奖励回调', () => {
    const def = questDefeatBoss();
    const active: QuestState = { status: 'active', progress: {}, updatedAt: 0 };
    const spy = vi.fn<(reward: QuestReward) => void>();
    const after = claimReward(active, def, spy);
    expect(after).toBe(active);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('QuestEngine.tryUnlock', () => {
  it('前置 completed 后，下一条从 locked → active', () => {
    const q1 = questDefeatBoss();
    const q2: QuestDefinition = {
      ...q1,
      id: 'q2',
      prerequisites: ['q_test_001'],
    };
    const states: Record<string, QuestState> = {
      q_test_001: { status: 'completed', progress: {}, updatedAt: 0 },
      q2: { status: 'locked', progress: {}, updatedAt: 0 },
    };
    const unlocked = tryUnlock(states, [q1, q2]);
    expect(unlocked['q2']?.status).toBe('active');
  });

  it('前置未完成：仍 locked', () => {
    const q1 = questDefeatBoss();
    const q2: QuestDefinition = {
      ...q1,
      id: 'q2',
      prerequisites: ['q_test_001'],
    };
    const states: Record<string, QuestState> = {
      q_test_001: { status: 'active', progress: {}, updatedAt: 0 },
      q2: { status: 'locked', progress: {}, updatedAt: 0 },
    };
    const unlocked = tryUnlock(states, [q1, q2]);
    expect(unlocked['q2']?.status).toBe('locked');
  });

  it('链式解锁：q1 完成同时让 q2、q3 全部解锁', () => {
    const q1 = questDefeatBoss();
    const q2: QuestDefinition = { ...q1, id: 'q2', prerequisites: ['q_test_001'] };
    const q3: QuestDefinition = { ...q1, id: 'q3', prerequisites: ['q2'] };
    const states: Record<string, QuestState> = {
      q_test_001: { status: 'completed', progress: {}, updatedAt: 0 },
      q2: { status: 'completed', progress: {}, updatedAt: 0 },
      q3: { status: 'locked', progress: {}, updatedAt: 0 },
    };
    const unlocked = tryUnlock(states, [q1, q2, q3]);
    expect(unlocked['q3']?.status).toBe('active');
  });
});

describe('QuestEngine 聚合导出', () => {
  it('QuestEngine.* 与具名导出指向同一实现', () => {
    expect(QuestEngine.initQuestStates).toBe(initQuestStates);
    expect(QuestEngine.evalProgress).toBe(evalProgress);
    expect(QuestEngine.tryUnlock).toBe(tryUnlock);
    expect(QuestEngine.claimReward).toBe(claimReward);
  });
});
