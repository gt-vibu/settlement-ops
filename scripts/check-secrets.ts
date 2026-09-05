/**
 * Secret scan (specs/SECURITY.md section 7).
 *
 * Runs before any real credential can exist, which is the point: the first accidental
 * commit is the one that matters.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { walk, report } from './lib/walk.js';

const PATTERNS: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /sk-[A-Za-z0-9]{20,}/, why: 'possible provider API key' },
  { pattern: /AKIA[0-9A-Z]{16}/, why: 'possible AWS access key id' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'private key material' },
  {
    pattern: /(password|passwd|secret|api_?key|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
    why: 'hardcoded credential-shaped literal',
  },
];

const ALLOW = ['local_dev_only', 'CHANGE_ME'];

const run = async (): Promise<void> => {
  const root = process.cwd();
  const failures: string[] = [];

  if (existsSync(path.join(root, '.env'))) {
    failures.push('.env exists in the repository root and must never be committed');
  }

  const files = [
    ...(await walk(path.join(root, 'packages'))),
    ...(await walk(path.join(root, 'apps'))),
    ...(await walk(path.join(root, 'scripts'))),
    ...(await walk(path.join(root, 'packages'), '.sql')),
  ];

  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (rel.includes('check-secrets')) continue;
    const source = await readFile(file, 'utf8');
    for (const p of PATTERNS) {
      const match = p.pattern.exec(source);
      if (match !== null && !ALLOW.some((a) => match[0].includes(a))) {
        failures.push(`${rel}: ${p.why}`);
      }
    }
  }

  console.log(`      scanned ${files.length} files`);
  report('secret scan', failures);
};

void run();
