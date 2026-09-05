/**
 * Human approval and staging.
 *
 * The AI never moves money. A verified proposal becomes `ACTION_PROPOSED`, a human decides,
 * and an approved financial action is STAGED - written as an intent for a human to apply,
 * never applied automatically.
 *
 * `APPROVAL_AND_STAGING.md`; the state names come from `STATE_MACHINE.md` v2.0.0, where
 * `APPLIED` was deliberately named that rather than `EXECUTED` so nothing in the vocabulary
 * suggests the system reached into a ledger by itself.
 */

import type { CaseId, Clock, IdGenerator } from '@settlementops/shared';
import {
  hasAtLeast,
  scopeOf,
  type AuditWriter,
  type CaseTransitionRepository,
  type CaseTransitionResult,
  type RequestContext,
  type TransitionFailure,
} from '@settlementops/application';

export interface ApprovalDeps {
  readonly transitions: CaseTransitionRepository;
  readonly audit: AuditWriter;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export type ApprovalResult =
  | { readonly kind: 'APPROVED'; readonly transition: CaseTransitionResult }
  | { readonly kind: 'REJECTED'; readonly transition: CaseTransitionResult }
  | { readonly kind: 'STAGED'; readonly transition: CaseTransitionResult }
  | { readonly kind: 'FORBIDDEN' }
  | { readonly kind: 'REASON_REQUIRED' }
  | { readonly kind: 'FAILED'; readonly failure: TransitionFailure };

const isFailure = (value: CaseTransitionResult | TransitionFailure): value is TransitionFailure =>
  'kind' in value;

/**
 * Approve a proposed action.
 *
 * Requires APPROVER. An OPERATOR may investigate and escalate but may not approve a
 * financial action - separation of duties is a role check, not a UI decision.
 */
export const approveProposal = async (
  deps: ApprovalDeps,
  ctx: RequestContext,
  input: { caseId: CaseId; expectedVersion: number; note: string },
): Promise<ApprovalResult> => {
  if (!hasAtLeast(ctx, 'APPROVER')) return { kind: 'FORBIDDEN' };
  const scope = scopeOf(ctx);

  const approved = await deps.transitions.transition(scope, {
    caseId: input.caseId,
    to: 'APPROVED',
    actor: 'APPROVER',
    expectedVersion: input.expectedVersion,
  });
  if (isFailure(approved)) return { kind: 'FAILED', failure: approved };

  await deps.audit.append(scope, {
    id: deps.ids.next(),
    entityType: 'reconciliation_case',
    entityId: input.caseId,
    eventType: 'proposal_approved',
    actorType: 'USER',
    actorId: ctx.userId,
    correlationId: ctx.correlationId,
    previousState: approved.previousState,
    nextState: approved.nextState,
    caseVersion: approved.caseVersion,
    payload: { note: input.note.slice(0, 500) },
  });

  return { kind: 'APPROVED', transition: approved };
};

export const rejectProposal = async (
  deps: ApprovalDeps,
  ctx: RequestContext,
  input: { caseId: CaseId; expectedVersion: number; reason: string },
): Promise<ApprovalResult> => {
  if (!hasAtLeast(ctx, 'APPROVER')) return { kind: 'FORBIDDEN' };
  // A rejection without a reason is not auditable, so it is not permitted.
  if (input.reason.trim() === '') return { kind: 'REASON_REQUIRED' };
  const scope = scopeOf(ctx);

  const rejected = await deps.transitions.transition(scope, {
    caseId: input.caseId,
    to: 'REJECTED',
    actor: 'APPROVER',
    expectedVersion: input.expectedVersion,
  });
  if (isFailure(rejected)) return { kind: 'FAILED', failure: rejected };

  await deps.audit.append(scope, {
    id: deps.ids.next(),
    entityType: 'reconciliation_case',
    entityId: input.caseId,
    eventType: 'proposal_rejected',
    actorType: 'USER',
    actorId: ctx.userId,
    correlationId: ctx.correlationId,
    previousState: rejected.previousState,
    nextState: rejected.nextState,
    caseVersion: rejected.caseVersion,
    payload: { reason: input.reason.slice(0, 500) },
  });

  return { kind: 'REJECTED', transition: rejected };
};

/**
 * Stage the approved action.
 *
 * STAGED is where this system stops. It records WHAT WOULD BE DONE - a ledger adjustment
 * of a stated amount, against a stated settlement - and hands it to a human to apply in
 * the system of record. Nothing here writes to a ledger, and there is deliberately no
 * code path that would.
 */
export const stageApprovedAction = async (
  deps: ApprovalDeps,
  ctx: RequestContext,
  input: {
    caseId: CaseId;
    expectedVersion: number;
    actionType: string;
    amountMinor: string;
    currency: string;
  },
): Promise<ApprovalResult> => {
  if (!hasAtLeast(ctx, 'APPROVER')) return { kind: 'FORBIDDEN' };
  const scope = scopeOf(ctx);

  const staged = await deps.transitions.transition(scope, {
    caseId: input.caseId,
    to: 'STAGED',
    actor: 'SYSTEM',
    expectedVersion: input.expectedVersion,
  });
  if (isFailure(staged)) return { kind: 'FAILED', failure: staged };

  await deps.audit.append(scope, {
    id: deps.ids.next(),
    entityType: 'reconciliation_case',
    entityId: input.caseId,
    eventType: 'action_staged',
    actorType: 'SYSTEM',
    actorId: null,
    correlationId: ctx.correlationId,
    previousState: staged.previousState,
    nextState: staged.nextState,
    caseVersion: staged.caseVersion,
    payload: {
      action_type: input.actionType,
      amount_minor: input.amountMinor,
      currency: input.currency,
      note: 'staged for human application; this system does not write to a ledger',
    },
  });

  return { kind: 'STAGED', transition: staged };
};
