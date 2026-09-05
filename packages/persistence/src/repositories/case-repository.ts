/**
 * Reconciliation case repository.
 *
 * `createResidual` relies on the partial unique index `cases_run_payment_unique` to make
 * case creation idempotent per (run, payment). A retried reconciliation job therefore
 * cannot double-create a case, and the guarantee holds under concurrency because it is
 * the database enforcing it.
 */

import { asId, type CaseId, type PaymentId } from '@settlementops/shared';
import type { MerchantScope } from '@settlementops/domain';
import type { CaseListItem, CaseRepository } from '@settlementops/application';
import type { DatabaseHandle } from '../client.js';

interface Row {
  id: string;
  case_number: string;
  state: string;
  priority: number;
  discrepancy_amount_minor: string;
  currency: string;
  reasons: string[];
  opened_at: Date;
}

const COLUMNS = `id, case_number, state, priority, discrepancy_amount_minor,
                 currency, reasons, opened_at`;

const toItem = (row: Row): CaseListItem => ({
  id: asId<CaseId>(row.id),
  caseNumber: row.case_number,
  state: row.state,
  priority: row.priority,
  // BIGINT arrives as a string from pg; it is kept as a string so no precision is
  // lost crossing the JS number boundary.
  discrepancyMinor: row.discrepancy_amount_minor,
  currency: row.currency,
  reasons: row.reasons,
  openedAt: row.opened_at,
});

/** Larger absolute discrepancies surface first. Queue aid only - never financial truth. */
const priorityFor = (discrepancyMinor: bigint): number => {
  const magnitude = discrepancyMinor < 0n ? -discrepancyMinor : discrepancyMinor;
  if (magnitude >= 10_000_00n) return 3;
  if (magnitude >= 1_000_00n) return 2;
  if (magnitude > 0n) return 1;
  return 0;
};

export const createCaseRepository = (db: DatabaseHandle): CaseRepository => ({
  createResidual: async (scope: MerchantScope, input) => {
    const { verdict } = input;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO reconciliation_cases
           (id, merchant_id, case_number, state, priority, discrepancy_amount_minor,
            currency, deterministic_reason, case_version, reconciliation_run_id,
            payment_id, reasons, checks_json, policy_version)
         VALUES ($1, $2, $3, 'EXCEPTION', $4, $5, $6, $7, 1, $8, $9, $10, $11::jsonb, $12)
         ON CONFLICT (reconciliation_run_id, payment_id)
           WHERE reconciliation_run_id IS NOT NULL AND payment_id IS NOT NULL
           DO NOTHING
         RETURNING id`,
        [
          input.id,
          scope.merchantId,
          input.caseNumber,
          priorityFor(verdict.discrepancy.amountMinor),
          verdict.discrepancy.amountMinor.toString(),
          verdict.discrepancy.currency,
          verdict.reasons.join(',') || 'UNSPECIFIED',
          input.runId,
          input.paymentId,
          verdict.reasons,
          JSON.stringify(verdict.checks),
          verdict.policyVersion,
        ],
      );

      const row = inserted.rows[0];
      if (row === undefined) {
        await client.query('ROLLBACK');
        const existing = await db.pool.query<{ id: string }>(
          `SELECT id FROM reconciliation_cases
            WHERE merchant_id = $1 AND reconciliation_run_id = $2 AND payment_id = $3`,
          [scope.merchantId, input.runId, input.paymentId],
        );
        const found = existing.rows[0];
        if (found === undefined) throw new Error('case conflict resolved to no row');
        return { id: asId<CaseId>(found.id), created: false };
      }

      // Evidence lineage: what the deterministic baseline actually consulted.
      for (const recordId of verdict.evidenceRecordIds) {
        await client.query(
          `INSERT INTO case_source_records (id, case_id, merchant_id, record_type, record_id)
           VALUES (gen_random_uuid(), $1, $2, 'DETERMINISTIC_EVIDENCE', $3)
           ON CONFLICT DO NOTHING`,
          [row.id, scope.merchantId, recordId],
        );
      }

      await client.query('COMMIT');
      return { id: asId<CaseId>(row.id), created: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  list: async (scope: MerchantScope, filter) => {
    const conditions = ['merchant_id = $1'];
    const params: unknown[] = [scope.merchantId];
    if (filter.state !== undefined) {
      params.push(filter.state);
      conditions.push(`state = $${params.length}`);
    }
    params.push(filter.limit, filter.offset);
    const result = await db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM reconciliation_cases
        WHERE ${conditions.join(' AND ')}
        ORDER BY priority DESC, opened_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return result.rows.map(toItem);
  },

  countByState: async (scope: MerchantScope) => {
    const result = await db.pool.query<{ state: string; count: string }>(
      `SELECT state, count(*)::text AS count FROM reconciliation_cases
        WHERE merchant_id = $1 GROUP BY state`,
      [scope.merchantId],
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows) counts[row.state] = Number(row.count);
    return counts;
  },

  findById: async (scope: MerchantScope, id: CaseId) => {
    const result = await db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM reconciliation_cases WHERE id = $1 AND merchant_id = $2`,
      [id, scope.merchantId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toItem(row);
  },

  paymentIdFor: async (scope, id) => {
    const result = await db.pool.query<{ payment_id: string | null }>(
      'SELECT payment_id FROM reconciliation_cases WHERE id = $1 AND merchant_id = $2',
      [id, scope.merchantId],
    );
    const found = result.rows[0]?.payment_id;
    return found === undefined || found === null ? null : asId<PaymentId>(found);
  },
});
