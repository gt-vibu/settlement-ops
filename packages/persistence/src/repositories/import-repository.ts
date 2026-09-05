/**
 * Import repository.
 *
 * Idempotency is enforced by the database (`imports_idempotency_unique`), not by a
 * read-then-write in application code, because a read-then-write races: two concurrent
 * replays of the same key would both see "not found" and both insert.
 */

import type { MerchantId } from '@settlementops/shared';
import { asId } from '@settlementops/shared';
import type { MerchantScope } from '@settlementops/domain';
import type { ImportRepository, ImportSummary } from '@settlementops/application';
import type { DatabaseHandle } from '../client.js';

interface Row {
  id: string;
  merchant_id: string;
  source_type: string;
  status: string;
  submitted_count: number;
  accepted_count: number;
  rejected_count: number;
  duplicate_count: number;
  validation_errors: unknown[];
  created_at: Date;
  completed_at: Date | null;
}

const toSummary = (row: Row): ImportSummary => ({
  id: row.id,
  merchantId: asId<MerchantId>(row.merchant_id),
  sourceType: row.source_type,
  status: row.status as ImportSummary['status'],
  submittedCount: row.submitted_count,
  acceptedCount: row.accepted_count,
  rejectedCount: row.rejected_count,
  duplicateCount: row.duplicate_count,
  validationErrors: row.validation_errors,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

const COLUMNS = `id, merchant_id, source_type, status, submitted_count, accepted_count,
                 rejected_count, duplicate_count, validation_errors, created_at, completed_at`;

export const createImportRepository = (db: DatabaseHandle): ImportRepository => ({
  createOrGet: async (scope: MerchantScope, input) => {
    const inserted = await db.pool.query<Row>(
      `INSERT INTO imports
         (id, merchant_id, source_type, status, idempotency_key, submitted_count, correlation_id)
       VALUES ($1, $2, $3, 'RUNNING', $4, $5, $6)
       ON CONFLICT (merchant_id, idempotency_key) DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        input.id,
        scope.merchantId,
        input.sourceType,
        input.idempotencyKey,
        input.submittedCount,
        input.correlationId,
      ],
    );

    const row = inserted.rows[0];
    if (row !== undefined) return { summary: toSummary(row), created: true };

    // Conflict: an import already exists for this key. Return it unchanged.
    const existing = await db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM imports WHERE merchant_id = $1 AND idempotency_key = $2`,
      [scope.merchantId, input.idempotencyKey],
    );
    const found = existing.rows[0];
    if (found === undefined) throw new Error('import conflict resolved to no row');
    return { summary: toSummary(found), created: false };
  },

  complete: async (scope: MerchantScope, id: string, counts) => {
    await db.pool.query(
      `UPDATE imports
          SET status = 'SUCCEEDED', accepted_count = $3, rejected_count = $4,
              duplicate_count = $5, validation_errors = $6::jsonb, completed_at = now()
        WHERE id = $1 AND merchant_id = $2`,
      [
        id,
        scope.merchantId,
        counts.accepted,
        counts.rejected,
        counts.duplicates,
        JSON.stringify(counts.validationErrors),
      ],
    );
  },

  markFailed: async (scope: MerchantScope, id: string, reason: string) => {
    await db.pool.query(
      `UPDATE imports
          SET status = 'FAILED', completed_at = now(),
              validation_errors = $3::jsonb
        WHERE id = $1 AND merchant_id = $2`,
      [id, scope.merchantId, JSON.stringify([{ failure: reason }])],
    );
  },

  findById: async (scope: MerchantScope, id: string) => {
    const result = await db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM imports WHERE id = $1 AND merchant_id = $2`,
      [id, scope.merchantId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toSummary(row);
  },
});
