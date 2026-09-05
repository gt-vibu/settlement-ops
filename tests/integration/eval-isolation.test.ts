/**
 * Hidden-truth isolation (Decision D5).
 *
 * The claim being tested is not "the code does not read the eval database" - code can be
 * changed by accident. The claim is that the application CREDENTIAL CANNOT CONNECT to the
 * evaluation database at all, and vice versa. That is a PostgreSQL grant, so it survives a
 * careless import, a debug statement, and a compromised service account.
 *
 * If these tests fail, no benchmark number from this repository means anything: the
 * treatment could have read its own answers.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const HOST = process.env.TEST_PG_HOST ?? 'localhost';
const PORT = Number(process.env.TEST_PG_PORT ?? '5434');

const url = (user: string, password: string, database: string): string =>
  `postgres://${user}:${password}@${HOST}:${PORT}/${database}`;

const APP = url('settlementops_app', 'local_dev_only', 'settlementops_app');
const APP_TO_EVAL = url('settlementops_app', 'local_dev_only', 'settlementops_eval');
const EVAL = url('settlementops_eval', 'local_dev_only_eval', 'settlementops_eval');
const EVAL_TO_APP = url('settlementops_eval', 'local_dev_only_eval', 'settlementops_app');

const canConnect = async (connectionString: string): Promise<boolean> => {
  const client = new Client({ connectionString, connectionTimeoutMillis: 4_000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
};

const available = await canConnect(APP);
const suite = available ? describe : describe.skip;

if (!available) {
  console.error(
    '\n  SKIPPED: isolation tests need PostgreSQL. Run: pnpm db:up && pnpm db:migrate\n',
  );
}

suite('hidden-truth isolation (D5)', () => {
  it('the application credential CANNOT connect to the evaluation database', async () => {
    expect(await canConnect(APP_TO_EVAL)).toBe(false);
  });

  it('the evaluation credential CANNOT connect to the application database', async () => {
    expect(await canConnect(EVAL_TO_APP)).toBe(false);
  });

  it('each credential can still reach its own database', async () => {
    expect(await canConnect(APP)).toBe(true);
    expect(await canConnect(EVAL)).toBe(true);
  });
});

suite('evaluation schema', () => {
  let client: Client;
  beforeAll(async () => {
    client = new Client({ connectionString: EVAL });
    await client.connect();
  });
  afterAll(async () => {
    await client.end().catch(() => undefined);
  });

  it('holds every hidden-truth table the design requires', async () => {
    const result = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = result.rows.map((r) => r.table_name);
    for (const required of [
      'hidden_case_truth',
      'generator_runs',
      'split_manifest',
      'combination_registry',
      'scoring_oracle_results',
    ]) {
      expect(tables).toContain(required);
    }
  });

  it('refuses a second split for the same merchant, so splits cannot overlap', async () => {
    const runId = randomUUID();
    await client.query(
      `INSERT INTO generator_runs (id, generator_version, experiment_version, root_seed,
         configuration_hash, model_provider, model_name, model_digest, policy_version)
       VALUES ($1,'test','test',1,'hash','ollama','test','digest','1.0.0')`,
      [runId],
    );
    const merchant = randomUUID();
    const insert = (split: string) =>
      client.query(
        `INSERT INTO split_manifest (id, generator_run_id, split, split_seed, merchant_id, case_count)
         VALUES ($1,$2,$3,1,$4,10)`,
        [randomUUID(), runId, split, merchant],
      );
    await insert('development');
    // A merchant appearing in two splits silently invalidates every confidence interval,
    // so the database refuses it rather than trusting the generator to be careful.
    await expect(insert('primary_test')).rejects.toThrow();
    await client.query('DELETE FROM split_manifest WHERE generator_run_id = $1', [runId]);
    await client.query('DELETE FROM generator_runs WHERE id = $1', [runId]);
  });
});
