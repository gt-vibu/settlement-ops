/**
 * Evaluation-database migrations.
 *
 * Separate from `scripts/migrate.ts` on purpose: the two databases have different
 * credentials and must never share a runner that could point at the wrong one.
 * Uses EVAL_MIGRATION_DATABASE_URL, never the application credential.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'pg';

const DIR = fileURLToPath(new URL('../../packages/persistence/eval-migrations/', import.meta.url));

const run = async (): Promise<void> => {
  const connectionString = process.env.EVAL_MIGRATION_DATABASE_URL;
  if (connectionString === undefined || connectionString === '') {
    console.error('EVAL_MIGRATION_DATABASE_URL is not set.');
    process.exit(1);
  }
  const client = new Client({ connectionString });
  await client.connect();
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const applied = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
  const done = new Set(applied.rows.map((r) => r.id));
  for (const file of (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = await readFile(path.join(DIR, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`apply  ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`FAILED ${file}:`, error instanceof Error ? error.message : String(error));
      await client.end();
      process.exit(1);
    }
  }
  await client.end();
  console.log('evaluation migrations complete');
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
