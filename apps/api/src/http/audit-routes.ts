/**
 * Audit read routes.
 *
 * Read-only by construction. There is no write path here and none may be added: audit
 * events are appended through the workflow use cases, and the application database role
 * has UPDATE and DELETE revoked on `audit_events` (migration 0004). Corrections are
 * compensating events, never edits (`AUDIT_TRAIL.md` section 2).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { asId, type CaseId } from '@settlementops/shared';
import { scopeOf, type AuditReader, type RequestContext } from '@settlementops/application';
import { envelope, SAFE_MESSAGES } from './errors.js';

const AUDIT_PAGE_LIMIT = 200;

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

export const registerAuditRoutes = (app: FastifyInstance, auditReader: AuditReader): void => {
  app.get<{ Params: { id: string } }>('/v1/cases/:id/audit', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    const events = await auditReader.listForCase(
      scopeOf(ctx),
      asId<CaseId>(request.params.id),
      AUDIT_PAGE_LIMIT,
    );
    return reply.send({
      items: events.map((e) => ({
        id: e.id,
        entity_type: e.entityType,
        entity_id: e.entityId,
        event_type: e.eventType,
        actor_type: e.actorType,
        actor_id: e.actorId,
        correlation_id: e.correlationId,
        previous_state: e.previousState,
        next_state: e.nextState,
        case_version: e.caseVersion,
        payload: e.payload,
        occurred_at: e.occurredAt,
      })),
    });
  });

  app.get<{ Querystring: { limit?: string } }>('/v1/audit', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    const limit = Math.min(Number(request.query.limit ?? 50) || 50, AUDIT_PAGE_LIMIT);
    const events = await auditReader.listRecent(scopeOf(ctx), limit);
    return reply.send({
      items: events.map((e) => ({
        id: e.id,
        entity_type: e.entityType,
        entity_id: e.entityId,
        event_type: e.eventType,
        actor_type: e.actorType,
        actor_id: e.actorId,
        previous_state: e.previousState,
        next_state: e.nextState,
        case_version: e.caseVersion,
        occurred_at: e.occurredAt,
      })),
      limit,
    });
  });
};
