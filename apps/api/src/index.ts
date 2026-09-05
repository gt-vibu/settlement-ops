/**
 * API process entry point.
 *
 * Startup order: validate configuration (which enforces the D3/D5 assertions), open
 * the application database connection, then serve. Migrations are never run here.
 */

import { cryptoIdGenerator, systemClock } from '@settlementops/shared';
import { dispatchAgent } from './agent-dispatch.js';
import {
  createAuditWriter,
  createAuditReader,
  createCaseRepository,
  createDatabase,
  createImportRepository,
  createRecordRepository,
  createRunRepository,
  createCaseTransitionRepository,
  createInvestigationRepository,
  createEvidenceRequestRepository,
  createScenarioRepository,
  createUserDirectory,
  loadConfig,
} from '@settlementops/persistence';
import { createDemoAuthAdapter } from './auth/demo-adapter.js';
import { buildApp } from './app.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const db = createDatabase(config.DATABASE_URL);
  const app = buildApp({
    auth: createDemoAuthAdapter(createUserDirectory(db)),
    db,
    logLevel: config.LOG_LEVEL,
    v1: {
      imports: createImportRepository(db),
      records: createRecordRepository(db),
      runs: createRunRepository(db),
      cases: createCaseRepository(db),
      audit: createAuditWriter(db),
    },
    workflow: {
      scenarios: createScenarioRepository(db),
      imports: createImportRepository(db),
      records: createRecordRepository(db),
      runs: createRunRepository(db),
      cases: createCaseRepository(db),
      transitions: createCaseTransitionRepository(db),
      investigations: createInvestigationRepository(db),
      evidence: createEvidenceRequestRepository(db),
      audit: createAuditWriter(db),
      demoScenariosEnabled: config.DEMO_SCENARIOS_ENABLED,
      aiInvestigationEnabled: config.AI_INVESTIGATION_ENABLED,
      // Wired only when the kill switch is on. With it off there is no dispatcher at all,
      // so there is not even a code path from a route to a model.
      dispatchAgent: config.AI_INVESTIGATION_ENABLED
        ? (ctx, input) =>
            dispatchAgent(
              {
                db,
                workflow: {
                  investigations: createInvestigationRepository(db),
                  transitions: createCaseTransitionRepository(db),
                  audit: createAuditWriter(db),
                  ids: cryptoIdGenerator(),
                  clock: systemClock(),
                },
              },
              ctx,
              input,
            )
        : null,
    },
    auditReader: createAuditReader(db),
  });

  const shutdown = async (): Promise<void> => {
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
