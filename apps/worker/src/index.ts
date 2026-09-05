/**
 * Worker process entry point.
 *
 * Shares application and domain packages with the API and never reimplements a
 * business rule (specs/ARCHITECTURE.md section 3). Job claiming, reconciliation runs
 * and investigations arrive in later phases; Phase 1 establishes the process, its
 * configuration boundary and its shutdown behaviour only.
 */

import { createDatabase, loadConfig, pingDatabase } from '@settlementops/persistence';

const POLL_INTERVAL_MS = 5_000;

const main = async (): Promise<void> => {
  const config = loadConfig();
  const db = createDatabase(config.DATABASE_URL);

  const reachable = await pingDatabase(db);
  if (!reachable) {
    console.error('worker: database unreachable at startup');
    process.exit(1);
  }

  let running = true;
  const shutdown = async (): Promise<void> => {
    running = false;
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  while (running) {
    // Phase 1: no job types are registered yet. The loop exists so that the process
    // lifecycle, configuration and shutdown path are real and testable.
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
