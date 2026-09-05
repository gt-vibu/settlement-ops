/**
 * Execute a deterministic reconciliation run.
 *
 * This use case orchestrates; it contains no financial rules. Every verdict comes from
 * `reconcileUnit` in the domain, so the baseline is testable without a database and
 * cannot drift between the interactive path and the evaluation harness
 * (`SCENARIO_ENGINE.md` same-pipeline rule).
 *
 * No AI is involved anywhere in this path.
 */

import type { Clock, IdGenerator, PaymentId } from '@settlementops/shared';
import { POLICY_VERSION, reconcileUnit } from '@settlementops/domain';
import { scopeOf, type RequestContext } from '../auth/request-context.js';
import type {
  AuditWriter,
  CaseRepository,
  RecordRepository,
  ReconciliationRunRepository,
  ReconciliationRunSummary,
} from '../ports/repositories.js';

export interface RunReconciliationDeps {
  readonly runs: ReconciliationRunRepository;
  readonly records: RecordRepository;
  readonly cases: CaseRepository;
  readonly audit: AuditWriter;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface RunReconciliationInput {
  readonly importId: string | null;
  /** Bound on how many payments one run evaluates. */
  readonly maxPayments: number;
}

const caseNumberFor = (runId: string, index: number): string =>
  `CASE-${runId.slice(0, 8).toUpperCase()}-${String(index + 1).padStart(4, '0')}`;

export const runReconciliation = async (
  deps: RunReconciliationDeps,
  ctx: RequestContext,
  input: RunReconciliationInput,
): Promise<ReconciliationRunSummary> => {
  const scope = scopeOf(ctx);

  const run = await deps.runs.create(scope, {
    id: deps.ids.next(),
    importId: input.importId,
    policyVersion: POLICY_VERSION,
    correlationId: ctx.correlationId,
  });

  const paymentIds: readonly PaymentId[] =
    input.importId === null
      ? await deps.records.listCapturedPaymentIds(scope, input.maxPayments)
      : await deps.records.listPaymentIdsForImport(scope, input.importId);

  let evaluated = 0;
  let reconciled = 0;
  let residual = 0;

  for (const paymentId of paymentIds.slice(0, input.maxPayments)) {
    const unit = await deps.records.loadUnit(scope, paymentId);
    if (unit === null) continue;

    const verdict = reconcileUnit(unit);
    evaluated += 1;

    if (verdict.outcome === 'RECONCILED') {
      reconciled += 1;
      // A clean payment never becomes a case and the AI is never invoked for it
      // (PRODUCT_PRINCIPLES.md section 2).
      continue;
    }

    residual += 1;
    const created = await deps.cases.createResidual(scope, {
      id: deps.ids.next(),
      caseNumber: caseNumberFor(run.id, residual - 1),
      runId: run.id,
      paymentId,
      verdict,
    });

    if (created.created) {
      await deps.audit.append(scope, {
        id: deps.ids.next(),
        entityType: 'reconciliation_case',
        entityId: created.id,
        eventType: 'reconciliation_exception_created',
        actorType: 'SYSTEM',
        actorId: null,
        correlationId: ctx.correlationId,
        previousState: 'MATCHING',
        nextState: 'EXCEPTION',
        caseVersion: 1,
        payload: {
          reasons: verdict.reasons,
          discrepancy_minor: verdict.discrepancy.amountMinor.toString(),
          currency: verdict.discrepancy.currency,
          policy_version: verdict.policyVersion,
        },
      });
    }
  }

  await deps.runs.complete(scope, run.id, { evaluated, reconciled, residual });
  const final = await deps.runs.findById(scope, run.id);
  return final ?? run;
};
