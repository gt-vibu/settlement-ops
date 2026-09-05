/**
 * The ReconciliationCase aggregate (specs/DATA_MODEL.md section 3).
 *
 * Optimistic versioning lives here. Every mutable transition increments caseVersion,
 * which is the mechanism that makes a stale approval fail with CONFLICT rather than
 * silently overwrite a newer investigation (specs/SECURITY.md threat T4).
 */

import { type Result, ok, err, type CaseId } from '@settlementops/shared';
import type { Money } from '../money/money.js';
import type { MerchantScope } from '../lineage/merchant-scope.js';
import type { CaseState, TransitionActor } from './case-state.js';
import { canTransition, isActorPermitted, requiresOutcomeRecord } from './case-transitions.js';

export interface ReconciliationCase {
  readonly id: CaseId;
  readonly scope: MerchantScope;
  readonly caseNumber: string;
  readonly state: CaseState;
  readonly priority: number;
  readonly discrepancy: Money;
  readonly deterministicReason: string;
  readonly caseVersion: number;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
}

export type TransitionError =
  | { readonly kind: 'ILLEGAL_TRANSITION'; readonly from: CaseState; readonly to: CaseState }
  | {
      readonly kind: 'ACTOR_NOT_PERMITTED';
      readonly from: CaseState;
      readonly to: CaseState;
      readonly actor: TransitionActor;
    }
  | { readonly kind: 'OUTCOME_REQUIRED'; readonly from: CaseState; readonly to: CaseState }
  | {
      readonly kind: 'VERSION_CONFLICT';
      readonly expected: number;
      readonly actual: number;
    };

export interface TransitionRequest {
  readonly to: CaseState;
  readonly actor: TransitionActor;
  readonly expectedVersion: number;
  readonly outcomeRecorded?: boolean;
  readonly at: Date;
}

/**
 * Applies a transition. Every guard the state machine specifies is checked here, in
 * this order: version, legality, actor authority, outcome requirement. Returns a new
 * case value; the input is never mutated.
 */
export const applyTransition = (
  current: ReconciliationCase,
  request: TransitionRequest,
): Result<ReconciliationCase, TransitionError> => {
  if (current.caseVersion !== request.expectedVersion) {
    return err({
      kind: 'VERSION_CONFLICT',
      expected: request.expectedVersion,
      actual: current.caseVersion,
    });
  }
  if (!canTransition(current.state, request.to)) {
    return err({ kind: 'ILLEGAL_TRANSITION', from: current.state, to: request.to });
  }
  if (!isActorPermitted(current.state, request.to, request.actor)) {
    return err({
      kind: 'ACTOR_NOT_PERMITTED',
      from: current.state,
      to: request.to,
      actor: request.actor,
    });
  }
  if (requiresOutcomeRecord(current.state, request.to) && request.outcomeRecorded !== true) {
    return err({ kind: 'OUTCOME_REQUIRED', from: current.state, to: request.to });
  }

  return ok({
    ...current,
    state: request.to,
    caseVersion: current.caseVersion + 1,
    closedAt: request.to === 'CLOSED' ? request.at : current.closedAt,
  });
};

/** Late evidence invalidated the proposal: version bumps so in-flight approvals fail. */
export const invalidateProposal = (
  current: ReconciliationCase,
  at: Date,
): Result<ReconciliationCase, TransitionError> =>
  applyTransition(current, {
    to: 'INVESTIGATING',
    actor: 'SYSTEM',
    expectedVersion: current.caseVersion,
    at,
  });
