/**
 * Liveness and readiness (specs/API_SPEC.md section 8).
 *
 * /health is process liveness only. /ready reports dependency readiness without
 * leaking connection strings, hostnames or driver errors.
 */

import type { FastifyInstance } from 'fastify';
import { pingDatabase, type DatabaseHandle } from '@settlementops/persistence';

export const registerHealthRoutes = (
  app: FastifyInstance,
  db: DatabaseHandle | null,
  modelHealth: (() => Promise<{ ok: boolean; detail: string }>) | null,
): void => {
  /**
   * Liveness. Deliberately does no I/O.
   *
   * A health check that touches the database turns a slow database into a restart loop,
   * which is how a degraded system becomes an outage.
   */
  app.get('/health', async () => ({ status: 'ok' }));

  /**
   * Readiness: can this instance safely serve traffic?
   *
   * The database is required. The model is required only when AI investigation is enabled -
   * an instance that would accept investigations it cannot complete is not ready. Details
   * are booleans and short strings; no connection strings, hostnames or driver errors.
   */
  app.get('/ready', async (_request, reply) => {
    const databaseReady = db === null ? false : await pingDatabase(db);
    const model = modelHealth === null ? null : await modelHealth();
    const dependencies = {
      database: databaseReady,
      ...(model === null ? {} : { model: model.ok }),
    };

    if (!databaseReady || (model !== null && !model.ok)) {
      return reply.code(503).send({
        status: 'not_ready',
        dependencies,
        ...(model !== null && !model.ok ? { detail: model.detail.slice(0, 200) } : {}),
      });
    }
    return reply.code(200).send({ status: 'ready', dependencies });
  });
};
