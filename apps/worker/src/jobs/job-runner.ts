/**
 * Durable job claiming.
 *
 * `FOR UPDATE SKIP LOCKED` lets several workers claim from the same queue without
 * blocking each other and without two workers taking the same job. State lives in the
 * `jobs` table, not in memory, so a worker restart loses nothing (`RELIABILITY.md`).
 *
 * No Redis, no broker. `AGENTS.md` forbids speculative infrastructure, and PostgreSQL
 * does this correctly at the scale this system needs.
 */

import type { DatabaseHandle } from '@settlementops/persistence';

export interface Job {
  readonly id: string;
  readonly merchantId: string | null;
  readonly jobType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly attempts: number;
}

export const MAX_ATTEMPTS = 3;

/**
 * Retry backoff, in seconds, indexed by attempt number.
 *
 * Without it a failed job returned to PENDING and was re-claimed on the next poll, so a
 * poison job spent its entire attempt budget inside a few seconds and a transient database
 * blip got no time to clear. Bounded and short: this is a settlement queue, not a mail
 * server, and an operator should not wait minutes to see a retry.
 */
const BACKOFF_SECONDS: readonly number[] = [5, 30, 120];

export const backoffFor = (attempts: number): number =>
  BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length - 1)] ?? 120;

interface JobRow {
  id: string;
  merchant_id: string | null;
  job_type: string;
  payload_json: Record<string, unknown>;
  correlation_id: string;
  attempts: number;
}

/** Atomically claims one pending job. Returns null when the queue is empty. */
export const claimJob = async (
  db: DatabaseHandle,
  jobTypes: readonly string[],
): Promise<Job | null> => {
  const result = await db.pool.query<JobRow>(
    `UPDATE jobs
        SET status = 'CLAIMED', attempts = attempts + 1,
            claimed_at = now(), heartbeat_at = now()
      WHERE id = (
        SELECT id FROM jobs
         WHERE status = 'PENDING'
           AND job_type = ANY($1)
           AND available_at <= now()
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING id, merchant_id, job_type, payload_json, correlation_id, attempts`,
    [jobTypes],
  );
  const row = result.rows[0];
  return row === null || row === undefined
    ? null
    : {
        id: row.id,
        merchantId: row.merchant_id,
        jobType: row.job_type,
        payload: row.payload_json,
        correlationId: row.correlation_id,
        attempts: row.attempts,
      };
};

export const completeJob = async (db: DatabaseHandle, id: string): Promise<void> => {
  await db.pool.query(`UPDATE jobs SET status = 'SUCCEEDED', completed_at = now() WHERE id = $1`, [
    id,
  ]);
};

/**
 * Fails a job. Retryable below the attempt ceiling, abandoned above it.
 *
 * A job is never silently dropped: an abandoned job keeps its failure code so an
 * operator can see why it stopped.
 */
export const failJob = async (
  db: DatabaseHandle,
  id: string,
  attempts: number,
  failureCode: string,
): Promise<void> => {
  const terminal = attempts >= MAX_ATTEMPTS;
  await db.pool.query(
    `UPDATE jobs
        SET status = $2, failure_code = $3,
            completed_at = CASE WHEN $2 = 'ABANDONED' THEN now() ELSE NULL END,
            available_at = CASE WHEN $2 = 'PENDING'
                                THEN now() + ($4 || ' seconds')::interval
                                ELSE available_at END
      WHERE id = $1`,
    [id, terminal ? 'ABANDONED' : 'PENDING', failureCode, String(backoffFor(attempts))],
  );
};

export const heartbeat = async (db: DatabaseHandle, id: string): Promise<void> => {
  await db.pool.query(`UPDATE jobs SET heartbeat_at = now() WHERE id = $1`, [id]);
};

/**
 * Reclaims jobs whose worker died mid-flight.
 *
 * Two outcomes, and the second one was missing. A stale job below the attempt ceiling goes
 * back to the queue. A stale job that has already used its attempts is ABANDONED with a
 * failure code - previously it stayed CLAIMED forever: not running, not failed, and
 * invisible to anyone looking for problems. A job that disappears is worse than a job that
 * fails.
 */
export const reclaimAbandoned = async (
  db: DatabaseHandle,
  staleSeconds: number,
): Promise<{ requeued: number; abandoned: number }> => {
  const requeued = await db.pool.query(
    `UPDATE jobs
        SET status = 'PENDING',
            available_at = now() + ($3 || ' seconds')::interval
      WHERE status = 'CLAIMED'
        AND heartbeat_at < now() - ($1 || ' seconds')::interval
        AND attempts < $2`,
    [String(staleSeconds), MAX_ATTEMPTS, String(BACKOFF_SECONDS[0] ?? 5)],
  );

  const abandoned = await db.pool.query(
    `UPDATE jobs
        SET status = 'ABANDONED',
            failure_code = COALESCE(failure_code, 'WORKER_LOST_AFTER_MAX_ATTEMPTS'),
            completed_at = now()
      WHERE status = 'CLAIMED'
        AND heartbeat_at < now() - ($1 || ' seconds')::interval
        AND attempts >= $2`,
    [String(staleSeconds), MAX_ATTEMPTS],
  );

  return { requeued: requeued.rowCount ?? 0, abandoned: abandoned.rowCount ?? 0 };
};

export const enqueueJob = async (
  db: DatabaseHandle,
  input: {
    id: string;
    merchantId: string | null;
    jobType: string;
    payload: Readonly<Record<string, unknown>>;
    correlationId: string;
  },
): Promise<void> => {
  await db.pool.query(
    `INSERT INTO jobs (id, merchant_id, job_type, status, payload_json, correlation_id)
     VALUES ($1, $2, $3, 'PENDING', $4::jsonb, $5)`,
    [input.id, input.merchantId, input.jobType, JSON.stringify(input.payload), input.correlationId],
  );
};
