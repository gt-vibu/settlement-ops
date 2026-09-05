/**
 * AI investigation dispatch.
 *
 * Runs the bounded agent against a case, puts the proposal through the terminal verifier,
 * and transitions the case to whatever the VERIFIER allowed - never to what the model
 * claimed.
 *
 * The kill switch is checked by the caller (`startInvestigation`); if it is off this file
 * is never reached and the case escalates with `MODEL_DISABLED`. Nothing here can invent a
 * proposal when the model is unavailable: every failure path lands on ESCALATED.
 */

import type { CaseId, Clock, IdGenerator } from '@settlementops/shared';
import {
  scopeOf,
  type AuditWriter,
  type CaseTransitionRepository,
  type CaseTransitionResult,
  type InvestigationRepository,
  type RequestContext,
  type TransitionFailure,
} from '@settlementops/application';
import { POLICY_VERSION, reconcileUnit, type ReconciliationUnit } from '@settlementops/domain';
import {
  caseBriefing,
  runInvestigation,
  runInvestigationV2,
  type AgentBudget,
  type ModelGateway,
} from '@settlementops/agent';
import type { ToolContext, ToolRegistry } from '@settlementops/tools';
import { verify, type Proposal } from '@settlementops/verification';

export interface AiInvestigationDeps {
  readonly investigations: InvestigationRepository;
  readonly transitions: CaseTransitionRepository;
  readonly audit: AuditWriter;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly gateway: ModelGateway;
  readonly registry: ToolRegistry;
  readonly budget: AgentBudget;
}

export interface AiInvestigationInput {
  readonly caseId: CaseId;
  readonly investigationId: string;
  readonly paymentId: string;
  readonly unit: ReconciliationUnit;
  readonly expectedVersion: number;
}

export type AiInvestigationResult =
  | { readonly kind: 'PROPOSED'; readonly cause: string; readonly disposition: string }
  | { readonly kind: 'ESCALATED'; readonly reason: string }
  | { readonly kind: 'FAILED'; readonly failure: TransitionFailure };

const isFailure = (value: CaseTransitionResult | TransitionFailure): value is TransitionFailure =>
  'kind' in value;

export const runAiInvestigation = async (
  deps: AiInvestigationDeps,
  ctx: RequestContext,
  input: AiInvestigationInput,
): Promise<AiInvestigationResult> => {
  const scope = scopeOf(ctx);
  const verdict = reconcileUnit(input.unit);
  const toolCtx: ToolContext = { scope, paymentId: input.paymentId };

  const briefing = caseBriefing({
    reasons: verdict.reasons,
    discrepancyMinor: verdict.discrepancy.amountMinor.toString(),
    currency: input.unit.payment.amount.currency,
    paymentMethod: input.unit.payment.paymentMethod,
    capturedAt: input.unit.payment.capturedAt?.toISOString() ?? null,
    // Operator-entered free text, shown to the model inside an untrusted fence.
    untrustedText: input.unit.adjustments.map((a) => a.reference).slice(0, 5),
  });

  const runLoop =
    process.env['AGENT_LOOP_VARIANT'] === 'v2' ? runInvestigationV2 : runInvestigation;
  const investigation = await runLoop({
    gateway: deps.gateway,
    registry: deps.registry,
    ctx: toolCtx,
    briefing,
    budget: deps.budget,
  });

  // Every tool call is auditable, not just the conclusion.
  for (const entry of investigation.trace) {
    await deps.audit.append(scope, {
      id: deps.ids.next(),
      entityType: 'reconciliation_case',
      entityId: input.caseId,
      eventType: entry.action === 'TOOL_CALL' ? 'agent_tool_called' : 'agent_step',
      actorType: 'SYSTEM',
      actorId: null,
      correlationId: ctx.correlationId,
      previousState: null,
      nextState: null,
      caseVersion: null,
      payload: { step: entry.step, tool: entry.tool ?? null, summary: entry.summary },
    });
  }

  const escalateWith = async (
    reason: string,
    failureCode: string,
  ): Promise<AiInvestigationResult> => {
    await deps.investigations.finish(scope, input.investigationId, {
      status: 'FAILED',
      failureCode,
    });
    const escalated = await deps.transitions.transition(scope, {
      caseId: input.caseId,
      to: 'ESCALATED',
      actor: 'SYSTEM',
      expectedVersion: input.expectedVersion,
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
      payload: { reason, failure_code: failureCode, policy_version: POLICY_VERSION },
    });
    return { kind: 'ESCALATED', reason };
  };

  if (investigation.proposedCause === null) {
    return escalateWith(investigation.rationale, investigation.stopReason);
  }

  const proposal: Proposal = {
    cause: investigation.proposedCause,
    disposition: investigation.proposedDisposition,
    evidenceRecordIds: investigation.evidenceRecordIds,
    rationale: investigation.rationale,
    retrievedRecordIds: investigation.evidenceRecordIds,
  };
  // TERMINAL. The result is recorded and acted on; it is never returned to the model.
  const verification = verify(proposal, input.unit);

  await deps.audit.append(scope, {
    id: deps.ids.next(),
    entityType: 'reconciliation_case',
    entityId: input.caseId,
    eventType: 'verifier_completed',
    actorType: 'SYSTEM',
    actorId: null,
    correlationId: ctx.correlationId,
    previousState: null,
    nextState: null,
    caseVersion: null,
    payload: {
      proposed_cause: proposal.cause,
      proposed_disposition: proposal.disposition,
      effective_disposition: verification.effectiveDisposition,
      passed: verification.passed,
      failures: verification.failures,
      detail: verification.detail,
    },
  });

  if (verification.effectiveDisposition !== 'RESOLVE') {
    return escalateWith(
      verification.passed
        ? 'the agent did not claim a resolution'
        : `verifier rejected the proposal: ${verification.failures.join(', ')}`,
      verification.passed ? investigation.stopReason : 'VERIFIER_REJECTED',
    );
  }

  await deps.investigations.finish(scope, input.investigationId, {
    status: 'SUCCEEDED',
    failureCode: null,
  });

  // A verified resolution is a PROPOSAL FOR A HUMAN, not an action. The agent never moves
  // money and never closes a case on its own.
  const proposed = await deps.transitions.transition(scope, {
    caseId: input.caseId,
    to: 'ACTION_PROPOSED',
    actor: 'SYSTEM',
    expectedVersion: input.expectedVersion,
  });
  if (isFailure(proposed)) return { kind: 'FAILED', failure: proposed };

  await deps.audit.append(scope, {
    id: deps.ids.next(),
    entityType: 'reconciliation_case',
    entityId: input.caseId,
    eventType: 'action_proposed',
    actorType: 'SYSTEM',
    actorId: null,
    correlationId: ctx.correlationId,
    previousState: proposed.previousState,
    nextState: proposed.nextState,
    caseVersion: proposed.caseVersion,
    payload: {
      cause: proposal.cause,
      disposition: proposal.disposition,
      rationale: proposal.rationale,
      evidence_record_ids: proposal.evidenceRecordIds,
      tool_calls: investigation.toolCallCount,
    },
  });

  return { kind: 'PROPOSED', cause: proposal.cause, disposition: proposal.disposition };
};
