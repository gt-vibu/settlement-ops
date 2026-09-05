/**
 * Worker reliability.
 *
 * Every assertion here is about a job NOT disappearing. A queue that loses work quietly is
 * worse than one that fails loudly, because nobody goes looking for the failure.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

import { createDatabase, type DatabaseHandle } from '@settlementops/persistence';
import {
  MAX_ATTEMPTS,
  backoffFor,
  claimJob,
  completeJob,
  enqueueJob,
  failJob,
  heartbeat,
  reclaimAbandoned,
} from '../../apps/worker/src/jobs/job-runner.js';

const APP_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgres://settlementops_app:local_dev_only@localhost:5434/settlementops_app';

const reachable = async (): Promise<boolean> => {
  const client = new Client({ connectionString: APP_URL, connectionTimeoutMillis: 3_000 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
};

const available = await reachable();
const suite = available ? describe : describe.skip;

suite('worker job reliability', () => {
  let db: DatabaseHandle;
  const JOB_TYPE = `test_job_${randomUUID().slice(0, 8)}`;
  const created: string[] = [];

  const enqueue = async (): Promise<string> => {
    const id = randomUUID();
    await enqueueJob(db, {
      id,
      merchantId: null,
      jobType: JOB_TYPE,
      payload: { probe: true },
      correlationId: randomUUID(),
    });
    created.push(id);
    return id;
  };

  const statusOf = async (id: string) => {
    const result = await db.pool.query<{
      status: string;
      attempts: number;
      failure_code: string | null;
    }>('SELECT status, attempts, failure_code FROM jobs WHERE id = $1', [id]);
    return result.rows[0];
  };

  beforeAll(() => {
    db = createDatabase(APP_URL);
  });

  afterAll(async () => {
    if (created.length > 0) {
      await db.pool.query('DELETE FROM jobs WHERE id = ANY($1)', [created]);
    }
    await db.close();
  });

  it('claims a job exactly once, so two workers cannot take the same work', async () => {
    const id = await enqueue();
    const first = await claimJob(db, [JOB_TYPE]);
    const second = await claimJob(db, [JOB_TYPE]);
    expect(first?.id).toBe(id);
    // The queue holds only this one job of this type, so a second claim must find nothing.
    expect(second).toBeNull();
    await completeJob(db, id);
    expect((await statusOf(id))?.status).toBe('SUCCEEDED');
  });

  it('delays a retry instead of re-claiming immediately', async () => {
    const id = await enqueue();
    const claimed = await claimJob(db, [JOB_TYPE]);
    expect(claimed?.id).toBe(id);

    await failJob(db, id, claimed?.attempts ?? 1, 'TRANSIENT_ERROR');
    expect((await statusOf(id))?.status).toBe('PENDING');

    // Backoff has not elapsed, so the job is pending but NOT claimable yet. Without this
    // a poison job burns its whole attempt budget in one poll cycle.
    expect(await claimJob(db, [JOB_TYPE])).toBeNull();
  });

  it('abandons a job once it exhausts its attempts, with the reason preserved', async () => {
    const id = await enqueue();
    await db.pool.query('UPDATE jobs SET attempts = $2 WHERE id = $1', [id, MAX_ATTEMPTS]);
    await failJob(db, id, MAX_ATTEMPTS, 'POISON_PAYLOAD');
    const row = await statusOf(id);
    expect(row?.status).toBe('ABANDONED');
    // The failure code survives: an operator can see WHY it stopped.
    expect(row?.failure_code).toBe('POISON_PAYLOAD');
  });

  it('requeues a job whose worker died, after a backoff', async () => {
    const id = await enqueue();
    await claimJob(db, [JOB_TYPE]);
    // Simulate a worker that stopped heartbeating.
    await db.pool.query(
      "UPDATE jobs SET heartbeat_at = now() - interval '10 minutes' WHERE id = $1",
      [id],
    );

    const result = await reclaimAbandoned(db, 300);
    expect(result.requeued).toBeGreaterThanOrEqual(1);
    expect((await statusOf(id))?.status).toBe('PENDING');
  });

  it('abandons - rather than stranding - a stale job that has used all its attempts', async () => {
    const id = await enqueue();
    await db.pool.query(
      `UPDATE jobs SET status = 'CLAIMED', attempts = $2,
                      heartbeat_at = now() - interval '10 minutes' WHERE id = $1`,
      [id, MAX_ATTEMPTS],
    );

    const result = await reclaimAbandoned(db, 300);
    expect(result.abandoned).toBeGreaterThanOrEqual(1);
    const row = await statusOf(id);
    // Previously this job stayed CLAIMED forever: not running, not failed, invisible.
    expect(row?.status).toBe('ABANDONED');
    expect(row?.failure_code).toBe('WORKER_LOST_AFTER_MAX_ATTEMPTS');
  });

  it('keeps a heartbeating job claimed, so live work is not stolen', async () => {
    const id = await enqueue();
    await claimJob(db, [JOB_TYPE]);
    await heartbeat(db, id);
    const result = await reclaimAbandoned(db, 300);
    expect(result.requeued).toBe(0);
    expect((await statusOf(id))?.status).toBe('CLAIMED');
    await completeJob(db, id);
  });

  it('backs off further on each successive attempt', () => {
    expect(backoffFor(0)).toBeLessThan(backoffFor(1));
    expect(backoffFor(1)).toBeLessThan(backoffFor(2));
    // Bounded: an out-of-range attempt does not produce an unbounded delay.
    expect(backoffFor(99)).toBeLessThanOrEqual(120);
  });
});
