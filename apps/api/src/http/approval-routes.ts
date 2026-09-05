/**
 * Approval and staging routes.
 *
 * Separate file because `scenario-routes.ts` is already at the size the code policy warns
 * about, and because these endpoints are the financial-authority boundary: they deserve to
 * be read on their own.
 *
 * Every one of them requires APPROVER. None of them writes to a ledger.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { asId, cryptoIdGenerator, systemClock, type CaseId } from '@settlementops/shared';
import type {
  AuditWriter,
  CaseTransitionRepository,
  RequestContext,
} from '@settlementops/application';
import { approveProposal, rejectProposal, stageApprovedAction } from '@settlementops/workflow';

import { SAFE_MESSAGES, envelope, failureReply } from './errors.js';

export interface ApprovalDepsBundle {
  readonly transitions: CaseTransitionRepository;
  readonly audit: AuditWriter;
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

export const registerApprovalRoutes = (app: FastifyInstance, deps: ApprovalDepsBundle): void => {
  const ids = cryptoIdGenerator();
  const clock = systemClock();
  const workflow = { transitions: deps.transitions, audit: deps.audit, ids, clock };

  app.post<{ Params: { id: string }; Body: { case_version?: number; note?: string } }>(
    '/v1/cases/:id/approve',
    async (request, reply) => {
      const ctx = contextOf(request, reply);
      if (ctx === null) return reply;
      const result = await approveProposal(workflow, ctx, {
        caseId: asId<CaseId>(request.params.id),
        expectedVersion: request.body?.case_version ?? 1,
        note: request.body?.note ?? '',
      });
      if (result.kind === 'FORBIDDEN') {
        return reply.code(403).send(envelope('FORBIDDEN', SAFE_MESSAGES.FORBIDDEN, request.id));
      }
      if (result.kind === 'FAILED') return failureReply(reply, request.id, result.failure);
      if (result.kind === 'REASON_REQUIRED') {
        return reply
          .code(400)
          .send(envelope('VALIDATION_ERROR', 'A reason is required.', request.id));
      }
      return reply.send({
        state: result.transition.nextState,
        case_version: result.transition.caseVersion,
      });
    },
  );

  app.post<{ Params: { id: string }; Body: { case_version?: number; reason?: string } }>(
    '/v1/cases/:id/reject',
    async (request, reply) => {
      const ctx = contextOf(request, reply);
      if (ctx === null) return reply;
      const result = await rejectProposal(workflow, ctx, {
        caseId: asId<CaseId>(request.params.id),
        expectedVersion: request.body?.case_version ?? 1,
        reason: request.body?.reason ?? '',
      });
      if (result.kind === 'FORBIDDEN') {
        return reply.code(403).send(envelope('FORBIDDEN', SAFE_MESSAGES.FORBIDDEN, request.id));
      }
      if (result.kind === 'REASON_REQUIRED') {
        return reply
          .code(400)
          .send(envelope('VALIDATION_ERROR', 'A rejection reason is required.', request.id));
      }
      if (result.kind === 'FAILED') return failureReply(reply, request.id, result.failure);
      return reply.send({
        state: result.transition.nextState,
        case_version: result.transition.caseVersion,
      });
    },
  );

  app.post<{
    Params: { id: string };
    Body: { case_version?: number; action_type?: string; amount_minor?: string };
  }>('/v1/cases/:id/stage', async (request, reply) => {
    const ctx = contextOf(request, reply);
    if (ctx === null) return reply;
    const result = await stageApprovedAction(workflow, ctx, {
      caseId: asId<CaseId>(request.params.id),
      expectedVersion: request.body?.case_version ?? 1,
      actionType: request.body?.action_type ?? 'STAGE_LEDGER_ADJUSTMENT',
      amountMinor: request.body?.amount_minor ?? '0',
      currency: 'INR',
    });
    if (result.kind === 'FORBIDDEN') {
      return reply.code(403).send(envelope('FORBIDDEN', SAFE_MESSAGES.FORBIDDEN, request.id));
    }
    if (result.kind === 'FAILED') return failureReply(reply, request.id, result.failure);
    return reply.send({
      state: result.kind === 'STAGED' ? result.transition.nextState : 'UNCHANGED',
      case_version: result.kind === 'STAGED' ? result.transition.caseVersion : 0,
      // Said plainly in the response: staging is where this system stops.
      note: 'staged as an intent for a human to apply; no ledger was written',
    });
  });
};
