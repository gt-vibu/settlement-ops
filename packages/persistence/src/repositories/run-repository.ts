/**
 * Reconciliation run repository.
 */

import { asId, type MerchantId } from '@settlementops/shared';
import type { MerchantScope } from '@settlementops/domain';
import type {
  ReconciliationRunRepository,
  ReconciliationRunSummary,
} from '@settlementops/application';
import type { DatabaseHandle } from '../client.js';

interface Row {
  id: string;
  merchant_id: string;
  import_id: string | null;
  status: string;
  policy_version: string;
  evaluated_count: number;
  reconciled_count: number;
  residual_count: number;
  failure_code: string | null;
  created_at: Date;
  completed_at: Date | null;
}

const COLUMNS = `id, merchant_id, import_id, status, policy_version, evaluated_count,
                 reconciled_count, residual_count, failure_code, created_at, completed_at`;

const toSummary = (row: Row): ReconciliationRunSummary => ({
  id: row.id,
  merchantId: asId<MerchantId>(row.merchant_id),
  importId: row.import_id,
  status: row.status as ReconciliationRunSummary['status'],
  policyVersion: row.policy_version,
  evaluatedCount: row.evaluated_count,
  reconciledCount: row.reconciled_count,
  residualCount: row.residual_count,
  failureCode: row.failure_code,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

export const createRunRepository = (db: DatabaseHandle): ReconciliationRunRepository => ({
  create: async (scope: MerchantScope, input) => {
    const result = await db.pool.query<Row>(
      `INSERT INTO reconciliation_runs
         (id, merchant_id, import_id, status, policy_version, correlation_id)
       VALUES ($1, $2, $3, 'RUNNING', $4, $5)
       RETURNING ${COLUMNS}`,
      [input.id, scope.merchantId, input.importId, input.policyVersion, input.correlationId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('failed to create reconciliation run');
    return toSummary(row);
  },

  complete: async (scope: MerchantScope, id: string, counts) => {
    await db.pool.query(
      `UPDATE reconciliation_runs
          SET status = 'SUCCEEDED', evaluated_count = $3, reconciled_count = $4,
              residual_count = $5, completed_at = now()
        WHERE id = $1 AND merchant_id = $2`,
      [id, scope.merchantId, counts.evaluated, counts.reconciled, counts.residual],
    );
  },

  markFailed: async (scope: MerchantScope, id: string, failureCode: string) => {
    await db.pool.query(
      `UPDATE reconciliation_runs
          SET status = 'FAILED', failure_code = $3, completed_at = now()
        WHERE id = $1 AND merchant_id = $2`,
      [id, scope.merchantId, failureCode],
    );
  },

  findById: async (scope: MerchantScope, id: string) => {
    const result = await db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM reconciliation_runs WHERE id = $1 AND merchant_id = $2`,
      [id, scope.merchantId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toSummary(row);
  },
});
