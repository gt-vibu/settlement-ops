/**
 * Audit read scoping.
 *
 * One reconciliation run opens many cases under a single correlation id. The case audit
 * trail must show this case's own events plus the import/run that produced it - and must
 * NOT show a sibling case's events, which arrive as an identical
 * `reconciliation_exception_created` row and are indistinguishable once rendered.
 * Attributing another case's event to this case is misattribution on a financial audit
 * trail, not extra context.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cryptoIdGenerator, systemClock, asId, type CaseId } from '@settlementops/shared';
import { runReconciliation, submitImport, scopeOf } from '@settlementops/application';
import { createAuditReader, type DatabaseHandle } from '@settlementops/persistence';
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

suite('case audit scoping', () => {
  let db: DatabaseHandle;
  const ids = cryptoIdGenerator();
  const clock = systemClock();

  beforeAll(() => {
    db = openDatabase();
  });
  afterAll(async () => {
    await db.close();
  });

  it('excludes sibling cases opened by the same run, and keeps the producing chain', async () => {
    const merchant = await createTestMerchant(db);
    // One context, so every event below shares a single correlation id - the exact
    // condition that leaked sibling cases into the trail.
    const ctx = contextFor(merchant);
    const repos = repositories(db);

    for (let i = 0; i < 2; i += 1) {
      const imported = await submitImport(
        { imports: repos.imports, records: repos.records, audit: repos.audit, ids, clock },
        ctx,
        // Net short by 295.00: each batch leaves one residual.
        { body: cleanBatch(randomUUID().slice(0, 8), 941_000), idempotencyKey: randomUUID() },
      );
      if (imported.kind !== 'ACCEPTED') throw new Error('import failed');
    }

    const run = await runReconciliation(
      {
        runs: repos.runs,
        records: repos.records,
        cases: repos.cases,
        audit: repos.audit,
        ids,
        clock,
      },
      ctx,
      { importId: null, maxPayments: 100 },
    );
    expect(run.residualCount).toBe(2);

    const cases = await repos.cases.list(scopeOf(ctx), { limit: 10, offset: 0 });
    expect(cases).toHaveLength(2);
    const [first, second] = cases;
    if (first === undefined || second === undefined) throw new Error('expected two cases');

    const reader = createAuditReader(db);
    const trail = await reader.listForCase(scopeOf(ctx), asId<CaseId>(first.id), 100);

    const ownCreation = trail.filter(
      (e) => e.entityId === first.id && e.eventType === 'reconciliation_exception_created',
    );
    expect(ownCreation).toHaveLength(1);

    // The sibling opened in the same run, under the same correlation id.
    expect(trail.some((e) => e.entityId === second.id)).toBe(false);

    // The chain that produced the case is still visible.
    expect(trail.some((e) => e.entityType === 'import')).toBe(true);
  });
});
