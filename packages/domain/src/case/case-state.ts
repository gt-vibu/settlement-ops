/**
 * Canonical case states (specs/STATE_MACHINE.md v2.0.0 section 1).
 *
 * Seventeen states. RECONCILED, APPLIED and OUTCOME_LOGGED were added by readiness
 * decision D4. APPLIED was deliberately named APPLIED rather than EXECUTED: the
 * staged action is applied inside the synthetic system and no external system is
 * mutated, and the name should not invite a reviewer to assume otherwise.
 */

export const CASE_STATES = [
  'RECEIVED',
  'NORMALIZED',
  'MATCHING',
  'RECONCILED',
  'EXCEPTION',
  'INVESTIGATING',
  'ACTION_PROPOSED',
  'APPROVAL_PENDING',
  'APPROVED',
  'REJECTED',
  'REQUESTING_EVIDENCE',
  'ESCALATED',
  'STAGED',
  'APPLIED',
  'OUTCOME_LOGGED',
  'CLOSED',
  'REOPENED',
] as const;

export type CaseState = (typeof CASE_STATES)[number];

export const isCaseState = (value: string): value is CaseState =>
  (CASE_STATES as readonly string[]).includes(value);

/**
 * Actors permitted to drive a transition.
 *
 * There is deliberately no AGENT member. specs/STATE_MACHINE.md section 5 rule 2:
 * the AI agent is never an authorized actor for any transition. It produces a
 * proposal; deterministic code moves the case.
 */
export const TRANSITION_ACTORS = ['SYSTEM', 'OPERATOR', 'APPROVER', 'ADMIN'] as const;

export type TransitionActor = (typeof TRANSITION_ACTORS)[number];

export const TERMINAL_STATES: readonly CaseState[] = ['CLOSED'];

export const isTerminal = (state: CaseState): boolean => TERMINAL_STATES.includes(state);
