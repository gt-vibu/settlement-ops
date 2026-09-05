/**
 * Integration-test harness.
 *
 * These tests run against a REAL PostgreSQL instance, never a fake. The invariants under
 * test - unique constraints, revoked grants, `ON CONFLICT` behaviour, transaction
 * rollback - are database behaviours that an in-memory substitute cannot reproduce, so
 * testing them against a stub would prove nothing.
 */

import { randomUUID } from 'node:crypto';
import {
  createAuditWriter,
  createCaseRepository,
  createDatabase,
  createImportRepository,
  createRecordRepository,
  createRunRepository,
  type DatabaseHandle,
} from '@settlementops/persistence';
import {
  asId,
  type CorrelationId,
  type MerchantId,
  type RequestId,
  type UserId,
} from '@settlementops/shared';
import type { RequestContext } from '@settlementops/application';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://settlementops_app:local_dev_only@localhost:5434/settlementops_app';

/** Integration tests skip rather than fail when no database is reachable. */
export const databaseAvailable = async (): Promise<boolean> => {
  const db = createDatabase(TEST_DATABASE_URL, { connectionTimeoutMillis: 2_000 });
  try {
    await db.pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await db.close().catch(() => undefined);
  }
};

/** Integration tests skip live model inference when Ollama or required model is not running. */
export const ollamaAvailable = async (model = 'qwen3:8b'): Promise<boolean> => {
  try {
    const host = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2_000) });
    if (!res.ok) return false;
    const body = (await res.json()) as { models?: Array<{ name: string }> };
    return (body.models ?? []).some(
      (m) => m.name === model || m.name.startsWith(`${model}:`) || m.name.startsWith(model),
    );
  } catch {
    return false;
  }
};

export const openDatabase = (): DatabaseHandle => createDatabase(TEST_DATABASE_URL);

export const repositories = (db: DatabaseHandle) => ({
  imports: createImportRepository(db),
  records: createRecordRepository(db),
  runs: createRunRepository(db),
  cases: createCaseRepository(db),
  audit: createAuditWriter(db),
});

/** Creates an isolated merchant so tests never collide. */
export const createTestMerchant = async (db: DatabaseHandle): Promise<MerchantId> => {
  const id = randomUUID();
  await db.pool.query(`INSERT INTO merchants (id, status) VALUES ($1, 'ACTIVE')`, [id]);
  return asId<MerchantId>(id);
};

export const contextFor = (merchantId: MerchantId): RequestContext => ({
  userId: asId<UserId>(randomUUID()),
  tenantId: merchantId,
  roles: ['OPERATOR', 'APPROVER'],
  requestId: asId<RequestId>(randomUUID()),
  correlationId: asId<CorrelationId>(randomUUID()),
});

const iso = (d: string): string => new Date(d).toISOString();

/**
 * A complete clean lifecycle: 10,000.00 CARD payment, 250.00 fee, 45.00 tax,
 * settling T+2 to 9,705.00 with a matching bank credit.
 */
export const cleanBatch = (suffix: string, netMinor = 970_500) => ({
  source_type: 'gateway_export',
  records: [
    {
      kind: 'PAYMENT',
      payment_id: `pay_${suffix}`,
      order_id: null,
      amount: { amount_minor: 1_000_000, currency: 'INR' },
      payment_method: 'CARD',
      status: 'CAPTURED',
      authorized_at: iso('2026-02-02T09:00:00Z'),
      captured_at: iso('2026-02-02T10:00:00Z'),
      lineage: {
        source_system: 'gw',
        source_record_id: `pay_${suffix}`,
        observed_at: iso('2026-02-02T10:00:00Z'),
        schema_version: 'v1',
      },
    },
    {
      kind: 'SETTLEMENT',
      settlement_id: `set_${suffix}`,
      settlement_batch_reference: null,
      gross_amount: { amount_minor: 1_000_000, currency: 'INR' },
      net_amount: { amount_minor: netMinor, currency: 'INR' },
      settlement_at: iso('2026-02-04T00:00:00Z'),
      status: 'PROCESSED',
      utr: `UTR_${suffix}`,
      lineage: {
        source_system: 'gw',
        source_record_id: `set_${suffix}`,
        observed_at: iso('2026-02-04T00:00:00Z'),
        schema_version: 'v1',
      },
    },
    {
      kind: 'FEE_LINE',
      payment_id: `pay_${suffix}`,
      settlement_id: null,
      fee_type: 'MDR',
      amount: { amount_minor: 25_000, currency: 'INR' },
      effective_date: iso('2026-02-02T00:00:00Z'),
      lineage: {
        source_system: 'gw',
        source_record_id: `fee_${suffix}`,
        observed_at: iso('2026-02-02T10:00:00Z'),
        schema_version: 'v1',
      },
    },
    {
      kind: 'TAX_LINE',
      fee_line_source_id: `fee_${suffix}`,
      tax_type: 'GST',
      amount: { amount_minor: 4_500, currency: 'INR' },
      period: '2026-02',
      lineage: {
        source_system: 'gw',
        source_record_id: `tax_${suffix}`,
        observed_at: iso('2026-02-02T10:00:00Z'),
        schema_version: 'v1',
      },
    },
    {
      kind: 'SETTLEMENT_LINE',
      settlement_id: `set_${suffix}`,
      payment_id: `pay_${suffix}`,
      refund_id: null,
      line_type: 'PAYMENT',
      amount: { amount_minor: netMinor, currency: 'INR' },
      lineage: {
        source_system: 'gw',
        source_record_id: `sl_${suffix}`,
        observed_at: iso('2026-02-04T00:00:00Z'),
        schema_version: 'v1',
      },
    },
    {
      kind: 'BANK_CREDIT',
      utr: `UTR_${suffix}`,
      amount: { amount_minor: netMinor, currency: 'INR' },
      credited_at: iso('2026-02-04T06:00:00Z'),
      bank_reference: `REF_${suffix}`,
      lineage: {
        source_system: 'bank',
        source_record_id: `bc_${suffix}`,
        observed_at: iso('2026-02-04T06:00:00Z'),
        schema_version: 'v1',
      },
    },
  ],
});
