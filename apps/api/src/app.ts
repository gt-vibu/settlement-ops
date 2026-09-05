/**
 * Fastify application assembly.
 *
 * The HTTP layer validates, authenticates and delegates. It performs no financial
 * arithmetic and never calls a model provider (specs/SYSTEM_DESIGN.md section 2).
 */

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  createMetrics,
  type AuditReader,
  type AuthenticationAdapter,
} from '@settlementops/application';
import type { DatabaseHandle } from '@settlementops/persistence';
import { registerHealthRoutes } from './http/health-routes.js';
import { registerV1Routes, type V1Deps } from './http/v1-routes.js';
import { registerWorkflowRoutes, type WorkflowDepsBundle } from './http/scenario-routes.js';
import { registerAuditRoutes } from './http/audit-routes.js';
import { registerApprovalRoutes } from './http/approval-routes.js';
import { registerAuthHook } from './http/auth-hook.js';
import { envelope, SAFE_MESSAGES } from './http/errors.js';

export interface AppDependencies {
  readonly auth: AuthenticationAdapter;
  readonly db: DatabaseHandle | null;
  readonly logLevel: string;
  readonly v1: V1Deps | null;
  readonly workflow: WorkflowDepsBundle | null;
  readonly auditReader: AuditReader | null;
  /**
   * Checked by `/ready` when present.
   *
   * Readiness answers "can this instance safely serve traffic?", so an instance whose AI
   * is enabled but whose model is unreachable is NOT ready - it would accept
   * investigations it cannot complete. Liveness is unaffected.
   */
  readonly modelHealth?: (() => Promise<{ ok: boolean; detail: string }>) | null;
  readonly metrics?: ReturnType<typeof createMetrics>;
}

export const buildApp = (deps: AppDependencies): FastifyInstance => {
  const metrics = deps.metrics ?? createMetrics();
  const app = Fastify({
    // Request ids double as correlation ids and are persisted to UUID columns, so the
    // default sequential 'req-1' form is not usable.
    genReqId: () => randomUUID(),
    logger: { level: deps.logLevel },
    // 1 MiB. The import route raises this deliberately; everything else stays small so a
    // single request cannot exhaust memory (`EXPERIMENT_CONSTANTS.md` O4).
    bodyLimit: 1_048_576,

    // Bound the time a client can hold a connection open sending headers.
    requestTimeout: 30_000,
    // Never echo the framework or the route back in an error payload.
    ajv: { customOptions: { allErrors: false } },
  });

  /**
   * Unexpected failures return the stable envelope and nothing else.
   *
   * Fastify's default handler serialises `error.message`, which for a driver error can
   * contain a connection string, a table name or a fragment of SQL. The request id is the
   * only thing a caller needs to correlate with the log line that does have the detail.
   */
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, reqId: request.id }, 'unhandled request failure');
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    const status = typeof statusCode === 'number' ? statusCode : 500;
    if (status === 413) {
      return reply
        .code(413)
        .send(envelope('VALIDATION_ERROR', 'The request body is too large.', request.id));
    }
    if (status >= 400 && status < 500) {
      return reply
        .code(status)
        .send(envelope('VALIDATION_ERROR', 'The request could not be processed.', request.id));
    }
    return reply
      .code(500)
      .send(envelope('INTERNAL_ERROR', SAFE_MESSAGES.INTERNAL_ERROR, request.id));
  });

  /**
   * Request latency and error rate, by route pattern - never by URL.
   *
   * A URL carries case ids and merchant ids; a route pattern does not. One is a metric,
   * the other is a slow data leak.
   */
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    request.log.info(
      {
        reqId: request.id,
        route,
        method: request.method,
        status: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
    if (reply.statusCode === 409) metrics.increment('conflict.stale_version');
  });

  /** Operational counters. Not authenticated data, and deliberately unlabelled by tenant. */
  app.get('/metrics', async () => metrics.snapshot());

  registerHealthRoutes(app, deps.db, deps.modelHealth ?? null);
  registerAuthHook(app, deps.auth);
  if (deps.v1 !== null) registerV1Routes(app, deps.v1);
  if (deps.workflow !== null) registerWorkflowRoutes(app, deps.workflow);
  if (deps.auditReader !== null) registerAuditRoutes(app, deps.auditReader);
  // The financial-authority boundary: approve, reject, stage. APPROVER only, no ledger write.
  if (deps.workflow !== null) {
    registerApprovalRoutes(app, {
      transitions: deps.workflow.transitions,
      audit: deps.workflow.audit,
    });
  }

  // Whoami: proves the RequestContext is server-constructed and tenant-scoped.
  app.get('/v1/whoami', async (request, reply) => {
    const ctx = request.authContext;
    if (ctx === undefined) {
      return reply
        .code(401)
        .send(envelope('UNAUTHENTICATED', SAFE_MESSAGES.UNAUTHENTICATED, request.id));
    }
    return reply.code(200).send({
      user_id: ctx.userId,
      tenant_id: ctx.tenantId,
      roles: ctx.roles,
      request_id: ctx.requestId,
    });
  });

  app.setNotFoundHandler(async (request, reply) =>
    reply.code(404).send(envelope('NOT_FOUND', SAFE_MESSAGES.NOT_FOUND, request.id)),
  );

  return app;
};
