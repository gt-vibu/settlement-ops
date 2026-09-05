/**
 * Investigation lifecycle - WITHOUT the AI agent.
 *
 * Phase 3 builds the durable lifecycle only: starting an investigation, recording it,
 * transitioning the case, and terminating safely. No model is called, no prompt exists,
 * and no tool is registered. The agent arrives in Phase 7 (`BUILD_PLAN.md`).
 *
 * With AI investigation disabled - which is the default - a started investigation
 * terminates in `MODEL_DISABLED` and the case escalates. That is the behaviour
 * `SAFETY.md` section 7 requires of the kill switch: residuals route to safe
 * deterministic handling, and nothing is fabricated to fill the gap.
 */

import type { CaseId, Clock, IdGenerator } from '@settlementops/shared';
import {
  hasAtLeast,
  scopeOf,
  type AuditWriter,
  type CaseTransitionRepository,
  type CaseTransitionResult,
  type InvestigationRecord,
  type InvestigationRepository,
  type RequestContext,
  type TransitionFailure,
} from '@settlementops/application';
import { POLICY_VERSION } from '@settlementops/domain';

export interface InvestigationDeps {
  readonly investigations: InvestigationRepository;
  readonly transitions: CaseTransitionRepository;
  readonly audit: AuditWriter;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Runtime kill switch. False means no agent may run. */
  readonly aiInvestigationEnabled: boolean;
}

export type StartInvestigationResult =
  | {
      readonly kind: 'STARTED';
      readonly investigation: InvestigationRecord;
      readonly transition: CaseTransitionResult;
    }
  | {
      readonly kind: 'ESCALATED_AI_DISABLED';
      readonly investigation: InvestigationRecord;
      readonly transition: CaseTransitionResult;
    }
  | { readonly kind: 'ALREADY_RUNNING'; readonly investigation: InvestigationRecord }
  | { readonly kind: 'FORBIDDEN' }
  | { readonly kind: 'FAILED'; readonly failure: TransitionFailure };

const isFailure = (value: CaseTransitionResult | TransitionFailure): value is TransitionFailure =>
  'kind' in value;

export const startInvestigation = async (
  deps: InvestigationDeps,
  ctx: RequestContext,
  input: { caseId: CaseId; expectedVersion: number },
): Promise<StartInvestigationResult> => {
  if (!hasAtLeast(ctx, 'OPERATOR')) return { kind: 'FORBIDDEN' };
  const scope = scopeOf(ctx);

  const moved = await deps.transitions.transition(scope, {
    caseId: input.caseId,
    to: 'INVESTIGATING',
    actor: 'OPERATOR',
    expectedVersion: input.expectedVersion,
  });
  if (isFailure(moved)) return { kind: 'FAILED', failure: moved };

  const { investigation, created } = await deps.investigations.start(scope, {
    id: deps.ids.next(),
    caseId: input.caseId,
    caseVersionAtStart: moved.caseVersion,
    policyVersion: POLICY_VERSION,
    correlationId: ctx.correlationId,
  });

  if (!created) return { kind: 'ALREADY_RUNNING', investigation };

  await deps.audit.append(scope, {
    id: deps.ids.next(),
    entityType: 'reconciliation_case',
    entityId: input.caseId,
    eventType: 'investigation_started',
    actorType: 'USER',
    actorId: ctx.userId,
    correlationId: ctx.correlationId,
    previousState: moved.previousState,
    nextState: moved.nextState,
    caseVersion: moved.caseVersion,
    payload: { investigation_id: investigation.id, ai_enabled: deps.aiInvestigationEnabled },
  });

  if (deps.aiInvestigationEnabled) {
    // Phase 7 dispatches the agent here. Until then the run stays RUNNING rather than
    // pretending to have completed.
    return { kind: 'STARTED', investigation, transition: moved };
  }

  // Kill switch off: terminate safely and escalate. No proposal is invented.
  await deps.investigations.finish(scope, investigation.id, {
    status: 'FAILED',
    failureCode: 'MODEL_DISABLED',
  });

  const escalated = await deps.transitions.transition(scope, {
    caseId: input.caseId,
    to: 'ESCALATED',
    actor: 'SYSTEM',
    expectedVersion: moved.caseVersion,
  });
  if (isFailure(escalated)) return { kind: 'FAILED', failure: escalated };

  await deps.audit.append(scope, {
    id: deps.ids.next(),
    entityType: 'reconciliation_case',
    entityId: input.caseId,
    eventType: 'case_escalated',
    actorType: 'SYSTEM',
    actorId: null,
    correlationId: ctx.correlationId,
    previousState: escalated.previousState,
    nextState: escalated.nextState,
    caseVersion: escalated.caseVersion,
    payload: {
      reason: 'AI investigation is disabled; routed to deterministic human handling',
      failure_code: 'MODEL_DISABLED',
    },
  });

  return { kind: 'ESCALATED_AI_DISABLED', investigation, transition: escalated };
};
