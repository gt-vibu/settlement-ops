/**
 * Domain event names (specs/EVENT_MODEL.md section 1).
 *
 * Past tense: these record facts that have occurred, not work to be performed.
 */

export const EVENT_TYPES = [
  'financial_record_ingested',
  'record_normalized',
  'reconciliation_started',
  'reconciliation_completed',
  'reconciliation_exception_created',
  'investigation_started',
  'tool_call_completed',
  'disposition_proposed',
  'verification_completed',
  'approval_required',
  'approval_recorded',
  'proposal_invalidated',
  'evidence_requested',
  'evidence_received',
  'evidence_request_expired',
  'staging_created',
  'staged_action_applied',
  'outcome_logged',
  'case_escalated',
  'case_reopened',
  'case_closed',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const isEventType = (value: string): value is EventType =>
  (EVENT_TYPES as readonly string[]).includes(value);
