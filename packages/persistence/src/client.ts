/**
 * PostgreSQL connection factory.
 *
 * The application always connects with the APPLICATION role, which has UPDATE and
 * DELETE revoked on audit_events (D5). Migrations use a separate migrator credential
 * and never run at application startup (specs/MIGRATIONS.md).
 */

import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

export interface DatabaseHandle {
  readonly pool: Pool;
  close(): Promise<void>;
}

export const createDatabase = (
  connectionString: string,
  overrides: PoolConfig = {},
): DatabaseHandle => {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...overrides,
  });
  return {
    pool,
    close: async (): Promise<void> => {
      await pool.end();
    },
  };
};

export const pingDatabase = async (db: DatabaseHandle): Promise<boolean> => {
  try {
    await db.pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};
