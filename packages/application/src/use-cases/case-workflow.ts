/**
 * Human-driven case workflow.
 *
 * Every transition in this file is initiated by an authenticated human and executed by
 * deterministic code. The AI agent is not an actor here and does not exist yet
 * (specs/STATE_MACHINE.md section 5 rule 2).
 *
 * Each use case follows the same shape: authorize, load current version, transition,
 * audit. Authorization is checked before the domain transition so an unauthorized caller
 * never learns whether the transition would have been legal.
 */

import type { CaseId, Clock, IdGenerator } from '@settlementops/shared';
import type { CaseState } from '@settlementops/domain';
import { hasAtLeast, scopeOf, type RequestContext } from '../auth/request-context.js';
import type { AuditWriter } from '../ports/repositories.js';
import type {
  CaseTransitionRepository,
  CaseTransitionResult,
  EvidenceRequestRepository,
  TransitionFailure,
} from '../ports/workflow-ports.js';

export interface WorkflowDeps {
  readonly transitions: CaseTransitionRepository;
  readonly evidence: EvidenceRequestRepository;
  readonly audit: AuditWriter;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export type WorkflowResult =
  | { readonly kind: 'OK'; readonly result: CaseTransitionResult }
  | { readonly kind: 'FORBIDDEN' }
  | { readonly kind: 'FAILED'; readonly failure: TransitionFailure };

const isFailure = (value: CaseTransitionResult | TransitionFailure): value is TransitionFailure =>
  'kind' in value;

const auditTransition = async (
  deps: WorkflowDeps,
  ctx: RequestContext,
  result: CaseTransitionResult,
  eventType: string,
  payload: Readonly<Record<string, unknown>>,
): Promise<void> => {
  await deps.audit.append(scopeOf(ctx), {
    id: deps.ids.next(),
    entityType: 'reconciliation_case',
    entityId: result.caseId,
    eventType,
    actorType: 'USER',
    actorId: ctx.userId,
    correlationId: ctx.correlationId,
    previousState: result.previousState,
    nextState: result.nextState,
    caseVersion: result.caseVersion,
    payload,
  });
};

const applyHumanTransition = async (
  deps: WorkflowDeps,
  ctx: RequestContext,
  input: {
    caseId: CaseId;
    to: CaseState;
    expectedVersion: number;
    eventType: string;
    payload: Readonly<Record<string, unknown>>;
  },
): Promise<WorkflowResult> => {
  const actor =
    ctx.roles.includes('APPROVER') || ctx.roles.includes('ADMIN') ? 'APPROVER' : 'OPERATOR';

  const outcome = await deps.transitions.transition(scopeOf(ctx), {
    caseId: input.caseId,
    to: input.to,
    actor,
    expectedVersion: input.expectedVersion,
  });

  if (isFailure(outcome)) return { kind: 'FAILED', failure: outcome };

  await auditTransition(deps, ctx, outcome, input.eventType, input.payload);
  return { kind: 'OK', result: outcome };
};

/** EXCEPTION -> ESCALATED and the other legal escalation sources. */
export const escalateCase = async (
  deps: WorkflowDeps,
  ctx: RequestContext,
  input: { caseId: CaseId; expectedVersion: number; reason: string },
): Promise<WorkflowResult> => {
  if (!hasAtLeast(ctx, 'OPERATOR')) return { kind: 'FORBIDDEN' };
  return applyHumanTransition(deps, ctx, {
    caseId: input.caseId,
    to: 'ESCALATED',
    expectedVersion: input.expectedVersion,
    eventType: 'case_escalated',
    // ESCALATED must always carry a concrete reason, never a bare status.
    payload: { reason: input.reason },
  });
};

/**
 * Requests specific evidence and moves the case.
 *
 * The request row and the state transition are written together: a case in
 * REQUESTING_EVIDENCE without an open request would be a case nobody can act on.
 */
export const requestEvidence = async (
  deps: WorkflowDeps,
  ctx: RequestContext,
  input: { caseId: CaseId; expectedVersion: number; detail: string; expiryDays: number },
): Promise<WorkflowResult> => {
  if (!hasAtLeast(ctx, 'OPERATOR')) return { kind: 'FORBIDDEN' };

  const transitioned = await applyHumanTransition(deps, ctx, {
    caseId: input.caseId,
    to: 'REQUESTING_EVIDENCE',
    expectedVersion: input.expectedVersion,
    eventType: 'evidence_requested',
    payload: { detail: input.detail },
  });
  if (transitioned.kind !== 'OK') return transitioned;

  const expiresAt = new Date(deps.clock.now().getTime() + input.expiryDays * 86_400_000);
  await deps.evidence.open(scopeOf(ctx), {
    id: deps.ids.next(),
    caseId: input.caseId,
    requestedBy: ctx.userId,
    detail: input.detail,
    expiresAt,
  });

  return transitioned;
};

/** REJECTED / REQUESTING_EVIDENCE / REOPENED -> INVESTIGATING, human-initiated. */
export const reopenForInvestigation = async (
  deps: WorkflowDeps,
  ctx: RequestContext,
  input: { caseId: CaseId; expectedVersion: number },
): Promise<WorkflowResult> => {
  if (!hasAtLeast(ctx, 'OPERATOR')) return { kind: 'FORBIDDEN' };
  return applyHumanTransition(deps, ctx, {
    caseId: input.caseId,
    to: 'INVESTIGATING',
    expectedVersion: input.expectedVersion,
    eventType: 'investigation_started',
    payload: {},
  });
};
