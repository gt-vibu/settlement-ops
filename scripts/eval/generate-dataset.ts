/**
 * Dataset generation.
 *
 * Hidden truth goes to `settlementops_eval`; visible records go through the SAME import
 * and reconciliation path as any other data - `submitImport` then `runReconciliation`,
 * the identical functions the API calls. There is no evaluation-only ingestion route, so
 * a case cannot be reconciled by a code path the product does not actually ship.
 *
 *   MIGRATION_DATABASE_URL  schema owner, used to create merchants
 *   DATABASE_URL            application credential, used for import and reconciliation
 *   EVAL_DATABASE_URL       hidden truth. Must NOT be set for apps/api or apps/worker.
 *
 * Run:  pnpm eval:generate
 */

import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { Client } from 'pg';

import { cryptoIdGenerator, systemClock, asId } from '@settlementops/shared';
import type { CorrelationId, MerchantId, RequestId, UserId } from '@settlementops/shared';
import { runReconciliation, submitImport, scopeOf } from '@settlementops/application';
import type { RequestContext } from '@settlementops/application';
import { POLICY_VERSION } from '@settlementops/domain';
import {
  createDatabase,
  createAuditWriter,
  createCaseRepository,
  createImportRepository,
  createRecordRepository,
  createRunRepository,
} from '@settlementops/persistence';
import {
  EXPERIMENT_VERSION,
  GENERATOR_VERSION,
  PINNED_MODEL,
  allocationReport,
  completeGeneratorRun,
  configurationHash,
  generateDataset,
  openEvalStore,
  recordGeneratorRun,
  recordHiddenTruth,
  recordRegistry,
  recordSplitMerchant,
} from '@settlementops/evaluation';

const gitCommit = (): string | null => {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

const contextFor = (merchantId: string): RequestContext => ({
  userId: asId<UserId>(randomUUID()),
  tenantId: asId<MerchantId>(merchantId),
  roles: ['OPERATOR', 'APPROVER'],
  requestId: asId<RequestId>(randomUUID()),
  correlationId: asId<CorrelationId>(randomUUID()),
});

const run = async (): Promise<void> => {
  const appUrl = process.env['DATABASE_URL'];
  const migratorUrl = process.env['MIGRATION_DATABASE_URL'];
  if (appUrl === undefined || migratorUrl === undefined) {
    console.error('DATABASE_URL and MIGRATION_DATABASE_URL must both be set.');
    process.exit(1);
  }

  const dataset = generateDataset();
  const report = allocationReport(dataset);
  if (report.warnings.length > 0) {
    console.error('ALLOCATION DEVIATIONS - generation refuses to proceed:');
    for (const warning of report.warnings) console.error(`  ${warning}`);
    process.exit(1);
  }

  const evalStore = await openEvalStore();
  const migrator = new Client({ connectionString: migratorUrl });
  await migrator.connect();
  const db = createDatabase(appUrl);
  const repos = {
    imports: createImportRepository(db),
    records: createRecordRepository(db),
    runs: createRunRepository(db),
    cases: createCaseRepository(db),
    audit: createAuditWriter(db),
  };
  const ids = cryptoIdGenerator();
  const clock = systemClock();

  const runId = randomUUID();
  await recordGeneratorRun(evalStore, {
    id: runId,
    generatorVersion: GENERATOR_VERSION,
    experimentVersion: EXPERIMENT_VERSION,
    rootSeed: dataset.rootSeed,
    configurationHash: configurationHash({
      provider: PINNED_MODEL.provider,
      model: PINNED_MODEL.model,
      digest: PINNED_MODEL.digest,
    }),
    modelProvider: PINNED_MODEL.provider,
    modelName: PINNED_MODEL.model,
    modelDigest: PINNED_MODEL.digest,
    policyVersion: POLICY_VERSION,
    gitCommit: gitCommit(),
  });
  await recordRegistry(evalStore, runId, dataset.registry);

  let residualCount = 0;
  let reconciledCount = 0;
  let caseCount = 0;

  for (const split of dataset.splits) {
    // Merchant ids are freshly minted, so no merchant can appear in two splits.
    const merchantIds = new Map<string, string>();
    for (const slug of split.merchants) {
      const id = randomUUID();
      merchantIds.set(slug, id);
      await migrator.query(`INSERT INTO merchants (id, status) VALUES ($1, 'ACTIVE')`, [id]);
      await recordSplitMerchant(evalStore, runId, split.split, split.seed, id, 0);
    }

    for (const generated of split.cases) {
      const merchantId = merchantIds.get(generated.blueprint.merchantSlug);
      if (merchantId === undefined) throw new Error('merchant slug not allocated');
      const ctx = contextFor(merchantId);

      const imported = await submitImport(
        { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
        ctx,
        {
          body: { source_type: 'gateway_export', records: generated.visibleRecords },
          idempotencyKey: randomUUID(),
        },
      );
      if (imported.kind !== 'ACCEPTED') {
        console.error(`import rejected for ${generated.blueprint.paymentId}:`, imported.kind);
        if ('issues' in imported) console.error(JSON.stringify(imported.issues).slice(0, 600));
        process.exit(1);
      }
      if (imported.summary.rejectedCount > 0) {
        console.error(
          `import rejected ${imported.summary.rejectedCount} row(s) for ${generated.blueprint.paymentId}`,
        );
        process.exit(1);
      }

      const reconciled = await runReconciliation(
        {
          runs: repos.runs,
          records: repos.records,
          cases: repos.cases,
          audit: repos.audit,
          ids,
          clock,
        },
        ctx,
        { importId: imported.summary.id, maxPayments: 50 },
      );
      residualCount += reconciled.residualCount;
      reconciledCount += reconciled.reconciledCount;
      caseCount += reconciled.residualCount;

      await recordHiddenTruth(evalStore, runId, merchantId, generated.blueprint);
    }

    const scopeCheck = scopeOf(contextFor([...merchantIds.values()][0] ?? randomUUID()));
    void scopeCheck;
    console.log(`  ${split.split}: ${split.cases.length} cases imported and reconciled`);
  }

  await completeGeneratorRun(evalStore, runId);
  await evalStore.close();
  await migrator.end();
  await db.close();

  console.log('');
  console.log(`generator run     ${runId}`);
  console.log(`policy            ${POLICY_VERSION}`);
  console.log(`model             ${PINNED_MODEL.model} @ ${PINNED_MODEL.digest.slice(0, 12)}`);
  console.log(`residual cases    ${residualCount}`);
  console.log(`reconciled        ${reconciledCount}`);
  console.log(`compound in SEEN  ${report.compoundInSeen}`);
  console.log(`cases created     ${caseCount}`);
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
