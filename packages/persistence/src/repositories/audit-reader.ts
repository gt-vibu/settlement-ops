/**
 * Audit read access.
 *
 * Read-only by construction. There is no update and no delete method here, and none may be
 * added: the application database role has UPDATE and DELETE revoked on `audit_events`
 * (migration 0004), so immutability does not depend on this file staying disciplined.
 *
 * Payloads are returned as stored. The writers already redact - nothing sensitive is
 * placed in a payload in the first place (`AUDIT_TRAIL.md` section 5).
 */

import { asId, type CaseId } from '@settlementops/shared';
import type { MerchantScope } from '@settlementops/domain';
import type { AuditEventView, AuditReader } from '@settlementops/application';
import type { DatabaseHandle } from '../client.js';

interface Row {
  id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  correlation_id: string;
  previous_state: string | null;
  next_state: string | null;
  case_version: number | null;
  payload_json: Record<string, unknown>;
  created_at: Date;
}

const COLUMNS = `id, entity_type, entity_id, event_type, actor_type, actor_id,
                 correlation_id, previous_state, next_state, case_version,
                 payload_json, created_at`;

const toView = (row: Row): AuditEventView => ({
  id: row.id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  eventType: row.event_type,
  actorType: row.actor_type,
  actorId: row.actor_id,
  correlationId: row.correlation_id,
  previousState: row.previous_state,
  nextState: row.next_state,
  caseVersion: row.case_version,
  payload: row.payload_json,
  occurredAt: row.created_at,
});

export const createAuditReader = (db: DatabaseHandle): AuditReader => ({
  /**
   * History for one case, oldest first - a forensic reading order, not a feed.
   *
   * Matches on the case id AND on any scenario/import/run entity carrying the same
   * correlation id, so the trail shows the whole chain that produced the case rather than
   * only what happened after it existed.
   *
   * OTHER CASES ARE EXCLUDED. One reconciliation run opens many cases under a single
   * correlation id; including them here put a sibling case's `reconciliation_exception_created`
   * event on this case's trail, indistinguishable from its own. On a financial audit trail
   * that is misattribution, not extra context.
   */
  listForCase: async (scope: MerchantScope, caseId: CaseId, limit: number) => {
    const result = await db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM audit_events
        WHERE merchant_id = $1
          AND (
            (entity_type = 'reconciliation_case' AND entity_id = $2)
            OR (
              entity_type <> 'reconciliation_case'
              AND correlation_id IN (
                SELECT correlation_id FROM audit_events
                 WHERE merchant_id = $1
                   AND entity_type = 'reconciliation_case'
                   AND entity_id = $2
              )
            )
          )
        ORDER BY created_at ASC
        LIMIT $3`,
      [scope.merchantId, caseId, limit],
    );
    return result.rows.map(toView);
  },

  /** Tenant-scoped recent activity, newest first. */
  listRecent: async (scope: MerchantScope, limit: number) => {
    const result = await db.pool.query<Row>(
      `SELECT ${COLUMNS} FROM audit_events
        WHERE merchant_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [scope.merchantId, limit],
    );
    return result.rows.map(toView);
  },

  countForCase: async (scope: MerchantScope, caseId: CaseId) => {
    const result = await db.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
        WHERE merchant_id = $1 AND entity_type = 'reconciliation_case' AND entity_id = $2`,
      [scope.merchantId, asId<CaseId>(caseId)],
    );
    return Number(result.rows[0]?.count ?? '0');
  },
});
