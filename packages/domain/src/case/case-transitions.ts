/**
 * The transition table (specs/STATE_MACHINE.md v2.0.0 section 2), as data.
 *
 * Expressed as a table rather than as branching logic so that the legal graph can be
 * read, tested and audited in one place, and so a transition cannot be invented at a
 * call site to make a flow work.
 */

import type { CaseState, TransitionActor } from './case-state.js';

export interface TransitionRule {
  readonly from: CaseState;
  readonly to: CaseState;
  readonly actors: readonly TransitionActor[];
  readonly event: string;
  /** Requires an Outcome record to exist in the same transaction. */
  readonly requiresOutcome?: boolean;
  readonly note?: string;
}

const S: readonly TransitionActor[] = ['SYSTEM'];
const OP: readonly TransitionActor[] = ['OPERATOR'];
const SYS_OP: readonly TransitionActor[] = ['SYSTEM', 'OPERATOR'];
const APPROVER: readonly TransitionActor[] = ['APPROVER'];
const OP_APPROVER: readonly TransitionActor[] = ['OPERATOR', 'APPROVER'];
const HUMAN: readonly TransitionActor[] = ['OPERATOR', 'APPROVER', 'ADMIN'];
const ADMIN: readonly TransitionActor[] = ['ADMIN'];

export const TRANSITIONS: readonly TransitionRule[] = [
  { from: 'RECEIVED', to: 'NORMALIZED', actors: S, event: 'record_normalized' },
  { from: 'NORMALIZED', to: 'MATCHING', actors: S, event: 'reconciliation_started' },
  {
    from: 'MATCHING',
    to: 'RECONCILED',
    actors: S,
    event: 'reconciliation_completed',
    note: 'fully reconciled within tolerance; AI never invoked',
  },
  { from: 'MATCHING', to: 'EXCEPTION', actors: S, event: 'reconciliation_exception_created' },
  { from: 'RECONCILED', to: 'CLOSED', actors: S, event: 'case_closed' },
  { from: 'EXCEPTION', to: 'INVESTIGATING', actors: SYS_OP, event: 'investigation_started' },
  {
    from: 'EXCEPTION',
    to: 'ESCALATED',
    actors: SYS_OP,
    event: 'case_escalated',
    note: 'AI kill switch off, policy-ineligible, or operator escalation',
  },
  { from: 'INVESTIGATING', to: 'ACTION_PROPOSED', actors: S, event: 'verification_completed' },
  { from: 'INVESTIGATING', to: 'REQUESTING_EVIDENCE', actors: S, event: 'evidence_requested' },
  { from: 'INVESTIGATING', to: 'ESCALATED', actors: SYS_OP, event: 'case_escalated' },
  { from: 'ACTION_PROPOSED', to: 'APPROVAL_PENDING', actors: S, event: 'approval_required' },
  { from: 'ACTION_PROPOSED', to: 'APPROVED', actors: APPROVER, event: 'approval_recorded' },
  {
    from: 'ACTION_PROPOSED',
    to: 'REQUESTING_EVIDENCE',
    actors: SYS_OP,
    event: 'evidence_requested',
  },
  { from: 'ACTION_PROPOSED', to: 'ESCALATED', actors: SYS_OP, event: 'case_escalated' },
  {
    from: 'ACTION_PROPOSED',
    to: 'INVESTIGATING',
    actors: S,
    event: 'proposal_invalidated',
    note: 'late evidence invalidated the proposal',
  },
  { from: 'APPROVAL_PENDING', to: 'APPROVED', actors: APPROVER, event: 'approval_recorded' },
  { from: 'APPROVAL_PENDING', to: 'REJECTED', actors: APPROVER, event: 'approval_recorded' },
  {
    from: 'APPROVAL_PENDING',
    to: 'REQUESTING_EVIDENCE',
    actors: OP_APPROVER,
    event: 'evidence_requested',
  },
  { from: 'APPROVAL_PENDING', to: 'ESCALATED', actors: OP_APPROVER, event: 'case_escalated' },
  {
    from: 'APPROVAL_PENDING',
    to: 'INVESTIGATING',
    actors: S,
    event: 'proposal_invalidated',
    note: 'late evidence invalidated the proposal',
  },
  {
    from: 'APPROVED',
    to: 'STAGED',
    actors: S,
    event: 'staging_created',
    note: 'recommended_action requires staging',
  },
  {
    from: 'APPROVED',
    to: 'CLOSED',
    actors: S,
    event: 'outcome_logged',
    requiresOutcome: true,
    note: 'recommended_action = NONE; Outcome written in the same transaction',
  },
  { from: 'REJECTED', to: 'INVESTIGATING', actors: OP, event: 'investigation_started' },
  { from: 'REJECTED', to: 'ESCALATED', actors: OP_APPROVER, event: 'case_escalated' },
  {
    from: 'REQUESTING_EVIDENCE',
    to: 'INVESTIGATING',
    actors: SYS_OP,
    event: 'evidence_received',
  },
  {
    from: 'REQUESTING_EVIDENCE',
    to: 'ESCALATED',
    actors: SYS_OP,
    event: 'evidence_request_expired',
  },
  { from: 'ESCALATED', to: 'REOPENED', actors: HUMAN, event: 'case_reopened' },
  {
    from: 'ESCALATED',
    to: 'CLOSED',
    actors: HUMAN,
    event: 'case_closed',
    requiresOutcome: true,
    note: 'resolved outside the system',
  },
  { from: 'STAGED', to: 'APPLIED', actors: S, event: 'staged_action_applied' },
  { from: 'STAGED', to: 'ESCALATED', actors: S, event: 'case_escalated' },
  { from: 'APPLIED', to: 'OUTCOME_LOGGED', actors: SYS_OP, event: 'outcome_logged' },
  {
    from: 'OUTCOME_LOGGED',
    to: 'CLOSED',
    actors: S,
    event: 'case_closed',
    requiresOutcome: true,
  },
  { from: 'CLOSED', to: 'REOPENED', actors: ADMIN, event: 'case_reopened' },
  { from: 'REOPENED', to: 'INVESTIGATING', actors: SYS_OP, event: 'investigation_started' },
];

export const findTransition = (from: CaseState, to: CaseState): TransitionRule | undefined =>
  TRANSITIONS.find((t) => t.from === from && t.to === to);

export const canTransition = (from: CaseState, to: CaseState): boolean =>
  findTransition(from, to) !== undefined;

/**
 * Human roles are hierarchical: ADMIN > APPROVER > OPERATOR
 * (specs/AUTHORIZATION_MODEL.md section 4 - each role has all the capabilities of the
 * one below). A transition permitting OPERATOR is therefore also permitted to an
 * APPROVER or an ADMIN.
 *
 * SYSTEM sits deliberately OUTSIDE that hierarchy. It is not a senior human role, and no
 * human - not even ADMIN - may perform a SYSTEM-only transition such as
 * APPROVED -> STAGED. That is what keeps staging machine-driven rather than something a
 * sufficiently privileged human can reach directly.
 */
const HUMAN_RANK: Partial<Record<TransitionActor, number>> = {
  OPERATOR: 1,
  APPROVER: 2,
  ADMIN: 3,
};

export const isActorPermitted = (
  from: CaseState,
  to: CaseState,
  actor: TransitionActor,
): boolean => {
  const rule = findTransition(from, to);
  if (rule === undefined) return false;
  if (rule.actors.includes(actor)) return true;

  const actorRank = HUMAN_RANK[actor];
  if (actorRank === undefined) return false; // SYSTEM never inherits a human permission

  return rule.actors.some((permitted) => {
    const permittedRank = HUMAN_RANK[permitted];
    return permittedRank !== undefined && permittedRank <= actorRank;
  });
};

export const allowedTargets = (from: CaseState): readonly CaseState[] =>
  TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);

export const requiresOutcomeRecord = (from: CaseState, to: CaseState): boolean =>
  findTransition(from, to)?.requiresOutcome === true;
