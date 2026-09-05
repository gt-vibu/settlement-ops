/**
 * Scenario and case-workflow routes (`API_SPEC.md` sections 5 and 7).
 *
 * Scenario routes are registered ONLY when the demo flag is on. In production they are
 * absent from the route table entirely rather than merely guarded, so there is no
 * enabled-but-forbidden path to probe (`DEPLOYMENT.md`, `AUTHORIZATION_MODEL.md` §8).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { asId, cryptoIdGenerator, systemClock, type CaseId } from '@settlementops/shared';
import {
  escalateCase,
  hasAtLeast,
  reopenForInvestigation,
  requestEvidence,
  scopeOf,
  type AuditWriter,
  type CaseRepository,
  type CaseTransitionRepository,
  type EvidenceRequestRepository,
  type ImportRepository,
  type InvestigationRepository,
  type RecordRepository,
  type ReconciliationRunRepository,
  type RequestContext,
  type ScenarioRepository,
  type WorkflowResult,
} from '@settlementops/application';
import { EVIDENCE_REQUEST_EXPIRY_DAYS } from '@settlementops/domain';
import { catalog, instantiateScenario } from '@settlementops/scenario';
import { startInvestigation } from '@settlementops/workflow';
import { envelope, failureReply, SAFE_MESSAGES } from './errors.js';

export interface WorkflowDepsBundle {
  /**
   * Runs the bounded agent once an investigation has started.
   *
   * Injected rather than imported so this route file has no AI logic in it and no
   * dependency on the model layer: the edge starts the investigation, something else does
   * the investigating.
   */
  readonly dispatchAgent:
    | ((
        ctx: RequestContext,
        input: {
          caseId: string;
          investigationId: string;
          paymentId: string;
          expectedVersion: number;
        },
      ) => Promise<{ kind: string; detail: string }>)
    | null;
  readonly scenarios: ScenarioRepository;
  readonly imports: ImportRepository;
  readonly records: RecordRepository;
  readonly runs: ReconciliationRunRepository;
  readonly cases: CaseRepository;
  readonly transitions: CaseTransitionRepository;
  readonly investigations: InvestigationRepository;
  readonly evidence: EvidenceRequestRepository;
  readonly audit: AuditWriter;
  readonly demoScenariosEnabled: boolean;
  readonly aiInvestigationEnabled: boolean;
}

const contextOf = (request: FastifyRequest, reply: FastifyReply): RequestContext | null => {
  const ctx = request.authContext;
  if (ctx === undefined) {
    void reply
      .code(401)
      .send(envelope('UNAUTHENTICATED', SAFE_MESSAGES.UNAUTHENTICATED, request.id));
    return null;
  }
  return ctx;
};

const workflowReply = (
  reply: FastifyReply,
  requestId: string,
  outcome: WorkflowResult,
): FastifyReply => {
  if (outcome.kind === 'FORBIDDEN') {
    return reply.code(403).send(envelope('FORBIDDEN', SAFE_MESSAGES.FORBIDDEN, requestId));
  }
  if (outcome.kind === 'FAILED') return failureReply(reply, requestId, outcome.failure);
  return reply.code(200).send({
    case_id: outcome.result.caseId,
    previous_state: outcome.result.previousState,
    state: outcome.result.nextState,
    case_version: outcome.result.caseVersion,
  });
};

export const registerWorkflowRoutes = (app: FastifyInstance, deps: WorkflowDepsBundle): void => {
  const ids = cryptoIdGenerator();
  const clock = systemClock();
  const workflow = {
    transitions: deps.transitions,
    evidence: deps.evidence,
    audit: deps.audit,
    ids,
    clock,
  };

  app.post<{ Params: { id: string }; Body: { case_version?: number } }>(
    '/v1/cases/:id/investigations',
    async (request, reply) => {
      const ctx = contextOf(request, reply);
      if (ctx === null) return reply;

      const outcome = await startInvestigation(
        {
          investigations: deps.investigations,
          transitions: deps.transitions,
          audit: deps.audit,
          ids,
          clock,
          aiInvestigationEnabled: deps.aiInvestigationEnabled,
        },
        ctx,
        {
          caseId: asId<CaseId>(request.params.id),
          expectedVersion: request.body?.case_version ?? 1,
        },
      );

      if (outcome.kind === 'FORBIDDEN') {
        return reply.code(403).send(envelope('FORBIDDEN', SAFE_MESSAGES.FORBIDDEN, request.id));
      }
      if (outcome.kind === 'FAILED') return failureReply(reply, request.id, outcome.failure);
      if (outcome.kind === 'ALREADY_RUNNING') {
        return reply.code(200).send({
          investigation_id: outcome.investigation.id,
          status: outcome.investigation.status,
          already_running: true,
        });
      }
      // The agent runs only when the kill switch is on AND a dispatcher is wired. Its
      // result is reported plainly, including when it escalated.
      let agentOutcome: { kind: string; detail: string } | null = null;
      if (outcome.kind === 'STARTED' && deps.dispatchAgent !== null) {
        const paymentId = await deps.cases.paymentIdFor(
          scopeOf(ctx),
          asId<CaseId>(request.params.id),
        );
        if (paymentId !== null) {
          agentOutcome = await deps.dispatchAgent(ctx, {
            caseId: request.params.id,
            investigationId: outcome.investigation.id,
            paymentId,
            expectedVersion: outcome.transition.caseVersion,
          });
        }
      }

      return reply.code(201).send({
        investigation_id: outcome.investigation.id,
        status: outcome.investigation.status,
        state: outcome.transition.nextState,
        case_version: outcome.transition.caseVersion,
        agent: agentOutcome,
        // Surfaced plainly: with the kill switch off the case escalates rather than
        // receiving a fabricated proposal.
        ai_enabled: deps.aiInvestigationEnabled,
      });
    },
  );

  app.get<{ Params: { id: string } }>('/v1/cases/:id/investigations', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    const runs = await deps.investigations.listForCase(
      scopeOf(ctx),
      asId<CaseId>(request.params.id),
    );
    return reply.send({
      items: runs.map((r) => ({
        id: r.id,
        status: r.status,
        failure_code: r.failureCode,
        case_version_at_start: r.caseVersionAtStart,
        tool_call_count: r.toolCallCount,
        policy_version: r.policyVersion,
        started_at: r.startedAt,
        finished_at: r.finishedAt,
      })),
    });
  });

  app.post<{ Params: { id: string }; Body: { case_version?: number; reason?: string } }>(
    '/v1/cases/:id/escalate',
    async (request, reply) => {
      const ctx = contextOf(request, reply);
      if (ctx === null) return reply;
      const reason = request.body?.reason?.trim();
      if (reason === undefined || reason === '') {
        return reply
          .code(400)
          .send(envelope('VALIDATION_ERROR', 'An escalation reason is required.', request.id));
      }
      const outcome = await escalateCase(workflow, ctx, {
        caseId: asId<CaseId>(request.params.id),
        expectedVersion: request.body?.case_version ?? 1,
        reason,
      });
      return workflowReply(reply, request.id, outcome);
    },
  );

  app.post<{ Params: { id: string }; Body: { case_version?: number; detail?: string } }>(
    '/v1/cases/:id/request-evidence',
    async (request, reply) => {
      const ctx = contextOf(request, reply);
      if (ctx === null) return reply;
      const detail = request.body?.detail?.trim();
      if (detail === undefined || detail === '') {
        return reply
          .code(400)
          .send(
            envelope(
              'VALIDATION_ERROR',
              'A specific missing record or confirmation must be named.',
              request.id,
            ),
          );
      }
      const outcome = await requestEvidence(workflow, ctx, {
        caseId: asId<CaseId>(request.params.id),
        expectedVersion: request.body?.case_version ?? 1,
        detail,
        expiryDays: EVIDENCE_REQUEST_EXPIRY_DAYS,
      });
      return workflowReply(reply, request.id, outcome);
    },
  );

  app.post<{ Params: { id: string }; Body: { case_version?: number } }>(
    '/v1/cases/:id/reinvestigate',
    async (request, reply) => {
      const ctx = contextOf(request, reply);
      if (ctx === null) return reply;
      const outcome = await reopenForInvestigation(workflow, ctx, {
        caseId: asId<CaseId>(request.params.id),
        expectedVersion: request.body?.case_version ?? 1,
      });
      return workflowReply(reply, request.id, outcome);
    },
  );

  // ------------------------------------------------------------- demo scenarios
  if (!deps.demoScenariosEnabled) return;

  app.get('/v1/demo/scenarios', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    // The catalog projection carries no expected cause.
    return reply.send({ items: catalog() });
  });

  app.post<{ Params: { scenarioId: string }; Body: { seed?: number } }>(
    '/v1/demo/scenarios/:scenarioId/instantiate',
    async (request, reply) => {
      const ctx = contextOf(request, reply);
      if (ctx === null) return reply;
      if (!hasAtLeast(ctx, 'ADMIN')) {
        return reply.code(403).send(envelope('FORBIDDEN', SAFE_MESSAGES.FORBIDDEN, request.id));
      }

      const header = request.headers['idempotency-key'];
      const idempotencyKey = Array.isArray(header) ? header[0] : header;
      if (idempotencyKey === undefined || idempotencyKey.trim() === '') {
        return reply
          .code(400)
          .send(envelope('VALIDATION_ERROR', 'An Idempotency-Key header is required.', request.id));
      }

      const outcome = await instantiateScenario(
        {
          scenarios: deps.scenarios,
          imports: deps.imports,
          records: deps.records,
          runs: deps.runs,
          cases: deps.cases,
          audit: deps.audit,
          ids,
          clock,
        },
        ctx,
        {
          scenarioId: request.params.scenarioId,
          seed: request.body?.seed ?? Date.now() % 1_000_000,
          idempotencyKey,
        },
      );

      if (outcome.kind === 'UNKNOWN_SCENARIO') {
        return reply.code(404).send(envelope('NOT_FOUND', SAFE_MESSAGES.NOT_FOUND, request.id));
      }
      if (outcome.kind === 'FAILED') {
        return reply
          .code(500)
          .send(envelope('INTERNAL_ERROR', SAFE_MESSAGES.INTERNAL_ERROR, request.id));
      }

      const { instance } = outcome;
      return reply.code(outcome.replayed ? 200 : 201).send({
        id: instance.id,
        scenario_id: instance.scenarioId,
        seed: instance.seed,
        status: instance.status,
        import_id: instance.importId,
        reconciliation_run_id: instance.reconciliationRunId,
        records_created: instance.recordsCreated,
        cases_created: instance.casesCreated,
        replayed: outcome.replayed,
      });
    },
  );

  app.get('/v1/demo/scenario-instances', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    const items = await deps.scenarios.list(scopeOf(ctx), 50);
    return reply.send({
      items: items.map((i) => ({
        id: i.id,
        scenario_id: i.scenarioId,
        seed: i.seed,
        status: i.status,
        records_created: i.recordsCreated,
        cases_created: i.casesCreated,
        created_at: i.createdAt,
      })),
    });
  });
};
