/**
 * Liveness and readiness (specs/API_SPEC.md section 8).
 *
 * /health is process liveness only. /ready reports dependency readiness without
 * leaking connection strings, hostnames or driver errors.
 */

import type { FastifyInstance } from 'fastify';
import { pingDatabase, type DatabaseHandle } from '@settlementops/persistence';

export const registerHealthRoutes = (app: FastifyInstance, db: DatabaseHandle | null): void => {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (_request, reply) => {
    const databaseReady = db === null ? false : await pingDatabase(db);
    if (!databaseReady) {
      return reply.code(503).send({ status: 'not_ready', dependencies: { database: false } });
    }
    return reply.code(200).send({ status: 'ready', dependencies: { database: true } });
  });
};
