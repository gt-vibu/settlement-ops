/**
 * Money-safety gate.
 *
 * specs/PRODUCTION_READINESS.md lists floating-point authoritative money math as a
 * hard release blocker. Rather than trust review to catch a stray parseFloat, this
 * fails the build.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { walk, report } from './lib/walk.js';

const BANNED: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\bparseFloat\s*\(/, why: 'parseFloat in a money path' },
  { pattern: /Number\.parseFloat\s*\(/, why: 'Number.parseFloat in a money path' },
  { pattern: /\.toFixed\s*\(/, why: 'toFixed in a money path' },
  { pattern: /\b\d+\.\d+\b/, why: 'floating-point literal in a money path' },
];

const run = async (): Promise<void> => {
  const root = process.cwd();
  const moneyDir = path.join(root, 'packages', 'domain', 'src', 'money');
  const files = (await walk(moneyDir)).filter((f) => !f.endsWith('.test.ts'));
  const failures: string[] = [];

  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      for (const banned of BANNED) {
        if (banned.pattern.test(code)) failures.push(`${rel}:${index + 1}: ${banned.why}`);
      }
    });
  }

  console.log(`      scanned ${files.length} money source files`);
  report('money safety', failures);
};

void run();
