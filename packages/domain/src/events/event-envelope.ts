/**
 * Event envelope (specs/EVENT_MODEL.md section 2).
 *
 * event_id is the deduplication key; consumers must be idempotent. Global ordering is
 * not assumed - ordering is guaranteed only within one entity's transition stream.
 */

import type { CorrelationId, MerchantId } from '@settlementops/shared';
import type { EventType } from './event-types.js';

export interface EventEnvelope<TPayload = Readonly<Record<string, unknown>>> {
  readonly eventId: string;
  readonly eventType: EventType;
  readonly eventVersion: number;
  readonly occurredAt: Date;
  readonly ingestedAt: Date;
  readonly merchantId: MerchantId;
  readonly entityType: string;
  readonly entityId: string;
  readonly correlationId: CorrelationId;
  readonly causationId: CorrelationId | null;
  readonly payload: TPayload;
}
