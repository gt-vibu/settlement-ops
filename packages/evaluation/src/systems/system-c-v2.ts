/**
 * System C-v2 - exploratory only.
 *
 * The frozen `runSystemC` is untouched and still produces the official result. This arm
 * exists so an improvement can be measured without any possibility of mutating it, and it
 * may be evaluated ONLY on the validation split.
 *
 * Same tools, same verifier, same budget. The difference is entirely in how the loop tracks
 * evidence sufficiency and how the disposition vocabulary is phrased.
 */

import type { ReconciliationUnit } from '@settlementops/domain';
import { verify, type Proposal } from '@settlementops/verification';
import type { ToolContext, ToolRegistry } from '@settlementops/tools';
import {
  caseBriefing,
  runInvestigationV2,
  type AgentBudget,
  type ModelGateway,
} from '@settlementops/agent';

import type { SystemOutcome } from './outcome.js';

export const runSystemCv2 = async (
  unit: ReconciliationUnit,
  registry: ToolRegistry,
  ctx: ToolContext,
  gateway: ModelGateway,
  budget: AgentBudget,
  deterministicReasons: readonly string[],
  discrepancyMinor: string,
): Promise<SystemOutcome> => {
  const started = Date.now();

  const investigation = await runInvestigationV2({
    gateway,
    registry,
    ctx,
    briefing: caseBriefing({
      reasons: deterministicReasons,
      discrepancyMinor,
      currency: unit.payment.amount.currency,
      paymentMethod: unit.payment.paymentMethod,
      capturedAt: unit.payment.capturedAt?.toISOString() ?? null,
      untrustedText: unit.adjustments.map((a) => a.reference).slice(0, 5),
    }),
    budget,
  });

  const base = {
    system: 'C' as const,
    toolCallCount: investigation.toolCallCount,
    stepCount: investigation.stepCount,
    latencyMs: Date.now() - started,
    stopReason: investigation.stopReason,
    rationale: investigation.rationale,
    evidenceRecordIds: investigation.evidenceRecordIds,
  };

  if (investigation.proposedCause === null) {
    return {
      ...base,
      proposedCause: null,
      proposedDisposition: investigation.proposedDisposition,
      effectiveDisposition: investigation.proposedDisposition,
      verifierPassed: true,
      verifierFailures: [],
    };
  }

  const proposal: Proposal = {
    cause: investigation.proposedCause,
    disposition: investigation.proposedDisposition,
    evidenceRecordIds: investigation.evidenceRecordIds,
    rationale: investigation.rationale,
    retrievedRecordIds: investigation.evidenceRecordIds,
  };
  // The same terminal gate. v2 changed nothing about the financial authority.
  const verification = verify(proposal, unit);

  return {
    ...base,
    proposedCause: investigation.proposedCause,
    proposedDisposition: investigation.proposedDisposition,
    effectiveDisposition: verification.effectiveDisposition,
    verifierPassed: verification.passed,
    verifierFailures: verification.failures,
  };
};
