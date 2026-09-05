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
import {
  createOllamaGateway,
  loadAgentBudget,
  loadModelConfig,
  type AgentBudgetConfig,
  type ModelRuntimeConfig,
} from '@settlementops/agent';
import { runAiInvestigation, type AiInvestigationDeps } from '@settlementops/workflow';

export interface DispatchDeps {
  readonly db: DatabaseHandle;
  readonly workflow: Omit<AiInvestigationDeps, 'gateway' | 'registry' | 'budget'>;
  readonly model: ModelRuntimeConfig;
  readonly budget: AgentBudgetConfig;
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
    host: deps.model.host,
    identity: { provider: 'ollama', model: deps.model.model, digest: deps.model.digest },
    temperature: deps.model.temperature,
    timeoutSeconds: deps.model.requestTimeoutSeconds,
    maxOutputTokens: deps.model.maxOutputTokens,
  });

  const result = await runAiInvestigation(
    { ...deps.workflow, gateway, registry, budget: deps.budget },
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

export { loadAgentBudget, loadModelConfig };
