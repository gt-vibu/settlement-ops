/**
 * The bounded investigation loop.
 *
 * The agent decides WHAT TO LOOK AT. It does not compute money, it does not write, it does
 * not decide the outcome - the verifier does that, once, terminally, and its result never
 * comes back here.
 *
 * Every exit is explicit and safe:
 *   budget exhausted        -> ESCALATE
 *   no progress             -> ESCALATE
 *   repeated identical call -> ESCALATE
 *   model unavailable       -> ESCALATE with the failure recorded
 *   schema violation        -> ESCALATE
 *   contradiction           -> ESCALATE
 * There is no path where a failure produces a resolution.
 */

import {
  isCauseCode,
  isDisposition,
  type CauseCode,
  type Disposition,
} from '@settlementops/domain';
import { isToolName, type ToolContext, type ToolRegistry } from '@settlementops/tools';

import type { ModelGateway } from './model-gateway.js';
import {
  PROPOSAL_SCHEMA,
  STEP_SCHEMA,
  SYSTEM_PROMPT,
  type ProposalDecision,
  type StepDecision,
} from './prompts.js';

export interface AgentBudget {
  readonly maxToolCalls: number;
  readonly maxSteps: number;
  readonly maxWallclockSeconds: number;
  readonly identicalToolCallLimit: number;
}

export interface AgentTrace {
  readonly step: number;
  readonly action: string;
  readonly tool?: string;
  readonly summary: string;
}

export type StopReason =
  | 'PROPOSAL_MADE'
  | 'BUDGET_EXHAUSTED'
  | 'NO_PROGRESS'
  | 'REPEATED_TOOL_CALL'
  | 'WALLCLOCK_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_TIMEOUT'
  | 'MODEL_ERROR'
  | 'MODEL_SCHEMA_VIOLATION'
  | 'INJECTION_DETECTED';

export interface InvestigationResult {
  readonly proposedCause: CauseCode | null;
  readonly proposedDisposition: Disposition;
  readonly rationale: string;
  readonly evidenceRecordIds: readonly string[];
  readonly toolCallCount: number;
  readonly stepCount: number;
  readonly stopReason: StopReason;
  readonly trace: readonly AgentTrace[];
  readonly injectionDetected: boolean;
}

const escalate = (
  stopReason: StopReason,
  rationale: string,
  state: { toolCalls: number; steps: number; evidence: Set<string>; trace: AgentTrace[] },
  injectionDetected = false,
): InvestigationResult => ({
  proposedCause: null,
  proposedDisposition: 'ESCALATE',
  rationale,
  evidenceRecordIds: [...state.evidence],
  toolCallCount: state.toolCalls,
  stepCount: state.steps,
  stopReason,
  trace: state.trace,
  injectionDetected,
});

export const runInvestigation = async (params: {
  readonly gateway: ModelGateway;
  readonly registry: ToolRegistry;
  readonly ctx: ToolContext;
  readonly briefing: string;
  readonly budget: AgentBudget;
}): Promise<InvestigationResult> => {
  const { gateway, registry, ctx, briefing, budget } = params;
  const startedAt = Date.now();
  const state = {
    toolCalls: 0,
    steps: 0,
    evidence: new Set<string>(),
    trace: [] as AgentTrace[],
  };
  const seenCalls = new Map<string, number>();
  const observations: string[] = [];

  /**
   * Two mandatory opening calls.
   *
   * An investigation that concludes before looking at the settlement or the arithmetic is
   * not an investigation. The agent still CHOOSES every subsequent step - which is the
   * capability under test - but it may not skip reading the case. System B, by contrast,
   * runs all eight calls in a fixed order every time and never chooses at all.
   */
  for (const opener of ['get_settlement_breakup', 'calculate_expected_net_amount'] as const) {
    const result = await registry.invoke(ctx, opener, {});
    state.toolCalls += 1;
    seenCalls.set(opener, 1);
    for (const id of result.recordIds) state.evidence.add(id);
    observations.push(`${opener}: ${result.summary}`);
    state.trace.push({ step: 0, action: 'TOOL_CALL', tool: opener, summary: result.summary });
  }

  while (state.steps < budget.maxSteps) {
    if ((Date.now() - startedAt) / 1_000 > budget.maxWallclockSeconds) {
      return escalate('WALLCLOCK_EXCEEDED', 'investigation exceeded its time budget', state);
    }
    state.steps += 1;

    const transcript =
      observations.length === 0 ? 'No evidence gathered yet.' : observations.join('\n');
    const step = await gateway.chat<StepDecision>(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${briefing}\n\nEvidence so far:\n${transcript}\n\nTool calls used: ${state.toolCalls}/${budget.maxToolCalls}.\nDecide the next action.`,
        },
      ],
      STEP_SCHEMA,
    );

    if (!step.ok) {
      return escalate(step.failure as StopReason, `model failure: ${step.detail}`, state);
    }

    if (step.value.action === 'CONCLUDE' || state.toolCalls >= budget.maxToolCalls) {
      break;
    }

    const toolName = step.value.tool;
    if (toolName === undefined || !isToolName(toolName)) {
      // A tool the allowlist does not contain is not an error to negotiate over.
      observations.push(`Requested tool is not available. Choose from the allowed list.`);
      state.trace.push({ step: state.steps, action: 'REJECTED_TOOL', summary: String(toolName) });
      continue;
    }

    const callKey = toolName;
    const seen = seenCalls.get(callKey) ?? 0;
    if (seen > budget.identicalToolCallLimit) {
      return escalate('REPEATED_TOOL_CALL', `repeated ${toolName} without new information`, state);
    }
    seenCalls.set(callKey, seen + 1);

    const result = await registry.invoke(ctx, toolName, {});
    state.toolCalls += 1;
    for (const id of result.recordIds) state.evidence.add(id);
    observations.push(`${toolName}: ${result.summary}`);
    state.trace.push({
      step: state.steps,
      action: 'TOOL_CALL',
      tool: toolName,
      summary: result.summary,
    });
  }

  if (state.toolCalls === 0) {
    return escalate('NO_PROGRESS', 'no evidence was gathered', state);
  }

  const proposal = await gateway.chat<ProposalDecision>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${briefing}\n\nEvidence gathered:\n${observations.join('\n')}\n\nPropose a cause and a disposition. Resolve ONLY if the evidence above proves it.`,
      },
    ],
    PROPOSAL_SCHEMA,
  );

  if (!proposal.ok) {
    return escalate(proposal.failure as StopReason, `model failure: ${proposal.detail}`, state);
  }

  const { cause, disposition, injection_detected: injectionDetected } = proposal.value;
  if (!isCauseCode(cause) || !isDisposition(disposition)) {
    return escalate(
      'MODEL_SCHEMA_VIOLATION',
      'proposal used a value outside the closed set',
      state,
    );
  }

  state.trace.push({
    step: state.steps + 1,
    action: 'PROPOSAL',
    summary: `${cause} / ${disposition}`,
  });

  return {
    proposedCause: cause,
    proposedDisposition: disposition,
    rationale: proposal.value.reasoning.slice(0, 400),
    evidenceRecordIds: [...state.evidence],
    toolCallCount: state.toolCalls,
    stepCount: state.steps,
    stopReason: 'PROPOSAL_MADE',
    trace: state.trace,
    injectionDetected: injectionDetected === true,
  };
};
