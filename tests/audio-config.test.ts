import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BATTLE_BGM_OVERRIDES,
  BGM_CONFIG,
  type BgmKey,
  resolveBattleBgm,
} from '@/config/audio';

/**
 * 仓库根目录绝对路径。Vitest 的 CWD = package.json 所在目录。
 */
const REPO_ROOT = resolve(__dirname, '..');

/**
 * 音频版权合规黑名单正则。若任何源码 / 注释 / 文档匹配到这些关键词，
 * 本测试会直接失败，防止歌曲 / 艺人身份意外泄漏到仓库。
 *
 * 注意：本测试文件自身会把黑名单作为正则字符串写下来，这是**必要的测试自指**。
 * 我们通过 `excludePaths` 明确跳过本测试文件，避免把自身内容当成违规。
 */
const BLACKLIST_REGEX =
  /六月的雨|只因你太美|胡歌|ninepercent|nine_percent|hu_ge|june_rain|zhi_yin_ni_tai_mei|only_you/i;

describe('FEAT-302 音频配置 BGM_CONFIG', () => {
  it('每个 BGM key 对应的资源路径都是 assets/audio/*.mp3 格式', () => {
    for (const [key, path] of Object.entries(BGM_CONFIG)) {
      expect(path, `key=${key}`).toMatch(/^assets\/audio\/[\w-]+\.mp3$/);
    }
  });

  it('至少覆盖常见场景（title / 彩虹城 / 海滨 / 战斗默认 / BOSS）', () => {
    const keys = Object.keys(BGM_CONFIG);
    expect(keys).toContain('title');
    expect(keys).toContain('world_rainbow');
    expect(keys).toContain('world_beach');
    expect(keys).toContain('battle_normal');
    expect(keys).toContain('battle_boss');
  });
});

describe('FEAT-302 BATTLE_BGM_OVERRIDES', () => {
  it('所有 override 的 value 必须存在于 BGM_CONFIG', () => {
    const validKeys = new Set<string>(Object.keys(BGM_CONFIG));
    for (const [petId, bgmKey] of Object.entries(BATTLE_BGM_OVERRIDES)) {
      expect(validKeys.has(bgmKey), `${petId} → ${bgmKey}`).toBe(true);
    }
  });

  it('cai_xukun 与 rainbow_wing 都有专属战斗曲覆盖', () => {
    expect(BATTLE_BGM_OVERRIDES['cai_xukun']).toBe('battle_special_cai_xukun');
    expect(BATTLE_BGM_OVERRIDES['rainbow_wing']).toBe('battle_special_rainbow');
  });
});

describe('FEAT-302 resolveBattleBgm 分支判定', () => {
  it('cai_xukun 为玩家出战方时返回 battle_special_cai_xukun', () => {
    const key: BgmKey = resolveBattleBgm('cai_xukun', 'shadow_overlord', 'boss');
    expect(key).toBe('battle_special_cai_xukun');
  });

  it('cai_xukun 为野生敌方时也返回 battle_special_cai_xukun', () => {
    const key: BgmKey = resolveBattleBgm('flame_puppy', 'cai_xukun', 'wild');
    expect(key).toBe('battle_special_cai_xukun');
  });

  it('普通野战返回 battle_normal', () => {
    const key: BgmKey = resolveBattleBgm('flame_puppy', 'aqua_turtle', 'wild');
    expect(key).toBe('battle_normal');
  });

  it('BOSS 战（无覆盖）返回 battle_boss', () => {
    const key: BgmKey = resolveBattleBgm('flame_puppy', 'shadow_overlord', 'boss');
    expect(key).toBe('battle_boss');
  });

  it('rainbow_wing 为玩家出战方时返回 battle_special_rainbow（即便是野战）', () => {
    const key: BgmKey = resolveBattleBgm('rainbow_wing', 'aqua_turtle', 'wild');
    expect(key).toBe('battle_special_rainbow');
  });

  it('petId 与 enemyId 均为 null 时按 enemyKind 分派', () => {
    expect(resolveBattleBgm(null, null, 'boss')).toBe('battle_boss');
    expect(resolveBattleBgm(null, null, 'wild')).toBe('battle_normal');
  });

  it('玩家命中 override 优先于敌方（互不冲突场景：两侧都命中时以玩家为准）', () => {
    // 两侧同时命中的极端情况。语义：玩家带上场的精灵优先决定氛围。
    const key = resolveBattleBgm('cai_xukun', 'rainbow_wing', 'boss');
    expect(key).toBe('battle_special_cai_xukun');
  });
});

describe('FEAT-302 版权合规红线（黑名单关键词扫描）', () => {
  it('src/config/audio.ts 源文件不含任何黑名单关键词', () => {
    const content = readFileSync(join(REPO_ROOT, 'src/config/audio.ts'), 'utf8');
    expect(content).not.toMatch(BLACKLIST_REGEX);
  });

  it('src/ public/ .gitignore LICENSES.md 下均不含黑名单关键词', () => {
    const targets: Array<{ path: string; isDir: boolean }> = [
      { path: join(REPO_ROOT, 'src'), isDir: true },
      { path: join(REPO_ROOT, 'public'), isDir: true },
      { path: join(REPO_ROOT, '.gitignore'), isDir: false },
      { path: join(REPO_ROOT, 'LICENSES.md'), isDir: false },
    ];
    const offenders: Array<{ file: string; snippet: string }> = [];

    // 跳过本测试文件自身，否则会把正则字符串当作违规匹配。
    const excludePaths = new Set<string>([
      resolve(REPO_ROOT, 'tests/audio-config.test.ts'),
    ]);

    for (const t of targets) {
      if (t.isDir) {
        walk(t.path, (filePath) => {
          if (excludePaths.has(filePath)) return;
          scanFile(filePath, offenders);
        });
      } else {
        scanFile(t.path, offenders);
      }
    }

    expect(offenders, `发现违规文件：\n${offenders.map((o) => `${o.file}: ${o.snippet}`).join('\n')}`).toEqual([]);
  });
});

/**
 * 递归遍历目录，对每个普通文件调用 visit。跳过 node_modules / dist / .git。
 */
function walk(dir: string, visit: (filePath: string) => void): void {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, visit);
    } else if (st.isFile()) {
      visit(full);
    }
  }
}

/**
 * 扫描单个文本文件，若匹配到黑名单则推入 offenders。
 * 二进制文件（image / font）会因为 UTF-8 decode 产生乱码但不会匹配关键词，
 * 所以不需要额外的 mime 过滤。
 */
function scanFile(
  filePath: string,
  offenders: Array<{ file: string; snippet: string }>,
): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  const m = content.match(BLACKLIST_REGEX);
  if (m) {
    offenders.push({ file: filePath, snippet: m[0] });
  }
}
