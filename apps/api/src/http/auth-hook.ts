/**
 * Authentication hook.
 *
 * Runs before every /v1 route. Constructs the RequestContext server-side and attaches
 * it to the request. Downstream handlers receive only that context - they never see
 * the raw headers, so a handler cannot accidentally trust a client-supplied tenant.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  isAuthError,
  type AuthenticationAdapter,
  type RequestContext,
} from '@settlementops/application';
import { envelope, SAFE_MESSAGES, statusFor } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: RequestContext;
  }
}

const headerValue = (request: FastifyRequest, name: string): string | undefined => {
  const raw = request.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
};

export const registerAuthHook = (app: FastifyInstance, adapter: AuthenticationAdapter): void => {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/v1')) return;

    const requestId = request.id;
    const result = await adapter.authenticate({
      subject: headerValue(request, 'x-demo-user-id'),
      requestedTenant: headerValue(request, 'x-demo-tenant-id'),
      requestId,
      correlationId: headerValue(request, 'x-correlation-id') ?? requestId,
    });

    if (isAuthError(result)) {
      const code = result.kind;
      return reply.code(statusFor(code)).send(envelope(code, SAFE_MESSAGES[code], requestId));
    }

    request.authContext = result;
    return undefined;
  });
};
