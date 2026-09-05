import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cryptoIdGenerator, systemClock, type CaseId } from '@settlementops/shared';
import { runReconciliation, submitImport, scopeOf } from '@settlementops/application';
import type { DatabaseHandle } from '@settlementops/persistence';
import {
  cleanBatch,
  contextFor,
  createTestMerchant,
  databaseAvailable,
  openDatabase,
  repositories,
} from './helpers.js';

const available = await databaseAvailable();
const suite = available ? describe : describe.skip;

if (!available) {
  console.error(
    '\\n  SKIPPED: integration tests need PostgreSQL.\\n' +
      '  Run: pnpm db:up && pnpm db:migrate\\n',
  );
}

suite('ingest -> reconcile -> case pipeline', () => {
  let db: DatabaseHandle;
  const ids = cryptoIdGenerator();
  const clock = systemClock();

  beforeAll(() => {
    db = openDatabase();
  });
  afterAll(async () => {
    await db.close();
  });

  const ingest = async (
    ctx: ReturnType<typeof contextFor>,
    body: unknown,
    idempotencyKey = randomUUID(),
  ) => {
    const repos = repositories(db);
    return submitImport(
      { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
      ctx,
      { body, idempotencyKey },
    );
  };

  const reconcile = async (ctx: ReturnType<typeof contextFor>, importId: string | null) => {
    const repos = repositories(db);
    return runReconciliation(
      {
        runs: repos.runs,
        records: repos.records,
        cases: repos.cases,
        audit: repos.audit,
        ids,
        clock,
      },
      ctx,
      { importId, maxPayments: 100 },
    );
  };

  it('ingests a clean batch and reconciles it without creating a case', async () => {
    const merchant = await createTestMerchant(db);
    const ctx = contextFor(merchant);
    const suffix = randomUUID().slice(0, 8);

    const imported = await ingest(ctx, cleanBatch(suffix));
    expect(imported.kind).toBe('ACCEPTED');
    if (imported.kind !== 'ACCEPTED') return;
    expect(imported.summary.acceptedCount).toBe(6);
    expect(imported.summary.rejectedCount).toBe(0);

    const run = await reconcile(ctx, imported.summary.id);
    expect(run.evaluatedCount).toBe(1);
    expect(run.reconciledCount).toBe(1);
    expect(run.residualCount).toBe(0);

    const cases = await repositories(db).cases.list(scopeOf(ctx), { limit: 10, offset: 0 });
    expect(cases).toHaveLength(0);
  });

  it('creates a durable residual case when the settlement does not reconcile', async () => {
    const merchant = await createTestMerchant(db);
    const ctx = contextFor(merchant);
    const suffix = randomUUID().slice(0, 8);

    // Net short by 295.00 - the fee/tax discrepancy from the specification scenario.
    const imported = await ingest(ctx, cleanBatch(suffix, 941_000));
    if (imported.kind !== 'ACCEPTED') throw new Error('import failed');

    const run = await reconcile(ctx, imported.summary.id);
    expect(run.residualCount).toBe(1);
    expect(run.reconciledCount).toBe(0);

    const cases = await repositories(db).cases.list(scopeOf(ctx), { limit: 10, offset: 0 });
    expect(cases).toHaveLength(1);
    const found = cases[0];
    expect(found?.state).toBe('EXCEPTION');
    expect(found?.reasons).toContain('NET_AMOUNT_MISMATCH');
    // The discrepancy survives as an exact integer string - no float, no precision loss.
    expect(found?.discrepancyMinor).toBe('29500');
  });

  it('survives a process restart: the case is still there on a fresh connection', async () => {
    const merchant = await createTestMerchant(db);
    const ctx = contextFor(merchant);
    const imported = await ingest(ctx, cleanBatch(randomUUID().slice(0, 8), 941_000));
    if (imported.kind !== 'ACCEPTED') throw new Error('import failed');
    await reconcile(ctx, imported.summary.id);

    const fresh = openDatabase();
    try {
      const cases = await repositories(fresh).cases.list(scopeOf(ctx), { limit: 10, offset: 0 });
      expect(cases).toHaveLength(1);
    } finally {
      await fresh.close();
    }
  });
});

suite('idempotency', () => {
  let db: DatabaseHandle;
  const ids = cryptoIdGenerator();
  const clock = systemClock();

  beforeAll(() => {
    db = openDatabase();
  });
  afterAll(async () => {
    await db.close();
  });

  it('replaying an import key returns the original and writes nothing new', async () => {
    const merchant = await createTestMerchant(db);
    const ctx = contextFor(merchant);
    const repos = repositories(db);
    const key = randomUUID();
    const body = cleanBatch(randomUUID().slice(0, 8));

    const first = await submitImport(
      { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
      ctx,
      { body, idempotencyKey: key },
    );
    const second = await submitImport(
      { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
      ctx,
      { body, idempotencyKey: key },
    );

    if (first.kind !== 'ACCEPTED' || second.kind !== 'ACCEPTED') throw new Error('import failed');
    expect(second.replayed).toBe(true);
    expect(second.summary.id).toBe(first.summary.id);

    const count = await db.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM imports WHERE merchant_id = $1`,
      [merchant],
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  it('re-running reconciliation does not double-create a case', async () => {
    const merchant = await createTestMerchant(db);
    const ctx = contextFor(merchant);
    const repos = repositories(db);
    const imported = await submitImport(
      { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
      ctx,
      { body: cleanBatch(randomUUID().slice(0, 8), 941_000), idempotencyKey: randomUUID() },
    );
    if (imported.kind !== 'ACCEPTED') throw new Error('import failed');

    const deps = {
      runs: repos.runs,
      records: repos.records,
      cases: repos.cases,
      audit: repos.audit,
      ids,
      clock,
    };
    await runReconciliation(deps, ctx, { importId: imported.summary.id, maxPayments: 100 });
    await runReconciliation(deps, ctx, { importId: imported.summary.id, maxPayments: 100 });

    // Two runs, each with its own case row - but never two cases for the same
    // (run, payment) pair, which is what the unique index guarantees.
    const perRun = await db.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM (SELECT reconciliation_run_id, payment_id, count(*) AS n
                 FROM reconciliation_cases
                WHERE merchant_id = $1
                GROUP BY reconciliation_run_id, payment_id
               HAVING count(*) > 1) dupes`,
      [merchant],
    );
    expect(perRun.rows[0]?.count).toBe('0');
  });

  it('rejects a duplicate source record at the database', async () => {
    const merchant = await createTestMerchant(db);
    const ctx = contextFor(merchant);
    const repos = repositories(db);
    const body = cleanBatch(randomUUID().slice(0, 8));

    const first = await submitImport(
      { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
      ctx,
      { body, idempotencyKey: randomUUID() },
    );
    // Same records, different idempotency key: the import is new, but every record
    // collides on source-uniqueness and is counted as a duplicate rather than inserted.
    const second = await submitImport(
      { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
      ctx,
      { body, idempotencyKey: randomUUID() },
    );

    if (first.kind !== 'ACCEPTED' || second.kind !== 'ACCEPTED') throw new Error('import failed');
    expect(second.replayed).toBe(false);
    expect(second.summary.acceptedCount).toBe(0);
    expect(second.summary.duplicateCount).toBe(6);
  });
});

suite('security invariants', () => {
  let db: DatabaseHandle;
  const ids = cryptoIdGenerator();
  const clock = systemClock();

  beforeAll(() => {
    db = openDatabase();
  });
  afterAll(async () => {
    await db.close();
  });

  it('merchant B cannot read merchant A cases', async () => {
    const a = await createTestMerchant(db);
    const b = await createTestMerchant(db);
    const ctxA = contextFor(a);
    const ctxB = contextFor(b);
    const repos = repositories(db);

    const imported = await submitImport(
      { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
      ctxA,
      { body: cleanBatch(randomUUID().slice(0, 8), 941_000), idempotencyKey: randomUUID() },
    );
    if (imported.kind !== 'ACCEPTED') throw new Error('import failed');
    await runReconciliation(
      {
        runs: repos.runs,
        records: repos.records,
        cases: repos.cases,
        audit: repos.audit,
        ids,
        clock,
      },
      ctxA,
      { importId: imported.summary.id, maxPayments: 100 },
    );

    const aCases = await repos.cases.list(scopeOf(ctxA), { limit: 10, offset: 0 });
    expect(aCases).toHaveLength(1);

    const bCases = await repos.cases.list(scopeOf(ctxB), { limit: 10, offset: 0 });
    expect(bCases).toHaveLength(0);

    // Even holding A's exact case id, B resolves nothing.
    const stolenId = aCases[0]?.id as CaseId;
    expect(await repos.cases.findById(scopeOf(ctxB), stolenId)).toBeNull();
    expect(await repos.cases.findById(scopeOf(ctxA), stolenId)).not.toBeNull();
  });

  it('merchant B cannot read merchant A imports by id', async () => {
    const a = await createTestMerchant(db);
    const b = await createTestMerchant(db);
    const repos = repositories(db);
    const imported = await submitImport(
      { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
      contextFor(a),
      { body: cleanBatch(randomUUID().slice(0, 8)), idempotencyKey: randomUUID() },
    );
    if (imported.kind !== 'ACCEPTED') throw new Error('import failed');
    expect(await repos.imports.findById(scopeOf(contextFor(b)), imported.summary.id)).toBeNull();
  });

  it('audit_events is append-only for the application role', async () => {
    // Decision D5. This is the assertion that proves audit immutability is a database
    // property, not an application promise.
    const merchant = await createTestMerchant(db);
    await db.pool.query(
      `INSERT INTO audit_events (id, merchant_id, entity_type, entity_id, event_type,
                                 actor_type, correlation_id)
       VALUES ($1, $2, 'test', 'e1', 'reconciliation_completed', 'SYSTEM', $3)`,
      [randomUUID(), merchant, randomUUID()],
    );

    await expect(
      db.pool.query(`UPDATE audit_events SET event_type = 'tampered' WHERE merchant_id = $1`, [
        merchant,
      ]),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      db.pool.query(`DELETE FROM audit_events WHERE merchant_id = $1`, [merchant]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('writes an audit event for every residual case created', async () => {
    const merchant = await createTestMerchant(db);
    const ctx = contextFor(merchant);
    const repos = repositories(db);
    const imported = await submitImport(
      { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
      ctx,
      { body: cleanBatch(randomUUID().slice(0, 8), 941_000), idempotencyKey: randomUUID() },
    );
    if (imported.kind !== 'ACCEPTED') throw new Error('import failed');
    await runReconciliation(
      {
        runs: repos.runs,
        records: repos.records,
        cases: repos.cases,
        audit: repos.audit,
        ids,
        clock,
      },
      ctx,
      { importId: imported.summary.id, maxPayments: 100 },
    );

    const events = await db.pool.query<{ event_type: string; next_state: string }>(
      `SELECT event_type, next_state FROM audit_events
        WHERE merchant_id = $1 AND event_type = 'reconciliation_exception_created'`,
      [merchant],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]?.next_state).toBe('EXCEPTION');
  });
});

suite('input validation', () => {
  let db: DatabaseHandle;
  const ids = cryptoIdGenerator();
  const clock = systemClock();

  beforeAll(() => {
    db = openDatabase();
  });
  afterAll(async () => {
    await db.close();
  });

  const submit = async (body: unknown) => {
    const merchant = await createTestMerchant(db);
    const repos = repositories(db);
    return submitImport(
      { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
      contextFor(merchant),
      { body, idempotencyKey: randomUUID() },
    );
  };

  it('rejects a malformed batch before writing anything', async () => {
    const result = await submit({ source_type: 'x', records: [{ kind: 'NOPE' }] });
    expect(result.kind).toBe('VALIDATION_ERROR');
  });

  it('rejects a fractional money amount', async () => {
    const body = cleanBatch('frac');
    (body.records[0] as { amount: { amount_minor: number } }).amount.amount_minor = 10.5;
    const result = await submit(body);
    expect(result.kind).toBe('VALIDATION_ERROR');
  });

  it('rejects an empty batch', async () => {
    expect((await submit({ source_type: 'x', records: [] })).kind).toBe('VALIDATION_ERROR');
  });

  it('rejects an unsupported currency during normalization, not at insert', async () => {
    const body = cleanBatch(randomUUID().slice(0, 8));
    (body.records[0] as { amount: { currency: string } }).amount.currency = 'USD';
    const result = await submit(body);
    if (result.kind !== 'ACCEPTED') throw new Error('expected acceptance with a rejected row');
    expect(result.summary.rejectedCount).toBe(1);
    expect(result.summary.acceptedCount).toBe(5);
  });
});
