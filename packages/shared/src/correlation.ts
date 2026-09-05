/**
 * Correlation identifiers. Every API request, worker job, agent run, tool call,
 * state transition and audit event carries one (specs/OBSERVABILITY.md section 1).
 */

import type { CorrelationId, RequestId } from './ids.js';

export interface Correlation {
  readonly requestId: RequestId;
  readonly correlationId: CorrelationId;
  readonly causationId: CorrelationId | null;
}

export const newCorrelation = (
  requestId: RequestId,
  correlationId: CorrelationId,
  causationId: CorrelationId | null = null,
): Correlation => ({ requestId, correlationId, causationId });
