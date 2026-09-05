/**
 * Dependency-direction gate (specs/ARCHITECTURE.md section 13).
 *
 * Architecture boundaries are only real if something enforces them. This turns the
 * allowed/forbidden import directions into a build failure rather than a convention
 * a reviewer has to remember.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { walk, report } from './lib/walk.js';

interface Rule {
  readonly area: string;
  readonly forbidden: readonly { readonly pattern: RegExp; readonly why: string }[];
}

const RULES: readonly Rule[] = [
  {
    area: 'packages/domain',
    forbidden: [
      { pattern: /from\s+'fastify/, why: 'domain must not import an HTTP framework' },
      { pattern: /from\s+'(pg|drizzle-orm)/, why: 'domain must not import a database driver' },
      { pattern: /from\s+'(openai|@anthropic-ai)/, why: 'domain must not import an LLM SDK' },
      { pattern: /from\s+'zod'/, why: 'domain must have zero runtime dependencies' },
      {
        pattern: /@settlementops\/(persistence|application|agent|tools|api|worker)/,
        why: 'domain must not depend on outer layers',
      },
    ],
  },
  {
    area: 'packages/shared',
    forbidden: [
      { pattern: /@settlementops\//, why: 'shared must not depend on any other package' },
      { pattern: /from\s+'(fastify|pg|drizzle-orm|zod)/, why: 'shared must stay dependency-free' },
    ],
  },
  {
    area: 'packages/agent',
    forbidden: [
      {
        pattern: /@settlementops\/persistence/,
        why: 'the agent must reach data only through tool/application boundaries',
      },
      { pattern: /EVAL_DATABASE_URL/, why: 'the agent must have no path to hidden truth (D5)' },
    ],
  },
  {
    area: 'packages/application',
    forbidden: [
      { pattern: /from\s+'fastify/, why: 'application must not import an HTTP framework' },
      { pattern: /from\s+'pg'/, why: 'application must not import a database driver' },
    ],
  },
];

const UI_FORBIDDEN = /apps\/web/;

const run = async (): Promise<void> => {
  const root = process.cwd();
  const failures: string[] = [];

  for (const rule of RULES) {
    const files = await walk(path.join(root, rule.area));
    for (const file of files) {
      const rel = path.relative(root, file).replace(/\\/g, '/');
      const source = await readFile(file, 'utf8');
      for (const f of rule.forbidden) {
        if (f.pattern.test(source)) failures.push(`${rel}: ${f.why}`);
      }
    }
  }

  // Nothing in the backend may reference apps/web (Decision D2).
  for (const area of ['packages', 'apps/api', 'apps/worker']) {
    for (const file of await walk(path.join(root, area))) {
      const rel = path.relative(root, file).replace(/\\/g, '/');
      const source = await readFile(file, 'utf8');
      if (UI_FORBIDDEN.test(source) && !rel.includes('check-')) {
        failures.push(`${rel}: backend code must not reference apps/web (D2)`);
      }
    }
  }

  report('dependency direction', failures);
};

void run();
