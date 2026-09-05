/**
 * Stable API error codes. Verbatim from specs/ERROR_CONTRACT.md.
 *
 * Codes are a contract; messages may evolve. Messages must never reveal stack
 * traces, SQL, filesystem paths or secrets.
 */

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE',
  'IDEMPOTENCY_CONFLICT',
  'DEPENDENCY_UNAVAILABLE',
  'MODEL_FAILURE',
  'TOOL_FAILURE',
  'VERIFICATION_FAILURE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly request_id: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

export const HTTP_STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  DEPENDENCY_UNAVAILABLE: 503,
  MODEL_FAILURE: 502,
  TOOL_FAILURE: 502,
  VERIFICATION_FAILURE: 422,
  INTERNAL_ERROR: 500,
};
