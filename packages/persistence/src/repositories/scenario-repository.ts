/**
 * Scenario instance repository.
 *
 * `expected_cause` is written here and is never selected by any read in this file. That
 * is deliberate: the column exists so a demo operator can be told what to expect, and
 * every projection that could reach an API response omits it. A scenario controls defect
 * injection; it must not hand the answer to the system under test
 * (specs/SCENARIO_ENGINE.md, specs/LEAKAGE_AUDIT.md section 7).
 */

import { asId, type MerchantId } from '@settlementops/shared';
import type { MerchantScope } from '@settlementops/domain';
import type { ScenarioInstance, ScenarioRepository } from '@settlementops/application';
import type { DatabaseHandle } from '../client.js';

interface Row {
  id: string;
  merchant_id: string;
  scenario_id: string;
  seed: string;
  status: string;
  import_id: string | null;
  reconciliation_run_id: string | null;
  records_created: number;
  cases_created: number;
  failure_code: string | null;
  created_at: Date;
  completed_at: Date | null;
}

/** Note the absence of expected_cause. Adding it here would leak it to the API. */
const COLUMNS = `id, merchant_id, scenario_id, seed, status, import_id,
                 reconciliation_run_id, records_created, cases_created,
                 failure_code, created_at, completed_at`;

const toInstance = (row: Row): ScenarioInstance => ({
  id: row.id,
  merchantId: asId<MerchantId>(row.merchant_id),
  scenarioId: row.scenario_id,
  seed: Number(row.seed),
  status: row.status as ScenarioInstance['status'],
  importId: row.import_id,
  reconciliationRunId: row.reconciliation_run_id,
  recordsCreated: row.records_created,
  casesCreated: row.cases_created,
  failureCode: row.failure_code,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

export const createScenarioRepository = (db: DatabaseHandle): ScenarioRepository => ({
  createOrGet: async (scope: MerchantScope, input) => {
    const inserted = await db.pool.query<Row>(
      `INSERT INTO scenario_instances
         (id, merchant_id, scenario_id, seed, idempotency_key, status,
          expected_cause, correlation_id)
       VALUES ($1, $2, $3, $4, $5, 'RUNNING', $6, $7)
       ON CONFLICT (merchant_id, idempotency_key) DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        input.id,
        scope.merchantId,
        input.scenarioId,
        input.seed,
        input.idempotencyKey,
        input.expectedCause,
        input.correlationId,
      ],
    );
    const row = inserted.rows[0];
    if (row !== undefined) return { instance: toInstance(row), created: true };

    const existing = await db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM scenario_instances
        WHERE merchant_id = $1 AND idempotency_key = $2`,
      [scope.merchantId, input.idempotencyKey],
    );
    const found = existing.rows[0];
    if (found === undefined) throw new Error('scenario conflict resolved to no row');
    return { instance: toInstance(found), created: false };
  },

  complete: async (scope: MerchantScope, id: string, result) => {
    await db.pool.query(
      `UPDATE scenario_instances
          SET status = 'SUCCEEDED', import_id = $3, reconciliation_run_id = $4,
              records_created = $5, cases_created = $6, completed_at = now()
        WHERE id = $1 AND merchant_id = $2`,
      [
        id,
        scope.merchantId,
        result.importId,
        result.reconciliationRunId,
        result.recordsCreated,
        result.casesCreated,
      ],
    );
  },

  markFailed: async (scope: MerchantScope, id: string, failureCode: string) => {
    await db.pool.query(
      `UPDATE scenario_instances
          SET status = 'FAILED', failure_code = $3, completed_at = now()
        WHERE id = $1 AND merchant_id = $2`,
      [id, scope.merchantId, failureCode],
    );
  },

  findById: async (scope: MerchantScope, id: string) => {
    const result = await db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM scenario_instances WHERE id = $1 AND merchant_id = $2`,
      [id, scope.merchantId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toInstance(row);
  },

  list: async (scope: MerchantScope, limit: number) => {
    const result = await db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM scenario_instances
        WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [scope.merchantId, limit],
    );
    return result.rows.map(toInstance);
  },

  linkCases: async (scope: MerchantScope, id: string, runId: string) => {
    const result = await db.pool.query(
      `UPDATE reconciliation_cases
          SET scenario_instance_id = $1
        WHERE merchant_id = $2 AND reconciliation_run_id = $3`,
      [id, scope.merchantId, runId],
    );
    return result.rowCount ?? 0;
  },
});
