/**
 * Security tests.
 *
 * Negative tests only. Every one of these asserts that an attack FAILS, and fails safely -
 * a 404 rather than a 403 where existence itself is sensitive, a conflict rather than a
 * silent overwrite, an escalation rather than a resolution.
 *
 * These run against a real PostgreSQL and a real API process, because most of the controls
 * being tested are database grants and server-side context construction, neither of which
 * a unit test can exercise honestly.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

import { createDemoAuthAdapter } from '../../apps/api/src/auth/demo-adapter.js';
import { buildApp } from '../../apps/api/src/app.js';
import {
  createAuditReader,
  createAuditWriter,
  createCaseRepository,
  createCaseTransitionRepository,
  createDatabase,
  createEvidenceRequestRepository,
  createImportRepository,
  createInvestigationRepository,
  createRecordRepository,
  createRunRepository,
  createScenarioRepository,
  createUserDirectory,
  type DatabaseHandle,
} from '@settlementops/persistence';

const APP_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgres://settlementops_app:local_dev_only@localhost:5434/settlementops_app';
const MIGRATOR_URL =
  process.env['TEST_MIGRATION_DATABASE_URL'] ??
  'postgres://settlementops_migrator:local_dev_only@localhost:5434/settlementops_app';

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

if (!available) {
  console.error(
    '\n  SKIPPED: security tests need PostgreSQL. Run: pnpm db:up && pnpm db:migrate\n',
  );
}

suite('API security boundary', () => {
  let db: DatabaseHandle;
  let app: ReturnType<typeof buildApp>;
  let migrator: Client;
  /** A merchant the demo identities are NOT members of. */
  let foreignMerchant: string;
  let foreignCaseId: string;

  beforeAll(async () => {
    db = createDatabase(APP_URL);
    migrator = new Client({ connectionString: MIGRATOR_URL });
    await migrator.connect();

    foreignMerchant = randomUUID();
    await migrator.query(`INSERT INTO merchants (id, status) VALUES ($1, 'ACTIVE')`, [
      foreignMerchant,
    ]);
    foreignCaseId = randomUUID();
    await migrator.query(
      `INSERT INTO reconciliation_cases
         (id, merchant_id, case_number, state, priority, discrepancy_amount_minor, currency,
          deterministic_reason, case_version, opened_at, reasons, checks_json, policy_version)
       VALUES ($1,$2,'CASE-FOREIGN-0001','EXCEPTION',1,1000,'INR','NET_AMOUNT_MISMATCH',1,now(),
               ARRAY['NET_AMOUNT_MISMATCH'],'{}'::jsonb,'1.0.0')`,
      [foreignCaseId, foreignMerchant],
    );

    app = buildApp({
      auth: createDemoAuthAdapter(createUserDirectory(db)),
      db,
      logLevel: 'silent',
      v1: {
        imports: createImportRepository(db),
        records: createRecordRepository(db),
        runs: createRunRepository(db),
        cases: createCaseRepository(db),
        audit: createAuditWriter(db),
      },
      workflow: {
        scenarios: createScenarioRepository(db),
        imports: createImportRepository(db),
        records: createRecordRepository(db),
        runs: createRunRepository(db),
        cases: createCaseRepository(db),
        transitions: createCaseTransitionRepository(db),
        investigations: createInvestigationRepository(db),
        evidence: createEvidenceRequestRepository(db),
        audit: createAuditWriter(db),
        demoScenariosEnabled: true,
        aiInvestigationEnabled: false,
        dispatchAgent: null,
      },
      auditReader: createAuditReader(db),
      modelHealth: null,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await migrator.query('DELETE FROM reconciliation_cases WHERE merchant_id = $1', [
      foreignMerchant,
    ]);
    await migrator.query('DELETE FROM merchants WHERE id = $1', [foreignMerchant]);
    await migrator.end();
    await db.close();
  });

  const call = (
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string>,
    payload?: Record<string, unknown>,
  ) =>
    payload === undefined
      ? app.inject({ method, url, headers })
      : app.inject({ method, url, headers, payload });

  const operator = { 'x-demo-user-id': 'demo-operator' };

  describe('authentication', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const response = await call('GET', '/v1/cases', {});
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects an unknown subject rather than inventing an identity', async () => {
      const response = await call('GET', '/v1/cases', { 'x-demo-user-id': 'attacker' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('tenant isolation', () => {
    it('returns 404 - not 403 - for another merchant`s case, so it is not an existence oracle', async () => {
      const response = await call('GET', `/v1/cases/${foreignCaseId}`, operator);
      expect(response.statusCode).toBe(404);
      // The message must not distinguish "exists elsewhere" from "does not exist".
      expect(JSON.stringify(response.json())).not.toContain(foreignMerchant);
    });

    it('refuses a tenant header naming a merchant the caller does not belong to', async () => {
      const response = await call('GET', '/v1/cases', {
        ...operator,
        'x-demo-tenant-id': foreignMerchant,
      });
      // The header is a SELECTOR among memberships, never an authority.
      expect([401, 403]).toContain(response.statusCode);
    });

    it('does not leak another merchant`s case into a list', async () => {
      const response = await call('GET', '/v1/cases?limit=100', operator);
      expect(response.statusCode).toBe(200);
      const ids = response.json().items.map((i: { id: string }) => i.id);
      expect(ids).not.toContain(foreignCaseId);
    });

    it('refuses a state transition on another merchant`s case', async () => {
      const response = await call('POST', `/v1/cases/${foreignCaseId}/investigations`, operator, {
        case_version: 1,
      });
      expect(response.statusCode).toBe(404);
    });

    it('refuses an audit read for another merchant`s case', async () => {
      const response = await call('GET', `/v1/cases/${foreignCaseId}/audit`, operator);
      expect([404, 200]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        expect(response.json().items).toHaveLength(0);
      }
    });
  });

  describe('privilege separation', () => {
    it('refuses approval from an OPERATOR', async () => {
      const response = await call('POST', `/v1/cases/${randomUUID()}/approve`, operator, {
        case_version: 1,
        note: 'looks fine',
      });
      expect(response.statusCode).toBe(403);
    });

    it('refuses staging from an OPERATOR', async () => {
      const response = await call('POST', `/v1/cases/${randomUUID()}/stage`, operator, {
        case_version: 1,
      });
      expect(response.statusCode).toBe(403);
    });

    it('requires a reason to reject, so a rejection is always auditable', async () => {
      const response = await call(
        'POST',
        `/v1/cases/${randomUUID()}/reject`,
        {
          'x-demo-user-id': 'demo-approver',
        },
        { case_version: 1, reason: '   ' },
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe('input handling', () => {
    it('rejects an import without an idempotency key', async () => {
      const response = await call('POST', '/v1/imports', operator, {
        source_type: 'x',
        records: [],
      });
      expect(response.statusCode).toBe(400);
    });

    it('caps the page size rather than honouring an unbounded limit', async () => {
      const response = await call('GET', '/v1/cases?limit=100000', operator);
      expect(response.statusCode).toBe(200);
      expect(response.json().items.length).toBeLessThanOrEqual(100);
    });

    it('does not leak internals on a malformed identifier', async () => {
      const response = await call('GET', "/v1/cases/'; DROP TABLE payments;--", operator);
      const body = JSON.stringify(response.json());
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(body).not.toMatch(/select|from |pg_|postgres|stack/i);
    });

    it('returns the stable envelope for an unknown route', async () => {
      const response = await call('GET', '/v1/does-not-exist', operator);
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });
  });
});
