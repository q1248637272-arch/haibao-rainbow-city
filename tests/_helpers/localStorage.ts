/**
 * 内存版 localStorage polyfill，用于 Vitest node 环境。
 * 不依赖 jsdom / happy-dom，启动更快且行为更可控。
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return index >= 0 && index < keys.length ? (keys[index] as string) : null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

/**
 * 在 globalThis 上安装一个全新的内存 storage 实例，同时清空任何已有状态。
 * 每个测试（或 beforeEach）调用一次，保证隔离。
 */
export function installMemoryLocalStorage(): Storage {
  const ls = new MemoryStorage();
  (globalThis as { localStorage?: Storage }).localStorage = ls;
  return ls;
}

/**
 * 卸载 localStorage，让其回到 undefined 状态（模拟 Node 纯环境）。
 */
export function uninstallLocalStorage(): void {
  delete (globalThis as { localStorage?: Storage }).localStorage;
}
