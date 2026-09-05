/**
 * System C - the bounded investigation agent.
 *
 * Identical evidence, identical arithmetic, identical terminal verifier as System B. The
 * only difference is that the sequence of evidence gathering is CHOSEN rather than fixed,
 * and the explanation is composed rather than looked up.
 *
 * If that difference does not show up on unseen combinations, the AI has not earned its
 * place and the experiment says so.
 */

import type { ReconciliationUnit } from '@settlementops/domain';
import { verify, type Proposal } from '@settlementops/verification';
import type { ToolContext, ToolRegistry } from '@settlementops/tools';
import {
  caseBriefing,
  runInvestigation,
  type AgentBudget,
  type ModelGateway,
} from '@settlementops/agent';

import type { SystemOutcome } from './outcome.js';

/**
 * Operator-entered free text carried on this case.
 *
 * Collected so it can be shown to the model INSIDE an untrusted fence. Not filtered or
 * sanitised: the point is that the model sees exactly what a real system would see and
 * still refuses to obey it.
 */
const untrustedTextOf = (unit: ReconciliationUnit): string[] =>
  unit.adjustments
    .map((a) => a.reference)
    .filter((reference) => reference.trim().length > 0)
    .slice(0, 5);

export const runSystemC = async (
  unit: ReconciliationUnit,
  registry: ToolRegistry,
  ctx: ToolContext,
  gateway: ModelGateway,
  budget: AgentBudget,
  deterministicReasons: readonly string[],
  discrepancyMinor: string,
): Promise<SystemOutcome> => {
  const started = Date.now();

  const briefing = caseBriefing({
    reasons: deterministicReasons,
    discrepancyMinor,
    currency: unit.payment.amount.currency,
    paymentMethod: unit.payment.paymentMethod,
    capturedAt: unit.payment.capturedAt?.toISOString() ?? null,
    untrustedText: untrustedTextOf(unit),
  });

  const investigation = await runInvestigation({ gateway, registry, ctx, briefing, budget });

  if (investigation.proposedCause === null) {
    return {
      system: 'C',
      proposedCause: null,
      proposedDisposition: investigation.proposedDisposition,
      effectiveDisposition: investigation.proposedDisposition,
      verifierPassed: true,
      verifierFailures: [],
      toolCallCount: investigation.toolCallCount,
      stepCount: investigation.stepCount,
      latencyMs: Date.now() - started,
      stopReason: investigation.stopReason,
      rationale: investigation.rationale,
      evidenceRecordIds: investigation.evidenceRecordIds,
    };
  }

  const proposal: Proposal = {
    cause: investigation.proposedCause,
    disposition: investigation.proposedDisposition,
    evidenceRecordIds: investigation.evidenceRecordIds,
    rationale: investigation.rationale,
  };
  // Terminal, single pass. The result is never shown back to the model.
  const verification = verify(proposal, unit);

  return {
    system: 'C',
    proposedCause: investigation.proposedCause,
    proposedDisposition: investigation.proposedDisposition,
    effectiveDisposition: verification.effectiveDisposition,
    verifierPassed: verification.passed,
    verifierFailures: verification.failures,
    toolCallCount: investigation.toolCallCount,
    stepCount: investigation.stepCount,
    latencyMs: Date.now() - started,
    stopReason: investigation.stopReason,
    rationale: investigation.rationale,
    evidenceRecordIds: investigation.evidenceRecordIds,
  };
};
