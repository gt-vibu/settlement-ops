/**
 * Append-only audit writer.
 *
 * There is deliberately no update and no delete method on this adapter. Even if one were
 * added, the application database role has UPDATE and DELETE revoked on `audit_events`
 * (migration 0004), so immutability does not depend on this file being written carefully.
 */

import type { MerchantScope } from '@settlementops/domain';
import type { AuditWriter } from '@settlementops/application';
import type { DatabaseHandle } from '../client.js';

export const createAuditWriter = (db: DatabaseHandle): AuditWriter => ({
  append: async (scope: MerchantScope, event) => {
    await db.pool.query(
      `INSERT INTO audit_events
         (id, merchant_id, entity_type, entity_id, event_type, actor_type, actor_id,
          correlation_id, previous_state, next_state, case_version, payload_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        event.id,
        scope.merchantId,
        event.entityType,
        event.entityId,
        event.eventType,
        event.actorType,
        event.actorId,
        event.correlationId,
        event.previousState,
        event.nextState,
        event.caseVersion,
        JSON.stringify(event.payload),
      ],
    );
  },
});
