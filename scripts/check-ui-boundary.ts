/**
 * UI boundary gate (Decision D2).
 *
 * Two directories are user-owned and off limits to the backend pipeline:
 *
 *   apps/web   - the reserved workspace from decision D2;
 *   next-app   - the user's actual Next.js frontend, added 2026-08-31.
 *
 * The backend may publish contracts they consume but must never implement, import,
 * or depend on either. specs/REPOSITORY_STRUCTURE.md section 3 promises this is
 * machine-enforced; this is the enforcement.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { walk, report } from './lib/walk.js';

const ALLOWED_IN_WEB = new Set(['package.json', 'README.md']);

const run = async (): Promise<void> => {
  const root = process.cwd();
  const webDir = path.join(root, 'apps', 'web');
  const failures: string[] = [];

  if (existsSync(webDir)) {
    const entries = await readdir(webDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() || !ALLOWED_IN_WEB.has(entry.name)) {
        failures.push(
          `apps/web/${entry.name}: the backend pipeline must not create files here (D2)`,
        );
      }
    }
  }

  // No backend manifest may depend on the web workspace, and no frontend dependency
  // may appear anywhere in the backend.
  const FRONTEND_DEPS = ['react', 'vue', 'svelte', 'next', 'vite', 'tailwindcss', '@angular/core'];
  for (const area of ['packages', 'apps/api', 'apps/worker']) {
    const manifests = (await walk(path.join(root, area), '.json')).filter((f) =>
      f.endsWith('package.json'),
    );
    for (const manifest of manifests) {
      const rel = path.relative(root, manifest).replace(/\\/g, '/');
      const parsed: unknown = JSON.parse(await readFile(manifest, 'utf8'));
      const deps = (parsed as { dependencies?: Record<string, string> }).dependencies ?? {};
      if ('@settlementops/web' in deps) {
        failures.push(`${rel}: backend package must not depend on @settlementops/web (D2)`);
      }
      for (const dep of Object.keys(deps)) {
        if (FRONTEND_DEPS.includes(dep)) {
          failures.push(
            `${rel}: frontend dependency "${dep}" must not appear in a backend manifest`,
          );
        }
      }
    }
  }

  // The user's Next.js frontend. Owned by the user, outside the pnpm workspace, and
  // never referenced from backend code. We deliberately do not inspect its contents.
  const nextApp = path.join(root, 'next-app');
  if (existsSync(nextApp)) {
    for (const area of ['packages', 'apps/api', 'apps/worker']) {
      for (const file of await walk(path.join(root, area))) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        if (/next-app/.test(await readFile(file, 'utf8'))) {
          failures.push(`${rel}: backend code must not reference next-app (user-owned UI)`);
        }
      }
    }
    if (existsSync(path.join(nextApp, 'pnpm-workspace.yaml'))) {
      failures.push('next-app must not declare itself part of the backend workspace');
    }
  }

  report('UI boundary', failures);
};

void run();
