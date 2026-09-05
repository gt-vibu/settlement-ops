/**
 * Agent dispatch at the API edge.
 *
 * Composes the pieces the investigation needs - the tool registry over the reconciliation
 * unit, the pinned model gateway, the frozen budget - and hands them to the workflow. The
 * edge does no reasoning of its own: no AI logic lives in a route handler.
 *
 * If the model is unreachable this returns an escalation, never an error the caller has to
 * interpret and never a fabricated proposal.
 */

import { asId, type CaseId, type PaymentId } from '@settlementops/shared';
import type { RequestContext } from '@settlementops/application';
import { scopeOf } from '@settlementops/application';
import { createDatabase, loadUnit, type DatabaseHandle } from '@settlementops/persistence';
import { createToolRegistry } from '@settlementops/tools';
import { createOllamaGateway } from '@settlementops/agent';
import { AGENT_BUDGET, OLLAMA_DEFAULT_HOST, PINNED_MODEL } from '@settlementops/evaluation';
import { runAiInvestigation, type AiInvestigationDeps } from '@settlementops/workflow';

export interface DispatchDeps {
  readonly db: DatabaseHandle;
  readonly workflow: Omit<AiInvestigationDeps, 'gateway' | 'registry' | 'budget'>;
}

export const dispatchAgent = async (
  deps: DispatchDeps,
  ctx: RequestContext,
  input: { caseId: string; investigationId: string; paymentId: string; expectedVersion: number },
): Promise<{ kind: string; detail: string }> => {
  const scope = scopeOf(ctx);
  const unit = await loadUnit(deps.db, scope, asId<PaymentId>(input.paymentId));
  if (unit === null) return { kind: 'ESCALATED', detail: 'the case has no loadable payment unit' };

  const registry = createToolRegistry(async (toolCtx) =>
    loadUnit(deps.db, toolCtx.scope, asId<PaymentId>(toolCtx.paymentId)),
  );
  const gateway = createOllamaGateway({
    host: process.env['OLLAMA_HOST'] ?? OLLAMA_DEFAULT_HOST,
    identity: PINNED_MODEL,
    temperature: AGENT_BUDGET.temperature,
    timeoutSeconds: AGENT_BUDGET.requestTimeoutSeconds,
    maxOutputTokens: 512,
  });

  const result = await runAiInvestigation(
    { ...deps.workflow, gateway, registry, budget: AGENT_BUDGET },
    ctx,
    {
      caseId: asId<CaseId>(input.caseId),
      investigationId: input.investigationId,
      paymentId: input.paymentId,
      unit,
      expectedVersion: input.expectedVersion,
    },
  );

  return {
    kind: result.kind,
    detail:
      result.kind === 'PROPOSED'
        ? `${result.cause} / ${result.disposition}`
        : result.kind === 'ESCALATED'
          ? result.reason
          : 'transition failed',
  };
};

/** Convenience for scripts that need a handle without the whole API. */
export const openDatabaseFor = (url: string): DatabaseHandle => createDatabase(url);
