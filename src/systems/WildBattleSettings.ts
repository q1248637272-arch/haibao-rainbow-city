const WILD_BATTLE_BLOCK_SAVE_KEY = 'hbcc:block-wild-battle:v1';

export function isWildBattleBlocked(): boolean {
  try {
    return globalThis.localStorage?.getItem(WILD_BATTLE_BLOCK_SAVE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setWildBattleBlocked(blocked: boolean): void {
  try {
    globalThis.localStorage?.setItem(WILD_BATTLE_BLOCK_SAVE_KEY, blocked ? '1' : '0');
  } catch {
    // Ignore private browsing storage failures.
  }
}

export function toggleWildBattleBlocked(): boolean {
  const blocked = !isWildBattleBlocked();
  setWildBattleBlocked(blocked);
  return blocked;
}
