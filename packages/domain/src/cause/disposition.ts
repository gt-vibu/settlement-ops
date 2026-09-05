/**
 * Closed disposition set (specs/DISPOSITION_SCHEMA.md section 1).
 *
 * There is no fourth free-form disposition. The model proposes one of these; the
 * deterministic verifier decides the effective one.
 */

export const DISPOSITIONS = ['RESOLVE', 'REQUEST_EVIDENCE', 'ESCALATE'] as const;

export type Disposition = (typeof DISPOSITIONS)[number];

export const isDisposition = (value: string): value is Disposition =>
  (DISPOSITIONS as readonly string[]).includes(value);

export const RECOMMENDED_ACTION_TYPES = [
  'STAGE_LEDGER_ADJUSTMENT',
  'DRAFT_EVIDENCE_REQUEST',
  'NONE',
] as const;

export type RecommendedActionType = (typeof RECOMMENDED_ACTION_TYPES)[number];

/** Whether an approved proposal with this action must create a StagedAction. */
export const requiresStaging = (action: RecommendedActionType): boolean => action !== 'NONE';
