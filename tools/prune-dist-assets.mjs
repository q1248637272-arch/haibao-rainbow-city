#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(toolDir, '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const verbose = argv.includes('--verbose');
const distArgIndex = argv.indexOf('--dist');
const distDir = path.resolve(rootDir, distArgIndex >= 0 ? argv[distArgIndex + 1] ?? 'dist' : 'dist');
const legacyDir = path.join(distDir, 'assets', 'legacy');

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const TEXT_EXT = /\.(cjs|css|html|js|json|md|mjs|ts|tsx|txt)$/i;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;

const FAST_LEGACY_MARKERS = [
  '/haidi001/',
  '/screens/',
  '/restored/',
  '/image2-restored/maps/',
  '/image2-restored/home/',
  '/image2-restored/story/',
  '/image2-restored/ui/',
  '/image2-restored/activities/',
  '/image2-restored/pets/',
  '/image2-restored/objects/',
  '/image2-restored/items/',
  '/image2-restored/characters/',
  '/pets/',
  '/dolls/',
  '/characters/',
  '/optimized/pets/',
];

const UNREFERENCED_LEGACY_DIRS = [
  'redraw-wide/',
  'references/',
  'title/',
];

main().catch((error) => {
  console.error(`[prune-dist-assets] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  if (!(await exists(distDir))) {
    console.log(`[prune-dist-assets] Skip: ${relativeToRoot(distDir)} does not exist.`);
    return;
  }
  if (!(await exists(legacyDir))) {
    console.log(`[prune-dist-assets] Skip: ${relativeToRoot(legacyDir)} does not exist.`);
    return;
  }

  const distReal = await fs.realpath(distDir);
  const legacyReal = await fs.realpath(legacyDir);
  assertInside(legacyReal, distReal, 'legacy asset directory must stay inside dist');

  const referenceCorpus = await readReferenceCorpus();
  const files = await walkFiles(legacyDir);
  const removals = [];

  for (const file of files) {
    const rel = toPosix(path.relative(legacyDir, file));
    if (!IMAGE_EXT.test(rel)) continue;

    const fastRel = fastEquivalentRel(rel);
    if (fastRel) {
      const fastPath = path.join(legacyDir, fromPosix(fastRel));
      if (await exists(fastPath)) {
        removals.push({ file, rel, reason: 'fast equivalent' });
        continue;
      }
    }

    if (isUnreferencedLegacyExtra(rel, referenceCorpus)) {
      removals.push({ file, rel, reason: 'unreferenced legacy extra' });
    }
  }

  const totalBytes = await sumRemovalBytes(removals);
  if (removals.length === 0) {
    console.log(`[prune-dist-assets] No dist-only legacy assets to remove from ${relativeToRoot(distDir)}.`);
    return;
  }

  if (verbose || dryRun) {
    for (const removal of removals) {
      console.log(
        `[prune-dist-assets] ${dryRun ? 'Would remove' : 'Remove'} ${removal.reason}: assets/legacy/${removal.rel}`,
      );
    }
  }

  if (!dryRun) {
    for (const removal of removals) {
      assertInside(path.resolve(removal.file), legacyReal, 'refusing to remove outside dist assets');
      await fs.rm(removal.file, { force: true });
    }
    await removeEmptyDirs(legacyDir);
  }

  const byReason = countBy(removals, (removal) => removal.reason);
  const reasonSummary = [...byReason]
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(', ');
  const action = dryRun ? 'Would remove' : 'Removed';
  console.log(
    `[prune-dist-assets] ${action} ${removals.length} dist-only legacy files (${formatBytes(totalBytes)}) from ${relativeToRoot(distDir)}. ${reasonSummary}.`,
  );
}

function fastEquivalentRel(rel) {
  if (rel.startsWith('fast/')) return null;
  if (rel.startsWith('expanded/')) return null;
  if (rel.startsWith('redraw-wide/')) return null;
  if (rel.startsWith('optimized/title/')) return null;
  if (rel.startsWith('optimized/maps/')) return null;
  if (rel.includes('_sheet.')) return null;
  if (!IMAGE_EXT.test(rel)) return null;

  const assetPath = `assets/legacy/${rel}`;
  if (!FAST_LEGACY_MARKERS.some((marker) => assetPath.includes(marker))) return null;

  return `fast/${rel.replace(IMAGE_EXT, '')}_fast.webp`;
}

function isUnreferencedLegacyExtra(rel, referenceCorpus) {
  if (!UNREFERENCED_LEGACY_DIRS.some((dir) => rel.startsWith(dir))) return false;
  const webPath = `assets/legacy/${rel}`;
  return !referenceCorpus.includes(webPath);
}

async function readReferenceCorpus() {
  const roots = [
    path.join(rootDir, 'src'),
    path.join(rootDir, 'index.html'),
    path.join(rootDir, 'public'),
    distDir,
  ];
  let corpus = '';
  for (const entry of roots) {
    if (!(await exists(entry))) continue;
    const stat = await fs.stat(entry);
    if (stat.isDirectory()) {
      const files = await walkFiles(entry);
      for (const file of files) {
        if (!TEXT_EXT.test(file)) continue;
        const size = (await fs.stat(file)).size;
        if (size > MAX_TEXT_BYTES) continue;
        corpus += `\n${await fs.readFile(file, 'utf8')}`;
      }
    } else if (TEXT_EXT.test(entry) && stat.size <= MAX_TEXT_BYTES) {
      corpus += `\n${await fs.readFile(entry, 'utf8')}`;
    }
  }
  return corpus;
}

async function walkFiles(dir) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkFiles(child));
    } else if (entry.isFile()) {
      results.push(child);
    }
  }
  return results;
}

async function removeEmptyDirs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await removeEmptyDirs(path.join(dir, entry.name));
    }
  }
  if (path.resolve(dir) === path.resolve(legacyDir)) return;
  try {
    await fs.rmdir(dir);
  } catch {
    // Non-empty directories are expected.
  }
}

async function sumRemovalBytes(removals) {
  let total = 0;
  for (const removal of removals) {
    total += (await fs.stat(removal.file)).size;
  }
  return total;
}

function countBy(values, getKey) {
  const counts = new Map();
  for (const value of values) {
    const key = getKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function assertInside(child, parent, message) {
  const relative = path.relative(parent, child);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new Error(message);
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function fromPosix(value) {
  return value.split('/').join(path.sep);
}

function relativeToRoot(target) {
  return toPosix(path.relative(rootDir, target) || '.');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
