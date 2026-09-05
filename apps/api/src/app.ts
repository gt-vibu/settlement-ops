/**
 * Fastify application assembly.
 *
 * The HTTP layer validates, authenticates and delegates. It performs no financial
 * arithmetic and never calls a model provider (specs/SYSTEM_DESIGN.md section 2).
 */

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AuditReader, AuthenticationAdapter } from '@settlementops/application';
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
}

export const buildApp = (deps: AppDependencies): FastifyInstance => {
  const app = Fastify({
    // Request ids double as correlation ids and are persisted to UUID columns, so the
    // default sequential 'req-1' form is not usable.
    genReqId: () => randomUUID(),
    logger: { level: deps.logLevel },
    bodyLimit: 1_048_576,
    disableRequestLogging: false,
  });

  registerHealthRoutes(app, deps.db);
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

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error }, 'unhandled error');
    return reply
      .code(500)
      .send(envelope('INTERNAL_ERROR', SAFE_MESSAGES.INTERNAL_ERROR, request.id));
  });

  return app;
};
