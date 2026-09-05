/**
 * The benchmark runner.
 *
 * Runs Systems A, B and C over the same frozen cases, paired at case level. No treatment
 * can see hidden truth: the truth is loaded from `settlementops_eval` only AFTER every
 * system has produced its outcome, and it is joined by payment id in memory.
 *
 * Usage:
 *   pnpm eval:run                     scored splits, all three systems
 *   pnpm eval:run -- --split=primary_test --systems=A,B
 *   pnpm eval:run -- --limit=20       smoke run
 */

import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { asId, type MerchantId, type PaymentId } from '@settlementops/shared';
import { trustedMerchantScope, reconcileUnit } from '@settlementops/domain';
import { createDatabase, loadUnit } from '@settlementops/persistence';
import { createToolRegistry } from '@settlementops/tools';
import { createOllamaGateway } from '@settlementops/agent';
import {
  AGENT_BUDGET,
  OLLAMA_DEFAULT_HOST,
  PINNED_MODEL,
  EXPLORATORY_AI_V2_MODEL,
  computeMetrics,
  latestGeneratorRunId,
  loadHiddenTruth,
  openEvalStore,
  runSystemA,
  runSystemB,
  runSystemC,
  runSystemCv2,
  scoreOutcome,
  type Outcome,
  type SystemId,
} from '@settlementops/evaluation';

interface Row {
  readonly system: SystemId;
  readonly split: string;
  readonly paymentId: string;
  readonly stratum: string;
  readonly outcome: Outcome;
  readonly toolCallCount: number;
  readonly latencyMs: number;
  readonly stopReason: string;
  readonly verifierPassed: boolean;
  readonly verifierFailures: readonly string[];
  readonly proposedCause: string | null;
  readonly effectiveDisposition: string;
  readonly trueCauseTuple: string;
  readonly trueDisposition: string;
}

const arg = (name: string, fallback: string): string => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found === undefined ? fallback : found.slice(name.length + 3);
};

const run = async (): Promise<void> => {
  const appUrl = process.env['DATABASE_URL'];
  if (appUrl === undefined) {
    console.error('DATABASE_URL must be set.');
    process.exit(1);
  }

  const splits = arg('split', 'primary_test,challenge').split(',');
  const systems = arg('systems', 'A,B,C').split(',') as SystemId[];
  const limit = Number(arg('limit', '0'));

  /**
   * The exploratory arm is refused on any scored split, by the runner itself.
   *
   * `EVALUATION.md` §19 forbids tuning against the primary test set. Making that a guard
   * rather than a convention means an accidental flag cannot quietly produce a number that
   * looks preregistered and is not.
   */
  const useV2 = process.env['AGENT_LOOP_VARIANT'] === 'v2';
  if (useV2 && splits.some((s) => s === 'primary_test' || s === 'challenge')) {
    console.error(
      'refusing to run the exploratory v2 loop on a scored split. It is permitted on ' +
        'validation, development or showcase only (--split=validation).',
    );
    process.exit(1);
  }
  if (useV2) console.log('EXPLORATORY: agent loop v2. Results are not preregistered.');

  const evalStore = await openEvalStore();
  const generatorRunId = await latestGeneratorRunId(evalStore);
  if (generatorRunId === null) {
    console.error('no completed generator run found; run pnpm eval:generate first');
    process.exit(1);
  }
  const truth = await loadHiddenTruth(evalStore, generatorRunId, splits);
  await evalStore.close();

  const db = createDatabase(appUrl);
  const registry = createToolRegistry(async (ctx) =>
    loadUnit(db, ctx.scope, asId<PaymentId>(ctx.paymentId)),
  );
  const activeModel = useV2 ? EXPLORATORY_AI_V2_MODEL : PINNED_MODEL;
  const gateway = createOllamaGateway({
    host: process.env['OLLAMA_HOST'] ?? OLLAMA_DEFAULT_HOST,
    identity: activeModel,
    temperature: AGENT_BUDGET.temperature,
    timeoutSeconds: AGENT_BUDGET.requestTimeoutSeconds,
    maxOutputTokens: 512,
  });

  if (systems.includes('C')) {
    const pinned = await gateway.assertPinnedModel();
    console.log(`model pin: ${pinned.ok ? 'OK' : 'FAILED'} - ${pinned.detail}`);
    if (!pinned.ok) {
      console.error('refusing to run System C against an unpinned model');
      process.exit(1);
    }
  }

  // Payment source ids are what the generator recorded; resolve them to internal ids once.
  const idMap = new Map<string, { paymentId: string; merchantId: string }>();
  for (const row of truth) {
    const result = await db.pool.query<{ id: string }>(
      'SELECT id FROM payments WHERE merchant_id = $1 AND source_record_id = $2',
      [row.merchantId, row.paymentId],
    );
    const found = result.rows[0];
    if (found !== undefined) {
      idMap.set(row.paymentId, { paymentId: found.id, merchantId: row.merchantId });
    }
  }

  const selected = limit > 0 ? truth.slice(0, limit) : truth;
  const rows: Row[] = [];
  const evaluationRunId = randomUUID();
  let done = 0;

  for (const t of selected) {
    const mapped = idMap.get(t.paymentId);
    if (mapped === undefined) continue;
    const scope = trustedMerchantScope(asId<MerchantId>(mapped.merchantId));
    const unit = await loadUnit(db, scope, asId<PaymentId>(mapped.paymentId));
    if (unit === null) continue;

    const verdict = reconcileUnit(unit);
    const ctx = { scope, paymentId: mapped.paymentId };

    for (const system of systems) {
      const outcome =
        system === 'A'
          ? runSystemA(unit)
          : system === 'B'
            ? await runSystemB(unit, registry, ctx)
            : useV2
              ? await runSystemCv2(
                  unit,
                  registry,
                  ctx,
                  gateway,
                  AGENT_BUDGET,
                  verdict.reasons,
                  verdict.discrepancy.amountMinor.toString(),
                )
              : await runSystemC(
                  unit,
                  registry,
                  ctx,
                  gateway,
                  AGENT_BUDGET,
                  verdict.reasons,
                  verdict.discrepancy.amountMinor.toString(),
                );

      rows.push({
        system,
        split: t.split,
        paymentId: t.paymentId,
        stratum: t.noveltyStratum,
        outcome: scoreOutcome({
          effectiveDisposition: outcome.effectiveDisposition,
          proposedCause: outcome.proposedCause,
          trueDisposition: t.trueDisposition,
          trueCauses: t.trueCauses,
        }),
        toolCallCount: outcome.toolCallCount,
        latencyMs: outcome.latencyMs,
        stopReason: outcome.stopReason,
        verifierPassed: outcome.verifierPassed,
        verifierFailures: outcome.verifierFailures,
        proposedCause: outcome.proposedCause,
        effectiveDisposition: outcome.effectiveDisposition,
        trueCauseTuple: t.trueCauseTuple,
        trueDisposition: t.trueDisposition,
      });
    }

    done += 1;
    if (done % 10 === 0) console.log(`  ${done}/${selected.length} cases`);
  }

  await db.close();

  const outPath = arg('out', 'eval-results.json');
  writeFileSync(
    outPath,
    JSON.stringify({ evaluationRunId, generatorRunId, model: activeModel, rows }, null, 2),
  );

  console.log(`\ncases ${selected.length}   rows ${rows.length}   -> ${outPath}\n`);
  for (const system of systems) {
    for (const split of splits) {
      const subset = rows.filter((r) => r.system === system && r.split === split);
      if (subset.length === 0) continue;
      const m = computeMetrics(subset);
      console.log(
        `${system} ${split.padEnd(13)} n=${String(m.n).padStart(3)}  ESRR ${(m.esrr * 100).toFixed(1)}%  URR ${(m.urr * 100).toFixed(1)}%  ` +
          `wrongCause ${(m.wrongCauseRate * 100).toFixed(1)}%  abstain ${(m.abstentionRate * 100).toFixed(1)}%  ` +
          `tools ${m.meanToolCalls.toFixed(1)}  ${(m.meanLatencyMs / 1000).toFixed(1)}s`,
      );
    }
  }
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
