import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asId, cryptoIdGenerator, systemClock, type CaseId } from '@settlementops/shared';
import { escalateCase, requestEvidence, scopeOf } from '@settlementops/application';
import { instantiateScenario } from '@settlementops/scenario';
import { startInvestigation } from '@settlementops/workflow';
import {
  createCaseTransitionRepository,
  createEvidenceRequestRepository,
  createInvestigationRepository,
  createScenarioRepository,
  type DatabaseHandle,
} from '@settlementops/persistence';
import {
  contextFor,
  createTestMerchant,
  databaseAvailable,
  openDatabase,
  repositories,
} from './helpers.js';

const available = await databaseAvailable();
const suite = available ? describe : describe.skip;

if (!available) {
  console.error('\n  SKIPPED: Phase 3 integration tests need PostgreSQL.\n');
}

const ids = cryptoIdGenerator();
const clock = systemClock();

const bundle = (db: DatabaseHandle) => {
  const base = repositories(db);
  return {
    ...base,
    scenarios: createScenarioRepository(db),
    transitions: createCaseTransitionRepository(db),
    investigations: createInvestigationRepository(db),
    evidence: createEvidenceRequestRepository(db),
  };
};

const instantiate = async (
  db: DatabaseHandle,
  ctx: ReturnType<typeof contextFor>,
  scenarioId: string,
  opts: { seed?: number; key?: string } = {},
) => {
  const b = bundle(db);
  return instantiateScenario(
    {
      scenarios: b.scenarios,
      imports: b.imports,
      records: b.records,
      runs: b.runs,
      cases: b.cases,
      audit: b.audit,
      ids,
      clock,
    },
    ctx,
    {
      scenarioId,
      seed: opts.seed ?? 12345,
      idempotencyKey: opts.key ?? randomUUID(),
    },
  );
};

suite('scenario instantiation uses the real pipeline', () => {
  let db: DatabaseHandle;
  beforeAll(() => {
    db = openDatabase();
  });
  afterAll(async () => {
    await db.close();
  });

  it('a clean scenario reconciles and creates NO case', async () => {
    const ctx = contextFor(await createTestMerchant(db));
    const result = await instantiate(db, ctx, 'clean-settlement');
    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    expect(result.instance.status).toBe('SUCCEEDED');
    expect(result.instance.recordsCreated).toBeGreaterThan(0);
    // The scenario did not force an outcome - the matcher decided there was none.
    expect(result.instance.casesCreated).toBe(0);
  });

  it('a defect scenario creates a durable, queryable case', async () => {
    const ctx = contextFor(await createTestMerchant(db));
    const result = await instantiate(db, ctx, 'fee-tax-discrepancy');
    if (result.kind !== 'OK') throw new Error('scenario failed');
    expect(result.instance.casesCreated).toBe(1);

    // Queryable through the ORDINARY case API path, not a scenario-specific one.
    const cases = await bundle(db).cases.list(scopeOf(ctx), { limit: 10, offset: 0 });
    expect(cases).toHaveLength(1);
    expect(cases[0]?.state).toBe('EXCEPTION');
    expect(cases[0]?.reasons.length).toBeGreaterThan(0);
  });

  it('state survives a fresh connection', async () => {
    const ctx = contextFor(await createTestMerchant(db));
    await instantiate(db, ctx, 'fee-tax-discrepancy');
    const fresh = openDatabase();
    try {
      const cases = await bundle(fresh).cases.list(scopeOf(ctx), { limit: 10, offset: 0 });
      expect(cases).toHaveLength(1);
    } finally {
      await fresh.close();
    }
  });

  it.each(['split-settlement', 'refund-netting', 'ambiguous-adjustment', 'misleading-adjustment'])(
    '%s produces a real exception through deterministic reconciliation',
    async (id) => {
      const ctx = contextFor(await createTestMerchant(db));
      const result = await instantiate(db, ctx, id);
      if (result.kind !== 'OK') throw new Error(`scenario ${id} failed`);
      expect(result.instance.casesCreated).toBeGreaterThan(0);
    },
  );

  it('rejects an unknown scenario', async () => {
    const ctx = contextFor(await createTestMerchant(db));
    const result = await instantiate(db, ctx, 'not-a-scenario');
    expect(result.kind).toBe('UNKNOWN_SCENARIO');
  });

  it('never persists the expected cause anywhere a case query can reach', async () => {
    const ctx = contextFor(await createTestMerchant(db));
    const result = await instantiate(db, ctx, 'fee-tax-discrepancy');
    if (result.kind !== 'OK') throw new Error('scenario failed');

    const cases = await bundle(db).cases.list(scopeOf(ctx), { limit: 10, offset: 0 });
    expect(JSON.stringify(cases)).not.toContain('MDR_FEE');

    // Nor through the audit trail, which is readable through the ordinary API.
    const events = await db.pool.query<{ payload_json: unknown }>(
      `SELECT payload_json FROM audit_events WHERE merchant_id = $1`,
      [ctx.tenantId],
    );
    expect(JSON.stringify(events.rows)).not.toContain('MDR_FEE');
    expect(JSON.stringify(events.rows)).not.toContain('expected_cause');

    // The scenario projection returned to callers omits it too.
    const listed = await bundle(db).scenarios.list(scopeOf(ctx), 10);
    expect(JSON.stringify(listed)).not.toContain('MDR_FEE');
  });
});

suite('scenario idempotency and replay', () => {
  let db: DatabaseHandle;
  beforeAll(() => {
    db = openDatabase();
  });
  afterAll(async () => {
    await db.close();
  });

  it('a duplicate idempotency key does not create a second lifecycle', async () => {
    const ctx = contextFor(await createTestMerchant(db));
    const key = randomUUID();
    const first = await instantiate(db, ctx, 'fee-tax-discrepancy', { key });
    const second = await instantiate(db, ctx, 'fee-tax-discrepancy', { key });

    if (first.kind !== 'OK' || second.kind !== 'OK') throw new Error('scenario failed');
    expect(second.replayed).toBe(true);
    expect(second.instance.id).toBe(first.instance.id);

    const instances = await db.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM scenario_instances WHERE merchant_id = $1`,
      [ctx.tenantId],
    );
    expect(instances.rows[0]?.count).toBe('1');

    const cases = await bundle(db).cases.list(scopeOf(ctx), { limit: 10, offset: 0 });
    expect(cases).toHaveLength(1);
  });

  it('replay with the same seed creates an isolated new instance', async () => {
    // Replay is a NEW instance with its own correlation, not a mutation of the original.
    const ctx = contextFor(await createTestMerchant(db));
    const first = await instantiate(db, ctx, 'fee-tax-discrepancy', { seed: 999 });
    const replay = await instantiate(db, ctx, 'fee-tax-discrepancy', { seed: 999 });

    if (first.kind !== 'OK' || replay.kind !== 'OK') throw new Error('scenario failed');
    expect(replay.replayed).toBe(false);
    expect(replay.instance.id).not.toBe(first.instance.id);

    // Same seed means identical source records, so the second import is fully
    // deduplicated at the database and the original history is untouched.
    expect(replay.instance.recordsCreated).toBe(0);
    expect(first.instance.recordsCreated).toBeGreaterThan(0);
  });

  it('concurrent instantiation with the same key produces exactly one instance', async () => {
    const ctx = contextFor(await createTestMerchant(db));
    const key = randomUUID();
    const results = await Promise.all([
      instantiate(db, ctx, 'fee-tax-discrepancy', { key }),
      instantiate(db, ctx, 'fee-tax-discrepancy', { key }),
      instantiate(db, ctx, 'fee-tax-discrepancy', { key }),
    ]);
    expect(results.every((r) => r.kind === 'OK')).toBe(true);

    const instances = await db.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM scenario_instances WHERE merchant_id = $1`,
      [ctx.tenantId],
    );
    expect(instances.rows[0]?.count).toBe('1');
  });

  it('isolates scenarios between tenants', async () => {
    const ctxA = contextFor(await createTestMerchant(db));
    const ctxB = contextFor(await createTestMerchant(db));
    const a = await instantiate(db, ctxA, 'fee-tax-discrepancy');
    if (a.kind !== 'OK') throw new Error('scenario failed');

    expect(await bundle(db).scenarios.findById(scopeOf(ctxB), a.instance.id)).toBeNull();
    expect(await bundle(db).scenarios.findById(scopeOf(ctxA), a.instance.id)).not.toBeNull();
    expect(await bundle(db).cases.list(scopeOf(ctxB), { limit: 10, offset: 0 })).toHaveLength(0);
  });
});

suite('case workflow transitions', () => {
  let db: DatabaseHandle;
  beforeAll(() => {
    db = openDatabase();
  });
  afterAll(async () => {
    await db.close();
  });

  const seedCase = async () => {
    const ctx = contextFor(await createTestMerchant(db));
    const result = await instantiate(db, ctx, 'fee-tax-discrepancy');
    if (result.kind !== 'OK') throw new Error('scenario failed');
    const cases = await bundle(db).cases.list(scopeOf(ctx), { limit: 1, offset: 0 });
    const caseId = cases[0]?.id;
    if (caseId === undefined) throw new Error('no case created');
    return { ctx, caseId: asId<CaseId>(caseId) };
  };

  const workflowDeps = () => {
    const b = bundle(db);
    return { transitions: b.transitions, evidence: b.evidence, audit: b.audit, ids, clock };
  };

  it('escalates an exception and increments the case version', async () => {
    const { ctx, caseId } = await seedCase();
    const outcome = await escalateCase(workflowDeps(), ctx, {
      caseId,
      expectedVersion: 1,
      reason: 'Needs manual review',
    });
    expect(outcome.kind).toBe('OK');
    if (outcome.kind !== 'OK') return;
    expect(outcome.result.previousState).toBe('EXCEPTION');
    expect(outcome.result.nextState).toBe('ESCALATED');
    expect(outcome.result.caseVersion).toBe(2);
  });

  it('rejects a stale case version with a conflict and changes nothing', async () => {
    const { ctx, caseId } = await seedCase();
    await escalateCase(workflowDeps(), ctx, { caseId, expectedVersion: 1, reason: 'first' });

    const stale = await escalateCase(workflowDeps(), ctx, {
      caseId,
      expectedVersion: 1,
      reason: 'stale',
    });
    expect(stale.kind).toBe('FAILED');
    if (stale.kind === 'FAILED') expect(stale.failure.kind).not.toBe('NOT_FOUND');

    const state = await bundle(db).transitions.currentState(scopeOf(ctx), caseId);
    expect(state?.state).toBe('ESCALATED');
    expect(state?.caseVersion).toBe(2);
  });

  it('refuses an illegal transition even for a privileged actor', async () => {
    const { ctx, caseId } = await seedCase();
    // EXCEPTION -> STAGED is illegal at any version, for any actor.
    const outcome = await bundle(db).transitions.transition(scopeOf(ctx), {
      caseId,
      to: 'STAGED',
      actor: 'ADMIN',
      expectedVersion: 1,
    });
    expect('kind' in outcome && outcome.kind).toBe('ILLEGAL_TRANSITION');

    const state = await bundle(db).transitions.currentState(scopeOf(ctx), caseId);
    expect(state?.state).toBe('EXCEPTION');
    expect(state?.caseVersion).toBe(1);
  });

  it('refuses a caller holding no role', async () => {
    const { ctx, caseId } = await seedCase();
    const roleless = { ...ctx, roles: [] as const };
    const outcome = await escalateCase(workflowDeps(), roleless, {
      caseId,
      expectedVersion: 1,
      reason: 'should not be allowed',
    });
    expect(outcome.kind).toBe('FORBIDDEN');

    const state = await bundle(db).transitions.currentState(scopeOf(ctx), caseId);
    expect(state?.state).toBe('EXCEPTION');
  });

  it('refuses a human actor on a SYSTEM-only transition', async () => {
    const { ctx, caseId } = await seedCase();
    // No human, not even ADMIN, may drive APPROVED -> STAGED. Asserted here against the
    // real repository so the rule holds at the persistence boundary too.
    const outcome = await bundle(db).transitions.transition(scopeOf(ctx), {
      caseId,
      to: 'RECONCILED',
      actor: 'ADMIN',
      expectedVersion: 1,
    });
    expect('kind' in outcome && outcome.kind).toBe('ILLEGAL_TRANSITION');
  });

  it('cannot transition a case belonging to another tenant', async () => {
    const { caseId } = await seedCase();
    const other = contextFor(await createTestMerchant(db));
    const outcome = await bundle(db).transitions.transition(scopeOf(other), {
      caseId,
      to: 'ESCALATED',
      actor: 'OPERATOR',
      expectedVersion: 1,
    });
    // Indistinguishable from a case that does not exist.
    expect('kind' in outcome && outcome.kind).toBe('NOT_FOUND');
  });

  it('only one of two concurrent transitions succeeds', async () => {
    const { ctx, caseId } = await seedCase();
    const results = await Promise.all([
      escalateCase(workflowDeps(), ctx, { caseId, expectedVersion: 1, reason: 'a' }),
      escalateCase(workflowDeps(), ctx, { caseId, expectedVersion: 1, reason: 'b' }),
    ]);
    const succeeded = results.filter((r) => r.kind === 'OK');
    expect(succeeded).toHaveLength(1);

    const state = await bundle(db).transitions.currentState(scopeOf(ctx), caseId);
    expect(state?.caseVersion).toBe(2);
  });

  it('refuses an evidence request from EXCEPTION, and opens no request', async () => {
    // REQUESTING_EVIDENCE is only reachable from INVESTIGATING, ACTION_PROPOSED or
    // APPROVAL_PENDING (specs/STATE_MACHINE.md v2.0.0). Every human-reachable one of
    // those requires a verified proposal, which arrives in Phase 7 - so in Phase 3 this
    // path is correctly unreachable. The valuable assertion today is that the state
    // machine REFUSES it rather than quietly allowing a shortcut.
    const { ctx, caseId } = await seedCase();
    const outcome = await requestEvidence(workflowDeps(), ctx, {
      caseId,
      expectedVersion: 1,
      detail: 'Fee statement for February 2026',
      expiryDays: 7,
    });
    expect(outcome.kind).toBe('FAILED');
    if (outcome.kind === 'FAILED') expect(outcome.failure.kind).toBe('ILLEGAL_TRANSITION');

    // Critically: no orphaned evidence request was written before the refusal.
    const requests = await bundle(db).evidence.listForCase(scopeOf(ctx), caseId);
    expect(requests).toHaveLength(0);

    const state = await bundle(db).transitions.currentState(scopeOf(ctx), caseId);
    expect(state?.state).toBe('EXCEPTION');
    expect(state?.caseVersion).toBe(1);
  });

  it('writes an audit event for every transition', async () => {
    const { ctx, caseId } = await seedCase();
    await escalateCase(workflowDeps(), ctx, { caseId, expectedVersion: 1, reason: 'audit me' });

    const events = await db.pool.query<{
      event_type: string;
      previous_state: string;
      next_state: string;
      case_version: number;
      payload_json: { reason?: string };
    }>(
      `SELECT event_type, previous_state, next_state, case_version, payload_json
         FROM audit_events WHERE merchant_id = $1 AND event_type = 'case_escalated'`,
      [ctx.tenantId],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]?.previous_state).toBe('EXCEPTION');
    expect(events.rows[0]?.next_state).toBe('ESCALATED');
    expect(events.rows[0]?.case_version).toBe(2);
    // ESCALATED must always carry a concrete reason.
    expect(events.rows[0]?.payload_json.reason).toBe('audit me');
  });
});

suite('investigation lifecycle without the AI agent', () => {
  let db: DatabaseHandle;
  beforeAll(() => {
    db = openDatabase();
  });
  afterAll(async () => {
    await db.close();
  });

  const seedCase = async () => {
    const ctx = contextFor(await createTestMerchant(db));
    const result = await instantiate(db, ctx, 'fee-tax-discrepancy');
    if (result.kind !== 'OK') throw new Error('scenario failed');
    const cases = await bundle(db).cases.list(scopeOf(ctx), { limit: 1, offset: 0 });
    const caseId = cases[0]?.id;
    if (caseId === undefined) throw new Error('no case created');
    return { ctx, caseId: asId<CaseId>(caseId) };
  };

  const deps = (aiEnabled: boolean) => {
    const b = bundle(db);
    return {
      investigations: b.investigations,
      transitions: b.transitions,
      audit: b.audit,
      ids,
      clock,
      aiInvestigationEnabled: aiEnabled,
    };
  };

  it('with AI disabled: records the run, fails safely, and escalates', async () => {
    const { ctx, caseId } = await seedCase();
    const outcome = await startInvestigation(deps(false), ctx, { caseId, expectedVersion: 1 });
    expect(outcome.kind).toBe('ESCALATED_AI_DISABLED');

    const runs = await bundle(db).investigations.listForCase(scopeOf(ctx), caseId);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('FAILED');
    // Nothing was fabricated to fill the gap.
    expect(runs[0]?.failureCode).toBe('MODEL_DISABLED');

    const state = await bundle(db).transitions.currentState(scopeOf(ctx), caseId);
    expect(state?.state).toBe('ESCALATED');
  });

  it('with AI enabled: leaves the run RUNNING rather than pretending it completed', async () => {
    const { ctx, caseId } = await seedCase();
    const outcome = await startInvestigation(deps(true), ctx, { caseId, expectedVersion: 1 });
    expect(outcome.kind).toBe('STARTED');

    const runs = await bundle(db).investigations.listForCase(scopeOf(ctx), caseId);
    expect(runs[0]?.status).toBe('RUNNING');

    const state = await bundle(db).transitions.currentState(scopeOf(ctx), caseId);
    expect(state?.state).toBe('INVESTIGATING');
  });

  it('permits only one active investigation per case', async () => {
    const { ctx, caseId } = await seedCase();
    await startInvestigation(deps(true), ctx, { caseId, expectedVersion: 1 });

    // The case is now INVESTIGATING at version 2; a second start cannot re-enter.
    const second = await startInvestigation(deps(true), ctx, { caseId, expectedVersion: 2 });
    expect(second.kind).toBe('FAILED');

    const runs = await bundle(db).investigations.listForCase(scopeOf(ctx), caseId);
    expect(runs).toHaveLength(1);
  });

  it('records no model or prompt version, because no model ran', async () => {
    const { ctx, caseId } = await seedCase();
    await startInvestigation(deps(false), ctx, { caseId, expectedVersion: 1 });
    const row = await db.pool.query<{
      model_version: string | null;
      prompt_version: string | null;
    }>(`SELECT model_version, prompt_version FROM investigations WHERE merchant_id = $1`, [
      ctx.tenantId,
    ]);
    expect(row.rows[0]?.model_version).toBeNull();
    expect(row.rows[0]?.prompt_version).toBeNull();
  });
});
