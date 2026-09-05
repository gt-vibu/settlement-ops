/**
 * Code size policy gate (specs/CODE_SIZE_POLICY.md).
 *
 * The goal is reviewability and security, not aesthetics: a 600-line file mixing
 * unrelated responsibilities is where security bugs hide.
 *
 *   warn  >= 250    fail  > 350 (without a recorded exception)    hard fail > 500
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { walk, report } from './lib/walk.js';

const WARN = 250;
const FAIL = 350;
const HARD = 500;

/** Files with a written justification in PHASE_REVIEW.md. Empty by design. */
const EXCEPTIONS = new Set<string>();

const run = async (): Promise<void> => {
  const root = process.cwd();
  const files = [
    ...(await walk(path.join(root, 'packages'))),
    ...(await walk(path.join(root, 'apps'))),
    ...(await walk(path.join(root, 'scripts'))),
  ];

  const failures: string[] = [];
  let warnings = 0;

  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (rel.startsWith('apps/web/')) continue;
    const lines = (await readFile(file, 'utf8')).split('\n').length;

    if (lines > HARD) failures.push(`${rel}: ${lines} lines exceeds hard limit ${HARD}`);
    else if (lines > FAIL && !EXCEPTIONS.has(rel))
      failures.push(`${rel}: ${lines} lines exceeds ${FAIL} without a recorded exception`);
    else if (lines >= WARN) {
      warnings += 1;
      console.log(`warn  ${rel}: ${lines} lines (review responsibility boundaries)`);
    }
  }

  console.log(`      checked ${files.length} files, ${warnings} at/over ${WARN} lines`);
  report('code-size policy', failures);
};

void run();
