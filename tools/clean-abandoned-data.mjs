#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(toolDir, '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const includeImagegenOutput = argv.includes('--include-imagegen-output');

const GENERATED_DIRS = [
  'tmp',
  'logs',
  '.wrangler',
  'coverage',
  '.vite',
  '.vitest',
  'tools/__pycache__',
];

if (includeImagegenOutput) {
  GENERATED_DIRS.push('output/imagegen');
}

main().catch((error) => {
  console.error(`[clean-abandoned-data] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  const targets = [];
  for (const rel of GENERATED_DIRS) {
    const target = path.resolve(rootDir, fromPosix(rel));
    if (await exists(target)) targets.push({ target, rel, kind: 'directory' });
  }

  const rootEntries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile()) continue;
    if (!/\.log$/i.test(entry.name)) continue;
    targets.push({
      target: path.join(rootDir, entry.name),
      rel: entry.name,
      kind: 'log file',
    });
  }

  if (targets.length === 0) {
    console.log('[clean-abandoned-data] No abandoned generated data found.');
    return;
  }

  let totalBytes = 0;
  let totalFiles = 0;
  const measured = [];
  for (const item of targets) {
    assertInside(item.target, rootDir, 'refusing to clean outside project root');
    const size = await measure(item.target);
    totalBytes += size.bytes;
    totalFiles += size.files;
    measured.push({ ...item, ...size });
  }

  for (const item of measured) {
    const label = `${item.rel} (${item.files} files, ${formatBytes(item.bytes)})`;
    console.log(`[clean-abandoned-data] ${dryRun ? 'Would remove' : 'Remove'} ${item.kind}: ${label}`);
  }

  if (!dryRun) {
    for (const item of measured) {
      assertInside(item.target, rootDir, 'refusing to clean outside project root');
      await fs.rm(item.target, { recursive: true, force: true });
    }
  }

  const action = dryRun ? 'Would remove' : 'Removed';
  console.log(
    `[clean-abandoned-data] ${action} ${measured.length} generated targets, ${totalFiles} files, ${formatBytes(totalBytes)}.`,
  );
  if (!includeImagegenOutput) {
    console.log('[clean-abandoned-data] Kept output/imagegen. Pass --include-imagegen-output to remove archived generated images too.');
  }
}

async function measure(target) {
  const stat = await fs.stat(target);
  if (stat.isFile()) return { files: 1, bytes: stat.size };
  let files = 0;
  let bytes = 0;
  const entries = await fs.readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      const childSize = await measure(child);
      files += childSize.files;
      bytes += childSize.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += (await fs.stat(child)).size;
    }
  }
  return { files, bytes };
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

function fromPosix(value) {
  return value.split('/').join(path.sep);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
