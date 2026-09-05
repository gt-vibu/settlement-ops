import { readdir } from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', 'specs']);

export const walk = async (root: string, ext = '.ts'): Promise<string[]> => {
  const out: string[] = [];
  const visit = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.name.endsWith(ext)) out.push(full);
    }
  };
  await visit(root);
  return out;
};

export const repoRoot = (importMetaUrl: string): string =>
  path.resolve(path.dirname(new URL(importMetaUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

export const report = (name: string, failures: string[]): void => {
  if (failures.length === 0) {
    console.log(`PASS  ${name}`);
    return;
  }
  console.error(`FAIL  ${name}`);
  for (const f of failures) console.error(`      ${f}`);
  process.exit(1);
};
