/**
 * Exploratory investigation loop, v2.
 *
 * SEPARATE FROM THE FROZEN SYSTEM C BY CONSTRUCTION. `investigation-loop.ts` is untouched
 * and still produces the official benchmark result. This file exists alongside it so that
 * an improvement can be attempted without any possibility of mutating what was measured.
 *
 * It may be evaluated on the validation split only. Numbers from it are exploratory and are
 * never comparable to the frozen run (`EVALUATION.md` §19).
 *
 * WHAT THE DIAGNOSIS SAID. The frozen run produced zero resolutions across 180 cases: the
 * model chose `REQUEST_EVIDENCE` on 107, including 71 that were provably resolvable, while
 * the verifier rejected almost nothing. The binding constraint was the model's willingness
 * to commit, not the safety gate. A follow-up on the validation split confirmed this is
 * partly prompt-shaped - but also that the model then over-claims `ROUNDING_DRIFT`, which
 * the verifier caught 18 times.
 *
 * SO v2 CHANGES THREE THINGS, none of them a safety control:
 *
 *  1. **Evidence sufficiency is tracked explicitly.** The loop knows which tools have
 *     returned, so it can tell the model what it still has not looked at rather than
 *     leaving it to infer that from a transcript.
 *  2. **Repeated retrieval is answered, not punished.** Asking again for something already
 *     retrieved returns the cached observation with a note, instead of consuming budget and
 *     tripping loop detection. 29 of 180 frozen cases died this way.
 *  3. **The disposition vocabulary is sharpened.** `RESOLVE_SUPPORTED` forces the model to
 *     say that evidence supports the claim, rather than treating `RESOLVE` as a default.
 *
 * The verifier is unchanged and remains the financial authority. Nothing here can resolve a
 * case; it can only produce a proposal for the same terminal gate.
 */

import { isCauseCode, type CauseCode, type Disposition } from '@settlementops/domain';
import {
  isToolName,
  type ToolContext,
  type ToolRegistry,
  type ToolName,
} from '@settlementops/tools';

import type { ModelGateway } from './model-gateway.js';
import { PROPOSAL_SCHEMA_V2, SYSTEM_PROMPT_V2, type ProposalDecisionV2 } from './prompts-v2.js';
import { STEP_SCHEMA, type StepDecision } from './prompts.js';
import type {
  AgentBudget,
  AgentTrace,
  InvestigationResult,
  StopReason,
} from './investigation-loop.js';

/** Opening evidence, same as the frozen loop: an investigation must read the case. */
const OPENERS: readonly ToolName[] = ['get_settlement_breakup', 'calculate_expected_net_amount'];

/** Everything else the model may reach for, listed so it can be told what it has not seen. */
const REMAINING: readonly ToolName[] = [
  'get_fee_tax_lines',
  'get_bank_credit',
  'get_refunds',
  'search_related_adjustments',
  'get_fee_schedule',
  'validate_tax_line_mapping',
];

export const runInvestigationV2 = async (params: {
  readonly gateway: ModelGateway;
  readonly registry: ToolRegistry;
  readonly ctx: ToolContext;
  readonly briefing: string;
  readonly budget: AgentBudget;
}): Promise<InvestigationResult> => {
  const { gateway, registry, ctx, briefing, budget } = params;
  const startedAt = Date.now();

  const evidence = new Set<string>();
  const trace: AgentTrace[] = [];
  /** tool -> the observation it produced. Also the cache that makes a repeat free. */
  const observed = new Map<ToolName, string>();
  let toolCalls = 0;
  let steps = 0;

  const escalate = (stopReason: StopReason, rationale: string): InvestigationResult => ({
    proposedCause: null,
    proposedDisposition: 'ESCALATE',
    rationale,
    evidenceRecordIds: [...evidence],
    toolCallCount: toolCalls,
    stepCount: steps,
    stopReason,
    trace,
    injectionDetected: false,
  });

  const invoke = async (name: ToolName): Promise<void> => {
    const result = await registry.invoke(ctx, name, {});
    toolCalls += 1;
    for (const id of result.recordIds) evidence.add(id);
    observed.set(name, result.summary);
    trace.push({ step: steps, action: 'TOOL_CALL', tool: name, summary: result.summary });
  };

  for (const opener of OPENERS) await invoke(opener);

  while (steps < budget.maxSteps && toolCalls < budget.maxToolCalls) {
    if ((Date.now() - startedAt) / 1_000 > budget.maxWallclockSeconds) {
      return escalate('WALLCLOCK_EXCEEDED', 'investigation exceeded its time budget');
    }
    steps += 1;

    const gathered = [...observed.entries()].map(([tool, summary]) => `${tool}: ${summary}`);
    const notYet = REMAINING.filter((tool) => !observed.has(tool));

    const step = await gateway.chat<StepDecision>(
      [
        { role: 'system', content: SYSTEM_PROMPT_V2 },
        {
          role: 'user',
          content:
            `${briefing}\n\nEvidence gathered:\n${gathered.join('\n')}\n\n` +
            `Not yet retrieved: ${notYet.length === 0 ? 'nothing - you have everything' : notYet.join(', ')}\n` +
            `Tool calls used ${toolCalls}/${budget.maxToolCalls}.\n` +
            'Call another tool, or CONCLUDE if the evidence already settles the case.',
        },
      ],
      STEP_SCHEMA,
    );

    if (!step.ok) return escalate(step.failure as StopReason, `model failure: ${step.detail}`);
    if (step.value.action === 'CONCLUDE') break;

    const tool = step.value.tool;
    if (tool === undefined || !isToolName(tool)) {
      trace.push({ step: steps, action: 'REJECTED_TOOL', summary: String(tool) });
      continue;
    }

    // A repeat is answered from cache. It costs a step, not the budget, and it does not
    // end the investigation: 29 of 180 frozen cases died on exactly this, which measured
    // the model's short memory rather than its reasoning.
    if (observed.has(tool)) {
      trace.push({
        step: steps,
        action: 'REPEAT_SERVED_FROM_CACHE',
        tool,
        summary: observed.get(tool) ?? '',
      });
      continue;
    }

    await invoke(tool);
  }

  if (toolCalls === 0) return escalate('NO_PROGRESS', 'no evidence was gathered');

  const gathered = [...observed.entries()].map(([tool, summary]) => `${tool}: ${summary}`);
  const proposal = await gateway.chat<ProposalDecisionV2>(
    [
      { role: 'system', content: SYSTEM_PROMPT_V2 },
      {
        role: 'user',
        content:
          `${briefing}\n\nEvidence gathered:\n${gathered.join('\n')}\n\n` +
          'State your conclusion. Choose RESOLVE_SUPPORTED only if the evidence above ' +
          'proves the cause you name.',
      },
    ],
    PROPOSAL_SCHEMA_V2,
  );

  if (!proposal.ok) {
    return escalate(proposal.failure as StopReason, `model failure: ${proposal.detail}`);
  }

  const { cause, conclusion } = proposal.value;
  if (!isCauseCode(cause)) {
    return escalate('MODEL_SCHEMA_VIOLATION', 'proposal used a cause outside the closed set');
  }

  /**
   * v2's vocabulary maps onto the closed disposition set. `RESOLVE_SUPPORTED` is a CLAIM
   * that evidence supports the cause; the verifier still decides whether it does.
   */
  const disposition: Disposition =
    conclusion === 'RESOLVE_SUPPORTED'
      ? 'RESOLVE'
      : conclusion === 'REQUEST_EVIDENCE'
        ? 'REQUEST_EVIDENCE'
        : 'ESCALATE';

  trace.push({ step: steps + 1, action: 'PROPOSAL', summary: `${cause} / ${conclusion}` });

  return {
    proposedCause: cause as CauseCode,
    proposedDisposition: disposition,
    rationale: proposal.value.reasoning.slice(0, 400),
    evidenceRecordIds: [...evidence],
    toolCallCount: toolCalls,
    stepCount: steps,
    stopReason: 'PROPOSAL_MADE',
    trace,
    injectionDetected: proposal.value.injection_detected === true,
  };
};
