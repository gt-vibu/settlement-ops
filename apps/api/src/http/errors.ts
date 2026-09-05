/**
 * Error envelope mapping (specs/ERROR_CONTRACT.md).
 *
 * Messages never reveal stack traces, SQL, filesystem paths or secrets. Codes are a
 * stable contract; messages may evolve.
 */

import type { TransitionFailure } from '@settlementops/application';
import type { FastifyReply } from 'fastify';
import { HTTP_STATUS_BY_CODE, type ErrorCode, type ErrorEnvelope } from '@settlementops/shared';

export const envelope = (
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Readonly<Record<string, unknown>>,
): ErrorEnvelope => ({
  error:
    details === undefined
      ? { code, message, request_id: requestId }
      : { code, message, request_id: requestId, details },
});

export const statusFor = (code: ErrorCode): number => HTTP_STATUS_BY_CODE[code];

/** Safe generic messages. Nothing here leaks whether a resource exists. */
export const SAFE_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_ERROR: 'The request failed validation.',
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'You are not permitted to perform this operation.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The resource changed before this request was applied.',
  INVALID_STATE: 'The operation is not valid for the current state.',
  IDEMPOTENCY_CONFLICT: 'This idempotency key was used with a different request.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  MODEL_FAILURE: 'The model provider could not complete the request.',
  TOOL_FAILURE: 'An evidence tool failed.',
  VERIFICATION_FAILURE: 'Deterministic verification could not complete.',
  INTERNAL_ERROR: 'An internal error occurred.',
};

/** Maps a domain transition failure onto the stable error contract. */
export const failureReply = (
  reply: FastifyReply,
  requestId: string,
  failure: TransitionFailure,
): FastifyReply => {
  switch (failure.kind) {
    case 'NOT_FOUND':
      return reply.code(404).send(envelope('NOT_FOUND', SAFE_MESSAGES.NOT_FOUND, requestId));
    case 'VERSION_CONFLICT':
      return reply.code(409).send(
        envelope('CONFLICT', SAFE_MESSAGES.CONFLICT, requestId, {
          current_case_version: failure.actual,
        }),
      );
    case 'ILLEGAL_TRANSITION':
    case 'ACTOR_NOT_PERMITTED':
    case 'OUTCOME_REQUIRED':
      return reply
        .code(409)
        .send(envelope('INVALID_STATE', SAFE_MESSAGES.INVALID_STATE, requestId));
  }
};
