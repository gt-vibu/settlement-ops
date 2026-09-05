/**
 * Migration runner.
 *
 * Uses MIGRATION_DATABASE_URL (the migrator role), never the application credential,
 * and is never invoked at application startup (specs/MIGRATIONS.md).
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../packages/persistence/migrations/', import.meta.url),
);

const run = async (): Promise<void> => {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (connectionString === undefined || connectionString === '') {
    console.error('MIGRATION_DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const applied = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
  const done = new Set(applied.rows.map((r) => r.id));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`apply  ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`FAILED ${file}`);
      console.error(error instanceof Error ? error.message : String(error));
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('migrations complete');
};

void run();
