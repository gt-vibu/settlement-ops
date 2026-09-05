/**
 * API process entry point.
 *
 * Startup order: validate configuration (which enforces the D3/D5 assertions), open
 * the application database connection, then serve. Migrations are never run here.
 */

import { cryptoIdGenerator, systemClock } from '@settlementops/shared';
import { createOllamaGateway } from '@settlementops/agent';
import { dispatchAgent, loadAgentBudget, loadModelConfig } from './agent-dispatch.js';
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

  // Model configuration is validated ONLY when the kill switch is on. A deployment that
  // does not use AI should not be required to configure a model it will never call, and a
  // deployment that does use it should discover a bad host at startup, not mid-case.
  const modelConfig = config.AI_INVESTIGATION_ENABLED ? loadModelConfig() : null;
  const agentBudget = loadAgentBudget();

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
      dispatchAgent:
        config.AI_INVESTIGATION_ENABLED && modelConfig !== null
          ? (ctx, input) =>
              dispatchAgent(
                {
                  db,
                  // Validated once at startup, above, so a bad host or model name fails the
                  // process rather than the first investigation.
                  model: modelConfig,
                  budget: agentBudget,
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
    // Readiness reports the model only when AI is enabled. It is a cheap /api/tags call,
    // not an inference, so a readiness probe never costs a generation.
    modelHealth:
      modelConfig === null
        ? null
        : () =>
            createOllamaGateway({
              host: modelConfig.host,
              identity: {
                provider: 'ollama',
                model: modelConfig.model,
                digest: modelConfig.digest,
              },
              temperature: modelConfig.temperature,
              timeoutSeconds: 10,
              maxOutputTokens: 1,
            }).assertPinnedModel(),
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
