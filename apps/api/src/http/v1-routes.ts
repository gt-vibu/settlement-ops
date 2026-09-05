/**
 * Phase 2 API surface (`API_SPEC.md` sections 2-4).
 *
 * Handlers validate, authorize and delegate. No financial arithmetic happens here, and
 * no repository is reached without a MerchantScope derived from the RequestContext.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { cryptoIdGenerator, systemClock, asId, type CaseId } from '@settlementops/shared';
import {
  hasAtLeast,
  runReconciliation,
  scopeOf,
  submitImport,
  type RequestContext,
} from '@settlementops/application';
import type {
  AuditWriter,
  CaseRepository,
  ImportRepository,
  RecordRepository,
  ReconciliationRunRepository,
} from '@settlementops/application';
import { envelope, SAFE_MESSAGES } from './errors.js';

export interface V1Deps {
  readonly imports: ImportRepository;
  readonly records: RecordRepository;
  readonly runs: ReconciliationRunRepository;
  readonly cases: CaseRepository;
  readonly audit: AuditWriter;
}

const MAX_PAYMENTS_PER_RUN = 5_000;
const MAX_PAGE_SIZE = 100;

/** Returns the context or sends 401. Handlers must not proceed without it. */
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

export const registerV1Routes = (app: FastifyInstance, deps: V1Deps): void => {
  const ids = cryptoIdGenerator();
  const clock = systemClock();

  app.post('/v1/imports', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    if (!hasAtLeast(ctx, 'OPERATOR')) {
      return reply.code(403).send(envelope('FORBIDDEN', SAFE_MESSAGES.FORBIDDEN, request.id));
    }

    const header = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(header) ? header[0] : header;
    if (idempotencyKey === undefined || idempotencyKey.trim() === '') {
      return reply
        .code(400)
        .send(envelope('VALIDATION_ERROR', 'An Idempotency-Key header is required.', request.id));
    }

    const result = await submitImport(
      { imports: deps.imports, records: deps.records, audit: deps.audit, ids, clock },
      ctx,
      { body: request.body, idempotencyKey },
    );

    if (result.kind === 'VALIDATION_ERROR') {
      return reply.code(400).send(
        envelope('VALIDATION_ERROR', SAFE_MESSAGES.VALIDATION_ERROR, request.id, {
          issues: result.issues,
        }),
      );
    }

    // A replay returns 200 with the original result rather than creating a second import.
    return reply.code(result.replayed ? 200 : 201).send({
      id: result.summary.id,
      status: result.summary.status,
      submitted_count: result.summary.submittedCount,
      accepted_count: result.summary.acceptedCount,
      rejected_count: result.summary.rejectedCount,
      duplicate_count: result.summary.duplicateCount,
      validation_errors: result.summary.validationErrors,
      replayed: result.replayed,
    });
  });

  app.get<{ Params: { id: string } }>('/v1/imports/:id', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    const summary = await deps.imports.findById(scopeOf(ctx), request.params.id);
    if (summary === null) {
      // 404 rather than 403 for another tenant's resource: the API must not confirm
      // that a resource exists outside the caller's scope.
      return reply.code(404).send(envelope('NOT_FOUND', SAFE_MESSAGES.NOT_FOUND, request.id));
    }
    return reply.send({
      id: summary.id,
      status: summary.status,
      source_type: summary.sourceType,
      submitted_count: summary.submittedCount,
      accepted_count: summary.acceptedCount,
      rejected_count: summary.rejectedCount,
      duplicate_count: summary.duplicateCount,
      validation_errors: summary.validationErrors,
      created_at: summary.createdAt,
      completed_at: summary.completedAt,
    });
  });

  app.post<{ Body: { import_id?: string | null } }>(
    '/v1/reconciliation-runs',
    async (request, reply) => {
      const ctx = contextOf(request, reply);
      if (ctx === null) return reply;
      if (!hasAtLeast(ctx, 'OPERATOR')) {
        return reply.code(403).send(envelope('FORBIDDEN', SAFE_MESSAGES.FORBIDDEN, request.id));
      }

      const summary = await runReconciliation(
        {
          runs: deps.runs,
          records: deps.records,
          cases: deps.cases,
          audit: deps.audit,
          ids,
          clock,
        },
        ctx,
        { importId: request.body?.import_id ?? null, maxPayments: MAX_PAYMENTS_PER_RUN },
      );

      return reply.code(201).send({
        id: summary.id,
        status: summary.status,
        policy_version: summary.policyVersion,
        evaluated_count: summary.evaluatedCount,
        reconciled_count: summary.reconciledCount,
        residual_count: summary.residualCount,
      });
    },
  );

  app.get<{ Params: { id: string } }>('/v1/reconciliation-runs/:id', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    const summary = await deps.runs.findById(scopeOf(ctx), request.params.id);
    if (summary === null) {
      return reply.code(404).send(envelope('NOT_FOUND', SAFE_MESSAGES.NOT_FOUND, request.id));
    }
    return reply.send({
      id: summary.id,
      status: summary.status,
      import_id: summary.importId,
      policy_version: summary.policyVersion,
      evaluated_count: summary.evaluatedCount,
      reconciled_count: summary.reconciledCount,
      residual_count: summary.residualCount,
      failure_code: summary.failureCode,
      created_at: summary.createdAt,
      completed_at: summary.completedAt,
    });
  });

  app.get<{ Querystring: { state?: string; limit?: string; offset?: string } }>(
    '/v1/cases',
    async (request, reply) => {
      const ctx = contextOf(request, reply);
      if (ctx === null) return reply;
      const limit = Math.min(Number(request.query.limit ?? 25) || 25, MAX_PAGE_SIZE);
      const offset = Math.max(Number(request.query.offset ?? 0) || 0, 0);
      const filter =
        request.query.state === undefined
          ? { limit, offset }
          : { state: request.query.state, limit, offset };
      const items = await deps.cases.list(scopeOf(ctx), filter);
      return reply.send({
        items: items.map((c) => ({
          id: c.id,
          case_number: c.caseNumber,
          state: c.state,
          priority: c.priority,
          discrepancy_amount_minor: c.discrepancyMinor,
          currency: c.currency,
          reasons: c.reasons,
          opened_at: c.openedAt,
        })),
        limit,
        offset,
      });
    },
  );

  app.get<{ Params: { id: string } }>('/v1/cases/:id', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    const found = await deps.cases.findById(scopeOf(ctx), asId<CaseId>(request.params.id));
    if (found === null) {
      return reply.code(404).send(envelope('NOT_FOUND', SAFE_MESSAGES.NOT_FOUND, request.id));
    }
    return reply.send({
      id: found.id,
      case_number: found.caseNumber,
      state: found.state,
      priority: found.priority,
      discrepancy_amount_minor: found.discrepancyMinor,
      currency: found.currency,
      reasons: found.reasons,
      opened_at: found.openedAt,
    });
  });

  app.get('/v1/operations/summary', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    const byState = await deps.cases.countByState(scopeOf(ctx));
    const open = Object.entries(byState)
      .filter(([state]) => state !== 'CLOSED' && state !== 'RECONCILED')
      .reduce((total, [, count]) => total + count, 0);
    return reply.send({ cases_by_state: byState, open_case_count: open });
  });
};
