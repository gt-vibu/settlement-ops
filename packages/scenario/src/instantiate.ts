/**
 * Scenario instantiation.
 *
 * THE SAME-PIPELINE RULE (specs/SCENARIO_ENGINE.md)
 *
 * This use case generates records and then calls `submitImport` and `runReconciliation` -
 * the identical functions the batch path uses. There is no scenario-specific matcher, no
 * `isDemo` branch anywhere below this file, and no way for a scenario to write a case
 * state directly.
 *
 * The consequence is deliberate: a scenario can fail to produce the exception it was
 * designed for. That would be a real finding about the deterministic baseline, and the
 * system reports it (`cases_created: 0`) rather than forcing the intended outcome.
 *
 * A scenario therefore produces genuine persisted state that survives a restart and is
 * queryable through the ordinary case API. It is never a frontend animation.
 */

import type { Clock, IdGenerator } from '@settlementops/shared';
import {
  runReconciliation,
  scopeOf,
  submitImport,
  type AuditWriter,
  type CaseRepository,
  type RecordRepository,
  type ReconciliationRunRepository,
  type ImportRepository,
  type RequestContext,
  type ScenarioInstance,
  type ScenarioRepository,
} from '@settlementops/application';
import { scenarioById } from './definitions.js';
import { generateScenarioBatch } from './generator.js';

export interface InstantiateDeps {
  readonly scenarios: ScenarioRepository;
  readonly imports: ImportRepository;
  readonly records: RecordRepository;
  readonly runs: ReconciliationRunRepository;
  readonly cases: CaseRepository;
  readonly audit: AuditWriter;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export type InstantiateResult =
  | { readonly kind: 'OK'; readonly instance: ScenarioInstance; readonly replayed: boolean }
  | { readonly kind: 'UNKNOWN_SCENARIO' }
  | { readonly kind: 'FAILED'; readonly instance: ScenarioInstance; readonly reason: string };

export interface InstantiateInput {
  readonly scenarioId: string;
  /** Same seed + same scenario produces the same records. */
  readonly seed: number;
  readonly idempotencyKey: string;
}

export const instantiateScenario = async (
  deps: InstantiateDeps,
  ctx: RequestContext,
  input: InstantiateInput,
): Promise<InstantiateResult> => {
  const definition = scenarioById(input.scenarioId);
  if (definition === null) return { kind: 'UNKNOWN_SCENARIO' };

  const scope = scopeOf(ctx);

  const { instance, created } = await deps.scenarios.createOrGet(scope, {
    id: deps.ids.next(),
    scenarioId: definition.id,
    seed: input.seed,
    idempotencyKey: input.idempotencyKey,
    // Stored for the demo operator. Never reaches a case or evidence endpoint.
    expectedCause: definition.expectedCause,
    correlationId: ctx.correlationId,
  });

  // A replayed key returns the original instance and creates no second lifecycle.
  if (!created) return { kind: 'OK', instance, replayed: true };

  try {
    const batch = generateScenarioBatch(definition, input.seed);

    const imported = await submitImport(
      {
        imports: deps.imports,
        records: deps.records,
        audit: deps.audit,
        ids: deps.ids,
        clock: deps.clock,
      },
      ctx,
      { body: batch, idempotencyKey: `${input.idempotencyKey}:import` },
    );

    if (imported.kind !== 'ACCEPTED') {
      await deps.scenarios.markFailed(scope, instance.id, 'IMPORT_VALIDATION_FAILED');
      return {
        kind: 'FAILED',
        instance,
        reason: 'generated records failed import validation',
      };
    }

    const run = await runReconciliation(
      {
        runs: deps.runs,
        records: deps.records,
        cases: deps.cases,
        audit: deps.audit,
        ids: deps.ids,
        clock: deps.clock,
      },
      ctx,
      { importId: imported.summary.id, maxPayments: 100 },
    );

    const linked = await deps.scenarios.linkCases(scope, instance.id, run.id);

    await deps.scenarios.complete(scope, instance.id, {
      importId: imported.summary.id,
      reconciliationRunId: run.id,
      recordsCreated: imported.summary.acceptedCount,
      casesCreated: linked,
    });

    await deps.audit.append(scope, {
      id: deps.ids.next(),
      entityType: 'scenario_instance',
      entityId: instance.id,
      eventType: 'reconciliation_completed',
      actorType: 'USER',
      actorId: ctx.userId,
      correlationId: ctx.correlationId,
      previousState: null,
      nextState: 'SUCCEEDED',
      caseVersion: null,
      payload: {
        scenario_id: definition.id,
        seed: input.seed,
        records_created: imported.summary.acceptedCount,
        cases_created: linked,
        // Deliberately absent: expected_cause. An audit payload is readable through
        // the ordinary API, so the demo checkpoint must not travel in it.
      },
    });

    const finalInstance = await deps.scenarios.findById(scope, instance.id);
    return { kind: 'OK', instance: finalInstance ?? instance, replayed: false };
  } catch (error) {
    await deps.scenarios.markFailed(scope, instance.id, 'SCENARIO_EXECUTION_FAILED');
    return {
      kind: 'FAILED',
      instance,
      reason: error instanceof Error ? error.message : 'scenario execution failed',
    };
  }
};
